// Low-poly blocky models built from primitives: characters, guns and props.
// Everything faces -Z. Geometries and materials are cached; bake() merges a node's plain
// opaque meshes into one vertex-coloured mesh so a zombie is ~15 draw calls, not ~60.
'use strict';
(function () {
  const M = DW.Models = {};
  const T = THREE;
  const _mats = new Map();
  const _geos = new Map();

  const METAL = [0.13, 0.13, 0.14];
  const STEEL = [0.32, 0.33, 0.35];
  const WOOD = [0.42, 0.25, 0.12];
  const POLY = [0.09, 0.09, 0.1];
  M.METAL = METAL;
  // no environment reflections here (Godot had them), so full metalness renders nearly black
  const METAL_SCALE = 0.3;

  // colour helpers (Godot semantics), colours are [r,g,b(,a)] in sRGB 0..1
  M.darkened = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a)];
  M.lightened = (c, a) => [c[0] + (1 - c[0]) * a, c[1] + (1 - c[1]) * a, c[2] + (1 - c[2]) * a];
  M.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  M.color = c => new T.Color().setRGB(c[0], c[1], c[2]).convertSRGBToLinear();

  M.mat = (c, emit = 0, metal = 0, rough = 0.85, unshaded = false) => {
    const a = c.length > 3 ? c[3] : 1;
    const key = `${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)},${a.toFixed(2)}|${emit}|${metal}|${rough}|${unshaded}`;
    let m = _mats.get(key);
    if (m) return m;
    if (unshaded) {
      const col = M.color(c);
      if (emit > 0) col.multiplyScalar(Math.min(1 + emit * 0.15, 2.0));
      m = new T.MeshBasicMaterial({ color: col, fog: true });
    } else {
      m = new T.MeshStandardMaterial({ color: M.color(c), metalness: metal * METAL_SCALE, roughness: rough });
      if (emit > 0) {
        m.emissive = M.color(c);
        m.emissiveIntensity = Math.min(emit, 2.5);
      }
    }
    if (a < 0.999) {
      m.transparent = true;
      m.opacity = a;
      m.depthWrite = false;
    }
    m.userData.src = { c, emit, metal, rough, unshaded, a };
    _mats.set(key, m);
    return m;
  };

  function geo(key, make) {
    let g = _geos.get(key);
    if (!g) { g = make(); _geos.set(key, g); }
    return g;
  }
  M.boxGeo = (x, y, z) => geo(`b${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`, () => new T.BoxGeometry(x, y, z));
  M.cylGeo = (rt, rb, h, segs) => geo(`c${rt.toFixed(3)},${rb.toFixed(3)},${h.toFixed(3)},${segs}`, () => new T.CylinderGeometry(rt, rb, h, segs, 1));
  M.ballGeo = (r, segs) => geo(`s${r.toFixed(3)},${segs}`, () => new T.SphereGeometry(r, segs, Math.max(3, segs >> 1)));

  function place(o, pos, rot) {
    o.rotation.order = 'YXZ';
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
  }
  M.box = (parent, pos, size, m, rot) => {
    const mi = new T.Mesh(M.boxGeo(size[0], size[1], size[2]), m);
    place(mi, pos, rot);
    parent.add(mi);
    return mi;
  };
  M.cyl = (parent, pos, rt, rb, h, m, segs = 6, rot) => {
    const mi = new T.Mesh(M.cylGeo(rt, rb, h, segs), m);
    place(mi, pos, rot);
    parent.add(mi);
    return mi;
  };
  M.ball = (parent, pos, r, m, segs = 7) => {
    const mi = new T.Mesh(M.ballGeo(r, segs), m);
    place(mi, pos);
    parent.add(mi);
    return mi;
  };
  M.joint = (parent, pos) => {
    const j = new T.Object3D();
    place(j, pos);
    parent.add(j);
    return j;
  };
  M.node = (parent, pos, rotY = 0) => {
    const j = M.joint(parent, pos);
    j.rotation.y = rotY;
    return j;
  };

  // ---------------------------------------------------------------- text
  const _textCache = new Map();
  function textTexture(text, size, color, outline) {
    const key = `${text}|${size}|${color}|${outline}`;
    let e = _textCache.get(key);
    if (e) return e;
    const lines = String(text).split('\n');
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.font = font;
    let w = 4;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = outline + 4;
    c.width = Math.ceil(w + pad * 2);
    c.height = Math.ceil(lines.length * size * 1.15 + pad * 2);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = pad + size * 1.15 * (i + 0.5);
      if (outline > 0) {
        ctx.lineWidth = outline;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineJoin = 'round';
        ctx.strokeText(l, c.width / 2, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(l, c.width / 2, y);
    });
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.minFilter = T.LinearFilter;
    e = { tex, w: c.width, h: c.height };
    _textCache.set(key, e);
    return e;
  }
  // Billboard text (like Godot's Label3D with billboard on). pixel = metres per pixel.
  M.label = (parent, pos, text, size = 48, color = [1, 1, 1], opts = {}) => {
    const t = textTexture(text, size, DW.css(color), opts.outline != null ? opts.outline : 8);
    const mat = new T.SpriteMaterial({ map: t.tex, transparent: true, depthTest: !opts.noDepth, depthWrite: false, fog: false });
    const s = new T.Sprite(mat);
    const px = opts.pixel || 0.004;
    s.scale.set(t.w * px, t.h * px, 1);
    s.position.set(pos[0], pos[1], pos[2]);
    if (opts.noDepth) s.renderOrder = 10;
    s.userData.labelOpts = { size, px, outline: opts.outline != null ? opts.outline : 8 };
    parent.add(s);
    return s;
  };
  M.setLabel = (s, text, color) => {
    const o = s.userData.labelOpts;
    const t = textTexture(text, o.size, DW.css(color), o.outline);
    if (s.material.map !== t.tex) {
      s.material.map = t.tex;
      s.material.needsUpdate = true;
      s.scale.set(t.w * o.px, t.h * o.px, 1);
    }
  };
  // Flat text facing -Z (or rotated) - used on machines.
  M.flatText = (parent, pos, text, size, color, px, rotY = 0, outline = 0) => {
    const t = textTexture(text, size, DW.css(color), outline);
    const mat = new T.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, fog: true });
    const mi = new T.Mesh(new T.PlaneGeometry(t.w * px, t.h * px), mat);
    place(mi, pos, [0, rotY, 0]);
    parent.add(mi);
    return mi;
  };

  // ---------------------------------------------------------------- baking (mesh merging)

  const _tmpM = new T.Matrix4();
  const _tmpN = new T.Matrix3();
  const _v = new T.Vector3();
  const _n = new T.Vector3();
  const _bakeMats = new Map();
  function bakeMat(metal, rough, textured) {
    const key = `${metal.toFixed(1)}|${rough.toFixed(1)}|${textured}`;
    let m = _bakeMats.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ vertexColors: true, metalness: metal * METAL_SCALE, roughness: rough });
      if (textured) m.map = M.noiseTexture();
      _bakeMats.set(key, m);
    }
    return m;
  }
  function bakeable(o) {
    if (!o.isMesh || o.isSprite || o.userData.noBake) return false;
    const m = o.material;
    if (!m || !m.userData.src) return false;
    const s = m.userData.src;
    return s.emit === 0 && !s.unshaded && s.a >= 0.999;
  }
  // Merge meshes into one geometry. items: [{geometry, matrix, color(THREE.Color linear)}]
  // worldUV: generate box-projected UVs from positions (for the textured map material).
  function mergeItems(items, worldUV) {
    let count = 0;
    const flat = items.map(it => {
      const g = it.geometry.index ? it.geometry.toNonIndexed() : it.geometry;
      count += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const uv = worldUV ? new Float32Array(count * 2) : null;
    let o = 0;
    items.forEach((it, i) => {
      const g = flat[i];
      const p = g.attributes.position, n = g.attributes.normal;
      _tmpN.getNormalMatrix(it.matrix);
      const c = it.color;
      for (let k = 0; k < p.count; k++, o++) {
        _v.fromBufferAttribute(p, k).applyMatrix4(it.matrix);
        _n.fromBufferAttribute(n, k).applyMatrix3(_tmpN).normalize();
        pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        nor[o * 3] = _n.x; nor[o * 3 + 1] = _n.y; nor[o * 3 + 2] = _n.z;
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
        if (uv) {
          const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
          const s = 0.35;
          if (ay >= ax && ay >= az) { uv[o * 2] = _v.x * s; uv[o * 2 + 1] = _v.z * s; }
          else if (ax >= az) { uv[o * 2] = _v.z * s; uv[o * 2 + 1] = _v.y * s; }
          else { uv[o * 2] = _v.x * s; uv[o * 2 + 1] = _v.y * s; }
        }
      }
    });
    const bg = new T.BufferGeometry();
    bg.setAttribute('position', new T.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
    bg.setAttribute('color', new T.BufferAttribute(col, 3));
    if (uv) bg.setAttribute('uv', new T.BufferAttribute(uv, 2));
    bg.computeBoundingSphere();
    return bg;
  }
  M.mergeItems = mergeItems;

  // For every node under root, merge its direct bakeable mesh children into one mesh.
  M.bake = (root, castShadow = true) => {
    const nodes = [];
    root.traverse(o => { if (!o.isMesh) nodes.push(o); });
    for (const node of nodes) {
      const kids = node.children.filter(bakeable);
      const hidden = kids.filter(k => !k.visible);
      for (const h of hidden) node.remove(h);
      const vis = kids.filter(k => k.visible);
      if (vis.length < 2) continue;
      const buckets = new Map();
      for (const k of vis) {
        const s = k.material.userData.src;
        const key = `${s.metal.toFixed(1)}|${s.rough.toFixed(1)}`;
        if (!buckets.has(key)) buckets.set(key, { metal: s.metal, rough: s.rough, items: [] });
        k.updateMatrix();
        buckets.get(key).items.push({ geometry: k.geometry, matrix: k.matrix.clone(), color: k.material.color });
        node.remove(k);
      }
      for (const b of buckets.values()) {
        const mesh = new T.Mesh(mergeItems(b.items, false), bakeMat(b.metal, b.rough, false));
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        node.add(mesh);
      }
    }
    return root;
  };

  // Static scenery collector: merges everything added through it into a few big meshes.
  M.StaticBatch = class {
    constructor() { this.buckets = new Map(); this.extra = new T.Group(); }
    // add a whole subtree (Object3D built with the helpers above) at its current world placement
    addTree(obj) {
      obj.updateMatrixWorld(true);
      const keep = [];
      obj.traverse(o => {
        if (bakeable(o) && o.visible) {
          const s = o.material.userData.src;
          const textured = !!o.userData.textured;
          const key = `${s.metal.toFixed(1)}|${s.rough.toFixed(1)}|${textured}`;
          if (!this.buckets.has(key)) this.buckets.set(key, { metal: s.metal, rough: s.rough, textured, items: [] });
          this.buckets.get(key).items.push({ geometry: o.geometry, matrix: o.matrixWorld.clone(), color: o.material.color });
        } else if ((o.isMesh || o.isSprite) && o.visible) keep.push(o);
      });
      for (const o of keep) {
        o.updateMatrixWorld(true);
        const c = o.clone();
        o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
        this.extra.add(c);
      }
    }
    build(scene) {
      for (const b of this.buckets.values()) {
        // split very large buckets so frustum culling still helps a bit
        const mesh = new T.Mesh(mergeItems(b.items, b.textured), bakeMat(b.metal, b.rough, b.textured));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
      scene.add(this.extra);
    }
  };

  let _noise = null;
  M.noiseTexture = () => {
    if (_noise) return _noise;
    const N = 128, c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const r = DW.rng(1234);
    // tileable value noise, 4 octaves
    const oct = [8, 16, 32, 64].map(g => { const a = []; for (let i = 0; i < g * g; i++) a.push(r.randf()); return { g, a }; });
    const smooth = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const o of oct) {
        const fx = x / N * o.g, fy = y / N * o.g;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
        const at = (i, j) => o.a[((j % o.g) * o.g) + (i % o.g)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp; tot += amp; amp *= 0.5;
      }
      v /= tot;
      const g = Math.round(DW.clamp(0.55 + v * 0.55, 0, 1) * 255 * 0.93);
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    _noise = new T.CanvasTexture(c);
    _noise.wrapS = _noise.wrapT = T.RepeatWrapping;
    _noise.encoding = T.sRGBEncoding;
    _noise.anisotropy = 4;
    return _noise;
  };

  // ================================================================ characters

  // Blocky humanoid under parent. Feet at y=0, facing -Z.
  M.humanoid = (parent, opt) => {
    const build = opt.build || 'normal';
    const w = { normal: 1.0, lean: 0.85, brute: 1.35, bloated: 1.15 }[build] || 1.0;
    const skinC = opt.skin || [0.6, 0.48, 0.38];
    const skin = M.mat(skinC);
    const shirt = M.mat(opt.shirt || [0.3, 0.3, 0.3]);
    const pants = M.mat(opt.pants || [0.2, 0.2, 0.22]);
    const shoe = M.mat(opt.shoe || [0.1, 0.08, 0.07]);
    const sleeve = opt.sleeves !== false ? shirt : skin;
    const r = {};
    const hips = M.joint(parent, [0, 0.95, 0]);
    r.hips = hips;
    M.box(hips, [0, 0, 0], [0.36 * w, 0.2, 0.22 * w], pants);
    for (const side of [-1, 1]) {
      const leg = M.joint(hips, [0.11 * side * w, -0.03, 0]);
      M.box(leg, [0, -0.21, 0], [0.16 * w, 0.44, 0.18 * w], pants);
      const knee = M.joint(leg, [0, -0.43, 0]);
      M.box(knee, [0, -0.2, 0], [0.14 * w, 0.42, 0.15 * w], pants);
      M.box(knee, [0, -0.44, -0.05], [0.15 * w, 0.08, 0.27], shoe);
      r[side < 0 ? 'leg_l' : 'leg_r'] = leg;
      r[side < 0 ? 'knee_l' : 'knee_r'] = knee;
    }
    const spine = M.joint(hips, [0, 0.08, 0]);
    r.spine = spine;
    M.box(spine, [0, 0.13, 0], [0.34 * w, 0.26, 0.2 * w], shirt);
    const chestW = build !== 'brute' ? 0.44 * w : 0.62;
    M.box(spine, [0, 0.4, 0], [chestW, 0.3, 0.26 * w], shirt);
    if (build === 'bloated') M.ball(spine, [0, 0.18, -0.08], 0.27, M.mat(opt.belly || [0.45, 0.55, 0.25]), 8);
    M.box(spine, [0, 0.58, 0], [0.12, 0.08, 0.12], skin);
    const head = M.joint(spine, [0, 0.62, 0]);
    r.head = head;
    M.box(head, [0, 0.13, 0], [0.26, 0.27, 0.26], skin);
    const jaw = M.joint(head, [0, 0.03, -0.01]);
    M.box(jaw, [0, -0.02, -0.03], [0.22, 0.07, 0.2], skin);
    r.jaw = jaw;
    if (opt.eye) {
      const em = M.mat(opt.eye, 7.0);
      M.box(head, [-0.06, 0.16, -0.131], [0.065, 0.035, 0.01], em);
      M.box(head, [0.06, 0.16, -0.131], [0.065, 0.035, 0.01], em);
    } else {
      const dark = M.mat([0.05, 0.05, 0.05]);
      M.box(head, [-0.06, 0.16, -0.131], [0.04, 0.03, 0.01], dark);
      M.box(head, [0.06, 0.16, -0.131], [0.04, 0.03, 0.01], dark);
    }
    const shX = build !== 'brute' ? 0.29 * w : 0.4;
    const armW = build !== 'brute' ? 1.0 : 1.5;
    for (const side of [-1, 1]) {
      const arm = M.joint(spine, [shX * side, 0.5, 0]);
      M.box(arm, [0, -0.14, 0], [0.12 * armW, 0.3, 0.13 * armW], sleeve);
      const elbow = M.joint(arm, [0, -0.29, 0]);
      M.box(elbow, [0, -0.13, 0], [0.11 * armW, 0.27, 0.12 * armW], opt.long_sleeves ? sleeve : skin);
      M.box(elbow, [0, -0.31, 0], [0.1 * armW, 0.11, 0.07 * armW], M.mat(opt.hand || skinC));
      r[side < 0 ? 'arm_l' : 'arm_r'] = arm;
      r[side < 0 ? 'elbow_l' : 'elbow_r'] = elbow;
    }
    return r;
  };

  // Zombie of a given type with randomised clothes and damage. Returns the rig.
  M.zombie = (parent, type, rng) => {
    const skins = [[0.45, 0.5, 0.4], [0.52, 0.5, 0.42], [0.4, 0.45, 0.42], [0.55, 0.47, 0.42], [0.38, 0.42, 0.33]];
    const shirts = [[0.32, 0.28, 0.22], [0.2, 0.26, 0.33], [0.38, 0.12, 0.1], [0.55, 0.53, 0.47], [0.22, 0.3, 0.2], [0.15, 0.15, 0.17], [0.45, 0.35, 0.2]];
    const pantsC = [[0.18, 0.2, 0.26], [0.25, 0.22, 0.17], [0.13, 0.13, 0.14], [0.3, 0.3, 0.28]];
    const opt = { skin: rng.pick(skins), shirt: rng.pick(shirts), pants: rng.pick(pantsC), eye: [1.0, 0.3, 0.1], build: 'normal', sleeves: rng.randf() < 0.5 };
    if (type === 'runner') Object.assign(opt, { build: 'lean', eye: [1.0, 0.85, 0.15], sleeves: false });
    else if (type === 'brute') Object.assign(opt, { build: 'brute', skin: [0.42, 0.3, 0.28], shirt: [0.22, 0.09, 0.07], pants: [0.12, 0.1, 0.09], eye: [1.0, 0.08, 0.04], sleeves: false });
    else if (type === 'spitter') Object.assign(opt, { build: 'bloated', skin: [0.36, 0.46, 0.22], shirt: [0.26, 0.3, 0.14], belly: [0.5, 0.62, 0.22], eye: [0.55, 1.0, 0.2], sleeves: false });
    const r = M.humanoid(parent, opt);
    const blood = M.mat([0.35, 0.03, 0.02], 0, 0, 0.4);
    const bone = M.mat([0.82, 0.78, 0.66]);
    const spine = r.spine, head = r.head;
    for (let i = rng.randi(1, 3); i > 0; i--)
      M.box(spine, [rng.range(-0.15, 0.15), rng.range(0.1, 0.5), -0.135], [rng.range(0.06, 0.16), rng.range(0.05, 0.14), 0.01], blood);
    for (let i = rng.randi(2, 4); i > 0; i--)
      M.box(spine, [rng.range(-0.14, 0.14), -0.02, rng.range(-0.08, 0.08)], [0.06, rng.range(0.06, 0.14), 0.02], M.mat(opt.shirt), [0, 0, rng.range(-0.4, 0.4)]);
    if (rng.randf() < 0.35 && type !== 'brute') {
      for (let k = 0; k < 3; k++) M.box(spine, [0, 0.33 + k * 0.07, -0.135], [0.22, 0.025, 0.015], bone);
      M.box(spine, [0, 0.4, -0.13], [0.24, 0.24, 0.005], M.mat([0.3, 0.05, 0.04]));
    }
    const hairRoll = rng.randf();
    if (hairRoll < 0.45) M.box(head, [0, 0.29, 0.02], [0.27, 0.06, 0.24], M.mat(rng.pick([[0.12, 0.1, 0.08], [0.3, 0.22, 0.12], [0.5, 0.48, 0.45]])));
    else if (hairRoll < 0.6 && type === 'walker') {
      const cap = M.mat(rng.pick([[0.2, 0.25, 0.4], [0.4, 0.15, 0.1], [0.25, 0.3, 0.2]]));
      M.box(head, [0, 0.3, 0.01], [0.28, 0.07, 0.28], cap);
      M.box(head, [0, 0.28, -0.17], [0.24, 0.02, 0.1], cap);
    }
    if (rng.randf() < 0.5) M.box(head, [rng.range(-0.08, 0.08), rng.range(0.18, 0.26), -0.131], [0.07, 0.05, 0.01], blood);
    M.box(r.jaw, [0, -0.04, -0.13], [0.16, 0.03, 0.01], M.mat([0.12, 0.02, 0.02]));
    if (type === 'walker' && rng.randf() < 0.12) {
      const e = rng.randf() < 0.5 ? r.elbow_l : r.elbow_r;
      for (const c of e.children) c.visible = false;
      M.box(e, [0, -0.04, 0], [0.1, 0.08, 0.1], blood);
      M.box(e, [0, -0.09, 0], [0.03, 0.06, 0.03], bone);
    }
    if (type === 'brute') {
      const plate = M.mat([0.42, 0.42, 0.45], 0, 0.6, 0.5);
      const rust = M.mat([0.5, 0.28, 0.14], 0, 0.3, 0.7);
      M.box(spine, [0, 0.42, -0.17], [0.6, 0.36, 0.05], plate);
      M.box(spine, [0, 0.15, -0.13], [0.5, 0.06, 0.04], rust);
      for (const side of [-1, 1]) {
        const arm = side < 0 ? r.arm_l : r.arm_r;
        M.box(arm, [0.02 * side, 0.02, 0], [0.28, 0.12, 0.3], plate);
        M.cyl(arm, [0.05 * side, 0.15, 0], 0.0, 0.05, 0.16, rust, 4);
      }
      M.box(head, [0, 0.13, -0.14], [0.28, 0.3, 0.04], plate);
      M.box(head, [0, 0.16, -0.165], [0.2, 0.03, 0.01], M.mat([1.0, 0.1, 0.05], 6.0));
      M.box(head, [0, 0.29, 0], [0.3, 0.06, 0.3], plate);
    } else if (type === 'spitter') {
      const pus = M.mat([0.65, 1.0, 0.2], 3.0);
      for (let i = 0; i < 7; i++) {
        const a = rng.randf() * Math.PI * 2;
        M.ball(spine, [Math.cos(a) * 0.22, 0.12 + rng.range(-0.1, 0.18), -0.08 + Math.sin(a) * 0.22], rng.range(0.04, 0.07), pus, 5);
      }
      M.ball(spine, [0.15, 0.48, 0.12], 0.09, pus, 5);
      M.box(r.jaw, [0, -0.07, -0.08], [0.12, 0.08, 0.04], pus);
    }
    return r;
  };

  // The Goon Lord, the Wendygoon: a gaunt, pale, antlered thing with a skull face and long claws.
  M.wendygoon = (parent, rng) => {
    const r = M.humanoid(parent, { build: 'lean', skin: [0.72, 0.7, 0.64], shirt: [0.16, 0.13, 0.11], pants: [0.12, 0.1, 0.09],
      shoe: [0.08, 0.07, 0.06], eye: [0.75, 1.0, 1.0], sleeves: false, hand: [0.2, 0.18, 0.16] });
    const bone = M.mat([0.86, 0.82, 0.7]);
    const fur = M.mat([0.14, 0.11, 0.09], 0, 0, 1);
    const dark = M.mat([0.05, 0.04, 0.04]);
    const spine = r.spine, head = r.head;
    // ribcage on a sunken chest
    for (let k = 0; k < 5; k++) M.box(spine, [0, 0.2 + k * 0.065, -0.12], [0.3 - k * 0.02, 0.022, 0.03], bone);
    M.box(spine, [0, 0.33, -0.1], [0.03, 0.3, 0.03], bone);
    // shaggy fur mantle on the shoulders and back
    M.box(spine, [0, 0.55, 0.04], [0.56, 0.12, 0.3], fur);
    for (let k = 0; k < 6; k++) M.box(spine, [rng.range(-0.25, 0.25), rng.range(0.3, 0.55), 0.13], [0.1, rng.range(0.2, 0.35), 0.06], fur, [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)]);
    // skull face
    M.box(head, [0, 0.14, -0.02], [0.27, 0.3, 0.27], bone);
    M.box(head, [0, 0.0, -0.08], [0.2, 0.08, 0.17], bone);
    for (const x of [-0.065, 0.065]) M.box(head, [x, 0.17, -0.155], [0.08, 0.07, 0.02], dark);
    M.box(head, [0, 0.09, -0.155], [0.04, 0.05, 0.02], dark);
    const eye = M.mat([0.75, 1.0, 1.0], 8.0);
    for (const x of [-0.065, 0.065]) M.box(head, [x, 0.17, -0.168], [0.035, 0.03, 0.01], eye);
    for (let k = 0; k < 5; k++) M.box(r.jaw, [-0.08 + k * 0.04, -0.06, -0.13], [0.022, 0.05, 0.015], bone);
    // antlers
    for (const side of [-1, 1]) {
      const a = M.joint(head, [0.1 * side, 0.27, 0.0]);
      a.rotation.set(-0.2, 0, -0.5 * side);
      M.cyl(a, [0, 0.22, 0], 0.018, 0.03, 0.45, bone, 5);
      for (const [y, ang, len] of [[0.14, 0.9, 0.2], [0.28, -0.8, 0.18], [0.38, 0.7, 0.16]]) {
        const tine = M.joint(a, [0, y, 0]);
        tine.rotation.set(ang * 0.6, 0, ang * side);
        M.cyl(tine, [0, len / 2, 0], 0.008, 0.018, len, bone, 4);
      }
    }
    // long claws
    for (const el of [r.elbow_l, r.elbow_r])
      for (const x of [-0.035, 0, 0.035]) M.box(el, [x, -0.45, -0.02], [0.015, 0.18, 0.02], dark, [0.25, 0, 0]);
    return r;
  };

  // Player soldier for remote teammates. Returns the rig plus a gun_mount node.
  M.soldier = (parent, color) => {
    const opt = { skin: [0.62, 0.47, 0.36], shirt: color, pants: M.darkened(color, 0.3), shoe: [0.08, 0.07, 0.06], hand: [0.08, 0.08, 0.08], eye: null, long_sleeves: true };
    const r = M.humanoid(parent, opt);
    const vest = M.mat([0.2, 0.22, 0.17]);
    const strap = M.mat([0.12, 0.12, 0.1]);
    const spine = r.spine, head = r.head;
    M.box(spine, [0, 0.38, 0], [0.48, 0.36, 0.3], vest);
    for (const x of [-0.12, 0.0, 0.12]) M.box(spine, [x, 0.3, -0.16], [0.09, 0.11, 0.05], strap);
    M.box(spine, [0, 0.36, 0.22], [0.34, 0.4, 0.16], M.mat(M.darkened(color, 0.45)));
    M.box(spine, [0, 0.6, 0.22], [0.3, 0.1, 0.14], strap);
    const helmet = M.mat(M.mix(M.darkened(color, 0.2), [0.25, 0.28, 0.2], 0.5));
    M.box(head, [0, 0.27, 0.01], [0.31, 0.1, 0.31], helmet);
    M.box(head, [0, 0.22, 0.01], [0.34, 0.04, 0.34], helmet);
    M.box(head, [0, 0.2, -0.15], [0.2, 0.04, 0.03], M.mat([0.05, 0.05, 0.06], 0, 0.6, 0.2));
    // hold-the-gun pose (fitted so the right hand sits on the grip, the left on the front of the gun)
    r.arm_r.rotation.set(0.25, 0.5, 0);
    r.elbow_r.rotation.set(1.8, 0, 0);
    r.arm_l.rotation.set(1.4, -0.65, 0);
    r.elbow_l.rotation.set(0, 0, 0);
    r.gun_mount = M.joint(spine, [0.13, 0.36, -0.30]);
    return r;
  };

  // ================================================================ guns

  // Gun model for weapon id, pointing -Z, origin at the grip. userData.muzzle = [x,y,z].
  // chalk builds a flat outline for wall-buys.
  M.gun = (id, chalk = false, pap = false) => {
    const g = new T.Group();
    const accent = DW.WEAPONS[id].color;
    let metal = M.mat(METAL, 0, 0.7, 0.4);
    let steel = M.mat(STEEL, 0, 0.8, 0.3);
    let wood = M.mat(accent[0] > accent[2] + 0.1 ? accent : WOOD);
    let poly = M.mat(POLY, 0, 0.1, 0.6);
    if (chalk) metal = steel = wood = poly = M.mat([0.92, 0.9, 0.82], 0.4, 0, 1, true);
    const x90 = [Math.PI / 2, 0, 0];
    const box = (p, s, m, r) => M.box(g, p, s, m, r);
    const cyl = (p, a, b, h, m, segs, r) => M.cyl(g, p, a, b, h, m, segs, r);
    let muzzle = [0, 0.05, -0.5];
    switch (id) {
      case 'pistol':
        box([0, 0.05, -0.08], [0.035, 0.045, 0.2], metal);
        box([0, 0.017, -0.07], [0.03, 0.03, 0.17], poly);
        box([0, -0.045, 0.0], [0.032, 0.11, 0.05], poly, [0.25, 0, 0]);
        box([0, -0.005, -0.055], [0.01, 0.03, 0.045], poly);
        box([0, 0.08, -0.17], [0.008, 0.012, 0.01], metal);
        muzzle = [0, 0.05, -0.19];
        break;
      case 'deagle': {
        const chrome = chalk ? steel : M.mat([0.62, 0.62, 0.65], 0, 0.9, 0.2);
        box([0, 0.06, -0.1], [0.045, 0.06, 0.27], chrome);
        box([0, 0.095, -0.1], [0.015, 0.012, 0.26], chrome);
        box([0, 0.02, -0.08], [0.038, 0.035, 0.2], chrome);
        box([0, -0.05, 0.0], [0.04, 0.13, 0.06], poly, [0.22, 0, 0]);
        box([0, -0.005, -0.06], [0.012, 0.035, 0.05], chrome);
        muzzle = [0, 0.06, -0.24];
        break;
      }
      case 'm14':
        box([0, 0.0, -0.18], [0.05, 0.065, 0.62], wood);
        box([0, -0.03, 0.27], [0.048, 0.12, 0.26], wood, [-0.08, 0, 0]);
        box([0, 0.05, -0.1], [0.045, 0.045, 0.28], metal);
        cyl([0, 0.045, -0.62], 0.011, 0.013, 0.36, metal, 6, x90);
        box([0, -0.075, -0.1], [0.035, 0.1, 0.07], metal);
        box([0, 0.08, -0.76], [0.008, 0.03, 0.012], metal);
        box([0, 0.085, 0.03], [0.02, 0.03, 0.03], metal);
        muzzle = [0, 0.045, -0.81];
        break;
      case 'shotgun':
        cyl([0, 0.05, -0.45], 0.016, 0.016, 0.62, metal, 6, x90);
        cyl([0, 0.017, -0.42], 0.013, 0.013, 0.5, metal, 6, x90);
        box([0, 0.015, -0.4], [0.055, 0.05, 0.17], wood);
        for (let k = 0; k < 4; k++) box([0, -0.012, -0.34 - k * 0.035], [0.057, 0.008, 0.012], poly);
        box([0, 0.03, -0.06], [0.052, 0.075, 0.22], metal);
        box([0, -0.02, 0.18], [0.048, 0.1, 0.3], wood, [-0.12, 0, 0]);
        box([0, -0.035, -0.02], [0.012, 0.04, 0.05], metal);
        box([0, 0.07, -0.75], [0.01, 0.012, 0.01], steel);
        muzzle = [0, 0.05, -0.77];
        break;
      case 'mp5':
        box([0, 0.03, -0.1], [0.05, 0.07, 0.32], poly);
        cyl([0, 0.03, -0.33], 0.024, 0.024, 0.16, poly, 6, x90);
        cyl([0, 0.03, -0.43], 0.01, 0.01, 0.06, metal, 6, x90);
        box([0, -0.06, -0.16], [0.03, 0.1, 0.05], metal, [0.18, 0, 0]);
        box([0, -0.14, -0.13], [0.03, 0.08, 0.05], metal, [0.38, 0, 0]);
        box([0, -0.04, 0.02], [0.035, 0.1, 0.05], poly, [0.2, 0, 0]);
        for (const y of [0.05, 0.0]) box([0, y, 0.13], [0.012, 0.012, 0.18], metal);
        box([0, 0.02, 0.22], [0.04, 0.09, 0.02], poly);
        box([0, 0.075, -0.05], [0.02, 0.025, 0.05], metal);
        box([0, 0.075, -0.35], [0.012, 0.03, 0.01], metal);
        muzzle = [0, 0.03, -0.47];
        break;
      case 'ak': {
        box([0, -0.015, 0.18], [0.046, 0.085, 0.28], wood, [-0.15, 0, 0]);
        box([0, 0.03, -0.08], [0.05, 0.07, 0.3], metal);
        box([0, 0.025, -0.32], [0.052, 0.055, 0.18], wood);
        cyl([0, 0.067, -0.33], 0.01, 0.01, 0.2, metal, 6, x90);
        cyl([0, 0.03, -0.5], 0.01, 0.01, 0.22, metal, 6, x90);
        const mag = chalk ? metal : M.mat([0.5, 0.25, 0.1]);
        box([0, -0.07, -0.13], [0.032, 0.1, 0.06], mag, [0.25, 0, 0]);
        box([0, -0.155, -0.095], [0.032, 0.09, 0.06], mag, [0.5, 0, 0]);
        box([0, -0.045, 0.02], [0.035, 0.1, 0.05], wood, [0.25, 0, 0]);
        box([0, 0.07, -0.58], [0.008, 0.035, 0.012], metal);
        muzzle = [0, 0.03, -0.62];
        break;
      }
      case 'lmg':
        box([0, 0.03, -0.12], [0.07, 0.09, 0.42], metal);
        cyl([0, 0.04, -0.6], 0.016, 0.016, 0.56, metal, 6, x90);
        box([0, 0.04, -0.48], [0.05, 0.05, 0.28], poly);
        cyl([0, -0.08, -0.12], 0.09, 0.09, 0.07, poly, 8, [0, 0, Math.PI / 2]);
        box([0, 0.1, -0.15], [0.02, 0.05, 0.14], poly);
        box([0, -0.01, 0.2], [0.05, 0.1, 0.26], poly, [-0.1, 0, 0]);
        box([0, -0.05, 0.0], [0.035, 0.1, 0.05], poly, [0.2, 0, 0]);
        for (const side of [-1, 1]) box([0.02 * side, 0.0, -0.62], [0.01, 0.01, 0.22], metal, [0.15, 0, 0.1 * side]);
        muzzle = [0, 0.04, -0.9];
        break;
      case 'sniper':
        cyl([0, 0.04, -0.62], 0.014, 0.016, 0.74, metal, 6, x90);
        box([0, 0.04, -1.0], [0.05, 0.035, 0.07], metal);
        box([0, 0.03, -0.12], [0.06, 0.08, 0.38], poly);
        cyl([0, 0.12, -0.12], 0.026, 0.03, 0.34, metal, 8, x90);
        for (const z of [-0.04, -0.2]) box([0, 0.085, z], [0.03, 0.03, 0.02], metal);
        box([0, -0.07, -0.15], [0.04, 0.09, 0.09], metal);
        box([0, -0.02, 0.22], [0.05, 0.12, 0.3], poly, [-0.08, 0, 0]);
        box([0, -0.05, 0.0], [0.035, 0.1, 0.05], poly, [0.2, 0, 0]);
        for (const side of [-1, 1]) box([0.02 * side, -0.02, -0.55], [0.01, 0.01, 0.24], metal, [0.12, 0, 0.08 * side]);
        muzzle = [0, 0.04, -1.04];
        break;
      case 'plasma': {
        const glow = chalk ? metal : M.mat([0.35, 1.0, 0.5], 4.0);
        const shell = chalk ? metal : M.mat([0.18, 0.2, 0.22], 0, 0.5, 0.4);
        box([0, 0.04, -0.12], [0.08, 0.1, 0.3], shell);
        for (let k = 0; k < 3; k++) cyl([0, 0.04, -0.15 - k * 0.07], 0.05, 0.05, 0.03, glow, 8, x90);
        cyl([0, 0.04, -0.33], 0.03, 0.04, 0.08, shell, 8, x90);
        box([0, 0.04, -0.38], [0.03, 0.03, 0.02], glow);
        box([0, 0.11, -0.08], [0.015, 0.05, 0.16], shell);
        box([0, -0.05, 0.0], [0.04, 0.1, 0.05], shell, [0.25, 0, 0]);
        box([0.042, 0.04, -0.05], [0.005, 0.03, 0.1], glow);
        muzzle = [0, 0.04, -0.4];
        break;
      }
      case 'wind': {
        const pale = chalk ? metal : M.mat([0.82, 0.9, 0.95], 0, 0.2, 0.4);
        const core = chalk ? metal : M.mat([0.55, 0.9, 1.0], 3.0);
        box([0, 0.03, -0.06], [0.07, 0.08, 0.22], pale);
        box([0, -0.05, 0.02], [0.04, 0.1, 0.05], poly, [0.25, 0, 0]);
        for (let k = 0; k < 3; k++) cyl([0, 0.04, -0.2 - k * 0.07], 0.055 - k * 0.008, 0.055 - k * 0.008, 0.015, core, 10, x90);
        cyl([0, 0.04, -0.2], 0.025, 0.035, 0.24, pale, 8, x90);
        box([0, 0.09, -0.05], [0.02, 0.03, 0.12], core);
        muzzle = [0, 0.04, -0.4];
        break;
      }
      case 'minigun':
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI * 2 / 6;
          cyl([Math.cos(a) * 0.035, 0.04 + Math.sin(a) * 0.035, -0.45], 0.011, 0.011, 0.56, metal, 5, x90);
        }
        for (const z of [-0.25, -0.68]) cyl([0, 0.04, z], 0.06, 0.06, 0.025, steel, 8, x90);
        cyl([0, 0.04, -0.06], 0.075, 0.075, 0.24, poly, 8, x90);
        box([0, 0.15, -0.05], [0.02, 0.06, 0.2], metal);
        box([0.1, -0.02, 0.0], [0.1, 0.12, 0.16], chalk ? metal : M.mat([0.25, 0.3, 0.2]));
        box([0, -0.06, 0.08], [0.035, 0.1, 0.05], poly, [0.2, 0, 0]);
        muzzle = [0, 0.04, -0.74];
        break;
    }
    g.userData.muzzle = muzzle;
    if (pap) M.papify(g);
    return g;
  };

  // ---------------------------------------------------------------- Pack-a-Poonch finish
  // A tiny bright cube map so the gem materials have something to reflect (the rest of the game has none).
  let _papEnv = null;
  function papEnv() {
    if (_papEnv) return _papEnv;
    const faces = [];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 64, 64);
      g.addColorStop(0, f === 2 ? '#ffffff' : '#9fffe0');
      g.addColorStop(0.5, '#0b3a2a');
      g.addColorStop(1, f % 2 ? '#e8ffff' : '#40c890');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 5; k++) ctx.fillRect((k * 23 + f * 11) % 64, 0, 3, 64); // light streaks
      faces.push(c);
    }
    _papEnv = new T.CubeTexture(faces);
    _papEnv.encoding = T.sRGBEncoding;
    _papEnv.needsUpdate = true;
    return _papEnv;
  }
  let _papMats = null;
  M.papMats = () => {
    if (_papMats) return _papMats;
    const env = papEnv();
    _papMats = [
      new T.MeshStandardMaterial({ color: M.color([0.05, 0.85, 0.45]), emissive: M.color([0.0, 0.55, 0.3]), emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.12, envMap: env, envMapIntensity: 1.6 }), // emerald
      new T.MeshStandardMaterial({ color: M.color([0.85, 1.0, 1.0]), emissive: M.color([0.4, 0.8, 0.85]), emissiveIntensity: 0.4, metalness: 0.95, roughness: 0.05, envMap: env, envMapIntensity: 2.0 }), // diamond
      new T.MeshStandardMaterial({ color: M.color([0.1, 0.6, 0.35]), emissive: M.color([0.05, 0.4, 0.25]), emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.2, envMap: env, envMapIntensity: 1.3 }), // dark emerald
    ];
    return _papMats;
  };
  // Swap every part of a gun to the gem finish (alternating emerald / diamond).
  M.papify = g => {
    const mats = M.papMats();
    let i = 0;
    g.traverse(o => { if (o.isMesh) { o.material = mats[i % mats.length]; o.userData.noBake = true; i++; } });
  };
  // shimmer: called every frame by the world
  M.tickPap = t => {
    if (!_papMats) return;
    _papMats[0].emissiveIntensity = 0.45 + 0.35 * Math.sin(t * 3.1);
    _papMats[1].emissiveIntensity = 0.3 + 0.35 * Math.sin(t * 4.3 + 1.7);
    _papMats[2].emissiveIntensity = 0.35 + 0.3 * Math.sin(t * 2.4 + 3.1);
  };

  // The Pack-a-Poonch: an old desk with a humming gem machine on top. Faces -Z.
  M.papDesk = parent => {
    const root = M.joint(parent, [0, 0, 0]);
    const wood = M.mat([0.36, 0.22, 0.12]);
    const dark = M.mat([0.2, 0.12, 0.07]);
    const metal = M.mat([0.3, 0.32, 0.34], 0, 0.7, 0.4);
    M.box(root, [0, 0.78, 0], [1.7, 0.08, 0.85], wood);
    for (const x of [-0.78, 0.78]) for (const z of [-0.36, 0.36]) M.box(root, [x, 0.38, z], [0.08, 0.76, 0.08], dark);
    M.box(root, [0.52, 0.5, 0], [0.55, 0.5, 0.75], wood);                     // drawers
    for (const y of [0.38, 0.62]) M.box(root, [0.52, y, -0.38], [0.12, 0.03, 0.02], metal);
    M.box(root, [0, 1.02, 0.05], [0.9, 0.4, 0.55], metal);                     // machine
    M.box(root, [0, 1.25, 0.05], [0.95, 0.06, 0.6], M.mat([0.12, 0.12, 0.13], 0, 0.6, 0.3));
    const glow = M.mat([0.2, 1.0, 0.6], 3.0);
    M.box(root, [0, 1.02, -0.231], [0.7, 0.18, 0.02], glow);                   // slot
    for (const x of [-0.3, 0.3]) M.cyl(root, [x, 1.38, 0.05], 0.05, 0.05, 0.22, metal, 6);
    // gem crystals on top
    const gems = M.papMats();
    [[-0.18, 1.42, 0.1, 0.22], [0.05, 1.47, -0.02, 0.3], [0.22, 1.4, 0.14, 0.18]].forEach(([x, y, z, h], i) => {
      const c = M.cyl(root, [x, y, z], 0.0, 0.07, h, gems[i % 3], 5);
      c.userData.noBake = true;
    });
    return root;
  };

  // Chalk drawing of a grenade for the grenade wall-buy.
  M.grenadeChalk = () => {
    const g = new T.Group();
    const c = M.mat([0.92, 0.9, 0.82], 0.4, 0, 1, true);
    M.ball(g, [0, 0, 0], 0.11, c, 8);
    M.box(g, [0, 0.13, 0], [0.06, 0.06, 0.06], c);
    M.box(g, [0.06, 0.15, 0], [0.12, 0.02, 0.03], c, [0, 0, -0.5]);
    M.cyl(g, [-0.07, 0.18, 0], 0.03, 0.03, 0.01, c, 8, [Math.PI / 2, 0, 0]);
    return g;
  };

  // ================================================================ props

  function crate(parent, pos, size, wood, trim, yaw) {
    if (size <= 0) return;
    const c = M.joint(parent, pos);
    c.rotation.y = yaw;
    M.box(c, [0, 0, 0], [size, size, size], wood);
    for (const s of [-1, 1]) M.box(c, [0, size * 0.45 * s, 0], [size + 0.02, size * 0.1, size + 0.02], trim);
    M.box(c, [0, 0, -size * 0.5 - 0.01], [size * 0.12, size * 1.1, 0.02], trim, [0, 0, 0.78]);
  }

  M.crateStack = (parent, pos, rng) => {
    const root = M.joint(parent, pos);
    const kind = rng.randi(0, 2);
    const wood = M.mat([0.45, 0.32, 0.17]);
    const trim = M.mat([0.3, 0.2, 0.1]);
    if (kind === 0) {
      crate(root, [-0.25, 0.475, 0.12], 0.95, wood, trim, rng.range(-0.2, 0.2));
      crate(root, [0.38, 0.4, -0.28], 0.8, wood, trim, rng.range(-0.3, 0.3));
      crate(root, [-0.2, 1.26, 0.08], 0.62, wood, trim, rng.range(-0.6, 0.6));
    } else if (kind === 1) {
      const cols = [[0.55, 0.15, 0.1], [0.2, 0.35, 0.5], [0.3, 0.38, 0.22]];
      const bm = M.mat(cols[rng.randi(0, 2)], 0, 0.4, 0.6);
      const band = M.mat([0.15, 0.15, 0.15], 0, 0.5, 0.5);
      for (const p of [[-0.32, 0, -0.28], [0.34, 0, -0.18], [0.0, 0, 0.33]]) {
        M.cyl(root, [p[0], 0.5, p[2]], 0.3, 0.3, 1.0, bm, 8);
        for (const y of [0.25, 0.75]) M.cyl(root, [p[0], y, p[2]], 0.31, 0.31, 0.04, band, 8);
        M.cyl(root, [p[0], 1.005, p[2]], 0.24, 0.24, 0.01, band, 8);
      }
    } else {
      const bag = M.mat([0.5, 0.45, 0.32]);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 3; k++) {
        const x = -0.5 + k * 0.5 + (row % 2 === 1 ? 0.25 : 0);
        if (x > 0.6) continue;
        M.box(root, [x, 0.18 + row * 0.3, -0.35], [0.48, 0.28, 0.32], bag, [0, rng.range(-0.1, 0.1), 0]);
        M.box(root, [x, 0.18 + row * 0.3, 0.2], [0.48, 0.28, 0.32], bag, [0, rng.range(-0.1, 0.1), 0]);
      }
    }
    return root;
  };

  M.pillar = (parent, pos, h, trim) => {
    M.box(parent, [pos[0], pos[1] + 0.15, pos[2]], [1.75, 0.3, 1.75], trim);
    M.box(parent, [pos[0], pos[1] + h - 0.15, pos[2]], [1.75, 0.3, 1.75], trim);
  };

  M.doorVisual = (parent, size, rng) => {
    const plank = M.mat([0.45, 0.3, 0.15]);
    const dark = M.mat([0.2, 0.15, 0.1]);
    const rubble = M.mat([0.35, 0.33, 0.3]);
    const horizontal = size[0] > size[2];
    const length = horizontal ? size[0] : size[2];
    const depth = horizontal ? size[2] : size[0];
    for (const face of [-1, 1]) for (let k = 0; k < 5; k++) {
      const y = -size[1] * 0.5 + 0.4 + k * 0.6 + rng.range(-0.08, 0.08);
      let p = [0, y, depth * 0.5 * face + 0.03 * face];
      let sz = [length * 0.95, 0.22, 0.05];
      let rot = [0, 0, rng.range(-0.12, 0.12)];
      if (!horizontal) {
        p = [p[2], p[1], 0];
        sz = [0.05, 0.22, length * 0.95];
        rot = [rng.range(-0.12, 0.12), 0, 0];
      }
      M.box(parent, p, sz, k % 2 === 0 ? plank : dark, rot);
    }
    for (let k = 0; k < 8; k++) {
      const off = rng.range(-length * 0.45, length * 0.45);
      let p = [off, -size[1] * 0.5 + 0.2, rng.range(-0.3, 0.3) + (depth * 0.5 + 0.25) * (k % 2 === 0 ? 1 : -1)];
      if (!horizontal) p = [p[2], p[1], off];
      const s = rng.range(0.2, 0.45);
      M.box(parent, p, [s, s, s], rubble, [rng.randf(), rng.randf(), rng.randf()]);
    }
  };

  M.mysteryBox = parent => {
    const root = M.joint(parent, [0, 0, 0]);
    const wood = M.mat([0.32, 0.2, 0.1]);
    const metal = M.mat([0.55, 0.45, 0.2], 0, 0.8, 0.3);
    M.box(root, [0, 0.35, 0], [1.8, 0.6, 0.85], wood);
    M.box(root, [0, 0.72, 0], [1.84, 0.16, 0.89], wood);
    for (const x of [-0.88, 0.88]) M.box(root, [x, 0.45, 0], [0.06, 0.82, 0.92], metal);
    M.box(root, [0, 0.66, -0.45], [0.14, 0.12, 0.04], metal);
    for (const z of [-0.44, 0.44]) for (const x of [-0.45, 0.45])
      M.flatText(root, [x, 0.38, z + (z < 0 ? -0.005 : 0.005)], '?', 96, [0.5, 0.8, 1.0], 0.004, z < 0 ? Math.PI : 0);
    for (const z of [-0.45, 0.45]) M.box(root, [0, 0.64, z], [1.7, 0.02, 0.02], M.mat([0.35, 0.65, 1.0], 1.2));
    const beam = M.cyl(root, [0, 6.0, 0], 0.22, 0.32, 11.0, M.mat([0.4, 0.7, 1.0, 0.14], 2.0, 0, 1, true), 8);
    beam.userData.noShadow = true;
    return root;
  };

  M.perkMachine = (parent, color, pname) => {
    const root = M.joint(parent, [0, 0, 0]);
    const body = M.mat(M.darkened(color, 0.55), 0, 0.3, 0.5);
    const trim = M.mat(M.darkened(color, 0.2), 0, 0.4, 0.4);
    M.box(root, [0, 1.05, 0.05], [1.1, 1.9, 0.8], body);
    M.box(root, [0, 2.1, 0.05], [1.2, 0.3, 0.86], M.mat(color, 2.5));
    M.box(root, [0, 1.15, -0.36], [0.75, 1.1, 0.03], M.mat([0.1, 0.15, 0.2, 0.7], 0.3, 0, 0.1));
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++)
      M.cyl(root, [-0.27 + k * 0.18, 0.78 + row * 0.33, -0.3], 0.04, 0.05, 0.22, M.mat(M.lightened(color, 0.15), 1.0), 6);
    M.box(root, [0, 0.38, -0.36], [0.6, 0.18, 0.04], M.mat([0.05, 0.05, 0.05]));
    M.box(root, [0.45, 1.2, -0.36], [0.12, 0.4, 0.03], trim);
    for (const x of [-0.45, 0.45]) M.box(root, [x, 0.05, 0.05], [0.12, 0.1, 0.7], trim);
    M.flatText(root, [0, 2.1, -0.385], pname.toUpperCase(), 40, [1, 1, 1], 0.0035, Math.PI, 8);
    return root;
  };

  M.lampPost = (parent, pos, h, lampCol) => {
    const pole = M.mat([0.18, 0.19, 0.2], 0, 0.6, 0.5);
    const [x, y, z] = pos;
    M.cyl(parent, [x, y + h * 0.5, z], 0.06, 0.09, h, pole, 6);
    M.box(parent, [x, y + h, z - 0.35], [0.06, 0.06, 0.8], pole);
    M.cyl(parent, [x, y + h - 0.1, z - 0.72], 0.08, 0.22, 0.16, pole, 6);
    M.box(parent, [x, y + h - 0.19, z - 0.72], [0.18, 0.03, 0.18], M.mat(lampCol, 5.0, 0, 0.5, true));
  };

  M.hangingLamp = (parent, pos, ceiling, lampCol) => {
    const dark = M.mat([0.12, 0.12, 0.12], 0, 0.5, 0.5);
    const len = ceiling - pos[1];
    M.box(parent, [pos[0], pos[1] + len * 0.5, pos[2]], [0.02, len, 0.02], dark);
    M.cyl(parent, pos, 0.07, 0.28, 0.18, M.mat([0.3, 0.35, 0.3], 0, 0.5, 0.5), 6);
    M.box(parent, [pos[0], pos[1] - 0.09, pos[2]], [0.16, 0.04, 0.16], M.mat(lampCol, 5.0, 0, 0.5, true));
  };

  M.clutter = (parent, pos, rng) => {
    const roll = rng.randf();
    const [x, y, z] = pos;
    if (roll < 0.35) {
      M.box(parent, [x, y + 0.005, z], [rng.range(0.5, 1.2), 0.01, rng.range(0.4, 1.0)], M.mat([0.25, 0.02, 0.02], 0, 0, 0.3), [0, rng.randf() * Math.PI * 2, 0]);
    } else if (roll < 0.65) {
      const rubble = M.mat([0.33, 0.31, 0.28]);
      for (let k = rng.randi(3, 6); k > 0; k--) {
        const s = rng.range(0.08, 0.25);
        M.box(parent, [x + rng.range(-0.5, 0.5), y + 0.06, z + rng.range(-0.5, 0.5)], [s, s, s], rubble, [rng.randf(), rng.randf(), rng.randf()]);
      }
    } else if (roll < 0.85) {
      const paper = M.mat([0.75, 0.72, 0.62]);
      for (let k = rng.randi(2, 4); k > 0; k--)
        M.box(parent, [x + rng.range(-0.6, 0.6), y + 0.004, z + rng.range(-0.6, 0.6)], [0.22, 0.005, 0.28], paper, [0, rng.randf() * Math.PI * 2, 0]);
    } else {
      const bone = M.mat([0.82, 0.78, 0.66]);
      M.box(parent, [x, y + 0.1, z], [0.18, 0.18, 0.2], bone, [0, rng.randf() * Math.PI * 2, 0.3]);
      M.box(parent, [x + 0.25, y + 0.03, z + 0.1], [0.35, 0.05, 0.05], bone, [0, rng.randf() * Math.PI * 2, 0]);
      M.box(parent, [x - 0.2, y + 0.03, z - 0.15], [0.28, 0.04, 0.04], bone, [0, rng.randf() * Math.PI * 2, 0]);
    }
  };

  M.spawnHole = (parent, pos, rng) => {
    const [x, y, z] = pos;
    M.cyl(parent, [x, y + 0.01, z], 0.75, 0.85, 0.03, M.mat([0.04, 0.03, 0.03]), 8);
    const dirt = M.mat([0.22, 0.17, 0.12]);
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI * 2 / 7 + rng.range(-0.2, 0.2);
      M.box(parent, [x + Math.cos(a) * 0.85, y + 0.08, z + Math.sin(a) * 0.85], [0.35, 0.16, 0.22], dirt, [0, -a, rng.range(-0.3, 0.3)]);
    }
    M.box(parent, [x + 0.2, y + 0.15, z + 0.6], [0.9, 0.05, 0.14], M.mat([0.38, 0.27, 0.15]), [0.2, 0.6, 0.3]);
  };
})();
