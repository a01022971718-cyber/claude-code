/* 音频引擎：程序生成吉他 BGM（Karplus-Strong 拨弦）、每页面独立曲目、自定义上传、音效、节拍事件 */
(function () {
  const CF = window.CF;

  // ---------- 和弦与曲风 ----------
  const CH = {
    Am: [57, [0, 3, 7]], F: [53, [0, 4, 7]], C: [48, [0, 4, 7]], G: [55, [0, 4, 7]], Em: [52, [0, 3, 7]], D: [50, [0, 4, 7]],
    Dm: [50, [0, 3, 7]], E: [52, [0, 4, 7]], Bb: [58, [0, 4, 7]], B7: [47, [0, 4, 7, 10]],
    Fmaj7: [53, [0, 4, 7, 11]], Em7: [52, [0, 3, 7, 10]], Dm7: [50, [0, 3, 7, 10]], Cmaj7: [48, [0, 4, 7, 11]], Am7: [57, [0, 3, 7, 10]], G6: [55, [0, 4, 7, 9]],
  };
  const STYLES = {
    arp: { name: '原声分解和弦', bpm: 96, prog: ['Am', 'F', 'C', 'G'], swing: 0.06 },
    lofi: { name: 'Lo-fi 学习', bpm: 84, prog: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], swing: 0.16 },
    ambient: { name: '实验室氛围', bpm: 100, prog: ['Dm7', 'G6', 'Cmaj7', 'Am7'], swing: 0 },
    rock: { name: '电吉他摇滚', bpm: 128, prog: ['Em', 'C', 'G', 'D'], swing: 0 },
    metal: { name: '金属 Boss', bpm: 144, prog: ['Em', 'Em', 'C', 'B7'], swing: 0 },
    fanfare: { name: '胜利号角', bpm: 120, prog: ['C', 'G', 'Am', 'F'], swing: 0 },
    sad: { name: '低吟', bpm: 72, prog: ['Am', 'Dm', 'E', 'Am'], swing: 0 },
  };
  const DEFAULT_STYLE = { menu: 'arp', academy: 'lofi', lab: 'ambient', battle: 'rock', boss: 'metal', victory: 'fanfare', defeat: 'sad' };
  const SCREENS = { menu: '主菜单', academy: '学院 / 档案', lab: '实验室', battle: '战斗', boss: 'Boss 战', victory: '胜利', defeat: '失败' };
  const PENTA = [0, 3, 5, 7, 10];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- IndexedDB：保存玩家上传的音乐 ----------
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open('cf_music', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('tracks');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) { const db = await this.open(); return new Promise((res) => { const q = db.transaction('tracks').objectStore('tracks').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); },
    async put(key, val) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('tracks', 'readwrite'); t.objectStore('tracks').put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(key) { const db = await this.open(); return new Promise((res) => { const t = db.transaction('tracks', 'readwrite'); t.objectStore('tracks').delete(key); t.oncomplete = res; t.onerror = res; }); },
  };

  const A = (CF.Audio = {
    ctx: null, unlocked: false, screen: null, STYLES, SCREENS, DEFAULT_STYLE, DB,
    beats: [], fallbackNext: 0, fallbackStep: 0,
    customMeta: {}, // screen -> {name}
  });

  // ---------- 初始化 ----------
  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());
    A.master = ctx.createGain();
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -14; A.comp.ratio.value = 4;
    A.master.connect(A.comp); A.comp.connect(ctx.destination);
    A.music = ctx.createGain(); A.music.connect(A.master);
    A.sfxBus = ctx.createGain(); A.sfxBus.connect(A.master);
    // 失真吉他总线（音乐一条、音效一条）
    const k = 28, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    const mkDist = () => {
      const ws = ctx.createWaveShaper(); ws.curve = curve;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = 0.32;
      ws.connect(lp); lp.connect(g);
      return { input: ws, out: g };
    };
    const dm = mkDist(), ds = mkDist();
    A.dist = dm.input; A.distGain = dm.out;
    A.distS = ds.input; ds.out.connect(A.sfxBus);
    // 简易混响（延迟反馈）
    A.verb = ctx.createDelay(); A.verb.delayTime.value = 0.23;
    A.verbFb = ctx.createGain(); A.verbFb.gain.value = 0.28;
    A.verbOut = ctx.createGain(); A.verbOut.gain.value = 0.22;
    A.verb.connect(A.verbFb); A.verbFb.connect(A.verb); A.verb.connect(A.verbOut);
    // 噪声
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    A.noise = nb;
    A.strings = {};
    A.applyVolumes();
    A.unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    const want = A.screen; A.screen = null;
    if (want) A.play(want);
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    const s = CF.Save.data.settings;
    A.master.gain.value = s.master;
    A.music.gain.value = s.music;
    A.sfxBus.gain.value = s.sfx;
    if (A.htmlAudio) A.htmlAudio.volume = s.master * s.music;
  };

  // ---------- Karplus-Strong 拨弦 ----------
  function stringBuf(midi, kind) {
    const key = midi + kind;
    if (A.strings[key]) return A.strings[key];
    const ctx = A.ctx, sr = ctx.sampleRate, f = mtof(midi);
    const dur = kind === 'm' ? 0.28 : kind === 'b' ? 1.0 : 1.7;
    const damp = kind === 'm' ? 0.965 : 0.9965;
    const bright = kind === 'b' ? 0.75 : kind === 'm' ? 0.45 : 0.6;
    const N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp += bright * ((Math.random() * 2 - 1) - lp); ring[i] = lp; mean += lp; }
    mean /= N;
    for (let i = 0; i < N; i++) ring[i] -= mean;
    let idx = 0, peak = 0.001;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % N];
      ring[idx] = damp * 0.5 * (a + b);
      out[i] = a; if (Math.abs(a) > peak) peak = Math.abs(a);
      idx = (idx + 1) % N;
    }
    const fade = Math.floor(sr * 0.02);
    for (let i = 0; i < len; i++) { out[i] /= peak; if (i > len - fade) out[i] *= (len - i) / fade; }
    return (A.strings[key] = buf);
  }
  function pluck(midi, t, vel, opts = {}) {
    const ctx = A.ctx, src = ctx.createBufferSource();
    src.buffer = stringBuf(midi, opts.kind || 'c');
    const g = ctx.createGain();
    g.gain.value = vel * 0.32;
    src.connect(g);
    const dest = opts.bus || A.music;
    if (opts.dist) { g.connect(dest === A.sfxBus ? A.distS : A.dist); } else { g.connect(dest); if (opts.verb !== false) g.connect(A.verb); }
    src.start(t);
    if (opts.len) { g.gain.setValueAtTime(vel * 0.32, t + opts.len); g.gain.linearRampToValueAtTime(0, t + opts.len + 0.06); src.stop(t + opts.len + 0.08); }
  }
  function strum(midis, t, vel, opts = {}) {
    const gap = opts.gap ?? 0.014;
    const order = opts.up ? midis.slice().reverse() : midis;
    order.forEach((m, i) => pluck(m, t + i * gap, vel * (opts.up ? 0.8 : 1), opts));
  }
  function osc(type, f0, f1, t, dur, vol, dest, opts = {}) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.atk || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, dest, type, freq, q) {
    const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const kick = (t, v, d) => osc('sine', 150, 42, t, 0.22, 0.9 * v, d || A.music);
  const snare = (t, v, d) => { noise(t, 0.16, 0.5 * v, d || A.music, 'bandpass', 1900, 0.8); osc('triangle', 190, 150, t, 0.08, 0.3 * v, d || A.music); };
  const hat = (t, v, d) => noise(t, 0.045, 0.28 * v, d || A.music, 'highpass', 7500);
  const crash = (t, v, d) => noise(t, 1.1, 0.25 * v, d || A.music, 'highpass', 5000);
  function bass(m, t, dur, v, dest) { osc('triangle', mtof(m), 0, t, dur, 0.5 * v, dest || A.music, { lp: 600, atk: 0.01 }); osc('sawtooth', mtof(m), 0, t, dur * 0.6, 0.08 * v, dest || A.music, { lp: 500 }); }
  function pad(ch, t, dur, v, dest) {
    const [r, iv] = CH[ch];
    iv.forEach((x) => { [-6, 6].forEach((det) => {
      const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mtof(r + x); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022 * v, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(dest || A.music); o.start(t); o.stop(t + dur + 0.05);
    }); });
  }
  function voicing(ch) {
    const [r, iv] = CH[ch];
    const v = [r, r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2], iv[3] !== undefined ? r + 12 + iv[3] : r + 24];
    return v.map((m) => (m < 40 ? m + 12 : m));
  }

  // ---------- 程序音乐播放器 ----------
  const P = { on: false, style: null, step: 0, next: 0, timer: null, gain: null, seed: 1 };
  function beat(t, s, strum) { A.beats.push({ t, s, strum: !!strum }); }
  function scheduleStep(st, step, t, spb, out) {
    const s = step % 16, bar = Math.floor(step / 16), ch = st.prog[bar % st.prog.length], [root] = CH[ch], v = voicing(ch);
    const rnd = CF.rng(P.seed + bar * 977 + s * 31);
    const sw = s % 2 === 1 ? st.swing * spb : 0; t += sw;
    const key = CH[st.prog[0]][0];
    switch (st.id) {
      case 'arp': {
        if (s % 2 === 0) { const pat = [0, 2, 3, 4, 5, 4, 3, 2]; pluck(v[pat[s / 2]], t, s === 0 ? 0.75 : 0.5, { bus: out }); }
        if (s === 0 || s === 8) kick(t, 0.45, out);
        if (s === 4 || s === 12) snare(t, 0.22, out);
        if (s % 4 === 2) hat(t, 0.4, out);
        if (s === 0) bass(root - 12, t, spb * 7, 0.7, out);
        if (s === 10) bass(root - 12 + 7, t, spb * 5, 0.5, out);
        if (bar % 4 === 3 && s % 2 === 0 && rnd() < 0.6) pluck(key + 24 + PENTA[Math.floor(rnd() * 5)], t, 0.35, { bus: out });
        if (s % 4 === 0) beat(t, s === 0 ? 1 : 0.55, true);
        break;
      }
      case 'lofi': {
        if (s === 0) { strum(v.slice(0, 5), t, 0.45, { bus: out, gap: 0.03 }); pad(ch, t, spb * 16, 1, out); }
        if (s === 6 || s === 10 || s === 14) pluck(v[2 + Math.floor(rnd() * 4)], t, 0.38, { bus: out });
        if (s === 0 || s === 7) kick(t, 0.55, out);
        if (s === 4 || s === 12) snare(t, 0.3, out);
        if (s % 2 === 0) hat(t, 0.25, out);
        if (s === 0) bass(root - 12, t, spb * 6, 0.7, out);
        if (s === 8) bass(root - 12, t, spb * 6, 0.5, out);
        if (s % 4 === 0) beat(t, s === 0 ? 0.9 : 0.45, s === 0 || s === 8);
        break;
      }
      case 'ambient': {
        if (s === 0) pad(ch, t, spb * 16, 1.3, out);
        if (s % 2 === 0 && rnd() < 0.32) pluck(v[Math.floor(rnd() * 6)] + 12, t, 0.33, { bus: out });
        if (s === 0) bass(root - 12, t, spb * 12, 0.5, out);
        if (s % 4 === 2) hat(t, 0.18, out);
        if (s === 0) kick(t, 0.3, out);
        if (s % 4 === 0) beat(t, s === 0 ? 0.75 : 0.35, s === 0);
        break;
      }
      case 'rock': {
        const pc = [root - 12, root - 5, root];
        if (s % 2 === 0) strum(pc, t, s % 8 === 0 ? 0.9 : 0.7, { bus: out, dist: true, kind: s % 8 === 0 ? 'c' : 'm', gap: 0.006, len: s % 8 === 0 ? spb * 3.6 : 0 });
        if (s === 0 || s === 3 || s === 8 || s === 11) kick(t, 0.9, out);
        if (s === 4 || s === 12) snare(t, 1, out);
        if (s % 2 === 0) hat(t, 0.5, out);
        if (s === 0 && bar % 4 === 0) crash(t, 0.7, out);
        if (s % 2 === 0) bass(root - 24, t, spb * 1.6, 0.8, out);
        if (bar % 2 === 1 && s % 2 === 0 && rnd() < 0.75) pluck(key + 12 + PENTA[Math.floor(rnd() * 5)] + (rnd() < 0.3 ? 12 : 0), t, 0.5, { bus: out, dist: true, kind: 'b', len: spb * 1.8 });
        if (s % 4 === 0) beat(t, s === 4 || s === 12 ? 1 : 0.7, true);
        break;
      }
      case 'metal': {
        const pc = [root - 12, root - 5];
        if (s === 4 || s === 12) strum([root - 12, root - 5, root, root + 1], t, 0.9, { bus: out, dist: true, gap: 0.004, len: spb * 1.8 });
        else strum(pc, t, 0.72, { bus: out, dist: true, kind: 'm', gap: 0.003 });
        if (s % 2 === 0) kick(t, 0.75, out);
        if (s === 4 || s === 12) snare(t, 1.1, out);
        if (s === 0 && bar % 2 === 0) crash(t, 0.8, out);
        hat(t, 0.25, out);
        if (s % 2 === 0) bass(root - 24, t, spb * 1.4, 0.85, out);
        if (s % 4 === 0) beat(t, s === 4 || s === 12 ? 1 : 0.8, true);
        break;
      }
      case 'fanfare': {
        if (s % 4 === 0) strum(v, t, s === 0 ? 0.85 : 0.6, { bus: out, gap: 0.012 });
        if (s % 2 === 0) { const up = [0, 1, 2, 3, 4, 5, 4, 3]; pluck(v[up[s / 2]] + 12, t, 0.42, { bus: out }); }
        if (s % 4 === 0) kick(t, 0.7, out);
        if (s === 12 || s === 14 || s === 15) snare(t, 0.6, out);
        if (s % 2 === 0) hat(t, 0.35, out);
        if (s === 0) bass(root - 12, t, spb * 7, 0.7, out);
        if (s === 0 && bar % 4 === 0) crash(t, 0.5, out);
        if (s % 4 === 0) beat(t, s === 0 ? 1 : 0.6, true);
        break;
      }
      case 'sad': {
        if (s % 4 === 0) { const pat = [0, 2, 3, 2]; pluck(v[pat[s / 4]], t, 0.5, { bus: out }); }
        if (s === 0) { pad(ch, t, spb * 16, 1, out); bass(root - 12, t, spb * 14, 0.5, out); }
        if (s % 4 === 0) beat(t, s === 0 ? 0.6 : 0.3, s === 0);
        break;
      }
    }
  }
  function startProc(styleId, bpmOverride) {
    stopProc(0.5);
    const base = STYLES[styleId] || STYLES.arp;
    const st = Object.assign({ id: styleId }, base, { bpm: bpmOverride || base.bpm });
    const ctx = A.ctx;
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, ctx.currentTime); out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
    out.connect(A.music);
    A.distGain.disconnect(); A.distGain.connect(out);
    A.verbOut.disconnect(); A.verbOut.connect(out);
    P.on = true; P.style = st; P.step = 0; P.next = ctx.currentTime + 0.08; P.gain = out; P.seed = CF.randi(1, 99999);
    A.curBpm = st.bpm;
    const spb = 60 / st.bpm / 4;
    P.timer = setInterval(() => {
      if (!P.on) return;
      while (P.next < ctx.currentTime + 0.15) { scheduleStep(st, P.step, P.next, spb, out); P.step++; P.next += spb; }
    }, 25);
  }
  function stopProc(fade) {
    if (P.timer) clearInterval(P.timer);
    P.timer = null; P.on = false;
    if (P.gain && A.ctx) { const g = P.gain; const t = A.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.3)); setTimeout(() => g.disconnect(), (fade || 0.3) * 1000 + 600); }
    P.gain = null;
  }

  // ---------- 自定义音乐 ----------
  const C = { src: null, gain: null, analyser: null, data: null, avg: 0, lastOnset: 0 };
  const bufCache = {};
  function stopCustom(fade) {
    if (C.src && A.ctx) { const g = C.gain, s = C.src, t = A.ctx.currentTime; g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); setTimeout(() => { try { s.stop(); } catch (e) {} g.disconnect(); }, fade * 1000 + 100); }
    C.src = null; C.analyser = null;
    if (A.htmlAudio) { const h = A.htmlAudio; A.htmlAudio = null; const v0 = h.volume; let k = 0; const iv = setInterval(() => { k++; h.volume = Math.max(0, v0 * (1 - k / 8)); if (k >= 8) { clearInterval(iv); h.pause(); } }, 50); }
  }
  async function playBuffer(buf, bpm) {
    const ctx = A.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), an = ctx.createAnalyser();
    s.buffer = buf; s.loop = true; an.fftSize = 512;
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    s.connect(g); g.connect(an); an.connect(A.music);
    s.start();
    C.src = s; C.gain = g; C.analyser = an; C.data = new Uint8Array(an.frequencyBinCount); C.avg = 0;
    A.curBpm = bpm || 100;
  }
  A.customSource = async function (screen) {
    try { const rec = await DB.get(screen); if (rec && rec.blob) return { kind: 'blob', blob: rec.blob, name: rec.name }; } catch (e) {}
    const cfg = (CF_CONFIG.bgm || {})[screen];
    if (cfg && cfg.file) return { kind: 'url', url: cfg.file, name: cfg.file, bpm: cfg.bpm };
    return null;
  };

  // ---------- 对外：切换页面音乐 ----------
  let playToken = 0;
  A.play = async function (screen) {
    if (A.screen === screen && A.ctx) return;
    A.screen = screen;
    if (!A.ctx) return; // 等待解锁
    const token = ++playToken;
    const s = CF.Save.data.settings;
    const bpmUser = (s.bgmBpm || {})[screen];
    const cfg = (CF_CONFIG.bgm || {})[screen] || {};
    const src = await A.customSource(screen);
    if (token !== playToken) return;
    stopProc(0.6); stopCustom(0.6);
    A.beats.length = 0;
    if (src) {
      try {
        const cacheKey = screen + ':' + (src.name || '');
        let buf = bufCache[cacheKey];
        if (!buf) {
          const ab = src.kind === 'blob' ? await src.blob.arrayBuffer() : await (await fetch(src.url)).arrayBuffer();
          buf = await new Promise((res, rej) => A.ctx.decodeAudioData(ab, res, rej));
          bufCache[cacheKey] = buf;
        }
        if (token !== playToken) return;
        await playBuffer(buf, bpmUser || src.bpm || cfg.bpm || 100);
        return;
      } catch (e) {
        if (src.kind === 'url') { // file:// 下 fetch 不可用，退回 <audio>
          const h = new Audio(src.url); h.loop = true; h.volume = s.master * s.music;
          h.play().then(() => { if (token === playToken) { A.htmlAudio = h; A.curBpm = bpmUser || src.bpm || 100; } else h.pause(); }).catch(() => startProc((s.bgmStyle || {})[screen] || DEFAULT_STYLE[screen]));
          return;
        }
        console.warn('自定义音乐播放失败，改用程序吉他', e);
      }
    }
    startProc((s.bgmStyle || {})[screen] || DEFAULT_STYLE[screen] || 'arp', bpmUser);
  };
  A.restart = function () { const s = A.screen; A.screen = null; A.play(s); };
  A.stopAll = function () { stopProc(0.3); stopCustom(0.3); };

  // ---------- 节拍事件（供像素动效使用） ----------
  A.pullBeats = function () {
    const out = [];
    const now = A.ctx ? A.ctx.currentTime : 0;
    if (A.ctx && A.ctx.state === 'running' && (P.on || C.analyser)) {
      while (A.beats.length && A.beats[0].t <= now) out.push(A.beats.shift());
      if (A.beats.length > 64) A.beats.splice(0, A.beats.length - 64);
      if (C.analyser) {
        C.analyser.getByteFrequencyData(C.data);
        let e = 0; for (let i = 1; i < 12; i++) e += C.data[i];
        e /= 11 * 255;
        C.avg = C.avg * 0.94 + e * 0.06;
        if (e > C.avg * 1.25 && e > 0.25 && now - C.lastOnset > 0.2) { C.lastOnset = now; out.push({ t: now, s: CF.clamp((e / Math.max(C.avg, 0.01) - 1) * 2, 0.35, 1), strum: true }); }
      }
      return out;
    }
    // 没有声音时，用内部时钟保持动画律动
    const tnow = performance.now() / 1000, bpm = A.curBpm || 100, q = 60 / bpm;
    if (!A.fallbackNext || tnow - A.fallbackNext > 2) A.fallbackNext = tnow;
    while (A.fallbackNext <= tnow) { out.push({ t: A.fallbackNext, s: A.fallbackStep % 4 === 0 ? 1 : 0.5, strum: true }); A.fallbackStep++; A.fallbackNext += q; }
    return out;
  };

  // ---------- 音效 ----------
  const lastSfx = {};
  A.sfx = function (name, vol = 1) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const ctx = A.ctx, t = ctx.currentTime + 0.005, d = A.sfxBus;
    const now = performance.now();
    const gap = { shoot: 45, hit: 40, boom: 70, laser: 60, hover: 40 }[name] || 0;
    if (gap && now - (lastSfx[name] || 0) < gap) return;
    lastSfx[name] = now;
    switch (name) {
      case 'click': osc('sine', 900, 650, t, 0.06, 0.25 * vol, d); break;
      case 'hover': osc('sine', 1300, 1200, t, 0.025, 0.06 * vol, d); break;
      case 'place': osc('square', 330, 660, t, 0.1, 0.12 * vol, d, { lp: 2000 }); osc('square', 660, 990, t + 0.08, 0.1, 0.1 * vol, d, { lp: 2000 }); break;
      case 'train': osc('triangle', 520, 1040, t, 0.15, 0.2 * vol, d); break;
      case 'shoot': osc('square', 1000, 260, t, 0.06, 0.05 * vol, d, { lp: 2500 }); break;
      case 'laser': osc('sawtooth', 1600, 300, t, 0.12, 0.06 * vol, d, { lp: 3000 }); break;
      case 'hit': noise(t, 0.05, 0.12 * vol, d, 'highpass', 3000); break;
      case 'boom': noise(t, 0.45, 0.45 * vol, d, 'lowpass', 700); osc('sine', 110, 35, t, 0.4, 0.5 * vol, d); break;
      case 'alert': osc('square', 880, 880, t, 0.09, 0.12 * vol, d, { lp: 2400 }); osc('square', 660, 660, t + 0.14, 0.12, 0.12 * vol, d, { lp: 2400 }); break;
      case 'wave': strum([40, 47, 52], t, 0.9 * vol, { bus: d, dist: true, gap: 0.004 }); kick(t, 0.8, d); break;
      case 'riff': { const ns = [40, 47, 52, 55, 59, 64]; strum(ns, t, 1.1 * vol, { bus: d, dist: true, gap: 0.01 }); strum(ns, t + 0.18, 0.9 * vol, { bus: d, dist: true, gap: 0.01, up: true }); crash(t, 0.8, d); kick(t, 1, d); break; }
      case 'chord': strum([52, 59, 64, 67, 71], t, 0.7 * vol, { bus: d, gap: 0.02 }); break;
      case 'correct': [72, 76, 79].forEach((m, i) => pluck(m, t + i * 0.07, 0.7 * vol, { bus: d, verb: false })); break;
      case 'wrong': osc('sawtooth', 150, 110, t, 0.28, 0.14 * vol, d, { lp: 700 }); break;
      case 'levelup': [60, 64, 67, 72, 76].forEach((m, i) => pluck(m, t + i * 0.08, 0.7 * vol, { bus: d, verb: false })); break;
      case 'unlock': [84, 88, 91].forEach((m, i) => osc('triangle', mtof(m), 0, t + i * 0.06, 0.3, 0.12 * vol, d)); break;
      case 'win': strum([48, 55, 60, 64, 67, 72], t, 0.9 * vol, { bus: d, gap: 0.03 }); break;
      case 'lose': strum([45, 52, 57, 60, 64], t, 0.7 * vol, { bus: d, gap: 0.05 }); break;
      case 'error': osc('square', 200, 160, t, 0.12, 0.08 * vol, d, { lp: 900 }); break;
      case 'heal': osc('sine', 600, 1200, t, 0.25, 0.12 * vol, d); break;
    }
  };
})();
