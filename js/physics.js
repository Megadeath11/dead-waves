// Tiny physics for a world made of axis-aligned boxes: character movement (vertical capsule as
// circle + height), ray casts, line-of-sight, and a navigation flow field on a 0.5 m grid that
// leads every zombie to the nearest reachable player.
'use strict';
(function () {
  const HASH = 2.0;
  // machines, crates and posts can't be stood on: for movement they reach up forever (rays still see their real
  // height), so anyone who jumps or wind-charges onto one slides off instead of camping where zombies can't reach
  const SLICK = { perk: 1, pap: 1, armor: 1, ammo: 1, box: 1, crate: 1, lamp: 1, post: 1 };

  class Phys {
    constructor(minX, minZ, maxX, maxZ) {
      this.minX = minX; this.minZ = minZ; this.maxX = maxX; this.maxZ = maxZ;
      this.boxes = [];
      this.hw = Math.ceil((maxX - minX) / HASH) + 2;
      this.hh = Math.ceil((maxZ - minZ) / HASH) + 2;
      this.hash = Array.from({ length: this.hw * this.hh }, () => []);
      this.stamp = 0;
    }

    // centre [x,y,z], size [x,y,z]
    addBox(c, s, tag = '') {
      const b = {
        min: [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2],
        max: [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2],
        active: true, tag, mark: 0, slick: !!SLICK[tag],
      };
      this.boxes.push(b);
      this._cells(b.min[0], b.min[2], b.max[0], b.max[2], list => list.push(b));
      return b;
    }
    removeBox(b) { b.active = false; }

    _cells(x0, z0, x1, z1, fn) {
      const i0 = Math.max(0, Math.floor((x0 - this.minX) / HASH) + 1), i1 = Math.min(this.hw - 1, Math.floor((x1 - this.minX) / HASH) + 1);
      const j0 = Math.max(0, Math.floor((z0 - this.minZ) / HASH) + 1), j1 = Math.min(this.hh - 1, Math.floor((z1 - this.minZ) / HASH) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(this.hash[j * this.hw + i]);
    }
    query(x0, z0, x1, z1) {
      const out = [];
      const st = ++this.stamp;
      this._cells(x0, z0, x1, z1, list => {
        for (const b of list) if (b.active && b.mark !== st) { b.mark = st; out.push(b); }
      });
      return out;
    }

    // Moves a character. p: THREE.Vector3 feet position, v: velocity (y used for gravity, caller sets it).
    // Returns true when standing on something.
    move(p, v, r, height, dt) {
      const step = 0.33; // a 0.3 m stair riser plus a little room for rounding
      const steps = Math.max(1, Math.ceil(Math.hypot(v.x, v.z) * dt / (r * 0.5)));
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.x += v.x * sdt;
        p.z += v.z * sdt;
        this.pushOut(p, r, p.y + step, p.y + height);
      }
      // vertical
      const prevY = p.y;
      p.y += v.y * dt;
      let ground = -Infinity;
      const rr = r * 0.85;
      for (const b of this.query(p.x - rr, p.z - rr, p.x + rr, p.z + rr)) {
        if (b.slick || b.max[1] > prevY + step + 0.01) continue;
        const cx = DW.clamp(p.x, b.min[0], b.max[0]), cz = DW.clamp(p.z, b.min[2], b.max[2]);
        if ((cx - p.x) ** 2 + (cz - p.z) ** 2 < rr * rr) ground = Math.max(ground, b.max[1]);
      }
      if (p.y <= ground + 0.02 && v.y <= 0.01) {
        p.y = ground;
        if (v.y < 0) v.y = 0;
        return true;
      }
      return false;
    }

    // Push a circle (x,z) out of every box overlapping the vertical range [y0, y1].
    pushOut(p, r, y0, y1) {
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const b of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
          if ((b.max[1] <= y0 && !b.slick) || b.min[1] >= y1) continue;
          const cx = DW.clamp(p.x, b.min[0], b.max[0]), cz = DW.clamp(p.z, b.min[2], b.max[2]);
          let dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            p.x += dx / d * push;
            p.z += dz / d * push;
          } else {
            // centre inside the box: leave along the shortest axis
            const l = p.x - b.min[0], rt = b.max[0] - p.x, f = p.z - b.min[2], bk = b.max[2] - p.z;
            const m = Math.min(l, rt, f, bk);
            if (m === l) p.x = b.min[0] - r; else if (m === rt) p.x = b.max[0] + r;
            else if (m === f) p.z = b.min[2] - r; else p.z = b.max[2] + r;
          }
          moved = true;
        }
        if (!moved) break;
      }
    }

    // Ray against static boxes. o, d: THREE.Vector3 (d normalised). Returns {t, normal:[x,y,z], box} or null.
    raycast(o, d, maxT) {
      let best = null, bt = maxT;
      const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
      const cand = this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
      const ov = [o.x, o.y, o.z], dv = [d.x, d.y, d.z];
      for (const b of cand) {
        let t0 = 0, t1 = bt, axis = -1, sign = 0;
        let ok = true;
        for (let a = 0; a < 3; a++) {
          if (Math.abs(dv[a]) < 1e-9) {
            if (ov[a] < b.min[a] || ov[a] > b.max[a]) { ok = false; break; }
            continue;
          }
          const inv = 1 / dv[a];
          let ta = (b.min[a] - ov[a]) * inv, tb = (b.max[a] - ov[a]) * inv;
          let s = -1;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
          if (ta > t0) { t0 = ta; axis = a; sign = s; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (!ok || t0 >= bt) continue;
        if (axis < 0) { t0 = 0; axis = 1; sign = 1; } // started inside
        bt = t0;
        const n = [0, 0, 0];
        n[axis] = sign;
        best = { t: t0, normal: n, box: b };
      }
      return best;
    }

    hasLine(a, b) {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      if (len < 1e-4) return true;
      d.multiplyScalar(1 / len);
      return this.raycast(a, d, len) === null;
    }
  }
  DW.Phys = Phys;

  // ray vs sphere / vertical capsule. ro, rd: Vector3-like (rd normalised). Return t or -1.
  DW.raySphere = (ro, rd, c, r) => {
    const ox = ro.x - c.x, oy = ro.y - c.y, oz = ro.z - c.z;
    const b = ox * rd.x + oy * rd.y + oz * rd.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const h = b * b - cc;
    if (h < 0) return -1;
    const t = -b - Math.sqrt(h);
    if (t < 0) return cc < 0 ? 0 : -1;
    return t;
  };
  DW.rayCapsule = (ro, rd, pa, pb, r) => {
    const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
    const oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
    const baba = bax * bax + bay * bay + baz * baz;
    const bard = bax * rd.x + bay * rd.y + baz * rd.z;
    const baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = rd.x * oax + rd.y * oay + rd.z * oaz;
    const oaoa = oax * oax + oay * oay + oaz * oaz;
    const a = baba - bard * bard;
    let b = baba * rdoa - baoa * bard;
    let c = baba * oaoa - baoa * baoa - r * r * baba;
    let h = b * b - a * c;
    if (h >= 0 && Math.abs(a) > 1e-9) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (y > 0 && y < baba) return t >= 0 ? t : (c < 0 ? 0 : -1);
    }
    // caps
    const ta = DW.raySphere(ro, rd, pa, r), tb = DW.raySphere(ro, rd, pb, r);
    if (ta < 0) return tb;
    if (tb < 0) return ta;
    return Math.min(ta, tb);
  };

  // ---------------------------------------------------------------- navigation flow field

  const RES = 0.5;
  class Nav {
    constructor(phys) {
      this.phys = phys;
      this.ox = phys.minX; this.oz = phys.minZ;
      this.w = Math.ceil((phys.maxX - phys.minX) / RES);
      this.h = Math.ceil((phys.maxZ - phys.minZ) / RES);
      this.blocked = new Uint8Array(this.w * this.h);
      this.height = new Float32Array(this.w * this.h); // floor height of each cell (ground, stair step or deck top)
      this.dist = new Float64Array(this.w * this.h).fill(Infinity);
      this.heap = new Int32Array(this.w * this.h * 8);
      this.rebuild();
    }
    cellOf(x, z) {
      return [DW.clamp(Math.floor((x - this.ox) / RES), 0, this.w - 1), DW.clamp(Math.floor((z - this.oz) / RES), 0, this.h - 1)];
    }
    center(i, j) { return [this.ox + (i + 0.5) * RES, this.oz + (j + 0.5) * RES]; }
    // Each cell gets one floor height (the highest walkable surface over it: floor, stair step, deck).
    // It is blocked when anything sits between knee and head height above that floor. Elevators are
    // player-only, so their cells are blocked for zombies.
    rebuild() {
      const R = 0.45, W = this.w;
      const walkTags = { floor: 1, stair: 1, deck: 1 };
      this.blocked.fill(0);
      this.height.fill(-1000);
      for (const b of this.phys.boxes) {
        if (!b.active || !walkTags[b.tag]) continue;
        const [i0, j0] = this.cellOf(b.min[0], b.min[2]);
        const [i1, j1] = this.cellOf(b.max[0], b.max[2]);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const [cx, cz] = this.center(i, j);
          if (cx < b.min[0] || cx > b.max[0] || cz < b.min[2] || cz > b.max[2]) continue;
          if (b.max[1] > this.height[j * W + i]) this.height[j * W + i] = b.max[1];
        }
      }
      for (let k = 0; k < this.height.length; k++) if (this.height[k] < -999) this.blocked[k] = 1;
      for (const b of this.phys.boxes) {
        if (!b.active) continue;
        const lift = b.tag === 'lift';
        const [i0, j0] = this.cellOf(b.min[0] - R, b.min[2] - R);
        const [i1, j1] = this.cellOf(b.max[0] + R, b.max[2] + R);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * W + i;
          if (this.blocked[k]) continue;
          const [cx, cz] = this.center(i, j);
          if (lift) {
            if (cx >= b.min[0] && cx <= b.max[0] && cz >= b.min[2] && cz <= b.max[2]) this.blocked[k] = 1;
            continue;
          }
          const hgt = this.height[k];
          if (b.max[1] <= hgt + 0.35 || b.min[1] >= hgt + 1.6) continue;
          const qx = DW.clamp(cx, b.min[0], b.max[0]), qz = DW.clamp(cz, b.min[2], b.max[2]);
          if ((qx - cx) ** 2 + (qz - cz) ** 2 < R * R) this.blocked[k] = 1;
        }
      }
    }
    walkable(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i]; }
    // can a zombie step between two neighbouring cells? (both open, floor heights within one stair riser)
    link(i, j, ni, nj) {
      if (!this.walkable(ni, nj)) return false;
      return Math.abs(this.height[j * this.w + i] - this.height[nj * this.w + ni]) <= 0.35;
    }
    heightAt(x, z) {
      const [i, j] = this.cellOf(x, z);
      return this.height[j * this.w + i];
    }
    nearestWalkable(i, j) {
      if (this.walkable(i, j)) return [i, j];
      for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (this.walkable(i + di, j + dj)) return [i + di, j + dj];
      }
      return [i, j];
    }
    // Multi-source Dijkstra from target positions [[x,z],...]
    compute(targets) {
      const { w, h, dist, blocked } = this;
      dist.fill(Infinity);
      const heap = this.heap, hd = [];
      let n = 0;
      const push = (idx, d) => {
        let k = n++;
        heap[k] = idx; hd[k] = d;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (hd[p] <= hd[k]) break;
          [heap[p], heap[k]] = [heap[k], heap[p]];
          [hd[p], hd[k]] = [hd[k], hd[p]];
          k = p;
        }
      };
      const pop = () => {
        const top = heap[0], td = hd[0];
        n--;
        heap[0] = heap[n]; hd[0] = hd[n];
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < n && hd[l] < hd[m]) m = l;
          if (r < n && hd[r] < hd[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          [hd[m], hd[k]] = [hd[k], hd[m]];
          k = m;
        }
        return [top, td];
      };
      for (const [x, z] of targets) {
        const [i, j] = this.nearestWalkable(...this.cellOf(x, z));
        const idx = j * w + i;
        dist[idx] = 0;
        push(idx, 0);
      }
      const D = Math.SQRT2;
      while (n > 0) {
        const [idx, d] = pop();
        if (d > dist[idx]) continue;
        const i = idx % w, j = (idx - i) / w;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nIdx = nj * w + ni;
          if (blocked[nIdx] || !this.link(i, j, ni, nj)) continue;
          if (di && dj && (!this.link(i, j, ni, j) || !this.link(i, j, i, nj))) continue;
          const nd = d + (di && dj ? D : 1);
          if (nd < dist[nIdx]) {
            dist[nIdx] = nd;
            if (n < heap.length) push(nIdx, nd);
          }
        }
      }
    }
    distAt(x, z) {
      const [i, j] = this.nearestWalkable(...this.cellOf(x, z));
      return this.dist[j * this.w + i];
    }
    // Straight walkable line between two points (samples every quarter cell, no drops or climbs
    // bigger than a stair riser along the way).
    lineClear(x0, z0, x1, z1) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.ceil(len / (RES * 0.5));
      let [pi, pj] = this.cellOf(x0, z0);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const [i, j] = this.cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
        if (this.blocked[j * this.w + i]) return false;
        if (i !== pi || j !== pj) {
          if (Math.abs(this.height[j * this.w + i] - this.height[pj * this.w + pi]) > 0.35) return false;
          pi = i; pj = j;
        }
      }
      return true;
    }
    // Next point to walk toward from (x,z) following the flow field. null if unreachable.
    steer(x, z) {
      let [i, j] = this.cellOf(x, z);
      if (this.blocked[j * this.w + i]) {
        const [ni, nj] = this.nearestWalkable(i, j);
        const c = this.center(ni, nj);
        return { x: c[0], z: c[1], d: this.dist[nj * this.w + ni] };
      }
      if (!isFinite(this.dist[j * this.w + i])) return null;
      let best = [x, z];
      let ci = i, cj = j;
      for (let s = 0; s < 10; s++) {
        let bi = -1, bj = -1, bd = this.dist[cj * this.w + ci];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.link(ci, cj, ni, nj)) continue;
          if (di && dj && (!this.link(ci, cj, ci + di, cj) || !this.link(ci, cj, ci, cj + dj))) continue;
          const d = this.dist[nj * this.w + ni];
          if (d < bd) { bd = d; bi = ni; bj = nj; }
        }
        if (bi < 0) break;
        ci = bi; cj = bj;
        const c = this.center(ci, cj);
        if (s === 0 || this.lineClear(x, z, c[0], c[1])) best = c;
        else break;
        if (bd === 0) break;
      }
      return { x: best[0], z: best[1], d: this.dist[j * this.w + i] };
    }
  }
  DW.Nav = Nav;
})();
