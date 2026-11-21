// 实时渲染的共享部分：全局时间/夜晚/云影参数，以及给地块材质打的着色器补丁（风吹摇摆、云影、夜间灯光自发光）。
import * as THREE from 'three';
import { TOP } from './config.js';

export const FX = {
  uTime: { value: 0 },
  uNight: { value: 0 },   // 0 白天 … 1 深夜：灯笼、窗户发光
  uCloud: { value: 1 },   // 云影强度（夜里为 0）
  uWind: { value: 1 },    // 风力
};

// 低频噪声云影，地块和海面共用
export const CLOUD_GLSL = /* glsl */`
float fxH(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float fxN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxH(i), fxH(i + vec2(1.0, 0.0)), f.x), mix(fxH(i + vec2(0.0, 1.0)), fxH(i + vec2(1.0, 1.0)), f.x), f.y); }
float fxCloud(vec2 p, float t){ vec2 q = p * 0.05 + vec2(t * 0.013, t * 0.007);
  float n = fxN(q) * 0.62 + fxN(q * 2.3 + 3.1) * 0.38; return smoothstep(0.5, 0.7, n); }
`;

/** 地块材质（顶点色 + 平面着色）。fx=true 时带风、云影、夜灯 */
export function landMaterial(fx = true) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  if (!fx) return mat;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FX);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uWind;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 fxw = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float fxs = sway * uWind;
        transformed.x += sin(uTime * 1.7 + fxw.x * 0.9 + fxw.z * 0.6) * 0.045 * fxs;
        transformed.z += cos(uTime * 1.3 + fxw.x * 0.5 - fxw.z * 0.8) * 0.03 * fxs;
        vWP = fxw;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uNight;\nuniform float uCloud;\nvarying vec3 vWP;\n' + CLOUD_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 灯光色（灯笼、窗户、灯室）在夜里自发光
        float fxLamp = step(0.9, vColor.r) * step(0.6, vColor.g) * step(vColor.g, 0.86) * step(0.17, vColor.b) * step(vColor.b, 0.34);
        totalEmissiveRadiance += vColor.rgb * fxLamp * uNight * 2.6;
        diffuseColor.rgb *= 1.0 - fxCloud(vWP.xz, uTime) * 0.2 * uCloud * step(${(TOP - 0.2).toFixed(2)}, vWP.y);`);
  };
  mat.customProgramCacheKey = () => 'land-fx';
  return mat;
}

/** 每个顶点的摇摆权重：只有植物（绿叶、麦子、花树）且高出地面的部分会随风动 */
export function swayWeights(pos, col) {
  const n = pos.length / 3, out = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const y = pos[v * 3 + 1] - TOP;
    if (y < 0.03) continue;
    const r = col[v * 3], g = col[v * 3 + 1], b = col[v * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx <= 0 || d <= 0) continue;
    const sat = d / mx;
    let hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (hue < 0) hue += 360;
    const plant = (hue > 70 && hue < 170 && sat > 0.25)             // 绿色枝叶、草
      || (hue >= 30 && hue <= 60 && sat > 0.6)                        // 麦子、草捆
      || ((hue > 320 || hue < 15) && mn > 0.22 && mx > 0.8);          // 粉色花树
    if (plant) out[v] = Math.min(255, Math.round(Math.min(1, y / 1.0) * 255));
  }
  return out;
}
