// ROAD SIGNS - Step 6: the SOLID parts of a board (what a car or a person can hit): the posts and the concrete bases of a gantry, the two posts and
// the board of a side sign. Pure numbers (no three.js, no Rapier), so scripts/signs-gantry-test.ts can check them headless; SignPhysics.ts turns them into
// Rapier colliders near the player.
//
// Every board is one GROUP: a fixed body at (x, y, z) turned by `yaw` about Y (the same turn the 3D group has), and its solids in that LOCAL frame.
// So the numbers here are the same local numbers RoadSignLayer uses to place the meshes.

/** One solid in the group's local frame. k 0 = box (hx, hy, hz = half sizes), k 1 = upright cylinder (hx = radius, hy = half height). cx, cy, cz = centre. */
export interface SignSolid {
  k: 0 | 1;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface SignSolidGroup {
  /** World position of the group origin (x, z) and its height (y). */
  x: number;
  y: number;
  z: number;
  /** Turn about Y (rad), as in three.js `rotation.y`. */
  yaw: number;
  /** Largest distance from (x, z) to any solid plus its size (m): the body is created when the player is this far + the physics radius. */
  radius: number;
  solids: SignSolid[];
}

/** Colliders are a little fatter than the thin visible posts, so a car does not slip through a gap that looks closed. */
export const SOLID = {
  sidePostR: 0.12,
  /** The board of a side sign (a thin box). */
  sideBoardDepth: 0.06,
} as const;

const cyl = (cx: number, cy: number, cz: number, r: number, hy: number): SignSolid => ({ k: 1, cx, cy, cz, hx: r, hy, hz: r });
const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): SignSolid => ({ k: 0, cx, cy, cz, hx, hy, hz });

/**
 * Side sign: two posts + the board. Local frame as RoadSignLayer.addSideSign: +Z = the way the face looks, the origin on the ground at the foot.
 * `boardW`, `boardH` = size of the face (m), `clearance` = lower edge of the board above the ground, `postDx` = post offset from the centre, `postZ` = depth.
 */
export function sideSolids(boardW: number, boardH: number, clearance: number, postDx: number, postZ: number, postBelow: number): SignSolid[] {
  const top = clearance + boardH + 0.25;
  const bottom = -postBelow;
  const hy = (top - bottom) / 2;
  const out: SignSolid[] = [];
  for (const sx of [-1, 1]) out.push(cyl(sx * postDx, (top + bottom) / 2, postZ, SOLID.sidePostR, hy));
  out.push(box(0, clearance + boardH / 2, -SOLID.sideBoardDepth / 2, boardW / 2 + 0.04, boardH / 2 + 0.04, SOLID.sideBoardDepth / 2 + 0.02));
  return out;
}

/**
 * Gantry: two round posts, each with a concrete base. Local frame as RoadSignLayer.addGantry: origin on the road centreline at the road SURFACE height,
 * +X = the driver's right. `feet` = ground height of each post's foot relative to the road surface (left, right), `top` = top of the post (relative).
 * The beam and the boards are 5.6 m above the road: no car passes that high, so they get no collider.
 */
export function gantrySolids(edge: number, feet: [number, number], top: number, postR: number, postBelow: number, baseSize: number, baseHeight: number, postZ: number): SignSolid[] {
  const out: SignSolid[] = [];
  for (let k = 0; k < 2; k++) {
    const x = k === 0 ? -edge : edge;
    const bottom = Math.min(feet[k], 0) - postBelow;
    out.push(cyl(x, (top + bottom) / 2, postZ, postR, (top - bottom) / 2));
    out.push(box(x, feet[k] + baseHeight / 2 - 0.1, postZ, baseSize / 2, baseHeight / 2, baseSize / 2));
  }
  return out;
}

/** The farthest reach of a solid group from its origin (m), for the activation radius. */
export function solidsRadius(solids: readonly SignSolid[]): number {
  let r = 0;
  for (const s of solids) r = Math.max(r, Math.hypot(s.cx, s.cz) + Math.max(s.hx, s.hz) * (s.k === 0 ? 1.5 : 1));
  return r;
}
