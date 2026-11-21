// Where EVLab stands in the world, the level plot it needs, and the zone that local streets keep out of.
// Pure numbers + a few functions (no three.js / DOM), so the terrain generator, the road planner and their workers can use it.
//
// Step R0d: the campus frame is turned so every plot edge is parallel to the J1 arms (the N arm and the W arm are 90 deg apart, so both are parallel to a plot edge).
// Step RT1: yaw is now -52.5 deg (37.5 deg turned 90 deg anticlockwise in place about the plot centre, EVLAB_POS unchanged). Two frames are used:
//  - WORLD metres (x = east, z = south).
//  - building-LOCAL metres (lx = "east" of the building, lz = "south" = the entrance / gate side), origin = the building centre (EVLAB_ORIGIN).
// world = ORIGIN + R(yaw) * local with R = [cos -sin; sin cos], i.e. local +x is (cos yaw, sin yaw) = the J1 "N" arm direction (RT1; it was "E" at yaw 37.5) and local +z
// (-sin yaw, cos yaw) = the J1 "E" arm direction (it was "S"). The building group is rotated by -yaw about y (three.js convention). Use localToWorld / worldToLocal, never add offsets by hand.
import { GATE_Z, lakeDepth } from './EVLabCampus';
import { DRIVE_PTS } from './EVLabParking';
import { J1_ARM_DATA } from '../roads/junction/J1ArmData';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * Yaw of the campus. Step RT1: turned 90 deg ANTICLOCKWISE (seen from above, north up) from the R0d yaw of J1 (37.5 deg) in place, about the plot centre:
 * 37.5 - 90 = -52.5 deg. -52.5 is still 90 deg off the J1 arms, so every plot edge stays parallel to a J1 arm. Local +x = J1 "N" arm direction,
 * local +z (the gate / south side) = J1 "E" arm direction, local -z (the hill side) = J1 "W" arm direction.
 */
export const EVLAB_YAW = (-52.5 * Math.PI) / 180;
const COS = Math.cos(EVLAB_YAW), SIN = Math.sin(EVLAB_YAW);

/** Centre of the plot in the WORLD (Step R0b / R0c: scripts/evlab-rot-search.ts WEDGE=NW PW=360 PD=300 YAW=37.5, cut ~0.69 Mm3, relief 78 m). */
const PLOT_CENTRE = { x: -140, z: -620 }; // 2026-11-21: the move to (-110, -521.6) (lake corner at world (-98, -363)) is UNDONE: it put the plot's west edge on the J1-W arm axis and crashed the game start (walk path length < 0), see HANDOFF_EVLAB_RELOCATION_BN.md Step R-J1
/** Local z of the plot centre: the building stands 30 m north of it (the same 30 m as in the old 300 x 240 plot, so the R1-R4 numbers still fit). */
const PLOT_CENTRE_LZ = 30;

/** World position of the building origin (local 0, 0) = the plot centre moved 30 m "north" (local -z) in the turned frame. */
export const EVLAB_ORIGIN = { x: PLOT_CENTRE.x + SIN * PLOT_CENTRE_LZ, z: PLOT_CENTRE.z - COS * PLOT_CENTRE_LZ };

/** Building-local -> world [x, z]. */
export function localToWorld(lx: number, lz: number): [number, number] {
  return [EVLAB_ORIGIN.x + COS * lx - SIN * lz, EVLAB_ORIGIN.z + SIN * lx + COS * lz];
}
/** World -> building-local [lx, lz]. */
export function worldToLocal(x: number, z: number): [number, number] {
  const dx = x - EVLAB_ORIGIN.x, dz = z - EVLAB_ORIGIN.z;
  return [COS * dx + SIN * dz, -SIN * dx + COS * dz];
}

/**
 * The EVLab plot, in building-LOCAL metres: a fenced, perfectly level rectangle of 360 x 300 m (lx -180..180, lz -120..180) in the wedge NORTH of J1, between the
 * W arm and the N arm of the 8-lane junction. The gate side is local SOUTH (+z), facing the W arm; the car park side is local EAST (+x), facing the N arm.
 * Survey: HANDOFF_EVLAB_RELOCATION_BN.md (Part D, R0b hisab). NOT world coordinates any more: use EVLAB_FENCE / EVLAB_PLOT_AABB for the world.
 */
export const EVLAB_PLOT = { x0: -180, x1: 180, z0: -120, z1: 180 };

/** The car park strip: 40 m wide, directly "east" (local +x) of the plot, over the plot's whole depth. Local metres. It is outside the fence (visitors come in from the N arm side). */
export const EVLAB_PARKING_STRIP = { x0: EVLAB_PLOT.x1, x1: EVLAB_PLOT.x1 + 40, z0: EVLAB_PLOT.z0, z1: EVLAB_PLOT.z1 };

/** The fenced boundary of the plot (WORLD metres [x, z], closed polygon, 4 corners): the turned rectangle EVLAB_PLOT. */
export const EVLAB_FENCE: ReadonlyArray<readonly [number, number]> = [
  localToWorld(EVLAB_PLOT.x0, EVLAB_PLOT.z0),
  localToWorld(EVLAB_PLOT.x1, EVLAB_PLOT.z0),
  localToWorld(EVLAB_PLOT.x1, EVLAB_PLOT.z1),
  localToWorld(EVLAB_PLOT.x0, EVLAB_PLOT.z1),
];

/** World axis-aligned bounding box of the turned plot (for rough zone tests only: the turned plot does not fill it). */
export const EVLAB_PLOT_AABB = {
  x0: Math.min(...EVLAB_FENCE.map((p) => p[0])),
  x1: Math.max(...EVLAB_FENCE.map((p) => p[0])),
  z0: Math.min(...EVLAB_FENCE.map((p) => p[1])),
  z1: Math.max(...EVLAB_FENCE.map((p) => p[1])),
};

/** True inside the closed EVLAB_FENCE polygon (world metres). */
export function insideFence(x: number, z: number): boolean {
  let inn = false;
  const P = EVLAB_FENCE;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
}

/** The campus is built at full size (scale 1). */
export const EVLAB_SCALE = 1;

/** Centre of the plot (world) and the yaw of the frame (radians, = J1's 37.5 deg). The gate is on the local SOUTH side (+z). */
export const EVLAB_POS = { x: PLOT_CENTRE.x, z: PLOT_CENTRE.z, yaw: EVLAB_YAW };

/** Half sizes of the fenced plot in metres ALONG THE TURNED AXES (local x and local z). */
export const EVLAB_HALF_X = (EVLAB_PLOT.x1 - EVLAB_PLOT.x0) / 2; // 180
export const EVLAB_HALF_Z = (EVLAB_PLOT.z1 - EVLAB_PLOT.z0) / 2; // 150
/** The same half sizes in the campus' own local metres (scale 1, so the same numbers). */
export const EVLAB_LOCAL_HALF_X = EVLAB_HALF_X / EVLAB_SCALE;
export const EVLAB_LOCAL_HALF_Z = EVLAB_HALF_Z / EVLAB_SCALE;

/**
 * The avenue from the south bridge stops at the plot's south edge. `endZ` / `edgeZ` are building-LOCAL z (they keep their old names because
 * EVLabGrounds / EVLabParkingLot / EVLabCyclistPath still read them; they move to the new layout in Steps R2b-R4b).
 */
export const EVLAB_ROAD = { halfWidth: 8, endZ: EVLAB_PLOT.z1, edgeZ: EVLAB_PLOT.z1 };

/**
 * Where the old F6 avenue / car park entry road cut the highway median. The campus no longer touches F6, so there are no mouths; the empty list
 * keeps MedianPlan compiling (it is updated for the arm junctions in Step R6).
 */
export const EVLAB_MOUTHS: ReadonlyArray<{ x: number; z: number; halfW: number }> = [];

/** Half width (m) of a J1 arm's pavement (44.2 m wide): a gate road ends at this distance from the arm's centre line. */
export const J1_ARM_HALF_PAVEMENT = 22.1;

/**
 * The two gate roads: centre lines, first point = start at the campus side. `pts` are WORLD metres, `local` the same points in building-local metres.
 * They reserve the flat ground and the street keep-out; the ribbons are drawn along them (E: EVLabParkingLot; W: EVLabGrounds).
 * PROVISIONAL since Step R0d: they keep their R3 / R4 shapes in the LOCAL frame (so they turn with the campus) and no longer reach the arms:
 * the new routes to the N arm and the W arm come in Steps R3b / R4b.
 * - W: from the far end of the west bridge (local x -156, z = GATE_Z) straight "west" 30 m, 6 m past the fence.
 * - E: the car park entry road (EVLabParking.DRIVE_PTS).
 */
export interface GateRoad { id: 'W' | 'E'; halfWidth: number; pts: ReadonlyArray<readonly [number, number]>; local: ReadonlyArray<readonly [number, number]> }
export const W_GATE_START_LOCAL: readonly [number, number] = [-156, GATE_Z];
const W_GATE_LOCAL: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 6; i++) out.push([W_GATE_START_LOCAL[0] - 5 * i, GATE_Z] as const);
  return out;
})();
const E_GATE_LOCAL: ReadonlyArray<readonly [number, number]> = DRIVE_PTS.filter((_, i) => i % 4 === 0 || i === DRIVE_PTS.length - 1).map(([x, z]) => [x, z] as const);
const toWorldPts = (l: ReadonlyArray<readonly [number, number]>): ReadonlyArray<readonly [number, number]> => l.map(([x, z]) => localToWorld(x, z) as readonly [number, number]);

export const EVLAB_GATE_ROADS: readonly GateRoad[] = [
  { id: 'W', halfWidth: 8, local: W_GATE_LOCAL, pts: toWorldPts(W_GATE_LOCAL) },
  { id: 'E', halfWidth: 5, local: E_GATE_LOCAL, pts: toWorldPts(E_GATE_LOCAL) },
];

/**
 * Step RT7: the 5 m wide walking path from the W arm of J1 to the campus (user: pavement edge -> 5 m walking path -> lake; the campus keeps its place, so the
 * path is the link). It runs straight "west" (local -x) along the north side of the west gate road (0.5 m kerb gap), from the arm's verge edge
 * (WALK_ARM_EDGE from the arm centre line, same as the gate roads) to the west bridge landing (local x -156). The W arm axis is the J1 W axis
 * (the line through the first two points of J1ArmData 'J1-W', extended back into the lane zone). The ribbon follows the ground (EVLabGrounds).
 * PROVISIONAL like the gate roads: R4b may move the gate road, then only WALK_Z changes.
 */
export const WALK_WIDTH = 5;
export const WALK_ARM_EDGE = 24.2;
export const WALK_Z = GATE_Z - 8 - 0.5 - WALK_WIDTH / 2; // 37.5
export interface WalkPath { width: number; local: ReadonlyArray<readonly [number, number]>; pts: ReadonlyArray<readonly [number, number]>; length: number }
function makeWalkPath(): WalkPath {
  const arm = J1_ARM_DATA.find((a) => a.name === 'J1-W')!;
  const p0 = worldToLocal(arm.pts[0][0], arm.pts[0][1]), p1 = worldToLocal(arm.pts[1][0], arm.pts[1][1]);
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], dl = Math.hypot(dx, dz);
  const xAxis = p0[0] + ((WALK_Z - p0[1]) / dz) * dx; // the arm axis at z = WALK_Z (extended back into the lane zone)
  const xEdge = xAxis + (WALK_ARM_EDGE * dl) / Math.abs(dz); // the campus-side verge edge, measured across the arm
  const x1 = W_GATE_START_LOCAL[0]; // -156, the west bridge landing
  const n = Math.ceil((x1 - xEdge) / 5);
  const local: Array<readonly [number, number]> = [];
  for (let i = 0; i <= n; i++) local.push([xEdge + ((x1 - xEdge) * i) / n, WALK_Z] as const);
  return { width: WALK_WIDTH, local, pts: toWorldPts(local), length: x1 - xEdge };
}
export const EVLAB_WALK_PATH: WalkPath = makeWalkPath();

const FLAT_MARGIN = 4; // level ground outside the pad
/** Soft blend back to natural terrain. Step R5 makes it wider on the north (hill) side. */
const BLEND = 48;
/** Flat strip under a gate road (half width, m). */
const ROAD_FLAT = 14;
/** The terrain pad is slightly BELOW the floor, so the floor tiles never z-fight with the ground. */
export const EVLAB_PAD_SINK = 0.03;
/** Local streets stay this far (m) away from the plot and the car park strip. */
const STREET_KEEPOUT = 30;

// the level pad rectangle = plot + car park strip, in LOCAL metres (the turned frame)
const PAD = { x0: EVLAB_PLOT.x0, x1: EVLAB_PARKING_STRIP.x1, z0: EVLAB_PLOT.z0, z1: EVLAB_PLOT.z1 };
const PAD_CX = (PAD.x0 + PAD.x1) / 2, PAD_CZ = (PAD.z0 + PAD.z1) / 2, PAD_HX = (PAD.x1 - PAD.x0) / 2, PAD_HZ = (PAD.z1 - PAD.z0) / 2;

// cheap world pre-check box: the turned pad corners + the gate road points, grown by the blend and the road strip
const BOX = (() => {
  const pts: Array<readonly [number, number]> = [localToWorld(PAD.x0, PAD.z0), localToWorld(PAD.x1, PAD.z0), localToWorld(PAD.x1, PAD.z1), localToWorld(PAD.x0, PAD.z1)];
  for (const g of EVLAB_GATE_ROADS) pts.push(...g.pts);
  pts.push(...EVLAB_WALK_PATH.pts);
  const m = BLEND + ROAD_FLAT + FLAT_MARGIN + STREET_KEEPOUT;
  return { x0: Math.min(...pts.map((p) => p[0])) - m, x1: Math.max(...pts.map((p) => p[0])) + m, z0: Math.min(...pts.map((p) => p[1])) - m, z1: Math.max(...pts.map((p) => p[1])) + m };
})();
const inBox = (x: number, z: number): boolean => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1;

/** Distance from (x, z) to the segment a-b. */
function segDist(x: number, z: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Distance (m) to the nearest gate road centre line, minus `r` (<= 0 = on the strip). World metres. */
function gateRoadDist(x: number, z: number, r: number): number {
  let m = 1e9;
  for (const g of EVLAB_GATE_ROADS) for (let i = 0; i + 1 < g.pts.length; i++) m = Math.min(m, segDist(x, z, g.pts[i], g.pts[i + 1]));
  return Math.max(m - r, 0);
}

/** Distance (m) from (x, z) to the walking path centre line (world metres). */
function walkPathDist(x: number, z: number): number {
  let m = 1e9;
  const P = EVLAB_WALK_PATH.pts;
  for (let i = 0; i + 1 < P.length; i++) m = Math.min(m, segDist(x, z, P[i], P[i + 1]));
  return m;
}

export class EVLabSite {
  /** Centre of the plot (world). */
  readonly x = EVLAB_POS.x;
  readonly z = EVLAB_POS.z;
  /** The building origin (world): the building group stands here. */
  readonly ox = EVLAB_ORIGIN.x;
  readonly oz = EVLAB_ORIGIN.z;
  readonly yaw = EVLAB_POS.yaw;
  /** Half sizes of the plot along the turned axes (local x, local z). */
  readonly halfX = EVLAB_HALF_X;
  readonly halfZ = EVLAB_HALF_Z;
  /** Local z of the plot centre. */
  readonly centreLz = PLOT_CENTRE_LZ;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** Building-local -> world [x, z]. */
  toWorld(lx: number, lz: number): [number, number] {
    return localToWorld(lx, lz);
  }

  /** World -> building-local [lx, lz]. */
  toLocal(x: number, z: number): [number, number] {
    return worldToLocal(x, z);
  }

  /** Distance outside the level pad (plot + car park strip + the two gate road strips), 0 inside. Measured in the turned frame (rotation keeps distances). */
  private outside(x: number, z: number): number {
    const [lx, lz] = worldToLocal(x, z);
    const dx = Math.max(Math.abs(lx - PAD_CX) - (PAD_HX + FLAT_MARGIN), 0);
    const dz = Math.max(Math.abs(lz - PAD_CZ) - (PAD_HZ + FLAT_MARGIN), 0);
    return Math.min(Math.hypot(dx, dz), gateRoadDist(x, z, ROAD_FLAT));
  }

  /** True if (x, z) is on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    if (!inBox(x, z)) return false;
    return this.outside(x, z) <= BLEND * 0.5 + margin || walkPathDist(x, z) <= WALK_WIDTH / 2 + 2 + margin;
  }

  /** Inside the fenced (turned) rectangle (fence line included; `margin` < 0 = further inside). */
  inside(x: number, z: number, margin = 0): boolean {
    const [lx, lz] = worldToLocal(x, z);
    return Math.abs(lx) <= this.halfX + margin && Math.abs(lz - PLOT_CENTRE_LZ) <= this.halfZ + margin;
  }

  /** Cheap pre-check: is (x, z) on the pad or its blend skirt? */
  near(x: number, z: number): boolean {
    if (!inBox(x, z)) return false;
    return this.outside(x, z) < BLEND;
  }

  /** Flatten the ground: returns the new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    const flat = h + (this.floorY - EVLAB_PAD_SINK - h) * t;
    // the lake around the tower: carved into the level pad (building-local coordinates, see EVLabCampus)
    if (t <= 0.999) return flat;
    const [lx, lz] = worldToLocal(x, z);
    return flat - lakeDepth(lx, lz);
  }
}

/**
 * Local streets (LocalRoads) may not be planned here: the (turned) plot + the car park strip + 30 m all round, and the strips of the two gate roads.
 * This is what keeps the street grid off the site. Main roads (highways, arterials, the J1 arms) are never touched.
 */
export function evlabKeepout(x: number, z: number): boolean {
  if (!inBox(x, z)) return false;
  const [lx, lz] = worldToLocal(x, z);
  if (lx >= PAD.x0 - STREET_KEEPOUT && lx <= PAD.x1 + STREET_KEEPOUT && lz >= PAD.z0 - STREET_KEEPOUT && lz <= PAD.z1 + STREET_KEEPOUT) return true;
  for (const g of EVLAB_GATE_ROADS) {
    for (let i = 0; i + 1 < g.pts.length; i++) if (segDist(x, z, g.pts[i], g.pts[i + 1]) <= g.halfWidth + 22) return true;
  }
  if (walkPathDist(x, z) <= WALK_WIDTH / 2 + 22) return true;
  return false;
}
