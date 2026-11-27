// CITY MALL, STEP C3: where the 8 shops of a floor stand (pure numbers, NO three.js, so MallBuilder and the headless checks share ONE truth).
// Local frame of the mall (origin = atrium centre, +x east, -z north). The SAME plan is used on every floor (each floor has 8 shops = 8 categories):
//   ring 'inner' (4 shops): the 4 quadrants between r = promR and r = ring1 round the atrium (the first 16 m next to the atrium is a free promenade that holds the stair / lift cores),
//   ring 'outer' (4 shops): the 4 quadrants from r = ring1 + ringAisle out to the glass wall (wall m inset). Between the rings runs a 12 m ring aisle.
// The 4 axis aisles (|x| < aisle / |z| < aisle, 11 m, the lines through the 4 doors) and the atrium edge stay free. ASSUMED numbers (user did not give them): see SHOP.
import { MALL_BUILDING_LOCAL } from './MallSite';
import { edgeDist, floorLayout, type P2 } from './MallLayout';

export type Pt = [number, number];
export const SHOP = {
  aisle: 5.5,      // half width of the 4 door aisles (11 m)
  promR: 66,       // inner ring starts here (the cores end at r ~ 62)
  ring1: 105,      // inner ring ends here
  ringAisle: 12,   // the ring aisle between the two rings
  wall: 4,         // gap between the outer shops and the glass wall
  deptR: 64,       // the 4 department signs hang over the axis aisles at this distance from the centre
} as const;
export const OUTER_R = SHOP.ring1 + SHOP.ringAisle;
/** Quadrants in the order the 8 categories of a floor are placed: NE, SE, SW, NW (inner ring first, then outer ring). */
export const QUADS: ReadonlyArray<readonly [1 | -1, 1 | -1]> = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

export interface Pose { x: number; z: number; yaw: number }
export interface ShopSlot {
  index: number; ring: 'inner' | 'outer'; sx: 1 | -1; sz: 1 | -1;
  poly: Pt[]; area: number;
  /** Mid angle (in the quadrant frame) and the inner radius there. */
  thMid: number; rIn: number;
  /** The shop name sign (hangs at the inner edge, faces the centre), the "view all" board (8 m inside), the viewing spot (3 m inside, looks into the shop). */
  sign: Pose; board: Pose; view: Pose;
}

const BP = MALL_BUILDING_LOCAL as ReadonlyArray<P2>;
/** Distance from the origin to the outline along the ray (dx, dz) (the outline is star-shaped about the origin: one hit). */
export function rayHit(dx: number, dz: number): number {
  let best = Infinity;
  for (let i = 0, j = BP.length - 1; i < BP.length; j = i++) {
    const ax = BP[j][0], az = BP[j][1], ex = BP[i][0] - ax, ez = BP[i][1] - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
/** The outer limit of a shop along a ray: the glass wall minus SHOP.wall (the real distance to the wall, not just along the ray). */
function outerLimit(dx: number, dz: number): number {
  let r = rayHit(dx, dz) - SHOP.wall;
  while (r > 0 && edgeDist(BP, dx * r, dz * r) < SHOP.wall) r -= 0.5;
  return r;
}
const area = (p: Pt[]): number => Math.abs(p.reduce((a, q, i) => { const n = p[(i + 1) % p.length]; return a + q[0] * n[1] - n[0] * q[1]; }, 0) / 2);

function sector(sx: 1 | -1, sz: 1 | -1, rMin: number, rMax: number | null): { poly: Pt[]; thLo: number; thHi: number; thMid: number } {
  const a = SHOP.aisle;
  const rin = (th: number): number => Math.max(rMin, a / Math.cos(th), a / Math.sin(th));
  const rout = (th: number): number => (rMax ?? outerLimit(sx * Math.cos(th), sz * Math.sin(th)));
  let lo = -1, hi = -1;
  for (let th = 0.0005; th < Math.PI / 2; th += 0.0005) if (rin(th) < rout(th) - 1) { if (lo < 0) lo = th; hi = th; }
  const ths = new Set<number>([lo, hi]);
  for (let k = 1; k < 90; k++) { const th = lo + ((hi - lo) * k) / 90; ths.add(th); }
  for (const b of [Math.asin(Math.min(1, a / rMin)), Math.acos(Math.min(1, a / rMin))]) if (b > lo && b < hi) ths.add(b);
  const list = [...ths].sort((p, q) => p - q);
  const P = (r: number, th: number): Pt => [sx * r * Math.cos(th), sz * r * Math.sin(th)];
  const poly: Pt[] = [...list.map((th) => P(rin(th), th)), ...list.slice().reverse().map((th) => P(rout(th), th))];
  return { poly, thLo: lo, thHi: hi, thMid: (lo + hi) / 2 };
}

let cache: ShopSlot[] | null = null;
/** The 8 shop slots (the same on every floor). */
export function shopSlots(): ShopSlot[] {
  if (cache) return cache;
  const cols = floorLayout().cols;
  const out: ShopSlot[] = [];
  for (const ring of ['inner', 'outer'] as const) QUADS.forEach(([sx, sz], q) => {
    const rMin = ring === 'inner' ? SHOP.promR : OUTER_R;
    const S = sector(sx, sz, rMin, ring === 'inner' ? SHOP.ring1 : null);
    const th = S.thMid, c = Math.cos(th), s = Math.sin(th);
    const at = (r: number): [number, number] => [sx * r * c, sz * r * s];
    const toward: [number, number] = [-sx * c, -sz * s]; // from the shop towards the centre
    const sg = at(rMin + 0.5);
    let rb = rMin + 8; // the board post must not stand in a column
    for (let k = 0; k < 14; k++) { const [bx, bz] = at(rb); if (cols.some(([cx, cz]) => Math.abs(cx - bx) < 1.2 && Math.abs(cz - bz) < 1.2)) rb += 0.5; else break; }
    const bd = at(rb), vw = at(rMin + 3);
    out.push({
      index: out.length, ring, sx, sz, poly: S.poly, area: area(S.poly), thMid: th, rIn: rMin,
      sign: { x: sg[0], z: sg[1], yaw: Math.atan2(toward[0], toward[1]) },
      board: { x: bd[0], z: bd[1], yaw: Math.atan2(toward[0], toward[1]) },
      view: { x: vw[0], z: vw[1], yaw: Math.atan2(sx * c, sz * s) },
    });
    void q;
  });
  cache = out;
  return out;
}

/** The 4 department signs (each two-sided) over the axis aisles: position + the unit axis direction. */
export function deptPoses(): { x: number; z: number; ax: number; az: number }[] {
  const r = SHOP.deptR;
  return [{ x: r, z: 0, ax: 1, az: 0 }, { x: -r, z: 0, ax: -1, az: 0 }, { x: 0, z: r, ax: 0, az: 1 }, { x: 0, z: -r, ax: 0, az: -1 }];
}
