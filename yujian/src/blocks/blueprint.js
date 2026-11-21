// 蓝图：框选保存的一块建筑（最大 48×48×48）。存在本机；可以在方块岛里转向、镜像后放下，也可以转成“我的造物”带回六边形岛。
// 转成造物时，把同一种方块连成的长条 / 平板合并成一个大长方块（块数少很多），每种方块取它的颜色，交给造物的“原版手感”去画。
import { BLOCKS } from './defs.js';
import { HEX_UNIT } from '../make/model.js';

const KEY = 'yujian_blueprints_v1';
export function loadBlueprints() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
export function saveBlueprints(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } }
export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

/** 蓝图 → 造物（用途：建筑摆件）。贪心合并：先沿 x 连，再沿 z 扩，最后沿 y 叠 */
export function blueprintToMake(name, { size: [w, h, d], data }) {
  const at = (x, y, z) => data[(y * d + z) * w + x], used = new Uint8Array(data.length), idx = (x, y, z) => (y * d + z) * w + x, boxes = [];
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const id = at(x, y, z); if (!id || used[idx(x, y, z)]) continue;
    let x1 = x; while (x1 + 1 < w && at(x1 + 1, y, z) === id && !used[idx(x1 + 1, y, z)]) x1++;
    let z1 = z; const rowOk = (zz) => { for (let xx = x; xx <= x1; xx++) if (at(xx, y, zz) !== id || used[idx(xx, y, zz)]) return false; return true; };
    while (z1 + 1 < d && rowOk(z1 + 1)) z1++;
    let y1 = y; const layerOk = (yy) => { for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) if (at(xx, yy, zz) !== id || used[idx(xx, yy, zz)]) return false; return true; };
    while (y1 + 1 < h && layerOk(y1 + 1)) y1++;
    for (let yy = y; yy <= y1; yy++) for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[idx(xx, yy, zz)] = 1;
    const B = BLOCKS[id], c = B.key === 'grass' ? B.top.c : B.side.c, U = 16;
    boxes.push({ p: [((x + x1 + 1) / 2 - w / 2) * U, ((y + y1 + 1) / 2) * U, ((z + z1 + 1) / 2 - d / 2) * U], s: [(x1 - x + 1) * U, (y1 - y + 1) * U, (z1 - z + 1) * U], r: [0, 0, 0], c, shade: ['terrain', 'plant', 'stone'].includes(B.cat) ? 1 : 0, seg: 1 });
  }
  // 放进六边形岛时：占地最长边约 0.3 个单位（和小屋差不多大），太小的东西不再缩
  const size = Math.max(0.05, Math.min(4, 0.3 / (Math.max(w, d) * 16 * HEX_UNIT)));
  return { id: 'mk' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, use: 'prop', behavior: 'still', size, parts: [{ name: '建筑', pivot: [0, 0, 0], boxes, motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, seed: 0 }] };
}
