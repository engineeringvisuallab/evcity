// Jungle spots (Config.vegetation.jungleSpots): trees inside each spot vs the same circle with the spots switched off. Run: npx tsx scripts/jungle-spots-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_KIND_COUNT, TREE_STRIDE } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

const V = Config.vegetation;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const placer = new TreePlacer(gen, plan, Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2;
const s = gen.makeSample();
const SPOTS = V.jungleSpots;
const saved = SPOTS.slice();

function count(sp: { x: number; z: number; r: number }): { n: number; ms: number; land: number } {
  const cx0 = Math.floor((sp.x - sp.r + half) / cs), cx1 = Math.floor((sp.x + sp.r + half) / cs);
  const cz0 = Math.floor((sp.z - sp.r + half) / cs), cz1 = Math.floor((sp.z + sp.r + half) / cs);
  let n = 0, land = 0;
  const t0 = performance.now();
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const arrs = placer.place(cx, cz);
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const a = arrs[k];
      if (!a) continue;
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        const x = chunkOriginX(cx) + a[i], z = chunkOriginZ(cz) + a[i + 2];
        if (Math.hypot(x - sp.x, z - sp.z) <= sp.r) n++;
      }
    }
  }
  for (let a = 0; a < 200; a++) { const ang = a * 2.399, d = Math.sqrt(a / 200) * sp.r; gen.sample(sp.x + Math.cos(ang) * d, sp.z + Math.sin(ang) * d, s); if (s.h > V.seaMargin && (Number.isNaN(s.water) || s.h > s.water + V.waterMargin)) land++; }
  return { n, ms: performance.now() - t0, land: land / 200 };
}

let ok = true;
for (const sp of saved) {
  SPOTS.length = 0;
  const base = count(sp);
  SPOTS.push(...saved);
  const withSpot = count(sp);
  const area = Math.PI * sp.r * sp.r / 10000; // hectares
  const ratio = withSpot.n / Math.max(1, base.n);
  console.log(`${sp.id}: land share ${(withSpot.land * 100).toFixed(0)}% | trees in circle ${base.n} -> ${withSpot.n} (x${ratio.toFixed(2)}, ${(withSpot.n / area).toFixed(1)}/ha) | ${withSpot.ms.toFixed(0)} ms for ${Math.ceil(2 * sp.r / cs + 1) ** 2} chunks`);
  if (!(withSpot.n >= base.n)) ok = false;
  if (withSpot.land < 0.2) { ok = false; console.log('  FAIL: most of the spot is water / sea'); }
}
SPOTS.length = 0; SPOTS.push(...saved);
console.log(ok ? 'PASS jungle spots add trees on land' : 'FAIL');
process.exit(ok ? 0 : 1);
