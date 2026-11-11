// 检查「具身智能 · 造机器人」的课程数据（v9.4 起，v9.5 加赛道）：
// 接线两端接口存在且类型一致、每个接口都用到、零件不重叠；选择题有且只有一个正确选项、小测答案有效；分类都有对应的类；
// 调参：每一轮都有解（网格搜索）、写好的 sol 能过关、初始值不能直接过关、上一轮的解不能直接过下一轮；
// 全景表 / 同原理表 / 赛道前置关引用的关卡都存在；关卡号、阶段号、赛道号不重复。
// 用法：node tools/check-embodied.mjs
import fs from 'node:fs';
const window = { CF: {} };
for (const f of ['embodied-data.js', 'embodied-tracks.js']) new Function('window', fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8'))(window);
const D = window.CF.EmbData, errs = [], ids = new Set(), sids = new Set(), tids = new Set();
const passes = (l, v, r) => l.model(v, r).every((m) => !m[3] || m[2]);
const grid = (c) => (c.seg ? c.seg.map((x) => x[0]) : Array.from({ length: Math.round((c.max - c.min) / c.step) + 1 }, (_, i) => +(c.min + i * c.step).toFixed(4)));
const init = (l) => Object.fromEntries(l.ctrl.map((c) => [c.id, c.seg ? String(c.v) : c.v]));
const str = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' && !Number.isInteger(x) ? x : x]));
D.TRACKS.forEach((t) => {
  if (tids.has(t.id)) errs.push('重复的赛道号 ' + t.id); tids.add(t.id);
  ['name', 'short', 'icon', 'robot', 'color', 'sum'].forEach((k) => { if (!t[k]) errs.push(`赛道 ${t.id} 缺 ${k}`); });
  t.stages.forEach((s) => { if (sids.has(s.id)) errs.push('重复的阶段号 ' + s.id); sids.add(s.id); s.levels.forEach((l) => {
  if (ids.has(l.id)) errs.push('重复的关卡号 ' + l.id); ids.add(l.id);
  if (!l.learn || !l.learn.length) errs.push(l.id + ' 没有知识卡');
  if (!['点', '线', '面', '体'].includes(l.lv)) errs.push(l.id + ' 层级不对');
  (l.quiz || []).forEach((q) => { if (!(q.a >= 0 && q.a < q.o.length)) errs.push(l.id + ' 小测答案越界'); });
  if (l.kind === 'choice') l.qs.forEach((q, i) => { if (q.o.filter((o) => o[1]).length !== 1) errs.push(`${l.id} 第 ${i + 1} 题正确选项不是 1 个`); });
  if (l.kind === 'sort') l.cards.forEach((c) => { if (!l.bins.some((b) => b[0] === c[1])) errs.push(l.id + ' 没有这个类 ' + c[1]); });
  if (l.kind === 'order' && (!l.steps || l.steps.length < 3)) errs.push(l.id + ' 工序太少');
  if (l.kind === 'wire') {
    const P = {}, used = new Set(), pos = new Set();
    l.nodes.forEach((nd) => { const k = nd.col + ',' + nd.row; if (pos.has(k)) errs.push(l.id + ' 零件重叠 ' + nd.id); pos.add(k); nd.p.forEach((p) => { P[nd.id + '.' + p[0]] = p; if (!D.TYPES[p[2]]) errs.push(l.id + ' 未知类型 ' + p[2]); if (!(l.types || []).includes(p[2])) errs.push(l.id + ' 图例缺 ' + p[2]); }); });
    (l.types || []).forEach((t2) => { if (!l.nodes.some((nd) => nd.p.some((p) => p[2] === t2))) errs.push(l.id + ' 图例多了 ' + t2); });
    l.edges.forEach(([a, b]) => { if (!P[a] || !P[b]) return errs.push(`${l.id} 接口不存在 ${a} / ${b}`); if (P[a][2] !== P[b][2]) errs.push(`${l.id} 类型不一致 ${a} / ${b}`); [a, b].forEach((x) => { if (used.has(x)) errs.push(l.id + ' 接口用了两次 ' + x); used.add(x); }); });
    Object.keys(P).forEach((k) => { if (!used.has(k)) errs.push(l.id + ' 多余的接口 ' + k); });
    (l.swap || []).forEach((G) => { if (G.some((k) => !P[k])) errs.push(l.id + ' 互换组里有不存在的接口'); else if (new Set(G.map((k) => P[k][2])).size > 1) errs.push(l.id + ' 互换组里接口类型不一致'); });
  }
  if (l.kind === 'tune') {
    if (!l.sol) errs.push(l.id + ' 调参关没写 sol');
    if (l.model) {
      const R = l.rounds ? l.rounds.length : 1, gs = l.ctrl.map(grid);
      if (l.rounds && (!Array.isArray(l.sol) || l.sol.length !== R)) errs.push(l.id + ' 多轮关的 sol 要按轮写成数组');
      for (let r = 0; r < R; r++) {
        let ok = 0; const rec = (i, v) => { if (i === gs.length) { if (passes(l, v, r)) ok++; return; } gs[i].forEach((x) => rec(i + 1, Object.assign({}, v, { [l.ctrl[i].id]: x }))); };
        rec(0, {}); if (!ok) errs.push(`${l.id} 第 ${r + 1} 轮调参无解`);
        const sol = Array.isArray(l.sol) ? l.sol[r] : l.sol;
        if (sol && !passes(l, Object.assign(init(l), str(sol)), r)) errs.push(`${l.id} 第 ${r + 1} 轮 sol 过不了`);
        const before = r === 0 ? init(l) : Object.assign(init(l), str(l.sol[r - 1]));
        if (passes(l, before, r)) errs.push(`${l.id} 第 ${r + 1} 轮一开始就已经过关了`);
      }
    }
  }
}); }); });
D.TRACKS.forEach((t) => { if (t.req && !ids.has(t.req[0])) errs.push(`赛道 ${t.id} 的前置关不存在 ${t.req[0]}`); if (t.map) [...t.map.hw, ...t.map.sw].flatMap((r) => r[2]).forEach((id) => { if (!ids.has(id)) errs.push(`赛道 ${t.id} 全景表引用了不存在的关卡 ${id}`); }); });
const pr = new Set(); D.PRINCIPLES.forEach((p) => { if (pr.has(p.id)) errs.push('重复的原理 ' + p.id); pr.add(p.id); if (p.ids.length < 2) errs.push('原理 ' + p.id + ' 只出现在一关'); p.ids.forEach((id) => { if (!ids.has(id)) errs.push(`同原理「${p.n}」引用了不存在的关卡 ${id}`); }); if (new Set(p.ids.map((id) => (/^[A-Z]/.test(id) ? id[0] : 'M'))).size < 2) errs.push(`同原理「${p.n}」只在一条赛道里`); });
const per = D.TRACKS.map((t) => `${t.short} ${t.stages.reduce((a, s) => a + s.levels.length, 0)}`).join('、');
console.log(`赛道 ${D.TRACKS.length} 条（${per}），关卡 ${ids.size} 个，同原理 ${D.PRINCIPLES.length} 组，问题 ${errs.length} 个`); errs.forEach((e) => console.log('  ' + e)); process.exit(errs.length ? 1 : 0);
