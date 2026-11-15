// 后期处理：泛光 → 移轴景深（横、竖两遍）→ 调色与暗角 → 色调映射输出。
// 画质高：全部开启 + 4 倍多重采样；中：关闭泛光，2 倍采样；低：不走后期，直接渲染。
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.14 }, uMax: { value: 5 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uStep; uniform float uFocus; uniform float uBand; uniform float uMax; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - uFocus);
      float r = smoothstep(uBand, uBand + 0.36, d) * uMax * 0.25;
      if (r < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 c = texture2D(tDiffuse, vUv) * 0.18;
      c += (texture2D(tDiffuse, vUv + uStep * r) + texture2D(tDiffuse, vUv - uStep * r)) * 0.15;
      c += (texture2D(tDiffuse, vUv + uStep * r * 2.0) + texture2D(tDiffuse, vUv - uStep * r * 2.0)) * 0.12;
      c += (texture2D(tDiffuse, vUv + uStep * r * 3.0) + texture2D(tDiffuse, vUv - uStep * r * 3.0)) * 0.09;
      c += (texture2D(tDiffuse, vUv + uStep * r * 4.0) + texture2D(tDiffuse, vUv - uStep * r * 4.0)) * 0.05;
      gl_FragColor = c;
    }`,
};
const Grade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.08 }, uVig: { value: 0.3 }, uTint: { value: new THREE.Color(1, 1, 1) }, uAspect: { value: 1 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uVig; uniform vec3 uTint; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      c.rgb *= 1.0 - uVig * smoothstep(0.35, 1.05, length(p) * 1.25);
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.enabled = false; this.w = 1; this.h = 1;
    this.tiltAmount = 1;
  }
  setQuality(q) {
    this.dispose();
    this.enabled = !!q.post;
    if (!this.enabled) return;
    const r = this.renderer, isGL2 = r.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isGL2 ? q.samples : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92); this.composer.addPass(this.bloom); }
    this.tiltH = new ShaderPass(TiltShift); this.tiltV = new ShaderPass(TiltShift);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.tiltH); this.composer.addPass(this.tiltV); this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setSize(this.w, this.h);
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.tiltH.uniforms.uStep.value.set(1 / (w * pr), 0); this.tiltV.uniforms.uStep.value.set(0, 1 / (h * pr));
    // 竖屏时画面更高，焦点带要窄一些
    const band = w < h ? 0.1 : 0.14;
    for (const p of [this.tiltH, this.tiltV]) { p.uniforms.uMax.value = 5.5 * pr * this.tiltAmount; p.uniforms.uBand.value = band; }
    this.grade.uniforms.uAspect.value = w / h;
  }
  /** 按昼夜微调：夜里泛光更强、饱和度稍低 */
  setMood(sky) {
    if (!this.composer) return;
    if (this.bloom) { this.bloom.strength = 0.28 + sky.night * 0.45; this.bloom.threshold = 0.92 - sky.night * 0.25; }
    this.grade.uniforms.uSat.value = 1.08 - sky.night * 0.12;
    this.grade.uniforms.uTint.value.setRGB(1 + (1 - sky.night) * 0.015, 1, 1 - (1 - sky.night) * 0.02 + sky.night * 0.04);
  }
  render() { if (this.enabled) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
  dispose() {
    if (!this.composer) return;
    this.composer.passes.forEach((p) => p.dispose?.());
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.composer = null; this.bloom = null;
  }
}
