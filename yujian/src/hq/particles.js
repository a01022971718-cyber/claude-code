// 软粒子：阳光里飘的花粉光点、瀑布水雾、营火的火焰/火星/炊烟、夜里的萤火虫。
// 画在特效图层，按场景深度做软边（贴近物体时淡出，不会生硬地插进地面）。
import * as THREE from 'three';
import { U } from './materials.js';

const VERT = /* glsl */`
attribute vec4 seed;      // xyz 随机数，w 发射器类型
uniform float uTime; uniform float uPR; uniform vec3 uEmit[6];
varying vec4 vCol; varying float vViewZ; varying float vKind;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float kind = seed.w; vKind = kind;
  vec3 p; float size; vec4 col;
  if (kind < 0.5) {                     // 花粉：在岛上方缓慢漂浮
    vec3 b = (seed.xyz - 0.5) * vec3(14.0, 1.6, 12.0) + vec3(1.0, 1.5, -0.3);
    float t = uTime * 0.08;
    p = b + vec3(sin(t * 3.0 + seed.x * 40.0) * 0.6, sin(t * 5.0 + seed.y * 30.0) * 0.25, cos(t * 2.0 + seed.z * 50.0) * 0.6);
    size = 0.016 * (0.6 + seed.z);
    col = vec4(1.0, 0.93, 0.75, 0.32 * (0.5 + 0.5 * sin(uTime * 2.0 + seed.x * 60.0)));
  } else if (kind < 1.5) {              // 瀑布水雾：从落水点向上翻涌
    float life = fract(uTime * 0.35 + seed.x);
    vec3 e = uEmit[int(floor(seed.z * 2.0))];
    p = e + vec3((seed.y - 0.5) * 0.5, 0.0, (seed.z - 0.5) * 0.5) * (0.4 + life) + vec3(0.0, life * 0.55, 0.0);
    size = mix(0.06, 0.22, life);
    col = vec4(0.95, 0.98, 1.0, 0.16 * (1.0 - life) * smoothstep(0.0, 0.15, life));
  } else if (kind < 2.5) {              // 火焰
    float life = fract(uTime * 1.6 + seed.x);
    vec3 e = uEmit[2];
    p = e + vec3((seed.y - 0.5) * 0.07 * (1.0 - life), life * 0.22, (seed.z - 0.5) * 0.07 * (1.0 - life));
    size = mix(0.075, 0.015, life) * (0.7 + seed.z * 0.6);
    col = vec4(mix(vec3(1.0, 0.75, 0.25), vec3(1.0, 0.25, 0.05), life) * 3.2, (1.0 - life));
  } else if (kind < 3.5) {              // 火星
    float life = fract(uTime * 0.5 + seed.x);
    vec3 e = uEmit[2];
    p = e + vec3(sin(seed.y * 30.0 + life * 6.0) * 0.08 * life, life * 0.9, cos(seed.z * 30.0 + life * 5.0) * 0.08 * life);
    size = 0.012;
    col = vec4(vec3(1.0, 0.6, 0.2) * 4.0, (1.0 - life) * step(0.3, seed.y));
  } else if (kind < 4.5) {              // 炊烟
    float life = fract(uTime * 0.12 + seed.x);
    vec3 e = uEmit[2] + vec3(0.0, 0.18, 0.0);
    p = e + vec3(life * 0.5 + sin(life * 6.0 + seed.y * 6.0) * 0.06, life * 1.6, -life * 0.15 + cos(life * 5.0) * 0.05);
    size = mix(0.06, 0.45, life);
    col = vec4(vec3(0.78, 0.77, 0.76), 0.16 * (1.0 - life) * smoothstep(0.0, 0.12, life));
  } else {                              // 萤火虫（只在夜里亮）
    vec3 b = (seed.xyz - 0.5) * vec3(5.5, 0.4, 5.0) + vec3(0.6, 0.72, 0.1);
    float t = uTime * 0.3;
    p = b + vec3(sin(t * 2.0 + seed.x * 30.0) * 0.4, sin(t * 3.0 + seed.y * 20.0) * 0.12, cos(t * 2.5 + seed.z * 40.0) * 0.4);
    size = 0.03;
    col = vec4(vec3(0.75, 1.0, 0.35) * 3.0, max(0.0, sin(uTime * 1.7 + seed.x * 80.0)) * uEmit[5].x);
  }
  vCol = col;
  vec4 mv = viewMatrix * vec4(p, 1.0); vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uPR / -mv.z;
}`;
const FRAG = /* glsl */`
#include <packing>
uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform float cameraNear; uniform float cameraFar;
varying vec4 vCol; varying float vViewZ; varying float vKind;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  if (r > 0.5) discard;
  float sz = perspectiveDepthToViewZ(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r, cameraNear, cameraFar);
  float soft = clamp((vViewZ - sz) * 6.0, 0.0, 1.0);
  float fall = vKind > 3.5 && vKind < 4.5 ? smoothstep(0.5, 0.0, r) : smoothstep(0.5, 0.05, r);
  gl_FragColor = vec4(vCol.rgb, vCol.a * fall * soft);
}`;

export class Particles {
  constructor(sceneDepth, counts = { pollen: 700, mist: 260, flame: 90, spark: 40, smoke: 60, fly: 120 }) {
    const kinds = [['pollen', 0], ['mist', 1], ['flame', 2], ['spark', 3], ['smoke', 4], ['fly', 5]];
    const seeds = [];
    for (const [k, w] of kinds) if (k !== 'smoke') for (let i = 0; i < counts[k]; i++) seeds.push(Math.random(), Math.random(), Math.random(), w);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(seeds.length / 4 * 3), 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.uniforms = {
      uTime: U.uTime, uPR: { value: 800 }, uEmit: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
      uSceneDepth: { value: sceneDepth }, uResolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 },
    };
    // 炊烟用普通混合，其余用叠加：分两份材质
    this.matAdd = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.matAdd);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    // 炊烟：同一套顶点着色器，只画类型 4，普通透明混合
    const smoke = []; for (let i = 0; i < counts.smoke; i++) smoke.push(Math.random(), Math.random(), Math.random(), 4);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(counts.smoke * 3), 3)); g2.setAttribute('seed', new THREE.Float32BufferAttribute(smoke, 4));
    g2.boundingSphere = g.boundingSphere;
    this.matSmoke = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.smoke = new THREE.Points(g2, this.matSmoke); this.smoke.frustumCulled = false; this.smoke.renderOrder = 9;
    this.points.add(this.smoke);
  }
  setEmitters({ falls = [], fire, night = 0 }) {
    const e = this.uniforms.uEmit.value;
    if (falls[0]) e[0].set(...falls[0]); if (falls[1]) e[1].set(...falls[1]); else if (falls[0]) e[1].set(...falls[0]);
    if (fire) e[2].set(...fire);
    e[5].set(night, 0, 0);
  }
}
