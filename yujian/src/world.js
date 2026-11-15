// 世界渲染：地块按区块合并成少量网格；岸线距离场；可放置格高亮、预览、可收获标记。
import * as THREE from 'three';
import { key, toWorld, CORNERS } from './hex.js';
import { buildTile, MARK_Y } from './tiles.js';
import { TOP } from './config.js';
import { landMaterial as fxLand, swayWeights } from './fx.js';

const CH = 6; // 区块边长（格）
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

export const landMaterial = fxLand;

// 每个三角面的法线（压成 Int8）。阴影的法线偏移需要它，缺了阴影会整体失效
export function faceNormals(pos) {
  const n = new Int8Array(pos.length);
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    const l = Math.hypot(x, y, z) || 1;
    if (y < 0 && Math.abs(y) > l * 0.5) { x = -x; y = -y; z = -z; } // 朝下的面基本是绕序写反了的顶面
    x = Math.round(x / l * 127); y = Math.round(y / l * 127); z = Math.round(z / l * 127);
    for (let j = 0; j < 9; j += 3) { n[i + j] = x; n[i + j + 1] = y; n[i + j + 2] = z; }
  }
  return n;
}
function geoFrom(pos, col, nor = faceNormals(pos), sway = null) {
  const g = new THREE.BufferGeometry();
  if (sway) g.setAttribute('sway', new THREE.BufferAttribute(sway, 1, true));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.computeBoundingSphere();
  return g;
}

export class World {
  constructor(scene) {
    this.mat = landMaterial();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map();  // 区块键 → { keys:Set, mesh, dirty }
    this.geo = new Map();     // 地块键 → { pos, col, ck, hidden }
    this.rising = [];
    this.tris = 0;
  }
  _ck(q, r) { return Math.floor(q / CH) + ',' + Math.floor(r / CH); }

  /** 生成或更新一个地块。rise=true 时播放从海里升起的动画，结束后并入区块 */
  setTile(t, rise = false) {
    const k = key(t.q, t.r), [wx, wz] = toWorld(t.q, t.r);
    const g = buildTile(t.t, t.q, t.r, { harvested: !!t.harvested, dir: t.dir, center: t.center }).translate(wx, 0, wz);
    const rec = { pos: new Float32Array(g.p), col: new Float32Array(g.c), ck: this._ck(t.q, t.r), hidden: rise };
    rec.nor = faceNormals(rec.pos); rec.sway = swayWeights(rec.pos, rec.col);
    this.geo.set(k, rec);
    let ch = this.chunks.get(rec.ck);
    if (!ch) { ch = { keys: new Set(), mesh: null, dirty: true }; this.chunks.set(rec.ck, ch); }
    ch.keys.add(k);
    if (rise) {
      const mesh = new THREE.Mesh(geoFrom(rec.pos, rec.col, rec.nor, rec.sway), this.mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.y = -1.4;
      this.group.add(mesh);
      this.rising.push({ rec, mesh, t: 0, ch });
    } else ch.dirty = true;
  }
  rebuildAll(tiles) {
    for (const ch of this.chunks.values()) if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    this.chunks.clear(); this.geo.clear();
    for (const t of tiles) this.setTile(t);
  }
  update(dt) {
    for (let i = this.rising.length - 1; i >= 0; i--) {
      const a = this.rising[i];
      a.t += dt / 0.75;
      if (a.t >= 1) {
        this.group.remove(a.mesh); a.mesh.geometry.dispose();
        a.rec.hidden = false; a.ch.dirty = true;
        this.rising.splice(i, 1);
      } else a.mesh.position.y = -1.4 * (1 - easeOutBack(a.t));
    }
    for (const ch of this.chunks.values()) if (ch.dirty) this._rebuild(ch);
  }
  _rebuild(ch) {
    ch.dirty = false;
    let n = 0;
    for (const k of ch.keys) { const r = this.geo.get(k); if (!r.hidden) n += r.pos.length; }
    if (ch.mesh) { this.tris -= ch.mesh.geometry.attributes.position.count / 3; this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
    if (!n) return;
    const pos = new Float32Array(n), col = new Float32Array(n), nor = new Int8Array(n), sway = new Uint8Array(n / 3);
    let o = 0;
    for (const k of ch.keys) { const r = this.geo.get(k); if (r.hidden) continue; pos.set(r.pos, o); col.set(r.col, o); nor.set(r.nor, o); sway.set(r.sway, o / 3); o += r.pos.length; }
    ch.mesh = new THREE.Mesh(geoFrom(pos, col, nor, sway), this.mat);
    ch.mesh.castShadow = ch.mesh.receiveShadow = true;
    this.group.add(ch.mesh);
    this.tris += n / 9;
  }
}

/** 岸线距离场：把每块陆地画成一个六边形锥（中心 1 → 外圈 0），用 MAX 混合得到“离岸多远”，供水面着色器做浅滩和白浪 */
export const SHORE_RC = 3.2; // 锥体半径（地块半径的倍数）
export class ShoreField {
  constructor() {
    this.size = 96;
    this.rt = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.OrthographicCamera(-48, 48, 48, -48, 0.1, 60);
    this.cam.up.set(0, 0, -1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    const pos = [0, 0, 0], a = [1];
    for (const c of CORNERS) { pos.push(c[0] * SHORE_RC, 0, c[1] * SHORE_RC); a.push(0); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geo.setAttribute('a', new THREE.Float32BufferAttribute(a, 1));
    this.geo.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 1, 6]);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float a; varying float v; void main(){ v = a; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float v; void main(){ gl_FragColor = vec4(v, v, v, 1.0); }',
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = null; this.cap = 0;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.dirty = true;
  }
  /** cells: [[q,r],...] 所有陆地格 */
  setCells(cells) {
    if (cells.length > this.cap) {
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
      this.cap = Math.max(256, cells.length * 2);
      this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => { const [x, z] = toWorld(c[0], c[1]); m.makeTranslation(x, 0, z); this.mesh.setMatrixAt(i, m); });
    this.mesh.count = cells.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = true;
  }
  update(renderer, fx, fz) {
    if (Math.hypot(fx - this.center.x, fz - this.center.y) > this.size * 0.18) { this.center.set(Math.round(fx), Math.round(fz)); this.dirty = true; }
    if (!this.dirty || !this.mesh) return;
    this.dirty = false;
    this.cam.position.set(this.center.x, 30, this.center.y);
    this.cam.lookAt(this.center.x, 0, this.center.y);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prev);
  }
}

/** 标记层：可放置格高亮、放置预览、可收获提示 */
export class Markers {
  constructor(scene, landMat) {
    this.scene = scene;
    // 六边形环
    const ring = [], idx = [];
    CORNERS.forEach((c, i) => { ring.push(c[0] * 0.93, 0, c[1] * 0.93, c[0] * 0.74, 0, c[1] * 0.74); const a = i * 2, b = ((i + 1) % 6) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); });
    this.ringGeo = new THREE.BufferGeometry();
    this.ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    this.ringGeo.setIndex(idx);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.frontier = this._inst(this.ringGeo, this.ringMat, 256);
    this.frontier.renderOrder = 3;
    // 预览
    this.ghostMat = fxLand(false); this.ghostMat.transparent = true; this.ghostMat.opacity = 0.78;
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat); this.ghost.visible = false; scene.add(this.ghost);
    this.pick = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.pick.visible = false; this.pick.renderOrder = 4; scene.add(this.pick);
    this.ghostCache = new Map();
    // 可收获提示：金色小菱形
    this.readyMat = new THREE.MeshLambertMaterial({ color: 0xffd45e, emissive: 0xb07a10, flatShading: true });
    this.ready = this._inst(new THREE.OctahedronGeometry(0.13, 0), this.readyMat, 128);
    this.readyList = [];
    this.t = 0;
  }
  _inst(geo, mat, cap) { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; this.scene.add(m); return m; }
  _grow(name, n) {
    const old = this[name];
    if (n <= old.instanceMatrix.count) return old;
    const m = this._inst(old.geometry, old.material, n * 2); m.renderOrder = old.renderOrder;
    this.scene.remove(old); old.dispose(); this[name] = m; return m;
  }
  setFrontier(cells) {
    const mesh = this._grow('frontier', cells.length), m = new THREE.Matrix4();
    cells.forEach((c, i) => { const [x, z] = toWorld(c[0], c[1]); m.makeTranslation(x, 0.05, z); mesh.setMatrixAt(i, m); });
    mesh.count = cells.length; mesh.instanceMatrix.needsUpdate = true;
  }
  setGhost(type, q, r, dir) {
    if (!type) { this.ghost.visible = this.pick.visible = false; return; }
    const ck = type + ':' + (dir || 0);
    let geo = this.ghostCache.get(ck);
    if (!geo) { geo = buildTile(type, 3, 5, { dir }).toGeometry(); this.ghostCache.set(ck, geo); }
    const [x, z] = toWorld(q, r);
    this.ghost.geometry = geo; this.ghost.position.set(x, 0, z); this.ghost.visible = true;
    this.pick.position.set(x, 0.07, z); this.pick.visible = true;
  }
  /** tiles: 可收获且已长好的地块 */
  setReady(tiles) {
    this.readyList = tiles.map((t) => { const [x, z] = toWorld(t.q, t.r); return [x, MARK_Y[t.t] || 1, z]; });
    this._grow('ready', this.readyList.length).count = this.readyList.length;
  }
  update(dt) {
    this.t += dt;
    this.ringMat.opacity = 0.42 + Math.sin(this.t * 3.2) * 0.2;
    if (this.ghost.visible) this.ghost.position.y = Math.sin(this.t * 4) * 0.04 + 0.03;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1.25, 1), p = new THREE.Vector3();
    this.readyList.forEach((v, i) => {
      e.set(0, this.t * 1.6 + i, 0); q.setFromEuler(e);
      p.set(v[0], v[1] + Math.sin(this.t * 2.4 + i * 1.7) * 0.07, v[2]);
      m.compose(p, q, s); this.ready.setMatrixAt(i, m);
    });
    if (this.readyList.length) this.ready.instanceMatrix.needsUpdate = true;
  }
}
export { TOP };
