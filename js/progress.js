// Progression saved on this PC: rank (XP earned in matches) and what every rank unlocks, prestige,
// daily / weekly challenges, map medals and gun mastery (gun levels with small boosts, unlockable finishes).
// Bot playtests run with everything unlocked and never touch the save.
'use strict';
(function () {
  const P = DW.Prog = {};
  P.MAX_RANK = 50;
  P.MAX_PRESTIGE = 10;
  P.all = false; // everything unlocked, nothing saved (bot runs, ?unlockall)

  // XP to go from rank n to n + 1: the first few ranks take about one match each
  P.need = n => Math.min(1000 + 500 * (n - 1), 15000);
  P.DIFF_XP = [0.8, 1, 1.3, 1.6];

  // [rank, kind, id]: anything not listed is open from the start
  P.UNLOCKS = [
    [1, 'gun', 'pistol'], [1, 'gun', 'm14'], [1, 'gun', 'shotgun'], [1, 'perk', 'iron'], [1, 'perk', 'tap'], [1, 'item', 'box'],
    [1, 'map', 'outpost'], [1, 'map', 'bunker'], [1, 'diff', 0], [1, 'diff', 1],
    [2, 'perk', 'wind'], [2, 'item', 'grenades'],
    [3, 'gun', 'mp5'],
    [4, 'item', 'windcharge'],
    [5, 'perk', 'fast'], [5, 'map', 'factory'],
    [6, 'gun', 'deagle'],
    [7, 'perk', 'stam'],
    [8, 'gun', 'ak'],
    [9, 'item', 'armor'],
    [10, 'perk', 'mule'], [10, 'diff', 2], [10, 'map', 'harbor'],
    [11, 'gun', 'lmg'],
    [12, 'gear', 'grapple'],
    [13, 'pap', 1],
    [14, 'perk', 'dead'],
    [15, 'map', 'overpass'],
    [16, 'item', 'sentry'],
    [17, 'gear', 'defib'],
    [18, 'gun', 'sniper'],
    [19, 'item', 'ammo'],
    [20, 'diff', 3], [20, 'map', 'crossroads'],
    [22, 'pap', 2],
    [24, 'gun', 'plasma'],
    [26, 'map', 'proving'],
    [28, 'pap', 3],
    [30, 'gun', 'minigun'],
  ];
  // a new title every five ranks (shown on the menu and the rank list)
  P.TITLES = { 1: 'Fresh Meat', 5: 'Scavenger', 10: 'Survivor', 15: 'Sharpshooter', 20: 'Hardcase', 25: 'Zombie Hunter',
    30: 'Warden', 35: 'Slayer', 40: 'Nightstalker', 45: 'Deathless', 50: 'Legend of the Dead' };
  P.titleOf = r => { let t = ''; for (const k in P.TITLES) if (r >= +k) t = P.TITLES[k]; return t; };

  const ITEMS = { box: 'Mystery Box', grenades: 'Grenade wall-buy', windcharge: 'Wind Charge (key 4)', armor: 'Armour locker',
    sentry: 'Sentry turrets (T)', ammo: 'Ammo resupply' };
  const BOX_ONLY = { lmg: 1, deagle: 1, sniper: 1, plasma: 1, minigun: 1 };
  P.CATS = [['gun', 'Guns'], ['perk', 'Perks'], ['gear', 'Equipment'], ['item', 'Equipment'], ['pap', 'Pack-a-Poonch'], ['map', 'Maps'], ['diff', 'Difficulty']];
  P.nameOf = (kind, id) => {
    switch (kind) {
      case 'gun': return DW.WEAPONS[id].name + (BOX_ONLY[id] ? ' (Mystery Box)' : id === 'pistol' ? '' : ' (wall)');
      case 'perk': return DW.PERKS[id].name;
      case 'gear': return DW.GEAR[id].name;
      case 'item': return ITEMS[id];
      case 'pap': return `Pack-a-Poonch tier ${'I'.repeat(id)}`;
      case 'map': return ((DW.Maps && DW.Maps.MAPS[id]) || { name: id }).name + ' (map)';
      case 'diff': return DW.DIFFS[id].name + ' difficulty';
    }
    return String(id);
  };
  P.req = (kind, id) => { for (const u of P.UNLOCKS) if (u[1] === kind && u[2] === id) return u[0]; return 1; };
  P.has = (kind, id) => P.all || P.rank() >= P.req(kind, id);
  P.unlocksAt = r => P.UNLOCKS.filter(u => u[0] === r);

  // ---------------------------------------------------------------- gun mastery
  P.GUNS = ['pistol', 'm14', 'shotgun', 'mp5', 'ak', 'deagle', 'lmg', 'sniper', 'plasma', 'minigun'];
  P.LEVELS = [0, 25, 75, 150, 300, 500, 800, 1200, 1800, 2500]; // kills for gun level 1..10
  P.BOOSTS = [[3, 'reload', '10% faster reload'], [5, 'mag', '+20% magazine'], [7, 'reserve', '+25% reserve ammo'], [10, 'dmg', '+10% damage']];
  P.FINISHES = [
    ['copper', 'Copper', '100 kills', g => g.k >= 100],
    ['silver', 'Silver', '100 headshot kills', g => g.h >= 100],
    ['gold', 'Gold', '250 headshot kills', g => g.h >= 250],
    ['inferno', 'Inferno (animated)', '1000 kills and Gold', g => g.k >= 1000 && g.h >= 250],
  ];
  P.gun = id => (P.s.guns[id] = P.s.guns[id] || { k: 0, h: 0 });
  P.gunLevel = id => { const k = P.gun(id).k; let l = 1; while (l < P.LEVELS.length && k >= P.LEVELS[l]) l++; return l; };
  const boost = (id, what) => { if (P.all || !P.s || !P.s.guns[id]) return false; const b = P.BOOSTS.find(x => x[1] === what); return P.gunLevel(id) >= b[0]; };
  P.magMult = id => (boost(id, 'mag') ? 1.2 : 1);
  P.reserveMult = id => (boost(id, 'reserve') ? 1.25 : 1);
  P.reloadMult = id => (boost(id, 'reload') ? 0.9 : 1);
  P.dmgMult = id => (boost(id, 'dmg') ? 1.1 : 1);
  P.finishOf = id => {
    if (P.all || !P.s) return '';
    const f = P.s.finish[id], fd = P.FINISHES.find(x => x[0] === f);
    return fd && fd[3](P.gun(id)) ? f : '';
  };
  P.setFinish = (id, f) => { if (f) P.s.finish[id] = f; else delete P.s.finish[id]; P.save(); };

  // ---------------------------------------------------------------- map medals
  P.MEDALS = [
    ['w10', 'Survivor', 'Reach wave 10', 1000],
    ['w20', 'Hold the Line', 'Reach wave 20', 2500],
    ['w30', 'Last One Standing', 'Reach wave 30', 5000],
    ['boss', 'Boss Slayer', 'Kill a boss', 1500],
    ['goon', 'Goon Hunter', 'Kill the Goon Lord', 5000],
    ['perks4', 'Loaded', 'Own 4 perks at once', 1500],
    ['hard15', 'The Hard Way', 'Reach wave 15 on Hardened or Veteran', 4000],
  ];
  P.medals = map => P.s.medals[map] || [];

  // ---------------------------------------------------------------- challenges
  // tiers: easy / medium / hard targets; daily XP 1000 / 1750 / 2500, the weekly one is 5x a hard daily for 8000
  const CH = {
    kills: { t: [150, 300, 500], txt: n => `Kill ${n} zombies` },
    heads: { t: [50, 100, 200], txt: n => `Get ${n} headshot kills` },
    gun: { t: [50, 100, 150], txt: (n, a) => `Kill ${n} zombies with the ${DW.WEAPONS[a].name}` },
    knife: { t: [10, 20, 35], txt: n => `Get ${n} knife kills` },
    grenade: { t: [10, 25, 40], txt: n => `Get ${n} grenade kills` },
    crit: { t: [10, 20, 40], txt: n => `Get ${n} jump-headshot kills` },
    boss: { t: [1, 2, 3], txt: n => `Kill ${n} boss${n > 1 ? 'es' : ''}` },
    wave: { t: [10, 15, 20], max: true, txt: (n, a) => `Reach wave ${n} on ${DW.Maps.MAPS[a].name}` },
    perks: { t: [5, 10, 15], txt: n => `Buy ${n} perks` },
    doors: { t: [5, 10, 20], txt: n => `Clear ${n} debris piles` },
    powerups: { t: [3, 6, 10], txt: n => `Pick up ${n} power-ups` },
    points: { t: [20000, 50000, 100000], txt: n => `Earn ${n.toLocaleString()} points` },
  };
  P.chText = c => CH[c.type].txt(c.target, c.arg);
  const dayNo = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  function makeChallenges(key, count, weekly) {
    const r = DW.rng(DW.hash(key));
    const types = Object.keys(CH).filter(t => !(t === 'crit' && weekly));
    const out = [];
    while (out.length < count) {
      const type = r.pick(types);
      if (out.some(c => c.type === type)) continue;
      const tier = weekly ? 2 : r.randi(0, 2);
      let target = CH[type].t[tier], arg = null;
      if (type === 'gun') arg = r.pick(P.GUNS.filter(g => P.has('gun', g)));
      if (type === 'wave') arg = r.pick(DW.MAP_ORDER.filter(m => P.has('map', m)));
      if (weekly) target = type === 'wave' ? 30 : target * 5;
      out.push({ type, arg, target, prog: 0, done: false, xp: weekly ? 8000 : 1000 + 750 * tier });
    }
    return out;
  }
  // new dailies each day, a new weekly every Monday; progress carries over between matches
  P.refreshChallenges = () => {
    const s = P.s, d = dayNo(), wk = Math.floor((d + 3) / 7);
    if (!s.daily || s.daily.key !== d) s.daily = { key: d, list: makeChallenges('d' + d, 3, false) };
    if (!s.weekly || s.weekly.key !== wk) s.weekly = { key: wk, list: makeChallenges('w' + wk, 1, true) };
  };
  P.challenges = () => { P.refreshChallenges(); return [...P.s.daily.list, ...P.s.weekly.list]; };
  P.timeLeft = weekly => {
    const now = Date.now() - new Date().getTimezoneOffset() * 60000;
    const end = weekly ? (Math.floor((dayNo() + 3) / 7) + 1) * 7 - 3 : dayNo() + 1;
    const h = Math.max(0, (end * 86400000 - now) / 3600000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h` : `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m`;
  };

  // ---------------------------------------------------------------- save
  const KEY = 'dw.prog';
  P.load = () => {
    const q = new URLSearchParams(location.search);
    if (q.has('unlockall') || q.has('playtest')) P.all = true;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') {
      // first launch with progression: lifetime stats so far count towards your rank
      const st = DW.stats || {};
      const xp = (st.kills | 0) * 15 + (st.headshots | 0) * 5 + (st.bosses | 0) * 250 + (st.revives | 0) * 100;
      s = { xp, total: xp, prestige: 0 };
    }
    s.guns = s.guns || {}; s.finish = s.finish || {}; s.medals = s.medals || {};
    s.xp = +s.xp || 0; s.total = +s.total || 0; s.prestige = s.prestige | 0;
    P.s = s;
    P.refreshChallenges();
    P.save();
  };
  P.save = () => { if (P.all) return; try { localStorage.setItem(KEY, JSON.stringify(P.s)); } catch (e) { /* storage blocked */ } };

  P.info = (xp = P.s.xp) => {
    let r = 1, x = xp;
    while (r < P.MAX_RANK && x >= P.need(r)) { x -= P.need(r); r++; }
    return { rank: r, into: r < P.MAX_RANK ? x : 0, need: r < P.MAX_RANK ? P.need(r) : 0 };
  };
  P.rank = () => (P.s ? P.info().rank : 1);
  P.xpFor = r => { let t = 0; for (let i = 1; i < r; i++) t += P.need(i); return t; };
  P.startPoints = () => Math.round(500 * (1 + 0.1 * (P.all ? 0 : P.s.prestige)));
  P.canPrestige = () => P.rank() >= P.MAX_RANK && P.s.prestige < P.MAX_PRESTIGE;
  P.prestige = () => {
    if (!P.canPrestige()) return false;
    P.s.prestige++;
    P.s.xp = 0;
    P.save();
    return true;
  };
  P.badge = () => (P.s && P.s.prestige > 0 ? `P${P.s.prestige} ` : '') + `Rank ${P.rank()}`;

  // ---------------------------------------------------------------- during a match
  // notify(text, color) shows a message in the match (set by the world)
  P.startMatch = (map, diff, notify) => {
    P.refreshChallenges();
    P.m = { map, diff, notify: notify || (() => {}), bonus: [], gunUps: [], done: [] };
  };
  function award(label, xp) { P.m.bonus.push([label, xp]); }
  function bump(type, n, arg) {
    if (!P.m || P.all) return;
    for (const c of P.challenges()) {
      if (c.done || c.type !== type || (c.arg && c.arg !== arg)) continue;
      c.prog = CH[type].max ? Math.max(c.prog, n) : c.prog + n;
      if (c.prog >= c.target) {
        c.prog = c.target;
        c.done = true;
        award('Challenge: ' + P.chText(c), c.xp);
        P.m.done.push(P.chText(c));
        P.m.notify(`CHALLENGE COMPLETE\n${P.chText(c)}\n+${c.xp} XP`, [0.4, 1.0, 0.55]);
      }
    }
  }
  function medal(id) {
    if (!P.m || P.all) return;
    const got = P.s.medals[P.m.map] = P.s.medals[P.m.map] || [];
    if (got.includes(id)) return;
    got.push(id);
    const md = P.MEDALS.find(x => x[0] === id);
    award(`Medal: ${md[1]}`, md[3]);
    P.m.notify(`MEDAL: ${md[1].toUpperCase()}\n${md[2]}\n+${md[3]} XP`, [1.0, 0.82, 0.3]);
  }
  // gun: weapon id, or 'knife' / 'grenade' / 'sentry'
  P.onKill = (gun, head, crit, boss, goon) => {
    if (!P.m || P.all) return;
    if (DW.WEAPONS[gun] && P.GUNS.includes(gun)) {
      const before = P.gunLevel(gun), g = P.gun(gun);
      g.k++;
      if (head) g.h++;
      const after = P.gunLevel(gun);
      if (after > before) {
        P.m.gunUps.push(`${DW.WEAPONS[gun].name} level ${after}`);
        const b = P.BOOSTS.find(x => x[0] === after);
        P.m.notify(`${DW.WEAPONS[gun].name.toUpperCase()} LEVEL ${after}${b ? '\n' + b[2] : ''}`, [0.6, 0.85, 1.0]);
      }
      for (const f of P.FINISHES) if (f[3](g) && !(g.got || []).includes(f[0])) {
        g.got = [...(g.got || []), f[0]];
        P.m.notify(`${f[1].toUpperCase()} FINISH UNLOCKED\n${DW.WEAPONS[gun].name} - pick it in Progression > Armory`, [1.0, 0.75, 0.35]);
      }
      bump('gun', 1, gun);
    }
    bump('kills', 1);
    if (head) bump('heads', 1);
    if (crit) bump('crit', 1);
    if (gun === 'knife') bump('knife', 1);
    if (gun === 'grenade') bump('grenade', 1);
    if (boss) { bump('boss', 1); medal('boss'); }
    if (goon) medal('goon');
  };
  P.onWave = n => {
    if (!P.m) return;
    bump('wave', n, P.m.map);
    if (n >= 10) medal('w10');
    if (n >= 20) medal('w20');
    if (n >= 30) medal('w30');
    if (n >= 15 && P.m.diff >= 2) medal('hard15');
  };
  P.onPerks = count => { bump('perks', 1); if (count >= 4) medal('perks4'); };
  P.onEvent = (type, n = 1) => bump(type, n);

  // match over (or quit): add XP, return what to show on the game-over screen
  P.finishMatch = run => {
    if (!P.m) return null;
    if (P.all) { P.m = null; return null; }
    // points earned are only known at the end
    if (run.points > 0) bump('points', run.points | 0);
    const m = P.m;
    P.m = null;
    const w = Math.max(0, (run.wave | 0) - 1);
    const lines = [
      ['Waves survived', 50 * w * (w + 1)],
      ['Kills', (run.kills | 0) * 10],
      ['Headshots', (run.headshots | 0) * 5],
      ['Bosses', (run.bosses | 0) * 250],
      ['Revives', (run.revives | 0) * 100],
    ].filter(l => l[1] > 0);
    const mult = P.DIFF_XP[run.diff | 0] || 1;
    let base = lines.reduce((a, l) => a + l[1], 0);
    if (mult !== 1) { const extra = Math.round(base * (mult - 1)); lines.push([`${DW.DIFFS[run.diff | 0].name} difficulty x${mult}`, extra]); base += extra; }
    for (const b of m.bonus) lines.push(b);
    const total = lines.reduce((a, l) => a + l[1], 0);
    const before = P.info(), r0 = before.rank;
    P.s.xp += total;
    P.s.total += total;
    const after = P.info();
    const unlocks = [];
    for (let r = r0 + 1; r <= after.rank; r++) {
      for (const u of P.unlocksAt(r)) unlocks.push(`Rank ${r}: ${P.nameOf(u[1], u[2])}`);
      if (P.TITLES[r]) unlocks.push(`Rank ${r}: title "${P.TITLES[r]}"`);
    }
    P.save();
    return { lines, total, before, after, unlocks, gunUps: m.gunUps, done: m.done };
  };
})();
