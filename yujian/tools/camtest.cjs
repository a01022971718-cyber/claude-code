// 镜头手势测试：node tools/camtest.cjs <输出目录>
// 用 CDP 的多点触控模拟单指拖动、双指同向拖动、双指张合，检查镜头的反应；再截几张预设机位的图。
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const W = Number(process.env.W || 800), H = Number(process.env.H || 400);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?debug=1&q=' + (process.env.Q || 'smooth'));
  await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 180000 });
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), app = window.__game;
    if (document.getElementById('title') && !document.getElementById('title').hidden) document.getElementById('startBtn')?.click();
    const t0 = Date.now(); while (app.rig.locked && Date.now() - t0 < 60000) await sleep(100);
    app.hud?.endTutorial?.(); app.setTimeMode('fixed', 10);
    while (app.view.chunksDirty) await sleep(200);
    await sleep(1500);
  });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
  const state = () => page.evaluate(() => { const r = window.__game.rig; return { yaw: +r.target.yaw.toFixed(3), pitch: +r.target.pitch.toFixed(3), dist: +r.target.dist.toFixed(2), fx: +r.focus.x.toFixed(2), fz: +r.focus.z.toFixed(2), lookY: +r.lookY.toFixed(3), camY: +r.cam.position.y.toFixed(3), fov: +r.cam.fov.toFixed(1) }; });
  const settle = () => page.waitForTimeout(700);
  /** 两指从 a0,b0 各自移动 da,db，分 n 步 */
  const two = async (a0, b0, da, db, n = 16) => {
    await touch('touchStart', [a0, b0]);
    for (let i = 1; i <= n; i++) { const u = i / n; await touch('touchMove', [[a0[0] + da[0] * u, a0[1] + da[1] * u], [b0[0] + db[0] * u, b0[1] + db[1] * u]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []); await settle();
  };
  const one = async (p0, d, n = 14) => {
    await touch('touchStart', [p0]);
    for (let i = 1; i <= n; i++) { const u = i / n; await touch('touchMove', [[p0[0] + d[0] * u, p0[1] + d[1] * u]]); await page.waitForTimeout(16); }
    await page.waitForTimeout(120); await touch('touchEnd', []); await settle();
  };
  const res = {};
  res.start = await state();
  const cx = W / 2, cy = H / 2;
  await two([cx - 80, cy], [cx + 80, cy], [160, 0], [160, 0], 8); res.twoRight = await state();          // 双指一起往右：转视角
  await two([cx - 80, cy], [cx + 80, cy], [0, -100], [0, -100], 8); res.twoUp = await state();           // 双指一起往上：俯角变小
  await two([cx - 40, cy], [cx + 40, cy], [-100, 0], [100, 0], 8); res.pinchOut = await state();         // 张开：拉近
  await two([cx - 40, cy], [cx + 40, cy], [0, 0], [140, 30], 8); res.oneFingerPinch = await state();    // 一指不动另一指移动：缩放
  await page.evaluate(() => window.__game.rig.setView({ pitch: 0.08, dist: 5 })); await settle();
  res.lowBefore = await state();
  await one([cx, H * 0.15], [0, 160], 8); res.lowPanNearHorizon = await state();                      // 镜头很平，从天边往下拖
  await page.evaluate(() => { const r = window.__game.rig; r.target.dist = 0.2; r.target.pitch = 0.0; }); await page.waitForTimeout(1500);
  res.closeClamp = await page.evaluate(() => { const r = window.__game.rig, v = window.__game.view, p = r.cam.position; return { dist: +r.dist.toFixed(2), camY: +p.y.toFixed(3), ground: +((v.terrain.heightAt(p.x, p.z) ?? 0)).toFixed(3), near: +r.cam.near.toFixed(3) }; });
  // 预设机位截图
  for (const k of ['top', 'three', 'eye', 'close']) {
    await page.evaluate((k) => { const a = window.__game; a.rig.preset(k, a.islandHome()); }, k); await page.waitForTimeout(2600);
    res['preset_' + k] = await state();
    await page.screenshot({ path: path.join(out, 'cam-' + k + '.png'), timeout: 240000 });
  }
  await page.evaluate(() => window.__game.camDock.show(true)); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'cam-dock.png'), timeout: 240000 });
  console.log(JSON.stringify(res, null, 1));
  console.log(errors.length ? '错误:\n' + errors.join('\n') : '无报错');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
