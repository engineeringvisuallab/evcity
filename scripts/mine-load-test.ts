// Mine load terminal + gate (headless): npx tsx scripts/mine-load-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { INFRA_PLACEMENTS } from '../src/engineering/InfraSites';
import { MINE_LOAD } from '../src/vehicles/FuelAreas';
import { ENGINEERING_BY_ID } from '../src/city/EngineeringZones';
import { RoadHash, buildFenceLayout } from '../src/city/EngineeringFence';
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const pl = INFRA_PLACEMENTS.find((p) => p.id === 'mineload')!;
const a = ENGINEERING_BY_ID.get('eng-mining')!;
ok(pl.x + pl.rect.x0 - pl.blend > a.x0 && pl.x + pl.rect.x1 + pl.blend < a.x1 && pl.z + pl.rect.z0 - pl.blend > a.z0 && pl.z + pl.rect.z1 + pl.blend < a.z1, 'pad + grading skirt stay inside eng-mining');
ok(MINE_LOAD.x0 >= pl.x + pl.rect.x0 && MINE_LOAD.x1 <= pl.x + pl.rect.x1 && MINE_LOAD.z0 >= pl.z + pl.rect.z0 && MINE_LOAD.z1 <= pl.z + pl.rect.z1, 'MINE_LOAD bay lies on the pad');
const g = new TerrainGenerator(Config.world.seed);
const lay = buildFenceLayout(a, new RoadHash(g.roads.roads));
ok(lay.gapLength >= 28, `mining fence has an entrance (gap ${Math.round(lay.gapLength)} m)`);
const sc = g.makeSample(), s2 = g.makeSample();
let lo = 1e9, hi = -1e9, maxS = 0;
for (let z = MINE_LOAD.z0; z <= MINE_LOAD.z1; z += 4) for (let x = MINE_LOAD.x0; x <= MINE_LOAD.x1; x += 4) {
  g.sample(x, z, sc); g.sample(x + 2, z, s2); const hx = s2.h; g.sample(x, z + 2, s2);
  maxS = Math.max(maxS, Math.hypot(hx - sc.h, s2.h - sc.h) / 2); lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h);
}
console.log(`  bay ground: relief ${(hi - lo).toFixed(2)} m, max slope ${maxS.toFixed(3)}`);
ok(hi - lo < 1.2, 'the bay ground is level (pad; relief under 1.2 m)');
// the approach from the gate to the pad edge
let steep = 0;
for (let x = pl.x + pl.rect.x1; x <= a.x1; x += 3) { g.sample(x, pl.z, sc); g.sample(x + 2, pl.z, s2); const hx = s2.h; g.sample(x, pl.z + 2, s2); steep = Math.max(steep, Math.hypot(hx - sc.h, s2.h - sc.h) / 2); }
console.log(`  gate -> pad approach: max slope ${steep.toFixed(3)}`);
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
