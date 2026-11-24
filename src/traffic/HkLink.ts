// STEP HK-11a (2026-11-24): AI paths through the Hatikamrul-type interchange (ring M8 over the J1-S arm / the island link M6-1, HANDOFF_HATIKAMRUL.md). PURE MATH, nothing calls it yet (HK-11b hooks it into RoadGraph / Route).
// Every path is built from the REAL data of the game (the 8 road pieces HK-CD-* / HK-SLIP-* of the road network and the 4 loop ramps of HkRamps), nothing invented. The pieces join like this (scripts/hk-moves-probe.ts, local frame x east / y north, node = end of the arm):
//   arm J1-S (southbound) --exit--> HK-CD-E-N --(y 0)--> HK-CD-E-S --entry--> link M6-1        link (northbound) --exit--> HK-CD-W-S --(y 0)--> HK-CD-W-N --entry--> arm
//   SLIP-NE  leaves CD-E-N at y 367 and joins the ring east (eastbound)     SLIP-NW leaves the ring west (eastbound) and joins CD-W-N at y 367
//   SLIP-SE  leaves the ring east (westbound) and joins CD-E-S at y -367    SLIP-SW leaves CD-W-S at y -367 and joins the ring west (westbound)
//   loop SE  leaves CD-E-S at y -76 and joins the ring (westbound)           loop NE leaves the ring (eastbound) and joins CD-E-N at y 78
//   loop NW  leaves CD-W-N at y 76 and joins the ring (eastbound)            loop SW leaves the ring (westbound) and joins CD-W-S at y -78
// The 10 movements (left-hand traffic; the 4 slips are the left turns, the 4 loops the right turns, 2 more run on the C-D roads only): A2E A2W A2L (arm southbound), L2W L2E L2A (link northbound), E2A E2L (ring eastbound), W2L W2A (ring westbound).
// All the pieces are single-lane ramps (half width 4.2), so the car keeps the centre line (lateral offset 0). Where two pieces meet at a shallow angle (the gore, 2.4 .. 3.6 m apart) a smooth Hermite connector of about 14 m joins them.
import type { RoadSpec } from '../roads';
import type { HkRamp } from '../roads/ring/HkRamps';
import { footOnRoad, resample, type Piece, type RteAnchor, type RtePt } from './RteLink';

export type HkMoveId = 'A2E' | 'A2W' | 'A2L' | 'L2W' | 'L2E' | 'L2A' | 'E2A' | 'E2L' | 'W2L' | 'W2A';
export interface HkMove {
  id: HkMoveId;
  /** where a car leaves the main road: s = foot point of the first path point (the tip of the exit lane), dir = travel direction on that road */
  from: RteAnchor;
  /** where the path meets the main road again: s = foot point of the last path point */
  to: RteAnchor;
  /** the way, travel order, ~5 m apart, finished levels */
  pts: RtePt[];
  /** the pieces the way is made of, in order */
  via: string[];
  /** 'exit' = a car of the main road takes it with a chance (Config, HK-11b) */
  chance: 'exit';
  length: number;
}

const BLEND = 14;   // m of each piece replaced by the Hermite connector at a gore

interface Raw { xs: number[]; zs: number[]; ys: number[] }
const dist = (a: Raw, i: number, b: Raw, j: number): number => Math.hypot(a.xs[i] - b.xs[j], a.zs[i] - b.zs[j]);

function tangent(p: Raw, i: number): [number, number] {
  const a = Math.max(0, i - 1), b = Math.min(p.xs.length - 1, i + 1);
  const dx = p.xs[b] - p.xs[a], dz = p.zs[b] - p.zs[a], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/** Smooth connector from (p, i) to (q, j) (exclusive of both end points), sample every ~3 m. */
function hermite(p: Raw, i: number, q: Raw, j: number, out: Raw): void {
  const x0 = p.xs[i], z0 = p.zs[i], x1 = q.xs[j], z1 = q.zs[j], chord = Math.hypot(x1 - x0, z1 - z0);
  const [t0x, t0z] = tangent(p, i), [t1x, t1z] = tangent(q, j);
  const n = Math.max(2, Math.round(chord / 3));
  for (let k = 1; k < n; k++) {
    const u = k / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    out.xs.push(h00 * x0 + h10 * chord * t0x + h01 * x1 + h11 * chord * t1x);
    out.zs.push(h00 * z0 + h10 * chord * t0z + h01 * z1 + h11 * chord * t1z);
    out.ys.push(p.ys[i] + (q.ys[j] - p.ys[i]) * u);
  }
}

/** index of the point of `p` that lies at least `d` metres BEFORE index i (walking back), or 0 */
function backBy(p: Raw, i: number, d: number): number {
  let s = 0, k = i;
  while (k > 0 && s < d) { s += Math.hypot(p.xs[k] - p.xs[k - 1], p.zs[k] - p.zs[k - 1]); k--; }
  return k;
}
function forwardBy(p: Raw, j: number, d: number): number {
  let s = 0, k = j;
  while (k < p.xs.length - 1 && s < d) { s += Math.hypot(p.xs[k + 1] - p.xs[k], p.zs[k + 1] - p.zs[k]); k++; }
  return k;
}

/** Append piece B to the chain A: continuation (end meets start), divergence (B starts beside the middle of A: A is cut there) or merge (A ends beside the middle of B: B starts there). */
function attach(A: Raw, B: Raw): Raw {
  const nA = A.xs.length, nB = B.xs.length;
  const cont = dist(A, nA - 1, B, 0);
  const out: Raw = { xs: [], zs: [], ys: [] };
  const push = (p: Raw, a: number, b: number): void => { for (let k = a; k <= b; k++) { out.xs.push(p.xs[k]); out.zs.push(p.zs[k]); out.ys.push(p.ys[k]); } };
  if (cont < 1) { push(A, 0, nA - 1); push(B, 1, nB - 1); return out; }
  let jMin = 0, dEnd = Infinity;
  for (let j = 0; j < nB; j++) { const d = dist(A, nA - 1, B, j); if (d < dEnd) { dEnd = d; jMin = j; } }
  let iMin = 0, dStart = Infinity;
  for (let i = 0; i < nA; i++) { const d = dist(A, i, B, 0); if (d < dStart) { dStart = d; iMin = i; } }
  if (dStart <= dEnd) {            // divergence: cut A before the gore, connect to B a little further on
    const ia = backBy(A, iMin, BLEND), jb = forwardBy(B, 0, BLEND);
    push(A, 0, ia); hermite(A, ia, B, jb, out); push(B, jb, nB - 1);
  } else {                         // merge: A runs to its end, B continues from a little after the merge point
    const jb = forwardBy(B, jMin, BLEND);
    push(A, 0, nA - 1); hermite(A, nA - 1, B, jb, out); push(B, jb, nB - 1);
  }
  return out;
}

interface Def { id: HkMoveId; parts: string[]; fromRoad: string; toRoad: string }
const DEFS: Def[] = [
  { id: 'A2E', parts: ['HK-CD-E-N', 'HK-SLIP-NE'], fromRoad: 'J1-S', toRoad: 'M8' },
  { id: 'A2W', parts: ['HK-CD-E-N', 'HK-CD-E-S', 'HK-SE'], fromRoad: 'J1-S', toRoad: 'M8' },
  { id: 'A2L', parts: ['HK-CD-E-N', 'HK-CD-E-S'], fromRoad: 'J1-S', toRoad: 'M6-1' },
  { id: 'L2W', parts: ['HK-CD-W-S', 'HK-SLIP-SW'], fromRoad: 'M6-1', toRoad: 'M8' },
  { id: 'L2E', parts: ['HK-CD-W-S', 'HK-CD-W-N', 'HK-NW'], fromRoad: 'M6-1', toRoad: 'M8' },
  { id: 'L2A', parts: ['HK-CD-W-S', 'HK-CD-W-N'], fromRoad: 'M6-1', toRoad: 'J1-S' },
  { id: 'E2A', parts: ['HK-SLIP-NW', 'HK-CD-W-N'], fromRoad: 'M8', toRoad: 'J1-S' },
  { id: 'E2L', parts: ['HK-NE', 'HK-CD-E-N', 'HK-CD-E-S'], fromRoad: 'M8', toRoad: 'M6-1' },
  { id: 'W2L', parts: ['HK-SLIP-SE', 'HK-CD-E-S'], fromRoad: 'M8', toRoad: 'M6-1' },
  { id: 'W2A', parts: ['HK-SW', 'HK-CD-W-S', 'HK-CD-W-N'], fromRoad: 'M8', toRoad: 'J1-S' },
];

/** The movements that can be built from `roads` + `loops` (a movement with a missing piece is left out: the interchange switched off). */
export function buildHkMoves(roads: readonly RoadSpec[], loops: readonly HkRamp[]): HkMove[] {
  const byName = new Map<string, number>();
  roads.forEach((r, i) => { if (!byName.has(r.name)) byName.set(r.name, i); });
  const piece = (nm: string): Raw | null => {
    const id = byName.get(nm);
    if (id !== undefined && /^HK-(CD|SLIP)/.test(nm)) { const r = roads[id]; return { xs: Array.from(r.xs), zs: Array.from(r.zs), ys: Array.from(r.ys) }; }
    const L = loops.find((q) => q.id === nm);
    return L ? { xs: L.xs.slice(), zs: L.zs.slice(), ys: L.ys.slice() } : null;
  };
  const out: HkMove[] = [];
  for (const d of DEFS) {
    const fromId = byName.get(d.fromRoad), toId = byName.get(d.toRoad);
    if (fromId === undefined || toId === undefined) continue;
    const raws = d.parts.map(piece);
    if (raws.some((r) => r === null)) continue;
    let chain = raws[0] as Raw;
    for (let k = 1; k < raws.length; k++) chain = attach(chain, raws[k] as Raw);
    const pc: Piece = { xs: chain.xs, zs: chain.zs, ys: chain.ys, lat: chain.xs.map(() => 0) };
    const pts = resample(pc);
    if (pts.length < 6) continue;
    const n = pts.length;
    const dirOf = (a: RtePt, b: RtePt, f: { tx: number; tz: number }): 1 | -1 => ((b.x - a.x) * f.tx + (b.z - a.z) * f.tz >= 0 ? 1 : -1);
    const f0 = footOnRoad(roads[fromId], pts[0].x, pts[0].z), f1 = footOnRoad(roads[toId], pts[n - 1].x, pts[n - 1].z);
    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    out.push({
      id: d.id,
      from: { roadId: fromId, s: f0.s, dir: dirOf(pts[0], pts[Math.min(3, n - 1)], f0), dist: f0.dist },
      to: { roadId: toId, s: f1.s, dir: dirOf(pts[Math.max(0, n - 4)], pts[n - 1], f1), dist: f1.dist },
      pts, via: d.parts, chance: 'exit', length,
    });
  }
  return out;
}

/** The interchange as the AI will see it (HK-11b builds it once in RoadGraph). */
export class HkLink {
  readonly moves: HkMove[];
  /** the arm J1-S, the island link M6-1 and the ring M8 (road ids) */
  readonly armRoad: number;
  readonly linkRoad: number;
  readonly ringRoad: number;
  constructor(roads: readonly RoadSpec[], loops: readonly HkRamp[]) {
    this.moves = buildHkMoves(roads, loops);
    this.armRoad = roads.findIndex((r) => r.name === 'J1-S');
    this.linkRoad = roads.findIndex((r) => r.name === 'M6-1');
    this.ringRoad = roads.findIndex((r) => r.name === 'M8');
  }
  /** all ten movements exist */
  get complete(): boolean { return this.moves.length === DEFS.length; }

  /** the movements that leave the main road at the same tip (arm / link: 3 each, ring: 1) */
  group(m: HkMove): HkMove[] {
    return this.moves.filter((q) => q.from.roadId === m.from.roadId && q.from.dir === m.from.dir && Math.abs(q.from.s - m.from.s) < 3);
  }
  /** the through movement of an arm / link group (arm -> link A2L, link -> arm L2A); null for a ring exit */
  through(m: HkMove): HkMove | null {
    const g = this.group(m);
    return g.length > 1 ? g.find((q) => q.id === 'A2L' || q.id === 'L2A') ?? null : null;
  }

  /**
   * A new car must not appear on the arm / link between the C-D tip and the node: every car of the arm / link leaves at the tip (the arm and the link end at the node),
   * so a car there would run into the end of its road.
   */
  deadZone(roadId: number, s: number, dir: 1 | -1): boolean {
    if (roadId !== this.armRoad && roadId !== this.linkRoad) return false;
    for (const m of this.moves) if (m.from.roadId === roadId && m.from.dir === dir && (s - m.from.s) * dir > -8) return true;
    return false;
  }
}
