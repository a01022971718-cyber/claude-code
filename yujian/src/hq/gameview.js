// 高画质游戏画面：把样张的渲染（细分地形、植被、海洋、海底、生态、后期管线、大气）接进游戏。
// 和低画质画面（../legacyview.js）提供同一组接口。设计要点：
//  - 地块按区块（CH×CH 格）合并成网格；每块地的顶面/侧面/装点各自缓存，放新地块时只重算它和 6 个邻居。
//  - 区块重建有时间预算，每帧只做一部分，按离镜头远近排序，大地图也不会卡一下。
//  - 海底按 16×16 的方块跟着镜头生成；陆地距离场变了（放了新地块）只重建附近的方块。
//  - 海面、岸边浪花、阴影、花粉和萤火虫都跟着镜头走；海洋生态在岛变大后（延迟合并）重建栖息地。
//  - 陆地动物按区块生成，数量由区块里的地块类型决定，离镜头远的区块暂停更新。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Terrain, mergeColored, SUB_LO } from './terrain.js';
import { terrainMaterial, propMaterial, foliageMaterial, U } from './materials.js';
import { instanced, bladeField } from './vegetation.js';
import { ribbon, streamMaterial } from './streams.js';
import { Gulls } from './seabirds.js';
import { boulder } from './rocks.js';
import { ItemLayer } from './items.js';
import { Batcher } from './batcher.js';
import { Villagers } from './villagers.js';
import { Wildlife } from './wildlife.js';
import { SkyLayer } from './clouds.js';
import { MacroLayer } from './macro.js';
import { STYLE } from './blocky.js';
import { CreatureLayer } from './creatures.js';
import { Ocean } from './ocean.js';
import { Particles } from './particles.js';
import { Atmosphere, presetAt } from './atmosphere.js';
import { HQPipeline, LAYER_FX } from './pipeline.js';
import { Marine } from './marine.js';
import { Fauna } from './fauna.js';
import { dressTile, kit, tileSeed } from './dressing.js';
import { mulberry32 } from '../geo.js';
import * as B from '../models/buildings.js';
import { toWorld, key, CORNERS, DIRS } from '../hex.js';
import { GROUND } from '../ground.js';
import { Sky } from '../sky.js';
import { FX, landMaterial } from '../fx.js';
// 草、麦子、花每帧最多画多少个三角形（按植被档位）。手机 GPU 处理比像素还小的三角形效率最低，这是帧率的第一道闸
const FIELD_BUDGET = { ultra: 600000, high: 420000, mid: 280000, low: 160000 };
import { QUALITY } from '../config.js';
import { updateView, inView, throttle } from './cull.js';

const CH = 4;                  // 区块边长（格）
const SB = 32, SB_SEG = 56;    // 海底方块边长（世界单位）和细分（0.57 单位一格）；大块 = 少绘制次数
const SB_RANGE = 44;           // 镜头周围多大范围内铺海底
const FAUNA_RANGE = 26;        // 离镜头多远以内的区块，动物才更新
const RECLAIM = 70;            // 离镜头多远以外的区块释放显存（再加上镜头距离）
const SHADOW_KITS = new Set(['con', 'broad', 'palm']);
/** 把若干几何按各自的位置/朝向/缩放烘进世界坐标再合并。属性组合不同的分组合并；返回的几何都标成“自有”，区块销毁时释放 */
function mergeTransformed(list, keep = null) {
  if (!list.length) return [];
  const groups = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const it of list) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    for (const n of Object.keys(g.attributes)) if ((keep && !keep.includes(n)) || n === 'uv' && !keep) g.deleteAttribute(n);
    const s = it.s || 1; m4.compose(p.fromArray(it.pos || [0, 0, 0]), q.setFromEuler(e.set(0, it.ry || 0, 0)), sc.set(s, s, s)); g.applyMatrix4(m4);
    const sig = Object.entries(g.attributes).map(([n, a]) => n + a.itemSize + (a.normalized ? 'n' : '') + a.array.constructor.name).sort().join('|');
    let L = groups.get(sig); if (!L) groups.set(sig, L = []); L.push(g);
  }
  const out = [];
  for (const L of groups.values()) { const g = L.length === 1 ? L[0] : mergeGeometries(L, false); for (const x of L) if (x !== g) x.dispose(); if (g) { g.userData.owned = true; g.computeBoundingSphere(); out.push(g); } }
  return out;
}
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const now = () => performance.now();

/** 游戏地块 → 高画质地形类型。草地里约三分之一按位置固定成花草地，让大片草地有变化 */
const GAME2HQ = { meadow: 'meadow', forest: 'forest', mountain: 'mountain', garden: 'field', wheat: 'wheat', harbor: 'beach', home: 'camp', islet: 'islet' };
/** 自由画布直接用高画质的地形类型（花草地、采石场、溪流、池塘……），不在映射表里的原样使用 */
export function hqType(t, q, r) { if (t === 'meadow' && tileSeed(q, r) % 100 < 34) return 'flowers'; return GAME2HQ[t] || t || 'meadow'; }
const MARK_DY = { forest: 1.3, garden: 0.42, wheat: 0.5, harbor: 0.55 };

export class HQView {
  /** cfg：最终画面配置（config.js 的 gfx() 算出来的：预设 + 自定义） */
  constructor(canvas, cfg) {
    this.kind = 'hq';
    this.q = cfg;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    // 阴影过滤：极致档用柔和阴影（采样多），其余用普通 PCF（手机上每个像素省一半以上的阴影采样）
    r.shadowMap.enabled = true; r.shadowMap.type = (this.q.shadow || 0) >= 4096 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.resScale = 1;
    this.scene = new THREE.Scene();
    this.atmo = new Atmosphere(r, this.scene);
    if (this.q.shadow) this.atmo.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sky = new Sky();                 // 只用来给界面提供小时和时间文字
    this.mats = {
      terrain: terrainMaterial(), peak: terrainMaterial({ flat: true, env: 0.5 }),
      prop: propMaterial({ rough: 0.8 }), soil: propMaterial({ rough: 0.95 }), clay: propMaterial({ rough: 0.6, env: 1 }),
      tree: foliageMaterial({ sway: 1, translucency: 0.45 }), bush: foliageMaterial({ sway: 0.5, translucency: 0.35 }),
    };
    this.mat = landMaterial();            // 地标、小人、装饰沿用低多边形模型和它们的材质（夜里窗户会亮）
    this.terrain = new Terrain([], {});
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.faunaRoot = new THREE.Group(); this.scene.add(this.faunaRoot);
    this.rec = new Map();       // 地块键 → { tt, ck, hidden, top, rock, dress, extra }
    this.chunks = new Map();    // 区块键 → { keys:Set, group, dirty, fauna, faunaSig, faunaAt }
    this.seabed = new Map();    // 海底方块键 → { mesh, ver }
    this.sbDirty = new Set();
    this.rising = [];
    this.focus = new THREE.Vector3(); this.dist = 22; this.dt = 0.016;
    this.hour = 15; this.bakedHour = -99;
    this.tris = 0;
    this.stats = { chunkMs: 0, builds: 0 };
    GROUND.top = 0.45;
    GROUND.y = (x, z) => this.terrain.heightAt(x, z) ?? 0.45;
    GROUND.water = (x, z) => (this.ocean ? this.ocean.surfaceAt(x, z).h : 0);
    this.markers = new HQMarkers(this);
  }

  // ---------------- 初始化（需要镜头） ----------------
  attach(cam) {
    this.camera = cam;
    cam.near = 0.3; cam.far = 420; cam.updateProjectionMatrix();
    this.pipe = new HQPipeline(this.renderer, this.scene, cam);
    this.ocean = new Ocean({ terrain: this.terrain, sceneColor: this.pipe.sceneColor, sceneDepth: this.pipe.sceneDepth, shoreSize: 256, shoreSpan: 64 });
    this.ocean.mesh.layers.set(LAYER_FX); this.scene.add(this.ocean.mesh);
    this.fx = new Particles(this.pipe.sceneDepth, { pollen: 700, mist: 260, flame: 90, spark: 40, smoke: 60, fly: 120 });
    this.mats.stream = streamMaterial(this.pipe.sceneColor, this.pipe.sceneDepth);
    this.mats.pond = streamMaterial(this.pipe.sceneColor, this.pipe.sceneDepth, 0.04); this.mats.pond.uniforms.uTint.value.set(0x2f6b4a);
    this.gulls = new Gulls(this.scene);
    this.batcher = new Batcher(this.scene);
    this.villagers = new Villagers(this);
    this.wild = new Wildlife(this);
    this.creatures = new CreatureLayer(this);   // AI 创造的动物
    this.skyLayer = new SkyLayer(this.scene);
    this.fires = new Map();
    this.items = new ItemLayer(this);
    this.fx.points.layers.set(LAYER_FX); this.fx.smoke.layers.set(LAYER_FX); this.scene.add(this.fx.points);
    this.fireLight = new THREE.PointLight(0xff8a3a, 0, 3.2, 2); this.scene.add(this.fireLight);
    this.applyQuality();
    this.setHour(this.hour, true);
  }
  applyQuality() {
    const q = this.q, o = this.pipe.opts, r = this.renderer;
    o.ao = !!q.ao; o.dof = q.dof || 'off'; o.bloom = !!q.bloom; o.smaa = !!q.aa;
    this.pipe.grade.uniforms.uSharp.value = q.sharpen || 0;
    this.pipe.grade.uniforms.uCA.value = 0;            // 色差在手机小屏上会让边缘发糊，游戏里不用
    r.setPixelRatio(this._pr());
    // 阴影：0 = 关（换开关要让材质重新编译）
    const on = q.shadow > 0, s = this.atmo.sun.shadow;
    if (r.shadowMap.enabled !== on) { r.shadowMap.enabled = on; this.atmo.sun.castShadow = on; this.scene.traverse((m) => { if (m.material) [].concat(m.material).forEach((x) => { x.needsUpdate = true; }); }); }
    if (on && s.mapSize.x !== q.shadow) { s.mapSize.set(q.shadow, q.shadow); s.map?.dispose(); s.map = null; }
    const type = (q.shadow || 0) >= 4096 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (r.shadowMap.type !== type) { r.shadowMap.type = type; this.scene.traverse((m) => { if (m.material) [].concat(m.material).forEach((x) => { x.needsUpdate = true; }); }); }
    this.shadowDirty = true;
  }
  /** 动态分辨率：在渲染精度上再乘一个 0.85–1 的系数（调用方随后要 resize） */
  setResScale(k) { this.resScale = k; this.renderer.setPixelRatio(this._pr()); }
  /** 渲染精度：设置值、屏幕像素比取小，再受“像素预算”限制——高分屏上原生渲染的像素数是 2 倍渲染的两三倍，肉眼几乎分不出，
   *  帧率却差一大截。预算内的画面再经过自适应锐化，观感接近原生 */
  _pr() {
    const w = this.w || innerWidth, h = this.h || innerHeight, budget = { 4096: 2.1e6, 2048: 1.7e6, 1024: 1.2e6 }[this.q.shadow] || 1.4e6;
    let pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    pr = Math.min(pr, Math.sqrt(budget / (w * h)));
    return Math.max(1, pr) * (this.resScale ?? 1);
  }
  /** 换画面配置。返回 true 表示植被或生物数量变了，需要重新生成（调用方走加载页） */
  setConfig(cfg) {
    const old = this.q; this.q = cfg; this.resScale = 1;
    this.applyQuality();
    const regen = old.grass !== cfg.grass || old.flowers !== cfg.flowers || old.trees !== cfg.trees || old.life !== cfg.life;
    if (regen) { for (const r of this.rec.values()) this._invalidate(r, { dress: true }); for (const ch of this.chunks.values()) { if (ch.fauna) { ch.fauna.dispose(); ch.fauna = null; } ch.faunaSig = null; } }
    for (const ch of this.chunks.values()) ch.far = null;   // 视距变了：草叶的远近开关重新判断
    if (this.w) this.resize(this.w, this.h);
    return regen;
  }
  setQuality() { /* 由 setConfig 代替 */ }

  /** 距离 d 处，一个单位长度在屏幕上占多少像素（按实际渲染的像素算） */
  ppu(d) { const h = this.renderer.domElement.height || 720, f = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2); return h / (2 * Math.max(0.05, d) * f); }
  /** 反过来：一个单位占 px 像素时的距离 */
  ppuDist(px) { const h = this.renderer.domElement.height || 720, f = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2); return h / (2 * px * f); }
  // ---------------- 地块 ----------------
  _ck(q, r) { return Math.floor(q / CH) + ',' + Math.floor(r / CH); }
  _chunk(ck) { let ch = this.chunks.get(ck); if (!ch) { ch = { ck, keys: new Set(), group: null, dirty: true, fauna: null, faunaSig: null, faunaAt: 0 }; this.chunks.set(ck, ch); } return ch; }
  _invalidate(rec, { top = false, rock = false, dress = false } = {}) {
    if (top && rec.top) { rec.top.dispose(); rec.top = null; }
    if (top && rec.topLo) { rec.topLo.dispose(); rec.topLo = null; }
    if (rock && rec.rock) { rec.rock.dispose(); rec.rock = null; }
    if (rock) rec.rockDone = false;
    if (dress && rec.dress) { for (const m of rec.dress.meshes) if (!m.shared) m.geo.dispose(); for (const w of rec.dress.water || []) w.geo.dispose(); rec.dress = null; }
    this._chunk(rec.ck).dirty = true;
  }
  /** t: 游戏地块的显示信息 { q, r, t, dir, center, harvested, lm }；rise=true 时从海里升起 */
  setTile(t, rise = false) {
    const k = key(t.q, t.r);
    let rec = this.rec.get(k);
    if (rec) {
      // 已有的地块：只可能是收获状态变了
      if (rec.tt.harvested !== !!t.harvested) { rec.tt.harvested = !!t.harvested; this._invalidate(rec, { dress: true }); }
      return;
    }
    const tt = { q: t.q, r: t.r, t: hqType(t.t, t.q, t.r), game: t.t, dir: t.dir || 0, center: !!t.center, harvested: !!t.harvested };
    const affected = this.terrain.addTile(tt);
    rec = { tt, k, ck: this._ck(t.q, t.r), hidden: rise, top: null, rock: null, dress: null, affected };
    this.rec.set(k, rec);
    this._chunk(rec.ck).keys.add(k);
    // 海底：陆地距离场变了，附近的方块要重建
    for (const sk of this.seabed.keys()) { const [sx, sz] = sk.split(',').map(Number); if (Math.abs((sx + 0.5) * SB - tt.x) < SB / 2 + 17 && Math.abs((sz + 0.5) * SB - tt.z) < SB / 2 + 17) this.sbDirty.add(sk); }
    this.landChanged = now();
    this.markers.clearCache();
    if (rise) {
      // 先单独升起这一块；邻居的岩壁等它升完再改，升起过程中不会露出缺口
      const g = this._tileGroup(rec, { blades: true });
      g.position.y = -1.4; this.root.add(g);
      this.rising.push({ rec, g, t: 0 });
      if (this.ocean) { this.ocean.ripple(tt.x, tt.z, 1.6); this.marine?.splash.emit(tt.x, 0.02, tt.z, 60, { speed: 0.5, up: 1.2, spread: 0.9, size: 0.03, life: 1.1 }); }
    } else this._touchNeighbors(rec);
  }
  _touchNeighbors(rec, self = true) {
    if (self) this._invalidate(rec, { top: true, rock: true, dress: true }); else this._chunk(rec.ck).dirty = true;
    // 邻居 + 水网里受影响的地块（河道改道、出海口换位置）
    const keys = new Set([...DIRS.map((d) => key(rec.tt.q + d[0], rec.tt.r + d[1])), ...(rec.affected || [])]); keys.delete(rec.k);
    for (const kk of keys) { const n = this.rec.get(kk); if (n) this._invalidate(n, { top: true, rock: true, dress: true }); }
    rec.affected = null; this.waterDirty = true;
  }
  /** 删掉一块地（自由画布的橡皮擦） */
  removeTile(q, r) {
    const k = key(q, r), rec = this.rec.get(k); if (!rec) return false;
    const affected = this.terrain.removeTile(q, r);
    this._invalidate(rec, { top: true, rock: true, dress: true });
    this.rec.delete(k); this._chunk(rec.ck).keys.delete(k); this._chunk(rec.ck).faunaSig = null;
    for (const kk of affected) { const n = this.rec.get(kk); if (n) this._invalidate(n, { top: true, rock: true, dress: true }); }
    for (const sk of this.seabed.keys()) { const [sx, sz] = sk.split(',').map(Number); if (Math.abs((sx + 0.5) * SB - rec.tt.x) < SB / 2 + 17 && Math.abs((sz + 0.5) * SB - rec.tt.z) < SB / 2 + 17) this.sbDirty.add(sk); }
    this.landChanged = now(); this.markers.clearCache(); this.waterDirty = true;
    if (this.ocean) { this.ocean.ripple(rec.tt.x, rec.tt.z, 1.2); this.marine?.splash.emit(rec.tt.x, 0.02, rec.tt.z, 50, { speed: 0.45, up: 1.1, spread: 0.9, size: 0.03, life: 1 }); }
    return true;
  }
  tileType(q, r) { const rec = this.rec.get(key(q, r)); return rec ? rec.tt.t : null; }
  rebuildAll(tiles) {
    for (const ch of this.chunks.values()) this._disposeChunk(ch, true);
    for (const r of this.rec.values()) this._invalidate(r, { top: true, rock: true, dress: true });
    for (const s of this.seabed.values()) { this.root.remove(s.mesh); s.mesh.geometry.dispose(); }
    for (const a of this.rising) { this.root.remove(a.g); this._disposeGroup(a.g); }
    this.chunks.clear(); this.rec.clear(); this.seabed.clear(); this.sbDirty.clear(); this.rising = [];
    this.terrain = new Terrain([], {});
    if (this.ocean) this.ocean.terrain = this.terrain;
    if (this.marine) { this.marine.terrain = this.terrain; }
    for (const t of tiles) this.setTile(t);
    this.shoreAt = null; this.marineAt = 0; this.landChanged = now() - 5000;
  }
  setLand() { /* 陆地距离场在 setTile 里已经增量更新 */ }

  /** 计算一块地的顶面、侧面和装点（有缓存） */
  _ensure(rec) {
    const T = this.terrain, tt = rec.tt;
    if (!rec.top) rec.top = T.tileTop(tt);
    if (!rec.topLo) rec.topLo = T.tileTop(tt, SUB_LO);   // 远处用的粗版地面（三角形 1/9）
    if (!rec.rockDone) { rec.rock = T.tileRock(tt); rec.rockDone = true; }
    if (!rec.dress) {
      rec.dress = dressTile(T, tt, { grass: this.q.grass ?? 0.4, flowers: this.q.flowers ?? 0.5, trees: this.q.trees ?? 1 });
      this._extras(rec);
      this._water(rec);
    }
  }
  /** 水面：溪流的河面（沿河道的带状网格）、出海口的瀑布、池塘和泉眼的静水 */
  _water(rec) {
    const T = this.terrain, tt = rec.tt, d = rec.dress, lines = T.lines.get(rec.k) || [];
    d.falls = []; d.water = [];
    for (const pl of lines) {
      const pts = pl.map(([x, z]) => [x, T.heightIn(tt, x, z) + 0.045, z]);
      for (let i = 1; i < pts.length; i++) pts[i][1] = Math.min(pts[i][1], pts[i - 1][1] + 0.002);
      d.water.push({ geo: ribbon(pts, (u) => 0.11 + Math.sin(u * 18 + tt.q) * 0.01, 0), mat: 'stream' });
    }
    if (tt.fall && lines.length) {
      const last = lines[lines.length - 1], ex = last[last.length - 1][0], ez = last[last.length - 1][1], y0 = T.heightIn(tt, ex, ez) + 0.04, pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, o = 0.05 + Math.pow(u, 0.6) * 0.28 + u * 0.05; pts.push([ex + tt.fall.nx * (0.04 + o), y0 * (1 - u) - 0.02 * u, ez + tt.fall.nz * (0.04 + o)]); }
      d.water.push({ geo: ribbon(pts, (u) => 0.1 + u * 0.05, 1), mat: 'stream' });
      d.falls.push([pts[10][0], pts[10][2]]);
    }
    const pd = d.pond;
    if (pd) {
      const y = tt.base - (pd.spring ? 0.035 : 0.05), g = new THREE.CircleGeometry(pd.r * (pd.spring ? 1.2 : 1.15), 40); g.rotateX(-Math.PI / 2); g.translate(pd.x, y, pd.z);
      const p = g.attributes.position, flow = new Float32Array(p.count * 2), fall = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - pd.x, dz = p.getZ(i) - pd.z; flow[i * 2] = Math.atan2(dz, dx) * pd.r; flow[i * 2 + 1] = Math.hypot(dx, dz) / pd.r * 0.55; }
      g.setAttribute('flow', new THREE.BufferAttribute(flow, 2)); g.setAttribute('fall', new THREE.BufferAttribute(fall, 1));
      d.water.push({ geo: g, mat: 'pond' }); pd.y = y;
    }
  }
  /** 沿用低多边形模型的部件：渔港的栈桥、地标小岛中心的石台 */
  _extras(rec) {
    const tt = rec.tt, d = rec.dress, rng = mulberry32(tileSeed(tt.q, tt.r));
    const add = (g, y, ry = 0, ox = 0, oz = 0) => { const geo = g.toGeometry(); d.meshes.push({ geo, mat: 'legacy', pos: [tt.x + ox, y, tt.z + oz], ry, legacy: true }); };
    if (tt.game === 'harbor') {
      const th = tt.dir * Math.PI / 3;
      add(B.pier(rng, 1.25).rotateY(Math.PI / 2 - th), tt.base - 0.06, 0, Math.cos(th) * 0.42, Math.sin(th) * 0.42);
    }
    if (tt.game === 'islet' && tt.center) add(B.isletBase(rng), tt.base - 0.02);
    if (d.fire) this.fires?.set('tile:' + rec.k, d.fire);
  }
  /** 一块地的完整网格组（升起动画、放置预览用） */
  _tileGroup(rec, { blades = true } = {}) {
    this._ensure(rec);
    const g = new THREE.Group();
    this._fill(g, [rec], blades);
    return g;
  }
  /** 把若干地块的缓存合并进一个组 */
  _fill(grp, recs, withBlades = true) {
    const tops = [], topsLo = [], rocks = [], inst = {}, blades = { grass: [], flower: [], wheat: [] }, meshes = [];
    for (const r of recs) {
      tops.push(r.top); if (r.topLo) topsLo.push(r.topLo); if (r.rock) rocks.push(r.rock);
      const d = r.dress;
      for (const [kk, items] of Object.entries(d.inst)) { const [name, v] = kk.split(':'); const L = inst[name] ||= []; for (const it of items) L.push({ ...it, v: +v }); }
      if (withBlades) for (const b of ['grass', 'flower', 'wheat']) { const src = d.blades[b]; for (let i = 0; i < src.length; i++) blades[b].push(src[i]); }
      meshes.push(...d.meshes);
    }
    const M = this.mats, own = (geo, src) => { if (!src.includes(geo)) geo.userData.owned = true; return geo; };
    if (tops.length) { const geo = own(mergeColored(tops), tops), m = new THREE.Mesh(geo, M.terrain); m.name = 'land-hi'; m.castShadow = m.receiveShadow = true; grp.add(m); }
    if (topsLo.length === tops.length && tops.length) { const geo = own(mergeColored(topsLo), topsLo), m = new THREE.Mesh(geo, M.terrain); m.name = 'land-lo'; m.visible = false; m.castShadow = m.receiveShadow = true; grp.add(m); }
    if (rocks.length) { const geo = own(mergeColored(rocks), rocks), m = new THREE.Mesh(geo, M.terrain); m.castShadow = m.receiveShadow = true; grp.add(m); }
    const K = kit();
    for (const [name, items] of Object.entries(inst)) {
      const mat = name === 'rock' || name === 'stump' || name === 'lily' || name === 'wrack' || name === 'drift' || name === 'shell' ? M.prop : name === 'bush' || name === 'crop' ? M.bush : M.tree;
      const g = instanced(K[name], items, mat); g.userData.inst = true; grp.add(g);
      // 只有树投影：灌木、石头、菜苗、芦苇、睡莲的影子几乎看不见，却要再画一遍
      if (!SHADOW_KITS.has(name) && !K[name]?.shadow) g.traverse((o) => { o.castShadow = false; });
      // 树的远近分级（LOD）：同一批树再做一份几十个三角面的简化版，远处的区块显示简化版、不投影
      if (K[name + 'Lo']) { g.name = 'tree-hi'; const lo = instanced(K[name + 'Lo'], items, mat); lo.name = 'tree-lo'; lo.visible = false; lo.traverse((o) => { o.castShadow = false; }); grp.add(lo); }
    }
    for (const [b, list] of Object.entries(blades)) if (list.length) { const m = bladeField(b, list, { cull: true }); m.geometry.userData.owned = true; grp.add(m); }
    const peaks = [];
    // 水面：同一种材质的河面、瀑布、池塘合成一个网格
    const water = { stream: [], pond: [] };
    for (const r of recs) for (const w of r.dress.water || []) water[w.mat === 'pond' ? 'pond' : 'stream'].push({ geo: w.geo, pos: [0, 0, 0] });
    for (const [k, list] of Object.entries(water)) for (const geo of mergeTransformed(list, ['position', 'flow', 'fall'])) {
      const m = new THREE.Mesh(geo, k === 'pond' ? M.pond : M.stream); m.layers.set(LAYER_FX); m.renderOrder = 5; m.frustumCulled = false; grp.add(m);
    }
    // 山峰、道具、菜垄、旧模型部件：按材质合并成一个网格（一次绘制）。山峰另留不进场景的占位，给山羊找落脚点用
    const byMat = {};
    for (const it of meshes) {
      (byMat[it.mat] ||= []).push(it);
      if (it.peak) { const m = new THREE.Mesh(it.geo); m.position.fromArray(it.pos); m.rotation.y = it.ry || 0; if (it.s) m.scale.setScalar(it.s); m.updateMatrixWorld(); peaks.push(m); }
    }
    for (const [k, list] of Object.entries(byMat)) {
      const mat = k === 'peak' ? M.peak : k === 'soil' ? M.soil : k === 'legacy' ? this.mat : M.prop;
      for (const geo of mergeTransformed(list)) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; grp.add(m); }
    }
    grp.userData.peaks = peaks;
    return grp;
  }
  _disposeGroup(g) {
    g.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.geometry?.userData.owned) o.geometry.dispose();
    });
  }
  _disposeChunk(ch, fauna = false) {
    if (ch.group) { this.root.remove(ch.group); this._disposeGroup(ch.group); ch.group = null; }
    if (fauna && ch.fauna) { ch.fauna.dispose(); ch.fauna = null; ch.faunaSig = null; }
  }
  _buildChunk(ch) {
    const t0 = now();
    ch.dirty = false;
    const recs = [...ch.keys].map((k) => this.rec.get(k)).filter((r) => r && !r.hidden);
    for (const r of recs) this._ensure(r);
    const old = ch.group;
    ch.group = recs.length ? this._fill(new THREE.Group(), recs) : null; ch.treeNear = null; ch.landNear = null; ch.far = null;
    if (ch.group) this.root.add(ch.group);
    if (old) { this.root.remove(old); this._disposeGroup(old); }
    // 升完的地块：区块重建好以后再撤掉它单独的网格，中间不会闪一下
    for (let i = this.rising.length - 1; i >= 0; i--) { const a = this.rising[i]; if (a.done && a.rec.ck === ch.ck) { this.root.remove(a.g); this._disposeGroup(a.g); this.rising.splice(i, 1); } }
    ch.recs = recs;
    const sig = recs.map((r) => r.k).sort().join('|');
    if (sig !== ch.faunaSig) { ch.faunaSig = sig; ch.faunaAt = now() + 900; }
    this.stats.chunkMs = now() - t0; this.stats.builds++;
  }
  /** 区块里的陆地动物：数量按地块类型算 */
  _buildFauna(ch) {
    if (ch.fauna) { ch.fauna.dispose(); ch.fauna = null; }
    const recs = ch.recs || []; if (!recs.length || !ch.group) return;
    const n = {}; for (const r of recs) n[r.tt.t] = (n[r.tt.t] || 0) + 1;
    const f = n.forest || 0, m = (n.meadow || 0) + (n.camp || 0), fl = n.flowers || 0, mt = n.mountain || 0, b = n.beach || 0, crop = (n.field || 0) + (n.wheat || 0), life = this.q.life ?? 1;
    const c = (v) => Math.max(0, Math.round(v * life));
    const counts = {
      deer: f ? c(Math.min(3, 1 + Math.floor(f / 2))) : 0, sheep: m + fl >= 2 ? c(Math.min(6, 2 + m)) : 0, goats: c(Math.min(3, mt)),
      rabbits: c(Math.min(6, fl * 2 + Math.floor(m / 2))), butterflies: c(Math.min(36, fl * 8 + m * 2 + crop)), songbirds: c(Math.min(8, f * 2 + (m ? 1 : 0))),
      crabs: c(Math.min(6, b * 2)), dragonflies: 0,
    };
    const ponds = recs.filter((r) => r.dress.pond && !r.dress.pond.spring), streams = recs.filter((r) => this.terrain.lines.has(r.k));
    counts.dragonflies = c(Math.min(9, ponds.length * 4 + streams.length * 2));
    counts.rabbits += c(ponds.length + streams.length > 0 && n.stream ? 1 : 0);
    if (!Object.values(counts).some((v) => v > 0)) return;
    const tiles = recs.map((r) => r.tt), taken = [], trees = [], flowers = [];
    for (const r of recs) { taken.push(...r.dress.obstacles); trees.push(...r.dress.perches); for (let i = 0; i < r.dress.flowers.length; i += 3) flowers.push(r.dress.flowers[i]); }
    for (const r of recs) if (r.tt.center) taken.push([r.tt.x, r.tt.z, 0.6]);
    const [cq, cr] = ch.ck.split(',').map(Number), T = this.terrain;
    const pr = ponds[0], pond = pr ? { ...pr.dress.pond } : null;
    const riverPts = []; for (const r of streams) for (const pl of T.lines.get(r.k)) for (let i = 0; i < pl.length; i += 2) riverPts.push([pl[i][0], T.heightIn(r.tt, pl[i][0], pl[i][1]) + 0.045, pl[i][1]]);
    ch.fauna = new Fauna({ scene: this.scene, parent: this.faunaRoot, terrain: T, tiles, taken, trees, flowers, peaks: ch.group.userData.peaks, splash: this.marine?.splash, center: new THREE.Vector3(tiles[0].x, 0, tiles[0].z), seed: (cq * 92821 + cr * 68917) >>> 0, counts,
      pond, lilyPads: pr?.dress.lilyPads || [], river: streams.length ? (x, z) => T.riverD(x, z) : null, riverPts, extBatch: true, variants: 1 });
  }

  // ---------------- 海底 ----------------
  _seabedTick(budget) {
    const fx = this.focus.x, fz = this.focus.z, need = [];
    const i0 = Math.floor((fx - SB_RANGE) / SB), i1 = Math.floor((fx + SB_RANGE) / SB), j0 = Math.floor((fz - SB_RANGE) / SB), j1 = Math.floor((fz + SB_RANGE) / SB);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i + ',' + j; if (!this.seabed.has(k) || this.sbDirty.has(k)) need.push([Math.hypot((i + 0.5) * SB - fx, (j + 0.5) * SB - fz), k, i, j]);
    }
    need.sort((a, b) => a[0] - b[0]);
    const t0 = now();
    for (const [, k, i, j] of need) {
      if (now() - t0 > budget) break;
      const old = this.seabed.get(k);
      const mesh = this.terrain.buildSeabed(this.mats.terrain, SB / 2, SB_SEG, (i + 0.5) * SB, (j + 0.5) * SB);
      this.root.add(mesh);
      if (old) { this.root.remove(old.mesh); old.mesh.geometry.dispose(); }
      this.seabed.set(k, { mesh }); this.sbDirty.delete(k);
    }
    // 太远的方块收起来
    for (const [k, s] of this.seabed) { const [i, j] = k.split(',').map(Number); if (Math.abs((i + 0.5) * SB - fx) > SB_RANGE + SB * 1.5 || Math.abs((j + 0.5) * SB - fz) > SB_RANGE + SB * 1.5) { this.root.remove(s.mesh); s.mesh.geometry.dispose(); this.seabed.delete(k); } }
  }

  // ---------------- 时间 ----------------
  setHour(h, force = false) {
    this.hour = h; this.sky.set(h);
    if (!this.pipe) return;
    const p = presetAt(h);
    let dh = Math.abs(h - this.bakedHour); dh = Math.min(dh, 24 - dh);
    const bake = force || dh > 0.2;
    if (bake) this.bakedHour = h;
    this.atmo.apply(p, this.ocean, this.pipe, bake);
    this.nightK = p.nightK;
    this.skyLayer?.setHour(h, p);
    this._seaTint();
    for (const m of [this.mats.stream, this.mats.pond]) {
      const u = m.uniforms; u.uSunDir.value.copy(this.atmo.dir); u.uSunColor.value.set(p.sun).multiplyScalar(p.sunI * 0.3); u.uSky.value.set(p.zen).lerp(new THREE.Color(p.hor), 0.35); u.uFogColor.value.set(p.fog); u.uFogDensity.value = p.fogD;
    }
    FX.uNight.value = Math.min(1, p.nightK * 1.1 + (p.lamp > 0.3 ? 0.2 : 0)); FX.uCloud.value = 1 - p.nightK;
    this.fireBase = 0.8 + p.nightK * 0.7 + (p.lamp > 0.3 ? 0.25 : 0);
    this.onSky?.(this.sky);
  }

  // ---------------- 每帧 ----------------
  resize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(this._pr());
    this.renderer.setSize(w, h, false);
    if (!this.pipe) return;
    this.pipe.setSize(w, h);
    for (const u of this._fxUniforms()) u.uResolution?.value.set(this.pipe.W, this.pipe.H);
    this.fovChanged();
  }
  /** 视野变了：粒子按屏幕像素算大小，要跟着换算 */
  fovChanged() {
    if (!this.pipe) return;
    const pr = this.pipe.H / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.uniforms.uPR.value = pr; if (this.marine) this.marine.splash.uniforms.uPR.value = pr;
  }
  _fxUniforms() { return [this.ocean.uniforms, this.fx.uniforms, this.mats.stream.uniforms, this.mats.pond.uniforms, ...(this.marine ? [this.marine.splash.uniforms] : [])]; }
  /** 瀑布：最近的 4 道给海面加落水白沫，最近的 2 道冒水雾 */
  _falls() {
    const all = [];
    for (const r of this.rec.values()) if (r.dress && !r.hidden) for (const f of r.dress.falls || []) all.push(f);
    const fx = this.focus.x, fz = this.focus.z;
    all.sort((a, b) => Math.hypot(a[0] - fx, a[1] - fz) - Math.hypot(b[0] - fx, b[1] - fz));
    this.ocean.setFalls(all.slice(0, 4).map(([x, z]) => [x, z, 0.4]));
    this.fallMist = all.slice(0, 2).map(([x, z]) => [x, 0.02, z]);
  }
  update(dt, focus, dist) {
    this.dt = dt; this.focus.copy(focus); this.dist = dist;
    updateView(this.camera);   // 这一帧的镜头视锥：画面外的东西不画、降频更新
    U.uTime.value += dt;
    const t = U.uTime.value;
    // 升起的地块
    for (const a of this.rising) {
      if (a.done) continue;
      a.t += dt / 0.8;
      if (a.t >= 1) { a.g.position.y = 0; a.done = true; a.rec.hidden = false; this._touchNeighbors(a.rec, false); }
      else a.g.position.y = -1.4 * (1 - easeOutBack(a.t));
    }
    // 区块重建：先逐块地算缓存（每块地十几毫秒），全部就绪再合并；有升完的地块的区块优先，其余按离镜头远近。
    // 每帧最多花 budget 毫秒；旧网格和升起的那块一直显示到新网格建好，中途不会出现缺口
    // 远处区块回收：离镜头很远的区块释放显存里的网格和动物（每块地的计算缓存留着，回来时直接合并）；
    // 回收掉的区块标成待重建，但要等镜头回到附近才真正重建
    const reclaim = RECLAIM + dist, cdist = (c) => { const [q, r] = c.ck.split(',').map(Number), [x, z] = toWorld((q + 0.5) * CH, (r + 0.5) * CH); return Math.hypot(x - focus.x, z - focus.z); };
    if ((this._reclaimT = (this._reclaimT || 0) + dt) > 1) {
      this._reclaimT = 0;
      for (const c of this.chunks.values()) if (c.group && cdist(c) > reclaim + 10) { this._disposeChunk(c, true); c.dirty = true; this.stats.reclaimed = (this.stats.reclaimed || 0) + 1; }
    }
    const dirty = [...this.chunks.values()].filter((c) => c.dirty && cdist(c) < reclaim);
    if (dirty.length) {
      const pri = (c) => { const [q, r] = c.ck.split(',').map(Number), [x, z] = toWorld((q + 0.5) * CH, (r + 0.5) * CH); return Math.hypot(x - focus.x, z - focus.z) - (this.rising.some((a) => a.done && a.rec.ck === c.ck) ? 1e4 : 0); };
      dirty.sort((a, b) => pri(a) - pri(b));
      const t0 = now(), budget = this.loading ? 40 : 8;
      outer: for (const c of dirty) {
        for (const k of c.keys) { const r = this.rec.get(k); if (!r || r.hidden || (r.top && r.rockDone && r.dress)) continue; if (now() - t0 > budget) break outer; this._ensure(r); }
        if (now() - t0 > budget * 1.5) break;
        this._buildChunk(c);
      }
    }
    this.loading = dirty.length > 0 && this.stats.builds < this.chunks.size;
    this.chunksDirty = dirty.length > 0 && dirty.some((c) => c.dirty);
    if (dirty.length && !this.chunksDirty) this.waterDirty = true;
    // 远处区块的草叶、花、麦穗不画（它们只有几个像素，却占了大部分顶点）
    const bladeRange = (34 + dist * 0.9) * (this.q.viewK ?? 1);
    // 细节调节：按最近的平均帧时间慢慢调 lodK（0.2–1）。目标是稳在 30 帧以上：超过 36ms 就减，低于 24ms 就加
    this.lodK ??= 1; this._ft = (this._ft ?? 0.02) * 0.95 + dt * 0.05;
    if (!this.loading) { if (this._ft > 0.036) this.lodK = Math.max(0.2, this.lodK - dt * 0.25); else if (this._ft < 0.024) this.lodK = Math.min(1, this.lodK + dt * 0.06); }
    const fields = [];
    for (const ch of this.chunks.values()) {
      if (!ch.group) continue;
      const [q, r] = ch.ck.split(',').map(Number), [x, z] = toWorld((q + 0.5) * CH, (r + 0.5) * CH), far = Math.hypot(x - focus.x, z - focus.z) > bladeRange;
      if (ch.far !== far) { ch.far = far; for (const o of ch.group.children) if (o.name?.endsWith('-field')) o.visible = !far; }
      // 树：离镜头近的区块用完整的树，远的换简化版；切换距离跟细节系数走（帧时间超标时更早换）
      // 按到镜头的真实距离算（全岛俯瞰时远处的树在屏幕上只有十几个像素，用简化版看不出差别）
      // 按“在屏幕上占多少像素”分级（人眼看不出差别的就画简单的）：ppu = 这个距离上一个单位长度占多少个屏幕像素
      const cp = this.camera.position, ppu = this.ppu(Math.hypot(x - cp.x, z - cp.z, cp.y - 0.45)), detail = (0.55 + 0.45 * this.lodK) * (this.q.viewK ?? 1);
      // 树：完整树冠的一个三角形边长约 0.05，小于 4 像素就换简化树
      const treeNear = ppu * detail > 80;
      if (ch.treeNear !== treeNear) { ch.treeNear = treeNear; for (const o of ch.group.children) { if (o.name === 'tree-hi') o.visible = treeNear; else if (o.name === 'tree-lo') o.visible = !treeNear; } }
      // 地面：细地面一个三角形边长约 0.032，小于 4 像素就换粗地面（粗地面边长约 0.1）
      const landNear = ppu * detail > 125;
      if (ch.landNear !== landNear) { ch.landNear = landNear; for (const o of ch.group.children) { if (o.name === 'land-hi') o.visible = landNear || !ch.group.children.some((c) => c.name === 'land-lo'); else if (o.name === 'land-lo') o.visible = !landNear; } }
      // 草叶分级：近处全画，越远画得越少（实例顺序是打乱的，所以是均匀变稀）；镜头拉远时整体再减；
      // 再乘上“细节调节”系数 lodK——帧时间超标时自动减草、有余量时加回来，分辨率和清晰度不动
      if (!far) {
        // 第一视觉（草叶在屏幕上清楚可见）满密度，往外随屏幕大小递减：一根草叶宽约 0.006，远到不足半个像素时只留三成撑住颜色
        const d = Math.hypot(x - focus.x, z - focus.z), seen = THREE.MathUtils.clamp((ppu * 0.006 - 0.5) / 1.3, 0.3, 1), f = THREE.MathUtils.clamp(1.15 - (d - 5) / (bladeRange - 5), 0.22, 1) * THREE.MathUtils.clamp(13 / dist, 0.4, 1) * this.lodK * seen;
        for (const o of ch.group.children) if (o.name?.endsWith('-field') && o.geometry.userData.n) { o.geometry.instanceCount = Math.max(1, Math.ceil(o.geometry.userData.n * Math.min(1, f))); fields.push(o); }
      }
    }
    // 每帧硬预算：草、麦子、花加起来的三角形不超过本档上限，超了就按比例一起变稀（近处远处同比例，画面密度均匀）
    { let sum = 0; for (const o of fields) sum += o.geometry.instanceCount * ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
      const cap = FIELD_BUDGET[this.q.veg] ?? FIELD_BUDGET.high; this.stats.fieldTris = sum;
      if (sum > cap) { const k = cap / sum; for (const o of fields) o.geometry.instanceCount = Math.max(1, Math.floor(o.geometry.instanceCount * k)); } }
    // 着色器预热：第一批区块和海洋生态就绪后，把所有材质编译一遍，避免第一次转镜头时卡顿
    if (!this.prewarmed && this.marine && !this.chunksDirty && this.stats.builds > 0) { this.prewarmed = true; try { this.renderer.compile(this.scene, this.camera); } catch { /* 不支持就算了 */ } }
    // 动物：区块建好一会儿以后再生成；远处的暂停
    let faunaBuilt = false;
    for (const ch of this.chunks.values()) {
      if (ch.faunaAt && now() > ch.faunaAt && !faunaBuilt && !ch.dirty) { ch.faunaAt = 0; this._buildFauna(ch); faunaBuilt = true; }
      if (!ch.fauna) continue;
      const c = ch.fauna.env.center, near = Math.hypot(c.x - focus.x, c.z - focus.z) < (FAUNA_RANGE + dist * 0.3) * (this.q.viewK ?? 1);
      ch.fauna.group.visible = near;
      const cp = this.camera.position, fd = Math.hypot(c.x - cp.x, c.z - cp.z, cp.y * 0.7); ch.fauna.setFlyers(fd < (8 + 8 * this.lodK) * (this.q.viewK ?? 1)); ch.fauna.setFlyerDetail(dist < 2.6);
      // 降频：离镜头 14 单位以外的动物隔一帧更新一次（时间步加倍，动作速度不变）
      ch.fauna.env.hour = this.hour;   // 各物种按钟点作息
      // 画面外的区块：动物每 4 帧动一次；画面里但离得远的隔一帧动一次
      if (near) { const seen = inView(c.x, 0.5, c.z, CH * 1.1), mid = Math.hypot(c.x - focus.x, c.z - focus.z) > 14; if (!seen) throttle(ch, false, dt, (d) => ch.fauna.update(d, t)); else if (!mid) ch.fauna.update(dt, t); else if ((ch.tick = !ch.tick)) ch.fauna.update(dt * 2, t); }
    }
    // 海底
    this._seabedTick(this.seabed.size ? 4 : 40);
    // 岸边浪花场 + 海面中心：岛变了或镜头走远了就重算
    const sc = this.ocean.shore, moved = Math.hypot(focus.x - sc.cx, focus.z - sc.cz) > 9;
    if ((this.landChanged && now() - this.landChanged > 200 && this.landChanged !== this.shoreAt) || moved) {
      this.shoreAt = this.landChanged;
      this.ocean.recenter(Math.round(focus.x), Math.round(focus.z));
    }
    // 海洋生态：第一次有陆地时生成；岛变了以后等 1.5 秒合并成一次重建
    if (this.terrain.tiles.length) {
      if (!this.marine) this._makeMarine();
      else if (this.landChanged && this.landChanged !== this.marineAt && now() - this.landChanged > 1500 && !this.rising.length) { this.marineAt = this.landChanged; this._rebuildMarine(); }
      this.marine.update(dt, t);
    }
    // 镜头相关
    this.atmo.follow(focus.x, focus.z, THREE.MathUtils.clamp(dist * 0.62, 8, 26));
    // 阴影缓存：阴影贴图画一次就一直用，只有这些时候才重画——阴影范围换档 / 镜头挪出一格（范围的 1/4）、太阳转过约 0.15°、
    // 地块在重建或升起、摆放 / 删除了东西。会动的动物不画进阴影贴图（它们脚下是每帧跟着走的软圆影子），所以缓存不会“留残影”
    { const s = this.atmo.sun, d = this.atmo.dir, c = this.atmo.center, key = [c.x, c.z, s.shadow.camera.right, Math.round(d.x * 400), Math.round(d.y * 400), Math.round(d.z * 400)].join(); s.shadow.autoUpdate = false;
      if (key !== this._shKey || this.chunksDirty || this.rising.length || this.shadowDirty) { s.shadow.needsUpdate = true; this._shKey = key; this.shadowDirty = false; this.stats.shadowRenders = (this.stats.shadowRenders || 0) + 1; } }
    if (this.waterDirty && !this.chunksDirty) { this.waterDirty = false; this._falls(); }
    const mist = this.fallMist || [];
    this.fx.setEmitters({ falls: mist.length ? mist : [[0, -50, 0]], fire: this.fireAt || [0, -50, 0], night: this.nightK > 0.4 ? this.nightK : 0, dark: this.nightK, pollen: [focus.x - 1, 0, focus.z + 0.3], flies: [focus.x - 0.6, 0, focus.z - 0.1] });
    this.gulls.update(t);
    this.items.update(dt, t);
    // 村民和渔船：地块稳定以后按营地和小路重排，然后按作息活动
    if (!this.chunksDirty && (this._vilT = (this._vilT || 0) + dt) > 1) { this._vilT = 0; this.villagers.sync(); }
    this.villagers.update(dt, t);
    this.wild.update(dt, t);   // 鹬、白鹭、燕鸥、蝙蝠、跃鱼
    if (!this.chunksDirty) this.creatures.populate(); this.creatures.update(dt, t);
    this.skyLayer.update(dt, focus, this.gulls.center, Math.max(3, this.gulls.radius - 1.5));   // 地平线的云、清晨海雾
    if (this.q.ao && !this.chunksDirty) { this.macro ||= new MacroLayer(this); this.macro.update(focus, dist); this.pipe.opts.macro = Math.max(0, Math.min(1, (4.2 - dist) / 2.8)); }   // 特写的微距草地和浅景深（极致、高清档）
    // 动物、海龟、海鸥、村民、岸边的鸟：全岛合批（同一部件一次绘制）
    // 动物和小件：屏幕上高度不到 40 像素（约 0.15 单位高）换简化模型
    this.batcher.sync([this.faunaRoot, this.marine?.group, this.gulls.group, this.villagers.group, this.wild.group, this.creatures.group, this.items.makeRoot], this.camera, (11 + 10 * this.lodK) * (this.q.viewK ?? 1), this.ppuDist(260 / (0.55 + 0.45 * this.lodK)), (x, z) => this.terrain.heightAt(x, z));
    // 营火：离镜头最近的那一处冒火苗和炊烟
    let bestF = null, bd = 1e9; for (const f of this.fires.values()) { const d = Math.hypot(f[0] - focus.x, f[2] - focus.z); if (d < bd) { bd = d; bestF = f; } }
    this.fireAt = bestF;
    if (this.fireAt) { this.fireLight.position.set(this.fireAt[0], this.fireAt[1] + 0.12, this.fireAt[2]); this.fireLight.intensity = this.fireBase * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 23.1) * 0.05); }
    this.markers.update(dt);
    const cam = this.camera;
    for (const u of this._fxUniforms()) { if (u.cameraNear) { u.cameraNear.value = cam.near; u.cameraFar.value = cam.far; } }
  }
  /** 加载页用：把镜头附近需要的一切一次性做完。cb(进度 0–1, 步骤文字)；每 40ms 让出一次主线程，好让进度条动起来 */
  async preload(cb, focus, dist = 20) {
    const pause = () => new Promise((r) => setTimeout(r, 0));
    let last = now();
    const tick = async (p, text) => { if (now() - last > 40) { cb(p, text); await pause(); last = now(); } };
    const T0 = now(), steps = this.loadSteps = {}; let ts = T0; const mark = (k) => { const t = now(); steps[k] = Math.round(t - ts); ts = t; };
    this.focus.copy(focus); this.dist = dist;
    // 1. 地形和植被：所有区块
    const recs = [...this.rec.values()].filter((r) => !r.hidden);
    for (let i = 0; i < recs.length; i++) { this._ensure(recs[i]); await tick(0.05 + 0.45 * i / recs.length, '生成地形和植被'); }
    mark('tiles');
    for (const ch of this.chunks.values()) if (ch.dirty) { this._buildChunk(ch); await tick(0.52, '合并网格'); }
    mark('chunks');
    // 2. 海底、海岸浪花场
    cb(0.55, '铺设海底'); await pause();
    let guard = 0; while (guard++ < 200) { const before = this.seabed.size; this._seabedTick(60); await tick(0.55 + Math.min(0.15, this.seabed.size / 200), '铺设海底'); if (this.seabed.size === before && !this.sbDirty.size) break; }
    this.ocean.recenter(Math.round(focus.x), Math.round(focus.z)); this.shoreAt = this.landChanged;
    mark('seabed');
    // 3. 海洋生态
    cb(0.72, '放出鱼群和海洋生物'); await pause();
    if (this.terrain.tiles.length && !this.marine) this._makeMarine();
    this.marineAt = this.landChanged;
    mark('marine');
    // 4. 陆地动物
    const chs = [...this.chunks.values()];
    for (let i = 0; i < chs.length; i++) { if (chs[i].faunaAt) { chs[i].faunaAt = 0; this._buildFauna(chs[i]); } await tick(0.75 + 0.1 * i / chs.length, '唤醒动物'); }
    this._falls(); this.waterDirty = false;
    mark('fauna');
    // 5. 着色器：编译所有材质，再在幕后完整渲染两帧（后期管线的每个通道也一起编译好）
    cb(0.88, '编译着色器'); await pause();
    try { this.renderer.compile(this.scene, this.camera); } catch { /* 不支持就算了 */ }
    this.prewarmed = true; mark('compile');
    this.update(0.016, focus, dist); this.render(); await pause();   // 幕后完整渲染一帧：后期管线各通道的着色器也在这里编译
    mark('render');
    cb(0.96, '编译着色器'); await pause();
    this.loaded = true;
  }
  _islandShape() {
    let cx = 0, cz = 0, n = 0;
    for (const t of this.terrain.tiles) if (t.game !== 'islet') { cx += t.x; cz += t.z; n++; }
    if (!n) { const t = this.terrain.tiles[0]; return [new THREE.Vector3(t.x, 0, t.z), 2]; }
    const c = new THREE.Vector3(cx / n, 0, cz / n); let r = 0;
    for (const t of this.terrain.tiles) if (t.game !== 'islet') r = Math.max(r, Math.hypot(t.x - c.x, t.z - c.z));
    return [c, r + 1];
  }
  _makeMarine() {
    const [c, r] = this._islandShape();
    this.gulls.center.copy(c); this.gulls.radius = Math.max(4, r + 1.5);
    this.marine = new Marine({ scene: this.scene, terrain: this.terrain, ocean: this.ocean, sceneDepth: this.pipe.sceneDepth, center: c, zones: 'noise', radius: Math.max(3, r) });
    this.seagrass = bladeField('seagrass', this.marine.seagrassBlades(), { cull: true }); this.scene.add(this.seagrass);
    this.marineAt = this.landChanged;
    this._seaLife();
    if (this.w) this.resize(this.w, this.h);
    for (const ch of this.chunks.values()) if (ch.fauna) ch.fauna.env.splash = this.marine.splash;
  }
  _rebuildMarine() {
    const [c, r] = this._islandShape();
    const blades = this.marine.rebuild(c, Math.max(3, r));
    this.scene.remove(this.seagrass); this.seagrass.geometry.dispose();
    this.seagrass = bladeField('seagrass', blades, { cull: true }); this.scene.add(this.seagrass);
    this.gulls.center.copy(c); this.gulls.radius = Math.max(4, r + 1.5);
    this._seaLife();
  }
  /** 礁石、浮标、歇在海面上的海鸥：沿海岸按固定的随机位置摆放（和样张一样的海面点缀） */
  _seaLife() {
    if (this.seaLife) { for (const o of this.seaLife) { this.scene.remove(o); o.traverse((c) => { if (c.isInstancedMesh) c.dispose(); }); } this.marine.floaters = this.marine.floaters.filter((f) => !this.seaLife.includes(f.obj)); }
    this.seaLife = [];
    const sp = this.marine.spots, T = this.terrain, R = mulberry32(77);
    const far = [...sp.rocky, ...sp.kelp].filter((p) => p[3] > 0.7 && p[3] < 1.8 && !T.tileAt(p[0], p[2]));
    const nR = Math.min(6, 1 + Math.floor(T.tiles.length / 8)), rocks = [];
    for (let k = 0; k < far.length && rocks.length < nR; k += 1 + Math.floor(R() * 37)) { const p = far[k]; if (rocks.every((q) => Math.hypot(q.x - p[0], q.z - p[2]) > 1.5)) rocks.push({ v: R() < 0.5 ? 0 : 1, x: p[0], y: -0.35, z: p[2], s: 0.22 + R() * 0.22, ry: R() * 6.28, sy: 1.7 }); }
    this.seaRockGeo ||= [boulder(7, 0, 0), boulder(8, 1, 0)];
    const g = instanced(this.seaRockGeo, rocks, this.mats.prop); this.scene.add(g); this.seaLife.push(g);
    const near = sp.grass.concat(sp.reef).filter((p) => p[3] > 0.6 && p[3] < 2.2);
    for (let i = 0; i < Math.min(3, Math.floor(near.length / 40)); i++) {
      const p = near[Math.floor(R() * near.length)], b = this.gulls.resting(); b.position.set(p[0], 0, p[2]); b.rotation.y = R() * 6.28; this.scene.add(b); this.seaLife.push(b);
      this.marine.addFloater(b, { draft: -0.012, stiff: 16, yawRate: 0.2 });
    }
  }
  render() { const f = this.focus; this.pipe.render(this.dt, Math.hypot(this.camera.position.x - f.x, this.camera.position.y - (this.focusY ?? 0.45), this.camera.position.z - f.z)); }   // 景深对准枢轴
  /** 海水风格：在当前时段的光照上叠一层色调（清澈浅滩 / 碧玉海湾 / 深蓝外海） */
  setSea(name) { this.sea = name || 'clear'; this.setHour(this.hour, false); }
  _seaTint() {
    const o = this.ocean.uniforms, k = this.sea || 'clear';
    if (k === 'clear') { o.uAbsorb.value.set(1.9, 0.6, 0.4); o.uShallow.value.lerp(new THREE.Color(0x3fd0c8), 0.35); }
    else if (k === 'jade') { o.uAbsorb.value.set(2.6, 0.55, 0.75); o.uShallow.value.lerp(new THREE.Color(0x2fb58e), 0.55); o.uDeep.value.lerp(new THREE.Color(0x0b4a44), 0.5); }
    else if (k === 'deep') { o.uAbsorb.value.set(3.2, 1.05, 0.62); o.uShallow.value.lerp(new THREE.Color(0x1f74a8), 0.5); o.uDeep.value.lerp(new THREE.Color(0x041c3c), 0.6); }
  }
  /** 惊喜事件：鲸在镜头前方浮上来、海豚群游过来 */
  event(name, focus) {
    const M = this.marine; if (!M) return false;
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    if (name === 'whale') {
      // 找镜头前方离岸 3 个单位以外的深水，让鲸从那里开始换气
      for (let d = 8; d < 30; d += 1.5) { const x = focus.x + fwd.x * d, z = focus.z + fwd.z * d; if (this.terrain.landDist(x, z) > 3) { M.whale.x = x - 3; M.whale.z = z; M.whale.t = 4; M.whale.spouts = 0; return true; } }
      return false;
    }
    if (name === 'dolphins') { M.dolphinBoost = { x: focus.x + fwd.x * 6, z: focus.z + fwd.z * 6, t: 25 }; for (const d of M.dolphins.list) d.next = Math.min(d.next, 1 + Math.random() * 3); return true; }
    return false;
  }
  markY(type, q, r) { const rec = this.rec.get(key(q, r)); return (rec ? rec.tt.base : 0.45) + (MARK_DY[type] ?? 0.6); }
  /** 放置预览：和真实地块同一套几何（不加入地图），带缓存 */
  previewGroup(type, q, r, dir) {
    const [x, z] = toWorld(q, r);
    const tt = { q, r, t: hqType(type, q, r), game: type, dir: dir || 0, x, z, harvested: false };
    tt.base = this.terrain.baseOf ? this.terrain.baseOf(tt) : 0.45;
    const rec = { tt, k: 'ghost', ck: null, top: null, rock: null, dress: null };
    const T = this.terrain;
    rec.top = T.tileTop(tt); rec.rock = T.tileRock(tt); rec.rockDone = true;
    rec.dress = dressTile(T, tt, { grass: (this.q.grass ?? 0.4) * 0.6, flowers: 0.4, props: true, trees: this.q.trees ?? 1 });
    this._extras(rec);
    const g = new THREE.Group(); this._fill(g, [rec], true);
    g.userData.rec = rec;
    return g;
  }
  disposePreview(g) {
    this._disposeGroup(g);
    const rec = g.userData.rec; if (rec) { rec.top.dispose(); rec.topLo?.dispose(); rec.rock?.dispose(); for (const m of rec.dress.meshes) if (!m.shared) m.geo.dispose(); }
  }
}

/** 标记层：可放置格的光圈、放置预览、可收获提示 */
class HQMarkers {
  constructor(view) {
    this.view = view; const scene = view.scene;
    const ring = [], idx = [];
    CORNERS.forEach((c, i) => { ring.push(c[0] * 0.93, 0, c[1] * 0.93, c[0] * 0.76, 0, c[1] * 0.76); const a = i * 2, b = ((i + 1) % 6) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3)); rg.setIndex(idx);
    // 光圈是界面提示：不做深度测试，浪尖和近处的山都挡不住它
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
    this.frontier = new THREE.InstancedMesh(rg, this.ringMat, 256); this.frontier.count = 0; this.frontier.frustumCulled = false;
    this.frontier.layers.set(LAYER_FX); this.frontier.renderOrder = 20; scene.add(this.frontier);
    this.pick = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    this.pick.layers.set(LAYER_FX); this.pick.renderOrder = 21; this.pick.visible = false; scene.add(this.pick);
    this.readyMat = new THREE.MeshStandardMaterial({ color: 0xffd45e, emissive: 0xffa514, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.2, flatShading: true });
    this.ready = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), this.readyMat, 128); this.ready.count = 0; this.ready.frustumCulled = false; scene.add(this.ready);
    this.readyList = []; this.ghost = null; this.ghostKey = ''; this.ghostCache = new Map(); this.t = 0;
  }
  _grow(name, n) {
    const old = this[name]; if (n <= old.instanceMatrix.count) return old;
    const m = new THREE.InstancedMesh(old.geometry, old.material, n * 2); m.count = 0; m.frustumCulled = false; m.layers.mask = old.layers.mask; m.renderOrder = old.renderOrder;
    this.view.scene.remove(old); old.dispose(); this.view.scene.add(m); this[name] = m; return m;
  }
  clearCache() { for (const g of this.ghostCache.values()) if (g !== this.ghost) this.view.disposePreview(g); this.ghostCache.clear(); }
  setFrontier(cells) {
    const mesh = this._grow('frontier', cells.length), m = new THREE.Matrix4();
    cells.forEach((c, i) => { const [x, z] = toWorld(c[0], c[1]); m.makeTranslation(x, 0.07, z); mesh.setMatrixAt(i, m); });
    mesh.count = cells.length; mesh.instanceMatrix.needsUpdate = true;
  }
  setGhost(type, q, r, dir) {
    if (this.ghost) { this.view.scene.remove(this.ghost); this.ghost = null; }
    if (!type) { this.pick.visible = false; return; }
    const k = type + ':' + q + ',' + r + ':' + (dir || 0);
    let g = this.ghostCache.get(k);
    if (!g) {
      g = this.view.previewGroup(type, q, r, dir); this.ghostCache.set(k, g);
      if (this.ghostCache.size > 6) { const [k0, g0] = this.ghostCache.entries().next().value; this.ghostCache.delete(k0); this.view.disposePreview(g0); }
    }
    this.ghost = g; this.view.scene.add(g);
    const [x, z] = toWorld(q, r); this.pick.position.set(x, 0.09, z); this.pick.visible = true;
  }
  setReady(tiles) {
    this.readyList = tiles.map((t) => { const [x, z] = toWorld(t.q, t.r); return [x, this.view.markY(t.t, t.q, t.r), z]; });
    this._grow('ready', this.readyList.length).count = this.readyList.length;
  }
  update(dt) {
    this.t += dt;
    this.ringMat.opacity = 0.45 + Math.sin(this.t * 3.2) * 0.2;
    if (this.ghost) this.ghost.position.y = 0.1 + Math.sin(this.t * 3.5) * 0.04;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1.3, 1), p = new THREE.Vector3();
    this.readyList.forEach((v, i) => { e.set(0, this.t * 1.6 + i, 0); q.setFromEuler(e); p.set(v[0], v[1] + Math.sin(this.t * 2.4 + i * 1.7) * 0.06, v[2]); m.compose(p, q, s); this.ready.setMatrixAt(i, m); });
    if (this.readyList.length) this.ready.instanceMatrix.needsUpdate = true;
  }
}
