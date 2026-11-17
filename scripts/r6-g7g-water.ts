// STEP G7g (headless, numbers only, nothing in src/ changed): WATER CHECK of the north stem R6-8 and the two slips against the game terrain (sc.water > sc.h - 0.3 = wet), centreline and 35 m beside it.
// Run: npx tsx scripts/r6-g7g-water.ts docs      (needs docs/r6_g7g_north.json)
import { readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const dir = process.argv[2] ?? 'docs';
const N = JSON.parse(readFileSync(dir + '/r6_g7g_north.json', 'utf8')) as { stem: number[][]; es: { pts: number[][] }; en: { pts: number[][] } };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const wet = (x: number, z: number) => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
let bad = 0;
for (const [name, pts, buf] of [['stem R6-8', N.stem, 35], ['exit slip m1', N.es.pts, 35], ['entry slip m2', N.en.pts, 35]] as [string, number[][], number][]) {
  let n = 0, w = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (z1 - z0) / l, nz = -(x1 - x0) / l;
    for (let t = 0; t < l; t += 5) for (let o = -buf; o <= buf; o += 7) { n++; if (wet(x0 + ((x1 - x0) * t) / l + nx * o, z0 + ((z1 - z0) * t) / l + nz * o)) w++; }
  }
  console.log(`${w === 0 ? 'PASS' : 'FAIL'}  WATER ${name}: ${n} samples (centre and +-${buf} m, step 5 m), wet ${w}`); if (w) bad++;
}
console.log(bad ? 'RESULT: FAIL (water)' : 'RESULT: PASS (water: stem and both slips dry, 35 m beside)');
