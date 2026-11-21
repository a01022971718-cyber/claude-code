// 《屿见》纯程序合成音频模块：Web Audio API，不加载任何音频文件。
// 所有公开方法都做了 try/catch 降级，不会让游戏崩溃。

let ctx = null;
let master = null;     // 主增益
let sfxBus = null;     // 音效总线
let musicBus = null;   // 音乐总线
let ambBus = null;     // 环境音总线
let fxSend = null;     // 延迟发送
let noiseBuf = null;

let enabledFlag = true;
let musicFlag = true;
let inited = false;
let suspended = false;

const MASTER_VOL = 0.5;
const lastPlay = {};          // 节流：name -> 上次播放时间
let activeVoices = 0;         // 同时存在的音效声部数量（简单限制）
const MAX_VOICES = 48;

// ---------- 工具 ----------
const now = () => ctx.currentTime;
const rand = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function makeNoiseBuffer() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// 节点播放结束后回收
function cleanup(src, nodes, stopAt, counted) {
  let done = false;
  const fin = () => {
    if (done) return;
    done = true;
    if (counted) activeVoices = Math.max(0, activeVoices - 1);
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
  };
  src.onended = fin;
  // 保险：即使 onended 没触发（例如 context 被挂起）也不泄漏
  setTimeout(fin, Math.max(100, (stopAt - now()) * 1000 + 1500));
}

// 单个音：振荡器 + 包络
function tone({ freq = 440, type = 'sine', attack = 0.005, decay = 0.2, gain = 0.3,
  when = 0, slideTo = null, slideTime = null, dest = null, lp = 0, vib = 0, counted = true } = {}) {
  const t0 = now() + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + (slideTime || (attack + decay)));
  }
  const nodes = [osc, g];
  let out = g;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    g.connect(f);
    out = f;
    nodes.push(f);
  }
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = 5.5;
    lg.gain.value = vib;
    l.connect(lg); lg.connect(osc.frequency);
    l.start(t0); l.stop(t0 + attack + decay + 0.1);
    nodes.push(l, lg);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  osc.connect(g);
  out.connect(dest || sfxBus);
  const end = t0 + attack + decay + 0.05;
  osc.start(t0);
  osc.stop(end);
  if (counted) activeVoices++;
  cleanup(osc, nodes, end, counted);
}

// 噪声：可滤波，可做频率扫描
function noise({ duration = 0.1, filter = 'bandpass', freq = 1000, freqTo = null, q = 1,
  gain = 0.2, attack = 0.003, when = 0, dest = null, counted = true } = {}) {
  const t0 = now() + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f); f.connect(g); g.connect(dest || sfxBus);
  const end = t0 + duration + 0.05;
  src.start(t0, Math.random() * 1.5);
  src.stop(end);
  if (counted) activeVoices++;
  cleanup(src, [src, f, g], end, counted);
}

// 依次播放一串音符
function arp(notes, { step = 0.08, type = 'sine', decay = 0.25, gain = 0.2, attack = 0.004,
  when = 0, pitch = 1, lp = 0 } = {}) {
  notes.forEach((n, i) => tone({ freq: midi(n) * pitch, type, decay, gain, attack, when: when + i * step, lp }));
}

// 木头敲击：短促的带通噪声 + 低音正弦
function woodKnock(when, pitch = 1, gain = 0.3) {
  tone({ freq: 520 * pitch, type: 'sine', slideTo: 330 * pitch, attack: 0.002, decay: 0.06, gain, when });
  noise({ duration: 0.04, freq: 1800 * pitch, q: 3, gain: gain * 0.6, when });
}

// ---------- 音效表 ----------
// 每个函数 (p: pitch 倍率) => void
const SFX = {
  tap: (p) => {
    tone({ freq: 700 * p, type: 'sine', slideTo: 420 * p, attack: 0.002, decay: 0.05, gain: 0.22 });
    noise({ duration: 0.025, freq: 2200 * p, q: 2, gain: 0.1 });
  },
  select: (p) => arp([72, 79], { step: 0.07, type: 'triangle', decay: 0.2, gain: 0.2, pitch: p }),
  preview: (p) => {
    tone({ freq: 260 * p, type: 'sine', slideTo: 200 * p, attack: 0.005, decay: 0.18, gain: 0.28 });
  },
  place: (p) => {
    tone({ freq: 190 * p, type: 'sine', slideTo: 55 * p, slideTime: 0.3, attack: 0.01, decay: 0.38, gain: 0.5 });
    noise({ duration: 0.38, filter: 'bandpass', freq: 900, freqTo: 2600, q: 0.8, gain: 0.12, attack: 0.06, when: 0.04 });
    tone({ freq: 420 * p, type: 'sine', slideTo: 220 * p, attack: 0.002, decay: 0.08, gain: 0.1, when: 0.05 });
  },
  harvestWood: (p) => { woodKnock(0, p, 0.3); woodKnock(0.13, p * 1.08, 0.26); },
  harvestFood: (p) => arp([76, 79, 84], { step: 0.07, type: 'triangle', decay: 0.22, gain: 0.2, pitch: p }),
  harvestStone: (p) => {
    tone({ freq: 210 * p, type: 'triangle', slideTo: 120 * p, attack: 0.001, decay: 0.08, gain: 0.3 });
    noise({ duration: 0.05, filter: 'bandpass', freq: 1400 * p, q: 2, gain: 0.25 });
  },
  gain: (p) => {
    tone({ freq: midi(88) * p, type: 'sine', attack: 0.002, decay: 0.16, gain: 0.14 });
    tone({ freq: midi(95) * p, type: 'sine', attack: 0.002, decay: 0.1, gain: 0.05 });
  },
  goal: (p) => {
    arp([72, 74, 79, 84], { step: 0.12, type: 'triangle', decay: 0.5, gain: 0.2, pitch: p });
    arp([84], { when: 0.36, type: 'sine', decay: 0.8, gain: 0.08, pitch: p });
    tone({ freq: midi(60) * p, type: 'sine', attack: 0.02, decay: 0.7, gain: 0.1 });
  },
  landmark: (p) => {
    // 和弦铺底 C - G/B - Am - F → 结尾 C 大和弦
    const chords = [[48, 55, 64], [43, 50, 59], [45, 52, 60]];
    chords.forEach((c, i) => c.forEach((n) =>
      tone({ freq: midi(n) * p, type: 'triangle', attack: 0.08, decay: 0.7, gain: 0.07, when: i * 0.35, lp: 1500 })));
    [48, 55, 60, 64, 67].forEach((n) =>
      tone({ freq: midi(n) * p, type: 'triangle', attack: 0.1, decay: 1.2, gain: 0.07, when: 1.05, lp: 1800 }));
    // 上行旋律（钟琴感：基音 + 泛音）
    const mel = [67, 69, 72, 76, 79, 84];
    mel.forEach((n, i) => {
      const w = 0.1 + i * 0.2;
      const last = i === mel.length - 1;
      tone({ freq: midi(n) * p, type: 'sine', attack: 0.004, decay: last ? 1.1 : 0.55, gain: last ? 0.17 : 0.14, when: w });
      tone({ freq: midi(n) * 2.01 * p, type: 'sine', attack: 0.002, decay: last ? 0.5 : 0.25, gain: 0.04, when: w });
    });
    // 尾部余韵（反馈延迟之外再补一层轻泛音）
    [91, 88, 84].forEach((n, i) =>
      tone({ freq: midi(n) * p, type: 'sine', attack: 0.004, decay: 0.7, gain: 0.04, when: 1.4 + i * 0.22 }));
  },
  companion: (p) => arp([72, 76, 74, 79, 84], { step: 0.13, type: 'triangle', decay: 0.3, gain: 0.19, pitch: p }),
  error: (p) => {
    tone({ freq: 294 * p, type: 'sine', attack: 0.01, decay: 0.16, gain: 0.22, lp: 900 });
    tone({ freq: 220 * p, type: 'sine', attack: 0.01, decay: 0.24, gain: 0.22, when: 0.15, lp: 900 });
  },
  coupon: (p) => {
    tone({ freq: 800 * p, type: 'sine', slideTo: 2600 * p, slideTime: 0.22, attack: 0.01, decay: 0.3, gain: 0.12 });
    arp([88, 91, 96], { step: 0.07, when: 0.14, decay: 0.3, gain: 0.07, pitch: p });
  },
  crate: (p) => {
    woodKnock(0, p * 0.8, 0.3);
    noise({ duration: 0.03, freq: 3000, q: 2, gain: 0.12, when: 0.09 });
    arp([72, 76, 79, 84, 88], { step: 0.07, when: 0.18, type: 'triangle', decay: 0.2, gain: 0.14, pitch: p });
  },
  uiOpen: (p) => {
    noise({ duration: 0.18, filter: 'bandpass', freq: 500 * p, freqTo: 1800 * p, q: 1.2, gain: 0.1, attack: 0.05 });
  },
  uiClose: (p) => {
    noise({ duration: 0.16, filter: 'bandpass', freq: 1700 * p, freqTo: 450 * p, q: 1.2, gain: 0.09, attack: 0.04 });
  },
  shutter: () => {
    noise({ duration: 0.03, filter: 'highpass', freq: 3000, gain: 0.22 });
    tone({ freq: 1400, type: 'sine', slideTo: 800, attack: 0.001, decay: 0.03, gain: 0.1 });
    noise({ duration: 0.05, filter: 'bandpass', freq: 1800, q: 1.5, gain: 0.2, when: 0.07 });
    tone({ freq: 900, type: 'sine', slideTo: 500, attack: 0.001, decay: 0.04, gain: 0.1, when: 0.07 });
  },
  ok: (p) => arp([79, 86], { step: 0.1, type: 'sine', decay: 0.25, gain: 0.18, pitch: p }),
  warn: (p) => tone({ freq: midi(69) * p, type: 'triangle', attack: 0.01, decay: 0.35, gain: 0.2, lp: 1600 }),
};

// 每个音效的最小触发间隔（秒）与音量缩放，防止快速连点爆音
const THROTTLE = { tap: 0.04, gain: 0.05, harvestWood: 0.08, harvestFood: 0.08, harvestStone: 0.08 };
const DEFAULT_THROTTLE = 0.06;

// ---------- 环境音 ----------
let ambTimer = null;
let gullTimer = null;
let ambNodes = [];

function startAmbient() {
  if (ambNodes.length) return;
  // 两层海浪：低频隆隆 + 高频沙沙，各自有慢速 LFO
  const layer = (freq, q, base, depth, period, phase) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = base;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 1 / period;
    lg.gain.value = depth;
    lfo.connect(lg); lg.connect(g.gain);
    // 滤波器频率也随浪起伏
    const lg2 = ctx.createGain();
    lg2.gain.value = freq * 0.5;
    lfo.connect(lg2); lg2.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(ambBus);
    src.start(0, phase); lfo.start();
    ambNodes.push(src, f, g, lfo, lg, lg2);
  };
  layer(500, 0.7, 0.08, 0.06, 7.5, 0.3);
  layer(1400, 0.5, 0.03, 0.025, 6.3, 1.1);
  scheduleGull();
}

function stopAmbient() {
  clearTimeout(gullTimer); gullTimer = null;
  for (const n of ambNodes) {
    try { if (n.stop) n.stop(); } catch (e) { /* ignore */ }
    try { n.disconnect(); } catch (e) { /* ignore */ }
  }
  ambNodes = [];
}

function scheduleGull() {
  clearTimeout(gullTimer);
  gullTimer = setTimeout(() => {
    try {
      if (ctx && enabledFlag && !suspended && ambNodes.length) {
        const n = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) gull(i * rand(0.35, 0.5));
      }
    } catch (e) { /* ignore */ }
    if (ambNodes.length) scheduleGull();
  }, rand(8000, 20000));
}

function gull(when) {
  const f0 = rand(1500, 1900);
  tone({ freq: f0, type: 'sine', slideTo: f0 * 1.35, slideTime: 0.12, attack: 0.03, decay: 0.28, gain: 0.025,
    when, dest: ambBus, vib: 40, counted: false });
  tone({ freq: f0 * 1.35, type: 'sine', slideTo: f0 * 0.8, slideTime: 0.25, attack: 0.01, decay: 0.25, gain: 0.02,
    when: when + 0.15, dest: ambBus, counted: false });
}

// ---------- 背景音乐（lookahead 调度） ----------
const BPM = 70;
const BEAT = 60 / BPM;
// 和弦（根音 MIDI）+ 对应的 C 大调五声音阶音级；I–vi–IV–V
const PROG = [
  { root: 48, pad: [60, 64, 67], scale: [60, 62, 64, 67, 69, 72, 74, 76] }, // C
  { root: 45, pad: [57, 60, 64], scale: [57, 60, 62, 64, 67, 69, 72, 74] }, // Am
  { root: 41, pad: [57, 60, 65], scale: [60, 62, 64, 67, 69, 72, 74, 76] }, // F
  { root: 43, pad: [59, 62, 67], scale: [59, 62, 64, 67, 69, 71, 74, 76] }, // G
];
let musicTimer = null;
let nextBeatTime = 0;
let beatIndex = 0;
let lastNote = -1;

function startMusic() {
  if (musicTimer) return;
  nextBeatTime = now() + 0.3;
  beatIndex = 0;
  musicTimer = setInterval(musicTick, 100);
  musicTick();
}

function stopMusic() {
  clearInterval(musicTimer); musicTimer = null;
}

function musicTick() {
  try {
    if (!ctx || suspended) return;
    // 如果被挂起过很久，避免一次性补排大量拍子
    if (nextBeatTime < now() - 0.5) nextBeatTime = now() + 0.1;
    while (nextBeatTime < now() + 0.5) {
      scheduleBeat(beatIndex, nextBeatTime - now());
      nextBeatTime += BEAT;
      beatIndex++;
    }
  } catch (e) { /* ignore */ }
}

function scheduleBeat(idx, delay) {
  const bar = Math.floor(idx / 4);
  const chord = PROG[Math.floor(bar / 2) % PROG.length];
  const beatInChord = idx % 8; // 每 2 小节 8 拍
  const m = { dest: musicBus, counted: false };
  if (beatInChord === 0) {
    // 铺底长音
    chord.pad.forEach((n, i) =>
      tone({ ...m, freq: midi(n), type: 'sine', attack: 1.2, decay: BEAT * 8 - 0.4, gain: 0.07, when: delay + i * 0.02, lp: 900 }));
    tone({ ...m, freq: midi(chord.root - 12 + 12), type: 'triangle', attack: 0.8, decay: BEAT * 8 - 0.6, gain: 0.08, when: delay, lp: 500 });
  }
  // 卡林巴式旋律：每拍有概率发声，偶尔在半拍上再加一音
  const slots = [0, 0.5];
  for (const s of slots) {
    const prob = s === 0 ? (beatInChord % 2 === 0 ? 0.6 : 0.4) : 0.15;
    if (Math.random() < prob) {
      const sc = chord.scale;
      let i;
      if (lastNote < 0 || !sc.includes(lastNote)) i = Math.floor(Math.random() * sc.length);
      else {
        const cur = sc.indexOf(lastNote);
        i = Math.max(0, Math.min(sc.length - 1, cur + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      }
      lastNote = sc[i];
      const w = delay + s * BEAT + rand(0, 0.02);
      const f = midi(sc[i]);
      const v = rand(0.7, 1);
      tone({ ...m, freq: f, type: 'sine', attack: 0.004, decay: 1.6, gain: 0.07 * v, when: w });
      tone({ ...m, freq: f * 4.0, type: 'sine', attack: 0.002, decay: 0.12, gain: 0.012 * v, when: w });
    }
  }
}

// ---------- 总装 ----------
function build() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  ctx = new AC();
  noiseBuf = makeNoiseBuffer();

  master = ctx.createGain();
  master.gain.value = enabledFlag ? MASTER_VOL : 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);

  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.55;
  ambBus = ctx.createGain(); ambBus.gain.value = 0.8;
  sfxBus.connect(master); musicBus.connect(master); ambBus.connect(master);

  // 反馈延迟（程序化“空间感”）
  fxSend = ctx.createGain(); fxSend.gain.value = 0.22;
  const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.27;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
  fxSend.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay);
  dlp.connect(master);
  sfxBus.connect(fxSend); musicBus.connect(fxSend);
  return true;
}

function applyState() {
  if (!ctx) return;
  master.gain.setTargetAtTime(enabledFlag ? MASTER_VOL : 0, now(), 0.05);
  if (enabledFlag) startAmbient(); else stopAmbient();
  if (enabledFlag && musicFlag) startMusic(); else stopMusic();
}

export const audio = {
  init() {
    try {
      if (!inited) {
        if (!build()) return;
        inited = true;
      }
      if (ctx.state === 'suspended' && !suspended) ctx.resume().catch(() => {});
      applyState();
    } catch (e) { /* 静默降级 */ }
  },

  sfx(name, opts) {
    try {
      if (!inited || !enabledFlag || suspended || !ctx) return;
      const fn = SFX[name];
      if (!fn) return;
      const t = now();
      const gap = THROTTLE[name] ?? DEFAULT_THROTTLE;
      if (lastPlay[name] !== undefined && t - lastPlay[name] < gap) return;
      if (activeVoices > MAX_VOICES) return;
      lastPlay[name] = t;
      let p = opts && Number(opts.pitch);
      if (!(p > 0.25 && p < 4)) p = 1;
      fn(p);
    } catch (e) { /* 静默降级 */ }
  },

  setEnabled(on) {
    try {
      enabledFlag = !!on;
      applyState();
    } catch (e) { /* ignore */ }
  },

  setMusic(on) {
    try {
      musicFlag = !!on;
      applyState();
    } catch (e) { /* ignore */ }
  },

  get enabled() { return enabledFlag; },
  get music() { return musicFlag; },

  suspend() {
    try {
      suspended = true;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    } catch (e) { /* ignore */ }
  },

  resume() {
    try {
      suspended = false;
      if (ctx) {
        ctx.resume().catch(() => {});
        if (musicTimer) nextBeatTime = now() + 0.1;
      }
    } catch (e) { /* ignore */ }
  },
};
