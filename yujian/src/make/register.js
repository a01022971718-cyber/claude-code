// 把“我的造物”登记进六边形岛的建造栏：动物 / 生物进「动物」，植物进「植物」，建筑摆件进「建筑」，都带「✦ 我造的」标记。
import { ITEMS } from '../catalog.js';
import { loadMakes, bounds, HEX_UNIT } from './model.js';

export const MAKES = new Map();
export const MINE_GROUP = '✦ 我造的';
export function registerMakes() {
  for (const k of Object.keys(ITEMS)) ITEMS[k] = ITEMS[k].filter((it) => !it.mine);
  MAKES.clear();
  for (const m of loadMakes()) {
    MAKES.set(m.id, m);
    const bb = bounds(m), sz = (m.size || 1) * HEX_UNIT, r = Math.max(0.04, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * sz * 0.5), tall = (bb.max.y - bb.min.y) * sz;
    const base = { id: 'mk_' + m.id, name: '✦' + m.name, make: m.id, mine: true, r };
    if (m.use === 'creature') ITEMS.animal.push({ ...base, g: m.behavior === 'fly' ? '天上' : m.behavior === 'swim' ? '水边' : '陆地', water: m.behavior === 'swim', note: m.behavior === 'swim' ? '放在近岸的海面上' : null });
    else if (m.use === 'plant') ITEMS.plant.push({ ...base, g: tall > 0.25 ? '树木' : '花草' });
    else ITEMS.build.push({ ...base, g: '生活' });
  }
}
