// 低画质画面：原来的低多边形渲染（平面着色 + 简化海面），给性能不够的设备用。
// 和高画质画面（hq/gameview.js）提供同一组接口，main.js 只和这组接口打交道。
import { Stage } from './stage.js';
import { World, ShoreField, Markers } from './world.js';
import { Water } from './water.js';
import { setDetail } from './tiles.js';
import { QUALITY, TOP } from './config.js';
import { GROUND } from './ground.js';
import { key, fromWorld } from './hex.js';

export class LegacyView {
  constructor(canvas, qk) {
    this.kind = 'legacy';
    setDetail(QUALITY[qk]?.detail ?? 0.5);
    this.stage = new Stage(canvas, qk);
    this.scene = this.stage.scene; this.renderer = this.stage.renderer;
    this.world = new World(this.scene);
    this.mat = this.world.mat;
    this.shore = new ShoreField();
    this.water = new Water(this.scene, this.shore);
    this.markers = new Markers(this.scene, this.world.mat);
    this.stage.onSky = (sk) => { this.water.setSky(sk); this.onSky?.(sk); };
    this.water.setSky(this.stage.sky);
    GROUND.top = TOP; GROUND.y = () => TOP; GROUND.water = null;
    this.tiles = new Map();
    // 低画质下自由画布用到的最小接口：地面高度查询；摆放的植物、动物、建筑不显示
    const self = this;
    this.terrain = { get tiles() { return [...self.tiles.values()]; }, heightAt: (x, z) => { const [q, r] = fromWorld(x, z); return self.tiles.has(key(q, r)) ? TOP : null; }, riverD: () => 9, landDist: () => 9 };
    this.items = { items: new Map(), set() {}, add() { return false; }, remove() { return null; }, hit() { return null; }, prune() { return []; } };
  }
  get sky() { return this.stage.sky; }
  get tris() { return this.world.tris; }
  attach(cam) { this.stage.attach(cam); }
  setTile(t, rise = false) { this.tiles.set(key(t.q, t.r), t); this.world.setTile(t, rise); }
  rebuildAll(tiles) { this.tiles = new Map(tiles.map((t) => [key(t.q, t.r), t])); this.world.rebuildAll(tiles); }
  /** 自由画布的橡皮擦：低画质画面按剩下的地块整体重建 */
  removeTile(q, r) { if (!this.tiles.delete(key(q, r))) return false; this.world.rebuildAll([...this.tiles.values()]); this.shore.setCells([...this.tiles.values()].map((t) => [t.q, t.r])); return true; }
  setSea() {}
  event() { return false; }
  setLand(cells) { this.shore.setCells(cells); }
  setQuality(k) { setDetail(QUALITY[k].detail); this.stage.setQuality(k); this.markers.ghostCache.clear(); }
  setHour(h) { this.stage.setHour(h); }
  resize(w, h) { this.stage.resize(w, h); }
  markY(type, q, r) { return null; }
  update(dt, focus, dist) {
    this.world.update(dt); this.markers.update(dt);
    this.stage.follow(focus, dist);
    this.shore.update(this.renderer, focus.x, focus.z);
    this.water.update(dt, focus.x, focus.z);
  }
  render() { this.stage.render(); }
}
