// 天空和海、岛之间的过渡：
//  - 地平线上的积云：一圈远处的云团，跟着太阳变色（清晨粉白、正午雪白、黄昏橘红、夜里灰蓝），被雾气淡化，慢慢飘；
//    地面上本来就有云影在走（materials.js 的 cloudShadow），天上的云和地上的影子一起，天空不再是一张背景图。
//  - 清晨的海雾：日出前后海面上浮着一层薄雾，离岸一段距离才开始，随风慢慢流动，太阳升高后散掉。
// 两样都只有一次绘制。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, rng } from './noise.js';
import { U } from './materials.js';

function cloudGeometry(seed = 7, n = 16) {
  const R = rng(seed), list = [], top = new THREE.Color(1, 1, 1), bot = new THREE.Color(0.8, 0.84, 0.92);
  for (let c = 0; c < n; c++) {
    const a = (c / n) * Math.PI * 2 + (R() - 0.5) * 0.3, d = 130 + R() * 60, s = 9 + R() * 12, h = 6 + R() * 14;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, puffs = 5 + Math.floor(R() * 5);
    for (let i = 0; i < puffs; i++) {
      const r = s * (0.35 + R() * 0.4), g = new THREE.IcosahedronGeometry(r, 2);
      // 沿切线方向排开、中间高两头低；底部压平
      const u = (i / (puffs - 1) - 0.5) * 2, ox = -Math.sin(a) * u * s * 1.3, oz = Math.cos(a) * u * s * 1.3, oy = (1 - u * u) * s * 0.35 + R() * s * 0.15;
      g.scale(1.2, 0.75, 1); g.translate(cx + ox + (R() - 0.5) * s * 0.4, h + oy, cz + oz + (R() - 0.5) * s * 0.4);
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) { if (p.getY(k) < h) p.setY(k, h + (p.getY(k) - h) * 0.25); const f = THREE.MathUtils.clamp((p.getY(k) - h) / (s * 0.9), 0, 1), cc = bot.clone().lerp(top, Math.sqrt(f)); col.set([cc.r, cc.g, cc.b], k * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); list.push(g);
    }
  }
  const out = mergeGeometries(list, false); for (const g of list) g.dispose();
  return out;
}

export class SkyLayer {
  constructor(scene) {
    // 云：受光（太阳色、天光），雾气按距离把云淡进天边
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true, transparent: true, opacity: 0.92, depthWrite: false });
    this.clouds = new THREE.Mesh(cloudGeometry(), this.cloudMat); this.clouds.frustumCulled = false; this.clouds.renderOrder = -1;
    this.clouds.onBeforeRender = (r) => { this._fogD = scene.fog?.density; if (scene.fog) scene.fog.density = this._fogD * 0.42; };   // 云在很远处：雾只淡化一部分
    this.clouds.onAfterRender = () => { if (scene.fog) scene.fog.density = this._fogD; };
    scene.add(this.clouds);
    // 海雾：一个绕岛的环形薄片
    const g = new THREE.RingGeometry(1, 2, 96, 6); g.rotateX(-Math.PI / 2);
    this.mistMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(0xe8e0d8) }, uK: { value: 0 }, uC: { value: new THREE.Vector3() }, uR: { value: new THREE.Vector2(6, 22) } },
      vertexShader: /* glsl */`
        uniform vec3 uC; uniform vec2 uR; varying vec3 vW;
        void main() { vec3 p = position; float r = length(p.xz); vec2 d = p.xz / r; p.xz = d * mix(uR.x, uR.y, r - 1.0); p += uC; vW = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uColor; uniform float uK; uniform vec3 uC; uniform vec2 uR; varying vec3 vW;
        ${GLSL_NOISE}
        void main() {
          float r = length(vW.xz - uC.xz);
          float edge = smoothstep(uR.x, uR.x + 3.0, r) * (1.0 - smoothstep(uR.y - 6.0, uR.y, r));
          vec2 q = vW.xz * 0.11 + vec2(uTime * 0.012, uTime * 0.005);
          float n = fbm2(q) * 0.6 + fbm2(q * 2.7 - uTime * 0.02) * 0.4;
          float a = smoothstep(-0.15, 0.45, n) * edge * uK;
          gl_FragColor = vec4(uColor, a * 0.6);
        }`,
    });
    this.mist = new THREE.Mesh(g, this.mistMat); this.mist.frustumCulled = false; this.mist.position.y = 0.16; this.mist.renderOrder = 3; this.mist.visible = false;
    scene.add(this.mist);
  }
  /** 时段变了：云的亮度跟天光走；海雾只在清晨（5–8:30） */
  setHour(h, p) {
    const k = h < 4.6 || h > 9 ? 0 : h < 5.8 ? (h - 4.6) / 1.2 : h < 7.2 ? 1 : 1 - (h - 7.2) / 1.8;
    this.mistMat.uniforms.uK.value = Math.max(0, Math.min(1, k));
    this.mist.visible = k > 0.01;
    this.mistMat.uniforms.uColor.value.set(p.fog).lerp(new THREE.Color(0xffffff), 0.35);
    // 夜里云是暗的灰蓝；白天由太阳和天光照亮
    this.cloudMat.emissive.set(p.hor).multiplyScalar(0.42 * (1 - p.nightK * 0.75));
  }
  update(dt, focus, center, radius) {
    this.clouds.position.set(focus.x, 0, focus.z); this.clouds.rotation.y += dt * 0.0015;
    if (center) { this.mistMat.uniforms.uC.value.set(center.x, 0, center.z); this.mistMat.uniforms.uR.value.set(radius + 2.5, radius + 26); }
  }
}
