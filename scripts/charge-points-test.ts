// Road-side stations + charge points (headless): npx tsx scripts/charge-points-test.ts
// STEP 4: src/parking/RoadStationSites.ts (made by scripts/gen-road-stations.ts): 11 fuel stations + 11 charge points along F1..F7, ~every 2 km, each of the 4 city roads has both.
// Every site: clear of the parking lots / main station / mall, dry, level (the terrain pad), spaced out; fuelAreaAt / chargeAreaAt find it (paid); the terrain pads leave the
// roads untouched; the structures build lazily (browser canvas stubbed).
import * as THREE from 'three';
import { MAIN_STATION_LOT, PARKING_LOTS, parkingContains, worldToLot } from '../src/parking/ParkingSite';
import { ROAD_STATION_SITES, type RoadStationSite } from '../src/parking/RoadStationSites';
import { chargeAreaAt, fuelAreaAt } from '../src/vehicles/FuelAreas';
import { MALL_BUILDING } from '../src/mall/MallSite';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const ctx: unknown = new Proxy(function () {}, { get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => ctx), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const { StationStructures } = await import('../src/parking/StationStructures');

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample();
function inMall(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = MALL_BUILDING.length - 1; i < MALL_BUILDING.length; j = i++) {
    const [xi, zi] = MALL_BUILDING[i], [xj, zj] = MALL_BUILDING[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const toWorld = (s: RoadStationSite, x: number, z: number): { x: number; z: number } => ({ x: s.x + x * Math.cos(s.yaw) + z * Math.sin(s.yaw), z: s.z - x * Math.sin(s.yaw) + z * Math.cos(s.yaw) });

const fuel = ROAD_STATION_SITES.filter((s) => s.kind === 'fuel'), cps = ROAD_STATION_SITES.filter((s) => s.kind === 'charge');
ok(fuel.length === 11 && cps.length === 11, `${fuel.length} fuel stations + ${cps.length} charge points along the main roads`);
ok(new Set(ROAD_STATION_SITES.map((s) => s.id)).size === ROAD_STATION_SITES.length, 'unique ids');
for (const r of ['F4', 'F5', 'F6', 'F7']) ok(fuel.some((s) => s.road === r) && cps.some((s) => s.road === r), `city road ${r}: has a fuel station and a charge point`);
ok(['F1', 'F2', 'F3'].every((r) => ROAD_STATION_SITES.some((s) => s.road === r)), 'ring roads F1..F3 have sites too');
ok(ROAD_STATION_SITES.every((s) => Math.hypot(s.x, s.z) > 1700), 'every site is outside the city (> 1.7 km from the centre)');
let nearest = 1e9;
for (const a of ROAD_STATION_SITES) for (const b of ROAD_STATION_SITES) if (a !== b) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.z - b.z));
ok(nearest > 60, `sites are spaced out (nearest pair ${nearest.toFixed(0)} m)`);

let worstRelief = 0;
for (const s of ROAD_STATION_SITES) {
  // the lot + the driveway, sampled with the terrain pads ON
  let wet = 0, mall = 0, lo = 1e9, hi = -1e9, lot = 0;
  for (let x = -s.hw; x <= s.hw; x += 1.5) for (let z = -s.hd; z <= s.hd + s.gap; z += 1.5) {
    const w = toWorld(s, x, z);
    g.sample(w.x, w.z, sc);
    const dh = sc.h - (s.y - 0.05 + s.slope * x); // height above the tilted pad plane
    lo = Math.min(lo, dh); hi = Math.max(hi, dh);
    if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) wet++;
    if (inMall(w.x, w.z)) mall++;
    const L = worldToLot(w.x, w.z);
    for (const l of [...PARKING_LOTS, MAIN_STATION_LOT]) if (L.s > l.s0 - 2 && L.s < l.s1 + 2 && L.n > l.n0 - 2 && L.n < l.n1 + 2) lot++;
  }
  worstRelief = Math.max(worstRelief, hi - lo);
  ok(wet === 0 && mall === 0 && lot === 0 && hi - lo < 0.35, `${s.id} (${s.road}): dry, clear of lots / mall, pad follows the road (deviation ${(hi - lo).toFixed(2)} m, grade ${(s.slope * 100).toFixed(1)} %)`);
  const w = toWorld(s, 0, 0);
  const f = fuelAreaAt(w.x, w.z), c = chargeAreaAt(w.x, w.z);
  if (s.kind === 'fuel') ok(f?.id === s.id && c?.id === s.id && !c.free, `${s.id}: fuelAreaAt + chargeAreaAt find it (paid)`);
  else ok(f === null && c?.id === s.id && !c.free, `${s.id}: chargeAreaAt finds it (paid), it is not a fuel station`);
  const road = toWorld(s, 0, s.hd + s.gap + 4);
  ok(fuelAreaAt(road.x, road.z) === null && chargeAreaAt(road.x, road.z) === null, `${s.id}: the road in front of it is not a station`);
  ok(parkingContains(w.x, w.z, 0), `${s.id}: trees / rocks / grass keep out (parkingContains)`);
}

// the terrain pads leave the roads alone: the host road's centre line is the same with the pads on and off, and far from every site nothing changed
let roadDiff = 0, farDiff = 0, probes = 0;
const sc2 = g.makeSample();
for (const s of ROAD_STATION_SITES) {
  for (let t = -60; t <= 60; t += 6) {
    // a point on the road's centre line near the site: straight in front of the lot, 8.5 m (the shoulder edge) from the lot's front edge minus the gap
    const w = toWorld(s, t, s.hd + s.gap + 3);
    g.stationPads.enabled = true; g.sample(w.x, w.z, sc);
    g.stationPads.enabled = false; g.sample(w.x, w.z, sc2);
    roadDiff = Math.max(roadDiff, Math.abs(sc.h - sc2.h));
    probes++;
  }
  const far = toWorld(s, 0, -s.hd - 40);
  g.stationPads.enabled = true; g.sample(far.x, far.z, sc);
  g.stationPads.enabled = false; g.sample(far.x, far.z, sc2);
  farDiff = Math.max(farDiff, Math.abs(sc.h - sc2.h));
}
g.stationPads.enabled = true;
ok(roadDiff < 0.15, `the road shoulder in front of every site is unchanged by the pads (${probes} probes, worst ${roadDiff.toFixed(3)} m)`);
ok(farDiff < 1e-6, `40 m behind every site the ground is untouched (${farDiff.toExponential(1)} m)`);

// structures: lazy
const root = new THREE.Group();
const st = new StationStructures({ root, terrain: g });
ok(st.stats.built === 0 && st.stats.sites === 22, 'nothing is built at the start (22 sites known)');
st.update(0, 0, 0);
ok(st.stats.built === 0, 'in the city centre no site is within build range');
const s1 = ROAD_STATION_SITES[0];
st.update(s1.x, s1.z + 50, 0);
ok(st.stats.built >= 1 && st.stats.built <= 2, `near ${s1.id}: it is built (one site per frame; ${st.stats.built} built)`);
st.update(0, 0, 0);
ok(st.stats.built === 0, 'far away again: the meshes are freed');
st.buildAll();
const sts = st.stats;
console.log(`  all ${sts.sites} built at once: ${sts.meshes} meshes, ${Math.round(sts.triangles)} triangles (never all at once in the game)`);
ok(sts.meshes > 150 && sts.meshes < 600, 'structures are light (under 600 meshes even with every site built)');
st.dispose();
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
