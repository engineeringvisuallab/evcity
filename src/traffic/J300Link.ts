// STEP J10 (2026-11-25): AI paths through the 300 ft junction (Type B, B2, Option A): R6 / R4 arms -> roundabout deck -> arms or the 4 ramps to the ring M8.
// PURE MATH (no three.js, no physics). Built from the REAL J300 data (J300Geometry legs / arms / circle, J300Ramps rows), nothing invented:
//   inbound legs : R6, R4 (arm rows far end -> circle, lane = the entry carriageway centre of the leg), Ei / Wi (ramp rows ring -> circle, reversed)
//   roundabout   : clockwise (left-hand traffic), outer circulating lane (centre r 59.125), r blends 62 -> 59.125 -> 62 at the yield / leave points
//   outbound legs: R6, R4 (leg exit centre then arm rows to the far end), Eo / Wo (ramp rows circle -> ring edge)
// The arms are NOT game roads: their far ends are the ends of the game roads R6-7 / R4-9 (join check: gap 0.00 m). A car of R6-7 / R4-9 that comes to that end
// takes one of the movements (forced); a ring car takes the ramp Ei / Wi with a chance. U-turns on the circle and ring->ring through moves are NOT built.
// Local frame (J300_FRAME): u along the ring, v = LEFT of u, origin = roundabout centre. world = O + u * eu + v * ev with eu = (cos yaw, sin yaw), ev = (sin yaw, -cos yaw).
import type { RoadSpec } from '../roads';
import { J300_ARMS, J300_CIRCLE, J300_FRAME, J300_LEGS } from '../roads/junction/J300Geometry';
import { J300_RAMPS } from '../roads/junction/J300Ramps';
import { j300Active } from '../roads/junction/J300Switch';
import { footOnRoad, resample, type Piece, type RteAnchor } from './RteLink';

export type J300MoveId = 'R6>R4' | 'R6>Eo' | 'R6>Wo' | 'R4>R6' | 'R4>Eo' | 'R4>Wo' | 'Ei>R6' | 'Ei>R4' | 'Wi>R6' | 'Wi>R4';
export interface J300Pt { x: number; z: number; y: number; /** design speed (m/s) at this point, the car takes min(this, its own cruise) */ v: number }
export interface J300Move {
  id: J300MoveId;
  from: RteAnchor;
  to: RteAnchor;
  /** the way, travel order, ~5 m apart, finished levels, lane already applied */
  pts: J300Pt[];
  /** 'forced' = every car of the arm road that comes to its end (R6-7 / R4-9 end at the arm far end), 'exit' = a ring car takes the ramp with a chance */
  chance: 'forced' | 'exit';
  length: number;
  /** index of the first point on the circle edge (the yield line) and of the last (the leave point) */
  iYield: number;
  iLeave: number;
  /** circle sweep in degrees (clockwise) and the angle where the car comes in */
  sweepDeg: number;
}

interface Raw { xs: number[]; zs: number[]; ys: number[] }
interface Leg { id: string; kind: string; entry?: { phiDeg: number; yield: number[]; centre: number[][] }; exit?: { phiDeg: number; leave: number[]; centre: number[][] } }
interface Arm { oldName: string; rows: { s: number; x: number; z: number; y: number }[] }

const F = J300_FRAME;
const EU: [number, number] = [Math.cos(F.yaw), Math.sin(F.yaw)];
const EV: [number, number] = [Math.sin(F.yaw), -Math.cos(F.yaw)];
const toWorld = (u: number, v: number): [number, number] => [F.ox + u * EU[0] + v * EV[0], F.oz + u * EU[1] + v * EV[1]];
const toLocal = (x: number, z: number): [number, number] => [(x - F.ox) * EU[0] + (z - F.oz) * EU[1], (x - F.ox) * EV[0] + (z - F.oz) * EV[1]];

const LEGS = J300_LEGS as unknown as Leg[];
const ARMS = J300_ARMS as unknown as Record<string, Arm>;
const RAMPS = J300_RAMPS as unknown as { id: string; rows: number[][] }[];
const CIRCLE = J300_CIRCLE as unknown as { deckY: number; laneCentres: number[] };

/** design speeds (m/s): free arm 22, ramp 13, roundabout 8 (about 30 km/h); braking over 80 m before the yield line, accelerating over 60 m after the leave point */
export const J300_SPEED = { arm: 22, ramp: 13, circle: 8, brake: 80, accel: 60 } as const;
const R_OUT = 62;                                   // circle outer edge (yield / leave points lie on it)
const R_LANE = CIRCLE.laneCentres[2];              // outer lane (left lane of a clockwise circle): 59.125
const BLEND = 25;                                   // m of arc over which r goes 62 -> 59.125 and back

const mod360 = (a: number): number => ((a % 360) + 360) % 360;
const smooth = (t: number): number => { const q = Math.min(1, Math.max(0, t)); return q * q * (3 - 2 * q); };

function push(out: Raw, x: number, z: number, y: number): void {
  const n = out.xs.length;
  if (n > 0 && Math.hypot(x - out.xs[n - 1], z - out.zs[n - 1]) < 0.3) return;   // pieces share their end point
  out.xs.push(x); out.zs.push(z); out.ys.push(y);
}

/** level of the arm centre line at the foot point of (x, z) (clamped to the arm: the deck level on the circle) */
function armY(arm: Arm, x: number, z: number): number {
  const r = arm.rows;
  let best = Infinity, y = r[0].y;
  for (let i = 0; i + 1 < r.length; i++) {
    const vx = r[i + 1].x - r[i].x, vz = r[i + 1].z - r[i].z, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - r[i].x) * vx + (z - r[i].z) * vz) / l2)), d = Math.hypot(x - (r[i].x + t * vx), z - (r[i].z + t * vz));
    if (d < best) { best = d; y = r[i].y + (r[i + 1].y - r[i].y) * t; }
  }
  return y;
}

/** the arm centre line shifted `lat` m to the LEFT of the travel direction, rows `idx` in travel order (inbound = far end first) */
function armLine(arm: Arm, idx: number[], inbound: boolean, lat: number, out: Raw): void {
  const r = arm.rows, n = r.length;
  for (const i of idx) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = r[b].x - r[a].x, tz = r[b].z - r[a].z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;   // outward tangent
    const hx = inbound ? -tx : tx, hz = inbound ? -tz : tz;                                              // travel heading
    push(out, r[i].x + hz * lat, r[i].z - hx * lat, r[i].y);                                             // left of heading = (hz, -hx)
  }
}

interface LegPiece { raw: Raw; phi: number; kind: 'arm' | 'ramp'; road: string; /** travel heading (local degrees) at the circle end of the piece (yield point for an entry, leave point for an exit) */ head: number }

function inPiece(id: 'R6' | 'R4' | 'Ei' | 'Wi'): LegPiece | null {
  const out: Raw = { xs: [], zs: [], ys: [] };
  if (id === 'R6' || id === 'R4') {
    const arm = ARMS[id], leg = LEGS.find((q) => q.id === id);
    if (!arm || !leg?.entry) return null;
    const sign = Math.sign(leg.entry.centre[0][1]) || 1, lat = Math.abs(leg.entry.centre[0][0]);   // first entry row (u, +-200): lane offset 5.5 / 5.65 m
    const loc = arm.rows.map((q) => toLocal(q.x, q.z));
    let jIn = loc.findIndex((p) => p[1] * sign >= 200);
    if (jIn < 0) jIn = arm.rows.length - 1;
    const idx: number[] = []; for (let i = arm.rows.length - 1; i >= jIn; i--) idx.push(i);
    armLine(arm, idx, true, lat, out);
    for (const c of leg.entry.centre) { const [x, z] = toWorld(c[0], c[1]); push(out, x, z, armY(arm, x, z)); }
    return { raw: out, phi: leg.entry.phiDeg, kind: 'arm', road: arm.oldName, head: leg.entry.centre[leg.entry.centre.length - 1][2] };
  }
  const rid = id === 'Ei' ? 'E-in' : 'W-in', ramp = RAMPS.find((q) => q.id === rid), leg = LEGS.find((q) => q.id === rid);
  if (!ramp || !leg?.entry) return null;
  for (let i = ramp.rows.length - 1; i >= 0; i--) { const q = ramp.rows[i], [x, z] = toWorld(q[0], q[1]); push(out, x, z, q[4]); }
  return { raw: out, phi: leg.entry.phiDeg, kind: 'ramp', road: 'M8', head: leg.entry.centre[leg.entry.centre.length - 1][2] };
}

function outPiece(id: 'R6' | 'R4' | 'Eo' | 'Wo'): LegPiece | null {
  const out: Raw = { xs: [], zs: [], ys: [] };
  if (id === 'R6' || id === 'R4') {
    const arm = ARMS[id], leg = LEGS.find((q) => q.id === id);
    if (!arm || !leg?.exit) return null;
    const last = leg.exit.centre[leg.exit.centre.length - 1], sign = Math.sign(last[1]) || 1, lat = Math.abs(last[0]);
    for (const c of leg.exit.centre) { if (Math.abs(c[1]) > 200.5) break; const [x, z] = toWorld(c[0], c[1]); push(out, x, z, armY(arm, x, z)); }   // straight rows only to |v| 200 (the arm bends after that)
    const loc = arm.rows.map((q) => toLocal(q.x, q.z));
    let j0 = loc.findIndex((p) => p[1] * sign > 200.5);
    if (j0 < 0) j0 = arm.rows.length - 1;
    const idx: number[] = []; for (let i = j0; i < arm.rows.length; i++) idx.push(i);
    armLine(arm, idx, false, lat, out);
    return { raw: out, phi: leg.exit.phiDeg, kind: 'arm', road: arm.oldName, head: leg.exit.centre[0][2] };
  }
  const rid = id === 'Eo' ? 'E-out' : 'W-out', ramp = RAMPS.find((q) => q.id === rid), leg = LEGS.find((q) => q.id === rid);
  if (!ramp || !leg?.exit) return null;
  for (const q of ramp.rows) { const [x, z] = toWorld(q[0], q[1]); push(out, x, z, q[4]); }
  return { raw: out, phi: leg.exit.phiDeg, kind: 'ramp', road: 'M8', head: leg.exit.centre[0][2] };
}

const headVec = (alphaDeg: number): [number, number] => { const a = (alphaDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return [c * EU[0] + sn * EV[0], c * EU[1] + sn * EV[1]]; };

/** cubic Hermite from (P0, T0) to (P1, T1) (unit tangents), points every ~3 m, both end points excluded */
function hermite(p0: [number, number], t0: [number, number], p1: [number, number], t1: [number, number], out: Raw): void {
  const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(2, Math.round(chord / 3));
  for (let k = 1; k < n; k++) {
    const u = k / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    push(out, h00 * p0[0] + h10 * chord * t0[0] + h01 * p1[0] + h11 * chord * t1[0], h00 * p0[1] + h10 * chord * t0[1] + h01 * p1[1] + h11 * chord * t1[1], CIRCLE.deckY);
  }
}
const circPt = (r: number, thDeg: number): [number, number] => { const th = (thDeg * Math.PI) / 180; return toWorld(r * Math.cos(th), r * Math.sin(th)); };
const SHORT = 60;     // deg: a sweep up to this is ONE Hermite from the yield point to the leave point (the designed legs are nearly tangent there)
const LEAD = 14;      // m: the Hermite that turns the entry heading (30 deg off the circle tangent) onto the outer lane

/** clockwise way on the outer circulating lane from the yield point (angle phiIn, heading headIn) to the leave point (angle phiOut, heading headOut), degrees in the local frame */
function circle(phiIn: number, headIn: number, phiOut: number, headOut: number, out: Raw): number {
  const sweep = mod360(phiIn - phiOut);
  const pIn = circPt(R_OUT, phiIn), pOut = circPt(R_OUT, phiOut), tIn = headVec(headIn), tOut = headVec(headOut);
  push(out, pIn[0], pIn[1], CIRCLE.deckY);
  if (sweep <= SHORT) { hermite(pIn, tIn, pOut, tOut, out); push(out, pOut[0], pOut[1], CIRCLE.deckY); return sweep; }
  const S = (sweep * Math.PI * R_LANE) / 180, th1 = phiIn - (LEAD / R_LANE) * (180 / Math.PI), p1 = circPt(R_LANE, th1), t1 = headVec(th1 - 90);
  hermite(pIn, tIn, p1, t1, out); push(out, p1[0], p1[1], CIRCLE.deckY);
  const n = Math.max(2, Math.round((S - LEAD) / 3)), lb = Math.min(BLEND, (S - LEAD) / 2);
  for (let k = 1; k <= n; k++) {
    const s = LEAD + ((S - LEAD) * k) / n, th = phiIn - (sweep * s) / S;
    const r = R_LANE + (R_OUT - R_LANE) * (1 - smooth((S - s) / lb));
    const [x, z] = circPt(r, th);
    push(out, x, z, CIRCLE.deckY);
  }
  return sweep;
}

const IN_IDS = ['R6', 'R4', 'Ei', 'Wi'] as const;
const OUT_IDS = ['R6', 'R4', 'Eo', 'Wo'] as const;
type InId = (typeof IN_IDS)[number]; type OutId = (typeof OUT_IDS)[number];
/** the 10 movements: every entry to every exit except the U-turn on the same leg and the ring -> ring through moves */
const DEFS: { i: InId; o: OutId }[] = [
  { i: 'R6', o: 'R4' }, { i: 'R6', o: 'Eo' }, { i: 'R6', o: 'Wo' },
  { i: 'R4', o: 'R6' }, { i: 'R4', o: 'Eo' }, { i: 'R4', o: 'Wo' },
  { i: 'Ei', o: 'R6' }, { i: 'Ei', o: 'R4' },
  { i: 'Wi', o: 'R6' }, { i: 'Wi', o: 'R4' },
];

/** The movements that can be built from `roads` (empty while the J300 switch is OFF or a road is missing). */
export function buildJ300Moves(roads: readonly RoadSpec[]): J300Move[] {
  if (!j300Active()) return [];
  const byName = new Map<string, number>();
  roads.forEach((r, i) => { if (!byName.has(r.name)) byName.set(r.name, i); });
  const out: J300Move[] = [];
  for (const d of DEFS) {
    const a = inPiece(d.i), b = outPiece(d.o);
    if (!a || !b) continue;
    const fromId = byName.get(a.road), toId = byName.get(b.road);
    if (fromId === undefined || toId === undefined) continue;
    const raw: Raw = { xs: [], zs: [], ys: [] };
    for (let k = 0; k < a.raw.xs.length; k++) push(raw, a.raw.xs[k], a.raw.zs[k], a.raw.ys[k]);
    const nA = raw.xs.length;
    const cr: Raw = { xs: [], zs: [], ys: [] };
    const sweep = circle(a.phi, a.head, b.phi, b.head, cr);
    for (let k = 0; k < cr.xs.length; k++) push(raw, cr.xs[k], cr.zs[k], cr.ys[k]);
    const nB = raw.xs.length;
    for (let k = 0; k < b.raw.xs.length; k++) push(raw, b.raw.xs[k], b.raw.zs[k], b.raw.ys[k]);
    const pc: Piece = { xs: raw.xs, zs: raw.zs, ys: raw.ys, lat: raw.xs.map(() => 0) };
    const rp = resample(pc);
    const n = rp.length;
    if (n < 8) continue;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(rp[i].x - rp[i - 1].x, rp[i].z - rp[i - 1].z));
    const nearest = (x: number, z: number): number => { let bi = 0, bd = Infinity; for (let i = 0; i < n; i++) { const q = Math.hypot(rp[i].x - x, rp[i].z - z); if (q < bd) { bd = q; bi = i; } } return bi; };
    const iYield = nearest(raw.xs[nA - 1], raw.zs[nA - 1]), iLeave = nearest(raw.xs[nB - 1], raw.zs[nB - 1]);
    const vIn = a.kind === 'arm' ? J300_SPEED.arm : J300_SPEED.ramp, vOut = b.kind === 'arm' ? J300_SPEED.arm : J300_SPEED.ramp, vC = J300_SPEED.circle;
    const pts: J300Pt[] = rp.map((p, i) => {
      let v: number;
      if (i <= iYield) v = vC + (vIn - vC) * smooth((cum[iYield] - cum[i]) / J300_SPEED.brake);
      else if (i <= iLeave) v = vC;
      else v = vC + (vOut - vC) * smooth((cum[i] - cum[iLeave]) / J300_SPEED.accel);
      return { x: p.x, z: p.z, y: p.y, v };
    });
    const f0 = footOnRoad(roads[fromId], pts[0].x, pts[0].z), f1 = footOnRoad(roads[toId], pts[n - 1].x, pts[n - 1].z);
    const dirOf = (p: J300Pt, q: J300Pt, f: { tx: number; tz: number }): 1 | -1 => ((q.x - p.x) * f.tx + (q.z - p.z) * f.tz >= 0 ? 1 : -1);
    out.push({
      id: `${d.i}>${d.o}` as J300MoveId,
      from: { roadId: fromId, s: f0.s, dir: dirOf(pts[0], pts[Math.min(3, n - 1)], f0), dist: f0.dist },
      to: { roadId: toId, s: f1.s, dir: dirOf(pts[Math.max(0, n - 4)], pts[n - 1], f1), dist: f1.dist },
      pts, chance: a.kind === 'arm' ? 'forced' : 'exit', length: cum[n - 1], iYield, iLeave, sweepDeg: sweep,
    });
  }
  return out;
}

/** The junction as the AI sees it. Built once by RoadGraph (null there when the switch is OFF / not complete). */
export class J300Link {
  readonly moves: J300Move[];
  /** the game roads that end at the arm far ends (R6-7, R4-9) and the ring (M8) */
  readonly r6Road: number;
  readonly r4Road: number;
  readonly ringRoad: number;
  constructor(roads: readonly RoadSpec[]) {
    this.moves = buildJ300Moves(roads);
    this.r6Road = roads.findIndex((r) => r.name === ARMS.R6.oldName);
    this.r4Road = roads.findIndex((r) => r.name === ARMS.R4.oldName);
    this.ringRoad = roads.findIndex((r) => r.name === 'M8');
  }
  get complete(): boolean { return this.moves.length === DEFS.length; }
  /** the movements that leave the road at the same tip (arm end: 3, ring ramp: 2) */
  group(m: J300Move): J300Move[] {
    return this.moves.filter((q) => q.from.roadId === m.from.roadId && q.from.dir === m.from.dir && Math.abs(q.from.s - m.from.s) < 3 && q.id.slice(0, 2) === m.id.slice(0, 2));
  }
  /** the through movement of an arm group (R6 -> R4, R4 -> R6); null for a ring ramp */
  through(m: J300Move): J300Move | null {
    if (m.chance !== 'forced') return null;
    return this.group(m).find((q) => q.id === 'R6>R4' || q.id === 'R4>R6') ?? null;
  }
  /** a new car must not appear on R6-7 / R4-9 right before the arm end: every car there takes a movement at the end of its road */
  deadZone(roadId: number, s: number, dir: 1 | -1): boolean {
    if (roadId !== this.r6Road && roadId !== this.r4Road) return false;
    for (const m of this.moves) if (m.from.roadId === roadId && m.from.dir === dir && m.chance === 'forced' && (s - m.from.s) * dir > -8) return true;
    return false;
  }
}
