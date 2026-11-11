/* 实验室 ·「AI 学徒：学会用大模型」（v9.6）——手绘水彩画风的互动课，7 关，边玩边学。
 * 为什么有这门课：主创要用 AI 助手（自己接 API、让 AI 写代码、做模组），但零基础不知道大模型、Token、API、Key、提示词是什么，
 * 也不知道 AI 会编造、哪些东西不能发给 AI。这些是「补充你遗漏的」。
 * 由浅入深（点 → 线 → 面 → 体，关卡难度宪法 14.2）：
 *   1 接龙机（点）：大模型是「猜下一个词」+ 温度；
 *   2 上下文背包（线）：Token、上下文窗口、忘事、压缩摘要；
 *   3 寄一封信给 AI（线）：API、Key、模型名、请求和回复、状态码、收费；接了接口可以真的寄一封；
 *   4 好提示词（面）：角色 / 任务 / 背景 / 格式 / 例子；
 *   5 AI 也会编（面）：幻觉、核实、隐私；
 *   6 让 AI 帮你写代码（面）：运行、观察、找 bug、描述 bug；代码在隔离沙盒里真的跑；
 *   7 做你的第一个模组（体）：按模板做一个知识包、校验、安装，题目进学院题库——以后就能让 AI 一直给游戏加内容。
 * 每关：知识卡（每张一幅水彩小画）→ 玩 → 结算星级（零失误 3 星，失误 ≤ 2 次 2 星，其余 1 星）。顺序解锁，体验模式全开。 */
(function () {
  const CF = window.CF;
  const C = (CF.AICourse = {});
  const esc = (s) => CF.esc(String(s == null ? '' : s));
  const sv = () => { const d = CF.Save.data; d.aiCourse = d.aiCourse || { lv: {} }; return d.aiCourse; };
  const W = () => CF.WC;

  // ---------- 小画：每张知识卡一幅 ----------
  const PICS = {
    chain: (g, w, h) => { const ws = ['下班', '回到', '家', '我', '第一件事', '是', '？']; ws.forEach((t, i) => { const x = 30 + i * ((w - 60) / ws.length); W().blob(g, x + 18, h / 2, 20, i === ws.length - 1 ? W().C.gamboge : W().C.cyan, { layers: 10 }); W().text(g, t, x + 18, h / 2 + 6, { size: 13, align: 'center' }); if (i) W().arrow(g, x - 6, h / 2, x + 0, h / 2, { width: 1, head: 5 }); }); },
    temp: (g, w, h) => { [[0.25, W().C.ultramarine, '低温：稳'], [0.75, W().C.carmine, '高温：花']].forEach(([fx, c, t]) => { const cx = w * fx; [0.9, 0.3, 0.15, 0.08].forEach((p, i) => W().band(g, cx - 60 + i * 30, h - 20 - p * (h - 50), 22, p * (h - 50), c, { layers: 10, alpha: 0.09 })); W().text(g, t, cx, 22, { size: 14, align: 'center' }); }); },
    bag: (g, w, h) => { W().wash(g, [[w / 2 - 70, 30], [w / 2 + 70, 30], [w / 2 + 85, h - 14], [w / 2 - 85, h - 14]], W().C.ochre, { layers: 14 }); W().inkRect(g, w / 2 - 70, 30, 140, h - 44, { width: 1.4 }); for (let i = 0; i < 6; i++) W().band(g, w / 2 - 60 + (i % 3) * 42, 40 + Math.floor(i / 3) * 34, 36, 26, [W().C.cyan, W().C.sap, W().C.rose][i % 3], { layers: 8 }); W().blob(g, w / 2 + 120, h - 30, 14, W().C.inkSoft, { layers: 8 }); W().text(g, '掉出去了', w / 2 + 120, h - 8, { size: 12, align: 'center' }); },
    letter: (g, w, h) => { const x = w / 2 - 90, y = 26; W().band(g, x, y, 180, h - 46, W().C.peach, { layers: 12 }); W().inkRect(g, x, y, 180, h - 46, { width: 1.3 }); W().inkLine(g, x, y, x + 90, y + (h - 46) / 2); W().inkLine(g, x + 180, y, x + 90, y + (h - 46) / 2); W().band(g, x + 140, y + 8, 30, 24, W().C.carmine, { layers: 8 }); W().text(g, 'Key', x + 155, y + 25, { size: 11, align: 'center', color: W().C.white }); W().text(g, '地址 · 模型 · 内容', w / 2, h - 30, { size: 13, align: 'center' }); },
    prompt: (g, w, h) => { ['角色', '任务', '背景', '格式', '例子'].forEach((t, i) => { const x = 24 + i * ((w - 48) / 5); W().blob(g, x + 26, h / 2, 26, [W().C.ultramarine, W().C.carmine, W().C.sap, W().C.gamboge, W().C.violet][i], { layers: 10 }); W().text(g, t, x + 26, h / 2 + 6, { size: 14, align: 'center' }); }); },
    fake: (g, w, h) => { W().band(g, 30, 22, w - 60, h - 40, W().C.white, { layers: 6, edge: false }); W().inkRect(g, 30, 22, w - 60, h - 40, { width: 1 }); for (let i = 0; i < 4; i++) W().inkLine(g, 46, 42 + i * 18, w - 60 - (i % 2) * 60, 42 + i * 18, { width: 0.8, color: W().C.inkSoft }); W().blob(g, w - 70, h - 40, 18, W().C.carmine, { layers: 10 }); W().text(g, '?', w - 70, h - 33, { size: 20, align: 'center', color: W().C.white }); },
    code: (g, w, h) => { W().band(g, 26, 20, w - 52, h - 36, W().C.night, { layers: 10, blend: 'source-over' }); ['let n = 0;', 'n = n + "1";', 'show(n);'].forEach((t, i) => W().text(g, t, 44, 48 + i * 22, { size: 13, color: i === 1 ? W().C.peach : W().C.moon, font: 'monospace', jitter: false })); W().inkCircle(g, w - 60, 70, 18, { color: W().C.carmine }); },
    mod: (g, w, h) => { W().blob(g, w / 2 - 50, h / 2, 34, W().C.teal); W().blob(g, w / 2 + 40, h / 2 - 8, 26, W().C.gamboge); W().blob(g, w / 2 + 6, h / 2 + 26, 20, W().C.rose); W().text(g, '🧩', w / 2, h / 2 + 10, { size: 30, align: 'center', jitter: false }); },
  };
  const pic = (cv, key, seed) => { if (!cv || !PICS[key]) return; const w = Math.min(560, (cv.parentNode && cv.parentNode.clientWidth) || 520) - 4, h = 140, g = W().fit(cv, w, h); W().seed(seed || key); W().paper(g, w, h, { vignette: false }); PICS[key](g, w, h); };

  // ================= 七关 =================
  const LV = [
    { id: 'ai1', name: '接龙机：大模型怎么说话', lv: '点', learn: [
      ['大模型就是一台「接龙机」', '你给它一段话，它算出「下一个词」最可能是什么，写上去；再把整段话连同新词一起看，接着猜下一个……一个词一个词地接，就写出了整段回答。它读过海量的文字，所以猜得很准。', '就像你看到「床前明月」，脑子里自动冒出「光」。', 'chain'],
      ['温度：要稳，还是要有创意', '每次接龙时，候选词各有一个概率。「温度」低，它几乎总挑概率最大的那个，回答稳定、重复；温度高，概率小的词也有机会被挑中，回答更有创意，但也更容易胡说。', '低温度像背课文，高温度像即兴发挥。', 'temp'],
    ], game: 'temp' },
    { id: 'ai2', name: '上下文背包：它为什么会忘事', lv: '线', learn: [
      ['Token：模型读写的最小单位', '模型不是一个字一个字读的，而是把文字切成一个个 Token。中文大约一两个字一个 Token，英文大约四个字母一个。收费、长度限制，都按 Token 算。', '像把一句话切成一块块积木。', 'chain'],
      ['上下文窗口 = 背包的大小', '每次回答，模型只能看到「背包」里装得下的内容：系统提示、你们的聊天记录、附件。聊得太长，最早的内容就装不下了，它就「忘」了。背包越大的模型越贵。', '背包满了，最先放进去的东西会被挤出来。', 'bag'],
      ['三种办法', '① 把前面的聊天压缩成一段摘要放回背包；② 把重要的事写进「记忆本」，需要时再拿出来；③ 换一个背包更大的模型。什么都不做，它就真的忘了。', '', 'bag'],
    ], game: 'bag' },
    { id: 'ai3', name: '寄一封信给 AI：API 是什么', lv: '线', learn: [
      ['API = 点菜窗口', '你的程序按规定格式写好「请求」，发到平台的地址；平台的模型算完，把「回复」发回来。这套约定就叫 API（应用程序接口）。AI 助手、你以后自己写的程序，都是这样和模型说话的。', '餐厅的点菜窗口：菜单格式固定，厨房在里面。', 'letter'],
      ['一封信要写清四件事', '寄到哪（接口地址）、谁付钱（API Key，像邮票，也像会员卡号）、给谁看（模型名）、写了什么（消息内容）。Key 一旦泄露，别人就能花你的钱：只放在自己的设备上，不发给任何人。', '邮票被人拿走，就能用你的钱寄信。', 'letter'],
      ['回信上的数字', '200 = 成功；401 = Key 不对；404 = 地址或模型名写错；429 = 太频繁或额度用完；500 多 = 平台出错。看懂这几个数字，大部分问题自己就能查。', '', 'letter'],
    ], game: 'letter' },
    { id: 'ai4', name: '好提示词：把话说清楚', lv: '面', learn: [
      ['AI 不知道你没说的', '你脑子里的背景（你是谁、为什么问、要什么样的结果），AI 都不知道。说得越清楚，它答得越准。', '找人帮忙，先把情况讲清楚。', 'prompt'],
      ['五个要素', '角色（你扮演谁）、任务（要做什么）、背景（我的情况、限制）、格式（列表 / 表格 / 字数）、例子（给一个你想要的样子）。不是每次都要五样齐全，但缺得越多，结果越随机。', '', 'prompt'],
    ], game: 'prompt' },
    { id: 'ai5', name: 'AI 也会编：核实与隐私', lv: '面', learn: [
      ['幻觉：说得很像真的，但是错的', '模型是「接龙」出来的，没有内置的「查证」步骤，所以有时会编出不存在的书、论文、链接、数字和名言，而且语气很肯定。这叫幻觉。', '一个口才很好、但有时会记错的朋友。', 'fake'],
      ['怎么防', '重要的事去权威来源核实；让它给出处，再自己点开看；同一个问题换个问法或换个模型对比；数字和法规以官方最新为准。', '', 'fake'],
      ['什么不能发给 AI', '身份证号、银行卡、密码、API Key、公司没公开的资料、别人的隐私。发出去的内容会到 AI 平台的服务器上。', '', 'fake'],
    ], game: 'fake' },
    { id: 'ai6', name: '让 AI 帮你写代码', lv: '面', learn: [
      ['AI 写的代码也要跑一跑', 'AI 写代码很快，但不保证对。正确的用法是：让它写 → 自己运行 → 看结果对不对 → 不对就把「我期望什么、实际看到什么」告诉它。', '学徒做完的活，师傅要验收。', 'code'],
      ['一个经典 bug：数字和文字', '在 JavaScript 里，1 + 1 = 2，但 "1" + "1" = "11"：带引号的是文字，加号会把两段文字拼起来。这种 bug 不报错，只会让结果奇怪，最容易漏掉。', '', 'code'],
    ], game: 'code' },
    { id: 'ai7', name: '做你的第一个模组', lv: '体', learn: [
      ['模组：给游戏加内容的「插件」', '扩展工坊里有写好的模板。照着模板写一个 JSON（一种用花括号和引号写数据的格式），游戏检查没问题就能装上。知识包里的题目会直接进学院题库。', '照着表格填空。', 'mod'],
      ['以后让 AI 来写', '接好 API 以后，把「我想要什么」告诉 AI 助手的「模组工匠」，它按同一个模板写，你检查、安装。题目、课程、小游戏、新功能，都能这样一点点加进游戏。', '', 'mod'],
    ], game: 'mod' },
  ];
  C.LEVELS = LV;
  C.done = () => LV.filter((l) => sv().lv[l.id]).map((l) => l.id);
  C.ratio = () => C.done().length / LV.length;
  C.progress = () => C.done().length + '/' + LV.length;
  C.name = (id) => (LV.find((l) => l.id === id) || {}).name || id;
  const isOpen = (i) => CF.P.trial() || i === 0 || !!sv().lv[LV[i - 1].id];

  // ================= 页面 =================
  let root = null, cur = null;
  C.open = function (id) {
    root = CF.h('<div class="ac wc-paper"></div>');
    CF.modal.open({ title: '🪄 实验室 · AI 学徒：学会用大模型', body: root, wide: true, onClose: () => { root = null; cur = null; } });
    CF.$('#modalCard').classList.add('cg-full');
    if (id) return C.play(id);
    home();
  };
  function home() {
    cur = null; if (!root) return;
    root.innerHTML = `<div class="ac-pg"><div class="codex-head"><b class="codex-t">AI 学徒</b><span class="codex-prog">已通关 <b>${C.done().length}</b><span>/${LV.length}</span></span><button class="btn sm ghost" data-i>ⓘ 这门课</button></div>
      <canvas class="ac-map"></canvas><div class="ac-lvs">${LV.map((l, i) => { const st = sv().lv[l.id] || 0, op = isOpen(i); return `<button class="ac-lv ${op ? '' : 'lock'} ${st ? 'done' : ''}" data-go="${l.id}"><span class="emb-lvl lv-${l.lv}">${l.lv}</span><b>${i + 1}. ${esc(l.name)}</b><small>${op ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒 先通关上一关'}</small></button>`; }).join('')}</div>
      <p class="small">学完这门课，再去用右边的 ✦ AI 助手：你会知道它为什么这样回答、怎么问更好、哪些话要核实、Key 怎么保管。</p></div>`;
    drawMap(root.querySelector('.ac-map'));
    root.querySelector('[data-i]').onclick = () => CF.modal.open({ title: 'ⓘ AI 学徒', body: CF.h(`<div class="t-body">大模型、Token、API、Key、提示词、幻觉、隐私——用 AI 助手之前，这些是必须先懂的。7 关由浅入深（点 → 线 → 面 → 体），每关先看几张水彩知识卡，再玩一个小游戏。<br><br>第 3 关如果你已经接好了 API，可以真的给 AI 寄一封信；第 7 关会做出你的第一个模组，题目会进学院题库。<br><br>关卡按顺序解锁；零失误 3 星。</div>`) });
    root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); C.play(b.dataset.go); }));
  }
  function drawMap(cv) {
    const w = Math.min(860, root.clientWidth - 30), h = 150, g = W().fit(cv, w, h); W().seed('acmap'); W().paper(g, w, h, { vignette: false });
    const pts = LV.map((_, i) => [40 + (i * (w - 80)) / (LV.length - 1), h / 2 + Math.sin(i * 1.3) * 30]);
    W().ink(g, pts, { width: 2.2, color: W().C.inkSoft });
    pts.forEach(([x, y], i) => { const done = !!sv().lv[LV[i].id]; W().blob(g, x, y, 16, done ? W().C.sap : isOpen(i) ? W().C.gamboge : W().C.paper2, { layers: 10 }); W().inkCircle(g, x, y, 15, { width: 1.2 }); W().text(g, String(i + 1), x, y + 6, { size: 16, align: 'center', jitter: false }); });
    W().cloud(g, w * 0.82, 26, 30, W().C.white); W().star(g, w - 30, 30, 8, W().C.gamboge);
  }
  C.play = function (id) {
    const i = LV.findIndex((l) => l.id === id); if (i < 0) return;
    if (!root) return C.open(id);
    if (!isOpen(i)) { CF.Audio.sfx('error'); CF.toast('先通关上一关', 'bad'); return; }
    cur = { lv: LV[i], i, card: 0, mis: 0 };
    root.innerHTML = `<div class="ac-play"><div class="emb-pbar"><button class="btn sm ghost" data-back>← 返回</button><span class="emb-lvl lv-${cur.lv.lv}">${cur.lv.lv}</span><b class="emb-pt">${i + 1}. ${esc(cur.lv.name)}</b><span class="ac-mis">失误 <b>0</b></span></div><div class="ac-body"></div><div class="ac-foot"><div class="ac-msg"></div><div class="ac-act"></div></div></div>`;
    root.querySelector('[data-back]').onclick = () => { CF.Audio.sfx('click'); home(); };
    learn();
  };
  const body = () => root.querySelector('.ac-body');
  function msg(t, k) { const m = root.querySelector('.ac-msg'); m.innerHTML = t || ''; m.className = 'ac-msg' + (k ? ' ' + k : ''); }
  function act(list) { const a = root.querySelector('.ac-act'); a.innerHTML = ''; list.forEach(([t, fn, cls]) => { const b = CF.h(`<button class="btn ${cls || ''}">${t}</button>`); b.onclick = () => { CF.Audio.sfx('click'); fn(b); }; a.appendChild(b); }); }
  function mis() { cur.mis++; root.querySelector('.ac-mis b').textContent = cur.mis; CF.Audio.sfx('error'); }
  function learn() {
    const L = cur.lv.learn, c = L[cur.card];
    body().innerHTML = `<div class="wc-cards"><div class="wc-card"><small>知识卡 ${cur.card + 1} / ${L.length}</small><canvas class="ac-pic"></canvas><h4>${c[0]}</h4><p>${c[1]}</p>${c[2] ? `<p class="wc-ana">打个比方：${c[2]}</p>` : ''}</div></div>`;
    pic(body().querySelector('.ac-pic'), c[3], cur.lv.id + cur.card);
    msg(cur.card === L.length - 1 ? '下一步：动手玩一玩。' : '');
    act([].concat(cur.card ? [['上一张', () => { cur.card--; learn(); }, 'ghost']] : []).concat([[cur.card < L.length - 1 ? '下一张' : '开始 →', () => { if (cur.card < L.length - 1) { cur.card++; learn(); } else GAMES[cur.lv.game](); }, 'primary']]));
  }
  function finish(extra) {
    const lv = cur.lv, stars = cur.mis === 0 ? 3 : cur.mis <= 2 ? 2 : 1, prev = sv().lv[lv.id] || 0;
    if (stars > prev) sv().lv[lv.id] = stars;
    const got = [], t0 = CF.toast; CF.toast = (m) => got.push(m);   // 奖励写进结算卡，不用浮动提示盖住（UI 宪法 26 章「不遮挡」）
    try {
      if (!prev) CF.P.addXP({ type: cur.i >= 5 ? 'p' : 'k', amt: 10 + cur.i * 3 + stars * 3, dims: { zhi: 0.6 }, domain: 'ai', label: 'AI 学徒 ' + (cur.i + 1) });
      else if (stars > prev) CF.P.addXP({ type: 'k', amt: (stars - prev) * 3, dims: { zhi: 0.4 }, domain: 'ai', label: 'AI 学徒 ' + (cur.i + 1) });
      if (!prev && C.done().length === LV.length) { CF.P.finishLab('aicourse', Math.max(1, Math.round(LV.reduce((a, l) => a + (sv().lv[l.id] || 0), 0) / LV.length))); got.unshift('AI 学徒全部通关！去用右边的 ✦ AI 助手吧'); }
    } finally { CF.toast = t0; }
    CF.Save.save();
    const nx = LV[cur.i + 1];
    body().innerHTML = `<div class="ac-result"><div class="emb-rstars">${'<i class="on">★</i>'.repeat(stars)}${'<i>★</i>'.repeat(3 - stars)}</div><h3>${cur.i + 1}. ${esc(lv.name)} · 通关</h3><p class="small">失误 ${cur.mis} 次${prev && stars <= prev ? ` · 最好成绩 ${prev} 星` : ''}</p>${got.length ? `<div class="emb-gain">${got.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}<div class="wc-card"><b>这一关你学会了</b>${lv.learn.map((c) => `<p>· ${c[0]}</p>`).join('')}${extra || ''}</div></div>`;
    msg(stars === 3 ? '完美通关！' : '通关了！想拿 3 星可以再来一次。', 'good');
    act([['再来一次', () => C.play(lv.id), 'ghost'], ['返回', home, 'ghost']].concat(nx ? [[`下一关 →`, () => C.play(nx.id), 'primary']] : []));
  }

  // ================= 玩法 =================
  const GAMES = {};
  // 1 温度：调滑块，看概率柱怎么变；两轮目标
  GAMES.temp = function () {
    const words = [['洗澡', 3], ['吃饭', 2], ['躺下', 1.5], ['学习', 1], ['打游戏', 0.8], ['跳舞', -1]], R = W().rng(5);
    let T = 1, round = 0, picks = [];
    const probs = () => { const e = words.map(([, l]) => Math.exp(l / T)), s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };
    const goals = [['让它每次都说一样的：最可能的词概率 ≥ 90%', (p) => p[0] >= 0.9], ['让它更有创意：最可能的词 ≤ 40%，而且「跳舞」≥ 5%', (p) => p[0] <= 0.4 && p[5] >= 0.05]];
    body().innerHTML = `<div class="ac-game"><div class="ac-round"></div><p class="ac-sent">下班回到家，我第一件事是 <b class="ac-blank">___</b></p><canvas class="ac-bars"></canvas><label class="ac-slider">温度 <b class="ac-t">1.0</b><input type="range" min="0.1" max="3" step="0.1" value="1"></label><div class="ac-picks"></div></div>`;
    const cv = body().querySelector('.ac-bars'), w = Math.min(560, body().clientWidth - 30), h = 200;
    const draw = () => {
      const p = probs(), g = W().fit(cv, w, h); W().seed('bars'); W().paper(g, w, h, { vignette: false });
      words.forEach(([t], i) => { const bw = (w - 40) / words.length, x = 20 + i * bw, bh = p[i] * (h - 60); W().band(g, x + 6, h - 30 - bh, bw - 12, Math.max(2, bh), i === 0 ? W().C.ultramarine : i === 5 ? W().C.carmine : W().C.teal, { layers: 10, alpha: 0.09 }); W().text(g, t, x + bw / 2, h - 10, { size: 13, align: 'center' }); W().text(g, Math.round(p[i] * 100) + '%', x + bw / 2, h - 36 - bh, { size: 12, align: 'center', color: W().C.inkSoft, jitter: false }); });
      body().querySelector('.ac-t').textContent = T.toFixed(1);
      body().querySelector('.ac-round').innerHTML = `<b>第 ${round + 1} / 2 轮</b>${goals[round][0]}`;
    };
    const sample = () => { const p = probs(); let r = R(), i = 0; while (i < p.length - 1 && (r -= p[i]) > 0) i++; return words[i][0]; };
    body().querySelector('input').oninput = (e) => { T = +e.target.value; draw(); };
    const pk = body().querySelector('.ac-picks');
    act([['抽 5 次看看', () => { picks = Array.from({ length: 5 }, sample); pk.innerHTML = picks.map((x) => `<span>${esc(x)}</span>`).join(''); body().querySelector('.ac-blank').textContent = picks[0]; }, 'ghost'], ['检查', () => {
      const p = probs();
      if (!goals[round][1](p)) { mis(); return msg(round === 0 ? '✗ 还不够稳：温度再低一点，最大的那根柱子会越来越高。' : '✗ 还不够「花」：温度再高一点，小概率的词才有机会。', 'bad'); }
      CF.Audio.sfx('correct');
      if (round === 0) { round = 1; msg('✓ 低温度：几乎每次都选「洗澡」。写代码、算数、查事实时用低温度。下一轮：试试高温度。', 'good'); return draw(); }
      finish('<p class="small">温度高 = 更有创意，也更容易胡说；写代码、做题用低温度，写诗、头脑风暴用高温度。有的新模型不让你调温度，而是自己决定。</p>');
    }, 'primary']]);
    msg('拖动「温度」滑块，看概率柱怎么变；可以点「抽 5 次」试试。'); draw();
  };
  // 2 上下文背包：一句句加进背包，满了最早的掉出去；问「猫叫什么」，选办法
  GAMES.bag = function () {
    const CAP = 22, MSGS = [['我叫小林', 4], ['我在深圳上班', 5], ['我养了一只猫叫团子', 6], ['今天地铁好挤', 5], ['晚饭吃了一碗面', 5], ['明天要早起开会', 5]];
    let inBag = [], out = [], step = 0, phase = 'fill';
    body().innerHTML = `<div class="ac-game"><p class="small">背包能装 <b>${CAP}</b> 个 Token。点「下一句」把聊天一句句放进去。</p><div class="ac-bagw"><div class="ac-bag"></div><div class="ac-out"><small>掉出去的（模型看不到了）</small><div></div></div></div><div class="ac-q"></div></div>`;
    const paint = () => {
      const used = inBag.reduce((a, m) => a + m[1], 0);
      body().querySelector('.ac-bag').innerHTML = `<small>背包 ${used} / ${CAP}</small>` + inBag.map((m) => `<span class="ac-tok" style="--n:${m[1]}">${esc(m[0])}<i>${m[1]}</i></span>`).join('');
      body().querySelector('.ac-out div').innerHTML = out.map((m) => `<span class="ac-tok gone">${esc(m[0])}</span>`).join('');
    };
    const add = (m) => { inBag.push(m); while (inBag.reduce((a, x) => a + x[1], 0) > CAP) out.push(inBag.shift()); };
    const ask = () => {
      phase = 'ask';
      body().querySelector('.ac-q').innerHTML = `<div class="wc-card"><p><b>你：</b>我的猫叫什么？</p><p><b>AI：</b>抱歉，我不知道你的猫叫什么名字。</p><p class="small">「我养了一只猫叫团子」已经掉出背包了。怎么办？</p><div class="ac-opts">${[['sum', '把前面的聊天压缩成一句摘要，放回背包'], ['mem', '把「猫叫团子」记进长期记忆本，需要时拿出来'], ['big', '换一个背包更大（上下文窗口更长）的模型'], ['none', '什么都不做，它总会想起来的']].map(([k, t]) => `<button class="ac-opt" data-k="${k}">${t}</button>`).join('')}</div></div>`;
      body().querySelectorAll('.ac-opt').forEach((b) => (b.onclick = () => {
        if (b.dataset.k === 'none') { mis(); b.classList.add('bad'); return msg('✗ 掉出去的内容模型根本看不到，不会自己想起来。', 'bad'); }
        if (b.dataset.k === 'sum') { out = []; inBag = [['摘要：小林，深圳上班，猫叫团子', 6]].concat(inBag.slice(-3)); paint(); }
        b.classList.add('good'); CF.Audio.sfx('correct');
        msg({ sum: '✓ 压缩摘要：旧聊天变成一句话，省下空间。AI 助手里很长的对话，平台也会用类似的办法。', mem: '✓ 长期记忆：重要的事单独记下来，问到时再放进背包。', big: '✓ 换大背包也行，但更贵、更慢；聊得足够长，大背包也会满。' }[b.dataset.k] + ' 现在它能答出「团子」了。', 'good');
        act([['完成 →', () => finish('<p class="small">在 AI 助手里：一个话题聊完就开「新对话」；很长的资料只发要用的部分；附件和图片也占背包。</p>'), 'primary']]);
      }));
    };
    act([['下一句', (b) => { if (phase !== 'fill') return; add(MSGS[step++]); paint(); if (step === MSGS.length) { b.disabled = true; msg('背包满了，最早的几句掉了出去。现在问它一个问题……'); setTimeout(ask, 400); } }, 'primary']]);
    msg('一句一句放进背包，注意看什么时候开始掉东西。'); paint();
  };
  // 3 寄信：把四样东西放到信封上对的位置（有陷阱）；然后看真实的请求；接了接口可以真的寄
  GAMES.letter = function () {
    const SLOTS = [['addr', '寄到哪'], ['stamp', '谁付钱'], ['to', '给谁看'], ['body', '写了什么']];
    const CARDS = [['addr', 'https://api.anthropic.com/v1/messages'], ['stamp', 'API Key（sk-ant-……）'], ['to', '模型名：claude-opus-5-5'], ['body', '消息：「用一句话介绍你自己」'], ['trap', '把 Key 写在消息正文里一起发'], ['trap2', '你的身份证号']];
    const placed = {}; let sel = null;
    const why = { trap: 'Key 只放在「谁付钱」那一栏（请求头）里；写进正文，会被模型看到、被记进对话，甚至被你截图发出去。', trap2: '身份证号和这次请求没关系，也不该发给任何 AI。' };
    const draw = () => {
      body().innerHTML = `<div class="ac-game"><div class="ac-env">${SLOTS.map(([k, n]) => `<button class="ac-slot ${placed[k] ? 'ok' : ''}" data-s="${k}"><small>${n}</small><b>${placed[k] ? esc(CARDS.find((c) => c[0] === k)[1]) : '……'}</b></button>`).join('')}</div><div class="ac-cards">${CARDS.filter((c) => !placed[c[0]]).map((c) => `<button class="ac-card ${sel === c[0] ? 'sel' : ''}" data-c="${c[0]}">${esc(c[1])}</button>`).join('')}</div><div class="ac-real"></div></div>`;
      body().querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); if (why[b.dataset.c]) { mis(); msg('✗ 陷阱：' + why[b.dataset.c], 'bad'); CARDS.splice(CARDS.findIndex((c) => c[0] === b.dataset.c), 1); return draw(); } sel = b.dataset.c; draw(); msg('拿起了一张，再点它该放的那一栏。'); }));
      body().querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
        if (!sel) return msg('先点下面的一张卡片。');
        if (sel !== b.dataset.s) { mis(); msg('✗ 放错栏了。想一想：这张是「地址」「付钱的」「收信的」还是「内容」？', 'bad'); return; }
        placed[sel] = true; sel = null; CF.Audio.sfx('correct'); draw();
        if (SLOTS.every(([k]) => placed[k])) real();
      }));
    };
    const real = () => {
      msg('✓ 信写好了！下面就是程序真正发出去的样子（Key 用星号代替）。', 'good');
      const box = body().querySelector('.ac-real'), ready = CF.AI && CF.AI.ready();
      box.innerHTML = `<div class="wc-card"><b>Claude 的请求长这样</b><pre class="ai-codev"><code>POST https://api.anthropic.com/v1/messages
Authorization: Bearer sk-ant-********（你的 Key，放在请求头里）

{
  "model": "claude-opus-5-5",
  "max_tokens": 1000,
  "messages": [
    { "role": "user", "content": "用一句话介绍你自己" }
  ]
}</code></pre><p class="small">很多其他平台用「兼容接口」：地址换成 …/chat/completions，回复在 choices[0].message.content 里。AI 助手两种都会。</p>${ready ? '<button class="btn" data-send>真的寄一封（会花一点点钱）</button><div class="ac-reply"></div>' : '<p class="small">还没接 API？没关系。以后在 ✦ AI 助手的「接口设置」里接上，就能真的寄了。</p>'}</div>`;
      const sb = box.querySelector('[data-send]');
      if (sb) sb.onclick = async () => { sb.disabled = true; const rp = box.querySelector('.ac-reply'); rp.textContent = '寄出去了，等回信……'; try { const t = await CF.AI.ask('用一句话介绍你自己。', { modeId: 'chat' }); rp.innerHTML = `<p><b>回信：</b>${esc(t)}</p><p class="small">状态码 200：成功。这就是 API。</p>`; } catch (err) { const e = err.friendly || CF.AINet.explain(err); rp.innerHTML = `<p><b>没寄成：</b>${esc(e.t)}</p><p class="small">${esc(e.d)}</p>`; } };
      act([['看懂回信上的数字 →', codes, 'primary']]);
    };
    const codes = () => {
      const Q = [['回信上写 401，最可能是？', ['Key 不对或没权限', '模型太忙', '网络断了'], 0], ['回信上写 429，应该？', ['马上换一个 Key 再狂发', '等一会儿再试，或者看看额度', '把内容写长一点'], 1], ['404 最常见的原因是？', ['地址或模型名写错了', '余额不足', '问题太难'], 0]];
      let i = 0;
      const show = () => {
        const [q, o, a] = Q[i];
        body().querySelector('.ac-real').innerHTML = `<div class="wc-card"><p><b>${i + 1} / ${Q.length}</b> ${q}</p><div class="ac-opts">${o.map((t, k) => `<button class="ac-opt" data-k="${k}">${t}</button>`).join('')}</div></div>`;
        body().querySelectorAll('.ac-opt').forEach((b) => (b.onclick = () => { if (+b.dataset.k !== a) { mis(); b.classList.add('bad'); return msg('✗ 再想想。', 'bad'); } CF.Audio.sfx('correct'); i++; if (i < Q.length) { msg('✓'); show(); } else finish('<p class="small">收费按 Token 算：一般问一次几分钱到几毛钱；图片、长文件、联网搜索更多。先用平台的免费额度练手。</p>'); }));
      };
      act([]); show();
    };
    act([]); msg('把四张卡片放到信封上对的那一栏（有两张是陷阱）。'); draw();
  };
  // 4 提示词：先分类五要素，再二选一
  GAMES.prompt = function () {
    const BINS = [['role', '角色'], ['task', '任务'], ['ctx', '背景'], ['fmt', '格式'], ['eg', '例子']];
    let cards = CF.shuffle([['你是一位耐心的编程老师', 'role'], ['帮我排一份一周的 Python 学习计划', 'task'], ['我高中毕业，零基础，每天下班只有 1 小时', 'ctx'], ['用表格写：星期、内容、练习', 'fmt'], ['像这样：周一｜变量是什么｜写一个自我介绍程序', 'eg'], ['我的目标是三个月后能写小工具', 'ctx']]), sel = null; const placed = {};
    const step1 = () => {
      body().innerHTML = `<div class="ac-game"><div class="ac-bins">${BINS.map(([k, n]) => `<button class="ac-bin" data-b="${k}"><b>${n}</b>${(placed[k] || []).map((t) => `<i>${esc(t)}</i>`).join('')}</button>`).join('')}</div><div class="ac-cards">${cards.map((c, i) => `<button class="ac-card ${sel === i ? 'sel' : ''}" data-i="${i}">${esc(c[0])}</button>`).join('')}</div></div>`;
      body().querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { sel = +b.dataset.i; CF.Audio.sfx('click'); step1(); }));
      body().querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => {
        if (sel == null) return msg('先点一张卡片，再点它属于的要素。');
        const c = cards[sel]; if (c[1] !== b.dataset.b) { mis(); return msg(`✗「${esc(c[0])}」不是${BINS.find((x) => x[0] === b.dataset.b)[1]}。`, 'bad'); }
        (placed[c[1]] = placed[c[1]] || []).push(c[0]); cards.splice(sel, 1); sel = null; CF.Audio.sfx('correct'); step1();
        if (!cards.length) { msg('✓ 五个要素都分好了。下面比一比两段提示词。', 'good'); act([['下一步 →', step2, 'primary']]); }
      }));
    };
    const PAIRS = [['我想学编程，怎么学？', '你是一位耐心的编程老师。我高中毕业、零基础，每天下班有 1 小时，三个月后想能写小工具。请用表格给我排第一周的计划（星期、内容、一个小练习）。', 1, '第二段有角色、背景、限制和格式，AI 不用猜你是谁、要什么。'], ['把这段代码改好。（贴了 200 行）', '这段代码点按钮后数字应该加一，但现在显示的是 01、011。我期望 1、2、3。请指出是哪一行的问题，解释原因，再给出改好的那一行。', 1, '第二段说清楚了「期望什么、实际看到什么」，还限定了只改那一行。']];
    const step2 = () => {
      let i = 0; act([]);
      const show = () => {
        const [a, b, good, why] = PAIRS[i];
        body().innerHTML = `<div class="ac-game"><p><b>${i + 1} / ${PAIRS.length}</b> 哪一段提示词更好？</p><div class="ac-opts">${[a, b].map((t, k) => `<button class="ac-opt ac-pr" data-k="${k}">${esc(t)}</button>`).join('')}</div></div>`;
        body().querySelectorAll('.ac-opt').forEach((x) => (x.onclick = () => { if (+x.dataset.k !== good) { mis(); x.classList.add('bad'); return msg('✗ 再比一比：哪一段让 AI 不用猜？', 'bad'); } x.classList.add('good'); CF.Audio.sfx('correct'); msg('✓ ' + why, 'good'); i++; act([[i < PAIRS.length ? '下一题 →' : '完成 →', () => (i < PAIRS.length ? (show(), act([])) : finish('<p class="small">在 AI 助手里试试：同一个问题，先随便问，再按五要素问一遍，比一比结果。</p>')), 'primary']]); }));
      };
      show();
    };
    act([]); msg('把每张卡片放进它属于的要素。'); step1();
  };
  // 5 幻觉与隐私：点出编造的两处；再分类能不能发给 AI
  GAMES.fake = function () {
    const CLAIMS = [['Transformer 架构出自 2017 年的论文《Attention Is All You Need》。', false, '这是真的，可以查到原论文。'], ['这本《深度学习之父》是马斯克在 2015 年写的。', true, '编的：没有这本书，马斯克也没写过这样的书。像这种「书名 + 作者 + 年份」，一定要自己查。'], ['详细内容见 https://example.com/real-paper-2020.pdf', true, '编的：这是一个不存在的链接。AI 给的链接要点开看，打不开就别信。'], ['1 千克水的体积大约是 1 升。', false, '这是真的（常温下近似）。']];
    let found = 0;
    body().innerHTML = `<div class="ac-game"><div class="wc-card"><p class="small">AI 的回答（有两处是编的，点出来）：</p>${CLAIMS.map((c, i) => `<button class="ac-claim" data-i="${i}">${esc(c[0])}</button>`).join('')}</div></div>`;
    body().querySelectorAll('.ac-claim').forEach((b) => (b.onclick = () => {
      if (b.classList.contains('good') || b.classList.contains('ok')) return; const c = CLAIMS[+b.dataset.i];
      if (!c[1]) { mis(); b.classList.add('ok'); return msg('✗ 这句是真的：' + c[2], 'bad'); }
      b.classList.add('good'); found++; CF.Audio.sfx('correct'); msg('✓ ' + c[2], 'good');
      if (found === 2) act([['下一步：隐私 →', privacy, 'primary']]);
    }));
    const privacy = () => {
      const ITEMS = CF.shuffle([['我的身份证号', 'no'], ['自己写的代码和报错信息（去掉密码）', 'ok'], ['公司还没公开的财报', 'no'], ['「PID 是什么」这种学习问题', 'ok'], ['我的 API Key', 'no'], ['银行卡和密码', 'no']]); let sel = null; const put = { ok: [], no: [] };
      const draw = () => {
        body().innerHTML = `<div class="ac-game"><div class="ac-bins">${[['ok', '可以发给 AI'], ['no', '不要发']].map(([k, n]) => `<button class="ac-bin" data-b="${k}"><b>${n}</b>${put[k].map((t) => `<i>${esc(t)}</i>`).join('')}</button>`).join('')}</div><div class="ac-cards">${ITEMS.map((c, i) => `<button class="ac-card ${sel === i ? 'sel' : ''}" data-i="${i}">${esc(c[0])}</button>`).join('')}</div></div>`;
        body().querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { sel = +b.dataset.i; draw(); }));
        body().querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { if (sel == null) return; const c = ITEMS[sel]; if (c[1] !== b.dataset.b) { mis(); return msg('✗ 想一想：发出去的内容会到平台的服务器上。', 'bad'); } put[c[1]].push(c[0]); ITEMS.splice(sel, 1); sel = null; CF.Audio.sfx('correct'); draw(); if (!ITEMS.length) finish('<p class="small">发错了也别慌：Key 泄露就去平台删掉、重建；密码泄露就马上改。</p>'); }));
      };
      act([]); msg('把每一样放进「可以发」或「不要发」。'); draw();
    };
    act([]); msg('读一读这段 AI 的回答，把编造的两处点出来。');
  };
  // 6 代码：先运行 AI 写的有 bug 的代码，再点出错的那一行，最后运行修好的
  GAMES.code = function () {
    const BAD = ['<button id="b">点我</button> <span id="n">0</span>', '<script>', 'let count = 0;', 'document.getElementById("b").onclick = function () {', '  count = count + "1";', '  document.getElementById("n").textContent = count;', '};', '</script>'], BUG = 4;
    const doc = (lines) => `<!doctype html><meta charset="utf-8"><body style="font:20px sans-serif;padding:20px;background:#f6efe0">${lines.join('\n').replace('</script>', '<\/script>')}</body>`;
    let ran = false;
    body().innerHTML = `<div class="ac-game"><p class="small">任务：「点一下按钮，数字加一」。下面是 AI 写的代码。先运行看看。</p><div class="ac-code">${BAD.map((l, i) => `<button class="ac-line" data-i="${i}"><i>${i + 1}</i><code>${esc(l)}</code></button>`).join('')}</div><iframe class="ac-run" sandbox="allow-scripts" title="代码运行"></iframe></div>`;
    const ifr = body().querySelector('.ac-run');
    body().querySelectorAll('.ac-line').forEach((b) => (b.onclick = () => {
      if (!ran) return msg('先点「运行」看看结果对不对。');
      if (+b.dataset.i !== BUG) { mis(); b.classList.add('bad'); return msg('✗ 这一行没问题。数字变成 01、011……是哪一行把数字当成了文字？', 'bad'); }
      b.classList.add('good'); CF.Audio.sfx('correct'); msg('✓ 就是这一行：<code>"1"</code> 带引号，是文字，加号把它拼在后面。改成 <code>count = count + 1;</code>', 'good');
      act([['▶ 运行修好的代码', () => { const fixed = BAD.slice(); fixed[BUG] = '  count = count + 1;'; ifr.srcdoc = doc(fixed); msg('点几下按钮：1、2、3……对了。以后让 AI 改 bug，就这样说「期望什么、实际看到什么」。', 'good'); act([['完成 →', () => finish('<p class="small">在 ✦ AI 助手的「代码助手」里，AI 写的网页代码点「▶ 运行」就能这样在沙盒里试。</p>'), 'primary']]); }, 'primary']]);
    }));
    act([['▶ 运行 AI 写的代码', () => { ifr.srcdoc = doc(BAD); ran = true; msg('在下面的框里点几下按钮：显示的是 1、2、3 吗？不是的话，点出有问题的那一行。'); }, 'primary']]);
    msg('先运行，看看结果对不对。');
  };
  // 7 做模组：填表 → 实时生成 JSON → 校验 → 安装 → 题目进学院
  GAMES.mod = function () {
    const D = CF.Content.DOMAINS;
    body().innerHTML = `<div class="ac-game ac-modf"><div class="wc-card"><label class="ai-f"><span>领域</span><select data-k="d">${Object.entries(D).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}</select></label>
      <label class="ai-f"><span>题目</span><input data-k="q" maxlength="200" placeholder="例如：一块 24V、10Ah 的电池，按 80% 可用，能放出多少能量？"></label>
      ${[0, 1, 2, 3].map((i) => `<label class="ai-f ac-o"><span><input type="radio" name="aca" value="${i}" ${i ? '' : 'checked'}> 选项 ${'ABCD'[i]}（选中的是正确答案）</span><input data-o="${i}" maxlength="120"></label>`).join('')}
      <label class="ai-f"><span>讲解（为什么）</span><input data-k="e" maxlength="300" placeholder="能量 = 电压 × 容量 × 80% = 192 Wh"></label></div>
      <div class="wc-card"><b>模组 JSON（照模板自动生成）</b><pre class="ai-codev ac-json"></pre><div class="ai-moderr hidden"></div></div>
      ${CF.AI && CF.AI.ready() ? '<p class="small">也可以让 AI 来做：<button class="btn sm" data-ai>打开 AI 助手 · 模组工匠</button></p>' : ''}</div>`;
    const build = () => {
      const g = (s) => body().querySelector(s), q = { d: g('[data-k=d]').value, q: g('[data-k=q]').value.trim(), o: [0, 1, 2, 3].map((i) => g(`[data-o="${i}"]`).value.trim()).filter(Boolean), a: +g('input[name=aca]:checked').value, e: g('[data-k=e]').value.trim() };
      const mod = { zaoyue: 1, type: 'knowledge', id: 'my-first-' + (sv().myId = sv().myId || Date.now().toString(36).slice(-5)), name: '我的第一个知识包', version: '1.0.0', author: '我', desc: '在 AI 学徒第 7 关亲手做的', questions: [q] };
      g('.ac-json').textContent = JSON.stringify(mod, null, 2); return mod;
    };
    body().querySelectorAll('input,select').forEach((el) => (el.oninput = el.onchange = build));
    const ab = body().querySelector('[data-ai]'); if (ab) ab.onclick = () => { CF.modal.close(); CF.Assistant.open({ tab: 'chat', mode: 'maker', fresh: true, prompt: '帮我做一个知识包：主题是【写你想学的主题】，3 道题，高中难度，每题附讲解。' }); };
    build();
    act([['检查并安装', () => {
      const mod = build(), E = CF.Mods.validate(mod), box = body().querySelector('.ai-moderr');
      if (E.length) { mis(); box.classList.remove('hidden'); box.innerHTML = `<b>还差一点</b><ul>${E.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`; return msg('✗ 校验没通过：按红字补全。这和 AI 写的模组被退回是一样的流程。', 'bad'); }
      if (mod.questions[0].o.length < 4) { mis(); return msg('✗ 四个选项都填上吧（模板允许 2–6 个，这一关要求 4 个）。', 'bad'); }
      const r = CF.Mods.install(mod); if (!r.ok) { mis(); return msg('✗ ' + r.errors[0], 'bad'); }
      box.classList.add('hidden'); CF.Audio.sfx('unlock');
      msg('✓ 装好了！你的题已经进了学院题库，在「学院 → 知识测验」里会随机出到。去「AI 助手 → 扩展工坊」可以看到、导出或卸载它。', 'good');
      act([['完成 →', () => finish('<p class="small">从现在起，你就能让 AI 照着模板，一直给这个游戏加新题目、新课程、新小游戏，甚至新功能了。</p>'), 'primary']]);
    }, 'primary']]);
    msg('填好一道题：右边会实时生成模组 JSON。填完点「检查并安装」。');
  };
})();
