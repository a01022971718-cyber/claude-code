/* 界面：菜单、征程、设置、帮助、战斗 HUD 与输入、结算 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const UI = (CF.UI = { cur: 'menu', selDirty: true, tab: 'build', boxMode: false, touch: false });
  const MUSIC = { menu: 'menu', campaign: 'menu', achievements: 'menu', settings: 'menu', help: 'menu', academy: 'academy', profile: 'academy', labs: 'lab', battle: 'battle' };

  // ================= 页面切换 =================
  UI.show = function (name) {
    if (UI.cur === 'battle' && name !== 'battle') UI.leaveBattle();
    CF.$$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    UI.cur = name;
    CF.Audio.play(MUSIC[name] || 'menu');
    ({ menu: UI.renderMenuProfile, campaign: UI.renderCampaign, academy: () => CF.Academy.render(), labs: () => CF.Academy.renderLabs(), profile: () => CF.Academy.renderProfile(), achievements: () => CF.Academy.renderAch(), settings: UI.renderSettings, help: UI.renderHelp }[name] || (() => {}))();
    UI.checkRotate();
  };

  // 关闭弹窗后刷新当前页面（实验星级、打卡状态等），并恢复该页面的背景音乐
  CF.bus.on('modal:closed', () => {
    if (UI.cur === 'battle') return;
    setTimeout(() => {
      if (CF.modal.isOpen()) return;
      CF.Audio.play(MUSIC[UI.cur] || 'menu');
      ({ labs: () => CF.Academy.renderLabs(), academy: () => CF.Academy.render(), profile: () => CF.Academy.renderProfile(), campaign: UI.renderCampaign, menu: UI.renderMenuProfile }[UI.cur] || (() => {}))();
    }, 30);
  });
  UI.initUltrabars = function () {
    CF.$$('.ultrabar').forEach((bar) => {
      bar.innerHTML = `<canvas></canvas><button class="back" title="返回">←</button><div class="ub-title">${bar.dataset.title}<span class="ub-sub">${bar.dataset.sub || ''}</span></div><div class="ub-right"></div>`;
      new CF.PixelFX.Stage(bar.querySelector('canvas'), { mode: 'bar', fx: 0.9, fy: 0.55, cell: 12 });
      bar.querySelector('.back').onclick = () => { CF.Audio.sfx('click'); UI.show('menu'); };
    });
  };

  // ================= 主菜单 =================
  const MENU = [['campaign', '征程', '战役五关 · 遭遇战'], ['academy', '学院', '今日修炼 · 测验 · 线下任务'], ['labs', '实验室', '8 个动手实验'], ['profile', '成长档案', '配比 · 雷达 · 日志'], ['achievements', '成就', ''], ['settings', '设置', '声音 · 背景音乐'], ['help', '玩法说明', '']];
  UI.initMenu = function () {
    const st = new CF.PixelFX.Stage($('#menuStage'), { mode: 'full', fx: 0.74, fy: 0.56, cell: 28, radius: 34 });
    UI.menuStage = st;
    const fit = () => { const w = window.innerWidth, h = window.innerHeight; if (w < 760 || h > w) { st.o.fx = 0.62; st.o.fy = 0.86; st.o.charPx = Math.max(4, Math.floor(Math.min(w, h) / 70)); } else { st.o.fx = 0.74; st.o.fy = 0.56; st.o.charPx = 0; } };
    fit(); window.addEventListener('resize', fit);
    const list = $('#menuList');
    let active = 0;
    const bars = MENU.map(([id, n, sub], i) => {
      const b = CF.h(`<button class="mbar"><canvas></canvas><span>${n}</span>${sub ? `<small>${sub}</small>` : ''}</button>`);
      new CF.PixelFX.Stage(b.querySelector('canvas'), { mode: 'bar', fx: 0.88, fy: 0.55, cell: 11, activeFn: () => active === i && UI.cur === 'menu' });
      b.onmouseenter = () => { if (active !== i) { active = i; sync(); CF.Audio.sfx('hover'); } };
      b.onfocus = () => { active = i; sync(); };
      b.onclick = () => { CF.Audio.unlock(); CF.Audio.sfx('click'); UI.show(id); };
      list.appendChild(b);
      return b;
    });
    const sync = () => bars.forEach((b, i) => b.classList.toggle('on', i === active));
    sync();
    window.addEventListener('keydown', (e) => {
      if (UI.cur !== 'menu' || CF.modal.isOpen()) return;
      if (e.key === 'ArrowDown') { active = (active + 1) % bars.length; sync(); bars[active].focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = (active + bars.length - 1) % bars.length; sync(); bars[active].focus(); e.preventDefault(); }
    });
  };
  UI.renderMenuProfile = function () {
    const rk = CF.P.rank(), r = CF.P.ratio(), d = CF.Save.data, plan = CF.P.dailyPlan();
    $('#menuProfile').innerHTML = `<div class="row between"><span class="rk">${rk.name}</span><span class="mono muted">${rk.xp} XP</span></div><div class="bar" style="margin:6px 0"><i style="width:${rk.prog * 100}%;background:var(--gold)"></i></div><div class="row between muted"><span>连续 ${d.streak.count} 天</span><span>今日修炼 ${plan.done.length}/${plan.items.length}</span></div><div class="row between muted" style="margin-top:4px"><span>知识 : 实操</span><span class="mono">${r.t ? Math.round(r.kPct * 100) + ' : ' + Math.round(r.pPct * 100) : '— : —'}<span class="tag"> 目标 30:70</span></span></div>`;
  };

  // ================= 征程 =================
  UI.renderCampaign = function () {
    const body = $('#campaignBody'), d = CF.Save.data;
    body.innerHTML = `<div class="sec-title">战役</div><div class="levels" id="lvlGrid"></div><div class="sec-title">遭遇战</div><div class="grid g3" id="skGrid"></div><p class="small muted" style="margin-top:14px;line-height:1.7">关卡和部分建筑需要完成对应的学习才能解锁——这是设计：学到的东西会变成战场上的能力。想先体验全部内容，可在「设置」里打开体验模式。</p>`;
    const grid = $('#lvlGrid');
    CF.Levels.LEVELS.forEach((L) => {
      const rec = d.campaign[L.id] || {}, unlocked = CF.P.levelUnlocked(L.id), reqs = CF.P.levelReqs(L.id);
      const el = CF.h(`<div class="lvl ${unlocked ? '' : 'locked'}"><div class="row between"><span class="no">MISSION ${L.no}</span><span class="stars">${'★'.repeat(rec.stars || 0)}<span style="color:#3a3357">${'★'.repeat(3 - (rec.stars || 0))}</span></span></div><h3>${unlocked ? '' : '🔒 '}${L.name}</h3><p>${L.brief.slice(0, 64)}…</p><span class="pill" style="align-self:flex-start;margin-top:6px">📘 ${L.learn}</span>${reqs.length ? `<div class="req">${reqs.map((r) => `<div class="${r.ok ? 'ok' : ''}">${r.ok ? '✓' : '○'} ${r.text}</div>`).join('')}</div>` : ''}${rec.best ? `<div class="tag" style="margin-top:6px">最快 ${CF.fmtTime(rec.best)}</div>` : ''}</div>`);
      el.onclick = () => { CF.Audio.sfx('click'); if (!unlocked) { CF.toast('先完成解锁条件（见卡片下方）', 'bad'); CF.Audio.sfx('error'); return; } UI.briefing(L); };
      grid.appendChild(el);
    });
    const sk = $('#skGrid');
    Object.keys(CF.Levels.DIFF).forEach((k) => {
      const D = CF.Levels.DIFF[k];
      const el = CF.h(`<div class="card labcard"><div class="dom">SKIRMISH</div><h3>${D.name}</h3><p>随机地形，摧毁乱码主脑获胜。敌军强度 ×${D.mul}，波次间隔 ${D.gap}s。已获胜 ${d.skirmish[k] || 0} 次。</p></div>`);
      el.onclick = () => { CF.Audio.sfx('click'); UI.briefing(CF.Levels.skirmish(k)); };
      sk.appendChild(el);
    });
  };
  UI.briefing = function (L) {
    const b = CF.P.battleBonus();
    CF.modal.open({
      title: `MISSION ${L.no} · ${L.name}`,
      body: `<p style="line-height:1.8">${L.brief}</p><div class="sec-title">任务目标</div>${L.objectives.map((o) => `<div class="small" style="line-height:1.9">◇ ${o.text}</div>`).join('')}<div class="sec-title">三星评价</div>${L.stars.map((s, i) => `<div class="small" style="line-height:1.9"><span class="c-chip">${'★'.repeat(i + 1)}</span> ${s[0]}</div>`).join('')}<div class="sec-title">你的学习带来的加成</div>${b.lines.map((l) => `<div class="small muted" style="line-height:1.9">▸ ${l}</div>`).join('')}<div class="explain" style="margin-top:12px">💡 ${L.tip}</div>`,
      foot: [{ text: '返回', cls: 'ghost' }, { text: '开始作战 ▶', cls: 'primary', onClick: () => { CF.modal.close(); UI.startBattle(L); } }],
    });
  };

  // ================= 设置 =================
  UI.renderSettings = async function () {
    const body = $('#settingsBody'), s = CF.Save.data.settings, A = CF.Audio;
    body.innerHTML = `<div class="sec-title">音量</div><div id="vols"></div>
      <div class="sec-title">背景音乐（每个页面独立）</div>
      <p class="small muted" style="line-height:1.7;margin-bottom:8px">每个页面默认播放一首程序生成的吉他曲，紫色像素动效会跟着节拍跳动。你可以：① 换一种曲风；② 上传自己的音乐（mp3 / ogg / wav，保存在本浏览器）；③ 打包分享时，把文件放进 <span class="mono">music/</span> 文件夹并在 <span class="mono">js/config.js</span> 里填写路径。</p>
      <div id="bgmRows"></div>
      <div class="sec-title">画面与玩法</div>
      <div class="set-row"><span class="nm">画质</span><div class="ctl"><select id="setQ"><option value="high">高（推荐）</option><option value="low">低（旧手机更流畅）</option></select></div></div>
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
        <select class="sty">${Object.keys(A.STYLES).map((k) => `<option value="${k}" ${k === style ? 'selected' : ''}>${A.STYLES[k].name}</option>`).join('')}</select>
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
    $('#setQ').value = s.quality; $('#setQ').onchange = (e) => { s.quality = e.target.value; CF.Save.save(); };
    $('#setTrial').checked = !!s.trial; $('#setTrial').onchange = (e) => { s.trial = e.target.checked; CF.Save.save(); CF.P._unlockSnapshot = CF.P.unlockSnapshot(); CF.toast(s.trial ? '体验模式已开启' : '体验模式已关闭'); };
    $('#goProfile').onclick = () => UI.show('profile');
    $('#resetSave').onclick = () => CF.modal.open({ title: '清空全部进度？', body: '<p>经验、实验、实践日志、战役记录都会被删除，且无法恢复。建议先导出存档。</p>', foot: [{ text: '取消', cls: 'ghost' }, { text: '确认清空', cls: 'primary', onClick: () => { CF.Save.reset(); CF.modal.close(); CF.toast('已清空'); UI.show('menu'); } }] });
  };

  // ================= 帮助 =================
  UI.renderHelp = function () {
    const B = CF.Game.BT, U = CF.Game.UT, cost = CF.Game.costHtml;
    $('#helpBody').innerHTML = `
      <div class="card"><h3>这个游戏怎么帮你成长</h3><p>学院和实验室里的学习，按「知识 30% · 实操 70%」配比，会转化为战场上的资源、建筑与关卡：知识经验 → 起始晶片；实操经验 → 起始语料；完成实验 → 算力产出；线下任务 → Claude 的弦振伤害；「体」→ Claude 的耐久。<br>但请记住：真正的成长发生在游戏之外。线下任务需要你真的去做，并写下实践记录。</p></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3>🖱️ 电脑</h3><p>左键：选择 / 拖拽框选（Shift 追加）<br>右键：移动 / 攻击；右键或中键拖拽：平移<br>滚轮：缩放　方向键：平移　点小地图：跳转<br>1–7：建造　A 攻击移动　S 停止　H 驻守　G 推进主脑　Q 全选军队　C 选中 Claude<br>R 弦振冲击　E 灵感和弦　K 战地研究　Z/X/V 训练　Delete 拆除　空格 暂停　F 速度　Esc 取消</p></div>
        <div class="card"><h3>📱 触屏</h3><p>单指拖动：平移　双指：缩放<br>点我方单位：选中；选中后点地面：移动，点敌人：攻击<br>「框选」按钮：拖动框选　「全军」按钮：选中全部军队<br>建造：点建造按钮 → 拖动/点击放置 → 底部确认栏「✓ 建造」<br>竖屏时会提示横屏，可让游戏旋转画面。</p></div>
      </div>
      <div class="sec-title">资源</div>
      <p class="small muted" style="line-height:1.8"><span class="c-chip">◆ 晶片</span>：建造主要货币，矿机在金色晶片矿上采集。<span class="c-corp">◆ 语料</span>：训练单位，矿机在青色语料泉上采集。<span class="c-comp">◆ 算力</span>：技能与高级单位，主脑产出，完成实验永久提高产出。</p>
      <div class="sec-title">建筑</div><div class="grid g3">${CF.Game.BUILD_ORDER.map((k) => `<div class="card"><h3>${B[k].name} <span class="tag mono">[${B[k].key}]</span></h3><p>${B[k].desc}</p><p class="mono small" style="margin-top:4px">${cost(B[k].cost)}</p></div>`).join('')}</div>
      <div class="sec-title">我方单位</div><div class="grid g3">${['claude', 'scout', 'coder', 'refactor', 'interceptor', 'bomber'].map((k) => `<div class="card"><h3>${U[k].name}</h3><p>${U[k].desc}</p>${U[k].cost ? `<p class="mono small" style="margin-top:4px">${cost(U[k].cost)}</p>` : ''}</div>`).join('')}</div>
      <div class="sec-title">乱码军团</div><div class="grid g3">${['bug', 'noise', 'titan', 'bat', 'forget', 'carrier', 'entropy'].map((k) => `<div class="card"><h3 style="color:var(--pink)">${U[k].name}${U[k].boss ? ' · Boss' : ''}</h3><p>耐久 ${U[k].hp} · 伤害 ${U[k].atk.dmg}${U[k].air ? ' · 空中' : ''}${U[k].atk.air ? ' · 可对空' : ''}</p></div>`).join('')}</div>`;
  };

  // ================= 战斗：开始 / 离开 =================
  let raf = 0, lastT = 0, frameN = 0;
  UI.startBattle = function (L) {
    if (CF.Game.current) CF.Game.current.destroy();
    UI.show('battle');
    const g = (CF.Game.current = new CF.Game.Game(L));
    UI.lastLevel = L;
    UI.resizeBattle();
    g.cam.z = window.innerWidth < 900 ? 0.75 : 1;
    g.centerOn(g.core.x + 260, g.core.y);
    UI.sel([]); UI.tab = 'build'; UI.selDirty = true; UI.boxMode = false;
    $('#fabBox').classList.toggle('on', false);
    $('#foeCoreBox').classList.toggle('hidden', !g.gcore);
    $('#bossBar').classList.add('hidden'); $('#comms').classList.add('hidden');
    UI.renderObj(true);
    cancelAnimationFrame(raf); lastT = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const g2 = CF.Game.current; if (!g2 || UI.cur !== 'battle') return;
      const dt = (now - lastT) / 1000; lastT = now;
      if (UI.keys.size && !CF.modal.isOpen()) { const sp = (700 * dt) / g2.cam.z; if (UI.keys.has('ArrowLeft')) g2.cam.x -= sp; if (UI.keys.has('ArrowRight')) g2.cam.x += sp; if (UI.keys.has('ArrowUp')) g2.cam.y -= sp; if (UI.keys.has('ArrowDown')) g2.cam.y += sp; g2.clampCam(); }
      g2.frame(dt);
      g2.render(UI.gctx, UI.dpr);
      frameN++;
      if (frameN % 3 === 0) g2.renderMini(UI.mctx);
      if (frameN % 6 === 0) UI.hud();
      if (UI.selDirty || frameN % 15 === 0) UI.renderSel();
      $('#pauseBadge').classList.toggle('hidden', !g2.paused);
    };
    raf = requestAnimationFrame(loop);
  };
  UI.leaveBattle = function () {
    cancelAnimationFrame(raf);
    if (CF.Game.current) { CF.Game.current.destroy(); CF.Game.current = null; }
    UI.keys.clear();
  };
  UI.compact = function () {
    const app = $('#app'), rot = app.classList.contains('rotated');
    document.body.classList.toggle('compact', (rot ? window.innerWidth : window.innerHeight) <= 520);
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
    $('#rChipR').textContent = `+${g.rate.chip.toFixed(0)}/s`; $('#rCorpR').textContent = `+${g.rate.corp.toFixed(0)}/s`; $('#rCompR').textContent = `+${g.rate.comp.toFixed(1)}/s`;
    $('#waveNo').textContent = g.L.endless ? g.wave : `${g.wave}/${g.L.waves.length}`;
    $('#waveCd').textContent = isFinite(g.waveTimer) && g.wave < (g.L.endless ? Infinity : g.L.waves.length) ? '下一波 ' + CF.fmtTime(g.waveTimer) : g.spawnQ.length || g.ents.some((e) => e.team === 1 && e.kind === 'u') ? '清剿中' : '';
    const tag = $('#waveTag'); tag.textContent = g.waveTag; tag.classList.toggle('hidden', !g.waveTag);
    $('#coreBar').style.width = g.coreHpPct() * 100 + '%'; $('#coreTxt').textContent = Math.round(g.coreHpPct() * 100) + '%';
    if (g.gcore) { const p = g.gcore.dead ? 0 : g.gcore.hp / g.gcore.maxHp; $('#foeBar').style.width = p * 100 + '%'; $('#foeTxt').textContent = Math.round(p * 100) + '%'; }
    if (g.boss && !g.boss.dead) $('#bossHp').style.width = (g.boss.hp / g.boss.maxHp) * 100 + '%';
    $('#bSpeed').textContent = g.speed + '×';
    $('#bPause').textContent = g.paused ? '▶' : '❚❚';
    UI.renderObj();
    $('#buildConfirm').classList.toggle('hidden', !(g.build && UI.touch));
  };
  UI.flashCore = function () { const b = $('#coreBar'); b.style.background = '#ff5d6c'; setTimeout(() => (b.style.background = ''), 200); };
  let objOpen = false;
  UI.renderObj = function (reset) {
    const g = CF.Game.current; if (!g) return;
    if (reset) objOpen = false;
    const el = $('#objPanel');
    const lines = g.L.objectives.map((o) => { let ok = false; try { ok = o.test(g); } catch (e) {} return { t: o.text, ok: ok && !o.keep }; });
    lines.sort((a, b) => a.ok - b.ok);
    el.className = 'obj' + (objOpen ? '' : ' collapsed');
    el.innerHTML = `<div class="small muted" style="margin-bottom:2px">任务目标 · ${CF.fmtTime(g.time)} ${objOpen ? '▴' : '▾'}</div>` + lines.map((l) => `<div class="ol ${l.ok ? 'done' : ''}">${l.t}</div>`).join('');
  };
  UI.bossBar = function (u) {
    const el = $('#bossBar');
    if (!u) { el.classList.add('hidden'); return; }
    $('#bossName').textContent = '⚠ ' + u.def.name; $('#bossHp').style.width = '100%'; el.classList.remove('hidden');
    UI.say('乱码', `${u.def.name} 降临。`);
  };
  let commsT = 0;
  UI.say = function (who, text) {
    UI.commsWho = who;
    $('#commsWho').textContent = who; $('#commsSay').textContent = text;
    const c = $('#comms'); c.classList.remove('hidden'); c.style.opacity = 1;
    clearTimeout(commsT); commsT = setTimeout(() => { c.style.opacity = 0; setTimeout(() => c.classList.add('hidden'), 300); }, 5200);
  };
  UI.buildMode = function (on) { UI.selDirty = true; if (!on) $('#buildConfirm').classList.add('hidden'); };

  // ================= 选中信息与命令 =================
  UI.sel = function (ids) {
    const g = CF.Game.current; if (!g) return;
    g.sel = ids;
    const own = ids.map((id) => g.get(id)).filter((e) => e && e.team === 0);
    if (own.length && (own.some((e) => e.kind === 'u') || own.some((e) => e.def.trains || e.type === 'core'))) UI.tab = 'cmd';
    else if (!ids.length) UI.tab = 'build';
    UI.selDirty = true;
  };
  const iconCache = {};
  function icon(kind, type) {
    const key = kind + type;
    if (!iconCache[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 52; const x = c.getContext('2d');
      const dummy = { beat: 0, strum: 0, hpBar() {}, drawFoe: CF.Game.Game.prototype.drawFoe };
      const d = kind === 'b' ? CF.Game.BT[type] : CF.Game.UT[type];
      const s = 18 / Math.max(14, d.r + (type === 'claude' ? 8 : 4));
      x.translate(26, 28); x.scale(s * 1.2, s * 1.2);
      const e = { type, x: 0, y: 0, r: d.r, def: d, done: true, hp: 1, maxHp: 1, team: 0, ang: -0.6, queue: [], face: 1, vx: 0, vy: 0, step: 0, air: false, id: 0, node: { type: 'chip' } };
      if (kind === 'b') CF.Game.Game.prototype.drawB.call(dummy, x, e, 0); else CF.Game.Game.prototype.drawU.call(dummy, x, e, 0);
      iconCache[key] = c;
    }
    const out = document.createElement('canvas'); out.width = out.height = 52; out.getContext('2d').drawImage(iconCache[key], 0, 0);
    return out;
  }
  function emojiIcon(ch) { return CF.h(`<span style="font-size:17px;line-height:26px;height:26px">${ch}</span>`); }
  UI.commands = function () {
    const g = CF.Game.current, out = [];
    const sel = g.sel.map((id) => g.get(id)).filter(Boolean);
    const units = g.myUnits(), hero = units.find((u) => u.type === 'claude');
    if (UI.tab === 'build') {
      CF.Game.BUILD_ORDER.forEach((t) => {
        const d = CF.Game.BT[t], un = CF.P.buildUnlocked(t), ng = g.L.noGround && t === 'workshop';
        out.push({ icon: icon('b', t), label: d.name, key: d.key, cost: d.cost, on: g.build && g.build.type === t, lock: !un.ok || ng, na: !CF.Game.canPay(g.res, d.cost), tip: un.ok ? (ng ? '本关禁用' : d.desc) : un.why, fn: () => (g.build && g.build.type === t ? g.cancelBuild() : g.startBuild(t)) });
      });
      out.push({ icon: emojiIcon('🔬'), label: '战地研究', key: 'K', cd: g.researchCd / 45, tip: '答对一道题获得资源（游戏暂停）', fn: () => g.research() });
      return out;
    }
    if (units.length) {
      if (hero) {
        out.push({ icon: emojiIcon('🎸'), label: '弦振冲击', key: 'R', cost: { comp: 40 }, cd: hero.cd.riff / 12, na: g.res.comp < 40, tip: '范围伤害并击退敌人', fn: () => g.riff() });
        out.push({ icon: emojiIcon('🎵'), label: '灵感和弦', key: 'E', cost: { comp: 30 }, cd: hero.cd.chord / 20, na: g.res.comp < 30, tip: '治疗并激励附近友军', fn: () => g.chord() });
      }
      out.push({ icon: emojiIcon('⚔️'), label: '攻击移动', key: 'A', on: g.amove, tip: '移动途中攻击遇到的敌人', fn: () => { g.amove = !g.amove; g.cancelBuild(); if (g.amove) CF.toast(UI.touch ? '点击战场选择目标位置' : '左键点击目标位置'); } });
      out.push({ icon: emojiIcon('⏹'), label: '停止', key: 'S', fn: () => g.orderStop(units) });
      out.push({ icon: emojiIcon('🛡️'), label: '驻守', key: 'H', fn: () => g.orderHold(units) });
      out.push({ icon: emojiIcon('🎯'), label: '推进主脑', key: 'G', fn: () => g.orderPush(units) });
      out.push({ icon: emojiIcon('👥'), label: '全选军队', key: 'Q', fn: () => UI.sel(g.allArmy()) });
      if (out.length < 8) out.push({ icon: emojiIcon('🔬'), label: '战地研究', key: 'K', cd: g.researchCd / 45, fn: () => g.research() });
      return out;
    }
    const b = sel.length === 1 && sel[0].team === 0 && sel[0].kind === 'b' ? sel[0] : null;
    if (b && b.def.trains && b.done) b.def.trains.forEach((t) => { const d = CF.Game.UT[t]; out.push({ icon: icon('u', t), label: d.name, key: CF.Game.TRAIN_KEY[t], cost: d.cost, na: !CF.Game.canPay(g.res, d.cost), lock: g.L.noGround && b.type === 'workshop', tip: d.desc, fn: () => g.train(b, t) }); });
    out.push({ icon: emojiIcon('🔬'), label: '战地研究', key: 'K', cd: g.researchCd / 45, tip: '答对一道题获得资源', fn: () => g.research() });
    out.push({ icon: emojiIcon('👥'), label: '全选军队', key: 'Q', fn: () => UI.sel(g.allArmy()) });
    out.push({ icon: emojiIcon('🎯'), label: '推进主脑', key: 'G', fn: () => g.orderPush(g.myUnits(g.allArmy())) });
    out.push({ icon: emojiIcon('🎸'), label: '选中 Claude', key: 'C', fn: () => UI.selectHero() });
    if (b && b.type !== 'core' && b.type !== 'ctx') out.push({ icon: emojiIcon('♻️'), label: '拆除', key: 'Del', tip: '返还部分造价', fn: () => g.sell(b) });
    return out;
  };
  let cmdSig = '';
  UI.renderSel = function () {
    const g = CF.Game.current; if (!g) return;
    UI.selDirty = false;
    $('#tabBuild').classList.toggle('on', UI.tab === 'build'); $('#tabCmd').classList.toggle('on', UI.tab === 'cmd');
    // 信息面板
    const sel = g.sel.map((id) => g.get(id)).filter(Boolean), info = $('#selInfo');
    if (!sel.length) {
      const b = g.build ? CF.Game.BT[g.build.type] : null;
      info.innerHTML = b ? `<div class="nm">建造：${b.name}</div><div class="ds">${b.desc}</div><div class="tags">${g.build.ok ? '<span class="pill" style="color:var(--good)">可以建造</span>' : `<span class="pill" style="color:var(--bad)">${g.build.why || '移动到可建造位置'}</span>`}</div>` : `<div class="nm">指挥台</div><div class="ds">${UI.touch ? '点我方单位选中，单指拖动平移。' : '左键选择/框选，右键移动或攻击。'} 底部「建造」放置建筑，「指令」控制军队。</div><div class="tags"><span class="pill">军队 ${g.allArmy().length}</span><span class="pill">建筑 ${g.ents.filter((e) => e.team === 0 && e.kind === 'b').length}</span><span class="pill">击杀 ${g.stats.kills}</span></div>`;
    } else if (sel.length === 1) {
      const e = sel[0], d = e.def, k = d.atk;
      const tags = [];
      if (k) tags.push(`伤害 ${k.dmg}`, `射程 ${Math.round(e.range || k.range)}`, k.ground ? '仅对地' : k.air ? '对地对空' : '仅对地');
      if (d.speed) tags.push(`速度 ${d.speed}`);
      if (e.air) tags.push('空中');
      if (e.type === 'miner' && e.node) tags.push(`采集 ${e.node.type === 'chip' ? '晶片' : '语料'} +3/s`);
      if (!e.done && e.kind === 'b') tags.push(`建造中 ${Math.round(e.prog * 100)}%`);
      if (e.type === 'claude') tags.push(`弦振 ${e.cd.riff > 0 ? Math.ceil(e.cd.riff) + 's' : '就绪'}`, `和弦 ${e.cd.chord > 0 ? Math.ceil(e.cd.chord) + 's' : '就绪'}`);
      info.innerHTML = `<div class="nm" style="color:${e.team ? 'var(--pink)' : 'var(--text)'}">${d.name}<span class="mono small muted">${Math.ceil(e.hp)}/${e.maxHp}</span></div><div class="bar hpb"><i style="width:${(e.hp / e.maxHp) * 100}%;background:${e.team ? 'var(--pink)' : 'var(--good)'}"></i></div><div class="ds">${d.desc || ''}</div><div class="tags">${tags.map((t) => `<span class="pill">${t}</span>`).join('')}</div>` +
        (e.queue && e.queue.length ? `<div class="queue">队列 ${e.queue.map((q, i) => `<div class="qi">${CF.Game.UT[q.type].name.slice(0, 2)}${i === 0 ? `<i style="width:${(1 - q.t / q.total) * 100}%"></i>` : ''}</div>`).join('')}</div>` : '');
    } else {
      const cnt = {}; sel.forEach((e) => (cnt[e.def.name] = (cnt[e.def.name] || 0) + 1));
      const hp = sel.reduce((s, e) => s + e.hp, 0), mx = sel.reduce((s, e) => s + e.maxHp, 0);
      info.innerHTML = `<div class="nm">已选中 ${sel.length} 个单位</div><div class="bar hpb"><i style="width:${(hp / mx) * 100}%"></i></div><div class="tags">${Object.keys(cnt).map((n) => `<span class="pill">${n} ×${cnt[n]}</span>`).join('')}</div>`;
    }
    // 命令网格
    const cmds = UI.commands();
    const sig = UI.tab + '|' + g.sel.join(',') + '|' + cmds.map((c) => c.label + (c.on ? 1 : 0)).join(',');
    const grid = $('#cmdGrid');
    if (sig !== cmdSig) {
      cmdSig = sig; grid.innerHTML = '';
      cmds.forEach((c) => {
        const b = CF.h(`<button class="cb" title="${CF.esc(c.tip || c.label)}"><span class="hk">${c.key || ''}</span></button>`);
        b.appendChild(c.icon);
        b.appendChild(CF.h(`<span>${c.label}</span>`));
        if (c.cost) b.appendChild(CF.h(`<span class="cost">${CF.Game.costHtml(c.cost)}</span>`));
        b.appendChild(CF.h('<i class="cdm" style="transform:scaleY(0)"></i>'));
        b.onclick = () => { CF.Audio.sfx('click'); c.fn(); UI.selDirty = true; };
        grid.appendChild(b);
      });
    }
    CF.$$('.cb', grid).forEach((b, i) => { const c = cmds[i]; if (!c) return; b.classList.toggle('na', !!c.na); b.classList.toggle('lock', !!c.lock); b.classList.toggle('on', !!c.on); b.querySelector('.cdm').style.transform = `scaleY(${CF.clamp(c.cd || 0, 0, 1)})`; });
    UI._cmds = cmds;
  };
  UI.selectHero = function () { const g = CF.Game.current; if (!g || g.hero.dead) return CF.toast('Claude 正在重生'); UI.sel([g.hero.id]); g.centerOn(g.hero.x, g.hero.y); };

  // ================= 战斗输入 =================
  UI.keys = new Set();
  UI.bindBattle = function () {
    const cv = $('#gameCanvas');
    const local = (e) => { const r = CF.appRect(cv), p = CF.appPoint(e.clientX, e.clientY); return { x: p.x - r.left, y: p.y - r.top }; };
    const P = new Map();
    let pan = null, box = null, pinch = null, ghost = false, lastClick = { t: 0, type: '' };
    const G = () => CF.Game.current;
    const clickFx = (x, y, c) => { const g = G(); g.fx.push({ k: 'ring', x, y, r: 0, max: 22, t: 0.3, c }); };
    const boxSelect = (b, add) => {
      const g = G(), [ax, ay] = g.toWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), [bx, by] = g.toWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      const ids = g.ents.filter((e) => e.team === 0 && e.kind === 'u' && e.type !== 'proto' && !e.dead && e.x >= ax && e.x <= bx && e.y >= ay && e.y <= by).map((e) => e.id);
      UI.sel(add ? [...new Set(g.sel.concat(ids))] : ids);
    };
    const clickSel = (p, add) => {
      const g = G(), [wx, wy] = g.toWorld(p.x, p.y), e = g.pick(wx, wy);
      if (!e) { if (!add) UI.sel([]); return; }
      const now = performance.now();
      if (now - lastClick.t < 320 && lastClick.type === e.type && e.team === 0 && e.kind === 'u') { UI.sel(g.ents.filter((o) => o.type === e.type && o.team === 0 && !o.dead && g.onScreen(o.x, o.y)).map((o) => o.id)); lastClick.t = 0; return; }
      lastClick = { t: now, type: e.type };
      if (add && e.team === 0) UI.sel(g.sel.includes(e.id) ? g.sel.filter((i) => i !== e.id) : g.sel.concat(e.id)); else UI.sel([e.id]);
    };
    const command = (p) => {
      const g = G(), [wx, wy] = g.toWorld(p.x, p.y), e = g.pick(wx, wy), units = g.myUnits();
      if (units.length) {
        if (g.amove) { g.orderMove(units, wx, wy, true); g.amove = false; clickFx(wx, wy, '#ff5d6c'); UI.selDirty = true; return true; }
        if (e && e.team === 1) { g.orderAttack(units, e); clickFx(e.x, e.y, '#ff5d6c'); CF.Audio.sfx('click'); return true; }
        g.orderMove(units, wx, wy, false); clickFx(wx, wy, '#6fdc8c'); CF.Audio.sfx('hover'); return true;
      }
      const b = g.sel.length === 1 ? g.get(g.sel[0]) : null;
      if (b && b.team === 0 && b.def.trains) { b.rally = { x: wx, y: wy }; clickFx(wx, wy, '#6fdc8c'); CF.toast('集结点已设置'); return true; }
      return false;
    };
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const g = G(); if (!g || g.over) return;
      CF.Audio.unlock();
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      const p = local(e);
      UI.touch = e.pointerType !== 'mouse';
      P.set(e.pointerId, { x: p.x, y: p.y });
      if (e.pointerType === 'mouse') {
        if (e.button === 0) {
          if (g.build) { g.updateGhost(...g.toWorld(p.x, p.y)); g.placeBuild(e.shiftKey); UI.selDirty = true; return; }
          if (g.amove) { command(p); return; }
          box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId, drag: false };
        } else { pan = { id: e.pointerId, x: p.x, y: p.y, cx: g.cam.x, cy: g.cam.y, moved: false, btn: e.button }; if (e.button === 1) e.preventDefault(); }
        return;
      }
      if (P.size === 2) {
        const [a, b] = [...P.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: g.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: g.cam.x, cy: g.cam.y };
        pan = null; box = null; ghost = false; g.box = null;
        return;
      }
      if (UI.boxMode) box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId, drag: false };
      else if (g.build) { ghost = true; g.updateGhost(...g.toWorld(p.x, p.y)); pan = { id: e.pointerId, x: p.x, y: p.y, cx: g.cam.x, cy: g.cam.y, moved: false, ghost: true }; }
      else pan = { id: e.pointerId, x: p.x, y: p.y, cx: g.cam.x, cy: g.cam.y, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      const g = G(); if (!g) return;
      const p = local(e);
      if (P.has(e.pointerId)) P.set(e.pointerId, { x: p.x, y: p.y });
      if (e.pointerType === 'mouse' && g.build) g.updateGhost(...g.toWorld(p.x, p.y));
      if (pinch && P.size >= 2) {
        const [a, b] = [...P.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const z = CF.clamp(pinch.z * (d / pinch.d), 0.4, 2.2);
        const wx = pinch.cx + pinch.mx / pinch.z, wy = pinch.cy + pinch.my / pinch.z;
        g.cam.z = z; g.cam.x = wx - mx / z; g.cam.y = wy - my / z; g.clampCam();
        return;
      }
      if (pan && pan.id === e.pointerId) {
        const dx = p.x - pan.x, dy = p.y - pan.y;
        if (Math.hypot(dx, dy) > 7) pan.moved = true;
        if (pan.ghost) { g.updateGhost(...g.toWorld(p.x, p.y)); UI.selDirty = true; return; }
        if (pan.moved) { g.cam.x = pan.cx - dx / g.cam.z; g.cam.y = pan.cy - dy / g.cam.z; g.clampCam(); }
      }
      if (box && box.id === e.pointerId) { box.x1 = p.x; box.y1 = p.y; if (Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 7) { box.drag = true; g.box = box; } }
    });
    const up = (e) => {
      const g = G(); P.delete(e.pointerId);
      if (!g) return;
      const p = local(e);
      if (pinch) { if (P.size < 2) pinch = null; pan = null; return; }
      if (e.pointerType === 'mouse') {
        if (box && box.id === e.pointerId) { if (box.drag) boxSelect(box, e.shiftKey); else clickSel(p, e.shiftKey); box = null; g.box = null; }
        if (pan && pan.id === e.pointerId) { if (!pan.moved && pan.btn === 2) { if (g.build) g.cancelBuild(); else if (g.amove) { g.amove = false; UI.selDirty = true; } else command(p); } pan = null; }
        return;
      }
      if (box && box.id === e.pointerId) { if (box.drag) boxSelect(box, false); else clickSel(p, false); box = null; g.box = null; return; }
      if (pan && pan.id === e.pointerId) {
        const moved = pan.moved, wasGhost = pan.ghost; pan = null;
        if (wasGhost) { ghost = false; return; }
        if (moved) return;
        // 轻点
        const [wx, wy] = g.toWorld(p.x, p.y), ent = g.pick(wx, wy);
        if (ent && ent.team === 0 && !(g.amove)) { clickSel(p, false); return; }
        if (!command(p)) clickSel(p, false);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { P.delete(e.pointerId); pan = null; box = null; pinch = null; const g = G(); if (g) g.box = null; });
    cv.addEventListener('wheel', (e) => { const g = G(); if (!g) return; e.preventDefault(); const p = local(e); g.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    // 小地图
    const mm = $('#miniCanvas');
    let mmDown = false;
    const mmGo = (e) => { const g = G(); if (!g) return; const r = CF.appRect(mm), pp = CF.appPoint(e.clientX, e.clientY); const x = ((pp.x - r.left) / r.width) * 320, y = ((pp.y - r.top) / r.height) * 200; g.centerOn((x - g.mmOx) / g.mmS, (y - g.mmOy) / g.mmS); };
    mm.addEventListener('pointerdown', (e) => { mmDown = true; try { mm.setPointerCapture(e.pointerId); } catch (er) {} mmGo(e); });
    mm.addEventListener('pointermove', (e) => { if (mmDown) mmGo(e); });
    mm.addEventListener('pointerup', () => (mmDown = false));
    // 键盘
    window.addEventListener('keydown', (e) => {
      if (UI.cur !== 'battle') return;
      const g = G(); if (!g || g.over) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (CF.modal.isOpen()) { if (e.key === 'Escape' && !g.over) { /* 研究题不允许直接关闭 */ } return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k.startsWith('Arrow')) { UI.keys.add(k); e.preventDefault(); return; }
      const units = g.myUnits();
      const trainer = g.sel.length === 1 ? g.get(g.sel[0]) : null;
      switch (k) {
        case ' ': g.paused = !g.paused; e.preventDefault(); break;
        case 'Escape': if (g.build) g.cancelBuild(); else if (g.amove) g.amove = false; else UI.sel([]); break;
        case 'a': if (units.length) { g.amove = true; g.cancelBuild(); } break;
        case 's': if (units.length) g.orderStop(units); break;
        case 'h': if (units.length) g.orderHold(units); break;
        case 'g': g.orderPush(units.length ? units : g.myUnits(g.allArmy())); break;
        case 'q': UI.sel(g.allArmy()); break;
        case 'c': UI.selectHero(); break;
        case 'r': g.riff(); break;
        case 'e': g.chord(); break;
        case 'k': g.research(); break;
        case 'f': g.speed = g.speed >= 3 ? 1 : g.speed + 1; break;
        case 'Delete': case 'Backspace': if (trainer && trainer.team === 0 && trainer.kind === 'b') g.sell(trainer); break;
        case 'z': case 'x': case 'v': if (trainer && trainer.def.trains && trainer.done) { const t = trainer.def.trains.find((t2) => CF.Game.TRAIN_KEY[t2] === k.toUpperCase()); if (t) g.train(trainer, t); } break;
        default: { const i = '1234567'.indexOf(k); if (i >= 0) { const t = CF.Game.BUILD_ORDER[i]; if (g.build && g.build.type === t) g.cancelBuild(); else g.startBuild(t); } }
      }
      UI.selDirty = true;
    });
    window.addEventListener('keyup', (e) => UI.keys.delete(e.key));
    window.addEventListener('blur', () => UI.keys.clear());
    // HUD 按钮
    $('#bPause').onclick = () => { const g = G(); if (g) g.paused = !g.paused; CF.Audio.sfx('click'); };
    $('#bSpeed').onclick = () => { const g = G(); if (g) g.speed = g.speed >= 3 ? 1 : g.speed + 1; CF.Audio.sfx('click'); UI.hud(); };
    $('#bMenu').onclick = () => { CF.Audio.sfx('click'); UI.battleMenu(); };
    $('#objPanel').onclick = () => { objOpen = !objOpen; UI.renderObj(); };
    $('#tabBuild').onclick = () => { UI.tab = 'build'; UI.selDirty = true; CF.Audio.sfx('click'); };
    $('#tabCmd').onclick = () => { UI.tab = 'cmd'; UI.selDirty = true; CF.Audio.sfx('click'); };
    $('#fabBox').onclick = () => { UI.boxMode = !UI.boxMode; $('#fabBox').classList.toggle('on', UI.boxMode); CF.toast(UI.boxMode ? '框选模式：拖动选择单位' : '框选模式关闭'); };
    $('#fabAll').onclick = () => { const g = G(); if (g) UI.sel(g.allArmy()); CF.Audio.sfx('click'); };
    $('#bcOk').onclick = () => { const g = G(); if (g) g.placeBuild(false); UI.selDirty = true; };
    $('#bcRot').onclick = () => CF.toast('拖动或点击战场选择位置');
    $('#bcNo').onclick = () => { const g = G(); if (g) g.cancelBuild(); };
    if (window.ResizeObserver) new ResizeObserver(() => UI.cur === 'battle' && UI.resizeBattle()).observe($('#field'));
  };
  UI.battleMenu = function () {
    const g = CF.Game.current; if (!g) return;
    const L = g.L, s = CF.Save.data.settings;
    const body = CF.h(`<div><p class="small muted">${L.brief}</p><div class="sec-title">目标</div>${L.objectives.map((o) => `<div class="small" style="line-height:1.8">◇ ${o.text}</div>`).join('')}<div class="sec-title">三星</div>${L.stars.map((x, i) => `<div class="small" style="line-height:1.8"><span class="c-chip">${'★'.repeat(i + 1)}</span> ${x[0]}</div>`).join('')}<div class="sec-title">学习加成</div>${g.bonus.lines.map((l) => `<div class="small muted" style="line-height:1.8">▸ ${l}</div>`).join('')}<div class="sec-title">声音</div><div id="bmVol"></div></div>`);
    const vol = body.querySelector('#bmVol');
    [['master', '总音量'], ['music', '音乐'], ['sfx', '音效']].forEach(([k, n]) => { const r = CF.h(`<div class="set-row" style="padding:4px 0"><span class="nm">${n}</span><div class="ctl"><input type="range" min="0" max="1" step="0.05" value="${s[k]}"></div></div>`); r.querySelector('input').oninput = (e) => { s[k] = +e.target.value; CF.Audio.applyVolumes(); CF.Save.save(); }; vol.appendChild(r); });
    CF.modal.open({ title: `简报 · ${L.name}`, body, foot: [{ text: '退出到征程', cls: 'ghost', onClick: () => { CF.modal.close(); UI.show('campaign'); } }, { text: '重新开始', onClick: () => { CF.modal.close(); UI.startBattle(L.skirmish ? CF.Levels.skirmish(L.skirmish) : L); } }, { text: '继续作战', cls: 'primary' }] });
  };

  // ================= 结算 =================
  UI.endScreen = function (g, win, stars, why) {
    if (CF.Game.current !== g) return;
    CF.Audio.play(win ? 'victory' : 'defeat');
    CF.Audio.sfx(win ? 'win' : 'lose');
    const L = g.L, idx = CF.Levels.LEVELS.findIndex((x) => x.id === L.id), next = idx >= 0 ? CF.Levels.LEVELS[idx + 1] : null;
    const st = g.stats;
    const advice = win ? (CF.P.ratio().kPct > 0.35 ? '下一步：去实验室做一个实验，把知识变成手上的能力。' : '下一步：去学院完成今日修炼，解锁更多关卡与建筑。') : '失败也是数据。复盘：经济是否太慢？防线是否放在峡口？技能是否在敌人密集时释放？';
    const body = CF.h(`<div class="endstats">
      <div class="ultrabar" style="margin:0 0 12px;height:70px"><canvas></canvas><div class="ub-title" style="left:18px">${win ? '胜利' : '失败'}<span class="ub-sub">${win ? L.name : why || ''}</span></div></div>
      <div class="stars-big">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="small muted" style="text-align:center;margin-bottom:10px">${L.stars.map((s, i) => `${i < stars ? '✓' : '○'} ${s[0]}`).join('　')}</div>
      <div class="kpis"><div class="kpi"><div class="l">用时</div><div class="v">${CF.fmtTime(g.time)}</div></div><div class="kpi"><div class="l">消灭乱码</div><div class="v">${st.kills}</div></div><div class="kpi"><div class="l">我方损失</div><div class="v">${st.lost}</div></div><div class="kpi"><div class="l">建造 / 训练</div><div class="v">${st.built} / ${st.trained}</div></div><div class="kpi"><div class="l">弦振冲击</div><div class="v">${st.riffs}</div></div><div class="kpi"><div class="l">采集</div><div class="v" style="font-size:15px"><span class="c-chip">${Math.round(st.gathered.chip)}</span> <span class="c-corp">${Math.round(st.gathered.corp)}</span> <span class="c-comp">${Math.round(st.gathered.comp)}</span></div></div></div>
      <div class="sec-title">兵力曲线（单位总耐久）</div><canvas class="chart" id="chArmy"></canvas>
      <div class="sec-title">波次战损</div><canvas class="chart" id="chWave"></canvas>
      <div class="explain" style="margin-top:12px">📘 ${advice}</div></div>`);
    new CF.PixelFX.Stage(body.querySelector('.ultrabar canvas'), { mode: 'bar', fx: 0.86, fy: 0.55, cell: 12 });
    const foot = [{ text: '返回征程', cls: 'ghost', onClick: () => { CF.modal.close(); UI.show('campaign'); } }, { text: '再来一次', onClick: () => { CF.modal.close(); UI.startBattle(L.skirmish ? CF.Levels.skirmish(L.skirmish) : L); } }];
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
    const need = UI.cur === 'battle' && portrait && coarse && !app.classList.contains('rotated') && !stayPortrait;
    $('#rotateHint').classList.toggle('show', need);
    if (UI.cur === 'battle') setTimeout(UI.resizeBattle, 60);
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
        if (UI.cur === 'battle') UI.say('Claude', '指挥官，休息一下眼睛吧。体能也是战斗力。');
      }
    }, 10000);
  };
})();
