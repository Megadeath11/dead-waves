// Builds maps from ASCII layouts. Each character is a 2x2 m cell:
//   #  wall           X  pillar          C  crate (low cover)
//   .  floor, zone 0 (start)   1-9  floor in zones 1-9 (opened by doors)
//   D  door (opens the highest zone next to it)
//   W  wall-buy weapon on a wall      M  mystery box
//   K  perk machine    S  zombie spawn    P  player spawn
//   U  Pack-a-Poonch desk          G  grenade wall-buy (on a wall)
//   A  armour locker   R  ammo resupply   T  sentry turret pad
//   H  raised deck (2.4 m, walk on top)   E  elevator up to a deck next to it
//   > < v ^  stairs rising east / west / south / north (2+ cells, ending at a deck)
//   k u t r a  a perk / Pack-a-Poonch / turret / ammo / armour standing on a deck
// A deck and everything that leads up to it should sit inside one zone, so doors still gate the map.
// Edit the rows or add a new entry to MAPS to make your own map.
'use strict';
(function () {
  const Maps = DW.Maps = {};
  const M = DW.Models;
  const CELL = Maps.CELL = 2.0;
  const WALL_H = Maps.WALL_H = 3.6;
  const DECK_H = Maps.DECK_H = 2.4;      // 8 stair risers of 0.3 m
  const COLLIDE_H = 12;                  // walls/doors collide much higher than they look, so nobody stands on them
  const doorCost = z => 750 + 250 * (z - 1);
  const DECK_OBJ = 'kutra';
  const isDeck = ch => ch === 'H' || DECK_OBJ.includes(ch);
  const STAIRS = { '>': [1, 0], '<': [-1, 0], 'v': [0, 1], '^': [0, -1] };

  Maps.MAPS = {
    outpost: {
      name: 'Outpost', desc: 'Moonlit military yard. Open lanes and four compounds.',
      floor: [0.2, 0.22, 0.18], wall: [0.36, 0.34, 0.3], pillar: [0.3, 0.32, 0.36],
      sky: [0.02, 0.03, 0.07], fog: [0.06, 0.08, 0.13], fog_density: 0.03,
      ambient: [0.4, 0.45, 0.65], ambient_energy: 0.55, moon: 0.55, lamp: [1.0, 0.72, 0.42],
      roof: false,
      wallbuys: ['m14', 'shotgun', 'mp5', 'ak'],
      perks: ['iron', 'fast', 'stam', 'dead', 'mule', 'tap', 'wind'],
      rows: [
        '##############################',
        '#S11111S#S..........S#S22222S#',
        '#1111111#............#2222222#',
        '#11C1111W..C......C..W222C222#',
        '#1111111#............#2222222#',
        '#1111111#....####....#2222222#',
        '#11111K1#....#M.#....#2K22222#',
        '#1111111#....#..#....#2222222#',
        '#111K111#....##.#....#222K222#',
        '#1111111D............D2222222#',
        '#1111111D.....PP.....D2222222#',
        '####DD###.....PP.....###DD####',
        '#3333333#..C......C..#4444444#',
        '#3K33333W............W4444444#',
        '#3333333#...G#..##...#4444444#',
        '#33333A3#............#44K4444#',
        '#3333333#.....T......#44444U4#',
        '#3R33333#..........K.#4444444#',
        '#S33333S#S....S.....S#S44444S#',
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
      perks: ['fast', 'tap', 'dead', 'stam', 'mule', 'iron', 'wind'],
      rows: [
        '##########################',
        '#S11111111S#S22222222222S#',
        '#1111111111#2222222222222#',
        '#11##11##11#22##22222##22#',
        '#1111111111D2222222222222#',
        '#11K1111111D22222222K2222#',
        '#1111111111#22##22222##22#',
        '#11##11##11#222K222222222#',
        '#1111K11111W2222222A22222#',
        '#S111111111#S22222222222S#',
        '##G#DD##W######DDD########',
        '#..........#3333333333333#',
        '#..C....C..#33##33333##33#',
        '#..........W33333333333K3#',
        '#...PP.....#33333333K3333#',
        '#...PP..M..D3333333333333#',
        '#..........D33333T3333333#',
        '#..C....C..#33##33333##33#',
        '#....K.....#3R33333333U33#',
        '#S........S#S33333S33333S#',
        '##########################',
      ],
    },
    factory: {
      name: 'Factory', desc: 'A huge abandoned plant with five wings to unlock.',
      floor: [0.23, 0.2, 0.17], wall: [0.4, 0.35, 0.3], pillar: [0.45, 0.25, 0.12],
      sky: [0.05, 0.03, 0.03], fog: [0.12, 0.07, 0.05], fog_density: 0.022,
      ambient: [0.6, 0.45, 0.35], ambient_energy: 0.45, moon: 0.35, lamp: [1.0, 0.8, 0.55],
      roof: false,
      wallbuys: ['m14', 'mp5', 'shotgun', 'ak'],
      perks: ['stam', 'mule', 'iron', 'dead', 'tap', 'fast', 'wind'],
      rows: [
        '################################',
        '#S11111111111111#555S#S3333333S#',
        '#11K111111111111D5555#333333333#',
        '#1111X11111111X1D5555#333333333#',
        '#111111111111111#55K5#3333K3333#',
        '#########DDDD#########333333333#',
        '#S..................S#33C333C33#',
        '#..X....X....X....X..W333333333#',
        '#....................#333K33333#',
        '#....C....PP....C....D333333333#',
        '#........MPP.........D333333333#',
        '#..................K.####DDD####',
        '#..X....X....X....X..W444C44444#',
        '#S..................S#444444444#',
        '##G###W##DDDD##W######444444444#',
        '#22K22222222222222222#444444444#',
        '#2222X22A222222X22222#4444T4444#',
        '#222222222K2222222222#44C444C44#',
        '#22222222222222222222#4R44444U4#',
        '#S222222222S22222222S#S4444444S#',
        '################################',
      ],
    },
    harbor: {
      name: 'Harbor', desc: 'Foggy docks. Container decks, a crane platform and lifts.',
      floor: [0.24, 0.25, 0.26], wall: [0.3, 0.36, 0.42], pillar: [0.55, 0.3, 0.12], deck: [0.22, 0.34, 0.52],
      sky: [0.04, 0.05, 0.09], fog: [0.09, 0.11, 0.15], fog_density: 0.026,
      ambient: [0.45, 0.5, 0.62], ambient_energy: 0.55, moon: 0.6, lamp: [1.0, 0.78, 0.5],
      roof: false,
      wallbuys: ['m14', 'shotgun', 'ak', 'mp5'],
      perks: ['mule', 'dead', 'iron', 'stam', 'fast', 'tap', 'wind'],
      rows: [
        '################################',
        '#S4444444444S#S....S#S55555555S#',
        '#44HH44444444#......#55555EHHk5#',
        '#44HH<<44K444D......D5555>>HHH5#',
        '#44HH44444444#......#5555555555#',
        '#444444444444#......#55K5555555#',
        '####DD###W####......######DD####',
        '#111111111#....vv....#222222222#',
        '#k11111111W....vv....#222222>>H#',
        '#H1111C111#...HHHHE..W22C22222H#',
        '#H11111111D...HHHH...D22222T22H#',
        '#H1111C111D....^^....D22C22222H#',
        '#H11111111#.C..^^..C.#2222222EH#',
        '#H<<111A11#.PP.....KMG222K22222#',
        '#S1111111S#.PP.......#S2222222S#',
        '##############DDDD##############',
        '#333333333333333333333333333333#',
        '#3333333333333HuHH<<33333333333#',
        '#33333333333>>HHHH3333333333333#',
        '#33R3333333333333333333333333K3#',
        '#S3333333333333S33333333333333S#',
        '################################',
      ],
    },
    overpass: {
      name: 'Overpass', desc: 'A raised highway over a dead city. Stairs, lifts, high ground.',
      floor: [0.16, 0.16, 0.17], wall: [0.42, 0.41, 0.38], pillar: [0.5, 0.48, 0.44], deck: [0.36, 0.35, 0.33],
      sky: [0.06, 0.04, 0.06], fog: [0.14, 0.09, 0.08], fog_density: 0.02,
      ambient: [0.6, 0.48, 0.42], ambient_energy: 0.5, moon: 0.45, lamp: [1.0, 0.65, 0.35],
      roof: false,
      wallbuys: ['m14', 'shotgun', 'mp5', 'ak'],
      perks: ['dead', 'mule', 'iron', 'tap', 'stam', 'wind', 'fast'],
      rows: [
        '################################',
        '#S33333333333S3#S4444444444444S#',
        '#33333333333333#444444444444444#',
        '#33HH<<333K3333#4444444444EHHk4#',
        '#33HH3333333333D444444444>>HHH4#',
        '#33333333333333#444444444444444#',
        '#333C33T33C3333#444C444444C4U44#',
        '#S333333333333S#S4444444K44444S#',
        '#####DD###W#####W######DD#######',
        '#S.............E..............S#',
        '#...>>HHHHHHHHHHHHHHHHHHHH<<...#',
        '#...>>HHHHHHHHHHHHHHtHHHHH<<...#',
        '#.C............PP.....K.....C.M#',
        '######DD##W####G#########DD##W##',
        '#11111111111111#222222222222222#',
        '#11kH<<1111A111#222222222222222#',
        '#11HH1111111111D222222222222222#',
        '#1C1111111C1111#22C22222222EHH2#',
        '#11111111111K11#22R222222>>HHH2#',
        '#S111111111111S#S2222222K22222S#',
        '################################',
      ],
    },
  };

  Maps.zoneOf = ch => (ch === '.' ? 0 : ch >= '1' && ch <= '9' && ch.length === 1 ? +ch : -1);

  function texMat(color, rough = 0.9) { return M.mat(color, 0, 0, rough); }
  function texBox(parent, pos, size, m) {
    const mi = M.box(parent, pos, size, m);
    mi.userData.textured = true;
    return mi;
  }

  // Yaw that makes a machine's front (-Z) face the most open direction.
  function faceYaw(grid, c, r, w, h, onDeck) {
    let best = [0, 0], bestOpen = -1;
    for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let open = 0;
      for (let k = 1; k < 4; k++) {
        const cc = c + d[0] * k, rr = r + d[1] * k;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) break;
        const ch = grid[rr][cc];
        const ok = onDeck ? isDeck(ch) : (Maps.zoneOf(ch) >= 0 || 'PS'.includes(ch));
        if (!ok) break;
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
    const info = {
      spawns: [], player_spawns: [], wallbuys: [], doors: [], boxes: [], perks: [], paps: [], grenadeBuys: [],
      armors: [], ammos: [], turrets: [], lifts: [], lamps: [], def, phys, origin, size: [w * CELL, h * CELL],
    };
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
    const deckMat = texMat(def.deck || def.pillar, 0.8);
    texBox(stat, [0, -0.25, 0], [w * CELL, 0.5, h * CELL], floorMat);
    phys.addBox([0, -0.25, 0], [w * CELL, 0.5, h * CELL], 'floor');

    const capMat = M.mat(M.darkened(def.wall, 0.35));
    const rng = DW.rng(DW.hash(mapId));
    // walls and decks: merge horizontal runs
    for (let r = 0; r < h; r++) {
      let c = 0;
      while (c < w) {
        const ch = grid[r][c];
        if ('#WG'.includes(ch)) {
          const start = c;
          while (c < w && '#WG'.includes(grid[r][c])) c++;
          const len = c - start;
          const p = cellPos(start, r);
          p[0] += (len - 1) * CELL * 0.5;
          texBox(stat, [p[0], WALL_H * 0.5, p[2]], [len * CELL, WALL_H, CELL], wallMat);
          phys.addBox([p[0], COLLIDE_H * 0.5, p[2]], [len * CELL, COLLIDE_H, CELL], 'wall');
          M.box(stat, [p[0], WALL_H + 0.06, p[2]], [len * CELL + 0.12, 0.12, CELL + 0.12], capMat);
          M.box(stat, [p[0], 0.12, p[2]], [len * CELL + 0.06, 0.24, CELL + 0.06], capMat);
        } else if (isDeck(ch)) {
          const start = c;
          while (c < w && isDeck(grid[r][c])) c++;
          const len = c - start;
          const p = cellPos(start, r);
          p[0] += (len - 1) * CELL * 0.5;
          texBox(stat, [p[0], DECK_H * 0.5, p[2]], [len * CELL, DECK_H, CELL], deckMat);
          phys.addBox([p[0], DECK_H * 0.5, p[2]], [len * CELL, DECK_H, CELL], 'deck');
          M.box(stat, [p[0], DECK_H - 0.04, p[2]], [len * CELL + 0.06, 0.1, CELL + 0.06], capMat);
          for (let k = 0; k < len; k++) {
            const q = cellPos(start + k, r);
            M.box(stat, [q[0], DECK_H * 0.55, q[2] - CELL * 0.5 - 0.01], [CELL * 0.9, 0.08, 0.02], M.mat([0.9, 0.7, 0.1]));
            M.box(stat, [q[0], DECK_H * 0.55, q[2] + CELL * 0.5 + 0.01], [CELL * 0.9, 0.08, 0.02], M.mat([0.9, 0.7, 0.1]));
          }
        } else c++;
      }
    }
    buildDeckRails(stat, grid, w, h, cellPos);
    buildStairs(stat, phys, grid, w, h, cellPos, deckMat, capMat);

    const visited = new Set();
    let wbI = 0, perkI = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = grid[r][c];
      const p = cellPos(c, r);
      const pd = [p[0], DECK_H, p[2]]; // same cell, on top of a deck
      switch (ch) {
        case 'X':
          texBox(stat, [p[0], WALL_H * 0.5, p[2]], [CELL * 0.75, WALL_H, CELL * 0.75], pillarMat);
          phys.addBox([p[0], COLLIDE_H * 0.5, p[2]], [CELL * 0.75, COLLIDE_H, CELL * 0.75], 'pillar');
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
        case 'K': case 'k': {
          const perk = def.perks[perkI++ % def.perks.length];
          buildPerk(stat, phys, ch === 'k' ? pd : p, perk, info, faceYaw(grid, c, r, w, h, ch === 'k'));
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
        case 'U': case 'u':
          buildPap(stat, phys, ch === 'u' ? pd : p, info, faceYaw(grid, c, r, w, h, ch === 'u'));
          break;
        case 'G':
          buildGrenadeBuy(stat, grid, c, r, w, h, p, info);
          break;
        case 'A': case 'a':
          buildArmor(stat, phys, ch === 'a' ? pd : p, info, faceYaw(grid, c, r, w, h, ch === 'a'));
          break;
        case 'R': case 'r':
          buildAmmo(stat, phys, ch === 'r' ? pd : p, info, faceYaw(grid, c, r, w, h, ch === 'r'));
          break;
        case 'T': case 't':
          buildTurret(scene, phys, ch === 't' ? pd : p, info);
          break;
        case 'E':
          buildLift(scene, stat, phys, p, info);
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

  // Low railings along deck edges that drop to the ground (visual only - you can jump down).
  function buildDeckRails(stat, grid, w, h, cellPos) {
    const rail = M.mat([0.85, 0.65, 0.12], 0, 0.4, 0.5);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      if (!isDeck(grid[r][c])) continue;
      const p = cellPos(c, r);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dx, rr = r + dz;
        const n = rr >= 0 && rr < h && cc >= 0 && cc < w ? grid[rr][cc] : '#';
        if (isDeck(n) || '#WGE'.includes(n) || STAIRS[n]) continue;
        const ex = p[0] + dx * (CELL * 0.5 - 0.05), ez = p[2] + dz * (CELL * 0.5 - 0.05);
        const along = dx !== 0 ? [0.06, 0.06, CELL] : [CELL, 0.06, 0.06];
        M.box(stat, [ex, DECK_H + 0.95, ez], along, rail);
        M.box(stat, [ex, DECK_H + 0.5, ez], along.map(v => (v > 1 ? v : 0.04)), rail);
        for (const s of [-0.9, 0, 0.9]) M.box(stat, [ex + (dx === 0 ? s : 0), DECK_H + 0.48, ez + (dz === 0 ? s : 0)], [0.06, 0.96, 0.06], rail);
      }
    }
  }

  // Stairs: each run of > < v ^ cells climbs DECK_H in 8 solid steps toward the deck at its high end.
  function buildStairs(stat, phys, grid, w, h, cellPos, deckMat, capMat) {
    const done = new Set();
    const nose = M.mat([0.85, 0.7, 0.15]);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = grid[r][c];
      const dir = STAIRS[ch];
      if (!dir || done.has(c + ',' + r)) continue;
      const [dx, dz] = dir;
      let lc = c, lr = r;
      while (grid[lr - dz] && grid[lr - dz][lc - dx] === ch) { lc -= dx; lr -= dz; }
      const cells = [];
      let cc = lc, rr = lr;
      while (rr >= 0 && rr < h && cc >= 0 && cc < w && grid[rr][cc] === ch) { cells.push([cc, rr]); done.add(cc + ',' + rr); cc += dx; rr += dz; }
      const len = cells.length * CELL, steps = 8, depth = len / steps, rise = DECK_H / steps;
      const p0 = cellPos(lc, lr);
      const ex = p0[0] - dx * CELL * 0.5, ez = p0[2] - dz * CELL * 0.5; // low edge
      for (let k = 1; k <= steps; k++) {
        const a = (k - 0.5) * depth, top = k * rise;
        const cx = ex + dx * a, cz = ez + dz * a;
        const size = dx !== 0 ? [depth, top, CELL] : [CELL, top, depth];
        texBox(stat, [cx, top / 2, cz], size, deckMat);
        phys.addBox([cx, top / 2, cz], size, 'stair');
        const ns = dx !== 0 ? [0.06, 0.04, CELL * 0.96] : [CELL * 0.96, 0.04, 0.06];
        M.box(stat, [cx - dx * (depth / 2 - 0.03), top + 0.01, cz - dz * (depth / 2 - 0.03)], ns, nose);
      }
      // side rails
      for (const side of [-1, 1]) {
        const sx = dz !== 0 ? side * (CELL * 0.5 - 0.05) : 0, sz = dx !== 0 ? side * (CELL * 0.5 - 0.05) : 0;
        const mid = [ex + dx * len / 2 + sx, DECK_H / 2 + 0.9, ez + dz * len / 2 + sz];
        const railLen = Math.hypot(len, DECK_H);
        const m = M.box(stat, mid, dx !== 0 ? [railLen, 0.06, 0.06] : [0.06, 0.06, railLen], capMat);
        const ang = Math.atan2(DECK_H, len);
        if (dx !== 0) m.rotation.z = ang * dx; else m.rotation.x = -ang * dz;
      }
    }
  }

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
    phys.addBox([p[0], p[1] + 1.1, p[2]], [1.1, 2.2, 1.1], 'perk');
    const root = M.node(stat, p, yaw);
    M.perkMachine(root, pd.color, pd.name);
    M.label(root, [0, 2.75, 0], String(pd.cost), 36, M.lightened(pd.color, 0.3));
    const lx = p[0] - Math.sin(yaw) * 0.8, lz = p[2] - Math.cos(yaw) * 0.8;
    info.lamps.push({ pos: [lx, p[1] + 2.4, lz], color: pd.color, energy: 1.6, range: 4.5, fixed: true });
    info.perks.push({ pos: p, perk });
  }

  function buildPap(stat, phys, p, info, yaw) {
    const root = M.node(stat, p, yaw);
    M.papDesk(root);
    const sw = Math.abs(Math.sin(yaw)) > 0.5;
    phys.addBox([p[0], p[1] + 0.7, p[2]], sw ? [0.9, 1.4, 1.75] : [1.75, 1.4, 0.9], 'pap');
    M.label(root, [0, 2.0, 0], 'PACK-A-POONCH', 38, [0.4, 1.0, 0.7]);
    info.paps.push({ pos: p });
    info.lamps.push({ pos: [p[0] - Math.sin(yaw) * 0.9, p[1] + 1.9, p[2] - Math.cos(yaw) * 0.9], color: [0.3, 1.0, 0.6], energy: 2.0, range: 5, fixed: true });
  }

  function buildArmor(stat, phys, p, info, yaw) {
    const root = M.node(stat, p, yaw);
    M.armorLocker(root);
    const sw = Math.abs(Math.sin(yaw)) > 0.5;
    phys.addBox([p[0], p[1] + 1.0, p[2]], sw ? [0.7, 2.0, 1.0] : [1.0, 2.0, 0.7], 'armor');
    M.label(root, [0, 2.45, 0], `ARMOR  ${DW.ARMOR_COST}`, 36, [0.5, 0.75, 1.0]);
    info.armors.push({ pos: p });
    info.lamps.push({ pos: [p[0] - Math.sin(yaw) * 0.8, p[1] + 2.0, p[2] - Math.cos(yaw) * 0.8], color: [0.4, 0.6, 1.0], energy: 1.4, range: 4, fixed: true });
  }

  function buildAmmo(stat, phys, p, info, yaw) {
    const root = M.node(stat, p, yaw);
    M.ammoCrate(root);
    const sw = Math.abs(Math.sin(yaw)) > 0.5;
    phys.addBox([p[0], p[1] + 0.45, p[2]], sw ? [0.9, 0.9, 1.4] : [1.4, 0.9, 0.9], 'ammo');
    M.label(root, [0, 1.6, 0], `AMMO RESUPPLY  ${DW.AMMO_COST}`, 34, [1.0, 0.85, 0.4]);
    info.ammos.push({ pos: p });
  }

  // Sentry turret: lives in the scene (its head turns), not in the merged scenery.
  function buildTurret(scene, phys, p, info) {
    const root = M.node(scene, p, 0);
    const head = M.turret(root);
    M.bake(root);
    phys.addBox([p[0], p[1] + 0.6, p[2]], [0.7, 1.2, 0.7], 'turret');
    const label = M.label(root, [0, 1.9, 0], `SENTRY TURRET  ${DW.TURRET_COST}`, 34, [1.0, 0.5, 0.4]);
    info.turrets.push({ pos: p, root, head, label, t: 0, owner: null, fireT: 0, yaw: 0, labelKey: '' });
  }

  // Elevator: a platform that rides between the ground and the deck next to it.
  function buildLift(scene, stat, phys, p, info) {
    const frame = M.mat([0.22, 0.23, 0.25], 0, 0.6, 0.5);
    for (const sx of [-0.92, 0.92]) for (const sz of [-0.92, 0.92]) {
      M.box(stat, [p[0] + sx, (DECK_H + 1.2) / 2, p[2] + sz], [0.1, DECK_H + 1.2, 0.1], frame);
      phys.addBox([p[0] + sx, (DECK_H + 1.2) / 2, p[2] + sz], [0.1, DECK_H + 1.2, 0.1], 'post');
    }
    for (const s of [-0.92, 0.92]) {
      M.box(stat, [p[0], DECK_H + 1.2, p[2] + s], [1.94, 0.1, 0.1], frame);
      M.box(stat, [p[0] + s, DECK_H + 1.2, p[2]], [0.1, 0.1, 1.94], frame);
    }
    M.box(stat, [p[0], DECK_H + 1.1, p[2]], [0.3, 0.12, 0.3], M.mat([1.0, 0.75, 0.2], 3, 0, 1, true));
    const root = M.node(scene, [p[0], 0, p[2]]);
    M.liftPlatform(root);
    M.bake(root);
    const box = phys.addBox([p[0], -0.1, p[2]], [1.9, 0.2, 1.9], 'lift');
    M.label(scene, [p[0], DECK_H + 1.55, p[2]], 'ELEVATOR', 32, [1.0, 0.85, 0.4]);
    info.lifts.push({ pos: p, root, box, y: 0, target: 0, moving: false });
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
        if (z < 0 && 'SPMKUTAR'.includes(grid[rr][cc])) z = 0;
        if (z >= 0 && z < bestZone) { bestZone = z; bestDir = d; }
      }
    }
    return { n: [bestDir[0], 0, bestDir[1]], zone: bestZone };
  }

  function buildWallbuy(stat, grid, c, r, w, h, p, wep, info) {
    const wd = DW.WEAPONS[wep];
    const { n, zone } = wallFace(grid, c, r, w, h);
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
    info.wallbuys.push({ pos: [face[0] + n[0] * 0.6, 0, face[2] + n[2] * 0.6], weapon: wep, zone });
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
    const cost = doorCost(Math.max(zone, 1));
    const group = M.node(scene, center);
    const thinX = size[0] < size[2], thinZ = size[2] < size[0];
    const vis = M.box(group, [0, 0, 0], [size[0] - (thinX ? 0.3 : 0), size[1], size[2] - (thinZ ? 0.3 : 0)], M.mat([0.16, 0.12, 0.08], 0, 0, 0.9));
    vis.userData.textured = true;
    M.doorVisual(group, size, DW.rng(cells.length * 31 + mn[0] * 7 + mn[1]));
    M.bake(group);
    M.label(group, [0, 0.6, 0], 'CLEAR DEBRIS  ' + cost, 48, [1.0, 0.85, 0.4]);
    const box = phys.addBox([center[0], COLLIDE_H * 0.5, center[2]], [size[0], COLLIDE_H, size[2]], 'door');
    info.doors.push({ pos: center, size, zone, cost, group, box, open: false });
  }
})();
