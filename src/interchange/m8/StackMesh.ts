// STEP 9.2 J1: MESH of the stack (pure data like RingBridgeGeometry: positions / colours / indices, absolute world coordinates, no scene).
// Built from StackGeometry (ramps, road A on the ground, road B on levels) and StackLanes:
//   deck        asphalt ribbon, lane markings (edge lines solid, lane dividers dashed), parapets
//   tapers      the exit taper (first EXIT_TAPER m) widens from 0 to the full ramp width, the entry taper (last ENTRY_TAPER m) narrows to 0 (aux lane joins the lane)
//   embankment  fill 0.5 .. 7.5 m: retaining wall each side (0.4 thick, coping)
//   viaduct     fill > 7.5 m: box girder (2.2 deep) on piers every <= PIER_SPAN with a cap beam; abutment wall where an embankment meets a viaduct
// Road A (ground) and road B (level 4) are included so the interchange stands alone until the outward M8 roads exist (step 6.3).
import { exitTaperLength, entryTaperLength } from '../../roads/standards/Checks';
import type { MeshData, Rgb } from '../../roads/ring/RingBridgeGeometry';
import { ABUT_FILL, PIER_SPAN, VIADUCT_FILL, buildStack, cOff, yB, type StackRamp } from './StackGeometry';
import { LANES } from './StackLanes';

export interface StackPlacement { x: number; z: number; y: number; yaw: number }
export const SM = {
  deckDepth: 2.2, parapetH: 0.9, parapetT: 0.3, wallT: 0.4, coping: 0.25, copingH: 0.25, pierW: 1.5, pierL: 1.4, capH: 1.2, capW: 5.0, abutT: 1.6,
  lineW: 0.15, dashLen: 3, dashGap: 9, step: 8, roadHalfLen: 900, lift: 0.03, markLift: 0.06,
} as const;
export const COLS = {
  asphalt: [0.2, 0.2, 0.21] as Rgb, rampAsphalt: [0.23, 0.23, 0.24] as Rgb, mark: [0.95, 0.95, 0.93] as Rgb, concrete: [0.7, 0.7, 0.68] as Rgb, under: [0.52, 0.52, 0.52] as Rgb,
  parapet: [0.66, 0.66, 0.65] as Rgb, wall: [0.62, 0.6, 0.57] as Rgb, pier: [0.7, 0.7, 0.68] as Rgb, gore: [0.88, 0.88, 0.86] as Rgb,
} as const;

interface Path { pts: { u: number; v: number }[]; ys: number[]; cum: number[]; halfW: number; id: string; taperIn?: number; taperOut?: number; lanes: number; asphalt: Rgb; lift: number }

class Mesh {
  readonly d: MeshData = { positions: [], colors: [], indices: [] };
  private readonly cy: number; private readonly sy: number;
  constructor(private readonly P: StackPlacement, private readonly ground?: (x: number, z: number) => number) { this.cy = Math.cos(P.yaw); this.sy = Math.sin(P.yaw); }
  world(u: number, v: number): { x: number; z: number } { return { x: this.P.x + u * this.cy + v * this.sy, z: this.P.z + u * this.sy - v * this.cy }; }
  /** Ground height above the interchange base level at a local point (0 when no ground function is given). */
  groundAt(u: number, v: number): number { if (!this.ground) return 0; const w = this.world(u, v); return this.ground(w.x, w.z) - this.P.y; }
  vert(u: number, v: number, y: number, c: Rgb): number {
    const w = this.world(u, v);
    const i = this.d.positions.length / 3;
    this.d.positions.push(w.x, this.P.y + y, w.z);
    this.d.colors.push(c[0], c[1], c[2]);
    return i;
  }
  quad(a: [number, number, number], b: [number, number, number], c: [number, number, number], e: [number, number, number], col: Rgb): void {
    const i = this.vert(a[0], a[1], a[2], col); this.vert(b[0], b[1], b[2], col); this.vert(c[0], c[1], c[2], col); this.vert(e[0], e[1], e[2], col);
    this.d.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], col: Rgb): void {
    const i = this.vert(a[0], a[1], a[2], col); this.vert(b[0], b[1], b[2], col); this.vert(c[0], c[1], c[2], col);
    this.d.indices.push(i, i + 1, i + 2);
  }
  /** Oriented box: centre (u, v), heading h (radians in the local frame), size along x across, from y0 to y1. Four sides + top. */
  box(u: number, v: number, h: number, along: number, across: number, y0: number, y1: number, col: Rgb): void {
    const c = Math.cos(h), s = Math.sin(h), a = along / 2, b = across / 2;
    const P = (la: number, lb: number): [number, number] => [u + la * c - lb * s, v + la * s + lb * c];
    const k = [P(-a, -b), P(a, -b), P(a, b), P(-a, b)];
    for (let i = 0; i < 4; i++) { const p = k[i], q = k[(i + 1) % 4]; this.quad([p[0], p[1], y0], [q[0], q[1], y0], [q[0], q[1], y1], [p[0], p[1], y1], col); }
    this.quad([k[0][0], k[0][1], y1], [k[1][0], k[1][1], y1], [k[2][0], k[2][1], y1], [k[3][0], k[3][1], y1], col);
  }
}

const sm = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function tangent(pts: { u: number; v: number }[], i: number): [number, number] {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const du = b.u - a.u, dv = b.v - a.v, l = Math.hypot(du, dv) || 1;
  return [du / l, dv / l];
}
const lateral = (pts: { u: number; v: number }[], i: number, off: number): { u: number; v: number } => { const [tu, tv] = tangent(pts, i); return { u: pts[i].u - tv * off, v: pts[i].v + tu * off }; };
const cls = (y: number): 0 | 1 | 2 => (y <= ABUT_FILL ? 0 : y <= VIADUCT_FILL ? 1 : 2);

/** Half width of the pavement at point i: the exit taper widens it from 0, the entry taper narrows it to 0. */
function widthAt(p: Path, i: number): number {
  let w = p.halfW;
  if (p.taperIn) w *= sm(p.cum[i] / p.taperIn);
  if (p.taperOut) w *= sm((p.cum[p.cum.length - 1] - p.cum[i]) / p.taperOut);
  return Math.max(w, 0.05);
}

function buildPath(m: Mesh, p: Path): void {
  const n = p.pts.length;
  const y = (i: number): number => p.ys[i];
  // deck: asphalt ribbon (ramp ribbons lie 3 cm above the road ribbons they overlap)
  for (let i = 0; i < n - 1; i++) {
    const wa = widthAt(p, i), wb = widthAt(p, i + 1);
    const a1 = lateral(p.pts, i, wa), a2 = lateral(p.pts, i, -wa), b1 = lateral(p.pts, i + 1, wb), b2 = lateral(p.pts, i + 1, -wb);
    const ya = y(i) + p.lift, yb = y(i + 1) + p.lift;
    m.quad([a1.u, a1.v, ya], [b1.u, b1.v, yb], [b2.u, b2.v, yb], [a2.u, a2.v, ya], p.asphalt);
  }
  // lane markings: solid edge lines, dashed dividers between lanes
  const lines: { off: number; dashed: boolean }[] = [{ off: p.halfW - 0.3, dashed: false }, { off: -(p.halfW - 0.3), dashed: false }];
  for (let k = 1; k < p.lanes; k++) lines.push({ off: -p.halfW + (p.halfW * 2 * k) / p.lanes, dashed: true });
  for (const ln of lines) {
    for (let i = 0; i < n - 1; i++) {
      if (ln.dashed && (p.cum[i] % (SM.dashLen + SM.dashGap)) > SM.dashLen) continue;
      const wa = widthAt(p, i) / p.halfW, wb = widthAt(p, i + 1) / p.halfW; // the lines follow the taper
      const oa = ln.off * wa, ob = ln.off * wb;
      const a1 = lateral(p.pts, i, oa + SM.lineW / 2), a2 = lateral(p.pts, i, oa - SM.lineW / 2), b1 = lateral(p.pts, i + 1, ob + SM.lineW / 2), b2 = lateral(p.pts, i + 1, ob - SM.lineW / 2);
      const ya = y(i) + p.lift + SM.markLift, yb = y(i + 1) + p.lift + SM.markLift;
      m.quad([a1.u, a1.v, ya], [b1.u, b1.v, yb], [b2.u, b2.v, yb], [a2.u, a2.v, ya], COLS.mark);
    }
  }
  // structure by height class
  const seg: (0 | 1 | 2)[] = [];
  for (let i = 0; i < n - 1; i++) seg.push(cls((y(i) + y(i + 1)) / 2));
  for (let i = 0; i < n - 1; i++) {
    const c = seg[i];
    if (c === 0) continue;
    const w = p.halfW;
    for (const sgn of [1, -1]) {
      const a = lateral(p.pts, i, sgn * (w + 0.2)), b = lateral(p.pts, i + 1, sgn * (w + 0.2));
      const ya = y(i), yb = y(i + 1);
      if (c === 1) {
        // retaining wall: ground to deck, thickness SM.wallT outward, coping on top
        const ga = m.groundAt(a.u, a.v), gb = m.groundAt(b.u, b.v);
        m.quad([a.u, a.v, ga], [b.u, b.v, gb], [b.u, b.v, yb], [a.u, a.v, ya], COLS.wall);
        const ao = lateral(p.pts, i, sgn * (w + 0.2 + SM.wallT)), bo = lateral(p.pts, i + 1, sgn * (w + 0.2 + SM.wallT));
        m.quad([ao.u, ao.v, ya + SM.copingH], [bo.u, bo.v, yb + SM.copingH], [b.u, b.v, yb + SM.copingH], [a.u, a.v, ya + SM.copingH], COLS.concrete);
      } else {
        // box girder side
        m.quad([a.u, a.v, ya - SM.deckDepth], [b.u, b.v, yb - SM.deckDepth], [b.u, b.v, yb], [a.u, a.v, ya], COLS.concrete);
      }
      // parapet (both classes)
      const pa = lateral(p.pts, i, sgn * (w + 0.35)), pb = lateral(p.pts, i + 1, sgn * (w + 0.35));
      m.quad([pa.u, pa.v, ya + p.lift], [pb.u, pb.v, yb + p.lift], [pb.u, pb.v, yb + SM.parapetH], [pa.u, pa.v, ya + SM.parapetH], COLS.parapet);
    }
    if (c === 2) {
      const a1 = lateral(p.pts, i, w + 0.2), a2 = lateral(p.pts, i, -(w + 0.2)), b1 = lateral(p.pts, i + 1, w + 0.2), b2 = lateral(p.pts, i + 1, -(w + 0.2));
      m.quad([a1.u, a1.v, y(i) - SM.deckDepth], [b1.u, b1.v, y(i + 1) - SM.deckDepth], [b2.u, b2.v, y(i + 1) - SM.deckDepth], [a2.u, a2.v, y(i) - SM.deckDepth], COLS.under);
    }
  }
  // abutments where an embankment (or the ground) meets a viaduct; piers inside each viaduct run
  const at = (s: number): { u: number; v: number; y: number; h: number } => {
    let i = 1; while (i < n - 1 && p.cum[i] < s) i++;
    const f = (s - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
    const [tu, tv] = tangent(p.pts, i);
    return { u: p.pts[i - 1].u + (p.pts[i].u - p.pts[i - 1].u) * f, v: p.pts[i - 1].v + (p.pts[i].v - p.pts[i - 1].v) * f, y: p.ys[i - 1] + (p.ys[i] - p.ys[i - 1]) * f, h: Math.atan2(tv, tu) };
  };
  let i = 0;
  while (i < n - 1) {
    if (seg[i] !== 2) { i++; continue; }
    let j = i; while (j < n - 1 && seg[j] === 2) j++;
    const s0 = p.cum[i], s1 = p.cum[j];
    for (const [s, sg] of [[s0, 1], [s1, -1]] as const) {
      if ((sg === 1 && i === 0) || (sg === -1 && j >= n - 1)) continue; // the viaduct runs into the model edge: no abutment
      const a = at(s);
      const g = m.groundAt(a.u, a.v);
      m.box(a.u - Math.cos(a.h) * sg * SM.abutT / 2 * -1, a.v - Math.sin(a.h) * sg * SM.abutT / 2 * -1, a.h, SM.abutT, (p.halfW + 1.0) * 2, g, a.y, COLS.concrete);
    }
    const L = s1 - s0, count = Math.max(1, Math.ceil(L / PIER_SPAN));
    for (let k = 1; k < count; k++) {
      const a = at(s0 + (L * k) / count);
      const g = m.groundAt(a.u, a.v);
      const top = a.y - SM.deckDepth;
      if (top - g < 1) continue;
      m.box(a.u, a.v, a.h, SM.pierL, SM.pierW, g, top - SM.capH, COLS.pier);
      m.box(a.u, a.v, a.h, SM.pierL + 0.4, Math.min(SM.capW + (p.halfW > 5 ? 6 : 0), p.halfW * 2 + 1), top - SM.capH, top, COLS.pier);
    }
    i = j;
  }
}

/** Mesh data of the whole J1: 8 ramps + the 4 carriageways of road A (ground) and road B (level 4). */
export function buildStackMesh(place: StackPlacement, ground?: (x: number, z: number) => number, ramps: StackRamp[] = buildStack()): MeshData {
  const m = new Mesh(place, ground);
  const paths: Path[] = [];
  for (const r of ramps) paths.push({ pts: r.pts, ys: r.ys, cum: r.cum, halfW: LANES.rampHalf, id: r.id, taperIn: exitTaperLength(), taperOut: entryTaperLength(), lanes: LANES.ramp, asphalt: COLS.rampAsphalt, lift: SM.lift });
  const H = SM.roadHalfLen;
  for (const road of ['A', 'B'] as const) {
    for (const sgn of [1, -1]) {
      const pts: { u: number; v: number }[] = [], ys: number[] = [], cum: number[] = [];
      for (let t = -H; t <= H + 1e-6; t += SM.step) {
        const o = cOff(t) * sgn;
        pts.push(road === 'A' ? { u: t, v: o } : { u: -o, v: t });
        ys.push(road === 'A' ? 0 : yB(t));
        cum.push(t + H);
      }
      paths.push({ pts, ys, cum, halfW: LANES.roadHalf, id: `${road}${sgn > 0 ? '+' : '-'}`, lanes: LANES.through, asphalt: COLS.asphalt, lift: 0 });
    }
  }
  for (const p of paths) buildPath(m, p);
  return m.d;
}
