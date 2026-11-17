// STEP J1-g2  GEOMETRY DATA of the OPEN ground interchange ("open star") at J1 = C10 (-87, -277), yaw 37.5 (HANDOFF_ROAD_DESIGN.md 15.8.9). PURE MATH: no three.js, no terrain.
// Replaces the idea of the old box (GroundJ1Geometry.buildJ1Geometry stays untouched until J1-g4 switches the game over). Numbers: J1-g1 sheet (docs/j1g1.json), DESIGN / CRITERIA, J1-b inputs.
//
// ARM FRAME (s, o): s = distance OUTWARD from the J1 centre along the arm axis, o = lateral offset, + = RIGHT of the outward direction = the INBOUND side (left-hand traffic).
// Local frame (x = e, y = n): N arm = (o, s); arm k = N turned k x 90 deg clockwise (rotCW), k = 0 N, 1 E, 2 S, 3 W.
// ONE ARM (N shown), lateral edges as functions of s (t(s) = first through lane edge, 5.15 m in the star, 4.5 m = M8 mid-block after the shift):
//   -(t+4W+wr)..-(t+4W)  receiving lane of the slip road of arm k-1 (acceleration lane, then merge taper)       wr(s)
//   -(t+4W)..-t          4 outbound through lanes O1 (inner) .. O4
//   -t .. t-w1-w2        median island (3.0 m in the star)
//   t-w1-w2 .. t-w1      right pocket R2 (inner),  t-w1 .. t   pocket R1
//   t .. t+4W            4 inbound through lanes T1 .. T4
//   t+4W .. t+4W+ws      left slip lane = exit lane (early exit from the T4 side: taper, full width, then the R 70 m arc)  ws(s)
// The paved star has NO island: between the arms it is bounded only by the four slip arcs (corner islands lie OUTSIDE the arcs).
// Left slip: arm k  ->  arm k+1 (N -> E).  Right turn: arm k -> arm k-1 (N -> W), R2 -> O1, R1 -> O2 (concentric arcs).  U-turn: R2 -> O4 of the same arm.
import { CRITERIA, DESIGN, minRadius, speedChangeLength, stoppingSight } from '../standards/Criteria';
import { laneDropTaper } from '../standards/Checks';
import { SECTION_M8 } from '../standards/SectionTable';
import { DIRS, J1_APPROACH_INPUTS, rotCW, type Dir, type V2 } from './GroundJ1Geometry';

export { DIRS, J1_SITE, toWorld } from './GroundJ1Geometry';
export type { Dir, V2 } from './GroundJ1Geometry';

const W = DESIGN.laneWidth; // 3.65
export const OPEN_PARAMS = {
  W, nThrough: 4, nPocket: 2,
  island: 3.0, // m, median at the stop line
  crosswalk: 4.0, // m, space kept for the (grade-separated or refuge) pedestrian crossing in front of the stop line
  vArm: 100, vApp: 60,
  vSlip: 40, // km/h (user OK of J1-g1)
  slipR: 70, // m, lane CENTRE radius of the slip arc (user: 60-80 m)
  vMerge: 70, // km/h at the end of the acceleration lane
  stagger: 30, // m, R2 shorter than R1 (as J1-b)
  uPcu: 30, // pcu/h per arm, ASSUMED, cars only
  uStart: 19.75, // m, the U-turn leaves the inner pocket at the end of the crossing space (s = box half)
  stepDeg: 1, // degrees per sample on arcs
  stepM: 2, // m per sample on straights
};

export function deriveOpen() {
  const P = OPEN_PARAMS;
  const t0 = (P.island + P.nPocket * W) / 2; // 5.15
  const tMid = SECTION_M8.elements.find((e) => e.kind === 'lanes')!.from; // 4.5
  const B = t0 + P.nThrough * W; // 19.75
  const sStop = B + P.crosswalk; // 23.75
  const taper60 = laneDropTaper(P.vApp); // 84.8
  const brake60 = speedChangeLength(P.vApp, 0, CRITERIA.aDecel);
  const shiftLen = laneDropTaper(P.vArm, t0 - tMid); // 40.3
  const decel = speedChangeLength(P.vArm, P.vSlip, CRITERIA.aDecel); // 129.6
  const exitTaper = W * DESIGN.exitTaper; // 91.3
  const accel = speedChangeLength(P.vSlip, P.vMerge, CRITERIA.aAccel); // 106.1
  const mergeTaper = taper60; // 84.8
  const slipC = B + W / 2; // 21.575: slip lane centre from the axis
  const Cx = slipC + P.slipR; // 91.575: arc tangent point on the arm = arc centre coordinate (o and s)
  const sDiv1 = Cx + decel, sDiv0 = sDiv1 + exitTaper; // exit lane: full width up to sDiv1, taper to 0 at sDiv0
  const sMg1 = Cx + accel, sMg2 = sMg1 + mergeTaper; // receiving lane: full width up to sMg1, merge taper to 0 at sMg2
  return { t0, tMid, B, sStop, taper60, brake60, shiftLen, decel, exitTaper, accel, mergeTaper, slipC, Cx, sDiv1, sDiv0, sMg1, sMg2 };
}

type PL = ReadonlyArray<readonly [number, number]>;
const evalPL = (p: PL, s: number): number => {
  if (s <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (s <= p[i][0]) { const [s0, v0] = p[i - 1], [s1, v1] = p[i]; return s1 === s0 ? v1 : v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  return p[p.length - 1][1];
};

/** Edge functions of one arm (all in the arm frame). */
export interface OpenArm {
  dir: Dir; k: number;
  L1: number; L2: number; sR1end: number; sR2end: number; sh0: number; sh1: number; sZone: number;
  t: (s: number) => number; ws: (s: number) => number; wr: (s: number) => number; w1: (s: number) => number; w2: (s: number) => number;
  /** lane centre offsets o(s) */
  tIn: (i: number, s: number) => number; tOut: (i: number, s: number) => number; r1: (s: number) => number; r2: (s: number) => number; slip: (s: number) => number; recv: (s: number) => number;
}
export function buildArm(d: Dir, inputs = J1_APPROACH_INPUTS): OpenArm {
  const D = deriveOpen(), P = OPEN_PARAMS, k = DIRS.indexOf(d);
  const L1 = Math.ceil(D.brake60 + inputs[d].storageR), L2 = L1 - P.stagger;
  const sR1end = D.sStop + L1 + D.taper60, sR2end = D.sStop + L2 + D.taper60;
  const sh0 = Math.ceil(sR1end), sh1 = sh0 + D.shiftLen; // median shift starts when the pocket tapers are finished; it runs inside the exit taper (other edge)
  const sZone = Math.max(sh1, D.sDiv0, D.sMg2);
  const tPL: PL = [[0, D.t0], [sh0, D.t0], [sh1, D.tMid]];
  const wsPL: PL = [[0, P.slipR > 0 ? W : 0], [D.sDiv1, W], [D.sDiv0, 0]];
  const wrPL: PL = [[0, W], [D.sMg1, W], [D.sMg2, 0]];
  const w1PL: PL = [[0, W], [D.sStop + L1, W], [sR1end, 0]];
  const w2PL: PL = [[0, W], [D.sStop + L2, W], [sR2end, 0]];
  const t = (s: number): number => evalPL(tPL, s), ws = (s: number): number => evalPL(wsPL, s), wr = (s: number): number => evalPL(wrPL, s);
  const w1 = (s: number): number => evalPL(w1PL, s), w2 = (s: number): number => evalPL(w2PL, s);
  return {
    dir: d, k, L1, L2, sR1end, sR2end, sh0, sh1, sZone, t, ws, wr, w1, w2,
    tIn: (i, s) => t(s) + (i - 0.5) * W, tOut: (i, s) => -(t(s) + (i - 0.5) * W),
    r1: (s) => t(s) - w1(s) / 2, r2: (s) => t(s) - w1(s) - w2(s) / 2,
    slip: (s) => t(s) + P.nThrough * W + ws(s) / 2, recv: (s) => -(t(s) + P.nThrough * W + wr(s) / 2),
  };
}

// ------------------------------------------------------------------ movements
export type MoveKind = 'left' | 'through' | 'right' | 'uturn';
export interface Movement {
  id: string; from: Dir; to: Dir; kind: MoveKind; lane: string; target: string; phase: 'free' | 'P1' | 'P2' | 'P3' | 'P4';
  lanes: number; radius: number | null; speed: number; pcu: number;
  /** lane centre line, local frame, listed in the driving direction */
  pts: V2[]; length: number; joints: number[];
}
const rad = Math.PI / 180;
const armPt = (k: number, o: number, s: number): V2 => rotCW([o, s], k);
const dist = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const speedOfRadius = (r: number): number => { let v = 5; for (let x = 5; x <= 120; x++) if (minRadius(x) <= r) v = x; return v; };

class PathB {
  /** arm-frame points of one movement; `mark()` stores the index of every joint between pieces. */
  pts: V2[] = []; joints: number[] = [];
  constructor(private k: number) {}
  private add(o: number, s: number): void { const p = armPt(this.k, o, s); const q = this.pts[this.pts.length - 1]; if (!q || dist(p, q) > 1e-9) this.pts.push(p); }
  /** straight / piece-linear piece along s following o(s), from s0 to s1 (either direction) with extra knots */
  line(o: (s: number) => number, s0: number, s1: number, knots: number[] = []): void {
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    const list = new Set<number>([s0, s1]);
    for (const q of knots) if (q > lo && q < hi) list.add(q);
    const n = Math.max(1, Math.ceil((hi - lo) / OPEN_PARAMS.stepM));
    for (let i = 0; i <= n; i++) list.add(lo + ((hi - lo) * i) / n);
    const arr = [...list].sort((a, b) => (s1 >= s0 ? a - b : b - a));
    if (this.pts.length) this.joints.push(this.pts.length - 1);
    for (const s of arr) this.add(o(s), s);
  }
  /** circular arc in the arm frame: centre (oc, sc), radius r, angle a0 -> a1 (degrees), point = (oc + r cos, sc + r sin) */
  arc(oc: number, sc: number, r: number, a0: number, a1: number): void {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / OPEN_PARAMS.stepDeg));
    if (this.pts.length) this.joints.push(this.pts.length - 1);
    for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * rad; this.add(oc + r * Math.cos(a), sc + r * Math.sin(a)); }
  }
}
const plen = (p: V2[]): number => { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]); return l; };

export function buildMovements(arms: Record<Dir, OpenArm>, flows: Record<Dir, { L: number; T: number; R: number }>): Movement[] {
  const D = deriveOpen(), P = OPEN_PARAMS, out: Movement[] = [];
  const phaseT = (d: Dir): 'P1' | 'P3' => (d === 'N' || d === 'S' ? 'P1' : 'P3');
  const phaseR = (d: Dir): 'P2' | 'P4' => (d === 'N' || d === 'S' ? 'P2' : 'P4');
  for (const d of DIRS) {
    const a = arms[d], k = a.k;
    const dTo = (n: number): Dir => DIRS[(k + n) % 4];
    // ---- left: exit taper, straight, R 70 arc into the receiving lane of arm k+1, acceleration lane, merge into O4
    {
      const b = new PathB(k), n = arms[dTo(1)];
      b.line(a.slip, a.sZone, D.Cx, [a.sh0, a.sh1, D.sDiv1, D.sDiv0]);
      b.arc(D.Cx, D.Cx, P.slipR, 180, 270); // (oc - r cos(theta), sc - r sin(theta)) = (oc + r cos(180+theta), sc + r sin(180+theta)): 180 -> 270 deg
      // the receiving lane belongs to arm k+1: continue in ITS frame by mapping through local points
      const local = b.pts.slice();
      const bb = new PathB(n.k);
      bb.line(n.recv, D.Cx, n.sZone, [D.sMg1, D.sMg2, n.sh0, n.sh1]);
      const tail = bb.pts.slice(1);
      const pts = [...local, ...tail];
      const joints = [...b.joints, local.length - 1];
      out.push({ id: `${d}-left`, from: d, to: dTo(1), kind: 'left', lane: `${d}-in-T4+slip`, target: `${dTo(1)}-out-O4`, phase: 'free', lanes: 1, radius: P.slipR, speed: Math.min(P.vSlip, speedOfRadius(P.slipR)), pcu: flows[d].L, pts, length: plen(pts), joints });
    }
    // ---- through, 4 lanes: in the arm, across the star, out of the opposite arm (lines up exactly for s < sh0)
    for (let i = 1; i <= P.nThrough; i++) {
      const o = arms[dTo(2)];
      const b = new PathB(k);
      b.line((s) => a.tIn(i, s), Math.max(a.sh1, 0), 0, [a.sh0]);
      const bb = new PathB(o.k);
      bb.line((s) => o.tOut(i, s), 0, o.sh1, [o.sh0]);
      const pts = [...b.pts, ...bb.pts.slice(1)];
      out.push({ id: `${d}-through-T${i}`, from: d, to: dTo(2), kind: 'through', lane: `${d}-in-T${i}`, target: `${dTo(2)}-out-O${i}`, phase: phaseT(d), lanes: 1, radius: null, speed: P.vApp, pcu: flows[d].T / P.nThrough, pts, length: plen(pts), joints: [b.pts.length - 1] });
    }
    // ---- right: pocket R_j -> concentric arc -> outbound lane O_(3-j) of arm k-1 (R2 -> O1, R1 -> O2)
    for (const j of [2, 1] as const) {
      const tgt = arms[dTo(3)];
      const oP = j === 1 ? D.t0 - W / 2 : D.t0 - W - W / 2; // pocket centre in the star
      const sT = -(D.t0 + (3 - j - 0.5) * W); // target lane centre, arm-k frame s (negative = beyond the axis)
      const r = oP + D.sStop; // arc ends on the stop line of the target arm (o = -sStop)
      const sc = sT + r;
      const b = new PathB(k);
      const rp = j === 1 ? a.r1 : a.r2;
      b.line(rp, D.sStop + (j === 1 ? a.L1 : a.L2), sc, [D.sStop]);
      b.arc(oP - r, sc, r, 0, -90); // from (oP, sc) heading -s to (oP - r, sc - r) heading -o
      const nb: V2[] = [];
      const bb = new PathB(tgt.k);
      bb.line((s) => tgt.tOut(3 - j, s), D.sStop, tgt.sh1, [tgt.sh0]);
      nb.push(...bb.pts.slice(1));
      const pts = [...b.pts, ...nb];
      out.push({ id: `${d}-right-R${j}`, from: d, to: dTo(3), kind: 'right', lane: `${d}-in-R${j}`, target: `${dTo(3)}-out-O${3 - j}`, phase: phaseR(d), lanes: 1, radius: r, speed: Math.min(30, speedOfRadius(r)), pcu: flows[d].R / 2, pts, length: plen(pts), joints: [...b.joints, b.pts.length - 1] });
    }
    // ---- U-turn, cars only: inner pocket R2 -> half circle -> outer outbound lane O4 of the same arm
    {
      const oP = D.t0 - W - W / 2, oT = -(D.t0 + 3.5 * W), r = (oP - oT) / 2;
      const b = new PathB(k);
      b.line(a.r2, D.sStop + a.L2, P.uStart, [D.sStop]);
      b.arc(oP - r, P.uStart, r, 0, -180);
      const bb = new PathB(k);
      bb.line((s) => a.tOut(4, s), P.uStart, a.sh1, [a.sh0]);
      const pts = [...b.pts, ...bb.pts.slice(1).map((p) => p)];
      out.push({ id: `${d}-uturn`, from: d, to: d, kind: 'uturn', lane: `${d}-in-R2`, target: `${d}-out-O4`, phase: phaseR(d), lanes: 1, radius: r, speed: Math.min(15, speedOfRadius(r)), pcu: P.uPcu, pts, length: plen(pts), joints: [...b.joints, b.pts.length - 1] });
    }
  }
  return out;
}

// ------------------------------------------------------------------ paved outline (the open star + the lane zones of the four arms)
export function pavedOutline(arms: Record<Dir, OpenArm>): V2[] {
  const D = deriveOpen(), P = OPEN_PARAMS, ring: V2[] = [];
  const nS = 24;
  for (let k = 0; k < 4; k++) {
    const a = arms[DIRS[k]], n = arms[DIRS[(k + 1) % 4]];
    // (a) inbound outer edge of arm k, from the zone end inward to the arc start
    const ks = [a.sZone, a.sh1, a.sh0, D.sDiv0, D.sDiv1, D.Cx].filter((s) => s >= D.Cx).sort((x, y) => y - x);
    for (const s of [...new Set(ks)]) ring.push(armPt(k, a.t(s) + P.nThrough * W + a.ws(s), s));
    // (b) the corner arc, island side (lane centre radius - W/2), theta 0 -> 90
    for (let i = 1; i <= 90; i++) { const th = i * rad; ring.push(armPt(k, D.Cx - (P.slipR - W / 2 + 0) * Math.cos(th) - 0, D.Cx - (P.slipR - W / 2) * Math.sin(th))); }
    // (c) outbound outer edge of arm k+1, from the arc end outward to the zone end
    const kn = [D.Cx, D.sMg1, D.sMg2, n.sh0, n.sh1, n.sZone].filter((s) => s >= D.Cx).sort((x, y) => x - y);
    for (const s of [...new Set(kn)]) ring.push(armPt(k + 1, -(n.t(s) + P.nThrough * W + n.wr(s)), s));
    // (d) cap across arm k+1 at its zone end
    ring.push(armPt(k + 1, n.t(n.sZone) + P.nThrough * W + n.ws(n.sZone), n.sZone));
  }
  void nS;
  return ring;
}
export const polyArea = (p: ReadonlyArray<V2>): number => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
export const pointInPoly = (x: number, y: number, p: ReadonlyArray<V2>): boolean => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
};
export const ssdOpenSlip = (): number => stoppingSight(OPEN_PARAMS.vSlip);
