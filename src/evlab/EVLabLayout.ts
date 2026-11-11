// EVLab Tower: the numbers of the building (pure data, no three.js). Building-local frame: x = east, z = SOUTH (the entrance side), y = up,
// origin = the centre of the footprint at floor level. The building group is placed at (EVLAB_POS.x, floorY, BUILDING_Z) in the world.

/** World z of the building centre: the plot runs z -470 .. -30, so there are ~180 m of plaza in front (south) and ~180 m of gardens behind. */
export const BUILDING_Z = -260;

/** Footprint 150 m x 100 m. Ground floor clear height H = 17 m, the roof slab sits on top, the tower rises from there. */
export const BLD = { hx: 75, hz: 50, H: 17, roofTop: 19, wall: 0.5 };

/** The grand portal in the south wall. */
export const PORTAL = { halfW: 9, h: 11 };

/** The tower (levels, core, facade) is in EVLabTowerLayout. Tip of the spire: see EVLabFacade (SPIRE_TOP_Y). */
export const SPIRE_TOP = 442;

/** Presentation Hall (ground floor, north part). */
export const HALL = {
  x0: -54.5, x1: 54.5, z0: -49, z1: 13.5,
  /** Stage platform. */
  stageX: 30, stageZ1: -31, stageH: 1.2,
  /** Seating rows: row i stands at z = rowZ0 + i * rowStep. The floor rises 0.12 m per row towards the back. */
  rows: 22, rowZ0: -24, rowStep: 1.35, rise: 0.12,
  slopeZ0: -25, slopeZ1: 5.2,
} as const;

const K = HALL.rise / HALL.rowStep;
/** Height of the raked hall floor at local z. */
export const hallFloorY = (z: number): number => Math.max(0, Math.min(z, HALL.slopeZ1) - HALL.slopeZ0) * K;
/** Height of the rear aisle behind the last row (where the hall is entered). */
export const REAR_Y = hallFloorY(HALL.slopeZ1);

/** Walls between the lobby and the hall: z of the wall and the three openings (x ranges). */
export const DIVIDER = { z: 14, openings: [[-4, 4], [-34, -28], [28, 34]] as ReadonlyArray<readonly [number, number]> };
/** Where the entrance ramps climb from the lobby floor (z = rampZ1, y 0) to the rear aisle (z = DIVIDER.z + 0.5, y REAR_Y). */
export const RAMP = { z1: 27 };

/** The three seat blocks of a row (x ranges); the gaps are the aisles. */
export const SEAT_BLOCKS: ReadonlyArray<readonly [number, number]> = [[-50, -17], [-13, 13], [17, 50]];
export const SEAT_W = 0.7;

/** Lectern and where the presenter stands (behind it, facing the audience = south). */
export const LECTERN = { x: 0, z: -33.2 };
export const PRESENTER = { x: 0, z: -35.6 };

/** The big LED screen on the north wall: centre and size (m). */
export const SCREEN = { x: 0, y: 9.6, z: -48.6, w: 44, h: 12.4 };

/** A walk-collision box in building-local metres. */
export type Solid = readonly [x0: number, x1: number, z0: number, z1: number, y0: number, y1: number];
/** A sloped walking surface: top height yA at zA and yB at zB (thickness 0.6 below). */
export interface Ramp {
  x0: number; x1: number; zA: number; yA: number; zB: number; yB: number;
}

/** Pose of the thin cuboid (0.3 m half thickness) that makes a Ramp walkable: centre, half sizes and the rotation about x (quaternion x / w). */
export function rampPose(r: Ramp): { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; qx: number; qw: number } {
  // the angle is measured towards +z, so the lower-z end comes first
  const [zA, yA, zB, yB] = r.zA <= r.zB ? [r.zA, r.yA, r.zB, r.yB] : [r.zB, r.yB, r.zA, r.yA];
  const dz = zB - zA, dy = yB - yA;
  const a = Math.atan2(dy, dz);
  const th = 0.3;
  return {
    cx: (r.x0 + r.x1) / 2, cy: (yA + yB) / 2 - th * Math.cos(a), cz: (zA + zB) / 2 + th * Math.sin(a),
    hx: (r.x1 - r.x0) / 2, hy: th, hz: Math.hypot(dz, dy) / 2,
    qx: Math.sin(-a / 2), qw: Math.cos(-a / 2),
  };
}
