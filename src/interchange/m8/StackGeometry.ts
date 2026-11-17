// STEP 9.2 / J1: STACK (4 level) ramp centrelines + vertical profile + clearance check. Pure math, local frame (u along road A, v = left of u, LEFT-hand traffic).
// Road A stays on the ground (level 1). Road B is level 4 (20.7 m) over the crossing and falls to the ground at 4 %. 8 ramps = 2 shapes (left slip, right flyover) x 4 rotations.
import { DEG, Turtle, minRadius as pathMinR, pathLength, resample, rot90, crossings, type P2 } from '../Geometry2D';
import { DESIGN } from '../../roads/standards/Criteria';
import { stoppingSight } from '../Standards';
import { accelLength, decelLength, entryTaperLength, exitTaperLength, laneDropTaper, minRadius } from '../../roads/standards/Checks';
import { LEVEL_RISE } from './M8Designs';

export const LANE_OFF = 12; // centre of a carriageway from the road axis (outer lane), m
export const B_TOP = 3 * LEVEL_RISE; // road B over the crossing
export const B_FLAT = 110; // road B stays at full height this far each side of the centre (the ramps pass under it). Sweep (m8-stack-check): 85 m fails (R1 / R3 level-3 ramps come within 12.5 m of B pavement), 90 m is the minimum that passes, so 110 keeps 20 m margin
/** MEDIAN OPENING: the two carriageways of a road move apart by DELTA_F (full from the crossing out to U_FULL), then come back over a shift taper (lane-drop rule 0.62 W V per lane of shift).
 * The directional ramps run in the opened median, 6 m clear of the pavement edge. */
export const DELTA_F = 9.5;
export const U_FULL = 400;
export const SHIFT_LEN = laneDropTaper(DESIGN.ringSpeed) * (DELTA_F / DESIGN.laneWidth);
const sm = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Extra offset (m) of the carriageway centrelines at distance t (along the road) from the crossing. */
export const spread = (t: number): number => DELTA_F * (1 - sm((Math.abs(t) - U_FULL) / SHIFT_LEN));
/** Carriageway centre offset from the road axis at distance t. */
export const cOff = (t: number): number => LANE_OFF + spread(t);
/** Lateral centre of a ramp while it runs as the auxiliary lane beside its own carriageway: its near lane overlaps the pavement edge by 2.5 m (outer side: LANE_OFF + 9 + spread; median side: AUX_LAT + spread, the ramp lies in the opened median). */
export const AUX_LAT = LANE_OFF - 9;
export const RAMP_AUX = AUX_LAT + DELTA_F; // = 12.5 at full spread
export const RAMP_MED = 8.3; // ramp centre in the opened median (pavement edge 4.5 + DELTA_F = 14, minus 1.5 shoulder, minus 4.2 half ramp)
export const yB = (v: number): number => Math.max(0, B_TOP - DESIGN.maxGrade.motorway * Math.max(0, Math.abs(v) - B_FLAT));

export interface StackRamp {
  id: string;
  shape: 'left' | 'right';
  k: number;
  V: number;
  pts: P2[];
  ys: number[];
  cum: number[];
  length: number;
  source: 'A' | 'B';
  target: 'A' | 'B';
}

const roadY = (road: 'A' | 'B', p: P2): number => (road === 'A' ? 0 : yB(Math.abs(road === 'B' ? p.v : p.u)));

/** TERMINALS (lane level): the exit needs deceleration lane + taper, the entry acceleration lane + taper (Checks.ts, CRITERIA aDecel / aAccel). Ramp V60 from the road speed. */
export const RAMP_V = 60;
export const EXIT_NEED = decelLength(DESIGN.ringSpeed, RAMP_V) + exitTaperLength();
export const ENTRY_NEED = accelLength(DESIGN.ringSpeed, RAMP_V) + entryTaperLength();
const up10 = (x: number): number => Math.ceil(x / 10) * 10;
export const RUN_LEN = up10(EXIT_NEED); // straight run of the ramp beside its source road (diverge: taper + deceleration lane)
export const TAIL_LEN = up10(ENTRY_NEED); // run beside the target road (merge: acceleration lane + entry taper)

export function buildStack(P = { Rleft: 175, Rright: 175, run: RUN_LEN, tail: TAIL_LEN, plateauRight: 2 * LEVEL_RISE }): StackRamp[] {
  const out: StackRamp[] = [];
  for (let k = 0; k < 4; k++) {
    for (const shape of ['left', 'right'] as const) {
      const R = shape === 'left' ? P.Rleft : P.Rright;
      const V = 60;
      // k = 0: starts on A going +u. left: leaves the OUTER side and turns left into B+ (going +v), then runs as the outer auxiliary lane of B+.
      // right: leaves the opened MEDIAN (v = RAMP_MED) and turns right into B- (going -v), then runs in the median beside B- and converges to its inner auxiliary lane.
      const outer = LANE_OFF + 9 + DELTA_F; // outer auxiliary lane centre at full spread
      const startV = shape === 'left' ? outer : RAMP_AUX;
      const endU = shape === 'left' ? -outer : RAMP_AUX;
      const startU = endU - P.run - R; // a quarter arc moves u by +R for a left AND a right turn
      // the run follows the carriageway while it is still shifting back (beyond U_FULL), so the aux / diverge lane stays beside the pavement
      const runPts: P2[] = [];
      for (let d = 0; d < P.run - 1e-6; d += 8) {
        const u = startU + d, sp = spread(u);
        runPts.push({ u, v: shape === 'left' ? LANE_OFF + 9 + sp : AUX_LAT + sp });
      }
      const t = new Turtle(startU + P.run, startV, 0).arc(R, (shape === 'left' ? 1 : -1) * 90 * DEG);
      t.pts.unshift(...runPts);
      const arcEnd = t.pts[t.pts.length - 1];
      const dir = shape === 'left' ? 1 : -1; // tail runs along +v (left) or -v (right)
      const tail: P2[] = [];
      for (let d = 8; d <= P.tail + 1e-6; d += 8) {
        const v = arcEnd.v + dir * d;
        const sp = spread(v);
        tail.push({ u: shape === 'left' ? -(LANE_OFF + 9 + sp) : AUX_LAT + sp, v });
      }
      const base = resample([...t.pts, ...tail], 8);
      const pts = base.map((p) => rot90(p, k));
      const L = pathLength(pts);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v));
      const source: 'A' | 'B' = k % 2 === 0 ? 'A' : 'B';
      const target: 'A' | 'B' = source === 'A' ? 'B' : 'A';
      const y0 = roadY(source, pts[0]);
      const y1 = roadY(target, pts[pts.length - 1]);
      const g = DESIGN.maxGrade.ramp;
      // the two right-turn families run on different levels so they can cross each other: A -> B on level 2, B -> A on level 3
      const yp = shape === 'right' ? (source === 'A' ? LEVEL_RISE : P.plateauRight) : undefined;
      const ys = cum.map((s) => {
        const up = Math.min(y0 + g * s, y1 + g * (L - s));
        const lo = Math.max(y0 - g * s, y1 - g * (L - s));
        const lin = y0 + ((y1 - y0) * s) / L;
        return yp === undefined ? lin : Math.max(lo, Math.min(up, yp));
      });
      out.push({ id: `${shape[0].toUpperCase()}${k}`, shape, k, V, pts, ys, cum, length: L, source, target });
    }
  }
  return out;
}

export interface Conflict { a: string; b: string; u: number; v: number; ya: number; yb: number; gap: number }

/** Linear interpolation of an array at a FRACTIONAL index (crossings() returns fractional indices). */
const lerpAt = (a: readonly number[], f: number): number => {
  const i = Math.min(a.length - 2, Math.max(0, Math.floor(f)));
  return a[i] + (a[i + 1] - a[i]) * Math.min(1, Math.max(0, f - i));
};
const yAt = (r: StackRamp, f: number): number => lerpAt(r.ys, f);

/** Every 2D crossing of two ramps, and of a ramp with the 4 carriageway centrelines; the height gap must be >= clearance + deck (LEVEL_RISE). */
export function clearanceConflicts(ramps: StackRamp[], L = 800): Conflict[] {
  const roads: { id: string; pts: P2[]; y: (p: P2) => number }[] = [];
  for (const id of ['A+', 'A-', 'B+', 'B-']) {
    const pts: P2[] = [];
    for (let i = 0; i <= 400; i++) {
      const t = -L + (2 * L * i) / 400;
      const o = cOff(t) * (id[1] === '+' ? 1 : -1);
      pts.push(id[0] === 'A' ? { u: t, v: o } : { u: -o, v: t });
    }
    roads.push({ id, pts, y: id[0] === 'A' ? () => 0 : (p) => yB(p.v) });
  }
  const out: Conflict[] = [];
  const need = LEVEL_RISE;
  // ramp x road (skip its own source / target road near the join: those are merges, not crossings)
  for (const r of ramps) {
    for (const rd of roads) {
      for (const c of crossings(r.pts, rd.pts)) {
        const yr = yAt(r, c.ia), yd = rd.y({ u: c.u, v: c.v });
        const ownRoad = rd.id[0] === r.source || rd.id[0] === r.target;
        const sAt = lerpAt(r.cum, c.ia);
        const nearEnd = sAt < 60 || r.length - sAt < 60;
        if (ownRoad && nearEnd) continue;
        const gap = Math.abs(yr - yd);
        if (gap < need - 1e-6) out.push({ a: r.id, b: rd.id, u: c.u, v: c.v, ya: yr, yb: yd, gap });
      }
    }
  }
  for (let i = 0; i < ramps.length; i++) for (let j = i + 1; j < ramps.length; j++) {
    for (const c of crossings(ramps[i].pts, ramps[j].pts)) {
      const ya = yAt(ramps[i], c.ia), yb = yAt(ramps[j], c.ib);
      const gap = Math.abs(ya - yb);
      if (gap < need - 1e-6) out.push({ a: ramps[i].id, b: ramps[j].id, u: c.u, v: c.v, ya, yb, gap });
    }
  }
  return out;
}

/** The median opening check: a ramp must stay clear of the pavement of every carriageway (half pavement 7.3 + ramp half 4.2 + 1.0 m) unless it is at least a level above / below it.
 * Its own source road is skipped for the diverge run and its target road along the merge tail (auxiliary lane beside the pavement). */
export function medianConflicts(ramps: StackRamp[], tail = TAIL_LEN, run = RUN_LEN): { ramp: string; road: string; u: number; v: number; d: number }[] {
  const out: { ramp: string; road: string; u: number; v: number; d: number }[] = [];
  const need = 7.3 + 4.2 + 1.0;
  for (const r of ramps) {
    r.pts.forEach((p, i) => {
      for (const id of ['A+', 'A-', 'B+', 'B-']) {
        const t = id[0] === 'A' ? p.u : p.v;
        const sgn = id[1] === '+' ? 1 : -1;
        const c = cOff(t) * sgn;
        const d = id[0] === 'A' ? Math.abs(p.v - c) : Math.abs(p.u + c);
        const yRoad = id[0] === 'A' ? 0 : yB(p.v);
        if (Math.abs(r.ys[i] - yRoad) >= LEVEL_RISE) continue;
        const own = id[0] === r.source && r.cum[i] < run + 60;
        const ownT = id[0] === r.target && r.length - r.cum[i] < tail + 70; // + the last part of the arc, where the ramp converges on the auxiliary lane
        if (own || ownT) continue;
        if (d < need) out.push({ ramp: r.id, road: id, u: p.u, v: p.v, d });
      }
    });
  }
  return out;
}

export const rampMinRadius = (r: StackRamp): number => pathMinR(r.pts);
export const rampMaxGrade = (r: StackRamp): number => Math.max(...r.ys.slice(1).map((y, i) => Math.abs(y - r.ys[i]) / (r.cum[i + 1] - r.cum[i])));
export const rampRminLimit = (r: StackRamp): number => DESIGN.radiusMargin * minRadius(r.V);

/** Lane-level terminal check: the run before the arc (exit) and the tail after it (entry) must give the standard length. Returns what is available vs needed. */
export function terminalLengths(P = { run: RUN_LEN, tail: TAIL_LEN }): { exitHave: number; exitNeed: number; entryHave: number; entryNeed: number } {
  return { exitHave: P.run, exitNeed: EXIT_NEED, entryHave: P.tail, entryNeed: ENTRY_NEED };
}

// ---- lane-level gore spacing -------------------------------------------------------------------------------------------------------------------
/** Gore events per carriageway: where each ramp leaves its source carriageway (exit, ramp start) and joins its target one (entry, ramp end), as a coordinate along the road. */
export interface GoreEvent { ramp: string; carriageway: string; kind: 'exit' | 'entry'; s: number }
/** Carriageway id + the side the ramp lane sits on (outer / median), because gores on opposite sides of one carriageway do not weave. */
const cwOf = (road: 'A' | 'B', p: P2): string => {
  const lat = road === 'A' ? p.v : -p.u; // + = the + carriageway
  const t = road === 'A' ? p.u : p.v;
  const side = Math.abs(lat) > cOff(t) ? 'outer' : 'median';
  return `${road}${lat >= 0 ? '+' : '-'} ${side}`;
};
export function goreEvents(ramps: StackRamp[]): GoreEvent[] {
  const out: GoreEvent[] = [];
  for (const r of ramps) {
    const a = r.pts[0], b = r.pts[r.pts.length - 1];
    out.push({ ramp: r.id, carriageway: cwOf(r.source, a), kind: 'exit', s: r.source === 'A' ? a.u : a.v });
    out.push({ ramp: r.id, carriageway: cwOf(r.target, b), kind: 'entry', s: r.target === 'A' ? b.u : b.v });
  }
  return out;
}
/** Smallest distance between two gores on the same carriageway (minimum wanted: the stopping sight distance of the road speed). */
export function minGoreSpacing(ev: GoreEvent[]): { min: number; need: number; a: string; b: string } {
  const need = stoppingSight(DESIGN.ringSpeed);
  let min = Infinity, ea = '', eb = '';
  for (const cw of new Set(ev.map((e) => e.carriageway))) {
    const l = ev.filter((e) => e.carriageway === cw).sort((x, y) => x.s - y.s);
    for (let i = 1; i < l.length; i++) if (l[i].s - l[i - 1].s < min) { min = l[i].s - l[i - 1].s; ea = `${l[i - 1].ramp} ${l[i - 1].kind}`; eb = `${l[i].ramp} ${l[i].kind} (${cw})`; }
  }
  return { min, need, a: ea, b: eb };
}

// ---- structure take-off (piers, abutments, retaining walls) -----------------------------------------------------------------------------------
export const VIADUCT_FILL = 7.5; // m, same rule as RoadNetwork (a fill higher than this becomes a viaduct)
export const PIER_SPAN = 40; // m, ramp viaduct span
export const ABUT_FILL = 0.5; // m, below this the deck is on the ground
export interface RampTakeoff { id: string; atGrade: number; embankment: number; viaduct: number; piers: number; maxPierH: number; abutments: number; wallLen: number }
/** Splits each ramp by height above ground: embankment (0.5 .. 7.5 m) gets a retaining wall on both sides, viaduct (> 7.5 m) gets piers every PIER_SPAN (height = deck - STRUCT deck depth 2.2), every change gets an abutment. */
export function structureTakeoff(ramps: StackRamp[], deckDepth = 2.2): RampTakeoff[] {
  return ramps.map((r) => {
    let atGrade = 0, emb = 0, via = 0, abut = 0, maxH = 0, prev = 0;
    for (let i = 1; i < r.ys.length; i++) {
      const ds = r.cum[i] - r.cum[i - 1];
      const y = (r.ys[i] + r.ys[i - 1]) / 2;
      const cls = y <= ABUT_FILL ? 0 : y <= VIADUCT_FILL ? 1 : 2;
      if (cls === 0) atGrade += ds; else if (cls === 1) emb += ds; else { via += ds; maxH = Math.max(maxH, y - deckDepth); }
      if (i > 1 && cls !== prev && (cls === 2 || prev === 2)) abut++;
      prev = cls;
    }
    return { id: r.id, atGrade, embankment: emb, viaduct: via, piers: via > 0 ? Math.ceil(via / PIER_SPAN) - 1 : 0, maxPierH: maxH, abutments: abut, wallLen: 2 * emb };
  });
}
