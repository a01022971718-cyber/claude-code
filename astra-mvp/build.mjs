// Bundles src/ into one self-contained page: dist/page.html (what gets published)
// and dist/index.html (the same page inside a plain HTML skeleton, for local testing).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const shim = resolve('src/three-shim.cjs');
const out = await build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
  plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: shim })); } }],
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('src/style.css', 'utf8');
const page = readFileSync('src/page.html', 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => js).replace('__THREE__', CDN);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/page.html', page);
copyFileSync('node_modules/three/build/three.min.js', 'dist/three.min.js');
const local = page.replace(CDN, './three.min.js');
writeFileSync('dist/index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${local}</body></html>`);
console.log('built', (page.length / 1024).toFixed(0) + ' KB');
