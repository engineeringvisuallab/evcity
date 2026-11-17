// AI station detour test (pure geometry + a small pure-pursuit simulation, no three.js). Run: npx tsx scripts/station-detour-test.ts
// Checks (1) the path is smooth and has exactly one stop, (2) a car that follows it like AIDriver does (pure pursuit, same look-ahead rules) never touches a solid
// part / a pump island of the station, (3) it really ends up on the lane again.
import { detourPlan, PUMP_Z, type DetourPlan } from '../src/traffic/StationDetour';
import { chargeLayout, fuelLayout, solidsOf, ISLAND_Z } from '../src/parking/StationLayout';
import { ROAD_STATION_SITES } from '../src/parking/RoadStationSites';

declare const process: { env: Record<string, string | undefined> };
let failed = 0;
const ok = (c: boolean, m: string): void => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed++;
};

interface Box { cx: number; cz: number; hx: number; hz: number }
/** The things a car must not touch: every solid part of the layout + the (low) pump island kerbs. */
function obstacles(kind: 'fuel' | 'charge', hw: number, hd: number): Box[] {
  const lay = kind === 'fuel' ? fuelLayout({ hw, hd }) : chargeLayout({ hw, hd });
  const out: Box[] = solidsOf(lay).map((s) => ({ cx: s.cx, cz: s.cz, hx: s.hx, hz: s.hz }));
  if (kind === 'fuel') for (const iz of ISLAND_Z) out.push({ cx: 0, cz: iz, hx: 4.6, hz: 0.7 });
  return out;
}

/** Oriented rectangle (car) against an axis aligned box: separating axis test. */
function hits(px: number, pz: number, th: number, hl: number, hwid: number, b: Box): boolean {
  const c = Math.cos(th), s = Math.sin(th); // forward = (c, s) in (x, z)
  const axes: [number, number][] = [[1, 0], [0, 1], [c, s], [-s, c]];
  for (const [ax, az] of axes) {
    const rc = Math.abs(c * ax + s * az) * hl + Math.abs(-s * ax + c * az) * hwid; // car radius on the axis
    const rb = Math.abs(ax) * b.hx + Math.abs(az) * b.hz;
    const d = Math.abs((b.cx - px) * ax + (b.cz - pz) * az);
    if (d > rc + rb) return false;
  }
  return true;
}

interface Pt { x: number; z: number; vmax: number; pump: boolean }
function withBendLimits(plan: DetourPlan): Pt[] {
  const p: Pt[] = plan.pts.map((q) => ({ x: q.x, z: q.z, vmax: q.v, pump: q.pump === true }));
  for (let n = 2; n < p.length; n++) {
    const a = p[n - 2], b = p[n - 1], c = p[n];
    const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
    const cr = Math.abs(abx * bcz - abz * bcx);
    const den = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(c.x - a.x, c.z - a.z);
    if (den > 1e-6) {
      const k = (2 * cr) / den;
      if (k > 1e-4) b.vmax = Math.min(b.vmax, Math.max(3.5, Math.sqrt(2.2 / k)));
    }
  }
  return p;
}

interface Car { name: string; L: number; hl: number; hw: number; maxSteer: number }
const CARS: Car[] = [
  { name: 'sedan', L: 2.7, hl: 2.3, hw: 1.0, maxSteer: 0.55 },
  { name: 'hypercar', L: 2.6, hl: 2.35, hw: 1.1, maxSteer: 0.5 },
  { name: 'jeep', L: 2.5, hl: 2.2, hw: 1.0, maxSteer: 0.6 },
];
const BUS: Car = { name: 'bus', L: 5.5, hl: 6.0, hw: 1.3, maxSteer: 0.45 };

/** Drive the plan like AIDriver does. Returns the smallest clearance problem found (hit = true) and where the car ended. */
function simulate(plan: DetourPlan, car: Car, obs: Box[], zl: number): { hit: boolean; reachedStop: boolean; endZ: number; endX: number; endHead: number; maxLat: number } {
  const pts = withBendLimits(plan);
  let x = pts[0].x, z = pts[0].z, th = 0, v = 9, steer = 0, head = 0;
  let hit = false, reachedStop = false, dwell = 0, done = false, maxLat = 0;
  const dt = 1 / 60;
  const d2 = (i: number): number => (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
  for (let step = 0; step < 60 * 240; step++) {
    while (head + 1 < pts.length && d2(head + 1) <= d2(head)) head++;
    // pure pursuit, the short look-ahead of AIDriver for turns (all detour points are flagged ut = 2)
    const ld = Math.min(7, Math.max(4, 3.4 + Math.abs(v) * 0.5));
    let idx = head, acc = Math.hypot(pts[idx].x - x, pts[idx].z - z);
    while (acc < ld && idx + 1 < pts.length) { acc += Math.hypot(pts[idx + 1].x - pts[idx].x, pts[idx + 1].z - pts[idx].z); idx++; }
    const tx = pts[idx].x - x, tz = pts[idx].z - z;
    const fx = Math.cos(th), fz = Math.sin(th);
    const along = tx * fx + tz * fz;
    const lat = tx * fz - tz * fx; // + = left of the car (the same formula as AIDriver; heading +x has its left at -z)
    const alpha = Math.atan2(lat, Math.max(0.01, along));
    const delta = Math.atan((2 * car.L * Math.sin(alpha)) / Math.max(3, Math.hypot(tx, tz)));
    const maxAngle = Math.max(0.05, car.maxSteer / (1 + (Math.abs(v) / 16) ** 2));
    const want = Math.max(-1, Math.min(1, delta / maxAngle));
    steer += (want - steer) * Math.min(1, 8 * dt);
    // target speed: like AIDriver (look 60 m ahead, braking 3.2 m/s2)
    let vt = Infinity, dist = Math.hypot(pts[head].x - x, pts[head].z - z);
    for (let j = head; j < pts.length && dist < 60; j++) {
      if (j > head) dist += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z);
      vt = Math.min(vt, Math.sqrt(pts[j].vmax * pts[j].vmax + 2 * 3.2 * dist));
      if (pts[j].pump) vt = Math.min(vt, Math.sqrt(2 * 3.2 * 0.7 * Math.max(0, dist - 0.8))); // stop 0.8 m before the pump point, like a bus at its stop
    }
    if (!Number.isFinite(vt)) vt = 0;
    if (pts[head].pump && !done) {
      const d = Math.hypot(pts[head].x - x, pts[head].z - z);
      if (d < 3.2 && Math.abs(v) < 0.9) {
        reachedStop = true;
        dwell += dt;
        if (dwell > 2) { done = true; pts[head].vmax = 7; pts[head].pump = false; }
      }
    }
    const err = vt - v;
    v += Math.max(-7 * dt, Math.min(2.5 * dt, err * 10 * dt)); // brakes are stronger than the 3.2 m/s2 the speed plan uses (as in the game)
    if (v < 0) v = 0;
    th -= (v / car.L) * Math.tan(steer * maxAngle) * dt; // the heading angle runs from +x towards +z; a left turn (towards -z) lowers it
    x += Math.cos(th) * v * dt;
    z += Math.sin(th) * v * dt;
    // the lateral distance to the path (nearest polyline point)
    let best = 1e9;
    for (let i = Math.max(0, head - 2); i < Math.min(pts.length, head + 6); i++) best = Math.min(best, Math.hypot(pts[i].x - x, pts[i].z - z));
    maxLat = Math.max(maxLat, best);
    for (const b of obs) if (hits(x, z, th, car.hl, car.hw, b)) { if (!hit && process.env.DBG) console.log('HIT at', x.toFixed(2), z.toFixed(2), 'box', JSON.stringify(b), 'v', v.toFixed(2), 'head', head); hit = true; }
    if (process.env.DBG && step % 30 === 0) console.log(step, x.toFixed(1), z.toFixed(1), th.toFixed(2), v.toFixed(1), head);
    if (head >= pts.length - 1 && Math.hypot(pts[head].x - x, pts[head].z - z) < 2) break;
  }
  void zl;
  return { hit, reachedStop, endZ: z, endX: x, endHead: th, maxLat };
}

// ---------- the real sites ----------
const ZLS = [18, 21.8, 25]; // a range of lane distances (lot centre -> kerb lane centre)
for (const site of ROAD_STATION_SITES) {
  const kind = site.kind;
  const obs = obstacles(kind, site.hw, site.hd);
  for (const zl of ZLS) {
    const lo = site.hd + 4; // the lane is always outside the lot + driveway
    if (zl < lo) continue;
    const plan = detourPlan(kind, site.hw, zl);
    const stops = plan.pts.filter((p) => p.pump).length;
    if (zl === ZLS[1]) ok(stops === 1, `${site.id}: exactly one stop point`);
    const cars = kind === 'charge' && site.hw >= 6 ? [BUS] : kind === 'charge' ? [CARS[0], CARS[1]] : CARS;
    for (const car of cars) {
      const r = simulate(plan, car, obs, zl);
      const lane = Math.abs(r.endZ - zl) < 1.2 && Math.cos(r.endHead) > 0.95;
      ok(!r.hit && r.reachedStop && lane, `${site.id} (${site.kind}) zl=${zl} ${car.name}: no collision, reaches the pump, back on the lane (hit ${r.hit}, stop ${r.reachedStop}, z ${r.endZ.toFixed(1)}, heading ${r.endHead.toFixed(2)}, off-path max ${r.maxLat.toFixed(2)} m)`);
    }
  }
}
// the pump stop position of the fuel station is beside the road-side face of the island and clear of its kerb
ok(PUMP_Z - 1.1 > 3.7, 'fuel: the stopped car is clear of the island kerb');
console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
if (failed > 0) throw new Error('station-detour-test failed');
