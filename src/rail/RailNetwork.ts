import { Config } from '../core/Config';
import type { TerrainSample } from '../terrain/Lakes';
import type { RoadSpec } from '../roads/RoadTypes';
import { getWorldZoneAt } from '../city/WorldZones';
import { LINES, RAIL_DESIGN as D, STATIONS, type StationKind } from './RailPlan';

/** What the rail network needs from the terrain: natural ground + water (no roads) and the road list. */
export interface RailTerrain {
  makeSample(): TerrainSample;
  sampleNatural(x: number, z: number, out: TerrainSample): void;
  readonly roads: { readonly roads: readonly RoadSpec[] };
}

export interface RailStation {
  id: string;
  kind: StationKind;
  x: number;
  z: number;
  radius: number;
  /** Mean natural ground height (m) and height spread (m) of the station area. */
  y: number;
  spread: number;
}

export type RailSegmentKind = 'ground' | 'tunnel' | 'bridge';
export interface RailSegment {
  kind: RailSegmentKind;
  /** Distance along the edge (m). */
  s0: number;
  s1: number;
}

export interface RailEdge {
  id: string;
  from: string;
  to: string;
  xs: Float64Array;
  zs: Float64Array;
  /** Natural ground height under each point (m). */
  ground: Float32Array;
  /** Designed rail height (m): gentle grade, used by the next stage to build cuttings, embankments, bridges and tunnels. */
  design: Float32Array;
  /** Distance along the edge from point 0 (m). */
  cum: Float64Array;
  length: number;
  segments: RailSegment[];
  /** Smallest curve radius of the smoothed path (m) and steepest design grade (rise / run). */
  minRadius: number;
  maxGrade: number;
  /** Share (0..1) of the path over water. */
  wetShare: number;
}

/** How a road and the railway cross (all crossings are grade-separated, never at the same level). */
export type CrossingKind =
  | 'road-over-rail' // road on a flyover, rail stays low (rail in a cutting or on flat ground)
  | 'rail-over-road' // rail on an embankment / viaduct, road passes under it (underpass)
  | 'rail-tunnel' // rail in a tunnel, the road passes over the hill
  | 'rail-under-bridge'; // the road is already on a bridge here, the rail passes under it

export interface RailCrossing {
  x: number;
  z: number;
  edgeId: string;
  /** Distance along the rail edge (m). */
  s: number;
  roadId: number;
  roadName: string;
  roadTier: 1 | 2 | 3 | 4;
  kind: CrossingKind;
}

const STEP = 60;
const N = Math.round(Config.world.size / STEP);
const HALF = Config.world.size / 2;
const cellX = (i: number): number => -HALF + (i + 0.5) * STEP;
const cellI = (x: number): number => Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / STEP)));

// 16 neighbour moves (8 + 8 knight moves): paths bend more smoothly than on a plain 8-neighbour grid.
const MOVES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/** Binary min-heap of (key, value) pairs. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    let i = this.k.length;
    this.k.push(key);
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The railway network: station areas + track centre lines between them (data only, nothing is built).
 * Deterministic: depends only on the terrain (seed) and the plan in RailPlan.ts.
 */
export class RailNetwork {
  readonly stations: RailStation[] = [];
  readonly edges: RailEdge[] = [];
  readonly crossings: RailCrossing[] = [];

  // coarse grid (STEP m)
  private h = new Float32Array(N * N);
  /** 0 = dry, 1 = river / shallow water (a bridge is needed), 2 = lake / sea (blocked). */
  private wet = new Uint8Array(N * N);
  /** 0 = no road, 1..3 = tier of the main road in the cell. */
  private road = new Uint8Array(N * N);
  private sc: TerrainSample;

  constructor(private terrain: RailTerrain) {
    this.sc = terrain.makeSample();
    this.buildGrid();
    this.placeStations();
    this.routeLines();
    this.findCrossings();
  }

  stationById(id: string): RailStation | undefined {
    return this.stations.find((s) => s.id === id);
  }

  /** The station area that contains (x, z), or null. */
  stationAt(x: number, z: number): RailStation | null {
    for (const s of this.stations) if (Math.hypot(x - s.x, z - s.z) <= s.radius) return s;
    return null;
  }

  /** Total length of all rail edges (km). */
  get lengthKm(): number {
    return this.edges.reduce((a, e) => a + e.length, 0) / 1000;
  }

  /* ---------------------------------------------------------------- grid */

  private buildGrid(): void {
    const sc = this.sc;
    const off = [0, -20, 20];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cellX(i);
        const z = cellX(j);
        this.terrain.sampleNatural(x, z, sc);
        const k = j * N + i;
        this.h[k] = sc.h;
        let wetN = 0;
        let deep = 0;
        let n = 0;
        for (const dx of off) {
          for (const dz of off) {
            if (dx !== 0 && dz !== 0) continue; // plus-shaped probe: centre + 4 neighbours
            n++;
            if (dx === 0 && dz === 0) this.terrain.sampleNatural(x, z, sc);
            else this.terrain.sampleNatural(x + dx, z + dz, sc);
            if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) {
              wetN++;
              if (sc.water - sc.h > 2.5) deep++;
            }
          }
        }
        this.wet[k] = wetN === 0 ? 0 : deep >= 3 || wetN >= n - 1 ? 2 : 1;
      }
    }
    // roads of tier 1-3: mark the cells they pass (finer than the grid so no cell is skipped)
    for (const r of this.terrain.roads.roads) {
      if (r.tier > 3) continue;
      for (let a = 0; a < r.xs.length - 1; a++) {
        const len = Math.hypot(r.xs[a + 1] - r.xs[a], r.zs[a + 1] - r.zs[a]);
        const steps = Math.max(1, Math.ceil(len / 20));
        for (let q = 0; q <= steps; q++) {
          const t = q / steps;
          const k = cellI(r.zs[a] + (r.zs[a + 1] - r.zs[a]) * t) * N + cellI(r.xs[a] + (r.xs[a + 1] - r.xs[a]) * t);
          if (!this.road[k] || r.tier < this.road[k]) this.road[k] = r.tier;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- stations */

  private placeStations(): void {
    const sc = this.sc;
    for (const p of STATIONS) {
      let best = { x: p.x, z: p.z, score: Infinity, y: 0, spread: 0 };
      const span = Math.max(60, Math.ceil(p.snap / 40)) * 40;
      for (let dx = -span; dx <= span; dx += 40) {
        for (let dz = -span; dz <= span; dz += 40) {
          const d = Math.hypot(dx, dz);
          if (d > p.snap) continue;
          const x = p.x + dx;
          const z = p.z + dz;
          if (Math.abs(x) > HALF - 400 || Math.abs(z) > HALF - 400) continue;
          // sample the station disc: height spread + wetness
          let lo = Infinity;
          let hi = -Infinity;
          let sum = 0;
          let wet = 0;
          let n = 0;
          for (let a = -p.radius; a <= p.radius; a += p.radius / 2) {
            for (let b = -p.radius; b <= p.radius; b += p.radius / 2) {
              if (Math.hypot(a, b) > p.radius) continue;
              this.terrain.sampleNatural(x + a, z + b, sc);
              n++;
              sum += sc.h;
              lo = Math.min(lo, sc.h);
              hi = Math.max(hi, sc.h);
              if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) wet++;
            }
          }
          const score = (hi - lo) + (wet / n) * 400 + d * 0.01;
          if (score < best.score) best = { x, z, score, y: sum / n, spread: hi - lo };
        }
      }
      this.stations.push({ id: p.id, kind: p.kind, x: best.x, z: best.z, radius: p.radius, y: best.y, spread: best.spread });
    }
  }

  /* ---------------------------------------------------------------- routing */

  private nearestFree(x: number, z: number): number {
    const ci = cellI(x);
    const cj = cellI(z);
    let bestK = cj * N + ci;
    let bestD = Infinity;
    for (let r = 0; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
          const k = j * N + i;
          if (this.wet[k] === 2) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            bestK = k;
          }
        }
      }
      if (bestD < Infinity) break;
    }
    return bestK;
  }

  /** A* from cell `a` to cell `b`; returns the cell centres. */
  private astar(a: number, b: number): number[][] {
    const gScore = new Float64Array(N * N).fill(Infinity);
    const from = new Int32Array(N * N).fill(-1);
    const done = new Uint8Array(N * N);
    const heap = new Heap();
    const bi = b % N;
    const bj = (b / N) | 0;
    const heur = (k: number): number => Math.hypot(((k % N) - bi) * STEP, (((k / N) | 0) - bj) * STEP);
    gScore[a] = 0;
    heap.push(heur(a), a);
    while (heap.size) {
      const k = heap.pop();
      if (done[k]) continue;
      done[k] = 1;
      if (k === b) break;
      const i = k % N;
      const j = (k / N) | 0;
      for (const [di, dj] of MOVES) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 1 || nj < 1 || ni >= N - 1 || nj >= N - 1) continue;
        const nk = nj * N + ni;
        if (done[nk] || this.wet[nk] === 2) continue;
        const dist = Math.hypot(di, dj) * STEP;
        const grade = Math.abs(this.h[nk] - this.h[k]) / dist;
        if (grade > 0.3) continue; // a cliff: not even a tunnel
        // steep ground is not forbidden (the line goes under it in a tunnel) but it is expensive
        let cost = dist * (1 + Math.min(18 * (grade / 0.03) ** 2, 30));
        if (this.wet[nk] === 1) cost += 2500; // river: a bridge. Cross it, never run along it
        if (this.road[nk]) cost += this.road[k] ? 60 * (dist / STEP) : 160; // crossing a road costs; running along a road costs
        const g = gScore[k] + cost;
        if (g < gScore[nk]) {
          gScore[nk] = g;
          from[nk] = k;
          heap.push(g + heur(nk), nk);
        }
      }
    }
    const path: number[][] = [];
    let c = b;
    if (from[b] === -1 && a !== b) return [[cellX(a % N), cellX((a / N) | 0)], [cellX(bi), cellX(bj)]];
    while (c !== -1) {
      path.push([cellX(c % N), cellX((c / N) | 0)]);
      c = from[c];
    }
    return path.reverse();
  }

  private routeLines(): void {
    for (const line of LINES) {
      const sa = this.stationById(line.from)!;
      const sb = this.stationById(line.to)!;
      const pts: number[][] = [];
      const stops: [number, number][] = [[sa.x, sa.z], ...line.via.map((v) => [v[0], v[1]] as [number, number]), [sb.x, sb.z]];
      for (let q = 0; q < stops.length - 1; q++) {
        const seg = this.astar(this.nearestFree(stops[q][0], stops[q][1]), this.nearestFree(stops[q + 1][0], stops[q + 1][1]));
        pts.push(...(q === 0 ? seg : seg.slice(1)));
      }
      this.edges.push(this.finishEdge(line.id, line.from, line.to, pts, sa, sb));
    }
  }

  /** Resample, smooth (curve radius), then measure ground / design height and find tunnels and bridges. */
  private finishEdge(id: string, from: string, to: string, grid: number[][], sa: RailStation, sb: RailStation): RailEdge {
    // 1. resample the grid path every `step` m
    let pts = this.resample([[sa.x, sa.z], ...grid, [sb.x, sb.z]], D.step);
    const orig = pts.map((p) => [p[0], p[1]]);
    // 2. relax: each point moves towards the middle of its neighbours, but stays within 520 m of the router's path
    const CLAMP = 520;
    for (let it = 0; it < 4000; it++) {
      for (let i = 1; i < pts.length - 1; i++) {
        const tx = (pts[i - 1][0] + pts[i + 1][0]) / 2;
        const tz = (pts[i - 1][1] + pts[i + 1][1]) / 2;
        let nx = pts[i][0] + 0.5 * (tx - pts[i][0]);
        let nz = pts[i][1] + 0.5 * (tz - pts[i][1]);
        const dx = nx - orig[i][0];
        const dz = nz - orig[i][1];
        const d = Math.hypot(dx, dz);
        if (d > CLAMP) {
          nx = orig[i][0] + (dx / d) * CLAMP;
          nz = orig[i][1] + (dz / d) * CLAMP;
        }
        pts[i][0] = nx;
        pts[i][1] = nz;
      }
    }
    pts = this.resample(pts, D.step);
    const n = pts.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    const cum = new Float64Array(n);
    const ground = new Float32Array(n);
    const wetPt = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      zs[i] = pts[i][1];
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      this.terrain.sampleNatural(xs[i], zs[i], this.sc);
      ground[i] = this.sc.h;
      wetPt[i] = !Number.isNaN(this.sc.water) && this.sc.h <= this.sc.water + 0.3 ? 1 : 0;
    }
    // 3. minimum curve radius (circle through points 3 samples apart)
    let minRadius = Infinity;
    const k = 3;
    for (let i = k; i < n - k; i++) {
      const r = circumRadius(xs[i - k], zs[i - k], xs[i], zs[i], xs[i + k], zs[i + k]);
      if (r < minRadius) minRadius = r;
    }
    // 4. design height: moving average of the ground, then limited to the maximum grade (forward + backward pass)
    const design = new Float32Array(n);
    const win = 10;
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
        s += ground[j];
        c++;
      }
      design[i] = s / c;
    }
    design[0] = ground[0];
    design[n - 1] = ground[n - 1];
    const gmax = D.maxGrade * D.step;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n; i++) design[i] = Math.max(design[i - 1] - gmax, Math.min(design[i - 1] + gmax, design[i]));
      for (let i = n - 2; i >= 0; i--) design[i] = Math.max(design[i + 1] - gmax, Math.min(design[i + 1] + gmax, design[i]));
    }
    let maxGrade = 0;
    for (let i = 1; i < n; i++) maxGrade = Math.max(maxGrade, Math.abs(design[i] - design[i - 1]) / D.step);
    // 5. tunnels (deep cutting for a long run) and bridges (over water, or high fill for a long run)
    const tag = new Uint8Array(n); // 0 ground, 1 tunnel, 2 bridge
    markRuns(n, (i) => ground[i] - design[i] > D.tunnelCut, Math.ceil(D.tunnelMinLen / D.step), tag, 1);
    markRuns(n, (i) => wetPt[i] === 1 || design[i] - ground[i] > D.bridgeFill, Math.ceil(D.bridgeMinLen / D.step), tag, 2);
    for (let i = 0; i < n; i++) if (wetPt[i] && tag[i] === 0) tag[i] = 2; // any water = bridge, even a short one
    const segments: RailSegment[] = [];
    const names: RailSegmentKind[] = ['ground', 'tunnel', 'bridge'];
    let s = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || tag[i] !== tag[s]) {
        segments.push({ kind: names[tag[s]], s0: cum[s], s1: cum[Math.min(i, n - 1)] });
        s = i;
      }
    }
    const wetShare = wetPt.reduce((a, b) => a + b, 0) / n;
    return { id, from, to, xs, zs, ground, design, cum, length: cum[n - 1], segments, minRadius, maxGrade, wetShare };
  }

  private resample(p: number[][], step: number): number[][] {
    const out: number[][] = [[p[0][0], p[0][1]]];
    let carry = 0;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i][0] - p[i - 1][0];
      const dz = p[i][1] - p[i - 1][1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      let t = step - carry;
      while (t <= len) {
        out.push([p[i - 1][0] + (dx * t) / len, p[i - 1][1] + (dz * t) / len]);
        t += step;
      }
      carry = len - (t - step);
    }
    const last = p[p.length - 1];
    const o = out[out.length - 1];
    if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push([last[0], last[1]]);
    else out[out.length - 1] = [last[0], last[1]];
    return out;
  }

  /* ---------------------------------------------------------------- crossings */

  /** Every place where a road crosses a railway, and how the crossing is resolved (decided by the shape of the land). */
  private findCrossings(): void {
    const B = 250;
    const buckets = new Map<number, { r: RoadSpec; i: number }[]>();
    const key = (bx: number, bz: number): number => (bx + 100) * 1000 + (bz + 100);
    for (const r of this.terrain.roads.roads) {
      for (let i = 0; i < r.xs.length - 1; i++) {
        const k = key(Math.floor(r.xs[i] / B), Math.floor(r.zs[i] / B));
        (buckets.get(k) ?? buckets.set(k, []).get(k)!).push({ r, i });
      }
    }
    for (const e of this.edges) {
      for (let a = 0; a < e.xs.length - 1; a++) {
        const bx = Math.floor(e.xs[a] / B);
        const bz = Math.floor(e.zs[a] / B);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (const { r, i } of buckets.get(key(bx + dx, bz + dz)) ?? []) {
              const hit = segIntersect(e.xs[a], e.zs[a], e.xs[a + 1], e.zs[a + 1], r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1]);
              if (!hit) continue;
              const s = e.cum[a] + hit.t * (e.cum[a + 1] - e.cum[a]);
              if (this.crossings.some((c) => c.roadId === r.id && c.edgeId === e.id && Math.abs(c.s - s) < 30)) continue;
              this.crossings.push({ x: hit.x, z: hit.z, edgeId: e.id, s, roadId: r.id, roadName: r.name, roadTier: r.tier, kind: this.resolve(e, a, r, i, hit.x, hit.z) });
            }
          }
        }
      }
    }
  }

  /**
   * RULES (decided by the shape of the land, never "same level"):
   *   - the road is already on a bridge there            -> rail passes under it,
   *   - the rail is in a tunnel                          -> the road stays on the hill above,
   *   - the rail is on a bridge / high embankment        -> road passes UNDER the railway (underpass),
   *   - the rail is in a deep cutting                    -> road goes OVER the railway (flyover),
   *   - city streets in built-up land                    -> the rail is raised on a viaduct, streets pass under,
   *   - flat land                                        -> road goes over the railway (flyover).
   */
  private resolve(e: RailEdge, a: number, r: RoadSpec, i: number, x: number, z: number): CrossingKind {
    if (r.bridgeOf[i] >= 0) return 'rail-under-bridge';
    const seg = e.segments.find((s) => e.cum[a] >= s.s0 && e.cum[a] <= s.s1);
    if (seg?.kind === 'tunnel') return 'rail-tunnel';
    if (seg?.kind === 'bridge') return 'rail-over-road';
    const fill = e.design[a] - e.ground[a];
    if (fill >= D.crossCutFill) return 'rail-over-road';
    if (-fill >= D.crossCutFill) return 'road-over-rail';
    if (r.tier === 4) {
      const kind = getWorldZoneAt(x, z).kind;
      if (kind === 'urban-core' || kind === 'commercial' || kind === 'residential') return 'rail-over-road';
    }
    return 'road-over-rail';
  }
}

/* ------------------------------------------------------------------ helpers */

function circumRadius(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ab = Math.hypot(bx - ax, bz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const ca = Math.hypot(ax - cx, az - cz);
  const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
  return area2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * area2);
}

function markRuns(n: number, test: (i: number) => boolean, minSamples: number, tag: Uint8Array, value: number): void {
  let i = 0;
  while (i < n) {
    if (!test(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && test(j)) j++;
    if (j - i >= minSamples) for (let q = Math.max(0, i - 2); q < Math.min(n, j + 2); q++) tag[q] = value;
    i = j;
  }
}

function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { x: number; z: number; t: number } | null {
  const r1x = bx - ax;
  const r1z = bz - az;
  const r2x = dx - cx;
  const r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + r1x * t, z: az + r1z * t, t };
}
