// STEP 2.2b (2026-11-13) RING ALIGNMENT DATA (M8, 8 lane): the PI table of the closed ring, REFITTED round the mountains, airport and rail (tools/ring-route.py, ring-opt.py). Version 1 (shape of Roads.zip F3) is in docs/RingAlignment.v1.ts.
// Game coordinates (x east, z south, metres). Design speed V100, R >= 1.5 x Rmin = 591 m, spiral Ls 100 m (needed: 70 m). Travel order = table order.
// This is DATA: change a row only through a new CP; Checks and the sampled centreline are built from it (PiAlignment.ts).
import type { Pi } from './PiAlignment';

export const RING_DESIGN_SPEED = 100;
export const RING_PIS: readonly Pi[] = [
  { x: 398.13, z: 1846.29, R: 1396, Ls: 100 },
  { x: -459.03, z: 2348.47, R: 632, Ls: 100 },
  { x: -2453.85, z: 2389.45, R: 929, Ls: 100 },
  { x: -2658.75, z: -1947.51, R: 591, Ls: 100 },
  { x: -600.49, z: -2901.43, R: 1272, Ls: 100 },
  { x: 515.58, z: -4324.18, R: 1008, Ls: 100 },
  { x: 2530.62, z: -2338.21, R: 595, Ls: 100 },
  { x: 3082.78, z: -776.58, R: 1816, Ls: 100 },
  { x: 2847.71, z: 1193.03, R: 591, Ls: 100 },
  { x: 1495.26, z: 1861.91, R: 714, Ls: 100 },
];

/** STEP 2.4 (REDO PENDING after the refit of 2.2b): the nearest ring station to the end of each reference radial. N and E fall inside a curve and S is only 99 m from a curve end,
 *  so these four are NOT final: the ring has no 1 km straight near N, E, S. Step 2.4 must move the radial ends or add a straight (user decides). */
export const RING_RADIAL_JOINS: ReadonlyArray<{ dir: 'N' | 'E' | 'S' | 'W'; station: number; x: number; z: number }> = [
  { dir: 'N', station: 10238, x: 588.7, z: -3821.0 }, // in an arc
  { dir: 'E', station: 14541, x: 3044.5, z: -619.1 }, // in an arc
  { dir: 'S', station: 240, x: -188.2, z: 2189.8 }, // straight 0-339 only
  { dir: 'W', station: 5154, x: -2594.8, z: -594.8 }, // straight 3121-6060 (good)
];
