// AI STATION VISIT (step 2): the path an AI car follows from the road lane into a fuel station / charge point, to the pump, and back to the lane. PURE geometry
// (no three.js, no physics), in the SITE FRAME of StationLayout.ts: origin = lot centre, local +z points at the road, local +x runs along it, and the traffic that
// serves the site drives along +x (the lot is on its LEFT, left-hand traffic). The car leaves the kerb lane at local z = `zl` (the lane centre).
//
//  FUEL STATION (32 x 26 m): left turn off the lane into the entry lane (local x = -8), down to the road-side half of the lot, left turn, along the ROAD-SIDE
//    face of the pump island (z = PUMP_Z, nothing but the kerb of the island and the canopy columns are near; the corridor between the islands is NOT used, so the
//    path never gets close to a solid part), stop at the pump (PUMP_X, PUMP_Z), right turn into the exit lane (x = +8), up to the road, left turn onto the lane.
//  CHARGE POINT (8 x 4 m, or a 12 x 3.5 m bus bay): a long smooth S-curve from the lane to the middle of the bay (z = 0), stop at (0, 0), S-curve back.
import { STATION_LANE } from '../parking/StationLayout';

export interface DetourPt {
  /** Local frame position (m). */
  x: number;
  z: number;
  /** Speed (m/s) the path allows here. */
  v: number;
  /** The point where the car stands while it fills / charges (exactly one per plan). */
  pump?: true;
}

export interface DetourPlan {
  pts: DetourPt[];
  /** Local x of the first / last point (both on the lane, z = zl): where the path leaves and rejoins the road. */
  xStart: number;
  xEnd: number;
  /** Where the car stands. */
  stop: { x: number; z: number };
}

/** The fuel-station pump position across the lot: the road-side face of the pump island (island kerb edge z = 3.7, car half width ~1). */
export const PUMP_Z = 6.0;
/** Where the car stands along the road: a car (4-5 m) centred here covers the pump at x = +1.8; the left turn into the lot ends at x = -4, so there is a straight run before it. */
export const PUMP_X = 2.0;
const R_IN = 6; // radius of the turn off / onto the road
const R_PUMP = 4; // radius of the two turns inside the lot
const STEP = 3;

function arc(out: DetourPt[], cx: number, cz: number, r: number, a0: number, a1: number, v: number): void {
  const n = Math.max(3, Math.ceil((r * Math.abs(a1 - a0)) / 1.5));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), v });
  }
}

export function fuelDetour(zl: number): DetourPlan {
  const out: DetourPt[] = [];
  const X = STATION_LANE.x;
  const zc = PUMP_Z + R_PUMP; // centre height of the two inner turns
  const x0 = -X - R_IN;
  for (let x = x0 - 12; x < x0 - 0.5; x += 4) out.push({ x, z: zl, v: 9 });
  arc(out, x0, zl - R_IN, R_IN, Math.PI / 2, 0, 5); // left turn off the lane: heading +x -> -z, ends at (-X, zl - R_IN)
  for (let z = zl - R_IN - STEP; z > zc + 1; z -= STEP) out.push({ x: -X, z, v: 6 });
  arc(out, -X + R_PUMP, zc, R_PUMP, Math.PI, 1.5 * Math.PI, 4); // left turn: heading -z -> +x, ends at (-X + R_PUMP, PUMP_Z)
  out.push({ x: -1, z: PUMP_Z, v: 3 });
  out.push({ x: PUMP_X, z: PUMP_Z, v: 0, pump: true });
  arc(out, X - R_PUMP, zc, R_PUMP, 1.5 * Math.PI, 2 * Math.PI, 4); // right turn: heading +x -> +z, ends at (X, zc)
  for (let z = zc + STEP; z < zl - R_IN - 0.5; z += STEP) out.push({ x: X, z, v: 6 });
  arc(out, X + R_IN, zl - R_IN, R_IN, Math.PI, Math.PI / 2, 5); // left turn onto the lane: heading +z -> +x, ends at (X + R_IN, zl)
  const x1 = X + R_IN;
  for (let x = x1 + 4; x <= x1 + 12 + 0.01; x += 4) out.push({ x, z: zl, v: 9 });
  return { pts: out, xStart: out[0].x, xEnd: out[out.length - 1].x, stop: { x: PUMP_X, z: PUMP_Z } };
}

export function chargeDetour(hw: number, zl: number): DetourPlan {
  const out: DetourPt[] = [];
  const L = 40;
  const xs = -hw - 9 - L;
  const xe = -hw - 9; // a 12 m bus must be straight before its nose reaches the canopy column at the bay end
  const n = Math.round(L / STEP);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ x: xs + L * u, z: zl * (1 - (1 - Math.cos(Math.PI * u)) / 2), v: 8 });
  }
  for (let x = xe + STEP; x < -0.5; x += STEP) out.push({ x, z: 0, v: 3 });
  out.push({ x: 0, z: 0, v: 0, pump: true });
  for (let x = STEP; x < hw + 9 - 0.5; x += STEP) out.push({ x, z: 0, v: 3 });
  const x2 = hw + 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ x: x2 + L * u, z: zl * ((1 - Math.cos(Math.PI * u)) / 2), v: 8 });
  }
  return { pts: out, xStart: xs, xEnd: x2 + L, stop: { x: 0, z: 0 } };
}

export function detourPlan(kind: 'fuel' | 'charge', hw: number, zl: number): DetourPlan {
  return kind === 'fuel' ? fuelDetour(zl) : chargeDetour(hw, zl);
}
