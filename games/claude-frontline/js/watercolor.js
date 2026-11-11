/* 水彩画风工具包（v9.6，主创要求「可以用不同的画风，比如手绘水彩风格；AI 助手后续也能加相同风格的新功能」）
 * 用法：CF.WC.paper(g, w, h)、CF.WC.wash(g, 多边形, 颜色)、CF.WC.blob(g, x, y, r, 颜色)、CF.WC.ink(g, 点列)……
 * 规则见 UI 宪法第 28 章：宣纸底 + 透明颜料一层层叠 + 墨线勾边，颜色只用 WC.C 里的「水彩色卡」。
 * 整个工具包写在一个自包含的函数 ZYWatercolorKit 里：游戏里直接用；扩展工坊的「水彩小游戏」沙盒里也注入同一份源码
 * （CF.WC.source()），所以 AI 助手做的新功能和官方画风一致。
 * 做法：一块颜色 = 一个多边形，反复做「中点随机外推」变形，再用很低的不透明度叠 20 层左右（颜料边缘自然、
 * 中间深浅不匀）；边缘再轻描一圈更深的颜色（水彩干了以后颜料会往边上聚）；墨线用抖动的折线、粗细随笔压变化。 */
function ZYWatercolorKit() {
  'use strict';
  const C = {
    paper: '#f6efe0', paper2: '#efe4cc', ink: '#2b2622', inkSoft: '#5a514a',
    ultramarine: '#3b5b92', indigo: '#2e4a62', cyan: '#4f8fa8', teal: '#3f8a7a', sap: '#6b8e3a', moss: '#8aa05a',
    gamboge: '#e6b422', ochre: '#b9783f', sienna: '#a4613a', carmine: '#b8433a', rose: '#d9838f', peach: '#efb08c',
    violet: '#7a6aa8', lilac: '#a3859c', night: '#232a4a', moon: '#f3ecd2', gold: '#d9a441', white: '#fbf8f1',
  };
  // 可复现的随机数：同一个种子画出来一模一样（结算卡、截图、测试都稳定）
  const rng = (seed) => { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  let R = rng(20261111);
  const seed = (s) => { R = rng(typeof s === 'string' ? [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) : s); };
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const hex = (c, a) => { if (c[0] !== '#') return c; const n = parseInt(c.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const mix = (c1, c2, t) => { const p = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }, a = p(c1), b = p(c2); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join(''); };

  // ---------- 形状 ----------
  const circle = (x, y, r, n) => Array.from({ length: n || 18 }, (_, i) => { const a = (i / (n || 18)) * Math.PI * 2; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
  const rectPoly = (x, y, w, h) => [[x, y], [x + w / 2, y], [x + w, y], [x + w, y + h / 2], [x + w, y + h], [x + w / 2, y + h], [x, y + h], [x, y + h / 2]];
  // 中点随机外推：每条边中点沿法线方向随机推一点，递归几次，边缘就像纸上洇开的颜料
  function deform(poly, depth, amt) {
    let p = poly;
    for (let d = 0; d < depth; d++) {
      const out = [], k = amt / (1 + d * 0.9);   // 越细的层推得越少：大轮廓有起伏，小边缘只是毛糙
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, m = gauss() * k * len * 0.35;
        out.push(a, [(a[0] + b[0]) / 2 + (-(b[1] - a[1]) / len) * m, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * m]);
      }
      p = out;
    }
    return p;
  }
  // 先把长边切短，保证变形以后是圆润的毛边而不是尖角
  function subdivide(poly, maxLen) {
    const out = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen)); for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]); }
    return out;
  }
  const fillPoly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };

  // ---------- 纸 ----------
  function paper(g, w, h, o) {
    o = o || {}; const base = o.color || C.paper;
    g.save(); g.fillStyle = base; g.fillRect(0, 0, w, h);
    const n = Math.min(2600, Math.round((w * h) / 260));
    for (let i = 0; i < n; i++) { g.fillStyle = hex(R() < 0.5 ? C.paper2 : C.white, 0.35 + R() * 0.3); const x = R() * w, y = R() * h; g.fillRect(x, y, 1 + R() * 2, 1); }
    g.strokeStyle = hex(C.ochre, 0.05); g.lineWidth = 0.6;
    for (let i = 0; i < n / 8; i++) { const x = R() * w, y = R() * h, a = R() * Math.PI, l = 3 + R() * 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }   // 纸里的纤维
    if (o.vignette !== false) { const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hex(C.sienna, 0.12)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.restore();
  }

  // ---------- 晕染（一块颜色） ----------
  function wash(g, poly, color, o) {
    o = o || {}; const layers = o.layers || 24, alpha = o.alpha || 0.026, amt = o.spread == null ? 0.6 : o.spread;
    let per = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const base = deform(subdivide(poly, Math.max(6, per / 28)), 2, amt);
    g.save(); g.globalCompositeOperation = o.blend || 'multiply';
    const cx = base.reduce((a, q) => a + q[0], 0) / base.length, cy = base.reduce((a, q) => a + q[1], 0) / base.length;
    for (let i = 0; i < layers; i++) {   // 每层随机缩一点：中间叠得多更深，边缘浅，像真的颜料
      const k = 0.8 + R() * 0.24; g.fillStyle = hex(color, alpha * (0.7 + R() * 0.6));
      fillPoly(g, deform(base.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), 2, amt * 0.7));
    }
    if (o.edge !== false) { g.strokeStyle = hex(o.edgeColor || color, 0.18); g.lineWidth = 1.1; const e = deform(base, 2, amt * 0.4); g.beginPath(); e.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); }   // 颜料往边上聚的深色边
    g.restore();
  }
  const blob = (g, x, y, r, color, o) => wash(g, circle(x, y, r, 10), color, Object.assign({ spread: 0.55 }, o));
  const band = (g, x, y, w, h, color, o) => wash(g, rectPoly(x, y, w, h), color, Object.assign({ spread: 0.25 }, o));
  function bleed(g, x, y, r, c1, c2, o) { blob(g, x - r * 0.25, y, r * 0.8, c1, o); blob(g, x + r * 0.25, y + r * 0.1, r * 0.75, c2, o); }   // 两色湿接湿互相渗
  function splatter(g, x, y, r, color, n) { g.save(); g.globalCompositeOperation = 'multiply'; for (let i = 0; i < (n || 14); i++) { const a = R() * 7, d = Math.abs(gauss()) * r, s = 0.6 + R() * 2.4; g.fillStyle = hex(color, 0.25 + R() * 0.4); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, 7); g.fill(); } g.restore(); }

  // ---------- 墨线 ----------
  function ink(g, pts, o) {
    o = o || {}; const w = o.width || 2, col = o.color || C.ink, wob = o.wobble == null ? 1.1 : o.wobble;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
    for (let pass = 0; pass < (o.passes || 2); pass++) {
      g.globalAlpha = pass ? 0.35 : 0.9;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], t = i / Math.max(1, pts.length - 1);
        g.lineWidth = Math.max(0.4, w * (0.65 + 0.5 * Math.sin(t * Math.PI)) * (pass ? 0.6 : 1) * (0.85 + R() * 0.3));   // 起笔收笔细、中间粗
        g.beginPath(); g.moveTo(a[0] + gauss() * wob * 0.3, a[1] + gauss() * wob * 0.3);
        g.quadraticCurveTo((a[0] + b[0]) / 2 + gauss() * wob, (a[1] + b[1]) / 2 + gauss() * wob, b[0] + gauss() * wob * 0.3, b[1] + gauss() * wob * 0.3); g.stroke();
      }
    }
    g.restore();
  }
  const seg = (x1, y1, x2, y2, n) => Array.from({ length: (n || 6) + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / (n || 6), y1 + ((y2 - y1) * i) / (n || 6)]);
  const inkLine = (g, x1, y1, x2, y2, o) => ink(g, seg(x1, y1, x2, y2, Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 18))), o);
  const inkCircle = (g, x, y, r, o) => { const p = circle(x, y, r, Math.max(10, Math.round(r / 2.5))); p.push(p[0]); ink(g, p, o); };
  const inkRect = (g, x, y, w, h, o) => { inkLine(g, x, y, x + w, y, o); inkLine(g, x + w, y, x + w, y + h, o); inkLine(g, x + w, y + h, x, y + h, o); inkLine(g, x, y + h, x, y, o); };
  function arrow(g, x1, y1, x2, y2, o) { inkLine(g, x1, y1, x2, y2, o); const a = Math.atan2(y2 - y1, x2 - x1), s = (o && o.head) || 9; inkLine(g, x2, y2, x2 - Math.cos(a - 0.45) * s, y2 - Math.sin(a - 0.45) * s, o); inkLine(g, x2, y2, x2 - Math.cos(a + 0.45) * s, y2 - Math.sin(a + 0.45) * s, o); }

  // ---------- 字（楷体优先，略带手写的歪斜） ----------
  const FONT = '"KaiTi","STKaiti","Kaiti SC","楷体","BiauKai","Noto Serif SC","Songti SC",serif';
  function text(g, s, x, y, o) {
    o = o || {}; g.save(); g.font = `${o.weight || 600} ${o.size || 16}px ${o.font || FONT}`; g.fillStyle = o.color || C.ink; g.textAlign = o.align || 'left'; g.textBaseline = o.baseline || 'alphabetic';
    if (o.jitter === false) g.fillText(s, x, y);
    else { g.translate(x, y); g.rotate((R() - 0.5) * 0.03); g.fillText(s, 0, 0); }
    g.restore();
  }

  // ---------- 常用图案：星、月、夜空、植物、云 ----------
  function star(g, x, y, r, color, o) {
    blob(g, x, y, r * 1.8, color || C.gamboge, { layers: 10, alpha: o && o.dark ? 0.03 : 0.04, edge: false, blend: o && o.dark ? 'screen' : 'multiply' });   // 夜空上用「滤色」发光，纸上用「正片叠底」
    const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    g.save(); g.globalCompositeOperation = (o && o.blend) || 'source-over'; g.fillStyle = hex(color || C.gamboge, 0.85); fillPoly(g, pts); g.restore();
    ink(g, pts, { width: 0.9, color: hex(C.ink, 0.6), wobble: 0.4, passes: 1 });
  }
  // 月相：p = 0 新月（看不见）… 0.5 半月 … 1 满月。用水彩月白打底，再用夜色晕染遮住暗面
  function moon(g, x, y, r, p, o) {
    o = o || {}; p = Math.max(0, Math.min(1, p));
    blob(g, x, y, r * 1.3, C.moon, { layers: 8, alpha: 0.012 + 0.025 * p, edge: false, blend: 'screen', spread: 0.3 });
    g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = mix(o.night || C.night, C.moon, 0.18); g.fill(); g.clip();   // 先画暗面
    const t = 1 - 2 * p, lit = [];   // 亮面：右边的月缘 + 明暗交界线（椭圆弧）；p = 0 看不见，0.5 右半亮，1 满月
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI; lit.push([x + Math.cos(a) * r * 1.02, y + Math.sin(a) * r]); }
    for (let i = 24; i >= 0; i--) { const a = -Math.PI / 2 + (i / 24) * Math.PI; lit.push([x + Math.cos(a) * r * t, y + Math.sin(a) * r]); }
    g.fillStyle = C.moon; fillPoly(g, lit);
    for (let i = 0; i < 9; i++) { g.fillStyle = hex(C.ochre, 0.06); g.beginPath(); g.arc(x + gauss() * r * 0.4, y + gauss() * r * 0.4, r * (0.12 + R() * 0.18), 0, 7); g.fill(); }   // 月面的斑
    g.restore(); inkCircle(g, x, y, r, { width: 1.1, color: hex(C.ink, 0.45), wobble: 0.5, passes: 1 });
  }
  function nightSky(g, w, h, o) {
    o = o || {}; g.save(); g.fillStyle = o.base || '#1d2340'; g.fillRect(0, 0, w, h); g.restore();
    band(g, -20, -20, w + 40, h * 0.5, C.indigo, { layers: 16, alpha: 0.03, blend: 'screen', edge: false });
    blob(g, w * 0.25, h * 0.35, Math.max(w, h) * 0.24, C.violet, { layers: 14, alpha: 0.02, blend: 'screen', edge: false });
    blob(g, w * 0.8, h * 0.7, Math.max(w, h) * 0.22, C.ultramarine, { layers: 14, alpha: 0.024, blend: 'screen', edge: false });
    g.save(); for (let i = 0; i < (o.dust || 160); i++) { g.fillStyle = hex(C.moon, 0.15 + R() * 0.5); g.fillRect(R() * w, R() * h, 1, 1); } g.restore();
  }
  function cloud(g, x, y, s, color) { [[0, 0, 1], [-0.7, 0.15, 0.7], [0.75, 0.12, 0.75], [0.2, -0.35, 0.65]].forEach(([dx, dy, k]) => blob(g, x + dx * s, y + dy * s, s * 0.55 * k, color || C.white, { layers: 8, alpha: 0.08, edge: false, blend: 'source-over' })); }
  function sprout(g, x, y, h, grown) {   // 一株小苗：grown 0..1 决定长多高、几片叶子
    const top = y - h * (0.3 + 0.7 * grown); ink(g, seg(x, y, x + 2, top, 5), { width: 1.6, color: C.sap });
    const leaves = Math.round(1 + grown * 4);
    for (let i = 0; i < leaves; i++) { const ly = y - (h * (0.3 + 0.7 * grown) * (i + 1)) / (leaves + 1), side = i % 2 ? 1 : -1; blob(g, x + side * h * 0.12, ly, h * 0.09, i === leaves - 1 && grown >= 1 ? C.rose : C.moss, { layers: 8, alpha: 0.12 }); }
  }
  // 整张「插画卡」：纸底 + 一块主色晕染 + 标题，用在知识卡、结算卡
  function card(g, w, h, o) {
    o = o || {}; paper(g, w, h); wash(g, rectPoly(w * 0.06, h * 0.1, w * 0.88, h * 0.62), o.color || C.cyan, { layers: 16, alpha: 0.045, spread: 0.4 });
    if (o.title) text(g, o.title, w / 2, h * 0.86, { size: Math.round(h * 0.09), align: 'center' });
  }

  const W = { C, FONT, rng, seed, gauss, rand: () => R(), hex, mix, circle, rectPoly, deform, subdivide, paper, wash, blob, band, bleed, splatter, ink, seg, inkLine, inkCircle, inkRect, arrow, text, star, moon, nightSky, cloud, sprout, card };
  // 高分屏：把画布按设备像素比放大，画的时候仍按 CSS 像素算
  W.fit = function (cv, cssW, cssH) { const d = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1); cv.width = Math.round(cssW * d); cv.height = Math.round(cssH * d); cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return g; };
  return W;
}
(function () {
  const CF = window.CF;
  if (!CF) return;
  CF.WC = ZYWatercolorKit();
  CF.WC.source = () => 'var ZYWC=(' + ZYWatercolorKit.toString() + ')();';   // 扩展工坊沙盒里注入的同一份源码
})();
