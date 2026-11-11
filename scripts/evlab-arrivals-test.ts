// EVLab step 8: routes and state machine of the people who arrive by car (headless: stand-in car / person models).
import * as THREE from 'three';
import { ARRIVAL_CARS, ENTRY_LEN, makeRoute, planArrivals, sampleRoute, speedIn, speedOut } from '../src/evlab/EVLabArrivalPath';
import { EVLabArrivals, type ArrivalFactory, type CarView, type WalkerView } from '../src/evlab/EVLabArrivals';
import { SPECS } from '../src/vehicles/VehicleSpec';
import { BAY, CROSS_Z, DRIVE, LOT, SLOTS } from '../src/evlab/EVLabParking';

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };

// ---- pure plan
const plans = planArrivals(mulberry32(1));
ok(plans.length === ARRIVAL_CARS.length, 'one plan per car');
ok(new Set(plans.map((p) => p.slot.id)).size === plans.length, 'every car has its own bay');
for (const p of plans) {
  const id = p.slot.id;
  ok(!!SPECS[p.car], id + ': known vehicle');
  ok(SPECS[p.car].wheelRadius > 0, id + ': wheel radius');
  // route ends
  const a0 = sampleRoute(p.inRoute, 0), a1 = sampleRoute(p.inRoute, p.inRoute.len);
  ok(Math.abs(a0.x - (DRIVE.x - 2.5)) < 1e-6 && Math.abs(a0.z - DRIVE.z1) < 1e-6, id + ': starts at the highway edge');
  ok(Math.abs(a1.x - p.slot.x) < 1e-6 && Math.abs(a1.z - p.slot.z) < 1e-6, id + ': ends in the bay');
  // the car heads into the bay: last heading = slot yaw (nose-in direction of travel is away from the aisle)
  const d = Math.atan2(Math.sin(a1.heading - p.slot.yaw), Math.cos(a1.heading - p.slot.yaw));
  ok(Math.abs(d) < 0.05 || Math.abs(Math.abs(d) - Math.PI) < 0.05, id + ': arrives along the bay axis');
  const dp = Math.atan2(Math.sin(a1.heading - p.parkYaw), Math.cos(a1.heading - p.parkYaw));
  ok(Math.abs(dp) < 0.05, id + ': the car drives in nose-first and stops with the parked yaw');
  // park yaw is opposite the slot yaw (nose to the back of the bay?) -> just check it is axis aligned
  ok(Math.abs(Math.sin(p.parkYaw)) > 0.99, id + ': parked across the aisle');
  // in route inside the lot / road
  for (const [x, z] of p.inRoute.pts) ok(x >= LOT.x0 && x <= LOT.x1 + 2 && z >= LOT.z0 && z <= DRIVE.z1 + 0.01, id + ` inRoute point in lot/road (${x.toFixed(1)}, ${z.toFixed(1)})`);
  for (const [x, z] of p.outRoute.pts) ok(x >= LOT.x0 && x <= LOT.x1 + 2 && z >= LOT.z0 && z <= DRIVE.z1 + 0.01, id + ' outRoute point in lot/road');
  const o1 = sampleRoute(p.outRoute, p.outRoute.len);
  ok(Math.abs(o1.z - DRIVE.z1) < 1e-6, id + ': leaves at the highway edge');
  // walk: starts beside the car, ends at the portal door
  const w1 = sampleRoute(p.walk, p.walk.len);
  ok(Math.hypot(w1.x - 0, w1.z - 59.5) < 1e-6, id + ': walk ends at the portal');
  ok(p.walk.len > 150 && p.walk.len < 700, id + ': walk length plausible ' + p.walk.len.toFixed(0));
  // no sharp jumps in a route (rounded corners)
  for (const r of [p.inRoute, p.outRoute, p.walk]) {
    let prev = sampleRoute(r, 0).heading, maxTurn = 0;
    for (let s = 0.5; s <= r.len; s += 0.5) { const h = sampleRoute(r, s).heading; maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(h - prev), Math.cos(h - prev)))); prev = h; }
    ok(maxTurn < 0.9, id + ': smooth route, max turn per 0.5 m ' + maxTurn.toFixed(2));
  }
  ok(p.backLen > 1 && p.backLen < BAY.d + BAY.aisle, id + ': reverse length ' + p.backLen.toFixed(2));
  ok(speedIn(0, p.inRoute.len) > 0.5 && speedIn(p.inRoute.len, p.inRoute.len) < 1, id + ': speedIn');
  ok(speedOut(p.outRoute.len, p.outRoute.len) > 5 && speedOut(0, p.outRoute.len) > 1, id + ': speedOut');
}
ok(ENTRY_LEN > 100, 'entry road length');
ok(CROSS_Z > LOT.bayZ1 && CROSS_Z < LOT.z1, 'cross aisle');
ok(makeRoute([[0, 0], [3, 4]]).len === 5, 'makeRoute');
ok(SLOTS.length > 90, 'bays exist');

// ---- state machine with stand-ins
let cars = 0, men = 0, disposed = 0;
const fake: ArrivalFactory = {
  car: (id) => {
    cars++;
    const wheels = [0, 1, 2, 3].map(() => ({ pivot: new THREE.Group(), steer: new THREE.Group(), spin: new THREE.Group() }));
    const view: CarView = { root: new THREE.Group(), wheels, dispose: () => { disposed++; } };
    return { view, spec: SPECS[id as keyof typeof SPECS] };
  },
  walker: () => {
    men++;
    const root = new THREE.Group();
    const w: WalkerView = { root, setHeading: (h) => { root.rotation.y = h; }, update: () => undefined, dispose: () => { disposed++; } };
    return w;
  },
};
const A = new EVLabArrivals(fake);
ok(!A.active, 'nothing before start');
A.start();
ok(A.active && A.count === ARRIVAL_CARS.length && A.group.visible, 'start creates the actors');
const dt = 1 / 30;
let t = 0;
const seen = new Set<string>();
// the whole arrival: everyone inside
while (t < 400 && !A.phases.every((p) => p === 'inside')) { A.update(dt); t += dt; A.phases.forEach((p) => seen.add(p)); }
ok(A.phases.every((p) => p === 'inside'), 'everybody got inside, t=' + t.toFixed(0));
ok(['wait', 'driveIn', 'park', 'walkIn', 'inside'].every((p) => seen.has(p)), 'phases seen on the way in');
ok(cars === ARRIVAL_CARS.length && men === ARRIVAL_CARS.length, 'one car and one man each');
console.log('all inside after ' + t.toFixed(0) + ' s');
// parked cars stand in their bays
// (cars are children of the group; positions checked via phases only)
A.dismiss();
let t2 = 0;
while (A.active && t2 < 600) { A.update(dt); t2 += dt; A.phases.forEach((p) => seen.add(p)); }
ok(!A.active, 'everything is gone after the dismissal, t=' + t2.toFixed(0));
ok(['walkOut', 'board', 'back', 'turn', 'driveOut'].every((p) => seen.has(p)), 'phases seen on the way out');
ok(!A.group.visible && A.group.children.length === 0, 'group empty and hidden');
ok(disposed === cars + men, 'all models disposed: ' + disposed + ' / ' + (cars + men));
console.log('all gone after ' + t2.toFixed(0) + ' s');

// ---- dismissal in the middle of the arrival (cars driving in, drivers walking, some still waiting)
cars = men = disposed = 0;
A.start();
let t3 = 0;
while (t3 < 400 && !A.phases.includes('walkIn')) { A.update(dt); t3 += dt; }
ok(A.phases.includes('driveIn') || A.phases.includes('wait') || A.phases.includes('park'), 'mid-arrival state has cars still coming');
A.dismiss();
let t4 = 0;
while (A.active && t4 < 800) { A.update(dt); t4 += dt; }
ok(!A.active, 'mid-arrival dismissal: all gone, t=' + t4.toFixed(0));
ok(disposed === cars + men, 'mid-arrival: all models disposed ' + disposed + ' / ' + (cars + men));

// every car has at least 4 wheels (the front pair steers) and fits a bay
import { wheelDefs } from '../src/vehicles/VehicleSpec';
for (const c of ARRIVAL_CARS) ok(wheelDefs(SPECS[c.car]).length >= 4, c.car + ': 4 wheels');
ok(planArrivals(mulberry32(1), 2).length === 2, 'planArrivals(count)');

// ---- start again / restart while active / dispose
A.start(); A.update(dt); A.start();
ok(A.count === ARRIVAL_CARS.length, 'restart replaces the actors');
A.dispose();
ok(!A.active && A.group.children.length === 0, 'dispose clears');

if (fails) { console.error(fails + ' FAIL'); process.exit(1); }
console.log('evlab arrivals: all ok');
