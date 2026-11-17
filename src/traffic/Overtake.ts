/**
 * OVERTAKING on a big freeway (3 lanes per direction). Pure decision logic, no three.js / physics: AIDriver feeds it what is around the car
 * and gets back how many lanes towards the fast lane (the median side) the car wants to be away from its own lane.
 *
 *  - A car that is held up by a SLOWER vehicle in its lane (slower by more than SLOW_BY m/s than it would like to go) moves one lane
 *    towards the median when that lane is free (nobody beside it, nothing close ahead, nobody coming up fast behind).
 *  - Once it is past (the lane back towards the kerb is free, nobody is beside it) and nothing slow is in front of it any more,
 *    it moves back one lane.
 *  - Never near a junction, and never more than `maxExtra` lanes (the fast lane is the last one).
 * Driving faster than the others is what makes a car overtake: a hypercar behind a truck passes it, a truck behind a hypercar never does.
 */
export const LANE_W = 3.5;
/** The car must want to go at least this much (m/s) faster than the vehicle in front before it pulls out. */
export const SLOW_BY = 2.5;
/** Seconds between two lane changes of one car. */
export const COOLDOWN = 3;

/** Another vehicle, in the frame of THIS car: `a` metres ahead (<0 = behind), `l` metres to the left (<0 = right), `v` its speed along our heading (m/s). */
export interface Other {
  a: number;
  l: number;
  v: number;
}

export interface OvertakeIn {
  /** Lanes already moved towards the median (0 = in its own lane). */
  extra: number;
  /** How many more it may take (2 - its own lane index). */
  maxExtra: number;
  /** The speed it would like to drive (m/s), before other vehicles slow it down. */
  vFree: number;
  /** Its speed now (m/s). */
  speed: number;
  others: readonly Other[];
  /** Seconds left of the cool-down after the last lane change. */
  cooldown: number;
  /** A junction / turn / U-turn is near: go back to the own lane, do not start anything. */
  nearJunction: boolean;
}

/** Is the lane `dl` metres to the side (+ left, - right) free for a car going `speed`? */
export function laneFree(others: readonly Other[], dl: number, speed: number): boolean {
  for (const o of others) {
    if (Math.abs(o.l - dl) > 2.3) continue;
    const front = 38 + Math.max(0, speed - o.v) * 2; // a slower car ahead needs a long gap
    const back = 14 + Math.max(0, o.v - speed) * 2.5; // a faster car coming up from behind needs room
    if (o.a > -back && o.a < front) return false;
  }
  return true;
}

/** The new number of lanes (0 .. maxExtra) the car wants to be away from its own lane. */
export function decideExtra(i: OvertakeIn): number {
  if (i.nearJunction) return 0;
  if (i.cooldown > 0) return i.extra;
  // held up: a slower vehicle in our own lane within 55 m
  let held = false;
  for (const o of i.others) {
    if (Math.abs(o.l) < 2.0 && o.a > 0.5 && o.a < 55 && o.v < i.vFree - SLOW_BY) held = true;
  }
  if (held && i.extra < i.maxExtra && laneFree(i.others, -LANE_W, i.speed)) return i.extra + 1;
  if (!held && i.extra > 0 && laneFree(i.others, LANE_W, i.speed)) return i.extra - 1;
  return i.extra;
}
