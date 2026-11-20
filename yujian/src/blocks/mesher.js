// 方块网格：每个 16×16×16 分块生成一份网格，只画露在外面的面（挨着实心方块的面不画——看不见的一律不画）。
// 每个顶点算“角落遮蔽”（墙角、地缝自然变暗），每块方块颜色轻微抖动，花纹交给着色器按花纹编号现场画（柔和、无像素颗粒）。
// 着色器还负责：方块边缘的柔和倒角感、灯具发光、剖切（某层以上整片不画，看清屋里）。
import * as THREE from 'three';
import { BLOCKS, OPAQUE } from './defs.js';
import { CS } from './world.js';

const AO = [0.52, 0.68, 0.84, 1];
const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const COL = BLOCKS.map((b) => b && ['top', 'side', 'bottom'].map((k) => new THREE.Color(b[k].c)));
const WATER_PAT = 19;

/** 一个分块 → { solid, clear }（不透明网格、半透明网格：玻璃和水），都可能是 null */
export function meshChunk(world, cx, cy, cz) {
  const S = { p: [], n: [], c: [], pat: [], glow: [], idx: [] }, T = { p: [], n: [], c: [], pat: [], glow: [], idx: [] };
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS, g = (x, y, z) => world.get(x, y, z), op = (x, y, z) => OPAQUE[g(x, y, z)];
  const tmp = new THREE.Color();
  for (let y = y0; y < y0 + CS; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
    const b = g(x, y, z); if (!b) continue;
    const def = BLOCKS[b], clear = !OPAQUE[b], out = clear ? T : S, jit = 0.95 + h3(x, y, z) * 0.1;
    for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
      const n = [0, 0, 0]; n[a] = s; const nx = x + n[0], ny = y + n[1], nz = z + n[2], nb = g(nx, ny, nz);
      // 看得见才画：挨着不透明方块的面不画；同种玻璃/水之间的面不画；水面只在挨着空气（或玻璃）时画
      if (OPAQUE[nb]) continue;
      if (clear && nb === b) continue;
      if (def.water && nb && !BLOCKS[nb].glass) continue;
      const face = a === 1 ? (s > 0 ? 0 : 2) : 1, col = COL[b][face], pat = def.water ? WATER_PAT : def[['top', 'side', 'bottom'][face]].p;
      const bA = (a + 1) % 3, cA = (a + 2) % 3, base = out.p.length / 3, aos = [];
      const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
      for (const [cb, cc] of corners) {
        const v = [x, y, z]; v[a] += s > 0 ? 1 : 0; v[bA] += cb; v[cA] += cc;
        // 角落遮蔽：看这个角外侧的两条边和一个角是不是实心
        const eb = [0, 0, 0], ec = [0, 0, 0]; eb[bA] = cb ? 1 : -1; ec[cA] = cc ? 1 : -1;
        const s1 = op(nx + eb[0], ny + eb[1], nz + eb[2]), s2 = op(nx + ec[0], ny + ec[1], nz + ec[2]), cn = op(nx + eb[0] + ec[0], ny + eb[1] + ec[1], nz + eb[2] + ec[2]);
        const ao = clear ? 3 : s1 && s2 ? 0 : 3 - (s1 + s2 + cn); aos.push(ao);
        out.p.push(v[0], v[1], v[2]); out.n.push(n[0], n[1], n[2]);
        tmp.copy(col).multiplyScalar(AO[ao] * jit * (face === 2 ? 0.8 : 1)); out.c.push(tmp.r, tmp.g, tmp.b);
        out.pat.push(pat); out.glow.push(def.glow || 0);
      }
      // 四个角明暗不一时，沿着暗的那条对角线切，渐变才顺
      if (aos[0] + aos[2] >= aos[1] + aos[3]) out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else out.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
  const make = (o) => {
    if (!o.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); geo.setAttribute('pat', new THREE.Float32BufferAttribute(o.pat, 1)); geo.setAttribute('glow', new THREE.Float32BufferAttribute(o.glow, 1));
    geo.setIndex(o.idx); geo.computeBoundingSphere(); return geo;
  };
  return { solid: make(S), clear: make(T) };
}

/** 方块材质：在标准光照材质上加花纹、倒角、发光和剖切 */
export function blockMaterial({ transparent = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, transparent, depthWrite: !transparent, side: THREE.FrontSide, envMapIntensity: 0.8 });
  m.userData.uCut = { value: 999 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = m.userData.uCut; sh.uniforms.uGrass = { value: new THREE.Color('#7fb04a') };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pat; attribute float glow; varying vec3 vBP; varying vec3 vNo; varying float vPat; varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = position; vNo = normal; vPat = pat; vGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCut; uniform vec3 uGrass; varying vec3 vBP; varying vec3 vNo; varying float vPat; varying float vGlow;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (vBP.y > uCut + 0.01) discard;
  vec3 n = normalize(vNo); vec2 wp;
  if (abs(n.y) > 0.5) wp = vBP.xz; else if (abs(n.x) > 0.5) wp = vec2(vBP.z, vBP.y); else wp = vec2(vBP.x, vBP.y);
  vec2 uv = fract(wp - n.xz * 0.0); vec3 col = diffuseColor.rgb; float m = 0.93 + (vn(wp * 5.0) * 0.5 + vn(wp * 11.0) * 0.5) * 0.12, al = 1.0; int pt = int(vPat + 0.5);
  if (pt == 1) m *= 0.9 + vn(wp * 9.0) * 0.2;
  else if (pt == 2) { float gb = smoothstep(0.7, 0.76, uv.y + (vn(vec2(wp.x * 9.0, 1.0)) - 0.5) * 0.14); col = mix(col, uGrass * (0.9 + 0.1 * h21(floor(wp))), gb); }
  else if (pt == 3) m *= 0.82 + 0.28 * smoothstep(0.25, 0.75, vn(vec2(wp.x * 8.0, wp.y * 1.3)));
  else if (pt == 4) { float r = length(uv - 0.5); m *= 0.86 + 0.16 * smoothstep(0.35, 0.65, fract(r * 5.0)); if (r > 0.43) col *= 0.62; }
  else if (pt == 5) { float bd = fract(uv.y * 4.0); m *= 0.8 + 0.2 * smoothstep(0.0, 0.07, bd) * smoothstep(1.0, 0.93, bd); m *= 0.94 + 0.1 * h21(vec2(floor(wp.y * 4.0), floor(wp.x))); }
  else if (pt == 6) { float row = floor(uv.y * 4.0), bx = fract(uv.x * 2.0 + mod(row, 2.0) * 0.5), by = fract(uv.y * 4.0); m *= 0.74 + 0.26 * min(smoothstep(0.0, 0.05, bx) * smoothstep(1.0, 0.95, bx), smoothstep(0.0, 0.1, by) * smoothstep(1.0, 0.9, by)); m *= 0.94 + 0.1 * h21(vec2(floor(wp.x * 2.0 + mod(row, 2.0) * 0.5), floor(wp.y * 4.0))); }
  else if (pt == 7) m *= 0.84 + 0.26 * vn(wp * 4.0);
  else if (pt == 8) m *= 0.74 + 0.32 * smoothstep(0.32, 0.56, vn(wp * 4.5));
  else if (pt == 9) { float ry = fract(uv.y * 4.0), sc = abs(fract(uv.x * 4.0 + mod(floor(uv.y * 4.0), 2.0) * 0.5) - 0.5); m *= 0.72 + 0.3 * smoothstep(0.0, 0.18, ry - sc * 0.5); }
  else if (pt == 10) m *= 0.78 + 0.32 * vn(vec2(wp.x * 22.0, wp.y * 2.5));
  else if (pt == 11) { vec2 e = min(uv, 1.0 - uv); float fr = step(min(e.x, e.y), 0.07); al = mix(0.26, 1.0, fr); m *= mix(1.08, 0.82, fr); }
  else if (pt == 12) { m *= 0.72 + 0.42 * vn(wp * 7.0); if (vn(wp * 9.0 + 3.0) > 0.7) m *= 0.62; }
  else if (pt == 13) m *= 0.95 + 0.05 * sin(uv.x * 63.0) * sin(uv.y * 63.0);
  else if (pt == 14) { float sh = fract(uv.y * 2.0); if (sh < 0.13) m *= 0.62; else { float id = floor(uv.x * 7.0) + floor(uv.y * 2.0) * 7.0 + floor(wp.x) * 13.0 + floor(wp.y) * 7.0, k = h21(vec2(id, 1.3)); vec3 bk = k < 0.25 ? vec3(0.55, 0.12, 0.09) : k < 0.5 ? vec3(0.12, 0.25, 0.42) : k < 0.75 ? vec3(0.2, 0.36, 0.15) : vec3(0.75, 0.66, 0.45); col = mix(col, bk, 0.85); m *= 0.85 + 0.2 * step(0.15, fract(uv.x * 7.0)); } }
  else if (pt == 15) { vec2 e = min(uv, 1.0 - uv); float fr = step(min(e.x, e.y), 0.12); col = mix(col * 1.15, vec3(0.22, 0.12, 0.08), fr); if (abs(fract(uv.y * 3.0) - 0.5) < 0.035) col *= 0.7; }
  else if (pt == 16) m *= 0.95 + 0.08 * vn(wp * 16.0);
  else if (pt == 17) { vec2 q = fract(uv * 2.0); if (min(q.x, q.y) < 0.07 || max(q.x, q.y) > 0.93) { col = vec3(0.32, 0.2, 0.12); } else al = 0.85; }
  else if (pt == 18) { float v = abs(sin((wp.x + wp.y) * 3.0 + vn(wp * 3.0) * 6.0)); m *= 0.9 + 0.1 * smoothstep(0.0, 0.12, v); }
  else if (pt == 19) { al = 0.72; m *= 0.92 + 0.12 * vn(wp * 3.0); }
  // 方块边缘：一圈柔和的暗边，像圆角倒角（玻璃、水不加）
  if (pt != 11 && pt != 19) { vec2 e = min(uv, 1.0 - uv); m *= mix(0.84, 1.0, smoothstep(0.0, 0.07, min(e.x, e.y))); }
  diffuseColor.rgb = col * m; diffuseColor.a *= al;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.3;');
  };
  m.customProgramCacheKey = () => 'block-' + transparent;
  return m;
}
