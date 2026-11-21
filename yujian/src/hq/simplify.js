// 远处用的简化模型：顶点聚类减面（把落在同一个小格子里的顶点合成一个，退化的三角形扔掉）。
// 好处：对任何模型都能用，所有顶点属性（颜色、风摆、翅膀权重……）都按平均值保留，动画照常；
// 代价：细节变粗，所以只给“在屏幕上只有几十个像素”的远处物体用。结果按几何缓存，同一个模型只算一次。
import * as THREE from 'three';

const CACHE = new WeakMap();
/** res：沿模型最长边分多少格（越小越粗）。返回新的索引几何；减不掉多少时返回原几何 */
export function simplify(src, res = 9) {
  let byRes = CACHE.get(src); if (!byRes) CACHE.set(src, byRes = new Map());
  if (byRes.has(res)) return byRes.get(res);
  const out = build(src, res); byRes.set(res, out); return out;
}
export const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function build(src, res) {
  const pos = src.attributes.position, n = pos.count;
  src.computeBoundingBox(); const bb = src.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const cell = Math.max(size.x, size.y, size.z, 1e-6) / res;
  const names = Object.keys(src.attributes).filter((k) => !src.attributes[k].isInstancedBufferAttribute);
  // 每个顶点落在哪一格
  // 朝向也算进格子：法线主方向不同的顶点不合并（正反两面的薄片——翅膀、叶片——法线相反，平均后会变成零，光照就坏了）
  const key = new Map(), cellOf = new Int32Array(n), nor = src.attributes.normal; let cells = 0;
  const side = (i) => { if (!nor) return ''; const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i), ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); return ax >= ay && ax >= az ? (x > 0 ? 'a' : 'b') : ay >= az ? (y > 0 ? 'c' : 'd') : (z > 0 ? 'e' : 'f'); };
  for (let i = 0; i < n; i++) {
    const k = Math.floor((pos.getX(i) - bb.min.x) / cell) + ',' + Math.floor((pos.getY(i) - bb.min.y) / cell) + ',' + Math.floor((pos.getZ(i) - bb.min.z) / cell) + side(i);
    let c = key.get(k); if (c === undefined) key.set(k, c = cells++); cellOf[i] = c;
  }
  // 格子的代表顶点 = 格子里所有顶点属性的平均
  const sums = {}, cnt = new Float32Array(cells);
  for (const nm of names) sums[nm] = new Float32Array(cells * src.attributes[nm].itemSize);
  for (let i = 0; i < n; i++) {
    const c = cellOf[i]; cnt[c]++;
    for (const nm of names) { const a = src.attributes[nm], s = a.itemSize, arr = sums[nm]; for (let j = 0; j < s; j++) arr[c * s + j] += a.getComponent(i, j); }
  }
  for (const nm of names) { const s = src.attributes[nm].itemSize, arr = sums[nm]; for (let c = 0; c < cells; c++) for (let j = 0; j < s; j++) arr[c * s + j] /= cnt[c]; }
  if (sums.normal) { const N = sums.normal; for (let c = 0; c < cells; c++) { const l = Math.hypot(N[c * 3], N[c * 3 + 1], N[c * 3 + 2]); if (l < 1e-4) { N[c * 3] = 0; N[c * 3 + 1] = 1; N[c * 3 + 2] = 0; } else { N[c * 3] /= l; N[c * 3 + 1] /= l; N[c * 3 + 2] /= l; } } }
  // 三角形换成格子编号，三个角落在不同格子的才留下（同一组三个格子只留一个）
  const idx = src.index, tri = idx ? idx.count / 3 : n / 3, out = [], seen = new Set();
  for (let t = 0; t < tri; t++) {
    const a = cellOf[idx ? idx.getX(t * 3) : t * 3], b = cellOf[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c = cellOf[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    // 转到最小编号打头（保持绕向）：同一面重复的去掉，正反两面（双面叶片）都留
    const kk = a < b && a < c ? a + ',' + b + ',' + c : b < c ? b + ',' + c + ',' + a : c + ',' + a + ',' + b;
    if (seen.has(kk)) continue; seen.add(kk); out.push(a, b, c);
  }
  if (out.length / 3 > tri * 0.75) return src;   // 减不掉多少：不值得
  const g = new THREE.BufferGeometry();
  for (const nm of names) { const a = src.attributes[nm]; g.setAttribute(nm, new THREE.BufferAttribute(sums[nm], a.itemSize, a.normalized)); }
  g.setIndex(out); g.computeBoundingSphere(); g.userData = { ...src.userData, shared: true, simplified: true };
  return g;
}
