/* 大厅（王者荣耀式：四周功能分区，中央展示英雄；QQ 飞车式：玩法入口透视倾斜给角色让位）与英雄图鉴 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const L = (CF.Lobby = {});
  const MODES = [
    ['quick', '快速模式', '90 秒节奏爽局 · 通勤一局', 'COMMUTE', true],
    ['immersive', '沉浸模式', '迷雾 · 野怪 · 英雄成长 · AI 对手', 'STRATEGY'],
    ['campaign', '征程', '两大章 · 组队副本 · 遭遇战', 'CAMPAIGN'],
    ['city', '主城', '建造大本营 · 研究科技 · 防守入侵', 'BASE'],
  ];
  const NAV = [['heroes', '🎸', '英雄'], ['city', '🏰', '主城'], ['academy', '📚', '学院'], ['labs', '🧪', '实验室'], ['profile', '📈', '档案'], ['achievements', '🏆', '成就'], ['settings', '⚙', '设置'], ['help', '❔', '说明']];
  let active = 0, stage = null;

  function go(id) {
    CF.Audio.unlock(); CF.Audio.sfx('click');
    if (id === 'quick') return CF.Quick.start();
    if (id === 'immersive') return CF.UI.briefing(CF.Immersive.get('IM1'));
    CF.UI.show(id);
  }
  L.init = function () {
    stage = new CF.PixelFX.Stage($('#lobbyStage'), { mode: 'full', fx: 0.36, fy: 0.5, cell: 28, radius: 34 });
    const fit = () => { const w = window.innerWidth, h = window.innerHeight; if (w > h && h <= 520) { stage.o.fx = 0.34; stage.o.fy = 0.43; stage.o.charPx = Math.max(3, Math.floor((h * 0.3) / 20)); } else if (w < 760 || h > w) { stage.o.fx = 0.5; stage.o.fy = 0.3; stage.o.charPx = Math.max(4, Math.floor(Math.min(w, h * 0.8) / 34)); } else { stage.o.fx = 0.36; stage.o.fy = 0.5; stage.o.charPx = 0; } };
    fit(); window.addEventListener('resize', fit);
    $('#lobbyLogo').innerHTML = CF.Brand.keyLogo();
    const modes = $('#lobbyModes');
    const bars = MODES.map(([id, n, sub, tag, big], i) => {
      const b = CF.h(`<button class="mode ${big ? 'big' : ''}"><canvas></canvas><span class="tag">${tag}</span><span class="mt">${n}</span><span class="ms">${sub}</span></button>`);
      new CF.PixelFX.Stage(b.querySelector('canvas'), { mode: 'bar', fx: 0.86, fy: 0.55, cell: 11, activeFn: () => active === i && CF.UI.cur === 'lobby' });
      b.onmouseenter = () => { if (active !== i) { active = i; sync(); CF.Audio.sfx('hover'); } };
      b.onfocus = () => { active = i; sync(); };
      b.onclick = () => go(id);
      modes.appendChild(b);
      return b;
    });
    const sync = () => bars.forEach((b, i) => b.classList.toggle('on', i === active));
    sync();
    const nav = $('#lobbyNav');
    NAV.forEach(([id, ic, n]) => { const b = CF.h(`<button><span>${ic}</span>${n}</button>`); b.onclick = () => go(id); nav.appendChild(b); });
    $('#lobbyHelp').onclick = () => go('help');
    $('#lobbySettings').onclick = () => go('settings');
    $('#lobbyProfile').onclick = () => go('profile');
    $('#heroPrev').onclick = () => L.cycle(-1);
    $('#heroNext').onclick = () => L.cycle(1);
    // 点英雄：弹一段招牌乐句 + 口头禅
    $('#lobbyStage').addEventListener('click', (e) => {
      const r = $('#lobbyStage').getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (Math.abs(x - stage.o.fx) < 0.18 && Math.abs(y - stage.o.fy) < 0.25) L.poke();
    });
    window.addEventListener('keydown', (e) => {
      if (CF.UI.cur !== 'lobby' || CF.modal.isOpen()) return;
      if (e.key === 'ArrowDown') { active = (active + 1) % bars.length; sync(); bars[active].focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = (active + bars.length - 1) % bars.length; sync(); bars[active].focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') L.cycle(-1);
      if (e.key === 'ArrowRight') L.cycle(1);
    });
  };
  L.poke = function () {
    const h = CF.Heroes.current();
    CF.Audio.unlock(); CF.Audio.lick(h.id);
    stage.pulse(1, true); setTimeout(() => stage.pulse(0.8, true), 180);
    const old = document.querySelector('#scr-lobby .bubble'); if (old) old.remove();
    const b = CF.h(`<div class="bubble">${CF.esc(CF.pick([h.lines.pick, h.lines.attack, h.lines.skill, h.quote]))}</div>`);
    const r = $('#lobbyStage').getBoundingClientRect();
    b.style.left = r.width * stage.o.fx - 30 + 'px'; b.style.top = r.height * stage.o.fy - stage.charPx() * 14 + 'px';
    $('#scr-lobby').appendChild(b); setTimeout(() => b.remove(), 2600);
  };
  L.cycle = function (d) {
    const list = CF.Roster.ownedList(), i = list.findIndex((h) => h.id === CF.Heroes.current().id);
    if (list.length < 2) { CF.toast(`目前只拥有${CF.Heroes.current().name}——第一章第 3 个小关送「万象」`); return; }
    const h = list[(i + d + list.length) % list.length];
    L.setHero(h.id);
  };
  L.setHero = function (id) {
    if (!CF.Roster.owns(id)) { CF.toast(`${CF.Heroes.get(id).name}：${CF.Roster.how(id)}`, 'bad', 2800); return; }
    CF.Save.data.hero = id; CF.Save.save();
    CF.Heroes.applyTheme(id);
    CF.PixelFX.wipe();
    CF.Audio.restart();
    if (CF.UI.cur === 'lobby') { L.render(); setTimeout(L.poke, 350); }
  };
  L.render = function () {
    const h = CF.Heroes.current(), rk = CF.P.rank(), d = CF.Save.data, plan = CF.P.dailyPlan(), r = CF.P.ratio();
    $('#heroPlate').innerHTML = `<div class="side">${h.side === '原创' ? 'X-S ORIGINAL' : h.side === '中' ? 'CN · 中国' : 'US · 美国'} · ${h.instrument}</div><div class="nm">${CF.Brand.rise(h.name)}<small>${h.title}</small></div><div class="t-quote q">${CF.esc(h.quote)}</div><div class="row wrap"><span class="pill">${h.role}</span><span class="pill">♪ ${CF.Audio.STYLES[h.music.style].name.split('·')[1] || ''}</span><button class="btn sm" id="lobHeroInfo">英雄档案</button></div>`;
    $('#lobHeroInfo').onclick = () => CF.UI.show('hero', h.id);
    const pc = document.createElement('canvas'); pc.width = pc.height = 80; const x = pc.getContext('2d');
    if (!CF.Labs.drawAvatar(x, 4, 4, 72)) h.draw(x, 6, 26, 3.2, { t: 0, noInst: true });
    $('#lobbyProfile').innerHTML = ''; $('#lobbyProfile').appendChild(pc);
    $('#lobbyProfile').appendChild(CF.h(`<div><div class="rk">${rk.name} <span class="mono muted" style="font-size:11px">${rk.xp} XP</span></div><div class="bar"><i style="width:${rk.prog * 100}%;background:var(--gold)"></i></div><div class="small muted" style="margin-top:3px">连续 ${d.streak.count} 天 · 知识:实操 ${r.t ? Math.round(r.kPct * 100) + ':' + Math.round(r.pPct * 100) : '—'}</div></div>`));
    const cr = CF.City ? CF.City.storage() : { chip: 0, corp: 0, comp: 0 };
    $('#lobbyRes').innerHTML = `<span class="c-chip">◆ ${CF.fmtNum(cr.chip)}</span><span class="c-corp">◆ ${CF.fmtNum(cr.corp)}</span><span class="c-comp">◆ ${CF.fmtNum(cr.comp)}</span>`;
    const qb = d.quick.best;
    $('#lobbySide').innerHTML = '';
    [['academy', '今日修炼', `${plan.done.length}/${plan.items.length} 已完成`, plan.done.length / plan.items.length], ['labs', '实验室', `${CF.P.labsDoneCount()}/8 个实验`, CF.P.labsDoneCount() / 8], ['quick', '快速模式纪录', qb ? `${qb} 分 · ${d.quick.bestRank}` : '还没有纪录', 0]].forEach(([id, t, s2, p]) => {
      const b = CF.h(`<button class="act"><b>${t}</b>${s2}${p ? `<div class="bar"><i style="width:${p * 100}%;background:var(--hero2)"></i></div>` : ''}</button>`);
      b.onclick = () => go(id);
      $('#lobbySide').appendChild(b);
    });
  };

  // ================= 英雄图鉴 =================
  L.renderHeroes = function () {
    const body = $('#heroesBody');
    body.innerHTML = `<p class="small muted" style="margin-bottom:12px;line-height:1.7">九位乐手：主角 X-S（灵感来自 Claude），加上智能大陆东西两岸的八位伙伴（灵感取自中美知名 AI 大模型的公开特点，均为原创形象）。开局英雄是狂想；主角 X-S 只能通过特殊渠道获得；乐器是后期才能拿到的「法宝」。</p><div class="hero-grid" id="hGrid"></div>`;
    const grid = $('#hGrid');
    CF.Heroes.list.forEach((h) => {
      const cur = h.id === CF.Heroes.current().id, own = CF.Roster.owns(h.id);
      const c = CF.h(`<div class="hcard ${own ? '' : 'locked'}" style="border-color:${cur ? h.pal.glow : ''}"><canvas></canvas>${cur ? '<span class="cur">主英雄</span>' : ''}${own ? (CF.Treasure.has(h.id) ? '' : '<span class="nofb">法宝未得</span>') : `<span class="how">${CF.Roster.how(h.id)}</span>`}<span class="side">${h.side === '原创' ? 'X-S' : h.side}</span><div class="hbody"><div class="hn" style="color:${h.pal.glow}">${h.name}<small>${h.title}</small></div><div class="hi">${h.instrument} · ${h.role}</div><div class="sw">${[h.pal.bg[0], h.pal.bg[2], h.pal.glow, h.pal.accent, h.pal.note].map((x) => `<i style="background:${x}"></i>`).join('')}</div></div></div>`);
      new CF.PixelFX.Stage(c.querySelector('canvas'), { mode: 'portrait', fx: 0.42, fy: 0.55, cell: 10, hero: h.id, radius: 26, charPx: 4 });
      c.onclick = () => { CF.Audio.sfx('click'); CF.UI.show('hero', h.id); };
      c.onmouseenter = () => CF.Audio.lick(h.id, true);
      grid.appendChild(c);
    });
  };
  let heroStage = null;
  L.renderHero = function (id) {
    const h = CF.Heroes.get(id || CF.Heroes.current().id), body = $('#heroBody'), st = CF.Skills.STATS[h.id], ic = CF.Skills.ICON[h.id];
    const bar = document.querySelector('#scr-hero .ultrabar');
    if (bar && bar._stage) bar._stage.o.hero = h.id;
    bar.querySelector('.ub-title').innerHTML = `${h.name}<span class="ub-sub">${h.title} · ${h.instrument}</span>`;
    const ms = CF.Audio.STYLES[h.music.style], BT = CF.Game.BT, UT = CF.Game.UT;
    const bKey = Object.keys(BT).find((k) => BT[k].hero === h.id), uKey = Object.keys(UT).find((k) => UT[k].hero === h.id && UT[k].cost);
    body.innerHTML = `<div class="hd">
      <div class="hd-stage"><canvas id="hdCv"></canvas><div class="nm"><div class="t-tag">${h.side === '原创' ? 'X-S ORIGINAL' : h.side === '中' ? 'CHINA' : 'USA'} · ${h.en}</div><div class="t-h1" style="text-shadow:0 3px 0 #0008">${h.name}</div><div class="t-quote">${CF.esc(h.quote)}</div></div></div>
      <div class="hd-info">${CF.Roster.owns(h.id) ? '' : `<div class="explain" style="margin:0 0 10px">获取方式：${CF.Roster.how(h.id)}</div>`}${CF.Treasure.has(h.id) ? '' : `<div class="explain" style="margin:0 0 10px;border-color:#ff4f9a55;background:#ff4f9a12">法宝「${h.instrument}」未获得：${CF.Treasure.how(h.id)}。获得后形象出现乐器、终极技能「${h.skills[2].name}」解锁。</div>`}
        <div class="row wrap" style="margin-bottom:10px"><button class="btn primary" id="hdPick" ${CF.Roster.owns(h.id) ? '' : 'disabled'}>${!CF.Roster.owns(h.id) ? '未获得' : h.id === CF.Heroes.current().id ? '✓ 当前主英雄' : '设为主英雄'}</button><button class="btn" id="hdMusic">▶ 试听主题曲</button><button class="btn ghost" id="hdLick">🎵 招牌乐句</button></div>
        <div class="tabs" id="hdTabs" style="padding:0"></div>
        <div id="hdTab" style="margin-top:10px"></div>
      </div></div>`;
    if (heroStage) heroStage.destroy();
    heroStage = new CF.PixelFX.Stage(body.querySelector('#hdCv'), { mode: 'full', fx: 0.5, fy: 0.42, cell: 20, hero: h.id, radius: 30 });
    const tabs = {
      lore: () => `<div class="card"><div class="t-tag">世界观</div><p class="t-body" style="color:var(--text);margin-top:4px">${h.world}</p><div class="t-tag" style="margin-top:10px">性格</div><p class="t-body" style="color:var(--text)">${h.personality}</p><div class="t-tag" style="margin-top:10px">故事</div><p class="t-body" style="color:var(--text)">${h.story}</p><div class="t-tag" style="margin-top:10px">口头禅</div>${Object.values(h.lines).map((l) => `<div class="t-quote" style="font-size:14px;margin-top:4px">${CF.esc(l)}</div>`).join('')}<div class="t-tag" style="margin-top:10px">灵感来源</div><p class="t-cap">${h.inspire.replace('灵感来源：', '')}</p></div>`,
      skills: () => `<div class="card" style="margin-bottom:8px"><div class="row between"><span class="t-tag">基础属性</span><span class="pill">${h.role}</span></div><div class="row wrap" style="margin-top:6px;gap:12px;font-size:12px" class="mono"><span>耐久 <b class="t-num">${st.hp}</b></span><span>攻击 <b class="t-num">${st.dmg}</b></span><span>射程 <b class="t-num">${st.range}</b></span><span>攻速 <b class="t-num">${(1 / st.rate).toFixed(2)}/s</b></span><span>移速 <b class="t-num">${st.speed}</b></span>${st.armor ? `<span>护甲 <b class="t-num">${st.armor}</b></span>` : ''}</div></div>
        <div class="skill"><div class="k">被动</div><div><h4>${h.passive.name}</h4><p>${h.passive.desc}</p></div></div>
        ${h.skills.map((s, i) => `<div class="skill"><div class="k">${ic[i]}</div><div><h4>${s.key} · ${s.name}</h4><p>${s.desc}</p><div class="meta">算力 ${CF.Skills.cost({ heroId: h.id }, s)} · 冷却 ${s.cd}s · ${{ self: '以自身为中心', dir: '指向方向', point: '指定位置' }[s.target]}</div></div></div>`).join('')}`,
      special: () => { const u = UT[uKey], b = BT[bKey]; return `<div class="skill"><div class="k">兵</div><div><h4>专属小兵 · ${u.name}</h4><p>${u.desc}</p><div class="meta">耐久 ${u.hp} · 伤害 ${u.atk.dmg} · 射程 ${u.atk.range} · ${CF.Game.costHtml(u.cost)}（在 Agent 工坊训练）</div></div></div><div class="skill"><div class="k">建</div><div><h4>专属建筑 · ${b.name}</h4><p>${b.desc}</p><div class="meta">耐久 ${b.hp} · ${CF.Game.costHtml(b.cost)}（建造菜单第 8 位）</div></div></div><p class="small muted">只有选择 ${h.name} 出战时才能训练与建造。</p>`; },
      art: () => `<div class="card"><div class="t-tag">乐器（法宝${CF.Treasure.has(h.id) ? ' · 已获得' : ' · 未获得'}）</div><p class="t-body" style="color:var(--text)">${h.instrument} —— 主题曲《${ms.name.split('·')[1] || ms.name}》 · ${h.music.bpm} BPM · ${h.music.key} · ${h.music.scale}</p><p class="t-cap">记忆点：${h.music.motif}</p><div class="t-tag" style="margin-top:10px">配色（宪法第 2 章：背景三段 · 网格 · 主光 · 点缀 · 音符）</div><div class="swatches-big" style="margin-top:6px">${[['背景暗', h.pal.bg[0]], ['背景中', h.pal.bg[1]], ['背景亮', h.pal.bg[2]], ['网格', 'rgb(' + h.pal.grid.join(',') + ')'], ['主光', h.pal.glow], ['点缀', h.pal.accent], ['音符', h.pal.note]].map(([n, c]) => `<div><i style="background:${c}"></i>${n}<br>${c.startsWith('rgb') ? '' : c}</div>`).join('')}</div><div class="t-tag" style="margin-top:10px">特效语言</div><p class="t-cap">节拍时从角色处扩散像素方格波纹；乐器发声点飘出专属粒子（${h.fx.pats.length} 种像素形状），重拍时整片网格亮起、角色做强拍动作。</p></div>`,
    };
    // 主角的合奏主题曲：分轨试听（每件乐器可以单独开关，四个段落可以直接跳转）
    tabs.ens = () => `<div class="card"><div class="t-tag">九乐器合奏 · 《${(ms.name.match(/「(.+)」/) || [, ms.name])[1]}》</div><p class="t-cap" style="margin-top:4px">一首 32 小节的曲子分四段。点段落跳过去听；点乐器把它关掉，听听少了谁会怎样。贝斯与和声垫是「地基」，始终保留。</p>
      <div class="ens-secs">${CF.Audio.SECTIONS.map(([n, b, d], i) => `<button class="ens-sec" data-bar="${b}"><b>${i + 1} · ${n}</b><span>${d}</span></button>`).join('')}</div>
      <div class="ens-inst">${CF.Audio.ENSEMBLE.map(([k, n, hid]) => `<button class="ens-i ${CF.Audio.mute.has(k) ? '' : 'on'}" data-k="${k}"><canvas width="96" height="72"></canvas><span>${n}</span><small>${CF.Heroes.get(hid).name}</small></button>`).join('')}</div>
      <div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn sm" id="ensAll">全部乐器</button><button class="btn sm ghost" id="ensSolo">只听电吉他（主角）</button><button class="btn sm ghost" id="ensNone">只听地基</button></div>
      <p class="t-cap" style="margin-top:8px">正在播放：<b id="ensNow">—</b></p></div>`;
    const bindEns = () => {
      const box = body.querySelector('#hdTab');
      const play = () => { if (!CF.Audio.ctx || !CF.Audio.P_on || CF.Audio.curStyle !== 'xs') { CF.Audio.unlock(); CF.Audio.preview('xs', 0.9); } };
      box.querySelectorAll('.ens-i').forEach((b) => { const hd = CF.Heroes.get(CF.Audio.ENSEMBLE.find((x) => x[0] === b.dataset.k)[2]); const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = hd.pal.bg[1]; x.fillRect(0, 0, 96, 72); hd.draw(x, 12, 26, 3, { t: 0, showInst: true }); b.onclick = () => { const k = b.dataset.k; if (CF.Audio.mute.has(k)) CF.Audio.mute.delete(k); else CF.Audio.mute.add(k); b.classList.toggle('on', !CF.Audio.mute.has(k)); play(); }; });
      box.querySelectorAll('.ens-sec').forEach((b) => (b.onclick = () => { play(); CF.Audio.seek(+b.dataset.bar); CF.Audio.sfx('click'); }));
      const setAll = (keep) => { CF.Audio.mute.clear(); CF.Audio.ENSEMBLE.forEach(([k]) => { if (!keep(k)) CF.Audio.mute.add(k); }); box.querySelectorAll('.ens-i').forEach((b) => b.classList.toggle('on', !CF.Audio.mute.has(b.dataset.k))); play(); };
      box.querySelector('#ensAll').onclick = () => setAll(() => true);
      box.querySelector('#ensSolo').onclick = () => setAll((k) => k === 'guitar');
      box.querySelector('#ensNone').onclick = () => setAll(() => false);
      clearInterval(L._ensT); L._ensT = setInterval(() => { const el = document.getElementById('ensNow'); if (!el) return clearInterval(L._ensT); const [n, b] = CF.Audio.section(); el.textContent = `${n}（第 ${b + 1} 小节起）`; box.querySelectorAll('.ens-sec').forEach((x) => x.classList.toggle('on', +x.dataset.bar === b)); }, 300);
    };
    const tb = body.querySelector('#hdTabs'); let cur = 'lore';
    const draw = () => { tb.innerHTML = ''; [['lore', '档案'], ['skills', '技能'], ['special', '专属'], ['art', '乐器与配色']].concat(h.music.ensemble ? [['ens', '合奏分轨']] : []).forEach(([k, n]) => { const b = CF.h(`<button class="tab ${cur === k ? 'on' : ''}">${n}</button>`); b.onclick = () => { cur = k; draw(); CF.Audio.sfx('click'); }; tb.appendChild(b); }); body.querySelector('#hdTab').innerHTML = tabs[cur](); if (cur === 'ens') bindEns(); };
    draw();
    body.querySelector('#hdPick').onclick = () => { if (!CF.Roster.owns(h.id)) return; L.setHero(h.id); L.renderHero(h.id); CF.toast(`主英雄：${h.name}`, 'gold'); };
    body.querySelector('#hdMusic').onclick = () => { CF.Audio.preview(h.music.style, 0.7); CF.toast(`♪ ${ms.name}`); };
    body.querySelector('#hdLick').onclick = () => { CF.Audio.unlock(); CF.Audio.lick(h.id); heroStage.pulse(1, true); };
    CF.Audio.unlock(); CF.Audio.preview(h.music.style, 0.6);
  };
})();
