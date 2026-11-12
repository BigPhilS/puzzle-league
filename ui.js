// Rendering helpers shared by the popup and the dashboard.
(function (g) {
  const { gameMeta, nameKey } = LGT;
  const FRIEND_COLOURS = ['#D94F6B', '#E08A2E', '#2E9E6B', '#7A5AD6', '#1E9BB8', '#C9558F', '#7C8A1F', '#B4513A', '#4C6FD1', '#8A6D3B'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
  function initials(name) {
    const parts = LGT.cleanName(name).split(' ').filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function friendIndex(friends) {
    const m = new Map();
    friends.forEach((f, i) => m.set(nameKey(f), { name: f, colour: FRIEND_COLOURS[i % FRIEND_COLOURS.length] }));
    return m;
  }

  function iconHtml(meta) {
    const fallback = `<div class="game-icon fallback" style="background:hsl(${meta.hue} 55% 46%)">${esc(meta.name[0])}</div>`;
    if (!meta.icon) return fallback;
    return `<div class="game-icon"><img src="${esc(meta.icon)}" alt="" data-fb-text="${esc(meta.name[0])}" data-fb-class="fb-letter" data-hue="${meta.hue}"></div>`;
  }
  // Any image that fails to load (an icon LinkedIn has moved, an expired profile
  // photo) is swapped for a lettered tile.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.fbText == null) return;
    const sp = document.createElement('span');
    sp.className = img.dataset.fbClass || 'ph';
    sp.textContent = img.dataset.fbText;
    if (img.dataset.hue) sp.style.background = `hsl(${img.dataset.hue} 55% 46%)`;
    img.replaceWith(sp);
  }, true);
  function wireIconFallbacks() {}

  // Summary numbers for one board.
  function summarise(board) {
    const finished = (board.rows || []).filter((r) => r.finished && r.rank != null);
    const me = board.me || (board.rows || []).find((r) => r.self) || null;
    const myRank = me && me.finished ? me.rank : null;
    const beat = myRank != null ? finished.filter((r) => r.rank > myRank).length : null;
    return { finished, me, myRank, beat, field: finished.length, complete: !!board.complete };
  }

  function trackHtml(board, fIdx) {
    const { finished, me, myRank } = summarise(board);
    if (!finished.length) return '';
    const ranks = [...new Set(finished.map((r) => r.rank))].sort((a, b) => a - b);
    const xOf = (rank) => (ranks.length === 1 ? 50 : (ranks.indexOf(rank) / (ranks.length - 1)) * 100);
    let html = '<div class="track"><div class="track-line"></div>';
    for (const r of ranks) html += `<div class="track-tick" style="left:${xOf(r)}%"></div>`;
    const placed = myRank != null ? [{ x: xOf(myRank), lane: 0 }] : [];
    const friendsHere = finished.filter((r) => !r.self && fIdx.has(nameKey(r.name)));
    for (const r of friendsHere) {
      const x = xOf(r.rank);
      let lane = 0;
      while (placed.some((p) => p.lane === lane && Math.abs(p.x - x) < 6) && lane < 2) lane++;
      placed.push({ x, lane });
      const f = fIdx.get(nameKey(r.name));
      html += `<div class="track-dot lane${lane}" style="left:${x}%;background:${f.colour}" title="${esc(r.name)} · ${esc(r.score)}">${esc(initials(r.name))}</div>`;
    }
    if (myRank != null) html += `<div class="track-you" style="left:${xOf(myRank)}%" title="You · ${esc(me.score)}">You</div>`;
    html += `</div><div class="track-ends"><span>Fastest</span><span>${board.complete ? 'Slowest' : 'Slowest saved'}</span></div>`;
    return html;
  }

  function placeHtml(s) {
    if (s.myRank == null) {
      const label = s.me && !s.me.finished ? 'Not finished' : s.complete ? 'Not played' : 'Not in saved list';
      return `<div class="place"><div class="place-num none">–</div><div class="place-label">${label}</div></div>`;
    }
    const cls = s.myRank <= 3 ? `p${s.myRank}` : '';
    const field = s.complete ? `${s.field} finished` : 'in your network';
    return `<div class="place"><div class="place-num ${cls}">${s.myRank}<sup>${ordinal(s.myRank)}</sup></div><div class="place-label">${field}</div></div>`;
  }

  function subline(s) {
    const bits = [];
    if (s.myRank != null && s.complete) bits.push(`Beat ${s.beat} of ${s.field - 1}`);
    if (s.me && s.me.score && s.me.finished) bits.push(s.me.score);
    if (s.me && s.me.streak) bits.push(`${s.me.streak}-day streak`);
    return bits.join(' · ');
  }

  // Table of you + friends (or everyone).
  function tableHtml(board, fIdx, showAll) {
    const rows = (board.rows || []).filter((r) => showAll || r.self || fIdx.has(nameKey(r.name)));
    const me = board.me;
    if (me && !rows.some((r) => r.self)) rows.push({ ...me, self: true });
    rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    const missing = showAll ? [] : [...fIdx.values()].filter((f) => !rows.some((r) => nameKey(r.name) === nameKey(f.name)));
    let html = '<table class="board"><tbody>';
    for (const r of rows) {
      const f = fIdx.get(nameKey(r.name));
      const dot = r.self ? 'var(--you)' : f ? f.colour : 'var(--tick)';
      html += `<tr class="${r.self ? 'me' : ''} ${r.finished ? '' : 'dnf'}">
        <td class="pos">${r.rank ?? '–'}</td>
        <td><div class="who"><span class="chip-dot" style="background:${dot}"></span><span class="n">${r.self ? 'You' : esc(r.name)}</span></div></td>
        <td class="note">${esc(shortNote(r.note))}</td>
        <td class="time">${r.finished ? esc(r.score) : '–'}</td></tr>`;
    }
    for (const f of missing) {
      html += `<tr class="dnf"><td class="pos">–</td><td><div class="who"><span class="chip-dot" style="background:${f.colour}"></span><span class="n">${esc(f.name)}</span></div></td><td class="note">${board.complete ? 'Didn’t play' : 'Not in saved list'}</td><td class="time">–</td></tr>`;
    }
    return html + '</tbody></table>';
  }
  function shortNote(n) {
    if (!n) return '';
    return n.replace(/!$/, '').replace(/^No hints & no (mistakes|redraws)$/i, 'Clean');
  }

  g.LGTUI = { esc, ordinal, initials, friendIndex, iconHtml, wireIconFallbacks, summarise, trackHtml, placeHtml, subline, tableHtml, FRIEND_COLOURS };
})(window);
