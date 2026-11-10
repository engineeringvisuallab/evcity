// ROADS STEP 4: headless checks of the U-turn openings (no three.js, no Rapier). Run: npx tsx scripts/uturn-test.ts
//   1. the plan (spacing, distance to pads, bridges, median pieces beside the gap, no tree / hedge in a gap)
//   2. which vehicles may turn round (bus and truck never)
//   3. the AI route (half circle, ends in the kerb lane of the other carriageway, going the other way)
//   4. the gap rule of the waiting driver
//   5. a kinematic drive (the same pure pursuit as AIDriver) of every allowed vehicle through every opening: never touches the median, stays inside the kerbs
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { MS, medianHalfAt, noseScale, planMedians } from '../src/roads/MedianPlan';
import { DIVIDED_SECTIONS, laneCentre } from '../src/roads/RoadSection';
import { canUTurn, frameAt, turnOuterRadius, uturnZoneHas } from '../src/roads/UTurns';
import { planCityTrees } from '../src/roads/Roadside';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder, type RoutePt } from '../src/traffic/Route';
import { uturnBlocked } from '../src/traffic/UTurnGap';
import { SPECS } from '../src/vehicles/VehicleSpec';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const note = (m: string): void => console.log(`NOTE ${m}`);
const U = Config.city.uturn;
const M = Config.city.median;

const gen = new TerrainGenerator();
const roads = gen.roads;
const plan = planMedians(roads);
const up = plan.uturns;
const byId = new Map(roads.roads.map((r) => [r.id, r]));

console.log('\n=== PLAN ===');
ok(up.openings.length > 50, `${up.openings.length} U-turn openings, ${up.metres} m of gap`);
const per: Record<string, number> = {};
for (const o of up.openings) per[o.section] = (per[o.section] ?? 0) + 1;
note(`per section: ${JSON.stringify(per)}`);
ok(up.openings.every((o) => o.len >= 12 && o.len <= 25 + 2 * M.step), `every gap is 12 .. ${25 + 2 * M.step} m long (shortest ${Math.min(...up.openings.map((o) => o.len))}, longest ${Math.max(...up.openings.map((o) => o.len))})`);
ok(up.openings.every((o) => Math.abs(o.radius - laneCentre(byId.get(o.roadId)!, 0)) < 1e-9), 'the half-circle radius is the kerb-lane centre of the road');

// spacing along each road
let minGap = Infinity; let inWish = 0; let gaps = 0; let maxGap = 0;
for (const [, l] of up.byRoad) for (let i = 1; i < l.length; i++) {
  const g = l[i].s - l[i - 1].s; gaps++; minGap = Math.min(minGap, g); maxGap = Math.max(maxGap, g);
  if (g >= U.gapMin - 1 && g <= U.gapMax + 150) inWish++;
}
ok(minGap >= U.hardMin - 1e-6, `two openings of one road are at least ${minGap.toFixed(0)} m apart (limit ${U.hardMin} m)`);
note(`${inWish} of ${gaps} spacings are within ${U.gapMin}..${U.gapMax + 150} m (largest ${maxGap.toFixed(0)} m)`);

// pads
let nearest = Infinity; let preferred = 0;
for (const o of up.openings) {
  let d = Infinity;
  for (const p of roads.pads) d = Math.min(d, Math.hypot(o.x - p.x, o.z - p.z) - p.rCore);
  nearest = Math.min(nearest, d);
  if (d <= U.padMax) preferred++;
}
ok(nearest >= U.padMin - 1e-6, `nearest junction pad core to any gap centre: ${nearest.toFixed(1)} m (limit ${U.padMin} m)`);
note(`${preferred} of ${up.openings.length} openings are ${U.padMin}..${U.padMax} m from a junction pad (the preferred place)`);

// bridges
let onBridge = 0;
for (const o of up.openings) { const r = byId.get(o.roadId)!; for (let i = 0; i < r.xs.length - 1; i++) if (r.bridgeOf[i] >= 0 && r.cum[i + 1] > o.a - U.bridgeClear && r.cum[i] < o.b + U.bridgeClear) { onBridge++; break; } }
ok(onBridge === 0, `${onBridge} openings on or within ${U.bridgeClear} m of a bridge`);

// the median is cut at every gap: no run overlaps a gap, and a run ends in the nose exactly at each end of it
let overlap = 0; let noNose = 0; let shortPiece = 0;
for (const o of up.openings) {
  let left = false; let right = false;
  for (const u of plan.runs) {
    if (u.roadId !== o.roadId) continue;
    const sa = u.p[7]; const sb = u.p[(u.n - 1) * MS + 7];
    if (sa < o.b - 1e-6 && sb > o.a + 1e-6) overlap++;
    if (Math.abs(sb - o.a) < 1e-6) { left = true; if (sb - sa < M.minRun - 1e-6) shortPiece++; }
    if (Math.abs(sa - o.b) < 1e-6) { right = true; if (sb - sa < M.minRun - 1e-6) shortPiece++; }
  }
  if (!left || !right) noNose++;
}
ok(overlap === 0, `${overlap} median runs reach into a gap`);
ok(noNose === 0, `${noNose} gaps without a median piece (and nose) at each end`);
ok(shortPiece === 0, `${shortPiece} median pieces beside a gap shorter than ${M.minRun} m`);
ok(plan.runs.every((u) => medianHalfAt(u, 0) < 1e-9 && medianHalfAt(u, u.n - 1) < 1e-9), 'every piece (also beside a gap) ends in a nose of width 0');

// trees and hedges keep out of the gap
const trees = planCityTrees(roads).trees;
let treeIn = 0;
for (let i = 0; i < trees.length; i += 8) {
  if (trees[i + 7] !== 1) continue;
  for (const o of up.openings) {
    const dx = trees[i] - o.x; const dz = trees[i + 2] - o.z;
    const along = dx * o.tx + dz * o.tz; const lat = dx * o.nx + dz * o.nz;
    if (Math.abs(along) < o.len / 2 + U.plantClear - 1 && Math.abs(lat) < o.medianHalf + 1) { treeIn++; console.log(`  tree at ${trees[i].toFixed(1)},${trees[i + 2].toFixed(1)} near gap ${o.id} of road ${o.roadId} (${o.section}) s ${o.s}: along ${along.toFixed(1)} lat ${lat.toFixed(2)}`); break; }
  }
}
ok(treeIn === 0, `${treeIn} median trees inside or within ${U.plantClear} m of a gap`);
ok(uturnZoneHas(up, up.openings[0].roadId, up.openings[0].s, 0) && !uturnZoneHas(up, up.openings[0].roadId, up.openings[0].s + 400, 0), 'uturnZoneHas finds the gap and nothing 400 m further');

console.log('\n=== WHICH VEHICLES TURN ROUND ===');
const rows: string[] = [];
const allowed: Record<string, string[]> = {};
for (const [id, spec] of Object.entries(SPECS)) {
  const flags = DIVIDED_SECTIONS.map((d) => (canUTurn(spec, d.id) ? 'yes' : 'no ')).join('  ');
  rows.push(`${id.padEnd(9)} outer R ${turnOuterRadius(spec).toFixed(2)} m   wall-to-wall ${(2 * turnOuterRadius(spec)).toFixed(1)} m   ${flags}`);
  allowed[id] = DIVIDED_SECTIONS.filter((d) => canUTurn(spec, d.id)).map((d) => d.id);
}
note(`vehicle / highway arterial avenue`);
rows.forEach((r) => note(r));
ok(allowed.bus.length === 0 && allowed.truck.length === 0, 'bus and truck never turn round (28.7 m wall to wall does not fit)');
ok(['sedan', 'pickup', 'auto', 'rickshaw'].every((k) => allowed[k].length === 3), 'sedan, pickup, auto and rickshaw turn round on every divided road');

console.log('\n=== AI ROUTE ===');
const graph = new RoadGraph(roads);
const rule = (spec: (typeof SPECS)[keyof typeof SPECS]) => ({ roadOk: () => true, placeOk: () => true, uturnOk: (sec: Parameters<typeof canUTurn>[1]) => canUTurn(spec, sec) });
const sedanRule = rule(SPECS.sedan);
const sample = up.openings.filter((o) => byId.get(o.roadId)!.length > o.s + 200 && o.s > 300)[0];
const road = byId.get(sample.roadId)!;
const build = (dir: 1 | -1, rnd: () => number, rl: ReturnType<typeof rule> | undefined, fast = false): RoutePt[] => {
  const rb = new RouteBuilder(graph, rnd, sample.roadId, sample.s - dir * 120, dir, 1, rl);
  rb.fast = fast;
  rb.start();
  rb.fill(0, 330);
  return rb.pts;
};
for (const dir of [1, -1] as const) {
  const pts = build(dir, () => 0, sedanRule);
  const hold = pts.findIndex((p) => p.ut === 1);
  const turn = pts.filter((p) => p.ut === 2);
  ok(hold > 0 && turn.length === 14, `dir ${dir}: a hold point and a half circle of 14 points were planned`);
  if (hold < 0) continue;
  const S = pts[hold];
  const Rr = laneCentre(road, 0);
  ok(Math.abs((S.ur ?? 0) - Rr) < 1e-9, `dir ${dir}: the hold point carries the radius ${Rr.toFixed(2)} m`);
  const end = pts[hold + 14];
  const f = frameAt(road, sample.s);
  // the apex (middle of the half circle) is on the centreline in the middle of the gap
  const apex = pts[hold + 7];
  const lat = (apex.x - f.x) * f.nx + (apex.z - f.z) * f.nz;
  const along = (apex.x - f.x) * f.tx + (apex.z - f.z) * f.tz;
  ok(Math.abs(lat) < 0.6 && Math.abs(along) < 1.5, `dir ${dir}: the apex is ${Math.abs(lat).toFixed(2)} m from the centreline and ${Math.abs(along).toFixed(2)} m from the middle of the gap`);
  const latEnd = (end.x - S.x) * f.nx + (end.z - S.z) * f.nz;
  ok(Math.abs(Math.abs(latEnd) - 2 * Rr) < 0.8, `dir ${dir}: the half circle ends ${Math.abs(latEnd).toFixed(2)} m across from where it started (2 x R = ${(2 * Rr).toFixed(2)} m)`);
  // after the turn the route goes the other way, in the kerb lane of the other carriageway
  const a = pts[hold - 1]; const c = pts[hold + 15];
  const e2 = pts[hold + 18];
  const h0x = S.x - a.x; const h0z = S.z - a.z; const h1x = e2.x - c.x; const h1z = e2.z - c.z;
  const dot = (h0x * h1x + h0z * h1z) / (Math.hypot(h0x, h0z) * Math.hypot(h1x, h1z));
  ok(dot < -0.95, `dir ${dir}: after the turn the route runs the opposite way (cos ${dot.toFixed(3)})`);
  const lastLat = (end.x - f.x) * f.nx + (end.z - f.z) * f.nz;
  ok(Math.sign(lastLat) === -Math.sign((S.x - f.x) * f.nx + (S.z - f.z) * f.nz) && Math.abs(Math.abs(lastLat) - Rr) < 0.8, `dir ${dir}: it ends in the kerb lane of the other carriageway (${Math.abs(lastLat).toFixed(2)} m from the centreline, lane centre ${Rr.toFixed(2)} m)`);
}
ok(build(1, () => 0.99, sedanRule).every((p) => !p.ut), 'a driver who does not want to turn round goes straight on');
ok(build(1, () => 0, undefined).every((p) => !p.ut), 'a route without a rule never turns round');
ok(build(1, () => 0, rule(SPECS.bus)).every((p) => !p.ut), 'a bus never turns round');
ok(build(1, () => 0, sedanRule, true).every((p) => !p.ut), 'a tour (fast) car never turns round');
{
  const rb = new RouteBuilder(graph, () => 0, sample.roadId, sample.s - 100, 1, 1, sedanRule);
  rb.plan = [{ pad: 0, roadId: sample.roadId, dir: 1 }];
  rb.start(); rb.fill(0, 330);
  ok(rb.pts.every((p) => !p.ut), 'a car that follows a planned tour never turns round');
}
{
  const pts = build(1, () => 0, sedanRule);
  const hold = pts.findIndex((p) => p.ut === 1);
  const vmaxTurn = Math.max(...pts.filter((p) => p.ut === 2).map((p) => p.vmax));
  ok(vmaxTurn <= U.turnSpeed + 1e-9, `speed on the half circle is at most ${vmaxTurn.toFixed(1)} m/s (limit ${U.turnSpeed})`);
  ok(pts[hold].vmax <= U.turnSpeed + 1e-9, 'the hold point asks for turn speed (the driver slows down before it)');
}

console.log('\n=== GAP RULE ===');
{
  const S = { x: 0, z: 0, ur: 10.45 };
  const prev = { x: -2, z: 0 }; // travelling +x, so the left of travel is -z... (l = rx*hz - rz*hx = -rz)
  const car = (x: number, z: number, vx: number, vz = 0) => ({ x, z, vx, vz, kind: 'vehicle' as const, ref: {} });
  const me = {};
  const blocked = (o: ReturnType<typeof car>[], waited = 0) => uturnBlocked(S, prev, 1, 0, o, me, waited);
  ok(!blocked([]), 'empty road: go');
  ok(blocked([car(-50, 0, 20)]), 'a car 50 m behind in our lane at 20 m/s (2.5 s): wait');
  ok(!blocked([car(-50, 0, 6)]), 'a car 50 m behind at 6 m/s (8 s): go');
  ok(blocked([car(-60, -7, 20)]), 'a car 60 m behind in an inner lane at 20 m/s: wait');
  ok(!blocked([car(-8, 0, 0)]), 'a car queued right behind us (standing): go');
  ok(blocked([car(80, 8, -20)]), 'an oncoming car 80 m ahead on the far carriageway at 20 m/s: wait');
  ok(!blocked([car(400, 8, -20)]), 'an oncoming car 400 m ahead: go');
  ok(blocked([car(6, 3, 0)]), 'a car standing in the swept half disc: wait');
  ok(!blocked([car(6, 3, 0)], 11), '... but a driver who has waited more than 10 s goes (the normal brakes still protect him)');
  ok(!blocked([{ ...car(-30, 0, 20), kind: 'person' as unknown as 'vehicle' }].map((o) => ({ ...o, kind: 'person' as 'vehicle' | 'person' }))), 'people are not gap traffic (they have their own rule)');
  ok(!uturnBlocked(S, prev, 1, 0, [{ ...car(-30, 0, 20), ref: me }], me, 0), 'the driver ignores his own car');
}

console.log('\n=== DRIVE THROUGH EVERY OPENING (kinematic, same pure pursuit as AIDriver) ===');
const BRAKE = 3.2;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
interface Result { ok: boolean; touch: number; kerb: number; endErr: number; headErr: number }
function drive(spec: (typeof SPECS)[keyof typeof SPECS], o: (typeof up.openings)[number], dir: 1 | -1): Result {
  const r = byId.get(o.roadId)!;
  // start 45 m before the hold point (no junction in between: every gap is at least 60 m from a pad) and plan only 30 m beyond the turn
  const rb = new RouteBuilder(graph, () => 0, o.roadId, o.s - dir * (o.radius + 45), dir, 1, rule(spec));
  rb.start(); rb.fill(0, 45 + Math.PI * o.radius + 30);
  const pts = rb.pts;
  const start = pts[0];
  const heading = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  const L = spec.wheelbaseHalf * 2;
  let hd = heading;
  // the body centre is half a wheelbase ahead of the rear axle
  let rx = start.x - Math.sin(hd) * L / 2; let rz = start.z - Math.cos(hd) * L / 2;
  let v = 12; let steer = 0; let head = 0;
  let touch = 0; let kerb = Infinity; let finished = false;
  const f = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
  const hold = pts.findIndex((p) => p.ut === 1);
  const lastTurn = pts.reduce((m, p, i) => (p.ut === 2 ? i : m), -1);
  const roadCoord = (x: number, z: number): { s: number; lat: number } => {
    let s = o.s;
    for (let k = 0; k < 4; k++) { frameAt(r, s, f); s += (x - f.x) * f.tx + (z - f.z) * f.tz; }
    frameAt(r, s, f);
    return { s, lat: (x - f.x) * f.nx + (z - f.z) * f.nz };
  };
  const hx0 = spec.half.x; const hz0 = spec.half.z;
  for (let t = 0; t < 60 * 60 && !finished; t++) {
    const dt = 1 / 60;
    const cx = rx + Math.sin(hd) * L / 2; const cz = rz + Math.cos(hd) * L / 2; // body centre
    const fx = Math.sin(hd); const fz = Math.cos(hd);
    while (head + 1 < pts.length && (pts[head + 1].x - cx) ** 2 + (pts[head + 1].z - cz) ** 2 <= (pts[head].x - cx) ** 2 + (pts[head].z - cz) ** 2) head++;
    const inTurn = pts[head].ut === 2 || (head + 1 < pts.length && pts[head + 1].ut === 2);
    const ld = inTurn ? clamp(3.4 + Math.abs(v) * 0.5, 4, 7) : clamp(4.5 + Math.abs(v) * 0.9, 5, 26);
    let idx = head; let acc = Math.hypot(pts[idx].x - cx, pts[idx].z - cz);
    while (acc < ld && idx + 1 < pts.length) { acc += Math.hypot(pts[idx + 1].x - pts[idx].x, pts[idx + 1].z - pts[idx].z); idx++; }
    const tx = pts[idx].x - cx; const tz = pts[idx].z - cz;
    const along = tx * fx + tz * fz; const lat = tx * fz - tz * fx;
    const alpha = Math.atan2(lat, Math.max(0.01, along));
    const delta = Math.atan((2 * L * Math.sin(alpha)) / Math.max(3, Math.hypot(tx, tz)));
    const maxAngle = Math.max(0.05, spec.maxSteer / (1 + (Math.abs(v) / 16) ** 2));
    steer += (clamp(delta / maxAngle, -1, 1) - steer) * Math.min(1, 8 * dt);
    let vt = Infinity; let dist = Math.hypot(pts[head].x - cx, pts[head].z - cz);
    for (let j = head; j < pts.length && dist < 90; j++) { if (j > head) dist += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z); vt = Math.min(vt, Math.sqrt(pts[j].vmax ** 2 + 2 * BRAKE * dist)); }
    if (spec.cruiseMax !== undefined) vt = Math.min(vt, spec.cruiseMax);
    v += clamp(vt - v, -BRAKE * dt * 1.5, 3 * dt);
    // bicycle model at the rear axle (steering wheels in front); positive steer = left, and a left turn INCREASES the heading in our (sin, cos) frame
    const d = steer * maxAngle;
    hd += (v / L) * Math.tan(d) * dt;
    rx += Math.sin(hd) * v * dt; rz += Math.cos(hd) * v * dt;
    // footprint of the body: the edge points every 0.4 m
    const ncx = rx + Math.sin(hd) * L / 2; const ncz = rz + Math.cos(hd) * L / 2;
    const sx = Math.sin(hd); const sz = Math.cos(hd); // forward
    const px = sz; const pz = -sx; // left
    for (let i = 0; i <= 2 * hz0 / 0.4; i++) for (const side of [-1, 1]) {
      const a = -hz0 + i * 0.4;
      const wx = ncx + sx * a + px * hx0 * side; const wz = ncz + sz * a + pz * hx0 * side;
      const c = roadCoord(wx, wz);
      // median region: outside the gap [a, b] the median has its full width, narrowed by the nose over noseLen beside the gap
      const dGap = c.s < o.a ? o.a - c.s : c.s > o.b ? c.s - o.b : -1;
      if (dGap >= 0 && dGap < 60 && Math.abs(c.lat) < o.medianHalf * noseScale(dGap) - 1e-6) touch++;
      kerb = Math.min(kerb, r.halfWidth - Math.abs(c.lat));
    }
    for (let i = 0; i <= 2 * hx0 / 0.4; i++) for (const e of [-1, 1]) {
      const a = e * hz0; const sd = -hx0 + i * 0.4;
      const c = roadCoord(ncx + sx * a + px * sd, ncz + sz * a + pz * sd);
      const dGap = c.s < o.a ? o.a - c.s : c.s > o.b ? c.s - o.b : -1;
      if (dGap >= 0 && dGap < 60 && Math.abs(c.lat) < o.medianHalf * noseScale(dGap) - 1e-6) touch++;
      kerb = Math.min(kerb, r.halfWidth - Math.abs(c.lat));
    }
    if (head >= lastTurn + 3) finished = true;
  }
  const end = pts[Math.min(pts.length - 1, lastTurn + 3)];
  const cxE = rx + Math.sin(hd) * L / 2; const czE = rz + Math.cos(hd) * L / 2;
  // distance of the car from the planned path at the end (nearest of the last route points: the loop stops when the head is 3 points past the half circle)
  let endErr = Infinity;
  for (let i = Math.max(0, lastTurn - 2); i < Math.min(pts.length - 1, lastTurn + 7); i++) {
    const ax = pts[i].x; const az = pts[i].z; const bx = pts[i + 1].x - ax; const bz = pts[i + 1].z - az;
    const t = clamp(((cxE - ax) * bx + (czE - az) * bz) / (bx * bx + bz * bz || 1), 0, 1);
    endErr = Math.min(endErr, Math.hypot(ax + bx * t - cxE, az + bz * t - czE)); // distance to the path (segments, not only its points)
  }
  void end;
  const hEnd = Math.atan2(pts[Math.min(pts.length - 1, lastTurn + 4)].x - end.x, pts[Math.min(pts.length - 1, lastTurn + 4)].z - end.z);
  let headErr = Math.abs(hd - hEnd) % (2 * Math.PI); if (headErr > Math.PI) headErr = 2 * Math.PI - headErr;
  void hold;
  return { ok: finished && touch === 0 && kerb > 0.2 && endErr < 2.5 && headErr < 0.5, touch, kerb, endErr, headErr };
}
const names = ['rickshaw', 'auto', 'sedan', 'pickup', 'tanker'] as const;
for (const sec of DIVIDED_SECTIONS) {
  const ops = up.openings.filter((o) => o.section === sec.id);
  if (ops.length === 0) { note(`${sec.id}: no opening on this section`); continue; }
  const pick = ops.filter((_, i) => i % Math.max(1, Math.floor(ops.length / 12)) === 0).slice(0, 12);
  for (const id of names) {
    const spec = SPECS[id];
    if (!canUTurn(spec, sec.id)) { note(`${sec.id.padEnd(8)} ${id.padEnd(8)} not allowed (does not fit)`); continue; }
    let bad = 0; let worstKerb = Infinity; let worstEnd = 0; let touches = 0;
    for (const o of pick) for (const dir of [1, -1] as const) {
      const res = drive(spec, o, dir);
      if (!res.ok) bad++;
      worstKerb = Math.min(worstKerb, res.kerb); worstEnd = Math.max(worstEnd, res.endErr); touches += res.touch;
    }
    ok(bad === 0, `${sec.id.padEnd(8)} ${id.padEnd(8)}: ${pick.length * 2} drives, ${bad} failed, ${touches} median touches, closest kerb ${worstKerb.toFixed(2)} m, worst distance from the path at the end ${worstEnd.toFixed(2)} m`);
  }
}
console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
