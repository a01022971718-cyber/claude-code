// 构建高画质样张：dist/hq.html（独立单文件）和 dist/hq-artifact.html（发布到预览页用）
import esbuild from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');
await esbuild.build({
  entryPoints: ['src/hq/main.js'], bundle: true, format: 'iife', minify: !dev, target: 'es2020',
  outfile: 'dist/hq.js', legalComments: 'none', logLevel: 'warning',
});
const css = `
:root { --ink: #f4efe6; --glass: rgba(18, 28, 34, .42); --line: rgba(255, 255, 255, .16); --on: #f2c46b; color-scheme: dark; }
html, body { height: 100%; margin: 0; overflow: hidden; background: #0d1a22; color: var(--ink); font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif; }
#c { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.hud { position: fixed; left: 0; right: 0; pointer-events: none; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.top { top: 0; padding-top: calc(12px + env(safe-area-inset-top, 0px)); display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.top h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .12em; text-shadow: 0 1px 8px rgba(0, 0, 0, .45); }
.top h1 small { display: block; font-size: 12px; font-weight: 500; letter-spacing: .02em; opacity: .85; margin-top: 3px; }
.top .meta { text-align: right; font-size: 12px; opacity: .9; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); font-variant-numeric: tabular-nums; }
.bottom { bottom: 0; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; justify-content: center; }
#bar { pointer-events: auto; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 100%; }
.grp { display: flex; align-items: center; gap: 4px; padding: 5px 6px; border-radius: 14px; background: var(--glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: inset 0 0 0 1px var(--line); flex-wrap: wrap; }
.grp span { font-size: 11px; opacity: .7; padding: 0 4px 0 6px; letter-spacing: .08em; }
.grp button { font: inherit; font-size: 13px; color: var(--ink); background: transparent; border: 0; padding: 6px 10px; border-radius: 10px; cursor: pointer; }
.grp button.on { background: var(--on); color: #2a1d08; font-weight: 700; }
.grp button:focus-visible { outline: 2px solid var(--on); outline-offset: 1px; }
#err { position: fixed; inset: auto 16px 80px; padding: 12px; border-radius: 12px; background: #fff3; }
[hidden] { display: none !important; }
@media (max-width: 640px) { .grp button { padding: 6px 8px; font-size: 12px; } .top h1 { font-size: 17px; } }
`;
const head = `<title>屿见 · 画面样张</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${css}</style>`;
const js = fs.readFileSync('dist/hq.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const body = `<canvas id="c" aria-label="屿见高画质岛屿"></canvas>
<div class="hud top"><h1>屿见<small>高画质样张 · 拖动旋转，滚轮或双指缩放</small></h1><div class="meta"><div id="fps"></div><div id="info"></div></div></div>
<div class="hud bottom"><div id="bar"></div></div><div id="err" hidden></div>
` + (dev ? '<script src="hq.js"></script>' : `<script>${js}</script>`);
fs.writeFileSync('dist/hq-artifact.html', head + '\n' + body + '\n');
fs.writeFileSync('dist/hq.html', `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}</body>\n</html>\n`);
console.log('样张构建完成：hq.js', (fs.statSync('dist/hq.js').size / 1024).toFixed(0), 'KB');
