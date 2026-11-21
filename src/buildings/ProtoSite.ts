// Where the prototype building (the police station / thana) stands in the world, plus the flat building pad it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
// Same idea as LibrarySite: to MOVE or RESIZE the building later, only the numbers in this file change.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Which model of src/buildings/models/registry.ts stands here. Change this id to try another building on the same plot (keep it <= 70 x 62 m). */
export const PROTO_MODEL_ID = 'police_station';

/** Footprint of the model incl. its walled compound (metres). Police station = 54 x 46. */
export const PROTO_SIZE = { W: 54, D: 46 };

/**
 * The plot = a 70 x 62 m level, paved rectangle with the compound in the middle (8 m apron all round). 2026-11-21 (user): the police station stands BESIDE the SH-17 road,
 * turned to face it (it was on top of SH-17 before). The plot is now a TURNED rectangle: PROTO_POS.yaw is free, the plot is PROTO_HALF either side of PROTO_POS in the
 * building's own frame (local +z = the gate side, towards the road). No trees, rocks, grass or local streets inside. World metres (x = east, z = south).
 */
export const PROTO_HALF = { x: 35, z: 31 };

/** Centre of the compound (local origin = compound centre on the ground). The gate is on the model's local +z side, yaw turns it to face the SH-17 road. */
export const PROTO_POS = { x: -52.1, z: 7.4, yaw: -0.651 };

/** Footpath from the gate to the road edge: half width and length (m) from 1 m inside the plot's gate edge to the road edge. Local +z. */
export const PROTO_PATH = { halfWidth: 3.5, len: 11.5 };

/** Building frame -> world: x_w = x + lx cos(yaw) + lz sin(yaw), z_w = z - lx sin(yaw) + lz cos(yaw) (same as the group's own yaw turn). */
export function protoToWorld(lx: number, lz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const c = Math.cos(PROTO_POS.yaw), s = Math.sin(PROTO_POS.yaw);
  out.x = PROTO_POS.x + lx * c + lz * s;
  out.z = PROTO_POS.z - lx * s + lz * c;
  return out;
}

/** Axis-aligned bounding box of the (turned) plot: for quick rejects, tests and the street keep-out. */
export const PROTO_PLOT = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [fx, fz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const w = protoToWorld(fx * PROTO_HALF.x, fz * PROTO_HALF.z);
    x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x); z0 = Math.min(z0, w.z); z1 = Math.max(z1, w.z);
  }
  return { x0, x1, z0, z1 };
})();

/** Soft blend (m) from the level plot back to natural terrain, and the zone local streets keep out of. */
const BLEND = 10;
const STREET_KEEPOUT = 30;
/** The terrain pad is slightly BELOW the floor, so the floor never z-fights with the ground. */
export const PROTO_PAD_SINK = 0.03;

export class ProtoSite {
  readonly x = PROTO_POS.x;
  readonly z = PROTO_POS.z;
  readonly yaw = PROTO_POS.yaw;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;

  /** World -> the building's own frame (inverse of the yaw turn). */
  private local(x: number, z: number): { lx: number; lz: number } {
    const dx = x - PROTO_POS.x, dz = z - PROTO_POS.z, c = Math.cos(PROTO_POS.yaw), s = Math.sin(PROTO_POS.yaw);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }

  /** Distance outside the pad (turned plot rectangle + footpath strip), 0 inside. */
  private outside(x: number, z: number): number {
    const { lx, lz } = this.local(x, z);
    const dx = Math.max(Math.abs(lx) - PROTO_HALF.x, 0);
    const dz = Math.max(Math.abs(lz) - PROTO_HALF.z, 0);
    const rect = Math.hypot(dx, dz);
    const px = Math.max(Math.abs(lx) - PROTO_PATH.halfWidth, 0);
    const pz = Math.max(PROTO_HALF.z - 1 - lz, lz - (PROTO_HALF.z - 1 + PROTO_PATH.len), 0);
    return Math.min(rect, Math.hypot(px, pz));
  }

  /** True if (x, z) is on the plot (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Strictly inside the plot rectangle (HUD area label). */
  onPlot(x: number, z: number): boolean {
    const { lx, lz } = this.local(x, z);
    return Math.abs(lx) <= PROTO_HALF.x && Math.abs(lz) <= PROTO_HALF.z;
  }

  /** Cheap pre-check: is (x, z) on the pad or its blend skirt? */
  near(x: number, z: number): boolean {
    return this.outside(x, z) < BLEND;
  }

  /** Flatten the ground: returns the new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    return h + (this.floorY - PROTO_PAD_SINK - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned on the plot (+ 30 m all round). Main roads are never touched. */
export function protoKeepout(x: number, z: number): boolean {
  const P = PROTO_PLOT;
  return x >= P.x0 - STREET_KEEPOUT && x <= P.x1 + STREET_KEEPOUT && z >= P.z0 - STREET_KEEPOUT && z <= P.z1 + STREET_KEEPOUT;
}
