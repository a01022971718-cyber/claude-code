// 陆地生态：森林里的鹿和林鸟、草地上的羊群和野兔、花田里的蝴蝶、岩山上的山羊、河边和池塘的蜻蜓、野鸭、青蛙，沙滩上的螃蟹。
// 行为用简单的状态机 + 转向；跳跃（兔子、青蛙、山羊）走重力抛物线；四足动物按步态摆腿，低头吃草。
// 作息（env.hour，游戏里的钟点）：蝴蝶、蜜蜂、蜻蜓白天活动，夜里停在花上、芦苇上；林鸟清晨和傍晚最闹，夜里不飞；
// 野兔和鹿晨昏最活跃，正午多半歇着；羊群夜里挤成一团不怎么动；螃蟹、青蛙夜里和黄昏更活跃；野鸭夜里漂着睡觉。
import * as THREE from 'three';
import { simplify } from './simplify.js';
import * as L0 from './models-land.js';
import * as BK from './blocky.js';
// 体素主题：陆地动物换成方块造型（蝴蝶、蜜蜂、蜻蜓、林鸟太小，两套主题共用）
/** 体素飞虫按原模型的外框大小对齐（翅展一样大，扇翅和停落的位置不变） */
function fitTo(geo, ref) {
  const r = (ref.geometry || ref); r.computeBoundingBox(); geo.computeBoundingBox();
  const a = r.boundingBox, b = geo.boundingBox, k = Math.max(a.max.x - a.min.x, a.max.z - a.min.z) / Math.max(1e-6, b.max.x - b.min.x, b.max.z - b.min.z);
  geo.scale(k, k, k); geo.computeBoundingBox(); const c = geo.boundingBox; geo.translate((a.min.x + a.max.x - c.min.x - c.max.x) / 2, a.min.y - c.min.y, (a.min.z + a.max.z - c.min.z - c.max.z) / 2); geo.computeBoundingSphere(); return { geometry: geo };
}
const L = BK.STYLE.blocky ? { ...L0, sheep: BK.sheep, rabbit: BK.rabbit, deer: BK.deer, goat: BK.goat, crab: BK.crab, duck: BK.duck, frog: BK.frog,
  butterfly: (s, k) => fitTo(BK.voxelButterfly(s, k), L0.butterfly(s, k)), bee: (s) => fitTo(BK.voxelBee(s), L0.bee(s)), dragonfly: (s) => fitTo(BK.voxelDragonfly(s), L0.dragonfly(s)), songbird: (s, k) => fitTo(BK.voxelSongbird(s, k), L0.songbird(s, k)) } : L0;
import { GLSL_NOISE } from './noise.js';
import { U } from './materials.js';
import { G } from './waves.js';
import { rng } from './noise.js';
import { fitBounds } from './cull.js';

const V3 = THREE.Vector3;
const geoOf = (r) => (r && r.geometry) || r;
// 程序化模型生成很慢（一只鹿约 50ms），同一个模型只生成一次；几何标成共享，销毁动物时不释放它
const MEMO = new Map();
const memo = (k, make) => { let r = MEMO.get(k); if (!r) { r = make(); MEMO.set(k, r); const g = geoOf(r); if (g?.userData) g.userData.shared = true; if (r.parts) for (const p of Object.values(r.parts)) p.geometry.userData.shared = true; } return r; };

/** 动物材质；mode 'flap' 时按 wing 属性扇翅膀（每个实例的相位、频率、幅度、张开角在 iAnim 里） */
export function faunaMaterial({ mode = 'none', rough = 0.7, alpha = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: mode === 'flap' ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 0.9, transparent: alpha });
  m.defines = {}; if (mode === 'flap') m.defines.MODE_FLAP = ''; if (alpha) m.defines.USE_WALPHA = '';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; attribute float wing;\n#ifdef USE_WALPHA\nattribute float alpha; varying float vWAlpha;\n#endif\n#ifdef USE_INSTANCING\nattribute vec4 iAnim;\n#else\nvec4 iAnim = vec4(0.0, 20.0, 0.8, 0.3);\n#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef MODE_FLAP
          // 翅膀绕身体中轴转：a = 张开角 + 扇动
          float a = iAnim.w + sin(uTime * iAnim.y + iAnim.x) * iAnim.z;
          float ax = abs(transformed.x);
          if (abs(wing) > 0.001) { transformed.y += ax * sin(a); transformed.x = sign(transformed.x) * ax * cos(a); }
        #endif
        #ifdef USE_WALPHA
          vWAlpha = alpha;
        #endif`);
    if (alpha) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWAlpha;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vWAlpha;');
  };
  m.customProgramCacheKey = () => 'hq-fauna-' + mode + alpha;
  return m;
}

// 部件几何（已按关节点平移）每种模型只做一份，所有同种动物共用
const PART_GEO = new WeakMap();
function partGeo(p) { let g = PART_GEO.get(p); if (!g) { const pv = p.pivot || [0, 0, 0]; g = p.geometry.clone(); g.translate(-pv[0], -pv[1], -pv[2]); g.userData.shared = true; PART_GEO.set(p, g); } return g; }

/** 分部件的四足动物。部件只是“占位”（不直接画），由 Fauna 把同种动物的同一部件合成一次实例化绘制；只有身体投影 */
class Quadruped {
  constructor(model, mat, scale = 1) {
    this.grp = new THREE.Group(); this.parts = {};
    if (model.parts) for (const [k, p] of Object.entries(model.parts)) {
      const m = new THREE.Mesh(partGeo(p), mat); m.position.fromArray(p.pivot || [0, 0, 0]); m.castShadow = k === 'body'; this.grp.add(m); this.parts[k] = m;
    } else { const m = new THREE.Mesh(geoOf(model), mat); m.castShadow = true; this.grp.add(m); }
    this.grp.scale.setScalar(scale);
    this.gait = Math.random() * 6; this.headPitch = 0;
  }
  pose(speed, dt, grazing) {
    this.gait += speed * dt * 95;
    const a = Math.min(1, speed * 18) * 0.55, s = Math.sin(this.gait), c = Math.sin(this.gait + Math.PI);
    const P = this.parts;
    if (P.legFL) P.legFL.rotation.x = s * a; if (P.legBR) P.legBR.rotation.x = s * a;
    if (P.legFR) P.legFR.rotation.x = c * a; if (P.legBL) P.legBL.rotation.x = c * a;
    this.headPitch += ((grazing ? 0.95 : speed > 0.001 ? 0.1 : -0.1) - this.headPitch) * Math.min(1, dt * 3);
    if (P.head) P.head.rotation.x = this.headPitch + (grazing ? Math.sin(this.gait * 0.1 + performance.now() * 0.004) * 0.05 : 0);
  }
}

let MATS = null;
const mats = () => (MATS ||= { mat: faunaMaterial({ rough: 0.75 }), flap: faunaMaterial({ mode: 'flap', rough: 0.6 }), flapAlpha: faunaMaterial({ mode: 'flap', rough: 0.3, alpha: true }) });

export class Fauna {
  /** env: { scene, terrain, tiles, taken, trees:[{x,y,z,h}], flowers:[{x,y,z}], pond:{x,z,r,y}, river:(x,z)=>dist, peaks:[Mesh], splash, center, seed, counts }
   *  counts（可选）：各物种数量，游戏里按区块内的地块算；不给就用样张的默认数量 */
  constructor(env) {
    this.env = env; this.R = rng(env.seed ?? 515);
    this.group = new THREE.Group(); (env.parent || env.scene).add(this.group);
    const M = mats(); this.mat = M.mat; this.flapMat = M.flap; this.flapAlphaMat = M.flapAlpha;
    // 障碍按 0.6 单位的格子索引：每次只查周围 3×3 格，不用逐个比对区块里的几百棵树
    this.grid = new Map();
    for (const o of env.taken || []) { const k = Math.floor(o[0] / 0.6) + ',' + Math.floor(o[1] / 0.6); let L = this.grid.get(k); if (!L) this.grid.set(k, L = []); L.push(o); }
    this.ray = new THREE.Raycaster();
    this._deer(); this._sheep(); this._goats(); this._rabbits(); this._butterflies(); this._bees(); this._dragonflies(); this._songbirds(); this._ducks(); this._frogs(); this._crabs();
  }
  /** 当前钟点的时段 */
  _clock() {
    const h = this.env.hour ?? 14;
    this.night = h < 5.3 || h >= 19.8; this.dawn = h >= 5.3 && h < 8.5; this.dusk = h >= 17 && h < 19.8; this.midday = h >= 11 && h < 15;
    this.warm = h >= 7.5 && h < 18.3;   // 蜜蜂、蝴蝶出来的时段
  }
  /** 等待时间的作息系数：活跃的时段等得短，歇着的时段等得长 */
  _pace(kind) {
    const { night, dawn, dusk, midday } = this;
    if (kind === 'crepuscular') return dawn || dusk ? 0.4 : midday ? 2.5 : night ? 1.4 : 1;
    if (kind === 'nocturnal') return night ? 0.35 : dusk ? 0.6 : midday ? 2.2 : 1.3;
    if (kind === 'bird') return night ? 99 : dawn || dusk ? 0.4 : midday ? 1.6 : 1;
    return 1;
  }
  /** 会飞的小东西（蝴蝶、蜜蜂、蜻蜓、林鸟）每只两三千个三角面，离镜头远时只有一两个像素：远了就不画 */
  /** 镜头很近时（特写）才用完整的飞虫模型 */
  setFlyerDetail(hi) { if (this._flyHi === hi) return; this._flyHi = hi; for (const L of [this.bflyMeshes, this.birdMeshes, this.dflyMeshes, this.beeMeshes]) for (const b of L || []) if (b.lo) b.m.geometry = hi ? b.hi : b.lo; }
  setFlyers(on) { if (this._fly === on) return; this._fly = on; for (const L of [this.bflyMeshes, this.birdMeshes, this.dflyMeshes, this.beeMeshes]) for (const b of L || []) b.m.visible = on; }
  /** 物种数量：env.counts 里有就用它 */
  n(name, def) { const c = this.env.counts; return c && c[name] != null ? c[name] : def; }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  }
  ground(x, z) { return this.env.terrain.heightAt(x, z); }
  ok(x, z, types, pad = 0.06) {
    const T = this.env.terrain, t = T.tileAt(x, z);
    if (!t || !types.includes(t.t)) return false;
    if (this.env.river && this.env.river(x, z) < 0.22) return false;
    const pd = this.env.pond; if (pd && Math.hypot(x - pd.x, z - pd.z) < pd.r * 1.05) return false;
    const gx = Math.floor(x / 0.6), gz = Math.floor(z / 0.6);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const L = this.grid.get((gx + i) + ',' + (gz + j)); if (L) for (const [a, b, r] of L) if ((a - x) ** 2 + (b - z) ** 2 < (r * 0.8 + pad) ** 2) return false; }
    return true;
  }
  randomSpot(types, near = null, rad = 1.2) {
    const R = this.R, tiles = this.env.tiles.filter((t) => types.includes(t.t));
    if (!near && !tiles.length) return null;
    for (let k = 0; k < 60; k++) {
      let x, z;
      if (near) { const a = R() * 6.28, r = R() * rad; x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { const t = tiles[Math.floor(R() * tiles.length)]; x = t.x + (R() - 0.5) * 1.5; z = t.z + (R() - 0.5) * 1.6; }
      if (this.ok(x, z, types)) return new V3(x, this.ground(x, z), z);
    }
    return null;
  }

  // ---------- 四足：鹿、羊 ----------
  _herd(model, n, types, scale, speed, near, name = 'herd') {
    const list = [];
    for (let i = 0; i < n; i++) {
      const s = this.env.variants === 1 ? 1 : (i % 3) + 1, q = new Quadruped(memo(name + s, () => model(s)), this.mat, scale), p = this.randomSpot(types, near, 0.7) || this.randomSpot(types);
      if (!p) continue;
      q.grp.position.copy(p); q.grp.rotation.y = this.R() * 6.28; this.group.add(q.grp);
      list.push({ q, types, state: 'graze', timer: 2 + this.R() * 6, target: null, speed: 0, maxSpeed: speed, yaw: q.grp.rotation.y });
    }
    return list;
  }
  _deer() {
    const T = this.env.tiles, a = T.find((t) => t.t === 'meadow' && t.q === -1) || T.find((t) => t.t === 'forest') || T.find((t) => t.t === 'meadow');
    this.deer = a ? this._herd(L.deer, this.n('deer', 3), ['meadow', 'forest', 'flowers'], 1.6, 0.08, new V3(a.x, 0, a.z), 'deer') : [];
  }
  _sheep() {
    const T = this.env.tiles, a = T.find((x) => x.t === 'meadow' && x.q === 3) || T.find((x) => x.t === 'meadow') || T.find((x) => x.t === 'flowers');
    this.sheep = a ? this._herd(L.sheep, this.n('sheep', 6), ['meadow', 'flowers'], 1.6, 0.045, new V3(a.x, 0, a.z), 'sheep') : [];
  }
  _updHerd(list, dt, flock = 0) {
    // 鹿晨昏出来吃草走动、正午歇着；羊群夜里往中间挤、基本不动
    const pace = flock ? (this.night ? 3 : 1) : this._pace('crepuscular'), walkP = flock && this.night ? 0.3 : 0.55 / Math.sqrt(pace);
    for (const a of list) {
      const g = a.q.grp, p = g.position; a.timer -= dt;
      if (a.state !== 'walk' && a.timer < 0) {
        if (this.R() < walkP) { a.state = 'walk'; let c = null; if (flock) { c = new V3(); for (const b of list) c.add(b.q.grp.position); c.multiplyScalar(1 / list.length); } a.target = this.randomSpot(a.types, c || p, flock ? (this.night ? 0.3 : 0.6) : 0.9); if (!a.target) a.state = 'graze'; }
        else a.state = this.night || this.R() >= 0.7 ? 'look' : 'graze';
        a.timer = (a.state === 'graze' ? 4 + this.R() * 7 : 2 + this.R() * 3) * pace;
      }
      let want = 0;
      if (a.state === 'walk' && a.target) {
        const dx = a.target.x - p.x, dz = a.target.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { a.state = 'graze'; a.timer = 3 + this.R() * 6; }
        else {
          want = Math.min(a.maxSpeed, d * 0.6);
          const yaw = Math.atan2(dx, dz); let dy = yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 2.5);
        }
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 2);
      const nx = p.x + Math.sin(a.yaw) * a.speed * dt, nz = p.z + Math.cos(a.yaw) * a.speed * dt;
      if (this.ok(nx, nz, a.types, 0.02)) { p.x = nx; p.z = nz; } else { a.state = 'graze'; a.timer = 1; }
      const gy = this.ground(p.x, p.z); if (gy != null) p.y = gy;
      // 顺着地形起伏前后倾
      const f = this.ground(p.x + Math.sin(a.yaw) * 0.06, p.z + Math.cos(a.yaw) * 0.06), b = this.ground(p.x - Math.sin(a.yaw) * 0.06, p.z - Math.cos(a.yaw) * 0.06);
      g.rotation.set(f != null && b != null ? -Math.atan2(f - b, 0.12) : 0, a.yaw, 0, 'YXZ');
      a.q.pose(a.speed, dt, a.state === 'graze');
    }
  }

  // ---------- 山羊：站在岩峰的平台上，偶尔跳到另一块 ----------
  _ledges() {
    const out = [], R = this.R, down = new V3(0, -1, 0);
    for (const pk of this.env.peaks) {
      pk.updateMatrixWorld();
      for (let k = 0; k < 60; k++) {
        const a = R() * 6.28, r = 0.15 + R() * 0.5, o = new V3(pk.position.x + Math.cos(a) * r, 4, pk.position.z + Math.sin(a) * r);
        this.ray.set(o, down); const hit = this.ray.intersectObject(pk, false)[0];
        if (hit && hit.face && hit.point.y > pk.position.y + 0.25) {
          const n = hit.face.normal.clone().transformDirection(pk.matrixWorld);
          if (n.y > 0.72) out.push(hit.point.clone());
        }
      }
    }
    return out;
  }
  _goats() {
    this.ledgePts = this.env.peaks ? this._ledges() : [];
    this.goats = [];
    for (let i = 0; i < Math.min(this.n('goats', 3), this.ledgePts.length); i++) {
      const gs = this.env.variants === 1 ? 1 : (i % 3) + 1, q = new Quadruped(memo('goat' + gs, () => L.goat(gs)), this.mat, 1.5), p = this.ledgePts[Math.floor(this.R() * this.ledgePts.length)];
      q.grp.position.copy(p); this.group.add(q.grp);
      this.goats.push({ q, p0: p.clone(), p1: null, t: 0, T: 0.6, wait: 3 + this.R() * 6, yaw: this.R() * 6.28 });
    }
  }
  _updGoats(dt) {
    for (const g of this.goats) {
      const grp = g.q.grp;
      if (!g.p1) {
        g.wait -= dt; g.q.pose(0, dt, Math.sin(performance.now() * 0.0003 + g.yaw) > 0.3);
        if (g.wait < 0) {
          const cand = this.ledgePts.filter((p) => p.distanceTo(g.p0) > 0.08 && p.distanceTo(g.p0) < 0.45 && Math.abs(p.y - g.p0.y) < 0.25);
          if (cand.length) { g.p1 = cand[Math.floor(this.R() * cand.length)].clone(); g.t = 0; g.T = 0.45 + g.p0.distanceTo(g.p1) * 0.8; g.yaw = Math.atan2(g.p1.x - g.p0.x, g.p1.z - g.p0.z); }
          g.wait = 4 + this.R() * 8;
        }
      } else {
        // 抛物线跳跃：已知起点、终点和腾空时间，反推初速度，只受重力
        g.t += dt; const u = Math.min(1, g.t / g.T), T = g.T;
        const vy = (g.p1.y - g.p0.y + 0.5 * G * T * T) / T, tt = u * T;
        grp.position.set(g.p0.x + (g.p1.x - g.p0.x) * u, g.p0.y + vy * tt - 0.5 * G * tt * tt, g.p0.z + (g.p1.z - g.p0.z) * u);
        g.q.pose(0.04, dt, false);
        if (u >= 1) { g.p0.copy(g.p1); g.p1 = null; }
      }
      grp.rotation.set(0, g.yaw, 0);
    }
  }

  // ---------- 野兔：一跳一停 ----------
  _rabbits() {
    this.rabbits = [];
    const geo = geoOf(memo('rabbit', () => L.rabbit(1)));
    for (let i = 0; i < this.n('rabbits', 7); i++) {
      const p = this.randomSpot(['flowers', 'meadow', 'camp']); if (!p) continue;
      const m = new THREE.Mesh(geo, this.mat); m.scale.setScalar(1.8); m.position.copy(p); this.group.add(m);
      this.rabbits.push({ m, base: p.clone(), from: p.clone(), to: null, t: 0, T: 0.4, hops: 0, wait: this.R() * 4, yaw: this.R() * 6.28 });
    }
  }
  _updRabbits(dt) {
    for (const r of this.rabbits) {
      if (!r.to) {
        r.wait -= dt;
        r.m.scale.set(1.8, 1.8 * (1 + Math.sin(performance.now() * 0.012 + r.yaw) * 0.015), 1.8);
        if (r.wait < 0) {
          if (r.hops <= 0) r.hops = 2 + Math.floor(this.R() * 5), r.yaw += (this.R() - 0.5) * 1.6;
          const d = 0.045 + this.R() * 0.035, x = r.from.x + Math.sin(r.yaw) * d, z = r.from.z + Math.cos(r.yaw) * d;
          if (this.ok(x, z, ['flowers', 'meadow', 'camp'], 0.02) && Math.hypot(x - r.base.x, z - r.base.z) < 0.8) { r.to = new V3(x, this.ground(x, z), z); r.t = 0; r.T = 0.36 + this.R() * 0.08; }
          else { r.yaw += Math.PI * 0.7; }
          r.hops--; r.wait = r.hops > 0 ? 0.08 : (1.5 + this.R() * 4) * this._pace('crepuscular');
        }
      } else {
        r.t += dt; const u = Math.min(1, r.t / r.T), T = r.T, tt = u * T;
        const vy = (r.to.y - r.from.y + 0.5 * G * T * T) / T;
        r.m.position.set(r.from.x + (r.to.x - r.from.x) * u, r.from.y + vy * tt - 0.5 * G * tt * tt, r.from.z + (r.to.z - r.from.z) * u);
        const st = Math.sin(u * Math.PI); r.m.scale.set(1.8 * (1 - st * 0.08), 1.8 * (1 + st * 0.18), 1.8 * (1 - st * 0.08));
        if (u >= 1) { r.from.copy(r.to); r.to = null; }
      }
      r.m.rotation.y = r.yaw;
    }
  }

  // ---------- 会飞的：蝴蝶、蜻蜓、林鸟 ----------
  _flyers(geos, n, mat) {
    if (n <= 0) return [];
    const per = Math.ceil(n / geos.length), meshes = [];
    for (const geo of geos) {
      const g = geoOf(geo).clone(); if (!g.attributes.wing) g.setAttribute('wing', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
      const anim = new Float32Array(per * 4); g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4));
      const m = new THREE.InstancedMesh(g, mat, per); m.frustumCulled = false; this.group.add(m);
      // 远处版本：同一份实例数据（iAnim）挂到简化几何上，镜头近时才换回完整模型
      const src = geoOf(geo), lg = simplify(src, 7); let lo = null;
      if (lg !== src) { lo = lg.clone(); if (!lo.attributes.wing) lo.setAttribute('wing', new THREE.BufferAttribute(new Float32Array(lo.attributes.position.count), 1)); lo.setAttribute('iAnim', g.attributes.iAnim); m.geometry = lo; }
      meshes.push({ m, anim, attr: g.attributes.iAnim, hi: g, lo });
    }
    return meshes;
  }
  _butterflies() {
    const kinds = ['swallowtail', 'blue', 'monarch', 'white'];
    this.bflyMeshes = this._flyers(kinds.map((k, i) => memo('bf' + k, () => L.butterfly(i + 1, k))), this.env.flowers?.length ? this.n('butterflies', 44) : 0, this.flapMat);
    this.bflies = [];
    const fl = this.env.flowers;
    this.bflyMeshes.forEach((bm, mi) => {
      for (let i = 0; i < bm.m.count; i++) {
        const f = fl[Math.floor(this.R() * fl.length)] || { x: 0, y: 0.5, z: 0 };
        this.bflies.push({ bm, i, p: new V3(f.x, f.y + 0.1, f.z), v: new V3(), state: 'fly', timer: this.R() * 5, target: null, ph: this.R() * 6, yaw: 0 });
      }
    });
  }
  _updButterflies(dt, t) {
    const fl = this.env.flowers, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new V3(2.0, 2.0, 2.0);
    for (const b of this.bflies) {
      b.timer -= dt;
      if (!this.warm && b.state === 'fly' && b.target && b.target.distanceTo(b.p) < 0.03) { b.state = 'rest'; b.timer = 1e9; b.v.set(0, 0, 0); }   // 天凉了：落到花上不动
      if (!this.warm && b.state === 'fly' && b.timer < 0) { const f = fl[Math.floor(this.R() * fl.length)]; if (f) { b.target = new V3(f.x, f.y + 0.035, f.z); b.timer = 6; } }
      if (b.state === 'fly') {
        if (!b.target || b.timer < 0) { const f = fl[Math.floor(this.R() * fl.length)]; if (f && Math.hypot(f.x - b.p.x, f.z - b.p.z) < 1.4) { b.target = new V3(f.x, f.y + 0.035, f.z); } else if (f) b.target = new V3(b.p.x + (this.R() - 0.5) * 0.8, f.y + 0.12, b.p.z + (this.R() - 0.5) * 0.8); b.timer = 3 + this.R() * 4; }
        // 蝴蝶的飞行：朝目标飘过去，叠加不规则的上下翻飞
        const d = b.target.clone().sub(b.p), dl = d.length();
        b.v.addScaledVector(d.normalize(), 0.35 * dt);
        b.v.x += Math.sin(t * 3.1 + b.ph) * 0.12 * dt; b.v.y += Math.sin(t * 7.3 + b.ph * 2) * 0.35 * dt; b.v.z += Math.cos(t * 2.7 + b.ph) * 0.12 * dt;
        b.v.multiplyScalar(Math.exp(-2.2 * dt)); b.p.addScaledVector(b.v, dt);
        const gy = this.ground(b.p.x, b.p.z); if (gy != null && b.p.y < gy + 0.03) b.p.y = gy + 0.03;
        if (dl < 0.02 && this.R() < 0.6) { b.state = 'rest'; b.timer = 2 + this.R() * 5; b.v.set(0, 0, 0); }
        b.yaw = Math.atan2(b.v.x, b.v.z);
        b.bm.anim.set([b.ph, 22, 0.75, 0.35], b.i * 4);
      } else {
        // 停在花上：翅膀合拢、偶尔慢慢开合
        b.bm.anim.set([b.ph, 2.2, 0.25, 1.15], b.i * 4);
        if (this.warm && (b.timer < 0 || b.timer > 1e8)) { b.state = 'fly'; b.target = null; b.v.y = 0.15; }
      }
      e.set(0, b.yaw, 0); q.setFromEuler(e);
      b.bm.m.setMatrixAt(b.i, m4.compose(b.p, q, sc));
    }
    for (const bm of this.bflyMeshes) { bm.m.instanceMatrix.needsUpdate = true; bm.attr.needsUpdate = true; fitBounds(bm.m, 0.15); }
  }
  // ---------- 蜜蜂：在花之间来回，每朵停一下；天暖才出来，夜里停在花上过夜 ----------
  _bees() {
    const fl = this.env.flowers || [], n = fl.length ? this.n('bees', Math.min(16, Math.ceil(fl.length / 6))) : 0;
    this.beeMeshes = this._flyers([memo('bee', () => L.bee(1))], n, this.flapMat); this.bees = [];
    if (!this.beeMeshes.length) return;
    const bm = this.beeMeshes[0];
    for (let i = 0; i < bm.m.count; i++) { const f = fl[Math.floor(this.R() * fl.length)]; this.bees.push({ i, p: new V3(f.x, f.y + 0.02, f.z), from: new V3(f.x, f.y + 0.02, f.z), to: null, t: 0, T: 1, wait: this.R() * 2, ph: this.R() * 6, yaw: 0 }); bm.anim.set([this.R() * 6, 90, 0.5, 0.2], i * 4); }
  }
  _updBees(dt, t) {
    if (!this.bees?.length) return;
    const bm = this.beeMeshes[0], fl = this.env.flowers, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(2.2, 2.2, 2.2), up = new V3(0, 1, 0);
    for (const b of this.bees) {
      if (!b.to) {
        b.wait -= dt; b.p.y = b.from.y + Math.sin(t * 9 + b.ph) * 0.002;
        bm.anim.set([b.ph, this.warm ? 90 : 0, this.warm ? 0.5 : 0, this.warm ? 0.2 : 1.2], b.i * 4);
        if (b.wait < 0 && this.warm) {
          // 下一朵：大多是附近的花，偶尔飞远一点
          const near = fl.filter((f) => Math.abs(f.x - b.p.x) + Math.abs(f.z - b.p.z) < 0.6), f = (near.length && this.R() < 0.85 ? near : fl)[Math.floor(this.R() * (near.length && this.R() < 0.85 ? near.length : fl.length))] || fl[0];
          b.from.copy(b.p); b.to = new V3(f.x + (this.R() - 0.5) * 0.02, f.y + 0.018, f.z + (this.R() - 0.5) * 0.02); b.t = 0; b.T = 0.25 + b.from.distanceTo(b.to) * 1.6;
          b.yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        }
      } else {
        // 之字形的飞行路线
        b.t += dt; const u = Math.min(1, b.t / b.T), side = Math.sin(u * Math.PI * 5 + b.ph) * 0.03 * Math.sin(u * Math.PI);
        b.p.lerpVectors(b.from, b.to, u); b.p.y += Math.sin(u * Math.PI) * 0.06; b.p.x += Math.cos(b.yaw) * side; b.p.z -= Math.sin(b.yaw) * side;
        bm.anim.set([b.ph, 90, 0.5, 0.2], b.i * 4);
        if (u >= 1) { b.from.copy(b.to); b.to = null; b.wait = 0.5 + this.R() * 1.5; }
      }
      q.setFromAxisAngle(up, b.yaw);
      bm.m.setMatrixAt(b.i, m4.compose(b.p, q, sc));
    }
    bm.m.instanceMatrix.needsUpdate = true; bm.attr.needsUpdate = true; fitBounds(bm.m, 0.15);
  }
  _dragonflies() {
    const water = !!(this.env.pond || this.env.riverPts?.length);
    const df = memo('dfly', () => L.dragonfly(1));
    this.dflyMeshes = this._flyers([df], water ? this.n('dragonflies', 9) : 0, df.geometry.attributes.alpha ? this.flapAlphaMat : this.flapMat);
    this.dflies = [];
    if (!this.dflyMeshes.length) return;
    const pts = this.waterPoints();
    for (let i = 0; i < this.dflyMeshes[0].m.count; i++) { const p = pts[Math.floor(this.R() * pts.length)]; this.dflies.push({ i, p: p.clone().add(new V3(0, 0.1, 0)), target: p.clone(), timer: 0, ph: this.R() * 6, yaw: 0 }); this.dflyMeshes[0].anim.set([this.R() * 6, 70, 0.45, 0.1], i * 4); }
  }
  waterPoints() {
    const out = [], pd = this.env.pond;
    if (pd) for (let k = 0; k < 20; k++) { const a = this.R() * 6.28, r = this.R() * pd.r * 0.9; out.push(new V3(pd.x + Math.cos(a) * r, pd.y, pd.z + Math.sin(a) * r)); }
    for (const p of this.env.riverPts || []) out.push(new V3(p[0], p[1], p[2]));
    return out.length ? out : [new V3(0, 0.5, 0)];
  }
  _updDragonflies(dt, t) {
    if (!this.dflyMeshes.length) return;
    const D = this.dflyMeshes[0], pts = this.waterPoints(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(1.6, 1.6, 1.6);
    for (const d of this.dflies) {
      d.timer -= dt;
      if (!this.warm) { if (!d.rest) { d.rest = true; d.target.y -= 0.05; } d.timer = 1; }   // 夜里停在水边不动
      else d.rest = false;
      if (d.timer < 0) { const p = pts[Math.floor(this.R() * pts.length)]; d.target = new V3(p.x + (this.R() - 0.5) * 0.3, p.y + 0.04 + this.R() * 0.1, p.z + (this.R() - 0.5) * 0.3); d.timer = 1 + this.R() * 2.5; }
      // 蜻蜓：快速冲到目标点然后悬停，悬停时有细小抖动
      const dv = d.target.clone().sub(d.p), dl = dv.length();
      if (dl > 0.01) { d.p.addScaledVector(dv, Math.min(1, dt * 4)); d.yaw = Math.atan2(dv.x, dv.z); }
      if (!d.rest) d.p.y += Math.sin(t * 13 + d.ph) * 0.0006;
      q.setFromAxisAngle(new V3(0, 1, 0), d.yaw);
      D.m.setMatrixAt(d.i, m4.compose(d.p, q, sc));
    }
    D.m.instanceMatrix.needsUpdate = true; fitBounds(D.m, 0.15);
  }
  _songbirds() {
    const kinds = ['robin', 'tit', 'finch'];
    this.birdMeshes = this._flyers(kinds.map((k, i) => memo('sb' + k, () => L.songbird(i + 1, k))), this.env.trees?.length ? this.n('songbirds', 9) : 0, this.flapMat);
    this.sbirds = [];
    const perches = this.env.trees;
    this.birdMeshes.forEach((bm) => { for (let i = 0; i < bm.m.count; i++) { const p = perches[Math.floor(this.R() * perches.length)]; this.sbirds.push({ bm, i, p: new V3(p.x, p.y + p.h, p.z), from: null, to: null, t: 0, T: 1, wait: 2 + this.R() * 8, yaw: this.R() * 6 }); } });
  }
  _updSongbirds(dt, t) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(2.0, 2.0, 2.0), perches = this.env.trees;
    for (const b of this.sbirds) {
      if (!b.to) {
        b.wait -= dt / this._pace('bird'); b.bm.anim.set([b.yaw, 3, 0.05, 0.02], b.i * 4);
        if (b.wait < 0) { const c = perches.filter((p) => Math.hypot(p.x - b.p.x, p.z - b.p.z) < 2.5); const p = c[Math.floor(this.R() * c.length)] || perches[0]; b.from = b.p.clone(); b.to = new V3(p.x + (this.R() - 0.5) * 0.1, p.y + p.h * (0.85 + this.R() * 0.1), p.z + (this.R() - 0.5) * 0.1); b.t = 0; b.T = 0.6 + b.from.distanceTo(b.to) * 0.7; b.yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z); }
      } else {
        // 波浪形飞行：扇几下、收翅滑一段，轨迹是一串小弧线
        b.t += dt; const u = Math.min(1, b.t / b.T);
        b.p.lerpVectors(b.from, b.to, u); b.p.y += Math.sin(u * Math.PI) * 0.25 + Math.sin(u * Math.PI * 6) * 0.02;
        b.bm.anim.set([0, 26, Math.sin(u * Math.PI * 3) > 0 ? 0.9 : 0.05, 0.2], b.i * 4);
        if (u >= 1) { b.to = null; b.wait = 3 + this.R() * 10; }
      }
      q.setFromAxisAngle(new V3(0, 1, 0), b.yaw);
      b.bm.m.setMatrixAt(b.i, m4.compose(b.p, q, sc));
    }
    for (const bm of this.birdMeshes) { bm.m.instanceMatrix.needsUpdate = true; bm.attr.needsUpdate = true; fitBounds(bm.m, 0.15); }
  }

  // ---------- 池塘：野鸭、青蛙 ----------
  _ducks() {
    this.ducks = [];
    const pd = this.env.pond; if (!pd) return;
    const geo = geoOf(memo('duck', () => L.duck(1)));
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo, this.mat); m.scale.setScalar(1.7); this.group.add(m); const a = this.R() * 6.28; this.ducks.push({ m, a, r: pd.r * (0.3 + this.R() * 0.45), w: (this.R() < 0.5 ? 1 : -1) * (0.06 + this.R() * 0.06), dab: 0, ph: this.R() * 6 }); }
  }
  _updDucks(dt, t) {
    const pd = this.env.pond; if (!pd) return;
    for (const d of this.ducks) {
      d.a += d.w * dt * (this.night ? 0.12 : 1);   // 夜里漂着睡觉，几乎不动
      const x = pd.x + Math.cos(d.a) * d.r, z = pd.z + Math.sin(d.a) * d.r;
      d.m.position.set(x, pd.y + Math.sin(t * 1.7 + d.ph) * 0.002, z);
      if (d.dab <= 0 && !this.night && Math.random() < dt * 0.06) d.dab = 1.8;
      d.dab -= dt;
      d.m.rotation.set(d.dab > 0 ? Math.min(1.1, d.dab * 2) : 0, -d.a + (d.w > 0 ? 0 : Math.PI), 0, 'YXZ');
    }
  }
  _frogs() {
    this.frogs = [];
    const pd = this.env.pond; if (!pd) return;
    const geo = geoOf(memo('frog', () => L.frog(1)));
    this.frogSpots = [];
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28 + this.R() * 0.3, r = pd.r * (1.02 + this.R() * 0.15); const x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r, y = this.ground(x, z); if (y != null) this.frogSpots.push(new V3(x, y, z)); }
    for (const lp of this.env.lilyPads || []) this.frogSpots.push(new V3(lp.x, pd.y + 0.004, lp.z));
    for (let i = 0; i < 4 && this.frogSpots.length; i++) { const m = new THREE.Mesh(geo, this.mat); m.scale.setScalar(1.8); const p = this.frogSpots[Math.floor(this.R() * this.frogSpots.length)]; m.position.copy(p); this.group.add(m); this.frogs.push({ m, from: p.clone(), to: null, t: 0, T: 0.5, wait: 2 + this.R() * 8 }); }
  }
  _updFrogs(dt) {
    for (const f of this.frogs) {
      if (!f.to) {
        f.wait -= dt;
        if (f.wait < 0) { const c = this.frogSpots.filter((p) => p.distanceTo(f.from) < 0.35 && p.distanceTo(f.from) > 0.04); if (c.length) { f.to = c[Math.floor(this.R() * c.length)].clone(); f.t = 0; f.T = 0.35 + f.from.distanceTo(f.to) * 0.8; f.m.rotation.y = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z); } f.wait = (3 + this.R() * 9) * this._pace('nocturnal'); }
      } else {
        f.t += dt; const u = Math.min(1, f.t / f.T), T = f.T, tt = u * T, vy = (f.to.y - f.from.y + 0.5 * G * T * T) / T;
        f.m.position.set(f.from.x + (f.to.x - f.from.x) * u, f.from.y + vy * tt - 0.5 * G * tt * tt, f.from.z + (f.to.z - f.from.z) * u);
        if (u >= 1) { f.from.copy(f.to); f.to = null; if (this.env.splash && Math.abs(f.from.y - this.env.pond.y) < 0.01) this.env.splash.emit(f.from.x, f.from.y, f.from.z, 8, { speed: 0.12, up: 1, spread: 0.6, size: 0.012, life: 0.5 }); }
      }
    }
  }

  // ---------- 沙滩：螃蟹横着走 ----------
  _crabs() {
    this.crabs = [];
    const geo = geoOf(memo('crab', () => L.crab(1)));
    for (let i = 0; i < this.n('crabs', 6); i++) { const p = this.randomSpot(['beach']); if (!p) continue; const m = new THREE.Mesh(geo, this.mat); m.scale.setScalar(2.0); m.position.copy(p); this.group.add(m); this.crabs.push({ m, yaw: this.R() * 6.28, dir: 1, speed: 0, wait: this.R() * 3, run: 0 }); }
  }
  _updCrabs(dt, t) {
    for (const c of this.crabs) {
      const p = c.m.position;
      if (c.run > 0) {
        c.run -= dt;
        const sx = Math.cos(c.yaw) * c.dir * 0.07 * dt, sz = -Math.sin(c.yaw) * c.dir * 0.07 * dt;
        if (this.ok(p.x + sx, p.z + sz, ['beach'], 0.01)) { p.x += sx; p.z += sz; } else { c.dir *= -1; c.run = 0; }
        c.m.rotation.z = Math.sin(t * 30) * 0.05;
      } else { c.wait -= dt; c.m.rotation.z = 0; if (c.wait < 0) { c.run = 0.4 + this.R() * 1.2; c.wait = (1 + this.R() * 4) * this._pace('nocturnal'); if (this.R() < 0.4) c.dir *= -1; if (this.R() < 0.3) c.yaw += (this.R() - 0.5) * 1.5; } }
      const gy = this.ground(p.x, p.z); if (gy != null) p.y = gy;
      c.m.rotation.y = c.yaw;
    }
  }

  /** 自由画布：在 (x,z) 附近放一只动物。返回是否放成功（地形不合适就失败） */
  spawn(kind, x, z) {
    const near = new V3(x, 0, z), R = this.R;
    if (kind === 'deer' || kind === 'sheep') {
      const list = kind === 'deer' ? this._herd(L.deer, 1, ['meadow', 'forest', 'flowers'], 1.6, 0.08, near, 'deer') : this._herd(L.sheep, 1, ['meadow', 'flowers'], 1.6, 0.045, near, 'sheep');
      if (!list.length || list[0].q.grp.position.distanceTo(new V3(x, list[0].q.grp.position.y, z)) > 0.8) { for (const a of list) { this.group.remove(a.q.grp); } return false; }
      (kind === 'deer' ? this.deer : this.sheep).push(...list); return true;
    }
    if (kind === 'rabbit') {
      const p = this.randomSpot(['flowers', 'meadow', 'camp'], near, 0.3); if (!p) return false;
      const m = new THREE.Mesh(geoOf(memo('rabbit', () => L.rabbit(1))), this.mat); m.scale.setScalar(1.8); m.position.copy(p); this.group.add(m);
      this.rabbits.push({ m, base: p.clone(), from: p.clone(), to: null, t: 0, T: 0.4, hops: 0, wait: R() * 2, yaw: R() * 6.28 }); return true;
    }
    if (kind === 'crab') {
      const p = this.randomSpot(['beach'], near, 0.3); if (!p) return false;
      const m = new THREE.Mesh(geoOf(memo('crab', () => L.crab(1))), this.mat); m.scale.setScalar(2.0); m.position.copy(p); this.group.add(m);
      this.crabs.push({ m, yaw: R() * 6.28, dir: 1, speed: 0, wait: R() * 2, run: 0 }); return true;
    }
    return false;
  }
  /** 合批：同一份几何（同种动物的同一部件）的所有占位合成一个实例化网格，一次绘制。
   *  占位本身隐藏，只用来算位置；每帧把它们的世界矩阵抄进实例矩阵 */
  _batch() {
    this.group.updateMatrixWorld(true);
    const by = new Map();
    this.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { let L = by.get(o.geometry); if (!L) by.set(o.geometry, L = []); L.push(o); } });
    this.batches ||= new Map();
    for (const [geo, L] of by) {
      let b = this.batches.get(geo);
      if (!b || b.cap < L.length) {
        if (b) { this.group.remove(b.im); b.im.dispose(); }
        const cap = Math.max(4, L.length * 2), im = new THREE.InstancedMesh(geo, L[0].material, cap);
        im.frustumCulled = false; im.castShadow = !!L[0].castShadow; im.receiveShadow = true; im.userData.batch = true;
        this.group.add(im); b = { im, cap }; this.batches.set(geo, b);
      }
      const im = b.im; im.count = L.length;
      for (let i = 0; i < L.length; i++) { const o = L[i]; if (o.visible) o.visible = false; im.setMatrixAt(i, o.matrixWorld); }
      im.instanceMatrix.needsUpdate = true;
    }
    for (const [geo, b] of this.batches) if (!by.has(geo)) b.im.count = 0;
  }
  update(dt, t) {
    this._batchAfter = true; this._clock();
    this._updHerd(this.deer, dt, 0); this._updHerd(this.sheep, dt, 1); this._updGoats(dt); this._updRabbits(dt);
    this._updButterflies(dt, t); this._updBees(dt, t); this._updDragonflies(dt, t); this._updSongbirds(dt, t); this._updDucks(dt, t); this._updFrogs(dt); this._updCrabs(dt, t);
    if (!this.env.extBatch) this._batch();   // 游戏里由画面统一合批（hq/batcher.js）
  }
  get counts() { return { deer: this.deer.length, sheep: this.sheep.length, goats: this.goats.length, rabbits: this.rabbits.length, butterflies: this.bflies.length, bees: this.bees?.length || 0, dragonflies: this.dflies.length, songbirds: this.sbirds.length, ducks: this.ducks.length, frogs: this.frogs.length, crabs: this.crabs.length }; }
}
