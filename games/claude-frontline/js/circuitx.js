/* 电路工坊扩展（v8，主创要求）
 * 1. 部件收集：具身智能、航空航天模块里每完成一个电路实验，就得到机器人 / 卫星上的一个真实部件，收进「装配图」；
 *    每个部件都有从「元器件 → 电路 → 程序 → 制作 → 组装 → 调试」的完整工艺流程说明。以后用于组装游戏。
 * 2. 本地电路解析：输入一句话（例如「6V 电池串联一个开关，再并联两个灯泡」），离线拆成可以玩的电路：
 *    直接搭好（可以随便改）或者变成题目（元件摆好、导线自己连，读数和标准答案一致就算过关）。
 *    拍照识别电路图需要图像识别模型，本版本先支持文字（已记入 NEXT.md）。 */
(function () {
  const CF = window.CF;
  const C = CF.City;
  // ---------------- 部件 ----------------
  const F = (a, b, c, d, e, f) => ({ 元器件: a, 电路: b, 程序: c, 制作: d, 组装: e, 调试: f });
  const PARTS = {
    e1: { sys: 'robot', slot: 'joint', name: '关节电机', world: '让机械臂抬起来的第一块肌肉。', flow: F('直流有刷电机、电池、开关、导线', '电源—开关—电机串联成闭合回路', '先手动开关；以后由主控板输出 PWM 调速', '绕制线圈、装永磁体、装电刷和换向器、压入轴承', '电机装进关节外壳，后接减速齿轮组，输出轴接连杆', '测空载电流和堵转电流、确认转向、听有没有异响') },
    e2: { sys: 'robot', slot: 'battery', name: '电池包', world: '机器人的心脏，几节电芯一起跳。', flow: F('锂电芯、镍片、保护板（BMS）、电压表', '电芯串联提高电压，必要时再并联提高容量', 'BMS 程序：过充 / 过放 / 过流 / 温度保护', '电芯配组（电压、内阻一致）、点焊镍片、装保护板', '装进躯干电池仓，引出主电源线和通信线', '测总电压、内阻、充放电曲线，做过流保护测试') },
    e3: { sys: 'robot', slot: 'wheels', name: '左右驱动轮组', world: '一左一右两只脚，步子要一样大。', flow: F('两个电机、轮子、电流表、导线', '两个电机并联在同一电源上，干路电流 = 两路之和', '差速控制：左右轮速度不同就能转弯', '轮毂压装、电机与减速箱对中', '左右对称安装到底盘，走线固定', '测两边转速是否一致，跑直线看是否跑偏') },
    e4: { sys: 'robot', slot: 'eye', name: '巡线视觉传感器', world: '看得见地上那条黑线的眼睛。', flow: F('光敏电阻 / 光电管、分压电阻、电压表', '光敏电阻与定值电阻串联分压，输出电压随光照变化', '单片机 ADC 读电压，设阈值区分「黑线 / 白地」', '焊接传感器板，加遮光罩', '装在机器人前下方，离地 5–10 mm', '在黑白地面上标定阈值，测响应速度') },
    e5: { sys: 'robot', slot: 'driver', name: 'H 桥电机驱动板', world: '让电机既能前进也能后退的十字路口。', flow: F('4 个开关（真实电路里是 MOSFET）、电机、电源', '四个开关组成 H 形，对角导通决定电流方向', '正转 / 反转 / 刹车 / 停止四种状态，加死区时间防止直通短路', '贴片焊接 MOSFET 和驱动芯片，加散热片', '装在电机旁边，主控板发出方向和 PWM 信号', '示波器看波形，测正反转电流，测发热') },
    e6: { sys: 'robot', slot: 'guard', name: '过流保护模块', world: '电机被卡住时第一个站出来的保镖。', flow: F('保险丝（或自恢复保险丝 PTC）、电流检测电阻', '保险丝串在电机回路里', '进阶：单片机检测电流，超限就关断驱动', '选型：额定电流在正常电流和堵转电流之间', '串接在电源到驱动板之间', '模拟堵转，确认能在规定时间内断开') },
    e7: { sys: 'robot', slot: 'power', name: '继电器功率控制板', world: '用一根手指推开一扇大门。', flow: F('继电器（线圈 + 触点）、控制电源、动力电源', '控制回路驱动线圈，触点开关动力回路，两回路电气隔离', '主控板 GPIO 经三极管驱动线圈，线圈并联续流二极管', '焊接继电器、续流二极管、接线端子', '装在配电盒里，动力线与信号线分开走', '测吸合电压、触点电阻、反复开关寿命') },
    e8: { sys: 'robot', slot: 'brain', name: '智能感知主控板', world: '机器人的大脑：感觉、判断、动手。', flow: F('单片机、传感器、MOSFET、负载', '单片机供电；传感器信号进单片机；单片机输出控制 MOSFET', '「如果光照 < 50% 就开灯」——感知 → 决策 → 执行', '画 PCB、贴片焊接、烧录程序', '装在躯干中心，连接各传感器和执行器', '逐个测试输入输出，写日志，调阈值') },
    a1: { sys: 'sat', slot: 'beacon', name: '信标灯', world: '告诉地面「我还在这里」的那一点光。', flow: F('太阳能电池片、LED / 灯、导线', '太阳能板直接驱动信标，电流随光照变化', '进阶：按固定节奏闪烁，编码卫星编号', '电池片串焊、封装、贴在面板上', '装在卫星外表面朝向地球的一侧', '光照箱里测不同光照下的电流和亮度') },
    a2: { sys: 'sat', slot: 'pdu', name: '配电单元 PDU', world: '把一条母线分给每一台设备的分水岭。', flow: F('主母线、每路开关（继电器 / 固态开关）、负载', '各负载并联在母线上，每路有独立开关', '地面指令或星上程序控制每一路的开关', '多层 PCB、大电流铜排、接插件', '装在卫星舱内中心，所有设备从这里取电', '逐路通断测试、测压降、做热真空试验') },
    a3: { sys: 'sat', slot: 'charge', name: '太阳翼充电控制器', world: '白天存下阳光，夜里慢慢用。', flow: F('太阳能板、二极管、蓄电池、负载', '太阳能板经二极管给蓄电池充电，负载接在蓄电池上', '最大功率点跟踪（MPPT）、充电截止电压控制', '焊接功率器件、做三防涂覆', '装在太阳翼根部到电池之间', '模拟日照 / 阴影交替，测充电电流和反灌电流') },
    a4: { sys: 'sat', slot: 'redund', name: '冗余电源模块', world: '一路倒下，另一路马上顶上。', flow: F('两路电源、两个二极管、关键负载', '两路电源各串一个二极管，汇到同一母线（二极管或门）', '健康监测：检测哪一路电压掉了并上报地面', '选低压降二极管或理想二极管芯片', '两路电源分开走线，汇流点靠近负载', '依次断开每一路，确认负载不掉电、没有反灌') },
    a5: { sys: 'sat', slot: 'fuse', name: '分区保护熔断盒', world: '哪里出事，就只关哪里。', flow: F('每路保险丝、母线、各支路负载', '每条支路串自己的保险丝，额定值略大于正常电流', '进阶：电子保险丝，可以在轨远程复位', '选型计算：正常电流 < 额定 < 故障电流', '装在 PDU 出口，每路贴标签', '逐路做短路、堵转试验，确认只断这一路') },
    a6: { sys: 'sat', slot: 'sensor', name: '稳压传感器接口', world: '给娇气的传感器一个稳稳的 5 伏。', flow: F('限流电阻、稳压二极管、传感器', '电阻和反接的稳压管串联，传感器并在稳压管两端', '传感器输出由单片机 ADC 采样', '计算电阻：R = (U − Uz) / I；选功率', '装在传感器旁边的小板上', '改变母线电压，测接口电压是否稳定') },
  };
  C.PARTS_RW = PARTS;
  const S = () => { const c = CF.Save.data.city; c.parts = c.parts || {}; return c.parts; };
  C.grantPart = function (labId) {
    const P = PARTS[labId]; if (!P || S()[labId]) return;
    S()[labId] = Date.now(); CF.Save.save();
    setTimeout(() => CF.toast(`获得部件：${P.sys === 'robot' ? '机器人' : '卫星'}的「${P.name}」——在「装配图」里看它的完整工艺`, 'gold', 3600), 900);
  };
  const ROBOT = [['eye', 1, 2], ['brain', 2, 2], ['battery', 2, 3], ['joint', 1, 3], ['driver', 3, 3], ['power', 3, 2], ['guard', 2, 4], ['wheels', 2, 5]];
  const SAT = [['beacon', 1, 1], ['charge', 1, 2], ['pdu', 2, 2], ['redund', 3, 2], ['fuse', 2, 3], ['sensor', 3, 3]];
  C.assembly = function () {
    const own = S(), cell = (sys, slot, x, y) => { const id = Object.keys(PARTS).find((k) => PARTS[k].sys === sys && PARTS[k].slot === slot), P = PARTS[id], got = own[id]; return `<button class="as-slot ${got ? 'got' : ''}" data-id="${id}" style="grid-column:${x};grid-row:${y}"><b>${P.name}</b><span>${got ? '已获得' : '完成实验「' + (C.LABS.find((l) => l.id === id) || {}).title + '」'}</span></button>`; };
    const body = CF.h(`<div class="as"><div class="as-sys"><div class="t-tag">具身智能 · 机器人</div><div class="as-grid robot">${ROBOT.map(([s, x, y]) => cell('robot', s, x, y)).join('')}</div></div><div class="as-sys"><div class="t-tag">航空航天 · 小卫星</div><div class="as-grid sat">${SAT.map(([s, x, y]) => cell('sat', s, x, y)).join('')}</div></div><p class="small muted" style="margin-top:8px">点一个部件，看它从一个元器件到调试完成的完整工艺。集齐以后会开放「组装」玩法（下一版本）。</p></div>`);
    body.querySelectorAll('.as-slot').forEach((b) => (b.onclick = () => C.partInfo(b.dataset.id)));
    CF.modal.open({ title: `装配图（${Object.keys(own).length}/${Object.keys(PARTS).length}）`, body, foot: [{ text: '关闭', cls: 'primary' }] });
  };
  C.partInfo = function (id) {
    const P = PARTS[id], got = S()[id];
    CF.modal.open({ title: `${P.sys === 'robot' ? '机器人' : '卫星'}部件 · ${P.name}${got ? '' : '（未获得）'}`, body: `<p class="it-world">${P.world}</p><ol class="as-flow">${Object.entries(P.flow).map(([k, v]) => `<li><b>${k}</b>${v}</li>`).join('')}</ol>`, foot: [{ text: '返回装配图', cls: 'ghost', onClick: () => { CF.modal.close(); C.assembly(); } }, { text: '好的', cls: 'primary' }] });
  };

  // ---------------- 本地电路解析 ----------------
  const NAMES = [['太阳能板', 'solar'], ['光敏电阻', 'ldr'], ['热敏电阻', 'ntc'], ['电位器', 'pot'], ['稳压二极管', 'zener'], ['发光二极管', 'led'], ['LED', 'led'], ['led', 'led'], ['二极管', 'diode'], ['电流表', 'ammeter'], ['电压表', 'voltmeter'], ['保险丝', 'fuse'], ['蜂鸣器', 'buzzer'], ['电容', 'cap'], ['电阻', 'resistor'], ['开关', 'switch'], ['电机', 'motor'], ['马达', 'motor'], ['灯泡', 'bulb'], ['小灯', 'bulb'], ['灯', 'bulb'], ['电池', 'battery'], ['电源', 'battery']];
  const NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  C.parseText = function (raw) {
    const text = raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 65248)).replace(/欧姆|欧/g, 'Ω').replace(/伏特?/g, 'V').replace(/毫安/g, 'mA');
    const items = [], notes = []; let mode = 'series', i = 0;
    while (i < text.length) {
      if (text.startsWith('并联', i)) { mode = 'parallel'; i += 2; continue; }
      if (text.startsWith('串联', i)) { mode = 'series'; i += 2; continue; }
      const hit = NAMES.find(([n]) => text.startsWith(n, i));
      if (!hit) { i++; continue; }
      const [n, type] = hit, before = text.slice(Math.max(0, i - 8), i), after = text.slice(i + n.length, i + n.length + 10);
      const qm = before.match(/(\d+|[一两二三四五六])\s*[个只节盏块颗]?\s*(?:\d+(?:\.\d+)?\s*(?:k|K)?\s*[ΩVA])?\s*的?\s*$/), qty = qm ? (NUM[qm[1]] || Math.min(6, +qm[1] || 1)) : 1;
      const vm = (before + '|' + after).match(/(\d+(?:\.\d+)?)\s*(k|K)?\s*(Ω|V|A)/);
      let val;
      if (vm) { const x = +vm[1] * (vm[2] ? 1000 : 1); if (type === 'resistor' && vm[3] === 'Ω') val = x; if ((type === 'battery') && vm[3] === 'V') val = x; if (type === 'fuse' && vm[3] === 'A') val = x; }
      const realQty = qm && /\d+\s*[ΩVA]/.test(qm[0]) && !/[个只节盏块颗]/.test(qm[0]) ? 1 : qty;
      for (let k = 0; k < realQty; k++) items.push({ type, val, mode: type === 'voltmeter' ? 'parallel' : mode });
      if (type === 'voltmeter' && mode === 'series') notes.push('电压表要并联，已经自动放到并联支路里。');
      i += n.length;
    }
    let src = items.findIndex((x) => x.type === 'battery' || x.type === 'solar');
    if (src < 0) { items.unshift({ type: 'battery', val: 6, mode: 'series' }); src = 0; notes.push('没有找到电源，自动加了一节 6 V 电池。'); }
    const source = items.splice(src, 1)[0];
    if (source.type === 'battery' && !source.val) source.val = 6;
    const ser = items.filter((x) => x.mode === 'series'), par = items.filter((x) => x.mode === 'parallel');
    if (!ser.length && !par.length) return { error: '没有认出用电器。试试写「电池、开关、灯泡」「电阻 100Ω」「并联两个灯泡」这样的词。' };
    if (ser.length + par.length > 12) return { error: '元件太多了（最多 12 个），分成几次解析吧。' };
    // 布局：电源竖放在左边；第 3 排是正极轨，第 8 排是负极轨；串联元件排在正极轨上，并联元件竖着接在两条轨之间
    const parts = [], W = (e) => parts.push({ type: 'wire', e }), TOP = 2, BOT = 7;
    parts.push({ type: source.type, e: `v,1,${TOP}`, val: source.val ?? (source.type === 'solar' ? 100 : undefined) });
    for (let r = TOP + 1; r < BOT; r++) W(`v,1,${r}`);
    let x = 1; W(`h,${x},${TOP}`); x++;
    ser.forEach((it) => { parts.push({ type: it.type, e: `h,${x},${TOP}`, val: it.val, on: it.type === 'switch' ? true : undefined }); x++; W(`h,${x},${TOP}`); x++; });
    let last = x;
    if (par.length) {
      par.forEach((it, k) => { const cx = x + k * 2; W(`v,${cx},${TOP}`); parts.push({ type: it.type, e: `v,${cx},${TOP + 1}`, val: it.val }); for (let r = TOP + 2; r < BOT; r++) W(`v,${cx},${r}`); last = cx; });
      for (let c = x; c < last; c++) W(`h,${c},${TOP}`);
    } else for (let r = TOP; r < BOT; r++) W(`v,${x},${r}`);
    for (let c = 1; c < last; c++) W(`h,${c},${BOT}`);
    return { parts, cols: Math.max(17, last + 3), rows: 11, notes, source, ser, par };
  };
  C.parseUI = function () {
    const body = CF.h(`<div class="cx-parse"><p class="small muted" style="line-height:1.7">用一句话描述电路，游戏把它拆成可以玩的电路。认得：电池 / 电源（带电压）、太阳能板、开关、灯泡、LED、电阻（带阻值）、电机、电流表、电压表、电容、二极管、稳压二极管、保险丝、蜂鸣器、光敏 / 热敏电阻、电位器；用「串联」「并联」说明连接方式。</p><textarea id="cxText" rows="3" style="width:100%">9V 电池串联一个开关和 100Ω 电阻，再并联两个灯泡和一个电机</textarea><div class="row wrap" style="gap:6px;margin-top:6px"><button class="btn sm ghost" data-ex="6V电池、开关、两个灯泡串联">例：串联</button><button class="btn sm ghost" data-ex="3V电池并联三个灯泡">例：并联</button><button class="btn sm ghost" data-ex="太阳能板串联电流表，并联电压表和LED">例：太阳能</button></div><p class="small muted" style="margin-top:6px">拍照识别电路图需要图像识别模型，这一版先支持文字。</p><div id="cxOut" class="small"></div></div>`);
    body.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { body.querySelector('#cxText').value = b.dataset.ex; }));
    const go = (asPuzzle) => {
      const txt = body.querySelector('#cxText').value.trim(), r = C.parseText(txt);
      if (r.error) { body.querySelector('#cxOut').innerHTML = `<p style="color:#ff5d6c">${r.error}</p>`; return; }
      CF.modal.close();
      const base = { id: 'custom', mod: 'custom', cols: r.cols, rows: r.rows, lv: '自由', title: '解析电路', know: '这是按你的描述自动生成的电路：电源在左边，正极轨在上、负极轨在下。', bridge: '把文字描述变成电路图（再变成仿真模型），就是电路设计软件里「原理图输入」做的事。', hint: '串联元件排在上面一条线上；并联元件竖着接在上下两条线之间。' };
      if (!asPuzzle) { C.loadLab(Object.assign(base, { free: true, goal: `「${txt}」——已经帮你搭好了，可以随便改，读数实时更新。`, fixed: [], pal: {}, preset: r.parts, check: () => true })); }
      else {
        // 题目：先算标准答案的读数，再把非导线元件固定、导线收走
        const ref = r.parts.map((p) => Object.assign({}, p)); C.withGrid(r.cols, r.rows, () => C.solve(ref));
        const want = ref.filter((p) => p.type !== 'wire').map((p) => ({ e: p.e, I: Math.abs(p.I || 0), V: Math.abs(p.V || 0), type: p.type }));
        const fixed = r.parts.filter((p) => p.type !== 'wire').map((p) => Object.assign({ fixed: true }, p));
        const nW = r.parts.filter((p) => p.type === 'wire').length;
        C.loadLab(Object.assign(base, { goal: `按「${txt}」连线：元件已经摆好，用导线把它们连起来，所有读数和标准电路一致就过关。`, fixed, pal: { wire: nW + 4 },
          check: (P, T) => T((ps) => ps.forEach((p) => p.type === 'switch' && (p.on = true)), (Q) => want.every((w) => { const q = Q.find((x) => x.e === w.e); return q && (w.type === 'voltmeter' ? Math.abs(Math.abs(q.V) - w.V) < 0.05 + 0.05 * w.V : Math.abs(Math.abs(q.I) - w.I) < 0.002 + 0.08 * w.I); })) }));
        C.ANS.custom = r.parts.filter((p) => p.type === 'wire').map((p) => `wire@${p.e}`).join(' ');
      }
      if (r.notes.length) CF.toast(r.notes.join(' '), '', 3600);
    };
    CF.modal.open({ title: '本地电路解析', body, foot: [{ text: '变成题目（自己连线）', cls: 'ghost', onClick: () => go(true) }, { text: '直接搭好', cls: 'primary', onClick: () => go(false) }] });
  };
  // 在工坊顶栏加两个按钮
  const enter0 = C.enter;
  C.enter = function () {
    enter0.apply(this, arguments);
    const top = document.querySelector('.cw-top'); if (!top || top.querySelector('#cxParts')) return;
    const box = CF.h('<div class="row" style="gap:6px"><button class="glass btn sm" id="cxParts">装配图</button><button class="glass btn sm" id="cxParse">解析电路</button></div>');
    top.insertBefore(box, top.querySelector('#cwRes'));
    box.querySelector('#cxParts').onclick = () => { CF.Audio.sfx('click'); C.assembly(); };
    box.querySelector('#cxParse').onclick = () => { CF.Audio.sfx('click'); C.parseUI(); };
  };
})();
