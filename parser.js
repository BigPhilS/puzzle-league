// Reads LinkedIn's connections leaderboard out of the page DOM.
// Kept separate from content.js so it can be tested against saved pages.
(function (g) {
  const MEDALS = {
    '4vszrbfoz7p9q78se5b4cwnuh': 1, '6qau7v63b0w767ofbj0xce7ff': 1,
    '625ja5el8n1xkne313guzllyw': 2, 'av5ijejsk7np0yo8udilo7op7': 2, '1ayrlx893hcyn7338vq66upk1': 2,
    'oaxac4w53yx9h92kq40s657f': 3, 'dgyfd6qg8cuz9crrc963pxu8b': 3,
  };
  const SEL = {
    root: '.pr-connections-leaderboard__components',
    title: '.pr-connections-leaderboard__toolbar-title',
    row: '.pr-connections-leaderboard-player__container',
    sticky: '.pr-connections-leaderboard__sticky-section',
    rank: '.pr-connections-leaderboard-player__ranking',
    name: '.pr-connections-leaderboard-player__name-text',
    sub: '.pr-connections-leaderboard-player__subtitle-copy',
    score: '.pr-connections-leaderboard-player__score',
    photo: '.pr-connections-leaderboard-player__image-container img',
    tab: '.pr-connections-leaderboard__tabs [role="tab"]',
  };

  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function activeTab(doc) {
    const tabs = [...doc.querySelectorAll(SEL.tab)];
    if (!tabs.length) return null;
    const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    const label = txt(sel).toLowerCase();
    if (label.startsWith('yesterday')) return 'yesterday';
    if (label.startsWith('today')) return 'today';
    return tabs.indexOf(sel) === 1 ? 'yesterday' : 'today';
  }

  function parseRow(el) {
    const rankEl = el.querySelector(SEL.rank);
    const nameRaw = txt(el.querySelector(SEL.name));
    const photo = el.querySelector(SEL.photo);
    const score = txt(el.querySelector(SEL.score));
    const isSelf = nameRaw === 'You';
    let rank = null, medal = null;
    const num = rankEl && txt(rankEl).match(/^\d+$/);
    if (num) rank = Number(num[0]);
    else if (rankEl) {
      const img = rankEl.querySelector('img');
      if (img) {
        const h = (img.getAttribute('src') || '').split('/').pop();
        medal = MEDALS[h] || 0; // 0 = a medal we don't recognise; resolved below
        const alt = (img.getAttribute('alt') || '').match(/Rank (\d+)/);
        if (alt) { rank = Number(alt[1]); medal = null; }
      }
      const badgeNum = rankEl.querySelector('.pr-connections-leaderboard-player__badge-icon-ranking');
      if (badgeNum && /^\d+$/.test(txt(badgeNum))) { rank = Number(txt(badgeNum)); medal = null; }
    }
    const seconds = LGT.scoreSeconds(score);
    const finished = !!score && !/^-/.test(score);
    return {
      name: isSelf ? (photo && photo.getAttribute('alt')) || 'You' : LGT.cleanName(nameRaw),
      self: isSelf,
      rank, medal, score, seconds, finished,
      note: txt(el.querySelector(SEL.sub)),
      photo: photo ? photo.getAttribute('src') : null,
    };
  }

  function parse(doc = document) {
    const root = doc.querySelector(SEL.root);
    if (!root) return null;
    const title = txt(doc.querySelector(SEL.title));
    const gameName = title.replace(/\s*Leaderboard\s*$/i, '').trim() || null;
    // Query the whole document rather than `root`: LinkedIn nests buttons inside
    // buttons, and some parsers re-parent rows outside the component.
    const all = [...doc.querySelectorAll(SEL.row)];
    const isSticky = (el) => !!(el.closest(SEL.sticky) ||
      el.querySelector('.pr-connections-leaderboard-player__badge-icon-container, .pr-connections-leaderboard-player__subtitle-insight-tag'));
    const stickyEl = all.find(isSticky) || null;
    const seen = new Set();
    const listRows = all.filter((el) => !isSticky(el)).map(parseRow).filter((r) => {
      const k = r.self ? '__self' : LGT.nameKey(r.name) + '|' + r.score;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Medal rows (top three positions, ties share a medal) have no printed number.
    let last = null, cur = 0;
    for (const r of listRows) {
      if (r.rank == null && r.finished) {
        if (r.medal) cur = r.medal;
        else cur = last && last.score === r.score ? cur : cur + 1;
        r.rank = cur;
      } else if (r.rank != null) cur = r.rank;
      last = r;
      delete r.medal;
    }

    let me = null;
    if (stickyEl) {
      me = parseRow(stickyEl);
      delete me.medal;
      const streak = txt(stickyEl).match(/(\d+)-day streak/);
      me.streak = streak ? Number(streak[1]) : null;
    }
    const selfInList = listRows.find((r) => r.self);
    if (!me && selfInList) me = { ...selfInList, streak: null };
    if (me && selfInList && me.rank == null) me.rank = selfInList.rank;
    if (me && !selfInList && me.finished) listRows.push({ ...me, streak: undefined });

    return {
      gameName,
      tab: activeTab(doc),
      rows: listRows,
      me,
      sawUnfinished: listRows.some((r) => !r.finished),
    };
  }

  g.LGTParser = { parse, SEL };
})(typeof self !== 'undefined' ? self : window);
