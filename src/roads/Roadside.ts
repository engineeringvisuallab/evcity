import { Config } from '../core/Config';
import { hash2D, mulberry32 } from '../world/Seed';
import { worldToChunkCoord, chunkKey } from '../world/WorldGrid';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { RoadNetwork } from './RoadNetwork';
import type { RoadSpec } from './RoadTypes';
import { medianSoilTop } from './RoadSection';
import { padIndex } from './PadIndex';
import { footpathHas } from './FootpathPlan';
import { crossingZoneHas, planMedians } from './MedianPlan';
import { uturnZoneHas } from './UTurns';

export { padIndex };
import { EVLAB_LOT, MALL_LOT, SIDE_LOT, lotToWorld, parkingContains, type LotRect } from '../parking/ParkingSite';
import { TreeKind } from '../vegetation/TreeTypes';

/**
 * ROADSIDE PLAN (GRASS 4): where the things beside the roads stand. Pure maths (no three.js), a pure function of the road network and the
 * terrain, so the chunk worker (street trees go into the normal tree pipeline) and the main thread (RoadsideView: pits, hedges, guardrails, shrubs)
 * get exactly the same result.
 *
 *   CITY (roads inside a planned city: the ribbon has a paved sidewalk, see RoadNetwork.segmentCity):
 *     - tree pits: a square kerbed pit every `treeSpacing` m on both sides, centred `pitOffset` m from the kerb, with a street tree in it
 *       (debdaru, krishnachura, date palm / coconut: an avenue pattern per road, see STREET_THEMES)
 *     - median trees: a SMALL debdaru or date palm every 27..38 m on the median strip of the freeway arms (between the hedge pieces)
 *     - hedges: low flowering hedge along the median of the freeway arms inside the city, and along the open edges of the mall / EVLab parking lots
 *   COUNTRY (everything else, tier 1-3, no bridge deck, no earth track):
 *     - W-beam guardrail (posts every `postStep` m) on embankment sides (the ground beside the road drops by more than `dropMin` m) and on the
 *       outer side of curves tighter than `curveRadius` m
 *     - shrubs on the verge, beyond the gravel shoulder
 */
const C = Config.city.roadside;
const H = Config.city.highway;
const ST = C.streetTree;
const sqr = (x: number): number => x * x;

export interface RoadsidePlan {
  /** x, y, z, yaw per tree pit (4 floats). */
  pits: number[];
  /** x, y, z, scale, yaw, tint, kind, onRoad per street tree (8 floats), standing in the pits (onRoad = 1: a median tree, y is the road surface; 2: a pit tree on the raised footpath, ROADS STEP 3; 0: any other). */
  trees: number[];
  /** x, y, z, yaw, length scale, height scale, seed per hedge piece (7 floats). */
  hedges: number[];
  /** x, y, z, scale, yaw, seed per verge shrub (6 floats). */
  shrubs: number[];
  /** x, y, z, yaw per guardrail post (4 floats). */
  posts: number[];
  /** x, y, z (middle of the beam), yaw, pitch, length per W-beam piece (6 floats). */
  beams: number[];
}

/** Position / frame of a road at arc length s (cursor walks forward). */
class Walker {
  i = 0;
  x = 0; z = 0; y = 0; nx = 0; nz = 0; tx = 0; tz = 0; hNat = 0;
  constructor(private r: RoadSpec) {}
  reset(): void { this.i = 0; }
  at(s: number): boolean {
    const r = this.r;
    const n = r.xs.length;
    if (n < 2) return false;
    while (this.i < n - 2 && r.cum[this.i + 1] < s) this.i++;
    const i = this.i;
    const seg = r.cum[i + 1] - r.cum[i];
    const f = seg > 1e-6 ? Math.min(1, Math.max(0, (s - r.cum[i]) / seg)) : 0;
    this.x = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f;
    this.z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
    this.y = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f;
    this.hNat = r.hNat[i] + (r.hNat[i + 1] - r.hNat[i]) * f;
    let nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f;
    let nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    this.nx = nx; this.nz = nz;
    // tangent = the left normal turned by -90 degrees (n = left, so t = (nz, -nx) or its opposite): take it from the points to be exact
    let tx = r.xs[i + 1] - r.xs[i];
    let tz = r.zs[i + 1] - r.zs[i];
    const tl = Math.hypot(tx, tz) || 1;
    this.tx = tx / tl; this.tz = tz / tl;
    void tx; void tz;
    return true;
  }
  /** Is the point at index this.i on a bridge deck? */
  onBridge(): boolean {
    const r = this.r;
    return r.bridgeOf[this.i] >= 0 || r.bridgeOf[Math.min(r.xs.length - 1, this.i + 1)] >= 0;
  }
}

/** City test of one road point, the same rule as RoadNetwork.buildSegments: no bridge, no earth track, tier 4 or inside a planned city. */
function cityPoint(roads: RoadNetwork, r: RoadSpec, w: Walker): boolean {
  if (r.earth || w.onBridge()) return false;
  if (r.tier === 4) return true;
  const j = Math.min(r.xs.length - 1, w.i + 1); // the same segment midpoint test as RoadNetwork.buildSegments
  return roads.isCityPoint((r.xs[w.i] + r.xs[j]) / 2, (r.zs[w.i] + r.zs[j]) / 2);
}

/**
 * Avenue patterns: every road side gets one theme (by hash), the trees follow it in order, so a street reads as a planned avenue
 * (debdaru rows with a palm now and then, palms with debdaru between them). Only trees with a NARROW crown stand along roads:
 * the wide krishnachura grows in parks / green zones and around houses instead (TreePlacement).
 * D = debdaru (slim column), P = palm (date palm or coconut, picked per tree).
 */
const STREET_THEMES = ['DDPDDPDD', 'PDPDPDPD', 'DDDPDDDP', 'PPDPPDPD'];
/** Street tree kinds: size range (scale of the model, 1 = full grown), tint range. Palm atlas kinds keep the natural colour. */
const STREET_KIND = {
  D: { kind: TreeKind.debdaru, scale: [0.82, 1.25], tint: [0.82, 0.98] },
  K: { kind: TreeKind.krishnachura, scale: [0.75, 1.05], tint: [0.9, 1.05] },
  Pd: { kind: TreeKind.datePalm, scale: [0.9, 1.25], tint: [0.9, 1.05] },
  Pc: { kind: TreeKind.coconut, scale: [0.75, 1.05], tint: [0.9, 1.05] },
} as const;
const MEDIAN_TREE_STEP: [number, number] = [27.5, 37.5];
/** Median trees are small (scale of the model). */
const MEDIAN_SMALL: [number, number] = [0.42, 0.62];

const cache = new WeakMap<RoadNetwork, { pits: number[]; trees: number[]; byChunk: Map<string, number[]> }>();

/** Tree pits and the street trees standing in them (needs only the road network: the chunk worker calls this). */
export function planCityTrees(roads: RoadNetwork): { pits: number[]; trees: number[]; byChunk: Map<string, number[]> } {
  const hit = cache.get(roads);
  if (hit) return hit;
  const pits: number[] = [];
  const trees: number[] = [];
  const byChunk = new Map<string, number[]>();
  const nearPad = padIndex(roads);
  const [lo, hi] = C.treeSpacing;
  const seed = Config.world.seed;
  const push = (t: number[], px: number, pz: number): void => {
    trees.push(...t);
    const c = worldToChunkCoord(px, pz);
    const ck = chunkKey(c.cx, c.cz);
    const l = byChunk.get(ck);
    if (l) l.push(...t);
    else byChunk.set(ck, t.slice());
  };
  for (const r of roads.roads) {
    if (r.earth || r.xs.length < 2) continue;
    const w = new Walker(r);
    for (const side of [-1, 1]) {
      const rng = mulberry32(hash2D(seed ^ 0x5171, r.id, side));
      const theme = STREET_THEMES[hash2D(seed ^ 0x7a11, r.id, side) % STREET_THEMES.length];
      let n = Math.floor(rng() * theme.length); // the pattern starts at a different place on every road side
      let s = 10 + rng() * 8;
      w.reset();
      while (s < r.length - 10) {
        const gap = lo + rng() * (hi - lo);
        const pick = rng(); // palm: date palm or coconut
        const scale = rng();
        const tint = rng();
        const yawRnd = rng();
        const here = s;
        s += gap;
        if (!w.at(here)) break;
        if (!cityPoint(roads, r, w)) continue;
        const lat = side * (r.halfWidth + C.pitOffset);
        const px = w.x + w.nx * lat;
        const pz = w.z + w.nz * lat;
        if (nearPad(px, pz, 5)) continue; // junction pads have their own corners / lamps
        if (roads.surfaceAt(px, pz) === 1) continue; // another road's asphalt
        if (!footpathHas(roads, r.id, side as 1 | -1, here)) continue; // ROADS STEP 3: pits stand on the raised footpath (full height part)
        const yaw = Math.atan2(w.tx, w.tz);
        pits.push(px, w.y, pz, yaw);
        const letter = theme[n++ % theme.length];
        const K = letter === 'D' ? STREET_KIND.D : letter === 'K' ? STREET_KIND.K : pick < 0.6 ? STREET_KIND.Pd : STREET_KIND.Pc;
        push([px, w.y - Config.vegetation.sink, pz, K.scale[0] + (K.scale[1] - K.scale[0]) * scale, yawRnd * Math.PI * 2, K.tint[0] + (K.tint[1] - K.tint[0]) * tint, K.kind, 2], px, pz); // flag 2: stands on the raised footpath (ROADS STEP 3)
      }
    }
    // MEDIAN: the freeway arms (broad roads) have a median strip along the centre line: a debdaru or a date palm every 11..15 m
    if (r.medianHalf > 0) {
      const mplan = planMedians(roads);
      const uturns = mplan.uturns; // ROADS STEP 4: the gaps of the U-turn openings stay free of trees
      const rngM = mulberry32(hash2D(seed ^ 0x3ed1a, r.id, 7));
      let sm = 16 + rngM() * 10;
      w.reset();
      while (sm < r.length - 16) {
        const gap = MEDIAN_TREE_STEP[0] + rngM() * (MEDIAN_TREE_STEP[1] - MEDIAN_TREE_STEP[0]);
        const pickM = rngM();
        const scale = rngM();
        const tint = rngM();
        const yawRnd = rngM();
        const here = sm;
        sm += gap;
        if (!w.at(here)) break;
        if (!cityPoint(roads, r, w)) continue;
        if (nearPad(w.x, w.z, 16)) continue; // the median ends at junctions (the shader fades the kerb there too)
        if (uturnZoneHas(uturns, r.id, here, Config.city.uturn.plantClear) || crossingZoneHas(mplan, r.id, here, 3)) continue; // ROADS STEP 4: no trunk in or beside a U-turn gap / pedestrian crossing
        // SMALL narrow trees only (a small debdaru / date palm)
        const K = pickM < 0.55 ? STREET_KIND.D : STREET_KIND.Pd;
        const sc = MEDIAN_SMALL[0] + (MEDIAN_SMALL[1] - MEDIAN_SMALL[0]) * scale;
        // trunk on the centre line, on the finished road surface (the median strip is part of the deck, not natural ground)
        push([w.x, w.y + medianSoilTop(r) - Config.vegetation.sink * 0.4, w.z, sc, yawRnd * Math.PI * 2, K.tint[0] + (K.tint[1] - K.tint[0]) * tint, K.kind, 1], w.x, w.z);
      }
    }
  }
  // ROUNDABOUT ISLANDS: one big krishnachura in the middle of every roundabout whose island is big enough (nothing drives there)
  for (const r of roads.roads) {
    if (r.kind !== 'roundabout' || !r.closed || r.xs.length < 6) continue;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < r.xs.length; i++) {
      cx += r.xs[i];
      cz += r.zs[i];
    }
    cx /= r.xs.length;
    cz /= r.xs.length;
    let R = 0;
    for (let i = 0; i < r.xs.length; i++) R += Math.hypot(r.xs[i] - cx, r.zs[i] - cz);
    R /= r.xs.length;
    if (R - r.halfWidth - r.shoulder < 3.5) continue;
    const rng = mulberry32(hash2D(seed ^ 0x40ad, r.id, 3));
    const K = STREET_KIND.K;
    push([cx, 0, cz, K.scale[1] + 0.25 + rng() * 0.2, rng() * Math.PI * 2, K.tint[0] + (K.tint[1] - K.tint[0]) * rng(), K.kind, 0], cx, cz);
  }
  const out = { pits, trees, byChunk };
  cache.set(roads, out);
  return out;
}

/** Street trees of one chunk as a list per tree kind (chunk-local x, y, z, scale, yaw, tint), to be appended to TreePlacer.place(). */
export function streetTreesInChunk(roads: RoadNetwork, cx: number, cz: number, ox: number, oz: number, groundY: (x: number, z: number) => number): { kind: number; v: number[] }[] {
  const l = planCityTrees(roads).byChunk.get(chunkKey(cx, cz));
  if (!l) return [];
  const out: { kind: number; v: number[] }[] = [];
  for (let i = 0; i < l.length; i += 8) {
    // onRoad (median) trees keep the road surface height they were planned with; pit trees stand on the real ground
    const y = l[i + 7] > 1.5 ? groundY(l[i], l[i + 2]) + Config.city.footpath.height - Config.vegetation.sink : l[i + 7] > 0.5 ? l[i + 1] : groundY(l[i], l[i + 2]) - Config.vegetation.sink;
    // a tree exactly on a chunk border could come out a hair outside after the float subtraction: keep it inside its chunk
    const S = Config.world.chunkSize - 0.001;
    out.push({ kind: l[i + 6], v: [Math.min(S, Math.max(0, l[i] - ox)), y, Math.min(S, Math.max(0, l[i + 2] - oz)), l[i + 3], l[i + 4], l[i + 5]] });
  }
  return out;
}

let scratch: ReturnType<TerrainGenerator['makeSample']> | null = null;
function sA0(gen: TerrainGenerator): ReturnType<TerrainGenerator['makeSample']> {
  return scratch ?? (scratch = gen.makeSample());
}

/** The parking lots whose outer edge gets a hedge: [lot, which long edge (n0 or n1) faces open ground]. */
const HEDGE_LOTS: [LotRect, 'n0' | 'n1'][] = [[MALL_LOT, 'n1'], [EVLAB_LOT, 'n1'], [SIDE_LOT, 'n0']];

export interface RoadsideStats {
  pits: number; hedges: number; shrubs: number; posts: number; beams: number; railMetres: number;
}

/** The whole roadside plan (main thread: needs the terrain for ground heights). */
export function planRoadside(gen: TerrainGenerator): RoadsidePlan & { stats: RoadsideStats } {
  const roads = gen.roads;
  const planned = planCityTrees(roads);
  const trees = planned.trees;
  // pits sit on the real ground (the same height the trees and the collider use), not on the road centre line height
  const pits = planned.pits.slice();
  for (let i = 0; i < pits.length; i += 4) { gen.sample(pits[i], pits[i + 2], sA0(gen)); pits[i + 1] = sA0(gen).h + Config.city.footpath.height; }
  const hedges: number[] = [];
  const shrubs: number[] = [];
  const posts: number[] = [];
  const beams: number[] = [];
  const nearPad = padIndex(roads);
  const sA = gen.makeSample();
  const sB = gen.makeSample();
  const seed = Config.world.seed;
  const HD = C.hedge;
  let railMetres = 0;

  // ---------- hedges on the median of the freeway arms inside the city ----------
  for (const r of roads.roads) {
    if (r.earth || r.medianHalf <= 0 || r.xs.length < 2) continue; // only roads that really have a median (ROADS STEP 1; was: halfWidth > 6)
    const w = new Walker(r);
    const mplan2 = planMedians(roads);
    const uturns = mplan2.uturns;
    const rng = mulberry32(hash2D(seed ^ 0x4ed9e, r.id, 3));
    for (let s = 14; s < r.length - 14; s += HD.step) {
      const rr = rng(); const rs = rng();
      if (!w.at(s) || !cityPoint(roads, r, w)) continue;
      if (nearPad(w.x, w.z, 9)) continue; // the median ends at junctions (the shader fades the kerb there too)
      if (uturnZoneHas(uturns, r.id, s, Config.city.uturn.plantClear) || crossingZoneHas(mplan2, r.id, s, 2)) continue; // ROADS STEP 4: no hedge in or beside a U-turn gap / pedestrian crossing
      hedges.push(w.x, w.y + medianSoilTop(r) + 0.03, w.z, Math.atan2(w.tx, w.tz), 1 + (rr - 0.5) * 0.1, HD.hMin / 0.75 + (rs * (HD.hMax - HD.hMin)) / 0.75, rr);
    }
  }
  // ---------- hedges along the open edges of the parking lots ----------
  const roadMask = new Float32Array(2);
  for (const [lot, edge] of HEDGE_LOTS) {
    const n = edge === 'n1' ? lot.n1 + 0.7 : lot.n0 - 0.7;
    const a = lotToWorld(lot.s0, n);
    const b = lotToWorld(lot.s1, n);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const rng = mulberry32(hash2D(seed ^ 0x9a21, lot.s0 * 7 | 0, lot.n1 | 0));
    for (let d = 0.5; d < len - 0.5; d += HD.step) {
      const rr = rng(); const rs = rng();
      const x = a.x + ((b.x - a.x) * d) / len;
      const z = a.z + ((b.z - a.z) * d) / len;
      if (parkingContains(x, z, 0.2)) continue; // inside another lot (driveways)
      roads.maskAt(x, z, 1, roadMask);
      if (roadMask[1] > 0.01) continue;
      gen.sample(x, z, sA);
      hedges.push(x, sA.h, z, yaw, 1 + (rr - 0.5) * 0.1, HD.hMin / 0.75 + (rs * (HD.hMax - HD.hMin)) / 0.75, rr);
    }
  }

  // ---------- country roads: guardrails and verge shrubs ----------
  for (const r of roads.roads) {
    if (r.earth || r.tier > 3 || r.xs.length < 2) continue;
    const w = new Walker(r);
    const off = r.halfWidth + r.shoulder - 0.35; // the rail stands at the outer edge of the gravel shoulder
    const probe = r.halfWidth + r.shoulder + 5;
    const step = H.postStep;
    const count = Math.floor((r.length - 12) / step);
    for (const side of [-1, 1]) {
      // 1. which posts need a rail
      const need: boolean[] = [];
      const valid: boolean[] = []; // a post may stand here at all (open country, not on a road)
      const pos: number[] = []; // x, y, z, yaw of every candidate post
      w.reset();
      for (let k = 0; k <= count; k++) {
        const s = 6 + k * step;
        let ok = false;
        if (w.at(s) && !cityPoint(roads, r, w) && !w.onBridge() && !nearPad(w.x, w.z, 8)) {
          const px = w.x + w.nx * side * off;
          const pz = w.z + w.nz * side * off;
          // embankment: the natural ground a few metres beside the road is lower than the road surface
          gen.sample(w.x + w.nx * side * probe, w.z + w.nz * side * probe, sA);
          const drop = w.y - sA.h;
          let curved = false;
          const s0 = Math.max(0, s - 14);
          const s2 = Math.min(r.length, s + 14);
          const w0 = new Walker(r); const w2 = new Walker(r);
          if (w0.at(s0) && w2.at(s2)) {
            // outer side of a tight curve: the road turns AWAY from this side
            const ax = w.x - w0.x, az = w.z - w0.z, bx = w2.x - w.x, bz = w2.z - w.z;
            const cross = ax * bz - az * bx;
            const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
            const lc = Math.hypot(w2.x - w0.x, w2.z - w0.z) || 1;
            const radius = (la * lb * lc) / (2 * Math.abs(cross) + 1e-9);
            const turn = (bx / lb - ax / la) * w.nx + (bz / lb - az / la) * w.nz; // > 0: turning to the left (+n) side
            curved = radius < H.curveRadius && turn * side < 0;
          }
          ok = (drop >= H.dropMin || curved) && !roads.isCityPoint(px, pz) && !nearPad(px, pz, 4) && roads.surfaceAt(px, pz) !== 1 && sA.h > 0.3 && (Number.isNaN(sA.water) || sA.h > sA.water);
          pos.push(px, w.y - 0.02, pz, Math.atan2(w.tx, w.tz));
          valid.push(!roads.isCityPoint(px, pz) && !nearPad(px, pz, 4) && roads.surfaceAt(px, pz) === 0);
        } else {
          pos.push(0, 0, 0, 0);
          valid.push(false);
        }
        need.push(ok);
      }
      // 2. tidy: close gaps of up to 2 posts, drop runs shorter than 4 posts
      for (let k = 1; k < need.length - 1; k++) if (!need[k]) {
        let j = k; while (j < need.length && !need[j]) j++;
        if (j < need.length && need[k - 1] && j - k <= 2 && valid.slice(k, j).every(Boolean)) for (let q = k; q < j; q++) need[q] = true;
        k = j;
      }
      for (let k = 0; k < need.length; k++) if (need[k]) {
        let j = k; while (j < need.length && need[j]) j++;
        if (j - k < 4) for (let q = k; q < j; q++) need[q] = false;
        k = j;
      }
      // 3. emit posts and the beam between two neighbouring posts
      for (let k = 0; k < need.length; k++) {
        if (!need[k]) continue;
        posts.push(pos[k * 4], pos[k * 4 + 1], pos[k * 4 + 2], pos[k * 4 + 3]);
        if (k + 1 < need.length && need[k + 1]) {
          const ax = pos[k * 4], ay = pos[k * 4 + 1], az = pos[k * 4 + 2];
          const bx = pos[k * 4 + 4], by = pos[k * 4 + 5], bz = pos[k * 4 + 6];
          const hl = Math.hypot(bx - ax, bz - az);
          if (hl < 0.5) continue;
          const len = Math.hypot(bx - ax, by - ay, bz - az);
          beams.push((ax + bx) / 2, (ay + by) / 2 + H.railHeight - 0.15, (az + bz) / 2, Math.atan2(bx - ax, bz - az), Math.atan2(by - ay, hl), len);
          railMetres += len;
        }
      }
    }

    // verge shrubs beyond the shoulder (not inside the city, not on bridges)
    const [slo, shi] = H.shrubSpacing;
    for (const side of [-1, 1]) {
      const rng = mulberry32(hash2D(seed ^ 0x5b7b, r.id, side));
      w.reset();
      let s = 4 + rng() * 6;
      while (s < r.length - 4) {
        const here = s;
        const dOff = H.shrubOffset[0] + rng() * (H.shrubOffset[1] - H.shrubOffset[0]);
        const sc = H.shrubScale[0] + rng() ** 1.4 * (H.shrubScale[1] - H.shrubScale[0]);
        const yaw = rng() * Math.PI * 2;
        const sd = rng();
        s += slo + rng() * (shi - slo);
        if (!w.at(here) || cityPoint(roads, r, w) || w.onBridge()) continue;
        const lat = side * (r.halfWidth + r.shoulder + dOff);
        const px = w.x + w.nx * lat;
        const pz = w.z + w.nz * lat;
        if (nearPad(px, pz, 8) || roads.surfaceAt(px, pz) !== 0) continue;
        gen.sample(px, pz, sB);
        if (sB.h < 3.5 || (!Number.isNaN(sB.water) && sB.h < sB.water + 0.5)) continue;
        gen.sample(px + 1.5, pz, sA);
        if (Math.abs(sA.h - sB.h) > 1.2) continue; // too steep
        shrubs.push(px, sB.h - 0.05, pz, sc, yaw, sd);
      }
    }
  }
  return { pits, trees, hedges, shrubs, posts, beams, stats: { pits: pits.length / 4, hedges: hedges.length / 7, shrubs: shrubs.length / 6, posts: posts.length / 4, beams: beams.length / 6, railMetres } };
}
void sqr;
void ST; // the old young-street-tree sizes: street trees now use STREET_KIND
