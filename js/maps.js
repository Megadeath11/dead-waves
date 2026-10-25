// Builds maps from ASCII layouts. Each character is a 2x2 m cell:
//   #  wall           X  pillar          C  crate (low cover)
//   .  floor, zone 0 (start)   1/2/3  floor in zones 1-3 (opened by doors)
//   D  door (opens the highest zone next to it)
//   W  wall-buy weapon on a wall      M  mystery box
//   K  perk machine    S  zombie spawn    P  player spawn
//   U  Pack-a-Poonch desk          G  grenade wall-buy (on a wall)
// Edit the rows or add a new entry to MAPS to make your own map.
'use strict';
(function () {
  const Maps = DW.Maps = {};
  const M = DW.Models;
  const CELL = Maps.CELL = 2.0;
  const WALL_H = Maps.WALL_H = 3.6;
  const DOOR_COST = { 1: 750, 2: 1000, 3: 1250 };

  Maps.MAPS = {
    outpost: {
      name: 'Outpost', desc: 'Moonlit military yard. Open lanes and two side compounds.',
      floor: [0.2, 0.22, 0.18], wall: [0.36, 0.34, 0.3], pillar: [0.3, 0.32, 0.36],
      sky: [0.02, 0.03, 0.07], fog: [0.06, 0.08, 0.13], fog_density: 0.03,
      ambient: [0.4, 0.45, 0.65], ambient_energy: 0.55, moon: 0.55, lamp: [1.0, 0.72, 0.42],
      roof: false,
      wallbuys: ['m14', 'shotgun', 'mp5', 'ak'],
      perks: ['iron', 'fast', 'tap', 'wind'],
      rows: [
        '##############################',
        '#S11111S#S..........S#S22222S#',
        '#1111111#............#2222222#',
        '#11C1111W..C......C..W222C222#',
        '#1111111#............#2222222#',
        '#1111111#....####....#2222222#',
        '#11111K1#....#M.#....#2K22222#',
        '#1111111#....#..#....#2222222#',
        '#1111111#....##.#....#2222222#',
        '#1111111D............D2222222#',
        '#1111111D.....PP.....D2222222#',
        '#1111111#.....PP.....#2222222#',
        '#11C1111#..C......C..#22222C2#',
        '#1111111W............W2222222#',
        '#1111111#...G#..##...#2222222#',
        '#1111111#............#22K2222#',
        '#1111111#............#22222U2#',
        '#1111111#..........K.#2222222#',
        '#S11111S#S....S.....S#S22222S#',
        '##############################',
      ],
    },
    bunker: {
      name: 'Bunker', desc: 'Cramped underground corridors. Nowhere to run.',
      floor: [0.17, 0.17, 0.18], wall: [0.3, 0.3, 0.29], pillar: [0.4, 0.33, 0.2],
      sky: [0.0, 0.0, 0.0], fog: [0.05, 0.04, 0.04], fog_density: 0.045,
      ambient: [0.5, 0.42, 0.35], ambient_energy: 0.35, moon: 0.0, lamp: [1.0, 0.55, 0.3],
      roof: true,
      wallbuys: ['ak', 'm14', 'shotgun'],
      perks: ['fast', 'tap', 'iron', 'wind'],
      rows: [
        '##########################',
        '#S11111111S#S22222222222S#',
        '#1111111111#2222222222222#',
        '#11##11##11#22##22222##22#',
        '#1111111111D2222222222222#',
        '#11K1111111D22222222K2222#',
        '#1111111111#22##22222##22#',
        '#11##11##11#2222222222222#',
        '#1111111111W2222222222222#',
        '#S111111111#2222222222222#',
        '##G#DD##W###2222222222222#',
        '#..........#2222222222222#',
        '#..C....C..#22##22222##22#',
        '#..........W2222222222222#',
        '#...PP.....#22222222K2222#',
        '#...PP..M..D2222222222222#',
        '#..........D2222222222222#',
        '#..C....C..#22##22222##22#',
        '#....K.....#2222222222U22#',
        '#S........S#S22222S22222S#',
        '##########################',
      ],
    },
    factory: {
      name: 'Factory', desc: 'A huge abandoned plant with three wings to unlock.',
      floor: [0.23, 0.2, 0.17], wall: [0.4, 0.35, 0.3], pillar: [0.45, 0.25, 0.12],
      sky: [0.05, 0.03, 0.03], fog: [0.12, 0.07, 0.05], fog_density: 0.022,
      ambient: [0.6, 0.45, 0.35], ambient_energy: 0.45, moon: 0.35, lamp: [1.0, 0.8, 0.55],
      roof: false,
      wallbuys: ['m14', 'mp5', 'shotgun', 'ak'],
      perks: ['iron', 'fast', 'wind', 'tap'],
      rows: [
        '################################',
        '#S111111111111111111S#S3333333S#',
        '#11111111111111111111#333333333#',
        '#1111X111111111X11111#333333333#',
        '#111111111111111111K1#3333K3333#',
        '#########DDDD#########333333333#',
        '#S..................S#33C333C33#',
        '#..X....X....X....X..W333333333#',
        '#....................#333333333#',
        '#....C....PP....C....D333333333#',
        '#........MPP.........D333333333#',
        '#..................K.#3333333U3#',
        '#..X....X....X....X..W333C33333#',
        '#S..................S#333333333#',
        '##G###W##DDDD##W######333333333#',
        '#22222222222222222222#333333333#',
        '#2222X222222222X22222#333333333#',
        '#222222222K2222222222#33C333C33#',
        '#22222222222222222222#333333333#',
        '#S222222222S22222222S#S3333333S#',
        '################################',
      ],
    },
  };

  Maps.zoneOf = ch => (ch === '.' ? 0 : (ch === '1' || ch === '2' || ch === '3') ? +ch : -1);

  function texMat(color, rough = 0.9) { return M.mat(color, 0, 0, rough); }
  function texBox(parent, pos, size, m) {
    const mi = M.box(parent, pos, size, m);
    mi.userData.textured = true;
    return mi;
  }

  // Yaw that makes a machine's front (-Z) face away from an adjacent wall.
  function faceYaw(grid, c, r, w, h) {
    let best = [0, 0], bestOpen = -1;
    for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let open = 0;
      for (let k = 1; k < 4; k++) {
        const cc = c + d[0] * k, rr = r + d[1] * k;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w || (Maps.zoneOf(grid[rr][cc]) < 0 && !'PS'.includes(grid[rr][cc]))) break;
        open++;
      }
      if (open > bestOpen) { bestOpen = open; best = d; }
    }
    return Math.atan2(-best[0], -best[1]);
  }

  // Builds the map into scene. Returns gameplay info (spawns, doors, wall-buys, colliders...).
  Maps.build = (mapId, scene) => {
    const def = Maps.MAPS[mapId];
    const rows = def.rows, h = rows.length, w = rows[0].length;
    const origin = [-w * CELL * 0.5, 0, -h * CELL * 0.5];
    const phys = new DW.Phys(origin[0], origin[2], -origin[0], -origin[2]);
    const info = { spawns: [], player_spawns: [], wallbuys: [], doors: [], boxes: [], perks: [], paps: [], grenadeBuys: [], lamps: [], def, phys, origin, size: [w * CELL, h * CELL] };
    const grid = rows.map(row => row.split(''));
    const cellPos = (c, r) => [origin[0] + (c + 0.5) * CELL, 0, origin[2] + (r + 0.5) * CELL];
    const neighborZone = (c, r) => {
      let best = 99;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + d[0], rr = r + d[1];
        if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
          const z = Maps.zoneOf(grid[rr][cc]);
          if (z >= 0 && z < best) best = z;
        }
      }
      return best === 99 ? 0 : best;
    };

    const stat = new THREE.Group(); // static scenery, merged at the end
    const floorMat = texMat(def.floor, 0.95), wallMat = texMat(def.wall), pillarMat = texMat(def.pillar);
    texBox(stat, [0, -0.25, 0], [w * CELL, 0.5, h * CELL], floorMat);
    phys.addBox([0, -0.25, 0], [w * CELL, 0.5, h * CELL], 'floor');

    const capMat = M.mat(M.darkened(def.wall, 0.35));
    const rng = DW.rng(DW.hash(mapId));
    // walls: merge horizontal runs of '#'/'W'
    for (let r = 0; r < h; r++) {
      let c = 0;
      while (c < w) {
        const ch = grid[r][c];
        if (ch === '#' || ch === 'W' || ch === 'G') {
          const start = c;
          while (c < w && '#WG'.includes(grid[r][c])) c++;
          const len = c - start;
          const p = cellPos(start, r);
          p[0] += (len - 1) * CELL * 0.5;
          texBox(stat, [p[0], WALL_H * 0.5, p[2]], [len * CELL, WALL_H, CELL], wallMat);
          phys.addBox([p[0], WALL_H * 0.5, p[2]], [len * CELL, WALL_H, CELL], 'wall');
          M.box(stat, [p[0], WALL_H + 0.06, p[2]], [len * CELL + 0.12, 0.12, CELL + 0.12], capMat);
          M.box(stat, [p[0], 0.12, p[2]], [len * CELL + 0.06, 0.24, CELL + 0.06], capMat);
        } else c++;
      }
    }

    const visited = new Set();
    let wbI = 0, perkI = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = grid[r][c];
      const p = cellPos(c, r);
      switch (ch) {
        case 'X':
          texBox(stat, [p[0], WALL_H * 0.5, p[2]], [CELL * 0.75, WALL_H, CELL * 0.75], pillarMat);
          phys.addBox([p[0], WALL_H * 0.5, p[2]], [CELL * 0.75, WALL_H, CELL * 0.75], 'pillar');
          M.pillar(stat, p, WALL_H, capMat);
          break;
        case 'C':
          phys.addBox([p[0], 0.6, p[2]], [1.5, 1.2, 1.5], 'crate');
          M.crateStack(stat, p, rng);
          break;
        case 'S':
          info.spawns.push({ pos: p, zone: neighborZone(c, r) });
          M.spawnHole(stat, p, rng);
          break;
        case 'P':
          info.player_spawns.push([p[0], 0.1, p[2]]);
          break;
        case 'M':
          buildBox(scene, stat, phys, p, info, faceYaw(grid, c, r, w, h));
          break;
        case 'K': {
          const perk = def.perks[perkI++ % def.perks.length];
          buildPerk(stat, phys, p, perk, info, faceYaw(grid, c, r, w, h));
          break;
        }
        case 'W': {
          const wep = def.wallbuys[wbI++ % def.wallbuys.length];
          buildWallbuy(stat, grid, c, r, w, h, p, wep, info);
          break;
        }
        case 'D':
          if (!visited.has(c + ',' + r)) buildDoor(scene, phys, grid, c, r, w, h, origin, visited, info);
          break;
        case 'U':
          buildPap(stat, phys, p, info, faceYaw(grid, c, r, w, h));
          break;
        case 'G':
          buildGrenadeBuy(stat, grid, c, r, w, h, p, info);
          break;
      }
      const z = Maps.zoneOf(ch);
      if (z >= 0 && rng.randf() < 0.1) M.clutter(stat, [p[0] + rng.range(-0.4, 0.4), 0, p[2] + rng.range(-0.4, 0.4)], rng);
      if (z >= 0 && c % 5 === 2 && r % 4 === 2) {
        let lp;
        if (def.roof) {
          lp = [p[0], WALL_H - 0.5, p[2]];
          M.hangingLamp(stat, lp, WALL_H, def.lamp);
        } else {
          lp = [p[0] + 0.6, 3.2, p[2] + 0.6 - 0.72];
          phys.addBox([p[0] + 0.6, 1.6, p[2] + 0.6], [0.2, 3.2, 0.2], 'lamp');
          M.lampPost(stat, [p[0] + 0.6, 0, p[2] + 0.6], 3.4, def.lamp);
        }
        info.lamps.push({ pos: [lp[0], lp[1] - 0.3, lp[2]], color: def.lamp, energy: 1.6, range: 11 });
      }
    }
    if (def.roof) {
      texBox(stat, [0, WALL_H + 0.25, 0], [w * CELL, 0.5, h * CELL], wallMat);
      phys.addBox([0, WALL_H + 0.25, 0], [w * CELL, 0.5, h * CELL], 'roof');
    }
    const batch = new M.StaticBatch();
    batch.addTree(stat);
    batch.build(scene);
    info.nav = new DW.Nav(phys);
    return info;
  };

  function buildBox(scene, stat, phys, p, info, yaw) {
    const root = M.node(stat, p, yaw);
    M.mysteryBox(root);
    const sw = Math.abs(Math.sin(yaw)) > 0.5;
    phys.addBox([p[0], 0.4, p[2]], sw ? [0.9, 0.8, 1.8] : [1.8, 0.8, 0.9], 'box');
    const label = M.label(scene, [p[0], 1.5, p[2]], `MYSTERY BOX  -  opens wave ${DW.BOX_UNLOCK_WAVE}`, 34, [0.6, 0.85, 1.0]);
    info.boxes.push({ pos: p, label });
    info.lamps.push({ pos: [p[0], 1.6, p[2]], color: [0.3, 0.6, 1.0], energy: 2.2, range: 6, fixed: true });
  }

  function buildPerk(stat, phys, p, perk, info, yaw) {
    const pd = DW.PERKS[perk];
    phys.addBox([p[0], 1.1, p[2]], [1.1, 2.2, 1.1], 'perk');
    const root = M.node(stat, p, yaw);
    M.perkMachine(root, pd.color, pd.name);
    M.label(root, [0, 2.75, 0], String(pd.cost), 36, M.lightened(pd.color, 0.3));
    // light in front of the machine, in world space
    const lx = p[0] - Math.sin(yaw) * 0.8, lz = p[2] - Math.cos(yaw) * 0.8;
    info.lamps.push({ pos: [lx, 2.4, lz], color: pd.color, energy: 1.6, range: 4.5, fixed: true });
    info.perks.push({ pos: p, perk });
  }

  function buildPap(stat, phys, p, info, yaw) {
    const root = M.node(stat, p, yaw);
    M.papDesk(root);
    const sw = Math.abs(Math.sin(yaw)) > 0.5;
    phys.addBox([p[0], 0.7, p[2]], sw ? [0.9, 1.4, 1.75] : [1.75, 1.4, 0.9], 'pap');
    M.label(root, [0, 2.0, 0], `PACK-A-POONCH  ${DW.PAP_COST}`, 38, [0.4, 1.0, 0.7]);
    info.paps.push({ pos: p });
    info.lamps.push({ pos: [p[0] - Math.sin(yaw) * 0.9, 1.9, p[2] - Math.cos(yaw) * 0.9], color: [0.3, 1.0, 0.6], energy: 2.0, range: 5, fixed: true });
  }

  // Grenade wall-buy: a chalk board on the wall face that looks into the nearest zone.
  function buildGrenadeBuy(stat, grid, c, r, w, h, p, info) {
    const { n, zone } = wallFace(grid, c, r, w, h);
    const face = [p[0] + n[0] * (CELL * 0.5 + 0.02), 0, p[2] + n[2] * (CELL * 0.5 + 0.02)];
    const root = M.node(stat, [face[0], 1.5, face[2]], Math.atan2(-n[0], -n[2]));
    M.box(root, [0, 0, 0], [1.2, 0.85, 0.03], M.mat([0.12, 0.13, 0.12]));
    for (const e of [[0, 0.4, -0.02], [0, -0.4, -0.02]]) M.box(root, e, [1.1, 0.02, 0.01], M.mat([0.9, 0.88, 0.8], 0.3, 0, 1, true));
    for (const x of [-0.3, 0, 0.3]) {
      const g = M.grenadeChalk();
      g.position.set(x, -0.05, -0.03);
      g.scale.set(1, 1, 0.15);
      root.add(g);
    }
    M.label(root, [0, 0.62, -0.05], `GRENADES  ${DW.GRENADE_COST} each`, 34, [1.0, 0.95, 0.8]);
    info.grenadeBuys.push({ pos: [face[0] + n[0] * 0.6, 0, face[2] + n[2] * 0.6], zone });
  }

  // direction a wall cell faces: toward the lowest-numbered open zone next to it
  function wallFace(grid, c, r, w, h) {
    let bestDir = [0, 0], bestZone = 99;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + d[0], rr = r + d[1];
      if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
        let z = Maps.zoneOf(grid[rr][cc]);
        if (z < 0 && 'SPMKU'.includes(grid[rr][cc])) z = 0;
        if (z >= 0 && z < bestZone) { bestZone = z; bestDir = d; }
      }
    }
    return { n: [bestDir[0], 0, bestDir[1]], zone: bestZone };
  }

  function buildWallbuy(stat, grid, c, r, w, h, p, wep, info) {
    const wd = DW.WEAPONS[wep];
    let bestDir = [0, 0], bestZone = 99;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + d[0], rr = r + d[1];
      if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
        let z = Maps.zoneOf(grid[rr][cc]);
        if (z < 0 && 'SPMK'.includes(grid[rr][cc])) z = 0;
        if (z >= 0 && z < bestZone) { bestZone = z; bestDir = d; }
      }
    }
    const n = [bestDir[0], 0, bestDir[1]];
    const face = [p[0] + n[0] * (CELL * 0.5 + 0.02), 0, p[2] + n[2] * (CELL * 0.5 + 0.02)];
    const root = M.node(stat, [face[0], 1.5, face[2]], Math.atan2(-n[0], -n[2]));
    M.box(root, [0, 0, 0], [1.7, 0.85, 0.03], M.mat([0.12, 0.13, 0.12]));
    for (const e of [[0, 0.4, -0.02], [0, -0.4, -0.02]]) M.box(root, e, [1.6, 0.02, 0.01], M.mat([0.9, 0.88, 0.8], 0.3, 0, 1, true));
    const gs = wd.len < 0.5 ? 1.6 : 1.15;
    const holder = M.joint(root, [0, 0, -0.03]);
    holder.scale.set(1, 1, 0.08);
    const g = M.gun(wep, true);
    g.rotation.y = -Math.PI / 2;
    g.scale.setScalar(gs);
    g.position.set(-wd.len * 0.4 * gs, -0.02, 0);
    holder.add(g);
    M.label(root, [0, 0.62, -0.05], `${wd.name}  ${wd.cost}`, 34, [1.0, 0.95, 0.8]);
    info.wallbuys.push({ pos: [face[0] + n[0] * 0.6, 0, face[2] + n[2] * 0.6], weapon: wep, zone: bestZone });
  }

  function buildDoor(scene, phys, grid, c, r, w, h, origin, visited, info) {
    const cells = [];
    const stack = [[c, r]];
    visited.add(c + ',' + r);
    let zone = 0;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur[0] + d[0], ny = cur[1] + d[1];
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        const ch = grid[ny][nx];
        if (ch === 'D' && !visited.has(nx + ',' + ny)) { visited.add(nx + ',' + ny); stack.push([nx, ny]); }
        const z = Maps.zoneOf(ch);
        if (z > zone) zone = z;
      }
    }
    let mn = [9999, 9999], mx = [-1, -1];
    for (const cell of cells) {
      mn = [Math.min(mn[0], cell[0]), Math.min(mn[1], cell[1])];
      mx = [Math.max(mx[0], cell[0]), Math.max(mx[1], cell[1])];
    }
    const size = [(mx[0] - mn[0] + 1) * CELL, WALL_H, (mx[1] - mn[1] + 1) * CELL];
    const center = [origin[0] + (mn[0] + mx[0] + 1) * CELL * 0.5, WALL_H * 0.5, origin[2] + (mn[1] + mx[1] + 1) * CELL * 0.5];
    const cost = DOOR_COST[zone] || 1000;
    const group = M.node(scene, center);
    const thinX = size[0] < size[2], thinZ = size[2] < size[0];
    const vis = M.box(group, [0, 0, 0], [size[0] - (thinX ? 0.3 : 0), size[1], size[2] - (thinZ ? 0.3 : 0)], M.mat([0.16, 0.12, 0.08], 0, 0, 0.9));
    vis.userData.textured = true;
    M.doorVisual(group, size, DW.rng(cells.length * 31 + mn[0] * 7 + mn[1]));
    M.bake(group);
    M.label(group, [0, 0.6, 0], 'CLEAR DEBRIS  ' + cost, 48, [1.0, 0.85, 0.4]);
    const box = phys.addBox(center, size, 'door');
    info.doors.push({ pos: center, size, zone, cost, group, box, open: false });
  }
})();
