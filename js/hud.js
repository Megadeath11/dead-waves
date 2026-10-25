// In-game HUD, scoreboard, pause menu and game-over screen (HTML on top of the canvas).
'use strict';
(function () {
  const UI = DW.UI;
  const RED = [0.85, 0.12, 0.1], GOLD = [1.0, 0.82, 0.3], BONE = [0.93, 0.9, 0.82], DIM = [0.62, 0.6, 0.56];

  class Hud {
    constructor(world) {
      this.world = world;
      this.dmgAlpha = 0; this.hitT = 0; this.centerT = 0; this.shownWave = -1; this.pointsFlash = 0; this.dmgDirT = 0;
      const el = this.el = UI.el('div', 'hud');
      document.getElementById('ui').appendChild(el);
      el.innerHTML = `
        <div class="vignette"></div>
        <div class="scope"><div class="scope-h"></div><div class="scope-v"></div></div>
        <div class="dot"></div>
        <div class="hitmark">X</div>
        <div class="dmgdir"><svg viewBox="-80 -190 160 45" width="160" height="45"><polygon points="-70,-150 0,-185 70,-150 0,-165" /></svg></div>
        <div class="ammo-hint"></div>
        <div class="markers"></div>
        <div class="tl"><div class="wave"></div><div class="zcount"></div><div class="pu"></div></div>
        <div class="putimers"></div>
        <div class="revivein"><div class="rtext"></div><div class="ibar"><div class="fill"></div></div></div>
        <div class="bosses"></div>
        <div class="bl"><div class="team"></div><div class="perks"></div><div class="armor"><div class="armor-fill"></div><div class="armor-text"></div></div><div class="hp"><div class="hp-fill"></div><div class="hp-text"></div></div><div class="points">500</div><div class="popups"></div></div>
        <div class="br"><div class="weapon"></div><div class="ammo"></div><div class="nades"></div></div>
        <div class="interact"><div class="itext"></div><div class="ibar"><div class="fill"></div></div></div>
        <div class="centermsg"></div>
        <div class="down"></div>
        <div class="scoreboard panel"><div class="title">SCOREBOARD</div><table></table></div>
        <div class="clickhint">CLICK TO PLAY</div>`;
      const q = s => el.querySelector(s);
      this.vignette = q('.vignette'); this.scope = q('.scope'); this.dot = q('.dot'); this.hitmark = q('.hitmark');
      this.dmgDir = q('.dmgdir'); this.ammoHint = q('.ammo-hint'); this.waveL = q('.wave'); this.puL = q('.pu');
      this.bossBox = q('.bosses'); this.bossRows = [];
      this.hpFill = q('.hp-fill'); this.hpText = q('.hp-text');
      this.armorBox = q('.armor'); this.armorFill = q('.armor-fill'); this.armorText = q('.armor-text');
      this.critL = UI.el('div', 'crit', 'CRIT!');
      this.el.appendChild(this.critL);
      this.critT = 0;
      this.team = q('.team'); this.perksBox = q('.perks'); this.pointsL = q('.points'); this.popups = q('.popups');
      this.weaponL = q('.weapon'); this.ammoL = q('.ammo'); this.nadeL = q('.nades');
      this.interactL = q('.itext'); this.interactBar = q('.ibar'); this.interactFill = q('.ibar .fill');
      this.centerL = q(".centermsg"); this.downL = q('.down'); this.scorePanel = q('.scoreboard'); this.scoreTable = q('.scoreboard table');
      this.clickHint = q('.clickhint');
      this.zcount = q('.zcount'); this.puTimers = q('.putimers'); this.markersEl = q('.markers');
      this.reviveIn = q('.revivein'); this.reviveInText = q('.revivein .rtext'); this.reviveInFill = q('.revivein .fill');
      this.puBoxes = {};
      this.markerPool = [];
      this.pausePanel = null;
      this.overPanel = null;
      this.perkKey = '';
      this.cache = {};
    }

    set(node, key, text) {
      if (this.cache[key] !== text) { this.cache[key] = text; node.textContent = text; }
    }

    update(dt) {
      const w = this.world, p = w.player;
      this.dmgAlpha = DW.moveToward(this.dmgAlpha, 0, dt * 0.8);
      const low = 1 - DW.clamp(p.hp / p.maxHp, 0, 1);
      let va = DW.clamp(Math.max(this.dmgAlpha, p.hp < p.maxHp * 0.6 ? low * 0.8 : 0), 0, 1);
      if (p.downed) va = 0.85;
      this.vignette.style.opacity = va.toFixed(3);
      this.dmgDirT = Math.max(this.dmgDirT - dt * 1.2, 0);
      this.dmgDir.style.opacity = this.dmgDirT.toFixed(3);
      this.hitT = Math.max(this.hitT - dt * 4, 0);
      this.hitmark.style.opacity = this.hitT.toFixed(3);
      this.centerT -= dt;
      if (this.centerT <= 0) this.centerL.style.opacity = Math.max(0, +this.centerL.style.opacity - dt * 2).toFixed(3);
      this.pointsFlash = Math.max(this.pointsFlash - dt * 3, 0);
      this.pointsL.style.color = UI.rgb(UI.mix(BONE, RED, this.pointsFlash));

      // wave counter (tally for the first waves, number after)
      if (w.wave !== this.shownWave) {
        this.shownWave = w.wave;
        this.waveL.textContent = w.wave <= 0 ? '' : w.wave <= 5 ? 'I'.repeat(w.wave) : String(w.wave);
        this.waveL.classList.remove('flash');
        void this.waveL.offsetWidth;
        this.waveL.classList.add('flash');
      }
      const pu = [];
      if (w.state === 'intermission' && w.wave > 0 && !w.gameOver) {
        pu.push(`Next wave in ${Math.ceil(Math.max(w.stateT, 0))}`);
        const [n, of] = w.skipCount || [0, 1];
        if (w.stateT > 3) pu.push(w.mySkip ? `Skip vote sent (${n}/${of})` : `Press ENTER to skip${of > 1 ? ` (${n}/${of} ready)` : ''}`);
      }
      this.set(this.puL, 'pu', pu.join('\n'));

      this.set(this.pointsL, 'pts', String(p.points));
      this.updateCount();
      this.updateTimers();
      this.updateMarkers();
      this.updateReviveIn();
      const a = p.active(), wd = DW.WEAPONS[a.id];
      const tier = a.pap | 0;
      const gem = '\u25C6'.repeat(tier);
      this.set(this.weaponL, 'wep', (tier ? `${gem} ${wd.name} ${gem}  ${DW.PAP_NAMES[tier]}` : wd.name) + (p.reloading ? '   [RELOADING]' : ''));
      this.weaponL.style.color = ['', 'rgb(90, 255, 170)', 'rgb(110, 160, 255)', 'rgb(210, 130, 255)'][tier];
      this.set(this.ammoL, 'ammo', a.id === 'wind' ? `${a.mag} / ${DW.WIND_CHARGES}` : `${a.mag} / ${a.reserve}`);
      this.ammoL.style.color = UI.rgb(a.mag <= Math.floor(wd.mag / 4) ? RED : BONE);
      this.set(this.nadeL, 'nade', `Grenades: ${p.grenades} [G]    Wind: ${p.wind.mag}/${DW.WIND_CHARGES} [3]    Sentries: ${w.mySentries()}/${DW.SENTRY_MAX} [T] ${DW.SENTRY_COST}`);
      const lowMag = a.mag <= Math.max(1, Math.floor(wd.mag / 4));
      let hint = '';
      if (p.dead || p.reloading || a.id === 'wind') hint = '';
      else if (a.mag === 0 && a.reserve === 0) hint = 'NO AMMO';
      else if (lowMag && a.reserve > 0) hint = 'RELOAD  [R]';
      else if (lowMag) hint = 'LOW AMMO';
      this.set(this.ammoHint, 'hint', hint);
      this.ammoHint.style.color = UI.rgb(a.reserve === 0 ? RED : GOLD);

      // dot crosshair (hidden behind the sniper scope)
      const showDot = !p.dead && !this.scopeOn && !w.gameOver;
      this.dot.style.display = showDot ? 'block' : 'none';
      this.dot.classList.toggle('on-target', !!p.aimOnZombie);

      const pk = p.perks.join(',');
      if (pk !== this.perkKey) {
        this.perkKey = pk;
        this.perksBox.innerHTML = '';
        for (const perk of p.perks) {
          const pd = DW.PERKS[perk];
          const b = UI.el('div', 'perk', pd.icon || pd.name[0]);
          b.style.background = UI.rgb(pd.color);
          b.title = pd.name;
          this.perksBox.appendChild(b);
        }
      }

      const rows = w.teamRows(false);
      this.set(this.team, 'team', rows.map(r => `${r.name}   ${r.points}${r.down ? '  [DOWN]' : r.dead ? '  [DEAD]' : ''}`).join('\n'));

      let down = '';
      if (w.gameOver) down = '';
      else if (p.downed) {
        if (p.selfReviveT > 0) down = `Second Wind... getting up in ${Math.ceil(p.selfReviveT)}`;
        else down = !w.solo ? `YOU ARE DOWN\nA teammate can revive you - bleed out in ${Math.ceil(p.bleedT)}` : 'YOU ARE DOWN';
      } else if (p.dead) down = 'Spectating - you respawn at the start of the next wave';
      this.set(this.downL, 'down', down);

      // player health bar
      const hpf = p.dead ? 0 : DW.clamp(p.hp / p.maxHp, 0, 1);
      this.hpFill.style.width = (hpf * 100).toFixed(1) + '%';
      this.hpFill.style.background = p.downed ? 'rgb(120,20,15)' : hpf > 0.6 ? 'rgb(90,200,90)' : hpf > 0.3 ? 'rgb(230,180,50)' : 'rgb(220,40,30)';
      this.set(this.hpText, 'hp', p.downed ? 'DOWN' : p.dead ? '' : `${Math.ceil(p.hp)} / ${p.maxHp}`);
      this.armorBox.style.display = p.armor > 0 ? 'block' : 'none';
      if (p.armor > 0) {
        this.armorFill.style.width = (p.armor / DW.ARMOR_MAX * 100).toFixed(1) + '%';
        this.set(this.armorText, 'ar', `ARMOR ${Math.ceil(p.armor)}`);
      }
      this.critT = Math.max(this.critT - dt * 2.5, 0);
      this.critL.style.opacity = this.critT.toFixed(2);

      // one bar per boss alive
      const bosses = w.bosses();
      while (this.bossRows.length < bosses.length) {
        const row = UI.el('div', 'boss');
        row.innerHTML = '<div class="boss-name"></div><div class="bar"><div class="fill"></div><div class="boss-pct"></div></div>';
        this.bossBox.appendChild(row);
        this.bossRows.push({ row, name: row.querySelector('.boss-name'), fill: row.querySelector('.fill'), pct: row.querySelector('.boss-pct') });
      }
      while (this.bossRows.length > bosses.length) this.bossRows.pop().row.remove();
      bosses.forEach((b, i) => {
        const r = this.bossRows[i];
        const name = (DW.BOSS_NAMES[b.ztype] || 'BOSS') + (b.hpFrac <= 0.5 ? '  -  ENRAGED' : '');
        if (r.name.textContent !== name) r.name.textContent = name;
        r.fill.style.width = (b.hpFrac * 100).toFixed(1) + '%';
        r.fill.classList.toggle('enraged', b.hpFrac <= 0.5);
        r.pct.textContent = Math.ceil(b.hpFrac * 100) + '%';
      });

      const showScore = DW.Input.action('scoreboard') && !w.gameOver;
      this.scorePanel.style.display = showScore ? 'block' : 'none';
      if (showScore) this.fillScoreboard(this.scoreTable);
      this.clickHint.style.display = !DW.Input.locked && !this.pausePanel && !w.gameOver && !DW.botActive ? 'block' : 'none';
    }

    // zombies left this round
    updateCount() {
      const w = this.world;
      const rem = w.remaining(), tot = w.waveTotal;
      const show = w.state === 'wave' && tot > 0 && !w.gameOver;
      const txt = !show ? '' : rem === 1 ? 'LAST ZOMBIE' : `ZOMBIES  ${rem} / ${tot}`;
      this.set(this.zcount, 'zc', txt);
      this.zcount.classList.toggle('last', show && rem === 1);
    }

    // big power-up timers (bottom centre) that drain and flash when nearly out
    updateTimers() {
      const w = this.world;
      const items = [
        { key: 'insta', on: w.instaT > 0, t: w.instaT, label: 'INSTA-KILL', icon: '!', color: [0.9, 0.2, 0.2] },
        { key: 'double', on: w.doubleT > 0, t: w.doubleT, label: 'DOUBLE POINTS', icon: 'x2', color: [1.0, 0.85, 0.2] },
      ];
      for (const it of items) {
        let b = this.puBoxes[it.key];
        if (it.on && !b) {
          const el = UI.el('div', 'putimer');
          el.innerHTML = `<div class="puicon">${it.icon}</div><div class="puinfo"><div class="pulabel">${it.label}</div><div class="putime"></div><div class="pubar"><div class="pufill"></div></div></div>`;
          el.style.setProperty('--pc', UI.rgb(it.color));
          this.puTimers.appendChild(el);
          b = this.puBoxes[it.key] = { el, time: el.querySelector('.putime'), fill: el.querySelector('.pufill') };
        }
        if (!it.on && b) { b.el.remove(); delete this.puBoxes[it.key]; continue; }
        if (!b) continue;
        b.time.textContent = Math.ceil(it.t) + 's';
        b.fill.style.width = (DW.clamp(it.t / 30, 0, 1) * 100).toFixed(1) + '%';
        b.el.classList.toggle('ending', it.t < 5);
      }
    }

    // screen markers: downed teammates (with revive state) and the last zombie, shown through walls
    updateMarkers() {
      const w = this.world, p = w.player, cam = p.camera;
      const ui = document.getElementById('ui');
      const W = parseFloat(ui.style.width) || 1600, H = parseFloat(ui.style.height) || 900;
      const list = [];
      for (const r of w.remotes.values()) {
        if (!r.down || r.dead) continue;
        const reviving = r.reviveAt !== undefined && w.elapsed - r.reviveAt < 0.4;
        const sub = reviving ? `REVIVING ${Math.round((r.reviveP || 0) * 100)}%` : `${Math.max(0, Math.ceil(r.bleedT || 0))}s - hold E to revive`;
        list.push({ x: r.posV.x, y: r.posV.y + 1.1, z: r.posV.z, icon: '+', text: `${r.name} DOWN`, sub, cls: reviving ? 'mk-revive' : 'mk-down' });
      }
      if (w.state === 'wave' && w.remaining() === 1 && w.zombies.size === 1) {
        const z = w.zombies.values().next().value;
        if (z && !z.dead) list.push({ x: z.pos.x, y: z.pos.y + 2.1 * z.s, z: z.pos.z, icon: '!', text: 'LAST ZOMBIE', sub: '', cls: 'mk-last' });
      }
      while (this.markerPool.length < list.length) {
        const el = UI.el('div', 'marker');
        el.innerHTML = '<div class="mk-icon"></div><div class="mk-text"></div><div class="mk-sub"></div><div class="mk-dist"></div>';
        this.markersEl.appendChild(el);
        this.markerPool.push({ el, icon: el.querySelector('.mk-icon'), text: el.querySelector('.mk-text'), sub: el.querySelector('.mk-sub'), dist: el.querySelector('.mk-dist') });
      }
      const v = new THREE.Vector3();
      this.markerPool.forEach((m, i) => {
        const it = list[i];
        if (!it) { m.el.style.display = 'none'; return; }
        m.el.style.display = '';
        m.el.className = 'marker ' + it.cls;
        v.set(it.x, it.y, it.z).project(cam);
        let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        const behind = v.z > 1;
        if (behind) { x = W - x; y = H - 60; }
        const edge = behind || x < 40 || x > W - 40 || y < 70 || y > H - 40;
        x = DW.clamp(x, 40, W - 40);
        y = DW.clamp(y, 70, H - 40);
        m.el.style.left = x.toFixed(0) + 'px';
        m.el.style.top = y.toFixed(0) + 'px';
        m.el.classList.toggle('edge', edge);
        if (m.icon.textContent !== it.icon) m.icon.textContent = it.icon;
        if (m.text.textContent !== it.text) m.text.textContent = it.text;
        if (m.sub.textContent !== it.sub) m.sub.textContent = it.sub;
        const d = Math.round(Math.hypot(it.x - p.pos.x, it.z - p.pos.z)) + 'm';
        if (m.dist.textContent !== d) m.dist.textContent = d;
      });
    }

    // someone is holding E on us
    updateReviveIn() {
      const w = this.world, ri = w.reviveIn;
      const on = w.player.downed && ri && w.elapsed - ri.t < 0.4;
      this.reviveIn.style.display = on ? 'block' : 'none';
      if (on) {
        this.set(this.reviveInText, 'ri', `${DW.Net.persona(ri.by)} is reviving you`);
        this.reviveInFill.style.width = (DW.clamp(ri.p, 0, 1) * 100).toFixed(1) + '%';
      }
    }

    // Tab board: everyone in the match with their stats and ping to the host
    fillScoreboard(table) {
      const w = this.world;
      const rows = w.teamRows(true);
      if (table === this.scoreTable) {
        const title = this.scorePanel.querySelector('.title');
        const t = `PLAYERS ONLINE  ${rows.length}/4`;
        if (title.textContent !== t) title.textContent = t;
        const sub = `${w.mapName()}  -  ${DW.diff().name}  -  Wave ${w.wave}  -  ${DW.fmtTime(w.elapsed)}`;
        if (!this.scoreSub) { this.scoreSub = UI.el('div', 'dim sub'); title.after(this.scoreSub); }
        if (this.scoreSub.textContent !== sub) this.scoreSub.textContent = sub;
      }
      const ping = r => {
        if (r.ping === -1) return '<span class="host">HOST</span>';
        if (r.ping === null || r.ping === undefined || !w.online) return '<span class="dim">-</span>';
        const cls = r.ping < 80 ? 'good' : r.ping < 150 ? 'ok' : 'bad';
        return `<span class="${cls}">${r.ping} ms</span>`;
      };
      let html = '<tr class="head"><td>Player</td><td>Money</td><td>Earned</td><td>Kills</td><td>Headshots</td><td>Revives</td><td>Downs</td><td>Bosses</td><td>Sentries</td><td>Ping</td></tr>';
      for (const r of rows) {
        const hsPct = r.kills > 0 ? Math.round(r.hs / r.kills * 100) : 0;
        const st = r.dead ? ' <span class="bad">DEAD</span>' : r.down ? ' <span class="bad">DOWN</span>' : '';
        html += `<tr${r.me ? ' class="me"' : ''}><td>${UI.esc(r.name)}${st}</td><td class="money">${r.points}</td><td>${r.earned}</td><td>${r.kills}</td>` +
          `<td>${r.hs} <span class="dim">(${hsPct}%)</span></td><td>${r.revives}</td><td>${r.downs}</td><td>${r.bosses}</td><td>${r.sentries}/${DW.SENTRY_MAX}</td><td>${ping(r)}</td></tr>`;
      }
      table.innerHTML = html;
    }

    // ---------------------------------------------------------------- events
    damageDir(angle) { this.dmgDir.style.transform = `rotate(${angle}rad)`; this.dmgDirT = 1; }
    setInteract(text, progress, affordable = true) {
      this.set(this.interactL, 'it', text);
      this.interactL.style.color = UI.rgb(affordable ? BONE : [1.0, 0.45, 0.4]);
      this.interactBar.style.display = progress > 0 ? 'block' : 'none';
      this.interactFill.style.width = (progress * 100).toFixed(1) + '%';
    }
    centerMsg(text, color = RED, dur = 2.5) {
      this.centerL.textContent = text;
      this.centerL.style.color = UI.rgb(color);
      this.centerL.style.opacity = '1';
      this.centerT = dur;
    }
    hitMarker(head, kill = false, crit = false) {
      this.hitT = 1;
      this.hitmark.style.color = UI.rgb(kill ? RED : crit ? [1.0, 0.55, 0.1] : head ? GOLD : [1, 1, 1]);
      if (crit) this.critT = 1;
    }
    flashDamage(d) { this.dmgAlpha = DW.clamp(this.dmgAlpha + d / 60, 0, 1); }
    flashPoints() { this.pointsFlash = 1; }
    popupPoints(n) {
      if (!n) return;
      const l = UI.el('div', 'popup', n > 0 ? '+' + n : String(n));
      l.style.left = (170 + DW.randf(-10, 30)) + 'px';
      this.popups.appendChild(l);
      setTimeout(() => l.remove(), 950);
    }
    scopeVisible(on) {
      this.scopeOn = on;
      this.scope.style.display = on ? 'block' : 'none';
    }

    // ---------------------------------------------------------------- pause
    isPaused() { return !!this.pausePanel; }
    openPause() {
      const w = this.world;
      if (w.gameOver || this.pausePanel) return;
      const pp = this.pausePanel = UI.el('div', 'overlay dim');
      const panel = UI.el('div', 'panel center-panel');
      pp.appendChild(panel);
      panel.appendChild(UI.el('div', 'h1 c', w.solo ? 'PAUSED' : 'MENU'));
      if (!w.solo) panel.appendChild(UI.el('div', 'dim c', 'The game keeps running in co-op.'));
      panel.appendChild(UI.settingsPanel());
      const row = UI.el('div', 'col center');
      row.appendChild(UI.button('Resume', () => this.resume()));
      row.appendChild(UI.button('Quit to menu', () => w.quitMatch()));
      panel.appendChild(row);
      this.el.appendChild(pp);
      w.setPaused(true);
    }
    // Pause closes once the mouse is captured again (see main.js pointer-lock handling).
    resume() { DW.Input.lock(document.getElementById('game')); }
    closePause() {
      if (this.pausePanel) { this.pausePanel.remove(); this.pausePanel = null; }
      this.world.setPaused(false);
    }

    showGameOver(title, run, hostCanRestart, newBest) {
      const w = this.world;
      if (this.pausePanel) { this.pausePanel.remove(); this.pausePanel = null; }
      this.scorePanel.style.display = 'none';
      this.setInteract('', 0);
      this.set(this.downL, 'down', '');
      DW.Input.unlock();
      const op = this.overPanel = UI.el('div', 'overlay red');
      const panel = UI.el('div', 'panel center-panel');
      op.appendChild(panel);
      panel.appendChild(UI.el('div', 'h0 c', 'GAME OVER'));
      panel.appendChild(UI.el('div', 'h3 c', title));
      panel.appendChild(UI.el('div', 'dim c', `${w.mapName()}  -  ${DW.diff().name}  -  ${DW.fmtTime(run.time)}`));
      const t = UI.el('table', 'scores');
      this.fillScoreboard(t);
      panel.appendChild(t);
      if (newBest && run.wave > 0) panel.appendChild(UI.el('div', 'gold c h3', 'NEW PERSONAL BEST!'));
      const row = UI.el('div', 'row center');
      row.appendChild(UI.button(DW.Net.isOnline() ? 'Back to lobby' : 'Main menu', () => w.quitMatch()));
      if (!DW.Net.isOnline()) row.appendChild(UI.button('Play again', () => w.restartSolo()));
      panel.appendChild(row);
      this.el.appendChild(op);
    }

    dispose() { this.el.remove(); }
  }
  DW.Hud = Hud;
})();
