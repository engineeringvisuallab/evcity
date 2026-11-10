// AI station visit test: StationStops (site <-> road matching, reservation) + RouteBuilder (detour building, lane drift) on a fake straight highway. No three.js.
import { StationStops } from '../src/traffic/StationStops';
import { RouteBuilder } from '../src/traffic/Route';
import type { RoadGraph, RoadPoint } from '../src/traffic/RoadGraph';
import type { RoadStationSite } from '../src/parking/RoadStationSites';

let failed = 0;
const ok = (c: boolean, m: string): void => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed++;
};

// a straight highway along +x, centreline z = 0, kerb lane centre 12 m to the LEFT of the travel direction (dir +1: z = -12)
const fake = {
  roads: [{ kind: 'highway', earth: false, length: 4000, speedKmh: 130 }],
  at(_r: number, s: number, dir: 1 | -1, lat: number, out: RoadPoint): RoadPoint {
    out.x = s; out.z = -dir * lat; out.y = 0; out.hx = dir; out.hz = 0;
    return out;
  },
  laneOffset: (_r: number, lane = 0) => 12 - 3.5 * lane,
  stations: () => [],
  uturns: () => [],
  nearestSpot(x: number, z: number, max = Infinity) {
    const s = Math.max(0, Math.min(4000, Math.round(x / 30) * 30));
    const d = Math.hypot(x - s, z);
    return d <= max ? { roadId: 0, s, distance: d } : null;
  },
  passInfo: () => ({ shift: 0, oncoming: false }),
  passLanes: () => 0,
  isBigHighway: () => true,
  onBridge: () => false,
  limit: () => 130 / 3.6,
};
const g = fake as unknown as RoadGraph;

// the site: 34 m to the left of the centreline (z = -34), road towards local +z = world +z (yaw 0), traffic along +x serves it
const site: RoadStationSite = { id: 't-fuel', kind: 'fuel', nameBn: 't', x: 1000, z: -34, y: 0, slope: 0, yaw: 0, hw: 16, hd: 13, gap: 4.5, road: 'F1' };
const stops = new StationStops(fake, [site, { ...site, id: 't-cp', kind: 'charge', x: 2500, hw: 4, hd: 2 }, { ...site, id: 't-bus', kind: 'charge', x: 3000, hw: 6, hd: 1.75 }]);
ok(stops.entries.length === 3, 'three sites matched with the road');
const e = stops.entries[0];
ok(e.dir === 1 && Math.abs(e.zl - 22) < 0.01 && Math.abs(e.s0 - 1000) <= 1, `fuel site: direction +1, lane 22 m from the lot centre, beside s = ${e.s0}`);
ok(Math.abs(e.sEntry - 974) < 1.5 && e.sExit > e.sEntry + 40, `entry at ${e.sEntry.toFixed(0)}, exit at ${e.sExit.toFixed(0)}`);
ok(stops.find(0, 1, 500, 'fuel', false, 100, 1500) === e, 'a fuel car finds it');
ok(stops.find(0, -1, 3500, 'fuel', false, 100, 1500) === null, 'the other direction never finds it');
ok(stops.find(0, 1, 500, 'fuel', false, 100, 300) === null, 'not within reach: nothing');
ok(stops.find(0, 1, 900, 'fuel', false, 100, 1500) === null, 'too late (entry less than 100 m ahead): nothing');
ok(stops.find(0, 1, 500, 'charge', false, 100, 2100)?.site.id === 't-cp', 'an electric car finds the charge point, not the fuel station');
ok(stops.find(0, 1, 500, 'charge', true, 100, 2900)?.site.id === 't-bus', 'a bus needs the long bay');
const who = {};
stops.reserve(e, who);
ok(stops.find(0, 1, 500, 'fuel', false, 100, 1500) === null, 'reserved: the next car drives on');
stops.release(who);
ok(stops.find(0, 1, 500, 'fuel', false, 100, 1500) === e, 'released: free again');
stops.reserve(e, who);
stops.update(250);
ok(stops.find(0, 1, 500, 'fuel', false, 100, 1500) === e, 'a reservation nobody gives back expires');

// ---- the route builds the detour ----
const rnd = (): number => 0.5;
const route = new RouteBuilder(g, rnd, 0, 500, 1, 0.9);
route.lane = 2; // quick driver in the fast lane
route.start();
const v = stops.visit(e, 0.2, 9);
ok(v.need >= 3 && v.need <= 9 && Math.abs(v.rate * v.need - 0.8) < 1e-6, `visit: stands ${v.need.toFixed(1)} s, fills 0.8`);
route.beginVisit(v);
route.fill(0, 700); // 700 m of route: from s = 500 past the exit of the station (s ~ 1026)
const pts = route.pts;
const pumps = pts.filter((p) => p.pump === v);
ok(pumps.length === 1 && pumps[0].vmax === 0, 'exactly one pump point, speed 0');
ok(Math.abs(pumps[0].x - 1002) < 0.01 && Math.abs(pumps[0].z + 28) < 0.01, `the pump point is beside the island (world ${pumps[0].x.toFixed(1)}, ${pumps[0].z.toFixed(1)})`);
ok(pts.filter((p) => p.ut === 2).length === e.plan.pts.length && pts.filter((p) => p.ut === 2).every((p) => p.jn && p.pl === 0), 'detour points: short look-ahead, no overtaking');
let maxGap = 0;
for (let i = 1; i < pts.length; i++) maxGap = Math.max(maxGap, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
ok(maxGap < 7, `no gap in the route (largest ${maxGap.toFixed(1)} m)`);
const last = pts[pts.length - 1];
ok(route.visit === null && last.x > e.sExit + 100 && Math.abs(last.z + 12) < 0.01, `after the exit the route goes on in the kerb lane (x ${last.x.toFixed(0)}, z ${last.z.toFixed(1)})`);
// lane drift: fast lane (z -5) -> kerb lane (z -12) in steps of at most 0.45 m, finished before the entry
let maxDz = 0;
for (let i = 1; i < pts.length && pts[i].x < e.sEntry - 2; i++) maxDz = Math.max(maxDz, Math.abs(pts[i].z - pts[i - 1].z));
const atEntry = pts.filter((p) => p.x > e.sEntry - 12 && p.x < e.sEntry - 2);
ok(maxDz <= 0.451 && atEntry.every((p) => Math.abs(p.z + 12) < 0.01), `lane change is gradual (max ${maxDz.toFixed(2)} m per point) and done before the entry`);
// a route that leaves the road before the entry cancels the visit
const r2 = new RouteBuilder(g, rnd, 0, 500, 1, 0.9);
r2.start();
const v2 = stops.visit(e, 0.2, 9);
r2.beginVisit(v2);
r2.dir = -1; // (as if a junction turned it round)
r2.fill(0, 100);
ok(v2.cancelled && r2.visit === null && r2.pts.every((p) => p.ut !== 2), 'a route on another road / direction cancels the visit');
if (failed > 0) throw new Error('station-visit-test failed');
console.log('\nALL OK');
