/* 界面：页面切换、征程、设置、战斗 HUD（四角极简）与点击化输入、结算
 * 战斗 UI 规则：art/02-game-ui-constitution.md 第 6 章（UI 占比 ≤ 18%，战斗不遮挡） */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const UI = (CF.UI = { cur: 'lobby', selDirty: true, touch: false, keys: new Set() });
  const MUSIC = { lobby: 'menu', heroes: 'menu', hero: 'menu', campaign: 'menu', achievements: 'menu', settings: 'menu', help: 'menu', academy: 'academy', profile: 'academy', labs: 'lab', battle: 'battle', quick: 'quick', city: 'city' };
  UI.MUSIC = MUSIC;

  // ================= 页面切换 =================
  UI.show = function (name, arg) {
    if (UI.cur === 'battle' && name !== 'battle') UI.leaveBattle();
    if (UI.cur === 'quick' && name !== 'quick' && CF.Quick) CF.Quick.stop();
    if (UI.cur === 'city' && name !== 'city' && CF.City) CF.City.leave();
    if (UI.cur !== name) CF.PixelFX.wipe();
    CF.$$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    UI.cur = name;
    if (name !== 'hero') CF.Audio.play(MUSIC[name] || 'menu');
    const R = { lobby: () => CF.Lobby.render(), heroes: () => CF.Lobby.renderHeroes(), hero: () => CF.Lobby.renderHero(arg), campaign: UI.renderCampaign, academy: () => CF.Academy.render(), labs: () => CF.Academy.renderLabs(), profile: () => CF.Academy.renderProfile(), achievements: () => CF.Academy.renderAch(), settings: UI.renderSettings, help: () => CF.Tutorial.renderHelp(), city: () => CF.City.enter() };
    (R[name] || (() => {}))();
    UI.checkRotate();
  };
  CF.bus.on('modal:closed', () => {
    if (UI.cur === 'battle' || UI.cur === 'quick') return;
    setTimeout(() => {
      if (CF.modal.isOpen()) return;
      if (UI.cur !== 'hero') CF.Audio.play(MUSIC[UI.cur] || 'menu');
      ({ labs: () => CF.Academy.renderLabs(), academy: () => CF.Academy.render(), profile: () => CF.Academy.renderProfile(), campaign: UI.renderCampaign, lobby: () => CF.Lobby.render() }[UI.cur] || (() => {}))();
    }, 30);
  });
  UI.initUltrabars = function () {
    CF.$$('.ultrabar').forEach((bar) => {
      bar.innerHTML = `<canvas></canvas><button class="back" title="返回">←</button><div class="ub-title">${bar.dataset.title}<span class="ub-sub">${bar.dataset.sub || ''}</span></div><div class="ub-right"></div>`;
      bar._stage = new CF.PixelFX.Stage(bar.querySelector('canvas'), { mode: 'bar', fx: 0.9, fy: 0.55, cell: 12 });
      bar.querySelector('.back').onclick = () => { CF.Audio.sfx('click'); UI.show(bar.dataset.back || 'lobby'); };
    });
  };
  UI.heroName = () => CF.Heroes.current().name;

  // ================= 征程 =================
  UI.renderCampaign = function () {
    const body = $('#campaignBody'), d = CF.Save.data;
    body.innerHTML = `<div class="sec-title">战役</div><div class="levels" id="lvlGrid"></div><div class="sec-title">沉浸模式 · 烧脑策略</div><div class="grid g2" id="imGrid"></div><div class="sec-title">遭遇战</div><div class="grid g3" id="skGrid"></div><p class="small muted" style="margin-top:14px;line-height:1.7">关卡和部分建筑需要完成对应的学习才能解锁——学到的东西会变成战场上的能力。想先体验全部内容，可在「设置」里打开体验模式。</p>`;
    const grid = $('#lvlGrid');
    CF.Levels.LEVELS.forEach((L) => {
      const rec = d.campaign[L.id] || {}, unlocked = CF.P.levelUnlocked(L.id), reqs = CF.P.levelReqs(L.id);
      const el = CF.h(`<div class="lvl ${unlocked ? '' : 'locked'}"><div class="row between"><span class="no t-tag">MISSION ${L.no}</span><span class="stars">${'★'.repeat(rec.stars || 0)}<span style="color:#3a3357">${'★'.repeat(3 - (rec.stars || 0))}</span></span></div><h3>${unlocked ? '' : '🔒 '}${L.name}</h3><p>${L.brief.slice(0, 64)}…</p><span class="pill" style="align-self:flex-start;margin-top:6px">📘 ${L.learn}</span>${reqs.length ? `<div class="req">${reqs.map((r) => `<div class="${r.ok ? 'ok' : ''}">${r.ok ? '✓' : '○'} ${r.text}</div>`).join('')}</div>` : ''}${rec.best ? `<div class="tag" style="margin-top:6px">最快 ${CF.fmtTime(rec.best)}</div>` : ''}</div>`);
      el.onclick = () => { CF.Audio.sfx('click'); if (!unlocked) { CF.toast('先完成解锁条件（见卡片下方）', 'bad'); CF.Audio.sfx('error'); return; } UI.briefing(L); };
      grid.appendChild(el);
    });
    const im = $('#imGrid');
    (CF.Immersive ? CF.Immersive.LEVELS : []).forEach((L) => {
      const rec = d.campaign[L.id] || {};
      const el = CF.h(`<div class="card labcard"><div class="t-tag">IMMERSIVE · 参考魔兽争霸 3</div><h3 style="margin-top:4px">${L.name} <span class="stars" style="color:var(--gold)">${'★'.repeat(rec.stars || 0)}</span></h3><p>${L.brief}</p><p class="small" style="margin-top:6px;color:var(--hero2)">战争迷雾 · 野怪营地 · 英雄升级与物品 · 攻防类型 · 人口维护费 · 科技等级 · AI 对手 · 昼夜</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); UI.briefing(L); };
      im.appendChild(el);
    });
    const sk = $('#skGrid');
    Object.keys(CF.Levels.DIFF).forEach((k) => {
      const D = CF.Levels.DIFF[k];
      const el = CF.h(`<div class="card labcard"><div class="t-tag">SKIRMISH</div><h3>${D.name}</h3><p>随机地形，摧毁乱码主脑获胜。敌军强度 ×${D.mul}，波次间隔 ${D.gap}s。已获胜 ${d.skirmish[k] || 0} 次。</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); UI.briefing(CF.Levels.skirmish(k)); };
      sk.appendChild(el);
    });
  };
  // 出征前选英雄（同时成为大厅的当前英雄与界面主题）
  UI.heroPicker = function (onPick) {
    const box = CF.h('<div class="hero-pick"></div>');
    CF.Heroes.list.forEach((h) => {
      const b = CF.h(`<button class="${h.id === CF.Save.data.hero ? 'on' : ''}"><canvas width="144" height="112"></canvas>${h.name}</button>`);
      const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 144, 112); h.draw(x, 22, 34, 4.2, { t: 0 });
      b.onclick = () => { CF.Save.data.hero = h.id; CF.Save.save(); CF.Heroes.applyTheme(h.id); CF.Audio.lick(h.id); CF.$$('button', box).forEach((y) => y.classList.remove('on')); b.classList.add('on'); onPick && onPick(h); };
      box.appendChild(b);
    });
    return box;
  };
  UI.briefing = function (L) {
    const b = CF.P.battleBonus();
    const body = CF.h(`<div><p style="line-height:1.8">${L.brief}</p><div class="sec-title">出战英雄</div><div id="bfPick"></div><p class="small muted" id="bfHero" style="margin-top:6px"></p><div class="sec-title">任务目标</div>${L.objectives.map((o) => `<div class="small" style="line-height:1.9">◇ ${o.text}</div>`).join('')}<div class="sec-title">三星评价</div>${L.stars.map((s, i) => `<div class="small" style="line-height:1.9"><span class="c-chip">${'★'.repeat(i + 1)}</span> ${s[0]}</div>`).join('')}<div class="sec-title">你的学习与主城带来的加成</div>${b.lines.map((l) => `<div class="small muted" style="line-height:1.9">▸ ${l}</div>`).join('')}<div class="explain" style="margin-top:12px">💡 ${L.tip}</div></div>`);
    const info = () => { const h = CF.Heroes.current(); body.querySelector('#bfHero').innerHTML = `<b style="color:var(--hero2)">${h.name}</b> · ${h.role} · 专属小兵「${h.minion.name}」· 专属建筑「${h.building.name}」`; };
    body.querySelector('#bfPick').appendChild(UI.heroPicker(info)); info();
    CF.modal.open({ title: `MISSION ${L.no} · ${L.name}`, body, foot: [{ text: '返回', cls: 'ghost' }, { text: '开始作战 ▶', cls: 'primary', onClick: () => { CF.modal.close(); UI.startBattle(L); } }] });
  };

  // ================= 战斗：开始 / 离开 =================
  let raf = 0, lastT = 0, frameN = 0;
  UI.startBattle = function (L) {
    if (CF.Game.current) CF.Game.current.destroy();
    UI.show('battle');
    const g = (CF.Game.current = new CF.Game.Game(L));
    if (g.imInit) g.imInit();
    if (L.onInit) L.onInit(g);
    UI.lastLevel = L;
    UI.resizeBattle();
    g.cam.z = CF.clamp(Math.min(g.vw / 1250, g.vh / 720), 0.55, 1);
    g.centerOn(g.core.x + 260, g.core.y);
    UI.sel([]); UI.closeRadial(); UI.selDirty = true; UI.aimKey = null; g.aim = null;
    $('#foeCoreBox').classList.toggle('hidden', !g.gcore);
    $('#bossBar').classList.add('hidden'); $('#comms').classList.add('hidden');
    $('#mmBox').classList.toggle('min', document.body.classList.contains('compact') && window.innerWidth < 700);
    UI.buildSkillBar();
    UI.renderObj(true);
    if (CF.Tutorial) CF.Tutorial.maybeStart(g);
    cancelAnimationFrame(raf); lastT = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const g2 = CF.Game.current; if (!g2 || UI.cur !== 'battle') return;
      const dt = (now - lastT) / 1000; lastT = now;
      if (UI.keys.size && !CF.modal.isOpen()) { const sp = (700 * dt) / g2.cam.z; if (UI.keys.has('ArrowLeft')) g2.cam.x -= sp; if (UI.keys.has('ArrowRight')) g2.cam.x += sp; if (UI.keys.has('ArrowUp')) g2.cam.y -= sp; if (UI.keys.has('ArrowDown')) g2.cam.y += sp; g2.clampCam(); }
      g2.frame(dt);
      g2.render(UI.gctx, UI.dpr);
      frameN++;
      if (frameN % 3 === 0 && !$('#mmBox').classList.contains('min')) g2.renderMini(UI.mctx);
      if (frameN % 6 === 0) UI.hud();
      if (frameN % 4 === 0) UI.drawPortrait();
      UI.updRadial();
      if (CF.Tutorial) CF.Tutorial.tick(g2, dt);
      $('#pauseBadge').classList.toggle('hidden', !g2.paused);
    };
    raf = requestAnimationFrame(loop);
  };
  UI.leaveBattle = function () {
    cancelAnimationFrame(raf);
    if (CF.Game.current) { CF.Game.current.destroy(); CF.Game.current = null; }
    UI.keys.clear(); UI.closeRadial();
    if (CF.Tutorial) CF.Tutorial.stop();
  };
  UI.compact = function () {
    const rot = $('#app').classList.contains('rotated');
    document.body.classList.toggle('compact', (rot ? window.innerWidth : Math.min(window.innerWidth, window.innerHeight)) <= 520);
  };
  UI.resizeBattle = function () {
    UI.compact();
    const g = CF.Game.current, cv = $('#gameCanvas');
    const center = g && g.vw ? [g.cam.x + g.viewW() / 2, g.cam.y + g.viewH() / 2] : null;
    UI.dpr = Math.min(2, window.devicePixelRatio || 1) * (CF.Save.data.settings.quality === 'low' ? 0.75 : 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.max(1, Math.round(w * UI.dpr)); cv.height = Math.max(1, Math.round(h * UI.dpr));
    UI.gctx = cv.getContext('2d'); UI.gctx.imageSmoothingEnabled = false;
    UI.mctx = $('#miniCanvas').getContext('2d');
    if (g) { g.vw = w; g.vh = h; if (center) g.centerOn(center[0], center[1]); else g.clampCam(); }
  };

  // ================= HUD =================
  UI.hud = function () {
    const g = CF.Game.current; if (!g) return;
    $('#rChip').textContent = CF.fmtNum(g.res.chip); $('#rCorp').textContent = CF.fmtNum(g.res.corp); $('#rComp').textContent = CF.fmtNum(g.res.comp);
    $('#rChipR').textContent = `+${g.rate.chip.toFixed(0)}`; $('#rCorpR').textContent = `+${g.rate.corp.toFixed(0)}`; $('#rCompR').textContent = `+${g.rate.comp.toFixed(1)}`;
    const sup = $('#supTxt');
    if (g.supply) { sup.classList.remove('hidden'); sup.innerHTML = `人口 ${g.supply.used}/${g.supply.cap} · <span style="color:${g.upkeepMul < 1 ? (g.upkeepMul < 0.6 ? 'var(--bad)' : 'var(--gold)') : 'var(--good)'}">${g.upkeepMul < 1 ? (g.upkeepMul < 0.6 ? '高维护费' : '低维护费') : '无维护费'}</span>`; } else sup.classList.add('hidden');
    if (g.L.immersive) { $('#waveLbl').textContent = g.night ? '🌙 夜晚' : '☀ 白天'; $('#waveNo').textContent = CF.fmtTime(g.time); $('#waveCd').textContent = g.aiStatus || ''; }
    else {
      $('#waveLbl').textContent = '波次';
      $('#waveNo').textContent = g.L.endless ? g.wave : `${g.wave}/${g.L.waves.length}`;
      $('#waveCd').textContent = isFinite(g.waveTimer) && g.wave < (g.L.endless ? Infinity : g.L.waves.length) ? '· ' + CF.fmtTime(g.waveTimer) : g.spawnQ.length || g.ents.some((e) => e.team === 1 && e.kind === 'u') ? '· 清剿中' : '';
    }
    const tag = $('#waveTag'); tag.textContent = g.waveTag; tag.classList.toggle('hidden', !g.waveTag);
    $('#coreBar').style.width = g.coreHpPct() * 100 + '%'; $('#coreTxt').textContent = Math.round(g.coreHpPct() * 100) + '%';
    if (g.gcore) { const p = g.gcore.dead ? 0 : g.gcore.hp / g.gcore.maxHp; $('#foeBar').style.width = p * 100 + '%'; $('#foeTxt').textContent = Math.round(p * 100) + '%'; }
    if (g.boss && !g.boss.dead) $('#bossHp').style.width = (g.boss.hp / g.boss.maxHp) * 100 + '%';
    $('#bSpeed').textContent = g.speed + '×';
    $('#bPause').textContent = g.paused ? '▶' : '❚❚';
    $('#bResearch').classList.toggle('on', g.researchCd <= 0);
    UI.renderObj();
    UI.updSkillBar();
    UI.updSelChip();
    if (g.imHud) g.imHud();
  };
  UI.flashCore = function () { const b = $('#coreBar'); b.style.background = '#ff5d6c'; setTimeout(() => (b.style.background = ''), 200); };
  let objOpen = false;
  UI.renderObj = function (reset) {
    const g = CF.Game.current; if (!g) return;
    if (reset) objOpen = false;
    const el = $('#objPanel');
    const lines = g.L.objectives.map((o) => { let ok = false; try { ok = o.test(g); } catch (e) {} return { t: o.text, ok: ok && !o.keep }; });
    lines.sort((a, b) => a.ok - b.ok);
    el.className = 'hud-obj' + (objOpen ? ' open' : '');
    el.innerHTML = objOpen ? lines.map((l) => `<div>${l.ok ? '✓' : '◇'} ${l.t}</div>`).join('') : `◇ ${lines[0] ? lines[0].t : ''}${lines.length > 1 ? ' ▾' : ''}`;
  };
  UI.bossBar = function (u) {
    const el = $('#bossBar');
    if (!u) { el.classList.add('hidden'); return; }
    $('#bossName').textContent = '⚠ ' + u.def.name; $('#bossHp').style.width = '100%'; el.classList.remove('hidden');
    UI.say('乱码', `${u.def.name} 降临。`);
  };
  let commsT = 0;
  UI.say = function (who, text) {
    if (who === 'HERO') who = UI.heroName();
    UI.commsWho = who;
    $('#commsWho').textContent = who; $('#commsSay').textContent = text;
    const c = $('#comms'); c.classList.remove('hidden'); c.style.opacity = 1;
    clearTimeout(commsT); commsT = setTimeout(() => { c.style.opacity = 0; setTimeout(() => c.classList.add('hidden'), 300); }, 4600);
  };
  UI.buildMode = function () {};

  // ================= 英雄头像与技能（右下角，MOBA 式） =================
  UI.drawPortrait = function () {
    const g = CF.Game.current; if (!g) return;
    const cv = $('#portraitCv'), x = cv.getContext('2d'), h = g.hero, hd = g.heroDef;
    x.clearRect(0, 0, 132, 132);
    x.fillStyle = hd.pal.bg[1]; x.fillRect(0, 0, 132, 132);
    hd.draw(x, 12, 40, 5, { t: performance.now() / 1000, blink: false, noInst: true, bob: g.beat > 0.7 ? 1 : 0 });
    if (h.dead) { x.fillStyle = '#000b'; x.fillRect(0, 0, 132, 132); x.fillStyle = '#fff'; x.font = 'bold 34px ui-monospace,monospace'; x.textAlign = 'center'; x.fillText(Math.ceil(g.heroRespawn), 66, 78); x.textAlign = 'left'; }
    else { const p = h.hp / h.maxHp; x.lineWidth = 8; x.strokeStyle = '#0009'; x.beginPath(); x.arc(66, 66, 60, 0, Math.PI * 2); x.stroke(); x.strokeStyle = p > 0.5 ? '#6fdc8c' : p > 0.25 ? '#e9b949' : '#ff5d6c'; x.beginPath(); x.arc(66, 66, 60, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); x.stroke(); }
    $('#heroLv').textContent = g.heroLv ? 'Lv ' + g.heroLv : hd.name;
  };
  UI.buildSkillBar = function () {
    const g = CF.Game.current, bar = $('#skillBar'), hd = g.heroDef, ic = CF.Skills.ICON[hd.id];
    bar.innerHTML = '';
    hd.skills.forEach((sk, i) => {
      const b = CF.h(`<button class="sk ${sk.key === 'R' ? 'r' : ''}" title="${sk.name}：${sk.desc}"><span class="key">${sk.key}</span>${ic[i]}<span class="cost">${CF.Skills.cost(g.hero, sk)}</span><i class="cdm"></i><span class="cdt"></span></button>`);
      let down = null;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); CF.Audio.unlock(); down = { x: e.clientX, y: e.clientY, moved: false }; try { b.setPointerCapture(e.pointerId); } catch (er) {} });
      b.addEventListener('pointermove', (e) => { if (!down) return; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 18) { down.moved = true; if (sk.target !== 'self') UI.setAim(sk.key, e.clientX, e.clientY); } });
      b.addEventListener('pointerup', (e) => {
        if (!down) return; const mv = down.moved; down = null;
        if (sk.target === 'self') { g.heroCast(sk.key); UI.aimKey = null; g.aim = null; return; }
        if (mv) { const w = UI.worldAt(e.clientX, e.clientY); UI.aimKey = null; g.aim = null; if (w) g.heroCast(sk.key, w[0], w[1]); return; }
        if (UI.aimKey === sk.key) { UI.aimKey = null; g.aim = null; return; }
        UI.aimKey = sk.key; g.aim = { key: sk.key, x: g.hero.x + g.hero.face * 160, y: g.hero.y };
        CF.toast(`${sk.name}：点击战场选择${sk.target === 'dir' ? '方向' : '位置'}`);
      });
      bar.appendChild(b);
    });
  };
  UI.setAim = function (key, cx, cy) { const g = CF.Game.current, w = UI.worldAt(cx, cy); if (!w) return; g.aim = { key, x: w[0], y: w[1] }; };
  UI.updSkillBar = function () {
    const g = CF.Game.current, h = g.hero;
    CF.$$('#skillBar .sk').forEach((b, i) => {
      const sk = g.heroDef.skills[i], cd = h && !h.dead ? h.cd[sk.key] : 0, cost = h ? CF.Skills.cost(h, sk) : sk.cost;
      b.querySelector('.cdm').style.setProperty('--cd', (cd > 0 ? (cd / (sk.cd * (g.bonus.cdMul || 1))) * 100 : 0) + '%');
      b.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
      b.querySelector('.cost').textContent = cost;
      const lock = g.L.immersive && sk.key === 'R' && (g.heroLv || 1) < 6 && !CF.P.trial();
      b.classList.toggle('na', !h || h.dead || g.res.comp < cost || lock);
      b.classList.toggle('aim', UI.aimKey === sk.key);
    });
  };
  UI.updSelChip = function () {
    const g = CF.Game.current, chip = $('#selChip');
    const sel = g.sel.map((id) => g.get(id)).filter(Boolean);
    if (!sel.length) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    if (sel.length === 1) { const e = sel[0]; chip.textContent = `${e.heroId ? e.heroDef.name : e.def.name} · ${Math.ceil(e.hp)}/${Math.round(e.maxHp)}${g.imDesc ? g.imDesc(e) : ''}`; }
    else { const cnt = {}; sel.forEach((e) => (cnt[e.def.name] = (cnt[e.def.name] || 0) + 1)); chip.textContent = `已选 ${sel.length} · ` + Object.keys(cnt).map((n) => `${n}×${cnt[n]}`).join(' '); }
  };

  // ================= 环形菜单 =================
  const iconCache = {};
  UI.icon = function (kind, type) {
    const key = kind + type;
    if (!iconCache[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 52; const x = c.getContext('2d');
      const dummy = { beat: 0, strum: 0, hpBar() {}, drawFoe: CF.Game.Game.prototype.drawFoe };
      const d = kind === 'b' ? CF.Game.BT[type] : CF.Game.UT[type];
      const s = 18 / Math.max(14, d.r + 4);
      x.translate(26, 28); x.scale(s * 1.2, s * 1.2);
      const e = { type, x: 0, y: 0, r: d.r, def: d, done: true, hp: 1, maxHp: 1, team: 0, ang: -0.6, queue: [], face: 1, vx: 0, vy: 0, step: 0, air: false, id: 0, node: { type: 'chip' } };
      try { if (kind === 'b') CF.Game.Game.prototype.drawB.call(dummy, x, e, 0); else CF.Game.Game.prototype.drawU.call(dummy, x, e, 0); } catch (er) {}
      iconCache[key] = c;
    }
    const out = document.createElement('canvas'); out.width = out.height = 52; out.getContext('2d').drawImage(iconCache[key], 0, 0);
    return out;
  };
  UI.radial = null;
  UI.openRadial = function (wx, wy, items, anchor) {
    const el = $('#radial'); el.innerHTML = '<div class="rc"></div>'; el.classList.remove('hidden');
    const n = items.length, R = n <= 3 ? 64 : n <= 6 ? 78 : 92;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const b = CF.h(`<button class="rb ${it.na ? 'na' : ''} ${it.lock ? 'lock' : ''}" title="${CF.esc(it.tip || it.label)}" style="left:${Math.cos(a) * R}px;top:${Math.sin(a) * R}px;animation-delay:${i * 18}ms"></button>`);
      b.appendChild(it.icon instanceof HTMLElement ? it.icon : CF.h(`<span style="font-size:18px">${it.icon}</span>`));
      b.appendChild(CF.h(`<span>${it.label}</span>`));
      if (it.cost) b.appendChild(CF.h(`<span class="c">${CF.Game.costHtml(it.cost)}</span>`));
      if (it.q) b.appendChild(CF.h(`<span class="q">${it.q}</span>`));
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.onclick = (e) => { e.stopPropagation(); CF.Audio.sfx('click'); const keep = it.fn(); if (!keep) UI.closeRadial(); else UI.refreshRadial && UI.refreshRadial(); };
      el.appendChild(b);
    });
    UI.radial = { wx, wy, anchor, items };
    UI.updRadial();
  };
  UI.closeRadial = function () { const el = $('#radial'); el.classList.add('hidden'); el.innerHTML = ''; UI.radial = null; UI.refreshRadial = null; };
  UI.updRadial = function () {
    const g = CF.Game.current, r = UI.radial; if (!g || !r) return;
    if (r.anchor && (r.anchor.dead || !g.sel.includes(r.anchor.id))) return UI.closeRadial();
    const wx = r.anchor ? r.anchor.x : r.wx, wy = r.anchor ? r.anchor.y : r.wy;
    const el = $('#radial'); el.style.left = (wx - g.cam.x) * g.cam.z + 'px'; el.style.top = (wy - g.cam.y) * g.cam.z + 'px';
  };
  UI.buildRadial = function (wx, wy) {
    const g = CF.Game.current; if (!g) return;
    const items = g.buildOrder().map((t) => {
      const d = CF.Game.BT[t], un = g.L.immersive ? g.imBuildOk(t) : CF.P.buildUnlocked(t), ng = g.L.noGround && t === 'workshop';
      return { icon: UI.icon('b', t), label: d.name, cost: d.cost, na: !CF.Game.canPay(g.res, d.cost), lock: !un.ok || ng, tip: un.ok ? d.desc : un.why, fn: () => {
        if (!un.ok) { CF.toast('🔒 ' + un.why, 'bad', 3000); CF.Audio.sfx('error'); return; }
        if (ng) return CF.toast('本关地面工坊被干扰', 'bad');
        const r = g.checkBuild(t, wx, wy);
        if (!r[0]) { CF.toast(r[1], 'bad'); CF.Audio.sfx('error'); return true; }
        g.build = { type: t, x: wx, y: wy }; g.placeBuild(false); CF.bus.emit('built', t);
      } };
    });
    UI.openRadial(wx, wy, items);
  };
  UI.entityRadial = function (b) {
    const g = CF.Game.current, items = [];
    if (b.def.trains && b.done) g.trainList(b).forEach((t) => { const d = CF.Game.UT[t]; items.push({ icon: UI.icon('u', t), label: d.name, cost: d.cost, na: !CF.Game.canPay(g.res, d.cost), q: b.queue.filter((q) => q.type === t).length || '', lock: g.L.noGround && b.type === 'workshop', tip: d.desc, fn: () => { g.train(b, t); return true; } }); });
    if (b.type === 'core') { items.push({ icon: '🔬', label: '战地研究', tip: '答对一道题换资源', fn: () => g.research() }); if (g.imCoreItems) g.imCoreItems(b, items); }
    if (b.type !== 'core' && b.type !== 'ctx') items.push({ icon: '♻️', label: '拆除', tip: '返还部分造价', fn: () => g.sell(b) });
    if (!items.length) return;
    UI.openRadial(b.x, b.y, items, b);
    UI.refreshRadial = () => { if (UI.radial && UI.radial.anchor === b) setTimeout(() => { if (UI.radial && UI.radial.anchor === b) UI.entityRadial(b); }, 0); };
  };
  UI.sel = function (ids) {
    const g = CF.Game.current; if (!g) return;
    g.sel = ids; UI.selDirty = true;
    const one = ids.length === 1 ? g.get(ids[0]) : null;
    if (one && one.team === 0 && one.kind === 'b') UI.entityRadial(one); else if (UI.radial && UI.radial.anchor) UI.closeRadial();
    UI.updSelChip();
  };
  UI.selectHero = function () { const g = CF.Game.current; if (!g || g.hero.dead) return CF.toast(`${g ? g.heroDef.name : ''} 正在重生`); UI.sel([g.hero.id]); };

  // ================= 战斗输入：点一下就完成 =================
  UI.worldAt = function (cx, cy) {
    const g = CF.Game.current, cv = $('#gameCanvas'); if (!g) return null;
    const r = CF.appRect(cv), p = CF.appPoint(cx, cy);
    const x = p.x - r.left, y = p.y - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    return g.toWorld(x, y);
  };
  UI.bindBattle = function () {
    const cv = $('#gameCanvas');
    const local = (e) => { const r = CF.appRect(cv), p = CF.appPoint(e.clientX, e.clientY); return { x: p.x - r.left, y: p.y - r.top }; };
    const P = new Map();
    let pan = null, box = null, pinch = null, hold = null, lastTap = { t: 0, x: 0, y: 0 };
    const G = () => CF.Game.current;
    const clickFx = (x, y, c) => { const g = G(); g.fx.push({ k: 'ring', x, y, r: 0, max: 22, t: 0.3, c }); };
    const boxSelect = (b, add) => {
      const g = G(), [ax, ay] = g.toWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), [bx, by] = g.toWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      const ids = g.ents.filter((e) => e.team === 0 && e.kind === 'u' && e.type !== 'proto' && !e.dead && e.x >= ax && e.x <= bx && e.y >= ay && e.y <= by).map((e) => e.id);
      UI.sel(add ? [...new Set(g.sel.concat(ids))] : ids);
      if (ids.length) CF.bus.emit('boxsel', ids.length);
    };
    // 智能点击：一个动作完成选择 / 移动 / 攻击 / 建矿机
    const smart = (p, add, double) => {
      const g = G(), [wx, wy] = g.toWorld(p.x, p.y), e = g.pick(wx, wy), units = g.myUnits();
      if (UI.aimKey) { const k = UI.aimKey; UI.aimKey = null; g.aim = null; g.heroCast(k, wx, wy); return; }
      if (UI.radial) { UI.closeRadial(); if (!e) return; }
      if (e && e.type === 'temple' && g.imShop) { g.imShop(e); return; }
      if (e && e.team === 0) {
        if (double && e.kind === 'u') { UI.sel(g.ents.filter((o) => o.type === e.type && o.team === 0 && !o.dead && g.onScreen(o.x, o.y)).map((o) => o.id)); return; }
        if (add) UI.sel(g.sel.includes(e.id) ? g.sel.filter((i) => i !== e.id) : g.sel.concat(e.id)); else UI.sel([e.id]);
        CF.Audio.sfx('hover'); return;
      }
      if (units.length) {
        if (e && e.team !== 0 && (e.team === 1 || e.team === 2)) { g.orderAttack(units, e); clickFx(e.x, e.y, '#ff5d6c'); CF.Audio.sfx('click'); return; }
        g.orderMove(units, wx, wy, true); clickFx(wx, wy, '#6fdc8c'); CF.Audio.sfx('hover'); CF.bus.emit('moved'); return;
      }
      const b = g.sel.length === 1 ? g.get(g.sel[0]) : null;
      if (b && b.team === 0 && b.def.trains) { b.rally = { x: wx, y: wy }; clickFx(wx, wy, '#6fdc8c'); CF.toast('集结点已设置'); return; }
      const node = g.nodeAt(wx, wy);
      if (node && !node.miner) { const ok = CF.Game.canPay(g.res, CF.Game.BT.miner.cost); UI.openRadial(node.x, node.y, [{ icon: UI.icon('b', 'miner'), label: '矿机', cost: CF.Game.BT.miner.cost, na: !ok, fn: () => { const r = g.checkBuild('miner', node.x, node.y); if (!r[0]) { CF.toast(r[1], 'bad'); return; } g.build = { type: 'miner', x: node.x, y: node.y }; g.placeBuild(false); CF.bus.emit('built', 'miner'); } }]); return; }
      if (e) { UI.sel([e.id]); return; }
      if (double) UI.sel([]);
    };
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const g = G(); if (!g || g.over) return;
      CF.Audio.unlock();
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      const p = local(e);
      UI.touch = e.pointerType !== 'mouse';
      P.set(e.pointerId, { x: p.x, y: p.y });
      clearTimeout(hold && hold.t); hold = null;
      if (e.pointerType === 'mouse') {
        if (e.button === 0) { box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId, drag: false }; hold = { id: e.pointerId, p, t: setTimeout(() => { if (box && !box.drag) { box = null; const w = g.toWorld(p.x, p.y); UI.buildRadial(w[0], w[1]); } }, 520) }; }
        else { pan = { id: e.pointerId, x: p.x, y: p.y, cx: g.cam.x, cy: g.cam.y, moved: false, btn: e.button }; if (e.button === 1) e.preventDefault(); }
        return;
      }
      if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: g.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: g.cam.x, cy: g.cam.y }; pan = null; box = null; g.box = null; return; }
      pan = { id: e.pointerId, x: p.x, y: p.y, cx: g.cam.x, cy: g.cam.y, moved: false };
      // 长按：松手 → 环形建造；长按后拖动 → 框选
      hold = { id: e.pointerId, p, t: setTimeout(() => { if (pan && !pan.moved) { pan.held = true; box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId, drag: false }; if (navigator.vibrate) navigator.vibrate(12); CF.Audio.sfx('hover'); } }, 420) };
    });
    cv.addEventListener('pointermove', (e) => {
      const g = G(); if (!g) return;
      const p = local(e);
      if (P.has(e.pointerId)) P.set(e.pointerId, { x: p.x, y: p.y });
      if (e.pointerType === 'mouse') { const w = g.toWorld(p.x, p.y); g.mouse = w; if (UI.aimKey && g.aim) { g.aim.x = w[0]; g.aim.y = w[1]; } }
      if (pinch && P.size >= 2) { const [a, b] = [...P.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, z = CF.clamp(pinch.z * (d / pinch.d), 0.4, 2.2), wx = pinch.cx + pinch.mx / pinch.z, wy = pinch.cy + pinch.my / pinch.z; g.cam.z = z; g.cam.x = wx - mx / z; g.cam.y = wy - my / z; g.clampCam(); CF.bus.emit('camera'); return; }
      if (box && box.id === e.pointerId) { box.x1 = p.x; box.y1 = p.y; if (Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 8) { box.drag = true; g.box = box; clearTimeout(hold && hold.t); } return; }
      if (pan && pan.id === e.pointerId) {
        const dx = p.x - pan.x, dy = p.y - pan.y;
        if (Math.hypot(dx, dy) > 8) { pan.moved = true; clearTimeout(hold && hold.t); }
        if (pan.moved) { g.cam.x = pan.cx - dx / g.cam.z; g.cam.y = pan.cy - dy / g.cam.z; g.clampCam(); CF.bus.emit('camera'); }
        if (UI.aimKey && g.aim) { const w = g.toWorld(p.x, p.y); g.aim.x = w[0]; g.aim.y = w[1]; }
      }
    });
    const up = (e) => {
      const g = G(); P.delete(e.pointerId);
      clearTimeout(hold && hold.t);
      if (!g) return;
      const p = local(e);
      if (pinch) { if (P.size < 2) pinch = null; pan = null; return; }
      const now = performance.now(), dbl = now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
      if (e.pointerType === 'mouse') {
        if (box && box.id === e.pointerId) { if (box.drag) boxSelect(box, e.shiftKey); else { smart(p, e.shiftKey, dbl); lastTap = { t: now, x: p.x, y: p.y }; } box = null; g.box = null; }
        if (pan && pan.id === e.pointerId) {
          if (!pan.moved && pan.btn === 2) {
            if (UI.aimKey) { UI.aimKey = null; g.aim = null; }
            else { const w = g.toWorld(p.x, p.y), en = g.pick(w[0], w[1]); if (!g.myUnits().length && !(en && en.team === 0)) UI.buildRadial(w[0], w[1]); else smart(p, false, false); }
          }
          pan = null;
        }
        return;
      }
      if (box && box.id === e.pointerId) { if (box.drag) boxSelect(box, false); else { const w = g.toWorld(p.x, p.y); UI.buildRadial(w[0], w[1]); CF.bus.emit('longpress'); } box = null; g.box = null; pan = null; return; }
      if (pan && pan.id === e.pointerId) { const moved = pan.moved; pan = null; if (moved) return; smart(p, false, dbl); lastTap = { t: now, x: p.x, y: p.y }; }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { P.delete(e.pointerId); pan = null; box = null; pinch = null; clearTimeout(hold && hold.t); const g = G(); if (g) g.box = null; });
    cv.addEventListener('wheel', (e) => { const g = G(); if (!g) return; e.preventDefault(); const p = local(e); g.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); CF.bus.emit('camera'); }, { passive: false });
    // 小地图
    const mm = $('#miniCanvas');
    let mmDown = false;
    const mmGo = (e) => { const g = G(); if (!g) return; const r = CF.appRect(mm), pp = CF.appPoint(e.clientX, e.clientY); const x = ((pp.x - r.left) / r.width) * 320, y = ((pp.y - r.top) / r.height) * 200; g.centerOn((x - g.mmOx) / g.mmS, (y - g.mmOy) / g.mmS); CF.bus.emit('camera'); };
    mm.addEventListener('pointerdown', (e) => { mmDown = true; try { mm.setPointerCapture(e.pointerId); } catch (er) {} mmGo(e); });
    mm.addEventListener('pointermove', (e) => { if (mmDown) mmGo(e); });
    mm.addEventListener('pointerup', () => (mmDown = false));
    // 键盘：技能 QWR 对准鼠标位置快速施放
    window.addEventListener('keydown', (e) => {
      if (UI.cur !== 'battle') return;
      const g = G(); if (!g || g.over) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (CF.modal.isOpen()) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k.startsWith('Arrow')) { UI.keys.add(k); e.preventDefault(); return; }
      const units = g.myUnits(), one = g.sel.length === 1 ? g.get(g.sel[0]) : null, m = g.mouse || [g.hero.x + 120, g.hero.y];
      if (k === 'q' || k === 'w' || k === 'r') { g.heroCast(k.toUpperCase(), m[0], m[1]); return; }
      switch (k) {
        case ' ': case 'p': g.paused = !g.paused; e.preventDefault(); break;
        case 'Escape': UI.aimKey = null; g.aim = null; if (UI.radial) UI.closeRadial(); else UI.sel([]); break;
        case 'a': UI.sel(g.allArmy()); break;
        case 's': if (units.length) g.orderStop(units); break;
        case 'h': if (units.length) g.orderHold(units); break;
        case 'g': g.orderPush(units.length ? units : g.myUnits(g.allArmy())); break;
        case 'c': UI.selectHero(); if (!g.hero.dead) g.centerOn(g.hero.x, g.hero.y); break;
        case 'b': UI.buildRadial(m[0], m[1]); break;
        case 'k': g.research(); break;
        case 'f': g.speed = g.speed >= 3 ? 1 : g.speed + 1; break;
        case 'Delete': case 'Backspace': if (one && one.team === 0 && one.kind === 'b') g.sell(one); break;
        default: {
          const i = '12345678'.indexOf(k);
          if (i < 0) break;
          if (one && one.team === 0 && one.def.trains) { const t = g.trainList(one)[i]; if (t) g.train(one, t); if (UI.refreshRadial) UI.refreshRadial(); break; }
          const t = g.buildOrder()[i]; if (!t) break;
          const un = g.L.immersive ? g.imBuildOk(t) : CF.P.buildUnlocked(t); if (!un.ok) { CF.toast('🔒 ' + un.why, 'bad'); break; }
          const r = g.checkBuild(t, m[0], m[1]); if (!r[0]) { CF.toast(r[1], 'bad'); CF.Audio.sfx('error'); break; }
          g.build = { type: t, x: m[0], y: m[1] }; g.placeBuild(false); CF.bus.emit('built', t);
        }
      }
    });
    window.addEventListener('keyup', (e) => UI.keys.delete(e.key));
    window.addEventListener('blur', () => UI.keys.clear());
    // 角落按钮
    $('#bPause').onclick = () => { const g = G(); if (g) g.paused = !g.paused; CF.Audio.sfx('click'); };
    $('#bSpeed').onclick = () => { const g = G(); if (g) g.speed = g.speed >= 3 ? 1 : g.speed + 1; CF.Audio.sfx('click'); UI.hud(); };
    $('#bMenu').onclick = () => { CF.Audio.sfx('click'); UI.battleMenu(); };
    $('#bResearch').onclick = () => { const g = G(); if (g) g.research(); };
    $('#bMini').onclick = () => { $('#mmBox').classList.toggle('min'); CF.Audio.sfx('click'); };
    $('#objPanel').onclick = () => { objOpen = !objOpen; UI.renderObj(); };
    $('#fabBuild').onclick = () => { const g = G(); if (!g) return; CF.Audio.sfx('click'); const c = g.hero && !g.hero.dead && g.onScreen(g.hero.x, g.hero.y) ? [g.hero.x + 90, g.hero.y] : [g.cam.x + g.viewW() / 2, g.cam.y + g.viewH() / 2]; UI.buildRadial(c[0], c[1]); };
    $('#fabAll').onclick = () => { const g = G(); if (g) { UI.sel(g.allArmy()); CF.bus.emit('boxsel', g.allArmy().length); } CF.Audio.sfx('click'); };
    let lastPortrait = 0;
    $('#portrait').onclick = () => { const g = G(); if (!g) return; const now = performance.now(); UI.selectHero(); if (now - lastPortrait < 350 && !g.hero.dead) g.centerOn(g.hero.x, g.hero.y); lastPortrait = now; };
    $('#selChip').onclick = () => UI.sel([]);
    if (window.ResizeObserver) new ResizeObserver(() => UI.cur === 'battle' && UI.resizeBattle()).observe($('#field'));
  };

  // 战斗界面 UI 占比（采样统计 HUD 元素覆盖面积，验证 ≤ 18%）
  UI.hudRatio = function () {
    const f = $('#field'), fr = CF.appRect(f), step = 6;
    const rects = CF.$$('#field .hud > *, #comms, #bossBar').filter((el) => el.offsetParent !== null && !el.classList.contains('hidden')).map((el) => CF.appRect(el));
    let hit = 0, tot = 0;
    for (let y = fr.top; y < fr.top + fr.height; y += step) for (let x = fr.left; x < fr.left + fr.width; x += step) { tot++; if (rects.some((r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height)) hit++; }
    return tot ? hit / tot : 0;
  };

  UI.battleMenu = function () {
    const g = CF.Game.current; if (!g) return;
    const L = g.L, s = CF.Save.data.settings;
    const body = CF.h(`<div><p class="small muted">${L.brief}</p><div class="sec-title">目标</div>${L.objectives.map((o) => `<div class="small" style="line-height:1.8">◇ ${o.text}</div>`).join('')}<div class="sec-title">三星</div>${L.stars.map((x, i) => `<div class="small" style="line-height:1.8"><span class="c-chip">${'★'.repeat(i + 1)}</span> ${x[0]}</div>`).join('')}<div class="sec-title">学习加成</div>${g.bonus.lines.map((l) => `<div class="small muted" style="line-height:1.8">▸ ${l}</div>`).join('')}<div class="sec-title">声音</div><div id="bmVol"></div><div class="sec-title">操作速查</div><p class="small muted" style="line-height:1.8">点单位选中 · 点地面移动 · 点敌人攻击 · 点资源点建矿机 · 长按/右键空地建造 · 长按后拖动框选 · 点建筑训练 · 双指缩放 · 右下角技能（电脑 Q/W/R 对准鼠标）</p></div>`);
    const vol = body.querySelector('#bmVol');
    [['master', '总音量'], ['music', '音乐'], ['sfx', '音效']].forEach(([k, n]) => { const r = CF.h(`<div class="set-row" style="padding:4px 0"><span class="nm">${n}</span><div class="ctl"><input type="range" min="0" max="1" step="0.05" value="${s[k]}"></div></div>`); r.querySelector('input').oninput = (e) => { s[k] = +e.target.value; CF.Audio.applyVolumes(); CF.Save.save(); }; vol.appendChild(r); });
    CF.modal.open({ title: `简报 · ${L.name}`, body, foot: [{ text: '退出到征程', cls: 'ghost', onClick: () => { CF.modal.close(); UI.show('campaign'); } }, { text: '重新开始', onClick: () => { CF.modal.close(); UI.startBattle(UI.relevel(L)); } }, { text: '继续作战', cls: 'primary' }] });
  };
  UI.relevel = (L) => (L.skirmish ? CF.Levels.skirmish(L.skirmish) : L.immersive && CF.Immersive ? CF.Immersive.get(L.id) : L);

  // ================= 设置 =================
  UI.renderSettings = async function () {
    const body = $('#settingsBody'), s = CF.Save.data.settings, A = CF.Audio;
    body.innerHTML = `<div class="sec-title">音量</div><div id="vols"></div>
      <div class="sec-title">背景音乐（每个页面独立）</div>
      <p class="small muted" style="line-height:1.7;margin-bottom:8px">每个页面默认播放一首程序生成的吉他曲，紫色像素动效会跟着节拍跳动。你可以：① 换一种曲风；② 上传自己的音乐（mp3 / ogg / wav，保存在本浏览器）；③ 打包分享时，把文件放进 <span class="mono">music/</span> 文件夹并在 <span class="mono">js/config.js</span> 里填写路径。</p>
      <div id="bgmRows"></div>
      <div class="sec-title">画面与玩法</div>
      <div class="set-row"><span class="nm">画质</span><div class="ctl"><select id="setQ"><option value="high">高（推荐）</option><option value="low">低（旧手机更流畅）</option></select></div></div>
      <div class="set-row"><span class="nm">减少动效</span><div class="ctl"><label class="check" style="padding:0"><input type="checkbox" id="setRM"><span>关闭转场与大部分闪烁、波纹（对光敏感或晕动时建议开启）</span></label></div></div>
      <div class="set-row"><span class="nm">体验模式</span><div class="ctl"><label class="check" style="padding:0"><input type="checkbox" id="setTrial"><span>解锁全部关卡与建筑（适合先看看全貌；学习进度照常记录）</span></label></div></div>
      <div class="sec-title">存档</div>
      <div class="row wrap"><button class="btn" id="goProfile">导出 / 导入存档</button><button class="btn ghost" id="resetSave" style="color:var(--bad)">清空全部进度</button></div>`;
    const vols = $('#vols');
    [['master', '总音量'], ['music', '音乐'], ['sfx', '音效']].forEach(([k, n]) => {
      const row = CF.h(`<div class="set-row"><span class="nm">${n}</span><div class="ctl"><input type="range" min="0" max="1" step="0.05" value="${s[k]}"><span class="mono small" style="width:40px">${Math.round(s[k] * 100)}%</span></div></div>`);
      const inp = row.querySelector('input');
      inp.oninput = () => { s[k] = +inp.value; row.querySelector('.mono').textContent = Math.round(s[k] * 100) + '%'; A.applyVolumes(); CF.Save.save(); };
      vols.appendChild(row);
    });
    const rows = $('#bgmRows');
    for (const key of Object.keys(A.SCREENS)) {
      const src = await A.customSource(key);
      const style = (s.bgmStyle || {})[key] || A.DEFAULT_STYLE[key];
      const row = CF.h(`<div class="set-row"><span class="nm">${A.SCREENS[key]}</span><div class="ctl">
        <select class="sty">${['hero'].concat(Object.keys(A.STYLES)).map((k) => `<option value="${k}" ${k === style ? 'selected' : ''}>${k === 'hero' ? '当前英雄主题曲' : A.STYLES[k].name}</option>`).join('')}</select>
        <span class="src">${src ? '🎵 ' + CF.esc(src.name) : '程序吉他曲'}</span>
        <button class="btn sm up">上传</button>${src && src.kind === 'blob' ? '<button class="btn sm ghost clr">清除</button>' : ''}<button class="btn sm ghost tr">▶ 试听</button>
        <input type="file" accept="audio/*" class="hidden"></div></div>`);
      const file = row.querySelector('input[type=file]');
      row.querySelector('.sty').onchange = (e) => { s.bgmStyle = Object.assign({}, s.bgmStyle, { [key]: e.target.value }); CF.Save.save(); if (A.screen === key) A.restart(); };
      row.querySelector('.up').onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 40 * 1024 * 1024) { CF.toast('文件太大（上限 40MB）', 'bad'); return; }
        try { await A.DB.put(key, { name: f.name, blob: f }); CF.toast(`已设置「${A.SCREENS[key]}」的背景音乐`, 'good'); if (A.screen === key) A.restart(); UI.renderSettings(); }
        catch (e) { CF.toast('保存失败：浏览器不支持本地存储', 'bad'); }
      };
      const clr = row.querySelector('.clr');
      if (clr) clr.onclick = async () => { await A.DB.del(key); CF.toast('已恢复程序吉他曲'); if (A.screen === key) A.restart(); UI.renderSettings(); };
      row.querySelector('.tr').onclick = () => { A.unlock(); const prev = A.screen; A.screen = null; A.play(key); CF.toast(`试听：${A.SCREENS[key]}（离开设置页恢复）`); UI._restoreMusic = prev; };
      rows.appendChild(row);
    }
    $('#setRM').checked = !!s.reduceMotion; $('#setRM').onchange = (e) => { s.reduceMotion = e.target.checked; document.body.classList.toggle('reduce-motion', s.reduceMotion); CF.Save.save(); };
    $('#setQ').value = s.quality; $('#setQ').onchange = (e) => { s.quality = e.target.value; CF.Save.save(); };
    $('#setTrial').checked = !!s.trial; $('#setTrial').onchange = (e) => { s.trial = e.target.checked; CF.Save.save(); CF.P._unlockSnapshot = CF.P.unlockSnapshot(); CF.toast(s.trial ? '体验模式已开启' : '体验模式已关闭'); };
    $('#goProfile').onclick = () => UI.show('profile');
    $('#resetSave').onclick = () => CF.modal.open({ title: '清空全部进度？', body: '<p>经验、实验、实践日志、战役记录都会被删除，且无法恢复。建议先导出存档。</p>', foot: [{ text: '取消', cls: 'ghost' }, { text: '确认清空', cls: 'primary', onClick: () => { CF.Save.reset(); CF.modal.close(); CF.toast('已清空'); UI.show('lobby'); } }] });
  };

  UI.endScreen = function (g, win, stars, why) {
    if (CF.Game.current !== g) return;
    if (CF.Tutorial) CF.Tutorial.stop();
    UI.closeRadial();
    CF.Audio.play(win ? 'victory' : 'defeat');
    CF.Audio.sfx(win ? 'win' : 'lose');
    const L = g.L, idx = CF.Levels.LEVELS.findIndex((x) => x.id === L.id), next = idx >= 0 ? CF.Levels.LEVELS[idx + 1] : null;
    const st = g.stats;
    const advice = win ? (CF.P.ratio().kPct > 0.35 ? '下一步：去实验室做一个实验，把知识变成手上的能力。' : '下一步：去学院完成今日修炼，解锁更多关卡与建筑。') : '失败也是数据。复盘：经济是否太慢？防线是否放在峡口？技能是否在敌人密集时释放？';
    const body = CF.h(`<div class="endstats">
      <div class="ultrabar" style="margin:0 0 12px;height:70px"><canvas></canvas><div class="ub-title" style="left:18px">${win ? '胜利' : '失败'}<span class="ub-sub">${win ? L.name : why || ''}</span></div></div>
      <div class="stars-big">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="small muted" style="text-align:center;margin-bottom:10px">${L.stars.map((s, i) => `${i < stars ? '✓' : '○'} ${s[0]}`).join('　')}</div>
      ${g.cityReward ? `<div class="explain" style="margin-bottom:10px">🏰 主城仓库入账：<span class="c-chip">+${g.cityReward.chip}</span> <span class="c-corp">+${g.cityReward.corp}</span> <span class="c-comp">+${g.cityReward.comp}</span></div>` : ''}
      <div class="kpis"><div class="kpi"><div class="l">用时</div><div class="v">${CF.fmtTime(g.time)}</div></div><div class="kpi"><div class="l">消灭乱码</div><div class="v">${st.kills}</div></div><div class="kpi"><div class="l">我方损失</div><div class="v">${st.lost}</div></div><div class="kpi"><div class="l">建造 / 训练</div><div class="v">${st.built} / ${st.trained}</div></div><div class="kpi"><div class="l">技能释放</div><div class="v">${st.riffs}</div></div><div class="kpi"><div class="l">采集</div><div class="v" style="font-size:15px"><span class="c-chip">${Math.round(st.gathered.chip)}</span> <span class="c-corp">${Math.round(st.gathered.corp)}</span> <span class="c-comp">${Math.round(st.gathered.comp)}</span></div></div></div>
      <div class="sec-title">兵力曲线（单位总耐久）</div><canvas class="chart" id="chArmy"></canvas>
      <div class="sec-title">波次战损</div><canvas class="chart" id="chWave"></canvas>
      <div class="explain" style="margin-top:12px">📘 ${advice}</div></div>`);
    new CF.PixelFX.Stage(body.querySelector('.ultrabar canvas'), { mode: 'bar', fx: 0.86, fy: 0.55, cell: 12 });
    const foot = [{ text: '返回征程', cls: 'ghost', onClick: () => { CF.modal.close(); UI.show('campaign'); } }, { text: '再来一次', onClick: () => { CF.modal.close(); UI.startBattle(UI.relevel(L)); } }];
    if (win && next && CF.P.levelUnlocked(next.id)) foot.push({ text: '下一关 ▶', cls: 'primary', onClick: () => { CF.modal.close(); UI.briefing(next); } });
    else if (win) foot.push({ text: '去学院', cls: 'primary', onClick: () => { CF.modal.close(); UI.show('academy'); } });
    CF.modal.open({ title: win ? '作战报告 · 胜利' : '作战报告 · 失败', body, foot, closable: false });
    setTimeout(() => { UI.chartArmy(body.querySelector('#chArmy'), st.army); UI.chartWave(body.querySelector('#chWave'), st.waves); }, 40);
  };
  function chartSetup(cv) { const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [x, w, h]; }
  UI.chartArmy = function (cv, data) {
    const [x, w, h] = chartSetup(cv), pad = 28;
    if (data.length < 2) { x.fillStyle = '#9d96ad'; x.fillText('数据不足', 12, 20); return; }
    const T = data[data.length - 1].t || 1, M = Math.max(1, ...data.map((d) => Math.max(d.me, d.foe)));
    const X = (t) => pad + (t / T) * (w - pad - 10), Y = (v) => h - 20 - (v / M) * (h - 34);
    x.strokeStyle = '#2b2641'; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(pad, Y((M * i) / 4)); x.lineTo(w - 10, Y((M * i) / 4)); x.stroke(); }
    [['me', '#d97757', '我方'], ['foe', '#ff4f9a', '乱码']].forEach(([k, c, n], j) => {
      x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); data.forEach((d, i) => (i ? x.lineTo(X(d.t), Y(d[k])) : x.moveTo(X(d.t), Y(d[k])))); x.stroke();
      x.fillStyle = c; x.fillRect(w - 110 + j * 52, 8, 10, 3); x.fillStyle = '#ede6d6'; x.font = '11px sans-serif'; x.fillText(n, w - 96 + j * 52, 13);
    });
    x.lineWidth = 1; x.fillStyle = '#9d96ad'; x.font = '10px ui-monospace,monospace'; x.fillText('0', pad - 10, h - 18); x.fillText(CF.fmtTime(T), w - 40, h - 6);
  };
  UI.chartWave = function (cv, waves) {
    const [x, w, h] = chartSetup(cv), pad = 28;
    if (!waves.length) { x.fillStyle = '#9d96ad'; x.fillText('没有波次数据', 12, 20); return; }
    const M = Math.max(1, ...waves.map((d) => Math.max(d.lost, d.killed))), bw = Math.min(40, (w - pad - 10) / waves.length);
    waves.forEach((d, i) => {
      const bx = pad + i * bw + 3, hk = (d.killed / M) * (h - 36), hl = (d.lost / M) * (h - 36);
      x.fillStyle = '#ff4f9a'; x.fillRect(bx, h - 20 - hk, bw / 2 - 3, hk);
      x.fillStyle = '#d97757'; x.fillRect(bx + bw / 2 - 2, h - 20 - hl, bw / 2 - 3, hl);
      x.fillStyle = '#9d96ad'; x.font = '10px ui-monospace,monospace'; x.fillText(String(d.n), bx + bw / 2 - 6, h - 6);
    });
    x.fillStyle = '#ff4f9a'; x.fillRect(w - 150, 8, 10, 3); x.fillStyle = '#ede6d6'; x.font = '11px sans-serif'; x.fillText('消灭乱码', w - 136, 13);
    x.fillStyle = '#d97757'; x.fillRect(w - 76, 8, 10, 3); x.fillStyle = '#ede6d6'; x.fillText('我方损失', w - 62, 13);
  };

  // ================= 通讯头像 =================
  UI.initComms = function () {
    new CF.PixelFX.Stage($('#commsCv'), {
      mode: 'portrait', fx: 0.42, fy: 0.62, cell: 8, radius: 14,
      drawChar(ctx, fx, fy, px) {
        const who = UI.commsWho;
        if (who === '侦察Agent') { CF.PixelFX.drawClawd(ctx, fx - 6.5 * px, fy - 6 * px, px, { noGuitar: true, tint: '#f0a080' }); ctx.fillStyle = '#b3abea'; ctx.fillRect(fx, fy - 9 * px, px, 3 * px); return true; }
        if (who === '乱码') { ctx.fillStyle = '#ff4f9a'; ctx.font = `bold ${px * 10}px ui-monospace,monospace`; ctx.fillText('#?%'[Math.floor(performance.now() / 120) % 3], fx - px * 4, fy + px * 3); return true; }
        if (who === '指挥官' && CF.Labs.drawAvatar(ctx, fx - px * 7, fy - px * 8, px * 14)) return true;
        return false;
      },
    });
  };

  // ================= 横屏提示 =================
  let stayPortrait = false;
  UI.checkRotate = function () {
    const app = $('#app'), portrait = window.innerHeight > window.innerWidth, coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    if (!portrait) app.classList.remove('rotated');
    UI.compact();
    const need = (UI.cur === 'battle' || UI.cur === 'city') && portrait && coarse && !app.classList.contains('rotated') && !stayPortrait;
    $('#rotateHint').classList.toggle('show', need);
    if (UI.cur === 'battle') setTimeout(UI.resizeBattle, 60); else UI.compact();
  };
  UI.initRotate = function () {
    $('#rhRotate').onclick = async () => {
      CF.Audio.unlock();
      try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* 不支持则用 CSS 旋转 */ }
      setTimeout(() => { if (window.innerHeight > window.innerWidth) $('#app').classList.add('rotated'); UI.checkRotate(); }, 350);
    };
    $('#rhStay').onclick = () => { stayPortrait = true; UI.checkRotate(); };
    window.addEventListener('resize', UI.checkRotate);
    window.addEventListener('orientationchange', () => setTimeout(UI.checkRotate, 200));
  };

  // ================= 健康提醒 =================
  UI.initBreak = function () {
    let active = 0;
    setInterval(() => {
      if (document.hidden) return;
      active += 10; CF.Save.data.stats.playSec += 10;
      if (active % 60 === 0) CF.Save.save();
      if (active >= 25 * 60) {
        active = 0;
        CF.toast('已专注 25 分钟：起身远眺 20 秒，拉伸肩颈 💪', 'gold', 6000);
        if (UI.cur === 'battle') UI.say('HERO', '指挥官，休息一下眼睛吧。体能也是战斗力。');
      }
    }, 10000);
  };
})();
