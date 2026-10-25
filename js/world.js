// A running match. The host (or a solo player) simulates zombies and waves;
// everyone simulates their own player and reports hits to the host.
'use strict';
(function () {
  const M = DW.Models, Net = DW.Net, Sfx = DW.Sfx;
  const MAX_ALIVE = 24;
  const SNAP_RATE = 1 / 15;
  const PSTATE_RATE = 1 / 20;
  const LAMP_LIGHTS = 8;
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
      this.boxState = 'idle';
      this.boxRollT = 0;
      this.boxChoice = '';
      this.boxSwapT = 0;
      this.boxHolder = null;
      this.paused = false;
      this.relocations = 0;
      this.myGraceT = 0;
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
      s.add(new THREE.AmbientLight(M.color(def.ambient), def.ambient_energy * 1.35));
      if (def.moon > 0) {
        const moon = new THREE.DirectionalLight(M.color([0.6, 0.7, 1.0]), def.moon);
        // Godot rotation (-55, 35, 0) degrees: light travels along -Z of that basis
        const e = new THREE.Euler(-55 * Math.PI / 180, 35 * Math.PI / 180, 0, 'YXZ');
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
        moon.position.copy(dir).multiplyScalar(-40);
        moon.target.position.set(0, 0, 0);
        moon.castShadow = true;
        moon.shadow.mapSize.set(2048, 2048);
        const sc = moon.shadow.camera;
        sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 100;
        moon.shadow.bias = -0.0006;
        moon.shadow.normalBias = 0.03;
        s.add(moon);
        s.add(moon.target);
      }
      // fixed pool of point lights (changing the light count would recompile every shader)
      this.lampLights = [];
      for (let i = 0; i < LAMP_LIGHTS; i++) {
        const l = new THREE.PointLight(0xffffff, 0, 10, 1.3);
        s.add(l);
        this.lampLights.push(l);
      }
      this.muzzleLight = new THREE.PointLight(0xffcc73, 0, 6, 1.5);
      this.boomLight = new THREE.PointLight(0xff9a4d, 0, 10, 1.5);
      this.puLights = [new THREE.PointLight(0xffffff, 0, 4, 1.3), new THREE.PointLight(0xffffff, 0, 4, 1.3)];
      s.add(this.muzzleLight, this.boomLight, ...this.puLights);
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
        L.intensity = l.energy * fade;
      }
      const p = this.player;
      p.forward(_a);
      this.muzzleLight.position.set(cam.x + _a.x * 1.0, cam.y - 0.1 + _a.y, cam.z + _a.z * 1.0);
      this.muzzleLight.intensity = p.flashEnergy;
      this.muzzleLight.color.set(p.active().id === 'plasma' ? 0x4dff80 : 0xffcc73);
      this.boomLight.intensity = DW.moveToward(this.boomLight.intensity, 0, dt * 20);
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
      this.updateFx(dt);
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

    hostTick(dt) {
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
            this.spawnZombie(Math.random() < runnerChance ? 'runner' : 'walker', this.pickSpawn());
          }
        }
        if (this.toSpawn <= 0 && !this.bossQueue.length && this.zombies.size === 0) {
          this.state = 'intermission';
          this.stateT = 10;
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
      if (this.wave % every === 0) {
        const bi = this.wave / every;
        this.bossQueue.push(bi % 2 === 1 ? 'brute' : 'spitter');
        if (bi >= 3) this.bossQueue.push(bi % 2 === 1 ? 'spitter' : 'brute');
        this.toSpawn = Math.floor(this.toSpawn * 0.5);
      }
      this.state = 'wave';
      this.spawnT = 2.5;
      const boss = this.bossQueue.length > 0;
      Net.sendAll('wave', { n: this.wave, boss });
      this.onWaveStart(this.wave, boss);
    }

    onWaveStart(n, boss) {
      this.wave = n;
      this.state = 'wave';
      Sfx.play('wave_start', 2);
      if (boss) this.hud.centerMsg(`WAVE ${n}\nBOSS INCOMING`, [1.0, 0.2, 0.15], 3.5);
      else this.hud.centerMsg(`WAVE ${n}`, [0.85, 0.1, 0.08], 2.5);
      if (this.player.dead) this.player.respawn(this.respawnPoint());
      if (n === DW.BOX_UNLOCK_WAVE && this.info.boxes.length) {
        DW.Models.setLabel(this.info.boxes[0].label, 'MYSTERY BOX  ' + DW.BOX_COST, [0.6, 0.85, 1.0]);
        this.hud.centerMsg(boss ? `WAVE ${n}
BOSS INCOMING
Mystery Box open` : `WAVE ${n}
The Mystery Box is open`, boss ? [1.0, 0.2, 0.15] : [0.6, 0.85, 1.0], 3.5);
      }
      this.player.grenades = Math.min(this.player.grenades + 2, 4);
    }

    onWaveEnd() {
      this.state = 'intermission';
      this.stateT = 10;
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
      else if (type === 'brute') { hp = Math.max(6000, hp * 16) * (1 + 0.6 * (n - 1)); spd = 3.1; dmg = 65; }
      else if (type === 'spitter') { hp = Math.max(5000, hp * 13) * (1 + 0.6 * (n - 1)); spd = 2.7; dmg = 42; }
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
    localHit(z, dmg, head, knife, at) {
      if (z.dead) return;
      this.player.addPoints(10);
      z.flinch(head);
      this.hud.hitMarker(head);
      Sfx.play(head ? 'headshot' : 'hit', -6);
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
      if (this.instaT > 0 && !z.isBoss()) dmg = z.hp + 1;
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
      const msg = { z: zid, by, h: head, kn: knife, nk: nuke, b: z.isBoss(), p: pos };
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
        if (msg.b) { p.bosses++; p.addPoints(500); }
        else if (msg.kn) p.addPoints(130);
        else p.addPoints(head ? 100 : 60);
      }
      if (msg.b) {
        this.hud.centerMsg('BOSS DOWN', [1.0, 0.8, 0.3], 2.5);
        if (msg.by !== Net.myId) p.addPoints(200);
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
        this.player.addPoints(400, true);
        Sfx.play('explode', 4);
        this.hud.flashDamage(0);
        if (this.host) for (const [zid, z] of [...this.zombies]) if (!z.isBoss()) this.killZombie(zid, '', false, false, true);
      }
    }

    // ---------------------------------------------------------------- interactions
    getInteraction() {
      const p = this.player;
      if (this.gameOver || !p.alive()) return null;
      const pp = p.pos;
      for (const [id, r] of this.remotes) {
        if (r.down && !r.dead && r.posV.distanceTo(pp) < 2.3) {
          const t = p.perks.includes('wind') ? 1.5 : 3.0;
          return { text: `Hold E to revive ${r.name}`, hold: t, action: () => this.reviveRemote(id) };
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
      for (const bx of this.info.boxes) {
        if (Math.hypot(bx.pos[0] - pp.x, bx.pos[1] - pp.y, bx.pos[2] - pp.z) < 2.2) {
          if (this.wave < DW.BOX_UNLOCK_WAVE) return { text: `The Mystery Box opens on wave ${DW.BOX_UNLOCK_WAVE}` };
          if (this.boxState === 'rolling') return { text: 'The box is spinning...' };
          if (this.boxState === 'ready') return { text: `Press E to take ${DW.WEAPONS[this.boxChoice].name}`, action: () => this.takeBoxWeapon() };
          return { text: `Press E for a random weapon  [${DW.BOX_COST}]`, cost: DW.BOX_COST, action: () => this.buyBox() };
        }
      }
      for (const pk of this.info.perks) {
        if (Math.hypot(pk.pos[0] - pp.x, pk.pos[1] - pp.y, pk.pos[2] - pp.z) < 2.0) {
          const pd = DW.PERKS[pk.perk];
          if (p.perks.includes(pk.perk)) return { text: `You already have ${pd.name}` };
          if (p.perks.length >= 4) return { text: 'You can only hold 4 perks' };
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
      this.boxChoice = pool[pool.length - 1];
      for (const w of pool) { roll -= DW.BOX_WEIGHT[w] || 1; if (roll <= 0) { this.boxChoice = w; break; } }
      this.boxState = 'rolling';
      this.boxRollT = 2.6;
      this.boxSwapT = 0;
      this.boxHolder = new THREE.Group();
      const bp = this.info.boxes[0].pos;
      this.boxHolder.position.set(bp[0], 0.95, bp[2]);
      this.scene.add(this.boxHolder);
      Sfx.play3d('box_spin', this.boxHolder.position, 0);
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
          Sfx.play('pickup');
        }
      } else if (this.boxState === 'ready') {
        h.position.y += Math.sin(this.elapsed * 3) * dt * 0.1;
        if (this.boxRollT <= 0) {
          this.boxState = 'idle';
          this.scene.remove(h);
          this.hud.centerMsg('The box closed', [0.6, 0.85, 1.0], 1.5);
        }
      }
    }

    takeBoxWeapon() {
      if (this.boxState !== 'ready') return;
      this.player.giveWeapon(this.boxChoice);
      this.hud.centerMsg(DW.WEAPONS[this.boxChoice].name.toUpperCase(), [0.6, 0.85, 1.0], 2);
      this.boxState = 'idle';
      this.scene.remove(this.boxHolder);
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

    onLocalFire() {}

    announceEnrage(type) {
      this.hud.centerMsg(`THE ${type === 'brute' ? 'BRUTE' : 'ABOMINATION'} IS ENRAGED`, [1.0, 0.35, 0.1], 2.5);
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

    setRemoteGun(r, id) {
      if (r.w === id && r.gun) return;
      r.w = id;
      if (r.gun) r.rig.gun_mount.remove(r.gun);
      const g = M.gun(id);
      M.bake(g);
      r.rig.gun_mount.add(g);
      r.gun = g;
    }

    updateRemotes(dt) {
      for (const r of this.remotes.values()) {
        r.stale += dt;
        r.graceT = Math.max((r.graceT || 0) - dt, 0);
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
        rig.knee_l.rotation.x = Math.max(0, -Math.sin(r.walk - 0.6)) * 0.8 * moving;
        rig.knee_r.rotation.x = Math.max(0, Math.sin(r.walk - 0.6)) * 0.8 * moving;
        rig.spine.rotation.x = DW.lerp(rig.spine.rotation.x, DW.clamp(r.pitch, -0.8, 0.8) * 0.6, Math.min(1, dt * 10));
        r.body.rotation.x = DW.lerp(r.body.rotation.x, r.down ? 1.35 : 0, Math.min(1, dt * 6));
        r.body.position.y = DW.lerp(r.body.position.y, r.down ? 0.3 : 0, Math.min(1, dt * 6));
        r.flash = DW.moveToward(r.flash, 0, dt * 40);
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
        dn: p.downed, dd: p.dead, f: p.firedFlag > 0.1,
        s: p.points, k: p.kills, hs: p.headshots, d: p.downs,
      }, reliable);
    }

    teamRows(includeMe) {
      const rows = [];
      const p = this.player;
      if (includeMe) rows.push({ name: Net.myName, points: p.points, kills: p.kills, hs: p.headshots, downs: p.downs, down: p.downed, dead: p.dead, me: true });
      for (const r of this.remotes.values())
        rows.push({ name: r.name, points: r.points, kills: r.kills, hs: r.hs, downs: r.downs, down: r.down, dead: r.dead, me: false });
      rows.sort((a, b) => b.points - a.points);
      return rows;
    }

    playerLeft(id) {
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
      Net.sendAll('zs', { a: new Float32Array(a), w: this.wave, st: this.state, t: this.stateT }, false);
    }

    applySnapshot(data) {
      const a = data.a;
      this.state = data.st || this.state;
      this.stateT = data.t;
      const seen = new Set();
      for (let i = 0; i + 7 < a.length; i += 8) {
        const id = Math.round(a[i]);
        if (this.deadIds.has(id)) continue;
        seen.add(id);
        let z = this.zombies.get(id);
        if (!z) {
          const type = DW.ZTYPES[DW.clamp(Math.round(a[i + 1]), 0, 3)];
          z = new DW.Zombie(this, id, type, 100, type !== 'runner' ? 2.0 : 4.5, 0, true, [a[i + 2], a[i + 3], a[i + 4]]);
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
          this.setRemoteGun(r, DW.WEAPONS[d.w] ? d.w : 'pistol');
          const wasDown = r.down;
          r.down = !!d.dn;
          if (wasDown && !r.down) r.graceT = 3.0;
          r.dead = !!d.dd;
          r.points = d.s | 0; r.kills = d.k | 0; r.hs = d.hs | 0; r.downs = d.d | 0;
          r.stale = 0;
          r.name = Net.persona(sender);
          if (r.down && !wasDown) this.hud.centerMsg(`${r.name} IS DOWN`, [1.0, 0.4, 0.3], 2);
          if (d.f && r.flash < 0.5) {
            r.flash = 3;
            const wd = DW.WEAPONS[r.w] || DW.WEAPONS.pistol;
            Sfx.play3d(wd.snd, [r.pos[0], r.pos[1] + 1.4, r.pos[2]], -4);
          }
          break;
        }
        case 'zs': if (!this.host) this.applySnapshot(d); break;
        case 'zkill': if (!this.host) this.onZkill(d); break;
        case 'hit': if (this.host) this.applyDamage(d.z, Math.min(+d.d, 20000), !!d.h, sender, !!d.kn); break;
        case 'pdmg': this.player.takeDamage(+d.d, Array.isArray(d.f) ? d.f : null); break;
        case 'wave': if (!this.host) this.onWaveStart(d.n | 0, !!d.boss); break;
        case 'wave_end': if (!this.host) this.onWaveEnd(); break;
        case 'aoe': if (!this.host) this.showAoe(d.p, +d.r, +d.t, String(d.k)); break;
        case 'pu': if (!this.host) this.spawnPu(d.i, String(d.t), d.p); break;
        case 'pu_take': if (this.host) this.takePu(d.i); break;
        case 'pu_fx': if (!this.host) this.applyPu(d.i, String(d.t)); break;
        case 'door': this.openDoor(d.i | 0); break;
        case 'revive':
          if (d.t === Net.myId) this.player.revive();
          else if (this.remotes.has(d.t)) { this.remotes.get(d.t).down = false; this.remotes.get(d.t).graceT = 3.0; }
          break;
        case 'fx':
          if (d.k === 'boom' && Array.isArray(d.p)) this.explode(v3(d.p), false);
          else if (d.k === 'enrage') this.announceEnrage(String(d.t));
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
