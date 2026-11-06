/* 技能释放条件（v8，主创要求：技能不再消耗建造资源「算力」；先做三个方案，主创试过后再定）
 * 设置 → 「技能释放条件」切换，战斗中立刻生效。
 *   ① 能量（默认，参考 MOBA 的蓝条）：英雄自带 100 点能量，每秒回 5 点，普攻命中回 2 点；技能耗能 = 原定价 × 0.6。
 *   ② 纯冷却：不耗任何东西，只看冷却；为了平衡，冷却时间 × 1.25。
 *   ③ 节拍充能（贴合我们的音乐主题）：普攻命中 +1 拍，打在强拍上再 +1，最多存 6 拍；Q / W 用 2 拍，R 用 5 拍。
 * 建造、训练仍然使用晶片 / 语料 / 算力，和技能完全分开。 */
(function () {
  const CF = window.CF;
  const MODES = {
    energy: { name: '能量', desc: '英雄自带 100 点能量，每秒回 5 点、普攻命中回 2 点；技能耗能 = 原定价 × 0.6。像王者荣耀、英雄联盟的蓝条。' },
    cd: { name: '纯冷却', desc: '技能不耗任何东西，只看冷却时间（冷却 × 1.25）。最简单，新手友好。' },
    beat: { name: '节拍充能', desc: '普攻命中 +1 拍，打在强拍上再 +1，最多存 6 拍；Q / W 用 2 拍，R 用 5 拍。越会踩拍，技能放得越多。' },
  };
  const C = (CF.SkillCost = { MODES, MAX_EN: 100, MAX_BEAT: 6 });
  C.mode = () => (MODES[CF.Save.data.settings.skillCost] ? CF.Save.data.settings.skillCost : 'energy');
  C.init = (h) => { h.en = C.MAX_EN; h.beats = 2; };
  C.cost = function (h, sk) {
    const base = CF.Skills.cost(h, sk), m = C.mode();
    if (m === 'energy') return { n: Math.round(base * 0.6), unit: '能量', short: String(Math.round(base * 0.6)) };
    if (m === 'beat') { const n = sk.key === 'R' ? 5 : 2; return { n, unit: '拍', short: '♪' + n }; }
    return { n: 0, unit: '', short: '' };
  };
  C.can = function (h, sk) {
    const c = C.cost(h, sk), m = C.mode();
    if (m === 'energy') return (h.en ?? C.MAX_EN) >= c.n;
    if (m === 'beat') return (h.beats ?? 0) >= c.n;
    return true;
  };
  C.why = (h, sk) => { const c = C.cost(h, sk); return C.mode() === 'energy' ? `能量不足（需要 ${c.n}，现在 ${Math.floor(h.en || 0)}）` : `节拍不够（需要 ${c.n} 拍，现在 ${h.beats || 0} 拍）——多打几下普攻，踩在强拍上更快`; };
  C.pay = function (h, sk) { const c = C.cost(h, sk), m = C.mode(); if (m === 'energy') h.en = Math.max(0, (h.en ?? C.MAX_EN) - c.n); if (m === 'beat') h.beats = Math.max(0, (h.beats || 0) - c.n); };
  C.cdMul = () => (C.mode() === 'cd' ? 1.25 : 1);
  C.tick = function (h, dt) { if (h.en === undefined) C.init(h); if (C.mode() === 'energy') h.en = Math.min(C.MAX_EN, h.en + 5 * dt); };
  C.onHit = function (g, h) {
    if (h.en === undefined) C.init(h);
    const m = C.mode();
    if (m === 'energy') h.en = Math.min(C.MAX_EN, h.en + 2);
    if (m === 'beat') { const strong = (g.beat || 0) > 0.6; h.beats = Math.min(C.MAX_BEAT, (h.beats || 0) + 1 + (strong ? 1 : 0)); if (strong) h.beatFx = 0.35; }
  };
  // 头顶名牌下面的资源条（能量 = 蓝条；节拍 = 6 个音符格；纯冷却不显示）
  C.drawPlate = function (ctx, h, x0, y0, w) {
    const m = C.mode(); if (m === 'cd') return 0;
    if (m === 'energy') { const p = (h.en ?? C.MAX_EN) / C.MAX_EN; ctx.fillStyle = '#000b'; ctx.fillRect(x0, y0, w, 4); ctx.fillStyle = '#4ea8ff'; ctx.fillRect(x0 + 1, y0 + 1, (w - 2) * p, 2); return 5; }
    const n = h.beats || 0, cw = Math.max(4, Math.floor((w - 5) / 6));
    for (let i = 0; i < C.MAX_BEAT; i++) { ctx.fillStyle = i < n ? (h.beatFx > 0 ? '#fff' : '#ffd257') : '#000b'; ctx.fillRect(x0 + i * (cw + 1), y0, cw, 4); }
    if (h.beatFx > 0) h.beatFx -= 1 / 60;
    return 5;
  };
})();
