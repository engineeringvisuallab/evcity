// ROADS STEP 1: prints the road cross-section DESIGN TABLE (every number) and checks the engineering rules against Config.city.roadSections
// AND against the road network that is really built. Run: npx tsx scripts/road-section-check.ts
// PASS / FAIL count as checks. NOTE lines are facts you should know (they never fail the run).
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DIVIDED_SECTIONS, laneCentre, laneWidth, sectionFor } from '../src/roads/RoadSection';
import { SPECS, wheelDefs } from '../src/vehicles/VehicleSpec';

let failed = 0;
const ok = (c: boolean, m: string): void => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
};
const note = (m: string): void => console.log(`NOTE ${m}`);
const f = (v: number, d = 2): string => v.toFixed(d);

const C = Config.city.roadSections;

// ---------- 1. the design table ----------
console.log('\n=== DESIGN TABLE (metres, from the road centreline; lane 0 = kerb lane) ===');
const rows = DIVIDED_SECTIONS.map((d) => {
  const c = C[d.id];
  const foot = c.kerbW + c.verge + c.walk;
  return {
    section: d.id,
    lanes: `${d.lanesPerDir}+${d.lanesPerDir}`,
    laneW: d.laneW,
    median: `${f(d.medianKerb)}+${f(d.medianClear)}+${f(d.medianKerb)}=${f(2 * d.medianHalf)}`,
    shyMed: d.shyMedian,
    shyOut: d.shyOuter,
    carriageway: f(d.halfWidth - d.medianHalf),
    halfWidth: f(d.halfWidth),
    kerbToKerb: f(2 * d.halfWidth),
    innerLane: f(laneCentre({ halfWidth: d.halfWidth, lanes: d.lanesPerDir * 2, medianHalf: d.medianHalf, laneW: d.laneW, shyOuter: d.shyOuter }, d.lanesPerDir - 1)),
    kerbLane: f(laneCentre({ halfWidth: d.halfWidth, lanes: d.lanesPerDir * 2, medianHalf: d.medianHalf, laneW: d.laneW, shyOuter: d.shyOuter }, 0)),
    footpath: f(foot),
    footEdge: f(d.halfWidth + foot),
    kmh: d.designKmh,
  };
});
console.table(rows);
const und = (['collector', 'local'] as const).map((k) => ({ section: k + ' (undivided)', laneTarget: C[k].laneW, kerbH: C[k].kerbH, verge: C[k].verge, walk: C[k].walk, footpath: f(C[k].kerbW + C[k].verge + C[k].walk) }));
console.table(und);

// ---------- 2. the engineering rules on the config numbers ----------
console.log('=== RULES ON THE CONFIG ===');
for (const d of DIVIDED_SECTIONS) {
  const c = C[d.id];
  const main = d.id !== 'avenue';
  ok(main ? d.laneW >= 3.5 : d.laneW >= 3.25 && d.designKmh <= 50, `${d.id}: lane ${d.laneW} m (main roads 3.5 m; a town street at <= 50 km/h may use 3.25 m)`);
  ok(d.medianClear >= 1.5 && d.medianClear <= 2.0, `${d.id}: median clear planting width ${d.medianClear} m is within 1.5 to 2.0 m`);
  ok(c.medianKerb >= 0.15 && c.medianKerb <= 0.2, `${d.id}: median kerb width ${c.medianKerb} m is within 0.15 to 0.20 m`);
  ok(c.kerbH === 0.15, `${d.id}: kerb height ${c.kerbH} m = 150 mm`);
  ok(d.medianClear / 2 >= 0.6, `${d.id}: a median tree trunk on the centreline is ${f(d.medianClear / 2)} m from each kerb (needs >= 0.6 m)`);
  ok(c.walk >= 2.0, `${d.id}: clear walking width ${c.walk} m >= 2.0 m (1.8 m is the absolute minimum)`);
  ok(c.verge >= 1.2 && c.verge <= 1.5, `${d.id}: furniture / planting verge ${c.verge} m is within 1.2 to 1.5 m`);
  ok(Math.abs(c.fall - 0.02) < 1e-9, `${d.id}: cross-fall ${c.fall * 100} % (2 % to the gutter)`);
}
for (const k of ['collector', 'local'] as const) {
  ok(C[k].walk >= 2.0 && C[k].verge >= 1.2 && C[k].verge <= 1.5, `${k}: footpath walk ${C[k].walk} m, verge ${C[k].verge} m`);
}
const ramp = 0.15 * 12;
ok(ramp >= 1.79 && ramp <= 1.81, `dropped kerb: 150 mm at 1:12 needs a ramp ${f(ramp)} m long, at least 1.2 m wide (built in Step 3)`);
const footTotal = C.highway.kerbW + C.highway.verge + C.highway.walk;
if (Math.abs(Config.city.roadside.sidewalk - footTotal) > 0.01) {
  note(`the footpath drawn today is Config.city.roadside.sidewalk = ${Config.city.roadside.sidewalk} m; the target is ${f(footTotal)} m (kerb + verge + walk). It changes in Step 3.`);
}

// ---------- 3. vehicles: turning circle against the carriageway ----------
console.log('\n=== VEHICLE TURNING (one-sweep U-turn needs the wall-to-wall diameter) ===');
const veh: Record<string, unknown>[] = [];
const wallToWall: Record<string, number> = {};
for (const id of ['rickshaw', 'auto', 'sedan', 'pickup', 'tanker', 'bus', 'truck'] as const) {
  const s = SPECS[id];
  const w = wheelDefs(s);
  const front = w.filter((q) => q.steer);
  const rear = w.filter((q) => !q.steer);
  const zf = front.reduce((a, q) => a + q.z, 0) / front.length;
  const zr = rear.reduce((a, q) => a + q.z, 0) / rear.length;
  const L = zf - zr;
  const R = L / Math.tan(s.maxSteer);
  const ahead = s.half.z - zr;
  const Ro = Math.hypot(R + s.half.x, ahead);
  wallToWall[id] = 2 * Ro;
  veh.push({ vehicle: id, wheelbase: f(L), maxSteer: s.maxSteer, R_rearAxle: f(R), R_outerBody: f(Ro), wallToWall: f(2 * Ro), colliderH: f(s.half.y * 2) });
}
console.table(veh);
for (const d of DIVIDED_SECTIONS) {
  const kk = 2 * d.halfWidth;
  const can = Object.entries(wallToWall).filter(([, v]) => v <= kk).map(([k]) => k);
  const cannot = Object.entries(wallToWall).filter(([, v]) => v > kk).map(([k]) => k);
  note(`${d.id}: kerb to kerb ${f(kk)} m. One-sweep U-turn possible: ${can.join(', ')}. NOT possible: ${cannot.join(', ') || 'none'}.`);
}

// ---------- 4. the network that is really built ----------
console.log('\n=== BUILT NETWORK ===');
const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const byKind = new Map<string, { n: number; len: number; city: number }>();
let badHalf = 0, badLanes = 0, badMedian = 0, badLane = 0, badPlan = 0, badCentre = 0;
for (const r of R.roads) {
  const sec = sectionFor(r.kind, r.tier, r.tier === 4 ? (r.lanes >= 4 ? 4 : 2) : r.lanes, r.earth); // a street with 4+ lanes now is a divided avenue
  const key = sec ? sec.id : r.earth ? 'earth track' : r.kind + (r.tier === 4 ? ' (street)' : '');
  const e = byKind.get(key) ?? { n: 0, len: 0, city: 0 };
  e.n++;
  e.len += r.length;
  for (let i = 1; i < r.xs.length; i++) if (R.isCityPoint(r.xs[i], r.zs[i])) e.city += r.cum[i] - r.cum[i - 1];
  byKind.set(key, e);
  if (sec) {
    if (Math.abs(r.halfWidth - sec.halfWidth) > 1e-6) badHalf++;
    if (r.lanes !== sec.lanesPerDir * 2) badLanes++;
    if (Math.abs(r.medianHalf - sec.medianHalf) > 1e-6) badMedian++;
    if (Math.abs(laneWidth(r) - sec.laneW) > 1e-6) badLane++;
    // the kerb lane (and every other lane) must lie inside the asphalt, clear of the median kerb
    for (let k = 0; k < sec.lanesPerDir; k++) {
      const c = laneCentre(r, k);
      if (c - sec.laneW / 2 < r.medianHalf + sec.shyMedian - 1e-6 || c + sec.laneW / 2 > r.halfWidth - sec.shyOuter + 1e-6) badCentre++;
    }
  } else if (r.medianHalf !== 0) badMedian++;
  if (r.planHalfWidth > r.halfWidth + 1e-6) badPlan++;
}
console.table([...byKind.entries()].map(([k, v]) => ({ section: k, roads: v.n, km: f(v.len / 1000, 1), kmInsideCity: f(v.city / 1000, 1) })));
ok(badHalf === 0, `every divided road has halfWidth = median half + shy + lanes x lane width + shy (${badHalf} wrong)`);
ok(badLanes === 0, `every divided road has 2 x lanesPerDir lanes (${badLanes} wrong)`);
ok(badMedian === 0, `every divided road has the median of its section, and no other road has one (${badMedian} wrong)`);
ok(badLane === 0, `lane width of every divided road = section lane width (${badLane} wrong)`);
ok(badCentre === 0, `every lane of every divided road lies between the median-side shy and the kerb-side shy (${badCentre} wrong)`);
ok(badPlan === 0, `planHalfWidth (the width the street plan used) is never larger than the real half width (${badPlan} wrong)`);
const h = R.roads.find((r) => r.kind === 'highway')!;
ok(Math.abs(laneCentre(h, 0) - (h.halfWidth - 0.5 - 1.75)) < 1e-9, `highway kerb lane centre = ${f(laneCentre(h, 0))} m (halfWidth ${f(h.halfWidth)} - shy 0.5 - half lane 1.75)`);
const col = R.roads.find((r) => r.kind === 'collector' && !r.earth)!;
ok(Math.abs(laneCentre(col, 0) - col.halfWidth * (1 - 1 / Math.max(2, col.lanes))) < 1e-9, 'collector (undivided) keeps the old lane formula halfWidth x (1 - 1/lanes)');
note('collector and local streets keep their old half width on purpose (terrain, pads, street plan and buildings were made for it).');

console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
