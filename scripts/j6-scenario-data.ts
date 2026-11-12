// Dumps the data a builder needs for the J6 scenario: pads / roads near the interchange in the (u,v) frame, S4/S5 index ranges to remove, snap targets for the new roads.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import * as fs from 'fs';
const g: any = new TerrainGenerator(Config.world.seed);
const R = g.roads; const pad = R.pads.find((p: any) => p.id === 6); const hw = R.roads[5];
const k0 = hw.xs.reduce((b: number, _: number, i: number) => (Math.hypot(hw.xs[i] - pad.x, hw.zs[i] - pad.z) < Math.hypot(hw.xs[b] - pad.x, hw.zs[b] - pad.z) ? i : b), 0);
const yaw = Math.atan2(hw.zs[k0 + 1] - hw.zs[k0 - 1], hw.xs[k0 + 1] - hw.xs[k0 - 1]);
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const U0 = -68; const cx = pad.x + U0 * cy, cz = pad.z + U0 * sy;   // interchange centre (world)
const toUV = (x: number, z: number) => ({ u: (x - cx) * cy + (z - cz) * sy, v: (x - cx) * sy - (z - cz) * cy });  // origin = centre
const toW = (u: number, v: number) => ({ x: cx + u * cy + v * sy, z: cz + u * sy - v * cy });
const out: any = { centre: { x: cx, z: cz, yawRad: yaw, yF6: null }, frame: 'u along F6 (screen-up = +u), v across (screen-LEFT/west = +v, east/river bridge = -v); origin = interchange centre', pads: [], roads: {}, snap: {} };
let b = 0, bd = 1e18; for (let i = 0; i < hw.xs.length; i++) { const d = (hw.xs[i] - cx) ** 2 + (hw.zs[i] - cz) ** 2; if (d < bd) { bd = d; b = i; } } out.centre.yF6 = hw.ys[b];
for (const p of R.pads) { const l = toUV(p.x, p.z); if (Math.hypot(l.u, l.v) < 700) out.pads.push({ id: p.id, x: p.x, z: p.z, u: +l.u.toFixed(0), v: +l.v.toFixed(0), rCore: +p.rCore.toFixed(1) }); }
for (const r of R.roads) {
  const pts: any[] = [];
  for (let i = 0; i < r.xs.length; i++) { const l = toUV(r.xs[i], r.zs[i]); if (Math.abs(l.u) < 500 && Math.abs(l.v) < 500) pts.push({ i, u: +l.u.toFixed(0), v: +l.v.toFixed(0), y: +r.ys[i].toFixed(1), bridge: r.bridgeOf[i] }); }
  if (pts.length) out.roads[r.id] = { name: r.name, kind: r.kind, halfWidth: r.halfWidth, lanes: r.lanes, nPts: r.xs.length, inWindow: pts.filter((_, k) => k % 8 === 0 || k === pts.length - 1) };
}
// snap targets estimated from the user's sketch (px -> m: 1.76 px/m, screen-up=+u, screen-left=+v)
const T = (u: number, v: number) => { const w = toW(u, v); return { u, v, x: +w.x.toFixed(1), z: +w.z.toFixed(1) }; };
out.snap = { crossing: T(0, 0), westJunctionFarLeft_est: T(-51, 409), tJunction_est: T(-14, 125), southBranchJoinOnS5_est: T(-198, 102) };
const nearestPad = (u: number, v: number) => out.pads.map((p: any) => ({ id: p.id, d: Math.hypot(p.u - u, p.v - v) })).sort((a: any, b2: any) => a.d - b2.d)[0];
out.snap.nearestPadToWestJunction = nearestPad(-51, 409);
fs.mkdirSync('docs/j6/data', { recursive: true });
fs.writeFileSync('docs/j6/data/j6-scenario-data.json', JSON.stringify(out, null, 1));
console.log('pads', JSON.stringify(out.pads)); console.log('snap', JSON.stringify(out.snap));
for (const id of ['24', '25']) console.log(id, JSON.stringify(out.roads[id].inWindow.map((p: any) => `${p.i}:(${p.u},${p.v})${p.bridge >= 0 ? 'B' : ''}`)));
