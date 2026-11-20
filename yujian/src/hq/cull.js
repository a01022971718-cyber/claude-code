// 只画画面里的：每帧算一次镜头视锥，各模块用它判断“在不在画面里”。
//  - 画面外的整组实例（鱼群、飞虫、鸟群、珊瑚、海带、海草）整组跳过不画（按实例位置算包围球，打开视锥剔除）；
//  - 画面外的动物、鱼群降频更新（每 4 帧动一次，时间步乘 4，回到画面里时位置照样是连续的）。
import * as THREE from 'three';
export const VIEW = { fr: new THREE.Frustum(), m: new THREE.Matrix4(), sp: new THREE.Sphere(), ready: false };
export function updateView(cam) { VIEW.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); VIEW.fr.setFromProjectionMatrix(VIEW.m); VIEW.ready = true; }
export function inView(x, y, z, r) { if (!VIEW.ready) return true; VIEW.sp.center.set(x, y, z); VIEW.sp.radius = r; return VIEW.fr.intersectsSphere(VIEW.sp); }
/** 实例化网格的包围球：按实例位置算（会动的每 every 次调用算一次），并打开视锥剔除。pad：着色器里的摆动留的余量 */
export function fitBounds(m, pad = 0.2, every = 10) {
  const u = m.userData; u.bsT = (u.bsT || 0) + 1;
  if (u.bsT % every !== 1 && m.boundingSphere) return;
  m.computeBoundingSphere(); if (m.boundingSphere) m.boundingSphere.radius += pad; m.frustumCulled = true;
}
/** 画面外降频：在画面里每帧都更新；不在时每 4 帧更新一次（时间步乘 4） */
export function throttle(o, visible, dt, fn) { if (visible) { o._tk = 0; fn(dt); } else if ((o._tk = (o._tk || 0) + 1) % 4 === 0) fn(Math.min(0.12, dt * 4)); }
