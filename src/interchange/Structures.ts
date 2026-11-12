// INTERCHANGE FOUNDATION: the STRUCTURE KIT. Arches over the deck, pavilions and fountains in the loop gardens, palm rows, billboards, retaining walls ...
// A structure is a ROW IN A TABLE (StructureDef) + a short placement rule here. The renderer draws every def with ONE InstancedMesh for all interchanges
// (rows of 6 numbers), so 50 interchanges with 40 structures each is still ~8 draw calls. Walls are ribbons along ramp points (no instances).
//
// Dressing is a PRESET ('plain' = nothing, 'garden', 'grand') or an explicit list of def ids: a new kind of structure = one StructureDef + one case in
// placeStructures(), never a change to the patterns, the builder or the renderer's loop. Placement is deterministic (a seeded PRNG per interchange id).

import { rampAt } from './Parts';
import { yOf } from './Levels';
import type { InterchangeParams, LevelPlan, Ramp, RoadSection, StructureBatch, WallRun, Zone } from './InterchangeTypes';

export type Anchor = 'deckSpan' | 'infield' | 'rampSide' | 'rampOuter' | 'rampEdge';

export interface StructureDef {
  id: string;
  label: string;
  anchor: Anchor;
  /** Footprint (m) at scale 1: width across, depth along, height. `scale` of an instance multiplies it (arch: scale = width in m). */
  size: { w: number; d: number; h: number };
  /** Beyond lodFar (m from the camera) the renderer skips it; beyond lodNear it may use a simpler mesh. */
  lodNear: number;
  lodFar: number;
  /** Rough triangle count of the one shared mesh (for the budget). */
  trisHint: number;
}

export const STRUCTURE_DEFS: Readonly<Record<string, StructureDef>> = {
  arch: { id: 'arch', label: 'Ornamental arch over the deck', anchor: 'deckSpan', size: { w: 1, d: 3, h: 7.5 }, lodNear: 180, lodFar: 700, trisHint: 900 },
  pavilion: { id: 'pavilion', label: 'Domed pavilion (garden centre)', anchor: 'infield', size: { w: 7, d: 7, h: 8 }, lodNear: 150, lodFar: 500, trisHint: 500 },
  fountain: { id: 'fountain', label: 'Fountain (pond centre)', anchor: 'infield', size: { w: 6, d: 6, h: 4 }, lodNear: 120, lodFar: 400, trisHint: 350 },
  palm: { id: 'palm', label: 'Palm tree', anchor: 'infield', size: { w: 4, d: 4, h: 9 }, lodNear: 90, lodFar: 350, trisHint: 120 },
  billboard: { id: 'billboard', label: 'Billboard facing the ramp traffic', anchor: 'rampOuter', size: { w: 12, d: 0.8, h: 10 }, lodNear: 140, lodFar: 450, trisHint: 60 },
};

export const DRESSING_PRESETS: Readonly<Record<string, readonly string[]>> = {
  plain: [],
  garden: ['pavilion', 'fountain', 'palm'],
  grand: ['arch', 'pavilion', 'fountain', 'palm', 'billboard', 'wall'],
};

/** An interchange with more instances than this is reported (warn): the dressing is meant to stay cheap. */
export const STRUCTURE_BUDGET = { maxInstances: 600 };

export function resolveDressing(d: 'plain' | 'garden' | 'grand' | readonly string[] | undefined): string[] {
  if (d === undefined) return [];
  return typeof d === 'string' ? [...(DRESSING_PRESETS[d] ?? [])] : [...d];
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlaceCtx {
  id: string;
  ramps: readonly Ramp[];
  zones: readonly Zone[];
  P: InterchangeParams;
  L: LevelPlan;
  main: RoadSection;
  cross: RoadSection;
  toWorld: (u: number, v: number) => { x: number; z: number };
  /** World heading of the main road. */
  yaw: number;
  ground: (x: number, z: number) => number;
  dressing: readonly string[];
}

class Rows {
  a: number[] = [];
  n = 0;
  push(x: number, y: number, z: number, yaw: number, scale: number, variant: number): void {
    this.a.push(x, y, z, yaw, scale, variant);
    this.n++;
  }
}

export function placeStructures(c: PlaceCtx): { batches: StructureBatch[]; walls: WallRun[]; instances: number; trisHint: number } {
  const rows = new Map<string, Rows>();
  const rowsOf = (def: string): Rows => {
    let r = rows.get(def);
    if (!r) rows.set(def, (r = new Rows()));
    return r;
  };
  const want = new Set(c.dressing);
  const rnd = seeded(c.id);
  const walls: WallRun[] = [];

  // 1. ornamental arches over the upper road, one each side of the crossing, spanning the whole carriageway
  if (want.has('arch')) {
    const lowerHalf = c.L.upper === 'main' ? c.cross.halfWidth : c.main.halfWidth;
    const sec = c.L.upper === 'main' ? c.main : c.cross;
    for (const s of [-1, 1]) {
      const t = s * (lowerHalf + 22);
      const w = c.L.upper === 'main' ? c.toWorld(t, 0) : c.toWorld(0, t);
      const yawRoad = c.L.upper === 'main' ? c.yaw : c.yaw - Math.PI / 2;
      rowsOf('arch').push(w.x, yOf(c.L, c.L.upper, t), w.z, yawRoad, sec.halfWidth * 2 + 3, rnd());
    }
  }

  // 2. inside every loop: a pavilion (garden) or a fountain (pond) in the centre, a ring of palms around it
  for (const z of c.zones) {
    const gy = c.ground(z.x, z.z);
    if (z.kind === 'garden' && want.has('pavilion')) rowsOf('pavilion').push(z.x, gy, z.z, rnd() * Math.PI * 2, Math.min(1.4, z.radius / 22), rnd());
    if (z.kind === 'pond' && want.has('fountain')) rowsOf('fountain').push(z.x, gy, z.z, 0, Math.min(1.6, z.radius / 20), rnd());
    if (want.has('palm')) {
      const R = z.radius * (z.kind === 'pond' ? 0.82 : 0.7);
      const n = Math.max(6, Math.round((2 * Math.PI * R) / 8));
      const a0 = rnd() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        const px = z.x + Math.cos(a) * R;
        const pz = z.z + Math.sin(a) * R;
        rowsOf('palm').push(px, c.ground(px, pz), pz, rnd() * Math.PI * 2, 0.85 + rnd() * 0.4, rnd());
      }
    }
  }

  // 3. along the ramps: billboards (one per slip / diamond exit, on the outside, facing the traffic) and retaining walls (embankment stretches)
  for (const r of c.ramps) {
    if (want.has('billboard') && (r.role === 'slip' || r.role === 'diamondOff')) {
      const d = r.length * 0.3;
      const p = rampAt(r, d);
      const highAbove = p.y - c.ground(p.x, p.z);
      if (highAbove <= c.P.pierFromH) {
        // outside = the side that is farther from the centre of the interchange
        const off = r.halfWidth + 14;
        const lx = p.x + p.side.x * off;
        const lz = p.z + p.side.z * off;
        const rx = p.x - p.side.x * off;
        const rz = p.z - p.side.z * off;
        const left = Math.hypot(lx - c.toWorld(0, 0).x, lz - c.toWorld(0, 0).z) > Math.hypot(rx - c.toWorld(0, 0).x, rz - c.toWorld(0, 0).z);
        const bx = left ? lx : rx;
        const bz = left ? lz : rz;
        rowsOf('billboard').push(bx, c.ground(bx, bz), bz, p.yaw + Math.PI, 1, rnd()); // facing back at the oncoming traffic
      }
    }
    if (want.has('wall')) {
      let open = -1;
      let maxH = 0;
      for (let i = 0; i <= r.xs.length; i++) {
        const h = i < r.xs.length ? r.ys[i] - c.ground(r.xs[i], r.zs[i]) : -99;
        const low = h > 1.2 && h <= c.P.pierFromH; // an embankment that is worth a wall; higher = piers, lower = a slope
        if (low) {
          if (open < 0) {
            open = i;
            maxH = 0;
          }
          maxH = Math.max(maxH, h);
        } else if (open >= 0) {
          if (i - 1 - open >= 3) for (const side of ['left', 'right'] as const) walls.push({ ramp: r.id, side, i0: open, i1: i - 1, maxH });
          open = -1;
        }
      }
    }
  }

  const batches: StructureBatch[] = [];
  let instances = 0;
  let trisHint = 0;
  for (const [def, r] of rows) {
    batches.push({ def, data: Float32Array.from(r.a), stride: 6 });
    instances += r.n;
    trisHint += STRUCTURE_DEFS[def]?.trisHint ?? 0;
  }
  batches.sort((a, b) => (a.def < b.def ? -1 : 1));
  return { batches, walls, instances, trisHint };
}
