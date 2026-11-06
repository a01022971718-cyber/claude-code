/* 实验室：8 个可交互的实操实验 */
(function () {
  const CF = window.CF;
  const META = {
    gd: { name: '梯度下降', d: 'ai', icon: '📉', desc: '亲手训练一条直线：感受学习率太小、刚好、太大的区别。', dims: { zhi: 0.5 } },
    perceptron: { name: '感知机', d: 'ai', icon: '🧠', desc: '调权重把「乱码」和「信号」分开，理解一个神经元在做什么。', dims: { zhi: 0.5 } },
    pid: { name: 'PID 无人机', d: 'emb', icon: '🚁', desc: '调 Kp/Ki/Kd 让载重无人机稳稳悬停在 10 米，还要扛住一阵下压风。', dims: { zhi: 0.4 } },
    robot: { name: '机器人编程', d: 'emb', icon: '🤖', desc: '用指令编程让机器人绕开障碍拿到电池，挑战最少指令数。', dims: { zhi: 0.4 } },
    rocket: { name: '火箭方程', d: 'aero', icon: '🚀', desc: '设计两级火箭把 5 吨卫星送入近地轨道，越轻越好。', dims: { zhi: 0.5 } },
    startup: { name: '创业沙盘', d: 'biz', icon: '💼', desc: '经营一家 AI 初创公司 12 个月：定价、营销、招聘、融资。', dims: { qi: 1 } },
    code: { name: '代码挑战', d: 'ai', icon: '⌨️', desc: '在浏览器里写真代码：ReLU、Softmax、PID、火箭方程……完成 3 个即通关。', dims: { zhi: 0.5 } },
    pixel: { name: '像素工坊', d: null, icon: '🎨', desc: '16 / 64 / 256 / 无限画布，造月 24 / 64 色；画头像、英雄外观、技能特效，也能把照片换成造月色。', dims: { mei: 1 } },
  };
  const ORDER = ['gd', 'perceptron', 'pid', 'robot', 'rocket', 'startup', 'code', 'pixel'];
  const L = (CF.Labs = { META, ORDER });

  // ---------- 通用外壳 ----------
  function shell(id, introHtml) {
    const m = META[id];
    const body = CF.h(`<div class="lab"><div class="lab-msg">${introHtml}</div><div class="lab-main"><div class="lab-cv"><canvas></canvas></div><div class="lab-side"></div></div></div>`);
    let ro = null;
    CF.modal.open({ title: `${m.icon} 实验室 · ${m.name}`, body, wide: true, onClose: () => { if (ro) ro.disconnect(); CF.bus.emit('lab:closed'); } });
    const cv = body.querySelector('canvas'), box = body.querySelector('.lab-cv'), side = body.querySelector('.lab-side');
    const msgEl = CF.h('<div class="lab-msg">准备就绪。</div>');
    const ref = {
      body, cv, side, ctx: cv.getContext('2d'), w: 0, h: 0, draw: () => {},
      fit() { const dpr = Math.min(2, window.devicePixelRatio || 1); ref.w = box.clientWidth; ref.h = box.clientHeight; cv.width = Math.max(1, ref.w * dpr); cv.height = Math.max(1, ref.h * dpr); ref.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
      msg(html, cls = '') { msgEl.className = 'lab-msg ' + cls; msgEl.innerHTML = html; },
      msgEl,
    };
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { ref.fit(); ref.draw(); }); ro.observe(box); }
    setTimeout(() => { ref.fit(); ref.draw(); }, 30);
    return ref;
  }
  function slider(label, min, max, step, val, fmt, on) {
    const el = CF.h(`<label class="slider"><div class="row"><span>${label}</span><b></b></div><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"></label>`);
    const inp = el.querySelector('input'), b = el.querySelector('b');
    const upd = () => { b.textContent = fmt(+inp.value); };
    inp.addEventListener('input', () => { upd(); on(+inp.value); });
    upd();
    el.set = (v) => { inp.value = v; upd(); };
    return el;
  }
  function btn(text, cls, on) { const b = CF.h(`<button class="btn ${cls || ''}">${text}</button>`); b.onclick = () => { CF.Audio.sfx('click'); on(b); }; return b; }
  function row(...els) { const r = CF.h('<div class="row wrap"></div>'); els.forEach((e) => r.appendChild(e)); return r; }
  const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  function plotFrame(ctx, x, y, w, h, title) {
    ctx.strokeStyle = '#2b2641'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#9d96ad'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(title, x + 6, y + 14);
  }

  // =================== 1. 梯度下降 ===================
  L.gd = function () {
    const rnd = CF.rng(42), xs = [], ys = [];
    for (let i = 0; i < 14; i++) { const x = -3 + (6 * i) / 13; xs.push(x); ys.push(1.5 * x + 2 + (rnd() - 0.5) * 1.6); }
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    const wStar = sxy / sxx, bStar = my - wStar * mx;
    const loss = (w, b) => xs.reduce((s, x, i) => s + (w * x + b - ys[i]) ** 2, 0) / n;
    const minL = loss(wStar, bStar), goal = minL + 0.05;
    const S = { w: -1, b: -1, lr: 0.05, steps: 0, hist: [], touched: false, done: false };
    S.hist.push(loss(S.w, S.b));
    const R = shell('gd', '<b>目标：</b>用梯度下降把损失（MSE）降到 <span class="mono">' + goal.toFixed(2) + '</span> 以下。<br>先拖 w、b 感受「损失地形」，然后点「重置」，只调<b>学习率</b>再训练。步数越少星越多——学习率太大会发散。');
    const wS = slider('w（斜率）', -3, 5, 0.05, S.w, (v) => v.toFixed(2), (v) => { S.w = v; S.touched = true; S.hist.push(loss(S.w, S.b)); R.draw(); info(); });
    const bS = slider('b（截距）', -4, 6, 0.05, S.b, (v) => v.toFixed(2), (v) => { S.b = v; S.touched = true; S.hist.push(loss(S.w, S.b)); R.draw(); info(); });
    const lrS = slider('学习率 η', 0.01, 0.4, 0.01, S.lr, (v) => v.toFixed(2), (v) => { S.lr = v; });
    const kpi = CF.h('<div class="lab-msg mono small"></div>');
    function step() {
      if (S.done) return;
      let gw = 0, gb = 0;
      xs.forEach((x, i) => { const e = S.w * x + S.b - ys[i]; gw += (2 / n) * e * x; gb += (2 / n) * e; });
      S.w -= S.lr * gw; S.b -= S.lr * gb; S.steps++;
      const L0 = loss(S.w, S.b);
      S.hist.push(L0);
      wS.set(CF.clamp(S.w, -3, 5)); bS.set(CF.clamp(S.b, -4, 6));
      if (!isFinite(L0) || L0 > 1e4) { R.msg('💥 <b>发散了！</b>学习率太大，每一步都跨过了谷底并越跳越远。点「重置」换个更小的学习率。', 'bad'); S.done = true; CF.Audio.sfx('wrong'); }
      else if (L0 <= goal) {
        S.done = true;
        if (S.touched) { R.msg('达到目标！但你手动拖过 w/b——点「重置」后只用梯度下降再来一次才算数。'); return; }
        const stars = S.steps <= 6 ? 3 : S.steps <= 15 ? 2 : 1;
        R.msg(`✅ 用 <b>${S.steps}</b> 步收敛，${starStr(stars)}<br>学习率 ${S.lr.toFixed(2)}。最优学习率附近收敛最快；超过约 0.30 就会发散。这就是训练大模型时调「学习率」的意义。`, 'ok');
        CF.Audio.sfx('correct');
        CF.P.finishLab('gd', stars);
      }
    }
    function info() { kpi.innerHTML = `损失 ${S.hist[S.hist.length - 1].toFixed(3)}　目标 ≤ ${goal.toFixed(2)}<br>步数 ${S.steps}　w=${S.w.toFixed(2)} b=${S.b.toFixed(2)}`; }
    let timer = null;
    R.side.append(wS, bS, lrS,
      row(btn('单步', '', () => { step(); R.draw(); info(); }), btn('训练 ▶', 'primary', () => { clearInterval(timer); let k = 0; timer = setInterval(() => { if (S.done || k++ > 60) return clearInterval(timer); step(); R.draw(); info(); }, 120); }), btn('重置', 'ghost', () => { clearInterval(timer); Object.assign(S, { w: -1, b: -1, steps: 0, hist: [loss(-1, -1)], touched: false, done: false }); wS.set(-1); bS.set(-1); R.msg('已重置。只调学习率，然后训练。'); R.draw(); info(); })),
      kpi, R.msgEl);
    info();
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const pw = w * 0.58, ph = h - 16;
      plotFrame(ctx, 8, 8, pw - 12, ph, '数据与拟合直线');
      const X = (x) => 8 + ((x + 3.5) / 7) * (pw - 12), Y = (y) => 8 + ph - ((y + 4) / 12) * ph;
      ctx.strokeStyle = '#2b2641'; ctx.beginPath(); ctx.moveTo(X(-3.5), Y(0)); ctx.lineTo(X(3.5), Y(0)); ctx.moveTo(X(0), Y(-4)); ctx.lineTo(X(0), Y(8)); ctx.stroke();
      xs.forEach((x, i) => { ctx.fillStyle = '#3fd0c9'; ctx.fillRect(X(x) - 3, Y(ys[i]) - 3, 6, 6); ctx.strokeStyle = '#ff4f9a55'; ctx.beginPath(); ctx.moveTo(X(x), Y(ys[i])); ctx.lineTo(X(x), Y(S.w * x + S.b)); ctx.stroke(); });
      ctx.strokeStyle = '#d97757'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(-3.5), Y(S.w * -3.5 + S.b)); ctx.lineTo(X(3.5), Y(S.w * 3.5 + S.b)); ctx.stroke(); ctx.lineWidth = 1;
      const lx = pw + 4, lw = w - pw - 12;
      plotFrame(ctx, lx, 8, lw, ph, '损失曲线（对数）');
      const hs = S.hist.slice(-80), lmax = Math.log10(Math.max(...hs.filter(isFinite), 1) + 1), lmin = Math.log10(minL);
      const LY = (v) => 8 + 20 + (1 - (Math.log10(Math.max(v, minL)) - lmin) / Math.max(0.01, lmax - lmin)) * (ph - 30);
      ctx.strokeStyle = '#6fdc8c88'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(lx, LY(goal)); ctx.lineTo(lx + lw, LY(goal)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 2; ctx.beginPath();
      hs.forEach((v, i) => { const px = lx + 6 + (i / Math.max(1, hs.length - 1)) * (lw - 12), py = LY(isFinite(v) ? Math.min(v, 1e4) : 1e4); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.lineWidth = 1;
    };
  };

  // =================== 2. 感知机 ===================
  L.perceptron = function () {
    const rnd = CF.rng(7), pts = [];
    while (pts.length < 24) {
      const lab = pts.length % 2 ? 1 : -1, cx = lab > 0 ? 1.2 : -1.1, cy = lab > 0 ? 0.9 : -0.9;
      const x = cx + (rnd() - 0.5) * 2.2, y = cy + (rnd() - 0.5) * 2.2;
      if ((x + y - 0.05) * lab > 0.35) pts.push({ x, y, l: lab });
    }
    const S = { w1: 0.6, w2: -1.2, b: 0.6, auto: 0, done: false };
    const R = shell('perceptron', '<b>感知机 = 最简单的神经元：</b>输出 = sign(w₁·x + w₂·y + b)。<br>橙色方块是我方「信号」，粉色是「乱码」。调三个参数让分界线把它们完全分开（准确率 100%）。纯手动完成得 3 星。');
    const acc = () => pts.filter((p) => Math.sign(S.w1 * p.x + S.w2 * p.y + S.b) === p.l).length / pts.length;
    const kpi = CF.h('<div class="lab-msg mono small"></div>');
    const check = () => {
      const a = acc();
      kpi.innerHTML = `准确率 ${(a * 100).toFixed(0)}%　自动训练轮数 ${S.auto}`;
      if (a === 1 && !S.done) {
        S.done = true;
        const stars = S.auto === 0 ? 3 : S.auto <= 2 ? 2 : 1;
        R.msg(`✅ 全部分对！${starStr(stars)}<br>你刚才做的就是神经网络训练的本质：找到一组权重让预测与标签一致。现代网络有数十亿个这样的权重，由梯度下降自动调整。`, 'ok');
        CF.Audio.sfx('correct'); CF.P.finishLab('perceptron', stars);
      }
    };
    const s1 = slider('w₁', -3, 3, 0.1, S.w1, (v) => v.toFixed(1), (v) => { S.w1 = v; R.draw(); check(); });
    const s2 = slider('w₂', -3, 3, 0.1, S.w2, (v) => v.toFixed(1), (v) => { S.w2 = v; R.draw(); check(); });
    const s3 = slider('b（偏置）', -3, 3, 0.1, S.b, (v) => v.toFixed(1), (v) => { S.b = v; R.draw(); check(); });
    R.side.append(s1, s2, s3, row(btn('自动训练 1 轮', '', () => {
      S.auto++;
      pts.forEach((p) => { const o = Math.sign(S.w1 * p.x + S.w2 * p.y + S.b) || 1; if (o !== p.l) { S.w1 += 0.3 * p.l * p.x; S.w2 += 0.3 * p.l * p.y; S.b += 0.3 * p.l; } });
      S.w1 = CF.clamp(S.w1, -3, 3); S.w2 = CF.clamp(S.w2, -3, 3); S.b = CF.clamp(S.b, -3, 3);
      s1.set(S.w1); s2.set(S.w2); s3.set(S.b);
      R.msg('感知机学习规则：对每个分错的点，w ← w + η·标签·输入。错了就往正确方向挪一点。');
      R.draw(); check();
    })), kpi, R.msgEl);
    check();
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const sz = Math.min(w, h) - 16, ox = (w - sz) / 2, oy = 8;
      const X = (x) => ox + ((x + 3) / 6) * sz, Y = (y) => oy + sz - ((y + 3) / 6) * sz;
      const cell = sz / 30;
      for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
        const x = -3 + (i + 0.5) / 5, y = 3 - (j + 0.5) / 5, v = S.w1 * x + S.w2 * y + S.b;
        ctx.fillStyle = v > 0 ? 'rgba(217,119,87,0.13)' : 'rgba(255,79,154,0.10)';
        ctx.fillRect(ox + i * cell, oy + j * cell, cell - 1, cell - 1);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      if (Math.abs(S.w2) > 1e-3) { ctx.moveTo(X(-3), Y((-S.b - S.w1 * -3) / S.w2)); ctx.lineTo(X(3), Y((-S.b - S.w1 * 3) / S.w2)); }
      else if (Math.abs(S.w1) > 1e-3) { ctx.moveTo(X(-S.b / S.w1), Y(-3)); ctx.lineTo(X(-S.b / S.w1), Y(3)); }
      ctx.stroke(); ctx.lineWidth = 1;
      pts.forEach((p) => {
        const ok = Math.sign(S.w1 * p.x + S.w2 * p.y + S.b) === p.l;
        ctx.fillStyle = p.l > 0 ? '#d97757' : '#ff4f9a';
        ctx.fillRect(X(p.x) - 5, Y(p.y) - 5, 10, 10);
        if (!ok) { ctx.strokeStyle = '#fff'; ctx.strokeRect(X(p.x) - 8, Y(p.y) - 8, 16, 16); }
      });
    };
  };

  // =================== 3. PID 无人机 ===================
  function pidSim(kp, ki, kd) {
    const m = 1.2, g = 9.81, dt = 0.01, target = 10;
    let y = 0, v = 0, I = 0, prevE = target;
    const ys = [];
    for (let i = 0; i <= 1200; i++) {
      const t = i * dt, e = target - y, D = (e - prevE) / dt; prevE = e;
      const raw = 1.0 * g + kp * e + ki * I + kd * D, T = CF.clamp(raw, 0, 2.5 * g);
      if (raw === T && Math.abs(e) < 3) I += e * dt;
      let F = T - m * g - 0.4 * v; if (t >= 6 && t < 7.5) F -= 4;
      v += (F / m) * dt; y += v * dt; if (y < 0) { y = 0; v = Math.max(0, v); }
      ys.push(y);
    }
    const first = ys.slice(0, 600), maxY = Math.max(...first);
    let settle = 0; for (let i = 0; i < 600; i++) if (Math.abs(ys[i] - 10) > 0.3) settle = i * dt;
    let rec = 0; for (let i = 600; i < 1200; i++) if (Math.abs(ys[i] - 10) > 0.3) rec = i * dt;
    return { ys, over: Math.max(0, (maxY - 10) / 10) * 100, settle: settle + dt, err: Math.abs(ys[590] - 10), rec };
  }
  L.pid = function () {
    const S = { kp: 2, ki: 0, kd: 0, sim: null, t: 0, anim: null };
    const R = shell('pid', '<b>任务：</b>一架带货无人机（比飞控以为的重 20%）要从地面升到 <b>10 米</b> 悬停；第 6 秒会有一阵向下的风。<br>过关：超调 &lt; 15%、4.5 秒内稳定在 ±0.3 m、第 6 秒前误差 &lt; 0.2 m、风后 4.5 秒内恢复。<br><span class="muted">提示：先调 Kp，再加 Kd 抑制超调，最后加 Ki 消除「重了 20%」带来的误差。</span>');
    const kpi = CF.h('<div class="lab-msg mono small">点「起飞」运行仿真</div>');
    const run = () => {
      S.sim = pidSim(S.kp, S.ki, S.kd); S.t = 0;
      cancelAnimationFrame(S.anim);
      const t0 = performance.now();
      const tick = () => { S.t = Math.min(12, ((performance.now() - t0) / 1000) * 4); R.draw(); if (S.t < 12) S.anim = requestAnimationFrame(tick); else judge(); };
      tick();
    };
    const judge = () => {
      const r = S.sim;
      const pass = r.over < 15 && r.settle < 4.5 && r.err < 0.2 && r.rec < 10.5;
      kpi.innerHTML = `超调 ${r.over.toFixed(1)}%　稳定时间 ${r.settle.toFixed(2)}s<br>6s 前误差 ${r.err.toFixed(2)}m　风后恢复 ${r.rec > 6 ? (r.rec - 7.5 > 0 ? (r.rec - 7.5).toFixed(2) + 's' : '即时') : '即时'}`;
      if (pass) {
        const stars = r.over < 4 && r.settle < 2.3 ? 3 : r.over < 10 && r.settle < 3.5 ? 2 : 1;
        R.msg(`✅ 稳稳悬停！${starStr(stars)}<br>P 负责「拉回来」，D 负责「别冲过头」，I 负责「补上一直差的那一点」。真实的飞控（PX4、ArduPilot）里，姿态和位置都是一层层 PID。`, 'ok');
        CF.Audio.sfx('correct'); CF.P.finishLab('pid', stars);
      } else {
        const why = [];
        if (r.over >= 15) why.push('超调太大 → 加大 Kd 或减小 Kp');
        if (r.err >= 0.2) why.push('一直差一点 → 需要 Ki（积分）');
        if (r.settle >= 4.5) why.push('稳定太慢 → 适当加大 Kp');
        if (r.rec >= 10.5) why.push('抗风不足 → 加大 Ki 或 Kp');
        R.msg('还没过关：' + why.join('；'), 'bad'); CF.Audio.sfx('wrong');
      }
    };
    R.side.append(
      slider('Kp 比例', 0, 10, 0.25, S.kp, (v) => v.toFixed(2), (v) => (S.kp = v)),
      slider('Ki 积分', 0, 3, 0.05, S.ki, (v) => v.toFixed(2), (v) => (S.ki = v)),
      slider('Kd 微分', 0, 8, 0.25, S.kd, (v) => v.toFixed(2), (v) => (S.kd = v)),
      row(btn('🚁 起飞', 'primary', run)), kpi, R.msgEl);
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const pw = w - 90, ph = h - 26;
      plotFrame(ctx, 8, 8, pw, ph, '高度 (m) – 时间 (s)');
      const X = (t) => 8 + (t / 12) * pw, Y = (y) => 8 + ph - (y / 16) * ph;
      ctx.fillStyle = '#6fdc8c18'; ctx.fillRect(8, Y(10.3), pw, Y(9.7) - Y(10.3));
      ctx.strokeStyle = '#6fdc8c'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(8, Y(10)); ctx.lineTo(8 + pw, Y(10)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#29e0e014'; ctx.fillRect(X(6), 8, X(7.5) - X(6), ph);
      ctx.fillStyle = '#9d96ad'; ctx.font = '10px ui-monospace,monospace';
      for (let t = 0; t <= 12; t += 2) ctx.fillText(t + 's', X(t) - 6, 8 + ph + 12);
      ctx.fillText('阵风', X(6) + 4, 24);
      let cy = 0;
      if (S.sim) {
        const N = Math.floor(S.t / 0.01);
        ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= N && i < S.sim.ys.length; i += 2) { const px = X(i * 0.01), py = Y(S.sim.ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke(); ctx.lineWidth = 1;
        cy = S.sim.ys[Math.min(N, S.sim.ys.length - 1)];
      }
      // 无人机
      const dx = w - 46, dy = Y(cy);
      ctx.fillStyle = '#2b2641'; ctx.fillRect(dx - 2, 8, 4, ph);
      ctx.fillStyle = '#d97757'; ctx.fillRect(dx - 12, dy - 5, 24, 8);
      ctx.fillStyle = '#1b1226'; ctx.fillRect(dx - 6, dy - 3, 2, 2); ctx.fillRect(dx + 4, dy - 3, 2, 2);
      ctx.fillStyle = '#b3abea'; const sp = (performance.now() / 40) % 2 < 1;
      ctx.fillRect(dx - 22, dy - 9, sp ? 14 : 8, 2); ctx.fillRect(dx + 8, dy - 9, sp ? 14 : 8, 2);
      ctx.fillStyle = '#9d96ad'; ctx.fillRect(dx - 15, dy - 9, 2, 6); ctx.fillRect(dx + 13, dy - 9, 2, 6);
      if (S.sim && S.t >= 6 && S.t < 7.5) { ctx.fillStyle = '#29e0e0'; for (let k = 0; k < 3; k++) ctx.fillRect(dx - 14 + k * 12, dy - 30 + ((performance.now() / 20) % 12), 2, 8); }
    };
  };

  // =================== 4. 机器人编程 ===================
  const MAPS = [
    ['........', '.S...#..', '.....#B.', '.....#..', '........', '........'],
    ['S.#.....', '..#.##..', '..#..#..', '.....#B.', '.###.#..', '........'],
    ['S...#...', '.##.#.#.', '.#..#.#.', '.#.##.#B', '.#....#.', '...##...'],
  ];
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 东 南 西 北
  function parseMap(m) { let s, b; m.forEach((r, y) => { for (let x = 0; x < r.length; x++) { if (r[x] === 'S') s = [x, y]; if (r[x] === 'B') b = [x, y]; } }); return { s, b, wall: (x, y) => y < 0 || y >= m.length || x < 0 || x >= m[0].length || m[y][x] === '#' }; }
  function optimalOps(m) {
    const P = parseMap(m), start = [P.s[0], P.s[1], 0], key = (a) => a.join(',');
    const seen = new Set([key(start)]), q = [[start, 0]];
    while (q.length) {
      const [[x, y, d], c] = q.shift();
      if (x === P.b[0] && y === P.b[1]) return c;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      const next = [[x, y, (d + 3) % 4], [x, y, (d + 1) % 4]];
      if (!P.wall(nx, ny)) next.push([nx, ny, d]);
      next.forEach((s) => { if (!seen.has(key(s))) { seen.add(key(s)); q.push([s, c + 1]); } });
    }
    return -1;
  }
  L.optimalOps = optimalOps; L.MAPS = MAPS;
  L.robot = function () {
    const S = { map: 0, prog: [], run: null, bot: null, results: (CF.Save.data.labs.robot && CF.Save.data.labs.robot.maps) || {} };
    const R = shell('robot', '<b>任务：</b>机器人朝东出发。用「前进 / 左转 / 右转」编写程序，让它绕开数据断崖拿到电池。<br>三张地图都完成即通关；指令越少星越多。这就是机器人路径规划的雏形——A* 算法能自动找到最短路。');
    const progEl = CF.h('<div class="prog-list"></div>');
    const mapRow = CF.h('<div class="row wrap"></div>');
    const reset = () => { const P = parseMap(MAPS[S.map]); S.bot = { x: P.s[0], y: P.s[1], d: 0, trail: [[P.s[0], P.s[1]]] }; S.showOpt = false; };
    const renderProg = (cur = -1) => { progEl.innerHTML = S.prog.length ? S.prog.map((o, i) => `<span class="op ${i === cur ? 'cur' : ''}">${{ F: '↑前进', L: '↰左转', R: '↱右转' }[o]}</span>`).join('') : '<span class="muted small">点击下方按钮添加指令</span>'; };
    const renderMaps = () => { mapRow.innerHTML = ''; MAPS.forEach((_, i) => { const b = btn(`地图 ${i + 1}${S.results[i] ? ' ✓' : ''}`, i === S.map ? 'violet sm' : 'sm', () => { S.map = i; S.prog = []; reset(); renderProg(); renderMaps(); R.msg(`地图 ${i + 1}：最少需要 ${optimalOps(MAPS[i])} 条指令。`); R.draw(); }); mapRow.appendChild(b); }); };
    const add = (o) => { if (S.run) return; if (S.prog.length >= 40) return; S.prog.push(o); renderProg(); };
    const exec = () => {
      if (S.run || !S.prog.length) return;
      reset(); const P = parseMap(MAPS[S.map]); let i = 0;
      S.run = setInterval(() => {
        if (i >= S.prog.length) { clearInterval(S.run); S.run = null; R.msg('程序结束，但还没拿到电池。', 'bad'); CF.Audio.sfx('wrong'); return; }
        const o = S.prog[i], b = S.bot; renderProg(i);
        if (o === 'L') b.d = (b.d + 3) % 4; else if (o === 'R') b.d = (b.d + 1) % 4;
        else { const nx = b.x + DIRS[b.d][0], ny = b.y + DIRS[b.d][1]; if (P.wall(nx, ny)) { clearInterval(S.run); S.run = null; R.msg(`第 ${i + 1} 条指令撞墙了！机器人需要「感知」障碍——真实机器人会用激光雷达。`, 'bad'); CF.Audio.sfx('error'); R.draw(); return; } b.x = nx; b.y = ny; b.trail.push([nx, ny]); CF.Audio.sfx('hover'); }
        R.draw(); i++;
        if (b.x === P.b[0] && b.y === P.b[1]) {
          clearInterval(S.run); S.run = null;
          const opt = optimalOps(MAPS[S.map]), n = S.prog.length, stars = n <= opt ? 3 : n <= opt + 2 ? 2 : 1;
          S.results[S.map] = Math.max(S.results[S.map] || 0, stars); S.showOpt = true;
          const rec = CF.Save.data.labs.robot || { done: false, stars: 0, count: 0 }; rec.maps = S.results; CF.Save.data.labs.robot = rec; CF.Save.save();
          CF.Audio.sfx('correct'); renderMaps();
          const all = MAPS.every((_, k) => S.results[k]);
          R.msg(`🔋 拿到电池！用了 ${n} 条指令（最优 ${opt}）${starStr(stars)}。虚线是 BFS/A* 找到的最短路线。` + (all ? '<br>三张地图全部完成！' : '<br>继续下一张地图。'), 'ok');
          if (all) CF.P.finishLab('robot', Math.floor(MAPS.reduce((s, _, k) => s + S.results[k], 0) / MAPS.length));
          R.draw();
        }
      }, 280);
    };
    R.side.append(mapRow, progEl,
      row(btn('↑ 前进', '', () => add('F')), btn('↰ 左转', '', () => add('L')), btn('↱ 右转', '', () => add('R'))),
      row(btn('▶ 运行', 'primary', exec), btn('⌫', 'ghost', () => { if (!S.run) { S.prog.pop(); renderProg(); } }), btn('清空', 'ghost', () => { if (!S.run) { S.prog = []; reset(); renderProg(); R.draw(); } })),
      R.msgEl);
    reset(); renderProg(); renderMaps(); R.msg(`地图 1：最少需要 ${optimalOps(MAPS[0])} 条指令。`);
    function shortest() {
      const m = MAPS[S.map], P = parseMap(m), q = [[P.s, [P.s]]], seen = new Set([P.s.join()]);
      while (q.length) { const [[x, y], path] = q.shift(); if (x === P.b[0] && y === P.b[1]) return path; DIRS.forEach(([dx, dy]) => { const n = [x + dx, y + dy]; if (!P.wall(...n) && !seen.has(n.join())) { seen.add(n.join()); q.push([n, path.concat([n])]); } }); }
      return [];
    }
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const m = MAPS[S.map], cols = m[0].length, rows = m.length, cs = Math.floor(Math.min((w - 16) / cols, (h - 16) / rows)), ox = (w - cs * cols) / 2, oy = (h - cs * rows) / 2;
      const P = parseMap(m);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        ctx.fillStyle = m[y][x] === '#' ? '#000' : (x + y) % 2 ? '#15121f' : '#191527';
        ctx.fillRect(ox + x * cs, oy + y * cs, cs - 1, cs - 1);
        if (m[y][x] === '#') { ctx.fillStyle = '#ff4f9a55'; ctx.fillRect(ox + x * cs, oy + y * cs, cs - 1, 3); ctx.fillStyle = '#ff4f9a'; ctx.font = `${cs * 0.35}px monospace`; ctx.fillText('#', ox + x * cs + cs * 0.38, oy + y * cs + cs * 0.65); }
      }
      if (S.showOpt) { ctx.strokeStyle = '#6fdc8c'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.beginPath(); shortest().forEach(([x, y], i) => { const px = ox + x * cs + cs / 2, py = oy + y * cs + cs / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
      // 电池
      const bx = ox + P.b[0] * cs, by = oy + P.b[1] * cs;
      ctx.fillStyle = '#e9b949'; ctx.fillRect(bx + cs * 0.3, by + cs * 0.25, cs * 0.4, cs * 0.55); ctx.fillRect(bx + cs * 0.42, by + cs * 0.18, cs * 0.16, cs * 0.08);
      // 轨迹
      if (S.bot) {
        ctx.fillStyle = '#7fa8d833'; S.bot.trail.forEach(([x, y]) => ctx.fillRect(ox + x * cs + cs * 0.35, oy + y * cs + cs * 0.35, cs * 0.3, cs * 0.3));
        const px = Math.max(2, Math.floor(cs / 18));
        CF.PixelFX.drawAgent(ctx, ox + S.bot.x * cs + (cs - 13 * px) / 2, oy + S.bot.y * cs + (cs - 10 * px) / 2, px, { noGuitar: true });
        const [dx, dy] = DIRS[S.bot.d];
        ctx.fillStyle = '#fff'; ctx.fillRect(ox + S.bot.x * cs + cs / 2 + dx * cs * 0.38 - 3, oy + S.bot.y * cs + cs / 2 + dy * cs * 0.38 - 3, 6, 6);
      }
    };
  };

  // =================== 5. 火箭方程 ===================
  const G0 = 9.80665;
  const E1 = { ker: { n: '煤油（Isp≈300s，单台 850kN）', isp: 300, thr: 850, mass: 0.5 }, ch4: { n: '甲烷（Isp≈330s，单台 2200kN）', isp: 330, thr: 2200, mass: 1.6 } };
  const E2 = { kerv: { n: '煤油真空版（Isp≈348s）', isp: 348, dry: 0.07, eng: 1.0 }, h2: { n: '氢氧（Isp≈450s，储箱更重）', isp: 450, dry: 0.12, eng: 1.5 } };
  function rocketCalc(c) {
    const pay = 5, s2dry = E2[c.e2].dry * c.p2 + E2[c.e2].eng, m2 = pay + c.p2 + s2dry, s1dry = 0.06 * c.p1 + c.n * E1[c.e1].mass + 2, m0 = m2 + c.p1 + s1dry;
    const dv1 = E1[c.e1].isp * G0 * Math.log(m0 / (m0 - c.p1)), dv2 = E2[c.e2].isp * G0 * Math.log(m2 / (m2 - c.p2));
    return { m0, dv1, dv2, dv: dv1 + dv2, tw: (c.n * E1[c.e1].thr) / (m0 * G0) };
  }
  L.rocketCalc = rocketCalc;
  L.rocket = function () {
    const C = { e1: 'ker', n: 4, p1: 200, e2: 'kerv', p2: 40 }, A = { t: -1, raf: 0, res: null };
    const R = shell('rocket', '<b>任务：</b>把 <b>5 吨</b>卫星送入近地轨道，总 Δv 需要 ≥ <b>9,400 m/s</b>（7.8 km/s 轨道速度 + 约 1.6 km/s 重力与空气损失），起飞推重比 ≥ <b>1.2</b>。<br>火箭方程：Δv = Isp · g₀ · ln(m₀/m_f)。起飞质量越轻越好：≤180 吨 3 星，≤260 吨 2 星。');
    const kpi = CF.h('<div class="lab-msg mono small"></div>');
    const sel = (label, opts, key) => { const el = CF.h(`<label class="slider"><span>${label}</span><select class="btn sm" style="width:100%">${Object.keys(opts).map((k) => `<option value="${k}">${opts[k].n}</option>`).join('')}</select></label>`); const s = el.querySelector('select'); s.value = C[key]; s.onchange = () => { C[key] = s.value; upd(); }; return el; };
    const upd = () => {
      const r = rocketCalc(C);
      const okDv = r.dv >= 9400, okTw = r.tw >= 1.2;
      kpi.innerHTML = `起飞质量 m₀ = <b>${r.m0.toFixed(1)}</b> t<br>推重比 = <span style="color:${okTw ? 'var(--good)' : 'var(--bad)'}">${r.tw.toFixed(2)}</span><br>Δv 一级 ${r.dv1.toFixed(0)} + 二级 ${r.dv2.toFixed(0)}<br>= <span style="color:${okDv ? 'var(--good)' : 'var(--bad)'}">${r.dv.toFixed(0)}</span> / 9400 m/s`;
      R.draw();
    };
    const launch = () => {
      const r = rocketCalc(C); A.res = r; A.t = 0; const t0 = performance.now();
      cancelAnimationFrame(A.raf);
      const tick = () => { A.t = (performance.now() - t0) / 1000; R.draw(); if (A.t < 4.2) A.raf = requestAnimationFrame(tick); else finish(); };
      tick(); CF.Audio.sfx('boom', 0.5);
    };
    const finish = () => {
      const r = A.res;
      if (r.tw < 1.2) { R.msg('❌ 推重比不足，火箭离不开发射台（或爬升太慢损失过大）。增加一级发动机数量。', 'bad'); CF.Audio.sfx('wrong'); return; }
      if (r.dv < 9400) { R.msg(`❌ 差 ${(9400 - r.dv).toFixed(0)} m/s 没能入轨，卫星落回大气层。增加推进剂或换更高比冲的发动机——但注意对数：加燃料的收益越来越小。`, 'bad'); CF.Audio.sfx('wrong'); return; }
      const stars = r.m0 <= 180 ? 3 : r.m0 <= 260 ? 2 : 1;
      R.msg(`🛰️ 入轨成功！起飞质量 ${r.m0.toFixed(1)} 吨 ${starStr(stars)}<br>多级火箭的意义：把空壳扔掉。上面级用高比冲发动机最划算，因为它推的质量最小。猎鹰 9 号两级都用煤油，是为了简化与复用——工程永远是取舍。`, 'ok');
      CF.Audio.sfx('correct'); CF.P.finishLab('rocket', stars);
    };
    R.side.append(sel('一级发动机', E1, 'e1'), slider('一级发动机数量', 1, 12, 1, C.n, (v) => v + ' 台', (v) => { C.n = v; upd(); }),
      slider('一级推进剂', 50, 500, 10, C.p1, (v) => v + ' t', (v) => { C.p1 = v; upd(); }), sel('二级发动机', E2, 'e2'),
      slider('二级推进剂', 10, 120, 5, C.p2, (v) => v + ' t', (v) => { C.p2 = v; upd(); }), kpi, row(btn('🚀 发射', 'primary', launch)), R.msgEl);
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05030c'); g.addColorStop(1, '#1d1340'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const rs = CF.rng(3); ctx.fillStyle = '#fff8'; for (let i = 0; i < 60; i++) ctx.fillRect(rs() * w, rs() * h * 0.8, 1.5, 1.5);
      ctx.fillStyle = '#3fd0c955'; ctx.beginPath(); ctx.arc(w / 2, h + w * 1.2, w * 1.3, 0, Math.PI * 2); ctx.fill();
      const r = rocketCalc(C), px = Math.max(2, Math.floor(h / 120));
      let x = w / 2, y = h - 30 - 30 * px, stage2 = false, fail = false;
      if (A.t >= 0 && A.res) {
        const res = A.res, prog = Math.min(1, A.t / 4), reach = res.tw < 1.2 ? 0.02 : Math.min(1, res.dv / 9400);
        const p = Math.min(prog, reach);
        y = h - 30 - 30 * px - p * (h * 0.75); x = w / 2 + p * p * w * 0.32; stage2 = p > 0.45; fail = prog > reach + 0.02;
        if (fail) y += (prog - reach) * h * 1.2;
        if (!fail && prog > 0) { ctx.fillStyle = '#e9b949'; for (let i = 0; i < 6; i++) ctx.fillRect(x - px + (Math.random() - 0.5) * 3 * px, y + (stage2 ? 14 : 30) * px + i * px * 1.5, px * 2, px * 2); }
        if (!fail && prog >= 1 && res.dv >= 9400) { ctx.strokeStyle = '#6fdc8c'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.ellipse(w / 2, h + w * 0.2, w * 0.62, h * 0.95, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.setLineDash([]); }
      }
      // 火箭（像素）
      const s1h = Math.round(CF.clamp(C.p1 / 25, 6, 20)), s2h = Math.round(CF.clamp(C.p2 / 10, 3, 12));
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#ede6d6'; ctx.fillRect(-px * 2, -px * 4, px * 4, px * 4); ctx.fillRect(-px, -px * 6, px * 2, px * 2);
      ctx.fillStyle = C.e2 === 'h2' ? '#b3abea' : '#d97757'; ctx.fillRect(-px * 2, 0, px * 4, s2h * px);
      if (!stage2) { ctx.fillStyle = C.e1 === 'ch4' ? '#9d96ad' : '#ede6d6'; ctx.fillRect(-px * 2.5, s2h * px, px * 5, s1h * px); ctx.fillStyle = '#1b1226'; for (let i = 0; i < Math.min(C.n, 5); i++) ctx.fillRect(-px * 2.5 + i * px, (s2h + s1h) * px, px * 0.8, px * 1.5); }
      ctx.restore();
      ctx.fillStyle = '#9d96ad'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(`Δv ${r.dv.toFixed(0)} / 9400 m/s`, 10, 18);
      ctx.fillStyle = '#ffffff15'; ctx.fillRect(10, 24, 160, 6); ctx.fillStyle = r.dv >= 9400 ? '#6fdc8c' : '#e9b949'; ctx.fillRect(10, 24, 160 * Math.min(1, r.dv / 9400), 6);
    };
    upd();
  };

  // =================== 6. 创业沙盘 ===================
  L.startup = function () {
    const S = { cash: 1e6, users: 0, quality: 20, eng: 2, m: 0, equity: 100, hist: [], price: 39, mkt: 30000, churnAdj: 0, extra: 0, ev: null, over: false, last: null };
    const R = shell('startup', '<b>你的 AI 学习助手公司</b>有 100 万元启动资金、2 名工程师。每个月决定：价格、营销预算、团队规模。<br>目标：活过 12 个月且 <b>LTV/CAC ≥ 3</b>。2 星：期末现金 ≥ 30 万；3 星：再加月收入 ≥ 40 万。注意：产品质量需要时间积累，现金流断了就结束。');
    const kpi = CF.h('<div class="lab-msg mono small"></div>');
    const evBox = CF.h('<div></div>');
    const sP = slider('价格（元/月）', 10, 99, 1, S.price, (v) => v + ' 元', (v) => (S.price = v));
    const sM = slider('营销预算（元/月）', 0, 200000, 5000, S.mkt, (v) => (v / 10000).toFixed(1) + ' 万', (v) => (S.mkt = v));
    const sE = slider('工程师人数', 1, 12, 1, S.eng, (v) => v + ' 人', (v) => (S.eng = v));
    const nextBtn = btn('推进一个月 ▶', 'primary', () => advance());
    const fmtW = (v) => (v / 10000).toFixed(1) + '万';
    const showKpi = () => {
      const l = S.last;
      kpi.innerHTML = `第 ${S.m}/12 月　现金 <b style="color:${S.cash < 0 ? 'var(--bad)' : 'var(--gold)'}">${fmtW(S.cash)}</b>　持股 ${S.equity}%<br>付费用户 ${Math.round(S.users)}　产品质量 ${Math.round(S.quality)}` +
        (l ? `<br>月收入 ${fmtW(l.rev)}　月支出 ${fmtW(l.cost)}<br>CAC ${l.cac.toFixed(0)} 元　月流失 ${(l.churn * 100).toFixed(1)}%<br>LTV/CAC <b style="color:${l.ltvcac >= 3 ? 'var(--good)' : 'var(--bad)'}">${l.ltvcac.toFixed(2)}</b>　跑道 ${l.burn > 0 ? (S.cash / l.burn).toFixed(1) + ' 月' : '盈利中'}` : '');
    };
    const EVENTS = {
      4: { t: '竞争对手宣布降价 30%', o: [['跟随降价', () => { S.price = Math.max(10, Math.round(S.price * 0.7)); sP.set(S.price); }], ['坚持品质，加快迭代', () => { S.quality = Math.min(98, S.quality + 6); S.churnAdj = 0.03; }]] },
      7: { t: '一位投资人愿投 200 万元，占股 25%', o: [['接受投资', () => { S.cash += 2e6; S.equity = Math.round(S.equity * 0.75); }], ['婉拒，保持控制权', () => {}]] },
      10: { t: '核心工程师被大厂高薪挖角', o: [['一次性加薪 5 万留人', () => { S.cash -= 50000; }], ['祝福他离开', () => { S.quality = Math.max(5, S.quality - 6); }]] },
    };
    function advance() {
      if (S.over || S.ev) return;
      S.eng = +sE.querySelector('input').value;
      S.quality += S.eng * 2.4 * (1 - S.quality / 100) - 1.5; S.quality = CF.clamp(S.quality, 5, 98);
      const cac = 40 * (0.6 + S.price / 50) * (1.35 - S.quality / 100);
      const organic = 20 * (S.quality / 50) + S.users * 0.06 * (S.quality / 100);
      const churn = CF.clamp(0.2 - S.quality / 600 + S.price / 900 + S.churnAdj, 0.02, 0.4);
      S.churnAdj = Math.max(0, S.churnAdj - 0.015);
      S.users = S.users * (1 - churn) + S.mkt / cac + organic;
      const rev = S.users * S.price, cost = S.eng * 25000 + S.mkt + 30000;
      S.cash += rev * 0.8 - cost; S.m++;
      S.last = { cac, churn, rev, cost, ltvcac: (S.price * 0.8) / churn / cac, burn: cost - rev * 0.8 };
      S.hist.push({ cash: S.cash, users: S.users });
      CF.Audio.sfx('click');
      showKpi(); R.draw();
      if (S.cash < 0) { S.over = true; R.msg(`💸 第 ${S.m} 个月现金耗尽，公司倒闭。<br>复盘：是不是太早大规模投放（产品还没准备好），或定价太低导致 LTV 撑不起 CAC？点「重开」再来。`, 'bad'); CF.Audio.sfx('lose'); return; }
      if (S.m >= 12) return end();
      if (EVENTS[S.m]) { const e = EVENTS[S.m]; S.ev = e; evBox.innerHTML = `<div class="lab-msg" style="border-color:var(--gold)"><b>📣 事件：</b>${e.t}</div>`; const r = row(); e.o.forEach(([t, fn]) => r.appendChild(btn(t, 'sm', () => { fn(); S.ev = null; evBox.innerHTML = ''; showKpi(); R.draw(); }))); evBox.appendChild(r); }
    }
    function end() {
      S.over = true;
      const l = S.last;
      if (l.ltvcac < 3) { R.msg(`活过了 12 个月，但 LTV/CAC 只有 ${l.ltvcac.toFixed(2)}：每获取一个用户的回报不够。试试提高质量（降低流失）或调整价格。`, 'bad'); CF.Audio.sfx('wrong'); return; }
      let stars = 1; if (S.cash >= 300000) stars = 2; if (stars === 2 && l.rev >= 400000) stars = 3;
      R.msg(`🎉 公司活下来了！${starStr(stars)}<br>期末现金 ${fmtW(S.cash)}，月收入 ${fmtW(l.rev)}，你的持股 ${S.equity}%。<br>真实创业里，这些数字背后是一次次用户访谈和产品迭代。去做线下任务「采访 3 个用户」吧。`, 'ok');
      CF.Audio.sfx('win'); CF.P.finishLab('startup', stars);
    }
    R.side.append(sP, sM, sE, row(nextBtn, btn('重开', 'ghost', () => { Object.assign(S, { cash: 1e6, users: 0, quality: 20, eng: 2, m: 0, equity: 100, hist: [], churnAdj: 0, ev: null, over: false, last: null }); sE.set(2); evBox.innerHTML = ''; showKpi(); R.msg('重新开始。'); R.draw(); })), evBox, kpi, R.msgEl);
    showKpi();
    R.draw = function () {
      const { ctx, w, h } = R; ctx.clearRect(0, 0, w, h);
      const pw = w - 20, ph = h - 30;
      plotFrame(ctx, 10, 8, pw, ph, '现金（金线）与付费用户（柱）');
      const maxC = Math.max(1e6, ...S.hist.map((x) => x.cash)), minC = Math.min(0, ...S.hist.map((x) => x.cash)), maxU = Math.max(100, ...S.hist.map((x) => x.users));
      const X = (i) => 10 + 20 + (i / 12) * (pw - 30), Yc = (c) => 8 + 20 + (1 - (c - minC) / (maxC - minC)) * (ph - 30);
      S.hist.forEach((p, i) => { const bh = (p.users / maxU) * (ph - 40); ctx.fillStyle = '#3fd0c955'; ctx.fillRect(X(i + 1) - 8, 8 + ph - bh, 16, bh); });
      ctx.strokeStyle = '#ff5d6c66'; ctx.beginPath(); ctx.moveTo(10, Yc(0)); ctx.lineTo(10 + pw, Yc(0)); ctx.stroke();
      ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Yc(1e6)); S.hist.forEach((p, i) => ctx.lineTo(X(i + 1), Yc(p.cash))); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#9d96ad'; ctx.font = '10px ui-monospace,monospace'; for (let i = 0; i <= 12; i += 3) ctx.fillText(i + '月', X(i) - 8, 8 + ph + 12);
    };
  };

  // =================== 7. 代码挑战 ===================
  const WORKER_SRC = `onmessage=function(e){var d=e.data,f;try{f=new Function(d.code+"\\n;return typeof "+d.fn+"==='function'?"+d.fn+":null;")();}catch(err){postMessage({error:'语法错误：'+err.message});return;}if(!f){postMessage({error:'没有找到函数 '+d.fn+'，请保留函数名'});return;}var res=d.tests.map(function(t){try{return{got:f.apply(null,JSON.parse(JSON.stringify(t[0])))};}catch(err){return{err:String(err&&err.message||err)};}});postMessage({res:res});};`;
  function runTests(c, code) {
    return new Promise((resolve) => {
      let w = null;
      try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); } catch (e) { w = null; }
      const payload = { code, fn: c.fn, tests: c.tests };
      if (!w) { // 退化：同步执行
        try { const f = new Function(code + '\n;return ' + c.fn + ';')(); resolve({ res: c.tests.map((t) => { try { return { got: f(...JSON.parse(JSON.stringify(t[0]))) }; } catch (err) { return { err: err.message }; } }) }); } catch (err) { resolve({ error: '语法错误：' + err.message }); }
        return;
      }
      const to = setTimeout(() => { w.terminate(); resolve({ error: '运行超时（是不是写了死循环？）' }); }, 2000);
      w.onmessage = (e) => { clearTimeout(to); w.terminate(); resolve(e.data); };
      w.onerror = (e) => { clearTimeout(to); w.terminate(); resolve({ error: e.message || '运行出错' }); e.preventDefault && e.preventDefault(); };
      w.postMessage(payload);
    });
  }
  const close = (a, b) => {
    if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && a.every((x, i) => close(x, b[i]));
    return typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-4);
  };
  L.code = function () {
    const body = CF.h('<div class="lab"><div class="lab-msg">在浏览器里写真正的 JavaScript。完成任意 <b>3</b> 个挑战即通关本实验（每个挑战都有实操经验）。<br><span class="muted">AI 领域主流语言是 Python——这些函数在线下任务里请再用 Python 写一遍。</span></div><div class="lab-main"><div class="lab-side" style="flex:0 1 230px" id="cList"></div><div style="flex:1 1 380px;display:flex;flex-direction:column;gap:8px;min-width:0"><div id="cDesc" class="lab-msg"></div><textarea class="code" id="cCode" spellcheck="false"></textarea><div class="row"><button class="btn primary" id="cRun">▶ 运行测试</button><button class="btn ghost" id="cReset">恢复初始代码</button></div><div class="lab-msg testlog" id="cLog">—</div></div></div></div>');
    CF.modal.open({ title: '⌨️ 实验室 · 代码挑战', body, wide: true });
    const list = body.querySelector('#cList'), desc = body.querySelector('#cDesc'), code = body.querySelector('#cCode'), log = body.querySelector('#cLog');
    const drafts = {};
    let cur = CF.Content.CODE[0];
    const renderList = () => {
      list.innerHTML = '';
      CF.Content.CODE.forEach((c) => {
        const done = CF.Save.data.code[c.id];
        const b = CF.h(`<button class="btn sm" style="justify-content:space-between;width:100%">${CF.esc(c.title)}<span>${done ? '✓' : CF.Content.DOMAINS[c.d].icon}</span></button>`);
        if (c === cur) b.classList.add('violet');
        b.onclick = () => { drafts[cur.id] = code.value; cur = c; show(); renderList(); };
        list.appendChild(b);
      });
    };
    const show = () => { desc.innerHTML = `<b>${CF.esc(cur.title)}</b><br>${CF.esc(cur.desc)}`; code.value = drafts[cur.id] || cur.starter; log.textContent = '—'; };
    code.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = code.selectionStart; code.value = code.value.slice(0, s) + '  ' + code.value.slice(code.selectionEnd); code.selectionStart = code.selectionEnd = s + 2; } });
    body.querySelector('#cReset').onclick = () => { code.value = cur.starter; };
    body.querySelector('#cRun').onclick = async () => {
      log.textContent = '运行中…';
      const r = await runTests(cur, code.value);
      if (r.error) { log.textContent = '❌ ' + r.error; CF.Audio.sfx('error'); return; }
      let pass = 0;
      log.textContent = r.res.map((x, i) => { const t = cur.tests[i], ok = !x.err && close(x.got, t[1]); if (ok) pass++; return `${ok ? '✅' : '❌'} ${cur.fn}(${t[0].map((a) => JSON.stringify(a)).join(', ')}) → ${x.err ? '报错: ' + x.err : JSON.stringify(x.got)}${ok ? '' : '　期望 ' + JSON.stringify(t[1])}`; }).join('\n');
      if (pass === cur.tests.length) { log.textContent += `\n\n全部通过！`; CF.Audio.sfx('correct'); CF.P.finishCode(cur.id); renderList(); }
      else CF.Audio.sfx('wrong');
    };
    renderList(); show();
  };

  // =================== 8. 像素工坊 ===================
  // 旧存档的头像按下标存颜色，所以只在末尾追加（v6：信号兵模板用的蓝钢色）
  const PIX_PAL = ['transparent', '#d97757', '#b85f40', '#1b1226', '#ede6d6', '#8b80d6', '#5b3aa8', '#e9b949', '#3fd0c9', '#ff4f9a', '#6fdc8c', '#7fa8d8', '#4f6f9e'];
  L.PIX_PAL = PIX_PAL;
  L.pixel = function () { if (CF.PixStudio) return CF.PixStudio.open(); return L.pixelOld(); };
  // v8 及以前的 16×16 画板（像素工坊 2.0 加载失败时兜底）
  L.pixelOld = function () {
    const grid = (CF.Save.data.avatar && CF.Save.data.avatar.slice()) || new Array(256).fill(0);
    let col = 1, painting = false;
    const body = CF.h(`<div class="lab"><div class="lab-msg">美也是一种能力。画一个 16×16 的指挥官头像，它会出现在战场通讯框里。用到 4 种以上颜色得 3 星。</div><div class="lab-main" style="align-items:flex-start"><div class="pix-grid" id="pg"></div><div class="lab-side"><div class="swatches" id="sw"></div><div class="row wrap"><button class="btn sm" id="pTpl">载入信号兵模板</button><button class="btn sm ghost" id="pClr">清空</button></div><button class="btn primary" id="pSave">保存为指挥官头像</button><div class="lab-msg small" id="pMsg">按住拖动可以连续涂色；选透明色当橡皮擦。</div></div></div></div>`);
    CF.modal.open({ title: '🎨 实验室 · 像素工坊', body, wide: true });
    const pg = body.querySelector('#pg'), sw = body.querySelector('#sw');
    const cells = [];
    for (let i = 0; i < 256; i++) { const d = document.createElement('div'); d.dataset.i = i; cells.push(d); pg.appendChild(d); }
    const paint = () => cells.forEach((d, i) => (d.style.background = PIX_PAL[grid[i]]));
    PIX_PAL.forEach((c, i) => { const s = CF.h(`<button class="swatch" title="${i ? c : '橡皮擦'}" style="background:${i ? c : 'repeating-conic-gradient(#555 0 25%,#222 0 50%) 0 0/10px 10px'}"></button>`); s.onclick = () => { col = i; CF.$$('.swatch', sw).forEach((x) => x.classList.remove('on')); s.classList.add('on'); }; if (i === 1) s.classList.add('on'); sw.appendChild(s); });
    const at = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.parentNode === pg ? +el.dataset.i : -1; };
    pg.addEventListener('pointerdown', (e) => { painting = true; const i = at(e); if (i >= 0) { grid[i] = col; paint(); } e.preventDefault(); });
    pg.addEventListener('pointermove', (e) => { if (!painting) return; const i = at(e); if (i >= 0 && grid[i] !== col) { grid[i] = col; cells[i].style.background = PIX_PAL[col]; } });
    window.addEventListener('pointerup', () => (painting = false));
    body.querySelector('#pClr').onclick = () => { grid.fill(0); paint(); };
    body.querySelector('#pTpl').onclick = () => {
      const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
      x.fillStyle = '#5b3aa8'; x.fillRect(0, 0, 16, 16);
      CF.PixelFX.drawAgent(x, 1, 4, 1, { noGuitar: true });
      const data = x.getImageData(0, 0, 16, 16).data;
      const rgb = PIX_PAL.map((c) => (c === 'transparent' ? null : [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))));
      const near = (r, g, b) => { let bi = 6, bd = 1e9; rgb.forEach((c, k) => { if (!c) return; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; bi = k; } }); return bi; };
      for (let i = 0; i < 256; i++) grid[i] = near(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      paint();
    };
    body.querySelector('#pSave').onclick = () => {
      const used = new Set(grid.filter((v) => v > 0));
      if (used.size < 2) { body.querySelector('#pMsg').textContent = '至少用 2 种颜色画点什么吧。'; CF.Audio.sfx('error'); return; }
      CF.Save.data.avatar = grid.slice(); CF.Save.save();
      const stars = used.size >= 4 ? 3 : used.size >= 3 ? 2 : 1;
      body.querySelector('#pMsg').innerHTML = `已保存！${starStr(stars)}　下一场战斗的通讯里就能看到它。`;
      CF.Audio.sfx('correct'); CF.P.finishLab('pixel', stars);
    };
    paint();
  };
  // 头像绘制（供通讯框使用）
  L.drawAvatar = function (ctx, x, y, size) {
    // v9：像素工坊 2.0 存的头像（造月色卡下标），优先用它
    const a2 = CF.Save.data.avatar2;
    if (a2 && CF.PixStudio) { if (!L._av || L._av.d !== a2.d) L._av = { d: a2.d, c: CF.PixStudio.Doc.unpack(a2).toCanvas(1, { x0: 0, y0: 0, w: 16, h: 16 }) }; const c = L._av.c, sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, y, size, size); ctx.imageSmoothingEnabled = sm; return true; }
    const g = CF.Save.data.avatar; if (!g) return false;
    const p = size / 16;
    for (let i = 0; i < 256; i++) if (g[i]) { ctx.fillStyle = PIX_PAL[g[i]]; ctx.fillRect(x + (i % 16) * p, y + Math.floor(i / 16) * p, Math.ceil(p), Math.ceil(p)); }
    return true;
  };

  L.open = function (id) { CF.Audio.play('lab'); (L[id] || L.gd)(); };
})();
