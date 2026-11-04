# 用法：pip install potracer pillow numpy && python3 tools/trace-logo.py <图标.png> <标题.png>  → 输出 logo.json，再写入 js/brand-glyphs.js 的 CF.LOGO
# 把主创提供的标题图 / 图标描摹成矢量路径（亮色 = 图形，黑色 = 背景）
import sys, json
import numpy as np
from PIL import Image
import potrace

def trace(path, box=None, th=60, scale=1.0):
    im = Image.open(path).convert('L')
    if box: im = im.crop(box)
    if scale != 1.0: im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    a = np.array(im) <= th  # potracer：True 为背景
    bm = potrace.Bitmap(a)
    pl = bm.trace(turdsize=8, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.4)
    parts = []
    for curve in pl:
        sp = curve.start_point
        d = [f"M{sp.x:.1f} {sp.y:.1f}"]
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}")
            else:
                d.append(f"C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}")
        d.append('Z')
        parts.append(''.join(d))
    return ''.join(parts), im.width, im.height

out = {}
# 图三：图标
d, w, h = trace(sys.argv[1], th=40, scale=0.5)
out['icon'] = {'d': d, 'w': w, 'h': h}
# 图二：只取文字部分（图标在左，文字在右）
d, w, h = trace(sys.argv[2], box=(640, 150, 2172, 580), th=110, scale=0.6)
out['text'] = {'d': d, 'w': w, 'h': h}
json.dump(out, open('logo.json', 'w'))
print({k: (len(v['d']), v['w'], v['h']) for k, v in out.items()})
