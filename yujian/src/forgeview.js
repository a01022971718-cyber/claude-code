// 造物对比图：把游戏原有素材（风格标准）和这次新设计的生态、植物、动物，按同一比例从左到右并排渲染成一张图。
// 用处：① 给玩家看 AI 画出来的东西；② 交给视觉模型按 SOP 清单审图（“和原有素材像不像同一个游戏”）。
import * as THREE from 'three';
import { thumb, thumbMaterial } from './thumbs.js';
import { kit } from './hq/dressing.js';
import { plantGeo, creatureParts, col } from './hq/forge.js';
import * as L0 from './hq/models-land.js';
import * as BK from './hq/blocky.js';
import { mergedGeo, HEX_UNIT } from './make/model.js';

const animal = (name) => { const L = BK.STYLE.blocky && BK[name] ? BK : L0, m = L[name](1), g = new THREE.Group(); if (m.parts) for (const p of Object.values(m.parts)) g.add(new THREE.Mesh(p.geometry, thumbMaterial())); else g.add(new THREE.Mesh(m.geometry || m, thumbMaterial())); return g; };
/** 新生态的样块：一小块六边形地面，按生态的三种地面色斑驳上色，上面一圈草色 */
function biomeSample(b) {
  const g = new THREE.CylinderGeometry(0.42, 0.44, 0.12, 6, 1).toNonIndexed(), p = g.attributes.position, c = new Float32Array(p.count * 3), cs = (b.colors || []).map((x) => col(x)), gc = col(b.grassColor || b.colors?.[0]);
  for (let i = 0; i < p.count; i++) { const k = Math.abs(Math.sin(p.getX(i) * 13.1 + p.getZ(i) * 7.7)) * cs.length | 0, t = p.getY(i) > 0.05 ? gc.clone().lerp(cs[k] || gc, 0.5) : (cs[0] || gc).clone().multiplyScalar(0.6); c.set([t.r, t.g, t.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.translate(0, 0.06, 0); g.computeVertexNormals();
  const m = new THREE.Group(); m.add(new THREE.Mesh(g, thumbMaterial()));
  const n = Math.round((b.grass ?? 0.5) * 40);
  for (let i = 0; i < n; i++) { const a = i * 2.4, r = 0.36 * Math.sqrt((i + 0.5) / n), bl = new THREE.ConeGeometry(0.012, 0.07, 3).toNonIndexed(), q = bl.attributes.position, cc = new Float32Array(q.count * 3); for (let j = 0; j < q.count; j++) { const t = gc.clone().multiplyScalar(0.7 + q.getY(j) * 5); cc.set([t.r, t.g, t.b], j * 3); } bl.setAttribute('color', new THREE.BufferAttribute(cc, 3)); bl.translate(Math.cos(a) * r, 0.155, Math.sin(a) * r); m.add(new THREE.Mesh(bl, thumbMaterial())); }
  return m;
}
/** 一排东西按同一比例从左到右摆开，渲染成一张图 */
function row(items, w, h) {
  const root = new THREE.Group(), box = new THREE.Box3(), sz = new THREE.Vector3();
  let x = 0;
  for (const [, o] of items) { box.setFromObject(o); box.getSize(sz); const ww = Math.max(sz.x, sz.z, 0.03); o.position.x = x + ww / 2 - (box.min.x + box.max.x) / 2; o.position.y = -box.min.y; root.add(o); x += ww + Math.max(0.03, ww * 0.25); }
  return thumb(root, { w, h, wide: true, pitch: 0.28, yaw: -0.18, bg: 0xe6eef0 });
}
const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
/** design: { biomes, plants, creatures } → { url, labels }。上排：生态和植物（对照原有的树和灌木）；下排：动物（对照原有的鹿和兔子），两排各自同比例 */
export async function lineup(design, voxel = BK.STYLE.blocky) {
  const K = kit(), top = [['原有·阔叶树', new THREE.Mesh(K.broad[0], thumbMaterial())], ['原有·松树', new THREE.Mesh(K.con[1], thumbMaterial())], ['原有·灌木', new THREE.Mesh(K.bush[0], thumbMaterial())]];
  for (const b of design.biomes || []) top.push(['新生态·' + b.name, biomeSample(b)]);
  for (const p of design.plants || []) top.push(['新植物·' + p.name, new THREE.Mesh(plantGeo(p, voxel), thumbMaterial())]);
  // 用造物台方式搭的新物种：按它在岛上的实际大小渲染
  const mk = (m) => { const g = mergedGeo(m), k = HEX_UNIT * (m.size || 1); g.scale(k, k, k); return new THREE.Mesh(g, thumbMaterial()); };
  for (const m of design.makes || []) if (m.use === 'plant') top.push(['新植物·' + m.name, mk(m)]);
  const bot = [['原有·鹿', animal('deer')], ['原有·兔子', animal('rabbit')]];
  for (const m of design.makes || []) if (m.use !== 'plant') bot.push(['新动物·' + m.name, mk(m)]);
  for (const a of design.creatures || []) { const P = creatureParts(a, voxel), g = new THREE.Group(); g.add(new THREE.Mesh(P.body, thumbMaterial())); for (const l of [...P.legs, ...P.wings]) g.add(new THREE.Mesh(l.geo, thumbMaterial())); bot.push(['新动物·' + a.name, g]); }
  const W = 1280, u1 = row(top, W, 380), u2 = bot.length > 2 ? row(bot, W, 300) : '';
  for (const [n, o] of [...top, ...bot]) if (!n.startsWith('原有')) o.traverse((m) => m.isMesh && m.geometry.dispose());
  const labels = top.map(([n]) => n), labels2 = bot.length > 2 ? bot.map(([n]) => n) : [];
  if (!u2) return { url: u1, labels, labels2 };
  const [i1, i2] = await Promise.all([load(u1), load(u2)]); if (!i1 || !i2) return { url: u1, labels, labels2: [] };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 380 + 300 + 6; const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(i1, 0, 0); g.drawImage(i2, 0, 386);
  return { url: cv.toDataURL('image/jpeg', 0.86), labels, labels2 };
}
