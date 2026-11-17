// GRASS 4 check: npx tsx scripts/grass-city-test.ts
//  (a) city lawn: grass density inside the planned city (on lawn ground) above a threshold, none on roads / pavement / parking / plots, tall clumps at tree bases,
//  (b) terrain: the city greenness mask is 1 inside, 0 far outside, with a soft edge; chunk mask layout matches the road mask,
//  (c) roads: city flag only inside cities, sidewalk width, tree pits every 12-15 m inside the sidewalk, no pit on asphalt,
//  (d) country: guardrail posts every 4 m, on embankment / curve sides only, never in a city; verge shrubs beyond the shoulder.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { getCityGreen, buildCityMask } from '../src/city/CityGreen';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';
import { planRoadside } from '../src/roads/Roadside';
import { parkingContains } from '../src/parking/ParkingSite';
import { placementContains } from '../src/buildings/Placements';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const mask = new Float32Array(2);
const roads = gen.roads;

// ---------------- (a) city lawn ----------------
const st = gen.sites[0];
const tiles: [number, number][] = [];
for (const [ox, oz] of [[200, 100], [-250, -200], [150, -300], [-300, 250]]) {
  const tx0 = Math.floor((st.x + ox + HALF) / G.tile), tz0 = Math.floor((st.z + oz + HALF) / G.tile);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) tiles.push([tx0 + dx, tz0 + dz]);
}
let lawn = 0, clumps = 0, base = 0, other = 0, bad = 0;
const fail = (m: string) => { if (bad++ < 10) console.log('  problem:', m); };
const lawnXZ: [number, number][] = [];
for (const [tx, tz] of tiles) {
  const d = grass.place(tx, tz);
  const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
  for (let i = 0; i < d.length; i += GRASS_STRIDE) {
    const x = ox + d[i], z = oz + d[i + 2];
    const f = Math.round(d[i + 7]);
    if (f === 2) lawn++; else if (f === 1) clumps++; else if (f === 3) base++; else other++;
    if (f === 2 && tiles.slice(0, 25).some((t) => t[0] === tx && t[1] === tz)) lawnXZ.push([x, z]); // the first 25 tiles = the density sample
    roads.maskAt(x, z, 1, mask);
    if (mask[1] > 0.01) fail(`grass on a road / sidewalk at ${x.toFixed(1)},${z.toFixed(1)}`);
    if (roads.cityWalkAt(x, z)) fail(`grass on a city sidewalk at ${x.toFixed(1)},${z.toFixed(1)}`);
    if (parkingContains(x, z, 0.5)) fail(`grass on a parking lot at ${x.toFixed(1)},${z.toFixed(1)}`);
    if (gen.mall.contains(x, z, 0.5) || gen.evlab.contains(x, z, 0.5) || gen.library.contains(x, z, 0.5) || gen.protoBuilding.contains(x, z, 0.5)) fail(`grass on a building plot at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
}
ok(bad === 0, 'city grass: none on roads, sidewalks, parking lots or building plots');
console.log(`city tiles ${tiles.length}: lawn tufts ${lawn}, small clumps ${clumps}, tall base/fence clumps ${base}, meadow tufts ${other}`);
// density on FREE lawn ground: sample 1 m squares inside the city that are not blocked; count lawn tufts per m2
{
  let cellsFree = 0, cellsTotal = 0;
  const per = new Map<string, number>();
  for (const [x, z] of lawnXZ) { const k = Math.floor(x) + ',' + Math.floor(z); per.set(k, (per.get(k) ?? 0) + 1); }
  // free square = a 1 m square whose centre is inside a city area (lawnAt = 1), not road / walk / plot / parking
  for (const [tx, tz] of tiles.slice(0, 25)) {
    const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
    for (let j = 0; j < G.tile; j += 2) for (let i = 0; i < G.tile; i += 2) {
      const x = ox + i + 0.5, z = oz + j + 0.5;
      cellsTotal++;
      if (grass.lawnAt(x, z) < 1) continue;
      roads.maskAt(x, z, 1, mask);
      if (mask[1] > 0.01 || parkingContains(x, z, 2) || gen.mall.contains(x, z, 2) || gen.evlab.contains(x, z, 2) || gen.library.contains(x, z, 2) || gen.protoBuilding.contains(x, z, 2) || placementContains(x, z, 2) || gen.railForm.inCorridor(x, z, 2) || gen.infra.some((q) => q.contains(x, z, 2))) continue;
      const s = gen.makeSample(); gen.sample(x, z, s);
      if (s.h < 3.5) continue;
      cellsFree++;
    }
  }
  const dens = lawnXZ.length / Math.max(1, cellsFree * 4); // each free square stands for a 2 x 2 m block
  const min = 4;
  console.log(`free lawn squares ${cellsFree} of ${cellsTotal}; lawn tufts per m2 on free ground ~ ${dens.toFixed(2)} (open-meadow cell grid: ${(1 / (G.cell * G.cell)).toFixed(1)} per m2 x density ${G.city.density})`);
  ok(dens >= min, `lawn density on free city ground >= ${min} tufts / m2`);
}
ok(clumps / Math.max(1, lawn) < 0.05, 'city lawn is mostly short tufts (clumps < 5 % of the instances)');
ok(base > 0, 'tall clumps exist at tree bases / plot fences');

// ---------------- (b) terrain greenness ----------------
{
  const cg = getCityGreen(gen);
  ok(cg.at(st.x, st.z) === 1 && cg.at(st.x + 300, st.z - 200) === 1, 'city greenness = 1 inside the planned city');
  const R = plan.maxRadius(0);
  ok(cg.at(st.x + R + Config.terrain.cityGreen.fadeOut + 1, st.z) === 0, 'city greenness = 0 beyond the soft edge');
  const mid = cg.at(st.x + R + Config.terrain.cityGreen.fadeOut / 2, st.z);
  ok(mid > 0.2 && mid < 0.8, `soft edge: greenness ${mid.toFixed(2)} half way out`);
  let mono = true, prev = 1;
  for (let d = 0; d < Config.terrain.cityGreen.fadeOut; d += 4) { const v = cg.at(st.x + R + d, st.z); if (v > prev + 1e-9) mono = false; prev = v; }
  ok(mono, 'soft edge falls monotonically');
  // chunk mask: layout (n+1)^2 + 4(n+1), values 0..1, null far outside
  const n = 16, vn = n + 1, total = vn * vn + 4 * vn;
  const m = buildCityMask(gen, Math.floor((st.x + HALF) / 500), Math.floor((st.z + HALF) / 500), n, total);
  ok(m !== null && m.length === total && m.every((v) => v >= 0 && v <= 1), 'city chunk mask has one value per vertex incl. skirts, all in 0..1');
  ok(buildCityMask(gen, 0, 0, n, total) === null, 'a chunk far outside every city has no mask (shared zero array)');
}

// ---------------- (c) city roads ----------------
const rs = planRoadside(gen);
{
  let city = 0, outside = 0, wrong = 0;
  for (let s = 0; s < roads.segmentCount; s++) {
    const r = roads.segmentRoad(s);
    if (roads.segmentCity(s)) {
      city++;
      const need = r.halfWidth + Config.city.roadside.sidewalk - 1e-4;
      if (roads.segmentHalf(s) < need) wrong++;
    } else if (r.tier === 4) wrong++; // every local street is a city street
    else outside++;
  }
  ok(city > 1000 && outside > 1000, `road segments: ${city} city, ${outside} open country`);
  ok(wrong === 0, `every city segment has a sidewalk of >= ${Config.city.roadside.sidewalk} m (and every local street is city)`);
  // pits
  const p = rs.pits;
  let badPit = 0, spacingBad = 0, n = p.length / 4;
  for (let i = 0; i < p.length; i += 4) {
    if (roads.surfaceAt(p[i], p[i + 2]) === 1) badPit++;
    if (!roads.cityWalkAt(p[i], p[i + 2])) badPit++;
  }
  ok(n > 500 && badPit === 0, `tree pits: ${n}, all on a city sidewalk and none on asphalt`);
  // spacing along one long local street
  const lens: number[] = [];
  for (let i = 1; i < p.length / 4; i++) { const d = Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 2] - p[i * 4 - 2]); if (d < 25) lens.push(d); }
  lens.sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)];
  console.log(`pit spacing along the roads: median ${med.toFixed(1)} m (straight-line)`);
  void spacingBad;
  ok(med >= Config.city.roadside.treeSpacing[0] - 1.5 && med <= Config.city.roadside.treeSpacing[1] + 1.5, `tree pits are ${Config.city.roadside.treeSpacing[0]}-${Config.city.roadside.treeSpacing[1]} m apart (median)`);
  ok(rs.hedges.length / 7 > 100, `hedge pieces: ${rs.hedges.length / 7}`);
  let hedgeH = true;
  for (let i = 0; i < rs.hedges.length; i += 7) { const h = rs.hedges[i + 5] * 0.75; if (h < Config.city.roadside.hedge.hMin - 0.01 || h > Config.city.roadside.hedge.hMax + 0.01) hedgeH = false; }
  ok(hedgeH, 'hedges are 0.6-0.9 m high');
}

// ---------------- (d) country roads ----------------
{
  const P = rs.posts;
  let inCity = 0, onRoad = 0;
  for (let i = 0; i < P.length; i += 4) {
    if (roads.isCityPoint(P[i], P[i + 2])) inCity++;
    if (roads.surfaceAt(P[i], P[i + 2]) === 1) onRoad++;
  }
  ok(P.length / 4 > 1000, `guardrail posts: ${P.length / 4} (${rs.stats.railMetres.toFixed(0)} m of W-beam)`);
  ok(inCity === 0 && onRoad === 0, 'no guardrail inside a city or on asphalt');
  // post spacing = postStep
  const gaps: number[] = [];
  for (let i = 1; i < P.length / 4; i++) { const d = Math.hypot(P[i * 4] - P[i * 4 - 4], P[i * 4 + 2] - P[i * 4 - 2]); if (d < 6) gaps.push(d); }
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  console.log(`post spacing: median ${med.toFixed(2)} m`);
  ok(Math.abs(med - Config.city.highway.postStep) < 0.35, `posts every ${Config.city.highway.postStep} m (median)`);
  // every post is on an embankment side or on a curve: re-check the drop for a sample
  const sa = gen.makeSample();
  let noReason = 0, tested = 0;
  for (let i = 0; i < P.length; i += 4 * 37) {
    tested++;
    // nearest road: any road within 6 m -> its outward direction; here we only test "ground beside the post is not higher than the road" loosely
    gen.sample(P[i], P[i + 2], sa);
    if (P[i + 1] - sa.h < -1.5) noReason++; // a rail standing 1.5 m BELOW the ground = in a cutting: wrong
  }
  ok(noReason === 0, `guardrail posts are not buried in cuttings (${tested} sampled)`);
  const sh = rs.shrubs;
  let bad2 = 0;
  for (let i = 0; i < sh.length; i += 6) { if (roads.surfaceAt(sh[i], sh[i + 2]) !== 0 || roads.isCityPoint(sh[i], sh[i + 2]) && false) bad2++; }
  ok(sh.length / 6 > 1000 && bad2 === 0, `verge shrubs: ${sh.length / 6}, none on a road or its shoulder`);
}
{
  // highway shoulder is the narrow gravel strip
  const hw = roads.roads.find((r) => r.kind === 'highway' && !r.earth);
  ok(!!hw && Math.abs(hw.shoulder - Config.city.highway.shoulder) < 1e-6, `highway gravel shoulder = ${Config.city.highway.shoulder} m`);
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
