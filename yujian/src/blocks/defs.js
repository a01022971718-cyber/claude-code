// 方块岛的方块库（第一阶段 30 种）。全部原创：颜色取自《造物手册》色板，花纹由着色器按“花纹编号”程序生成（无像素颗粒感）。
// 每种方块：顶面 / 侧面 / 底面各自的颜色和花纹；glow 发光，glass 半透明，water 水。
// 花纹编号（着色器里同名）：
export const PAT = { plain: 0, grassTop: 1, grassSide: 2, bark: 3, rings: 4, planks: 5, bricks: 6, stone: 7, cobble: 8, roof: 9, thatch: 10, glass: 11, leaves: 12, cloth: 13, books: 14, lantern: 15, sand: 16, paper: 17, marble: 18 };
const P = PAT;
// cat：方块栏分类
export const CATS = [
  { id: 'terrain', name: '地形' }, { id: 'wood', name: '木材' }, { id: 'stone', name: '石材' }, { id: 'roof', name: '屋顶' },
  { id: 'glass', name: '玻璃' }, { id: 'plant', name: '植物' }, { id: 'light', name: '灯具' }, { id: 'deco', name: '装饰' },
];
const B = (key, name, cat, top, side = top, bottom = side, o = {}) => ({ key, name, cat, top: { c: top[0], p: top[1] }, side: { c: side[0], p: side[1] }, bottom: { c: bottom[0], p: bottom[1] }, ...o });
export const BLOCKS = [
  null,   // 0 = 空气
  B('grass', '草地', 'terrain', ['#7fb04a', P.grassTop], ['#8a6a48', P.grassSide], ['#8a6a48', P.stone]),
  B('dirt', '土', 'terrain', ['#8a6a48', P.stone]),
  B('sand', '沙', 'terrain', ['#ecdcae', P.sand]),
  B('stone', '石', 'terrain', ['#9aa0a8', P.stone]),
  B('snow', '雪', 'terrain', ['#f4f6f8', P.sand], ['#f4f6f8', P.sand]),
  B('gravel', '砾石', 'terrain', ['#8a8f96', P.cobble]),
  B('moss', '苔石', 'terrain', ['#6f8a4a', P.cobble], ['#7d8a6a', P.cobble]),
  B('oakLog', '橡木原木', 'wood', ['#b48a5a', P.rings], ['#6b5644', P.bark]),
  B('oakPlank', '橡木板', 'wood', ['#b8875a', P.planks]),
  B('pineLog', '松木原木', 'wood', ['#a07a52', P.rings], ['#4f3423', P.bark]),
  B('pinePlank', '松木板', 'wood', ['#8a5f3a', P.planks]),
  B('sakuraPlank', '樱木板', 'wood', ['#d9a08a', P.planks]),
  B('stoneBrick', '石砖', 'stone', ['#a4a8ae', P.bricks]),
  B('cobble', '鹅卵石路', 'stone', ['#9a948a', P.cobble]),
  B('sandBrick', '砂岩砖', 'stone', ['#e0c890', P.bricks]),
  B('marble', '大理石', 'stone', ['#ece8e0', P.marble]),
  B('roofRed', '红瓦', 'roof', ['#c4563a', P.roof]),
  B('roofBlue', '青瓦', 'roof', ['#4f6f8a', P.roof]),
  B('thatch', '茅草', 'roof', ['#d9b860', P.thatch]),
  B('glass', '透明玻璃', 'glass', ['#dfeef2', P.glass], undefined, undefined, { glass: true }),
  B('paper', '纸窗', 'glass', ['#f4ead2', P.paper], undefined, undefined, { glass: true }),
  B('oakLeaves', '橡树叶', 'plant', ['#5f9d40', P.leaves]),
  B('pineLeaves', '松针', 'plant', ['#2f6b45', P.leaves]),
  B('sakuraLeaves', '樱花叶', 'plant', ['#eea3bc', P.leaves]),
  B('lantern', '灯笼', 'light', ['#f2b84a', P.lantern], undefined, undefined, { glow: 1 }),
  B('glowstone', '萤石', 'light', ['#f7e3a0', P.marble], undefined, undefined, { glow: 0.8 }),
  B('clothWhite', '白布', 'deco', ['#f0ece2', P.cloth]),
  B('clothRed', '红布', 'deco', ['#d85a4a', P.cloth]),
  B('clothBlue', '蓝布', 'deco', ['#4f8fb8', P.cloth]),
  B('books', '书架', 'deco', ['#b8875a', P.planks], ['#8a5f3a', P.books]),
  B('water', '水', 'terrain', ['#3fa0b8', P.plain], undefined, undefined, { water: true }),
];
BLOCKS.forEach((b, i) => { if (b) b.id = i; });
export const ID = Object.fromEntries(BLOCKS.filter(Boolean).map((b) => [b.key, b.id]));
/** 会挡住旁边方块的面（不透明）：玻璃、水不挡 */
export const OPAQUE = BLOCKS.map((b) => !!b && !b.glass && !b.water);
