// STEP HK-9d-3: ROAD ARROWS of the Hatikamrul-type interchange: a straight-ahead (direction) arrow on the lane centre of every loop ramp, C-D road and slip, and LANE-END (merge) arrows before the place where a one-lane ramp
// joins another road. Pure mesh data like HkDeckPaving.ts (positions / colours / indices, absolute world coordinates, no scene, no collider). Drawn by HkInterchangeLayer with the paving material (polygon offset).
// STYLE = the existing arrows of the RT-E ramps (RteMesh.ts RTE_MESH): white, shaft 3.0 x 0.3 m, head 1.5 m long 1.4 m wide, first arrow 30 m from the start, one every 100 m, last one 40 m before the end. scripts/hk-arrows-check.ts compares the numbers.
// LEFT-HAND TRAFFIC: nothing is mirrored here. The travel direction of every piece is the data direction (C-D / slip data are stored in travel direction, loops: see below) and a lane-end arrow bends toward the road that is joined,
// whichever side that is (cross product of the heading and the direction to the joined road).
// WHICH ENDS MERGE (engineer reading, from docs/HK_CD_ROADS.txt directions): every slip and every loop ends by joining another road (ring lane, C-D road); the C-D roads CD-W-N (into the arm) and CD-E-S (into the link) end by joining the main road;
// CD-E-N and CD-W-S start by leaving the main road and continue as the other half of the same C-D road (no lane end). Loop direction is read from the data: a loop leaves a C-D road along its flow (C-D -> ring) or joins it (ring -> C-D).
// LOOPS: arrows only on the ramp-mesh part (more than HM.maxOff from the ring axis); the last 50 m beside the ring (the paved tail on the deck) get no arrow: a ring-bound loop has its last lane-end arrow 10 m before the end of the mesh part.
import type { HkFrame } from './HkRamps';
import { hkRamps, hkWorld } from './HkRamps';
import { HK_CD_ROADS } from './HkCdRoadData';
import { HM } from './HkRampMesh';
import { HP } from './HkDeckPaving';
import type { MeshData, Rgb } from './RingBridgeGeometry';

/** Numbers of the RT-E arrows (RteMesh RTE_MESH) + the lane-end arrow: sideways shift of the tip and the distances of its two copies from the merge end. */
export const HA = { every: 100, first: 30, endGap: 40, shaft: 3.0, head: 1.5, shaftW: 0.3, headW: 1.4, step: 0.75, mark: 0.006, leShift: 1.1, leGap: 30, leClear: 20 } as const;
const WHITE: Rgb = [0.92, 0.92, 0.9];

class A {
  readonly d: MeshData = { positions: [], colors: [], indices: [] };
  v(p: number[]): number { const i = this.d.positions.length / 3; this.d.positions.push(p[0], p[1], p[2]); this.d.colors.push(WHITE[0], WHITE[1], WHITE[2]); return i; }
  /** Triangle wound so that its normal points up. */
  tri(a: number[], b: number[], c: number[]): void {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const ia = this.v(a);
    if (uz * vx - ux * vz > 0) { this.v(b); this.v(c); } else { const ic = this.v(c); this.v(b); void ic; }
    this.d.indices.push(ia, ia + 1, ia + 2);
  }
  quad(a: number[], b: number[], c: number[], e: number[]): void { this.tri(a, b, c); this.tri(a, c, e); }
}

export interface HkArrowLine {
  id: string; kind: 'loop' | 'cd' | 'slip';
  /** Centreline in TRAVEL order (world x / z / level) and arc length. */
  xs: number[]; zs: number[]; ys: number[]; cum: number[];
  /** Usable part (arc length) where arrows may stand. */
  s0: number; s1: number;
  /** The end of the usable part joins another road: lane-end arrows. */
  merge: boolean;
  /** Distance of the last lane-end arrow tip from s1. */
  leBack: number;
  /** Direction toward the joined road in the local frame (x east, y north), or 'ring' = toward the ring axis (y = 0). */
  toward: [number, number] | 'ring';
  /** Loops only: true = the loop runs C-D road -> ring, and the cosine between its start heading and the C-D flow (decides it). */
  toRing?: boolean; flowDot?: number;
}
export interface HkArrowInfo { line: string; kind: 'straight' | 'end'; s: number; /** +1 = bends to the left of the travel direction, -1 = right, 0 = straight */ side: number; tip: number[]; tx: number; tz: number; /** vertex range [v0, v1) of this arrow in the mesh */ v0: number; v1: number }
export interface HkArrowSet { mesh: MeshData; arrows: HkArrowInfo[]; lines: HkArrowLine[] }

/** Merge / direction spec of the 8 C-D / slip pieces. `toward`: local direction of the joined road at the merge end ('ring' = ring axis). */
const PIECES: Record<string, { merge: boolean; toward: [number, number] | 'ring' }> = {
  'CD-E-N': { merge: false, toward: 'ring' }, 'CD-W-S': { merge: false, toward: 'ring' },
  'CD-W-N': { merge: true, toward: [1, 0] }, 'CD-E-S': { merge: true, toward: [-1, 0] },
  'SLIP-NE': { merge: true, toward: 'ring' }, 'SLIP-SW': { merge: true, toward: 'ring' },
  'SLIP-SE': { merge: true, toward: [-1, 0] }, 'SLIP-NW': { merge: true, toward: [1, 0] },
};

function cumOf(xs: number[], zs: number[]): number[] { const c: number[] = []; xs.forEach((x, i) => c.push(i === 0 ? 0 : c[i - 1] + Math.hypot(x - xs[i - 1], zs[i] - zs[i - 1]))); return c; }

/** All arrow lines (8 C-D / slip pieces + 4 loops) in the world of frame f. ringOff = distance of a world point from the ring axis (default: |local y|). */
export function hkArrowLines(f: HkFrame, ringOff?: (x: number, z: number) => number): HkArrowLine[] {
  const out: HkArrowLine[] = [];
  const locY = (x: number, z: number): number => (x - f.ox) * f.nx + (z - f.oz) * f.nz;
  const off = ringOff ?? ((x: number, z: number): number => Math.abs(locY(x, z)));
  for (const r of HK_CD_ROADS) {
    const sp = PIECES[r.id];
    if (!sp) continue;
    const xs: number[] = [], zs: number[] = [];
    for (const p of r.pts) { const [wx, wz] = hkWorld(f, p[0], p[1]); xs.push(wx); zs.push(wz); }
    const cum = cumOf(xs, zs);
    out.push({ id: r.id, kind: r.kind, xs, zs, ys: r.ys.slice(), cum, s0: 0, s1: cum[cum.length - 1], merge: sp.merge, leBack: HA.leGap, toward: sp.toward });
  }
  const cds = out.filter((l) => l.kind === 'cd');
  for (const rp of hkRamps(f)) {
    const n = rp.xs.length, cdEnd = rp.ringEnd === 0 ? n - 1 : 0, nxt = rp.ringEnd === 0 ? cdEnd - 1 : cdEnd + 1;
    // the C-D road that the loop meets at its C-D end: nearest C-D point and the flow direction there
    let best = Infinity, flow = [0, 0], cdId = '';
    for (const c of cds) for (let k = 0; k < c.xs.length - 1; k++) {
      const d = Math.hypot(c.xs[k] - rp.xs[cdEnd], c.zs[k] - rp.zs[cdEnd]);
      if (d < best) { best = d; const l = Math.hypot(c.xs[k + 1] - c.xs[k], c.zs[k + 1] - c.zs[k]) || 1; flow = [(c.xs[k + 1] - c.xs[k]) / l, (c.zs[k + 1] - c.zs[k]) / l]; cdId = c.id; }
    }
    const ol = Math.hypot(rp.xs[nxt] - rp.xs[cdEnd], rp.zs[nxt] - rp.zs[cdEnd]) || 1;
    const flowDot = ((rp.xs[nxt] - rp.xs[cdEnd]) / ol) * flow[0] + ((rp.zs[nxt] - rp.zs[cdEnd]) / ol) * flow[1]; // loop heading away from the C-D end vs the C-D flow
    const toRing = flowDot > 0;
    const order: number[] = []; // travel order
    if (toRing) for (let i = cdEnd; i >= 0 && i < n; i += rp.ringEnd === 0 ? -1 : 1) order.push(i);
    else for (let i = rp.ringEnd; i >= 0 && i < n; i += rp.ringEnd === 0 ? 1 : -1) order.push(i);
    const xs = order.map((i) => rp.xs[i]), zs = order.map((i) => rp.zs[i]), ys = order.map((i) => rp.ys[i]), cum = cumOf(xs, zs);
    let first = 0, last = order.length - 1; // kept part = ramp-mesh part
    if (toRing) { last = 0; while (last + 1 < order.length && off(xs[last + 1], zs[last + 1]) > HM.maxOff) last++; }
    else { first = order.length - 1; while (first - 1 >= 0 && off(xs[first - 1], zs[first - 1]) > HM.maxOff) first--; }
    out.push({ id: rp.id, kind: 'loop', xs, zs, ys, cum, s0: cum[first], s1: cum[last], merge: true, leBack: toRing ? 10 : HA.leGap, toward: toRing ? 'ring' : [cdId.includes('-W-') ? 1 : -1, 0], toRing, flowDot });
  }
  return out;
}

function at(L: HkArrowLine, s: number): { x: number; y: number; z: number; tx: number; tz: number } {
  const c = L.cum, ss = Math.max(0, Math.min(c[c.length - 1], s));
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= ss) lo = mid; else hi = mid; }
  const d = c[lo + 1] - c[lo] || 1, t = Math.max(0, Math.min(1, (ss - c[lo]) / d));
  const dx = L.xs[lo + 1] - L.xs[lo], dz = L.zs[lo + 1] - L.zs[lo], l = Math.hypot(dx, dz) || 1;
  return { x: L.xs[lo] + dx * t, y: L.ys[lo] + (L.ys[lo + 1] - L.ys[lo]) * t, z: L.zs[lo] + dz * t, tx: dx / l, tz: dz / l };
}
/** Point at arc length s and lateral offset lat (+ = left of the travel direction), lifted over the surface. */
function pt(L: HkArrowLine, s: number, lat: number): number[] {
  const a = at(L, s);
  return [a.x + a.tz * lat, a.y + HP.lift + HA.mark, a.z - a.tx * lat];
}

/** Side of the lane-end bend (+1 left, -1 right) of a line: toward the joined road, seen from the heading at the end of the usable part. */
export function hkMergeSide(f: HkFrame, L: HkArrowLine): number {
  const a = at(L, L.s1);
  let vx: number, vz: number;
  if (L.toward === 'ring') { const ly = (a.x - f.ox) * f.nx + (a.z - f.oz) * f.nz; vx = -Math.sign(ly) * f.nx; vz = -Math.sign(ly) * f.nz; }
  else { vx = L.toward[0] * f.ex + L.toward[1] * f.nx; vz = L.toward[0] * f.ez + L.toward[1] * f.nz; }
  return vx * a.tz - vz * a.tx > 0 ? 1 : -1; // left normal of the heading = (tz, -tx)
}

/** All arrows of the interchange. */
export function buildHkArrows(f: HkFrame, ringOff?: (x: number, z: number) => number): HkArrowSet {
  const m = new A(), arrows: HkArrowInfo[] = [];
  const lines = hkArrowLines(f, ringOff);
  const h = HA.headW / 2, len = HA.shaft + HA.head;
  const straight = (L: HkArrowLine, tip: number): void => {
    const v0 = m.d.positions.length / 3;
    const sb = tip - HA.head, sa = sb - HA.shaft, n = Math.max(1, Math.ceil(HA.shaft / HA.step));
    let prev: number[][] | null = null;
    for (let j = 0; j <= n; j++) {
      const s = sa + ((sb - sa) * j) / n, cur = [pt(L, s, HA.shaftW / 2), pt(L, s, -HA.shaftW / 2)];
      if (prev) m.quad(prev[0], prev[1], cur[1], cur[0]);
      prev = cur;
    }
    m.tri(pt(L, sb, h), pt(L, sb, -h), pt(L, tip, 0));
    const a = at(L, tip);
    arrows.push({ line: L.id, kind: 'straight', s: tip, side: 0, tip: pt(L, tip, 0), tx: a.tx, tz: a.tz, v0, v1: m.d.positions.length / 3 });
  };
  const laneEnd = (L: HkArrowLine, tip: number, side: number): void => {
    const v0 = m.d.positions.length / 3;
    const sb = tip - HA.head, sa = tip - len, n = Math.max(1, Math.ceil(HA.shaft / HA.step)), D = side * HA.leShift, sl = D / len;
    const lat = (s: number): number => D * (s - sa) / len;
    let prev: number[][] | null = null;
    for (let j = 0; j <= n; j++) {
      const s = sa + ((sb - sa) * j) / n, c = lat(s), cur = [pt(L, s, c + HA.shaftW / 2), pt(L, s, c - HA.shaftW / 2)];
      if (prev) m.quad(prev[0], prev[1], cur[1], cur[0]);
      prev = cur;
    }
    const nn = Math.hypot(1, sl), dA = 1 / nn, dL = sl / nn, lb = lat(sb); // head follows the slanted shaft
    m.tri(pt(L, sb - dL * h, lb + dA * h), pt(L, sb + dL * h, lb - dA * h), pt(L, tip, D));
    const a = at(L, tip);
    arrows.push({ line: L.id, kind: 'end', s: tip, side, tip: pt(L, tip, D), tx: a.tx, tz: a.tz, v0, v1: m.d.positions.length / 3 });
  };
  for (const L of lines) {
    const straightEnd = L.merge ? L.s1 - L.leBack - HA.leGap - HA.leClear : L.s1 - HA.endGap;
    for (let s = L.s0 + HA.first; s <= straightEnd; s += HA.every) straight(L, s);
    if (L.merge) {
      const side = hkMergeSide(f, L);
      for (const back of [L.leBack + HA.leGap, L.leBack]) { const tip = L.s1 - back; if (tip - len >= L.s0 + 5) laneEnd(L, tip, side); }
    }
  }
  return { mesh: m.d, arrows, lines };
}
