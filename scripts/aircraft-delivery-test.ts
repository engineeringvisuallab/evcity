// Aircraft factory DELIVERY: the aeroplane that rolls out of the factory door is handed over to the airplane manager at the exit point, taxies along the factory
// strip and the old airport's taxiway, takes off, flies to the sea airport, lands and stands at a gate. Two delivery planes take turns, their runway time is booked
// long before, and the factory's line and the manager run on ONE clock (the manager's).
// Run: npx tsx scripts/aircraft-delivery-test.ts
import * as THREE from 'three';
import { AirplaneManager } from '../src/airplane/AirplaneManager';
import { DELIVERY_GATES, DeliveryPlanner } from '../src/airplane/FactoryDelivery';
import { createAirportOps } from '../src/airplane/AirplaneOps';
import { AIRPORT_POS, SEA_AIRPORT_POS } from '../src/airport/AirportSite';
import { createAirportPlan, worldToLocal } from '../src/airport/AirportPlan';
import { CYCLE, L } from '../src/engineering/mechanical/aircraft-factory/layout';
import { EXIT_X, planePose, rolloutTime } from '../src/engineering/mechanical/aircraft-factory/schedule';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
if (!(globalThis as Record<string, unknown>).document) (globalThis as Record<string, unknown>).document = { createElement: stubEl };
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

// a terrain with just what the manager reads: the two airports and the factory site (a stand-in for the real terrain)
const FLOOR_OLD = 40, FLOOR_SEA = 5;
const oldPlan = createAirportPlan({ ...AIRPORT_POS, groundY: FLOOR_OLD });
const seaPlan = createAirportPlan({ ...SEA_AIRPORT_POS, groundY: FLOOR_SEA });
const SITE_X = 3000, SITE_Z = -3740;
const terrain = {
  airport: { plan: oldPlan, floorY: FLOOR_OLD },
  airportSea: { plan: seaPlan, floorY: FLOOR_SEA },
  infra: [{ id: 'aircraft', toWorld: (lx: number, lz: number, out: { x: number; z: number }) => { out.x = SITE_X + lx; out.z = SITE_Z + lz; return out; } }],
};
const root = new THREE.Group();
const mgr = new AirplaneManager({ root, terrain: terrain as never, playerWorld: (o) => o.set(SITE_X - 200, 60, SITE_Z - 60) });
interface Craft { id: string; mode: string; job: { type: string } | null; airport: { id: string }; pose: { x: number; y: number; z: number; heading: number }; standId: string }
const priv = mgr as unknown as { delivery: Craft[]; craft: Craft[]; statics: unknown[]; slots: { ap: { id: string }; start: number; end: number; owner: Craft }[] };
const dl = priv.delivery;

// ---- set-up
ok(dl.length === 2 && dl.every((a) => a.mode === 'away'), 'two delivery planes wait (hidden) for their turn');
ok(dl[0].standId === DELIVERY_GATES[0] && dl[1].standId === DELIVERY_GATES[1] && DELIVERY_GATES[0] !== DELIVERY_GATES[1], `they stand at two different sea-airport gates (${DELIVERY_GATES.join(', ')})`);
ok(priv.statics.length === 1, 'the decoration planes of those two sea gates are gone (only the old airport\'s one stays)');
const early = priv.slots.filter((s) => dl.includes(s.owner));
ok(early.length >= 8 && Math.min(...early.map((s) => s.start)) > rolloutTime(0), `runway time of the first ${early.length / 2} deliveries is booked at the very start (before the first aeroplane exists)`);

// ---- what the factory and the manager agree on
const oldOps = createAirportOps('old', oldPlan, FLOOR_OLD), seaOps = createAirportOps('sea', seaPlan, FLOOR_SEA);
const exitW = { x: SITE_X + L.exit.x, z: SITE_Z + L.exit.z }, cornerW = { x: SITE_X + L.corner.x, z: SITE_Z + L.corner.z };
const planner = new DeliveryPlanner(oldOps, seaOps, exitW, cornerW, 700, DELIVERY_GATES[0]);
ok(Math.abs(planner.plan.heading - Math.PI) < 0.01 && planner.plan.route[0].x === exitW.x, 'the plane starts at the factory exit point, heading west');
const total = planner.duration;
ok(total + 80 < 2 * CYCLE, `one delivery (${total.toFixed(0)} s) plus the stand-by time fits in two cycles, so two planes are enough (${(2 * CYCLE).toFixed(0)} s)`);

// ---- run 2600 s of game time and watch
const onRunway = (ap: { id: string }, a: Craft): boolean => {
  const plan = ap.id === 'old' ? oldPlan : seaPlan;
  const l = worldToLocal(plan.site, a.pose.x, a.pose.z);
  return a.mode === 'flight' && Math.abs(l.x) < plan.runway.length / 2 + 50 && Math.abs(l.z) < 40 && a.pose.y - (ap.id === 'old' ? FLOOR_OLD : FLOOR_SEA) < 25;
};
const start = new Map<number, { craft: string; t: number; x: number; z: number; h: number }>();
const prevMode = new Map<string, string>();
const marks: Record<string, Record<string, number>> = { delivery0: {}, delivery1: {}, shuttle: {} };
let t = 0, runwayClash = 0, slotClash = 0, nanPose = false, prevDone = 0;
const mark = (id: string, key: string): void => { if (marks[id] && marks[id][key] === undefined) marks[id][key] = t; };
const STEP = 0.1, END = 2600;
let startedCount = 0;
while (t < END) {
  mgr.update(STEP);
  t += STEP;
  for (const a of priv.craft) {
    const m = prevMode.get(a.id);
    if (a.id.startsWith('delivery') && m === 'away' && a.mode === 'taxi-out') {
      start.set(startedCount++, { craft: a.id, t, x: a.pose.x, z: a.pose.z, h: a.pose.heading });
    }
    prevMode.set(a.id, a.mode);
    if (![a.pose.x, a.pose.y, a.pose.z, a.pose.heading].every(Number.isFinite)) nanPose = true;
  }
  // per-craft milestones (first time only, by delivery number k)
  if (Math.floor(t) !== prevDone) {
    prevDone = Math.floor(t);
    for (const ap of [oldOps, seaOps]) {
      const busy = priv.craft.filter((a) => onRunway(ap, a));
      if (busy.length > 1 && busy.some((a) => a.id.startsWith('delivery'))) runwayClash++;
    }
    if (Math.floor(t) % 25 === 0) {
      const byAp = priv.slots;
      for (let i = 0; i < byAp.length; i++) for (let j = i + 1; j < byAp.length; j++) {
        const a = byAp[i], b = byAp[j];
        if (a.ap === b.ap && a.owner !== b.owner && a.start < b.end - 1 && b.start < a.end - 1 && (dl.includes(a.owner) || dl.includes(b.owner))) slotClash++;
      }
    }
  }
}
ok(!nanPose, 'no plane position ever became NaN');
ok(startedCount >= 8, `${startedCount} aeroplanes were handed over in ${END} s`);
let timeOk = true, posOk = true, altOk = true;
for (let k = 0; k < startedCount; k++) {
  const s = start.get(k)!;
  if (Math.abs(s.t - rolloutTime(k)) > 0.25) timeOk = false;
  if (Math.hypot(s.x - exitW.x, s.z - exitW.z) > 1.5 || Math.cos(s.h) > -0.99) posOk = false;
  if (s.craft !== `delivery${k % 2}`) altOk = false;
}
ok(timeOk, `the hand-over happens exactly when the factory's body reaches the exit (every ${CYCLE} s from ${rolloutTime(0).toFixed(0)} s)`);
ok(posOk, `the new aeroplane appears on the exit point of the factory (${exitW.x}, ${exitW.z}), nose west: the same place the factory's body (x = ${EXIT_X}) vanishes`);
ok(altOk, 'the two delivery planes take turns');
ok(planePose(0, rolloutTime(0) - 0.5).x < EXIT_X + 8 || planePose(1, rolloutTime(0) - 0.5).x < EXIT_X + 8 || planePose(2, rolloutTime(0) - 0.5).x < EXIT_X + 8 || planePose(3, rolloutTime(0) - 0.5).x < EXIT_X + 8 || planePose(4, rolloutTime(0) - 0.5).x < EXIT_X + 8, 'at that moment a factory body is standing there');
ok(runwayClash === 0, `no delivery plane ever shared a runway with another plane (${runwayClash} clashes)`);
ok(slotClash === 0, `no booked runway time of a delivery overlaps another plane's (${slotClash} overlaps)`);

// the whole journey of the first two deliveries, by their final state: each ended at its own sea gate (or was already taken away by the airline)
const sea = (id: string): Craft => dl.find((a) => a.id === id)!;
ok(dl.every((a) => ['parked', 'away', 'taxi-in', 'flight', 'taxi-out'].includes(a.mode)), 'the delivery planes are still in a sane state after 2600 s');
// journey check by a second, dedicated run: one delivery from the start to the gate
const root2 = new THREE.Group();
const m2 = new AirplaneManager({ root: root2, terrain: terrain as never, playerWorld: (o) => o.set(SITE_X - 200, 60, SITE_Z - 60) });
const p2 = m2 as unknown as { delivery: Craft[] };
const d0 = p2.delivery[0];
const seen: string[] = [];
let t2 = 0, atGate = -1, landedAt: string | null = null, away2 = -1, gatePose = { x: 0, z: 0 };
while (t2 < rolloutTime(0) + CYCLE * 2 - 15) { // up to just before the plane's next turn
  m2.update(STEP);
  t2 += STEP;
  const lbl = d0.mode + (d0.mode === 'flight' || d0.mode === 'taxi-in' ? `@${d0.airport.id}` : '');
  if (seen[seen.length - 1] !== lbl) seen.push(lbl);
  if (d0.mode === 'parked' && atGate < 0) { atGate = t2; landedAt = d0.airport.id; gatePose = { x: d0.pose.x, z: d0.pose.z }; }
  if (atGate > 0 && d0.mode === 'away' && away2 < 0) away2 = t2;
}
ok(seen.join(' > ') === 'away > taxi-out > flight@old > taxi-in@sea > parked > away', `journey: ${seen.join(' > ')}`);
ok(landedAt === 'sea', 'it ends at the sea airport');
const gate = seaOps.stands[DELIVERY_GATES[0]];
ok(atGate > 0 && Math.hypot(gatePose.x - gate.x, gatePose.z - gate.z) < 3, `it stood exactly at gate0 of the sea airport (${Math.hypot(gatePose.x - gate.x, gatePose.z - gate.z).toFixed(1)} m off), then an airline took it away`);
ok(atGate - rolloutTime(0) < total && atGate - rolloutTime(0) > total * 0.6, `delivery took ${(atGate - rolloutTime(0)).toFixed(0)} s (the plan allows at most ${total.toFixed(0)} s)`);
ok(away2 > 0 && away2 - rolloutTime(0) < 2 * CYCLE - 10, `the plane is free again ${(2 * CYCLE - (away2 - rolloutTime(0))).toFixed(0)} s before its next turn`);
void sea;

// other planes are not starved: the shuttle still flies
let shuttleFlew = false;
const shuttle = priv.craft.find((a) => a.id === 'shuttle')!;
const root3 = new THREE.Group();
const m3 = new AirplaneManager({ root: root3, terrain: terrain as never, playerWorld: (o) => o.set(SITE_X - 200, 60, SITE_Z - 60) });
const p3 = m3 as unknown as { craft: Craft[] };
const sh3 = p3.craft.find((a) => a.id === 'shuttle')!;
void shuttle;
for (let tt = 0; tt < 1500; tt += STEP) { m3.update(STEP); if (sh3.mode === 'flight' || sh3.mode === 'taxi-out') shuttleFlew = true; }
ok(shuttleFlew, 'the shuttle still gets its runway time between the deliveries');

console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
