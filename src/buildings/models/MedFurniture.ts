import type { Kit } from './BuildingKit';
import type { Facing } from './Furniture';

/**
 * MEDICAL + OFFICE FURNITURE for clinic / hospital interiors. Same rules as Furniture.ts (boxes through Kit.furn, footprint centre at (x, z), floor level y,
 * `facing` 0 = the front looks to +z). Only the big body of a piece is solid (collider); every small detail is looks only, so a ward costs few colliders.
 * Pieces are built from many thin parts (legs, rails, frames, labels, screens) so that they read as real objects and not as plain blocks.
 */
type Part = readonly [number, number, number, number, number, number, number, boolean?];

const STEEL = 0xb7bcc2;
const DARK_STEEL = 0x5d646b;
const WHITE = 0xf4f4f4;
const SHEET = 0xeaf1f5;
const WOOD = 0x8a6a45;
const LAMINATE = 0xd9d3c4;
const BLACK = 0x1d2024;
const SCREEN = 0x16324a;
const GREEN = 0x2f8f5b;
const BLUE = 0x3f78b0;

function put(k: Kit, x: number, y: number, z: number, facing: Facing, parts: readonly Part[]): void {
  for (const [dx, py, dz, w, h, d, color, solid] of parts) {
    let rx = dx, rz = dz, rw = w, rd = d;
    if (facing === 90) { rx = dz; rz = -dx; rw = d; rd = w; }
    else if (facing === 180) { rx = -dx; rz = -dz; }
    else if (facing === 270) { rx = -dz; rz = dx; rw = d; rd = w; }
    k.furn(x + rx, y + py, z + rz, rw, h, rd, color, solid ?? false);
  }
}

/** Hospital bed 0.95 x 2.1 m: steel frame on wheels, mattress, sheet, pillow, blanket, head / foot board, side rails. Head at the back. */
export function hospitalBed(k: Kit, x: number, y: number, z: number, facing: Facing, blanket = BLUE): void {
  const parts: Part[] = [
    [0, 0.22, 0, 0.95, 0.22, 2.1, STEEL, true], // frame
    [0, 0.44, 0.0, 0.88, 0.16, 2.0, WHITE], // mattress
    [0, 0.6, 0.0, 0.9, 0.02, 2.02, SHEET], // sheet
    [0, 0.6, 0.38, 0.92, 0.06, 1.2, blanket], // blanket
    [0, 0.66, -0.78, 0.55, 0.12, 0.34, WHITE], // pillow
    [0, 0.22, -1.07, 0.96, 0.75, 0.05, DARK_STEEL], // head board
    [0, 0.22, 1.07, 0.96, 0.55, 0.05, DARK_STEEL], // foot board
  ];
  for (const sx of [-1, 1]) {
    parts.push([sx * 0.49, 0.62, 0.15, 0.03, 0.3, 1.1, STEEL]); // side rail
    for (const sz of [-0.9, 0.9]) parts.push([sx * 0.4, 0, sz, 0.1, 0.22, 0.1, BLACK]); // wheel
  }
  put(k, x, y, z, facing, parts);
}

/** Examination couch 0.7 x 1.9 m: padded top, paper sheet, steel legs, a step stool beside it. */
export function examCouch(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0.45, 0, 0.7, 0.14, 1.9, 0x3b6e63, true],
    [0, 0.59, 0.1, 0.62, 0.015, 1.65, WHITE],
    [0, 0.59, -0.82, 0.62, 0.02, 0.22, SHEET],
    [-0.28, 0, -0.8, 0.06, 0.45, 0.06, STEEL], [0.28, 0, -0.8, 0.06, 0.45, 0.06, STEEL],
    [-0.28, 0, 0.8, 0.06, 0.45, 0.06, STEEL], [0.28, 0, 0.8, 0.06, 0.45, 0.06, STEEL],
    [0, 0.2, 0, 0.5, 0.04, 1.6, STEEL],
    [0.65, 0, 0.35, 0.4, 0.22, 0.3, DARK_STEEL], // step stool
  ]);
}

/** Drip stand (pole, hook arm, bag). */
export function ivStand(k: Kit, x: number, y: number, z: number): void {
  put(k, x, y, z, 0, [
    [0, 0, 0, 0.4, 0.04, 0.4, DARK_STEEL],
    [0, 0.04, 0, 0.03, 1.9, 0.03, STEEL],
    [0, 1.9, 0, 0.3, 0.03, 0.03, STEEL],
    [0.1, 1.5, 0, 0.1, 0.38, 0.04, 0xd9eef7],
    [0.1, 1.45, 0, 0.03, 0.05, 0.03, 0x9fc6d8],
  ]);
}

/** Reception desk of length w (front = the visitor side): wood front, laminate top, a monitor, keyboard, phone and a call bell. */
export function receptionDesk(k: Kit, x: number, y: number, z: number, facing: Facing, w: number): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, w, 1.05, 0.7, WOOD, true], // body
    [0, 1.05, 0.12, w + 0.08, 0.05, 0.9, LAMINATE], // visitor top
    [0, 0.0, 0.36, w - 0.1, 0.1, 0.02, DARK_STEEL], // kick plate
    [0, 0.72, -0.5, w, 0.04, 0.5, LAMINATE], // staff desk behind
    [-w / 4, 0.76, -0.45, 0.5, 0.34, 0.04, SCREEN], // monitor screen
    [-w / 4, 0.76, -0.4, 0.55, 0.38, 0.03, BLACK], // monitor frame
    [-w / 4, 0.76, -0.55, 0.06, 0.14, 0.06, DARK_STEEL], // monitor stand
    [-w / 4, 0.76, -0.25, 0.4, 0.02, 0.14, BLACK], // keyboard
    [w / 4, 1.1, 0.0, 0.14, 0.05, 0.2, BLACK], // phone
    [w / 3, 1.1, 0.25, 0.08, 0.04, 0.08, STEEL], // bell
  ]);
}

/** A row of n waiting-room chairs (moulded seat + back on steel legs, one beam), row runs along x for facing 0 / 180. */
export function waitingRow(k: Kit, x: number, y: number, z: number, facing: Facing, n: number, color = BLUE): void {
  const parts: Part[] = [[0, 0.3, 0.0, n * 0.52, 0.04, 0.05, DARK_STEEL, true]];
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 0.52;
    parts.push([cx, 0.42, 0, 0.46, 0.06, 0.46, color]); // seat
    parts.push([cx, 0.5, -0.22, 0.46, 0.4, 0.05, color]); // back
    parts.push([cx - 0.19, 0, 0.12, 0.04, 0.42, 0.04, DARK_STEEL], [cx + 0.19, 0, 0.12, 0.04, 0.42, 0.04, DARK_STEEL]);
    parts.push([cx - 0.19, 0, -0.18, 0.04, 0.5, 0.04, DARK_STEEL], [cx + 0.19, 0, -0.18, 0.04, 0.5, 0.04, DARK_STEEL]);
  }
  put(k, x, y, z, facing, parts);
}

/** Doctor's desk 1.4 x 0.7 m with drawers, monitor, keyboard, a pen stand and a prescription pad. */
export function doctorDesk(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0.7, 0, 1.4, 0.05, 0.7, LAMINATE, true],
    [-0.62, 0, 0, 0.16, 0.7, 0.6, WOOD, true], [0.5, 0, 0, 0.36, 0.7, 0.6, WOOD, true],
    [0.5, 0.45, 0.31, 0.3, 0.02, 0.01, STEEL], [0.5, 0.2, 0.31, 0.3, 0.02, 0.01, STEEL],
    [-0.25, 0.75, -0.12, 0.46, 0.3, 0.03, SCREEN], [-0.25, 0.75, -0.1, 0.5, 0.34, 0.02, BLACK],
    [-0.25, 0.75, 0.15, 0.4, 0.02, 0.14, BLACK],
    [0.2, 0.75, 0.1, 0.2, 0.01, 0.28, WHITE],
    [0.3, 0.75, -0.2, 0.07, 0.1, 0.07, DARK_STEEL],
  ]);
}

/** Swivel office chair (5-star base, seat, back, arms). */
export function officeChair(k: Kit, x: number, y: number, z: number, facing: Facing, color = 0x2c3a4a): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.5, 0.05, 0.05, BLACK], [0, 0, 0, 0.05, 0.05, 0.5, BLACK],
    [0, 0.05, 0, 0.06, 0.38, 0.06, STEEL],
    [0, 0.43, 0, 0.5, 0.08, 0.48, color, true],
    [0, 0.5, -0.24, 0.46, 0.5, 0.07, color],
    [-0.26, 0.55, 0, 0.04, 0.04, 0.3, BLACK], [0.26, 0.55, 0, 0.04, 0.04, 0.3, BLACK],
  ]);
}

/** Visitor chair (4 legs, seat, back). */
export function sideChair(k: Kit, x: number, y: number, z: number, facing: Facing, color = 0x8a6a45): void {
  put(k, x, y, z, facing, [
    [0, 0.44, 0, 0.44, 0.05, 0.44, color, true],
    [0, 0.5, -0.2, 0.44, 0.42, 0.04, color],
    [-0.18, 0, -0.18, 0.04, 0.44, 0.04, DARK_STEEL], [0.18, 0, -0.18, 0.04, 0.9, 0.04, DARK_STEEL],
    [-0.18, 0, 0.18, 0.04, 0.44, 0.04, DARK_STEEL], [0.18, 0, 0.18, 0.04, 0.44, 0.04, DARK_STEEL],
  ]);
}

/** Medicine cabinet 1.0 x 0.4 x 1.9 m: white body, glass doors, three shelves of boxes and bottles, a red cross on top. */
export function medCabinet(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.0, 1.9, 0.4, WHITE, true],
    [0, 0.9, 0.2, 0.96, 1.0, 0.02, 0xbfe0ea], // glass doors
    [0, 0.88, 0.205, 0.02, 1.02, 0.01, STEEL],
    [-0.25, 1.05, 0.215, 0.18, 0.16, 0.05, 0xd94f4f], [0.0, 1.05, 0.215, 0.18, 0.16, 0.05, 0xf4efe4], [0.26, 1.05, 0.215, 0.18, 0.16, 0.05, 0x3f7fbf],
    [-0.25, 1.4, 0.215, 0.18, 0.16, 0.05, 0xe8c547], [0.0, 1.4, 0.215, 0.18, 0.16, 0.05, 0x3b8a55], [0.26, 1.4, 0.215, 0.18, 0.16, 0.05, 0xd94f4f],
    [-0.25, 1.7, 0.215, 0.08, 0.14, 0.06, 0x9a6a3a], [-0.1, 1.7, 0.215, 0.08, 0.14, 0.06, 0x9a6a3a], [0.2, 1.7, 0.215, 0.3, 0.1, 0.06, 0xf4efe4],
    [0, 0.0, 0.21, 0.96, 0.7, 0.02, 0xe8e4d8], // closed lower doors
  ]);
}

/** Instrument trolley (steel, two trays, a few instruments). */
export function trolley(k: Kit, x: number, y: number, z: number): void {
  put(k, x, y, z, 0, [
    [0, 0.1, 0, 0.6, 0.04, 0.4, STEEL, true],
    [0, 0.8, 0, 0.6, 0.04, 0.4, STEEL],
    [-0.27, 0.1, -0.17, 0.03, 0.74, 0.03, DARK_STEEL], [0.27, 0.1, -0.17, 0.03, 0.74, 0.03, DARK_STEEL],
    [-0.27, 0.1, 0.17, 0.03, 0.74, 0.03, DARK_STEEL], [0.27, 0.1, 0.17, 0.03, 0.74, 0.03, DARK_STEEL],
    [-0.12, 0.84, 0, 0.18, 0.03, 0.1, 0x9fc6d8], [0.14, 0.84, 0.05, 0.14, 0.04, 0.08, 0xe8c547],
    [-0.27, 0.0, -0.17, 0.05, 0.1, 0.05, BLACK], [0.27, 0.0, 0.17, 0.05, 0.1, 0.05, BLACK],
  ]);
}

/** Bathroom scale + height rod (waiting-room health corner). */
export function weighScale(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.4, 0.06, 0.4, DARK_STEEL, true],
    [0, 0.06, -0.2, 0.05, 1.7, 0.04, STEEL], [0.1, 1.0, -0.12, 0.2, 0.03, 0.2, STEEL],
    [0, 0.06, 0.05, 0.2, 0.01, 0.1, GREEN],
  ]);
}

/** Water dispenser (white body, blue bottle on top, a tap). */
export function waterCooler(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 0.34, 1.0, 0.34, WHITE, true],
    [0, 1.0, 0, 0.26, 0.4, 0.26, 0x9fd0ea],
    [0, 0.72, 0.18, 0.06, 0.05, 0.04, BLUE], [0.08, 0.72, 0.18, 0.06, 0.05, 0.04, 0xd94f4f],
  ]);
}

/** Wall cross sign (green), `facing` 0 = on a back wall looking to +z. size = arm length. */
export function wallCross(k: Kit, x: number, y: number, z: number, facing: Facing, size = 0.7): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, size, size * 0.3, 0.04, GREEN],
    [0, -size * 0.35, 0, size * 0.3, size, 0.04, GREEN],
  ]);
}

/** Privacy curtain on a ceiling rail: rail + blue folds. Runs along x for facing 0 / 180, length w, height h. */
export function curtain(k: Kit, x: number, y: number, z: number, facing: Facing, w: number, h: number): void {
  const parts: Part[] = [[0, h, 0, w, 0.03, 0.03, STEEL]];
  const n = Math.max(2, Math.round(w / 0.25));
  for (let i = 0; i < n; i++) parts.push([(i - (n - 1) / 2) * (w / n), 0.55, (i % 2) * 0.03, w / n * 0.9, h - 0.55, 0.02, i % 2 ? 0x8fb8d8 : 0xa9c9e2]);
  put(k, x, y, z, facing, parts);
}

/** Ceiling light panel 0.6 x 1.2 m (pale), hung just under the ceiling: `ceilY` = y of the ceiling. */
export function ceilingLight(k: Kit, x: number, ceilY: number, z: number, long = true): void {
  k.furn(x, ceilY - 0.05, z, long ? 0.6 : 1.2, 0.04, long ? 1.2 : 0.6, 0xfbfbf2, false);
}

/** Wall clock + notice board on a back wall (`facing` 0 = the wall is at -z of the piece). */
export function noticeBoard(k: Kit, x: number, y: number, z: number, facing: Facing): void {
  put(k, x, y, z, facing, [
    [0, 0, 0, 1.2, 0.8, 0.04, 0x7a5a3a],
    [0, 0.04, 0.03, 1.1, 0.7, 0.02, 0xcdb48a],
    [-0.3, 0.3, 0.05, 0.3, 0.38, 0.01, WHITE], [0.1, 0.4, 0.05, 0.28, 0.28, 0.01, 0xe8c547], [0.38, 0.2, 0.05, 0.3, 0.4, 0.01, 0xd9eef7],
  ]);
}
