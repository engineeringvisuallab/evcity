// STEP 2A: AI energy model (headless): npx tsx scripts/ai-energy-test.ts
import { AI_ENERGY, aiNeed, canReach, drainAi, isBusBay, makeAiEnergy, rangeLeftM, refillAi, siteAccepts } from '../src/traffic/AIEnergy';
import { ENERGY } from '../src/vehicles/Energy';
import { ROAD_STATION_SITES } from '../src/parking/RoadStationSites';
import type { VehicleId } from '../src/vehicles/VehicleSpec';

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
// seeded generator (mulberry32) so the test is repeatable
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. vehicles without an ENERGY entry never run out
const rnd = seeded(7);
for (const id of ['truck', 'tractor', 'combine', 'pickup', 'suprim'] as VehicleId[]) ok(makeAiEnergy(id, rnd) === null, `${id}: no AI energy (never runs out)`);

// 2. spawn level + threshold ranges, for all energy vehicles
let lvMin = 9, lvMax = -9, thMin = 9, thMax = -9, thSum = 0, n = 0;
for (const id of Object.keys(ENERGY) as VehicleId[]) {
  for (let i = 0; i < 400; i++) {
    const e = makeAiEnergy(id, rnd)!;
    lvMin = Math.min(lvMin, e.level); lvMax = Math.max(lvMax, e.level);
    thMin = Math.min(thMin, e.threshold); thMax = Math.max(thMax, e.threshold);
    thSum += e.threshold; n++;
  }
}
ok(lvMin >= AI_ENERGY.spawnMin && lvMax <= AI_ENERGY.spawnMax, `spawn level in ${AI_ENERGY.spawnMin}..${AI_ENERGY.spawnMax} (got ${lvMin.toFixed(3)}..${lvMax.toFixed(3)})`);
ok(thMin >= AI_ENERGY.thresholdMin && thMax <= AI_ENERGY.thresholdMax, `threshold in 0.15..0.35 (got ${thMin.toFixed(3)}..${thMax.toFixed(3)})`);
ok(Math.abs(thSum / n - 0.25) < 0.01, `threshold average ~25 % (${((thSum / n) * 100).toFixed(1)} %)`);
ok(thMax - thMin > 0.15, 'drivers differ (threshold spread > 15 points)');

// 3. consumption: full battery lasts baseKm at 60 km/h undamaged, full throttle
const e0 = makeAiEnergy('sedan', seeded(1))!;
e0.level = 1;
for (let m = 0; m < 15000; m += 10) drainAi(e0, 10, 60, 1, 1);
ok(Math.abs(e0.level) < 0.01, `sedan: full tank = 15 km at 60 km/h (left ${(e0.level * 100).toFixed(2)} %)`);
const a = makeAiEnergy('sedan', seeded(1))!, b = makeAiEnergy('sedan', seeded(1))!, c = makeAiEnergy('sedan', seeded(1))!, d = makeAiEnergy('sedan', seeded(1))!;
a.level = b.level = c.level = d.level = 1;
drainAi(a, 3000, 60, 1, 1);
drainAi(b, 3000, 120, 1, 1);
drainAi(c, 3000, 60, 0.2, 1);
drainAi(d, 3000, 60, 1, 0);
ok(b.level < a.level, 'faster costs more');
ok(c.level < a.level, 'damaged costs more');
ok(d.level > a.level, 'coasting costs less');
const z = makeAiEnergy('bus', seeded(2))!;
z.level = 0.001;
drainAi(z, 5000, 60, 1, 1);
ok(z.level === 0, 'level never goes below 0');

// 4. needs
const t = makeAiEnergy('evhypar', seeded(3))!;
t.threshold = 0.25;
t.level = 0.6; ok(aiNeed(t) === 'none', '60 % -> none');
t.level = 0.2; ok(aiNeed(t) === 'normal', '20 % (threshold 25 %) -> normal');
t.level = 0.09; ok(aiNeed(t) === 'emergency', '9 % -> emergency');
t.level = 0; ok(aiNeed(t) === 'empty', '0 -> empty');
t.threshold = 0.15; t.level = 0.2; ok(aiNeed(t) === 'none', 'threshold 15 %: 20 % -> none');
refillAi(t); ok(t.level === 1 && aiNeed(t) === 'none', 'refill -> 100 %');

// 5. range + reach
const r = makeAiEnergy('bus', seeded(4))!;
r.level = 0.5;
ok(Math.abs(rangeLeftM(r, 1) - 10000) < 1, `bus 50 % = 10 km (${rangeLeftM(r, 1).toFixed(0)} m)`);
ok(rangeLeftM(r, 0) < rangeLeftM(r, 1), 'damaged vehicle: shorter range');
ok(canReach(r, 5000, 1), 'bus 50 %: 5 km site reachable');
ok(!canReach(r, 12000, 1), 'bus 50 %: 12 km site not reachable');
r.level = 0.05;
ok(!canReach(r, 1500, 1), 'bus 5 %: 1.5 km site not reachable with the 3 % reserve');

// 6. which sites suit which vehicle (real sites)
const fuelSites = ROAD_STATION_SITES.filter((s) => s.kind === 'fuel');
const cps = ROAD_STATION_SITES.filter((s) => s.kind === 'charge');
const busBays = cps.filter(isBusBay);
ok(busBays.length === 3 && busBays.every((s) => ['cp-03', 'cp-06', 'cp-09'].includes(s.id)), `3 bus bays: ${busBays.map((s) => s.id).join(', ')}`);
for (const id of Object.keys(ENERGY) as VehicleId[]) {
  const ids = ROAD_STATION_SITES.filter((s) => siteAccepts(id, s));
  ok(ids.length > 0, `${id} (${ENERGY[id]!.kind}): ${ids.length} sites suit it`);
  if (ENERGY[id]!.kind === 'fuel') ok(ids.every((s) => s.kind === 'fuel') && ids.length === fuelSites.length, `${id}: only the ${fuelSites.length} fuel stations`);
}
ok(ROAD_STATION_SITES.filter((s) => siteAccepts('bus', s)).every(isBusBay), 'bus: bus bays only');
ok(ROAD_STATION_SITES.filter((s) => siteAccepts('bus', s)).length === 3, 'bus: 3 sites');
ok(ROAD_STATION_SITES.filter((s) => siteAccepts('evhypar', s)).length === fuelSites.length + cps.length - busBays.length, 'evhypar: stations + normal charge points (no bus bay)');
ok(!siteAccepts('truck', fuelSites[0]), 'truck (no energy): no site');

console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
if (bad > 0) throw new Error('ai-energy-test failed');
