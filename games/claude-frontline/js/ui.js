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
    if (name !== 'hero' && CF.Audio.mute) CF.Audio.mute.clear(); // 离开英雄档案时恢复合奏的全部声部
    if (UI.cur === 'battle' && name !== 'battle') UI.leaveBattle();
    if (UI.cur === 'quick' && name !== 'quick' && CF.Quick) CF.Quick.stop();
    if (UI.cur === 'city' && name !== 'city' && CF.City) CF.City.leave();
    if (UI.cur !== name) CF.PixelFX.wipe();
    CF.$$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    UI.cur = name;
    if (name !== 'hero') CF.Audio.play(MUSIC[name] || 'menu');
    const R = { lobby: () => CF.Lobby.render(), heroes: () => CF.Lobby.renderHeroes(), hero: () => CF.Lobby.renderHero(arg), campaign: UI.renderCampaign, academy: () => CF.Academy.render(), labs: () => CF.Academy.renderLabs(), profile: () => CF.Academy.renderProfile(), achievements: () => CF.Academy.renderAch(), settings: UI.renderSettings, shop: () => CF.Shop.render(), help: () => CF.Tutorial.renderHelp(), city: () => CF.City.enter() };
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
  // 安卓返回键 / 浏览器后退：关弹窗 → 战斗与快速模式先暂停 → 子页面回到上一页 → 大厅返回 'exit'
  UI.back = function () {
    if (CF.modal.isOpen()) { CF.modal.close(); return 'ok'; }
    if (UI.cur === 'battle') { UI.battleMenu(); return 'ok'; }
    if (UI.cur === 'quick') { CF.Quick.pause(); return 'ok'; }
    if (UI.cur === 'lobby') return 'exit';
    const bar = document.querySelector(`#scr-${UI.cur} .ultrabar`);
    UI.show((bar && bar.dataset.back) || 'lobby');
    return 'ok';
  };

  // ================= 征程：两大章（普通关 = 次级关 + 小关）+ 组队副本 =================
  const tierPill = (P) => { const [n, c] = CF.Chapters.Diff.tier(P); return `<span class="dpill" style="--dc:${c}">D${Math.round(P)} · ${n}</span>`; };
  UI.renderCampaign = function () {
    const body = $('#campaignBody'), d = CF.Save.data, C = CF.Chapters;
    body.innerHTML = `<div id="chapList"></div><div class="sec-title">沉浸模式 · 烧脑策略</div><div class="grid g2" id="imGrid"></div><div class="sec-title">遭遇战</div><div class="grid g3" id="skGrid"></div><p class="small muted" style="margin-top:14px;line-height:1.7">次级关（剧情关、第三章起为首领关）通关后不能重复挑战，剧情关还需要完成对应的学习才能解锁；小关可以反复挑战，积攒长期补给。每章固定掉落一种碎片或道具，已拥有的英雄碎片会自动转化为晶片。想先体验全部内容，可在「设置」里打开体验模式。</p>`;
    const host = $('#chapList');
    const afterName = (id) => { const L = CF.Levels.get(id); if (L) return L.name; const f = C.find(id); return f ? f.st.name : id; };
    C.CHAPTERS.forEach((ch) => {
      const list = C.stages(ch), won = list.filter((s) => C.cleared(s.id)).length, open = C.unlocked(ch, list[0]);
      const sec = CF.h(`<section class="chap ${open ? '' : 'shut'}"><div class="chap-hd"><canvas></canvas><div class="chap-t"><span class="t-tag">CHAPTER 0${ch.no} · ${ch.en}</span><b>第${'一二三四五六七'[ch.no - 1]}章「${ch.name}」</b><span class="small">${ch.sub}</span></div><div class="chap-drop"><span class="small">本章掉落</span><b>${C.fragName(ch)}</b><span class="small t-num">${C.fragProgress(ch)}</span></div><div class="chap-p"><b class="t-num">${won}/${list.length}</b><span class="small">普通关</span></div></div><div class="stage-path"></div></section>`);
      new CF.PixelFX.Stage(sec.querySelector('canvas'), { mode: 'bar', fx: 0.9, fy: 0.55, cell: 12 });
      const path = sec.querySelector('.stage-path');
      if (!open) { path.appendChild(CF.h(`<p class="small muted" style="grid-column:1/-1">通关第${'一二三四五六七'[ch.no - 2]}章全部普通关后开放（共 ${list.length} 关：${list.filter((x) => x.kind !== 'minor').length} 个次级关 + ${list.filter((x) => x.kind === 'minor').length} 个小关 + 1 个组队副本）。</p>`)); host.appendChild(sec); return; }
      list.forEach((st) => {
        const r = d.campaign[st.id] || {}, un = C.unlocked(ch, st), story = st.kind !== 'minor', L = st.kind === 'story' ? st.L : null;
        const name = L ? L.name : st.kind === 'boss' ? st.name : ch.names[(st.minorNo - 1) % ch.names.length];
        const gift = ch.no === 1 && !story && (st.minorNo === 3 || st.minorNo === 5) ? (st.minorNo === 3 ? 'omni' : 'pearl') : null;
        const el = CF.h(`<button class="stg ${story ? 'story' : 'minor'} ${un ? '' : 'locked'} ${r.won ? 'won' : ''}"><span class="stg-no t-num">${ch.no}-${st.i + 1}</span><span class="stg-kind">${st.kind === 'boss' ? '次级关 · 首领' : story ? '次级关' : '小关 ' + st.minorNo}</span><b>${name}</b><span class="stars">${'★'.repeat(r.stars || 0)}<i>${'★'.repeat(3 - (r.stars || 0))}</i></span>${tierPill(st.P)}${gift && !CF.Roster.owns(gift) ? `<span class="gift">${gift === 'omni' ? '首通集齐「万象」碎片' : '首通送「珠问」'}</span>` : ''}${story && r.won ? '<span class="stamp">已通关</span>' : ''}${!un ? `<span class="lock">${CF.Icons ? CF.Icons.svg('lock') : '🔒'}</span>` : ''}</button>`);
        el.onclick = () => {
          CF.Audio.sfx('click');
          if (!un) { const req = st.kind === 'story' ? C.storyReqs(st).filter((x) => !x.ok).map((x) => x.text) : []; CF.toast(req.length ? '解锁条件：' + req.join('；') : '先通关上一关', 'bad', 3200); CF.Audio.sfx('error'); return; }
          if (story && r.won && !CF.P.trial()) { CF.toast('次级关通关后不能重复挑战——去小关积攒补给吧'); return; }
          UI.briefing(C.level(ch, st));
        };
        path.appendChild(el);
      });
      // 组队副本
      const du = C.dungeonUnlocked(ch), left = C.attempts(ch), rw = C.dungeonRewards(ch);
      const dg = CF.h(`<button class="stg dungeon ${du ? '' : 'locked'}"><span class="stg-no t-num">${ch.no}-副本</span><span class="stg-kind">组队副本 · 5 波</span><b>${ch.dungeon.name}</b>${tierPill(ch.dungeon.P)}<span class="small">${du ? `今日剩余 ${left}/${C.ATTEMPTS} 次` : `通关「${afterName(ch.dungeon.after)}」后开放`}</span><span class="drw">${rw.map((x) => `<i title="${C.rewardText(x, ch)}">${x.wave}</i>`).join('')}</span><span class="gift">第 5 波：${C.fragName(ch)} ×3</span>${!du ? `<span class="lock">${CF.Icons ? CF.Icons.svg('lock') : '🔒'}</span>` : ''}</button>`);
      dg.onclick = () => { CF.Audio.sfx('click'); if (!du) { CF.toast(`先通关「${afterName(ch.dungeon.after)}」`, 'bad'); return; } if (left <= 0 && !CF.P.trial()) { CF.toast('今天的挑战次数用完了，明天再来（稀缺性规则：每天 3 次）'); return; } UI.briefing(C.dungeonLevel(ch, [])); };
      path.appendChild(dg);
      host.appendChild(sec);
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
  // 出征前选英雄：只能选已拥有的英雄（同时成为大厅的当前英雄与界面主题）
  UI.heroPicker = function (onPick) {
    const box = CF.h('<div class="hero-pick"></div>');
    if (!CF.Roster.owns(CF.Save.data.hero)) { CF.Save.data.hero = CF.Roster.STARTER; CF.Heroes.applyTheme(CF.Roster.STARTER); }
    CF.Heroes.list.forEach((h) => {
      const own = CF.Roster.owns(h.id);
      const b = CF.h(`<button class="${h.id === CF.Save.data.hero ? 'on' : ''} ${own ? '' : 'locked'}"><canvas width="144" height="112"></canvas>${h.name}${CF.Treasure.has(h.id) ? '' : '<small>无法宝</small>'}</button>`);
      const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 144, 112); h.draw(x, 22, 40, 4.2, { t: 0 });
      b.onclick = () => { if (!own) { CF.toast(`${h.name}：${CF.Roster.how(h.id)}`, 'bad', 2800); return; } CF.Save.data.hero = h.id; CF.Save.save(); CF.Heroes.applyTheme(h.id); CF.Audio.lick(h.id); CF.$$('button', box).forEach((y) => y.classList.remove('on')); b.classList.add('on'); onPick && onPick(h); };
      box.appendChild(b);
    });
    return box;
  };
  // 组队副本：选 2 位队友（已拥有的英雄优先；不够时由「援军」试用英雄补位）
  const GUESTS = ['twin', 'llama', 'abyss'];
  UI.matePicker = function (L) {
    const box = CF.h('<div class="hero-pick mates"></div>');
    const draw = () => {
      box.innerHTML = '';
      const main = CF.Save.data.hero;
      L.team = (L.team || []).filter((id) => id !== main);
      const pool = CF.Heroes.list.filter((h) => h.id !== main && (CF.Roster.owns(h.id) || GUESTS.includes(h.id)));
      if (!L._auto) { L._auto = true; pool.sort((a, b) => CF.Roster.owns(b.id) - CF.Roster.owns(a.id)).slice(0, 2).forEach((h) => L.team.push(h.id)); }
      pool.forEach((h) => {
        const on = L.team.includes(h.id), own = CF.Roster.owns(h.id);
        const b = CF.h(`<button class="${on ? 'on' : ''}"><canvas width="144" height="112"></canvas>${h.name}<small>${own ? '队友' : '援军 · 试用'}</small></button>`);
        const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 144, 112); h.draw(x, 22, 40, 4.2, { t: 0 });
        b.onclick = () => { if (on) L.team = L.team.filter((i) => i !== h.id); else { if (L.team.length >= 2) L.team.shift(); L.team.push(h.id); } CF.Audio.sfx('click'); draw(); };
        box.appendChild(b);
      });
    };
    draw(); box.redraw = draw;
    return box;
  };
  UI.briefing = function (L) {
    const b = CF.P.battleBonus(), C = CF.Chapters, ch = L.chapter ? C.CHAPTERS.find((c) => c.id === L.chapter) : null;
    const waves = L.waves && !L.immersive ? L.waves : null, maxT = waves ? Math.max(...waves.map(C.Diff.threatOf)) : 1;
    const kind = L.dungeon ? '组队副本 · 5 波 · 每波都有奖励' : L.story ? '次级关 · 3 波 · 通关后不可重复挑战' : L.minor ? '小关 · 3 波 · 可重复挑战' : '';
    const rewards = L.dungeon ? C.dungeonRewards(ch).map((r) => `<div class="small" style="line-height:1.9"><span class="c-chip">第 ${r.wave} 波</span> ${C.rewardText(r, ch)}</div>`).join('') : L.minor ? `<div class="small" style="line-height:1.9">每次通关：主城补给（晶片 / 语料 / 算力，按难度与星级）；首通双倍 + 学习加速 ×1</div>` : L.story ? `<div class="small" style="line-height:1.9">首通：主城补给${L.id === 'L3' ? ` + ${CF.Heroes.get(CF.Roster.STARTER).name}的法宝「${CF.Heroes.get(CF.Roster.STARTER).instrument}」` : ''}</div>` : '';
    const body = CF.h(`<div>${kind ? `<div class="row wrap" style="gap:6px;margin-bottom:8px"><span class="pill">${kind}</span>${L.P ? tierPill(L.P) : ''}</div>` : ''}<p style="line-height:1.8">${L.brief}</p><div class="sec-title">出战英雄</div><div id="bfPick"></div><p class="small muted" id="bfHero" style="margin-top:6px"></p>${L.dungeon ? '<div class="sec-title">队友（最多 2 位，AI 控制）</div><div id="bfMates"></div>' : ''}${waves ? `<div class="sec-title">波次强度</div><div class="wv">${waves.map((w, i) => `<div><i style="height:${Math.max(8, (C.Diff.threatOf(w) / maxT) * 100)}%"></i><span>${i + 1}${w.boss ? '★' : ''}</span></div>`).join('')}</div>` : ''}<div class="sec-title">任务目标</div>${L.objectives.map((o) => `<div class="small" style="line-height:1.9">◇ ${o.text}</div>`).join('')}${rewards ? `<div class="sec-title">奖励</div>${rewards}` : ''}<div class="sec-title">三星评价</div>${L.stars.map((s, i) => `<div class="small" style="line-height:1.9"><span class="c-chip">${'★'.repeat(i + 1)}</span> ${s[0]}</div>`).join('')}<div class="sec-title">你的学习与主城带来的加成</div>${b.lines.map((l) => `<div class="small muted" style="line-height:1.9">▸ ${l}</div>`).join('')}<div class="explain" style="margin-top:12px">💡 ${L.tip}</div><p class="small muted" style="margin-top:8px">消耗体力 ⚡ ${CF.Stamina.costOf(L)}（当前 ${CF.Stamina.unlimited() ? '无限' : CF.Stamina.cur()}）</p></div>`);
    let mates = null;
    const info = () => { const h = CF.Heroes.current(); body.querySelector('#bfHero').innerHTML = `<b style="color:var(--hero2)">${h.name}</b> · ${h.role} · 专属小兵「${h.minion.name}」· 专属建筑「${h.building.name}」${CF.Treasure.has(h.id) ? '' : ` · <span style="color:var(--pink)">未获得法宝「${h.instrument}」，终极技能不可用</span>`}`; if (mates) mates.redraw(); };
    body.querySelector('#bfPick').appendChild(UI.heroPicker(info));
    if (L.dungeon) { mates = UI.matePicker(L); body.querySelector('#bfMates').appendChild(mates); }
    info();
    const start = () => {
      if (L.dungeon && !CF.P.trial() && C.attempts(ch) <= 0) return CF.toast('今天的挑战次数用完了', 'bad');
      CF.modal.close();
      if (!CF.Stamina.spend(L)) return;
      if (L.dungeon && !CF.P.trial()) { CF.Save.data.dungeon[L.id].used++; CF.Save.save(); }
      UI.startBattle(L, true);
    };
    CF.modal.open({ title: `${L.no ? (/^\d/.test(L.no) ? '' : 'MISSION ') + L.no + ' · ' : ''}${L.name}`, body, foot: [{ text: '返回', cls: 'ghost' }, { text: '开始作战 ▶', cls: 'primary', onClick: start }] });
  };

  // ================= 战斗：开始 / 离开 =================
  let raf = 0, lastT = 0, frameN = 0;
  UI.startBattle = function (L, paid) {
    if (!paid && !CF.Stamina.spend(L)) return; // 体力：开战前扣除（学习类内容不消耗）
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
      if (UI.place) { UI.edgePan(dt); UI.updPlace(); }
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
    UI.buildMode(false);
    cancelAnimationFrame(raf);
    if (CF.Game.current) { CF.Game.current.destroy(); CF.Game.current = null; }
    UI.keys.clear(); UI.closeRadial();
    if (CF.Tutorial) CF.Tutorial.stop();
  };
  UI.compact = function () {
    const rot = $('#app').classList.contains('rotated');
    document.body.classList.toggle('compact', (rot ? window.innerWidth : Math.min(window.innerWidth, window.innerHeight)) <= 520);
    // 手机横屏：高度很小，大厅、主城走单独的紧凑布局
    document.body.classList.toggle('land', !rot && window.innerWidth > window.innerHeight && window.innerHeight <= 520);
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
  // ================= 放置模式：拖拽建造 + 网格吸附 + 镜头跟随 =================
  // 选好建筑后出现「虚影」：拖到任意格子（手指上方 48px 显示，避免被手指挡住），靠近屏幕边缘时镜头自动跟随；
  // 触屏点 ✓ 放置 / ✗ 取消；鼠标直接左键放置、右键或 Esc 取消，按住 Shift 连续建造。
  const TOUCH_LIFT = 48, EDGE = 64;
  UI.place = null;
  UI.startPlace = function (type, wx, wy, o = {}) {
    const g = CF.Game.current; if (!g) return;
    UI.closeRadial(); UI.aimKey = null; g.aim = null;
    g.build = { type, x: wx, y: wy }; g.updateGhost(wx, wy);
    UI.place = Object.assign({ type, dragging: false, pid: null, sx: null, sy: null, keep: false }, o);
    let bar = $('#placeBar');
    if (!bar) { bar = CF.h('<div id="placeBar" class="glass place-bar"><span class="pn"></span><button class="pb ok" title="放置">✓</button><button class="pb no" title="取消">✕</button></div>'); $('#field').appendChild(bar); bar.addEventListener('pointerdown', (e) => e.stopPropagation()); bar.querySelector('.ok').onclick = (e) => { e.stopPropagation(); UI.confirmPlace(); }; bar.querySelector('.no').onclick = (e) => { e.stopPropagation(); UI.cancelPlace(); }; }
    const d = CF.Game.BT[type]; bar.querySelector('.pn').innerHTML = `${d.name} <span class="c">${CF.Game.costHtml(d.cost)}</span>`;
    bar.classList.remove('hidden'); UI.updPlace();
    CF.Audio.sfx('hover'); CF.bus.emit('placing', type);
  };
  UI.movePlace = function (clientX, clientY, touch) {
    const g = CF.Game.current, P = UI.place; if (!g || !P || !g.build) return;
    P.sx = clientX; P.sy = clientY; P.touch = touch;
    const w = UI.worldAt(clientX, clientY, true); g.updateGhost(w[0], w[1] - (touch ? TOUCH_LIFT / g.cam.z : 0)); UI.updPlace();
  };
  UI.updPlace = function () {
    const g = CF.Game.current, bar = $('#placeBar'); if (!g || !g.build || !bar) return;
    const b = g.build, x = ((b.ok ? b.sx : b.x) - g.cam.x) * g.cam.z, y = ((b.ok ? b.sy : b.y) - g.cam.y) * g.cam.z;
    bar.style.left = CF.clamp(x, 70, g.vw - 70) + 'px'; bar.style.top = CF.clamp(y + 40 * g.cam.z + 8, 40, g.vh - 40) + 'px';
    bar.classList.toggle('bad', !b.ok); bar.title = b.ok ? '' : b.why;
  };
  // 拖到屏幕边缘时镜头跟随（每帧调用）
  UI.edgePan = function (dt) {
    const g = CF.Game.current, P = UI.place; if (!g || !P || !P.dragging || P.sx == null) return;
    const r = CF.appRect($('#gameCanvas')), p = CF.appPoint(P.sx, P.sy), lx = p.x - r.left, ly = p.y - r.top;
    let dx = 0, dy = 0; if (lx < EDGE) dx = -(EDGE - lx) / EDGE; else if (lx > r.width - EDGE) dx = (lx - r.width + EDGE) / EDGE; if (ly < EDGE) dy = -(EDGE - ly) / EDGE; else if (ly > r.height - EDGE) dy = (ly - r.height + EDGE) / EDGE;
    if (!dx && !dy) return;
    const sp = (620 * dt) / g.cam.z; g.cam.x += CF.clamp(dx, -1, 1) * sp; g.cam.y += CF.clamp(dy, -1, 1) * sp; g.clampCam(); UI.movePlace(P.sx, P.sy, P.touch);
  };
  UI.confirmPlace = function () {
    const g = CF.Game.current; if (!g || !g.build) return;
    const t = g.build.type; g.updateGhost(g.build.x, g.build.y);
    if (!g.build.ok) { CF.Audio.sfx('error'); CF.toast(g.build.why, 'bad'); return false; }
    g.placeBuild(UI.place && UI.place.keep); CF.bus.emit('built', t); return true;
  };
  UI.cancelPlace = function () { const g = CF.Game.current; if (g && g.build) g.cancelBuild(); else UI.buildMode(false); };
  UI.buildMode = function (on) { if (on) return; UI.place = null; const bar = $('#placeBar'); if (bar) bar.classList.add('hidden'); };
  // 放置模式下的全局拖动（从环形菜单拖出来时，手指已经不在画布上按下）
  window.addEventListener('pointermove', (e) => { const P = UI.place; if (P && P.dragging && P.fromRadial && e.pointerId === P.pid) UI.movePlace(e.clientX, e.clientY, e.pointerType !== 'mouse'); });
  window.addEventListener('pointerup', (e) => { const P = UI.place; if (!P || !P.dragging || !P.fromRadial || e.pointerId !== P.pid) return; P.dragging = false; P.fromRadial = false; if (e.pointerType === 'mouse' || (CF.Game.current && CF.Game.current.build && CF.Game.current.build.ok && !CF.UI.touch)) UI.confirmPlace(); });

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
      const locked = sk.key === 'R' && !CF.Treasure.has(hd.id);
      const b = CF.h(`<button class="sk ${sk.key === 'R' ? 'r' : ''} ${locked ? 'nofb' : ''}" title="${sk.name}：${locked ? '需要' + CF.Treasure.name(hd.id) : sk.desc}"><span class="key">${sk.key}</span>${CF.Icons ? CF.Icons.skill(hd.id, i) : ic[i]}<span class="cost">${CF.Skills.cost(g.hero, sk)}</span><i class="cdm"></i><span class="cdt"></span></button>`);
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
      // 可拖出的条目（建造）：按住条目直接拖到战场上——参考金铲铲把英雄拖上棋盘、英雄联盟手游拖动插眼
      let dn = null;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!it.drag || it.lock) return; dn = { x: e.clientX, y: e.clientY, id: e.pointerId };
        const mv = (ev) => { if (!dn || ev.pointerId !== dn.id) return; if (Math.hypot(ev.clientX - dn.x, ev.clientY - dn.y) > 14) { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up2); const d0 = dn; dn = null; b._dragged = true; UI.closeRadial(); it.drag(ev, d0); } };
        const up2 = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up2); dn = null; };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up2); });
      b.onclick = (e) => { e.stopPropagation(); if (b._dragged) return; CF.Audio.sfx('click'); const keep = it.fn(); if (!keep) UI.closeRadial(); else UI.refreshRadial && UI.refreshRadial(); };
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
        UI.startPlace(t, wx, wy);
      }, drag: un.ok && !ng ? (ev) => UI.startPlace(t, ...UI.worldAt(ev.clientX, ev.clientY, true), { dragging: true, pid: ev.pointerId, fromRadial: true, mouse: ev.pointerType === 'mouse' }) : null };
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
  UI.worldAt = function (cx, cy, clampIn) {
    const g = CF.Game.current, cv = $('#gameCanvas'); if (!g) return null;
    const r = CF.appRect(cv), p = CF.appPoint(cx, cy);
    let x = p.x - r.left, y = p.y - r.top;
    if (clampIn) { x = CF.clamp(x, 0, r.width); y = CF.clamp(y, 0, r.height); }
    else if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
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
      // 放置模式：按下就把虚影带到手指处并开始拖动（第二根手指按下则改为双指缩放）
      if (UI.place) {
        if (e.pointerType === 'mouse' && e.button === 2) { UI.cancelPlace(); return; }
        if (P.size === 1) { UI.place.dragging = true; UI.place.pid = e.pointerId; UI.place.fromRadial = false; UI.movePlace(e.clientX, e.clientY, e.pointerType !== 'mouse'); return; }
        UI.place.dragging = false;
      }
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
      if (UI.place && !pinch) { if ((UI.place.dragging && e.pointerId === UI.place.pid) || (e.pointerType === 'mouse' && !UI.place.dragging)) { UI.movePlace(e.clientX, e.clientY, e.pointerType !== 'mouse'); return; } }
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
      if (UI.place && UI.place.dragging && e.pointerId === UI.place.pid) { UI.place.dragging = false; if (e.pointerType === 'mouse') { UI.place.keep = e.shiftKey; UI.confirmPlace(); } return; }
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
        case 'Escape': if (UI.place) { UI.cancelPlace(); break; } UI.aimKey = null; g.aim = null; if (UI.radial) UI.closeRadial(); else UI.sel([]); break;
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
          UI.startPlace(t, m[0], m[1]);
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
      <div class="set-row"><span class="nm">英雄配音</span><div class="ctl"><select id="setVoice"><option value="auto">自动（系统中文语音，没有时用像素音）</option><option value="pixel">像素音</option><option value="off">关闭</option></select><span class="small muted" id="setVoiceEng"></span><button class="btn sm ghost" id="setVoiceTry">试听</button></div></div>
      <div class="set-row"><span class="nm">英雄音效</span><div class="ctl"><label class="check" style="padding:0"><input type="checkbox" id="setHeroSfx"><span>点击、打击音效使用主英雄的乐器（连续点击会弹出主题曲动机）</span></label></div></div>
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
        <button class="btn sm up">本地文件</button>${src && src.kind === 'blob' ? '<button class="btn sm ghost clr">清除</button>' : ''}<button class="btn sm ghost tr">▶ 试听</button>
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
    $('#setVoice').value = s.voice || 'auto'; $('#setVoiceEng').textContent = '当前：' + CF.Voice.engine(); $('#setVoice').onchange = (e) => { s.voice = e.target.value; CF.Save.save(); $('#setVoiceEng').textContent = '当前：' + CF.Voice.engine(); };
    $('#setVoiceTry').onclick = () => { CF.Audio.unlock(); CF.Voice.line(CF.Heroes.current()); };
    $('#setHeroSfx').checked = s.heroSfx !== false; $('#setHeroSfx').onchange = (e) => { s.heroSfx = e.target.checked; CF.Save.save(); };
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
    const L = g.L, next = L.chapter && win ? CF.Chapters.next(L.id) : null;
    const st = g.stats;
    const advice = win ? (CF.P.ratio().kPct > 0.35 ? '下一步：去实验室做一个实验，把知识变成手上的能力。' : '下一步：去学院完成今日修炼，解锁更多关卡与建筑。') : '失败也是数据。复盘：经济是否太慢？防线是否放在峡口？技能是否在敌人密集时释放？';
    const body = CF.h(`<div class="endstats">
      <div class="ultrabar" style="margin:0 0 12px;height:70px"><canvas></canvas><div class="ub-title" style="left:18px">${win ? '胜利' : '失败'}<span class="ub-sub">${win ? L.name : why || ''}</span></div></div>
      <div class="stars-big">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="small muted" style="text-align:center;margin-bottom:10px">${L.stars.map((s, i) => `${i < stars ? '✓' : '○'} ${s[0]}`).join('　')}</div>
      ${(g.stageRewards || g.waveRewards || []).length ? `<div class="explain gold" style="margin-bottom:10px">${(g.stageRewards || []).concat(g.waveRewards || []).map((l) => `<div>🎁 ${l}</div>`).join('')}</div>` : ''}
      ${g.cityReward ? `<div class="explain" style="margin-bottom:10px">🏰 主城仓库入账：<span class="c-chip">+${g.cityReward.chip}</span> <span class="c-corp">+${g.cityReward.corp}</span> <span class="c-comp">+${g.cityReward.comp}</span></div>` : ''}
      <div class="kpis"><div class="kpi"><div class="l">用时</div><div class="v">${CF.fmtTime(g.time)}</div></div><div class="kpi"><div class="l">消灭乱码</div><div class="v">${st.kills}</div></div><div class="kpi"><div class="l">我方损失</div><div class="v">${st.lost}</div></div><div class="kpi"><div class="l">建造 / 训练</div><div class="v">${st.built} / ${st.trained}</div></div><div class="kpi"><div class="l">技能释放</div><div class="v">${st.riffs}</div></div><div class="kpi"><div class="l">采集</div><div class="v" style="font-size:15px"><span class="c-chip">${Math.round(st.gathered.chip)}</span> <span class="c-corp">${Math.round(st.gathered.corp)}</span> <span class="c-comp">${Math.round(st.gathered.comp)}</span></div></div></div>
      <div class="sec-title">兵力曲线（单位总耐久）</div><canvas class="chart" id="chArmy"></canvas>
      <div class="sec-title">波次战损</div><canvas class="chart" id="chWave"></canvas>
      <div class="explain" style="margin-top:12px">📘 ${advice}</div></div>`);
    new CF.PixelFX.Stage(body.querySelector('.ultrabar canvas'), { mode: 'bar', fx: 0.86, fy: 0.55, cell: 12 });
    const foot = [{ text: '返回征程', cls: 'ghost', onClick: () => { CF.modal.close(); UI.show('campaign'); } }];
    if (!(L.story && win) && !L.dungeon) foot.push({ text: '再来一次', onClick: () => { CF.modal.close(); UI.startBattle(UI.relevel(L)); } });
    if (win && next) foot.push({ text: '下一关 ▶', cls: 'primary', onClick: () => { CF.modal.close(); UI.briefing(next); } });
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
    const need = UI.cur === 'battle' && portrait && coarse && !app.classList.contains('rotated') && !stayPortrait;
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
