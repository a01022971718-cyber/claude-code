/* 学院、实验室列表、成长档案、成就页面 */
(function () {
  const CF = window.CF;
  const C = () => CF.Content;
  const S = () => CF.Save.data;
  const A = (CF.Academy = { tab: 'daily' });

  // ---------- 配比条 ----------
  A.ratioHtml = function () {
    const r = CF.P.ratio(), k = Math.round(r.kPct * 100), p = 100 - k;
    return `<div class="ratio"><span class="c-corp">知识 ${r.t ? k : 0}%</span><div class="rbar"><i class="k" style="width:${r.t ? k : 30}%"></i><i class="p" style="width:${r.t ? p : 70}%"></i><b class="mark" title="目标 30%"></b></div><span style="color:var(--orange2)">实操 ${r.t ? p : 0}%</span></div><div class="small muted" style="margin-top:6px">${CF.P.suggestion().text}</div>`;
  };

  // ---------- 测验 ----------
  A.pickQuestions = function (domain, n) {
    const seen = S().quiz.seen;
    let pool = C().QUIZ.filter((q) => !domain || domain === 'all' || q.d === domain);
    if (domain === 'wrong') pool = C().QUIZ.filter((q) => seen[q.id] && seen[q.id].w > seen[q.id].c);
    const score = (q) => { const s = seen[q.id]; if (!s) return Math.random(); return 1 + s.c * 2 - s.w * 1.5 + Math.random() * 1.5 + (Date.now() - (s.last || 0) < 3600e3 ? 5 : 0); };
    return pool.map((q) => [score(q), q]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
  };
  A.quiz = function ({ domain = 'all', n = 5, onDone = null, title = '知识测验', inBattle = false } = {}) {
    const qs = A.pickQuestions(domain, n);
    if (!qs.length) { CF.toast('这个分类暂时没有题目（错题本是空的）'); return; }
    let i = 0, right = 0;
    const body = CF.modal.open({ title, closable: !inBattle, onClose: () => { if (inBattle && i < qs.length) onDone && onDone(right, qs.length); } });
    const render = () => {
      const q = qs[i];
      const order = CF.shuffle(q.o.map((t, k) => k));
      body.innerHTML = `<div class="row between small muted"><span>${C().DOMAINS[q.d].icon} ${C().DOMAINS[q.d].name}</span><span>${i + 1} / ${qs.length}</span></div><div class="quiz-q">${CF.esc(q.q)}</div><div class="quiz-opts"></div><div class="nextwrap"></div>`;
      const box = body.querySelector('.quiz-opts');
      order.forEach((k, idx) => {
        const b = CF.h(`<button class="quiz-opt"><span class="mono muted">${'ABCD'[idx]}.</span> ${CF.esc(q.o[k])}</button>`);
        b.onclick = () => {
          if (box.dataset.done) return; box.dataset.done = 1;
          const ok = k === q.a;
          if (ok) right++;
          CF.$$('.quiz-opt', box).forEach((el, j) => { if (order[j] === q.a) el.classList.add('right'); });
          if (!ok) b.classList.add('wrong');
          CF.Audio.sfx(ok ? 'correct' : 'wrong');
          CF.P.answerQuiz(q, ok);
          const nx = body.querySelector('.nextwrap');
          nx.innerHTML = `<div class="explain">${ok ? '✅ 正确！' : '❌ 正确答案已标出。'}<br>${CF.esc(q.e)}</div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary">${i + 1 < qs.length ? '下一题 →' : '完成'}</button></div>`;
          nx.querySelector('button').onclick = () => { CF.Audio.sfx('click'); i++; if (i < qs.length) render(); else finish(); };
        };
        box.appendChild(b);
      });
    };
    const finish = () => {
      if (onDone) { CF.modal.close(); onDone(right, qs.length); return; }
      body.innerHTML = `<div style="text-align:center;padding:20px"><div style="font-size:42px">${right === qs.length ? '🏆' : right >= qs.length / 2 ? '👍' : '📖'}</div><h3 style="margin:10px 0">答对 ${right} / ${qs.length}</h3><p class="muted small">知识是地图，实操是走路。记得按 3:7 去实验室或做线下任务。</p><div class="row" style="justify-content:center;margin-top:16px;gap:8px"><button class="btn" data-a="again">再来一组</button><button class="btn primary" data-a="lab">去实验室</button></div></div>`;
      body.querySelector('[data-a=again]').onclick = () => A.quiz({ domain, n });
      body.querySelector('[data-a=lab]').onclick = () => { CF.modal.close(); CF.UI.show('labs'); };
      CF.bus.emit('progress');
    };
    render();
  };

  // ---------- 线下任务打卡 ----------
  A.quest = function (q) {
    const doneToday = S().quests.log.some((l) => l.id === q.id && l.date === CF.today());
    const body = CF.h(`<div><p class="small muted">${C().DOMAINS[q.d] ? C().DOMAINS[q.d].icon + ' ' + C().DOMAINS[q.d].name : { de: '🤝 德', ti: '💪 体', mei: '🎸 美' }[q.d]} · +${q.xp} 实操经验</p><h3 style="margin:8px 0">${CF.esc(q.t)}</h3><p style="line-height:1.8">${CF.esc(q.how)}</p><div class="sec-title">实践记录</div><p class="small muted" style="margin-bottom:6px">${CF.esc(q.ev)}（至少 10 个字。这是写给你自己的证据，诚实最重要。）</p><textarea class="note" placeholder="写下你做了什么、结果如何、学到了什么……"></textarea></div>`);
    const ta = body.querySelector('textarea');
    CF.modal.open({ title: '线下实操任务', body, foot: [
      { text: '稍后再做', cls: 'ghost' },
      { text: doneToday ? '今天已打卡' : '✓ 完成打卡', cls: 'primary', onClick: () => {
        if (doneToday) { CF.toast('同一个任务每天打卡一次'); return; }
        const v = ta.value.trim();
        if (v.length < 10) { CF.toast('实践记录至少 10 个字', 'bad'); CF.Audio.sfx('error'); return; }
        CF.modal.close(); CF.Audio.sfx('levelup'); CF.P.finishQuest(q, v); A.render();
      } },
    ] });
  };

  // ---------- 企业家情景 ----------
  A.scenario = function (sc) {
    const prev = S().scenarios[sc.id];
    const body = CF.modal.open({ title: `💼 ${sc.who} · ${sc.year} · ${sc.title}` });
    const render = (chosen) => {
      body.innerHTML = `<p style="line-height:1.8;font-size:15px">${CF.esc(sc.ctx)}</p><div class="sec-title">你会怎么做？</div><div class="quiz-opts"></div><div class="res"></div>`;
      const box = body.querySelector('.quiz-opts');
      sc.opts.forEach((o, k) => {
        const b = CF.h(`<button class="quiz-opt">${CF.esc(o.t)}</button>`);
        if (chosen !== undefined) { if (k === chosen) b.classList.add(o.best ? 'right' : 'wrong'); else if (o.best) b.classList.add('right'); }
        b.onclick = () => { if (chosen !== undefined) return; CF.Audio.sfx(o.best ? 'correct' : 'chord'); CF.P.decideScenario(sc, k); render(k); };
        box.appendChild(b);
      });
      if (chosen !== undefined) {
        const o = sc.opts[chosen], best = sc.opts.find((x) => x.best);
        const fs = Object.keys(o.f || {}).map((k) => `${C().FOUNDER[k]} +${o.f[k]}`).join('　');
        body.querySelector('.res').innerHTML = `<div class="explain"><b>你的选择：</b>${CF.esc(o.r)}${fs ? `<br><span class="c-chip small">${fs}</span>` : ''}</div>` +
          (o.best ? '' : `<div class="explain" style="border-color:var(--good)"><b>历史/推荐选择：</b>${CF.esc(best.t)}<br>${CF.esc(best.r)}</div>`) +
          `<div class="explain" style="border-color:var(--orange)"><b>💡 启示：</b>${CF.esc(sc.lesson)}</div>`;
      }
    };
    render(prev);
  };

  // ---------- 学院主页面 ----------
  const TABS = [['daily', '今日修炼'], ['quiz', '知识测验'], ['quests', '线下任务'], ['founder', '企业家修炼'], ['road', '学习路线']];
  A.render = function () {
    const tabs = CF.$('#academyTabs');
    tabs.innerHTML = '';
    TABS.forEach(([id, n]) => { const b = CF.h(`<button class="tab ${A.tab === id ? 'on' : ''}">${n}</button>`); b.onclick = () => { CF.Audio.sfx('click'); A.tab = id; A.render(); }; tabs.appendChild(b); });
    const body = CF.$('#academyBody');
    body.innerHTML = '';
    body.appendChild(CF.h(`<div class="card" style="margin-bottom:14px">${A.ratioHtml()}</div>`));
    ({ daily: renderDaily, quiz: renderQuiz, quests: renderQuests, founder: renderFounder, road: renderRoad })[A.tab](body);
  };
  function taskRow(ic, title, desc, right, done, onClick) {
    const el = CF.h(`<div class="task ${done ? 'done' : ''}"><div class="ic">${ic}</div><div class="bd"><h4>${title}</h4><p>${desc}</p></div><div></div></div>`);
    if (right) { const b = CF.h(`<button class="btn sm ${done ? 'ghost' : 'primary'}">${right}</button>`); b.onclick = () => { CF.Audio.sfx('click'); onClick(); }; el.lastChild.appendChild(b); }
    return el;
  }
  function renderDaily(body) {
    const plan = CF.P.dailyPlan(), st = S().streak;
    body.appendChild(CF.h(`<div class="row between wrap" style="margin-bottom:10px"><div class="small muted">${CF.today()} · 连续学习 <b class="c-chip">${st.count}</b> 天（最佳 ${st.best || 0}）</div><div class="small muted">完成全部 → 下场战斗起始算力 +50</div></div>`));
    plan.items.forEach((it) => {
      const done = plan.done.includes(it.kind + ':' + it.id);
      const tag = it.type === 'k' ? '<span class="pill k">知识</span>' : '<span class="pill p">实操</span>';
      if (it.kind === 'quiz') body.appendChild(taskRow('📚', `${tag} 知识小测 · 3 题`, '优先出你没见过或答错过的题。', done ? '再来' : '开始', done, () => A.quiz({ n: 3, title: '今日小测', onDone: (r, n) => { CF.P.markDaily('quiz', 'daily'); CF.toast(`答对 ${r}/${n}`); A.render(); } })));
      if (it.kind === 'lab') { const m = CF.Labs.META[it.id]; body.appendChild(taskRow(m.icon, `${tag} 实验室 · ${m.name}`, m.desc, done ? '再玩' : '开始', done, () => CF.Labs.open(it.id))); }
      if (it.kind === 'quest') { const q = C().QUESTS.find((x) => x.id === it.id); body.appendChild(taskRow({ ai: '🧠', emb: '🤖', aero: '🚀', biz: '💼', de: '🤝', ti: '💪', mei: '🎸' }[q.d], `${tag} ${it.label === '线下实操' ? '线下实操' : it.label} · ${CF.esc(q.t)}`, CF.esc(q.how), done ? '已打卡' : '去做', done, () => A.quest(q))); }
      if (it.kind === 'scenario') { const sc = C().SCENARIOS.find((x) => x.id === it.id); body.appendChild(taskRow('💡', `${tag} 企业家修炼 · ${sc.who}：${CF.esc(sc.title)}`, CF.esc(sc.ctx.slice(0, 60)) + '…', done ? '回顾' : '决策', done, () => A.scenario(sc))); }
    });
    body.appendChild(CF.h('<p class="small muted" style="margin-top:12px;line-height:1.7">💡 游戏能帮你把大目标拆成每天能完成的小步并给你反馈，但真正的成长发生在线下：写代码、做实验、运动、和人交流。每个线下任务都需要写实践记录——这是你自己的成长证据。</p>'));
  }
  function renderQuiz(body) {
    const q = S().quiz, tot = q.correct + q.wrong;
    body.appendChild(CF.h(`<div class="small muted" style="margin-bottom:10px">累计答题 ${tot} · 正确率 ${tot ? Math.round((q.correct / tot) * 100) : 0}% · 题库 ${C().QUIZ.length} 题</div>`));
    const g = CF.h('<div class="grid g3"></div>');
    const opts = [['all', '🎲', '混合', '所有领域随机 5 题'], ['ai', '🧠', 'AI', '机器学习、深度学习、大模型、Agent'], ['emb', '🤖', '具身智能', '控制、感知、规划、机器人系统'], ['aero', '🚀', '航空航天', '轨道、火箭、飞行原理'], ['biz', '💼', '企业家', '第一性原理、商业、三位企业家的关键决策'], ['whole', '🌱', '德智体美', '学习方法、伦理、审美与健康'], ['wrong', '📕', '错题本', '答错次数多于答对的题']];
    opts.forEach(([id, ic, n, d]) => {
      const cnt = id === 'all' ? C().QUIZ.length : id === 'wrong' ? C().QUIZ.filter((x) => q.seen[x.id] && q.seen[x.id].w > q.seen[x.id].c).length : C().QUIZ.filter((x) => x.d === id).length;
      const el = CF.h(`<div class="card labcard"><div style="font-size:24px">${ic}</div><h3>${n} <span class="tag">${cnt} 题</span></h3><p>${d}</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); A.quiz({ domain: id, n: 5, title: n + ' · 测验' }); };
      g.appendChild(el);
    });
    body.appendChild(g);
  }
  function renderQuests(body) {
    const groups = [['ai', '🧠 AI'], ['emb', '🤖 具身智能'], ['aero', '🚀 航空航天'], ['biz', '💼 企业家'], ['de', '🤝 德'], ['ti', '💪 体'], ['mei', '🎸 美']];
    groups.forEach(([d, n]) => {
      body.appendChild(CF.h(`<div class="sec-title">${n}</div>`));
      C().QUESTS.filter((q) => q.d === d).forEach((q) => {
        const times = S().quests.log.filter((l) => l.id === q.id).length;
        const today = S().quests.log.some((l) => l.id === q.id && l.date === CF.today());
        body.appendChild(taskRow('◇', `${CF.esc(q.t)} <span class="tag">+${q.xp}${times ? ' · 已完成 ' + times + ' 次' : ''}</span>`, CF.esc(q.how), today ? '今日已打卡' : '打卡', today, () => A.quest(q)));
      });
    });
  }
  function renderFounder(body) {
    const f = S().founder;
    const fb = CF.h('<div class="card" style="margin-bottom:12px"><h3>创始人属性</h3><div class="grid g3" style="margin-top:8px"></div></div>');
    Object.keys(C().FOUNDER).forEach((k) => fb.querySelector('.grid').appendChild(CF.h(`<div><div class="row between small"><span>${C().FOUNDER[k]}</span><b class="mono">${f[k] || 0}</b></div><div class="bar"><i style="width:${Math.min(100, (f[k] || 0) * 10)}%"></i></div></div>`)));
    body.appendChild(fb);
    body.appendChild(CF.h('<p class="small muted" style="margin-bottom:10px">每个情景都取材于真实经历或常见创业困境。先凭直觉选，再看历史与启示。选择记录会保存，可随时回顾。</p>'));
    const g = CF.h('<div class="grid g2"></div>');
    C().SCENARIOS.forEach((sc) => {
      const done = S().scenarios[sc.id] !== undefined;
      const el = CF.h(`<div class="card labcard"><div class="dom">${sc.who} · ${sc.year}</div><h3>${CF.esc(sc.title)} ${done ? '<span class="c-chip">✓</span>' : ''}</h3><p>${CF.esc(sc.ctx.slice(0, 70))}…</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); A.scenario(sc); };
      g.appendChild(el);
    });
    body.appendChild(g);
  }
  function renderRoad(body) {
    body.appendChild(CF.h('<p class="small muted" style="margin-bottom:14px;line-height:1.7">这是一条从高中毕业到「AI × 具身 × 航天」复合型人才的参考路线，时间是全力投入时的粗略估计。每个里程碑都是真实世界的实践：完成后勾选并写一句证明（首次 +25 实操经验）。</p>'));
    C().ROAD.forEach((st) => {
      const el = CF.h(`<div class="road-stage"><h4>${st.title}</h4></div>`);
      st.items.forEach(([id, t]) => {
        const on = !!S().roadmap[id];
        const c = CF.h(`<label class="check ${on ? 'on' : ''}"><input type="checkbox" ${on ? 'checked' : ''}><span>${CF.esc(t)}${on ? ` <span class="tag">· ${S().roadmap[id]}</span>` : ''}</span></label>`);
        c.querySelector('input').onchange = (e) => {
          if (!e.target.checked) { S().roadmap[id] = null; CF.Save.save(); A.render(); return; }
          e.target.checked = false;
          const b = CF.h(`<div><p style="margin-bottom:8px">${CF.esc(t)}</p><textarea class="note" placeholder="一句话证明：链接、成果、或你做到了什么"></textarea></div>`);
          CF.modal.open({ title: '完成里程碑', body: b, foot: [{ text: '取消', cls: 'ghost' }, { text: '确认完成', cls: 'primary', onClick: () => {
            const v = b.querySelector('textarea').value.trim();
            if (v.length < 4) { CF.toast('写一句证明吧', 'bad'); return; }
            const first = !(S().roadmap['_xp_' + id]);
            S().roadmap[id] = CF.today(); S().roadmap['_xp_' + id] = 1;
            S().quests.log.unshift({ id, d: 'road', t: '里程碑：' + t, note: v, date: CF.today() });
            CF.modal.close();
            if (first) CF.P.addXP({ type: 'p', amt: 25, dims: { shi: 1, zhi: 0.4 }, label: '里程碑' }); else CF.Save.save();
            A.render();
          } }] });
        };
        el.appendChild(c);
      });
      body.appendChild(el);
    });
  }

  // ---------- 实验室列表 ----------
  A.renderLabs = function () {
    const body = CF.$('#labsBody');
    body.innerHTML = '';
    body.appendChild(CF.h(`<div class="card" style="margin-bottom:14px">${A.ratioHtml()}</div>`));
    const g = CF.h('<div class="grid g3"></div>');
    CF.Labs.ORDER.forEach((id) => {
      const m = CF.Labs.META[id], st = CF.P.labStars(id), done = CF.P.labDone(id);
      const unlock = { gd: '第 2 关', perceptron: '雷达站 · 第 2 关', pid: '无人机空港 · 第 4 关', robot: '第 3 关', rocket: '第 4 关', startup: '第 5 关', code: 'Agent 工坊（完成 1 个）', pixel: '通讯头像' }[id];
      const el = CF.h(`<div class="card labcard"><div class="st">${done ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''}</div><div style="font-size:28px">${m.icon}</div><div class="dom">${m.d ? C().DOMAINS[m.d].name : '美'}${id === 'code' ? ` · ${CF.P.codeDone()}/10` : ''}</div><h3>${m.name}</h3><p>${m.desc}</p><p class="small" style="margin-top:6px;color:var(--plight)">🔓 关联解锁：${unlock}</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); CF.Labs.open(id); };
      g.appendChild(el);
    });
    body.appendChild(g);
  };

  // ---------- 成长档案 ----------
  function radar(cv, vals, labels) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) / 2 - 30, n = vals.length;
    const max = Math.max(50, ...vals) * 1.1;
    const pt = (i, r) => [cx + Math.sin((i / n) * Math.PI * 2) * r, cy - Math.cos((i / n) * Math.PI * 2) * r];
    ctx.strokeStyle = '#2b2641';
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, (R * k) / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    for (let i = 0; i < n; i++) { const [x, y] = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(155,123,255,0.28)'; ctx.strokeStyle = '#9b7bff'; ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach((v, i) => { const [x, y] = pt(i, (R * v) / max); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#ede6d6'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    labels.forEach((l, i) => { const [x, y] = pt(i, R + 16); ctx.fillText(`${l} ${Math.round(vals[i])}`, x, y + 4); });
    ctx.textAlign = 'left';
  }
  A.renderProfile = function () {
    const body = CF.$('#profileBody'), d = S(), rk = CF.P.rank(), r = CF.P.ratio();
    const tot = d.quiz.correct + d.quiz.wrong;
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">军衔</div><div class="v" style="color:var(--gold);font-size:20px">${rk.name}</div><div class="bar" style="margin-top:6px"><i style="width:${rk.prog * 100}%;background:var(--gold)"></i></div><div class="l" style="margin-top:4px">${rk.next ? `距「${rk.nextName}」还差 ${rk.next - rk.xp}` : '已达最高军衔'}</div></div>
        <div class="kpi"><div class="l">总经验</div><div class="v">${rk.xp}</div><div class="l">知识 ${r.k} · 实操 ${r.p}</div></div>
        <div class="kpi"><div class="l">连续学习</div><div class="v">${d.streak.count}<span class="small"> 天</span></div><div class="l">最佳 ${d.streak.best || 0} 天</div></div>
        <div class="kpi"><div class="l">实验完成</div><div class="v">${CF.P.labsDoneCount()}<span class="small">/8</span></div><div class="l">代码挑战 ${CF.P.codeDone()}/10</div></div>
        <div class="kpi"><div class="l">线下实操</div><div class="v">${CF.P.questCount()}</div><div class="l">情景决策 ${CF.P.scenarioCount()}/${C().SCENARIOS.length}</div></div>
        <div class="kpi"><div class="l">答题正确率</div><div class="v">${tot ? Math.round((d.quiz.correct / tot) * 100) : 0}%</div><div class="l">共 ${tot} 题</div></div>
      </div>
      <div class="card" style="margin-top:12px">${A.ratioHtml()}</div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>成长雷达</h3><canvas id="radarCv" style="width:100%;height:280px"></canvas></div>
        <div class="card"><h3>领域熟练度</h3><div id="domBars"></div><h3 style="margin-top:14px">创始人属性</h3><div id="fBars"></div></div>
      </div>
      <div class="sec-title">实践日志（你的成长证据）</div><div id="journal"></div>
      <div class="sec-title">存档</div>
      <div class="row wrap"><button class="btn" id="expBtn">导出存档</button><button class="btn" id="impBtn">导入存档</button><span class="small muted">存档保存在本浏览器。换设备或清理浏览器前请先导出。</span></div>`;
    const dims = ['de', 'zhi', 'ti', 'mei', 'shi', 'qi'];
    setTimeout(() => radar(CF.$('#radarCv'), dims.map((k) => d.dims[k] || 0), dims.map((k) => C().DIMS[k])), 20);
    const maxD = Math.max(100, ...Object.values(d.domains));
    CF.$('#domBars').innerHTML = ['ai', 'emb', 'aero', 'biz'].map((k) => `<div style="margin:8px 0"><div class="row between small"><span>${C().DOMAINS[k].icon} ${C().DOMAINS[k].name}</span><b class="mono">${d.domains[k]}</b></div><div class="bar"><i style="width:${(d.domains[k] / maxD) * 100}%;background:${C().DOMAINS[k].color}"></i></div></div>`).join('');
    CF.$('#fBars').innerHTML = Object.keys(C().FOUNDER).map((k) => `<div style="margin:6px 0"><div class="row between small"><span>${C().FOUNDER[k]}</span><b class="mono">${d.founder[k] || 0}</b></div><div class="bar"><i style="width:${Math.min(100, (d.founder[k] || 0) * 10)}%"></i></div></div>`).join('');
    const j = CF.$('#journal');
    j.innerHTML = d.quests.log.length ? d.quests.log.slice(0, 30).map((l) => `<div class="journal-item"><div class="d">${l.date} · ${CF.esc(l.t)}</div><div class="small">${CF.esc(l.note)}</div></div>`).join('') : '<p class="small muted">还没有记录。去学院完成一个线下任务吧。</p>';
    CF.$('#expBtn').onclick = () => {
      const txt = CF.Save.exportText();
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = `claude-frontline-save-${CF.today()}.json`; a.click(); } catch (e) {}
      const b = CF.h('<div><p class="small muted" style="margin-bottom:6px">如果没有自动下载，复制下面的内容保存好：</p><textarea class="note" style="min-height:200px;font-family:var(--mono);font-size:11px"></textarea></div>');
      b.querySelector('textarea').value = txt;
      CF.modal.open({ title: '导出存档', body: b });
    };
    CF.$('#impBtn').onclick = () => {
      const b = CF.h('<div><p class="small muted" style="margin-bottom:6px">粘贴存档内容，或选择存档文件：</p><input type="file" accept=".json,application/json" style="margin-bottom:8px"><textarea class="note" style="min-height:160px;font-family:var(--mono);font-size:11px"></textarea></div>');
      b.querySelector('input').onchange = async (e) => { const f = e.target.files[0]; if (f) b.querySelector('textarea').value = await f.text(); };
      CF.modal.open({ title: '导入存档', body: b, foot: [{ text: '取消', cls: 'ghost' }, { text: '导入（覆盖当前进度）', cls: 'primary', onClick: () => { try { CF.Save.importText(b.querySelector('textarea').value); CF.modal.close(); CF.toast('导入成功', 'good'); A.renderProfile(); } catch (e) { CF.toast('导入失败：' + e.message, 'bad'); } } }] });
    };
  };

  // ---------- 成就 ----------
  A.renderAch = function () {
    const body = CF.$('#achBody'), got = S().achievements;
    const n = CF.P.ACH.filter((a) => got[a.id]).length;
    body.innerHTML = `<p class="small muted" style="margin-bottom:12px">已解锁 ${n} / ${CF.P.ACH.length}</p>`;
    const g = CF.h('<div class="grid g3"></div>');
    CF.P.ACH.forEach((a) => g.appendChild(CF.h(`<div class="card ach ${got[a.id] ? 'got' : ''}"><div class="ic">${a.icon}</div><div><h4>${a.name}</h4><p>${a.desc}${got[a.id] ? ` · <span class="c-chip">${got[a.id]}</span>` : ''}</p></div></div>`)));
    body.appendChild(g);
  };
})();
