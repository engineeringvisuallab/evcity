// STEP 3.1 (headless): natural ground under the ring: every 10 m of station, offsets -70..+70 m every 5 m (left of travel = negative).
// Run: npx tsx scripts/ring-profile-export.ts <out-dir>   writes ring_ground_grid.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildAlignment, poseAt } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const al = buildAlignment([...RING_PIS]);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const OFF: number[] = []; for (let o = -70; o <= 70; o += 5) OFF.push(o);
const n = Math.floor(al.length / 10);
const g: number[][] = [], w: number[][] = [];
for (let i = 0; i < n; i++) {
  const p = poseAt(al, i * 10);
  const nx = -Math.sin(p.h), nz = Math.cos(p.h);
  const gr: number[] = [], wr: number[] = [];
  for (const o of OFF) { gen.sampleNatural(p.x + nx * o, p.z + nz * o, sc); gr.push(+sc.h.toFixed(2)); wr.push(Number.isNaN(sc.water) ? -999 : +sc.water.toFixed(2)); }
  g.push(gr); w.push(wr);
}
writeFileSync(`${out}/ring_ground_grid.json`, JSON.stringify({ length: al.length, step: 10, off: OFF, g, w }));
console.log(`stations ${n}, offsets ${OFF.length}`);
