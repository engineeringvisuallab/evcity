// STEP 2.2  Closed alignment from a table of PIs (points of intersection): straight - spiral - arc - spiral - straight (pure).
// Frame: game x = east, z = south. Heading = atan2(dz, dx). A positive turn (delta > 0) is clockwise on a north-up map (a right turn).
// Station 0 = end of the spiral-out of PI 0 (start of the first straight). Stations run in the order of the PI table.
import { spiralConst, spiralLocal, tangentLength } from './Clothoid';

export interface Pi { x: number; z: number; R: number; Ls: number }
export type ElementKind = 'straight' | 'spiral-in' | 'arc' | 'spiral-out';
export interface Element {
  kind: ElementKind; pi: number; s0: number; length: number;
  /** Pose at the start of the element (from dead reckoning, NOT from the PI geometry). */
  x: number; z: number; h: number;
  /** Turn sign (+1 clockwise on the map, -1 anticlockwise), 0 for a straight. */
  sign: number; R: number; Ls: number;
  /** Arc sweep (rad, signed) for kind 'arc'. */
  sweep: number;
}
export interface PiRow { index: number; delta: number; thetaS: number; arcAngle: number; Ts: number; straightAfter: number; sameDirAsNext: boolean; ts: number; sc: number; cs: number; st: number }
export interface Alignment { pis: Pi[]; elements: Element[]; rows: PiRow[]; length: number; start: { x: number; z: number; h: number }; end: { x: number; z: number; h: number; k: number } }

const nl = (h: number): [number, number] => [-Math.sin(h), Math.cos(h)]; // left normal in the (x, z) frame
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function buildAlignment(pis: Pi[]): Alignment {
  const n = pis.length;
  const h = pis.map((p, i) => { const q = pis[(i + 1) % n]; return Math.atan2(q.z - p.z, q.x - p.x); }); // heading of edge i (PI i -> PI i+1)
  const E = pis.map((p, i) => { const q = pis[(i + 1) % n]; return Math.hypot(q.x - p.x, q.z - p.z); });
  const delta = pis.map((_, i) => wrap(h[i] - h[(i - 1 + n) % n]));
  const Ts = pis.map((p, i) => tangentLength(p.R, p.Ls, delta[i]));
  const thS = pis.map((p) => spiralConst(p.R, p.Ls).thetaS);
  const g = pis.map((_, i) => E[i] - Ts[i] - Ts[(i + 1) % n]); // straight between curve i and curve i+1

  // start pose = ST of PI 0 (from PI geometry); everything after it is dead reckoning
  const start = { x: pis[0].x + Ts[0] * Math.cos(h[0]), z: pis[0].z + Ts[0] * Math.sin(h[0]), h: h[0] };
  let x = start.x, z = start.z, hd = start.h, s = 0;
  const elements: Element[] = [];
  const rows: PiRow[] = [];
  const push = (e: Omit<Element, 's0' | 'x' | 'z' | 'h'>) => { elements.push({ ...e, s0: s, x, z, h: hd }); s += e.length; };
  for (let j = 1; j <= n; j++) {
    const i = j % n; // curve i, preceded by the straight of edge j-1
    const sg = delta[i] >= 0 ? 1 : -1;
    const { R, Ls } = pis[i];
    const c = spiralConst(R, Ls);
    const arc = Math.abs(delta[i]) - 2 * thS[i];
    const gl = g[(i - 1 + n) % n];
    // straight
    push({ kind: 'straight', pi: (i - 1 + n) % n, length: gl, sign: 0, R: 0, Ls: 0, sweep: 0 });
    x += gl * Math.cos(hd); z += gl * Math.sin(hd);
    const tsS = s;
    // spiral in
    push({ kind: 'spiral-in', pi: i, length: Ls, sign: sg, R, Ls, sweep: 0 });
    const [nx, nz] = nl(hd);
    x += Math.cos(hd) * c.Xs + nx * sg * c.Ys; z += Math.sin(hd) * c.Xs + nz * sg * c.Ys; hd += sg * c.thetaS;
    const scS = s;
    // arc
    const sweep = sg * arc;
    push({ kind: 'arc', pi: i, length: arc * R, sign: sg, R, Ls, sweep });
    { const [ax, az] = nl(hd); const cx = x + sg * R * ax, cz = z + sg * R * az; hd += sweep; const [bx, bz] = nl(hd); x = cx - sg * R * bx; z = cz - sg * R * bz; }
    const csS = s;
    // spiral out
    push({ kind: 'spiral-out', pi: i, length: Ls, sign: sg, R, Ls, sweep: 0 });
    const hOut = hd + sg * c.thetaS;
    { const [ox, oz] = nl(hOut); x += Math.cos(hOut) * c.Xs - ox * sg * c.Ys; z += Math.sin(hOut) * c.Xs - oz * sg * c.Ys; hd = hOut; }
    rows[i] = { index: i, delta: delta[i], thetaS: thS[i], arcAngle: arc, Ts: Ts[i], straightAfter: g[i], sameDirAsNext: delta[i] * delta[(i + 1) % n] > 0, ts: tsS, sc: scS, cs: csS, st: s };
  }
  return { pis, elements, rows, length: s, start, end: { x, z, h: hd, k: 0 } };
}

export interface Sample { s: number; x: number; z: number; h: number; k: number; kind: ElementKind }

/** Pose and curvature at station s (0 <= s <= length). */
export function poseAt(al: Alignment, s: number): Sample {
  const els = al.elements;
  let lo = 0, hi = els.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (els[m].s0 <= s) lo = m; else hi = m - 1; }
  const e = els[lo];
  const l = Math.min(Math.max(s - e.s0, 0), e.length);
  const [nx, nz] = nl(e.h);
  if (e.kind === 'straight') return { s, x: e.x + l * Math.cos(e.h), z: e.z + l * Math.sin(e.h), h: e.h, k: 0, kind: e.kind };
  if (e.kind === 'spiral-in') {
    const p = spiralLocal(l, e.R, e.Ls);
    return { s, x: e.x + Math.cos(e.h) * p.x + nx * e.sign * p.y, z: e.z + Math.sin(e.h) * p.x + nz * e.sign * p.y, h: e.h + e.sign * p.theta, k: e.sign * l / (e.R * e.Ls), kind: e.kind };
  }
  if (e.kind === 'arc') {
    const cx = e.x + e.sign * e.R * nx, cz = e.z + e.sign * e.R * nz;
    const h = e.h + e.sweep * (e.length > 0 ? l / e.length : 0);
    const [bx, bz] = nl(h);
    return { s, x: cx - e.sign * e.R * bx, z: cz - e.sign * e.R * bz, h, k: e.sign / e.R, kind: e.kind };
  }
  // spiral out: distance m = Ls - l measured back from the ST
  const c = spiralConst(e.R, e.Ls);
  const hOut = e.h + e.sign * c.thetaS;
  const [ox, oz] = nl(hOut);
  const stx = e.x + Math.cos(hOut) * c.Xs - ox * e.sign * c.Ys, stz = e.z + Math.sin(hOut) * c.Xs - oz * e.sign * c.Ys;
  const m = e.Ls - l;
  const p = spiralLocal(m, e.R, e.Ls);
  return { s, x: stx - Math.cos(hOut) * p.x + ox * e.sign * p.y, z: stz - Math.sin(hOut) * p.x + oz * e.sign * p.y, h: hOut - e.sign * p.theta, k: e.sign * m / (e.R * e.Ls), kind: e.kind };
}

/** Uniform samples (about ds apart, exactly length / n) around the closed loop. */
export function sampleAlignment(al: Alignment, ds: number): { ds: number; samples: Sample[] } {
  const n = Math.ceil(al.length / ds);
  const d = al.length / n;
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) out.push(poseAt(al, i * d));
  return { ds: d, samples: out };
}

export interface ClosureReport { gap: number; headingGapDeg: number; curvatureGap: number }
/** Closure of the dead-reckoned loop: end pose vs start pose. */
export function closure(al: Alignment): ClosureReport {
  return {
    gap: Math.hypot(al.end.x - al.start.x, al.end.z - al.start.z),
    headingGapDeg: Math.abs(wrap(al.end.h - al.start.h)) * 180 / Math.PI,
    curvatureGap: Math.abs(al.end.k - 0),
  };
}
