import { Config } from '../core/Config';
import { hash2D, mulberry32 } from '../world/Seed';
import { worldToChunkCoord, chunkKey } from '../world/WorldGrid';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { RoadNetwork } from './RoadNetwork';
import type { RoadSpec } from './RoadTypes';
import { EVLAB_LOT, MALL_LOT, SIDE_LOT, lotToWorld, parkingContains, type LotRect } from '../parking/ParkingSite';
import { TreeKind } from '../vegetation/TreeTypes';

/**
 * ROADSIDE PLAN (GRASS 4): where the things beside the roads stand. Pure maths (no three.js), a pure function of the road network and the
 * terrain, so the chunk worker (street trees go into the normal tree pipeline) and the main thread (RoadsideView: pits, hedges, guardrails, shrubs)
 * get exactly the same result.
 *
 *   CITY (roads inside a planned city: the ribbon has a paved sidewalk, see RoadNetwork.segmentCity):
 *     - tree pits: a square kerbed pit every 12..15 m on both sides, centred `pitOffset` m from the kerb, with a young street tree in it
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
  /** x, y, z, scale, yaw, tint, kind per street tree (7 floats), standing in the pits. */
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

/** Is (x, z) inside a junction pad (+ margin)? Coarse grid, built once per call of a planner. */
function padIndex(roads: RoadNetwork): (x: number, z: number, margin: number) => boolean {
  const cell = 120;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  roads.pads.forEach((p, i) => {
    const r = p.rCore + 10;
    for (let cx = Math.floor((p.x - r) / cell); cx <= Math.floor((p.x + r) / cell); cx++)
      for (let cz = Math.floor((p.z - r) / cell); cz <= Math.floor((p.z + r) / cell); cz++) {
        const k = key(cx, cz);
        const l = grid.get(k);
        if (l) l.push(i);
        else grid.set(k, [i]);
      }
  });
  return (x, z, margin) => {
    const l = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!l) return false;
    for (const i of l) if (Math.hypot(x - roads.pads[i].x, z - roads.pads[i].z) < roads.pads[i].rCore + margin) return true;
    return false;
  };
}

/** City test of one road point, the same rule as RoadNetwork.buildSegments: no bridge, no earth track, tier 4 or inside a planned city. */
function cityPoint(roads: RoadNetwork, r: RoadSpec, w: Walker): boolean {
  if (r.earth || w.onBridge()) return false;
  if (r.tier === 4) return true;
  const j = Math.min(r.xs.length - 1, w.i + 1); // the same segment midpoint test as RoadNetwork.buildSegments
  return roads.isCityPoint((r.xs[w.i] + r.xs[j]) / 2, (r.zs[w.i] + r.zs[j]) / 2);
}

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
  for (const r of roads.roads) {
    if (r.earth || r.xs.length < 2) continue;
    const w = new Walker(r);
    for (const side of [-1, 1]) {
      const rng = mulberry32(hash2D(seed ^ 0x5171, r.id, side));
      let s = 10 + rng() * 8;
      w.reset();
      while (s < r.length - 10) {
        const gap = lo + rng() * (hi - lo);
        const kind = rng();
        const scale = rng();
        const tint = rng();
        const here = s;
        s += gap;
        if (!w.at(here)) break;
        if (!cityPoint(roads, r, w)) continue;
        const lat = side * (r.halfWidth + C.pitOffset);
        const px = w.x + w.nx * lat;
        const pz = w.z + w.nz * lat;
        if (nearPad(px, pz, 5)) continue; // junction pads have their own corners / lamps
        if (roads.surfaceAt(px, pz) === 1) continue; // another road's asphalt
        const yaw = Math.atan2(w.tx, w.tz);
        pits.push(px, w.y, pz, yaw);
        const k = kind < 0.4 ? TreeKind.vase : kind < 0.75 ? TreeKind.broadleaf : TreeKind.slender;
        const t = [px, w.y - Config.vegetation.sink, pz, ST.scale[0] + (ST.scale[1] - ST.scale[0]) * scale, rng() * Math.PI * 2, ST.tint[0] + (ST.tint[1] - ST.tint[0]) * tint, k];
        trees.push(...t);
        const c = worldToChunkCoord(px, pz);
        const ck = chunkKey(c.cx, c.cz);
        const l = byChunk.get(ck);
        if (l) l.push(...t);
        else byChunk.set(ck, t.slice());
      }
    }
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
  for (let i = 0; i < l.length; i += 7) out.push({ kind: l[i + 6], v: [l[i] - ox, groundY(l[i], l[i + 2]) - Config.vegetation.sink, l[i + 2] - oz, l[i + 3], l[i + 4], l[i + 5]] });
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
  for (let i = 0; i < pits.length; i += 4) { gen.sample(pits[i], pits[i + 2], sA0(gen)); pits[i + 1] = sA0(gen).h; }
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
    if (r.earth || r.halfWidth <= 6 || r.xs.length < 2) continue;
    const w = new Walker(r);
    const rng = mulberry32(hash2D(seed ^ 0x4ed9e, r.id, 3));
    for (let s = 14; s < r.length - 14; s += HD.step) {
      const rr = rng(); const rs = rng();
      if (!w.at(s) || !cityPoint(roads, r, w)) continue;
      if (nearPad(w.x, w.z, 9)) continue; // the median ends at junctions (the shader fades the kerb there too)
      hedges.push(w.x, w.y + 0.03, w.z, Math.atan2(w.tx, w.tz), 1 + (rr - 0.5) * 0.1, HD.hMin / 0.75 + (rs * (HD.hMax - HD.hMin)) / 0.75, rr);
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
