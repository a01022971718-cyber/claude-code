// 昼夜：默认跟随设备的现实时间；也可以固定在某个时刻。按关键帧插值光照、雾、海水颜色和夜灯强度。
import * as THREE from 'three';

// [小时, 太阳色, 太阳强度, 天光, 地面反光, 环境光强度, 雾/天色, 曝光, 夜灯, 深海, 中层海, 浅滩]
const KEYS = [
  [0, 0x9db8ff, 1.15, 0x6a80c0, 0x3a4566, 1.55, 0x1f3058, 1.22, 1, 0x123a62, 0x1d5a84, 0x3f8f9c],
  [5, 0x9db8ff, 1.15, 0x6a80c0, 0x3a4566, 1.55, 0x26386a, 1.22, 1, 0x123a62, 0x1d5a84, 0x3f8f9c],
  [6, 0xffb896, 1.9, 0xd4c8f0, 0x7a6e80, 1.4, 0xf0cfc4, 1.14, 0.4, 0x2366a0, 0x4aa0c4, 0x9ae2d8],
  [8, 0xfff1dc, 2.6, 0xd8eeff, 0x9a9070, 1.3, 0xbfe0ea, 1.12, 0, 0x1b6690, 0x2a9bb8, 0x86e6d2],
  [12, 0xfff6e6, 3.0, 0xd4ecff, 0xa08f6c, 1.4, 0xa6d6e6, 1.1, 0, 0x1b6690, 0x2a9bb8, 0x86e6d2],
  [15, 0xffeccd, 2.9, 0xd4ecff, 0xa08f6c, 1.35, 0x9fd0e0, 1.12, 0, 0x1b6690, 0x2a9bb8, 0x86e6d2],
  [17.3, 0xffcf8f, 2.7, 0xf2dcc4, 0x9a7a5a, 1.2, 0xf0d0a8, 1.12, 0, 0x1d5f88, 0x3a98b0, 0x9ee3c8],
  [18.6, 0xffa070, 2.1, 0xc8b4e0, 0x7a6070, 1.35, 0xf4b49a, 1.14, 0.3, 0x2a5a96, 0x4a88bc, 0x9ad4d4],
  [19.5, 0xc6a0e0, 1.1, 0x8e8ccc, 0x4a4868, 1.45, 0x5d6098, 1.18, 0.8, 0x1a4474, 0x2a6694, 0x5aa0ac],
  [21, 0x9db8ff, 1.15, 0x6a80c0, 0x3a4566, 1.55, 0x1f3058, 1.22, 1, 0x123a62, 0x1d5a84, 0x3f8f9c],
  [24, 0x9db8ff, 1.15, 0x6a80c0, 0x3a4566, 1.55, 0x1f3058, 1.22, 1, 0x123a62, 0x1d5a84, 0x3f8f9c],
];
const ca = new THREE.Color(), cb = new THREE.Color();
const lerpC = (out, a, b, t) => out.copy(ca.setHex(a)).lerp(cb.setHex(b), t);

export class Sky {
  constructor() {
    this.hour = 15;
    this.sunColor = new THREE.Color(); this.hemiSky = new THREE.Color(); this.hemiGround = new THREE.Color(); this.haze = new THREE.Color();
    this.deep = new THREE.Color(); this.mid = new THREE.Color(); this.shallow = new THREE.Color();
    this.dir = new THREE.Vector3();
    this.set(15);
  }
  /** 现实时间对应的小时数（含分钟） */
  static realHour(ms = Date.now()) { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  set(h) {
    h = ((h % 24) + 24) % 24; this.hour = h;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = (h - A[0]) / (B[0] - A[0] || 1), k = t * t * (3 - 2 * t);
    const num = (j) => A[j] + (B[j] - A[j]) * k;
    lerpC(this.sunColor, A[1], B[1], k); this.sunInt = num(2);
    lerpC(this.hemiSky, A[3], B[3], k); lerpC(this.hemiGround, A[4], B[4], k); this.hemiInt = num(5);
    lerpC(this.haze, A[6], B[6], k); this.exposure = num(7); this.night = num(8);
    lerpC(this.deep, A[9], B[9], k); lerpC(this.mid, A[10], B[10], k); lerpC(this.shallow, A[11], B[11], k);
    // 太阳从右前方升起，经过头顶，落到左后方；夜里换成固定角度的月光
    const day = h >= 5.6 && h <= 19.6;
    const az = day ? THREE.MathUtils.degToRad(25 + (h - 6) / 13 * 165) : THREE.MathUtils.degToRad(120);
    const el = day ? THREE.MathUtils.degToRad(Math.max(9, 62 * Math.sin(Math.PI * (h - 6) / 13.2))) : THREE.MathUtils.degToRad(52);
    this.dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.isNight = this.night > 0.5;
    return this;
  }
  label() { const hh = Math.floor(this.hour), mm = Math.floor((this.hour - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
}
