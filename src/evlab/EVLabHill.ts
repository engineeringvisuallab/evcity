// EVLab campus: the HILL palms (Step RT4). The hill rises behind the plot on its local -z (north) side and its local +x (east) side (see EVLabGarden). Outside the
// fence, on the hill's slope and on its top, a few BIG coconut / palm / date palm trees stand (only these three kinds). The ground there is the natural, steep
// terrain, so every candidate is judged on the real ground (height, slope, road / water / city) that the tree placer hands in; nothing is planted on steep ground.
// Pure numbers + callbacks (no three.js). Deterministic: a world-aligned jittered grid, chunk by chunk, so the trees do not depend on which chunk is built first.
import { EVLAB_PLOT, EVLAB_PARKING_STRIP, worldToLocal } from './EVLabSite';
import { GARDEN_KINDS } from './EVLabGarden';

/** Grid cell (m). */
export const HILL_CELL = 10;
/** Trees stand at least this far (m) outside the plot / car park strip, and not further than HILL_REACH (the hill top is in reach). */
export const HILL_MIN_OUT = 6;
export const HILL_REACH = 250;
/** Natural ground at least this high (m) above the campus floor counts as hill; from HILL_TOP up it is the hill top. */
export const HILL_MIN_REL = 2;
export const HILL_TOP = 40;
/** Steepest ground (rise / run) a palm is planted on (palms stand upright; steeper ground stays with the natural forest). */
export const HILL_MAX_SLOPE = 0.45;
/** Chance per grid cell on the slope and on the top (a clump noise thins / thickens it). */
export const HILL_P_SLOPE = 0.16, HILL_P_TOP = 0.32;

export interface HillGround { h: number; slope: number; ok: boolean }
export type HillProbe = (x: number, z: number) => HillGround;
export interface HillTree { x: number; z: number; kind: number; scale: number; yaw: number; tint: number; h: number; slope: number }

const hash = (a: number, b: number, s: number): number => {
  let t = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(s, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Distance (local metres) from a local point to the plot + car park strip rectangle, and whether the point lies on the hill side (north or east of it). */
export function hillSide(lx: number, lz: number): { out: number; hillSide: boolean } {
  const x0 = EVLAB_PLOT.x0, x1 = EVLAB_PARKING_STRIP.x1, z0 = EVLAB_PLOT.z0, z1 = EVLAB_PLOT.z1;
  const out = Math.hypot(Math.max(x0 - lx, 0, lx - x1), Math.max(z0 - lz, 0, lz - z1));
  return { out, hillSide: lz < z0 - HILL_MIN_OUT || lx > x1 + HILL_MIN_OUT };
}

/** The hill palms inside the world square [ox, ox + size) x [oz, oz + size). `floorY` = campus floor level. */
export function evlabHillTreesInChunk(floorY: number, ox: number, oz: number, size: number, ground: HillProbe): HillTree[] {
  const out: HillTree[] = [];
  const kinds = [GARDEN_KINDS.coconut, GARDEN_KINDS.coconut, GARDEN_KINDS.datePalm, GARDEN_KINDS.palmyra, GARDEN_KINDS.datePalm, GARDEN_KINDS.coconut];
  const gi0 = Math.floor(ox / HILL_CELL), gi1 = Math.ceil((ox + size) / HILL_CELL);
  const gj0 = Math.floor(oz / HILL_CELL), gj1 = Math.ceil((oz + size) / HILL_CELL);
  for (let gj = gj0; gj < gj1; gj++) {
    for (let gi = gi0; gi < gi1; gi++) {
      const x = (gi + hash(gi, gj, 1)) * HILL_CELL, z = (gj + hash(gi, gj, 2)) * HILL_CELL;
      if (x < ox || x >= ox + size || z < oz || z >= oz + size) continue;
      const [lx, lz] = worldToLocal(x, z);
      const s = hillSide(lx, lz);
      if (!s.hillSide || s.out < HILL_MIN_OUT || s.out > HILL_REACH) continue; // cheap rejects first
      const g = ground(x, z);
      const rel = g.h - floorY;
      if (!g.ok || rel < HILL_MIN_REL || g.slope > HILL_MAX_SLOPE) continue;
      const top = rel >= HILL_TOP;
      // clumps: two slow sines, so the palms stand in groves and not in a regular field
      const clump = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027 - 0.4));
      if (hash(gi, gj, 3) >= (top ? HILL_P_TOP : HILL_P_SLOPE) * clump * 1.6) continue;
      const kind = kinds[Math.floor(hash(gi, gj, 4) * kinds.length)];
      out.push({ x, z, kind, scale: 1.0 + 0.45 * hash(gi, gj, 5), yaw: hash(gi, gj, 6) * Math.PI * 2, tint: hash(gi, gj, 7), h: g.h, slope: g.slope });
    }
  }
  return out;
}
