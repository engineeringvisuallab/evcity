// ROADS STEP 5: headless checks of the planting of the divided roads (sight zones, median lamps, country median). No three.js. Run: npx tsx scripts/planting-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { MS, crossingZoneHas, planMedians } from '../src/roads/MedianPlan';
import { uturnZoneHas } from '../src/roads/UTurns';
import { planMedianLamps, sightZoneLen, dividedKind } from '../src/roads/Planting';
import { planRoadside } from '../src/roads/Roadside';
import { planStreetLights } from '../src/environment/StreetLights';
import { medianSoilTop } from '../src/roads/RoadSection';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const P = Config.city.planting;

const gen = new TerrainGenerator();
const roads = gen.roads;
const plan = planMedians(roads);
const rp = planRoadside(gen);

/** Arc length of the point (x, z) along road r (nearest centreline vertex, good to the vertex spacing). */
function sOf(rid: number, x: number, z: number): number {
  const r = roads.roads[rid];
  let best = 1e18; let bs = 0;
  for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(x - r.xs[i], z - r.zs[i]); if (d < best) { best = d; bs = r.cum[i]; } }
  return bs;
}
/** Which divided road a point stands on (within 1.5 m of its centreline), or -1. */
const dividedRoads = roads.roads.filter((r) => r.medianHalf > 0 && !r.earth);
function roadAt(x: number, z: number): number {
  for (const r of dividedRoads) for (let i = 0; i < r.xs.length; i++) if (Math.hypot(x - r.xs[i], z - r.zs[i]) < 1.5) return r.id;
  return -1;
}

console.log('\n=== D7 SIGN ZONE LENGTHS ===');
ok(dividedRoads.every((r) => sightZoneLen(r) >= Config.city.uturn.plantClear), 'every sight zone is at least the old plantClear');
ok(P.sightZone.highway >= P.sightZone.avenue && P.sightZone.arterial >= P.sightZone.avenue, `sight zone: highway ${P.sightZone.highway} m, arterial ${P.sightZone.arterial} m, avenue ${P.sightZone.avenue} m`);

console.log('\n=== SIGHT ZONE: NO TREE, NO HEDGE ===');
let openings = 0;
for (const l of plan.uturns.byRoad.values()) openings += l.length;
ok(openings > 0, `${openings} U-turn openings`);
let treesIn = 0; let treesAll = 0;
for (let i = 0; i < rp.trees.length; i += 8) {
  if (rp.trees[i + 7] !== 1) continue; // median tree
  treesAll++;
  const rid = roadAt(rp.trees[i], rp.trees[i + 2]);
  if (rid >= 0 && uturnZoneHas(plan.uturns, rid, sOf(rid, rp.trees[i], rp.trees[i + 2]), sightZoneLen(roads.roads[rid]) - 3)) treesIn++; // 3 m slack: s is read from the nearest vertex
}
ok(treesAll > 0 && treesIn === 0, `${treesAll} median trees, ${treesIn} inside a sight zone`);
let hedgesIn = 0; let hedgesAll = 0;
for (let i = 0; i < rp.hedges.length; i += 7) {
  const rid = roadAt(rp.hedges[i], rp.hedges[i + 2]);
  if (rid < 0) continue;
  hedgesAll++;
  if (uturnZoneHas(plan.uturns, rid, sOf(rid, rp.hedges[i], rp.hedges[i + 2]), sightZoneLen(roads.roads[rid]) - 3)) hedgesIn++;
}
ok(hedgesAll > 0 && hedgesIn === 0, `${hedgesAll} median hedge pieces, ${hedgesIn} inside a sight zone`);

console.log('\n=== COUNTRY MEDIAN ===');
let countryHedges = 0; let countryTrees = 0; let onBridge = 0;
const isCity = (x: number, z: number): boolean => roads.isCityPoint(x, z);
for (let i = 0; i < rp.hedges.length; i += 7) {
  const rid = roadAt(rp.hedges[i], rp.hedges[i + 2]);
  if (rid < 0) continue;
  if (!isCity(rp.hedges[i], rp.hedges[i + 2])) {
    countryHedges++;
    const r = roads.roads[rid]; let bi = 0; let bd = 1e18;
    for (let j = 0; j < r.xs.length; j++) { const d = Math.hypot(rp.hedges[i] - r.xs[j], rp.hedges[i + 2] - r.zs[j]); if (d < bd) { bd = d; bi = j; } }
    if (r.bridgeOf[bi] >= 0) onBridge++;
  }
}
for (let i = 0; i < rp.trees.length; i += 8) {
  if (rp.trees[i + 7] !== 1) continue;
  const rid = roadAt(rp.trees[i], rp.trees[i + 2]);
  if (rid >= 0 && !isCity(rp.trees[i], rp.trees[i + 2])) {
    countryTrees++;
    const r = roads.roads[rid]; let bi = 0; let bd = 1e18;
    for (let j = 0; j < r.xs.length; j++) { const d = Math.hypot(rp.trees[i] - r.xs[j], rp.trees[i + 2] - r.zs[j]); if (d < bd) { bd = d; bi = j; } }
    if (r.bridgeOf[bi] >= 0) onBridge++;
  }
}
ok(!P.countryMedian.enabled || (countryHedges > 0 && countryTrees > 0), `${countryHedges} hedge pieces and ${countryTrees} trees on the median outside the cities`);
ok(onBridge === 0, `${onBridge} country median plants on a bridge deck`);

console.log('\n=== MEDIAN LAMPS ===');
const lamps = planMedianLamps(roads);
ok(lamps.length > 0, `${lamps.length} double-arm median lamps`);
const runOf = (rid: number, s: number) => plan.runs.find((u) => u.roadId === rid && s >= u.p[7] && s <= u.p[(u.n - 1) * MS + 7]);
let notInRun = 0; let tooClose = 0; let inCrossing = 0; let inGap = 0; let wrongY = 0;
for (const l of lamps) {
  const u = runOf(l.roadId, l.s);
  if (!u) { notInRun++; continue; }
  const dEnd = Math.min(l.s - u.p[7], u.p[(u.n - 1) * MS + 7] - l.s);
  if (dEnd < Math.min(P.medianLamps.clearEnds, (u.p[(u.n - 1) * MS + 7] - u.p[7]) / 2) - 1e-6) tooClose++;
  if (crossingZoneHas(plan, l.roadId, l.s, 3)) inCrossing++;
  if (uturnZoneHas(plan.uturns, l.roadId, l.s, 3)) inGap++;
  const r = roads.roads[l.roadId];
  if (Math.abs(l.y - (l.roadY + medianSoilTop(r))) > 1e-6) wrongY++;
}
ok(notInRun === 0, `${notInRun} lamps outside a median run`);
ok(tooClose === 0, `${tooClose} lamps nearer than ${P.medianLamps.clearEnds} m to a nose / junction / gap`);
ok(inCrossing === 0 && inGap === 0, `${inCrossing} lamps in a pedestrian crossing, ${inGap} in a U-turn gap`);
ok(wrongY === 0, `${wrongY} lamps not standing on the median soil`);
// spacing inside one run
let maxSpace = 0; let minSpace = 1e9;
for (let i = 1; i < lamps.length; i++) if (lamps[i].roadId === lamps[i - 1].roadId && runOf(lamps[i].roadId, lamps[i].s) === runOf(lamps[i - 1].roadId, lamps[i - 1].s)) { const d = lamps[i].s - lamps[i - 1].s; maxSpace = Math.max(maxSpace, d); minSpace = Math.min(minSpace, d); }
ok(maxSpace <= Math.max(...Object.values(P.medianLamps.step)) * 1.5, `largest lamp spacing ${maxSpace.toFixed(1)} m, smallest ${minSpace.toFixed(1)} m`);
ok(minSpace >= 12, `no two lamps closer than 12 m (${minSpace.toFixed(1)} m)`);
// the arm (2.4 m x scale) reaches over the inner lane, not past the lane
for (const kind of ['highway', 'arterial', 'avenue'] as const) {
  const r = dividedRoads.find((q) => dividedKind(q) === kind);
  if (!r) continue;
  const reach = 2.4 * P.medianLamps.scale[kind];
  ok(reach > r.medianHalf + 0.5 && reach < r.medianHalf + 0.5 + 3.5 * 2, `${kind}: lamp arm reaches ${reach.toFixed(2)} m, over the lanes (median half ${r.medianHalf.toFixed(2)} m)`);
}
// median trees keep away from the poles
let treeNearLamp = 0;
for (let i = 0; i < rp.trees.length; i += 8) {
  if (rp.trees[i + 7] !== 1) continue;
  for (const l of lamps) if (Math.hypot(rp.trees[i] - l.x, rp.trees[i + 2] - l.z) < P.medianLamps.treeClear - 1.5) { treeNearLamp++; break; }
}
ok(treeNearLamp === 0, `${treeNearLamp} median trees closer than ${P.medianLamps.treeClear - 1.5} m to a lamp pole`);
// the street light layer carries them: two spots per lamp with opposite arms and a road height for the light pool
const spots = planStreetLights(roads);
const med = spots.filter((s) => s.roadY !== undefined);
ok(med.length === lamps.length * 2, `${med.length} median lamp spots (two arms per pole)`);
let armsOk = 0;
for (let i = 0; i + 1 < med.length; i += 2) if (Math.abs(med[i].ix + med[i + 1].ix) < 1e-9 && Math.abs(med[i].iz + med[i + 1].iz) < 1e-9 && med[i].x === med[i + 1].x) armsOk++;
ok(armsOk === med.length / 2, 'the two arms of every pole point to opposite carriageways');

console.log('\n=== TREE PITS (city footpath) ===');
ok(Config.city.roadside.treeSpacing[1] <= 45, `street tree spacing ${Config.city.roadside.treeSpacing[0]}..${Config.city.roadside.treeSpacing[1]} m, ${rp.stats.pits} pits`);

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
