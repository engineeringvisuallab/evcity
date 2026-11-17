// FACTORY DELIVERY (pure numbers, no three.js): what happens to an aeroplane after it rolls out of the aircraft factory's door.
// It is handed over to the airplane manager at the exit point, taxies along the factory's strip and the old airport's taxiway to the runway, takes off,
// flies to the sea airport, lands, taxies in and stands at a gate. Here: the route, the flight plan, how long every part takes, and the runway time slots
// the whole delivery needs (so the manager can book them long BEFORE the aeroplane is built and no other plane takes that runway time).
import { PLANE_PERF, PlaneFlight, buildFlightPlan, type PlanePerf, type RunwayEnd, type Waypoint } from './AirplaneLogic';
import { TaxiMover, type AirportOps, type Pt } from './AirplaneOps';

export interface Slot { start: number; end: number }

/** The sea-airport gates the two delivery planes use, and how long a delivered plane stands there before an airline takes it away (s). */
export const DELIVERY_GATES = ['gate0', 'gate3'] as const;
export const DELIVERY_PARK = 80;
/** Taxi speed (m/s) and turning radius (m) of an airliner (same as AirplaneManager). */
const TAXI_SPEED = 14;
const TAXI_RADIUS = 28;

export interface DeliveryPlan {
  /** taxi route from the exit point (world) to the take-off start */
  route: Pt[];
  /** heading of the plane at the exit point (towards the first corner) */
  heading: number;
  plan: Waypoint[];
  dep: RunwayEnd;
  arr: RunwayEnd;
  /** seconds: taxi to the runway, then (from the start of the plan) lift-off, touch-down, end of the landing roll */
  taxiT: number;
  liftT: number;
  touchT: number;
  doneT: number;
  /** seconds: taxi from the runway to the gate (an estimate) */
  taxiInT: number;
}

/** Flight time (s) from the start of the plan to lift-off, touchdown and the end, simulated at a coarse step with the same logic as the real flight. */
export function simulateFlight(plan: Waypoint[], heading: number, perf: PlanePerf): { liftT: number; touchT: number; doneT: number } {
  const f = new PlaneFlight(plan, heading, perf);
  let t = 0, lift = -1, touch = -1;
  while (!f.state.done && t < 1200) {
    f.step(0.5);
    t += 0.5;
    const ph = f.state.phase;
    if (lift < 0 && (ph === 'climb' || f.airborneStart)) lift = t;
    if (touch < 0 && (ph === 'flare' || ph === 'landing-roll')) touch = t;
  }
  return { liftT: lift < 0 ? t : lift, touchT: touch < 0 ? t : touch, doneT: t };
}

export class DeliveryPlanner {
  readonly plan: DeliveryPlan;
  constructor(readonly old: AirportOps, readonly sea: AirportOps, exit: Pt, corner: Pt, cruiseAlt: number, gateId: string = DELIVERY_GATES[0]) {
    const dep = old.takeoffEnd(-1); // the old airport: always take off towards the west (over the low land, away from the hills in the east)
    const arr = sea.landingEnd(1); // the sea airport is approached from the east, travelling west
    const route = old.taxiFrom(exit, corner, -1);
    const heading = Math.atan2(corner.z - exit.z, corner.x - exit.x);
    const plan = buildFlightPlan(dep, arr, PLANE_PERF, { cruiseAlt });
    const taxiT = TaxiMover.duration(route, heading, TAXI_SPEED, { radius: TAXI_RADIUS }) + 5;
    const sim = simulateFlight(plan, dep.heading, PLANE_PERF);
    const stand = sea.stands[gateId];
    const inRoute = sea.taxiIn({ x: arr.x - Math.cos(arr.heading) * (arr.length - 300), z: arr.z - Math.sin(arr.heading) * (arr.length - 300) }, 1, stand);
    const taxiInT = TaxiMover.duration(inRoute, arr.heading, TAXI_SPEED, { radius: TAXI_RADIUS }) + 10;
    this.plan = { route, heading, plan, dep, arr, taxiT, ...sim, taxiInT };
  }

  /** Runway time slots (game time) of the delivery whose plane is handed over at time T: take-off at the old airport, landing at the sea airport. */
  slots(T: number): { dep: Slot; arr: Slot } {
    const p = this.plan;
    return {
      dep: { start: T + p.taxiT - 10, end: T + p.taxiT + p.liftT + 20 },
      arr: { start: T + p.taxiT + p.touchT - 50, end: T + p.taxiT + p.doneT + 40 }, // the same margins as every other flight
    };
  }

  /** Seconds from the hand-over until the plane stands at the gate (the whole delivery without the stand-by time). */
  get duration(): number {
    const p = this.plan;
    return p.taxiT + p.doneT + p.taxiInT;
  }
}
