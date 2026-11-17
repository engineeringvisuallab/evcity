// STEP J1-SIG: the shape numbers of the four corner signal masts of the ground-level J1. Pure numbers, no three.js (TrafficSignals puts them in the data, J1SignalMasts draws them, scripts/j1-signal-mast-check.ts checks them).
// WHY: the user's pointers are the four ASH-COLOURED MEDIAN ISLAND HEADS (the pedestrian refuge in the gap of the zebra) at the inner end of every arm. The median island of an arm lies at o = -5.15 .. -2.15 (centre o = -W = -3.65)
// from s = box half 19.75 m outward (the right pockets are at o -2.15 .. 5.15, the through lanes at 5.15 .. 19.75: o = 0 is ROAD, not island).
// One tall lighting-stand pole stands on each island head (a little inside it). Its curved MAST ARM reaches over the 2 right pockets AND the 4 through lanes of that arm (the inbound side, +o),
// the signal heads hang from the arm, and a street luminaire (lamp arm) at the pole top lights the open box.

/** Pole standing point on the median island: o = -W (the centre of the island, 3 m wide), this far (m) behind the island head (s = box half), and the island is this high (m) above the road. */
export const MAST_S_IN = 0.8;
export const MAST_ISLAND_H = 0.14;
/** Height (m) of the pole top (the luminaire arm starts here) and of the mast arm where it leaves the pole. */
export const MAST_POLE_H = 9.4;
export const MAST_ARM_Y0 = 7.2;
/** The mast arm arches up by this much (m) in the middle (then it comes back down to ARM_Y0 at the tip). */
export const MAST_ARM_RISE = 0.6;
/** The signal head hangs this far (m) below the mast arm (centre of the head), the head is 1.36 m tall: lowest point = arm - 1.15 - 0.68. */
export const MAST_HEAD_DROP = 1.15;
/** Lowest allowed point of a signal head above the road (m): MUTCD 4.6 m over the road, the Indian practice 5.5 m; we keep 5.2 m. */
export const MAST_HEAD_MIN_CLEAR = 5.2;
/** Luminaire arm: horizontal reach (m) towards the centre of the box. */
export const LAMP_REACH = 3.3;

/** Height (m) above the ground of the mast arm at distance d (m) from the pole along an arm of length len. */
export function mastArmY(d: number, len: number): number {
  const t = Math.max(0, Math.min(1, d / len));
  return MAST_ARM_Y0 + MAST_ARM_RISE * 4 * t * (1 - t);
}

/** Height (m) of the CENTRE of a signal head hung at distance d on an arm of length len. */
export function mastHeadY(d: number, len: number): number {
  return mastArmY(d, len) - MAST_HEAD_DROP;
}

export interface MastSpec {
  /** Arm index 0 N, 1 E, 2 S, 3 W: the arm whose inbound traffic this mast serves. */
  arm: number;
  /** World x, z of the pole and the ground height there. */
  x: number;
  z: number;
  y: number;
  /** Unit vector (world x, z) from the pole along the mast arm, and its length (m). */
  tx: number;
  tz: number;
  len: number;
  /** Unit vector (world x, z) of the luminaire arm (towards the centre of the box). */
  lx: number;
  lz: number;
}
