/* 像素脉冲舞台：英雄配色的像素方格随节拍波动 + 英雄演奏乐器（参考视频中的紫色吉他动效）
 * 规则见 art/02-game-ui-constitution.md */
(function () {
  const CF = window.CF;

  // ---------- 通用小机器人「信号兵」（Agent 等小兵使用；v6 原创重绘：天线 + 黑色面罩 + 蓝钢机身） ----------
  const PAL = { body: '#7fa8d8', bodyD: '#4f6f9e', eye: '#6ff2ff', k: '#1b1226', ant: '#ffd76a', leg: '#3a4560', gtr: '#8b80d6', gtrD: '#5e54b0', gtrL: '#b3abea', fret: '#c8c1f2', note: '#f2c14e', gray: '#6b6680' };
  function drawAgent(ctx, ox, oy, px, p = {}) {
    const bob = p.bob || 0;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + x * px), Math.round(oy + (y + bob) * px), Math.ceil(w * px), Math.ceil(h * px)); };
    const bc = p.tint || PAL.body, bd = p.tintD || PAL.bodyD, st = p.walk ? (p.step || 0) % 2 : -1;
    // 腿
    R(3, 8, 1, st === 0 ? 1 : 2, PAL.leg); R(9, 8, 1, st === 1 ? 1 : 2, PAL.leg);
    // 机身
    R(3, 6, 7, 2, bc); R(3, 6, 1, 2, bd); R(5, 6, 3, 1, bd);
    // 头 + 面罩
    R(2, 1, 9, 5, bc); R(2, 1, 1, 5, bd); R(3, 2, 7, 2, PAL.k);
    if (p.blink) R(4, 3, 5, 1, PAL.eye); else { R(5, 2, 1, 2, PAL.eye); R(8, 2, 1, 2, PAL.eye); }
    // 天线
    R(6, -1, 1, 2, PAL.k); R(6, -2, 1, 1, PAL.ant);
  }
  const NOTES = [['.XX', '.X.', 'XX.'], ['XX', '.X', 'XX'], ['X.X', 'XXX'], ['XXX', 'X.X', 'XX.']];
  const NOTE2 = ['XXXX', 'X..X', 'X..X', 'XX.XX'];
  function drawPattern(ctx, pat, x, y, px, col) {
    ctx.fillStyle = col;
    pat.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') ctx.fillRect(Math.round(x + i * px), Math.round(y + j * px), Math.ceil(px), Math.ceil(px)); });
  }
  const reduced = () => CF.Save.data.settings.reduceMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lowQ = () => CF.Save.data.settings.quality === 'low';
  function levels(rgb) { return ['', `rgba(${rgb},0.34)`, `rgba(${rgb},0.56)`, `rgba(${rgb},0.8)`]; }
  function lighten(rgb, k) { return rgb.map((v) => Math.round(v + (255 - v) * k)); }

  // ---------- 舞台 ----------
  class Stage {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ mode: 'bar', cell: 14, fx: 0.86, fy: 0.55, charPx: 0, showChar: true, gradient: true, shimmer: true, radius: 60, hero: 'current' }, opts);
      this.waves = []; this.parts = []; this.t = Math.random() * 10;
      this.anim = { bob: 0, strum: 0, blink: 0, lean: 0, strumFlip: 0, t: 0 };
      this.enabled = true; this.w = 0; this.h = 0;
      this.idleBlink = 2 + Math.random() * 3;
      Stage.all.add(this);
    }
    destroy() { Stage.all.delete(this); }
    hero() { return this.o.hero === 'current' ? CF.Heroes.current() : CF.Heroes.get(this.o.hero); }
    visible() { return this.enabled && this.cv.isConnected && this.cv.offsetParent !== null && (!this.o.activeFn || this.o.activeFn()); }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, lowQ() ? 1 : 2);
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return false;
      if (this.w !== w || this.h !== h || this.dpr !== dpr) { this.w = w; this.h = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
      return true;
    }
    pulse(s, strum) {
      const big = s >= 0.9, rm = reduced();
      if (!rm || big) this.waves.push({ t0: this.t, s: rm ? s * 0.5 : s, speed: big ? 26 : 18, width: big ? 7 : 4 });
      if (this.waves.length > 8) this.waves.shift();
      if (strum) { this.anim.strum = 1; this.anim.strumFlip ^= 1; }
      this.anim.bob = 1;
      if (big) { this.anim.lean = 1; if (Math.random() < 0.5) this.anim.blink = 0.5; }
      const h = this.hero(), fx = h.fx, [sx, sy] = fx.src;
      const n = lowQ() || rm ? 1 : big ? 3 : s > 0.6 ? 2 : 1;
      const cimg = CF.PixStudio && CF.PixStudio.fxCanvas(h.id);   // v9：像素工坊里画的技能特效
      for (let i = 0; i < n; i++) { const k = Math.floor(Math.random() * fx.pats.length); if (cimg) { this.parts.push({ k: 'img', img: cimg, x: sx + Math.random() * 4 - 1, y: sy - 4 - Math.random() * 2, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 8, life: 1.4, age: 0 }); continue; } this.parts.push({ k: 'note', pat: fx.pats[k], col: fx.cols[k % fx.cols.length], x: sx + Math.random() * 4 - 1, y: sy - 4 - Math.random() * 2, vx: (Math.random() - 0.3) * 4, vy: (fx.rise ? -4 : -6) - Math.random() * 4, life: 1.3, age: 0 }); }
      if (strum && !rm) for (let i = 0; i < (lowQ() ? 2 : 4); i++) { const a = -0.9 + Math.random() * 1.6; this.parts.push({ k: 'spark', col: h.pal.note, x: sx - 1, y: sy + 2, vx: Math.cos(a) * 16, vy: Math.sin(a) * 14, life: 0.35, age: 0 }); }
      if (big && Math.random() < 0.35) this.parts.push({ k: 'gray', x: sx + 6, y: sy - 1, vx: 1, vy: -2, life: 1.4, age: 0 });
      if (this.parts.length > 60) this.parts.splice(0, this.parts.length - 60);
    }
    update(dt) {
      this.t += dt;
      const a = this.anim; a.t = this.t;
      a.bob = Math.max(0, a.bob - dt * 6); a.strum = Math.max(0, a.strum - dt * 7); a.lean = Math.max(0, a.lean - dt * 3.2); a.blink = Math.max(0, a.blink - dt);
      this.idleBlink -= dt;
      if (this.idleBlink < 0) { a.blink = 0.14; this.idleBlink = 2.5 + Math.random() * 4; }
      this.waves = this.waves.filter((w) => this.t - w.t0 < 2.4);
      this.parts.forEach((p) => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'note') p.vx += Math.sin(p.age * 8) * dt * 6; });
      this.parts = this.parts.filter((p) => p.age < p.life);
    }
    charPx() {
      if (this.o.charPx) return this.o.charPx;
      if (this.o.mode === 'bar') return Math.max(2, Math.round((this.h * 0.72) / 16));
      if (this.o.mode === 'portrait') return Math.max(2, Math.floor((this.h * 0.7) / 17));
      return Math.max(4, Math.floor(Math.min(this.w * 0.32, this.h * 0.5) / 22));
    }
    draw() {
      const { ctx, w, h, dpr } = this, hero = this.hero(), pal = hero.pal;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fx = w * this.o.fx, fy = h * this.o.fy;
      if (this.o.gradient) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, pal.bg[0]); g.addColorStop(0.65, pal.bg[1]); g.addColorStop(1, pal.bg[2]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(w, h) * (this.o.mode === 'full' ? 0.55 : 0.3));
        const e = 0.25 + 0.25 * this.anim.bob, gl = lighten(pal.grid, 0.05);
        rg.addColorStop(0, `rgba(${gl},${0.4 + e * 0.4})`); rg.addColorStop(1, `rgba(${pal.grid},0)`);
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      } else ctx.clearRect(0, 0, w, h);
      const LV = levels(lighten(pal.grid, 0.15));
      const cs = this.o.cell * (lowQ() ? 1.4 : 1);
      const cols = Math.ceil(w / cs), rows = Math.ceil(h / cs), fcx = fx / cs, fcy = fy / cs, maxR = this.o.radius, t = this.t;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const d = Math.hypot(i + 0.5 - fcx, (j + 0.5 - fcy) * (this.o.mode === 'bar' ? 0.35 : 1));
          let b = 0;
          if (this.o.shimmer) { const band = Math.floor(i / 5); b = 0.1 + 0.11 * Math.sin(t * 1.1 - band * 0.9 + (this.o.mode === 'full' ? Math.floor(j / 5) * 0.7 : 0)); }
          for (const wv of this.waves) { const age = t - wv.t0, r = age * wv.speed; if (d <= r) { const k = 1 - (r - d) / wv.width; if (k > 0) b += wv.s * k * Math.exp(-age * 1.3) * Math.max(0, 1 - d / maxR) * 1.25; } }
          if (b < 0.18) continue;
          ctx.fillStyle = LV[b < 0.42 ? 1 : b < 0.7 ? 2 : 3];
          ctx.fillRect(i * cs + 1, j * cs + 1, cs - 1, cs - 1);
        }
      }
      const px = this.charPx();
      if (this.o.drawChar && this.o.drawChar(ctx, fx, fy, px, this.anim)) { /* 自定义 */ }
      else if (this.o.showChar) {
        const ox = fx - 21 * px * 0.45, oy = fy - 15 * px * 0.38, a = this.anim;
        ctx.fillStyle = 'rgba(10,6,30,0.35)'; ctx.fillRect(ox + px, oy + 10.5 * px, 14 * px, px);
        hero.draw(ctx, ox, oy, px, { bob: a.bob, strum: a.strum > 0.4 ? (a.strumFlip ? 1 : 0) : 0, blink: a.blink > 0, lean: hero.id === 'xs' ? a.lean : 0, t: a.t });
        this.parts.forEach((p) => {
          ctx.globalAlpha = Math.min(1, (1 - p.age / p.life) * 1.5);
          const X = ox + p.x * px, Y = oy + p.y * px;
          if (p.k === 'note') drawPattern(ctx, p.pat, X, Y, Math.max(2, px * (this.o.mode === 'full' ? 0.5 : 0.75)), p.col);
          else if (p.k === 'img') { const sz = Math.max(8, px * (this.o.mode === 'full' ? 4 : 5)); ctx.imageSmoothingEnabled = false; ctx.drawImage(p.img, X, Y, sz, sz * p.img.height / p.img.width); }
          else if (p.k === 'gray') drawPattern(ctx, NOTE2, X, Y, Math.max(1.5, px * 0.6), PAL.gray);
          else { ctx.fillStyle = p.col; ctx.fillRect(X, Y, px * 0.9, px * 0.6); }
        });
        ctx.globalAlpha = 1;
      }
    }
  }
  Stage.all = new Set();

  // ---------- 像素转场（切换页面时英雄色方块擦过屏幕） ----------
  const wipe = { cv: null, t: -1 };
  function startWipe() {
    if (reduced()) return;
    if (!wipe.cv) { wipe.cv = document.createElement('canvas'); wipe.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:120'; document.body.appendChild(wipe.cv); }
    wipe.t = 0;
  }
  function drawWipe(dt) {
    if (wipe.t < 0) return;
    wipe.t += dt;
    const cv = wipe.cv, w = window.innerWidth, h = window.innerHeight, dpr = 1;
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    const D = 0.42, p = wipe.t / D, cs = Math.max(28, Math.round(w / 34)), pal = CF.Heroes.current().pal;
    if (p >= 1) { wipe.t = -1; x.clearRect(0, 0, w, h); return; }
    const cols = Math.ceil(w / cs), rows = Math.ceil(h / cs);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = (i / cols) * 0.55 + ((j * 7 + i * 3) % 5) * 0.03;
      const v = Math.sin(Math.PI * CF.clamp((p - k) / 0.45, 0, 1));
      if (v <= 0.02) continue;
      x.globalAlpha = v * 0.92; x.fillStyle = v > 0.7 ? pal.bg[2] : pal.bg[1];
      const s = cs * (0.4 + 0.6 * v); x.fillRect(i * cs + (cs - s) / 2, j * cs + (cs - s) / 2, s - 1, s - 1);
    }
    x.globalAlpha = 1;
  }

  // ---------- 全局循环：节拍分发 + CSS 律动变量 ----------
  let last = performance.now(), acc = 0, beatEnv = 0, lastCss = -1;
  const root = document.documentElement;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    if (lowQ() && acc < 1 / 30) return;
    const step = acc; acc = 0;
    const beats = CF.Audio ? CF.Audio.pullBeats() : [];
    beats.forEach((b) => (beatEnv = Math.max(beatEnv, b.s)));
    beatEnv = Math.max(0, beatEnv - step * 3.2);
    const v = reduced() ? 0 : Math.round(beatEnv * 20) / 20;
    if (v !== lastCss) { root.style.setProperty('--beat', v); lastCss = v; }
    for (const st of Stage.all) {
      beats.forEach((b) => st.pulse(b.s, b.strum));
      if (!st.visible()) continue;
      if (!st.resize()) continue;
      st.update(step);
      st.draw();
    }
    drawWipe(step);
    CF.bus.emit('frame', step);
  }
  requestAnimationFrame(loop);

  CF.PixelFX = { Stage, drawAgent, drawPattern, PAL, NOTES, wipe: startWipe, beat: () => beatEnv };
})();
