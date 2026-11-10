import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import type { RoadSpec } from './RoadTypes';
import { medianSoilTop } from './RoadSection';
import { MS, crossingZoneHas, planMedians } from './MedianPlan';

/**
 * ROADS STEP 5: planting rules of the divided roads that more than one file needs (pure maths, no three.js, so the chunk worker, the main thread and the tests agree).
 *   sightZoneLen(r)        length (m) of the low-planting zone on each side of a U-turn opening (decision D7)
 *   planMedianLamps(...)   where the double-arm lamps of the median stand
 *   medianLampAt(...)      is there a median lamp within `clear` m of s (trees keep away from the poles)
 */

type SightKind = 'highway' | 'arterial' | 'avenue';

/** Which divided kind a road is (highway, arterial, or the downtown avenue = a tier 4 street with a median). */
export function dividedKind(r: { kind: string; medianHalf: number }): SightKind {
  return r.kind === 'highway' ? 'highway' : r.kind === 'arterial' ? 'arterial' : 'avenue';
}

/** D7: length (m) of the sight zone beside each U-turn opening of this road, never shorter than the old plantClear. */
export function sightZoneLen(r: { kind: string; medianHalf: number }): number {
  return Math.max(Config.city.uturn.plantClear, Config.city.planting.sightZone[dividedKind(r)]);
}

export interface MedianLamp {
  roadId: number;
  /** Arc length (m) of the pole along the road. */
  s: number;
  /** Foot of the pole: on the soil of the median. y = road surface + soil top. */
  x: number;
  y: number;
  z: number;
  /** Road surface height under the pole (the light pool lies on the road, not on the soil). */
  roadY: number;
  /** Unit left normal of the road (the arm of the +1 side points to -n... see StreetLights) and unit tangent (x, y, z with the grade). */
  nx: number;
  nz: number;
  tx: number;
  ty: number;
  tz: number;
  kind: SightKind;
}

const cache = new WeakMap<RoadNetwork, (x: number, z: number, clear: number) => boolean>();

/** Double-arm lamps of every median run. Deterministic and the same on every quality preset (the trees of the median keep away from these poles). */
export function planMedianLamps(roads: RoadNetwork): MedianLamp[] {
  const L = Config.city.planting.medianLamps;
  if (!L.enabled) return [];
  const plan = planMedians(roads);
  const out: MedianLamp[] = [];
  for (const run of plan.runs) {
    const r: RoadSpec = roads.roads[run.roadId];
    if (!r) continue;
    const kind = dividedKind(r);
    const step = L.step[kind];
    const s0 = run.p[7];
    const s1 = run.p[(run.n - 1) * MS + 7];
    const room = s1 - s0 - 2 * L.clearEnds;
    if (room < 0) continue;
    const count = Math.max(1, Math.round(room / step));
    // a short run gets one lamp in the middle; a long one is spread evenly between the two clear ends (never farther apart than about `step`)
    const at: number[] = [];
    if (room < step * 0.5) at.push(s0 + (s1 - s0) / 2);
    else for (let q = 0; q <= count; q++) at.push(s0 + L.clearEnds + (room * q) / count);
    let k = 0;
    for (const sAt of at) {
      if (crossingZoneHas(plan, run.roadId, sAt, 4)) continue;
      while (k < run.n - 2 && run.p[(k + 1) * MS + 7] < sAt) k++;
      const a = k * MS;
      const b = (k + 1) * MS;
      const seg = run.p[b + 7] - run.p[a + 7];
      const f = seg > 1e-6 ? Math.min(1, Math.max(0, (sAt - run.p[a + 7]) / seg)) : 0;
      const lerp = (o: number): number => run.p[a + o] + (run.p[b + o] - run.p[a + o]) * f;
      let nx = lerp(3);
      let nz = lerp(4);
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      let tx = run.p[b] - run.p[a];
      let tz = run.p[b + 2] - run.p[a + 2];
      const ty = run.p[b + 1] - run.p[a + 1];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; tz /= tl;
      const roadY = lerp(1);
      out.push({ roadId: run.roadId, s: sAt, x: lerp(0), y: roadY + medianSoilTop(r), z: lerp(2), roadY, nx, nz, tx, ty: ty / tl, tz, kind });
    }
  }
  return out;
}

/** Tree planner helper: is any median lamp pole (of any road, so crossing and parallel roads count too, and road 5 whose two medians overlap) within `clear` m of (x, z)? */
export function medianLampNearFn(roads: RoadNetwork): (x: number, z: number, clear: number) => boolean {
  const hit = cache.get(roads);
  if (hit) return hit;
  const CELL = 24;
  const grid = new Map<string, MedianLamp[]>();
  for (const l of planMedianLamps(roads)) {
    const key = Math.floor(l.x / CELL) + ',' + Math.floor(l.z / CELL);
    const a = grid.get(key);
    if (a) a.push(l);
    else grid.set(key, [l]);
  }
  const fn = (x: number, z: number, clear: number): boolean => {
    const c2 = clear * clear;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = grid.get(cx + i + ',' + (cz + j));
      if (a) for (const o of a) { const dx = o.x - x; const dz = o.z - z; if (dx * dx + dz * dz < c2) return true; }
    }
    return false;
  };
  cache.set(roads, fn);
  return fn;
}
