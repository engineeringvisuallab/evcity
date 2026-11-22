// JUNCTION REGISTRY (user 2026-11-22: "kisu junction old road er junction hisebe use hosse, update junction and update all road and junction").
// Pure maths (no three.js, no DOM). It reads the FINISHED roads of RoadNetwork (all of them: ring, J1 arms, R6 / R4 / R2 / C / L, city streets, corridor roads)
// and returns the junctions that REALLY exist there: where a road end meets another road end or the side of another road. NOTHING is moved or changed.
// The old tables (RoadCentreData CENTRE_JUNCTIONS "J-xx", docs/centre_junction.json "Nxxx") were made from earlier fits of the lines; this is made from the lines in the game.
import type { RoadSpec } from './RoadTypes';

/** Road class by name: 8 = 8-lane (M8 ring, J1 arms), 6 / 4 / 2 = R6 / R4 / R2, C / L = collector / local, S = drawn city street (SH-), X = other. */
export type JClass = '8' | '6' | '4' | '2' | 'C' | 'L' | 'S' | 'X';

export interface JLeg {
  roadId: number;
  name: string;
  /** Name without the split suffix (R2-34.1 -> R2-34). */
  parent: string;
  cls: JClass;
  /** 0 = start of the road, 1 = end of the road, 2 = the road runs THROUGH the junction (its side). */
  end: 0 | 1 | 2;
  /** Distance (m) from the road end (or from the road side) to the junction point: 0 = the road really arrives at the point. */
  offset: number;
  /** Surface height of the road at the junction (m). */
  y: number;
  /** Compass-free heading (deg, 0..360, atan2(z, x)) of the leg leaving the junction. Through roads give two headings (heading, heading + 180). */
  heading: number;
}

export type JType =
  | 'ring-T' // 8-lane x 8-lane
  | 'tap' // R4 / R6 / R2 / C / L end on an 8-lane road: interchange (section 24, IR1)
  | 'arterial' // R4 / R6 x R4 / R6: signalised T (R6: interchange candidate, IR4)
  | 'roundabout' // 4 or more legs, minor roads
  | 'T' // priority T, minor roads
  | 'continuation'; // two road ends of the same family that simply carry on

export interface JNode {
  id: string;
  x: number;
  z: number;
  /** Height of the main road at the junction (m). */
  y: number;
  legs: JLeg[];
  type: JType;
  /** Smallest angle (deg) between two legs. */
  minAngle: number;
  /** Largest offset (m) of a leg end from the junction point. */
  maxOffset: number;
  /** Largest height step (m) between the legs at the junction. */
  maxGapY: number;
  flags: string[];
}

export interface FreeEnd {
  roadId: number;
  name: string;
  cls: JClass;
  end: 0 | 1;
  x: number;
  z: number;
  y: number;
}

export interface JunctionRegistry {
  nodes: JNode[];
  /** Road ends that meet nothing within `tol` m (dead ends: right for a cul-de-sac, a bug for a road that must join). */
  freeEnds: FreeEnd[];
  /** Places where two roads cross at nearly the same height with no junction (z-fight / no way to turn). */
  crossings: { x: number; z: number; a: string; b: string; dy: number }[];
}

export function roadClass(name: string): JClass {
  if (name === 'M8' || name.startsWith('J1-') || name.startsWith('M6-')) return '8';
  if (name.startsWith('R6-')) return '6';
  if (name.startsWith('R4-')) return '4';
  if (name.startsWith('R2-')) return '2';
  if (name.startsWith('C-')) return 'C';
  if (name.startsWith('L-')) return 'L';
  if (name.startsWith('SH')) return 'S';
  return 'X';
}
const RANK: Record<JClass, number> = { '8': 0, '6': 1, '4': 2, '2': 3, C: 4, L: 5, S: 5, X: 6 };
const parentName = (n: string): string => n.replace(/\.\d+$/, '');
const deg = (a: number): number => ((a * 180) / Math.PI + 360) % 360;

interface Hit {
  d: number;
  /** Fractional point index on the polyline. */
  pos: number;
  x: number;
  z: number;
}
function nearest(r: RoadSpec, px: number, pz: number): Hit {
  let best: Hit = { d: 1e18, pos: 0, x: 0, z: 0 };
  const n = r.xs.length;
  const m = r.closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    const ax = r.xs[i], az = r.zs[i];
    const dx = r.xs[j] - ax, dz = r.zs[j] - az;
    const L = dx * dx + dz * dz;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    const qx = ax + t * dx, qz = az + t * dz;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best.d) best = { d, pos: i + t, x: qx, z: qz };
  }
  return best;
}
function yAt(r: RoadSpec, pos: number): number {
  const n = r.xs.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(pos)));
  const j = Math.min(n - 1, i + 1);
  const f = pos - i;
  return r.ys[i] * (1 - f) + r.ys[j] * f;
}
/** Heading (rad) of road r at fractional index pos, looking forward (dir = 1) or backward (dir = -1), over about `span` m. */
function headingAt(r: RoadSpec, pos: number, dir: 1 | -1, span = 24): number {
  const n = r.xs.length;
  let i = Math.min(n - 1, Math.max(0, Math.round(pos)));
  const x0 = r.xs[i], z0 = r.zs[i];
  let acc = 0;
  let k = i;
  while (acc < span) {
    const k2 = k + dir;
    if (k2 < 0 || k2 >= n) break;
    acc += Math.hypot(r.xs[k2] - r.xs[k], r.zs[k2] - r.zs[k]);
    k = k2;
  }
  if (k === i) return 0;
  return Math.atan2(r.zs[k] - z0, r.xs[k] - x0);
}

export interface RegistryOptions {
  /** A road end within this distance (m) of another road (end or side) belongs to the same junction. */
  tol?: number;
  /** Roads whose names include ':' are the sub-roads of an interchange (slips, ramps): left out. */
  skipSubroads?: boolean;
}

export function buildJunctionRegistry(roads: RoadSpec[], opt: RegistryOptions = {}): JunctionRegistry {
  const tol = opt.tol ?? 12;
  const use = roads.filter((r) => !r.earth && r.xs.length >= 2 && r.kind !== 'ramp' && !(opt.skipSubroads !== false && r.name.includes(':')));
  // ---- 1. every open road end, linked to what is within tol ----
  interface End { r: RoadSpec; e: 0 | 1; x: number; z: number }
  const ends: End[] = [];
  for (const r of use) {
    if (r.closed) continue;
    const n = r.xs.length;
    ends.push({ r, e: 0, x: r.xs[0], z: r.zs[0] }, { r, e: 1, x: r.xs[n - 1], z: r.zs[n - 1] });
  }
  // grid for the road sides (cell 60 m): per cell the roads that pass within
  const CELL = 60;
  const grid = new Map<string, Set<number>>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  use.forEach((r, ri) => {
    for (let i = 0; i < r.xs.length; i++) {
      const cx = Math.floor(r.xs[i] / CELL), cz = Math.floor(r.zs[i] / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const k = key(cx + a, cz + b);
        let s = grid.get(k);
        if (!s) grid.set(k, (s = new Set()));
        s.add(ri);
      }
    }
  });
  const roadsNear = (x: number, z: number): number[] => [...(grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [])];
  const idx = new Map<RoadSpec, number>();
  use.forEach((r, i) => idx.set(r, i));

  // ---- 2. cluster the ends (single linkage, tol) ----
  const parent = ends.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    if (ends[i].r === ends[j].r) continue;
    if (Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z) <= tol) parent[find(i)] = find(j);
  }
  // ends that arrive at the SIDE of the same through road within 2 tol also share a node
  const groups = new Map<number, number[]>();
  ends.forEach((_, i) => {
    const g = find(i);
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(i);
  });

  const nodes: JNode[] = [];
  const freeEnds: FreeEnd[] = [];
  for (const members of groups.values()) {
    let cx = 0, cz = 0;
    for (const i of members) { cx += ends[i].x; cz += ends[i].z; }
    cx /= members.length; cz /= members.length;
    const endRoads = new Set(members.map((i) => ends[i].r));
    // through roads: not one of the ending roads, side within tol of the cluster centre
    const through: { r: RoadSpec; h: Hit }[] = [];
    for (const ri of roadsNear(cx, cz)) {
      const r = use[ri];
      if (endRoads.has(r)) continue;
      const h = nearest(r, cx, cz);
      const nn = r.xs.length;
      // a road that only has an END here is an end member already (or lies beyond tol): ignore hits at its own ends
      if (h.d <= tol && (r.closed || (h.pos > 0.05 && h.pos < nn - 1.05))) through.push({ r, h });
    }
    through.sort((a, b) => RANK[roadClass(a.r.name)] - RANK[roadClass(b.r.name)] || a.h.d - b.h.d);
    if (members.length === 1 && through.length === 0) {
      const m = ends[members[0]];
      const n = m.r.xs.length;
      freeEnds.push({ roadId: m.r.id, name: m.r.name, cls: roadClass(m.r.name), end: m.e, x: m.x, z: m.z, y: m.r.ys[m.e === 0 ? 0 : n - 1] });
      continue;
    }
    // junction point: on the best through road if there is one, else the cluster centre
    let jx = cx, jz = cz, jy = 0;
    if (through.length) {
      jx = through[0].h.x; jz = through[0].h.z; jy = yAt(through[0].r, through[0].h.pos);
    } else {
      let ys = 0;
      for (const i of members) { const n = ends[i].r.xs.length; ys += ends[i].r.ys[ends[i].e === 0 ? 0 : n - 1]; }
      jy = ys / members.length;
    }
    const legs: JLeg[] = [];
    for (const i of members) {
      const { r, e } = ends[i];
      const n = r.xs.length;
      const k = e === 0 ? 0 : n - 1;
      legs.push({ roadId: r.id, name: r.name, parent: parentName(r.name), cls: roadClass(r.name), end: e, offset: Math.hypot(r.xs[k] - jx, r.zs[k] - jz), y: r.ys[k], heading: deg(headingAt(r, k, e === 0 ? 1 : -1)) });
    }
    for (const t of through) {
      const hd = headingAt(t.r, t.h.pos, 1);
      const y = yAt(t.r, t.h.pos);
      for (const add of [0, Math.PI]) legs.push({ roadId: t.r.id, name: t.r.name, parent: parentName(t.r.name), cls: roadClass(t.r.name), end: 2, offset: t.h.d, y, heading: deg(hd + add) });
    }
    // the two halves of ONE road that was split here (R2-34.1 / R2-34.2) are a continuation, not a junction
    const parents = new Set(legs.map((l) => l.parent));
    const flags: string[] = [];
    let minAngle = 180;
    for (let a = 0; a < legs.length; a++) for (let b = a + 1; b < legs.length; b++) {
      let d = Math.abs(legs[a].heading - legs[b].heading) % 360;
      if (d > 180) d = 360 - d;
      if (legs[a].roadId === legs[b].roadId && legs[a].end === 2 && legs[b].end === 2) continue; // the two sides of a through road
      minAngle = Math.min(minAngle, d);
    }
    let maxOffset = 0;
    let ymin = 1e9, ymax = -1e9;
    for (const l of legs) { maxOffset = Math.max(maxOffset, l.offset); ymin = Math.min(ymin, l.y); ymax = Math.max(ymax, l.y); }
    const maxGapY = ymax - ymin;
    const nRoads = new Set(legs.map((l) => l.roadId)).size;
    const arms = legs.length;
    const best = legs.reduce((m, l) => Math.min(m, RANK[l.cls]), 9);
    const worst = legs.reduce((m, l) => Math.max(m, RANK[l.cls]), 0);
    const n8 = new Set(legs.filter((l) => l.cls === '8').map((l) => l.roadId)).size;
    let type: JType;
    if (nRoads === 2 && parents.size === 1 && arms === 2) type = 'continuation';
    else if (n8 >= 2) type = 'ring-T';
    else if (best === 0 && worst > 0) type = 'tap';
    else if (best <= 2 && worst <= 2) type = 'arterial';
    else type = arms >= 4 ? 'roundabout' : 'T';
    if (maxOffset > 2) flags.push('OFFSET>2m');
    if (maxOffset > 5) flags.push('OFFSET>5m');
    if (maxGapY > 0.5 && type !== 'tap') flags.push('LEVEL-STEP');
    if (maxGapY > 3) flags.push('GRADE-SEPARATED?');
    if (minAngle < 70 && arms >= 3) flags.push('SKEW<70');
    if (type === 'continuation' && maxOffset > 0.5) flags.push('CONT-GAP');
    nodes.push({ id: '', x: jx, z: jz, y: jy, legs, type, minAngle, maxOffset, maxGapY, flags });
  }
  // ---- 3. stable ids: sorted by x then z, "JN001" ... ----
  nodes.sort((a, b) => a.x - b.x || a.z - b.z);
  nodes.forEach((n, i) => (n.id = 'JN' + String(i + 1).padStart(3, '0')));

  // ---- 4. crossings with no junction: segments of two roads that cross within 4 m height, farther than tol from every node ----
  const crossings: JunctionRegistry['crossings'] = [];
  const seen = new Set<string>();
  const nodeNear = (x: number, z: number): boolean => nodes.some((n) => Math.hypot(n.x - x, n.z - z) <= tol * 1.5);
  use.forEach((r, ri) => {
    const n = r.xs.length;
    const m = r.closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n;
      const mx = (r.xs[i] + r.xs[j]) / 2, mz = (r.zs[i] + r.zs[j]) / 2;
      for (const qi of roadsNear(mx, mz)) {
        if (qi <= ri) continue;
        const q = use[qi];
        const qn = q.xs.length;
        const qm = q.closed ? qn : qn - 1;
        // walk the other road only near this segment (bounding test per segment)
        for (let k = 0; k < qm; k++) {
          const l = (k + 1) % qn;
          if (Math.max(q.xs[k], q.xs[l]) < Math.min(r.xs[i], r.xs[j]) - 1 || Math.min(q.xs[k], q.xs[l]) > Math.max(r.xs[i], r.xs[j]) + 1) continue;
          if (Math.max(q.zs[k], q.zs[l]) < Math.min(r.zs[i], r.zs[j]) - 1 || Math.min(q.zs[k], q.zs[l]) > Math.max(r.zs[i], r.zs[j]) + 1) continue;
          const d1x = r.xs[j] - r.xs[i], d1z = r.zs[j] - r.zs[i], d2x = q.xs[l] - q.xs[k], d2z = q.zs[l] - q.zs[k];
          const den = d1x * d2z - d1z * d2x;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((q.xs[k] - r.xs[i]) * d2z - (q.zs[k] - r.zs[i]) * d2x) / den;
          const u = ((q.xs[k] - r.xs[i]) * d1z - (q.zs[k] - r.zs[i]) * d1x) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const x = r.xs[i] + t * d1x, z = r.zs[i] + t * d1z;
          const dy = Math.abs(r.ys[i] + t * (r.ys[j] - r.ys[i]) - (q.ys[k] + u * (q.ys[l] - q.ys[k])));
          if (dy > 4 || nodeNear(x, z)) continue;
          const kk = r.id + '|' + q.id + '|' + Math.round(x / 10) + '|' + Math.round(z / 10);
          if (seen.has(kk)) continue;
          seen.add(kk);
          crossings.push({ x, z, a: r.name, b: q.name, dy });
        }
      }
    }
  });
  return { nodes, freeEnds, crossings };
}
