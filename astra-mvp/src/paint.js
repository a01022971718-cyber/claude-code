// Procedural "painted" backgrounds drawn on 2D canvas. All sizes in device pixels.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];

function ridge(ctx, R, W, H, y0, amp, color, freq = 3, bottom = null) {
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, bottom ?? H);
  for (let x = 0; x <= W; x += 4) {
    const t = x / W;
    const y = y0 - amp * (0.55 * Math.sin(t * freq * 6.28 + ph[0]) * 0.5 + 0.5 +
      0.3 * (Math.sin(t * freq * 2.3 * 6.28 + ph[1]) * 0.5 + 0.5) + 0.15 * (Math.sin(t * freq * 5.1 * 6.28 + ph[2]) * 0.5 + 0.5)) / 1.0;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, bottom ?? H);
  ctx.closePath();
  ctx.fill();
}

function cumulus(ctx, R, cx, baseY, w, h, cols) {
  const puffs = [];
  const n = Math.max(4, Math.min(11, Math.round(w / (h * 0.55))));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const prof = Math.pow(Math.sin(Math.PI * t), 0.9);
    const x = cx - w / 2 + t * w + (R() - 0.5) * (w / n) * 0.4;
    let r = (w / n) * (0.6 + 0.5 * prof) * (0.85 + 0.3 * R());
    let y = baseY - r * 0.45;
    puffs.push({ x, y, r });
    const levels = Math.floor(prof * (h / r) * (0.45 + 0.35 * R()));
    for (let k = 0; k < levels; k++) {
      r *= 0.84 + 0.12 * R();
      y -= r * (0.8 + 0.3 * R());
      puffs.push({ x: x + (R() - 0.5) * r * 0.9, y, r });
    }
    if (R() < 0.6) puffs.push({ x: x + (R() - 0.5) * (w / n), y: baseY - r * 0.3, r: r * 0.55 });
  }
  const c = cols || ['#8fa2ee', '#ffffff'];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, baseY + h * 0.01); ctx.clip();
  const layer = (col, dx, dy, s, list = puffs) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (const p of list) { const X = p.x + dx * p.r, Y = p.y + dy * p.r; ctx.moveTo(X + p.r * s, Y); ctx.arc(X, Y, p.r * s, 0, Math.PI * 2); }
    ctx.fill();
  };
  layer(c[0], 0, 0, 1.0);
  layer(c[1], -0.1, -0.17, 0.87);
  // soft highlights on the upper lobes only
  const tops = [...puffs].sort((a, b) => (a.y - a.r) - (b.y - b.r)).slice(0, Math.ceil(puffs.length * 0.35));
  for (const p of tops) {
    const X = p.x - p.r * 0.3, Y = p.y - p.r * 0.38;
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, p.r * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, p.r * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // cool shade under the base
  const sh = ctx.createLinearGradient(0, baseY - h * 0.3, 0, baseY);
  sh.addColorStop(0, 'rgba(110,120,220,0)'); sh.addColorStop(1, 'rgba(110,120,220,0.38)');
  const shape = new Path2D();
  for (const p of puffs) { shape.moveTo(p.x + p.r, p.y); shape.arc(p.x, p.y, p.r, 0, Math.PI * 2); }
  ctx.clip(shape);
  ctx.fillStyle = sh; ctx.fillRect(cx - w, baseY - h * 0.3, w * 2, h * 0.31);
  ctx.restore();
  // soft base haze
  const hz = ctx.createLinearGradient(0, baseY - h * 0.12, 0, baseY + h * 0.02);
  hz.addColorStop(0, 'rgba(200,225,255,0)'); hz.addColorStop(1, 'rgba(200,225,255,0.3)');
  ctx.fillStyle = hz; ctx.fillRect(cx - w * 0.6, baseY - h * 0.12, w * 1.2, h * 0.14);
}

function ringRuin(ctx, R, cx, cy, r, th) {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#dfe6f5'; ctx.lineWidth = th;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = th * 0.35;
  ctx.beginPath(); ctx.arc(cx, cy, r + th * 0.28, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  ctx.strokeStyle = '#8b97c9'; ctx.lineWidth = th * 0.22;
  ctx.beginPath(); ctx.arc(cx, cy, r - th * 0.36, 0, Math.PI * 2); ctx.stroke();
  // segment ribs
  ctx.strokeStyle = 'rgba(110,122,180,0.7)'; ctx.lineWidth = Math.max(1, th * 0.08);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - th / 2), cy + Math.sin(a) * (r - th / 2));
    ctx.lineTo(cx + Math.cos(a) * (r + th / 2), cy + Math.sin(a) * (r + th / 2)); ctx.stroke();
  }
  // moss & vines
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (0.95 + R() * 1.1);
    const rr = r + (R() - 0.5) * th;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    ctx.fillStyle = pick(R, ['rgba(46,170,90,0.85)', 'rgba(90,200,100,0.8)', 'rgba(30,140,80,0.8)']);
    ctx.beginPath(); ctx.ellipse(x, y, th * (0.2 + R() * 0.35), th * (0.12 + R() * 0.2), a, 0, Math.PI * 2); ctx.fill();
    if (R() < 0.25 && Math.sin(a) < -0.2) {
      ctx.strokeStyle = 'rgba(40,150,80,0.7)'; ctx.lineWidth = Math.max(1, th * 0.06);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (R() - 0.5) * th, y + th * 1.2, x + (R() - 0.5) * th * 0.6, y + th * (1.4 + R() * 1.5)); ctx.stroke();
    }
  }
  // glowing rune segments
  ctx.save(); ctx.shadowColor = '#5cf2ff'; ctx.shadowBlur = th * 0.8; ctx.strokeStyle = '#8ff9ff'; ctx.lineWidth = Math.max(1.5, th * 0.12);
  for (let a = Math.PI * 1.08; a < Math.PI * 1.95; a += Math.PI / 7) { ctx.beginPath(); ctx.arc(cx, cy, r, a, a + Math.PI / 18); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(190,215,255,0.22)';
  ctx.beginPath(); ctx.arc(cx, cy, r + th, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function rock(ctx, R, cx, cy, s) {
  const n = 7, pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI; // top half
    const rr = s * (0.75 + R() * 0.35);
    pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * (0.8 + R() * 0.3)]);
  }
  ctx.fillStyle = '#5d668a';
  ctx.beginPath(); ctx.moveTo(cx - s * 1.3, cy); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(cx + s * 1.3, cy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9aa6cf';
  ctx.beginPath(); ctx.moveTo(cx - s * 1.1, cy - s * 0.1); pts.slice(0, 5).forEach(p => ctx.lineTo(p[0] + s * 0.05, p[1] + s * 0.12)); ctx.lineTo(cx + s * 0.1, cy - s * 0.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eef2ff';
  ctx.beginPath(); ctx.moveTo(pts[1][0] + s * 0.1, pts[1][1] + s * 0.12); ctx.lineTo(pts[2][0], pts[2][1] + s * 0.08); ctx.lineTo(pts[3][0] - s * 0.05, pts[3][1] + s * 0.1); ctx.lineTo(cx - s * 0.2, cy - s * 0.45); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(10,60,50,0.35)';
  ctx.beginPath(); ctx.ellipse(cx + s * 0.25, cy + s * 0.05, s * 1.5, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
}

function blade(ctx, x, y, len, lean, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.15, y - len * 0.6, x + lean, y - len);
  ctx.stroke();
}

export function grassTuft(ctx, R, x, y, size, dpr, n = 26) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const xx = x + (R() - 0.5) * size * 1.6;
    const len = size * (0.4 + R() * 0.8);
    const col = pick(R, ['#2fa457', '#46b85a', '#1f8644', '#7fdc5f', '#c8f06a', '#167040']);
    blade(ctx, xx, y + R() * size * 0.15, len, (0.1 + R() * 0.4) * len * (R() < 0.15 ? -1 : 1), (0.8 + R() * 1.1) * dpr, col);
  }
}

// The meadow habitat. `hy` = horizon y in device px.
export function paintMeadow(cv, hy, seed = 11) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, dpr = Math.max(1, W / 390);
  const R = rng(seed);
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#0b46d0'); sky.addColorStop(0.3, '#1f6dff'); sky.addColorStop(0.62, '#4fa3ff');
  sky.addColorStop(0.86, '#a8dcff'); sky.addColorStop(1, '#e6f7ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 4);
  const sun = ctx.createRadialGradient(W * 0.05, H * 0.04, 0, W * 0.05, H * 0.04, W * 1.0);
  sun.addColorStop(0, 'rgba(255,250,225,0.55)'); sun.addColorStop(0.35, 'rgba(255,250,225,0.12)'); sun.addColorStop(1, 'rgba(255,250,225,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, hy + 4);
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const y = H * (0.05 + R() * 0.14), x = W * (R() * 1.1 - 0.1), len = W * (0.2 + R() * 0.45);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + R() * 0.18})`; ctx.lineWidth = (2 + R() * 6) * dpr;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5, y - H * 0.012, x + len, y + H * 0.004); ctx.stroke();
  }
  cumulus(ctx, R, W * 0.88, hy - H * 0.03, W * 0.78, H * 0.30);
  cumulus(ctx, R, W * 0.08, hy - H * 0.035, W * 0.42, H * 0.12);
  cumulus(ctx, R, W * 0.52, H * 0.215, W * 0.26, H * 0.045, ['#9fb0f2', '#ffffff']);
  cumulus(ctx, R, W * 0.2, H * 0.27, W * 0.18, H * 0.03, ['#9fb0f2', '#ffffff']);
  const hz = ctx.createLinearGradient(0, hy - H * 0.05, 0, hy + H * 0.01);
  hz.addColorStop(0, 'rgba(225,245,255,0)'); hz.addColorStop(1, 'rgba(225,245,255,0.8)');
  ctx.fillStyle = hz; ctx.fillRect(0, hy - H * 0.05, W, H * 0.06);
  ridge(ctx, R, W, H, hy - H * 0.004, H * 0.045, '#8aa2f0', 2.2, hy + 4);
  ridge(ctx, R, W, H, hy + H * 0.002, H * 0.022, '#6f88e2', 3.4, hy + 4);
  ringRuin(ctx, R, W * 0.27, hy + H * 0.012, W * 0.15, W * 0.035);
  const gg = ctx.createLinearGradient(0, hy, 0, H);
  gg.addColorStop(0, '#a6ec74'); gg.addColorStop(0.15, '#5fd064'); gg.addColorStop(0.45, '#2fb257');
  gg.addColorStop(0.75, '#1d8c48'); gg.addColorStop(1, '#126238');
  ctx.fillStyle = gg; ctx.fillRect(0, hy, W, H - hy);
  ridge(ctx, R, W, H, hy + H * 0.026, H * 0.016, '#7fdc68', 2.6);
  ridge(ctx, R, W, H, hy + H * 0.04, H * 0.012, '#5ccb5f', 3.1);
  // cloud shadows sweeping the meadow (cel-shaded)
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(70,110,170,0.38)';
  ctx.beginPath(); ctx.ellipse(W * 0.2, hy + H * 0.2, W * 0.45, H * 0.035, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W * 0.85, hy + H * 0.33, W * 0.5, H * 0.05, 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // the slope (challenge) on the right
  ctx.save();
  const sx0 = W * 0.5, sy0 = hy + H * 0.115;
  ctx.beginPath(); ctx.moveTo(sx0, sy0);
  ctx.bezierCurveTo(W * 0.66, sy0 - H * 0.01, W * 0.78, hy - H * 0.015, W * 1.02, hy - H * 0.03);
  ctx.lineTo(W * 1.02, sy0 + H * 0.05); ctx.lineTo(sx0, sy0 + H * 0.05); ctx.closePath();
  const sg = ctx.createLinearGradient(W * 0.55, hy, W, sy0);
  sg.addColorStop(0, '#e2ff6e'); sg.addColorStop(0.55, '#a8ea52'); sg.addColorStop(1, '#5cc84a');
  ctx.fillStyle = sg; ctx.fill();
  ctx.clip();
  for (let i = 0; i < 900; i++) {
    const x = W * (0.5 + R() * 0.52), y = hy - H * 0.04 + R() * H * 0.2;
    blade(ctx, x, y, (3 + R() * 7) * dpr, (1 + R() * 3) * dpr, 1 * dpr, pick(R, ['#f2ff9a', '#9adf4c', '#c9f564', '#6cc644']));
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(30,110,50,0.35)'; ctx.lineWidth = 3 * dpr;
  ctx.beginPath(); ctx.moveTo(sx0, sy0 + H * 0.002); ctx.bezierCurveTo(W * 0.66, sy0 - H * 0.008, W * 0.78, hy - H * 0.013, W * 1.02, hy - H * 0.028); ctx.stroke();
  rock(ctx, R, W * 0.1, hy + H * 0.115, W * 0.05);
  rock(ctx, R, W * 0.2, hy + H * 0.12, W * 0.028);
  rock(ctx, R, W * 0.03, hy + H * 0.13, W * 0.032);
  ctx.lineCap = 'round';
  const rows = 150;
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    const y = hy + H * 0.03 + Math.pow(t, 1.5) * (H - hy - H * 0.03);
    const d = (y - hy) / (H - hy);
    const n = Math.floor(26 + d * 110);
    const len = (0.004 + d * d * 0.07 + d * 0.012) * H;
    for (let j = 0; j < n; j++) {
      const x = R() * W;
      const yy = y + (R() - 0.5) * len * 0.3;
      let col;
      if (d < 0.18) col = pick(R, ['#9be86f', '#7fdc68', '#b8f27c', '#6cd062']);
      else if (d < 0.45) col = pick(R, ['#46c35d', '#33b257', '#6fd66a', '#2a9f50', '#a5ec6c', '#d8f76a']);
      else col = pick(R, ['#279a4e', '#1c8545', '#3fb85a', '#78dc5c', '#c6f26a', '#146b3c', '#0f5a33']);
      blade(ctx, x, yy, len * (0.7 + R() * 0.6), len * (0.2 + R() * 0.35), Math.max(1, (0.5 + d * 2.4) * dpr * (0.7 + R() * 0.6)), col);
    }
    if (d > 0.08 && d < 0.6 && R() < 0.8) {
      for (let k = 0; k < 5; k++) {
        const x = R() * W, rr = (0.9 + d * 3.4) * dpr;
        const c = pick(R, ['#ffffff', '#ffffff', '#ff8a3d', '#ffd21f', '#ff5a8a', '#7aa8ff']);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - rr, rr, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, 'rgba(255,245,210,0.12)'); wash.addColorStop(0.5, 'rgba(255,245,210,0)');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, 'rgba(10,20,60,0)'); vg.addColorStop(1, 'rgba(10,20,60,0.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// Dark holographic engineering view
export function paintHud(cv, seed = 5, ghost = null) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, dpr = Math.max(1, W / 390);
  const R = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1122'); g.addColorStop(0.5, '#0e1a33'); g.addColorStop(1, '#080d1a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (ghost) {
    ctx.save(); ctx.globalAlpha = 0.1; ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'grayscale(1) contrast(1.3)'; ctx.drawImage(ghost, 0, 0, W, H); ctx.restore();
  }
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, W * 0.75);
  glow.addColorStop(0, 'rgba(92,242,255,0.13)'); glow.addColorStop(1, 'rgba(92,242,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  for (let x = 0, i = 0; x < W; x += 18 * dpr, i++) { ctx.strokeStyle = `rgba(92,242,255,${i % 5 === 0 ? 0.13 : 0.05})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0, i = 0; y < H; y += 18 * dpr, i++) { ctx.strokeStyle = `rgba(92,242,255,${i % 5 === 0 ? 0.13 : 0.05})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(150,220,255,${R() * 0.06})`; ctx.fillRect(R() * W, R() * H, dpr, dpr); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
