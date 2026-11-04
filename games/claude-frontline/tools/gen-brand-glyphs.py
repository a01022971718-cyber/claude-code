"""把主标题用到的字形轮廓导出为 js/brand-glyphs.js（矢量路径，不依赖系统字体）。

字体：Noto Sans SC Black（中文）与 Noto Sans Black（拉丁），均为 SIL Open Font License 1.1。
用法：
  pip install fonttools brotli
  python3 tools/gen-brand-glyphs.py <NotoSansSC-Black 子集> <NotoSans-Black 子集> [额外中文字符]
下载子集示例（只取需要的字）：
  https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@900&text=战线益造物者之路役
坐标：每字 1000 单位，y 轴向下，基线 y=880。
"""
import json, re, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

CJK = '战线益造物者之路役新生向上探索未知' + (sys.argv[3] if len(sys.argv) > 3 else '')
out = {}
for path, chars in [(sys.argv[1], CJK), (sys.argv[2], 'XS-')]:
    f = TTFont(path)
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm
    s = 1000 / upm
    for ch in dict.fromkeys(chars):
        gn = cmap.get(ord(ch))
        if not gn:
            print('missing', ch, file=sys.stderr)
            continue
        pen = SVGPathPen(gs)
        gs[gn].draw(TransformPen(pen, (s, 0, 0, -s, 0, 880)))
        bp = BoundsPen(gs)
        gs[gn].draw(bp)
        x0, y0, x1, y1 = bp.bounds
        d = re.sub(r'(-?\d+\.\d+)', lambda m: str(round(float(m.group(1)))), pen.getCommands())
        out[ch] = {'d': d, 'w': round(gs[gn].width * s), 'b': [round(x0 * s), round(880 - y1 * s), round(x1 * s), round(880 - y0 * s)]}

js = ('/* 自动生成：python3 tools/gen-brand-glyphs.py —— 主标题字形轮廓\n'
      ' * 字形来自 Noto Sans SC Black / Noto Sans Black（SIL Open Font License 1.1）。\n'
      ' * 每字 1000 单位，y 向下，基线 880；d = SVG 路径，w = 字宽，b = [x0, y0, x1, y1] 包围盒。 */\n'
      'window.CF = window.CF || {};\nwindow.CF.GLYPHS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
open('js/brand-glyphs.js', 'w', encoding='utf-8').write(js)
print(len(out), 'glyphs,', len(js), 'chars')
