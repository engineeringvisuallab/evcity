// EVLab Step 8: the routes and the timing of the people who come to the presentation by car (pure data + maths, no three.js, so it can be tested in node).
// A car drives in from the F6 highway along the entry road, turns into an aisle and parks NOSE-IN in its bay. The driver gets out, walks along the aisle,
// through the walkway gap of row A, over the east promenade and the east bridge, along the ring road and across the plaza to the portal, and goes in.
// When the mission is over everything runs backwards: the driver comes out of the portal, walks back, gets in, the car reverses out and drives away.
// Building-local metres (x east, z south), same frame as EVLabParking. Heading = yaw about +y, 0 = nose to +z (south), PI/2 = +x (east).
import { AISLE_X, BAY, CROSS_Z, DRIVE, LINK, LOT, SLOTS, type Slot } from './EVLabParking';

export type P2 = readonly [number, number];
export interface Route { pts: P2[]; cum: number[]; len: number }

/** Cumulative lengths of a polyline. */
export function makeRoute(pts: P2[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

/** Round every corner of a polyline with an arc of (at most) `radius` m; the arc never uses more than half of a leg, so short legs get tighter arcs. */
export function roundCorners(pts: readonly P2[], radius: number, step = 0.7): P2[] {
  const out: P2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], C = pts[i + 1];
    let ux = A[0] - B[0], uz = A[1] - B[1], vx = C[0] - B[0], vz = C[1] - B[1];
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) { out.push(B); continue; }
    ux /= lu; uz /= lu; vx /= lv; vz /= lv;
    const cosT = Math.max(-1, Math.min(1, ux * vx + uz * vz)); // angle between the two legs
    const theta = Math.acos(cosT);
    if (theta > Math.PI - 1e-3 || theta < 1e-3) { out.push(B); continue; } // straight on / a U-turn: leave it
    const half = Math.tan(theta / 2);
    const t = Math.min(radius / half, 0.5 * Math.min(lu, lv)); // tangent length
    const r = t * half;
    const t1: P2 = [B[0] + ux * t, B[1] + uz * t], t2: P2 = [B[0] + vx * t, B[1] + vz * t];
    let bx = ux + vx, bz = uz + vz;
    const bl = Math.hypot(bx, bz);
    bx /= bl; bz /= bl;
    const cd = r / Math.sin(theta / 2);
    const cx = B[0] + bx * cd, cz = B[1] + bz * cd;
    let a0 = Math.atan2(t1[1] - cz, t1[0] - cx);
    const a1 = Math.atan2(t2[1] - cz, t2[0] - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(da) * r) / step));
    for (let k = 0; k <= n; k++) { const a = a0 + (da * k) / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface At { x: number; z: number; heading: number }

/** Position and heading (direction of travel along the route) at distance s (clamped). */
export function sampleRoute(r: Route, s: number): At {
  const q = Math.max(0, Math.min(r.len, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < q) i++;
  const a = r.pts[i - 1], b = r.pts[i], seg = r.cum[i] - r.cum[i - 1] || 1;
  const t = (q - r.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

// ------------------------------------------------------------------------------------------------ the plan
/** Which cars come (VehicleId strings, all of them fit a 4.8 m bay) and which bays they take: spread over the four rows, near the entrance first. */
export const ARRIVAL_CARS: ReadonlyArray<{ slot: string; car: 'sedan' | 'jeep' | 'hypercar' | 'evhypar' | 'auto' }> = [
  { slot: 'B26', car: 'sedan' },
  { slot: 'C24', car: 'jeep' },
  { slot: 'D26', car: 'evhypar' },
  { slot: 'A24', car: 'hypercar' },
  { slot: 'B20', car: 'sedan' },
];

/** Lane offset from the entry road's centre line (the game drives on the left: the car going NORTH keeps to the west lane). */
export const LANE = 2.5;
export const ENTRY_LEN = DRIVE.z1 - DRIVE.z0;
const CORNER = 3.0; // radius of the turns of a car (m)

export interface Arrival {
  slot: Slot;
  car: ARRIVAL_CAR_ID;
  /** Heading of the parked car: nose in = away from the aisle (the slot's yaw points from the back of the bay to the aisle). */
  parkYaw: number;
  aisleX: number;
  inRoute: Route;
  /** The way out of the bay, in reverse: straight back to the aisle centre (heading stays), then turn and drive on along `outRoute`. */
  backLen: number;
  outRoute: Route;
  /** The driver's way from the car to the portal (the way back = the same route walked backwards). */
  walk: Route;
  /** Seconds after the mission starts when the car leaves the highway; walking speed (m/s); seconds the driver stays inside after the dismissal. */
  delay: number;
  walkSpeed: number;
  leaveDelay: number;
}
export type ARRIVAL_CAR_ID = (typeof ARRIVAL_CARS)[number]['car'];

/** The door of the building the drivers walk to (south wall of the podium, centre of the portal) and the stretch of plaza in front of it. */
export const PORTAL_DOOR: P2 = [0, 59.5];

export function walkRoute(slot: Slot, aisleX: number, face: 1 | -1): Route {
  const zs = slot.z;
  const start: P2 = [slot.x + face * (BAY.d / 2 + 0.7), zs + 1.2]; // beside the rear of the parked car, in the aisle
  const pts: P2[] = [start, [aisleX, zs + 1.2]];
  if (aisleX === AISLE_X[0]) pts.push([aisleX, LINK.z]);
  else { pts.push([aisleX, CROSS_Z - 1.5], [AISLE_X[0], CROSS_Z - 1.5], [AISLE_X[0], LINK.z]); }
  pts.push([LOT.x0 - 0.5, LINK.z]);
  // east promenade + east bridge (straight, z = LINK.z) to the ring road, along the ring road to the plaza, across the plaza to the portal
  pts.push([100, LINK.z], [100, 78], [40, 78], [4, 66], PORTAL_DOOR);
  return makeRoute(roundCorners(pts, 2.2, 1));
}

export function planArrivals(r: () => number, count = ARRIVAL_CARS.length): Arrival[] {
  return ARRIVAL_CARS.slice(0, Math.max(0, Math.min(count, ARRIVAL_CARS.length))).map((c, i) => {
    const slot = SLOTS.find((s) => s.id === c.slot);
    if (!slot) throw new Error('EVLab arrivals: no such bay ' + c.slot);
    const face: 1 | -1 = Math.sin(slot.yaw) > 0 ? 1 : -1; // +1: the aisle is EAST of the bay
    const aisleX = slot.row === 'A' || slot.row === 'B' ? AISLE_X[0] : AISLE_X[1];
    const xin = DRIVE.x - LANE, xout = DRIVE.x + LANE;
    const zs = slot.z;
    const inRoute = makeRoute(roundCorners([[xin, DRIVE.z1], [xin, CROSS_Z], [aisleX, CROSS_Z], [aisleX, zs], [slot.x, zs]], CORNER));
    const outRoute = makeRoute(roundCorners([[aisleX, zs], [aisleX, CROSS_Z], [xout, CROSS_Z], [xout, DRIVE.z1]], CORNER));
    return {
      slot, car: c.car, parkYaw: slot.yaw + Math.PI, aisleX, inRoute,
      backLen: Math.abs(aisleX - slot.x), outRoute,
      walk: walkRoute(slot, aisleX, face),
      delay: i * 4.5 + r() * 3,
      walkSpeed: 1.7 + r() * 0.4,
      leaveDelay: 2 + r() * 10,
    };
  });
}

// ------------------------------------------------------------------------------------------------ speeds
/** Speed (m/s) of a car coming in at distance s of a route of length len: fast on the entry road, slow in the lot, gently to a stop at the end. */
export function speedIn(s: number, len: number): number {
  const cruise = s < ENTRY_LEN - 12 ? 11 : 4.2;
  const rem = Math.max(0, len - s);
  return Math.min(cruise, 0.7 + Math.sqrt(2 * 2.2 * rem));
}

/** Speed of a car leaving (distance s along outRoute): pulls away gently, slow in the lot, fast on the entry road. */
export function speedOut(s: number, len: number): number {
  const cruise = len - s > ENTRY_LEN - 12 ? 4.2 : 11;
  return Math.min(cruise, 1.2 + Math.sqrt(2 * 2.0 * s));
}
