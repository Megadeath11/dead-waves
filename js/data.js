// Global data tables, settings and lifetime stats. Everything lives on window.DW.
'use strict';
const DW = window.DW = {};

DW.APP_ID = 480; // Spacewar test app. Swap for your own app ID before release.
DW.GAME_TAG = 'deadwaves_v1';
DW.VERSION = '3.0.0';

DW.DIFFS = [
  { name: 'Recruit', hp: 0.7, dmg: 0.5, spd: 0.9, pts: 1.25, boss_every: 5, desc: 'Weaker, slower zombies and bonus points.' },
  { name: 'Regular', hp: 1.0, dmg: 1.0, spd: 1.0, pts: 1.0, boss_every: 5, desc: 'The intended experience.' },
  { name: 'Hardened', hp: 1.35, dmg: 1.5, spd: 1.1, pts: 1.0, boss_every: 5, desc: 'Tougher, faster zombies. Hits hurt.' },
  { name: 'Veteran', hp: 1.8, dmg: 2.2, spd: 1.2, pts: 0.9, boss_every: 4, desc: 'Brutal. Bosses every 4 waves.' },
];

DW.MAP_ORDER = ['outpost', 'bunker', 'factory', 'harbor', 'overpass', 'crossroads', 'proving'];

// range in metres (damage halves past it). Every shot goes exactly where the crosshair points (no spread).
DW.WEAPONS = {
  pistol: { name: 'M9 Sidearm', dmg: 45, rpm: 360, auto: false, mag: 8, reserve: 64, reload: 1.3, ads: 0.3, pellets: 1, range: 50, cost: 0, head: 2.5,
    color: [0.22, 0.22, 0.25], len: 0.3, snd: 'shot_light', splash: 0, kick: 1.4, pierce: 1 },
  m14: { name: 'M14 Rifle', dmg: 120, rpm: 320, auto: false, mag: 10, reserve: 100, reload: 2.0, ads: 0.05, pellets: 1, range: 90, cost: 600, head: 3.0,
    color: [0.42, 0.27, 0.13], len: 0.9, snd: 'shot_heavy', splash: 0, kick: 2.2, pierce: 2 },
  shotgun: { name: 'Pump Shotgun', dmg: 55, rpm: 80, auto: false, mag: 6, reserve: 48, reload: 2.4, ads: 4.0, pellets: 8, range: 16, cost: 1200, head: 1.5,
    color: [0.33, 0.2, 0.1], len: 0.75, snd: 'shot_shotgun', splash: 0, kick: 5.0, pierce: 1 },
  mp5: { name: 'MP5 SMG', dmg: 40, rpm: 800, auto: true, mag: 30, reserve: 240, reload: 1.8, ads: 0.7, pellets: 1, range: 35, cost: 1800, head: 2.0,
    color: [0.1, 0.1, 0.11], len: 0.55, snd: 'shot_light', splash: 0, kick: 0.7, pierce: 1 },
  ak: { name: 'AK-47', dmg: 65, rpm: 600, auto: true, mag: 30, reserve: 270, reload: 2.3, ads: 0.45, pellets: 1, range: 70, cost: 2600, head: 2.5,
    color: [0.45, 0.29, 0.13], len: 0.85, snd: 'shot_heavy', splash: 0, kick: 1.3, pierce: 1 },
  // Mystery box only
  lmg: { name: 'RPK Machine Gun', dmg: 75, rpm: 700, auto: true, mag: 100, reserve: 400, reload: 4.0, ads: 0.9, pellets: 1, range: 70, cost: 0, head: 2.0,
    color: [0.2, 0.22, 0.17], len: 1.0, snd: 'shot_heavy', splash: 0, kick: 1.0, pierce: 2 },
  deagle: { name: 'Desert Hawk', dmg: 260, rpm: 220, auto: false, mag: 7, reserve: 63, reload: 1.7, ads: 0.2, pellets: 1, range: 60, cost: 0, head: 3.0,
    color: [0.6, 0.6, 0.62], len: 0.36, snd: 'shot_heavy', splash: 0, kick: 4.0, pierce: 2 },
  sniper: { name: 'Barrett .50', dmg: 1500, rpm: 55, auto: false, mag: 5, reserve: 40, reload: 3.2, ads: 0.0, pellets: 1, range: 250, cost: 0, head: 4.0,
    color: [0.16, 0.17, 0.15], len: 1.25, snd: 'shot_sniper', splash: 0, kick: 7.0, pierce: 5 },
  plasma: { name: 'Plasma Caster', dmg: 900, rpm: 190, auto: false, mag: 20, reserve: 160, reload: 2.0, ads: 0.2, pellets: 1, range: 80, cost: 0, head: 1.2,
    color: [0.2, 0.95, 0.45], len: 0.45, snd: 'shot_ray', splash: 3.2, kick: 1.8, pierce: 1 },
  minigun: { name: 'Death Machine', dmg: 110, rpm: 1300, auto: true, mag: 200, reserve: 200, reload: 5.0, ads: 2.0, pellets: 1, range: 60, cost: 0, head: 1.5,
    color: [0.3, 0.3, 0.33], len: 1.1, snd: 'shot_light', splash: 0, kick: 0.5, pierce: 1 },
};

// equipment on key 4: its own slot, not a box or wall gun
DW.WEAPONS.wind = { name: 'Wind Charge', dmg: 0, rpm: 130, auto: false, mag: 3, reserve: 0, reload: 0, ads: 0.5, pellets: 0, range: 0, cost: 0, head: 1,
  color: [0.75, 0.92, 1.0], len: 0.4, snd: 'wind', splash: 0, kick: 2.5, pierce: 0 };
// the defibrillator is held out like the wind charge (key 6); revives done while holding it take 1 s
DW.WEAPONS.defib = { name: 'Defibrillator', dmg: 0, rpm: 60, auto: false, mag: 1, reserve: 0, reload: 0, ads: 0, pellets: 0, range: 0, cost: 0, head: 1,
  color: [0.85, 0.2, 0.12], len: 0.3, snd: 'hit', splash: 0, kick: 0, pierce: 0 };
DW.WIND_CHARGES = 3;
DW.WIND_RECHARGE = 3.0; // seconds per charge

DW.BOX_POOL = ['lmg', 'deagle', 'sniper', 'plasma', 'minigun', 'ak', 'mp5', 'shotgun', 'm14'];
DW.BOX_COST = 1950;
// Pack-a-Poonch tiers: cost to reach tier 1/2/3 and the damage multiplier at each tier
DW.PAP_COSTS = [0, 20000, 40000, 60000];
DW.PAP_DMG = [1, 4, 6, 9];
DW.PAP_NAMES = ['', 'POONCHED', 'POONCHED II', 'POONCHED III'];
DW.PAP_COST = DW.PAP_COSTS[1];
// late-game stations
DW.ARMOR_COST = 4000;     // armour locker: soaks this much damage before health
DW.ARMOR_MAX = 150;
DW.AMMO_COST = 5000;      // ammo resupply: refills every gun you carry
// Pack-a-Poonch doubles a gun's magazine and reserve every tier (x2, x4, x8); gun mastery adds a little on top
DW.magOf = w => Math.ceil(DW.WEAPONS[w.id].mag * (1 << (w.pap | 0)) * (DW.Prog ? DW.Prog.magMult(w.id) : 1));
DW.reserveOf = w => Math.ceil(DW.WEAPONS[w.id].reserve * (1 << (w.pap | 0)) * (DW.Prog ? DW.Prog.reserveMult(w.id) : 1));
// wall gear: no map letter, placed on the walls nearest the start (maps.js placeGear); each has its own hotbar slot
DW.GEAR = {
  grapple: { name: 'Grapple Gun', short: 'GRAPPLE', cost: 3000, desc: 'Aim at a downed teammate to reel them in, or at a wall to zip over' },
  defib: { name: 'Defibrillator', short: 'DEFIB', cost: 3000, desc: 'Hold it out (key 6) to revive teammates in 1 second' },
};
DW.GRAPPLE_RANGE = 40;
DW.GRAPPLE_CD = 4;
DW.GRAPPLE_SPEED = 24;
DW.NUKE_PER_KILL = 100; // nuke pays this per zombie it kills, split between all players
DW.SENTRY_COST = 8000;    // press T to place a sentry turret anywhere
DW.SENTRY_MAX = 4;        // per player, at once
DW.SENTRY_TIME = 120;     // seconds each one lasts
DW.INTERMISSION = 30;     // seconds between rounds (everyone can vote to skip with Enter)
DW.CRIT_MULT = 2;         // headshots while airborne
DW.GRENADE_COST = 150;    // per grenade at the grenade wall-buy
DW.MAX_GRENADES = 10;
DW.BOX_UNLOCK_WAVE = 5; // the box stays shut until this wave, so you work through the wall guns first
// box odds (relative): wall guns common, the big guns rare
DW.BOX_WEIGHT = { m14: 6, shotgun: 6, mp5: 6, ak: 5, deagle: 4, lmg: 3, sniper: 2, plasma: 1.5, minigun: 1 };

DW.PERKS = {
  iron: { name: 'Iron Hide', icon: 'IH', cost: 2500, color: [0.9, 0.15, 0.15], desc: 'Max health 250' },
  fast: { name: 'Fast Hands', icon: 'FH', cost: 3000, color: [0.25, 0.85, 0.3], desc: 'Reload 50% faster' },
  tap: { name: 'Double Tap', icon: 'DT', cost: 2000, color: [0.95, 0.75, 0.1], desc: 'Fire rate +33%' },
  wind: { name: 'Second Wind', icon: 'SW', cost: 1500, color: [0.2, 0.55, 1.0], desc: 'Solo: self-revive once. Co-op: revive twice as fast' },
  mule: { name: 'Mule Kick', icon: 'MK', cost: 4000, color: [0.15, 0.6, 0.25], desc: 'Carry a second primary gun (key 2)' },
  dead: { name: 'Deadshot', icon: 'DS', cost: 3500, color: [0.55, 0.55, 0.6], desc: 'Headshots do 60% more damage' },
  stam: { name: 'Stamin-Up', icon: 'SU', cost: 2500, color: [1.0, 0.55, 0.1], desc: 'Move 20% faster' },
};
DW.PERK_ORDER = ['iron', 'fast', 'tap', 'wind', 'mule', 'dead', 'stam'];
DW.MAX_PERKS = 7;
DW.ZTYPES = ['walker', 'runner', 'brute', 'spitter', 'goonlord', 'dodger']; // index travels in snapshots: append only
DW.DODGER_WAVE = 6;   // Dodgers (sidestep when someone aims at them) start showing up on this wave
DW.GOON_WAVE = 20;   // the Goon Lord rises on this wave, then every 10 waves
DW.GOON_STARE = 2.2; // after rising it stands still staring at you, then shrieks and charges
DW.BOSS_NAMES = { brute: 'BRUTE', spitter: 'ABOMINATION', goonlord: 'GOON LORD - THE WENDYGOON' };

// ---------------------------------------------------------------- small helpers

DW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
DW.lerp = (a, b, t) => a + (b - a) * t;
DW.moveToward = (v, to, d) => (Math.abs(to - v) <= d ? to : v + Math.sign(to - v) * d);
DW.randf = (a, b) => a + Math.random() * (b - a);
DW.randi = n => Math.floor(Math.random() * n);
DW.lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  d = ((2 * d) % (Math.PI * 2)) - d;
  return a + d * t;
};
DW.angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  return ((2 * d) % (Math.PI * 2)) - d;
};
// seeded RNG (mulberry32) for deterministic map dressing and zombie looks
DW.rng = seed => {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    randf: next,
    range: (a, b) => a + next() * (b - a),
    randi: (a, b) => a + Math.floor(next() * (b - a + 1)), // inclusive
    pick: arr => arr[Math.floor(next() * arr.length)],
  };
};
DW.hash = str => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
DW.fmtTime = sec => {
  const s = Math.floor(sec);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};
DW.css = c => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

// ---------------------------------------------------------------- settings & stats (localStorage)

DW.SETTING_DEFAULTS = {
  // controls
  sens: 0.2, adsSens: 1, invertY: false, toggleAds: false, toggleCrouch: false, binds: {},
  // audio
  volume: 0.8, music: 0.7, sfx: 1, muteUnfocused: true,
  // graphics (quality 0-3 is a preset, 4 = custom)
  fullscreen: false, fov: 80, quality: 2, renderScale: 1, shadows: 2, aa: true, lights: 8, particles: 1,
  brightness: 1, fpsCap: 0, showFps: false, shake: 1, bob: true,
  // hud
  xhColor: 0, xhSize: 6, hitmarkers: true, popups: true, hudScale: 1,
};
// Low / Medium / High / Ultra
DW.QUALITY_PRESETS = [
  { renderScale: 0.6, shadows: 0, aa: false, lights: 2, particles: 0 },
  { renderScale: 0.8, shadows: 1, aa: true, lights: 4, particles: 1 },
  { renderScale: 1, shadows: 2, aa: true, lights: 8, particles: 1 },
  { renderScale: 1.25, shadows: 3, aa: true, lights: 8, particles: 2 },
];
DW.SHADOW_SIZES = [0, 1024, 2048, 4096];
DW.XH_COLORS = [['White', '#ffffff'], ['Green', '#52ff6a'], ['Cyan', '#40e8ff'], ['Yellow', '#ffe14d'], ['Pink', '#ff5cd6'], ['Red', '#ff3a2e']];
DW.settings = JSON.parse(JSON.stringify(DW.SETTING_DEFAULTS));
DW.stats = {};
DW.mapId = 'outpost';
DW.diffId = 1;
DW.diff = () => DW.DIFFS[DW.clamp(DW.diffId, 0, DW.DIFFS.length - 1)];

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
}

DW.loadSettings = () => {
  const s = readJSON('dw.settings');
  if (s) for (const k in DW.settings) if (k in s && typeof s[k] === typeof DW.SETTING_DEFAULTS[k]) DW.settings[k] = s[k];
};
DW.saveSettings = () => writeJSON('dw.settings', DW.settings);
DW.resetSettings = group => {
  const keep = DW.settings;
  DW.settings = JSON.parse(JSON.stringify(DW.SETTING_DEFAULTS));
  if (group) for (const k in keep) if (!group.includes(k)) DW.settings[k] = keep[k];
  DW.applySettings();
  DW.saveSettings();
};
// Everything that can change live; the renderer bits (shadows, scale) are handled in main.js / world.js.
DW.applySettings = () => {
  const st = DW.settings;
  if (DW.Sfx) DW.Sfx.applyVolumes();
  if (DW.Input && DW.Input.applyBinds) DW.Input.applyBinds(st.binds);
  const ui = document.getElementById('ui');
  if (ui) {
    ui.style.setProperty('--xh', (DW.XH_COLORS[st.xhColor] || DW.XH_COLORS[0])[1]);
    ui.style.setProperty('--xhs', st.xhSize + 'px');
    ui.style.setProperty('--hud', st.hudScale);
  }
  if (DW.onSettings) DW.onSettings();
  // only touch the window when the Fullscreen option itself changed (F11 stays in charge otherwise)
  const fs = !!st.fullscreen;
  if (DW.fsApplied === fs) return;
  DW.fsApplied = fs;
  if (window.desktop) window.desktop.fullscreen(fs);
  else if (fs && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else if (!fs && document.fullscreenElement) document.exitFullscreen().catch(() => {});
};

DW.defaultStats = () => ({ games: 0, kills: 0, headshots: 0, bosses: 0, points: 0, downs: 0, revives: 0, time: 0, best_wave: {}, most_kills: 0, runs: [] });
DW.loadStats = () => {
  DW.stats = DW.defaultStats();
  const s = readJSON('dw.stats');
  if (s && typeof s === 'object') Object.assign(DW.stats, s);
};
DW.saveStats = () => writeJSON('dw.stats', DW.stats);
DW.recordRun = run => {
  const s = DW.stats;
  s.games += 1;
  for (const k of ['kills', 'headshots', 'bosses', 'points', 'downs', 'revives']) s[k] = (s[k] | 0) + (run[k] | 0);
  s.time = (+s.time || 0) + (+run.time || 0);
  s.most_kills = Math.max(s.most_kills | 0, run.kills | 0);
  const key = `${run.map}:${run.diff}`;
  s.best_wave[key] = Math.max(s.best_wave[key] | 0, run.wave | 0);
  s.runs.push({ map: run.map, diff: run.diff, wave: run.wave, kills: run.kills, players: run.players || 1, date: new Date().toISOString().slice(0, 10) });
  s.runs.sort((a, b) => (b.wave * 100000 + b.kills) - (a.wave * 100000 + a.kills));
  if (s.runs.length > 25) s.runs.length = 25;
  DW.saveStats();
};
