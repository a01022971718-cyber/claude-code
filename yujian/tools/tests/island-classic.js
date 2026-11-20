const app = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); await app.rig.flyTo(0.5, 0.3, 9, 0.2, { pitch: 0.6 }); await wait(3000);
const v = app.view, bad = []; v.scene.traverse((o) => { if (!o.isMesh || !o.geometry) return; const p = o.geometry.attributes.position.array, n = o.geometry.attributes.normal?.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { bad.push('pos:' + (o.name || o.parent?.name)); break; } if (n) for (let i = 0; i < n.length; i++) if (!Number.isFinite(n[i])) { bad.push('nor:' + (o.name || o.parent?.name || o.geometry.userData.simplified)); break; } });
return bad.slice(0, 10);
