import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import * as fs from 'fs';
const g: any = new TerrainGenerator(Config.world.seed);
const R = g.roads; const pad = R.pads.find((p: any) => p.id === 6); const hw = R.roads[5];
const k0 = hw.xs.reduce((b: number, _: number, i: number) => (Math.hypot(hw.xs[i] - pad.x, hw.zs[i] - pad.z) < Math.hypot(hw.xs[b] - pad.x, hw.zs[b] - pad.z) ? i : b), 0);
const yaw = Math.atan2(hw.zs[k0 + 1] - hw.zs[k0 - 1], hw.xs[k0 + 1] - hw.xs[k0 - 1]);
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const toL = (x: number, z: number) => ({ u: (x - pad.x) * cy + (z - pad.z) * sy, v: (x - pad.x) * sy - (z - pad.z) * cy });
const ground = (x: number, z: number) => (g.heightAt ? g.heightAt(x, z) : g.getHeight(x, z));
const out: any = { pad: { x: pad.x, z: pad.z, y: pad.y, rCore: pad.rCore, outline: Array.from(pad.outline as ArrayLike<number>) }, yaw, roads: {}, terrain: [] , padOutline: []};
for (const id of [5, 24, 25, 33, 245, 246, 247]) { const r = R.roads[id]; if (!r) continue; out.roads[id] = { name: r.name, halfW: r.halfWidth, pts: [] as any[] }; for (let i = 0; i < r.xs.length; i++) { const p = toL(r.xs[i], r.zs[i]); if (Math.abs(p.u) < 420 && Math.abs(p.v) < 420) out.roads[id].pts.push([p.u, p.v, r.ys[i], r.bridgeOf[i]]); } }
const ol = out.pad.outline; for (let i = 0; i + 1 < ol.length; i += 2) { const p = toL(ol[i], ol[i + 1]); out.padOutline.push([p.u, p.v]); }
for (let u = -400; u <= 400; u += 8) { const row: number[] = []; for (let v = -400; v <= 400; v += 8) row.push(ground(pad.x + u * cy + v * sy, pad.z + u * sy - v * cy) - pad.y); out.terrain.push(row); }
out.rivers = (g.rivers && g.rivers.length) || 0;
fs.writeFileSync('/tmp/j6.json', JSON.stringify(out));
console.log('ok', Object.keys(out.roads), out.padOutline.length, 'rivers', out.rivers, Object.keys(g.rivers ?? {}).slice(0,5));
