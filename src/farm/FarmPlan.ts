// FARM PLAN (pure numbers, deterministic, no three.js / DOM).
//
// The world is cut into a global grid of 96 m cells. Every cell whose land is suitable (right zone, dry, clear of roads / rail / pads / buildings,
// flat enough for its crop) becomes ONE FIELD: a rectangle (56..76 m, turned up to +-0.25 rad) that always fits inside its cell, so fields never
// overlap and a 20..40 m lane is left between neighbours. Every field gets a crop, a growth STAGE and an ACTIVITY (CropDefs).
//   farmland zone      -> paddy (near water) / lowland / upland crops, vegetable plots, some mango-jackfruit-litchi gardens
//   village zone       -> homestead gardens (banana, coconut, areca, vegetables, fruit trees)
//   forest + mountain  -> hill orchards (orange, pineapple, banana, jackfruit, guava, lime, tea) on gentle foot-slopes
// Neighbouring fields share a "patch crop" (blocks of 4 x 4 cells), like real villages where a whole beel grows the same rice.
import { hash2D, mulberry32 } from '../world/Seed';
import { Act, CROPS, Stage, cropById, isPerennial, type CropDef, type Env } from './CropDefs';

/** One probe of the land: ground height, "under water", "something is built / planned here". */
export interface Probe { h: number; wet: boolean; blocked: boolean }
export interface FarmGround {
  probe(x: number, z: number, out: Probe): void;
  zone(x: number, z: number): { id: string; kind: string };
}

export type FieldKind = 'plot' | 'garden' | 'hill';
export interface Field {
  id: number;
  zone: string;
  kind: FieldKind;
  /** World centre of the rectangle; the ground level at the centre. */
  cx: number;
  cz: number;
  y: number;
  /** Rotation of the local frame (three.js rotation.y: local +x = (cos, 0, -sin)). */
  yaw: number;
  /** Size along local x / z (m). */
  w: number;
  d: number;
  /** Highest minus lowest ground inside the field (m). */
  relief: number;
  /** True = a levelled bench terrace (flat plane at `y`, earth bank on the low side: paddy, lowland crops). False = follows the slope. */
  level: boolean;
  env: Env;
  crop: string;
  stage: number;
  /** For stages with work in progress: 0..1 share of the field already done (plough / harvest frontier, along local x). */
  progress: number;
  act: number;
  seed: number;
}

export const FARM_CELL = 96;
const N = 13; // probe grid (13 x 13 -> ~6 m spacing)
const HALF = 4900;
const KIND_OK = new Set(['farmland', 'village', 'forest', 'mountain']);

/** Tried in this order: centre first, then slid towards the 4 sides / 4 corners of the cell (fractions of the free room inside the cell). */
const SLIDES: readonly (readonly [number, number])[] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]];

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
const weighted = (r: () => number, w: readonly number[]): number => {
  let t = 0;
  for (const x of w) t += x;
  let v = r() * t;
  for (let i = 0; i < w.length; i++) {
    v -= w[i];
    if (v < 0) return i;
  }
  return w.length - 1;
};

function cropsFor(env: Env): CropDef[] {
  return CROPS.filter((c) => c.env.includes(env));
}

/** Choose the activity for a crop in a stage (what the people / machines are doing). */
function chooseActivity(c: CropDef, stage: number, r: () => number): number {
  const u = r();
  const veg = c.cut === 'pick' && !isPerennial(c);
  switch (stage) {
    case Stage.prepared: return u < 0.85 ? Act.plow : Act.none;
    case Stage.sown: return c.flooded ? (u < 0.7 ? Act.transplant : Act.irrigate) : u < 0.6 ? Act.sow : u < 0.8 ? Act.irrigate : Act.none;
    case Stage.seedling: return u < 0.35 ? Act.irrigate : u < 0.55 ? Act.weed : Act.none;
    case Stage.growing:
      if (isPerennial(c)) return u < 0.2 ? Act.irrigate : u < 0.4 ? Act.weed : Act.none;
      return u < 0.3 ? Act.spray : u < 0.5 ? Act.irrigate : u < 0.75 ? Act.weed : Act.none;
    case Stage.mature: return veg && u < 0.35 ? Act.pick : u < 0.55 ? Act.spray : u < 0.75 ? Act.irrigate : Act.none;
    case Stage.ripe:
      if (c.cut === 'pick') return u < 0.65 ? Act.pick : Act.none;
      if (c.id === 'cha') return u < 0.6 ? Act.pick : Act.none;
      return u < 0.12 ? Act.irrigate : Act.none;
    case Stage.harvesting: return c.cut === 'combine' ? (u < 0.85 ? Act.harvestCombine : Act.harvestHand) : c.cut === 'pick' ? Act.pick : Act.harvestHand;
    case Stage.harvested: return u < 0.35 ? Act.thresh : u < 0.7 ? Act.haul : u < 0.9 ? Act.graze : Act.none;
    default: return u < 0.45 ? Act.graze : u < 0.65 ? Act.plow : Act.none;
  }
}

export interface PlanStats { cells: number; fields: number; rejected: Record<string, number> }

export interface PlanArea { id: string; cx: number; cz: number; r: number }

/**
 * Plan every field of the world. Deterministic for a given world seed + ground.
 * With `areas` (FarmAreas.ts) fields are made ONLY inside those circles: every cell is tried (no random gaps), the land there counts as
 * farmland whatever the world zone says, steep cells become terraced hill orchards, and a field never gets the same crop as a neighbour,
 * so different field types stand side by side.
 */
export function planFarms(ground: FarmGround, worldSeed: number, stats?: PlanStats, areas?: readonly PlanArea[]): Field[] {
  const fields: Field[] = [];
  const p: Probe = { h: 0, wet: false, blocked: false };
  const hs = new Float32Array(N * N);
  const reject = (why: string) => { if (stats) stats.rejected[why] = (stats.rejected[why] ?? 0) + 1; };
  const denseBlocked = (px: number, pz: number, w: number, d: number, c: number, s: number): boolean => {
    for (let lx = -w / 2 - 3; lx <= w / 2 + 3; lx += 2) {
      for (let lz = -d / 2 - 3; lz <= d / 2 + 3; lz += 2) {
        ground.probe(px + lx * c + lz * s, pz - lx * s + lz * c, p);
        if (p.blocked) return true;
      }
    }
    return false;
  };
  const i0 = Math.floor(-HALF / FARM_CELL), i1 = Math.ceil(HALF / FARM_CELL);
  let nextId = 0;
  const cropAt = new Map<number, string>(); // area mode: the crop of every placed cell, to keep neighbours different
  const cellKey = (i: number, j: number): number => (i + 512) * 1024 + (j + 512);

  for (let j = i0; j < i1; j++) {
    for (let i = i0; i < i1; i++) {
      const x = (i + 0.5) * FARM_CELL, z = (j + 0.5) * FARM_CELL;
      let ar: PlanArea | undefined;
      if (areas) {
        for (const a of areas) if (Math.hypot(x - a.cx, z - a.cz) <= a.r - 30) { ar = a; break; }
        if (!ar) continue;
      }
      const zn = ar ? { id: `agri-${ar.id}`, kind: 'farmland' } : ground.zone(x, z);
      if (!KIND_OK.has(zn.kind)) continue;
      if (stats) stats.cells++;
      const r = mulberry32(hash2D((worldSeed ^ 0x0fa12a) >>> 0, i, j));
      const hillZone = zn.kind === 'forest' || zn.kind === 'mountain';
      // gaps: some cells stay wild (grass, trees)
      if (r() < (ar ? 0 : zn.kind === 'farmland' ? 0.08 : zn.kind === 'village' ? 0.45 : 0.72)) { reject('gap'); continue; }

      // two tries: full size, then a smaller field squeezed between rivers / roads
      let placed = false;
      shrinkLoop: for (const shrink of [1, 0.62]) {
        // 2026-11-22 (user): in an agriculture area every field FILLS its whole 96 m cell (no lane between neighbours, ~2.2 x the old area),
        // not turned; only the squeezed fallback (a road / river beside the cell) stays smaller.
        const w = ar && shrink === 1 ? FARM_CELL : (56 + r() * 20) * shrink, d = ar && shrink === 1 ? FARM_CELL : (56 + r() * 20) * shrink;
        const yaw = ar && shrink === 1 ? 0 : (r() - 0.5) * 0.5;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        // RELOCATION: if the field does not fit in the middle of its cell (road / pad / water close by), slide it inside the cell (the
        // turned rectangle must stay inside the 96 m cell so neighbours never overlap) and try again before shrinking.
        const mx = Math.max(0, FARM_CELL / 2 - 2 - (Math.abs(w * c) + Math.abs(d * s)) / 2);
        const mz = Math.max(0, FARM_CELL / 2 - 2 - (Math.abs(w * s) + Math.abs(d * c)) / 2);
        for (const [ox, oz] of SLIDES) {
        const fx = x + ox * mx, fz = z + oz * mz;
        let bad = 0, wetN = 0, hmin = 1e9, hmax = -1e9, sumSlope = 0;
        for (let b = 0; b < N; b++) {
          for (let a = 0; a < N; a++) {
            const lx = (a / (N - 1) - 0.5) * w, lz = (b / (N - 1) - 0.5) * d;
            ground.probe(fx + lx * c + lz * s, fz - lx * s + lz * c, p);
            hs[b * N + a] = p.h;
            if (p.blocked) bad++;
            if (p.wet) wetN++;
            hmin = Math.min(hmin, p.h); hmax = Math.max(hmax, p.h);
          }
        }
        if (bad > 0) { reject('blocked'); continue; }
        if (wetN > 0) { reject('water'); continue; }
        // dense check (2 m grid + 3 m margin): a narrow road / footpath / kerb can slip between the 6 m probes above
        if (denseBlocked(fx, fz, w, d, c, s)) { reject('blocked'); continue; }
        const sx = w / (N - 1), sz = d / (N - 1);
        for (let b = 0; b < N - 1; b++) for (let a = 0; a < N - 1; a++) sumSlope += Math.hypot((hs[b * N + a + 1] - hs[b * N + a]) / sx, (hs[(b + 1) * N + a] - hs[b * N + a]) / sz);
        const slope = Math.atan(sumSlope / ((N - 1) * (N - 1)));
        const relief = hmax - hmin;

        // environment
        let env: Env;
        let kind: FieldKind = 'plot';
        let level = false;
        if (hillZone || (ar && (relief > 9 || (relief >= 3 && slope <= 0.3 && r() < 0.16)))) {
          if (relief < 1.5 || relief > 18 || slope > 0.32) { reject('slope'); continue shrinkLoop; }
          env = 'hill'; kind = 'hill';
        } else if (zn.kind === 'village' || (ar && relief <= 8 && r() < 0.14)) {
          if (relief > 8) { reject('relief'); continue shrinkLoop; }
          env = 'homestead'; kind = 'garden';
        } else {
          if (relief > 9) { reject('relief'); continue shrinkLoop; }
          // near water -> paddy; mild noise decides the rest. Paddy / lowland fields are levelled into bench terraces (relief <= 6 m).
          let near = false;
          for (let k = 0; k < 8 && !near; k++) {
            const ang = (k / 8) * Math.PI * 2;
            for (const dist of [70, 130, 220]) {
              ground.probe(fx + Math.cos(ang) * dist, fz + Math.sin(ang) * dist, p);
              if (p.wet) { near = true; break; }
            }
          }
          const patchN = hash2D(worldSeed >>> 0, Math.floor(i / 4) + 913, Math.floor(j / 4) + 77) / 4294967296;
          env = near && relief <= 6 && r() < 0.85 ? 'paddy' : relief <= 6 && patchN < 0.5 ? 'lowland' : 'upland';
          level = env !== 'upland';
          if (env === 'upland' && r() < 0.1) kind = 'garden'; // a mango / jackfruit / litchi orchard
        }

        // crop: patch crop 65 %, otherwise random among the right ones
        let list = cropsFor(env);
        if (kind === 'garden' && env === 'upland') list = list.filter((c) => isPerennial(c));
        if (kind === 'plot' && env !== 'hill') list = list.filter((c) => !isPerennial(c));
        if (list.length === 0) { reject('nocrop'); continue shrinkLoop; }
        const pr = mulberry32(hash2D((worldSeed ^ 0x5eed) >>> 0, Math.floor(i / 4) + (hillZone ? 5000 : 0), Math.floor(j / 4)));
        const patchCrop = pick(pr, list);
        let crop = r() < 0.65 ? patchCrop : pick(r, list);
        if (ar) {
          // a different crop from the neighbours (west, north, north-west, north-east) -> varied fields side by side
          const nb = new Set([cropAt.get(cellKey(i - 1, j)), cropAt.get(cellKey(i, j - 1)), cropAt.get(cellKey(i - 1, j - 1)), cropAt.get(cellKey(i + 1, j - 1))]);
          const free = list.filter((c) => !nb.has(c.id));
          if (free.length > 0) crop = pick(r, free);
        }

        // stage: patches share a "season" bias so a whole block is green or golden together
        const stageW = crop.weights.slice();
        const mood = pr();
        if (!isPerennial(crop)) {
          if (mood < 0.3) { stageW[Stage.growing] *= 2.2; stageW[Stage.seedling] *= 1.6; }
          else if (mood > 0.7) { stageW[Stage.ripe] *= 2; stageW[Stage.harvesting] *= 2.2; stageW[Stage.harvested] *= 1.6; }
        }
        if (!isPerennial(crop)) for (const k of [Stage.prepared, Stage.sown, Stage.harvesting, Stage.harvested, Stage.fallow]) stageW[k] *= 1.8; // more visible work
        if (crop.flooded) { stageW[Stage.sown] *= 3; stageW[Stage.prepared] *= 1.5; } // rice: planting by hand is the iconic scene
        const stage = weighted(r, stageW);
        const act = chooseActivity(crop, stage, r);
        const sorted = Array.from(hs).sort((a, b) => a - b);
        const medianH = sorted[sorted.length >> 1];
        const partial = stage === Stage.prepared || stage === Stage.harvesting;
        fields.push({
          id: nextId++, zone: zn.id, kind, cx: fx, cz: fz, y: level ? medianH : hs[(N >> 1) * N + (N >> 1)], yaw, w, d, relief, level,
          env, crop: crop.id, stage, progress: partial ? 0.2 + r() * 0.6 : 1, act, seed: (r() * 4294967296) >>> 0,
        });
        placed = true;
        cropAt.set(cellKey(i, j), crop.id);
        break shrinkLoop;
        }
      }
      void placed;
    }
  }
  // area mode: every crop of the game should grow somewhere - give each missing crop to a field of the right kind (taken from the most common crop)
  if (areas) {
    for (const c of CROPS) {
      if (fields.some((f) => f.crop === c.id)) continue;
      const count = new Map<string, number>();
      for (const f of fields) count.set(f.crop, (count.get(f.crop) ?? 0) + 1);
      const fit = fields.filter((f) => c.env.includes(f.env) && (isPerennial(c) ? f.kind !== 'plot' : f.kind === 'plot') && (count.get(f.crop) ?? 0) > 2);
      if (fit.length === 0) continue;
      fit.sort((a, b) => (count.get(b.crop) ?? 0) - (count.get(a.crop) ?? 0));
      const f = fit[0];
      f.crop = c.id;
      f.act = chooseActivity(c, f.stage, mulberry32(hash2D(worldSeed >>> 0, f.id, 7)));
    }
  }
  if (stats) stats.fields = fields.length;
  return fields;
}

/** Is world point (x, z) inside the field rectangle (+ margin m)? Used by tree / grass placement to keep crops clear. */
export function fieldContains(f: Field, x: number, z: number, margin = 0): boolean {
  const dx = x - f.cx, dz = z - f.cz;
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= f.w / 2 + margin && Math.abs(lz) <= f.d / 2 + margin;
}

/** Spatial lookup of fields by position (the grid IS the cell grid: at most one field per cell). */
export class FieldIndex {
  private readonly map = new Map<number, Field>();
  constructor(readonly fields: readonly Field[]) {
    for (const f of fields) this.map.set(this.key(Math.floor(f.cx / FARM_CELL), Math.floor(f.cz / FARM_CELL)), f);
  }
  private key(i: number, j: number): number { return (i + 512) * 1024 + (j + 512); }
  at(x: number, z: number): Field | undefined {
    return this.map.get(this.key(Math.floor(x / FARM_CELL), Math.floor(z / FARM_CELL)));
  }
  /** True when (x, z) is on a field (margin m): trees, rocks and grass stay away from it. */
  covers(x: number, z: number, margin = 0): boolean {
    const f = this.at(x, z);
    return f !== undefined && fieldContains(f, x, z, margin);
  }
  /** Fields whose centre is within `r` metres of (x, z). */
  near(x: number, z: number, r: number, out: Field[] = []): Field[] {
    out.length = 0;
    const n = Math.ceil(r / FARM_CELL) + 1, ci = Math.floor(x / FARM_CELL), cj = Math.floor(z / FARM_CELL);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      const f = this.map.get(this.key(i, j));
      if (f && Math.hypot(f.cx - x, f.cz - z) <= r) out.push(f);
    }
    return out;
  }
}

export { cropById };
