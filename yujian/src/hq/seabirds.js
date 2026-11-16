// 海鸥：绕着岛盘旋（扇翅、侧倾），另有几只歇在海面上随浪起伏（交给海洋的浮力计算）。
// 样张和游戏共用；游戏里盘旋中心和半径跟着岛的大小变。
import * as THREE from 'three';
import { propMaterial } from './materials.js';

function setColor(g, hex, tipAt, tipHex) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color(hex), b = tipHex ? new THREE.Color(tipHex) : a;
  for (let i = 0; i < p.count; i++) { const tip = tipAt && Math.abs(p.getX(i) - tipAt[0]) < 0.01 && Math.abs(p.getZ(i) - tipAt[2]) < 0.01; const k = tip ? b : a; c.set([k.r, k.g, k.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

/** 一只海鸥（Group：身体 + 左右翅膀，翅膀绕身体中轴转） */
let GEO = null;
export function gullModel(mat) {
  if (!GEO) {
    const body = new THREE.CapsuleGeometry(0.025, 0.07, 3, 6).rotateX(Math.PI / 2); setColor(body, 0xf4f4f0);
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.17, 0.02, -0.01, 0, 0, -0.03, 0.17, 0.02, -0.01, 0.2, 0.01, -0.05, 0.12, 0.02, 0.01], 3));
    wingG.computeVertexNormals(); setColor(wingG, 0xe8e8e4, [0.2, 0.01, -0.05], 0x30343a);
    GEO = { body, wingG };
  }
  const { wingG } = GEO, g = new THREE.Group(), body = new THREE.Mesh(GEO.body, mat); g.add(body);
  const L = new THREE.Mesh(wingG, mat), R = new THREE.Mesh(wingG, mat); R.scale.x = -1;
  g.add(L, R); g.userData = { L, R };
  g.traverse((o) => { o.castShadow = false; });   // 太小，投影几乎看不见，省掉阴影绘制
  return g;
}

export class Gulls {
  constructor(scene, n = 7) {
    this.mat = propMaterial({ rough: 0.6 });
    this.center = new THREE.Vector3(); this.radius = 4;
    this.list = []; this.group = new THREE.Group(); scene.add(this.group);
    for (let i = 0; i < n; i++) {
      const g = gullModel(this.mat);
      g.userData.f = { r: i * 0.9, h: 2.4 + (i % 3) * 0.5, sp: (0.18 + (i % 4) * 0.03) * (i % 2 ? 1 : -1), ph: i * 1.3 };
      this.group.add(g); this.list.push(g);
    }
  }
  /** 歇在海面上的一只（返回 Group，调用方把它交给浮力计算） */
  resting() { const g = gullModel(this.mat), { L, R } = g.userData; L.rotation.z = 0.12; R.rotation.z = -0.12; L.scale.x = 0.38; R.scale.x = -0.38; return g; }   // 翅膀收在身体两侧
  update(t) {
    this.list.forEach((b, i) => {
      const d = b.userData.f;
      // 渔船在海上时，前三只去船上空盘旋（等鱼）；其余绕岛
      const onBoat = this.follow && i < 3, c = onBoat ? this.follow : this.center, a = t * d.sp * (onBoat ? 2.2 : 1) + d.ph, r = onBoat ? 0.7 + i * 0.35 : this.radius + d.r;
      const want = new THREE.Vector3(c.x + Math.cos(a) * r, (onBoat ? 1.1 + i * 0.25 : d.h) + Math.sin(t * 0.7 + d.ph) * 0.3, c.z + Math.sin(a) * r);
      if (!d.init) { b.position.copy(want); d.init = true; } else b.position.lerp(want, 0.03);   // 换目标时慢慢飞过去
      b.rotation.set(0, -a + (d.sp > 0 ? Math.PI : 0), Math.sin(t * 0.8 + d.ph) * 0.2);
      const f = Math.sin(t * 7 + d.ph * 3) * 0.55; b.userData.L.rotation.z = f; b.userData.R.rotation.z = -f;
    });
  }
}
