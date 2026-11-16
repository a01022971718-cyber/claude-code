// 会动的东西：地标建筑、同伴小人、渔船、补给箱、海鸥、粒子（水花、炊烟、收获碎屑）。
import * as THREE from 'three';
import { G, mulberry32 } from './geo.js';
import * as B from './models/buildings.js';
import { toWorld, fromWorld, DIRS, key } from './hex.js';
import { TOP } from './config.js';
import { GROUND } from './ground.js';
import { HOME_POSE, rotY } from './tiles.js';
import { FX } from './fx.js';
import * as HQP from './hq/props.js';
import { propMaterial } from './hq/materials.js';

const asG = (m) => (m instanceof G ? m : m.static);
const LM_RY = -0.42; // 地标正面朝向镜头

class Particles {
  constructor(scene, n = 200) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), n);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: n }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, max: 1, grav: 9, grow: 0 }));
    this.i = 0; this.m = new THREE.Matrix4(); this.c = new THREE.Color(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, this.zero); this.mesh.setColorAt(i, this.c.setHex(0xffffff)); }
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, hex, size, life, grav = 9, grow = 0) {
    const i = this.i; this.i = (i + 1) % this.n;
    Object.assign(this.p[i], { x, y, z, vx, vy, vz, size, life, max: life, grav, grow });
    this.mesh.setColorAt(i, this.c.setHex(hex)); this.mesh.instanceColor.needsUpdate = true;
  }
  burst(x, y, z, hex, count = 10, speed = 2.2, size = 0.055, radius = 0.3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, r = Math.random() * radius, v = speed * (0.5 + Math.random() * 0.6);
      this.spawn(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * v * 0.55, v * (0.9 + Math.random() * 0.6), Math.sin(a) * v * 0.55, hex, size * (0.7 + Math.random() * 0.6), 0.6 + Math.random() * 0.4);
    }
  }
  /** 一圈水花，地块升出海面时用 */
  ring(x, z, radius = 1.0) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * 6.283 + Math.random() * 0.2, v = 1.2 + Math.random() * 1.2;
      this.spawn(x + Math.cos(a) * radius, 0.05, z + Math.sin(a) * radius, Math.cos(a) * v * 0.7, 1.6 + Math.random() * 1.6, Math.sin(a) * v * 0.7, 0xffffff, 0.05 + Math.random() * 0.04, 0.55 + Math.random() * 0.35);
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      any = true; p.life -= dt;
      if (p.life <= 0 || (p.grav > 0 && p.y < -0.05)) { p.life = 0; this.mesh.setMatrixAt(i, this.zero); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.life / p.max, s = p.grow ? p.size * (1 + (1 - k) * p.grow) * Math.min(1, k * 2.5) : p.size * Math.min(1, k * 1.8);
      this.m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Actors {
  constructor(scene, mat) {
    this.scene = scene; this.mat = mat; this.t = 0;
    this.fx = new Particles(scene);
    this.landmarks = new Map(); this.people = []; this.boats = new Map();
    this.walkable = () => false;
    this.smokeAt = null; this.smokeT = 0;
    // 补给箱
    this.crate = this._mesh(asG(B.crate(mulberry32(3)))); this.crate.visible = false; this.cratePos = null;
    // 海鸥
    this.gulls = [];
    const gg = asG(B.gull(mulberry32(5))).toGeometry();
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(gg, mat); m.scale.setScalar(1.5); scene.add(m); this.gulls.push({ m, r: 5 + i * 2.3, h: 4.2 + i * 0.8, sp: (0.28 + i * 0.05) * (i % 2 ? -1 : 1), ph: i * 1.7 }); }
    this.center = [0, 0];
  }
  _mesh(g, parent = this.scene) { const m = new THREE.Mesh(g.toGeometry(), this.mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
  /** 高画质画面：地标、小人、渔船、补给箱换成高画质模型（hq/props.js） */
  _hqMesh(geo, parent = this.scene) { this.hqMat ||= propMaterial({ rough: 0.8 }); const m = new THREE.Mesh(geo, this.hqMat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
  _hqPart(part, parent) { const geo = part.geometry.clone(), pv = part.pivot || [0, 0, 0]; geo.translate(-pv[0], -pv[1], -pv[2]); const m = this._hqMesh(geo, parent); m.position.fromArray(pv); return m; }
  setHQ(on) {
    this.hq = on; if (!on) return;
    for (const g of this.gulls) g.m.visible = false;   // 高画质画面有自己的海鸥
    this.scene.remove(this.crate); this.crate = this._hqMesh(HQP.supplyCrate(3).geometry); this.crate.scale.setScalar(1.4); this.crate.visible = false;
  }

  // ---------- 地标 ----------
  addLandmark(lm, def, active) {
    if (this.landmarks.has(lm.i)) return;
    const [x, z] = toWorld(lm.q, lm.r), grp = new THREE.Group(), rng = mulberry32(lm.i * 13 + 1);
    grp.position.set(x, GROUND.y(x, z) - 0.01, z); grp.rotation.y = LM_RY; this.scene.add(grp);
    const o = { lm, type: def.type, grp, active, pop: 0 };
    if (this.hq) {
      const fn = def.type === 'windmill' ? HQP.windmill : def.type === 'lighthouse' ? HQP.lighthouse : HQP.bellTower, m = fn(lm.i + 1);
      this._hqMesh(m.geometry, grp); o.door = m.anchors.door || [0, 0, 0.5];
      if (m.parts?.sails) o.sails = this._hqPart(m.parts.sails, grp);
      if (m.parts?.bell) o.bell = this._hqPart(m.parts.bell, grp);
      if (def.type === 'lighthouse') {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 7, 20, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * uA; gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a, a); }', uniforms: { uA: { value: 0.2 } } }));
        beam.geometry.translate(0, -3.5, 0); beam.geometry.rotateZ(-Math.PI / 2 - 0.04);
        const piv = new THREE.Group(); piv.position.fromArray(m.anchors.lamp || [0, 1.6, 0]); piv.add(beam); grp.add(piv);
        o.beam = piv; o.beamMat = { set opacity(v) { beam.material.uniforms.uA.value = v; } }; piv.visible = active;
      }
      this.landmarks.set(lm.i, o); return;
    }
    if (def.type === 'windmill') {
      const m = B.windmill(rng); this._mesh(m.static, grp);
      o.sails = this._mesh(m.parts.sails.g, grp); o.sails.position.fromArray(m.parts.sails.at); o.door = m.anchors.door;
    } else if (def.type === 'lighthouse') {
      const m = B.lighthouse(rng); this._mesh(m.static, grp); o.door = m.anchors.door;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
      beam.geometry.translate(0, -4.5, 0); beam.geometry.rotateZ(-Math.PI / 2 - 0.08);
      const piv = new THREE.Group(); piv.position.fromArray(m.anchors.lamp); piv.add(beam); grp.add(piv);
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false })); piv.add(glow);
      o.beam = piv; o.beamMat = beam.material; piv.visible = active;
    } else {
      const m = B.bellTower(rng); this._mesh(m.static, grp); o.door = m.anchors.door;
      o.bell = this._mesh(m.parts.bell.g, grp); o.bell.position.fromArray(m.parts.bell.at);
    }
    this.landmarks.set(lm.i, o);
  }
  activate(i) {
    const o = this.landmarks.get(i); if (!o) return;
    o.active = true; o.pop = 1; if (o.beam) o.beam.visible = true;
    const p = o.grp.position;
    this.fx.burst(p.x, p.y + 1.2, p.z, 0xffe08a, 28, 3.2, 0.07, 0.5);
    this.fx.burst(p.x, p.y + 0.4, p.z, 0xffffff, 16, 2.4, 0.05, 0.7);
  }
  landmarkDoor(i) { const o = this.landmarks.get(i), d = rotY(o.door || [0, 0, 0.5], LM_RY), p = o.grp.position; return [p.x + d[0], p.z + d[2]]; }

  // ---------- 小人 ----------
  addPerson(opts, x, z, seed = 1) {
    const m = this.hq ? this._hqMesh(HQP.villager(seed, { shirt: opts.shirt, hat: opts.hat, hatColor: opts.hatColor }).geometry) : this._mesh(asG(B.person(mulberry32(seed), opts)));
    m.scale.setScalar(this.hq ? 1.1 : 1.25); m.position.set(x, GROUND.y(x, z), z);
    this.people.push({ m, x, z, tx: x, tz: z, wait: 1 + Math.random() * 2, walk: 0, seed });
  }
  clearPeople() { for (const p of this.people) { this.scene.remove(p.m); p.m.geometry.dispose(); } this.people = []; }
  _stepPerson(p, dt) {
    if (p.walk > 0) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), sp = 0.75;
      if (d < 0.03) { p.walk = 0; p.wait = 1.5 + Math.random() * 3.5; }
      else { p.x += (dx / d) * Math.min(d, sp * dt); p.z += (dz / d) * Math.min(d, sp * dt); p.m.rotation.y = Math.atan2(dx, dz); }
      p.m.position.set(p.x, GROUND.y(p.x, p.z) + Math.abs(Math.sin(this.t * 11 + p.seed)) * 0.035, p.z);
    } else {
      p.wait -= dt; p.m.position.y = GROUND.y(p.x, p.z);
      if (p.wait <= 0) {
        // 走向相邻的可行走地块上的随机一点
        const [q0, r0] = fromWorld(p.x, p.z);
        const opts = [[q0, r0], ...DIRS.map((d) => [q0 + d[0], r0 + d[1]])].filter(([q, r]) => this.walkable(q, r));
        if (opts.length) {
          const [q, r] = opts[Math.floor(Math.random() * opts.length)], [wx, wz] = toWorld(q, r), a = Math.random() * 6.283, rad = 0.5 + Math.random() * 0.22;
          p.tx = wx + Math.cos(a) * rad; p.tz = wz + Math.sin(a) * rad; p.walk = 1;
        } else p.wait = 2;
      }
    }
  }

  // ---------- 渔船 / 补给箱 / 炊烟 ----------
  /** harbors: [{q,r,dir,ready:boolean}]：长好时船停在栈桥边，收获后出海 */
  syncBoats(harbors) {
    const seen = new Set();
    for (const h of harbors) {
      const k = key(h.q, h.r); seen.add(k);
      let b = this.boats.get(k);
      if (!b) {
        const th = h.dir * Math.PI / 3, [x, z] = toWorld(h.q, h.r), m = this.hq ? this._hqMesh(HQP.rowBoat(h.q * 7 + h.r).geometry) : this._mesh(asG(B.boat(mulberry32(h.q * 7 + h.r))));
        m.scale.setScalar(this.hq ? 1.25 : 1.35); m.rotation.y = Math.PI / 2 - th + 0.5;
        b = { m, x: x + Math.cos(th) * 1.45 + Math.sin(th) * 0.38, z: z + Math.sin(th) * 1.45 - Math.cos(th) * 0.38, ph: Math.random() * 6 };
        this.boats.set(k, b);
      }
      b.m.visible = h.ready;
    }
    for (const [k, b] of this.boats) if (!seen.has(k)) { this.scene.remove(b.m); this.boats.delete(k); }
  }
  showCrate(x, z) { this.cratePos = [x, z]; this.crate.visible = true; }
  hideCrate() { this.cratePos = null; this.crate.visible = false; }
  setHome(q, r) { const [x, z] = toWorld(q, r), c = rotY(B.cabin(mulberry32(1)).anchors.chimney, HOME_POSE.ry); this.smokeAt = this.noChimney ? null : [x + HOME_POSE.x + c[0], TOP + c[1], z + HOME_POSE.z + c[2]]; }

  update(dt) {
    this.t += dt; const t = this.t;
    for (const o of this.landmarks.values()) {
      if (o.pop > 0) { o.pop = Math.max(0, o.pop - dt * 1.4); const s = 1 + Math.sin(o.pop * Math.PI) * 0.18; o.grp.scale.set(s, 1 + Math.sin(o.pop * Math.PI) * 0.28, s); }
      if (o.sails) o.sails.rotation.z -= dt * (o.active ? 0.9 : 0);
      if (o.beam && o.active) { o.beam.rotation.y = t * 0.7; o.beamMat.opacity = 0.06 + FX.uNight.value * 0.3; }
      if (o.bell) o.bell.rotation.x = o.active ? Math.sin(t * 2.6) * 0.32 : 0;
    }
    for (const p of this.people) this._stepPerson(p, dt);
    for (const b of this.boats.values()) if (b.m.visible) { b.m.position.set(b.x, GROUND.water ? GROUND.water(b.x, b.z) + 0.01 : Math.sin(t * 1.6 + b.ph) * 0.03 + 0.02, b.z); b.m.rotation.z = Math.sin(t * 1.3 + b.ph) * 0.07; }
    if (this.cratePos) { this.crate.position.set(this.cratePos[0], (GROUND.water ? GROUND.water(this.cratePos[0], this.cratePos[1]) : Math.sin(t * 1.8) * 0.05) - 0.07, this.cratePos[1]); this.crate.rotation.set(Math.sin(t * 1.1) * 0.12, t * 0.25, Math.sin(t * 1.4) * 0.1); }
    if (this.smokeAt) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.55; const s = this.smokeAt; this.fx.spawn(s[0], s[1], s[2], 0.12 + Math.random() * 0.1, 0.42, -0.05, 0xf3f0ea, 0.045, 2.6, -0.02, 2.2); } }
    for (const g of this.gulls) {
      const a = t * g.sp + g.ph, x = this.center[0] + Math.cos(a) * g.r, z = this.center[1] + Math.sin(a) * g.r;
      g.m.position.set(x, g.h + Math.sin(t * 0.7 + g.ph) * 0.4, z);
      g.m.rotation.set(0, -a + (g.sp > 0 ? 0 : Math.PI), Math.sin(t * 3 + g.ph) * 0.15 + (g.sp > 0 ? -0.3 : 0.3));
    }
    this.fx.update(dt);
  }
}
