// 自由画布能摆的东西：分成 6 类。每一项说明它是什么（地块 / 植物 / 动物 / 建筑 / 海洋 / 天空）以及怎么放。
// 只是数据：渲染在 hq/items.js，放置规则在 canvas.js。以后的生态包（付费皮肤）在这里按 pack 加条目即可。
export const CATEGORIES = [
  { id: 'land', name: '岛屿', icon: 'land', hint: '点海面加一块地，点已有的地换成这一种' },
  { id: 'plant', name: '植物', icon: 'plant', hint: '点岛上的空地种下' },
  { id: 'animal', name: '动物', icon: 'animal', hint: '点岛上放下，它们会自己走动' },
  { id: 'build', name: '建筑', icon: 'build', hint: '点岛上摆放；小船和浮标放在海面上' },
  { id: 'sea', name: '海洋', icon: 'sea', hint: '点一下切换海水，或唤来海里的大家伙' },
  { id: 'sky', name: '天空', icon: 'sky', hint: '点一下换时段' },
];

/** 每一类里的小分类（建造栏顶上的筛选标签）。「✦ AI 造物」只在有 AI 造的东西时出现 */
export const GROUPS = { land: ['草木', '山石', '田园', '水边'], plant: ['树木', '花草', '岩石'], animal: ['陆地', '水边', '天上'], build: ['地标', '生活', '海上'] };
export const AI_GROUP = '✦ AI 造物';
// g：小分类；sw：色块（地块用）；rare：稀有生态，发现以后才能自由放
export const ITEMS = {
  land: [
    { id: 'meadow', name: '草地', g: '草木', tile: 'meadow', sw: '#8cc043' },
    { id: 'flowers', name: '花田', g: '草木', tile: 'flowers', sw: '#c9d45e' },
    { id: 'forest', name: '森林', g: '草木', tile: 'forest', sw: '#4f7f31' },
    { id: 'mountain', name: '岩山', g: '山石', tile: 'mountain', sw: '#9aa0a8' },
    { id: 'quarry', name: '采石场', g: '山石', tile: 'quarry', sw: '#a09468' },
    { id: 'field', name: '菜地', g: '田园', tile: 'field', sw: '#c4824a' },
    { id: 'wheat', name: '麦田', g: '田园', tile: 'wheat', sw: '#e0b24c' },
    { id: 'beach', name: '沙滩', g: '水边', tile: 'beach', sw: '#ecdcae' },
    { id: 'camp', name: '营地', g: '田园', tile: 'camp', sw: '#b3a06a' },
    { id: 'stream', name: '溪流', g: '水边', tile: 'stream', sw: '#4fb3c8', rare: true },
    { id: 'pond', name: '池塘', g: '水边', tile: 'pond', sw: '#3f8f7a', rare: true },
  ],
  plant: [
    { id: 'pine', name: '松树', g: '树木', kit: 'con', v: 1, s: 1.1, r: 0.13 },
    { id: 'oak', name: '阔叶树', g: '树木', kit: 'broad', v: 0, s: 1, r: 0.2 },
    { id: 'sakura', name: '樱花树', g: '树木', kit: 'broad', v: 4, s: 0.95, r: 0.2 },
    { id: 'maple', name: '秋叶树', g: '树木', kit: 'broad', v: 3, s: 0.95, r: 0.2 },
    { id: 'bush', name: '灌木', g: '花草', kit: 'bush', v: 0, s: 1.1, r: 0.08 },
    { id: 'palm', name: '椰子树', g: '树木', kit: 'palm', v: 0, s: 1, r: 0.2 },
    { id: 'reed', name: '芦苇', g: '花草', kit: 'reed', v: 0, s: 1.2, r: 0.05 },
    { id: 'boulder', name: '巨石', g: '岩石', kit: 'rock', v: 0, s: 0.16, r: 0.14 },
  ],
  animal: [
    { id: 'deer', name: '鹿', g: '陆地', animal: 'deer' },
    { id: 'sheep', name: '羊', g: '陆地', animal: 'sheep' },
    { id: 'rabbit', name: '野兔', g: '陆地', animal: 'rabbit' },
    { id: 'crab', name: '螃蟹', g: '水边', animal: 'crab', note: '只在沙滩上' },
  ],
  build: [
    { id: 'lighthouse', name: '灯塔', g: '地标', prop: 'lighthouse', s: 1, r: 0.4 },
    { id: 'windmill', name: '风车', g: '地标', prop: 'windmill', s: 1, r: 0.42 },
    { id: 'belltower', name: '钟楼', g: '地标', prop: 'bellTower', s: 1, r: 0.36 },
    { id: 'hut', name: '茅屋', g: '生活', prop: 'strawHut', s: 1.05, r: 0.34 },
    { id: 'campfire', name: '营火', g: '生活', prop: 'campfire', s: 1, r: 0.16, fire: true },
    { id: 'woodpile', name: '柴堆', g: '生活', prop: 'woodPile', s: 1, r: 0.14 },
    { id: 'fence', name: '篱笆', g: '生活', prop: 'fence', s: 1, r: 0.18 },
    { id: 'signpost', name: '路牌', g: '生活', prop: 'signpost', s: 1, r: 0.08 },
    { id: 'boat', name: '小船', g: '海上', prop: 'rowBoat', s: 1.2, water: true },
    { id: 'buoy', name: '浮标', g: '海上', prop: 'buoy', s: 1, water: true },
  ],
  sea: [
    { id: 'sea-clear', name: '清澈浅滩', sea: 'clear', sw: '#3fc6c0' },
    { id: 'sea-jade', name: '碧玉海湾', sea: 'jade', sw: '#2fae8a' },
    { id: 'sea-deep', name: '深蓝外海', sea: 'deep', sw: '#1b4f8a' },
    { id: 'whale', name: '唤来鲸', event: 'whale' },
    { id: 'dolphins', name: '海豚跃水', event: 'dolphins' },
  ],
  sky: [
    { id: 'real', name: '跟随现实', hour: null },
    { id: 'dawn', name: '清晨', hour: 7 },
    { id: 'noon', name: '正午', hour: 12 },
    { id: 'after', name: '午后', hour: 15.5 },
    { id: 'golden', name: '黄昏', hour: 18.3 },
    { id: 'night', name: '夜晚', hour: 22 },
  ],
};
export const findItem = (id) => { for (const list of Object.values(ITEMS)) { const it = list.find((x) => x.id === id); if (it) return it; } return null; };

// 新画布的起点：和高画质样张同一座岛（溪流穿过草地流进池塘、从南岸落进海里，东边有灯塔小岛）
export const STARTER = {
  tiles: [
    [0, -2, 'forest'], [1, -2, 'mountain'], [2, -2, 'mountain'], [3, -2, 'forest'],
    [-1, -1, 'forest'], [0, -1, 'camp'], [1, -1, 'field'], [2, -1, 'mountain'], [3, -1, 'meadow'],
    [-2, 0, 'forest'], [-1, 0, 'meadow'], [0, 0, 'flowers'], [1, 0, 'stream'], [2, 0, 'wheat'],
    [-2, 1, 'quarry'], [-1, 1, 'flowers'], [0, 1, 'stream'], [1, 1, 'flowers'], [2, 1, 'beach'],
    [-2, 2, 'quarry'], [-1, 2, 'pond'], [0, 2, 'stream'],
    [5, -3, 'islet'], [6, -3, 'islet'],
  ],
  items: [
    { k: 'lighthouse', x: 6.01, z: -4.45, ry: -0.5 },
    { k: 'boat', x: 5.75, z: 2.45, ry: 0.8 },
    { k: 'buoy', x: 5.2, z: 3.6 }, { k: 'buoy', x: -3.4, z: 4.2 },
    { k: 'fence', x: 2.35, z: -1.05, ry: -0.5 }, { k: 'signpost', x: 1.4, z: -1.92, ry: 0.6 },
  ],
  cam: { x: 0.9, z: 0.2, yaw: -0.45, pitch: 0.58, dist: 20 },
};
