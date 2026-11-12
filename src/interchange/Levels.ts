// INTERCHANGE FOUNDATION: heights. One road is the BRIDGE (`upper`), the other stays on the ground (`y0`). The upper road rises by clearance + deckThickness with
// a grade of at most upperMaxGrade (smoothstep: the steepest part is exactly the limit), is flat over the lower road, and falls back to the ground.
// Ramps then run from the height of the road they leave to the height of the road they join, with a smooth profile (no step, no kink).

import { smoothstep01 } from './Geometry2D';
import type { InterchangeParams, InterchangeSpec, LevelPlan, RoadSide } from './InterchangeTypes';

export function makeLevels(spec: InterchangeSpec, P: InterchangeParams): LevelPlan {
  const upper: RoadSide = spec.upper ?? (spec.pattern.endsWith('-cd') ? 'cross' : 'main'); // with C-D roads the highway stays on the ground, the cross road is the overpass
  const lowerHalf = upper === 'main' ? spec.cross.halfWidth : spec.main.halfWidth;
  const rise = P.clearance + P.deckThickness;
  const flat = lowerHalf + P.upperFlat;
  const rampLen = (1.5 * rise) / P.upperMaxGrade; // smoothstep: max slope = 1.5 * rise / length
  const L: LevelPlan = { y0: spec.y, upper, rise, flat, rampLen, elevatedT: flat };
  // the stretch that is higher than pierFromH over the ground (bisection: the profile only falls with |t|)
  let lo = flat;
  let hi = flat + rampLen;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (yOf(L, upper, mid) - L.y0 > P.pierFromH) lo = mid;
    else hi = mid;
  }
  L.elevatedT = lo;
  return L;
}

/** Height (m) of road `side` at signed distance t from the centre of the interchange. */
export function yOf(L: LevelPlan, side: RoadSide, t: number): number {
  if (side !== L.upper) return L.y0;
  const a = Math.abs(t);
  if (a <= L.flat) return L.y0 + L.rise;
  if (a >= L.flat + L.rampLen) return L.y0;
  return L.y0 + L.rise * (1 - smoothstep01((a - L.flat) / L.rampLen));
}

/** Heights along a ramp of `length` m, `n` points even in distance: from yA to yB, smooth at both ends. cum[] = distance of every point. */
export function rampProfile(cum: readonly number[], yA: number, yB: number): number[] {
  const L = cum[cum.length - 1] || 1;
  return cum.map((c) => yA + (yB - yA) * smoothstep01(c / L));
}
