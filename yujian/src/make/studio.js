// 造物台：在方块岛上自由造东西（动物、植物、建筑摆件……什么都行）。
// 操作：
//  - 选择：点一块选中；拖它身上的彩色手柄改大小（红 = 左右，绿 = 上下，蓝 = 前后），拖方块本身沿最贴近手指方向的轴移动；都按“吸附”步长对齐。
//  - 添加：点一块的某个面，在那个面外面接一块（和选中块一样大）；点台面，在台面上放一块。
//  - 上色：点或划过方块涂上当前颜色（“色组”开着时，同色的块自动交错几级深浅）。擦除：点或划过删掉。
//  - 长按任意方块：吸取它的颜色。左右对称（默认开）：在一边加、改、删，另一边跟着变。
//  - 部件：方块属于当前部件；每个部件有关节点和动作（走路摆、来回摆、扇动、旋转、浮动、随风摆、伸缩），点“播放”预览。
//  - 保存后进“我的造物”，回到六边形岛建造栏「✦ 我造的」里直接摆放。
import * as THREE from 'three';
import { sopHTML } from '../artsop.js';
import { boxGeo, buildMake, animatePart, newMake, TEMPLATES, USES, BEHAVIORS, MOTIONS, loadMakes, saveMakes, bounds } from './model.js';

const K = 0.05;                       // 1 小格在造物台上 = 0.05 个世界单位（放大了看，好操作）
const SWATCH = ['#ece5d6', '#f0e2c8', '#c9a07a', '#b0773f', '#8a5a30', '#4a3f38', '#1d1a1a', '#9aa0a8', '#6f747c', '#f4f6f8',
  '#4f8a3a', '#6fa846', '#2f6b45', '#a6cf55', '#d9452e', '#e8763a', '#f2c45a', '#f080a8', '#eea3bc', '#9e7ae6', '#7a6aa8', '#6fa8b8', '#4f8fb8', '#3f5f8a', '#8fc8b4', '#c4563a'];
const AX = ['x', 'y', 'z'];

export class Studio {
  constructor(app) {
    this.app = app; this.on = false; this.tool = 'select'; this.color = '#c9a07a'; this.shade = true; this.sym = true; this.snap = 1; this.play = false;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 0.8 });
    this.stage = new THREE.Group(); this.stage.visible = false; app.scene.add(this.stage);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(40, 42, 2, 48), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }));
    top.position.y = -1; top.receiveShadow = true; top.userData.stage = true; this.stage.add(top); this.top = top;
    const grid = new THREE.GridHelper(64, 32, 0xb9a682, 0xd6c7a6); grid.position.y = 0.02; this.stage.add(grid);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 4), new THREE.MeshBasicMaterial({ color: 0x5f8fc0 })); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.6, 36); this.stage.add(arrow);   // 箭头 = 造物的正面
    this.boxes = new THREE.Group(); this.stage.add(this.boxes);
    this.handles = new THREE.Group(); this.stage.add(this.handles);
    for (const [ax, s, c] of [[0, 1, 0xe0584a], [0, -1, 0xe0584a], [1, 1, 0x5fae4a], [1, -1, 0x5fae4a], [2, 1, 0x4f8fd8], [2, -1, 0x4f8fd8]]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 }));
      h.renderOrder = 10; h.userData.handle = { ax, s }; this.handles.add(h);
    }
    this.handles.visible = false;
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.selBox.renderOrder = 9; this.selBox.visible = false; this.stage.add(this.selBox);
    this.preview = null; this.undoS = []; this.redoS = []; this.sel = null; this.ray = new THREE.Raycaster();
  }

  // ---------------- 进出 ----------------
  /** 打开造物台；make 为空时显示“我的造物 / 新建”面板 */
  open(make = null) {
    const a = this.app, r = a.rig; this.on = true;
    this.saved = { focus: r.focus.clone(), dist: r.target.dist, pitch: r.target.pitch, yaw: r.target.yaw, minDist: r.minDist, maxDist: r.maxDist, lookY: r.lookY, bounds: r.bounds, heightAt: r.heightAt };
    a.root.visible = false; a.sea.visible = false; a.floor.visible = false; a.ghost.visible = false; a.hud.hidden = true;
    const c = this.center = new THREE.Vector3(24, a.world.top(96, 96) * 0.25 + 0.3, 24);
    this.stage.position.copy(c); this.stage.scale.setScalar(K); this.stage.visible = true;
    r.minDist = 0.35; r.maxDist = 8; r.lookY = c.y + 0.4; r.heightAt = () => c.y; r.bounds = { minX: c.x - 3, maxX: c.x + 3, minZ: c.z - 3, maxZ: c.z + 3 };
    r.focus.set(c.x, 0, c.z); r.setView({ dist: 2.6, pitch: 0.42, yaw: -0.65 });
    this._ui();
    if (make) this.edit(make); else this.library();
  }
  close() {
    const a = this.app, r = a.rig, s = this.saved; this.on = false; this._stopPlay();
    a.root.visible = true; a.sea.visible = true; a.floor.visible = true; a.hud.hidden = false; this.stage.visible = false; this.el?.remove(); this.el = null;
    Object.assign(r, { minDist: s.minDist, maxDist: s.maxDist, lookY: s.lookY, bounds: s.bounds, heightAt: s.heightAt }); r.focus.copy(s.focus); r.setView({ dist: s.dist, pitch: s.pitch, yaw: s.yaw });
  }
  edit(make) {
    this.make = JSON.parse(JSON.stringify(make)); this.cur = 0; this.sel = null; this.undoS = []; this.redoS = [];
    let k = 1; for (const p of this.make.parts) for (const b of p.boxes) b.k ??= k++; this.nextK = k + 100;
    for (const p of this.make.parts) for (const b of p.boxes) if (b.pair == null) { const m = this._findMirror(b, p); if (m) { b.pair = m.k; m.pair = b.k; } }
    this.el.querySelector('.s-name').value = this.make.name || '新造物';
    this._rebuild(); this._sheet(null); this._sync();
    // 镜头框住整个造物：看向它的中心，距离按最大边长算
    const bb = bounds(this.make), sz = Math.max(8, bb.max.y - Math.min(0, bb.min.y), bb.max.x - bb.min.x, bb.max.z - bb.min.z); this.app.rig.lookY = this.center.y + Math.max(4, (bb.max.y + Math.max(0, bb.min.y)) / 2) * K; this.app.rig.setView({ dist: Math.max(2.2, sz * K * 3.6), pitch: 0.38 });
  }
  _findMirror(b, p) { if (Math.abs(b.p[0]) < 0.01) return null; return p.boxes.find((o) => o !== b && o.pair == null && Math.abs(o.p[0] + b.p[0]) < 0.01 && Math.abs(o.p[1] - b.p[1]) < 0.01 && Math.abs(o.p[2] - b.p[2]) < 0.01 && o.s.every((v, i) => Math.abs(v - b.s[i]) < 0.01)); }

  // ---------------- 显示 ----------------
  _rebuild() {
    for (const m of [...this.boxes.children]) { this.boxes.remove(m); m.geometry.dispose(); }
    this.make.parts.forEach((p, pi) => p.boxes.forEach((b, bi) => {
      const m = new THREE.Mesh(boxGeo(b, bi + (p.seed || 0) * 101), this.mat); m.castShadow = m.receiveShadow = true; m.userData = { b, pi }; this.boxes.add(m);
    }));
    this._syncSel();
  }
  _syncSel() {
    const b = this.sel; this.handles.visible = this.selBox.visible = !!b && this.tool === 'select' && !this.play;
    if (!b) return;
    // 选框和手柄跟着方块的旋转走：转过角度的块，手柄也沿它自己的长宽高方向
    const q = this._rotQ(b); this.selBox.position.fromArray(b.p); this.selBox.quaternion.copy(q); this.selBox.scale.set(b.s[0] + 0.15, b.s[1] + 0.15, b.s[2] + 0.15);
    const r = Math.max(0.55, Math.min(1.1, Math.min(...b.s) * 0.25));
    for (const h of this.handles.children) { const { ax, s } = h.userData.handle, v = new THREE.Vector3(); v.setComponent(ax, s * (b.s[ax] / 2 + r * 1.6)); v.applyQuaternion(q).add(new THREE.Vector3(...b.p)); h.position.copy(v); h.scale.setScalar(r); }
    const el = this.el?.querySelector('.s-size'); if (el) el.textContent = b.s.map((v) => +v.toFixed(2)).join(' × ');
  }

  // ---------------- 拾取与编辑 ----------------
  _hit(cx, cy, withHandles = true) {
    this.ray.ray.copy(this.app.rig.ray(cx, cy).ray);
    if (withHandles && this.handles.visible) { const h = this.ray.intersectObjects(this.handles.children, false)[0]; if (h) return { handle: h.object.userData.handle }; }
    const hit = this.ray.intersectObjects(this.boxes.children, false)[0];
    if (hit) { const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(this.stage.quaternion.clone().invert()); const ax = [0, 1, 2].reduce((a, i) => (Math.abs(n.getComponent(i)) > Math.abs(n.getComponent(a)) ? i : a), 0), sn = Math.sign(n.getComponent(ax)); return { box: hit.object.userData.b, part: hit.object.userData.pi, ax, sn }; }
    const st = this.ray.intersectObject(this.top, false)[0];
    if (st) { const p = this.stage.worldToLocal(st.point.clone()); return { stage: true, p: [p.x, Math.max(0, p.y), p.z] }; }
    return null;
  }
  _rotQ(b) { const r = (b.r || [0, 0, 0]).map((a) => THREE.MathUtils.degToRad(+a || 0)); return new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')); }
  /** 屏幕上沿某个方向（造物坐标里的单位向量）走 1 小格对应多少像素 */
  _dirPx(p, dir) {
    const a = this.stage.localToWorld(new THREE.Vector3(...p)), b = this.stage.localToWorld(new THREE.Vector3(...p).add(dir));
    const pa = this.app.rig.project(a.x, a.y, a.z), pb = this.app.rig.project(b.x, b.y, b.z); return [pb[0] - pa[0], pb[1] - pa[1]];
  }
  /** 屏幕上沿某个轴走 1 小格对应多少像素（向量） */
  _axisPx(p, ax) {
    const a = this.stage.localToWorld(new THREE.Vector3(...p)), b = a.clone().add(new THREE.Vector3(...[0, 1, 2].map((i) => (i === ax ? K : 0))));
    const pa = this.app.rig.project(a.x, a.y, a.z), pb = this.app.rig.project(b.x, b.y, b.z); return [pb[0] - pa[0], pb[1] - pa[1]];
  }
  _q(v) { const s = this.snap; return Math.round(v / s) * s; }
  _pairOf(b) { if (!this.sym || b.pair == null) return null; for (const p of this.make.parts) for (const o of p.boxes) if (o.k === b.pair) return o; return null; }
  _mirrorTo(b, o) { o.p = [-b.p[0], b.p[1], b.p[2]]; o.s = [...b.s]; o.r = [b.r[0], -b.r[1], -b.r[2]]; o.c = b.c; o.shade = b.shade; }
  _snapshot() { this.undoS.push(JSON.stringify(this.make)); if (this.undoS.length > 60) this.undoS.shift(); this.redoS.length = 0; }
  undo() { const s = this.undoS.pop(); if (!s) return; this.redoS.push(JSON.stringify(this.make)); this.make = JSON.parse(s); this.sel = null; this._rebuild(); this._sync(); }
  redo() { const s = this.redoS.pop(); if (!s) return; this.undoS.push(JSON.stringify(this.make)); this.make = JSON.parse(s); this.sel = null; this._rebuild(); this._sync(); }
  _addBox(p, s, part = this.cur) {
    const P = this.make.parts[part], b = { k: this.nextK++, p, s, r: [0, 0, 0], c: this.color, shade: this.shade ? 1 : 0 };
    P.boxes.push(b);
    if (this.sym && Math.abs(p[0]) > 0.01) { const o = { ...b, k: this.nextK++, p: [-p[0], p[1], p[2]], s: [...s], r: [0, 0, 0] }; b.pair = o.k; o.pair = b.k; P.boxes.push(o); }
    return b;
  }
  _remove(b) { const o = this._pairOf(b); for (const p of this.make.parts) p.boxes = p.boxes.filter((x) => x !== b && x !== o); if (this.sel === b || this.sel === o) this.sel = null; }
  _paint(b) { if (b.c === this.color && !!b.shade === this.shade) return false; b.c = this.color; b.shade = this.shade ? 1 : 0; const o = this._pairOf(b); if (o) { o.c = b.c; o.shade = b.shade; } return true; }

  down(e) {
    const h = this._hit(e.clientX, e.clientY);
    this.st = { x0: e.clientX, y0: e.clientY, moved: false, h, did: false };
    clearTimeout(this._lp);
    this._lp = setTimeout(() => { const st = this.st; if (!st || st.moved || !st.h?.box) return; this.setColor(st.h.box.c); this.shade = !!st.h.box.shade; this._sync(); this.toast('吸取了颜色'); navigator.vibrate?.(15); st.cancel = true; }, 480);
    if (this.tool === 'select' && h?.handle && this.sel) { this._snapshot(); const dir = new THREE.Vector3().setComponent(h.handle.ax, 1).applyQuaternion(this._rotQ(this.sel)); this.st.resize = { ...h.handle, s0: this.sel.s[h.handle.ax], p0: [...this.sel.p], dir, v: this._dirPx(this.sel.p, dir) }; }
    else if (this.tool === 'select' && h?.box) { if (this.sel !== h.box) { this.sel = h.box; this.cur = h.part; this._rebuild(); this._sync(); } this.st.drag = { b: h.box, p0: [...h.box.p] }; }
  }
  move(e) {
    const st = this.st; if (!st || st.cancel) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.moved && Math.hypot(dx, dy) < 8) return;
    if (!st.moved) { st.moved = true; clearTimeout(this._lp); }
    if (st.resize && this.sel) {
      const R = st.resize, [vx, vy] = R.v, L2 = vx * vx + vy * vy || 1, d = (dx * vx + dy * vy) / L2;
      const ns = Math.max(this.snap, this._q(R.s0 + R.s * d)), dd = R.s * (ns - R.s0), b = this.sel;
      b.s[R.ax] = ns; b.p = R.p0.map((v, i) => v + R.dir.getComponent(i) * dd / 2); const o = this._pairOf(b); if (o) this._mirrorTo(b, o);   // 沿块自己的方向长，对面那一面不动
      this._rebuild(); return;
    }
    if (st.drag) {
      const D = st.drag;
      if (D.ax == null) { let best = 1, bv = 0; for (const ax of [0, 1, 2]) { const [vx, vy] = this._axisPx(D.p0, ax), l = Math.hypot(vx, vy) || 1, c = Math.abs((dx * vx + dy * vy) / (l * Math.hypot(dx, dy))); if (c > bv) { bv = c; best = ax; } } D.ax = best; D.v = this._axisPx(D.p0, best); this._snapshot(); }
      const [vx, vy] = D.v, L2 = vx * vx + vy * vy || 1, d = this._q((dx * vx + dy * vy) / L2), b = D.b;
      b.p = [...D.p0]; b.p[D.ax] += d; if (D.ax === 1) b.p[1] = Math.max(b.s[1] / 2 - 0.0001, b.p[1]);
      const o = this._pairOf(b); if (o) this._mirrorTo(b, o);
      this._rebuild(); return;
    }
    if (this.tool === 'paint' || this.tool === 'erase') {
      const h = this._hit(e.clientX, e.clientY, false); if (!h?.box) return;
      if (!st.did) { this._snapshot(); st.did = true; }
      if (this.tool === 'paint') { if (this._paint(h.box)) this._rebuild(); } else { this._remove(h.box); this._rebuild(); }
    }
  }
  up(e, cancel) {
    clearTimeout(this._lp); const st = this.st; this.st = null; if (!st || st.cancel || cancel) return;
    if (st.moved) { this._sync(); return; }
    const h = e ? this._hit(e.clientX, e.clientY) : null;
    if (this.tool === 'select') { if (!h?.box && !h?.handle) { this.sel = null; this._rebuild(); this._sync(); } return; }
    if (this.tool === 'add') {
      if (!h || h.handle) return; this._snapshot();
      const s = this.sel ? [...this.sel.s] : [4, 4, 4];
      if (h.box) { const p = [...h.box.p]; p[h.ax] += h.sn * (h.box.s[h.ax] / 2 + s[h.ax] / 2); this.sel = this._addBox(p, s, h.part); this.cur = h.part; }
      else this.sel = this._addBox([this._q(h.p[0]), s[1] / 2, this._q(h.p[2])], s);
      this._rebuild(); this._sync(); return;
    }
    if (!h?.box) return;
    this._snapshot();
    if (this.tool === 'paint') this._paint(h.box); else if (this.tool === 'erase') this._remove(h.box);
    this._rebuild(); this._sync();
  }

  // ---------------- 选中块的操作 ----------------
  dup() { const b = this.sel; if (!b) return; this._snapshot(); const p = [...b.p]; p[1] += b.s[1]; const n = this._addBox(p, [...b.s]); n.c = b.c; n.r = [...b.r]; n.shade = b.shade; const o = this._pairOf(n); if (o) this._mirrorTo(n, o); this.sel = n; this._rebuild(); this._sync(); }
  rot(ax) { const b = this.sel; if (!b) return; this._snapshot(); b.r[ax] = ((+b.r[ax] || 0) + 15) % 360; const o = this._pairOf(b); if (o) this._mirrorTo(b, o); this._rebuild(); }
  del() { const b = this.sel; if (!b) return; this._snapshot(); this._remove(b); this._rebuild(); this._sync(); }
  setColor(c) { this.color = c; if (this.sel && this.tool === 'select') { this._snapshot(); this._paint(this.sel); this._rebuild(); } this._sync(); }

  // ---------------- 部件 ----------------
  addPart() { this._snapshot(); const pv = this.sel ? [...this.sel.p] : [0, 0, 0]; this.make.parts.push({ name: '部件' + (this.make.parts.length + 1), pivot: pv, boxes: [], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, seed: this.make.parts.length }); this.cur = this.make.parts.length - 1; this.sel = null; this._rebuild(); this._sync(); this.toast('新部件：接下来添加的方块都属于它'); }
  /** 把选中的块（和对称块）挪到当前部件 */
  moveToCur() { const b = this.sel; if (!b) return; this._snapshot(); const o = this._pairOf(b); for (const p of this.make.parts) p.boxes = p.boxes.filter((x) => x !== b && x !== o); this.make.parts[this.cur].boxes.push(b); if (o) this.make.parts[this.cur].boxes.push(o); this._rebuild(); this._sync(); }

  // ---------------- 预览动作 ----------------
  togglePlay() { this.play ? this._stopPlay() : this._startPlay(); this._sync(); }
  _startPlay() { this.play = true; this.boxes.visible = false; this.handles.visible = this.selBox.visible = false; this.preview = buildMake(this.make, this.mat); this.stage.add(this.preview.group); }
  _stopPlay() { this.play = false; this.boxes.visible = true; if (this.preview) { this.stage.remove(this.preview.group); this.preview.group.traverse((o) => o.geometry?.dispose()); this.preview = null; } this._syncSel(); }
  update(dt, t) { if (this.play && this.preview) this.preview.parts.forEach((x, i) => animatePart(x.obj, x.part, t, true, i)); }

  // ---------------- 保存 ----------------
  save(meta) {
    const m = this.make; Object.assign(m, meta); m.name = (this.el.querySelector('.s-name').value || '新造物').trim().slice(0, 10);
    const list = loadMakes(), i = list.findIndex((x) => x.id === m.id); const clean = JSON.parse(JSON.stringify(m));
    if (i >= 0) list[i] = clean; else list.unshift(clean);
    if (!saveMakes(list)) { this.toast('保存失败：本机存储空间不够'); return false; }
    this.toast(`「${m.name}」已保存。回到六边形岛，建造栏「✦ 我造的」里可以直接摆放`, 3200); return true;
  }

  // ---------------- 界面 ----------------
  toast(t, ms = 1800) { const h = this.el?.querySelector('.s-toast'); if (!h) return; h.textContent = t; h.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => { h.hidden = true; }, ms); }
  _ui() {
    this.el?.remove();
    const el = this.el = document.createElement('div'); el.className = 'studio';
    el.innerHTML = `
      <div class="s-top"><button class="b-pill" data-s="close">‹ 返回</button><input class="s-name" maxlength="10" aria-label="造物名字"><button class="b-pill s-ai" data-s="ai">✦ AI 帮我做</button><button class="b-pill" data-s="play">播放动作</button><button class="b-pill s-save" data-s="save">保存</button></div>
      <div class="s-tools">${[['look', '浏览'], ['select', '选择'], ['add', '添加'], ['paint', '上色'], ['erase', '擦除']].map(([k, n]) => `<button class="b-pill" data-tool="${k}">${n}</button>`).join('')}<div class="b-gap"></div><button class="b-pill" data-s="undo">撤销</button><button class="b-pill" data-s="redo">重做</button></div>
      <div class="s-side"><b class="s-size">未选中</b><button class="b-pill" data-s="dup">复制</button><button class="b-pill" data-s="rx">转 X</button><button class="b-pill" data-s="ry">转 Y</button><button class="b-pill" data-s="rz">转 Z</button><button class="b-pill" data-s="del">删除</button><button class="b-pill" data-s="tocur">归到当前部件</button></div>
      <div class="s-bottom">
        <div class="s-row s-parts"></div>
        <div class="s-row s-colors">${SWATCH.map((c) => `<button class="s-sw" data-c="${c}" style="background:${c}"></button>`).join('')}<label class="s-sw s-custom" title="自定义颜色"><input type="color" class="s-pick" value="#c9a07a">＋</label></div>
        <div class="s-row s-opts"><button class="b-cat" data-s="shade">色组</button><button class="b-cat" data-s="sym">左右对称</button><button class="b-cat" data-s="snap">吸附 1</button></div>
      </div>
      <div class="s-sheet" hidden></div><div class="b-hint s-toast" hidden></div>`;
    this.app.ui.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      if (b.dataset.tool) { this.tool = b.dataset.tool; this._syncSel(); return this._sync(); }
      if (b.dataset.c) return this.setColor(b.dataset.c);
      if (b.dataset.part != null) { this.cur = +b.dataset.part; this.sel = null; this._rebuild(); return this._sync(); }
      const s = b.dataset.s;
      if (s === 'close') { if (this.make && this.undoS.length && !confirm('还没保存，确定离开吗？')) return; return this.close(); }
      if (s === 'undo') this.undo(); else if (s === 'redo') this.redo(); else if (s === 'play') this.togglePlay();
      else if (s === 'dup') this.dup(); else if (s === 'del') this.del(); else if (s === 'rx') this.rot(0); else if (s === 'ry') this.rot(1); else if (s === 'rz') this.rot(2); else if (s === 'tocur') this.moveToCur();
      else if (s === 'shade') { this.shade = !this.shade; this._sync(); } else if (s === 'sym') { this.sym = !this.sym; this._sync(); }
      else if (s === 'snap') { this.snap = this.snap === 1 ? 0.5 : this.snap === 0.5 ? 0.25 : this.snap === 0.25 ? 2 : 1; this._sync(); }
      else if (s === 'addPart') this.addPart(); else if (s === 'partSet') this._sheet('part'); else if (s === 'save') this._sheet('save');
      else if (s === 'sheetClose') this._sheet(null);
      else if (s === 'doSave') { const f = this.el.querySelector('.s-sheet'); if (this.save({ use: f.querySelector('[name=use]').value, behavior: f.querySelector('[name=beh]').value, size: +f.querySelector('[name=size]').value })) this._sheet(null); }
      else if (s === 'tpl') { this.edit(newMake(b.dataset.t)); }
      else if (s === 'open') { const m = loadMakes().find((x) => x.id === b.dataset.id); if (m) this.edit(m); }
      else if (s === 'drop') { if (!confirm('删除这个造物？已经摆在岛上的也会消失。')) return; saveMakes(loadMakes().filter((x) => x.id !== b.dataset.id)); this.library(); }
      else if (s === 'lib') this.library();
      else if (s === 'ai') this._sheet('ai');
      else if (s === 'aiGo') this._aiGo();
      else if (s === 'aiImgClear') { this.aiImg = null; this._sheet('ai'); }
      else if (b.dataset.ex) { this.el.querySelector('.s-aitext').value = b.dataset.ex; }
      else if (s === 'bible') { const sh = this.el.querySelector('.s-sheet'); sh.innerHTML = `<div class="b-card"><header><b>体素美术圣经</b><button class="b-x" data-s="lib">返回</button></header>${sopHTML()}</div>`; }
    });
    for (const ev of ['pointerdown', 'wheel']) el.addEventListener(ev, (e) => { if (e.target.closest('button,input,label,select,.s-sheet,.s-bottom')) e.stopPropagation(); });
    el.querySelector('.s-pick').addEventListener('input', (e) => this.setColor(e.target.value));
    el.querySelector('.s-sheet').addEventListener('input', (e) => {
      const f = e.target, P = this.make?.parts[this.cur]; if (!P || !f.name?.startsWith('p_')) return;
      const k = f.name.slice(2); if (k === 'pivot') { const b = this.sel; if (b) { const y = f.value === 'top' ? b.p[1] + b.s[1] / 2 : f.value === 'bottom' ? b.p[1] - b.s[1] / 2 : b.p[1]; P.pivot = [b.p[0], y, b.p[2]]; } return; }
      P[k] = k === 'name' || k === 'motion' || k === 'axis' ? f.value : +f.value; if (k === 'name') this._sync();
    });
  }
  _sync() {
    const el = this.el; if (!el) return;
    el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool));
    el.querySelector('[data-s="shade"]').classList.toggle('on', this.shade); el.querySelector('[data-s="sym"]').classList.toggle('on', this.sym);
    el.querySelector('[data-s="snap"]').textContent = '吸附 ' + this.snap;
    el.querySelector('[data-s="play"]').classList.toggle('on', this.play);
    el.querySelectorAll('.s-sw[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === this.color));
    el.querySelector('[data-s="undo"]').disabled = !this.undoS.length; el.querySelector('[data-s="redo"]').disabled = !this.redoS.length;
    el.querySelector('.s-side').hidden = !this.sel || this.tool !== 'select';
    if (this.make) el.querySelector('.s-parts').innerHTML = this.make.parts.map((p, i) => `<button class="b-cat ${i === this.cur ? 'on' : ''}" data-part="${i}">${p.name}${p.motion && p.motion !== 'none' ? ' ·' + MOTIONS[p.motion].slice(0, 2) : ''}</button>`).join('') + '<button class="b-cat" data-s="addPart">＋部件</button><button class="b-cat" data-s="partSet">部件设置</button>';
    this._syncSel();
  }
  _sheet(kind) {
    const sh = this.el.querySelector('.s-sheet'); sh.hidden = !kind; if (!kind) return;
    if (kind === 'part') {
      const P = this.make.parts[this.cur], opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
      sh.innerHTML = `<div class="b-card"><header><b>部件设置</b><button class="b-x" data-s="sheetClose">完成</button></header>
        <label>名字<input name="p_name" value="${P.name}" maxlength="8"></label>
        <label>动作<select name="p_motion">${opt(MOTIONS, P.motion || 'none')}</select></label>
        <label>绕哪根轴<select name="p_axis">${opt({ x: '左右轴（点头、迈腿）', y: '竖直轴（转圈）', z: '前后轴（扇翅、摇摆）' }, P.axis || 'x')}</select></label>
        <label>幅度<input type="range" name="p_amp" min="0.2" max="2" step="0.1" value="${P.amp ?? 1}"></label>
        <label>快慢<input type="range" name="p_speed" min="0.2" max="2.5" step="0.1" value="${P.speed ?? 1}"></label>
        <label>节拍错开<input type="range" name="p_phase" min="0" max="1" step="0.25" value="${P.phase ?? 0}"></label>
        <label>关节点${this.sel ? '' : '（先选中一块）'}<select name="p_pivot" ${this.sel ? '' : 'disabled'}><option value="">保持不变</option><option value="top">放在选中块的顶部</option><option value="mid">放在选中块的中心</option><option value="bottom">放在选中块的底部</option></select></label>
        <p class="b-note">部件绕关节点动：腿的关节放在腿顶部，翅膀放在靠身体那一侧，头放在脖子处。点上面的“播放动作”看效果。</p></div>`;
    } else if (kind === 'save') {
      const m = this.make, opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
      sh.innerHTML = `<div class="b-card"><header><b>保存造物</b><button class="b-x" data-s="sheetClose">取消</button></header>
        <label>用途（在六边形岛里怎么用）<select name="use">${opt(USES, m.use || 'prop')}</select></label>
        <label>行为（动物 / 生物）<select name="beh">${opt(BEHAVIORS, m.behavior || 'still')}</select></label>
        <label>在岛上的大小<input type="range" name="size" min="0.3" max="4" step="0.1" value="${m.size ?? 1}"></label>
        <button class="b-row" data-s="doSave"><b>保存</b><span>保存后在六边形岛建造栏「✦ 我造的」里摆放</span></button></div>`;
    } else if (kind === 'ai') {
      const EX = ['一只圆滚滚的橘猫，竖着尖耳朵，长尾巴', '会发光的蓝色蘑菇，伞盖上有白点', '一座两层的木头小灯塔，红白条纹', '长着翅膀的小飞鱼，银蓝色', '樱花色的大伞树，树干弯弯的', '一只背上长着小树的乌龟'];
      sh.innerHTML = `<div class="b-card"><header><b>✦ AI 帮我做</b><button class="b-x" data-s="${this.make ? 'sheetClose' : 'lib'}">${this.make ? '取消' : '返回'}</button></header>
        ${this.make ? `<div class="s-mode"><label><input type="radio" name="aimode" value="new" checked> 做一个新的</label><label><input type="radio" name="aimode" value="edit"> 改现在这个「${this.make.name}」</label></div>` : ''}
        <label>想要什么？<textarea class="s-aitext" rows="3" placeholder="比如：${EX[0]}"></textarea></label>
        <div class="s-chips">${EX.map((t) => `<button class="b-cat" data-ex="${t}">${t}</button>`).join('')}</div>
        <label class="s-img">${this.aiImg ? `<img src="${this.aiImg}" alt="参考图"><button class="b-x" data-s="aiImgClear">去掉图片</button>` : '＋ 附一张参考图（可选）'}<input type="file" accept="image/*" class="s-file" hidden></label>
        <button class="b-row s-aigo" data-s="aiGo"><b>生成</b><span>AI 按美术圣经搭出来（十几秒到一分钟），然后你可以继续改</span></button>
        <p class="b-note s-aimsg"></p></div>`;
      sh.querySelector('.s-file')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) this._loadImg(f); });
    } else if (kind === 'lib') {
      const list = loadMakes();
      sh.innerHTML = `<div class="b-card"><header><b>造物台</b><button class="b-x" data-s="close">关闭</button></header>
        <button class="b-row s-airow" data-s="ai"><b>✦ AI 帮我做</b><span>说一句话或给一张图，AI 直接搭出来，你再微调</span></button>
        <p class="b-note">也可以从空白开始，或拿一个模板改——形状、颜色、大小、数量、动作都不限。<button class="b-x" data-s="bible">看美术圣经</button></p>
        <div class="s-tpls">${Object.entries(TEMPLATES).map(([k, t]) => `<button class="b-row" data-s="tpl" data-t="${k}"><b>${t.name}</b></button>`).join('')}</div>
        <b>我的造物（${list.length}）</b>
        ${list.map((m) => `<div class="s-lib"><button class="b-row" data-s="open" data-id="${m.id}"><b>${m.name}</b><span>${USES[m.use] || ''} · ${m.parts.reduce((s, p) => s + p.boxes.length, 0)} 块</span></button><button class="b-x" data-s="drop" data-id="${m.id}">删除</button></div>`).join('') || '<p class="b-note">还没有。</p>'}</div>`;
    }
  }
  /** 参考图：缩到最长边 768 再给 AI（省流量、省额度） */
  _loadImg(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, 768 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); this.aiImg = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url); this._sheet('ai'); };
    img.src = url;
  }
  async _aiGo() {
    const sh = this.el.querySelector('.s-sheet'), msg = sh.querySelector('.s-aimsg'), text = sh.querySelector('.s-aitext').value.trim(), btn = sh.querySelector('.s-aigo');
    const ai = this.app.ai; if (!ai?.ready) { msg.textContent = '还没配置 AI：回到六边形岛，在「设置 → AI」里选服务商、填 API 密钥。'; return; }
    if (!text && !this.aiImg) { msg.textContent = '先写一句想要什么，或附一张图'; return; }
    const edit = sh.querySelector('input[name=aimode]:checked')?.value === 'edit' && this.make;
    btn.disabled = true; msg.textContent = edit ? 'AI 正在改……' : 'AI 正在搭……';
    try {
      const m = await ai.make(text || '照着图片做一个', this.aiImg, edit ? this.make : null);
      if (edit) { this._snapshot(); m.id = this.make.id; const keep = this.undoS; this.edit(m); this.undoS = keep; }
      else { m.id = 'mk' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); this.edit(m); this.undoS = ['{}']; }
      this._sync(); this.toast(`「${m.name}」做好了：${m.parts.reduce((s, p) => s + p.boxes.length, 0)} 块、${m.parts.length} 个部件。可以继续改，满意了点保存`, 3600);
    } catch (e) { const { aiError } = await import('../ai.js'); msg.textContent = '没做出来：' + aiError(e); btn.disabled = false; }
  }
  library() { this.make = null; for (const m of [...this.boxes.children]) { this.boxes.remove(m); m.geometry.dispose(); } this.sel = null; this._sync(); this._sheet('lib'); }
}
