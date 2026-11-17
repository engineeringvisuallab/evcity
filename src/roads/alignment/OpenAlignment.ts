// STEP J1-c4b  OPEN alignment from a start point, a table of PIs and an end point: straight - spiral - arc - spiral - straight (pure, no three.js).
// Same elements, frame and sign rule as PiAlignment.ts (game x = east, z = south, heading = atan2(dz, dx), delta > 0 = clockwise on a north-up map),
// but the road is NOT a closed loop: it starts at `start` (on the first straight) and ends at `end` (on the last straight).
// The edge start -> PI 0 gives the start heading, the edge PI n-1 -> end gives the end heading. Station 0 = start.
import { spiralConst, tangentLength } from './Clothoid';
import type { Alignment, Element, Pi, PiRow } from './PiAlignment';

const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const nl = (h: number): [number, number] => [-Math.sin(h), Math.cos(h)];

export interface OpenAlignment extends Alignment {
  /** Straight length before the first curve, between curves (index i = after curve i) and after the last curve. */
  straights: number[];
  /** Pose error at the end point (m) and heading error (deg): dead reckoning against the given end. */
  endGap: number;
  endHeadingGapDeg: number;
}

export function buildOpenAlignment(start: { x: number; z: number }, pis: Pi[], end: { x: number; z: number }): OpenAlignment {
  const n = pis.length;
  const pts = [start, ...pis, end];
  const h = pts.slice(0, -1).map((p, i) => Math.atan2(pts[i + 1].z - p.z, pts[i + 1].x - p.x)); // heading of edge i (point i -> point i+1)
  const E = pts.slice(0, -1).map((p, i) => Math.hypot(pts[i + 1].x - p.x, pts[i + 1].z - p.z));
  const delta = pis.map((_, i) => wrap(h[i + 1] - h[i]));
  const Ts = pis.map((p, i) => tangentLength(p.R, p.Ls, delta[i]));
  const thS = pis.map((p) => spiralConst(p.R, p.Ls).thetaS);
  const straights: number[] = [];
  for (let i = 0; i <= n; i++) straights.push(E[i] - (i > 0 ? Ts[i - 1] : 0) - (i < n ? Ts[i] : 0));

  let x = start.x, z = start.z, hd = h[0], s = 0;
  const elements: Element[] = [];
  const rows: PiRow[] = [];
  const push = (e: Omit<Element, 's0' | 'x' | 'z' | 'h'>): void => { elements.push({ ...e, s0: s, x, z, h: hd }); s += e.length; };
  for (let i = 0; i < n; i++) {
    const sg = delta[i] >= 0 ? 1 : -1;
    const { R, Ls } = pis[i];
    const c = spiralConst(R, Ls);
    const arc = Math.abs(delta[i]) - 2 * thS[i];
    const gl = Math.max(0, straights[i]);
    push({ kind: 'straight', pi: i, length: gl, sign: 0, R: 0, Ls: 0, sweep: 0 });
    x += gl * Math.cos(hd); z += gl * Math.sin(hd);
    const tsS = s;
    push({ kind: 'spiral-in', pi: i, length: Ls, sign: sg, R, Ls, sweep: 0 });
    const [nx, nz] = nl(hd);
    x += Math.cos(hd) * c.Xs + nx * sg * c.Ys; z += Math.sin(hd) * c.Xs + nz * sg * c.Ys; hd += sg * c.thetaS;
    const scS = s;
    const sweep = sg * Math.max(0, arc);
    push({ kind: 'arc', pi: i, length: Math.max(0, arc) * R, sign: sg, R, Ls, sweep });
    { const [ax, az] = nl(hd); const cx = x + sg * R * ax, cz = z + sg * R * az; hd += sweep; const [bx, bz] = nl(hd); x = cx - sg * R * bx; z = cz - sg * R * bz; }
    const csS = s;
    push({ kind: 'spiral-out', pi: i, length: Ls, sign: sg, R, Ls, sweep: 0 });
    const hOut = hd + sg * c.thetaS;
    { const [ox, oz] = nl(hOut); x += Math.cos(hOut) * c.Xs - ox * sg * c.Ys; z += Math.sin(hOut) * c.Xs - oz * sg * c.Ys; hd = hOut; }
    rows[i] = { index: i, delta: delta[i], thetaS: thS[i], arcAngle: arc, Ts: Ts[i], straightAfter: straights[i + 1], sameDirAsNext: i + 1 < n && delta[i] * delta[i + 1] > 0, ts: tsS, sc: scS, cs: csS, st: s };
  }
  const gl = Math.max(0, straights[n]);
  push({ kind: 'straight', pi: n - 1, length: gl, sign: 0, R: 0, Ls: 0, sweep: 0 });
  x += gl * Math.cos(hd); z += gl * Math.sin(hd);
  return {
    pis, elements, rows, length: s, start: { x: start.x, z: start.z, h: h[0] }, end: { x, z, h: hd, k: 0 },
    straights, endGap: Math.hypot(x - end.x, z - end.z), endHeadingGapDeg: (wrap(hd - h[n]) * 180) / Math.PI,
  };
}
