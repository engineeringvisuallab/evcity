// ROAD SIGNS - Step 3: the PLAN. Which board stands where and what is written on it. Nothing is built here (no three.js, no DOM).
//
// Two kinds of board:
//   advance  stands BEFORE a junction (on the approach road) and tells the driver which way each place lies: one row per place with an arrow
//            (left / ahead / right) and the road distance to it.
//   confirm  stands a little AFTER a junction on a long main road: "yes, you are going the right way" - ahead arrow, remaining km.
//
// Two styles (the rule of the handoff: ONE board per place, the one that is needed there):
//   overhead  highway / arterial, or any road with 4+ lanes: a gantry over the carriageway (Step 4 builds it; until then a side board shows it)
//   side      everything else, and every confirm board
//
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
  /** |angle| below this (degrees) = ahead. */
  aheadDeg: 35,
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
  rows: SignRow[];
}

export interface SignPlanResult {
  signs: PlannedSign[];
  /** How many candidate boards were dropped, by reason. */
  skipped: Record<string, number>;
  /** Rows whose arrows were the same although they point along different arms (the board is ambiguous). */
  sameArrowBoards: number;
  summary: string;
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

export function isOverhead(r: { kind: string; lanes: number }): boolean {
  return r.kind === 'highway' || r.kind === 'arterial' || r.lanes >= 4;
}
function advanceDistance(r: { kind: string; lanes: number }): number {
  const a = SIGN_RULES.advanceM;
  if (r.kind === 'highway') return a.highway;
  if (r.kind === 'arterial') return a.arterial;
  if (r.lanes >= 4) return a.wide;
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
  return { s, x: p.x, z: p.z, hx, hz, sx, sz, fx, fz, sideOk };
}

export function planRoadSigns(net: PlanNet, destinations: readonly Destination[] = DESTINATIONS, home = { x: 0, z: 0 }): SignPlanResult {
  const R = SIGN_RULES;
  const rd = new RoadDistances(net.roads, net.pads, destinations, home);
  const roadById = new Map<number, PlanRoad>();
  for (const r of net.roads) roadById.set(r.id, r);
  const skipped: Record<string, number> = {};
  const skip = (why: string): void => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };

  // ---- the arms of every junction: real edges + stubs
  const arms: Arm[][] = net.pads.map(() => []);
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

  const planned: Omit<PlannedSign, 'id'>[] = [];
  let sameArrowBoards = 0;

  for (let p = 0; p < net.pads.length; p++) {
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
      const style: SignStyle = isOverhead(road) ? 'overhead' : 'side';
      const dMax = a.len - R.minGapM;
      if (dMax < R.minAdvanceM) {
        skip('advance: block too short');
        continue;
      }
      const dPref = Math.min(advanceDistance(road), dMax);
      const tryD = (dd: number): Spot | null => {
        const q = spotAt(net, road, a.s0 + a.dir * dd, (a.dir * -1) as 1 | -1, style);
        return q ? { ...q, d: dd } : null;
      };
      let sp: Spot | null = null;
      for (let dd = dPref; dd >= R.minAdvanceM && !sp; dd -= 10) sp = tryD(dd);
      for (let dd = dPref + 10; dd <= dMax && !sp; dd += 10) sp = tryD(dd);
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
        rows: withArm.map((w) => w.row),
      });
    }

    // ---- CONFIRM boards: after the junction, along each real exit of a long main road
    for (let ei = 0; ei < pa.length; ei++) {
      const e = pa[ei];
      if (!e.edge) continue;
      const road = roadById.get(e.roadId);
      if (!road || !R.confirmKinds.includes(road.kind) || e.len < R.confirmMinEdgeM) continue;
      const sp0 = spotAt(net, road, e.s0 + e.dir * R.confirmAfterM, e.dir, 'side');
      if (!sp0) {
        skip('confirm: no free spot (bridge / junction)');
        continue;
      }
      // the places this exit leads to (best arm = this exit), biggest first; the remaining distance is measured from the board
      const list: { d: number; rank: number; m: number }[] = [];
      destinations.forEach((dest, d) => {
        if (best[d] !== ei) return;
        const m = cost[ei][d] - R.confirmAfterM;
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
        dM: R.confirmAfterM,
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

  // ---- spacing rules for boards on the same road and the same driving direction
  const keep: boolean[] = planned.map(() => true);
  const groups = new Map<string, number[]>();
  planned.forEach((q, i) => {
    const key = `${q.roadId}:${q.dir}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  const gap = (u: Omit<PlannedSign, 'id'>, v: Omit<PlannedSign, 'id'>): number => {
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
    if (keep[i]) signs.push({ ...q, id: signs.length });
  });

  // ---- summary
  const count = (f: (q: PlannedSign) => boolean): number => signs.filter(f).length;
  const rowsHist = [1, 2, 3, 4].map((n) => `${n}:${count((q) => q.rows.length === n)}`).join(' ');
  const summary =
    `Step 3 plan: ${signs.length} boards (advance ${count((q) => q.purpose === 'advance')}, confirm ${count((q) => q.purpose === 'confirm')}; ` +
    `overhead ${count((q) => q.style === 'overhead')}, side ${count((q) => q.style === 'side')}; green ${count((q) => q.color === 'green')}, blue ${count((q) => q.color === 'blue')}); ` +
    `rows per board ${rowsHist}; ${net.pads.filter((_, p) => arms[p].length >= R.minArms).length} junctions with boards`;
  return { signs, skipped, sameArrowBoards, summary };
}
