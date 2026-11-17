// STEP 1.4  Check functions (pure). Each design number has a function that says pass/fail with the reason (rule 5).
// V in km/h, R in m, e in m/m. Worked examples: HANDOFF_ROAD_DESIGN.md section 13, printed by scripts/standards-check.ts.
import { CRITERIA, DESIGN, frictionAt, minRadius, stoppingSight, speedChangeLength } from './Criteria';

export interface Check { name: string; pass: boolean; value: number; limit: number; reason: string }
const f1 = (v: number) => Math.round(v * 10) / 10;

export { minRadius, frictionAt };

/** R >= radiusMargin x Rmin(V) (rule 3.12-4). */
export function checkRadius(R: number, V: number): Check {
  const rmin = minRadius(V);
  const limit = DESIGN.radiusMargin * rmin;
  return { name: 'radius margin', pass: R >= limit, value: R, limit, reason: `R ${f1(R)} m vs ${DESIGN.radiusMargin} x Rmin(${V}) = ${f1(limit)} m (Rmin ${f1(rmin)} m)` };
}

/** Spiral length: max( 0.0214 V^3 / (R C), 2-second rule V/1.8, superelevation runoff ), rounded UP to 10 m. */
export function spiralLength(V: number, R: number, C: number = DESIGN.comfortC, runoff = 0): number {
  const comfort = (0.0214 * V ** 3) / (R * C);
  return Math.ceil(Math.max(comfort, V / 1.8, runoff) / 10) * 10;
}

/** Superelevation needed on radius R at speed V. e = 0 means: keep the normal crown (e + f < f). */
export function superelevation(V: number, R: number): { eNeeded: number; ePlusF: number; keepCrown: boolean; pass: boolean } {
  const ePlusF = (V * V) / (127 * R);
  const f = frictionAt(V);
  const eNeeded = Math.max(0, ePlusF - f);
  return { eNeeded, ePlusF, keepCrown: eNeeded === 0, pass: eNeeded <= CRITERIA.emax };
}

/** Stopping sight distance (m), level road unless G (m/m) is given. */
export const ssd = (V: number, G = 0): number => stoppingSight(V, G);
/** Minimum K (= L / A, A in %) for crest and sag curves from SSD (h1 1.08 m, h2 0.60 m, headlight 0.6 m and 1 degree). */
export function minVerticalK(V: number): { crest: number; sag: number; S: number } {
  const S = ssd(V);
  return { S, crest: (S * S) / 658, sag: (S * S) / (120 + 3.5 * S) };
}
export function checkGrade(g: number, limit: number): Check {
  return { name: 'grade', pass: Math.abs(g) <= limit, value: Math.abs(g), limit, reason: `grade ${f1(g * 100)} % vs limit ${f1(limit * 100)} %` };
}

/** Lane-drop taper length (m): 0.62 W V for V >= 70, W V^2 / 155 below. */
export const laneDropTaper = (V: number, W: number = DESIGN.laneWidth): number => (V >= 70 ? 0.62 * W * V : (W * V * V) / 155);
/** Parallel exit lane (m) from the highway speed to the ramp speed, without taper. */
export const decelLength = (Vhwy: number, Vramp: number): number => speedChangeLength(Vhwy, Vramp, CRITERIA.aDecel);
/** Parallel entry lane (m) from the ramp speed up to the FULL highway speed (as handoff example 5), without taper.
 *  Note: interchange/Standards.accelLength stops at 0.85 x V and gives a shorter lane. */
export const accelLength = (Vhwy: number, Vramp: number): number => speedChangeLength(Vramp, Vhwy, CRITERIA.aAccel);
export const exitTaperLength = (W: number = DESIGN.laneWidth): number => W * DESIGN.exitTaper;
export const entryTaperLength = (W: number = DESIGN.laneWidth): number => W * DESIGN.entryTaper;

/** Lanes per direction = ceil(AADT K D / c). */
export function lanesFromDemand(aadt: number, c: number, K: number = DESIGN.K, D: number = DESIGN.D): { peak: number; exact: number; lanes: number } {
  const peak = aadt * K * D;
  const exact = peak / c;
  return { peak, exact, lanes: Math.ceil(Math.round(exact * 1e6) / 1e6) };
}

// ---------------------------------------------------------------- smoothness (section 3.12) on a sampled line
export interface LowSegment { s0: number; s1: number; minR: number }
export interface SmoothnessReport {
  length: number; samples: number; ds: number;
  maxHeadingStepDeg: number; kinkCount: number; minR: number; minRStation: number;
  low: Record<number, LowSegment[]>; limits: number[];
}

/** Uniform resampling of a polyline (flat [x0,z0,x1,z1,...]) every ds metres. closed = join the last point to the first. */
export function resample(pts: ArrayLike<number>, ds: number, closed: boolean): number[] {
  const p = Array.from(pts);
  if (closed && (p[0] !== p[p.length - 2] || p[1] !== p[p.length - 1])) p.push(p[0], p[1]);
  const out = [p[0], p[1]];
  let carry = ds;
  let ax = p[0];
  let az = p[1];
  for (let i = 2; i < p.length; i += 2) {
    const bx = p[i];
    const bz = p[i + 1];
    let seg = Math.hypot(bx - ax, bz - az);
    while (seg > 0 && seg >= carry - 1e-9) {
      const t = carry / seg;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      out.push(ax, az);
      seg = Math.hypot(bx - ax, bz - az);
      carry = ds;
    }
    carry -= seg;
    ax = bx;
    az = bz;
  }
  const n = out.length;
  if (closed && Math.hypot(out[n - 2] - out[0], out[n - 1] - out[1]) < ds * 0.5) out.length = n - 2;
  return out;
}

const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
function circumR(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ab = Math.hypot(bx - ax, bz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const ca = Math.hypot(ax - cx, az - cz);
  const area2 = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az));
  return area2 < 1e-9 ? Infinity : (ab * bc * ca) / (2 * area2);
}

/** Smoothness report of a CLOSED sampled line. Radius uses arms of armM metres each side (default 200 m, like a driver's view).
 *  Kink = change of heading step between two neighbouring samples above kinkMaxDeg (a real corner, not a designed curve). */
export function smoothness(samples: ArrayLike<number>, ds: number, V: number, armM = 200): SmoothnessReport {
  const n = samples.length / 2;
  const arm = Math.max(1, Math.round(armM / ds));
  const P = (i: number) => ((i % n) + n) % n;
  const x = (i: number) => samples[2 * P(i)];
  const z = (i: number) => samples[2 * P(i) + 1];
  const head = (i: number) => Math.atan2(z(i + 1) - z(i), x(i + 1) - x(i));
  let maxStep = 0;
  let kinks = 0;
  for (let i = 0; i < n; i++) {
    const d0 = wrap(head(i) - head(i - 1));
    const d1 = wrap(head(i - 1) - head(i - 2));
    maxStep = Math.max(maxStep, Math.abs(d0));
    if (Math.abs(d0 - d1) > (DESIGN.kinkMaxDeg * Math.PI) / 180) kinks++;
  }
  const R: number[] = [];
  for (let i = 0; i < n; i++) R.push(circumR(x(i - arm), z(i - arm), x(i), z(i), x(i + arm), z(i + arm)));
  let minR = Infinity;
  let minI = 0;
  R.forEach((r, i) => { if (r < minR) { minR = r; minI = i; } });
  const rmin = minRadius(V);
  const limits = [rmin, DESIGN.radiusMargin * rmin];
  const low: Record<number, LowSegment[]> = {};
  for (const lim of limits) {
    const segs: LowSegment[] = [];
    for (let i = 0; i < n; i++) {
      if (R[i] >= lim) continue;
      const last = segs[segs.length - 1];
      if (last && i * ds - last.s1 <= 3 * ds) { last.s1 = i * ds; last.minR = Math.min(last.minR, R[i]); } else segs.push({ s0: i * ds, s1: i * ds, minR: R[i] });
    }
    low[lim] = segs;
  }
  return { length: n * ds, samples: n, ds, maxHeadingStepDeg: (maxStep * 180) / Math.PI, kinkCount: kinks, minR, minRStation: minI * ds, low, limits };
}

/** Lane balance at a diverge: lanes needed just before the exit = continuing + exit - 1 (per direction). */
export const laneBalance = (continuing: number, exitLanes: number): number => continuing + exitLanes - 1;
