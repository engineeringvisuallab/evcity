// B7-3a-2 (T22 = R6-11 end on M8): export the real road + ground data of the tap area for the geometry script tools/b7-3a-t22.py.
// WATER CHECK RUN FIRST (sc.water > sc.h) on the whole 900 m box; ground grid 15 m. Read only: changes nothing in src.
// Run: npx tsx scripts/b7-3a-t22-export.ts docs
import { writeFileSync } from 'fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
Config.roads.r6New.enabled = true;
const OUT = process.argv[2] ?? 'docs';
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const roads = gen.roads.roads;
const m = roads.find((q: any) => q.name === 'M8'), r6 = roads.find((q: any) => q.name === 'R6-11');
const e = r6.xs.length - 1; let k = 0, bd = 1e18;
for (let i = 0; i < m.xs.length; i++) { const d = Math.hypot(m.xs[i] - r6.xs[e], m.zs[i] - r6.zs[e]); if (d < bd) { bd = d; k = i; } }
const sM = m.cum[k];
const main: number[][] = []; for (let i = 0; i < m.xs.length; i++) if (Math.abs(m.cum[i] - sM) <= 900) main.push([m.cum[i] - sM, m.xs[i], m.zs[i], m.ys[i], m.hNat[i], m.bridgeOf[i]]);
const stem: number[][] = []; for (let i = 0; i < r6.xs.length; i++) if (r6.cum[e] - r6.cum[i] <= 700) stem.push([r6.cum[i] - r6.cum[e], r6.xs[i], r6.zs[i], r6.ys[i], r6.hNat[i]]);
const cx = m.xs[k], cz = m.zs[k], N = 900, G = 15; const grid: number[][] = []; let wet = 0, tot = 0;
for (let z = cz - N; z <= cz + N; z += G) { const row: number[] = []; for (let x = cx - N; x <= cx + N; x += G) { gen.sample(x, z, sc); const w = !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water - sc.h : 0; tot++; if (w > 0) wet++; row.push(Math.round(sc.h * 100) / 100 + (w > 0 ? 1000 : 0)); } grid.push(row); }
console.log(`water check: ${wet} wet of ${tot} samples in the 1800 x 1800 m box (grid ${G} m)`);
writeFileSync(`${OUT}/b7_3a_t22_in.json`, JSON.stringify({ tap: [cx, cz], sM, main, stem, grid: { x0: cx - N, z0: cz - N, step: G, rows: grid }, mainSection: { halfWidth: m.halfWidth, medianHalf: m.medianHalf, laneW: m.laneW, shyOuter: m.shyOuter, shoulder: m.shoulder }, stemSection: { halfWidth: r6.halfWidth, medianHalf: r6.medianHalf, laneW: r6.laneW } }));
