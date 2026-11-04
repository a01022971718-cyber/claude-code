/* 章节、普通关（次级关 / 小关）、组队副本，以及难度生成器。
 * 规则见 design/01-level-difficulty-constitution.md（关卡难度宪法 v1）。
 *  - 每章随机 10–13 个普通关（按存档种子固定，换设备导入存档也一样）；
 *  - 次级关 = 剧情关：3 波，通关后不可重复挑战；
 *  - 小关 = 程序生成：3 波，可重复挑战，奖励是长期消耗品；
 *  - 组队副本：5 波，难度略高，每波都有奖励，第 5 波掉英雄碎片；每天 3 次。 */
(function () {
  const CF = window.CF;

  // ================= 难度生成器 =================
  const THREAT = { bug: 1, noise: 2.2, bat: 1.8, titan: 9 };
  const Diff = {
    THREAT,
    // 难度等级 P 对应的「满额波次」威胁值（普通关第 3 波 / 副本第 4 波）
    budget: (P) => Math.round(12 * Math.pow(1.15, P - 1)),
    // 敌人耐久随难度缓慢上升（每级 +2.5%）
    hpMul: (P) => Math.round((1 + 0.025 * (P - 1)) * 100) / 100,
    SPLIT3: [0.25, 0.5, 1],
    SPLIT5: [0.3, 0.5, 0.75, 1, 1.2],
    MIX: {
      ground: { bug: 0.55, noise: 0.35, titan: 0.1 },
      swarm: { bug: 0.7, bat: 0.3 },
      heavy: { bug: 0.35, noise: 0.2, titan: 0.45 },
      air: { bat: 0.8, noise: 0.2 },
      mixed: { bug: 0.4, noise: 0.25, bat: 0.2, titan: 0.15 },
    },
    THEME_NAME: { ground: '地面推进', swarm: '虫群', heavy: '重装', air: '空袭', mixed: '混编' },
    tier(P) { return P < 3 ? ['入门', '#6fdc8c'] : P < 6 ? ['普通', '#3fd0c9'] : P < 9 ? ['进阶', '#ffb14a'] : P < 12 ? ['挑战', '#ff7a45'] : ['噩梦', '#ff4f9a']; },
    wave(P, frac, theme) {
      const B = Diff.budget(P) * frac, mix = Object.assign({}, Diff.MIX[theme] || Diff.MIX.ground), units = [];
      // 新兵种按难度逐步登场：飞行 P ≥ 3（空袭主题除外）、巨像 P ≥ 4 且只在后半程；被跳过的份额并入乱码虫
      if (mix.bat && P < 3 && theme !== 'air') { mix.bug = (mix.bug || 0) + mix.bat; delete mix.bat; }
      if (mix.titan && (P < 4 || frac < 0.5)) { mix.bug = (mix.bug || 0) + mix.titan; delete mix.titan; }
      for (const k in mix) { const n = Math.round((B * mix[k]) / THREAT[k]); if (n > 0) units.push([k, n]); }
      if (!units.length) units.push(['bug', Math.max(2, Math.round(B))]);
      return { units };
    },
    waves(P, n, theme, boss) {
      return (n === 5 ? Diff.SPLIT5 : Diff.SPLIT3).map((f, i) => { const w = Diff.wave(P, f, theme); if (boss && i === n - 1) { w.boss = boss; w.tag = 'Boss'; } return w; });
    },
    threatOf: (w) => w.units.reduce((s, [k, n]) => s + (THREAT[k] || 1) * n, 0) + (w.boss ? 30 : 0),
  };

  // ================= 章节 =================
  const CHAPTERS = [
    {
      id: 'c1', no: 1, name: '新生', en: 'REBIRTH', sub: '从第一行代码到第一台机器人', P0: 1, P1: 7.5,
      story: ['L1', 'L2', 'L3'], storyAt: (n) => [0, Math.floor(n / 2), n - 1],
      themes: ['ground', 'swarm', 'ground', 'heavy', 'mixed', 'swarm'],
      names: ['数据荒原', '梯度山谷', '噪声湿地', '参数森林', '反向传播峡', '权重平原', '激活函数桥', '损失低谷', '卷积回廊', '注意力高地', '词元集市', '向量海岸'],
      learn: ['数据清洗', '梯度下降', '过拟合', '神经网络', '反向传播', '学习率', '激活函数', '损失函数', '卷积', '注意力机制', '分词', '向量嵌入'],
      dungeon: { id: 'D1', after: 'L2', name: '乱码巢穴', boss: 'forget', pool: ['star', 'twin', 'riot', 'llama'], P: 6 },
    },
    {
      id: 'c2', no: 2, name: '向上', en: 'ASCEND', sub: '夺取制空权，冲向星辰', P0: 8, P1: 15,
      story: ['L4', 'L5'], storyAt: (n) => [Math.floor(n / 3), n - 1],
      themes: ['air', 'mixed', 'heavy', 'swarm', 'air', 'mixed'],
      names: ['轨道前哨', '推进剂工厂', '低轨走廊', '发射窗口', '引力弹弓', '再入走廊', '姿态控制塔', '卫星星座', '火星中继站', '深空网络', '星舰船坞', '月面基地'],
      learn: ['轨道力学', '比冲', '低地球轨道', '发射窗口', '引力助推', '再入防热', '姿态控制', '卫星通信', '行星际中继', '深空测控', '可复用火箭', '月面着陆'],
      dungeon: { id: 'D2', after: 'L4', name: '遗忘深渊', boss: 'carrier', pool: ['abyss', 'luna', 'bun', 'star'], P: 13 },
    },
  ];

  const Ch = (CF.Chapters = { CHAPTERS, Diff, ATTEMPTS: 3 });
  const S = () => CF.Save.data;
  const seed = () => { const c = S().chapters; if (!c.seed) { c.seed = CF.randi(1, 1e9); CF.Save.save(); } return c.seed; };
  const today = () => new Date().toISOString().slice(0, 10);
  const rec = (id) => S().campaign[id] || {};

  // 章节的关卡序列（按种子固定）
  const cache = {};
  Ch.stages = function (ch) {
    const key = ch.id + seed();
    if (cache[key]) return cache[key];
    const rnd = CF.rng(seed() + ch.no * 7919), n = 10 + Math.floor(rnd() * 4), at = ch.storyAt(n), out = [];
    let m = 0;
    for (let i = 0; i < n; i++) {
      const P = Math.round((ch.P0 + ((ch.P1 - ch.P0) * i) / (n - 1)) * 10) / 10, si = at.indexOf(i);
      if (si >= 0) { const L = CF.Levels.get(ch.story[si]); out.push({ i, kind: 'story', id: L.id, P, L }); }
      else { m++; out.push({ i, kind: 'minor', id: `${ch.id}m${m}`, P, minorNo: m, seed: Math.floor(rnd() * 1e9) }); }
    }
    return (cache[key] = out);
  };
  Ch.find = function (id) { for (const ch of CHAPTERS) { const st = Ch.stages(ch).find((s) => s.id === id); if (st) return { ch, st }; } return null; };
  Ch.cleared = (id) => !!rec(id).won;
  Ch.chapterDone = (ch) => Ch.stages(ch).every((s) => Ch.cleared(s.id));
  // 解锁：上一关已通关（第二章第一关要求第一章全部通关）；次级关另需完成对应学习（「学到的会变成战场上的能力」）
  Ch.unlocked = function (ch, st) {
    if (CF.P.trial()) return true;
    const list = Ch.stages(ch);
    if (st.i > 0 && !Ch.cleared(list[st.i - 1].id)) return false;
    if (st.i === 0 && ch.no > 1 && !Ch.chapterDone(CHAPTERS[ch.no - 2])) return false;
    if (st.kind === 'story') return CF.P.levelReqs(st.id).filter((r) => !/^通关/.test(r.text)).every((r) => r.ok);
    return true;
  };
  Ch.storyReqs = (st) => CF.P.levelReqs(st.id).filter((r) => !/^通关/.test(r.text));

  // ================= 小关生成 =================
  Ch.minorLevel = function (ch, st) {
    const rnd = CF.rng(st.seed), W = 2200, H = 1300, cy = 650, theme = ch.themes[(st.minorNo - 1) % ch.themes.length];
    const idx = (st.minorNo - 1) % ch.names.length;
    const cliffs = [];
    for (let i = 0; i < 4; i++) { const h = Math.round(220 + rnd() * 300), top = (i + Math.floor(rnd() * 2)) % 2 === 0; cliffs.push([Math.round(980 + i * 210 + rnd() * 50), top ? 0 : H - h, Math.round(90 + rnd() * 50), h]); }
    const air = theme === 'air';
    return {
      id: st.id, no: `${ch.no}-${st.i + 1}`, name: ch.names[idx], learn: ch.learn[idx], minor: true, chapter: ch.id, P: st.P, theme,
      brief: `第${['', '一', '二'][ch.no]}章 · 小关 ${st.minorNo}。乱码军团的「${Diff.THEME_NAME[theme]}」部队正在逼近。守住 3 波进攻即可获胜，可以反复挑战来积攒长期补给。`,
      tip: air ? '这一关以飞行敌人为主：炮塔、编码 Agent 和拦截无人机都能对空。' : '前两波很轻松，抓紧时间造矿机、攒经济；第 3 波才是真正的考验。',
      w: W, h: H, core: [300, cy], hero: [430, cy], cliffs,
      nodes: [['chip', 540, 470], ['chip', 540, 830], ['chip', 860, 650], ['corp', 380, 960], ['corp', 700, 260]],
      spawns: [[W - 40, Math.round(260 + rnd() * 200)], [W - 40, Math.round(840 + rnd() * 200)]],
      first: 35, gap: 32, waves: Diff.waves(st.P, 3, theme), hpMul: Diff.hpMul(st.P),
      objectives: [{ text: '守住 3 波进攻', test: (g) => g.wavesCleared() }],
      win: (g) => g.wavesCleared(),
      stars: [['获胜', () => true], ['主脑耐久 ≥ 60%', (g) => g.coreHpPct() >= 0.6], ['主脑耐久 ≥ 90%', (g) => g.coreHpPct() >= 0.9]],
      script: [[1, 'HERO', `「${ch.learn[idx]}」——这一关我们边打边学。`]],
      onEnd: (g, win, stars) => Ch.minorReward(ch, st, win, stars, g),
    };
  };

  // ================= 组队副本 =================
  Ch.dungeonUnlocked = (ch) => CF.P.trial() || Ch.cleared(ch.dungeon.after);
  Ch.attempts = function (ch) { const d = S().dungeon, r = d[ch.dungeon.id] || (d[ch.dungeon.id] = { date: '', used: 0, best: 0 }); if (r.date !== today()) { r.date = today(); r.used = 0; } return Ch.ATTEMPTS - r.used; };
  Ch.featured = function (ch) {
    const pool = ch.dungeon.pool.filter((id) => !CF.Roster.ownsReal(id));
    if (!pool.length) return null;
    const day = Math.floor(Date.now() / 864e5);
    return pool[day % pool.length];
  };
  const DREWARD = [{ chip: 150 }, { corp: 120 }, { comp: 60 }, { boost: 1 }, { frag: 3 }];
  Ch.dungeonRewards = (ch) => DREWARD.map((r, i) => { const o = {}; for (const k in r) o[k] = k === 'frag' || k === 'boost' ? r[k] : r[k] * ch.no; o.wave = i + 1; return o; });
  Ch.rewardText = function (r, ch) {
    if (r.frag) { const f = Ch.featured(ch); return f ? `${CF.Heroes.get(f).name} 碎片 ×${r.frag}` : `晶片 ×${300 * ch.no}`; }
    if (r.boost) return `学习加速 ×${r.boost}`;
    return Object.keys(r).filter((k) => k !== 'wave').map((k) => `${{ chip: '晶片', corp: '语料', comp: '算力' }[k]} ×${r[k]}`).join(' · ');
  };
  Ch.dungeonLevel = function (ch, team) {
    const P = ch.dungeon.P, rewards = Ch.dungeonRewards(ch);
    return {
      id: ch.dungeon.id, no: `${ch.no}-副本`, name: ch.dungeon.name, learn: '团队协作', dungeon: true, chapter: ch.id, P, team,
      brief: `组队副本：最多 3 位英雄并肩作战（队友由 AI 控制）。一共 5 波，比普通关略难；每守住一波都能拿到奖励，第 5 波是首领与英雄碎片。今天还能挑战 ${Ch.attempts(ch)} 次。`,
      tip: '队友会自动跟随主英雄并释放技能。先稳住前两波的经济，第 4、5 波敌人最多。',
      w: 2400, h: 1500, core: [300, 750], hero: [440, 750],
      cliffs: [[1150, 0, 140, 480], [1150, 1020, 140, 480], [1650, 380, 110, 260], [1650, 880, 110, 260]],
      nodes: [['chip', 540, 560], ['chip', 540, 940], ['chip', 880, 750], ['corp', 380, 1080], ['corp', 720, 380], ['corp', 380, 420]],
      spawns: [[2360, 400], [2360, 1100], [2360, 750]],
      first: 40, gap: 38, waves: Diff.waves(P, 5, 'mixed', ch.dungeon.boss), hpMul: Diff.hpMul(P),
      objectives: [{ text: '守住 5 波进攻（每波都有奖励）', test: (g) => g.wavesCleared() }, { text: '击败第 5 波首领', test: (g) => g.bossKilled(ch.dungeon.boss) }],
      win: (g) => g.wavesCleared(),
      stars: [['获胜', () => true], ['主脑耐久 ≥ 60%', (g) => g.coreHpPct() >= 0.6], ['没有英雄阵亡', (g) => !g.heroDeaths]],
      script: [[1, 'HERO', '组队副本开始。队友们，跟上我！'], [20, '侦察Agent', '每守住一波，补给就会送到主城仓库。']],
      onWaveClear: (g, n) => { const L = g.L; L._paid = L._paid || new Set(); if (L._paid.has(n)) return; L._paid.add(n); const r = rewards[n - 1]; if (r) Ch.grantDungeon(ch, r, g); },
      onEnd: (g, win) => { const d = S().dungeon[ch.dungeon.id]; d.best = Math.max(d.best || 0, g.clearedN || 0); if (win && !CF.P.trial()) [g.heroId].concat(team).forEach((id) => { if (id !== 'xs' && CF.Roster.ownsReal(id)) CF.Treasure.grant(id); }); },
    };
  };
  Ch.grantDungeon = function (ch, r, g) {
    const txt = Ch.rewardText(r, ch);
    if (r.frag) { const f = Ch.featured(ch); if (f) CF.Roster.addFrag(f, r.frag); else CF.City.add({ chip: 300 * ch.no }); }
    else if (r.boost) S().boosts = (S().boosts || 0) + r.boost;
    else CF.City.add({ chip: r.chip || 0, corp: r.corp || 0, comp: r.comp || 0 });
    (g.waveRewards = g.waveRewards || []).push(`第 ${r.wave} 波：${txt}`);
    CF.Save.save(); CF.toast(`🎁 第 ${r.wave} 波奖励：${txt}`, 'gold', 2600); CF.Audio.sfx('unlock');
  };

  // ================= 奖励 =================
  // 小关：长期消耗品（主城资源）；首通双倍 + 1 次学习加速；第 3 / 5 个小关首通赠送英雄
  Ch.minorReward = function (ch, st, win, stars, g) {
    if (!win) return;
    const first = !g.wasCleared, k = (first ? 2 : 1) * (1 + stars * 0.25), P = st.P;
    const got = { chip: Math.round((80 + 20 * P) * k), corp: Math.round((40 + 10 * P) * k), comp: Math.round((10 + 3 * P) * k) };
    CF.City.add(got);
    const lines = [`补给：晶片 ${got.chip} · 语料 ${got.corp} · 算力 ${got.comp}（已送到主城仓库）`];
    if (first) { S().boosts = (S().boosts || 0) + 1; lines.push('首通：学习加速 ×1'); }
    if (first && ch.no === 1 && st.minorNo === 3 && CF.Roster.grant('omni', '第一章 · 第 3 个小关首通奖励')) lines.push('首通：获得英雄「万象」');
    if (first && ch.no === 1 && st.minorNo === 5 && CF.Roster.grant('pearl', '第一章 · 第 5 个小关首通奖励')) lines.push('首通：获得英雄「珠问」');
    g.stageRewards = lines;
  };
  // 次级关：首通奖励（只能领一次，因为次级关不可重复）
  Ch.storyReward = function (ch, st, win, g) {
    if (!win || g.wasCleared) return;
    const got = { chip: 300 * ch.no, corp: 150 * ch.no, comp: 40 * ch.no };
    CF.City.add(got);
    const lines = [`首通：晶片 ${got.chip} · 语料 ${got.corp} · 算力 ${got.comp}`];
    if (st.id === CHAPTERS[0].story[CHAPTERS[0].story.length - 1] && !CF.P.trial() && CF.Treasure.grant('xs')) lines.push('章节终章：获得 X-S 的法宝「电吉他」');
    g.stageRewards = lines;
  };
  // 给剧情关挂上章节信息与奖励回调
  Ch.storyLevel = function (ch, st) { return Object.assign({}, st.L, { no: `${ch.no}-${st.i + 1}`, story: true, chapter: ch.id, P: st.P, onEnd: (g, win) => Ch.storyReward(ch, st, win, g) }); };
  Ch.level = (ch, st) => (st.kind === 'story' ? Ch.storyLevel(ch, st) : Ch.minorLevel(ch, st));
  // 下一关（结算页「下一关」按钮）
  Ch.next = function (id) {
    const f = Ch.find(id); if (!f) return null;
    const list = Ch.stages(f.ch), nx = list[f.st.i + 1];
    if (nx) return Ch.unlocked(f.ch, nx) ? Ch.level(f.ch, nx) : null;
    const ch2 = CHAPTERS[f.ch.no]; if (!ch2) return null;
    const s0 = Ch.stages(ch2)[0]; return Ch.unlocked(ch2, s0) ? Ch.level(ch2, s0) : null;
  };
  // 第几个小关（结算页、教程等引用）
  Ch.progress = function () { let won = 0, total = 0; CHAPTERS.forEach((ch) => Ch.stages(ch).forEach((s) => { total++; if (Ch.cleared(s.id)) won++; })); return { won, total }; };
})();
