// 方块岛（第一阶段可玩原型）：在一座方块组成的岛上自由建造。
// 画面：复用六边形岛的天空、阳光、阴影、雾和环境光（Atmosphere）、同一套镜头手感（CameraRig）；方块网格见 mesher.js。
// 操作（俯视为主）：
//  - 没拿笔（浏览）：单指拖动平移；拿着笔：单指点 = 用这支笔，单指拖 = 连续摆 / 连续拆；双指照常转视角、缩放、平移。
//  - 长按任意方块 = 吸管（拿起这种方块）；手指按下只显示半透明的“幽灵方块”，抬起才落子，按着时可以滑动修正。
//  - 右侧剖切滑杆：某层以上的方块全部隐藏，看清并布置屋里。撤销 / 重做 100 步。自动保存在本机。
import * as THREE from 'three';
import { CameraRig } from '../camera.js';
import { Atmosphere, presetAt } from '../hq/atmosphere.js';
import { World, SX, SY, SZ, CS, CX, CY, CZ, SEA } from './world.js';
import { BLOCKS, CATS, ID } from './defs.js';
import { meshChunk, blockMaterial } from './mesher.js';
import { Studio } from '../make/studio.js';
import { Game } from '../state.js';
import { AIService } from '../ai.js';
import { loadBlueprints, saveBlueprints, blueprintToMake, b64, unb64 } from './blueprint.js';
import { loadMakes, saveMakes } from '../make/model.js';

const S = 0.25;                 // 一格方块 = 0.25 个世界单位（和六边形岛的镜头尺度一致）
const MODE_KEY = 'yujian_mode';
const UNDO_MAX = 100;
const TOOLS = [['look', '浏览'], ['build', '建造'], ['replace', '替换'], ['select', '框选']];
const HOT0 = ['grass', 'oakPlank', 'stoneBrick', 'roofRed', 'glass', 'oakLog', 'oakLeaves', 'lantern', 'clothWhite'];

export class BlockApp {
  constructor() {
    this.canvas = document.getElementById('stage'); this.ui = document.getElementById('ui');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pr = Math.min(devicePixelRatio || 1, 2); r.setPixelRatio(this.pr);
    this.scene = new THREE.Scene();
    this.atmo = new Atmosphere(r, this.scene); this.atmo.sun.shadow.mapSize.set(2048, 2048); this.atmo.apply(presetAt(15), null, null);
    this.root = new THREE.Group(); this.root.scale.setScalar(S); this.scene.add(this.root);
    this.mat = blockMaterial(); this.matClear = blockMaterial({ transparent: true });
    // 海：一整片水面（岛内低于海平面的地方透过水面看得到海底）
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x2a86a0, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.86, depthWrite: false, envMapIntensity: 0.35 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(SX * S / 2, (SEA - 0.12) * S, SZ * S / 2); sea.renderOrder = 2; this.scene.add(sea); this.sea = sea;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x7a9a8a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.2 * S; this.scene.add(floor); this.floor = floor;
    // 幽灵方块：按下时的落点预览
    this.ghost = new THREE.Group();
    this.ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }));
    this.ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.03, 1.03, 1.03)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.ghost.add(this.ghostBox, this.ghostEdge); this.ghost.visible = false; this.root.add(this.ghost);
    this.selMesh = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x8fd0ff, depthTest: false, transparent: true })); this.selMesh.renderOrder = 9; this.selMesh.visible = false; this.root.add(this.selMesh);

    this.world = new World(); this.chunks = new Map();
    this.tool = 'look'; this.hot = HOT0.map((k) => ID[k]); this.slot = 1; this.cur = this.hot[1]; this.cat = 'wood'; this.cut = SY; this.undoStack = []; this.redoStack = []; this.pickOnce = false; this.sel = null; this.place = null;
    const rig = this.rig = new CameraRig(this.canvas, 1);
    rig.free = true; rig.maxDist = 70; rig.lookY = SEA * S;
    rig.bounds = { minX: 0, maxX: SX * S, minZ: 0, maxZ: SZ * S };
    rig.heightAt = (x, z) => this.world.top(Math.floor(x / S), Math.floor(z / S)) * S;
    // 拿着笔时单指交给建造（造物台打开时交给造物台）
    // AI：用六边形岛「设置 → AI」里配好的服务商和密钥
    try { const gm = new Game(); gm.load(); this.ai = new AIService(gm.s?.settings || {}); } catch { this.ai = new AIService({}); }
    this.studio = new Studio(this);
    rig.builder = { active: () => (this.studio.on ? !!this.studio.make && this.studio.tool !== 'look' : this.tool !== 'look'), down: (e) => (this.studio.on ? this.studio.down(e) : this._down(e)), move: (e) => (this.studio.on ? this.studio.move(e) : this._move(e)), up: (e, c) => (this.studio.on ? this.studio.up(e, c) : this._up(e, c)) };
    this._buildHUD();
    addEventListener('resize', () => this.resize()); this.resize();
    addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    this.fps = { n: 0, t: 0, v: 0, worst: 0, show: /[?&]debug=1/.test(location.search) };
    this.last = performance.now();
    this._init();
  }
  async _init() {
    const o = await this.world.load().catch(() => null);
    if (!o) this.world.genNatural(7);
    this.rebuild(Infinity);
    if (Array.isArray(o?.hot) && o.hot.length === 9) { this.hot = o.hot.map((x) => (BLOCKS[x] ? x : ID.grass)); this.cur = this.hot[this.slot]; this._renderHot(); }
    const c = o?.cam; this.rig.focus.set(c?.x ?? SX * S / 2, 0, c?.z ?? SZ * S / 2); this.rig.setView({ dist: c?.dist ?? 26, pitch: c?.pitch ?? 0.78, yaw: c?.yaw ?? -0.6 });
    this.ready = true; this.hint('点下面的方块开始建造；双指转动、缩放镜头', 3200);
    try { if (localStorage.getItem('yujian_open_studio') === '1') { localStorage.removeItem('yujian_open_studio'); this.studio.open(); } } catch { /* */ }   // 从六边形岛点「造物台」进来的
    requestAnimationFrame((t) => this.loop(t));
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.rig.cam.aspect = w / h; this.rig.cam.updateProjectionMatrix(); this.rig.portrait = h > w;
  }

  // ---------------- 网格 ----------------
  /** 重建脏分块；budget 毫秒用完就留到下一帧 */
  rebuild(budget = 8) {
    const t0 = performance.now();
    for (const k of this.world.dirty) {
      if (performance.now() - t0 > budget) break;
      this.world.dirty.delete(k);
      const [cx, cy, cz] = k.split(',').map(Number), old = this.chunks.get(k);
      if (old) for (const m of [old.solid, old.clear]) if (m) { this.root.remove(m); m.geometry.dispose(); }
      const { solid, clear } = meshChunk(this.world, cx, cy, cz), rec = {};
      if (solid) { rec.solid = new THREE.Mesh(solid, this.mat); rec.solid.castShadow = rec.solid.receiveShadow = true; this.root.add(rec.solid); }
      if (clear) { rec.clear = new THREE.Mesh(clear, this.matClear); rec.clear.receiveShadow = true; rec.clear.renderOrder = 3; this.root.add(rec.clear); }
      if (solid || clear) this.chunks.set(k, rec); else this.chunks.delete(k);
    }
  }

  // ---------------- 拾取 ----------------
  /** 屏幕点 → 方块：沿视线一格一格走（DDA），返回第一块看得见的方块和打中的面；打空时落到海面上 */
  pick(cx, cy) {
    const ray = this.rig.ray(cx, cy).ray, o = ray.origin.clone().multiplyScalar(1 / S), d = ray.direction;
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tx = d.x ? Math.abs(1 / d.x) : Infinity, ty = d.y ? Math.abs(1 / d.y) : Infinity, tz = d.z ? Math.abs(1 / d.z) : Infinity;
    let mx = d.x ? ((sx > 0 ? x + 1 - o.x : o.x - x) * tx) : Infinity, my = d.y ? ((sy > 0 ? y + 1 - o.y : o.y - y) * ty) : Infinity, mz = d.z ? ((sz > 0 ? z + 1 - o.z : o.z - z) * tz) : Infinity;
    let n = [0, 0, 0];
    for (let i = 0; i < 700; i++) {
      if (y >= 0 && y < this.cut && this.world.in(x, y, z)) { const b = this.world.get(x, y, z); if (b && !BLOCKS[b].water) return { x, y, z, n, b }; }
      if (y < 0 && sy < 0) break;
      if (mx < my && mx < mz) { x += sx; mx += tx; n = [-sx, 0, 0]; } else if (my < mz) { y += sy; my += ty; n = [0, -sy, 0]; } else { z += sz; mz += tz; n = [0, 0, -sz]; }
    }
    // 打空：落到海面（只在岛的范围内能放）
    if (d.y < -0.01) { const t = (SEA - o.y) / d.y, px = Math.floor(o.x + d.x * t), pz = Math.floor(o.z + d.z * t); if (this.world.in(px, SEA, pz)) return { x: px, y: SEA - 1, z: pz, n: [0, 1, 0], b: 0, sea: true }; }
    return null;
  }
  /** 视线和水平面 y 的交点所在的格子 */
  planeCell(cx, cy, y) { const ray = this.rig.ray(cx, cy).ray, o = ray.origin.clone().multiplyScalar(1 / S), d = ray.direction; if (Math.abs(d.y) < 1e-4) return null; const t = (y - o.y) / d.y; if (t < 0) return null; return [Math.floor(o.x + d.x * t), Math.floor(o.z + d.z * t)]; }

  // ---------------- 建造（参考方块沙盒游戏手机版：点一下放，按住拆，划动连续摆） ----------------
  _target(h, breaking) {
    if (!h) return null;
    if (this.tool === 'build' && !breaking && !this.pickOnce) return [h.x + h.n[0], h.y + h.n[1], h.z + h.n[2]];
    return h.sea ? null : [h.x, h.y, h.z];
  }
  _showGhost(c, kind = 'place') {
    if (!c || c[1] >= this.cut) { this.ghost.visible = false; return; }
    this.ghost.visible = true; this.ghost.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5); this.ghost.scale.setScalar(1);
    const col = kind === 'break' ? 0xff6a5a : kind === 'pick' ? 0xffe08a : kind === 'sel' ? 0x8fd0ff : 0xffffff; this.ghostBox.material.color.setHex(col); this.ghostEdge.material.color.setHex(col);
  }
  _apply(c, op, mode) {
    if (!c || !this.world.in(c[0], c[1], c[2]) || c[1] >= this.cut) return;
    const [x, y, z] = c, old = this.world.get(x, y, z);
    let nb = old;
    if (mode === 'place') { if (old && !BLOCKS[old].water) return; nb = this.cur; }
    else if (mode === 'break') { if (!old) return; nb = 0; }
    else if (mode === 'replace') { if (!old || old === this.cur) return; nb = this.cur; }
    if (nb === old) return;
    this.world.set(x, y, z, nb); op.push([x, y, z, old, nb]);
  }
  _down(e) {
    if (this.place) return this.placeDown(e);
    const h = this.pick(e.clientX, e.clientY);
    this.stroke = { x0: e.clientX, y0: e.clientY, moved: false, op: [], last: null, layer: null, hit: h, breaking: false };
    const kind = this.pickOnce ? 'pick' : this.tool === 'select' ? 'sel' : this.tool === 'replace' ? 'pick' : 'place';
    this._showGhost(this._target(h), kind);
    clearTimeout(this._lp);
    // 按住不动 = 拆（之后划过的方块都拆掉）
    if (this.tool === 'build' && !this.pickOnce) this._lp = setTimeout(() => { const st = this.stroke; if (!st || st.moved) return; st.breaking = true; const hh = this.pick(st.x0, st.y0); this._apply(this._target(hh, true), st.op, 'break'); navigator.vibrate?.(12); this._showGhost(this._target(this.pick(st.x0, st.y0), true), 'break'); }, 380);
  }
  _move(e) {
    const st = this.stroke; if (!st) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 10) { this._showGhost(this._target(this.pick(e.clientX, e.clientY), st.breaking), st.breaking ? 'break' : 'place'); return; }
    if (!st.moved) { st.moved = true; if (!st.breaking) clearTimeout(this._lp); }
    if (this.pickOnce || this.tool === 'select') return;
    if (st.breaking) { const c = this._target(this.pick(e.clientX, e.clientY), true); this._apply(c, st.op, 'break'); this._showGhost(this._target(this.pick(e.clientX, e.clientY), true), 'break'); return; }
    if (this.tool === 'build') {
      // 连续摆：锁在起手那一层，沿手指划过的格子一格格铺
      if (st.layer == null) { const c = this._target(st.hit); if (!c) return; st.layer = c[1]; this._apply(c, st.op, 'place'); st.last = [c[0], c[2]]; }
      const pc = this.planeCell(e.clientX, e.clientY, st.layer); if (!pc) return;
      const [ax, az] = st.last, [bx, bz] = pc, n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let i = 1; i <= n; i++) this._apply([Math.round(ax + (bx - ax) * i / n), st.layer, Math.round(az + (bz - az) * i / n)], st.op, 'place');
      st.last = pc; this._showGhost([pc[0], st.layer, pc[1]]);
    } else if (this.tool === 'replace') { const c = this._target(this.pick(e.clientX, e.clientY)); this._apply(c, st.op, 'replace'); }
  }
  _up(e, cancel) {
    if (this.place) return this.placeUp(e, cancel);
    clearTimeout(this._lp); const st = this.stroke; this.stroke = null; this.ghost.visible = false;
    if (!st) return;
    if (!st.moved && !st.breaking && !cancel && e) {
      // 抬起才落子：用抬起时手指下的格子（按着时可以滑动修正）
      const h = this.pick(e.clientX, e.clientY);
      if (this.pickOnce) { this.pickOnce = false; this._syncPick(); if (h?.b) { this.pickBlock(h.b); this.hint('选取了「' + BLOCKS[h.b].name + '」', 1200); } return; }
      if (this.tool === 'select') { if (h && !h.sea) this.selCorner([h.x, h.y, h.z]); return; }
      this._apply(this._target(h), st.op, this.tool === 'replace' ? 'replace' : 'place');
    }
    this._commit(st.op);
  }
  _commit(op) { if (op.length) { this.undoStack.push(op); if (this.undoStack.length > UNDO_MAX) this.undoStack.shift(); this.redoStack.length = 0; this._dirty(); } }

  // ---------------- 快捷栏 ----------------
  /** 选取方块：快捷栏里有就选中那一格，没有就换掉当前这一格 */
  pickBlock(id) { const i = this.hot.indexOf(id); if (i >= 0) this.slot = i; else this.hot[this.slot] = id; this.cur = this.hot[this.slot]; this._renderHot(); if (this.tool === 'look') this.setTool('build'); this._dirty(); }
  _syncPick() { this.hud.querySelector('[data-a="pickOnce"]').classList.toggle('on', !!this.pickOnce); }

  // ---------------- 框选与蓝图（参考结构方块：框一块存起来，放的时候先出轮廓，能转向、镜像） ----------------
  selCorner(c) {
    if (!this.sel || this.sel.done) this.sel = { a: c, b: c, done: false };
    else { this.sel.b = c; this.sel.done = true; }
    this._syncSel();
  }
  _selBox() { const { a, b } = this.sel; return { lo: [0, 1, 2].map((i) => Math.min(a[i], b[i])), hi: [0, 1, 2].map((i) => Math.max(a[i], b[i])) }; }
  _syncSel() {
    const panel = this.hud.querySelector('.b-selp');
    if (!this.sel) { this.selMesh.visible = false; panel.hidden = true; return; }
    const { lo, hi } = this._selBox(), sz = [0, 1, 2].map((i) => hi[i] - lo[i] + 1);
    this.selMesh.visible = true; this.selMesh.position.set(lo[0] + sz[0] / 2, lo[1] + sz[1] / 2, lo[2] + sz[2] / 2); this.selMesh.scale.set(sz[0] + 0.06, sz[1] + 0.06, sz[2] + 0.06);
    panel.hidden = !this.sel.done; panel.querySelector('.b-selsz').textContent = sz.join(' × ') + (sz.some((v) => v > 48) ? '（蓝图最大 48）' : '');
    if (!this.sel.done) this.hint('再点一个方块，框出范围', 1400);
  }
  selGrow(dy) { if (!this.sel?.done) return; const b = this.sel.a[1] >= this.sel.b[1] ? this.sel.a : this.sel.b; b[1] = Math.max(Math.min(this.sel.a[1], this.sel.b[1]), Math.min(SY - 1, b[1] + dy)); this._syncSel(); }
  /** 框里的方块 → { size, data } */
  _grab() { const { lo, hi } = this._selBox(), size = [0, 1, 2].map((i) => hi[i] - lo[i] + 1), data = new Uint8Array(size[0] * size[1] * size[2]); let k = 0; for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) for (let x = 0; x < size[0]; x++) data[k++] = this.world.get(lo[0] + x, lo[1] + y, lo[2] + z); return { size, data }; }
  selFill(id) { if (!this.sel?.done) return; const { lo, hi } = this._selBox(), op = []; for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) { const old = this.world.get(x, y, z); if (old !== id) { this.world.set(x, y, z, id); op.push([x, y, z, old, id]); } } this._commit(op); }
  saveBlueprint(toIsland) {
    if (!this.sel?.done) return;
    const g = this._grab(); if (g.size.some((v) => v > 48)) { this.hint('蓝图最大 48 × 48 × 48', 2000); return; }
    if (!g.data.some((v) => v)) { this.hint('框里没有方块', 1600); return; }
    const name = (prompt('给这个蓝图起个名字', '我的建筑') || '').trim().slice(0, 10); if (!name) return;
    const bp = { id: 'bp' + Date.now().toString(36), name, size: g.size, data: b64(g.data) }, list = loadBlueprints(); list.unshift(bp);
    if (!saveBlueprints(list)) { this.hint('保存失败：本机存储空间不够', 2400); return; }
    if (toIsland) { const mk = blueprintToMake(name, g), all = loadMakes(); all.unshift(mk); saveMakes(all); }
    this.sel = null; this._syncSel(); this.hint(`蓝图「${name}」已保存${toIsland ? '，回到六边形岛建造栏「✦ 我造的」里可以直接摆' : ''}`, 3000);
  }
  /** 开始放一个蓝图：先显示轮廓，点地面定位置，可以转向、镜像，确认后才生成 */
  startPlace(bp) {
    const data = typeof bp.data === 'string' ? unb64(bp.data) : bp.data;
    this.place = { bp: { ...bp, data }, rot: 0, mirror: false, at: null }; this.sel = null; this._syncSel(); this._menu(false); this._rebuildPreview();
    this.hud.querySelector('.b-placep').hidden = false; this.hint('点地面放到那里，满意了点「放下」', 2400);
    if (this.tool === 'look') this.setTool('build');
  }
  /** 按旋转、镜像变换后的蓝图格子 */
  _placed() {
    const P = this.place, [w, h, d] = P.bp.size, out = [], rw = P.rot % 2 ? d : w, rd = P.rot % 2 ? w : d;
    let k = 0;
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const id = P.bp.data[k++]; if (!id) continue;
      let px = P.mirror ? w - 1 - x : x, pz = z;
      for (let r = 0; r < P.rot; r++) { const t = px; px = (r % 2 ? w : d) - 1 - pz; pz = t; }
      out.push([px, y, pz, id]);
    }
    return { cells: out, size: [rw, h, rd] };
  }
  _rebuildPreview() {
    if (this.prev) { this.root.remove(this.prev); this.prev.geometry.dispose(); this.prev = null; }
    const { cells } = this._placed(), geo = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, depthWrite: false }), Math.max(1, cells.length)), m = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach(([x, y, z, id], i) => { im.setMatrixAt(i, m.makeTranslation(x + 0.5, y + 0.5, z + 0.5)); im.setColorAt(i, col.set(BLOCKS[id].side.c)); });
    im.count = cells.length; im.frustumCulled = false; this.prev = im; this.root.add(im); this._movePreview();
  }
  _movePreview() { const P = this.place; if (!P || !this.prev) return; const at = P.at || this._defaultAt(); this.prev.position.set(at[0], at[1], at[2]); }
  _defaultAt() { const f = this.rig.focus, x = Math.floor(f.x / S), z = Math.floor(f.z / S); return [x, this.world.top(x, z), z]; }
  placeDown(e) { this.stroke = { x0: e.clientX, y0: e.clientY, moved: false }; }
  placeUp(e, cancel) { const st = this.stroke; this.stroke = null; if (!st || cancel || !e) return; const h = this.pick(e.clientX, e.clientY); if (!h) return; const { size } = this._placed(); this.place.at = [h.x - Math.floor(size[0] / 2), h.y + 1, h.z - Math.floor(size[2] / 2)]; this._movePreview(); }
  placeRot() { this.place.rot = (this.place.rot + 1) % 4; this._rebuildPreview(); }
  placeMirror() { this.place.mirror = !this.place.mirror; this._rebuildPreview(); }
  placeCommit() {
    const at = this.place.at || this._defaultAt(), op = [];
    for (const [x, y, z, id] of this._placed().cells) { const X = at[0] + x, Y = at[1] + y, Z = at[2] + z; if (!this.world.in(X, Y, Z)) continue; const old = this.world.get(X, Y, Z); if (old !== id) { this.world.set(X, Y, Z, id); op.push([X, Y, Z, old, id]); } }
    this._commit(op); this.placeCancel(); this.hint(`放下了 ${op.length} 个方块`, 1600);
  }
  placeCancel() { this.place = null; if (this.prev) { this.root.remove(this.prev); this.prev.geometry.dispose(); this.prev = null; } this.hud.querySelector('.b-placep').hidden = true; }
  undo() { const op = this.undoStack.pop(); if (!op) return; for (let i = op.length - 1; i >= 0; i--) { const [x, y, z, o] = op[i]; this.world.set(x, y, z, o); } this.redoStack.push(op); this._dirty(); }
  redo() { const op = this.redoStack.pop(); if (!op) return; for (const [x, y, z, , n] of op) this.world.set(x, y, z, n); this.undoStack.push(op); this._dirty(); }
  _dirty() { clearTimeout(this._sv); this._sv = setTimeout(() => this.save(), 2000); this._syncUndo(); }
  save() { const r = this.rig; return this.world.save({ hot: this.hot, cam: { x: r.focus.x, z: r.focus.z, dist: r.target.dist, pitch: r.target.pitch, yaw: r.target.yaw } }); }

  // ---------------- 界面 ----------------
  setTool(t) { this.tool = t; this.hud.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); if (t !== 'select' && this.sel) { this.sel = null; this._syncSel(); } if (t === 'select') this.hint('点一个方块定第一个角，再点一个定对角', 2200); }
  /** 背包里点一种方块：放进快捷栏当前这一格（参考创造模式物品栏的做法） */
  setBlock(id) { this.hot[this.slot] = id; this.cur = id; this._renderHot(); this._renderBar(); if (this.tool === 'look') this.setTool('build'); this._dirty(); }
  setCut(v) { this.cut = v; this.mat.userData.uCut.value = this.matClear.userData.uCut.value = v >= SY ? 999 : v; this.hud.querySelector('.b-cutv').textContent = v >= SY ? '关' : '第 ' + v + ' 层'; }
  hint(t, ms = 1600) { const h = this.hud.querySelector('.b-hint'); h.textContent = t; h.hidden = false; clearTimeout(this._ht); this._ht = setTimeout(() => { h.hidden = true; }, ms); }
  _icon(id) {
    if (!this._icons) this._icons = new Map(); if (this._icons.has(id)) return this._icons.get(id);
    const b = BLOCKS[id], c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const shade = (hex, k) => { const col = new THREE.Color(hex); col.multiplyScalar(k); return '#' + col.getHexString(); };
    const P = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
    if (b.glass || b.water) g.globalAlpha = 0.75;
    P([[32, 6], [58, 19], [32, 32], [6, 19]], b.top.c); P([[6, 19], [32, 32], [32, 60], [6, 47]], shade(b.side.c, 0.82)); P([[58, 19], [32, 32], [32, 60], [58, 47]], shade(b.side.c, 0.66));
    if (b.key === 'grass') { P([[6, 19], [32, 32], [32, 38], [6, 25]], shade(b.top.c, 0.82)); P([[58, 19], [32, 32], [32, 38], [58, 25]], shade(b.top.c, 0.66)); }
    if (b.glow) { g.globalAlpha = 0.35; g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill(); }
    const url = c.toDataURL(); this._icons.set(id, url); return url;
  }
  _buildHUD() {
    const h = this.hud = document.createElement('div'); h.className = 'bhud';
    h.innerHTML = `
      <div class="b-tl"><button class="b-btn" data-a="menu">屿</button><span class="b-title">方块岛 · 试玩</span><button class="b-pill b-make" data-a="studio">造物台</button></div>
      <div class="b-tools">${TOOLS.map(([k, n]) => `<button class="b-pill ${k === this.tool ? 'on' : ''}" data-tool="${k}">${n}</button>`).join('')}
        <div class="b-gap"></div><button class="b-pill" data-a="undo">撤销</button><button class="b-pill" data-a="redo">重做</button></div>
      <div class="b-cut"><span>剖切</span><input type="range" min="${SEA - 2}" max="${SY}" value="${SY}" step="1" class="b-cutr" aria-label="剖切高度"><b class="b-cutv">关</b></div>
      <div class="b-hot"><div class="b-slots"></div><button class="b-pill" data-a="pickOnce" title="点一下，再点场景里的方块，把它拿到快捷栏">选取</button><button class="b-pill" data-a="bag">背包</button></div>
      <div class="b-bar" hidden><div class="b-bagh"><input class="b-search" placeholder="搜索方块" aria-label="搜索方块"><button class="b-x" data-a="bagClose">收起</button></div><div class="b-cats"></div><div class="b-items"></div></div>
      <div class="b-selp b-panel" hidden><b class="b-selsz"></b><button class="b-pill" data-a="selUp">加高</button><button class="b-pill" data-a="selDown">降低</button><button class="b-pill" data-a="selFill">用当前方块填满</button><button class="b-pill" data-a="selClear">清空</button><button class="b-pill" data-a="selSave">存为蓝图</button><button class="b-pill b-make" data-a="selSaveIsland">存蓝图并带回六边形岛</button><button class="b-pill" data-a="selCancel">取消</button></div>
      <div class="b-placep b-panel" hidden><b>放蓝图</b><button class="b-pill" data-a="pRot">转向</button><button class="b-pill" data-a="pMirror">镜像</button><button class="b-pill b-make" data-a="pOk">放下</button><button class="b-pill" data-a="pCancel">取消</button></div>
      <div class="b-hint" hidden></div><div class="b-fps" hidden></div><div class="b-menu" hidden></div>`;
    this.ui.appendChild(h);
    h.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      if (b.dataset.tool) return this.setTool(b.dataset.tool);
      if (b.dataset.cat) { this.cat = b.dataset.cat; return this._renderBar(); }
      if (b.dataset.block) return this.setBlock(+b.dataset.block);
      if (b.dataset.slot != null) { this.slot = +b.dataset.slot; this.cur = this.hot[this.slot]; this._renderHot(); if (this.tool === 'look') this.setTool('build'); return; }
      if (b.dataset.bp) { const bp = loadBlueprints().find((x) => x.id === b.dataset.bp); if (bp) this.startPlace(bp); return; }
      if (b.dataset.bpdel) { if (confirm('删除这个蓝图？')) { saveBlueprints(loadBlueprints().filter((x) => x.id !== b.dataset.bpdel)); this._menu(true); } return; }
      const a = b.dataset.a;
      if (a === 'undo') this.undo(); else if (a === 'redo') this.redo(); else if (a === 'menu') this._menu(true);
      else if (a === 'close') this._menu(false);
      else if (a === 'bag') { const bar = h.querySelector('.b-bar'); bar.hidden = !bar.hidden; this._renderBar(); }
      else if (a === 'bagClose') h.querySelector('.b-bar').hidden = true;
      else if (a === 'pickOnce') { this.pickOnce = !this.pickOnce; this._syncPick(); if (this.pickOnce) { if (this.tool === 'look') this.setTool('build'); this.hint('点场景里的一个方块，把它拿到快捷栏', 1800); } }
      else if (a === 'selUp') this.selGrow(1); else if (a === 'selDown') this.selGrow(-1);
      else if (a === 'selFill') this.selFill(this.cur); else if (a === 'selClear') this.selFill(0);
      else if (a === 'selSave') this.saveBlueprint(false); else if (a === 'selSaveIsland') this.saveBlueprint(true);
      else if (a === 'selCancel') { this.sel = null; this._syncSel(); }
      else if (a === 'pRot') this.placeRot(); else if (a === 'pMirror') this.placeMirror(); else if (a === 'pOk') this.placeCommit(); else if (a === 'pCancel') this.placeCancel();
      else if (a === 'blueprints') this._menu('bp');
      else if (a === 'studio') { this._menu(false); this.studio.open(); }
      else if (a === 'newNatural' || a === 'newFlat') { if (!confirm('新建一座岛会替换现在这座，确定吗？')) return; a === 'newNatural' ? this.world.genNatural(1 + Math.floor(Math.random() * 999)) : this.world.genFlat(); this.undoStack = []; this.redoStack = []; this._menu(false); this._dirty(); }
      else if (a === 'fps') { this.fps.show = !this.fps.show; h.querySelector('.b-fps').hidden = !this.fps.show; this._menu(false); }
      else if (a === 'back') this.goIsland();
    });
    for (const ev of ['pointerdown', 'wheel']) h.addEventListener(ev, (e) => { if (e.target.closest('button,input,.b-bar,.b-menu,.b-panel,.b-hot')) e.stopPropagation(); });
    h.querySelector('.b-search').addEventListener('input', () => this._renderBar());
    h.querySelector('.b-cutr').addEventListener('input', (e) => this.setCut(+e.target.value));
    this._renderBar(); this._renderHot(); this._syncUndo();
    h.querySelector('.b-fps').hidden = !/[?&]debug=1/.test(location.search);
  }
  _renderHot() { this.hud.querySelector('.b-slots').innerHTML = this.hot.map((id, i) => `<button class="b-slot ${i === this.slot ? 'on' : ''}" data-slot="${i}" title="${BLOCKS[id].name}"><img src="${this._icon(id)}" alt=""><i>${i + 1}</i></button>`).join(''); }
  _renderBar() {
    const h = this.hud, q = h.querySelector('.b-search')?.value.trim() || '', cats = [{ id: 'all', name: '全部' }, ...CATS];
    h.querySelector('.b-cats').innerHTML = cats.map((c) => `<button class="b-cat ${c.id === this.cat ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('');
    const ids = BLOCKS.filter((b) => b && (q ? b.name.includes(q) : this.cat === 'all' || b.cat === this.cat)).map((b) => b.id);
    h.querySelector('.b-items').innerHTML = ids.map((id) => `<button class="b-item ${id === this.cur ? 'on' : ''}" data-block="${id}" title="${BLOCKS[id].name}"><img src="${this._icon(id)}" alt=""><i>${BLOCKS[id].name}</i></button>`).join('');
  }
  /** 回到六边形岛（方块岛自动保存） */
  goIsland() { this.save().finally(() => { try { localStorage.setItem(MODE_KEY, 'island'); } catch { /* */ } location.reload(); }); }
  _syncUndo() { this.hud.querySelector('[data-a="undo"]').disabled = !this.undoStack.length; this.hud.querySelector('[data-a="redo"]').disabled = !this.redoStack.length; }
  _menu(on) {
    const m = this.hud.querySelector('.b-menu'); m.hidden = !on; if (!on) return;
    if (on === 'bp') { const list = loadBlueprints(); m.innerHTML = `<div class="b-card"><header><b>蓝图（${list.length}）</b><button class="b-x" data-a="close">关闭</button></header>${list.map((bp) => `<div class="s-lib"><button class="b-row" data-bp="${bp.id}"><b>${bp.name}</b><span>${bp.size.join(' × ')} · 点了放到岛上</span></button><button class="b-x" data-bpdel="${bp.id}">删除</button></div>`).join('') || '<p class="b-note">还没有蓝图。用「框选」框出一座建筑，点「存为蓝图」。</p>'}</div>`; return; }
    m.innerHTML = `<div class="b-card"><header><b>方块岛</b><button class="b-x" data-a="close">关闭</button></header>
      <button class="b-row" data-a="blueprints"><b>蓝图</b><span>框选保存的建筑：转向、镜像后放下</span></button>
      <button class="b-row" data-a="studio"><b>造物台</b><span>自由造动物、植物、建筑摆件，保存后带回六边形岛</span></button>
      <button class="b-row" data-a="newNatural"><b>新建自然岛</b><span>沙滩、草地、丘陵、岩山和树</span></button>
      <button class="b-row" data-a="newFlat"><b>新建平坦岛</b><span>一整块草地平台，适合纯建造</span></button>
      <button class="b-row" data-a="fps"><b>${this.fps.show ? '隐藏' : '显示'}帧率</b><span>测速用：帧率、最低帧、三角形、绘制次数</span></button>
      <button class="b-row" data-a="back"><b>回到六边形岛</b><span>方块岛会自动保存</span></button>
      <p class="b-note">操作：选「建造」后，点一下放方块，按住拆方块，划动连续摆一排；「选取」再点场景里的方块，把它拿到快捷栏；「背包」里有全部方块，可以搜索。「框选」框出建筑存成蓝图，也能带回六边形岛。</p></div>`;
  }

  // ---------------- 主循环 ----------------
  loop(t) {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.rig.update(dt);
    if (this.studio.on) this.studio.update(dt, now / 1000);
    if (this.world.dirty.size) this.rebuild(6);
    const f = this.rig.focus; this.atmo.follow(f.x, f.z, Math.min(26, Math.max(6, this.rig.dist * 0.75)));
    const ri = this.renderer.info; ri.autoReset = false; ri.reset();
    this.renderer.render(this.scene, this.rig.cam);
    // 帧率统计（1 秒一更新）+ 简单的动态分辨率：持续低于 26 帧就降一点像素比，高于 50 帧再升回去
    const F = this.fps; F.n++; F.t += dt; F.worst = Math.max(F.worst, dt);
    if (F.t >= 1) {
      F.v = F.n / F.t;
      if (F.v < 26 && this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); }
      else if (F.v > 50 && this.pr < Math.min(devicePixelRatio || 1, 2)) { this.pr = Math.min(devicePixelRatio || 1, 2, this.pr + 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); }
      if (F.show) this.hud.querySelector('.b-fps').textContent = `${F.v.toFixed(0)} 帧 · 最慢 ${(F.worst * 1000).toFixed(0)}ms · ${(ri.render.triangles / 1000).toFixed(0)}k 面 · ${ri.render.calls} 次绘制 · 像素比 ${this.pr.toFixed(2)} · ${this.chunks.size} 块`;
      F.n = 0; F.t = 0; F.worst = 0;
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }
}

/** 入口：存的模式是方块岛（或网址带 ?mode=blocks）时启动方块岛 */
export function wantBlocks() { if (/[?&]mode=blocks/.test(location.search)) return true; if (/[?&]mode=island/.test(location.search)) return false; try { return localStorage.getItem(MODE_KEY) === 'blocks'; } catch { return false; } }
export function enterBlocks() { try { localStorage.setItem(MODE_KEY, 'blocks'); } catch { /* */ } location.reload(); }
