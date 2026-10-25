// The local first-person player: movement, shooting, reloading, knife, grenades, perks,
// points, getting downed and revived. The gun is drawn in its own pass (vmScene) so it never
// clips into walls.
'use strict';
(function () {
  const M = DW.Models, I = DW.Input;
  const WALK = 5.0, SPRINT = 7.8, CROUCH = 2.6, JUMP = 4.8, GRAV = 15.0;
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();

  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.yaw = Math.PI;
      this.pitch = 0;
      this.onFloor = false;
      this.hp = 100; this.maxHp = 100; this.regenDelay = 0; this.armor = 0;
      this.downed = false; this.dead = false; this.bleedT = 0; this.selfReviveT = 0;
      this.points = 500; this.kills = 0; this.headshots = 0; this.bosses = 0; this.downs = 0; this.revives = 0; this.pointsEarned = 0;
      this.perks = [];
      const pd = DW.WEAPONS.pistol;
      this.weapons = [{ id: 'pistol', mag: pd.mag, reserve: pd.reserve }];
      this.cur = 0;
      this.downedWeapon = {};
      this.grenades = 2;
      this.fireCd = 0; this.reloading = false; this.reloadT = 0; this.switchT = 0;
      this.adsAmt = 0; this.sprinting = false; this.crouching = false;
      this.recoil = 0; this.bobT = 0; this.meleeCd = 0; this.meleeAnim = 0; this.firedFlag = 0;
      this.triggerHeld = false; this.interactHold = 0; this.inputEnabled = true;
      this.camHeight = 1.65; this.pivotY = 1.65; this.aimOnZombie = false;
      this.flashEnergy = 0;
      this.wind = { id: 'wind', mag: DW.WIND_CHARGES, reserve: 0 };
      this.windOut = false;
      this.windRegen = 0;
      this.airBoost = 0;

      this.camera = new THREE.PerspectiveCamera(DW.settings.fov, 16 / 9, 0.03, 300);
      this.camera.rotation.order = 'YXZ';
      // viewmodel scene
      this.vmScene = new THREE.Scene();
      this.vmCamera = new THREE.PerspectiveCamera(DW.settings.fov, 16 / 9, 0.01, 10);
      this.gunRoot = new THREE.Group();
      this.gunRoot.rotation.order = 'YXZ';
      this.gunRoot.position.set(0.2, -0.19, -0.42);
      this.vmScene.add(this.gunRoot);
      const def = world.mapDef;
      this.vmAmbientBase = def.ambient_energy * 1.6 + 0.35;
      this.vmAmbient = new THREE.AmbientLight(M.color(def.ambient), this.vmAmbientBase);
      this.vmScene.add(this.vmAmbient);
      const key = new THREE.DirectionalLight(M.color([1, 0.92, 0.82]), 0.7);
      key.position.set(0.5, 1, 0.6);
      this.vmScene.add(key);
      this.vmFlash = new THREE.PointLight(0xffcc73, 0, 3, 2);
      this.vmFlash.position.set(0.2, -0.05, -0.9);
      this.vmScene.add(this.vmFlash);
      this.buildGun();
    }

    active() { return this.downed ? this.downedWeapon : this.windOut ? this.wind : this.weapons[this.cur]; }
    wdata() { return DW.WEAPONS[this.active().id]; }
    alive() { return !this.downed && !this.dead; }
    eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.pivotY, this.pos.z); }
    forward(out = new THREE.Vector3()) {
      const cp = Math.cos(this.pitch);
      return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    }

    cycleWeapon() {
      if (this.windOut) this.switchTo(this.cur, true);
      else if (this.weapons.length > 1) this.switchTo((this.cur + 1) % this.weapons.length);
    }
    toggleWind() {
      if (this.windOut) { this.switchTo(this.cur, true); return; }
      this.windOut = true;
      this.reloading = false;
      this.switchT = 0.3;
      this.buildGun();
    }
    switchTo(i, force = false) {
      if (i < 0 || i >= this.weapons.length || (i === this.cur && !force)) return;
      this.cur = i;
      this.windOut = false;
      this.reloading = false;
      this.switchT = 0.45;
      this.buildGun();
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
      const w = this.world;
      if (this.dead) {
        this.vel.set(0, 0, 0);
        this.spectate(dt);
        this.syncCamera();
        return;
      }
      const canAct = this.inputEnabled && !w.gameOver;
      if (canAct && I.locked) this.look();
      this.move(dt, canAct);
      this.timers(dt);
      if (canAct) {
        this.combat(dt);
        this.updateAimTarget();
      } else this.triggerHeld = false;
      this.view(dt);
      this.syncCamera();
    }

    look() {
      const wd = this.wdata();
      let sens = DW.settings.sens * 0.01 * DW.lerp(1, 0.55, this.adsAmt);
      if (wd.ads === 0) sens *= DW.lerp(1, 0.5, this.adsAmt);
      this.yaw -= I.mouseDX * sens;
      this.pitch = DW.clamp(this.pitch - I.mouseDY * sens, -1.5, 1.5);
      if (I.wheel && !this.downed) this.cycleWeapon();
    }

    move(dt, canAct) {
      let [ix, iy] = canAct ? I.vector() : [0, 0];
      // world direction from local input (basis of yaw)
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      let dx = ix * c + iy * s, dz = -ix * s + iy * c;
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-4) { dx /= dl; dz /= dl; }
      this.crouching = canAct && I.action('crouch') && !this.downed;
      this.sprinting = canAct && I.action('sprint') && iy < -0.3 && this.adsAmt < 0.3 && !this.downed && !this.crouching && this.fireCd <= 0;
      let spd = WALK;
      if (this.sprinting) spd = SPRINT;
      if (this.crouching) spd = CROUCH;
      spd *= DW.lerp(1, 0.6, this.adsAmt);
      if (this.perks.includes('stam')) spd *= 1.2;
      if (this.downed) spd = 1.1;
      this.airBoost = Math.max(this.airBoost - dt, 0);
      const accel = this.onFloor ? 12 : this.airBoost > 0 ? 0.6 : 3;
      const k = Math.min(1, dt * accel);
      this.vel.x = DW.lerp(this.vel.x, dx * spd, k);
      this.vel.z = DW.lerp(this.vel.z, dz * spd, k);
      if (!this.onFloor) this.vel.y -= GRAV * dt;
      else if (canAct && I.justPressed('jump') && !this.downed) this.vel.y = JUMP;
      this.onFloor = this.world.phys.move(this.pos, this.vel, 0.4, 1.8, dt);
      if (this.pos.y < -20) this.pos.fromArray(this.world.respawnPoint());
      let th = 1.65;
      if (this.crouching) th = 1.05;
      if (this.downed) th = 0.5;
      this.camHeight = DW.lerp(this.camHeight, th, Math.min(1, dt * 10));
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onFloor && hs > 0.5) {
        const before = Math.floor(this.bobT / Math.PI);
        this.bobT += dt * hs * 1.6;
        if (Math.floor(this.bobT / Math.PI) !== before) DW.Sfx.play('step', this.sprinting ? -12 : -16, DW.randf(0.85, 1.1));
      }
      this.pivotY = this.camHeight + Math.sin(this.bobT * 2) * 0.03 * Math.min(hs / 5, 1.5) * (1 - this.adsAmt);
    }

    spectate(dt) {
      const r = this.world.spectateTarget();
      if (!r) return;
      const yaw = r.yaw;
      _v.set(r.pos[0] + Math.sin(yaw) * 3, r.pos[1] + 0.6, r.pos[2] + Math.cos(yaw) * 3);
      this.pos.lerp(_v, Math.min(1, dt * 5));
      this.yaw = DW.lerpAngle(this.yaw, yaw, Math.min(1, dt * 5));
      this.pitch = DW.lerp(this.pitch, -0.25, Math.min(1, dt * 5));
      this.pivotY = 1.65;
    }

    syncCamera() {
      this.camera.position.set(this.pos.x, this.pos.y + (this.pivotY || 1.65), this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.camera.updateMatrixWorld();
    }

    updateAimTarget() {
      const hit = this.world.raycast(this.eye(_o), this.forward(_d), 60, null);
      this.aimOnZombie = !!(hit && hit.zombie);
    }

    timers(dt) {
      this.fireCd = Math.max(this.fireCd - dt, 0);
      this.switchT = Math.max(this.switchT - dt, 0);
      this.meleeCd = Math.max(this.meleeCd - dt, 0);
      this.meleeAnim = Math.max(this.meleeAnim - dt * 4, 0);
      this.firedFlag = Math.max(this.firedFlag - dt, 0);
      this.recoil = DW.moveToward(this.recoil, 0, dt * 14);
      // wind charges refill one at a time
      if (this.wind.mag < DW.WIND_CHARGES) {
        this.windRegen += dt;
        if (this.windRegen >= DW.WIND_RECHARGE) { this.windRegen = 0; this.wind.mag++; }
      } else this.windRegen = 0;
      this.flashEnergy = DW.moveToward(this.flashEnergy, 0, dt * 60);
      this.vmFlash.intensity = this.flashEnergy * 0.6;
      if (this.flashMesh) this.flashMesh.visible = this.firedFlag > 0.1;
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.finishReload();
      }
      if (!this.downed) {
        if (this.regenDelay > 0) this.regenDelay -= dt;
        else this.hp = Math.min(this.maxHp, this.hp + 55 * dt);
      } else if (this.selfReviveT > 0) {
        this.selfReviveT -= dt;
        if (this.selfReviveT <= 0) this.revive();
      } else if (this.bleedT > 0) {
        this.bleedT -= dt;
        if (this.bleedT <= 0) this.bleedOut();
      }
    }

    combat(dt) {
      const w = this.world, hud = w.hud;
      const wantAds = I.action('ads') && !this.sprinting && !this.reloading && this.switchT <= 0;
      this.adsAmt = DW.moveToward(this.adsAmt, wantAds ? 1 : 0, dt * 6.5);
      const trig = I.action('fire') && (I.locked || I.force.fire);
      if (trig) this.tryFire();
      this.triggerHeld = trig;
      if (I.justPressed('reload')) this.startReload();
      if (this.downed) { hud.setInteract('', 0); return; }
      if (I.justPressed('weapon_1')) this.switchTo(0);
      if (I.justPressed('weapon_2')) this.switchTo(1);
      if (I.justPressed('weapon_4')) this.switchTo(2);
      if (I.justPressed('sentry')) w.placeSentry();
      if (I.justPressed('weapon_3')) this.toggleWind();
      if (I.justPressed('swap')) this.cycleWeapon();
      if (I.justPressed('melee')) this.melee();
      if (I.justPressed('grenade')) this.throwGrenade();
      const it = w.getInteraction();
      if (!it) { this.interactHold = 0; hud.setInteract('', 0); return; }
      const hold = it.hold || 0;
      if (hold > 0) {
        if (I.action('interact')) {
          this.interactHold += dt;
          if (it.revive) w.sendReviving(it.revive, Math.min(this.interactHold / hold, 1));
          if (this.interactHold >= hold) { this.interactHold = 0; it.action(); }
        } else this.interactHold = 0;
        hud.setInteract(it.text, this.interactHold / hold);
      } else {
        hud.setInteract(it.text, 0, this.points >= (it.cost || 0));
        if (I.justPressed('interact') && it.action) it.action();
      }
    }

    view(dt) {
      const wd = this.wdata();
      const fov = DW.settings.fov;
      const zoom = wd.ads === 0 ? 0.3 : 0.72;
      this.camera.fov = DW.lerp(fov, fov * zoom, this.adsAmt);
      this.camera.updateProjectionMatrix();
      this.vmCamera.fov = fov * DW.lerp(1, 0.85, this.adsAmt);
      this.vmCamera.updateProjectionMatrix();
      const hip = [0.2, -0.19, -0.42], aim = [0.0, this.adsY - 0.02, -0.34];
      const a = this.adsAmt;
      const p = [DW.lerp(hip[0], aim[0], a), DW.lerp(hip[1], aim[1], a), DW.lerp(hip[2], aim[2], a)];
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const bob = Math.min(hs / 5, 1.5) * (1 - a * 0.8);
      p[0] += Math.cos(this.bobT) * 0.012 * bob;
      p[1] += Math.abs(Math.sin(this.bobT)) * 0.012 * bob;
      p[2] += this.recoil * 0.012;
      if (this.sprinting) { p[0] -= 0.05; p[1] -= 0.05; p[2] += 0.05; }
      if (this.reloading) p[1] -= 0.12;
      p[1] -= this.switchT * 0.6;
      p[2] -= this.meleeAnim * 0.25;
      const k = Math.min(1, dt * 18);
      const g = this.gunRoot;
      g.position.set(DW.lerp(g.position.x, p[0], k), DW.lerp(g.position.y, p[1], k), DW.lerp(g.position.z, p[2], k));
      const rot = [this.recoil * 0.02 * (1 - a * 0.7), 0, 0];
      if (this.sprinting) { rot[0] -= 0.3; rot[1] += 0.6; rot[2] += 0.2; }
      if (this.reloading) { rot[0] += 0.5; rot[2] += 0.3; }
      const kr = Math.min(1, dt * 14);
      g.rotation.set(DW.lerp(g.rotation.x, rot[0], kr), DW.lerp(g.rotation.y, rot[1], kr), DW.lerp(g.rotation.z, rot[2], kr));
      const scoped = wd.ads === 0 && this.adsAmt > 0.85;
      g.visible = !scoped && !this.dead;
      this.world.hud.scopeVisible(scoped);
    }

    // ---------------------------------------------------------------- weapons
    tryFire() {
      const w = this.active(), wd = this.wdata();
      if (this.fireCd > 0 || this.reloading || this.switchT > 0 || this.meleeAnim > 0.2) return;
      if (!wd.auto && this.triggerHeld) return;
      if (w.mag <= 0) {
        if (!this.triggerHeld) DW.Sfx.play('empty');
        this.fireCd = 0.25;
        if (w.reserve > 0) this.startReload();
        return;
      }
      w.mag -= 1;
      if (w.id === 'wind') { this.fireWind(wd); return; }
      const rpm = wd.rpm * (this.perks.includes('tap') ? 1.33 : 1);
      this.fireCd = 60 / rpm;
      this.firedFlag = 0.15;
      DW.Sfx.play(wd.snd, -5);
      this.recoil += wd.kick;
      // view kick goes straight up only, so the dot stays exactly where your shots land
      const kick = wd.kick * Math.PI / 180 * 0.3 * (1 - this.adsAmt * 0.4);
      this.pitch = DW.clamp(this.pitch + kick, -1.5, 1.5);
      this.flashEnergy = 3;
      const plasma = w.id === 'plasma';
      this.vmFlash.color.set(plasma ? 0x4dff80 : 0xffcc73);
      const ends = [];
      for (let i = 0; i < wd.pellets; i++) ends.push(this.shootRay(wd, plasma));
      this.world.onLocalFire(w.id, ends, plasma);
    }

    // No spread: every shot travels exactly along the centre of the screen.
    shootRay(wd, plasma) {
      const from = this.eye(new THREE.Vector3());
      const dir = this.forward(new THREE.Vector3());
      const w = this.world;
      const excl = new Set();
      const mult = DW.PAP_DMG[this.active().pap | 0];
      // Deadshot boosts headshots; a headshot while airborne is a crit (like a Minecraft jump crit)
      const headMult = wd.head * (this.perks.includes('dead') ? 1.6 : 1);
      const airborne = !this.onFloor;
      let dmg = wd.dmg * mult;
      let endT = 300;
      for (let k = 0; k < wd.pierce; k++) {
        const hit = w.raycast(from, dir, 300, excl);
        if (!hit) break;
        endT = hit.t;
        const at = from.clone().addScaledVector(dir, hit.t);
        if (hit.zombie) {
          const z = hit.zombie;
          const crit = hit.head && airborne;
          const d = dmg * (hit.t <= wd.range ? 1 : 0.5) * (hit.head ? headMult : 1) * (crit ? DW.CRIT_MULT : 1);
          w.localHit(z, d, hit.head, false, at, crit);
          excl.add(z);
          dmg *= 0.75;
          if (wd.splash > 0) { w.localSplash(at, wd.splash, wd.dmg * mult, z); break; }
        } else {
          w.impactFx(at, hit.normal, plasma);
          if (wd.splash > 0) w.localSplash(at, wd.splash, wd.dmg * mult, null);
          break;
        }
      }
      const end = from.clone().addScaledVector(dir, endT);
      w.tracer(this.muzzleWorld(), end, plasma);
      return end;
    }

    muzzleWorld() {
      if (!this.muzzle) return this.eye(new THREE.Vector3());
      this.vmScene.updateMatrixWorld(true);
      const p = new THREE.Vector3();
      this.muzzle.getWorldPosition(p);
      // vm space is camera space; scale depth a little because the vm camera fov differs
      return p.applyMatrix4(this.camera.matrixWorld);
    }

    fireWind(wd) {
      this.fireCd = 60 / wd.rpm;
      this.firedFlag = 0.15;
      DW.Sfx.play('wind', -2);
      this.recoil += wd.kick;
      const f = this.forward(new THREE.Vector3());
      this.world.launchWind(this.muzzleWorld(), f, true);
    }

    // a wind blast went off at pos: get flung away from it (aim at your feet to boost)
    windKnock(pos) {
      if (!this.alive()) return;
      const dx = this.pos.x - pos.x, dy = this.pos.y + 0.9 - pos.y, dz = this.pos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      const R = 3.6;
      if (d > R) return;
      const k = 1 - d / R;
      const h = Math.hypot(dx, dz) || 1;
      const push = 10 * k + 4;
      this.vel.x += dx / h * push * Math.min(1, h / Math.max(d, 0.01) + 0.3);
      this.vel.z += dz / h * push * Math.min(1, h / Math.max(d, 0.01) + 0.3);
      this.vel.y = Math.max(this.vel.y, 5 + 7 * k * (dy > -0.2 ? 1 : 0.4));
      this.onFloor = false;
      this.airBoost = 1.2; // keep air control while flying
    }

    startReload() {
      const w = this.active(), wd = this.wdata();
      if (this.reloading || w.mag >= wd.mag || w.reserve <= 0 || this.switchT > 0) return;
      this.reloading = true;
      this.reloadT = wd.reload * (this.perks.includes('fast') ? 0.5 : 1);
      DW.Sfx.play('reload', -4);
    }
    finishReload() {
      this.reloading = false;
      const w = this.active(), wd = this.wdata();
      const take = Math.min(wd.mag - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }

    giveWeapon(id) {
      const wd = DW.WEAPONS[id];
      for (let i = 0; i < this.weapons.length; i++) {
        if (this.weapons[i].id === id) {
          this.weapons[i].reserve = wd.reserve;
          this.weapons[i].mag = wd.mag;
          this.switchTo(i, true);
          return;
        }
      }
      const entry = { id, mag: wd.mag, reserve: wd.reserve };
      if (this.weapons.length < this.slots()) {
        this.weapons.push(entry);
        this.switchTo(this.weapons.length - 1, true);
      } else {
        this.weapons[this.cur] = entry;
        this.switchTo(this.cur, true);
      }
    }
    // Pack-a-Poonch the gun in hand: gem finish, more damage, full ammo
    packAPunch() {
      const w = this.active(), wd = DW.WEAPONS[w.id];
      w.pap = Math.min(3, (w.pap | 0) + 1);
      w.mag = wd.mag;
      w.reserve = wd.reserve;
      this.reloading = false;
      this.switchT = 0.6;
      this.buildGun();
      this.world.sendPstate(true);
    }

    hasWeapon(id) { return this.weapons.some(w => w.id === id); }
    slots() { return this.perks.includes('mule') ? 3 : 2; }
    // Max Ammo: every gun full (mags too, so no reload needed) and grenades back up to 4
    refillAmmo() {
      for (const w of this.weapons) { w.reserve = DW.WEAPONS[w.id].reserve; w.mag = DW.WEAPONS[w.id].mag; }
      this.reloading = false;
      this.grenades = Math.max(this.grenades, 4);
    }
    // ammo resupply station: full mags and reserves on every gun
    refillAll() {
      for (const w of this.weapons) { w.reserve = DW.WEAPONS[w.id].reserve; w.mag = DW.WEAPONS[w.id].mag; }
      this.reloading = false;
    }

    melee() {
      if (this.meleeCd > 0 || this.switchT > 0) return;
      this.meleeCd = 0.75;
      this.meleeAnim = 1;
      this.reloading = false;
      DW.Sfx.play('knife', -3);
      const w = this.world;
      const f = this.forward(new THREE.Vector3());
      const fl = Math.hypot(f.x, f.z) || 1;
      // lunge toward a zombie right in front of us
      for (const z of w.zombies.values()) {
        const tx = z.pos.x - this.pos.x, tz = z.pos.z - this.pos.z, tl = Math.hypot(tx, tz);
        if (!z.dead && tl < 3.2 && tl > 1.2 && (f.x / fl * tx / tl + f.z / fl * tz / tl) > 0.8) {
          this.vel.x += tx / tl * 7; this.vel.z += tz / tl * 7;
          break;
        }
      }
      const eye = this.eye(new THREE.Vector3());
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const right = [cy, 0, -sy];
      const up = this.upVec();
      for (const off of [[0, 0, 0], [right[0] * 0.35, 0, right[2] * 0.35], [-right[0] * 0.35, 0, -right[2] * 0.35], [-up.x * 0.4, -up.y * 0.4, -up.z * 0.4]]) {
        const to = eye.clone().addScaledVector(f, 2.3).add(_v.set(off[0], off[1], off[2]));
        const dir = to.clone().sub(eye);
        const len = dir.length();
        dir.multiplyScalar(1 / len);
        const hit = w.raycast(eye, dir, len, null);
        if (hit && hit.zombie) {
          DW.Sfx.play('melee_hit', -2);
          w.localHit(hit.zombie, 160, false, true, eye.clone().addScaledVector(dir, hit.t));
          return;
        }
      }
    }
    upVec() {
      const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
      return new THREE.Vector3(-Math.sin(this.yaw) * -sp, cp, -Math.cos(this.yaw) * -sp);
    }

    throwGrenade() {
      if (this.grenades <= 0) { DW.Sfx.play('empty'); return; }
      this.grenades -= 1;
      DW.Sfx.play('throw');
      const f = this.forward(new THREE.Vector3());
      const start = this.eye(new THREE.Vector3()).addScaledVector(f, 0.6);
      const vel = f.clone().multiplyScalar(15).add(_v.set(0, 3.5, 0)).addScaledVector(this.vel, 0.5);
      this.world.throwGrenade(start, vel);
    }

    buildGun() {
      if (this.gunModel) this.gunRoot.remove(this.gunModel);
      const id = this.active().id;
      const gm = this.gunModel = new THREE.Group();
      gm.scale.setScalar(0.9);
      this.gunRoot.add(gm);
      const g = M.gun(id, false, this.active().pap | 0);
      // aim-down-sights height: the top of the gun sits just under the centre dot
      const bb = new THREE.Box3().setFromObject(g);
      this.adsY = -bb.max.y * 0.9 - 0.012;
      gm.add(g);
      const length = this.wdata().len;
      const sleeve = M.mat([0.24, 0.27, 0.2]), glove = M.mat([0.07, 0.07, 0.07]), cuff = M.mat([0.16, 0.17, 0.13]);
      M.box(gm, [0.0, -0.075, 0.03], [0.075, 0.08, 0.09], glove);
      M.box(gm, [0.05, -0.15, 0.24], [0.085, 0.09, 0.34], sleeve, [0.45, 0.25, 0]);
      M.box(gm, [0.025, -0.1, 0.1], [0.09, 0.095, 0.05], cuff, [0.45, 0.25, 0]);
      if (length > 0.4 || id === 'plasma') {
        const fz = id !== 'plasma' ? -length * 0.48 : -0.22;
        M.box(gm, [-0.01, -0.025, fz], [0.08, 0.07, 0.1], glove);
        M.box(gm, [-0.07, -0.08, fz + 0.15], [0.08, 0.085, 0.28], sleeve, [0.3, -0.45, 0]);
      } else {
        M.box(gm, [-0.03, -0.07, 0.0], [0.06, 0.07, 0.08], glove);
        M.box(gm, [-0.09, -0.15, 0.2], [0.085, 0.09, 0.32], sleeve, [0.45, -0.35, 0]);
      }
      M.bake(g, false);
      this.muzzle = M.joint(gm, g.userData.muzzle);
      const fcol = id !== 'plasma' ? [1.0, 0.8, 0.35] : [0.4, 1.0, 0.5];
      this.flashMesh = M.box(this.muzzle, [0, 0, 0], [0.1, 0.1, 0.14], M.mat(fcol, 8, 0, 1, true), [0, 0, Math.PI / 4]);
      this.flashMesh.visible = false;
    }

    // ---------------------------------------------------------------- health & points
    addPoints(n, raw = false) {
      let v = n;
      if (!raw) v = Math.round(n * DW.diff().pts * (this.world.doubleT > 0 ? 2 : 1));
      this.points += v;
      this.pointsEarned += v;
      this.world.hud.popupPoints(v);
    }
    spend(n) {
      if (this.points < n) {
        DW.Sfx.play('deny');
        this.world.hud.flashPoints();
        return false;
      }
      this.points -= n;
      DW.Sfx.play('buy', -2);
      return true;
    }
    takeDamage(d, from) {
      if (!this.alive() || this.world.gameOver) return;
      if (from) {
        // angle of the attacker relative to where we look (0 = in front, + = right)
        const dx = from[0] - this.pos.x, dz = from[2] - this.pos.z;
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        this.world.hud.damageDir(Math.atan2(lx, -lz));
      }
      // armour soaks damage first
      if (this.armor > 0) {
        const a = Math.min(this.armor, d);
        this.armor -= a;
        d -= a;
        if (this.armor <= 0) this.world.hud.centerMsg('ARMOR BROKEN', [0.5, 0.75, 1.0], 1.2);
      }
      this.hp -= d;
      this.regenDelay = DW.diffId < 3 ? 4.0 : 5.5;
      DW.Sfx.play('hurt', -2);
      this.world.hud.flashDamage(d);
      if (this.hp <= 0) this.goDown();
    }
    goDown() {
      const w = this.world;
      this.hp = 0;
      this.downed = true;
      this.downs += 1;
      this.reloading = false;
      this.adsAmt = 0;
      const hadWind = this.perks.includes('wind');
      this.perks = [];
      this.maxHp = 100;
      this.armor = 0;
      // losing Mule Kick drops the third gun
      if (this.weapons.length > 2) { this.weapons.length = 2; this.cur = Math.min(this.cur, 1); }
      const pd = DW.WEAPONS.pistol;
      this.downedWeapon = { id: 'pistol', mag: pd.mag, reserve: pd.mag * 3 };
      this.buildGun();
      if (w.solo) {
        if (hadWind) {
          this.selfReviveT = 4;
          w.hud.centerMsg('SECOND WIND\nThe horde backs off - get ready to run', [0.3, 0.6, 1.0], 3);
        } else w.localPlayerOut();
      } else this.bleedT = 30;
      w.sendPstate(true);
    }
    revive() {
      if (!this.downed) return;
      this.downed = false;
      this.bleedT = 0;
      this.selfReviveT = 0;
      this.hp = this.maxHp * 0.6;
      this.regenDelay = 1;
      this.world.onLocalRevive();
      this.buildGun();
      this.world.hud.centerMsg('REVIVED', [0.5, 1.0, 0.5], 1.5);
      this.world.sendPstate(true);
    }
    bleedOut() {
      this.downed = false;
      this.dead = true;
      this.gunRoot.visible = false;
      this.world.hud.centerMsg("YOU BLED OUT\nYou'll respawn next wave", [0.9, 0.2, 0.2], 4);
      this.world.sendPstate(true);
    }
    respawn(pos) {
      this.dead = false;
      this.downed = false;
      this.hp = 100;
      this.maxHp = 100;
      this.armor = 0;
      this.perks = [];
      const pd = DW.WEAPONS.pistol;
      this.weapons = [{ id: 'pistol', mag: pd.mag, reserve: pd.reserve }];
      this.cur = 0;
      this.windOut = false;
      this.wind.mag = DW.WIND_CHARGES;
      this.pos.fromArray(pos);
      this.vel.set(0, 0, 0);
      this.gunRoot.visible = true;
      this.buildGun();
      this.world.sendPstate(true);
    }
    addPerk(id) {
      if (this.perks.includes(id)) return;
      this.perks.push(id);
      if (id === 'iron') { this.maxHp = 250; this.hp = this.maxHp; }
    }
  }
  DW.Player = Player;
})();
