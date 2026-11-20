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

const S = 0.25;                 // 一格方块 = 0.25 个世界单位（和六边形岛的镜头尺度一致）
const MODE_KEY = 'yujian_mode';
const UNDO_MAX = 100;
const TOOLS = [['look', '浏览'], ['place', '放置'], ['remove', '拆除'], ['pick', '吸管'], ['replace', '替换']];

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

    this.world = new World(); this.chunks = new Map();
    this.tool = 'look'; this.cur = ID.oakPlank; this.cat = 'wood'; this.cut = SY; this.undoStack = []; this.redoStack = []; this.recent = [];
    const rig = this.rig = new CameraRig(this.canvas, 1);
    rig.free = true; rig.maxDist = 70; rig.lookY = SEA * S;
    rig.bounds = { minX: 0, maxX: SX * S, minZ: 0, maxZ: SZ * S };
    rig.heightAt = (x, z) => this.world.top(Math.floor(x / S), Math.floor(z / S)) * S;
    // 拿着笔时单指交给建造（造物台打开时交给造物台）
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
    const c = o?.cam; this.rig.focus.set(c?.x ?? SX * S / 2, 0, c?.z ?? SZ * S / 2); this.rig.setView({ dist: c?.dist ?? 26, pitch: c?.pitch ?? 0.78, yaw: c?.yaw ?? -0.6 });
    this.ready = true; this.hint('点下面的方块开始建造；双指转动、缩放镜头', 3200);
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

  // ---------------- 建造 ----------------
  _target(h) { if (!h) return null; return this.tool === 'place' ? [h.x + h.n[0], h.y + h.n[1], h.z + h.n[2]] : h.sea ? null : [h.x, h.y, h.z]; }
  _showGhost(c) {
    if (!c || c[1] >= this.cut) { this.ghost.visible = false; return; }
    this.ghost.visible = true; this.ghost.position.set(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5);
    const col = this.tool === 'remove' ? 0xff6a5a : this.tool === 'pick' ? 0xffe08a : 0xffffff; this.ghostBox.material.color.setHex(col); this.ghostEdge.material.color.setHex(col);
  }
  _apply(c, op) {
    if (!c || !this.world.in(c[0], c[1], c[2]) || c[1] >= this.cut) return;
    const [x, y, z] = c, old = this.world.get(x, y, z);
    let nb = old;
    if (this.tool === 'place') { if (old && !BLOCKS[old].water) return; nb = this.cur; }
    else if (this.tool === 'remove') { if (!old) return; nb = 0; }
    else if (this.tool === 'replace') { if (!old || old === this.cur) return; nb = this.cur; }
    if (nb === old) return;
    this.world.set(x, y, z, nb); op.push([x, y, z, old, nb]);
  }
  _down(e) {
    const h = this.pick(e.clientX, e.clientY), c = this._target(h);
    this.stroke = { x0: e.clientX, y0: e.clientY, moved: false, op: [], last: null, layer: null, hit: h };
    this._showGhost(c);
    clearTimeout(this._lp);
    this._lp = setTimeout(() => { const st = this.stroke; if (!st || st.moved) return; const hh = this.pick(st.x0, st.y0); if (hh?.b) { this.setBlock(hh.b); this.hint('吸取了「' + BLOCKS[hh.b].name + '」', 1200); navigator.vibrate?.(15); } st.cancel = true; this.ghost.visible = false; }, 480);
  }
  _move(e) {
    const st = this.stroke; if (!st || st.cancel) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 10) { this._showGhost(this._target(this.pick(e.clientX, e.clientY))); return; }
    if (!st.moved) { st.moved = true; clearTimeout(this._lp); if (this.tool === 'pick') return; }
    if (this.tool === 'pick') return;
    if (this.tool === 'place') {
      // 连续摆：锁在起手那一层，沿手指划过的格子一格格铺
      if (st.layer == null) { const c = this._target(st.hit); if (!c) return; st.layer = c[1]; this._apply(c, st.op); st.last = [c[0], c[2]]; }
      const pc = this.planeCell(e.clientX, e.clientY, st.layer); if (!pc) return;
      const [ax, az] = st.last, [bx, bz] = pc, n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let i = 1; i <= n; i++) this._apply([Math.round(ax + (bx - ax) * i / n), st.layer, Math.round(az + (bz - az) * i / n)], st.op);
      st.last = pc; this._showGhost([pc[0], st.layer, pc[1]]);
    } else {
      const h = this.pick(e.clientX, e.clientY), c = this._target(h); this._apply(c, st.op); this._showGhost(this._target(this.pick(e.clientX, e.clientY)));
    }
  }
  _up(e, cancel) {
    clearTimeout(this._lp); const st = this.stroke; this.stroke = null; this.ghost.visible = false;
    if (!st || st.cancel) return;
    if (!st.moved && !cancel && e) {
      // 抬起才落子：用抬起时手指下的格子（按着时可以滑动修正）
      const h = this.pick(e.clientX, e.clientY);
      if (this.tool === 'pick') { if (h?.b) { this.setBlock(h.b); this.setTool('place'); this.hint('吸取了「' + BLOCKS[h.b].name + '」', 1200); } return; }
      this._apply(this._target(h), st.op);
    }
    if (st.op.length) { this.undoStack.push(st.op); if (this.undoStack.length > UNDO_MAX) this.undoStack.shift(); this.redoStack.length = 0; this._dirty(); }
  }
  undo() { const op = this.undoStack.pop(); if (!op) return; for (let i = op.length - 1; i >= 0; i--) { const [x, y, z, o] = op[i]; this.world.set(x, y, z, o); } this.redoStack.push(op); this._dirty(); }
  redo() { const op = this.redoStack.pop(); if (!op) return; for (const [x, y, z, , n] of op) this.world.set(x, y, z, n); this.undoStack.push(op); this._dirty(); }
  _dirty() { clearTimeout(this._sv); this._sv = setTimeout(() => this.save(), 2000); this._syncUndo(); }
  save() { const r = this.rig; return this.world.save({ cam: { x: r.focus.x, z: r.focus.z, dist: r.target.dist, pitch: r.target.pitch, yaw: r.target.yaw } }); }

  // ---------------- 界面 ----------------
  setTool(t) { this.tool = t; this.hud.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); }
  setBlock(id) { this.cur = id; this.cat = BLOCKS[id].cat; this.recent = [id, ...this.recent.filter((x) => x !== id)].slice(0, 9); this._renderBar(); if (this.tool === 'look' || this.tool === 'pick') this.setTool('place'); }
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
      <div class="b-bar"><div class="b-cats"></div><div class="b-items"></div></div>
      <div class="b-hint" hidden></div><div class="b-fps" hidden></div><div class="b-menu" hidden></div>`;
    this.ui.appendChild(h);
    h.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      if (b.dataset.tool) return this.setTool(b.dataset.tool);
      if (b.dataset.cat) { this.cat = b.dataset.cat; return this._renderBar(); }
      if (b.dataset.block) return this.setBlock(+b.dataset.block);
      const a = b.dataset.a;
      if (a === 'undo') this.undo(); else if (a === 'redo') this.redo(); else if (a === 'menu') this._menu(true);
      else if (a === 'close') this._menu(false);
      else if (a === 'studio') { this._menu(false); this.studio.open(); }
      else if (a === 'newNatural' || a === 'newFlat') { if (!confirm('新建一座岛会替换现在这座，确定吗？')) return; a === 'newNatural' ? this.world.genNatural(1 + Math.floor(Math.random() * 999)) : this.world.genFlat(); this.undoStack = []; this.redoStack = []; this._menu(false); this._dirty(); }
      else if (a === 'fps') { this.fps.show = !this.fps.show; h.querySelector('.b-fps').hidden = !this.fps.show; this._menu(false); }
      else if (a === 'back') { this.save().finally(() => { try { localStorage.setItem(MODE_KEY, 'island'); } catch { /* */ } location.reload(); }); }
    });
    for (const ev of ['pointerdown', 'wheel']) h.addEventListener(ev, (e) => { if (e.target.closest('button,input,.b-bar,.b-menu')) e.stopPropagation(); });
    h.querySelector('.b-cutr').addEventListener('input', (e) => this.setCut(+e.target.value));
    this._renderBar(); this._syncUndo();
    h.querySelector('.b-fps').hidden = !/[?&]debug=1/.test(location.search);
  }
  _renderBar() {
    const h = this.hud, cats = [{ id: 'recent', name: '最近' }, ...CATS].filter((c) => c.id !== 'recent' || this.recent.length);
    h.querySelector('.b-cats').innerHTML = cats.map((c) => `<button class="b-cat ${c.id === this.cat ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('');
    const ids = this.cat === 'recent' ? this.recent : BLOCKS.filter((b) => b && b.cat === this.cat).map((b) => b.id);
    h.querySelector('.b-items').innerHTML = ids.map((id) => `<button class="b-item ${id === this.cur ? 'on' : ''}" data-block="${id}" title="${BLOCKS[id].name}"><img src="${this._icon(id)}" alt=""><i>${BLOCKS[id].name}</i></button>`).join('');
  }
  _syncUndo() { this.hud.querySelector('[data-a="undo"]').disabled = !this.undoStack.length; this.hud.querySelector('[data-a="redo"]').disabled = !this.redoStack.length; }
  _menu(on) {
    const m = this.hud.querySelector('.b-menu'); m.hidden = !on; if (!on) return;
    m.innerHTML = `<div class="b-card"><header><b>方块岛</b><button class="b-x" data-a="close">关闭</button></header>
      <button class="b-row" data-a="studio"><b>造物台</b><span>自由造动物、植物、建筑摆件，保存后带回六边形岛</span></button>
      <button class="b-row" data-a="newNatural"><b>新建自然岛</b><span>沙滩、草地、丘陵、岩山和树</span></button>
      <button class="b-row" data-a="newFlat"><b>新建平坦岛</b><span>一整块草地平台，适合纯建造</span></button>
      <button class="b-row" data-a="fps"><b>${this.fps.show ? '隐藏' : '显示'}帧率</b><span>测速用：帧率、最低帧、三角形、绘制次数</span></button>
      <button class="b-row" data-a="back"><b>回到六边形岛</b><span>方块岛会自动保存</span></button>
      <p class="b-note">这是第一阶段原型：30 种方块，放置、拆除、吸管、替换、连续摆放、剖切、撤销。后续加入框选、复制、对称、形状、AI 生成和蓝图。</p></div>`;
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
