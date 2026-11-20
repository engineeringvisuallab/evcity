// Jungle thicket (Config.vegetation.dense.thicket): plants per hectare inside the A-coast jungle with thicket off vs on, and the lata-pata share. Run: npx tsx scripts/jungle-thicket-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_KIND_COUNT, TREE_STRIDE, TREE_TRUNK, TreeKind } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

const V = Config.vegetation;
const T = V.dense.thicket;
const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2;
const sp = V.jungleSpots[0];
const R = 300; // inner circle, fully inside the jungle

function count(): { n: number; under: number; ms: number } {
  const cx0 = Math.floor((sp.x - R + half) / cs), cx1 = Math.floor((sp.x + R + half) / cs);
  const cz0 = Math.floor((sp.z - R + half) / cs), cz1 = Math.floor((sp.z + R + half) / cs);
  let n = 0, under = 0;
  const t0 = performance.now();
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const arrs = placer.place(cx, cz);
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const a = arrs[k];
      if (!a) continue;
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        const x = chunkOriginX(cx) + a[i], z = chunkOriginZ(cz) + a[i + 2];
        if (Math.hypot(x - sp.x, z - sp.z) > R) continue;
        n++;
        if (k === TreeKind.fern || k === TreeKind.shrub || k === TreeKind.lata) under++;
      }
    }
  }
  return { n, under, ms: performance.now() - t0 };
}

let ok = true;
const layers = T.layers;
T.layers = 0;
const off = count();
T.layers = layers;
const on = count();
const area = Math.PI * R * R / 10000;
const ratio = on.n / Math.max(1, off.n);
console.log(`A-coast core (r ${R} m, ${area.toFixed(0)} ha): thicket off ${off.n} (${(off.n / area).toFixed(0)}/ha) -> on ${on.n} (${(on.n / area).toFixed(0)}/ha) = x${ratio.toFixed(2)} | lata-pata ${on.under} (${((on.under / on.n) * 100).toFixed(0)}%) | ${on.ms.toFixed(0)} ms`);
if (ratio < 3.0 || ratio > 4.4) { ok = false; console.log("FAIL: density should be about 3.7x (thicket layers 4, chance 0.85, 2026-11-20)"); }
if (on.under <= 0) { ok = false; console.log('FAIL: no lata-pata'); }
for (const k of [TreeKind.fern, TreeKind.shrub, TreeKind.lata]) if (TREE_TRUNK[k].r >= Config.vegetation.passRadius) { ok = false; console.log('FAIL: undergrowth kind', k, 'would get a collider'); }
console.log(ok ? 'PASS jungle thicket' : 'FAIL');
process.exit(ok ? 0 : 1);
