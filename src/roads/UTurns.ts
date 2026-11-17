// ROADS STEP 4: U-turn openings in the median. Pure maths (no three.js, no Rapier): the median plan (MedianPlan), the mesh (MedianView), the roadside plan
// (Roadside), the AI route (traffic/Route) and the headless test (scripts/uturn-test.ts) all read the SAME openings.
//
// One opening serves BOTH directions. A car drives in its kerb lane (left-hand traffic), swings right across all lanes of its carriageway, through the gap
// in the median, and ends in the kerb lane of the opposite carriageway: a half circle whose radius is the distance from the centreline to the kerb-lane
// centre (highway 10.45 m, arterial 6.65 m, avenue 9.53 m). The apex of the half circle crosses the median in the middle of the gap.
//
// Rules (Config.city.uturn): 500..800 m between two openings of one road (never under 300 m), 60..100 m from the next junction pad core (never under 60 m),
// not on or next to a bridge, on a straight piece of road, and both median pieces left beside the gap are at least Config.city.median.minRun long.
import { Config } from '../core/Config';
import { hash2D, mulberry32 } from '../world/Seed';
import type { RoadSpec } from './RoadTypes';
import { DIVIDED_SECTIONS, dividedSectionOf, laneCentre, type SectionId } from './RoadSection';

export interface UTurnOpening {
  id: number;
  roadId: number;
  section: SectionId;
  /** Centre of the gap, and its ends (nose tips) in metres along the road. The ends lie on the median sample grid (Config.city.median.step). */
  s: number;
  a: number;
  b: number;
  len: number;
  /** Half width of the median here (centreline -> outer kerb face). */
  medianHalf: number;
  /** Radius of the half circle (m) = centre of the kerb lane. */
  radius: number;
  /** Road frame at the centre of the gap: position (x, y, z), left normal (nx, nz), unit tangent (tx, tz). */
  x: number; y: number; z: number; nx: number; nz: number; tx: number; tz: number;
}

export interface UTurnPlan {
  openings: UTurnOpening[];
  byRoad: Map<number, UTurnOpening[]>;
  /** Total length of all gaps (m). */
  metres: number;
}

export interface RunRange { roadId: number; sa: number; sb: number }

export interface RoadFrame { x: number; y: number; z: number; nx: number; nz: number; tx: number; tz: number }

/** Road frame at arc length s (binary search, no state). */
export function frameAt(r: RoadSpec, s: number, out: RoadFrame = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 }): RoadFrame {
  const n = r.xs.length;
  const sc = Math.min(r.length, Math.max(0, s));
  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.cum[mid] <= sc) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (sc - r.cum[i]) / seg)) : 0;
  let nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f;
  let nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f;
  const nl = Math.hypot(nx, nz) || 1;
  const tx = r.xs[i + 1] - r.xs[i];
  const tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  out.x = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f;
  out.y = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f;
  out.z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
  out.nx = nx / nl; out.nz = nz / nl;
  out.tx = tx / tl; out.tz = tz / tl;
  return out;
}

/**
 * Distance (m) from (x, z) to the nearest junction pad core, only searched up to `reach` m (returns reach when nothing is closer). padIndex() of the
 * roadside plan is only exact for margins up to about 10 m; the U-turn rules need 60 .. 100 m.
 */
export function padDistance(pads: readonly { x: number; z: number; rCore: number }[], reach: number): (x: number, z: number) => number {
  const cell = 200;
  const grid = new Map<string, number[]>();
  pads.forEach((p, i) => {
    const r = p.rCore + reach;
    for (let cx = Math.floor((p.x - r) / cell); cx <= Math.floor((p.x + r) / cell); cx++)
      for (let cz = Math.floor((p.z - r) / cell); cz <= Math.floor((p.z + r) / cell); cz++) {
        const k = cx + ',' + cz;
        const l = grid.get(k);
        if (l) l.push(i);
        else grid.set(k, [i]);
      }
  });
  return (x, z) => {
    const l = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell));
    let best = reach;
    if (l) for (const i of l) best = Math.min(best, Math.hypot(x - pads[i].x, z - pads[i].z) - pads[i].rCore);
    return best;
  };
}

const empty = (): UTurnPlan => ({ openings: [], byRoad: new Map(), metres: 0 });

/**
 * Place the openings. `ranges` are the median runs BEFORE any opening is cut (first and last sample s of each run), `padDist(x, z)` is the distance to the
 * nearest junction pad core (see padDistance, searched up to Config.city.uturn.padMax), `step` is the median sample spacing.
 */
export function placeUTurns(
  roadList: RoadSpec[],
  ranges: Map<number, RunRange[]>,
  padDist: (x: number, z: number) => number,
  step: number,
): UTurnPlan {
  const U = Config.city.uturn;
  const M = Config.city.median;
  if (!U.enabled) return empty();
  const plan = empty();
  const seed = Config.world.seed;
  const f0: RoadFrame = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
  const f1: RoadFrame = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
  const f2: RoadFrame = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
  const cosBend = Math.cos((U.maxBendDeg * Math.PI) / 180);
  // every other road (and a far part of the same road that comes back, e.g. a loop) must stay clear of the gap: a coarse grid of road samples every 8 m
  const CELL = 64;
  const near = new Map<string, number[]>();
  const sx: number[] = []; const sz: number[] = []; const sr: number[] = []; const ss: number[] = [];
  const f3: RoadFrame = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
  for (const q of roadList) {
    if (q.earth || q.xs.length < 2) continue;
    for (let s = 0; s <= q.length + 1e-6; s += 8) {
      frameAt(q, s, f3);
      const k = Math.floor(f3.x / CELL) + ',' + Math.floor(f3.z / CELL);
      const l = near.get(k);
      const i = sx.length;
      sx.push(f3.x); sz.push(f3.z); sr.push(q.id); ss.push(s);
      if (l) l.push(i);
      else near.set(k, [i]);
    }
  }
  const crossing = (x: number, z: number, roadId: number, s: number, clear: number): boolean => {
    const cx = Math.floor(x / CELL); const cz = Math.floor(z / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const l = near.get(gx + ',' + gz);
      if (!l) continue;
      for (const i of l) {
        if (sr[i] === roadId && Math.abs(ss[i] - s) < 150) continue; // the road itself beside the gap
        if (Math.hypot(sx[i] - x, sz[i] - z) < clear) return true;
      }
    }
    return false;
  };
  let nextId = 0;
  for (const r of roadList) {
    const sec = dividedSectionOf(r);
    const rr = ranges.get(r.id);
    if (!sec || r.earth || r.xs.length < 2 || !rr || rr.length === 0) continue;
    const half = U.len[sec.id] / 2;
    const radius = laneCentre(r, 0);
    // bridge intervals of this road (the gap keeps bridgeClear m away from them)
    const bridges: [number, number][] = [];
    for (let i = 0; i < r.xs.length - 1; i++) if (r.bridgeOf[i] >= 0) bridges.push([r.cum[i], r.cum[i + 1]]);
    const nGrid = Math.floor(r.length / step) + 1;
    const valid = new Uint8Array(nGrid); // 0 = no, 1 = allowed (>= padMin from a pad), 2 = preferred (padMin..padMax)
    const gapOf = (k: number): { a: number; b: number } => ({ a: Math.floor((k * step - half) / step) * step, b: Math.ceil((k * step + half) / step) * step });
    for (let k = 0; k < nGrid; k++) {
      const { a, b } = gapOf(k);
      const s = (a + b) / 2;
      let inRun = false;
      for (const q of rr) if (a - q.sa >= M.minRun - 1e-6 && q.sb - b >= M.minRun - 1e-6) { inRun = true; break; }
      if (!inRun) continue;
      let onBridge = false;
      for (const [b0, b1] of bridges) if (b1 > a - U.bridgeClear && b0 < b + U.bridgeClear) { onBridge = true; break; }
      if (onBridge) continue;
      frameAt(r, s, f0);
      const dPad = padDist(f0.x, f0.z);
      if (dPad < U.padMin) continue;
      if (crossing(f0.x, f0.z, r.id, s, sec.halfWidth + 20)) continue; // another road (or a loop of this one) passes close by
      frameAt(r, s - half - 20, f1);
      frameAt(r, s + half + 20, f2);
      if (f1.tx * f2.tx + f1.tz * f2.tz < cosBend) continue; // a bend: keep the gap on a straight piece
      valid[k] = dPad <= U.padMax ? 2 : 1;
    }
    const rng = mulberry32(hash2D(seed ^ 0x07412, r.id, 5));
    const wish = (): number => U.gapMin + rng() * (U.gapMax - U.gapMin);
    const W = Math.round(150 / step);
    let last = -1e9;
    let target = 120 + rng() * (U.gapMax - 120);
    const mine: UTurnOpening[] = [];
    while (target < r.length) {
      const k0 = Math.round(target / step);
      let strict = -1;
      let loose = -1;
      for (let d = 0; d <= W && strict < 0; d++) {
        for (const sg of d === 0 ? [1] : [1, -1]) {
          const k = k0 + sg * d;
          if (k < 0 || k >= nGrid || !valid[k]) continue;
          const { a, b } = gapOf(k);
          if ((a + b) / 2 - last < U.hardMin) continue;
          if (valid[k] === 2) { strict = k; break; }
          if (loose < 0) loose = k;
        }
      }
      const k = strict >= 0 ? strict : loose;
      if (k < 0) { target += 80; continue; }
      const { a, b } = gapOf(k);
      const s = (a + b) / 2;
      frameAt(r, s, f0);
      mine.push({
        id: nextId++, roadId: r.id, section: sec.id, s, a, b, len: b - a, medianHalf: sec.medianHalf, radius,
        x: f0.x, y: f0.y, z: f0.z, nx: f0.nx, nz: f0.nz, tx: f0.tx, tz: f0.tz,
      });
      last = s;
      target = s + wish();
    }
    if (mine.length > 0) {
      plan.byRoad.set(r.id, mine);
      for (const o of mine) { plan.openings.push(o); plan.metres += o.len; }
    }
  }
  return plan;
}

/** Is road position s within `clear` m of a gap (nose tip to nose tip) of this road? (Trees and hedges keep out of it.) */
export function uturnZoneHas(plan: UTurnPlan, roadId: number, s: number, clear: number): boolean {
  const l = plan.byRoad.get(roadId);
  if (!l) return false;
  for (const o of l) if (s > o.a - clear && s < o.b + clear) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Which vehicles may turn round: the same geometry the handoff table used (R_rear = wheelbase / tan(maxSteer), outer body radius = distance from the turn
// centre to the outer front corner). Bus and truck (28.7 m wall to wall) never fit; sedan, pickup, auto, rickshaw and tanker do.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export interface TurnSpec { half: { x: number; z: number }; wheelbaseHalf: number; maxSteer: number }

/** Outer body radius (m) of the vehicle on its tightest circle. */
export function turnOuterRadius(spec: TurnSpec): number {
  const rear = (spec.wheelbaseHalf * 2) / Math.tan(spec.maxSteer);
  return Math.hypot(rear + spec.half.x, spec.half.z + spec.wheelbaseHalf);
}

/** Can this vehicle turn round in the opening of the given road section (wall-to-wall circle inside the kerbs, and the half circle not tighter than the car can steer)? */
export function canUTurn(spec: TurnSpec, section: SectionId): boolean {
  const sec = DIVIDED_SECTIONS.find((d) => d.id === section);
  if (!sec) return false;
  const rear = (spec.wheelbaseHalf * 2) / Math.tan(spec.maxSteer);
  const radius = sec.halfWidth - sec.shyOuter - sec.laneW * 0.5; // kerb-lane centre
  return 2 * turnOuterRadius(spec) <= 2 * sec.halfWidth - Config.city.uturn.sideMargin && radius >= rear * 1.1;
}
