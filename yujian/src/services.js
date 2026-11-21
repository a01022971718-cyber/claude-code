// 平台服务的抽象层：存储、数据埋点、激励视频。H5 版先用本地实现，接微信或小红书时只换这一个文件。
const mem = {};
export const store = {
  get(k) { try { const v = localStorage.getItem(k); return v == null ? (mem[k] ?? null) : v; } catch { return mem[k] ?? null; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch { /* 隐私模式等情况下只存在内存里 */ } },
  del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

// ---------- 埋点 ----------
const LOG_KEY = 'yujian_events_v1';
let log = [];
try { log = JSON.parse(store.get(LOG_KEY) || '[]'); } catch { log = []; }
let flushTimer = 0;
export const analytics = {
  session: Math.random().toString(36).slice(2, 10),
  track(event, params = {}) {
    log.push({ e: event, t: Date.now(), s: this.session, ...params });
    if (log.length > 800) log = log.slice(-600);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => store.set(LOG_KEY, JSON.stringify(log)), 800);
  },
  all() { return log.slice(); },
  clear() { log = []; store.del(LOG_KEY); },
};

// ---------- 激励视频（模拟） ----------
// 真实平台：把 show() 换成 wx.createRewardedVideoAd 等接口，返回 Promise<boolean>（是否完整看完）。
export const ads = {
  ui: null, // 由界面层注入：(slot) => Promise<boolean>
  async show(slot) {
    analytics.track('ad_show', { slot });
    const ok = this.ui ? await this.ui(slot) : true;
    analytics.track(ok ? 'ad_complete' : 'ad_abort', { slot });
    return ok;
  },
};

// 是否运行在受限的预览框架里（下载会被拦截，改为长按保存）
export const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
