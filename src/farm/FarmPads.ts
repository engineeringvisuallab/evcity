// FARM PADS (pure numbers, no three.js: the terrain generator and its chunk workers use it).
// 2026-11-22 (user): every agriculture area (FarmAreas.ts) is FULLY FLAT. The whole circle (+ 40 m, so the corner of the outermost field is on it too)
// is levelled to one floor height (the MEDIAN natural ground inside the circle, set once by the TerrainGenerator), with a soft skirt back to the
// natural ground. Like the other pads it gives way to roads / junction pads (k), so roads stay exactly as planned.
import { FARM_AREAS } from './FarmAreas';

/** The flat ring beyond the area radius (m): a cell whose centre is r - 30 from the middle reaches r + 38 with its far corner. */
export const FARM_FLAT_EXTRA = 40;
/** The soft skirt (m) between the flat floor and the natural ground. */
const BLEND = 60;
/** The pad is sunk a little so the field planes (0.005+ m above the floor) never float above the ground. */
const SINK = 0.03;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class FarmPads {
  /** Floor height (m) of every area (same order as FARM_AREAS): the MEDIAN natural ground over its circle. Set once by the TerrainGenerator. */
  readonly floors: number[] = FARM_AREAS.map((a) => a.y);

  /** Cheap pre-check: on a flat area or its skirt? */
  near(x: number, z: number): boolean {
    for (const a of FARM_AREAS) {
      const R = a.r + FARM_FLAT_EXTRA + BLEND;
      const dx = x - a.cx, dz = z - a.cz;
      if (Math.abs(dx) < R && Math.abs(dz) < R && Math.hypot(dx, dz) < R) return true;
    }
    return false;
  }

  /** True on the flat floor (+ margin m): no trees, rocks or hills here. */
  inside(x: number, z: number, margin = 0): boolean {
    for (const a of FARM_AREAS) if (Math.hypot(x - a.cx, z - a.cz) <= a.r + FARM_FLAT_EXTRA + margin) return true;
    return false;
  }

  /** Level the ground: new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    let best = 0, floor = 0;
    for (let i = 0; i < FARM_AREAS.length; i++) {
      const a = FARM_AREAS[i];
      const d = Math.max(0, Math.hypot(x - a.cx, z - a.cz) - (a.r + FARM_FLAT_EXTRA));
      if (d >= BLEND) continue;
      const t = 1 - smoothstep(0, BLEND, d);
      if (t > best) { best = t; floor = this.floors[i]; }
    }
    return best > 0 ? h + (floor - SINK - h) * best * k : h;
  }
}
