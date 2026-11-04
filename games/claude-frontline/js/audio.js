/* 音频引擎：程序生成吉他 BGM（Karplus-Strong 拨弦）、每页面独立曲目、自定义上传、音效、节拍事件 */
(function () {
  const CF = window.CF;

  // ---------- 和弦与曲风 ----------
  const CH = {
    Am: [57, [0, 3, 7]], F: [53, [0, 4, 7]], C: [48, [0, 4, 7]], G: [55, [0, 4, 7]], Em: [52, [0, 3, 7]], D: [50, [0, 4, 7]],
    Dm: [50, [0, 3, 7]], E: [52, [0, 4, 7]], Bb: [58, [0, 4, 7]], B7: [47, [0, 4, 7, 10]],
    Fmaj7: [53, [0, 4, 7, 11]], Em7: [52, [0, 3, 7, 10]], Dm7: [50, [0, 3, 7, 10]], Cmaj7: [48, [0, 4, 7, 11]], Am7: [57, [0, 3, 7, 10]], G6: [55, [0, 4, 7, 9]],
    Dmaj7: [50, [0, 4, 7, 11]], Bm: [47, [0, 3, 7]], A: [57, [0, 4, 7]], Gsus: [55, [0, 5, 7]], Csus: [48, [0, 2, 7]],
  };
  const STYLES = {
    arp: { name: '原声分解和弦', bpm: 96, prog: ['Am', 'F', 'C', 'G'], swing: 0.06 },
    lofi: { name: 'Lo-fi 学习', bpm: 84, prog: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], swing: 0.16 },
    ambient: { name: '实验室氛围', bpm: 100, prog: ['Dm7', 'G6', 'Cmaj7', 'Am7'], swing: 0 },
    rock: { name: '电吉他摇滚', bpm: 128, prog: ['Em', 'C', 'G', 'D'], swing: 0 },
    metal: { name: '金属 Boss', bpm: 144, prog: ['Em', 'Em', 'C', 'B7'], swing: 0 },
    fanfare: { name: '胜利号角', bpm: 120, prog: ['C', 'G', 'Am', 'F'], swing: 0 },
    sad: { name: '低吟', bpm: 72, prog: ['Am', 'Dm', 'E', 'Am'], swing: 0 },
    // 英雄主题曲：hero 字段决定主奏乐器与动机
    // X-S 主题：D 利底亚（升四级 = 对未知的好奇），后四小节整体升全音（向上），级进上行后跃上八度（新生）
    xs: { name: 'X-S · 电吉他「破晓·向上」', bpm: 120, prog: ['D', 'E', 'Bm', 'A'], swing: 0, hero: 'xs', gain: 0.8, gainLo: 1.3, root: 62, lift: 2, scale: [0, 2, 4, 6, 7, 9, 11], motif: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 4], [7, 6], [6, 2], [7, 4], [null, 8]] },
    star: { name: '星芒 · 尤克里里「一步一步」', bpm: 104, prog: ['F', 'C', 'Dm', 'Bb'], swing: 0.08, hero: 'star', gain: 2, root: 65, scale: [0, 2, 4, 5, 7, 9, 11], motif: [[0, 2], [1, 2], [2, 4], [1, 2], [2, 2], [3, 4], [2, 2], [3, 2], [4, 6], [null, 6]] },
    omni: { name: '万象 · 钢琴「八十八层」', bpm: 100, prog: ['C', 'G', 'Am', 'F'], swing: 0, hero: 'omni', gain: 1.5, root: 72, scale: [0, 2, 4, 5, 7, 9, 11], motif: [[4, 2], [2, 2], [0, 2], [2, 2], [4, 2], [7, 4], [6, 2], [7, 8], [null, 8]] },
    twin: { name: '双子 · 竖琴「星河两岸」', bpm: 88, prog: ['Dmaj7', 'E', 'Bm', 'A'], swing: 0, hero: 'twin', gain: 2.4, root: 74, scale: [0, 2, 4, 6, 7, 9, 11], motif: [[0, 2], [4, 2], [6, 4], [null, 2], [7, 2], [6, 2], [4, 2], [5, 6], [null, 10]] },
    riot: { name: '狂想 · 架子鼓「没有规则」', bpm: 150, prog: ['Em', 'Em', 'G', 'A'], swing: 0, hero: 'riot', root: 52, scale: [0, 3, 5, 6, 7, 10], motif: [[0, 1], [0, 1], [3, 2], [0, 2], [5, 2], [4, 2], [3, 2], [1, 4], [null, 16]] },
    llama: { name: '羊驼 · 排箫「云上牧场」', bpm: 112, prog: ['Am', 'G', 'F', 'E'], swing: 0.05, hero: 'llama', gain: 0.5, root: 69, scale: [0, 3, 5, 7, 10], motif: [[4, 2], [2, 2], [1, 2], [0, 2], [1, 2], [2, 2], [4, 4], [3, 4], [null, 12]] },
    abyss: { name: '鲸歌 · 古琴「万米之下」', bpm: 66, prog: ['C', 'Am', 'F', 'G'], swing: 0, hero: 'abyss', gain: 1.7, root: 60, scale: [0, 2, 4, 7, 9], motif: [[0, 4], [null, 2], [4, 2], [3, 4], [2, 2], [1, 2], [0, 8], [null, 8]] },
    luna: { name: '月弦 · 二胡「暗面长夜」', bpm: 72, prog: ['Am', 'Em', 'F', 'G'], swing: 0, hero: 'luna', gain: 1.2, root: 69, scale: [0, 3, 5, 7, 10], motif: [[4, 6], [3, 2], [2, 4], [3, 2], [4, 2], [5, 8], [4, 4], [null, 4]] },
    pearl: { name: '珠问 · 琵琶「玉盘落珠」', bpm: 126, prog: ['Dm', 'F', 'C', 'Dm'], swing: 0, hero: 'pearl', gain: 1.7, root: 62, scale: [0, 2, 5, 7, 10], motif: [[0, 1], [0, 1], [0, 1], [0, 1], [1, 2], [0, 2], [3, 2], [2, 2], [1, 4], [2, 2], [3, 2], [4, 4], [null, 8]] },
    bun: { name: '团团 · 唢呐「天天过节」', bpm: 132, prog: ['C', 'F', 'G', 'C'], swing: 0, hero: 'bun', root: 72, scale: [0, 2, 4, 7, 9], motif: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [3, 2], [2, 2], [1, 2], [2, 4], [0, 4], [null, 8]] },
  };
  const DEFAULT_STYLE = { menu: 'hero', academy: 'lofi', lab: 'ambient', battle: 'hero', boss: 'metal', victory: 'fanfare', defeat: 'sad', quick: 'hero', city: 'hero' };
  const SCREENS = { menu: '大厅', academy: '学院 / 档案', lab: '实验室', battle: '战斗', boss: 'Boss 战', victory: '胜利', defeat: '失败', quick: '快速模式', city: '主城' };
  const INTENSITY = { battle: 1, boss: 1, quick: 1, victory: 0.8 };
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
    ctx: null, unlocked: false, screen: null, STYLES, SCREENS, DEFAULT_STYLE, INTENSITY, DB,
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
    const K = { u: [0.9, 0.991, 0.92], m: [0.28, 0.965, 0.45], b: [1.0, 0.9965, 0.75], h: [2.2, 0.998, 0.88], q: [2.6, 0.9975, 0.38], p: [0.7, 0.988, 0.95], c: [1.7, 0.9965, 0.6] }[kind] || [1.7, 0.9965, 0.6];
    const dur = K[0], damp = K[1], bright = K[2];
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
    if (opts.slide) { src.playbackRate.setValueAtTime(Math.pow(2, -opts.slide / 12), t); src.playbackRate.linearRampToValueAtTime(1, t + 0.18); }
    if (opts.bend) { src.playbackRate.setValueAtTime(1, t + 0.35); src.playbackRate.linearRampToValueAtTime(Math.pow(2, opts.bend / 12), t + 0.9); }
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
  function pad(ch, t, dur, v, dest, tr = 0) {
    const [r, iv] = CH[ch];
    iv.forEach((x) => { [-6, 6].forEach((det) => {
      const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mtof(r + x + tr); o.detune.value = det;
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

  // ---------- 更多乐器 ----------
  function piano(m, t, v, dest, dur = 1.4) {
    const f = mtof(m);
    [0.5, 0.24, 0.12, 0.06].forEach((am, i) => { const h = i + 1; osc('sine', f * h * (1 + 0.0005 * h * h), 0, t, dur * (1 - i * 0.2), v * am * 0.55, dest, { atk: 0.003 }); });
    noise(t, 0.02, v * 0.04, dest, 'bandpass', 3000, 1);
  }
  // 弓弦 / 簧管 / 气鸣：振荡器 + 共振峰 + 颤音 + 滑音
  function voice(m, t, dur, v, dest, o = {}) {
    const ctx = A.ctx, f = mtof(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = o.lp || 4200;
    const oscs = (o.types || ['sawtooth']).map((tp) => { const x = ctx.createOscillator(); x.type = tp; return x; });
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = o.vib || 5.5; lg.gain.value = f * (o.vibDepth || 0.006);
    lfo.connect(lg);
    oscs.forEach((x, i) => {
      const fi = f * (i === 1 && o.oct2 ? 2 : 1);
      if (o.from) { x.frequency.setValueAtTime(mtof(o.from) * (fi / f), t); x.frequency.exponentialRampToValueAtTime(fi, t + (o.glide || 0.12)); }
      else if (o.scoop) { x.frequency.setValueAtTime(fi * Math.pow(2, -o.scoop / 12), t); x.frequency.exponentialRampToValueAtTime(fi, t + 0.07); }
      else x.frequency.setValueAtTime(fi, t);
      lg.connect(x.frequency);
      const xg = ctx.createGain(); xg.gain.value = (o.mix || [1, 0.4])[i] || 0.3; x.connect(xg);
      (o.formants || [[o.formant || 1100, o.q || 2]]).forEach(([ff, q]) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; xg.connect(bp); bp.connect(lp); });
      if (o.body) xg.connect(lp);
      x.start(t); x.stop(t + dur + 0.15);
    });
    if (o.breath) { const nb = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); nb.buffer = A.noise; bf.type = 'bandpass'; bf.frequency.value = f * 2; bf.Q.value = 3; bg.gain.value = v * o.breath; nb.connect(bf); bf.connect(bg); bg.connect(g); nb.start(t, Math.random() * 0.5); nb.stop(t + dur + 0.1); }
    const atk = o.atk || 0.08, rel = o.rel || 0.12;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v * 0.92, t + Math.max(atk, dur - rel)); g.gain.linearRampToValueAtTime(0.0001, t + dur + rel);
    lp.connect(g); g.connect(dest); if (o.verb !== false) g.connect(A.verb);
    lfo.start(t); lfo.stop(t + dur + 0.15);
  }
  const erhu = (m, t, dur, v, d, from) => voice(m, t, dur, v * 0.55, d, { types: ['sawtooth'], formants: [[1000, 2.2], [2600, 3]], vib: 5.6, vibDepth: 0.009, from, glide: 0.14, atk: 0.09, lp: 3800, body: false });
  const suona = (m, t, dur, v, d) => voice(m, t, dur, v * 0.42, d, { types: ['sawtooth', 'square'], mix: [1, 0.5], formants: [[1250, 3], [2700, 4]], vib: 6.2, vibDepth: 0.008, scoop: 1, atk: 0.03, lp: 5200 });
  const panflute = (m, t, dur, v, d) => voice(m, t, dur, v * 0.5, d, { types: ['sine', 'triangle'], mix: [1, 0.18], oct2: true, formants: [[mtof(m), 1]], body: true, vib: 4.5, vibDepth: 0.004, breath: 0.35, atk: 0.06, rel: 0.18 });
  const harp = (m, t, v, d) => pluck(m, t, v, { bus: d, kind: 'h' });
  const guqin = (m, t, v, d, slide) => { pluck(m, t, v * 1.1, { bus: d, kind: 'q', slide: slide || 0, bend: Math.random() < 0.3 ? -1 : 0 }); if (Math.random() < 0.25) osc('sine', mtof(m + 24), 0, t + 0.02, 1.4, v * 0.08, d); };
  const pipa = (m, t, v, d, trem) => { const n = trem || 1; for (let i = 0; i < n; i++) pluck(m, t + i * 0.045, v * (i ? 0.7 : 1), { bus: d, kind: 'p', verb: false }); };
  const tom = (t, f, v, d) => osc('sine', f, f * 0.6, t, 0.28, 0.7 * v, d);
  const tanggu = (t, v, d) => { osc('sine', 120, 62, t, 0.4, 0.85 * v, d); noise(t, 0.08, 0.2 * v, d, 'lowpass', 500); };
  const bo = (t, v, d) => { noise(t, 0.7, 0.32 * v, d, 'highpass', 3200); noise(t, 0.3, 0.2 * v, d, 'bandpass', 6500, 2); };
  const wood = (t, v, d) => { osc('sine', 1600, 1450, t, 0.06, 0.25 * v, d); noise(t, 0.02, 0.1 * v, d, 'bandpass', 2600, 4); };
  const shaker = (t, v, d) => noise(t, 0.05, 0.1 * v, d, 'highpass', 7000);
  function gong(t, v, d) {
    const ctx = A.ctx, c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = 170; mo.frequency.value = 271; mg.gain.setValueAtTime(400, t); mg.gain.exponentialRampToValueAtTime(10, t + 2);
    mo.connect(mg); mg.connect(c.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    c.connect(g); g.connect(d); g.connect(A.verb); c.start(t); mo.start(t); c.stop(t + 2.5); mo.stop(t + 2.5);
    noise(t, 0.5, 0.12 * v, d, 'bandpass', 900, 2);
  }
  function whale(t, v, d) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.6); o.frequency.exponentialRampToValueAtTime(170, t + 1.8);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * v, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 2);
    o.connect(lp); lp.connect(g); g.connect(d); g.connect(A.verb); o.start(t); o.stop(t + 2.1);
  }
  A.inst = { piano, voice, erhu, suona, panflute, harp, guqin, pipa, gong, tanggu, bo, wood, whale };

  // 旋律时间线：8 小节一循环；第 1、5 小节是动机（记忆点），其余小节是围绕调式的级进变奏
  function buildTimeline(st, seed) {
    const rnd = CF.rng(seed), ev = [];
    const put = (start, notes) => { let p = start; notes.forEach(([d, len]) => { if (d !== null) ev.push({ s: p, d, len }); p += len; }); };
    const motifLen = st.motif.reduce((a, n) => a + n[1], 0);
    put(0, st.motif); put(64, st.motif);
    [32, 96].forEach((start, k) => {
      let d = 2, p = start; const end = start + 32;
      while (p < end - 4) { const len = [2, 2, 4, 2, 1, 1, 6][Math.floor(rnd() * 7)] || 2; d = CF.clamp(d + [-1, 1, -2, 2, 0, 1][Math.floor(rnd() * 6)], -1, st.scale.length + 2); if (rnd() < 0.85) ev.push({ s: p, d, len: Math.min(len, end - p) }); p += len; }
      ev.push({ s: end - 4, d: k ? 0 : 4, len: 4 });
    });
    st.tl = {}; ev.forEach((e) => (st.tl[e.s] = e)); st.motifLen = motifLen;
  }
  const degMidi = (st, d) => { const n = st.scale.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return st.root + st.scale[i] + 12 * o; };

  function heroNote(id, m, t, dur, v, d) {
    switch (id) {
      case 'xs': pluck(m, t, v, { bus: d, kind: 'b', verb: false }); break;
      case 'star': pluck(m, t, v * 1.1, { bus: d, kind: 'u' }); osc('sine', mtof(m + 12), 0, t, 0.5, v * 0.05, d); break;
      case 'omni': piano(m, t, v, d, Math.max(0.5, dur * 1.6)); break;
      case 'twin': harp(m, t, v, d); break;
      case 'riot': kick(t, 0.8 * v, d); snare(t + dur * 0.5, 0.6 * v, d); break;
      case 'llama': panflute(m, t, dur, v, d); break;
      case 'abyss': guqin(m, t, v, d, 2); break;
      case 'luna': erhu(m, t, dur * 1.3, v, d); break;
      case 'pearl': pipa(m, t, v, d, 2); break;
      case 'bun': suona(m, t, dur, v, d); break;
    }
  }
  // 英雄「招牌乐句」：选英雄、放技能时播放动机的前几个音
  A.lick = function (heroId, fast) {
    if (!A.ctx || A.ctx.state !== 'running' || !CF.Heroes) return;
    const h = CF.Heroes.get(heroId), st = STYLES[h.music.style], d = A.sfxBus, unit = fast ? 0.06 : 0.1;
    let t = A.ctx.currentTime + 0.01;
    st.motif.slice(0, fast ? 4 : 7).forEach(([deg, len]) => { if (deg !== null) heroNote(st.hero, degMidi(st, deg), t, unit * Math.min(len, 3), 0.8, d); t += unit * Math.min(len, 2); });
  };

  function heroStep(st, step, t, spb, out, I) {
    const s = step % 16, bar = Math.floor(step / 16), ch = st.prog[bar % st.prog.length], [root] = CH[ch], v = voicing(ch);
    const rnd = CF.rng(P.seed + bar * 977 + s * 31), e = st.tl[step % 128], hi = I >= 0.8;
    const len = e ? e.len * spb : 0, m = e ? degMidi(st, e.d) : 0;
    let strumHit = false;
    switch (st.hero) {
      case 'xs': {
        // 后四小节整体升全音：动机在更高处再出现一次 = 向上
        const tr = st.lift && bar % 8 >= 4 ? st.lift : 0, Rt = root + tr, Vv = v.map((x) => x + tr);
        if (s % 2 === 0) pluck(Rt - 12, t, hi ? 0.55 : 0.32, { bus: out, kind: 'm', dist: hi, len: spb * 1.3 });
        if (s === 0 || (hi && s === 10)) strum([Rt - 12, Rt - 5, Rt], t, hi ? 0.75 : 0.45, { bus: out, dist: hi, gap: 0.006, len: spb * (s === 0 ? 5 : 3) });
        if (s % 4 === 2) pluck(Vv[3 + ((s >> 2) % 3)] + 12, t, 0.2, { bus: out, kind: 'h' });
        if (e) { pluck(m + tr, t, 0.72, { bus: out, kind: 'b', dist: hi, len: Math.min(len, spb * 6) }); strumHit = true; }
        if (hi) {
          if (s === 0 || s === 8 || s === 11) kick(t, 0.85, out); if (s === 4 || s === 12) snare(t, 0.9, out); if (s % 2 === 0) hat(t, 0.38, out);
          if (bar % 4 === 3 && s >= 12) tom(t, [210, 175, 145, 120][s - 12], 0.7, out);
          if (s === 0 && bar % 4 === 0) crash(t, 0.55, out);
        } else { if (s === 0) kick(t, 0.45, out); if (s === 8) snare(t, 0.2, out); if (s % 4 === 2) hat(t, 0.2, out); }
        if (s === 0) { bass(Rt - 24, t, spb * 7, 0.7, out); pad(ch, t, spb * 16, hi ? 0.5 : 0.8, out, tr); }
        if (s === 8) bass(Rt - 24 + 7, t, spb * 6, 0.5, out);
        break;
      }
      case 'star': {
        // 尤克里里岛屿扫弦：下 · 下上 · 上下上
        const U = v.slice(1, 5);
        if ([0, 4, 6, 10, 12, 14].includes(s)) { const up = s === 6 || s === 10 || s === 14; strum(U, t + (s % 4 === 2 ? st.swing * spb : 0), up ? 0.24 : 0.34, { bus: out, kind: 'u', gap: 0.012, up }); }
        if (e) { pluck(m, t, 0.75, { bus: out, kind: 'u' }); osc('sine', mtof(m + 12), 0, t, 0.6, 0.045, out); strumHit = true; }
        if (hi) { if (s === 0 || s === 8) kick(t, 0.6, out); if (s === 4 || s === 12) { snare(t, 0.45, out); noise(t, 0.03, 0.16, out, 'bandpass', 1500, 1.5); } }
        if (s % 2 === 1) shaker(t, hi ? 0.9 : 0.6, out);
        if (s === 0) bass(root - 12, t, spb * 6, 0.55, out);
        if (s === 8) bass(root - 12 + 7, t, spb * 6, 0.45, out);
        if (s === 0 && bar % 2 === 1) osc('sine', mtof(v[4] + 24), 0, t, 1.2, 0.04, out);
        break;
      }
      case 'omni':
        if (s % 2 === 0) { const lh = [0, 1, 2, 1, 3, 2, 1, 2]; piano(v[lh[s / 2] % 4] - 12, t, 0.5, out, 1.2); }
        if (s === 0 || s === 8) piano(v[2], t, 0.35, out, 1.8);
        if (e) { piano(m, t, 0.8, out, Math.max(0.6, len * 1.3)); strumHit = true; }
        if (s === 0) bass(root - 12, t, spb * 8, 0.6, out);
        break;
      case 'twin':
        if (s === 0) { pad(ch, t, spb * 16, 0.9, out); v.concat(v.map((x) => x + 12)).forEach((x, i) => harp(x, t + i * 0.028, 0.35, out)); strumHit = true; }
        if (s % 4 === 2) harp(v[1 + (s / 4 | 0) % 4] + 12, t, 0.3, out);
        if (e) { harp(m, t, 0.7, out); strumHit = true; }
        { const e2 = st.tl[(step - 16 + 128) % 128]; if (e2 && bar % 2 === 1) harp(degMidi(st, e2.d) - 12, t, 0.35, out); }
        break;
      case 'riot':
        { const K = [0, 3, 7, 10, 11], S = [4, 12], H = s % 2 === 0;
          if (K.includes(s)) kick(t, 0.95, out); if (S.includes(s)) snare(t, 1.05, out); if (H) hat(t, 0.55, out); if (s === 14 && rnd() < 0.5) snare(t, 0.5, out);
          if (bar % 4 === 3 && s >= 8) tom(t, [220, 200, 170, 150, 130, 120, 110, 100][s - 8], 0.8, out);
          if (s === 0 && bar % 2 === 0) crash(t, 0.6, out); }
        if (s % 2 === 0) bass(root - 24 + (s === 6 ? 3 : 0), t, spb * 1.6, 0.8, out);
        if (e) { pluck(m, t, 0.65, { bus: out, kind: 'b', dist: true, len: Math.min(len, spb * 3) }); }
        strumHit = s % 4 === 0;
        break;
      case 'llama':
        if (s % 2 === 0) { const up = s % 4 === 2; strum(v.slice(1, 5).map((x) => x + 12), t, up ? 0.22 : 0.32, { bus: out, kind: 'h', gap: 0.01, up }); }
        if (s === 0 || s === 6 || s === 8) tanggu(t, s === 0 ? 0.7 : 0.45, out);
        if (hi && s % 2 === 1) shaker(t, 0.8, out);
        if (e) { panflute(m, t, len * 0.95, 0.7, out); strumHit = true; }
        if (s === 0) bass(root - 12, t, spb * 7, 0.55, out);
        break;
      case 'abyss':
        if (s === 0 && bar % 2 === 0) { pad(ch, t, spb * 32, 1.2, out); bass(root - 24, t, spb * 28, 0.5, out); }
        if (s === 8 && bar % 2 === 1) whale(t, 1, out);
        if (s % 8 === 4 && rnd() < 0.5) osc('sine', mtof(v[2] + 24), 0, t, 1.6, 0.05, out);
        if (e) { guqin(m, t, 0.85, out, rnd() < 0.5 ? 2 : 0); strumHit = true; }
        if (hi && (s === 0 || s === 8)) tanggu(t, 0.5, out);
        break;
      case 'luna':
        if (s === 0) pad(ch, t, spb * 16, 0.9, out);
        if (s % 2 === 0) pluck(v[[0, 2, 4, 2, 3, 2, 4, 5][s / 2] % 6] + 12, t, 0.18, { bus: out, kind: 'p', verb: true });
        if (e) { const prev = st._lastM; erhu(m, t, Math.max(len, spb * 2), 0.75, out, prev && Math.abs(prev - m) <= 5 ? prev : null); st._lastM = m; strumHit = true; }
        if (hi && s === 0) tanggu(t, 0.45, out); if (hi && s % 4 === 2) wood(t, 0.5, out);
        if (s === 0) bass(root - 12, t, spb * 14, 0.45, out);
        break;
      case 'pearl':
        if (s === 0 || s === 8) { strum(v.slice(0, 5).map((x) => x + 12), t, 0.4, { bus: out, kind: 'p', gap: 0.012 }); strumHit = true; }
        if (s % 2 === 1) wood(t, 0.45, out);
        if (e) { pipa(m, t, 0.65, out, e.len <= 1 ? 2 : 3); strumHit = true; }
        if (hi && (s === 0 || s === 10)) tanggu(t, 0.6, out); if (hi && s === 4 || hi && s === 12) bo(t, 0.5, out);
        if (s === 0) bass(root - 12, t, spb * 7, 0.5, out);
        break;
      case 'bun':
        if (s % 4 === 0 || s === 6 || s === 14) tanggu(t, s % 8 === 0 ? 0.85 : 0.55, out);
        if (s === 4 || s === 12) bo(t, 0.7, out);
        if (s === 0 && bar % 2 === 0) gong(t, 0.8, out);
        if (s % 2 === 1) wood(t, 0.4, out);
        if (e) { suona(m, t, len * 0.95, 0.7, out); strumHit = true; }
        if (s === 0) bass(root - 12, t, spb * 7, 0.55, out);
        break;
    }
    if (s % 4 === 0) beat(t, s === 0 ? 1 : 0.55, strumHit || s % 8 === 0);
    else if (strumHit && e) beat(t, 0.4, true);
  }

  // ---------- 程序音乐播放器 ----------
  const P = { on: false, style: null, step: 0, next: 0, timer: null, gain: null, seed: 1 };
  function beat(t, s, strum) { A.beats.push({ t, s, strum: !!strum }); }
  function scheduleStep(st, step, t, spb, out) {
    if (st.hero) return heroStep(st, step, t, spb, out, st.int || 0.5);
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
  A.resolveStyle = (id) => (id === 'hero' ? (CF.Heroes ? CF.Heroes.current().music.style : 'xs') : id);
  function startProc(styleId, bpmOverride, intensity) {
    stopProc(0.5);
    styleId = A.resolveStyle(styleId);
    const base = STYLES[styleId] || STYLES.arp;
    const st = Object.assign({ id: styleId }, base, { bpm: bpmOverride || base.bpm, int: intensity || 0.5 });
    if (st.hero) buildTimeline(st, CF.randi(1, 99999));
    const ctx = A.ctx;
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, ctx.currentTime); out.gain.exponentialRampToValueAtTime((st.int < 0.8 && st.gainLo) || st.gain || 1, ctx.currentTime + 0.8);
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
          h.play().then(() => { if (token === playToken) { A.htmlAudio = h; A.curBpm = bpmUser || src.bpm || 100; } else h.pause(); }).catch(() => startProc((s.bgmStyle || {})[screen] || DEFAULT_STYLE[screen], null, INTENSITY[screen]));
          return;
        }
        console.warn('自定义音乐播放失败，改用程序吉他', e);
      }
    }
    startProc((s.bgmStyle || {})[screen] || DEFAULT_STYLE[screen] || 'arp', bpmUser, INTENSITY[screen]);
  };
  A.restart = function () { const s = A.screen; A.screen = null; A.play(s); };
  // 试听某个曲风（英雄详情页）；再次调用 A.play(页面) 即恢复
  A.preview = function (styleId, intensity) {
    if (!A.ctx) A.unlock();
    if (!A.ctx) return;
    playToken++; stopCustom(0.4); A.screen = 'preview:' + styleId; A.beats.length = 0;
    startProc(styleId, null, intensity || 0.7);
  };
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
