// 2026-11-23 (user: 'traffic AI set koro, connection gula finish koro'): AI paths through the RT-E interchange (ring M8 x arm J1-E, HANDOFF_JUNCTION_RTE.md).
// The four movements of the T (left-hand traffic), each built from the REAL data of the game, nothing invented:
//   M3  ring direction B -> stem outbound : tail RTE-TAIL-M3S + ramp bridge M3 (RteStructData) + tail RTE-TAIL-M3N   (right turn, flyover, 2 lanes)
//   M4  stem inbound -> ring direction B  : tail RTE-TAIL-M4G + ramp bridge M4 + tail RTE-TAIL-M4L                    (right turn, flyover, 2 lanes)
//   A2S ring direction A -> stem outbound : slip RTE-A2S                                                              (left turn, ground, 1 lane)
//   S2A stem inbound -> ring direction A  : slip RTE-S2A                                                              (left turn, ground, 1 lane)
// Directions: ring road M8, dir +1 = increasing station = direction B (far carriageway), dir -1 = direction A. Arm road J1-E runs from the J1 star (s 0) to the ring (s = length):
// dir +1 = towards the ring = 'stem inbound', dir -1 = away from the ring = 'stem outbound'. The numbers are CHECKED (scripts/rte-traffic-check.ts), not assumed.
// Pure math (no three.js, no physics): `buildRteMoves(roads)` reads the built RoadSpec list. Route.rteLink() follows a move; RoadGraph builds this once.
import type { RoadSpec } from '../roads';
import { RTE_RAMP_STRUCTS } from '../roads/junction/RteStructData';

export interface RtePt { x: number; z: number; y: number }
export type RteMoveId = 'M3' | 'M4' | 'A2S' | 'S2A';
export interface RteAnchor { roadId: number; s: number; dir: 1 | -1; /** distance (m) of the first / last path point from the main road centre line */ dist: number }
export interface RteMove {
  id: RteMoveId;
  /** where a car leaves the main road: s = foot point of the first path point (the tip of the exit lane), dir = travel direction on that road */
  from: RteAnchor;
  /** where the path meets the main road again: s = foot point of the last path point */
  to: RteAnchor;
  /** the way, travel order, ~5 m apart, finished levels, lateral offset (left lane) already applied */
  pts: RtePt[];
  /** 'exit' = a ring car takes it with Config.roads.junctionRteTraffic.exitChance, 'm4' = with m4Chance, 'forced' = every car of the arm that did not take M4 (the stem inbound ends at the ring) */
  chance: 'exit' | 'm4' | 'forced';
  length: number;
}

/** lane centre from the axis of a 2-lane one-way ramp (3.65 m lane, RteMesh laneOffset): the car keeps LEFT (left-hand traffic) */
export const RTE_LANE2 = 1.825;
const STEP = 5;
const SLEW = 0.12;           // the lane offset changes by at most 0.12 m per m along the path (1:8)

interface Piece { xs: number[]; zs: number[]; ys: number[]; lat: number[] }

function roadPiece(r: RoadSpec): Piece {
  const hw = r.halfWidth, base = hw > 4 ? RTE_LANE2 : 0;           // 9.7 m / 9.7 m wide tails carry 2 lanes, the 6.1 m ones and the 5.5 m slips 1
  const n = r.xs.length, p: Piece = { xs: [], zs: [], ys: [], lat: [] };
  for (let i = 0; i < n; i++) {
    p.xs.push(r.xs[i]); p.zs.push(r.zs[i]); p.ys.push(r.ys[i]);
    p.lat.push(base * (r.halfAt ? Math.max(0, Math.min(1, r.halfAt[i] / hw)) : 1));   // the lane narrows with the ribbon in the AUTO MERGE zone
  }
  return p;
}

function deckPiece(name: 'M3' | 'M4'): Piece | null {
  const d = RTE_RAMP_STRUCTS.find((q) => q.name === name);
  if (!d) return null;
  const p: Piece = { xs: [], zs: [], ys: [], lat: [] };
  for (let i = 0; i < d.x.length; i++) { p.xs.push(d.x[i]); p.zs.push(d.z[i]); p.ys.push(d.deckY[i]); p.lat.push(d.width[i] >= 8 ? RTE_LANE2 : 0); }
  return p;
}

function join(parts: Piece[]): Piece {
  const out: Piece = { xs: [], zs: [], ys: [], lat: [] };
  for (const p of parts) {
    for (let i = 0; i < p.xs.length; i++) {
      const n = out.xs.length;
      if (n > 0 && Math.hypot(p.xs[i] - out.xs[n - 1], p.zs[i] - out.zs[n - 1]) < 0.3) continue;   // the pieces share their end point (bridge end = tail start)
      out.xs.push(p.xs[i]); out.zs.push(p.zs[i]); out.ys.push(p.ys[i]); out.lat.push(p.lat[i]);
    }
  }
  return out;
}

/** centre line + lateral offset -> points every STEP m (slew limited offset, left of the travel direction = (hz, -hx) like RoadGraph.at) */
function resample(p: Piece): RtePt[] {
  const n = p.xs.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p.xs[i] - p.xs[i - 1], p.zs[i] - p.zs[i - 1]));
  const lat = p.lat.slice();
  for (let i = 1; i < n; i++) lat[i] = Math.max(lat[i - 1] - SLEW * (cum[i] - cum[i - 1]), Math.min(lat[i - 1] + SLEW * (cum[i] - cum[i - 1]), lat[i]));
  for (let i = n - 2; i >= 0; i--) lat[i] = Math.max(lat[i + 1] - SLEW * (cum[i + 1] - cum[i]), Math.min(lat[i + 1] + SLEW * (cum[i + 1] - cum[i]), lat[i]));
  const total = cum[n - 1], m = Math.max(2, Math.round(total / STEP) + 1), out: RtePt[] = [];
  let i = 0;
  for (let k = 0; k < m; k++) {
    const s = (total * k) / (m - 1);
    while (i < n - 2 && cum[i + 1] < s) i++;
    const span = cum[i + 1] - cum[i] || 1, t = Math.min(1, Math.max(0, (s - cum[i]) / span));
    const x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t, z = p.zs[i] + (p.zs[i + 1] - p.zs[i]) * t, y = p.ys[i] + (p.ys[i + 1] - p.ys[i]) * t;
    const l = lat[i] + (lat[i + 1] - lat[i]) * t;
    // heading over +-6 m (smooth: the centre line points are 2 .. 8 m apart)
    const a = Math.max(0, s - 6), b = Math.min(total, s + 6);
    const pa = at(p, cum, a), pb = at(p, cum, b), hl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1, hx = (pb[0] - pa[0]) / hl, hz = (pb[1] - pa[1]) / hl;
    out.push({ x: x + hz * l, z: z - hx * l, y });
  }
  return out;
}
function at(p: Piece, cum: number[], s: number): [number, number] {
  let i = 0; const n = cum.length;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const span = cum[i + 1] - cum[i] || 1, t = Math.min(1, Math.max(0, (s - cum[i]) / span));
  return [p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t, p.zs[i] + (p.zs[i + 1] - p.zs[i]) * t];
}

/** foot point of (x, z) on the centre line of a road: arc length s, unit tangent, distance */
export function footOnRoad(r: RoadSpec, x: number, z: number): { s: number; tx: number; tz: number; dist: number } {
  let best = Infinity, s = 0, tx = 1, tz = 0;
  for (let k = 0; k + 1 < r.xs.length; k++) {
    const vx = r.xs[k + 1] - r.xs[k], vz = r.zs[k + 1] - r.zs[k], l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - r.xs[k]) * vx + (z - r.zs[k]) * vz) / l2));
    const d = Math.hypot(x - (r.xs[k] + t * vx), z - (r.zs[k] + t * vz));
    if (d < best) { best = d; s = r.cum[k] + t * Math.sqrt(l2); const l = Math.sqrt(l2); tx = vx / l; tz = vz / l; }
  }
  return { s, tx, tz, dist: best };
}

interface Def { id: RteMoveId; parts: Array<['tail', string] | ['deck', 'M3' | 'M4']>; fromRoad: string; toRoad: string; chance: RteMove['chance'] }
const DEFS: Def[] = [
  { id: 'M3', parts: [['tail', 'RTE-TAIL-M3S'], ['deck', 'M3'], ['tail', 'RTE-TAIL-M3N']], fromRoad: 'M8', toRoad: 'J1-E', chance: 'exit' },
  { id: 'M4', parts: [['tail', 'RTE-TAIL-M4G'], ['deck', 'M4'], ['tail', 'RTE-TAIL-M4L']], fromRoad: 'J1-E', toRoad: 'M8', chance: 'm4' },
  { id: 'A2S', parts: [['tail', 'RTE-A2S']], fromRoad: 'M8', toRoad: 'J1-E', chance: 'exit' },
  { id: 'S2A', parts: [['tail', 'RTE-S2A']], fromRoad: 'J1-E', toRoad: 'M8', chance: 'forced' },
];

/** The movements that can be built from `roads` (a movement whose road pieces are missing, e.g. the lanes switched off, is left out). */
export function buildRteMoves(roads: readonly RoadSpec[]): RteMove[] {
  const byName = new Map<string, number>();
  roads.forEach((r, i) => { if (!byName.has(r.name)) byName.set(r.name, i); });
  const out: RteMove[] = [];
  for (const d of DEFS) {
    const fromId = byName.get(d.fromRoad), toId = byName.get(d.toRoad);
    if (fromId === undefined || toId === undefined) continue;
    const parts: Piece[] = [];
    let ok = true;
    for (const [kind, nm] of d.parts) {
      if (kind === 'tail') { const id = byName.get(nm); if (id === undefined) { ok = false; break; } parts.push(roadPiece(roads[id])); }
      else { const p = deckPiece(nm); if (!p) { ok = false; break; } parts.push(p); }
    }
    if (!ok) continue;
    const pts = resample(join(parts));
    if (pts.length < 6) continue;
    const dirOf = (a: RtePt, b: RtePt, f: { tx: number; tz: number }): 1 | -1 => ((b.x - a.x) * f.tx + (b.z - a.z) * f.tz >= 0 ? 1 : -1);
    const n = pts.length;
    const f0 = footOnRoad(roads[fromId], pts[0].x, pts[0].z), f1 = footOnRoad(roads[toId], pts[n - 1].x, pts[n - 1].z);
    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    out.push({
      id: d.id,
      from: { roadId: fromId, s: f0.s, dir: dirOf(pts[0], pts[Math.min(3, n - 1)], f0), dist: f0.dist },
      to: { roadId: toId, s: f1.s, dir: dirOf(pts[Math.max(0, n - 4)], pts[n - 1], f1), dist: f1.dist },
      pts, chance: d.chance, length,
    });
  }
  return out;
}

/** The interchange as the AI sees it. Built once by RoadGraph (null there when no movement exists / the switch is OFF). */
export class RteLink {
  readonly moves: RteMove[];
  /** the arm road (J1-E) and the ring road (M8) the movements connect */
  readonly armRoad: number;
  readonly ringRoad: number;

  constructor(roads: readonly RoadSpec[]) {
    this.moves = buildRteMoves(roads);
    this.armRoad = roads.findIndex((r) => r.name === 'J1-E');
    this.ringRoad = roads.findIndex((r) => r.name === 'M8');
  }

  /** all four movements exist: only then the old T stand-in of the arm (RoadGraph.tLinks) is replaced */
  get complete(): boolean { return this.moves.length === 4; }

  /**
   * A new car must not appear on the arm, going towards the ring, AFTER the last exit (S2A): it would run into the end of the arm. (A car that is already there came through the exit decision.)
   */
  deadZone(roadId: number, s: number, dir: 1 | -1): boolean {
    if (roadId !== this.armRoad || dir < 0) return false;
    for (const m of this.moves) if (m.chance === 'forced' && m.from.roadId === roadId && m.from.dir === dir && s > m.from.s - 8) return true;
    return false;
  }
}
