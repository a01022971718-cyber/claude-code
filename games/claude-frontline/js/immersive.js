/* 沉浸模式（参考魔兽争霸 3 的策略深度）：
 * 战争迷雾 · 野怪营地（夜晚入睡、拉怪脱离会回营）· 英雄等级与加点（6 级大招）· 物品与商店
 * · 攻击/护甲类型克制 · 人口与维护费 · 主脑三级科技 · 会发育会扩张会撤退的 AI 对手 · 昼夜 */
(function () {
  const CF = window.CF;
  const TAU = Math.PI * 2;
  const G = CF.Game, BT = G.BT, UT = G.UT, proto = G.Game.prototype;
  const CELL = 40;

  // ---------- 攻防类型（数值参考魔兽争霸 3 冰封王座） ----------
  const ATK = { normal: '普通', pierce: '穿刺', siege: '攻城', magic: '魔法', hero: '英雄' };
  const ARM = { light: '轻甲', medium: '中甲', heavy: '重甲', fort: '城甲', hero: '英雄甲', none: '无甲' };
  const TABLE = {
    normal: { light: 1, medium: 1.5, heavy: 1, fort: 0.7, hero: 1, none: 1 },
    pierce: { light: 2, medium: 0.75, heavy: 1, fort: 0.35, hero: 0.5, none: 1.5 },
    siege: { light: 1, medium: 0.5, heavy: 1, fort: 1.5, hero: 0.5, none: 1.5 },
    magic: { light: 1.25, medium: 0.75, heavy: 2, fort: 0.35, hero: 0.5, none: 1 },
    hero: { light: 1, medium: 1, heavy: 1, fort: 0.5, hero: 1, none: 1 },
  };
  const ARMOR_V = { light: 1, medium: 2, heavy: 4, fort: 6, hero: 3, none: 0 };
  const TYPES = {
    scout: ['pierce', 'light'], coder: ['pierce', 'medium'], refactor: ['siege', 'heavy'], interceptor: ['pierce', 'light'], bomber: ['siege', 'medium'],
    spark: ['magic', 'light'], keyguard: ['normal', 'heavy'], starling: ['magic', 'light'], starlet: ['magic', 'light'], drummer: ['normal', 'medium'], alpaca: ['pierce', 'heavy'], whaleling: ['magic', 'medium'], shade: ['pierce', 'light'], querist: ['pierce', 'light'], beanie: ['normal', 'none'],
    hero: ['hero', 'hero'], phantom: ['hero', 'hero'],
    bug: ['normal', 'none'], noise: ['pierce', 'medium'], titan: ['siege', 'heavy'], bat: ['pierce', 'light'], forget: ['hero', 'hero'], carrier: ['hero', 'hero'], entropy: ['hero', 'hero'],
    stray: ['normal', 'none'], wolf: ['normal', 'medium'], golem: ['siege', 'heavy'], oracle: ['magic', 'light'],
  };
  const typeOf = (e) => (e.kind === 'b' ? [e.def.atk ? 'pierce' : 'normal', 'fort'] : TYPES[e.type] || ['normal', 'medium']);
  const armorOf = (e) => (e.def.armor !== undefined && e.def.armor ? e.def.armor : ARMOR_V[typeOf(e)[1]]) + (e.itemArmor || 0) + (e.team === 0 && e.kind === 'u' && e.g && e.g.tier >= 3 ? 1 : 0);
  const reduce = (a) => (a >= 0 ? (0.06 * a) / (1 + 0.06 * a) : -(1 - Math.pow(0.94, -a)));

  // ---------- 新单位与建筑 ----------
  Object.assign(UT, {
    stray: { name: '迷途数据', hp: 240, r: 11, speed: 80, atk: { range: 22, dmg: 11, rate: 1, melee: true }, creep: true, xp: 40, bounty: { chip: 10 } },
    wolf: { name: '噪声狼', hp: 420, r: 13, speed: 120, atk: { range: 24, dmg: 17, rate: 0.9, melee: true }, creep: true, xp: 70, bounty: { chip: 16 } },
    golem: { name: '冗余石像', hp: 1300, r: 20, speed: 50, atk: { range: 30, dmg: 36, rate: 1.6, melee: true, splash: 40 }, creep: true, xp: 180, bounty: { chip: 40, corp: 20 } },
    oracle: { name: '幻听术士', hp: 340, r: 11, speed: 70, atk: { range: 190, dmg: 20, rate: 1.2, air: true }, creep: true, xp: 90, bounty: { chip: 18, corp: 8 } },
    phantom: { name: '幻觉之主', hp: 1500, r: 18, speed: 95, atk: { range: 170, dmg: 38, rate: 0.9, air: true }, desc: '乱码议会的英雄。会升级，会释放幻象新星。', bounty: { chip: 150, corp: 80 }, xp: 400 },
  });
  Object.assign(BT, {
    depot: { name: '补给站', key: '9', cost: { chip: 80 }, hp: 420, r: 18, build: 4, desc: '人口上限 +10（最多 100）。人口越高维护费越高，收入越少。', supply: 10 },
    temple: { name: '知识神殿', hp: 99999, r: 36, desc: '中立商店。英雄靠近后点击神殿购买物品。' },
    gminer: { name: '乱码矿机', hp: 600, r: 20, desc: 'AI 的分矿。摧毁它可以削弱对手的经济。' },
  });
  const SUPPLY = { scout: 1, coder: 2, refactor: 4, interceptor: 2, bomber: 4, spark: 2, keyguard: 3, starling: 2, drummer: 2, alpaca: 3, whaleling: 2, shade: 2, querist: 2, beanie: 1, starlet: 0 };
  const TIER2 = ['refactor', 'bomber', 'radar', 'port', 'spark', 'keyguard', 'starling', 'drummer', 'alpaca', 'whaleling', 'shade', 'querist', 'beanie'];
  const TIER3 = ['amp', 'hall', 'prism', 'drumtower', 'bazaar', 'deepwell', 'moonterrace', 'jadeplate', 'steamer'];
  const XP_LV = [0, 200, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400];
  const ITEMS = {
    potion: { n: '治疗药水', ic: '🧪', d: '立即回复 450 耐久（消耗品）', use: true, price: 60 },
    scroll: { n: '回城卷轴', ic: '📜', d: '1.5 秒后传送回主脑（消耗品）', use: true, price: 80 },
    claw: { n: '攻击之爪', ic: '🗡️', d: '攻击 +12', price: 220 },
    boots: { n: '疾风之靴', ic: '👟', d: '移速 +40', price: 180 },
    ring: { n: '回复指环', ic: '💍', d: '每秒回复 4 耐久', price: 160 },
    shield: { n: '护甲护符', ic: '🛡️', d: '护甲 +4', price: 200 },
    orb: { n: '音律宝珠', ic: '🔮', d: '技能冷却 -15%', price: 0 },
    crown: { n: '造物者王冠', ic: '👑', d: '攻击 +15%、耐久 +300', price: 0 },
  };
  const SHOP = ['potion', 'scroll', 'claw', 'boots', 'ring', 'shield'];
  const DROPS = { easy: ['potion', 'ring', 'potion'], medium: ['claw', 'boots', 'shield'], hard: ['orb', 'crown'] };

  // ---------- 关卡 ----------
  const LEVELS = [{
    id: 'IM1', no: 'IM', name: '群星迷雾', immersive: true, learn: '策略 · 数值 · 时机',
    brief: '大地图被战争迷雾覆盖。乱码议会在右上角发育，它会扩张、集结、进攻，也会在打不过时撤退。清理野怪营地拿经验和宝物，抢占分矿，升级主脑科技，在合适的时机给出致命一击。',
    tip: '先用英雄带少量部队清理左下的「简单」营地升级；补给站别造太多（维护费）；夜晚野怪会睡觉，是偷袭营地的好时机；看清克制表：穿刺打轻甲、魔法打重甲、攻城打建筑。',
    w: 3200, h: 2400, core: [380, 2020], hero: [520, 1960],
    cliffs: [[900, 1700, 160, 700], [0, 1300, 700, 120], [1400, 0, 140, 600], [2400, 900, 800, 120], [1100, 900, 220, 220], [1900, 1300, 220, 220], [700, 400, 200, 300], [2300, 1800, 200, 300]],
    nodes: [['chip', 620, 1800], ['chip', 300, 1720], ['corp', 640, 2160], ['chip', 2600, 380], ['chip', 2900, 640], ['corp', 2580, 160], ['chip', 520, 1000], ['corp', 380, 1100], ['chip', 1640, 1220], ['corp', 1560, 1300], ['chip', 2700, 1500], ['corp', 2850, 1380], ['chip', 1300, 2150], ['corp', 1500, 2250], ['chip', 1900, 500], ['corp', 2050, 400]],
    gcore: [2860, 380], towers: [[2600, 560], [2700, 230], [2400, 420]],
    camps: [
      { x: 600, y: 1080, lv: 'easy', units: ['stray', 'stray', 'oracle'] },
      { x: 1400, y: 2200, lv: 'easy', units: ['stray', 'stray', 'stray'] },
      { x: 1980, y: 460, lv: 'medium', units: ['wolf', 'wolf', 'oracle'] },
      { x: 2770, y: 1460, lv: 'medium', units: ['wolf', 'oracle', 'wolf'] },
      { x: 1600, y: 1260, lv: 'hard', units: ['golem', 'wolf', 'oracle', 'oracle'] },
    ],
    temple: [1600, 1900], waves: [], first: 99999, gap: 99999,
    objectives: [{ text: '摧毁乱码主脑', test: (g) => g.foeCoreDead() }, { text: '（可选）清理全部 5 个野怪营地', test: (g) => g.camps && g.camps.every((c) => c.cleared) }],
    win: (g) => g.foeCoreDead(),
    stars: [['获胜', () => true], ['20 分钟内获胜', (g) => g.time <= 1200], ['英雄达到 8 级', (g) => (g.heroLv || 1) >= 8]],
    script: [[2, 'HERO', '迷雾里什么都可能有。先摸清地图，再决定往哪走。'], [10, '侦察Agent', '左下和下方有两处「简单」野怪营地，适合先练级。']],
  }];

  const I = (CF.Immersive = { LEVELS, ATK, ARM, TABLE, ITEMS, get: (id) => Object.assign({}, LEVELS.find((l) => l.id === id)) });
  I.tableHtml = function () {
    return `<div style="overflow-x:auto"><table class="mono small" style="border-collapse:collapse;min-width:520px;width:100%"><tr><th style="text-align:left;padding:4px">攻击 \\ 护甲</th>${Object.keys(ARM).map((a) => `<th style="padding:4px">${ARM[a]}</th>`).join('')}</tr>${Object.keys(ATK).map((k) => `<tr><td style="padding:4px;color:var(--hero2)">${ATK[k]}</td>${Object.keys(ARM).map((a) => { const v = TABLE[k][a]; return `<td style="padding:4px;text-align:center;color:${v > 1 ? 'var(--good)' : v < 1 ? 'var(--bad)' : 'var(--text)'}">${Math.round(v * 100)}%</td>`; }).join('')}</tr>`).join('')}</table></div><p class="small muted" style="margin-top:6px;line-height:1.8">护甲减伤 = 0.06×护甲 ÷ (1 + 0.06×护甲)：护甲 2 ≈ 11%，护甲 4 ≈ 19%，护甲 6 ≈ 26%。<br>人口 ≤ 40 无维护费；41–70 低维护费（收入 ×70%）；71–100 高维护费（收入 ×40%）。英雄每级攻击与耐久 +10%，6 级开放终极技能，物品栏 4 格。</p>`;
  };

  // ---------- 初始化 ----------
  proto.imInit = function () {
    const g = this, L = g.L;
    if (!L.immersive) return;
    g.fogOn = true; g.fogVis = new Uint8Array(g.cols * g.rows); g.fogExp = new Uint8Array(g.cols * g.rows); g.fogT = 0;
    g.fogCv = document.createElement('canvas'); g.fogCv.width = g.cols; g.fogCv.height = g.rows;
    g.heroLv = 1; g.heroXp = 0; g.skillPts = 0; g.skillLv = { Q: 1, W: 1, R: 1 }; g.hero.skillLv = g.skillLv;
    g.items = []; g.drops = []; g.tier = 1; g.tierBusy = 0; g.dayT = 0; g.night = false;
    g.supply = { used: 0, cap: 10 }; g.upkeepMul = 1;
    g.res.chip += 150; g.res.corp += 80;
    g.camps = L.camps.map((c, i) => { const cp = Object.assign({ id: i, units: [], cleared: false }, c, { types: c.units }); cp.units = c.units.map((t, k) => { const u = g.addU(t, 2, c.x + Math.cos(k * 2.1) * 40, c.y + Math.sin(k * 2.1) * 40); u.camp = cp; u.home = { x: u.x, y: u.y }; return u; }); return cp; });
    g.nodes.forEach((n) => { const c = g.camps.find((c2) => CF.dist(c2.x, c2.y, n.x, n.y) < 260); if (c) n.camp = c.id; });
    g.temple = g.addB('temple', 3, L.temple[0], L.temple[1], true);
    g.ai = { res: 120, inc: 7, state: 'build', next: 300, rally: [g.gcore.x - 260, g.gcore.y + 220], startHp: 0, hero: null, heroT: 30, heroLv: 1, expT: 420, expanded: [] };
    g.aiSpawnHero();
    g.prerender();
    CF.UI.say('HERO', '乱码议会就在迷雾的另一头。');
  };
  proto.campAlive = function (id) { const c = this.camps && this.camps[id]; return c && !c.cleared; };
  proto.aiSpawnHero = function () {
    const g = this, u = g.addU('phantom', 1, g.gcore.x - 120, g.gcore.y + 80);
    u.ai = true; u.maxHp = u.hp = Math.round(UT.phantom.hp * (1 + 0.12 * (g.ai.heroLv - 1))); u.lv = g.ai.heroLv; u.novaT = 8;
    u.def = Object.assign({}, UT.phantom, { atk: Object.assign({}, UT.phantom.atk, { dmg: UT.phantom.atk.dmg * (1 + 0.1 * (g.ai.heroLv - 1)) }) });
    g.ai.hero = u;
  };

  // ---------- 每帧 ----------
  proto.imTick = function (dt) {
    const g = this; if (!g.L.immersive) return;
    // 昼夜：白天 180 秒，夜晚 90 秒
    g.dayT += dt; const cyc = g.dayT % 270, night = cyc > 180;
    if (night !== g.night) { g.night = night; CF.toast(night ? '🌙 夜幕降临：视野缩小，野怪入睡' : '☀ 天亮了：视野恢复', night ? '' : 'gold', 2600); CF.Audio.lick(g.heroId, true); }
    // 迷雾
    g.fogT -= dt;
    if (g.fogT <= 0) {
      g.fogT = 0.25; g.fogVis.fill(0);
      const k = g.night ? 0.7 : 1;
      for (const e of g.ents) {
        if (e.dead || e.team !== 0) continue;
        const R = (e.heroId ? 460 : e.kind === 'b' ? (e.type === 'radar' ? 640 : e.type === 'moonterrace' ? 520 : 340) : e.type === 'scout' ? 480 : 330) * k;
        const [cx, cy] = g.cellOf(e.x, e.y), rc = Math.ceil(R / CELL);
        for (let y = cy - rc; y <= cy + rc; y++) for (let x = cx - rc; x <= cx + rc; x++) { if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue; if ((x - cx) ** 2 + (y - cy) ** 2 <= rc * rc) { const i = y * g.cols + x; g.fogVis[i] = 1; g.fogExp[i] = 1; } }
      }
      // 人口与维护费
      let used = 0; for (const e of g.ents) if (e.team === 0 && e.kind === 'u' && !e.dead) used += e.heroId ? (e.clone ? 0 : 5) : SUPPLY[e.type] || 0;
      for (const b of g.ents) if (b.team === 0 && b.kind === 'b' && b.done) for (const q of b.queue || []) used += 0;
      const cap = Math.min(100, 10 + g.ents.filter((e) => e.type === 'depot' && e.done && !e.dead).length * 10 + (g.tier - 1) * 10);
      g.supply = { used, cap }; g.upkeepMul = used <= 40 ? 1 : used <= 70 ? 0.7 : 0.4;
      // 物品：被动属性
      g.applyItems();
    }
    // 主脑科技升级
    if (g.tierBusy > 0) { g.tierBusy -= dt; if (g.tierBusy <= 0) { g.tier++; CF.toast(`主脑升级到 T${g.tier}！${g.tier === 2 ? '解锁：重构 Agent、无人机空港、雷达站、专属小兵' : '解锁：英雄专属建筑，全军护甲 +1'}`, 'gold', 3600); CF.Audio.sfx('levelup'); } }
    // 掉落物拾取
    if (g.hero && !g.hero.dead) for (const d of g.drops) if (!d.got && CF.dist(d.x, d.y, g.hero.x, g.hero.y) < 40) { if (g.items.length >= 4) { if (!d.warn) { CF.toast('物品栏已满（4 格）'); d.warn = 1; } } else { d.got = true; g.items.push(d.item); CF.toast(`获得 ${ITEMS[d.item].ic} ${ITEMS[d.item].n}`, 'gold'); CF.Audio.sfx('unlock'); } }
    g.drops = g.drops.filter((d) => !d.got);
    // 英雄回复（指环）
    if (g.hero && !g.hero.dead && g.hero.regen) g.heal(g.hero, g.hero.regen * dt);
    // AI
    g.aiThink(dt);
  };
  proto.applyItems = function () {
    const g = this, h = g.hero; if (!h || h.dead) return;
    const base = CF.Skills.STATS[g.heroId], grow = (1 + 0.1 * (g.heroLv - 1)) * CF.Roster.starMul(g.heroId), cnt = (k) => g.items.filter((i) => i === k).length;
    h.def.atk.dmg = (base.dmg * grow + cnt('claw') * 12) * (1 + 0.15 * cnt('crown'));
    h.def.speed = base.speed + cnt('boots') * 40;
    h.itemArmor = cnt('shield') * 4;
    h.regen = cnt('ring') * 4;
    const mhp = Math.round(base.hp * g.bonus.heroHp * grow * (g.bonus.cityHero || 1)) + cnt('crown') * 300;
    if (h.maxHp !== mhp) { h.hp += mhp - h.maxHp; h.maxHp = mhp; }
    g.bonus.cdMul = Math.pow(0.85, cnt('orb'));
  };
  proto.useItem = function (i) {
    const g = this, k = g.items[i], h = g.hero; if (!k || !h || h.dead) return;
    if (k === 'potion') { g.heal(h, 450); g.items.splice(i, 1); g.ring(h.x, h.y, 60, 0, h, { c: '#6fdc8c' }); CF.Audio.sfx('heal'); }
    else if (k === 'scroll') { g.items.splice(i, 1); CF.toast('1.5 秒后回城…'); g.later(1.5, () => { if (!h.dead) { h.x = g.core.x + 70; h.y = g.core.y + 40; h.path = null; h.order = { t: 'idle' }; h.guard = { x: h.x, y: h.y }; g.centerOn(h.x, h.y); } }); }
    else CF.toast(`${ITEMS[k].n}：${ITEMS[k].d}（被动生效中）`);
    CF.UI.hud();
  };

  // ---------- 伤害：攻防类型 × 护甲 ----------
  proto.dmgMod = function (src, t, dmg) {
    if (!this.L.immersive || !src || !src.def) { if (t.def && t.def.armor) dmg *= 1 - reduce(t.def.armor); return dmg; }
    t.g = this;
    const at = src.kind ? typeOf(src)[0] : 'normal', ar = typeOf(t)[1];
    return dmg * TABLE[at][ar] * (1 - reduce(armorOf(t)));
  };
  proto.imDesc = function (e) {
    if (!this.L.immersive) return '';
    const [a, r] = typeOf(e), av = armorOf(e);
    return ` · ${ATK[a]}/${ARM[r]} 护甲${av}（减伤${Math.round(reduce(av) * 100)}%）`;
  };

  // ---------- 野怪 ----------
  proto.imCreep = function (u, dt) {
    const g = this, c = u.camp;
    u.atkCd -= dt;
    const home = u.home;
    if (!c.aggro) { if (g.night) { u.sleep = true; u.vx *= 0.5; u.vy *= 0.5; return; } u.sleep = false; const near = g.near(c.x, c.y, 190, (e) => e.team === 0 && !e.dead && e.kind === 'u'); if (near.length) c.aggro = true; else { if (CF.dist(u.x, u.y, home.x, home.y) > 8) g.steer(u, home.x, home.y, dt); else { u.vx *= 0.6; u.vy *= 0.6; } return; } }
    u.sleep = false;
    if (CF.dist(u.x, u.y, home.x, home.y) > 560) { c.aggro = false; c.units.forEach((q) => { if (!q.dead) q.hp = q.maxHp; }); g.steer(u, home.x, home.y, dt); return; }
    const t = g.near(u.x, u.y, 320, (e) => e.team === 0 && !e.dead && !(e.st && e.st.stealth > 0)).sort((a, b) => CF.dist(a.x, a.y, u.x, u.y) - CF.dist(b.x, b.y, u.x, u.y))[0];
    if (!t) { if (CF.dist(u.x, u.y, home.x, home.y) > 10) g.steer(u, home.x, home.y, dt); else c.aggro = false; return; }
    const dd = CF.dist(u.x, u.y, t.x, t.y) - t.r - u.r;
    u.face = t.x > u.x ? 1 : -1;
    if (dd <= u.def.atk.range) { u.vx *= 0.5; u.vy *= 0.5; if (u.atkCd <= 0) { g.fire(u, t, u.def.atk); u.atkCd = u.def.atk.rate; } }
    else g.steer(u, t.x, t.y, dt);
  };
  proto.imAggro = function (t) { if (t.camp) t.camp.aggro = true; };

  // ---------- 击杀：英雄经验、营地清理掉落 ----------
  proto.onKill = function (e) {
    const g = this; if (!g.L.immersive) return;
    if (e.team === 2 && e.camp) { const c = e.camp; if (c.units.every((u) => u.dead)) { c.cleared = true; const it = CF.pick(DROPS[c.lv]); g.drops.push({ x: c.x, y: c.y, item: it }); CF.toast(`营地已清理！掉落 ${ITEMS[it].ic} ${ITEMS[it].n}（让英雄走过去拾取）`, 'gold', 3200); g.res.chip += { easy: 60, medium: 120, hard: 250 }[c.lv]; } }
    if (e.team === 2 || e.team === 1) {
      const xp = e.def.xp || (e.kind === 'u' ? Math.round(e.maxHp / 6) : 80);
      if (g.hero && !g.hero.dead && CF.dist(e.x, e.y, g.hero.x, g.hero.y) < 1100) g.gainXp(xp);
      if (e.type === 'phantom') { g.ai.heroT = 35; CF.toast('幻觉之主被击败！35 秒后复活', 'gold'); }
      if (e.type === 'gminer') { g.ai.inc -= 3; CF.toast('摧毁了 AI 的分矿，它的收入下降了', 'gold'); }
    }
  };
  proto.gainXp = function (xp) {
    const g = this; g.heroXp += xp;
    while (g.heroLv < 10 && g.heroXp >= XP_LV[g.heroLv]) {
      g.heroLv++; g.skillPts++;
      const h = g.hero; h.maxHp = Math.round(h.maxHp * 1.1); h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.3);
      g.ring(h.x, h.y, 120, 0, h, { c: '#ffe08a', pixel: true }); CF.Audio.sfx('levelup');
      CF.toast(`英雄升到 ${g.heroLv} 级！${g.heroLv === 6 ? '终极技能已开放！' : ''}点右下角「＋」加点`, 'gold', 3000);
    }
  };
  proto.learnSkill = function (k) {
    const g = this, max = k === 'R' ? (g.heroLv >= 10 ? 3 : g.heroLv >= 8 ? 2 : 1) : Math.min(4, 1 + Math.floor((g.heroLv + 1) / 2));
    if (g.skillPts <= 0) return;
    if (k === 'R' && g.heroLv < 6) return CF.toast('终极技能需要英雄 6 级');
    if (g.skillLv[k] >= max) return CF.toast(`${k} 当前已满级（英雄等级越高上限越高）`);
    g.skillLv[k]++; g.skillPts--; CF.Audio.sfx('unlock'); CF.toast(`${k} 技能升到 ${g.skillLv[k]} 级（伤害/效果 +25%）`);
  };

  // ---------- 科技、人口、建造限制 ----------
  proto.supplyOk = function (type) { if (!this.L.immersive) return true; const s = this.supply; return s.used + (SUPPLY[type] || 1) * (UT[type].pair ? 2 : 1) <= s.cap; };
  proto.imTrainFilter = function (b, list) { if (!this.L.immersive) return list; return list.filter((t) => this.tier >= 2 || !TIER2.includes(t)); };
  proto.imBuildOk = function (t) { if (this.tier < 2 && TIER2.includes(t)) return { ok: false, why: '需要主脑 T2（选中主脑升级）' }; if (this.tier < 3 && TIER3.includes(t)) return { ok: false, why: '需要主脑 T3' }; return { ok: true }; };
  proto.imCoreItems = function (b, items) {
    const g = this; if (!g.L.immersive) return;
    const cost = g.tier === 1 ? { chip: 300, corp: 200 } : { chip: 500, corp: 300, comp: 100 }, time = g.tier === 1 ? 60 : 90;
    if (g.tier < 3) items.unshift({ icon: '⬆', label: g.tierBusy > 0 ? `升级中 ${Math.ceil(g.tierBusy)}s` : `升级 T${g.tier + 1}`, cost, na: g.tierBusy > 0 || !G.canPay(g.res, cost), tip: g.tier === 1 ? 'T2：解锁重构 Agent、空港、雷达、专属小兵，人口 +10' : 'T3：解锁专属建筑，全军护甲 +1，人口 +10', fn: () => { if (g.tierBusy > 0) return; if (!G.canPay(g.res, cost)) { CF.toast('资源不足', 'bad'); return true; } Object.keys(cost).forEach((k) => (g.res[k] -= cost[k])); g.tierBusy = time; CF.toast(`主脑开始升级（${time} 秒）`); } });
  };
  proto.imShop = function (t) {
    const g = this, h = g.hero;
    if (!h || h.dead || CF.dist(h.x, h.y, t.x, t.y) > 230) return CF.toast('让英雄走到知识神殿旁边才能购物'), true;
    CF.UI.openRadial(t.x, t.y, SHOP.map((k) => ({ icon: ITEMS[k].ic, label: ITEMS[k].n, cost: { chip: ITEMS[k].price }, na: g.res.chip < ITEMS[k].price || g.items.length >= 4, tip: ITEMS[k].d, fn: () => { if (g.items.length >= 4) return CF.toast('物品栏已满'); if (g.res.chip < ITEMS[k].price) return CF.toast('晶片不足', 'bad'); g.res.chip -= ITEMS[k].price; g.items.push(k); CF.Audio.sfx('correct'); CF.toast(`购买 ${ITEMS[k].ic} ${ITEMS[k].n}`); } })));
    return true;
  };

  // ---------- AI 对手：发育 → 扩张 → 集结 → 进攻 → 撤退 ----------
  const AI_COST = { bug: 20, noise: 34, titan: 120, bat: 30 };
  proto.aiThink = function (dt) {
    const g = this, A = g.ai; if (!A || !g.gcore || g.gcore.dead) return;
    A.t = (A.t || 0) + dt; if (A.t < 1) return; A.t = 0;
    A.res += A.inc + g.time / 120;
    if (A.hero && A.hero.dead) { A.heroT -= 1; if (A.heroT <= 0) { A.heroLv = Math.min(10, A.heroLv + 1); g.aiSpawnHero(); } }
    else if (A.hero) { A.hero.novaT -= 1; if (A.hero.novaT <= 0 && g.near(A.hero.x, A.hero.y, 180, (e) => e.team === 0).length) { A.hero.novaT = 12; g.fx.push({ k: 'ring', x: A.hero.x, y: A.hero.y, r: 0, max: 180, t: 0, c: '#ff4f9a', pixel: true }); g.near(A.hero.x, A.hero.y, 180, (e) => e.team === 0).forEach((e) => g.damage(e, 110 + A.heroLv * 12, A.hero)); } if (g.time % 90 < 1) A.heroLv = Math.min(10, A.heroLv + 1); }
    // 造兵：随时间换配比
    const army = g.ents.filter((e) => e.team === 1 && e.kind === 'u' && e.ai && !e.dead && e !== A.hero);
    const pool = g.time < 240 ? ['bug', 'bug', 'noise'] : g.time < 600 ? ['noise', 'bug', 'titan', 'bat'] : ['titan', 'noise', 'bat', 'bat', 'titan'];
    let n = 0;
    while (army.length + n < 40 + g.time / 30) { const t = CF.pick(pool); if (A.res < AI_COST[t]) break; A.res -= AI_COST[t]; const u = g.addU(t, 1, g.gcore.x - 80 + CF.rand(-30, 30), g.gcore.y + 70 + CF.rand(-30, 30)); u.ai = true; n++; }
    const value = army.reduce((s, e) => s + e.hp, 0);
    // 扩张：7 分钟后清理附近营地并放一座乱码矿机
    A.expT -= 1;
    if (A.expT <= 0 && A.state !== 'attack') { A.expT = 300; const c = g.camps.filter((c2) => !A.expanded.includes(c2.id)).sort((a, b) => CF.dist(a.x, a.y, g.gcore.x, g.gcore.y) - CF.dist(b.x, b.y, g.gcore.x, g.gcore.y))[0]; if (c) { A.expanded.push(c.id); A.expandTo = c; A.state = 'expand'; A.goal = [c.x, c.y]; g.aiStatus = '乱码议会正在扩张'; } }
    if (A.state === 'expand' && A.expandTo) { if (A.expandTo.cleared || A.expandTo.units.every((u) => u.dead)) { A.expandTo.cleared = true; const m = g.addB('gminer', 1, A.expandTo.x + 60, A.expandTo.y + 40, true); m.ai = true; A.inc += 3; A.state = 'build'; A.expandTo = null; CF.UI.say('侦察Agent', '乱码议会占领了一处分矿！摧毁它能削弱对手经济。'); } }
    // 进攻时机
    if (A.state === 'build' && (g.time >= A.next || value > 4000 + g.time * 6)) { A.state = 'attack'; A.startHp = value; const ms = g.ents.filter((e) => e.team === 0 && e.type === 'miner' && !e.dead && CF.dist(e.x, e.y, g.core.x, g.core.y) > 500); A.goal = ms.length && Math.random() < 0.5 ? [ms[0].x, ms[0].y] : [g.core.x, g.core.y]; g.aiStatus = '⚠ 乱码议会进攻！'; CF.toast('⚠ 乱码议会大军压境！', 'bad', 3000); CF.Audio.sfx('alert'); }
    if (A.state === 'attack' && value < A.startHp * 0.35) { A.state = 'build'; A.next = g.time + 150; g.aiStatus = '乱码议会撤退了'; CF.UI.say('侦察Agent', '敌军撤退了！趁现在反击或者扩张。'); }
    if (A.state === 'build') g.aiStatus = g.time < A.next ? `乱码议会集结中 · ${CF.fmtTime(A.next - g.time)}` : '乱码议会集结中';
    // 基地受威胁 → 回防
    const threat = g.near(g.gcore.x, g.gcore.y, 700, (e) => e.team === 0 && e.kind === 'u').length;
    A.defend = threat > 0;
  };
  proto.imOrder = function (u, dt) {
    const g = this, A = g.ai; if (!A || !u.ai) return false;
    let goal;
    if (A.defend) goal = [g.gcore.x - 120, g.gcore.y + 120];
    else if ((A.state === 'attack' || A.state === 'expand') && A.goal) goal = A.goal;
    else goal = A.rally;
    if (CF.dist(u.x, u.y, goal[0], goal[1]) < 70) { u.vx *= 0.8; u.vy *= 0.8; return true; }
    if (u.air) { g.steer(u, goal[0], goal[1], dt); return true; }
    if (!u.path || (u.repath = (u.repath || 0) - dt) <= 0 || u.pathGoal !== goal) { u.path = g.findPath(u.x, u.y, goal[0], goal[1]); u.repath = 2.5; u.pathGoal = goal; }
    g.followPath(u, dt);
    return true;
  };

  // ---------- 迷雾 ----------
  proto.seen = function (e) {
    if (!this.fogOn || e.team === 0 || e.team === 3) return true;
    const [cx, cy] = this.cellOf(e.x, e.y), i = cy * this.cols + cx;
    if (e.kind === 'b') return this.fogExp[i] === 1;
    return this.fogVis[i] === 1;
  };
  proto.fogHidden = function (a, t) { return this.fogOn && a.team === 0 && !this.seen(t); };
  proto.fogRender = function (ctx, dpr) {
    const g = this; if (!g.fogOn) return;
    const x = g.fogCv.getContext('2d'), img = x.createImageData(g.cols, g.rows), d = img.data;
    for (let i = 0; i < g.fogVis.length; i++) { const a = g.fogVis[i] ? 0 : g.fogExp[i] ? 140 : 235; d[i * 4] = 6; d[i * 4 + 1] = 5; d[i * 4 + 2] = 18; d[i * 4 + 3] = a; }
    x.putImageData(img, 0, 0);
    ctx.save(); ctx.setTransform(dpr * g.cam.z, 0, 0, dpr * g.cam.z, -g.cam.x * g.cam.z * dpr, -g.cam.y * g.cam.z * dpr);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(g.fogCv, 0, 0, g.cols * CELL, g.rows * CELL); ctx.imageSmoothingEnabled = false;
    // 掉落物（在迷雾上方也能看见已探索区域的）
    const t = performance.now() / 1000;
    for (const dr of g.drops) { const y = dr.y - 6 + Math.sin(t * 3) * 3; ctx.fillStyle = '#ffe08a55'; ctx.beginPath(); ctx.arc(dr.x, dr.y, 20, 0, TAU); ctx.fill(); ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ITEMS[dr.item].ic, dr.x, y + 7); ctx.textAlign = 'left'; }
    ctx.restore();
    if (g.night) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(8,12,50,0.32)'; ctx.fillRect(0, 0, g.vw * dpr, g.vh * dpr); }
  };

  // ---------- 绘制：神殿、野怪、AI 英雄、乱码矿机 ----------
  const drawB0 = proto.drawB;
  proto.drawB = function (ctx, b, t) {
    if (b.type === 'temple') {
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.fillStyle = '#1d1636'; ctx.fillRect(-36, -10, 72, 30); ctx.fillStyle = '#ffe08a'; for (let i = 0; i < 4; i++) ctx.fillRect(-30 + i * 18, -30, 8, 40);
      ctx.fillStyle = '#ffb14a'; ctx.beginPath(); ctx.moveTo(-42, -30); ctx.lineTo(0, -56); ctx.lineTo(42, -30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('知识神殿 · 商店', 0, 38); ctx.textAlign = 'left';
      ctx.restore(); return;
    }
    if (b.type === 'gminer') { ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = '#2a0b1e'; ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 2; ctx.fillRect(-18, -18, 36, 36); ctx.strokeRect(-18, -18, 36, 36); ctx.rotate(t * 2); ctx.fillStyle = '#29e0e0'; ctx.fillRect(-12, -3, 24, 6); ctx.restore(); if (b.id) this.hpBar(ctx, b, 36); return; }
    drawB0.call(this, ctx, b, t);
  };
  proto.drawCreep = function (ctx, u, x, y, r, t, fl) {
    ctx.translate(x, y);
    const c = fl ? '#fff' : { stray: '#9aa38f', wolf: '#7d8aa6', golem: '#8c7f6a', oracle: '#a58fc7' }[u.type] || '#999';
    if (u.type === 'wolf') { ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.5, r * 2, r); ctx.fillRect(r * 0.6, -r * 0.9, r * 0.6, r * 0.6); ctx.fillStyle = '#ff4f9a'; ctx.fillRect(r * 0.8, -r * 0.7, 3, 3); }
    else if (u.type === 'golem') { ctx.fillStyle = c; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = '#5b5040'; ctx.fillRect(-r * 0.6, -r * 0.4, r * 1.2, r * 0.3); ctx.fillStyle = '#ffe08a'; ctx.fillRect(-r * 0.4, -r * 0.6, 4, 4); ctx.fillRect(r * 0.2, -r * 0.6, 4, 4); }
    else if (u.type === 'oracle') { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e6fdff'; ctx.fillRect(-2, -r * 0.4, 4, 4); }
    else { ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6); ctx.fillStyle = '#1b1226'; ctx.fillRect(-4, -3, 2, 2); ctx.fillRect(3, -3, 2, 2); }
    if (u.sleep) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('z', r * 0.6, -r - 4 - Math.sin(t * 2) * 3); ctx.fillText('z', r, -r - 12 - Math.sin(t * 2 + 1) * 3); }
  };
  const drawFoe0 = proto.drawFoe;
  proto.drawFoe = function (ctx, u, x, y, r, t, fl) {
    if (u.type === 'phantom') {
      ctx.translate(x, y); ctx.globalAlpha *= 0.85 + 0.15 * Math.sin(t * 6);
      ctx.fillStyle = fl ? '#fff' : '#2a0b1e'; ctx.beginPath(); ctx.arc(0, -4, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#29e0e0'; ctx.fillRect(-7, -8, 4, 4); ctx.fillRect(3, -8, 4, 4);
      for (let i = 0; i < 5; i++) { const a = t * 2 + i * 1.26; ctx.fillStyle = i % 2 ? '#ff4f9a' : '#29e0e0'; ctx.fillRect(Math.cos(a) * (r + 6) - 2, Math.sin(a) * (r + 6) - 6, 4, 4); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#ff4f9a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`幻觉之主 Lv${u.lv || 1}`, 0, -r - 14); ctx.textAlign = 'left';
      return;
    }
    drawFoe0.call(this, ctx, u, x, y, r, t, fl);
  };

  // ---------- HUD：物品栏与加点 ----------
  proto.imHud = function () {
    const g = this, bar = CF.$('#itemBar');
    if (!g.L.immersive) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const sig = g.items.join(',') + '|' + g.skillPts + '|' + g.heroLv;
    if (bar._sig === sig) return; bar._sig = sig;
    bar.innerHTML = '';
    for (let i = 0; i < 4; i++) { const k = g.items[i]; const b = CF.h(`<button class="glass item${k ? '' : ' empty'}" title="${k ? ITEMS[k].n + '：' + ITEMS[k].d : '空物品栏'}">${k ? ITEMS[k].ic : ''}${k && ITEMS[k].use ? '<i>用</i>' : ''}</button>`); b.onclick = () => g.useItem(i); bar.appendChild(b); }
    if (g.skillPts > 0) ['Q', 'W', 'R'].forEach((k) => { const b = CF.h(`<button class="glass item" style="color:var(--hero2);font-weight:900;width:auto;padding:0 6px;white-space:nowrap" title="升级 ${k} 技能">＋${k}</button>`); b.onclick = () => { g.learnSkill(k); bar._sig = ''; g.imHud(); }; bar.appendChild(b); });
  };
})();
