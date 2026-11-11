// EVLab Tower v1.3: the numbers of the TOWER (pure data, no three.js). Building-local frame as in EVLabLayout (x east, z south, y up, origin = footprint centre at floor level).
// The tower stands on the south part of the podium roof, right above the lobby (so the Presentation Hall stays column-free). In its middle are two concrete CORE blocks, one on each side of the open lobby (v1.4: west = stair A + lift 1, east = lift 2 + stair B); the old layout was:
// stair A | lift 1 | open corridor | lift 2 | stair B, from the ground to the roof.
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

/** Floor surface height of a level (0 = ground floor). */
export function levelY(n: number): number {
  return n <= 0 ? 0 : T.y1 + (n - 1) * T.floorH;
}
export const ROOF_Y = levelY(T.roof);
export const CORE_TOP = ROOF_Y + T.coreTopAbove;
/** Height of the ceiling of a level (underside of the next slab). */
export const ceilY = (n: number): number => (n <= 0 ? 17 : levelY(n) + T.floorH - T.slab);

// ---------------------------------------------------------------- the glass ring (plan of the tower at a level)
export interface Ring { hx: number; hz: number; c: number }
const S_Y0 = T.y1, S_Y1 = ROOF_Y;
/** Half sizes and corner chamfer of the facade at level n (constant over the level: the little steps hide behind the slab ledges). */
export function ringOf(n: number): Ring {
  const nn = Math.min(Math.max(n, 1), T.top);
  const s = Math.min(1, Math.max(0, (levelY(nn) - S_Y0) / (S_Y1 - S_Y0)));
  const sm = Math.pow(s, 1.15);
  const steps = SETBACKS.filter((b) => nn >= b).length;
  // BIGGER TOWER: the plates are 1.6 x wider than before (the core with the stairs and lifts stays exactly as it was, in the middle);
  // the depth grows only by 1 m because the south face may not stand outside the podium (z 50).
  return { hx: (40 - 14 * sm - 2.4 * steps) * TOWER_WIDEN, hz: 14.5 - 2 * sm - 0.5 * steps, c: (6 - 2 * sm) * 1.4 };
}
/** The 8 corners of a ring (x, z) going clockwise from the north-west chamfer; `inset` shrinks it. */
export function ringPoints(r: Ring, inset = 0): Array<[number, number]> {
  const hx = r.hx - inset, hz = r.hz - inset, c = Math.max(0.5, r.c - inset * 0.4), cx = T.cx, cz = T.cz;
  return [
    [cx - hx + c, cz - hz], [cx + hx - c, cz - hz], [cx + hx, cz - hz + c], [cx + hx, cz + hz - c],
    [cx + hx - c, cz + hz], [cx - hx + c, cz + hz], [cx - hx, cz + hz - c], [cx - hx, cz - hz + c],
  ];
}
/** Is (x, z) inside the ring (shrunk by `inset`)? */
export function inRing(r: Ring, x: number, z: number, inset = 0): boolean {
  const hx = r.hx - inset, hz = r.hz - inset, c = Math.max(0.5, r.c - inset * 0.4);
  const dx = Math.abs(x - T.cx), dz = Math.abs(z - T.cz);
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
    const x0 = T.cx - r.hx, x1 = T.cx + r.hx, z0 = T.cz - r.hz, z1 = T.cz + r.hz;
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
  minSide: 0.6, maxSide: 2.2, minBeam: 0.3, maxBeam: 0.9,
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
    const hz = ringOf(m).hz;
    sum += STRUCT.qu * STRUCT.bay * (kind === 'interior' ? hz : hz / 2);
  }
  return sum;
}
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
    const nb = i === 2 || i === 6 ? Math.max(2, 2 * Math.round(len / 18)) : i % 2 === 1 ? 1 : Math.max(1, Math.round(len / STRUCT.bay));
    for (let j = 0; j < nb; j++) {
      const f = j / nb;
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
  // interior line along z = cz: the x of the north columns plus the two end columns; nothing inside the core blocks
  const xsAll = [...northXs, pts[2][0], pts[6][0]];
  const inCore = (x: number): boolean => CORES.some((b) => x > b.x0 - 1.5 - sI / 2 && x < b.x1 + 1.5 + sI / 2);
  const ix = xsAll.filter((x) => !inCore(x)).sort((p, q) => p - q);
  const icols: Col[] = ix.map((x) => ({ x, z: T.cz, s: sI, kind: 'interior' as const }));
  cols.push(...icols);
  for (let i = 0; i + 1 < icols.length; i++) {
    const a = icols[i], b = icols[i + 1];
    const between = CORES.filter((c) => c.x0 > a.x && c.x1 < b.x);
    if (!between.length) {
      beams.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, ...beamSection(b.x - a.x) });
    } else {
      const c0 = between[0], c1 = between[between.length - 1];
      beams.push({ x0: a.x, z0: a.z, x1: c0.x0, z1: a.z, ...beamSection(c0.x0 - a.x) }, { x0: c1.x1, z0: a.z, x1: b.x, z1: a.z, ...beamSection(b.x - c1.x1) });
    }
  }
  // north-south beams on every column line: perimeter column -> interior column, or -> the core face where the line meets a core block
  const zN = pts[0][1], zS = pts[4][1];
  for (const x of northXs) {
    const ic = icols.find((c) => Math.abs(c.x - x) < 0.01);
    const core = CORES.find((c) => x > c.x0 && x < c.x1);
    const zn = ic ? T.cz : core ? core.z0 : null, zs = ic ? T.cz : core ? core.z1 : null;
    if (zn !== null) beams.push({ x0: x, z0: zN, x1: x, z1: zn, ...beamSection(Math.abs(zn - zN)) });
    if (zs !== null) beams.push({ x0: x, z0: zS, x1: x, z1: zs, ...beamSection(Math.abs(zs - zS)) });
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

// ---------------------------------------------------------------- furniture of the floors
export interface Item { t: 'desk' | 'table' | 'plant' | 'sofa' | 'chair' | 'bench' | 'counter' | 'telescope' | 'room'; x: number; z: number; yaw?: number; w?: number; d?: number; r?: number }
export interface FloorPlan { items: Item[]; solids: Solid[]; kind: FloorKind }

const CORE_PAD = 3.0; // free corridor around the core

/** Where things stand on a floor (deterministic per level). */
export function floorPlan(n: number): FloorPlan {
  const info = FLOORS[n];
  const kind = info.kind;
  const ring = ringOf(n);
  const items: Item[] = [];
  const solids: Solid[] = [];
  const y = levelY(n);
  const free = (x: number, z: number, m: number): boolean =>
    // the doors face the lobby between the blocks, so the free strip lies on that side of each block (west block: +x, east block: -x)
    inRing(ring, x, z, T.wallIn + m) && !CORES.some((b, i) => x > b.x0 - (i === 1 ? 5.5 : CORE_PAD) && x < b.x1 + (i === 0 ? 5.5 : CORE_PAD) && z > b.z0 - CORE_PAD && z < b.z1 + CORE_PAD);
  const cols = columnsOf(n);
  const add = (it: Item, hx: number, hz: number, h = 1.2): void => {
    // nothing stands where a structural column is (0.5 m margin for the chairs)
    if (cols.some((c) => Math.abs(it.x - c.x) < c.s / 2 + hx + 0.5 && Math.abs(it.z - c.z) < c.s / 2 + hz + 0.5)) return;
    items.push(it);
    solids.push([it.x - hx, it.x + hx, it.z - hz, it.z + hz, y, y + h]);
  };
  const wings = (cb: (x: number, z: number) => void, sx: number, sz: number): void => {
    for (let x = T.cx - ring.hx + 4; x < T.cx + ring.hx - 3; x += sx) for (let z = T.cz - ring.hz + 3.5; z < T.cz + ring.hz - 2; z += sz) cb(x, z);
  };
  if (kind === 'office') {
    // two glass meeting rooms at the ends (door to the south side), only where the plate is wide enough to clear the core; the rest is open plan
    const rx = Math.max(ring.hx - 9, CORE.x1 + 5.5);
    const roomXs: number[] = rx + 4.5 < ring.hx - T.wallIn ? [-rx, rx] : [];
    for (const sx of roomXs) {
      const x = T.cx + sx, z = T.cz - ring.hz + 5.5;
      items.push({ t: 'room', x, z, w: 7, d: 5 });
      solids.push([x - 3.5, x + 3.5, z - 2.5, z - 2.35, y, y + 2.8], [x - 3.5, x - 3.35, z - 2.5, z + 2.5, y, y + 2.8], [x + 3.35, x + 3.5, z - 2.5, z + 2.5, y, y + 2.8]);
      solids.push([x - 3.5, x - 1.0, z + 2.35, z + 2.5, y, y + 2.8], [x + 1.0, x + 3.5, z + 2.35, z + 2.5, y, y + 2.8]);
      add({ t: 'table', x, z, w: 3.2, d: 1.4 }, 1.6, 0.7, 0.8);
    }
    wings((x, z) => {
      if (!free(x, z, 1.6)) return;
      if (roomXs.some((rxx) => Math.abs(x - (T.cx + rxx)) < 6.5 && z < T.cz - ring.hz + 9.5)) return;
      add({ t: 'desk', x, z, yaw: 0, w: 3.4, d: 1.7 }, 1.7, 0.85, 1.1);
    }, 6.0, 4.6);
    for (const [x, z] of [[-16, 30], [16, 30], [-20, 41], [20, 41]] as const) if (free(T.cx + x, z, 1)) add({ t: 'plant', x: T.cx + x, z, r: 0.5 }, 0.5, 0.5, 1.8);
  } else if (kind === 'lobby') {
    add({ t: 'counter', x: 0, z: 45, w: 8, d: 1.4 }, 4, 0.7, 1.1);
    for (const x of [-44, -38, 38, 44]) for (const z of [30, 40]) add({ t: 'table', x, z, r: 0.8 }, 0.9, 0.9, 0.8);
    add({ t: 'sofa', x: 0, z: 23.5, yaw: 0, w: 4, d: 1.2 }, 2, 0.6, 1);
    for (const [x, z] of [[-34, 24], [34, 24], [-40, 46], [40, 46]] as const) add({ t: 'plant', x, z, r: 0.5 }, 0.5, 0.5, 1.8);
  } else if (kind === 'garden') {
    for (const [x, z] of [[-30, 28], [30, 28], [-30, 42], [30, 42], [-20, 23], [20, 23], [-22, 47], [22, 47]] as const) {
      if (free(T.cx + x, z, 1)) add({ t: 'plant', x: T.cx + x, z, r: 1.2 }, 1.2, 1.2, 3);
    }
    for (const x of [-8, 8]) add({ t: 'bench', x, z: 35, yaw: Math.PI / 2, w: 2.2, d: 0.6 }, 0.35, 1.1, 0.5);
  } else if (kind === 'restaurant') {
    wings((x, z) => { if (free(x, z, 1.5)) add({ t: 'table', x, z, r: 0.75 }, 0.9, 0.9, 0.8); }, 5.5, 4.6);
    add({ t: 'counter', x: 0, z: 46.5, w: 10, d: 1.2 }, 5, 0.6, 1.1);
  } else if (kind === 'boardroom') {
    // the middle between the two core blocks is free (x -13.9 .. 13.9)
    add({ t: 'table', x: 0, z: 31, w: 14, d: 3.2 }, 7, 1.6, 0.8);
    add({ t: 'table', x: 0, z: 39, w: 14, d: 3.2 }, 7, 1.6, 0.8);
  } else if (kind === 'deck') {
    for (const [x, z] of [[-26, 24], [-14, 22], [14, 22], [26, 24], [-26, 46], [-14, 48], [14, 48], [26, 46]] as const) if (free(T.cx + x, z, 1)) add({ t: 'telescope', x: T.cx + x, z }, 0.5, 0.5, 1.5);
    for (const x of [-31, 31]) add({ t: 'bench', x: T.cx + x, z: 35, yaw: Math.PI / 2, w: 2.6, d: 0.6 }, 0.35, 1.3, 0.5);
  } else if (kind === 'roof') {
    for (const [x, z] of [[-18, 24], [18, 24], [-18, 46], [18, 46], [-8, 35], [8, 35]] as const) add({ t: 'plant', x: T.cx + x, z, r: 1.4 }, 1.4, 1.4, 3);
    add({ t: 'bench', x: 0, z: 22.6, yaw: 0, w: 4, d: 0.6 }, 2, 0.3, 0.5);
  } else if (kind === 'coming' || kind === 'mech') {
    for (const [x, z] of [[-18, 24], [18, 24], [-18, 46], [18, 46]] as const) if (free(T.cx + x, z, 1)) add({ t: 'sofa', x: T.cx + x, z, yaw: 0, w: 3.4, d: 1.1 }, 1.7, 0.55, 0.9);
  }
  return { items, solids, kind };
}

/** Everything that blocks the player on one level, as boxes and rotated boxes (for the flood-fill test and the physics). */
export function levelSolids(n: number): TowerColliders {
  const lc = levelColliders(n);
  lc.solids.push(...floorPlan(n).solids);
  return lc;
}

export { rampPose };
