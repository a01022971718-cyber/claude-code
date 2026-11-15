// 《屿见》高画质样张：一座完整渲染的岛。可以环绕查看、切换镜头和时段。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Terrain, TYPES } from './terrain.js';
import { terrainMaterial, propMaterial, foliageMaterial, U } from './materials.js';
import { conifer, broadleaf, bush, instanced, bladeField } from './vegetation.js';
import { boulder, peak } from './rocks.js';
import { Ocean } from './ocean.js';
import { ribbon, streamMaterial } from './streams.js';
import { Particles } from './particles.js';
import { Atmosphere, PRESETS } from './atmosphere.js';
import { HQPipeline, LAYER_FX } from './pipeline.js';
import { makeNoise, rng } from './noise.js';
import * as P from './props.js';
import * as L from './models-land.js';
import { Marine } from './marine.js';
import { Fauna } from './fauna.js';

const NZ = makeNoise(9);
const INR = Math.sqrt(3) / 2;
const qs = new URLSearchParams(location.search);

// ---------------- 岛屿布局 ----------------
const LAYOUT = [
  [0, -2, 'forest'], [1, -2, 'mountain'], [2, -2, 'mountain'], [3, -2, 'forest'],
  [-1, -1, 'forest'], [0, -1, 'camp'], [1, -1, 'field'], [2, -1, 'mountain'], [3, -1, 'meadow'],
  [-2, 0, 'forest'], [-1, 0, 'meadow'], [0, 0, 'flowers'], [1, 0, 'meadow'], [2, 0, 'wheat'],
  [-2, 1, 'quarry'], [-1, 1, 'flowers'], [0, 1, 'meadow'], [1, 1, 'flowers'], [2, 1, 'beach'],
  [-2, 2, 'quarry'], [-1, 2, 'pond'], [0, 2, 'meadow'],
  [5, -3, 'islet'], [6, -3, 'islet'],
];
const RIVER = [[2.25, -1.25], [1.95, -0.55], [1.62, 0.25], [1.32, 1.05], [1.72, 2.3], [2.06, 3.3], [2.2, 3.78]];

class Showcase {
  constructor() {
    const canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pr = Math.min(window.devicePixelRatio || 1, Number(qs.get('pr')) || 2);
    this.renderer.setPixelRatio(this.pr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.3, 420);
    this.pipe = new HQPipeline(this.renderer, this.scene, this.camera);
    this.atmo = new Atmosphere(this.renderer, this.scene);
    this.build();
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 4; this.controls.maxDistance = 46; this.controls.maxPolarAngle = THREE.MathUtils.degToRad(84); this.controls.minPolarAngle = THREE.MathUtils.degToRad(12);
    this.controls.target.copy(this.center);
    this.controls.autoRotateSpeed = 0.35;
    this.shots = {
      hero: { pos: [-6.5, 11.5, 15.5], tgt: [0.9, 0.45, 0.2] },
      camp: { pos: [-1.5, 4.3, 3.1], tgt: [0.25, 0.45, -1.25] },
      falls: { pos: [5.8, 1.9, 7.4], tgt: [2.0, 0.35, 3.2] },
      horizon: { pos: [-9.5, 2.6, 9.5], tgt: [1.5, 0.8, -1.0] },
      top: { pos: [0.9, 24, 6], tgt: [0.9, 0, 0] },
      reef: { pos: [0.4, 2.3, 7.6], tgt: [1.3, -0.7, 4.8] },
      pond: { pos: [-1.5, 1.45, 4.7], tgt: [0.05, 0.38, 2.95] },
      beach: { pos: [7.4, 1.5, 4.2], tgt: [4.6, 0.25, 1.8] },
      ocean: { pos: [-6, 3, -6], tgt: [-8, -0.2, -16] },
    };
    this.setShot(qs.get('shot') || 'hero', true);
    this.setTime(qs.get('time') || 'afternoon');
    this.resize(); addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.fps = { n: 0, t: 0, v: 0 };
    this.ui();
    this.loop();
    window.__hq = this;
    this.ready = true;
  }

  build() {
    const scene = this.scene, tiles = LAYOUT.map(([q, r, t]) => ({ q, r, t }));
    this.pond = { x: 0, z: 3, r: 0.42, depth: 0.11 };
    this.terrain = new Terrain(tiles, { river: RIVER, riverWidth: 0.16, ponds: [this.pond] });
    const T = this.terrain, tm = terrainMaterial();
    scene.add(T.build(tm, tm));
    scene.add(T.buildSeabed(tm));
    let cx = 0, cz = 0, n = 0; for (const t of tiles) if (t.t !== 'islet') { cx += t.x; cz += t.z; n++; }
    this.center = new THREE.Vector3(cx / n, 0.3, cz / n);

    // 海洋
    this.ocean = new Ocean({ terrain: T, sceneColor: this.pipe.sceneColor, sceneDepth: this.pipe.sceneDepth });
    this.ocean.mesh.layers.set(LAYER_FX); scene.add(this.ocean.mesh);

    const R = rng(31);
    const inHex = (t, pad = 0.12) => { for (let k = 0; k < 40; k++) { const x = (R() * 2 - 1) * (INR - pad), z = (R() * 2 - 1) * (1 - pad); if (Math.abs(z) <= (1 - pad) - Math.abs(x) / Math.sqrt(3) && Math.abs(x) <= INR - pad) return [t.x + x, t.z + z]; } return [t.x, t.z]; };
    const riverD = (x, z) => Math.min(T.river(x, z)[0], Math.hypot(x - this.pond.x, z - this.pond.z) - this.pond.r * 0.75 + 0.2);
    const H = (t, x, z) => T.heightIn(t, x, z);

    // ---- 树 ----
    const conV = [1, 2, 3, 4, 5].map((s) => conifer(s * 11));
    const broadV = [broadleaf(3, 'green'), broadleaf(7, 'lime'), broadleaf(9, 'green', 0.95), broadleaf(13, 'autumn', 0.8), broadleaf(17, 'blossom', 0.75)];
    const bushV = [bush(1, 'green'), bush(2, 'lime'), bush(3, 'green')];
    const trees = [], broads = [], bushes = [], rocks = [];
    const taken = [];
    const free = (x, z, d) => taken.every(([a, b, r]) => (a - x) ** 2 + (b - z) ** 2 > (r + d) ** 2);
    const plant = (list, it, d) => { if (!free(it.x, it.z, d)) return false; taken.push([it.x, it.z, d]); list.push(it); return true; };
    // 地标和营地先占位
    const camp = tiles.find((t) => t.t === 'camp');
    taken.push([camp.x - 0.22, camp.z - 0.25, 0.36], [camp.x + 0.12, camp.z + 0.12, 0.3]);
    const lh = tiles.find((t) => t.t === 'islet');
    taken.push([lh.x, lh.z, 0.5]);
    for (const t of tiles) {
      if (t.t === 'forest') {
        for (let i = 0; i < 46; i++) { const [x, z] = inHex(t, 0.05); const s = 0.85 + R() * 0.55; plant(trees, { v: Math.floor(R() * 5), x, y: H(t, x, z) - 0.02, z, s, ry: R() * 6.28, tilt: 0.04, tint: [0.9 + R() * 0.2, 0.92 + R() * 0.16, 0.9 + R() * 0.2] }, 0.13 * s); }
        for (let i = 0; i < 3; i++) { const [x, z] = inHex(t, 0.1); plant(broads, { v: R() < 0.5 ? 1 : 0, x, y: H(t, x, z) - 0.02, z, s: 0.9 + R() * 0.3, ry: R() * 6.28 }, 0.2); }
        for (let i = 0; i < 6; i++) { const [x, z] = inHex(t, 0.03); plant(bushes, { v: Math.floor(R() * 3), x, y: H(t, x, z), z, s: 0.9 + R() * 0.6, ry: R() * 6.28 }, 0.08); }
      }
      if (t.t === 'mountain') {
        const big = t.q === 1 ? [2.5, 0.95] : t.q === 2 && t.r === -2 ? [2.1, 0.88] : [1.4, 0.7];
        const pk = peak(t.q * 7 + t.r * 3 + 5, big[1], big[0]);
        this.peaks = this.peaks || []; this.peaks.push({ g: pk, x: t.x + (R() - 0.5) * 0.2, y: t.base - 0.03, z: t.z + (R() - 0.5) * 0.2, ry: R() * 6.28 });
        for (let k = 0; k < 2; k++) { const a = R() * 6.28, d = 0.45 + R() * 0.15; this.peaks.push({ g: peak(t.q * 13 + k * 5 + t.r, 0.32 + R() * 0.12, 0.55 + R() * 0.5), x: t.x + Math.cos(a) * d, y: t.base - 0.02, z: t.z + Math.sin(a) * d, ry: R() * 6.28 }); }
        taken.push([t.x, t.z, 0.6]);
        for (let i = 0; i < 9; i++) { const [x, z] = inHex(t, 0.06); plant(trees, { v: Math.floor(R() * 5), x, y: H(t, x, z) - 0.02, z, s: 0.7 + R() * 0.4, ry: R() * 6.28, tilt: 0.05 }, 0.11); }
        for (let i = 0; i < 5; i++) { const [x, z] = inHex(t, 0.08); plant(rocks, { v: Math.floor(R() * 4), x, y: H(t, x, z) - 0.02, z, s: 0.05 + R() * 0.08, ry: R() * 6.28 }, 0.08); }
      }
      if (t.t === 'quarry') {
        for (let i = 0; i < 14; i++) { const [x, z] = inHex(t, 0.1); const s = 0.1 + R() * 0.22; plant(rocks, { v: Math.floor(R() * 4), x, y: H(t, x, z) - 0.03, z, s, ry: R() * 6.28 }, s * 0.9); }
        for (let i = 0; i < 20; i++) { const [x, z] = inHex(t, 0.05); plant(rocks, { v: 4 + Math.floor(R() * 2), x, y: H(t, x, z) - 0.01, z, s: 0.025 + R() * 0.035, ry: R() * 6.28 }, 0.03); }
        for (let i = 0; i < 3; i++) { const [x, z] = inHex(t, 0.1); plant(bushes, { v: Math.floor(R() * 3), x, y: H(t, x, z), z, s: 0.8 + R() * 0.5, ry: R() * 6.28 }, 0.08); }
      }
      if (t.t === 'beach') {
        for (let i = 0; i < 4; i++) { const [x, z] = inHex(t, 0.2); plant(this.palms = this.palms || [], { x, y: H(t, x, z) - 0.01, z, ry: R() * 6.28, s: 0.85 + R() * 0.3, tilt: 0.12 }, 0.22); }
      }
      if (t.t === 'pond') {
        for (let i = 0; i < 2; i++) { const [x, z] = inHex(t, 0.12); if (riverD(x, z) < 0.35) continue; plant(bushes, { v: Math.floor(R() * 3), x, y: H(t, x, z), z, s: 0.8 + R() * 0.4, ry: R() * 6.28 }, 0.08); }
      }
      if (['meadow', 'flowers', 'camp', 'islet'].includes(t.t)) {
        const nTree = t.t === 'meadow' ? (R() < 0.6 ? 1 : 0) + (R() < 0.3 ? 1 : 0) : t.t === 'camp' ? 2 : 0;
        for (let i = 0; i < nTree; i++) { const [x, z] = inHex(t, 0.15); if (riverD(x, z) < 0.35) continue; plant(broads, { v: [0, 1, 2, 3, 4][Math.floor(R() * 5)], x, y: H(t, x, z) - 0.02, z, s: 0.8 + R() * 0.35, ry: R() * 6.28 }, 0.24); }
        for (let i = 0; i < (t.t === 'islet' ? 4 : 3); i++) { const [x, z] = inHex(t, 0.05); if (riverD(x, z) < 0.25) continue; plant(bushes, { v: Math.floor(R() * 3), x, y: H(t, x, z), z, s: 0.7 + R() * 0.6, ry: R() * 6.28 }, 0.07); }
        for (let i = 0; i < 2; i++) { const [x, z] = inHex(t, 0.08); if (riverD(x, z) < 0.25) continue; plant(rocks, { v: Math.floor(R() * 4), x, y: H(t, x, z) - 0.02, z, s: 0.04 + R() * 0.05, ry: R() * 6.28 }, 0.06); }
      }
    }
    // 河边的石头
    for (let i = 0; i < 26; i++) {
      const k = Math.floor(R() * (RIVER.length - 2)), u = R(), a = RIVER[k], b = RIVER[k + 1];
      const x0 = a[0] + (b[0] - a[0]) * u, z0 = a[1] + (b[1] - a[1]) * u, dx = b[1] - a[1], dz = -(b[0] - a[0]), l = Math.hypot(dx, dz), side = R() < 0.5 ? -1 : 1;
      const x = x0 + dx / l * side * (0.17 + R() * 0.06), z = z0 + dz / l * side * (0.17 + R() * 0.06), t = T.tileAt(x, z);
      if (t) rocks.push({ v: Math.floor(R() * 4), x, y: H(t, x, z) - 0.02, z, s: 0.03 + R() * 0.04, ry: R() * 6.28 });
    }
    // 海里的礁石
    for (const [x, z, s] of [[-4.2, 2.6, 0.45], [-3.9, 3.3, 0.25], [4.6, 2.4, 0.38], [4.1, -4.6, 0.3], [-3.2, -3.4, 0.35], [3.2, 4.4, 0.22], [7.2, -2.1, 0.3]]) rocks.push({ v: 6 + Math.floor(R() * 2), x, y: -0.35, z, s, ry: R() * 6.28, sy: 1.7 });
    const treeMat = foliageMaterial({ sway: 1, translucency: 0.45 }), bushMat = foliageMaterial({ sway: 0.5, translucency: 0.35 });
    scene.add(instanced(conV, trees, treeMat), instanced(broadV, broads, treeMat), instanced(bushV, bushes, bushMat));
    const rockV = [boulder(1), boulder(2, 1), boulder(3), boulder(4, 1), boulder(5), boulder(6, 1), boulder(7, 0, 0), boulder(8, 1, 0)];
    scene.add(instanced(rockV, rocks, propMaterial({ rough: 0.8 })));
    const peakMat = terrainMaterial({ flat: true, env: 0.5 });
    this.peakMeshes = [];
    for (const p of this.peaks) { const m = new THREE.Mesh(p.g, peakMat); m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; m.castShadow = m.receiveShadow = true; scene.add(m); this.peakMeshes.push(m); }
    this.perches = trees.map((it) => ({ x: it.x, y: it.y, z: it.z, h: 1.0 * it.s })).concat(broads.map((it) => ({ x: it.x, y: it.y, z: it.z, h: 0.85 * it.s })));
    this.taken = taken;

    // ---- 草、花、麦子、菜地 ----
    const grass = [], flowers = [], wheat = []; this.flowerSpots = [];
    const FC = [[1.0, 0.82, 0.18], [0.98, 0.96, 0.9], [0.98, 0.5, 0.68], [0.62, 0.48, 0.9], [1.0, 0.58, 0.2]].map((c) => c.map((v) => Math.pow(v, 2.2)));
    const density = Number(qs.get('grass')) || 1;
    for (const t of tiles) {
      const grassy = ({ meadow: 4200, flowers: 3800, camp: 3000, islet: 2200, forest: 900, quarry: 1500, mountain: 1400, pond: 3600, beach: 260 }[t.t] || 0) * density;
      for (let i = 0; i < grassy; i++) {
        const [x, z] = inHex(t, 0.0);
        if (T.river && riverD(x, z) < 0.2) continue;
        if (t.t === 'camp' && Math.hypot(x - t.x - 0.05, z - t.z + 0.05) < 0.42) continue;
        if (t.t === 'mountain' && Math.hypot(x - t.x, z - t.z) < 0.5) continue;
        if (t.t === 'beach' && Math.hypot(x - t.x, z - t.z) < 0.55) continue;
        const h = H(t, x, z), c = T._topColor(t, x, z, h), v = 0.88 + R() * 0.3;
        grass.push({ x, y: h - 0.004, z, h: (0.035 + R() * 0.045) * (t.t === 'forest' ? 0.8 : 1), w: 0.008 + R() * 0.006, lean: R() * 0.3, rot: R() * 6.28, tint: [c.r * v * 1.12, c.g * v * 1.08, c.b * v * 0.95], tint2: [c.r * 0.55, c.g * 0.6, c.b * 0.5] });
      }
      const nFlower = { flowers: 3200, meadow: 380, camp: 160, islet: 260, pond: 220 }[t.t] || 0;
      for (let i = 0; i < nFlower * density; i++) {
        const [x, z] = inHex(t, 0.03);
        if (riverD(x, z) < 0.22) continue;
        const patch = NZ.fbm2(x * 1.6, z * 1.6, 3), kind = Math.floor((NZ.n2(x * 0.9 + 30, z * 0.9) * 0.5 + 0.5) * 5) % 5;
        if (t.t === 'flowers' ? patch < -0.15 : patch < 0.25) continue;
        const h = H(t, x, z), s = 0.022 + R() * 0.02;
        flowers.push({ x, y: h - 0.003, z, h: s * 2.2, w: s * 0.45, lean: R() * 0.15, rot: R() * 6.28, tint: FC[kind], tint2: [0.08, 0.2, 0.05] });
        if (i % 7 === 0) this.flowerSpots.push({ x, y: h + s * 2.2, z });
      }
      if (t.t === 'wheat') {
        for (let i = 0; i < 8000 * density; i++) {
          const [x, z] = inHex(t, 0.1), h = H(t, x, z), g = 0.85 + R() * 0.25;
          wheat.push({ x, y: h - 0.005, z, h: 0.17 + R() * 0.07, w: 0.11, lean: 0.1 + R() * 0.25, rot: R() * 6.28, tint: [0.98 * g, 0.62 * g, 0.16 * g], tint2: [0.7 * g, 0.52 * g, 0.16 * g] });
        }
      }
    }
    scene.add(bladeField('grass', grass), bladeField('flower', flowers), bladeField('wheat', wheat));
    this.counts = { grass: grass.length, flowers: flowers.length, wheat: wheat.length, trees: trees.length + broads.length, rocks: rocks.length };

    // 菜地：一垄垄的土埂 + 小菜苗
    const field = tiles.find((t) => t.t === 'field');
    {
      const parts = [], soilA = new THREE.Color(0x8d5530), soilB = new THREE.Color(0xb7743f), crop = [];
      const dir = Math.PI / 6;
      for (let k = -5; k <= 5; k++) {
        const off = k * 0.13, L = 2 * Math.sqrt(Math.max(0, (INR - 0.13) ** 2 - off * off)) * 1.05;
        if (L < 0.3) continue;
        const g = new THREE.CapsuleGeometry(0.035, L, 4, 8); g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1);
        g.rotateY(dir); g.translate(field.x - Math.sin(dir) * off, field.base - 0.004, field.z - Math.cos(dir) * off);
        const p = g.attributes.position, c = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { const col = soilA.clone().lerp(soilB, THREE.MathUtils.clamp((p.getY(i) - field.base) * 25 + 0.5, 0, 1)).multiplyScalar(0.9 + NZ.n2(p.getX(i) * 30, p.getZ(i) * 30) * 0.1); c.set([col.r, col.g, col.b], i * 3); }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
        for (let s = -L / 2 + 0.06; s < L / 2 - 0.04; s += 0.09) crop.push({ v: Math.floor(R() * 3), x: field.x + Math.cos(dir) * s - Math.sin(dir) * off, y: field.base + 0.008, z: field.z - Math.sin(dir) * s - Math.cos(dir) * off, s: 0.28 + R() * 0.12, ry: R() * 6.28, sy: 0.7 });
      }
      const geo = mergeGeoms(parts), m = new THREE.Mesh(geo, propMaterial({ rough: 0.95 })); m.castShadow = m.receiveShadow = true; scene.add(m);
      scene.add(instanced([bush(21, 'lime'), bush(22, 'green'), bush(23, 'lime')], crop, bushMat));
    }

    // ---- 道具 ----
    const pm = propMaterial({ rough: 0.8 });
    const put = (fn, x, z, ry = 0, s = 1, t = null) => {
      if (typeof fn !== 'function') return null;
      const { geometry, anchors } = fn(Math.floor(R() * 1000));
      const tile = t || T.tileAt(x, z), y = tile ? H(tile, x, z) - 0.01 : 0;
      const m = new THREE.Mesh(geometry, pm); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s); m.castShadow = m.receiveShadow = true; scene.add(m);
      return { m, anchors: anchors || {}, y };
    };
    const hut = put(P.strawHut, camp.x - 0.24, camp.z - 0.27, 0.5, 1.05);
    const fire = put(P.campfire, camp.x + 0.12, camp.z + 0.1, 0, 1.0);
    put(P.logSeat, camp.x + 0.42, camp.z + 0.05, 1.2); put(P.logSeat, camp.x + 0.1, camp.z + 0.42, 0.1); put(P.logSeat, camp.x - 0.18, camp.z + 0.22, 2.2);
    put(P.woodPile, camp.x - 0.55, camp.z + 0.1, 0.4);
    put(P.fence, field.x + 0.62, field.z + 0.45, -0.5); put(P.signpost, camp.x + 0.55, camp.z - 0.42, 0.6);
    const lhT = tiles.find((t) => t.t === 'islet' && t.q === 5);
    const lhp = put(P.lighthouse, lhT.x - 0.05, lhT.z + 0.05, -0.5, 1.0, lhT);
    this.boat = put(P.rowBoat, 5.75, 2.45, 0.8, 1.2, null);
    this.fireAt = fire ? new THREE.Vector3().fromArray(fire.anchors.fire || [0, 0.04, 0]).add(fire.m.position) : new THREE.Vector3(camp.x + 0.12, camp.base + 0.05, camp.z + 0.1);
    this.fireLight = new THREE.PointLight(0xff8a3a, 1.2, 3.2, 2); this.fireLight.position.copy(this.fireAt).add(new THREE.Vector3(0, 0.12, 0)); scene.add(this.fireLight);
    if (lhp) {
      const lamp = new THREE.Vector3().fromArray(lhp.anchors.lamp || [0, 1.8, 0]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5).add(lhp.m.position);
      this.lampLight = new THREE.PointLight(0xffd98a, 0, 6, 2); this.lampLight.position.copy(lamp); scene.add(this.lampLight);
      const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * 0.22; gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a, a); }' });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 7, 20, 1, true), beamMat);
      beam.geometry.translate(0, -3.5, 0); beam.geometry.rotateZ(-Math.PI / 2 - 0.04);
      this.beam = new THREE.Group(); this.beam.position.copy(lamp); this.beam.add(beam); this.beam.visible = false; scene.add(this.beam);
    }

    // ---- 河流与瀑布 ----
    const sm = streamMaterial(this.pipe.sceneColor, this.pipe.sceneDepth); this.streamMat = sm;
    const rpts = [];
    const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    for (let i = 0; i <= 60; i++) { const p = curve.getPoint(i / 60), t = T.tileAt(p.x, p.z); const h = t ? H(t, p.x, p.z) : 0.18; rpts.push([p.x, Math.max(h + 0.028, 0.37), p.z]); }
    for (let i = 1; i < rpts.length; i++) rpts[i][1] = Math.min(rpts[i][1], rpts[i - 1][1] + 0.002);
    const river = new THREE.Mesh(ribbon(rpts.slice(0, -2), (t) => 0.12 + Math.sin(t * 18) * 0.012, 0), sm);
    const end = rpts[rpts.length - 3], mouth = rpts[rpts.length - 1], outv = new THREE.Vector2(mouth[0] - end[0], mouth[2] - end[2]).normalize();
    const fallPts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, y = end[1] * (1 - t) - 0.02 * t, o = 0.05 + Math.pow(t, 0.6) * 0.28 + t * 0.05; fallPts.push([end[0] + outv.x * (0.08 + o), y, end[2] + outv.y * (0.08 + o)]); }
    const fall = new THREE.Mesh(ribbon(fallPts, (t) => 0.11 + t * 0.05, 1), sm);
    // 山上的小瀑布（泉水从山腰流到河源）
    const src = RIVER[0], mtn = this.peaks[this.peaks.length - 3] || this.peaks[0];
    const sb = rpts[0][1];
    const spring = [[src[0] + 0.32, sb + 0.5, src[1] - 0.22], [src[0] + 0.2, sb + 0.28, src[1] - 0.12], [src[0] + 0.08, sb + 0.1, src[1] - 0.04], [src[0], sb, src[1]]];
    const fall2 = new THREE.Mesh(ribbon(spring, 0.05, 1), sm);
    for (const m of [river, fall, fall2]) { m.layers.set(LAYER_FX); m.renderOrder = 5; scene.add(m); }
    const fallBase = fallPts[fallPts.length - 1];
    this.ocean.setFalls([[fallBase[0], fallBase[2], 0.4]]);
    this.fallBase = fallBase;

    // ---- 粒子 ----
    this.fx = new Particles(this.pipe.sceneDepth);
    this.fx.points.layers.set(LAYER_FX); this.fx.smoke.layers.set(LAYER_FX); scene.add(this.fx.points);
    this.fx.setEmitters({ falls: [[fallBase[0], 0.02, fallBase[2]], [src[0], rpts[0][1], src[1]]], fire: this.fireAt.toArray() });

    // ---- 海鸥 ----
    this.birds = [];
    const bm = propMaterial({ rough: 0.6 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.07, 3, 6).rotateX(Math.PI / 2), bm);
      setColor(body.geometry, 0xf4f4f0); g.add(body);
      const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.17, 0.02, -0.01, 0, 0, -0.03, 0.17, 0.02, -0.01, 0.2, 0.01, -0.05, 0.12, 0.02, 0.01], 3)); wingG.computeVertexNormals(); setColor(wingG, 0xe8e8e4, [0.2, 0.01, -0.05], 0x30343a);
      const Lw = new THREE.Mesh(wingG, bm), Rw = new THREE.Mesh(wingG, bm); Rw.scale.x = -1;
      g.add(Lw, Rw); g.userData = { L: Lw, R: Rw, r: 4 + i * 0.9, h: 2.4 + (i % 3) * 0.5, sp: (0.18 + (i % 4) * 0.03) * (i % 2 ? 1 : -1), ph: i * 1.3 };
      g.traverse((o) => { o.castShadow = true; });
      scene.add(g); this.birds.push(g);
    }
    this._ecosystems(tiles, treeMat, rpts);
  }

  /** 海里和岛上的生态 */
  _ecosystems(tiles, treeMat, rpts) {
    const scene = this.scene, T = this.terrain, R = rng(808);
    // 沙滩：椰子树
    if (this.palms?.length) scene.add(instanced([L.palm(1, 0.95).geometry, L.palm(2, 1.1).geometry], this.palms.map((p, i) => ({ ...p, v: i % 2 })), treeMat));
    // 湿地池塘：静水、睡莲、芦苇和香蒲
    const pt = tiles.find((t) => t.t === 'pond'), pd = this.pond; pd.y = pt.base - 0.05;
    {
      const g = new THREE.CircleGeometry(pd.r * 1.15, 48); g.rotateX(-Math.PI / 2); g.translate(pd.x, pd.y, pd.z);
      const p = g.attributes.position, flow = new Float32Array(p.count * 2), fall = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - pd.x, dz = p.getZ(i) - pd.z; flow[i * 2] = Math.atan2(dz, dx) * pd.r; flow[i * 2 + 1] = Math.hypot(dx, dz) / pd.r * 0.55; }
      g.setAttribute('flow', new THREE.BufferAttribute(flow, 2)); g.setAttribute('fall', new THREE.BufferAttribute(fall, 1));
      this.pondMat = streamMaterial(this.pipe.sceneColor, this.pipe.sceneDepth, 0.04); this.pondMat.uniforms.uTint.value.set(0x2f6b4a);
      const m = new THREE.Mesh(g, this.pondMat); m.layers.set(LAYER_FX); m.renderOrder = 5; scene.add(m);
    }
    this.lilyPads = [];
    const pads = [];
    for (let k = 0; k < 40 && pads.length < 13; k++) { const a = R() * 6.28, r = Math.sqrt(R()) * pd.r * 0.8, x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r; if (pads.every((q) => Math.hypot(q.x - x, q.z - z) > 0.07)) pads.push({ x, y: pd.y + 0.002, z, ry: R() * 6.28, s: 1.2 + R() * 0.6, v: R() < 0.3 ? 1 : 0 }); }
    this.lilyPads = pads;
    this.padMesh = instanced([L.lilyPad(1, false).geometry, L.lilyPad(2, true).geometry], pads, propMaterial({ rough: 0.55 }));
    scene.add(this.padMesh);
    const reedItems = [];
    for (let k = 0; k < 26; k++) { const a = R() * 6.28, r = pd.r * (0.95 + R() * 0.3), x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r, y = T.heightAt(x, z); if (y != null) reedItems.push({ v: R() < 0.6 ? 0 : 1, x, y: y - 0.01, z, ry: R() * 6.28, s: 1.1 + R() * 0.5 }); }
    for (let k = 0; k < 18; k++) { const p = rpts[4 + Math.floor(R() * (rpts.length - 12))], side = R() < 0.5 ? -1 : 1, x = p[0] + side * (0.17 + R() * 0.05), z = p[2] + (R() - 0.5) * 0.1, y = T.heightAt(x, z); if (y != null) reedItems.push({ v: 0, x, y: y - 0.01, z, ry: R() * 6.28, s: 0.9 + R() * 0.4 }); }
    scene.add(instanced([L.reeds(1).geometry, L.cattail(2).geometry], reedItems, treeMat));
    // 海洋生态
    this.marine = new Marine({ scene, terrain: T, ocean: this.ocean, sceneDepth: this.pipe.sceneDepth, center: this.center });
    scene.add(bladeField('seagrass', this.marine.seagrassBlades()));
    // 漂浮物：小船、浮标、歇在水面上的海鸥
    if (this.boat) this.marine.addFloater(this.boat.m, { draft: 0.005 });
    const buoyMat = propMaterial({ rough: 0.4 });
    for (const [x, z] of [[5.2, 3.6], [-3.4, 4.2]]) {
      const g = new THREE.CylinderGeometry(0.035, 0.05, 0.12, 14), cap = new THREE.SphereGeometry(0.036, 14, 8); cap.translate(0, 0.06, 0);
      const geo = mergeGeoms([g, cap].map((x) => { const p = x.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const col = new THREE.Color(Math.floor((p.getY(i) + 0.06) * 22) % 2 ? 0xd8392b : 0xf2efe8); c.set([col.r, col.g, col.b], i * 3); } x.setAttribute('color', new THREE.BufferAttribute(c, 3)); return x; }));
      const m = new THREE.Mesh(geo, buoyMat); m.position.set(x, 0, z); m.castShadow = true; scene.add(m); this.marine.addFloater(m, { draft: 0.03, stiff: 14 });
    }
    for (const [x, z] of [[-3.5, 2.9], [-3.15, 3.15], [4.6, -3.9]]) {
      const g = this.birds[0].clone(); g.userData = {}; g.children[1].rotation.z = 1.2; g.children[2].rotation.z = -1.2; g.scale.setScalar(1); g.position.set(x, 0, z); g.rotation.y = R() * 6.28; scene.add(g);
      this.marine.addFloater(g, { draft: -0.012, stiff: 16, yawRate: 0.2 });
    }
    // 陆地生态
    this.fauna = new Fauna({ scene, terrain: T, tiles, taken: this.taken, trees: this.perches, flowers: this.flowerSpots, pond: pd, river: (x, z) => T.river(x, z)[0], riverPts: rpts, peaks: this.peakMeshes, splash: this.marine.splash, lilyPads: pads, center: this.center });
    const sc = this.marine.schools.reduce((a, s) => a + s.n, 0);
    this.eco = { fish: sc, corals: this.marine.counts.corals, kelp: this.marine.counts.kelp, ...this.fauna.counts };
  }

  setShot(name, instant = false) {
    const s = name === 'ocean' && this.marine ? (() => { const w = this.marine.whale; return { pos: [w.x - 3.2, 1.9, w.z + 4.2], tgt: [w.x + 0.8, -0.1, w.z] }; })() : (this.shots[name] || this.shots.hero);
    this.anim = { from: { p: this.camera.position.clone(), t: this.controls ? this.controls.target.clone() : this.center.clone() }, to: { p: new THREE.Vector3(...s.pos), t: new THREE.Vector3(...s.tgt) }, k: instant ? 1 : 0 };
    if (instant) { this.camera.position.copy(this.anim.to.p); this.controls?.target.copy(this.anim.to.t); this.camera.lookAt(this.anim.to.t); }
    this.shot = name; this._sync?.();
  }
  setTime(name) {
    const p = PRESETS[name] || PRESETS.afternoon; this.time = name;
    this.atmo.apply(p, this.ocean, this.pipe);
    const sm = this.streamMat.uniforms; sm.uSunDir.value.copy(this.atmo.dir); sm.uSunColor.value.set(p.sun).multiplyScalar(p.sunI * 0.3); sm.uSky.value.set(p.zen).lerp(new THREE.Color(p.hor), 0.35); sm.uFogColor.value.set(p.fog); sm.uFogDensity.value = p.fogD;
    if (this.pondMat) { const pm = this.pondMat.uniforms; pm.uSunDir.value.copy(sm.uSunDir.value); pm.uSunColor.value.copy(sm.uSunColor.value); pm.uSky.value.copy(sm.uSky.value); pm.uFogColor.value.copy(sm.uFogColor.value); pm.uFogDensity.value = p.fogD; }
    const night = name === 'night';
    if (this.beam) this.beam.visible = night;
    if (this.lampLight) this.lampLight.intensity = night ? 2.5 : name === 'golden' ? 0.8 : 0;
    this.fx.setEmitters({ fire: this.fireAt.toArray(), night: night ? 1 : name === 'golden' ? 0.3 : 0 });
    this.fireBase = night ? 2.4 : name === 'golden' ? 1.4 : 0.9;
    this._sync?.();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.pipe.setSize(w, h);
    const W = this.pipe.W, H = this.pipe.H;
    for (const u of this.fxUniforms()) u.uResolution.value.set(W, H);
    this.fx.uniforms.uPR.value = this.marine.splash.uniforms.uPR.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }
  fxUniforms() { return [this.ocean.uniforms, this.streamMat.uniforms, this.fx.uniforms, this.pondMat.uniforms, this.marine.splash.uniforms];
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    U.uTime.value += dt;
    const t = U.uTime.value;
    if (this.anim && this.anim.k < 1) {
      this.anim.k = Math.min(1, this.anim.k + dt / 1.8); const e = this.anim.k < 0.5 ? 4 * this.anim.k ** 3 : 1 - (-2 * this.anim.k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.anim.from.p, this.anim.to.p, e); this.controls.target.lerpVectors(this.anim.from.t, this.anim.to.t, e);
    }
    this.controls.update();
    for (const u of this.fxUniforms()) { u.cameraNear.value = this.camera.near; u.cameraFar.value = this.camera.far; }
    this.marine.update(dt, t); this.fauna.update(dt, t);
    this.fireLight.intensity = this.fireBase * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 23.1) * 0.05);
    if (this.beam) this.beam.rotation.y = t * 0.6;
    for (const b of this.birds) {
      if (!b.userData.L) continue;
      const d = b.userData, a = t * d.sp + d.ph, c = this.center;
      b.position.set(c.x + Math.cos(a) * d.r, d.h + Math.sin(t * 0.7 + d.ph) * 0.3, c.z + Math.sin(a) * d.r);
      b.rotation.set(0, -a + (d.sp > 0 ? Math.PI : 0), Math.sin(t * 0.8 + d.ph) * 0.2);
      const f = Math.sin(t * 7 + d.ph * 3) * 0.55; d.L.rotation.z = f; d.R.rotation.z = -f;
    }
    this.pipe.render(dt, this.camera.position.distanceTo(this.controls.target));
    this.fps.n++; this.fps.t += dt; if (this.fps.t > 0.5) { this.fps.v = this.fps.n / this.fps.t; this.fps.n = 0; this.fps.t = 0; const el = document.getElementById('fps'); if (el) el.textContent = this.fps.v.toFixed(0) + ' fps'; }
  }
  ui() {
    const bar = document.getElementById('bar'); if (!bar) return;
    const shots = { hero: '全景', camp: '营地', falls: '瀑布', reef: '珊瑚礁', pond: '池塘', beach: '沙滩', ocean: '鲸', horizon: '海平线', top: '俯视' };
    const times = { morning: '清晨', noon: '正午', afternoon: '午后', golden: '黄昏', night: '夜晚' };
    bar.innerHTML = `<div class="grp"><span>镜头</span>${Object.entries(shots).map(([k, v]) => `<button data-shot="${k}">${v}</button>`).join('')}</div>
      <div class="grp"><span>时段</span>${Object.entries(times).map(([k, v]) => `<button data-time="${k}">${v}</button>`).join('')}</div>
      <div class="grp"><span>效果</span><button data-opt="dof" class="on">景深</button><button data-opt="ao" class="on">环境光遮蔽</button><button data-opt="bloom" class="on">泛光</button><button data-opt="rot">自动环绕</button></div>`;
    const sync = this._sync = () => { bar.querySelectorAll('[data-shot]').forEach((b) => b.classList.toggle('on', b.dataset.shot === this.shot)); bar.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === this.time)); };
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.shot) this.setShot(b.dataset.shot);
      if (b.dataset.time) this.setTime(b.dataset.time);
      if (b.dataset.opt === 'rot') { this.controls.autoRotate = !this.controls.autoRotate; b.classList.toggle('on', this.controls.autoRotate); }
      else if (b.dataset.opt) { this.pipe.opts[b.dataset.opt] = !this.pipe.opts[b.dataset.opt]; b.classList.toggle('on', this.pipe.opts[b.dataset.opt]); }
      sync();
    });
    sync();
    const info = document.getElementById('info'), e = this.eco; if (info) info.innerHTML = `${this.counts.grass.toLocaleString()} 草叶 · ${this.counts.flowers.toLocaleString()} 花 · ${this.counts.trees} 棵树<br>${e.fish} 条鱼 · ${e.corals} 株珊瑚 · ${e.kelp} 株巨藻 · 海龟 · 海豚 · 鲸 · 水母<br>鹿 ${e.deer} · 羊 ${e.sheep} · 山羊 ${e.goats} · 兔 ${e.rabbits} · 蝴蝶 ${e.butterflies} · 鸟 ${e.songbirds} · 鸭 ${e.ducks} · 蛙 ${e.frogs} · 蟹 ${e.crabs}`;
  }
}

function mergeGeoms(list) {
  let n = 0; for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0, c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += c; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
}
function setColor(g, hex, tipAt, tipHex) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), a = new THREE.Color(hex), b = tipHex ? new THREE.Color(tipHex) : a;
  for (let i = 0; i < p.count; i++) { const tip = tipAt && Math.abs(p.getX(i) - tipAt[0]) < 0.01 && Math.abs(p.getZ(i) - tipAt[2]) < 0.01; const k = tip ? b : a; c.set([k.r, k.g, k.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

function start() {
  try { new Showcase(); } catch (e) { console.error(e); const d = document.getElementById('err'); if (d) { d.hidden = false; d.textContent = '画面加载失败：' + (e.message || e) + '。需要支持 WebGL2 的浏览器。'; } }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
