// 造物台的「生态」：自己定一种新地块——地面的三种颜色（主色、暗斑、亮斑）、起伏、地势高低、草和花的多少与颜色、
// 长哪些植物（原有的树、灌木、石头，或者“我的造物”里的植物）各占多少。
// 保存在本机（和“我的造物”一样，所有岛共用）；六边形岛读档时登记成新地块，出现在地块栏「✦ 我造的」里，和原有地块一样铺。
// AI 也能一句话生成一个生态，再看着预览图精修。
import * as THREE from 'three';
import { kit } from '../hq/dressing.js';
import { loadMakes, mergedGeo, HEX_UNIT } from './model.js';
import { shade } from '../artsop.js';

const STORE = 'yujian_biomes_v1';
export function loadBiomes() { try { const a = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(a) ? a.filter((b) => b && b.id && b.name) : []; } catch { return []; } }
export function saveBiomes(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } }
/** 登记进六边形岛时用的地块类型 id */
export const tileId = (b) => 'bm_' + b.id;
/** 登记用的格式（和 AI 造岛的生态一样，多一个“我造的”标记） */
export const asType = (b) => ({ ...b, id: tileId(b), mine: true });

/** 原有植物（v：同一种树的哪个变体；s：种下时的大小，石头本身很大要缩小） */
export const BASE_PLANTS = [
  { id: 'con', name: '松树' }, { id: 'broad', v: 0, name: '阔叶树' }, { id: 'broad', v: 1, name: '嫩绿树' }, { id: 'broad', v: 3, name: '秋叶树' }, { id: 'broad', v: 4, name: '樱花树' },
  { id: 'bush', name: '灌木' }, { id: 'palm', name: '椰子树' }, { id: 'reed', name: '芦苇' }, { id: 'rock', s: 0.07, name: '石头' },
];
export const plantKey = (p) => p.id + (p.v != null ? ':' + p.v : '');
/** 可以长在生态里的植物：原有的 + 我造的植物 */
export function plantOptions() { return [...BASE_PLANTS, ...loadMakes().filter((m) => m.use === 'plant').map((m) => ({ id: 'mk_' + m.id, name: m.name, mine: true }))]; }
const newId = () => 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
export function newBiome() {
  return { id: newId(), name: '新生态', colors: ['#7fae4a', shade('#7fae4a', -0.07), shade('#7fae4a', 0.07)], height: 0.45, roughness: 0.3, grass: 0.6, grassColor: '#8cc043', flowers: 0.3, flowerColors: ['#f2c45a', '#f080a8', '#f4f0e8'], plants: [{ id: 'broad', v: 0, name: '阔叶树', density: 0.15 }, { id: 'bush', name: '灌木', density: 0.2 }] };
}
/** 主色 → 三种地面色（暗斑、亮斑同色相） */
export const groundColors = (main) => [main, shade(main, -0.07), shade(main, 0.07)];

const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const hex = (c, def) => (typeof c === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c.trim()) ? '#' + c.trim().replace('#', '').toLowerCase() : def);
/** AI 或存档给的生态做一遍清洗：数值夹在范围里、颜色合法；植物按名字对上可选的植物（对不上的丢掉） */
export function sanitizeBiome(d, opts = plantOptions()) {
  const main = hex(d.colors?.[0], '#7fae4a'), byName = new Map(opts.map((o) => [o.name, o])), byKey = new Map(opts.map((o) => [plantKey(o), o]));
  const plants = [];
  for (const p of d.plants || []) {
    const o = byKey.get(plantKey(p)) || byName.get(String(p.name || '').trim()); if (!o || plants.some((x) => plantKey(x) === plantKey(o))) continue;
    plants.push({ ...o, mine: undefined, density: num(p.density, 0, 1, 0.3) }); if (plants.length >= 6) break;
  }
  const fc = (d.flowerColors || []).map((c) => hex(c, null)).filter(Boolean).slice(0, 4);
  return {
    name: String(d.name || '新生态').replace(/[\s"'<>]/g, '').slice(0, 8) || '新生态',
    colors: [main, hex(d.colors?.[1], shade(main, -0.07)), hex(d.colors?.[2], shade(main, 0.07))],
    height: num(d.height, 0.36, 0.5, 0.45), roughness: num(d.roughness, 0, 1, 0.3), grass: num(d.grass, 0, 1, 0.6), grassColor: hex(d.grassColor, '#8cc043'),
    flowers: num(d.flowers, 0, 1, 0.2), flowerColors: fc.length ? fc : ['#f2c45a'], plants,
  };
}

// ---------------- 预览：一块六边形地（单位和六边形岛一样：外接圆半径 1） ----------------
const hash = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967295; };
const rng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const INR = Math.sqrt(3) / 2;
const inHex = (x, z, pad = 0) => Math.abs(x) <= INR - pad && Math.abs(z) <= 1 - pad - Math.abs(x) / Math.sqrt(3);
const MAT = { ground: null, plant: null };
const mats = () => { MAT.ground ||= new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }); MAT.plant ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }); return MAT; };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const MK = new Map();
/** 植物几何（岛的单位）：原有的从植被套件里取，我造的按它在岛上的大小生成 */
function plantGeos(p) {
  if (p.id.startsWith('mk_')) {
    let g = MK.get(p.id); if (g === undefined) { const m = loadMakes().find((x) => 'mk_' + x.id === p.id); g = m ? mergedGeo(m) : null; if (g) { const k = HEX_UNIT * (m.size || 1); g.scale(k, k, k); } MK.set(p.id, g); }
    return g ? [g] : [];
  }
  const K = kit()[p.id] || []; return p.v != null ? (K[p.v] ? [K[p.v]] : []) : K;
}
/** 生态 → 预览模型（Group）：方格地面（三种颜色斑驳、按起伏高低不平）+ 方块草 + 方块花 + 植物（数量和岛上一块地一样多） */
export function biomePreview(b, seed = 7) {
  const R = rng(seed), M = mats(), G = new THREE.Group(), cs = b.colors.map((c) => new THREE.Color(c)), top = 0.12, v = 0.1, m4 = new THREE.Matrix4(), col = new THREE.Color();
  // 地面：一格一格的方块
  const cells = []; for (let i = -9; i <= 9; i++) for (let k = -10; k <= 10; k++) { const x = i * v, z = k * v; if (inHex(x, z, 0.02)) cells.push([x, z]); }
  const ground = new THREE.InstancedMesh(BOX, M.ground, cells.length);
  cells.forEach(([x, z], i) => {
    const h = top + (hash(i * 13 + 5) - 0.5) * 0.05 * b.roughness + Math.sin(x * 4.1 + z * 2.3) * 0.02 * b.roughness;
    m4.makeScale(v, h, v).setPosition(x, h / 2, z); ground.setMatrixAt(i, m4);
    const r = hash(i * 7 + 1); ground.setColorAt(i, col.copy(cs[r < 0.6 ? 0 : r < 0.8 ? 1 : 2]).multiplyScalar(0.94 + hash(i * 3) * 0.1));
  });
  ground.castShadow = false; ground.receiveShadow = true; G.add(ground);
  const at = () => { for (let k = 0; k < 30; k++) { const x = (R() * 2 - 1) * INR, z = R() * 2 - 1; if (inHex(x, z, 0.06)) return [x, z]; } return [0, 0]; };
  // 草：方柱草茎
  const nG = Math.round(b.grass * 320), gc = new THREE.Color(b.grassColor);
  if (nG) { const g = new THREE.InstancedMesh(BOX, M.ground, nG); for (let i = 0; i < nG; i++) { const [x, z] = at(), h = 0.035 + R() * 0.05; m4.makeScale(0.018, h, 0.018).setPosition(x, top + h / 2, z); g.setMatrixAt(i, m4); g.setColorAt(i, col.copy(gc).multiplyScalar(0.7 + R() * 0.45)); } G.add(g); }
  // 花：细茎 + 一颗方花头
  const nF = Math.round(b.flowers * 90), fcs = b.flowerColors.map((c) => new THREE.Color(c));
  if (nF && fcs.length) {
    const st = new THREE.InstancedMesh(BOX, M.ground, nF), hd = new THREE.InstancedMesh(BOX, M.ground, nF);
    for (let i = 0; i < nF; i++) { const [x, z] = at(), h = 0.05 + R() * 0.04; m4.makeScale(0.008, h, 0.008).setPosition(x, top + h / 2, z); st.setMatrixAt(i, m4); st.setColorAt(i, col.set(0x3f7a2e)); m4.makeScale(0.03, 0.018, 0.03).setPosition(x, top + h, z); hd.setMatrixAt(i, m4); hd.setColorAt(i, col.copy(fcs[i % fcs.length])); }
    G.add(st, hd);
  }
  // 植物：密度 0–1 → 0–14 株（和岛上一块地一样），互相隔开一点
  const taken = [];
  for (const p of b.plants || []) {
    const geos = plantGeos(p); if (!geos.length) continue;
    const n = Math.round(Math.max(0, Math.min(1, p.density)) * 14);
    for (let i = 0; i < n; i++) {
      let pos = null; for (let k = 0; k < 20 && !pos; k++) { const [x, z] = at(); if (taken.every(([a, c]) => Math.hypot(a - x, c - z) > 0.12)) pos = [x, z]; }
      if (!pos) continue; taken.push(pos);
      const mesh = new THREE.Mesh(geos[Math.floor(R() * geos.length)], M.plant), s = (0.8 + R() * 0.45) * (p.s || 1);
      mesh.position.set(pos[0], top, pos[1]); mesh.scale.setScalar(s); mesh.rotation.y = R() * 6.28; mesh.castShadow = true; G.add(mesh);
    }
  }
  // 地块侧面：主色压暗
  const side = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, top * 0.9, 6), new THREE.MeshStandardMaterial({ color: cs[0].clone().multiplyScalar(0.55), roughness: 0.95 }));
  side.position.y = top * 0.45; G.add(side);
  G.userData.dispose = () => { side.geometry.dispose(); side.material.dispose(); for (const o of G.children) if (o.isInstancedMesh) o.dispose(); };
  return G;
}
