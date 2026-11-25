// J9-a: ONE switch for the 300 ft junction (Config flag or URL ?j300=1, same rule as J300Layer) and the old-road trim data. No three.js, safe for headless scripts (no location there = Config flag only).
// When ON, the old R6-9 and the old R4-9 stub between the J4-R4 join and the ring are NOT built as game roads: the junction arms (J300 mesh) replace them. When OFF nothing changes.
import { Config } from '../../core/Config';
import { J300_ARMS } from './J300Geometry';

export function j300Active(): boolean {
  if (Config.roads.junctionJ300.enabled) return true;
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('j300') === '1'; } catch { return false; }
}

/** Old roads fully replaced by an arm: R6-9 (the R6 arm ends exactly on its free start, J4). */
export const J300_DROP_ROADS: readonly string[] = ['R6-9'];
/** Old roads trimmed at the J4-R4 join (everything from the join to the ring end is dropped). World point = end of the R4 arm. */
export const J300_TRIM_ROADS: readonly { name: string; x: number; z: number }[] = [{ name: 'R4-9', x: J300_ARMS.R4.end.x, z: J300_ARMS.R4.end.z }];

export interface TrimmedLine { pts: number[][]; ys: number[]; keptLength: number; cutIndex: number }

/**
 * Cut a polyline (first point = far end, last point = ring end) at the point nearest to (x, z); the cut point is interpolated (position and level), later points are dropped.
 * Returns null when the join is not within 6 m of the line (then nothing is trimmed and the caller keeps the road whole).
 */
export function trimLineAtPoint(pts: number[][], ys: number[], x: number, z: number): TrimmedLine | null {
  let best = { d: 1e9, i: -1, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d) best = { d, i, t };
  }
  if (best.i < 0 || best.d > 6) return null;
  const { i, t } = best;
  const outP = pts.slice(0, i + 1).map((p) => [p[0], p[1]]);
  const outY = ys.slice(0, i + 1);
  if (t > 1e-6) { outP.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]); outY.push(ys[i] + (ys[i + 1] - ys[i]) * t); }
  let len = 0; for (let k = 1; k < outP.length; k++) len += Math.hypot(outP[k][0] - outP[k - 1][0], outP[k][1] - outP[k - 1][1]);
  return { pts: outP, ys: outY, keptLength: len, cutIndex: i };
}

/**
 * J10 step 0: the trimmed R4-9 meets the R4 arm with a heading kink (4.05 deg measured, target <= 0.5). The arm is generated data (J4-R4), so the END of the real road is bent instead:
 * the last `len` m (70) of the polyline are rotated about the join point by an angle that is 100 % over the last `hold` m and fades to 0 (smoothstep) at `len`. Positions only, levels (ys) are not touched,
 * the end point itself does not move (gap stays 0). Switch ON only (the caller checks j300Active()). Returns the angle used (deg).
 */
export function chordHeadingAtEnd(pts: number[][], ch: number): number {
  const n = pts.length; const E = pts[n - 1]; let acc = 0; let a = pts[0];
  for (let i = n - 1; i > 0; i--) { const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + seg >= ch) { const t = (ch - acc) / (seg || 1); a = [pts[i][0] + (pts[i - 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i - 1][1] - pts[i][1]) * t]; return (Math.atan2(E[1] - a[1], E[0] - a[0]) * 180) / Math.PI; } acc += seg; a = pts[i - 1]; }
  return (Math.atan2(E[1] - a[1], E[0] - a[0]) * 180) / Math.PI;
}
export function bendTailToHeading(pts: number[][], targetHeadingDeg: number, ch = 16, hold = 16, len = 70): number {
  const n = pts.length; if (n < 3) return 0;
  let dl = targetHeadingDeg - chordHeadingAtEnd(pts, ch); while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
  const E = [pts[n - 1][0], pts[n - 1][1]]; let t = 0;
  for (let i = n - 2; i >= 0; i--) {
    t += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    // t is measured on the ORIGINAL positions (the rotation keeps the lengths of the pieces close enough; the fade is smooth anyway)
    if (t >= len) break;
    const x = t <= hold ? 1 : (len - t) / (len - hold); const w = x * x * (3 - 2 * x); const a = (dl * w * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = pts[i][0] - E[0], dz = pts[i][1] - E[1]; pts[i] = [E[0] + dx * c - dz * s, E[1] + dx * s + dz * c];
  }
  return dl;
}
/** World heading (deg, atan2(dz, dx)) a road must have at the join to run straight into the R4 arm (the arm runs from the ring to the join: reversed). Chord over the last 10 m of the arm rows. */
export function j300R4JoinHeading(): number {
  const r = (J300_ARMS.R4 as unknown as { rows: { x: number; z: number }[] }).rows; const n = r.length; let j = n - 2;
  while (j > 0 && Math.hypot(r[n - 1].x - r[j].x, r[n - 1].z - r[j].z) < 10) j--;
  return (Math.atan2(r[n - 1].z - r[j].z, r[n - 1].x - r[j].x) * 180) / Math.PI + 180;
}
