// ROADS STEP 6b: the U-turn sign plan (pure maths, no three.js; the mesh is roads/UTurnSigns.ts).
// The U-turn sign. One blue board on a thin pole in the middle of the median, `Config.city.uturn.sign.before` m ahead of every opening for each direction of travel,
// facing the oncoming driver.
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import { planMedians } from './MedianPlan';
import { planMedianLamps } from './Planting';
import { medianSoilTop } from './RoadSection';

export interface UTurnSign {
  roadId: number;
  openingId: number;
  /** Arc length (m) and the foot of the pole (on the median soil). */
  s: number;
  x: number;
  y: number;
  z: number;
  /** Unit vector the board faces (back at the oncoming driver). */
  fx: number;
  fz: number;
}

const cache = new WeakMap<RoadNetwork, UTurnSign[]>();

export function planUTurnSigns(roads: RoadNetwork): UTurnSign[] {
  const hit = cache.get(roads);
  if (hit) return hit;
  const S = Config.city.uturn.sign;
  const out: UTurnSign[] = [];
  if (!S.enabled) { cache.set(roads, out); return out; }
  const plan = planMedians(roads);
  const lamps = planMedianLamps(roads);
  for (const o of plan.uturns.openings) {
    const r = roads.roads[o.roadId];
    for (const dir of [1, -1] as const) {
      // dir +1: drivers go towards larger s and meet the opening at its `a` end; dir -1: the other way
      for (let k = 0; k < 3; k++) {
        const s = dir > 0 ? o.a - S.before - k * 6 : o.b + S.before + k * 6;
        if (s < 5 || s > r.length - 5) break;
        // the median must stand here (inside one run) and no lamp pole within S.lampClear m
        let inRun = false;
        for (const u of plan.runs) if (u.roadId === o.roadId && s > u.p[7] + 4 && s < u.p[(u.n - 1) * 8 + 7] - 4) { inRun = true; break; }
        if (!inRun) continue;
        if (lamps.some((l) => l.roadId === o.roadId && Math.abs(l.s - s) < S.lampClear)) continue;
        let i = 0;
        while (i < r.xs.length - 2 && r.cum[i + 1] < s) i++;
        const seg = r.cum[i + 1] - r.cum[i];
        const f = seg > 1e-6 ? Math.min(1, Math.max(0, (s - r.cum[i]) / seg)) : 0;
        const tx = r.xs[i + 1] - r.xs[i];
        const tz = r.zs[i + 1] - r.zs[i];
        const tl = Math.hypot(tx, tz) || 1;
        out.push({
          roadId: o.roadId,
          openingId: o.id,
          s,
          x: r.xs[i] + tx * f,
          y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f + medianSoilTop(r),
          z: r.zs[i] + tz * f,
          fx: (-dir * tx) / tl,
          fz: (-dir * tz) / tl,
        });
        break;
      }
    }
  }
  cache.set(roads, out);
  return out;
}
