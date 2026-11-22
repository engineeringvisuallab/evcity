// Jungle vines (Config.vegetation.dense.vines): hanging lianas + leaning-stem tangles inside the A-coast jungle, none outside, no colliders, switch-off works. Run: npx tsx scripts/jungle-vines-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_STRIDE, TREE_TRUNK, TreeKind } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

const V = Config.vegetation;
const VN = V.dense.vines;
const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2;
const sp = V.jungleSpots[0];
const R = 300; // inner circle, fully inside the jungle

function count(cxm: number, czm: number, r: number, lod = 0): { lianas: number; tangles: number; ms: number } {
  const cx0 = Math.floor((cxm - r + half) / cs), cx1 = Math.floor((cxm + r + half) / cs);
  const cz0 = Math.floor((czm - r + half) / cs), cz1 = Math.floor((czm + r + half) / cs);
  let lianas = 0, tangles = 0;
  const t0 = performance.now();
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const arrs = placer.place(cx, cz, lod);
    for (const [k, isLiana] of [[TreeKind.liana, true], [TreeKind.tangle, false]] as const) {
      const a = arrs[k];
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        const x = chunkOriginX(cx) + a[i], z = chunkOriginZ(cz) + a[i + 2];
        if (Math.hypot(x - cxm, z - czm) > r) continue;
        if (isLiana) lianas++; else tangles++;
      }
    }
  }
  return { lianas, tangles, ms: performance.now() - t0 };
}

let ok = true;
const area = Math.PI * R * R / 10000;
const on = count(sp.x, sp.z, R);
console.log(`A-coast core (r ${R} m, ${area.toFixed(0)} ha): ${on.lianas} lianas (${(on.lianas / area).toFixed(1)}/ha), ${on.tangles} tangles (${(on.tangles / area).toFixed(1)}/ha), ${on.ms.toFixed(0)} ms`);
if (on.lianas < area * 3) { ok = false; console.log('FAIL: too few lianas'); }
if (on.tangles < area * 3) { ok = false; console.log('FAIL: too few tangles'); }
for (const k of [TreeKind.liana, TreeKind.tangle]) if (TREE_TRUNK[k].r >= V.passRadius) { ok = false; console.log('FAIL: kind', k, 'would get a collider'); }
// the far chunks (LOD 1) never get vines
const far = count(sp.x, sp.z, R, 1);
if (far.lianas + far.tangles !== 0) { ok = false; console.log('FAIL: vines in LOD 1 chunks'); }
// open land (no jungle) has none: 300 m round the city centre
const open = count(0, 0, 300);
console.log(`open land near the origin: ${open.lianas} lianas, ${open.tangles} tangles`);
if (open.lianas + open.tangles !== 0) { ok = false; console.log('FAIL: vines outside the jungle'); }
// switch off
const saved = { ...VN };
VN.lianaChance = 0; VN.tangleChance = 0;
const none = count(sp.x, sp.z, R);
Object.assign(VN, saved);
if (none.lianas + none.tangles !== 0) { ok = false; console.log('FAIL: vines do not switch off'); }
console.log(ok ? 'PASS jungle vines' : 'FAIL');
process.exit(ok ? 0 : 1);
