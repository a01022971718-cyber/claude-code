// 跨环境的动物：它们的一天横跨海、岸、陆、天，把几种环境连成一个整体。
//  鹬    沙滩的潮间带：跟着浪进浪退来回小跑，退浪时低头啄食；夜里在沙滩高处挤成一团睡觉。
//  白鹭  岸边浅水和池塘边涉水：慢慢走、定住、突然伸颈一啄（水面一点水花）；夜里缩着脖子单腿站着睡。
//  燕鸥  沿海岸巡飞：悬停、收翅俯冲扎进海里抓鱼（水花 + 涟漪），再扇着翅膀爬升；黄昏落到沙滩上歇着，清晨再起飞。
//  蝙蝠  黄昏和黎明从树冠里飞出来，忽高忽低急转弯地捉虫；天黑透或天亮前飞回树冠。
//  跃鱼  近岸的鱼偶尔跃出水面（清晨和黄昏最多），出水、入水各一圈水花和涟漪。
// 只在镜头附近生成（镜头走远或岛变了就重排），数量跟画质的“生物数量”走。鹬和白鹭是分部件的占位网格，由画面统一合批；
// 燕鸥和蝙蝠是扇翅膀的实例化网格（一种一次绘制）。
import * as THREE from 'three';
import * as L from './models-land.js';
import * as M from './models-marine.js';
import * as BK from './blocky.js';
import { faunaMaterial } from './fauna.js';
import { G } from './waves.js';
import { rng } from './noise.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const DIRS6 = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
let GEO = null;
/** 模型和部件几何只生成一次（部件按关节点平移，方便绕关节转） */
function geos() {
  if (GEO) return GEO;
  const parts = (r) => { const o = {}; for (const [k, p] of Object.entries(r.parts)) { const g = p.geometry.clone(), v = p.pivot || [0, 0, 0]; g.translate(-v[0], -v[1], -v[2]); g.userData.shared = true; o[k] = { g, pivot: v }; } return o; };
  const flyer = (r) => { const g = r.geometry; if (!g.attributes.wing) g.setAttribute('wing', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; };
  const V = BK.STYLE.blocky;   // 体素主题：方块版
  GEO = { piper: parts(V ? BK.vSandpiper() : L.sandpiper(1)), egret: parts(V ? BK.vEgret() : L.egret(1)), tern: flyer(V ? BK.vTern() : L.tern(1)), bat: flyer(V ? BK.vBat() : L.bat(1)), fish: M.fish(5, 'sardine').geometry };
  return GEO;
}
let MATS = null;
const mats = () => (MATS ||= { body: faunaMaterial({ rough: 0.7 }), flap: faunaMaterial({ mode: 'flap', rough: 0.6 }) });
const turn = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

/** 分部件的小动物：一个 Group 里每个部件一个占位网格（关节处旋转） */
function rig(parts, mat, scale) {
  const grp = new THREE.Group(), P = {};
  for (const [k, p] of Object.entries(parts)) { const m = new THREE.Mesh(p.g, mat); m.position.fromArray(p.pivot); m.castShadow = k === 'body'; grp.add(m); P[k] = m; }
  grp.scale.setScalar(scale);
  return { grp, P };
}

export class Wildlife {
  constructor(view) {
    this.view = view; this.group = new THREE.Group(); view.scene.add(this.group);
    this.R = rng(4242);
    this.pipers = []; this.egrets = []; this.terns = []; this.bats = []; this.jumps = [];
    this.at = null; this.sig = '';
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  get hour() { return this.view.hour ?? 12; }

  /** 镜头附近的栖息地：沙滩海岸边、海岸浅水、池塘边、树冠、近岸海面 */
  _scan(fx, fz) {
    const V = this.view, T = V.terrain, R2 = 10, out = { beach: [], coast: [], ponds: [], perches: [] };
    for (const r of V.rec.values()) {
      const t = r.tt; if (!r.dress || r.hidden || Math.hypot(t.x - fx, t.z - fz) > R2) continue;
      for (let k = 0; k < 6; k++) if (!T.has(t.q + DIRS6[k][0], t.r + DIRS6[k][1])) (t.t === 'beach' ? out.beach : out.coast).push({ t, k });
      for (const p of r.dress.perches || []) out.perches.push(p);
      const pd = T.pondMap.get(r.k); if (pd && !pd.spring) out.ponds.push({ ...pd, y: t.base - 0.05 });
    }
    const d = (e) => Math.hypot(e.t.x - fx, e.t.z - fz);
    out.beach.sort((a, b) => d(a) - d(b)); out.coast.sort((a, b) => d(a) - d(b));
    return out;
  }
  /** 重排：镜头走远了，或者岛变了（地块都建好以后） */
  sync() {
    const V = this.view, f = V.focus, sig = V.landChanged + '|' + (V.q.life ?? 1);
    if (this.at && Math.hypot(f.x - this.at.x, f.z - this.at.z) < 7 && sig === this.sig) return;
    this.at = f.clone(); this.sig = sig;
    for (const o of [...this.group.children]) { this.group.remove(o); if (o.isInstancedMesh) o.dispose(); }
    this.pipers = []; this.egrets = []; this.terns = []; this.bats = []; this.jumps = [];
    if (!V.terrain.tiles.length) return;
    const S = this.S = this._scan(f.x, f.z), life = V.q.life ?? 1, R = this.R, g = geos(), mt = mats();
    // 鹬：最近的一两条沙滩边上各一小群
    for (const e of S.beach.slice(0, life >= 0.7 ? 2 : 1)) {
      const n = Math.round((4 + R() * 3) * life), ph = R();
      for (let i = 0; i < n; i++) {
        const { grp, P } = rig(g.piper, mt.body, 2.2), u = 0.25 + R() * 0.5;
        this.group.add(grp);
        this.pipers.push({ grp, P, e, u, u0: u, ph, lag: R() * 0.015, yaw: 0, gait: R() * 6, peck: 0, x: 0, z: 0, init: false });
      }
    }
    // 白鹭：沙滩外的浅水、池塘边
    const wade = [];
    for (const e of S.beach.slice(0, 3)) wade.push({ e, kind: 'beach' });
    for (const pd of S.ponds.slice(0, 2)) wade.push({ pd, kind: 'pond' });
    for (let i = 0; i < Math.min(wade.length, Math.max(1, Math.round(2 * life))); i++) {
      const w = wade[i], { grp, P } = rig(g.egret, mt.body, 1.5); this.group.add(grp);
      const a = { grp, P, w, s: R(), x: 0, z: 0, y: 0, yaw: R() * TAU, state: 'stand', timer: 1 + R() * 3, strike: 0, gait: 0, tx: 0, tz: 0 };
      this._egretSpot(a, true); this.egrets.push(a);
    }
    // 燕鸥：沿海岸巡飞的几只
    const coasts = [...S.beach, ...S.coast];
    if (coasts.length) {
      const n = Math.max(2, Math.round(4 * life)), im = this._flock(g.tern, mt.flap, n);
      for (let i = 0; i < n; i++) {
        const e = coasts[Math.floor(R() * Math.min(coasts.length, 8))], c = this._seaOff(e, 0.3 + R() * 0.4, 1.4 + R() * 1.2);
        this.terns.push({ im, i, c, r: 0.9 + R() * 0.7, h: 0.95 + R() * 0.4, a: R() * TAU, dir: R() < 0.5 ? 1 : -1, p: new V3(c[0], 1.1, c[1]), v: new V3(), state: 'patrol', timer: 3 + R() * 8, yaw: 0, pitch: 0, roll: 0, roost: S.beach.length ? S.beach[i % S.beach.length] : null, ru: 0.2 + R() * 0.6 });
      }
    }
    // 蝙蝠：住在附近的树冠里
    if (S.perches.length) {
      const n = Math.max(2, Math.round(6 * life)), im = this._flock(g.bat, mt.flap, n);
      for (let i = 0; i < n; i++) { const h = S.perches[Math.floor(R() * S.perches.length)]; this.bats.push({ im, i, home: new V3(h.x, h.y + h.h * 0.75, h.z), p: new V3(h.x, h.y + h.h * 0.75, h.z), v: new V3(), tgt: new V3(), timer: 0, out: false, delay: R() * 25, ph: R() * 6 }); }
    }
    // 跃鱼：一条鱼轮流在近岸各处跳
    if (coasts.length) { const m = new THREE.Mesh(g.fish, V.marine?.mats.still || mt.body); m.userData.noBatch = true; m.visible = false; m.scale.setScalar(2.4); this.group.add(m); this.jumps.push({ m, wait: 2 + R() * 4, t: -1, coasts }); }
  }
  /** 扇翅膀的实例化网格（燕鸥、蝙蝠） */
  _flock(geo, mat, n) {
    const g = geo.clone(), anim = new Float32Array(n * 4); g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4));
    const im = new THREE.InstancedMesh(g, mat, n); im.frustumCulled = false; im.userData.noBatch = true; im.userData.anim = anim; this.group.add(im);
    return im;
  }
  /** 海岸边 e 外侧、离岸 d 的海面点（u 沿边） */
  _seaOff(e, u, d) {
    const t = e.t, k = e.k, A = [Math.cos(Math.PI / 3 * (k - 1) + Math.PI / 6), Math.sin(Math.PI / 3 * (k - 1) + Math.PI / 6)], B = [Math.cos(Math.PI / 3 * k + Math.PI / 6), Math.sin(Math.PI / 3 * k + Math.PI / 6)];
    const nx = Math.cos(Math.PI / 3 * k), nz = Math.sin(Math.PI / 3 * k);
    return [t.x + A[0] + (B[0] - A[0]) * u + nx * d, t.z + A[1] + (B[1] - A[1]) * u + nz * d];
  }
  /** 白鹭挑下一个落脚点：沙滩外水深 3–7 厘米的地方，或池塘边的浅水 */
  _egretSpot(a, jump = false) {
    const T = this.view.terrain, R = this.R, w = a.w;
    let x, z, y;
    if (w.kind === 'beach') {
      a.s = Math.min(0.85, Math.max(0.15, a.s + (R() - 0.5) * 0.25));
      const p = T.beachPoint(w.e.t, w.e.k, a.s, -0.035 - R() * 0.035); x = p[0]; z = p[1]; y = -0.035 - 0.02;
    } else {
      const pd = w.pd, ang = (a.ang ?? R() * TAU) + (R() - 0.5) * 0.9; a.ang = ang;
      x = pd.x + Math.cos(ang) * pd.r * 0.82; z = pd.z + Math.sin(ang) * pd.r * 0.82; y = (T.heightAt(x, z) ?? pd.y - 0.04);
    }
    a.tx = x; a.tz = z; a.ty = y;
    if (jump) { a.x = x; a.z = z; a.y = y; }
  }

  update(dt, t) {
    const V = this.view;
    if (!V.chunksDirty && (this._syncT = (this._syncT || 0) + dt) > 1.2) { this._syncT = 0; this.sync(); }
    if (!this.S) return;
    const h = this.hour, night = h < 5.4 || h >= 19.6;
    this._pipers(dt, t, night); this._egrets(dt, t, night); this._terns(dt, t, h); this._bats(dt, t, h); this._jump(dt, t, h);
  }

  // ---- 鹬：浪涌上来就往高处跑，浪退下去就追着水边往下跑、低头啄 ----
  _pipers(dt, t, night) {
    const T = this.view.terrain;
    for (const b of this.pipers) {
      // 浪：快涨慢退的锯齿波（每条沙滩边相位不同）
      const s = ((t / 5.5 + b.e.k * 0.37 + b.ph) % 1), swash = s < 0.25 ? Math.sin(s / 0.25 * Math.PI / 2) : 1 - (s - 0.25) / 0.75;
      const level = night ? 0.14 : 0.004 + swash * 0.028 + 0.012 + b.lag;
      if (night) b.u += (b.u0 * 0.3 + 0.35 - b.u) * Math.min(1, dt * 0.3);   // 夜里往中间挤
      else b.u = b.u0 + Math.sin(t * 0.05 + b.ph * 6 + b.u0 * 9) * 0.06;
      const [x, z, nx, nz] = T.beachPoint(b.e.t, b.e.k, b.u, level);
      if (!b.init) { b.x = x; b.z = z; b.init = true; }
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz), sp = Math.min(d, 0.32 * dt);
      let run = 0;
      if (d > 0.006) { b.x += dx / d * sp; b.z += dz / d * sp; run = sp / dt; b.yaw = turn(b.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14)); }
      else b.yaw = turn(b.yaw, Math.atan2(nx, nz), Math.min(1, dt * 3));
      const y = this._beachY(b);
      b.gait += run * dt * 260;
      const leg = Math.min(1, run * 8) * 0.8, P = b.P;
      if (P.legL) P.legL.rotation.x = Math.sin(b.gait) * leg; if (P.legR) P.legR.rotation.x = -Math.sin(b.gait) * leg;
      // 停下来的时候一下一下低头啄沙
      if (run < 0.01 && !night) { b.peck -= dt; if (b.peck < -0.6 - b.ph) b.peck = 0.25; } else b.peck = -1;
      const pitch = b.peck > 0 ? Math.sin(b.peck / 0.25 * Math.PI) * 0.7 : night ? 0.15 : 0;
      b.grp.position.set(b.x, y + (night ? -0.012 : Math.abs(Math.sin(b.gait)) * 0.004 * leg), b.z);
      b.grp.rotation.set(pitch, b.yaw, 0, 'YXZ');
    }
  }
  /** 鹬脚下沙坡的高度：从坡上按水平距离反推 */
  _beachY(b) {
    const T = this.view.terrain, top = T.beachPoint(b.e.t, b.e.k, b.u, 0.3), lo = T.beachPoint(b.e.t, b.e.k, b.u, -0.05);
    const L2 = Math.hypot(lo[0] - top[0], lo[1] - top[1]) || 1, f = ((b.x - top[0]) * (lo[0] - top[0]) + (b.z - top[1]) * (lo[1] - top[1])) / (L2 * L2);
    return 0.3 + (-0.05 - 0.3) * Math.max(0, Math.min(1.2, f));
  }

  // ---- 白鹭 ----
  _egrets(dt, t, night) {
    const V = this.view, R = this.R;
    for (const a of this.egrets) {
      const P = a.P; a.timer -= dt;
      if (night) { a.state = 'sleep'; }
      else if (a.state === 'sleep') { a.state = 'stand'; a.timer = 2; }
      if (a.state === 'stand' && a.timer < 0) {
        if (R() < 0.45) { a.state = 'strike'; a.strike = 0; }
        else if (R() < 0.6) { this._egretSpot(a); a.state = 'walk'; }
        a.timer = 2 + R() * 5;
      }
      let pitchN = 0, walk = 0;
      if (a.state === 'walk') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.01) { a.state = 'stand'; a.timer = 2 + R() * 4; }
        else { const sp = Math.min(d, 0.035 * dt); a.x += dx / d * sp; a.z += dz / d * sp; a.y += (a.ty - a.y) * Math.min(1, dt * 2); a.yaw = turn(a.yaw, Math.atan2(dx, dz), Math.min(1, dt * 2)); walk = 1; }
      } else if (a.state === 'strike') {
        // 伸颈一啄：0.15 秒扎下去，0.5 秒收回来
        a.strike += dt; const s = a.strike;
        pitchN = s < 0.15 ? s / 0.15 * 1.15 : s < 0.65 ? 1.15 * (1 - (s - 0.15) / 0.5) : 0;
        if (s >= 0.15 && !a.hit) { a.hit = true; const nx = Math.sin(a.yaw), nz = Math.cos(a.yaw), wy = a.w.kind === 'pond' ? a.w.pd.y : 0.0; V.marine?.splash.emit(a.x + nx * 0.17, wy + 0.005, a.z + nz * 0.17, 6, { speed: 0.1, up: 1, spread: 0.6, size: 0.01, life: 0.45 }); if (a.w.kind === 'beach') V.ocean?.ripple(a.x + nx * 0.17, a.z + nz * 0.17, 0.12); }
        if (s > 0.7) { a.state = 'stand'; a.hit = false; a.timer = 1.5 + R() * 4; }
      } else if (a.state === 'stand') pitchN = 0.15 + Math.sin(t * 0.6 + a.s * 9) * 0.08;   // 盯着水面
      a.gait += walk * dt * 4.5;
      const sleep = a.state === 'sleep';
      if (P.neck) P.neck.rotation.x = sleep ? -0.35 : pitchN;
      if (P.legL) P.legL.rotation.x = sleep ? 0 : Math.sin(a.gait) * 0.45 * walk;
      if (P.legR) P.legR.rotation.x = sleep ? -1.3 : -Math.sin(a.gait) * 0.45 * walk;   // 睡觉时缩起一条腿
      a.grp.position.set(a.x, a.y + (sleep ? -0.01 : 0), a.z);
      a.grp.rotation.set(sleep ? 0.12 : 0, a.yaw, 0, 'YXZ');
    }
  }

  // ---- 燕鸥 ----
  _terns(dt, t, h) {
    if (!this.terns.length) return;
    const V = this.view, R = this.R, im = this.terns[0].im, anim = im.userData.anim, roost = h >= 18.7 || h < 5.6;
    for (const b of this.terns) {
      b.timer -= dt; let A = [b.a, 9, 0.6, 0.12], sx = 1;
      if (roost && b.roost && b.state !== 'land' && b.state !== 'sit') { b.state = 'land'; }
      if (!roost && (b.state === 'sit' || b.state === 'land')) { b.state = 'rise'; b.v.set(0, 0.5, 0); }
      if (b.state === 'patrol') {
        // 沿海岸绕圈巡飞，转弯时侧倾
        b.a += b.dir * dt * 0.55 / b.r;
        const tx = b.c[0] + Math.cos(b.a) * b.r, tz = b.c[1] + Math.sin(b.a) * b.r, ty = b.h + Math.sin(t * 0.8 + b.a) * 0.08;
        const dx = tx - b.p.x, dy = ty - b.p.y, dz = tz - b.p.z; b.p.x += dx * Math.min(1, dt * 2); b.p.y += dy * Math.min(1, dt * 2); b.p.z += dz * Math.min(1, dt * 2);
        b.yaw = turn(b.yaw, Math.atan2(-Math.sin(b.a) * b.dir, Math.cos(b.a) * b.dir), Math.min(1, dt * 4)); b.roll = -b.dir * 0.35; b.pitch = 0;
        A = [b.a * 3, 8.5, Math.sin(t * 0.9 + b.a) > -0.2 ? 0.6 : 0.08, 0.12];
        if (b.timer < 0) { b.state = 'hover'; b.timer = 1 + R() * 1.6; }
      } else if (b.state === 'hover') {
        // 悬停：快速扇翅，头朝下盯着水面
        A = [b.a, 17, 0.5, 0.35]; b.roll *= 0.9; b.pitch = turn(b.pitch, 0.35, dt * 3);
        if (b.timer < 0) { if (R() < 0.6) { b.state = 'dive'; b.v.set(0, -0.4, 0); } else { b.state = 'patrol'; b.timer = 3 + R() * 7; } }
      } else if (b.state === 'dive') {
        // 收翅俯冲：越落越快，扎进水里
        b.v.y -= 3.2 * dt; b.p.addScaledVector(b.v, dt); b.pitch = turn(b.pitch, 1.35, dt * 6); A = [0, 3, 0.04, 1.2]; sx = 0.5;
        const sea = V.ocean ? V.ocean.surfaceAt(b.p.x, b.p.z).h : 0;
        if (b.p.y <= sea + 0.01) { V.marine?.splash.emit(b.p.x, sea + 0.01, b.p.z, 22, { speed: 0.3, up: 1.4, spread: 0.5, size: 0.016, life: 0.7 }); V.ocean?.ripple(b.p.x, b.p.z, 0.4); b.state = 'under'; b.timer = 0.35; }
      } else if (b.state === 'under') {
        A = [0, 3, 0.04, 1.2]; sx = 0.5; b.p.y = -0.08;
        if (b.timer < 0) { const sea = V.ocean ? V.ocean.surfaceAt(b.p.x, b.p.z).h : 0; b.p.y = sea + 0.02; V.marine?.splash.emit(b.p.x, sea + 0.01, b.p.z, 10, { speed: 0.18, up: 1.2, spread: 0.6, size: 0.012, life: 0.5 }); b.state = 'rise'; b.v.set(Math.sin(b.yaw) * 0.25, 0.7, Math.cos(b.yaw) * 0.25); }
      } else if (b.state === 'rise') {
        // 用力扇翅爬升，回到巡飞高度
        b.p.addScaledVector(b.v, dt); b.pitch = turn(b.pitch, -0.45, dt * 4); A = [b.a, 13, 0.85, 0.1];
        if (b.p.y >= b.h) { b.state = 'patrol'; b.timer = 3 + R() * 8; b.pitch = 0; }
      } else if (b.state === 'land' || b.state === 'sit') {
        // 黄昏落到沙滩高处歇着；翅膀收在身体两侧（压扁翼展）
        const [x, z, nx, nz] = V.terrain.beachPoint(b.roost.t, b.roost.k, b.ru, 0.17), gy = V.terrain.heightAt(x - nx * 0.02, z - nz * 0.02) ?? 0.17;
        const dx = x - b.p.x, dy = gy + 0.008 - b.p.y, dz = z - b.p.z, d = Math.hypot(dx, dz);
        if (b.state === 'land') {
          const sp = Math.min(d, 0.6 * dt); if (d > 1e-3) { b.p.x += dx / d * sp; b.p.z += dz / d * sp; b.yaw = turn(b.yaw, Math.atan2(dx, dz), dt * 3); }
          b.p.y += dy * Math.min(1, dt * (d < 0.3 ? 3 : 0.8)); A = [b.a, 10, 0.55, 0.15]; b.roll *= 0.9; b.pitch = turn(b.pitch, d < 0.2 ? -0.3 : 0, dt * 3);
          if (d < 0.01 && Math.abs(dy) < 0.01) b.state = 'sit';
        } else { b.p.set(x, gy + 0.008, z); b.yaw = turn(b.yaw, Math.atan2(-nx, -nz) + Math.PI, dt); b.pitch = 0; b.roll = 0; A = [0, 1, 0, 0.05]; sx = 0.32; }
      }
      anim.set(A, b.i * 4);
      this.e.set(b.pitch, b.yaw, b.roll, 'YXZ'); this.q.setFromEuler(this.e);
      im.setMatrixAt(b.i, this.m4.compose(b.p, this.q, new V3(2.8 * sx, 2.8, 2.8)));
    }
    im.instanceMatrix.needsUpdate = true; im.geometry.attributes.iAnim.needsUpdate = true;
  }

  // ---- 蝙蝠：黄昏和黎明各飞一阵 ----
  _bats(dt, t, h) {
    if (!this.bats.length) return;
    const R = this.R, im = this.bats[0].im, anim = im.userData.anim, active = (h >= 18.8 && h < 21.8) || (h >= 4.2 && h < 5.6), T = this.view.terrain;
    for (const b of this.bats) {
      b.delay -= dt;
      if (active && !b.out && b.delay < 0) { b.out = true; b.p.copy(b.home); }
      let vis = b.out;
      if (b.out) {
        b.timer -= dt;
        if (b.timer < 0) {
          b.timer = 0.3 + R() * 0.6;
          if (!active) b.tgt.copy(b.home);
          else { const a = R() * TAU, r = 0.2 + R() * 1.3, x = b.home.x + Math.cos(a) * r, z = b.home.z + Math.sin(a) * r, g = T.heightAt(x, z) ?? 0.45; b.tgt.set(x, g + 0.3 + R() * 0.7, z); }
        }
        // 急转弯：大加速度追目标点，速度上限高
        const d = new V3().subVectors(b.tgt, b.p), dl = d.length();
        b.v.addScaledVector(d.normalize(), 5 * dt).multiplyScalar(Math.exp(-2.5 * dt)); if (b.v.length() > 1.1) b.v.setLength(1.1);
        b.p.addScaledVector(b.v, dt);
        if (!active && dl < 0.06) { b.out = false; b.delay = R() * 25; vis = false; }
      }
      anim.set([b.ph, 15, 0.9, 0], b.i * 4);
      this.e.set(-b.v.y * 0.4, Math.atan2(b.v.x, b.v.z), 0, 'YXZ'); this.q.setFromEuler(this.e);
      im.setMatrixAt(b.i, this.m4.compose(vis ? b.p : new V3(0, -50, 0), this.q, new V3(2.4, 2.4, 2.4)));
    }
    im.instanceMatrix.needsUpdate = true; im.geometry.attributes.iAnim.needsUpdate = true;
  }

  // ---- 跃鱼 ----
  _jump(dt, t, h) {
    const V = this.view, R = this.R;
    for (const j of this.jumps) {
      if (j.t < 0) {
        j.wait -= dt; j.m.visible = false;
        if (j.wait > 0) continue;
        // 清晨、黄昏鱼最活跃（觅食），正午和深夜少
        const busy = (h >= 5.5 && h < 8.5) || (h >= 16.5 && h < 19.5);
        j.wait = busy ? 2.5 + R() * 4 : h >= 21 || h < 4.5 ? 20 + R() * 20 : 7 + R() * 9;
        const e = j.coasts[Math.floor(R() * Math.min(8, j.coasts.length))], [x, z] = this._seaOff(e, 0.15 + R() * 0.7, 0.5 + R() * 1.6);
        if (V.terrain.landDist(x, z) < 0.4) continue;
        const yaw = R() * TAU, H = 0.07 + R() * 0.09, vy = Math.sqrt(2 * G * H);
        j.x = x; j.z = z; j.yaw = yaw; j.vy = vy; j.vh = 0.18 + R() * 0.12; j.T = 2 * vy / G; j.t = 0; j.sea = V.ocean ? V.ocean.surfaceAt(x, z).h : 0;
        V.marine?.splash.emit(x, j.sea + 0.01, z, 12, { speed: 0.16, up: 1.3, spread: 0.6, size: 0.012, life: 0.55 }); V.ocean?.ripple(x, z, 0.22);
      }
      j.t += dt; const u = j.t, vy = j.vy - G * u;
      const x = j.x + Math.sin(j.yaw) * j.vh * u, z = j.z + Math.cos(j.yaw) * j.vh * u, y = j.sea + j.vy * u - 0.5 * G * u * u;
      j.m.visible = true; j.m.position.set(x, y, z); j.m.rotation.set(-Math.atan2(vy, j.vh) + Math.sin(u * 30) * 0.15, j.yaw, 0, 'YXZ');
      if (u >= j.T) { j.t = -1; j.m.visible = false; V.marine?.splash.emit(x, j.sea + 0.01, z, 16, { speed: 0.2, up: 1.4, spread: 0.6, size: 0.013, life: 0.6 }); V.ocean?.ripple(x, z, 0.3); }
    }
  }
}
