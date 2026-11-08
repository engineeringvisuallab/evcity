// ROAD SIGNS - Step 3: the PLAN. Which board stands where and what is written on it. Nothing is built here (no three.js, no DOM).
//
// Two kinds of board:
//   advance  stands BEFORE a junction (on the approach road) and tells the driver which way each place lies: one row per place with an arrow
//            (left / ahead / right) and the road distance to it.
//   confirm  stands a little AFTER a junction on a long main road: "yes, you are going the right way" - ahead arrow, remaining km.
//
// Two styles (the rule of the handoff: ONE board per place, the one that is needed there):
//   overhead  highway / arterial always; a 4+ lane city road only at a SPECIAL junction (a 4-way, or one where a highway / arterial meets it):
//             a gantry over the carriageway (Step 4 builds it; until then a side board shows it)
//   side      everything else (small roads, 4+ lane city roads at ordinary junctions), and every confirm board
//
// STEP 7 - DOUBLE-SIDED boards: the planner first makes one board per driving direction ("faces"), then pairs a +1 face with a -1 face of the same road
//   and style that stand within `pairWindowM` of each other and moves both to ONE spot where both drivers still keep their own rules (advance board 70-300 m
//   before its junction, confirm board at least 70 m after it, 400 m / 150 m spacing, no bridge / junction pad). One pair = one board (one set of posts):
//   `front` faces one driver, `back` the opposite driver. A face with no partner stays a single-sided board (its back is plain metal).
//   A side board stands on the near edge of the driver with MORE rows (tie: direction +1); a gantry spans the whole road anyway, so it has no near edge.
// How the rows are chosen at a junction (pad P) for a driver who arrives along arm A:
//   1. every destination goes to the arm of P that reaches it with the least driving (the arm's cost = its own length + road distance from its far
//      end; a destination that lies ON the arm's stretch of road costs just the distance to it). A road that dead-ends behind the last junction is an
//      arm too, so a place beyond it points the right way.
//   2. destinations whose best arm is A itself lie BEHIND the driver and are left out; places closer than `hereM` are "here" and are left out too.
//   3. per remaining arm: the biggest place (rank 1 before 2 before 3, then nearest) and the nearest other place; at most 4 rows on a board.
//   4. the arrow is the angle of the arm relative to the driver's heading: |angle| < 35 deg ahead, otherwise left / right
//      (x east, z south, heading = atan2(dz, dx): a positive angle turns towards +z = to the RIGHT of the driver).
import { DESTINATIONS, type Destination } from './SignDestinations';
import { RoadDistances, type GraphEdge, type GraphPad, type GraphRoad } from './RoadDistance';
import type { SignArrow, SignColor, SignRow } from './SignFormat';
import { gantryEdge } from './GantryLayout';

export type SignStyle = 'overhead' | 'side';
export type SignPurpose = 'advance' | 'confirm';

/** What the planner needs of a road (RoadSpec has all of it). */
export interface PlanRoad extends GraphRoad {
  name: string;
  kind: string;
  lanes: number;
  halfWidth: number;
  shoulder: number;
  /** Distance between centreline points (m). */
  step: number;
  /** Bridge id per point, -1 = on the ground. */
  bridgeOf: ArrayLike<number>;
}
/** What the planner needs of the road network (RoadNetwork has all of it). */
export interface PlanNet {
  roads: readonly PlanRoad[];
  pads: readonly GraphPad[];
  padAt(x: number, z: number): unknown;
  surfaceAt(x: number, z: number): number;
}

/** The rules in one place, so they are easy to change. All distances in metres. */
export const SIGN_RULES = {
  /** A junction needs at least this many arms (roads leaving it) to get boards. */
  minArms: 3,
  /** A place closer than this to the junction (by road) is "here": not listed. */
  hereM: 250,
  /** Longest road distance at which a place of the rank is still listed (rank 1 = everywhere). */
  maxM: { 1: 20000, 2: 4500, 3: 2000 } as Record<number, number>,
  /** Advance board: distance before the junction, by road. */
  advanceM: { highway: 300, arterial: 220, wide: 180, collector: 120, local: 90 },
  /** The board must stand at least this far from the junction behind it (so a short block gets none). */
  minGapM: 60,
  /** Shortest usable advance distance. */
  minAdvanceM: 70,
  /** Confirm boards: only on these road kinds, only when the stretch to the next junction is at least `confirmMinEdgeM`, this far after the junction. */
  confirmKinds: ['highway', 'arterial', 'collector'],
  confirmMinEdgeM: 500,
  confirmAfterM: 150,
  /** Same road, same driving direction: an overhead and a side board must be at least this far apart (else the side board is dropped). */
  mixedGapM: 400,
  /** Two boards of the same kind on the same road and direction closer than this: the confirm board is dropped. */
  sameGapM: 150,
  maxRows: 4,
  /** STEP 6 - short block (too short for an advance board): a side board this far before the junction, if the block is at least `shortBlockMinM` long. */
  shortBlockMinM: 75,
  shortBlockFromBehindM: 30,
  /** STEP 6 - long stretch of a main road: another confirm board every this many metres, as long as at least `confirmEndKeepM` remain to the next junction. */
  confirmEveryM: 1500,
  confirmEndKeepM: 500,
  /** STEP 6 - T-junctions / crossings without a pad: a virtual junction is made when two roads meet (end on the other road, or cross at grade) and no real pad is within this distance. */
  virtualPadMinGapM: 45,
  virtualPadTouchM: 8,
  /** |angle| below this (degrees) = ahead. */
  aheadDeg: 35,
  /** STEP 7 - double-sided boards: two opposite-direction boards of the same road and style are joined when they are at most this far apart (m along the road). */
  pairWindowM: 150,
  /** STEP 7 - after joining, an advance board must still stand this far before its junction (min / max), a confirm board at least this far after it. */
  pairAdvanceMinM: 70,
  pairAdvanceMaxM: 300,
  pairConfirmMinM: 70,
  /** STEP 7 - the joined board is looked for along the stretch between the two boards in steps of this many metres, from the middle outwards. */
  pairSpotStepM: 5,
};

export interface PlannedSign {
  id: number;
  purpose: SignPurpose;
  style: SignStyle;
  color: SignColor;
  /** Junction (pad index) the board belongs to. */
  padId: number;
  roadId: number;
  roadName: string;
  roadKind: string;
  lanes: number;
  /** Position along the road (m) and driving direction along it (+1 = increasing s). */
  s: number;
  dir: 1 | -1;
  /** Metres between the board and its junction (advance: before it, confirm: after it). */
  dM: number;
  /** The driver's heading (rad, atan2(dz, dx)) when he ENTERS the junction: the arrows are relative to it (the road may bend between the board and the junction). */
  padHeading: number;
  /** Road centreline point under the board and the driver's unit heading there. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Where a SIDE board stands (left edge of the road, outside the shoulder), and the unit vector it faces (back at the driver). */
  sx: number;
  sz: number;
  fx: number;
  fz: number;
  /** false = the side spot is on another road or in a junction (a side board cannot stand there). */
  sideOk: boolean;
  /** STEP 6: a board for a short block (always a side board, even on a highway / arterial). */
  short?: boolean;
  rows: SignRow[];
  /** STEP 7: the board (index in `SignPlanResult.boards`) this face belongs to, and which face of it. A single-sided board has only a front. */
  board: number;
  face: 'front' | 'back';
}

/**
 * STEP 7: one physical board. `front` is the face for one driver, `back` (if any) the face for the driver of the opposite direction (same road, same
 * spot). For a SIDE board the post foot is at front.sx / front.sz and the front faces front.fx / front.fz; a GANTRY stands at front.x / front.z with the
 * front driver's heading front.hx / front.hz. The back face has its own rows, arrows and km, written for the opposite driver.
 */
export interface PlannedBoard {
  id: number;
  style: SignStyle;
  roadId: number;
  front: PlannedSign;
  back: PlannedSign | null;
}

export interface SignPlanResult {
  /** Every face (one per driving direction). Since Step 7 a face of a double-sided board stands at the joined spot. */
  signs: PlannedSign[];
  /** STEP 7: the physical boards (what is built): double-sided pairs + single-sided boards. */
  boards: PlannedBoard[];
  /** STEP 7: how many double-sided boards. */
  pairs: number;
  /** How many candidate boards were dropped, by reason. */
  skipped: Record<string, number>;
  /** Rows whose arrows were the same although they point along different arms (the board is ambiguous). */
  sameArrowBoards: number;
  summary: string;
  /** The junctions the boards refer to by `padId`: the real pads first, then the virtual ones (T-junctions / crossings that have no pad). */
  pads: GraphPad[];
  /** How many virtual junctions were added. */
  virtualPads: number;
}

const TWO_PI = Math.PI * 2;
const wrapPi = (a: number): number => {
  let r = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  return r;
};

/** One way out of a junction: a real stretch to the next junction, or a stub (road that ends behind the last junction). */
interface Arm {
  edge: GraphEdge | null;
  roadId: number;
  dir: 1 | -1;
  s0: number;
  len: number;
  heading: number;
}

/** Can this road carry an overhead board at all? (highway / arterial, or a road with 4+ lanes) */
export function isOverhead(r: { kind: string; lanes: number }): boolean {
  return r.kind === 'highway' || r.kind === 'arterial' || r.lanes >= 4;
}
/**
 * The style of an advance board for a driver on road r. Highway / arterial: always overhead. A 4+ lane city road: overhead only at a special
 * junction (`special`: a 4-way, or a highway / arterial among its arms), otherwise a side board. Small roads: side.
 */
export function overheadAt(r: { kind: string; lanes: number }, special: boolean): boolean {
  if (r.kind === 'highway' || r.kind === 'arterial') return true;
  return r.lanes >= 4 && special;
}
function advanceDistance(r: { kind: string; lanes: number }, style: SignStyle): number {
  const a = SIGN_RULES.advanceM;
  if (r.kind === 'highway') return a.highway;
  if (r.kind === 'arterial') return a.arterial;
  if (style === 'overhead') return a.wide;
  return r.kind === 'collector' ? a.collector : a.local;
}
function signColor(r: { kind: string }): SignColor {
  return r.kind === 'highway' || r.kind === 'arterial' ? 'green' : 'blue';
}
function arrowOf(travelHeading: number, armHeading: number): SignArrow {
  const rel = wrapPi(armHeading - travelHeading);
  if (Math.abs(rel) < (SIGN_RULES.aheadDeg * Math.PI) / 180) return 'ahead';
  return rel > 0 ? 'right' : 'left';
}

/** Point and unit tangent (along increasing s) of a road at distance s. */
function roadAt(r: PlanRoad, s: number): { x: number; z: number; tx: number; tz: number; i: number } {
  const n = r.xs.length;
  const sc = r.closed ? ((s % r.length) + r.length) % r.length : Math.max(0, Math.min(r.length, s));
  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (r.cum[m] <= sc) lo = m;
    else hi = m - 1;
  }
  const i = lo;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (sc - r.cum[i]) / seg)) : 0;
  let tx = r.xs[i + 1] - r.xs[i];
  let tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  return { x: r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f, z: r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f, tx, tz, i };
}

interface Spot {
  s: number;
  d: number;
  x: number;
  z: number;
  hx: number;
  hz: number;
  sx: number;
  sz: number;
  fx: number;
  fz: number;
  sideOk: boolean;
}

/** The board's geometry at distance s of road r for a driver going `driveDir`; null if it cannot stand there (bridge, junction pad). */
function spotAt(net: PlanNet, r: PlanRoad, s: number, driveDir: 1 | -1, style: SignStyle): Omit<Spot, 'd'> | null {
  if (!r.closed && (s < 0 || s > r.length)) return null;
  const p = roadAt(r, s);
  // never on or near a bridge deck (30 m either side)
  const reach = Math.ceil(30 / Math.max(1, r.step)) + 1;
  for (let k = Math.max(0, p.i - reach); k <= Math.min(r.xs.length - 1, p.i + reach); k++) if (r.bridgeOf[k] >= 0) return null;
  if (net.padAt(p.x, p.z)) return null;
  const hx = p.tx * driveDir;
  const hz = p.tz * driveDir;
  // left of the heading (hx, hz) is (hz, -hx); the board stands outside the shoulder and faces back at the driver, turned ~7 degrees towards the road
  const lx = hz;
  const lz = -hx;
  const off = r.halfWidth + r.shoulder + 0.9;
  const sx = p.x + lx * off;
  const sz = p.z + lz * off;
  let fx = -hx - lx * 0.12;
  let fz = -hz - lz * 0.12;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  const sideOk = !(net.surfaceAt(sx, sz) === 1 || net.padAt(sx, sz));
  if (style === 'side' && !sideOk) return null;
  if (style === 'overhead') {
    // STEP 6: neither gantry post may stand on a junction or on another road's surface (the caller then tries another distance along the road)
    const edge = gantryEdge(r.halfWidth, r.shoulder);
    for (const sg of [1, -1]) {
      const px = p.x + lx * edge * sg;
      const pz = p.z + lz * edge * sg;
      if (net.surfaceAt(px, pz) === 1 || net.padAt(px, pz)) return null;
    }
  }
  return { s, x: p.x, z: p.z, hx, hz, sx, sz, fx, fz, sideOk };
}

/**
 * STEP 6: junctions of two roads that have no pad (a road ends on another road, two roads meet end to end, or two roads cross at grade). The
 * pad graph does not know them, so boards never stood before them and road distances could not turn there. Earth roads are ignored, a crossing
 * where either road is on a bridge is not a junction. Returns small pad-like points (both roads as arms).
 */
export function findVirtualPads(net: PlanNet): GraphPad[] {
  const R = SIGN_RULES;
  const live = net.roads.filter((r) => !r.earth && r.xs.length >= 2);
  const out: GraphPad[] = [];
  const near = (x: number, z: number): boolean => {
    for (const p of net.pads) if (Math.hypot(p.x - x, p.z - z) < R.virtualPadMinGapM) return true;
    for (const p of out) if (Math.hypot(p.x - x, p.z - z) < R.virtualPadMinGapM) return true;
    return false;
  };
  const bridgeNear = (r: PlanRoad, s: number): boolean => {
    const reach = Math.ceil(30 / Math.max(1, r.step)) + 1;
    const i = roadAt(r, s).i;
    for (let k = Math.max(0, i - reach); k <= Math.min(r.xs.length - 1, i + reach); k++) if (r.bridgeOf[k] >= 0) return true;
    return false;
  };
  const add = (x: number, z: number, a: PlanRoad, b: PlanRoad): void => {
    if (near(x, z)) return;
    out.push({ x, z, arms: [{ roadId: a.id }, { roadId: b.id }] });
  };
  const box = live.map((r) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < r.xs.length; i++) {
      x0 = Math.min(x0, r.xs[i]); x1 = Math.max(x1, r.xs[i]); z0 = Math.min(z0, r.zs[i]); z1 = Math.max(z1, r.zs[i]);
    }
    return { x0: x0 - 20, x1: x1 + 20, z0: z0 - 20, z1: z1 + 20 };
  });
  const distTo = (px: number, pz: number, r: PlanRoad): { d: number; s: number } => {
    let best = Infinity;
    let bs = 0;
    for (let i = 0; i < r.xs.length - 1; i++) {
      const dx = r.xs[i + 1] - r.xs[i];
      const dz = r.zs[i + 1] - r.zs[i];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - r.xs[i]) * dx + (pz - r.zs[i]) * dz) / l2));
      const d = Math.hypot(r.xs[i] + dx * t - px, r.zs[i] + dz * t - pz);
      if (d < best) {
        best = d;
        bs = r.cum[i] + t * (r.cum[i + 1] - r.cum[i]);
      }
    }
    return { d: best, s: bs };
  };
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    // (1) an end of road a touches road b
    if (!a.closed) {
      for (const idx of [0, a.xs.length - 1]) {
        const px = a.xs[idx];
        const pz = a.zs[idx];
        for (let j = 0; j < live.length; j++) {
          if (j === i) continue;
          const b = live[j];
          if (px < box[j].x0 || px > box[j].x1 || pz < box[j].z0 || pz > box[j].z1) continue;
          const q = distTo(px, pz, b);
          if (q.d <= R.virtualPadTouchM && !bridgeNear(b, q.s)) add(px, pz, a, b);
        }
      }
    }
    // (2) road a crosses road b
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      if (box[i].x1 < box[j].x0 || box[j].x1 < box[i].x0 || box[i].z1 < box[j].z0 || box[j].z1 < box[i].z0) continue;
      for (let u = 0; u < a.xs.length - 1; u++) {
        for (let v = 0; v < b.xs.length - 1; v++) {
          const p = a.xs[u];
          const q = a.zs[u];
          const r2 = a.xs[u + 1] - p;
          const s2 = a.zs[u + 1] - q;
          const x = b.xs[v];
          const z = b.zs[v];
          const t2 = b.xs[v + 1] - x;
          const w2 = b.zs[v + 1] - z;
          const den = r2 * w2 - s2 * t2;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((x - p) * w2 - (z - q) * t2) / den;
          const uu = ((x - p) * s2 - (z - q) * r2) / den;
          if (tt < 0 || tt > 1 || uu < 0 || uu > 1) continue;
          const sa = a.cum[u] + tt * (a.cum[u + 1] - a.cum[u]);
          const sb = b.cum[v] + uu * (b.cum[v + 1] - b.cum[v]);
          if (bridgeNear(a, sa) || bridgeNear(b, sb)) continue;
          add(p + tt * r2, q + tt * s2, a, b);
        }
      }
    }
  }
  return out;
}


/** Position of the junction a face belongs to (m along its road, in the face's own frame). */
const junctionS = (q: PlannedSign): number => (q.purpose === 'advance' ? q.s + q.dir * q.dM : q.s - q.dir * q.dM);
/** Distance between a face standing at s and its junction sj (advance: before it, confirm: after it). */
const dMAt = (q: PlannedSign, sj: number, s: number): number => (q.purpose === 'advance' ? q.dir : -q.dir) * (sj - s);
/** The range of s (m along the road) in which a face keeps its own distance rule. */
function sRange(q: PlannedSign, sj: number): [number, number] {
  const R = SIGN_RULES;
  const lo = q.purpose === 'advance' ? R.pairAdvanceMinM : R.pairConfirmMinM;
  const hi = q.purpose === 'advance' ? R.pairAdvanceMaxM : 1e9;
  return (q.purpose === 'advance' ? q.dir : -q.dir) === 1 ? [sj - hi, sj - lo] : [sj + lo, sj + hi];
}

/**
 * STEP 7: joins opposite-direction faces into double-sided boards (see the header). Changes the joined faces in place (position, distance, km of the
 * rows) and returns the boards; sets `board` / `face` on every face. `skip` counts the pairs that could not be made.
 */
function pairSigns(net: PlanNet, roadById: Map<number, PlanRoad>, signs: PlannedSign[], skip: (why: string) => void): PlannedBoard[] {
  const R = SIGN_RULES;
  const byRoad = new Map<number, PlannedSign[]>();
  for (const q of signs) (byRoad.get(q.roadId) ?? byRoad.set(q.roadId, []).get(q.roadId)!).push(q);

  interface Cand {
    a: PlannedSign;
    b: PlannedSign;
    d: number;
    off: number;
  }
  const cands: Cand[] = [];
  for (const [roadId, list] of byRoad) {
    const r = roadById.get(roadId)!;
    for (const a of list) {
      if (a.dir !== 1) continue;
      for (const b of list) {
        if (b.dir !== -1 || a.style !== b.style) continue;
        let diff = b.s - a.s;
        let off = 0;
        if (r.closed) {
          const L = r.length;
          let w = ((diff % L) + L) % L;
          if (w > L / 2) w -= L;
          off = w - diff;
          diff = w;
        }
        if (Math.abs(diff) <= R.pairWindowM) cands.push({ a, b, d: Math.abs(diff), off });
      }
    }
  }
  cands.sort((u, v) => u.d - v.d || u.a.id - v.a.id || u.b.id - v.b.id);

  const used = new Set<number>();
  const partner = new Map<number, PlannedSign>(); // face id -> the other face
  const frontOf = new Map<number, PlannedSign>(); // board key (lower face id) -> front face
  const wrapS = (r: PlanRoad, s: number): number => (r.closed ? ((s % r.length) + r.length) % r.length : s);
  const gapOf = (r: PlanRoad, s1: number, s2: number): number => {
    const raw = Math.abs(s1 - s2);
    return r.closed ? Math.min(raw, r.length - raw) : raw;
  };

  for (const c of cands) {
    const { a, b, off } = c;
    if (used.has(a.id) || used.has(b.id)) continue;
    const r = roadById.get(a.roadId)!;
    const sjA = junctionS(a);
    const sjB = junctionS(b) + off;
    const ra = sRange(a, sjA);
    const rb = sRange(b, sjB);
    const bs = b.s + off;
    const lo = Math.max(ra[0], rb[0], Math.min(a.s, bs));
    const hi = Math.min(ra[1], rb[1], Math.max(a.s, bs));
    if (lo > hi + 1e-9) {
      skip('pair: a driver would stand too near / too far from his junction');
      continue;
    }
    // the near edge of a side board belongs to the driver with more rows (tie: direction +1); a gantry has no near edge
    const front = a.style === 'side' && b.rows.length > a.rows.length ? b : a;
    // candidate spots: the middle of the allowed stretch first, then outwards in steps
    const mid = (lo + hi) / 2;
    const spots: number[] = [mid];
    for (let k = 1; mid - k * R.pairSpotStepM >= lo - 1e-9 || mid + k * R.pairSpotStepM <= hi + 1e-9; k++) {
      if (mid - k * R.pairSpotStepM >= lo - 1e-9) spots.push(mid - k * R.pairSpotStepM);
      if (mid + k * R.pairSpotStepM <= hi + 1e-9) spots.push(mid + k * R.pairSpotStepM);
    }
    const others = (byRoad.get(a.roadId) ?? []).filter((o) => o !== a && o !== b);
    let chosen: { s: number; spot: Omit<Spot, 'd'> } | null = null;
    let blockedBySpacing = false;
    for (const s of spots) {
      const sw = wrapS(r, s);
      const spot = spotAt(net, r, sw, front.dir, front.style);
      if (!spot) continue;
      // the spacing rules of Step 3 again, with the new position
      let clash = false;
      for (const o of others) {
        const dir = o.dir;
        if (dir !== a.dir && dir !== b.dir) continue;
        const mine = dir === a.dir ? a : b;
        const dist = gapOf(r, o.s, sw);
        if (o.style !== mine.style && dist < R.mixedGapM) clash = true;
        else if (o.purpose !== mine.purpose && dist < R.sameGapM) clash = true;
        else if (o.purpose === 'confirm' && mine.purpose === 'confirm' && dist < R.sameGapM) clash = true;
        if (clash) break;
      }
      if (clash) {
        blockedBySpacing = true;
        continue;
      }
      chosen = { s, spot };
      break;
    }
    if (!chosen) {
      skip(blockedBySpacing ? 'pair: spacing rule would be broken' : 'pair: no free spot (bridge / junction)');
      continue;
    }

    // ---- join: both faces move to the chosen spot, distances and km follow
    const sw = wrapS(r, chosen.s);
    const back = front === a ? b : a;
    for (const q of [a, b]) {
      const sj = q === a ? sjA : sjB;
      const newD = dMAt(q, sj, chosen.s);
      const delta = newD - q.dM;
      const p = roadAt(r, sw);
      q.s = sw;
      q.dM = newD;
      q.x = p.x;
      q.z = p.z;
      q.hx = p.tx * q.dir;
      q.hz = p.tz * q.dir;
      // advance board: nearer to the junction = fewer km; confirm board: further after the junction = fewer km left
      const dk = (q.purpose === 'advance' ? delta : -delta) / 1000;
      q.rows = q.rows.map((row) => ({ ...row, km: (row.km ?? 0) + dk }));
    }
    // the standing place (side) belongs to the front face; a double-sided board has no tilt, so both drivers see it equally well
    front.sx = chosen.spot.sx;
    front.sz = chosen.spot.sz;
    front.sideOk = true;
    if (front.style === 'side') {
      front.fx = -front.hx;
      front.fz = -front.hz;
    } else {
      front.fx = chosen.spot.fx;
      front.fz = chosen.spot.fz;
    }
    back.sx = front.sx;
    back.sz = front.sz;
    back.fx = -front.fx;
    back.fz = -front.fz;
    back.sideOk = true;
    used.add(a.id);
    used.add(b.id);
    partner.set(a.id, b);
    partner.set(b.id, a);
    frontOf.set(Math.min(a.id, b.id), front);
  }

  // ---- the boards, in the order of their lowest face id
  const boards: PlannedBoard[] = [];
  for (const q of signs) {
    const other = partner.get(q.id);
    if (other && other.id < q.id) continue; // the board was made at the other face
    let front = q;
    let back: PlannedSign | null = null;
    if (other) {
      front = frontOf.get(Math.min(q.id, other.id))!;
      back = front === q ? other : q;
    }
    const id = boards.length;
    front.board = id;
    front.face = 'front';
    if (back) {
      back.board = id;
      back.face = 'back';
    }
    boards.push({ id, style: front.style, roadId: front.roadId, front, back });
  }
  return boards;
}

export function planRoadSigns(net: PlanNet, destinations: readonly Destination[] = DESTINATIONS, home = { x: 0, z: 0 }): SignPlanResult {
  const R = SIGN_RULES;
  const virtual = findVirtualPads(net);
  const pads: GraphPad[] = [...net.pads, ...virtual];
  const rd = new RoadDistances(net.roads, pads, destinations, home);
  const roadById = new Map<number, PlanRoad>();
  for (const r of net.roads) roadById.set(r.id, r);
  const skipped: Record<string, number> = {};
  const skip = (why: string): void => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };

  // ---- the arms of every junction: real edges + stubs
  const arms: Arm[][] = pads.map(() => []);
  rd.graph.adj.forEach((list, p) => {
    for (const e of list) arms[p].push({ edge: e, roadId: e.roadId, dir: e.dir, s0: e.s0, len: e.len, heading: e.heading });
  });
  for (const [roadId, list] of rd.graph.stations) {
    const r = roadById.get(roadId);
    if (!r || r.closed || list.length === 0) continue;
    const first = list[0];
    const last = list[list.length - 1];
    if (first.s >= R.minGapM) arms[first.pad].push({ edge: null, roadId, dir: -1, s0: first.s, len: first.s, heading: wrapPi(first.fwd + Math.PI) });
    if (r.length - last.s >= R.minGapM) arms[last.pad].push({ edge: null, roadId, dir: 1, s0: last.s, len: r.length - last.s, heading: last.fwd });
  }

  /** Metres to drive from the junction to destination d if you leave along `arm` (Infinity = this arm does not lead there). */
  const costVia = (arm: Arm, d: number): number => {
    const j = rd.joins[d];
    if (!j) return Infinity;
    if (j.roadId === arm.roadId) {
      const ahead = (j.s - arm.s0) * arm.dir;
      // the place lies on this very stretch of road
      if (ahead >= 0 && ahead <= arm.len && !(arm.edge && arm.edge.wrap)) return ahead + j.gap;
    }
    if (!arm.edge) return Infinity;
    return arm.len + rd.distance(d, arm.edge.to);
  };

  const planned: Omit<PlannedSign, 'id' | 'board' | 'face'>[] = [];
  let sameArrowBoards = 0;

  for (let p = 0; p < pads.length; p++) {
    const pa = arms[p];
    if (pa.length < R.minArms) continue;
    // best arm per destination
    const cost: number[][] = pa.map((a) => destinations.map((_, d) => costVia(a, d)));
    const best: number[] = destinations.map((_, d) => {
      let bi = -1;
      let bc = Infinity;
      for (let k = 0; k < pa.length; k++) {
        if (cost[k][d] < bc - 1e-6) {
          bc = cost[k][d];
          bi = k;
        }
      }
      return bi;
    });

    for (let ai = 0; ai < pa.length; ai++) {
      const a = pa[ai];
      if (!a.edge) continue; // boards only for drivers that arrive along a real road
      const road = roadById.get(a.roadId);
      if (!road) continue;
      const travel = wrapPi(a.heading + Math.PI);

      // ---- rows for the ADVANCE board of this approach
      const per: { arm: number; d: number; rank: number; m: number }[][] = pa.map(() => []);
      destinations.forEach((dest, d) => {
        const k = best[d];
        if (k < 0 || k === ai) return; // unreachable, or lies behind the driver
        const m = cost[k][d];
        if (m < R.hereM || m > (R.maxM[dest.rank] ?? 0)) return;
        per[k].push({ arm: k, d, rank: dest.rank, m });
      });
      const mains: typeof per[number] = [];
      const seconds: typeof per[number] = [];
      for (const list of per) {
        if (list.length === 0) continue;
        list.sort((u, v) => u.rank - v.rank || u.m - v.m);
        mains.push(list[0]);
        const rest = list.slice(1).sort((u, v) => u.m - v.m);
        if (rest.length > 0) seconds.push(rest[0]);
      }
      mains.sort((u, v) => u.rank - v.rank || u.m - v.m);
      seconds.sort((u, v) => u.m - v.m);
      const chosen = [...mains, ...seconds].slice(0, R.maxRows);
      if (chosen.length === 0) {
        skip('advance: nothing worth listing');
        continue;
      }

      // ---- where it stands: D metres before the junction along this approach road
      const special = pa.length >= 4 || pa.some((q) => ['highway', 'arterial'].includes(roadById.get(q.roadId)?.kind ?? ''));
      const style: SignStyle = overheadAt(road, special) && !(a.len - R.minGapM < R.minAdvanceM) ? 'overhead' : 'side';
      let dMax = a.len - R.minGapM;
      let shortBlock = false;
      if (dMax < R.minAdvanceM) {
        // STEP 6: a short block gets a side board (never overhead), standing `shortBlockFromBehindM` after the junction behind it
        if (a.len < R.shortBlockMinM) {
          skip('advance: block too short');
          continue;
        }
        shortBlock = true;
        dMax = a.len - R.shortBlockFromBehindM;
      }
      const dPref = shortBlock ? dMax : Math.min(advanceDistance(road, style), dMax);
      const tryD = (dd: number): Spot | null => {
        const q = spotAt(net, road, a.s0 + a.dir * dd, (a.dir * -1) as 1 | -1, style);
        return q ? { ...q, d: dd } : null;
      };
      let sp: Spot | null = null;
      const ddMin = shortBlock ? R.shortBlockMinM - R.shortBlockFromBehindM - 10 : R.minAdvanceM;
      for (let dd = dPref; dd >= ddMin && !sp; dd -= 10) sp = tryD(dd);
      for (let dd = dPref + 10; dd <= dMax && !sp; dd += 10) sp = tryD(dd);
      if (sp && shortBlock) skip('advance: short block, side board instead');
      if (!sp) {
        skip('advance: no free spot (bridge / junction)');
        continue;
      }

      const rows: SignRow[] = chosen.map((c) => ({
        en: destinations[c.d].en,
        bn: destinations[c.d].bn,
        km: (sp.d + c.m) / 1000,
        arrow: arrowOf(travel, pa[c.arm].heading),
      }));
      const order: Record<SignArrow, number> = { ahead: 0, left: 1, right: 2 };
      const withArm = chosen.map((c, i) => ({ row: rows[i], arm: c.arm, rank: c.rank }));
      withArm.sort((u, v) => order[u.row.arrow!] - order[v.row.arrow!] || u.rank - v.rank || u.row.km! - v.row.km!);
      const armsByArrow = new Map<SignArrow, Set<number>>();
      for (const w of withArm) {
        const set = armsByArrow.get(w.row.arrow!) ?? new Set<number>();
        set.add(w.arm);
        armsByArrow.set(w.row.arrow!, set);
      }
      if ([...armsByArrow.values()].some((set) => set.size > 1)) sameArrowBoards++;

      planned.push({
        purpose: 'advance',
        style,
        color: signColor(road),
        padId: p,
        roadId: road.id,
        roadName: road.name,
        roadKind: road.kind,
        lanes: road.lanes,
        s: sp.s,
        dir: (a.dir * -1) as 1 | -1,
        dM: sp.d,
        padHeading: travel,
        x: sp.x,
        z: sp.z,
        hx: sp.hx,
        hz: sp.hz,
        sx: sp.sx,
        sz: sp.sz,
        fx: sp.fx,
        fz: sp.fz,
        sideOk: sp.sideOk,
        short: shortBlock || undefined,
        rows: withArm.map((w) => w.row),
      });
    }

    // ---- CONFIRM boards: after the junction, along each exit of a long main road (also a road that dead-ends behind the last junction),
    // the first `confirmAfterM` after the junction, then another one every `confirmEveryM` while `confirmEndKeepM` remain
    for (let ei = 0; ei < pa.length; ei++) {
      const e = pa[ei];
      const road = roadById.get(e.roadId);
      if (!road || !R.confirmKinds.includes(road.kind) || e.len < R.confirmMinEdgeM) continue;
      for (let off = R.confirmAfterM; off <= e.len - (off === R.confirmAfterM ? 0 : R.confirmEndKeepM); off += off === R.confirmAfterM ? R.confirmEveryM - R.confirmAfterM : R.confirmEveryM) {
        let sp0: Omit<Spot, 'd'> | null = null;
        let used = off;
        for (const shift of [0, 10, -10, 20, -20, 40, -40, 60]) {
          if (off + shift < 60) continue;
          sp0 = spotAt(net, road, e.s0 + e.dir * (off + shift), e.dir, 'side');
          if (sp0) {
            used = off + shift;
            break;
          }
        }
        if (!sp0) {
          skip('confirm: no free spot (bridge / junction)');
          continue;
        }
        // the places this exit leads to (best arm = this exit), biggest first; the remaining distance is measured from the board
        const list: { d: number; rank: number; m: number }[] = [];
        destinations.forEach((dest, d) => {
          if (best[d] !== ei) return;
          const m = cost[ei][d] - used;
          if (m < R.hereM || m > (R.maxM[dest.rank] ?? 0) || dest.rank > 2) return;
          list.push({ d, rank: dest.rank, m });
        });
        if (list.length === 0) {
          skip('confirm: nothing worth listing');
          continue;
        }
        list.sort((u, v) => u.rank - v.rank || u.m - v.m);
        const pick = list.slice(0, 2);
        planned.push({
          purpose: 'confirm',
          style: 'side',
          color: signColor(road),
          padId: p,
          roadId: road.id,
          roadName: road.name,
          roadKind: road.kind,
          lanes: road.lanes,
          s: sp0.s,
          dir: e.dir,
          dM: used,
          padHeading: Math.atan2(sp0.hz, sp0.hx),
          x: sp0.x,
          z: sp0.z,
          hx: sp0.hx,
          hz: sp0.hz,
          sx: sp0.sx,
          sz: sp0.sz,
          fx: sp0.fx,
          fz: sp0.fz,
          sideOk: true,
          rows: pick.map((c) => ({ en: destinations[c.d].en, bn: destinations[c.d].bn, km: c.m / 1000, arrow: 'ahead' as SignArrow })),
        });
      }
    }
  }

  // ---- spacing rules for boards on the same road and the same driving direction
  const keep: boolean[] = planned.map(() => true);
  const groups = new Map<string, number[]>();
  planned.forEach((q, i) => {
    const key = `${q.roadId}:${q.dir}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  const gap = (u: Omit<PlannedSign, 'id' | 'board' | 'face'>, v: Omit<PlannedSign, 'id' | 'board' | 'face'>): number => {
    const r = roadById.get(u.roadId)!;
    const raw = Math.abs(u.s - v.s);
    return r.closed ? Math.min(raw, r.length - raw) : raw;
  };
  for (const g of groups.values()) {
    for (let x = 0; x < g.length; x++) {
      for (let y = x + 1; y < g.length; y++) {
        const u = planned[g[x]];
        const v = planned[g[y]];
        if (!keep[g[x]] || !keep[g[y]]) continue;
        const dist = gap(u, v);
        if (u.style !== v.style && dist < R.mixedGapM) {
          // an overhead and a side board too close: the side board goes
          const sideIdx = u.style === 'side' ? g[x] : g[y];
          keep[sideIdx] = false;
          skip('dropped: side board within 400 m of an overhead board');
        } else if (u.purpose !== v.purpose && dist < R.sameGapM) {
          keep[u.purpose === 'confirm' ? g[x] : g[y]] = false; // the confirm board gives way
          skip('dropped: confirm board too close to an advance board');
        } else if (u.purpose === 'confirm' && v.purpose === 'confirm' && dist < R.sameGapM) {
          keep[g[y]] = false;
          skip('dropped: two confirm boards too close');
        }
      }
    }
  }
  const signs: PlannedSign[] = [];
  planned.forEach((q, i) => {
    if (keep[i]) signs.push({ ...q, id: signs.length, board: -1, face: 'front' });
  });

  // ---- STEP 7: double-sided boards
  const boards = pairSigns(net, roadById, signs, skip);
  const pairs = boards.filter((b) => b.back).length;

  // ---- summary
  const count = (f: (q: PlannedSign) => boolean): number => signs.filter(f).length;
  const rowsHist = [1, 2, 3, 4].map((n) => `${n}:${count((q) => q.rows.length === n)}`).join(' ');
  const summary =
    `Step 3 plan: ${signs.length} faces, one per driving direction (advance ${count((q) => q.purpose === 'advance')}, confirm ${count((q) => q.purpose === 'confirm')}; ` +
    `overhead ${count((q) => q.style === 'overhead')}, side ${count((q) => q.style === 'side')}; green ${count((q) => q.color === 'green')}, blue ${count((q) => q.color === 'blue')}); ` +
    `rows per board ${rowsHist}; ${pads.filter((_, p) => arms[p].length >= R.minArms).length} junctions with boards (${virtual.length} virtual); ` +
    `Step 7: ${boards.length} boards for ${signs.length} faces (${pairs} double-sided, ${boards.length - pairs} single-sided; gantry ${boards.filter((b) => b.style === 'overhead').length}, side ${boards.filter((b) => b.style === 'side').length})`;
  return { signs, boards, pairs, skipped, sameArrowBoards, summary, pads, virtualPads: virtual.length };
}
