import { Config } from '../../core/Config';
// STEP HK-10a: the infield of the Hatikamrul loops. Ponds (existing LakeSet bowl + water, see Lakes.addFixedPond) in the two WEST loops, striped lawns in the two EAST loops (HK-10b).
// WORLD metres (x east, z south). lx / ly = the same point in the interchange frame (x east along the ring, y north toward the J1-S arm); scripts/hk-infield-check.ts compares the two with hkWorld(), so they cannot drift.
// These numbers are fixed here (not computed from the road network) because the LakeSet is built BEFORE the roads exist.
// The NW pond is moved 10.4 m EAST of the loop circle centre (-110.4, 98.4): the old collector R2-35.2 runs through the west part of that loop (x about -160, y 84 .. 178) and the shore must keep 14 m from it.
export interface HkPond { readonly id: string; readonly loop: string; readonly lx: number; readonly ly: number; readonly x: number; readonly z: number; readonly R: number; readonly level: number; readonly depth: number }
export const HK_POND_WOBBLE = 0.06;
export const HK_INFIELD_PONDS: readonly HkPond[] = [
  { id: 'HKP-NW', loop: 'HK-NW', lx: -100, ly: 98, x: -1229.56, z: 2200.02, R: 26, level: 18.4, depth: 1.8 },
  { id: 'HKP-SW', loop: 'HK-SW', lx: -104.3, ly: -98.4, x: -1241.31, z: 2396.12, R: 30, level: 19.4, depth: 1.8 },
];

// ---- HK-10b: striped lawns in the two EAST loops (HK-SE, HK-NE). The lawn is the game's own CITY LAWN: CityGreen.at() returns 1 inside a lawn disc, so the terrain shader paints the ground green (aCity) and the
// grass placer grows its mown city-lawn tufts there (same code, same models, same colours). The STRIPES are only a shade: the tuft's unused 6th float carries a light / dark marker, GrassManager multiplies the tuft brightness.
// Concentric colour rings, HK_LAWN_STRIPE_W m wide, counted from the lawn edge. Pure functions of the world position (the chunk worker and the main thread see the same field).
export interface HkLawn { readonly id: string; readonly loop: string; readonly lx: number; readonly ly: number; readonly x: number; readonly z: number; readonly r: number }
export const HK_LAWN_FADE = 4;
export const HK_LAWN_STRIPE_W = 5;
export const HK_INFIELD_LAWNS: readonly HkLawn[] = [
  { id: 'HKL-SE', loop: 'HK-SE', lx: 104.3, ly: -98.4, x: -1032.86, z: 2404.04, r: 62 },
  { id: 'HKL-NE', loop: 'HK-NE', lx: 110.4, ly: 98.4, x: -1019.29, z: 2207.61, r: 62 },
];
/** Lawn amount 0..1 at a world point: 1 inside a lawn disc, 0 over HK_LAWN_FADE m outside it; 0 everywhere with the switch OFF. */
export function hkLawnAt(x: number, z: number): number {
  if (!Config.roads.hatikamrul.enabled) return 0;
  let best = 0;
  for (const L of HK_INFIELD_LAWNS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d <= L.r) return 1;
    if (d < L.r + HK_LAWN_FADE) { const t = (d - L.r) / HK_LAWN_FADE; best = Math.max(best, 1 - t * t * (3 - 2 * t)); }
  }
  return best;
}
/** Stripe of the lawn at a point: +1 light ring, -1 dark ring, 0 outside every lawn disc. Rings are counted from the lawn edge inwards. */
export function hkLawnStripe(x: number, z: number): number {
  if (!Config.roads.hatikamrul.enabled) return 0;
  for (const L of HK_INFIELD_LAWNS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d <= L.r) return Math.floor((L.r - d) / HK_LAWN_STRIPE_W) % 2 === 0 ? 1 : -1;
  }
  return 0;
}
/** True when the square (world metres) can hold lawn (for the chunk mask). */
export function hkLawnTouches(x0: number, z0: number, x1: number, z1: number): boolean {
  if (!Config.roads.hatikamrul.enabled) return false;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  return HK_INFIELD_LAWNS.some((L) => Math.hypot(cx - L.x, cz - L.z) < L.r + HK_LAWN_FADE + half);
}
