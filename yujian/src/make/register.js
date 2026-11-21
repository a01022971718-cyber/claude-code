// 把“我的造物”登记进六边形岛的建造栏：动物 / 生物进「动物」，植物进「植物」，建筑摆件进「建筑」，都带「✦ 我造的」标记。
import { ITEMS } from '../catalog.js';
import * as THREE from 'three';
import { loadMakes, bounds, HEX_UNIT, mergedGeo } from './model.js';
import { kit } from '../hq/dressing.js';

export const MAKES = new Map();
export const MINE_GROUP = '✦ 我造的';
export function registerMakes() {
  for (const k of Object.keys(ITEMS)) ITEMS[k] = ITEMS[k].filter((it) => !(it.mine && it.make));   // 只撤造物（造物台做的生态由 registerAll 管）
  MAKES.clear();
  for (const m of loadMakes()) {
    MAKES.set(m.id, m);
    const bb = bounds(m), sz = (m.size || 1) * HEX_UNIT, r = Math.max(0.04, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * sz * 0.5), tall = (bb.max.y - bb.min.y) * sz;
    const base = { id: 'mk_' + m.id, name: '✦' + m.name, make: m.id, mine: true, r };
    if (m.use === 'creature') ITEMS.animal.push({ ...base, g: m.behavior === 'fly' ? '天上' : m.behavior === 'swim' ? '水边' : '陆地', water: m.behavior === 'swim', note: m.behavior === 'swim' ? '放在近岸的海面上' : null });
    else if (m.use === 'plant') {
      ITEMS.plant.push({ ...base, g: tall > 0.25 ? '树木' : '花草' });
      // 也登记成植被：新生态可以成片长这种植物（静态模型，按高度随风摆）
      const K = kit(), key = 'mk_' + m.id;
      if (!K[key]) { const g = mergedGeo(m); if (g) { g.scale(sz, sz, sz); const P = g.attributes.position, w = new Float32Array(P.count); for (let i = 0; i < P.count; i++) w[i] = Math.max(0, P.getY(i)) / Math.max(0.05, tall); g.setAttribute('wind', new THREE.BufferAttribute(w, 1)); g.userData.shared = true; K[key] = [g]; K[key].shadow = tall > 0.35; } }
    }
    else ITEMS.build.push({ ...base, g: '生活' });
  }
}
