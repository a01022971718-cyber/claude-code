/* 豆豆的田园厨房 · 《造月之路》版接线（源文件 farm-zy-src/zy-farm.js，由 tools/farm-zy-build.mjs 复制到 zy/）
 *
 * 原版的功能、数据、存档一样不动，这里只把造月之路的「做法」接上：
 *  1. 主题英雄（UI 宪法第 2.2 章）：界面主光 / 点缀 / 背景三色跟着英雄换（CF.Heroes.applyTheme）。
 *     从造月之路进来时网址带 ?hero=英雄id，自动跟随游戏里的主英雄；单独打开时在左上角「主题英雄」里选。
 *  2. 像素脉冲舞台（第 1 章招牌动效）：顶部状态栏、厨房 / 小馆 / 学习的页眉、每个弹窗的页眉，
 *     都是英雄配色的像素方格随节拍波动，页眉右侧是英雄本人在演奏自己的乐器。
 *  3. 四位一体（第 10 章）：背景音乐默认是主题英雄的主题曲（造月之路的合成器原样搬来），节拍驱动界面光效（--beat）；
 *     原版的三首小曲、上传音乐都还在设置里，选它们时动效按那首曲子的速度跳。录音时音乐自动停（原版逻辑）。
 *  4. 像素转场（第 3 章）：切换农场 / 厨房 / 小馆 / 学习时英雄色方块擦过屏幕。
 *  5. 像素图标（第 12 章）：底部导航换成造月之路的 12×12 像素图标。
 *  一键关掉：主题英雄面板里关闭「造月之路主题」，立刻恢复原版外观和原版背景音乐。 */
(function () {
  const CF = window.CF;
  if (!CF || !CF.Heroes || !CF.PixelFX || !CF.Audio) return;
  const A = CF.Audio, H = CF.Heroes, root = document.documentElement;
  CF.Treasure = CF.Treasure || { has: () => true };   // 田园里每位英雄都带着乐器演奏
  CF.Save.load();                                       // 只读：不往造月之路的存档里写任何东西

  // ---------- 设置（只存在本页：主题英雄、开关） ----------
  const KEY = 'zy-farm-ui';
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cfg = {}; }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 隐私模式 */ } };
  const ids = H.list.map((h) => h.id);
  const qh = new URLSearchParams(location.search).get('hero');
  if (qh && ids.includes(qh)) { cfg.hero = qh; keep(); }
  if (!ids.includes(cfg.hero)) cfg.hero = 'zaole';
  CF.Save.data.hero = cfg.hero;
  const on = () => root.classList.contains('zy');
  const farmOk = () => typeof S !== 'undefined' && S && S.cfg;

  // ---------- 背景音乐：英雄主题曲 + 节拍 ----------
  let heroMusic = false;
  function syncVol() {
    const st = CF.Save.data.settings, i = farmOk() ? (S.cfg.bgmVol ?? 1) : 1;
    st.music = [0.3, 0.55, 0.85][i] ?? 0.55; st.master = 0.9;
    if (A.ctx && A.applyVolumes) A.applyVolumes();
  }
  function music(play) {
    heroMusic = play;
    if (play) { A.unlock(); syncVol(); A.screen = null; A.play('menu'); }
    else { if (A.ctx) A.stopAll(); A.screen = null; }
  }
  const ORIG_DEF = { farm: 'gen:field', map: 'gen:happy', mod: 'gen:happy' };
  if (typeof bgmPlay === 'function' && typeof bgmStop === 'function') {
    const play0 = bgmPlay, stop0 = bgmStop;
    window.bgmStop = function () { if (heroMusic) music(false); return stop0(); };
    window.bgmPlay = function (track) {
      if (!farmOk() || !S.cfg.bgmOn || BGM.paused) track = '';
      if (track === 'zy:hero' && !on()) track = ORIG_DEF[String(BGM_CTX).startsWith('mod:') ? 'mod' : BGM_CTX] || 'gen:field';
      if (track === 'zy:hero') { if (BGM.cur === 'zy:hero' && heroMusic) return; stop0(); BGM.cur = 'zy:hero'; music(true); return; }
      if (heroMusic) music(false);
      return play0(track);
    };
  }
  // 节拍：英雄主题曲由引擎给出真实节拍；原版小曲 / 上传音乐按曲速补节拍；不放音乐时慢速呼吸（静止的界面视为未完成）
  const pull0 = A.pullBeats.bind(A);
  let fb = null;
  A.pullBeats = function () {
    const out = pull0();
    if (heroMusic || !on()) return out;
    const c = (typeof BGM !== 'undefined' && BGM.cur) || '';
    const bpm = c.startsWith('gen:') ? ((BGM_GEN[c.slice(4)] || {}).bpm || 96) : c.startsWith('up:') ? 100 : 60;
    const now = performance.now() / 1000;
    if (!fb || fb.bpm !== bpm || now - fb.next > 2) fb = { bpm, next: now, n: 0 };
    while (now >= fb.next) { fb.n++; out.push({ s: c ? (fb.n % 4 === 1 ? 0.95 : 0.6) : 0.4, strum: fb.n % 2 === 1 }); fb.next += 60 / bpm; }
    return out;
  };
  window.addEventListener('pointerdown', () => { A.unlock(); if (heroMusic) { A.screen = null; A.play('menu'); } }, { once: true, capture: true });

  // ---------- 像素脉冲舞台 ----------
  const STG = new Map();
  function stage(host, opts, cls) {
    cls = cls || 'zy-stage';
    if (!host || host.querySelector(':scope > canvas.' + cls)) return;
    const cv = document.createElement('canvas'); cv.className = cls; cv.setAttribute('aria-hidden', 'true');
    host.insertAdjacentElement('afterbegin', cv);
    STG.set(cv, new CF.PixelFX.Stage(cv, Object.assign({ mode: 'bar', fx: 0.88, fy: 0.55, cell: 12 }, opts)));
  }
  const TAB_IC = { farm: 'sprout', kitchen: 'flame', diner: 'plate', words: 'book' };
  function decorate() {
    const hud = document.querySelector('#hud .hud-in');
    // 「主题英雄」入口：底部导航最右边一格（和造月之路大厅导航的「英雄」一样）；关掉主题后也在，随时能打开
    const tabs = document.querySelector('#tabs');
    if (tabs && !tabs.querySelector('.zy-herotab')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'zy-herotab'; b.title = '主题英雄：配色、音乐、动效都跟着换'; b.setAttribute('aria-label', '选择主题英雄');
      b.innerHTML = '<span class="zy-hcv"></span><span class="zy-tl">英雄</span>';
      tabs.appendChild(b);
      stage(b.querySelector('.zy-hcv'), { mode: 'portrait', cell: 5, fx: 0.5, fy: 0.62, charPx: 1.25, radius: 10 });
      b.addEventListener('click', (e) => { e.stopPropagation(); picker(); });
    }
    if (!on()) return;
    stage(hud, { showChar: false, cell: 10, fx: 0.5, radius: 40 });
    document.querySelectorAll('.vhead, .fl-head').forEach((v) => stage(v, { fx: 0.9 }));
    document.querySelectorAll('#layers .sheet').forEach((s) => {
      if (s.querySelector(':scope > .zy-sheet-head') || s.querySelector('.fl-head') || s.closest('.layer.full')) return;   // 全屏流程有自己的页眉舞台
      const hd = document.createElement('div'); hd.className = 'zy-sheet-head'; hd.setAttribute('aria-hidden', 'true');
      s.insertAdjacentElement('afterbegin', hd); stage(hd, { fx: 0.86 });
    });
    document.querySelectorAll('#tabs [data-v]').forEach((b) => {
      if (b.querySelector('.zy-ic') || !TAB_IC[b.dataset.v]) return;
      const s = document.createElement('span'); s.className = 'zy-ic'; s.innerHTML = CF.Icons.svg(TAB_IC[b.dataset.v]); b.insertAdjacentElement('afterbegin', s);
    });
    for (const [cv, st] of STG) if (!cv.isConnected) { st.destroy(); STG.delete(cv); }
  }
  let pend = 0;
  new MutationObserver(() => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; decorate(); }); })
    .observe(document.body, { childList: true, subtree: true });

  // ---------- 像素转场 ----------
  if (typeof go === 'function') {
    const go0 = go;
    window.go = function (v) { if (on() && typeof VIEW !== 'undefined' && v !== VIEW) CF.PixelFX.wipe(); return go0.apply(this, arguments); };
  }

  // ---------- 主题英雄面板 ----------
  function picker() {
    document.querySelectorAll('.zy-pick').forEach((x) => x.remove());
    const ov = document.createElement('div'); ov.className = 'zy-pick';
    ov.innerHTML = `<div class="zy-pick-card" role="dialog" aria-modal="true" aria-label="主题英雄"><div class="zy-sheet-head"></div>
      <div class="zy-pick-body"><h3>主题英雄 <span class="zy-tag">THEME HERO</span></h3>
      <p class="zy-dim">选一位英雄：界面配色、背景音乐、像素动效都跟着他走（《造月之路》界面宪法 · 四位一体）。</p>
      <div class="zy-pick-grid">${H.list.map((h) => `<button type="button" class="zy-hero ${h.id === cfg.hero ? 'on' : ''}" data-id="${h.id}" style="--c:${h.pal.glow};--c2:${h.pal.accent}"><span class="zy-hcv"></span><b>${h.name}</b><small>${h.instrument || ''}</small></button>`).join('')}</div>
      <div class="zy-pick-foot"><label class="zy-switch"><input type="checkbox" ${on() ? 'checked' : ''}><span>造月之路主题</span><small class="zy-dim">关掉恢复原版外观</small></label><button type="button" class="zy-btn" data-x>好的</button></div></div></div>`;
    document.body.appendChild(ov);
    stage(ov.querySelector('.zy-sheet-head'), { fx: 0.86 });
    ov.querySelectorAll('.zy-hero').forEach((b) => stage(b.querySelector('.zy-hcv'), { mode: 'portrait', hero: b.dataset.id, cell: 6, fx: 0.5, fy: 0.6, charPx: 2.4, radius: 14 }));
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-x]')) return close();
      const hb = e.target.closest('.zy-hero');
      if (hb) {
        cfg.hero = hb.dataset.id; CF.Save.data.hero = cfg.hero; keep(); H.applyTheme(cfg.hero);
        ov.querySelectorAll('.zy-hero').forEach((x) => x.classList.toggle('on', x === hb));
        if (heroMusic) { A.screen = null; A.play('menu'); }
        CF.PixelFX.wipe();
      }
    });
    ov.querySelector('.zy-switch input').addEventListener('change', (e) => setOn(e.target.checked));
    addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', esc); } });
  }
  function setOn(v) {
    cfg.off = !v; keep();
    root.classList.toggle('zy', v);
    if (v) { H.applyTheme(cfg.hero); decorate(); }
    if (typeof BGM !== 'undefined') { BGM.cur = null; try { bgmSet(); } catch (e) { /* 田园还没加载完 */ } }
  }

  // ---------- 启动 ----------
  if (!cfg.off) { root.classList.add('zy'); H.applyTheme(cfg.hero); }
  if (typeof BGM !== 'undefined') { BGM.cur = null; try { bgmSet(); } catch (e) { /* 田园还没加载完 */ } }
  decorate();
  // 关掉主题时也要能找回开关：设置面板里加一个入口
  CF.ZyFarm = { picker, setOn, cfg };
})();
