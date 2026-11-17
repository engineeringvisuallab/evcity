// J1-g4 NOTE: the game no longer draws this old box (GroundJ1Mesh was removed). This file stays because the open star (OpenJ1Geometry / OpenJ1Mesh) reads its shared frame and inputs
// (DIRS, rotCW, toWorld, J1_SITE, J1_APPROACH_INPUTS) and scripts/j1-ground-check.ts still checks the old box numbers.
// STEP J1-b  GEOMETRY DATA of the ground-level 8 x 8 signalised "+" J1 (HANDOFF_ROAD_DESIGN.md 15.8, 15.9, section 12). PURE MATH: no three.js, no terrain.
// Every number comes from DESIGN / CRITERIA / SECTION_M8 / the J1-a calculation sheet (docs/j1a.json); the few free choices are listed in J1_PARAMS and marked ASSUMED.
//
// FRAMES
//   local frame of J1: x = e (along the E arm, "east-ish"), y = n (along the N arm, "north-ish"), origin = the J1 centre. world = J1 + e * eAx + n * nAx (toWorld).
//   arm frame (s, o): s = distance OUTWARD from the J1 centre along the arm axis, o = lateral offset, + = RIGHT of the outward direction = the INBOUND side
//   (left-hand traffic: traffic going IN keeps to its left = the +o side). The N arm frame is the local frame itself (x = o, y = s); E, S, W are the N arm turned 90 deg clockwise.
//   The four arms are exact 90 deg turns of one design (pinwheel-free: each arm is symmetric about its own axis), only the pocket lengths differ (J1-a inputs).
//
// ONE ARM, from the stop line outward (N arm shown, inbound side = +o):
//   o:  -23.4 .. -19.75   receiving lane of the slip lane of the previous arm (only for s >= 48.4: acceleration lane, then merge taper)
//       -19.75 .. -5.15   4 outbound through lanes
//        -5.15 ..  -2.15  median island 3.0 m (refuge, signal poles), widens to the M8 median further out
//        -2.15 ..   5.15  2 right-turn pocket lanes (R2 inner, R1 next to the through lanes), staggered tapers
//         5.15 ..  19.75  4 inbound through lanes
//        19.75 ..  23.4   left slip lane (taper in, straight, then the 25 m kerb arc around the corner)
//   Through lanes of two opposite arms line up exactly (they are mirror images about the arm axis), so the through movement has NO lateral shift in the box.
import { CRITERIA, DESIGN, speedChangeLength, stoppingSight } from '../standards/Criteria';
import { laneDropTaper } from '../standards/Checks';
import { SECTION_M8 } from '../standards/SectionTable';

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
export type V2 = readonly [number, number];
export type ElementKind = 'box' | 'through-in' | 'through-out' | 'pocket' | 'island' | 'slip-in' | 'slip-arc' | 'slip-out' | 'corner-island';

/** Position and direction of J1 (C10, J1-a2, 15.8.8; was C9 (-117, -277) yaw 17.6). Config.roads.junctionJ1 is added in J1-e. */
export const J1_SITE = { x: -87, z: -277, yawDeg: 37.5 } as const;

/** Inputs per approach taken from the J1-a sheet (docs/j1a.json: clears, fits.storageT, fits.storageR). scripts/j1-ground-check.ts compares them with the file. */
export const J1_APPROACH_INPUTS: Record<Dir, { clear: number; storageT: number; storageR: number }> = {
  N: { clear: 380, storageT: 89.58, storageR: 59.48 },
  E: { clear: 350, storageT: 81.33, storageR: 53.52 },
  S: { clear: 350, storageT: 82.22, storageR: 59.48 },
  W: { clear: 330, storageT: 81.33, storageR: 53.52 },
};

const W = DESIGN.laneWidth; // 3.65
const V_APP = 60, V_ARM = 100, V_SLIP = 25; // km/h: signalised approach, M8 arm, slip lane (J1-a)
export const J1_PARAMS = {
  W,
  vApp: V_APP,
  vArm: V_ARM,
  vSlip: V_SLIP,
  nThrough: 4, // inbound and outbound through lanes
  nPocket: 2, // right-turn pockets (left-hand traffic: the right turn crosses the opposing flow)
  island: 3.0, // m, median island at the stop line (J1-a)
  crosswalk: 4.0, // m, zebra length along the traffic (J1-a)
  slipR: 25, // m, kerb radius of the left-turn corner (user decision: up to 25 m)
  slipW: W, // m, slip lane width on the straight and on the arc (ASSUMED: no widening on the arc, R >= 25 m)
  /** ASSUMED: the inner pocket lane R2 is this much shorter than R1, at both ends (staggered tapers, each taper = laneDropTaper(60)). */
  stagger: 30,
  /** ASSUMED: smallest visible kerb island width; the arc leaves the through lane edge tangentially, the sliver before this width stays as painted gore. */
  noseWidth: 1.0,
  zebraBar: 0.5, zebraPitch: 1.0, // m, bar width and bar pitch of a zebra
  stopLineWidth: 0.45, // m
  /** ASSUMED: position of the slip lane zebra on the arc (degrees from the start of the arc). */
  slipZebraAtDeg: 45,
  arcStepDeg: 3, // degrees per cell on the arcs
  /** Eye height and object height for sight (m), DESIGN. */
  eye: DESIGN.eyeHeight,
};

/** Numbers derived from the project standards (printed in the check script). */
export function deriveJ1() {
  const P = J1_PARAMS;
  const taper60 = laneDropTaper(V_APP); // W V^2 / 155 = 84.8 m per lane
  const brake60 = speedChangeLength(V_APP, 0, CRITERIA.aDecel); // 55.6 m
  const tMid = SECTION_M8.elements.find((e) => e.kind === 'lanes')!.from; // 4.5: first lane edge from the axis at mid-block (median 3.0 + inner shoulder 1.5)
  const t0 = (P.island + P.nPocket * W) / 2; // 5.15: first through-lane edge at the junction (pockets + island fit between the two carriageways)
  const B = t0 + P.nThrough * W; // 19.75: half width of the box (outer edge of the through lanes)
  const sStop = B + P.crosswalk; // 23.75: stop line distance from the J1 centre
  const shiftW = t0 - tMid; // 0.65: lateral shift of each carriageway back to the M8 section
  const shiftLen = laneDropTaper(V_ARM, shiftW); // 0.62 W V = 40.3 m (arm speed, conservative)
  const slipDecel = speedChangeLength(V_APP, V_SLIP, CRITERIA.aDecel); // 45.9 m, 60 -> 25 km/h inside the full-width slip lane
  const slipAccel = speedChangeLength(V_SLIP, V_APP, CRITERIA.aAccel); // 95.7 m, 25 -> 60 km/h in the receiving lane
  const Rc = P.slipR + P.slipW / 2; // lane-centre radius 26.8 m
  const Cx = B + P.slipW + P.slipR; // 48.4: centre of the corner arc, measured from the axes of both roads
  const sArc0 = Cx; // the arc starts on the arm at s = Cx (symmetric corner)
  const sSlip1 = sArc0 + slipDecel; // end of the taper-in = start of the full-width slip lane
  const sSlip0 = sSlip1 + taper60; // start of the taper-in
  const sRecvEnd = Cx + slipAccel + taper60; // end of the merge taper of the receiving lane
  const rOut = P.slipR + P.slipW; // outer radius of the slip lane = radius of the island arc
  const thetaN = Math.acos(1 - P.noseWidth / rOut); // arc angle where the island is noseWidth wide
  return { taper60, brake60, tMid, t0, B, sStop, shiftW, shiftLen, slipDecel, slipAccel, Rc, Cx, sArc0, sSlip1, sSlip0, sRecvEnd, rOut, thetaN };
}

// ------------------------------------------------------------------ helpers (pure)
type PL = ReadonlyArray<readonly [number, number]>; // piecewise linear function of s: (s, value), constant outside the first and last point
const evalPL = (p: PL, s: number): number => {
  if (s <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (s <= p[i][0]) {
      const [s0, v0] = p[i - 1], [s1, v1] = p[i];
      return s1 === s0 ? v1 : v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return p[p.length - 1][1];
};
const K = (v: number): PL => [[0, v]];
/** c0 + sum(coef * f) on the union of the knots. */
function lin(c0: number, terms: Array<[number, PL]>): PL {
  const knots = new Set<number>();
  for (const [, f] of terms) for (const [s] of f) knots.add(s);
  if (!knots.size) return [[0, c0]];
  return [...knots].sort((a, b) => a - b).map((s) => [s, c0 + terms.reduce((a, [c, f]) => a + c * evalPL(f, s), 0)] as const);
}
export const rotCW = (p: V2, k: number): V2 => { let x = p[0], y = p[1]; for (let i = 0; i < k; i++) { const nx = y, ny = -x; x = nx; y = ny; } return [x, y]; };
export const polyArea = (p: ReadonlyArray<V2>): number => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };

export interface J1Element {
  id: string; arm: Dir; kind: ElementKind;
  /** 'in' = traffic flows toward the J1 centre, 'out' = away from it. */
  dir?: 'in' | 'out';
  /** Convex cells (quads / triangles) in the local frame, they tile the element exactly (used for overlap checks and for the mesh in J1-e). */
  cells: V2[][];
  /** Lane centre line in the local frame (inbound: listed from the far end toward J1, outbound: from J1 outward), lanes only. */
  centre?: V2[];
  area: number;
}
export interface J1Line { id: string; arm: Dir; kind: 'stop-line'; lane: 'through' | 'pocket'; a: V2; b: V2; width: number }
export interface J1Bar { id: string; arm: Dir; kind: 'zebra' | 'zebra-slip'; poly: V2[] }
export interface J1KerbArc { arm: Dir; centre: V2; radius: number; from: V2; to: V2; a0Deg: number; a1Deg: number }
export interface J1Geometry {
  site: typeof J1_SITE; params: typeof J1_PARAMS; derived: ReturnType<typeof deriveJ1>;
  /** s where the arm is back to the plain M8 section (all tapers and the median shift are finished), per arm. */
  sZone: Record<Dir, number>;
  /** pocket lengths from the stop line (full width / end of taper), R1 and R2, per arm. */
  pockets: Record<Dir, { R1full: number; R1end: number; R2full: number; R2end: number }>;
  elements: J1Element[]; stopLines: J1Line[]; bars: J1Bar[]; kerbArcs: J1KerbArc[];
  box: V2[];
}

/** Builds one lane-like strip between two edge functions, from u0 to u1 (u = s along the arm); map turns (u, v) into a local point. */
function strip(u0: number, u1: number, inner: PL, outer: PL, map: (u: number, v: number) => V2): { cells: V2[][]; centre: V2[] } {
  const us = new Set<number>([u0, u1]);
  for (const f of [inner, outer]) for (const [s] of f) if (s > u0 && s < u1) us.add(s);
  const list = [...us].sort((a, b) => a - b);
  const cells: V2[][] = [], centre: V2[] = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1];
    const c: V2[] = [map(a, evalPL(inner, a)), map(a, evalPL(outer, a)), map(b, evalPL(outer, b)), map(b, evalPL(inner, b))];
    if (polyArea(c) > 1e-9) cells.push(c);
  }
  for (const u of list) centre.push(map(u, (evalPL(inner, u) + evalPL(outer, u)) / 2));
  return { cells, centre };
}

/** Local -> world (x east, z south). */
export function toWorld(p: V2, site: { x: number; z: number; yawDeg: number } = J1_SITE): { x: number; z: number } {
  const y = (site.yawDeg * Math.PI) / 180;
  const eAx = { x: Math.cos(y), z: Math.sin(y) }, nAx = { x: Math.sin(y), z: -Math.cos(y) };
  return { x: site.x + p[0] * eAx.x + p[1] * nAx.x, z: site.z + p[0] * eAx.z + p[1] * nAx.z };
}

export function buildJ1Geometry(inputs: Record<Dir, { clear: number; storageT: number; storageR: number }> = J1_APPROACH_INPUTS): J1Geometry {
  const P = J1_PARAMS, D = deriveJ1();
  const { B, t0, tMid, sStop, Cx, rOut, thetaN } = D;
  const elements: J1Element[] = [], stopLines: J1Line[] = [], bars: J1Bar[] = [], kerbArcs: J1KerbArc[] = [];
  const sZone = {} as Record<Dir, number>, pockets = {} as Record<Dir, { R1full: number; R1end: number; R2full: number; R2end: number }>;
  const rad = Math.PI / 180;
  // the median shift starts when every lane taper of the arm is finished (pocket tapers, slip taper-in, merge taper of the receiving lane)
  const sSh0 = (d: Dir): number => {
    const L1 = Math.ceil(D.brake60 + inputs[d].storageR);
    return Math.max(sStop + L1 + D.taper60, D.sSlip0, D.sRecvEnd);
  };

  for (let k = 0; k < 4; k++) {
    const d = DIRS[k];
    const R = (p: V2): V2 => rotCW(p, k);
    const armMap = (u: number, v: number): V2 => R([v, u]); // (s, o) -> local
    const crossMap = (u: number, v: number): V2 => R([u, v]); // the receiving lane runs along the cross road: (x, y) of the arm frame
    const poly = (pts: V2[]): V2[] => pts.map(R);
    const L1 = Math.ceil(D.brake60 + inputs[d].storageR), L2 = L1 - P.stagger;
    const sR1end = sStop + L1 + D.taper60, sR2end = sStop + L2 + D.taper60;
    const sh0 = sSh0(d), sh1 = sh0 + D.shiftLen;
    sZone[d] = sh1;
    pockets[d] = { R1full: L1, R1end: L1 + D.taper60, R2full: L2, R2end: L2 + D.taper60 };
    // edge functions in the arm frame
    const t: PL = [[B, t0], [sh0, t0], [sh1, tMid]]; // first through lane edge from the axis (inbound +t, outbound -t)
    const w1: PL = [[B, W], [sStop + L1, W], [sR1end, 0]]; // width of pocket R1 (next to the through lanes)
    const w2: PL = [[B, W], [sStop + L2, W], [sR2end, 0]]; // width of pocket R2 (inner)
    const add = (id: string, kind: ElementKind, dir: 'in' | 'out' | undefined, cells: V2[][], centre?: V2[]): void => {
      elements.push({ id: `${d}-${id}`, arm: d, kind, dir, cells, centre, area: cells.reduce((a, c) => a + polyArea(c), 0) });
    };
    // through lanes (T1 inner .. T4 outer), inbound on +o, outbound on -o
    for (let i = 1; i <= P.nThrough; i++) {
      const a = strip(B, sh1, lin(0, [[1, t]]).map(([s, v]) => [s, v + (i - 1) * W] as const), lin(0, [[1, t]]).map(([s, v]) => [s, v + i * W] as const), armMap);
      add(`in-T${i}`, 'through-in', 'in', a.cells, a.centre.slice().reverse());
      const b = strip(B, sh1, lin(0, [[-1, t]]).map(([s, v]) => [s, v - i * W] as const), lin(0, [[-1, t]]).map(([s, v]) => [s, v - (i - 1) * W] as const), armMap);
      add(`out-O${i}`, 'through-out', 'out', b.cells, b.centre);
    }
    // right-turn pockets
    const p1 = strip(B, sR1end, lin(0, [[1, t], [-1, w1]]), t, armMap);
    add('in-R1', 'pocket', 'in', p1.cells, p1.centre.slice().reverse());
    const p2 = strip(B, sR2end, lin(0, [[1, t], [-1, w1], [-1, w2]]), lin(0, [[1, t], [-1, w1]]), armMap);
    add('in-R2', 'pocket', 'in', p2.cells, p2.centre.slice().reverse());
    // median island between the pockets and the outbound lanes (the M8 median continues after sZone)
    const isl = strip(B, sh1, lin(0, [[-1, t]]), lin(0, [[1, t], [-1, w1], [-1, w2]]), armMap);
    add('median', 'island', undefined, isl.cells);
    // slip lane: taper-in, straight, arc
    const slipOuter: PL = [[D.sSlip1, B + P.slipW], [D.sSlip0, B]];
    const sl = strip(D.sArc0, D.sSlip0, K(B), slipOuter, armMap);
    add('slip-in', 'slip-in', 'in', sl.cells, sl.centre.slice().reverse());
    // arc: centre (Cx, Cx) in the arm frame (o, s); theta = 0 at the arm (heading -s), 90 deg at the cross road (heading +o)
    const arcPt = (r: number, thDeg: number): V2 => [Cx - r * Math.cos(thDeg * rad), Cx - r * Math.sin(thDeg * rad)];
    // arc angles: a regular grid plus the two nose angles, so the slip arc cells and the corner island share the same chord points (no sliver)
    const th1 = thetaN / rad, th2 = 90 - th1;
    const angles = [...new Set<number>([0, 90, th1, th2, ...Array.from({ length: Math.round(90 / P.arcStepDeg) + 1 }, (_, i) => i * P.arcStepDeg)])].sort((a, b) => a - b);
    const arcCells: V2[][] = [], arcCentre: V2[] = [];
    for (let i = 0; i + 1 < angles.length; i++) {
      if (angles[i + 1] - angles[i] < 1e-9) continue;
      arcCells.push(poly([arcPt(P.slipR, angles[i]), arcPt(rOut, angles[i]), arcPt(rOut, angles[i + 1]), arcPt(P.slipR, angles[i + 1])]));
    }
    for (const a of angles) arcCentre.push(R(arcPt(P.slipR + P.slipW / 2, a)));
    add('slip-arc', 'slip-arc', 'in', arcCells, arcCentre);
    kerbArcs.push({ arm: d, centre: R([Cx, Cx]), radius: P.slipR, from: R(arcPt(P.slipR, 0)), to: R(arcPt(P.slipR, 90)), a0Deg: 0, a1Deg: 90 });
    // receiving lane on the cross road: acceleration length, then the merge taper (outer edge moves in)
    const rx1 = Cx + D.slipAccel, rx2 = D.sRecvEnd;
    const rc = strip(Cx, rx2, K(B), [[rx1, B + P.slipW], [rx2, B]], crossMap);
    add('slip-out', 'slip-out', 'out', rc.cells, rc.centre);
    // corner island (triangle with a curved side), truncated where it is noseWidth wide; fan from the sharp corner
    const ring: V2[] = [[B, B], [B, arcPt(rOut, th1)[1]]];
    for (const a of angles) if (a >= th1 - 1e-9 && a <= th2 + 1e-9) ring.push(arcPt(rOut, a));
    ring.push([arcPt(rOut, th2)[0], B]);
    const fan: V2[][] = [];
    for (let i = 1; i + 1 < ring.length; i++) fan.push(poly([ring[0], ring[i], ring[i + 1]]));
    add('corner-island', 'corner-island', undefined, fan);
    // stop lines (one for the pockets with their own phase, one for the through lanes), at the outer edge of the zebra
    const sl0 = sStop;
    const oPk = t0 - 2 * W;
    stopLines.push({ id: `${d}-stop-pocket`, arm: d, kind: 'stop-line', lane: 'pocket', a: R([oPk, sl0 + P.stopLineWidth / 2]), b: R([t0, sl0 + P.stopLineWidth / 2]), width: P.stopLineWidth });
    stopLines.push({ id: `${d}-stop-through`, arm: d, kind: 'stop-line', lane: 'through', a: R([t0, sl0 + P.stopLineWidth / 2]), b: R([B, sl0 + P.stopLineWidth / 2]), width: P.stopLineWidth });
    // zebra over the inbound and the outbound lanes, none over the island (pedestrians walk through it)
    const zebra = (a: number, b: number, tag: string): void => {
      for (let o = a + P.zebraBar, i = 0; o + P.zebraBar <= b - P.zebraBar + 1e-9; o += P.zebraPitch, i++) bars.push({ id: `${d}-zebra-${tag}${i}`, arm: d, kind: 'zebra', poly: poly([[o, B], [o + P.zebraBar, B], [o + P.zebraBar, sStop], [o, sStop]]) });
    };
    zebra(oPk, B, 'in');
    zebra(-B, -t0, 'out');
    // zebra across the slip lane on the arc: perpendicular to the path, 4 m along the path
    const thC = P.slipZebraAtDeg, dth = (P.crosswalk / 2 / (P.slipR + P.slipW / 2)) / rad;
    for (let r = P.slipR + P.zebraBar, i = 0; r + P.zebraBar <= rOut - P.zebraBar + 1e-9; r += P.zebraPitch, i++) bars.push({ id: `${d}-zebra-slip${i}`, arm: d, kind: 'zebra-slip', poly: poly([arcPt(r, thC - dth), arcPt(r + P.zebraBar, thC - dth), arcPt(r + P.zebraBar, thC + dth), arcPt(r, thC + dth)]) });
  }
  const box: V2[] = [[-B, -B], [B, -B], [B, B], [-B, B]];
  elements.push({ id: 'box', arm: 'N', kind: 'box', cells: [box.slice()], area: polyArea(box) });
  return { site: J1_SITE, params: J1_PARAMS, derived: D, sZone, pockets, elements, stopLines, bars, kerbArcs, box };
}

// ------------------------------------------------------------------ 2D tools used by the check script (pure)
/** Area of the overlap of two CONVEX polygons (Sutherland-Hodgman). */
export function overlapArea(a: ReadonlyArray<V2>, b: ReadonlyArray<V2>): number {
  const ccw = (p: ReadonlyArray<V2>): V2[] => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return s < 0 ? [...p].reverse() : [...p]; };
  let out: V2[] = ccw(a);
  const clip = ccw(b);
  for (let i = 0; i < clip.length && out.length; i++) {
    const c0 = clip[i], c1 = clip[(i + 1) % clip.length];
    const inside = (p: V2): boolean => (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]) >= -1e-12;
    const next: V2[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j], q = out[(j + 1) % out.length];
      const ip = inside(p), iq = inside(q);
      if (ip !== iq) {
        const d1x = q[0] - p[0], d1y = q[1] - p[1], d2x = c1[0] - c0[0], d2y = c1[1] - c0[1];
        const den = d1x * d2y - d1y * d2x;
        const tt = den === 0 ? 0 : ((c0[0] - p[0]) * d2y - (c0[1] - p[1]) * d2x) / den;
        next.push([p[0] + tt * d1x, p[1] + tt * d1y]);
      }
      if (iq) next.push(q);
    }
    out = next;
  }
  return out.length < 3 ? 0 : polyArea(out);
}
/** Shortest distance from segment a-b to an axis-aligned rectangle [x0,x1] x [y0,y1] (0 if they touch or cross). */
export function segRectDistance(a: V2, b: V2, x0: number, y0: number, x1: number, y1: number): number {
  let best = Infinity;
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}
export const ssdSlip = (): number => stoppingSight(J1_PARAMS.vSlip);
