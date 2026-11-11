// EVLab Step 10: routes and timing of the people who come to the presentation by cycle (pure data + maths, no three.js, so it can be tested in node).
// A cyclist rides in from the F6 highway along the entrance avenue, over the south bridge, into the plaza, east of the fountain, and in along his own bay of
// the cycle rack (EVLabCycleRack), nose to the north. He dismounts, walks the short way to the portal and goes in.
// When the mission is over everything runs backwards: he comes out, walks back, gets on, pushes the cycle back out of its bay, turns it round and rides away.
// Building-local metres (x east, z south). Heading = yaw about +y, 0 = nose to +z (south), PI = nose to -z (north). The game drives on the left.
import { CYCLE_SLOTS, type CycleSlot } from './EVLabCycleRack';
import { makeRoute, roundCorners, type P2, type Route } from './EVLabArrivalPath';

/** Where the avenue meets the highway (local z 253 = world z -7 = EVLAB_ROAD.endZ) and the lanes of a cycle (m from the avenue's centre line). */
export const AVENUE = { z0: 253, lane: 3.2 };
/** The plaza: the cycles ride along z = JUNC (eastbound lane north of it, westbound lane south of it) and up x = LEG (northbound lane west of it, southbound lane east of it). */
export const PLAZA_RIDE = { junctionZ: 120, laneZ: 2, legX: 36.5, laneX: 1, /** z of the row where the cycles turn into their bays */ rowZ: 72, outRowZ: 69.6, /** z where the avenue enters the plaza */ plazaZ: 132 };
/** Distance the cycle is pushed back out of its bay before it turns round. */
export const BACK_LEN = 1.6;
const CORNER = 2.4;
/** The door of the building the people walk to (the same as the drivers of Step 8). */
export const CYCLE_DOOR: P2 = [0, 59.5];

/** Which bays the cyclists take (west end first, near the portal) and the paint of each cycle (index into CYCLE_PAINT). */
export const CYCLISTS: ReadonlyArray<{ slot: string; paint: number }> = [
  { slot: 'R3', paint: 0 }, { slot: 'R6', paint: 4 }, { slot: 'R1', paint: 2 }, { slot: 'R8', paint: 1 }, { slot: 'R4', paint: 5 },
];

export interface CyclistPlan {
  slot: CycleSlot;
  paint: number;
  inRoute: Route;
  /** Distance along inRoute where the cycle enters the plaza (it slows down there). */
  slowFrom: number;
  /** The way out starts BACK_LEN behind the bay (heading south) and ends at the highway. */
  outRoute: Route;
  /** Distance along outRoute where the cycle has left the plaza (it speeds up there). */
  fastFrom: number;
  /** From the cycle to the door. */
  walk: Route;
  delay: number;
  cruise: number;
  walkSpeed: number;
  leaveDelay: number;
}

/** First distance along a route where z drops below `z` going in, or the last distance where z is still below `z` going out. */
function distAtZ(r: Route, z: number, going: 'in' | 'out'): number {
  if (going === 'in') {
    for (let i = 0; i < r.pts.length; i++) if (r.pts[i][1] <= z) return r.cum[i];
    return r.len;
  }
  for (let i = r.pts.length - 1; i >= 0; i--) if (r.pts[i][1] <= z) return r.cum[i];
  return 0;
}

export function inRouteOf(slot: CycleSlot): Route {
  const { lane } = AVENUE, P = PLAZA_RIDE;
  return makeRoute(roundCorners([
    [-lane, AVENUE.z0], [-lane, P.junctionZ - P.laneZ], [P.legX - P.laneX, P.junctionZ - P.laneZ], [P.legX - P.laneX, P.rowZ], [slot.x, P.rowZ], [slot.x, slot.z],
  ], CORNER, 0.5));
}

export function outRouteOf(slot: CycleSlot): Route {
  const { lane } = AVENUE, P = PLAZA_RIDE;
  return makeRoute(roundCorners([
    [slot.x, slot.z + BACK_LEN], [slot.x, P.outRowZ], [P.legX + P.laneX, P.outRowZ], [P.legX + P.laneX, P.junctionZ + P.laneZ], [lane, P.junctionZ + P.laneZ], [lane, AVENUE.z0],
  ], CORNER, 0.5));
}

export function walkOf(slot: CycleSlot): Route {
  // behind the cycle (south of it) in the aisle, west along the plaza (north of the row of lamps at z 68), then to the door
  return makeRoute(roundCorners([[slot.x, slot.z + 2.0], [slot.x, 70.6], [12, 70.6], [6.5, 62.5], CYCLE_DOOR], 1.6, 0.7));
}

export function planCyclists(r: () => number, count = CYCLISTS.length): CyclistPlan[] {
  return CYCLISTS.slice(0, Math.max(0, Math.min(count, CYCLISTS.length))).map((c, i) => {
    const slot = CYCLE_SLOTS.find((s) => s.id === c.slot);
    if (!slot) throw new Error('EVLab cyclists: no such bay ' + c.slot);
    const inRoute = inRouteOf(slot), outRoute = outRouteOf(slot);
    return {
      slot, paint: c.paint, inRoute, outRoute, walk: walkOf(slot),
      slowFrom: distAtZ(inRoute, PLAZA_RIDE.plazaZ, 'in'),
      fastFrom: distAtZ(outRoute, PLAZA_RIDE.plazaZ, 'out'),
      delay: 3 + i * 7 + r() * 3,
      cruise: 4.3 + r() * 0.3,
      walkSpeed: 1.6 + r() * 0.4,
      leaveDelay: 3 + r() * 10,
    };
  });
}

/** Speed (m/s) of a cycle riding in at distance s: cruise on the avenue, slower on the plaza, gently to a stop in the bay. */
export function rideInSpeed(s: number, len: number, cruise: number, slowFrom: number): number {
  const c = s < slowFrom ? cruise : Math.min(cruise, 3.0);
  return Math.min(c, 0.5 + Math.sqrt(2 * 1.5 * Math.max(0, len - s)));
}

/** Speed of a cycle riding out at distance s: pulls away gently, slow on the plaza, cruise on the avenue. */
export function rideOutSpeed(s: number, cruise: number, fastFrom: number): number {
  const c = s < fastFrom ? Math.min(cruise, 3.0) : cruise;
  return Math.min(c, 0.8 + Math.sqrt(2 * 1.3 * s));
}

