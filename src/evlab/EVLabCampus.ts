// EVLab campus plan: the lake on three sides of the tower island (west, south, east; none behind it), the island with the ring road, the three bridges (S, W, E), the fountains and the park trees.
// Pure numbers + functions (no three.js / DOM), so the terrain generator and the tree placer (both run in workers) can use it.
// All coordinates are BUILDING-LOCAL metres (x = east, z = south, origin = centre of the tower podium), same frame as EVLabLayout.

import { inParkingZone } from './EVLabParking';
import { inRackZone } from './EVLabCycleRack';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** A rounded rectangle: centre, half sizes, corner radius. */
export interface RRect { cx: number; cz: number; hx: number; hz: number; r: number }

/** Signed distance to a rounded rectangle: < 0 inside, > 0 outside (metres). */
export function sdRR(x: number, z: number, s: RRect): number {
  const qx = Math.abs(x - s.cx) - (s.hx - s.r);
  const qz = Math.abs(z - s.cz) - (s.hz - s.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - s.r;
}

/**
 * The island that carries the tower, the plaza, the gardens and the ring road. Step R2: the campus has to fit the 300 x 240 m plot (building-local x -150..150,
 * z -90..150), so the island is 250 x 210 m: north edge z -85, south edge z 125.
 */
export const ISLAND: RRect = { cx: 0, cz: 20, hx: 125, hz: 105, r: 50 };
/**
 * Outer edge of the lake: a rounded rectangle 300 x 235 m (corner radius 75) that touches the plot's west, east and south fence. The lake is the band between
 * the island and this line: 25 m wide on the west, south and east sides (the south corners are concentric with the island's); there is NO lake behind the island:
 * the north edge of the lake is the island's north edge (z -85), and the band thins out to nothing there ("the lake mixes into the shore").
 */
export const LAKE: RRect = { cx: 0, cz: 32.5, hx: 150, hz: 117.5, r: 75 };
/** Centre line of the ring road on the island (road is 14 m wide). */
export const RING: RRect & { halfW: number } = { cx: 0, cz: 17.5, hx: 100, hz: 87.5, r: 15, halfW: 7 }; // tight corners (r 15): the bigger 176 x 116 m podium fits inside the ring road

/** Depth of the lake bed below the ground (m), width of the sloping bank (m) and the water level (m below the ground / floor level). */
export const LAKE_DEPTH = 4.2;
export const LAKE_BANK = 4;
export const WATER_Y = -1.0;

/** How deep the lake carves the ground at (x, z) (>= 0, 0 = no lake here). The terrain generator subtracts this from the flat pad. */
export function lakeDepth(x: number, z: number): number {
  const out = -sdRR(x, z, LAKE);
  if (out <= 0) return 0;
  const isl = sdRR(x, z, ISLAND);
  if (isl <= 0) return 0;
  return LAKE_DEPTH * smoothstep(0, LAKE_BANK, Math.min(out, isl));
}

/** True on open water (deeper than the shore line). */
export function inLake(x: number, z: number, margin = 0): boolean {
  return sdRR(x, z, LAKE) < -margin && sdRR(x, z, ISLAND) > margin;
}

// ------------------------------------------------------------------------------------------------ bridges
export type BridgeStyle = 'cable' | 'stone' | 'truss';
export interface BridgeDef {
  id: 'S' | 'W' | 'E';
  style: BridgeStyle;
  /** 'z': the bridge runs north-south (along z) at x = across; 'x': it runs east-west at z = across. */
  axis: 'x' | 'z';
  across: number;
  /** Deck runs from `from` to `to` along its axis (from < to). */
  from: number;
  to: number;
  /** Full deck width (m). */
  w: number;
}
/** Z (building-local) of the west / east bridges. 48.5 = world z -611.5 (BUILDING_Z -660), where the W gate road leaves the plot (EVLabSite.EVLAB_GATE_ROADS). */
export const GATE_Z = 48.5;
/** Each bridge is 37 m long: 25 m over the lake + a 6 m landing on both banks. The north bridge is gone (no lake behind the island). */
export const BRIDGES: readonly BridgeDef[] = [
  { id: 'S', style: 'cable', axis: 'z', across: 0, from: 119, to: 156, w: 24 }, // the main entrance bridge: its far landing is at the plot's south fence (z 150)
  { id: 'W', style: 'stone', axis: 'x', across: GATE_Z, from: -156, to: -119, w: 16 }, // west gate: the road to the W arm of J1 starts at its landing
  { id: 'E', style: 'truss', axis: 'x', across: GATE_Z, from: 119, to: 156, w: 16 }, // east gate: the car park (EVLabParking)
];

/** Rectangles (x0, x1, z0, z1) that are road / bridge / promenade: no trees there. */
export const ROAD_RECTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-12, 12, 95, 156], // plaza link + ring crossing + south bridge (it ends at the plot's south fence)
  [-156, -100, GATE_Z - 8, GATE_Z + 8], // west: ring road to the west bridge landing
  [100, 156, GATE_Z - 8, GATE_Z + 8], // east
];

/** Plaza (stone) in front of the tower, and its fountain. */
/** (z0 = podium south wall z 58 + 2 m: the plaza starts at the canopy line) */
export const PLAZA = { x0: -70, x1: 70, z0: 60, z1: 95 };
export const PLAZA_FOUNTAIN = { x: 0, z: 77.5, r: 10 };

/** Where the fountains stand: x, z (local), the water level they spray from, and a size 1..3. */
export interface FountainDef { x: number; z: number; y: number; size: 1 | 2 | 3 }
export const FOUNTAINS: readonly FountainDef[] = [
  { x: PLAZA_FOUNTAIN.x, z: PLAZA_FOUNTAIN.z, y: 0.5, size: 3 },
  { x: -48, z: 77.5, y: 0.35, size: 1 },
  { x: 48, z: 77.5, y: 0.35, size: 1 },
  // the lake jets (water level WATER_Y), in the middle of the 25 m band: west / east side, round the south-west / south-east corner, and in the south band
  // (the north jets are gone with the back lake)
  { x: -137.5, z: 0, y: WATER_Y, size: 2 },
  { x: -122.9, z: 115.2, y: WATER_Y, size: 2 },
  { x: 137.5, z: 0, y: WATER_Y, size: 2 },
  { x: 122.9, z: 115.2, y: WATER_Y, size: 2 },
  { x: -55, z: 137.5, y: WATER_Y, size: 2 },
  { x: 55, z: 137.5, y: WATER_Y, size: 2 },
];

// ------------------------------------------------------------------------------------------------ park trees
/** One park tree: building-local x, z, a TreeKind id (see vegetation/TreeTypes), scale and a 0..1 tint. */
export interface ParkTree { x: number; z: number; kind: number; scale: number; yaw: number; tint: number }

// TreeKind ids (copied from vegetation/TreeTypes.ts so this file stays dependency-free; the tree test checks they match)
const K = { broadleaf: 0, oak: 3, vase: 4, slender: 5, sal: 6, segun: 7, koroi: 8, shimul: 10, coconut: 11, datePalm: 12, palmyra: 13, krishnachura: 15, debdaru: 16 } as const;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The tower's own footprint plus the plaza and the road strips (no trees inside). */
function blocked(x: number, z: number, pad: number): boolean {
  if (x > -92 - pad && x < 92 + pad && z > -62 - pad && z < 58 + pad) return true; // podium + tower
  if (x > PLAZA.x0 - pad && x < PLAZA.x1 + pad && z > PLAZA.z0 - pad && z < PLAZA.z1 + pad) return true; // plaza
  for (const q of ROAD_RECTS) if (x > q[0] - pad && x < q[1] + pad && z > q[2] - pad && z < q[3] + pad) return true;
  // the ring road (14 m) with a 3 m verge
  const d = Math.abs(sdRR(x, z, RING));
  if (d < RING.halfW + 2.5 + pad) return true;
  return false;
}

let cache: ParkTree[] | null = null;

/**
 * All the park trees of the campus (deterministic, ~1000): rows of coconut / date palms along the ring road and the lake shore,
 * flowering krishnachura and debdaru along the avenue, and a mix of the game's own broadleaf, oak, sal, segun, koroi and shimul trees on the lawns.
 * `halfX`, `zMin`, `zMax`: the plot limits in local metres (outer parks stop there).
 */
/**
 * Step RT2 (15 Nov): the old garden (palm rows, avenue / plaza trees, lawn trees below) is NOT planted in the game any more: EVLabParkTrees.evlabParkTreesInChunk
 * returns nothing while this is false. The list itself (parkTrees) is kept only so that the bench layout, the cycle routes and their tests stay exactly
 * where they were; nothing is drawn from it. Step RT3 / RT4 plant the new garden (hill side + hill top; only big coconut, palm and date palm trees).
 */
export const OLD_GARDEN = false;

export function parkTrees(halfX = 150, zMin = -90, zMax = 150): ParkTree[] {
  if (cache) return cache;
  const out: ParkTree[] = [];
  const r = rng(0xe71ab);
  const add = (x: number, z: number, kind: number, scale: number): void => { out.push({ x, z, kind, scale, yaw: r() * Math.PI * 2, tint: r() }); };

  // 1. palms in a row on both sides of the ring road (every 14 m), and in a row along the island's shore (every 11 m)
  const rowAlong = (s: RRect, off: number, step: number, kinds: number[], scale: [number, number]): void => {
    // walk along the contour by sampling angles on a fine grid and keeping points at least `step` apart
    const pts: Array<[number, number]> = contour(s, off, 2);
    let acc = 0, px = pts[0][0], pz = pts[0][1], i = 0;
    for (const [x, z] of pts) {
      acc += Math.hypot(x - px, z - pz);
      px = x; pz = z;
      if (acc >= step) {
        acc = 0;
        if (!inLakeAny(x, z) && Math.abs(x) <= halfX && z >= zMin && z <= zMax) { const nearBridge = ROAD_RECTS.some((q) => x > q[0] - 5 && x < q[1] + 5 && z > q[2] - 5 && z < q[3] + 5); if (!nearBridge) add(x, z, kinds[i++ % kinds.length], scale[0] + r() * (scale[1] - scale[0])); }
      }
    }
  };
  rowAlong(RING, RING.halfW + 3.5, 14, [K.coconut, K.datePalm, K.coconut, K.palmyra], [0.85, 1.1]);
  rowAlong(RING, -(RING.halfW + 3.5), 14, [K.datePalm, K.coconut, K.krishnachura], [0.8, 1.05]);
  rowAlong(ISLAND, -4.5, 11, [K.coconut, K.coconut, K.datePalm, K.palmyra], [0.9, 1.2]);
  rowAlong(LAKE, 6, 12, [K.coconut, K.palmyra, K.datePalm, K.coconut], [0.95, 1.25]); // the outer bank of the lake (only the two north corners lie inside the plot)
  // behind the tower the ring road's outer palm row and the island's shore row lie on the same line (z -80.5): keep one tree per 4 m
  {
    const kept: ParkTree[] = [];
    for (const t of out) if (!kept.some((u) => Math.abs(u.x - t.x) < 4 && Math.abs(u.z - t.z) < 4)) kept.push(t);
    out.length = 0; out.push(...kept);
  }

  // 2. (the avenue trees south of the bridge are gone: the avenue ends at the plot's fence)
  // plaza: debdaru along the plaza's north and south edge, but not round the fountain (basin 10 m + the spray)
  for (let x = -62; x <= 62; x += 16) {
    for (const z of [PLAZA.z0 + 6, PLAZA.z1 - 7.5]) if (Math.hypot(x - PLAZA_FOUNTAIN.x, z - PLAZA_FOUNTAIN.z) > PLAZA_FOUNTAIN.r + 5) add(x, z, K.debdaru, 0.9);
  }

  // 3. lawns: jittered grid; a different mix on the island (gardens) and on the outer banks (a real park)
  const mixIsland = [K.broadleaf, K.oak, K.vase, K.krishnachura, K.slender, K.coconut, K.segun];
  const mixOuter = [K.broadleaf, K.oak, K.sal, K.segun, K.koroi, K.shimul, K.vase, K.krishnachura, K.slender, K.datePalm];
  for (let x = -halfX; x <= halfX; x += 9) {
    for (let z = zMin; z <= zMax; z += 9) {
      const jx = x + (r() - 0.5) * 7, jz = z + (r() - 0.5) * 7;
      if (jz < zMin || jz > zMax || Math.abs(jx) > halfX) continue;
      if (inLake(jx, jz, -3)) continue; // not in the water, nor within 3 m of the shore
      const onIsland = sdRR(jx, jz, ISLAND) < 0;
      if (blocked(jx, jz, 3)) continue;
      const lake = -sdRR(jx, jz, LAKE);
      if (!onIsland && lake < 0 && lake > -4) continue; // keep the shore strip beside the lake open for the palm row
      // thin the park out in clumps: noise from two sines
      const clump = 0.5 + 0.5 * Math.sin(jx * 0.045 + 1.7) * Math.cos(jz * 0.05 - 0.6);
      const keep = onIsland ? 0.55 + 0.3 * clump : 0.45 + 0.5 * clump;
      if (r() > keep) continue;
      const mix = onIsland ? mixIsland : mixOuter;
      const kind = mix[Math.floor(r() * mix.length)];
      const big = kind === K.sal || kind === K.segun || kind === K.koroi || kind === K.shimul;
      add(jx, jz, kind, big ? 0.7 + r() * 0.5 : 0.85 + r() * 0.4);
    }
  }
  // the car park and its entry road (EVLabParking) stay free of trees. Filtering at the END keeps the random sequence, so every other tree stays exactly where it was.
  // (the cycle rack on the plaza (EVLabCycleRack) also keeps the one plaza tree that stood on its pad away)
  cache = out.filter((t) => !inParkingZone(t.x, t.z, 4) && !inRackZone(t.x, t.z, 2.5));
  return cache;
}

const inLakeAny = (x: number, z: number): boolean => inLake(x, z, -1.5);

/** Points along the contour of a rounded rectangle offset outward by `off` (negative = inward), roughly `step` metres apart. */
export function contour(s: RRect, off = 0, step = 2): Array<[number, number]> {
  const hx = s.hx + off, hz = s.hz + off, r = Math.max(0.1, s.r + off);
  const pts: Array<[number, number]> = [];
  const arcN = Math.max(6, Math.round((Math.PI / 2) * r / step));
  const corner = (cx: number, cz: number, a0: number): void => {
    for (let i = 0; i <= arcN; i++) { const a = a0 + (i / arcN) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  };
  // clockwise from the north-west corner (x east, z south): NW arc, NE arc, SE arc, SW arc
  corner(s.cx - hx + r, s.cz - hz + r, Math.PI); // NW: angles 180..270
  corner(s.cx + hx - r, s.cz - hz + r, Math.PI * 1.5); // NE: 270..360
  corner(s.cx + hx - r, s.cz + hz - r, 0); // SE: 0..90
  corner(s.cx - hx + r, s.cz + hz - r, Math.PI * 0.5); // SW: 90..180
  return pts;
}
