/* 成长系统：经验、3:7 配比引擎、军衔、解锁、每日修炼、成就、战斗加成 */
(function () {
  const CF = window.CF;
  const S = () => CF.Save.data;

  const RANKS = [
    [0, '新兵'], [100, '学徒'], [300, '见习工程师'], [700, '工程师'], [1300, '高级工程师'],
    [2200, '研究员'], [3500, '首席科学家'], [5200, '创始人'], [7500, '连续创业者'], [10000, '造物者'],
  ];
  const LABS = ['gd', 'perceptron', 'pid', 'robot', 'rocket', 'startup', 'code', 'pixel'];
  const TARGET_K = 0.3;

  const P = (CF.P = { RANKS, LABS, TARGET_K });

  P.totalXP = () => S().xp.knowledge + S().xp.practice;
  P.ratio = () => {
    const k = S().xp.knowledge, p = S().xp.practice, t = k + p;
    return { k, p, t, kPct: t ? k / t : 0, pPct: t ? p / t : 0 };
  };
  P.suggestion = () => {
    const r = P.ratio();
    if (r.t < 40) return { type: 'any', text: '刚起步：先做「今日修炼」，知识和实操都来一点。' };
    if (r.kPct > TARGET_K + 0.05) return { type: 'p', text: `知识占比 ${Math.round(r.kPct * 100)}%，偏高。下一项建议做实操：实验室或线下任务。` };
    if (r.kPct < TARGET_K - 0.08) return { type: 'k', text: `知识占比 ${Math.round(r.kPct * 100)}%，偏低。做几道知识题，给实践补上理论。` };
    return { type: 'ok', text: `配比 ${Math.round(r.kPct * 100)} : ${Math.round(r.pPct * 100)}，接近 3:7 的目标，保持节奏。` };
  };
  P.rank = () => {
    const xp = P.totalXP();
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    const cur = RANKS[i], next = RANKS[i + 1];
    return { idx: i, name: cur[1], xp, next: next ? next[0] : null, nextName: next ? next[1] : null, prog: next ? (xp - cur[0]) / (next[0] - cur[0]) : 1 };
  };

  // 发放经验。type: 'k' 知识 / 'p' 实操
  P.addXP = function ({ type, amt, dims = {}, domain = null, founder = null, label = '' }) {
    const d = S();
    const before = P.rank().idx;
    amt = Math.round(amt);
    if (type === 'k') d.xp.knowledge += amt; else d.xp.practice += amt;
    for (const k in dims) d.dims[k] = (d.dims[k] || 0) + amt * dims[k] * 0.5;
    if (domain && d.domains[domain] !== undefined) d.domains[domain] += amt;
    if (founder) for (const k in founder) d.founder[k] = (d.founder[k] || 0) + founder[k];
    P.touchStreak();
    CF.Save.save();
    CF.toast(`+${amt} ${type === 'k' ? '知识' : '实操'}经验${label ? ' · ' + label : ''}`, type === 'k' ? '' : 'gold', 1600);
    const after = P.rank();
    if (after.idx > before) { CF.Audio.sfx('levelup'); setTimeout(() => CF.toast(`军衔晋升：${after.name}`, 'gold', 3000), 400); }
    P.checkAch();
    CF.bus.emit('progress');
  };

  P.touchStreak = function () {
    const st = S().streak, today = CF.today();
    if (st.last === today) return;
    st.count = st.last && CF.dayDiff(st.last, today) === 1 ? st.count + 1 : 1;
    st.last = today; st.best = Math.max(st.best || 0, st.count);
  };

  // ---------- 实验 / 任务状态 ----------
  P.labDone = (id) => !!(S().labs[id] && S().labs[id].done);
  P.labStars = (id) => (S().labs[id] ? S().labs[id].stars || 0 : 0);
  P.labsDoneCount = () => LABS.filter(P.labDone).length;
  P.codeDone = () => Object.keys(S().code).filter((k) => S().code[k]).length;
  P.questCount = (dom) => S().quests.log.filter((l) => !dom || l.d === dom).length;
  P.scenarioCount = () => Object.keys(S().scenarios).length;
  P.trial = () => !!S().settings.trial;

  P.finishLab = function (id, stars, info = {}) {
    const d = S(), rec = d.labs[id] || { done: false, stars: 0, count: 0 };
    const first = !rec.done;
    const gain = first ? 40 + stars * 10 : Math.max(0, stars - rec.stars) * 10 + 8;
    rec.done = true; rec.count = (rec.count || 0) + 1; rec.stars = Math.max(rec.stars || 0, stars);
    d.labs[id] = rec;
    const meta = (CF.Labs && CF.Labs.META[id]) || {};
    P.addXP({ type: 'p', amt: gain, dims: Object.assign({ shi: 1, zhi: 0.4 }, meta.dims || {}), domain: meta.d, label: meta.name });
    P.markDaily('lab', id);
    if (first) { CF.Audio.sfx('unlock'); P.announceUnlocks(); }
  };
  P.finishCode = function (id) {
    const d = S();
    if (d.code[id]) { CF.toast('已完成过，复习也很好'); return; }
    d.code[id] = CF.today();
    const c = CF.Content.CODE.find((x) => x.id === id);
    P.addXP({ type: 'p', amt: 35, dims: { shi: 1, zhi: 0.5 }, domain: c ? c.d : 'ai', label: '代码挑战' });
    if (!P.labDone('code') && P.codeDone() >= 3) P.finishLab('code', 3);
    P.markDaily('lab', 'code');
    P.announceUnlocks();
  };
  P.finishQuest = function (q, note) {
    const d = S();
    d.quests.log.unshift({ id: q.id, d: q.d, t: q.t, note: note.slice(0, 600), date: CF.today() });
    const dom = ['ai', 'emb', 'aero', 'biz'].includes(q.d) ? q.d : null;
    P.addXP({ type: 'p', amt: q.xp, dims: q.dims, domain: dom, label: '线下实操' });
    P.markDaily('quest', q.id);
    P.announceUnlocks();
  };
  P.answerQuiz = function (q, correct) {
    const d = S();
    const rec = d.quiz.seen[q.id] || { c: 0, w: 0 };
    if (correct) { rec.c++; d.quiz.correct++; } else { rec.w++; d.quiz.wrong++; }
    rec.last = Date.now();
    d.quiz.seen[q.id] = rec;
    const dims = { zhi: 1 };
    if (q.d === 'biz') dims.qi = 0.6;
    if (q.d === 'whole') { dims.de = 0.4; dims.mei = 0.3; }
    P.addXP({ type: 'k', amt: correct ? 10 : 3, dims, domain: q.d === 'whole' ? null : q.d, label: correct ? '答对' : '答错也有收获' });
  };
  P.decideScenario = function (sc, idx) {
    const d = S(), first = d.scenarios[sc.id] === undefined;
    d.scenarios[sc.id] = idx;
    const op = sc.opts[idx];
    if (!first) { CF.Save.save(); return; }
    const dims = { qi: 1, zhi: 0.3 };
    if (op.de || sc.opts.some((o) => o.de)) dims.de = (op.de || 0) * 0.4 + 0.2;
    if (op.ti) dims.ti = op.ti * 0.4;
    P.addXP({ type: 'p', amt: op.best ? 30 : 20, dims, domain: 'biz', founder: op.f, label: '情景决策' });
    P.markDaily('scenario', sc.id);
    P.announceUnlocks();
  };

  // ---------- 每日修炼 ----------
  P.dailyPlan = function () {
    const d = S(), today = CF.today();
    if (d.daily.date === today && d.daily.items.length) return d.daily;
    const rnd = CF.rng(CF.hashStr(today));
    const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];
    const undone = LABS.filter((l) => !P.labDone(l));
    const lab = undone.length ? undone[0] : pickR(LABS);
    const doms = ['ai', 'emb', 'aero', 'biz'];
    const dom = doms[Math.floor(rnd() * 4)];
    const qMain = pickR(CF.Content.QUESTS.filter((q) => q.d === dom));
    const qBody = pickR(CF.Content.QUESTS.filter((q) => q.d === 'ti'));
    const qSoul = pickR(CF.Content.QUESTS.filter((q) => q.d === (rnd() < 0.5 ? 'de' : 'mei')));
    const scs = CF.Content.SCENARIOS.filter((s) => d.scenarios[s.id] === undefined);
    const items = [
      { kind: 'quiz', id: 'daily', n: 3, label: '知识小测 3 题', type: 'k' },
      { kind: 'lab', id: lab, label: '实验室', type: 'p' },
      { kind: 'quest', id: qMain.id, label: '线下实操', type: 'p' },
      { kind: 'quest', id: qBody.id, label: '体', type: 'p' },
      { kind: 'quest', id: qSoul.id, label: qSoul.d === 'de' ? '德' : '美', type: 'p' },
    ];
    if (scs.length) items.push({ kind: 'scenario', id: pickR(scs).id, label: '企业家修炼', type: 'p' });
    d.daily = { date: today, items, done: [], bonus: false };
    CF.Save.save();
    return d.daily;
  };
  P.markDaily = function (kind, id) {
    const dl = S().daily;
    if (dl.date !== CF.today()) return;
    const it = dl.items.find((x) => x.kind === kind && (x.id === id || kind === 'quiz'));
    if (it && !dl.done.includes(it.kind + ':' + it.id)) {
      dl.done.push(it.kind + ':' + it.id);
      if (dl.done.length >= dl.items.length && !dl.bonus) {
        dl.bonus = true;
        CF.Save.save();
        setTimeout(() => { CF.toast('今日修炼全部完成！下一场战斗起始算力 +50', 'gold', 3200); CF.Audio.sfx('levelup'); }, 600);
      }
      CF.Save.save();
    }
  };

  // ---------- 解锁 ----------
  const LEVEL_REQ = {
    L1: [],
    L2: [['win', 'L1', '通关「第一行代码」'], ['anylab', ['gd', 'perceptron'], '完成「梯度下降」或「感知机」实验'], ['code', 1, '完成 1 个代码挑战（解锁 Agent 工坊）']],
    L3: [['win', 'L2', '通关「守住上下文」'], ['lab', 'robot', '完成「机器人编程」实验']],
    L4: [['win', 'L3', '通关「原型机护送」'], ['lab', 'pid', '完成「PID 无人机」实验（解锁无人机空港）'], ['lab', 'rocket', '完成「火箭方程」实验']],
    L5: [['win', 'L4', '通关「制空权」'], ['lab', 'startup', '完成「创业沙盘」实验'], ['scen', 3, '完成 3 个企业家情景决策']],
  };
  function reqOk(r) {
    const d = S();
    switch (r[0]) {
      case 'win': return !!(d.campaign[r[1]] && d.campaign[r[1]].won);
      case 'lab': return P.labDone(r[1]);
      case 'anylab': return r[1].some(P.labDone);
      case 'code': return P.codeDone() >= r[1];
      case 'scen': return P.scenarioCount() >= r[1];
      case 'quest': return P.questCount(r[1]) >= (r[2] || 1);
    }
    return false;
  }
  P.levelReqs = (id) => (LEVEL_REQ[id] || []).map((r) => ({ ok: reqOk(r), text: r[2] }));
  P.levelUnlocked = (id) => P.trial() || P.levelReqs(id).every((r) => r.ok);

  const BUILD_REQ = {
    repair: [['quest', 'ti', 1, '完成 1 个「体」线下任务（体能 = 修复力）']],
    radar: [['lab', 'perceptron', 0, '完成「感知机」实验（感知 = 雷达）']],
    workshop: [['code', 1, 0, '完成 1 个代码挑战']],
    port: [['lab', 'pid', 0, '完成「PID 无人机」实验']],
  };
  P.buildUnlocked = function (type) {
    if (P.trial()) return { ok: true };
    const reqs = BUILD_REQ[type];
    if (!reqs) return { ok: true };
    for (const r of reqs) {
      const ok = r[0] === 'quest' ? P.questCount(r[1]) >= r[2] : r[0] === 'lab' ? P.labDone(r[1]) : P.codeDone() >= r[1];
      if (!ok) return { ok: false, why: r[3] };
    }
    return { ok: true };
  };
  P._unlockSnapshot = null;
  P.unlockSnapshot = () => ['repair', 'radar', 'workshop', 'port'].filter((t) => P.buildUnlocked(t).ok).concat(['L2', 'L3', 'L4', 'L5'].filter(P.levelUnlocked));
  P.announceUnlocks = function () {
    const now = P.unlockSnapshot();
    const prev = P._unlockSnapshot || [];
    if (P.trial()) { P._unlockSnapshot = now; return; }
    const names = { repair: '修复站', radar: '雷达站', workshop: 'Agent 工坊', port: '无人机空港', L2: '第 2 关', L3: '第 3 关', L4: '第 4 关', L5: '第 5 关' };
    now.filter((x) => !prev.includes(x)).forEach((x, i) => setTimeout(() => { CF.toast('🔓 解锁：' + names[x], 'gold', 3000); CF.Audio.sfx('unlock'); }, 900 + i * 700));
    P._unlockSnapshot = now;
  };

  // ---------- 战斗加成：学习 → 战力 ----------
  P.battleBonus = function () {
    const d = S(), r = P.ratio();
    const dailyBonus = d.daily.date === CF.today() && d.daily.bonus ? 50 : 0;
    return {
      chips: Math.min(200, Math.floor(r.k / 5)),
      corp: Math.min(150, Math.floor(r.p / 10)),
      comp: dailyBonus,
      compRate: 0.15 * P.labsDoneCount() + 0.05 * P.codeDone(),
      riffMul: 1 + Math.min(0.6, P.questCount() * 0.03),
      heroHp: 1 + Math.min(0.5, (d.dims.ti || 0) / 200),
      lines: [
        `知识经验 → 起始晶片 +${Math.min(200, Math.floor(r.k / 5))}`,
        `实操经验 → 起始语料 +${Math.min(150, Math.floor(r.p / 10))}`,
        `完成 ${P.labsDoneCount()} 个实验、${P.codeDone()} 个代码挑战 → 算力产出 +${(0.15 * P.labsDoneCount() + 0.05 * P.codeDone()).toFixed(2)}/s`,
        `线下任务 ${P.questCount()} 个 → Claude 弦振伤害 +${Math.round(Math.min(0.6, P.questCount() * 0.03) * 100)}%`,
        `「体」${Math.round(d.dims.ti || 0)} 点 → Claude 耐久 +${Math.round(Math.min(0.5, (d.dims.ti || 0) / 200) * 100)}%`,
      ].concat(dailyBonus ? ['今日修炼全部完成 → 起始算力 +50'] : []),
    };
  };

  // ---------- 成就 ----------
  const ACH = [
    ['first_win', '🧑‍💻', '第一行代码', '通关第 1 关', () => !!(S().campaign.L1 && S().campaign.L1.won)],
    ['all_campaign', '🏁', '终局胜者', '通关全部 5 关战役', () => ['L1', 'L2', 'L3', 'L4', 'L5'].every((l) => S().campaign[l] && S().campaign[l].won)],
    ['three_star', '⭐', '三星指挥官', '任意关卡获得三星', () => Object.values(S().campaign).some((c) => c.stars >= 3)],
    ['all_three', '🌟', '完美战役', '全部 5 关三星', () => ['L1', 'L2', 'L3', 'L4', 'L5'].every((l) => S().campaign[l] && S().campaign[l].stars >= 3)],
    ['air', '🛩️', '制空权', '通关第 4 关「制空权」', () => !!(S().campaign.L4 && S().campaign.L4.won)],
    ['riff20', '🎸', '弦振大师', '累计释放 20 次弦振冲击', () => S().stats.riffs >= 20],
    ['kills500', '🧹', '清理乱码', '累计消灭 500 个乱码单位', () => S().stats.kills >= 500],
    ['hard', '🔥', '硬核指挥官', '赢得一场困难遭遇战', () => S().skirmish.hard > 0],
    ['quiz50', '📚', '知识猎手', '累计答对 50 题', () => S().quiz.correct >= 50],
    ['lab3', '🔧', '动手派', '完成 3 个实验', () => P.labsDoneCount() >= 3],
    ['lab_all', '🧪', '全能实验员', '完成全部 8 个实验', () => P.labsDoneCount() >= 8],
    ['code5', '⌨️', '会写代码的指挥官', '完成 5 个代码挑战', () => P.codeDone() >= 5],
    ['quest10', '🤝', '知行合一', '完成 10 个线下实操任务', () => P.questCount() >= 10],
    ['ratio', '⚖️', '黄金配比', '总经验 ≥ 300 且实操占比在 65%–75%', () => { const r = P.ratio(); return r.t >= 300 && r.pPct >= 0.65 && r.pPct <= 0.75; }],
    ['streak7', '📅', '七日不辍', '连续 7 天有学习记录', () => S().streak.count >= 7],
    ['whole', '🌱', '德智体美', '德、智、体、美四维都达到 30', () => ['de', 'zhi', 'ti', 'mei'].every((k) => S().dims[k] >= 30)],
    ['founder5', '💡', '第一性原理', '完成 5 个企业家情景决策', () => P.scenarioCount() >= 5],
    ['pixel', '🎨', '像素艺术家', '保存自己的像素头像', () => !!S().avatar],
    ['rank6', '🔬', '首席科学家', '军衔达到「首席科学家」', () => P.rank().idx >= 6],
  ].map((a) => ({ id: a[0], icon: a[1], name: a[2], desc: a[3], test: a[4] }));
  P.ACH = ACH;
  P.checkAch = function () {
    const d = S();
    ACH.forEach((a) => {
      if (d.achievements[a.id]) return;
      let ok = false; try { ok = a.test(); } catch (e) {}
      if (ok) { d.achievements[a.id] = CF.today(); CF.Save.save(); setTimeout(() => { CF.toast(`${a.icon} 成就解锁：${a.name}`, 'gold', 3200); CF.Audio.sfx('unlock'); }, 300); }
    });
  };
})();
