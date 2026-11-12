// Shared helpers: game catalogue, puzzle-day maths, storage.
// Loaded by the service worker (importScripts) and by the popup/dashboard pages.
(function (g) {
  const ICON = (h) => `https://static.licdn.com/aero-v1/sc/h/${h}`;

  // Known games. The slug is the part of the LinkedIn URL after /games/.
  // Aliases are LinkedIn's internal code names, which appear in some URLs and assets.
  const GAMES = [
    { slug: 'queens',      name: 'Queens',      icon: ICON('6uvsjtqx2j32uh1a803qygh5y'), hue: 268, aliases: [] },
    { slug: 'tango',       name: 'Tango',       icon: ICON('gqavqd9gk6ja1s27lr1p2zz2'),  hue: 28,  aliases: ['lotka'] },
    { slug: 'zip',         name: 'Zip',         icon: ICON('d67y35f347xvmfy90wegovpng'), hue: 22,  aliases: ['trail'] },
    { slug: 'mini-sudoku', name: 'Mini Sudoku', icon: ICON('6nflnl3tlil95zu7bjkqq3huc'), hue: 205, aliases: ['sudoku', 'minisudoku'] },
    { slug: 'patches',     name: 'Patches',     icon: ICON('evf03pqebsvaxzmgmp8f9vkuv'), hue: 330, aliases: [] },
    { slug: 'wend',        name: 'Wend',        icon: ICON('aacdzbfj2x7q2jh0cum7cglwf'), hue: 160, aliases: [] },
    { slug: 'pinpoint',    name: 'Pinpoint',    icon: ICON('75hui8gm3kv7ics73rcgqeaef'), hue: 215, aliases: [] },
    { slug: 'crossclimb',  name: 'Crossclimb',  icon: ICON('4mjo14pdidwm233ks38d99107'), hue: 45,  aliases: [] },
  ];

  function canonicalSlug(slug) {
    slug = (slug || '').toLowerCase();
    const hit = GAMES.find((x) => x.slug === slug || x.aliases.includes(slug));
    return hit ? hit.slug : slug;
  }

  function gameMeta(slug, learned) {
    const known = GAMES.find((x) => x.slug === slug);
    const l = (learned && learned[slug]) || {};
    return {
      slug,
      name: (known && known.name) || l.name || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: (known && known.icon) || null,
      hue: known ? known.hue : 210,
      order: known ? GAMES.indexOf(known) : 99,
    };
  }

  // ---- Puzzle days ---------------------------------------------------------
  // LinkedIn puzzles reset at midnight US Pacific time (10:00 in Israel most of the year).
  const PT = 'America/Los_Angeles';
  const ptDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: PT, year: 'numeric', month: '2-digit', day: '2-digit' });
  const ptTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: PT, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

  function puzzleDay(date = new Date()) { return ptDateFmt.format(date); }
  function addDays(day, n) {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  }
  function nextReset(now = new Date()) {
    const [h, m, s] = ptTimeFmt.format(now).split(':').map(Number);
    const left = (24 * 3600 - (h * 3600 + m * 60 + s)) * 1000;
    return new Date(now.getTime() + left);
  }
  function formatDay(day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
    return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
  }

  // ---- Names & scores ------------------------------------------------------
  function nameKey(name) {
    return (name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  function cleanName(name) {
    return (name || '').replace(/^[^\p{L}\p{N}(]+/u, '').replace(/\s+/g, ' ').trim();
  }
  function scoreSeconds(score) {
    if (!score || !/^\d+(:\d{1,2}){1,2}$/.test(score.trim())) return null;
    return score.trim().split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  }

  // ---- Storage -------------------------------------------------------------
  const store = {
    async get(keys) { return chrome.storage.local.get(keys); },
    async set(obj) { return chrome.storage.local.set(obj); },
    boardKey: (day, slug) => `b:${day}:${slug}`,
    async settings() {
      const { settings } = await chrome.storage.local.get('settings');
      return Object.assign({ friends: [], backstop: true }, settings || {});
    },
    async saveSettings(s) { return chrome.storage.local.set({ settings: s }); },
    async learnedGames() {
      const { games } = await chrome.storage.local.get('games');
      return games || {};
    },
    async allBoards() {
      const all = await chrome.storage.local.get(null);
      const boards = [];
      for (const [k, v] of Object.entries(all)) if (k.startsWith('b:')) boards.push(v);
      return boards;
    },
  };

  g.LGT = { GAMES, canonicalSlug, gameMeta, puzzleDay, addDays, daysBetween, nextReset, formatDay, nameKey, cleanName, scoreSeconds, store };
})(typeof self !== 'undefined' ? self : window);
