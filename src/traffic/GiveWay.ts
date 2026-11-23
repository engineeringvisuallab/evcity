// H3b GIVE-WAY (2026-11-23): pure math, no three. A "yield mark" sits on a route point a little before a crossing / T where the road of the car has to give way
// to another road. The mark carries the centre line of the other (major) road around the crossing; the driver (AIDriver) asks gapClear() every frame and brakes
// to the stop line while a vehicle of the major road is in the crossing box or too close to it in time.
import type { RoadKind } from '../roads/RoadTypes';
import type { Obstacle } from './AIDriver';

/** Priority of a road (bigger = goes first): highway > arterial > collector (and roundabout) > local. */
export function roadClass(kind: RoadKind): number {
  switch (kind) {
    case 'highway': return 4;
    case 'arterial': return 3;
    case 'collector': return 2;
    case 'roundabout': return 2;
    default: return 1;
  }
}

/** 'minor' = always gives way (lower class, or the ending road of a T); 'equal' = same class: the car that gets there first goes first, a tie gives way to the car from the right (left-hand traffic). */
export type GwMode = 'minor' | 'equal';

export interface GwMark {
  /** Distance (m) along the route from the marked route point to the stop line (the front bumper stops there). */
  d: number;
  mode: GwMode;
  /** Half width (m) of the road of the waiting car = half length of the crossing box along the major road. */
  boxHalf: number;
  /** Half width (m) of the major road asphalt. */
  majHalf: number;
  /** Centre line of the major road around the crossing, every GW_STEP m from -GW_REACH to +GW_REACH (index GW_REACH / GW_STEP = the crossing). World x / z. */
  px: number[];
  pz: number[];
  /** Crossing point (world). */
  cx: number;
  cz: number;
  /** Filled by the driver the first time: a traffic light stands within 60 m (then the light rules, no yield). */
  sig?: boolean;
}

export const GW_STEP = 10;
export const GW_REACH = 80;
const ACC = 1.8;      // a car pulling away from the stop line (m/s2)
const V_CLEAR = 7;    // it clears the crossing at least at this speed (m/s)

/** Time (s) a car needs to cover `d` metres starting at `v0` with a normal start (accelerates, then holds at least V_CLEAR). */
export function clearTime(d: number, v0: number): number {
  const v = Math.max(0, v0), vc = Math.max(v, V_CLEAR);
  const t1 = (vc - v) / ACC, d1 = ((v + vc) / 2) * t1;
  if (d <= d1) return (-v + Math.sqrt(v * v + 2 * ACC * Math.max(0, d))) / ACC;
  return t1 + (d - d1) / vc;
}

export interface GapArgs {
  mark: GwMark;
  obstacles: readonly Obstacle[];
  /** The waiting car itself (never an obstacle for itself). */
  me: unknown;
  /** Position (world) and heading (unit) of the waiting car, its speed (m/s) along the heading. */
  x: number; z: number; fx: number; fz: number; speed: number;
  /** Distance (m) from the front bumper to the stop line (>= 0), half length of the car. */
  dLine: number; halfLen: number;
  /** Seconds the car has been standing at the line (a long wait accepts smaller gaps). */
  wait: number;
}

/** Why the way is not free (for the check script): 'box' = a vehicle is in the crossing, 'gap' = one is too close in time, 'prio' = same class and the other was first / comes from the right, '' = free. */
export type GwWhy = '' | 'box' | 'gap' | 'prio';

export function gapCheck(a: GapArgs): GwWhy {
  const m = a.mark, n = m.px.length;
  const boxLim = m.boxHalf + 1.0;       // a vehicle centre this close to the crossing centre (along the major road) is in the box
  const latMax = m.majHalf + 1.0;       // a vehicle centre this far from the centre line is not on the major road
  // my time to the crossing centre at the current speed (equal class) and the time I need to clear the crossing from here (minor)
  const dCentre = a.dLine + a.halfLen + m.majHalf + 2.0;
  const myArr = dCentre / Math.max(1.5, Math.abs(a.speed));
  const dClear = a.dLine + 2 * m.majHalf + 2.0 + 2 * a.halfLen;
  const relax = Math.min(3, a.wait * 0.25);
  const tNeed = Math.max(2.0, clearTime(dClear, a.speed) + 1.5 - relax);
  const force = a.wait > 40;            // deadlock breaker: only the box itself is respected
  let why: GwWhy = '';
  for (const o of a.obstacles) {
    if (o.ref === a.me || o.kind !== 'vehicle') continue;
    if ((o.x - m.cx) ** 2 + (o.z - m.cz) ** 2 > (GW_REACH + 12) ** 2) continue;
    // nearest piece of the major road centre line
    let best = Infinity, so = 0, tx = 0, tz = 1;
    for (let k = 0; k + 1 < n; k++) {
      const vx = m.px[k + 1] - m.px[k], vz = m.pz[k + 1] - m.pz[k], l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((o.x - m.px[k]) * vx + (o.z - m.pz[k]) * vz) / l2));
      const d = Math.hypot(o.x - (m.px[k] + t * vx), o.z - (m.pz[k] + t * vz));
      if (d < best) { best = d; so = (k + t) * GW_STEP - GW_REACH; const l = Math.sqrt(l2); tx = vx / l; tz = vz / l; }
    }
    if (best > latMax) continue;
    const vt = o.vx * tx + o.vz * tz;                     // speed along the major road (+ = towards larger arc position)
    const sp = Math.hypot(o.vx, o.vz);
    if (Math.abs(so) < boxLim + o.r * 0.5) { return 'box'; }
    if (Math.abs(vt) < 0.8 || sp < 0.8) continue;         // standing outside the box: no hindrance
    if (so * vt >= 0) continue;                           // driving away from the crossing
    if (Math.abs(vt) < 0.6 * sp) continue;                // not driving along the major road (turning into / out of it somewhere else)
    const eta = Math.max(0, Math.abs(so) - boxLim - 2.3) / Math.abs(vt);
    if (m.mode === 'minor') {
      if (!force && eta < tNeed) why = 'gap';
    } else {
      const lat = (o.x - a.x) * a.fz - (o.z - a.z) * a.fx; // + = left of me
      if (eta < myArr - 1.0) { if (!force) why = 'prio'; }
      else if (eta < myArr + 1.0 && lat < 0) { if (!force) why = 'prio'; } // tie: the car from my right goes first
    }
  }
  return why;
}

/** Does a car of road `a` have to give way to road `b` at a crossing of the two? null = no (a is the bigger road). */
export function crossMode(ka: RoadKind, kb: RoadKind): GwMode | null {
  const ca = roadClass(ka), cb = roadClass(kb);
  return ca < cb ? 'minor' : ca === cb ? 'equal' : null;
}

/** The pieces of the road graph this file needs (RoadGraph has them). */
export interface GwGraph {
  roads: ReadonlyArray<{ halfWidth: number; length: number }>;
  at(roadId: number, s: number, dir: 1 | -1, lateral: number, out: { x: number; z: number; y: number; hx: number; hz: number }): { x: number; z: number };
}

/**
 * Build the mark for a car of road `mine` that is `conflictAhead` metres (along its road) before the centre of the crossing with road `major` (at s = sMajor).
 * The stop line is lineGap m before the near kerb of the major road.
 */
export function makeMark(g: GwGraph, mine: number, major: number, sMajor: number, conflictAhead: number, mode: GwMode, lineGap: number): GwMark {
  const A = g.roads[mine], Q = g.roads[major];
  const tmp = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const px: number[] = [], pz: number[] = [];
  for (let k = -GW_REACH; k <= GW_REACH; k += GW_STEP) {
    const p = g.at(major, Math.max(0, Math.min(Q.length, sMajor + k)), 1, 0, tmp);
    px.push(p.x); pz.push(p.z);
  }
  const mid = (px.length - 1) / 2;
  return { d: Math.max(0.5, conflictAhead - (Q.halfWidth + lineGap)), mode, boxHalf: A.halfWidth, majHalf: Q.halfWidth, px, pz, cx: px[mid], cz: pz[mid] };
}
