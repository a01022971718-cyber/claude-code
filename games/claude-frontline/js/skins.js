/* 皮肤系统（v9.2，主创要求「真正的皮肤系统」；规则见物品宪法第 7 章、UI 宪法第 27 章 27.7）
 * 每位英雄三类皮肤：
 * - 经典：官方形象，免费。
 * - 炫彩：官方换色皮肤。形象里的每个颜色按规则变换（OKLab 色相 / 饱和 / 明度），再落到「造月 256 色」里最接近的颜色，
 *   所以仍然符合美术用色宪法；动作、乐器、表情和经典完全一样。晶片购买，或英雄星级解锁；不卖真实货币。
 * - 我的外观：像素工坊里自己画的 64×64，每位英雄最多 6 套。
 * 装备后，游戏里所有画这位英雄的地方都换（大厅、战场、像素脉冲舞台、图鉴、商城、英雄档案、英语田园）。 */
(function () {
  const CF = window.CF, H = CF.Heroes, PAL = CF.Palette;
  const TINTS = [
    { id: 'mono', name: '墨韵', price: 600, rar: 'rare', desc: '水墨一样的黑白灰，只留下一点原来的颜色。', f: { c: 0.12 } },
    { id: 'nova', name: '星夜', price: 1200, rar: 'epic', desc: '整套颜色沉进深夜的蓝紫里。', f: { h: 275, k: 0.7, c: 1.05, l: 0.92 } },
    { id: 'neon', name: '霓虹', price: 2000, rar: 'epic', desc: '色相转过半圈、饱和拉满，像夜市的灯牌。', f: { rot: 150, c: 1.3 } },
    { id: 'gold', name: '鎏金', star: 3, rar: 'legend', desc: '英雄升到 3 星自动解锁：整套颜色镀上一层金。', f: { h: 85, k: 0.75, c: 1.1, l: 1.03 } },
  ];
  const MAX_MINE = 6;
  const data = () => { const d = CF.Save.data; d.skins = d.skins || { own: {}, eq: {} }; d.skins.own = d.skins.own || {}; d.skins.eq = d.skins.eq || {}; return d.skins; };
  const pix = () => { const d = CF.Save.data; d.pix = d.pix || { works: [], skins: {}, fx: {} }; d.pix.wardrobe = d.pix.wardrobe || {}; return d.pix; };
  // 迁移：v9 的单件「英雄外观」（pix.skins[英雄]）变成衣柜里的一套「我的外观」，并且照样穿着
  function migrate() {
    const P = pix(); if (!P.skins || !Object.keys(P.skins).length) return;
    Object.keys(P.skins).forEach((h) => { const w = (P.wardrobe[h] = P.wardrobe[h] || []); if (!w.some((x) => x.id === 'my-legacy')) w.unshift({ id: 'my-legacy', name: '我的外观', t: Date.now(), doc: P.skins[h] }); if (!data().eq[h]) data().eq[h] = 'my-legacy'; });
    P.skins = {};
  }

  // ---------- 颜色变换（OKLab） ----------
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const toLab = (r, g, b) => { r = lin(r); g = lin(g); b = lin(b); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
  const toRgb = (L, a, b) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.round(Math.max(0, Math.min(1, delin(Math.max(0, v)))) * 255)); };
  function parse(c) {
    if (c[0] === '#') { const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), null]; }
    const m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/); if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? null : m[4]];
  }
  function tintOne(c, f) {
    const p = parse(c); if (!p) return c;
    let [L, a, b] = toLab(p[0], p[1], p[2]), C = Math.hypot(a, b), h = Math.atan2(b, a);
    const neutral = C < 0.03;
    if (f.rot && !neutral) h += (f.rot * Math.PI) / 180;
    if (f.h !== undefined && !neutral) { const t = (f.h * Math.PI) / 180; let d = t - h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; h += d * f.k; }
    if (f.c) C *= f.c; if (f.l) L = Math.max(0, Math.min(1, L * f.l));
    const [r, g, bb] = toRgb(L, C * Math.cos(h), C * Math.sin(h)), v = PAL.nearest(r, g, bb, 255, 'zy256'), out = PAL.color(v);
    if (p[3] === null) return out; const q = PAL.rgb(v); return `rgba(${q[0]},${q[1]},${q[2]},${p[3]})`;
  }
  const MAPS = {};
  const mapper = (sid) => { if (MAPS[sid]) return MAPS[sid]; const t = TINTS.find((x) => x.id === sid), cache = new Map(); return (MAPS[sid] = (c) => { let v = cache.get(c); if (v === undefined) { v = tintOne(c, t.f); cache.set(c, v); } return v; }); };
  // 画布代理：英雄的画法都是「设 fillStyle → fillRect」，代理在设颜色时换色，动作照常
  const PROX = new WeakMap();
  function tinted(ctx, sid) {
    let m = PROX.get(ctx); if (!m) { m = {}; PROX.set(ctx, m); } if (m[sid]) return m[sid];
    const fn = new Map(), map = mapper(sid);
    return (m[sid] = new Proxy(ctx, {
      get(t, p) { const v = t[p]; if (typeof v !== 'function') return v; let f = fn.get(p); if (!f) { f = v.bind(t); fn.set(p, f); } return f; },
      set(t, p, v) { if ((p === 'fillStyle' || p === 'strokeStyle' || p === 'shadowColor') && typeof v === 'string') v = map(v); t[p] = v; return true; },
    }));
  }

  // ---------- 皮肤清单、拥有、装备 ----------
  const S = (CF.Skins = { TINTS, MAX_MINE });
  const mine = (hid) => { migrate(); return pix().wardrobe[hid] || []; };
  S.list = function (hid) {
    const R = CF.Roster, own = data().own;
    return [{ id: 'classic', name: '经典', kind: 'classic', owned: true, rar: 'common', desc: '官方形象。' }]
      .concat(TINTS.map((t) => ({ id: t.id, name: t.name, kind: 'tint', price: t.price, star: t.star, rar: t.rar, desc: t.desc, owned: !!own[hid + ':' + t.id] || (t.star && R.star(hid) >= t.star) || CF.P.trial() })))
      .concat(mine(hid).map((w) => ({ id: w.id, name: w.name, kind: 'img', owned: true, rar: 'rare', desc: '你在像素工坊里画的外观。' })));
  };
  S.get = (hid, id) => S.list(hid).find((x) => x.id === id) || null;
  S.equipped = function (hid) { migrate(); const id = data().eq[hid] || 'classic', s = S.get(hid, id); return s && s.owned ? id : 'classic'; };
  S.equip = function (hid, id) { const s = S.get(hid, id); if (!s || !s.owned) return false; data().eq[hid] = id; CF.Save.save(); CF.bus && CF.bus.emit('skin:changed', hid); return true; };
  S.buy = function (hid, id) {
    const s = S.get(hid, id); if (!s || s.owned || !s.price) return false;
    const st = CF.City.storage(); if (st.chip < s.price) { CF.Audio.sfx('error'); CF.toast(`晶片不足（需要 ${s.price}）`, 'bad'); return false; }
    st.chip -= s.price; data().own[hid + ':' + id] = true; CF.Save.save(); CF.Audio.sfx('unlock'); return true;
  };
  S.addMine = function (hid, packed, name) {
    const w = (pix().wardrobe[hid] = mine(hid).slice()), eq = S.equipped(hid);
    const id = 'my-' + Date.now(); w.push({ id, name: name || '我的外观 ' + (w.length + 1), t: Date.now(), doc: packed });
    while (w.length > MAX_MINE) { const k = w.findIndex((x) => x.id !== eq); w.splice(k < 0 ? 0 : k, 1); }
    IMG.clear(); data().eq[hid] = id; CF.Save.save(); CF.bus && CF.bus.emit('skin:changed', hid); return id;
  };
  S.removeMine = function (hid, id) { pix().wardrobe[hid] = mine(hid).filter((x) => x.id !== id); if (data().eq[hid] === id) data().eq[hid] = 'classic'; IMG.clear(); CF.Save.save(); };
  // 自绘外观的位图（64×64，英雄按 2 倍精度、原点 12,24，和像素工坊的英雄样板一致）
  const IMG = new Map();
  S.img = function (hid, id) {
    const w = mine(hid).find((x) => x.id === id); if (!w || !CF.PixStudio) return null;
    const key = hid + ':' + id; if (!IMG.has(key)) IMG.set(key, CF.PixStudio.Doc.unpack(w.doc).toCanvas(1, { x0: 0, y0: 0, w: 64, h: 64 }));
    return IMG.get(key);
  };
  // 给英语田园（另一个页面、可能不同源）：把当前皮肤打包进网址。自绘外观 = 64×64 PNG；炫彩 = 这位英雄用到的颜色的换色表
  S.export = function (hid) {
    const id = S.equipped(hid), s = S.get(hid, id); if (!s || s.kind === 'classic') return null;
    if (s.kind === 'img') { const c = S.img(hid, id); return c ? { hero: hid, id, kind: 'img', png: c.toDataURL('image/png') } : null; }
    const used = new Set(), cv = document.createElement('canvas'); cv.width = cv.height = 96; const g = cv.getContext('2d');
    const rec = new Proxy(g, { get(t, p) { const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; }, set(t, p, v) { if (typeof v === 'string' && (p === 'fillStyle' || p === 'strokeStyle')) used.add(v); t[p] = v; return true; } });
    const h = H.get(hid); [{}, { bob: 1, strum: 1, t: 0.3 }, { blink: true, t: 0.9 }, { lean: 1, strum: 0, t: 1.5 }].forEach((a) => h.draw(rec, 20, 30, 2, Object.assign({ noCustom: true, showInst: true }, a)));
    const map = {}, f = mapper(id); used.forEach((c) => { const v = f(c); if (v !== c) map[c] = v; });
    return { hero: hid, id, kind: 'map', map };
  };

  // ---------- 所有画英雄的地方都走 h.draw：按装备的皮肤画（a.noCustom = 强制官方形象；a.skin = 预览某一套） ----------
  H.list.forEach((h) => {
    const d0 = h.draw;
    h.draw = function (ctx, ox, oy, px, a = {}) {
      if (a.noCustom) return d0.call(this, ctx, ox, oy, px, a);
      const id = a.skin || S.equipped(h.id); if (id === 'classic') return d0.call(this, ctx, ox, oy, px, a);
      if (id.startsWith('my-')) {
        const sk = S.img(h.id, id); if (!sk) return d0.call(this, ctx, ox, oy, px, a);
        const s = px / 2, bob = a.bob ? Math.round(px * 0.5 * a.bob) : 0, sm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(sk, Math.round(ox - 12 * s), Math.round(oy - 24 * s - bob), Math.round(64 * s), Math.round(64 * s)); ctx.imageSmoothingEnabled = sm; return;
      }
      if (TINTS.some((t) => t.id === id)) return d0.call(this, tinted(ctx, id), ox, oy, px, a);
      return d0.call(this, ctx, ox, oy, px, a);
    };
  });
})();
