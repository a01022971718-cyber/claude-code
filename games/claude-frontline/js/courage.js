/* 勇气手账（v9.6，主创要求「增加一个能够增加信心的功能：提供情绪价值，鼓励我，让我充满斗志」）
 * 画风：手绘水彩（CF.WC，UI 宪法第 28 章）。入口：大厅右侧「勇气手账」、AI 助手鼓励教练、卡住时的提示。
 * 设计依据（班杜拉「自我效能」的四个来源，补充主创没提到的部分）：
 *   1) 亲身做成过（最有用）→「星空」：你真实做到的每件事变成一颗星，进度越多月亮越圆；
 *   2) 看到别人也做到了 →「他们也失败过」：只讲公开、可查证的真实经历，写清年份和出处；
 *   3) 别人的鼓励 →「今天」：按心情给一句话 + 一个 10 分钟内能做完的最小行动；接了 AI 的话，鼓励教练会引用你真实的进度；
 *   4) 身体和情绪状态 → 心情打卡、一分钟方块呼吸；累了就做最小的一步，休息也算训练。
 * 不做的事：不用「断签」惩罚你（出现就算，不要求连续）；不吹捧；情绪很差时提醒找身边的人和专业帮助。 */
(function () {
  const CF = window.CF;
  const G = (CF.Courage = {});
  const esc = (s) => CF.esc(String(s == null ? '' : s));
  const S = () => { const d = CF.Save.data; d.courage = d.courage || {}; const c = d.courage; c.days = c.days || {}; c.wins = c.wins || []; c.letters = c.letters || []; if (c.why == null) c.why = ''; return c; };
  const day = (k) => { const c = S(); return (c.days[k] = c.days[k] || {}); };
  const today = () => CF.today();
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };   // 本地日期，和 CF.today() 一致

  const MOODS = [
    { k: 'fired', n: '斗志满满', c: '#b8433a' }, { k: 'ok', n: '还行', c: '#6b8e3a' }, { k: 'tired', n: '累了', c: '#4f8fa8' },
    { k: 'anxious', n: '焦虑', c: '#7a6aa8' }, { k: 'lost', n: '迷茫', c: '#8a8278' }, { k: 'stuck', n: '卡住了', c: '#b9783f' },
  ];
  // 鼓励话：具体、不吹捧、给下一步（mood 对应心情；any 任何时候）
  const LINES = [
    ['fired', '状态好的时候，挑一关「有点难」的。真正的进步发生在「刚好够不着」的地方。'],
    ['fired', '把今天的斗志写进「小胜利」：以后累的时候，翻回来看看今天的自己。'],
    ['ok', '「还行」就是最好的学习状态：不急不躁，正好稳稳地往前走一关。'],
    ['ok', '今天不用追求很多，做完一件事就合上手机，比刷两小时更有用。'],
    ['tired', '996 之后还打开这里，本身就说明你没放弃。今天只做最小的一步：一道题，两分钟。'],
    ['tired', '累的时候学不进去很正常。睡够觉也是训练：记忆是在睡觉的时候整理好的。'],
    ['tired', '今天的目标不是「学很多」，而是「不断线」。10 分钟也算赢。'],
    ['anxious', '焦虑往往来自「要学的太多」。把它缩小：只看下一关，别看整座山。'],
    ['anxious', '先做一分钟呼吸，让身体慢下来；身体慢下来，脑子才转得动。'],
    ['anxious', '别拿自己的第一章和别人的第二十章比。你只需要比昨天的自己多走一步。'],
    ['lost', '迷茫的时候，看看你的星空：你已经做到的事，比你记得的多。'],
    ['lost', '不知道往哪走时，选「最小的、能马上开始的那一步」。方向是走出来的，不是想出来的。'],
    ['lost', '可以问 AI 导师：把你现在会什么、想去哪儿告诉它，让它帮你排下一周的计划。'],
    ['stuck', '卡住不是你笨，是你正在学一个新东西。所有人学新东西都会卡。'],
    ['stuck', '换个角度：先看提示、先做一道简单的，回头再来。卡住的关下次往往一下就过了。'],
    ['stuck', '把卡住的地方原样告诉 AI 导师（截图也行），让它只给提示、不给答案。'],
    ['any', '「还没学会」和「学不会」是两回事。你现在只是还没学会。'],
    ['any', '每个专家都当过很久的新手。区别只是他们没停下来。'],
  ];
  // 他们也失败过：只写公开报道过的事实，给年份和出处；细节以原始出处为准
  const STORIES = [
    { who: 'SpaceX', year: '2006–2008', title: '前三次发射全失败', text: 'SpaceX 的猎鹰 1 号火箭，2006、2007、2008 年前三次发射都失败了。2008 年 9 月 28 日第四次发射成功入轨，成为第一枚由私人公司研制、进入地球轨道的液体燃料火箭。', lesson: '失败三次没关系，关键是每次都找到原因、修好再来。这和你在实验室里「看症状 → 找原因 → 改一个 → 再测」是一回事。', source: 'SpaceX 公司历史；相关公开报道', icon: '🚀', c: '#3b5b92' },
    { who: '马斯克', year: '2008', title: '两家公司差点同时没钱', text: '2008 年金融危机时，特斯拉和 SpaceX 都差点撑不下去。那年 12 月，SpaceX 拿到 NASA 约 16 亿美元的国际空间站货运合同，特斯拉也完成了一轮融资，两家公司都活了下来。', lesson: '最难的时候往往离转机不远。先活下来，才有后面的故事。', source: 'NASA 2008 年 12 月商业补给服务合同公告；相关公开报道', icon: '🛰️', c: '#2e4a62' },
    { who: '黄仁勋', year: '1970 年代–1993', title: '从餐厅洗碗工到创始人', text: '黄仁勋少年时在 Denny\'s 餐厅洗过碗、当过服务员。1993 年，30 岁的他和两位朋友一起创立了英伟达（他说创业的想法是在一家 Denny\'s 餐厅里聊出来的）。', lesson: '起点低不是问题。他后来常说，那段打工经历教会了他吃苦和照顾别人。', source: 'NVIDIA 公司历史；黄仁勋公开采访与演讲', icon: '🍳', c: '#6b8e3a' },
    { who: '英伟达', year: '1995–1997', title: '第一款芯片卖不动', text: '英伟达的第一款芯片 NV1（1995 年）市场反响很差，公司陷入困境，黄仁勋后来说当时「离倒闭只有 30 天」。1997 年推出的 RIVA 128 卖得很好，公司才活了下来。', lesson: '第一版做不好很正常。重要的是从失败里知道市场要什么，再做下一版。', source: '黄仁勋公开演讲；NVIDIA 公司历史', icon: '💾', c: '#3f8a7a' },
    { who: '黄仁勋', year: '2024', title: '「祝你们经历足够多的痛苦」', text: '2024 年在斯坦福商学院的一次对谈里，黄仁勋对学生们说，希望他们经历足够多的痛苦和磨难——因为品格和韧性是在挫折里炼出来的。', lesson: '你现在 996 之后还在学，就是在练这种韧性。', source: '斯坦福商学院 View From The Top 对谈（2024）', icon: '🎓', c: '#7a6aa8' },
    { who: '扎克伯格', year: '2007', title: '一个功能惹怒了用户', text: '2007 年，Facebook 推出 Beacon 广告功能，把用户在其他网站的购买行为发到好友动态里，引发强烈反对。扎克伯格公开道歉，让用户可以关闭它，这个功能后来被停掉了。', lesson: '犯错以后公开承认、马上改，比死撑着有用得多。', source: 'Facebook 2007 年 12 月官方博客道歉信；相关公开报道', icon: '📰', c: '#b8433a' },
    { who: 'Facebook', year: '2012', title: '上市后股价跌掉一半', text: '2012 年 Facebook 上市后，几个月内股价跌掉一半左右，外界质疑它做不好手机端。公司随后全力转向移动端，几年后手机广告成了它最主要的收入。', lesson: '被所有人质疑的时候，看清问题在哪，然后全力去补那一块。', source: '2012 年相关财经报道；Facebook 历年财报', icon: '📱', c: '#4f8fa8' },
    { who: '任正非', year: '1987', title: '43 岁才开始创业', text: '1987 年，43 岁的任正非和几位伙伴凑了 2.1 万元，在深圳创立了华为，最开始是代理销售电话交换机。', lesson: '开始得晚不等于来不及。你现在开始，比永远不开始早得多。', source: '华为公司官网简介；相关公开报道', icon: '📞', c: '#a4613a' },
    { who: '火星直升机「机智号」', year: '2021–2024', title: '原计划飞 5 次，最后飞了 72 次', text: '机智号原本只是一次技术验证，计划最多飞 5 次。它在火星上一共飞了 72 次，直到 2024 年 1 月旋翼受损才结束任务。', lesson: '先做一个「能飞起来」的小东西，再一次次往上加。你学东西也一样：先做出最小的一个，再迭代。', source: 'NASA 喷气推进实验室（JPL）公开资料', icon: '🚁', c: '#e6b422' },
  ];

  // ---------- 进度证据 ----------
  function evidence() {
    const d = CF.Save.data, out = [];
    try {
      if (CF.EmbData && CF.EmbData.TRACKS) { const st = (d.emb && d.emb.lv) || {}; CF.EmbData.TRACKS.forEach((t) => { const lv = t.stages.flatMap((s) => s.levels).filter((l) => st[l.id]); if (lv.length) out.push({ kind: 'track', t, lv }); }); }
      CF.P.LABS.filter(CF.P.labDone).forEach((id) => out.push({ kind: 'lab', id }));
      const q = d.quiz || {}; if (q.correct) out.push({ kind: 'quiz', n: q.correct });
      if (CF.AICourse) CF.AICourse.done().forEach((id) => out.push({ kind: 'ai', id }));
      S().wins.forEach((w) => out.push({ kind: 'win', w }));
    } catch (e) { /* 存档旧 */ }
    return out;
  }
  // 月相：真实进度的加权（具身智能 40%、实验 20%、答题 20%、AI 学徒 20%）
  G.moon = function () {
    const d = CF.Save.data; let embDone = 0, embAll = 1;
    if (CF.EmbData && CF.EmbData.TRACKS) { const st = (d.emb && d.emb.lv) || {}, all = CF.EmbData.TRACKS.flatMap((t) => t.stages.flatMap((s) => s.levels)); embAll = all.length || 1; embDone = all.filter((l) => st[l.id]).length; }
    const ai = CF.AICourse ? CF.AICourse.ratio() : 0;
    return Math.min(1, 0.4 * (embDone / embAll) + 0.2 * (CF.P.labsDoneCount() / CF.P.LABS.length) + 0.2 * Math.min(1, ((d.quiz && d.quiz.correct) || 0) / 100) + 0.2 * ai);
  };
  const facts = () => {
    const d = CF.Save.data, st = (d.emb && d.emb.lv) || {}, emb = Object.keys(st).filter((k) => st[k]).length, wk = weekDays();
    const out = [];
    if (emb) out.push(`通关了 ${emb} 关具身智能`); if (d.quiz && d.quiz.correct) out.push(`答对了 ${d.quiz.correct} 道题`); if (CF.P.labsDoneCount()) out.push(`完成了 ${CF.P.labsDoneCount()} 个实验`);
    if (CF.AICourse && CF.AICourse.done().length) out.push(`学了 ${CF.AICourse.done().length} 关 AI 学徒课`); if (wk) out.push(`这周来了 ${wk} 天`); if (S().wins.length) out.push(`写下了 ${S().wins.length} 个小胜利`);
    return out;
  };
  function weekDays() { let n = 0; for (let i = 0; i < 7; i++) { const x = S().days[shift(-i)]; if (x && (x.xp || x.m || x.w)) n++; } return n; }
  CF.bus.on('progress', () => { const t = day(today()); t.xp = (t.xp || 0) + 1; });
  G.summary = function () { const t = S().days[today()] || {}, m = MOODS.find((x) => x.k === t.m); return `勇气手账：今天的心情 ${m ? m.n : '没打卡'}${t.note ? '（' + t.note.slice(0, 40) + '）' : ''}；这周来了 ${weekDays()} 天；小胜利 ${S().wins.length} 条${S().why ? '；愿景：' + S().why.slice(0, 60) : ''}`; };
  G.lobbyLine = function () { const t = S().days[today()] || {}, m = MOODS.find((x) => x.k === t.m), ready = S().letters.filter((l) => !l.opened && l.open <= today()).length; return ready ? `${ready} 封信可以拆了` : m ? `${m.n} · 本周 ${weekDays()} 天` : '今天还没打卡'; };
  G.stuckLine = function () { const l = LINES.filter((x) => x[0] === 'stuck'); return l[(new Date().getDate() + l.length) % l.length][1]; };
  const lineFor = (k) => { const pool = LINES.filter((x) => x[0] === k || x[0] === 'any').map((x) => x[1]).concat(CF.Mods ? CF.Mods.cheer().lines.filter((l) => !l.mood || l.mood === k || l.mood === 'any').map((l) => l.text) : []); return pool[(new Date().getDate() * 7 + k.length) % pool.length]; };

  // ================= 页面 =================
  let root = null, tab = 'today', raf = 0;
  G.open = function (t) {
    tab = t || 'today';
    root = CF.h('<div class="cg rail-page"><nav class="rail" role="tablist" aria-label="勇气手账"></nav><div class="rail-main cg-main wc-paper"></div></div>');
    CF.modal.open({ title: '🌙 勇气手账', body: root, wide: true, onClose: () => { cancelAnimationFrame(raf); root = null; } });
    CF.$('#modalCard').classList.add('cg-full');
    render();
  };
  function render() {
    if (!root) return; cancelAnimationFrame(raf);
    const rail = root.querySelector('.rail'), main = root.querySelector('.cg-main');
    rail.innerHTML = [['today', '今天'], ['sky', '我的星空'], ['story', '他们也失败过'], ['letter', '给未来的信'], ['breath', '一分钟呼吸']].map(([k, n]) => `<button role="tab" data-t="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${n}</button>`).join('');
    rail.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); tab = b.dataset.t; render(); }));
    main.scrollTop = 0;
    ({ today: todayTab, sky: skyTab, story: storyTab, letter: letterTab, breath: breathTab })[tab](main);
  }
  G.render = render;

  // ---------- 今天 ----------
  function todayTab(main) {
    const c = S(), t = day(today()), m = MOODS.find((x) => x.k === t.m), ready = c.letters.filter((l) => !l.opened && l.open <= today());
    main.innerHTML = `<div class="cg-pg"><canvas class="cg-banner"></canvas>
      <div class="cg-why"><b>我为什么出发</b><span>${c.why ? esc(c.why) : '写一句你的愿景，累的时候看一眼。'}</span><button class="btn sm ghost" data-why>${c.why ? '改' : '写'}</button></div>
      ${ready.length ? `<button class="cg-letter-ready" data-letter>✉ 有 ${ready.length} 封你以前写给现在的信，可以拆了</button>` : ''}
      <h4 class="cg-h">今天感觉怎么样？</h4><div class="cg-moods">${MOODS.map((x) => `<button class="cg-mood ${t.m === x.k ? 'on' : ''}" data-m="${x.k}" style="--c:${x.c}"><i></i>${x.n}</button>`).join('')}</div>
      <div class="cg-resp"></div>
      <h4 class="cg-h">今天的小胜利 <small>再小也算：看懂了一个词、坚持了 10 分钟、修好了一个报错……</small></h4>
      <div class="cg-winrow"><input class="cg-wininput" maxlength="80" placeholder="今天我……"><button class="btn primary" data-addwin>记下来</button></div>
      <div class="cg-wins">${c.wins.filter((w) => w.d === today()).map((w) => `<span class="cg-win">✦ ${esc(w.text)}</span>`).join('') || (t.xp ? '<span class="small">今天已经在游戏里学到了东西：这本身就是一个小胜利。</span>' : '')}</div>
      <h4 class="cg-h">这一周 <small>出现就算，不要求连续：断了也不清零</small></h4><div class="cg-week">${Array.from({ length: 7 }, (_, i) => { const k = shift(i - 6), x = c.days[k] || {}, on = !!(x.xp || x.m || x.w); return `<span class="cg-dot ${on ? 'on' : ''} ${k === today() ? 'today' : ''}" title="${k}"><i></i><small>${'日一二三四五六'[new Date(k + 'T00:00:00').getDay()]}</small></span>`; }).join('')}</div>
      <p class="cg-help small">如果连续两周以上情绪低落、睡不好，或者有伤害自己的念头，请告诉身边信任的人，或者打心理援助热线：全国统一心理援助热线 12356、希望 24 热线 400-161-9995（号码以官方公布为准）。</p></div>`;
    drawBanner(main.querySelector('.cg-banner'));
    main.querySelector('[data-why]').onclick = () => { const v = prompt('我为什么出发？（一句话）', c.why || '从零学成 AI + 具身智能 + 航空航天的专家，以后自己创业。'); if (v != null) { c.why = v.trim().slice(0, 100); CF.Save.save(); render(); } };
    const lt = main.querySelector('[data-letter]'); if (lt) lt.onclick = () => { tab = 'letter'; render(); };
    main.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); t.m = b.dataset.m; CF.Save.save(); main.querySelectorAll('.cg-mood').forEach((x) => x.classList.toggle('on', x === b)); respond(main.querySelector('.cg-resp'), t.m); }));
    main.querySelector('[data-addwin]').onclick = () => { const inp = main.querySelector('.cg-wininput'), v = inp.value.trim(); if (!v) return inp.focus(); c.wins.push({ d: today(), text: v.slice(0, 80) }); t.w = (t.w || 0) + 1; CF.Save.save(); CF.Audio.sfx('unlock'); render(); };
    if (t.m) respond(main.querySelector('.cg-resp'), t.m);
  }
  const ACTIONS = {
    fired: ['挑战下一关', () => { const n = CF.Emb && CF.Emb.next(); CF.modal.close(); CF.UI.show('labs'); if (CF.Emb) CF.Emb.open(n ? n.id : undefined); }],
    ok: ['做 3 道题（5 分钟）', () => { CF.modal.close(); CF.UI.show('academy'); setTimeout(() => CF.Academy.quiz({ domain: 'all', n: 3 }), 60); }],
    tired: ['只做 1 道题（2 分钟）', () => { CF.modal.close(); CF.UI.show('academy'); setTimeout(() => CF.Academy.quiz({ domain: 'all', n: 1 }), 60); }],
    anxious: ['做一分钟呼吸', () => { tab = 'breath'; render(); }],
    lost: ['看看我的星空', () => { tab = 'sky'; render(); }],
    stuck: ['让 AI 导师陪我过一下', () => { CF.modal.close(); if (CF.Assistant) CF.Assistant.open({ tab: 'chat', mode: 'tutor', fresh: true, prompt: '我在学习时卡住了：【写卡在哪一关、哪一步】。请先只给我提示，不要直接给答案。' }); }],
  };
  function respond(box, k) {
    const f = facts(), act = ACTIONS[k], ai = CF.AI && CF.AI.ready();
    box.innerHTML = `<div class="wc-card cg-card"><p class="cg-line">${esc(lineFor(k))}</p>${f.length ? `<p class="small">你真实做到的：${f.map(esc).join('、')}。</p>` : '<p class="small">你今天打开了这里——这就是第一步。</p>'}<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-act>${act[0]}</button>${ai ? '<button class="btn" data-ai>让 AI 教练说几句</button>' : ''}</div><div class="cg-ai"></div></div>`;
    box.querySelector('[data-act]').onclick = () => { CF.Audio.sfx('click'); act[1](); };
    const b = box.querySelector('[data-ai]');
    if (b) b.onclick = async () => {
      const out = box.querySelector('.cg-ai'); b.disabled = true; out.innerHTML = '<p class="small">AI 教练正在看你的进度……</p>';
      try { const txt = await CF.AI.ask(`我今天的心情是「${MOODS.find((x) => x.k === k).n}」。${day(today()).note || ''}请根据我真实的进度，用 3–5 句话鼓励我，最后给一个 10 分钟内能完成的具体行动。`, { modeId: 'coach' }); out.innerHTML = `<div class="ai-md">${CF.Assistant.md(txt).html}</div>`; }
      catch (err) { const e = err.friendly || CF.AINet.explain(err); out.innerHTML = `<p class="small">AI 教练暂时连不上：${esc(e.t)}。上面那句话也是真心的。</p>`; }
      b.disabled = false;
    };
  }
  function drawBanner(cv) {
    if (!cv) return; const w = Math.min(760, cv.parentNode.clientWidth || 600), h = 120, W = CF.WC, g = W.fit(cv, w, h); W.seed('banner' + today());
    W.nightSky(g, w, h, { dust: 120 });
    const p = G.moon(); W.moon(g, w - 70, 58, 34, Math.max(0.12, p), {});   // 一点进度都没有时也画一弯新月：起点也是月亮
    for (let i = 0; i < 9; i++) W.star(g, 30 + ((i * 97) % (w - 160)), 18 + ((i * 53) % 80), 3 + (i % 3), W.C.gamboge, { dark: true });
    W.text(g, `月亮圆了 ${Math.round(p * 100)}%`, 24, h - 22, { size: 18, color: W.C.moon });
  }

  // ---------- 我的星空 ----------
  function skyTab(main) {
    const ev = evidence(), f = facts();
    main.innerHTML = `<div class="cg-pg"><div class="codex-head"><b class="codex-t">我的星空</b><span class="codex-prog">月亮圆了 <b>${Math.round(G.moon() * 100)}</b><span>%</span></span></div>
      <p class="small">每一颗星都是你真实做到的一件事：同一条赛道通关的关会连成星座。点星星看是哪一件。</p>
      <div class="cg-skywrap"><canvas class="cg-sky"></canvas><div class="cg-tip hidden"></div></div>
      <h4 class="cg-h">你已经做到了</h4>${f.length ? `<ul class="cg-facts">${f.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small">还没有星星。去做第一件事吧：实验室的第一关只要几分钟。</p>'}
      <h4 class="cg-h">从零到专家，你在哪一段</h4><canvas class="cg-path"></canvas><p class="small muted">这是游戏里的进度，帮你看清方向；真实的水平要靠做项目来证明（实验室 · 进阶 X2-4「从零到专家」有完整路线）。</p></div>`;
    const cv = main.querySelector('.cg-sky'), w = Math.min(900, main.clientWidth - 30), h = Math.round(Math.min(420, Math.max(260, w * 0.55))), W = CF.WC, g = W.fit(cv, w, h);
    W.seed('sky'); W.nightSky(g, w, h, { dust: 220 }); W.moon(g, w - 70, 64, 40, Math.max(0.12, G.moon()));
    const stars = []; const R = W.rng(7);
    const place = (key) => { let hsh = 7; for (const ch of key) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0; return [30 + (hsh % 1000) / 1000 * (w - 160), 30 + ((hsh >>> 10) % 1000) / 1000 * (h - 60)]; };
    // 星座的位置按赛道顺序固定：横向五等分、上下交错，避开右上角的月亮，名字不会叠在一起
    const tracks = (CF.EmbData && CF.EmbData.TRACKS) || [], n = Math.max(1, tracks.length), rmax = Math.min(w / n * 0.42, h * 0.24);
    const anchor = (t) => { const k = Math.max(0, tracks.indexOf(t)); return [w * (0.5 + k) / n, h * (k % 2 ? 0.66 : 0.34)]; };
    ev.forEach((e) => {
      if (e.kind === 'track') {   // 一条赛道 = 一个星座：围着一个中心排开，按通关顺序连线
        const [cx, cy] = anchor(e.t), pts = e.lv.slice(0, 18).map((l, i) => { const a = i * 2.4 + R() * 0.4, r = rmax * (0.18 + 0.82 * i / 17); return [Math.max(12, Math.min(w - 12, cx + Math.cos(a) * r)), Math.max(12, Math.min(h - 26, cy + Math.sin(a) * r * 0.7)), l]; });
        if (pts.length > 1) W.ink(g, pts.map((p) => [p[0], p[1]]), { width: 0.8, color: W.hex(W.C.moon, 0.45), wobble: 0.4, passes: 1 });
        pts.forEach(([x, y, l]) => { W.star(g, x, y, 4, e.t.color && /^#/.test(e.t.color) ? e.t.color : W.C.gamboge, { dark: true }); stars.push({ x, y, t: `${e.t.icon} ${e.t.short} · ${l.id} ${l.name}` }); });
        const ly = Math.min(h - 8, cy + Math.max(...pts.map((p) => p[1] - cy), 0) + 18);
        W.text(g, e.t.robot + '座', cx, ly, { size: w < 500 ? 11 : 13, align: 'center', color: W.hex(W.C.moon, 0.85) });
      } else {
        const key = e.kind + ':' + (e.id || (e.w && e.w.text) || e.n), [x, y] = place(key), col = { lab: W.C.gamboge, quiz: W.C.cyan, ai: W.C.rose, win: W.C.peach }[e.kind];
        W.star(g, x, y, e.kind === 'quiz' ? 7 : 5, col, { dark: true });
        stars.push({ x, y, t: e.kind === 'lab' ? `实验完成：${(CF.Labs && CF.Labs.META && CF.Labs.META[e.id] ? CF.Labs.META[e.id].name : e.id)}` : e.kind === 'quiz' ? `学院答对 ${e.n} 题` : e.kind === 'ai' ? `AI 学徒：${CF.AICourse.name(e.id)}` : `小胜利（${e.w.d}）：${e.w.text}` });
      }
    });
    const tip = main.querySelector('.cg-tip');
    cv.onclick = (ev2) => { const r = cv.getBoundingClientRect(), x = ev2.clientX - r.left, y = ev2.clientY - r.top, s = stars.map((st) => [Math.hypot(st.x - x, st.y - y), st]).sort((a, b) => a[0] - b[0])[0]; if (!s || s[0] > 22) return tip.classList.add('hidden'); tip.textContent = s[1].t; tip.style.left = Math.min(w - 220, Math.max(0, s[1].x - 20)) + 'px'; tip.style.top = s[1].y + 14 + 'px'; tip.classList.remove('hidden'); CF.Audio.sfx('click'); };
    drawPath(main.querySelector('.cg-path'), Math.min(900, main.clientWidth - 30));
  }
  function drawPath(cv, w) {
    const h = 150, W = CF.WC, g = W.fit(cv, w, h); W.seed('path'); W.paper(g, w, h, { vignette: false });
    const steps = ['补基础', '能动手', '做项目', '专一个方向', '创业 / 带团队'], p = G.moon(), xs = steps.map((_, i) => 40 + (i * (w - 80)) / (steps.length - 1)), y = 70;
    W.band(g, 20, y - 10, w - 40, 20, W.C.ochre, { layers: 10, alpha: 0.05 });
    W.ink(g, xs.map((x, i) => [x, y + Math.sin(i * 1.7) * 6]), { width: 2, color: W.C.inkSoft });
    steps.forEach((s, i) => { W.blob(g, xs[i], y, 13, i <= Math.floor(p * 4.999) ? W.C.sap : W.C.paper2, { layers: 10, alpha: 0.08 }); W.inkCircle(g, xs[i], y, 12, { width: 1.2 }); W.text(g, s, xs[i], y + 40, { size: 14, align: 'center' }); });
    const mx = 40 + p * (w - 80); W.star(g, mx, y - 26, 9, W.C.carmine); W.text(g, '你在这里', mx, y - 42, { size: 12, align: 'center', color: W.C.carmine });
  }

  // ---------- 他们也失败过 ----------
  function storyTab(main) {
    const mods = CF.Mods ? CF.Mods.cheer().stories : [];
    main.innerHTML = `<div class="cg-pg"><div class="codex-head"><b class="codex-t">他们也失败过</b><span class="codex-prog"><b>${STORIES.length + mods.length}</b><span> 个真实故事</span></span></div>
      <p class="small">这里只写公开报道过的事实，写明年份和出处，细节以原始出处为准。他们不是天生就成功的，而是失败以后没有停下。</p>
      <div class="cg-stories">${STORIES.concat(mods).map((s, i) => `<div class="cg-story"><canvas data-i="${i}"></canvas><div><small>${esc(s.who)} · ${esc(s.year)}</small><h4>${esc(s.title)}</h4><p>${esc(s.text)}</p><p class="cg-lesson">和你有什么关系：${esc(s.lesson)}</p><small class="cg-src">出处：${esc(s.source)}${s.mod ? ` · 来自模组「${esc(s.mod)}」，未经官方核实` : ''}</small></div></div>`).join('')}</div></div>`;
    main.querySelectorAll('.cg-story canvas').forEach((cv) => { const s = STORIES.concat(mods)[+cv.dataset.i], W = CF.WC, g = W.fit(cv, 96, 96); W.seed('story' + cv.dataset.i); W.paper(g, 96, 96, { vignette: false }); W.blob(g, 48, 50, 30, s.c || W.C.cyan); W.splatter(g, 60, 34, 14, s.c || W.C.cyan, 8); W.text(g, s.icon || '✦', 48, 62, { size: 30, align: 'center', jitter: false }); });
  }

  // ---------- 给未来的信 ----------
  function letterTab(main) {
    const c = S(), now = today();
    main.innerHTML = `<div class="cg-pg"><div class="codex-head"><b class="codex-t">给未来的信</b><span class="codex-prog"><b>${c.letters.length}</b><span> 封</span></span></div>
      <p class="small">写给几天或几个月以后的自己：现在的处境、想变成什么样、想对那时的自己说什么。封好以后，到日子才能拆。</p>
      <div class="wc-card"><textarea class="cg-letter" rows="5" maxlength="1200" placeholder="亲爱的未来的我：……"></textarea><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="small">多久以后拆：</span>${[[7, '一周'], [30, '一个月'], [90, '三个月'], [180, '半年']].map(([d, n], i) => `<label class="cg-r"><input type="radio" name="cgd" value="${d}" ${i === 1 ? 'checked' : ''}> ${n}</label>`).join('')}<button class="btn primary" data-seal style="margin-left:auto">封好</button></div></div>
      <div class="cg-letters">${c.letters.slice().reverse().map((l) => { const can = l.open <= now; return `<div class="cg-env ${l.opened ? 'open' : can ? 'ready' : ''}" data-id="${l.id}"><canvas></canvas><div><b>${l.opened ? '已拆开' : can ? '可以拆了' : '还在路上'}</b><small>写于 ${l.created} · ${l.opened ? '拆于 ' + l.opened : '拆信日 ' + l.open}</small>${l.opened ? `<p>${esc(l.text).replace(/\n/g, '<br>')}</p>` : can ? '<button class="btn sm primary" data-open>拆信</button>' : `<p class="small">还有 ${Math.max(1, CF.dayDiff(now, l.open))} 天</p>`}</div></div>`; }).join('')}</div></div>`;
    main.querySelector('[data-seal]').onclick = () => { const t = main.querySelector('.cg-letter').value.trim(); if (t.length < 4) return CF.toast('多写几句吧', 'bad'); const dd = +main.querySelector('input[name=cgd]:checked').value; c.letters.push({ id: 'L' + Date.now(), text: t, created: now, open: shift(dd), opened: '' }); CF.Save.save(); CF.Audio.sfx('unlock'); CF.toast(`信封好了：${shift(dd)} 再来拆`, 'gold', 2500); render(); };
    main.querySelectorAll('.cg-env').forEach((el) => { const l = c.letters.find((x) => x.id === el.dataset.id), W = CF.WC, g = W.fit(el.querySelector('canvas'), 84, 60); W.seed(l.id); W.paper(g, 84, 60, { vignette: false }); W.band(g, 6, 10, 72, 42, l.opened ? W.C.paper2 : W.C.peach, { layers: 10 }); W.inkRect(g, 6, 10, 72, 42, { width: 1 }); W.inkLine(g, 6, 10, 42, 34, { width: 1 }); W.inkLine(g, 78, 10, 42, 34, { width: 1 }); if (!l.opened) W.blob(g, 42, 34, 6, W.C.carmine, { layers: 8, alpha: 0.12 }); const b = el.querySelector('[data-open]'); if (b) b.onclick = () => { l.opened = now; CF.Save.save(); CF.Audio.sfx('unlock'); render(); }; });
  }

  // ---------- 一分钟方块呼吸（吸 4 秒 · 停 4 秒 · 呼 4 秒 · 停 4 秒，做 4 轮） ----------
  function breathTab(main) {
    main.innerHTML = `<div class="cg-pg cg-breath"><div class="codex-head"><b class="codex-t">一分钟呼吸</b></div><p class="small">方块呼吸：吸气 4 秒、屏住 4 秒、呼气 4 秒、屏住 4 秒，做 4 轮，大约一分钟。紧张、焦虑、学不进去的时候先做一遍。</p><canvas class="cg-bcv"></canvas><p class="cg-cue">准备好了就点开始</p><div class="row" style="justify-content:center;gap:8px"><button class="btn primary" data-go>开始</button></div></div>`;
    const cv = main.querySelector('.cg-bcv'), sz = Math.min(320, main.clientWidth - 40), W = CF.WC, g = W.fit(cv, sz, sz), cue = main.querySelector('.cg-cue');
    const bg = document.createElement('canvas'); const gb = W.fit(bg, sz, sz); W.seed('breath'); W.paper(gb, sz, sz);
    const drawAt = (k, label) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(bg, 0, 0); const d = Math.min(2, devicePixelRatio || 1); g.setTransform(d, 0, 0, d, 0, 0); g.save(); g.globalAlpha = 0.35 + 0.4 * k; g.fillStyle = W.C.cyan; g.beginPath(); g.arc(sz / 2, sz / 2, sz * (0.16 + 0.24 * k), 0, 7); g.fill(); g.globalAlpha = 0.25; g.fillStyle = W.C.ultramarine; g.beginPath(); g.arc(sz / 2, sz / 2, sz * (0.12 + 0.2 * k), 0, 7); g.fill(); g.restore(); W.text(g, label, sz / 2, sz / 2 + 8, { size: 22, align: 'center', jitter: false }); };
    drawAt(0.2, '');
    main.querySelector('[data-go]').onclick = (e) => {
      e.target.disabled = true; const t0 = performance.now(), PH = [['吸气', 1], ['屏住', 0], ['呼气', -1], ['屏住', 0]];
      const tick = (now) => {
        if (!root || tab !== 'breath') return; const s = Math.max(0, (now - t0) / 1000), round = Math.floor(s / 16);   // 第一帧的时间戳可能比点击早一点
        if (round >= 4) { cue.textContent = '做完了。感觉慢下来一点了吗？回到「今天」做最小的一步吧。'; drawAt(0.2, '✓'); e.target.disabled = false; CF.Audio.sfx('unlock'); return; }
        const ph = Math.floor((s % 16) / 4), f = (s % 4) / 4, [n, dir] = PH[ph], k = dir > 0 ? f : dir < 0 ? 1 - f : ph === 1 ? 1 : 0;
        cue.textContent = `第 ${round + 1} / 4 轮 · ${n} ${4 - Math.floor(s % 4)}`; drawAt(k, n); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
  }
})();
