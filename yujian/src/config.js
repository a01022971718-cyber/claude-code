// 《屿见》数值与文案配置。所有可调参数集中在这里。
import { PAL } from './palette.js';

export const TOP = 0.25;            // 地块顶面高度（水面在 y=0）
export const HOUR = 3600 * 1000;
export const DAY_RESET_HOUR = 4;    // 每日凌晨 4:00 刷新

export const RES = ['wood', 'stone', 'food'];
export const RES_NAME = { wood: '木头', stone: '石头', food: '食物' };

// 地块：cost 价格，gain 放置时产出，adj 相邻加成，harvest 点击收获
export const TILE = {
  meadow: { name: '草地', cost: { wood: 1 }, gain: { food: 1 }, adj: { types: ['garden', 'wheat'], res: 'food', per: 1 }, tip: '挨着田地，食物更多', weight: 30 },
  forest: { name: '森林', cost: { food: 2 }, gain: { wood: 2 }, adj: { types: ['forest'], res: 'wood', per: 1 }, harvest: { res: 'wood', amount: 3, hours: 4 }, tip: '森林连成片，木头更多', weight: 30 },
  mountain: { name: '山', cost: { wood: 2, food: 2 }, gain: { stone: 3 }, adj: { types: ['mountain'], res: 'stone', per: 1 }, tip: '山连成脉，石头更多', weight: 14 },
  garden: { name: '菜园', cost: { wood: 2, stone: 1 }, gain: { food: 1 }, adj: { types: ['meadow', 'home'], res: 'food', per: 1 }, harvest: { res: 'food', amount: 4, hours: 4 }, tip: '挨着草地，收成更好', weight: 20 },
  wheat: { name: '麦田', cost: { wood: 3, stone: 1 }, gain: { food: 2 }, adj: { types: ['wheat'], res: 'food', per: 1 }, harvest: { res: 'food', amount: 6, hours: 4 }, tip: '麦田连成片，食物更多', weight: 16, unlock: 0 },
  harbor: { name: '渔港', cost: { wood: 3, stone: 2 }, gain: { food: 2 }, harvest: { res: 'food', amount: 5, hours: 3 }, coastal: true, tip: '只能放在海边', weight: 12, unlock: 1 },
  home: { name: '小木屋' },
  islet: { name: '地标小岛' },
};
export const BASE_CARDS = ['meadow', 'forest', 'mountain', 'garden'];

export const START = {
  res: { wood: 4, stone: 0, food: 4 },
  caps: { wood: 30, stone: 20, food: 30 },
  tiles: [[0, 0, 'home'], [1, 0, 'forest'], [0, 1, 'meadow']],
};
// 前 13 张按固定顺序发，保证教学目标需要的地块按时出现；之后按权重随机
export const SCRIPT_DECK = ['forest', 'meadow', 'forest', 'meadow', 'forest', 'mountain', 'garden', 'meadow', 'forest', 'garden', 'meadow', 'mountain', 'forest'];

// 价格随岛屿变大而上涨：每放 PRICE_STEP_EVERY 块，每种地块的主要价格 +1，最多 +PRICE_STEP_MAX
export const PRICE_STEP_EVERY = 15;
export const PRICE_STEP_MAX = 3;
export const CAP_PER_LANDMARK = 10;   // 每点亮一座地标，资源上限 +10

// 地标：无限循环生成。前三座各带来一位同伴，前两座解锁新地块
export const LANDMARKS = [
  { type: 'windmill', name: '风车', lit: '风车重新转起来了', who: { name: '阿穗', role: '磨坊主', shirt: PAL.wheat, hat: 'straw', hatColor: PAL.straw }, unlock: 'wheat' },
  { type: 'lighthouse', name: '灯塔', lit: '灯塔亮起来了', who: { name: '老汀', role: '守塔人', shirt: PAL.roofBlue, hat: 'cap', hatColor: PAL.ink }, unlock: 'harbor' },
  { type: 'belltower', name: '钟楼', lit: '钟声传遍了海面', who: { name: '小满', role: '敲钟人', shirt: PAL.roofTeal, hat: 'none' }, unlock: null },
];
export const TRAVELER_NAMES = ['南星', '阿芷', '石头', '小鲤', '阿澄', '云朵', '青禾', '海棠', '阿舟', '知夏'];
export const TRAVELER_SHIRTS = [PAL.red, PAL.purple, PAL.teal, PAL.blue, PAL.pumpkin, PAL.pink];
export const FIRST_LANDMARK_DIST = 8;   // 第一座地标离出生点的格数（中间至少隔 6 格海面）
export const LANDMARK_STEP = [9, 12];   // 之后每座地标离上一座的格数范围

// 每日内容
export const DAILY = {
  orders: 3, orderNeed: [8, 15], orderRewardRes: 10,
  crate: { wood: 5, food: 5, coupon: 1 },
  freeRefresh: 1, adRefresh: 5, adRegrow: 3,
};
// 委托台词：{who} 会换成同伴名字
export const ORDER_LINES = {
  wood: ['磨坊的风叶裂了一片，能匀我 {n} 根木头吗？', '想给码头添几块新木板，差 {n} 根木头。', '夜里风大，想把窗框钉牢些，要 {n} 根木头。'],
  stone: ['新磨盘还差 {n} 块石头，你那儿有吗？', '塔下的台阶松了，想用 {n} 块石头垫一垫。', '想垒个小花坛，{n} 块石头就够。'],
  food: ['快过节了，想备 {n} 份吃的请大家聚一聚。', '明天要出海一整天，帮我准备 {n} 份干粮吧。', '新来的小猫总蹲在门口，匀我 {n} 份吃的喂喂它。'],
};

// 主线目标：同时显示 3 个，完成一个补一个。reward 为完成奖励
export const GOALS = [
  { id: 'place1', title: '让小岛长出新地', desc: '选一张地块卡，放到岛边', max: 1, reward: { food: 2 } },
  { id: 'harvestForest', title: '去林子里采木头', desc: '点一下长好的森林', max: 1, reward: { food: 1 } },
  { id: 'forestPair', title: '把树林连成片', desc: '森林挨着森林，木头更多', max: 1, reward: { wood: 2 } },
  { id: 'wood12', title: '备足木料', desc: '木头攒到 12', max: 12, reward: { food: 2 } },
  { id: 'mountain', title: '堆起一座山', desc: '山能带来石头', max: 1, reward: { wood: 2 } },
  { id: 'garden', title: '开一块菜园', desc: '菜园要用到石头', max: 1, reward: { wood: 2 } },
  { id: 'harvestGarden', title: '收一次菜', desc: '点一下长好的菜园', max: 1, reward: { stone: 1 } },
  { id: 'near', title: '朝风车靠近', desc: '把岛铺到离风车 2 格以内', max: 1, reward: { wood: 3 } },
  { id: 'size12', title: '小岛达到 12 块地', desc: '', max: 12, reward: { food: 3 } },
  { id: 'reach0', title: '接通风车小岛', desc: '把地铺到风车脚下', max: 1, reward: { coupon: 1 } },
  { id: 'orders', title: '看看同伴的委托', desc: '点右侧的「委托」', max: 1, reward: { food: 3 } },
  { id: 'wheat', title: '种下第一块麦田', desc: '麦田是阿穗带来的新地块', max: 1, reward: { coupon: 1 } },
];

// 画质预设。原则：每一档都清晰（渲染精度不低于 1.5 倍，再加锐化），档位之间区别在渲染细节——阴影、环境光遮蔽、景深、泛光、抗锯齿、植被和生物数量、视距。
// 设置里每一项都能单独改（存在 settings.gfx 里，叫“自定义”）；gfx() 把预设和自定义合成最终配置。
// res：渲染精度上限（设备像素比再高也不超过它）；shadow：阴影贴图边长，0 为关；dof：'off' | 'soft' 柔和 | 'tilt' 移轴微缩；
// sharpen：锐化强度；veg：植被密度档；life：动物数量系数；view：视距档。hq=false 的“低多边形”是另一套画面。
export const QUALITY = {
  ultra: { label: '极致', hq: true, res: 2, shadow: 4096, ao: true, dof: 'soft', bloom: true, aa: true, sharpen: 0.3, veg: 'ultra', life: 1, view: 'far' },
  high: { label: '高清', hq: true, res: 2, shadow: 2048, ao: true, dof: 'soft', bloom: true, aa: true, sharpen: 0.35, veg: 'high', life: 1, view: 'far' },
  mid: { label: '均衡', hq: true, res: 1.75, shadow: 2048, ao: false, dof: 'off', bloom: true, aa: false, sharpen: 0.4, veg: 'mid', life: 0.7, view: 'mid' },
  smooth: { label: '流畅', hq: true, res: 1.5, shadow: 1024, ao: false, dof: 'off', bloom: false, aa: false, sharpen: 0.45, veg: 'low', life: 0.5, view: 'near' },
  low: { label: '低多边形', hq: false, pixelRatio: 1.5, shadow: 1024, detail: 0.75, post: true, bloom: false, samples: 2 },
};
export const VEG = { low: { grass: 0.2, flowers: 0.3, trees: 0.6 }, mid: { grass: 0.35, flowers: 0.45, trees: 0.8 }, high: { grass: 0.6, flowers: 0.7, trees: 1 }, ultra: { grass: 1, flowers: 1, trees: 1 } };
export const VIEW = { near: 0.6, mid: 0.8, far: 1 };
// 自动降档的顺序（只在高画质画面内部降，不会自动切到低多边形画面，避免重新加载）
export const QUALITY_DOWN = { ultra: 'high', high: 'mid', mid: 'smooth' };
/** 预设 + 自定义 → 最终画面配置 */
export function gfx(st, preset = null) {
  const base = QUALITY[preset || st.quality] || QUALITY.high;
  if (!base.hq) return base;
  const o = { ...base, ...(st.gfx || {}) };
  return { ...o, pixelRatio: o.res, ...(VEG[o.veg] || VEG.high), viewK: VIEW[o.view] ?? 1 };
}

export const SAVE_KEY = 'yujian_save_v1';
