// J9-c: where the 300 ft junction takes the ring's own furniture away (street lights, median and its planting, roadside trees). Pure math, no three.js.
// Frame = J300_FRAME (origin = roundabout centre, u along the ring, v to the LEFT). Numbers: box u -67..67 (J7-A), ramps from J5 (nose u +-240, E-out to +645, E-in to +447, W-out and W-in to -435).
// E-out and W-out lie on the -v side, E-in and W-in on the +v side. Ring lamps stand at v +-24.2 = on the ramp inner edge, so they would stand on a ramp, a wall or the aux lane.
import { J300_FRAME as F } from './J300Geometry';

const COS = Math.cos(F.yaw);
const SIN = Math.sin(F.yaw);

/** World -> J300 local (u along the ring, v left of it). */
export function j300Local(x: number, z: number): { u: number; v: number } {
  const dx = x - F.ox, dz = z - F.oz;
  return { u: dx * COS + dz * SIN, v: dx * SIN - dz * COS };
}

/** Box half length (J7-A) and the half width that holds the ring carriageways + walls. */
export const J300_ZONE = { boxHalfU: 67, boxHalfV: 26, ringEdgeV: 22.1, minOuterV: 20, maxOuterV: 60, tail: 25, uWest: -435, uEastLeft: 447, uEastRight: 645 } as const;

/** Inside the underpass box rectangle, grown by `margin` m (the ring median, its planting and the crossings stop before it). */
export function j300InBox(x: number, z: number, margin: number): boolean {
  const { u, v } = j300Local(x, z);
  return Math.abs(u) < J300_ZONE.boxHalfU + margin && Math.abs(v) < J300_ZONE.boxHalfV + margin;
}

/**
 * Outside the ring edge on the stretch where a ramp, its wall, an aux lane or a taper stands (street lights, roadside trees and props must not stand there).
 * +v side: u -435 .. +447, -v side: u -435 .. +645, each minus the last 25 m of the taper (it is under 1.2 m wide there). The box rectangle counts too.
 */
export function j300RampSide(x: number, z: number, margin: number): boolean {
  const { u, v } = j300Local(x, z);
  const av = Math.abs(v);
  if (av < J300_ZONE.minOuterV - margin || av > J300_ZONE.maxOuterV + margin) return false;
  const t = J300_ZONE.tail;
  const lo = J300_ZONE.uWest + t - margin;
  const hi = (v >= 0 ? J300_ZONE.uEastLeft : J300_ZONE.uEastRight) - t + margin;
  return u >= lo && u <= hi;
}
