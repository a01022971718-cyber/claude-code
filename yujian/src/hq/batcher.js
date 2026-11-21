// 全局合批：场景里同一份几何 + 同一个材质的普通网格（动物部件、海龟、海鸥……）合成一个实例化网格，一次绘制。
// 原来的网格留作“占位”：照常参与动画（位置、旋转、缩放），但隐藏起来不直接画；每帧把它们的世界矩阵抄进实例矩阵。
// 投影：合批的都是会动的东西（动物、村民、AI 生物、我造的动物、海边的鸟），它们不画进阴影贴图（阴影贴图是缓存的，画进去会留残影），
// 占位 castShadow 为真的，脚下放一个软圆影子（一次绘制画完所有），每帧跟着走。手机上绘制次数是 CPU 的主要开销，合批把几百次降到几十次。
import * as THREE from 'three';
import { simplify, triCount } from './simplify.js';
// 离镜头 LO_D 以外的换简化模型（几十个像素大小，看不出差别）
const LO_D = 3.2;

export class Batcher {
  constructor(scene) {
    this.scene = scene; this.batches = new Map(); this.count = 0;
    // 软圆影子：中间深、边缘渐隐的圆片，贴着地面
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c), mat = new THREE.MeshBasicMaterial({ color: 0x0b1410, alphaMap: tex, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat, 512); this.blob.count = 0; this.blob.frustumCulled = false; this.blob.renderOrder = 2; this.blob.userData.noBatch = true; this.blob.name = 'blob-shadows';
    scene.add(this.blob); this._m4 = new THREE.Matrix4();
  }
  /** roots：要合批的子树（只收里面的普通网格，实例化网格原样保留） */
  /** cam / maxD（可选）：只画在镜头视野内、离镜头 maxD 以内的（远处的小动物只有几个像素，画了也看不清，却很费三角面） */
  sync(roots, cam = null, maxD = Infinity, loD = LO_D, groundAt = null) {
    const by = new Map();
    if (cam) { this._pv ||= new THREE.Matrix4(); this._fr ||= new THREE.Frustum(); this._sp ||= new THREE.Sphere(new THREE.Vector3(), 0.35); this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._pv); }
    const cp = cam?.position, fr = this._fr, sp = this._sp, md2 = maxD * maxD;
    for (const root of roots) {
      if (!root) continue;
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.noBatch) return;
        const k = o.geometry.id + ':' + o.material.id; let L = by.get(k); if (!L) by.set(k, L = []); L.push(o);
      });
    }
    let n = 0, nb = 0; const B = this.blob, M = this._m4;
    for (const [k, L] of by) {
      let b = this.batches.get(k);
      if (!b || b.cap < L.length) {
        if (b) { this.scene.remove(b.im); b.im.dispose(); if (b.lo) { this.scene.remove(b.lo); b.lo.dispose(); } }
        const cap = Math.max(4, L.length * 2), im = new THREE.InstancedMesh(L[0].geometry, L[0].material, cap);
        im.name = 'batch:' + (L[0].name || L[0].parent?.name || L[0].parent?.parent?.name || L[0].geometry.name || '?'); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.userData.noBatch = true;
        this.scene.add(im); b = { im, cap, shadow: !!L[0].castShadow }; this.batches.set(k, b);
        // 远处版本：顶点聚类减面；减不下来的（本来就简单的模型）不做
        const g0 = L[0].geometry, lg = triCount(g0) > 150 ? simplify(g0, 9) : g0;
        if (lg !== g0) { const lo = new THREE.InstancedMesh(lg, L[0].material, cap); lo.name = im.name + ':lo'; lo.frustumCulled = false; lo.castShadow = false; lo.receiveShadow = true; lo.userData.noBatch = true; this.scene.add(lo); b.lo = lo; }
      }
      const im = b.im, lo = b.lo, lo2 = loD * loD; let c = 0, cl = 0;
      for (const o of L) {
        // 占位自己或祖先本来就是隐藏的（比如远处暂停的动物群）：不画
        let vis = o.userData.batchVis ?? true, p = o.parent; while (p && vis) { if (!p.visible) vis = false; p = p.parent; }
        if (o.visible) { o.userData.batchVis = true; o.visible = false; }
        if (!vis) continue;
        let d2 = 0;
        if (cam) { const e = o.matrixWorld.elements, dx = e[12] - cp.x, dy = e[13] - cp.y, dz = e[14] - cp.z; d2 = dx * dx + dy * dy + dz * dz; if (d2 > md2) continue; sp.center.set(e[12], e[13], e[14]); if (!fr.intersectsSphere(sp)) continue; }
        if (lo && d2 > lo2) lo.setMatrixAt(cl++, o.matrixWorld); else im.setMatrixAt(c++, o.matrixWorld);
        // 软圆影子：在地面上（海上、飞得高的不放），大小按模型的包围球
        if (b.shadow && groundAt && nb < 512) {
          const e = o.matrixWorld.elements, gy = groundAt(e[12], e[14]);
          if (gy != null && e[13] - gy < 0.5) { o.geometry.boundingSphere || o.geometry.computeBoundingSphere(); const r = o.geometry.boundingSphere.radius * Math.hypot(e[0], e[1], e[2]) * 0.95, f = 1 - Math.min(1, Math.max(0, e[13] - gy) / 0.5) * 0.6; M.makeScale(r * f, 1, r * f).setPosition(e[12], gy + 0.004, e[14]); B.setMatrixAt(nb++, M); }
        }
      }
      im.count = c; im.instanceMatrix.needsUpdate = true; if (lo) { lo.count = cl; lo.instanceMatrix.needsUpdate = true; } n++;
    }
    for (const [k, b] of this.batches) if (!by.has(k)) { this.scene.remove(b.im); b.im.dispose(); if (b.lo) { this.scene.remove(b.lo); b.lo.dispose(); } this.batches.delete(k); }
    this.count = n; B.count = nb; B.instanceMatrix.needsUpdate = true;
  }
}
