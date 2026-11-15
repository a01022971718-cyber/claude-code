// 缩略图：用一个独立的小渲染器，把模型按游戏里的灯光渲染成图片（卡牌插图、装饰托盘、素材预览都用它）。
import * as THREE from 'three';
import { landMaterial } from './fx.js';
import { buildTile } from './tiles.js';

let R = null, scene, cam, holder, mat, failed = false;
const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
function init() {
  try {
    R = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { failed = true; return; }
  R.setPixelRatio(1); R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.12; R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd4ecff, 0xa08f6c, 1.5));
  const sun = new THREE.DirectionalLight(0xffeccd, 2.7); sun.position.set(-6, 9, 7); scene.add(sun);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  holder = new THREE.Group(); scene.add(holder); mat = landMaterial(false);
}
/** obj: BufferGeometry 或 Object3D。返回 PNG dataURL；渲染器不可用时返回空串 */
export function thumb(obj, { w = 160, h = 160, zoom = 1, pitch = 0.6, yaw = -0.55, minY = -Infinity } = {}) {
  if (!R && !failed) init();
  if (failed) return '';
  R.setSize(w, h, false);
  const o = obj.isObject3D ? obj : new THREE.Mesh(obj, mat);
  holder.add(o);
  box.setFromObject(o); if (box.min.y < minY) box.min.y = minY;
  box.getCenter(c); box.getSize(sz);
  const rad = Math.max(sz.x, sz.z, sz.y * 1.15) * 0.6 / zoom, a = w / h;
  cam.left = -rad * a; cam.right = rad * a; cam.top = rad; cam.bottom = -rad; cam.updateProjectionMatrix();
  cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * 30, c.y + Math.sin(pitch) * 30, c.z + Math.cos(yaw) * Math.cos(pitch) * 30);
  cam.lookAt(c);
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  holder.remove(o);
  return url;
}
export function tileThumb(type) {
  const geo = buildTile(type, 2, 1, { dir: 1 }).toGeometry();
  const url = thumb(geo, { w: 220, h: 190, zoom: 1.12, minY: -0.3 });
  geo.dispose();
  return url;
}
export const thumbMaterial = () => mat || (init(), mat);
