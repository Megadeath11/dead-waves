// A zombie. On the host it runs AI (flow-field pathing, attacks, boss abilities).
// On clients it is a puppet that follows snapshots from the host.
'use strict';
(function () {
  const M = DW.Models;
  const RISE_TIME = 1.3;
  const SCALE = { walker: 1.0, runner: 0.97, brute: 1.7, spitter: 1.35, goonlord: 2.2 };
  const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

  class Zombie {
    constructor(world, id, type, hp, spd, dmg, puppet, pos) {
      this.world = world;
      this.zid = id;
      this.ztype = type;
      this.maxHp = hp;
      this.hp = hp;
      this.hpFrac = 1;
      this.speed = spd;
      this.damage = dmg;
      this.puppet = puppet;
      this.dead = false;
      this.s = SCALE[type] || 1;
      this.targetPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
      this.targetYaw = 0;
      this.vel = new THREE.Vector3();
      this.repathT = 0;
      this.steerPt = null;
      this.attackT = 0.8;
      this.abilityT = 5.0;
      this.swing = 0;
      this.flinchT = 0;
      this.animT = Math.random() * Math.PI * 2;
      this.groanT = DW.randf(1, 6);
      this.stuckT = 0;
      this.riseT = RISE_TIME;
      this.miss = 0;
      this.twitch = 0;
      this.hasLos = true;
      this.onFloor = false;
      this.colR = Math.min(0.32 * this.s * (type === 'brute' ? 1.2 : 1), 0.42);

      this.root = new THREE.Group();
      this.root.rotation.order = 'YXZ';
      this.root.position.copy(this.targetPos);
      this.pos = this.root.position;
      this.bodyRoot = M.joint(this.root, [0, 0, 0]);
      this.bodyRoot.scale.setScalar(this.s);
      this.rig = type === 'goonlord' ? M.wendygoon(this.bodyRoot, DW.rng(id * 7919 + 13)) : M.zombie(this.bodyRoot, type, DW.rng(id * 7919 + 13));
      this.lungeT = 0; this.lungeCd = 4; this.screechT = 10;
      M.bake(this.bodyRoot);
      world.scene.add(this.root);
      this.lastPos = this.pos.clone();
      this.bodyRoot.position.y = -1.9 * this.s;
      world.dirtBurst(this.pos, this.s);
    }

    get yaw() { return this.root.rotation.y; }
    set yaw(v) { this.root.rotation.y = v; }
    isBoss() { return this.ztype === 'brute' || this.ztype === 'spitter' || this.ztype === 'goonlord'; }

    // Ray test against body capsule and head sphere. Returns {t, head} or null.
    // Hit boxes follow the animated skeleton (so a hunched, swaying or side-on zombie is hit where it
    // is drawn): a sphere on the head, a capsule from hips to neck, and one from the feet to the hips.
    hitTest(ro, rd, maxT) {
      if (this.dead) return null;
      const s = this.s, p = this.pos, rig = this.rig;
      this.root.updateMatrixWorld(true);
      const torsoR = s * ({ brute: 0.3, spitter: 0.27, goonlord: 0.2 }[this.ztype] || 0.21);
      rig.hips.getWorldPosition(_a);
      // capsule top sits one radius below the neck so its rounded end doesn't cover the head
      _b.set(0, Math.max(0.6 - torsoR / s, 0.2), 0);
      rig.spine.localToWorld(_b);
      const tt = DW.rayCapsule(ro, rd, _a, _b, torsoR);
      _p.set(p.x, p.y + 0.12 * s, p.z);
      const tl = DW.rayCapsule(ro, rd, _p, _a, 0.17 * s);
      _p.set(0, 0.13, 0);
      rig.head.localToWorld(_p);
      const th = DW.raySphere(ro, rd, _p, 0.2 * s);
      let best = null;
      for (const t of [tt, tl]) if (t >= 0 && t <= maxT && (!best || t < best.t)) best = { t, head: false };
      if (th >= 0 && th <= maxT && (!best || th <= best.t + 0.05)) best = { t: th, head: true };
      return best;
    }

    flinch(head) { this.flinchT = head ? 1.4 : 1.0; }

    // Limbs hang along -Y: a positive x rotation swings an arm forward (-Z, toward the target),
    // bends an elbow and lifts a knee forward, so knees use negative values to bend back.
    animate(dt, moving) {
      const rig = this.rig;
      this.animT += dt * (2.2 + this.speed * 1.5) * Math.max(moving, 0.15);
      this.swing = Math.max(this.swing - dt * 3, 0);
      this.flinchT = Math.max(this.flinchT - dt * 6, 0);
      this.twitch = DW.moveToward(this.twitch, 0, dt * 3);
      if (Math.random() < dt * 0.4) this.twitch = DW.randf(-1, 1);
      const t = this.animT;
      const sw = Math.sin(t) * 0.65 * moving;
      rig.leg_l.rotation.x = sw;
      rig.leg_r.rotation.x = -sw;
      rig.knee_l.rotation.x = -(Math.max(0, -Math.sin(t - 0.6)) * 0.9 * moving + 0.05);
      rig.knee_r.rotation.x = -(Math.max(0, Math.sin(t - 0.6)) * 0.9 * moving + 0.05);
      rig.hips.position.y = 0.95 - Math.abs(Math.sin(t)) * 0.04 * moving;
      const spine = rig.spine, swing = this.swing;
      if (this.ztype === 'runner') {
        spine.rotation.x = -0.35 * Math.max(moving, 0.3);
        rig.arm_l.rotation.x = -(Math.sin(t) * 1.1 * moving - 0.3 - swing * 1.4);
        rig.arm_r.rotation.x = -(-Math.sin(t) * 1.1 * moving - 0.3 - swing * 1.6);
        rig.elbow_l.rotation.x = 0.9;
        rig.elbow_r.rotation.x = 0.9;
      } else if (this.ztype === 'brute') {
        spine.rotation.x = -0.15;
        rig.arm_l.rotation.x = -(-0.3 + Math.sin(t) * 0.35 * moving - swing * 2.2);
        rig.arm_r.rotation.x = -(-0.3 - Math.sin(t) * 0.35 * moving - swing * 2.4);
        rig.arm_l.rotation.z = -0.25;
        rig.arm_r.rotation.z = 0.25;
        rig.elbow_l.rotation.x = -(-0.5 + swing * 0.4);
        rig.elbow_r.rotation.x = -(-0.5 + swing * 0.4);
      } else if (this.ztype === 'goonlord') {
        // hunched, arms hanging long and low; during a lunge the claws go out in front
        const lunge = this.lungeT > 0 ? 1 : 0;
        spine.rotation.x = -0.45 + Math.sin(t * 0.5) * 0.05;
        rig.arm_l.rotation.x = 0.35 + Math.sin(t) * 0.25 * moving + swing * 1.6 + lunge * 1.0;
        rig.arm_r.rotation.x = 0.35 - Math.sin(t) * 0.25 * moving + swing * 1.9 + lunge * 1.0;
        rig.arm_l.rotation.z = -0.12;
        rig.arm_r.rotation.z = 0.12;
        rig.elbow_l.rotation.x = 0.3 + swing * 0.5;
        rig.elbow_r.rotation.x = 0.3 + swing * 0.5;
      } else {
        const reach = -1.3 + Math.sin(t * 0.5) * 0.12;
        rig.arm_l.rotation.x = -(reach + swing * 1.5 + Math.sin(t * 0.7) * 0.08);
        rig.arm_r.rotation.x = -(reach - 0.12 + swing * 1.9);
        rig.elbow_l.rotation.x = -(-0.2 - swing * 0.6);
        rig.elbow_r.rotation.x = -(-0.3 - swing * 0.7);
        spine.rotation.x = this.ztype === 'walker' ? -0.12 : 0.15; // walkers hunch forward, the bloated one leans back
      }
      spine.rotation.x += this.flinchT * 0.35; // jolt back when shot
      spine.rotation.z = Math.sin(t * 0.5) * 0.07 * (this.ztype !== 'runner' ? 1 : 0.4);
      rig.head.rotation.z = this.twitch * 0.25 + Math.sin(t * 0.5 + 1) * 0.06;
      rig.head.rotation.x = this.flinchT * 0.4 + (this.ztype === 'spitter' ? 0.15 : 0);
      rig.jaw.rotation.x = 0.15 + Math.abs(Math.sin(t * 0.37)) * 0.25 + swing * 0.35;
    }

    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      if (this.riseT > 0) {
        this.riseT -= dt;
        const k = 1 - DW.clamp(this.riseT / RISE_TIME, 0, 1);
        this.bodyRoot.position.y = DW.lerp(-1.9 * this.s, 0, 1 - Math.pow(1 - k, 2));
        this.bodyRoot.rotation.x = (1 - k) * -0.5;
        this.rig.arm_l.rotation.x = -(-2.6 * (1 - k) - 1.3 * k);
        this.rig.arm_r.rotation.x = -(-2.9 * (1 - k) - 1.3 * k);
        if (this.puppet) this.pos.lerp(this.targetPos, Math.min(1, dt * 12));
        return;
      }
      this.bodyRoot.position.y = 0;
      this.bodyRoot.rotation.x = 0;
      this.groanT -= dt;
      if (this.groanT <= 0) {
        const boss = this.isBoss();
        this.groanT = boss ? DW.randf(3, 6) : DW.randf(4, 10);
        _p.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
        DW.Sfx.play3d(boss ? 'growl_boss' : 'groan', _p, boss ? 2 : -7, DW.randf(0.8, 1.2) / (this.ztype !== 'runner' ? 1 : 0.85));
      }
      if (this.puppet) {
        const bx = this.pos.x, bz = this.pos.z;
        this.pos.lerp(this.targetPos, Math.min(1, dt * 12));
        this.yaw = DW.lerpAngle(this.yaw, this.targetYaw, Math.min(1, dt * 10));
        const mv = DW.clamp(Math.hypot(this.pos.x - bx, this.pos.z - bz) / Math.max(dt, 0.001) / Math.max(this.speed, 1.5), 0, 1);
        this.animate(dt, mv);
        return;
      }
      this.ai(dt);
    }

    ai(dt) {
      const w = this.world;
      const tgt = w.nearestPlayer(this.pos);
      const pos = this.pos;
      let mx = 0, mz = 0;
      let dist = 999;
      let tp = pos;
      if (tgt) {
        tp = tgt.pos;
        dist = Math.hypot(pos.x - tp.x, pos.z - tp.z);
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = dist < 12 ? DW.randf(0.15, 0.3) : DW.randf(0.4, 0.7);
          this.steerPt = w.nav.steer(pos.x, pos.z);
          if (this.ztype === 'spitter') this.hasLos = w.hasLine(_a.set(pos.x, pos.y + 2, pos.z), _b.set(tp.x, tp.y + 1, tp.z));
        }
        let wantMove = true;
        if (this.ztype === 'spitter') wantMove = dist > 11 || !this.hasLos;
        else if (dist < (this.ztype !== 'brute' ? 1.0 : 1.6) * Math.min(this.s, 1.3)) wantMove = false;
        const rage = this.enraged;
        if (wantMove) {
          let ax = tp.x, az = tp.z;
          if (dist > 1.8 && this.steerPt && !(dist < 6 && w.nav.lineClear(pos.x, pos.z, tp.x, tp.z))) { ax = this.steerPt.x; az = this.steerPt.z; }
          // arrived at the steering point early: ask again
          if (this.steerPt && Math.hypot(ax - pos.x, az - pos.z) < 0.3) this.repathT = 0;
          const l = Math.hypot(ax - pos.x, az - pos.z);
          if (l > 1e-4) { mx = (ax - pos.x) / l; mz = (az - pos.z) / l; }
        } else if (this.ztype === 'spitter' && dist < 7 && this.hasLos) {
          const l = Math.hypot(pos.x - tp.x, pos.z - tp.z) || 1;
          mx = (pos.x - tp.x) / l * 0.6; mz = (pos.z - tp.z) / l * 0.6;
        }
        let fx = mx, fz = mz;
        if (dist < 5 || (mx === 0 && mz === 0)) { fx = tp.x - pos.x; fz = tp.z - pos.z; }
        if (Math.hypot(fx, fz) > 0.01) this.yaw = DW.lerpAngle(this.yaw, Math.atan2(-fx, -fz), Math.min(1, dt * 8));
        this.attackT -= dt;
        const reach = (this.ztype === 'goonlord' ? 2.4 : this.ztype !== 'brute' ? 1.45 : 2.5) * Math.min(this.s, 1.3);
        if (dist < reach && this.attackT <= 0 && Math.abs(tp.y - pos.y) < 2 &&
            w.hasLine(_a.set(pos.x, pos.y + 1.2, pos.z), _b.set(tp.x, tp.y + 1.2, tp.z))) {
          this.attackT = this.ztype !== 'brute' ? 1.15 : rage ? 1.1 : 1.45;
          this.swing = 1;
          w.zombieAttack(this, tgt.id, this.damage);
        }
        if (this.ztype === 'goonlord') this.goonAbilities(dt, dist, tp);
        this.abilityT -= dt;
        if (this.abilityT <= 0 && this.ztype !== 'goonlord') {
          if (this.ztype === 'brute' && dist < (rage ? 7.5 : 6)) {
            this.abilityT = rage ? DW.randf(3, 4.2) : DW.randf(4.5, 6);
            this.swing = 1;
            w.spawnAoe([pos.x, pos.y, pos.z], rage ? 6.5 : 5.5, rage ? 0.85 : 1.0, this.damage * 0.8, 'slam');
          } else if (this.ztype === 'spitter' && dist < 28 && this.hasLos) {
            this.abilityT = rage ? DW.randf(1.6, 2.2) : DW.randf(2.2, 3.0);
            this.swing = 1;
            w.spawnAoe([tp.x, tp.y, tp.z], 3.0, 1.2, this.damage, 'acid');
            // enraged: two more pools either side of the target
            if (rage) for (const a of [1, -1]) {
              const ang = Math.atan2(tp.x - pos.x, tp.z - pos.z) + a * Math.PI / 2;
              w.spawnAoe([tp.x + Math.sin(ang) * 3, tp.y, tp.z + Math.cos(ang) * 3], 2.6, 1.4, this.damage * 0.8, 'acid');
            }
          }
        }
      } else {
        // nobody to chase (downed, or just got back up): back away and give them room
        const fp = w.fleePoints();
        let near = null, nd = 18;
        for (const f of fp) { const d = Math.hypot(f.x - pos.x, f.z - pos.z); if (d < nd) { nd = d; near = f; } }
        if (near) {
          this.repathT -= dt;
          if (this.repathT <= 0 || !this.fleeDir) {
            this.repathT = DW.randf(0.25, 0.4);
            // pick the open direction that ends up farthest from them
            let best = null, bs = -Infinity;
            for (let k = 0; k < 8; k++) {
              const ang = k * Math.PI / 4;
              const dx = Math.sin(ang), dz = Math.cos(ang);
              const ex = pos.x + dx * 2, ez = pos.z + dz * 2;
              if (!w.nav.lineClear(pos.x, pos.z, ex, ez)) continue;
              const score = Math.hypot(ex - near.x, ez - near.z) + (this.fleeDir ? (dx * this.fleeDir[0] + dz * this.fleeDir[1]) * 0.5 : 0);
              if (score > bs) { bs = score; best = [dx, dz]; }
            }
            this.fleeDir = best;
          }
          if (this.fleeDir) { mx = this.fleeDir[0] * 0.75; mz = this.fleeDir[1] * 0.75; }
          if (mx || mz) this.yaw = DW.lerpAngle(this.yaw, Math.atan2(-mx, -mz), Math.min(1, dt * 6));
          this.fleeing = true;
        }
      }
      if (tgt) { this.fleeing = false; this.fleeDir = null; }
      const sep = w.separation(this);
      mx += sep[0] * 0.8; mz += sep[1] * 0.8;
      // bosses shrug off flinching; enraged bosses move 35% faster; the Goon Lord lunges
      const spd = this.speed * (1 - this.flinchT * (this.isBoss() ? 0.15 : 0.5)) * (this.enraged ? 1.35 : 1) * (this.lungeT > 0 ? 3.2 : 1);
      this.vel.x = mx * spd + (this.knockX || 0);
      this.vel.z = mz * spd + (this.knockZ || 0);
      if (this.knockX || this.knockZ) {
        const decay = Math.exp(-dt * 3.5);
        this.knockX *= decay; this.knockZ *= decay;
        if (Math.abs(this.knockX) + Math.abs(this.knockZ) < 0.1) this.knockX = this.knockZ = 0;
      }
      if (!this.onFloor) this.vel.y -= 18 * dt; else this.vel.y = -0.5;
      const bx = pos.x, bz = pos.z;
      this.onFloor = w.phys.move(pos, this.vel, this.colR, 1.5 * this.s, dt);
      const real = Math.hypot(pos.x - bx, pos.z - bz) / Math.max(dt, 1e-4);
      this.animate(dt, DW.clamp(real / Math.max(this.speed, 0.1), 0, 1));
      this.stuckT += dt;
      if (this.stuckT > 3) {
        if (pos.distanceTo(this.lastPos) < 1.0 && dist > 6 && !this.fleeing) w.relocateZombie(this);
        this.stuckT = 0;
        this.lastPos.copy(pos);
      }
      if (pos.y < -10) w.relocateZombie(this);
    }

    // Goon Lord: lunges at you from range and screeches to call runners
    goonAbilities(dt, dist, tp) {
      const w = this.world, rage = this.enraged;
      this.lungeT = Math.max(this.lungeT - dt, 0);
      this.lungeCd -= dt;
      if (this.lungeCd <= 0 && dist > 5 && dist < 18 && this.lungeT <= 0) {
        this.lungeT = 0.55;
        this.lungeCd = rage ? DW.randf(3.5, 5) : DW.randf(6, 8);
        this.swing = 1;
        DW.Sfx.play3d('growl_boss', [this.pos.x, this.pos.y + 3, this.pos.z], 6, 0.55, 90);
      }
      this.screechT -= dt;
      if (this.screechT <= 0) {
        this.screechT = rage ? DW.randf(8, 10) : DW.randf(13, 16);
        w.goonScreech(this);
      }
    }

    die(headshot) {
      if (this.dead) return;
      this.dead = true;
      this.deathT = 0;
      this.deathBack = Math.random() < 0.6;
      if (headshot) {
        for (const c of this.rig.head.children) c.visible = false;
        M.box(this.rig.spine, [0, 0.62, 0], [0.14, 0.06, 0.14], M.mat([0.4, 0.02, 0.02]));
      }
      this.d0 = { rx: this.bodyRoot.rotation.x, y: this.bodyRoot.position.y, knee: this.rig.knee_l.rotation.x, arm: this.rig.arm_r.rotation.x };
    }

    // returns false once the corpse has sunk and been removed
    updateDeath(dt) {
      this.deathT += dt;
      const t = this.deathT, d0 = this.d0;
      const k = Math.min(t / 0.5, 1), ease = k * k;
      this.bodyRoot.rotation.x = DW.lerp(d0.rx, Math.PI * 0.47 * (this.deathBack ? 1 : -1), ease);
      this.bodyRoot.position.y = t < 0.5 ? DW.lerp(d0.y, 0.12, k) : t < 3.0 ? 0.12 : DW.lerp(0.12, -1.2, Math.min((t - 3.0) / 1.5, 1));
      this.rig.knee_l.rotation.x = DW.lerp(d0.knee, -0.8, Math.min(t / 0.4, 1));
      this.rig.arm_r.rotation.x = DW.lerp(d0.arm, 2.5, k);
      if (t > 4.5) { this.remove(); return false; }
      return true;
    }

    remove() {
      if (this.root.parent) this.root.parent.remove(this.root);
    }
  }
  Zombie.RISE_TIME = RISE_TIME;
  DW.Zombie = Zombie;
})();
