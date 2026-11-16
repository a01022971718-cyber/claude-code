// 高画质海洋：Gerstner 波浪 + 细节法线 + 天空反射 + 屏幕空间折射 + 深度吸收（浅滩透出海底）
// + 岸边浪花（深度交界 + 离岸距离场推进的浪线）+ 浪尖白沫 + 太阳碎光 + 逆光透射。
// 依赖渲染管线先把不透明场景画进 sceneColor / sceneDepth。
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_CLOUD } from './noise.js';
import { U } from './materials.js';
import { GLSL_WAVES, waveAt } from './waves.js';

/** 生成可平铺的细节法线贴图：一组整数波矢的正弦叠加，天然无缝 */
export function makeRippleNormalMap(size = 256, seed = 7) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const waves = [];
  for (let i = 0; i < 56; i++) {
    const k = 2 + Math.floor(Math.pow(rnd(), 1.6) * 30), a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.25), rnd() * Math.PI * 2]);
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    const u = x / size, v = y / size;
    for (const [kx, ky, amp, ph] of waves) {
      const c = Math.cos(2 * Math.PI * (kx * u + ky * v) + ph) * amp * 2 * Math.PI;
      dx += c * kx; dy += c * ky;
    }
    const sc = 0.012, nx = -dx * sc, ny = -dy * sc, l = Math.hypot(nx, ny, 1);
    const o = (y * size + x) * 4;
    data[o] = (nx / l * 0.5 + 0.5) * 255; data[o + 1] = (ny / l * 0.5 + 0.5) * 255; data[o + 2] = (1 / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

/** 离岸距离场（CPU 计算）：R = 1 在陆地边缘，向外 3.2 个单位衰减到 0；G = 是否在陆地上。
 *  以 (cx,cz) 为中心、边长 span。有陆地距离场（terrain.field）时直接查表，否则逐块计算。 */
export function makeShoreField(terrain, size = 384, span = 72, cx = 0, cz = 0, out = null) {
  const data = out ? out.data : new Uint8Array(size * size * 4), INR = Math.sqrt(3) / 2;
  const ns = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
  const F = terrain.field;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = cx + (i + 0.5) / size * span - span / 2, z = cz + (j + 0.5) / size * span - span / 2;
    let d;
    if (F) { d = F.dist(x, z); if (d < 0.6 && terrain.tileAt(x, z)) d = -1; }
    else {
      d = 1e9;
      for (const t of terrain.tiles) {
        const lx = x - t.x, lz = z - t.z; if (lx * lx + lz * lz > 49) continue;
        let m = -1e9; for (const n of ns) m = Math.max(m, lx * n[0] + lz * n[1]);
        d = Math.min(d, m - INR);
      }
    }
    const s = 1 - Math.min(1, Math.max(0, d) / 3.2);
    const o = (j * size + i) * 4; data[o] = s * 255; data[o + 1] = d < 0 ? 255 : 0; data[o + 3] = 255;
  }
  if (out) { out.cx = cx; out.cz = cz; out.texture.needsUpdate = true; return out; }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return { texture: t, span, data, size, cx, cz };
}

/** 径向网格：中心密、远处稀，一直铺到地平线 */
function radialGrid(rings = 230, segs = 300, r0 = 0.25, grow = 1.034) {
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  let r = r0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    r *= grow; if (r > 900) break;
  }
  const nr = (pos.length / 3 - 1) / segs;
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + i * segs + j, b = 1 + i * segs + (j + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
  return g;
}

const VERT = /* glsl */`
uniform float uTime; uniform sampler2D uShore; uniform float uShoreSpan; uniform vec2 uShoreC;
varying vec3 vWP; varying vec3 vWN; varying float vCrest; varying float vShore; varying float vLand; varying vec4 vClip; varying float vViewZ;
${GLSL_WAVES}
void main(){
  vec3 p = position;
  vec2 wxz = (modelMatrix * vec4(p, 1.0)).xz;
  vec2 suv = (wxz - uShoreC) / uShoreSpan + 0.5;
  vec4 sh = texture2D(uShore, suv);
  float shore = (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) ? sh.r : 0.0;
  float att = 1.0 - smoothstep(0.55, 0.98, shore);
  vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0); float crest = 0.0;
  vec3 disp = vec3(0.0);
  disp = gerstnerSum(wxz, uTime, T, B, crest);
  float fade = 1.0 - smoothstep(60.0, 220.0, length(p.xz));
  p += disp * att * fade;
  vec3 n = normalize(cross(B, T));
  vWN = normalize(mix(vec3(0.0, 1.0, 0.0), n, att * fade));
  vCrest = crest * att; vShore = shore; vLand = sh.g;
  vec4 wp = modelMatrix * vec4(p, 1.0); vWP = wp.xyz;
  vec4 mv = viewMatrix * wp; vViewZ = mv.z;
  gl_Position = projectionMatrix * mv; vClip = gl_Position;
}`;

const FRAG = /* glsl */`
#include <packing>
uniform float uTime; uniform float uCloud;
uniform sampler2D uSceneColor; uniform sampler2D uSceneDepth; uniform sampler2D uNormalMap;
uniform vec2 uResolution; uniform float cameraNear; uniform float cameraFar;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uAmbient;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uAbsorb; uniform vec3 uSSS;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uSpecK;
uniform vec4 uFalls[4];
uniform vec4 uRipples[10];
varying vec3 vWP; varying vec3 vWN; varying float vCrest; varying float vShore; varying float vLand; varying vec4 vClip; varying float vViewZ;
${GLSL_NOISE}
${GLSL_CLOUD}
float sceneViewZ(vec2 uv){ return perspectiveDepthToViewZ(texture2D(uSceneDepth, uv).r, cameraNear, cameraFar); }
vec3 skyColor(vec3 r){
  float h = clamp(r.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
  float sunGlow = pow(max(dot(r, uSunDir), 0.0), 8.0);
  return c + uSunColor * sunGlow * 0.25;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float sz = sceneViewZ(uv);
  if (sz > vViewZ + 0.002) discard;               // 手动深度测试：前面有陆地
  float thick = max(0.0, vViewZ - sz);           // 视线方向上穿过的水深
  vec3 V = normalize(cameraPosition - vWP);
  float dist = length(cameraPosition - vWP);
  // 细节法线：两层反向流动的波纹
  vec2 q = vWP.xz;
  vec3 n1 = texture2D(uNormalMap, q * 0.21 + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalMap, q * 0.47 - vec2(uTime * 0.026, -uTime * 0.017)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormalMap, q * 0.085 + vec2(-uTime * 0.008, uTime * 0.012)).xyz * 2.0 - 1.0;
  vec3 dn = n1 + n2 * 0.7 + n3 * 0.35;
  float detail = mix(1.0, 0.25, smoothstep(10.0, 90.0, dist)) * mix(1.0, 0.35, smoothstep(0.75, 1.0, vShore));
  // 涟漪：从入水点向外扩散的圆环波，振幅随时间和距离衰减
  vec2 rip = vec2(0.0); float ripFoam = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 r = uRipples[i]; float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 4.0) continue;
    vec2 d = vWP.xz - r.xy; float dist = length(d) + 1e-4;
    float front = age * 0.45;                         // 毛细-重力波的传播速度
    float env = exp(-age * 1.1) * exp(-abs(dist - front) * 9.0) * r.w;
    float ph = (dist - front) * 38.0;
    rip += d / dist * cos(ph) * env * 0.9;
    ripFoam = max(ripFoam, env * smoothstep(0.4, 1.0, sin(ph)) * smoothstep(0.6, 0.0, age));
  }
  vec3 N = normalize(vWN + vec3(dn.x + rip.x, 0.0, dn.y + rip.y) * 0.38 * detail + vec3(rip.x, 0.0, rip.y) * 0.6);
  // 折射
  vec2 ruv = uv + N.xz * 0.045 * clamp(thick * 1.2, 0.0, 1.0) / max(1.0, dist * 0.04);
  float rz = sceneViewZ(ruv);
  if (rz > vViewZ) { ruv = uv; rz = sz; }
  float rthick = max(0.0, vViewZ - rz);
  vec3 refr = texture2D(uSceneColor, ruv).rgb;
  // 深度吸收：红光最先被吸收，浅处透出青绿、深处变成深蓝
  float depthV = rthick * mix(0.55, 1.0, abs(V.y));
  vec3 trans = exp(-uAbsorb * depthV);
  vec3 scatter = mix(uShallow, uDeep, 1.0 - exp(-depthV * 0.9));
  vec3 L = normalize(uSunDir);
  float lightAmt = max(L.y, 0.0) * 0.85 + 0.15;
  vec3 body = refr * trans + scatter * (1.0 - trans) * (uSunColor * lightAmt * 0.55 + uAmbient);
  // 逆光透射：浪的背光面透出青绿色
  float sss = pow(clamp(dot(V, -L + N * 0.6), 0.0, 1.0), 4.0) * (0.35 + clamp(vCrest * 8.0, 0.0, 1.0));
  body += uSSS * sss * uSunColor * 0.45 * (1.0 - trans.g * 0.6);
  // 反射与菲涅尔
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  vec3 refl = skyColor(R);
  float spec = pow(max(dot(R, L), 0.0), 900.0) * 24.0 + pow(max(dot(R, L), 0.0), 120.0) * 0.9;
  vec3 col = mix(body, refl, F * 0.85) + uSunColor * spec * uSpecK * (1.0 - uCloud * cloudShadow(vWP.xz, uTime) * 0.8);
  // ---- 浪花 ----
  float tFlow = uTime;
  float bubbles = 1.0 - smoothstep(0.08, 0.42, worley2(q * 7.0 + vec2(tFlow * 0.3, tFlow * 0.2)));
  float bubbles2 = 1.0 - smoothstep(0.05, 0.38, worley2(q * 15.0 - vec2(tFlow * 0.45, -tFlow * 0.25)));
  float foamTex = clamp(bubbles * 0.65 + bubbles2 * 0.55, 0.0, 1.0);
  float nb = fbm2(q * 2.2 + tFlow * 0.15) * 0.5 + 0.5;
  // 1. 和陆地/礁石的交界处
  float edge = 1.0 - smoothstep(0.0, 0.16 + nb * 0.12, thick);
  // 2. 一圈圈推向岸边的浪线
  float s = vShore;
  float wave = sin(s * 34.0 - tFlow * 2.1 + nb * 5.0);
  float lines = smoothstep(0.6, 0.98, wave) * smoothstep(0.68, 0.84, s) * (1.0 - smoothstep(0.9, 0.96, s)) * (0.5 + 0.5 * nb);
  // 3. 贴岸的一大片白浪（会呼吸）
  float surf = smoothstep(0.84 + sin(tFlow * 0.9 + nb * 6.0) * 0.035, 0.97, s);
  // 4. 浪尖白沫
  float caps = smoothstep(0.1, 0.14, vCrest + nb * 0.02) * smoothstep(0.55, 0.85, nb) * 0.25;
  // 5. 瀑布落水处
  float falls = 0.0;
  for (int i = 0; i < 4; i++) { if (uFalls[i].w > 0.0) { float d = length(vWP.xz - uFalls[i].xy); falls = max(falls, (1.0 - smoothstep(0.0, uFalls[i].z, d))); } }
  float mask = clamp(edge * 0.95 + lines * 0.7 + surf * 0.9 + caps * 0.5 + falls + ripFoam * 1.4, 0.0, 1.0);
  // 泡沫的“消融”：遮罩强的地方是整片白，边缘被流动的纹理吃成蕾丝状
  float streak = fbm2(vec2(q.x * 2.6, q.y * 2.6) + vec2(tFlow * 0.18, -tFlow * 0.11)) * 0.5 + 0.5;
  float lace = streak * 0.6 + foamTex * 0.4;
  float foam = clamp(mask * 1.5 - (1.0 - lace) * 0.95, 0.0, 1.0);
  foam = max(foam, edge * smoothstep(0.35, 0.7, lace));
  foam *= 1.0 - smoothstep(30.0, 70.0, dist) * 0.7;
  float sunLum = dot(uSunColor, vec3(0.3, 0.5, 0.2));
  vec3 foamCol = vec3(0.95, 0.97, 1.0) * (uSunColor * (max(L.y, 0.0) * 0.8 + 0.2) * 0.75 + uAmbient * 1.1) * clamp(sunLum * 1.6, 0.3, 1.0);
  foamCol *= 1.0 - cloudShadow(vWP.xz, uTime) * 0.25 * uCloud;
  col = mix(col, foamCol, foam);
  // 雾
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(min(col, vec3(5.0)), 1.0);
}`;

export class Ocean {
  constructor({ terrain, sceneColor, sceneDepth, shoreSize = 384, shoreSpan = 72, cx = 0, cz = 0 }) {
    this.terrain = terrain;
    this.shore = makeShoreField(terrain, shoreSize, shoreSpan, cx, cz);
    this.normalMap = makeRippleNormalMap(256);
    this.uniforms = {
      uTime: U.uTime, uCloud: U.uCloud,
      uShore: { value: this.shore.texture }, uShoreSpan: { value: this.shore.span }, uShoreC: { value: new THREE.Vector2(this.shore.cx, this.shore.cz) },
      uSceneColor: { value: sceneColor }, uSceneDepth: { value: sceneDepth }, uNormalMap: { value: this.normalMap },
      uResolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uZenith: { value: new THREE.Color(0x3a7fc4) }, uHorizon: { value: new THREE.Color(0xbfdcea) }, uAmbient: { value: new THREE.Color(0x3a5a70) },
      uDeep: { value: new THREE.Color(0x06324f) }, uShallow: { value: new THREE.Color(0x1fa5a8) },
      uAbsorb: { value: new THREE.Vector3(2.4, 0.75, 0.48) }, uSSS: { value: new THREE.Color(0x2fd6b0) },
      uFogColor: { value: new THREE.Color(0xbfdcea) }, uFogDensity: { value: 0.012 }, uSpecK: { value: 1 },
      uFalls: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uRipples: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, depthWrite: true });
    this.mesh = new THREE.Mesh(radialGrid(), this.material);
    this.mesh.frustumCulled = false; this.mesh.name = 'ocean';
  }
  /** 在 (x,z) 激起一圈涟漪 */
  ripple(x, z, strength = 1) { const r = this.uniforms.uRipples.value[this._ri = ((this._ri || 0) + 1) % 10]; r.set(x, z, U.uTime.value, strength); }
  /** 离岸距离场在 (x,z) 的值：1 = 贴着陆地，0 = 外海 */
  shoreAt(x, z) {
    const { data, size, span, cx, cz } = this.shore, i = Math.floor(((x - cx) / span + 0.5) * size), j = Math.floor(((z - cz) / span + 0.5) * size);
    if (i < 0 || j < 0 || i >= size || j >= size) return 0;
    return data[(j * size + i) * 4] / 255;
  }
  /** 浮力：海面在 (x,z) 的高度和法线（含近岸衰减） */
  surfaceAt(x, z) { const s = this.shoreAt(x, z); return waveAt(x, z, U.uTime.value, 1 - THREE.MathUtils.smoothstep(s, 0.55, 0.98)); }
  /** 游戏里：岛变大或镜头移远后，重算离岸场（以 (cx,cz) 为中心），海面网格也挪过去 */
  recenter(cx, cz) {
    makeShoreField(this.terrain, this.shore.size, this.shore.span, cx, cz, this.shore);
    this.uniforms.uShoreC.value.set(cx, cz);
    this.mesh.position.set(cx, 0, cz);
  }
  setFalls(list) { list.slice(0, 4).forEach((f, i) => this.uniforms.uFalls.value[i].set(f[0], f[1], f[2] || 0.35, 1)); }
}
