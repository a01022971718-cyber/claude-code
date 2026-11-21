// 高画质渲染管线（手机友好版）。原则：全分辨率的全屏遍数越少越好——手机 GPU 是分块渲染，每多一遍全屏读写都要把整张图搬进搬出显存。
//   1. 不透明场景 → HDR 颜色 + 深度纹理（全分辨率）
//   2. 环境光遮蔽（只在极致档；半分辨率、隔一帧算一次，中间那帧直接用上一帧的结果）
//   3. 合成：场景 × AO，再画水面（折射/深度）和软粒子（图层 2）（全分辨率）
//   4. 低分辨率小图：半分辨率模糊图（给景深用）、1/4 和 1/8 分辨率的泛光
//   5. 最后一遍（全分辨率，直接上屏）：景深混合 + 泛光 + 调色 + ACES 色调映射 + 抗锯齿（FXAA）+ 锐化 + 暗角 + 颗粒
// 原来是：场景、合成、景深（全分辨率 28 次采样）、泛光（十来遍）、调色、输出、SMAA（三遍）——全分辨率十几遍；现在 3 遍。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const LAYER_FX = 2;
const VQ = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const AO_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform vec2 uRes; uniform float cameraNear; uniform float cameraFar;
uniform mat4 uProj; uniform mat4 uProjInv; uniform float uRadius; uniform float uStrength; uniform float uFrame;
varying vec2 vUv;
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).r;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uProjInv * c; return v.xyz / v.w;
}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = texture2D(tDepth, vUv).r;
  if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec2 px = 1.0 / uRes;
  vec3 Pr = viewPos(vUv + vec2(px.x, 0.0)), Pl = viewPos(vUv - vec2(px.x, 0.0)), Pu = viewPos(vUv + vec2(0.0, px.y)), Pd = viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  float rnd = ign(gl_FragCoord.xy + uFrame * 5.588) * 6.28318;
  vec3 tang = normalize(vec3(cos(rnd), sin(rnd), 0.0) - N * dot(vec3(cos(rnd), sin(rnd), 0.0), N));
  vec3 bit = cross(N, tang);
  float occ = 0.0; const int S = 8;
  float rad = uRadius;
  for (int i = 0; i < S; i++) {
    float fi = float(i);
    float r = (fi + 0.5) / float(S);
    float a = fi * 2.39996;
    vec3 h = vec3(cos(a) * sqrt(r), sin(a) * sqrt(r), sqrt(1.0 - r));
    vec3 sp = P + (tang * h.x + bit * h.y + N * h.z) * rad * mix(0.25, 1.0, r * r);
    vec4 c = uProj * vec4(sp, 1.0); vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, rad / max(abs(P.z - sz), 1e-4));
    occ += (sz >= sp.z + 0.01 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(S) * uStrength;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}`;
const BLUR_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; uniform float cameraNear; uniform float cameraFar;
varying vec2 vUv;
float lz(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar); }
void main(){
  float z0 = lz(vUv), s = 0.0, w = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = lz(uv), wi = exp(-float(i * i) / 10.0) * exp(-abs(z - z0) / (0.02 * z0 + 0.02) );
    s += texture2D(tAO, uv).r * wi; w += wi;
  }
  gl_FragColor = vec4(vec3(s / w), 1.0);
}`;
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tAO; uniform float uAOMix; varying vec2 vUv;
void main(){ vec4 c = texture2D(tScene, vUv); float ao = texture2D(tAO, vUv).r; gl_FragColor = vec4(c.rgb * mix(1.0, ao, uAOMix), 1.0); }`;


// 半分辨率 / 1/4 分辨率缩小（4 个双线性采样 = 4×4 个原像素平均）；bright = 1 时只留亮部（泛光用，带柔和过渡）
const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uBright; uniform float uThreshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (uBright > 0.5) { float l = max(c.r, max(c.g, c.b)); float k = clamp((l - uThreshold) / max(l, 1e-4), 0.0, 1.0); c *= k * k; }
  gl_FragColor = vec4(c, 1.0);
}`;
// 9 格高斯模糊（利用双线性插值只采 5 次）
const BLUR9_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
// 最后一遍：一次做完所有屏幕效果，直接画到屏幕
const FINAL_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tSoft; uniform sampler2D tBloom1; uniform sampler2D tBloom2;
uniform vec2 uRes; uniform float uTime; uniform float uExposure;
uniform float uDof; uniform float cameraNear; uniform float cameraFar; uniform float uFocus; uniform float uAperture; uniform float uFocusRange; uniform float uMaxCoc;
uniform float uBloom; uniform float uAA; uniform float uSharp;
uniform float uSat; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uVig; uniform float uGrain; uniform float uCA;
varying vec2 vUv;
vec3 C(vec2 uv){ return texture2D(tColor, uv).rgb; }
float L(vec3 c){ vec3 t = c / (1.0 + c); return dot(t, vec3(0.299, 0.587, 0.114)); }
vec3 yjFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 yjAces(vec3 c){
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6; c = OUT * yjFit(IN * c); return clamp(c, 0.0, 1.0);
}
vec3 yjSrgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c = C(vUv);
  // 抗锯齿（FXAA）：只在明暗反差大的边上沿边方向混合
  if (uAA > 0.5) {
    vec3 nw = C(vUv + vec2(-1.0, -1.0) * px), ne = C(vUv + vec2(1.0, -1.0) * px), sw = C(vUv + vec2(-1.0, 1.0) * px), se = C(vUv + vec2(1.0, 1.0) * px);
    float lNW = L(nw), lNE = L(ne), lSW = L(sw), lSE = L(se), lM = L(c);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin > max(0.04, lMax * 0.125)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * px;
      vec3 a = 0.5 * (C(vUv + dir * (1.0 / 3.0 - 0.5)) + C(vUv + dir * (2.0 / 3.0 - 0.5)));
      vec3 b = a * 0.5 + 0.25 * (C(vUv - dir * 0.5) + C(vUv + dir * 0.5));
      float lB = L(b); c = (lB < lMin || lB > lMax) ? a : b;
    }
  }
  // 锐化：上下左右四点，结果夹在邻域最亮和最暗之间
  if (uSharp > 0.0) {
    vec3 n = C(vUv + vec2(0.0, px.y)), s2 = C(vUv - vec2(0.0, px.y)), e = C(vUv + vec2(px.x, 0.0)), w = C(vUv - vec2(px.x, 0.0));
    vec3 mn = min(c, min(min(n, s2), min(e, w))), mx = max(c, max(max(n, s2), max(e, w)));
    c = clamp(c + (4.0 * c - n - s2 - e - w) * uSharp * 0.25, mn, mx);
  }
  // 景深：按深度算弥散圈，在清晰图和半分辨率模糊图之间混合
  if (uDof > 0.5) {
    float d = texture2D(tDepth, vUv).r, z = d >= 0.9999 ? cameraFar : -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    float coc = clamp(abs(1.0 / uFocus - 1.0 / z) * uFocus * uAperture - uFocusRange * uAperture, 0.0, uMaxCoc);
    c = mix(c, texture2D(tSoft, vUv).rgb, smoothstep(0.6, 4.5, coc));
  }
  if (uBloom > 0.0) c += (texture2D(tBloom1, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.8) * uBloom;
  // 调色（线性空间）：饱和度、对数空间对比度、暗部偏冷亮部偏暖、暗角、颗粒
  vec2 dd = vUv - 0.5; float r2 = dot(dd, dd);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;
  c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.6, l));
  c *= 1.0 - uVig * smoothstep(0.12, 0.62, r2 * 1.6);
  c += (h(vUv * uRes + uTime * 61.0) - 0.5) * uGrain * (0.4 + l);
  gl_FragColor = vec4(yjSrgb(yjAces(c)), 1.0);
}`;

export class HQPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.opts = { ao: true, dof: true, bloom: true, smaa: true, aoStrength: 1.0, aoRadius: 0.5 };
    const hf = THREE.HalfFloatType, rt = (depth = false) => new THREE.WebGLRenderTarget(1, 1, { type: hf, depthBuffer: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtScene = rt(true); this.rtScene.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.rtComp = rt(true);                                   // 合成 + 水面 + 粒子
    this.rtHalf = rt(); this.rtHalf2 = rt();                  // 半分辨率：景深用的模糊图
    this.rtQ = rt(); this.rtQ2 = rt(); this.rtE = rt(); this.rtE2 = rt();   // 1/4、1/8：泛光
    this.rtAO = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAO2 = this.rtAO.clone();
    const sm = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VQ, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false, uniforms });
    this.aoMat = sm(AO_FRAG, { tDepth: { value: this.rtScene.depthTexture }, uRes: { value: new THREE.Vector2() }, cameraNear: { value: 0 }, cameraFar: { value: 0 }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uRadius: { value: 0.5 }, uStrength: { value: 1.0 }, uFrame: { value: 0 } });
    this.blurMat = sm(BLUR_FRAG, { tAO: { value: null }, tDepth: { value: this.rtScene.depthTexture }, uDir: { value: new THREE.Vector2() }, cameraNear: { value: 0 }, cameraFar: { value: 0 } });
    this.compMat = sm(COMP_FRAG, { tScene: { value: this.rtScene.texture }, tAO: { value: this.rtAO.texture }, uAOMix: { value: 1 } });
    this.downMat = sm(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uBright: { value: 0 }, uThreshold: { value: 0.9 } });
    this.blur9 = sm(BLUR9_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.finalMat = sm(FINAL_FRAG, {
      tColor: { value: this.rtComp.texture }, tDepth: { value: this.rtScene.depthTexture }, tSoft: { value: this.rtHalf.texture }, tBloom1: { value: this.rtQ.texture }, tBloom2: { value: this.rtE.texture },
      uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uExposure: { value: 1 },
      uDof: { value: 0 }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, uFocus: { value: 20 }, uAperture: { value: 18 }, uFocusRange: { value: 0.08 }, uMaxCoc: { value: 9 },
      uBloom: { value: 0.32 }, uAA: { value: 1 }, uSharp: { value: 0 },
      uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uShadowTint: { value: new THREE.Vector3(0.96, 1.0, 1.06) }, uHighTint: { value: new THREE.Vector3(1.05, 1.0, 0.94) }, uVig: { value: 0.32 }, uGrain: { value: 0.018 }, uCA: { value: 0 },
    });
    this.grade = { uniforms: this.finalMat.uniforms };        // 兼容：外面按 grade.uniforms.uSharp 调锐化
    this.bloom = { strength: 0.32 };                           // 兼容：大气按时段调泛光强度（夜里灯光更晕）
    this.quad = new FullScreenQuad(null);
    this.frame = 0; this.passes = 0;
  }
  get sceneColor() { return this.rtScene.texture; }
  get sceneDepth() { return this.rtScene.depthTexture; }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio(), W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.W = W; this.H = H;
    this.rtScene.setSize(W, H); this.rtComp.setSize(W, H);
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1), qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2), ew = Math.max(1, W >> 3), eh = Math.max(1, H >> 3);
    this.rtHalf.setSize(hw, hh); this.rtHalf2.setSize(hw, hh); this.rtQ.setSize(qw, qh); this.rtQ2.setSize(qw, qh); this.rtE.setSize(ew, eh); this.rtE2.setSize(ew, eh);
    this.rtAO.setSize(hw, hh); this.rtAO2.setSize(hw, hh); this.aoMat.uniforms.uRes.value.set(hw, hh);
    this.finalMat.uniforms.uRes.value.set(W, H); this.finalMat.uniforms.uMaxCoc.value = 9 * pr;
    this.aoValid = false;
    this.onResize?.(W, H);
  }
  _pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.quad.render(this.renderer); this.passes++; }
  _down(src, dst, bright = false) { const u = this.downMat.uniforms; u.tSrc.value = src.texture; u.uTexel.value.set(0.5 / src.width, 0.5 / src.height).multiplyScalar(2); u.uBright.value = bright ? 1 : 0; this._pass(this.downMat, dst); }
  _blur(a, b) { const u = this.blur9.uniforms; u.tSrc.value = a.texture; u.uDir.value.set(1 / a.width, 0); this._pass(this.blur9, b); u.tSrc.value = b.texture; u.uDir.value.set(0, 1 / b.height); this._pass(this.blur9, a); }
  render(dt, focusDist) {
    const r = this.renderer, cam = this.camera, o = this.opts; this.passes = 0;
    // 1. 不透明场景
    cam.layers.set(0);
    r.setRenderTarget(this.rtScene); r.clear(); r.render(this.scene, cam); this.passes++;
    const near = cam.near, far = cam.far;
    // 2. AO：隔一帧算一次（缓存上一帧的结果）
    if (o.ao) {
      this.aoTick = !this.aoTick;
      if (this.aoTick || !this.aoValid) {
        const u = this.aoMat.uniforms;
        u.cameraNear.value = near; u.cameraFar.value = far; u.uProj.value.copy(cam.projectionMatrix); u.uProjInv.value.copy(cam.projectionMatrixInverse);
        u.uRadius.value = o.aoRadius; u.uStrength.value = o.aoStrength; u.uFrame.value = this.frame++ % 64;
        this._pass(this.aoMat, this.rtAO);
        const b = this.blurMat.uniforms; b.cameraNear.value = near; b.cameraFar.value = far;
        b.tAO.value = this.rtAO.texture; b.uDir.value.set(1 / this.rtAO.width, 0); this._pass(this.blurMat, this.rtAO2);
        b.tAO.value = this.rtAO2.texture; b.uDir.value.set(0, 1 / this.rtAO.height); this._pass(this.blurMat, this.rtAO);
        this.aoValid = true;
      }
    } else this.aoValid = false;
    this.compMat.uniforms.uAOMix.value = o.ao ? 1 : 0;
    // 3. 合成 + 水面与粒子
    this._pass(this.compMat, this.rtComp);
    r.clearDepth();
    cam.layers.set(LAYER_FX);
    const bg = this.scene.background; this.scene.background = null;
    const ac = r.autoClear; r.autoClear = false; r.render(this.scene, cam); r.autoClear = ac; this.scene.background = bg; this.passes++;
    cam.layers.set(0);
    // 4. 低分辨率小图
    const F = this.finalMat.uniforms, dof = !!o.dof && o.dof !== 'off', bloom = !!o.bloom;
    if (dof || bloom) this._down(this.rtComp, this.rtHalf);
    if (bloom) { this._down(this.rtHalf, this.rtQ, true); this._blur(this.rtQ, this.rtQ2); this._down(this.rtQ, this.rtE); this._blur(this.rtE, this.rtE2); }
    if (dof) { this._blur(this.rtHalf, this.rtHalf2); this._blur(this.rtHalf, this.rtHalf2); }   // 两次 9 格模糊 ≈ 全分辨率十几像素的柔焦
    // 景深两种：柔和 = 焦点前后很大一段都清楚，只虚化远处和很近的前景；移轴 = 微缩模型感
    const pr = r.getPixelRatio(), mk = o.macro || 0;
    F.uDof.value = dof ? 1 : 0; F.cameraNear.value = near; F.cameraFar.value = far; F.uFocus.value = focusDist;
    if (o.dof === 'soft') { F.uAperture.value = 9 + 16 * mk; F.uFocusRange.value = 0.32 - 0.24 * mk; F.uMaxCoc.value = (5 + 5 * mk) * pr; }
    else { F.uAperture.value = 18; F.uFocusRange.value = 0.08; F.uMaxCoc.value = 9 * pr; }
    F.uBloom.value = bloom ? this.bloom.strength : 0; F.uAA.value = o.smaa ? 1 : 0; F.uExposure.value = r.toneMappingExposure; F.uTime.value += dt;
    // 5. 最后一遍直接上屏
    this._pass(this.finalMat, null);
  }
}
