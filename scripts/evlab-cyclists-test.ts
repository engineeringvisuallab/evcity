// EVLab step 10: the cycle rack, the routes and the state machine of the people who come by cycle, and the way a rider sits on the cycle
// (headless: stand-in cycle / rider models). npx tsx scripts/evlab-cyclists-test.ts
import * as THREE from 'three';
import { CYCLE_SLOTS, RACK, RACK_PAD, hoopX, inRackZone } from '../src/evlab/EVLabCycleRack';
import { AVENUE, BACK_LEN, CYCLE_DOOR, CYCLISTS, PLAZA_RIDE, planCyclists, rideInSpeed, rideOutSpeed } from '../src/evlab/EVLabCyclistPath';
import { sampleRoute } from '../src/evlab/EVLabArrivalPath';
import { BODY, LEAN, RIDER_MIN_SCALE, RIDE, hipAt, pedalAt, riderPose, twoLink } from '../src/evlab/EVLabCyclistPose';
import { EVLabCyclists, type CycleView, type CyclistFactory, type RiderView } from '../src/evlab/EVLabCyclists';
import { PLAZA, PLAZA_FOUNTAIN, parkTrees } from '../src/evlab/EVLabCampus';

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };
const near = (a: number, b: number, e: number): boolean => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- the rack
ok(CYCLE_SLOTS.length === RACK.hoops * 2, 'two bays per hoop');
ok(new Set(CYCLE_SLOTS.map((s) => s.id)).size === CYCLE_SLOTS.length, 'unique bay ids');
for (let i = 1; i < CYCLE_SLOTS.length; i++) ok(CYCLE_SLOTS[i].x - CYCLE_SLOTS[i - 1].x >= 0.7 - 1e-9, 'neighbouring cycles at least 0.7 m apart (handlebar 0.62): ' + CYCLE_SLOTS[i].id);
ok(CYCLE_SLOTS.every((s) => near(s.yaw, Math.PI, 1e-9)), 'all cycles nose to the north');
ok(CYCLE_SLOTS.every((s) => near(Math.abs(s.x - hoopX(s.hoop)), RACK.offset, 1e-9)), 'each cycle beside its hoop');
ok(RACK_PAD[0] > PLAZA.x0 && RACK_PAD[1] < PLAZA.x1 && RACK_PAD[2] > PLAZA.z0 && RACK_PAD[3] < PLAZA.z1, 'the pad is on the plaza');
ok(RACK_PAD[2] > 60 + 2, 'the pad keeps clear of the portal canopy line (z 60)');
// a cycle (1.78 m long, origin in the middle) in its bay stays inside the pad
ok(CYCLE_SLOTS.every((s) => s.z - 0.9 >= RACK_PAD[2] && s.z + 0.95 <= RACK_PAD[3]), 'every cycle fits the pad');
ok(inRackZone(RACK.cx, RACK.z) && !inRackZone(RACK.cx, RACK.z + 10), 'inRackZone');

// ---------------------------------------------------------------- obstacles on the plaza (lamps, flagpoles, trees, fountain): the rack and every route keep clear
const obstacles: Array<{ x: number; z: number; r: number; what: string }> = [];
for (let x = -60; x <= 60; x += 20) { obstacles.push({ x, z: 68, r: 0.2, what: 'lamp' }, { x, z: 130, r: 0.2, what: 'lamp' }); }
for (const x of [-40, -32, 32, 40]) obstacles.push({ x, z: 74, r: 0.3, what: 'flagpole' });
const trees = parkTrees().filter((t) => t.x > PLAZA.x0 - 5 && t.x < PLAZA.x1 + 5 && t.z > PLAZA.z0 - 5 && t.z < PLAZA.z1 + 40);
for (const t of trees) obstacles.push({ x: t.x, z: t.z, r: 0.5, what: 'tree' });
ok(!trees.some((t) => inRackZone(t.x, t.z, 2.5)), 'no park tree on / next to the rack pad');
const before = trees.length;
console.log('trees near the plaza:', before);
for (const o of obstacles) ok(!inRackZone(o.x, o.z, 0.5), 'rack pad clear of the ' + o.what + ` at ${o.x}, ${o.z}`);
const clearance = (route: { pts: ReadonlyArray<readonly [number, number]>; len: number }, id: string, what: string, min: number): void => {
  // sample the route (a Route object: use the polyline points, which are dense after roundCorners)
  let worst = 1e9, at = '';
  for (const [x, z] of route.pts) {
    for (const o of obstacles) { const d = Math.hypot(x - o.x, z - o.z) - o.r; if (d < worst) { worst = d; at = o.what + ` (${o.x}, ${o.z})`; } }
    const fd = Math.hypot(x - PLAZA_FOUNTAIN.x, z - PLAZA_FOUNTAIN.z) - PLAZA_FOUNTAIN.r;
    if (fd < worst) { worst = fd; at = 'fountain'; }
  }
  ok(worst >= min, `${id} ${what}: clear of lamps / flagpoles / trees / fountain by ${worst.toFixed(2)} m (need ${min}), nearest ${at}`);
};

// ---------------------------------------------------------------- plans
const plans = planCyclists(mulberry32(7));
ok(plans.length === CYCLISTS.length, 'one plan per cyclist');
ok(new Set(plans.map((p) => p.slot.id)).size === plans.length, 'every cyclist has his own bay');
for (const p of plans) {
  const id = p.slot.id;
  const a0 = sampleRoute(p.inRoute, 0), a1 = sampleRoute(p.inRoute, p.inRoute.len);
  ok(near(a0.x, -AVENUE.lane, 1e-6) && near(a0.z, AVENUE.z0, 1e-6), id + ': starts on the avenue at the highway');
  ok(near(a0.heading, Math.PI, 0.01), id + ': rides north (heading PI)');
  ok(near(a1.x, p.slot.x, 1e-6) && near(a1.z, p.slot.z, 1e-6), id + ': ends in the bay');
  ok(near(Math.atan2(Math.sin(a1.heading - p.slot.yaw), Math.cos(a1.heading - p.slot.yaw)), 0, 0.02), id + ': arrives nose to the north, along the bay');
  // the last straight before the bay is long enough to line up (4 m at least)
  let straight = 0;
  for (let s = p.inRoute.len; s > p.inRoute.len - 12; s -= 0.25) { if (Math.abs(sampleRoute(p.inRoute, s).x - p.slot.x) < 1e-3) straight = p.inRoute.len - s; else break; }
  ok(straight >= 4, id + ': straight run into the bay ' + straight.toFixed(1) + ' m');
  const o0 = sampleRoute(p.outRoute, 0), o1 = sampleRoute(p.outRoute, p.outRoute.len);
  ok(near(o0.x, p.slot.x, 1e-6) && near(o0.z, p.slot.z + BACK_LEN, 1e-6), id + ': the way out starts where the cycle was pushed to');
  ok(near(o0.heading, 0, 0.02), id + ': the way out starts heading south');
  ok(near(o1.z, AVENUE.z0, 1e-6) && near(o1.x, AVENUE.lane, 1e-6), id + ': leaves on the other lane of the avenue (left-hand traffic)');
  const w0 = sampleRoute(p.walk, 0), w1 = sampleRoute(p.walk, p.walk.len);
  ok(Math.hypot(w1.x - CYCLE_DOOR[0], w1.z - CYCLE_DOOR[1]) < 1e-6, id + ': walk ends at the portal');
  ok(w0.z > p.slot.z + BODY.thigh && w0.z > RACK_PAD[2] && near(w0.x, p.slot.x, 1e-6), id + ': walk starts behind the cycle');
  ok(p.walk.len > 20 && p.walk.len < 80, id + ': walk length ' + p.walk.len.toFixed(0));
  ok(p.inRoute.len > 150 && p.inRoute.len < 400 && p.outRoute.len > 150 && p.outRoute.len < 400, id + ': ride length ' + p.inRoute.len.toFixed(0) + ' / ' + p.outRoute.len.toFixed(0));
  ok(p.slowFrom > 100 && p.slowFrom < p.inRoute.len && p.fastFrom > 50 && p.fastFrom < p.outRoute.len, id + ': slow / fast distances');
  for (const [r, nm] of [[p.inRoute, 'in'], [p.outRoute, 'out'], [p.walk, 'walk']] as const) {
    let prev = sampleRoute(r, 0).heading, maxTurn = 0;
    for (let s = 0.5; s <= r.len; s += 0.5) { const h = sampleRoute(r, s).heading; maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(h - prev), Math.cos(h - prev)))); prev = h; }
    ok(maxTurn < 0.6, id + ' ' + nm + ': smooth route, max turn per 0.5 m ' + maxTurn.toFixed(2));
  }
  // on the plaza stretch (z < 132) nothing is in the way
  const plazaPart = (r: typeof p.inRoute) => ({ pts: r.pts.filter(([, z]) => z < PLAZA.z1), len: r.len });
  clearance(plazaPart(p.inRoute), id, 'in', 1.0);
  clearance(plazaPart(p.outRoute), id, 'out', 1.0);
  clearance(p.walk, id, 'walk', 0.8);
  // the bridge / avenue stretch stays on the middle of the road (12 m road): |x| < 5
  for (const [x, z] of [...p.inRoute.pts, ...p.outRoute.pts]) if (z > PLAZA.z1) ok(Math.abs(x) <= 5, id + ` avenue point (${x.toFixed(1)}, ${z.toFixed(1)}) on the road`);
  ok(rideInSpeed(0, p.inRoute.len, p.cruise, p.slowFrom) > 0.5 && rideInSpeed(p.inRoute.len, p.inRoute.len, p.cruise, p.slowFrom) < 1, id + ': rideInSpeed');
  ok(rideOutSpeed(0, p.cruise, p.fastFrom) > 0.5 && rideOutSpeed(p.outRoute.len, p.cruise, p.fastFrom) >= 3, id + ': rideOutSpeed');
}

// riders never ride through each other (2.5 m apart at least while two are riding in / out)
{
  const dt = 0.1;
  const pos = (p: (typeof plans)[number], t: number): [number, number] | null => {
    let tt = t - p.delay;
    if (tt < 0) return null;
    let s = 0;
    while (tt > 0 && s < p.inRoute.len) { s += rideInSpeed(s, p.inRoute.len, p.cruise, p.slowFrom) * dt; tt -= dt; }
    if (s < p.inRoute.len) { const a = sampleRoute(p.inRoute, s); return [a.x, a.z]; }
    return null;
  };
  let minD = 1e9;
  for (let t = 0; t < 120; t += dt) {
    const ps = plans.map((p) => pos(p, t)).filter((v): v is [number, number] => !!v);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) minD = Math.min(minD, Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]));
  }
  ok(minD > 6, 'riders keep apart on the way in: closest ' + minD.toFixed(1) + ' m');
}
ok(planCyclists(mulberry32(1), 2).length === 2 && planCyclists(mulberry32(1), 0).length === 0 && planCyclists(mulberry32(1), 99).length === CYCLISTS.length, 'planCyclists(count)');

// ---------------------------------------------------------------- how the rider sits (inverse kinematics, checked with forward kinematics)
const fk = (lenA: number, lenB: number, a1: number, bend: number, sign: 1 | -1): { f: number; u: number } => {
  // joint at the origin; link 1 at angle a1 from straight down towards forward; the second link turns by `bend` (sign +1: forearm forward, -1: shin back)
  const a2 = a1 + sign * bend;
  return { f: lenA * Math.sin(a1) + lenB * Math.sin(a2), u: -lenA * Math.cos(a1) - lenB * Math.cos(a2) };
};
for (const scale of [RIDER_MIN_SCALE, 1.05, 1.1]) {
  let worstFoot = 0, worstHand = 0, worstLeg = 0, worstArm = 0;
  for (let k = 0; k < 24; k++) {
    const crank = (k / 24) * Math.PI * 2;
    const P = riderPose(scale, crank), hip = hipAt(scale);
    worstLeg = Math.max(worstLeg, P.legMiss); worstArm = Math.max(worstArm, P.armMiss);
    ok(near(P.lean, LEAN, 1e-9), 'lean');
    for (let i = 0; i < 2; i++) {
      // foot (ankle): from the hip, thigh angle = -thigh, shin turns back by knee
      const l = fk(BODY.thigh, BODY.shin, -P.thigh[i], P.knee[i], -1);
      const ped = pedalAt(crank, i === 1);
      const ankleY = hip.y + l.u * scale, ankleZ = hip.z + l.f * scale;
      const wantY = ped.y + 0.011 + BODY.soleUp * scale, wantZ = ped.z - BODY.ballFwd * scale;
      if (P.legMiss < 0.005) worstFoot = Math.max(worstFoot, Math.hypot(ankleY - wantY, ankleZ - wantZ));
      ok(P.knee[i] >= 0 && P.knee[i] < 2.6, `knee bends the right way (${P.knee[i].toFixed(2)})`);
      ok(-P.thigh[i] > -0.1 && -P.thigh[i] < 1.7, `thigh swings forward / down, not backwards (${(-P.thigh[i]).toFixed(2)})`);
      // hand on the grip
      const shY = hip.y + BODY.shoulderY * scale * Math.cos(LEAN), shZ = hip.z + BODY.shoulderY * scale * Math.sin(LEAN);
      const h = fk(BODY.arm, BODY.fore, -P.arm[i], -P.elbow[i], 1);
      worstHand = Math.max(worstHand, Math.hypot(shY + h.u * scale - RIDE.grip.y, shZ + h.f * scale - RIDE.grip.z));
      ok(P.elbow[i] <= 0 && P.elbow[i] > -2.0, `elbow bends the right way (${P.elbow[i].toFixed(2)})`);
    }
  }
  ok(worstFoot < 0.005, `scale ${scale}: feet on the pedals (worst ${worstFoot.toFixed(4)} m)`);
  ok(worstHand < 0.005 && worstArm === 0, `scale ${scale}: hands on the grips (worst ${worstHand.toFixed(4)} m, out of reach by ${worstArm.toFixed(3)} m)`);
  ok(worstLeg < 0.03, `scale ${scale}: legs reach the pedals all round the stroke (worst miss ${worstLeg.toFixed(3)} m)`);
}
// the two legs are half a turn apart: when one is at the top the other is at the bottom
{
  const P0 = riderPose(1.05, 0), P1 = riderPose(1.05, Math.PI);
  ok(near(P0.thigh[0], P1.thigh[1], 1e-9) && near(P0.knee[1], P1.knee[0], 1e-9), 'legs half a turn apart');
}
ok(twoLink(0, -0.6, 0.46, 0.36, true).miss === 0 && twoLink(0, -2, 0.46, 0.36, true).miss > 1, 'twoLink reports an unreachable target');

// ---------------------------------------------------------------- state machine with stand-ins
let cycles = 0, men = 0, disposed = 0, mounts = 0, dismounts = 0;
const fake: CyclistFactory = {
  cycle: () => {
    cycles++;
    const root = new THREE.Group();
    let crank = 0;
    const v: CycleView = {
      root, get pedalAngle() { return crank; },
      place: (x, y, z, h) => { root.position.set(x, y, z); root.rotation.y = h; },
      setSteer: () => undefined, roll: (d) => { crank += d; }, dispose: () => { disposed++; },
    };
    return v;
  },
  rider: () => {
    men++;
    const root = new THREE.Group();
    const w: RiderView = {
      root, setHeading: (h) => { root.rotation.y = h; }, update: () => undefined,
      mount: (c) => { mounts++; root.removeFromParent(); c.root.add(root); root.position.set(0, 1, 0); }, pedal: () => undefined,
      dismount: () => { dismounts++; root.removeFromParent(); }, dispose: () => { disposed++; },
    };
    return w;
  },
};
const A = new EVLabCyclists(fake);
ok(!A.active, 'nothing before start');
A.start(4);
ok(A.active && A.count === 4 && A.group.visible, 'start creates the actors');
const dt = 1 / 30;
let t = 0;
const seen = new Set<string>();
const sane = (): void => {
  A.group.traverse((o) => { ok(Number.isFinite(o.position.x + o.position.y + o.position.z), 'finite positions'); });
};
while (t < 600 && !A.phases.every((p) => p === 'inside')) { A.update(dt); t += dt; A.phases.forEach((p) => seen.add(p)); if (Math.round(t * 30) % 90 === 0) sane(); }
ok(A.phases.every((p) => p === 'inside'), 'everybody got inside, t=' + t.toFixed(0));
ok(['wait', 'rideIn', 'park', 'walkIn', 'inside'].every((p) => seen.has(p)), 'phases seen on the way in');
ok(cycles === 4 && men === 4, 'one cycle and one rider each while they ride in');
ok(dismounts === 4, 'everybody got off once');
console.log('all inside after ' + t.toFixed(0) + ' s');
// the four cycles stand in the rack now (children of the group), nobody is outside
const parked = A.group.children.filter((c) => c.position.z > RACK_PAD[2] && c.position.z < RACK_PAD[3] && c.position.x > RACK_PAD[0] && c.position.x < RACK_PAD[1]);
ok(parked.length === 4, 'four cycles parked on the rack pad: ' + parked.length);
ok(A.group.children.length === 4, 'only the cycles are left in the group (the riders are inside)');
A.dismiss();
let t2 = 0;
while (A.active && t2 < 900) { A.update(dt); t2 += dt; A.phases.forEach((p) => seen.add(p)); }
ok(!A.active, 'everything is gone after the dismissal, t=' + t2.toFixed(0));
ok(['walkOut', 'mount', 'back', 'turn', 'rideOut'].every((p) => seen.has(p)), 'phases seen on the way out');
ok(!A.group.visible && A.group.children.length === 0, 'group empty and hidden');
ok(disposed === cycles + men, 'all models disposed: ' + disposed + ' / ' + (cycles + men));
ok(mounts === 2 * cycles && men === 2 * cycles, 'riders mounted on the way in and again to leave: ' + mounts + ' (riders made: ' + men + ')');
console.log('all gone after ' + t2.toFixed(0) + ' s');

// ---- dismissal in the middle of the arrival (some still riding, some walking, some not started)
cycles = men = disposed = mounts = dismounts = 0;
A.start(5);
let t3 = 0;
while (t3 < 600 && !A.phases.includes('walkIn')) { A.update(dt); t3 += dt; }
ok(A.phases.includes('rideIn') || A.phases.includes('wait') || A.phases.includes('park'), 'mid-arrival state has riders still coming');
A.dismiss();
let t4 = 0;
while (A.active && t4 < 1200) { A.update(dt); t4 += dt; }
ok(!A.active, 'mid-arrival dismissal: all gone, t=' + t4.toFixed(0));
ok(disposed === cycles + men, 'mid-arrival: all models disposed ' + disposed + ' / ' + (cycles + men));

// ---- dismiss before anybody came / twice / dismiss without start
A.start(3);
A.dismiss(); A.dismiss();
let t5 = 0;
while (A.active && t5 < 100) { A.update(dt); t5 += dt; }
ok(!A.active && t5 < 5, 'dismissed at once: nobody had come yet, nothing to wait for (t=' + t5.toFixed(1) + ')');
A.dismiss();
ok(!A.active, 'dismiss without start is harmless');

// ---- restart while active / dispose
A.start(2); A.update(dt); A.start(3);
ok(A.count === 3, 'restart replaces the actors');
let factoryDisposed = 0;
const A2 = new EVLabCyclists({ ...fake, dispose: () => { factoryDisposed++; } });
A2.start(1); A2.update(1);
A2.dispose();
ok(!A2.active && A2.group.children.length === 0 && factoryDisposed === 1, 'dispose clears and releases the factory');
A.dispose();
ok(!A.active && A.group.children.length === 0, 'dispose clears');

if (fails) { console.error(fails + ' FAIL'); process.exit(1); }
console.log('evlab cyclists: all ok');
