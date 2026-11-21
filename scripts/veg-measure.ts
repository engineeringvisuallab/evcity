import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_KIND_COUNT, TREE_STRIDE, TreeKind } from '../src/vegetation/TreeTypes';
import { chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';
const V = Config.vegetation;
const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2;
const regions = [
  { name: 'jungleA', x: V.jungleSpots[0].x, z: V.jungleSpots[0].z, R: 300 },
  { name: 'jungleB', x: V.jungleSpots[1].x, z: V.jungleSpots[1].z, R: 300 },
  { name: 'outside(0,0)', x: 0, z: 0, R: 400 },
];
const names: Record<number, string> = {};
for (const [k, v] of Object.entries(TreeKind)) names[v as number] = k;
for (const r of regions) {
  const area = Math.PI * r.R * r.R / 10000;
  const cnt: Record<number, number> = {}, sum: Record<number, number> = {}, small: Record<number, number> = {};
  const lit: [number, number][] = [];
  const cx0 = Math.floor((r.x - r.R + half) / cs), cx1 = Math.floor((r.x + r.R + half) / cs);
  const cz0 = Math.floor((r.z - r.R + half) / cs), cz1 = Math.floor((r.z + r.R + half) / cs);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const arrs = placer.place(cx, cz);
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const a = arrs[k]; if (!a) continue;
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        const x = chunkOriginX(cx) + a[i], z = chunkOriginZ(cz) + a[i + 2];
        if (Math.hypot(x - r.x, z - r.z) > r.R) continue;
        cnt[k] = (cnt[k] ?? 0) + 1; sum[k] = (sum[k] ?? 0) + a[i + 3];
        if (a[i + 3] < 0.9) small[k] = (small[k] ?? 0) + 1;
        if (k === TreeKind.leafLitter) lit.push([x, z]);
      }
    }
  }
  console.log(`== ${r.name} (${area.toFixed(0)} ha)`);
  for (const k of Object.keys(cnt).map(Number).sort((a, b) => a - b)) {
    if (k === TreeKind.leafLitter || k === TreeKind.deadLog) continue;
    console.log(`  ${names[k].padEnd(12)} ${(cnt[k] / area).toFixed(1).padStart(7)}/ha  meanScale ${(sum[k] / cnt[k]).toFixed(2)}  scale<0.9: ${(100 * (small[k] ?? 0) / cnt[k]).toFixed(0)}%`);
  }
  if (lit.length) {
    const g = new Map<string, number[]>();
    lit.forEach(([x, z], idx) => { const key = Math.floor(x / 2) + ',' + Math.floor(z / 2); (g.get(key) ?? g.set(key, []).get(key)!).push(idx); });
    let clustered = 0, nn = 0;
    for (const [x, z] of lit) {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of g.get((Math.floor(x / 2) + dx) + ',' + (Math.floor(z / 2) + dz)) ?? []) {
        const d = Math.hypot(lit[j][0] - x, lit[j][1] - z); if (d > 0 && d < 1.5) n++;
      }
      if (n >= 4) clustered++; nn += n;
    }
    console.log(`  leafLitter ${(lit.length / area).toFixed(0)}/ha  clustered(>=4 neighbours <1.5m) ${(100 * clustered / lit.length).toFixed(0)}%  avgNeighbours ${(nn / lit.length).toFixed(1)}`);
  }
}
