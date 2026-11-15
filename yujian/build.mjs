// 构建：把 src 打成一个 game.js，并生成两份页面——
//   dist/index.html     独立可玩的完整页面（直接用浏览器打开，或放到任意静态托管）
//   dist/artifact.html  发布到预览页用的片段（外层骨架由平台提供）
import esbuild from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');
await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: !dev, target: 'es2020',
  outfile: 'dist/game.js', legalComments: 'none', logLevel: 'warning',
});
const css = fs.readFileSync('src/styles.css', 'utf8');
const head = `<title>屿见</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${css}</style>`;
// 发布版把脚本直接内联进页面，一个文件就能运行
const js = fs.readFileSync('dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const body = `<div id="app"><canvas id="stage" aria-label="屿见游戏画面"></canvas><div id="ui"></div></div>\n` + (dev ? '<script src="game.js"></script>' : `<script>${js}</script>`);
fs.writeFileSync('dist/artifact.html', head + '\n' + body + '\n');
fs.writeFileSync('dist/index.html', `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('构建完成：game.js', kb('dist/game.js'), '· index.html', kb('dist/index.html'));
