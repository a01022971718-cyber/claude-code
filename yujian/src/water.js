// 风格化海面：按离岸距离从深蓝过渡到浅滩青色，岸边有白浪和向岸推进的波纹，海面有阳光碎闪。
// 基于 Lambert 材质改写，所以能接收岛屿的阴影和场景雾。
import * as THREE from 'three';
import { SHORE_RC } from './world.js';
import { FX, CLOUD_GLSL } from './fx.js';

const HEAD = /* glsl */`
uniform float uTime; uniform sampler2D uShore; uniform vec2 uShoreC; uniform float uShoreS;
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uGlint; uniform float uCloud; uniform float uNight;
varying vec3 vWPos;
${CLOUD_GLSL}
float whash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(whash(i), whash(i + vec2(1.0, 0.0)), f.x), mix(whash(i + vec2(0.0, 1.0)), whash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const BODY = /* glsl */`
{
  vec2 suv = vec2((vWPos.x - uShoreC.x) / uShoreS + 0.5, 0.5 - (vWPos.z - uShoreC.y) / uShoreS);
  float f = 0.0;
  if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) f = texture2D(uShore, suv).r;
  float s = clamp(f / ${(1 - 1 / SHORE_RC).toFixed(4)}, 0.0, 1.0);   // 0 = 深海，1 = 地块边缘
  float t = uTime; vec2 p = vWPos.xz;
  float wav = wnoise(p * 0.32 + vec2(t * 0.11, t * 0.07)) * 0.62 + wnoise(p * 0.85 - vec2(t * 0.16, -t * 0.12)) * 0.38;
  vec3 wc = mix(uDeep, uMid, smoothstep(0.0, 0.5, s));
  wc = mix(wc, uShallow, smoothstep(0.42, 0.93, s));
  wc *= 0.9 + wav * 0.2;
  float wob = wnoise(p * 2.3 + t * 0.25);
  float edge = smoothstep(0.885 - wob * 0.07, 0.935, s);
  float lines = smoothstep(0.72, 0.97, sin(s * 19.0 - t * 1.2 + wob * 2.6)) * smoothstep(0.4, 0.74, s) * (1.0 - smoothstep(0.84, 0.92, s));
  lines *= smoothstep(0.3, 0.62, wnoise(p * 0.8 + vec2(t * 0.08, -t * 0.05)));
  float foam = clamp(max(edge, lines * 0.6), 0.0, 1.0);
  wc *= 1.0 - fxCloud(p, t) * 0.17 * uCloud;
  wc = mix(wc, uFoam * (1.0 - uNight * 0.55), foam);
  // 远海的浪纹：沿一个方向拉长的柔和亮带
  float streak = smoothstep(0.58, 0.86, wnoise(vec2(p.x * 0.55 + p.y * 0.2, p.y * 2.1) + vec2(t * 0.22, t * 0.1)));
  wc += streak * 0.045 * (1.0 - s);
  float g = wnoise(p * 11.0 + vec2(t * 0.7, t * 0.4)) * wnoise(p * 15.0 - vec2(t * 0.6, t * 0.8));
  float glint = smoothstep(0.7, 0.76, g) * (1.0 - foam);
  diffuseColor.rgb = wc;
  diffuseColor.a = mix(mix(0.95, 0.62, smoothstep(0.5, 0.97, s)), 1.0, foam);
  totalEmissiveRadiance += uGlint * glint * mix(0.22, 0.35, uNight);
}
`;

export class Water {
  constructor(scene, shore) {
    this.u = {
      uTime: { value: 0 }, uShore: { value: shore.rt.texture }, uShoreC: { value: shore.center }, uShoreS: { value: shore.size },
      uDeep: { value: new THREE.Color(0x1b6690) }, uMid: { value: new THREE.Color(0x2a9bb8) }, uShallow: { value: new THREE.Color(0x86e6d2) },
      uFoam: { value: new THREE.Color(0xffffff) }, uGlint: { value: new THREE.Color(0xfff3d0) }, uCloud: FX.uCloud, uNight: FX.uNight,
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + HEAD)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY);
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  /** 跟随昼夜改变海色 */
  setSky(sky) {
    this.u.uDeep.value.copy(sky.deep); this.u.uMid.value.copy(sky.mid); this.u.uShallow.value.copy(sky.shallow);
    this.u.uGlint.value.copy(sky.sunColor).lerp(new THREE.Color(0xfff3d0), 0.5);
  }
  update(dt, fx, fz) {
    this.u.uTime.value += dt;
    this.mesh.position.set(fx, 0, fz);
  }
}
