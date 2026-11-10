import type { RoadGraph, RoadPoint } from '../traffic/RoadGraph';

/**
 * CAR RACE: the course. Pure function of the road graph (no three.js, no physics).
 * It follows the OUTER RING FREEWAY (F1 north -> east, F2 east -> south, F3 south -> west):
 * START = on F1 a little after the north junction (N), FINISH = at the west end of F3 (just before the west junction W).
 * Checkpoint circles lie on the middle lane of the road every ~1 km; the last one is the finish.
 */

export interface RacePoint {
  x: number;
  z: number;
  /** Road surface height. */
  y: number;
  /** Unit heading of the race direction. */
  hx: number;
  hz: number;
}

/** A place on a road (the AI racers are planned and placed with these). */
export interface RoadRef {
  roadId: number;
  s: number;
  dir: 1 | -1;
}

/** One starting place of an AI racer (the player's Jeep stands at the start point itself, lane 1). */
export interface RaceSlot extends RoadRef {
  lane: number;
}

export interface RaceCourse {
  start: RacePoint;
  /** In driving order; the LAST one is the finish. */
  checkpoints: RacePoint[];
  /** Length of the course (m), start to finish along the road. */
  length: number;
  /** The start / the finish as places on the road network (for the racers' route). */
  startRef: RoadRef;
  finishRef: RoadRef;
  /** Starting grid of the AI racers (RACE_RACERS places, two rows, around the player's Jeep). */
  grid: RaceSlot[];
}

/** The three arcs, in race order. */
export const RACE_ROADS: readonly string[] = ['F1', 'F2', 'F3'];
/** The north junction (RoadPlan MAIN_NODES 'N'): the race begins on F1 close to it. */
const NORTH = { x: 360, z: -3650 };
/** The start line is this far (m) past the north junction. */
export const RACE_START_S = 170;
/** The finish circle is this far (m) before the west junction. */
export const RACE_FINISH_BACK = 45;
/** Distance (m) between checkpoint circles. */
export const RACE_SPACING = 1000;
/** Keep circles this far (m) away from a junction at the end of an arc. */
const JUNCTION_CLEAR = 70;
/** How many AI racers drive against the player. */
export const RACE_RACERS = 5;
/** Grid: [lane, metres behind the start line]. The player's Jeep is in lane 1 on the line. */
const GRID: readonly (readonly [number, number])[] = [[2, 0], [0, 0], [2, 14], [1, 14], [0, 14]];
/** A road end farther than this (m) from where the previous arc ended = the roads are not as planned: no race. */
const MAX_GAP = 600;

export function buildRaceCourse(g: RoadGraph): RaceCourse | null {
  const tmp: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const take = (id: number, s: number, dir: 1 | -1): RacePoint => {
    g.at(id, s, dir, g.laneOffset(id, 1), tmp);
    return { x: tmp.x, z: tmp.z, y: tmp.y, hx: tmp.hx, hz: tmp.hz };
  };

  let prev = { x: NORTH.x, z: NORTH.z };
  let start: RacePoint | null = null;
  let startRef: RoadRef | null = null;
  let finishRef: RoadRef | null = null;
  const grid: RaceSlot[] = [];
  const checkpoints: RacePoint[] = [];
  let cum = 0; // course distance at the start of the current arc
  let next = RACE_SPACING; // course distance of the next circle

  for (let k = 0; k < RACE_ROADS.length; k++) {
    const id = g.roads.findIndex((r) => r.name === RACE_ROADS[k]);
    if (id < 0) return null;
    const r = g.roads[id];
    const n = r.xs.length;
    const dFirst = Math.hypot(r.xs[0] - prev.x, r.zs[0] - prev.z);
    const dLast = Math.hypot(r.xs[n - 1] - prev.x, r.zs[n - 1] - prev.z);
    if (Math.min(dFirst, dLast) > MAX_GAP) return null;
    const dir: 1 | -1 = dFirst <= dLast ? 1 : -1;
    // t = distance travelled along this arc in the race direction; s = the road's own distance
    const sOf = (t: number): number => (dir > 0 ? t : r.length - t);
    const t0 = k === 0 ? RACE_START_S : 0;
    const last = k === RACE_ROADS.length - 1;
    const t1 = last ? r.length - RACE_FINISH_BACK : r.length;
    if (t1 - t0 < 200) return null;

    if (k === 0) {
      start = take(id, sOf(t0), dir);
      startRef = { roadId: id, s: sOf(t0), dir };
      for (const [lane, back] of GRID.slice(0, RACE_RACERS)) grid.push({ roadId: id, s: sOf(t0 - back), dir, lane });
    }
    // a circle that would fall inside a junction is moved just outside it (the spacing stays ~1 km)
    while (next <= cum + (t1 - t0) - (last ? 150 : 0)) {
      let t = t0 + (next - cum);
      if (k > 0) t = Math.max(t, t0 + JUNCTION_CLEAR);
      if (!last) t = Math.min(t, t1 - JUNCTION_CLEAR);
      checkpoints.push(take(id, sOf(t), dir));
      next += RACE_SPACING;
    }
    cum += t1 - t0;
    if (last) {
      checkpoints.push(take(id, sOf(t1), dir)); // the finish
      finishRef = { roadId: id, s: sOf(t1), dir };
    }
    const endIdx = dir > 0 ? n - 1 : 0;
    prev = { x: r.xs[endIdx], z: r.zs[endIdx] };
  }
  if (!start || !startRef || !finishRef || checkpoints.length < 2) return null;
  return { start, checkpoints, length: cum, startRef, finishRef, grid };
}
