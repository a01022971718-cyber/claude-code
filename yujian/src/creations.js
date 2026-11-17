// AI 造物登记处：AI 设计出来的新生态、新植物、新动物，存在自由画布的存档里（s.custom），
// 读档或新造出来以后在这里“登记”进游戏：新生态变成一种新地块（地形配色、起伏、长什么草和花、种哪些新植物），
// 新植物按配方生成模型放进植被套件，新动物交给动物层；三者都出现在建造栏里（名字前带 ✦），可以和原有素材一样随意摆放。
import { ITEMS } from './catalog.js';
import { TYPES } from './hq/terrain.js';
import { kit } from './hq/dressing.js';
import { plantGeo, col } from './hq/forge.js';
import { STYLE } from './hq/blocky.js';

export const CUSTOM = { biomes: new Map(), plants: new Map(), creatures: new Map() };
const hex = (c) => '#' + c.getHexString();

/** 把一份 s.custom 登记进游戏（重复调用会先撤掉上一次登记的） */
export function registerAll(custom = {}) {
  for (const k of Object.keys(ITEMS)) ITEMS[k] = ITEMS[k].filter((it) => !it.ai);
  for (const id of CUSTOM.biomes.keys()) delete TYPES[id];
  CUSTOM.biomes.clear(); CUSTOM.plants.clear(); CUSTOM.creatures.clear();
  const K = kit(), voxel = STYLE.blocky;
  for (const p of custom.plants || []) {
    CUSTOM.plants.set(p.id, p);
    if (!K[p.id]) { const g = plantGeo(p, voxel); g.userData.shared = true; K[p.id] = [g]; K[p.id].shadow = (+p.height || 0) > 0.35; }
    const H = +p.height || 0.6;
    ITEMS.plant.push({ id: p.id, name: '✦' + p.name, g: ['tree', 'conifer', 'palm'].includes(p.form) ? '树木' : p.form === 'crystal' ? '岩石' : '花草', kit: p.id, v: 0, s: 1, r: Math.max(0.06, Math.min(0.25, H * 0.25)), ai: true });
  }
  for (const b of custom.biomes || []) {
    CUSTOM.biomes.set(b.id, b);
    const c = (b.colors || []).map((x, i) => col(x, ['#7fae4a', '#5f8f3a', '#a8c860'][i]).getHex());
    while (c.length < 3) c.push(c[0] ?? 0x7fae4a);
    TYPES[b.id] = { h: Math.max(0.36, Math.min(0.5, +b.height || 0.45)), c, surf: [1, Math.min(0.6, +b.roughness || 0) * 0.5, 0], custom: b };
    ITEMS.land.push({ id: b.id, name: '✦' + b.name, g: (+b.height || 0.45) < 0.4 ? '水边' : (+b.roughness || 0) > 0.6 ? '山石' : '草木', tile: b.id, sw: hex(col(b.colors?.[0])), ai: true });
  }
  for (const a of custom.creatures || []) {
    CUSTOM.creatures.set(a.id, a);
    ITEMS.animal.push({ id: a.id, name: '✦' + a.name, g: a.move === 'fly' ? '天上' : a.habitat === 'sea' || a.move === 'swim' ? '水边' : '陆地', creature: a.id, ai: true, note: a.habitat === 'sea' ? '放在近岸的海面上' : null });
  }
}
/** 按名字找 AI 造物（AI 造岛时，布局里用名字引用新生态、新植物、新动物） */
export function byName(kind, name) { for (const v of CUSTOM[kind].values()) if (v.name === name || v.id === name) return v; return null; }
