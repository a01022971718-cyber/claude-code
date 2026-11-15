// 高画质渲染管线：
//   1. 不透明场景 → HDR 颜色 + 深度纹理
//   2. 屏幕空间环境光遮蔽（半分辨率 + 双边模糊）
//   3. 合成：场景 × AO，再画水面（折射/深度）和软粒子（图层 2）
//   4. 景深（按深度算弥散圈，黄金角采样）→ 泛光 → 调色（分离色调、暗角、色差、颗粒）→ ACES 色调映射 → SMAA
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

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
  float occ = 0.0; const int S = 16;
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

const DOF = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 },
    uFocus: { value: 20 }, uAperture: { value: 18 }, uMaxCoc: { value: 9 }, uFocusRange: { value: 0.08 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
  #include <packing>
  uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uRes; uniform float cameraNear; uniform float cameraFar;
  uniform float uFocus; uniform float uAperture; uniform float uMaxCoc; uniform float uFocusRange;
  varying vec2 vUv;
  float lz(vec2 uv){ float d = texture2D(tDepth, uv).r; return d >= 0.9999 ? cameraFar : -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
  float coc(float z){ float c = abs(1.0 / uFocus - 1.0 / z) * uFocus * uAperture; return clamp(c - uFocusRange * uAperture, 0.0, uMaxCoc); }
  void main(){
    float z0 = lz(vUv), c0 = coc(z0);
    vec3 base = texture2D(tDiffuse, vUv).rgb;
    if (c0 < 0.35) { gl_FragColor = vec4(base, 1.0); return; }
    vec3 acc = base; float wsum = 1.0;
    const int S = 28;
    for (int i = 1; i < S; i++) {
      float fi = float(i), r = sqrt(fi / float(S)), a = fi * 2.39996;
      vec2 off = vec2(cos(a), sin(a)) * r * c0 / uRes;
      vec2 uv = vUv + off;
      float zi = lz(uv), ci = coc(zi);
      // 前景（更近）的样本按自身弥散圈决定是否参与，避免清晰的前景被糊进背景
      float w = zi < z0 ? smoothstep(r * c0 - 1.0, r * c0 + 1.0, ci + 1.0) : 1.0;
      vec3 s = texture2D(tDiffuse, uv).rgb;
      w *= 1.0 + dot(s, vec3(0.3)) * 0.5;   // 亮点略加权，出一点光斑
      acc += s * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, 1.0);
  }`,
};

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uSat: { value: 1.1 }, uContrast: { value: 1.06 },
    uShadowTint: { value: new THREE.Vector3(0.96, 1.0, 1.06) }, uHighTint: { value: new THREE.Vector3(1.05, 1.0, 0.94) }, uVig: { value: 0.32 }, uCA: { value: 0.45 }, uGrain: { value: 0.018 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; uniform float uSat; uniform float uContrast;
  uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uVig; uniform float uCA; uniform float uGrain;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 d = vUv - 0.5; float r2 = dot(d, d);
    vec2 ca = d * r2 * uCA * 0.02;
    vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    // 对数空间里加一点对比度，围绕中灰
    c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;
    // 暗部偏冷、亮部偏暖
    float t = smoothstep(0.05, 0.6, l);
    c *= mix(uShadowTint, uHighTint, t);
    c *= 1.0 - uVig * smoothstep(0.12, 0.62, r2 * 1.6);
    c += (h(vUv * uRes + uTime * 61.0) - 0.5) * uGrain * (0.4 + l);
    gl_FragColor = vec4(c, 1.0);
  }`,
};

class SceneWaterPass extends Pass {
  constructor(hq) { super(); this.hq = hq; this.needsSwap = true; }
  render(renderer, writeBuffer) { this.hq._sceneAndWater(renderer, writeBuffer); }
}

export class HQPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.opts = { ao: true, dof: true, bloom: true, smaa: true, aoStrength: 1.0, aoRadius: 0.5 };
    const hf = THREE.HalfFloatType;
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { type: hf, depthBuffer: true });
    this.rtScene.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.rtAO = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAO2 = this.rtAO.clone();
    this.aoMat = new THREE.ShaderMaterial({ vertexShader: VQ, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDepth: { value: this.rtScene.depthTexture }, uRes: { value: new THREE.Vector2() }, cameraNear: { value: 0 }, cameraFar: { value: 0 }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uRadius: { value: 0.5 }, uStrength: { value: 1.0 }, uFrame: { value: 0 } } });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: VQ, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tAO: { value: null }, tDepth: { value: this.rtScene.depthTexture }, uDir: { value: new THREE.Vector2() }, cameraNear: { value: 0 }, cameraFar: { value: 0 } } });
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VQ, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rtScene.texture }, tAO: { value: this.rtAO.texture }, uAOMix: { value: 1 } } });
    this.quad = new FullScreenQuad(null);

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: hf, depthBuffer: true }));
    this.composer.addPass(new SceneWaterPass(this));
    this.dof = new ShaderPass(DOF); this.dof.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.composer.addPass(this.dof);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE); this.composer.addPass(this.grade);
    this.output = new OutputPass(); this.composer.addPass(this.output);
    this.smaa = new SMAAPass(1, 1); this.composer.addPass(this.smaa);
    this.frame = 0;
  }
  get sceneColor() { return this.rtScene.texture; }
  get sceneDepth() { return this.rtScene.depthTexture; }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio(), W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.W = W; this.H = H;
    this.rtScene.setSize(W, H);
    const aw = Math.max(1, W >> 1), ah = Math.max(1, H >> 1);
    this.rtAO.setSize(aw, ah); this.rtAO2.setSize(aw, ah);
    this.aoMat.uniforms.uRes.value.set(aw, ah);
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.dof.uniforms.uRes.value.set(W, H); this.grade.uniforms.uRes.value.set(W, H);
    this.dof.uniforms.uMaxCoc.value = 9 * pr;
    this.onResize?.(W, H);
  }
  _sceneAndWater(renderer, target) {
    const cam = this.camera, o = this.opts;
    // 1. 不透明场景
    cam.layers.set(0);
    renderer.setRenderTarget(this.rtScene); renderer.clear(); renderer.render(this.scene, cam);
    // 2. AO
    const near = cam.near, far = cam.far;
    if (o.ao) {
      const u = this.aoMat.uniforms;
      u.cameraNear.value = near; u.cameraFar.value = far; u.uProj.value.copy(cam.projectionMatrix); u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uRadius.value = o.aoRadius; u.uStrength.value = o.aoStrength; u.uFrame.value = this.frame++ % 64;
      this.quad.material = this.aoMat; renderer.setRenderTarget(this.rtAO); this.quad.render(renderer);
      const b = this.blurMat.uniforms; b.cameraNear.value = near; b.cameraFar.value = far;
      b.tAO.value = this.rtAO.texture; b.uDir.value.set(1 / this.rtAO.width, 0); this.quad.material = this.blurMat; renderer.setRenderTarget(this.rtAO2); this.quad.render(renderer);
      b.tAO.value = this.rtAO2.texture; b.uDir.value.set(0, 1 / this.rtAO.height); renderer.setRenderTarget(this.rtAO); this.quad.render(renderer);
    }
    this.compMat.uniforms.uAOMix.value = o.ao ? 1 : 0;
    // 3. 合成 + 水面与粒子
    this.quad.material = this.compMat; renderer.setRenderTarget(target); this.quad.render(renderer);
    renderer.clearDepth();
    cam.layers.set(LAYER_FX);
    const bg = this.scene.background; this.scene.background = null;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.render(this.scene, cam);
    renderer.autoClear = ac; this.scene.background = bg;
    cam.layers.set(0);
  }
  render(dt, focusDist) {
    const cam = this.camera, o = this.opts;
    this.dof.enabled = o.dof; this.bloom.enabled = o.bloom; this.smaa.enabled = o.smaa;
    const d = this.dof.uniforms; d.cameraNear.value = cam.near; d.cameraFar.value = cam.far; d.uFocus.value = focusDist;
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
