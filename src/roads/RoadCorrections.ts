// ROAD CORRECTIONS: hand corrections of the road plan, ONE place (see ROAD_CORRECTION_SYSTEM.md).
// Pure data + pure geometry (no three.js, no DOM), so scripts/road-correction-test.ts can run it headless.
// All coordinates are world metres (x east, z south, map centre 0,0).

export type CorrectionMode = 'replace-corner';

export interface RoadCorrection {
  /** 'RC01' ... (same id as in the log of ROAD_CORRECTION_SYSTEM.md) */
  id: string;
  mode: CorrectionMode;
  /** replace-corner: the two main roads that meet at the corner, in the order [road that runs INTO the node, road that runs OUT of it]. */
  roads: [string, string];
  /** replace-corner: id of the main node (RoadPlan.MAIN_NODES) that sits on the corner. It moves to the middle of the new curve. */
  node: string;
  /** The wanted new centreline traced from the screenshot, from the `roads[0]` side to the `roads[1]` side. First / last point = where it leaves / joins the old roads (snapped to the nearest road vertex). */
  pts: [number, number][];
  /** Metres of the old roads before the first / after the last drawn point that are re-drawn too, so the curve can join the road with the same heading (default 50). */
  lead?: number;
  note: string;
}

export const ROAD_CORRECTIONS: readonly RoadCorrection[] = [
  {
    id: 'RC01',
    mode: 'replace-corner',
    roads: ['F3', 'F6'],
    node: 'W',
    // green line of the screenshot (camera X -2799 Y 260 Z -499, 2.6 px/m), traced from the F3 side to the F6 side
    pts: [[-2767, -345], [-2759, -374], [-2749, -403], [-2738, -432], [-2722, -457], [-2702, -481], [-2678, -502], [-2652, -518], [-2624, -533]],
    note: '2026-11-11: the sharp ~90 degree corner of F3/F6 at the W node is cut off by a smooth curve; the old corner stub is removed.',
  },
];

export interface CornerResult {
  /** New polyline of the road that runs into the node (same direction as the input), ends exactly at `node`. */
  a: number[][];
  /** New polyline of the road that runs out of the node, starts exactly at `node`. */
  b: number[][];
  /** The new node = the middle of the curve. */
  node: number[];
  /** The new curve alone (metres), for tests. */
  curve: number[][];
}

const d2 = (p: number[], q: number[]): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

function nearest(poly: number[][], p: number[]): number {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = d2(poly[i], p);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

function unit(dx: number, dz: number): number[] {
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/** Cubic Hermite through the control points; the two end tangents are the road headings (G1 join), the inner ones Catmull-Rom. */
function hermite(ctrl: number[][], tStart: number[], tEnd: number[]): number[][] {
  const n = ctrl.length;
  const m: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      const L = Math.hypot(ctrl[1][0] - ctrl[0][0], ctrl[1][1] - ctrl[0][1]);
      m.push([tStart[0] * L, tStart[1] * L]);
    } else if (i === n - 1) {
      const L = Math.hypot(ctrl[n - 1][0] - ctrl[n - 2][0], ctrl[n - 1][1] - ctrl[n - 2][1]);
      m.push([tEnd[0] * L, tEnd[1] * L]);
    } else m.push([(ctrl[i + 1][0] - ctrl[i - 1][0]) / 2, (ctrl[i + 1][1] - ctrl[i - 1][1]) / 2]);
  }
  const out: number[][] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * ctrl[i][0] + h10 * m[i][0] + h01 * ctrl[i + 1][0] + h11 * m[i + 1][0],
        h00 * ctrl[i][1] + h10 * m[i][1] + h01 * ctrl[i + 1][1] + h11 * m[i + 1][1],
      ]);
    }
  }
  out.push(ctrl[n - 1]);
  return out;
}

/** Points every `step` metres along a polyline (first and last point kept). */
function resample(poly: number[][], step: number): number[][] {
  const len: number[] = [0];
  for (let i = 1; i < poly.length; i++) len.push(len[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = len[len.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const out: number[][] = [poly[0]];
  let j = 0;
  for (let k = 1; k < n; k++) {
    const s = (total * k) / n;
    while (j < len.length - 2 && len[j + 1] < s) j++;
    const t = (s - len[j]) / (len[j + 1] - len[j] || 1);
    out.push([poly[j][0] + (poly[j + 1][0] - poly[j][0]) * t, poly[j][1] + (poly[j + 1][1] - poly[j][1]) * t]);
  }
  out.push(poly[poly.length - 1]);
  return out;
}

/**
 * replace-corner: road `a` runs into the node, road `b` runs out of it (either may be stored the other way round: it is turned
 * for the work and turned back). `draw` = hand-drawn centreline from the `a` side to the `b` side. a is cut at its vertex nearest to
 * draw[0], b at its vertex nearest to draw[last]; both old end pieces (the corner stub) are dropped and a smooth curve (same heading as the
 * roads at both ends) takes their place. The node moves to the middle of the curve; `a` ends there, `b` starts there.
 */
export function replaceCorner(a0: number[][], b0: number[][], node: number[], draw: [number, number][], step: number, lead = 50): CornerResult {
  const aRev = d2(a0[0], node) < d2(a0[a0.length - 1], node);
  const bRev = d2(b0[b0.length - 1], node) < d2(b0[0], node);
  const a = aRev ? [...a0].reverse() : a0;
  const b = bRev ? [...b0].reverse() : b0;
  const back = Math.max(0, Math.round(lead / step));
  const iA = nearest(a, draw[0]) - back;
  const iB = nearest(b, draw[draw.length - 1]) + back;
  if (iA < 4 || iB > b.length - 5) throw new Error('replace-corner: the drawn line starts / ends too close to the far end of the road');
  const pa = a[iA];
  const pb = b[iB];
  const tA = unit(pa[0] - a[iA - 3][0], pa[1] - a[iA - 3][1]);
  const tB = unit(b[iB + 3][0] - pb[0], b[iB + 3][1] - pb[1]);
  // a hand-drawn line never leaves the road with exactly the road heading: its first / last stretch (the lead) is replaced by the road's own heading
  const cum: number[] = [0];
  for (let i = 1; i < draw.length; i++) cum.push(cum[i - 1] + Math.hypot(draw[i][0] - draw[i - 1][0], draw[i][1] - draw[i - 1][1]));
  const total = cum[cum.length - 1];
  // hand wobble: smooth the drawn line (moving average, ends fixed), then keep one control point about every 2 x lead metres
  const sm = draw.map((p) => [p[0], p[1]]);
  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < sm.length - 1; i++) {
      sm[i] = [0.25 * sm[i - 1][0] + 0.5 * sm[i][0] + 0.25 * sm[i + 1][0], 0.25 * sm[i - 1][1] + 0.5 * sm[i][1] + 0.25 * sm[i + 1][1]];
    }
  }
  const inner: number[][] = [];
  let lastS = -Infinity;
  for (let i = 0; i < sm.length; i++) {
    if (cum[i] <= lead * 0.8 || cum[i] >= total - lead * 0.8) continue;
    if (cum[i] - lastS < lead * 2) continue;
    inner.push(sm[i]);
    lastS = cum[i];
  }
  const dense = hermite([pa, ...inner, pb], tA, tB);
  const curve = resample(dense, step);
  const mid = Math.floor(curve.length / 2);
  const node1 = curve[mid];
  const outA = [...a.slice(0, iA), ...curve.slice(0, mid + 1)];
  const outB = [...curve.slice(mid), ...b.slice(iB + 1)];
  return { a: aRev ? outA.reverse() : outA, b: bRev ? outB.reverse() : outB, node: node1, curve };
}

/** Smallest turning radius (m) along a polyline, from three points `span` vertices apart. */
export function minRadius(poly: number[][], span = 2): number {
  let best = Infinity;
  for (let i = span; i < poly.length - span; i++) {
    const p = poly[i - span];
    const q = poly[i];
    const r = poly[i + span];
    const a = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const b = Math.hypot(r[0] - q[0], r[1] - q[1]);
    const c = Math.hypot(r[0] - p[0], r[1] - p[1]);
    const cross = Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    if (cross > 1e-6) best = Math.min(best, (a * b * c) / (2 * cross));
  }
  return best;
}
