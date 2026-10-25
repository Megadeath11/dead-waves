// Procedurally synthesised sound effects (no audio assets needed), played through Web Audio.
'use strict';
(function () {
  const RATE = 22050;
  const TAU = Math.PI * 2;
  const S = DW.Sfx = {};
  let ctx = null, master = null, musicGain = null;
  const sounds = {};
  let voices = 0;
  const listener = { x: 0, y: 0, z: 0, yaw: 0 };

  function wav(dur, fn) {
    const n = Math.floor(dur * RATE);
    const buf = ctx.createBuffer(1, n, RATE);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = DW.clamp(fn(i / RATE), -1, 1) * 0.98;
    return buf;
  }
  // one-pole low-passed noise (state holder per sound)
  const lp = (st, k) => (st[0] += (Math.random() * 2 - 1 - st[0]) * k);
  const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const fposmod = (a, b) => ((a % b) + b) % b;

  function build() {
    const a = [0];
    sounds.shot_light = wav(0.22, t => lp(a, 0.55) * Math.exp(-t * 28) * 1.1 + Math.sin(TAU * 120 * t) * Math.exp(-t * 35) * 0.6);
    const b = [0];
    sounds.shot_heavy = wav(0.38, t => lp(b, 0.35) * Math.exp(-t * 15) * 1.3 + Math.sin(TAU * 70 * t) * Math.exp(-t * 18) * 0.8);
    const c = [0];
    sounds.shot_shotgun = wav(0.55, t => lp(c, 0.25) * Math.exp(-t * 8) * 1.4 + Math.sin(TAU * 55 * t) * Math.exp(-t * 11) * 0.9);
    const d = [0];
    sounds.shot_sniper = wav(0.8, t => lp(d, 0.3) * Math.exp(-t * 7) * 1.4 + Math.sin(TAU * 42 * t) * Math.exp(-t * 6));
    sounds.shot_ray = wav(0.32, t => sign(Math.sin(TAU * (1500 * t - 2000 * t * t))) * Math.exp(-t * 9) * 0.35 + Math.sin(TAU * (900 * t - 1000 * t * t)) * Math.exp(-t * 7) * 0.4);
    const e = [0];
    sounds.hit = wav(0.07, t => Math.sin(TAU * 1700 * t) * Math.exp(-t * 70) * 0.45 + lp(e, 0.8) * Math.exp(-t * 90) * 0.3);
    sounds.headshot = wav(0.14, t => Math.sin(TAU * 2600 * t) * Math.exp(-t * 30) * 0.45 + Math.sin(TAU * 3900 * t) * Math.exp(-t * 45) * 0.2);
    const f = [0];
    sounds.reload = wav(0.4, t => lp(f, 0.9) * (Math.exp(-t * 110) + (t > 0.25 ? Math.exp(-(t - 0.25) * 110) : 0)) * 0.7);
    sounds.empty = wav(0.05, t => (Math.random() * 2 - 1) * Math.exp(-t * 150) * 0.4);
    const g = [0];
    sounds.groan = wav(1.1, t => {
      const ph = 85 * t - 12 / (TAU * 3) * Math.cos(TAU * 3 * t);
      const saw = 2 * fposmod(ph, 1) - 1;
      const env = Math.pow(Math.sin(Math.PI * t / 1.1), 1.5);
      return (saw * 0.45 + lp(g, 0.12) * 0.5) * env * 0.55;
    });
    const h = [0];
    sounds.growl_boss = wav(1.7, t => {
      const ph = 48 * t - 8 / (TAU * 2) * Math.cos(TAU * 2 * t);
      const saw = 2 * fposmod(ph, 1) - 1;
      const env = Math.pow(Math.sin(Math.PI * t / 1.7), 1.2);
      return (saw * 0.6 + lp(h, 0.08) * 0.7) * env * 0.8;
    });
    const i2 = [0];
    sounds.explode = wav(1.3, t => lp(i2, 0.08) * Math.exp(-t * 3.2) * 2.2 + Math.sin(TAU * 38 * t) * Math.exp(-t * 4.5));
    const j = [0];
    sounds.slam = wav(1.0, t => lp(j, 0.05) * Math.exp(-t * 4) * 2.4 + Math.sin(TAU * 30 * t) * Math.exp(-t * 3.5) * 1.1);
    const k = [0];
    sounds.hurt = wav(0.25, t => Math.sin(TAU * (160 * t - 150 * t * t)) * Math.exp(-t * 12) * 0.6 + lp(k, 0.3) * Math.exp(-t * 20) * 0.4);
    sounds.buy = wav(0.4, t => {
      let v = Math.sin(TAU * 660 * t) * Math.exp(-t * 12);
      if (t > 0.12) v += Math.sin(TAU * 990 * t) * Math.exp(-(t - 0.12) * 10);
      return v * 0.35;
    });
    sounds.deny = wav(0.22, t => sign(Math.sin(TAU * 130 * t)) * 0.2 * (1 - t / 0.22));
    sounds.wave_start = wav(2.6, t => {
      const env = Math.min(t * 4, 1) * Math.exp(-t * 1.1);
      return (Math.sin(TAU * 110 * t) + Math.sin(TAU * 116.5 * t) * 0.8 + Math.sin(TAU * 55 * t) * 0.7 + Math.sin(TAU * 164.8 * t) * 0.3) * env * 0.28;
    });
    sounds.wave_end = wav(2.0, t => {
      const notes = [392.0, 466.2, 587.3, 784.0];
      let v = 0;
      for (let n = 0; n < 4; n++) { const t0 = n * 0.18; if (t > t0) v += Math.sin(TAU * notes[n] * t) * Math.exp(-(t - t0) * 3); }
      return v * 0.18;
    });
    sounds.pickup = wav(0.55, t => {
      const notes = [523.3, 659.3, 784.0, 1046.5];
      const n = Math.min(Math.floor(t / 0.1), 3);
      return Math.sin(TAU * notes[n] * t) * Math.exp(-(t % 0.1) * 8) * 0.35;
    });
    const l = [0];
    sounds.knife = wav(0.22, t => lp(l, 0.6) * Math.sin(Math.PI * t / 0.22) * 0.6);
    const m = [0];
    sounds.door = wav(1.0, t => lp(m, 0.15) * Math.sin(Math.PI * t) * 0.6 + Math.sin(TAU * 60 * t) * Math.exp(-t * 3) * 0.4);
    const n2 = [0];
    sounds.acid = wav(0.6, t => lp(n2, 0.5) * Math.exp(-t * 5) * (0.5 + 0.5 * Math.sin(TAU * 28 * t)) * 0.7);
    const dg = [0];
    sounds.dig = wav(0.7, t => lp(dg, 0.12) * (0.4 + 0.6 * Math.abs(Math.sin(TAU * 7 * t))) * Math.exp(-t * 3) * 0.9);
    const st = [0];
    sounds.step = wav(0.09, t => lp(st, 0.25) * Math.exp(-t * 45) * 0.8 + Math.sin(TAU * 70 * t) * Math.exp(-t * 50) * 0.4);
    sounds.box_spin = wav(2.7, t => {
      const notes = [783.99, 659.25, 523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 698.46, 587.33, 523.25, 659.25];
      const n = Math.min(Math.floor(t / 0.2), notes.length - 1);
      const lt = t - n * 0.2, fq = notes[n];
      return (Math.sin(TAU * fq * t) + Math.sin(TAU * fq * 2 * t) * 0.3) * Math.exp(-lt * 9) * 0.3;
    });
    sounds.throw = wav(0.2, t => (Math.random() * 2 - 1) * Math.sin(Math.PI * t / 0.2) * 0.25);
    const wd2 = [0];
    sounds.wind = wav(0.45, t => lp(wd2, 0.35) * Math.sin(Math.PI * t / 0.45) * 0.7 + Math.sin(TAU * (700 - 900 * t) * t) * Math.exp(-t * 8) * 0.15);
    const wb = [0];
    sounds.wind_blast = wav(0.9, t => lp(wb, 0.12 + 0.3 * Math.exp(-t * 6)) * Math.exp(-t * 4) * 1.4 + Math.sin(TAU * 55 * t) * Math.exp(-t * 7) * 0.5);
    sounds.melee_hit = wav(0.15, t => Math.sin(TAU * 90 * t) * Math.exp(-t * 25) * 0.8 + (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.4);
    // --- Goon Lord horror sounds
    // shriek: detuned screaming voices with a fast warble that climb then crack, plus raspy breath
    const sk = [0];
    sounds.shriek = wav(2.4, t => {
      const env = Math.min(t * 6, 1) * Math.pow(Math.max(0, 1 - t / 2.4), 1.3);
      const f = 620 + 900 * Math.min(t / 0.7, 1) - 260 * Math.max(0, t - 1.2);
      const vib = Math.sin(TAU * 13 * t) * 40 + Math.sin(TAU * 31 * t) * 18;
      let v = 0;
      for (const [m, a] of [[1, 0.5], [1.013, 0.4], [0.497, 0.35], [1.51, 0.22], [2.02, 0.12]]) {
        const ph = (f + vib) * m * t;
        v += (2 * fposmod(ph, 1) - 1) * a;
      }
      return (v * 0.32 + lp(sk, 0.55) * 0.55) * env;
    });
    // heartbeat: lub-dub
    sounds.heartbeat = wav(0.5, t => {
      const beat = (t0, f) => (t > t0 ? Math.sin(TAU * f * (t - t0)) * Math.exp(-(t - t0) * 28) : 0);
      return (beat(0, 52) * 1.0 + beat(0.17, 44) * 0.7) * 0.95;
    });
    // dread: a 5 s sub-bass swell with a slowly rising, beating drone and wind
    const dr = [0];
    sounds.dread = wav(5.0, t => {
      const env = Math.min(t / 3.5, 1) * Math.min((5 - t) * 3, 1);
      const f = 38 + t * 5;
      return (Math.sin(TAU * f * t) * 0.7 + Math.sin(TAU * (f * 1.02) * t) * 0.5 + Math.sin(TAU * f * 3.01 * t) * 0.12 + lp(dr, 0.03) * 2.2) * env * 0.75;
    });
    // whisper: breathy band of noise that rises and falls like a voice
    const wh = [0], wh2 = [0];
    sounds.whisper = wav(1.6, t => {
      const n = lp(wh, 0.6) - lp(wh2, 0.08);
      const syll = Math.max(0, Math.sin(TAU * 3.2 * t)) * Math.sin(Math.PI * t / 1.6);
      return n * syll * 0.9;
    });
  }

  S.init = () => {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { ctx = null; return; }
    master = ctx.createGain();
    master.connect(ctx.destination);
    S.setVolume(DW.settings.volume);
    build();
    // resume after autoplay blocks; rebuild the context if the audio device went away
    const resume = () => {
      if (ctx.state === 'closed') { S.reset(); return; }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    };
    if (!S.listening) {
      S.listening = true;
      window.addEventListener('pointerdown', resume, true);
      window.addEventListener('keydown', resume, true);
    }
    ctx.onerror = () => { if ((S.resets = (S.resets || 0) + 1) <= 3) setTimeout(S.reset, 1000); };
  };
  S.reset = () => {
    const wasMusic = !!musicSrc;
    try { if (ctx) ctx.close(); } catch (e) { /* already closed */ }
    ctx = null;
    musicSrc = null;
    ambience = null;
    voices = 0;
    S.init();
    if (wasMusic) S.startMusic();
  };
  S.setVolume = v => { if (master) master.gain.value = Math.max(0, +v); };
  const dbToGain = db => Math.pow(10, db / 20);

  function start(buf, gain, rate, pan) {
    if (!ctx || voices > 64) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else g.connect(master);
    voices++;
    src.onended = () => { voices--; };
    src.start();
  }

  S.play = (name, volDb = 0, pitch = 1) => {
    const b = sounds[name];
    if (b) start(b, dbToGain(volDb), pitch * DW.randf(0.96, 1.04));
  };
  S.setListener = (x, y, z, yaw) => { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; };
  // pos: {x,y,z} or [x,y,z]
  S.play3d = (name, pos, volDb = 0, pitch = 1, maxDist = 45) => {
    const b = sounds[name];
    if (!b) return;
    const px = pos.x !== undefined ? pos.x : pos[0], py = pos.y !== undefined ? pos.y : pos[1], pz = pos.z !== undefined ? pos.z : pos[2];
    const dx = px - listener.x, dy = py - listener.y, dz = pz - listener.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) return;
    let gain = dbToGain(volDb) * Math.min(1, 6 / Math.max(dist, 0.5));
    gain *= 1 - DW.clamp((dist - maxDist * 0.7) / (maxDist * 0.3), 0, 1);
    // listener right vector = (cos yaw, 0, -sin yaw)
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    const pan = dist > 0.1 ? DW.clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8 : 0;
    start(b, gain, pitch * DW.randf(0.93, 1.07), pan);
  };

  // Looping eerie drone for matches (built on first use).
  let ambience = null, musicSrc = null;
  S.startMusic = (volDb = -14) => {
    if (!ctx) return;
    if (!ambience) {
      const dur = 12.0, w = [0];
      ambience = wav(dur, t => {
        const lfo = 0.5 + 0.5 * Math.sin(TAU * t / dur);
        const lfo2 = 0.5 + 0.5 * Math.sin(TAU * 3 * t / dur + 1);
        const drone = Math.sin(TAU * 55 * t) * 0.5 + Math.sin(TAU * 82.5 * t) * 0.3 * lfo + Math.sin(TAU * 110.25 * t) * 0.12 * lfo2;
        const wind = lp(w, 0.02) * (0.6 + 0.4 * lfo2) * 3;
        return (drone * 0.35 + wind * 0.25) * 0.8;
      });
    }
    S.stopMusic();
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = ambience;
    musicSrc.loop = true;
    musicGain = ctx.createGain();
    musicGain.gain.value = dbToGain(volDb);
    musicSrc.connect(musicGain);
    musicGain.connect(master);
    musicSrc.start();
  };
  S.stopMusic = () => {
    if (musicSrc) { try { musicSrc.stop(); } catch (e) { /* already stopped */ } musicSrc = null; }
  };
})();
