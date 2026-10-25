// Entry point: renderer, game loop, menus, Steam lobby screens, leaderboards and stats.
// Starts a World when a match begins and returns here when it ends.
'use strict';
(function () {
  const UI = DW.UI, Net = DW.Net, Maps = DW.Maps;
  let renderer, canvas, world = null, screen = null, current = 'main', menuBg = null, fpsEl = null, pixelRatio = 0;
  let toastT = 0, toastEl = null, browseList = null;
  let lbMap = 0, lbDiff = 0;
  const params = new URLSearchParams(location.search);

  function boot() {
    DW.loadSettings();
    DW.loadStats();
    DW.Sfx.init();
    canvas = document.getElementById('game');
    // anti-aliasing is fixed when the WebGL context is made, so that option needs a restart
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !!DW.settings.aa, powerPreference: 'high-performance' });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    fpsEl = document.getElementById('fps');
    buildMenuBg();
    window.addEventListener('resize', resize);
    DW.onSettings = applyGraphics;
    DW.applySettings();
    resize();

    // any click in a running match captures the mouse (not clicks on menu buttons or sliders)
    window.addEventListener('mousedown', e => {
      if (!world || world.gameOver || world.hud.isPaused() || DW.Input.locked) return;
      if (e.target.closest && e.target.closest('button, input, select, .overlay')) return;
      DW.Input.lock(canvas);
    });
    DW.Input.onLockChange = locked => {
      if (!world || world.gameOver) return;
      if (locked && world.hud.isPaused()) world.hud.closePause();
      else if (!locked && !world.hud.isPaused() && !DW.botActive) world.hud.openPause();
    };
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (world && !world.gameOver && world.hud.isPaused()) world.hud.resume();
      else if (!world && ['setup', 'browse', 'leaderboard', 'stats', 'settings'].includes(current)) showScreen('main');
    });

    Net.on('lobby_updated', onLobbyUpdated);
    Net.on('lobby_error', toast);
    Net.on('match_start', startMatch);
    Net.on('lobby_list', onLobbyList);
    Net.init().then(() => {
      showScreen('main');
      if (params.has('playtest') && DW.Bot) DW.Bot.run(params);
    });
    showScreen('main');
    let last = performance.now(), lastRaf = 0, fpsN = 0, fpsT = performance.now();
    const frame = now => {
      requestAnimationFrame(frame);
      lastRaf = performance.now();
      // FPS limit: skip display frames until the next one is due (0.5 ms slack for timer jitter)
      const cap = DW.settings.fpsCap;
      if (cap > 0 && now - last < 1000 / cap - 0.5) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      tick(dt);
      fpsN++;
      if (now - fpsT >= 500) {
        if (DW.settings.showFps) fpsEl.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS';
        fpsN = 0; fpsT = now;
      }
    };
    requestAnimationFrame(frame);
    // bot test runs keep going when the page is hidden (rAF stops there)
    setInterval(() => {
      if (!(DW.botActive || DW.forceLoop) || performance.now() - lastRaf < 250) return;
      const now = performance.now();
      // background timers may only fire once a second: catch up in fixed 1/60 s steps
      const n = Math.min(240, Math.max(1, Math.round((now - last) / 1000 * 60 * Math.max(1, DW.simSpeed || 1))));
      last = now;
      for (let i = 0; i < n; i++) step(1 / 60);
    }, 16);
  }

  function tick(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0 && toastEl) toastEl.textContent = ''; }
    const steps = DW.botActive && DW.simSpeed > 1 ? Math.round(DW.simSpeed) : 1;
    for (let i = 0; i < steps; i++) step(steps > 1 ? 1 / 60 : dt);
    if (world) world.render();
  }

  function step(dt) {
    const t0 = performance.now();
    if (DW.Bot && DW.botActive) DW.Bot.tick(dt);
    if (world) world.update(dt);
    DW.lastFrameMs = performance.now() - t0;
    DW.Input.endFrame();
  }

  // renderer-side graphics options (called whenever a setting changes)
  function applyGraphics() {
    const st = DW.settings;
    const pr = Math.min((window.devicePixelRatio || 1) * st.renderScale, 2.5);
    if (pr !== pixelRatio) { pixelRatio = pr; renderer.setPixelRatio(pr); resize(); }
    renderer.toneMappingExposure = 1.25 * st.brightness;
    if (fpsEl) { fpsEl.style.display = st.showFps ? 'block' : 'none'; if (!st.showFps) fpsEl.textContent = ''; }
    if (world) world.applyGraphics();
  }

  // drifting fog and rising embers behind every menu screen
  function buildMenuBg() {
    menuBg = UI.el('div', 'menubg');
    menuBg.innerHTML = '<div class="fog f1"></div><div class="fog f2"></div><canvas class="embers"></canvas><div class="menuvig"></div>';
    document.getElementById('ui').prepend(menuBg);
    const cv = menuBg.querySelector('canvas'), g = cv.getContext('2d');
    const embers = [];
    const spawn = (y) => ({ x: Math.random() * 1600, y: y !== undefined ? y : 900 + Math.random() * 40, vx: (Math.random() - 0.3) * 18,
      vy: -(15 + Math.random() * 45), r: 0.8 + Math.random() * 2.2, life: 0, max: 6 + Math.random() * 10, ph: Math.random() * 6.28 });
    for (let i = 0; i < 70; i++) embers.push(spawn(Math.random() * 900));
    let lt = performance.now();
    const draw = now => {
      requestAnimationFrame(draw);
      const dt = Math.min((now - lt) / 1000, 0.05);
      lt = now;
      if (world || menuBg.style.display === 'none') return;
      const W = Math.round(menuBg.clientWidth) || 1600, H = Math.round(menuBg.clientHeight) || 900;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life += dt;
        e.x += (e.vx + Math.sin(now / 900 + e.ph) * 12) * dt;
        e.y += e.vy * dt;
        if (e.life > e.max || e.y < -20) { embers[i] = spawn(); continue; }
        const a = Math.min(1, e.life) * Math.min(1, (e.max - e.life) / 2) * (0.55 + 0.45 * Math.sin(now / 160 + e.ph));
        g.fillStyle = `rgba(255,${90 + (e.ph * 20 | 0)},40,${(a * 0.8).toFixed(3)})`;
        g.beginPath(); g.arc(e.x * W / 1600, e.y * H / 900, e.r, 0, 6.283); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };
    requestAnimationFrame(draw);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (world) world.resize(w, h);
    const s = Math.min(w / 1600, h / 900);
    const ui = document.getElementById('ui');
    ui.style.width = (w / s) + 'px';
    ui.style.height = (h / s) + 'px';
    ui.style.transform = `scale(${s})`;
  }

  function toast(msg) {
    if (toastEl) { toastEl.textContent = msg; toastT = 5; }
  }
  DW.toast = toast;

  // ---------------------------------------------------------------- screens
  function showScreen(name) {
    current = name;
    if (screen) screen.remove();
    screen = UI.el('div', 'screen');
    document.getElementById('ui').appendChild(screen);
    menuBg.style.display = 'block';
    DW.Sfx.menuMusic();
    ({ main: mainMenu, setup: setupMenu, lobby: lobbyMenu, browse: browseMenu, leaderboard: leaderboardMenu, stats: statsMenu, settings: settingsMenu })[name]();
    toastEl = UI.el('div', 'toast');
    screen.appendChild(toastEl);
  }

  function frame(title, sub) {
    const v = UI.el('div', 'frame');
    v.appendChild(UI.el('div', 'h1', title));
    if (sub) v.appendChild(UI.el('div', 'dim', sub));
    screen.appendChild(v);
    return v;
  }

  function tips() {
    const K = a => DW.Input.keyName(a);
    return [
      'Headshots while you are in the air are crits: double damage.',
      'The Mystery Box opens on wave 5. The Death Machine is its rarest prize.',
      'Pack-a-Poonch costs 20,000 for 4x damage, and can go two tiers further.',
      `Wind charge (${K('weapon_3')}) blasts zombies back. Aim at the floor to launch yourself.`,
      `Sentries cost 8,000. Place up to four with ${K('sentry')}.`,
      'Max Ammo reloads every gun on the spot and tops grenades up to 4.',
      `Everyone pressing ${K('skip')} skips the break between rounds.`,
      'Wave 20. The lights go out. It stares before it runs.',
      'Downed players are ignored. Get up and you have 3 seconds of grace.',
      'Iron Hide, Fast Hands, Double Tap... buy perks early, the box can wait.',
      'Bosses enrage at half health: faster, angrier, bigger slams.',
    ];
  }

  function mainMenu() {
    const v = UI.el('div', 'mainmenu');
    v.appendChild(UI.el('div', 'title', 'DEAD WAVES'));
    v.appendChild(UI.el('div', 'tagline', 'Survive the night. Together.'));
    v.appendChild(UI.el('div', 'spacer small'));
    const items = [];
    items.push(UI.button('Solo', () => showScreen('setup'), 'mm primary'));
    const host = UI.button('Host co-op', () => { Net.hostLobby(); toast('Creating lobby...'); }, 'mm');
    host.disabled = !Net.steamOk;
    items.push(host);
    const find = UI.button('Join co-op', () => { showScreen('browse'); Net.findLobbies(); }, 'mm');
    find.disabled = !Net.steamOk;
    items.push(find);
    items.push(UI.button('Leaderboards', () => showScreen('leaderboard'), 'mm'));
    items.push(UI.button('Stats', () => showScreen('stats'), 'mm'));
    items.push(UI.button('Settings', () => showScreen('settings'), 'mm'));
    items.push(UI.button('Quit', () => { if (window.desktop) window.desktop.quit(); else window.close(); }, 'mm'));
    items.forEach((b, i) => { b.style.animationDelay = (0.08 + i * 0.05) + 's'; v.appendChild(b); });
    screen.appendChild(v);

    // right-hand card: last run, best wave, a tip
    const card = UI.el('div', 'menucard panel');
    const s = DW.stats;
    const runs = s.runs || [];
    const lastRun = runs.filter(r => (r.wave | 0) > 0).pop();
    card.appendChild(UI.el('div', 'label', 'LAST RUN'));
    if (lastRun) {
      const m = (Maps.MAPS[lastRun.map] || { name: lastRun.map }).name;
      card.appendChild(UI.el('div', 'h3', `Wave ${lastRun.wave | 0}  -  ${m}`));
      card.appendChild(UI.el('div', 'dim', `${DW.DIFFS[lastRun.diff | 0].name}  -  ${lastRun.kills | 0} kills  -  ${lastRun.players > 1 ? lastRun.players + ' players' : 'solo'}`));
    } else card.appendChild(UI.el('div', 'dim', 'No runs yet. The night is waiting.'));
    const best = Object.values(s.best_wave || {}).reduce((a, b) => Math.max(a, b | 0), 0);
    card.appendChild(UI.el('div', 'label', 'BEST WAVE'));
    card.appendChild(UI.el('div', 'h2 gold', best > 0 ? String(best) : '-'));
    card.appendChild(UI.el('div', 'dim small', `${s.kills | 0} zombies killed in ${s.games | 0} games`));
    const tipL = UI.el('div', 'tip');
    const all = tips();
    let ti = Math.floor(Math.random() * all.length);
    const setTip = () => { tipL.textContent = all[ti % all.length]; tipL.classList.remove('fade'); void tipL.offsetWidth; tipL.classList.add('fade'); ti++; };
    setTip();
    const timer = setInterval(() => { if (!tipL.isConnected) clearInterval(timer); else setTip(); }, 7000);
    card.appendChild(UI.el('div', 'label', 'TIP'));
    card.appendChild(tipL);
    screen.appendChild(card);

    const foot = UI.el('div', 'menufoot');
    foot.appendChild(UI.el('span', Net.steamOk ? 'ok' : 'warn', Net.steamOk ? '\u25CF ' : '\u25CB '));
    foot.appendChild(UI.el('span', '', `${Net.status}`));
    foot.appendChild(UI.el('span', 'ver', `v${DW.VERSION}`));
    screen.appendChild(foot);
  }

  function selectedStyle(b, on) { if (on) b.classList.add('selected'); }

  function mapPicker(v, editable) {
    v.appendChild(UI.el('div', 'label', 'MAP'));
    const row = UI.el('div', 'row');
    for (const m of DW.MAP_ORDER) {
      const def = Maps.MAPS[m];
      const best = DW.stats.best_wave[`${m}:${DW.diffId}`] | 0;
      const b = UI.button('', () => { DW.mapId = m; Net.pushConfig(); showScreen(current); screen.classList.add('still'); }, 'mapbtn');
      b.innerHTML = `<b>${def.name}</b><br><span>${def.desc}</span><br><span>Best wave: ${best > 0 ? best : '-'}</span>`;
      b.disabled = !editable;
      selectedStyle(b, m === DW.mapId);
      row.appendChild(b);
    }
    v.appendChild(row);
    v.appendChild(UI.el('div', 'label', 'DIFFICULTY'));
    const drow = UI.el('div', 'row');
    DW.DIFFS.forEach((d, i) => {
      const b = UI.button(d.name, () => { DW.diffId = i; Net.pushConfig(); showScreen(current); screen.classList.add('still'); }, 'narrow');
      b.title = d.desc;
      b.disabled = !editable;
      selectedStyle(b, i === DW.diffId);
      drow.appendChild(b);
    });
    v.appendChild(drow);
    v.appendChild(UI.el('div', 'dim', DW.diff().desc));
  }

  function setupMenu() {
    const v = frame('SOLO', 'Pick a map and difficulty.');
    mapPicker(v, true);
    const row = UI.el('div', 'row');
    row.appendChild(UI.button('Start', () => { DW.Input.lock(canvas); Net.startMatch(); }));
    row.appendChild(UI.button('Back', () => showScreen('main'), 'narrow'));
    v.appendChild(row);
  }

  function lobbyMenu() {
    const host = Net.isHost();
    const v = frame('LOBBY', 'Up to 4 players. Invite friends through Steam, or send them the lobby code.');
    const cols = UI.el('div', 'row top');
    const left = UI.el('div', 'col');
    left.appendChild(UI.el('div', 'label', `PLAYERS (${Net.members.length}/4)`));
    for (const m of Net.members) {
      const l = UI.el('div', 'h3', Net.persona(m.id) + (m.id === Net.hostId ? '  (host)' : ''));
      if (m.id === Net.myId) l.classList.add('gold');
      left.appendChild(l);
    }
    left.appendChild(UI.el('div', 'label', 'LOBBY CODE'));
    const code = UI.el('div', 'code', Net.lobbyId);
    left.appendChild(code);
    left.appendChild(UI.button('Copy code', () => {
      if (window.desktop) window.desktop.copy(Net.lobbyId); else if (navigator.clipboard) navigator.clipboard.writeText(Net.lobbyId);
      toast('Lobby code copied. Friends paste it under "Join co-op game".');
    }, 'narrow'));
    cols.appendChild(left);
    const right = UI.el('div', 'col');
    mapPicker(right, host);
    if (!host) right.appendChild(UI.el('div', 'gold', 'Waiting for the host to start...'));
    cols.appendChild(right);
    v.appendChild(cols);
    const row = UI.el('div', 'row');
    if (host) row.appendChild(UI.button('Start match', () => { DW.Input.lock(canvas); Net.startMatch(); }));
    row.appendChild(UI.button('Invite friends', () => Net.inviteFriends(), 'narrow'));
    row.appendChild(UI.button('Leave lobby', () => { Net.leaveLobby(); showScreen('main'); }, 'narrow'));
    v.appendChild(row);
  }

  function browseMenu() {
    const v = frame('JOIN CO-OP', 'Accept a Steam invite, paste a lobby code, or pick an open game below.');
    const crow = UI.el('div', 'row');
    const input = UI.el('input', 'codein');
    input.placeholder = 'Lobby code';
    crow.appendChild(input);
    crow.appendChild(UI.button('Join', () => {
      const id = input.value.trim();
      if (!id) { toast('Paste a lobby code first.'); return; }
      toast('Joining...');
      Net.joinLobby(id);
    }, 'narrow'));
    v.appendChild(crow);
    const row = UI.el('div', 'row');
    row.appendChild(UI.button('Refresh', () => { toast('Searching...'); Net.findLobbies(); }, 'narrow'));
    row.appendChild(UI.button('Back', () => showScreen('main'), 'narrow'));
    v.appendChild(row);
    browseList = UI.el('div', 'list');
    browseList.appendChild(UI.el('div', 'dim', 'Searching...'));
    v.appendChild(browseList);
  }

  function onLobbyList(lobbies) {
    if (current !== 'browse' || !browseList) return;
    browseList.innerHTML = '';
    if (!lobbies.length) {
      browseList.appendChild(UI.el('div', 'dim', 'No open games found. Host one, or ask a friend for their lobby code.'));
      return;
    }
    for (const l of lobbies) {
      const h = UI.el('div', 'row');
      const mapName = (Maps.MAPS[l.map] || { name: '?' }).name;
      const dname = DW.DIFFS[DW.clamp(l.diff, 0, 3)].name;
      h.appendChild(UI.el('div', 'h3', `${l.name}   -   ${mapName} / ${dname}   ${l.count > 0 ? l.count + '/4' : ''}   ${l.state === 'ingame' ? '(in progress)' : ''}`));
      const jb = UI.button('Join', () => Net.joinLobby(l.id), 'small');
      jb.disabled = l.state === 'ingame';
      h.appendChild(jb);
      browseList.appendChild(h);
    }
  }

  function leaderboardMenu() {
    const v = frame('LEADERBOARDS', 'Your best runs on this PC, highest wave first (kills break ties).');
    const row = UI.el('div', 'row');
    const list = UI.el('div', 'list');
    row.appendChild(UI.select(['All maps', ...DW.MAP_ORDER.map(m => Maps.MAPS[m].name)], lbMap, i => { lbMap = i; loadBoard(list); }));
    row.appendChild(UI.select(['All difficulties', ...DW.DIFFS.map(d => d.name)], lbDiff, i => { lbDiff = i; loadBoard(list); }));
    row.appendChild(UI.button('Back', () => showScreen('main'), 'narrow'));
    v.appendChild(row);
    v.appendChild(list);
    loadBoard(list);
  }

  function loadBoard(list) {
    list.innerHTML = '';
    const runs = DW.stats.runs.filter(r => (lbMap === 0 || r.map === DW.MAP_ORDER[lbMap - 1]) && (lbDiff === 0 || r.diff === lbDiff - 1));
    if (!runs.length) { list.appendChild(UI.el('div', 'dim', 'No runs here yet. Go play!')); return; }
    let html = '<tr class="head"><td>#</td><td>Map</td><td>Difficulty</td><td>Wave</td><td>Kills</td><td>Squad</td><td>Date</td></tr>';
    runs.forEach((r, i) => {
      html += `<tr><td>${i + 1}</td><td>${(Maps.MAPS[r.map] || { name: r.map }).name}</td><td>${DW.DIFFS[r.diff | 0].name}</td><td>${r.wave | 0}</td><td>${r.kills | 0}</td><td>${r.players || 1}</td><td>${UI.esc(r.date)}</td></tr>`;
    });
    const t = UI.el('table', 'scores');
    t.innerHTML = html;
    list.appendChild(t);
  }

  function statsMenu() {
    const v = frame('STATS', 'Lifetime stats on this PC.');
    const s = DW.stats;
    const acc = s.kills > 0 ? s.headshots / s.kills * 100 : 0;
    const items = [
      ['Games played', s.games | 0], ['Time survived', DW.fmtTime(+s.time || 0)],
      ['Zombies killed', s.kills | 0], ['Headshots', `${s.headshots | 0}  (${acc.toFixed(0)}%)`],
      ['Bosses killed', s.bosses | 0], ['Most kills in a game', s.most_kills | 0],
      ['Points earned', s.points | 0], ['Revives', s.revives | 0],
      ['Times downed', s.downs | 0],
    ];
    const g = UI.el('div', 'statgrid');
    for (const [k, val] of items) { g.appendChild(UI.el('div', 'dim', k)); g.appendChild(UI.el('div', 'h3', String(val))); }
    v.appendChild(g);
    v.appendChild(UI.el('div', 'label', 'BEST WAVE'));
    let html = '<tr class="head"><td></td>' + DW.DIFFS.map(d => `<td>${d.name}</td>`).join('') + '</tr>';
    for (const m of DW.MAP_ORDER) {
      html += `<tr><td>${Maps.MAPS[m].name}</td>`;
      DW.DIFFS.forEach((d, i) => { const b = s.best_wave[`${m}:${i}`] | 0; html += `<td class="${b > 0 ? 'gold' : 'dim'}">${b > 0 ? b : '-'}</td>`; });
      html += '</tr>';
    }
    const t = UI.el('table', 'scores');
    t.innerHTML = html;
    v.appendChild(t);
    v.appendChild(UI.button('Back', () => showScreen('main'), 'narrow'));
  }

  function settingsMenu() {
    const v = frame('SETTINGS', 'Changes save as you make them.');
    const p = UI.el('div', 'panel settingsbox');
    p.appendChild(UI.settingsPanel());
    v.appendChild(p);
    v.appendChild(UI.button('Back', () => showScreen('main'), 'narrow'));
  }

  // ---------------------------------------------------------------- lobby & match
  // only redraw the lobby when something on it changed, and without the entry animation (it used to flash)
  let lobbySig = '';
  function onLobbyUpdated() {
    if (world) return;
    if (Net.isOnline()) {
      const sig = [Net.lobbyId, Net.hostId, DW.mapId, DW.diffId, ...Net.members.map(m => m.id + ':' + Net.persona(m.id))].join('|');
      if (current === 'lobby' && sig === lobbySig) return;
      const again = current === 'lobby';
      lobbySig = sig;
      showScreen('lobby');
      if (again) screen.classList.add('still');
    } else if (current === 'lobby') { lobbySig = ''; showScreen('main'); }
  }

  function startMatch(cfg) {
    if (world) { world.dispose(); world = null; }
    if (screen) screen.style.display = 'none';
    menuBg.style.display = 'none';
    world = new DW.World(cfg, renderer);
    DW.world = world;
    world.resize(window.innerWidth, window.innerHeight);
    world.onFinished = restart => finishMatch(restart);
    canvas.style.display = 'block';
  }

  function finishMatch(restart) {
    if (world) { world.dispose(); world = null; DW.world = null; }
    DW.Input.unlock();
    canvas.style.display = 'none';
    Net.endMatch();
    if (restart && !Net.isOnline()) { DW.Input.lock(canvas); Net.startMatch(); return; }
    showScreen(Net.isOnline() ? 'lobby' : 'main');
  }
  DW.showScreen = showScreen;

  window.addEventListener('DOMContentLoaded', boot);
})();
