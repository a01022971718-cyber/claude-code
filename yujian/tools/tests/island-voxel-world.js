// 体素主题：建筑、小船浮标、海里的生物、海鸥、海草都换成方块版（不再混着经典模型）
const app = window.__game, v = app.view, cv = app.canvasMode, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 10);
const T = v.terrain, DEFS = [
  { id: 'lighthouse', name: '灯塔', prop: 'lighthouse', s: 1, r: 0.4 }, { id: 'windmill', name: '风车', prop: 'windmill', s: 1, r: 0.42 }, { id: 'belltower', name: '钟楼', prop: 'bellTower', s: 1, r: 0.36 },
  { id: 'hut', name: '茅屋', prop: 'strawHut', s: 1.05, r: 0.34 }, { id: 'campfire', name: '营火', prop: 'campfire', s: 1, r: 0.16, fire: true }, { id: 'woodpile', name: '柴堆', prop: 'woodPile', s: 1, r: 0.14 },
  { id: 'signpost', name: '路牌', prop: 'signpost', s: 1, r: 0.08 }, { id: 'boat', name: '小船', prop: 'rowBoat', s: 1.2, water: true }, { id: 'buoy', name: '浮标', prop: 'buoy', s: 1, water: true }];
const land = [], sea = [];
for (let x = -2.6; x <= 2.6; x += 0.45) for (let z = -2.6; z <= 2.6; z += 0.45) (T.heightAt(x, z) != null ? land : sea).push([x, z]);
land.sort((a, b) => Math.hypot(...a) - Math.hypot(...b)); sea.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
let placed = 0; const at = [];
for (const D of DEFS) {
  const pool = D.water ? sea : land;
  for (const [x, z] of pool) { const n0 = v.items.items.size; cv.placeItem({ x, z, land: !D.water }, D); if (v.items.items.size > n0) { placed++; at.push([x, z]); pool.splice(pool.indexOf(pool.find((q) => q[0] === x && q[1] === z)), 1); break; } }
}
let propTris = 0; v.items.group.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) propTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
const cx = at.reduce((s, p) => s + p[0], 0) / at.length, cz = at.reduce((s, p) => s + p[1], 0) / at.length;
await app.rig.flyTo(cx, cz, 4.2, 0.3, { pitch: 0.55 }); await wait(3500); await window.__shot('props');
// 海里：鱼群、海龟、珊瑚、海带都应是体素模型；海鸥也是
const M = v.marine, vox = (m) => !!m?.geometry?.userData?.vox;
const marine = M ? { fish: vox(M.schools?.[0]?.mesh), dolphin: vox(M.dolphins?.mesh), jelly: vox(M.jellies?.mesh), habitat: M.habitat?.children?.length ? M.habitat.children.every(vox) : null } : null;
const reef = M?.spots?.reef?.[0] || M?.spots?.grass?.[0];
if (reef) { await app.rig.flyTo(reef[0], reef[2], 3.2, 0.3, { pitch: 1.0 }); await wait(3000); await window.__shot('sea'); }
return { placed, propTris: Math.round(propTris), marine };
