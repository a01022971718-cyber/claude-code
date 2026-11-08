/* 实验室 · 具身智能：造一台机器人（v9.4，主创要求）——引擎与界面
 * 课程数据在 js/embodied-data.js。版式按 UI 宪法第 27 章：弹窗页眉不变；横屏左侧竖条（总览 + 六个阶段），竖屏是一排页签；
 * 进入一关后隐藏导航，整块区域给这一关用（27.12）。每关：学（知识卡）→ 练（玩法）→ 考（小测）→ 结算（星级）。
 * 玩法引擎：choice 选择 / 诊断 · sort 分类 · order 组装与工序 · wire 接线（像电路图：端口有类型，类型不对接不上）·
 *   tune 计算与调参（含运动学、时间戳对齐、手眼标定、动作平滑的小画板）· teleop 遥操作示教。
 * 星级：零失误 3 星；失误 + 提示 ≤ 2 次 2 星；其余 1 星；看了答案 1 星。同一关失败 4 次给答案（与电路工坊一致）。
 * 解锁：按顺序一关一关开（体验模式全开）；首次通关给实操经验，通关一个阶段记一次实验完成。 */
(function () {
  const CF = window.CF;
  const E = (CF.Emb = {});
  const D = () => CF.EmbData;
  const esc = (s) => CF.esc(s);
  const sv = () => { const d = CF.Save.data; d.emb = d.emb || { lv: {} }; d.emb.lv = d.emb.lv || {}; return d.emb; };
  const LEVELS = () => D().STAGES.flatMap((s) => s.levels.map((l) => Object.assign(l, { stage: s })));
  const starsOf = (id) => sv().lv[id] || 0;
  const isOpen = (l) => { if (CF.P.trial()) return true; const L = LEVELS(), i = L.indexOf(l); return i <= 0 || starsOf(L[i - 1].id) > 0; };
  const doneIn = (s) => s.levels.filter((l) => starsOf(l.id) > 0).length;
  const KIND = { choice: '选择 · 诊断', sort: '分类', order: '组装 · 工序', wire: '接线', tune: '计算 · 调参', teleop: '遥操作示教' };
  const LVD = { 点: '认识一个零件或概念', 线: '把几个连成一条链', 面: '搭出一个完整子系统', 体: '整台机器人、整个闭环' };
  const CN = '零一二三四五六';
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  E.progress = () => { const L = LEVELS(); return L.filter((l) => starsOf(l.id) > 0).length + '/' + L.length; };
  E.next = () => LEVELS().find((l) => !starsOf(l.id)) || null;

  let root = null, view = { tab: 'ov', play: null }, cur = null, loopStop = null, ro = null;
  E.open = function (levelId) {
    root = CF.h('<div class="emb rail-page"><nav class="rail" role="tablist" aria-label="阶段"></nav><div class="rail-main emb-main"></div></div>');
    CF.modal.open({ title: '🦾 实验室 · 具身智能：造一台机器人', body: root, wide: true, onClose: () => { stopLoop(); if (ro) ro.disconnect(); CF.$('#modal').classList.remove('ps-on'); root = null; } });
    CF.$('#modalCard').classList.add('emb-full'); CF.$('#modal').classList.add('ps-on');
    view = { tab: 'ov', play: null };
    if (levelId) return E.play(levelId);
    render();
  };
  function stopLoop() { if (loopStop) { loopStop(); loopStop = null; } }
  function render() {
    if (!root) return;
    stopLoop();
    root.classList.toggle('playing', !!view.play);
    const rail = root.querySelector('.rail'), main = root.querySelector('.emb-main');
    const tabs = [['ov', '总览', E.progress()]].concat(D().STAGES.map((s) => [s.id, s.no ? `${CN[s.no]} · ${s.short}` : s.short, `${doneIn(s)}/${s.levels.length}`]));
    rail.innerHTML = tabs.map(([k, n, c]) => `<button role="tab" data-t="${k}" class="${view.tab === k ? 'on' : ''}" aria-selected="${view.tab === k}">${n}<small>${c}</small></button>`).join('');
    rail.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); view = { tab: b.dataset.t, play: null }; render(); }));
    main.scrollTop = 0;
    if (view.play) return player(main);
    if (view.tab === 'ov') overview(main); else stagePage(main, D().STAGES.find((s) => s.id === view.tab));
  }
  // ⓘ 说明：在模块里面弹出（不另开弹窗，免得关掉整个模块）
  const info = (title, html) => {
    const o = CF.h(`<div class="emb-info" role="dialog" aria-label="${esc(title)}"><div class="emb-info-c"><h4>ⓘ ${esc(title)}</h4><div class="t-body">${html}</div><button class="btn primary">知道了</button></div></div>`);
    o.onclick = (e) => { if (e.target === o || e.target.closest('.btn')) { CF.Audio.sfx('click'); o.remove(); } };
    root.appendChild(o);
  };

  // ================= 总览 =================
  function overview(main) {
    const L = LEVELS(), n = L.filter((l) => starsOf(l.id) > 0).length, nx = E.next();
    main.innerHTML = `<div class="codex-head"><b class="codex-t">具身智能 · 全流程</b><span class="codex-prog">已通关 <b>${n}</b><span>/${L.length}</span></span><button class="btn sm ghost" data-i>ⓘ 这门课</button></div>
      <div class="emb-ov"><div class="emb-robot"><canvas width="240" height="240"></canvas><div class="emb-robot-cap"><b>${D().ROBOT}</b> · 完成度 ${Math.round((n / L.length) * 100)}%<small>虚线 = 还在图纸上，实线 = 已经造出来</small></div></div>
        <div class="emb-loop">${D().STAGES.map((s) => `<button class="emb-st-chip" data-t="${s.id}"><i>${s.no ? CN[s.no] : '序'}</i><b>${s.name}</b><small>${doneIn(s)}/${s.levels.length}</small><span class="emb-bar"><em style="width:${(doneIn(s) / s.levels.length) * 100}%"></em></span></button>`).join('')}<p class="emb-loopcap">设计 → 制造 → 仿真 → 训练 → 部署 → 反馈，再回到设计：一圈一圈地转。</p></div></div>
      ${nx ? `<div class="emb-next"><button class="btn primary" data-go="${nx.id}">继续：${nx.id} ${esc(nx.name)}</button><span class="small muted">${nx.stage.name}</span></div>` : '<div class="emb-next"><b class="emb-grad">全部通关：拾光号造好了！</b></div>'}
      <div class="emb-plf">${Object.keys(LVD).map((k) => `<span class="emb-lvl lv-${k}">${k}</span><span class="small">${LVD[k]}</span>`).join('')}</div>
      <div class="emb-map">${[['hw', '硬件全景（补全你没想到的）'], ['sw', '软件全景（补全你没想到的）']].map(([k, t]) => `<section><h4>${t}</h4>${D().MAP[k].map(([a, b, ids]) => `<div class="emb-mrow"><b>${a}</b><p>${b}</p><span>${ids.map((id) => `<button class="emb-mlv ${starsOf(id) ? 'done' : ''}" data-go="${id}">${id}</button>`).join('')}</span></div>`).join('')}</section>`).join('')}</div>`;
    drawRobot(main.querySelector('.emb-robot canvas'));
    main.querySelector('[data-i]').onclick = () => info('这门课', '具身智能机器人的制作，并不是把「大脑」（AI 模型）和「身体」（机械硬件）简单拼在一起，而是软硬件深度耦合、从虚拟仿真到物理世界闭环迭代的系统工程。<br><br>这门课带你从零造出「拾光号」：轮式底盘 + 6 自由度机械臂 + 深度相机 + 麦克风阵列。它听到「把桌上的杯子拿给我」，就走过去、找到杯子、抓起来、递给你。<br><br>按 <b>点 → 线 → 面 → 体</b> 学：先认识零件，再连成链，再搭成系统，最后合成整机、跑通整个闭环。每关先「学」几张卡片，再「练」，有的还要「考」。一关一关按顺序解锁。<br><br>想练电路，可以去主城 · 电路工坊的「具身智能」模块。');
    main.querySelectorAll('.emb-st-chip').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); view = { tab: b.dataset.t, play: null }; render(); }));
    main.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); E.play(b.dataset.go); }));
  }
  // ================= 阶段页 =================
  function stagePage(main, s) {
    main.innerHTML = `<div class="codex-head"><b class="codex-t">${s.no ? `阶段${CN[s.no]} · ` : ''}${s.name}</b><span class="codex-prog">通关 <b>${doneIn(s)}</b><span>/${s.levels.length}</span></span><button class="btn sm ghost" data-i>ⓘ 这个阶段</button></div>
      <div class="emb-path">${s.levels.map((l) => { const op = isOpen(l), st = starsOf(l.id); return `<button class="emb-lv ${op ? '' : 'lock'} ${st ? 'done' : ''}" data-go="${l.id}"><span class="emb-lvl lv-${l.lv}" title="${LVD[l.lv]}">${l.lv}</span><b>${l.id} ${esc(l.name)}</b><small>${KIND[l.kind]}${l.quiz ? ' · 有小测' : ''}</small><span class="emb-stars">${op ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒 通关上一关解锁'}</span></button>`; }).join('')}</div>`;
    main.querySelector('[data-i]').onclick = () => info(s.name, s.sum);
    main.querySelectorAll('.emb-lv').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); E.play(b.dataset.go); }));
  }

  // ================= 一关 =================
  E.play = function (id) {
    const lv = LEVELS().find((l) => l.id === id); if (!lv) return;
    if (!root) return E.open(id);
    if (!isOpen(lv)) { CF.Audio.sfx('error'); CF.toast('先通关上一关', 'bad'); return; }
    cur = { lv, step: 'learn', card: 0, mis: 0, hint: 0, ans: false };
    view = { tab: lv.stage.id, play: id }; render();
  };
  let body, msgEl, actEl, misEl;
  function player(main) {
    const lv = cur.lv;
    main.innerHTML = `<div class="emb-play"><div class="emb-pbar"><button class="btn sm ghost" data-back>← 返回</button><span class="emb-lvl lv-${lv.lv}" title="${LVD[lv.lv]}">${lv.lv}</span><b class="emb-pt">${lv.id} ${esc(lv.name)}</b>
      <span class="emb-steps">${['learn', 'play'].concat(lv.quiz ? ['quiz'] : []).map((s) => `<i data-s="${s}">${{ learn: '学', play: '练', quiz: '考' }[s]}</i>`).join('')}</span><span class="emb-mis">失误 <b>${cur.mis + cur.hint}</b></span></div>
      <div class="emb-pbody"></div><div class="emb-foot"><div class="emb-msg" aria-live="polite"></div><div class="emb-pact"></div></div></div>`;
    body = main.querySelector('.emb-pbody'); msgEl = main.querySelector('.emb-msg'); actEl = main.querySelector('.emb-pact'); misEl = main.querySelector('.emb-mis b');
    main.querySelector('[data-back]').onclick = () => { CF.Audio.sfx('click'); view = { tab: lv.stage.id, play: null }; render(); };
    ({ learn: learnStep, play: playStep, quiz: quizStep, result: resultStep })[cur.step]();
  }
  function steps() { root.querySelectorAll('.emb-steps i').forEach((i) => { i.classList.toggle('on', i.dataset.s === cur.step); i.classList.toggle('past', ['learn', 'play', 'quiz'].indexOf(i.dataset.s) < ['learn', 'play', 'quiz', 'result'].indexOf(cur.step)); }); }
  function msg(t, k) { msgEl.innerHTML = t || ''; msgEl.className = 'emb-msg' + (k ? ' ' + k : ''); }
  function act(btns) { actEl.innerHTML = ''; btns.forEach(([t, fn, cls]) => { const b = CF.h(`<button class="btn ${cls || ''}">${t}</button>`); b.onclick = () => { CF.Audio.sfx('click'); fn(); }; actEl.appendChild(b); }); }
  function mis(n = 1) { cur.mis += n; misEl.textContent = cur.mis + cur.hint; CF.Audio.sfx('error'); }
  function hint() { cur.hint++; misEl.textContent = cur.mis + cur.hint; }
  function go(step) { stopLoop(); cur.step = step; player(root.querySelector('.emb-main')); }

  // ---------- 学 ----------
  function learnStep() {
    steps(); const cards = cur.lv.learn, i = cur.card, c = cards[i];
    body.innerHTML = `<div class="emb-learn"><div class="emb-ln">知识卡 ${i + 1} / ${cards.length}</div><h3>${c[0]}</h3><p>${c[1]}</p>${c[2] ? `<div class="emb-ana"><b>打个比方</b>${c[2]}</div>` : ''}</div>`;
    msg(i === cards.length - 1 ? `下一步：${KIND[cur.lv.kind]}。` : '');
    act([].concat(i ? [['上一张', () => { cur.card--; learnStep(); }, 'ghost']] : []).concat([[i < cards.length - 1 ? '下一张' : '开始练习 →', () => { if (i < cards.length - 1) { cur.card++; learnStep(); } else go('play'); }, 'primary']]));
  }
  // ---------- 练 ----------
  function playStep() {
    steps(); msg(''); const lv = cur.lv;
    const done = () => { CF.Audio.sfx('correct'); if (lv.quiz) setTimeout(() => go('quiz'), 0); else go('result'); };
    ({ choice: () => choice(lv.qs, done), sort: () => sortG(lv, done), order: () => orderG(lv, done), wire: () => wireG(lv, done), tune: () => tuneG(lv, done), teleop: () => teleopG(lv, done) })[lv.kind]();
  }
  function quizStep() { steps(); const qs = cur.lv.quiz.map((q) => ({ q: '小测：' + q.q, o: q.o.map((t, i) => [t, i === q.a, i === q.a ? q.why : q.why]) })); choice(qs, () => go('result')); }

  // ---------- 选择 / 诊断 ----------
  function choice(qs, onDone) {
    let i = 0;
    const show = () => {
      const q = qs[i]; let solved = false;
      body.innerHTML = `<div class="emb-q">${qs.length > 1 ? `<div class="emb-ln">第 ${i + 1} / ${qs.length} 题</div>` : ''}<p class="emb-qq">${q.q}</p>${q.ctx || ''}<div class="emb-opts">${q.o.map((o, k) => `<button class="emb-opt" data-k="${k}">${o[0]}</button>`).join('')}</div></div>`;
      msg(cur.step === 'play' && cur.lv.prompt && !i ? cur.lv.prompt : ''); act([]);
      body.querySelectorAll('.emb-opt').forEach((b) => (b.onclick = () => {
        if (solved || b.classList.contains('bad')) return; const o = q.o[+b.dataset.k];
        if (o[1]) { solved = true; b.classList.add('good'); msg('✓ ' + o[2], 'good'); CF.Audio.sfx('correct'); act([[i < qs.length - 1 ? '下一题 →' : '完成 →', () => { i++; if (i < qs.length) show(); else onDone(); }, 'primary']]); }
        else { b.classList.add('bad'); mis(); msg('✗ ' + o[2], 'bad'); }
      }));
    };
    show();
  }
  // ---------- 分类 ----------
  function sortG(lv, onDone) {
    let left = shuffle(lv.cards.map((c, i) => ({ t: c[0], b: c[1], why: c[2], i }))), sel = null;
    const placed = {};
    const draw = () => {
      body.innerHTML = `<div class="emb-sort"><div class="emb-bins">${lv.bins.map(([k, n]) => `<button class="emb-bin" data-b="${k}"><b>${n}</b><span>${(placed[k] || []).map((t) => `<i>${esc(t)}</i>`).join('')}</span></button>`).join('')}</div>
        <div class="emb-tray">${left.map((c) => `<button class="emb-card ${sel === c.i ? 'sel' : ''}" data-c="${c.i}">${esc(c.t)}</button>`).join('')}</div></div>`;
      body.querySelectorAll('.emb-card').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); sel = +b.dataset.c; msg(`已拿起「${esc(lv.cards[sel][0])}」，点它属于的那一类。`); draw(); }));
      body.querySelectorAll('.emb-bin').forEach((b) => (b.onclick = () => {
        if (sel === null) return msg('先点下面的一张卡片，再点它属于的那一类。');
        const c = left.find((x) => x.i === sel), bn = lv.bins.find((x) => x[0] === b.dataset.b)[1];
        if (c.b === b.dataset.b) { (placed[c.b] = placed[c.b] || []).push(c.t); left = left.filter((x) => x !== c); sel = null; CF.Audio.sfx('correct'); msg(`✓ ${esc(c.t)}：${c.why}`, 'good'); draw(); if (!left.length) act([['完成 →', onDone, 'primary']]); }
        else { mis(); msg(`✗「${esc(c.t)}」不属于「${bn}」。${c.why}`, 'bad'); }
      }));
    };
    msg(lv.prompt + ' 点一下卡片，再点一下它属于的那一类。'); act([]); draw();
  }
  // ---------- 组装 / 工序（有先后） ----------
  function orderG(lv, onDone) {
    let pool = shuffle(lv.steps.map((s, i) => ({ t: s[0], why: s[1], i })).concat((lv.extra || []).map((e) => ({ t: e[0], why: e[1], i: -1 })))), n = 0, fails = 0, glow = -99;   // -1 是陷阱卡，提示用别的值
    const draw = () => {
      body.innerHTML = `<div class="emb-order"><ol class="emb-stack">${lv.steps.map((s, i) => i < n ? `<li class="emb-slot ok"><i>${i + 1}</i><b>${esc(s[0])}</b><small>${s[1]}</small></li>` : `<li class="emb-slot ${i === n ? 'next' : ''}"><i>${i + 1}</i><b>${i === n ? '下一步是什么？' : '……'}</b></li>`).join('')}</ol>
        <div class="emb-tray">${pool.map((c, k) => `<button class="emb-card ${c.i === glow ? 'glow' : ''}" data-k="${k}">${esc(c.t)}</button>`).join('')}</div></div>`;
      body.querySelectorAll('.emb-card').forEach((b) => (b.onclick = () => {
        const c = pool[+b.dataset.k];
        if (c.i === n) { n++; pool = pool.filter((x) => x !== c); glow = -99; CF.Audio.sfx('correct'); msg(`✓ 第 ${n} 步：${esc(c.t)}——${c.why}`, 'good'); draw(); body.querySelector('.emb-slot.next') && body.querySelector('.emb-slot.next').scrollIntoView({ block: 'nearest' }); if (n === lv.steps.length) act([['完成 →', onDone, 'primary']]); }
        else if (c.i === -1) { mis(); pool = pool.filter((x) => x !== c); msg(`✗ 陷阱：「${esc(c.t)}」——${c.why}`, 'bad'); draw(); }
        else { mis(); fails++; msg(`✗ 还不是这一步：「${esc(c.t)}」要在后面。想一想，现在最该做的是什么？`, 'bad'); if (fails >= 4) btns(); }
      }));
    };
    const btns = () => act([['提示这一步', () => { hint(); glow = n; const s = lv.steps[n]; msg(`提示：第 ${n + 1} 步是「${esc(s[0])}」——${s[1]}`); draw(); }, 'ghost']]);
    msg(lv.prompt + ' 按顺序点下面的卡片。'); btns(); draw();
  }

  // ---------- 接线（像电路图） ----------
  const SIDE_TR = { l: 't', r: 'b', t: 'l', b: 'r' };
  const NORM = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
  const ekey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  function wireG(lv, onDone) {
    const T = D().TYPES, nodes = lv.nodes, sol = lv.edges.map((e) => ({ k: ekey(e[0], e[1]), a: e[0], b: e[1], why: e[2] }));
    let edges = [], sel = null, bad = [], glow = [], fails = 0, pos = {}, finished = false;
    const port = (pk) => { const [n, p] = pk.split('.'), nd = nodes.find((x) => x.id === n); return { nd, p: nd.p.find((x) => x[0] === p) }; };
    const pname = (pk) => { const { nd, p } = port(pk); return `「${esc(nd.n)}」${p[3] ? '的「' + esc(p[3]) + '」' : ''}`; };
    body.innerHTML = `<div class="emb-wire"><div class="emb-legend">${(lv.types || []).map((t) => `<button class="emb-ty" data-t="${t}" style="--c:${T[t][1]}"><i></i>${T[t][0]}</button>`).join('')}<span class="small muted">点一个圆口、再点另一个就连上；也可以按住拖过去。点一根线可以拆掉。</span></div>
      <div class="emb-bwrap"><div class="emb-board"><svg class="emb-svg"></svg>${nodes.map((nd) => `<div class="emb-node" data-n="${nd.id}"><b>${esc(nd.n)}</b></div>`).join('')}${nodes.flatMap((nd) => nd.p.map((p) => `<button class="emb-port" data-p="${nd.id}.${p[0]}" style="--c:${T[p[2]][1]}" aria-label="${esc(nd.n)} ${esc(p[3] || '')} ${T[p[2]][0]}"><span>${esc(p[3] || '')}</span></button>`)).join('')}</div></div></div>`;
    const wrap = body.querySelector('.emb-bwrap'), board = body.querySelector('.emb-board'), svg = body.querySelector('.emb-svg');
    body.querySelectorAll('.emb-ty').forEach((b) => (b.onclick = () => { const t = T[b.dataset.t]; msg(`<b style="color:${t[1]}">${t[0]}</b>：${t[2]}`); }));
    body.querySelectorAll('.emb-node b').forEach((b) => (b.onclick = () => { const nd = nodes.find((x) => x.id === b.parentNode.dataset.n); msg(`<b>${esc(nd.n)}</b>${nd.d ? '：' + nd.d : ''}`); }));
    function layout() {
      const W = Math.max(280, wrap.clientWidth - 4), cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b), rows = [...new Set(nodes.map((n) => n.row))].sort((a, b) => a - b);
      const tr = W < 600 && cols.length > 2 && rows.length <= 4, C = tr ? rows : cols, R = tr ? cols : rows;
      const colW = Math.max(tr ? 84 : 150, W / C.length), nodeW = colW - (tr ? 10 : 26);
      const sideOf = (s) => (tr ? SIDE_TR[s] : s);
      const hOf = (nd) => { if (tr) return 64; const c = { l: 0, r: 0 }; nd.p.forEach((p) => { const s = sideOf(p[1]); if (c[s] !== undefined) c[s]++; }); return Math.max(54, 24 + 16 * Math.max(c.l, c.r)); };
      const rowH = Math.max(...nodes.map(hOf)) + (tr ? 46 : 28);
      board.style.width = colW * C.length + 'px'; board.style.height = rowH * R.length + 8 + 'px'; board.classList.toggle('tr', tr);
      svg.setAttribute('width', colW * C.length); svg.setAttribute('height', rowH * R.length + 8);
      pos = {};
      nodes.forEach((nd) => {
        const ci = C.indexOf(tr ? nd.row : nd.col), ri = R.indexOf(tr ? nd.col : nd.row), h = hOf(nd), x = ci * colW + (colW - nodeW) / 2, y = ri * rowH + (rowH - h) / 2 + 4;
        const el = board.querySelector(`.emb-node[data-n="${nd.id}"]`), lab = (sd) => !tr && nd.p.some((p) => sideOf(p[1]) === sd && p[3]);
        Object.assign(el.style, { left: x + 'px', top: y + 'px', width: nodeW + 'px', height: h + 'px', paddingLeft: lab('l') ? '44px' : '', paddingRight: lab('r') ? '44px' : '' });   // 有接口文字的一侧多留位置，文字不压名字
        const by = {}; nd.p.forEach((p) => (by[sideOf(p[1])] = (by[sideOf(p[1])] || []).concat([p])));
        Object.keys(by).forEach((s) => by[s].forEach((p, k) => {
          const f = (k + 1) / (by[s].length + 1), px = s === 'l' ? x : s === 'r' ? x + nodeW : x + nodeW * f, py = s === 't' ? y : s === 'b' ? y + h : y + h * f;
          pos[nd.id + '.' + p[0]] = [px, py, s];
          const pe = board.querySelector(`.emb-port[data-p="${nd.id}.${p[0]}"]`); pe.style.left = px + 'px'; pe.style.top = py + 'px'; pe.className = 'emb-port s-' + s;
        }));
      });
      draw();
    }
    function draw() {
      const path = (a, b) => { const [x1, y1, s1] = pos[a], [x2, y2, s2] = pos[b], d = Math.max(30, Math.min(90, Math.hypot(x2 - x1, y2 - y1) / 2.5)); const [n1x, n1y] = NORM[s1], [n2x, n2y] = NORM[s2]; return `M${x1} ${y1} C${x1 + n1x * d} ${y1 + n1y * d} ${x2 + n2x * d} ${y2 + n2y * d} ${x2} ${y2}`; };
      svg.innerHTML = edges.map(([a, b]) => { const k = ekey(a, b), c = T[port(a).p[2]][1]; return `<path class="w ${bad.includes(k) ? 'bad' : ''}" d="${path(a, b)}" stroke="${c}"/><path class="hit" data-k="${k}" d="${path(a, b)}"/>`; }).join('');
      svg.querySelectorAll('.hit').forEach((p) => (p.onclick = () => { if (finished) return; edges = edges.filter((e) => ekey(e[0], e[1]) !== p.dataset.k); bad = bad.filter((k) => k !== p.dataset.k); CF.Audio.sfx('click'); msg('已拆掉这根线。'); draw(); }));
      board.querySelectorAll('.emb-port').forEach((pe) => { const k = pe.dataset.p; pe.classList.toggle('sel', sel === k); pe.classList.toggle('used', edges.some((e) => e[0] === k || e[1] === k)); pe.classList.toggle('glow', glow.includes(k)); });
    }
    function connect(a, b) {
      sel = null; if (finished) return;
      if (a.split('.')[0] === b.split('.')[0]) { msg('同一个零件上的两个口不用互相连。'); return draw(); }
      const ta = port(a).p[2], tb = port(b).p[2];
      if (ta !== tb) { mis(); const pw = ['24V', '12V', '5V']; msg(`✗ 接不上：${pname(a)}是 <b>${T[ta][0]}</b>，${pname(b)}是 <b>${T[tb][0]}</b>。${pw.includes(ta) && pw.includes(tb) ? '电压不一样，真机上会直接烧坏设备。' : '类型不同：插头插不进，数据也读不懂。'}`, 'bad'); return draw(); }
      edges = edges.filter((e) => ![a, b].includes(e[0]) && ![a, b].includes(e[1])); edges.push([a, b]); bad = []; glow = []; CF.Audio.sfx('click');
      msg(`已连接：${pname(a)} ↔ ${pname(b)}`); draw();
    }
    // 点选 + 拖线
    board.querySelectorAll('.emb-port').forEach((pe) => {
      let start = null;
      pe.addEventListener('pointerdown', (e) => { if (finished) return; start = [e.clientX, e.clientY]; try { pe.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ } });
      pe.addEventListener('pointerup', (e) => {
        if (!start || finished) return; const moved = Math.hypot(e.clientX - start[0], e.clientY - start[1]); start = null; const k = pe.dataset.p;
        if (moved > 8) { const t = document.elementFromPoint(e.clientX, e.clientY), te = t && t.closest('.emb-port'); if (te && te !== pe) return connect(k, te.dataset.p); return; }
        if (!sel) { sel = k; const { nd, p } = port(k); msg(`已选：「${esc(nd.n)}」的 ${p[3] ? '「' + esc(p[3]) + '」' : '接口'}（<b style="color:${T[p[2]][1]}">${T[p[2]][0]}</b>）。再点另一个口连上。`); draw(); }
        else if (sel === k) { sel = null; msg(''); draw(); } else connect(sel, k);
      });
    });
    const solK = () => sol.map((s) => s.k);
    const check = () => {
      const wrong = edges.filter((e) => !solK().includes(ekey(e[0], e[1]))), missing = sol.filter((s) => !edges.some((e) => ekey(e[0], e[1]) === s.k));
      if (wrong.length) {
        mis(); fails++; bad = wrong.map((e) => ekey(e[0], e[1])); draw();
        const w = wrong[0], right = sol.find((s) => s.a === w[0] || s.b === w[0] || s.a === w[1] || s.b === w[1]);
        msg(`✗ 有 ${wrong.length} 根线接错了（红色虚线）：${pname(w[0])} ↔ ${pname(w[1])}。${right ? `提示：${pname(right.a)}应该连到${pname(right.b)}——${right.why}` : ''}`, 'bad');
      } else if (missing.length) { fails++; msg(`接对了 ${edges.length} 根，还差 ${missing.length} 根没接。`); }
      else return win();
      if (fails >= 4) btns(true);
    };
    const win = () => { finished = true; sel = null; draw(); body.querySelector('.emb-wire').insertAdjacentHTML('beforeend', `<div class="emb-recap"><b>每根线为什么这么接</b>${sol.map((s) => `<p><i style="background:${T[port(s.a).p[2]][1]}"></i>${pname(s.a)} ↔ ${pname(s.b)}：${s.why}</p>`).join('')}</div>`); msg(cur.ans ? '答案已经连好，看看下面每根线的道理。' : '✓ 全部接对！', 'good'); act([['完成 →', onDone, 'primary']]); };
    const btns = (more) => act([['提示', () => { const m = sol.find((s) => !edges.some((e) => ekey(e[0], e[1]) === s.k)); if (!m) return msg('线都接上了，点「检查」。'); hint(); glow = [m.a, m.b]; draw(); msg(`提示：把${pname(m.a)}连到${pname(m.b)}——${m.why}`); }, 'ghost'], ['清空', () => { edges = []; bad = []; glow = []; draw(); msg('已清空。'); }, 'ghost']].concat(more ? [['看答案', () => { cur.ans = true; edges = sol.map((s) => [s.a, s.b]); bad = []; win(); }, 'ghost']] : []).concat([['检查', check, 'primary']]));
    msg(lv.prompt); btns(false);
    requestAnimationFrame(layout);
    if (ro) ro.disconnect(); ro = new ResizeObserver(() => { if (wrap.isConnected) layout(); }); ro.observe(wrap);
  }

  // ---------- 计算与调参 ----------
  function tuneG(lv, onDone) {
    const v = {}; lv.ctrl.forEach((c) => (v[c.id] = c.v)); let round = 0;
    const special = lv.ik ? 'ik' : lv.align ? 'align' : lv.hand ? 'hand' : lv.smooth ? 'smooth' : null;
    body.innerHTML = `<div class="emb-tune">${lv.intro ? `<p class="emb-intro">${lv.intro}</p>` : ''}<div class="emb-tgrid"><div class="emb-ctrls">${lv.ctrl.map((c) => c.seg ? `<div class="emb-ctl"><span>${c.n}</span><div class="emb-seg">${c.seg.map(([k, t]) => `<button data-c="${c.id}" data-v="${k}">${t}</button>`).join('')}</div></div>` : `<label class="emb-ctl"><span>${c.n} <b data-show="${c.id}"></b></span><input type="range" data-c="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.v}"></label>`).join('')}</div>
      <div class="emb-tside">${special ? '<canvas class="emb-cv" width="320" height="220"></canvas>' : ''}<div class="emb-metrics"></div></div></div></div>`;
    const cv = body.querySelector('.emb-cv');
    const metrics = () => {
      if (special === 'ik') { const { L1, L2, targets, tol } = lv.ik, a = (v.a * Math.PI) / 180, b = (v.b * Math.PI) / 180, x = L1 * Math.cos(a) + L2 * Math.cos(a + b), y = L1 * Math.sin(a) + L2 * Math.sin(a + b), t = targets[Math.min(round, targets.length - 1)], d = Math.hypot(x - t[0], y - t[1]); return [['手指位置', `(${x.toFixed(2)}, ${y.toFixed(2)}) m`, true, ''], [`目标 ${Math.min(round + 1, targets.length)} / ${targets.length}`, `(${t[0]}, ${t[1]}) m`, true, ''], ['距离', (d * 100).toFixed(1) + ' cm', d <= tol, '≤ ' + tol * 100 + ' cm']]; }
      if (special === 'hand') { const errs = handErr(); return [['最大误差', (Math.max(...errs) * 100).toFixed(1) + ' cm', Math.max(...errs) <= 0.015, '≤ 1.5 cm'], ['三个标定点', errs.map((e) => (e * 100).toFixed(1)).join(' / ') + ' cm', true, '']]; }
      return lv.model(v);
    };
    const handErr = () => { const H = lv.hand, M = [[0.35, 0.1], [0.5, -0.15], [0.25, -0.3]], r0 = (H.rot * Math.PI) / 180, rg = (v.rot * Math.PI) / 180; return M.map(([x, y]) => { const dx = x - H.tx, dy = y - H.ty, cx = Math.cos(-r0) * dx - Math.sin(-r0) * dy, cy = Math.sin(-r0) * dx + Math.cos(-r0) * dy, ex = Math.cos(rg) * cx - Math.sin(rg) * cy + +v.tx, ey = Math.sin(rg) * cx + Math.cos(rg) * cy + +v.ty; return Math.hypot(ex - x, ey - y); }); };
    const update = () => {
      body.querySelectorAll('[data-show]').forEach((s) => { const c = lv.ctrl.find((x) => x.id === s.dataset.show); s.textContent = (+v[c.id]).toFixed(c.step < 0.01 ? 3 : c.step < 1 ? 2 : 0) + (c.unit || ''); });
      body.querySelectorAll('.emb-seg button').forEach((b) => b.classList.toggle('on', String(v[b.dataset.c]) === b.dataset.v));
      body.querySelector('.emb-metrics').innerHTML = metrics().map(([n, val, ok, tg]) => `<div class="emb-met ${tg ? (ok ? 'ok' : 'no') : ''}"><span>${n}</span><b>${val}</b>${tg ? `<small>${ok ? '✓' : '✗'} 要求 ${tg}</small>` : ''}</div>`).join('');
      if (cv) plot(cv, special);
    };
    const plot = (c, kind) => {
      const g = c.getContext('2d'), W = c.width, Hh = c.height; g.clearRect(0, 0, W, Hh); g.fillStyle = '#0b0a12'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#ffffff10'; for (let i = 0; i < W; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, Hh); g.stroke(); } for (let i = 0; i < Hh; i += 20) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
      if (kind === 'ik') {
        const { L1, L2, targets, tol } = lv.ik, s = 300, ox = 40, oy = Hh - 20, P = (x, y) => [ox + x * s, oy - y * s], a = (v.a * Math.PI) / 180, b = (v.b * Math.PI) / 180;
        targets.forEach((t, i) => { const [tx, ty] = P(t[0], t[1]); g.strokeStyle = i < round ? '#6fdc8c' : i === round ? '#ffe08a' : '#ffffff30'; g.lineWidth = 2; g.beginPath(); g.arc(tx, ty, tol * s, 0, 7); g.stroke(); g.fillStyle = g.strokeStyle; g.font = '11px sans-serif'; g.fillText(i < round ? '✓' : String(i + 1), tx + 8, ty - 8); });
        const e1 = [L1 * Math.cos(a), L1 * Math.sin(a)], e2 = [e1[0] + L2 * Math.cos(a + b), e1[1] + L2 * Math.sin(a + b)], p0 = P(0, 0), p1 = P(...e1), p2 = P(...e2);
        g.fillStyle = '#2b2641'; g.fillRect(p0[0] - 18, p0[1], 36, 14); g.lineCap = 'round'; g.lineWidth = 9; g.strokeStyle = '#9b7bff'; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); g.strokeStyle = '#4ef0ff'; g.beginPath(); g.moveTo(...p1); g.lineTo(...p2); g.stroke();
        [p0, p1].forEach((p) => { g.fillStyle = '#ede6d6'; g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fill(); }); g.fillStyle = '#ffb14a'; g.beginPath(); g.arc(p2[0], p2[1], 5, 0, 7); g.fill(); g.lineCap = 'butt'; g.lineWidth = 1;
      } else if (kind === 'align') {
        const lag = lv.align.lag, off = +v.off, jit = v.how === 'arrive', X = (t) => 20 + (t / 2) * (W - 40);
        const row = (y, label, t, c, j) => { g.fillStyle = '#9d96ad'; g.font = '11px sans-serif'; g.fillText(label, 20, y - 14); g.strokeStyle = '#ffffff40'; g.beginPath(); g.moveTo(20, y); g.lineTo(W - 20, y); g.stroke(); for (let k = 0; k <= 60; k++) { const tt = k / 30; g.fillStyle = '#ffffff30'; g.fillRect(X(tt), y - 3, 1, 6); } g.fillStyle = c; if (j) { for (let q = -2; q <= 2; q++) { g.globalAlpha = 0.3; g.fillRect(X(t + q * 0.03) - 2, y - 10, 4, 20); } g.globalAlpha = 1; } g.fillRect(X(t) - 2, y - 10, 4, 20); };
        row(70, '关节数据：夹爪闭合', 1.0, '#ffb14a'); row(160, '相机画面：夹爪闭合' + (jit ? '（到达时间忽快忽慢）' : ''), 1.0 + (lag - off) / 1000, '#4ef0ff', jit);
        g.setLineDash([4, 4]); g.strokeStyle = '#ffffff60'; g.beginPath(); g.moveTo(X(1), 40); g.lineTo(X(1), Hh - 20); g.stroke(); g.setLineDash([]);
      } else if (kind === 'hand') {
        const H = lv.hand, s = 320, ox = 30, oy = Hh / 2 + 20, P = (x, y) => [ox + x * s, oy - y * s], M = [[0.35, 0.1], [0.5, -0.15], [0.25, -0.3]], r0 = (H.rot * Math.PI) / 180, rg = (v.rot * Math.PI) / 180;
        g.fillStyle = '#2b2641'; const b0 = P(0, 0); g.fillRect(b0[0] - 12, b0[1] - 12, 24, 24); g.fillStyle = '#9d96ad'; g.font = '10px sans-serif'; g.fillText('底座', b0[0] - 10, b0[1] + 24);
        M.forEach(([x, y]) => { const dx = x - H.tx, dy = y - H.ty, cx = Math.cos(-r0) * dx - Math.sin(-r0) * dy, cy = Math.sin(-r0) * dx + Math.cos(-r0) * dy, ex = Math.cos(rg) * cx - Math.sin(rg) * cy + +v.tx, ey = Math.sin(rg) * cx + Math.cos(rg) * cy + +v.ty, [px, py] = P(x, y), [qx, qy] = P(ex, ey); g.strokeStyle = '#6fdc8c'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 7, 0, 7); g.stroke(); g.strokeStyle = '#ff5d6c55'; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke(); g.fillStyle = '#ede6d6'; g.beginPath(); g.arc(qx, qy, 4, 0, 7); g.fill(); });
        const [cx0, cy0] = P(+v.tx, +v.ty); g.save(); g.translate(cx0, cy0); g.rotate(-rg); g.fillStyle = '#4ef0ff'; g.fillRect(-8, -5, 16, 10); g.fillRect(8, -2, 6, 4); g.restore(); g.fillStyle = '#9d96ad'; g.fillText('相机（你估计的位置）', cx0 + 10, cy0 - 8); g.fillText('绿圈 = 真实标定点，白点 = 相机看到后换算的位置', 10, 14); g.lineWidth = 1;
      } else if (kind === 'smooth') {
        const a = +v.a, hz = +v.hz, X = (t) => 10 + t * (W - 20), Y = (y) => Hh - 30 - y * (Hh - 60); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
        g.strokeStyle = '#ffffff30'; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(0.2), Y(0)); g.lineTo(X(0.2), Y(1)); g.lineTo(X(1), Y(1)); g.stroke();
        g.strokeStyle = '#ff7a4588'; g.beginPath(); for (let i = 0; i <= 100; i++) { const t = i / 100, r = (t >= 0.2 ? 1 : 0) + rnd() * 0.25; i ? g.lineTo(X(t), Y(r)) : g.moveTo(X(t), Y(r)); } g.stroke();
        seed = 7; let y = 0, last = 0; g.strokeStyle = '#4ef0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(0));
        for (let i = 0; i <= 1000; i++) { const t = i / 1000; if (t - last >= 1 / hz || i === 0) { last = t; const r = (t >= 0.2 ? 1 : 0) + rnd() * 0.25; y = y + a * (r - y); } g.lineTo(X(t), Y(y)); } g.stroke(); g.lineWidth = 1;
        g.fillStyle = '#9d96ad'; g.font = '11px sans-serif'; g.fillText('橙：模型原始输出（带噪声）  蓝：平滑后发给电机', 10, 16);
      }
    };
    body.querySelectorAll('input[type=range]').forEach((r) => (r.oninput = () => { v[r.dataset.c] = +r.value; update(); }));
    body.querySelectorAll('.emb-seg button').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); v[b.dataset.c] = b.dataset.v; update(); }));
    const finish = () => { if (lv.after) body.querySelector('.emb-tune').insertAdjacentHTML('beforeend', `<div class="emb-recap"><b>想一想</b><p>${lv.after}</p></div>`); act([['完成 →', onDone, 'primary']]); };
    const check = () => {
      const m = metrics(), okAll = m.every((x) => !x[3] || x[2]);
      if (!okAll) { mis(); const f = m.filter((x) => x[3] && !x[2]).map((x) => `${x[0]}（${x[1]}，要求 ${x[3]}）`); return msg('✗ 还没达标：' + f.join('；'), 'bad'); }
      if (special === 'ik' && round < lv.ik.targets.length - 1) { round++; CF.Audio.sfx('correct'); msg(`✓ 碰到第 ${round} 个目标！下一个。`, 'good'); return update(); }
      CF.Audio.sfx('correct'); msg('✓ 达标！', 'good'); finish();
    };
    msg(lv.prompt); act([['检查', check, 'primary']]); update();
  }

  // ---------- 遥操作示教 ----------
  function teleopG(lv, onDone) {
    body.innerHTML = `<div class="emb-teleop"><canvas class="emb-tcv" width="640" height="360"></canvas><div class="emb-demos"></div></div>`;
    const c = body.querySelector('.emb-tcv'), g = c.getContext('2d'), WW = 1, HH = 0.5625;
    const TABLE = { x0: 0.04, x1: 0.56, y: 0.42 }, ZONE = { x0: 0.78, x1: 0.94, y0: 0.24, y1: 0.36 };
    let demos = [], st, raf = 0, last = 0;
    const reset = () => { const cx = 0.14 + Math.random() * 0.3; st = { gx: 0.5, gy: 0.12, tx: 0.5, ty: 0.12, closed: false, hold: false, cup: { x: cx, y: TABLE.y }, cup0: cx, t: 0, path: 0, phase: 'go', falling: false, drag: false }; };
    reset();
    const toW = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * WW, ((e.clientY - r.top) / r.height) * HH]; };
    c.addEventListener('pointerdown', (e) => { st.drag = true; [st.tx, st.ty] = toW(e); try { c.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
    c.addEventListener('pointermove', (e) => { if (st.drag || e.pointerType === 'mouse') [st.tx, st.ty] = toW(e); });
    c.addEventListener('pointerup', () => { st.drag = false; });
    const grip = () => {
      if (st.phase !== 'go') return;
      if (!st.closed) { st.closed = true; const near = Math.abs(st.gx - st.cup.x) < 0.035 && Math.abs(st.gy - (st.cup.y - 0.015)) < 0.035; if (near) { st.hold = true; msg('夹住了！送到右边人手的位置（绿框）再松开。'); } else msg('夹空了：要先把夹爪移到杯子正上方、和杯子一样高的位置。'); }
      else { st.closed = false; if (st.hold) { st.hold = false; const inZ = st.gx > ZONE.x0 && st.gx < ZONE.x1 && st.gy > ZONE.y0 - 0.03 && st.gy < ZONE.y1 + 0.03; if (inZ) endDemo(true); else { st.falling = true; st.phase = 'fall'; } } }
      draw2();
    };
    const endDemo = (ok) => {
      st.phase = 'end'; const ideal = Math.hypot(0.5 - st.cup0, 0.12 - (TABLE.y - 0.015)) + Math.hypot(0.86 - st.cup0, 0.3 - (TABLE.y - 0.015)), eff = st.path / ideal, score = Math.max(0, Math.round(100 - 45 * Math.max(0, eff - 1.15) - 4 * Math.max(0, st.t - 9)));
      const good = ok && score >= 60; demos.push({ ok, score, t: st.t, good });
      if (!ok) { mis(); msg('✗ 杯子掉了：要在绿框里松开。这条演示作废（失败的演示也会被记录，但不能用来教它）。', 'bad'); }
      else if (!good) msg(`这条演示成功了，但不够稳（平稳度 ${score} 分，路线绕了 ${Math.round((eff - 1) * 100)}%、用时 ${st.t.toFixed(1)} 秒）。太绕、太犹豫的数据会把模型教坏，不收。`, 'bad');
      else msg(`✓ 合格的演示：平稳度 ${score} 分，用时 ${st.t.toFixed(1)} 秒。`, 'good');
      renderDemos(); const n = demos.filter((d) => d.good).length;
      if (n >= lv.need) { stop(); act([['完成 →', onDone, 'primary']]); msg(`✓ 录够 ${lv.need} 条合格演示。这些数据会变成「观测 → 动作」的训练样本。`, 'good'); }
      else setTimeout(() => { if (!root || cur.lv !== lv) return; reset(); draw2(); }, 1200);
    };
    const renderDemos = () => { body.querySelector('.emb-demos').innerHTML = `<b>已录演示</b>${demos.map((d, i) => `<span class="${d.good ? 'ok' : 'no'}">#${i + 1} ${d.ok ? d.score + ' 分' : '掉了'}${d.good ? ' ✓' : ''}</span>`).join('')}<small>合格 ${demos.filter((d) => d.good).length} / ${lv.need}</small>`; };
    const step = (now) => {
      raf = requestAnimationFrame(step); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; if (st.phase === 'end') return draw2();
      if (st.phase === 'go') {
        st.t += dt; const dx = st.tx - st.gx, dy = st.ty - st.gy, d = Math.hypot(dx, dy), sp = 0.55 * dt;
        if (d > 0.002) { const k = Math.min(1, sp / d), nx = st.gx + dx * k, ny = st.gy + dy * k; st.path += Math.hypot(nx - st.gx, ny - st.gy); st.gx = nx; st.gy = ny; }
        if (st.gx > TABLE.x0 - 0.02 && st.gx < TABLE.x1 + 0.02 && st.gy > TABLE.y - 0.012) st.gy = TABLE.y - 0.012;   // 手不能穿过桌面
        st.gy = Math.max(0.02, Math.min(HH - 0.02, st.gy)); st.gx = Math.max(0.02, Math.min(WW - 0.02, st.gx));
        if (st.hold) { st.cup.x = st.gx; st.cup.y = st.gy + 0.015; }
      } else if (st.phase === 'fall') { st.cup.y += 0.6 * dt; const floor = st.cup.x > TABLE.x0 && st.cup.x < TABLE.x1 ? TABLE.y : HH - 0.02; if (st.cup.y >= floor) { st.cup.y = floor; endDemo(false); } }
      draw2();
    };
    const draw2 = () => {
      const W = c.width, H = c.height, s = W / WW, P = (x, y) => [x * s, y * s];
      g.fillStyle = '#161325'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffffff08'; for (let i = 0; i < W; i += 16) g.fillRect(i, 0, 1, H);
      const [t0x, t0y] = P(TABLE.x0, TABLE.y), [t1x] = P(TABLE.x1, 0); g.fillStyle = '#8a4b2a'; g.fillRect(t0x, t0y, t1x - t0x, 10); g.fillRect(t0x + 8, t0y + 10, 8, H - t0y); g.fillRect(t1x - 16, t0y + 10, 8, H - t0y);
      const [zx, zy] = P(ZONE.x0, ZONE.y0), [zx1, zy1] = P(ZONE.x1, ZONE.y1); g.strokeStyle = '#6fdc8c'; g.setLineDash([5, 4]); g.strokeRect(zx, zy, zx1 - zx, zy1 - zy); g.setLineDash([]); g.fillStyle = '#ffe0cc'; g.fillRect(zx1 - 6, zy + 10, 40, 16); g.fillStyle = '#6fdc8c'; g.font = '12px sans-serif'; g.fillText('人的手', zx, zy - 6);
      const [cx, cy] = P(st.cup.x, st.cup.y); g.fillStyle = '#4ef0ff'; g.fillRect(cx - 11, cy - 30, 22, 30); g.fillStyle = '#29e0e0'; g.fillRect(cx - 11, cy - 30, 22, 5);
      const [bx, by] = P(0.5, 0.0), [gx, gy] = P(st.gx, st.gy); g.strokeStyle = '#9b7bff'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, by); g.lineTo(gx, gy - 14); g.stroke(); g.lineWidth = 1; g.lineCap = 'butt';
      const op = st.closed ? 12 : 20; g.fillStyle = '#ede6d6'; g.fillRect(gx - op - 4, gy - 16, 4, 22); g.fillRect(gx + op, gy - 16, 4, 22); g.fillRect(gx - op - 4, gy - 18, op * 2 + 8, 4);
      g.fillStyle = '#9d96ad'; g.fillText(`用时 ${st.t.toFixed(1)} 秒`, 10, 18);
      if (st.phase === 'go' && !st.drag) { const [tx, ty] = P(st.tx, st.ty); g.strokeStyle = '#ffffff40'; g.beginPath(); g.arc(tx, ty, 6, 0, 7); g.stroke(); }
    };
    const stop = () => cancelAnimationFrame(raf);
    loopStop = stop; raf = requestAnimationFrame(step);
    const key = (e) => { if (e.key === ' ' && root && cur.lv === lv) { e.preventDefault(); grip(); } };
    addEventListener('keydown', key); const old = loopStop; loopStop = () => { old(); removeEventListener('keydown', key); };
    E._teleop = { st: () => st, grip, zone: ZONE, table: TABLE };   // 给自动测试用
    renderDemos(); msg(lv.prompt); act([['夹紧 / 松开（空格）', grip, 'primary'], ['重来这一条', () => { if (st.phase !== 'end') { reset(); draw2(); msg('重来。'); } }, 'ghost']]);
  }

  // ---------- 结算 ----------
  function resultStep() {
    steps(); const lv = cur.lv, t = cur.mis + cur.hint, stars = cur.ans ? 1 : t === 0 ? 3 : t <= 2 ? 2 : 1, prev = starsOf(lv.id), s = lv.stage;
    const firstStage = s.levels.every((l) => l === lv || starsOf(l.id) > 0) && !prev;
    if (stars > prev) sv().lv[lv.id] = stars;
    const toast0 = CF.toast, got = []; CF.toast = (m) => got.push(m);   // 奖励写进结算卡，不用浮动提示盖住星星（UI 宪法第 26 章「不遮挡」）
    try {
    if (!prev) CF.P.addXP({ type: 'p', amt: 10 + s.no * 4 + stars * 3, dims: { zhi: 0.5, ti: 0.2 }, domain: 'emb', label: '具身智能 ' + lv.id });
    else if (stars > prev) CF.P.addXP({ type: 'p', amt: (stars - prev) * 4, dims: { zhi: 0.5 }, domain: 'emb', label: '具身智能 ' + lv.id });
    if (firstStage) { const avg = Math.round(s.levels.reduce((a, l) => a + starsOf(l.id), 0) / s.levels.length); CF.P.finishLab('emb', Math.max(1, avg)); got.unshift(`${s.no ? '阶段' + CN[s.no] : '序章'}「${s.name}」全部完成！拾光号又往前走了一步`); }
    } finally { CF.toast = toast0; }
    CF.Save.save();
    const L = LEVELS(), nx = L[L.indexOf(lv) + 1];
    body.innerHTML = `<div class="emb-result"><div class="emb-rstars">${'<i class="on">★</i>'.repeat(stars)}${'<i>★</i>'.repeat(3 - stars)}</div><h3>${lv.id} ${esc(lv.name)} · 通关</h3><p class="small muted">失误 ${cur.mis} 次 · 提示 ${cur.hint} 次${cur.ans ? ' · 看了答案' : ''}${prev && stars <= prev ? ` · 最好成绩 ${prev} 星` : ''}</p>${got.length ? `<div class="emb-gain">${got.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="emb-recap"><b>这一关你学会了</b>${lv.learn.map((c) => `<p>· ${c[0]}</p>`).join('')}</div>${lv.after && lv.kind !== 'tune' ? `<div class="emb-recap"><b>想一想</b><p>${lv.after}</p></div>` : ''}<canvas class="emb-rrobot" width="160" height="160"></canvas></div>`;
    drawRobot(body.querySelector('.emb-rrobot')); msg(stars === 3 ? '完美通关！' : '通关了！想拿 3 星可以再来一次。', 'good');
    act([['再来一次', () => E.play(lv.id), 'ghost'], ['返回阶段', () => { view = { tab: s.id, play: null }; render(); }, 'ghost']].concat(nx ? [[`下一关：${nx.id} →`, () => E.play(nx.id), 'primary']] : []));
  }

  // ================= 拾光号（进度画）：虚线 = 还在图纸上，实线 = 已经造出来 =================
  function drawRobot(c) {
    if (!c) return; const g = c.getContext('2d'), W = c.width, Hh = c.height, k = W / 48, has = (id) => starsOf(id) > 0;
    g.clearRect(0, 0, W, Hh); g.fillStyle = '#0d1530'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#4ef0ff14'; for (let i = 0; i <= 48; i += 4) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, Hh); g.stroke(); g.beginPath(); g.moveTo(0, i * k); g.lineTo(W, i * k); g.stroke(); }
    const part = (on, x, y, w, h, col) => { if (on) { g.fillStyle = col; g.fillRect(x * k, y * k, w * k, h * k); } else { g.setLineDash([3, 3]); g.strokeStyle = '#4ef0ff88'; g.strokeRect(x * k + 0.5, y * k + 0.5, w * k - 1, h * k - 1); g.setLineDash([]); } };
    part(has('2-1'), 8, 38, 7, 7, '#2b2641'); part(has('2-1'), 30, 38, 7, 7, '#2b2641');            // 轮子
    part(has('2-6'), 6, 30, 33, 9, '#6c6680');                                                         // 底盘
    part(has('2-4'), 9, 32, 10, 5, '#e9b949');                                                         // 电池
    part(has('2-6'), 20, 14, 4, 16, '#9d96ad');                                                        // 立柱
    part(has('2-6'), 24, 15, 10, 3, '#9b7bff'); part(has('2-6'), 33, 15, 3, 9, '#9b7bff');           // 上臂、前臂
    part(has('2-2'), 23, 14, 3, 3, '#ede6d6'); part(has('2-2'), 32, 14, 3, 3, '#ede6d6'); part(has('2-2'), 33, 23, 3, 3, '#ede6d6'); // 关节模组
    part(has('2-6'), 32, 26, 1, 3, '#ede6d6'); part(has('2-6'), 36, 26, 1, 3, '#ede6d6');            // 夹爪
    part(has('2-5'), 16, 6, 12, 7, '#2b2641'); part(has('2-5'), 19, 4, 6, 2, '#3fd0c9');             // 头部（相机 + 雷达）
    if (has('2-7')) { g.fillStyle = '#6fdc8c'; g.fillRect(34 * k, 32 * k, 2 * k, 2 * k); }            // 固件：状态灯
    if (has('3-2')) { g.strokeStyle = '#9b7bffaa'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(22 * k, 13 * k); g.lineTo(22 * k, 30 * k); g.moveTo(22 * k, 16 * k); g.lineTo(33 * k, 16 * k); g.stroke(); g.setLineDash([]); }
    if (has('3-5')) { g.fillStyle = '#ffe08a'; g.fillRect(15 * k, 8 * k, 1 * k, 3 * k); g.fillRect(28 * k, 8 * k, 1 * k, 3 * k); }   // 耳朵：麦克风
    if (has('4-5')) { g.fillStyle = '#9b7bff55'; g.beginPath(); g.arc(22 * k, 9 * k, 9 * k, 0, 7); g.fill(); }                       // 大脑：VLA
    g.fillStyle = has('5-2') ? '#4ef0ff' : '#ffffff20'; g.fillRect(19 * k, 8 * k, 2 * k, 2 * k); g.fillRect(23 * k, 8 * k, 2 * k, 2 * k);   // 眼睛：部署后亮起
    if (has('6-4')) { g.fillStyle = '#4ef0ff'; g.fillRect(33 * k, 27 * k, 3 * k, 4 * k); g.fillStyle = '#ffd257'; [[40, 6], [43, 10], [38, 11]].forEach(([x, y]) => g.fillRect(x * k, y * k, k, k)); }
  }
})();
