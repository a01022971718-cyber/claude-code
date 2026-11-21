// 模型预览图：node tools/sheet.cjs <模块路径> <输出.png> [每行个数]
// 把模块里所有导出的模型函数排成网格，用游戏灯光渲染成一张图，方便检查造型。
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const [mod, out = 'sheet.png', colsArg] = process.argv.slice(2);
  if (!mod) { console.error('用法: node tools/sheet.cjs src/models/xxx.js out.png [cols]'); process.exit(1); }
  const root = path.resolve(__dirname, '..');
  const tmp = path.join(__dirname, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const entry = `
import * as THREE from 'three';
import * as M from ${JSON.stringify(path.resolve(root, mod))};
import { G, mulberry32 } from ${JSON.stringify(path.join(root, 'src/geo.js'))};
const names = Object.keys(M).filter(k => typeof M[k] === 'function');
const cols = ${Number(colsArg) || 0} || Math.ceil(Math.sqrt(names.length * 1.6));
const rows = Math.ceil(names.length / cols), cell = 2.6;
const W = 1400, H = Math.round(W * (rows * 0.62 + 0.5) / cols);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.style.margin = '0'; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe3ea);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x9a8a6a, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(-8, 14, 9); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.far = 80; sun.shadow.normalBias = 0.03;
scene.add(sun);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x9ad36a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const info = [];
names.forEach((name, i) => {
  const cx = (i % cols - (cols - 1) / 2) * cell, cz = (Math.floor(i / cols) - (rows - 1) / 2) * cell;
  const grp = new THREE.Group(); grp.position.set(cx, 0, cz); scene.add(grp);
  let res, err = '';
  try { res = M[name](mulberry32(i * 97 + 5)); } catch (e) { err = String(e.message || e); }
  let tris = 0;
  const addG = (g, at) => { if (!(g instanceof G) || !g.count) return; tris += g.tris; const m = new THREE.Mesh(g.toGeometry(), mat); m.castShadow = m.receiveShadow = true; if (at) m.position.set(at[0], at[1], at[2]); grp.add(m); };
  if (res instanceof G) addG(res);
  else if (res && typeof res === 'object') {
    if (res.static) addG(res.static);
    if (res.parts) for (const k in res.parts) { const p = res.parts[k]; if (p instanceof G) addG(p); else if (p && p.g) addG(p.g, p.at); }
  }
  let size = '';
  if (grp.children.length) { const b = new THREE.Box3().setFromObject(grp), s = b.getSize(new THREE.Vector3()); size = s.x.toFixed(2) + '×' + s.y.toFixed(2) + '×' + s.z.toFixed(2) + ' minY=' + (b.min.y).toFixed(2); }
  info.push({ name, tris, size, err, cx, cz });
});
const aspect = W / H, halfW = cols * cell / 2 + 0.6;
const cam = new THREE.OrthographicCamera(-halfW, halfW, halfW / aspect, -halfW / aspect, 0.1, 200);
cam.position.set(14, 26, 30); cam.lookAt(0, 0.4, 0);
renderer.render(scene, cam);
for (const it of info) {
  const v = new THREE.Vector3(it.cx, 0, it.cz + cell * 0.42).project(cam);
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;transform:translate(-50%,0);font:600 13px sans-serif;color:#123;text-align:center;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff';
  d.style.left = ((v.x * 0.5 + 0.5) * W) + 'px'; d.style.top = ((-v.y * 0.5 + 0.5) * H) + 'px';
  d.innerHTML = it.name + '<br><span style="font-weight:400;font-size:11px">' + (it.err ? '出错: ' + it.err : it.tris + ' 面 · ' + it.size) + '</span>';
  document.body.appendChild(d);
}
window.__info = info; window.__size = [W, H]; window.__done = true;
`;
  const tag = 'sheet-' + process.pid;
  const outJs = path.join(tmp, tag + '.js');
  await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', outfile: outJs, logLevel: 'error' });
  const html = path.join(tmp, tag + '.html');
  fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body style="position:relative"><script src="' + tag + '.js"></script></body>');
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('页面错误:', e.message));
  await page.goto('file://' + html);
  await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
  const [W, H] = await page.evaluate('window.__size');
  await page.setViewportSize({ width: W, height: Math.min(H, 4000) });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: Math.min(H, 4000) } });
  const info = await page.evaluate('window.__info');
  for (const it of info) console.log(`${it.name.padEnd(18)} ${String(it.tris).padStart(5)} 面  ${it.size} ${it.err ? ' 出错: ' + it.err : ''}`);
  await browser.close();
  fs.rmSync(outJs, { force: true }); fs.rmSync(html, { force: true });
  console.log('已输出', out);
})().catch((e) => { console.error(e); process.exit(1); });
