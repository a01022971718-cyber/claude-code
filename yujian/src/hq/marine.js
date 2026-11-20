// 海洋生态：按水深和朝向分区——浅滩珊瑚礁（南）、海草床（西）、巨藻林（北，断崖下）、礁岩带（东），外海有海豚群、座头鲸和水母。
// 物理：鱼群用群体算法（分离/对齐/聚拢 + 避开岸、海底和海面 + 躲避海豚）；海豚跃出水面走抛物线；水母靠伞盖收缩产生推力、水的阻力减速；
// 漂浮物按海面波浪做浮力和摇摆；海带/海草按波浪在水下的轨道运动摆动；入水处溅起水花（受重力）并荡开涟漪。
import * as THREE from 'three';
import { simplify } from './simplify.js';
import { STYLE } from './blocky.js';
import * as M from './models-marine.js';
import { GLSL_NOISE } from './noise.js';
import { GLSL_WAVES, currentAt, G } from './waves.js';
import { U, GLSL_CAUSTIC } from './materials.js';
import { LAYER_FX } from './pipeline.js';
import { rng, makeNoise } from './noise.js';
import { DIRS } from '../hex.js';
import { fitBounds, inView, throttle } from './cull.js';

const NZB = makeNoise(4242);

const V3 = THREE.Vector3;
const geoOf = (r) => (r && r.geometry) || r;

/** 海洋生物材质：按 defines 选择动画方式；片元里加水下焦散 */
export function marineMaterial({ mode = 'none', rough = 0.6, transparent = false, opacity = 1, emissive = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, transparent, opacity, envMapIntensity: 0.9 });
  m.defines = { ['MODE_' + mode.toUpperCase()]: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uGlow: { value: emissive } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute float bend; attribute float sway; attribute float rim; attribute float tent;
        #ifdef USE_INSTANCING
        attribute vec4 iAnim;
        #else
        vec4 iAnim = vec4(0.0, 6.0, 0.08, 0.0);
        #endif
        varying vec3 vWP2;
        ${GLSL_NOISE}
        ${GLSL_WAVES}`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        #ifdef MODE_SWIM
          // 鱼：沿身体向后传播的侧向波，越靠尾巴摆幅越大
          transformed.x += sin(uTime * iAnim.y - bend * 5.5 + iAnim.x) * iAnim.z * pow(bend, 1.6);
        #endif
        #ifdef MODE_SWIMV
          // 海豚和鲸：上下摆尾
          transformed.y += sin(uTime * iAnim.y - bend * 3.5 + iAnim.x) * iAnim.z * pow(bend, 2.2);
        #endif
        #ifdef MODE_ORBIT
          // 水草/海带：跟着水质点的轨道运动摆，越往上（越靠近海面）摆得越大
          {
            mat4 im = mat4(1.0);
            #ifdef USE_INSTANCING
              im = instanceMatrix;
            #endif
            vec3 wp = (modelMatrix * im * vec4(transformed, 1.0)).xyz;
            vec3 o = waveOrbit(wp.xz, wp.y, uTime) * 2.2 + vec3(snoise2(wp.xz * 2.0 + uTime * 0.3), 0.0, snoise2(wp.xz * 2.0 - uTime * 0.27)) * 0.012;
            transformed += inverse(mat3(modelMatrix * im)) * vec3(o.x, o.y * 0.3, o.z) * sway;
          }
        #endif
        #ifdef MODE_JELLY
          // 水母：伞缘向内收缩（推进），触手随后飘动
          float pulse = pow(max(0.0, sin(uTime * iAnim.y + iAnim.x)), 2.0);
          transformed.xz *= 1.0 - pulse * 0.28 * rim * (1.0 - tent);
          transformed.y += pulse * 0.006 * rim * (1.0 - tent);
          transformed.x += sin(uTime * 2.1 + tent * 5.0 + iAnim.x) * 0.006 * tent;
          transformed.z += cos(uTime * 1.7 + tent * 4.0 + iAnim.x) * 0.006 * tent;
        #endif`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWP2 = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform vec3 uSunCol; uniform float uCaustic; uniform float uGlow;\nvarying vec3 vWP2;\n${GLSL_NOISE}\n${GLSL_CAUSTIC}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * caustics(vWP2, uTime) * uCaustic * 0.8;
        #ifdef MODE_JELLY
          totalEmissiveRadiance += vec3(0.45, 0.6, 1.0) * uGlow;
        #endif`);
  };
  m.customProgramCacheKey = () => 'hq-marine-' + mode + transparent + emissive;
  return m;
}

/** 实例化网格 + 每个实例的动画参数 */
// 珊瑚、巨藻、鱼的模型只生成一次（岛变大后重建栖息地时直接复用）；swarm 会复制一份再加实例属性
const MEMO = new Map();
const memo = (k, make) => { let r = MEMO.get(k); if (!r) MEMO.set(k, r = make()); return r; };
function swarm(geo, mat, n) {
  // 海里的鱼、水母、珊瑚只有几厘米大，又隔着一层海水：用减面后的模型（原模型每只约 3000 个三角形）
  const src = geoOf(geo), g = (src.userData.vox ? src : simplify(src, STYLE.blocky ? 5 : 7)).clone();   // 体素模型本来就省，不再减面
  for (const a of ['bend', 'sway', 'rim', 'tent']) if (!g.attributes[a]) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  const anim = new Float32Array(n * 4);
  g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4));
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, anim };
}

// ------------------------------------------------------------------
// 溅水粒子：每一滴受重力和空气阻力，落回海面就消失
// ------------------------------------------------------------------
const SPLASH_VERT = `
attribute float aSize; attribute float aAlpha; uniform float uPR; varying float vA; varying float vViewZ;
void main(){ vA = aAlpha; vec4 mv = viewMatrix * vec4(position, 1.0); vViewZ = mv.z; gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPR / -mv.z; }`;
const SPLASH_FRAG = `
#include <packing>
uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform float cameraNear; uniform float cameraFar; uniform vec3 uCol;
varying float vA; varying float vViewZ;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5 || vA <= 0.0) discard;
  float sz = perspectiveDepthToViewZ(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r, cameraNear, cameraFar);
  float soft = clamp((vViewZ - sz) * 8.0, 0.0, 1.0);
  gl_FragColor = vec4(uCol, vA * smoothstep(0.5, 0.1, r) * soft);
}`;
export class Splashes {
  constructor(sceneDepth, n = 900) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.p, 3); this.aSize = new THREE.BufferAttribute(new Float32Array(n), 1); this.aAlpha = new THREE.BufferAttribute(new Float32Array(n), 1);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    g.boundingSphere = new THREE.Sphere(new V3(), 1000);
    this.uniforms = { uPR: { value: 800 }, uSceneDepth: { value: sceneDepth }, uResolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, uCol: { value: new THREE.Color(1, 1, 1) } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false; this.points.layers.set(LAYER_FX); this.points.renderOrder = 11;
  }
  /** 在 (x,y,z) 溅起 count 滴：speed 初速，up 向上分量，spread 水平散开 */
  emit(x, y, z, count, { speed = 0.45, up = 1, spread = 0.6, size = 0.025, life = 1.2, drag = 0.6, dir = null } = {}) {
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n, a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      let vx = Math.cos(a) * spread * s, vz = Math.sin(a) * spread * s, vy = up * s * (0.6 + Math.random() * 0.6);
      if (dir) { vx += dir[0] * s; vz += dir[2] * s; vy += dir[1] * s; }
      this.p.set([x + Math.cos(a) * 0.01, y, z + Math.sin(a) * 0.01], i * 3); this.v.set([vx, vy, vz], i * 3);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6); this.drag[i] = drag;
      this.aSize.array[i] = size * (0.5 + Math.random());
    }
  }
  update(dt) {
    const p = this.p, v = this.v, al = this.aAlpha.array;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { al[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= k; v[i * 3 + 2] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k - G * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < -0.01 && v[i * 3 + 1] < 0) this.life[i] = 0;
      al[i] = this.life[i] > 0 ? Math.min(1, this.life[i] / this.max[i] * 2) * 0.85 : 0;
    }
    this.aPos.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------------
// 鱼群：群体算法
// ------------------------------------------------------------------
class School {
  constructor(env, { geo, count, center, radius, depth, speed, nr = 0.12, sep = 0.05, w = {}, scale = 1, swim = [10, 0.006], seed = 1, home = null }) {
    this.env = env; this.n = count; this.center = new V3(...center); this.radius = radius; this.depth = depth; this.speed = speed; this.nr = nr; this.sepR = sep; this.scale = scale; this.home = home;
    this.w = { sep: 1.6, ali: 1.0, coh: 0.8, home: 0.6, wander: 0.35, ...w };
    const R = rng(seed);
    const { mesh, anim } = swarm(geo, env.mats.swim, count);
    this.mesh = mesh; this.pos = new Float32Array(count * 3); this.vel = new Float32Array(count * 3); this.seedA = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * radius * 0.6;
      this.pos.set([this.center.x + Math.cos(a) * r, (depth[0] + depth[1]) / 2 + (R() - 0.5) * 0.1, this.center.z + Math.sin(a) * r], i * 3);
      const h = R() * Math.PI * 2; this.vel.set([Math.cos(h) * speed[0], 0, Math.sin(h) * speed[0]], i * 3);
      anim.set([R() * 6.28, swim[0] * (0.85 + R() * 0.3), swim[1] * scale * (0.8 + R() * 0.4), 0], i * 4);
      this.seedA[i] = R() * 100;
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.s = new V3(scale, scale, scale); this.v = new V3();
  }
  update(dt, t) {
    const n = this.n, P = this.pos, Vv = this.vel, nr2 = this.nr * this.nr, sep2 = this.sepR * this.sepR, env = this.env, w = this.w;
    const cell = this.nr, grid = new Map();
    for (let i = 0; i < n; i++) { const k = Math.floor(P[i * 3] / cell) * 73856093 ^ Math.floor(P[i * 3 + 2] / cell) * 19349663; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
    const [vmin, vmax] = this.speed;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, cnt = 0;
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = grid.get((gx + ox) * 73856093 ^ (gz + oz) * 19349663); if (!a) continue;
        for (const j of a) {
          if (j === i) continue;
          const dx = P[j * 3] - x, dy = P[j * 3 + 1] - y, dz = P[j * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > nr2) continue;
          cnt++; ax += Vv[j * 3]; ay += Vv[j * 3 + 1]; az += Vv[j * 3 + 2]; cx += dx; cy += dy; cz += dz;
          if (d2 < sep2) { const f = 1 / Math.max(d2, 1e-5); sx -= dx * f * 0.002; sy -= dy * f * 0.002; sz -= dz * f * 0.002; }
        }
      }
      let fx = 0, fy = 0, fz = 0;
      if (cnt) {
        fx += sx * w.sep + (ax / cnt - Vv[i * 3]) * w.ali + cx / cnt * w.coh * 2;
        fy += sy * w.sep + (ay / cnt - Vv[i * 3 + 1]) * w.ali + cy / cnt * w.coh * 2;
        fz += sz * w.sep + (az / cnt - Vv[i * 3 + 2]) * w.ali + cz / cnt * w.coh * 2;
      }
      // 栖息范围
      const hc = this.home ? this.home(t) : this.center, hx = hc.x - x, hz = hc.z - z, hd = Math.hypot(hx, hz);
      if (hd > this.radius * 0.5) { const f = (hd - this.radius * 0.5) / this.radius * w.home; fx += hx / hd * f; fz += hz / hd * f; }
      // 闲逛
      const sd = this.seedA[i];
      fx += Math.sin(t * 0.7 + sd) * 0.04 * w.wander; fz += Math.cos(t * 0.6 + sd * 1.3) * 0.04 * w.wander; fy += Math.sin(t * 0.9 + sd * 2.1) * 0.01 * w.wander;
      // 避开陆地：沿离岸距离场的梯度推开
      const s0 = env.ocean.shoreAt(x, z);
      if (s0 > 0.72) { const e = 0.12, gx2 = env.ocean.shoreAt(x + e, z) - env.ocean.shoreAt(x - e, z), gz2 = env.ocean.shoreAt(x, z + e) - env.ocean.shoreAt(x, z - e), gl = Math.hypot(gx2, gz2) || 1; const f = (s0 - 0.72) * 3.5; fx -= gx2 / gl * f; fz -= gz2 / gl * f; }
      // 深度：不碰海底、不出水面，偏好自己的水层
      const sb = env.terrain.seabedAt(x, z), lo = Math.max(this.depth[0], sb + 0.06), hi = this.depth[1];
      if (y < lo) fy += (lo - y) * 6; if (y > hi) fy -= (y - hi) * 6;
      // 躲避海豚
      for (const d of env.predators) { const dx = x - d.x, dy = y - d.y, dz = z - d.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < 0.45) { const f = (0.45 - d2) * 6; fx += dx * f; fy += dy * f; fz += dz * f; } }
      // 积分：力限幅、速度限幅，再叠加水流
      const fl = Math.hypot(fx, fy, fz), fmax = 0.6; if (fl > fmax) { fx *= fmax / fl; fy *= fmax / fl; fz *= fmax / fl; }
      let vx = Vv[i * 3] + fx * dt, vy = Vv[i * 3 + 1] + fy * dt, vz = Vv[i * 3 + 2] + fz * dt;
      const sp = Math.hypot(vx, vy, vz), cl = Math.min(vmax, Math.max(vmin, sp)) / (sp || 1); vx *= cl; vy *= cl * 0.6; vz *= cl;
      Vv[i * 3] = vx; Vv[i * 3 + 1] = vy; Vv[i * 3 + 2] = vz;
      const cur = currentAt(x, y, z, t);
      P[i * 3] = x + (vx + cur[0] * 0.6) * dt; P[i * 3 + 1] = y + (vy + cur[1] * 0.3) * dt; P[i * 3 + 2] = z + (vz + cur[2] * 0.6) * dt;
      this.e.set(-Math.asin(Math.max(-0.8, Math.min(0.8, vy / (Math.hypot(vx, vy, vz) || 1)))), Math.atan2(vx, vz), 0);
      this.q.setFromEuler(this.e);
      this.mesh.setMatrixAt(i, this.m4.compose(this.v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true; fitBounds(this.mesh, 0.15);
  }
}

// ------------------------------------------------------------------
// 整个海洋生态
// ------------------------------------------------------------------
export class Marine {
  /** zones: 'angle' 按离岛方位分区（样张）；'noise' 沿海岸采样、按世界噪声分区（游戏，岛会变大）。radius: 岛的大致半径 */
  constructor({ scene, terrain, ocean, sceneDepth, center, zones = 'angle', radius = 4.5 }) {
    this.scene = scene; this.terrain = terrain; this.ocean = ocean; this.center = center.clone(); this.zoneMode = zones; this.radius = radius;
    this.group = new THREE.Group(); scene.add(this.group);
    this.habitat = new THREE.Group(); this.group.add(this.habitat);
    this.mats = { swim: marineMaterial({ mode: 'swim', rough: 0.45 }), swimV: marineMaterial({ mode: 'swimv', rough: 0.35 }), orbit: marineMaterial({ mode: 'orbit', rough: 0.75 }), still: marineMaterial({ mode: 'none', rough: 0.8 }),
      jelly: marineMaterial({ mode: 'jelly', rough: 0.2, transparent: true, opacity: 0.72, emissive: 0.05 }) };
    this.splash = new Splashes(sceneDepth); scene.add(this.splash.points);
    this.predators = [];
    this.R = rng(2027);
    this._zones();
    this._reef();
    this._fish();
    this._turtles();
    this._dolphins();
    this._whale();
    this._jellies();
    this.floaters = [];
  }
  /** 海底采样：按离岛方向分区 */
  _zones() {
    const T = this.terrain, c = this.center, R = this.R;
    this.spots = { reef: [], grass: [], kelp: [], rocky: [] };
    const coast = this.zoneMode === 'noise' ? T.tiles.filter((t) => DIRS.some((d) => !T.has(t.q + d[0], t.r + d[1]))) : null;
    this.coastN = coast ? coast.length : 12;
    const N = coast ? Math.min(16000, Math.max(3000, coast.length * 420)) : 9000;
    for (let k = 0; k < N; k++) {
      let x, z;
      if (coast) { const t = coast[Math.floor(R() * coast.length)], a = R() * Math.PI * 2, r = 0.9 + R() * 3.4; x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r; }
      else { const a = R() * Math.PI * 2, r = 2 + R() * 9; x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; }
      if (T.tileAt(x, z)) continue;
      const dl = T.landDist(x, z), y = T.seabedAt(x, z), s = this.ocean.shoreAt(x, z);
      if (s > 0.97 || dl > 3.2) continue;
      if (coast) {
        // 世界噪声决定这一段海岸是礁岩、珊瑚、海草还是巨藻；同一片海每次生成都一样
        const b = NZB.fbm2(x * 0.13 + 7, z * 0.13 - 3, 2), p = [x, y, z, dl];
        if (b > 0.3 && y > -1.6) this.spots.rocky.push(p);
        else if (b > 0.0 && y > -1.5 && y < -0.42) this.spots.reef.push(p);
        else if (b > -0.22 && y > -1.3 && y < -0.42) this.spots.grass.push(p);
        else if (y < -0.8) this.spots.kelp.push(p);
        else if (y > -1.3 && y < -0.42) this.spots.grass.push(p);
        continue;
      }
      const ang = ((Math.atan2(z - c.z, x - c.x) * 180 / Math.PI) + 360) % 360;   // 0=东, 90=南, 180=西, 270=北
      const p = [x, y, z, dl];
      if (ang > 35 && ang < 150 && y > -1.5 && y < -0.42) this.spots.reef.push(p);
      else if (ang >= 150 && ang < 235 && y > -1.3 && y < -0.42) this.spots.grass.push(p);
      else if (ang >= 235 && ang < 330 && y < -0.8) this.spots.kelp.push(p);
      else if ((ang >= 330 || ang <= 35) && y > -1.6) this.spots.rocky.push(p);
    }
  }
  _place(list, n, minD = 0.05) {
    const out = [], R = this.R;
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      const p = list[Math.floor(R() * list.length)]; if (!p) break;
      if (out.every((q) => (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2 > minD * minD)) out.push(p);
    }
    return out;
  }
  _inst(geo, mat, items, { castShadow = false } = {}) {
    if (!items.length) return null;
    const { mesh, anim } = swarm(geo, mat, items.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p = new V3();
    items.forEach((it, i) => {
      e.set(it.tx || 0, it.ry, it.tz || 0); q.setFromEuler(e); s.set(it.s, it.sy ?? it.s, it.s);
      mesh.setMatrixAt(i, m4.compose(p.set(it.x, it.y, it.z), q, s));
      anim.set([i * 1.7, 2 + (i % 5) * 0.2, 0, 0], i * 4);
      if (it.tint) mesh.setColorAt(i, new THREE.Color(...it.tint));
    });
    mesh.castShadow = castShadow; fitBounds(mesh, 0.3); this.habitat.add(mesh);   // 珊瑚、海带：按实例位置算包围球，画面外整组不画
    return mesh;
  }
  _reef() {
    const R = this.R, sp = this.spots;
    // 珊瑚：成簇分布
    const cn = this.coastN, k3 = (a, lo, hi) => (this.zoneMode === 'noise' ? Math.round(Math.min(hi, Math.max(lo, cn * a))) : null);
    const clusters = this._place(sp.reef, k3(0.9, 6, 40) ?? 22, 0.5), corals = { branch: [[], [], []], brain: [], table: [], fan: [], anem: [], star: [], urchin: [] };
    for (const c of clusters) {
      const n = 10 + Math.floor(R() * 8);
      for (let k = 0; k < n; k++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * 0.42, x = c[0] + Math.cos(a) * r, z = c[2] + Math.sin(a) * r, y = this.terrain.seabedAt(x, z) - 0.008;
        if (this.terrain.tileAt(x, z)) continue;
        const it = { x, y, z, ry: R() * 6.28, s: 1.3 + R() * 1.3 }, pick = R();
        if (pick < 0.4) corals.branch[Math.floor(R() * 3)].push(it);
        else if (pick < 0.56) corals.brain.push(it);
        else if (pick < 0.61) corals.table.push({ ...it, s: 0.8 + R() * 0.5, tint: [1.25, 0.72, 0.95] });
        else if (pick < 0.75) corals.fan.push(it);
        else if (pick < 0.86) corals.anem.push(it);
        else if (pick < 0.94) corals.star.push({ ...it, y: y + 0.004, s: 1.4 });
        else corals.urchin.push({ ...it, s: 1.4 });
      }
    }
    // 礁岩带：海葵、海胆、海星
    for (const p of this._place(sp.rocky, k3(3, 24, 140) ?? 70, 0.08)) {
      const it = { x: p[0], y: p[1] - 0.005, z: p[2], ry: R() * 6.28, s: 1.2 + R() * 0.8 }, pick = R();
      (pick < 0.45 ? corals.anem : pick < 0.75 ? corals.urchin : corals.star).push(it);
    }
    this.anemones = corals.anem.slice(0, 6);
    const S = this.mats.still, O = this.mats.orbit;
    ['pink', 'purple', 'orange'].forEach((cName, i) => this._inst(memo('br' + i, () => M.branchCoral(i + 3, cName)), S, corals.branch[i]));
    this._inst(memo('brain', () => M.brainCoral(5)), S, corals.brain); this._inst(memo('table', () => M.tableCoral(6)), S, corals.table);
    this._inst(memo('fan', () => M.seaFan(7)), O, corals.fan); this._inst(memo('anem', () => M.anemone(8)), O, corals.anem);
    this._inst(memo('star', () => M.starfish(9)), S, corals.star); this._inst(memo('urchin', () => M.seaUrchin(10)), S, corals.urchin);
    // 巨藻林：从海底一直长到快到海面
    const kelpV = memo('kelp', () => [M.kelp(11, 1.0), M.kelp(12, 1.3), M.kelp(13, 1.6)]), kelpItems = [[], [], []];
    for (const p of this._place(sp.kelp, k3(2.2, 20, 110) ?? 90, 0.18)) {
      const top = -0.14 - R() * 0.14, hh = top - p[1], v = hh > 1.3 ? 2 : hh > 1.0 ? 1 : 0, base = [1.0, 1.3, 1.6][v];
      kelpItems[v].push({ x: p[0], y: p[1] - 0.01, z: p[2], ry: R() * 6.28, s: 1, sy: hh / base });
    }
    kelpV.forEach((g, i) => this._inst(g, O, kelpItems[i]));
    // 海草床（海龟的食物）
    this.seagrassSpots = sp.grass;
    this.counts = { corals: Object.values(corals).flat(2).length, kelp: kelpItems.flat().length };
  }
  seagrassBlades() {
    const R = this.R, out = [];
    for (const p of this._place(this.spots.grass, this.zoneMode === 'noise' ? Math.min(900, Math.max(150, this.coastN * 18)) : 400, 0.02)) {
      for (let k = 0; k < 18; k++) {
        const x = p[0] + (R() - 0.5) * 0.3, z = p[2] + (R() - 0.5) * 0.3; if (this.terrain.tileAt(x, z)) continue;
        const y = this.terrain.seabedAt(x, z), g = 0.8 + R() * 0.3;
        out.push({ x, y: y - 0.005, z, h: 0.07 + R() * 0.08, w: 0.012 + R() * 0.006, lean: 0, rot: R() * 6.28, tint: [0.16 * g, 0.42 * g, 0.18 * g], tint2: [0.06, 0.17, 0.08] });
      }
    }
    return out;
  }
  _fish() {
    const sp = this.spots, pickC = (list, f) => { const p = list[Math.floor(list.length * f)] || list[0] || [this.center.x + 4, -0.7, this.center.z]; return [p[0], 0, p[2]]; };
    this.schools = [
      new School(this, { geo: M.fish(1, 'tang'), count: 70, center: pickC(sp.reef, 0.3), radius: 1.6, depth: [-1.2, -0.18], speed: [0.05, 0.12], scale: 2.1, seed: 3 }),
      new School(this, { geo: M.fish(2, 'blue'), count: 45, center: pickC(sp.reef, 0.75), radius: 1.4, depth: [-1.2, -0.2], speed: [0.05, 0.13], scale: 2.1, seed: 4 }),
      new School(this, { geo: M.fish(3, 'sardine'), count: 200, center: [this.center.x - this.radius - 3, 0, this.center.z - 1], radius: 2.4, depth: [-0.9, -0.12], speed: [0.14, 0.28], nr: 0.1, sep: 0.03, w: { coh: 1.6, ali: 1.6, home: 0.9 }, scale: 1.9, swim: [16, 0.004], seed: 5,
        home: (t) => new V3(this.center.x - this.radius - 3 + Math.cos(t * 0.05) * 2.5, 0, this.center.z - 1 + Math.sin(t * 0.07) * 2.5) }),
    ];
    for (const s of this.schools) this.group.add(s.mesh);
    this._clowns();
  }
  /** 小丑鱼：守在海葵旁边 */
  _clowns() {
    this.clowns = this.anemones.map((a, i) => new School(this, { geo: memo('clown' + i, () => M.fish(20 + i, 'clown')), count: 3, center: [a.x, 0, a.z], radius: 0.18, depth: [a.y + 0.03, a.y + 0.12], speed: [0.015, 0.04], nr: 0.08, sep: 0.03, w: { home: 3 }, scale: 2.0, seed: 30 + i }));
    for (const s of this.clowns) { this.schools.push(s); this.group.add(s.mesh); }
  }
  /** 游戏里岛变大以后：按新的海岸重建珊瑚、巨藻、海草（返回新的海草叶片列表），鱼群、海龟、海豚、鲸换到新的活动范围 */
  rebuild(center, radius) {
    this.center.copy(center); this.radius = radius; this.R = rng(2027);
    for (const m of [...this.habitat.children]) { this.habitat.remove(m); m.geometry.dispose(); m.dispose?.(); }
    for (const s of this.clowns) { this.group.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.dispose?.(); }
    this.schools = this.schools.filter((s) => !this.clowns.includes(s));
    this._zones(); this._reef();
    const sp = this.spots, pick = (list, f, fb) => { const p = list[Math.floor(list.length * f)] || list[0]; return p ? [p[0], 0, p[2]] : fb; };
    const fb = [this.center.x + radius + 1, 0, this.center.z];
    this.schools[0].center.set(...pick(sp.reef, 0.3, fb)); this.schools[1].center.set(...pick(sp.reef.length ? sp.reef : sp.grass, 0.75, fb));
    this._clowns();
    this.turtles.forEach((tu, i) => { const h = (i === 0 ? sp.grass : sp.reef)[Math.floor(this.R() * 50)]; if (h) tu.home = h; });
    this.whale.z = this.center.z - this.radius - 15.5;
    return this.seagrassBlades();
  }
  _turtles() {
    this.turtles = [];
    const g = M.turtle(1), mat = this.mats.still, R = this.R;
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group(), parts = {};
      if (g.parts) for (const [k, p] of Object.entries(g.parts)) {
        const geo = p.geometry.clone(), pv = p.pivot || [0, 0, 0]; geo.translate(-pv[0], -pv[1], -pv[2]);
        const m = new THREE.Mesh(geo, mat); m.position.fromArray(pv); grp.add(m); parts[k] = m;
      } else grp.add(new THREE.Mesh(geoOf(g), mat));
      grp.scale.setScalar(1.6);
      const home = (i === 0 ? this.spots.grass : this.spots.reef)[Math.floor(R() * 50)] || [this.center.x + 3, -0.7, this.center.z + 3];
      grp.position.set(home[0], home[1] + 0.25, home[2]);
      this.group.add(grp);
      this.turtles.push({ grp, parts, vel: new V3(0.04, 0, 0), target: grp.position.clone(), phase: R() * 6, breathe: 15 + R() * 20, surface: 0, home });
    }
  }
  _dolphins() {
    const g = M.dolphin(1), { mesh, anim } = swarm(g, this.mats.swimV, 4);
    this.dolphins = { mesh, anim, list: [] };
    for (let i = 0; i < 4; i++) {
      anim.set([i * 1.3, 7.5, 0.025, 0], i * 4);
      this.dolphins.list.push({ x: 0, y: -0.14, z: 0, vy: 0, mode: 'cruise', next: 4 + i * 2.5 + this.R() * 4, offs: [(i % 2 ? 1 : -1) * 0.35 * Math.ceil(i / 2), -0.4 * i], pitch: 0, yaw: 0, wasAbove: false });
    }
    mesh.castShadow = false; this.group.add(mesh);
  }
  _whale() {
    const g = M.whale(1), { mesh, anim } = swarm(g, this.mats.swimV, 1);
    anim.set([0, 1.6, 0.06, 0], 0);
    this.whale = { mesh, t: 12, x: this.center.x - 14, z: this.center.z - this.radius - 15.5, spouts: 0 };
    mesh.castShadow = false; this.group.add(mesh);
  }
  _jellies() {
    const n = 26, { mesh, anim } = swarm(M.jelly(1), this.mats.jelly, n), R = this.R;
    this.jellies = { mesh, anim, list: [] };
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = this.radius + 1.5 + R() * 5, f = 2.6 + R() * 1.2;
      anim.set([R() * 6.28, f, 0, 0], i * 4);
      this.jellies.list.push({ p: new V3(this.center.x + Math.cos(a) * r, -0.15 - R() * 0.45, this.center.z + Math.sin(a) * r), v: new V3(), ph: anim[i * 4], f, s: 1.3 + R() * 0.9 });
    }
    this.group.add(mesh);
  }
  /** 加一个漂浮物：按海面波浪做浮力 */
  addFloater(obj, { draft = 0.0, damp = 2.2, stiff = 9, yawRate = 0.02 } = {}) {
    this.floaters.push({ obj, x: obj.position.x, z: obj.position.z, y: obj.position.y, vy: 0, draft, damp, stiff, yaw: obj.rotation.y, yawRate, q: obj.quaternion.clone(), x0: obj.position.x, z0: obj.position.z, ph: Math.random() * 6 });
  }

  update(dt, t) {
    this.predators = this.dolphins.list.map((d) => ({ x: d.x, y: d.y, z: d.z }));
    for (const s of this.schools) { const b = s.mesh.boundingSphere; throttle(s, !b || inView(b.center.x, b.center.y, b.center.z, b.radius), dt, (d) => s.update(d, t)); }   // 画面外的鱼群降频
    this._updTurtles(dt, t); this._updDolphins(dt, t); this._updWhale(dt, t); this._updJellies(dt, t); this._updFloaters(dt, t);
    this.splash.update(dt);
  }
  _updTurtles(dt, t) {
    const m4 = new THREE.Matrix4();
    for (const tu of this.turtles) {
      const p = tu.grp.position;
      tu.breathe -= dt;
      let tgt = tu.target;
      if (tu.breathe < 0) { tgt = new V3(p.x, -0.035, p.z); if (p.y > -0.05) { tu.surface += dt; if (tu.surface > 4) { tu.breathe = 25 + Math.random() * 20; tu.surface = 0; tu.target = new V3(tu.home[0] + (Math.random() - 0.5) * 2.5, tu.home[1] + 0.12, tu.home[2] + (Math.random() - 0.5) * 2.5); this.ocean.ripple(p.x, p.z, 0.5); } } }
      else if (p.distanceTo(tu.target) < 0.2) { tu.target.set(tu.home[0] + (Math.random() - 0.5) * 2.5, 0, tu.home[2] + (Math.random() - 0.5) * 2.5); tu.target.y = Math.max(this.terrain.seabedAt(tu.target.x, tu.target.z) + 0.1, -1.2); }
      // 划水：前鳍下拍时产生推力
      tu.phase += dt * 1.6;
      const stroke = Math.max(0, Math.sin(tu.phase)), desired = tgt.clone().sub(p); const dl = desired.length() || 1;
      desired.multiplyScalar((0.035 + stroke * 0.035) / dl);
      tu.vel.lerp(desired, Math.min(1, dt * 0.8));
      if (this.ocean.shoreAt(p.x + tu.vel.x, p.z + tu.vel.z) > 0.85) tu.vel.multiplyScalar(-0.5);
      p.addScaledVector(tu.vel, dt);
      p.y = Math.max(p.y, this.terrain.seabedAt(p.x, p.z) + 0.05);
      tu.grp.rotation.set(-Math.asin(THREE.MathUtils.clamp(tu.vel.y / (tu.vel.length() || 1), -0.6, 0.6)), Math.atan2(tu.vel.x, tu.vel.z), Math.sin(tu.phase) * 0.06, 'YXZ');
      const f = Math.sin(tu.phase) * 0.7, b = Math.sin(tu.phase + 1.2) * 0.35;
      if (tu.parts.flipperFL) tu.parts.flipperFL.rotation.z = f; if (tu.parts.flipperFR) tu.parts.flipperFR.rotation.z = -f;
      if (tu.parts.flipperBL) tu.parts.flipperBL.rotation.y = b; if (tu.parts.flipperBR) tu.parts.flipperBR.rotation.y = -b;
      if (tu.parts.head) tu.parts.head.rotation.x = tu.breathe < 0 && p.y > -0.06 ? -0.4 : Math.sin(t * 0.5) * 0.1;
    }
  }
  _updDolphins(dt, t) {
    const D = this.dolphins, c = this.center, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new V3(1.6, 1.6, 1.6);
    // 头领沿一条绕岛的路线游，经过沙丁鱼群（追猎）
    const R0 = this.radius + 6, w = 0.045 * 10.5 / R0, a = t * w;
    let lx = c.x + Math.cos(a) * R0 + Math.sin(t * 0.13) * 1.2, lz = c.z + Math.sin(a) * R0 * 0.85 + Math.cos(t * 0.11) * 1.2;
    // 被“唤来”时：头领朝指定的海面绕小圈游一阵
    const B = this.dolphinBoost;
    if (B && B.t > 0) { B.t -= dt; const k = Math.min(1, B.t / 3, (25 - B.t) / 3); const bx = B.x + Math.cos(t * 0.35) * 3.5, bz = B.z + Math.sin(t * 0.35) * 3.5; if (this.terrain.landDist(bx, bz) > 1.5) { lx += (bx - lx) * k; lz += (bz - lz) * k; } }
    const tx = -Math.sin(a) * R0 * w, tz = Math.cos(a) * R0 * 0.85 * w, tl = Math.hypot(tx, tz), fx = tx / tl, fz = tz / tl, sx = -fz, sz = fx;
    D.list.forEach((d, i) => {
      const hx = lx + sx * d.offs[0] + fx * d.offs[1], hz = lz + sz * d.offs[0] + fz * d.offs[1];
      const vh = 0.5;
      d.x += (hx - d.x) * Math.min(1, dt * 1.5); d.z += (hz - d.z) * Math.min(1, dt * 1.5);
      d.next -= dt;
      if (d.mode === 'cruise') {
        // 水下：浮力和阻力把它拉回巡游深度
        d.vy += ((-0.14 + Math.sin(t * 1.3 + i) * 0.03 - d.y) * 3 - d.vy * 2) * dt;
        if (d.next < 0) { d.mode = 'leap'; d.vy = 0.78 + Math.random() * 0.15; d.next = 7 + Math.random() * 8; }
      } else {
        // 跃出水面：在空中只受重力，回到水里后再受浮力和阻力
        if (d.y > 0) d.vy -= G * dt; else if (d.vy < 0) { d.vy *= Math.exp(-3 * dt); if (d.y < -0.12) d.mode = 'cruise'; }
      }
      d.y += d.vy * dt;
      const above = d.y > 0;
      if (above !== d.wasAbove) {
        const dir = [fx * 0.3, 0.2, fz * 0.3];
        this.splash.emit(d.x, 0.01, d.z, above ? 26 : 40, { speed: 0.45, up: 1.0, spread: 0.55, size: 0.03, life: 1.0, dir });
        this.ocean.ripple(d.x, d.z, 1);
        d.wasAbove = above;
      }
      d.pitch = Math.atan2(d.vy, vh);
      e.set(-d.pitch, Math.atan2(fx, fz), 0); q.setFromEuler(e);
      D.mesh.setMatrixAt(i, m4.compose(new V3(d.x, d.y, d.z), q, sc));
    });
    D.mesh.instanceMatrix.needsUpdate = true; fitBounds(D.mesh, 0.4);
  }
  _updWhale(dt, t) {
    const W = this.whale; W.t = (W.t + dt) % 70;
    const k = W.t, sp = 0.18;
    const lane = this.radius + 11.5; W.x += sp * dt; if (W.x > this.center.x + lane || W.x < this.center.x - lane - 2) W.x = this.center.x - lane;
    let y, pitch = 0;
    if (k < 8) { y = THREE.MathUtils.lerp(-0.8, -0.1, THREE.MathUtils.smoothstep(k, 0, 8)); pitch = 0.08; }
    else if (k < 22) { y = -0.085 + Math.sin(k * 0.8) * 0.01; pitch = 0; }
    else if (k < 30) { const u = (k - 22) / 8; pitch = -Math.sin(u * Math.PI * 0.6) * 0.7; y = -0.1 - u * 0.45; }
    else { y = -0.9; pitch = 0; }
    // 换气：喷出两股水雾
    if ((k > 10 && W.spouts === 0) || (k > 16 && W.spouts === 1)) {
      W.spouts++;
      const hx = W.x + 0.45 * 1.6 * 0.6, hz = W.z;
      this.splash.emit(hx, 0.06, hz, 120, { speed: 0.85, up: 1.6, spread: 0.12, size: 0.07, life: 2.2, drag: 1.4 });
      this.ocean.ripple(hx, hz, 0.6);
    }
    if (k < 1) W.spouts = 0;
    // 下潜时尾鳍出水，落回去溅起水花
    if (k > 27.5 && !W.tailSplash) { W.tailSplash = true; this.splash.emit(W.x - 0.7, 0.02, W.z, 90, { speed: 0.6, up: 1.3, spread: 0.5, size: 0.05, life: 1.6 }); this.ocean.ripple(W.x - 0.7, W.z, 1.2); }
    if (k < 22) W.tailSplash = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, Math.PI / 2, 0, 'YXZ'));
    W.mesh.setMatrixAt(0, m4.compose(new V3(W.x, y, W.z), q, new V3(1, 1, 1)));
    W.mesh.instanceMatrix.needsUpdate = true; fitBounds(W.mesh, 1.2);
  }
  _updJellies(dt, t) {
    const J = this.jellies, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3();
    J.list.forEach((j, i) => {
      // 伞盖收缩那一刻产生向上的推力；阻力让速度指数衰减；略微负浮力；被水流带着漂
      const ph = t * j.f + j.ph, pulse = Math.pow(Math.max(0, Math.sin(ph)), 2), dp = Math.cos(ph) > 0 && Math.sin(ph) > 0 ? 1 : 0;
      j.v.y += (pulse * dp * 0.06 - 0.012) * dt;
      j.v.multiplyScalar(Math.exp(-1.6 * dt));
      const cur = currentAt(j.p.x, j.p.y, j.p.z, t);
      j.p.x += (j.v.x + cur[0] * 0.9 + 0.006) * dt; j.p.y += (j.v.y + cur[1] * 0.5) * dt; j.p.z += (j.v.z + cur[2] * 0.9 + 0.003) * dt;
      if (j.p.y > -0.06) j.v.y -= 0.05 * dt; if (j.p.y < -0.75) j.v.y += 0.05 * dt;
      // 漂得太远（或漂进浅滩）就从岛的另一侧重新出现，水母群一直留在岛周围
      const dx = j.p.x - this.center.x, dz = j.p.z - this.center.z, dd = Math.hypot(dx, dz);
      if (dd > this.radius + 9 || (i % 7 === (Math.floor(t) % 7) && this.ocean.shoreAt(j.p.x, j.p.z) > 0.9)) { const a = Math.atan2(dz, dx) + Math.PI + (Math.random() - 0.5); const r = this.radius + 2 + Math.random() * 4; j.p.set(this.center.x + Math.cos(a) * r, -0.2 - Math.random() * 0.4, this.center.z + Math.sin(a) * r); j.v.set(0, 0, 0); }
      e.set(Math.sin(t * 0.3 + i) * 0.15, i, Math.cos(t * 0.27 + i) * 0.15); q.setFromEuler(e);
      J.mesh.setMatrixAt(i, m4.compose(j.p, q, sc.setScalar(j.s)));
    });
    J.mesh.instanceMatrix.needsUpdate = true; fitBounds(J.mesh, 0.2);
  }
  _updFloaters(dt, t) {
    const up = new V3(0, 1, 0), n = new V3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
    for (const f of this.floaters) {
      // 锚住的船在锚点附近慢慢打转漂动
      f.x = f.x0 + Math.sin(t * 0.07 + f.ph) * 0.12; f.z = f.z0 + Math.cos(t * 0.05 + f.ph) * 0.1;
      const s = this.ocean.surfaceAt(f.x, f.z);
      // 竖直方向：浮力（弹簧）+ 阻尼
      f.vy += ((s.h - f.draft - f.y) * f.stiff - f.vy * f.damp) * dt; f.y += f.vy * dt;
      f.yaw += Math.sin(t * 0.13 + f.ph) * f.yawRate * dt;
      n.set(s.nx, s.ny, s.nz); q.setFromUnitVectors(up, n); qy.setFromAxisAngle(up, f.yaw);
      f.q.slerp(q.multiply(qy), Math.min(1, dt * 2.5));
      f.obj.position.set(f.x, f.y, f.z); f.obj.quaternion.copy(f.q);
    }
  }
}
