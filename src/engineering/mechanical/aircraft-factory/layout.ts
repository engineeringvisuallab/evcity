/**
 * AIRCRAFT FACTORY layout, metres. Local frame: x east, y up, z south, origin = site centre (the same frame as every engineering site).
 * The factory stands INSIDE the grounds of the old airport, east of its apron, on the airport's own flat pad (south side of the runway). The big assembly hall runs
 * east-west along the north side (open to the spine road on its south side so visitors can see the line); the aeroplane moves WEST along the line (nose west) and
 * rolls out through the west door onto the airport taxiway. Parts shop and visitor centre are in the south row; the gate is on the south edge.
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -184, maxX: 184, minZ: -108, maxZ: 108 };
export const PAD: Rect = { minX: -190, maxX: 190, minZ: -112, maxZ: 112 };

/** Seconds of game time for one production step (all five stations move on together every CYCLE seconds). One aeroplane rolls out per cycle. */
export const CYCLE = 300;
/** Where in the cycle the finished plane reaches the exit point (the airport takes it over then). */
export const ROLLOUT_AT = 0.9;

export const L = {
  gate: { x: 150, z: 108 },
  hall: { x0: -172, x1: 172, z0: -92, z1: -28, h: 27 },
  /** the assembly line (the fuselage axis) */
  lineZ: -60,
  /** x of the five stations (west = later): wings, fuselage, final assembly, paint, test */
  st: { wing: 140, fuse: 70, final: 0, paint: -70, test: -135 },
  /** the rollout door in the west wall (width 44 m, height 16 m) and the point where the plane stops outside (the airport takes it from there) */
  door: { x: -172, z: -60, w: 44, h: 16 },
  exit: { x: -188, z: -60 },
  /** where the taxi route turns north (towards the airport taxiway at z = -135) */
  corner: { x: -215, z: -60 },
  cnc: { x: -105, z: 64, w: 96, d: 54, h: 12 },
  admin: { x: 118, z: 64, w: 56, d: 30, h: 12 },
} as const;
