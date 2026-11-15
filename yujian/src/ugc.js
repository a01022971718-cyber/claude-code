// ugc.js — 玩家自定义素材：读取 → 检查 → 自动修复 → 转换成游戏几何体。
// 图片 → 体素模型（voxel）；.glb/.gltf/.obj → 低多边形网格（mesh）。
// 所有异步函数都不会抛异常：出错时返回带 fail 检查项的 Report。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { G } from './geo.js';
import { PAL, STYLE_SWATCHES } from './palette.js';

export const LIMITS = { imageMaxBytes: 2 * 1024 * 1024, modelMaxBytes: 5 * 1024 * 1024, minSide: 32, gridMax: 28, trisGood: 800, trisMax: 2000, colorsGood: 10, deltaGood: 12, deltaBad: 26 };

export const STANDARD = [
  { title: '文件格式与大小', rule: '图片用 png、jpg、jpeg 或 webp，不超过 2 MB；3D 模型用 glb、gltf（单文件）或 obj，不超过 5 MB。', why: '文件太大会让小岛加载变慢，手机上尤其明显。' },
  { title: '图片不要太小', rule: '图片最短边不少于 32 像素，建议 128–512 像素。', why: '太小的图放大后细节全糊在一起，认不出画的是什么。' },
  { title: '用透明背景，主体占满画面', rule: '保存成带透明通道的 PNG，只留主体，四周不要大片空白。', why: '有背景的图会变成一块方板子立在岛上；空白太多主体会显得很小。' },
  { title: '颜色不超过 10 种', rule: '用 3–10 种纯色平涂，不要渐变、光影和描边阴影。', why: '少量纯色才有低多边形的扁平、干净的可爱感。' },
  { title: '使用游戏标准色', rule: '尽量从 30 种标准色卡里取色，和游戏配色的差距越小越好。', why: '颜色和小岛一致，摆上去才不会突兀；不一致的颜色会被自动换成最接近的标准色。' },
  { title: '不太暗，也不刺眼', rule: '不要大面积纯黑，也不要荧光色（饱和度和亮度都特别高的颜色）。', why: '岛上有光照，纯黑会变成一块黑；荧光色会抢走整座岛的视线。' },
  { title: '画面干净、比例匀称', rule: '不要零碎的小点和细线；主体宽高比不超过 3.5 : 1。', why: '小点在体素化后会变成散落的小方块；太细长的东西放在岛上看不清。' },
  { title: '3D 模型面数不超过 2000', rule: '建议 800 面以内，最多 2000 面；不要有面积为 0 的破面。', why: '岛上会同时摆很多装饰，面数太高手机会卡。' },
  { title: '3D 模型只用颜色，不用贴图和动画', rule: '每个材质只设一个颜色；贴图、骨骼和动画会被忽略；模型会自动缩放到统一高度、底部中心放到原点。', why: '游戏用平面着色，只认颜色；静态造型才能随意摆放。' },
  { title: '只上传有权使用的内容', rule: '请只上传自己画的或有权使用的素材，不要有文字、商标、真人照片。', why: '保护你和其他玩家，避免侵权和隐私问题。' },
];

// ================= 颜色工具 =================
const S2L = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB(0..255) → CIE Lab（D65），写入 out */
function rgbToLab(r, g, b, out) {
  const R = S2L[r], Gc = S2L[g], B = S2L[b];
  const fx = labF((0.4124564 * R + 0.3575761 * Gc + 0.1804375 * B) / 0.95047);
  const fy = labF(0.2126729 * R + 0.7151522 * Gc + 0.072175 * B);
  const fz = labF((0.0193339 * R + 0.119192 * Gc + 0.9503041 * B) / 1.08883);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}
const hexToLab = (hex, out = [0, 0, 0]) => rgbToLab((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, out);

const NSW = STYLE_SWATCHES.length;
const SW_LAB = new Float64Array(NSW * 3);
STYLE_SWATCHES.forEach((s, i) => { const l = hexToLab(s[1]); SW_LAB[i * 3] = l[0]; SW_LAB[i * 3 + 1] = l[1]; SW_LAB[i * 3 + 2] = l[2]; });

/** Lab 空间里最近的标准色：返回下标，距离写入 nearestOut.de */
const nearestOut = { de: 0 };
function nearestLab(L, a, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NSW; i++) {
    const dl = L - SW_LAB[i * 3], da = a - SW_LAB[i * 3 + 1], db = b - SW_LAB[i * 3 + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  nearestOut.de = Math.sqrt(bd);
  return best;
}
// 6 位/通道缓存，图片里重复颜色只算一次
const NC = new Int8Array(1 << 18).fill(-1), ND = new Float32Array(1 << 18), _lab = [0, 0, 0];
function nearestRGB(r, g, b) {
  const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  if (NC[k] < 0) {
    rgbToLab(((r >> 2) << 2) | 2, ((g >> 2) << 2) | 2, ((b >> 2) << 2) | 2, _lab);
    NC[k] = nearestLab(_lab[0], _lab[1], _lab[2]); ND[k] = nearestOut.de;
  }
  nearestOut.de = ND[k];
  return NC[k];
}
function nearestHex(hex) {
  hexToLab(hex, _lab);
  return nearestLab(_lab[0], _lab[1], _lab[2]);
}

// ================= 通用 =================
const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const pct = (x) => Math.round(x * 100) + '%';
const cut12 = (s) => Array.from(s).slice(0, 12).join('');
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp'], MODEL_EXT = ['glb', 'gltf', 'obj'];
const C = (id, title, level, detail, how = '', fix = null) => ({ id, title, level, detail, how, fix });
const RIGHTS = () => C('rights', '版权与内容', 'info', '请只上传自己画的或有权使用的图片，不要有文字、商标、真人照片。', '');

function scoreOf(checks, dE) {
  let s = 100;
  for (const c of checks) {
    if (c.level === 'warn') { s -= 10; if (c.id === 'palette') s -= Math.min(25, Math.max(0, Math.round(dE - LIMITS.deltaGood))); }
    else if (c.level === 'fail') s -= 40;
  }
  return Math.max(0, s);
}
function finish(kind, name, checks, asset, data, dE = 0) {
  const score = scoreOf(checks, dE);
  return { kind, name, checks, score, pass: !checks.some((c) => c.level === 'fail') && score >= 70, asset, _data: data };
}
function failReport(kind, name, title, detail, how, id = 'format') {
  return { kind, name, checks: [C(id, title, 'fail', detail, how), kind === 'model' ? { ...RIGHTS(), detail: '请只上传自己建的或有权使用的模型，不要带商标和他人的作品。' } : RIGHTS()], score: 0, pass: false, asset: null, _data: { unreadable: true } };
}
const cloneReport = (r) => ({ ...r, checks: r.checks.map((c) => ({ ...c })) });

// ================= 入口 =================
export async function analyzeFile(file) {
  let kind = 'image', name = '素材';
  try {
    const fname = String((file && file.name) || '');
    const ext = (fname.includes('.') ? fname.split('.').pop() : '').toLowerCase();
    name = cut12(fname.replace(/\.[^.]*$/, '') || '素材');
    const mime = String((file && file.type) || '');
    if (MODEL_EXT.includes(ext)) kind = 'model';
    else if (IMG_EXT.includes(ext) || mime.startsWith('image/')) kind = 'image';
    else kind = 'image';
    if (!file) return failReport(kind, name, '格式与大小', '没有收到文件。', '请重新选择一个文件。');
    const okExt = kind === 'model' ? MODEL_EXT.includes(ext) : (IMG_EXT.includes(ext) || (!ext && /^image\/(png|jpeg|webp)$/.test(mime)));
    if (!okExt) {
      return failReport(kind, name, '格式与大小', `不支持“${ext ? '.' + ext : '未知'}”格式。`, '图片请另存为 png、jpg 或 webp（推荐 PNG，可以保留透明背景）；3D 模型请导出为 .glb（在 Blender 里选“文件 > 导出 > glTF 2.0”，格式选“glTF 二进制 .glb”）。');
    }
    const limit = kind === 'model' ? LIMITS.modelMaxBytes : LIMITS.imageMaxBytes;
    if (file.size > limit) {
      return failReport(kind, name, '格式与大小', `文件 ${sizeText(file.size)}，超过 ${sizeText(limit)} 的上限。`,
        kind === 'model' ? '在 Blender 里用“精简（Decimate）”修改器减少面数，导出时不要勾选“包含贴图”，文件就会小很多。'
          : '在绘图软件里把图片缩小到 512 像素以内再导出为 PNG，文件就会小很多。');
    }
    return kind === 'model' ? await analyzeModel(file, name, ext) : await analyzeImage(file, name, ext);
  } catch (e) {
    return failReport(kind, name, '格式与大小', '读取文件时出了问题：' + String((e && e.message) || e).slice(0, 80), '请换一个文件再试，或重新导出一次。');
  }
}

export async function applyFix(report, fixId) {
  try {
    if (!report || !report._data || report._data.unreadable || !report.checks.some((c) => c.fix === fixId)) return report ? cloneReport(report) : report;
    const d = report._data;
    if (d.kind === 'image') {
      const nd = { ...d, fixes: { ...d.fixes } };
      if (fixId === 'removeBg') { const r = floodBackground(d.px, d.w, d.h); nd.px = r.px; nd.fixes.removeBg = { ok: r.ok, removed: r.removed, before: d.stats.opaqueRatio }; }
      else if (fixId === 'palette') nd.fixes.palette = true;
      else if (fixId === 'denoise') nd.fixes.denoise = true;
      else return cloneReport(report);
      return buildImage(nd);
    }
    if (d.kind === 'model') {
      const nd = { ...d, fixes: { ...d.fixes } };
      if (fixId === 'dropTexture' || fixId === 'palette' || fixId === 'clean') nd.fixes[fixId] = true; else return cloneReport(report);
      return buildMesh(nd);
    }
    return cloneReport(report);
  } catch (e) {
    return report ? cloneReport(report) : report;
  }
}

export async function applyAllFixes(report) {
  let r = report;
  try {
    for (let i = 0; i < 8; i++) {
      const c = r.checks.find((x) => x.fix);
      if (!c) break;
      const next = await applyFix(r, c.fix);
      if (next.checks.some((x) => x.fix === c.fix)) { r = next; break; } // 没有进展，防止死循环
      r = next;
    }
  } catch (e) { /* 保持当前 */ }
  return r;
}

// ================= 图片 =================
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
async function decodeImage(file) {
  try { const b = await createImageBitmap(file); return { src: b, w: b.width, h: b.height, close: () => b.close && b.close() }; } catch (e) { /* 走 Image 兜底 */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('图片解码失败')); img.src = url; });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}

async function analyzeImage(file, name, ext) {
  let dec;
  try { dec = await decodeImage(file); } catch (e) {
    return failReport('image', name, '格式与大小', '这个文件无法当作图片打开，可能已损坏，或者不是真正的图片。', '请用绘图软件重新打开并另存为 PNG，再上传。');
  }
  try {
    const ow = dec.w, oh = dec.h;
    if (!(ow > 0 && oh > 0)) return failReport('image', name, '格式与大小', '图片没有内容（尺寸为 0）。', '请重新导出图片。');
    const sc = Math.min(1, 512 / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * sc)), h = Math.max(1, Math.round(oh * sc));
    const cv = mkCanvas(w, h);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dec.src, 0, 0, w, h);
    const px = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
    return buildImage({ kind: 'image', name, ext, bytes: file.size, px, w, h, ow, oh, fixes: { removeBg: null, palette: false, denoise: false }, stats: { opaqueRatio: 1 } });
  } finally { try { dec.close(); } catch (e) { /* ignore */ } }
}

/** 从四边泛洪去背景。返回新像素；背景不是均匀纯色时 ok=false 且不改动 */
function floodBackground(px0, w, h) {
  const TOL = 18, STEP = 10;
  const px = new Uint8ClampedArray(px0);
  const fail = () => ({ px, ok: false, removed: 0 });
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x); if (h > 1) border.push((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w); if (w > 1) border.push(y * w + w - 1); }
  const buckets = new Map(); let nb = 0;
  for (const p of border) {
    const o = p * 4; if (px[o + 3] < 128) continue;
    nb++;
    const k = ((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3);
    let bk = buckets.get(k); if (!bk) { bk = { n: 0, r: 0, g: 0, b: 0 }; buckets.set(k, bk); }
    bk.n++; bk.r += px[o]; bk.g += px[o + 1]; bk.b += px[o + 2];
  }
  if (!nb) return fail();
  let best = null; for (const bk of buckets.values()) if (!best || bk.n > best.n) best = bk;
  const ref = rgbToLab(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n), [0, 0, 0]);
  const tmp = [0, 0, 0];
  const dRef = (p) => { const o = p * 4; rgbToLab(px[o], px[o + 1], px[o + 2], tmp); return Math.hypot(tmp[0] - ref[0], tmp[1] - ref[1], tmp[2] - ref[2]); };
  const seeds = border.filter((p) => px[p * 4 + 3] >= 128 && dRef(p) <= TOL);
  if (seeds.length < nb * 0.6) return fail();
  let opaque = 0; for (let i = 3; i < px.length; i += 4) if (px[i] >= 128) opaque++;
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h), la = new Float32Array(w * h * 3);
  let qh = 0, qt = 0;
  for (const p of seeds) if (!seen[p]) { seen[p] = 1; q[qt++] = p; const o = p * 4; rgbToLab(px[o], px[o + 1], px[o + 2], tmp); la[p * 3] = tmp[0]; la[p * 3 + 1] = tmp[1]; la[p * 3 + 2] = tmp[2]; }
  while (qh < qt) {
    const p = q[qh++], x = p % w, y = (p / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx; if (seen[n]) continue;
      const o = n * 4; if (px[o + 3] < 128) continue;
      rgbToLab(px[o], px[o + 1], px[o + 2], tmp);
      if (Math.hypot(tmp[0] - ref[0], tmp[1] - ref[1], tmp[2] - ref[2]) > TOL) continue;
      if (Math.hypot(tmp[0] - la[p * 3], tmp[1] - la[p * 3 + 1], tmp[2] - la[p * 3 + 2]) > STEP) continue;
      seen[n] = 1; la[n * 3] = tmp[0]; la[n * 3 + 1] = tmp[1]; la[n * 3 + 2] = tmp[2]; q[qt++] = n;
    }
  }
  if (qt > opaque * 0.9) return fail(); // 几乎整张图都被当成背景，放弃
  for (let i = 0; i < qt; i++) px[q[i] * 4 + 3] = 0;
  return { px, ok: qt > 0, removed: qt };
}

function trimCells(cells, w, h) {
  let r0 = h, r1 = -1, c0 = w, c1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] >= 0) { if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x; }
  if (r1 < 0) return null;
  const nw = c1 - c0 + 1, nh = r1 - r0 + 1, out = new Int8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[y * nw + x] = cells[(y + r0) * w + x + c0];
  return { cells: out, w: nw, h: nh };
}
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
function noiseStats(cells, w, h) {
  let solid = 0, iso = 0, holes = 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : cells[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y * w + x];
    if (c >= 0) {
      solid++;
      let same = false; for (let k = 0; k < 4; k++) if (at(x + DX[k], y + DY[k]) === c) same = true;
      if (!same) iso++;
    } else {
      const a = at(x + 1, y);
      if (a >= 0 && at(x - 1, y) === a && at(x, y + 1) === a && at(x, y - 1) === a) holes++;
    }
  }
  return { solid, iso, holes, ratio: (iso + holes) / Math.max(1, solid) };
}
function denoiseCells(cells, w, h) {
  const out = Int8Array.from(cells);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : cells[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y * w + x];
    if (c >= 0) {
      let same = false; for (let k = 0; k < 4; k++) if (at(x + DX[k], y + DY[k]) === c) same = true;
      if (!same) out[y * w + x] = -1;
    } else {
      const a = at(x + 1, y);
      if (a >= 0 && at(x - 1, y) === a && at(x, y + 1) === a && at(x, y - 1) === a) out[y * w + x] = a;
    }
  }
  return out;
}

function buildImage(d) {
  const { px, w, h, name, fixes } = d, L = LIMITS, fmt = (d.ext || '').toUpperCase().replace('JPEG', 'JPG');
  const checks = [];
  checks.push(C('format', '格式与大小', 'pass', `格式为 ${fmt}，大小 ${sizeText(d.bytes)}（上限 ${sizeText(L.imageMaxBytes)}）。`));
  // resolution
  const minS = Math.min(d.ow, d.oh), maxS = Math.max(d.ow, d.oh);
  if (minS < L.minSide) checks.push(C('resolution', '分辨率', 'fail', `图片尺寸 ${d.ow}×${d.oh} 像素，最短边只有 ${minS} 像素，低于 ${L.minSide} 像素。`, `在绘图软件里把画布放大到至少 64×64 像素（建议 256×256）重新画，或者换一张更大的图。`));
  else if (maxS > 2048) checks.push(C('resolution', '分辨率', 'info', `图片尺寸 ${d.ow}×${d.oh} 像素，最长边超过 2048 像素，会自动缩小后再处理。`));
  else checks.push(C('resolution', '分辨率', 'pass', `图片尺寸 ${d.ow}×${d.oh} 像素。`));
  // 不透明统计与外接框
  let opaque = 0, minx = w, miny = h, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= 128) { opaque++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const opaqueRatio = opaque / (w * h);
  // alpha 项
  const rb = fixes.removeBg;
  const stats = { opaqueRatio: rb ? rb.before : opaqueRatio };
  const nd = { ...d, stats };
  if (!opaque) {
    checks.push(C('alpha', '透明背景', 'fail', '图片是完全透明的，没有可见的内容。', '请确认导出时没有把图案隐藏或删掉，重新导出 PNG。'));
    checks.push(RIGHTS());
    return finish('image', name, checks, null, nd);
  }
  if (rb) {
    if (rb.ok && opaqueRatio <= 0.92) checks.push(C('alpha', '透明背景', 'fixed', `已去掉背景，不透明部分从 ${pct(rb.before)} 降到 ${pct(opaqueRatio)}。`));
    else checks.push(C('alpha', '透明背景', 'warn', `自动去背景没有成功（背景不是均匀的纯色），不透明部分仍占 ${pct(opaqueRatio)}。`, '在绘图软件里用“魔棒/抠图”工具选中背景并删除，保存为带透明通道的 PNG；背景颜色最好是单一的纯色，这样更容易去掉。'));
  } else if (opaqueRatio > 0.92) {
    checks.push(C('alpha', '透明背景', 'warn', `图片几乎没有透明背景（不透明部分占 ${pct(opaqueRatio)}），背景会变成一整块板子立在岛上。`, '在绘图软件里把背景删掉，保存为带透明通道的 PNG；背景是纯色的话，也可以点“一键去背景”。', 'removeBg'));
  } else checks.push(C('alpha', '透明背景', 'pass', `图片有透明背景（不透明部分占 ${pct(opaqueRatio)}）。`));
  // trim
  const bw = maxx - minx + 1, bh = maxy - miny + 1, trimRatio = (bw * bh) / (w * h);
  const trimIdx = checks.length;
  checks.push(trimRatio < 0.4 ? C('trim', '主体留白', 'fixed', `主体只占整张图的 ${pct(trimRatio)}，已自动裁掉多余空白。`) : C('trim', '主体留白', 'pass', `主体占整张图的 ${pct(trimRatio)}，留白合适。`));
  // 逐像素统计（只在主体外接框内）
  const idxArr = new Int8Array(bw * bh).fill(-1);
  let deSum = 0, dark = 0, neon = 0, n = 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const o = ((y + miny) * w + x + minx) * 4;
    if (px[o + 3] < 128) continue;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    idxArr[y * bw + x] = nearestRGB(r, g, b); deSum += nearestOut.de; n++;
    if (0.2126729 * S2L[r] + 0.7151522 * S2L[g] + 0.072175 * S2L[b] < 0.01407) dark++; // 等价于 Lab 的 L < 12
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 229.5 && (mx - mn) / mx > 0.9) neon++;
  }
  const dE = deSum / n;
  // 颜色数：主体缩成 64×64 采样，每通道 16 级，忽略不足 0.8% 的零星边缘色
  const hist = new Uint32Array(4096); let samples = 0;
  for (let sy = 0; sy < 64; sy++) for (let sx = 0; sx < 64; sx++) {
    const o = ((miny + Math.floor((sy + 0.5) * bh / 64)) * w + minx + Math.floor((sx + 0.5) * bw / 64)) * 4;
    if (px[o + 3] < 128) continue;
    hist[((px[o] >> 4) << 8) | ((px[o + 1] >> 4) << 4) | (px[o + 2] >> 4)]++; samples++;
  }
  // 零星的边缘抗锯齿色不算；但如果零星颜色加起来占了大头（照片、渐变、噪点），就全部计入
  let ncol = 0, rareN = 0, rareS = 0; const minShare = Math.max(1, samples * 0.008);
  for (let i = 0; i < 4096; i++) { if (hist[i] >= minShare) ncol++; else if (hist[i] > 0) { rareN++; rareS += hist[i]; } }
  if (rareS > samples * 0.25) ncol += rareN;
  const palFix = fixes.palette;
  const toFixed = (c, msg) => C(c.id, c.title, 'fixed', msg);
  let cc;
  if (ncol > L.colorsGood) {
    cc = C('colors', '颜色数量', 'warn', ncol > 24 ? `检测到 ${ncol} 种颜色，建议不超过 ${L.colorsGood} 种，图片像照片或带渐变。` : `检测到 ${ncol} 种颜色，建议不超过 ${L.colorsGood} 种。`,
      '在绘图软件里用 8–10 种纯色平涂，不要用渐变、光影和描边阴影；也可以点“一键统一配色”，自动换成游戏标准色。', 'palette');
    if (palFix) cc = toFixed(cc, `已统一为游戏标准色（原来检测到 ${ncol} 种颜色）。`);
  } else cc = C('colors', '颜色数量', 'pass', `检测到 ${ncol} 种颜色，数量合适（建议不超过 ${L.colorsGood} 种）。`);
  checks.push(cc);
  let pc;
  if (dE <= L.deltaGood) pc = C('palette', '风格配色', 'pass', `和游戏配色的差距很小（平均差距 ${dE.toFixed(1)}，越小越接近）。`);
  else {
    pc = C('palette', '风格配色', 'warn', dE <= L.deltaBad ? `和游戏配色有一些差距（平均差距 ${dE.toFixed(1)}，建议在 ${L.deltaGood} 以内），摆在岛上颜色会有点突兀。` : `和游戏配色的差距很大（平均差距 ${dE.toFixed(1)}，建议在 ${L.deltaGood} 以内），摆在岛上会很不搭。`,
      '尽量从“上传标准”里的 30 种标准色取色，偏灰、偏暗的颜色换成明亮柔和的色调；也可以点“一键统一配色”，自动换成最接近的标准色。', 'palette');
    if (palFix) pc = toFixed(pc, `已把颜色换成最接近的游戏标准色（原来平均差距 ${dE.toFixed(1)}）。`);
  }
  checks.push(pc);
  // tone
  const darkR = dark / n, neonR = neon / n, tmsg = [];
  if (darkR > 0.25) tmsg.push(`有 ${pct(darkR)} 的面积接近纯黑，太暗，岛上的光照会让它变成一块黑`);
  if (neonR > 0.2) tmsg.push(`有 ${pct(neonR)} 的面积是荧光色，颜色太刺眼`);
  if (tmsg.length) {
    let tc = C('tone', '亮度与饱和度', 'warn', tmsg.join('；') + '。', '把纯黑换成深灰蓝或深棕，把荧光色调淡一点（饱和度降低）；也可以点“一键统一配色”，自动换成柔和的标准色。', 'palette');
    if (palFix) tc = toFixed(tc, '已换成柔和的游戏标准色，太暗或太刺眼的问题已解决。');
    checks.push(tc);
  } else checks.push(C('tone', '亮度与饱和度', 'pass', '亮度和饱和度都正常，没有大片纯黑或荧光色。'));
  // 体素格子
  const s = Math.min(1, L.gridMax / Math.max(bw, bh));
  const gw = Math.max(1, Math.round(bw * s)), gh = Math.max(1, Math.round(bh * s));
  let cells = new Int8Array(gw * gh).fill(-1);
  const cnt = new Uint16Array(NSW);
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor(gy * bh / gh), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * bh / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(gx * bw / gw), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * bw / gw));
      cnt.fill(0); let op = 0;
      for (let y = y0; y < y1 && y < bh; y++) for (let x = x0; x < x1 && x < bw; x++) { const v = idxArr[y * bw + x]; if (v >= 0) { cnt[v]++; op++; } }
      if (op * 2 < (y1 - y0) * (x1 - x0)) continue;
      let bi = 0; for (let i = 1; i < NSW; i++) if (cnt[i] > cnt[bi]) bi = i;
      cells[gy * gw + gx] = bi;
    }
  }
  let tr = trimCells(cells, gw, gh);
  if (!tr) {
    trimIdx >= 0 && (checks[trimIdx] = C('trim', '主体留白', 'fail', '主体太零碎或太淡，转换成格子后什么都没剩下。', '把主体画得更大、更集中，用实心的色块，不要用细线和稀疏的小点。'));
    checks.push(C('noise', '细节与杂点', 'info', '没有可转换的内容。'), C('shape', '比例', 'info', '没有可转换的内容。'), RIGHTS());
    return finish('image', name, checks, null, nd, dE);
  }
  const ns = noiseStats(tr.cells, tr.w, tr.h);
  if (ns.ratio > 0.12) {
    let nc = C('noise', '细节与杂点', 'warn', `孤立的小格子占 ${pct(ns.ratio)}（建议不超过 12%），画面显得很碎。`, '在绘图软件里用大笔刷把零碎的小点涂成相邻的颜色，避免细小的纹理、线条和噪点；也可以点“一键去杂点”。', 'denoise');
    if (fixes.denoise) {
      nc = toFixed(nc, `已去掉 ${ns.iso} 个孤立小格并填上 ${ns.holes} 个小空洞。`);
      const dn = denoiseCells(tr.cells, tr.w, tr.h);
      tr = trimCells(dn, tr.w, tr.h) || tr;
    }
    checks.push(nc);
  } else checks.push(C('noise', '细节与杂点', 'pass', `杂点很少（孤立的小格占 ${pct(ns.ratio)}）。`));
  // shape
  const asp = bw / bh;
  if (asp > 3.5 || asp < 1 / 3.5) {
    checks.push(C('shape', '比例', 'warn', `主体宽高比约 ${asp >= 1 ? asp.toFixed(1) + ' : 1' : '1 : ' + (1 / asp).toFixed(1)}，太细长，放在岛上会看不清。`, '把画面改成更接近方形：把过长的部分缩短或加粗；或者把它拆成几个小物件分别上传。'));
  } else checks.push(C('shape', '比例', 'pass', `主体宽高比约 ${asp >= 1 ? asp.toFixed(1) + ' : 1' : '1 : ' + (1 / asp).toFixed(1)}，比例匀称。`));
  checks.push(RIGHTS());
  const asset = { type: 'voxel', name, w: tr.w, h: tr.h, cells: tr.cells, size: 0.5 };
  return finish('image', name, checks, asset, nd, dE);
}

// ================= 3D 模型 =================
const TEX_KEYS = ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap'];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('读取超时')), ms))]);

async function loadModel(buf, ext) {
  if (ext === 'obj') return { root: new OBJLoader().parse(new TextDecoder().decode(buf)), anims: 0 };
  let data = buf;
  if (ext === 'gltf') {
    const text = new TextDecoder().decode(buf);
    let json; try { json = JSON.parse(text); } catch (e) { throw new Error('gltf 文件内容不是有效的 JSON'); }
    const ext1 = (u) => typeof u === 'string' && !u.startsWith('data:');
    if ((json.buffers || []).some((b) => ext1(b.uri)) || (json.images || []).some((i) => ext1(i.uri))) { const e = new Error('external'); e.external = true; throw e; }
    data = text;
  }
  const gltf = await withTimeout(new Promise((res, rej) => new GLTFLoader().parse(data, '', res, rej)), 20000);
  return { root: gltf.scene || (gltf.scenes && gltf.scenes[0]), anims: (gltf.animations || []).length };
}

function extractTris(root) {
  root.updateMatrixWorld(true);
  const pos = [], hex = [], tmp = new THREE.Vector3(), tc = new THREE.Color();
  let hasTex = false, skinned = false;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.isSkinnedMesh) skinned = true;
    const geo = o.geometry, pa = geo.attributes.position; if (!pa) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mhex = mats.map((m) => { if (m && TEX_KEYS.some((k) => m[k])) hasTex = true; return m && m.color ? m.color.getHex() : PAL.wall; });
    const ca = geo.attributes.color, index = geo.index, nT = Math.floor((index ? index.count : pa.count) / 3), me = o.matrixWorld;
    for (let t = 0; t < nT; t++) {
      const vi = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
      for (let k = 0; k < 3; k++) { tmp.fromBufferAttribute(pa, vi[k]).applyMatrix4(me); pos.push(tmp.x, tmp.y, tmp.z); }
      let hx;
      if (ca) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < 3; k++) { r += ca.getX(vi[k]); g += ca.getY(vi[k]); b += ca.getZ(vi[k]); }
        hx = tc.setRGB(r / 3, g / 3, b / 3).getHex();
      } else {
        let mi = 0;
        if (geo.groups && geo.groups.length) for (const gr of geo.groups) if (t * 3 >= gr.start && t * 3 < gr.start + gr.count) { mi = gr.materialIndex || 0; break; }
        hx = mhex[Math.min(mi, mhex.length - 1)];
      }
      hex.push(hx);
    }
  });
  return { pos: Float32Array.from(pos), hex: Uint32Array.from(hex), hasTex, skinned };
}

async function analyzeModel(file, name, ext) {
  let m;
  try {
    const buf = await file.arrayBuffer();
    m = await loadModel(buf, ext);
    if (!m.root) throw new Error('文件里没有找到场景');
  } catch (e) {
    if (e && e.external) return failReport('model', name, '格式与大小', '这个 .gltf 引用了外部文件（贴图或 .bin），网页只能读取单个文件。', '请在 Blender 里选“文件 > 导出 > glTF 2.0”，格式选“glTF 二进制 (.glb)”，把所有内容打包进一个文件。');
    return failReport('model', name, '格式与大小', '无法读取这个模型：' + String((e && e.message) || e).slice(0, 80), '请在 Blender 里重新导出为 .glb（不要勾选压缩选项，如 Draco）后再上传。');
  }
  const t = extractTris(m.root);
  const n = t.hex.length;
  if (!n) return failReport('model', name, '格式与大小', '模型里没有找到任何三角形面。', '请确认导出时选中了模型，并且导出的是网格（Mesh），而不是只有线条或点。');
  // 包围盒与破面
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], p = t.pos;
  for (let i = 0; i < p.length; i += 3) if (isFinite(p[i]) && isFinite(p[i + 1]) && isFinite(p[i + 2])) for (let k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; }
  const diag2 = (mx[0] - mn[0]) ** 2 + (mx[1] - mn[1]) ** 2 + (mx[2] - mn[2]) ** 2;
  const deg = new Uint8Array(n); let degCount = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    let bad = false; for (let k = 0; k < 9; k++) if (!isFinite(p[o + k])) bad = true;
    if (bad) { deg[i] = 2; degCount++; continue; }
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz) < 1e-9 * diag2) { deg[i] = 1; degCount++; }
  }
  return buildMesh({ kind: 'model', name, ext, bytes: file.size, pos: t.pos, hex: t.hex, deg, degCount, hasTex: t.hasTex, extra: t.skinned || m.anims > 0, fixes: { dropTexture: false, palette: false, clean: false } });
}

function buildMesh(d) {
  const { name, fixes } = d, L = LIMITS, checks = [];
  const keep = []; for (let i = 0; i < d.hex.length; i++) if (!(d.deg[i] === 2 || (d.deg[i] === 1 && fixes.clean))) keep.push(i);
  const m = keep.length;
  checks.push(C('format', '格式与大小', 'pass', `格式为 ${d.ext.toUpperCase()}，大小 ${sizeText(d.bytes)}（上限 ${sizeText(L.modelMaxBytes)}）。`));
  if (!m) { checks.push(C('tris', '面数', 'fail', '没有可用的三角形面。', '请检查模型是否由有效的三角形或四边形面组成。'), RIGHTS()); return { ...finish('model', name, checks, null, d), score: 0 }; }
  // tris
  const ratio = Math.min(1, L.trisGood / m).toFixed(2);
  const decimate = `在 Blender 里选中模型，添加“精简（Decimate）”修改器，比率设为 ${ratio}，点“应用”后重新导出（也可以手动删掉看不见的背面和细小零件）。`;
  if (m <= L.trisGood) checks.push(C('tris', '面数', 'pass', `共 ${m} 个三角形面，面数很合适（建议不超过 ${L.trisGood}）。`));
  else if (m <= L.trisMax) checks.push(C('tris', '面数', 'warn', `共 ${m} 个三角形面，建议不超过 ${L.trisGood}，最多 ${L.trisMax}。`, decimate));
  else checks.push(C('tris', '面数', 'fail', `共 ${m} 个三角形面，超过 ${L.trisMax} 的上限，岛上放几个手机就会卡。`, decimate));
  // texture
  if (d.hasTex) checks.push(fixes.dropTexture ? C('texture', '贴图', 'fixed', '已忽略贴图，只使用每个材质的颜色。') : C('texture', '贴图', 'warn', '检测到贴图。游戏不用贴图，只取每个材质的颜色。', '在 Blender 里给每个部位换成只设“基础色”的纯色材质，删掉贴图后再导出；也可以点“一键忽略贴图”。', 'dropTexture'));
  else checks.push(C('texture', '贴图', 'pass', '没有贴图，只用材质颜色。'));
  // 三角形颜色
  const hx = new Uint32Array(m), pos = new Float32Array(m * 9);
  keep.forEach((s, i) => { hx[i] = d.hex[s]; pos.set(d.pos.subarray(s * 9, s * 9 + 9), i * 9); });
  const qset = new Set(), cache = new Map(), col = new Uint8Array(m); let deSum = 0;
  for (let i = 0; i < m; i++) {
    const h = hx[i];
    qset.add((((h >> 20) & 15) << 8) | (((h >> 12) & 15) << 4) | ((h >> 4) & 15));
    let v = cache.get(h);
    if (!v) { const idx = nearestHex(h); v = [idx, nearestOut.de]; cache.set(h, v); }
    col[i] = v[0]; deSum += v[1];
  }
  const dE = deSum / m, ncol = qset.size;
  const toFixed = (c, msg) => C(c.id, c.title, 'fixed', msg);
  let cc;
  if (ncol > L.colorsGood) {
    cc = C('colors', '颜色数量', 'warn', `检测到 ${ncol} 种颜色，建议不超过 ${L.colorsGood} 种。`, '在建模软件里只用 5–8 种纯色材质，不要渐变色和顶点渐变，每个部位一个颜色；也可以点“一键统一配色”。', 'palette');
    if (fixes.palette) cc = toFixed(cc, `已统一为游戏标准色（原来检测到 ${ncol} 种颜色）。`);
  } else cc = C('colors', '颜色数量', 'pass', `检测到 ${ncol} 种颜色，数量合适（建议不超过 ${L.colorsGood} 种）。`);
  checks.push(cc);
  let pc;
  if (dE <= L.deltaGood) pc = C('palette', '风格配色', 'pass', `和游戏配色的差距很小（平均差距 ${dE.toFixed(1)}，越小越接近）。`);
  else {
    pc = C('palette', '风格配色', 'warn', dE <= L.deltaBad ? `和游戏配色有一些差距（平均差距 ${dE.toFixed(1)}，建议在 ${L.deltaGood} 以内）。` : `和游戏配色的差距很大（平均差距 ${dE.toFixed(1)}，建议在 ${L.deltaGood} 以内）。`,
      '尽量使用“上传标准”里的 30 种标准色作为材质颜色；也可以点“一键统一配色”，自动换成最接近的标准色。', 'palette');
    if (fixes.palette) pc = toFixed(pc, `已把颜色换成最接近的游戏标准色（原来平均差距 ${dE.toFixed(1)}）。`);
  }
  checks.push(pc);
  // degenerate
  if (d.degCount > 0) checks.push(fixes.clean ? C('degenerate', '破面', 'fixed', `已删除 ${d.degCount} 个面积为 0 的破面。`) : C('degenerate', '破面', 'warn', `发现 ${d.degCount} 个面积几乎为 0 的破面。`, '在 Blender 里进入编辑模式，选择“网格 > 清理 > 删除松散几何/退化”，再重新导出；也可以点“一键清理破面”。', 'clean'));
  else checks.push(C('degenerate', '破面', 'pass', '没有发现破面。'));
  // 归一化
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < mn[k]) mn[k] = pos[i + k]; if (pos[i + k] > mx[k]) mx[k] = pos[i + k]; }
  const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2];
  const f2 = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  let asset = null;
  if (!(dy > 1e-9)) {
    checks.push(C('pivot', '原点与尺寸', 'fail', `原始尺寸 宽 ${f2(dx)} × 高 ${f2(dy)} × 深 ${f2(dz)}，模型没有高度（被压成了一个平面）。`, '请检查模型的朝向：游戏里竖直向上是 Y 轴；在 Blender 导出 glTF 时保持默认的“+Y 向上”。'));
  } else {
    checks.push(C('pivot', '原点与尺寸', 'fixed', `原始尺寸 宽 ${f2(dx)} × 高 ${f2(dy)} × 深 ${f2(dz)}（模型自带单位），已自动缩放到统一高度，并把底部中心移到原点。`));
    const k = 1 / dy, cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, np = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { np[i] = (pos[i] - cx) * k; np[i + 1] = (pos[i + 1] - mn[1]) * k; np[i + 2] = (pos[i + 2] - cz) * k; }
    asset = { type: 'mesh', name, pos: np, col, size: 0.5 };
  }
  // shape
  const hz = Math.max(dx, dz);
  if (dy > 1e-9) {
    if (hz / dy > 4) checks.push(C('shape', '比例', 'warn', `水平最长边是高度的 ${(hz / dy).toFixed(1)} 倍，太扁太宽，放在岛上像一块地板。`, '在建模软件里把它加高一些，或者把它拆成几个小一点的物件分别上传。'));
    else if (dy / hz > 5) checks.push(C('shape', '比例', 'warn', `高度是水平最长边的 ${(dy / Math.max(hz, 1e-9)).toFixed(1)} 倍，太细高，放在岛上会看不清。`, '在建模软件里把它加粗或缩短一些，让它更敦实可爱。'));
    else checks.push(C('shape', '比例', 'pass', `高度与水平最长边之比为 ${(dy / Math.max(hz, 1e-9)).toFixed(2)}，比例匀称。`));
  } else checks.push(C('shape', '比例', 'info', '没有高度，无法判断比例。'));
  if (d.extra) checks.push(C('extra', '动画与骨骼', 'info', '检测到动画或骨骼，游戏只保留静态造型。'));
  checks.push({ ...RIGHTS(), detail: '请只上传自己建的或有权使用的模型，不要带商标和他人的作品。' });
  return finish('model', name, checks, asset, d, dE);
}

// ================= 转换成几何体 =================
const shadeCache = new Map();
function shade(hex, f) {
  const key = hex * 1000 + Math.round(f * 100);
  let v = shadeCache.get(key);
  if (v === undefined) {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * f)), g = Math.min(255, Math.round(((hex >> 8) & 255) * f)), b = Math.min(255, Math.round((hex & 255) * f));
    v = (r << 16) | (g << 8) | b; shadeCache.set(key, v);
  }
  return v;
}
const fallbackG = (size) => G.box(size * 0.5, size, size * 0.5, PAL.rock);

export function assetToG(asset) {
  try {
    if (asset && asset.type === 'voxel') return voxelToG(asset);
    if (asset && asset.type === 'mesh') return meshToG(asset);
  } catch (e) { /* 走兜底 */ }
  return fallbackG((asset && asset.size) || 0.5);
}

function voxelToG(a) {
  const { w, h, cells } = a, size = a.size || 0.5;
  let r0 = h, r1 = -1, c0 = w, c1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] >= 0) { if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x; }
  if (r1 < 0) return fallbackG(size);
  const e = size / (r1 - r0 + 1), cx = (c0 + c1 + 1) / 2, zf = e, zb = -e;
  const X = (i) => (i - cx) * e, Y = (j) => (r1 + 1 - j) * e;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cells[y * w + x]);
  const hexOf = (c) => STYLE_SWATCHES[c][1];
  const g = new G();
  // 前后面：同一行连续同色合并
  for (let j = r0; j <= r1; j++) {
    for (let i = c0; i <= c1;) {
      const c = at(i, j); if (c < 0) { i++; continue; }
      let k = i; while (k + 1 <= c1 && at(k + 1, j) === c) k++;
      const x0 = X(i), x1 = X(k + 1), y0 = Y(j + 1), y1 = Y(j), base = hexOf(c);
      g.quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], base);
      g.quad([x1, y0, zb], [x0, y0, zb], [x0, y1, zb], [x1, y1, zb], shade(base, 0.8));
      i = k + 1;
    }
  }
  // 顶面 / 底面：暴露的连续同色格合并
  for (let j = r0; j <= r1; j++) {
    for (const up of [true, false]) {
      for (let i = c0; i <= c1;) {
        const c = at(i, j);
        if (c < 0 || at(i, j + (up ? -1 : 1)) >= 0) { i++; continue; }
        let k = i; while (k + 1 <= c1 && at(k + 1, j) === c && at(k + 1, j + (up ? -1 : 1)) < 0) k++;
        const x0 = X(i), x1 = X(k + 1), base = hexOf(c);
        if (up) { const y = Y(j); g.quad([x0, y, zf], [x1, y, zf], [x1, y, zb], [x0, y, zb], shade(base, 1.1)); }
        else { const y = Y(j + 1); g.quad([x0, y, zb], [x1, y, zb], [x1, y, zf], [x0, y, zf], shade(base, 0.7)); }
        i = k + 1;
      }
    }
  }
  // 左右侧面：同列连续同色合并
  for (let i = c0; i <= c1; i++) {
    for (const right of [true, false]) {
      for (let j = r0; j <= r1;) {
        const c = at(i, j);
        if (c < 0 || at(i + (right ? 1 : -1), j) >= 0) { j++; continue; }
        let k = j; while (k + 1 <= r1 && at(i, k + 1) === c && at(i + (right ? 1 : -1), k + 1) < 0) k++;
        const y0 = Y(k + 1), y1 = Y(j), base = shade(hexOf(c), 0.88);
        if (right) { const x = X(i + 1); g.quad([x, y0, zf], [x, y0, zb], [x, y1, zb], [x, y1, zf], base); }
        else { const x = X(i); g.quad([x, y0, zb], [x, y0, zf], [x, y1, zf], [x, y1, zb], base); }
        j = k + 1;
      }
    }
  }
  return g.count ? g : fallbackG(size);
}

function meshToG(a) {
  const { pos, col } = a, size = a.size || 0.5, n = Math.min(col.length, Math.floor(pos.length / 9));
  if (!n) return fallbackG(size);
  let miny = Infinity, maxy = -Infinity, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < n * 9; i += 3) {
    if (pos[i] < minx) minx = pos[i]; if (pos[i] > maxx) maxx = pos[i];
    if (pos[i + 1] < miny) miny = pos[i + 1]; if (pos[i + 1] > maxy) maxy = pos[i + 1];
    if (pos[i + 2] < minz) minz = pos[i + 2]; if (pos[i + 2] > maxz) maxz = pos[i + 2];
  }
  if (!(maxy - miny > 1e-9)) return fallbackG(size);
  const k = size / (maxy - miny), cx = (minx + maxx) / 2, cz = (minz + maxz) / 2, g = new G();
  const P = (i) => [(pos[i] - cx) * k, (pos[i + 1] - miny) * k, (pos[i + 2] - cz) * k];
  for (let t = 0; t < n; t++) g.tri(P(t * 9), P(t * 9 + 3), P(t * 9 + 6), STYLE_SWATCHES[Math.min(NSW - 1, col[t])][1]);
  return g;
}

// ================= 序列化 =================
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

export function serializeAsset(asset) {
  if (asset.type === 'voxel') {
    let s = ''; for (let i = 0; i < asset.w * asset.h; i++) { const c = asset.cells[i]; s += c < 0 ? '0' : (c + 1).toString(32); }
    return JSON.stringify({ v: 1, t: 'v', n: asset.name, s: asset.size, w: asset.w, h: asset.h, c: s });
  }
  let m = 1e-9; for (let i = 0; i < asset.pos.length; i++) m = Math.max(m, Math.abs(asset.pos[i]));
  const q = new Int16Array(asset.pos.length); for (let i = 0; i < q.length; i++) q[i] = Math.round(asset.pos[i] / m * 32767);
  return JSON.stringify({ v: 1, t: 'm', n: asset.name, s: asset.size, m, p: b64(new Uint8Array(q.buffer)), c: b64(new Uint8Array(asset.col)) });
}

export function deserializeAsset(str) {
  try {
    const o = JSON.parse(str);
    if (!o || o.v !== 1) return null;
    const size = Number.isFinite(o.s) && o.s > 0 ? o.s : 0.5, name = String(o.n || '素材');
    if (o.t === 'v') {
      const w = o.w | 0, h = o.h | 0;
      if (w < 1 || h < 1 || w > 256 || h > 256 || typeof o.c !== 'string' || o.c.length !== w * h) return null;
      const cells = new Int8Array(w * h);
      for (let i = 0; i < cells.length; i++) { const v = parseInt(o.c[i], 32); if (!(v >= 0 && v <= NSW)) return null; cells[i] = v - 1; }
      return { type: 'voxel', name, w, h, cells, size };
    }
    if (o.t === 'm') {
      const pu = unb64(o.p), col = unb64(o.c);
      if (pu.length % 2 || pu.length / 2 !== col.length * 9 || !(o.m > 0)) return null;
      const q = new Int16Array(pu.buffer, 0, pu.length / 2), pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) pos[i] = q[i] / 32767 * o.m;
      for (let i = 0; i < col.length; i++) if (col[i] >= NSW) return null;
      return { type: 'mesh', name, pos, col, size };
    }
    return null;
  } catch (e) { return null; }
}
