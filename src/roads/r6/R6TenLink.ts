/**
 * STEP R6-10-JOIN: the north road R6-10 stopped 80 m short of the arc road R6-7 (its first point (-2220, -3457) had level 37.8 m, R6-7 beside it has 20 m, so it
 * ended in the air on a 15 m fill). Fix, data only (no terrain / no mesh code):
 *  1. LINK: a smooth curve (cubic hermite, tangent at both ends) from a point on R6-7 to the old start of R6-10. It leaves R6-7 along R6-7's own heading
 *     (a merge, not a crossing). The join is R6-7 point JOIN_IDX = 30 (s 300.7 m): 25 m BEFORE the river bridge of R6-7 (s 326 .. 366), never on the bridge.
 *     Smallest radius of the link is about 136 m (R6-7 itself is a V60 curve of 142 m, R6-10 has 113 m), so the joined road keeps speed 60 like R6-7.
 *  2. LEVELS: the join level is the R6-7 level (21.6 m). From there the road climbs at the class grade (4 %) until it meets the old R6-10 profile, then follows the
 *     old profile again (a smooth cubic meeting, grade stays <= 4 %). The old profile is only changed where it was too high to come down to R6-7.
 * The result is ONE road named R6-10 that now starts on R6-7. All stations s along R6-10 grow by LINK_LEN (the link length), see `r6TenLinkLen`.
 */
import type { R6LineData } from './R6LineData';

export const R6_TEN_JOIN_IDX = 30;
const KS = 1.1; // tangent length = KS * distance between the two ends (searched for the largest minimum radius, scripts/r6-ten-join-check.ts)
const GRADE = 0.0395; // class grade of R6 (4 %) minus the 0.01 m rounding of the heights (0.1 % over 10 m)

/** The R6-10 data with the link in front of it and the new levels; the other data are returned untouched when the lines are not what the fix expects. */
export function r6TenWithLink(r7: R6LineData, r10: R6LineData): R6LineData {
  const J = R6_TEN_JOIN_IDX;
  if (r7.pts.length < J + 2 || r10.pts.length < 3) return r10;
  const P1 = r7.pts[J];
  const Y1 = r7.ys[J];
  let t1 = [r7.pts[J + 1][0] - r7.pts[J - 1][0], r7.pts[J + 1][1] - r7.pts[J - 1][1]];
  let l = Math.hypot(t1[0], t1[1]) || 1;
  t1 = [t1[0] / l, t1[1] / l];
  const P0 = r10.pts[0];
  let t0 = [-(r10.pts[1][0] - P0[0]), -(r10.pts[1][1] - P0[1])];
  l = Math.hypot(t0[0], t0[1]) || 1;
  t0 = [t0[0] / l, t0[1] / l];
  const D = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
  if (D < 20 || D > 400) return r10; // already joined, or too far for this fix
  const k = D * KS;
  const N = Math.max(4, Math.ceil(D / 10));
  const fwd: number[][] = []; // from the old R6-10 start P0 to the join P1
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
    const h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2;
    const h11 = u ** 3 - u ** 2;
    fwd.push([h00 * P0[0] + h10 * k * t0[0] + h01 * P1[0] + h11 * k * t1[0], h00 * P0[1] + h10 * k * t0[1] + h01 * P1[1] + h11 * k * t1[1]]);
  }
  const link = fwd.reverse(); // join first, old R6-10 start last
  link[0] = [P1[0], P1[1]]; // exact node touch on R6-7
  link[link.length - 1] = [P0[0], P0[1]];
  const pts: number[][] = [...link, ...r10.pts.slice(1).map((p) => [p[0], p[1]])];
  const nLink = link.length; // pts[nLink - 1] = old start
  const c: number[] = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // levels: the old ones from the old start on, +infinity on the link
  const old: number[] = pts.map((_, i) => (i < nLink - 1 ? Infinity : r10.ys[i - (nLink - 1)]));
  const line = c.map((d) => Y1 + GRADE * d);
  // meeting of the 4 % line with the old profile: a cubic (matched level and slope at both ends), the smallest span T whose sampled grade stays <= GRADE
  let sx = c[c.length - 1];
  for (let i = nLink - 1; i < pts.length; i++) {
    if (line[i] >= old[i]) {
      sx = c[i];
      break;
    }
  }
  const oldAt = (d: number): number => {
    for (let i = nLink - 1; i < pts.length - 1; i++) if (d <= c[i + 1]) return old[i] + ((old[i + 1] - old[i]) * (d - c[i])) / (c[i + 1] - c[i] || 1);
    return old[pts.length - 1];
  };
  const ys = line.map((v, i) => Math.min(v, old[i]));
  for (let T = 40; T <= 300; T += 10) {
    const c1 = sx - T;
    const c2 = Math.min(sx + T, c[c.length - 1] - 20);
    if (c1 < c[nLink - 1] || c2 <= c1 + 20) continue;
    const y1 = Y1 + GRADE * c1;
    const y2 = oldAt(c2);
    const d2 = (oldAt(c2 + 5) - oldAt(c2 - 5)) / 10;
    const H = c2 - c1;
    const trial = ys.slice();
    let maxG = 0;
    for (let i = 0; i < pts.length; i++) {
      if (c[i] <= c1) trial[i] = line[i];
      else if (c[i] >= c2) trial[i] = old[i];
      else {
        const u = (c[i] - c1) / H;
        trial[i] = (2 * u ** 3 - 3 * u ** 2 + 1) * y1 + (u ** 3 - 2 * u ** 2 + u) * H * GRADE + (-2 * u ** 3 + 3 * u ** 2) * y2 + (u ** 3 - u ** 2) * H * d2;
      }
      if (i > 0) maxG = Math.max(maxG, Math.abs(trial[i] - trial[i - 1]) / (c[i] - c[i - 1]));
    }
    // the old part must keep its own grade (it is only copied), the new part must stay inside the class grade
    let oldMax = 0;
    for (let i = nLink; i < pts.length; i++) if (c[i] >= c2) oldMax = Math.max(oldMax, Math.abs(old[i] - old[i - 1]) / (c[i] - c[i - 1]));
    if (maxG <= Math.max(GRADE + 0.0005, oldMax)) {
      for (let i = 0; i < pts.length; i++) ys[i] = trial[i];
      break;
    }
  }
  ys[0] = Y1;
  const s = c.map((v) => Math.round(v * 10) / 10);
  return { name: r10.name, src: r10.src, s, pts, ys: ys.map((v) => Math.round(v * 100) / 100), structs: r10.structs };
}

/** Length (m) added in front of R6-10 by the link (= the shift of every station s along R6-10); 0 when the fix does not apply. */
export function r6TenLinkLen(r7: R6LineData, r10: R6LineData): number {
  const j = r6TenWithLink(r7, r10);
  if (j === r10) return 0;
  const old = r10.s[r10.s.length - 1];
  return j.s[j.s.length - 1] - old;
}
