// CENTRAL STATION PARK (2026-11-22): the round garden inside the hub ring road RR-HUB (centre = Central station (0, 300), the ring's centreline is R 70 m, its inner edge ~60.5 m).
// Pure numbers (no three.js): the same layout feeds the grass placement (workers), the tree placement (workers) and the meshes (CentralParkLayer, main thread).
//
//   r 0..15        PLAZA: paved, a round fountain in the middle (basin R 7.5), brick bands.
//   radial paths   8 paths (every 45 degrees, 3.2 m wide) from the plaza to the promenade.
//   r 51..55       PROMENADE: a ring path (benches on its inner side, lamps on its outer side).
//   r 55..58.6     BORDER: a ring of wild flowers, 6 colours in 12 sectors.
//   8 sectors      each a LAWN with an oval flower BED (stone kerb): the bed has a main flower and, in the middle oval, a second one (two colours); flowering krishnachura / rain trees on the outer lawn (shade for the benches).
// The hotel that stood here is gone (the user removed it). Anything that really stands in the park (rail piers / the viaduct footprint) is left alone by the callers
// (railForm.inCorridor), not by this file.
import { GrassType, TreeKind } from '../vegetation/TreeTypes';

export const PARK = {
  x: 0,
  z: 300,
  /** The garden ends here (the ring road's inner edge is ~60.5 m). */
  R: 59,
  plazaR: 15,
  basinR: 7.5,
  radialHalf: 1.6,
  promIn: 51,
  promOut: 55,
  borderOut: 58.6,
  /** Oval bed: centre radius, half length along the radius, half width across. */
  bedR: 33,
  bedA: 11,
  bedB: 8.5,
  /** Kerb around a bed (the oval is scaled by this much). */
  kerb: 1.07,
  /** Inner oval of a bed (second flower), scale of the bed oval squared. */
  innerE: 0.3,
} as const;

/** Zones returned by parkZone() (low 4 bits); the flower index (0..5 = daisy .. clover) is in the bits above. */
export const Z_NONE = 0;
export const Z_LAWN = 1;
export const Z_PAVED = 2;
export const Z_BED = 3;
export const Z_BORDER = 4;

/** The six wild flowers, in GrassType ids: marigold (orange), buttercup, lavender, poppy, cornflower, cosmos (pink). */
export const PARK_FLOWERS = [GrassType.daisy, GrassType.buttercup, GrassType.lavender, GrassType.poppy, GrassType.cornflower, GrassType.clover] as const;

/** Main / second flower (index into PARK_FLOWERS) of the 8 beds: neighbours never share a main colour, and every bed is two-coloured. */
export const BED_FLOWERS: readonly [number, number][] = [
  [0, 4], [2, 1], [3, 1], [4, 0], [5, 2], [1, 3], [2, 0], [5, 4],
];
/** The 12 border sectors cycle through these. */
const BORDER_ORDER = [1, 0, 3, 5, 2, 4] as const;

const TAU = Math.PI * 2;
const SECTOR = Math.PI / 4;

/** Distance from the park centre and the angle in 0..2pi. */
function polar(x: number, z: number): { r: number; a: number } {
  const dx = x - PARK.x, dz = z - PARK.z;
  let a = Math.atan2(dz, dx);
  if (a < 0) a += TAU;
  return { r: Math.hypot(dx, dz), a };
}

/** Local frame of bed k: centre, unit radial and unit tangent vectors. */
export function bedFrame(k: number): { cx: number; cz: number; ex: number; ez: number; tx: number; tz: number; angle: number } {
  const angle = (k + 0.5) * SECTOR;
  const ex = Math.cos(angle), ez = Math.sin(angle);
  return { cx: PARK.x + ex * PARK.bedR, cz: PARK.z + ez * PARK.bedR, ex, ez, tx: -ez, tz: ex, angle };
}

/** Oval coordinate of bed k at (x, z): < 1 inside the bed, < kerb^2 inside the kerb. */
function bedE(k: number, x: number, z: number): number {
  const f = bedFrame(k);
  const a = (x - f.cx) * f.ex + (z - f.cz) * f.ez;
  const b = (x - f.cx) * f.tx + (z - f.cz) * f.tz;
  return (a / PARK.bedA) ** 2 + (b / PARK.bedB) ** 2;
}

/** Is (x, z) inside the circle of the park, `margin` m extra? */
export function inPark(x: number, z: number, margin = 0): boolean {
  const dx = x - PARK.x, dz = z - PARK.z;
  if (Math.abs(dx) > PARK.R + margin || Math.abs(dz) > PARK.R + margin) return false;
  return dx * dx + dz * dz <= (PARK.R + margin) * (PARK.R + margin);
}

/** Zone of the ground at (x, z) (Z_* in the low 4 bits, flower index << 4 for beds and the border). */
export function parkZone(x: number, z: number): number {
  if (!inPark(x, z)) return Z_NONE;
  const { r, a } = polar(x, z);
  if (r < PARK.plazaR) return Z_PAVED;
  if (r >= PARK.promIn && r < PARK.promOut) return Z_PAVED;
  if (r >= PARK.promOut && r < PARK.borderOut) {
    const seg = Math.floor((a / TAU) * 12) % 12;
    return Z_BORDER | (BORDER_ORDER[seg % 6] << 4);
  }
  if (r >= PARK.borderOut) return Z_LAWN;
  // radial path
  if (r >= PARK.plazaR - 0.5 && r < PARK.promIn) {
    const m = ((a % SECTOR) + SECTOR) % SECTOR;
    const d = Math.min(m, SECTOR - m);
    if (r * Math.sin(d) < PARK.radialHalf) return Z_PAVED;
  }
  const k = Math.floor(a / SECTOR) % 8;
  const e = bedE(k, x, z);
  if (e < 1) return Z_BED | (BED_FLOWERS[k][e < PARK.innerE ? 1 : 0] << 4);
  if (e < PARK.kerb * PARK.kerb) return Z_PAVED; // the stone kerb
  return Z_LAWN;
}

export const zoneKind = (z: number): number => z & 15;
export const zoneFlower = (z: number): number => z >> 4;

/** A tree of the park (world metres), game tree kinds. */
export interface ParkTree { x: number; z: number; kind: number; scale: number; yaw: number; tint: number }

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let treeCache: ParkTree[] | null = null;

/** All the trees of the park (deterministic, 16): shade trees (krishnachura and rain trees) on the outer lawn of the sectors. */
export function parkTrees(): ParkTree[] {
  if (treeCache) return treeCache;
  const out: ParkTree[] = [];
  const r = rng(0x5ea7a1);
  for (let k = 0; k < 8; k++) {
    const f = bedFrame(k);
    // (the coconut palms round the plaza were removed 2026-11-23)
    r(); r(); r(); // keep the random stream of the other trees unchanged
    // two shade trees on the outer lawn, either side of the axis
    for (const s of [-1, 1]) {
      const ang = f.angle + s * (0.17 + r() * 0.05);
      const rad = 47.2 + (r() - 0.5) * 1.2;
      const flowering = (k + (s > 0 ? 1 : 0)) % 3 !== 2; // two of three are krishnachura, every third a rain tree (koroi)
      out.push({
        x: PARK.x + Math.cos(ang) * rad,
        z: PARK.z + Math.sin(ang) * rad,
        kind: flowering ? TreeKind.krishnachura : TreeKind.koroi,
        scale: flowering ? 1.0 + r() * 0.3 : 0.5 + r() * 0.12,
        yaw: r() * TAU,
        tint: 0.92 + r() * 0.12,
      });
    }
  }
  treeCache = out;
  return out;
}

/** Park trees inside the chunk whose minimum corner is (ox, oz), size S, as a list per kind (chunk-local x, y, z, scale, yaw, tint). `footY(h, kind, scale)` gives the trunk foot from the ground height. */
export function parkTreesInChunk(ox: number, oz: number, S: number, groundAt: (x: number, z: number) => number, footY: (h: number, kind: number, scale: number) => number, free: (x: number, z: number) => boolean): { kind: number; v: number[] }[] {
  if (ox > PARK.x + PARK.R || ox + S < PARK.x - PARK.R || oz > PARK.z + PARK.R || oz + S < PARK.z - PARK.R) return [];
  const out = new Map<number, number[]>();
  for (const t of parkTrees()) {
    if (t.x < ox || t.x >= ox + S || t.z < oz || t.z >= oz + S) continue;
    if (!free(t.x, t.z)) continue; // never into the railway viaduct / a road
    let l = out.get(t.kind);
    if (!l) { l = []; out.set(t.kind, l); }
    l.push(t.x - ox, footY(groundAt(t.x, t.z), t.kind, t.scale), t.z - oz, t.scale, t.yaw, t.tint);
  }
  return [...out].map(([kind, v]) => ({ kind, v }));
}

/** Benches (16, on the inner side of the promenade, facing the fountain) and lamps (24, on its outer side): world x, z and yaw (radians; the bench faces the centre). */
export function parkBenches(): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const f = bedFrame(k);
    for (const s of [-1, 1]) {
      const ang = f.angle + s * 0.3;
      out.push({ x: PARK.x + Math.cos(ang) * 50.1, z: PARK.z + Math.sin(ang) * 50.1, yaw: ang });
    }
  }
  return out;
}
export function parkLamps(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const ang = (i + 0.5) * (TAU / 24);
    out.push({ x: PARK.x + Math.cos(ang) * 55.3, z: PARK.z + Math.sin(ang) * 55.3 });
  }
  return out;
}
