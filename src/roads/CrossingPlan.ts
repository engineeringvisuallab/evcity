// ROADS STEP 6b: zebra crossings in the middle of a block on undivided city roads. Pure maths (no three.js): the plan is appended to MedianPlan.crossings, so the same painted band
// (MedianView), the tree / hedge keep-out (Roadside) and the footpath break (FootpathPlan) serve the mall crossings and these street crossings.
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import type { Crossing } from './MedianPlan';
import { dividedSectionOf } from './RoadSection';
import { padIndex } from './PadIndex';

function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 7, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Point and unit direction of road r at arc length s (linear between the stored points). */
function at(r: { xs: Float64Array | number[]; zs: Float64Array | number[]; cum: Float64Array | number[] }, s: number): { x: number; z: number; tx: number; tz: number; i: number } {
  const n = r.xs.length;
  let i = 0;
  while (i < n - 2 && r.cum[i + 1] < s) i++;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (s - r.cum[i]) / seg)) : 0;
  const tx = r.xs[i + 1] - r.xs[i];
  const tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  return { x: r.xs[i] + tx * f, z: r.zs[i] + tz * f, tx: tx / tl, tz: tz / tl, i };
}

export function planStreetCrossings(roads: RoadNetwork): Crossing[] {
  const C = Config.city.streetCrossing;
  const out: Crossing[] = [];
  if (!C.enabled) return out;
  const nearPad = padIndex(roads);
  const step = Config.city.median.step;
  for (const r of roads.roads) {
    if (r.earth || r.closed || r.kind === 'roundabout' || r.xs.length < 2 || dividedSectionOf(r)) continue;
    if (r.length < C.endClear * 2 + 20) continue;
    let s = C.endClear + hash(r.id, 0) * (C.spacing[1] - C.spacing[0]);
    let n = 1;
    while (s < r.length - C.endClear) {
      const p = at(r, s);
      const j = Math.min(r.xs.length - 1, p.i + 1);
      let good = r.bridgeOf[p.i] < 0 && r.bridgeOf[j] < 0 && (r.tier === 4 || roads.isCityPoint(p.x, p.z));
      if (good) {
        // not near a junction (the pad core + padClear), on a straight piece, and the whole zebra on the same road piece
        const b0 = at(r, s - 6);
        const b1 = at(r, s + 6);
        good = !nearPad(p.x, p.z, C.padClear) && !nearPad(b0.x, b0.z, C.padClear * 0.5) && !nearPad(b1.x, b1.z, C.padClear * 0.5) && b0.tx * b1.tx + b0.tz * b1.tz >= C.minBendCos;
      }
      if (good && !out.some((c) => c.roadId === r.id && Math.abs(c.s - s) < C.spacing[0] * 0.5)) {
        out.push({ roadId: r.id, s, a: Math.floor((s - C.gap / 2) / step) * step, b: Math.ceil((s + C.gap / 2) / step) * step, x: p.x, z: p.z, street: true });
        s += C.spacing[0] + hash(r.id, n++) * (C.spacing[1] - C.spacing[0]);
      } else s += 15; // try again a little further along
    }
  }
  return out;
}
