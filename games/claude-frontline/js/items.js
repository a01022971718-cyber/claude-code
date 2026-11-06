/* 物品登记表（v8，《物品宪法》design/05-item-constitution.md）
 * 游戏里所有资源、道具、耗材、收藏品都在这里登记：名称、图标、类别、稀有度、世界观、获取渠道、作用、上限与规则。
 * 点战斗里的资源数字、大厅右上角的仓库，都会打开这里的说明。新增物品必须先在这里登记（宪法第 2 条）。 */
(function () {
  const CF = window.CF;
  const R = { common: ['普通', '#c9d4ff'], rare: ['稀有', '#4ef0ff'], epic: ['史诗', '#b48cff'], legend: ['传说', '#ffd257'] };
  const LIST = [
    // ---------- 资源（战斗与主城通用） ----------
    { id: 'chip', name: '晶片', icon: 'diamond-chip', cat: '资源', rar: 'common',
      world: '乱码潮退去后留在大地上的硅晶碎片。它们记得「秩序」的形状，是智能大陆最通用的货币和建材。',
      get: ['战斗中用矿机采集金色晶片矿点', '击败乱码单位的赏金', '关卡、组队副本（第 1 波）奖励', '电路工坊电网按真实时间产出', '战地研究答对题'],
      use: ['建造建筑、训练部队', '商城：英雄碎片、法宝锦囊、体力药剂'],
      rule: '战斗内没有上限；主城仓库上限 = 8000 + 1500 × 已完成的电路实验数。满 5 星英雄多出的碎片每片换 40 晶片。' },
    { id: 'corp', name: '语料', icon: 'diamond-corp', cat: '资源', rar: 'common',
      world: '被整理过的知识与文字。Agent 读了语料才会成长——乱码最怕的就是被读懂。',
      get: ['矿机采集青色语料矿点', '击败噪声兵等远程乱码', '学习的实操经验（开局语料加成）', '组队副本第 2 波、电网产出'],
      use: ['训练高级部队、建造高级建筑', '沉浸模式科技升级'], rule: '同晶片。' },
    { id: 'comp', name: '算力', icon: 'diamond-comp', cat: '资源', rar: 'rare',
      world: '主脑的思考能力。算力越高，同一时刻能想清楚的事情越多。',
      get: ['主脑每秒自动产出', '完成电路实验（算力产出加成）', '组队副本第 3 波', '战地研究答对题'],
      use: ['建造、训练、科技（v8 起技能不再消耗算力）'], rule: '战斗内资源，战斗结束后按结算换成主城仓库的资源。' },
    // ---------- 英雄战斗资源（技能释放条件，见 js/skillcost.js） ----------
    { id: 'energy', name: '能量', icon: 'bolt', cat: '英雄', rar: 'common', world: '英雄演奏时身体里流动的电，像乐手的气息。',
      get: ['每秒回复 5 点', '普攻命中回复 2 点'], use: ['释放技能（技能释放条件选「能量」时）'], rule: '每位英雄上限 100，每场战斗开始时满能量，不带出战斗。' },
    { id: 'beat', name: '节拍', icon: 'note', cat: '英雄', rar: 'common', world: '踩在拍子上的每一击都会被音乐记住，攒够了就能奏出技能。',
      get: ['普攻命中 +1 拍', '命中时正好在强拍上再 +1 拍'], use: ['释放技能：Q / W 用 2 拍，R 用 5 拍（技能释放条件选「节拍充能」时）'], rule: '最多存 6 拍；不带出战斗。' },
    // ---------- 养成 ----------
    { id: 'stamina', name: '体力', icon: 'bolt', cat: '养成', rar: 'common', world: '指挥官的精神。学习不累，打仗才累。',
      get: ['每 6 分钟恢复 1 点', '连续学习 25 分钟存 5 分钟无限体力；零散累计 40 分钟存 10 分钟', '商城体力药剂（+40）'],
      use: ['进入小关（6）、次级关（10）、组队副本（15）、沉浸模式（15）、遭遇战（8）、快速模式（4）'], rule: '上限 120，药剂可以超过上限。学院、实验室、电路工坊、英语田园不消耗体力。' },
    { id: 'boost', name: '学习加速', icon: 'rocket', cat: '养成', rar: 'rare', world: '学到新东西时那一下「想通了」的感觉，被做成了一张加速卡。',
      get: ['每获得 30 点学习经验得 1 次', '小关首通'], use: ['电路工坊：立即领取 1 小时的电网产出'], rule: '没有上限，不会过期。' },
    { id: 'frag', name: '英雄碎片', icon: 'star', cat: '养成', rar: 'epic', world: '英雄留在各地的一段旋律。收集够了，英雄就会循着旋律来找你。',
      get: ['章节掉落（每章固定一位英雄）', '组队副本第 5 波', '商城每日轮换（每位每天 3 片）'], use: ['未拥有：集齐 10 片解锁英雄', '已拥有：升星（普通英雄 50 / 120 / 250 / 500，主角 100 / 240 / 500 / 1000）'],
      rule: '满 5 星后多出的碎片每片换 40 晶片。主角造乐的碎片只走特殊渠道。' },
    { id: 'treasure', name: '法宝', icon: 'guitar', cat: '养成', rar: 'legend', world: '每位英雄独一无二的乐器。乐器觉醒的那一刻，英雄才能奏出终极技能。',
      get: ['开局英雄：通关第一章终章', '其他英雄：带着他打完一次组队副本 5 波', '10 片赐福法宝碎片兑换'], use: ['解锁终极技能 R，形象出现乐器和专属粒子'], rule: '每位英雄一件，永久拥有。' },
    { id: 'pouch', name: '法宝锦囊', icon: 'pouch', cat: '道具', rar: 'rare', world: '乐坊寄来的小锦囊，里面可能装着一片乐器的碎片。',
      get: ['第六章章节掉落', '商城每天 1 个（800 晶片）'], use: ['打开：35% 得到赐福法宝碎片（其中 30% 为 2 片），其余为补给'], rule: '概率在界面上公示；只用游戏内晶片购买。' },
    { id: 'bless', name: '赐福法宝碎片', icon: 'spark', cat: '道具', rar: 'epic', world: '被所有乐手祝福过的一小块乐器材料，可以变成任何一件法宝。',
      get: ['打开法宝锦囊'], use: ['集齐 10 片，为一位已拥有、还没有法宝的英雄赐福法宝'], rule: '没有上限。' },
    { id: 'plant', name: '发电厂碎片', icon: 'factory', cat: '收藏', rar: 'rare', world: '人类最早的电站留下的图纸残页。收齐了，它们会成为造芯田园的守卫。',
      get: ['第二章（火力发电厂）、第三章（核能发电厂）章节掉落'], use: ['集齐 10 片收藏电站；电网产出加成（火电 +20%、核电 +40%）'], rule: '已收藏后多出的碎片换成晶片（每片 40）。' },
    { id: 'gen', name: '电网机组', icon: 'atom', cat: '养成', rar: 'rare', world: '每弄懂一个电路，电网里就多一台发电机组为你工作。',
      get: ['每完成一个电路实验 +1 台'], use: ['按真实时间产出晶片 / 语料 / 算力（最多存 12 小时）', '前 12 台机组加成所有战斗（攻击 +2% / 台等）'], rule: '电路实验首次完成才算。' },
    { id: 'part', name: '机器人 / 卫星部件', icon: 'robot', cat: '收藏', rar: 'epic', world: '具身智能和航空航天模块里，每个弄懂的电路都会变成一个真实存在的部件。',
      get: ['完成具身智能、航空航天模块的电路实验'], use: ['收进「装配图」，了解它从元器件到调试的完整工艺；以后用于组装游戏'], rule: '每个实验对应一个部件，永久拥有。' },
    { id: 'component', name: '元器件', icon: 'bulb', cat: '耗材', rar: 'common', world: '电路工坊的材料柜：导线、电池、电阻、电机……每个实验发给你刚好够用的一份。',
      get: ['每个实验按题目发放（元件盒里的数字）', '自由搭建无限量'], use: ['在电路板上搭电路'], rule: '只在当前实验里有效，重置或换实验时收回。' },
    // ---------- 装扮（v9.2，物品宪法第 7 章） ----------
    { id: 'skin-tint', name: '炫彩皮肤', icon: 'palette', cat: '装扮', rar: 'epic', world: '乐坊的调色师把英雄的颜色重新调过一遍，但每一种颜色都还在造月色卡里——换了衣服，还是那个人。',
      get: ['商城「皮肤」：墨韵 600、星夜 1200、霓虹 2000 晶片（每位英雄单独购买）', '鎏金：英雄升到 3 星自动解锁'], use: ['换英雄外观：大厅、战场、像素脉冲舞台、图鉴、英雄档案、英语田园都会换'],
      rule: '只换颜色，不加任何属性；买一次永久拥有；只用游戏里赚到的晶片，不卖真实货币；没有随机抽取。' },
    { id: 'skin-mine', name: '我的外观', icon: 'palette', cat: '装扮', rar: 'rare', world: '你在像素工坊里亲手画的样子。美也是一种能力。',
      get: ['实验室 · 像素工坊 →「保存」→「存进衣柜并穿上」'], use: ['和炫彩皮肤一样，穿上后全游戏都换'], rule: '每位英雄的衣柜最多 6 套（满了挤掉最早、没穿着的一套）；颜色来自造月色卡；只存在本机。' },
    // ---------- 沉浸模式道具（野怪掉落 / 战场商店） ----------
    { id: 'potion', name: '治疗药水', icon: 'flask', cat: '沉浸道具', rar: 'common', world: '用整理好的语料熬成的药，喝下去脑子清醒、身体回血。', get: ['沉浸模式商店（60 晶片）', '简单野怪营地掉落'], use: ['立即回复 450 耐久（用掉就没了）'], rule: '物品栏最多 4 格；不带出战斗。' },
    { id: 'scroll', name: '回城卷轴', icon: 'redbook', cat: '沉浸道具', rar: 'common', world: '写着主脑坐标的卷轴，读一遍就会被拉回家。', get: ['沉浸模式商店（80 晶片）'], use: ['1.5 秒后传送回主脑（用掉就没了）'], rule: '同上。' },
    { id: 'claw', name: '攻击之爪', icon: 'swords', cat: '沉浸道具', rar: 'rare', world: '从幻觉巨像身上掰下来的一片硬壳。', get: ['沉浸模式商店（220 晶片）', '中等野怪营地掉落'], use: ['攻击 +12'], rule: '同上。' },
    { id: 'boots', name: '疾风之靴', icon: 'boot', cat: '沉浸道具', rar: 'rare', world: '鞋底刻着节拍器的靴子。', get: ['沉浸模式商店（180 晶片）', '中等野怪营地掉落'], use: ['移速 +40'], rule: '同上。' },
    { id: 'ring', name: '回复指环', icon: 'heart', cat: '沉浸道具', rar: 'common', world: '一圈会自己哼歌的指环。', get: ['沉浸模式商店（160 晶片）', '简单野怪营地掉落'], use: ['每秒回复 4 耐久'], rule: '同上。' },
    { id: 'shield', name: '护甲护符', icon: 'shield', cat: '沉浸道具', rar: 'rare', world: '主脑防火墙的一小块。', get: ['沉浸模式商店（200 晶片）', '中等野怪营地掉落'], use: ['护甲 +4'], rule: '同上。' },
    { id: 'orb', name: '音律宝珠', icon: 'moonfull', cat: '沉浸道具', rar: 'epic', world: '把一整首曲子压缩成的一颗珠子。', get: ['困难野怪营地掉落'], use: ['技能冷却 −15%'], rule: '同上；不卖。' },
    { id: 'crown', name: '造物者王冠', icon: 'trophy', cat: '沉浸道具', rar: 'legend', world: '传说中第一位指挥家戴过的王冠。', get: ['困难野怪营地掉落'], use: ['攻击 +15%、耐久 +300'], rule: '同上；不卖。' },
  ];
  const I = (CF.Items = { LIST, RAR: R, get: (id) => LIST.find((x) => x.id === id) });
  const ic = (it) => (it.icon.startsWith('diamond-') ? `<span class="diamond bg-${it.icon.slice(8)}" style="width:14px;height:14px"></span>` : CF.Icons ? CF.Icons.svg(it.icon, 'pi') : '');
  const card = (it) => `<div class="it-card"><div class="it-hd"><span class="it-ic">${ic(it)}</span><b>${it.name}</b><span class="it-tag">${it.cat}</span><span class="it-rar" style="color:${R[it.rar][1]}">${R[it.rar][0]}</span></div><p class="it-world">${it.world}</p><div class="it-sec"><em>获取</em><ul>${it.get.map((x) => `<li>${x}</li>`).join('')}</ul></div><div class="it-sec"><em>作用</em><ul>${it.use.map((x) => `<li>${x}</li>`).join('')}</ul></div><div class="it-sec"><em>规则</em><p>${it.rule}</p></div></div>`;
  I.show = function (id) { const it = I.get(id); if (!it) return; CF.Audio.sfx('click'); CF.modal.open({ title: `物品 · ${it.name}`, body: card(it), foot: [{ text: '物品图鉴', cls: 'ghost', onClick: () => { CF.modal.close(); I.codex(it.cat); } }, { text: '好的', cls: 'primary' }] }); };
  I.codex = function (cat) {
    const cats = [...new Set(LIST.map((x) => x.cat))]; let cur = cat || cats[0];
    const body = CF.h('<div><div class="tabs it-tabs"></div><div class="it-list"></div></div>');
    const draw = () => { const tb = body.querySelector('.it-tabs'), ls = body.querySelector('.it-list'); tb.innerHTML = ''; cats.forEach((c) => { const b = CF.h(`<button class="tab ${c === cur ? 'on' : ''}">${c}</button>`); b.onclick = () => { cur = c; draw(); }; tb.appendChild(b); }); ls.innerHTML = LIST.filter((x) => x.cat === cur).map(card).join(''); };
    draw(); CF.modal.open({ title: '物品图鉴', body, foot: [{ text: '关闭', cls: 'primary' }] });
  };
  // 点资源就看说明：战斗 HUD 的三种资源、大厅仓库
  document.addEventListener('click', (e) => {
    const r = e.target.closest && e.target.closest('.hud-res .r'); if (r) { const t = r.getAttribute('title'); const it = LIST.find((x) => x.name === t); if (it) { const g = CF.Game.current; if (g) g.paused = true; I.show(it.id); } return; }
    if (e.target.closest && e.target.closest('#lobbyRes')) I.codex('资源');
  });
})();
