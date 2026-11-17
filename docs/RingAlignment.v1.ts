// STEP 2.2  RING ALIGNMENT DATA (M8, 8 lane): the PI table of the closed ring, fitted to the shape of Roads.zip F3 (tools/ring-fit.py).
// Game coordinates (x east, z south, metres). Design speed V100, R >= 1.5 x Rmin = 591 m, spiral Ls 100 m (needed: 70 m). Travel order = table order.
// This is DATA: change a row only through a new CP; Checks and the sampled centreline are built from it (PiAlignment.ts).
import type { Pi } from './PiAlignment';

export const RING_DESIGN_SPEED = 100;
export const RING_PIS: readonly Pi[] = [
  { x: -4.70, z: 2384.16, R: 9260, Ls: 100 },
  { x: -2099.10, z: 2396.16, R: 696, Ls: 100 },
  { x: -2648.25, z: 830.19, R: 2354, Ls: 100 },
  { x: -2992.28, z: -3212.06, R: 650, Ls: 100 },
  { x: -1651.74, z: -3518.17, R: 1864, Ls: 100 },
  { x: 636.72, z: -3796.60, R: 914, Ls: 100 },
  { x: 2677.74, z: -3456.98, R: 1258, Ls: 100 },
  { x: 2706.59, z: 2204.04, R: 820, Ls: 100 },
];

/** STEP 2.4  Where the four radials meet the ring (PROPOSAL, waits for OK): the nearest station to the end of the reference radial that has
 *  500 m of clear straight on both sides. Station 0 = ST of PI 0. N and S had to move because the reference ends fall inside a curve. */
export const RING_RADIAL_JOINS: ReadonlyArray<{ dir: 'N' | 'E' | 'S' | 'W'; station: number; x: number; z: number }> = [
  { dir: 'N', station: 10143, x: -39.9, z: -3714.3 }, // reference end at station 10778 (635 m along the ring)
  { dir: 'E', station: 15382, x: 2692.3, z: -607.7 }, // reference end at station 15382 (0 m along the ring)
  { dir: 'S', station: 500, x: -835.4, z: 2388.9 }, // reference end at station 20696 (740 m along the ring)
  { dir: 'W', station: 4709, x: -2768.7, z: -585.1 }, // reference end at station 4709 (0 m along the ring)
];
