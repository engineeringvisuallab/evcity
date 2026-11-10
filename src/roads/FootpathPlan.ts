// ROADS STEP 3: where the raised footpath stands. Pure maths (no three.js, no Rapier): the mesh (FootpathView), the collider (FootpathPhysics),
// the people (PeopleManager) and the headless test (scripts/footpath-test.ts) all read the SAME plan.
//
// A footpath "run" is one side of a city road between two junction pads (or road ends / bridges / the edge of the city). The first and last piece
// are the dropped kerb: the footpath height goes from 0 to full over one step, so a wheelchair or a pram can roll on and off.
// Across the road (u = metres from the centreline, towards the outside of this side):
//   kerb face at u = hw (hw = asphalt half width), kerb top to hw + kerbW, walking surface to hw + W (cross-fall 2 % down to the road), outer edge face.
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import type { RoadSpec } from './RoadTypes';
import { padIndex } from './PadIndex';

/** Floats per sample in FootRun.p: x, y, z (centreline, finished road surface), nx, nz (unit left normal), tx, tz (unit tangent), s (arc length). */
export const FS = 8;

export interface FootRun {
  roadId: number;
  /** +1 = left of the direction of the road (the side of the left normal), -1 = right. */
  side: 1 | -1;
  /** Asphalt half width (kerb face) and width of the whole footpath strip (kerb stone + walk), m. */
  hw: number;
  width: number;
  n: number;
  p: Float64Array;
}

export interface FootpathPlan {
  runs: FootRun[];
  /** Metres of footpath built (both sides counted). */
  metres: number;
  /** Gully grates: x, y, z, yaw (4 floats each). */
  gullies: number[];
}

/** Height factor (0..1) of the dropped kerb at sample k of a run: 0 at both ends, 1 from one step in. */
export function rampFactor(run: FootRun, k: number): number {
  const d = Math.min(run.p[k * FS + 7] - run.p[7], run.p[(run.n - 1) * FS + 7] - run.p[k * FS + 7]);
  return Math.min(1, Math.max(0, d / Config.city.footpath.step));
}

/** Width of the footpath strip of road r (m): the ribbon shoulder of a city road. */
export function footWidth(r: RoadSpec): number {
  return Math.max(r.shoulder, Config.city.roadside.sidewalk);
}

function sampleRoad(r: RoadSpec, s: number, cur: { i: number }, out: Float64Array, o: number): void {
  const n = r.xs.length;
  while (cur.i < n - 2 && r.cum[cur.i + 1] < s) cur.i++;
  const i = cur.i;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (s - r.cum[i]) / seg)) : 0;
  let nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f;
  let nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f;
  const nl = Math.hypot(nx, nz) || 1;
  nx /= nl; nz /= nl;
  const tx = r.xs[i + 1] - r.xs[i];
  const tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  out[o] = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f;
  out[o + 1] = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f;
  out[o + 2] = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
  out[o + 3] = nx; out[o + 4] = nz;
  out[o + 5] = tx / tl; out[o + 6] = tz / tl;
  out[o + 7] = s;
}

/** Same rule as the ribbon (RoadNetwork.buildSegments): no earth track, no bridge deck, tier 4 or inside a planned city. */
function cityAt(roads: RoadNetwork, r: RoadSpec, i: number, x: number, z: number): boolean {
  if (r.earth) return false;
  const j = Math.min(r.xs.length - 1, i + 1);
  if (r.bridgeOf[i] >= 0 || r.bridgeOf[j] >= 0) return false;
  return r.tier === 4 || roads.isCityPoint(x, z);
}

const cache = new WeakMap<RoadNetwork, FootpathPlan>();

export function planFootpaths(roads: RoadNetwork): FootpathPlan {
  const hit = cache.get(roads);
  if (hit) return hit;
  const F = Config.city.footpath;
  const nearPad = padIndex(roads);
  const runs: FootRun[] = [];
  const gullies: number[] = [];
  let metres = 0;
  for (const r of roads.roads) {
    if (r.earth || r.closed || r.xs.length < 2 || r.length < F.minRun) continue;
    const cur = { i: 0 };
    const count = Math.floor(r.length / F.step) + 1;
    const pts = new Float64Array((count + 1) * FS);
    const city: boolean[] = [];
    let m = 0;
    for (let k = 0; k <= count; k++) {
      const s = Math.min(r.length, k * F.step);
      if (m > 0 && s - pts[(m - 1) * FS + 7] < 0.5) break;
      sampleRoad(r, s, cur, pts, m * FS);
      const x = pts[m * FS]; const z = pts[m * FS + 2];
      city.push(cityAt(roads, r, cur.i, x, z) && !nearPad(x, z, F.padMargin));
      m++;
    }
    const width = footWidth(r);
    for (const side of [1, -1] as const) {
      // a sample is usable when it is a city sample AND the strip beside the kerb does not lie on another road's asphalt (two roads side by side, a ramp)
      const ok: boolean[] = [];
      for (let k = 0; k < m; k++) {
        let good = city[k];
        if (good) {
          for (const f of [0.3, 0.5, 0.95]) {
            const l = side * (r.halfWidth + width * f);
            if (roads.surfaceAt(pts[k * FS] + pts[k * FS + 3] * l, pts[k * FS + 2] + pts[k * FS + 4] * l) === 1) { good = false; break; }
          }
        }
        ok.push(good);
      }
      for (let k = 0; k < m;) {
        while (k < m && !ok[k]) k++;
        const a = k;
        while (k < m && ok[k]) k++;
        const b = k;
        if (b - a < 2) continue;
        const len = pts[(b - 1) * FS + 7] - pts[a * FS + 7];
        if (len < F.minRun) continue;
        runs.push({ roadId: r.id, side, hw: r.halfWidth, width, n: b - a, p: pts.slice(a * FS, b * FS) });
        metres += len;
        // gully grates: in the gutter beside the kerb, every gullyStep metres, not in the dropped kerb pieces
        const first = pts[a * FS + 7] + F.step;
        const last = pts[(b - 1) * FS + 7] - F.step;
        const cs = { i: 0 };
        const tmp = new Float64Array(FS);
        const phase = ((r.id * 7 + (side > 0 ? 3 : 11)) % 10) * 0.7 + 4;
        for (let s = first + phase; s < last; s += F.gullyStep) {
          sampleRoad(r, s, cs, tmp, 0);
          const u = side * (r.halfWidth - 0.3);
          gullies.push(tmp[0] + tmp[3] * u, tmp[1], tmp[2] + tmp[4] * u, Math.atan2(tmp[5], tmp[6]));
        }
      }
    }
  }
  const out = { runs, metres, gullies };
  cache.set(roads, out);
  return out;
}

/** Collider / mesh frame of the piece between sample k and k+1 of a run: centre of the walking strip, length, yaw, pitch, height at the middle (m). */
export interface FootPiece {
  x: number; y: number; z: number; len: number; yaw: number; pitch: number; h: number;
}

export function footPiece(run: FootRun, k: number): FootPiece {
  const a = k * FS;
  const b = a + FS;
  const dx = run.p[b] - run.p[a];
  const dz = run.p[b + 2] - run.p[a + 2];
  const dy = run.p[b + 1] - run.p[a + 1];
  const hl = Math.hypot(dx, dz);
  const u = run.side * (run.hw + run.width / 2);
  const nxm = (run.p[a + 3] + run.p[b + 3]) / 2;
  const nzm = (run.p[a + 4] + run.p[b + 4]) / 2;
  const nl = Math.hypot(nxm, nzm) || 1;
  return {
    x: (run.p[a] + run.p[b]) / 2 + (nxm / nl) * u,
    y: (run.p[a + 1] + run.p[b + 1]) / 2,
    z: (run.p[a + 2] + run.p[b + 2]) / 2 + (nzm / nl) * u,
    len: Math.hypot(hl, dy),
    yaw: Math.atan2(dx, dz),
    pitch: -Math.atan2(dy, hl || 1e-9),
    h: Config.city.footpath.height * (rampFactor(run, k) + rampFactor(run, k + 1)) / 2,
  };
}

const spans = new WeakMap<FootpathPlan, Map<number, number[]>>();

/** Does the raised footpath of this side of road `roadId` stand at FULL height at arc length s (not in the dropped kerb pieces)? Tree pits use it. */
export function footpathHas(roads: RoadNetwork, roadId: number, side: 1 | -1, s: number): boolean {
  const plan = planFootpaths(roads);
  let m = spans.get(plan);
  if (!m) {
    m = new Map();
    for (const u of plan.runs) {
      const key = u.roadId * 2 + (u.side > 0 ? 1 : 0);
      const l = m.get(key);
      const a = u.p[7] + Config.city.footpath.step;
      const b = u.p[(u.n - 1) * FS + 7] - Config.city.footpath.step;
      if (l) l.push(a, b);
      else m.set(key, [a, b]);
    }
    spans.set(plan, m);
  }
  const l = m.get(roadId * 2 + (side > 0 ? 1 : 0));
  if (!l) return false;
  for (let i = 0; i < l.length; i += 2) if (s >= l[i] && s <= l[i + 1]) return true;
  return false;
}

/**
 * ROADS STEP 5: does a full-height footpath sample of this road side lie within `maxD` m of the pit centre (x, z)? footpathHas() only compares arc lengths; on a sharp bend the pit
 * (placed from the interpolated road normal) can land a little off the strip, so the pit planner asks this too.
 */
export function footpathNear(roads: RoadNetwork, roadId: number, side: 1 | -1, x: number, z: number, maxD: number): boolean {
  const plan = planFootpaths(roads);
  for (const u of plan.runs) {
    if (u.roadId !== roadId || u.side !== side) continue;
    const l = u.side * (u.hw + Config.city.roadside.pitOffset);
    for (let k = 1; k < u.n - 1; k++) {
      const a = k * FS;
      if (Math.hypot(x - (u.p[a] + u.p[a + 3] * l), z - (u.p[a + 2] + u.p[a + 4] * l)) < maxD) return true;
    }
  }
  return false;
}

