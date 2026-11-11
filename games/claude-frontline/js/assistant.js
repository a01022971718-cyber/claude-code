/* 全局 AI 助手（v9.6，主创要求「增加一个全局的 AI 助手：辅助学习、写代码……把聊天框有的能力都给它，只不过 API 是自定义的」）
 * 入口：任何页面右侧的悬浮「✦」（可拖动；战斗中隐藏），点开是一块独立的面板，不会关掉你正在玩的关卡或弹窗。
 * 面板版式按 UI 宪法第 28 章：页眉和普通弹窗一样（标题 + ✕），下面是标准左侧导航：对话 / 扩展工坊 / 接口设置 / 说明。
 * 对话能做的事：多轮对话、流式输出、停止、重新回答、编辑后重发、复制、朗读、发图片 / 文本文件 / PDF、联网搜索（Claude）、
 *   思考摘要、Markdown（标题、列表、表格、代码）、代码一键复制、HTML / JS / SVG 一键在隔离沙盒里运行、
 *   模组代码块一键预览 / 试玩 / 安装 / 让助手修正；对话列表（本机保存）、改名、删除、导出成 Markdown。 */
(function () {
  const CF = window.CF;
  const AS = (CF.Assistant = {});
  const esc = (s) => CF.esc(String(s == null ? '' : s));
  const A = () => CF.AI;
  let root = null, tab = 'chat', conv = null, busy = null, atts = [], editFrom = -1, raf = 0, stage = null, speaking = false;

  // ================= Markdown（安全：先转义，再加格式） =================
  function inl(s) {
    const codes = []; s = String(s).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<i>$2</i>').replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, k) => '<code>' + esc(codes[+k]) + '</code>');
  }
  function md(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n'), out = [], codes = []; let i = 0, para = [];
    const flush = () => { if (para.length) { out.push('<p>' + para.map(inl).join('<br>') + '</p>'); para = []; } };
    const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    while (i < lines.length) {
      const ln = lines[i], f = ln.match(/^\s*```\s*([\w+-]*)/);
      if (f) { flush(); const buf = []; let closed = false; i++; while (i < lines.length) { if (/^\s*```\s*$/.test(lines[i])) { closed = true; i++; break; } buf.push(lines[i]); i++; } codes.push({ lang: f[1].toLowerCase(), code: buf.join('\n'), closed }); out.push(`<!--code:${codes.length - 1}-->`); continue; }
      if (/^\s*$/.test(ln)) { flush(); i++; continue; }
      const h = ln.match(/^(#{1,6})\s+(.*)$/); if (h) { flush(); const lv = Math.min(6, h[1].length + 2); out.push(`<h${lv}>${inl(h[2])}</h${lv}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(ln)) { flush(); const b = []; while (i < lines.length && /^\s*>/.test(lines[i])) { b.push(lines[i].replace(/^\s*>\s?/, '')); i++; } out.push('<blockquote>' + b.map(inl).join('<br>') + '</blockquote>'); continue; }
      if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flush(); const head = row(ln); i += 2; const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(row(lines[i])); i++; }
        out.push(`<div class="ai-tbl"><table><thead><tr>${head.map((c) => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
      }
      const li = ln.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        flush(); const ord = /\d/.test(li[2]), items = [];
        while (i < lines.length) { const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/); if (m) { items.push({ d: Math.min(3, Math.floor(m[1].length / 2)), t: inl(m[3]) }); i++; } else if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].t += '<br>' + inl(lines[i].trim()); i++; } else break; }
        out.push(`<${ord ? 'ol' : 'ul'}>${items.map((x) => `<li${x.d ? ` style="margin-left:${x.d * 1.1}em"` : ''}>${x.t}</li>`).join('')}</${ord ? 'ol' : 'ul'}>`); continue;
      }
      para.push(ln); i++;
    }
    flush();
    return { html: out.join(''), codes };
  }
  AS.md = md;
  const RUNNABLE = ['html', 'htm', 'svg', 'js', 'javascript'];
  function codeHtml(c, k, mi) {
    if (c.lang === 'zaoyue-mod') return modCard(c, k, mi);
    return `<div class="ai-code"><div class="ai-code-h"><span>${esc(c.lang || '代码')}</span><button class="ai-mini" data-copy="${mi}:${k}">复制</button>${RUNNABLE.includes(c.lang) && c.closed ? `<button class="ai-mini run" data-run="${mi}:${k}">▶ 运行</button>` : ''}</div><pre><code>${esc(c.code)}</code></pre></div>`;
  }
  function modCard(c, k, mi) {
    if (!c.closed) return '<div class="ai-modc pending"><b>🧩 正在写模组……</b></div>';
    const { mod, err } = CF.Mods.parse(c.code); const E = err ? [err] : CF.Mods.validate(mod), T = mod && CF.Mods.TYPES[mod.type], inst = mod && CF.Mods.get(mod.id);
    const what = !mod ? '' : mod.type === 'knowledge' ? `${(mod.questions || []).length} 道题${(mod.cards || []).length ? '、' + mod.cards.length + ' 张知识卡' : ''}` : mod.type === 'course' && mod.track ? `赛道「${esc(mod.track.name)}」${(mod.track.stages || []).reduce((a, s) => a + (s.levels || []).length, 0)} 关` : mod.type === 'cheer' ? `${(mod.lines || []).length} 句鼓励、${(mod.stories || []).length} 个故事` : mod.type === 'minigame' ? '一个水彩小游戏' : mod.type === 'script' ? esc(mod.what || '') : mod.type === 'proposal' ? `${(mod.changes || []).length} 处源码改动` : '';
    return `<div class="ai-modc ${E.length ? 'bad' : 'ok'}" data-mod="${mi}:${k}"><div class="ai-modc-h"><i>${T ? T.icon : '🧩'}</i><div><b>${esc((mod && mod.name) || '模组')}</b><small>${T ? T.name : '未知类型'}${mod && mod.id ? ' · ' + esc(mod.id) : ''}${mod && mod.version ? ' · v' + esc(mod.version) : ''}</small></div></div>
      ${mod && mod.desc ? `<p>${esc(mod.desc)}</p>` : ''}${what ? `<p class="small">会加：${what}</p>` : ''}
      ${E.length ? `<div class="ai-moderr"><b>校验没通过（${E.length} 处）</b><ul>${E.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${E.length > 8 ? '<small>……</small>' : ''}</div>` : ''}
      <div class="ai-modc-a">${E.length ? `<button class="btn sm primary" data-fix="${mi}:${k}">让助手修正</button>` : `${mod.type === 'minigame' ? `<button class="btn sm" data-try="${mi}:${k}">试玩</button>` : ''}<button class="btn sm primary" data-inst="${mi}:${k}">${inst ? '更新安装' : '安装'}</button>`}<button class="btn sm ghost" data-json="${mi}:${k}">看 JSON</button><button class="btn sm ghost" data-copy="${mi}:${k}">复制</button></div><pre class="ai-modjson hidden"><code>${esc(c.code)}</code></pre></div>`;
  }

  // ================= 面板 =================
  AS.init = function () {
    if (CF.$('#aiFab')) return;
    const fab = CF.h('<button id="aiFab" class="ai-fab" title="AI 助手：学习、写代码、做模组（可拖动）" aria-label="打开 AI 助手"><span>✦</span><b>AI</b></button>');
    document.getElementById('app').appendChild(fab);
    // 位置：玩家拖过就用玩家的；没拖过，就在几个候选点里挑第一个不压按钮的（每换一个界面、转一次屏重新挑）
    const set = CF.Save.data.settings, xy = (pos) => [Math.round(CF.clamp(pos.x * innerWidth - 26, 4, innerWidth - 56)), Math.round(CF.clamp(pos.y * innerHeight - 26, 52, innerHeight - 56))];
    const CANDS = [{ x: 0.94, y: 0.62 }, { x: 0.82, y: 0.925 }, { x: 0.96, y: 0.93 }, { x: 0.94, y: 0.45 }, { x: 0.06, y: 0.62 }, { x: 0.94, y: 0.3 }];
    const free = () => {
      const seen = (el) => (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
      const box = [...document.querySelectorAll('#app button, #app .act, #app input, #app select, #app textarea, #app a, .learn-timer')].filter((el) => el !== fab && !el.closest('.ai-panel') && seen(el)).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.width < innerWidth * 0.9);
      return CANDS.find((c) => { const [l, t] = xy(c); return !box.some((r) => r.left < l + 56 && r.right > l - 4 && r.top < t + 56 && r.bottom > t - 4); }) || CANDS[0];
    };
    const place = () => { const [l, t] = xy(set.aiFabPos || free()); fab.style.left = l + 'px'; fab.style.top = t + 'px'; };
    place(); addEventListener('resize', place); CF.bus.on('screen', () => setTimeout(() => { if (!fab.classList.contains('dock')) place(); }, 60));
    let drag = null;
    fab.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: fab.offsetLeft, y0: fab.offsetTop, moved: false }; try { fab.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
    fab.addEventListener('pointermove', (e) => { if (!drag || drag.id !== e.pointerId || fab.classList.contains('dock')) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.hypot(dx, dy) > 6) drag.moved = true; if (!drag.moved) return; fab.style.left = CF.clamp(drag.x0 + dx, 4, innerWidth - 56) + 'px'; fab.style.top = CF.clamp(drag.y0 + dy, 52, innerHeight - 56) + 'px'; });
    const up = (e) => { if (!drag || drag.id !== e.pointerId) return; const mv = drag.moved; drag = null; if (mv) { set.aiFabPos = { x: (fab.offsetLeft + 26) / innerWidth, y: (fab.offsetTop + 26) / innerHeight }; CF.Save.save(); } else { CF.Audio.sfx('click'); AS.open(); } };
    fab.addEventListener('pointerup', up); fab.addEventListener('pointercancel', up);
    const vis = () => fab.classList.toggle('hidden', ['battle', 'quick'].includes(CF.UI && CF.UI.cur) || !!root);
    CF.bus.on('screen', vis); vis();
    // 有弹窗（关卡、手账……）时缩成贴在右边的小标签，不挡内容（UI 宪法第 26 章「不遮挡」）；点一下照样打开
    const dock = () => { const m = CF.$('#modal'), on = !!(m && !m.classList.contains('hidden')); fab.classList.toggle('dock', on); if (on) { fab.style.left = ''; fab.style.top = ''; } else place(); };
    const mo = CF.$('#modal'); if (mo && window.MutationObserver) new MutationObserver(dock).observe(mo, { attributes: true, attributeFilter: ['class'] }); dock();
    CF.bus.on('mods:changed', () => { if (root && tab === 'mods') render(); });
  };
  AS.isOpen = () => !!root;
  AS.open = async function (o) {
    o = o || {};
    if (!root) {
      root = CF.h(`<div class="ai-panel" role="dialog" aria-label="AI 助手"><div class="ai-card"><div class="modal-head ai-head"><canvas class="mh-fx"></canvas><h3>✦ AI 助手</h3><span class="ai-cur"></span><button class="x" data-x aria-label="关闭">✕</button></div>
        <div class="ai-body rail-page"><nav class="rail" role="tablist" aria-label="AI 助手"></nav><div class="rail-main ai-main"></div></div></div></div>`);
      document.getElementById('app').appendChild(root);
      if (CF.PixelFX) stage = new CF.PixelFX.Stage(root.querySelector('.mh-fx'), { mode: 'bar', fx: 0.86, fy: 0.56, cell: 10 });
      root.querySelector('[data-x]').onclick = () => { CF.Audio.sfx('click'); AS.close(); };
      root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.querySelector('.ai-over')) AS.close(); });
      const fab = CF.$('#aiFab'); if (fab) fab.classList.add('hidden');
    }
    tab = o.tab || (A().ready() ? 'chat' : A().profiles().length ? 'chat' : 'set');
    if (!conv || o.fresh) { const list = await A().store.list(); conv = !o.fresh && list[0] && list[0].messages.length ? list[0] : A().newConv(o.mode); }
    if (o.mode) { A().state().mode = o.mode; if (!conv.messages.length) conv.mode = o.mode; }
    render();
    if (o.prompt) { const ta = root.querySelector('.ai-ta'); if (ta) { ta.value = o.prompt; ta.focus(); } if (o.send && A().ready()) sendNow(); }
  };
  AS.close = function () { if (busy) busy.abort(); stopSpeak(); if (stage) { stage.destroy(); stage = null; } if (root) root.remove(); root = null; const fab = CF.$('#aiFab'); if (fab) fab.classList.toggle('hidden', ['battle', 'quick'].includes(CF.UI && CF.UI.cur)); };
  function render() {
    if (!root) return;
    const p = A().active(); root.querySelector('.ai-cur').textContent = p ? `${p.name} · ${p.model || '（未填模型）'}` : '还没设置接口';
    const rail = root.querySelector('.rail');
    rail.innerHTML = [['chat', '对话'], ['mods', '扩展工坊'], ['set', '接口设置'], ['help', '说明']].map(([k, n]) => `<button role="tab" data-t="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${n}${k === 'mods' ? `<small>${CF.Mods.list().length}</small>` : ''}</button>`).join('');
    rail.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); tab = b.dataset.t; render(); }));
    const main = root.querySelector('.ai-main'); main.scrollTop = 0;
    ({ chat: chatTab, mods: modsTab, set: setTab, help: helpTab })[tab](main);
  }
  AS.render = render;

  // ================= 对话 =================
  function chatTab(main) {
    const a = A().state(), mode = A().mode(conv.mode || a.mode), p = A().active();
    main.innerHTML = `<div class="ai-chat"><div class="ai-convbar"><button class="btn sm ghost" data-list>☰ 对话</button><div class="ai-modes">${A().MODES.map((m) => `<button class="ai-mode ${m.id === mode.id ? 'on' : ''}" data-mode="${m.id}" title="${esc(m.desc)}">${m.icon} ${m.name}</button>`).join('')}</div><button class="btn sm ghost" data-new>＋ 新对话</button></div>
      <div class="ai-msgs wc-paper" aria-live="polite"></div>
      <div class="ai-compose"><div class="ai-atts"></div><div class="ai-row"><button class="ai-attach" data-att title="发图片、文本文件或 PDF">📎</button><textarea class="ai-ta" rows="2" placeholder="${p ? '问点什么，或者让它帮你写代码、做模组……（电脑上 Enter 发送，Shift+Enter 换行）' : '先在「接口设置」里填一个 API'}"></textarea><button class="btn primary ai-send">发送</button></div>
      <div class="ai-opts"><label><input type="checkbox" data-ctx ${a.ctx ? 'checked' : ''}> 让助手了解我的进度</label>${p && p.format === 'claude' ? `<label><input type="checkbox" data-web ${a.web ? 'checked' : ''}> 联网搜索</label><label>深度 <select data-eff>${[['low', '快速'], ['medium', '平衡'], ['high', '深入']].map(([k, n]) => `<option value="${k}" ${a.effort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}<input type="file" class="hidden" data-file multiple accept="image/*,.pdf,.txt,.md,.js,.mjs,.ts,.py,.json,.csv,.html,.css,.java,.c,.cpp,.h,.xml,.yaml,.yml,.log"></div></div></div>`;
    const box = main.querySelector('.ai-msgs'), ta = main.querySelector('.ai-ta');
    main.querySelector('[data-list]').onclick = () => convList(main);
    main.querySelector('[data-new]').onclick = async () => { CF.Audio.sfx('click'); if (busy) busy.abort(); conv = A().newConv(conv.mode); atts = []; editFrom = -1; render(); };
    main.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); a.mode = b.dataset.mode; conv.mode = b.dataset.mode; CF.Save.save(); if (conv.messages.length) A().store.put(conv); render(); }));
    main.querySelector('[data-ctx]').onchange = (e) => { a.ctx = e.target.checked; CF.Save.save(); };
    const web = main.querySelector('[data-web]'); if (web) web.onchange = (e) => { a.web = e.target.checked; CF.Save.save(); };
    const eff = main.querySelector('[data-eff]'); if (eff) eff.onchange = (e) => { a.effort = e.target.value; CF.Save.save(); };
    const fi = main.querySelector('[data-file]'); main.querySelector('[data-att]').onclick = () => fi.click(); fi.onchange = () => { addFiles([...fi.files]); fi.value = ''; };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !CF.UI.touch && !e.isComposing) { e.preventDefault(); sendNow(); } });
    ta.addEventListener('paste', (e) => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
    main.querySelector('.ai-send').onclick = () => (busy ? busy.abort() : sendNow());
    paintAtts(); paintMsgs(box); setBusy(!!busy);
  }
  function setBusy(b) { if (!root) return; const s = root.querySelector('.ai-send'); if (s) { s.textContent = b ? '■ 停止' : '发送'; s.classList.toggle('stop', b); } }
  function paintMsgs(box) {
    box = box || (root && root.querySelector('.ai-msgs')); if (!box) return;
    if (!conv.messages.length) {
      const m = A().mode(conv.mode), p = A().active();
      box.innerHTML = `<div class="ai-empty"><canvas class="ai-hero" width="220" height="120"></canvas><h4>${m.icon} ${m.name}</h4><p>${esc(m.desc)}。${p ? '' : '<br><b>先去「接口设置」填一个 API</b>，用你自己的 Key 调用你选的模型。'}</p><div class="ai-quick">${m.quick.map((q) => `<button class="ai-q">${esc(q)}</button>`).join('')}</div>${p ? '' : '<button class="btn primary" data-goset>去接口设置</button>'}</div>`;
      drawHero(box.querySelector('.ai-hero'), m.id);
      box.querySelectorAll('.ai-q').forEach((b) => (b.onclick = () => { const ta = root.querySelector('.ai-ta'); ta.value = b.textContent; ta.focus(); }));
      const gs = box.querySelector('[data-goset]'); if (gs) gs.onclick = () => { tab = 'set'; render(); };
      return;
    }
    box.innerHTML = conv.messages.map((m, i) => msgHtml(m, i)).join('');
    bindMsgs(box); box.scrollTop = box.scrollHeight;
  }
  function msgHtml(m, i) {
    if (m.role === 'user') {
      const txt = (m.parts || []).filter((p) => p.t === 'text').map((p) => p.text).join('\n'), at = (m.parts || []).filter((p) => p.t !== 'text');
      return `<div class="ai-msg u" data-i="${i}"><div class="ai-ubody">${esc(txt).replace(/\n/g, '<br>')}</div>${at.length ? `<div class="ai-uatt">${at.map((p) => (p.t === 'image' ? `<img src="data:${p.mime};base64,${p.data}" alt="${esc(p.name || '图片')}">` : `<span>📄 ${esc(p.name)}</span>`)).join('')}</div>` : ''}<div class="ai-acts"><button class="ai-mini" data-edit="${i}">编辑重发</button><button class="ai-mini" data-copyu="${i}">复制</button></div></div>`;
    }
    const mode = A().mode(conv.mode), r = md(m.text);
    let body = r.html.replace(/<!--code:(\d+)-->/g, (_, k) => codeHtml(r.codes[+k], +k, i));
    if (m.streaming && !m.text) body = '<p class="ai-dots"><i></i><i></i><i></i></p>';
    const u = m.usage;
    return `<div class="ai-msg a ${m.streaming ? 'live' : ''}" data-i="${i}"><div class="ai-who">${mode.icon} ${esc(mode.name)}${m.prov ? ' · ' + esc(m.prov.model || '') : ''}</div>
      ${m.thinking ? `<details class="ai-think"${m.streaming && !m.text ? ' open' : ''}><summary>思考摘要</summary><div>${esc(m.thinking).replace(/\n/g, '<br>')}</div></details>` : ''}
      ${(m.searches || []).length ? `<div class="ai-search">${m.searches.map((q) => `<span>🔎 ${esc(q)}</span>`).join('')}</div>` : ''}
      <div class="ai-md">${body}</div>
      ${(m.sources || []).length ? `<div class="ai-src"><b>来源</b>${m.sources.slice(0, 8).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>`).join('')}</div>` : ''}
      ${(m.notes || []).map((n) => `<div class="ai-note">${esc(n)}</div>`).join('')}
      ${m.error ? `<div class="ai-err"><b>${esc(m.error.t)}</b><p>${esc(m.error.d)}</p><button class="btn sm" data-goset>检查接口设置</button><button class="btn sm primary" data-regen="${i}">再试一次</button></div>` : ''}
      ${m.streaming ? '' : `<div class="ai-acts"><button class="ai-mini" data-copya="${i}">复制</button><button class="ai-mini" data-read="${i}">${speaking === i ? '停止朗读' : '朗读'}</button>${i === conv.messages.length - 1 ? `<button class="ai-mini" data-regen="${i}">重新回答</button>` : ''}${u ? `<small class="ai-use">用量：输入 ${u.in || 0}${u.cacheR ? `（其中缓存 ${u.cacheR}）` : ''} · 输出 ${u.out || 0} token</small>` : ''}</div>`}</div>`;
  }
  const codeOf = (key) => { const [mi, k] = key.split(':').map(Number), m = conv.messages[mi]; return m ? md(m.text).codes[k] : null; };
  function bindMsgs(box) {
    const on = (sel, fn) => box.querySelectorAll(sel).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); CF.Audio.sfx('click'); fn(b); }));
    on('[data-copy]', (b) => { const c = codeOf(b.dataset.copy); if (c) copy(c.code); });
    on('[data-run]', (b) => { const c = codeOf(b.dataset.run); if (c) runCode(c); });
    on('[data-json]', (b) => b.closest('.ai-modc').querySelector('.ai-modjson').classList.toggle('hidden'));
    on('[data-inst]', (b) => { const c = codeOf(b.dataset.inst); if (c) installFromCode(c.code, () => paintMsgs()); });
    on('[data-try]', (b) => { const c = codeOf(b.dataset.try); if (c) { const { mod } = CF.Mods.parse(c.code); if (mod) AS.playMod(mod, true); } });
    on('[data-fix]', (b) => { const c = codeOf(b.dataset.fix); if (!c) return; const { mod, err } = CF.Mods.parse(c.code), E = err ? [err] : CF.Mods.validate(mod); sendText('模组校验没通过，错误如下，请逐条修改后给出完整的新版本：\n- ' + E.join('\n- '), 'maker'); });
    on('[data-copya]', (b) => copy(conv.messages[+b.dataset.copya].text));
    on('[data-copyu]', (b) => copy((conv.messages[+b.dataset.copyu].parts || []).filter((p) => p.t === 'text').map((p) => p.text).join('\n')));
    on('[data-read]', (b) => { const i = +b.dataset.read; if (speaking === i) stopSpeak(); else speak(conv.messages[i].text, i); paintMsgs(); });
    on('[data-regen]', (b) => { const i = +b.dataset.regen; if (busy) return; conv.messages = conv.messages.slice(0, i); if (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'user') run(); });
    on('[data-edit]', (b) => { const i = +b.dataset.edit, m = conv.messages[i]; if (busy) return; editFrom = i; atts = (m.parts || []).filter((p) => p.t !== 'text'); const ta = root.querySelector('.ai-ta'); ta.value = (m.parts || []).filter((p) => p.t === 'text').map((p) => p.text).join('\n'); ta.focus(); paintAtts(); CF.toast('改好后点发送：会从这条消息开始重新对话', '', 2500); });
    on('[data-goset]', () => { tab = 'set'; render(); });
  }
  function repaintLast() {
    if (raf) return; raf = requestAnimationFrame(() => {
      raf = 0; const box = root && root.querySelector('.ai-msgs'); if (!box) return;
      const i = conv.messages.length - 1, old = box.querySelector(`.ai-msg[data-i="${i}"]`), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      const el = CF.h(msgHtml(conv.messages[i], i)); if (old) old.replaceWith(el); else box.appendChild(el);
      bindMsgs(box); if (stick) box.scrollTop = box.scrollHeight;
    });
  }
  function sendText(text, modeId) { const ta = root && root.querySelector('.ai-ta'); if (modeId && conv.mode !== modeId && !conv.messages.length) conv.mode = modeId; if (ta) ta.value = text; sendNow(); }
  AS.sendText = sendText;
  async function sendNow() {
    if (busy || !root) return;
    const ta = root.querySelector('.ai-ta'), text = ta.value.trim();
    if (!text && !atts.length) return;
    if (!A().ready()) { CF.toast('先在「接口设置」里填好接口地址、模型和 Key', 'bad'); tab = 'set'; render(); return; }
    if (editFrom >= 0) { conv.messages = conv.messages.slice(0, editFrom); editFrom = -1; }
    conv.messages.push({ role: 'user', parts: atts.concat(text ? [{ t: 'text', text }] : []), t: Date.now() });
    if (conv.title === '新对话') conv.title = (text || atts[0].name || '图片').replace(/\s+/g, ' ').slice(0, 20);
    atts = []; ta.value = ''; paintAtts(); paintMsgs();
    await run();
  }
  async function run() {
    const ac = new AbortController(); busy = ac; setBusy(true);
    const ph = { role: 'assistant', text: '', streaming: true, prov: { model: (A().active() || {}).model } };
    conv.messages.push(ph); repaintLast();
    try {
      const msg = await A().send({ mode: conv.mode, messages: conv.messages.slice(0, -1) }, { signal: ac.signal, on: (m) => { m.streaming = true; conv.messages[conv.messages.length - 1] = m; repaintLast(); } });
      msg.streaming = false; conv.messages[conv.messages.length - 1] = msg;
      if (msg.text && CF.P) CF.bus.emit('ai:answer', { mode: conv.mode });
    } catch (err) { Object.assign(ph, { streaming: false, error: err.friendly || CF.AINet.explain(err) }); conv.messages[conv.messages.length - 1] = ph; }
    busy = null; setBusy(false); await A().store.put(conv); repaintLast();
  }
  function convList(main) {
    A().store.list().then((list) => {
      over(`<div class="ai-over-c"><h4>对话（${list.length}）</h4><div class="ai-convs">${list.map((c) => `<div class="ai-conv ${conv && c.id === conv.id ? 'on' : ''}" data-id="${c.id}"><button class="ai-conv-t" data-open>${esc(c.title)}<small>${new Date(c.updated).toLocaleString()} · ${c.messages.length} 条 · ${esc(A().mode(c.mode).name)}</small></button><button class="ai-mini" data-ren>改名</button><button class="ai-mini" data-md>导出</button><button class="ai-mini" data-del>删除</button></div>`).join('') || '<p class="small muted">还没有对话。</p>'}</div><div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn ghost" data-close>关闭</button></div></div>`, (o) => {
        o.querySelectorAll('.ai-conv').forEach((row) => {
          const c = list.find((x) => x.id === row.dataset.id);
          row.querySelector('[data-open]').onclick = () => { if (busy) busy.abort(); conv = c; o.remove(); render(); };
          row.querySelector('[data-ren]').onclick = () => { const t = prompt('新名字', c.title); if (t) { c.title = t.slice(0, 30); A().store.put(c).then(() => { o.remove(); convList(main); }); } };
          row.querySelector('[data-md]').onclick = () => CF.Mods.download(`chat-${c.id}.md`, `# ${c.title}\n\n` + c.messages.map((m) => (m.role === 'user' ? '**我：** ' + (m.parts || []).filter((p) => p.t === 'text').map((p) => p.text).join('\n') : '**助手：**\n\n' + (m.text || ''))).join('\n\n---\n\n'), 'text/markdown');
          row.querySelector('[data-del]').onclick = () => { if (!confirm('删除这个对话？')) return; A().store.del(c.id).then(() => { if (conv && conv.id === c.id) conv = A().newConv(); o.remove(); convList(main); if (tab === 'chat') render(); }); };
        });
        o.querySelector('[data-close]').onclick = () => o.remove();
      });
    });
  }
  // ---------- 附件 ----------
  function paintAtts() { const el = root && root.querySelector('.ai-atts'); if (!el) return; el.innerHTML = atts.map((p, i) => `<span class="ai-att">${p.t === 'image' ? `<img src="data:${p.mime};base64,${p.data}">` : '📄'} ${esc(p.name || '')}<button data-rm="${i}" aria-label="移除">×</button></span>`).join(''); el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { atts.splice(+b.dataset.rm, 1); paintAtts(); })); }
  const readAs = (f, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](f); });
  async function addFiles(files) {
    const p = A().active();
    for (const f of files.slice(0, 6)) {
      try {
        if (/^image\//.test(f.type)) {
          const url = await readAs(f, 'readAsDataURL'), img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
          const k = Math.min(1, 1568 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);   // 太大的图先缩到长边 1568（模型看得清，也省 token）
          const png = f.type === 'image/png' && c.width * c.height < 600000, d = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
          atts.push({ t: 'image', name: f.name, mime: png ? 'image/png' : 'image/jpeg', data: d.split(',')[1] });
        } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (!p || p.format !== 'claude') { CF.toast('PDF 目前只有 Claude 接口能直接读；可以先复制里面的文字发过去', 'bad', 3500); continue; }
          if (f.size > 8 * 1024 * 1024) { CF.toast('PDF 超过 8 MB，拆小一点再发', 'bad'); continue; }
          atts.push({ t: 'pdf', name: f.name, data: (await readAs(f, 'readAsDataURL')).split(',')[1] });
        } else {
          if (f.size > 300 * 1024) { CF.toast(`「${f.name}」超过 300 KB，只发前面一部分`, '', 3000); }
          const txt = await readAs(f.slice(0, 300 * 1024), 'readAsText'); atts.push({ t: 'file', name: f.name, text: txt });
        }
      } catch (e) { CF.toast('读不了这个文件：' + f.name, 'bad'); }
    }
    paintAtts();
  }
  // ---------- 小工具 ----------
  function copy(t) { const done = () => CF.toast('已复制', '', 1200); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done); }
  function fallbackCopy(t, done) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { CF.toast('复制失败，请长按选择文字', 'bad'); } ta.remove(); }
  const plain = (t) => String(t || '').replace(/```[\s\S]*?```/g, '（这里有一段代码）').replace(/[#>*_`|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 1500);
  function speak(t, i) {
    stopSpeak(); speaking = i; const s = plain(t);
    if (window.XSNative && typeof window.XSNative.speak === 'function') { try { window.XSNative.speak(s, 1, 1); return; } catch (e) { /* 兜底 */ } }
    if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(s); u.lang = 'zh-CN'; u.onend = () => { speaking = false; if (root && tab === 'chat') paintMsgs(); }; speechSynthesis.speak(u); }
  }
  function stopSpeak() { speaking = false; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* */ } }
  function over(html, bind) { if (!root) return; const o = CF.h(`<div class="ai-over">${html}</div>`); root.querySelector('.ai-card').appendChild(o); o.addEventListener('click', (e) => { if (e.target === o) o.remove(); }); bind(o); return o; }
  AS.over = over;
  // 代码预览：隔离沙盒（读不到游戏存档和 Key）
  function runCode(c) {
    let html;
    if (c.lang === 'svg') html = `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${c.code}</body>`;
    else if (c.lang === 'js' || c.lang === 'javascript') html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:12px"><pre id="out" style="white-space:pre-wrap"></pre><script>(function(){var o=document.getElementById('out'),w=function(){o.textContent+=Array.prototype.map.call(arguments,function(x){try{return typeof x==='object'?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(' ')+'\\n'};console.log=w;console.error=w;window.onerror=function(m,s,l){w('出错：'+m+'（第 '+l+' 行）')}})();<\/script><script>${c.code.replace(/<\/script/gi, '<\\/script')}<\/script></body>`;
    else html = /<html|<body|<!doctype/i.test(c.code) ? c.code : `<!doctype html><meta charset="utf-8"><body>${c.code}</body>`;
    over(`<div class="ai-run"><div class="ai-run-h"><b>▶ 运行预览</b><small>在隔离的沙盒里运行：读不到游戏存档和 Key</small><button class="btn sm ghost" data-close>关闭</button></div><iframe sandbox="allow-scripts allow-modals" title="代码预览"></iframe></div>`, (o) => { o.querySelector('iframe').srcdoc = html; o.querySelector('[data-close]').onclick = () => o.remove(); });
  }
  // 安装：脚本模组要先看代码、勾选确认
  function installFromCode(code, after) {
    const { mod, err } = CF.Mods.parse(code); if (err) return CF.toast(err, 'bad');
    const finish = (consent) => { const r = CF.Mods.install(mod, { consent }); if (!r.ok) return CF.toast('没装上：' + r.errors[0], 'bad', 4000); CF.Audio.sfx('unlock'); CF.toast(`${r.replaced ? '已更新' : '已安装'}：${mod.name}`, 'gold', 2500); CF.bus.emit('mods:changed'); after && after(); };
    if (mod.type !== 'script') return finish(false);
    over(`<div class="ai-over-c"><h4>⚙️ 安装脚本模组：${esc(mod.name)}</h4><p class="ai-warn">脚本模组会在游戏页面里直接运行，能读写存档、改任何功能${CF.AINet.native() ? '（安卓版的 API Key 存在系统里，它读不到）' : '，也能读到你在这台设备上保存的 API Key'}。只装你看得懂、或者信得过的。</p><p><b>它说自己会做：</b>${esc(mod.what || '')}</p><pre class="ai-codev"><code>${esc(mod.js)}</code></pre><label class="ai-chk"><input type="checkbox" data-ok> 我看过代码，知道它会做什么</label><p class="small muted">出了问题：在「扩展工坊」里关掉它；游戏打不开时在网址后面加 ?safe=1 进入安全模式。</p><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-go disabled>安装</button></div></div>`, (o) => {
      const go = o.querySelector('[data-go]'); o.querySelector('[data-ok]').onchange = (e) => (go.disabled = !e.target.checked);
      go.onclick = () => { o.remove(); finish(true); }; o.querySelector('[data-close]').onclick = () => o.remove();
    });
  }
  AS.installFromCode = installFromCode;
  function drawHero(cv, id) {
    if (!cv || !CF.WC) return; const W = CF.WC, g = W.fit(cv, 220, 120); W.seed('ai-' + id); W.paper(g, 220, 120, { vignette: false });
    const col = { tutor: W.C.ultramarine, code: W.C.teal, coach: W.C.carmine, maker: W.C.gamboge, chat: W.C.violet }[id] || W.C.cyan;
    W.blob(g, 110, 62, 42, col); W.blob(g, 150, 48, 18, W.C.gamboge, { layers: 10 }); W.star(g, 150, 48, 8, W.C.gamboge); W.inkCircle(g, 110, 62, 40, { width: 1.4 });
    W.text(g, '✦', 110, 74, { size: 30, align: 'center', color: W.C.white, jitter: false });
  }

  // ================= 扩展工坊 =================
  function modsTab(main) {
    const L = CF.Mods.list(), T = CF.Mods.TYPES;
    main.innerHTML = `<div class="ai-pg wc-paper"><div class="codex-head"><b class="codex-t">扩展工坊</b><span class="codex-prog">已装 <b>${L.length}</b><span> 个模组</span></span><button class="btn sm ghost" data-i>ⓘ 怎么用</button></div>
      ${CF.Mods.safeMode() ? '<p class="ai-warn">现在是安全模式：脚本模组没有运行，其他模组照常。</p>' : ''}
      <div class="ai-make">${Object.entries(T).map(([k, t]) => `<button class="ai-mk" data-make="${k}"><i>${t.icon}</i><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:8px 0 14px"><button class="btn sm" data-import>导入模组文件</button><button class="btn sm ghost" data-paste>粘贴模组 JSON</button><input type="file" class="hidden" accept=".json,application/json" data-file></div>
      <div class="ai-modlist">${L.length ? L.map((m) => `<div class="ai-modi ${m.on ? '' : 'off'}" data-id="${m.id}"><i>${(T[m.type] || {}).icon || '🧩'}</i><div class="ai-modi-t"><b>${esc(m.name)}</b><small>${(T[m.type] || {}).name || m.type} · v${esc(m.version || '1')} · ${esc(m.author || '')}${m.at ? ' · ' + new Date(m.at).toLocaleDateString() : ''}</small>${m.desc ? `<span>${esc(m.desc)}</span>` : ''}</div><div class="ai-modi-a"><label class="ai-sw"><input type="checkbox" data-on ${m.on ? 'checked' : ''}><span></span></label><button class="btn sm" data-use>${{ minigame: '玩', knowledge: '去答题', course: '去实验室', cheer: '去手账', proposal: '查看', script: '看代码' }[m.type] || '打开'}</button><button class="btn sm ghost" data-exp>导出</button><button class="btn sm ghost" data-del>卸载</button></div></div>`).join('') : '<p class="small muted">还没有模组。点上面的一种类型，让 AI 助手帮你做；或者导入别人分享的模组文件。</p>'}</div></div>`;
    main.querySelector('[data-i]').onclick = () => over(`<div class="ai-over-c"><h4>扩展工坊怎么用</h4><div class="t-body">${HELP_MODS}</div><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>知道了</button></div></div>`, (o) => (o.querySelector('[data-close]').onclick = () => o.remove()));
    main.querySelectorAll('[data-make]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); makeDialog(b.dataset.make); }));
    const fi = main.querySelector('[data-file]'); main.querySelector('[data-import]').onclick = () => fi.click();
    fi.onchange = async () => { const f = fi.files[0]; fi.value = ''; if (!f) return; installFromCode(await readAs(f, 'readAsText'), () => render()); };
    main.querySelector('[data-paste]').onclick = () => over(`<div class="ai-over-c"><h4>粘贴模组 JSON</h4><textarea class="ai-json" rows="10" placeholder='{"zaoyue":1,"type":"knowledge", ...}'></textarea><div class="ai-moderr hidden"></div><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-go>检查并安装</button></div></div>`, (o) => {
      o.querySelector('[data-close]').onclick = () => o.remove();
      o.querySelector('[data-go]').onclick = () => { const v = o.querySelector('textarea').value, { mod, err } = CF.Mods.parse(v), E = err ? [err] : CF.Mods.validate(mod), box = o.querySelector('.ai-moderr'); if (E.length) { box.classList.remove('hidden'); box.innerHTML = `<b>校验没通过</b><ul>${E.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`; return; } o.remove(); installFromCode(v, () => render()); };
    });
    main.querySelectorAll('.ai-modi').forEach((row) => {
      const id = row.dataset.id, m = CF.Mods.get(id);
      row.querySelector('[data-on]').onchange = (e) => { CF.Mods.toggle(id, e.target.checked); render(); };
      row.querySelector('[data-exp]').onclick = () => (m.type === 'proposal' ? CF.Mods.download(`proposal-${id}.md`, CF.Mods.proposalMd(m), 'text/markdown') : CF.Mods.exportOne(id));
      row.querySelector('[data-del]').onclick = () => { if (confirm(`卸载「${m.name}」？`)) { CF.Mods.uninstall(id); render(); } };
      row.querySelector('[data-use]').onclick = () => useMod(m);
    });
  }
  function useMod(m) {
    if (m.type === 'minigame') return AS.playMod(m);
    if (m.type === 'knowledge') { AS.close(); if ((m.cards || []).length) CF.modal.open({ title: '📚 ' + esc(m.name), body: CF.h(`<div class="wc-paper wc-cards">${m.cards.map((c) => `<div class="wc-card"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p>${c.analogy ? `<p class="wc-ana">打个比方：${esc(c.analogy)}</p>` : ''}</div>`).join('')}<p class="small">题目已经进了学院题库，在「学院 → 知识测验」里会随机出到。</p></div>`), wide: true }); else CF.UI.show('academy'); return; }
    if (m.type === 'course') { AS.close(); CF.UI.show('labs'); if (CF.Emb) CF.Emb.open(m.track.id); return; }
    if (m.type === 'cheer') { AS.close(); if (CF.Courage) CF.Courage.open('story'); return; }
    if (m.type === 'proposal') return over(`<div class="ai-over-c"><h4>📝 ${esc(m.name)}</h4><div class="t-body">${md(CF.Mods.proposalMd(m)).html}</div><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" data-close>关闭</button><button class="btn primary" data-exp>导出给开发工具</button></div></div>`, (o) => { o.querySelector('[data-close]').onclick = () => o.remove(); o.querySelector('[data-exp]').onclick = () => CF.Mods.download(`proposal-${m.id}.md`, CF.Mods.proposalMd(m), 'text/markdown'); });
    if (m.type === 'script') return over(`<div class="ai-over-c"><h4>⚙️ ${esc(m.name)}</h4><p><b>会做：</b>${esc(m.what || '')}</p><pre class="ai-codev"><code>${esc(m.js)}</code></pre><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>关闭</button></div></div>`, (o) => (o.querySelector('[data-close]').onclick = () => o.remove()));
  }
  const MAKE_ASK = {
    knowledge: '帮我做一个知识包：主题是【写你想学的主题】，5 道题，高中难度，每题附讲解，再配 2 张知识卡。',
    course: '帮我做一个课程包：一条新赛道，主题是【写主题，例如：太阳能小车】，2 个阶段、每阶段 3 关，用选择、分类、工序、接线四种玩法，由浅入深（点 → 线 → 面 → 体）。',
    cheer: '帮我做一个鼓励包：10 句适合【写你的情况，例如：996 下班后很累】时看的鼓励话，再加 2 个真实、可查证、写清出处的名人失败后重新站起来的故事。',
    minigame: '帮我做一个水彩小游戏：【写玩法，例如：拖动三个电阻，让总电阻等于 30 欧】，手机竖屏和横屏都能玩，玩完按表现给 1–3 星，开始前有 2 张知识卡。',
    script: '帮我做一个脚本模组：【写你想改游戏的什么行为】。先告诉我它会改哪里，再写代码。',
    proposal: '我想改游戏的【写想改的功能】，这需要改源代码。帮我写一份改动提案：为什么改、改哪些文件、怎么改。',
  };
  function makeDialog(type) {
    const t = CF.Mods.TYPES[type];
    over(`<div class="ai-over-c"><h4>${t.icon} 做一个${t.name}</h4><p class="small">${esc(t.desc)}。把方括号里的内容换成你想要的，发给助手（模组工匠模式）。</p><textarea class="ai-json" rows="5">${esc(MAKE_ASK[type])}</textarea><details><summary class="small">看模板（不用 AI，也可以照着手写）</summary><pre class="ai-codev"><code>${esc(JSON.stringify(CF.Mods.TEMPLATES[type], null, 2))}</code></pre><button class="btn sm ghost" data-copyt>复制模板</button></details><div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-go>发给助手</button></div></div>`, (o) => {
      o.querySelector('[data-close]').onclick = () => o.remove();
      o.querySelector('[data-copyt]').onclick = () => copy(JSON.stringify(CF.Mods.TEMPLATES[type], null, 2));
      o.querySelector('[data-go]').onclick = () => { const v = o.querySelector('textarea').value; o.remove(); if (conv.messages.length) conv = A().newConv('maker'); conv.mode = 'maker'; A().state().mode = 'maker'; tab = 'chat'; render(); sendText(v, 'maker'); };
    });
  }
  // 水彩小游戏：先看知识卡，再在隔离沙盒里玩；通关按星级给一点实操经验（每个小游戏每天一次）
  AS.playMod = function (m, preview) {
    let learnI = 0; const cards = m.learn || [];
    const o = over(`<div class="ai-run ai-game"><div class="ai-run-h"><b>🎨 ${esc(m.name)}</b><small>${preview ? '试玩（还没安装）' : '水彩小游戏 · 模组'}</small><button class="btn sm ghost" data-close>结束</button></div><div class="ai-game-b"></div><div class="ai-game-msg"></div></div>`, () => {});
    const body = o.querySelector('.ai-game-b'), msgEl = o.querySelector('.ai-game-msg');
    const close = () => { removeEventListener('message', onMsg); o.remove(); };
    o.querySelector('[data-close]').onclick = close;
    const showCard = () => {
      if (learnI >= cards.length) return start();
      const c = cards[learnI]; body.innerHTML = `<div class="wc-paper wc-cards"><div class="wc-card"><small>知识卡 ${learnI + 1} / ${cards.length}</small><h4>${esc(c[0])}</h4><p>${esc(c[1])}</p>${c[2] ? `<p class="wc-ana">打个比方：${esc(c[2])}</p>` : ''}</div><button class="btn primary">${learnI < cards.length - 1 ? '下一张' : '开始玩 →'}</button></div>`;
      body.querySelector('.btn').onclick = () => { CF.Audio.sfx('click'); learnI++; showCard(); };
    };
    let ifr = null;
    const start = () => { body.innerHTML = '<iframe sandbox="allow-scripts" title="水彩小游戏"></iframe>'; ifr = body.querySelector('iframe'); ifr.srcdoc = CF.Mods.sandboxDoc({ html: m.html, css: m.css, js: m.js, strict: true }); };
    const dataKey = 'zy-mod-data-' + m.id;
    function onMsg(e) {
      if (!ifr || e.source !== ifr.contentWindow || !e.data || !e.data.__zy) return;
      const d = e.data;
      if (d.k === 'say') msgEl.textContent = d.text;
      else if (d.k === 'sfx' && ['click', 'correct', 'error', 'unlock'].includes(d.name)) CF.Audio.sfx(d.name);
      else if (d.k === 'save') { try { localStorage.setItem(dataKey, JSON.stringify(d.data).slice(0, 20000)); } catch (er) { /* 空间不够 */ } }
      else if (d.k === 'load') { let s = {}; try { s = JSON.parse(localStorage.getItem(dataKey) || '{}'); } catch (er) { /* */ } ifr.contentWindow.postMessage({ __zyLoad: 1, data: s }, '*'); }
      else if (d.k === 'error') { msgEl.innerHTML = `出错了：${esc(d.text)} <button class="btn sm">让助手修 bug</button>`; msgEl.querySelector('button').onclick = () => { close(); tab = 'chat'; render(); sendText(`我的水彩小游戏「${m.name}」（id: ${m.id}）运行时报错：${d.text}\n请修好它，给出完整的新版本模组。`, 'maker'); }; }
      else if (d.k === 'done') {
        const sv = CF.Save.data; sv.modPlay = sv.modPlay || {}; const r = sv.modPlay[m.id] || {}, today = CF.today(), first = r.day !== today && !preview;
        sv.modPlay[m.id] = { best: Math.max(r.best || 0, d.stars), day: preview ? r.day : today };
        msgEl.innerHTML = `<b class="ai-stars">${'★'.repeat(d.stars)}${'☆'.repeat(3 - d.stars)}</b> ${esc(d.msg || '通关！')}`; CF.Audio.sfx('unlock');
        if (first) CF.P.addXP({ type: 'p', amt: 5 + d.stars * 3, dims: { mei: 0.3, zhi: 0.3 }, label: '水彩小游戏 · ' + m.name }); else CF.Save.save();
      }
    }
    addEventListener('message', onMsg);
    showCard();
  };

  // ================= 接口设置 =================
  function setTab(main) {
    const a = A().state(), list = A().profiles();
    main.innerHTML = `<div class="ai-pg wc-paper"><div class="codex-head"><b class="codex-t">接口设置</b><span class="codex-prog"><b>${list.length}</b><span> 套接口</span></span><button class="btn sm ghost" data-i>ⓘ API 是什么</button></div>
      <p class="small">用你自己的 API Key 调用你选的模型。Key 保存在${esc(CF.AINet.where())}，不会写进存档、不会上传到别处；对话内容会发给你选的平台，费用由平台按用量（token）收。</p>
      <div class="ai-profs">${list.map((p) => `<div class="ai-prof ${a.active === p.id || (!a.active && list[0] === p) ? 'on' : ''}" data-id="${p.id}"><div><b>${esc(p.name)}</b><small>${esc(A().endpoint(p) || '（没填地址）')}<br>模型：${esc(p.model || '（未填）')} · Key：${p.noKey ? '不需要' : CF.AINet.hasKey(p.id) ? '已保存' : '<b class="bad">未填</b>'}</small></div><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-use>${a.active === p.id ? '✓ 当前' : '设为当前'}</button><button class="btn sm ghost" data-ed>编辑</button><button class="btn sm ghost" data-rm>删除</button></div></div>`).join('') || '<p class="small muted">还没有接口。从下面选一家平台开始。</p>'}</div>
      <h4 class="ai-h">添加接口</h4><div class="ai-pres">${A().PRESETS.map((p) => `<button class="ai-pre" data-pre="${p.k}">${esc(p.name)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:10px">预设里的默认模型名只是起点：平台经常更新模型，以平台文档为准。填好后点「测试连接」就知道对不对。</p></div>`;
    main.querySelector('[data-i]').onclick = () => over(`<div class="ai-over-c"><h4>API 和 Key 是什么</h4><div class="t-body">${HELP_API}</div><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>知道了</button></div></div>`, (o) => (o.querySelector('[data-close]').onclick = () => o.remove()));
    main.querySelectorAll('.ai-prof').forEach((row) => {
      const p = list.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-use]').onclick = () => { a.active = p.id; CF.Save.save(); render(); };
      row.querySelector('[data-ed]').onclick = () => editProfile(main, JSON.parse(JSON.stringify(p)));
      row.querySelector('[data-rm]').onclick = () => { if (confirm(`删除接口「${p.name}」（连同保存的 Key）？`)) { A().removeProfile(p.id); render(); } };
    });
    main.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { CF.Audio.sfx('click'); editProfile(main, A().newProfile(b.dataset.pre), true); }));
  }
  function editProfile(main, p, isNew) {
    const pre = A().PRESETS.find((x) => x.k === p.k) || {}, f = p.format, has = CF.AINet.hasKey(p.id);
    const fld = (k, label, ph, extra) => `<label class="ai-f"><span>${label}</span><input data-k="${k}" value="${esc(p[k] == null ? '' : p[k])}" placeholder="${esc(ph || '')}" ${extra || ''}></label>`;
    main.innerHTML = `<div class="ai-pg wc-paper"><div class="codex-head"><b class="codex-t">${isNew ? '添加' : '编辑'}：${esc(pre.name || p.name)}</b><button class="btn sm ghost" data-back>← 返回</button></div>
      <div class="ai-form">${fld('name', '名字（自己看的）', '')}
      ${f === 'claude' ? fld('baseURL', '接口地址（留空 = Anthropic 官方）', 'https://api.anthropic.com') : fld('url', f === 'custom' ? '请求地址' : '接口地址（完整的 …/chat/completions）', 'https://…/chat/completions')}
      <label class="ai-f"><span>模型名</span><input data-k="model" list="aiModels" value="${esc(p.model || '')}" placeholder="${esc(pre.modelHint || '')}"><datalist id="aiModels">${(f === 'claude' ? CF.AIClaude.MODELS : []).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</datalist></label>
      ${p.noKey ? '' : `<label class="ai-f"><span>API Key ${has ? '（已保存；不改就留空）' : ''}</span><input data-key type="password" autocomplete="off" placeholder="${has ? '••••••••（已保存）' : esc(pre.keyHint || '粘贴平台给你的 Key')}"></label>`}
      ${f === 'claude' ? `${fld('maxTokens', '一次最多写多少 token', '64000', 'inputmode="numeric"')}<label class="ai-chk"><input type="checkbox" data-b="fallback" ${p.fallback !== false ? 'checked' : ''}> 官方接口：被安全分类器拒答时，服务器自动换支持的模型接着答（Opus 5.5、Sonnet 5.5、Fable 5.2 等支持）</label>` : ''}
      ${f === 'compat' ? `${fld('authHeader', 'Key 放在哪个请求头（默认 Authorization: Bearer）', 'Authorization')}${fld('maxTokens', '最大长度（可空）', '', 'inputmode="numeric"')}${fld('temperature', '温度（可空；0 最稳定，越大越发散）', '', 'inputmode="decimal"')}<label class="ai-chk"><input type="checkbox" data-b="stream" ${p.stream !== false ? 'checked' : ''}> 流式输出（一边生成一边显示）</label><label class="ai-chk"><input type="checkbox" data-b="vision" ${p.vision !== false ? 'checked' : ''}> 这个模型能看图片</label>` : ''}
      ${f === 'custom' ? `${fld('method', '方法', 'POST')}<label class="ai-f"><span>请求头（JSON，可用 {{key}}）</span><textarea data-k="headers" rows="3">${esc(p.headers || '')}</textarea></label><label class="ai-f"><span>请求体（JSON，可用 {{model}} {{messages}} {{system}} {{prompt}}）</span><textarea data-k="body" rows="5">${esc(p.body || '')}</textarea></label>${fld('path', '回复里文字的位置（用点分隔，数字是第几个）', 'choices.0.message.content')}` : ''}
      ${pre.site ? `<p class="small">没有 Key？去 <a href="${esc(pre.site)}" target="_blank" rel="noopener noreferrer">${esc(pre.site)}</a> 注册、充值（有的有免费额度），在「API Keys」里创建。</p>` : ''}
      <div class="ai-testout small"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn ghost" data-models>获取模型列表</button><button class="btn" data-test>测试连接</button><button class="btn primary" data-save>保存</button></div></div></div>`;
    const read = () => { main.querySelectorAll('[data-k]').forEach((el) => (p[el.dataset.k] = el.value.trim())); main.querySelectorAll('[data-b]').forEach((el) => (p[el.dataset.b] = el.checked)); const k = main.querySelector('[data-key]'); return k ? k.value.trim() : ''; };
    const out = main.querySelector('.ai-testout');
    main.querySelector('[data-back]').onclick = () => render();
    main.querySelector('[data-save]').onclick = () => { const key = read(); if (!p.name) p.name = pre.name || '我的接口'; A().saveProfile(p, key); if (isNew || !A().state().active) A().state().active = p.id; CF.Save.save(); CF.toast('已保存', 'gold', 1400); render(); };
    main.querySelector('[data-test]').onclick = async () => {
      const key = read(); A().saveProfile(p, key); out.className = 'ai-testout small'; out.textContent = '正在连接……';
      try { const r = await A().test(p); out.classList.add('ok'); out.textContent = '✓ ' + r.msg; if (r.models && r.models.length) fillModels(r.models); }
      catch (err) { const e = err.friendly || CF.AINet.explain(err, (CF.AIClaude.statusOf(err)) || err.status); out.classList.add('bad'); out.innerHTML = `<b>${esc(e.t)}</b> ${esc(e.d)}`; }
    };
    main.querySelector('[data-models]').onclick = async () => { const key = read(); A().saveProfile(p, key); out.textContent = '正在获取……'; try { const ids = await A().listModels(p); if (ids.length) { fillModels(ids); out.textContent = `拿到 ${ids.length} 个模型：点「模型名」输入框可以选。`; } else out.textContent = '这个地址没有提供模型列表，按平台文档手动填。'; } catch (err) { const e = CF.AINet.explain(err, CF.AIClaude.statusOf(err) || err.status); out.innerHTML = `<b>${esc(e.t)}</b> ${esc(e.d)}`; } };
    const fillModels = (ids) => { const dl = main.querySelector('#aiModels'); dl.innerHTML = ids.map((id) => `<option value="${esc(id)}">`).join(''); };
  }

  // ================= 说明 =================
  const HELP_API = `<p><b>API</b>（应用程序接口）就像餐厅的点菜窗口：你按规定的格式写好「菜单」（请求），递进窗口，厨房（AI 模型）做好了从窗口递回来（回复）。</p><p><b>API Key</b> 是你的会员卡号：平台靠它知道是谁在点菜、该向谁收钱。<b>不要发给别人、不要贴到网上</b>；泄露了就去平台把它删掉、重新建一个。</p><p><b>模型名</b>：同一个平台有好几个模型，越聪明的一般越贵、越慢。</p><p><b>收费</b>：按 token 算（大约一个汉字 1–2 个 token），问一次一般几分钱到几毛钱；图片、长文件、联网搜索会多一些。可以先用平台的免费额度试。</p><p><b>为什么可以接很多家</b>：Claude 用 Anthropic 官方 SDK 接；国内外大多数平台都提供同一种「兼容接口」格式，所以只要填地址、Key 和模型名就能用；格式特别的，可以用「自己写模板」。</p><p>想系统地学：实验室里的「AI 学徒」课，第 3 关就是「寄一封信给 AI」。</p>`;
  const HELP_MODS = `<p><b>模组</b>是给游戏加的新内容。你不用会编程：告诉 AI 助手你想要什么，它按游戏里写好的模板做出来，你检查一下、点「安装」就生效。</p><ul><li>📚 知识包：新题目进学院题库（错题本照常记）。</li><li>🦾 课程包：具身智能实验室多一条赛道。</li><li>🌱 鼓励包：勇气手账里的鼓励话和真实故事（故事必须写出处）。</li><li>🎨 水彩小游戏：在隔离沙盒里运行，读不到存档和 Key、不能联网。</li><li>⚙️ 脚本模组：能改游戏的任何功能。安装前会给你看代码，确认了才装。</li><li>📝 改动提案：需要改源代码的大改动，导出成文档交给开发工具（例如 Claude Code）。</li></ul><p>出了问题：在这里关掉或卸载；游戏打不开时，网址后面加 <code>?safe=1</code> 进入安全模式（脚本模组不运行）。模组可以导出成文件分享给朋友。</p>`;
  function helpTab(main) {
    main.innerHTML = `<div class="ai-pg wc-paper"><div class="codex-head"><b class="codex-t">说明</b></div><div class="t-body ai-help">
      <h4>它能做什么</h4><ul><li><b>学习导师</b>：一步一步教你，先问你懂到哪，讲完出小题。</li><li><b>代码助手</b>：写代码、讲代码、看报错；网页代码点「▶ 运行」直接看效果（在隔离沙盒里）。</li><li><b>鼓励教练</b>：根据你在游戏里真实做到的事鼓励你（勾选「让助手了解我的进度」）。</li><li><b>模组工匠</b>：给游戏做新题目、新课程、新小游戏、新功能。</li><li><b>自由聊天</b>：什么都可以问。</li></ul>
      <h4>和聊天软件一样能用的</h4><p>多轮对话、停止、重新回答、编辑后重发、复制、朗读、发图片 / 文本文件 / PDF（PDF 目前只有 Claude）、联网搜索（Claude）、思考摘要、表格和代码高亮、对话列表与导出。</p>
      <h4>要注意的</h4><ul><li>AI 会出错，甚至会编造：重要的事（数据、法规、医疗、钱）一定去权威来源核实。</li><li>不要把身份证号、密码、银行卡、公司机密发给任何 AI。</li><li>Key 是你的钱包钥匙：别给别人，泄露了马上去平台删掉。</li></ul>
      ${HELP_API}${HELP_MODS}</div></div>`;
  }
})();
