// Where the engineering plants (SWTP water treatment, STP sewage treatment) stand in the world, plus the level pad each one needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
//
// Placement rule (see CHANGES_BN.md): the SWTP takes river water UPSTREAM; the STP releases treated water DOWNSTREAM, 800 m further down the
// same river (the river runs south-west to the sea here). Each site is turned so that its river side faces the river.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export interface InfraPlacement {
  id: 'swtp' | 'stp' | 'thermal';
  nameBn: string;
  /** site origin (the local (0,0) of the plant) and yaw: local +x maps to world (cos yaw, -sin yaw) */
  x: number;
  z: number;
  yaw: number;
  /** the level pad in local metres (= the ground plate of the plant) */
  rect: { x0: number; x1: number; z0: number; z1: number };
  /** which local side faces the river */
  riverSide: 'W' | 'E' | 'none';
  /** HUD / minimap colour and the one-letter minimap mark */
  color: string;
  mark: string;
  /** how deep (m) the ground under the pad is dug (the plant's tanks and wells are sunk into it) */
  deep: number;
  /** grading skirt width (m) from the pad back to natural ground, and on the river side (short: the river is close) */
  blend: number;
  riverBlend: number;
  /** floor raised this many metres above the natural ground (flood safety for a plant that stands on the flood plain) */
  lift: number;
}

const d2r = Math.PI / 180;
export const INFRA_PLACEMENTS: InfraPlacement[] = [
  { id: 'swtp', nameBn: 'জল শোধনাগার (SWTP)', x: -180, z: 1260, yaw: 161.2 * d2r, rect: { x0: -168, x1: 158, z0: -113, z1: 113 }, riverSide: 'W', color: '#0ea5e9', mark: 'W', deep: 10, blend: 30, riverBlend: 22, lift: 2.5 },
  { id: 'stp', nameBn: 'পয়ঃশোধনাগার (STP)', x: -240, z: 2040, yaw: 142.2 * d2r, rect: { x0: -153, x1: 153, z0: -103, z1: 103 }, riverSide: 'E', color: '#92400e', mark: 'S', deep: 7.5, blend: 30, riverBlend: 10, lift: 0 },
  // Thermal power plant: stands inside the engineering area 'eng-thermal-power' (x 700..1150, z -3150..-2850), no river needed.
  // Pad 348 x 224 m: clear of the pond in the area's south-west corner and of the public road just east of it; entrance on the south side (local +z).
  { id: 'thermal', nameBn: 'তাপ বিদ্যুৎ কেন্দ্র', x: 925, z: -3010, yaw: 0, rect: { x0: -165, x1: 183, z0: -112, z1: 112 }, riverSide: 'none', color: '#f59e0b', mark: 'T', deep: 3, blend: 28, riverBlend: 28, lift: 0 },
];

/** Floor is cut slightly BELOW the plate so the plate never z-fights with the ground. */
export const INFRA_PAD_SINK = 0.03;
/** The ground under the outer INSET metres of the pad stays level (no moat next to the plate edge); then it drops over EDGE_DROP metres. */
const INSET = 3;
const EDGE_DROP = 2.5;

export class InfraSite {
  readonly id: InfraPlacement['id'];
  readonly nameBn: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly rect: InfraPlacement['rect'];
  readonly deep: number;
  readonly lift: number;
  readonly riverSide: InfraPlacement['riverSide'];
  readonly color: string;
  readonly mark: string;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;
  private readonly c: number;
  private readonly s: number;
  private readonly side: number;
  private readonly blend: number;
  private readonly riverBlend: number;

  constructor(p: InfraPlacement) {
    this.id = p.id;
    this.nameBn = p.nameBn;
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.yaw;
    this.rect = p.rect;
    this.deep = p.deep;
    this.lift = p.lift;
    this.riverSide = p.riverSide;
    this.color = p.color;
    this.mark = p.mark;
    this.c = Math.cos(p.yaw);
    this.s = Math.sin(p.yaw);
    this.side = p.riverSide === 'W' ? -1 : p.riverSide === 'E' ? 1 : 0;
    this.blend = p.blend;
    this.riverBlend = p.riverBlend;
  }

  /** World (x, z) -> the plant's local (x, z). */
  toLocal(wx: number, wz: number, out: { x: number; z: number }): void {
    const dx = wx - this.x;
    const dz = wz - this.z;
    out.x = dx * this.c - dz * this.s;
    out.z = dx * this.s + dz * this.c;
  }
  /** The plant's local (x, z) -> world. */
  toWorld(lx: number, lz: number, out: { x: number; z: number }): void {
    out.x = this.x + lx * this.c + lz * this.s;
    out.z = this.z - lx * this.s + lz * this.c;
  }

  private readonly t = { x: 0, z: 0 };

  /** Signed distance to the pad rectangle (negative inside) and how far past the river-side edge the point is (0 if not). */
  private dist(x: number, z: number): { s: number; river: number } {
    this.toLocal(x, z, this.t);
    const R = this.rect;
    const ex = Math.max(R.x0 - this.t.x, this.t.x - R.x1);
    const ez = Math.max(R.z0 - this.t.z, this.t.z - R.z1);
    const s = ex > 0 || ez > 0 ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez);
    const past = this.side === 0 ? 0 : this.side < 0 ? R.x0 - this.t.x : this.t.x - R.x1;
    return { s, river: Math.max(past, 0) };
  }

  private skirt(river: number): number {
    return this.blend + (this.riverBlend - this.blend) * smoothstep(0, 10, river);
  }

  /** True if (x, z) is on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.dist(x, z).s <= margin + 6;
  }

  /** Inside the plant's fence line (+ margin). */
  inside(x: number, z: number, margin = 0): boolean {
    return this.dist(x, z).s <= margin;
  }

  /** Cheap pre-check: is (x, z) on the pad or its grading skirt? */
  near(x: number, z: number): boolean {
    const { s, river } = this.dist(x, z);
    return s < this.skirt(river);
  }

  /** The new ground height for natural ground height `h` at (x, z). `k` (0..1) weakens the grading skirt where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const { s, river } = this.dist(x, z);
    const top = this.floorY - INFRA_PAD_SINK;
    if (s <= 0) return top - this.deep * smoothstep(0, EDGE_DROP, Math.max(0, -s - INSET)); // under the pad: dug out, the plate covers it
    const b = this.skirt(river);
    if (s >= b) return h;
    const t = (1 - smoothstep(0, b, s)) * k;
    return h + (top - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned near a plant. Main roads are never touched. */
export function infraKeepout(x: number, z: number): boolean {
  for (const p of INFRA_PLACEMENTS) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const dx = x - p.x;
    const dz = z - p.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (lx > p.rect.x0 - 40 && lx < p.rect.x1 + 40 && lz > p.rect.z0 - 40 && lz < p.rect.z1 + 40) return true;
  }
  return false;
}
