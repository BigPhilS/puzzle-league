(async function () {
  const { puzzleDay, addDays, formatDay, gameMeta, nameKey, store, GAMES } = LGT;
  const UI = LGTUI;
  const $ = (id) => document.getElementById(id);

  let settings, learned, boards, fIdx;
  async function load() {
    settings = await store.settings();
    learned = await store.learnedGames();
    boards = await store.allBoards();
    fIdx = UI.friendIndex(settings.friends);
  }
  await load();
  const today = puzzleDay();

  // ---- Navigation ---------------------------------------------------------
  function show(view) {
    for (const v of ['day', 'league', 'settings']) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('nav [data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view));
    if (view === 'day') renderDay();
    if (view === 'league') renderLeague();
    if (view === 'settings') renderSettings();
  }
  document.querySelectorAll('nav [data-view]').forEach((b) => (b.onclick = () => { location.hash = b.dataset.view; }));
  window.addEventListener('hashchange', () => show(currentView()));
  const currentView = () => (['day', 'league', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'day');

  // ---- Results by day -------------------------------------------------------
  const allDays = () => [...new Set(boards.map((b) => b.day))].sort();
  const finalDays = () => [...new Set(boards.filter((b) => b.final).map((b) => b.day))].sort();
  let dayCursor = finalDays().slice(-1)[0] || allDays().slice(-1)[0] || addDays(today, -1);

  function formSpark(slug, uptoDay) {
    const pts = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(uptoDay, -i);
      const b = boards.find((x) => x.slug === slug && x.day === d && x.final);
      if (!b) { pts.push(null); continue; }
      const s = UI.summarise(b);
      pts.push(s.myRank != null && s.complete && s.field > 1 ? s.beat / (s.field - 1) : null);
    }
    if (pts.filter((p) => p != null).length < 2) return '';
    const w = 112, h = 24, step = w / 13;
    let path = '', dots = '';
    pts.forEach((p, i) => {
      if (p == null) return;
      const x = (i * step).toFixed(1), y = (h - 3 - p * (h - 6)).toFixed(1);
      path += (path ? 'L' : 'M') + x + ' ' + y;
      dots += `<circle cx="${x}" cy="${y}" r="${i === 13 ? 2.6 : 1.6}" fill="var(--you)"/>`;
    });
    return `<div class="form"><svg width="${w}" height="${h}" viewBox="-3 0 ${w + 6} ${h}" aria-hidden="true">
      <line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line)" stroke-dasharray="2 3"/>
      <path d="${path}" fill="none" stroke="var(--you)" stroke-width="1.5" stroke-linejoin="round" opacity=".55"/>${dots}</svg>
      <span>Share of the field you beat, last 14 days</span></div>`;
  }

  function renderDay() {
    const days = allDays();
    const isToday = dayCursor === today;
    $('dayTitle').textContent = isToday ? 'Today so far' : formatDay(dayCursor, { weekday: 'long', day: 'numeric', month: 'long' });
    const idx = days.indexOf(dayCursor);
    $('prev').disabled = idx <= 0;
    $('next').disabled = idx === -1 || idx >= days.length - 1;

    const list = boards
      .filter((b) => b.day === dayCursor && (b.final || isToday))
      .map((b) => ({ b, meta: gameMeta(b.slug, learned) }))
      .sort((a, z) => a.meta.order - z.meta.order || a.meta.name.localeCompare(z.meta.name));

    const played = list.filter(({ b }) => UI.summarise(b).myRank != null);
    const medals = played.filter(({ b }) => UI.summarise(b).myRank <= 3).length;
    $('dayStatus').textContent = list.length
      ? `${isToday ? 'Live standings' : 'Final standings'} · ${played.length} of ${list.length} played${medals ? ` · ${medals} top-three finish${medals > 1 ? 'es' : ''}` : ''}`
      : '';

    if (!list.length) {
      $('dayGrid').innerHTML = `<div class="panel empty-big"><h2>No results saved for this day</h2><p class="muted">Results are saved when you open a game’s leaderboard on LinkedIn after playing.</p></div>`;
      return;
    }
    $('dayGrid').innerHTML = list.map(({ b, meta }) => {
      const s = UI.summarise(b);
      return `<article class="game" data-slug="${UI.esc(b.slug)}">
        <div class="game-head">${UI.iconHtml(meta)}
          <div><div class="game-name">${UI.esc(meta.name)}</div><div class="game-sub">${UI.esc(UI.subline(s))}</div></div>
          ${UI.placeHtml(s)}
        </div>
        ${UI.trackHtml(b, fIdx)}
        <div class="tbl">${UI.tableHtml(b, fIdx, false)}</div>
        <div class="card-foot">
          <button class="linkish" data-all="0">Show everyone (${(b.rows || []).length})</button>
          <span class="muted">${b.complete ? '' : 'List may be partial'}</span>
        </div>
        ${isToday ? '' : formSpark(b.slug, dayCursor)}
      </article>`;
    }).join('');
    UI.wireIconFallbacks($('dayGrid'));
    $('dayGrid').querySelectorAll('[data-all]').forEach((btn) => {
      btn.onclick = () => {
        const card = btn.closest('.game');
        const b = boards.find((x) => x.slug === card.dataset.slug && x.day === dayCursor && (x.final || isToday));
        const all = btn.dataset.all === '0';
        card.querySelector('.tbl').innerHTML = UI.tableHtml(b, fIdx, all);
        btn.dataset.all = all ? '1' : '0';
        btn.textContent = all ? 'Show only friends' : `Show everyone (${(b.rows || []).length})`;
      };
    });
  }
  $('prev').onclick = () => { const d = allDays(); dayCursor = d[Math.max(0, d.indexOf(dayCursor) - 1)]; renderDay(); };
  $('next').onclick = () => { const d = allDays(); dayCursor = d[Math.min(d.length - 1, d.indexOf(dayCursor) + 1)]; renderDay(); };

  // ---- League -----------------------------------------------------------------
  let period = '30', gameFilter = 'all';
  function renderLeague() {
    document.querySelectorAll('#period button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === period));
    const slugs = [...new Set(boards.map((b) => b.slug))]
      .map((s) => gameMeta(s, learned)).sort((a, z) => a.order - z.order);
    $('gameChips').innerHTML = `<button class="gchip all" data-g="all" aria-pressed="${gameFilter === 'all'}">All games</button>` +
      slugs.map((m) => `<button class="gchip" data-g="${UI.esc(m.slug)}" aria-pressed="${gameFilter === m.slug}">${m.icon ? `<img src="${UI.esc(m.icon)}" alt="" data-fb-text="${UI.esc(m.name[0])}" data-fb-class="mini" data-hue="${m.hue}">` : `<span class="mini" style="background:hsl(${m.hue} 55% 46%)">${UI.esc(m.name[0])}</span>`}${UI.esc(m.name)}</button>`).join('');
    $('gameChips').querySelectorAll('.gchip').forEach((c) => (c.onclick = () => { gameFilter = c.dataset.g; renderLeague(); }));

    if (!settings.friends.length) {
      $('leagueTable').innerHTML = '';
      $('leagueNote').innerHTML = 'Choose your friends first. <button class="linkish" id="goFriends">Choose friends</button>';
      $('goFriends').onclick = () => (location.hash = 'settings');
      return;
    }

    const lastDay = finalDays().slice(-1)[0] || today;
    const from = period === 'all' ? '0000' : addDays(lastDay, -(Number(period) - 1));
    const pool = boards.filter((b) => b.final && b.day >= from && (gameFilter === 'all' || b.slug === gameFilter));

    const players = new Map();
    const P = (key, name, isMe) => {
      if (!players.has(key)) players.set(key, { key, name, isMe, played: 0, wins: 0, placeSum: 0, w: 0, l: 0, t: 0 });
      return players.get(key);
    };
    P('__me', 'You', true);
    for (const f of settings.friends) P(nameKey(f), f, false);

    for (const b of pool) {
      const s = UI.summarise(b);
      const entries = [];
      if (s.myRank != null) entries.push({ key: '__me', rank: s.myRank });
      for (const r of b.rows || []) {
        if (!r.self && r.finished && r.rank != null && fIdx.has(nameKey(r.name))) entries.push({ key: nameKey(r.name), rank: r.rank });
      }
      for (const e of entries) {
        const p = players.get(e.key);
        p.played++;
        const place = 1 + entries.filter((o) => o.rank < e.rank).length;
        p.placeSum += place;
        if (place === 1) p.wins++;
        if (e.key !== '__me' && s.myRank != null) {
          if (e.rank < s.myRank) p.w++; else if (e.rank > s.myRank) p.l++; else p.t++;
        }
      }
    }

    const rows = [...players.values()].map((p) => ({ ...p, avg: p.played ? p.placeSum / p.played : null }))
      .sort((a, z) => (a.avg ?? 99) - (z.avg ?? 99) || z.wins - a.wins || z.played - a.played);
    const maxWins = Math.max(1, ...rows.map((r) => r.wins));
    $('leagueTable').innerHTML = `<thead><tr><th></th><th>Player</th><th>Games</th><th>Wins</th><th>Avg place</th><th>You vs them</th></tr></thead><tbody>` +
      rows.map((r, i) => {
        const f = fIdx.get(r.key);
        const dot = r.isMe ? 'var(--you)' : f ? f.colour : 'var(--tick)';
        const h2h = r.isMe ? '<span class="muted">–</span>'
          : r.w + r.l + r.t === 0 ? '<span class="muted">–</span>'
          : `<span class="h2h-w">${r.l}</span> – <span class="h2h-l">${r.w}</span>${r.t ? ` <span class="muted">(${r.t} tied)</span>` : ''}`;
        return `<tr class="${r.isMe ? 'me' : ''}"><td>${r.played ? i + 1 : '–'}</td>
          <td><div class="who"><span class="chip-dot" style="background:${dot}"></span><span class="n">${UI.esc(r.name)}</span></div></td>
          <td>${r.played}</td>
          <td><span class="bar" style="width:${(r.wins / maxWins) * 40}px"></span>${r.wins}</td>
          <td>${r.avg != null ? r.avg.toFixed(2) : '–'}</td>
          <td>${h2h}</td></tr>`;
      }).join('') + '</tbody>';
    $('leagueNote').textContent = `${pool.length} final leaderboard${pool.length === 1 ? '' : 's'} counted. Place is your position among you and your friends; ties share a place. “You vs them” is how often you finished ahead of them, then behind.`;
  }
  document.querySelectorAll('#period button').forEach((b) => (b.onclick = () => { period = b.dataset.p; renderLeague(); }));

  // ---- Friends & settings -----------------------------------------------------
  function everyone() {
    const m = new Map();
    for (const b of boards) for (const r of b.rows || []) {
      if (r.self) continue;
      const k = nameKey(r.name);
      if (!k) continue;
      const e = m.get(k) || { name: r.name, count: 0, photo: null };
      e.count++;
      if (r.photo) e.photo = r.photo;
      m.set(k, e);
    }
    return [...m.values()].sort((a, z) => z.count - a.count || a.name.localeCompare(z.name));
  }

  async function saveFriends(list) {
    settings.friends = list;
    await store.saveSettings(settings);
    fIdx = UI.friendIndex(settings.friends);
    renderSettings();
  }

  function renderSettings() {
    $('chosen').innerHTML = settings.friends.length
      ? settings.friends.map((f, i) => `<span class="chip"><span class="chip-dot" style="background:${UI.FRIEND_COLOURS[i % 10]}"></span>${UI.esc(f)}<button data-rm="${i}" aria-label="Remove ${UI.esc(f)}">×</button></span>`).join('')
      : '<span class="muted small">No friends chosen yet.</span>';
    $('chosen').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => saveFriends(settings.friends.filter((_, i) => i !== Number(b.dataset.rm)))));

    const q = nameKey($('search').value);
    const people = everyone().filter((p) => !q || nameKey(p.name).includes(q));
    const full = settings.friends.length >= 10;
    $('people').innerHTML = people.length ? people.map((p) => {
      const on = fIdx.has(nameKey(p.name));
      return `<label class="person">${p.photo ? `<img src="${UI.esc(p.photo)}" alt="" loading="lazy" data-fb-text="${UI.esc(UI.initials(p.name))}">` : `<span class="ph">${UI.esc(UI.initials(p.name))}</span>`}
        <span class="meta">${UI.esc(p.name)}<small>On ${p.count} saved leaderboard${p.count === 1 ? '' : 's'}</small></span>
        <input type="checkbox" data-name="${UI.esc(p.name)}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''}></label>`;
    }).join('') : `<p class="muted small" style="padding:10px 4px">${boards.length ? 'No one matches that search.' : 'People appear here once you’ve opened a leaderboard on LinkedIn.'}</p>`;
    $('people').querySelectorAll('input[type="checkbox"]').forEach((c) => (c.onchange = () => {
      const n = c.dataset.name;
      saveFriends(c.checked ? [...settings.friends, n].slice(0, 10) : settings.friends.filter((f) => nameKey(f) !== nameKey(n)));
    }));
    $('backstop').checked = !!settings.backstop;
  }
  $('search').oninput = renderSettings;
  $('backstop').onchange = async () => { settings.backstop = $('backstop').checked; await store.saveSettings(settings); };

  $('export').onclick = async () => {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `puzzle-league-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await chrome.storage.local.set(data);
      await load();
      $('dataStatus').textContent = 'Backup imported.';
      renderSettings();
    } catch (err) {
      $('dataStatus').textContent = 'That file isn’t a Puzzle League backup.';
    }
  };
  $('wipe').onclick = async () => {
    if (!confirm('Delete all saved results, friends and settings? This can’t be undone.')) return;
    await chrome.storage.local.clear();
    await load();
    $('dataStatus').textContent = 'All data deleted.';
    renderSettings();
  };

  chrome.storage.onChanged.addListener(async () => {
    await load();
    const v = currentView();
    if (v === 'day') renderDay(); else if (v === 'league') renderLeague();
  });

  show(currentView());
})();
