/* 新手教程（第一关首次进入自动开始）与「操作说明」页面 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const T = (CF.Tutorial = { active: false, i: 0, flags: {} });
  const touch = () => CF.UI.touch || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);

  function steps(g) {
    const n0 = g.nodes[0], n1 = g.nodes.find((n) => n !== n0 && n.type === 'chip' && CF.dist(n.x, n.y, g.core.x, g.core.y) < 340) || g.nodes[1];
    const choke = [g.core.x + 330, g.core.y];
    return [
      { t: '欢迎，指挥官', d: `这是你的主脑（橙色六边形）和英雄 <b>${g.heroDef.name}</b>。战斗界面只占屏幕四个角，中间都留给战场。`, btn: '开始' },
      { t: '① 点资源点，建矿机', d: '点一下<b>金色的晶片矿</b>，再点弹出的「矿机」。不需要找按钮——点哪里就在哪里建。', at: () => [n0.x, n0.y], ok: () => g.count('miner') >= 1 },
      { t: '② 再建一座', d: '另一个金色矿点也建上矿机，收入翻倍。', at: () => [n1.x, n1.y], ok: () => g.count('miner') >= 2 },
      { t: '③ 长按空地，拖放炮塔', d: touch() ? '在峡口附近的空地上<b>长按</b>，松手后弹出环形建造菜单，选「炮塔」，把虚影<b>拖到</b>想放的格子，点 ✓ 放置（也可以按住「炮塔」直接拖到战场上）。' : '在峡口附近的空地上<b>右键</b>（或按住左键半秒），弹出环形建造菜单，选「炮塔」，虚影跟着鼠标走，<b>左键</b>放置（按住 Shift 连续建造）。', at: () => choke, ok: () => g.count('turret') >= 1 },
      { t: '④ 选中英雄', d: '点一下英雄，或点右下角的圆形头像。', at: () => (g.hero.dead ? null : [g.hero.x, g.hero.y]), ok: () => g.sel.includes(g.hero.id) },
      { t: '⑤ 点地面移动', d: '英雄选中后，<b>点一下地面</b>就会走过去；点敌人就会攻击。路上遇到敌人也会自动开火。', ok: () => T.flags.moved },
      { t: '⑥ 释放技能', d: touch() ? '点右下角的技能按钮。需要瞄准的技能：按住按钮拖到目标处松手，或先点按钮再点战场。' : '点右下角技能按钮，或按 <b>Q / W / R</b>：技能会对准鼠标所在的位置。', dom: '#skillBar', ok: () => T.flags.cast },
      { t: '⑦ 移动视野', d: touch() ? '单指拖动平移，双指捏合缩放。' : '右键拖动平移，滚轮缩放，或者用方向键。', ok: () => T.flags.camera },
      { t: '⑧ 指挥全军', d: touch() ? '点左下角「全军」选中所有部队；也可以<b>长按后拖动</b>框选。' : '点左下角「全军」（或按 A）选中所有部队；按住左键拖动可以框选。', dom: '#fabAll', ok: () => T.flags.boxsel },
      { t: '准备好了！', d: '守住 3 波进攻。随时可以在 ☰ 菜单里查看操作速查，或去大厅的「说明」页面。', btn: '开战' },
    ];
  }
  T.maybeStart = function (g, force) {
    T.stop();
    if (!(force || (g.L.id === 'L1' && !CF.Save.data.tutorial.done))) return;
    T.active = true; T.i = 0; T.flags = {}; T.list = steps(g);
    T.hand = CF.h('<div class="tut-hand">👆</div>'); T.ring = CF.h('<div class="tut-ring"></div>');
    $('#field').appendChild(T.hand); $('#field').appendChild(T.ring);
    T.render();
  };
  T.stop = function () { T.active = false; $('#tutBox').innerHTML = ''; if (T.hand) T.hand.remove(); if (T.ring) T.ring.remove(); T.hand = T.ring = null; };
  T.render = function () {
    const s = T.list[T.i];
    $('#tutBox').innerHTML = `<div class="tut"><div class="st">新手教程 · ${T.i + 1}/${T.list.length}</div><h4>${s.t}</h4><p>${s.d}</p><div class="row"><button class="btn sm ghost" id="tutSkip">跳过教程</button>${s.btn ? `<button class="btn sm primary" id="tutNext">${s.btn}</button>` : '<span class="small muted">完成后自动进入下一步</span>'}</div></div>`;
    $('#tutSkip').onclick = () => T.finish(true);
    const n = $('#tutNext'); if (n) n.onclick = () => T.next();
  };
  T.next = function () { CF.Audio.sfx('correct'); T.i++; if (T.i >= T.list.length) return T.finish(); T.render(); };
  T.finish = function (skipped) { CF.Save.data.tutorial.done = true; CF.Save.save(); T.stop(); CF.toast(skipped ? '已跳过教程，随时可以在「说明」里重新开始' : '教程完成！守住阵地吧', 'gold'); };
  T.tick = function (g) {
    if (!T.active) return;
    if (g.wave === 0 && g.waveTimer < 20) g.waveTimer = 20;
    const s = T.list[T.i];
    if (s.ok && s.ok()) return T.next();
    let pos = null;
    if (s.at) { const w = s.at(); if (w) pos = [(w[0] - g.cam.x) * g.cam.z, (w[1] - g.cam.y) * g.cam.z, 34 * g.cam.z]; }
    else if (s.dom) { const el = $(s.dom), fr = CF.appRect($('#field')), r = CF.appRect(el); pos = [r.left - fr.left + r.width / 2, r.top - fr.top + r.height / 2, Math.max(r.width, r.height) / 2 + 6]; }
    T.hand.style.display = T.ring.style.display = pos ? 'block' : 'none';
    const card = $('#tutBox .tut'), fh = $('#field').clientHeight;
    if (card) { const low = pos && pos[1] < fh * 0.5; card.style.top = low ? 'auto' : ''; card.style.bottom = low ? (document.body.classList.contains('compact') ? '84px' : '96px') : ''; }
    if (pos) { T.hand.style.left = pos[0] + 'px'; T.hand.style.top = pos[1] + 'px'; T.ring.style.left = pos[0] - pos[2] + 'px'; T.ring.style.top = pos[1] - pos[2] + 'px'; T.ring.style.width = T.ring.style.height = pos[2] * 2 + 'px'; }
  };
  CF.bus.on('moved', () => (T.flags.moved = true));
  CF.bus.on('hero:cast', () => (T.flags.cast = true));
  CF.bus.on('camera', () => (T.flags.camera = true));
  CF.bus.on('boxsel', () => (T.flags.boxsel = true));

  // ================= 操作说明 =================
  T.renderHelp = function () {
    const G = [
      ['👆', '点一下', '选中单位或建筑；选中部队后点地面＝移动（沿途自动攻击），点敌人＝集火；点空资源点＝建矿机。', '左键单击（同左）'],
      ['✌', '双击', '双击我方单位：选中屏幕内所有同类；双击空地：取消选择。', '双击'],
      ['⏳', '长按', '长按空地后松手：在这里弹出环形建造菜单。', '右键空地（或按住左键半秒）'],
      ['⬚', '长按 + 拖动', '框选多个单位。', '按住左键拖动'],
      ['☝', '拖动', '平移视野。', '右键 / 中键拖动，或方向键'],
      ['🤏', '双指捏合', '缩放视野。', '滚轮'],
      ['🎯', '技能', '右下角圆形按钮。自身技能点一下释放；方向/位置技能：按住拖到目标处松手，或先点按钮再点战场。', 'Q / W / R：对准鼠标位置立刻释放'],
      ['🏗', '点建筑', '选中工坊等建筑时，训练按钮会绕在建筑周围；点战场设置集结点。', '同左；选中建筑后数字键 1–4 训练'],
      ['👤', '英雄头像', '点头像选中英雄，双击镜头跟过去。阵亡后头像显示倒计时。', '按 C'],
      ['⚑', '全军', '左下角按钮：选中全部部队。', '按 A'],
      ['☰', '菜单', '右上角：研究（答题换资源）、暂停、速度、小地图开关、简报与声音。', '空格暂停 · F 速度 · K 研究'],
    ];
    $('#helpBody').innerHTML = `
      <div class="card" style="margin-bottom:12px"><div class="row between wrap"><div><h3>第一次玩？</h3><p>跟着 10 步新手教程走一遍第一关，2 分钟学会全部操作。</p></div><button class="btn primary" id="startTut">开始新手教程</button></div></div>
      <div class="sec-title">战斗操作：能点一下完成的，就不需要按钮</div>
      <div class="gest">${G.map(([i, t, d, m]) => `<div class="card"><div class="gi">${i}</div><div><h3>${t}</h3><p>${d}</p><p class="small" style="margin-top:4px;color:var(--hero2)">🖱 ${m}</p></div></div>`).join('')}</div>
      <div class="sec-title">其他快捷键（电脑）</div>
      <p class="small muted" style="line-height:1.9">1–8：在鼠标位置直接建造（第 8 个是英雄专属建筑）　B：在鼠标处打开建造菜单　S 停止　H 驻守　G 推进主脑　Delete 拆除　Esc 取消</p>
      <div class="sec-title">四种玩法</div>
      <div class="grid g2">
        <div class="card"><h3>⚡ 快速模式（90 秒）</h3><p>通勤单手玩，竖屏横屏都行。手指在任意处拖动＝移动，松手站定；英雄自动攻击。踩着节拍点屏幕会打出「完美」冲击波，连击越高越爽。击杀攒满 FEVER 后点右下角爆发。每升一级三选一强化。</p></div>
        <div class="card"><h3>🧠 沉浸模式（参考魔兽争霸 3）</h3><p>战争迷雾、野怪营地与掉落物品、英雄升级加点（6 级开放大招）、攻击/护甲类型克制、人口与维护费、主脑三级科技、昼夜（夜晚视野缩小、野怪入睡）、会发育会进攻的 AI 对手。数值表见下方。</p></div>
        <div class="card"><h3>🗺 征程（战役 + 遭遇战）</h3><p>5 关剧情战役，每关有三星评价；遭遇战随机地形、三档难度。</p></div>
        <div class="card"><h3>🏰 主城</h3><p>像海岛奇兵 / 部落冲突一样建造与升级城池：大本营、资源建筑、研究所、英雄殿、兵营、城墙与防御塔。资源随真实时间产出；完成学习任务获得「学习加速」；「乱码入侵」会用你的城池布局打一场防守战。</p></div>
      </div>
      <div class="sec-title">沉浸模式数值手册</div>
      ${CF.Immersive ? CF.Immersive.tableHtml() : ''}
      <div class="sec-title">学习 → 战力</div>
      <p class="small muted" style="line-height:1.9">知识经验 → 起始晶片；实操经验 → 起始语料；完成实验 → 算力产出；线下任务 → 英雄技能伤害；「体」→ 英雄耐久；主城研究所 → 全军伤害 / 护甲；主城英雄殿 → 英雄属性。真正的成长发生在游戏之外——线下任务要真的去做。</p>`;
    $('#startTut').onclick = () => { CF.Save.data.tutorial.done = false; CF.UI.startBattle(CF.Levels.get('L1')); };
  };
})();
