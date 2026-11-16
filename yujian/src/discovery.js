// 稀有生态的发现：在草地上放地块时有机会冒出泉水，变成溪流或池塘。
// 规则（数值都在 DISCOVERY 里，方便调）：
//  - 第一次非常容易：放第 2 块草地必定发现（第 1 块用来熟悉操作）。
//  - 之后按基础概率；连续没发现时概率逐块上涨（软保底），到上限必出（硬保底）。
//  - 惊喜：清晨和黄昏概率翻倍；挨着已有水系的草地更容易冒水（水系会自然延伸）。
//  - 不重复：还没拿到的类型优先出（“不歪”），全部拿到以后按地势随机。
// 只依赖传入的随机数函数，可以在 node 里直接跑统计测试。

export const RARE = {
  stream: { name: '山间溪流', desc: '泉水从草地里涌出来，顺着地势流进海里，入海处成了瀑布。', pack: 'base' },
  pond: { name: '睡莲池塘', desc: '草地下陷成了一汪池塘，睡莲、芦苇、野鸭和青蛙很快就来了。', pack: 'base' },
};
// pack：所属的生态包。以后的付费皮肤（热带、雪原……）按包加类型，这里不用改逻辑

export const DISCOVERY = {
  firstAt: 2,        // 第几块草地必出第一次
  base: 0.06,        // 基础概率
  softFrom: 10,      // 距上次发现第几块草地开始加概率
  softStep: 0.08,    // 每块加多少
  hardAt: 18,        // 第几块必出
  goldenMul: 2,      // 清晨 5:30–7:30、黄昏 17:30–19:30 概率翻倍
  nearWater: 0.12,   // 挨着水系的草地额外加的概率
};
export const GRASS = new Set(['meadow', 'flowers']);
const golden = (h) => (h >= 5.5 && h <= 7.5) || (h >= 17.5 && h <= 19.5);

export const newDiscovery = () => ({ grass: 0, since: 0, total: 0, found: {} });

/** 当前这一块草地的发现概率（用于界面显示“下一块的机会”，也用于测试） */
export function chance(d, ctx = {}) {
  if (!d.total) return d.grass + 1 >= DISCOVERY.firstAt ? 1 : 0;
  const n = d.since + 1;
  if (n >= DISCOVERY.hardAt) return 1;
  let p = DISCOVERY.base * (golden(ctx.hour ?? 12) ? DISCOVERY.goldenMul : 1) + (ctx.nearWater ? DISCOVERY.nearWater : 0);
  if (n >= DISCOVERY.softFrom) p += (n - DISCOVERY.softFrom + 1) * DISCOVERY.softStep;
  return Math.min(1, p);
}

/** 放了一块草地以后调用。ctx: { hour, nearWater, coastal }。返回发现的类型（'stream' | 'pond'）或 null */
export function roll(d, rnd, ctx = {}) {
  const p = chance(d, ctx);
  d.grass++; d.since++;
  if (rnd() >= p) return null;
  const missing = Object.keys(RARE).filter((k) => !d.found[k]);
  let type;
  if (missing.length) type = missing.includes('stream') && (ctx.coastal || missing.length === 1) ? 'stream' : missing.includes('pond') ? 'pond' : missing[0];
  else type = rnd() < (ctx.coastal ? 0.65 : 0.35) ? 'stream' : 'pond';
  d.found[type] = (d.found[type] || 0) + 1; d.total++; d.since = 0;
  return type;
}
