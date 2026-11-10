// ROADS STEP 6c: how much the road upgrade (Steps 2-6) puts around the player. Counts every road item per 250 m square, then the busiest circle of the draw radius.
// Report only (no pass / fail). Run: npx tsx scripts/roads-perf-report.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { planFootpaths } from '../src/roads/FootpathPlan';
import { planMedians } from '../src/roads/MedianPlan';
import { planMedianLamps } from '../src/roads/Planting';
import { planUTurnSigns } from '../src/roads/UTurnSignPlan';
import { planRoadside } from '../src/roads/Roadside';

const gen = new TerrainGenerator();
const roads = gen.roads;
const SQ = 250;
const HALF = Config.world.size / 2;
type Bin = Map<string, number>;
const cats: Record<string, { bin: Bin; per: string }> = {};
const add = (cat: string, x: number, z: number, n = 1, per = 'items'): void => {
  const c = (cats[cat] ??= { bin: new Map(), per });
  const k = Math.floor((x + HALF) / SQ) + ',' + Math.floor((z + HALF) / SQ);
  c.bin.set(k, (c.bin.get(k) ?? 0) + n);
};

const fp = planFootpaths(roads);
for (const u of fp.runs) for (let k = 0; k < u.n - 1; k++) add('footpath triangles', u.p[k * 8], u.p[k * 8 + 2], 10, 'tris');
for (let i = 0; i < fp.gullies.length; i += 4) add('gully grates', fp.gullies[i], fp.gullies[i + 2], 1, 'instances');
const mp = planMedians(roads);
for (const u of mp.runs) for (let k = 0; k < u.n - 1; k++) add('median triangles', u.p[k * 8], u.p[k * 8 + 2], 14, 'tris');
for (const c of mp.crossings) {
  const bars = Math.ceil((roads.roads[c.roadId].halfWidth * 2) / Config.city.median.crossing.barStep);
  add('zebra bars', c.x, c.z, bars * 2 + 3, 'quads');
}
for (const l of planMedianLamps(roads)) add('median lamp arms', l.x, l.z, 2, 'instances');
for (const s of planUTurnSigns(roads)) add('U-turn signs', s.x, s.z, 2, 'instances');
const rs = planRoadside(gen);
for (let i = 0; i < rs.trees.length; i += 8) add('street + median trees', rs.trees[i], rs.trees[i + 2], 1, 'instances');
for (let i = 0; i < rs.hedges.length; i += 7) add('hedge pieces', rs.hedges[i], rs.hedges[i + 2], 1, 'instances');
for (let i = 0; i < rs.pits.length; i += 4) add('tree pits', rs.pits[i], rs.pits[i + 2], 1, 'instances');

const radius = Config.city.roadside.drawRadius;
console.log(`road items per 250 m square, and the busiest circle of the draw radius (${radius} m at the top quality, x Q.roadsideMul on lower presets)\n`);
console.log('item'.padEnd(24) + 'total'.padStart(9) + 'worst sq'.padStart(10) + 'in circle'.padStart(11) + '  at (x, z)');
let tris = 0;
for (const [name, c] of Object.entries(cats)) {
  let total = 0, worst = 0;
  for (const v of c.bin.values()) { total += v; worst = Math.max(worst, v); }
  // busiest circle: centre on every occupied square
  let best = 0, bx = 0, bz = 0;
  for (const k of c.bin.keys()) {
    const [i, j] = k.split(',').map(Number);
    const cx = (i + 0.5) * SQ - HALF, cz = (j + 0.5) * SQ - HALF;
    let sum = 0;
    for (const [k2, v] of c.bin) { const [a, b] = k2.split(',').map(Number); if (Math.hypot((a + 0.5) * SQ - HALF - cx, (b + 0.5) * SQ - HALF - cz) <= radius) sum += v; }
    if (sum > best) { best = sum; bx = cx; bz = cz; }
  }
  if (c.per === 'tris') tris += best;
  console.log(name.padEnd(24) + String(total).padStart(9) + String(worst).padStart(10) + String(best).padStart(11) + `  ${Math.round(bx)}, ${Math.round(bz)}  (${c.per})`);
}
console.log(`\nfootpath + median triangles in their busiest circles added: ${tris} (an upper bound: the two peaks are not at the same place; the views draw 0.6x / 0.7x of the radius)`);
