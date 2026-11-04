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
  const COLS = 7, ROWS = 5, GW = 1e4, HOUR = 3600 * 1000;
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
  C.bonus = function () { const n = solvedN(); return { atkMul: 1 + n * 0.02, bldMul: 1 + n * 0.02, heroMul: 1 + n * 0.015, extraCoders: n >= 5 ? 1 : 0, startChip: n * 20, solved: n }; };
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
  };
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
    parts.forEach((p) => { if (p.type === 'led' && p.dOn === undefined) p.dOn = false; });
    let v = null;
    for (let it = 0; it < 10; it++) {
      const G = Array.from({ length: N }, () => new Float64Array(N)), I = new Float64Array(N);
      const g2 = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };
      for (const p of parts) {
        const [a, b] = ends(p.e), pos = p.flip ? b : a, neg = p.flip ? a : b;
        switch (p.type) {
          case 'wire': g2(a, b, GW); break;
          case 'resistor': g2(a, b, 1 / p.val); break;
          case 'bulb': g2(a, b, 1 / PARTS.bulb.R); break;
          case 'ammeter': g2(a, b, 1 / PARTS.ammeter.R); break;
          case 'voltmeter': g2(a, b, 1e-7); break;
          case 'switch': g2(a, b, p.on ? GW : 1e-9); break;
          case 'battery': { const g = 1 / 0.05; g2(pos, neg, g); I[pos] += p.val * g; I[neg] -= p.val * g; break; }
          case 'led': { if (p.burnt) { g2(a, b, 1e-9); break; } if (p.dOn) { const g = 1 / PARTS.led.rd; g2(pos, neg, g); I[pos] += PARTS.led.Vf * g; I[neg] -= PARTS.led.Vf * g; } else g2(pos, neg, 1e-9); break; }
          case 'cap': { const g = p.val / dt, vp = p.vc || 0; g2(a, b, g); I[a] += g * vp; I[b] -= g * vp; break; }
        }
      }
      for (let i = 0; i < N; i++) G[i][i] += 1e-9;
      G[ref].fill(0); G[ref][ref] = 1; I[ref] = 0;
      v = gauss(G, I);
      // 二极管状态迭代
      let changed = false;
      for (const p of parts) if (p.type === 'led' && !p.burnt) { const [a, b] = ends(p.e), vd = p.flip ? v[b] - v[a] : v[a] - v[b]; const want = p.dOn ? (vd - PARTS.led.Vf) / PARTS.led.rd > 0 : vd > PARTS.led.Vf; if (want !== p.dOn) { p.dOn = want; changed = true; } }
      if (!changed) break;
    }
    // 每个元件的电流（a → b 为正）与两端电压
    let short = false;
    for (const p of parts) {
      const [a, b] = ends(p.e), vab = v[a] - v[b];
      p.V = vab;
      switch (p.type) {
        case 'wire': p.I = vab * GW; break;
        case 'resistor': p.I = vab / p.val; break;
        case 'bulb': p.I = vab / PARTS.bulb.R; break;
        case 'ammeter': p.I = vab / PARTS.ammeter.R; break;
        case 'voltmeter': p.I = vab * 1e-7; break;
        case 'switch': p.I = vab * (p.on ? GW : 1e-9); break;
        case 'battery': { const vt = p.flip ? -vab : vab; p.I = (p.val - vt) / 0.05; if (p.I > 8) short = true; break; }
        case 'led': { const vd = p.flip ? -vab : vab; p.I = p.dOn && !p.burnt ? (vd - PARTS.led.Vf) / PARTS.led.rd : 0; break; }
        case 'cap': { const g = p.val / dt; p.I = g * (vab - (p.vc || 0)); p.vcNext = vab; break; }
      }
    }
    return { v, short };
  }
  C.solve = solve; C.PARTS = PARTS;

  // ================= 实验 =================
  const V = (e, type, o = {}) => Object.assign({ e, type, fixed: true }, o);
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
  ];
  C.LABS = LABS;
  C._cur = () => cur; C._load = (i) => load(i); // 测试与调试用

  // ================= 工坊界面 =================
  let cur = null, cv, ctx, raf = 0, timer = 0, drag = null, sel = null, chart = [], simT = 0;
  const geo = () => { const w = cv.clientWidth, h = cv.clientHeight, s = Math.min((w - 70) / (COLS - 1), (h - 70) / (ROWS - 1)); return { s, ox: (w - s * (COLS - 1)) / 2, oy: (h - s * (ROWS - 1)) / 2 }; };
  const nodeXY = (n) => { const g = geo(); return [g.ox + (n % COLS) * g.s, g.oy + Math.floor(n / COLS) * g.s]; };
  const edgeMid = (e) => { const [a, b] = ends(e).map(nodeXY); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const allEdges = () => { const out = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (c < COLS - 1) out.push(`h,${c},${r}`); if (r < ROWS - 1) out.push(`v,${c},${r}`); } return out; };
  const nearestEdge = (x, y) => { let best = null, bd = 1e9; allEdges().forEach((e) => { const [mx, my] = edgeMid(e), d = Math.hypot(mx - x, my - y); if (d < bd) { bd = d; best = e; } }); return bd < geo().s * 0.45 ? best : null; };
  const done = (id) => !!data().cw.solved[id];
  const unlocked = (i) => CF.P.trial() || i === 0 || done(LABS[i - 1].id);
  const used = (type) => cur.parts.filter((p) => p.type === type && !p.fixed).length;
  const left = (type) => (cur.sandbox ? 99 : (cur.lab.pal[type] || 0) - used(type));

  function load(i) {
    const L = i === 'sandbox' ? { id: 'sandbox', lv: '自由', title: '自由搭建', goal: '没有题目，随便搭。可以用全部已解锁的元件，电路照样实时计算。', fixed: [], pal: {}, know: '试试：同一个电池，接一个灯泡和接两个并联的灯泡，电流表读数有什么不同？', bridge: '真正的电子工程师也是这样——先在仿真里试，再动手焊板子。', hint: '元件不限量。' } : LABS[i];
    cur = { i, lab: L, sandbox: i === 'sandbox', parts: L.fixed.map((p) => Object.assign({ val: p.type === 'resistor' ? 100 : p.type === 'battery' ? 6 : p.type === 'cap' ? 0.001 : undefined, on: p.type === 'switch' ? false : undefined }, p)), quiz: false, st: {} };
    if (cur.sandbox) cur.parts = (data().cw.sandbox || []).map((p) => Object.assign({}, p));
    chart = []; simT = 0; sel = null;
    C.renderSide(); C.renderTray();
  }
  // 在「测试场景」里修改开关等状态后重新求解（用于检查开关逻辑），不影响玩家看到的电路
  const T = (mut, test) => { const ps = cur.parts.map((p) => Object.assign({}, p, { dOn: undefined })); mut(ps); solve(ps); return test(ps); };

  C.check = function () {
    const r = solve(cur.parts);
    if (r.short) return CF.toast('短路了！电池两端被导线直接连通，电流极大——真实电路会发热甚至起火。', 'bad', 3600);
    if (cur.sandbox) return CF.toast('自由搭建没有标准答案——看看电表读数是不是和你算的一样？');
    const ok = cur.lab.check(cur.parts, T, cur.st);
    if (!ok) { CF.Audio.sfx('error'); return CF.toast('还没达到目标。点「提示」看看思路。', 'bad'); }
    if (cur.lab.quiz && !cur.quiz) return C.quiz();
    C.win();
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
      const got = C.add({ chip: 200 + cur.i * 40, corp: 120 + cur.i * 20, comp: 20 + cur.i * 5 });
      CF.P.addXP({ type: 'p', amt: 12 + cur.i, dims: { zhi: 0.4 }, domain: 'emb', label: '电路工坊' });
      CF.modal.open({ title: `实验完成 · ${L.title}`, body: `<p style="line-height:1.8">✅ ${L.goal}</p><div class="explain"><b>高中：</b>${L.know}<br><b>大学：</b>${L.bridge}</div><p class="small" style="margin-top:8px">奖励：晶片 +${got.chip} · 语料 +${got.corp} · 算力 +${got.comp} · 电网多了一台发电机组（每小时 +30 晶片）</p>`, foot: [{ text: '留在这里', cls: 'ghost' }].concat(cur.i < LABS.length - 1 ? [{ text: '下一个实验 ▶', cls: 'primary', onClick: () => { CF.modal.close(); load(cur.i + 1); } }] : []) });
    } else CF.toast('实验完成！（已领取过奖励）', 'gold');
    C.renderSide(); C.renderTop();
  };

  C.enter = function () {
    const sc = $('#scr-city');
    sc.innerHTML = `<div class="cw"><div class="cw-top"><button class="glass hb" id="cwBack" title="返回大厅">←</button><div class="cw-title"><b>电路工坊</b><span class="small">从高中电路图到大学电路 · 学习不消耗体力</span></div><div class="glass cw-res" id="cwRes"></div></div>
      <div class="cw-main"><div class="cw-list" id="cwList"></div><div class="cw-board"><canvas id="cwCanvas"></canvas><div class="glass cw-pop hidden" id="cwPop"></div></div><div class="cw-side" id="cwSide"></div></div>
      <div class="glass cw-tray" id="cwTray"></div></div>`;
    cv = $('#cwCanvas'); ctx = cv.getContext('2d');
    $('#cwBack').onclick = () => CF.UI.show('lobby');
    C.tick(); C.renderTop(); C.renderList();
    const firstOpen = LABS.findIndex((l, i) => unlocked(i) && !done(l.id));
    load(firstOpen < 0 ? 0 : firstOpen);
    C.bindBoard();
    C.resize();
    cancelAnimationFrame(raf); let last = performance.now();
    const loop = (now) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; C.step(dt); C.render(); };
    raf = requestAnimationFrame(loop);
    clearInterval(timer); timer = setInterval(() => { C.tick(); C.renderTop(); }, 5000);
  };
  C.leave = function () { cancelAnimationFrame(raf); clearInterval(timer); if (cur && cur.sandbox) data().cw.sandbox = cur.parts.map((p) => ({ e: p.e, type: p.type, val: p.val, on: p.on, flip: p.flip })); CF.Save.save(); };
  C.resize = function () { if (!cv) return; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  C.renderTop = function () {
    const el = $('#cwRes'); if (!el) return;
    const r = C.storage(), rt = C.rate(), st = data().cw.stock;
    el.innerHTML = `<span class="c-chip">◆ ${Math.floor(r.chip)}</span><span class="c-corp">◆ ${Math.floor(r.corp)}</span><span class="c-comp">◆ ${Math.floor(r.comp)}</span><span class="small">电网 ${solvedN()} 台机组 · 每小时 +${rt.chip}${plantMul() > 1 ? ` · 发电厂加成 ×${plantMul().toFixed(1)}` : ''}</span><button class="btn sm primary" id="cwCollect" ${st.chip >= 1 ? '' : 'disabled'}>收取 ${Math.floor(st.chip)}</button><button class="btn sm" id="cwBoost">⚡ 加速 ×${CF.Save.data.boosts || 0}</button>`;
    $('#cwCollect').onclick = C.collect; $('#cwBoost').onclick = C.boost;
  };
  C.renderList = function () {
    const el = $('#cwList'); el.innerHTML = '';
    LABS.forEach((L, i) => { const b = CF.h(`<button class="cw-lab ${done(L.id) ? 'done' : ''} ${unlocked(i) ? '' : 'locked'} ${cur && cur.i === i ? 'on' : ''}"><span class="lv lv-${L.lv}">${L.lv}</span><b>${i + 1}. ${L.title}</b>${done(L.id) ? '<i>✓</i>' : ''}</button>`); b.onclick = () => { if (!unlocked(i)) return CF.toast('先完成上一个实验', 'bad'); CF.Audio.sfx('click'); load(i); C.renderList(); }; el.appendChild(b); });
    const sb = CF.h(`<button class="cw-lab ${cur && cur.sandbox ? 'on' : ''}"><span class="lv lv-自由">自由</span><b>自由搭建</b></button>`); sb.onclick = () => { load('sandbox'); C.renderList(); }; el.appendChild(sb);
  };
  C.renderSide = function () {
    const L = cur.lab, el = $('#cwSide');
    el.innerHTML = `<div class="t-tag">${L.lv === '高中' ? 'HIGH SCHOOL' : L.lv === '衔接' ? 'BRIDGE' : L.lv === '大学' ? 'UNIVERSITY' : 'SANDBOX'} · ${L.lv}</div><h3>${L.title}</h3><p class="cw-goal">${L.goal}</p><div class="cw-know"><b>高中</b>${L.know}</div><div class="cw-know uni"><b>大学</b>${L.bridge}</div><div id="cwRead" class="cw-read"></div><div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn sm primary" id="cwCheck">检查</button><button class="btn sm" id="cwHint">提示</button><button class="btn sm ghost" id="cwReset">重置</button></div>${L.rc ? '<canvas id="cwChart" class="cw-chart"></canvas>' : ''}`;
    $('#cwCheck').onclick = C.check; $('#cwHint').onclick = () => CF.modal.open({ title: '提示', body: `<p style="line-height:1.8">${L.hint}</p>`, foot: [{ text: '好的', cls: 'primary' }] }); $('#cwReset').onclick = () => { load(cur.i); };
  };
  C.renderTray = function () {
    const el = $('#cwTray'); el.innerHTML = '';
    const types = cur.sandbox ? Object.keys(PARTS) : Object.keys(cur.lab.pal);
    if (!types.length) el.appendChild(CF.h('<span class="small muted">这个实验不需要放元件——直接点电路板上的开关。</span>'));
    types.forEach((t) => {
      const n = left(t), b = CF.h(`<button class="cw-part ${n > 0 ? '' : 'na'}" data-t="${t}"><span class="ic">${PARTS[t].ic}</span><span>${PARTS[t].name}</span><span class="c">${cur.sandbox ? '∞' : '×' + n}</span></button>`);
      b.addEventListener('pointerdown', (e) => { if (left(t) <= 0) return CF.toast('这个元件用完了', 'bad'); e.preventDefault(); drag = { type: t, x: e.clientX, y: e.clientY, from: null, val: t === 'resistor' ? (cur.lab.id === 'k7' ? 200 : 100) : t === 'battery' ? 6 : t === 'cap' ? 0.001 : undefined }; C.dragMove(e); });
      el.appendChild(b);
    });
  };
  // 拖拽（沿用沉浸模式的「虚影 + 吸附」写法：吸附到最近的边，可放为绿、被占为红）
  C.bindBoard = function () {
    const local = (e) => { const r = CF.appRect(cv), p = CF.appPoint(e.clientX, e.clientY); return [p.x - r.left, p.y - r.top]; };
    C.dragMove = (e) => { if (!drag) return; drag.x = e.clientX; drag.y = e.clientY; const [x, y] = local(e); drag.lx = x; drag.ly = y; drag.edge = nearestEdge(x, y); drag.ok = drag.edge && !cur.parts.some((p) => p.e === drag.edge); };
    window.addEventListener('pointermove', (e) => { if (drag) C.dragMove(e); });
    window.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag; drag = null; C.dragMove(e);
      const moved = d.from && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8;
      if (moved) { cur.parts.push(d.from); C.openPop(d.from); return; }
      const [x, y] = local(e), e2 = nearestEdge(x, y);
      if (e2 && !cur.parts.some((p) => p.e === e2)) { cur.parts.push(Object.assign(d.from || { type: d.type, val: d.val, on: d.type === 'switch' ? true : undefined }, { e: e2, fixed: false })); CF.Audio.sfx('place'); C.renderTray(); }
      else if (d.from) { cur.parts.push(d.from); }
    });
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = local(e), e2 = nearestEdge(x, y), p = e2 && cur.parts.find((q) => q.e === e2);
      C.closePop();
      if (!p) return;
      if (p.fixed) { C.openPop(p); return; }
      cur.parts = cur.parts.filter((q) => q !== p); drag = { from: p, type: p.type, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY }; C.dragMove(e);
    });
  };
  C.openPop = function (p) {
    const pop = $('#cwPop'), [x, y] = edgeMid(p.e), D = PARTS[p.type], btns = [];
    if (p.type === 'switch') btns.push([p.on ? '断开' : '闭合', () => { p.on = !p.on; if (cur.lab.rc && p.on) { cur.st.rcStart = simT; chart = []; } }]);
    if (D.vals && !p.fixed) btns.push(['换值', () => { const i = D.vals.indexOf(p.val); p.val = D.vals[(i + 1) % D.vals.length]; }]);
    if (D.polar && !p.fixed) btns.push(['翻转极性', () => { p.flip = !p.flip; p.dOn = undefined; }]);
    if (!p.fixed) btns.push(['拿走', () => { cur.parts = cur.parts.filter((q) => q !== p); C.renderTray(); }]);
    if (!btns.length) { CF.toast(`${p.label || D.name}（题目给定，不能改动）`); return; }
    pop.innerHTML = `<b>${p.label || D.name}${p.val !== undefined && !p.hidden ? ' · ' + fmtVal(p) : ''}</b>`; btns.forEach(([n, fn]) => { const b = CF.h(`<button class="btn sm">${n}</button>`); b.onclick = () => { fn(); CF.Audio.sfx('click'); C.closePop(); }; pop.appendChild(b); });
    pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop.classList.remove('hidden');
  };
  C.closePop = () => { const p = $('#cwPop'); if (p) p.classList.add('hidden'); };
  const fmtVal = (p) => (p.type === 'cap' ? `${p.val * 1e6} μF` : p.type === 'resistor' ? (p.val >= 1000 ? p.val / 1000 + ' kΩ' : p.val + ' Ω') : p.val + ' V');
  const fmtI = (i) => (Math.abs(i) < 1 ? (Math.abs(i) * 1000).toFixed(1) + ' mA' : Math.abs(i).toFixed(2) + ' A');

  // 每帧：电容时间推进 + LED 烧毁判定 + 读数
  C.step = function (dt) {
    if (!cur) return;
    const steps = cur.lab.rc ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      const r = solve(cur.parts, 0.02); cur.short = r.short;
      cur.parts.forEach((p) => { if (p.type === 'cap') p.vc = p.vcNext; if (p.type === 'led' && p.I > 0.03 && !p.burnt) { p.burnt = true; CF.Audio.sfx('error'); CF.toast('LED 烧坏了！电流超过 30 mA。拿掉它旁边的电阻换个更大的，再点「重置」。', 'bad', 3600); } });
      simT += 0.02;
    }
    if (cur.lab.rc) { const c = cur.parts.find((p) => p.type === 'cap'); if (cur.st.rcStart !== undefined) { chart.push([simT - cur.st.rcStart, c.vc || 0]); if (chart.length > 400) chart.shift(); if (simT - cur.st.rcStart > 3) cur.st.rcDone = true; } C.drawChart(); }
    const rd = $('#cwRead');
    if (rd && Math.floor(simT * 5) !== cur._rt) { cur._rt = Math.floor(simT * 5); rd.innerHTML = cur.parts.filter((p) => ['ammeter', 'voltmeter', 'bulb', 'led', 'cap'].includes(p.type)).map((p) => `<span>${p.label || PARTS[p.type].name}：${p.type === 'voltmeter' || p.type === 'cap' ? Math.abs(p.type === 'cap' ? p.vc || 0 : p.V).toFixed(2) + ' V' : p.type === 'led' && p.burnt ? '已烧坏' : fmtI(p.I)}</span>`).join('') + (cur.short ? '<span style="color:#ff5d6c">⚠ 短路</span>' : ''); }
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
    const hl = drag && drag.edge;
    allEdges().forEach((e) => { const [a, b] = ends(e).map(nodeXY); ctx.strokeStyle = e === hl ? (drag.ok ? '#6fdc8c' : '#ff5d6c') : '#ffffff10'; ctx.lineWidth = e === hl ? 4 : 2; ctx.setLineDash(e === hl ? [] : [3, 5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
    ctx.setLineDash([]); ctx.lineWidth = 1;
    if (cur.lab.slot && !cur.parts.some((p) => p.e === cur.lab.slot)) { const [mx, my] = edgeMid(cur.lab.slot); ctx.strokeStyle = `rgba(255,177,74,${0.5 + beat * 0.5})`; ctx.strokeRect(mx - 14, my - 22, 28, 44); ctx.fillStyle = '#ffb14a'; ctx.font = '11px sans-serif'; ctx.fillText('R₃ ?', mx + 16, my); }
    cur.parts.forEach((p) => drawPart(p, g.s, t));
    // 节点
    for (let n = 0; n < COLS * ROWS; n++) { const [x, y] = nodeXY(n); ctx.fillStyle = '#c9d4ff'; ctx.fillRect(x - 3, y - 3, 6, 6); }
    // 拖拽中的虚影
    if (drag) { const pos = drag.edge ? edgeMid(drag.edge) : [drag.lx, drag.ly]; ctx.globalAlpha = 0.75; drawPart({ type: drag.type, e: drag.edge || 'h,0,0', val: drag.val, ghost: true, at: drag.edge ? null : pos, I: 0 }, g.s, t); ctx.globalAlpha = 1; }
    if (cur.short) { ctx.fillStyle = `rgba(255,93,108,${0.08 + 0.06 * Math.sin(t * 10)})`; ctx.fillRect(0, 0, w, h); }
  };
  function drawPart(p, s, t) {
    let [a, b] = ends(p.e).map(nodeXY);
    if (p.at) { const half = s / 2; a = [p.at[0] - half, p.at[1]]; b = [p.at[0] + half, p.at[1]]; }
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.min(1, s / 80);
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
