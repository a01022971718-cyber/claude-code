/* 像素工坊（v9 主创要求；v9.1 按主创第二轮要求改版）
 * - 画布：16×16 / 64×64 / 256×256，以及「无限画布」（分块存储，只记画过的地方，理论上没有边）。
 * - 色卡：造月 24 色 / 64 色（js/palette.js，来自美术用色宪法），按色系分类、每行从暗到亮；0 号是透明（橡皮擦）。
 * - 画布背景：英雄主题背景（像素脉冲舞台），和英雄档案页一样；可以切到透明格。
 * - 全屏绘图：竖屏底栏只留 画笔 / 橡皮 / 调色盘 / 撤销，调色盘和素材库是抽屉；横屏底栏变成左侧竖条，低频操作在右上角；
 *   说明文字收进「?」。双指轻点撤销、三指轻点重做、长按撤销 = 重做。
 * - 素材样板：英雄、单位、建筑、像素图标、技能特效样板、我的作品，都能在画布里打开查看、修改。
 * - 上传图片：按色卡把每个像素换成最接近的造月颜色（OKLab 色差，可选抖动）。
 * - 自定义：存为指挥官头像、英雄外观（游戏里所有画这位英雄的地方都换）、技能特效；导出 PNG。
 * - 排版规则见 UI 宪法第 26 章（v2.0 修订）与第 27 章。 */
(function () {
  const CF = window.CF, PAL = CF.Palette, H = CF.Heroes;
  const CH = 32;                                   // 分块边长（格）
  const SIZES = [['16', 16], ['64', 64], ['256', 256], ['∞', 0]];
  const UNDO_MAX = 60;
  const store = () => { const d = CF.Save.data; if (!d.pix) d.pix = { works: [], skins: {}, fx: {} }; d.pix.works = d.pix.works || []; d.pix.skins = d.pix.skins || {}; d.pix.fx = d.pix.fx || {}; return d.pix; };

  // ================= 真彩（v9.3，主创要求「需要不受限的」） =================
  // 真彩画布 pal = 'rgb'：每格存 0xFFRRGGBB（一定大于 255），1677 万色 + 透明，不受造月色卡限制。
  // 色卡画布每格存 1–255 的编号。两种数值不会重叠，所以下面的取色函数只看数值大小就能分辨。
  const TC = 'rgb', isTC = (pal) => pal === TC;
  const tcv = (r, g, b) => (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
  const tcRgb = (v) => [(v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const hx = (n) => n.toString(16).padStart(2, '0');
  const rgbOf = (v) => (v > 255 ? tcRgb(v) : PAL.rgb(v));
  const colorOf = (v) => (v > 255 ? '#' + tcRgb(v).map(hx).join('') : PAL.color(v));
  const nameOf = (v) => (v > 255 ? '真彩' : PAL.name(v));
  const hexToTc = (h) => tcv(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
  const palName = (set) => (isTC(set) ? '真彩（1677 万色，不受色卡限制）' : PAL.SETS[set].name);
  const palSize = (set) => (isTC(set) ? Infinity : PAL.size(set));

  // ================= 文档：分块的调色板下标 / 真彩 =================
  class Doc {
    constructor(w, h, pal) { this.w = w || 0; this.h = h || 0; this.inf = !w; this.pal = pal || 'zy24'; this.ch = new Map(); this.dirty = new Set(); this.odirty = new Set(); this.ver = 0; }
    arr() { return isTC(this.pal) ? new Uint32Array(CH * CH) : new Uint8Array(CH * CH); }
    inside(x, y) { return this.inf ? Math.abs(x) < 1e6 && Math.abs(y) < 1e6 : x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { const cx = Math.floor(x / CH), cy = Math.floor(y / CH), c = this.ch.get(cx + ',' + cy); return c ? c[(y - cy * CH) * CH + (x - cx * CH)] : 0; }
    set(x, y, v) {
      if (!this.inside(x, y)) return -1;
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH), k = cx + ',' + cy; let c = this.ch.get(k);
      if (!c) { if (!v) return 0; c = this.arr(); this.ch.set(k, c); }
      const i = (y - cy * CH) * CH + (x - cx * CH), o = c[i]; if (o === v) return o;
      c[i] = v; this.dirty.add(k); this.odirty.add(k); this.ver++; return o;
    }
    cells() { return this.inf ? this.ch.size * CH * CH : this.w * this.h; }
    big() { return this.cells() > (isTC(this.pal) ? 128 * 128 : BIG); }   // 真彩每格 4 字节，超过 128×128 就进 IndexedDB   // 大图（> 512×512）存 IndexedDB，不进存档
    touchAll() { this.ch.forEach((_, k) => { this.dirty.add(k); this.odirty.add(k); }); this.ver++; }
    chunkBounds() { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; this.ch.forEach((_, k) => { const [x, y] = k.split(',').map(Number); if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }); return a === Infinity ? null : { x0: a * CH, y0: b * CH, w: (c - a + 1) * CH, h: (d - b + 1) * CH }; }
    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      this.ch.forEach((c, k) => { const [cx, cy] = k.split(',').map(Number); for (let i = 0; i < c.length; i++) if (c[i]) { const x = cx * CH + (i % CH), y = cy * CH + ((i / CH) | 0); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } });
      return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    colors() { const s = new Set(); this.ch.forEach((c) => { for (let i = 0; i < c.length; i++) if (c[i]) s.add(c[i]); }); s.delete(0); return s; }
    // 存档：取有内容的范围，按行展开后游程编码（值, 次数≤255），再转 base64（小图用；大图走 raw() + IndexedDB）
    pack() {
      const b = this.inf ? this.bounds() : { x0: 0, y0: 0, w: this.w, h: this.h };
      const out = { w: this.w, h: this.h, pal: this.pal, x: 0, y: 0, bw: 0, bh: 0, d: '' };
      if (!b) return out;
      out.x = b.x0; out.y = b.y0; out.bw = b.w; out.bh = b.h;
      const bytes = [], tc = isTC(this.pal); let prev = -1, run = 0;
      const emit = () => { if (!run) return; if (tc) { const [r, g, bb] = prev ? tcRgb(prev) : [0, 0, 0]; bytes.push(prev ? 1 : 0, r, g, bb, run); } else bytes.push(prev, run); };
      for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) {
        const v = this.get(x, y);
        if (v === prev && run < 255) run++; else { emit(); prev = v; run = 1; }
      }
      emit(); if (tc) out.tc = 1;   // 真彩：每段 5 字节（是否不透明, R, G, B, 次数）
      let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
      out.d = btoa(s); if (this.hero) out.hero = this.hero; return out;
    }
    static unpack(o) {
      const doc = new Doc(o.w, o.h, o.pal); doc.hero = o.hero || null;   // hero：画布背景用哪位英雄的主题（v9.1）
      if (!o || !o.d) return doc;
      const s = atob(o.d); let x = o.x, y = o.y;
      const step = o.tc ? 5 : 2;
      for (let i = 0; i < s.length; i += step) { const v = o.tc ? (s.charCodeAt(i) ? tcv(s.charCodeAt(i + 1), s.charCodeAt(i + 2), s.charCodeAt(i + 3)) : 0) : s.charCodeAt(i), n = s.charCodeAt(i + step - 1); for (let k = 0; k < n; k++) { if (v) doc.set(x, y, v); x++; if (x >= o.x + o.bw) { x = o.x; y++; } } }
      doc.dirty.clear(); doc.odirty.clear(); return doc;
    }
    // 大图的原样存法：分块数组直接交给 IndexedDB（结构化克隆，不转 base64）
    raw() { return { v: 2, w: this.w, h: this.h, pal: this.pal, hero: this.hero || null, ch: [...this.ch.entries()] }; }
    static fromRaw(o) { const d = new Doc(o.w, o.h, o.pal); d.hero = o.hero || null; (o.ch || []).forEach(([k, a]) => d.ch.set(k, ArrayBuffer.isView(a) ? a : isTC(o.pal) ? new Uint32Array(a) : new Uint8Array(a))); return d; }
    // 画到一块普通画布上（缩放 s 倍）：先按块填 ImageData（4K 也只要几十毫秒），再整数倍放大
    toCanvas(s = 1, box) {
      const b = box || (this.inf ? this.bounds() : { x0: 0, y0: 0, w: this.w, h: this.h });
      const t = document.createElement('canvas'); if (!b) { t.width = t.height = 1; return t; }
      t.width = b.w; t.height = b.h; const tg = t.getContext('2d'), im = tg.createImageData(b.w, b.h), D = im.data, rgb = [];
      this.ch.forEach((a, k) => {
        const [cx, cy] = k.split(',').map(Number), X0 = cx * CH - b.x0, Y0 = cy * CH - b.y0;
        if (X0 >= b.w || Y0 >= b.h || X0 + CH <= 0 || Y0 + CH <= 0) return;
        for (let ly = 0; ly < CH; ly++) { const yy = Y0 + ly; if (yy < 0 || yy >= b.h) continue; for (let lx = 0; lx < CH; lx++) { const v = a[ly * CH + lx]; if (!v) continue; const xx = X0 + lx; if (xx < 0 || xx >= b.w) continue; const c3 = v > 255 ? tcRgb(v) : rgb[v] || (rgb[v] = PAL.rgb(v)), o = (yy * b.w + xx) * 4; D[o] = c3[0]; D[o + 1] = c3[1]; D[o + 2] = c3[2]; D[o + 3] = 255; } }
      });
      tg.putImageData(im, 0, 0); if (s === 1) return t;
      const c = document.createElement('canvas'); c.width = b.w * s; c.height = b.h * s; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, c.width, c.height); return c;
    }
  }
  const BIG = 512 * 512;
  // 任意图片 → 文档（v9.2：最高 4K）。按 128 行一条分条读取（不一次申请整张图的内存）；查表找最近的造月色；
  // 抖动用 Floyd–Steinberg，只保留两行误差；直接写分块数组。rect = 图片画进 w×h 的哪个位置（默认铺满）。
  async function convertImage(src, w, h, pal, dither, rect, onp) {
    const doc = new Doc(w, h, pal), tc = isTC(pal), near = tc ? null : PAL.lut(pal), RGB = [null]; if (tc) dither = false; else for (let i = 1, n = PAL.size(pal); i <= n; i++) RGB.push(PAL.rgb(i));
    const R = rect || { x: 0, y: 0, w, h }, SH = 128, c = document.createElement('canvas'); c.width = w; c.height = Math.min(SH, h);
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    let eCur = dither ? new Float32Array((w + 2) * 3) : null, eNext = dither ? new Float32Array((w + 2) * 3) : null;
    const nCx = Math.ceil(w / CH);
    for (let y0 = 0; y0 < h; y0 += SH) {
      const rows = Math.min(SH, h - y0); g.clearRect(0, 0, w, c.height); g.drawImage(src, R.x, R.y - y0, R.w, R.h);
      const px = g.getImageData(0, 0, w, rows).data;
      for (let ry = 0; ry < rows; ry++) {
        const y = y0 + ry, cy = y >> 5, ly = (y & 31) * CH, row = new Array(nCx);
        for (let x = 0; x < w; x++) {
          const i = (ry * w + x) * 4; if (px[i + 3] < 128) continue;
          let r = px[i], gg = px[i + 1], b = px[i + 2];
          if (eCur) { const e = (x + 1) * 3; r = Math.max(0, Math.min(255, r + eCur[e])); gg = Math.max(0, Math.min(255, gg + eCur[e + 1])); b = Math.max(0, Math.min(255, b + eCur[e + 2])); }
          const v = tc ? tcv(r, gg, b) : near(r | 0, gg | 0, b | 0), cx = x >> 5; let a = row[cx];   // 真彩：原样保留颜色
          if (!a) { const k = cx + ',' + cy; a = row[cx] = doc.ch.get(k); if (!a) { a = doc.arr(); doc.ch.set(k, a); } }
          a[ly + (x & 31)] = v;
          if (eCur) { const [Rr, Gg, Bb] = RGB[v], er = r - Rr, eg = gg - Gg, eb = b - Bb, e = (x + 1) * 3; eCur[e + 3] += er * 7 / 16; eCur[e + 4] += eg * 7 / 16; eCur[e + 5] += eb * 7 / 16; eNext[e - 3] += er * 3 / 16; eNext[e - 2] += eg * 3 / 16; eNext[e - 1] += eb * 3 / 16; eNext[e] += er * 5 / 16; eNext[e + 1] += eg * 5 / 16; eNext[e + 2] += eb * 5 / 16; eNext[e + 3] += er / 16; eNext[e + 4] += eg / 16; eNext[e + 5] += eb / 16; }
        }
        if (eCur) { const t = eCur; eCur = eNext; eNext = t; eNext.fill(0); }
      }
      if (onp) onp(Math.min(1, (y0 + rows) / h));
      await new Promise((ok) => setTimeout(ok, 0));   // 让出主线程：进度能刷新，界面不卡死
    }
    return doc;
  }
  // 小图（素材样板）用的同步版本
  function fromImage(src, w, h, pal, dither, fit) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.imageSmoothingEnabled = !!fit && fit.smooth;
    if (fit) { const s = Math.min(w / fit.w, h / fit.h), dw = Math.max(1, Math.round(fit.w * s)), dh = Math.max(1, Math.round(fit.h * s)); g.drawImage(src, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2), dw, dh); }
    else g.drawImage(src, Math.floor((w - src.width) / 2), Math.floor((h - src.height) / 2));
    const px = g.getImageData(0, 0, w, h).data, doc = new Doc(w, h, pal), near = PAL.lut(pal);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (px[i + 3] >= 128) doc.set(x, y, near(px[i], px[i + 1], px[i + 2])); }
    doc.dirty.clear(); doc.odirty.clear(); return doc;
  }
  // 大图仓库：IndexedDB「zy-pix」（存档只放一个指针，避免存档超出浏览器 5MB 上限而整体存不进去）
  const PixDB = (() => {
    let dbp = null; const ok = !!window.indexedDB;
    const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('zy-pix', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => { const t = d.transaction('docs', mode), st = t.objectStore('docs'), q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
    return { ok, put: (k, v) => tx('readwrite', (s) => s.put(v, k)), get: (k) => tx('readonly', (s) => s.get(k)), del: (k) => tx('readwrite', (s) => s.delete(k)) };
  })();

  // ================= 素材样板 =================
  // 英雄外观：64×64，英雄按 2 倍精度画（1 个英雄格 = 2 个像素），原点在 (12, 24)；游戏里按这个落点画回去，位置完全一致
  const SKIN = { w: 64, h: 64, ox: 12, oy: 24, k: 2 };
  function cv(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g); return c; }
  function iconCanvas(name) {
    const m = CF.Icons.MAP[name]; if (!m) return null;
    return cv(16, 16, (g) => m.split('|').forEach((r, y) => [...r].forEach((ch, x) => { const col = ch === '#' ? '#ede6d6' : ch === '+' ? '#ffb14a' : ch === 'o' ? '#ffffff' : null; if (col) { g.fillStyle = col; g.fillRect(x + 2, y + 2, 1, 1); } })));
  }
  function patCanvas(pats, cols, layout) {
    return cv(16, 16, (g) => layout.forEach(([k, x, y, s]) => CF.PixelFX.drawPattern(g, pats[k % pats.length], x, y, s, cols[k % cols.length])));
  }
  const GEN_FX = [
    ['像素光环', () => cv(16, 16, (g) => { g.fillStyle = '#4ef0ff'; for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; g.fillRect(Math.round(7.5 + Math.cos(t) * 6.5), Math.round(7.5 + Math.sin(t) * 6.5), 1, 1); } g.fillStyle = '#ffffff'; g.fillRect(7, 7, 2, 2); })],
    ['星爆', () => cv(16, 16, (g) => { g.fillStyle = '#ffe08a'; for (let i = 1; i < 8; i++) { g.fillRect(7 + i, 7, 1, 1); g.fillRect(7 - i, 7, 1, 1); g.fillRect(7, 7 + i, 1, 1); g.fillRect(7, 7 - i, 1, 1); } g.fillStyle = '#ffb14a'; for (let i = 1; i < 5; i++) { g.fillRect(7 + i, 7 + i, 1, 1); g.fillRect(7 - i, 7 - i, 1, 1); g.fillRect(7 + i, 7 - i, 1, 1); g.fillRect(7 - i, 7 + i, 1, 1); } g.fillStyle = '#ffffff'; g.fillRect(6, 6, 3, 3); })],
    ['闪电', () => cv(16, 16, (g) => { g.fillStyle = '#ffe08a'; [[9, 0], [8, 1], [7, 2], [6, 3], [5, 4], [6, 5], [7, 5], [8, 5], [9, 5], [8, 6], [7, 7], [6, 8], [5, 9], [4, 10], [5, 10], [6, 10], [7, 10], [6, 11], [5, 12], [4, 13], [3, 14], [2, 15]].forEach(([x, y]) => g.fillRect(x, y, 2, 1)); })],
    ['音波', () => cv(16, 16, (g) => { [['#9b7bff', 3], ['#4ef0ff', 5], ['#ffffff', 7]].forEach(([c, r]) => { g.fillStyle = c; for (let a = -0.9; a <= 0.9; a += 0.12) g.fillRect(Math.round(3 + Math.cos(a) * r), Math.round(7.5 + Math.sin(a) * r), 1, 1); }); })],
    ['乱码碎片', () => cv(16, 16, (g) => { [['#ff4f9a', 2, 3], ['#29e0e0', 3, 3], ['#ff4f9a', 9, 2], ['#29e0e0', 10, 3], ['#ff4f9a', 5, 9], ['#29e0e0', 6, 10], ['#ff4f9a', 11, 11], ['#29e0e0', 12, 10]].forEach(([c, x, y]) => { g.fillStyle = c; g.fillRect(x, y, 3, 2); }); })],
  ];
  function library() {
    const L = { 英雄: [], 单位: [], 建筑: [], 图标: [], 特效: [], 我的: [] };
    H.list.forEach((h) => L.英雄.push({ id: 'hero:' + h.id, name: h.name, hero: h.id, make: () => cv(SKIN.w, SKIN.h, (g) => h.draw(g, SKIN.ox, SKIN.oy, SKIN.k, { noCustom: true, showInst: true })) }));
    L.单位.push({ id: 'agent', name: '信号兵', make: () => cv(64, 64, (g) => CF.PixelFX.drawAgent(g, 8, 16, 4, {})) });
    if (H.drawDrone) L.单位.push({ id: 'drone', name: '无人机·伏特', make: () => cv(16, 16, (g) => H.drawDrone(g, 2, 3, 2, 0)) });
    const G = CF.Game;
    if (G && G.UT) Object.keys(G.UT).forEach((t) => L.单位.push({ id: 'u:' + t, name: G.UT[t].name || t, make: () => CF.UI.icon('u', t) }));
    if (G && G.BT) Object.keys(G.BT).forEach((t) => L.建筑.push({ id: 'b:' + t, name: G.BT[t].name || t, make: () => CF.UI.icon('b', t) }));
    CF.Icons.names.forEach((n) => L.图标.push({ id: 'ic:' + n, name: n, make: () => iconCanvas(n) }));
    H.list.forEach((h) => { const fx = h.fx; if (fx && fx.pats) L.特效.push({ id: 'fx:' + h.id, name: h.name + '·音符', fx: h.id, make: () => patCanvas(fx.pats, fx.cols, [[0, 2, 2, 2], [1, 9, 4, 2], [2, 5, 10, 2]]) }); });
    L.特效.push({ id: 'fx:notes', name: '通用音符', make: () => patCanvas(CF.PixelFX.NOTES, ['#ffe08a', '#4ef0ff', '#ff9a5c', '#9b7bff'], [[0, 1, 1, 2], [1, 10, 2, 2], [2, 3, 9, 2], [3, 10, 10, 2]]) });
    GEN_FX.forEach(([n, f], i) => L.特效.push({ id: 'fxg:' + i, name: n, make: f }));
    store().works.forEach((w, i) => L.我的.push({ id: 'my:' + i, name: w.name || '作品 ' + (i + 1), work: i, make: () => Doc.unpack(w.big ? w.thumb : w.doc).toCanvas(1) }));
    return L;
  }

  // ================= 游戏里用：英雄外观、技能特效 =================
  const cache = new Map();
  function canvasOf(kind, id) {
    const s = store()[kind][id]; if (!s) return null;
    const key = kind + ':' + id + ':' + s.d.length + ':' + s.d.slice(0, 24);
    if (!cache.has(key)) cache.set(key, Doc.unpack(s).toCanvas(1, kind === 'skins' ? { x0: 0, y0: 0, w: SKIN.w, h: SKIN.h } : null));
    return cache.get(key);
  }
  const PS = (CF.PixStudio = { Doc, SKIN, fromImage, convertImage, PixDB, BIG, skinCanvas: (id) => { const S = CF.Skins; if (!S) return null; const e = S.equipped(id); return e.startsWith('my-') ? S.img(id, e) : null; }, fxCanvas: (id) => canvasOf('fx', id) });
  // 英雄外观（皮肤）的绘制在 js/skins.js：经典 / 炫彩 / 我的外观（衣柜），这里只管技能特效
  // 战场：放技能时在落点炸开 6 个你画的特效图案（game.js 调用）
  PS.castFx = function (g, heroId, x, y) { const img = PS.fxCanvas(heroId); if (img) g.fx.push({ k: 'pix', x, y, t: 0, img, n: 6, a0: Math.random() * Math.PI }); };
  PS.drawFx = function (ctx, f) {
    const p = Math.min(1, f.t / 0.7), size = 28 + p * 10, sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, 1 - p * p);
    ctx.drawImage(f.img, f.x - size * 0.6, f.y - size * 0.6, size * 1.2, size * 1.2);
    for (let i = 0; i < f.n; i++) { const a = f.a0 + (i / f.n) * Math.PI * 2, r = 10 + p * 70; ctx.drawImage(f.img, f.x + Math.cos(a) * r - size / 2.6, f.y + Math.sin(a) * r - size / 2.6, size / 1.3, size / 1.3); }
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm;
  };


  // ================= 编辑器（v9.1：全屏绘图 + 抽屉式工具，UI 宪法第 26 章修订版） =================
  // 竖屏：顶行（画布按钮 · 右上角 素材 / 上传 / 保存 / ?）＋ 画布（约占屏幕 80%）＋ 底栏 4 个核心键（画笔 / 橡皮 / 调色盘 / 撤销）。
  // 横屏：底栏改成左侧竖条（王者式左侧导航），色板和素材库从右边抽出；大屏横屏时色板常驻右侧。
  // 画布背景 = 英雄主题背景（像素脉冲舞台，美术宪法第 1、2 章），和英雄档案页一致；也可以切到透明格。
  const ICONS = {
    pen: '............|.........##.|........#o+#|.......#++#.|......#++#..|.....#++#...|....#++#....|...#++#.....|..#++#......|..###.......|..#.........|............',
    eraser: '............|............|............|............|..########..|.#++++#ooo#.|.#++++#ooo#.|.#++++#ooo#.|..########..|............|.##########.|............',
    undo: '............|............|...#........|..##........|.#########..|..##......#.|...#.......#|...........#|..........#.|.....#####..|............|............',
    pick: '............|.........##.|........####|.......#####|......####..|.....#o##...|....#o+#....|...#++#.....|..#++#......|.#++#.......|.##.........|............',
  };
  ICONS.redo = ICONS.undo.split('|').map((r) => [...r].reverse().join('')).join('|');
  Object.keys(ICONS).forEach((k) => { if (!CF.Icons.MAP[k]) { CF.Icons.MAP[k] = ICONS[k]; CF.Icons.names.push(k); } });
  const ic = (n) => CF.Icons.svg(n);
  const BRUSH = [['pen', '画笔', 'pen', 'B'], ['fill', '填充', 'drop', 'G'], ['pick', '吸管', 'pick', 'I'], ['hand', '移动', 'tap', 'H']];
  const HELP = `<h4>像素工坊</h4><p>美也是一种能力。画头像、英雄外观或技能特效，颜色都来自造月色卡。用到 4 种以上颜色得 3 星。</p>
    <ul><li><b>画</b>：单指按住拖动；「画笔」再点一下可以换成填充、吸管、移动。</li><li><b>缩放 / 移动画布</b>：双指捏合、拖动；电脑上滚轮缩放，按住空格或右键拖动。</li>
    <li><b>撤销 / 重做</b>：双指轻点 = 撤销，三指轻点 = 重做；长按「撤销」也能重做。</li><li><b>左上角画布按钮</b>：换尺寸（16 / 64 / 256 / 无限）、缩放、换背景、清空。</li>
    <li><b>右上角</b>：素材（看全部美术样板）、上传（照片换成造月色）、保存（存作品、设为英雄外观 / 技能特效 / 头像、导出 PNG）。</li>
    <li>快捷键：B 画笔 · E 橡皮 · G 填充 · I 吸管 · H 移动 · P 调色盘 · Ctrl+Z / Ctrl+Y。</li></ul>`;

  PS.open = function () {
    const st = store(); st.recent = st.recent || [];
    // 大图草稿（> 512×512）存在 IndexedDB：先放一张同尺寸的空画布，读出来后再换上；读完之前不自动保存，免得覆盖
    const lastMeta = st.last && st.last.big ? st.last : null, last = st.last && !st.last.big ? Doc.unpack(st.last) : null;
    let doc = lastMeta ? Object.assign(new Doc(lastMeta.w, lastMeta.h, lastMeta.pal), { hero: lastMeta.hero || null }) : last || (CF.Save.data.avatar2 ? Doc.unpack(CF.Save.data.avatar2) : legacyAvatar() || new Doc(16, 16, 'zy24'));
    let loading = !!lastMeta, busy = false, ov = null;
    let tool = 'pen', brush = 'pen', col = 14, undo = [], redo = [], stroke = null, cam = { x: 0, y: 0, z: 16 }, hover = null, libCat = '英雄', tab = 'lib';
    let bgMode = st.bg === 'clear' ? 'clear' : 'hero', heroSel = doc.hero || H.current().id, palOpen = false, sheet = null, wasDesk = false;
    const body = CF.h(`<div class="ps2 p">
      <div class="ps-top">
        <div class="ps-tl"><button class="ps-chip ps-cvb" data-pop="cv" aria-haspopup="true" title="画布：尺寸、缩放、背景"><span class="ps-info"></span><i class="ps-car">▾</i></button><span class="ps-note" aria-live="polite"></span></div>
        <div class="ps-tr"><button class="ps-chip" data-sheet="lib">素材</button><button class="ps-chip" data-sheet="up">上传</button><button class="ps-chip" data-sheet="save">保存</button><button class="ps-chip ps-q" data-help title="说明" aria-label="说明">?</button></div>
      </div>
      <div class="ps-stagebox"><canvas class="ps-bg" aria-hidden="true"></canvas><canvas class="ps-cv" aria-label="像素画布：按住拖动涂色，双指缩放和移动"></canvas></div>
      <nav class="ps-dock" aria-label="核心工具">
        <button class="ps-dk" data-dk="brush" title="画笔（再点一下换填充 / 吸管 / 移动）"><span class="ps-dki"></span><b class="ps-dkl">画笔</b><i class="ps-more" aria-hidden="true">▴</i></button>
        <button class="ps-dk" data-dk="erase" title="橡皮（E）">${ic('eraser')}<b>橡皮</b></button>
        <button class="ps-dk" data-dk="pal" title="调色盘（P）"><span class="ps-dot"></span><b>调色盘</b></button>
        <button class="ps-dk" data-dk="undo" title="撤销（Ctrl+Z）；长按 = 重做">${ic('undo')}<b>撤销</b><i class="ps-redo" title="重做" hidden>${ic('redo')}</i></button>
      </nav>
      <div class="ps-pop ps-pop-brush" role="menu" hidden>${BRUSH.map(([k, n, i]) => `<button data-tool="${k}" role="menuitem">${ic(i)}<span>${n}</span></button>`).join('')}</div>
      <div class="ps-pop ps-pop-cv" hidden>
        <div class="ps-pr"><span class="ps-l">画布</span><span class="ps-seg">${SIZES.map(([n, v]) => `<button data-size="${v}" title="${v ? v + '×' + v : '无限画布：往哪边画都有地方'}">${n}</button>`).join('')}</span></div>
        <div class="ps-pr"><span class="ps-l">缩放</span><span class="ps-seg"><button data-act="out" title="缩小">－</button><button data-act="fit" title="整张画放进视野">适合</button><button data-act="in" title="放大">＋</button></span></div>
        <div class="ps-pr"><span class="ps-l">背景</span><span class="ps-seg"><button data-bg="hero">英雄主题</button><button data-bg="clear">透明格</button></span></div>
        <div class="ps-pr"><span class="ps-l"></span><button class="btn sm ghost" data-act="clear">清空画布</button></div>
      </div>
      <section class="ps-sheet ps-palsheet" aria-label="调色盘" hidden>
        <div class="ps-sh-h"><i class="ps-grab" data-close></i><b class="ps-sh-t">造月色卡</b><span class="ps-seg" data-seg="pal"><button data-pal="zy24">24</button><button data-pal="zy64">64</button><button data-pal="zy256" title="256 色：索引色的行业上限（GIF / PNG-8 / Aseprite）">256</button><button data-pal="rgb" title="真彩：1677 万色，不受造月色卡限制">真彩</button></span><span class="ps-cur"></span><button class="ps-x" data-close aria-label="收起">✕</button></div>
        <div class="ps-sh-b ps-fams"></div>
      </section>
      <section class="ps-sheet ps-libsheet" aria-label="素材库" hidden>
        <div class="ps-sh-h"><i class="ps-grab" data-close></i><span class="ps-seg ps-tabs" role="tablist"><button data-tab="lib">素材</button><button data-tab="up">上传</button><button data-tab="save">保存</button></span><button class="ps-x" data-close aria-label="收起">✕</button></div>
        <div class="ps-sh-b ps-frame"></div>
      </section>
      <div class="ps-help" hidden><div class="ps-help-c" role="dialog" aria-label="像素工坊说明">${HELP}<button class="btn sm primary" data-close>知道了</button></div></div>
    </div>`);
    const card = CF.$('#modalCard'), modalEl = CF.$('#modal');
    CF.modal.open({ title: '🎨 实验室 · 像素工坊', body, wide: true, onClose: () => { removeEventListener('keydown', key); removeEventListener('keyup', keyUp); ro.disconnect(); bgStage.destroy(); modalEl.classList.remove('ps-on'); } });
    card.classList.add('ps-full'); modalEl.classList.add('ps-on');
    const $ = (s) => body.querySelector(s), $$ = (s) => body.querySelectorAll(s), cvs = $('.ps-cv'), ctx = cvs.getContext('2d'), info = $('.ps-info'), frame = $('.ps-frame');
    const chunkCv = new Map();
    const bgStage = new CF.PixelFX.Stage($('.ps-bg'), { mode: 'full', showChar: false, hero: heroSel, cell: 18, fx: 0.5, fy: 0.5, radius: 40 });

    // ---------- 版面：按自身宽高判断 竖屏 p / 横屏 l / 大屏横屏 l d ----------
    function layout() {
      const w = body.clientWidth, h = body.clientHeight; if (!w || !h) return;
      const land = w > h * 1.05, desk = land && w >= 1000 && h >= 560;
      body.classList.toggle('p', !land); body.classList.toggle('l', land); body.classList.toggle('d', desk);
      if (desk !== wasDesk) { wasDesk = desk; setPal(desk, true); }   // 大屏横屏色板常驻；换回小屏时收起
      draw();
    }
    // 提示写在左上角（画布按钮的位置，2.6 秒后换回），不盖住画布
    let noteT = 0;
    function note(text, kind = '', ms = 2600) {
      clearTimeout(noteT); const n = $('.ps-note'); n.textContent = text; n.className = 'ps-note' + (kind ? ' n-' + kind : ''); body.classList.add('noting');
      noteT = setTimeout(() => body.classList.remove('noting'), ms);
    }
    function legacyAvatar() {
      const a = CF.Save.data.avatar; if (!a || !a.length) return null;
      const d = new Doc(16, 16, 'zy64'), P = CF.Labs.PIX_PAL;
      a.forEach((v, i) => { if (v && P[v] && P[v] !== 'transparent') { const [r, g, b] = [1, 3, 5].map((k) => parseInt(P[v].slice(k, k + 2), 16)); d.set(i % 16, (i / 16) | 0, PAL.nearest(r, g, b, 255, 'zy64')); } });
      d.dirty.clear(); return d;
    }
    // ---------- 视图 ----------
    function size() { const r = cvs.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const W = Math.max(1, Math.round(r.width * dpr)), Hh = Math.max(1, Math.round(r.height * dpr)); if (cvs.width !== W || cvs.height !== Hh) { cvs.width = W; cvs.height = Hh; } return dpr; }
    function fit() {
      const dpr = size(), W = cvs.width / dpr, Hh = cvs.height / dpr;
      const b = doc.inf ? (doc.bounds() || { x0: -16, y0: -16, w: 32, h: 32 }) : { x0: 0, y0: 0, w: doc.w, h: doc.h };
      cam.z = Math.max(0.02, Math.min(48, Math.min(W / b.w, Hh / b.h) * (doc.inf ? 0.8 : 0.94)));
      if (cam.z >= 2) cam.z = Math.floor(cam.z);
      cam.x = b.x0 + b.w / 2 - W / 2 / cam.z; cam.y = b.y0 + b.h / 2 - Hh / 2 / cam.z; draw();
    }
    function chunkCanvas(k) {
      let c = chunkCv.get(k);
      if (!c || doc.dirty.has(k)) {
        if (!c) { c = document.createElement('canvas'); c.width = c.height = CH; chunkCv.set(k, c); }
        const g = c.getContext('2d'), im = g.createImageData(CH, CH), a = doc.ch.get(k);
        if (a) for (let i = 0; i < a.length; i++) if (a[i]) { const [r, gg, b] = rgbOf(a[i]); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
        g.putImageData(im, 0, 0); doc.dirty.delete(k);
      }
      return c;
    }
    let raf = 0, checker = null;
    function draw() { if (!raf) raf = requestAnimationFrame(paint); }
    function paint() {
      raf = 0; if (!cvs.isConnected) return;
      const dpr = size(), W = cvs.width, Hh = cvs.height, z = cam.z * dpr, hero = H.get(heroSel);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, Hh);
      const sx = (x) => (x - cam.x) * z, sy = (y) => (y - cam.y) * z;
      const ax = doc.inf ? 0 : Math.max(0, sx(0)), ay = doc.inf ? 0 : Math.max(0, sy(0)), bx = doc.inf ? W : Math.min(W, sx(doc.w)), by = doc.inf ? Hh : Math.min(Hh, sy(doc.h));
      if (bgMode === 'clear') { // 透明格：专业画板的棋盘底
        ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, W, Hh);
        if (!checker) checker = (() => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#13111f'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#1a1729'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); return ctx.createPattern(c, 'repeat'); })();
        ctx.fillStyle = checker; ctx.fillRect(ax, ay, bx - ax, by - ay);
      } else if (!doc.inf) { // 英雄主题背景从下面透上来；画布范围外压暗
        ctx.fillStyle = 'rgba(5,4,10,.62)';
        ctx.fillRect(0, 0, W, ay); ctx.fillRect(0, by, W, Hh - by); ctx.fillRect(0, ay, ax, by - ay); ctx.fillRect(bx, ay, W - bx, by - ay);
      }
      ctx.imageSmoothingEnabled = false;
      const c0 = Math.floor(cam.x / CH), r0 = Math.floor(cam.y / CH), c1 = Math.floor((cam.x + W / z) / CH), r1 = Math.floor((cam.y + Hh / z) / CH);
      // 缩得很小、一屏要画几百块时（4K 大图），改画一张缩略层（最长边 ≤ 1024），放大回来再逐块画
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > 300 && doc.ch.size > 300) { const o = overview(); if (o) { ctx.imageSmoothingEnabled = z * o.f < 1; ctx.drawImage(o.c, sx(o.x0), sy(o.y0), o.ow * o.f * z, o.oh * o.f * z); ctx.imageSmoothingEnabled = false; } }
      else for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { const k = cx + ',' + cy; if (!doc.ch.has(k) && !chunkCv.has(k)) continue; ctx.drawImage(chunkCanvas(k), sx(cx * CH), sy(cy * CH), CH * z, CH * z); }
      if (z >= 8 * dpr) { // 格线
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = Math.ceil(cam.x); x <= cam.x + W / z; x++) { if (!doc.inf && (x < 0 || x > doc.w)) continue; const X = Math.round(sx(x)) + 0.5; ctx.moveTo(X, ay); ctx.lineTo(X, by); }
        for (let y = Math.ceil(cam.y); y <= cam.y + Hh / z; y++) { if (!doc.inf && (y < 0 || y > doc.h)) continue; const Y = Math.round(sy(y)) + 0.5; ctx.moveTo(ax, Y); ctx.lineTo(bx, Y); }
        ctx.stroke();
      }
      if (!doc.inf) { ctx.strokeStyle = hero.pal.glow; ctx.lineWidth = 2; ctx.strokeRect(sx(0) - 1, sy(0) - 1, doc.w * z + 2, doc.h * z + 2); }
      if (hover && tool !== 'hand') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(sx(hover[0]) + 0.75, sy(hover[1]) + 0.75, z - 1.5, z - 1.5); }
      info.textContent = `${doc.inf ? '无限' : doc.w + '×' + doc.h} · ${Math.round(cam.z * 100) / 100}×${hover ? ' · ' + hover[0] + ',' + hover[1] : ''}`;
    }
    function overview() {
      const rect = doc.inf ? doc.chunkBounds() : { x0: 0, y0: 0, w: doc.w, h: doc.h }; if (!rect) return null;
      let f = 1; while (Math.max(rect.w, rect.h) / f > 1024 && f < 32) f *= 2;
      if (!ov || ov.f !== f || ov.x0 !== rect.x0 || ov.y0 !== rect.y0 || ov.w !== rect.w || ov.h !== rect.h) {
        const ow = Math.ceil(rect.w / f), oh = Math.ceil(rect.h / f), c = document.createElement('canvas'); c.width = ow; c.height = oh; const g = c.getContext('2d');
        ov = Object.assign({}, rect, { f, c, g, ow, oh, im: g.createImageData(ow, oh), rgb: [] }); doc.odirty = new Set(doc.ch.keys());
      }
      if (doc.odirty.size) {
        const D = ov.im.data, f2 = ov.f;
        doc.odirty.forEach((k) => { const [cx, cy] = k.split(',').map(Number), a = doc.ch.get(k), X0 = cx * CH - ov.x0, Y0 = cy * CH - ov.y0;
          for (let ly = 0; ly < CH; ly += f2) { const oy = (Y0 + ly) / f2; if (oy < 0 || oy >= ov.oh) continue; for (let lx = 0; lx < CH; lx += f2) { const ox = (X0 + lx) / f2; if (ox < 0 || ox >= ov.ow) continue; const v = a ? a[ly * CH + lx] : 0, o = (oy * ov.ow + ox) * 4; if (v) { const c3 = v > 255 ? tcRgb(v) : ov.rgb[v] || (ov.rgb[v] = PAL.rgb(v)); D[o] = c3[0]; D[o + 1] = c3[1]; D[o + 2] = c3[2]; D[o + 3] = 255; } else D[o + 3] = 0; } } });
        doc.odirty.clear(); ov.g.putImageData(ov.im, 0, 0);
      }
      return ov;
    }
    const cloneMap = (m) => new Map([...m].map(([k, a]) => [k, a.slice()]));
    const cell = (e) => { const r = cvs.getBoundingClientRect(); return [Math.floor(cam.x + (e.clientX - r.left) / cam.z), Math.floor(cam.y + (e.clientY - r.top) / cam.z)]; };
    function zoomAt(f, cxs, cys) {
      const r = cvs.getBoundingClientRect(), mx = cxs - r.left, my = cys - r.top, wx = cam.x + mx / cam.z, wy = cam.y + my / cam.z;
      cam.z = Math.max(0.02, Math.min(64, cam.z * f)); cam.x = wx - mx / cam.z; cam.y = wy - my / cam.z; draw();
    }
    // ---------- 画 ----------
    function put(x, y, v) { const o = doc.set(x, y, v); if (o < 0 || o === v) return; const k = x + ',' + y; if (!stroke.has(k)) stroke.set(k, [o, v]); else stroke.get(k)[1] = v; }
    function line(a, b, v) { let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx2 = x0 < x1 ? 1 : -1, sy2 = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { put(x0, y0, v); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx2; } if (e2 <= dx) { e += dx; y0 += sy2; } } }
    function flood(x, y, v) {
      const from = doc.get(x, y); if (from === v || !doc.inside(x, y)) return;
      let n = 0;
      if (!doc.inf) { // 固定画布：用一张标记表，4K 也能填（一次最多 30 万格，超过的再点一下接着填）
        const W = doc.w, Hh = doc.h, CAP = 300000, seen = new Uint8Array(W * Hh), q = [y * W + x]; seen[y * W + x] = 1;
        while (q.length && n < CAP) { const i = q.pop(), px = i % W, py = (i - px) / W; if (doc.get(px, py) !== from) continue; put(px, py, v); n++;
          if (px > 0 && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); } if (px < W - 1 && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
          if (py > 0 && !seen[i - W]) { seen[i - W] = 1; q.push(i - W); } if (py < Hh - 1 && !seen[i + W]) { seen[i + W] = 1; q.push(i + W); } }
        if (n >= CAP) note('区域太大：这次填了 30 万格，再点一下接着填');
        return;
      }
      const b = (() => { const bb = doc.bounds() || { x0: x, y0: y, x1: x, y1: y }; return { x0: Math.min(bb.x0, x) - 32, y0: Math.min(bb.y0, y) - 32, x1: Math.max(bb.x1, x) + 32, y1: Math.max(bb.y1, y) + 32 }; })();
      const q = [[x, y]], seen = new Set();
      while (q.length && n < 80000) { const [px, py] = q.pop(), k = px + ',' + py; if (seen.has(k) || px < b.x0 || py < b.y0 || px > b.x1 || py > b.y1 || doc.get(px, py) !== from) continue; seen.add(k); put(px, py, v); n++; q.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); }
    }
    function commit() { if (stroke && stroke.size) { undo.push(stroke); if (undo.length > UNDO_MAX) undo.shift(); redo = []; autosave(); } stroke = null; undoUi(); }
    function applyPatch(p, which) {
      if (p.snap) { // 整张图的操作（清空、换色卡）记的是前后两份快照
        doc.ch = cloneMap(p.snap[which]); if (p.pal) doc.pal = p.pal[which]; doc.touchAll(); chunkCv.clear(); ov = null;
        fixCol(); palSeg(); fams(); draw(); autosave(); undoUi(); return;
      }
      let hi = 0; p.forEach((o2, k) => { const [x, y] = k.split(',').map(Number); doc.set(x, y, o2[which]); if (o2[which] > hi) hi = o2[which]; });
      if (!isTC(doc.pal) && hi > PAL.size(doc.pal)) { doc.pal = hi > 255 ? TC : hi > 64 ? 'zy256' : 'zy64'; palSeg(); fams(); }
      draw(); autosave(); undoUi();
    }
    function undoUi() { const r = $('.ps-redo'); if (r) r.hidden = !redo.length; }
    let saveT = 0;
    function autosave() {
      if (loading) return; clearTimeout(saveT); const big = doc.big();
      saveT = setTimeout(() => {
        doc.hero = heroSel;
        if (!big) { store().last = doc.pack(); CF.Save.save(); return; }
        if (!PixDB.ok) return note('这台设备不能保存大图（浏览器数据库不可用）', 'bad');
        const d = doc; PixDB.put('last', d.raw()).then(() => { store().last = { big: 'last', w: d.w, h: d.h, pal: d.pal, hero: d.hero }; CF.Save.save(); }).catch(() => note('大图没存进去：设备空间可能不够', 'bad'));
      }, big ? 2500 : 600);
    }
    // 指针：一指画 / 两指缩放移动 / 两指轻点撤销、三指轻点重做 / 右键、空格、「移动」拖动画布
    const ptrs = new Map(); let pan = null, gest = null, last2 = null, space = false, multi = null;
    cvs.addEventListener('contextmenu', (e) => e.preventDefault());
    cvs.addEventListener('pointerdown', (e) => {
      if (closeFloating()) return;   // 抽屉 / 弹层开着时，点画布先收起，不落笔
      try { cvs.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ } ptrs.set(e.pointerId, [e.clientX, e.clientY]); CF.Audio.unlock();
      if (ptrs.size >= 2) {
        if (!multi) multi = { t: performance.now(), n: 0, moved: 0, z: cam.z }; multi.n = Math.max(multi.n, ptrs.size);
        if (stroke) { applyPatch(stroke, 0); stroke = null; }
        const [a, b] = [...ptrs.values()]; gest = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; return;
      }
      if (e.button === 2 || e.button === 1 || tool === 'hand' || space) { pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; return; }
      const c = cell(e);
      if (tool === 'pick') { const v = doc.get(c[0], c[1]); if (v) { setCol(v); setTool('pen'); note(`吸到 ${nameOf(v)} ${colorOf(v)}`); } return; }
      stroke = new Map();
      if (tool === 'fill') { flood(c[0], c[1], col); commit(); draw(); return; }
      put(c[0], c[1], tool === 'erase' ? 0 : col); last2 = c; draw();
    });
    cvs.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) { const p0 = ptrs.get(e.pointerId); if (multi) multi.moved += Math.hypot(e.clientX - p0[0], e.clientY - p0[1]); ptrs.set(e.pointerId, [e.clientX, e.clientY]); }
      if (gest && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; cam.x -= (m[0] - gest.m[0]) / cam.z; cam.y -= (m[1] - gest.m[1]) / cam.z; zoomAt(d / (gest.d || d), m[0], m[1]); gest = { d, m }; return; }
      if (pan) { cam.x = pan.cx - (e.clientX - pan.x) / cam.z; cam.y = pan.cy - (e.clientY - pan.y) / cam.z; draw(); return; }
      if (multi) return;
      const c = cell(e); hover = e.pointerType === 'mouse' ? c : null;
      if (stroke && last2 && tool !== 'fill') { line(last2, c, tool === 'erase' ? 0 : col); last2 = c; }
      draw();
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) gest = null;
      if (!ptrs.size) {
        if (multi) { const quick = performance.now() - multi.t < 320 && multi.moved < 24 && Math.abs(cam.z / multi.z - 1) < 0.08; if (quick) act(multi.n >= 3 ? 'redo' : 'undo', true); multi = null; }
        pan = null; last2 = null; commit();
      }
    };
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('pointerleave', () => { hover = null; draw(); });
    cvs.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); else { cam.x += e.deltaX / cam.z; draw(); } }, { passive: false });
    function key(e) {
      if (!body.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); act(e.shiftKey ? 'redo' : 'undo'); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); act('redo'); return; }
      if (k === ' ') { space = true; e.preventDefault(); return; }
      if (k === 'p') { setPal(!palOpen); return; }
      const t = { b: 'pen', e: 'erase', g: 'fill', i: 'pick', h: 'hand' }[k]; if (t) setTool(t);
    }
    function keyUp(e) { if (e.key === ' ') space = false; }
    addEventListener('keydown', key); addEventListener('keyup', keyUp);
    const ro = new ResizeObserver(() => layout()); ro.observe(body);

    // ---------- 底栏 / 左侧竖条：画笔、橡皮、调色盘、撤销 ----------
    function setTool(t) {
      tool = t; if (t !== 'erase') brush = t;
      const b = BRUSH.find((x) => x[0] === brush);
      $('.ps-dki').innerHTML = ic(b[2]); $('.ps-dkl').textContent = b[1];
      $('[data-dk="brush"]').classList.toggle('on', tool === brush); $('[data-dk="erase"]').classList.toggle('on', tool === 'erase');
      $$('.ps-pop-brush [data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === brush));
      cvs.style.cursor = t === 'hand' ? 'grab' : 'crosshair';
    }
    function act(a, quiet) {
      if (a === 'undo') { const p = undo.pop(); if (p) { applyPatch(p, 0); redo.push(p); undoUi(); if (quiet) note('撤销'); } else if (!quiet) note('没有可以撤销的了'); }
      else if (a === 'redo') { const p = redo.pop(); if (p) { applyPatch(p, 1); undo.push(p); undoUi(); if (quiet) note('重做'); } else if (!quiet) note('没有可以重做的了'); }
      else if (a === 'in') { const r = cvs.getBoundingClientRect(); zoomAt(1.5, r.left + r.width / 2, r.top + r.height / 2); }
      else if (a === 'out') { const r = cvs.getBoundingClientRect(); zoomAt(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); }
      else if (a === 'fit') fit();
      else if (a === 'clear') { if (!doc.ch.size) return note('画布本来就是空的'); undo.push({ snap: [doc.ch, new Map()] }); if (undo.length > UNDO_MAX) undo.shift(); redo = []; doc.ch = new Map(); chunkCv.clear(); ov = null; doc.touchAll(); draw(); autosave(); undoUi(); note('已清空（↶ 可撤销）'); }
    }
    // 弹层（画笔组、画布）和抽屉（调色盘、素材库）
    function pop(name, anchor) {
      const el = $('.ps-pop-' + name), open = el.hidden; closePops(); if (!open) return;
      el.hidden = false; const r = anchor.getBoundingClientRect(), R = body.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight;
      let x, y;
      if (name === 'brush' && body.classList.contains('l')) { x = r.right - R.left + 8; y = Math.min(R.height - ph - 8, Math.max(8, r.top - R.top + r.height / 2 - ph / 2)); }
      else if (name === 'brush') { x = Math.min(R.width - pw - 8, Math.max(8, r.left - R.left + r.width / 2 - pw / 2)); y = r.top - R.top - ph - 8; }
      else { x = Math.min(R.width - pw - 8, Math.max(8, r.left - R.left)); y = r.bottom - R.top + 6; }
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }
    function closePops() { let any = false; $$('.ps-pop').forEach((p) => { if (!p.hidden) any = true; p.hidden = true; }); return any; }
    function closeFloating() {
      let any = closePops();
      const help = $('.ps-help'); if (!help.hidden) { help.hidden = true; any = true; }
      if (sheet) { openSheet(null); any = true; }
      if (palOpen && !body.classList.contains('d')) { setPal(false); any = true; }
      return any;
    }
    function setPal(on, quiet) {
      palOpen = on; if (on && sheet && !body.classList.contains('d')) openSheet(null);
      $('.ps-palsheet').hidden = !on; $('[data-dk="pal"]').classList.toggle('on', on);
      if (on) { closePops(); fams(); } if (!quiet) CF.Audio.sfx('click');
    }
    function openSheet(t) {
      sheet = t; const el = $('.ps-libsheet');
      if (!t) { el.hidden = true; $$('[data-sheet]').forEach((b) => b.classList.remove('on')); return; }
      closePops(); if (palOpen && !body.classList.contains('d')) setPal(false, true);
      el.hidden = false; $$('[data-sheet]').forEach((b) => b.classList.toggle('on', b.dataset.sheet === t)); tabs(t);
    }
    body.addEventListener('click', (e) => {
      const t = e.target.closest('button,[data-close],[data-help]'); if (!t || !body.contains(t)) return;
      if (t.matches('[data-close]')) { CF.Audio.sfx('click'); const s = t.closest('.ps-sheet,.ps-help'); if (s && s.classList.contains('ps-palsheet')) setPal(false, true); else if (s && s.classList.contains('ps-libsheet')) openSheet(null); else if (s) s.hidden = true; return; }
      if (t.matches('[data-help]')) { CF.Audio.sfx('click'); closeFloating(); $('.ps-help').hidden = false; return; }
      if (t.dataset.pop) { CF.Audio.sfx('click'); pop(t.dataset.pop, t); return; }
      if (t.dataset.sheet) { CF.Audio.sfx('click'); openSheet(sheet === t.dataset.sheet ? null : t.dataset.sheet); return; }
      if (t.dataset.tool) { CF.Audio.sfx('click'); setTool(t.dataset.tool); closePops(); return; }
      if (t.dataset.act) { CF.Audio.sfx('click'); act(t.dataset.act); return; }
      if (t.dataset.bg) { CF.Audio.sfx('click'); setBg(t.dataset.bg); return; }
      const dk = t.dataset.dk; if (!dk) return;
      CF.Audio.sfx('click');
      if (dk === 'brush') { if (tool === brush) pop('brush', t); else { closePops(); setTool(brush); } }
      else if (dk === 'erase') { closePops(); setTool('erase'); }
      else if (dk === 'pal') setPal(!palOpen);
      else if (dk === 'undo') { if (longHit) { longHit = false; return; } act(e.target.closest('.ps-redo') ? 'redo' : 'undo'); }
    });
    // 长按「撤销」= 重做
    let longT = 0, longHit = false; const ub = $('[data-dk="undo"]');
    ub.addEventListener('pointerdown', () => { longHit = false; clearTimeout(longT); longT = setTimeout(() => { longHit = true; act('redo', true); }, 520); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => ub.addEventListener(ev, () => clearTimeout(longT)));
    function setBg(m) {
      bgMode = m; st.bg = m; bgStage.enabled = m === 'hero'; bgStage.o.hero = heroSel;
      $('.ps-bg').style.visibility = m === 'hero' ? '' : 'hidden';
      $$('[data-bg]').forEach((b) => b.classList.toggle('on', b.dataset.bg === m)); draw(); CF.Save.save();
    }
    function setHero(id) { heroSel = id; bgStage.o.hero = id; doc.hero = id; draw(); }
    function setDoc(d, msg) {
      doc = d; chunkCv.clear(); ov = null; undo = []; redo = []; undoUi(); if (d.hero) setHero(d.hero);
      $$('[data-size]').forEach((b) => b.classList.toggle('on', doc.inf ? b.dataset.size === '0' : +b.dataset.size === doc.w && doc.w === doc.h));
      palSeg(); fams(); fit(); autosave(); if (msg) note(msg);
    }
    $$('[data-size]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); CF.Audio.sfx('click'); const n = +b.dataset.size; if (n === doc.w && (n ? !doc.inf : doc.inf)) return;
      // 换尺寸：把现在的画按左上角原样搬进新画布（超出的部分裁掉；换成无限画布时什么都不丢）
      if (busy) return;
      const nd = new Doc(n, n, doc.pal); nd.hero = doc.hero;
      doc.ch.forEach((c, k) => { // 按块搬：整块在里面直接搬，压在边上的块逐格裁（4K 也是一眨眼）
        const [cx, cy] = k.split(',').map(Number), X = cx * CH, Y = cy * CH;
        if (n && (X >= n || Y >= n || X + CH <= 0 || Y + CH <= 0)) return;
        if (!n || (X >= 0 && Y >= 0 && X + CH <= n && Y + CH <= n)) { nd.ch.set(k, c); return; }
        const a = nd.arr(); for (let i = 0; i < c.length; i++) { const x = X + (i % CH), y = Y + ((i / CH) | 0); if (x >= 0 && y >= 0 && x < n && y < n) a[i] = c[i]; } nd.ch.set(k, a);
      });
      setDoc(nd, n ? `画布 ${n}×${n}` : '无限画布：往哪边画都有地方');
    }));
    // ---------- 调色盘（色系分类：灰阶 → 色环，每行一条从暗到亮的色阶） ----------
    function palSeg() { $$('[data-pal]').forEach((x) => x.classList.toggle('on', x.dataset.pal === doc.pal)); }
    $$('[data-pal]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); CF.Audio.sfx('click'); const to = b.dataset.pal, from = doc.pal; if (from === to || busy) return;
      // 换到更小的色卡：画里超出的颜色换成新色卡里最接近的（整张图前后快照记进撤销，点撤销能换回来）
      // 换色卡：真彩 ↔ 色卡、大色卡 → 小色卡时，画里的颜色换成目标里最接近的（真彩是把编号还原成颜色）；整张图快照进撤销
      const used = [...doc.colors()], conv = new Map(), toTC = isTC(to), n = palSize(to);
      used.forEach((v) => { if (toTC) { if (v <= 255) conv.set(v, hexToTc(PAL.color(v))); } else if (v > n) { const [r, g, bb] = rgbOf(v); conv.set(v, PAL.lut(to)(r, g, bb)); } });
      if (conv.size || isTC(from) !== toTC) {
        const before = cloneMap(doc.ch); let moved = 0; doc.pal = to; const out = new Map();
        before.forEach((a, k) => { const b2 = doc.arr(); for (let i = 0; i < a.length; i++) { const v = a[i]; if (!v) continue; const w = conv.has(v) ? conv.get(v) : v; if (w !== v) moved++; b2[i] = w; } out.set(k, b2); });
        doc.ch = out; undo.push({ snap: [before, cloneMap(out)], pal: [from, to] }); if (undo.length > UNDO_MAX) undo.shift(); redo = []; doc.touchAll(); chunkCv.clear(); ov = null; undoUi();
        if (moved && !toTC) note(`${moved} 格换成了${palName(to)}里最接近的颜色（可撤销）`); else if (toTC) note('已切到真彩：1677 万色，用调色盘里的取色器选任意颜色');
      } else doc.pal = to;
      fixCol();
      palSeg(); fams(); cur(); draw(); autosave();
    }));
    function fixCol() { if (isTC(doc.pal)) { if (col <= 255) col = hexToTc(PAL.color(col)); } else if (col > PAL.size(doc.pal)) col = col > 255 ? PAL.lut(doc.pal)(...tcRgb(col)) : 14; }
    function swatch(i) { const v = isTC(doc.pal) && i <= 255 ? hexToTc(PAL.color(i)) : i; return `<button class="ps-c${v === col ? ' on' : ''}" data-c="${v}" style="--c:${colorOf(v)}" title="${CF.esc(nameOf(i))} ${colorOf(v)}" aria-label="${CF.esc(nameOf(i))}"></button>`; }
    function fams() {
      const tc = isTC(doc.pal), box = $('.ps-fams'), rec = store().recent.filter((i) => (tc ? i > 255 : i <= PAL.size(doc.pal))).slice(0, 9);
      box.innerHTML = (rec.length ? `<div class="ps-fam ps-recent"><span class="ps-fl">最近</span><div class="ps-ramp">${rec.map(swatch).join('')}</div></div>` : '')
        + (tc ? `<div class="ps-fam ps-tcrow"><span class="ps-fl">任意色<small>1677 万</small></span><div class="ps-tcpick"><input type="color" class="ps-tc" value="${colorOf(col > 255 ? col : hexToTc(PAL.color(col)))}" aria-label="任意颜色"><code>${colorOf(col)}</code><span class="ps-hint">真彩不受色卡限制；下面的造月色可以当快捷色</span></div></div>` : '') + PAL.families(tc ? 'zy256' : doc.pal).map(([f, l]) => `<div class="ps-fam"><span class="ps-fl">${f}<small>${l.length}</small></span><div class="ps-ramp">${l.map(swatch).join('')}</div></div>`).join('');
      const tcIn = box.querySelector('.ps-tc'); if (tcIn) tcIn.oninput = () => { setCol(hexToTc(tcIn.value)); tcIn.nextElementSibling.textContent = tcIn.value; if (tool === 'erase' || tool === 'pick' || tool === 'hand') setTool('pen'); };
      box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); setCol(+b.dataset.c); if (tool === 'erase' || tool === 'pick' || tool === 'hand') setTool('pen'); if (!body.classList.contains('d')) setPal(false, true); }));
      cur();
    }
    function setCol(v) {
      col = v; const r = store().recent; const i = r.indexOf(v); if (i >= 0) r.splice(i, 1); r.unshift(v); r.length = Math.min(r.length, 12);
      $$('.ps-fams [data-c]').forEach((b) => b.classList.toggle('on', +b.dataset.c === v)); cur();
    }
    function cur() { const c = colorOf(col); $('.ps-cur').innerHTML = `<i style="background:${c}"></i>${CF.esc(nameOf(col))} <code>${c}</code>`; $('.ps-dot').style.background = c; }
    // ---------- 素材库抽屉：素材 / 上传 / 保存 ----------
    function tabs(t) { tab = t; $$('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); }); ({ lib: libPane, up: upPane, save: savePane })[t](); }
    $$('[data-tab]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); CF.Audio.sfx('click'); openSheet(b.dataset.tab); }));
    function libPane() {
      const L = library(), cats = Object.keys(L);
      frame.innerHTML = `<div class="ps-chips">${cats.map((c) => `<button data-cat="${c}" class="${c === libCat ? 'on' : ''}">${c}<small>${L[c].length}</small></button>`).join('')}</div><div class="ps-lib"></div>`;
      const grid = frame.querySelector('.ps-lib');
      if (!L[libCat].length) grid.innerHTML = `<p class="ps-empty">${libCat === '我的' ? '还没有作品：在「保存」里点「存为作品」。' : '这一类还没有素材。'}</p>`;
      L[libCat].forEach((it) => {
        const hh = it.hero ? H.get(it.hero) : it.fx ? H.get(it.fx) : null;
        const b = CF.h(`<button class="ps-tile" title="在画布里打开：${CF.esc(it.name)}"><span class="ps-th"${hh ? ` style="background:linear-gradient(160deg,${hh.pal.bg[0]},${hh.pal.bg[1]} 70%,${hh.pal.bg[2]})"` : ''}></span><b>${CF.esc(it.name)}</b></button>`);
        let img = null; try { img = it.make(); } catch (e) { img = null; }
        if (!img) return;
        const th = b.querySelector('.ps-th'); img.classList.add('ps-thc'); th.appendChild(img);
        b.onclick = () => { CF.Audio.sfx('click'); openAsset(it, img); };
        grid.appendChild(b);
      });
      frame.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); CF.Audio.sfx('click'); libCat = b.dataset.cat; libPane(); }));
    }
    function openAsset(it, img) {
      if (it.work !== undefined) {
        const w = store().works[it.work]; openSheet(null);
        if (!w.big) { setDoc(Doc.unpack(w.doc), `打开了「${it.name}」`); return; }
        note('正在载入大图…', '', 30000); PixDB.get(w.big).then((raw) => { if (raw) setDoc(Doc.fromRaw(raw), `打开了「${it.name}」（${raw.w}×${raw.h}）`); else note('这幅大图找不到了', 'bad'); }).catch(() => note('大图读取失败', 'bad'));
        return;
      }
      const n = Math.max(img.width, img.height), s = n <= 16 ? 16 : n <= 64 ? 64 : 256;
      const d = fromImage(img, s, s, 'zy64', false, null); d.src = it; d.hero = it.hero || it.fx || heroSel;
      setDoc(d, `已打开「${it.name}」（${s}×${s}，造月 64 色）`); openSheet(null);
    }
    const RES = [['canvas', '跟随画布'], ['256', '256'], ['512', '512'], ['1024', '1024'], ['2048', '2K（2048）'], ['4096', '4K（最长边 4096）']];
    function upPane() {
      const S = store(), res = S.upRes || 'canvas', upal = S.upPal || doc.pal;
      frame.innerHTML = `<div class="ps-up">
        <div class="ps-r"><label class="btn primary ps-file">选择图片<input type="file" accept="image/*" aria-label="选择图片"></label>
          <label class="ps-ck">分辨率 <select class="ps-res" aria-label="分辨率">${RES.map(([v, n]) => `<option value="${v}" ${v === res ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="ps-ck">色卡 <select class="ps-upal" aria-label="换成哪套色卡">${PAL.sets().concat([TC]).map((k) => `<option value="${k}" ${k === upal ? 'selected' : ''}>${palName(k)}</option>`).join('')}</select></label></div>
        <label class="ps-ck"><input type="checkbox" data-dither ${S.upDither ? 'checked' : ''}> 抖动（照片更细腻；像素画关掉更干净）</label>
        <p class="ps-hint">「跟随画布」把图片缩进当前画布（无限画布按最长边 128 格）；选了分辨率就按图片比例新建画布，最高 <b>4K（最长边 4096 像素，3840×2160 的 4K 照片按原尺寸换色）</b>，比原图大时不放大。每个像素换成所选色卡里最接近的颜色，<b>造月 256 色</b>是索引色的行业上限（GIF / PNG-8 / 专业像素软件的索引模式都是 256）；选<b>真彩</b>则原样保留图片的颜色（1677 万色，不受色卡限制，不抖动）。分辨率越高越慢，4K 约需几秒；超过 512×512 的大图保存在本机的浏览器数据库里。</p>
        <div class="ps-prev"></div></div>`;
      const inp = frame.querySelector('input[type=file]'), sel = frame.querySelector('.ps-res'), psel = frame.querySelector('.ps-upal'), dck = frame.querySelector('[data-dither]');
      sel.onchange = () => { S.upRes = sel.value; CF.Save.save(); }; psel.onchange = () => { S.upPal = psel.value; CF.Save.save(); }; dck.onchange = () => { S.upDither = dck.checked; CF.Save.save(); };
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f || busy) return;
        if (f.size > 60 * 1024 * 1024) return note('图片太大（上限 60MB）', 'bad');
        const url = URL.createObjectURL(f), im = new Image();
        im.onload = async () => {
          const r = sel.value, pal = psel.value, iw = im.naturalWidth, ih = im.naturalHeight; let W, Hh, rect, intoInf = false;
          if (r === 'canvas' && doc.inf) { const n = 128, k = n / Math.max(iw, ih); W = Math.max(1, Math.round(iw * k)); Hh = Math.max(1, Math.round(ih * k)); intoInf = true; }
          else if (r === 'canvas') { W = doc.w; Hh = doc.h; const k = Math.min(W / iw, Hh / ih), dw = Math.max(1, Math.round(iw * k)), dh = Math.max(1, Math.round(ih * k)); rect = { x: Math.floor((W - dw) / 2), y: Math.floor((Hh - dh) / 2), w: dw, h: dh }; }
          else { const L = Math.min(+r, Math.max(iw, ih)), k = L / Math.max(iw, ih); W = Math.max(1, Math.round(iw * k)); Hh = Math.max(1, Math.round(ih * k)); }
          busy = true; inp.disabled = true; const t0 = performance.now();
          try {
            const d = await convertImage(im, W, Hh, pal, dck.checked, rect, (p) => note(`换成造月色中 ${Math.round(p * 100)}%（${W}×${Hh}）`, '', 600000));
            d.hero = heroSel;
            if (intoInf) { const nd = new Doc(0, 0, pal); nd.hero = heroSel; d.ch.forEach((c, k) => { const [cx, cy] = k.split(',').map(Number); for (let i = 0; i < c.length; i++) if (c[i]) nd.set(cx * CH + (i % CH) - (W >> 1), cy * CH + ((i / CH) | 0) - (Hh >> 1), c[i]); }); nd.dirty.clear(); setDoc(nd); } else setDoc(d);
            const used = doc.colors().size, sec = ((performance.now() - t0) / 1000).toFixed(1);
            frame.querySelector('.ps-prev').innerHTML = `<p class="ps-ok">已换成${palName(pal)}：${W}×${Hh}，用了 ${used} 种颜色，耗时 ${sec} 秒。可以接着改，或者去「保存」。</p>`;
            note(`已换成造月色：${W}×${Hh}，${used} 种颜色`, 'gold'); CF.Audio.sfx('correct');
          } catch (e) { note('换色失败：图片可能太大，换一张或选低一点的分辨率', 'bad'); }
          busy = false; inp.disabled = false; URL.revokeObjectURL(url);
        };
        im.onerror = () => { URL.revokeObjectURL(url); note('这张图片读不出来，换一张试试', 'bad'); };
        im.src = url;
      };
    }
    function savePane() {
      const n = doc.colors().size, s = n >= 4 ? 3 : n >= 3 ? 2 : n ? 1 : 0;
      frame.innerHTML = `<div class="ps-save">
        <p class="ps-hint">用了 <b>${n}</b> 种颜色 <span class="ps-st">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span>（4 种以上得 3 星）</p>
        <div class="ps-r"><input class="ps-name" maxlength="16" placeholder="作品名字" value="${CF.esc((doc.src && doc.src.name) || '')}" aria-label="作品名字"><button class="btn sm" data-s="work">存为作品</button></div>
        <div class="ps-r"><button class="btn sm" data-s="avatar">设为指挥官头像</button><span class="ps-hint">战场通讯框里显示，缩成 16×16</span></div>
        <div class="ps-r"><button class="btn sm" data-s="png">导出 PNG</button><span class="ps-hint">放大成清晰的像素图，存到手机或电脑</span></div>
        <div class="ps-r"><select class="ps-hero" aria-label="选择英雄">${H.list.map((h) => `<option value="${h.id}" ${h.id === heroSel ? 'selected' : ''}>${h.name}${CF.Skins && CF.Skins.equipped(h.id) !== 'classic' ? ' ·皮肤' : ''}${store().fx[h.id] ? ' ·特效' : ''}</option>`).join('')}</select><span class="ps-hint">画布背景也换成这位英雄的主题</span></div>
        <div class="ps-r"><button class="btn sm" data-s="skin">存进衣柜并穿上</button><button class="btn sm" data-s="fx">设为技能特效</button><button class="btn sm ghost" data-s="reset">恢复这位英雄默认</button></div>
        <p class="ps-hint">英雄外观：64×64，先在「素材 · 英雄」里打开这位英雄的样板再改，位置最准；每位英雄的衣柜最多放 ${CF.Skins ? CF.Skins.MAX_MINE : 6} 套，在商城「皮肤」或英雄档案里换着穿。技能特效：放技能时在落点炸开、舞台上飘出来的图案，16×16 最合适。</p>
      </div>`;
      frame.querySelector('.ps-hero').onchange = (e) => { setHero(e.target.value); autosave(); };
      frame.querySelectorAll('[data-s]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); CF.Audio.sfx('click'); save(b.dataset.s); }));
    }
    function stars() { const n = doc.colors().size; return n >= 4 ? 3 : n >= 3 ? 2 : 1; }
    function scaled(w, h) { // 按内容范围等比缩进 w×h（取最近的格子）
      const b = doc.inf ? doc.bounds() : { x0: 0, y0: 0, w: doc.w, h: doc.h }; const d = new Doc(w, h, doc.pal); if (!b) return d;
      const s = Math.max(b.w / w, b.h / h, doc.inf ? 0 : 1) || 1, ox = Math.floor((w - b.w / s) / 2), oy = Math.floor((h - b.h / s) / 2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = doc.get(b.x0 + Math.floor((x - ox) * s), b.y0 + Math.floor((y - oy) * s)); if (x - ox >= 0 && y - oy >= 0 && (x - ox) * s < b.w && (y - oy) * s < b.h && v) d.set(x, y, v); }
      d.dirty.clear(); return d;
    }
    function exportPng() {
      const b = doc.inf ? doc.bounds() : { x0: 0, y0: 0, w: doc.w, h: doc.h };
      if (!b || !doc.colors().size) { CF.Audio.sfx('error'); return note('画布是空的，先画点什么吧', 'bad'); }
      if (doc.big()) note('正在导出大图…', '', 20000);
      const k = Math.max(1, Math.floor(512 / Math.max(b.w, b.h))), c = doc.toCanvas(k, b);
      // 文件名只用英文和数字：有些系统会把中文文件名换成「download」
      const t = new Date(), pad = (v) => String(v).padStart(2, '0'), file = `zaoyue-pixel-${b.w}x${b.h}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}.png`;
      if (window.AndroidFiles && typeof AndroidFiles.save === 'function') AndroidFiles.save(c.toDataURL('image/png').split(',')[1], file);   // 安卓壳：系统「另存为」
      else c.toBlob((bl) => { const u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png');
      CF.Audio.sfx('correct'); note(`已导出 PNG（${b.w * k}×${b.h * k}）`, 'gold');
    }
    function save(kind) {
      if (kind === 'png') return exportPng();
      const S = store(), n = doc.colors().size, h = H.get(heroSel);
      if (kind !== 'reset' && n < 2) { CF.Audio.sfx('error'); return note('至少用 2 种颜色画点什么吧', 'bad'); }
      if (kind === 'work') {
        const name = (frame.querySelector('.ps-name').value || '').trim() || '作品 ' + (S.works.length + 1), t = Date.now(), entry = { name, t };
        const trim = () => S.works.splice(24).forEach((w) => w.big && PixDB.del(w.big).catch(() => {}));
        if (doc.big()) { // 大图：本体进 IndexedDB，存档里只放名字和一张 64×64 缩略图
          if (!PixDB.ok) return note('这台设备不能保存大图', 'bad');
          Object.assign(entry, { big: 'work:' + t, w: doc.w, h: doc.h, thumb: scaled(64, 64).pack() });
          PixDB.put(entry.big, doc.raw()).then(() => { S.works.unshift(entry); trim(); CF.Save.save(); note(`已存为作品「${name}」（${doc.w}×${doc.h}）`, 'gold'); CF.Audio.sfx('correct'); }).catch(() => note('大图没存进去：设备空间可能不够', 'bad'));
          return;
        }
        entry.doc = doc.pack(); S.works.unshift(entry); trim(); note(`已存为作品「${name}」`, 'gold');
      }
      else if (kind === 'avatar') { CF.Save.data.avatar2 = (doc.w === 16 && !doc.inf ? doc : scaled(16, 16)).pack(); note('已设为指挥官头像', 'gold'); }
      else if (kind === 'skin') { const d = doc.w === SKIN.w && doc.h === SKIN.h && !doc.inf ? doc : scaled(SKIN.w, SKIN.h), nm = (frame.querySelector('.ps-name').value || '').trim(); CF.Skins.addMine(h.id, d.pack(), nm || undefined); note(`${h.name}换上了你画的外观（已存进衣柜）`, 'gold'); }
      else if (kind === 'fx') { const d = doc.inf || doc.w > 64 ? scaled(32, 32) : doc; S.fx[h.id] = d.pack(); cache.clear(); note(`${h.name}的技能特效换成你画的了`, 'gold'); }
      else if (kind === 'reset') { CF.Skins.equip(h.id, 'classic'); delete S.fx[h.id]; cache.clear(); note(`${h.name}换回经典外观和默认特效（衣柜里的保留）`); savePane(); CF.Save.save(); return; }
      CF.Save.save(); CF.Audio.sfx('correct');
      if (kind !== 'work') CF.P.finishLab('pixel', stars());
      if (tab === 'save') savePane();
    }

    setTool('pen'); setBg(bgMode); setDoc(doc); setCol(col);
    if (lastMeta) { note('正在载入上次的大图…', '', 30000); PixDB.get('last').then((raw) => { loading = false; if (raw) setDoc(Doc.fromRaw(raw), `已载入上次的大图（${raw.w}×${raw.h}）`); else note('上次的大图找不到了'); }).catch(() => { loading = false; note('大图读取失败', 'bad'); }); }
    requestAnimationFrame(() => { layout(); fit(); });
  };
})();
