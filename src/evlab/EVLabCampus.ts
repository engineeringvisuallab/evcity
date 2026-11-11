// EVLab campus plan: the lake that rings the tower, the island with the ring road, the four bridges, the fountains and the park trees.
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

/** The island that carries the tower, the plaza, the gardens and the ring road. */
export const ISLAND: RRect = { cx: 0, cz: 38.5, hx: 125, hz: 133.5, r: 50 };
/** Outer edge of the lake (the lake is the band between the island and this line: 50 m wide). */
export const LAKE: RRect = { cx: 0, cz: 38.5, hx: 175, hz: 183.5, r: 100 };
/** Centre line of the ring road on the island (road is 14 m wide). */
export const RING: RRect & { halfW: number } = { cx: 0, cz: 38.5, hx: 100, hz: 108.5, r: 15, halfW: 7 }; // tight corners (r 15): the bigger 176 x 116 m podium fits inside the ring road

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
export type BridgeStyle = 'cable' | 'arch' | 'stone' | 'truss';
export interface BridgeDef {
  id: 'S' | 'N' | 'W' | 'E';
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
export const BRIDGES: readonly BridgeDef[] = [
  { id: 'S', style: 'cable', axis: 'z', across: 0, from: 166, to: 228, w: 24 }, // the main entrance bridge to the F6 highway avenue
  { id: 'N', style: 'arch', axis: 'z', across: 0, from: -151, to: -89, w: 16 },
  { id: 'W', style: 'stone', axis: 'x', across: 38.5, from: -181, to: -119, w: 16 },
  { id: 'E', style: 'truss', axis: 'x', across: 38.5, from: 119, to: 181, w: 16 },
];

/** Rectangles (x0, x1, z0, z1) that are road / bridge / promenade: no trees there. */
export const ROAD_RECTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-12, 12, 132, 275], // plaza link + bridge + avenue to the highway
  [-8, 8, -181, -70], // north connector, bridge and landing
  [-181, -100, 30.5, 46.5], // west
  [100, 181, 30.5, 46.5], // east
];

/** Plaza (stone) in front of the tower, and its fountain. */
/** (z0 = podium south wall z 58 + 2 m: the plaza starts at the canopy line) */
export const PLAZA = { x0: -70, x1: 70, z0: 60, z1: 132 };
export const PLAZA_FOUNTAIN = { x: 0, z: 92, r: 14 };

/** Where the fountains stand: x, z (local), the water level they spray from, and a size 1..3. */
export interface FountainDef { x: number; z: number; y: number; size: 1 | 2 | 3 }
export const FOUNTAINS: readonly FountainDef[] = [
  { x: PLAZA_FOUNTAIN.x, z: PLAZA_FOUNTAIN.z, y: 0.5, size: 3 },
  { x: -48, z: 92, y: 0.35, size: 1 },
  { x: 48, z: 92, y: 0.35, size: 1 },
  // the lake jets (water level WATER_Y)
  { x: -150, z: -30, y: WATER_Y, size: 2 },
  { x: -150, z: 105, y: WATER_Y, size: 2 },
  { x: 150, z: -30, y: WATER_Y, size: 2 },
  { x: 150, z: 105, y: WATER_Y, size: 2 },
  { x: -55, z: -120, y: WATER_Y, size: 2 },
  { x: 55, z: -120, y: WATER_Y, size: 2 },
  { x: -55, z: 197, y: WATER_Y, size: 2 },
  { x: 55, z: 197, y: WATER_Y, size: 2 },
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
export function parkTrees(halfX = 236, zMin = -205, zMax = 226): ParkTree[] {
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
  rowAlong(LAKE, 6, 12, [K.coconut, K.palmyra, K.datePalm, K.coconut], [0.95, 1.25]); // the outer bank of the lake

  // 2. avenue trees (south of the bridge to the highway): krishnachura and debdaru, both sides
  for (let z = 234; z < 270; z += 12) for (const sx of [-1, 1]) add(sx * 16, z, (Math.round(z / 12) % 2) ? K.krishnachura : K.debdaru, 0.95 + r() * 0.15);
  // plaza: debdaru around the fountain plaza
  for (let x = -62; x <= 62; x += 16) { add(x, PLAZA.z0 + 4, K.debdaru, 0.9); add(x, PLAZA.z1 - 4, K.debdaru, 0.9); }

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
