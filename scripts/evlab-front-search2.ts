// Headless search v2: arms INCLUDE the straight stretch s = 0..315 from the J1 centre (v1 only had s >= 315). Changes nothing.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const J1 = { x: -87, z: -277 }, YAW = (37.5 * Math.PI) / 180;
const dirs: Record<string, [number, number]> = { 'J1-N': [Math.sin(YAW), -Math.cos(YAW)], 'J1-E': [Math.cos(YAW), Math.sin(YAW)], 'J1-S': [-Math.sin(YAW), Math.cos(YAW)], 'J1-W': [-Math.cos(YAW), -Math.sin(YAW)] };
const arms: Record<string, Array<[number, number]>> = {};
for (const k of Object.keys(dirs)) { arms[k] = []; for (let s = 0; s < 315; s += 5) arms[k].push([J1.x + dirs[k][0] * s, J1.z + dirs[k][1] * s]); }
for (const a of J1_ARM_DATA) for (const p of a.pts) arms[a.name].push([p[0], p[1]]);
const rail: Array<[number, number]> = [];
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 10)); for (let k = 0; k <= n; k++) rail.push([e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n]); }
const dRect = (x0: number, x1: number, z0: number, z1: number, pts: Array<[number, number]>): number => { let m = 1e9; for (const [x, z] of pts) m = Math.min(m, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1))); return m; };
const all = Object.values(arms).flat();
const W = +(process.env.PW ?? 312), D = +(process.env.PD ?? 308), LOTW = 40, LOTZ0 = 105, LOTZ1 = 245; // lot strip: east of the plot, local z 0..140
let best: any[] = [];
for (let cx = -700; cx <= 300; cx += 10) for (let cz = -900; cz <= -300; cz += 10) {
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const dm = dRect(x0, x1, z0, z1, all); if (dm < 60) continue;
  const lz0 = z0 + LOTZ0, lz1 = z0 + LOTZ1; const dl = dRect(x1, x1 + LOTW, lz0, lz1, all); if (dl < 30) continue;
  const dj = Math.hypot(Math.max(x0 - J1.x, 0, J1.x - x1), Math.max(z0 - J1.z, 0, J1.z - z1)); if (dj < 110) continue;
  if (dRect(x0, x1 + LOTW, z0, z1, rail) < 50) continue;
  const hs: number[] = []; for (let x = x0; x <= x1 + LOTW; x += 12) for (let z = z0; z <= z1; z += 12) hs.push(g(x, z));
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length; let cut = 0, fill = 0; for (const h of hs) { if (h > mean) cut += (h - mean) * 144; else fill += (mean - h) * 144; }
  const dN = dRect(x0, x1 + LOTW, z0, z1, arms['J1-N']), dN0 = dN, dW = dRect(x0, x1, z0, z1, arms['J1-W']), dS = dRect(x0, x1 + LOTW, z0, z1, arms['J1-S']), dE = dRect(x0, x1 + LOTW, z0, z1, arms['J1-E']);
  if (process.env.WEDGE === 'NW' && (dN0 > 160 || dW > 160)) continue;
  if (dj > +(process.env.MAXJ ?? 1e9)) continue;
  best.push({ cx, cz, cut, fill, relief: Math.max(...hs) - Math.min(...hs), dS, dm, dl, dN, dW, dE, dj });
}
best.sort((a, b) => a.cut + a.fill - (b.cut + b.fill));
console.log(`plot ${W}x${D} (+lot strip ${LOTW}): ${best.length} clear placements; best 8 by moved ground`);
for (const r of best.slice(0, 8)) console.log(` centre (${r.cx},${r.cz}) cut ${(r.cut / 1e6).toFixed(2)} fill ${(r.fill / 1e6).toFixed(2)} Mm3 relief ${r.relief.toFixed(1)} | clear plot ${r.dm.toFixed(0)} lot ${r.dl.toFixed(0)} | dN ${r.dN.toFixed(0)} dW ${r.dW.toFixed(0)} dE ${r.dE.toFixed(0)} dS ${r.dS.toFixed(0)} dJ1 ${r.dj.toFixed(0)}`);
