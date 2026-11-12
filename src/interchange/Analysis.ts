// JUNCTION ANALYSIS (engineering + teaching). Pure module (no three.js, no game state): the same input always gives the same answer.
//
// Question it answers: "for THIS road junction, which solutions are possible, how well does each one work, what does it cost, and WHY?"
// Candidates: at-grade signal, roundabout, diamond (cross road under / over), partial cloverleaf, cloverleaf.
// Every candidate gets: hard RULES (fail / warn, with the reason), CAPACITY (v/c, delay, LOS), SAFETY (conflict points counted from the topology),
// GEOMETRY (ramps, land envelope, cut/fill, structures), COST (unit-rate index), a SCORE (weights editable) and a LESSON (en + bn) for the student.
//
// Honest limits: planning-level numbers. Every constant is in ASSUMPTIONS / UNIT_COSTS / DEFAULT_WEIGHTS so it can be audited and replaced by the
// project's own standard. Formulas: Webster optimum cycle + HCM-style signal delay, HCM 6th single/two-lane roundabout entry capacity, AASHTO-style
// ramp checks (Standards.ts). Conflict points follow the textbook enumeration (T junction 9, 4-leg 32, roundabout 8).

import { buildInterchange } from './Builder';
import { smoothstep01 } from './Geometry2D';
import { INTERCHANGE_DEFAULTS, type InterchangeModel, type InterchangeSpec, type Ramp, type RoadSection } from './InterchangeTypes';
import { CRITERIA } from './Standards';

// ---------------------------------------------------------------- input
/** Peak-hour flow (veh/h) of one approach. Game drives on the LEFT: `left` = the easy turn (slip), `right` = the turn across the opposing traffic (loop). */
export interface Movement {
  thru: number;
  left: number;
  right: number;
}
/** `approaches` are in CIRCULATION order (clockwise seen from above, the way a left-hand-traffic roundabout turns): [0] main forward, [1] next leg, [2] main backward, [3] the other cross leg. */
export interface Demand {
  approaches: Movement[];
}
export interface Site {
  x: number;
  z: number;
  /** Height (m) of the main road at the crossing. */
  y: number;
  /** World heading (rad) of the main road at the centre. */
  yaw: number;
  ground?: (x: number, z: number) => number;
  /** Finished height (m) of the main road at signed distance u (m) from the centre, along the main road. Default: flat at y. */
  mainY?: (u: number) => number;
  /** Height (m) of the existing cross road at signed ARC distance v (m) from the centre along the cross road's real alignment (v < 0 one leg, v > 0 the other). Default: flat at y. */
  crossY?: (v: number) => number;
  /** Ground height (m) under the cross road's real alignment at arc distance v. Default: the ground straight along the cross axis. */
  crossGround?: (v: number) => number;
  /** Distance (m) to the nearest other junction / interchange along the main road (for the spacing rule). */
  nearestJunctionM?: number;
}
export interface JunctionContext {
  id: string;
  main: RoadSection;
  cross: RoadSection;
  mainShoulder: number;
  crossShoulder: number;
  /** Max grade (m/m) the main road may have. */
  mainMaxGrade: number;
  /** The main road is access controlled (freeway / expressway): no at-grade crossing allowed. Default: design speed >= 90 km/h. */
  accessControlled?: boolean;
  demand: Demand;
  site: Site;
  assumptions?: Partial<Assumptions>;
  costs?: Partial<UnitCosts>;
  weights?: Partial<Weights>;
}

export interface Assumptions {
  satFlow: number; // veh/h/lane, signal saturation flow (HCM base 1900)
  lostPerPhase: number; // s
  cycleMin: number;
  cycleMax: number;
  rightEq: number; // passenger-car equivalent of the right (opposed) turn at a signal
  laneCap: number; // veh/h/lane, freeway lane (planning value at 100 km/h)
  laneShare: number; // share of one direction's freeway flow in the kerb lane at a ramp
  rampCap: { slip: number; diamond: number; loop: number }; // veh/h, one-lane ramp
  crossLaneCap: number; // veh/h/lane at a merge on the (collector) cross road
  minInterchangeSpacing: number; // m
  maxCut: number; // m: above this a ramp / road is not buildable here
  maxFill: number;
  warnCut: number;
  warnFill: number;
  sideSlope: number; // H per 1 V
  wallFromH: number; // m: deeper than this the cut / fill uses a retaining wall instead of a slope
  crossGradeMax: number; // m/m, cross road in an underpass
  atGradeSpeedMax: number; // km/h: above this no roundabout / signal on the main road
}
export const ASSUMPTIONS: Readonly<Assumptions> = {
  satFlow: 1900,
  lostPerPhase: 4,
  cycleMin: 40,
  cycleMax: 120,
  rightEq: 1.5,
  laneCap: 2200,
  laneShare: 0.45,
  rampCap: { slip: 1900, diamond: 1900, loop: 1200 },
  crossLaneCap: 1800,
  minInterchangeSpacing: 1000,
  maxCut: 30,
  maxFill: 20,
  warnCut: 15,
  warnFill: 12,
  sideSlope: 2,
  wallFromH: 6,
  crossGradeMax: 0.06,
  atGradeSpeedMax: 70,
};

/** Arbitrary currency units: only the RATIOS matter. */
export interface UnitCosts {
  earthwork: number; // per m3 (cut or fill)
  pavement: number; // per m2 of ramp / road surface
  bridge: number; // per m2 of deck
  wall: number; // per m2 of retaining wall face
  land: number; // per m2 of land envelope
  signal: number; // per signalised intersection
  roundabout: number; // per m2 of roundabout (island + circulating road)
}
export const UNIT_COSTS: Readonly<UnitCosts> = { earthwork: 6, pavement: 40, bridge: 450, wall: 300, land: 1, signal: 60000, roundabout: 90 };

export interface Weights {
  capacity: number;
  safety: number;
  cost: number;
  land: number;
  buildability: number;
}
export const DEFAULT_WEIGHTS: Readonly<Weights> = { capacity: 0.3, safety: 0.25, cost: 0.2, land: 0.1, buildability: 0.15 };

// ---------------------------------------------------------------- output
export type SolutionId = 'signal' | 'roundabout' | 'diamond-under' | 'diamond-over' | 'parclo' | 'cloverleaf';
export type LOS = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export interface Note {
  level: 'fail' | 'warn' | 'info';
  code: string;
  en: string;
  bn: string;
}
export interface Evaluation {
  id: SolutionId;
  label: { en: string; bn: string };
  feasible: boolean;
  notes: Note[];
  capacity: { vc: number; critical: string; los: LOS; delaySec: number | null };
  safety: { crossing: number; merge: number; diverge: number; total: number; atGradeCrossing: boolean };
  geometry: { rampKm: number; landHa: number; cutM3: number; fillM3: number; deckM2: number; wallM2: number; maxCut: number; maxFill: number; weaveMin: number | null } | null;
  cost: { total: number; parts: Record<string, number> };
  unserved: { flow: number; share: number; list: string[] };
  scores: Weights & { total: number };
  rank: number | null;
  teach: { en: string[]; bn: string[] };
  model: InterchangeModel | null;
}
export interface Analysis {
  id: string;
  evaluations: Evaluation[];
  /** Feasible ones first, by score. */
  ranking: SolutionId[];
  demandTotal: number;
  notes: Note[];
}

// ---------------------------------------------------------------- formulas (small, public, tested)
export const losSignal = (d: number): LOS => (d <= 10 ? 'A' : d <= 20 ? 'B' : d <= 35 ? 'C' : d <= 55 ? 'D' : d <= 80 ? 'E' : 'F');
export const losUnsignal = (d: number): LOS => (d <= 10 ? 'A' : d <= 15 ? 'B' : d <= 25 ? 'C' : d <= 35 ? 'D' : d <= 50 ? 'E' : 'F');
export const losVc = (x: number): LOS => (x <= 0.3 ? 'A' : x <= 0.5 ? 'B' : x <= 0.7 ? 'C' : x <= 0.85 ? 'D' : x <= 1 ? 'E' : 'F');

export interface Phase {
  /** Critical flow per lane (veh/h/lane) of the phase. */
  flowPerLane: number;
  lanes: number;
  /** Total flow served (veh/h), only for the delay average. */
  vol: number;
}
/** Fixed-time signal: Webster optimum cycle C = (1.5 L + 5) / (1 - Y), HCM-style delay d = d1 + d2 (uniform + incremental), T = 0.25 h. */
export function signalAnalysis(phases: readonly Phase[], A: Assumptions = ASSUMPTIONS): { Y: number; C: number; X: number; delay: number; los: LOS } {
  const s = A.satFlow;
  const L = phases.length * A.lostPerPhase;
  const y = phases.map((p) => p.flowPerLane / s);
  const Y = y.reduce((a, b) => a + b, 0);
  const C = Y >= 0.95 ? A.cycleMax : Math.min(A.cycleMax, Math.max(A.cycleMin, (1.5 * L + 5) / (1 - Y)));
  const X = (Y * C) / Math.max(1, C - L);
  let num = 0;
  let den = 0;
  phases.forEach((p, i) => {
    const g = Y > 0 ? ((C - L) * y[i]) / Y : (C - L) / phases.length;
    const lam = g / C;
    const cap = Math.max(1, s * p.lanes * lam);
    const d1 = (0.5 * C * (1 - lam) ** 2) / (1 - Math.min(1, X) * lam);
    const d2 = 900 * 0.25 * (X - 1 + Math.sqrt((X - 1) ** 2 + (8 * 0.5 * 1 * X) / (cap * 0.25)));
    num += (d1 + d2) * p.vol;
    den += p.vol;
  });
  const delay = den > 0 ? num / den : 0;
  return { Y, C, X, delay, los: losSignal(delay) };
}

/** HCM 6th roundabout entry capacity (veh/h) for the circulating flow vc: 1 lane 1380 e^(-1.0e-3 vc); 2 lanes 1420 e^(-0.85e-3 vc) + 1420 e^(-0.91e-3 vc). */
export function roundaboutEntryCap(vc: number, lanes: 1 | 2): number {
  return lanes === 1 ? 1380 * Math.exp(-1.0e-3 * vc) : 1420 * Math.exp(-0.85e-3 * vc) + 1420 * Math.exp(-0.91e-3 * vc);
}
/** HCM unsignalised / roundabout control delay (s/veh) for entry flow v and capacity c: 3600/c + 900T[(x-1) + sqrt((x-1)^2 + (3600/c) x / (450 T))] + 5 min(x,1). */
export function roundaboutDelay(v: number, c: number): number {
  const x = v / Math.max(1, c);
  const T = 0.25;
  return 3600 / c + 900 * T * (x - 1 + Math.sqrt((x - 1) ** 2 + ((3600 / c) * x) / (450 * T))) + 5 * Math.min(x, 1);
}
/** Circulating flow in front of the entry of leg i (circulation order, left-hand traffic): through + right of the previous leg, right of the leg before that. */
export function circulatingFlow(d: Demand, i: number): number {
  const n = d.approaches.length;
  const a = d.approaches;
  const p1 = a[(i + n - 1) % n];
  const p2 = a[(i + n - 2) % n];
  return p1.thru + p1.right + p2.right;
}

/** Conflict points by topology. A one-way ramp leg on a T: 4 points (1 crossing + merge/diverge split). Roundabout leg: 1 merge + 1 diverge. Conventional 4-leg: 32. */
export const CONFLICTS = {
  fourLeg: { crossing: 16, merge: 8, diverge: 8 },
  rampEnter: { crossing: 1, merge: 2, diverge: 1 },
  rampExit: { crossing: 1, merge: 1, diverge: 2 },
  roundaboutPerLeg: { crossing: 0, merge: 1, diverge: 1 },
};

// ---------------------------------------------------------------- helpers
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
const mv = (m: Movement): number => m.thru + m.left + m.right;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function convexHullArea(pts: Array<[number, number]>): number {
  if (pts.length < 3) return 0;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Array<[number, number]> = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Array<[number, number]> = [];
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  const h = [...lo.slice(0, -1), ...up.slice(0, -1)];
  let a = 0;
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i];
    const [x2, y2] = h[(i + 1) % h.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Earthwork of a strip road along a line: heights `y[i]` against ground `g[i]` every `step` m, width w (m). Returns cut / fill m3 and retaining wall face area. */
function corridorEarthwork(y: number[], g: number[], step: number, w: number, A: Assumptions): { cut: number; fill: number; wall: number; maxCut: number; maxFill: number } {
  let cut = 0;
  let fill = 0;
  let wall = 0;
  let maxCut = 0;
  let maxFill = 0;
  for (let i = 0; i < y.length; i++) {
    const d = y[i] - g[i];
    const h = Math.abs(d);
    if (h < 0.05) continue;
    const walled = h > A.wallFromH;
    const area = walled ? h * w : h * (w + A.sideSlope * h);
    if (d < 0) {
      cut += area * step;
      maxCut = Math.max(maxCut, h);
    } else {
      fill += area * step;
      maxFill = Math.max(maxFill, h);
    }
    if (walled) wall += 2 * h * step;
  }
  return { cut, fill, wall, maxCut, maxFill };
}

interface RampSet {
  ramps: Ramp[];
  model: InterchangeModel;
}

/** Which turns a ramp serves. Turn key `${approach}L` / `${approach}R`; exit leg e of (i, left) = i+1, of (i, right) = i-1 (circulation order). */
function rampServes(r: Ramp, n: number): string[] {
  const k = r.approach;
  if (r.role === 'slip') return [`${k}L`];
  if (r.role === 'loop') return [`${k}R`];
  if (r.role === 'diamondOff') return [`${k}L`, `${k}R`];
  if (r.role === 'diamondOn') {
    const e = (k + 2) % n;
    return [`${(e + n - 1) % n}L`, `${(e + 1) % n}R`];
  }
  return [];
}

/** Shortest weaving length (m) on the main / cross road: a merge followed (same carriageway, travel direction) by a diverge. */
function weaveLength(ramps: Ramp[]): number | null {
  let best: number | null = null;
  for (const road of ['main', 'cross'] as const) {
    const ev: Array<{ dir: number; s: number; kind: 'merge' | 'diverge' }> = [];
    for (const r of ramps) {
      for (const j of [r.from, r.to]) {
        if (j.road !== road || j.kind === 'terminal') continue;
        const dir = road === 'main' ? (j.v > 0 ? 1 : -1) : j.u < 0 ? 1 : -1;
        ev.push({ dir, s: dir * (road === 'main' ? j.u : j.v), kind: j.kind === 'merge' ? 'merge' : 'diverge' });
      }
    }
    for (const dir of [1, -1]) {
      const e = ev.filter((x) => x.dir === dir).sort((a, b) => a.s - b.s);
      for (let i = 0; i < e.length; i++) {
        if (e[i].kind !== 'merge') continue;
        for (let j = i + 1; j < e.length; j++) {
          if (e[j].kind === 'diverge') {
            const L = e[j].s - e[i].s;
            best = best === null ? L : Math.min(best, L);
            break;
          }
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- the analysis
const LABEL: Record<SolutionId, { en: string; bn: string }> = {
  signal: { en: 'At-grade signal', bn: 'সিগন্যালসহ সমতল মোড়' },
  roundabout: { en: 'Roundabout', bn: 'রাউন্ডঅ্যাবাউট' },
  'diamond-under': { en: 'Diamond (cross road in underpass)', bn: 'ডায়মন্ড (ক্রস রোড আন্ডারপাসে)' },
  'diamond-over': { en: 'Diamond (main road over)', bn: 'ডায়মন্ড (মেইন রোড উপরে)' },
  parclo: { en: 'Partial cloverleaf', bn: 'আংশিক ক্লোভারলিফ' },
  cloverleaf: { en: 'Cloverleaf', bn: 'ক্লোভারলিফ' },
};

export function analyzeJunction(ctx: JunctionContext): Analysis {
  const A: Assumptions = { ...ASSUMPTIONS, ...(ctx.assumptions ?? {}), rampCap: { ...ASSUMPTIONS.rampCap, ...(ctx.assumptions?.rampCap ?? {}) } };
  const U: UnitCosts = { ...UNIT_COSTS, ...(ctx.costs ?? {}) };
  const Wt: Weights = { ...DEFAULT_WEIGHTS, ...(ctx.weights ?? {}) };
  const dem = ctx.demand.approaches;
  const n = dem.length;
  const demandTotal = sum(dem.map(mv));
  const access = ctx.accessControlled ?? ctx.main.designKmh >= 90;
  const site = ctx.site;
  const flatY = (): number => site.y;
  const mainY = site.mainY ?? flatY;
  const crossY = site.crossY ?? flatY;
  const ground = site.ground ?? ((): number => site.y);
  const cy = Math.cos(site.yaw);
  const sy = Math.sin(site.yaw);
  const toWorld = (u: number, v: number): { x: number; z: number } => ({ x: site.x + u * cy + v * sy, z: site.z + u * sy - v * cy });
  const groundUV = (u: number, v: number): number => {
    const w = toWorld(u, v);
    return ground(w.x, w.z);
  };
  const P = INTERCHANGE_DEFAULTS;
  const rise = P.clearance + P.deckThickness;
  const mainW = 2 * (ctx.main.halfWidth + ctx.mainShoulder);
  const crossW = 2 * (ctx.cross.halfWidth + ctx.crossShoulder);
  const globalNotes: Note[] = [];
  if (n !== 4) globalNotes.push({ level: 'warn', code: 'legs', en: `${n}-leg junction: only 4-leg candidates are modelled (trumpet / T-junction solutions are planned).`, bn: `${n}-লেগ মোড়: এখন শুধু ৪-লেগ সমাধান মডেল করা আছে (ট্রাম্পেট/T-মোড় পরে)।` });

  const evals: Evaluation[] = [];
  const blank = (id: SolutionId): Evaluation => ({
    id,
    label: LABEL[id],
    feasible: true,
    notes: [],
    capacity: { vc: 0, critical: '', los: 'A', delaySec: null },
    safety: { crossing: 0, merge: 0, diverge: 0, total: 0, atGradeCrossing: false },
    geometry: null,
    cost: { total: 0, parts: {} },
    unserved: { flow: 0, share: 0, list: [] },
    scores: { capacity: 0, safety: 0, cost: 0, land: 0, buildability: 0, total: 0 },
    rank: null,
    teach: { en: [], bn: [] },
    model: null,
  });
  const fail = (e: Evaluation, code: string, en: string, bn: string): void => {
    e.feasible = false;
    e.notes.push({ level: 'fail', code, en, bn });
  };
  const warn = (e: Evaluation, code: string, en: string, bn: string): void => {
    e.notes.push({ level: 'warn', code, en, bn });
  };

  // ============ 1. at-grade signal ============
  {
    const e = blank('signal');
    const mainLanes = ctx.main.lanesPerDir;
    const crossLanes = ctx.cross.lanesPerDir;
    const eq = (m: Movement): number => m.thru + m.left + m.right * A.rightEq;
    const pm = Math.max(eq(dem[0]), eq(dem[2 % n])) / mainLanes;
    const pc = Math.max(eq(dem[1 % n]), eq(dem[3 % n])) / crossLanes;
    const volM = mv(dem[0]) + mv(dem[2 % n]);
    const volC = mv(dem[1 % n]) + mv(dem[3 % n]);
    const sg = signalAnalysis([{ flowPerLane: pm, lanes: mainLanes, vol: volM }, { flowPerLane: pc, lanes: crossLanes, vol: volC }], A);
    e.capacity = { vc: sg.X, critical: `signal, 2 phases: Y=${sg.Y.toFixed(2)}, cycle ${sg.C.toFixed(0)} s, X=${sg.X.toFixed(2)}`, los: sg.X > 1 ? 'F' : sg.los, delaySec: sg.delay };
    const ck = CONFLICTS.fourLeg;
    e.safety = { ...ck, total: ck.crossing + ck.merge + ck.diverge, atGradeCrossing: true };
    if (access) fail(e, 'access', `Main road is access controlled (${ctx.main.designKmh} km/h): no at-grade crossing / signal is allowed on it.`, `মেইন রোড access-controlled (${ctx.main.designKmh} km/h): এর ওপর সমতল ক্রসিং/সিগন্যাল চলে না।`);
    else if (ctx.main.designKmh > A.atGradeSpeedMax) warn(e, 'speed', `Design speed ${ctx.main.designKmh} km/h is high for a signal (sight distance, rear-end crashes).`, `Design speed ${ctx.main.designKmh} km/h সিগন্যালের জন্য বেশি (rear-end ঝুঁকি)।`);
    if (sg.X > 1) warn(e, 'oversat', `Oversaturated: X = ${sg.X.toFixed(2)} even at the longest cycle.`, `Oversaturated: সর্বোচ্চ cycle-এও X = ${sg.X.toFixed(2)}।`);
    const area = 2 * (ctx.main.halfWidth + 12) * 2 * (ctx.cross.halfWidth + 12);
    e.geometry = { rampKm: 0, landHa: area / 1e4, cutM3: 0, fillM3: 0, deckM2: 0, wallM2: 0, maxCut: 0, maxFill: 0, weaveMin: null };
    e.cost.parts = { signal: U.signal, pavement: area * U.pavement * 0.5, land: area * U.land };
    evals.push(e);
  }

  // ============ 2. roundabout ============
  {
    const e = blank('roundabout');
    const entryLanes = Math.min(2, Math.max(1, ctx.main.lanesPerDir)) as 1 | 2;
    let worstX = 0;
    let worstI = 0;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const v = mv(dem[i]);
      const vc = circulatingFlow(ctx.demand, i);
      const c = roundaboutEntryCap(vc, i % 2 === 0 ? entryLanes : (Math.min(2, ctx.cross.lanesPerDir) as 1 | 2));
      const x = v / c;
      if (x > worstX) {
        worstX = x;
        worstI = i;
      }
      num += roundaboutDelay(v, c) * v;
      den += v;
    }
    const delay = den > 0 ? num / den : 0;
    e.capacity = { vc: worstX, critical: `entry ${worstI}: v/c = ${worstX.toFixed(2)} (HCM 6th, ${entryLanes} lane)`, los: worstX > 1 ? 'F' : losUnsignal(delay), delaySec: delay };
    const pl = CONFLICTS.roundaboutPerLeg;
    e.safety = { crossing: 0, merge: pl.merge * n, diverge: pl.diverge * n, total: (pl.merge + pl.diverge) * n, atGradeCrossing: false };
    if (access || ctx.main.designKmh > A.atGradeSpeedMax) fail(e, 'speed', `Main road ${ctx.main.designKmh} km/h: a roundabout needs approach speeds of about ${A.atGradeSpeedMax} km/h or less.`, `মেইন রোড ${ctx.main.designKmh} km/h: roundabout-এ approach speed প্রায় ${A.atGradeSpeedMax} km/h বা কম লাগে।`);
    if (ctx.main.lanesPerDir > 2) fail(e, 'lanes', `${ctx.main.lanesPerDir} lanes per direction: more than the 2-lane entries a roundabout handles.`, `প্রতি দিকে ${ctx.main.lanesPerDir} lane: roundabout সর্বোচ্চ ২-lane entry সামলায়।`);
    if (worstX > 1) warn(e, 'oversat', `Entry ${worstI} is over capacity (v/c = ${worstX.toFixed(2)}).`, `Entry ${worstI} capacity-র বেশি (v/c = ${worstX.toFixed(2)})।`);
    const Rc = entryLanes === 1 ? 25 : 35; // outer radius (m)
    const area = Math.PI * (Rc + 12) ** 2;
    e.geometry = { rampKm: 0, landHa: area / 1e4, cutM3: 0, fillM3: 0, deckM2: 0, wallM2: 0, maxCut: 0, maxFill: 0, weaveMin: null };
    e.cost.parts = { roundabout: Math.PI * Rc * Rc * U.roundabout, pavement: area * U.pavement * 0.3, land: area * U.land };
    evals.push(e);
  }

  // ============ 3-6. grade separated ============
  const gradeSeparated = (id: SolutionId, pattern: 'diamond' | 'parclo' | 'cloverleaf', under: boolean): Evaluation => {
    const e = blank(id);
    const spec: InterchangeSpec = { id: ctx.id, pattern, x: site.x, z: site.z, y: site.y, yaw: site.yaw, main: ctx.main, cross: ctx.cross, upper: 'main' };
    const model = buildInterchange(spec, ground);
    e.model = model;
    const L = model.levels;
    const set: RampSet = { ramps: model.ramps, model };

    // ---- heights (the model assumes flat ground; correct them with the real main road profile) ----
    const adj: Array<{ r: Ramp; ys: number[] }> = set.ramps.map((r) => {
      let ys: number[];
      if (under) {
        // main road stays on its own profile; the cross road dips under it and climbs back at crossGradeMax
        const yEnd = (v: number): number => Math.min(crossUnder(v), crossY(v));
        const a = r.from;
        const b = r.to;
        const yA = a.road === 'main' ? mainY(a.u) : yEnd(a.v);
        const yB = b.road === 'main' ? mainY(b.u) : yEnd(b.v);
        const l = r.cum[r.cum.length - 1] || 1;
        ys = r.cum.map((c) => yA + (yB - yA) * smoothstep01(c / l));
      } else {
        ys = r.ys.map((y, i) => y - site.y + mainY(r.local[i].u));
      }
      return { r, ys };
    });
    function crossUnder(v: number): number {
      const flat = ctx.main.halfWidth + ctx.mainShoulder + 8;
      const yU = site.y - rise;
      const a = Math.abs(v);
      return a <= flat ? yU : yU + A.crossGradeMax * (a - flat);
    }

    // ---- ramps: length, cut / fill, elevated deck ----
    let rampM = 0;
    let cut = 0;
    let fill = 0;
    let wall = 0;
    let maxCut = 0;
    let maxFill = 0;
    let deck = 0;
    const pts: Array<[number, number]> = [];
    for (const { r, ys } of adj) {
      rampM += r.length;
      const g = r.local.map((p) => groundUV(p.u, p.v));
      const w = 2 * r.halfWidth + 1;
      const ew = corridorEarthwork(ys, g, 8, w, A);
      cut += ew.cut;
      fill += ew.fill;
      wall += ew.wall;
      maxCut = Math.max(maxCut, ew.maxCut);
      maxFill = Math.max(maxFill, ew.maxFill);
      for (let i = 0; i < ys.length; i++) {
        if (ys[i] - g[i] > P.pierFromH) deck += 8 * w;
        pts.push([r.local[i].u, r.local[i].v]);
      }
    }
    // ---- the crossing structure + the road that goes over / under ----
    if (under) {
      // main road stays; cross road trench along the cross axis
      // each side is followed until the road climbs out to the existing level ("daylight"); beyond that it keeps the existing alignment (no more earthwork)
      const vs: number[] = [];
      const yv: number[] = [];
      const gv: number[] = [];
      for (const side of [-1, 1]) {
        for (let a = 0; a <= 400; a += 8) {
          const v = side * a;
          const ex = site.crossY ? crossY(v) : site.crossGround ? site.crossGround(v) : groundUV(0, v);
          const yr = Math.min(crossUnder(v), ex);
          vs.push(v);
          yv.push(yr);
          gv.push(site.crossGround ? site.crossGround(v) : groundUV(0, v));
          if (a > 0 && yr >= ex - 0.3) break;
        }
      }
      const ew = corridorEarthwork(yv, gv, 8, crossW, A);
      cut += ew.cut;
      fill += ew.fill;
      wall += ew.wall;
      maxCut = Math.max(maxCut, ew.maxCut);
      maxFill = Math.max(maxFill, ew.maxFill);
      deck += mainW * (crossW + 6); // main road deck over the cross road
      // drainage: the underpass is a sag, it needs a pumped outfall
      e.notes.push({ level: 'info', code: 'sag', en: 'The underpass is a sag point: needs a drainage outfall (inlets, pump if the outfall is higher).', bn: 'আন্ডারপাস sag point: drainage outfall লাগবে (inlet, outfall উঁচু হলে pump)।' });
    } else {
      // main road is raised by `rise` and falls back with the model's smoothstep; grade = old grade + the rise slope
      const T = L.flat + L.rampLen;
      const ts: number[] = [];
      for (let t = -T; t <= T; t += 8) ts.push(t);
      const dY = (t: number): number => {
        const a = Math.abs(t);
        return a <= L.flat ? rise : a >= T ? 0 : rise * (1 - smoothstep01((a - L.flat) / L.rampLen));
      };
      const yv = ts.map((t) => mainY(t) + dY(t));
      const gv = ts.map((t) => groundUV(t, 0));
      const ew = corridorEarthwork(yv, gv, 8, mainW, A);
      fill += ew.fill;
      cut += ew.cut;
      wall += ew.wall;
      maxCut = Math.max(maxCut, ew.maxCut);
      maxFill = Math.max(maxFill, ew.maxFill);
      let gmax = 0;
      for (let i = 1; i < yv.length; i++) gmax = Math.max(gmax, Math.abs(yv[i] - yv[i - 1]) / 8);
      if (gmax > ctx.mainMaxGrade + 1e-6) fail(e, 'main-grade', `Raising the main road makes its grade ${(gmax * 100).toFixed(1)} % (> ${(ctx.mainMaxGrade * 100).toFixed(0)} % allowed): the road already climbs, the overpass rise comes on top.`, `মেইন রোড উঁচু করলে grade ${(gmax * 100).toFixed(1)} % (অনুমোদিত ${(ctx.mainMaxGrade * 100).toFixed(0)} %-এর বেশি): রাস্তা আগে থেকেই ঢালু, ওপরে overpass-এর rise যোগ হয়।`);
      deck += crossW * 40; // main-road bridge over the cross road
    }
    e.geometry = { rampKm: rampM / 1000, landHa: convexHullArea(pts) / 1e4, cutM3: cut, fillM3: fill, deckM2: deck, wallM2: wall, maxCut, maxFill, weaveMin: weaveLength(set.ramps) };
    if (maxCut > A.maxCut) fail(e, 'cut', `Cut up to ${maxCut.toFixed(0)} m (limit ${A.maxCut} m): the hill is in the way.`, `Cut ${maxCut.toFixed(0)} m পর্যন্ত (সীমা ${A.maxCut} m): পাহাড় বাধা।`);
    else if (maxCut > A.warnCut) warn(e, 'cut', `Deep cut ${maxCut.toFixed(0)} m: slopes / retaining walls needed.`, `গভীর cut ${maxCut.toFixed(0)} m: slope / retaining wall লাগবে।`);
    if (maxFill > A.maxFill) fail(e, 'fill', `Fill up to ${maxFill.toFixed(0)} m (limit ${A.maxFill} m).`, `Fill ${maxFill.toFixed(0)} m পর্যন্ত (সীমা ${A.maxFill} m)।`);
    else if (maxFill > A.warnFill) warn(e, 'fill', `High fill ${maxFill.toFixed(0)} m: embankment settlement and land take.`, `উঁচু fill ${maxFill.toFixed(0)} m: embankment settlement ও জমি।`);
    if (site.nearestJunctionM !== undefined && site.nearestJunctionM < A.minInterchangeSpacing) warn(e, 'spacing', `Next junction only ${site.nearestJunctionM.toFixed(0)} m away (guide: >= ${A.minInterchangeSpacing} m): weaving / signing conflict.`, `পরের মোড় মাত্র ${site.nearestJunctionM.toFixed(0)} m দূরে (গাইড: >= ${A.minInterchangeSpacing} m): weaving/signing সমস্যা।`);
    const wv = e.geometry.weaveMin;
    if (wv !== null && wv < CRITERIA.weaveMin) fail(e, 'weave', `Weaving length ${wv.toFixed(0)} m is below the absolute minimum ${CRITERIA.weaveMin} m (needs collector-distributor roads).`, `Weaving দৈর্ঘ্য ${wv.toFixed(0)} m, ন্যূনতম ${CRITERIA.weaveMin} m-এর কম (collector-distributor road লাগবে)।`);
    else if (wv !== null && wv < CRITERIA.weaveDesirable) warn(e, 'weave', `Weaving length ${wv.toFixed(0)} m is below the desirable ${CRITERIA.weaveDesirable} m.`, `Weaving দৈর্ঘ্য ${wv.toFixed(0)} m, কাম্য ${CRITERIA.weaveDesirable} m-এর কম।`);
    for (const is of model.issues) (is.level === 'error' ? fail : warn)(e, `model-${is.code}`, `Geometry check: ${is.message}`, `Geometry check: ${is.message}`);

    // ---- movement coverage + flows on the ramps ----
    const served = new Set<string>();
    const flowOf = new Map<string, number>();
    const turnFlow = (key: string): number => {
      const i = Number(key.slice(0, -1));
      return key.endsWith('L') ? dem[i].left : dem[i].right;
    };
    for (const r of set.ramps) {
      const keys = rampServes(r, n);
      keys.forEach((k) => served.add(k));
      flowOf.set(r.id, sum(keys.map(turnFlow)));
    }
    const all: string[] = [];
    for (let i = 0; i < n; i++) all.push(`${i}L`, `${i}R`);
    const lost = all.filter((k) => !served.has(k) && turnFlow(k) > 0);
    const lostFlow = sum(lost.map(turnFlow));
    e.unserved = { flow: lostFlow, share: demandTotal > 0 ? lostFlow / demandTotal : 0, list: lost };
    if (lost.length) {
      const msg = `Turns with no ramp: ${lost.join(', ')} (${lostFlow.toFixed(0)} veh/h, ${(100 * e.unserved.share).toFixed(0)} % of demand) must reroute.`;
      if (e.unserved.share > 0.05) fail(e, 'coverage', msg, `যে turn-এর ramp নেই: ${lost.join(', ')} (${lostFlow.toFixed(0)} veh/h, চাহিদার ${(100 * e.unserved.share).toFixed(0)} %) ঘুরে যেতে হবে।`);
      else warn(e, 'coverage', msg, `যে turn-এর ramp নেই: ${lost.join(', ')} (${lostFlow.toFixed(0)} veh/h)।`);
    }

    // ---- capacity: ramps, mainline lane, cross merge, diamond terminals ----
    let worst = { vc: 0, text: '' };
    const chk = (vc: number, text: string): void => {
      if (vc > worst.vc) worst = { vc, text };
    };
    for (const r of set.ramps) {
      const f = flowOf.get(r.id) ?? 0;
      chk(f / (r.role === 'loop' ? A.rampCap.loop : r.role === 'slip' ? A.rampCap.slip : A.rampCap.diamond), `ramp ${r.id}: ${f.toFixed(0)} veh/h`);
      if (r.from.kind === 'gore' && r.from.road === 'main') {
        const k = r.approach % 2 === 0 ? r.approach : r.approach;
        const mainDir = dem[k]?.thru ?? 0;
        chk((A.laneShare * (mainDir + f) + 0) / A.laneCap, `diverge ${r.id}: kerb lane ${(A.laneShare * (mainDir + f)).toFixed(0)} veh/h`);
      }
      if (r.to.kind === 'merge' && r.to.road === 'main') {
        const k = (r.approach + 2) % n;
        const mainDir = dem[k]?.thru ?? 0;
        chk((A.laneShare * mainDir + f) / A.laneCap, `merge ${r.id}: kerb lane ${(A.laneShare * mainDir + f).toFixed(0)} veh/h`);
      }
      if (r.to.kind === 'merge' && r.to.road === 'cross') {
        const k = (r.approach + 1) % n;
        chk((dem[k % n].thru + f) / (A.crossLaneCap * ctx.cross.lanesPerDir), `merge ${r.id} on the cross road: ${(dem[k % n].thru + f).toFixed(0)} veh/h`);
      }
    }
    let delay: number | null = null;
    let los: LOS = 'A';
    if (pattern === 'diamond') {
      // each terminal: ramp phase + cross road phase (2-phase signal)
      let wd = 0;
      let wv2 = 0;
      for (const k of [0, 2 % n]) {
        const off = dem[k].left + dem[k].right;
        const e2 = (k + 2) % n;
        const on = dem[(e2 + n - 1) % n].left + dem[(e2 + 1) % n].right;
        const crossThru = Math.max(dem[1 % n].thru, dem[3 % n].thru);
        const sg = signalAnalysis([{ flowPerLane: off + on, lanes: 1, vol: off + on }, { flowPerLane: (crossThru * 1) / ctx.cross.lanesPerDir, lanes: ctx.cross.lanesPerDir, vol: crossThru }], A);
        chk(sg.X, `terminal ${k === 0 ? 'A' : 'B'}: signal X = ${sg.X.toFixed(2)}, cycle ${sg.C.toFixed(0)} s`);
        wd += sg.delay * (off + on + crossThru);
        wv2 += off + on + crossThru;
      }
      delay = wv2 > 0 ? wd / wv2 : 0;
      los = worst.vc > 1 ? 'F' : losSignal(delay);
    } else {
      los = losVc(worst.vc);
    }
    e.capacity = { vc: worst.vc, critical: worst.text, los, delaySec: delay };
    if (worst.vc > 1) warn(e, 'oversat', `Over capacity at: ${worst.text}.`, `Capacity ছাড়িয়েছে: ${worst.text}।`);

    // ---- safety: topology ----
    let crossing = 0;
    let merge = 0;
    let diverge = 0;
    for (const r of set.ramps) {
      for (const j of [r.from, r.to]) {
        if (j.kind === 'gore') diverge++;
        else if (j.kind === 'merge') merge++;
        else {
          const t = j === r.from ? CONFLICTS.rampExit : CONFLICTS.rampEnter; // a ramp that starts at a terminal leaves the cross road (exit leg of the T)
          crossing += t.crossing;
          merge += t.merge;
          diverge += t.diverge;
        }
      }
    }
    e.safety = { crossing, merge, diverge, total: crossing + merge + diverge, atGradeCrossing: crossing > 0 };

    // ---- cost ----
    const rampArea = set.ramps.reduce((s, r) => s + r.length * (2 * r.halfWidth + 1), 0);
    e.cost.parts = {
      earthwork: (cut + fill) * U.earthwork,
      pavement: rampArea * U.pavement,
      bridge: deck * U.bridge,
      wall: wall * U.wall,
      land: (e.geometry.landHa * 1e4) * U.land,
      ...(pattern === 'diamond' ? { signal: 2 * U.signal } : {}),
    };
    return e;
  };
  evals.push(gradeSeparated('diamond-under', 'diamond', true));
  evals.push(gradeSeparated('diamond-over', 'diamond', false));
  evals.push(gradeSeparated('parclo', 'parclo', false));
  evals.push(gradeSeparated('cloverleaf', 'cloverleaf', false));

  // ---------------------------------------------------------------- totals, scores, ranking, lessons
  for (const e of evals) e.cost.total = sum(Object.values(e.cost.parts));
  const maxCost = Math.max(1, ...evals.map((e) => e.cost.total));
  const maxLand = Math.max(1e-6, ...evals.map((e) => e.geometry?.landHa ?? 0));
  for (const e of evals) {
    const warns = e.notes.filter((x) => x.level === 'warn').length;
    const s = {
      capacity: 100 * clamp01(1 - (e.capacity.vc - 0.6) / 0.6),
      safety: 100 * clamp01(1 - e.safety.total / 32),
      cost: 100 * clamp01(1 - e.cost.total / maxCost),
      land: 100 * clamp01(1 - (e.geometry?.landHa ?? 0) / maxLand),
      buildability: Math.max(0, 100 - 20 * warns),
    };
    const total = (s.capacity * Wt.capacity + s.safety * Wt.safety + s.cost * Wt.cost + s.land * Wt.land + s.buildability * Wt.buildability) / (Wt.capacity + Wt.safety + Wt.cost + Wt.land + Wt.buildability);
    e.scores = { ...s, total };
  }
  const feasible = evals.filter((e) => e.feasible).sort((a, b) => b.scores.total - a.scores.total);
  feasible.forEach((e, i) => (e.rank = i + 1));
  for (const e of evals) e.teach = lesson(e, A);
  const ordered = [...feasible, ...evals.filter((e) => !e.feasible).sort((a, b) => b.scores.total - a.scores.total)];
  return { id: ctx.id, evaluations: ordered, ranking: feasible.map((e) => e.id), demandTotal, notes: globalNotes };
}

// ---------------------------------------------------------------- lessons
const WHEN: Record<SolutionId, { en: string; bn: string }> = {
  signal: { en: 'Good when both roads are ordinary urban roads, speeds are low and volumes moderate. It is the cheapest, but every vehicle can still meet another at the crossing; a signal only separates them in TIME.', bn: 'দুই রাস্তাই সাধারণ শহুরে, speed কম, volume মাঝারি হলে ভালো। সবচেয়ে সস্তা, কিন্তু crossing-এ গাড়ি এখনও মুখোমুখি হতে পারে; signal শুধু সময়ে আলাদা করে।' },
  roundabout: { en: 'Good for low speeds and balanced flows on 1-2 lane roads: all conflicts become merging at low speed (8 points instead of 32). It fails on a high-speed multi-lane highway.', bn: '১-২ lane রাস্তায়, কম speed ও সুষম flow-তে ভালো: সব conflict কম speed-এর merge হয়ে যায় (৩২-এর জায়গায় ৮)। দ্রুতগতির বহু-lane highway-তে চলে না।' },
  'diamond-under': { en: 'The classic answer when a minor road crosses a major highway: the highway keeps its alignment, the minor road dips under it, ramps are short. Needs a drained sag and enough cut.', bn: 'ছোট রাস্তা বড় highway পার হলে ক্লাসিক সমাধান: highway-র alignment অপরিবর্তিত, ছোট রাস্তা নিচ দিয়ে যায়, ramp ছোট। drainage-সহ sag ও যথেষ্ট cut লাগে।' },
  'diamond-over': { en: 'Same ramps, but the highway is lifted. Cheaper only on flat ground; on a highway that already climbs the lift pushes the grade past the limit and needs a long embankment.', bn: 'একই ramp, কিন্তু highway উঁচু করা হয়। সমতলে শুধু সস্তা; আগে থেকে ঢালু highway-তে lift করলে grade সীমা পার হয়, লম্বা embankment লাগে।' },
  parclo: { en: 'Fewer ramps than a cloverleaf, with room kept free in two quadrants (river, hill). Check that every turning movement still has a ramp.', bn: 'cloverleaf-এর চেয়ে কম ramp, দুই quadrant ফাঁকা থাকে (নদী, পাহাড়)। প্রতিটি turn-এর ramp আছে কিনা দেখতে হবে।' },
  cloverleaf: { en: 'No at-grade conflict and no signal, but the biggest footprint, and loops that merge and diverge on the highway create weaving. Needs collector-distributor roads at high volumes.', bn: 'সমতল conflict বা signal নেই, কিন্তু জমি সবচেয়ে বেশি, আর loop-এর merge/diverge highway-তে weaving তৈরি করে। বেশি volume-এ collector-distributor road লাগে।' },
};

function lesson(e: Evaluation, A: Assumptions): { en: string[]; bn: string[] } {
  const en: string[] = [WHEN[e.id].en];
  const bn: string[] = [WHEN[e.id].bn];
  en.push(`Capacity: ${e.capacity.critical}; v/c ${e.capacity.vc.toFixed(2)}, LOS ${e.capacity.los}${e.capacity.delaySec !== null ? `, delay ${e.capacity.delaySec.toFixed(0)} s/veh` : ''}.`);
  bn.push(`Capacity: ${e.capacity.critical}; v/c ${e.capacity.vc.toFixed(2)}, LOS ${e.capacity.los}${e.capacity.delaySec !== null ? `, delay ${e.capacity.delaySec.toFixed(0)} s/veh` : ''}।`);
  const s = e.safety;
  en.push(`Conflict points: ${s.total} (crossing ${s.crossing}, merge ${s.merge}, diverge ${s.diverge}). Crossing conflicts are the severe ones (right-angle crashes).`);
  bn.push(`Conflict point: ${s.total} (crossing ${s.crossing}, merge ${s.merge}, diverge ${s.diverge})। Crossing conflict সবচেয়ে মারাত্মক (right-angle crash)।`);
  if (e.geometry && e.geometry.rampKm > 0) {
    const g = e.geometry;
    en.push(`Land envelope ${g.landHa.toFixed(1)} ha, ramps ${g.rampKm.toFixed(2)} km, cut ${(g.cutM3 / 1000).toFixed(0)}k m3 / fill ${(g.fillM3 / 1000).toFixed(0)}k m3, structures ${(g.deckM2 / 1000).toFixed(1)}k m2 deck.`);
    bn.push(`জমির envelope ${g.landHa.toFixed(1)} ha, ramp ${g.rampKm.toFixed(2)} km, cut ${(g.cutM3 / 1000).toFixed(0)}k m3 / fill ${(g.fillM3 / 1000).toFixed(0)}k m3, structure ${(g.deckM2 / 1000).toFixed(1)}k m2 deck।`);
  }
  en.push(`Cost index ${(e.cost.total / 1e6).toFixed(2)} M (unit rates are assumptions, compare ratios only).`);
  bn.push(`Cost index ${(e.cost.total / 1e6).toFixed(2)} M (unit rate ধারণা, শুধু অনুপাত তুলনা করুন)।`);
  for (const nt of e.notes) {
    en.push(`${nt.level === 'fail' ? 'NOT POSSIBLE' : nt.level === 'warn' ? 'Warning' : 'Note'}: ${nt.en}`);
    bn.push(`${nt.level === 'fail' ? 'সম্ভব নয়' : nt.level === 'warn' ? 'সতর্কতা' : 'নোট'}: ${nt.bn}`);
  }
  void A;
  return { en, bn };
}

/** Plain-text report (scripts, logs, a UI text panel). */
export function formatReport(a: Analysis, lang: 'en' | 'bn' = 'en'): string {
  const rows: string[] = [`Junction ${a.id}: demand ${a.demandTotal.toFixed(0)} veh/h`];
  rows.push('rank  solution                         feasible  v/c    LOS  conflicts  cost(M)  land(ha)  score');
  for (const e of a.evaluations) {
    rows.push(
      `${String(e.rank ?? '-').padEnd(5)} ${e.label.en.padEnd(32)} ${(e.feasible ? 'yes' : 'NO').padEnd(9)} ${e.capacity.vc.toFixed(2).padEnd(6)} ${e.capacity.los.padEnd(4)} ${String(e.safety.total).padEnd(10)} ${(e.cost.total / 1e6).toFixed(2).padEnd(8)} ${(e.geometry?.landHa ?? 0).toFixed(1).padEnd(9)} ${e.scores.total.toFixed(0)}`,
    );
  }
  for (const e of a.evaluations) {
    rows.push(`\n-- ${e.label[lang]} --`);
    for (const t of e.teach[lang]) rows.push('  ' + t);
  }
  return rows.join('\n');
}
