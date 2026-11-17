// EVLab campus: the NEW garden (Step RT3). It stands only on the HILL side of the plot, on the flat pad inside the fence: the north band (behind the lake, local -z,
// the hill rises there) and the east band (local +x, north of the car park; the hill rises there too). Only BIG coconut, palm (palmyra) and date palm trees, nothing else.
// Pure numbers (no three.js). Local (building) metres, turned by EVLAB_POS.yaw like everything else; EVLabParkTrees plants them as ordinary game trees.
// Hill facts (scripts, RT3, natural ground minus floorY, averaged along the side): local -z side 4.6 m at 15 m out, 23 m at 30 m, 48 m at 50 m; local +x side the same;
// local +z (south) and local -x (west) sides stay flat (within 3 m). The slope OUTSIDE the fence and the hill top are Step RT4.
import { EVLAB_PLOT } from './EVLabSite';
import { inLake } from './EVLabCampus';
import { inParkingZone } from './EVLabParking';
import { ROAD_RECTS } from './EVLabCampus';

export interface GardenTree { x: number; z: number; kind: number; scale: number; yaw: number; tint: number }

/** TreeKind ids (the same numbers as vegetation/TreeTypes.ts and EVLabCampus.K). The garden may use ONLY these three. */
export const GARDEN_KINDS = { coconut: 11, datePalm: 12, palmyra: 13 } as const;

/** The two garden bands (local metres): 3 m inside the fence; the lake and its bank (6 m margin) are cut out again below. */
export const GARDEN_BANDS = {
  north: { x0: EVLAB_PLOT.x0 + 3, x1: EVLAB_PLOT.x1 - 3, z0: EVLAB_PLOT.z0 + 3, z1: -91 },
  east: { x0: 152, x1: EVLAB_PLOT.x1 - 3, z0: EVLAB_PLOT.z0 + 3, z1: -8 },
} as const;

/** Trees are never closer than this (m) to each other. */
export const GARDEN_MIN_GAP = 5;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let cache: GardenTree[] | null = null;

/** All the garden trees (deterministic, ~200): a jittered 7 m grid, trees >= 5 m apart, bigger towards the hill, a mix of the three kinds. */
export function gardenTrees(): GardenTree[] {
  if (cache) return cache;
  const out: GardenTree[] = [];
  const r = rng(0x9a2d3e);
  const kinds = [GARDEN_KINDS.coconut, GARDEN_KINDS.coconut, GARDEN_KINDS.datePalm, GARDEN_KINDS.palmyra, GARDEN_KINDS.datePalm, GARDEN_KINDS.coconut];
  const clear = (x: number, z: number): boolean => {
    if (inLake(x, z, 6)) return false; // not in the water, nor within 6 m of the lake bank
    if (inParkingZone(x, z, 6)) return false;
    for (const q of ROAD_RECTS) if (x > q[0] - 6 && x < q[1] + 6 && z > q[2] - 6 && z < q[3] + 6) return false;
    for (const t of out) if (Math.hypot(t.x - x, t.z - z) < GARDEN_MIN_GAP) return false;
    return true;
  };
  for (const b of [GARDEN_BANDS.north, GARDEN_BANDS.east]) {
    for (let x = b.x0 + 3; x <= b.x1 - 2; x += 7) {
      for (let z = b.z0 + 3; z <= b.z1 - 1; z += 7) {
        const jx = x + (r() - 0.5) * 4, jz = z + (r() - 0.5) * 4;
        const kind = kinds[Math.floor(r() * kinds.length)];
        // bigger towards the hill (the plot's north edge z0), 1.0 .. 1.45
        const towardsHill = Math.min(1, Math.max(0, (b.z1 - jz) / (b.z1 - b.z0)));
        const scale = 1.0 + 0.3 * towardsHill + r() * 0.15;
        const yaw = r() * Math.PI * 2, tint = r();
        if (jx < b.x0 || jx > b.x1 || jz < b.z0 || jz > b.z1) continue;
        if (!clear(jx, jz)) continue;
        out.push({ x: jx, z: jz, kind, scale, yaw, tint });
      }
    }
  }
  cache = out;
  return cache;
}
