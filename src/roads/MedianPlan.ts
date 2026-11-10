// ROADS STEP 2: where the physical median stands. Pure maths (no three.js, no Rapier), so the mesh (MedianView), the collider (MedianPhysics)
// and the headless test (scripts/median-test.ts) all read the SAME plan.
//
// A median "run" is a stretch of a divided road (highway, arterial, avenue) between two junction pads (or road ends).
// It is sampled every Config.city.median.step metres. Both ends have a rounded nose and the run stops padMargin m beyond the pad core,
// so the median never reaches a junction (cars turn there) and the hedges / trees (they stop at 9 / 16 m) always stand inside it.
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import type { RoadSpec } from './RoadTypes';
import { dividedSectionOf } from './RoadSection';
import { padIndex } from './PadIndex';
import { padDistance, placeUTurns, type RunRange, type UTurnPlan } from './UTurns';
import { MALL_DOORS } from '../mall/MallSite';
import { planStreetCrossings } from './CrossingPlan';

/** Floats per sample in MedianRun.p: x, y, z (centreline, finished road surface), nx, nz (unit left normal), tx, tz (unit tangent), s (arc length). */
export const MS = 8;

export interface MedianRun {
  roadId: number;
  /** Half width of the whole median (centre to the outer face of the kerb), width of one kerb, kerb height (m). */
  medianHalf: number;
  kerbW: number;
  kerbH: number;
  n: number;
  p: Float64Array;
}

/** A pedestrian crossing: an opening [a, b] (m along the road, on the sample grid) in the median plus a zebra band centred on s. */
export interface Crossing {
  roadId: number;
  s: number;
  a: number;
  b: number;
  x: number;
  z: number;
  /** ROADS STEP 6b: a mid-block crossing of an undivided city road (no median opening, see CrossingPlan.ts). */
  street?: boolean;
}

/** Is s (m along road `roadId`) inside a pedestrian crossing's opening, or within `clear` m of it? Trees / hedges stay out of it. */
export function crossingZoneHas(plan: { crossings: Crossing[] }, roadId: number, s: number, clear: number): boolean {
  for (const c of plan.crossings) if (c.roadId === roadId && s > c.a - clear && s < c.b + clear) return true;
  return false;
}

export interface MedianPlan {
  /** Pedestrian crossings (median gaps + zebra), see Config.city.median.crossing. */
  crossings: Crossing[];
  runs: MedianRun[];
  /** ROADS STEP 4: the U-turn openings. The median runs are already cut at them (a gap between two runs, each ending in a nose). */
  uturns: UTurnPlan;
  /** Metres of median built, and metres of divided road left flat (inside junctions). */
  metres: number;
  flatMetres: number;
}

/** Width factor (0..1) of the rounded nose, `d` metres from the nearest end of the run. */
export function noseScale(d: number): number {
  const L = Config.city.median.noseLen;
  const t = Math.min(1, Math.max(0, d / L));
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Half width of the median at sample k of a run (the nose narrows it at both ends). */
export function medianHalfAt(run: MedianRun, k: number): number {
  const sk = run.p[k * MS + 7];
  const d = Math.min(sk - run.p[7], run.p[(run.n - 1) * MS + 7] - sk);
  return run.medianHalf * noseScale(d);
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
  let tx = r.xs[i + 1] - r.xs[i];
  let tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  out[o] = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f;
  out[o + 1] = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f;
  out[o + 2] = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
  out[o + 3] = nx; out[o + 4] = nz;
  out[o + 5] = tx / tl; out[o + 6] = tz / tl;
  out[o + 7] = s;
}

const cache = new WeakMap<RoadNetwork, MedianPlan>();

export function planMedians(roads: RoadNetwork): MedianPlan {
  const hit = cache.get(roads);
  if (hit) return hit;
  const M = Config.city.median;
  const nearPad = padIndex(roads);
  const runs: MedianRun[] = [];
  let metres = 0;
  const base: MedianRun[] = []; // the runs before the U-turn openings are cut out
  for (const r of roads.roads) {
    const sec = dividedSectionOf(r);
    if (!sec || r.earth || r.xs.length < 2 || r.length < M.minRun) continue;
    const kerbH = M.height; // median kerb height (Config.city.median.height), no longer the 0.15 m of the design table
    const cur = { i: 0 };
    const count = Math.floor(r.length / M.step) + 1;
    // sample the whole road, mark the samples that are inside a junction
    const pts = new Float64Array((count + 1) * MS);
    let m = 0;
    for (let k = 0; k <= count; k++) {
      const s = Math.min(r.length, k * M.step);
      if (m > 0 && s - pts[(m - 1) * MS + 7] < 0.5) break;
      sampleRoad(r, s, cur, pts, m * MS);
      m++;
    }
    let k = 0;
    while (k < m) {
      while (k < m && nearPad(pts[k * MS], pts[k * MS + 2], M.padMargin)) k++;
      const a = k;
      while (k < m && !nearPad(pts[k * MS], pts[k * MS + 2], M.padMargin)) k++;
      const b = k; // samples a..b-1
      if (b - a < 2) continue;
      const len = pts[(b - 1) * MS + 7] - pts[a * MS + 7];
      if (len < M.minRun) continue;
      base.push({ roadId: r.id, medianHalf: sec.medianHalf, kerbW: sec.medianKerb, kerbH, n: b - a, p: pts.slice(a * MS, b * MS) });
    }
  }
  // ROADS STEP 4: place the U-turn openings on the whole runs, then cut every run at them
  const ranges = new Map<number, RunRange[]>();
  for (const u of base) {
    const l = ranges.get(u.roadId) ?? [];
    l.push({ roadId: u.roadId, sa: u.p[7], sb: u.p[(u.n - 1) * MS + 7] });
    ranges.set(u.roadId, l);
  }
  // PEDESTRIAN CROSSINGS: the nearest divided road to every mall door (and Config extras); the median is cut there and no U-turn opening may sit near it
  const crossings: Crossing[] = [];
  const CR = M.crossing;
  if (CR.enabled) {
    const spots = [...MALL_DOORS.map((d) => ({ x: d.x, z: d.z })), ...CR.extra];
    for (const p of spots) {
      let best: { r: RoadSpec; s: number; d: number; i: number } | null = null;
      for (const r of roads.roads) {
        if (!dividedSectionOf(r) || r.earth || r.xs.length < 2) continue;
        for (let i = 0; i < r.xs.length - 1; i++) {
          const ex = r.xs[i + 1] - r.xs[i];
          const ez = r.zs[i + 1] - r.zs[i];
          const l2 = ex * ex + ez * ez;
          if (l2 < 1e-9) continue;
          const t = Math.max(0, Math.min(1, ((p.x - r.xs[i]) * ex + (p.z - r.zs[i]) * ez) / l2));
          const d = Math.hypot(p.x - (r.xs[i] + ex * t), p.z - (r.zs[i] + ez * t));
          if (!best || d < best.d) best = { r, s: r.cum[i] + Math.sqrt(l2) * t, d, i };
        }
      }
      if (!best || best.d > CR.maxDist || best.r.bridgeOf[best.i] >= 0) continue;
      if (crossings.some((c) => c.roadId === best!.r.id && Math.abs(c.s - best!.s) < 30)) continue;
      const cur2 = { i: 0 };
      const smp = new Float64Array(MS);
      sampleRoad(best.r, best.s, cur2, smp, 0);
      if (nearPad(smp[0], smp[2], M.padMargin + 8)) continue; // never inside a junction
      const a = Math.floor((best.s - CR.gap / 2) / M.step) * M.step;
      const b = Math.ceil((best.s + CR.gap / 2) / M.step) * M.step;
      crossings.push({ roadId: best.r.id, s: best.s, a, b, x: smp[0], z: smp[2] });
    }
    // keep the U-turn openings away from the crossings (split the allowed ranges around them)
    for (const c of crossings) {
      const l = ranges.get(c.roadId);
      if (!l) continue;
      const out: RunRange[] = [];
      for (const rg of l) {
        if (c.s < rg.sa || c.s > rg.sb) { out.push(rg); continue; }
        if (c.a - 25 > rg.sa) out.push({ roadId: rg.roadId, sa: rg.sa, sb: c.a - 25 });
        if (c.b + 25 < rg.sb) out.push({ roadId: rg.roadId, sa: c.b + 25, sb: rg.sb });
      }
      ranges.set(c.roadId, out);
    }
  }
  // ROADS STEP 6b: mid-block zebra crossings on undivided city roads (no median to cut; the footpath breaks there)
  crossings.push(...planStreetCrossings(roads));
  const uturns = placeUTurns(roads.roads, ranges, padDistance(roads.pads, Config.city.uturn.padMax), M.step);
  for (const u of base) {
    const sa = u.p[7];
    const sb = u.p[(u.n - 1) * MS + 7];
    const cuts = [
      ...(uturns.byRoad.get(u.roadId) ?? []),
      ...crossings.filter((c) => c.roadId === u.roadId),
    ].filter((o) => o.a >= sa - 1e-6 && o.b <= sb + 1e-6).sort((p, q) => p.a - q.a);
    // pieces [lo, hi] in metres along the road
    const pieces: [number, number][] = [];
    let lo = sa;
    for (const o of cuts) { pieces.push([lo, o.a]); lo = o.b; }
    pieces.push([lo, sb]);
    for (const [pl, ph] of pieces) {
      let i0 = 0;
      while (i0 < u.n && u.p[i0 * MS + 7] < pl - 1e-6) i0++;
      let i1 = u.n - 1;
      while (i1 >= 0 && u.p[i1 * MS + 7] > ph + 1e-6) i1--;
      if (i1 - i0 < 1) continue;
      const len = u.p[i1 * MS + 7] - u.p[i0 * MS + 7];
      if (len < M.minRun - 1e-6) continue;
      runs.push({ roadId: u.roadId, medianHalf: u.medianHalf, kerbW: u.kerbW, kerbH: u.kerbH, n: i1 - i0 + 1, p: u.p.slice(i0 * MS, (i1 + 1) * MS) });
      metres += len;
    }
  }
  const out = { runs, uturns, crossings, metres, flatMetres: 0 };
  // flatMetres = divided road length - built median length
  let divided = 0;
  for (const r of roads.roads) if (dividedSectionOf(r) && !r.earth) divided += r.length;
  out.flatMetres = Math.max(0, divided - metres);
  cache.set(roads, out);
  return out;
}

/** Position and orientation of the collider piece between sample k and k+1 of a run (all in world coordinates). */
export interface MedianPiece {
  x: number; y: number; z: number;
  /** Full length along the road (3D, m), half width of the median here (m), yaw / pitch (rad). */
  len: number; hw: number; yaw: number; pitch: number;
}

export function medianPiece(run: MedianRun, k: number): MedianPiece {
  const a = k * MS;
  const b = a + MS;
  const dx = run.p[b] - run.p[a];
  const dz = run.p[b + 2] - run.p[a + 2];
  const dy = run.p[b + 1] - run.p[a + 1];
  const hl = Math.hypot(dx, dz);
  return {
    x: (run.p[a] + run.p[b]) / 2,
    y: (run.p[a + 1] + run.p[b + 1]) / 2,
    z: (run.p[a + 2] + run.p[b + 2]) / 2,
    len: Math.hypot(hl, dy),
    hw: (medianHalfAt(run, k) + medianHalfAt(run, k + 1)) / 2,
    yaw: Math.atan2(dx, dz),
    // rotating +Z about X by -pitch lifts it by tan(pitch) = dy / hl
    pitch: -Math.atan2(dy, hl || 1e-9),
  };
}

/** Quaternion (x, y, z, w) for yaw about Y followed by pitch about X (Euler 'YXZ' without roll). */
export function yawPitchQuat(yaw: number, pitch: number): { x: number; y: number; z: number; w: number } {
  const sy = Math.sin(yaw / 2); const cy = Math.cos(yaw / 2);
  const sx = Math.sin(pitch / 2); const cx = Math.cos(pitch / 2);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };
}
