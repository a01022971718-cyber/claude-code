// 方块岛的世界：192×192 格、高 64 层，每格一个字节（方块编号，0 = 空气）。海平面在第 16 层。
// 按 16×16×16 分块记“脏”，改了哪块只重建哪块的网格。存档：整个世界压缩后存进本机（浏览器支持就用 deflate）。
import { ID } from './defs.js';
import { makeNoise, rng } from '../hq/noise.js';

export const SX = 192, SY = 64, SZ = 192, CS = 16, SEA = 16;
export const CX = SX / CS, CY = SY / CS, CZ = SZ / CS;
const SAVE_KEY = 'yujian_blocks_v1';

export class World {
  constructor() { this.v = new Uint8Array(SX * SY * SZ); this.dirty = new Set(); this.onChange = null; }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }
  get(x, y, z) { return this.in(x, y, z) ? this.v[(y * SZ + z) * SX + x] : 0; }
  /** 放 / 拆一格，返回原来的方块（越界返回 -1）；相邻分块也记脏（边上的面要重算） */
  set(x, y, z, b) {
    if (!this.in(x, y, z)) return -1;
    const i = this.idx(x, y, z), old = this.v[i]; if (old === b) return old;
    this.v[i] = b;
    const cx = x >> 4, cy = y >> 4, cz = z >> 4;
    this.mark(cx, cy, cz);
    if ((x & 15) === 0) this.mark(cx - 1, cy, cz); if ((x & 15) === 15) this.mark(cx + 1, cy, cz);
    if ((y & 15) === 0) this.mark(cx, cy - 1, cz); if ((y & 15) === 15) this.mark(cx, cy + 1, cz);
    if ((z & 15) === 0) this.mark(cx, cy, cz - 1); if ((z & 15) === 15) this.mark(cx, cy, cz + 1);
    return old;
  }
  mark(cx, cy, cz) { if (cx >= 0 && cy >= 0 && cz >= 0 && cx < CX && cy < CY && cz < CZ) this.dirty.add(cx + ',' + cy + ',' + cz); }
  markAll() { for (let cy = 0; cy < CY; cy++) for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) this.dirty.add(cx + ',' + cy + ',' + cz); }
  /** 这一列最高的实心方块的顶面高度（没有就是 0） */
  top(x, z) { if (x < 0 || z < 0 || x >= SX || z >= SZ) return 0; for (let y = SY - 1; y >= 0; y--) if (this.v[(y * SZ + z) * SX + x]) return y + 1; return 0; }

  // ---------------- 生成 ----------------
  /** 平坦岛：一块圆角方形的草地平台，适合纯建造 */
  genFlat() {
    this.v.fill(0); const c = SX / 2, R = 60;
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const d = Math.max(Math.abs(x - c), Math.abs(z - c)); if (d > R) continue;
      const h = SEA + 2;
      for (let y = 0; y < h; y++) this.v[this.idx(x, y, z)] = y === h - 1 ? (d > R - 3 ? ID.sand : ID.grass) : y > h - 4 ? ID.dirt : ID.stone;
    }
    this.markAll();
  }
  /** 自然岛：沙滩、草地、丘陵、岩山，带树（橡、松、樱） */
  genNatural(seed = 7) {
    this.v.fill(0); const N = makeNoise(seed), R = rng(seed * 31 + 1), c = SX / 2;
    const H = new Float32Array(SX * SZ);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const dx = (x - c) / 78, dz = (z - c) / 78, d = Math.hypot(dx, dz) + N.fbm2(x * 0.02, z * 0.02, 3) * 0.25;
      const fall = 1 - Math.min(1, d) ** 2.2, hills = N.fbm2(x * 0.035 + 10, z * 0.035, 4), peak = Math.max(0, N.fbm2(x * 0.018 - 5, z * 0.018 + 3, 3) - 0.1) * 60;
      H[z * SX + x] = SEA - 6 + fall * (10 + hills * 8 + peak * fall);
    }
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const h = Math.max(1, Math.min(SY - 6, Math.round(H[z * SX + x])));
      const slope = Math.max(Math.abs(H[z * SX + Math.min(SX - 1, x + 1)] - H[z * SX + Math.max(0, x - 1)]), Math.abs(H[Math.min(SZ - 1, z + 1) * SX + x] - H[Math.max(0, z - 1) * SX + x]));
      for (let y = 0; y < h; y++) {
        let b = ID.stone;
        if (y === h - 1) b = h <= SEA + 1 ? ID.sand : h > 42 ? ID.snow : slope > 3.2 || h > 34 ? ID.stone : ID.grass;
        else if (y > h - 4) b = h <= SEA + 1 ? ID.sand : h > 34 ? ID.stone : ID.dirt;
        this.v[this.idx(x, y, z)] = b;
      }
    }
    // 树：草地上稀疏分布，三种树形
    for (let k = 0; k < 900; k++) {
      const x = 4 + Math.floor(R() * (SX - 8)), z = 4 + Math.floor(R() * (SZ - 8)), h = this.top(x, z);
      if (!h || this.get(x, h - 1, z) !== ID.grass || N.n2(x * 0.05, z * 0.05) < -0.1) continue;
      const kind = R(); if (kind < 0.5) this.tree(x, h, z, 'oak', R); else if (kind < 0.85) this.tree(x, h, z, 'pine', R); else this.tree(x, h, z, 'sakura', R);
    }
    this.markAll();
  }
  tree(x, y, z, kind, R) {
    const log = kind === 'pine' ? ID.pineLog : ID.oakLog, leaf = kind === 'pine' ? ID.pineLeaves : kind === 'sakura' ? ID.sakuraLeaves : ID.oakLeaves;
    const th = kind === 'pine' ? 6 + Math.floor(R() * 3) : 4 + Math.floor(R() * 2);
    for (let i = 0; i < th; i++) this.set(x, y + i, z, log);
    const put = (a, b, c) => { if (!this.get(a, b, c)) this.set(a, b, c, leaf); };
    if (kind === 'pine') {
      for (let l = 0; l < th - 1; l++) { const r = Math.max(0, Math.round((th - 1 - l) * 0.45)) + (l % 2); const yy = y + 2 + l; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r + 0.5) put(x + a, yy, z + b); }
      put(x, y + th, z); put(x, y + th + 1, z);
    } else {
      const cy = y + th - 1, r = kind === 'sakura' ? 3 : 2.6;
      for (let a = -3; a <= 3; a++) for (let b = -2; b <= 2; b++) for (let c = -3; c <= 3; c++) {
        const e = (a * a + c * c) / (r * r) + (b * b) / ((r * 0.75) ** 2); if (e > 1 + R() * 0.25) continue; put(x + a, cy + b, z + c);
      }
    }
  }

  // ---------------- 存档 ----------------
  async save(extra = {}) {
    const raw = this.v; let data, enc = 'raw';
    if (typeof CompressionStream !== 'undefined') { data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); enc = 'deflate'; }
    else data = rle(raw), enc = 'rle';
    let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, enc, size: [SX, SY, SZ], data: btoa(s), ...extra })); return true; } catch { return false; }
  }
  /** 读档：成功返回存档里的附加信息（镜头等），没有存档返回 null */
  async load() {
    let o; try { o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { o = null; }
    if (!o || o.v !== 1 || o.size?.[0] !== SX || o.size?.[1] !== SY) return null;
    const bin = atob(o.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    let raw;
    if (o.enc === 'deflate') raw = new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    else if (o.enc === 'rle') raw = unrle(u, this.v.length); else raw = u;
    if (raw.length !== this.v.length) return null;
    this.v.set(raw); this.markAll(); return o;
  }
}
function rle(a) { const out = []; for (let i = 0; i < a.length;) { const b = a[i]; let n = 1; while (i + n < a.length && a[i + n] === b && n < 255) n++; out.push(b, n); i += n; } return new Uint8Array(out); }
function unrle(u, len) { const a = new Uint8Array(len); let o = 0; for (let i = 0; i < u.length; i += 2) { a.fill(u[i], o, o + u[i + 1]); o += u[i + 1]; } return a; }
