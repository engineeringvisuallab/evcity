import type { Kit } from './BuildingKit';

/**
 * FURNITURE LIBRARY for the inside of walk-in buildings: low-poly pieces made of boxes (Kit.furn), same style as the rest of the city.
 * Every piece is placed with its footprint CENTRE at (x, z), standing on floor level y, and turned by `facing`:
 *   0   = the front of the piece looks to +z (piece stands against a back wall)      90  = front looks to +x (piece against a left wall)
 *   180 = front looks to -z (piece against a front wall)                              270 = front looks to -x (piece against a right wall)
 * The head of a bed is at its BACK (opposite of the front). Colours go through the normal surface map (wood, metal, plaster ...).
 */
export type Facing = 0 | 90 | 180 | 270;

/** dx, y, dz, w, h, d, colour, solid (default true) - all in the piece's own frame (front = +z). */
type Part = readonly [number, number, number, number, number, number, number, boolean?];

const WOOD = 0x8a6a45;
const DARK_WOOD = 0x5a3a24;
const WHITE = 0xf4f4f4;
const STEEL = 0xb7bcc2;

function put(k: Kit, x: number, y: number, z: number, facing: Facing, parts: readonly Part[]): void {
  for (const [dx, py, dz, w, h, d, color, solid] of parts) {
    let rx = dx, rz = dz, rw = w, rd = d;
    if (facing === 90) { rx = dz; rz = -dx; rw = d; rd = w; }
    else if (facing === 180) { rx = -dx; rz = -dz; }
    else if (facing === 270) { rx = -dz; rz = dx; rw = d; rd = w; }
    k.furn(x + rx, y + py, z + rz, rw, h, rd, color, solid ?? true);
  }
}

/** Double bed 1.5 x 2.0 m, head at the back. */
export function bed(k: Kit, x: number, y: number, z: number, facing: Facing, blanket = 0x4f78a8): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.5, 0.5, 2.0, WOOD],
    [0, 0.5, 0.05, 1.4, 0.18, 1.9, 0xe9edf2, false],
    [0, 0.68, 0.35, 1.42, 0.05, 1.25, blanket, false],
    [-0.35, 0.68, -0.72, 0.5, 0.12, 0.32, WHITE, false],
    [0.35, 0.68, -0.72, 0.5, 0.12, 0.32, WHITE, false],
    [0, 0.5, -1.0, 1.5, 0.75, 0.08, DARK_WOOD, false],
  ]);
}

/** Sofa 1.9 x 0.9 m. */
export function sofa(k: Kit, x: number, y: number, z: number, facing: Facing, color = 0x7a8fa8): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.9, 0.42, 0.9, color],
    [0, 0.42, -0.35, 1.9, 0.45, 0.2, color, false],
    [-0.85, 0.42, 0.05, 0.2, 0.25, 0.7, color, false],
    [0.85, 0.42, 0.05, 0.2, 0.25, 0.7, color, false],
  ]);
}

/** Low table 1.0 x 0.6 m. */
export function coffeeTable(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0.3, 0, 1.0, 0.12, 0.6, WOOD],
    [-0.42, 0, -0.22, 0.06, 0.3, 0.06, DARK_WOOD, false],
    [0.42, 0, -0.22, 0.06, 0.3, 0.06, DARK_WOOD, false],
    [-0.42, 0, 0.22, 0.06, 0.3, 0.06, DARK_WOOD, false],
    [0.42, 0, 0.22, 0.06, 0.3, 0.06, DARK_WOOD, false],
  ]);
}

/** TV on a low cabinet, 1.5 x 0.4 m, the screen looks to the front. */
export function tvUnit(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.5, 0.5, 0.4, DARK_WOOD],
    [0, 0.5, 0, 0.3, 0.2, 0.12, 0x15181c, false],
    [0, 0.7, 0, 1.1, 0.65, 0.06, 0x15181c, false],
  ]);
}

/** Dining table 1.6 x 0.9 m (long side along x when facing is 0 or 180). */
export function diningTable(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0.68, 0, 1.6, 0.08, 0.9, WOOD],
    [-0.72, 0, -0.37, 0.08, 0.68, 0.08, DARK_WOOD, false],
    [0.72, 0, -0.37, 0.08, 0.68, 0.08, DARK_WOOD, false],
    [-0.72, 0, 0.37, 0.08, 0.68, 0.08, DARK_WOOD, false],
    [0.72, 0, 0.37, 0.08, 0.68, 0.08, DARK_WOOD, false],
  ]);
}

/** Chair 0.45 x 0.45 m, the sitter looks to the front, the back rest is behind. */
export function chair(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0.42, 0, 0.45, 0.06, 0.45, WOOD, false],
    [0, 0.48, -0.2, 0.45, 0.5, 0.05, WOOD, false],
    [-0.18, 0, -0.18, 0.05, 0.42, 0.05, DARK_WOOD, false],
    [0.18, 0, -0.18, 0.05, 0.42, 0.05, DARK_WOOD, false],
    [-0.18, 0, 0.18, 0.05, 0.42, 0.05, DARK_WOOD, false],
    [0.18, 0, 0.18, 0.05, 0.42, 0.05, DARK_WOOD, false],
  ]);
}

/** Wardrobe 1.2 x 0.55 x 2.0 m. */
export function wardrobe(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.2, 2.0, 0.55, WOOD],
    [0, 0.05, 0.28, 0.02, 1.9, 0.01, DARK_WOOD, false],
    [-0.08, 1.0, 0.29, 0.03, 0.2, 0.03, 0xc9b27a, false],
    [0.08, 1.0, 0.29, 0.03, 0.2, 0.03, 0xc9b27a, false],
  ]);
}

/** Bedside table 0.4 x 0.4 x 0.5 m. */
export function bedside(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.4, 0.5, 0.4, DARK_WOOD],
    [0, 0.5, 0, 0.14, 0.2, 0.14, 0xe8c547, false],
  ]);
}

/** Kitchen counter of length w, depth 0.6 m, with a sink, a hob and wall cupboards. */
export function counter(k: Kit, x: number, y: number, z: number, facing: Facing, w: number): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, w, 0.9, 0.6, 0xe8e4d8],
    [0, 0.9, 0.02, w, 0.05, 0.64, 0x3a3f45, false],
    [w / 4, 0.95, 0.02, 0.5, 0.03, 0.4, 0x9aa3a8, false],
    [-w / 4, 0.95, 0.02, 0.55, 0.03, 0.45, 0x222222, false],
    [0, 1.5, -0.12, w, 0.7, 0.35, WOOD, false],
  ]);
}

/** Fridge 0.7 x 0.7 x 1.75 m. */
export function fridge(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.7, 1.75, 0.7, 0xdddddd],
    [0.28, 0.9, 0.36, 0.03, 0.5, 0.03, 0x555a60, false],
  ]);
}

/** Toilet (cistern at the back), about 0.4 x 0.6 m. */
export function toilet(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0.05, 0.38, 0.4, 0.55, WHITE],
    [0, 0.4, -0.2, 0.38, 0.4, 0.18, WHITE, false],
  ]);
}

/** Wash basin on a pedestal, about 0.5 x 0.4 m. */
export function basin(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.22, 0.75, 0.22, WHITE],
    [0, 0.75, 0, 0.5, 0.15, 0.4, WHITE, false],
    [0, 0.9, -0.2, 0.04, 0.2, 0.04, STEEL, false],
  ]);
}

/** Pot plant 0.35 x 0.35 m, 0.95 m high. */
export function plant(k: Kit, x: number, y: number, z: number): void {
  put(k, x, y, z, 0, [
    [0, 0, 0, 0.35, 0.35, 0.35, 0xa4552f],
    [0, 0.35, 0, 0.5, 0.6, 0.5, 0x3f7a3a, false],
  ]);
}
