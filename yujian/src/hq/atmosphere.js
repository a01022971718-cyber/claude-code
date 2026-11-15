// 天空、环境光照（IBL）、太阳、雾和各时段的光照预设。
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { U } from './materials.js';

// 每个时段：太阳方向（方位角/仰角，度）、太阳色和强度、天空散射参数、天光、雾、曝光、海水、夜灯
export const PRESETS = {
  morning: { name: '清晨', az: 25, el: 14, sun: 0xffc59a, sunI: 3.2, turb: 3.5, ray: 2.2, mie: 0.006, mieG: 0.86, gain: 0.55, hemi: [0xbcd2ff, 0x6f6a5a, 0.45], fog: 0xe6d6cf, fogD: 0.011, exp: 1.0, zen: 0x6f9fd6, hor: 0xf3d9c6, amb: 0x5a6a80, deep: 0x0b3a5a, shallow: 0x2aa7a6, lamp: 0.15, bloom: 0.38 },
  noon: { name: '正午', az: 100, el: 62, sun: 0xfff6e8, sunI: 4.2, turb: 2.2, ray: 1.2, mie: 0.004, mieG: 0.8, gain: 0.5, hemi: [0xcfe4ff, 0x7c7a62, 0.55], fog: 0xcfe6f2, fogD: 0.0095, exp: 0.95, zen: 0x3f86d0, hor: 0xcfe6f2, amb: 0x4f7088, deep: 0x053a5c, shallow: 0x1fb3b0, lamp: 0, bloom: 0.3 },
  afternoon: { name: '午后', az: 150, el: 40, sun: 0xffe7c4, sunI: 4.0, turb: 2.6, ray: 1.4, mie: 0.005, mieG: 0.82, gain: 0.5, hemi: [0xc9ddff, 0x7a7258, 0.5], fog: 0xcfe2ec, fogD: 0.01, exp: 0.98, zen: 0x4a8ccf, hor: 0xd9e8ee, amb: 0x4f6c84, deep: 0x063a5a, shallow: 0x22aaa8, lamp: 0, bloom: 0.32 },
  golden: { name: '黄昏', az: 38, el: 8, sun: 0xffa463, sunI: 3.8, turb: 4.0, ray: 2.4, mie: 0.0035, mieG: 0.92, gain: 0.38, hemi: [0xb8b4e6, 0x6a5040, 0.55], fog: 0xf0bf9c, fogD: 0.0075, exp: 1.0, zen: 0x6a7fc0, hor: 0xffc79a, amb: 0x5a5470, deep: 0x123554, shallow: 0x2f9a9e, lamp: 0.45, bloom: 0.34 },
  night: { name: '夜晚', az: 120, el: 48, sun: 0x9db8ff, sunI: 0.75, turb: 2, ray: 0.4, mie: 0.002, mieG: 0.7, gain: 0.025, hemi: [0x5a6fa8, 0x262a3a, 0.5], fog: 0x1c2846, fogD: 0.013, exp: 1.5, zen: 0x0f1a36, hor: 0x2c3a62, amb: 0x2a3858, deep: 0x041a30, shallow: 0x0f5a6a, lamp: 1, bloom: 0.6 },
};

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.sky = new Sky(); this.sky.scale.setScalar(4000);
    // 给天空加一个整体亮度系数，好和场景曝光配合
    this.sky.material.uniforms.uGain = { value: 0.5 };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float uGain;')
      .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( min( retColor * uGain, vec3( 1.05 ) ), 1.0 );');
    scene.add(this.sky);
    this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(4000); this.envSky.material = this.sky.material; this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.5); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(4096, 4096); s.bias = -0.0002; s.normalBias = 0.02; s.radius = 3;
    const c = s.camera; c.left = -11; c.right = 11; c.top = 11; c.bottom = -11; c.near = 1; c.far = 80;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xcfe2ec, 0.01);
    this.dir = new THREE.Vector3(0, 1, 0);
    this.center = new THREE.Vector3(1.2, 0, -0.4);
    this.preset = null;
  }
  apply(p, ocean, post) {
    this.preset = p;
    const az = THREE.MathUtils.degToRad(p.az), el = THREE.MathUtils.degToRad(p.el);
    this.dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize();
    const u = this.sky.material.uniforms;
    u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.mieG; u.uGain.value = p.gain;
    const night = p === PRESETS.night;
    u.sunPosition.value.copy(night ? new THREE.Vector3(-0.3, -0.05, -1) : this.dir);
    this.sun.color.set(p.sun); this.sun.intensity = p.sunI;
    this.sun.position.copy(this.center).addScaledVector(this.dir, 40); this.sun.target.position.copy(this.center);
    this.hemi.color.set(p.hemi[0]); this.hemi.groundColor.set(p.hemi[1]); this.hemi.intensity = p.hemi[2];
    this.scene.fog.color.set(p.fog); this.scene.fog.density = p.fogD;
    this.renderer.toneMappingExposure = p.exp;
    // 环境光照：把当前天空烘成预过滤的环境贴图
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = night ? 0.35 : 1.0;
    U.uCloud.value = night ? 0 : 1;
    if (ocean) {
      const o = ocean.uniforms;
      o.uSunDir.value.copy(this.dir); o.uSunColor.value.set(p.sun).multiplyScalar(p.sunI * 0.32);
      o.uZenith.value.set(p.zen); o.uHorizon.value.set(p.hor); o.uAmbient.value.set(p.amb);
      o.uDeep.value.set(p.deep); o.uShallow.value.set(p.shallow);
      o.uFogColor.value.set(p.fog); o.uFogDensity.value = p.fogD;
    }
    if (post) post.bloom.strength = p.bloom;
  }
}
