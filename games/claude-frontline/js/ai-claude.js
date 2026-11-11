/* AI 助手 · Claude 接口（v9.6）：用 Anthropic 官方 SDK（js/vendor/anthropic-sdk.min.js，window.AnthropicSDK）。
 * - 流式输出：client.beta.messages.stream(...)，一边收一边显示，最后用 finalMessage() 拿完整回复；
 * - 思考：当前一代模型用自适应思考 thinking: {type: 'adaptive', display: 'summarized'}（显示思考摘要），
 *   深浅由 output_config.effort 控制（快速 low / 平衡 medium / 深入 high）；老模型不发这两个参数；
 * - 联网搜索（可选）：服务器端工具 web_search；搜索太久会以 pause_turn 暂停，原样把已有内容发回去让服务器接着做；
 * - 拒答兜底：官方接口 + 支持的模型（Fable 5.2 / 5.1、Opus 5.5 / 5、Sonnet 5.5）默认开启 fallbacks: 'default'
 *   （beta server-side-fallback-2026-07-01），被安全分类器拒绝时服务器自动换模型接着答；设置里可以关掉；
 * - 历史：Claude 的回复原样保存（含思考块），下次同一个对话继续时原样发回（思考块绑定模型和对话，不能改）。
 * - 不发 temperature 等采样参数（新版接口已移除）。网络走 CF.AINet.fetch（安卓里走原生桥，Key 不进网页）。 */
(function () {
  const CF = window.CF;
  const C = (CF.AIClaude = {});
  const CURRENT = /^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|haiku-5|fable|mythos)/;   // 支持自适应思考 + effort 的一代
  const FALLBACK = /^claude-(fable-5-[12]|opus-5-5|opus-5|sonnet-5-5)$/;              // 支持服务器端拒答兜底
  const SEARCH_NEW = /^claude-(fable|mythos|opus-(5|4-[678])|sonnet-(5|4-6))/;          // 支持 web_search_20260209
  C.MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5（默认：聪明、写代码强）'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5（更快、更省）'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5（最快、最便宜）'],
    ['claude-fable-5-2', 'Claude Fable 5.2（最强，也最贵）'],
  ];
  const official = (p) => !p.baseURL || /(^|\/\/)api\.anthropic\.com/.test(p.baseURL);
  function client(p) {
    if (!window.AnthropicSDK) throw new Error('没有加载 Anthropic SDK');
    return new window.AnthropicSDK({ apiKey: CF.AINet.keyFor(p.id) || 'missing-key', baseURL: p.baseURL || undefined, dangerouslyAllowBrowser: true, fetch: CF.AINet.fetch, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }
  // 我们的消息 → Claude 的内容块
  function toClaude(list) {
    const out = [];
    list.forEach((m) => {
      if (m.role === 'user') {
        const content = [];
        (m.parts || []).forEach((pt) => {
          if (pt.t === 'image') content.push({ type: 'image', source: { type: 'base64', media_type: pt.mime, data: pt.data } });
          else if (pt.t === 'pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pt.data }, title: pt.name });
          else if (pt.t === 'file') content.push({ type: 'text', text: `【附件：${pt.name}】\n${pt.text}` });
        });
        const txt = (m.parts || []).filter((pt) => pt.t === 'text').map((pt) => pt.text).join('\n');
        if (txt) content.push({ type: 'text', text: txt });
        if (content.length) out.push({ role: 'user', content });
      } else if (m.role === 'assistant') {
        if (m.raw && m.prov && m.prov.format === 'claude' && !m.prov.partial) out.push({ role: 'assistant', content: m.raw });   // 原样发回，思考块不能改
        else if (m.text) out.push({ role: 'assistant', content: [{ type: 'text', text: m.text }] });
      }
    });
    return out;
  }
  C.statusOf = (err) => (window.AnthropicSDK && err instanceof window.AnthropicSDK.APIError ? err.status : undefined);
  C.aborted = (err) => !!(err && (err.name === 'AbortError' || (window.AnthropicSDK && err instanceof window.AnthropicSDK.APIUserAbortError)));

  // 发一轮对话。on: { text(d), thinking(d), search(query), sources(list), note(s) }
  C.chat = async function ({ profile: p, system, dynamic, messages, opts, signal, on }) {
    const cl = client(p), model = p.model || 'claude-opus-5-5', cur = CURRENT.test(model);
    let msgs = toClaude(messages);
    const params = { model, max_tokens: +p.maxTokens || 64000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }].concat(dynamic ? [{ type: 'text', text: dynamic }] : []) };
    if (cur) { params.thinking = { type: 'adaptive', display: 'summarized' }; params.output_config = { effort: opts.effort || 'medium' }; }
    if (opts.web) params.tools = [{ type: SEARCH_NEW.test(model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 5 }];
    if (official(p) && p.fallback !== false && FALLBACK.test(model)) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    const raw = [], usage = { in: 0, out: 0, cacheR: 0, cacheW: 0 }; let final = null;
    for (let turn = 0; turn < 5; turn++) {
      const stream = cl.beta.messages.stream(Object.assign({}, params, { messages: msgs }), { signal });
      const toolInput = {};
      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          const b = ev.content_block;
          if (b.type === 'server_tool_use') toolInput[ev.index] = '';
          else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) on.sources(b.content.filter((r) => r.type === 'web_search_result').map((r) => ({ title: r.title, url: r.url })));
          else if (b.type === 'fallback' && b.to) on.note(`前一个模型拒绝回答，已由 ${b.to.model} 接着回答。`);
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta;
          if (d.type === 'text_delta') on.text(d.text);
          else if (d.type === 'thinking_delta') on.thinking(d.thinking);
          else if (d.type === 'input_json_delta' && toolInput[ev.index] != null) toolInput[ev.index] += d.partial_json;
        } else if (ev.type === 'content_block_stop' && toolInput[ev.index] != null) {
          try { const q = JSON.parse(toolInput[ev.index] || '{}').query; if (q) on.search(q); } catch (e) { /* 不完整的输入：不影响回答 */ }
          delete toolInput[ev.index];
        }
      }
      final = await stream.finalMessage();
      raw.push(...final.content);
      const u = final.usage || {}; usage.in += u.input_tokens || 0; usage.out += u.output_tokens || 0; usage.cacheR += u.cache_read_input_tokens || 0; usage.cacheW += u.cache_creation_input_tokens || 0;
      if (final.stop_reason !== 'pause_turn') break;
      msgs = msgs.concat([{ role: 'assistant', content: final.content }]);   // 搜索没做完：原样发回，服务器接着做（不加「继续」）
    }
    const out = { raw, usage, stop: final.stop_reason, model: final.model };
    if (final.stop_reason === 'refusal') out.refusal = final.stop_details ? `${final.stop_details.category || ''} ${final.stop_details.explanation || ''}`.trim() : '';
    return out;
  };

  // 测试连接：先列模型（不花钱）；列不了再发一句很短的话
  C.test = async function (p) {
    const cl = client(p);
    try { const page = await cl.models.list({ limit: 50 }); const ids = (page.data || []).map((m) => m.id); return { ok: true, models: ids, msg: `连上了，账户里能用 ${ids.length} 个模型${ids.includes(p.model) ? '，包括你选的 ' + p.model : ids.length ? '。注意：列表里没有你填的「' + p.model + '」' : ''}。` }; }
    catch (err) {
      if (C.statusOf(err) && C.statusOf(err) !== 404) throw err;
      const r = await cl.messages.create({ model: p.model, max_tokens: 512, messages: [{ role: 'user', content: '只回复两个字：你好' }] });
      return { ok: true, models: [], msg: '连上了（这个地址不支持列模型，用一句话测试成功，stop_reason = ' + r.stop_reason + '）。' };
    }
  };
})();
