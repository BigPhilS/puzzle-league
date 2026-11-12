if (typeof importScripts === 'function') importScripts('shared.js');
const { puzzleDay, addDays, daysBetween, nameKey, store } = LGT;

const autoTabs = new Map(); // tabId -> { slug, done }

// ---- Saving ----------------------------------------------------------------
function mergeBoards(old, inc) {
  if (!old) return inc;
  if (old.final && !inc.final) return old;
  if (inc.final && !old.final) return inc;
  const byKey = new Map();
  for (const r of old.rows || []) byKey.set(r.self ? '__self' : nameKey(r.name), r);
  for (const r of inc.rows || []) byKey.set(r.self ? '__self' : nameKey(r.name), r);
  const rows = [...byKey.values()].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const me = inc.me || old.me || null;
  if (me && old.me && me.streak == null) me.streak = old.me.streak;
  return { ...old, ...inc, rows, me, complete: !!(old.complete || inc.complete) };
}

async function saveCapture(msg) {
  const today = puzzleDay();
  const day = msg.tab === 'yesterday' ? addDays(today, -1) : today;
  const key = store.boardKey(day, msg.slug);
  const cur = (await store.get(key))[key];
  const incoming = {
    day, slug: msg.slug, final: msg.tab === 'yesterday', complete: !!msg.complete,
    capturedAt: Date.now(), rows: msg.rows || [], me: msg.me || null,
  };
  const next = mergeBoards(cur, incoming);
  const out = { [key]: next };

  // Remember how to reach this game's leaderboard (and its name if it's new to us).
  const games = await store.learnedGames();
  const g = games[msg.slug] || {};
  if (msg.gameName) g.name = msg.gameName;
  if (msg.member && msg.typeId && msg.puzzle) {
    Object.assign(g, { member: msg.member, typeId: msg.typeId, refPuzzle: msg.puzzle, refDay: today });
  }
  games[msg.slug] = g;
  out.games = games;
  await store.set(out);
  return { saved: next === incoming || next.final === incoming.final, gameName: msg.gameName };
}

async function needsYesterday(slug) {
  const y = addDays(puzzleDay(), -1);
  const key = store.boardKey(y, slug);
  const b = (await store.get(key))[key];
  return !b || !b.final || !b.complete;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    const tabId = sender.tab && sender.tab.id;
    if (msg.type === 'hello') {
      reply({ auto: autoTabs.has(tabId), needYesterday: await needsYesterday(msg.slug) });
    } else if (msg.type === 'capture') {
      reply(await saveCapture(msg));
    } else if (msg.type === 'autoDone') {
      const t = autoTabs.get(tabId);
      if (t && t.done) t.done();
      reply({ ok: true });
    } else if (msg.type === 'fillGaps') {
      reply(await fillGaps());
    } else reply(null);
  })();
  return true;
});

// ---- Filling gaps ------------------------------------------------------------
// Normally yesterday's final standings are saved when you open a leaderboard after
// playing. This covers the days you don't (for example, Friday's puzzle over Shabbat).
let running = false;

function leaderboardUrl(slug, g, day) {
  const puzzle = g.refPuzzle + daysBetween(g.refDay, day);
  const urn = `urn:li:fsd_game:(${g.member},${g.typeId},${puzzle})`;
  return `https://www.linkedin.com/games/${slug}/results/leaderboard/connections/?gameUrn=${encodeURIComponent(urn)}`;
}

async function fillGaps() {
  if (running) return { started: false };
  const settings = await store.settings();
  if (!settings.backstop) return { started: false };
  running = true;
  try {
    const today = puzzleDay();
    const y = addDays(today, -1);
    const isSaturdayPuzzle = new Date(today + 'T12:00:00Z').getUTCDay() === 6;
    const games = await store.learnedGames();
    const { attempts = {} } = await store.get('attempts');
    const now = Date.now();
    const queue = [];

    for (const [slug, g] of Object.entries(games)) {
      if (!g.member || !g.typeId || !g.refPuzzle) continue;
      if (!(await needsYesterday(slug))) continue;
      const a = attempts[`${y}:${slug}`] || { n: 0, last: 0 };
      if (a.n >= 3 || now - a.last < 90 * 60 * 1000) continue;

      // Only open a leaderboard when that can't start a puzzle timer: you've already
      // played today's puzzle, or it's Saturday's puzzle (which you don't play).
      const tKey = store.boardKey(today, slug);
      const tb = (await store.get(tKey))[tKey];
      const playedToday = tb && tb.me && tb.me.finished;
      if (!playedToday && !isSaturdayPuzzle) continue;

      // Skip games you haven't played in the last week.
      let recent = false;
      for (let i = 1; i <= 7 && !recent; i++) {
        const k = store.boardKey(addDays(today, -i), slug);
        const b = (await store.get(k))[k];
        recent = !!(b && b.me);
      }
      if (!recent && !playedToday) continue;

      attempts[`${y}:${slug}`] = { n: a.n + 1, last: now };
      queue.push({ slug, url: leaderboardUrl(slug, g, today) });
    }
    await store.set({ attempts });
    for (const job of queue) await runAuto(job);
    return { started: true, games: queue.length };
  } finally {
    running = false;
  }
}

function runAuto({ slug, url }) {
  return new Promise(async (resolve) => {
    const tab = await chrome.tabs.create({ url, active: false });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      autoTabs.delete(tab.id);
      chrome.tabs.onUpdated.removeListener(onUpd);
      chrome.tabs.remove(tab.id).catch(() => {});
      resolve();
    };
    // If LinkedIn sends us anywhere other than the leaderboard, close straight away.
    const onUpd = (id, info) => {
      if (id === tab.id && info.url && !/\/games\/[^/]+\/results\/leaderboard/.test(info.url)) finish();
    };
    chrome.tabs.onUpdated.addListener(onUpd);
    autoTabs.set(tab.id, { slug, done: finish });
    setTimeout(finish, 60000);
  });
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 30 }));
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 30 });
  setTimeout(fillGaps, 20000);
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'tick') fillGaps(); });
chrome.action.setBadgeBackgroundColor?.({ color: '#1F5FD6' });
