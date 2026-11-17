// Dense single grass: dense = 5 gives ~5x the tufts of dense = 1 (meadow only, flag 4 extras), the far rings stay a subset of the near ring,
// and the same call twice gives the same result. Run: npx tsx scripts/grass-dense-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';

const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
let bad = 0;
const check = (ok: boolean, msg: string): void => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) bad++; };
const keys = (a: Float32Array): Set<string> => { const s = new Set<string>(); for (let i = 0; i < a.length; i += GRASS_STRIDE) s.add(`${a[i].toFixed(4)},${a[i + 2].toFixed(4)}`); return s; };
const stat = (a: Float32Array) => { let single = 0, extra = 0, clump = 0; for (let i = 0; i < a.length; i += GRASS_STRIDE) { const f = a[i + 7]; if (f > 3.5) extra++; else if (f > 0.5 && f < 1.5) clump++; else single++; } return { single, extra, clump }; };

let tiles: [number, number][] = [[200, 200], [150, 260], [250, 120], [100, 300]];
let total1 = 0, total10 = 0, t10 = 0;
for (const [tx, tz] of tiles) {
  grass.dense = 1; const a1 = grass.place(tx, tz, 1);
  grass.dense = 7.5; const t0 = performance.now(); const a10 = grass.place(tx, tz, 1); t10 += performance.now() - t0;
  const a10b = grass.place(tx, tz, 1);
  const s1 = stat(a1), s10 = stat(a10);
  console.log(`tile ${tx},${tz}: dense1 ${s1.single}+${s1.extra}  dense7.5 ${s10.single}+${s10.extra}`);
  total1 += a1.length / GRASS_STRIDE; total10 += a10.length / GRASS_STRIDE;
  check(a10.length === a10b.length && a10.every((v, i) => v === a10b[i]), `tile ${tx},${tz}: deterministic`);
  check(s10.single === s1.single, `tile ${tx},${tz}: primary tufts unchanged by dense`);
  for (const stride of [2, 4]) { const far = keys(grass.place(tx, tz, stride)); const near = keys(a10); let miss = 0; for (const k of far) if (!near.has(k)) miss++; check(miss === 0, `tile ${tx},${tz}: stride ${stride} ring is a subset of the near ring`); }
}
if (total1 > 0) { const r = total10 / total1; console.log('ratio', r.toFixed(2)); check(r > 6.3 && r < 7.7, 'dense 7.5 is about 7.5x the tufts of dense 1'); }
console.log('avg place time per tile (dense 7.5):', (t10 / tiles.length).toFixed(0), 'ms');
process.exit(bad ? 1 : 0);
