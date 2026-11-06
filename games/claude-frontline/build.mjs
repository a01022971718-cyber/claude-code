// 把 index.html + css + js 打包成一个可以直接分享的单文件：dist/claude-frontline.html
// 用法：node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${readFileSync(join(root, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n/* ${src} */\n${code}\n</script>`;
});

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'claude-frontline.html');
writeFileSync(out, html);
console.log(`已生成 ${out}（${(html.length / 1024).toFixed(0)} KB）`);
