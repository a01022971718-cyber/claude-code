// 造物：玩家（以后也包括 AI）自由搭出来的东西——动物、植物、建筑摆件，什么都行。
// 做法参考了方块建模工具（任意大小的长方块，编成部件，绕关节点动），融入我们自己的“原版手感”：
//  - 每一块都自动加圆角：大块圆角明显、小零件圆角小、极小的点缀是直角（原版羊、鹿就是这样）；
//  - 底部自动压暗（大块压得多、小零件几乎不压），像黏土玩具在阳光下；
//  - 开了“色组”的块，同一种颜色在几级深浅里自动交错（原版树冠、羊毛那种丰富感），顶面略亮；
//  - 颜色、大小、形状、数量都不限制——风格靠手感统一，不靠限制你能造什么。
// 单位：1 小格。模型面朝 +z，脚底在 y = 0。放进六边形岛时 1 小格 ≈ 0.0065 个单位（16 小格高 ≈ 一只羊）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HEX_UNIT = 0.0065;
const STORE = 'yujian_makes_v1';
export const USES = { creature: '动物 / 生物', plant: '植物', prop: '建筑 / 摆件' };
export const BEHAVIORS = { walk: '走', hop: '跳', fly: '飞', swim: '游（海面）', float: '漂浮', still: '不动' };
export const MOTIONS = { none: '不动', walk: '走路时摆（腿）', swing: '来回摆', flap: '扇动（翅膀）', spin: '旋转', bob: '上下浮动', sway: '随风摆（树冠）', pulse: '伸缩' };

const hash = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967295; };

/** 一块长方块 → 带“原版手感”的几何（以部件关节点为原点） */
export function boxGeo(b, i, pivot = [0, 0, 0]) {
  const [w, h, d] = b.s.map((v) => Math.max(0.25, +v || 1)), m = Math.min(w, h, d);
  const seg = b.seg != null ? b.seg : m >= 3 ? 2 : m >= 1.5 ? 1 : 0, rad = b.seg != null ? Math.min(m * 0.22, 3) : m * (m >= 3 ? 0.22 : 0.3);   // 蓝图转来的大块用一段圆角（面少）
  let g = seg ? new RoundedBoxGeometry(w, h, d, seg, Math.min(rad, m / 2 - 0.01)) : new THREE.BoxGeometry(w, h, d);
  if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv');
  const base = new THREE.Color(b.c || '#c9a07a'), t = new THREE.Color(), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  // 色组：每块在几级深浅里取一级（同色的相邻块不会一样亮），色相也带一点点变化
  if (b.shade) { const k = hash(i * 7 + 3), hsl = {}; base.getHSL(hsl); base.setHSL((hsl.h + (k - 0.5) * 0.025 + 1) % 1, hsl.s * (0.92 + k * 0.14), Math.min(0.95, hsl.l * (0.86 + k * 0.26))); }
  const ao = h >= 3 ? 0.2 : h >= 1.5 ? 0.1 : 0.03, lite = b.shade ? 0.07 : 0.03;
  for (let v = 0; v < n; v++) {
    const f = THREE.MathUtils.clamp((p.getY(v) + h / 2) / h, 0, 1);
    t.copy(base).multiplyScalar((1 - ao * (1 - f)) * (1 + lite * f * f));
    col.set([t.r, t.g, t.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const r = (b.r || [0, 0, 0]).map((a) => THREE.MathUtils.degToRad(+a || 0));
  if (r[0] || r[1] || r[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')));
  g.translate(b.p[0] - pivot[0], b.p[1] - pivot[1], b.p[2] - pivot[2]);
  return g;
}
/** 一个部件 → 合并后的几何（原点在关节点） */
export function partGeo(part) {
  const pv = part.pivot || [0, 0, 0], list = part.boxes.map((b, i) => boxGeo(b, i + (part.seed || 0) * 101, pv));
  if (!list.length) return null;
  const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeBoundingSphere(); g.computeVertexNormals(); return g;
}
/** 整个造物 → { group, parts:[{ obj, part }] }，单位是小格（调用方自己缩放） */
export function buildMake(make, material) {
  const group = new THREE.Group(), parts = [];
  for (const part of make.parts) {
    const geo = partGeo(part); if (!geo) continue;
    const obj = new THREE.Group(); obj.position.fromArray(part.pivot || [0, 0, 0]);
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; mesh.receiveShadow = true; obj.add(mesh);
    group.add(obj); parts.push({ obj, part, mesh });
  }
  return { group, parts };
}
/** 所有部件合成一份几何（缩略图、静态摆放用） */
export function mergedGeo(make) {
  const list = [];
  for (const part of make.parts) { const g = partGeo(part); if (g) { g.translate(...(part.pivot || [0, 0, 0])); list.push(g); } }
  if (!list.length) return null;
  const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeBoundingSphere(); return g;
}
/** 部件动作：按时间（和“是不是在走”）给部件设旋转 / 位移 / 缩放 */
export function animatePart(obj, part, t, moving = true, idx = 0) {
  const k = (+part.amp || 1), sp = (+part.speed || 1), ph = (+part.phase || 0) * Math.PI * 2 + idx * 0.7, ax = part.axis || 'x';
  obj.rotation.set(0, 0, 0); obj.scale.set(1, 1, 1); const base = part.pivot || [0, 0, 0]; obj.position.fromArray(base);
  switch (part.motion) {
    case 'walk': if (moving) obj.rotation[ax] = Math.sin(t * 9 * sp + ph) * 0.55 * k; break;
    case 'swing': obj.rotation[ax] = Math.sin(t * 2.5 * sp + ph) * 0.35 * k; break;
    case 'flap': obj.rotation[ax] = Math.sin(t * 14 * sp + ph) * 0.8 * k; break;
    case 'spin': obj.rotation[ax] = t * 2 * sp + ph; break;
    case 'bob': obj.position.y = base[1] + Math.sin(t * 2 * sp + ph) * 1.2 * k; break;
    case 'sway': obj.rotation.z = Math.sin(t * 1.3 * sp + ph) * 0.06 * k; obj.rotation.x = Math.sin(t * 0.9 * sp + ph * 1.3) * 0.04 * k; break;
    case 'pulse': { const s = 1 + Math.sin(t * 3 * sp + ph) * 0.12 * k; obj.scale.set(s, 1 / Math.sqrt(s), s); break; }
    default: break;
  }
}
/** 造物的外框（小格） */
export function bounds(make) { const b = new THREE.Box3(); for (const p of make.parts) for (const x of p.boxes) { const [w, h, d] = x.s; b.expandByPoint(new THREE.Vector3(x.p[0] - w / 2, x.p[1] - h / 2, x.p[2] - d / 2)); b.expandByPoint(new THREE.Vector3(x.p[0] + w / 2, x.p[1] + h / 2, x.p[2] + d / 2)); } return b; }

// ---------------- 存取 ----------------
export function loadMakes() { try { const a = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(a) ? a.filter((m) => m && m.id && Array.isArray(m.parts)) : []; } catch { return []; } }
export function saveMakes(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } }

// ---------------- 起步模板（只是捷径：从空白开始也行，模板改成什么样都行） ----------------
const B = (p, s, c, o = {}) => ({ p, s, c, r: o.r || [0, 0, 0], shade: o.shade ?? 1 });
const part = (name, pivot, boxes, motion = 'none', o = {}) => ({ name, pivot, boxes, motion, axis: o.axis || 'x', amp: o.amp ?? 1, speed: o.speed ?? 1, phase: o.phase ?? 0 });
export const TEMPLATES = {
  blank: { name: '空白', make: () => ({ name: '新造物', use: 'prop', behavior: 'still', size: 1, parts: [part('主体', [0, 0, 0], [B([0, 2, 0], [4, 4, 4], '#c9a07a')])] }) },
  fluffy: { name: '四足小兽', make: () => {
    const wool = '#ece5d6', face = '#4a3f38', W = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 3; z++) W.push(B([(x - 0.5) * 4.6, 8.6 + y * 4, (z - 1) * 4.9], [5.6 + ((x + y + z) % 2) * 0.8, 5.6, 5.6], wool));
    W.push(B([0, 14.6, -0.6], [6, 4.6, 7.6], wool));
    const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz], i) => part(sx > 0 ? (sz > 0 ? '左前腿' : '左后腿') : (sz > 0 ? '右前腿' : '右后腿'), [sx * 2.4, 7, sz * 4.4], [B([sx * 2.4, 3.6, sz * 4.4], [2.2, 7.2, 2.2], '#3b332e', { shade: 0 })], 'walk', { phase: (i === 0 || i === 3) ? 0 : 0.5 }));
    return { name: '毛团兽', use: 'creature', behavior: 'walk', size: 1, parts: [part('身体', [0, 0, 0], W), part('头', [0, 11, 7], [B([0, 11.4, 10.2], [5.2, 5.2, 5.8], face, { shade: 0 }), B([0, 14.3, 9.6], [5.6, 2.2, 4.6], wool), B([3.7, 12.3, 9], [2.4, 1.4, 1.8], '#3f3530', { r: [0, 0, -17], shade: 0 }), B([-3.7, 12.3, 9], [2.4, 1.4, 1.8], '#3f3530', { r: [0, 0, 17], shade: 0 }), B([1.5, 12.2, 13.2], [0.9, 1.1, 0.5], '#f2ece0', { shade: 0 }), B([-1.5, 12.2, 13.2], [0.9, 1.1, 0.5], '#f2ece0', { shade: 0 })], 'swing', { axis: 'x', amp: 0.4, speed: 0.6 }), ...legs] };
  } },
  bird: { name: '鸟', make: () => ({ name: '小飞鸟', use: 'creature', behavior: 'fly', size: 0.8, parts: [
    part('身体', [0, 0, 0], [B([0, 6, 0], [5, 4.6, 7], '#5f8fc0'), B([0, 5, 0.6], [3.6, 2.4, 5], '#f0e2c8'), B([0, 8.6, 4.2], [4, 4, 4], '#5f8fc0'), B([0, 8.4, 6.8], [1.4, 1, 2], '#f2b84a', { shade: 0 }), B([1.4, 9.2, 5.9], [0.7, 0.8, 0.5], '#1d1a1a', { shade: 0 }), B([-1.4, 9.2, 5.9], [0.7, 0.8, 0.5], '#1d1a1a', { shade: 0 }), B([0, 6.6, -4.6], [3, 1, 3.4], '#4a78a8', { r: [-15, 0, 0] })]),
    part('左翅', [2.4, 7, 0], [B([5.4, 7, 0], [6, 0.9, 5], '#4a78a8')], 'flap', { axis: 'z' }), part('右翅', [-2.4, 7, 0], [B([-5.4, 7, 0], [6, 0.9, 5], '#4a78a8')], 'flap', { axis: 'z', phase: 0.5 })] }) },
  tree: { name: '树', make: () => {
    const T = [], C = [], G = ['#4f8a3a', '#5f9d40', '#3f7530', '#6fa846', '#467f34'];
    for (let i = 0; i < 8; i++) T.push(B([i * 0.12, 1.6 + i * 3.1, 0], [3.4 - i * 0.18, 3.2, 3.4 - i * 0.18], ['#6b5644', '#5a4838', '#75604c'][i % 3]));
    for (let x = -3; x <= 3; x++) for (let y = -2; y <= 2; y++) for (let z = -3; z <= 3; z++) { const e = (x * x + z * z) / 11 + (y * y) / 5; if (e > 1 || e < 0.35) continue; C.push(B([x * 3.2, 31 + y * 3.2, z * 3.2], [3.2, 3.2, 3.2], G[(x * 7 + y * 3 + z * 5 + 50) % 5])); }
    return { name: '方冠树', use: 'plant', behavior: 'still', size: 1, parts: [part('树干', [0, 0, 0], T), part('树冠', [0, 24, 0], C, 'sway')] };
  } },
  flower: { name: '花', make: () => {
    const P = [B([0, 4, 0], [1, 8, 1], '#4f8a34', { shade: 0 }), B([1.4, 3.4, 0], [2.2, 0.6, 1.2], '#5f9d40', { r: [0, 0, 20] })];
    const head = [B([0, 0, 0], [1.6, 1.6, 1.6], '#f2c45a')]; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; head.push(B([Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8], [1.8, 0.6, 1.8], '#f080a8', { r: [0, -i * 60, 0] })); }
    return { name: '转转花', use: 'plant', behavior: 'still', size: 1, parts: [part('茎叶', [0, 0, 0], P), { ...part('花头', [0, 8.4, 0], head, 'spin', { axis: 'y', speed: 0.4 }), boxes: head.map((b) => ({ ...b, p: [b.p[0], b.p[1] + 8.4, b.p[2]] })) }] };
  } },
  jelly: { name: '水母', make: () => {
    const bell = [B([0, 10, 0], [7, 4, 7], '#c8a0e0'), B([0, 12.4, 0], [5, 1.8, 5], '#ddd0ea')], legs = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; legs.push(B([Math.cos(a) * 2.2, 5.6, Math.sin(a) * 2.2], [0.6, 6, 0.6], '#a898c8', { shade: 0 })); }
    return { name: '飘飘母', use: 'creature', behavior: 'float', size: 1, parts: [part('伞盖', [0, 8, 0], bell, 'pulse', { speed: 0.8 }), part('触须', [0, 8.6, 0], legs, 'swing', { axis: 'z', amp: 0.5, speed: 1.4 })] };
  } },
  hut: { name: '小屋', make: () => {
    const W = [];
    W.push(B([0, 5, 0], [14, 10, 12], '#d9c39a'), B([0, 3, 6.1], [3, 6, 0.4], '#6b4a32', { shade: 0 }), B([4, 6, 6.1], [2.6, 2.6, 0.4], '#9fd0e0', { shade: 0 }), B([-4, 6, 6.1], [2.6, 2.6, 0.4], '#9fd0e0', { shade: 0 }));
    for (let i = 0; i < 4; i++) W.push(B([0, 11 + i * 1.6, 0], [16 - i * 4, 1.8, 14 - i * 3.2], '#c4563a'));
    W.push(B([4.5, 15, -2], [2, 5, 2], '#9a948a'));
    return { name: '红顶小屋', use: 'prop', behavior: 'still', size: 2, parts: [part('房子', [0, 0, 0], W)] };
  } },
};
export function newMake(tpl = 'blank') { const m = (TEMPLATES[tpl] || TEMPLATES.blank).make(); m.id = 'mk' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); m.parts.forEach((p, i) => { p.seed = i; }); return m; }
