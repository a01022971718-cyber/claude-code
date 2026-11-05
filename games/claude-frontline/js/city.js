/* 主城 → 电路工坊（v1）：从高中电路图衔接到大学电路的「学习 + 轻养成」
 * - 10 个电路实验：高中（闭合回路、开关、串并联、伏安法）→ 衔接（分压、LED 限流）→ 大学（基尔霍夫、惠斯通电桥、RC 充电）。
 * - 操作沿用沉浸模式的拖拽放置：从下方元件盒按住元件拖到电路板的「边」上（两个接线点之间），松手放下；
 *   点元件可以开关 / 换阻值 / 翻转极性 / 拿走；已经放好的元件可以再拖到别处。
 * - 电路是真的在算：节点电压法 + 牛顿式迭代（二极管）+ 后向欧拉（电容），所以接错了灯就是不亮。
 * - 轻养成：每完成一个实验，电网多一台发电机组，按真实时间产出晶片 / 语料 / 算力；收藏的发电厂再加成。
 * - 对外接口保持不变（storage / add / reward / bonus / level / enter / leave / bind），征程奖励与商城照常使用仓库。 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  // v7：电路板大小随实验变化（基础 7 × 5；具身智能 9 × 6；航空航天、自由搭建 11 × 7）
  let COLS = 7, ROWS = 5;
  const GW = 1e4, HOUR = 3600 * 1000;
  const C = (CF.City = {});

  // ================= 数据（仓库沿用旧主城的 res，旧存档资源不丢） =================
  function data() {
    const d = CF.Save.data;
    if (!d.city) d.city = { res: { chip: 600, corp: 400, comp: 60 } };
    const c = d.city;
    if (!c.res) c.res = { chip: 600, corp: 400, comp: 60 };
    if (!c.cw) c.cw = { solved: {}, last: Date.now(), stock: { chip: 0, corp: 0, comp: 0 }, sandbox: [] };
    return c;
  }
  const solvedN = () => Object.keys(data().cw.solved).length;
  C.storage = () => data().res;
  C.cap = () => 8000 + solvedN() * 1500;
  C.add = function (r) {
    const c = data(), cap = C.cap(), out = {};
    for (const k in r) { const before = c.res[k] || 0; c.res[k] = Math.min(cap, before + Math.max(0, Math.round(r[k]))); out[k] = c.res[k] - before; }
    CF.Save.save(); return out;
  };
  C.reward = function (win, stars, L) {
    if (!win) return C.add({ chip: 60, corp: 30, comp: 0 });
    const k = L.immersive ? 2.5 : L.skirmish ? 1.5 : 1;
    return C.add({ chip: (150 + stars * 120) * k, corp: (90 + stars * 70) * k, comp: (15 + stars * 15) * k });
  };
  // 电路学得越多，战场越强（学习 → 战力）
  // v7：实验变多了，战斗加成最多按 12 个实验计算
  C.bonus = function () { const n = Math.min(12, solvedN()); return { atkMul: 1 + n * 0.02, bldMul: 1 + n * 0.02, heroMul: 1 + n * 0.015, extraCoders: n >= 5 ? 1 : 0, startChip: n * 20, solved: n }; };
  C.level = (type) => (type === 'hall' ? Math.floor(solvedN() / 3) : 0);

  // ================= 电网（轻养成） =================
  const plantMul = () => 1 + (CF.Collect && CF.Collect.owns('plant_thermal') ? 0.2 : 0) + (CF.Collect && CF.Collect.owns('plant_nuclear') ? 0.4 : 0);
  C.rate = () => { const n = solvedN(), m = plantMul(); return { chip: Math.round(30 * n * m), corp: Math.round(18 * n * m), comp: Math.round(5 * n * m) }; }; // 每小时
  C.tick = function () {
    const cw = data().cw, now = Date.now(), dt = Math.min(12 * HOUR, now - cw.last), r = C.rate();
    if (dt > 0) { for (const k in r) cw.stock[k] = Math.min(r[k] * 12, (cw.stock[k] || 0) + (r[k] * dt) / HOUR); cw.last = now; }
  };
  C.collect = function () { C.tick(); const cw = data().cw, got = C.add({ chip: cw.stock.chip, corp: cw.stock.corp, comp: cw.stock.comp }); cw.stock = { chip: 0, corp: 0, comp: 0 }; CF.Save.save(); CF.Audio.sfx('unlock'); CF.toast(`电网收取：晶片 +${got.chip} · 语料 +${got.corp} · 算力 +${got.comp}`, 'gold'); C.renderTop(); };
  C.boost = function () {
    const d = CF.Save.data;
    if (!(d.boosts > 0)) return CF.modal.open({ title: '⚡ 学习加速', body: '<p style="line-height:1.8">每获得 30 点学习经验（答题、实验、线下任务、情景决策、电路实验）就会得到 1 次「学习加速」，每次立即领取电网 1 小时的产出。</p>', foot: [{ text: '去学院', cls: 'primary', onClick: () => { CF.modal.close(); CF.UI.show('academy'); } }] });
    d.boosts--; const r = C.rate(); const got = C.add(r); CF.Save.save(); CF.Audio.sfx('unlock'); CF.toast(`学习加速：领取 1 小时电网产出（晶片 +${got.chip}）`, 'gold'); C.renderTop();
  };

  // ================= 元件与求解器 =================
  const PARTS = {
    wire: { name: '导线', ic: '—' },
    battery: { name: '电池', ic: '⊣⊢', vals: [1.5, 3, 4.5, 6, 9], unit: 'V', polar: true },
    bulb: { name: '小灯泡', ic: '⊗', R: 10 },
    resistor: { name: '电阻', ic: '▭', vals: [10, 20, 50, 100, 200, 330, 500, 1000, 2000], unit: 'Ω' },
    switch: { name: '开关', ic: '⌐' },
    ammeter: { name: '电流表', ic: 'Ⓐ', R: 0.01 },
    voltmeter: { name: '电压表', ic: 'Ⓥ' },
    led: { name: '发光二极管', ic: '▷|', polar: true, Vf: 2, rd: 10, Imax: 0.02 },
    cap: { name: '电容', ic: '||', vals: [0.0005, 0.001, 0.002], unit: 'F' },
    // ---- v7 新元件（具身智能 / 航空航天模块） ----
    motor: { name: '电机', ic: 'Ⓜ', R: 8, Rstall: 1 },               // 正常转动时等效 8 Ω（含反电动势的简化）；堵转时只剩线圈电阻 1 Ω
    diode: { name: '二极管', ic: '▷|', polar: true, Vf: 0.7, rd: 0.5 }, // 硅二极管：正向压降约 0.7 V
    fuse: { name: '保险丝', ic: '∽', vals: [0.5, 1, 2, 10], unit: 'A', R: 0.05 },
    solar: { name: '太阳能板', ic: '☀', polar: true, vals: [0, 25, 50, 100], Isc: 0.5, Rsh: 18 }, // 诺顿等效：短路电流 × 光照，开路电压约 9 V
    ldr: { name: '光敏电阻', ic: '⊘', vals: [0, 50, 100] },          // 光照 0 / 50 / 100 %：暗 10 kΩ → 亮 200 Ω
    // ---- v8 新元件：满足具身智能 / 航空航天的常用需求 ----
    pot: { name: '电位器', ic: '⊿', vals: [0, 25, 50, 75, 100] },     // 10 kΩ 可调电阻：旋钮 % → 阻值
    ntc: { name: '热敏电阻', ic: 't°', vals: [0, 25, 60, 100] },      // NTC 10 kΩ@25 ℃，B = 3950；温度越高电阻越小
    buzzer: { name: '蜂鸣器', ic: '♪', R: 40 },                        // 电流超过 20 mA 就响
    zener: { name: '稳压二极管', ic: '▷|z', polar: true, Vf: 0.7, Vz: 5.1, rd: 2 }, // 反向击穿电压 5.1 V
    coil: { name: '继电器线圈', ic: '⌇', R: 60, ch: true },            // 线圈电流 > 40 mA 时，同一通道的触点吸合
    contact: { name: '继电器触点', ic: '⌐◦', ch: true },
    mosfet: { name: 'MOSFET 开关', ic: 'Q', ch: true },                // 同一通道的单片机输出高电平时导通（0.05 Ω）
    mcu: { name: '单片机', ic: '▦', R: 150, ch: true, vals: ['on', 'blink', 'dark', 'hot'] }, // 两端电压 > 3 V 才运行「小程序」
  };
  const PROG = { on: '常开', blink: '闪烁 1 Hz', dark: '天黑就开', hot: '过热就关' };
  const potR = (v) => Math.max(10, 10000 * (v ?? 50) / 100);
  const ntcR = (T) => 10000 * Math.exp(3950 * (1 / ((T ?? 25) + 273.15) - 1 / 298.15));
  // 单片机的「小程序」：按通道输出高 / 低电平（读取同一通道的光敏 / 热敏电阻）
  const mcuOut = (parts, p, t) => { if (!p.pwr) return false; const ch = p.ch || 'A', same = (ty) => parts.filter((q) => q.type === ty && (q.ch || 'A') === ch);
    switch (p.val) { case 'blink': return Math.floor(t * 2) % 2 === 0; case 'dark': return same('ldr').some((q) => (q.val ?? 100) < 50); case 'hot': return !same('ntc').some((q) => (q.val ?? 25) >= 60); default: return true; } };
  const ldrR = (light) => 200 + 9800 * (1 - light / 100);
  const DEF = { resistor: 100, battery: 6, cap: 0.001, fuse: 1, solar: 100, ldr: 100, pot: 50, ntc: 25, mcu: 'on' };
  const DIODES = { led: PARTS.led, diode: PARTS.diode };
  const node = (c, r) => r * COLS + c;
  const ends = (e) => { const [k, c, r] = e.split(','); const ci = +c, ri = +r; return k === 'h' ? [node(ci, ri), node(ci + 1, ri)] : [node(ci, ri), node(ci, ri + 1)]; };
  // 解线性方程组（高斯消元，部分主元）
  function gauss(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      const d = A[i][i] || 1e-12;
      for (let k = i + 1; k < n; k++) { const f = A[k][i] / d; if (!f) continue; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / (A[i][i] || 1e-12); }
    return x;
  }
  // 节点电压法：所有元件都化成「电导 + 电流源」（电池 = 诺顿等效，电容 = 后向欧拉伴随模型，二极管 = 分段线性）
  function solve(parts, dt = 0.02) {
    const N = COLS * ROWS, bat = parts.find((p) => p.type === 'battery');
    const ref = bat ? ends(bat.e)[bat.flip ? 0 : 1] : 0; // 电池负极接地
    parts.forEach((p) => { if (DIODES[p.type] && p.dOn === undefined) p.dOn = false; if (p.type === 'zener' && p.zs === undefined) p.zs = 0; ['coil', 'contact', 'mosfet', 'mcu'].includes(p.type) && !p.ch && (p.ch = 'A'); });
    // 控制层：继电器触点看同通道线圈的电流（上一轮），MOSFET 看同通道单片机的输出（上一轮）
    const ctrl = () => { for (const p of parts) { if (p.type === 'contact') p.closed = parts.some((q) => q.type === 'coil' && q.ch === p.ch && Math.abs(q.I || 0) > 0.04); if (p.type === 'mosfet') p.closed = parts.some((q) => q.type === 'mcu' && q.ch === p.ch && mcuOut(parts, q, simT)); } };
    ctrl();
    let v = null;
    for (let it = 0; it < 14; it++) {
      const G = Array.from({ length: N }, () => new Float64Array(N)), I = new Float64Array(N);
      const g2 = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };
      for (const p of parts) {
        const [a, b] = ends(p.e), pos = p.flip ? b : a, neg = p.flip ? a : b;
        switch (p.type) {
          case 'wire': g2(a, b, GW); break;
          case 'resistor': g2(a, b, 1 / (p.fault ? 0.1 : p.val)); break;
          case 'bulb': g2(a, b, 1 / (p.fault ? 0.1 : PARTS.bulb.R)); break;
          case 'ammeter': g2(a, b, 1 / PARTS.ammeter.R); break;
          case 'voltmeter': g2(a, b, 1e-7); break;
          case 'switch': g2(a, b, p.on ? GW : 1e-9); break;
          case 'battery': { const g = 1 / 0.05; g2(pos, neg, g); I[pos] += p.val * g; I[neg] -= p.val * g; break; }
          case 'led': case 'diode': { const D = DIODES[p.type]; if (p.burnt) { g2(a, b, 1e-9); break; } if (p.dOn) { const g = 1 / D.rd; g2(pos, neg, g); I[pos] += D.Vf * g; I[neg] -= D.Vf * g; } else g2(pos, neg, 1e-9); break; }
          case 'motor': g2(a, b, 1 / (p.stall ? PARTS.motor.Rstall : PARTS.motor.R)); break;
          case 'pot': g2(a, b, 1 / potR(p.val)); break;
          case 'ntc': g2(a, b, 1 / ntcR(p.val)); break;
          case 'buzzer': g2(a, b, 1 / PARTS.buzzer.R); break;
          case 'coil': g2(a, b, 1 / PARTS.coil.R); break;
          case 'mcu': g2(a, b, 1 / PARTS.mcu.R); break;
          case 'contact': case 'mosfet': g2(a, b, p.closed ? 1 / 0.05 : 1e-9); break;
          case 'zener': { const Z = PARTS.zener, g = 1 / Z.rd; if (p.zs === 1) { g2(pos, neg, g); I[pos] += Z.Vf * g; I[neg] -= Z.Vf * g; } else if (p.zs === -1) { g2(neg, pos, g); I[neg] += Z.Vz * g; I[pos] -= Z.Vz * g; } else g2(pos, neg, 1e-9); break; }
          case 'fuse': g2(a, b, p.blown ? 1e-9 : 1 / PARTS.fuse.R); break;
          case 'ldr': g2(a, b, 1 / ldrR(p.val ?? 100)); break;
          case 'solar': { const isc = PARTS.solar.Isc * ((p.val ?? 100) / 100); g2(pos, neg, 1 / PARTS.solar.Rsh); I[pos] += isc; I[neg] -= isc; break; }
          case 'cap': { const g = p.val / dt, vp = p.vc || 0; g2(a, b, g); I[a] += g * vp; I[b] -= g * vp; break; }
        }
      }
      for (let i = 0; i < N; i++) G[i][i] += 1e-9;
      G[ref].fill(0); G[ref][ref] = 1; I[ref] = 0;
      v = gauss(G, I);
      // 二极管状态迭代
      let changed = false;
      for (const p of parts) if (DIODES[p.type] && !p.burnt) { const D = DIODES[p.type], [a, b] = ends(p.e), vd = p.flip ? v[b] - v[a] : v[a] - v[b]; const want = p.dOn ? (vd - D.Vf) / D.rd > 0 : vd > D.Vf; if (want !== p.dOn) { p.dOn = want; changed = true; } }
      // 保险丝：电流超过额定值就熔断（每次只熔断电流最大的一根，再重新求解，避免「一起烧」的假象）
      for (const p of parts) if (p.type === 'zener') { const Z = PARTS.zener, [a, b] = ends(p.e), vd = p.flip ? v[b] - v[a] : v[a] - v[b]; const want = vd > Z.Vf ? 1 : -vd > Z.Vz ? -1 : (p.zs === 1 && vd > Z.Vf - 0.05) ? 1 : (p.zs === -1 && -vd > Z.Vz - 0.05) ? -1 : 0; if (want !== p.zs) { p.zs = want; changed = true; } }
      // 控制层迭代：算出线圈电流、单片机是否上电，再更新触点 / MOSFET
      if (!changed && parts.some((p) => p.type === 'contact' || p.type === 'mosfet' || p.type === 'mcu')) {
        for (const p of parts) { const [a, b] = ends(p.e); if (p.type === 'coil') p.I = (v[a] - v[b]) / PARTS.coil.R; if (p.type === 'mcu') p.pwr = Math.abs(v[a] - v[b]) > 3; }
        const before = parts.map((p) => p.closed).join(); ctrl(); if (parts.map((p) => p.closed).join() !== before) changed = true;
      }
      if (!changed) { let worst = null, wr = 1; for (const p of parts) if (p.type === 'fuse' && !p.blown) { const [a, b] = ends(p.e), r = Math.abs((v[a] - v[b]) / PARTS.fuse.R) / p.val; if (r > wr) { wr = r; worst = p; } } if (worst) { worst.blown = true; changed = true; } }
      if (!changed) break;
    }
    // 每个元件的电流（a → b 为正）与两端电压
    let short = false;
    for (const p of parts) {
      const [a, b] = ends(p.e), vab = v[a] - v[b];
      p.V = vab;
      switch (p.type) {
        case 'wire': p.I = vab * GW; break;
        case 'resistor': p.I = vab / (p.fault ? 0.1 : p.val); break;
        case 'bulb': p.I = vab / (p.fault ? 0.1 : PARTS.bulb.R); break;
        case 'ammeter': p.I = vab / PARTS.ammeter.R; break;
        case 'voltmeter': p.I = vab * 1e-7; break;
        case 'switch': p.I = vab * (p.on ? GW : 1e-9); break;
        case 'battery': { const vt = p.flip ? -vab : vab; p.I = (p.val - vt) / 0.05; if (p.I > 8) short = true; break; }
        case 'led': { const vd = p.flip ? -vab : vab; p.I = p.dOn && !p.burnt ? (vd - PARTS.led.Vf) / PARTS.led.rd : 0; break; }
        case 'diode': { const vd = p.flip ? -vab : vab; p.I = (p.dOn ? (vd - PARTS.diode.Vf) / PARTS.diode.rd : 0) * (p.flip ? -1 : 1); break; }
        case 'motor': p.I = vab / (p.stall ? PARTS.motor.Rstall : PARTS.motor.R); break;
        case 'pot': p.I = vab / potR(p.val); break;
        case 'ntc': p.I = vab / ntcR(p.val); break;
        case 'buzzer': p.I = vab / PARTS.buzzer.R; break;
        case 'coil': p.I = vab / PARTS.coil.R; break;
        case 'mcu': p.I = vab / PARTS.mcu.R; p.pwr = Math.abs(vab) > 3; p.out = mcuOut(parts, p, simT); break;
        case 'contact': case 'mosfet': p.I = p.closed ? vab / 0.05 : 0; break;
        case 'zener': { const Z = PARTS.zener, vd = p.flip ? -vab : vab; p.I = (p.zs === 1 ? (vd - Z.Vf) / Z.rd : p.zs === -1 ? (vd + Z.Vz) / Z.rd : 0) * (p.flip ? -1 : 1); break; }
        case 'fuse': p.I = p.blown ? 0 : vab / PARTS.fuse.R; break;
        case 'ldr': p.I = vab / ldrR(p.val ?? 100); break;
        case 'solar': { const vt = p.flip ? -vab : vab; p.I = PARTS.solar.Isc * ((p.val ?? 100) / 100) - vt / PARTS.solar.Rsh; break; }
        case 'cap': { const g = p.val / dt; p.I = g * (vab - (p.vc || 0)); p.vcNext = vab; break; }
      }
    }
    return { v, short };
  }
  C.solve = solve; C.PARTS = PARTS;
  // 在指定大小的电路板上求解（解析电路、测试用）
  C.withGrid = (c, r, fn) => { const a0 = COLS, b0 = ROWS; COLS = c; ROWS = r; try { return fn(); } finally { COLS = a0; ROWS = b0; } };

  // ================= 实验 =================
  const V = (e, type, o = {}) => Object.assign({ e, type, fixed: true }, o);
  const W = (e) => V(e, 'wire');
  const spin = (p) => p && p.type === 'motor' && Math.abs(p.I) > 0.3;
  const working = (p) => p && (p.type === 'motor' ? Math.abs(p.I) > 0.3 : p.type === 'bulb' ? Math.abs(p.I) > 0.08 : Math.abs(p.I) > 0.05);
  const byLabel = (P, l) => P.find((p) => p.label === l);
  const hs = (from, to, r) => { const o = []; for (let c = from; c <= to; c++) o.push(`h,${c},${r}`); return o; };
  // 枚举所有开关组合（最多 4 个开关 = 16 种），用于 H 桥之类「找出正确组合」的判定
  const combos = (P, T, test) => { const n = P.filter((p) => p.type === 'switch').length, out = []; for (let m = 0; m < 1 << n; m++) out.push(T((ps) => ps.filter((p) => p.type === 'switch').forEach((sw, i) => (sw.on = !!(m & (1 << i)))), test)); return out; };
  // ---------- v7 模块一：具身智能（机器人的电机、传感器、驱动） 9 × 6 电路板 ----------
  const EMB = [
    { id: 'e1', mod: 'emb', cols: 9, rows: 6, lv: '高中', title: '让电机转起来', goal: '用导线和开关把电池和电机连成回路：开关闭合电机转，断开电机停。', fixed: [V('v,1,2', 'battery', { val: 6 }), V('v,6,2', 'motor')], pal: { wire: 14, switch: 1 },
      know: '电动机把电能转化为机械能：通电线圈在磁场中受力转动（左手定则）。开关串联在回路里控制通断。', bridge: '电机可以看成「电阻 + 反电动势」：转得越快，反电动势 E 越大，电流 I = (U − E) / R 越小。机器人关节里的电机就是靠控制电压和电流来控制转速和力矩的。',
      hint: '和「开关控制」那一关一样：电池上端沿第 3 排接线点走到电机上端，开关串在中间；电机下端沿第 4 排回到电池下端。', check: (P, T) => T((ps) => ps.filter((p) => p.type === 'switch').forEach((x) => (x.on = true)), (Q) => Q.some(spin)) && T((ps) => ps.filter((p) => p.type === 'switch').forEach((x) => (x.on = false)), (Q) => !Q.some(spin)) },
    { id: 'e2', mod: 'emb', cols: 9, rows: 6, lv: '高中', title: '电池串联：更有力', goal: '一节 3 V 电池推不动关节电机。用两节电池串联，让电机电流达到 0.6 A 以上。', fixed: [V('v,7,2', 'motor')], pal: { wire: 16, battery: 2 }, defs: { battery: 3 },
      know: '电池串联时，总电压等于各节电压之和：U = U₁ + U₂。电压越高，电机电流越大、转得越有力。', bridge: '电机功率 P = U · I。机器人的电池包就是很多节锂电池先串联提高电压（例如 6 节 × 3.7 V ≈ 22 V），再并联提高容量。',
      hint: '两节电池上下叠着竖放（都是长片朝上），上面那节的负极接下面那节的正极。再把最上端和最下端分别连到电机两端。', check: (P) => P.some((p) => p.type === 'motor' && Math.abs(p.I) >= 0.6) },
    { id: 'e3', mod: 'emb', cols: 9, rows: 6, lv: '高中', title: '左右轮：电机并联', goal: '左轮、右轮两个电机并联在同一节电池上都转起来，并用电流表测干路电流。', fixed: [V('v,1,2', 'battery', { val: 6 }), V('v,5,2', 'motor', { label: '左轮' }), V('v,7,2', 'motor', { label: '右轮' })], pal: { wire: 16, ammeter: 1 },
      know: '并联电路各支路电压相等；干路电流等于各支路电流之和：I = I₁ + I₂。', bridge: '两个电机同时启动时电流叠加，电池必须能提供足够的「峰值电流」——这就是为什么机器人电池除了容量（mAh），还要看放电倍率（C 数）。',
      hint: '电池上端经过电流表接到第 3 排，第 3 排连到两个电机的上端；两个电机的下端都连到第 4 排，再回到电池下端。',
      check: (P) => { const L = byLabel(P, '左轮'), R = byLabel(P, '右轮'), A = P.find((p) => p.type === 'ammeter'); return spin(L) && spin(R) && A && Math.abs(Math.abs(A.I) - Math.abs(L.I) - Math.abs(R.I)) < 0.01; } },
    { id: 'e4', mod: 'emb', cols: 9, rows: 6, lv: '衔接', title: '巡线机器人的光敏传感器', goal: '用光敏电阻和一个电阻做分压，电压表接在光敏电阻两端：亮的时候读数低于 1.5 V，暗的时候高于 4 V。', fixed: [V('v,1,2', 'battery', { val: 6 })], pal: { wire: 12, resistor: 1, ldr: 1, voltmeter: 1 },
      know: '光敏电阻的阻值随光照变化：光越强电阻越小（这里：亮 200 Ω，暗 10 kΩ）。串联分压：U光 = U · R光 / (R + R光)。', bridge: '这就是巡线小车、自动路灯的传感器：把「光的强弱」变成「电压的高低」，再交给单片机的 ADC（模数转换器）读成数字。电阻要选在亮暗两个阻值之间，输出的变化才明显。',
      hint: '电阻在上、光敏电阻在下串在电池两端，电压表并在光敏电阻两边。点电阻换值：100 Ω 太小（亮的时候也有 4 V），试试 1 kΩ。点光敏电阻可以改光照，看看读数怎么变。',
      check: (P, T) => { const setL = (l) => (ps) => ps.forEach((p) => p.type === 'ldr' && (p.val = l)); const vm = (Q) => { const m = Q.find((p) => p.type === 'voltmeter'); return m ? Math.abs(m.V) : -1; }; return P.some((p) => p.type === 'ldr') && T(setL(100), (Q) => vm(Q) >= 0 && vm(Q) < 1.5) && T(setL(0), (Q) => vm(Q) > 4); } },
    { id: 'e5', mod: 'emb', cols: 9, rows: 6, lv: '衔接', title: 'H 桥：电机正反转', goal: '用四个开关搭一个 H 桥：一组开关闭合电机正转，另一组闭合电机反转。', fixed: [V('v,1,1', 'battery', { val: 6 }), V('h,4,2', 'motor')], pal: { wire: 18, switch: 4 },
      know: '电流方向改变，电机受力方向也改变（左手定则），所以电机反转。', bridge: 'H 桥是机器人驱动电机最基本的电路：四个开关（真实电路里是 MOSFET 晶体管）对角两两导通。注意：同一侧上下两个开关同时闭合会把电源直接短路（「直通」），电机驱动芯片里专门设计了「死区时间」防止这种情况。',
      hint: '电池上端接出第 2 排作「正极轨」，下端经第 4 排作「负极轨」。电机两端各竖着接两个开关：一个通正极轨、一个通负极轨——四个开关和电机正好组成字母 H。',
      check: (P, T) => { const m = (Q) => Q.find((p) => p.type === 'motor').I; const r = combos(P, T, (Q) => m(Q)); return r.some((i) => i > 0.3) && r.some((i) => i < -0.3); } },
    { id: 'e6', mod: 'emb', cols: 9, rows: 6, lv: '大学', title: '堵转保护：选对保险丝', goal: '给电机串一个保险丝：正常转动时不熔断，电机被卡住（堵转）时熔断。', fixed: [V('v,1,2', 'battery', { val: 6 }), V('v,6,2', 'motor')], pal: { wire: 14, fuse: 1 }, defs: { fuse: 0.5 },
      know: '保险丝串联在电路里，电流超过额定值就熔断，保护电路和设备。', bridge: '电机堵转时不再转动，反电动势 E = 0，电流 I = U / R线圈 一下子涨到正常时的好几倍，线圈会发热烧毁。保险丝的额定电流要选在「正常电流」和「堵转电流」之间。点电机可以「模拟堵转」看看电流有多大。',
      hint: '先接好回路，看电流表或读数里电机的正常电流（约 0.74 A）；堵转时电机只剩约 1 Ω，电流约 5 A。保险丝点一下可以换额定值，熔断后点「换新保险丝」。',
      check: (P, T) => P.some((p) => p.type === 'fuse') && T((ps) => ps.forEach((p) => { if (p.type === 'fuse') p.blown = false; if (p.type === 'motor') p.stall = false; }), (Q) => Q.every((p) => p.type !== 'fuse' || !p.blown) && Q.some(spin)) && T((ps) => ps.forEach((p) => { if (p.type === 'fuse') p.blown = false; if (p.type === 'motor') p.stall = true; }), (Q) => Q.some((p) => p.type === 'fuse' && p.blown)) },
    { id: 'e7', mod: 'emb', cols: 9, rows: 6, lv: '衔接', title: '继电器：小电流控制大电机', goal: '用 4.5 V 控制电源、开关和继电器线圈做一个「控制回路」，用继电器触点去开关 9 V 动力电源上的电机：开关闭合电机转，断开电机停。', fixed: [V('v,1,1', 'battery', { val: 4.5, label: '控制电源' }), V('v,1,3', 'battery', { val: 9, label: '动力电源' }), V('v,7,3', 'motor', { label: '关节电机' })], pal: { wire: 18, switch: 1, coil: 1, contact: 1 },
      know: '继电器是一个用电磁铁控制的开关：线圈通电产生磁性，把触点吸合。小电流的控制回路就能开关大电流的动力回路。', bridge: '机器人里「主控板」只能输出几十毫安，而关节电机要几安培——中间必须有继电器或功率晶体管做「放大」。线圈和触点之间没有导线相连，叫电气隔离。点线圈 / 触点可以换通道（A / B / C），同一通道的线圈控制同一通道的触点。',
      hint: '上面一圈：控制电源 → 开关 → 线圈 → 回控制电源。下面一圈：动力电源 → 继电器触点 → 电机 → 回动力电源。两圈之间不用导线连。', check: (P, T) => { const m = (Q) => byLabel(Q, '关节电机'); return P.some((p) => p.type === 'coil') && P.some((p) => p.type === 'contact') && T((ps) => ps.forEach((p) => p.type === 'switch' && (p.on = true)), (Q) => spin(m(Q)) && Q.filter((p) => p.type === 'coil').every((c) => Math.abs(c.I) < 0.2)) && T((ps) => ps.forEach((p) => p.type === 'switch' && (p.on = false)), (Q) => !spin(m(Q))); } },
    { id: 'e8', mod: 'emb', cols: 9, rows: 6, lv: '大学', title: '天黑自动开灯：单片机小程序', goal: '给单片机供电，选好它的小程序，让它通过 MOSFET 控制路灯：光敏传感器读到「亮」时灯灭，读到「暗」时灯亮。', fixed: [V('v,1,2', 'battery', { val: 6 }), V('v,7,2', 'bulb', { label: '路灯' }), V('h,4,5', 'ldr', { val: 100, label: '光敏传感器', ch: 'A' })], pal: { wire: 18, mcu: 1, mosfet: 1 },
      know: '传感器负责「感觉」，单片机负责「判断」，MOSFET 负责「动手」——这就是所有智能设备的基本结构：感知 → 决策 → 执行。', bridge: '单片机的程序就是一句「如果……就……」：如果光照 < 50%，就把通道 A 置为高电平。MOSFET 是电压控制的开关，栅极一点点电流就能控制很大的漏极电流。机器人的每个关节、每个传感器都是这样一圈一圈接起来的。',
      hint: '单片机并联在电池两端供电；路灯和 MOSFET 串成一条支路，也接在电池两端。点单片机「换程序」，选「天黑就开」；它和 MOSFET、光敏传感器都要在同一个通道（A）。点光敏传感器改光照试试。',
      check: (P, T) => { const setL = (l) => (ps) => ps.forEach((p) => p.type === 'ldr' && (p.val = l)); const lamp = (Q) => working(byLabel(Q, '路灯')); return P.some((p) => p.type === 'mcu') && P.some((p) => p.type === 'mosfet') && T(setL(100), (Q) => !lamp(Q)) && T(setL(0), (Q) => lamp(Q)); } },
  ];
  // ---------- v7 模块二：航空航天（卫星电源与配电） 11 × 7 电路板 ----------
  const GND5 = ['v,1,2', 'v,1,3', 'v,1,4', 'v,3,2', 'v,3,3', 'v,3,4', 'v,8,4'].concat(hs(1, 7, 5)).map(W);
  const BUS = hs(1, 7, 2).map(W).concat(['v,1,3'].concat(hs(1, 7, 4)).map(W));
  const AERO = [
    { id: 'a1', mod: 'aero', cols: 11, rows: 7, lv: '高中', title: '太阳能板点亮信标灯', goal: '用导线把太阳能板和信标灯连成回路，让灯亮起来。', fixed: [V('v,1,2', 'solar', { val: 100 }), V('v,8,2', 'bulb', { label: '信标灯' })], pal: { wire: 18 },
      know: '太阳能电池把光能直接转化为电能；光照越强，产生的电流越大。', bridge: '光伏电池更像一个「电流源」：短路电流和光照强度成正比。卫星的太阳翼由成千上万片光伏电池串并联而成，国际空间站的太阳翼总发电功率在 100 千瓦量级。',
      hint: '太阳能板上端（正极）沿第 3 排连到灯的上端，下端沿第 4 排回来。连好后点太阳能板改光照，看灯怎么变化。', check: (P) => P.some((p) => p.type === 'bulb' && Math.abs(p.I) > 0.08),
      quiz: { q: '把光照从 100% 调到 25%，灯泡电流大约变成原来的多少？（提示：电流源）', opts: ['约 1/4', '约 1/2', '几乎不变'], a: 0 } },
    { id: 'a2', mod: 'aero', cols: 11, rows: 7, lv: '高中', title: '卫星配电母线', goal: '从电池接出一条主母线，给信标灯、动量轮、加热器三路并联供电，每一路各有一个开关，可以单独关掉。', fixed: [V('v,1,2', 'battery', { val: 9 }), V('v,4,3', 'bulb', { label: '信标灯' }), V('v,6,3', 'motor', { label: '动量轮' }), V('v,8,3', 'resistor', { val: 100, label: '加热器' })], pal: { wire: 24, switch: 3 },
      know: '并联电路各支路互不影响，每条支路可以单独控制。', bridge: '航天器的「配电单元」把一条主电源母线分给各个设备，每一路都有独立的开关（真实卫星里是继电器或固态功率控制器），哪个设备出故障就单独切掉哪一路。',
      hint: '第 3 排做正极母线（接电池上端），第 5 排做负极母线（接电池下端）。三个设备上端各竖着接一个开关到正极母线，下端接到负极母线。',
      check: (P, T) => { const L = ['信标灯', '动量轮', '加热器'], S = P.filter((p) => p.type === 'switch'); if (S.length !== 3) return false; const st = (Q) => L.map((l) => working(byLabel(Q, l))); const all = T((ps) => ps.forEach((p) => p.type === 'switch' && (p.on = true)), (Q) => st(Q).every(Boolean)); const solo = [0, 1, 2].every((k) => T((ps) => { let i = 0; ps.forEach((p) => { if (p.type === 'switch') p.on = i++ !== k; }); }, (Q) => st(Q).filter(Boolean).length === 2)); return all && solo; } },
    { id: 'a3', mod: 'aero', cols: 11, rows: 7, lv: '衔接', title: '防反充二极管', goal: '让太阳能板给蓄电池充电：有光时蓄电池被充电；进入地球阴影（光照 0）时，蓄电池不能反过来向太阳能板放电，负载照常工作。', fixed: [V('v,1,2', 'solar', { val: 100 }), V('v,7,2', 'battery', { val: 6, label: '蓄电池' }), V('v,9,2', 'resistor', { val: 100, label: '负载' })], pal: { wire: 20, diode: 1 },
      know: '二极管只允许电流单向通过：正向导通（约 0.7 V 压降），反向截止。', bridge: '卫星每绕地球一圈都要进出地球阴影。没有隔离时，阴影里的蓄电池会反过来向太阳翼放电；真实卫星的电源控制器用二极管（或「理想二极管」电路）把太阳翼和蓄电池隔开。',
      hint: '太阳能板正极 → 二极管（三角形尖朝向蓄电池）→ 蓄电池正极和负载上端；三者的下端连在一起。连好后点太阳能板把光照调到 0 试试。',
      check: (P, T) => { const setL = (l) => (ps) => ps.forEach((p) => p.type === 'solar' && (p.val = l)); const bat = (Q) => byLabel(Q, '蓄电池'), sol = (Q) => Q.find((p) => p.type === 'solar'); return P.some((p) => p.type === 'diode') && T(setL(100), (Q) => bat(Q).I < -0.01) && T(setL(0), (Q) => Math.abs(sol(Q).I) < 0.001 && working(byLabel(Q, '负载'))); } },
    { id: 'a4', mod: 'aero', cols: 11, rows: 7, lv: '衔接', title: '冗余供电：二极管「或门」', goal: '用两个二极管让 A、B 两路电源一起给关键载荷供电：任何一路电压掉下来（故障），另一路照常供电，而且不会反灌进坏掉的那一路。', fixed: [V('v,1,1', 'battery', { val: 6, label: '电源 A' }), V('v,3,1', 'battery', { val: 6, label: '电源 B' }), V('v,8,3', 'bulb', { label: '关键载荷' })].concat(GND5), pal: { wire: 16, diode: 2 },
      know: '两个二极管把两路电源「或」在一起：哪一路电压高，哪一路供电；另一路的二极管自动截止。', bridge: '航天器讲究「单点故障不致命」：关键设备至少有两路供电。二极管或门（OR-ing）保证一路电源坏了、电压掉下来时，好的那一路不会反灌进坏的那一路。',
      hint: '负极已经接好（最下面一排）。A、B 的正极各串一个二极管（尖朝外），汇到第 1 排的正极母线，再沿右边竖着接到关键载荷的上端。',
      check: (P, T) => { const A = (Q) => byLabel(Q, '电源 A'), B = (Q) => byLabel(Q, '电源 B'), L = (Q) => working(byLabel(Q, '关键载荷')); const fail = (lab) => (ps) => ps.forEach((p) => p.label === lab && (p.val = 1.5)); return P.filter((p) => p.type === 'diode').length === 2 && T(() => {}, L) && T(fail('电源 A'), (Q) => L(Q) && Math.abs(A(Q).I) < 0.001) && T(fail('电源 B'), (Q) => L(Q) && Math.abs(B(Q).I) < 0.001); } },
    { id: 'a5', mod: 'aero', cols: 11, rows: 7, lv: '大学', title: '分区保护：保险丝的选择性', goal: '在三条支路里各放一个保险丝：正常时都不熔断；哪一路出故障（短路或卡死），就只熔断哪一路，其余设备照常工作。', fixed: [V('v,1,2', 'battery', { val: 9 }), V('v,4,3', 'resistor', { val: 20, label: '加热器' }), V('v,6,3', 'bulb', { label: '信标灯' }), V('v,8,3', 'motor', { label: '动量轮' })].concat(BUS), pal: { fuse: 3, wire: 2 }, defs: { fuse: 0.5 }, slots: ['v,4,2', 'v,6,2', 'v,8,2'],
      know: '保险丝要串在它保护的那一路里；额定电流要大于这一路的正常电流。', bridge: '「选择性保护」：哪一路出故障就只断开哪一路，其余设备照常工作。飞机和航天器的配电系统按「设备 → 支路 → 主母线」一级级设置保护。动量轮卡死时电流约 8 A——10 A 的保险丝根本不会断。',
      hint: '三个橙色框是保险丝的位置。先算每一路的正常电流：加热器 9 V / 20 Ω、信标灯 9 V / 10 Ω、动量轮 9 V / 8 Ω；额定值要比它大一点，又不能大到故障时也不断。',
      check: (P, T) => { const L = ['加热器', '信标灯', '动量轮']; if (P.filter((p) => p.type === 'fuse').length !== 3) return false; const reset = (ps) => ps.forEach((p) => { if (p.type === 'fuse') p.blown = false; p.fault = false; p.stall = false; }); const ok = (Q) => L.map((l) => working(byLabel(Q, l))); if (!T(reset, (Q) => ok(Q).every(Boolean))) return false; return L.every((l, k) => T((ps) => { reset(ps); const d = ps.find((p) => p.label === l); if (d.type === 'motor') d.stall = true; else d.fault = true; }, (Q) => { const o = ok(Q); return !o[k] && o.filter(Boolean).length === 2; })); } },
    { id: 'a6', mod: 'aero', cols: 11, rows: 7, lv: '衔接', title: '稳压管保护传感器接口', goal: '9 V 母线给一个只能承受 5 V 左右的传感器接口供电：用一个电阻和一个稳压二极管，把接口电压稳在 4.8–5.4 V。', fixed: [V('v,1,2', 'battery', { val: 9, label: '母线' }), V('v,6,2', 'voltmeter', { label: '传感器接口' })], pal: { wire: 14, resistor: 1, zener: 1 }, defs: { resistor: 330 },
      know: '稳压二极管反着接（尖朝上、横杠在上面）时，两端电压超过 5.1 V 就会「击穿」导电，把电压稳住；多出来的电压由串联的电阻承担。', bridge: '卫星上一条母线要给很多不同电压的设备供电，最简单的稳压就是「限流电阻 + 稳压管」：R = (U − Uz) / I = (9 − 5.1) / 0.012 ≈ 330 Ω。电流大的场合要换成稳压芯片（LDO）或 DC-DC 变换器。',
      hint: '母线正极 → 电阻 → 稳压管上端；稳压管下端回到母线负极。稳压管要反着放（点它「翻转极性」），传感器接口并在稳压管两端。', check: (P) => { const vm = byLabel(P, '传感器接口'), v = vm ? Math.abs(vm.V) : 0; return P.some((p) => p.type === 'zener') && v >= 4.8 && v <= 5.4; } },
  ];
  const isLit = (p) => p.type === 'bulb' && Math.abs(p.I) > 0.08;
  const series = (ps) => ps.length > 1 && ps.every((p) => Math.abs(Math.abs(p.I) - Math.abs(ps[0].I)) < 0.002 && Math.abs(p.I) > 0.01);
  const RAILS = ['h,0,1', 'h,0,3', 'v,0,2', 'h,1,1', 'h,2,1', 'h,3,1', 'h,1,3', 'h,2,3', 'h,3,3'];
  const LABS = [
    { id: 'k1', lv: '高中', title: '点亮第一盏灯', goal: '用导线把电池和小灯泡连成闭合回路，让灯泡亮起来。', fixed: [V('v,1,1', 'battery', { val: 3 }), V('v,5,1', 'bulb')], pal: { wire: 10 },
      know: '电流只有在闭合回路中才能持续流动；电源提供电压，用电器消耗电能。', bridge: '电流 I = dq/dt：单位时间通过导体横截面的电荷量。「闭合回路」就是给电荷一条从电源正极出发、回到负极的路径。',
      hint: '电池长的那片是正极。从电池上端出发，沿上面一排接线点连到灯泡上端，再从灯泡下端沿下面一排回到电池下端。', check: (P) => P.some(isLit) },
    { id: 'k2', lv: '高中', title: '开关控制', goal: '在回路里接一个开关：开关断开灯灭，闭合灯亮。', fixed: [V('v,1,1', 'battery', { val: 3 }), V('v,5,1', 'bulb')], pal: { wire: 10, switch: 1 },
      know: '开关串联在电路中，控制整条回路的通断。', bridge: '开关断开时电阻近似无穷大，回路电流为零——这就是数字电路里「0 / 1」的物理基础。',
      hint: '把开关当作一段导线串进回路里；点开关可以切换断开 / 闭合。', check: (P, T) => T((ps) => ps.filter((p) => p.type === 'switch').forEach((s) => (s.on = true)), (Q) => Q.some(isLit)) && T((ps) => ps.filter((p) => p.type === 'switch').forEach((s) => (s.on = false)), (Q) => !Q.some(isLit)) },
    { id: 'k3', lv: '高中', title: '串联：电流处处相等', goal: '把两个小灯泡和一个电流表串联起来，让两个灯都亮。', fixed: [V('v,1,1', 'battery', { val: 6 })], pal: { wire: 10, bulb: 2, ammeter: 1 },
      know: '串联电路电流处处相等；总电压等于各部分电压之和：U = U₁ + U₂。两个灯分电压，所以每个都比单独接时暗。', bridge: '这就是基尔霍夫电压定律（KVL）：沿任意闭合回路，各段电压的代数和为零，ΣU = 0。',
      hint: '电池 → 灯泡 → 灯泡 → 电流表 → 回到电池，排成一个圈。', check: (P) => { const b = P.filter((p) => p.type === 'bulb'), a = P.filter((p) => p.type === 'ammeter'); return b.length === 2 && b.every(isLit) && a.length === 1 && series(b.concat(a)); } },
    { id: 'k4', lv: '高中', title: '并联：互不影响', goal: '两个小灯泡并联，每条支路各有一个开关：关掉任意一个，另一个照样亮。', fixed: [V('v,1,1', 'battery', { val: 3 }), V('h,1,1', 'wire'), V('h,1,2', 'wire')], pal: { wire: 12, bulb: 2, switch: 2 },
      know: '并联电路各支路电压相等、互不影响；干路电流等于各支路电流之和。家里的电灯就是并联的。', bridge: '并联总电阻 1/R = 1/R₁ + 1/R₂，比任何一个支路的电阻都小——所以插座上同时开的电器越多，总电流越大。',
      hint: '在电池右边做出上下两条「轨道」，在轨道之间竖着接两条支路，每条支路里放一个灯泡和一个开关。',
      check: (P, T) => { const S = P.filter((p) => p.type === 'switch'), B = P.filter((p) => p.type === 'bulb'); if (S.length !== 2 || B.length !== 2) return false; const all = T((ps) => ps.forEach((p) => p.type === 'switch' && (p.on = true)), (Q) => Q.filter(isLit).length === 2); const solo = [0, 1].every((k) => T((ps) => { let i = 0; ps.forEach((p) => { if (p.type === 'switch') p.on = i++ !== k; }); }, (Q) => Q.filter(isLit).length === 1)); return all && solo; } },
    { id: 'k5', lv: '高中', title: '伏安法测电阻', goal: '用电流表测通过 Rₓ 的电流、电压表测 Rₓ 两端的电压，再算出 Rₓ。', fixed: [V('v,1,1', 'battery', { val: 3 }), V('h,3,1', 'resistor', { val: 20, hidden: true, label: 'Rₓ' })], pal: { wire: 10, ammeter: 1, voltmeter: 1 },
      know: '电流表要串联、电压表要并联；R = U / I。', bridge: '真实电表有内阻：电流表内接 / 外接会带来系统误差，大学物理实验要先估算 Rₓ 与电表内阻的大小关系再选接法。',
      hint: '先用导线和电流表把电池、Rₓ 连成回路；再把电压表跨接在 Rₓ 的两端（可以用导线把电压表引到 Rₓ 两边）。',
      check: (P) => { const R = P.find((p) => p.label === 'Rₓ'), A = P.find((p) => p.type === 'ammeter'), Vm = P.find((p) => p.type === 'voltmeter'); return A && Vm && Math.abs(R.I) > 0.02 && Math.abs(Math.abs(A.I) - Math.abs(R.I)) < 0.002 && Math.abs(Math.abs(Vm.V) - Math.abs(R.V)) < 0.05; },
      quiz: { q: '根据电表读数，Rₓ 是多少？', opts: ['10 Ω', '20 Ω', '50 Ω', '100 Ω'], a: 1 } },
    { id: 'k6', lv: '衔接', title: '分压电路', goal: '用两个电阻把 6 V 分出 2 V：电压表并在下面那个电阻两端，读数 2.0 V（±0.1 V）。', fixed: [V('v,1,1', 'battery', { val: 6 })], pal: { wire: 10, resistor: 2, voltmeter: 1 },
      know: '串联电阻按阻值比例分压：U₂ = U · R₂ / (R₁ + R₂)。', bridge: '这就是传感器电路、电位器调光调音的原理；大学电路里会把它推广成「戴维南等效电路」。',
      hint: '要分出 1/3 的电压，R₁ 应该是 R₂ 的 2 倍。点电阻可以换阻值。', check: (P) => { const Vm = P.find((p) => p.type === 'voltmeter'); return Vm && Math.abs(Math.abs(Vm.V) - 2) <= 0.1 && P.filter((p) => p.type === 'resistor' && Math.abs(p.I) > 0.001).length === 2; } },
    { id: 'k7', lv: '衔接', title: 'LED 限流电阻', goal: '给发光二极管串一个合适的电阻：让它亮，电流在 8–20 mA 之间（超过 30 mA 会烧坏）。', fixed: [V('v,1,1', 'battery', { val: 6 }), V('v,5,1', 'led')], pal: { wire: 10, resistor: 1, ammeter: 1 },
      know: '欧姆定律 I = U / R：电阻越大电流越小。', bridge: '二极管是「非线性」元件：正向电压低于约 2 V 几乎不导通，超过后电流猛增。所以要串电阻限流：R = (U − U_F) / I = (6 − 2) / 0.02 = 200 Ω。',
      hint: '先算再放：允许的最大电流 20 mA，LED 自己分走约 2 V。', check: (P) => { const L = P.find((p) => p.type === 'led'); return L && !L.burnt && L.I >= 0.008 && L.I <= 0.0205; } },
    { id: 'k8', lv: '大学', title: '基尔霍夫电流定律', goal: '用三个电流表分别测干路和两条支路的电流，验证 I = I₁ + I₂。', fixed: [V('v,0,1', 'battery', { val: 6 }), V('v,3,1', 'resistor', { val: 50 }), V('v,5,1', 'resistor', { val: 100 }), V('h,0,2', 'wire'), V('h,1,2', 'wire'), V('h,2,2', 'wire'), V('h,3,2', 'wire'), V('h,4,2', 'wire')], pal: { wire: 8, ammeter: 3 },
      know: '并联电路干路电流等于各支路电流之和。', bridge: '基尔霍夫电流定律（KCL）：流入任一节点的电流之和等于流出的电流之和，ΣI = 0——本质是电荷守恒。所有电路仿真软件（包括这个工坊）都是靠它列方程求解的。',
      hint: '电池上端经过一个电流表接到上排；两条电阻支路的上端各串一个电流表。', check: (P) => { const A = P.filter((p) => p.type === 'ammeter').map((p) => Math.abs(p.I)).sort((a, b) => b - a); return A.length === 3 && A[2] > 0.01 && Math.abs(A[0] - A[1] - A[2]) < 0.003 * A[0] + 0.0005; } },
    { id: 'k9', lv: '大学', title: '惠斯通电桥', goal: '在空着的位置放一个电阻 R₃，让中间电流表（检流计）的读数接近 0（< 0.5 mA）。', fixed: [V('v,0,1', 'battery', { val: 6 })].concat(RAILS.map((e) => V(e, 'wire'))).concat([V('v,2,1', 'resistor', { val: 100, label: 'R₁' }), V('v,2,2', 'resistor', { val: 100, label: 'R₂' }), V('v,4,2', 'resistor', { val: 200, hidden: true, label: 'Rₓ' }), V('h,2,2', 'ammeter', { label: 'G' }), V('h,3,2', 'wire')]), pal: { resistor: 1 }, slot: 'v,4,1',
      know: '电桥平衡时检流计中没有电流，两条支路中点的电势相等。', bridge: '平衡条件 R₁ / R₂ = R₃ / Rₓ，所以 Rₓ = R₃ · R₂ / R₁。不需要知道电源电压，也不怕电表不准——这是大学物理实验里最精确的测电阻方法之一。',
      hint: 'R₁ = R₂，所以 R₃ 要等于 Rₓ 才能平衡。试几个阻值，看检流计读数变小还是变大。', check: (P) => { const G = P.find((p) => p.label === 'G'), r3 = P.find((p) => p.e === 'v,4,1' && p.type === 'resistor'); return r3 && Math.abs(G.I) < 0.0005; },
      quiz: { q: '电桥平衡了。根据平衡条件，Rₓ 等于多少？', opts: ['100 Ω', '200 Ω', '50 Ω', '400 Ω'], a: 1 } },
    { id: 'k10', lv: '大学', title: 'RC 充电', goal: '闭合开关，观察电容电压随时间上升的曲线，找出时间常数 τ。', fixed: [V('v,1,1', 'battery', { val: 6 }), V('h,1,1', 'switch', { on: false, fixed: true }), V('h,2,1', 'resistor', { val: 1000 }), V('h,3,1', 'wire'), V('h,4,1', 'wire'), V('v,5,1', 'cap', { val: 0.001 }), V('h,1,2', 'wire'), V('h,2,2', 'wire'), V('h,3,2', 'wire'), V('h,4,2', 'wire')], pal: {}, rc: true,
      know: '电容可以储存电荷；充电时电压不是瞬间到达电源电压，而是越来越慢地接近。', bridge: '电容电压 u(t) = U(1 − e^(−t/RC))，τ = RC 叫时间常数：经过一个 τ，电压达到 63%；经过 5τ 基本充满。这是一阶微分方程最经典的例子。',
      hint: '点一下开关让它闭合，看右边曲线到 63%（约 3.8 V）用了多久。R = 1 kΩ，C = 1000 μF。', check: (P, T, st) => st.rcDone,
      quiz: { q: '电容电压升到 63%（约 3.8 V）大约用了多久？', opts: ['0.1 秒', '1 秒', '10 秒'], a: 1 } },
  ].concat(EMB, AERO);
  C.LABS = LABS;
  // 标准答案（v8：四次没通过时一键摆出）。写法：类型@边[=数值][+闭合][^翻转]；边的列号可以写范围（h,1-6,2）；!switch = 闭合题目给定的开关
  C.ANS = {
    k1: 'wire@h,1-4,1 wire@h,1-4,2', k2: 'wire@h,1,1 switch@h,2,1+ wire@h,3-4,1 wire@h,1-4,2', k3: 'bulb@h,1,1 bulb@h,2,1 wire@h,3,1 ammeter@v,4,1 wire@h,1-3,2',
    k4: 'switch@h,2,1+ bulb@v,3,1 wire@h,2,2 wire@v,2,0 wire@h,2-3,0 switch@v,4,0+ bulb@v,4,1 wire@h,3,2', k5: 'wire@h,1-2,1 wire@h,4,1 ammeter@v,5,1 wire@h,1-4,2 wire@v,3,0 voltmeter@h,3,0 wire@v,4,0',
    k6: 'resistor@h,1,1=20 wire@h,2,1 resistor@v,3,1=10 wire@h,1-2,2 voltmeter@v,4,1 wire@h,3,1 wire@h,3,2', k7: 'resistor@h,1,1=200 wire@h,2-4,1 wire@h,1-4,2',
    k8: 'ammeter@h,0,1 wire@h,1,1 ammeter@h,2,1 wire@v,2,0 wire@h,2-4,0 ammeter@v,5,0', k9: 'resistor@v,4,1=200', k10: '!switch',
    e1: 'switch@h,3,2+ wire@h,1-2,2 wire@h,4-5,2 wire@h,1-5,3', e2: 'battery@v,1,2=3 battery@v,1,3=3 wire@v,7,3 wire@h,1-6,2 wire@h,1-6,4', e3: 'ammeter@h,1,2 wire@h,2-6,2 wire@h,1-6,3',
    e4: 'wire@h,1-2,2 resistor@v,3,2=1000 ldr@v,3,3=100 wire@v,1,3 wire@h,1-2,4 voltmeter@v,4,3 wire@h,3,3 wire@h,3,4', e5: 'wire@v,1,2 switch@v,4,1 switch@v,4,2 switch@v,5,1 switch@v,5,2 wire@h,1-4,1 wire@h,1-4,3',
    e6: 'fuse@h,3,2=1 wire@h,1-2,2 wire@h,4-5,2 wire@h,1-5,3', e7: 'switch@h,1,1+ wire@h,2,1 coil@v,3,1 wire@h,1-2,2 wire@h,1,3 contact@h,2,3 wire@h,3-6,3 wire@h,1-6,4',
    e8: 'wire@h,1-2,2 mcu@v,3,2=dark wire@h,1-2,3 wire@h,3,2 mosfet@h,4,2 wire@h,5-6,2 wire@h,3-6,3',
    a1: 'wire@h,1-7,2 wire@h,1-7,3', a2: 'switch@v,4,2+ switch@v,6,2+ switch@v,8,2+ wire@v,1,3 wire@h,1-7,2 wire@h,1-7,4', a3: 'diode@h,1,2 wire@h,2-8,2 wire@h,1-8,3',
    a4: 'diode@h,1,1 wire@v,2,0 diode@h,3,1 wire@v,4,0 wire@v,8,0-2 wire@h,2-7,0', a5: 'fuse@v,4,2=1 fuse@v,6,2=1 fuse@v,8,2=2', a6: 'resistor@h,1,2=330 wire@h,2-4,2 zener@v,5,2^ wire@h,5,2 wire@h,5,3 wire@h,1-4,3',
  };
  // 展开答案字符串 → 元件列表（测试和「摆出答案」共用）
  C.expandAns = function (str) {
    const out = [];
    (str || '').split(' ').filter(Boolean).forEach((tok) => {
      if (tok.startsWith('!')) { out.push({ cmd: tok.slice(1) }); return; }
      const m = tok.match(/^(\w+)@([hv]),(\d+)(?:-(\d+))?,(\d+)(?:-(\d+))?(?:=([\w.]+))?(\+)?(\^)?$/); if (!m) return;
      const [, type, k, c0, c1, r0, r1, val, on, flip] = m;
      for (let c = +c0; c <= +(c1 || c0); c++) for (let r = +r0; r <= +(r1 || r0); r++) out.push({ type, e: `${k},${c},${r}`, val: val !== undefined ? (isNaN(+val) ? val : +val) : undefined, on: type === 'switch' ? !!on : undefined, flip: !!flip });
    });
    return out;
  };
  C._cur = () => cur; C._load = (i) => load(i); C._pick = () => pick; // 测试与调试用
  C._edgeXY = (e) => edgeMid(e);

  // ================= 工坊界面 =================
  let cur = null, cv, ctx, raf = 0, timer = 0, drag = null, sel = null, chart = [], simT = 0, pick = null, hov = null;
  // 镜头（v7）：固定镜头 = 整块电路板正好放进画面；自由镜头 = 可以缩放（滚轮 / 双指 / 按钮）和拖动空白处平移
  const view = { z: 1, x: 0, y: 0 };
  const camMode = () => CF.Save.data.settings.cwCam || 'fixed';
  const geo = () => { const w = cv.clientWidth, h = cv.clientHeight, s0 = Math.min((w - 70) / (COLS - 1), (h - 70) / (ROWS - 1)), z = view.z; return { s: s0 * z, ox: ((w - s0 * (COLS - 1)) / 2 - w / 2) * z + w / 2 + view.x, oy: ((h - s0 * (ROWS - 1)) / 2 - h / 2) * z + h / 2 + view.y }; };
  C.zoomAt = function (sx, sy, f) {
    if (camMode() === 'fixed') C.setCam('free', true);
    const w = cv.clientWidth / 2, h = cv.clientHeight / 2, z2 = CF.clamp(view.z * f, 0.6, 3.2), k = z2 / view.z;
    view.x = sx - w - (sx - w - view.x) * k; view.y = sy - h - (sy - h - view.y) * k; view.z = z2;
  };
  C.setCam = function (mode, auto) {
    CF.Save.data.settings.cwCam = mode; CF.Save.save();
    if (mode === 'fixed') { view.z = 1; view.x = 0; view.y = 0; }
    const b = $('#cwCamMode'); if (b) { b.textContent = mode === 'fixed' ? '固定镜头' : '自由镜头'; b.classList.toggle('on', mode === 'fixed'); }
    if (auto) CF.toast('已切到自由镜头：滚轮 / 双指缩放，拖动空白处平移；点「固定镜头」回到全图', '', 2200);
  };
  const nodeXY = (n) => { const g = geo(); return [g.ox + (n % COLS) * g.s, g.oy + Math.floor(n / COLS) * g.s]; };
  const edgeMid = (e) => { const [a, b] = ends(e).map(nodeXY); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const allEdges = () => { const out = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (c < COLS - 1) out.push(`h,${c},${r}`); if (r < ROWS - 1) out.push(`v,${c},${r}`); } return out; };
  const nearestEdge = (x, y) => { let best = null, bd = 1e9; allEdges().forEach((e) => { const [mx, my] = edgeMid(e), d = Math.hypot(mx - x, my - y); if (d < bd) { bd = d; best = e; } }); return bd < geo().s * 0.45 ? best : null; };
  const done = (id) => !!data().cw.solved[id];
  // 每个模块各自从第一关开始解锁（模块一开始就能玩，难度都从高中起步）
  const unlocked = (i) => { if (CF.P.trial() || i === 0) return true; const L = LABS[i], P = LABS[i - 1]; return (P.mod || 'base') !== (L.mod || 'base') || done(P.id); };
  const used = (type) => cur.parts.filter((p) => p.type === type && !p.fixed).length;
  const left = (type) => (cur.sandbox ? 99 : (cur.lab.pal[type] || 0) - used(type));

  C.loadLab = (L) => { load(L); if (C.renderList) C.renderList(); };
  function load(i) {
    const L = typeof i === 'object' ? i : i === 'sandbox' ? { id: 'sandbox', lv: '自由', title: '自由搭建', goal: '没有题目，随便搭。可以用全部已解锁的元件，电路照样实时计算。', fixed: [], pal: {}, know: '试试：同一个电池，接一个灯泡和接两个并联的灯泡，电流表读数有什么不同？', bridge: '真正的电子工程师也是这样——先在仿真里试，再动手焊板子。', hint: '元件不限量。' } : LABS[i];
    COLS = L.cols || (i === 'sandbox' ? 17 : 7); ROWS = L.rows || (i === 'sandbox' ? 11 : 5); view.z = 1; view.x = 0; view.y = 0;
    cur = { i: typeof i === 'object' ? 'custom' : i, lab: L, sandbox: i === 'sandbox' || !!L.free, parts: L.fixed.map((p) => Object.assign({ val: DEF[p.type], on: p.type === 'switch' ? false : undefined }, p)), quiz: false, st: {} };
    if (i === 'sandbox') cur.parts = (data().cw.sandbox || []).map((p) => Object.assign({}, p));
    if (L.preset) cur.parts = cur.parts.concat(L.preset.map((p) => Object.assign({ fixed: false }, p)));
    chart = []; simT = 0; sel = null; pick = null; hov = null;
    C.renderSide(); C.renderTray();
  }
  // 在「测试场景」里修改开关等状态后重新求解（用于检查开关逻辑），不影响玩家看到的电路
  const T = (mut, test) => { const ps = cur.parts.map((p) => Object.assign({}, p, { dOn: undefined })); mut(ps); solve(ps); return test(ps); };

  C.check = function () {
    const r = solve(cur.parts);
    if (r.short) return CF.toast('短路了！电池两端被导线直接连通，电流极大——真实电路会发热甚至起火。', 'bad', 3600);
    if (cur.sandbox) return CF.toast('自由搭建没有标准答案——看看电表读数是不是和你算的一样？');
    const ok = cur.lab.check(cur.parts, T, cur.st);
    if (!ok) {
      CF.Audio.sfx('error'); cur.fails = (cur.fails || 0) + 1;
      if (cur.fails >= 4 && C.ANS[cur.lab.id]) return C.explain();
      return CF.toast(`还没达到目标（第 ${cur.fails} 次）。${cur.fails === 3 ? '再错一次就给你看讲解和答案。' : '点「提示」看看思路。'}`, 'bad');
    }
    if (cur.lab.quiz && !cur.quiz) return C.quiz();
    C.win();
  };
  // 四次没通过：讲解 + 一键摆出正确答案（v8，主创要求）
  C.explain = function () {
    const L = cur.lab;
    CF.modal.open({ title: `讲解 · ${L.title}`, body: `<div class="cw-explain"><p><b>目标：</b>${L.goal}</p><p><b>怎么接：</b>${L.hint}</p><p><b>为什么：</b>${L.know}</p><p class="small muted"><b>再往深一层：</b>${L.bridge}</p>${L.quiz ? `<p class="small"><b>计算题：</b>${L.quiz.q} 答案：${L.quiz.opts[L.quiz.a]}</p>` : ''}<p class="small muted">看了答案也能完成实验，但首次奖励减半。</p></div>`,
      foot: [{ text: '我再试试', cls: 'ghost' }, { text: '摆出正确答案', cls: 'primary', onClick: () => { CF.modal.close(); C.showAnswer(); } }] });
  };
  C.showAnswer = function () {
    const id = cur.lab.id, i = cur.i; load(i === 'custom' ? cur.lab : i); cur.answered = true; cur.fails = 4;
    C.expandAns(C.ANS[id]).forEach((q) => {
      if (q.cmd === 'switch') { cur.parts.forEach((p) => { if (p.type === 'switch') p.on = true; }); if (cur.lab.rc) { cur.st.rcStart = simT; chart = []; } return; }
      if (cur.parts.some((p) => p.e === q.e)) return;
      cur.parts.push({ type: q.type, e: q.e, fixed: false, ans: true, val: q.val !== undefined ? q.val : defVal(q.type), on: q.on, flip: q.flip || undefined });
    });
    C.renderTray(); CF.toast('正确答案已经摆好：看看电流怎么走，再点「检查」完成实验', 'gold', 3000);
  };
  C.quiz = function () {
    const q = cur.lab.quiz, body = CF.h(`<div><p style="line-height:1.8">${q.q}</p><div class="quiz-opts"></div></div>`);
    q.opts.forEach((o, i) => { const b = CF.h(`<button class="btn" style="margin:4px">${o}</button>`); b.onclick = () => { if (i === q.a) { CF.modal.close(); cur.quiz = true; C.win(); } else { CF.Audio.sfx('error'); b.classList.add('ghost'); b.disabled = true; CF.toast('再看看电表读数，算一算。', 'bad'); } }; body.querySelector('.quiz-opts').appendChild(b); });
    CF.modal.open({ title: cur.lab.title + ' · 计算', body });
  };
  C.win = function () {
    const L = cur.lab, first = !done(L.id);
    CF.Audio.sfx('win');
    if (first) {
      data().cw.solved[L.id] = { t: Date.now() };
      const half = cur.answered ? 0.5 : 1, got = C.add({ chip: (200 + cur.i * 40) * half, corp: (120 + cur.i * 20) * half, comp: (20 + cur.i * 5) * half });
      if (C.grantPart) C.grantPart(L.id);
      CF.P.addXP({ type: 'p', amt: 12 + cur.i, dims: { zhi: 0.4 }, domain: 'emb', label: '电路工坊' });
      CF.modal.open({ title: `实验完成 · ${L.title}`, body: `<p style="line-height:1.8">✅ ${L.goal}</p><div class="explain"><b>高中：</b>${L.know}<br><b>大学：</b>${L.bridge}</div><p class="small" style="margin-top:8px">奖励：晶片 +${got.chip} · 语料 +${got.corp} · 算力 +${got.comp} · 电网多了一台发电机组（每小时 +30 晶片）</p>`, foot: [{ text: '留在这里', cls: 'ghost' }].concat(cur.i < LABS.length - 1 ? [{ text: '下一个实验 ▶', cls: 'primary', onClick: () => { CF.modal.close(); load(cur.i + 1); } }] : []) });
    } else CF.toast('实验完成！（已领取过奖励）', 'gold');
    C.renderSide(); C.renderTop();
  };

  C.enter = function () {
    const sc = $('#scr-city');
    sc.innerHTML = `<div class="cw"><div class="cw-top"><button class="glass hb" id="cwBack" title="返回大厅">←</button><div class="cw-title"><b>电路工坊</b><span class="small">从高中电路图到大学电路 · 学习不消耗体力</span></div><div class="glass cw-res" id="cwRes"></div></div>
      <div class="cw-main"><div class="cw-list" id="cwList"></div><div class="cw-board"><canvas id="cwCanvas"></canvas><div class="glass cw-pop hidden" id="cwPop"></div><div class="cw-cam"><button class="glass hb" id="cwZin" title="放大">＋</button><button class="glass hb" id="cwZout" title="缩小">－</button><button class="glass btn sm" id="cwCamMode" title="固定镜头：整块电路板放进画面；自由镜头：可以缩放和拖动"></button></div></div><div class="cw-side" id="cwSide"></div></div>
      <div class="glass cw-tray" id="cwTray"></div></div>`;
    cv = $('#cwCanvas'); ctx = cv.getContext('2d');
    $('#cwBack').onclick = () => CF.UI.show('lobby');
    C.tick(); C.renderTop(); C.renderList();
    const firstOpen = LABS.findIndex((l, i) => unlocked(i) && !done(l.id));
    load(firstOpen < 0 ? 0 : firstOpen);
    C.bindBoard();
    C.resize();
    C.setCam(camMode());
    $('#cwZin').onclick = () => { CF.Audio.sfx('click'); C.zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.25); };
    $('#cwZout').onclick = () => { CF.Audio.sfx('click'); C.zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 0.8); };
    $('#cwCamMode').onclick = () => { CF.Audio.sfx('click'); C.setCam(camMode() === 'fixed' ? 'free' : 'fixed'); };
    cancelAnimationFrame(raf); let last = performance.now();
    const loop = (now) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; C.step(dt); C.render(); };
    raf = requestAnimationFrame(loop);
    clearInterval(timer); timer = setInterval(() => { C.tick(); C.renderTop(); }, 5000);
  };
  C.leave = function () { cancelAnimationFrame(raf); clearInterval(timer); if (cur && cur.i === 'sandbox') data().cw.sandbox = cur.parts.map((p) => ({ e: p.e, type: p.type, val: p.val, on: p.on, flip: p.flip })); CF.Save.save(); };
  C.resize = function () { if (!cv) return; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  C.renderTop = function () {
    const el = $('#cwRes'); if (!el) return;
    const r = C.storage(), rt = C.rate(), st = data().cw.stock;
    el.innerHTML = `<span class="c-chip">◆ ${Math.floor(r.chip)}</span><span class="c-corp">◆ ${Math.floor(r.corp)}</span><span class="c-comp">◆ ${Math.floor(r.comp)}</span><span class="small">电网 ${solvedN()} 台机组 · 每小时 +${rt.chip}${plantMul() > 1 ? ` · 发电厂加成 ×${plantMul().toFixed(1)}` : ''}</span><button class="btn sm primary" id="cwCollect" ${st.chip >= 1 ? '' : 'disabled'}>收取 ${Math.floor(st.chip)}</button><button class="btn sm" id="cwBoost">⚡ 加速 ×${CF.Save.data.boosts || 0}</button>`;
    $('#cwCollect').onclick = C.collect; $('#cwBoost').onclick = C.boost;
  };
  C.renderList = function () {
    const el = $('#cwList'); el.innerHTML = '';
    let mod = null; const MODS = { base: '基础电路 · 高中 → 大学', emb: '具身智能模块 · 机器人', aero: '航空航天模块 · 卫星电源' };
    LABS.forEach((L, i) => { if ((L.mod || 'base') !== mod) { mod = L.mod || 'base'; el.appendChild(CF.h(`<div class="cw-mod cw-mod-${mod}">${MODS[mod]}</div>`)); } const b = CF.h(`<button class="cw-lab ${done(L.id) ? 'done' : ''} ${unlocked(i) ? '' : 'locked'} ${cur && cur.i === i ? 'on' : ''}"><span class="lv lv-${L.lv}">${L.lv}</span><b>${i + 1}. ${L.title}</b>${done(L.id) ? '<i>✓</i>' : ''}</button>`); b.onclick = () => { if (!unlocked(i)) return CF.toast('先完成上一个实验', 'bad'); CF.Audio.sfx('click'); load(i); C.renderList(); }; el.appendChild(b); });
    const sb = CF.h(`<button class="cw-lab ${cur && cur.sandbox ? 'on' : ''}"><span class="lv lv-自由">自由</span><b>自由搭建</b></button>`); sb.onclick = () => { load('sandbox'); C.renderList(); }; el.appendChild(sb);
  };
  C.renderSide = function () {
    const L = cur.lab, el = $('#cwSide');
    el.innerHTML = `<div class="t-tag">${L.lv === '高中' ? 'HIGH SCHOOL' : L.lv === '衔接' ? 'BRIDGE' : L.lv === '大学' ? 'UNIVERSITY' : 'SANDBOX'} · ${L.lv}</div><h3>${L.title}</h3><p class="cw-goal">${L.goal}</p><div class="cw-know"><b>高中</b>${L.know}</div><div class="cw-know uni"><b>大学</b>${L.bridge}</div><div id="cwRead" class="cw-read"></div><div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn sm primary" id="cwCheck">检查</button><button class="btn sm" id="cwHint">提示</button><button class="btn sm ghost" id="cwReset">重置</button></div>${L.rc ? '<canvas id="cwChart" class="cw-chart"></canvas>' : ''}`;
    $('#cwCheck').onclick = C.check; $('#cwHint').onclick = () => CF.modal.open({ title: '提示', body: `<p style="line-height:1.8">${L.hint}</p>`, foot: [{ text: '好的', cls: 'primary' }] }); $('#cwReset').onclick = () => { load(cur.i); };
  };
  const defVal = (t) => (cur.lab.defs && cur.lab.defs[t] !== undefined ? cur.lab.defs[t] : t === 'resistor' && cur.lab.id === 'k7' ? 200 : DEF[t]);
  // 点选放置（v6，参考植物大战僵尸：点一下卡片选中，再点电路板上的空边放下；也可以直接拖）
  C.setPick = function (t) {
    pick = t && left(t) > 0 ? { type: t, val: defVal(t) } : null; hov = null;
    if (pick) CF.toast(`已选中「${PARTS[t].name}」：点电路板上的空位放置（再点卡片取消）`, '', 1800);
    C.renderTray();
  };
  C.placeAt = function (e2) {
    if (!pick || !e2) return false;
    const occ = cur.parts.find((q) => q.e === e2);
    if (occ) { if (!occ.fixed) { cur.parts = cur.parts.filter((q) => q !== occ); CF.Audio.sfx('hover'); CF.toast(`拿走了「${PARTS[occ.type].name}」（选中状态下再点已放的元件 = 取消放置）`, '', 1400); C.renderTray(); return true; } CF.toast('这是题目给定的元件，不能拿走', 'bad', 1200); CF.Audio.sfx('error'); return false; }
    cur.parts.push({ type: pick.type, val: pick.val, on: pick.type === 'switch' ? true : undefined, e: e2, fixed: false });
    CF.Audio.sfx('place');
    if (left(pick.type) <= 0) pick = null; // 用完自动取消；还有库存就保持选中，可以连续放
    C.renderTray(); return true;
  };
  C.renderTray = function () {
    const el = $('#cwTray'); el.innerHTML = '';
    const types = cur.sandbox ? Object.keys(PARTS) : Object.keys(cur.lab.pal);
    if (!types.length) el.appendChild(CF.h('<span class="small muted">这个实验不需要放元件——直接点电路板上的开关。</span>'));
    types.forEach((t) => {
      const n = left(t), b = CF.h(`<button class="cw-part ${n > 0 ? '' : 'na'}${pick && pick.type === t ? ' pick' : ''}" data-t="${t}"><span class="ic">${PARTS[t].ic}</span><span>${PARTS[t].name}</span><span class="c">${cur.sandbox ? '∞' : '×' + n}</span></button>`);
      b.addEventListener('pointerdown', (e) => { if (left(t) <= 0) return CF.toast('这个元件用完了', 'bad'); e.preventDefault(); drag = { type: t, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, tray: true, from: null, val: defVal(t) }; C.dragMove(e); });
      el.appendChild(b);
    });
  };
  // 拖拽（沿用沉浸模式的「虚影 + 吸附」写法：吸附到最近的边，可放为绿、被占为红）
  C.bindBoard = function () {
    const local = (e) => { const r = CF.appRect(cv), p = CF.appPoint(e.clientX, e.clientY); return [p.x - r.left, p.y - r.top]; };
    C.dragMove = (e) => { if (!drag) return; drag.x = e.clientX; drag.y = e.clientY; const [x, y] = local(e); drag.lx = x; drag.ly = y; drag.edge = nearestEdge(x, y); drag.ok = drag.edge && !cur.parts.some((p) => p.e === drag.edge); };
    window.addEventListener('pointermove', (e) => { if (drag) C.dragMove(e); });
    cv.addEventListener('pointermove', (e) => { if (!pick || drag) return; const [x, y] = local(e), e2 = nearestEdge(x, y); hov = { lx: x, ly: y, edge: e2, ok: e2 && !cur.parts.some((q) => q.e === e2) }; });
    cv.addEventListener('pointerleave', () => { hov = null; });
    cv.addEventListener('contextmenu', (e) => { if (pick) { e.preventDefault(); C.setPick(null); } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pick && CF.UI.cur === 'city') C.setPick(null); });
    window.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag; drag = null; C.dragMove(e);
      if (d.tray && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) { CF.Audio.sfx('click'); C.setPick(pick && pick.type === d.type ? null : d.type); return; }
      if (d.tray && pick) { pick = null; hov = null; }
      const moved = d.from && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8;
      if (moved) { cur.parts.push(d.from); C.openPop(d.from); return; }
      const [x, y] = local(e), e2 = nearestEdge(x, y);
      if (e2 && !cur.parts.some((p) => p.e === e2)) { cur.parts.push(Object.assign(d.from || { type: d.type, val: d.val, on: d.type === 'switch' ? true : undefined }, { e: e2, fixed: false })); CF.Audio.sfx('place'); C.renderTray(); }
      else if (d.from) { cur.parts.push(d.from); }
    });
    // 自由镜头：滚轮缩放、双指缩放、拖动空白处平移
    const ptrs = new Map(); let pan = null, pinch = null;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); C.zoomAt(x, y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, local(e));
      if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); C.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; return; }
      if (pan && pan.id === e.pointerId) { const [x, y] = local(e); view.x += x - pan.x; view.y += y - pan.y; pan.x = x; pan.y = y; }
    });
    const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (pan && pan.id === e.pointerId) pan = null; };
    cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
    cv.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, local(e));
      if (ptrs.size === 2) { if (drag && drag.from) cur.parts.push(drag.from); drag = null; pan = null; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; if (camMode() === 'fixed') C.setCam('free', true); return; }
      const [x, y] = local(e), e2 = nearestEdge(x, y), p = e2 && cur.parts.find((q) => q.e === e2);
      C.closePop();
      if (pick) { if (e.button === 2) { C.setPick(null); return; } if (!e2) { C.setPick(null); return; } C.placeAt(e2); return; }
      if (!p) { if (camMode() === 'free') { pan = { id: e.pointerId, x, y }; } return; }
      if (p.fixed) { C.openPop(p); return; }
      cur.parts = cur.parts.filter((q) => q !== p); drag = { from: p, type: p.type, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY }; C.dragMove(e);
    });
  };
  C.openPop = function (p) {
    const pop = $('#cwPop'), [x, y] = edgeMid(p.e), D = PARTS[p.type], btns = [];
    if (p.type === 'switch') btns.push([p.on ? '断开' : '闭合', () => { p.on = !p.on; if (cur.lab.rc && p.on) { cur.st.rcStart = simT; chart = []; } }]);
    if (D.vals && p.type !== 'mcu' && (!p.fixed || ['solar', 'ldr', 'ntc', 'pot'].includes(p.type))) btns.push([p.type === 'solar' || p.type === 'ldr' ? '改光照' : p.type === 'ntc' ? '改温度' : p.type === 'pot' ? '拧旋钮' : '换值', () => { const i = D.vals.indexOf(p.val); p.val = D.vals[(i + 1) % D.vals.length]; if (p.type === 'fuse') p.blown = false; }]);
    if (p.type === 'fuse' && p.blown) btns.push(['换新保险丝', () => { p.blown = false; }]);
    if (D.ch) btns.push([`换通道（${p.ch || 'A'}）`, () => { p.ch = { A: 'B', B: 'C', C: 'A' }[p.ch || 'A']; }]);
    if (p.type === 'mcu') btns.push([`换程序（${PROG[p.val] || PROG.on}）`, () => { const i = D.vals.indexOf(p.val || 'on'); p.val = D.vals[(i + 1) % D.vals.length]; }]);
    if (p.type === 'motor') btns.push([p.stall ? '松开（恢复转动）' : '模拟堵转', () => { p.stall = !p.stall; }]);
    if (D.polar && !p.fixed) btns.push(['翻转极性', () => { p.flip = !p.flip; p.dOn = undefined; }]);
    if (!p.fixed) btns.push(['拿走', () => { cur.parts = cur.parts.filter((q) => q !== p); C.renderTray(); }]);
    if (!btns.length) { CF.toast(`${p.label || D.name}（题目给定，不能改动）`); return; }
    pop.innerHTML = `<b>${p.label || D.name}${p.val !== undefined && !p.hidden ? ' · ' + fmtVal(p) : ''}</b>`; btns.forEach(([n, fn]) => { const b = CF.h(`<button class="btn sm">${n}</button>`); b.onclick = () => { fn(); CF.Audio.sfx('click'); C.closePop(); }; pop.appendChild(b); });
    pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop.classList.remove('hidden');
  };
  C.closePop = () => { const p = $('#cwPop'); if (p) p.classList.add('hidden'); };
  const fmtVal = (p) => (p.type === 'pot' ? `旋钮 ${p.val ?? 50}% · ${(potR(p.val) / 1000).toFixed(1)} kΩ` : p.type === 'ntc' ? `${p.val ?? 25} ℃` : p.type === 'mcu' ? PROG[p.val] || PROG.on : p.type === 'cap' ? `${p.val * 1e6} μF` : p.type === 'resistor' ? (p.val >= 1000 ? p.val / 1000 + ' kΩ' : p.val + ' Ω') : p.type === 'fuse' ? p.val + ' A' : p.type === 'solar' || p.type === 'ldr' ? `光照 ${p.val ?? 100}%` : p.val + ' V');
  const fmtI = (i) => (Math.abs(i) < 1 ? (Math.abs(i) * 1000).toFixed(1) + ' mA' : Math.abs(i).toFixed(2) + ' A');

  // 每帧：电容时间推进 + LED 烧毁判定 + 读数
  C.step = function (dt) {
    if (!cur) return;
    const steps = cur.lab.rc ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      const r = solve(cur.parts, 0.02); cur.short = r.short;
      cur.parts.forEach((p) => { if (p.type === 'cap') p.vc = p.vcNext; if (p.type === 'buzzer' && Math.abs(p.I || 0) > 0.02 && (!p._bz || simT - p._bz > 0.5)) { p._bz = simT; CF.Audio.sfx('hover'); } if (p.type === 'fuse' && p.blown && !p._seen) { p._seen = true; CF.Audio.sfx('error'); CF.toast(`保险丝熔断了（额定 ${p.val} A）！点它「换新保险丝」或换个额定值。`, 'bad', 3000); } if (p.type === 'fuse' && !p.blown) p._seen = false; if (p.type === 'led' && p.I > 0.03 && !p.burnt) { p.burnt = true; CF.Audio.sfx('error'); CF.toast('LED 烧坏了！电流超过 30 mA。拿掉它旁边的电阻换个更大的，再点「重置」。', 'bad', 3600); } });
      simT += 0.02;
    }
    if (cur.lab.rc) { const c = cur.parts.find((p) => p.type === 'cap'); if (cur.st.rcStart !== undefined) { chart.push([simT - cur.st.rcStart, c.vc || 0]); if (chart.length > 400) chart.shift(); if (simT - cur.st.rcStart > 3) cur.st.rcDone = true; } C.drawChart(); }
    const rd = $('#cwRead');
    if (rd && Math.floor(simT * 5) !== cur._rt) { cur._rt = Math.floor(simT * 5); rd.innerHTML = cur.parts.filter((p) => ['ammeter', 'voltmeter', 'bulb', 'led', 'cap', 'motor', 'fuse', 'diode', 'solar', 'buzzer', 'zener', 'coil', 'mcu'].includes(p.type)).map((p) => `<span>${p.label || PARTS[p.type].name}：${p.type === 'voltmeter' || p.type === 'cap' ? Math.abs(p.type === 'cap' ? p.vc || 0 : p.V).toFixed(2) + ' V' : p.type === 'led' && p.burnt ? '已烧坏' : p.type === 'fuse' && p.blown ? '已熔断' : p.type === 'motor' && p.stall ? fmtI(p.I) + '（堵转）' : fmtI(p.I)}</span>`).join('') + (cur.short ? '<span style="color:#ff5d6c">⚠ 短路</span>' : ''); }
  };
  C.drawChart = function () {
    const c2 = $('#cwChart'); if (!c2) return; const w = c2.clientWidth, h = c2.clientHeight; if (c2.width !== w) { c2.width = w; c2.height = h; }
    const x = c2.getContext('2d'); x.clearRect(0, 0, w, h); x.strokeStyle = '#ffffff22'; x.strokeRect(24, 6, w - 30, h - 24);
    x.fillStyle = '#9d96ad'; x.font = '10px ui-monospace,monospace'; x.fillText('6V', 2, 12); x.fillText('0', 12, h - 16); x.fillText('3 s', w - 22, h - 4);
    x.strokeStyle = '#ffb14a66'; x.setLineDash([4, 4]); const y63 = 6 + (h - 24) * (1 - 0.632); x.beginPath(); x.moveTo(24, y63); x.lineTo(w - 6, y63); x.stroke(); x.setLineDash([]); x.fillStyle = '#ffb14a'; x.fillText('63%', w - 30, y63 - 2);
    x.strokeStyle = '#19f0e0'; x.lineWidth = 2; x.beginPath(); chart.forEach(([t, v], i) => { const X = 24 + (t / 3) * (w - 30), Y = 6 + (h - 24) * (1 - v / 6); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke(); x.lineWidth = 1;
  };
  // 画电路板与元件（国标符号的像素风简化）
  C.render = function () {
    if (!cv || !cur) return;
    const w = cv.clientWidth, h = cv.clientHeight, g = geo(), t = performance.now() / 1000, beat = CF.PixelFX.beat(), hp = CF.Heroes.current().pal;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1424'; ctx.fillRect(0, 0, w, h);
    // 背景网格（像素脉冲随节拍）
    ctx.fillStyle = `rgba(${hp.grid.join(',')},${0.05 + beat * 0.05})`; for (let y = 0; y < h; y += 24) for (let x = 0; x < w; x += 24) ctx.fillRect(x, y, 1, 1);
    // 空边（可放位置）
    const hs = drag || hov, hl = hs && hs.edge, busy = pick ? new Set(cur.parts.map((q) => q.e)) : null;
    allEdges().forEach((e) => { const [a, b] = ends(e).map(nodeXY); ctx.strokeStyle = e === hl ? (hs.ok ? '#6fdc8c' : '#ff5d6c') : busy && !busy.has(e) ? `rgba(111,220,140,${0.16 + beat * 0.22})` : '#ffffff10'; ctx.lineWidth = e === hl ? 4 : 2; ctx.setLineDash(e === hl ? [] : [3, 5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
    ctx.setLineDash([]); ctx.lineWidth = 1;
    (cur.lab.slots || []).forEach((e) => { if (cur.parts.some((p) => p.e === e)) return; const [mx, my] = edgeMid(e); ctx.strokeStyle = `rgba(255,177,74,${0.5 + beat * 0.5})`; ctx.lineWidth = 2; ctx.strokeRect(mx - 12, my - 20, 24, 40); ctx.lineWidth = 1; });
    if (cur.lab.slot && !cur.parts.some((p) => p.e === cur.lab.slot)) { const [mx, my] = edgeMid(cur.lab.slot); ctx.strokeStyle = `rgba(255,177,74,${0.5 + beat * 0.5})`; ctx.strokeRect(mx - 14, my - 22, 28, 44); ctx.fillStyle = '#ffb14a'; ctx.font = '11px sans-serif'; ctx.fillText('R₃ ?', mx + 16, my); }
    cur.parts.forEach((p) => drawPart(p, g.s, t));
    // 节点
    for (let n = 0; n < COLS * ROWS; n++) { const [x, y] = nodeXY(n); ctx.fillStyle = '#c9d4ff'; ctx.fillRect(x - 3, y - 3, 6, 6); }
    // 拖拽中的虚影
    if (drag) { const pos = drag.edge ? edgeMid(drag.edge) : [drag.lx, drag.ly]; ctx.globalAlpha = 0.75; drawPart({ type: drag.type, e: drag.edge || 'h,0,0', val: drag.val, ghost: true, at: drag.edge ? null : pos, I: 0 }, g.s, t); ctx.globalAlpha = 1; }
    else if (pick && hov && hov.edge) { ctx.globalAlpha = hov.ok ? 0.6 : 0.3; drawPart({ type: pick.type, e: hov.edge, val: pick.val, ghost: true, I: 0 }, g.s, t); ctx.globalAlpha = 1; }
    if (cur.short) { ctx.fillStyle = `rgba(255,93,108,${0.08 + 0.06 * Math.sin(t * 10)})`; ctx.fillRect(0, 0, w, h); }
  };
  function drawPart(p, s, t) {
    let [a, b] = ends(p.e).map(nodeXY);
    if (p.at) { const half = s / 2; a = [p.at[0] - half, p.at[1]]; b = [p.at[0] + half, p.at[1]]; }
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.min(1.5, s / 80);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
    const line = (x1, x2, c = '#ede6d6', w = 3) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x2, 0); ctx.stroke(); };
    const lead = (half) => { line(-L / 2, -half); line(half, L / 2); };
    const I = Math.abs(p.I || 0);
    switch (p.type) {
      case 'wire': line(-L / 2, L / 2, I > 0.001 ? '#ffe9a8' : '#ede6d6'); break;
      case 'battery': { lead(8 * k); const pl = p.flip ? 1 : -1; ctx.fillStyle = '#ede6d6'; ctx.fillRect(pl * 6 * k - 1.5, -16 * k, 3, 32 * k); ctx.fillRect(-pl * 6 * k - 2.5, -9 * k, 5, 18 * k); ctx.fillStyle = '#ffb14a'; ctx.font = `${11}px sans-serif`; ctx.rotate(-ang); ctx.fillText(`${p.val}V`, 10, -14); break; }
      case 'resistor': { lead(16 * k); ctx.strokeStyle = '#ede6d6'; ctx.lineWidth = 2.5; ctx.strokeRect(-16 * k, -7 * k, 32 * k, 14 * k); ctx.rotate(-ang); ctx.fillStyle = '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(p.label ? p.label + (p.hidden ? '' : '=' + fmtVal(p)) : fmtVal(p), 10, -12); break; }
      case 'bulb': { lead(12 * k); const pw = Math.min(1, (I * I * 10) / 0.5); if (pw > 0.02) { const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 34 * k); gr.addColorStop(0, `rgba(255,236,150,${0.9 * pw})`); gr.addColorStop(1, 'rgba(255,236,150,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 34 * k, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = '#ede6d6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 12 * k, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8 * k, -8 * k); ctx.lineTo(8 * k, 8 * k); ctx.moveTo(8 * k, -8 * k); ctx.lineTo(-8 * k, 8 * k); ctx.stroke(); break; }
      case 'switch': { lead(14 * k); ctx.fillStyle = '#ede6d6'; ctx.fillRect(-14 * k - 2, -2, 4, 4); ctx.fillRect(14 * k - 2, -2, 4, 4); ctx.strokeStyle = p.on ? '#6fdc8c' : '#ffb14a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14 * k, 0); ctx.lineTo(14 * k, p.on ? 0 : -14 * k); ctx.stroke(); break; }
      case 'ammeter': case 'voltmeter': { lead(13 * k); ctx.fillStyle = '#0b1424'; ctx.beginPath(); ctx.arc(0, 0, 13 * k, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = p.type === 'ammeter' ? '#ffb14a' : '#19f0e0'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.rotate(-ang); ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${Math.round(13 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(p.label === 'G' ? 'G' : p.type === 'ammeter' ? 'A' : 'V', 0, 4.5 * k); ctx.font = '11px ui-monospace,monospace'; ctx.fillText(p.type === 'ammeter' ? fmtI(p.I || 0) : Math.abs(p.V || 0).toFixed(2) + 'V', 0, -18 * k); ctx.textAlign = 'left'; break; }
      case 'led': { lead(10 * k); const on = I > 0.001 && !p.burnt, dir = p.flip ? -1 : 1; if (on) { ctx.fillStyle = `rgba(255,90,120,${Math.min(0.9, I * 50)})`; ctx.beginPath(); ctx.arc(0, 0, 26 * k, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = p.burnt ? '#555' : on ? '#ff5a78' : '#a04050'; ctx.beginPath(); ctx.moveTo(-10 * k * dir, -10 * k); ctx.lineTo(10 * k * dir, 0); ctx.lineTo(-10 * k * dir, 10 * k); ctx.closePath(); ctx.fill(); ctx.fillRect(10 * k * dir - (dir > 0 ? 0 : 3), -10 * k, 3, 20 * k); if (p.burnt) { ctx.strokeStyle = '#ff5d6c'; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); } break; }
      case 'cap': { lead(5 * k); ctx.fillStyle = '#ede6d6'; ctx.fillRect(-6 * k, -14 * k, 3, 28 * k); ctx.fillRect(3 * k, -14 * k, 3, 28 * k); ctx.rotate(-ang); ctx.fillStyle = '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(fmtVal(p), 12, -14); break; }
      case 'motor': { lead(15 * k); const r = 15 * k; ctx.fillStyle = '#0b1424'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = p.stall ? '#ff5d6c' : '#c8ff2e'; ctx.lineWidth = 2.5; ctx.stroke();
        p.rot = (p.rot || 0) + (p.stall ? 0 : Math.sign(p.I || 0) * Math.min(0.5, Math.abs(p.I || 0) * 0.35)); ctx.save(); ctx.rotate(p.rot - ang); ctx.strokeStyle = '#c8ff2e88'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.rotate((Math.PI * 2) / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke(); } ctx.restore();
        ctx.rotate(-ang); ctx.fillStyle = '#c8ff2e'; ctx.font = `bold ${Math.round(12 * k)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText('M', 0, 4 * k); ctx.textAlign = 'left'; ctx.font = '11px sans-serif'; ctx.fillStyle = '#9fe8ff'; if (p.label) ctx.fillText(p.label, r + 4, -r); if (p.stall) { ctx.fillStyle = '#ff5d6c'; ctx.fillText('堵转', r + 4, r + 8); } break; }
      case 'diode': { lead(9 * k); const on = Math.abs(p.I || 0) > 0.001; ctx.fillStyle = on ? '#ffd257' : '#b0a070'; ctx.save(); if (p.flip) ctx.scale(-1, 1); ctx.beginPath(); ctx.moveTo(-9 * k, -9 * k); ctx.lineTo(9 * k, 0); ctx.lineTo(-9 * k, 9 * k); ctx.closePath(); ctx.fill(); ctx.fillRect(8 * k, -10 * k, 3, 20 * k); ctx.restore(); break; }
      case 'fuse': { lead(14 * k); ctx.strokeStyle = p.blown ? '#ff5d6c' : '#ede6d6'; ctx.lineWidth = 2; ctx.strokeRect(-14 * k, -6 * k, 28 * k, 12 * k); ctx.beginPath(); if (p.blown) { ctx.moveTo(-12 * k, 0); ctx.lineTo(-3 * k, 3 * k); ctx.moveTo(3 * k, -3 * k); ctx.lineTo(12 * k, 0); } else { ctx.moveTo(-12 * k, 0); ctx.lineTo(12 * k, 0); } ctx.stroke(); ctx.rotate(-ang); ctx.fillStyle = p.blown ? '#ff5d6c' : '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(p.blown ? '熔断' : fmtVal(p), 10, -12); break; }
      case 'solar': { lead(16 * k); const lv = (p.val ?? 100) / 100; ctx.fillStyle = '#1a2a5a'; ctx.fillRect(-16 * k, -11 * k, 32 * k, 22 * k); ctx.strokeStyle = '#4ef0ff'; ctx.lineWidth = 1.5; ctx.strokeRect(-16 * k, -11 * k, 32 * k, 22 * k); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-16 * k + i * 8 * k, -11 * k); ctx.lineTo(-16 * k + i * 8 * k, 11 * k); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-16 * k, 0); ctx.lineTo(16 * k, 0); ctx.stroke(); if (lv > 0) { ctx.fillStyle = `rgba(255,220,90,${0.25 + 0.5 * lv})`; ctx.fillRect(-16 * k, -11 * k, 32 * k, 22 * k); }
        ctx.rotate(-ang); ctx.fillStyle = '#ffd257'; ctx.font = '11px sans-serif'; ctx.fillText(`☀ ${p.val ?? 100}%`, 14, -14); ctx.fillStyle = '#ede6d6'; ctx.fillText(p.flip ? '−' : '+', -4, p.flip ? 26 : -18); break; }
      case 'pot': { lead(16 * k); ctx.strokeStyle = '#ede6d6'; ctx.lineWidth = 2.5; ctx.strokeRect(-16 * k, -7 * k, 32 * k, 14 * k); ctx.strokeStyle = '#ffb14a'; ctx.beginPath(); ctx.moveTo(-14 * k, 12 * k); ctx.lineTo(14 * k, -12 * k); ctx.stroke(); ctx.fillStyle = '#ffb14a'; ctx.fillRect(12 * k, -14 * k, 4, 4); ctx.rotate(-ang); ctx.fillStyle = '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(fmtVal(p), 12, 18); break; }
      case 'ntc': { lead(16 * k); ctx.strokeStyle = '#ede6d6'; ctx.lineWidth = 2.5; ctx.strokeRect(-16 * k, -7 * k, 32 * k, 14 * k); const hot = (p.val ?? 25) / 100; ctx.fillStyle = `rgba(255,${Math.round(180 - 120 * hot)},80,${0.25 + 0.5 * hot})`; ctx.fillRect(-15 * k, -6 * k, 30 * k, 12 * k); ctx.rotate(-ang); ctx.fillStyle = '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(`${p.val ?? 25} ℃`, 12, 18); break; }
      case 'buzzer': { lead(13 * k); const on = I > 0.02; ctx.fillStyle = '#0b1424'; ctx.beginPath(); ctx.arc(0, 0, 13 * k, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = on ? '#ffd257' : '#ede6d6'; ctx.lineWidth = 2.5; ctx.stroke(); if (on) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 30); for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(0, 0, (13 + i * 6) * k, -0.6, 0.6); ctx.stroke(); } ctx.globalAlpha = 1; } ctx.rotate(-ang); ctx.fillStyle = on ? '#ffd257' : '#ede6d6'; ctx.font = `bold ${Math.round(12 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('♪', 0, 4 * k); ctx.textAlign = 'left'; break; }
      case 'zener': { lead(9 * k); const on = Math.abs(p.I || 0) > 0.001; ctx.fillStyle = on ? '#4ef0ff' : '#5a8a9a'; ctx.save(); if (p.flip) ctx.scale(-1, 1); ctx.beginPath(); ctx.moveTo(-9 * k, -9 * k); ctx.lineTo(9 * k, 0); ctx.lineTo(-9 * k, 9 * k); ctx.closePath(); ctx.fill(); ctx.fillRect(8 * k, -10 * k, 3, 20 * k); ctx.fillRect(8 * k, -10 * k, -5 * k, 3); ctx.fillRect(11 * k, 7 * k, 5 * k, 3); ctx.restore(); ctx.rotate(-ang); ctx.fillStyle = '#4ef0ff'; ctx.font = '10px sans-serif'; ctx.fillText('5.1V', 10, -12); break; }
      case 'coil': { lead(16 * k); ctx.strokeStyle = Math.abs(p.I || 0) > 0.04 ? '#c8ff2e' : '#ede6d6'; ctx.lineWidth = 2.5; ctx.strokeRect(-16 * k, -8 * k, 32 * k, 16 * k); ctx.beginPath(); for (let i = 0; i < 4; i++) ctx.arc(-11 * k + i * 7.5 * k, 0, 3.5 * k, Math.PI, 0); ctx.stroke(); ctx.rotate(-ang); ctx.fillStyle = '#c8ff2e'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('线圈 ' + (p.ch || 'A'), 12, -14); break; }
      case 'contact': case 'mosfet': { lead(14 * k); const on = !!p.closed; if (p.type === 'contact') { ctx.fillStyle = '#ede6d6'; ctx.fillRect(-14 * k - 2, -2, 4, 4); ctx.fillRect(14 * k - 2, -2, 4, 4); ctx.strokeStyle = on ? '#6fdc8c' : '#ffb14a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14 * k, 0); ctx.lineTo(14 * k, on ? 0 : -12 * k); ctx.stroke(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -6 * k); ctx.lineTo(0, -18 * k); ctx.stroke(); ctx.setLineDash([]); } else { ctx.fillStyle = '#0b1424'; ctx.fillRect(-13 * k, -10 * k, 26 * k, 20 * k); ctx.strokeStyle = on ? '#6fdc8c' : '#9d96ad'; ctx.lineWidth = 2; ctx.strokeRect(-13 * k, -10 * k, 26 * k, 20 * k); ctx.fillStyle = on ? '#6fdc8c' : '#9d96ad'; ctx.font = `bold ${Math.round(11 * k)}px ui-monospace,monospace`; ctx.save(); ctx.rotate(-ang); ctx.textAlign = 'center'; ctx.fillText('Q', 0, 4 * k); ctx.restore(); } ctx.rotate(-ang); ctx.fillStyle = on ? '#6fdc8c' : '#ffb14a'; ctx.font = 'bold 11px sans-serif'; ctx.fillText((p.type === 'contact' ? '触点 ' : 'MOS ') + (p.ch || 'A'), 12, -14); break; }
      case 'mcu': { lead(18 * k); ctx.fillStyle = '#141a2e'; ctx.fillRect(-18 * k, -12 * k, 36 * k, 24 * k); ctx.strokeStyle = p.pwr ? '#4ef0ff' : '#5a5f7a'; ctx.lineWidth = 2; ctx.strokeRect(-18 * k, -12 * k, 36 * k, 24 * k); ctx.fillStyle = '#c9d4ff'; for (let i = 0; i < 4; i++) { ctx.fillRect(-14 * k + i * 8 * k, -15 * k, 3, 3 * k); ctx.fillRect(-14 * k + i * 8 * k, 12 * k, 3, 3 * k); } ctx.fillStyle = p.out ? '#6fdc8c' : '#ff5d6c'; ctx.fillRect(12 * k, -8 * k, 4 * k, 4 * k); ctx.rotate(-ang); ctx.fillStyle = '#4ef0ff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`单片机 ${p.ch || 'A'} · ${PROG[p.val] || PROG.on}`, 14, -16); break; }
      case 'ldr': { lead(16 * k); ctx.strokeStyle = '#ede6d6'; ctx.lineWidth = 2.5; ctx.strokeRect(-16 * k, -7 * k, 32 * k, 14 * k); ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-6 * k + i * 8 * k, -22 * k); ctx.lineTo(-1 * k + i * 8 * k, -11 * k); ctx.stroke(); } ctx.rotate(-ang); ctx.fillStyle = '#9fe8ff'; ctx.font = '11px sans-serif'; ctx.fillText(`光照 ${p.val ?? 100}%`, 12, 18); break; }
    }
    // 电流流动：沿元件移动的小方块，速度与电流大小相关
    if (I > 0.001 && !p.ghost && p.type !== 'voltmeter') { const sp = Math.min(3, 0.4 + Math.log10(1 + I * 100)), dir = (p.I || 0) >= 0 ? 1 : -1; ctx.fillStyle = '#ffe08a'; for (let i = 0; i < 3; i++) { const u = ((t * sp + i / 3) % 1) * dir; ctx.fillRect(-L / 2 + ((u + 1) % 1) * L - 2, -2, 4, 4); } }
    if (p.fixed && !p.ghost && p.type !== 'wire') { ctx.rotate(0); }
    ctx.restore();
  }

  C.bind = function () { window.addEventListener('resize', () => CF.UI.cur === 'city' && C.resize()); };
  // 学习经验 → 学习加速（每 30 点经验 1 次）
  CF.bus.on('progress', () => {
    const d = CF.Save.data, c = data(), tot = d.xp.knowledge + d.xp.practice;
    if (c.boostBase === undefined) c.boostBase = tot;
    while (tot - c.boostBase >= 30) { c.boostBase += 30; d.boosts = (d.boosts || 0) + 1; CF.toast('⚡ 获得 1 次学习加速（电路工坊：立即领取 1 小时电网产出）', 'gold', 2600); }
    CF.Save.save();
  });
})();
