// 舞台：渲染器、灯光、雾、昼夜、后期处理。
import * as THREE from 'three';
import { QUALITY } from './config.js';
import { Sky } from './sky.js';
import { Post } from './post.js';
import { FX } from './fx.js';

export class Stage {
  constructor(canvas, qualityKey = 'high') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd0e0);
    this.scene.fog = new THREE.Fog(0x9fd0e0, 60, 170);
    this.hemi = new THREE.HemisphereLight(0xd4ecff, 0xa08f6c, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeccd, 2.9);
    this.sun.shadow.normalBias = 0.035; this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.sky = new Sky();
    this.sunDir = this.sky.dir;
    this.post = null; this.camera = null; this.w = 1; this.h = 1;
    this.qualityKey = qualityKey;
    this.applySky();
  }
  /** 镜头准备好后才能建后期管线 */
  attach(camera) { this.camera = camera; this.post = new Post(this.renderer, this.scene, camera); this.setQuality(this.qualityKey); }
  setQuality(k) {
    const q = QUALITY[k] || QUALITY.high;
    this.q = q; this.qualityKey = k;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow) { this.sun.shadow.mapSize.set(q.shadow, q.shadow); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.post?.setQuality(q);
    this.resize(this.w, this.h);
  }
  resize(w, h) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.post?.setSize(w, h); }
  /** 设定时刻（小时，可带小数） */
  setHour(h) { this.sky.set(h); this.applySky(); }
  applySky() {
    const s = this.sky;
    this.sun.color.copy(s.sunColor); this.sun.intensity = s.sunInt;
    this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGround); this.hemi.intensity = s.hemiInt;
    this.scene.background.copy(s.haze); this.scene.fog.color.copy(s.haze);
    this.renderer.toneMappingExposure = s.exposure;
    FX.uNight.value = s.night; FX.uCloud.value = 1 - s.night;
    this.post?.setMood(s);
    this.onSky?.(s);
  }
  /** 让阴影范围和雾跟着镜头走 */
  follow(focus, dist) {
    const half = THREE.MathUtils.clamp(dist * 0.78, 13, 48), sc = this.sun.shadow.camera, d = this.sunDir;
    const fx = Math.round(focus.x * 2) / 2, fz = Math.round(focus.z * 2) / 2;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + d.x * 60, d.y * 60, fz + d.z * 60);
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix(); }
    this.scene.fog.near = dist * 1.7; this.scene.fog.far = dist * 5.2 + 40;
  }
  render() { if (this.post) this.post.render(); else this.renderer.render(this.scene, this.camera); }
}
