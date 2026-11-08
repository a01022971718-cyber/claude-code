// 检查「具身智能 · 造一台机器人」的课程数据（v9.4）：接线两端接口存在且类型一致、每个接口都用到、零件不重叠、
// 选择题有且只有一个正确选项、小测答案有效、分类都有对应的类、调参至少有一组解、全景表引用的关卡存在。
// 用法：node tools/check-embodied.mjs
import fs from 'node:fs';
const window = { CF: {} };
new Function('window', fs.readFileSync(new URL('../js/embodied-data.js', import.meta.url), 'utf8'))(window);
const D = window.CF.EmbData, errs = [], ids = new Set();
D.STAGES.forEach((s) => s.levels.forEach((l) => {
  if (ids.has(l.id)) errs.push('重复的关卡号 ' + l.id); ids.add(l.id);
  if (!l.learn || !l.learn.length) errs.push(l.id + ' 没有知识卡');
  if (!['点', '线', '面', '体'].includes(l.lv)) errs.push(l.id + ' 层级不对');
  (l.quiz || []).forEach((q) => { if (!(q.a >= 0 && q.a < q.o.length)) errs.push(l.id + ' 小测答案越界'); });
  if (l.kind === 'choice') l.qs.forEach((q, i) => { if (q.o.filter((o) => o[1]).length !== 1) errs.push(`${l.id} 第 ${i + 1} 题正确选项不是 1 个`); });
  if (l.kind === 'sort') l.cards.forEach((c) => { if (!l.bins.some((b) => b[0] === c[1])) errs.push(l.id + ' 没有这个类 ' + c[1]); });
  if (l.kind === 'wire') {
    const P = {}, used = new Set(), pos = new Set();
    l.nodes.forEach((nd) => { const k = nd.col + ',' + nd.row; if (pos.has(k)) errs.push(l.id + ' 零件重叠 ' + nd.id); pos.add(k); nd.p.forEach((p) => { P[nd.id + '.' + p[0]] = p; if (!D.TYPES[p[2]]) errs.push(l.id + ' 未知类型 ' + p[2]); if (!(l.types || []).includes(p[2])) errs.push(l.id + ' 图例缺 ' + p[2]); }); });
    l.edges.forEach(([a, b]) => { if (!P[a] || !P[b]) return errs.push(`${l.id} 接口不存在 ${a} / ${b}`); if (P[a][2] !== P[b][2]) errs.push(`${l.id} 类型不一致 ${a} / ${b}`); [a, b].forEach((x) => { if (used.has(x)) errs.push(l.id + ' 接口用了两次 ' + x); used.add(x); }); });
    Object.keys(P).forEach((k) => { if (!used.has(k)) errs.push(l.id + ' 多余的接口 ' + k); });
  }
  if (l.kind === 'tune' && l.model) {
    const grids = l.ctrl.map((c) => (c.seg ? c.seg.map((x) => x[0]) : Array.from({ length: Math.round((c.max - c.min) / c.step) + 1 }, (_, i) => +(c.min + i * c.step).toFixed(4))));
    let ok = 0; const rec = (i, v) => { if (i === grids.length) { if (l.model(v).every((m) => !m[3] || m[2])) ok++; return; } grids[i].forEach((x) => rec(i + 1, Object.assign({}, v, { [l.ctrl[i].id]: x }))); };
    rec(0, {}); if (!ok) errs.push(l.id + ' 调参无解');
  }
}));
[...D.MAP.hw, ...D.MAP.sw].flatMap((r) => r[2]).forEach((id) => { if (!ids.has(id)) errs.push('全景表引用了不存在的关卡 ' + id); });
console.log(`关卡 ${ids.size} 个，问题 ${errs.length} 个`); errs.forEach((e) => console.log('  ' + e)); process.exit(errs.length ? 1 : 0);
