// 生成「造月 256 色」的后 191 色（v9.2，主创要求「颜色增加一个行业最高支持色」）。
// 256 是索引色的行业上限（GIF / PNG-8 / Aseprite 索引模式）：0 号透明 + 255 个颜色。
// 做法：全部从造月 64 色派生（美术用色宪法），按像素画的通行做法做色阶——
//   暗部往冷色（蓝紫）偏、亮部往暖色（黄）偏，再加降饱和的「灰」版本；超出 sRGB 的降饱和拉回；
//   和已有颜色太接近（OKLab 距离）的去掉。结果写死在 js/palette.js 里，编号永不改动。
// 用法：node tools/gen-palette256.mjs > /tmp/p256.json （只在需要重新核对时运行；不要改已发布的结果）
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/palette.js', import.meta.url), 'utf8');
const window = { CF: {} };
new Function('window', src)(window);
const P = window.CF.Palette;
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLab = ([r, g, b]) => { r = lin(r); g = lin(g); b = lin(b); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const toRgb = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(delin); };
const lch = (lab) => [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
const fromLch = ([L, C, h]) => [L, C * Math.cos(h), C * Math.sin(h)];
const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
const hex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const COOL = (285 * Math.PI) / 180, WARM = (95 * Math.PI) / 180;
const toward = (h, t, deg) => { let d = t - h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const s = (deg * Math.PI) / 180; return h + Math.sign(d) * Math.min(Math.abs(d), s); };
const famOf = {}; P.FAMILIES.forEach(([f, l]) => l.forEach((i) => (famOf[i] = f)));
const KINDS = [['暗', -0.075, 0.92, COOL, 10], ['亮', 0.075, 0.85, WARM, 10], ['灰', 0, 0.5, null, 0], ['深', -0.15, 0.8, COOL, 18], ['浅', 0.15, 0.7, WARM, 15]];
const base = []; for (let i = 1; i <= 64; i++) base.push({ i, hex: P.color(i), name: P.name(i), lab: toLab(P.rgb(i)) });
function candidates() {
  const out = [];
  KINDS.forEach(([suf, dL, kC, tgt, deg]) => base.forEach((b) => {
    const [L, C, h] = lch(b.lab); if (suf === '灰' && C < 0.05) return;
    let nL = L + dL; if (nL < 0.1 || nL > 0.985) return;
    let nC = C * kC, nh = C < 0.04 || !tgt ? h : toward(h, tgt, deg);
    let rgb = toRgb(fromLch([nL, nC, nh])); let guard = 0;
    while (!inGamut(rgb) && guard++ < 60) { nC *= 0.94; rgb = toRgb(fromLch([nL, nC, nh])); }
    if (!inGamut(rgb)) return;
    const hx = hex(rgb), lab = toLab([1, 3, 5].map((k) => parseInt(hx.slice(k, k + 2), 16)));
    out.push({ hex: hx, lab, name: b.name + '·' + suf, fam: nC < 0.03 ? '灰阶' : famOf[b.i] });
  }));
  return out;
}
const cand = candidates();
function pick(th) { const acc = base.map((b) => b.lab), res = []; for (const c of cand) { if (acc.some((a) => dist(a, c.lab) < th)) continue; acc.push(c.lab); res.push(c); } return res; }
let lo = 0, hi = 0.2; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (pick(mid).length >= 191) lo = mid; else hi = mid; }
const chosen = pick(lo).slice(0, 191);
const all = base.map((b) => ({ i: b.i, hex: b.hex, name: b.name, fam: famOf[b.i], L: b.lab[0] })).concat(chosen.map((c, k) => ({ i: 65 + k, hex: c.hex, name: c.name, fam: c.fam, L: c.lab[0] })));
const order = P.FAMILIES.map((f) => f[0]);
const fam256 = order.map((f) => [f, all.filter((x) => x.fam === f).sort((a, b) => a.L - b.L).map((x) => x.i)]);
console.log(JSON.stringify({ threshold: +lo.toFixed(4), extra: chosen.map((c) => [c.hex, c.name]), fam256 }));
