/* AI 助手 · 总调度（v9.6）
 * - 接口配置（profiles）：可以存好几套，随时切换。Key 不存在存档里，由 CF.AINet 单独保管（见 js/ai-net.js）。
 * - 预设：Claude 官方（官方 SDK）+ 国内外常见的「兼容接口」平台 + 本机 Ollama + 自己写模板。
 *   预设里的默认模型名只是起点，平台会更新，以平台文档为准；设置页有「测试连接」「获取模型列表」。
 * - 模式（mode）：学习导师 / 代码助手 / 鼓励教练 / 模组工匠 / 自由聊天，每种一段系统提示词。
 * - 「让助手了解我的进度」：把存档里的进度摘要（不含任何 Key）附在系统提示词后面。
 * - 对话保存在本机 IndexedDB（zy-ai），不上传。发出去的只有你发给所选 AI 平台的那一轮内容。 */
(function () {
  const CF = window.CF;
  const A = (CF.AI = {});
  const S = () => { const d = CF.Save.data; d.ai = d.ai || {}; const a = d.ai; a.profiles = a.profiles || []; a.mode = a.mode || 'tutor'; if (a.ctx == null) a.ctx = true; a.effort = a.effort || 'medium'; if (a.web == null) a.web = false; return a; };
  A.state = S;

  A.PRESETS = [
    { k: 'claude', name: 'Claude（Anthropic 官方）', format: 'claude', baseURL: '', model: 'claude-opus-5-5', site: 'https://platform.claude.com/', keyHint: '在 Claude 开发者平台的 API Keys 页面创建，以 sk-ant- 开头' },
    { k: 'deepseek', name: 'DeepSeek 深度求索', format: 'compat', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', site: 'https://platform.deepseek.com/' },
    { k: 'qwen', name: '通义千问（阿里云百炼）', format: 'compat', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', site: 'https://bailian.console.aliyun.com/' },
    { k: 'kimi', name: 'Kimi（月之暗面）', format: 'compat', url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', site: 'https://platform.moonshot.cn/' },
    { k: 'glm', name: '智谱 GLM', format: 'compat', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', site: 'https://open.bigmodel.cn/' },
    { k: 'doubao', name: '豆包（火山方舟）', format: 'compat', url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: '', modelHint: '填方舟控制台里的模型 ID 或接入点 ID', site: 'https://console.volcengine.com/ark' },
    { k: 'silicon', name: '硅基流动 SiliconFlow', format: 'compat', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3', site: 'https://cloud.siliconflow.cn/' },
    { k: 'openrouter', name: 'OpenRouter（一个 Key 用多家模型）', format: 'compat', url: 'https://openrouter.ai/api/v1/chat/completions', model: '', modelHint: '以网站上的模型列表为准', site: 'https://openrouter.ai/' },
    { k: 'openai', name: 'OpenAI', format: 'compat', url: 'https://api.openai.com/v1/chat/completions', model: '', modelHint: '以 OpenAI 文档里的模型名为准', site: 'https://platform.openai.com/' },
    { k: 'ollama', name: '本机 Ollama（电脑上的开源模型，免费）', format: 'compat', url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5:7b', noKey: true, site: 'https://ollama.com/' },
    { k: 'custom', name: '自己写模板（任意「发 JSON、回 JSON」的接口）', format: 'custom', url: '', method: 'POST', headers: '{\n  "Authorization": "Bearer {{key}}"\n}', body: '{\n  "model": "{{model}}",\n  "messages": {{messages}}\n}', path: 'choices.0.message.content', model: '' },
  ];
  A.newProfile = function (k) {
    const pre = A.PRESETS.find((x) => x.k === k) || A.PRESETS[0], id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    return Object.assign({ id, maxTokens: pre.format === 'claude' ? 64000 : '', temperature: '', stream: true, fallback: true, vision: true }, JSON.parse(JSON.stringify(pre)), { id });
  };
  A.profiles = () => S().profiles;
  A.active = () => S().profiles.find((p) => p.id === S().active) || S().profiles[0] || null;
  A.endpoint = (p) => (p.format === 'claude' ? p.baseURL || 'https://api.anthropic.com' : p.url || '');
  A.ready = () => { const p = A.active(); return !!(p && (p.noKey || p.format === 'custom' || CF.AINet.hasKey(p.id)) && (p.format === 'claude' || p.url) && (p.model || p.format === 'custom')); };
  A.saveProfile = function (p, key) {
    const a = S(), i = a.profiles.findIndex((x) => x.id === p.id);
    if (i >= 0) a.profiles[i] = p; else a.profiles.push(p);
    if (!a.active) a.active = p.id;
    if (key) CF.AINet.setKey(p.id, A.endpoint(p), key);
    CF.Save.save();
  };
  A.removeProfile = function (id) { const a = S(); a.profiles = a.profiles.filter((p) => p.id !== id); CF.AINet.clearKey(id); if (a.active === id) a.active = a.profiles[0] ? a.profiles[0].id : null; CF.Save.save(); };

  // ---------- 模式与系统提示词 ----------
  const BASE = `你是游戏《造月之路》里的 AI 助手。这个游戏把「学 AI、具身智能、航空航天、创业」做成可以边玩边学的关卡。
你面对的玩家：高中毕业、编程基本不会、在做 996 工作，目标是从零成长为 AI + 具身智能 + 航空航天方向的专家，以后创业。
说话规则：
- 用简体中文，先说结论，再解释；每个专业词第一次出现时，先给直觉和生活里的比方，再给术语。
- 区分事实、推测和建议；不确定就直说「我不确定」，不编造数据、出处、链接、人名和事件。涉及最新信息（价格、模型名、法规）提醒玩家以官方最新为准。
- 发现玩家的想法有问题，友善而直接地指出，并给出可以马上做的下一步。
- 回复用 Markdown。代码放进带语言名的代码块。想给玩家看效果时，写一个完整的单文件 HTML（放进 \`\`\`html 代码块），玩家点「运行」就能在安全沙盒里看到。
- 涉及健康、法律、钱的大事，说明关键条件和风险，建议找专业人士。玩家情绪很差、出现伤害自己的念头时，温和地建议马上联系身边的人或专业帮助（例如全国统一心理援助热线 12356）。`;
  A.MODES = [
    { id: 'tutor', name: '学习导师', icon: '🎓', desc: '一步一步教，先问你懂到哪', prompt: `现在的角色：学习导师。
- 先用一两个问题弄清玩家已经懂什么，再从他会的地方往前讲；一次只讲一个点，讲完出一道小题检查。
- 由浅入深：点 → 线 → 面 → 体（先一个概念，再连成链，再成系统，最后整体）。
- 玩家问题目答案时，先给提示、让他自己想一步；他再要，才给完整答案和讲解。
- 能用游戏里的关卡练的，告诉他去哪一关（实验室「具身智能」、学院题库、电路工坊、AI 学徒课）。`, quick: ['用高中生能懂的话讲讲：大模型是怎么「想」出下一句话的？', '我想学具身智能，零基础，第一个月每天 1 小时该学什么？', '出 3 道关于 PID 控制的小题考考我'] },
    { id: 'code', name: '代码助手', icon: '💻', desc: '写代码、讲代码、找 bug', prompt: `现在的角色：代码助手，对面是编程新手。
- 写代码前先用一句话说思路；代码要短、能直接运行，关键行加中文注释。
- 能在浏览器里跑的例子，写成完整的单文件 HTML（\`\`\`html），玩家点「运行」就能看到效果。
- 玩家贴报错时：先用人话解释错误是什么意思，再说最可能的原因，最后给改法。
- 不要一次给太多；问玩家要不要继续加功能。`, quick: ['写一个网页小程序：点按钮，数字加一，并且有好看的动画', '解释一下这段代码每一行在干什么（我会贴代码）', '我学 Python 第一周，给我 5 个能马上动手的小练习'] },
    { id: 'coach', name: '鼓励教练', icon: '🔥', desc: '根据你真实的进度鼓励你', prompt: `现在的角色：鼓励教练。目标是让玩家有信心、有斗志，但不说空话、不吹捧。
- 鼓励要基于事实：引用玩家进度摘要里真实做到的事（通关了哪些、坚持了几天），说清楚「这说明你已经会了什么」。
- 承认辛苦：996 之后还在学是真实的难。累的时候建议「今天只做最小的一步」，休息也是训练的一部分。
- 用成长型思维的说法：「还没学会」不等于「学不会」；卡住说明在学新东西。
- 每次最后给一个 10 分钟内能完成的具体行动。
- 不编造名人故事和名言；要讲别人的经历，只讲公开、可查证的，并说明年份。`, quick: ['我今天下班很累，还要不要学？', '我觉得自己起点太低了，真的有可能做到吗？', '根据我现在的进度，夸夸我真实做到的事，再给我一个今天的小目标'] },
    { id: 'maker', name: '模组工匠', icon: '🧩', desc: '帮你给游戏做新内容、新功能', prompt: `现在的角色：模组工匠。你帮玩家给《造月之路》做「模组」：新题目、新课程、新的鼓励话语、新的水彩小游戏、脚本模组，或者需要改源代码的「改动提案」。
- 先确认玩家想要什么（一两个问题就够），再动手。
- 做出来的模组必须放在一个 \`\`\`zaoyue-mod 代码块里，内容是一个 JSON 对象，严格按下面的模板和规则写；JSON 里不要有注释。
- 一个回复里最多放一个模组。写完后用两三句话说明它会加什么、怎么用。
- 优先用安全的类型（知识包、课程包、鼓励包、水彩小游戏）；只有玩家明确要求改游戏本身的行为时，才写脚本模组，并在说明里讲清楚它会做什么。
- 新功能的画面用水彩画风（下面有工具包的用法），和游戏里的「勇气手账」「AI 学徒」一致。
- 如果玩家把「校验没通过」的错误发给你，按错误逐条修改，再给出完整的新版本。`, quick: ['帮我做一个知识包：5 道关于「电池和能量」的题，高中难度', '做一个水彩小游戏：点星星连成北斗七星，连对了给 3 星', '帮我做一个鼓励包：10 句适合 996 下班后看的鼓励话'] },
    { id: 'chat', name: '自由聊天', icon: '💬', desc: '什么都可以聊', prompt: '现在的角色：自由聊天。正常回答玩家的任何问题，保持上面的说话规则。', quick: ['帮我把今天想学的东西排个计划', '给我讲一个和航天有关的冷知识，要真实的', '用一个比方解释什么是 API'] },
  ];
  A.mode = (id) => A.MODES.find((m) => m.id === (id || S().mode)) || A.MODES[0];
  A.system = function (modeId) {
    const m = A.mode(modeId);
    return BASE + '\n\n' + m.prompt + (m.id === 'maker' && CF.Mods ? '\n\n' + CF.Mods.spec() : '');
  };

  // ---------- 玩家进度摘要（只读存档，不含 Key） ----------
  A.context = function () {
    const d = CF.Save.data, P = CF.P, L = [];
    try {
      const r = P.rank(); L.push(`军衔：${r.name}，总经验 ${r.xp}（知识 ${d.xp.knowledge} / 实操 ${d.xp.practice}）`);
      L.push(`连续学习：${(d.streak && d.streak.count) || 0} 天（最长 ${(d.streak && d.streak.best) || 0} 天）`);
      const q = d.quiz || {}; const wrongBook = Object.values(q.seen || {}).filter((x) => x.w > x.c).length;
      L.push(`学院答题：答对 ${q.correct || 0}，答错 ${q.wrong || 0}，错题本 ${wrongBook} 题`);
      L.push(`实验室完成：${P.labsDoneCount()} / ${P.LABS.length}`);
      if (CF.Emb && CF.EmbData && CF.EmbData.TRACKS) {
        const st = (d.emb && d.emb.lv) || {};
        L.push('具身智能：' + CF.EmbData.TRACKS.map((t) => { const ids = t.stages.flatMap((s) => s.levels.map((l) => l.id)); return `${t.short} ${ids.filter((x) => st[x]).length}/${ids.length}`; }).join('，'));
      }
      if (CF.AICourse) L.push('AI 学徒课：' + CF.AICourse.progress());
      if (CF.Courage) { const c = CF.Courage.summary(); if (c) L.push(c); }
      if (CF.Mods) { const ms = CF.Mods.list().filter((m) => m.on); if (ms.length) L.push('已装模组：' + ms.map((m) => m.name).join('、')); }
      L.push('现在打开的页面：' + ((CF.UI && CF.UI.cur) || '大厅'));
    } catch (e) { L.push('（进度读取失败）'); }
    return '【玩家进度摘要（来自游戏存档，真实数据）】\n- ' + L.join('\n- ');
  };

  // ---------- 发送 ----------
  // conv.messages 里最后一条是用户的新消息；返回一条助手消息对象
  A.send = async function (conv, { signal, on, modeId } = {}) {
    const p = A.active(); if (!p) throw Object.assign(new Error('还没有设置接口'), { code: 'noprofile' });
    const a = S(), sys = A.system(modeId || conv.mode), dyn = a.ctx ? A.context() : '';
    const opts = { effort: a.effort, web: !!a.web && p.format === 'claude' };
    const msg = { role: 'assistant', text: '', thinking: '', sources: [], searches: [], notes: [], prov: { format: p.format, model: p.model, pid: p.id }, t: Date.now() };
    const hooks = {
      text: (d) => { msg.text += d; on && on(msg, 'text'); }, thinking: (d) => { msg.thinking += d; on && on(msg, 'thinking'); },
      search: (q) => { msg.searches.push(q); on && on(msg, 'search'); }, sources: (l) => { l.forEach((s) => { if (!msg.sources.some((x) => x.url === s.url)) msg.sources.push(s); }); on && on(msg, 'sources'); },
      note: (s) => { msg.notes.push(s); on && on(msg, 'note'); },
    };
    try {
      if (p.format === 'claude') {
        const r = await CF.AIClaude.chat({ profile: p, system: sys, dynamic: dyn, messages: conv.messages, opts, signal, on: hooks });
        msg.raw = r.raw; msg.usage = r.usage; msg.stop = r.stop; msg.prov.model = r.model || p.model;
        if (!msg.text) msg.text = r.raw.filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (r.stop === 'refusal') msg.notes.push('模型拒绝回答了这个请求' + (r.refusal ? '（' + r.refusal + '）' : '') + '。可以换个说法，或换一个模型。');
        if (r.stop === 'max_tokens') msg.notes.push('回答被「最大长度」截断了，可以在设置里调大，或者让它「接着写」。');
      } else {
        const r = await (p.format === 'custom' ? CF.AICompat.custom : CF.AICompat.chat)({ profile: p, system: sys, dynamic: dyn, messages: conv.messages, signal, on: hooks });
        msg.usage = r.usage; msg.stop = r.stop;
        if (r.stop === 'length') msg.notes.push('回答被「最大长度」截断了。');
      }
    } catch (err) {
      const aborted = (CF.AIClaude && CF.AIClaude.aborted(err)) || (err && err.name === 'AbortError');
      msg.prov.partial = true;
      if (!aborted) msg.error = CF.AINet.explain(err, (CF.AIClaude && CF.AIClaude.statusOf(err)) || err.status);
      else msg.notes.push('已停止。');
      if (!aborted && !msg.text) throw Object.assign(err, { friendly: msg.error });
    }
    return msg;
  };
  // 给别的模块用的「问一句」：不进对话列表
  A.ask = async function (text, { modeId = 'chat', extra = '', signal } = {}) {
    const conv = { mode: modeId, messages: [{ role: 'user', parts: [{ t: 'text', text: extra ? extra + '\n\n' + text : text }] }] };
    const m = await A.send(conv, { signal, modeId });
    return m.text;
  };
  A.test = async function (p) { return p.format === 'claude' ? CF.AIClaude.test(p) : CF.AICompat.test(p); };
  A.listModels = async function (p) { if (p.format === 'claude') { const r = await CF.AIClaude.test(p); return r.models; } return CF.AICompat.listModels(p); };

  // ---------- 对话存储（IndexedDB，失败时退回内存） ----------
  const mem = {}; let dbp = null;
  const db = () => dbp || (dbp = new Promise((res) => { try { const r = indexedDB.open('zy-ai', 1); r.onupgradeneeded = () => r.result.createObjectStore('convs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }));
  const tx = async (mode, fn) => { const d = await db(); if (!d) { const o = fn(null); return o && o.result !== undefined ? o.result : o; } return new Promise((res) => { const t = d.transaction('convs', mode), st = t.objectStore('convs'), out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => res(null); }); };
  A.store = {
    async list() { const all = await tx('readonly', (st) => (st ? st.getAll() : { result: Object.values(mem) })); return (all || []).sort((a, b) => b.updated - a.updated); },
    async get(id) { return tx('readonly', (st) => (st ? st.get(id) : { result: mem[id] })); },
    async put(c) { c.updated = Date.now(); return tx('readwrite', (st) => (st ? st.put(JSON.parse(JSON.stringify(c))) : (mem[c.id] = c))); },
    async del(id) { return tx('readwrite', (st) => (st ? st.delete(id) : delete mem[id])); },
  };
  A.newConv = (modeId) => ({ id: 'c' + Date.now().toString(36), title: '新对话', mode: modeId || S().mode, messages: [], created: Date.now(), updated: Date.now() });
})();
