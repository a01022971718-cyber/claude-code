// 回归测试：node tools/regress.cjs [名字片段]
// 先 node build.mjs --dev，然后在无头浏览器里逐个跑 tools/tests/ 下的场景，检查：没有页面报错 + 场景返回值符合预期。
// 场景脚本里可以用 window.__shot(名字) 截图（存到 tools/tests/out/）。
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'tests/out'); fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  { name: '六边形岛·经典主题能正常渲染', file: 'island-classic.js', query: 'debug=1', check: (r) => Array.isArray(r) && r.length === 0 },
  { name: '六边形岛·体素近景：草花麦为体素、近景草层分帧重建不卡顿', file: 'island-voxel-close.js', query: 'debug=1&style=blocky&q=ultra', check: (r) => r.tris < 400000 && r.worstSliceMs < 20 },
  { name: '六边形岛·体素主题的建筑、小船浮标、海洋生物都是方块版', file: 'island-voxel-world.js', query: 'debug=1&style=blocky&q=high', check: (r) => r.placed >= 8 && r.propTris < 40000 && r.marine && r.marine.fish && r.marine.dolphin && r.marine.jelly && r.marine.habitat !== false },
  { name: '六边形岛·造物台做的生态进地块栏「✦ 我造的」，能铺、按配方长植物', file: 'island-mybiome.js', query: 'debug=1&style=blocky&q=high', check: (r) => r.chip && r.named && r.placed >= 2 && r.after === 0 },
  { name: '六边形岛·AI 自主代理（模拟回复）：看岛、自由造物、设计生态、铺地摆放、截图检查、撤销', file: 'island-agent.js', query: 'debug=1&style=blocky&q=high', check: (r) => r.steps === 5 && r.tools.length === 9 && r.schemaOk && r.mk && r.bm && r.newTiles === 3 && r.placedMk === 2 && r.shotImage && r.sea === 'jade' && r.makes === 1 && r.biomes[0] === '金色苔原:松树/石头' && r.summary && r.bibleBack && r.undo.tiles && r.undo.items && r.undo.makes === 0 && r.undo.biomes === 0 },
  { name: '六边形岛·放东西有反馈、竖屏撤销擦除不被遮挡', file: 'island-feedback.js', query: 'style=blocky', vw: 390, vh: 844, check: (r) => r.fxActive >= 1 && r.bl[3] < r.strip[1] },
  { name: '方块岛·点放、划动摆一排、按住拆、选取、蓝图存取放', file: 'blocks-build.js', query: 'mode=blocks', check: (r) => r.placeOne === 1 && r.row >= 8 && r.holdBreak === -1 && r.picked === 1 && r.bp.length === 1 && r.make.length === 1 && r.copied > 100 },
  { name: '造物台·单手：单指在空处拖动转视角（不动方块）', file: 'one-finger.js', query: 'mode=blocks', vw: 390, vh: 844, check: (r) => r.yawChanged && r.makeUnchanged },
  { name: '造物台·添加、上色、拖手柄改大小、保存', file: 'studio-edit.js', query: 'mode=blocks', check: (r) => r.added >= 1 && r.s1 > r.s0 && r.saved.length === 1 },
  { name: '造物台·转过角度的块沿自身方向改大小', file: 'studio-rotate.js', query: 'mode=blocks', check: (r) => r.s[0] > 4 && Math.abs(Math.abs(r.dp[0]) - Math.abs(r.dp[2])) < 0.3 && Math.abs(r.dp[0]) > 0.5 },
  { name: '造物台·多选、整组拖动缩放旋转、部件复制镜像、✦ 精修（模拟回复）', file: 'studio-multi.js', query: 'mode=blocks', check: (r) => r.groupMove.n === 6 && r.groupMove.dys.length === 1 && r.groupMove.dys[0] > 0 && r.groupMove.pivotDy === r.groupMove.dys[0] && r.scale.earS > 2.4 && r.scale.sym && r.rot.moved && r.mirror.parts === 1 && r.mirror.name.startsWith('右前腿') && r.mirror.pivotX < 0 && r.dup === 2 && r.multi === 2 && Math.abs(r.minY) < 0.01 && r.refine.btnShown && r.refine.img && r.refine.hasNotes && r.refine.added === 1 && r.refine.schemaNotes },
  { name: '造物台·生态：新建、调颜色和植物、保存；AI 配生态、看图精修、撤回（模拟回复）', file: 'studio-biome.js', query: 'mode=blocks', check: (r) => r.mode && r.panel && r.plants1 > r.plants0 + 5 && r.colors[0] === '#c8a060' && r.saved[0] === '金秋松林' && r.ai.name === '蓝月苔原' && r.ai.plants.join() === '石头,松树' && r.ai.listsPlants && r.ai.refineShown && r.refine.img && r.refine.notes && r.refine.fc === 3 && r.refine.undoBtn && r.refine.undone && r.lib.length === 2 },
  { name: '造物台·返回回到列表、就地配置 AI、AI 帮我做 = 代理（写 → 看图 → 改）（模拟回复）', file: 'studio-agent.js', query: 'mode=blocks', check: (r) => r.backToLib && r.aiSettings && r.agent.steps === 4 && r.agent.tools.join() === 'view_make,set_make' && r.agent.name === '橘猫团子' && r.agent.tail === 9 && r.agent.renderToModel && r.agent.noTemplate && r.agent.done },
];
(async () => {
  const only = process.argv[2]; let fail = 0;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const c of CASES) {
    if (only && !c.name.includes(only) && !c.file.includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: c.vw || 834, height: c.vh || 375 } }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.exposeFunction('__shot', async (n) => { await page.screenshot({ path: path.join(OUT, c.file.replace('.js', '') + '-' + n + '.png'), timeout: 240000 }); });
    const t0 = Date.now(); let ret, err = null;
    try {
      await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?' + c.query);
      await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 180000 });
      ret = await page.evaluate(`(async () => { ${fs.readFileSync(path.join(__dirname, 'tests', c.file), 'utf8')} })()`);
      if (!c.check(ret)) err = '返回值不符合预期：' + JSON.stringify(ret).slice(0, 300);
    } catch (e) { err = e.message.split('\n')[0]; }
    if (!err && errors.length) err = '页面报错：' + errors.slice(0, 3).join(' | ');
    console.log(`${err ? '✗' : '✓'} ${c.name}（${((Date.now() - t0) / 1000).toFixed(0)}s）${err ? '\n    ' + err : ''}`); if (err) fail++;
    await page.close();
  }
  await browser.close();
  console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})();
