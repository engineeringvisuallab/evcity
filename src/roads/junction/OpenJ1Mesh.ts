// STEP J1-g4: PLAN + MESH of the OPEN ground interchange ("open star") at J1 = C10 (-87, -277), yaw 37.5 (HANDOFF_ROAD_DESIGN.md 15.8.9 - 15.8.12). Pure math, no three.js.
// Replaces the old box mesh (GroundJ1Mesh, removed in g4). Geometry numbers come from OpenJ1Geometry (g2); heights come from J1Terrain.levelAt (g3), the same function that carves the ground,
// so the mesh lies 2 cm on the ground it made (marks 4.5 cm, islands 14 cm).
//
// TWO LAYERS:
//   buildOpenJ1Plan()  -> flat 2D plan in the J1 local frame (x = e, y = n): paved surface, median islands, corner islands, marks, arrows, stop lines, zebra. No heights. The check script reads this.
//   buildOpenJ1Mesh(t) -> triangles (positions, vertex colours, indices) in absolute world coordinates, parent = world.root.
// ARM FRAME as in OpenJ1Geometry: s = outward along the arm axis, o = lateral, + = INBOUND side (left-hand traffic). Inbound traffic drives toward -s.
import { DIRS, J1_APPROACH_INPUTS, rotCW, type Dir, type V2 } from './GroundJ1Geometry';
import { OPEN_PARAMS, buildArm, deriveOpen, pavedOutline, type OpenArm } from './OpenJ1Geometry';
import { J1_S_END, type J1Terrain } from './GroundJ1Terrain';

export const OPEN_MESH = {
  cell: 8,            // m, grid cell the surface is cut into (so every vertex can follow the ground)
  markEdge: 4,        // m, longest edge of a mark triangle
  kerbEdge: 8,        // m, longest kerb wall piece
  lift: 0.02, mark: 0.045, islandH: 0.14,
  laneW: 0.15, edgeW: 0.18, stopW: 0.45, guideW: 0.12,
  dashOn: 3, dashPeriod: 9, guideOn: 1.5, guidePeriod: 4.5,
  edgeInset: 0.25,    // m, edge line inside the lane edge
  kerbOffset: 0.3,    // m, edge line beside a kerb
  zebraBar: 0.5, zebraPitch: 1.0, zebraLen: 3.0, zebraInset: 0.3,
  cornerExtra: 6,     // m, corner island reaches this far beyond the arc end along the arm edge
  arrowLen: 3.6,
};

export type MarkKind = 'lane' | 'edge' | 'stop' | 'zebra' | 'arrow' | 'guide';
export interface PlanMark { kind: MarkKind; arm: Dir | null; poly: V2[] }
export interface PlanIsland { id: string; kind: 'median' | 'corner'; arm: Dir; ring: V2[] }
export interface PlanArrow { arm: Dir; lane: string; type: 'through' | 'right' | 'left'; o: number; sTip: number; pieces: V2[][] }
export interface PlanStop { arm: Dir; lane: 'through' | 'pocket'; o0: number; o1: number; s0: number; s1: number }
export interface PlanZebra { arm: Dir; side: 'in' | 'out'; bars: number; o0: number; o1: number; s0: number; s1: number }
export interface OpenJ1Plan {
  arms: Record<Dir, OpenArm>; outline: V2[]; surface: V2[][]; islands: PlanIsland[]; marks: PlanMark[];
  arrows: PlanArrow[]; stops: PlanStop[]; zebras: PlanZebra[]; sEnd: number;
}

const rad = Math.PI / 180;
const A = (k: number, o: number, s: number): V2 => rotCW([o, s], k);
const dist = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: V2, b: V2, f: number): V2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const cross = (o: V2, a: V2, b: V2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
export const ringArea = (p: ReadonlyArray<V2>): number => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };

/** A strip of width w along a -> b (convex quad). */
function strip(a: V2, b: V2, w: number): V2[] | null {
  const l = dist(a, b); if (l < 1e-6) return null;
  const nx = (-(b[1] - a[1]) / l) * (w / 2), ny = ((b[0] - a[0]) / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}
/** Dash pieces along a polyline: [k * period, k * period + on]. */
function dashPieces(pts: ReadonlyArray<V2>, on: number, period: number): Array<[V2, V2]> {
  const out: Array<[V2, V2]> = []; let d = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], l = dist(a, b); if (l < 1e-9) continue;
    for (let k = Math.floor(d / period); k * period < d + l; k++) {
      const lo = Math.max(k * period, d), hi = Math.min(k * period + on, d + l);
      if (hi - lo > 0.05) out.push([lerp(a, b, (lo - d) / l), lerp(a, b, (hi - d) / l)]);
    }
    d += l;
  }
  return out;
}

export function buildOpenJ1Plan(inputs = J1_APPROACH_INPUTS): OpenJ1Plan {
  const D = deriveOpen(), P = OPEN_PARAMS, M = OPEN_MESH, W = P.W, SE = J1_S_END;
  const arms = Object.fromEntries(DIRS.map((d) => [d, buildArm(d, inputs)])) as Record<Dir, OpenArm>;
  const outline = pavedOutline(arms);
  const surface: V2[][] = [outline];
  const islands: PlanIsland[] = [], marks: PlanMark[] = [], arrows: PlanArrow[] = [], stops: PlanStop[] = [], zebras: PlanZebra[] = [];
  const sL = D.sStop + 0.5; // marks along the arm start behind the stop line

  const addSolid = (kind: MarkKind, arm: Dir, pts: V2[], w: number): void => { for (let i = 0; i + 1 < pts.length; i++) { const q = strip(pts[i], pts[i + 1], w); if (q) marks.push({ kind, arm, poly: q }); } };
  const addDash = (kind: MarkKind, arm: Dir, pts: V2[], w: number, on: number, period: number): void => { for (const [a, b] of dashPieces(pts, on, period)) { const q = strip(a, b, w); if (q) marks.push({ kind, arm, poly: q }); } };
  const fnLine = (k: number, f: (s: number) => number, s0: number, s1: number, kn: number[]): V2[] => {
    const set = new Set<number>([s0, s1]); for (const q of kn) if (q > s0 + 1e-6 && q < s1 - 1e-6) set.add(q);
    return [...set].sort((x, y) => x - y).map((s) => A(k, f(s), s));
  };

  for (const d of DIRS) {
    const a = arms[d], k = a.k;
    const kn = [D.sStop + a.L2, a.sR2end, D.sStop + a.L1, a.sR1end, a.sh0, a.sh1, D.sDiv1, D.sDiv0, D.sMg1, D.sMg2];
    const mR = (s: number): number => a.t(s) - a.w1(s) - a.w2(s); // right edge of the median island

    // ---- paved surface: the g2 outline ends at sZone, the plain M8 section continues to S_END (the arm road starts there)
    if (a.sZone < SE) { const o = a.t(a.sZone) + P.nThrough * W; surface.push([A(k, -o, a.sZone), A(k, o, a.sZone), A(k, o, SE), A(k, -o, SE)]); }

    // ---- median island (also the pedestrian refuge): from the star edge s = B to S_END
    {
      const ks = [...new Set([D.B, D.sStop + a.L2, a.sR2end, D.sStop + a.L1, a.sR1end, a.sh0, a.sh1, SE])].filter((s) => s >= D.B - 1e-9 && s <= SE + 1e-9).sort((x, y) => x - y);
      const left = ks.map((s) => A(k, -a.t(s), s)), right = ks.map((s) => A(k, mR(s), s));
      islands.push({ id: `${d}-median`, kind: 'median', arm: d, ring: [...left, ...right.slice().reverse()] });
    }

    // ---- lane lines
    for (let i = 1; i <= 3; i++) addDash('lane', d, fnLine(k, (s) => a.t(s) + i * W, sL, SE, kn), M.laneW, M.dashOn, M.dashPeriod); // T1|T2 ...
    for (let i = 1; i <= 3; i++) addDash('lane', d, fnLine(k, (s) => -(a.t(s) + i * W), sL, SE, kn), M.laneW, M.dashOn, M.dashPeriod); // O1|O2 ...
    addDash('lane', d, fnLine(k, (s) => a.t(s) - a.w1(s), sL, a.sR2end, kn), M.laneW, M.dashOn, M.dashPeriod); // R1|R2
    addDash('lane', d, fnLine(k, (s) => a.t(s), sL, a.sR1end, kn), M.laneW, M.dashOn, M.dashPeriod); // R1|T1
    // exit lane (left slip): solid divider in the full-width part, broken in the diverge taper, solid outer edge
    addSolid('edge', d, fnLine(k, (s) => a.t(s) + P.nThrough * W, D.Cx, D.sDiv1, kn), M.edgeW);
    addDash('lane', d, fnLine(k, (s) => a.t(s) + P.nThrough * W, D.sDiv1, D.sDiv0 - 12, kn), M.laneW, M.dashOn, M.dashPeriod);
    addSolid('edge', d, fnLine(k, (s) => a.t(s) + P.nThrough * W + a.ws(s) - M.edgeInset, D.Cx, SE, kn), M.edgeW);
    // receiving lane (acceleration lane of the slip road of the arm before): broken divider, solid outer edge
    addDash('lane', d, fnLine(k, (s) => -(a.t(s) + P.nThrough * W), D.Cx, D.sMg2 - 12, kn), M.laneW, M.dashOn, M.dashPeriod);
    addSolid('edge', d, fnLine(k, (s) => -(a.t(s) + P.nThrough * W + a.wr(s)) + M.edgeInset, D.Cx, SE, kn), M.edgeW);
    // edge lines beside the median kerbs
    addSolid('edge', d, fnLine(k, (s) => -(a.t(s) + M.kerbOffset), sL, SE, kn), M.edgeW);
    addSolid('edge', d, fnLine(k, (s) => mR(s) + M.kerbOffset, sL, SE, kn), M.edgeW);

    // ---- stop lines (pockets and through lanes have their own phase) at the outer edge of the zebra
    {
      const s1 = D.sStop, s0 = D.sStop - M.stopW;
      for (const [lane, o0, o1] of [['pocket', D.t0 - 2 * W, D.t0], ['through', D.t0, D.t0 + P.nThrough * W]] as const) {
        marks.push({ kind: 'stop', arm: d, poly: [A(k, o0, s0), A(k, o1, s0), A(k, o1, s1), A(k, o0, s1)] });
        stops.push({ arm: d, lane, o0, o1, s0, s1 });
      }
    }
    // ---- zebra: bars along the road, in the crossing space B .. sStop, gap at the median refuge
    {
      const s0 = D.B + 0.25, s1 = s0 + M.zebraLen;
      for (const [side, lo, hi] of [['in', D.t0 - 2 * W, D.t0 + P.nThrough * W], ['out', -(D.t0 + P.nThrough * W), -D.t0]] as const) {
        const n = Math.floor((hi - lo - 2 * M.zebraInset) / M.zebraPitch);
        for (let i = 0; i < n; i++) { const o0 = lo + M.zebraInset + i * M.zebraPitch, o1 = o0 + M.zebraBar; marks.push({ kind: 'zebra', arm: d, poly: [A(k, o0, s0), A(k, o1, s0), A(k, o1, s1), A(k, o0, s1)] }); }
        zebras.push({ arm: d, side, bars: n, o0: lo, o1: hi, s0, s1 });
      }
    }
    // ---- arrows (traffic drives toward -s; "right" = toward -o, "left" = toward +o)
    {
      const arrow = (lane: string, type: PlanArrow['type'], o: number, sTip: number): void => {
        const L = M.arrowLen, st = 0.2, pieces: V2[][] = [];
        const P2 = (oo: number, ss: number): V2 => A(k, oo, ss);
        if (type === 'through') {
          pieces.push([P2(o - st, sTip + 1.5), P2(o + st, sTip + 1.5), P2(o + st, sTip + L), P2(o - st, sTip + L)]); // stem
          pieces.push([P2(o, sTip), P2(o + 0.65, sTip + 1.5), P2(o - 0.65, sTip + 1.5)]); // head
        } else {
          const sg = type === 'right' ? -1 : 1, sc = sTip + 0.8;
          pieces.push([P2(o - st, sc - 0.2), P2(o + st, sc - 0.2), P2(o + st, sTip + L), P2(o - st, sTip + L)]); // stem
          pieces.push([P2(o, sc - 0.2), P2(o + sg * 0.7, sc - 0.2), P2(o + sg * 0.7, sc + 0.2), P2(o, sc + 0.2)]); // bend
          pieces.push([P2(o + sg * 0.6, sc + 0.65), P2(o + sg * 1.5, sc), P2(o + sg * 0.6, sc - 0.65)]); // head
        }
        for (const poly of pieces) marks.push({ kind: 'arrow', arm: d, poly });
        arrows.push({ arm: d, lane, type, o, sTip, pieces });
      };
      for (const sTip of [D.sStop + 4, D.sStop + 50]) {
        for (let i = 1; i <= P.nThrough; i++) arrow(`T${i}`, 'through', D.t0 + (i - 0.5) * W, sTip);
        arrow('R1', 'right', D.t0 - 0.5 * W, sTip); arrow('R2', 'right', D.t0 - 1.5 * W, sTip);
      }
      for (const sTip of [D.sDiv1 - 14, D.Cx + 25]) arrow('slip', 'left', a.slip(sTip), sTip);
    }
    // ---- guide lines inside the star: right turn (between the two concentric arcs), U-turn
    {
      const oP1 = D.t0 - W / 2, oP2 = D.t0 - W - W / 2, r1 = oP1 + D.sStop, r2 = oP2 + D.sStop;
      const sT1 = -(D.t0 + 1.5 * W), sc = sT1 + r1, oc = oP1 - r1, rm = (r1 + r2) / 2;
      const pts: V2[] = [A(k, oc + rm, D.B - 0.75), A(k, oc + rm, sc)];
      for (let g = 0; g >= -90; g -= 3) pts.push(A(k, oc + rm * Math.cos(g * rad), sc + rm * Math.sin(g * rad)));
      addDash('guide', d, pts, M.guideW, M.guideOn, M.guidePeriod);
      const oT = -(D.t0 + 3.5 * W), ru = (oP2 - oT) / 2, ou = oP2 - ru;
      const u: V2[] = []; for (let g = 0; g >= -180; g -= 5) u.push(A(k, ou + ru * Math.cos(g * rad), P.uStart + ru * Math.sin(g * rad)));
      addDash('guide', d, u, M.guideW, M.guideOn, M.guidePeriod);
      // star side edge of the left slip lane (arc), broken: traffic of the star may use it to reach the slip lane
      const rs = P.slipR + W / 2 - 0.1, e: V2[] = []; for (let g = 0; g <= 90; g += 2) e.push(A(k, D.Cx - rs * Math.cos(g * rad), D.Cx - rs * Math.sin(g * rad)));
      addDash('guide', d, e, M.laneW, M.dashOn, M.dashPeriod);
    }
    // ---- corner island between the slip arc of this arm and the receiving lane of the next arm (outside the arc, outside the paved outline)
    {
      const ri = P.slipR - W / 2, sI = D.Cx + M.cornerExtra, edge = D.Cx - ri; // edge = 23.4 = outer edge of the slip lane
      const ring: V2[] = [A(k, edge, sI), A(k, edge, D.Cx)];
      for (let g = 1; g <= 89; g += 2) ring.push(A(k, D.Cx - ri * Math.cos(g * rad), D.Cx - ri * Math.sin(g * rad)));
      ring.push(A(k, D.Cx, edge), A(k, sI, edge));
      islands.push({ id: `${d}-corner`, kind: 'corner', arm: d, ring });
    }
  }
  return { arms, outline, surface, islands, marks, arrows, stops, zebras, sEnd: SE };
}

// ------------------------------------------------------------------ triangulation helpers
const inTriStrict = (p: V2, a: V2, b: V2, c: V2): boolean => cross(a, b, p) > 1e-9 && cross(b, c, p) > 1e-9 && cross(c, a, p) > 1e-9;
/** Ear clipping of a simple polygon (either winding). Duplicate and collinear points are dropped. */
export function earClip(poly: ReadonlyArray<V2>): V2[][] {
  let p: V2[] = poly.filter((q, i) => dist(q, poly[(i + 1) % poly.length]) > 1e-7);
  for (let again = true; again && p.length > 3;) {
    again = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs(cross(a, b, c)) < 1e-9 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) { p.splice(i, 1); again = true; break; }
    }
  }
  if (ringArea(p) < 0) p = p.slice().reverse();
  const idx = p.map((_, i) => i), tris: V2[][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * p.length * p.length) {
    const m = idx.length; let cut = false;
    for (let i = 0; i < m && !cut; i++) {
      const ia = idx[(i + m - 1) % m], ib = idx[i], ic = idx[(i + 1) % m], a = p[ia], b = p[ib], c = p[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let bad = false;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTriStrict(p[j], a, b, c)) { bad = true; break; } }
      if (bad) continue;
      tris.push([a, b, c]); idx.splice(i, 1); cut = true;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([p[idx[0]], p[idx[1]], p[idx[2]]]);
  return tris;
}
/** Sutherland-Hodgman against an axis-aligned cell; the subject is convex, so the result is convex. */
function clipCell(poly: V2[], x0: number, x1: number, y0: number, y1: number): V2[] {
  const pass = (pts: V2[], inside: (p: V2) => boolean, hit: (a: V2, b: V2) => V2): V2[] => {
    const out: V2[] = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(hit(a, b)); }
    return out;
  };
  let r = poly;
  r = pass(r, (p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]); if (r.length < 3) return [];
  r = pass(r, (p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]); if (r.length < 3) return [];
  r = pass(r, (p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]); if (r.length < 3) return [];
  r = pass(r, (p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]);
  return r.length < 3 ? [] : r;
}
/** Triangles of a simple polygon, cut at the grid lines so no triangle is wider than `cell`. */
export function gridTriangles(poly: ReadonlyArray<V2>, cell: number): V2[][] {
  const out: V2[][] = [];
  for (const t of earClip(poly)) {
    const xs = t.map((q) => q[0]), ys = t.map((q) => q[1]);
    const i0 = Math.floor(Math.min(...xs) / cell), i1 = Math.floor(Math.max(...xs) / cell), j0 = Math.floor(Math.min(...ys) / cell), j1 = Math.floor(Math.max(...ys) / cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = clipCell(t, i * cell, (i + 1) * cell, j * cell, (j + 1) * cell);
      if (c.length < 3 || Math.abs(ringArea(c)) < 1e-6) continue;
      for (let q = 1; q + 1 < c.length; q++) if (Math.abs(cross(c[0], c[q], c[q + 1])) > 1e-6) out.push([c[0], c[q], c[q + 1]]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ mesh
export interface OpenJ1MeshData {
  positions: number[]; colors: number[]; indices: number[];
  /** triangle index ranges [start, end) in emit order */
  parts: { surface: [number, number]; island: [number, number]; kerb: [number, number]; mark: [number, number] };
  stats: { tris: number; verts: number; surfaceTris: number; islandTris: number; kerbTris: number; markTris: number };
}
const ASPHALT = [0.16, 0.16, 0.17], CONCRETE = [0.55, 0.55, 0.52], KERB = [0.66, 0.66, 0.63], WHITE = [0.92, 0.92, 0.9];

export function buildOpenJ1Mesh(t: Pick<J1Terrain, 'toWorld' | 'levelAt'>, plan: OpenJ1Plan = buildOpenJ1Plan()): OpenJ1MeshData {
  const M = OPEN_MESH;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const shared = new Map<string, number>();
  let nv = 0, nt = 0;
  const vert = (p: V2, lift: number, col: ReadonlyArray<number>, layer: string): number => {
    const key = `${layer}|${p[0].toFixed(3)}|${p[1].toFixed(3)}`;
    const f = shared.get(key); if (f !== undefined) return f;
    const [x, z] = t.toWorld(p[0], p[1]);
    positions.push(x, t.levelAt(x, z) + lift, z); colors.push(col[0], col[1], col[2]);
    shared.set(key, nv); return nv++;
  };
  const tri = (a: number, b: number, c: number, wall = false): void => { // wind so that the face looks up (+y)
    if (a === b || b === c || a === c) return; // corners closer than 1 mm share a vertex: no triangle
    const ax = positions[a * 3], az = positions[a * 3 + 2], bx = positions[b * 3], bz = positions[b * 3 + 2], cx = positions[c * 3], cz = positions[c * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (!wall && Math.abs(ny) < 1e-6) return; // flat sliver (area < 0.5 mm2)
    if (ny >= 0) indices.push(a, b, c); else indices.push(a, c, b);
    nt++;
  };
  const fillGrid = (poly: V2[], lift: number, col: ReadonlyArray<number>, layer: string): void => {
    for (const c of gridTriangles(poly, M.cell)) tri(vert(c[0], lift, col, layer), vert(c[1], lift, col, layer), vert(c[2], lift, col, layer));
  };
  /** Convex mark polygon: quads are cut into a grid of <= markEdge, triangles by halving. */
  const fillConvex = (poly: ReadonlyArray<V2>, lift: number, col: ReadonlyArray<number>, layer: string): void => {
    if (poly.length === 4) {
      const [p0, p1, p2, p3] = poly;
      const nu = Math.max(1, Math.ceil(Math.max(dist(p0, p1), dist(p3, p2)) / M.markEdge)), nw = Math.max(1, Math.ceil(Math.max(dist(p0, p3), dist(p1, p2)) / M.markEdge));
      const g: number[][] = [];
      for (let j = 0; j <= nw; j++) { const row: number[] = []; for (let i = 0; i <= nu; i++) row.push(vert(lerp(lerp(p0, p1, i / nu), lerp(p3, p2, i / nu), j / nw), lift, col, layer)); g.push(row); }
      for (let j = 0; j < nw; j++) for (let i = 0; i < nu; i++) { tri(g[j][i], g[j][i + 1], g[j + 1][i + 1]); tri(g[j][i], g[j + 1][i + 1], g[j + 1][i]); }
      return;
    }
    const [a, b, c] = poly;
    if (Math.max(dist(a, b), dist(b, c), dist(c, a)) <= M.markEdge) { tri(vert(a, lift, col, layer), vert(b, lift, col, layer), vert(c, lift, col, layer)); return; }
    const ab = lerp(a, b, 0.5), bc = lerp(b, c, 0.5), ca = lerp(c, a, 0.5);
    fillConvex([a, ab, ca], lift, col, layer); fillConvex([ab, b, bc], lift, col, layer); fillConvex([ca, bc, c], lift, col, layer); fillConvex([ab, bc, ca], lift, col, layer);
  };

  const t0 = nt;
  for (const s of plan.surface) fillGrid(s, M.lift, ASPHALT, 'a');
  const t1 = nt;
  for (const i of plan.islands) fillGrid(i.ring, M.islandH, CONCRETE, 'c');
  const t2 = nt;
  for (const i of plan.islands) { // kerb walls on the whole boundary of every island
    for (let q = 0; q < i.ring.length; q++) {
      const a = i.ring[q], b = i.ring[(q + 1) % i.ring.length], n = Math.max(1, Math.ceil(dist(a, b) / M.kerbEdge));
      if (dist(a, b) < 1e-6) continue;
      for (let r = 0; r < n; r++) {
        const p = lerp(a, b, r / n), s = lerp(a, b, (r + 1) / n);
        const v0 = vert(p, 0, KERB, 'k0'), v1 = vert(s, 0, KERB, 'k0'), v2 = vert(s, M.islandH, KERB, 'k1'), v3 = vert(p, M.islandH, KERB, 'k1');
        tri(v0, v1, v2, true); tri(v0, v2, v3, true);
      }
    }
  }
  const t3 = nt;
  for (const m of plan.marks) fillConvex(m.poly, M.mark, WHITE, 'w');
  const t4 = nt;
  return {
    positions, colors, indices,
    parts: { surface: [t0, t1], island: [t1, t2], kerb: [t2, t3], mark: [t3, t4] },
    stats: { tris: nt, verts: nv, surfaceTris: t1 - t0, islandTris: t2 - t1, kerbTris: t3 - t2, markTris: t4 - t3 },
  };
}
