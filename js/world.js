// A running match. The host (or a solo player) simulates zombies and waves;
// everyone simulates their own player and reports hits to the host.
'use strict';
(function () {
  const M = DW.Models, Net = DW.Net, Sfx = DW.Sfx;
  const MAX_ALIVE = 24;
  const SNAP_RATE = 1 / 15;
  const PSTATE_RATE = 1 / 20;
  const PU_TYPES = ['max_ammo', 'double', 'insta', 'nuke'];
  const PU_INFO = {
    max_ammo: { name: 'MAX AMMO', color: [0.3, 0.9, 0.3], letter: 'A' },
    double: { name: 'DOUBLE POINTS', color: [1.0, 0.85, 0.2], letter: 'x2' },
    insta: { name: 'INSTA-KILL', color: [0.9, 0.2, 0.2], letter: '!' },
    nuke: { name: 'NUKE', color: [1.0, 0.55, 0.1], letter: 'N' },
  };
  const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
  const arr = v => [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

  class World {
    constructor(cfg, renderer) {
      this.cfg = cfg;
      this.renderer = renderer;
      this.mapId = DW.Maps.MAPS[cfg.map] ? cfg.map : 'outpost';
      DW.mapId = this.mapId;
      DW.diffId = cfg.diff | 0;
      this.diff = DW.diff();
      this.online = Net.isOnline();
      this.host = Net.isHost();
      const ids = (cfg.players || [Net.myId]).slice().sort();
      this.solo = ids.length <= 1;
      this.mapDef = DW.Maps.MAPS[this.mapId];

      this.remotes = new Map();
      this.zombies = new Map();
      this.corpses = [];
      this.deadIds = new Set();
      this.nextZid = 1;
      this.wave = 0;
      this.state = 'intermission';
      this.stateT = 4.0;
      this.toSpawn = 0;
      this.spawnT = 0;
      this.bossQueue = [];
      this.openZones = new Set([0]);
      this.doubleT = 0;
      this.instaT = 0;
      this.powerups = new Map();
      this.nextPu = 1;
      this.dropsThisWave = 0;
      this.gameOver = false;
      this.elapsed = 0;
      this.snapT = 0;
      this.pstateT = 0;
      this.aoes = [];
      this.fx = [];        // timed visual effects {t, update(dt)->bool}
      this.grenadesLive = [];
      this.winds = [];
      this.boxState = 'idle';
      this.boxRollT = 0;
      this.boxChoice = '';
      this.boxSwapT = 0;
      this.boxHolder = null;
      this.paused = false;
      this.relocations = 0;
      this.myGraceT = 0;
      this.skipVotes = new Set();
      this.skipCount = [0, 1];
      this.mySkip = false;
      this.sentries = [];
      this.sentrySeq = 1;
      this.goonSeen = new Set();
      this.goonIntro = null;
      this.flicker = 0;
      this.camShake = 0;
      this.scare = 0;
      this.myPing = 0;
      this.pingT = 0;
      this.waveTotal = 0;
      this.remainingNet = 0;
      this.reviveIn = null; // {by, p, t} someone reviving us
      this.reviveSendT = 0;
      this.navT = 0;

      this.scene = new THREE.Scene();
      this.buildEnvironment();
      this.info = DW.Maps.build(this.mapId, this.scene);
      this.phys = this.info.phys;
      this.nav = this.info.nav;
      this.buildFx();

      this.player = new DW.Player(this);
      const spawns = this.info.player_spawns;
      const slot = Math.max(ids.indexOf(Net.myId), 0);
      this.player.pos.fromArray(spawns[slot % spawns.length]);
      this.player.yaw = Math.PI;
      this.scene.add(this.player.camera);
      this.hud = new DW.Hud(this);
      for (const id of ids) if (id !== Net.myId) this.ensureRemote(id);

      this.onPacket = (s, t, d) => this.handlePacket(s, t, d);
      this.onPlayerLeft = id => this.playerLeft(id);
      this.onHostLeft = () => this.endGame('The host left the game.');
      Net.on('packet', this.onPacket);
      Net.on('player_left', this.onPlayerLeft);
      Net.on('host_left', this.onHostLeft);
      Sfx.startMusic(-14);
      this.hud.centerMsg(`${this.mapName().toUpperCase()}\n${this.diff.name}`, [0.9, 0.85, 0.75], 3.5);
      this.computeNav();
    }

    mapName() { return this.mapDef.name; }

    buildEnvironment() {
      const def = this.mapDef, s = this.scene;
      s.background = M.color(def.sky);
      s.fog = new THREE.FogExp2(M.color(def.fog), def.fog_density);
      this.ambient = new THREE.AmbientLight(M.color(def.ambient), def.ambient_energy * 1.35);
      s.add(this.ambient);
      this.baseFog = { color: M.color(def.fog), density: def.fog_density };
      this.darkness = 0;
      if (def.moon > 0) {
        const moon = new THREE.DirectionalLight(M.color([0.6, 0.7, 1.0]), def.moon);
        // Godot rotation (-55, 35, 0) degrees: light travels along -Z of that basis
        const e = new THREE.Euler(-55 * Math.PI / 180, 35 * Math.PI / 180, 0, 'YXZ');
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
        moon.position.copy(dir).multiplyScalar(-40);
        moon.target.position.set(0, 0, 0);
        const ss = DW.SHADOW_SIZES[DW.settings.shadows] || 0;
        moon.castShadow = ss > 0;
        moon.shadow.mapSize.set(ss || 1024, ss || 1024);
        const sc = moon.shadow.camera;
        sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 100;
        moon.shadow.bias = -0.0006;
        moon.shadow.normalBias = 0.03;
        s.add(moon);
        s.add(moon.target);
        this.moon = moon;
      }
      // fixed pool of point lights (changing the light count would recompile every shader,
      // so the Lamp lights setting only takes effect on the next match)
      this.lampLights = [];
      const nLamps = DW.clamp(DW.settings.lights | 0, 2, 8);
      for (let i = 0; i < nLamps; i++) {
        const l = new THREE.PointLight(0xffffff, 0, 10, 1.3);
        s.add(l);
        this.lampLights.push(l);
      }
      this.muzzleLight = new THREE.PointLight(0xffcc73, 0, 6, 1.5);
      this.boomLight = new THREE.PointLight(0xff9a4d, 0, 10, 1.5);
      this.puLights = [new THREE.PointLight(0xffffff, 0, 4, 1.3), new THREE.PointLight(0xffffff, 0, 4, 1.3)];
      this.remoteLight = new THREE.PointLight(0xffcc73, 0, 6, 1.5); // teammates' muzzle flashes
      this.darkLight = new THREE.PointLight(0x8fb4ff, 0, 7, 1.6);     // faint glow around you when the lights are out
      this.goonLight = new THREE.PointLight(0xcfe6ff, 0, 6, 1.5);     // cold light on the Goon Lord's face
      s.add(this.darkLight, this.goonLight);
      s.add(this.muzzleLight, this.boomLight, this.remoteLight, ...this.puLights);
    }

    // live graphics changes from the settings menu (shadow quality; the renderer side is in main.js)
    applyGraphics() {
      const m = this.moon;
      if (!m) return;
      const ss = DW.SHADOW_SIZES[DW.settings.shadows] || 0;
      if (m.castShadow !== ss > 0 || (ss && m.shadow.mapSize.x !== ss)) {
        m.castShadow = ss > 0;
        if (ss) m.shadow.mapSize.set(ss, ss);
        if (m.shadow.map) { m.shadow.map.dispose(); m.shadow.map = null; }
      }
    }

    buildFx() {
      // particles: one instanced mesh of little cubes
      this.pMax = 1500;
      const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
      this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), pm, this.pMax);
      this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.pMesh.setColorAt(0, _c.set(0xffffff));
      this.pMesh.count = 0;
      this.pMesh.frustumCulled = false;
      this.scene.add(this.pMesh);
      this.particles = [];
      // tracers
      this.tracerPool = [];
      this.tracerMats = {
        bullet: new THREE.MeshBasicMaterial({ color: M.color([1.0, 0.85, 0.5]), fog: false }),
        plasma: new THREE.MeshBasicMaterial({ color: M.color([0.4, 1.0, 0.5]), fog: false }),
      };
    }

    // ---------------------------------------------------------------- lights each frame
    updateLights(dt) {
      const cam = this.player.camera.position;
      // the Goon Lord puts out almost every light while it lives
      const goon = [...this.zombies.values()].some(z => z.ztype === 'goonlord' && !z.dead) || (this.goonIntro && this.goonIntro.t >= 2.6);
      this.darkness = DW.moveToward(this.darkness, goon ? 1 : 0, dt * (goon ? 3 : 0.8));
      const flick = this.flicker > 0;
      const dk = this.darkness, def = this.mapDef;
      this.ambient.intensity = def.ambient_energy * 1.35 * (1 - 0.8 * dk);
      if (this.moon) this.moon.intensity = def.moon * (1 - 0.9 * dk);
      this.scene.fog.density = this.baseFog.density * (1 + 1.4 * dk);
      this.scene.fog.color.copy(this.baseFog.color).multiplyScalar(1 - 0.85 * dk);
      this.scene.background.copy(M.color(def.sky)).multiplyScalar(1 - 0.9 * dk);
      this.darkLight.position.set(cam.x, cam.y + 0.3, cam.z);
      this.darkLight.intensity = 0.7 * dk;
      this.player.vmAmbient.intensity = this.player.vmAmbientBase * (1 - 0.7 * dk);
      const lamps = this.info.lamps;
      const scored = lamps.map(l => [(l.pos[0] - cam.x) ** 2 + (l.pos[1] - cam.y) ** 2 + (l.pos[2] - cam.z) ** 2, l]);
      scored.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < this.lampLights.length; i++) {
        const L = this.lampLights[i], e = scored[i];
        if (!e) { L.intensity = 0; continue; }
        const l = e[1];
        L.position.fromArray(l.pos);
        L.color.copy(M.color(l.color));
        L.distance = l.range;
        // fade out the farthest pooled light so swaps aren't visible
        const fade = i >= this.lampLights.length - 2 ? 0.6 : 1;
        // in the dark only the nearest lamp survives, and it flickers
        const flicker = i === 0 ? (Math.sin(this.elapsed * 23) * Math.sin(this.elapsed * 7.3) > 0.3 ? 0.15 : 0.6) : 0.04;
        L.intensity = l.energy * fade * (1 - dk + dk * flicker);
        // the build-up before the Goon Lord: every lamp strobes and stutters
        if (flick) L.intensity *= Math.random() < 0.45 ? 0.02 : 1.4;
      }
      if (flick) this.ambient.intensity *= Math.random() < 0.3 ? 0.3 : 1;
      const gl = [...this.zombies.values()].find(z => z.ztype === 'goonlord' && !z.dead && z.riseT <= 0);
      if (gl) {
        gl.rig.head.getWorldPosition(_b);
        this.goonLight.position.set(_b.x - Math.sin(gl.yaw) * 1.1, _b.y + 0.2, _b.z - Math.cos(gl.yaw) * 1.1);
        this.goonLight.intensity = 1.6;
      } else this.goonLight.intensity = 0;
      const p = this.player;
      p.forward(_a);
      this.muzzleLight.position.set(cam.x + _a.x * 1.0, cam.y - 0.1 + _a.y, cam.z + _a.z * 1.0);
      this.muzzleLight.intensity = p.flashEnergy;
      this.muzzleLight.color.set(p.active().id === 'plasma' ? 0x4dff80 : 0xffcc73);
      this.boomLight.intensity = DW.moveToward(this.boomLight.intensity, 0, dt * 20);
      this.remoteLight.intensity = DW.moveToward(this.remoteLight.intensity, 0, dt * 60);
      // nearest power-ups get the two glow lights
      const pus = [...this.powerups.values()].sort((a, b) => a.node.position.distanceToSquared(cam) - b.node.position.distanceToSquared(cam));
      this.puLights.forEach((L, i) => {
        const pu = pus[i];
        if (!pu || !pu.node.visible) { L.intensity = 0; return; }
        L.position.copy(pu.node.position);
        L.color.copy(M.color(PU_INFO[pu.type].color));
        L.intensity = 2.0;
      });
    }

    setPaused(on) {
      this.paused = on;
      this.player.inputEnabled = !on;
    }

    // ---------------------------------------------------------------- main loop
    update(dt) {
      this.hud.update(dt);
      if (this.gameOver) {
        this.updateFx(dt);
        return;
      }
      if (this.paused && this.solo) return; // solo pause freezes the match
      this.elapsed += dt;
      M.tickPap(this.elapsed);
      this.doubleT = Math.max(this.doubleT - dt, 0);
      this.instaT = Math.max(this.instaT - dt, 0);
      this.myGraceT = Math.max(this.myGraceT - dt, 0);
      this.player.update(dt);
      Sfx.setListener(this.player.camera.position.x, this.player.camera.position.y, this.player.camera.position.z, this.player.yaw);
      if (this.host) this.hostTick(dt);
      for (const z of this.zombies.values()) z.update(dt);
      this.corpses = this.corpses.filter(z => z.updateDeath(dt));
      this.updateRemotes(dt);
      this.updatePowerups(dt);
      this.updateBox(dt);
      this.updateGrenades(dt);
      this.updateWinds(dt);
      this.updateLifts(dt);
      this.updateSentries(dt);
      this.updatePing(dt);
      this.updateGoonFx(dt);
      this.updateFx(dt);
      if (DW.Input.justPressed('skip')) this.voteSkip();
      if (this.online) {
        this.pstateT -= dt;
        if (this.pstateT <= 0) { this.pstateT = PSTATE_RATE; this.sendPstate(false); }
      }
    }

    render() {
      this.updateLights(1 / 60);
      const r = this.renderer;
      r.autoClear = true;
      r.render(this.scene, this.player.camera);
      if (this.player.gunRoot.visible && !this.player.dead) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.player.vmScene, this.player.vmCamera);
        r.autoClear = true;
      }
    }

    resize(w, h) {
      for (const c of [this.player.camera, this.player.vmCamera]) { c.aspect = w / h; c.updateProjectionMatrix(); }
    }

    computeNav() {
      const targets = this.allPlayers('target').map(p => [p.pos.x, p.pos.z]);
      if (targets.length) this.nav.compute(targets);
    }

    // every living player's aim (eye + direction), so Dodgers know when they're in someone's sights
    buildAims() {
      const out = [], p = this.player;
      if (!p.downed && !p.dead) out.push([p.eye(new THREE.Vector3()), p.forward(new THREE.Vector3())]);
      for (const r of this.remotes.values()) {
        if (r.down || r.dead || r.stale > 5) continue;
        const cp = Math.cos(r.pitch);
        out.push([new THREE.Vector3(r.pos[0], r.pos[1] + 1.6, r.pos[2]), new THREE.Vector3(-Math.sin(r.yaw) * cp, Math.sin(r.pitch), -Math.cos(r.yaw) * cp)]);
      }
      return out;
    }

    hostTick(dt) {
      this.aims = this.buildAims();
      this.navT -= dt;
      if (this.navT <= 0) { this.navT = 0.25; this.computeNav(); }
      if (this.state === 'intermission') {
        this.stateT -= dt;
        if (this.stateT <= 0) this.startWave();
      } else if (this.state === 'wave') {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.zombies.size < MAX_ALIVE && (this.toSpawn > 0 || this.bossQueue.length)) {
          const n = this.playerCount();
          this.spawnT = Math.max(0.35, 2.0 - this.wave * 0.08) / (1 + 0.3 * (n - 1));
          if (this.bossQueue.length) {
            this.spawnZombie(this.bossQueue.shift(), this.pickSpawn());
            this.spawnT = 2.5;
          } else {
            this.toSpawn -= 1;
            const runnerChance = DW.clamp((this.wave - 3) * 0.12, 0, 0.8);
            const dodgerChance = DW.clamp((this.wave - DW.DODGER_WAVE + 1) * 0.03, 0, 0.2);
            this.spawnZombie(Math.random() < dodgerChance ? 'dodger' : Math.random() < runnerChance ? 'runner' : 'walker', this.pickSpawn());
          }
        }
        if (this.toSpawn <= 0 && !this.bossQueue.length && this.zombies.size === 0) {
          this.state = 'intermission';
          this.stateT = DW.INTERMISSION;
          Net.sendAll('wave_end', { n: this.wave });
          this.onWaveEnd();
        }
      }
      // delayed area attacks
      for (const a of this.aoes.slice()) {
        a.t -= dt;
        if (a.t <= 0) {
          this.aoes.splice(this.aoes.indexOf(a), 1);
          for (const pl of this.allPlayers('alive'))
            if (Math.hypot(pl.pos.x - a.pos[0], pl.pos.z - a.pos[2]) <= a.r && Math.abs(pl.pos.y - a.pos[1]) < 3) this.damagePlayer(pl.id, a.dmg, a.pos);
        }
      }
      if (this.online) {
        this.snapT -= dt;
        if (this.snapT <= 0) { this.snapT = SNAP_RATE; this.sendSnapshot(); }
      }
      if (this.wave > 0) {
        const anyUp = this.allPlayers('all').some(pl => !pl.out && !pl.dead);
        if (!anyUp) this.endGame(`Everyone went down on wave ${this.wave}.`);
      }
    }

    playerCount() { return 1 + this.remotes.size; }

    // zombies left this round (not spawned yet + alive); clients get it from the host's snapshot
    remaining() {
      if (!this.host) return this.state === 'wave' ? this.remainingNet || 0 : 0;
      return this.state === 'wave' ? this.toSpawn + this.bossQueue.length + this.zombies.size : 0;
    }

    // ---------------------------------------------------------------- waves
    static zombieHp(w) { return w < 10 ? 150 + 100 * (w - 1) : 950 * Math.pow(1.1, w - 9); }

    startWave() {
      this.wave += 1;
      this.dropsThisWave = 0;
      const n = this.playerCount();
      const base = Math.round(5 + this.wave * 2.6 + 0.09 * this.wave * this.wave);
      this.toSpawn = Math.floor(base * (1 + 0.6 * (n - 1)));
      this.bossQueue = [];
      const every = this.diff.boss_every;
      if (this.wave >= DW.GOON_WAVE && (this.wave - DW.GOON_WAVE) % 10 === 0) {
        this.bossQueue.push('goonlord');
        this.toSpawn = Math.floor(this.toSpawn * 0.5);
      } else if (this.wave % every === 0) {
        const bi = this.wave / every;
        this.bossQueue.push(bi % 2 === 1 ? 'brute' : 'spitter');
        if (bi >= 3) this.bossQueue.push(bi % 2 === 1 ? 'spitter' : 'brute');
        this.toSpawn = Math.floor(this.toSpawn * 0.5);
      }
      this.state = 'wave';
      this.spawnT = 2.5;
      this.waveTotal = this.toSpawn + this.bossQueue.length;
      const boss = this.bossQueue.length > 0;
      const goon = this.bossQueue.includes('goonlord');
      Net.sendAll('wave', { n: this.wave, boss, goon });
      this.onWaveStart(this.wave, boss, goon);
    }

    onWaveStart(n, boss, goon) {
      this.wave = n;
      this.state = 'wave';
      Sfx.play('wave_start', 2);
      if (goon) this.startGoonIntro(n);
      else if (boss) this.hud.centerMsg(`WAVE ${n}\nBOSS INCOMING`, [1.0, 0.2, 0.15], 3.5);
      else this.hud.centerMsg(`WAVE ${n}`, [0.85, 0.1, 0.08], 2.5);
      if (this.player.dead) this.player.respawn(this.respawnPoint());
      if (n === DW.BOX_UNLOCK_WAVE && this.info.boxes.length) {
        DW.Models.setLabel(this.info.boxes[0].label, 'MYSTERY BOX  ' + DW.BOX_COST, [0.6, 0.85, 1.0]);
        this.hud.centerMsg(boss ? `WAVE ${n}
BOSS INCOMING
Mystery Box open` : `WAVE ${n}
The Mystery Box is open`, boss ? [1.0, 0.2, 0.15] : [0.6, 0.85, 1.0], 3.5);
      }
      // two free grenades a round, up to 4 (never takes away ones you bought)
      if (this.player.grenades < 4) this.player.grenades = Math.min(this.player.grenades + 2, 4);
      this.skipVotes = new Set();
      this.mySkip = false;
    }

    // ---------------------------------------------------------------- skip the wait between rounds
    // Everyone presses Enter; when every player has voted the next round starts in 3 seconds.
    voteSkip() {
      if (this.state !== 'intermission' || this.wave === 0 || this.mySkip || this.gameOver) return;
      this.mySkip = true;
      Sfx.play('buy', -4, 1.3);
      if (this.host) this.addSkipVote(Net.myId);
      else Net.sendHost('skip', {});
    }

    addSkipVote(id) {
      if (this.state !== 'intermission') return;
      this.skipVotes.add(id);
      const need = this.playerCount();
      this.skipCount = [this.skipVotes.size, need];
      if (this.skipVotes.size >= need && this.stateT > 3) this.stateT = 3;
      Net.sendAll('skipv', { n: this.skipVotes.size, of: need, t: this.stateT });
    }

    // ---------------------------------------------------------------- elevators & turrets
    useLift(i, target) {
      this.setLift(i, target);
      Net.sendAll('lift', { i, t: target });
    }

    setLift(i, target) {
      const lf = this.info.lifts[i];
      if (!lf || Math.abs(lf.target - target) < 0.01 && !lf.moving && Math.abs(lf.y - target) < 0.01) return;
      lf.target = target;
      lf.moving = true;
      Sfx.play3d('door', [lf.pos[0], lf.y + 0.5, lf.pos[2]], -2, 1.4);
    }

    updateLifts(dt) {
      for (const lf of this.info.lifts) {
        if (!lf.moving) continue;
        lf.y = DW.moveToward(lf.y, lf.target, dt * 1.2);
        if (lf.y === lf.target) lf.moving = false;
        lf.box.min[1] = lf.y - 0.2;
        lf.box.max[1] = lf.y;
        lf.root.position.y = lf.y;
      }
    }

    // ---------------------------------------------------------------- sentries (T to place)
    mySentries() { return this.sentries.filter(s => s.owner === Net.myId).length; }

    // Place a sentry just in front of you: SENTRY_COST each, up to SENTRY_MAX of yours at once.
    placeSentry() {
      const p = this.player;
      if (!p.alive() || this.gameOver) return;
      if (this.mySentries() >= DW.SENTRY_MAX) {
        this.hud.centerMsg(`You already have ${DW.SENTRY_MAX} sentries out`, [1.0, 0.5, 0.4], 1.5);
        DW.Sfx.play('deny');
        return;
      }
      if (!p.onFloor) return;
      const f = p.forward(new THREE.Vector3());
      const fl = Math.hypot(f.x, f.z) || 1;
      const pos = [p.pos.x + f.x / fl * 1.2, p.pos.y, p.pos.z + f.z / fl * 1.2];
      // needs open floor at the same height: no wall in the way, no drop
      const eye = new THREE.Vector3(p.pos.x, p.pos.y + 0.6, p.pos.z);
      const spot = new THREE.Vector3(pos[0], pos[1] + 0.6, pos[2]);
      if (!this.hasLine(eye, spot) || Math.abs(this.nav.heightAt(pos[0], pos[2]) - p.pos.y) > 0.4) {
        this.hud.centerMsg("Can't place a sentry there", [1.0, 0.5, 0.4], 1.2);
        DW.Sfx.play('deny');
        return;
      }
      if (!p.spend(DW.SENTRY_COST)) return;
      const id = Net.myId + ':' + (this.sentrySeq++);
      this.addSentry(id, Net.myId, pos, p.yaw);
      Net.sendAll('sentry', { i: id, p: pos.map(v => Math.round(v * 100) / 100), y: Math.round(p.yaw * 100) / 100 });
      this.hud.centerMsg(`SENTRY ONLINE  (${this.mySentries()}/${DW.SENTRY_MAX})`, [1.0, 0.5, 0.4], 1.5);
    }

    addSentry(id, owner, pos, yaw) {
      const root = M.node(this.scene, pos, 0);
      const head = M.turret(root);
      M.bake(root);
      head.rotation.y = yaw;
      const mine = owner === Net.myId;
      const label = M.label(root, [0, 1.55, 0], ' ', 26, mine ? [0.5, 1.0, 0.5] : [0.6, 0.85, 1.0], { pixel: 0.0022, outline: 6 });
      this.sentries.push({ id, owner, pos, root, head, label, t: DW.SENTRY_TIME, fireT: 0, yaw, labelKey: '' });
      Sfx.play3d('reload', pos, 4, 0.7);
    }

    removeSentry(s) {
      this.scene.remove(s.root);
      this.sentries.splice(this.sentries.indexOf(s), 1);
    }

    // The sentry's owner does the damage (hits go through the normal path); everyone sees it fire.
    updateSentries(dt) {
      for (const tu of this.sentries.slice()) {
        tu.t -= dt;
        if (tu.t <= 0) { this.removeSentry(tu); continue; }
        const key = Math.ceil(tu.t) + (tu.owner === Net.myId ? '' : Net.persona(tu.owner));
        if (key !== tu.labelKey) {
          tu.labelKey = key;
          const who = tu.owner === Net.myId ? 'SENTRY' : `${Net.persona(tu.owner)}'s SENTRY`;
          M.setLabel(tu.label, `${who}  ${Math.ceil(tu.t)}s`, tu.owner === Net.myId ? [0.5, 1.0, 0.5] : [0.6, 0.85, 1.0]);
        }
        const from = _a.set(tu.pos[0], tu.pos[1] + 1.3, tu.pos[2]); // just above the turret
        let best = null, bd = 28;
        for (const z of this.zombies.values()) {
          if (z.dead || z.riseT > 0) continue;
          const d = Math.hypot(z.pos.x - from.x, z.pos.z - from.z);
          if (d < bd && this.hasLine(from, _b.set(z.pos.x, z.pos.y + 1.2 * z.s, z.pos.z))) { bd = d; best = z; }
        }
        if (!best) continue;
        const want = Math.atan2(-(best.pos.x - from.x), -(best.pos.z - from.z));
        tu.yaw = DW.lerpAngle(tu.yaw, want, Math.min(1, dt * 10));
        tu.head.rotation.y = tu.yaw;
        tu.fireT -= dt;
        if (tu.fireT > 0 || Math.abs(DW.angleDiff(tu.yaw, want)) > 0.25) continue;
        tu.fireT = 0.14;
        const head = Math.random() < 0.25;
        const at = new THREE.Vector3(best.pos.x, best.pos.y + (head ? 1.75 : 1.15) * best.s, best.pos.z);
        const m = tu.head.userData.muzzle;
        this.tracer(tu.head.localToWorld(new THREE.Vector3(m[0], m[1], m[2])), at, false);
        Sfx.play3d('shot_light', from, -6, 1.2);
        if (tu.owner === Net.myId) this.localHit(best, 120 + 45 * this.wave, head, false, at, false, true);
      }
    }

    onWaveEnd() {
      this.state = 'intermission';
      this.stateT = DW.INTERMISSION;
      this.skipVotes = new Set();
      this.skipCount = [0, this.playerCount()];
      this.mySkip = false;
      Sfx.play('wave_end');
      this.hud.centerMsg(`WAVE ${this.wave} SURVIVED`, [0.9, 0.85, 0.75], 3);
    }

    respawnPoint() {
      for (const pl of this.allPlayers('all'))
        if (!pl.down && !pl.dead && pl.id !== Net.myId) return [pl.pos.x + 1, pl.pos.y + 0.2, pl.pos.z];
      return this.info.player_spawns[0];
    }

    pickSpawn() {
      let cands = [];
      const players = this.allPlayers('alive');
      for (const s of this.info.spawns) {
        if (!this.openZones.has(s.zone)) continue;
        let dmin = 9999;
        for (const pl of players) dmin = Math.min(dmin, Math.hypot(pl.pos.x - s.pos[0], pl.pos.y - s.pos[1], pl.pos.z - s.pos[2]));
        if (dmin > 7) cands.push([dmin, s.pos]);
      }
      if (!cands.length) for (const s of this.info.spawns) if (this.openZones.has(s.zone)) cands.push([0, s.pos]);
      cands.sort((a, b) => a[0] - b[0]);
      const pick = cands[Math.floor(Math.random() * Math.min(4, cands.length))];
      return [pick[1][0] + DW.randf(-0.5, 0.5), 0.1, pick[1][2] + DW.randf(-0.5, 0.5)];
    }

    spawnZombie(type, pos) {
      const n = this.playerCount();
      let hp = World.zombieHp(this.wave) * this.diff.hp;
      let spd = DW.randf(1.4, 2.1), dmg = 40;
      if (type === 'runner') spd = DW.randf(4.0, 4.9);
      else if (type === 'dodger') { spd = DW.randf(2.6, 3.1); hp *= 0.85; dmg = 35; }
      else if (type === 'brute') { hp = Math.max(6000, hp * 16) * (1 + 0.6 * (n - 1)); spd = 3.1; dmg = 65; }
      else if (type === 'spitter') { hp = Math.max(5000, hp * 13) * (1 + 0.6 * (n - 1)); spd = 2.7; dmg = 42; }
      else if (type === 'goonlord') { hp = Math.max(45000, hp * 45) * (1 + 0.7 * (n - 1)); spd = 4.4; dmg = 95; } // it runs
      const id = this.nextZid++;
      const z = new DW.Zombie(this, id, type, hp, spd * this.diff.spd, dmg * this.diff.dmg, false, pos);
      this.zombies.set(id, z);
      if (z.isBoss()) Sfx.play3d('growl_boss', [pos[0], pos[1] + 1, pos[2]], 6, 0.8, 80);
    }

    relocateZombie(z) {
      this.relocations++;
      z.pos.fromArray(this.pickSpawn());
      z.vel.set(0, 0, 0);
      z.repathT = 0;
      z.riseT = DW.Zombie.RISE_TIME;
      z.bodyRoot.position.y = -1.9 * z.s;
      this.dirtBurst(z.pos, z.s);
    }

    spectateTarget() {
      for (const r of this.remotes.values()) if (!r.dead && r.stale < 5) return r;
      return null;
    }

    currentBoss() {
      for (const z of this.zombies.values()) if (!z.dead && z.isBoss()) return z;
      return null;
    }

    bosses() {
      const out = [];
      for (const z of this.zombies.values()) if (!z.dead && z.isBoss() && z.riseT <= 0) out.push(z);
      return out;
    }

    // ---------------------------------------------------------------- player queries (zombie AI)
    // mode: 'target' = players zombies chase (up, and not in their after-revive grace),
    // 'alive' = not down or dead, 'all' = everyone. 'out' = down with no self-revive coming.
    allPlayers(mode) {
      const out = [];
      const p = this.player;
      const list = [{ id: Net.myId, pos: p.pos, down: p.downed, out: p.downed && p.selfReviveT <= 0, dead: p.dead, grace: this.myGraceT }];
      for (const [id, r] of this.remotes) list.push({ id, pos: r.posV, down: r.down, out: r.down, dead: r.dead || r.stale > 10, grace: r.graceT || 0 });
      for (const e of list) {
        if (mode === 'all' || (!e.down && !e.dead && (mode !== 'target' || e.grace <= 0))) out.push(e);
      }
      return out;
    }

    // Where zombies should back away from: downed players and players who just got back up.
    fleePoints() {
      const out = [];
      for (const e of this.allPlayers('all')) if (!e.dead && (e.down || e.grace > 0)) out.push(e.pos);
      return out;
    }

    // ---------------------------------------------------------------- Goon Lord horror
    // Build-up: music dies, a rumble swells, the lights strobe, then everything goes black.
    startGoonIntro(n) {
      Sfx.stopMusic();
      Sfx.play('dread', 4);
      Sfx.play('whisper', -2, 0.8);
      this.goonIntro = { t: 0, n };
      this.flicker = 2.6;
      this.hud.centerMsg(`WAVE ${n}\nIT'S COMING...`, [0.85, 0.08, 0.05], 3, true);
    }

    // Runs on every player's game: intro timing, the reveal, heartbeat, whispers, screen shake.
    updateGoonFx(dt) {
      this.flicker = Math.max((this.flicker || 0) - dt, 0);
      this.camShake = Math.max((this.camShake || 0) - dt * 1.3, 0);
      if (this.goonIntro) {
        const gi = this.goonIntro;
        gi.t += dt;
        if (gi.t >= 2.6 && !gi.dark) { gi.dark = true; Sfx.play('slam', 2, 0.5); this.camShake = Math.max(this.camShake, 0.4); }
        if (gi.t > 12) this.goonIntro = null;
      }
      const goons = [...this.zombies.values()].filter(z => z.ztype === 'goonlord' && !z.dead);
      // reveal: it has clawed out of the ground. It stares in silence, then shrieks and charges.
      for (const g of goons) {
        if (g.riseT > 0 || this.goonSeen.has(g.zid)) continue;
        this.goonSeen.add(g.zid);
        this.goonIntro = null;
        this.hud.centerMsg('THE GOON LORD HAS RISEN', [0.85, 0.08, 0.05], 3.5, true);
        this.hud.scareFlash(0.6);
        Sfx.play('heartbeat', 4, 0.9);
        this.fx.push(this.timer(DW.GOON_STARE, () => {
          if (g.dead) return;
          Sfx.play('shriek', 6);
          Sfx.play3d('shriek', [g.pos.x, g.pos.y + 3, g.pos.z], 8, 0.9, 120);
          this.camShake = 1.2;
          this.hud.scareFlash(1);
        }));
      }
      // proximity: heartbeat speeds up and the screen closes in as it gets near
      let d = 99;
      for (const g of goons) d = Math.min(d, g.pos.distanceTo(this.player.pos));
      this.scare = goons.length ? DW.clamp(1 - d / 24, 0, 1) : 0;
      if (goons.length) {
        this.heartT = (this.heartT || 0) - dt;
        if (this.heartT <= 0) {
          this.heartT = DW.lerp(1.15, 0.36, this.scare);
          Sfx.play('heartbeat', -12 + 15 * this.scare, 0.95 + this.scare * 0.15);
          this.hud.heartPulse(this.scare);
        }
        this.whisperT = (this.whisperT === undefined ? 6 : this.whisperT) - dt;
        if (this.whisperT <= 0) {
          this.whisperT = DW.randf(6, 13);
          Sfx.play('whisper', -6 + 4 * this.scare, DW.randf(0.75, 1.15));
        }
        if (this.scare > 0.75) this.camShake = Math.max(this.camShake, (this.scare - 0.75) * 0.8);
        this.goonWasAlive = true;
      } else if (this.goonWasAlive) {
        this.goonWasAlive = false;
        this.whisperT = undefined;
        Sfx.startMusic(-14);
      }
    }

    timer(t, fn) {
      return dt => { t -= dt; if (t <= 0) { fn(); return false; } return true; };
    }

    // Goon Lord screech: a few runners claw out of the ground around it (host only)
    goonScreech(z) {
      Sfx.play3d('growl_boss', [z.pos.x, z.pos.y + 3, z.pos.z], 10, 0.4, 120);
      Net.sendAll('fx', { k: 'screech' });
      this.hud.centerMsg('THE GOON LORD SCREECHES', [0.7, 0.95, 1.0], 2);
      for (let i = 0; i < 3 && this.zombies.size < MAX_ALIVE + 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = z.pos.x + Math.cos(a) * 3, zz = z.pos.z + Math.sin(a) * 3;
        const [ci, cj] = this.nav.cellOf(x, zz);
        if (!this.nav.walkable(ci, cj)) continue;
        this.spawnZombie('runner', [x, 0.1, zz]);
        this.waveTotal++;
      }
    }

    // ---------------------------------------------------------------- wind charge
    launchWind(from, dir, mine) {
      const mesh = new THREE.Group();
      const shell = new THREE.Mesh(M.ballGeo(0.22, 10), new THREE.MeshBasicMaterial({ color: M.color([0.8, 0.95, 1.0]), transparent: true, opacity: 0.45, depthWrite: false }));
      const core = new THREE.Mesh(M.ballGeo(0.1, 8), M.mat([0.6, 0.95, 1.0], 3, 0, 1, true));
      mesh.add(shell, core);
      mesh.position.copy(from);
      this.scene.add(mesh);
      this.winds.push({ mesh, vel: dir.clone().multiplyScalar(26), t: 1.0, mine });
    }

    updateWinds(dt) {
      for (const wc of this.winds.slice()) {
        wc.t -= dt;
        const p = wc.mesh.position;
        wc.mesh.rotation.y += dt * 12;
        wc.mesh.rotation.x += dt * 7;
        const speed = wc.vel.length(), dir = _a.copy(wc.vel).multiplyScalar(1 / speed), step = speed * dt;
        let hitT = -1;
        const sh = this.phys.raycast(p, dir, step + 0.2);
        if (sh) hitT = Math.max(sh.t - 0.15, 0);
        for (const z of this.zombies.values()) {
          if (z.dead) continue;
          const zc = _b.set(z.pos.x, z.pos.y + 1.0 * z.s, z.pos.z);
          if (zc.distanceTo(p) < 0.6 * z.s + 0.3) { hitT = 0; break; }
        }
        if (hitT >= 0 || wc.t <= 0) {
          if (hitT > 0) p.addScaledVector(dir, hitT);
          this.scene.remove(wc.mesh);
          this.winds.splice(this.winds.indexOf(wc), 1);
          if (wc.mine) this.windBlast(p.clone(), true);
          continue;
        }
        p.addScaledVector(dir, step);
      }
    }

    // knocks zombies back; mine = we fired it (tell everyone, host moves the zombies)
    windBlast(pos, mine) {
      Sfx.play3d('wind_blast', pos, 6);
      this.burst(pos, [0.85, 0.95, 1.0], 30, 7, 0.5);
      this.burst(pos, [0.5, 0.85, 1.0], 16, 4, 0.7);
      const ring = new THREE.Mesh(M.ballGeo(1, 16), new THREE.MeshBasicMaterial({ color: M.color([0.8, 0.95, 1.0]), transparent: true, opacity: 0.35, depthWrite: false, wireframe: true }));
      ring.position.copy(pos);
      this.scene.add(ring);
      let t = 0;
      this.fx.push(dt => {
        t += dt;
        const k = t / 0.35;
        ring.scale.setScalar(0.3 + k * 4.5);
        ring.material.opacity = 0.35 * (1 - k);
        if (k >= 1) { this.scene.remove(ring); ring.material.dispose(); return false; }
        return true;
      });
      if (mine) {
        this.player.windKnock(pos);
        Net.sendAll('wind', { p: arr(pos) });
      }
      if (this.host) this.windPush(pos);
    }

    windPush(pos) {
      const R = 5.5;
      for (const z of this.zombies.values()) {
        if (z.dead) continue;
        const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z;
        const d = Math.hypot(dx, dz, z.pos.y + z.s - pos.y);
        if (d > R) continue;
        const h = Math.hypot(dx, dz) || 1;
        const push = (16 * (1 - d / R) + 6) / Math.max(1, z.s);
        z.knockX = (z.knockX || 0) + dx / h * push;
        z.knockZ = (z.knockZ || 0) + dz / h * push;
        z.flinch(false);
      }
    }

    papFx(pos, tier = 1) {
      const col = [null, [0.3, 1.0, 0.6], [0.35, 0.55, 1.0], [0.8, 0.4, 1.0]][tier] || [0.3, 1.0, 0.6];
      Sfx.play('pickup', 4, 0.7 + tier * 0.1);
      Sfx.play('box_spin', -4, 1.6);
      const at = new THREE.Vector3(pos[0], pos[1] + 1.5, pos[2]);
      this.burst(at, col, 40, 4, 0.9);
      this.burst(at.clone(), [0.95, 1.0, 1.0], 25, 3, 0.9);
      this.hud.centerMsg(`PACK-A-POONCHED${tier > 1 ? ' ' + 'I'.repeat(tier) : ''}!\n${DW.PAP_DMG[tier]}x damage, ${1 << tier}x ammo`, col, 2.5);
    }

    onLocalRevive() {
      this.myGraceT = 3.0;
    }

    nearestPlayer(pos) {
      let best = null, bd = Infinity;
      for (const pl of this.allPlayers('target')) {
        const d = pl.pos.distanceToSquared(pos);
        if (d < bd) { bd = d; best = pl; }
      }
      return best;
    }

    separation(z) {
      let px = 0, pz = 0;
      for (const o of this.zombies.values()) {
        if (o === z || o.dead) continue;
        const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
        const l = Math.hypot(dx, dz);
        const minl = 0.75 * (z.s + o.s) * 0.5;
        if (l < minl && l > 0.001) { px += dx / l * (minl - l) / minl; pz += dz / l * (minl - l) / minl; }
      }
      return [px, pz];
    }

    zombieAttack(z, targetId, dmg) {
      Sfx.play3d('melee_hit', [z.pos.x, z.pos.y + 1, z.pos.z], -4);
      this.damagePlayer(targetId, dmg, [z.pos.x, z.pos.y, z.pos.z]);
    }

    damagePlayer(id, dmg, from) {
      if (id === Net.myId) this.player.takeDamage(dmg, from);
      else Net.sendTo(id, 'pdmg', { d: dmg, f: from || null });
    }

    spawnAoe(pos, r, delay, dmg, kind) {
      this.aoes.push({ pos, r, t: delay, dmg });
      Net.sendAll('aoe', { p: pos, r, t: delay, k: kind });
      this.showAoe(pos, r, delay, kind);
    }

    showAoe(pos, r, delay, kind) {
      const col = kind === 'slam' ? [1.0, 0.3, 0.1] : [0.5, 1.0, 0.2];
      const mat = new THREE.MeshBasicMaterial({ color: M.color(col), transparent: true, opacity: 0.4, depthWrite: false, fog: false });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 32), mat);
      ring.position.set(pos[0], pos[1] + 0.06, pos[2]);
      ring.scale.set(0.2, 1, 0.2);
      this.scene.add(ring);
      if (kind === 'acid') { Sfx.play3d('acid', pos, 0); this.lobFx(pos, delay, col); }
      let t = 0, fired = false;
      this.fx.push(dt => {
        t += dt;
        if (t < delay) { const k = 0.2 + 0.8 * (t / delay); ring.scale.set(k, 1, k); return true; }
        if (!fired) {
          fired = true;
          Sfx.play3d(kind === 'slam' ? 'slam' : 'acid', pos, 4);
          this.burst(v3(pos).add(_a.set(0, 0.3, 0)), col, 26, 6, 0.6);
        }
        const k = 1 + 0.1 * Math.min((t - delay) / 0.25, 1);
        ring.scale.set(k, 1, k);
        if (t > delay + 0.25) { this.scene.remove(ring); ring.geometry.dispose(); mat.dispose(); return false; }
        return true;
      });
    }

    lobFx(target, time, col) {
      const boss = this.currentBoss();
      if (!boss) return;
      const ball = new THREE.Mesh(M.ballGeo(0.3, 10), M.mat(col, 3, 0, 1, true));
      const start = boss.pos.clone().add(_a.set(0, 2, 0));
      const end = v3(target);
      this.scene.add(ball);
      let t = 0;
      this.fx.push(dt => {
        t += dt;
        const k = Math.min(t / time, 1);
        ball.position.lerpVectors(start, end, k);
        ball.position.y += Math.sin(k * Math.PI) * 4;
        if (k >= 1) { this.scene.remove(ball); return false; }
        return true;
      });
    }

    // ---------------------------------------------------------------- damage (host authority)
    // crit: jumping headshot (already multiplied by the caller). quiet: turret hits (no hit marker / sound spam)
    localHit(z, dmg, head, knife, at, crit = false, quiet = false) {
      if (z.dead) return;
      this.player.addPoints(10);
      z.flinch(head);
      if (!quiet) {
        this.hud.hitMarker(head, false, crit);
        Sfx.play(head ? 'headshot' : 'hit', crit ? -2 : -6, crit ? 1.35 : 1);
      }
      if (crit) this.burst(at, [1.0, 0.85, 0.3], 14, 4, 0.4);
      this.burst(at, [0.5, 0.03, 0.02], 8, 3, 0.35);
      if (this.host) this.applyDamage(z.zid, dmg, head, Net.myId, knife);
      else Net.sendHost('hit', { z: z.zid, d: dmg, h: head, kn: knife });
    }

    localSplash(at, radius, dmg, skip) {
      this.burst(at, [0.3, 1.0, 0.5], 18, 5, 0.4);
      for (const z of [...this.zombies.values()]) {
        if (z === skip || z.dead) continue;
        const d = _a.set(z.pos.x, z.pos.y + 1, z.pos.z).distanceTo(at);
        if (d <= radius) this.localHit(z, dmg * (1 - d / radius * 0.5), false, false, _a.clone());
      }
    }

    applyDamage(zid, dmg, head, by, knife) {
      const z = this.zombies.get(zid);
      if (!z || z.dead) return;
      // insta-kill: normal zombies die in one hit, bosses take double damage
      if (this.instaT > 0) dmg = z.isBoss() ? dmg * 2 : z.hp + 1;
      z.hp -= dmg;
      z.hpFrac = DW.clamp(z.hp / z.maxHp, 0, 1);
      if (z.isBoss() && !z.enraged && z.hpFrac <= 0.5 && z.hp > 0) {
        z.enraged = true;
        Net.sendAll('fx', { k: 'enrage', t: z.ztype });
        this.announceEnrage(z.ztype);
      }
      if (z.hp <= 0) this.killZombie(zid, by, head, knife, false);
    }

    killZombie(zid, by, head, knife, nuke) {
      const z = this.zombies.get(zid);
      if (!z) return;
      const pos = [z.pos.x, z.pos.y, z.pos.z];
      const msg = { z: zid, by, h: head, kn: knife, nk: nuke, b: z.isBoss(), gl: z.ztype === 'goonlord', p: pos };
      Net.sendAll('zkill', msg);
      this.onZkill(msg);
      if (nuke) return;
      if (msg.b) this.dropPowerup(pos, 'max_ammo');
      else if (this.dropsThisWave < 4 && Math.random() < 0.035) {
        this.dropsThisWave++;
        this.dropPowerup(pos, PU_TYPES[DW.randi(PU_TYPES.length)]);
      }
    }

    onZkill(msg) {
      const zid = msg.z;
      this.deadIds.add(zid);
      const z = this.zombies.get(zid);
      this.zombies.delete(zid);
      const head = !!msg.h;
      if (z) { z.die(head); this.corpses.push(z); }
      const pos = msg.p;
      this.burst(_a.set(pos[0], pos[1] + (head ? 1.7 : 1.0), pos[2]).clone(), [0.45, 0.02, 0.02], head ? 22 : 12, 4, 0.6);
      const p = this.player;
      if (msg.by === Net.myId && !msg.nk) {
        p.kills++;
        if (head) p.headshots++;
        this.hud.hitMarker(head, true);
        if (msg.b) { p.bosses++; p.addPoints(msg.gl ? 2500 : 500); }
        else if (msg.kn) p.addPoints(130);
        else p.addPoints(head ? 100 : 60);
      }
      if (msg.b) {
        this.hud.centerMsg(msg.gl ? 'THE GOON LORD IS DEAD\nThe lights come back on' : 'BOSS DOWN', [1.0, 0.8, 0.3], msg.gl ? 4 : 2.5);
        if (msg.by !== Net.myId) p.addPoints(msg.gl ? 1000 : 200);
      }
    }

    // ---------------------------------------------------------------- power-ups
    dropPowerup(pos, type) {
      const id = this.nextPu++;
      const p = [pos[0], 0, pos[2]];
      Net.sendAll('pu', { i: id, t: type, p });
      this.spawnPu(id, type, p);
    }

    spawnPu(id, type, pos) {
      const pi = PU_INFO[type];
      const root = new THREE.Group();
      root.position.set(pos[0], 1, pos[2]);
      this.scene.add(root);
      M.box(root, [0, 0, 0], [0.5, 0.5, 0.5], M.mat(pi.color, 3, 0, 1, true));
      M.label(root, [0, 0.6, 0], pi.letter, 64, M.lightened(pi.color, 0.4), { noDepth: true });
      this.powerups.set(id, { node: root, type, t: 26 });
    }

    updatePowerups(dt) {
      const p = this.player;
      for (const [id, pu] of this.powerups) {
        pu.t -= dt;
        const node = pu.node;
        node.rotation.y += dt * 2;
        node.position.y = 1 + Math.sin(this.elapsed * 3) * 0.15;
        if (pu.t < 6) node.visible = (pu.t % 0.4) > 0.15;
        if (pu.t <= 0) { this.scene.remove(node); this.powerups.delete(id); continue; }
        if (p.alive() && Math.hypot(node.position.x - p.pos.x, node.position.z - p.pos.z) < 1.5) {
          if (this.host) this.takePu(id);
          else if (!pu.pending) { pu.pending = true; Net.sendHost('pu_take', { i: id }); }
        }
      }
    }

    takePu(id) {
      if (!this.powerups.has(id)) return;
      const type = this.powerups.get(id).type;
      Net.sendAll('pu_fx', { i: id, t: type });
      this.applyPu(id, type);
    }

    applyPu(id, type) {
      if (this.powerups.has(id)) { this.scene.remove(this.powerups.get(id).node); this.powerups.delete(id); }
      Sfx.play('pickup', 2);
      const pi = PU_INFO[type];
      this.hud.centerMsg(pi.name, pi.color, 2.5);
      if (type === 'max_ammo') this.player.refillAmmo();
      else if (type === 'double') this.doubleT = 30;
      else if (type === 'insta') this.instaT = 30;
      else if (type === 'nuke') {
        Sfx.play('explode', 4);
        this.hud.flashDamage(0);
        // the host kills everything and pays 100 per zombie, split evenly between everyone in the game
        if (this.host) {
          let n = 0;
          for (const [zid, z] of [...this.zombies]) if (!z.isBoss()) { this.killZombie(zid, '', false, false, true); n++; }
          const share = Math.round(n * DW.NUKE_PER_KILL / Math.max(1, this.playerCount()));
          Net.sendAll('nukepay', { n, s: share });
          this.onNukePay({ n, s: share });
        }
      }
    }

    // grapple line, fading out over a third of a second (mine are sent so teammates see them too)
    rope(a, b, mine) {
      const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
      const m = new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 1, fog: false });
      const line = new THREE.Line(g, m);
      this.scene.add(line);
      let t = 0;
      this.fx.push(dt => {
        t += dt;
        m.opacity = Math.max(0, 1 - t / 0.35);
        if (t < 0.35) return true;
        this.scene.remove(line); g.dispose(); m.dispose();
        return false;
      });
      if (mine) Net.sendAll('rope', { a: [a.x, a.y, a.z].map(v => Math.round(v * 100) / 100), b: [b.x, b.y, b.z].map(v => Math.round(v * 100) / 100) }, false);
    }

    onNukePay(d) {
      const share = +d.s || 0;
      if (share > 0) this.player.addPoints(share);
      this.hud.centerMsg(`NUKE\n${d.n | 0} killed  +${share} each`, PU_INFO.nuke.color, 2.5);
    }

    // ---------------------------------------------------------------- interactions
    getInteraction() {
      const p = this.player;
      if (this.gameOver || !p.alive()) return null;
      const pp = p.pos;
      for (const [id, r] of this.remotes) {
        if (r.down && !r.dead && r.posV.distanceTo(pp) < 2.3) {
          const t = p.defib ? 1.0 : p.perks.includes('wind') ? 1.5 : 3.0;
          return { text: `Hold E to revive ${r.name}`, hold: t, revive: id, action: () => this.reviveRemote(id) };
        }
      }
      for (let i = 0; i < this.info.doors.length; i++) {
        const d = this.info.doors[i];
        if (d.open) continue;
        const hx = d.size[0] / 2, hz = d.size[2] / 2;
        const cx = DW.clamp(pp.x, d.pos[0] - hx, d.pos[0] + hx), cz = DW.clamp(pp.z, d.pos[2] - hz, d.pos[2] + hz);
        if (Math.hypot(cx - pp.x, cz - pp.z) < 1.7) return { text: `Press E to clear debris  [${d.cost}]`, cost: d.cost, action: () => this.buyDoor(i) };
      }
      for (const wb of this.info.wallbuys) {
        if (Math.hypot(wb.pos[0] - pp.x, wb.pos[1] - pp.y, wb.pos[2] - pp.z) < 2.0) {
          const wd = DW.WEAPONS[wb.weapon];
          if (p.hasWeapon(wb.weapon)) {
            const c2 = Math.floor(wd.cost / 2);
            return { text: `Press E for ${wd.name} ammo  [${c2}]`, cost: c2, action: () => { if (p.spend(c2)) p.giveWeapon(wb.weapon); } };
          }
          return { text: `Press E to buy ${wd.name}  [${wd.cost}]`, cost: wd.cost, action: () => { if (p.spend(wd.cost)) p.giveWeapon(wb.weapon); } };
        }
      }
      for (const gb of this.info.gear) {
        if (Math.hypot(gb.pos[0] - pp.x, gb.pos[1] - pp.y, gb.pos[2] - pp.z) < 2.0) {
          const gd = DW.GEAR[gb.item];
          if (p[gb.item]) return { text: `You have the ${gd.name}` };
          return { text: `Press E to buy the ${gd.name}  [${gd.cost}]\n${gd.desc}`, cost: gd.cost, action: () => { if (p.spend(gd.cost)) p.giveGear(gb.item); } };
        }
      }
      for (const bx of this.info.boxes) {
        if (Math.hypot(bx.pos[0] - pp.x, bx.pos[1] - pp.y, bx.pos[2] - pp.z) < 2.2) {
          if (this.wave < DW.BOX_UNLOCK_WAVE) return { text: `The Mystery Box opens on wave ${DW.BOX_UNLOCK_WAVE}` };
          if (this.boxState !== 'idle' && this.boxOwner !== Net.myId) {
            const who = Net.persona(this.boxOwner);
            return { text: this.boxState === 'rolling' ? `${who} is spinning the box...` : `${who}'s ${DW.WEAPONS[this.boxChoice].name}` };
          }
          if (this.boxState === 'rolling') return { text: 'The box is spinning...' };
          if (this.boxState === 'ready') return { text: `Press E to take ${DW.WEAPONS[this.boxChoice].name}`, action: () => this.takeBoxWeapon() };
          return { text: `Press E for a random weapon  [${DW.BOX_COST}]`, cost: DW.BOX_COST, action: () => this.buyBox() };
        }
      }
      for (const pa of this.info.paps) {
        if (Math.hypot(pa.pos[0] - pp.x, pa.pos[1] - pp.y, pa.pos[2] - pp.z) < 2.3) {
          const a = p.active(), wd = DW.WEAPONS[a.id];
          if (a.id === 'wind') return { text: "The Pack-a-Poonch can't take the wind charge" };
          const tier = a.pap | 0;
          if (tier >= 3) return { text: `Your ${wd.name} is fully Pack-a-Poonched (tier III, ${DW.PAP_DMG[3]}x damage)` };
          const cost = DW.PAP_COSTS[tier + 1];
          const what = tier === 0 ? 'Pack-a-Poonch' : `upgrade to tier ${'I'.repeat(tier + 1)}`;
          const look = ['', 'emerald', 'sapphire', 'amethyst & gold'][tier + 1];
          return {
            text: `Press E to ${what} your ${wd.name}  [${cost}]\n${look} finish, ${DW.PAP_DMG[tier + 1]}x damage, ${1 << (tier + 1)}x mag and ammo`, cost,
            action: () => { if (p.spend(cost)) { p.packAPunch(); this.papFx(pa.pos, tier + 1); } },
          };
        }
      }
      for (const ar of this.info.armors) {
        if (Math.hypot(ar.pos[0] - pp.x, ar.pos[1] - pp.y, ar.pos[2] - pp.z) < 2.2) {
          if (p.armor >= DW.ARMOR_MAX) return { text: `Armour full (${DW.ARMOR_MAX})` };
          return {
            text: `Press E to buy armour (${DW.ARMOR_MAX})  [${DW.ARMOR_COST}]\nSoaks damage before your health`, cost: DW.ARMOR_COST,
            action: () => { if (p.spend(DW.ARMOR_COST)) { p.armor = DW.ARMOR_MAX; Sfx.play('reload', 0, 0.6); this.hud.centerMsg('ARMOR UP', [0.5, 0.75, 1.0], 1.5); } },
          };
        }
      }
      for (const am of this.info.ammos) {
        if (Math.hypot(am.pos[0] - pp.x, am.pos[1] - pp.y, am.pos[2] - pp.z) < 2.2) {
          return {
            text: `Press E to refill every gun  [${DW.AMMO_COST}]`, cost: DW.AMMO_COST,
            action: () => { if (p.spend(DW.AMMO_COST)) { p.refillAll(); Sfx.play('pickup'); this.hud.centerMsg('AMMO RESUPPLIED', [1.0, 0.85, 0.4], 1.5); } },
          };
        }
      }
      for (let i = 0; i < this.info.lifts.length; i++) {
        const lf = this.info.lifts[i];
        const onIt = Math.abs(lf.pos[0] - pp.x) < 1.0 && Math.abs(lf.pos[2] - pp.z) < 1.0 && Math.abs(pp.y - lf.y) < 0.5;
        const near = Math.hypot(lf.pos[0] - pp.x, lf.pos[2] - pp.z) < 2.8;
        if (!onIt && !near) continue;
        if (lf.moving) return { text: 'The elevator is moving...' };
        const up = lf.y < 1;
        if (onIt) return { text: `Press E to ride the elevator ${up ? 'up' : 'down'}`, action: () => this.useLift(i, up ? DW.Maps.DECK_H : 0) };
        const want = pp.y > 1.2 ? DW.Maps.DECK_H : 0;
        if (Math.abs(lf.y - want) > 0.1) return { text: 'Press E to call the elevator', action: () => this.useLift(i, want) };
      }
      for (const gb of this.info.grenadeBuys) {
        if (Math.hypot(gb.pos[0] - pp.x, gb.pos[2] - pp.z) < 2.0) {
          const need = DW.MAX_GRENADES - p.grenades;
          if (need <= 0) return { text: `Grenades full (${DW.MAX_GRENADES})` };
          const cost = need * DW.GRENADE_COST;
          return {
            text: `Press E to fill grenades to ${DW.MAX_GRENADES} (+${need})  [${cost}]`, cost,
            action: () => { if (p.spend(cost)) { p.grenades = DW.MAX_GRENADES; this.hud.centerMsg(`GRENADES x${DW.MAX_GRENADES}`, [1.0, 0.95, 0.8], 1.5); } },
          };
        }
      }
      for (const pk of this.info.perks) {
        if (Math.hypot(pk.pos[0] - pp.x, pk.pos[1] - pp.y, pk.pos[2] - pp.z) < 2.0) {
          const pd = DW.PERKS[pk.perk];
          if (p.perks.includes(pk.perk)) return { text: `You already have ${pd.name}` };
          if (p.perks.length >= DW.MAX_PERKS) return { text: `You can only hold ${DW.MAX_PERKS} perks` };
          return {
            text: `Press E for ${pd.name}  [${pd.cost}]\n${pd.desc}`, cost: pd.cost,
            action: () => { if (p.spend(pd.cost)) { p.addPerk(pk.perk); this.hud.centerMsg(pd.name.toUpperCase(), pd.color, 2); } },
          };
        }
      }
      return null;
    }

    buyDoor(i) {
      if (this.info.doors[i].open) return;
      if (this.player.spend(this.info.doors[i].cost)) {
        Net.sendAll('door', { i });
        this.openDoor(i);
      }
    }

    openDoor(i) {
      const d = this.info.doors[i];
      if (!d || d.open) return;
      d.open = true;
      this.openZones.add(d.zone);
      Sfx.play3d('door', d.pos, 4);
      this.burst(v3(d.pos), [0.5, 0.4, 0.3], 30, 5, 0.8);
      this.scene.remove(d.group);
      this.phys.removeBox(d.box);
      this.nav.rebuild();
      this.navT = 0;
    }

    buyBox() {
      if (this.boxState !== 'idle' || this.wave < DW.BOX_UNLOCK_WAVE || !this.player.spend(DW.BOX_COST)) return;
      // weighted: the big guns are rare
      const pool = DW.BOX_POOL.filter(w => !this.player.hasWeapon(w));
      let total = 0;
      for (const w of pool) total += DW.BOX_WEIGHT[w] || 1;
      let roll = Math.random() * total;
      let choice = pool[pool.length - 1];
      for (const w of pool) { roll -= DW.BOX_WEIGHT[w] || 1; if (roll <= 0) { choice = w; break; } }
      this.startBox(Net.myId, choice);
      Net.sendAll('box', { s: 'roll', c: choice });
    }

    // Everyone sees the same spin; only the owner can take the gun.
    startBox(owner, choice) {
      if (this.boxState !== 'idle') this.closeBox();
      this.boxOwner = owner;
      this.boxChoice = choice;
      this.boxState = 'rolling';
      this.boxRollT = 2.6;
      this.boxSwapT = 0;
      this.boxHolder = new THREE.Group();
      const bp = this.info.boxes[0].pos;
      this.boxHolder.position.set(bp[0], 0.95, bp[2]);
      this.scene.add(this.boxHolder);
      Sfx.play3d('box_spin', this.boxHolder.position, 0);
    }

    closeBox() {
      this.boxState = 'idle';
      this.boxOwner = null;
      if (this.boxHolder) this.scene.remove(this.boxHolder);
      this.boxHolder = null;
    }

    boxShow(id) {
      const h = this.boxHolder;
      while (h.children.length) h.remove(h.children[0]);
      const g = M.gun(id);
      g.scale.setScalar(1.5);
      g.position.set(0, 0, DW.WEAPONS[id].len * 0.6);
      M.bake(g);
      h.add(g);
    }

    updateBox(dt) {
      if (this.boxState === 'idle') return;
      this.boxRollT -= dt;
      const h = this.boxHolder;
      h.rotation.y += dt * (this.boxState === 'rolling' ? 6 : 1.2);
      if (this.boxState === 'rolling') {
        const bp = this.info.boxes[0].pos;
        h.position.set(bp[0], 0.95 + (1 - this.boxRollT / 2.6) * 0.6, bp[2]);
        this.boxSwapT -= dt;
        if (this.boxSwapT <= 0) {
          this.boxSwapT = 0.09 + (1 - this.boxRollT / 2.6) * 0.18;
          this.boxShow(DW.BOX_POOL[DW.randi(DW.BOX_POOL.length)]);
        }
        if (this.boxRollT <= 0) {
          this.boxShow(this.boxChoice);
          this.boxState = 'ready';
          this.boxRollT = 9;
          if (this.boxOwner === Net.myId) Sfx.play('pickup');
          else this.hud.centerMsg(`${Net.persona(this.boxOwner)} rolled the ${DW.WEAPONS[this.boxChoice].name}`, [0.6, 0.85, 1.0], 2.5);
        }
      } else if (this.boxState === 'ready') {
        h.position.y += Math.sin(this.elapsed * 3) * dt * 0.1;
        if (this.boxRollT <= 0) {
          const mine = this.boxOwner === Net.myId;
          this.closeBox();
          if (mine) this.hud.centerMsg('The box closed', [0.6, 0.85, 1.0], 1.5);
        }
      }
    }

    takeBoxWeapon() {
      if (this.boxState !== 'ready' || this.boxOwner !== Net.myId) return;
      this.player.giveWeapon(this.boxChoice);
      this.hud.centerMsg(DW.WEAPONS[this.boxChoice].name.toUpperCase(), [0.6, 0.85, 1.0], 2);
      Net.sendAll('box', { s: 'take', c: this.boxChoice });
      this.closeBox();
    }

    // while holding E on a downed teammate: let them (and everyone) see the progress
    sendReviving(id, p) {
      const r = this.remotes.get(id);
      if (r) { r.reviveAt = this.elapsed; r.reviveP = p; }
      if (this.elapsed - this.reviveSendT < 0.1) return;
      this.reviveSendT = this.elapsed;
      Net.sendAll('rv', { t: id, p: Math.round(p * 100) / 100 }, false);
    }

    reviveRemote(id) {
      this.player.revives++;
      this.player.addPoints(100);
      Net.sendAll('revive', { t: id, by: Net.myId });
      const r = this.remotes.get(id);
      if (r) { r.down = false; r.graceT = 3.0; }
    }

    localPlayerOut() {
      // Solo with no Second Wind: game over now.
      if (this.host) this.endGame(`You went down on wave ${this.wave}.`);
    }

    // ---------------------------------------------------------------- grenades & effects
    throwGrenade(pos, vel) {
      const mesh = new THREE.Mesh(M.ballGeo(0.09, 8), M.mat([0.2, 0.25, 0.15]));
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.grenadesLive.push({ mesh, vel: vel.clone(), t: 2.0 });
    }

    updateGrenades(dt) {
      for (const g of this.grenadesLive.slice()) {
        g.t -= dt;
        g.vel.y -= 9.8 * dt;
        const p = g.mesh.position;
        const speed = g.vel.length();
        if (speed > 1e-4) {
          const dir = _a.copy(g.vel).multiplyScalar(1 / speed);
          const step = speed * dt;
          const hit = this.phys.raycast(p, dir, step + 0.09);
          if (hit) {
            p.addScaledVector(dir, Math.max(hit.t - 0.1, 0));
            const n = hit.normal;
            const vn = g.vel.x * n[0] + g.vel.y * n[1] + g.vel.z * n[2];
            g.vel.x -= (1 + 0.35) * vn * n[0];
            g.vel.y -= (1 + 0.35) * vn * n[1];
            g.vel.z -= (1 + 0.35) * vn * n[2];
            g.vel.multiplyScalar(0.8);
          } else p.addScaledVector(dir, step);
        }
        g.mesh.rotation.x += dt * 8;
        if (g.t <= 0) {
          this.scene.remove(g.mesh);
          this.grenadesLive.splice(this.grenadesLive.indexOf(g), 1);
          this.explode(p.clone(), true);
        }
      }
    }

    explode(at, mine) {
      Sfx.play3d('explode', at, 6, 1, 70);
      this.burst(at.clone().add(_a.set(0, 0.3, 0)), [1.0, 0.6, 0.2], 40, 9, 0.6);
      this.boomLight.position.set(at.x, at.y + 1, at.z);
      this.boomLight.intensity = 8;
      if (!mine) return;
      Net.sendAll('fx', { k: 'boom', p: arr(at) });
      const dmg = 150 + 70 * this.wave;
      const from = at.clone().add(_a.set(0, 0.3, 0));
      for (const z of [...this.zombies.values()]) {
        if (z.dead) continue;
        const d = _b.set(z.pos.x, z.pos.y + 0.8, z.pos.z).distanceTo(at);
        if (d < 5.5 && this.hasLine(from, _b.set(z.pos.x, z.pos.y + 1, z.pos.z)))
          this.localHit(z, dmg * (1 - d / 5.5 * 0.6), false, false, _b.clone());
      }
      const p = this.player;
      if (p.pos.distanceTo(at) < 3 && this.hasLine(from, _b.set(p.pos.x, p.pos.y + 1, p.pos.z))) p.takeDamage(20, [at.x, at.y, at.z]);
    }

    // tell teammates where our shots went so they can draw them
    onLocalFire(id, ends, plasma) {
      if (!this.online) return;
      Net.sendAll('sh', { e: ends.slice(0, 8).map(arr), p: !!plasma }, false);
    }

    showRemoteShot(r, ends, plasma) {
      r.flash = 3;
      const wd = DW.WEAPONS[r.w] || DW.WEAPONS.pistol;
      Sfx.play3d(wd.snd, [r.pos[0], r.pos[1] + 1.4, r.pos[2]], -4);
      const m = r.gun && r.gun.userData.muzzle;
      const from = m ? r.gun.localToWorld(new THREE.Vector3(m[0], m[1], m[2])) : new THREE.Vector3(r.pos[0], r.pos[1] + 1.4, r.pos[2]);
      for (const e of ends) if (Array.isArray(e)) this.tracer(from, v3(e), plasma);
      this.remoteLight.position.copy(from);
      this.remoteLight.color.set(plasma ? 0x4dff80 : 0xffcc73);
      this.remoteLight.intensity = 3;
    }

    announceEnrage(type) {
      this.hud.centerMsg(type === 'goonlord' ? 'THE GOON LORD IS ENRAGED' : `THE ${DW.BOSS_NAMES[type] || 'BOSS'} IS ENRAGED`, [1.0, 0.35, 0.1], 2.5);
      Sfx.play('wave_start', 0, 1.4);
    }

    hasLine(a, b) { return this.phys.hasLine(a, b); }

    // nearest hit along a ray: static boxes and zombies. excl: Set of zombies to skip.
    raycast(o, d, maxT, excl) {
      const sh = this.phys.raycast(o, d, maxT);
      let best = sh ? { t: sh.t, normal: sh.normal } : null;
      let bt = sh ? sh.t : maxT;
      for (const z of this.zombies.values()) {
        if (z.dead || (excl && excl.has(z))) continue;
        // cheap reject: distance from the ray to the zombie centre
        const cx = z.pos.x - o.x, cy = z.pos.y + z.s - o.y, cz = z.pos.z - o.z;
        const along = cx * d.x + cy * d.y + cz * d.z;
        if (along < -2 || along > bt + 2) continue;
        const px = cx - d.x * along, py = cy - d.y * along, pz = cz - d.z * along;
        if (px * px + py * py + pz * pz > (1.4 * z.s) ** 2) continue;
        const h = z.hitTest(o, d, bt);
        if (h && h.t < bt) { bt = h.t; best = { t: h.t, zombie: z, head: h.head }; }
      }
      return best;
    }

    dirtBurst(at, scale) {
      this.burst(new THREE.Vector3(at.x, at.y + 0.2, at.z), [0.25, 0.19, 0.13], Math.floor(14 * scale), 3.5 * scale, 0.7);
      Sfx.play3d('dig', at, -4 + scale * 3, 1 / scale);
    }

    tracer(from, to, plasma) {
      const len = from.distanceTo(to);
      if (len < 0.5) return;
      const thick = plasma ? 0.08 : 0.015;
      const mi = new THREE.Mesh(M.boxGeo(thick, thick, 1), plasma ? this.tracerMats.plasma : this.tracerMats.bullet);
      mi.scale.z = len;
      mi.position.lerpVectors(from, to, 0.5);
      mi.lookAt(to);
      this.scene.add(mi);
      let t = plasma ? 0.12 : 0.05;
      this.fx.push(dt => {
        t -= dt;
        if (t <= 0) { this.scene.remove(mi); return false; }
        return true;
      });
    }

    impactFx(at, normal, plasma) {
      const p = at.clone().add(_a.set(normal[0] * 0.05, normal[1] * 0.05, normal[2] * 0.05));
      this.burst(p, plasma ? [0.4, 1.0, 0.5] : [0.9, 0.8, 0.6], 6, 2.5, 0.25);
    }

    burst(at, col, amount, speed, life) {
      const c = M.color(col);
      amount = Math.max(1, Math.round(amount * [0.35, 1, 1.7][DW.settings.particles]));
      for (let i = 0; i < amount; i++) {
        if (this.particles.length >= this.pMax) this.particles.shift();
        // random direction on a sphere
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = DW.randf(speed * 0.4, speed);
        this.particles.push({ x: at.x, y: at.y, z: at.z, vx: r * Math.cos(th) * sp, vy: u * sp, vz: r * Math.sin(th) * sp, t: life, s: DW.randf(0.5, 1.2), c });
      }
    }

    updateFx(dt) {
      this.fx = this.fx.filter(f => f(dt));
      const ps = this.particles;
      let n = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.t -= dt;
        if (p.t <= 0) continue;
        p.vy -= 12 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.03) { p.y = 0.03; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
        ps[n++] = p;
      }
      ps.length = n;
      const mesh = this.pMesh;
      for (let i = 0; i < n; i++) {
        const p = ps[i];
        _m.compose(_a.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s, p.s));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, p.c);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // ---------------------------------------------------------------- remote players
    ensureRemote(id) {
      if (this.remotes.has(id)) return this.remotes.get(id);
      const node = new THREE.Group();
      node.rotation.order = 'YXZ';
      this.scene.add(node);
      const colors = [[0.28, 0.35, 0.5], [0.5, 0.42, 0.25], [0.3, 0.42, 0.28], [0.45, 0.28, 0.42]];
      const col = colors[this.remotes.size % colors.length];
      const body = M.joint(node, [0, 0, 0]);
      const rig = M.soldier(body, col);
      M.bake(body);
      const name = Net.persona(id);
      const label = M.label(node, [0, 2.25, 0], name, 40, [0.8, 0.9, 1.0], { noDepth: true });
      const r = {
        id, node, body, rig, label, pos: [0, 0, 0], posV: node.position, yaw: 0, pitch: 0, w: '', down: false, dead: false, name,
        points: 500, kills: 0, hs: 0, downs: 0, stale: 0, flash: 0, walk: 0, gun: null, target: new THREE.Vector3(), labelKey: '',
      };
      this.remotes.set(id, r);
      this.setRemoteGun(r, 'pistol');
      return r;
    }

    setRemoteGun(r, id, pap = false) {
      if (r.w === id && r.pap === pap && r.gun) return;
      r.w = id;
      r.pap = pap;
      if (r.gun) r.rig.gun_mount.remove(r.gun);
      const g = M.gun(id, false, pap);
      if (!pap) M.bake(g);
      r.rig.gun_mount.add(g);
      r.gun = g;
      const fcol = id !== 'plasma' ? [1.0, 0.8, 0.35] : [0.4, 1.0, 0.5];
      r.flashMesh = M.box(g, g.userData.muzzle, [0.12, 0.12, 0.16], M.mat(fcol, 8, 0, 1, true), [0, 0, Math.PI / 4]);
      r.flashMesh.visible = false;
    }

    updateRemotes(dt) {
      for (const r of this.remotes.values()) {
        r.stale += dt;
        r.graceT = Math.max((r.graceT || 0) - dt, 0);
        if (r.down) r.bleedT = Math.max((r.bleedT || 0) - dt, 0);
        const node = r.node;
        const bx = node.position.x, bz = node.position.z;
        node.position.lerp(r.target, Math.min(1, dt * 14));
        node.rotation.y = DW.lerpAngle(node.rotation.y, r.yaw, Math.min(1, dt * 14));
        node.visible = !r.dead;
        const speed = Math.hypot(node.position.x - bx, node.position.z - bz) / Math.max(dt, 0.001);
        const moving = DW.clamp(speed / 5, 0, 1);
        r.walk += dt * (2 + speed * 1.7);
        const rig = r.rig;
        const sw = Math.sin(r.walk) * 0.6 * moving;
        rig.leg_l.rotation.x = sw;
        rig.leg_r.rotation.x = -sw;
        rig.knee_l.rotation.x = -Math.max(0, -Math.sin(r.walk - 0.6)) * 0.8 * moving;
        rig.knee_r.rotation.x = -Math.max(0, Math.sin(r.walk - 0.6)) * 0.8 * moving;
        rig.spine.rotation.x = DW.lerp(rig.spine.rotation.x, DW.clamp(r.pitch, -0.8, 0.8) * 0.6, Math.min(1, dt * 10));
        r.body.rotation.x = DW.lerp(r.body.rotation.x, r.down ? 1.35 : 0, Math.min(1, dt * 6));
        r.body.position.y = DW.lerp(r.body.position.y, r.down ? 0.3 : 0, Math.min(1, dt * 6));
        r.flash = DW.moveToward(r.flash, 0, dt * 40);
        if (r.flashMesh) r.flashMesh.visible = r.flash > 1.5;
        const key = r.name + (r.down ? '|d' : '');
        if (key !== r.labelKey) {
          r.labelKey = key;
          M.setLabel(r.label, r.name + (r.down ? '\n[DOWN - hold E to revive]' : ''), r.down ? [1.0, 0.45, 0.4] : [0.8, 0.9, 1.0]);
        }
      }
    }

    sendPstate(reliable) {
      if (!this.online || !this.player) return;
      const p = this.player;
      Net.sendAll('ps', {
        p: arr(p.pos), y: Math.round(p.yaw * 1000) / 1000, x: Math.round(p.pitch * 1000) / 1000, w: p.active().id,
        dn: p.downed, dd: p.dead, f: p.firedFlag > 0.1, bt: Math.round(p.bleedT), pp: p.active().pap | 0,
        s: p.points, k: p.kills, hs: p.headshots, d: p.downs, rv: p.revives, e: p.pointsEarned, bo: p.bosses,
        pg: this.host ? -1 : Math.round(this.myPing || 0), ns: this.mySentries(),
      }, reliable);
    }

    // clients ping the host once a second; the round trip shows on the Tab board
    updatePing(dt) {
      if (!this.online || this.host) return;
      this.pingT -= dt;
      if (this.pingT > 0) return;
      this.pingT = 1;
      Net.sendHost('ping', { t: Math.round(performance.now()) }, false);
    }

    teamRows(includeMe) {
      const rows = [];
      const p = this.player;
      if (includeMe) rows.push({
        name: Net.myName, points: p.points, earned: p.pointsEarned, kills: p.kills, hs: p.headshots, downs: p.downs, revives: p.revives,
        bosses: p.bosses, sentries: this.mySentries(), ping: this.host ? -1 : Math.round(this.myPing || 0), down: p.downed, dead: p.dead, me: true,
      });
      for (const [id, r] of this.remotes)
        rows.push({
          name: r.name, points: r.points, earned: r.earned || 0, kills: r.kills, hs: r.hs, downs: r.downs, revives: r.revives || 0,
          bosses: r.bosses || 0, sentries: r.sentries || 0, ping: id === Net.hostId ? -1 : (r.ping === undefined ? null : r.ping),
          down: r.down, dead: r.dead, me: false,
        });
      rows.sort((a, b) => b.points - a.points);
      return rows;
    }

    playerLeft(id) {
      for (const s of this.sentries.slice()) if (s.owner === id) this.removeSentry(s);
      const r = this.remotes.get(id);
      if (!r) return;
      this.scene.remove(r.node);
      this.remotes.delete(id);
      this.hud.centerMsg(`${r.name} left the game`, [0.8, 0.8, 0.8], 2.5);
    }

    // ---------------------------------------------------------------- networking
    sendSnapshot() {
      const a = [];
      for (const [id, z] of this.zombies) {
        if (z.dead) continue;
        a.push(id, DW.ZTYPES.indexOf(z.ztype), z.pos.x, z.pos.y, z.pos.z, z.yaw, z.hpFrac, z.swing);
      }
      Net.sendAll('zs', { a: new Float32Array(a), w: this.wave, st: this.state, t: this.stateT, rem: this.remaining(), tot: this.waveTotal }, false);
    }

    applySnapshot(data) {
      const a = data.a;
      this.state = data.st || this.state;
      this.stateT = data.t;
      this.remainingNet = data.rem | 0;
      this.waveTotal = data.tot | 0;
      const seen = new Set();
      for (let i = 0; i + 7 < a.length; i += 8) {
        const id = Math.round(a[i]);
        if (this.deadIds.has(id)) continue;
        seen.add(id);
        let z = this.zombies.get(id);
        if (!z) {
          const type = DW.ZTYPES[DW.clamp(Math.round(a[i + 1]), 0, DW.ZTYPES.length - 1)];
          z = new DW.Zombie(this, id, type, 100, { runner: 4.5, dodger: 2.8 }[type] || 2.0, 0, true, [a[i + 2], a[i + 3], a[i + 4]]);
          this.zombies.set(id, z);
        }
        z.targetPos.set(a[i + 2], a[i + 3], a[i + 4]);
        z.targetYaw = a[i + 5];
        z.hpFrac = a[i + 6];
        z.swing = Math.max(z.swing, a[i + 7]);
        z.miss = 0;
      }
      for (const [id, z] of [...this.zombies]) {
        if (seen.has(id)) continue;
        z.miss++;
        if (z.miss > 30) { this.zombies.delete(id); z.remove(); }
      }
    }

    handlePacket(sender, type, d) {
      if (this.gameOver && type !== 'over' && type !== 'bye') return;
      d = d || {};
      switch (type) {
        case 'ps': {
          if (sender === Net.myId) return;
          const r = this.ensureRemote(sender);
          if (Array.isArray(d.p)) { r.pos = d.p; r.target.fromArray(d.p); }
          r.yaw = +d.y || 0;
          r.pitch = +d.x || 0;
          this.setRemoteGun(r, DW.WEAPONS[d.w] ? d.w : 'pistol', DW.clamp(d.pp | 0, 0, 3));
          r.bleedT = +d.bt || 0;
          const wasDown = r.down;
          r.down = !!d.dn;
          if (wasDown && !r.down) r.graceT = 3.0;
          r.dead = !!d.dd;
          r.points = d.s | 0; r.kills = d.k | 0; r.hs = d.hs | 0; r.downs = d.d | 0;
          r.revives = d.rv | 0; r.earned = d.e | 0; r.bosses = d.bo | 0; r.sentries = d.ns | 0;
          if (d.pg !== undefined) r.ping = +d.pg;
          r.stale = 0;
          r.name = Net.persona(sender);
          if (r.down && !wasDown) {
            this.hud.centerMsg(`${r.name} IS DOWN\nFollow the red marker to revive`, [1.0, 0.4, 0.3], 3);
            Sfx.play('hurt', 0, 0.5);
          }
          if (wasDown && !r.down && !r.dead) this.hud.centerMsg(`${r.name} IS BACK UP`, [0.5, 1.0, 0.5], 1.5);
          break;
        }
        case 'sh': {
          const r = this.remotes.get(sender);
          if (r && Array.isArray(d.e)) this.showRemoteShot(r, d.e, !!d.p);
          break;
        }
        case 'wind':
          if (Array.isArray(d.p)) {
            const wp = v3(d.p);
            this.windBlast(wp, false);
            this.player.windKnock(wp);
          }
          break;
        case 'lift': this.setLift(d.i | 0, +d.t || 0); break;
        case 'sentry':
          if (Array.isArray(d.p) && !this.sentries.some(s => s.id === d.i)) this.addSentry(String(d.i), sender, d.p, +d.y || 0);
          break;
        case 'ping': if (this.host) Net.sendTo(sender, 'pong', { t: d.t }, false); break;
        case 'pong': {
          const rtt = performance.now() - (+d.t || 0);
          if (rtt >= 0 && rtt < 5000) this.myPing = this.myPing ? this.myPing * 0.7 + rtt * 0.3 : rtt;
          break;
        }
        case 'skip': if (this.host) this.addSkipVote(sender); break;
        case 'skipv':
          this.skipCount = [d.n | 0, d.of | 0];
          if (!this.host && +d.t <= 3) this.stateT = Math.min(this.stateT, +d.t);
          break;
        case 'rv':
          if (d.t === Net.myId) this.reviveIn = { by: sender, p: +d.p || 0, t: this.elapsed };
          else if (this.remotes.has(d.t)) { const r = this.remotes.get(d.t); r.reviveAt = this.elapsed; r.reviveP = +d.p || 0; }
          break;
        case 'zs': if (!this.host) this.applySnapshot(d); break;
        case 'zkill': if (!this.host) this.onZkill(d); break;
        case 'hit': if (this.host) this.applyDamage(d.z, Math.min(+d.d, 20000), !!d.h, sender, !!d.kn); break;
        case 'pdmg': this.player.takeDamage(+d.d, Array.isArray(d.f) ? d.f : null); break;
        case 'wave': if (!this.host) this.onWaveStart(d.n | 0, !!d.boss, !!d.goon); break;
        case 'wave_end': if (!this.host) this.onWaveEnd(); break;
        case 'aoe': if (!this.host) this.showAoe(d.p, +d.r, +d.t, String(d.k)); break;
        case 'pu': if (!this.host) this.spawnPu(d.i, String(d.t), d.p); break;
        case 'nukepay': if (sender === Net.hostId) this.onNukePay(d); break;
        case 'rope': if (sender !== Net.myId && d.a && d.b) this.rope(v3(d.a), v3(d.b), false); break;
        case 'yank':
          // a teammate's grapple reels me in while I'm down
          if (this.player.downed && d.p) { this.player.yank = { to: v3(d.p), t: 2 }; this.hud.centerMsg('BEING REELED IN', [0.5, 1.0, 0.6], 1.2); }
          break;
        case 'pu_take': if (this.host) this.takePu(d.i); break;
        case 'pu_fx': if (!this.host) this.applyPu(d.i, String(d.t)); break;
        case 'door': this.openDoor(d.i | 0); break;
        case 'box':
          if (d.s === 'roll' && DW.WEAPONS[d.c]) this.startBox(sender, d.c);
          else if (d.s === 'take' && this.boxOwner === sender) {
            this.hud.centerMsg(`${Net.persona(sender)} took the ${DW.WEAPONS[d.c] ? DW.WEAPONS[d.c].name : 'gun'}`, [0.6, 0.85, 1.0], 2);
            this.closeBox();
          }
          break;
        case 'revive':
          if (d.t === Net.myId) this.player.revive();
          else if (this.remotes.has(d.t)) { this.remotes.get(d.t).down = false; this.remotes.get(d.t).graceT = 3.0; }
          break;
        case 'fx':
          if (d.k === 'boom' && Array.isArray(d.p)) this.explode(v3(d.p), false);
          else if (d.k === 'enrage') this.announceEnrage(String(d.t));
          else if (d.k === 'screech') { this.hud.centerMsg('THE GOON LORD SCREECHES', [0.7, 0.95, 1.0], 2); Sfx.play('growl_boss', 4, 0.4); }
          break;
        case 'over': this.endGame(String(d.why || 'Game over.')); break;
        case 'bye': this.playerLeft(sender); break;
      }
    }

    // ---------------------------------------------------------------- end of match
    endGame(why) {
      if (this.gameOver) return;
      if (this.host) Net.sendAll('over', { why, wave: this.wave });
      this.gameOver = true;
      this.state = 'over';
      this.paused = false;
      this.player.inputEnabled = false;
      this.hud.setInteract('', 0);
      Sfx.play('wave_start', 0, 0.6);
      const p = this.player;
      const run = { map: this.mapId, diff: DW.diffId, wave: this.wave, kills: p.kills, headshots: p.headshots, bosses: p.bosses, points: p.pointsEarned, downs: p.downs, revives: p.revives, time: this.elapsed, players: this.playerCount() };
      const best = DW.stats.best_wave[`${run.map}:${run.diff}`] | 0;
      DW.recordRun(run);
      this.hud.showGameOver(why, run, this.host, run.wave > best);
    }

    quitMatch() {
      if (this.online && !this.gameOver) {
        if (this.host) Net.sendAll('over', { why: 'The host ended the match.', wave: this.wave });
        else Net.sendAll('bye', {});
      }
      this.onFinished(false);
    }

    restartSolo() { this.onFinished(true); }

    dispose() {
      Net.off('packet', this.onPacket);
      Net.off('player_left', this.onPlayerLeft);
      Net.off('host_left', this.onHostLeft);
      Sfx.stopMusic();
      this.hud.dispose();
      this.scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    }
  }
  World.PU_INFO = PU_INFO;
  DW.World = World;
})();
