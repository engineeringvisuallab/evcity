// STEP RAIL-B2 (headless, MEASURE ONLY): road / rail buffer at every crossing and beside every rail pier. Run: npx tsx scripts/road-rail-buffer-check.ts
// Limits: Config.roads.roadRailBuffer (one place). Nothing is changed in the road or the railway; FAIL lines are the list of places STEP 3..6 must fix.
//   rail over road : rail deck underside - road surface >= railOverRoad;   road over rail : road surface - rail top >= roadOverRail;
//   rail pier      : plan distance to the edge of any road deck (halfWidth + shoulder + 0.3) >= pierToDeckEdge (only road BRIDGES count, a pier beside a road on the ground is info).
// Arm piers: the 6.1d arm structures are plain decks without piers in the game (types not OK'd), so armPierToRailPier is NOT checked yet.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const B = Config.roads.roadRailBuffer;
const f1 = (v: number): string => v.toFixed(1);
Config.roads.junctionJ1Arms.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail, net = gen.roads;
let fails = 0;
console.log(`buffer: rail over road >= ${B.railOverRoad} m, road over rail >= ${B.roadOverRail} m, pier to deck edge >= ${B.pierToDeckEdge} m, arm pier to rail pier >= ${B.armPierToRailPier} m`);

console.log('\n1. crossings (' + rail.crossings.length + ')');
for (const c of rail.crossings) {
  const road = net.roads[c.roadId], e = rail.edges.find((q) => q.id === c.edgeId)!;
  if (c.kind === 'rail-tunnel') { console.log(`  skip   ${road.name} x ${c.edgeId} (${f1(c.x)}, ${f1(c.z)}): rail tunnel`); continue; }
  let i = 0;
  while (i < e.cum.length - 2 && e.cum[i + 1] < c.s) i++;
  const t = (c.s - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1);
  const railY = e.design[i] + (e.design[i + 1] - e.design[i]) * t;
  let k = 0, bd = Infinity;
  for (let q = 0; q < road.xs.length; q++) { const d = Math.hypot(road.xs[q] - c.x, road.zs[q] - c.z); if (d < bd) { bd = d; k = q; } }
  const roadY = road.ys[k];
  const over = c.kind === 'rail-over-road';
  const gap = over ? railY - D.ballast - D.deckThick - roadY : roadY - railY;
  const need = over ? B.railOverRoad : B.roadOverRail;
  const good = gap >= need - 1e-6;
  if (!good) fails++;
  console.log(`  ${good ? 'PASS' : 'FAIL'}   ${road.name} x ${c.edgeId} (${f1(c.x)}, ${f1(c.z)}) ${over ? 'rail over road' : 'road over rail'}: gap ${f1(gap)} m, need ${need} m${good ? '' : ', short by ' + f1(need - gap) + ' m'}`);
}

console.log('\n2. rail piers beside road BRIDGE decks (plan distance from the pier centre to the deck edge, nearest point of the road line)');
// A pier INSIDE the deck footprint (distance < 0) stands under the road bridge: allowed by the pier rule of RailContext (rail well under the deck), its height is checked in part 1.
// A pier BESIDE the deck (0 <= distance < pierToDeckEdge) is a FAIL.
let nUnder = 0, nBeside = 0, nFar = 0, closest = Infinity, closestTxt = '';
for (const p of rail.piers) {
  let best = Infinity, bestRoad = '';
  for (const r of net.roads) {
    for (let q = 0; q + 1 < r.xs.length; q++) {
      if (r.bridgeOf[q] < 0 && r.bridgeOf[q + 1] < 0) continue;
      if (Math.abs(r.xs[q] - p.x) > 80 || Math.abs(r.zs[q] - p.z) > 80) continue;
      const abx = r.xs[q + 1] - r.xs[q], abz = r.zs[q + 1] - r.zs[q], l2 = abx * abx + abz * abz || 1;
      const u = Math.max(0, Math.min(1, ((p.x - r.xs[q]) * abx + (p.z - r.zs[q]) * abz) / l2));
      const d = Math.hypot(p.x - r.xs[q] - abx * u, p.z - r.zs[q] - abz * u) - (r.halfWidth + r.shoulder + 0.3);
      if (d < best) { best = d; bestRoad = r.name; }
    }
  }
  if (best === Infinity) { nFar++; continue; }
  if (best < 0) { nUnder++; continue; }
  if (best < closest) { closest = best; closestTxt = `${bestRoad} / rail ${p.edgeId} pier (${f1(p.x)}, ${f1(p.z)})`; }
  if (best < B.pierToDeckEdge - 1e-6) { nBeside++; fails++; console.log(`  FAIL   ${bestRoad} / rail ${p.edgeId} pier (${f1(p.x)}, ${f1(p.z)}): ${f1(best)} m beside the deck edge, need ${B.pierToDeckEdge} m`); }
}
console.log(`  ${nBeside === 0 ? 'PASS' : 'FAIL'}   ${rail.piers.length} rail piers: ${nBeside} beside a road bridge deck closer than ${B.pierToDeckEdge} m, ${nUnder} under a road deck (info, see part 1 for the height), ${nFar} no road bridge within 80 m; closest beside the deck ${closest === Infinity ? 'none' : f1(closest) + ' m (' + closestTxt + ')'}`);

console.log('\n3. arm pier to rail pier: NOT CHECKED (arm structures have no piers yet, 6.1d types not OK\'d)');
console.log(`\n${fails} FAIL line(s): baseline of the game as it is now, nothing was changed.`);
