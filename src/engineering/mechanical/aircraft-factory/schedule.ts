/**
 * The production schedule of the aircraft factory's assembly line: PURE numbers, no three.js (the airplane manager imports it too, so the aeroplane that rolls out
 * of the door and the aeroplane the manager puts on the taxiway are the same event on the same clock).
 *
 * Five aeroplane bodies stand in the five stations (1 wing, 2 fuselage, 3 final assembly, 4 paint, 5 test cell). Every CYCLE seconds all of them move on by one
 * station towards the WEST, together. In one cycle
 *   [0 .. MOVE0)     every body stands still in its station and is worked on (its parts appear one after another: `dwell` goes 0 -> 1),
 *   [MOVE0 .. MOVE1] every body is towed to the next station; the one from the test cell is towed out of the rollout door to the exit point,
 *   MOVE1            the finished aeroplane has reached the exit point: it is HANDED OVER (the factory body disappears, the airplane manager's delivery plane appears
 *                    at the same place and taxies away),
 *   [MOVE1 .. 1)     the other four wait in their new stations; the body that was handed over is empty and re-enters at station 1 at the next cycle.
 */
import { CYCLE } from './layout';

export const SLOTS = 5;
/** x of the five stations (local metres) and of the exit point outside the rollout door (the same numbers as layout.ts) */
export const SLOT_X = [140, 70, 0, -70, -135] as const;
export const EXIT_X = -188;
export const MOVE0 = 0.78;
export const MOVE1 = 0.9;
/**
 * Where in the cycle the game clock 0 lies (negative = the game starts 105 s before a cycle begins: the stations are about two thirds through their work, the first
 * aeroplane reaches the exit after 375 s). The phase is not arbitrary: a landing at the sea airport every five minutes has to leave the free gaps that the shuttle,
 * the airliner from abroad and the fighters need there; this value was found by simulating the whole airport for 6000 s (scripts/sea-airport-test.ts and
 * scripts/aircraft-delivery-test.ts guard it). If CYCLE, MOVE0 / MOVE1 or the flight plans change, run those two tests again.
 */
export const START_OFFSET = -0.35 * CYCLE;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const ease = (t: number): number => t * t * (3 - 2 * t);

export interface Clock {
  cycle: number;
  /** position inside the cycle, 0..1 */
  f: number;
  /** work progress of the stationary bodies, 0..1 (1 while they are towed or waiting) */
  dwell: number;
  /** tow progress, 0..1 */
  move: number;
}
export function clock(t: number): Clock {
  const u = (t + START_OFFSET) / CYCLE;
  const cycle = Math.floor(u);
  const f = u - cycle;
  return { cycle, f, dwell: clamp01(f / MOVE0), move: clamp01((f - MOVE0) / (MOVE1 - MOVE0)) };
}

/** Index (relative to the cycle numbering of `clock`) of the first rollout after game time 0. */
const FIRST_ROLLOUT = Math.floor(START_OFFSET / CYCLE - MOVE1) + 1;
/** Game time (s) at which the k-th finished aeroplane (k = 0, 1, 2 ... counted from the start of the game) reaches the exit point and is handed over. */
export function rolloutTime(k: number): number {
  return (k + FIRST_ROLLOUT + MOVE1) * CYCLE - START_OFFSET;
}
/** Index of the latest rollout that has happened at time t (-1 = none yet). */
export function rolloutIndex(t: number): number {
  return Math.max(-1, Math.floor((t + START_OFFSET) / CYCLE - MOVE1) - FIRST_ROLLOUT);
}

export interface PlanePose {
  /** 0..4: the station the body belongs to */
  slot: number;
  x: number;
  /** false for the body that has been handed over (until it re-enters at station 1) */
  visible: boolean;
  /** 0..1 progress of the work at its station (parts with `at` <= dwell are shown) */
  dwell: number;
  towing: boolean;
}
/** Where body number p (0..SLOTS-1) is, and how far its work has come, at time t. */
export function planePose(p: number, t: number): PlanePose {
  const c = clock(t);
  const slot = (((c.cycle - p) % SLOTS) + SLOTS) % SLOTS;
  const x0 = SLOT_X[slot];
  const x1 = slot === SLOTS - 1 ? EXIT_X : SLOT_X[slot + 1];
  const towing = c.f >= MOVE0 && c.f < MOVE1;
  const x = c.f < MOVE0 ? x0 : c.f >= MOVE1 ? x1 : x0 + (x1 - x0) * ease(c.move);
  return { slot, x, visible: !(slot === SLOTS - 1 && c.f >= MOVE1), dwell: c.dwell, towing };
}

/** Paint state of a body: 0 bare aluminium, 1 primer, 2 EVCity livery. Only the paint station (slot 3) changes it. */
export function paintLevel(slot: number, dwell: number): 0 | 1 | 2 {
  if (slot < 3) return 0;
  if (slot > 3) return 2;
  return dwell < 0.12 ? 0 : dwell < 0.62 ? 1 : 2;
}

export interface TestPose {
  /** 0..1: the aeroplane is raised on its jacks (metres = lift * LIFT_M) */
  lift: number;
  /** the landing gear is retracted (the gear swing test) */
  gearUp: boolean;
  /** 0..1 strength of the blinking test lamps */
  lamps: number;
}
export const LIFT_M = 1.2;
const pulse = (d: number, a: number, b: number): number => Math.sin(clamp01((d - a) / (b - a)) * Math.PI);
/** What the aeroplane in the test cell does (jacks up, gear swing, jacks down), by work progress. Nothing outside that station. */
export function testPose(slot: number, dwell: number): TestPose {
  if (slot !== 4 || dwell <= 0) return { lift: 0, gearUp: false, lamps: 0 };
  const lift = clamp01(Math.min((dwell - 0.1) / 0.15, (0.9 - dwell) / 0.15));
  return { lift: ease(lift), gearUp: lift > 0.98 && dwell > 0.3 && dwell < 0.7, lamps: pulse(dwell, 0.05, 0.95) };
}
