// 性能：帧时间记录、真机测速、实时角标。
// 真机测速（设置 → 性能测试）：镜头绕岛转 20 秒，统计平均帧率、1% 低帧、帧时间分位数、绘制调用、三角面，
// 连同显卡型号、像素比、画质档位一起生成一段可复制的结果，方便在不同手机上对比。
export class PerfMonitor {
  constructor(app) {
    this.app = app;
    this.buf = new Float32Array(1200); this.n = 0; this.i = 0;   // 最近 1200 帧的帧时间（毫秒）
    this.calls = 0; this.tris = 0;
    const r = app.view.renderer; if (r) r.info.autoReset = false;
    if (new URLSearchParams(location.search).get('perf') === '1' || app.game.s.settings.showFps) this._overlay();
  }
  /** 每帧开始时调用（先把上一帧的绘制统计取出来再清零） */
  begin() {
    const r = this.app.view.renderer; if (!r) return;
    this.calls = r.info.render.calls; this.tris = r.info.render.triangles; r.info.reset();
  }
  frame(ms) { if (this.benching) this.benchFrames++; this.buf[this.i] = ms; this.i = (this.i + 1) % this.buf.length; this.n = Math.min(this.n + 1, this.buf.length); if (this.el && (this.i & 15) === 0) this._draw(); }
  /** 最近 count 帧的统计 */
  stats(count = 300) {
    const n = Math.min(count, this.n); if (!n) return null;
    const a = []; for (let k = 0; k < n; k++) a.push(this.buf[(this.i - 1 - k + this.buf.length) % this.buf.length]);
    a.sort((x, y) => x - y);
    const sum = a.reduce((x, y) => x + y, 0), q = (p) => a[Math.min(n - 1, Math.floor(p * n))];
    return { fps: 1000 / (sum / n), low1: 1000 / q(0.99), ms50: q(0.5), ms95: q(0.95), ms99: q(0.99), frames: n };
  }
  device() {
    const r = this.app.view.renderer, gl = r?.getContext(); let gpu = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { gpu = '未知'; }
    return { gpu, dpr: window.devicePixelRatio || 1, pr: r?.getPixelRatio?.() ?? 1, size: `${innerWidth}×${innerHeight}`, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0, ua: navigator.userAgent.slice(0, 160) };
  }
  /** 镜头绕岛 sec 秒，返回测速结果 */
  async benchmark(sec = 20) {
    const app = this.app, rig = app.rig, saved = { x: rig.focus.x, z: rig.focus.z, yaw: rig.target.yaw, pitch: rig.target.pitch, dist: rig.target.dist };
    app.ui.closeModal(); app.ui.hud(false); rig.locked = true; this.benching = true;
    const t0 = performance.now(); this.benchFrames = 0; let maxCalls = 0, maxTris = 0;
    await new Promise((res) => {
      const step = () => {
        const u = (performance.now() - t0) / 1000 / sec;
        if (u >= 1) return res();
        // 一圈环绕 + 拉近拉远 + 俯角变化：覆盖远景（草叶多）和近景（细节多）
        rig.setView({ yaw: saved.yaw + u * Math.PI * 2, pitch: 0.45 + Math.sin(u * Math.PI * 2) * 0.18, dist: 14 + Math.cos(u * Math.PI * 4) * 6 });
        maxCalls = Math.max(maxCalls, this.calls); maxTris = Math.max(maxTris, this.tris);
        requestAnimationFrame(step);
      };
      step();
    });
    const st = this.stats(Math.min(this.benchFrames, this.buf.length));
    rig.focus.set(saved.x, 0, saved.z); rig.setView(saved); rig.locked = false; this.benching = false; app.ui.hud(true);
    const s = app.game.s.settings, v = app.view;
    return {
      版本: 'v0.10', 画面: v.kind === 'hq' ? '高画质' : '低多边形', 档位: s.quality, 自定义: JSON.stringify(s.gfx || {}), 模式: app.canvasMode ? '自由画布' : '经营',
      平均帧率: +st.fps.toFixed(1), 低帧1: +st.low1.toFixed(1), 帧时间中位: +st.ms50.toFixed(1), 帧时间95: +st.ms95.toFixed(1), 帧时间99: +st.ms99.toFixed(1),
      绘制调用峰值: maxCalls, 三角面峰值: maxTris, 帧率上限: app.fpsCap(false), 分辨率系数: v.resScale ?? 1, 加载毫秒: app.loadMs ?? 0, 地块: v.terrain?.tiles?.length ?? 0, 区块: v.chunks?.size ?? 0,
      ...this.device(),
    };
  }
  /** 设置里的“显示帧率” */
  setOverlay(on) { if (on && !this.el) this._overlay(); else if (!on && this.el) { this.el.remove(); this.el = null; } }
  _overlay() {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:50%;top:6px;transform:translateX(-50%);padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font:11px/1.4 ui-monospace,monospace;pointer-events:none;z-index:9;white-space:nowrap';
    document.getElementById('app').appendChild(d); this.el = d;
  }
  _draw() {
    const s = this.stats(120); if (!s) return;
    this.el.textContent = `${s.fps.toFixed(0)} fps · 1%低 ${s.low1.toFixed(0)} · ${s.ms95.toFixed(1)}ms · ${this.calls} 次绘制 · ${(this.tris / 1000).toFixed(0)}k 面 · ${this.app.game.s.settings.quality}`;
  }
}
