// 岛上的居民（屿灵，造型见 sprite.js）：住在营地的岛民按一天的作息生活，渔夫划船出海。
// 作息（按岛上的时间）：
//   5:30–7    起床，在屋前活动
//   7–11:30   去田里、林边、海边或水边干活（顺着小路走过去，到了弯腰干活）
//   11:30–13  回营地，坐在火边吃饭歇脚
//   13–17     再出去干活（换个地方）
//   17–21     回营地围着火坐
//   21–5:30   回屋睡觉（看不见）
// 时间固定不动时（比如一直停在下午），村民每隔一阵换个地方干活，画面里总有人在走动。
// 每个营地住三个人。渔夫：清晨划船出海到离岸几个单位的渔场，下午收网回来，船跟着浪起伏（交给海洋的浮力），海鸥在船上空盘旋。
import * as THREE from 'three';
import * as P from './props.js';
import * as BK from './blocky.js';
import { sprite } from './sprite.js';
import { propMaterial } from './materials.js';

const SHIRTS = [0xc8432f, 0x3f6fb5, 0x5e8f3a, 0xd9a13b, 0x8a5aa8, 0x2f8f8a];
const HATS = ['straw', 'none', 'cap', 'straw'];
const VARIANTS = new Map();
function villagerGeo(i) {
  const k = i % 6; let g = VARIANTS.get(k);
  if (!g) { g = sprite(k).geometry; g.userData.shared = true; VARIANTS.set(k, g); }   // 岛民是屿灵（hq/sprite.js），不是人
  return g;
}
const NAMES = ['阿禾', '小满', '石头', '海生', '阿篱', '青禾', '大树', '小渔'];
const WORK_SPOT = { field: 'farm', wheat: 'farm', forest: 'wood', beach: 'shore', stream: 'water', pond: 'water' };

export class Villagers {
  constructor(view) {
    this.view = view; this.group = new THREE.Group(); view.scene.add(this.group);
    this.people = []; this.boats = []; this.sig = '';
  }
  /** 地块变了以后重排：每个营地三个村民；挨着营地的沙滩有一条渔船 */
  sync() {
    const T = this.view.terrain, camps = T.tiles.filter((t) => t.t === 'camp');
    const sig = camps.map((c) => c.q + ',' + c.r).join('|') + '#' + T.paths.length;
    if (sig === this.sig) return; this.sig = sig;
    for (const p of this.people) this.group.remove(p.m);
    for (const b of this.boats) { this.group.remove(b.g); if (this.view.marine) this.view.marine.floaters = this.view.marine.floaters.filter((f) => f.obj !== b.g); }
    this.people = []; this.boats = [];
    let n = 0;
    for (const c of camps) {
      const paths = T.paths.filter((p) => p.from === c);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(villagerGeo(n++), this._mat()); m.castShadow = true;
        const home = [c.x - 0.24 + [-0.05, 0.2, 0.08][i], c.z - 0.05 + [0, 0.1, 0.22][i]];
        m.position.set(home[0], T.heightAt(home[0], home[1]) ?? c.base, home[1]); this.group.add(m);
        this.people.push({ name: NAMES[(n - 1) % NAMES.length], m, camp: c, home, paths, i, state: 'idle', route: null, ri: 0, t: 0, wait: 1 + i * 2, task: null, yaw: 0, seed: n * 1.7 });
      }
      // 渔船：营地附近（两圈内）有沙滩就配一条
      const beach = T.tiles.find((b) => b.t === 'beach' && (Math.abs(b.q - c.q) + Math.abs(b.r - c.r) + Math.abs(b.q + b.r - c.q - c.r)) / 2 <= 4);
      if (beach) this._boat(beach, n++);
    }
  }
  /** 方块风格用偏哑光的黏土材质 */
  _mat() { return (this.view.mats.clay ||= propMaterial({ rough: 0.6, env: 1 })); }
  _boat(beach, seed) {
    const T = this.view.terrain;
    // 停船点：沙滩外侧的浅水；渔场：再往外 3–5 个单位、离岸够远的地方
    let best = null;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k, x = beach.x + Math.cos(a) * 1.35, z = beach.z + Math.sin(a) * 1.35; if (!T.tileAt(x, z) && T.landDist(x, z) > 0.25) { best = [x, z, a]; break; } }
    if (!best) return;
    const [hx, hz, a] = best; let fish = null;
    for (let d = 3; d < 7; d += 0.5) { const x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d; if (T.landDist(x, z) > 2.5) { fish = [x, z]; break; } }
    if (!fish) return;
    const g = new THREE.Group(), hull = new THREE.Mesh(P.rowBoat(seed).geometry, this.view.mats.prop); hull.castShadow = true; g.add(hull);
    const man = new THREE.Mesh(villagerGeo(4), this._mat());   // 渔夫是“海”屿灵 man.scale.setScalar(0.8); man.position.set(0, 0.012, -0.04); g.add(man);
    g.scale.setScalar(1.2); g.position.set(hx, 0, hz); g.rotation.y = a + Math.PI / 2; this.group.add(g);
    const b = { g, home: [hx, hz], fish, x: hx, z: hz, yaw: a + Math.PI / 2, man, float: null };
    this.boats.push(b);
  }
  _workTarget(p) {
    const paths = p.paths; if (!paths.length) return null;
    const pick = paths[(Math.floor(p.seed * 7 + (this.view.hour > 13 ? 3 : 0) + (p.round || 0)) % paths.length)];
    const pts = pick.pts.map(([x, z]) => [x, z]), end = pts[pts.length - 1], g = pick.to;
    // 走到小路尽头，再往地块里走一点
    const sa = p.i * 2.1 + (p.round || 0), ex = end[0] + (g.x - end[0]) * 0.4 + Math.cos(sa) * 0.2, ez = end[1] + (g.z - end[1]) * 0.4 + Math.sin(sa) * 0.2;   // 几个人分开站，不挤在一起
    if (this.view.terrain.heightAt(ex, ez) != null) pts.push([ex, ez]);
    return { pts, task: WORK_SPOT[g.t] || 'farm' };
  }
  _goHome(p) {
    const back = p.route ? p.route.slice().reverse() : [p.home];
    const fire = this._firePos(p);
    back.push(fire);
    return back;
  }
  _firePos(p) { const c = p.camp, a = p.i * 2.2 + 0.6; return [c.x + 0.12 + Math.cos(a) * 0.2, c.z + 0.1 + Math.sin(a) * 0.2]; }
  /** 现在这个人应该在干什么 */
  _plan(h) {
    if (h >= 21 || h < 5.5) return 'sleep';
    if (h < 7) return 'idle';
    if (h < 11.5) return 'work';
    if (h < 13) return 'rest';
    if (h < 17) return 'work';
    return 'fire';
  }
  update(dt, t) {
    const T = this.view.terrain, h = this.view.hour ?? 12;
    for (const p of this.people) {
      const m = p.m, want = this._plan(h);
      // 计划变了：出发去新地方
      if (want !== p.plan) {
        p.plan = want;
        if (want === 'work') { const w = this._workTarget(p); if (w) { p.route = w.pts; p.ri = 0; p.task = w.task; p.state = 'walk'; } }
        else if (want === 'rest' || want === 'fire') { p.route = this._goHome(p); p.ri = 0; p.state = 'walk'; p.task = 'sit'; }
        else if (want === 'idle') { p.route = [p.home]; p.ri = 0; p.state = 'walk'; p.task = 'idle'; }
        else { p.route = [p.home]; p.ri = 0; p.state = 'walk'; p.task = 'sleep'; }
      }
      // 时间不走时：干一会儿活就换个地方
      if (p.state === 'work') { p.t += dt; if (p.t > 40 + p.i * 13) { p.t = 0; p.round = (p.round || 0) + 1; const w = this._workTarget(p); if (w) { const back = p.route.slice().reverse(); p.route = back.concat(w.pts.slice(1)); p.ri = 0; p.task = w.task; p.state = 'walk'; } } }
      let y = T.heightAt(m.position.x, m.position.z) ?? m.position.y, bob = 0, pitch = 0, sx = 1;
      if (p.state === 'walk' && p.route) {
        const tg = p.route[p.ri], dx = tg[0] - m.position.x, dz = tg[1] - m.position.z, d = Math.hypot(dx, dz), sp = 0.11;
        if (d < 0.02) { p.ri++; if (p.ri >= p.route.length) { p.state = p.task === 'sleep' ? 'sleep' : p.task === 'sit' ? 'sit' : p.task === 'idle' ? 'idle' : 'work'; p.t = 0; } }
        else { const k = Math.min(d, sp * dt) / d; m.position.x += dx * k; m.position.z += dz * k; const yaw = Math.atan2(dx, dz); let dy = yaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 8); bob = Math.abs(Math.sin(t * 9 + p.seed)) * 0.016; sx = 1 + Math.sin(t * 18 + p.seed * 2) * 0.07; }   // 一蹦一蹦地走：落地压扁、腾空拉长
      } else if (p.state === 'work') {
        // 干活：种地弯腰、砍柴挥手、海边低头捡东西、水边弯腰打水
        const ph = t * (p.task === 'wood' ? 2.6 : 1.4) + p.seed;
        pitch = p.task === 'wood' ? 0.25 + Math.max(0, Math.sin(ph)) * 0.35 : 0.45 + Math.sin(ph) * 0.15;
        if (p.task === 'shore') pitch = 0.3 + Math.max(0, Math.sin(ph * 0.5)) * 0.5;
      } else if (p.state === 'sit') {
        // 围着火坐：面向火，身子矮一截，偶尔动一动
        const c = p.camp; p.yaw = Math.atan2(c.x + 0.12 - m.position.x, c.z + 0.1 - m.position.z); sx = 0.78; pitch = 0.08 + Math.sin(t * 0.7 + p.seed) * 0.04;
      } else if (p.state === 'idle') { p.yaw += Math.sin(t * 0.3 + p.seed) * dt * 0.4; }
      m.userData.batchVis = p.state !== 'sleep';   // 合批时用它判断画不画（占位本身一直隐藏）
      m.position.y = y + bob - (sx < 1 ? 0.03 : 0);
      m.rotation.set(pitch, p.yaw, 0, 'YXZ'); m.scale.set(1, sx, 1);
    }
    // 渔船：6–9 点划出去，16–18 点划回来；在渔场时绕小圈漂着
    const M = this.view.marine;
    for (const b of this.boats) {
      if (!b.float && M) { M.addFloater(b.g, { draft: 0.005, stiff: 9, yawRate: 0 }); b.float = M.floaters[M.floaters.length - 1]; }
      const out = h >= 6.5 && h < 16.5, tgt = out ? [b.fish[0] + Math.cos(t * 0.05) * 0.6, b.fish[1] + Math.sin(t * 0.05) * 0.6] : b.home;
      const dx = tgt[0] - b.x, dz = tgt[1] - b.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const sp = Math.min(0.16, d * 0.3); b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; const yaw = Math.atan2(dx, dz); let dy = yaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * Math.min(1, dt * 0.8); }
      if (b.float) { b.float.x0 = b.x; b.float.z0 = b.z; b.float.yaw = b.yaw; }
      b.man.rotation.x = d > 0.3 ? Math.sin(t * 2.2) * 0.25 : 0.1;   // 划桨
    }
    // 海鸥：有船在渔场时，三只海鸥去船上空盘旋
    const g = this.view.gulls, atSea = this.boats.find((b) => Math.hypot(b.x - b.fish[0], b.z - b.fish[1]) < 1.5);
    if (g) g.follow = atSea ? new THREE.Vector3(atSea.x, 0, atSea.z) : null;
  }
}
