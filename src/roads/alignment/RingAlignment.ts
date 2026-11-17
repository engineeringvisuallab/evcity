// STEP 2.2c (2026-11-13, version 3: PI 1 and PI 2 refitted so the south straight is 1058 m) RING ALIGNMENT DATA (M8, 8 lane): the PI table of the closed ring, REFITTED round the mountains, airport and rail (tools/ring-route.py, ring-opt.py). Version 1 (shape of Roads.zip F3) is in docs/RingAlignment.v1.ts, version 2 in docs/RingAlignment.v2.ts.
// Game coordinates (x east, z south, metres). Design speed V100, R >= 1.5 x Rmin = 591 m, spiral Ls 100 m (needed: 70 m). Travel order = table order.
// This is DATA: change a row only through a new CP; Checks and the sampled centreline are built from it (PiAlignment.ts).
import type { Pi } from './PiAlignment';

export const RING_DESIGN_SPEED = 100;
export const RING_PIS: readonly Pi[] = [
  { x: 398.13, z: 1846.29, R: 1396, Ls: 100 },
  { x: -402.24, z: 2329.53, R: 601, Ls: 100 },
  { x: -2461.28, z: 2251.29, R: 786, Ls: 100 },
  { x: -2658.75, z: -1947.51, R: 591, Ls: 100 },
  { x: -600.49, z: -2901.43, R: 1272, Ls: 100 },
  { x: 515.58, z: -4324.18, R: 1008, Ls: 100 },
  { x: 2530.62, z: -2338.21, R: 595, Ls: 100 },
  { x: 3082.78, z: -776.58, R: 1816, Ls: 100 },
  { x: 2847.71, z: 1193.03, R: 591, Ls: 100 },
  { x: 1495.26, z: 1861.91, R: 714, Ls: 100 },
];

/** STEP 2.4 (redone 2026-11-13, option A + small south refit): where the four radials meet the ring. Every point is on a straight with at least 500 m clear on both sides
 *  (exit lane 116 + taper 91, entry lane 241 + taper 183). N and E were moved along the ring to the nearest such straight; S needed the small refit of PI 1 and PI 2 (straight 705-1763, 1058 m). */
export const RING_RADIAL_JOINS: ReadonlyArray<{ dir: 'N' | 'E' | 'S' | 'W'; station: number; x: number; z: number }> = [
  { dir: 'N', station: 11549, x: 1711.6, z: -3145.4 }, // straight 11049-12512 (500 / 963 m clear)
  { dir: 'E', station: 16813, x: 2354.5, z: 1436.9 }, // RAIL-B point 7 option B (2026-11-14, T moved away from the rail): was st 15309 (2967.4, 190.5), then st 17328 (35 m from the rail crossing east-2); ring at ground level here, rail 340 m away
  { dir: 'S', station: 1205, x: -1131.6, z: 2301.8 }, // straight 705-1763 (500 / 558 m clear)
  { dir: 'W', station: 5104, x: -2595.0, z: -591.5 }, // straight 3031-6014 (2073 / 910 m clear)
];
