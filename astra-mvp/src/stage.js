// One WebGL stage shared by every screen: the habitat (painted meadow + toon spirit)
// and the engineering view (dark HUD + hologram spirit on a grid).
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { setLineResolution, V } from './spirit.js';
import { paintMeadow, paintHud } from './paint.js';

const rad = (d) => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// polyline with a fixed vertex budget, updated in place every frame
export class PolyLine {
  constructor(max, mat) {
    this.max = max;
    const g = new LineGeometry(); g.setPositions(new Float32Array(max * 3));
    this.line = new Line2(g, mat); this.line.frustumCulled = false;
  }
  set(pts) {
    const data = this.line.geometry.attributes.instanceStart.data, arr = data.array;
    for (let i = 0; i < this.max - 1; i++) {
      const a = pts[Math.min(i, pts.length - 1)], b = pts[Math.min(i + 1, pts.length - 1)];
      arr[i * 6] = a.x; arr[i * 6 + 1] = a.y; arr[i * 6 + 2] = a.z; arr[i * 6 + 3] = b.x; arr[i * 6 + 4] = b.y; arr[i * 6 + 5] = b.z;
    }
    data.needsUpdate = true;
    if (this.line.material.dashed) this.line.computeLineDistances();
  }
}

export class Stage {
  constructor(host) {
    this.host = host;
    this.bgMeadow = host.querySelector('#bg-meadow');
    this.bgHud = host.querySelector('#bg-hud');
    this.canvas = host.querySelector('#gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.fx = new OutlineEffect(this.renderer, { defaultThickness: 0.004, defaultColor: [0.05, 0.05, 0.07] });
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.rig = new THREE.Group(); this.scene.add(this.rig);     // pitched for the slope
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6f7fd8, 1.45));
    this.sun = new THREE.DirectionalLight(0xfff4dc, 2.9);
    this.sun.position.set(-6, 9, 2.2); this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.bias = -0.0008; this.sun.shadow.radius = 3;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    const sm = new THREE.ShadowMaterial({ color: 0x0b2a3a, opacity: 0.42 }); sm.userData.outlineParameters = { visible: false };
    this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sm);
    this.shadowPlane.rotation.x = -Math.PI / 2; this.shadowPlane.receiveShadow = true; this.rig.add(this.shadowPlane);
    // engineering grid
    const mk = (step, op) => {
      const p = [], n = 30;
      for (let i = -n; i <= n; i += step) { p.push(i, 0, -n, i, 0, n * 3, -n, 0, i, n, 0, i); }
      for (let i = n; i <= n * 3; i += step) p.push(-n, 0, i, n, 0, i);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: op }));
    };
    this.grid = new THREE.Group(); this.grid.add(mk(0.5, 0.07), mk(2.5, 0.2)); this.rig.add(this.grid);
    this.view = 'habitat'; this.horizon = 0.40; this.eng = null;
    this.ray = new THREE.Raycaster();
    this.resize();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(200, Math.round(r.width)); this.h = Math.max(300, Math.round(r.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    setLineResolution(this.w, this.h);
    this.cam.aspect = this.w / this.h;
    for (const c of [this.bgMeadow, this.bgHud]) { c.width = this.w * this.dpr; c.height = this.h * this.dpr; }
    paintMeadow(this.bgMeadow, this.horizon * this.h * this.dpr);
    paintHud(this.bgHud, 5, this.bgMeadow);
    this.applyCamera();
  }

  setView(view) {
    this.view = view;
    this.bgMeadow.hidden = view !== 'habitat';
    this.bgHud.hidden = view !== 'eng';
    this.grid.visible = view === 'eng';
    this.shadowPlane.visible = view === 'habitat';
    this.sun.castShadow = view === 'habitat';
    this.rig.rotation.x = 0;
    this.eng = null;
    this.applyCamera();
  }
  setSlope(deg) { this.rig.rotation.x = -rad(deg); this.rig.updateMatrixWorld(true); }

  // engineering camera: follows `target()` (a rig-local point), subject lifted above the control panel
  engCam({ offset, look, fov = 28, lift = 0.17, target = null }) {
    this.eng = { offset, look, fov, lift, target };
    this.applyCamera();
  }
  applyCamera() {
    const cam = this.cam;
    if (this.view === 'habitat' || !this.eng) {
      const fov = 30, f = 0.5 / Math.tan(rad(fov / 2)), hyF = this.horizon, ryF = 0.6, az = -0.55;
      const p = Math.atan((0.5 - hyF) / f), e = p + Math.atan((ryF - 0.5) / f);
      const d = clamp(4.0 / (0.6 * 2 * Math.tan(rad(fov / 2)) * cam.aspect), 15, 34);
      cam.fov = fov; cam.clearViewOffset();
      cam.position.set(Math.sin(az) * d * Math.cos(e), 0.62 + d * Math.sin(e), Math.cos(az) * d * Math.cos(e));
      cam.lookAt(cam.position.clone().add(V(-Math.sin(az), -Math.tan(p), -Math.cos(az))));
    } else {
      const E = this.eng, s = clamp(Math.pow(0.46 / cam.aspect, 0.9), 0.72, 1.3);
      const t = E.target ? this.rig.localToWorld(E.target().clone()) : V(0, 0, 0);
      cam.fov = E.fov;
      cam.position.copy(t).addScaledVector(E.offset, s);
      cam.lookAt(t.clone().add(E.look));
      cam.setViewOffset(this.w, this.h, 0, this.h * E.lift, this.w, this.h);
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  render() {
    if (this.eng && this.eng.target) this.applyCamera();
    this.fx.render(this.scene, this.cam);
  }
  // rig-local point -> CSS px inside the host
  project(local) {
    const p = this.rig.localToWorld(local.clone()).project(this.cam);
    return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h, behind: p.z > 1 };
  }
  // pointer -> point on the ground plane, in rig-local coordinates
  groundPoint(clientX, clientY) {
    const r = this.host.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const inv = this.rig.matrixWorld.clone().invert();
    const o = this.ray.ray.origin.clone().applyMatrix4(inv), d = this.ray.ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.y) < 1e-5) return null;
    const t = -o.y / d.y;
    return t > 0 ? o.addScaledVector(d, t) : null;
  }

  // render three orthographic ink drawings of a spirit into 2D canvases (for the ledger)
  blueprints(spirit, canvases) {
    const keep = { grid: this.grid.visible, sh: this.shadowPlane.visible, rx: this.rig.rotation.x, pos: spirit.root.position.clone(), ry: spirit.root.rotation.y };
    this.grid.visible = false; this.shadowPlane.visible = false; this.rig.rotation.x = 0;
    spirit.root.position.set(0, 0, 0); spirit.root.rotation.y = 0; this.rig.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    spirit.root.traverse((o) => { if (o.isMesh && o.visible && !o.isLine2 && !o.isLineSegments2 && o.geometry.boundingBox !== undefined) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    const out = {};
    for (const [kind, cv] of Object.entries(canvases)) {
      const w = cv.clientWidth || 160, h = cv.clientHeight || 120, asp = w / h, cam = this.ortho;
      const fit = (sx, sy) => { const hw = Math.max(sx / 2, (sy / 2) * asp) * 1.14; cam.left = -hw; cam.right = hw; cam.top = hw / asp; cam.bottom = -hw / asp; };
      cam.up.set(0, 1, 0);
      if (kind === 'side') { fit(s.z, s.y); cam.position.set(30, c.y, c.z); cam.lookAt(0, c.y, c.z); }
      if (kind === 'front') { fit(s.x, s.y); cam.position.set(c.x, c.y, 30); cam.lookAt(c.x, c.y, 0); }
      if (kind === 'top') { fit(s.z, s.x); cam.up.set(-1, 0, 0); cam.position.set(c.x, 30, c.z); cam.lookAt(c.x, 0, c.z); }
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      this.renderer.setPixelRatio(2); this.renderer.setSize(w, h, false); setLineResolution(w, h);
      this.fx.render(this.scene, cam);
      cv.width = w * 2; cv.height = h * 2;
      cv.getContext('2d').drawImage(this.canvas, 0, 0, w * 2, h * 2);
      const P = (v) => { const q = v.clone().project(cam); return { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h }; };
      out[kind] = { ground: P(V(0, 0, 0)).y, w, h };
    }
    out.size = s; out.box = bb;
    this.grid.visible = keep.grid; this.shadowPlane.visible = keep.sh; this.rig.rotation.x = keep.rx;
    spirit.root.position.copy(keep.pos); spirit.root.rotation.y = keep.ry;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(this.w, this.h, false); setLineResolution(this.w, this.h);
    this.rig.updateMatrixWorld(true);
    return out;
  }
}
