/* 紫色像素脉冲 + 弹吉他的像素小人（参考视频中的 Ultracode 动效） */
(function () {
  const CF = window.CF;

  // ---------- 调色板 ----------
  const PAL = {
    body: '#d97757', bodyD: '#b85f40', eye: '#1b1226', k: '#1b1226',
    gtr: '#8b80d6', gtrD: '#5e54b0', gtrL: '#b3abea', fret: '#c8c1f2', note: '#f2c14e', gray: '#6b6680',
  };
  const LV = ['', 'rgba(132,112,214,0.34)', 'rgba(160,142,230,0.56)', 'rgba(188,176,240,0.8)'];

  // ---------- 像素小人 ----------
  // p: { bob, strum(0/1), blink, lean, scale }
  function drawClawd(ctx, ox, oy, px, p = {}) {
    const bob = p.bob || 0, lean = p.lean || 0;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + x * px), Math.round(oy + (y + bob) * px), Math.ceil(w * px), Math.ceil(h * px)); };
    const sh = lean > 0.5 ? -1 : 0, sv = lean > 0.5 ? 1 : 0; // 点头：上半身前倾
    const bc = p.tint || PAL.body;
    // 腿
    [2, 4, 9, 11].forEach((x, i) => R(x, 8, 1, 2 - ((p.step || 0) % 2 === i % 2 && p.walk ? 1 : 0), bc));
    // 身体下半
    R(1, 4, 12, 4, bc);
    // 身体上半（可前倾）
    R(1 + sh, 0 + sv, 12, 4, bc);
    R(0 + sh, 3 + sv, 1, 2, bc); // 左手
    R(1 + sh, 0 + sv, 1, 4, p.tintD || PAL.bodyD);
    // 眼睛
    if (p.blink) { R(3 + sh, 3 + sv, 2, 1, PAL.eye); R(8 + sh, 3 + sv, 2, 1, PAL.eye); }
    else { R(3 + sh, 2 + sv, 1, 2, PAL.eye); R(9 + sh, 2 + sv, 1, 2, PAL.eye); }
    if (p.noGuitar) return;
    // 吉他琴颈与琴头
    const neck = [[11, 4], [12, 3], [13, 2], [14, 1], [15, 0], [16, -1], [17, -2]];
    neck.forEach(([x, y], i) => { R(x, y, 1, 1, PAL.k); if (i % 2 === 0) R(x + 1, y, 1, 1, PAL.fret); });
    R(18, -4, 2, 2, PAL.gtr); R(20, -4, 1, 1, PAL.fret); R(18, -5, 1, 1, PAL.fret); R(17, -3, 1, 1, PAL.gtr);
    // 按弦的手
    R(14, 2, 1, 1, bc); R(15, 1, 1, 1, bc);
    // 琴身
    const gx = 6, gy = 4;
    const body = ['..KKKK.', '.KGGGGK', 'KGGgGGK', 'KgGGGGK', 'KKgggK.', '.KKKK..'];
    body.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = row[x]; if (c === '.') continue; R(gx + x, gy + y, 1, 1, c === 'K' ? PAL.k : c === 'g' ? PAL.gtrD : PAL.gtr); } });
    R(gx + 3, gy + 2, 1, 1, PAL.k); // 音孔
    // 扫弦的手
    const hy = p.strum ? 7 : 5;
    R(12, hy, 2, 1, bc); R(13, hy - 1, 1, 1, bc);
  }

  const NOTES = [['.XX', '.X.', 'XX.'], ['XX', '.X', 'XX'], ['X.X', 'XXX'], ['XXX', 'X.X', 'XX.']];
  const NOTE2 = ['XXXX', 'X..X', 'X..X', 'XX.XX'];
  function drawPattern(ctx, pat, x, y, px, col) {
    ctx.fillStyle = col;
    pat.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') ctx.fillRect(Math.round(x + i * px), Math.round(y + j * px), Math.ceil(px), Math.ceil(px)); });
  }

  // ---------- 舞台 ----------
  class Stage {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ mode: 'bar', cell: 14, fx: 0.86, fy: 0.55, charPx: 0, showChar: true, gradient: true, shimmer: true, radius: 60 }, opts);
      this.waves = []; this.parts = []; this.t = 0;
      this.anim = { bob: 0, strum: 0, blink: 0, lean: 0, strumFlip: 0 };
      this.enabled = true; this.w = 0; this.h = 0;
      this.idleBlink = 2 + Math.random() * 3;
      Stage.all.add(this);
    }
    destroy() { Stage.all.delete(this); }
    visible() { return this.enabled && this.cv.isConnected && this.cv.offsetParent !== null && (!this.o.activeFn || this.o.activeFn()); }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, CF.Save.data.settings.quality === 'low' ? 1 : 2);
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return false;
      if (this.w !== w || this.h !== h || this.dpr !== dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      }
      return true;
    }
    pulse(s, strum) {
      const big = s >= 0.9;
      this.waves.push({ t0: this.t, s, speed: big ? 26 : 18, width: big ? 7 : 4 });
      if (this.waves.length > 8) this.waves.shift();
      if (strum) { this.anim.strum = 1; this.anim.strumFlip ^= 1; }
      this.anim.bob = 1;
      if (big) { this.anim.lean = 1; if (Math.random() < 0.5) this.anim.blink = 0.5; }
      // 粒子
      const lowQ = CF.Save.data.settings.quality === 'low';
      const n = big ? 3 : s > 0.6 ? 2 : 1;
      for (let i = 0; i < (lowQ ? 1 : n); i++) this.parts.push({ k: 'note', pat: CF.pick(NOTES), x: 15 + Math.random() * 6, y: -6 - Math.random() * 2, vx: (Math.random() - 0.3) * 4, vy: -6 - Math.random() * 4, life: 1.2, age: 0 });
      if (strum) for (let i = 0; i < (lowQ ? 2 : 4); i++) { const a = -0.9 + Math.random() * 1.6; this.parts.push({ k: 'spark', x: 14, y: 6, vx: Math.cos(a) * 16, vy: Math.sin(a) * 14, life: 0.35, age: 0 }); }
      if (big && Math.random() < 0.4) this.parts.push({ k: 'gray', x: 21, y: 3, vx: 1, vy: -2, life: 1.4, age: 0 });
      if (this.parts.length > 60) this.parts.splice(0, this.parts.length - 60);
    }
    update(dt) {
      this.t += dt;
      const a = this.anim;
      a.bob = Math.max(0, a.bob - dt * 6); a.strum = Math.max(0, a.strum - dt * 7); a.lean = Math.max(0, a.lean - dt * 3.2); a.blink = Math.max(0, a.blink - dt);
      this.idleBlink -= dt;
      if (this.idleBlink < 0) { a.blink = 0.14; this.idleBlink = 2.5 + Math.random() * 4; }
      this.waves = this.waves.filter((w) => this.t - w.t0 < 2.4);
      this.parts.forEach((p) => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'note') p.vx += Math.sin(p.age * 8) * dt * 6; });
      this.parts = this.parts.filter((p) => p.age < p.life);
    }
    charPx() {
      if (this.o.charPx) return this.o.charPx;
      if (this.o.mode === 'bar') return Math.max(2, Math.round((this.h * 0.72) / 15));
      if (this.o.mode === 'portrait') return Math.max(2, Math.floor((this.h * 0.7) / 15));
      return Math.max(4, Math.floor(Math.min(this.w * 0.42, this.h * 0.6) / 22));
    }
    draw() {
      const { ctx, w, h, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fx = w * this.o.fx, fy = h * this.o.fy;
      // 底色
      if (this.o.gradient) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#22144c'); g.addColorStop(0.65, '#33207a'); g.addColorStop(1, '#4a2fa0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(w, h) * (this.o.mode === 'full' ? 0.55 : 0.3));
        const e = 0.25 + 0.25 * this.anim.bob;
        rg.addColorStop(0, `rgba(120,86,230,${0.55 + e * 0.4})`); rg.addColorStop(1, 'rgba(60,30,140,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      }
      // 像素方格
      const cs = this.o.cell * (CF.Save.data.settings.quality === 'low' ? 1.4 : 1);
      const cols = Math.ceil(w / cs), rows = Math.ceil(h / cs);
      const fcx = fx / cs, fcy = fy / cs;
      const maxR = this.o.radius;
      const t = this.t;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const d = Math.hypot(i + 0.5 - fcx, (j + 0.5 - fcy) * (this.o.mode === 'bar' ? 0.35 : 1));
          let b = 0;
          if (this.o.shimmer) { const band = Math.floor(i / 5); b = 0.1 + 0.11 * Math.sin(t * 1.1 - band * 0.9 + (this.o.mode === 'full' ? Math.floor(j / 5) * 0.7 : 0)); }
          for (const wv of this.waves) {
            const age = t - wv.t0, r = age * wv.speed;
            if (d <= r) { const k = 1 - (r - d) / wv.width; if (k > 0) b += wv.s * k * Math.exp(-age * 1.3) * Math.max(0, 1 - d / maxR) * 1.25; }
          }
          if (b < 0.18) continue;
          const lv = b < 0.42 ? 1 : b < 0.7 ? 2 : 3;
          ctx.fillStyle = LV[lv];
          ctx.fillRect(i * cs + 1, j * cs + 1, cs - 1, cs - 1);
        }
      }
      // 小人
      const px = this.charPx();
      if (this.o.drawChar && this.o.drawChar(ctx, fx, fy, px, this.anim)) { /* 自定义角色 */ }
      else if (this.o.showChar) {
        const cw = 21 * px, chh = 15 * px;
        const ox = fx - cw * 0.45, oy = fy - chh * 0.38;
        const a = this.anim;
        // 脚下光晕
        ctx.fillStyle = 'rgba(30,14,70,0.35)'; ctx.fillRect(ox + px, oy + 10 * px, 12 * px, px);
        drawClawd(ctx, ox, oy, px, { bob: a.bob > 0.5 ? -1 : 0, strum: a.strum > 0.4 ? (a.strumFlip ? 1 : 0) : 0, blink: a.blink > 0, lean: a.lean });
        // 粒子（以小人像素为单位）
        this.parts.forEach((p) => {
          const al = 1 - p.age / p.life;
          ctx.globalAlpha = Math.min(1, al * 1.5);
          const X = ox + p.x * px, Y = oy + p.y * px;
          if (p.k === 'note') drawPattern(ctx, p.pat, X, Y, Math.max(2, px * 0.75), PAL.note);
          else if (p.k === 'gray') drawPattern(ctx, NOTE2, X, Y, Math.max(1.5, px * 0.6), PAL.gray);
          else { ctx.fillStyle = PAL.note; ctx.fillRect(X, Y, px * 0.9, px * 0.6); }
        });
        ctx.globalAlpha = 1;
      }
    }
  }
  Stage.all = new Set();

  // ---------- 全局循环 ----------
  let last = performance.now(), acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    const lowQ = CF.Save.data.settings.quality === 'low';
    acc += dt;
    if (lowQ && acc < 1 / 30) return;
    const step = acc; acc = 0;
    const beats = CF.Audio ? CF.Audio.pullBeats() : [];
    for (const st of Stage.all) {
      beats.forEach((b) => st.pulse(b.s, b.strum));
      if (!st.visible()) continue;
      if (!st.resize()) continue;
      st.update(step);
      st.draw();
    }
    CF.bus.emit('frame', step);
  }
  requestAnimationFrame(loop);

  CF.PixelFX = { Stage, drawClawd, drawPattern, PAL, NOTES };
})();
