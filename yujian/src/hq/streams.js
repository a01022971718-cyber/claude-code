// 河流与瀑布：沿路径生成的水带，按流向滚动的波纹与白沫，透出河床（屏幕空间折射）。
// 和海面一样画在特效图层，用场景深度做手动深度测试。
import * as THREE from 'three';
import { GLSL_NOISE } from './noise.js';
import { U } from './materials.js';

const VERT = /* glsl */`
attribute vec2 flow;   // x: 沿流向的距离, y: 横向 -1..1
attribute float fall;  // 0 河面, 1 瀑布
varying vec2 vFlow; varying float vFall; varying vec3 vWP; varying float vViewZ;
void main(){
  vFlow = flow; vFall = fall;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  vec4 mv = viewMatrix * wp; vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
#include <packing>
uniform float uTime; uniform sampler2D uSceneColor; uniform sampler2D uSceneDepth; uniform vec2 uResolution;
uniform float cameraNear; uniform float cameraFar; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uTint;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uSpeedScale;
varying vec2 vFlow; varying float vFall; varying vec3 vWP; varying float vViewZ;
${GLSL_NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float sz = perspectiveDepthToViewZ(texture2D(uSceneDepth, uv).r, cameraNear, cameraFar);
  if (sz > vViewZ + 0.004) discard;
  float thick = max(0.0, vViewZ - sz);
  float speed = mix(0.55, 2.6, vFall) * uSpeedScale;
  vec2 f = vec2(vFlow.x - uTime * speed, vFlow.y);
  float n1 = snoise2(vec2(f.x * 3.0, f.y * 1.6)), n2 = snoise2(vec2(f.x * 7.0 + 3.0, f.y * 3.0 - uTime * 0.2));
  vec3 N = normalize(vec3(n1 * 0.25, 1.0, n2 * 0.25));
  vec3 V = normalize(cameraPosition - vWP);
  vec2 ruv = uv + N.xz * 0.012;
  vec3 bed = texture2D(uSceneColor, ruv).rgb;
  vec3 trans = exp(-vec3(4.0, 1.5, 1.0) * (thick * 2.2 + 0.12));
  vec3 col = bed * trans + uTint * (1.0 - trans) * (uSunColor * 0.35 + 0.25);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  col = mix(col, uSky, F * 0.5) + uSunColor * pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * 6.0;
  // 白沫：河中央的流线、岸边、瀑布整片
  float streak = smoothstep(0.35, 0.9, snoise2(vec2(f.x * 1.4, f.y * 5.0)) * 0.5 + 0.5 + n2 * 0.25);
  float edge = smoothstep(0.65, 1.0, abs(vFlow.y)) * 0.7;
  float foam = clamp(streak * 0.22 + edge * 0.6, 0.0, 1.0);
  float fallFoam = smoothstep(0.15, 0.85, snoise2(vec2(vFlow.y * 6.0, f.x * 2.2)) * 0.5 + 0.5 + 0.25);
  foam = mix(foam, 0.55 + fallFoam * 0.45, vFall);
  col = mix(col, vec3(0.92, 0.96, 1.0) * (uSunColor * 0.3 + 0.32), foam * mix(0.55, 0.85, vFall));
  float alpha = mix(smoothstep(1.0, 0.82, abs(vFlow.y)), smoothstep(1.0, 0.55, abs(vFlow.y)) * (0.75 + fallFoam * 0.25), vFall);
  float dist = length(cameraPosition - vWP);
  col = mix(col, uFogColor, 1.0 - exp(-uFogDensity * uFogDensity * dist * dist));
  gl_FragColor = vec4(col, alpha);
}`;

/** 沿 3D 折线（[x,y,z] 数组）生成带状网格；width 可为函数 (t)=>宽度；fall 为瀑布标记 */
export function ribbon(points, width, fall = 0, up = new THREE.Vector3(0, 1, 0)) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const n = Math.max(8, Math.round(curve.getLength() * 24)), pos = [], flw = [], fl = [], idx = [];
  let acc = 0, prev = curve.getPoint(0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPoint(t), tan = curve.getTangent(t);
    acc += p.distanceTo(prev); prev = p;
    const side = fall ? new THREE.Vector3().crossVectors(tan, new THREE.Vector3(-tan.z, 0, tan.x).normalize()).normalize() : new THREE.Vector3().crossVectors(up, tan).normalize();
    const sideH = fall ? new THREE.Vector3(-tan.z, 0, tan.x).normalize() : side;
    const w = typeof width === 'function' ? width(t) : width;
    for (const s of [-1, 1]) { pos.push(p.x + sideH.x * w * s, p.y + sideH.y * w * s, p.z + sideH.z * w * s); flw.push(acc, s); fl.push(fall); }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('flow', new THREE.Float32BufferAttribute(flw, 2)); g.setAttribute('fall', new THREE.Float32BufferAttribute(fl, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

export function streamMaterial(sceneColor, sceneDepth, speedScale = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: U.uTime, uSceneColor: { value: sceneColor }, uSceneDepth: { value: sceneDepth }, uResolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0x9cc7e0) }, uTint: { value: new THREE.Color(0x1d8f9a) }, uFogColor: { value: new THREE.Color(0xcfe2ec) }, uFogDensity: { value: 0.01 }, uSpeedScale: { value: speedScale },
    },
  });
}
