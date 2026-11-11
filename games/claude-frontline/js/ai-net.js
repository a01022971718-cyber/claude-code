/* AI 助手 · 网络层（v9.6）
 * 1) 浏览器里：直接用 window.fetch。API Key 存在本机 localStorage（同一页面里的脚本都能读到，设置页会说明）。
 * 2) 安卓 APK 里：所有请求走原生桥 XSNet（android/…/MainActivity.java 的 Net 类）：
 *    - 不受网页跨域（CORS）限制，国内外各家接口都能连；
 *    - API Key 存在安卓的私有存储里，网页只拿到一个占位符「__XS_KEY__:配置编号」，原生层发请求时才替换成真的 Key，
 *      而且只在 https、并且主机名和保存 Key 时填的一致时才替换——脚本模组就算拿到占位符，也没法把 Key 发到别的网站。
 *    - 流式回复：原生层每读到一块数据就推回网页，这里拼成标准的 Response（body 是 ReadableStream），
 *      所以官方 Anthropic SDK（通过 fetch 选项）和兼容接口的代码都不用关心是哪条路。 */
(function () {
  const CF = window.CF;
  const N = (CF.AINet = {});
  const LS = 'zy-ai-keys';
  // 安卓壳：页面加载时第一个来要令牌的就是这里（主页面），以后沙盒、iframe 再要只会拿到空字符串
  const TOK = window.XSNet && typeof window.XSNet.session === 'function' ? String(window.XSNet.session() || '') : '';
  N.native = () => !!(TOK && window.XSNet && typeof window.XSNet.request === 'function');
  const PH = (pid) => '__XS_KEY__:' + pid;

  // ---------- Key 存取 ----------
  const lsKeys = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  N.setKey = function (pid, url, key) {
    const host = (() => { try { return new URL(url).host; } catch (e) { return ''; } })();
    if (N.native()) { window.XSNet.storeKey(TOK, pid, host, key || ''); return; }
    const k = lsKeys(); if (key) k[pid] = key; else delete k[pid]; localStorage.setItem(LS, JSON.stringify(k));
  };
  N.hasKey = (pid) => (N.native() ? !!window.XSNet.hasKey(TOK, pid) : !!lsKeys()[pid]);
  N.clearKey = (pid) => (N.native() ? window.XSNet.clearKey(TOK, pid) : N.setKey(pid, '', ''));
  // 发请求时用：浏览器给真 Key；安卓给占位符，由原生层替换
  N.keyFor = (pid) => (N.native() ? PH(pid) : lsKeys()[pid] || '');
  N.where = () => (N.native() ? '安卓系统的私有存储（网页脚本读不到）' : '这台设备浏览器的本地存储（同一页面里的脚本模组能读到）');

  // ---------- 原生桥 fetch ----------
  let seq = 0; const live = {};
  window.__xsNet = {
    head(id, status, hdrs) { const r = live[id]; if (!r || r.headed) return; r.headed = true; let h = {}; try { h = JSON.parse(hdrs || '{}'); } catch (e) { /* */ } r.resolve(new Response(r.stream, { status: Math.max(200, Math.min(599, status || 200)), headers: h })); },
    chunk(id, b64) { const r = live[id]; if (!r || !r.ctl) return; const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); try { r.ctl.enqueue(u); } catch (e) { /* 已关闭 */ } },
    end(id) { const r = live[id]; if (!r) return; delete live[id]; try { r.ctl.close(); } catch (e) { /* */ } },
    fail(id, msg) { const r = live[id]; if (!r) return; delete live[id]; const err = new TypeError('网络请求失败：' + (msg || '未知原因')); if (!r.headed) r.reject(err); else try { r.ctl.error(err); } catch (e) { /* */ } },
  };
  function nativeFetch(input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : input.url, method = (init.method || 'GET').toUpperCase(), id = 'n' + ++seq + '_' + Date.now();
    const hdr = {}; new Headers(init.headers || {}).forEach((v, k) => (hdr[k] = v));
    return new Promise((resolve, reject) => {
      const rec = { resolve, reject, headed: false, ctl: null };
      rec.stream = new ReadableStream({ start(c) { rec.ctl = c; }, cancel() { window.XSNet.cancel(id); delete live[id]; } });
      live[id] = rec;
      const sig = init.signal;
      if (sig) { if (sig.aborted) return reject(new DOMException('已停止', 'AbortError')); sig.addEventListener('abort', () => { window.XSNet.cancel(id); const e = new DOMException('已停止', 'AbortError'); if (!rec.headed) reject(e); else try { rec.ctl.error(e); } catch (er) { /* */ } delete live[id]; }); }
      const body = init.body == null ? '' : typeof init.body === 'string' ? init.body : String(init.body);
      window.XSNet.request(TOK, id, method, url, JSON.stringify(hdr), body);
    });
  }
  N.fetch = (input, init) => (N.native() ? nativeFetch(input, init) : window.fetch(input, init));

  // ---------- 把错误翻译成人话 ----------
  N.explain = function (err, status) {
    const s = status || (err && err.status);
    if (err && err.name === 'AbortError') return { t: '已停止', d: '你按了停止。已经收到的部分保留在对话里。' };
    if (s === 401 || s === 403) return { t: 'Key 不对或没有权限（' + s + '）', d: '检查 API Key 有没有复制完整、是不是这家平台的 Key、账户是否已开通这个模型。' };
    if (s === 404) return { t: '地址或模型名不对（404）', d: '检查「接口地址」和「模型名」。模型名要和平台文档里写的一字不差。' };
    if (s === 400) return { t: '请求格式被拒绝（400）', d: (err && err.message ? '平台说：' + String(err.message).slice(0, 240) + '。' : '') + '常见原因：模型不支持图片 / 联网搜索 / 某个参数，或者对话太长。' };
    if (s === 402) return { t: '余额不足（402）', d: '去平台充值或换一个 Key。' };
    if (s === 429) return { t: '太频繁或额度用完（429）', d: '等一会儿再试；免费额度常有每分钟次数限制。' };
    if (s >= 500) return { t: '平台那边出错了（' + s + '）', d: '不是你的问题，稍后再试，或者换一个模型。' };
    const m = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed|网络请求失败|TypeError/.test(m)) return { t: '连不上', d: N.native() ? '检查手机网络；接口地址要以 https:// 开头。' : '可能是没网，或者这家平台不允许网页直接访问（跨域限制）。装安卓版（走原生网络）就没有这个限制；也可以换一家支持网页访问的平台。' };
    return { t: '出错了', d: m.slice(0, 300) };
  };
})();
