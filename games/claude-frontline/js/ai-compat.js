/* AI 助手 · 其他厂商接口（v9.6，主创要求「API 是自定义的，玩家可以写自己的 API 来调用不同模型」）
 * 这里不是 Claude：Claude 走 js/ai-claude.js（官方 SDK）。这里接两类：
 * 1) 「兼容接口」：国内外大多数平台都提供的 Chat Completions 格式（POST …/chat/completions，Authorization: Bearer Key，
 *    回复是 choices[0].message.content；流式是一行行的 data: {...}）。DeepSeek、通义千问、Kimi、智谱、豆包、硅基流动、
 *    OpenRouter、OpenAI、本机 Ollama 都可以用这一种。
 * 2) 「自己写模板」：地址、请求头、请求体都自己填，用 {{key}} {{model}} {{messages}} {{system}} {{prompt}} 占位，
 *    再告诉它回复里的文字在哪个路径（例如 choices.0.message.content）。只要是「发 JSON、回 JSON」的接口都能接。 */
(function () {
  const CF = window.CF;
  const X = (CF.AICompat = {});

  function toCompat(system, list, imgOk) {
    const out = system ? [{ role: 'system', content: system }] : [];
    list.forEach((m) => {
      if (m.role === 'user') {
        let txt = (m.parts || []).filter((p) => p.t === 'text').map((p) => p.text).join('\n');
        (m.parts || []).filter((p) => p.t === 'file').forEach((p) => (txt = `【附件：${p.name}】\n${p.text}\n\n` + txt));
        if ((m.parts || []).some((p) => p.t === 'pdf')) txt += '\n（附带的 PDF 这个接口读不了，已略过）';
        const imgs = (m.parts || []).filter((p) => p.t === 'image');
        if (imgs.length && imgOk) out.push({ role: 'user', content: [{ type: 'text', text: txt || '请看图' }].concat(imgs.map((p) => ({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}` } }))) });
        else out.push({ role: 'user', content: txt + (imgs.length ? '\n（附带的图片这个接口不支持，已略过）' : '') });
      } else if (m.role === 'assistant' && m.text) out.push({ role: 'assistant', content: m.text });
    });
    return out;
  }
  const fail = async (res) => { let t = ''; try { t = await res.text(); } catch (e) { /* */ } let msg = t; try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error.msg || j.error)) || j.message || j.msg || t; } catch (e) { /* 不是 JSON */ } const err = new Error(typeof msg === 'string' ? msg.slice(0, 400) : JSON.stringify(msg).slice(0, 400)); err.status = res.status; return err; };
  const headers = (p) => { const h = { 'Content-Type': 'application/json' }, key = CF.AINet.keyFor(p.id); if (key) { if (p.authHeader && p.authHeader !== 'Authorization') h[p.authHeader] = key; else h.Authorization = 'Bearer ' + key; } return h; };

  X.chat = async function ({ profile: p, system, dynamic, messages, signal, on }) {
    const body = { model: p.model, messages: toCompat(system + (dynamic ? '\n\n' + dynamic : ''), messages, p.vision !== false), stream: p.stream !== false };
    if (+p.maxTokens) body.max_tokens = +p.maxTokens;
    if (p.temperature !== '' && p.temperature != null && !isNaN(+p.temperature)) body.temperature = +p.temperature;
    const res = await CF.AINet.fetch(p.url, { method: 'POST', headers: headers(p), body: JSON.stringify(body), signal });
    if (!res.ok) throw await fail(res);
    let text = '', usage = null, stop = '';
    if (!body.stream) {
      const j = await res.json(), c = (j.choices && j.choices[0]) || {};
      const r = c.message && (c.message.reasoning_content || c.message.reasoning); if (r) on.thinking(r);
      text = (c.message && c.message.content) || ''; on.text(text); stop = c.finish_reason || ''; usage = j.usage || null;
    } else {
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (data === '[DONE]') continue;
          let j; try { j = JSON.parse(data); } catch (e) { continue; }
          if (j.error) { const err = new Error(j.error.message || JSON.stringify(j.error)); err.status = 400; throw err; }
          const c = (j.choices && j.choices[0]) || {}, d = c.delta || {};
          const r = d.reasoning_content || d.reasoning; if (r) on.thinking(r);   // DeepSeek 推理模型等会给「思考过程」
          if (d.content) { text += d.content; on.text(d.content); }
          if (c.finish_reason) stop = c.finish_reason;
          if (j.usage) usage = j.usage;
        }
      }
    }
    return { text, stop, usage: usage ? { in: usage.prompt_tokens || 0, out: usage.completion_tokens || 0 } : null, model: p.model };
  };

  // ---------- 自己写模板 ----------
  const jstr = (s) => JSON.stringify(String(s == null ? '' : s)).slice(1, -1);
  const pick = (obj, path) => String(path || '').split('.').filter(Boolean).reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? +k : k]), obj);
  X.fill = function (tpl, p, system, messages) {
    const msgs = toCompat(system, messages, false), last = [...messages].reverse().find((m) => m.role === 'user');
    const prompt = last ? (last.parts || []).filter((x) => x.t === 'text').map((x) => x.text).join('\n') : '';
    return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (k === 'messages' ? JSON.stringify(msgs) : k === 'key' ? jstr(CF.AINet.keyFor(p.id)) : k === 'model' ? jstr(p.model) : k === 'system' ? jstr(system) : k === 'prompt' ? jstr(prompt) : '{{' + k + '}}'));
  };
  X.custom = async function ({ profile: p, system, dynamic, messages, signal, on }) {
    const sys = system + (dynamic ? '\n\n' + dynamic : '');
    let h = {}; try { h = JSON.parse(X.fill(p.headers || '{}', p, sys, messages)); } catch (e) { throw new Error('「请求头」不是合法的 JSON：' + e.message); }
    const bodyStr = X.fill(p.body || '', p, sys, messages); try { JSON.parse(bodyStr); } catch (e) { throw new Error('「请求体」填好占位以后不是合法的 JSON：' + e.message); }
    const res = await CF.AINet.fetch(p.url, { method: p.method || 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: bodyStr, signal });
    if (!res.ok) throw await fail(res);
    const j = await res.json(), text = pick(j, p.path || 'choices.0.message.content');
    if (typeof text !== 'string') throw new Error(`按路径「${p.path}」在回复里没找到文字。回复的开头是：${JSON.stringify(j).slice(0, 200)}`);
    on.text(text);
    return { text, stop: '', usage: null, model: p.model };
  };

  X.test = async function (p) {
    const on = { text() {}, thinking() {}, search() {}, sources() {}, note() {} };
    const msgs = [{ role: 'user', parts: [{ t: 'text', text: '只回复两个字：你好' }] }];
    const r = await (p.format === 'custom' ? X.custom : X.chat)({ profile: Object.assign({}, p, { maxTokens: p.format === 'custom' ? p.maxTokens : 64 }), system: '', messages: msgs, on });
    return { ok: true, models: [], msg: `连上了，模型回复：「${String(r.text).slice(0, 40)}」` };
  };
  X.listModels = async function (p) {
    const u = String(p.url || '').replace(/\/chat\/completions\/?$/, '/models');
    if (u === p.url) return [];
    const res = await CF.AINet.fetch(u, { headers: headers(p) }); if (!res.ok) return [];
    const j = await res.json(); return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).slice(0, 200);
  };
})();
