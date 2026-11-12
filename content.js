// Runs on LinkedIn pages. Activates only on a games connections leaderboard.
(function () {
  function where() {
    let u;
    try { u = new URL(window.top.location.href); } catch (e) { u = new URL(location.href); }
    const m = u.pathname.match(/^\/games\/([^/?#]+)/);
    if (!m) return null;
    const urn = new URLSearchParams(u.search).get('gameUrn') || '';
    const p = urn.match(/\(([^,]+),(\d+),(\d+)\)/);
    return {
      slug: LGT.canonicalSlug(m[1]),
      isLeaderboard: /\/leaderboard/.test(u.pathname),
      member: p ? p[1] : null, typeId: p ? Number(p[2]) : null, puzzle: p ? Number(p[3]) : null,
      key: u.pathname + u.search,
    };
  }
  if (!where()) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); }); } catch (e) { res(null); }
  });

  async function waitFor(fn, timeout = 20000, step = 400) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  const rowCount = () => document.querySelectorAll(LGTParser.SEL.row).length;
  const signature = () => [...document.querySelectorAll(LGTParser.SEL.row)].slice(0, 4)
    .map((r) => r.textContent.replace(/\s+/g, '')).join('|');

  // Scrolls the list until LinkedIn stops adding rows.
  async function loadAll() {
    const startY = window.scrollY;
    let stable = 0, count = rowCount();
    for (let i = 0; i < 30 && stable < 3; i++) {
      const rows = document.querySelectorAll(LGTParser.SEL.row);
      const lastRow = rows[rows.length - 1];
      if (lastRow) lastRow.scrollIntoView({ block: 'end' });
      window.scrollBy(0, 2000);
      window.dispatchEvent(new Event('scroll'));
      await sleep(900);
      const n = rowCount();
      if (n === count) stable++; else { stable = 0; count = n; }
      if (LGTParser.parse(document)?.sawUnfinished && stable >= 1) break;
    }
    window.scrollTo(0, startY);
  }

  async function capture(tabWanted, opts = {}) {
    const res = LGTParser.parse(document);
    if (!res || res.tab !== tabWanted) return null;
    const complete = res.sawUnfinished || (opts.loadedAll && document.visibilityState === 'visible');
    const w = where();
    if (!w) return null;
    const reply = await send({
      type: 'capture', slug: w.slug, gameName: res.gameName, tab: res.tab,
      member: w.member, typeId: w.typeId, puzzle: w.puzzle,
      rows: res.rows, me: res.me, complete,
    });
    return reply;
  }

  function clickTab(which) {
    const tabs = [...document.querySelectorAll(LGTParser.SEL.tab)];
    const t = tabs.find((x) => x.textContent.trim().toLowerCase().startsWith(which)) || tabs[which === 'yesterday' ? 1 : 0];
    if (t && t.getAttribute('aria-selected') !== 'true') { t.click(); return true; }
    return !!t;
  }

  async function switchTo(which) {
    const before = signature();
    if (!clickTab(which)) return false;
    const ok = await waitFor(() => LGTParser.parse(document)?.tab === which, 6000, 200);
    if (!ok) return false;
    await waitFor(() => signature() !== before, 5000, 200);
    await sleep(600);
    return true;
  }

  function toast(text) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed', left: '20px', bottom: '20px', zIndex: 2147483647,
      background: '#172033', color: '#fff', font: '500 13px/1.3 system-ui, sans-serif',
      padding: '10px 14px', borderRadius: '10px', boxShadow: '0 6px 24px rgba(23,32,51,.25)',
      transition: 'opacity .4s', opacity: '0',
    });
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 3200);
  }

  let observer = null;
  async function handle(w) {
    const ready = await waitFor(() => {
      const r = LGTParser.parse(document);
      return r && r.tab && r.rows.length ? r : null;
    }, 15000);
    if (!ready) return;

    const ctx = (await send({ type: 'hello', slug: w.slug })) || {};
    const startTab = ready.tab;

    if (ctx.auto) {
      if (startTab === 'today') { await loadAll(); await capture('today', { loadedAll: true }); }
      if (ctx.needYesterday && (await switchTo('yesterday'))) {
        await loadAll();
        await capture('yesterday', { loadedAll: true });
      }
      await send({ type: 'autoDone', slug: w.slug });
      return;
    }

    // You're looking at the page yourself.
    await capture(startTab);
    if (ctx.needYesterday && startTab === 'today') {
      const y = window.scrollY;
      if (await switchTo('yesterday')) {
        await loadAll();
        const r = await capture('yesterday', { loadedAll: true });
        await switchTo('today');
        window.scrollTo(0, y);
        if (r && r.saved) toast(`Saved yesterday's final ${r.gameName || ''} standings`);
      }
    }

    // Keep recording as you scroll or switch tabs.
    if (!observer) {
      let t;
      observer = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => { const r = LGTParser.parse(document); if (r && r.tab) capture(r.tab); }, 1500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // LinkedIn is a single-page app, so watch for arriving on a leaderboard.
  let handled = null;
  setInterval(() => {
    const w = where();
    if (!w || !w.isLeaderboard || handled === w.key) return;
    if (!document.querySelector(LGTParser.SEL.tab)) return;
    handled = w.key;
    handle(w);
  }, 1200);
})();
