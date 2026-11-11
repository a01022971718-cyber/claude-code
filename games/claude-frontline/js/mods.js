/* 扩展工坊 · 模组系统（v9.6，主创要求「助手可以参与 APP 所有功能的修改和增加：把模板写好放到里面，以后只要调用 API
 * 就能继续制作和更新，包括新的知识点、扩展延伸的内容和新功能」）
 * 一个模组 = 一个 JSON 对象（AI 助手的「模组工匠」模式按 CF.Mods.spec() 里的模板写，放在 ```zaoyue-mod 代码块里）。
 * 六种类型，按安全程度从高到低：
 *   knowledge 知识包   → 题目进学院题库（错题本、统计照常）、知识卡在工坊里读
 *   course    课程包   → 实验室「具身智能」多一条赛道（选择 / 分类 / 工序 / 接线四种玩法），可登记同原理
 *   cheer     鼓励包   → 勇气手账里多一些鼓励话和「他们也失败过」的故事（故事必须写出处）
 *   minigame  水彩小游戏 → 在隔离沙盒里运行：读不到存档和 Key、不能联网；自带水彩工具包 ZYWC 和接口 ZY
 *   script    脚本模组  → 在游戏页面里直接运行，能改任何功能；安装前必须看过代码并确认；可随时关掉；有安全模式
 *   proposal  改动提案  → 需要改源代码的大改动：只保存、可导出成说明文档，交给开发工具（例如 Claude Code）去改
 * 安全：课程包的文字安装时全部转义（只保留 <b> 和 <br>）；知识包、鼓励包显示时转义。所以内容包里写的 HTML / 脚本不会执行。
 * 安全模式：网址加 ?safe=1，或上次启动时脚本模组让游戏卡住了，就不运行任何脚本模组（其他模组照常）。
 * 存储：本机 localStorage「zy-mods」（和游戏存档分开，模组再多也不会挤爆存档）。 */
(function () {
  const CF = window.CF;
  const M = (CF.Mods = {});
  const KEY = 'zy-mods', BOOT = 'zy-mods-booting', MAX = 200 * 1024;
  const TYPES = {
    knowledge: { name: '知识包', icon: '📚', safe: 3, desc: '新题目进学院题库，附知识卡' },
    course: { name: '课程包', icon: '🦾', safe: 3, desc: '具身智能实验室多一条赛道' },
    cheer: { name: '鼓励包', icon: '🌱', safe: 3, desc: '勇气手账里的鼓励话和真实故事' },
    minigame: { name: '水彩小游戏', icon: '🎨', safe: 2, desc: '在隔离沙盒里运行的小游戏' },
    script: { name: '脚本模组', icon: '⚙️', safe: 0, desc: '直接改游戏功能（需要确认）' },
    proposal: { name: '改动提案', icon: '📝', safe: 3, desc: '需要改源代码的大改动，导出给开发工具' },
  };
  M.TYPES = TYPES;
  const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); j.mods = j.mods || []; return j; } catch (e) { return { mods: [] }; } };
  let DB = load();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; } catch (e) { CF.toast && CF.toast('本机空间不够，模组没存上', 'bad'); return false; } };
  M.list = () => DB.mods.map((m) => ({ id: m.id, type: m.type, name: m.name, version: m.version, author: m.author, desc: m.desc, on: m._on !== false, at: m._at, consent: !!m._ok }));
  M.get = (id) => DB.mods.find((m) => m.id === id) || null;
  M.safeMode = () => /[?&]safe=1/.test(location.search) || !!M._crashed;

  // ---------- 文字清洗：内容包里的文字全部转义，只保留 <b> 和 <br> ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s) => esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>').replace(/&lt;br\s*\/?&gt;/g, '<br>');
  const deepClean = (v, skip) => (typeof v === 'string' ? clean(v) : Array.isArray(v) ? v.map((x) => deepClean(x, skip)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !(skip || []).includes(k)).map(([k, x]) => [k, deepClean(x, skip)])) : v);

  // ---------- 校验 ----------
  const str = (v, min, max) => typeof v === 'string' && v.trim().length >= (min || 1) && v.length <= (max || 4000);
  const builtinIds = () => { const ids = new Set(); if (CF.EmbData) CF.EmbData.TRACKS.forEach((t) => { ids.add('track:' + t.id); t.stages.forEach((s) => { ids.add('stage:' + s.id); s.levels.forEach((l) => ids.add(l.id)); }); }); return ids; };
  function checkLevel(l, E, T, ids) {
    const at = '关卡 ' + (l && l.id);
    if (!l || !str(l.id, 1, 24)) return E.push('有一关没有 id（1–24 个字符）');
    if (ids.has(l.id)) E.push(at + '：id 和已有的关卡重复'); ids.add(l.id);
    if (!str(l.name, 1, 40)) E.push(at + '：name 要写（40 字以内）');
    if (!['点', '线', '面', '体'].includes(l.lv)) E.push(at + '：lv 只能是 点 / 线 / 面 / 体');
    if (!Array.isArray(l.learn) || !l.learn.length || l.learn.some((c) => !Array.isArray(c) || !str(c[0]) || !str(c[1]))) E.push(at + '：learn 至少一张知识卡，每张是 [标题, 讲解, 打个比方（可空）]');
    (l.quiz || []).forEach((q, i) => { if (!str(q.q) || !Array.isArray(q.o) || q.o.length < 2 || !(q.a >= 0 && q.a < q.o.length) || !str(q.why)) E.push(`${at}：第 ${i + 1} 道小测要有 q、o（至少 2 个选项）、a（正确选项下标）、why`); });
    if (l.kind === 'choice') { if (!Array.isArray(l.qs) || !l.qs.length) E.push(at + '：choice 要有 qs'); else l.qs.forEach((q, i) => { if (!str(q.q) || !Array.isArray(q.o) || q.o.length < 2) E.push(`${at}：第 ${i + 1} 题要有 q 和至少 2 个选项`); else if (q.o.filter((o) => Array.isArray(o) && o[1] === true).length !== 1) E.push(`${at}：第 ${i + 1} 题必须有且只有一个正确选项（选项写成 [文字, true/false, 为什么]）`); }); }
    else if (l.kind === 'sort') { if (!Array.isArray(l.bins) || l.bins.length < 2 || !Array.isArray(l.cards) || l.cards.length < 2) E.push(at + '：sort 要有至少 2 个 bins 和 2 张 cards'); else l.cards.forEach((c) => { if (!l.bins.some((b) => b[0] === c[1])) E.push(`${at}：卡片「${c[0]}」的类别 ${c[1]} 不在 bins 里`); }); if (!str(l.prompt)) E.push(at + '：要写 prompt（一句话说怎么玩）'); }
    else if (l.kind === 'order') { if (!Array.isArray(l.steps) || l.steps.length < 3 || l.steps.some((s) => !str(s[0]) || !str(s[1]))) E.push(at + '：order 要有至少 3 个 steps，每个是 [步骤, 为什么]'); if (!str(l.prompt)) E.push(at + '：要写 prompt'); }
    else if (l.kind === 'wire') {
      if (!str(l.prompt)) E.push(at + '：要写 prompt');
      const P = {}, used = new Set(), pos = new Set();
      (l.nodes || []).forEach((nd) => { const k = nd.col + ',' + nd.row; if (pos.has(k)) E.push(`${at}：零件 ${nd.id} 和别的零件位置重叠`); pos.add(k); (nd.p || []).forEach((p) => { P[nd.id + '.' + p[0]] = p; if (!['l', 'r', 't', 'b'].includes(p[1])) E.push(`${at}：接口 ${nd.id}.${p[0]} 的方向只能是 l / r / t / b`); if (!T[p[2]]) E.push(`${at}：接口类型 ${p[2]} 不存在（可以在 newTypes 里定义）`); if (!(l.types || []).includes(p[2])) E.push(`${at}：types 图例里缺 ${p[2]}`); }); });
      (l.edges || []).forEach(([a, b]) => { if (!P[a] || !P[b]) return E.push(`${at}：连线 ${a} ↔ ${b} 的接口不存在`); if (P[a][2] !== P[b][2]) E.push(`${at}：连线 ${a} ↔ ${b} 两头类型不一样`); [a, b].forEach((x) => { if (used.has(x)) E.push(`${at}：接口 ${x} 用了两次`); used.add(x); }); });
      Object.keys(P).forEach((k) => { if (!used.has(k)) E.push(`${at}：接口 ${k} 没有用到（每个接口都要有一根正确的线）`); });
      if (!(l.edges || []).length) E.push(at + '：wire 要有 edges');
    } else E.push(at + '：kind 只能是 choice / sort / order / wire（调参和遥操作需要写代码，请用脚本模组）');
  }
  M.validate = function (mod) {
    const E = [];
    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) return ['不是一个 JSON 对象'];
    if (!TYPES[mod.type]) E.push('type 只能是：' + Object.keys(TYPES).join(' / '));
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(mod.id || '')) E.push('id 要用 3–40 个小写英文字母、数字或短横线，例如 battery-quiz');
    if (!str(mod.name, 1, 40)) E.push('name（名字）要写，40 字以内');
    if (!str(mod.desc || '', 0, 300)) E.push('desc（一句话介绍）300 字以内');
    if (JSON.stringify(mod).length > MAX) E.push('模组太大（超过 200 KB），拆成几个');
    const t = mod.type;
    if (t === 'knowledge') {
      if (!Array.isArray(mod.questions) || !mod.questions.length || mod.questions.length > 60) E.push('questions 要有 1–60 道题');
      (mod.questions || []).forEach((q, i) => { if (!['ai', 'emb', 'aero', 'biz', 'whole'].includes(q.d)) E.push(`第 ${i + 1} 题：d 只能是 ai / emb / aero / biz / whole`); if (!str(q.q, 2, 300)) E.push(`第 ${i + 1} 题：q 题干要写`); if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 6 || q.o.some((o) => !str(String(o), 1, 200))) E.push(`第 ${i + 1} 题：o 要有 2–6 个选项`); else if (!(Number.isInteger(q.a) && q.a >= 0 && q.a < q.o.length)) E.push(`第 ${i + 1} 题：a 是正确选项的下标（从 0 开始）`); if (!str(q.e, 2, 800)) E.push(`第 ${i + 1} 题：e 讲解要写`); });
      (mod.cards || []).forEach((c, i) => { if (!str(c.title) || !str(c.body)) E.push(`第 ${i + 1} 张知识卡要有 title 和 body`); });
    } else if (t === 'course') {
      const tr = mod.track, ids = builtinIds(), T = Object.assign({}, CF.EmbData ? CF.EmbData.TYPES : {}, mod.newTypes || {});
      Object.entries(mod.newTypes || {}).forEach(([k, v]) => { if (!/^[A-Za-z0-9]{1,12}$/.test(k) || !Array.isArray(v) || !str(v[0]) || !/^#[0-9a-fA-F]{6}$/.test(v[1] || '')) E.push(`newTypes.${k} 要写成 ["名字", "#rrggbb", "一句说明"]`); });
      if (!tr || typeof tr !== 'object') E.push('course 要有 track');
      else {
        if (!/^[a-z][a-z0-9]{1,15}$/.test(tr.id || '')) E.push('track.id 用 2–16 个小写字母或数字，字母开头');
        if (ids.has('track:' + tr.id)) E.push('track.id 和已有赛道重复');
        ['name', 'short', 'icon', 'robot', 'blurb', 'sum'].forEach((k) => { if (!str(tr[k])) E.push('track.' + k + ' 要写'); });
        if (!/^#[0-9a-fA-F]{6}$/.test(tr.color || '')) E.push('track.color 写成 #rrggbb');
        if (tr.req && (!Array.isArray(tr.req) || !ids.has(tr.req[0]))) E.push('track.req 要写成 [已有关卡编号, 说明]，或者不写');
        if (!Array.isArray(tr.stages) || !tr.stages.length) E.push('track.stages 至少一个阶段');
        (tr.stages || []).forEach((s, i) => { if (!str(s.id) || ids.has('stage:' + s.id)) E.push(`第 ${i + 1} 个阶段：id 要写、不能和已有阶段重复`); ids.add('stage:' + s.id); if (!str(s.name) || !str(s.short) || !str(s.sum)) E.push(`第 ${i + 1} 个阶段：name、short、sum 要写`); if (!Number.isInteger(s.no)) E.push(`第 ${i + 1} 个阶段：no 写阶段序号（1、2、3…）`); if (!Array.isArray(s.levels) || !s.levels.length) E.push(`第 ${i + 1} 个阶段至少一关`); (s.levels || []).forEach((l) => checkLevel(l, E, T, ids)); });
        (mod.principles || []).forEach((p) => { if (!str(p.id) || !str(p.n) || !str(p.d) || !Array.isArray(p.ids) || p.ids.length < 2) E.push('principles 每一项要有 id、n、d 和至少 2 个关卡编号'); else p.ids.forEach((x) => { if (!ids.has(x)) E.push(`同原理「${p.n}」里的关卡 ${x} 不存在`); }); });
      }
    } else if (t === 'cheer') {
      if (!(mod.lines || []).length && !(mod.stories || []).length) E.push('cheer 至少要有 lines 或 stories');
      (mod.lines || []).forEach((l, i) => { if (!str(l.text, 2, 200)) E.push(`第 ${i + 1} 句：text 要写（200 字以内）`); if (l.mood && !['tired', 'anxious', 'lost', 'ok', 'fired', 'stuck', 'any'].includes(l.mood)) E.push(`第 ${i + 1} 句：mood 只能是 tired / anxious / lost / ok / fired / stuck / any`); });
      (mod.stories || []).forEach((s, i) => { ['who', 'year', 'title', 'text', 'lesson'].forEach((k) => { if (!str(String(s[k] || ''))) E.push(`第 ${i + 1} 个故事：${k} 要写`); }); if (!str(s.source || '', 4)) E.push(`第 ${i + 1} 个故事：source（出处）必须写，写不出出处的故事不要放`); });
    } else if (t === 'minigame') {
      if (!str(mod.js, 10, MAX)) E.push('minigame 要有 js（游戏代码）');
      if (mod.html != null && typeof mod.html !== 'string') E.push('html 要是字符串');
      if (mod.css != null && typeof mod.css !== 'string') E.push('css 要是字符串');
      (mod.learn || []).forEach((c, i) => { if (!Array.isArray(c) || !str(c[0]) || !str(c[1])) E.push(`第 ${i + 1} 张知识卡写成 [标题, 讲解, 打个比方]`); });
      if (/<\/script/i.test((mod.html || '') + (mod.js || ''))) E.push('代码里不要出现 </script>');
    } else if (t === 'script') {
      if (!str(mod.js, 5, MAX)) E.push('script 要有 js');
      else { try { new Function('CF', 'mod', mod.js); } catch (e) { E.push('js 有语法错误：' + e.message); } }
      if (!str(mod.what || '', 4)) E.push('what 要用一两句话写清楚这个脚本会改什么（安装前给玩家看）');
    } else if (t === 'proposal') {
      if (!str(mod.why)) E.push('proposal 要写 why（为什么要改）');
      if (!Array.isArray(mod.changes) || !mod.changes.length) E.push('proposal 要有 changes：[{ file, what, code（可选） }]');
    }
    return E;
  };
  M.parse = function (text) {
    let s = String(text || '').trim();
    const m = s.match(/```(?:zaoyue-mod|json)?\s*([\s\S]*?)```/); if (m) s = m[1].trim();
    try { return { mod: JSON.parse(s) }; } catch (e) { return { err: 'JSON 格式不对：' + e.message }; }
  };

  // ---------- 安装 / 卸载 / 开关 ----------
  M.install = function (mod, { consent } = {}) {
    const E = M.validate(mod); if (E.length) return { ok: false, errors: E };
    if (mod.type === 'script' && !consent) return { ok: false, errors: ['脚本模组要先看过代码、确认后才能装'] };
    let m = mod;
    if (mod.type === 'course') m = Object.assign(deepClean(mod, ['ctx']), { id: mod.id, type: mod.type });   // 课程引擎直接插 HTML：文字全部转义（学院和勇气手账显示时自己会转义）
    m = Object.assign({}, m, { _on: true, _at: Date.now(), _ok: mod.type === 'script' ? true : undefined });
    const old = M.get(m.id); if (old) M.unapply(old);
    DB.mods = DB.mods.filter((x) => x.id !== m.id).concat([m]);
    if (!persist()) return { ok: false, errors: ['本机空间不够'] };
    M.apply(m);
    CF.bus.emit('mods:changed');
    return { ok: true, replaced: !!old };
  };
  M.uninstall = function (id) { const m = M.get(id); if (!m) return; M.unapply(m); DB.mods = DB.mods.filter((x) => x.id !== id); persist(); CF.bus.emit('mods:changed'); };
  M.toggle = function (id, on) { const m = M.get(id); if (!m) return; m._on = !!on; persist(); if (on) M.apply(m); else M.unapply(m); CF.bus.emit('mods:changed'); };

  // ---------- 生效 ----------
  const applied = new Set();
  M.apply = function (m) {
    if (m._on === false || applied.has(m.id)) return;
    try {
      if (m.type === 'knowledge' && CF.Content) m.questions.forEach((q, i) => CF.Content.QUIZ.push({ id: `m:${m.id}:${i}`, d: q.d, q: q.q, o: q.o, a: q.a, e: q.e, mod: m.id }));
      else if (m.type === 'course' && CF.EmbData) {
        Object.assign(CF.EmbData.TYPES, m.newTypes || {});
        CF.EmbData.TRACKS.push(Object.assign(JSON.parse(JSON.stringify(m.track)), { mod: m.id, blurb: m.track.blurb + '（模组）' }));
        (m.principles || []).forEach((p) => CF.EmbData.PRINCIPLES.push(Object.assign({}, p, { mod: m.id })));
      } else if (m.type === 'script') {
        if (M.safeMode() || !m._ok) return;
        new Function('CF', 'mod', m.js)(CF, { id: m.id, name: m.name, version: m.version });
      }
      applied.add(m.id);
    } catch (e) { console.error('模组出错', m.id, e); CF.toast && CF.toast(`模组「${m.name}」出错，已跳过：${String(e.message).slice(0, 60)}`, 'bad', 4000); }
  };
  M.unapply = function (m) {
    if (!applied.has(m.id)) return; applied.delete(m.id);
    if (m.type === 'knowledge' && CF.Content) { const Q = CF.Content.QUIZ; for (let i = Q.length - 1; i >= 0; i--) if (Q[i].mod === m.id) Q.splice(i, 1); }
    else if (m.type === 'course' && CF.EmbData) { const T = CF.EmbData.TRACKS, P = CF.EmbData.PRINCIPLES; for (let i = T.length - 1; i >= 0; i--) if (T[i].mod === m.id) T.splice(i, 1); for (let i = P.length - 1; i >= 0; i--) if (P[i].mod === m.id) P.splice(i, 1); }
    else if (m.type === 'script') CF.toast && CF.toast('脚本模组已关闭：重新打开游戏后完全生效', '', 3000);
  };
  // 启动时调用（main.js）：先装内容包，最后跑脚本模组；脚本让游戏卡住的话，下次自动进安全模式
  M.boot = function () {
    if (localStorage.getItem(BOOT) === '1') { M._crashed = true; setTimeout(() => CF.toast && CF.toast('上次启动时有脚本模组出了问题：这次是安全模式，脚本模组没有运行。可以去「AI 助手 → 扩展工坊」关掉它', 'bad', 6000), 800); }
    DB.mods.filter((m) => m.type !== 'script').forEach(M.apply);
    const scripts = DB.mods.filter((m) => m.type === 'script' && m._on !== false);
    if (scripts.length && !M.safeMode()) { localStorage.setItem(BOOT, '1'); scripts.forEach(M.apply); setTimeout(() => localStorage.removeItem(BOOT), 4000); }
    else localStorage.removeItem(BOOT);
  };
  M.cheer = () => DB.mods.filter((m) => m.type === 'cheer' && m._on !== false).reduce((a, m) => ({ lines: a.lines.concat((m.lines || []).map((l) => Object.assign({ mod: m.name }, l))), stories: a.stories.concat((m.stories || []).map((s) => Object.assign({ mod: m.name }, s))) }), { lines: [], stories: [] });

  // ---------- 导入导出 ----------
  M.download = function (name, text, mime) {
    const file = name.replace(/[^\w.-]/g, '_');
    if (window.AndroidFiles && typeof AndroidFiles.save === 'function') return AndroidFiles.save(btoa(unescape(encodeURIComponent(text))), file);
    const u = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })), a = document.createElement('a'); a.href = u; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  M.exportOne = (id) => { const m = M.get(id); if (!m) return; const o = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('_'))); M.download(`zaoyue-mod-${m.id}.json`, JSON.stringify(Object.assign({ zaoyue: 1 }, o), null, 2)); };
  M.proposalMd = function (m) { return `# 改动提案：${m.name}\n\n> 由《造月之路》扩展工坊导出，${new Date(m._at || Date.now()).toLocaleString()}。这些改动需要改源代码：把这份文档交给开发工具（例如 Claude Code）或开发者。\n\n## 为什么\n\n${m.why}\n\n## 改哪里\n\n${m.changes.map((c, i) => `### ${i + 1}. ${c.file || '（未指明文件）'}\n\n${c.what || ''}\n${c.code ? '\n```\n' + c.code + '\n```\n' : ''}`).join('\n')}\n`; };

  // ---------- 隔离沙盒：水彩小游戏、助手代码预览共用 ----------
  // strict = true：不能联网（小游戏）；false：可以加载网上的脚本（助手写的预览）
  M.sandboxDoc = function ({ html, css, js, strict, kit }) {
    const csp = strict ? "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:" : "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'";
    const api = `var ZY=(function(){var P=function(m){parent.postMessage(Object.assign({__zy:1},m),'*')};var store=null,wait=[];addEventListener('message',function(e){if(e.data&&e.data.__zyLoad){store=e.data.data||{};wait.splice(0).forEach(function(f){f(store)})}});return{done:function(r){P({k:'done',stars:Math.max(1,Math.min(3,(r&&r.stars)|0||1)),msg:String((r&&r.msg)||'').slice(0,200)})},say:function(t){P({k:'say',text:String(t).slice(0,300)})},sfx:function(n){P({k:'sfx',name:String(n)})},save:function(o){var s=JSON.stringify(o||{});if(s.length<20000)P({k:'save',data:o})},load:function(f){if(store)f(store);else{wait.push(f);P({k:'load'})}},size:function(){return{w:innerWidth,h:innerHeight}}}})();window.onerror=function(m,s,l){parent.postMessage({__zy:1,k:'error',text:String(m)+' （第 '+l+' 行）'},'*')};`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#f6efe0;color:#2b2622;font-family:"KaiTi","STKaiti","Kaiti SC",serif;overflow:hidden}${css || ''}</style><script>${api}${kit === false ? '' : CF.WC.source()}<\/script></head><body>${html || ''}<script>${(js || '').replace(/<\/script/gi, '<\\/script')}<\/script></body></html>`;
  };

  // ---------- 给 AI 助手看的说明书（模组工匠模式的系统提示词会带上） ----------
  const EX = {
    knowledge: { zaoyue: 1, type: 'knowledge', id: 'battery-basics', name: '电池与能量 5 题', version: '1.0.0', author: 'AI 助手', desc: '高中难度，配合拾光号 1-4 关', questions: [{ d: 'emb', q: '一块 24V、10Ah 的电池，按 80% 可用，大约能放出多少能量？', o: ['80 Wh', '192 Wh', '240 Wh', '2400 Wh'], a: 1, e: '能量 = 电压 × 容量 = 24 × 10 = 240 Wh，只用 80% 就是 192 Wh。' }], cards: [{ title: '能量 = 电压 × 容量', body: '…', analogy: '…' }] },
    course: { zaoyue: 1, type: 'course', id: 'solar-car', name: '太阳能小车', version: '1.0.0', author: 'AI 助手', desc: '一条新赛道', newTypes: {}, track: { id: 'solar', name: '太阳能小车 · 向阳', short: '小车', icon: '🚗', robot: '向阳', color: '#e6b422', blurb: '一句话介绍', sum: '这条赛道讲什么（可以用 <br> 换行）', req: ['0-1', '先通关序章 0-1'], stages: [{ id: 'solar1', no: 1, name: '阶段名', short: '短名', sum: '一句说明', levels: [{ id: 'S1-1', name: '关名', lv: '点', kind: 'choice', learn: [['标题', '讲清楚的一段话', '打个比方']], qs: [{ q: '题干', o: [['选项 A', false, '为什么错'], ['选项 B', true, '为什么对'], ['选项 C', false, '为什么错']] }] }, { id: 'S1-2', name: '关名', lv: '线', kind: 'sort', learn: [['标题', '讲解', '比方']], prompt: '把每张卡放进对的类', bins: [['a', '类 A'], ['b', '类 B']], cards: [['卡片 1', 'a', '为什么'], ['卡片 2', 'b', '为什么']] }, { id: 'S1-3', name: '关名', lv: '面', kind: 'order', learn: [['标题', '讲解', '']], prompt: '按顺序排好（有一张是陷阱）', steps: [['第一步', '为什么'], ['第二步', '为什么'], ['第三步', '为什么']], extra: [['陷阱卡', '为什么不对']] }, { id: 'S1-4', name: '关名', lv: '体', kind: 'wire', learn: [['标题', '讲解', '']], prompt: '把零件连起来', types: ['m'], nodes: [{ id: 'a', n: '左边零件', col: 0, row: 0, p: [['o', 'r', 'm', '']], d: '点名字看的说明' }, { id: 'b', n: '右边零件', col: 1, row: 0, p: [['i', 'l', 'm', '']] }], edges: [['a.o', 'b.i', '为什么这样连']] }] }] }, principles: [{ id: 'solar-energy', n: '能量与余量', d: '一句话', ids: ['S1-1', '1-4'] }] },
    cheer: { zaoyue: 1, type: 'cheer', id: 'after-996', name: '下班后的鼓励', version: '1.0.0', author: 'AI 助手', desc: '10 句', lines: [{ text: '今天只学 10 分钟也算赢：重要的是没断。', mood: 'tired' }], stories: [{ who: '人物', year: '年份', title: '一句话标题', text: '发生了什么（只写公开可查的事实）', lesson: '和你有什么关系', source: '出处：公司官网 / 权威媒体 / 本人公开演讲，写清楚是哪一个' }] },
    minigame: { zaoyue: 1, type: 'minigame', id: 'big-dipper', name: '连出北斗七星', version: '1.0.0', author: 'AI 助手', desc: '按顺序点七颗星', learn: [['北斗七星', '在北方天空，像一把勺子。', '']], html: '<canvas id="c"></canvas>', css: 'canvas{display:block;width:100vw;height:100vh;touch-action:none}', js: "var W=ZY.size().w,H=ZY.size().h,c=document.getElementById('c'),g=ZYWC.fit(c,W,H);ZYWC.nightSky(g,W,H);ZY.say('从勺柄开始按顺序点');/* …游戏逻辑… */c.onclick=function(){ZY.sfx('correct');ZY.done({stars:3,msg:'连好了！'})};" },
    script: { zaoyue: 1, type: 'script', id: 'lobby-greeting', name: '大厅问候', version: '1.0.0', author: 'AI 助手', desc: '进大厅时打个招呼', what: '每次回到大厅时，左下角弹出一句问候（只用 CF.toast，不改存档）。', js: "CF.bus.on('screen', function (name) { if (name === 'lobby') CF.toast('欢迎回来！今天也往前走一小步。'); });" },
    proposal: { zaoyue: 1, type: 'proposal', id: 'battle-hint', name: '战斗里加提示', version: '1.0.0', author: 'AI 助手', desc: '需要改源码', title: '战斗里加提示', why: '为什么要改', changes: [{ file: 'js/ui.js', what: '在哪个函数里改什么', code: '（可选）新代码' }] },
  };
  M.TEMPLATES = EX;
  M.spec = function () {
    const T = CF.EmbData ? Object.keys(CF.EmbData.TYPES).join(', ') : '';
    return `# 《造月之路》模组说明书（写模组时严格遵守）
所有模组都是一个 JSON 对象，放在 \`\`\`zaoyue-mod 代码块里。公共字段：zaoyue: 1，type，id（3–40 个小写字母 / 数字 / 短横线），name（40 字内），version，author，desc（一句话）。
文字里不要写 HTML（只允许 <b>粗体</b> 和 <br> 换行），写了也会被原样显示成文字。

## 1. knowledge 知识包：题目进学院题库
questions：1–60 道题，每道 { d: 领域 ai|emb|aero|biz|whole, q: 题干, o: 2–6 个选项文字, a: 正确选项下标（从 0 开始）, e: 讲解 }。cards（可选）：[{ title, body, analogy }]。
题目要有唯一正确答案，讲解说清为什么，事实可查证。高中能懂。
示例：${JSON.stringify(EX.knowledge)}

## 2. course 课程包：具身智能实验室多一条赛道
track：{ id（小写字母开头）, name, short（2–4 字）, icon（一个 emoji）, robot（这条赛道造的机器的名字）, color（#rrggbb）, blurb, sum, req（可选：[已有关卡编号, 说明]）, stages：[{ id, no, name, short, sum, levels：[关卡…] }] }
每关：{ id（不能和已有关卡重复，建议用赛道字母开头，如 S1-1）, name, lv（点|线|面|体，一个阶段内大体按这个顺序）, kind, learn：[[标题, 讲解, 打个比方], …]（2–3 张）, quiz（可选）：[{ q, o: [选项…], a, why }] }。
kind 只能是：
- choice：qs：[{ q, o：[[选项文字, true/false, 为什么], …] }]，每题有且只有一个 true。
- sort：prompt，bins：[[键, 类名], …]，cards：[[卡片, 键, 为什么], …]。
- order：prompt，steps：[[步骤, 为什么], …]（按正确顺序写，至少 3 个），extra（可选）：[[陷阱卡, 为什么不对]]。
- wire：prompt，types（图例：用到的接口类型），nodes：[{ id, n 名字, col 列, row 行, p：[[接口id, 方向 l|r|t|b, 类型, 标签], …], d 说明 }]，edges：[[零件.接口, 零件.接口, 为什么这样连], …]。每个接口恰好连一根线，两头类型相同，零件位置不重叠。
  已有的接口类型：${T}。要新类型就在模组顶层写 newTypes：{ "键": ["名字", "#rrggbb", "一句说明"] }。
principles（可选）：[{ id, n, d, ids：[关卡编号…] }]，可以把新关和已有的关（如 1-3、D1-5）登记为同一个原理。
示例：${JSON.stringify(EX.course)}

## 3. cheer 鼓励包：勇气手账里用
lines：[{ text, mood: tired|anxious|lost|ok|fired|stuck|any }]。不说空话，说具体的、可以马上做的。
stories：[{ who, year, title, text, lesson, source }]。只写公开、可查证的真实经历；source 必须写清出处；查不到就不要写。
示例：${JSON.stringify(EX.cheer)}

## 4. minigame 水彩小游戏：在隔离沙盒里运行（读不到存档和 Key，不能联网）
字段：learn（可选，开始前的知识卡 [[标题, 讲解, 比方]]），html（body 里的内容），css，js。页面就是整个沙盒窗口，手机竖屏和横屏都要能玩（用 ZY.size() 拿宽高，点和拖都支持 pointer 事件）。
沙盒里能用：
- ZY.done({ stars: 1–3, msg }) 通关；ZY.say(文字) 在下方提示条显示；ZY.sfx('click'|'correct'|'error'|'unlock')；ZY.save(对象) / ZY.load(函数) 存这个小游戏自己的数据；ZY.size() 返回 {w, h}。
- 水彩工具包 ZYWC：fit(canvas, 宽, 高) 返回画笔 g；paper(g,w,h) 宣纸底；wash(g, 多边形, 颜色)；blob(g,x,y,r,颜色)；band(g,x,y,w,h,颜色)；bleed(g,x,y,r,色1,色2)；splatter(g,x,y,r,颜色)；ink(g, 点列, {width, color})；inkLine / inkCircle / inkRect / arrow；text(g, 文字, x, y, {size, align, color})；star(g,x,y,r,颜色,{dark:true 在夜空上})；moon(g,x,y,r,月相0–1)；nightSky(g,w,h)；cloud；sprout(g,x,y,高,长势0–1)；circle / rectPoly 生成多边形；seed(数字) 让随机可复现。
- 颜色只用 ZYWC.C 里的：${Object.keys(ZYWatercolorKit().C).join(', ')}。
- 画风：宣纸底 + 透明水彩 + 墨线勾边；静态背景画一次，动的东西少量重画。不要用 alert / prompt。
示例：${JSON.stringify(EX.minigame)}

## 5. script 脚本模组：直接改游戏（玩家要看过代码并确认才会装）
字段：what（一两句话说清楚会改什么），js（会以 new Function('CF', 'mod', js)(CF, mod) 的方式在游戏启动后运行）。
常用接口：CF.toast(文字)、CF.bus.on('screen'|'progress'|'modal:closed', 函数)、CF.modal.open({ title, body: 元素或 HTML, wide })、CF.h(HTML) 生成元素、CF.Save.data（存档，改了要 CF.Save.save()）、CF.UI.show(页面名)、CF.Labs、CF.EmbData、CF.Content.QUIZ、CF.WC（水彩工具包，同上）。
只做玩家要求的事；不要读写 localStorage 里和 AI 有关的键，不要发网络请求，不要删存档。
示例：${JSON.stringify(EX.script)}

## 6. proposal 改动提案：需要改源代码的大改动
字段：title，why，changes：[{ file: 文件路径, what: 改什么, code: 可选的代码 }]。只保存和导出，不会自动执行。
示例：${JSON.stringify(EX.proposal)}`;
  };
})();
