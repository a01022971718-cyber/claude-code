/* 主城养成：建造城池、升级大本营、真实时间产出、科技研究、学习加速、乱码入侵防守战 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const TAU = Math.PI * 2;
  const COLS = 18, ROWS = 13, TILE = 44;
  const MIN = 60, HOUR = 3600;
  // 每级：[晶片, 语料, 算力, 用时秒]
  const COST = (base, k = 1) => [[0, 0, 0, 0], [base * k, base * 0.6 * k, 0, 1 * MIN], [base * 2.5 * k, base * 1.6 * k, base * 0.2 * k, 5 * MIN], [base * 6 * k, base * 4 * k, base * 0.6 * k, 20 * MIN], [base * 14 * k, base * 9 * k, base * 1.5 * k, 1 * HOUR], [base * 30 * k, base * 20 * k, base * 4 * k, 3 * HOUR]];
  const CB = {
    hq: { name: '大本营', size: 3, max: 5, roof: '#ec8a5e', cost: COST(300), desc: '城池的核心。等级决定其他建筑的最高等级与数量，并提高仓库容量与战斗起始资源。' },
    chipmine: { name: '晶片工厂', size: 2, max: 5, roof: '#e9b949', cost: COST(120), prod: { chip: [0, 60, 100, 150, 220, 320] }, desc: '持续生产晶片，点击收取。' },
    corpus: { name: '语料书院', size: 2, max: 5, roof: '#3fd0c9', cost: COST(120), prod: { corp: [0, 40, 70, 110, 160, 230] }, desc: '持续整理语料，点击收取。' },
    compute: { name: '算力中心', size: 2, max: 5, roof: '#9b7bff', cost: COST(200), prod: { comp: [0, 10, 18, 28, 40, 56] }, desc: '持续产出算力，点击收取。' },
    vault: { name: '仓库', size: 2, max: 5, roof: '#9d96ad', cost: COST(150), desc: '每级提高所有资源的储存上限 1500。' },
    lab: { name: '研究所', size: 2, max: 5, roof: '#7ee081', cost: COST(250), desc: '每级使所有战斗中我方伤害 +4%、建筑耐久 +4%。' },
    herohall: { name: '英雄殿', size: 3, max: 5, roof: '#ffb14a', cost: COST(300), desc: '每级使英雄耐久与攻击 +5%。十位英雄的雕像在这里演奏。' },
    barracks: { name: '兵营', size: 2, max: 5, roof: '#d97757', cost: COST(200), desc: '每级使战斗开局多带 1 个编码 Agent。' },
    hall: { name: '音乐厅', size: 2, max: 5, roof: '#ff7ad9', cost: COST(180), desc: '每级使快速模式开局攻击 +6%，并让主城跟着主题曲律动。' },
    tower: { name: '防御塔', size: 1, max: 5, roof: '#ff9a5c', cost: COST(160), desc: '乱码入侵时自动防守。等级越高伤害越高。', perHq: 2 },
    wall: { name: '城墙', size: 1, max: 3, roof: '#6c6680', cost: COST(30), desc: '乱码入侵时阻挡敌人。', perHq: 8 },
    statue: { name: 'X-S 雕像', size: 1, max: 1, roof: '#ffe08a', cost: [[0, 0, 0, 0], [200, 200, 50, 30]], desc: '新生、向上、探索未知。纯装饰，但很好看。' },
    tree: { name: '像素树', size: 1, max: 1, roof: '#7ee081', cost: [[0, 0, 0, 0], [20, 0, 0, 5]], desc: '装饰。', perHq: 10 },
  };
  const SHOP = ['chipmine', 'corpus', 'compute', 'vault', 'lab', 'herohall', 'barracks', 'hall', 'tower', 'wall', 'statue', 'tree'];
  const C = (CF.City = { CB });

  function data() {
    const d = CF.Save.data;
    if (!d.city) {
      d.city = { nid: 1, lastT: Date.now(), res: { chip: 600, corp: 400, comp: 60 }, b: [], boostXp: 0 };
      const add = (type, x, y, lv) => d.city.b.push({ id: d.city.nid++, type, x, y, lv, busy: 0, stock: 0, t0: Date.now() });
      add('hq', 7, 5, 1); add('chipmine', 3, 3, 1); add('corpus', 12, 3, 1); add('tower', 6, 9, 1); add('tower', 11, 9, 1); add('tree', 2, 9, 1); add('tree', 15, 8, 1);
    }
    return d.city;
  }
  C.storage = () => data().res;
  C.level = (type) => Math.max(0, ...data().b.filter((b) => b.type === type).map((b) => b.lv));
  C.hq = () => C.level('hq');
  C.cap = () => 1000 + C.hq() * 500 + data().b.filter((b) => b.type === 'vault').reduce((s, b) => s + b.lv * 1500, 0);
  C.builders = () => (C.hq() >= 3 ? 2 : 1);
  C.busyCount = () => data().b.filter((b) => b.busy > Date.now()).length;
  C.add = function (r) {
    const c = data(), cap = C.cap(), out = {};
    for (const k in r) { const before = c.res[k] || 0; c.res[k] = Math.min(cap, before + Math.max(0, Math.round(r[k]))); out[k] = c.res[k] - before; }
    CF.Save.save(); return out;
  };
  // 战斗胜利入账
  C.reward = function (win, stars, L, g) {
    if (!win) return C.add({ chip: 60, corp: 30, comp: 0 });
    const k = L.raid ? 3 : L.immersive ? 2.5 : L.skirmish ? 1.5 : 1;
    return C.add({ chip: (150 + stars * 120) * k, corp: (90 + stars * 70) * k, comp: (15 + stars * 15) * k });
  };
  // 主城给战斗的加成
  C.bonus = function () {
    return { atkMul: 1 + C.level('lab') * 0.04, bldMul: 1 + C.level('lab') * 0.04, heroMul: 1 + C.level('herohall') * 0.05, extraCoders: C.level('barracks'), startChip: C.hq() * 30 };
  };
  // 离线产出：按真实时间累积到每座建筑，等待玩家收取
  C.tick = function () {
    const c = data(), now = Date.now();
    c.b.forEach((b) => {
      if (b.busy && b.busy <= now) { b.lv = b.target || b.lv + 1; b.busy = 0; b.target = 0; if (CF.UI.cur === 'city') { CF.toast(`${CB[b.type].name} 升到 Lv ${b.lv}`, 'gold'); CF.Audio.sfx('levelup'); } }
      const P = CB[b.type].prod; if (!P || b.busy) { b.t0 = now; return; }
      for (const k in P) { const perSec = P[k][b.lv] / HOUR, capB = P[k][b.lv] * 8; b.stock = Math.min(capB, (b.stock || 0) + perSec * (now - (b.t0 || now)) / 1000); b.res = k; }
      b.t0 = now;
    });
    c.lastT = now;
  };
  C.collect = function (b) {
    if (!b.stock || b.stock < 1) return;
    const got = C.add({ [b.res]: b.stock });
    const n = Math.round(got[b.res] || 0);
    b.stock = 0; CF.Save.save();
    if (n > 0) { C.floaty(b, `+${n}`, b.res === 'chip' ? '#e9b949' : b.res === 'corp' ? '#3fd0c9' : '#9b7bff'); CF.Audio.sfx('correct'); for (let i = 0; i < 10; i++) C.coins.push({ x: (b.x + CB[b.type].size / 2) * TILE, y: b.y * TILE, vx: CF.rand(-60, 60), vy: CF.rand(-160, -60), t: 0, c: b.res }); }
    else CF.toast('仓库已满，升级仓库或大本营', 'bad');
  };
  C.limitFor = (type) => { const t = CB[type]; if (type === 'hq') return 1; if (t.perHq) return t.perHq * Math.max(1, C.hq()) / (type === 'tower' ? 1 : 1) | 0; if (type === 'statue') return 1; return 1 + Math.floor(C.hq() / 2); };
  C.count = (type) => data().b.filter((b) => b.type === type).length;
  C.fits = function (type, x, y, ignore) {
    const s = CB[type].size;
    if (x < 0 || y < 0 || x + s > COLS || y + s > ROWS) return false;
    return !data().b.some((b) => b !== ignore && x < b.x + CB[b.type].size && x + s > b.x && y < b.y + CB[b.type].size && y + s > b.y);
  };
  const canPay = (r, c) => r.chip >= c[0] && r.corp >= c[1] && r.comp >= c[2];
  const pay = (r, c) => { r.chip -= c[0]; r.corp -= c[1]; r.comp -= c[2]; };
  const costHtml = (c) => `<span class="c-chip">${Math.round(c[0])}</span> <span class="c-corp">${Math.round(c[1])}</span>${c[2] ? ` <span class="c-comp">${Math.round(c[2])}</span>` : ''}`;
  const fmtDur = (s) => (s >= HOUR ? `${Math.floor(s / HOUR)}时${Math.round((s % HOUR) / MIN)}分` : s >= MIN ? `${Math.floor(s / MIN)}分${Math.round(s % MIN)}秒` : `${Math.ceil(s)}秒`);

  // ---------- 界面 ----------
  let cv, ctx, raf, cam = { x: 0, y: 0, z: 1 }, sel = null, placing = null, moving = null, timer = 0, hoverT = null;
  C.coins = []; C.floats = [];
  C.floaty = function (b, txt, c) { const el = CF.h(`<div class="floaty" style="color:${c}">${txt}</div>`); const p = C.toScreen((b.x + CB[b.type].size / 2) * TILE, b.y * TILE); el.style.left = p[0] - 20 + 'px'; el.style.top = p[1] - 10 + 'px'; $('#scr-city').appendChild(el); setTimeout(() => el.remove(), 1100); };
  C.toScreen = (wx, wy) => [(wx - cam.x) * cam.z, (wy - cam.y) * cam.z];
  C.toWorld = (sx, sy) => [cam.x + sx / cam.z, cam.y + sy / cam.z];
  C.enter = function () {
    data(); C.tick();
    cv = $('#cityCanvas'); ctx = cv.getContext('2d');
    C.resize();
    const W = COLS * TILE, H = ROWS * TILE;
    cam.z = Math.min(cv.clientWidth / (W + 80), cv.clientHeight / (H + 150), 1.6);
    cam.x = W / 2 - cv.clientWidth / 2 / cam.z; cam.y = H / 2 - cv.clientHeight / 2 / cam.z + 20 / cam.z;
    sel = null; placing = null; moving = null;
    C.renderShop(); C.renderRes(); C.panel();
    clearInterval(timer); timer = setInterval(() => { C.tick(); C.renderRes(); if (sel) C.panel(); }, 1000);
    cancelAnimationFrame(raf);
    let last = performance.now();
    const loop = (now) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; C.coins.forEach((q) => { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; }); C.coins = C.coins.filter((q) => q.t < 0.8); C.render(); };
    raf = requestAnimationFrame(loop);
  };
  C.leave = function () { cancelAnimationFrame(raf); clearInterval(timer); CF.Save.save(); };
  C.resize = function () { const dpr = Math.min(2, window.devicePixelRatio || 1); C.dpr = dpr; cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
  C.renderRes = function () {
    const r = data().res, cap = C.cap();
    $('#cityRes').innerHTML = `<span class="c-chip">◆ ${Math.floor(r.chip)}</span><span class="c-corp">◆ ${Math.floor(r.corp)}</span><span class="c-comp">◆ ${Math.floor(r.comp)}</span><span class="cap">上限 ${cap} · 建造队列 ${C.busyCount()}/${C.builders()} · 加速 ×${CF.Save.data.boosts || 0}</span>`;
  };
  C.renderShop = function () {
    const box = $('#cityShop'); box.innerHTML = '';
    SHOP.forEach((type) => {
      const t = CB[type], c = t.cost[1], n = C.count(type), lim = C.limitFor(type), ok = n < lim && canPay(data().res, c);
      const b = CF.h(`<button class="cbtn ${ok ? '' : 'na'}" title="${t.desc}"><canvas width="68" height="68"></canvas><span>${t.name}</span><span class="c">${n}/${lim}</span></button>`);
      C.drawBuilding(b.querySelector('canvas').getContext('2d'), { type, lv: 1, x: 0, y: 0 }, 68 / (t.size * TILE + 10), 5, 10);
      b.onclick = () => { CF.Audio.sfx('click'); if (n >= lim) return CF.toast(`数量已达上限（升级大本营增加）`, 'bad'); if (!canPay(data().res, c)) return CF.toast(`资源不足：需要 ${Math.round(c[0])} 晶片 ${Math.round(c[1])} 语料`, 'bad'); placing = type; sel = null; C.panel(); CF.toast(`点击空地放置「${t.name}」（再点一次按钮取消）`); };
      box.appendChild(b);
    });
  };
  C.panel = function () {
    const p = $('#cityPanel');
    if (moving) { p.classList.remove('hidden'); p.innerHTML = `<h4>移动 ${CB[moving.type].name}</h4><p>点击新的位置。</p><button class="btn sm" id="cpCancel">取消</button>`; $('#cpCancel').onclick = () => { moving = null; C.panel(); }; return; }
    if (!sel) { p.classList.add('hidden'); return; }
    const b = sel, t = CB[b.type], now = Date.now(), next = t.cost[b.lv + 1], busy = b.busy > now;
    const hqCap = b.type === 'hq' ? t.max : Math.min(t.max, Math.max(1, C.hq()));
    const P = t.prod ? Object.keys(t.prod)[0] : null;
    p.classList.remove('hidden');
    p.innerHTML = `<h4>${t.name} <span class="pill">Lv ${b.lv}</span></h4><p>${t.desc}</p>${P ? `<p>产出 <b>${t.prod[P][b.lv]}</b>/小时 · 待收取 <b>${Math.floor(b.stock || 0)}</b></p>` : ''}${busy ? `<p class="timer">⏳ 升级中：${fmtDur((b.busy - now) / 1000)}</p>` : next && b.lv < hqCap ? `<p>升到 Lv ${b.lv + 1}：${costHtml(next)} · ${fmtDur(next[3])}</p>` : `<p class="small">${b.lv >= t.max ? '已满级' : '需要更高等级的大本营'}</p>`}<div class="row wrap" style="margin-top:6px">${P ? '<button class="btn sm primary" id="cpCol">收取</button>' : ''}${!busy && next && b.lv < hqCap ? '<button class="btn sm violet" id="cpUp">升级</button>' : ''}${busy ? `<button class="btn sm" id="cpBoost">⚡ 加速（剩 ${CF.Save.data.boosts || 0}）</button>` : ''}${b.type !== 'hq' ? '<button class="btn sm ghost" id="cpMove">移动</button>' : ''}<button class="btn sm ghost" id="cpX">✕</button></div>`;
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = () => { CF.Audio.sfx('click'); fn(); }; };
    on('cpCol', () => C.collect(b));
    on('cpUp', () => C.upgrade(b));
    on('cpBoost', () => C.boost(b));
    on('cpMove', () => { moving = b; sel = null; C.panel(); });
    on('cpX', () => { sel = null; C.panel(); });
  };
  C.upgrade = function (b) {
    const t = CB[b.type], next = t.cost[b.lv + 1], c = data();
    if (C.busyCount() >= C.builders()) return CF.toast(`建造队列已满（${C.builders()} 个工人）。大本营 3 级再加一个工人`, 'bad');
    if (!canPay(c.res, next)) return CF.toast('资源不足', 'bad');
    pay(c.res, next); b.busy = Date.now() + next[3] * 1000; b.target = b.lv + 1; CF.Save.save();
    CF.Audio.sfx('place'); C.renderRes(); C.renderShop(); C.panel();
  };
  C.boost = function (b) {
    const d = CF.Save.data;
    if (!(d.boosts > 0)) { CF.modal.open({ title: '⚡ 学习加速', body: '<p style="line-height:1.8">每获得 30 点学习经验（答题、实验、线下任务、情景决策都算）就会得到 1 次「学习加速」，每次让建造提前 10 分钟完成。<br><br>现实里的学习，会让你的城池长得更快。</p>', foot: [{ text: '去学院', cls: 'primary', onClick: () => { CF.modal.close(); CF.UI.show('academy'); } }] }); return; }
    d.boosts--; b.busy -= 10 * MIN * 1000; CF.Save.save(); CF.Audio.sfx('unlock'); C.tick(); C.renderRes(); C.panel(); C.floaty(b, '⚡ -10分钟', '#ffe08a');
  };
  C.place = function (type, gx, gy) {
    const t = CB[type], c = data(), cost = t.cost[1];
    if (!C.fits(type, gx, gy)) return CF.toast('这里放不下', 'bad');
    if (!canPay(c.res, cost)) return CF.toast('资源不足', 'bad');
    if (C.busyCount() >= C.builders() && cost[3] > 10) return CF.toast('工人都在忙', 'bad');
    pay(c.res, cost);
    const b = { id: c.nid++, type, x: gx, y: gy, lv: 0, target: 1, busy: Date.now() + cost[3] * 1000, stock: 0, t0: Date.now() };
    c.b.push(b); CF.Save.save(); CF.Audio.sfx('place');
    placing = null; sel = b; C.renderShop(); C.renderRes(); C.panel();
  };
  C.bind = function () {
    const c = $('#cityCanvas');
    let down = null, pinch = null; const P = new Map();
    const pt = (e) => { const r = CF.appRect(c), p = CF.appPoint(e.clientX, e.clientY); return { x: p.x - r.left, y: p.y - r.top }; };
    c.addEventListener('pointerdown', (e) => { CF.Audio.unlock(); const p = pt(e); P.set(e.pointerId, p); try { c.setPointerCapture(e.pointerId); } catch (er) {} if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; down = null; return; } down = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: false }; });
    c.addEventListener('pointermove', (e) => { const p = pt(e); if (P.has(e.pointerId)) P.set(e.pointerId, p); if (pinch && P.size >= 2) { const [a, b] = [...P.values()]; cam.z = CF.clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.5, 2.4); return; } hoverT = C.toWorld(p.x, p.y); if (!down) return; const dx = p.x - down.x, dy = p.y - down.y; if (Math.hypot(dx, dy) > 8) down.moved = true; if (down.moved) { cam.x = down.cx - dx / cam.z; cam.y = down.cy - dy / cam.z; } });
    c.addEventListener('pointerup', (e) => {
      P.delete(e.pointerId); if (pinch) { if (P.size < 2) pinch = null; return; }
      if (!down || down.moved) { down = null; return; } down = null;
      const [wx, wy] = C.toWorld(pt(e).x, pt(e).y), gx = Math.floor(wx / TILE), gy = Math.floor(wy / TILE);
      if (placing) { const s = CB[placing].size; return C.place(placing, gx - Math.floor((s - 1) / 2), gy - Math.floor((s - 1) / 2)); }
      if (moving) { const s = CB[moving.type].size, nx = gx - Math.floor((s - 1) / 2), ny = gy - Math.floor((s - 1) / 2); if (C.fits(moving.type, nx, ny, moving)) { moving.x = nx; moving.y = ny; CF.Save.save(); CF.Audio.sfx('place'); } else CF.toast('这里放不下', 'bad'); moving = null; C.panel(); return; }
      const b = data().b.find((q) => gx >= q.x && gx < q.x + CB[q.type].size && gy >= q.y && gy < q.y + CB[q.type].size);
      if (b && b.stock >= 1 && CB[b.type].prod && !b.busy) C.collect(b);
      sel = b || null; C.panel(); if (b) CF.Audio.sfx('hover');
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); cam.z = CF.clamp(cam.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.5, 2.4); }, { passive: false });
    $('#cityBack').onclick = () => CF.UI.show('lobby');
    $('#cityBoost').onclick = () => { if (sel && sel.busy > Date.now()) C.boost(sel); else CF.modal.open({ title: '⚡ 学习加速', body: `<p style="line-height:1.8">你有 <b>${CF.Save.data.boosts || 0}</b> 次学习加速。选中正在升级的建筑后点「加速」，每次提前 10 分钟。<br>每获得 30 点学习经验（答题、实验、线下任务、情景决策）得到 1 次。</p>`, foot: [{ text: '去学院赚加速', cls: 'primary', onClick: () => { CF.modal.close(); CF.UI.show('academy'); } }] }); };
    $('#cityRaid').onclick = () => C.raid();
    window.addEventListener('resize', () => CF.UI.cur === 'city' && C.resize());
  };

  // ---------- 渲染：漂浮在紫夜里的新生之城 ----------
  C.drawBuilding = function (x, b, s, ox, oy, beat = 0, t = 0) {
    const T = CB[b.type], n = T.size, W = n * TILE * s, Hh = Math.max(14, n * 12) * s, X = ox + b.x * TILE * s, Y = oy + b.y * TILE * s;
    const lift = beat * 2 * s;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(X + 3 * s, Y + n * TILE * s - 4 * s, W - 6 * s, 6 * s);
    if (b.type === 'tree') { x.fillStyle = '#5a3a2a'; x.fillRect(X + W / 2 - 3 * s, Y + W * 0.5, 6 * s, W * 0.4); x.fillStyle = '#4fbf6a'; x.fillRect(X + W * 0.2, Y + W * 0.12 - lift, W * 0.6, W * 0.42); x.fillStyle = '#7ee081'; x.fillRect(X + W * 0.3, Y + W * 0.05 - lift, W * 0.4, W * 0.2); return; }
    if (b.type === 'statue') { x.fillStyle = '#6c6680'; x.fillRect(X + W * 0.15, Y + W * 0.62, W * 0.7, W * 0.3); CF.Heroes.get('xs').draw(x, X + W * 0.08, Y + W * 0.18 - lift, W / 26, { t, strum: beat > 0.5 ? 1 : 0 }); return; }
    if (b.type === 'wall') { x.fillStyle = '#4a4560'; x.fillRect(X + 2 * s, Y + 10 * s, W - 4 * s, W - 14 * s); x.fillStyle = '#6c6680'; x.fillRect(X + 2 * s, Y + 6 * s, W - 4 * s, 8 * s); return; }
    // 主体：正面（暗）+ 屋顶（亮），像素立体
    const top = Y + n * TILE * s - Hh - W * 0.55;
    x.fillStyle = '#231c3a'; x.fillRect(X + 4 * s, top + W * 0.38, W - 8 * s, Hh + W * 0.15);
    x.fillStyle = T.roof; x.fillRect(X + 2 * s, top - lift, W - 4 * s, W * 0.42);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(X + 2 * s, top - lift, W - 4 * s, 4 * s);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(X + 2 * s, top + W * 0.36 - lift, W - 4 * s, 4 * s);
    // 窗户 / 符号
    x.fillStyle = beat > 0.6 ? '#ffe08a' : '#ffd98a99';
    for (let i = 0; i < n; i++) x.fillRect(X + (i * TILE + TILE * 0.35) * s, top + W * 0.5, TILE * 0.3 * s, 6 * s);
    x.fillStyle = '#1b1226'; x.font = `bold ${Math.max(8, 14 * s * Math.min(2, n))}px sans-serif`; x.textAlign = 'center';
    const icon = { hq: '★', chipmine: '◆', corpus: '文', compute: '∑', vault: '▣', lab: '⚗', herohall: '♛', barracks: '⚑', hall: '♫', tower: '▲' }[b.type] || '';
    x.fillText(icon, X + W / 2, top + W * 0.3 - lift); x.textAlign = 'left';
    // 等级点
    for (let i = 0; i < b.lv; i++) { x.fillStyle = '#ffe08a'; x.fillRect(X + 4 * s + i * 6 * s, Y + n * TILE * s - 10 * s, 4 * s, 4 * s); }
  };
  C.render = function () {
    const dpr = C.dpr, w = cv.clientWidth, h = cv.clientHeight, hero = CF.Heroes.current(), P = hero.pal, t = performance.now() / 1000, beat = CF.PixelFX.beat();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, P.bg[0]); g.addColorStop(0.7, P.bg[1]); g.addColorStop(1, '#ff9a5c55'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rs = CF.rng(9); ctx.fillStyle = '#ffffff88'; for (let i = 0; i < 70; i++) ctx.fillRect(rs() * w, rs() * h * 0.7, 1.5, 1.5);
    ctx.save(); ctx.translate(-cam.x * cam.z, -cam.y * cam.z); ctx.scale(cam.z, cam.z);
    const W = COLS * TILE, H = ROWS * TILE;
    // 浮岛
    ctx.fillStyle = '#120e22'; ctx.fillRect(-12, H, W + 24, 40); ctx.fillStyle = '#0b0818'; ctx.fillRect(10, H + 40, W - 20, 24);
    ctx.fillStyle = '#1c1730'; ctx.fillRect(-12, -12, W + 24, H + 24);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const d = Math.hypot(x - COLS / 2, y - ROWS / 2); const k = 0.04 + Math.max(0, beat - d * 0.05) * 0.25; ctx.fillStyle = (x + y) % 2 ? '#211b38' : '#1e1834'; ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2); if (k > 0.05) { ctx.fillStyle = `rgba(${P.grid},${k})`; ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2); } }
    // 建筑（按 y 排序）
    const list = data().b.slice().sort((a, b) => a.y + CB[a.type].size - (b.y + CB[b.type].size));
    const now = Date.now();
    for (const b of list) {
      const T = CB[b.type], n = T.size;
      if (sel === b) { ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.strokeRect(b.x * TILE, b.y * TILE, n * TILE, n * TILE); ctx.lineWidth = 1; }
      ctx.globalAlpha = b.lv === 0 ? 0.55 : 1;
      C.drawBuilding(ctx, b, 1, 0, 0, b.type === 'hall' || b.type === 'hq' ? beat : beat * 0.4, t);
      ctx.globalAlpha = 1;
      if (b.busy > now) { const tot = (T.cost[b.target || b.lv + 1] || [0, 0, 0, 1])[3] * 1000, p = 1 - (b.busy - now) / tot; ctx.fillStyle = '#000a'; ctx.fillRect(b.x * TILE + 4, b.y * TILE - 8, n * TILE - 8, 6); ctx.fillStyle = P.accent; ctx.fillRect(b.x * TILE + 4, b.y * TILE - 8, (n * TILE - 8) * CF.clamp(p, 0, 1), 6); ctx.strokeStyle = '#e9b94988'; ctx.setLineDash([4, 4]); ctx.strokeRect(b.x * TILE + 2, b.y * TILE + 2, n * TILE - 4, n * TILE - 4); ctx.setLineDash([]); }
      else if (T.prod && b.stock >= Math.max(5, T.prod[b.res || Object.keys(T.prod)[0]][b.lv] * 0.05)) { const bx = (b.x + n / 2) * TILE, by = b.y * TILE - 10 + Math.sin(t * 4 + b.id) * 3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 9, 0, TAU); ctx.fill(); ctx.fillStyle = b.res === 'chip' ? '#e9b949' : b.res === 'corp' ? '#3fd0c9' : '#9b7bff'; ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
    }
    // 广场中央：当前英雄在演奏
    const hq = data().b.find((b) => b.type === 'hq');
    if (hq) hero.draw(ctx, (hq.x + 3.2) * TILE, (hq.y + 1.6) * TILE, 2, { t, strum: beat > 0.5 ? 1 : 0, bob: beat > 0.7 ? 1 : 0 });
    // 放置虚影
    if ((placing || moving) && hoverT) { const type = placing || moving.type, s = CB[type].size, gx = Math.floor(hoverT[0] / TILE) - Math.floor((s - 1) / 2), gy = Math.floor(hoverT[1] / TILE) - Math.floor((s - 1) / 2), ok = C.fits(type, gx, gy, moving); ctx.fillStyle = ok ? '#6fdc8c44' : '#ff5d6c44'; ctx.fillRect(gx * TILE, gy * TILE, s * TILE, s * TILE); }
    for (const q of C.coins) { ctx.fillStyle = q.c === 'chip' ? '#e9b949' : q.c === 'corp' ? '#3fd0c9' : '#9b7bff'; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); }
    ctx.restore();
  };

  // ---------- 乱码入侵：用城池布局打一场防守战 ----------
  C.raid = function () {
    const c = data(), hqB = c.b.find((b) => b.type === 'hq'), S2 = 2, W = COLS * TILE * S2 + 600, H = ROWS * TILE * S2 + 500, ox = 300, oy = 250;
    const center = (b) => [ox + (b.x + CB[b.type].size / 2) * TILE * S2, oy + (b.y + CB[b.type].size / 2) * TILE * S2];
    const lv = C.hq(), waves = [];
    for (let i = 1; i <= 5; i++) { const w = CF.Levels.genWave(i + lv, 0.6 + lv * 0.15); waves.push(w); }
    const [cx, cy] = center(hqB);
    const L = {
      id: 'RAID', no: 'CITY', name: '乱码入侵', learn: '城防布局', raid: true,
      brief: `乱码军团盯上了你的城池（大本营 Lv ${lv}）。城墙、防御塔都会按你在主城里的摆放出现在战场上。守住 5 波！`,
      tip: '城墙挡在入口，防御塔放在城墙后面。英雄站在最危险的方向。',
      w: W, h: H, core: [cx, cy], hero: [cx + 90, cy + 40], cliffs: [], nodes: [['chip', cx - 160, cy + 140], ['corp', cx + 160, cy + 140]],
      spawns: [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40], [W / 2, 30], [W / 2, H - 30]], first: 25, gap: 28, waves,
      objectives: [{ text: '守住 5 波乱码入侵', test: (g) => g.wavesCleared() }],
      win: (g) => g.wavesCleared(),
      stars: [['获胜', () => true], ['主脑耐久 ≥ 70%', (g) => g.coreHpPct() >= 0.7], ['城墙与塔没有全灭', (g) => g.ents.some((e) => e.team === 0 && (e.type === 'turret' || e.type === 'barrier'))]],
      script: [[1, 'HERO', '它们来了！按我们的城防打！']],
      onInit(g) {
        c.b.forEach((b) => {
          if (b.type === 'hq' || b.lv === 0) return;
          const [x, y] = center(b);
          if (b.type === 'tower') { const e = g.addB('turret', 0, x, y, true); e.def = Object.assign({}, e.def, { atk: Object.assign({}, e.def.atk, { dmg: 14 + b.lv * 5, range: 220 + b.lv * 10 }) }); e.maxHp = e.hp = 400 + b.lv * 120; }
          else if (b.type === 'wall') { const e = g.addB('barrier', 0, x, y, true); e.maxHp = e.hp = 700 + b.lv * 400; }
          else if (b.type !== 'tree' && b.type !== 'statue') { const e = g.addB('depot', 0, x, y, true); e.def = Object.assign({}, e.def, { name: CB[b.type].name }); e.r = 18 + CB[b.type].size * 8; e.maxHp = e.hp = 500 + b.lv * 200; }
        });
      },
    };
    CF.UI.briefing(L);
  };
  // 学习经验 → 学习加速
  CF.bus.on('progress', () => {
    const d = CF.Save.data, c = data(), tot = d.xp.knowledge + d.xp.practice;
    if (c.boostBase === undefined) c.boostBase = tot;
    while (tot - c.boostBase >= 30) { c.boostBase += 30; d.boosts = (d.boosts || 0) + 1; CF.toast('⚡ 获得 1 次学习加速（主城建造提前 10 分钟）', 'gold', 2600); }
    CF.Save.save();
  });
  C.SHOP = SHOP; C.TILE = TILE;
})();
