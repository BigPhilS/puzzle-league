(async function () {
  const { puzzleDay, addDays, formatDay, gameMeta, nextReset, store } = LGT;
  const UI = LGTUI;
  const $ = (id) => document.getElementById(id);

  const settings = await store.settings();
  const learned = await store.learnedGames();
  const fIdx = UI.friendIndex(settings.friends);
  const today = puzzleDay();
  const boards = await store.allBoards();

  // "Final" shows the most recent finished puzzle day we have.
  const finalDays = [...new Set(boards.filter((b) => b.final).map((b) => b.day))].sort();
  const latestFinal = finalDays[finalDays.length - 1] || addDays(today, -1);
  let mode = 'final';

  const reset = nextReset();
  $('reset').textContent = `Puzzles reset at ${reset.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  function render() {
    const day = mode === 'final' ? latestFinal : today;
    $('seg-final').setAttribute('aria-pressed', mode === 'final');
    $('seg-today').setAttribute('aria-pressed', mode === 'today');
    const list = boards
      .filter((b) => b.day === day && (mode === 'today' || b.final))
      .map((b) => ({ b, meta: gameMeta(b.slug, learned) }))
      .sort((a, z) => a.meta.order - z.meta.order || a.meta.name.localeCompare(z.meta.name));

    const newest = list.reduce((t, x) => Math.max(t, x.b.capturedAt || 0), 0);
    $('daylabel').textContent = mode === 'final'
      ? formatDay(day)
      : newest ? `As of ${new Date(newest).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';

    if (!list.length) {
      $('list').innerHTML = mode === 'final'
        ? `<div class="empty"><h2>No final standings yet</h2><p>Play a game, then open its leaderboard. Puzzle League saves yesterday’s final standings from there, and today’s as they come in.</p></div>`
        : `<div class="empty"><h2>Nothing from today yet</h2><p>Open a game’s leaderboard after you play and today’s standings appear here.</p></div>`;
      return;
    }

    $('list').innerHTML = list.map(({ b, meta }, i) => {
      const s = UI.summarise(b);
      return `<section class="game reveal" style="animation-delay:${i * 30}ms" tabindex="0" aria-expanded="false">
        <div class="game-head">${UI.iconHtml(meta)}
          <div><div class="game-name">${UI.esc(meta.name)}</div><div class="game-sub">${UI.esc(UI.subline(s))}</div></div>
          ${UI.placeHtml(s)}
        </div>
        ${UI.trackHtml(b, fIdx)}
        ${UI.tableHtml(b, fIdx, false)}
        ${!b.complete ? '<div class="note-partial">Saved list may be missing people further down.</div>' : ''}
      </section>`;
    }).join('');
    UI.wireIconFallbacks($('list'));
    $('list').querySelectorAll('.game').forEach((el) => {
      const toggle = () => el.setAttribute('aria-expanded', el.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  $('seg-final').onclick = () => { mode = 'final'; render(); };
  $('seg-today').onclick = () => { mode = 'today'; render(); };
  $('open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  $('friends').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#settings') });
  if (!settings.friends.length) $('friends').textContent = 'Choose your friends';
  else $('friends').textContent = 'Edit friends';
  render();
})();
