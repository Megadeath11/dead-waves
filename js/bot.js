// Playtest bot (index.html?playtest&map=outpost&diff=1&seconds=600&skill=0.85&god=1&start_wave=9&speed=4).
// Drives the local player through the real input actions: aims, shoots, reloads, knifes, throws
// grenades, kites, and walks to buy doors, perks, wall guns and the mystery box between waves.
// Logs a line per wave plus ISSUE lines for anything that looks like a bug (console + DW.ptLog).
'use strict';
(function () {
  const I = DW.Input;
  const B = DW.Bot = {};
  let world = null, t = 0, thinkT = 0, target = null, goal = null, nav = null, navDoors = -1;
  let aimHead = false, strafeDir = 1, strafeT = 0, semi = false, lastWave = -1, waveStartT = 0, stallT = 0, lastAlive = -1, stuckT = 0;
  const lastPos = new THREE.Vector3();
  let issues = {}, frameMs = [], limit = 600, skill = 0.85, god = false, prefix = 'PT';
  DW.ptLog = [];
  const log = s => { DW.ptLog.push(s); console.log(s); };

  function issue(key, msg) {
    if (t < 5) return;
    if (!(key in issues)) { issues[key] = 0; log(`${prefix} ISSUE [${key}] t=${t.toFixed(0)} wave=${world.wave}: ${msg}`); }
    issues[key]++;
  }

  B.run = params => {
    DW.mapId = params.get('map') || 'outpost';
    DW.diffId = +(params.get('diff') || 1);
    limit = +(params.get('seconds') || 600);
    skill = +(params.get('skill') || 0.85);
    god = params.has('god');
    DW.simSpeed = +(params.get('speed') || 1);
    prefix = `PT[${DW.mapId}/${DW.diff().name}]`;
    DW.Net.startMatch();
    world = DW.world;
    world.stateT = 2;
    DW.botActive = true;
    if (params.get('start_wave')) {
      world.wave = +params.get('start_wave') - 1;
      world.player.points = 6000;
      for (let i = 0; i < world.info.doors.length; i++) world.openDoor(i);
      for (const perk of ['iron', 'fast', 'tap']) world.player.addPerk(perk);
      world.player.giveWeapon('lmg');
      world.player.giveWeapon('plasma');
    }
  };

  B.tick = dt => {
    if (!world || world !== DW.world) { DW.botActive = false; return; }
    if (world.gameOver || t >= limit) {
      I.releaseAll();
      if (!B.done) { B.done = true; log(summary()); DW.ptDone = true; }
      return;
    }
    t += dt;
    const p = world.player;
    checks(p, dt);
    if (god && !p.downed) p.hp = p.maxHp;
    if (world.wave !== lastWave) waveLog(p);
    if (p.dead) { I.releaseAll(); return; }
    thinkT -= dt;
    if (thinkT <= 0) {
      thinkT = 0.1;
      const nt = pickTarget(p);
      if (nt !== target) aimHead = Math.random() < 0.3;
      target = nt;
      pickGoal(p);
    }
    move(p, dt);
    aimAndShoot(p, dt);
  };

  function pickTarget(p) {
    let best = null, bd = 45;
    const eye = p.eye();
    for (const z of world.zombies.values()) {
      if (z.dead || z.riseT > 0.6) continue;
      const c = new THREE.Vector3(z.pos.x, z.pos.y + 1.1 * z.s, z.pos.z);
      const d = eye.distanceTo(c);
      if (d < bd && world.hasLine(eye, c)) { bd = d; best = z; }
    }
    return best;
  }

  const totalAmmo = p => p.weapons.reduce((n, w) => n + w.mag + w.reserve, 0);

  function botNav() {
    if (!nav) nav = new DW.Nav(world.phys);
    const open = world.info.doors.filter(d => d.open).length;
    if (open !== navDoors) { navDoors = open; nav.rebuild(); }
    return nav;
  }
  function reachable(p, pos) {
    const n = botNav();
    n.compute([[pos[0], pos[2]]]);
    return isFinite(n.distAt(p.pos.x, p.pos.z));
  }
  const zoneAt = pos => {
    let best = 0, bd = Infinity;
    for (const s of world.info.spawns) {
      const d = Math.hypot(s.pos[0] - pos[0], s.pos[2] - pos[2]);
      if (d < bd) { bd = d; best = s.zone; }
    }
    return best;
  };

  function pickGoal(p) {
    const dry = totalAmmo(p) === 0;
    const info = world.info;
    if (dry && !goal) {
      for (const wb of info.wallbuys)
        if (p.hasWeapon(wb.weapon) && p.points >= DW.WEAPONS[wb.weapon].cost / 2) { goal = { pos: wb.pos, kind: 'ammo' }; return; }
    }
    const calm = world.state === 'intermission' || (!target && world.zombies.size <= 2);
    if (!calm && !dry) { goal = null; return; }
    if (goal) return;
    const pts = p.points;
    for (const d of info.doors) {
      // aim for the door face nearest to us
      if (!d.open && pts >= d.cost + 300) {
        const n = botNav();
        const thinX = d.size[0] < d.size[2];
        const nt = [[d.pos[0] + (thinX ? 1.6 : 0), d.pos[2] + (thinX ? 0 : 1.6)], [d.pos[0] - (thinX ? 1.6 : 0), d.pos[2] - (thinX ? 0 : 1.6)]];
        n.compute(nt);
        if (isFinite(n.distAt(p.pos.x, p.pos.z))) { goal = { pos: d.pos, kind: 'door', nt }; return; }
      }
    }
    for (const perk of ['iron', 'fast', 'tap', 'wind']) {
      if (p.perks.includes(perk) || pts < DW.PERKS[perk].cost) continue;
      for (const pk of info.perks) if (pk.perk === perk && world.openZones.has(zoneAt(pk.pos)) && reachable(p, pk.pos)) { goal = { pos: pk.pos, kind: 'perk' }; return; }
    }
    const ownsGood = p.weapons.some(w => w.id !== 'pistol' && w.id !== 'm14');
    if (pts >= DW.BOX_COST + 300 && world.wave >= DW.BOX_UNLOCK_WAVE && info.boxes.length && reachable(p, info.boxes[0].pos)) { goal = { pos: info.boxes[0].pos, kind: 'box' }; return; }
    if (!ownsGood) {
      for (const wb of info.wallbuys) {
        const cost = DW.WEAPONS[wb.weapon].cost;
        if (pts >= cost && world.openZones.has(wb.zone) && !p.hasWeapon(wb.weapon) && reachable(p, wb.pos)) { goal = { pos: wb.pos, kind: 'wall' }; return; }
      }
    }
    const a = p.active();
    if (a.reserve < DW.WEAPONS[a.id].mag && a.id !== 'pistol') {
      for (const wb of info.wallbuys) if (wb.weapon === a.id && pts >= DW.WEAPONS[a.id].cost / 2) { goal = { pos: wb.pos, kind: 'ammo' }; return; }
    }
  }

  function release(...names) { for (const n of names) delete I.force[n]; }
  function press(n) { I.force[n] = true; }

  function move(p, dt) {
    release('move_forward', 'move_back', 'move_left', 'move_right', 'interact', 'sprint');
    let near = 999, nearZ = null;
    for (const z of world.zombies.values()) {
      if (z.dead) continue;
      const d = z.pos.distanceTo(p.pos);
      if (d < near) { near = d; nearZ = z; }
    }
    const danger = near < 4.5 && totalAmmo(p) > 0;
    if (goal && !danger) {
      const gp = goal.pos;
      const dist = Math.hypot(gp[0] - p.pos.x, gp[2] - p.pos.z);
      const it = world.getInteraction();
      if (dist < 2.6 && it && it.action) { I.tap('interact'); goal = null; return; }
      const n = botNav();
      n.compute(goal.nt || [[gp[0], gp[2]]]);
      const st = n.steer(p.pos.x, p.pos.z);
      if (!st || dist < 1.0) {
        if (!st) issue('no_path_to_' + goal.kind, `bot can't path to ${goal.kind} at ${gp.map(v => v.toFixed(1))}`);
        goal = null;
        return;
      }
      const aim = Math.hypot(st.x - p.pos.x, st.z - p.pos.z) < 0.2 ? [gp[0], gp[2]] : [st.x, st.z];
      if (!target) {
        p.yaw = DW.lerpAngle(p.yaw, Math.atan2(-(aim[0] - p.pos.x), -(aim[1] - p.pos.z)), Math.min(1, dt * 8));
        p.pitch = DW.lerp(p.pitch, 0, dt * 4);
        press('move_forward');
        if (world.state === 'intermission') press('sprint');
      } else pressToward(p, aim);
      return;
    }
    if (danger && nearZ) {
      const ax = p.pos.x - nearZ.pos.x, az = p.pos.z - nearZ.pos.z, l = Math.hypot(ax, az) || 1;
      pressToward(p, [p.pos.x + ax / l * 3, p.pos.z + az / l * 3]);
      strafeT -= dt;
      if (strafeT <= 0) { strafeT = DW.randf(1, 2.5); strafeDir = -strafeDir; }
      press(strafeDir > 0 ? 'move_right' : 'move_left');
    }
  }

  // Press movement keys so that the player moves toward pos regardless of facing.
  function pressToward(p, pos) {
    const dx = pos[0] - p.pos.x, dz = pos[1] - p.pos.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.2) return;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const lx = (dx * c - dz * s) / l, lz = (dx * s + dz * c) / l;
    if (lz < -0.3) press('move_forward'); else if (lz > 0.3) press('move_back');
    if (lx > 0.3) press('move_right'); else if (lx < -0.3) press('move_left');
  }

  function aimAndShoot(p, dt) {
    const a = p.active(), wd = DW.WEAPONS[a.id];
    if (!target || target.dead || !world.zombies.has(target.zid)) {
      release('fire', 'ads');
      if (a.mag < DW.magOf(a) && a.reserve > 0 && !p.reloading) I.tap('reload');
      return;
    }
    const head = aimHead;
    const eye = p.eye();
    const ax = target.pos.x - eye.x, ay = target.pos.y + (head ? 1.72 : 1.15) * target.s - eye.y, az = target.pos.z - eye.z;
    const wantYaw = Math.atan2(-ax, -az);
    const wantPitch = Math.atan2(ay, Math.hypot(ax, az));
    const turn = Math.min(1, dt * 7 * skill);
    p.yaw = DW.lerpAngle(p.yaw, wantYaw + DW.randf(-0.01, 0.01), turn);
    p.pitch = DW.lerp(p.pitch, wantPitch, turn);
    const err = Math.abs(DW.angleDiff(p.yaw, wantYaw)) + Math.abs(p.pitch - wantPitch);
    const dist = Math.hypot(ax, ay, az);
    if (dist < 1.7 && p.meleeCd <= 0 && (a.mag === 0 || Math.random() < 0.3)) { I.tap('melee'); return; }
    let crowd = 0;
    for (const z of world.zombies.values()) if (z.pos.distanceTo(p.pos) < 9) crowd++;
    if (crowd >= 5 && p.grenades > 0 && Math.random() < 0.02 && dist > 4) I.tap('grenade');
    if (a.mag === 0) {
      release('fire');
      if (a.reserve > 0) I.tap('reload');
      else if (p.weapons.length > 1) p.cycleWeapon();
      return;
    }
    if (dist > 8) press('ads'); else release('ads');
    if (err < 0.08) {
      if (wd.auto) press('fire');
      else { semi = !semi; if (semi) press('fire'); else release('fire'); }
    } else release('fire');
  }

  function checks(p, dt) {
    frameMs.push(DW.lastFrameMs || 0);
    if (p.points < 0) issue('neg_points', `points went negative: ${p.points}`);
    for (const w of p.weapons) if (w.mag < 0 || w.reserve < 0) issue('neg_ammo', `negative ammo ${JSON.stringify(w)}`);
    if (p.hp > p.maxHp + 0.01) issue('hp_over_max', `hp ${p.hp.toFixed(0)} > max ${p.maxHp}`);
    for (const z of world.zombies.values()) if (z.pos.y < -3) issue('zombie_fell', `zombie ${z.zid} at y=${z.pos.y.toFixed(1)}`);
    if (world.state === 'wave') {
      if (world.zombies.size === lastAlive) stallT += dt; else { stallT = 0; lastAlive = world.zombies.size; }
      if (stallT > 60) {
        let far = 0;
        for (const z of world.zombies.values()) far = Math.max(far, z.pos.distanceTo(p.pos));
        issue('wave_stall', `${world.zombies.size} zombies alive, no change for 60s, farthest ${far.toFixed(0)}m, to_spawn=${world.toSpawn}`);
        for (const z of world.zombies.values())
          log(`${prefix}   z${z.zid} ${z.ztype} at ${z.pos.x.toFixed(1)},${z.pos.z.toFixed(1)} dist=${z.pos.distanceTo(p.pos).toFixed(1)} rise=${z.riseT.toFixed(1)} navd=${world.nav.distAt(z.pos.x, z.pos.z).toFixed(1)}`);
        stallT = 0;
      }
    }
    if (I.force.move_forward && goal) {
      if (p.pos.distanceTo(lastPos) < 0.03) {
        stuckT += dt;
        if (stuckT > 4) { issue('player_stuck_' + goal.kind, `player stuck walking to ${goal.kind} at ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`); goal = null; stuckT = 0; }
      } else stuckT = 0;
    }
    lastPos.copy(p.pos);
  }

  function waveLog(p) {
    const wtime = t - waveStartT;
    if (lastWave >= 0) {
      const avg = frameMs.length ? frameMs.reduce((a, b) => a + b, 0) / frameMs.length : 0;
      const mx = frameMs.length ? Math.max(...frameMs) : 0;
      log(`${prefix} wave ${lastWave} done in ${wtime.toFixed(0)}s | hp ${p.hp.toFixed(0)}/${p.maxHp} pts ${p.points} kills ${p.kills} hs ${p.headshots} | guns ${p.weapons.map(w => w.id)} perks ${p.perks} | zones ${[...world.openZones]} | relocs ${world.relocations} | avg ${avg.toFixed(1)}ms max ${mx.toFixed(1)}ms`);
    }
    lastWave = world.wave;
    waveStartT = t;
    frameMs = [];
  }

  function summary() {
    const p = world.player;
    return `${prefix} SUMMARY wave=${world.wave} kills=${p.kills} hs=${p.headshots} downs=${p.downs} points_earned=${p.pointsEarned} time=${t.toFixed(0)}s issues=${JSON.stringify(issues)}`;
  }
})();
