// Trees everywhere + agriculture areas tree-free. Run: npx tsx scripts/tree-dense-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_KIND_COUNT, TREE_STRIDE, TreeKind } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';
import { FARM_AREAS } from '../src/farm/FarmAreas';

const V = Config.vegetation;
const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2;

function ring(px: number, pz: number, r0: number, r1: number): number {
  const cx0 = Math.floor((px - r1 + half) / cs), cx1 = Math.floor((px + r1 + half) / cs);
  const cz0 = Math.floor((pz - r1 + half) / cs), cz1 = Math.floor((pz + r1 + half) / cs);
  let n = 0;
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const arrs = placer.place(cx, cz);
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const a = arrs[k];
      if (!a || k === TreeKind.deadLog || k === TreeKind.leafLitter) continue;
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        const d = Math.hypot(chunkOriginX(cx) + a[i] - px, chunkOriginZ(cz) + a[i + 2] - pz);
        if (d >= r0 && d < r1) n++;
      }
    }
  }
  return n;
}

let ok = true, inside = 0, outN = 0, outHa = 0;
for (const a of FARM_AREAS) {
  const n = ring(a.cx, a.cz, 0, a.r);
  const o = ring(a.cx, a.cz, a.r + 40, a.r + 400);
  const ha = Math.PI * ((a.r + 400) ** 2 - (a.r + 40) ** 2) / 10000;
  console.log(`${a.id}: inside circle ${n} | open ring ${o} (${(o / ha).toFixed(1)}/ha)`);
  inside += n; outN += o; outHa += ha;
}
console.log(`farm areas inside: ${inside} ${inside === 0 ? 'OK' : 'FAIL'}; open ring: ${(outN / outHa).toFixed(1)} trees/ha`);
if (inside !== 0) ok = false;
const sp = V.jungleSpots[0];
console.log(`A-coast jungle core: ${(ring(sp.x, sp.z, 0, 300) / (Math.PI * 300 * 300 / 10000)).toFixed(0)} plants/ha`);
console.log(ok ? 'PASS' : 'FAIL');
