// EVLab Tower v1.3: the numbers of the TOWER (pure data, no three.js). Building-local frame as in EVLabLayout (x east, z south, y up, origin = footprint centre at floor level).
// The tower stands on the south part of the podium roof, right above the lobby (so the Presentation Hall stays column-free). In its middle are two concrete CORE blocks, one on each side of the open lobby (v1.4: west = stair A + lift 1, east = lift 2 + stair B); the old layout was:
// stair A | lift 1 | open corridor | lift 2 | stair B, from the ground to the roof.
import { defineFurniture } from './EVLabFurnModels';
import type { Furnish } from './EVLabFurniture';
import { blockRect, blockToDesign, blockToWorld, rampPose, type Ramp, type Solid } from './EVLabLayout';

export type { Ramp, Solid };
export { blockToDesign, blockToWorld };

/** A box turned about y (the chamfered corners of the glass wall). */
export interface Obb { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }

export const T = {
  cx: 0, cz: 35,
  /** Level 1 floor = the podium roof top. */
  y1: 19,
  floorH: 4.2,
  /** Levels 1..88 are tower floors, level 89 is the open roof garden (the tower was made bigger: wider plates, 20 more floors). */
  top: 88, roof: 89,
  slab: 0.4,
  /** Stair stops between the ground (0) and level 1 (the podium is 19 m high): 5 flights pairs of 3.8 m. */
  podiumStops: 5,
  /** Glass wall inset: the walkable plate ends this far inside the facade ring. */
  wallIn: 0.5,
  coreTopAbove: 3.4,
} as const;

export const SETBACKS = [15, 30, 45] as const;
/** How much wider the tower plates are than the first version. */
export const TOWER_WIDEN = 1.6;
/** Step 2.5x: the plate is 2.5 x deeper (north-south) = 2.5 x the floor area. The south face (the front) stays where it was, the plate grows towards the back (north). Height is unchanged. */
export const TOWER_DEEPEN = 2.5;

/** Floor surface height of a level (0 = ground floor). */
export function levelY(n: number): number {
  return n <= 0 ? 0 : T.y1 + (n - 1) * T.floorH;
}
export const ROOF_Y = levelY(T.roof);
export const CORE_TOP = ROOF_Y + T.coreTopAbove;
/** Height of the ceiling of a level (underside of the next slab). */
export const ceilY = (n: number): number => (n <= 0 ? 17 : levelY(n) + T.floorH - T.slab);

// ---------------------------------------------------------------- the glass ring (plan of the tower at a level)
export interface Ring { hx: number; hz: number; c: number; /** z of the centre of the plate (the plate grows to the north, the south face stays) */ cz: number }
const S_Y0 = T.y1, S_Y1 = ROOF_Y;
/** Half sizes and corner chamfer of the facade at level n (constant over the level: the little steps hide behind the slab ledges). */
export function ringOf(n: number): Ring {
  const nn = Math.min(Math.max(n, 1), T.top);
  const s = Math.min(1, Math.max(0, (levelY(nn) - S_Y0) / (S_Y1 - S_Y0)));
  const sm = Math.pow(s, 1.15);
  const steps = SETBACKS.filter((b) => nn >= b).length;
  // BIGGER TOWER: the plates are 1.6 x wider than before (the core with the stairs and lifts stays exactly as it was, in the middle);
  // the depth grows only by 1 m because the south face may not stand outside the podium (z 50).
  const hz0 = 14.5 - 2 * sm - 0.5 * steps, south = T.cz + hz0, hz = hz0 * TOWER_DEEPEN;
  return { hx: (40 - 14 * sm - 2.4 * steps) * TOWER_WIDEN, hz, c: (6 - 2 * sm) * 1.4, cz: south - hz };
}
/** The 8 corners of a ring (x, z) going clockwise from the north-west chamfer; `inset` shrinks it. */
export function ringPoints(r: Ring, inset = 0): Array<[number, number]> {
  const hx = r.hx - inset, hz = r.hz - inset, c = Math.max(0.5, r.c - inset * 0.4), cx = T.cx, cz = r.cz;
  return [
    [cx - hx + c, cz - hz], [cx + hx - c, cz - hz], [cx + hx, cz - hz + c], [cx + hx, cz + hz - c],
    [cx + hx - c, cz + hz], [cx - hx + c, cz + hz], [cx - hx, cz + hz - c], [cx - hx, cz - hz + c],
  ];
}
/** Is (x, z) inside the ring (shrunk by `inset`)? */
export function inRing(r: Ring, x: number, z: number, inset = 0): boolean {
  const hx = r.hx - inset, hz = r.hz - inset, c = Math.max(0.5, r.c - inset * 0.4);
  const dx = Math.abs(x - T.cx), dz = Math.abs(z - r.cz);
  return dx <= hx && dz <= hz && dx + dz <= hx + hz - c;
}

// ---------------------------------------------------------------- the core
/** The core is split in two: the WEST block (stair A + lift 1) and the EAST block (lift 2 + stair B) stand SPLIT m further out, so the middle of the lobby is open. */
export const SPLIT = 11.5;
/**
 * v1.6: the blocks are TURNED a quarter turn about their centre so the doors face the lobby between them (see BLOCK_PIVOT in EVLabLayout).
 * Everything inside a block (shafts, stairs, doors, cabins) is still described in its old DESIGN frame (door side = +z): CORE_D / CORES_D / LIFTS / STAIRS / ST / CAB.
 * CORES and CORE are the real footprints in building coordinates (west block: door side +x, east block: door side -x).
 */
export const CORE_D = { x0: -14.5 - SPLIT, x1: 14.5 + SPLIT, z0: 28.8, z1: 41.2 };
export const CORES_D: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number }> = [
  { x0: -14.5 - SPLIT, x1: -2.4 - SPLIT, z0: 28.8, z1: 41.2 },
  { x0: 2.4 + SPLIT, x1: 14.5 + SPLIT, z0: 28.8, z1: 41.2 },
];
/** The two blocks in building coordinates (x0, x1, z0, z1): west, east. */
export const CORES: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number }> = CORES_D.map((b, i) => {
  const r = blockRect(i, b.x0, b.x1, b.z0, b.z1);
  return { x0: r[0], x1: r[1], z0: r[2], z1: r[3] };
});
/** Bounding box of both blocks in building coordinates. */
export const CORE = { x0: CORES[0].x0, x1: CORES[1].x1, z0: Math.min(CORES[0].z0, CORES[1].z0), z1: Math.max(CORES[0].z1, CORES[1].z1) };
export const WALL_T = 0.5;
/** Two glass lift shafts, doors to the south (+z). Cabin: 3.0 x 3.2 m, 2.9 m high. */
export const LIFTS = [
  { id: 0, name: 'Lift 1', sx0: -6.6 - SPLIT, sx1: -2.4 - SPLIT, sz0: 36.8, sz1: 41.2, cx: -4.5 - SPLIT, doorHalf: 0.8 },
  { id: 1, name: 'Lift 2', sx0: 2.4 + SPLIT, sx1: 6.6 + SPLIT, sz0: 36.8, sz1: 41.2, cx: 4.5 + SPLIT, doorHalf: 0.8 },
] as const;
export const CAB = { hx: 1.5, z0: 37.8, z1: 41.0, h: 3.3, floorT: 0.3, doorH: 2.9, speed: 6, accel: 1.6 };
export const SHAFT_WALL = 0.2;

/** Two fire stairs. Inner well 5.5 x 11.4 m, switchback flights (2.3 m wide, 4.2 m run), mid landing at the north end, door in the south wall. */
export const STAIRS = [
  { id: 0, name: 'Stair A', x0: -14.0 - SPLIT, x1: -8.5 - SPLIT, doorX: -11.25 - SPLIT },
  { id: 1, name: 'Stair B', x0: 8.5 + SPLIT, x1: 14.0 + SPLIT, doorX: 11.25 + SPLIT },
] as const;
export const ST = { zN: 29.3, zS: 40.7, flightZ0: 33.0, flightZ1: 37.2, flightW: 2.3, doorHalf: 0.8, doorH: 2.4 };
/** Flight x ranges: the flight that goes up from the south landing is on the outer side (A: west), the one that comes back down to the landing is on the inner side. */
export function flightX(s: (typeof STAIRS)[number], which: 1 | 2): [number, number] {
  const west = s.id === 0;
  const outer: [number, number] = west ? [s.x0 + 0.2, s.x0 + 0.2 + ST.flightW] : [s.x1 - 0.2 - ST.flightW, s.x1 - 0.2];
  const inner: [number, number] = west ? [s.x1 - 0.1 - ST.flightW, s.x1 - 0.1] : [s.x0 + 0.1, s.x0 + 0.1 + ST.flightW];
  return which === 1 ? outer : inner;
}

/** Stair stops: heights where a landing is at floor level (the podium has 5 intermediate stops with no doors). */
export const STOPS: number[] = (() => {
  const a: number[] = [];
  for (let i = 0; i < T.podiumStops; i++) a.push((levelY(1) / T.podiumStops) * i);
  for (let n = 1; n <= T.roof; n++) a.push(levelY(n));
  return a;
})();
/** Level of a stop (-1 = podium stair stop with no floor). */
export const stopLevel = (i: number): number => (i < T.podiumStops ? (i === 0 ? 0 : -1) : i - T.podiumStops + 1);

// ---------------------------------------------------------------- the floor directory
export type FloorKind = 'ground' | 'lobby' | 'office' | 'garden' | 'mech' | 'coming' | 'restaurant' | 'boardroom' | 'deck' | 'roof';
export interface FloorInfo { level: number; name: string; kind: FloorKind; y: number }
const SPECIAL: Record<number, [string, FloorKind]> = {
  1: ['Sky Lobby & Cafe', 'lobby'], 15: ['Sky Garden I', 'garden'], 21: ['Mechanical Floor', 'mech'], 30: ['Sky Garden II', 'garden'],
  31: ['Innovation Studio', 'coming'], 41: ['Mechanical Floor', 'mech'], 45: ['Sky Garden III', 'garden'], 50: ['Engineering Library', 'coming'],
  55: ['Conference Centre', 'coming'], 60: ['Mechanical Floor', 'mech'], 65: ['Research Labs', 'coming'], 70: ['Mechanical Floor', 'mech'],
  75: ['Sky Garden IV', 'garden'], 80: ['Data Centre', 'coming'], 84: ['Executive Suites', 'coming'], 85: ['Executive Boardroom', 'boardroom'],
  86: ['Sky Restaurant', 'restaurant'], 87: ['Club Lounge', 'coming'], 88: ['Observation Deck 360', 'deck'], 89: ['Roof Garden', 'roof'],
};
export const FLOORS: FloorInfo[] = (() => {
  const a: FloorInfo[] = [{ level: 0, name: 'Grand Lobby & Presentation Hall', kind: 'ground', y: 0 }];
  for (let n = 1; n <= T.roof; n++) {
    const s = SPECIAL[n];
    a.push({ level: n, name: s ? s[0] : `Office Floor ${n}`, kind: s ? s[1] : 'office', y: levelY(n) });
  }
  return a;
})();
export const levelLabel = (n: number): string => (n === 0 ? 'G' : String(n));

/** Level whose floor is at or just below height y (building-local); -1 below the podium roof zone. */
export function levelAtY(y: number): number {
  if (y < levelY(1) - 0.5) return 0;
  return Math.min(T.roof, Math.max(1, Math.floor((y - T.y1 + 0.5) / T.floorH) + 1));
}

// ---------------------------------------------------------------- collision of the core and the floors
export interface TowerColliders {
  solids: Solid[];
  obbs: Obb[];
  ramps: Ramp[];
  /** Door blockers of the lifts: lift id, level, box. Enabled unless the cabin stands there with open doors. */
  landing: Array<{ lift: number; level: number; box: Solid }>;
}

/** A rectangle minus holes -> boxes (the holes must lie inside it). Simple strip decomposition. */
export function rectMinus(x0: number, x1: number, z0: number, z1: number, holes: ReadonlyArray<readonly [number, number, number, number]>): Array<[number, number, number, number]> {
  const xs = [x0, x1];
  for (const h of holes) xs.push(h[0], h[1]);
  const u = [...new Set(xs.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i + 1 < u.length; i++) {
    const a = u[i], b = u[i + 1], mx = (a + b) / 2;
    const cut = holes.filter((h) => mx > h[0] && mx < h[1]).sort((p, q) => p[2] - q[2]);
    let z = z0;
    for (const h of cut) { if (h[2] > z + 1e-6) out.push([a, b, z, h[2]]); z = Math.max(z, h[3]); }
    if (z1 > z + 1e-6) out.push([a, b, z, z1]);
  }
  return out;
}

/** The slab holes of the core at any level, in the DESIGN frame: the two lift shafts. (Stair wells have their own floor pieces.) */
export function slabHolesD(): Array<[number, number, number, number, number]> {
  const h: Array<[number, number, number, number, number]> = LIFTS.map((l) => [l.sx0, l.sx1, l.sz0, l.sz1, l.id]);
  for (const s of STAIRS) h.push([s.x0, s.x1, ST.zN, ST.zS - 3.5 + 0, s.id]);
  return h;
}
/** The same holes in building coordinates. */
export function slabHoles(): Array<[number, number, number, number]> {
  return slabHolesD().map((h) => blockRect(h[4], h[0], h[1], h[2], h[3]));
}

/** Per-level solids of the tower floor n (1..69): slab, glass wall, core walls with doors, stair pieces, furniture. */
export function levelColliders(n: number): TowerColliders {
  const solids: Solid[] = [], obbs: Obb[] = [], ramps: Ramp[] = [];
  const y = levelY(n), top = n === T.roof ? y + 4 : y + T.floorH;
  const ring = ringOf(n);
  // slab (bounding rectangle of the ring, minus the core shafts); the level-1 floor is the podium roof
  if (n >= 2) {
    const r = ringOf(n);
    const x0 = T.cx - r.hx, x1 = T.cx + r.hx, z0 = r.cz - r.hz, z1 = r.cz + r.hz;
    for (const b of rectMinus(x0, x1, z0, z1, slabHoles())) solids.push([b[0], b[1], b[2], b[3], y - T.slab, y]);
  }
  // glass wall: 8 segments (4 straight + 4 diagonal)
  const pts = ringPoints(ring, T.wallIn);
  for (let i = 0; i < 8; i++) {
    const a = pts[i], b = pts[(i + 1) % 8];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    obbs.push({ cx: mx, cz: mz, hx: len / 2 + 0.15, hz: 0.15, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), y0: y - 0.1, y1: top });
  }
  for (const c of columnsOf(n)) solids.push([c.x - c.s / 2, c.x + c.s / 2, c.z - c.s / 2, c.z + c.s / 2, y, top]);
  return { solids, obbs, ramps, landing: [] };
}


// ---------------------------------------------------------------- structure (v1.5, step 1.1): columns and beams of the tower floors
/**
 * Engineering assessment (gravity frame, simple tributary-area method):
 *  - factored floor load qu = 1.2 D + 1.6 L (D = slab + finishes + facade + services, L = office)
 *  - every column carries the tributary area of all floors above it, so it is biggest at the bottom and thinner towards the top
 *  - size from the axial capacity of a tied high-strength column (phi * (0.85 f'c (1 - rho) + fy rho)), rounded up to 50 mm
 *  - beam depth from the span (span / 18, rounded up to 50 mm), width about 0.55 x depth
 * The lateral system (core walls, outriggers at the mechanical floors) is the next step.
 */
export const STRUCT = {
  /** Wished column spacing along the facade (m). */
  bay: 9,
  /** Factored floor load (kN/m2). */
  qu: 13,
  /** Concrete strength (MPa), steel ratio, steel yield (MPa), strength reduction factor of a tied column. */
  fc: 80, rho: 0.04, fy: 420, phi: 0.52,
  minSide: 0.6, maxSide: 2.2, minBeam: 0.3, maxBeam: 1.3,
} as const;
/** Axial capacity of the column section per m2 of section (kN/m2). */
export const COL_CAP = STRUCT.phi * (0.85 * STRUCT.fc * (1 - STRUCT.rho) + STRUCT.fy * STRUCT.rho) * 1000;

export type ColKind = 'perimeter' | 'interior';
export interface Col { x: number; z: number; s: number; kind: ColKind }
export interface Beam { x0: number; z0: number; x1: number; z1: number; w: number; d: number }

const up05 = (v: number): number => Math.ceil(v * 20 - 1e-9) / 20;
/** Tributary load (kN) of one column kind on all floors from level n up to the top. */
export function colLoad(n: number, kind: ColKind): number {
  let sum = 0;
  for (let m = Math.max(1, n); m <= T.top; m++) {
    const t = tribDepth(ringOf(m));
    sum += STRUCT.qu * STRUCT.bay * (kind === 'interior' ? t : t / 2);
  }
  return sum;
}
/** Row lines north of the lift lobby start just behind the lobby wall (z = DIVIDER.z): there the columns stand over the hall / wings and are carried by the podium roof. */
const NORTH_ROW_Z = 12.5;
/** North rows (east-west, over the hall): every <= 18 m from NORTH_ROW_Z to the north face; zN = z of the north perimeter line. */
function northRows(zN: number): number[] {
  const n = Math.max(0, Math.ceil((NORTH_ROW_Z - zN) / 18 - 1e-9));
  return Array.from({ length: n }, (_, i) => NORTH_ROW_Z - (i * (NORTH_ROW_Z - zN)) / n);
}
/** Interior column rows (they run east-west): the core centre line z = T.cz, plus (on the deeper plate) the north rows. */
export const rowCount = (r: Ring): number => 1 + northRows(r.cz - r.hz).length;
/** Tributary depth (m) of one interior row: the plate depth shared by the rows (one row = half of the depth, as before). */
export const tribDepth = (r: Ring): number => (2 * r.hz) / (rowCount(r) + 1);
/** z of the interior rows of a plate: j = 0 is the core centre line, then the north rows. `zN` = z of the north perimeter line. */
export const rowZs = (_r: Ring, zN: number): number[] => [T.cz, ...northRows(zN)];
const sideCache = new Map<string, number>();
/** Side (m) of the square column of that kind at level n. */
export function colSide(n: number, kind: ColKind): number {
  const key = `${kind}${n}`;
  const hit = sideCache.get(key);
  if (hit !== undefined) return hit;
  const need = Math.sqrt(colLoad(n, kind) / COL_CAP);
  const v = Math.min(STRUCT.maxSide, Math.max(STRUCT.minSide, up05(need)));
  sideCache.set(key, v);
  return v;
}
/** Beam section (width, depth) for a span (m). */
export function beamSection(span: number): { w: number; d: number } {
  const d = Math.min(STRUCT.maxBeam, Math.max(STRUCT.minBeam, up05(span / 18)));
  return { w: Math.max(0.3, up05(d * 0.55)), d };
}

const colCache = new Map<number, Col[]>();
const beamCache = new Map<number, Beam[]>();
interface Frame { cols: Col[]; beams: Beam[] }
function buildFrame(n: number): Frame {
  const ring = ringOf(n);
  const sP = colSide(n, 'perimeter'), sI = colSide(n, 'interior');
  const ins = 0.2 + sP / 2;
  const pts = ringPoints(ring, ins);
  const cols: Col[] = [];
  const beams: Beam[] = [];
  const perim: Array<[number, number]> = [];
  const northXs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = pts[i], b = pts[(i + 1) % 8];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // the end edges (west / east) always get a column in the middle, the chamfers none
    // (step 2.5x: the end edges are long now: a column at the start and one on every interior row line)
    const rowF = i === 2 || i === 6 ? rowZs(ring, pts[0][1]).map((rz) => (rz - a[1]) / (b[1] - a[1])).filter((f) => f > 0.05 && f < 0.95).sort((p, q) => p - q) : [];
    const fs: number[] = i === 2 || i === 6 ? [0, ...rowF] : (() => { const nb = i % 2 === 1 ? 1 : Math.max(1, Math.round(len / STRUCT.bay)); return Array.from({ length: nb }, (_, j) => j / nb); })();
    for (const f of fs) {
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      perim.push([x, z]);
      cols.push({ x, z, s: sP, kind: 'perimeter' });
      if (i === 0) northXs.push(x);
    }
  }
  northXs.push(pts[1][0]);
  // perimeter beams: from column to column all around
  for (let i = 0; i < perim.length; i++) {
    const a = perim[i], b = perim[(i + 1) % perim.length];
    const sec = beamSection(Math.hypot(b[0] - a[0], b[1] - a[1]));
    beams.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], ...sec });
  }
  // interior rows (east-west): the core centre line z = T.cz and, on the deeper plate, more rows towards the north (every <= 18 m); nothing inside the core blocks
  const zN = pts[0][1], zS = pts[4][1];
  const rows = rowZs(ring, zN);
  const xsAll = [...northXs, pts[2][0], pts[6][0]];
  const inCore = (x: number, z: number): boolean => CORES.some((b) => x > b.x0 - 1.5 - sI / 2 && x < b.x1 + 1.5 + sI / 2 && z > b.z0 - 1.5 - sI / 2 && z < b.z1 + 1.5 + sI / 2);
  const icols: Col[] = [];
  for (const rz of rows) {
    const ix = xsAll.filter((x) => !inCore(x, rz)).sort((p, q) => p - q);
    const rc: Col[] = ix.map((x) => ({ x, z: rz, s: sI, kind: 'interior' as const }));
    icols.push(...rc);
    for (let i = 0; i + 1 < rc.length; i++) {
      const a = rc[i], b = rc[i + 1];
      const between = CORES.filter((c) => c.x0 > a.x && c.x1 < b.x && rz > c.z0 && rz < c.z1);
      if (!between.length) {
        beams.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, ...beamSection(b.x - a.x) });
      } else {
        const c0 = between[0], c1 = between[between.length - 1];
        beams.push({ x0: a.x, z0: a.z, x1: c0.x0, z1: a.z, ...beamSection(c0.x0 - a.x) }, { x0: c1.x1, z0: a.z, x1: b.x, z1: b.z, ...beamSection(b.x - c1.x1) });
      }
    }
  }
  cols.push(...icols);
  // north-south beams on every column line: perimeter column -> interior columns -> perimeter column, or to the core face where the line meets a core block
  for (const x of northXs) {
    const core = CORES.find((c) => x > c.x0 && x < c.x1);
    const nodes: number[] = [zN, ...rows.filter((rz) => icols.some((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - rz) < 0.01)).sort((p, q) => p - q), zS];
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (core && core.z0 > a && core.z1 < b) {
        beams.push({ x0: x, z0: a, x1: x, z1: core.z0, ...beamSection(core.z0 - a) }, { x0: x, z0: core.z1, x1: x, z1: b, ...beamSection(b - core.z1) });
      } else if (!core || core.z1 <= a || core.z0 >= b) {
        beams.push({ x0: x, z0: a, x1: x, z1: b, ...beamSection(b - a) });
      }
    }
  }
  return { cols, beams };
}
function frameOf(n: number): Frame {
  let c = colCache.get(n), b = beamCache.get(n);
  if (!c || !b) {
    const f = n < 1 || n > T.top ? { cols: [], beams: [] } : buildFrame(n);
    c = f.cols; b = f.beams;
    colCache.set(n, c); beamCache.set(n, b);
  }
  return { cols: c, beams: b };
}
/** The columns of tower level n (floor n up to floor n + 1). */
export const columnsOf = (n: number): Col[] => frameOf(n).cols;
/** The beams under the slab of level n (the ceiling of that level). */
export const beamsOf = (n: number): Beam[] => frameOf(n).beams;

// ---------------------------------------------------------------- whole-tower collision (core is built once for all levels)
export function coreDesign(): TowerColliders {
  const solids: Solid[] = [], ramps: Ramp[] = [], landing: TowerColliders['landing'] = [];
  const C = CORE_D, t = WALL_T;
  const top = CORE_TOP;
  const doorLevels: number[] = [];
  for (let n = 0; n <= T.roof; n++) doorLevels.push(n);
  // ---- the two blocks: north wall and outer end wall (full height). The inner end is closed by the lift shaft + service block.
  for (const b of CORES_D) solids.push([b.x0, b.x1, C.z0, C.z0 + t, 0, top]);
  solids.push([CORES_D[0].x0, CORES_D[0].x0 + t, C.z0, C.z1, 0, top], [CORES_D[1].x1 - t, CORES_D[1].x1, C.z0, C.z1, 0, top]);
  // service blocks north of the lifts and between stair and lift (solid concrete)
  for (const l of LIFTS) solids.push([l.sx0, l.sx1, C.z0, l.sz0, 0, top]);
  solids.push([-8.5 - SPLIT, -6.6 - SPLIT, C.z0, C.z1, 0, top], [6.6 + SPLIT, 8.5 + SPLIT, C.z0, C.z1, 0, top]);
  // ---- lift shafts: side walls full height; the south wall in pieces around the door
  for (const l of LIFTS) {
    solids.push([l.sx0, l.sx0 + SHAFT_WALL, l.sz0, l.sz1, 0, top], [l.sx1 - SHAFT_WALL, l.sx1, l.sz0, l.sz1, 0, top], [l.sx0, l.sx1, l.sz0, l.sz0 + SHAFT_WALL, 0, top]);
    solids.push([l.sx0, l.cx - l.doorHalf, l.sz1 - SHAFT_WALL, l.sz1, 0, top], [l.cx + l.doorHalf, l.sx1, l.sz1 - SHAFT_WALL, l.sz1, 0, top]);
    for (const n of doorLevels) {
      const y = levelY(n);
      solids.push([l.cx - l.doorHalf, l.cx + l.doorHalf, l.sz1 - SHAFT_WALL, l.sz1, y + CAB.doorH, n === T.roof ? top : y + T.floorH]);
      landing.push({ lift: l.id, level: n, box: [l.cx - l.doorHalf, l.cx + l.doorHalf, l.sz1 - SHAFT_WALL, l.sz1, y, y + CAB.doorH] });
    }
    // pit floor
    solids.push([l.sx0, l.sx1, l.sz0, l.sz1, -1, 0]);
  }
  // ---- stairs
  for (const s of STAIRS) {
    solids.push([s.x0 - t, s.x0, ST.zN - t, ST.zS + t, 0, top], [s.x1, s.x1 + t, ST.zN - t, ST.zS + t, 0, top]); // (the core end walls above already cover the outer one)
    solids.push([s.x0, s.x1, ST.zN - t, ST.zN, 0, top]); // north wall of the well
    // south wall: full height pieces on both sides of the door, and bands between the doorways
    const dx0 = s.doorX - ST.doorHalf, dx1 = s.doorX + ST.doorHalf;
    solids.push([s.x0, dx0, ST.zS, C.z1, 0, top], [dx1, s.x1, ST.zS, C.z1, 0, top]);
    let from = ST.doorH;
    for (const n of doorLevels) {
      const y = levelY(n);
      if (n >= 1) { solids.push([dx0, dx1, ST.zS, C.z1, from, y]); from = y + ST.doorH; }
    }
    solids.push([dx0, dx1, ST.zS, C.z1, from, top]);
    // the wall between the two flights (full height, up to the south landing)
    const [a0, a1] = flightX(s, 1), [b0, b1] = flightX(s, 2);
    const mid0 = Math.min(a1, b1) === a1 ? a1 : b1, mid1 = Math.min(a1, b1) === a1 ? b0 : a0;
    solids.push([Math.min(mid0, mid1), Math.max(mid0, mid1), ST.flightZ0, ST.flightZ1, 0, top]);
    // stops: south landing slab, mid landing, two flights per storey
    for (let i = 0; i < STOPS.length - 1; i++) {
      const y0 = STOPS[i], y1 = STOPS[i + 1], hm = (y0 + y1) / 2;
      solids.push([s.x0, s.x1, ST.flightZ1, ST.zS, y0 - T.slab, y0]);
      solids.push([s.x0, s.x1, ST.zN, ST.flightZ0, hm - T.slab, hm]);
      ramps.push({ x0: a0, x1: a1, zA: ST.flightZ1, yA: y0, zB: ST.flightZ0, yB: hm, blk: s.id });
      ramps.push({ x0: b0, x1: b1, zA: ST.flightZ0, yA: hm, zB: ST.flightZ1, yB: y1, blk: s.id });
    }
    solids.push([s.x0, s.x1, ST.flightZ1, ST.zS, STOPS[STOPS.length - 1] - T.slab, STOPS[STOPS.length - 1]]);
    solids.push([s.x0, s.x1, ST.zN, ST.zS, top, top + 0.4]); // roof of the well
  }
  // the roof of each block
  for (const b of CORES_D) solids.push([b.x0, b.x1, b.z0, b.z1, top, top + 0.4]);
  return { solids, obbs: [], ramps, landing };
}


/** Which block a box of the design frame belongs to (the west block lies at x < 0). */
export const blockOfBox = (b: Solid): 0 | 1 => ((b[0] + b[1]) / 2 < 0 ? 0 : 1);

/** The core colliders in building coordinates: every box of the design frame turned with its block (ramps keep their design numbers + `blk`). */
export function coreColliders(): TowerColliders {
  const d = coreDesign();
  const solids = d.solids.map((b): Solid => {
    const r = blockRect(blockOfBox(b), b[0], b[1], b[2], b[3]);
    return [r[0], r[1], r[2], r[3], b[4], b[5]];
  });
  const landing = d.landing.map((l) => {
    const r = blockRect(l.lift, l.box[0], l.box[1], l.box[2], l.box[3]);
    return { lift: l.lift, level: l.level, box: [r[0], r[1], r[2], r[3], l.box[4], l.box[5]] as Solid };
  });
  return { solids, obbs: [], ramps: d.ramps, landing };
}

// ---------------------------------------------------------------- lift / stair lobby: glass partition (step 1.2b) and the gates to the office (step 1.2c)
/**
 * The lobby in front of the lift + stair doors is the strip between the two core blocks. On the OFFICE floors it is closed off from the open-plan
 * office by a floor-to-ceiling glass partition at its north and south end (the core blocks themselves are the east and west sides).
 * Each partition has ONE glass gate (a double sliding door, always passable) in the middle: that is the way into the office.
 */
export const LOBBY = {
  x0: CORES[0].x1, x1: CORES[1].x0,
  z0: Math.max(CORES[0].z0, CORES[1].z0), z1: Math.min(CORES[0].z1, CORES[1].z1),
};
/** t: glass thickness, gateHalf: half width of the gate opening, gateH: height of the door leaves (glass above is fixed), approach: free space kept on the office side of a gate. */
export const PART = { t: 0.12, gateHalf: 1.5, gateH: 2.6, approach: 2.2, margin: 0.6 };
export interface PartWall {
  /** 'north' = the glass at z = LOBBY.z0 (the office is north of it), 'south' = the glass at z = LOBBY.z1. */
  side: 'north' | 'south';
  z: number;
  /** The wall runs from x0 to x1; the gate opening is g0 .. g1. */
  x0: number; x1: number; g0: number; g1: number;
}
/** The glass partitions of level n (only office floors have them). */
export function partitionOf(n: number): PartWall[] {
  if (n < 1 || n > T.top || FLOORS[n].kind !== 'office') return [];
  const c = (LOBBY.x0 + LOBBY.x1) / 2;
  const mk = (side: 'north' | 'south', z: number): PartWall => ({ side, z, x0: LOBBY.x0 - 0.02, x1: LOBBY.x1 + 0.02, g0: c - PART.gateHalf, g1: c + PART.gateHalf });
  return [mk('north', LOBBY.z0), mk('south', LOBBY.z1)];
}
/** The walk-collision boxes of the partitions of level n: the glass on both sides of every gate (the gate itself stays open). */
export function partitionSolids(n: number): Solid[] {
  const y = levelY(n), top = y + T.floorH - T.slab, h = PART.t / 2, out: Solid[] = [];
  for (const w of partitionOf(n)) out.push([w.x0, w.g0, w.z - h, w.z + h, y, top], [w.g1, w.x1, w.z - h, w.z + h, y, top]);
  return out;
}
/** Does a box centred (x, z) with half sizes (hx, hz) touch the lobby or the space in front of its gates? (Desks and the like keep out of it.) */
export function nearLobby(x: number, z: number, hx: number, hz: number): boolean {
  return x + hx > LOBBY.x0 - PART.margin && x - hx < LOBBY.x1 + PART.margin && z + hz > LOBBY.z0 - PART.approach && z - hz < LOBBY.z1 + PART.approach;
}

// ---------------------------------------------------------------- furniture of the floors
/**
 * One thing that stands on a floor. The first kinds are the ones of the first versions (the renderer turns each into a real model of the furniture kit,
 * see EVLabFloors); 'model' places any model of EVLabFurnModels by name (`m`, scaled by `s`, turned by `yaw`; 0 = faces +z).
 */
export interface Item { t: 'desk' | 'table' | 'plant' | 'sofa' | 'chair' | 'bench' | 'counter' | 'telescope' | 'room' | 'model'; x: number; z: number; yaw?: number; w?: number; d?: number; r?: number; m?: string; s?: number }
export interface FloorPlan { items: Item[]; solids: Solid[]; kind: FloorKind }

const CORE_PAD = 3.0; // free corridor around the core
/** Triangle budget of the furniture of one level (the test keeps a whole level under 40k triangles): a piece that would go over it is not placed (and gets no collision box). */
const FURN_BUDGET = 26000;
const costMemo = new Map<string, number>();
/** Triangles of one copy of a kit model (built once to count). */
const costOf = (m: string): number => {
  let v = costMemo.get(m);
  if (v === undefined) {
    v = 0;
    defineFurniture({ has: () => false, define: (_n: string, b: { triangles: number }, g?: { triangles: number }) => { v = b.triangles + (g ? g.triangles : 0); } } as unknown as Furnish, [m]);
    costMemo.set(m, v);
  }
  return v;
};

/** Turned footprint: the box (x0, x1, z0, z1) that holds a (hx, hz) rectangle centred (x, z) and turned by yaw. */
const rotBox = (x: number, z: number, hx: number, hz: number, yaw: number): [number, number, number, number] => {
  const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw)), ex = hx * c + hz * sn, ez = hx * sn + hz * c;
  return [x - ex, x + ex, z - ez, z + ez];
};
const hash01 = (a: number, b: number): number => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

/** Where things stand on a floor (deterministic per level). */
export function floorPlan(n: number): FloorPlan {
  const info = FLOORS[n];
  const kind = info.kind;
  const ring = ringOf(n);
  const items: Item[] = [];
  const solids: Solid[] = [];
  const y = levelY(n);
  const cols = columnsOf(n);
  const taken: Array<[number, number, number, number]> = [];
  let spent = 0;
  const northZ = ring.cz - ring.hz, southZ = ring.cz + ring.hz;
  // the doors face the lobby between the blocks, so the free strip lies on that side of each block (west block: +x, east block: -x)
  const fits = (x: number, z: number, hx: number, hz: number, yaw = 0, pad = 0.1, ignoreTaken = false): boolean => {
    const [a, b, c, d] = rotBox(x, z, hx, hz, yaw);
    for (const [px, pz] of [[a, c], [a, d], [b, c], [b, d]]) if (!inRing(ring, px, pz, T.wallIn + 0.25)) return false;
    if (CORES.some((bk, i) => b > bk.x0 - (i === 1 ? 5.5 : CORE_PAD) && a < bk.x1 + (i === 0 ? 5.5 : CORE_PAD) && d > bk.z0 - CORE_PAD && c < bk.z1 + CORE_PAD)) return false;
    // nothing stands where a structural column is (0.5 m margin for the chairs)
    if (cols.some((cc) => b > cc.x - cc.s / 2 - 0.5 && a < cc.x + cc.s / 2 + 0.5 && d > cc.z - cc.s / 2 - 0.5 && c < cc.z + cc.s / 2 + 0.5)) return false;
    return ignoreTaken || !taken.some((t) => b > t[0] - pad && a < t[1] + pad && d > t[2] - pad && c < t[3] + pad);
  };
  /** Place an item if it fits: (hx, hz) = half size of what you bump into (the collision box), (cx, cz) = half size of the space it needs round it (default = the same). */
  const put = (it: Item, hx: number, hz: number, h: number, cx = hx, cz = hz, solid = true): boolean => {
    const yaw = it.yaw ?? 0;
    const cost = it.t === 'model' && it.m ? costOf(it.m) : it.t === 'desk' ? costOf('deskPod') : it.t === 'table' ? costOf(it.r ? 'roundTable' : 'meetSet44') : it.t === 'plant' ? costOf('palm1') : it.t === 'sofa' ? 2 * costOf('sofaLeather') : it.t === 'bench' ? costOf('parkBench') : it.t === 'telescope' ? costOf('telescope') : 0;
    if (spent + cost > FURN_BUDGET) return false;
    if (!fits(it.x, it.z, Math.max(hx, cx), Math.max(hz, cz), yaw)) return false;
    spent += cost;
    items.push(it);
    if (solid) { const f = rotBox(it.x, it.z, hx, hz, yaw); solids.push([f[0], f[1], f[2], f[3], y, y + h]); }
    taken.push(rotBox(it.x, it.z, Math.max(hx, cx), Math.max(hz, cz), yaw));
    return true;
  };
  /** A model of the kit: (hx, hz) = half size of its footprint BEFORE scaling and turning. */
  const mod = (m: string, x: number, z: number, hx: number, hz: number, h: number, yaw = 0, sc = 1, solid = true): boolean => put({ t: 'model', m, x, z, yaw, s: sc }, hx * sc, hz * sc, h * sc, hx * sc, hz * sc, solid);
  /** Wall / core-face fittings: no collision, no space taken. */
  const deco = (m: string, x: number, z: number, yaw: number, sc = 1, h = 0): void => { spent += costOf(m); items.push({ t: 'model', m, x, z, yaw, s: sc, d: h }); };
  const grid = (cb: (x: number, z: number) => void, sx: number, sz: number, x0 = T.cx - ring.hx + 4, x1 = T.cx + ring.hx - 3, z0 = northZ + 3.5, z1 = southZ - 2): void => {
    for (let x = x0; x < x1; x += sx) for (let z = z0; z < z1; z += sz) cb(x, z);
  };
  /** A lounge group (rug, two sofas facing each other over a coffee table, an armchair at each end, side tables with lamps): 6.8 x 4.8 m. */
  const lounge = (cx: number, cz: number, leather: boolean): boolean => {
    if (!fits(cx, cz, 3.5, 2.6) || spent + 2600 > FURN_BUDGET) return false;
    spent += 2600;
    const sofa = leather ? 'sofaLeather' : 'sofaVelvet', arm = leather ? 'armVelvet' : 'armLeather';
    const raw = (m: string, x: number, z: number, hx: number, hz: number, h: number, yaw = 0): void => {
      items.push({ t: 'model', m, x, z, yaw, s: 1 });
      if (h > 0) { const f = rotBox(x, z, hx, hz, yaw); solids.push([f[0], f[1], f[2], f[3], y, y + h]); }
    };
    raw(leather ? 'rugRed' : 'rugBlue', cx, cz, 0, 0, 0);
    raw(sofa, cx, cz - 1.45, 1.31, 0.46, 0.95, 0); raw(sofa, cx, cz + 1.45, 1.31, 0.46, 0.95, Math.PI);
    raw('coffeeTable', cx, cz, 0.62, 0.37, 0.45);
    raw(arm, cx - 2.45, cz, 0.48, 0.46, 0.95, Math.PI / 2); raw(arm, cx + 2.45, cz, 0.48, 0.46, 0.95, -Math.PI / 2);
    for (const sg of [-1, 1]) { raw('sideTable', cx + sg * 2.45, cz - 1.0, 0.26, 0.26, 0.6); raw('floorLamp', cx + sg * 2.45, cz - 1.65, 0.24, 0.24, 1.6); }
    taken.push(rotBox(cx, cz, 3.5, 2.6, 0));
    return true;
  };
  const plantAt = (x: number, z: number, big: boolean, i: number): boolean =>
    big ? mod(i % 2 ? 'palm2' : 'palm1', x, z, 0.5, 0.5, 2.2, i * 1.3) : mod(['ficus1', 'ficus2', 'ficus3', 'snake1'][i % 4], x, z, 0.4, 0.4, 2.2, i * 1.7);
  let seq = 0;

  // the fire extinguisher + first aid box + clock on the lobby faces of the two core blocks (between the lift door and the stair door), every floor that has a roof
  if (n <= T.top) for (const [i, b] of CORES.entries()) {
    const west = i === 0, x = west ? b.x1 : b.x0, yaw = west ? Math.PI / 2 : -Math.PI / 2;
    deco('extinguisher', x + (west ? 0.07 : -0.07), 34.0, yaw, 1.3);
    deco('firstAid', x + (west ? 0.05 : -0.05), 34.7, yaw, 1.2, 1.5);
    deco('clock', x + (west ? 0.06 : -0.06), 34.4, yaw, 1.4, 3.3);
  }

  if (kind === 'office') {
    // two glass meeting rooms at the ends (door to the south side), only where the plate is wide enough to clear the core; the rest is open plan
    const rx = Math.max(ring.hx - 9, CORE.x1 + 5.5);
    const roomXs: number[] = rx + 4.5 < ring.hx - T.wallIn ? [-rx, rx] : [];
    for (const sx of roomXs) {
      const x = T.cx + sx, z = northZ + 5.5;
      items.push({ t: 'room', x, z, w: 7, d: 5 });
      solids.push([x - 3.5, x + 3.5, z - 2.5, z - 2.35, y, y + 2.8], [x - 3.5, x - 3.35, z - 2.5, z + 2.5, y, y + 2.8], [x + 3.35, x + 3.5, z - 2.5, z + 2.5, y, y + 2.8]);
      solids.push([x - 3.5, x - 1.0, z + 2.35, z + 2.5, y, y + 2.8], [x + 1.0, x + 3.5, z + 2.35, z + 2.5, y, y + 2.8]);
      taken.push([x - 3.5, x + 3.5, z - 2.5, z + 4.6]);
      // (the real meeting table with its chairs; nothing stands where a structural column is)
      if (!cols.some((c) => Math.abs(x - c.x) < c.s / 2 + 1.7 + 0.5 && Math.abs(z - c.z) < c.s / 2 + 0.7 + 0.5)) { items.push({ t: 'table', x, z, w: 3.2, d: 1.4 }); solids.push([x - 1.6, x + 1.6, z - 0.7, z + 0.7, y, y + 0.8]); }
    }
    // service corners on the south wall: copier, pantry counter, water cooler, bin (the fronts face the office)
    const zs = southZ - T.wallIn - 0.5;
    for (const sg of [-1, 1]) {
      const gx = sg * Math.max(ring.hx * 0.6, CORE.x1 + 9);
      if (!fits(gx, zs - 0.6, 3.6, 1.2)) continue;
      mod('copier', gx - 2.6, zs - 0.15, 0.45, 0.37, 0.9, Math.PI);
      mod('pantry', gx, zs - 0.1, 1.12, 0.33, 1.3, Math.PI);
      mod('cooler', gx + 1.7, zs - 0.1, 0.17, 0.19, 1.45, Math.PI);
      mod('bin', gx + 2.3, zs - 0.1, 0.17, 0.17, 0.42, Math.PI);
      mod('extinguisher', gx - 1.6, zs + 0.2, 0.06, 0.06, 0.6, Math.PI, 1.3, false);
    }
    grid((x, z) => {
      if (!fits(x, z, 1.7, 1.6, 0, 0.05)) return;
      if (nearLobby(x, z, 1.7, 0.85)) return; // the lift lobby and the way to the gates stay clear
      if (roomXs.some((rxx) => Math.abs(x - (T.cx + rxx)) < 6.5 && z < northZ + 9.5)) return;
      put({ t: 'desk', x, z, yaw: 0, w: 3.4, d: 1.7 }, 1.7, 0.85, 1.1, 1.7, 1.6);
    }, 6.0, 4.6);
    solids.push(...partitionSolids(n));
    // plants where the plate is free: along the end walls and near the corners
    for (const [x, z] of [[-ring.hx + 3.2, ring.cz], [ring.hx - 3.2, ring.cz], [-ring.hx + 3.2, southZ - 4], [ring.hx - 3.2, southZ - 4]] as const) plantAt(T.cx + x, z, true, seq++);
  } else if (kind === 'lobby') {
    mod('bar8', 0, 45, 4.1, 1.0, 2.2, Math.PI);
    for (const x of [-44, -38, 38, 44]) for (const z of [30, 40]) put({ t: 'table', x, z, r: 0.8 }, 0.9, 0.9, 0.8, 1.1, 1.1);
    put({ t: 'sofa', x: 0, z: 23.5, yaw: 0, w: 4, d: 1.2 }, 2, 0.6, 1);
    for (const [x, z] of [[-34, 24], [34, 24], [-40, 46], [40, 46]] as const) plantAt(x, z, true, seq++);
    lounge(-52, 12, true); lounge(52, 12, false); lounge(-22, 8, false); lounge(22, 8, true); lounge(-52, 46, false); lounge(52, 46, true);
    grid((x, z) => { if (hash01(x, z) < 0.35) plantAt(x, z, false, seq++); }, 11, 13, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
  } else if (kind === 'garden') {
    for (const [x, z] of [[-30, 28], [30, 28], [-30, 42], [30, 42], [-20, 23], [20, 23], [-22, 47], [22, 47]] as const) plantAt(T.cx + x, z, true, seq++);
    for (const x of [-8, 8]) put({ t: 'bench', x, z: 35, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, w: 2.2, d: 0.6 }, 0.35, 1.1, 0.5, 0.9, 1.4);
    grid((x, z) => { if (hash01(x * 1.3, z) < 0.5) plantAt(x, z, hash01(z, x) < 0.4, seq++); }, 9, 8, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
    grid((x, z) => { if (hash01(x, z * 2.1) < 0.16) put({ t: 'bench', x, z, yaw: Math.PI, w: 2.6, d: 0.6 }, 1.3, 0.3, 0.5, 1.6, 1.0); }, 15, 13, -ring.hx + 6, ring.hx - 6, northZ + 4, southZ - 4);
  } else if (kind === 'restaurant') {
    mod('bar10', 0, 46.5, 5.1, 1.0, 2.2, Math.PI);
    grid((x, z) => { put({ t: 'table', x, z, r: 0.75 }, 0.9, 0.9, 0.8, 1.0, 1.0); }, 6.0, 5.2);
    for (const [x, z] of [[-ring.hx + 3, northZ + 3], [ring.hx - 3, northZ + 3], [-ring.hx + 3, southZ - 4], [ring.hx - 3, southZ - 4]] as const) plantAt(x, z, true, seq++);
  } else if (kind === 'boardroom') {
    // the middle between the two core blocks is free (x -13.9 .. 13.9)
    mod('boardTable', 0, 31, 7, 3.2, 0.8, 0, 1, true);
    mod('boardTable', 0, 39, 7, 3.2, 0.8, 0, 1, true);
    for (const [x, z] of [[-ring.hx + 4, northZ + 4], [ring.hx - 4, northZ + 4], [-ring.hx + 4, southZ - 5], [ring.hx - 4, southZ - 5]] as const) plantAt(x, z, true, seq++);
    lounge(-30, 10, true); lounge(30, 10, false);
    for (const sg of [-1, 1]) { mod('execDesk', sg * 20, 20, 1.2, 0.5, 1.3, 0); mod('execChair', sg * 20, 21.0, 0.33, 0.33, 1.2, Math.PI); }
  } else if (kind === 'deck') {
    for (const [x, z] of [[-26, 24], [-14, 22], [14, 22], [26, 24], [-26, 46], [-14, 48], [14, 48], [26, 46]] as const) put({ t: 'telescope', x: T.cx + x, z, yaw: Math.PI }, 0.28, 0.4, 1.5);
    for (const x of [-31, 31]) put({ t: 'bench', x: T.cx + x, z: 35, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, w: 2.6, d: 0.6 }, 0.35, 1.3, 0.5, 0.9, 1.6);
    grid((x, z) => { if (hash01(x, z) < 0.3) plantAt(x, z, false, seq++); }, 13, 11, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
  } else if (kind === 'roof') {
    for (const [x, z] of [[-18, 24], [18, 24], [-18, 46], [18, 46], [-8, 35], [8, 35]] as const) put({ t: 'plant', x: T.cx + x, z, r: 1.4 }, 1.4, 1.4, 3);
    put({ t: 'bench', x: 0, z: 22.6, yaw: 0, w: 4, d: 0.6 }, 2, 0.3, 0.5);
    grid((x, z) => { if (hash01(x * 0.7, z * 1.1) < 0.3) plantAt(x, z, false, seq++); }, 12, 10, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
  } else if (kind === 'mech') {
    // plant rooms: switchgear / control cabinets in rows on the two quiet sides of the plate (the doorway of the outrigger stays free: z 26 .. 44), two control desks
    const rowsAt = [northZ + 4, northZ + 7.2, southZ - 4.5];
    rowsAt.forEach((zr, ri) => grid((x, z) => { if (z === zr) mod(['rackL0', 'rackL1', 'rackL2', 'rackL3'][(Math.round(x) + ri) & 3], x, z, 0.41, 0.46, 2.2, ri === 1 ? Math.PI : 0); }, 0.9, 99999, -ring.hx + 5, ring.hx - 5, zr, zr + 1));
    for (const sg of [-1, 1]) { mod('desk', sg * 36, northZ + 12, 0.85, 0.4, 1.3, 0); mod('chairGrey', sg * 36, northZ + 13.0, 0.32, 0.32, 1.1, Math.PI); }
  } else if (kind === 'coming') {
    const mid = (a: number, b: number): number => a + (b - a) / 2;
    if (n === 31) { // Innovation Studio
      for (const [x, z] of [[-40, 12], [40, 12], [-40, 30], [40, 30], [0, 6]] as const) lounge(x, z, ((x + z) & 1) === 0);
      grid((x, z) => { mod('meetSet44', x, z, 2.2, 1.1, 0.8); }, 14, 9.5, -ring.hx + 7, ring.hx - 6, northZ + 4, southZ - 4);
      grid((x, z) => { if (hash01(x, z) < 0.45) plantAt(x, z, false, seq++); }, 10, 9, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
    } else if (n === 50) { // Engineering Library
      grid((x, z) => { mod('readTable', x, z, 1.8, 0.97, 0.8, 0); }, 12.8, 6.6, -ring.hx + 9, ring.hx - 9, mid(northZ, southZ) + 2, southZ - 4);
      grid((x, z) => { mod('libStackL', x, z, 0.6, 0.35, 2.0, 0); }, 1.3, 4.6, -ring.hx + 4, ring.hx - 4, northZ + 3, mid(northZ, southZ) - 4);
      for (const [x, z] of [[-ring.hx + 4, southZ - 4], [ring.hx - 4, southZ - 4]] as const) { mod('armLeather', x, z, 0.48, 0.46, 0.95, x < 0 ? Math.PI / 2 : -Math.PI / 2); mod('floorLamp', x, z - 1.4, 0.24, 0.24, 1.6); plantAt(x, z - 3, true, seq++); }
    } else if (n === 55) { // Conference Centre
      mod('lectern', 0, northZ + 3.2, 0.7, 0.4, 1.2, 0);
      for (const sg of [-1, 1]) { mod('stageChair', sg * 9, northZ + 3.4, 0.48, 0.46, 0.95, sg * -0.25); mod('sideTable', sg * 12, northZ + 3.4, 0.26, 0.26, 0.6); }
      for (let r = 0; r < 14; r++) for (const bx of [-30, -15, 0, 15, 30]) mod('chairRow', bx, northZ + 9 + r * 1.1, 2.15, 0.3, 0.9, Math.PI, 1, false);
      for (const x of [-ring.hx + 3.5, ring.hx - 3.5]) plantAt(x, northZ + 3, true, seq++);
    } else if (n === 65) { // Research Labs
      grid((x, z) => { mod('labBench', x, z, 1.65, 0.5, 2.1, 0); }, 3.4, 7.2, -ring.hx + 5, ring.hx - 5, northZ + 12, southZ - 6);
      grid((x, z) => { mod(['rackL0', 'rackL1', 'rackL2', 'rackL3'][seq++ & 3], x, z, 0.41, 0.46, 2.2, 0); }, 1.0, 99999, -ring.hx + 4, ring.hx - 4, northZ + 1.6, northZ + 2.6);
    } else if (n === 80) { // Data Centre
      let cnt = 0;
      for (let z = northZ + 3; z < southZ - 4 && cnt < 220; z += 7.2) {
        grid((x, zz) => { if (cnt < 220 && mod(['rackL0', 'rackL1', 'rackL2', 'rackL3'][cnt & 3], x, zz, 0.41, 0.46, 2.2, 0)) cnt++; }, 0.84, 99999, -ring.hx + 4, ring.hx - 4, z, z + 1);
        grid((x, zz) => { if (cnt < 220 && mod(['rackL3', 'rackL2', 'rackL1', 'rackL0'][cnt & 3], x, zz, 0.41, 0.46, 2.2, Math.PI)) cnt++; }, 0.84, 99999, -ring.hx + 4, ring.hx - 4, z + 2.9, z + 3.9);
      }
    } else if (n === 84) { // Executive Suites
      grid((x, z) => { if (mod('execDesk', x, z, 1.2, 0.5, 1.3, 0)) { mod('execChair', x, z + 1.0, 0.33, 0.33, 1.2, Math.PI); mod('bookshelf', x, z - 1.7, 0.6, 0.17, 2.0, 0); mod('bookshelf2', x + 1.3, z - 1.7, 0.6, 0.17, 2.0, 0); mod('ficus1', x + 2.7, z - 1.2, 0.4, 0.4, 2.2, 0); } }, 14, 9, -ring.hx + 6, ring.hx - 6, northZ + 4, southZ - 4);
      for (const [x, z] of [[-30, 36], [30, 36]] as const) lounge(x, z, true);
    } else if (n === 87) { // Club Lounge
      mod('bar8', 0, 46.5, 4.1, 1.0, 2.2, Math.PI);
      for (const [x, z] of [[-42, 8], [42, 8], [0, 8], [-42, 28], [42, 28], [-20, 12], [20, 12]] as const) lounge(x, z, ((x + z) & 2) === 0);
      grid((x, z) => { put({ t: 'table', x, z, r: 0.75 }, 0.9, 0.9, 0.8, 1.0, 1.0); }, 7, 6, -ring.hx + 4, ring.hx - 4, mid(northZ, southZ) + 4, southZ - 4);
      grid((x, z) => { if (hash01(x, z) < 0.5) plantAt(x, z, true, seq++); }, 12, 10, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
    } else { // generic 'coming' floor
      for (const [x, z] of [[-40, 14], [40, 14], [-40, 42], [40, 42]] as const) lounge(x, z, ((x + z) & 1) === 0);
      grid((x, z) => { if (hash01(x, z) < 0.4) plantAt(x, z, false, seq++); }, 10, 9, -ring.hx + 3, ring.hx - 2, northZ + 2.5, southZ - 2);
    }
  }
  void y;
  return { items, solids, kind };
}

/** Everything that blocks the player on one level, as boxes and rotated boxes (for the flood-fill test and the physics). */
export function levelSolids(n: number): TowerColliders {
  const lc = levelColliders(n);
  lc.solids.push(...floorPlan(n).solids);
  return lc;
}

export { rampPose };
