// 高画质道具预览：node tools/hq-sheet.cjs <模块路径> <输出.png> [每行个数] [宽] [--only=名字] [--az=30] [--el=40] [--seed=1] [--double]
// 把模块里所有导出的模型函数各渲染一个，排成网格；每个模型按包围盒自动缩放到格子里，
// 文字标注的是真实尺寸（模型单位）。--only 只渲染一个（放大看细节），--az 模型绕 y 旋转角，--el 相机俯角。
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const flags = {}, pos = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) { const [k, v = '1'] = a.slice(2).split('='); flags[k] = v; } else pos.push(a);
  }
  const [mod, out = 'hq-sheet.png', colsArg, widthArg] = pos;
  if (!mod) { console.error('用法: node tools/hq-sheet.cjs <模块路径> <输出.png> [每行个数] [宽] [--only=名字]'); process.exit(1); }
  const root = path.resolve(__dirname, '..');
  const tmp = path.join(__dirname, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const W = Number(widthArg) || 1600;
  const cfg = { only: flags.only || '', az: Number(flags.az ?? 30), el: Number(flags.el ?? 40), seed: Number(flags.seed ?? 1), double: !!flags.double, cols: Number(colsArg) || 0, W };

  const entry = `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as M from ${JSON.stringify(path.resolve(root, mod))};
const cfg = ${JSON.stringify(cfg)};
let names = Object.keys(M).filter(k => typeof M[k] === 'function');
if (cfg.only) names = names.filter(n => n === cfg.only);
const cols = cfg.only ? 1 : (cfg.cols || Math.ceil(Math.sqrt(names.length * 1.6)));
const rows = Math.ceil(names.length / cols), cell = 2.6, cellZ = cfg.only ? 2.6 : 3.6;
const el = cfg.el * Math.PI / 180;
const worldW = cols * cell + 0.4;
const worldH = rows * cellZ * Math.sin(el) + cell * (cfg.only ? 1.0 : 1.1);
const Wpx = cfg.W, Hpx = Math.round(Wpx * worldH / worldW);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(Wpx, Hpx);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.style.margin = '0'; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc9d9e2);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
const sun = new THREE.DirectionalLight(0xffe2b8, 2.5);
sun.position.set(-5, 9, 6); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera; const ext = Math.max(cols * cell, rows * cellZ) * 0.9 + 3;
sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = 40;
sun.shadow.normalBias = 0.02; sun.shadow.bias = -0.0004;
scene.add(sun);
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: cfg.double ? THREE.DoubleSide : THREE.FrontSide });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x9fcf7a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const info = [];
names.forEach((name, i) => {
  const cx = (i % cols - (cols - 1) / 2) * cell, cz = (Math.floor(i / cols) - (rows - 1) / 2) * cellZ;
  const slot = new THREE.Group(); slot.position.set(cx, 0, cz); scene.add(slot);
  let res, err = '';
  try { res = M[name](cfg.seed); } catch (e) { err = String(e.stack || e); }
  const it = { name, err, cx, cz, tris: 0, size: '', anchors: '' };
  if (res && res.geometry) {
    const g = res.geometry;
    for (const a of ['position', 'normal', 'color']) if (!g.attributes[a]) it.err += ' 缺少属性 ' + a;
    it.tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    g.computeBoundingBox();
    const b = g.boundingBox, s = b.getSize(new THREE.Vector3());
    it.size = s.x.toFixed(3) + ' x ' + s.y.toFixed(3) + ' x ' + s.z.toFixed(3) + '  minY=' + b.min.y.toFixed(3);
    it.dims = [s.x, s.y, s.z]; it.minY = b.min.y;
    it.anchors = JSON.stringify(res.anchors || {}, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v);
    const fit = cfg.only ? Math.min(2.0 / Math.max(s.x, s.z, s.y * 0.8), 8) : cell * 0.58 / Math.max(s.x, s.z, s.y * 0.8);
    const grp = new THREE.Group(); grp.scale.setScalar(fit); grp.rotation.y = -cfg.az * Math.PI / 180; slot.add(grp);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m);
    it.fit = fit;
  }
  info.push(it);
});
const cam = new THREE.OrthographicCamera(-worldW / 2, worldW / 2, worldH / 2, -worldH / 2, 0.1, 100);
const D = 30;
cam.position.set(0, D * Math.sin(el), D * Math.cos(el));
const target = new THREE.Vector3(0, cell * (cfg.only ? 0.35 : 0.3) * Math.cos(el), 0);
cam.position.add(target); cam.lookAt(target);
renderer.render(scene, cam);
for (const it of info) {
  const v = new THREE.Vector3(it.cx, 0, it.cz + cell * 0.5).project(cam);
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;transform:translate(-50%,0);font:600 14px sans-serif;color:#10222e;text-align:center;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff';
  d.style.left = ((v.x * 0.5 + 0.5) * Wpx) + 'px'; d.style.top = ((-v.y * 0.5 + 0.5) * Hpx) + 'px';
  d.innerHTML = it.name + '<br><span style="font-weight:400;font-size:12px">' + (it.err ? '出错: ' + it.err.split('\\n')[0] : Math.round(it.tris) + ' 面 · ' + it.size + (it.fit ? ' · 显示x' + it.fit.toFixed(1) : '')) + '</span>';
  document.body.appendChild(d);
}
window.__info = info; window.__size = [Wpx, Hpx]; window.__done = true;
`;

  const tag = 'hqsheet-' + process.pid;
  const outJs = path.join(tmp, tag + '.js');
  const html = path.join(tmp, tag + '.html');
  let browser;
  try {
    await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', outfile: outJs, logLevel: 'error' });
    fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body style="position:relative;margin:0"><script src="' + tag + '.js"></script></body>');
    browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('页面错误:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('页面' + m.type() + ':', m.text()); });
    await page.goto('file://' + html);
    await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
    const [Wpx, Hpx] = await page.evaluate('window.__size');
    await page.setViewportSize({ width: Wpx, height: Math.min(Hpx, 6000) });
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: Wpx, height: Math.min(Hpx, 6000) } });
    const info = await page.evaluate('window.__info');
    for (const it of info) {
      console.log(`${it.name.padEnd(11)} ${String(Math.round(it.tris)).padStart(5)} 面  ${it.size}  anchors=${it.anchors}${it.err ? '  出错: ' + it.err : ''}`);
    }
    console.log('已输出', out);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(outJs, { force: true }); fs.rmSync(html, { force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
