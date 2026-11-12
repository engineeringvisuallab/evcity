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
  /** Smallest turning radius (m) the new curve may have (default 120). If the drawn line is tighter, the lead grows (up to 260 m) until the curve is wide enough. */
  minR?: number;
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
  {
    id: 'RC02',
    mode: 'replace-corner',
    roads: ['F4', 'F1'],
    node: 'N',
    // the drawn line is a 105 deg turn in ~160 m (R about 60 m, too tight for a highway): widened to R >= 100. minR: 60 would give it almost as drawn.
    minR: 100,
    // green line of the screenshot (camera X 390 Y 186 Z -3663, camera turned -50 deg, 3.8 px/m), traced from the F4 side to the F1 side
    pts: [[408, -3533], [412, -3548], [414, -3563], [418, -3578], [423, -3592], [432, -3605], [443, -3616], [454, -3627], [466, -3637], [478, -3647], [491, -3655], [500, -3665]],
    note: '2026-11-11: F4 and F1 met at the N node in a hairpin V with a dead-end grey stub; the stub is removed and F4 now bends smoothly into F1.',
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
function replaceCornerOnce(a0: number[][], b0: number[][], node: number[], draw: [number, number][], step: number, lead: number): CornerResult {
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

/** replace-corner with a radius guard: starts with `lead` and widens the curve (lead + 10 m each time, max 260 m) until its tightest turn is >= minR. */
export function replaceCorner(a0: number[][], b0: number[][], node: number[], draw: [number, number][], step: number, lead = 50, minR = 120): CornerResult & { lead: number; radius: number } {
  let best: (CornerResult & { lead: number; radius: number }) | null = null;
  for (let L = lead; L <= 260; L += 10) {
    let r: CornerResult;
    try {
      r = replaceCornerOnce(a0, b0, node, draw, step, L);
    } catch {
      break;
    }
    const radius = minRadius(r.curve, 2);
    best = { ...r, lead: L, radius };
    if (radius >= minR) break;
  }
  if (!best) throw new Error('replace-corner failed');
  return best;
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

// =====================================================================================
// FIXES ON FINISHED ROADS (RC03): secondary / collector roads, applied by RoadNetwork.applyRoadFixes() after the roads and the
// scenarios exist and BEFORE the junction pads, the bridges / median / traffic graph and the railway (the rail plans itself against the finished roads).
// =====================================================================================
export type RoadFixMode = 'straighten-through';

export interface RoadFix {
  id: string;
  mode: RoadFixMode;
  /** straighten-through: [road that runs INTO the junction node, road that runs OUT of it]. Both must meet at exactly one point (the node). The node never moves. */
  roads?: [string, string];
  /** straighten-through: how many metres of the first / second road before / after the node are redrawn. */
  lenA?: number;
  lenB?: number;
  note: string;
}

export const ROAD_FIXES: readonly RoadFix[] = [
  {
    id: 'RC03',
    mode: 'straighten-through',
    // S12 (from the north-west) meets S5 at J57 (pad 56, node -1430,-495). S5 used to leave J57 towards the south-east and loop round to the east / north, so the through road had a dip at the junction.
    roads: ['S12', 'S5'],
    lenA: 240,
    lenB: 400, // long enough that the bend towards the north that S5 has further on is taken with R >= 73 m (the old S5 head had R 49 m)
    note: '2026-11-12: the S12 / S5 road through J57 is made one smooth, nearly straight road; J57 stays exactly where it is (J6-west still ends there).',
  },
];

export interface ThroughResult {
  /** New polyline of the road that runs into the node (same direction as the input), still ends exactly at the node. */
  a: number[][];
  /** New polyline of the road that runs out of the node, still starts exactly at the node. */
  b: number[][];
  /** Index in the old `a` where the redrawn part starts / index in the old `b` where it stops (old vertices a[iA..] and b[..iB] are replaced). */
  iA: number;
  iB: number;
  /** The new curves alone (pA -> node, node -> pB), for tests. */
  curveA: number[][];
  curveB: number[][];
  /** Heading (deg, atan2(dz, dx)) the road has at the node. */
  headingDeg: number;
}

function herm2(p0: number[], p1: number[], t0: number[], t1: number[]): number[][] {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const out: number[][] = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out.push([h00 * p0[0] + h10 * t0[0] * L + h01 * p1[0] + h11 * t1[0] * L, h00 * p0[1] + h10 * t0[1] * L + h01 * p1[1] + h11 * t1[1] * L]);
  }
  out[0] = p0;
  out[out.length - 1] = p1;
  return out;
}

/**
 * straighten-through: road `a` runs into the node and road `b` leaves it (they meet at a[last] = b[0]). `lenA` m of a before the node and `lenB` m of b after it are
 * redrawn as two cubic Hermite curves that join the old roads with the SAME heading at pA / pB and pass the node with ONE common heading
 * (the direction pA -> pB), so the through road has no dip or kink at the junction. The node does not move.
 */
export function straightenThrough(a0: number[][], b0: number[][], lenA: number, lenB: number, step: number): ThroughResult {
  const node = a0[a0.length - 1];
  if (Math.hypot(b0[0][0] - node[0], b0[0][1] - node[1]) > 2) throw new Error(`straighten-through: the roads do not meet at one node (a ends ${node[0].toFixed(0)},${node[1].toFixed(0)}, b starts ${b0[0][0].toFixed(0)},${b0[0][1].toFixed(0)})`);
  let acc = 0;
  let iA = a0.length - 1;
  while (iA > 2 && acc < lenA) {
    acc += Math.hypot(a0[iA][0] - a0[iA - 1][0], a0[iA][1] - a0[iA - 1][1]);
    iA--;
  }
  acc = 0;
  let iB = 0;
  while (iB < b0.length - 3 && acc < lenB) {
    acc += Math.hypot(b0[iB + 1][0] - b0[iB][0], b0[iB + 1][1] - b0[iB][1]);
    iB++;
  }
  const pA = a0[iA];
  const pB = b0[iB];
  const tA = unit(pA[0] - a0[Math.max(0, iA - 2)][0], pA[1] - a0[Math.max(0, iA - 2)][1]);
  const tB = unit(b0[Math.min(b0.length - 1, iB + 2)][0] - pB[0], b0[Math.min(b0.length - 1, iB + 2)][1] - pB[1]);
  const tN = unit(pB[0] - pA[0], pB[1] - pA[1]);
  const curveA = resample(herm2(pA, node, tA, tN), step);
  const curveB = resample(herm2(node, pB, tN, tB), step);
  curveA[curveA.length - 1] = node;
  curveB[0] = node;
  return {
    a: [...a0.slice(0, iA), ...curveA],
    b: [...curveB, ...b0.slice(iB + 1)],
    iA,
    iB,
    curveA,
    curveB,
    headingDeg: (Math.atan2(tN[1], tN[0]) * 180) / Math.PI,
  };
}

/**
 * RC04: extra earth cover (m) between the roof of a railway cut & cover box and the road that crosses over it, per road name (added to the normal rule
 * "track 7.4 m below the road", RailNetwork.apply). The roof slab is 7 m above the track, so with the normal rule it ends only 0.46 m under the road surface and, where the road
 * stands on a low embankment or dips next to the box, it shows through / above the road. With 1.0 m extra the road stands about 1.5 m above the roof.
 * Only the roads listed here change; every other crossing of the railway is exactly as before (a global change made one more rail clearance issue elsewhere).
 */
export const RAIL_BOX_COVER: Readonly<Record<string, number>> = {
  S12: 1.0,
};
