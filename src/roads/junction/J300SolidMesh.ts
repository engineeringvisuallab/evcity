// J7-C SOLID MESH (pure math, no three.js): turns J300StructC data into one triangle soup with vertex colours. World coordinates (x east, z south, y up).
// Parts (triangle ranges): surface (deck, island, arm / ramp roads), concrete (walls, parapets, box roof), slope (earth), furniture (poles, lamps, gantries, signs). Collision = the first three.
import { J300_STRUCT_C as C } from './J300StructC';

export interface J300MeshData { positions: number[]; colors: number[]; indices: number[]; parts: { surface: [number, number]; concrete: [number, number]; slope: [number, number]; furniture: [number, number] } }
type RGB = [number, number, number];
const ASPHALT: RGB = [0.17, 0.17, 0.18], SHOULDER: RGB = [0.36, 0.36, 0.35], CONCRETE: RGB = [0.62, 0.62, 0.6], FACE: RGB = [0.55, 0.55, 0.52], PARAPET: RGB = [0.74, 0.74, 0.72], GRASS: RGB = [0.26, 0.42, 0.18], EARTH: RGB = [0.38, 0.32, 0.22], POLE: RGB = [0.45, 0.47, 0.5], LAMP: RGB = [1, 0.93, 0.7], BOARD: RGB = [0.05, 0.38, 0.2], KERB: RGB = [0.8, 0.75, 0.2];
const PARAPET_W = 0.5, PARAPET_H = 0.9;

class Soup {
  positions: number[] = []; colors: number[] = []; indices: number[] = [];
  vert(x: number, y: number, z: number, c: RGB): number { this.positions.push(x, y, z); this.colors.push(c[0], c[1], c[2]); return this.positions.length / 3 - 1; }
  tri(a: number, b: number, c: number): void { this.indices.push(a, b, c); }
  quad(p: number[][], c: RGB): void { const i = p.map((q) => this.vert(q[0], q[1], q[2], c)); this.tri(i[0], i[1], i[2]); this.tri(i[0], i[2], i[3]); }
  get tris(): number { return this.indices.length / 3; }
}

/** strip between two polylines of 3D points A[i] and B[i] */
function strip(s: Soup, A: number[][], B: number[][], c: RGB): void { for (let i = 0; i < A.length - 1; i++) s.quad([A[i], B[i], B[i + 1], A[i + 1]], c); }

/** Box on its bottom y0, centre (cx, cz), long axis along (dx, dz) (any length), size lx (along) x ly (height) x lz (across). */
function obox(s: Soup, cx: number, y0: number, cz: number, dx: number, dz: number, lx: number, ly: number, lz: number, c: RGB): void {
  const L = Math.hypot(dx, dz) || 1; const ax = dx / L, az = dz / L, bx = -az, bz = ax; const h = lx / 2, w = lz / 2;
  const P = (a: number, b: number, y: number): number[] => [cx + ax * a + bx * b, y, cz + az * a + bz * b];
  const bot = [P(-h, -w, y0), P(h, -w, y0), P(h, w, y0), P(-h, w, y0)], top = bot.map((q) => [q[0], y0 + ly, q[2]]);
  s.quad([top[0], top[1], top[2], top[3]], c);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; s.quad([bot[i], bot[j], top[j], top[i]], c); }
}

type W = readonly number[];
/** retaining wall slab: visible face on the polyline, back = face moved by -n * thick; top cap; parapet on the top (kind != wing / box). */
function wall(s: Soup, pts: readonly W[], thick: number, parapet: boolean, faceC: RGB): void {
  const F: number[][] = [], Fb: number[][] = [], Bk: number[][] = [], Bb: number[][] = [], Tf: number[][] = [], Tb: number[][] = [];
  for (const p of pts) { const [x, z, top, bot, nx, nz] = p; F.push([x, top, z]); Fb.push([x, bot, z]); Bk.push([x - nx * thick, top, z - nz * thick]); Bb.push([x - nx * thick, bot, z - nz * thick]); }
  strip(s, Fb, F, faceC); strip(s, Bk, Bb, faceC); strip(s, F, Bk, CONCRETE);
  if (!parapet) return; Tf.length = 0; Tb.length = 0;
  const f: number[][] = [], g: number[][] = [];
  for (const p of pts) { const [x, z, top, , nx, nz] = p; f.push([x - nx * 0.02, top, z - nz * 0.02]); g.push([x - nx * (0.02 + PARAPET_W), top, z - nz * (0.02 + PARAPET_W)]); }
  const fu = f.map((q) => [q[0], q[1] + PARAPET_H, q[2]]), gu = g.map((q) => [q[0], q[1] + PARAPET_H, q[2]]);
  strip(s, f, fu, PARAPET); strip(s, gu, g, PARAPET); strip(s, fu, gu, PARAPET);
}

/** J300-FIX-1: cut the start of a wall polyline that lies inside the deck circle (r < face): the first kept point is interpolated exactly on r = face. */
function clipToDeckFace(pts: readonly W[], cx: number, cz: number, face: number): readonly W[] {
  const r = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz));
  const i = r.findIndex((v) => v >= face);
  if (i <= 0) return pts; // nothing inside the circle (or all inside: leave it, the data is not what the fix expects)
  const t = (face - r[i - 1]) / (r[i] - r[i - 1] || 1), a = pts[i - 1], c = pts[i];
  const q = a.map((v, k) => v + (c[k] - v) * t); const nl = Math.hypot(q[4], q[5]) || 1; q[4] /= nl; q[5] /= nl;
  return [q, ...pts.slice(i)];
}

function slope(s: Soup, pts: readonly W[]): void { const E = pts.map((p) => [p[0], p[2], p[1]]), T = pts.map((p) => [p[3], p[5], p[4]]); strip(s, E, T, EARTH); }

export function buildJ300Mesh(): J300MeshData {
  const s = new Soup(); const parts = {} as J300MeshData['parts']; let t0 = 0; const mark = (k: keyof J300MeshData['parts']): void => { parts[k] = [t0, s.tris]; t0 = s.tris; };
  const D = C.deck, cs = Math.cos(D.yaw), sn = Math.sin(D.yaw); const W = (u: number, v: number): [number, number] => [D.cx + u * cs + v * sn, D.cz + u * sn - v * cs];
  // ---- surface: roundabout deck (circulating carriageway 48..62, shoulder 62..62.6, island < 48), arm roads, ramp roads
  { const N = 72, y = D.y; const ring = (r: number, yy: number): number[][] => { const o: number[][] = []; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const [x, z] = W(r * Math.cos(a), r * Math.sin(a)); o.push([x, yy, z]); } return o; };
    strip(s, ring(48, y), ring(62, y), ASPHALT); strip(s, ring(62, y), ring(D.face, y), SHOULDER);
    const c0 = ring(0, y + 0.12); const rIn = ring(47.7, y + 0.12); strip(s, c0, rIn, GRASS); strip(s, ring(48, y), ring(48, y + 0.12), KERB); strip(s, ring(47.7, y + 0.12), ring(48, y + 0.12), KERB);
    // island disc as a fan from the centre
    const wc = W(0, 0); const ctr = s.vert(wc[0], y + 0.12, wc[1], GRASS); const ri = rIn.map((q) => s.vert(q[0], q[1], q[2], GRASS)); for (let i = 0; i < N; i++) s.tri(ctr, ri[i + 1], ri[i]); }
  for (const A of C.surfArms) { const P = A.pts; const L: number[][] = [], L2: number[][] = [], R2: number[][] = [], R: number[][] = []; const e0 = A.top - 0.6;
    for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; const nx = -dz / l, nz = dx / l; const y = P[i][2] + 0.015; const x = P[i][0], z = P[i][1]; const hw = (P[i] as readonly number[])[3] as number | undefined; const tp = hw ?? A.top, e = hw !== undefined ? hw - 0.6 : e0; /* J10: R4 taper at the join */
      L.push([x + nx * tp, y, z + nz * tp]); L2.push([x + nx * e, y, z + nz * e]); R2.push([x - nx * e, y, z - nz * e]); R.push([x - nx * tp, y, z - nz * tp]); }
    strip(s, R, R2, SHOULDER); strip(s, R2, L2, ASPHALT); strip(s, L2, L, SHOULDER); }
  for (const Rp of C.surfRamps) { const q = Rp.rows; const a = q.map((r) => [r[0], r[8] + 0.015, r[1]]), b = q.map((r) => [r[2], r[8] + 0.015, r[3]]), c = q.map((r) => [r[4], r[8] + 0.015, r[5]]), d = q.map((r) => [r[6], r[8] + 0.015, r[7]]); strip(s, b, c, ASPHALT); const inRing = (r: number[]): boolean => Math.hypot(r[0] - D.cx, r[1] - D.cz) < D.ro; for (let i = 0; i < q.length - 1; i++) { if (inRing(q[i]) && inRing(q[i + 1])) continue; /* J300-FIX-1: no lighter shoulder strip across the ring lanes */ s.quad([a[i], b[i], b[i + 1], a[i + 1]], SHOULDER); s.quad([c[i], d[i], d[i + 1], c[i + 1]], SHOULDER); } }
  mark('surface');
  // ---- concrete: walls + parapets, box roof slab (top 1 cm under the deck so it does not fight it)
  for (const w of C.walls) { const par = w.kind === 'platform' || w.kind === 'arm' || w.kind === 'ramp-out' || w.kind === 'ramp-in'; wall(s, w.kind === 'ramp-in' ? clipToDeckFace(w.pts, D.cx, D.cz, D.face) : w.pts, w.thick, par, w.kind === 'box' ? CONCRETE : FACE); } // J300-FIX-1: the ramp inner walls started at r 57.9 m, INSIDE the circulating carriageway (48..62): wall + parapet stood in the lanes
  { const B = C.box, y1 = B.roofTop - 0.01, y0 = B.soffit; const c = [W(B.u0, -B.vHalf), W(B.u1, -B.vHalf), W(B.u1, B.vHalf), W(B.u0, B.vHalf)];
    s.quad(c.map((p) => [p[0], y1, p[1]]), CONCRETE); s.quad([c[3], c[2], c[1], c[0]].map((p) => [p[0], y0, p[1]]), CONCRETE);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; s.quad([[c[i][0], y0, c[i][1]], [c[j][0], y0, c[j][1]], [c[j][0], y1, c[j][1]], [c[i][0], y1, c[i][1]]], CONCRETE); } }
  mark('concrete');
  for (const sl of C.slopes) slope(s, sl.pts);
  mark('slope');
  // ---- furniture (no collision): light poles 10 m + 3 m arm, island lamps 8 m, box lamps, gantries, roadside boards
  for (const l of C.lights) { const h = l.kind === 'island' ? 8 : 10; obox(s, l.x, l.y, l.z, 1, 0, 0.3, h, 0.3, POLE);
    if (l.kind === 'island' || ((l as any).dx === 0 && (l as any).dz === 0)) obox(s, l.x, l.y + h, l.z, 1, 0, 0.9, 0.25, 0.5, LAMP);
    else { const L = Math.hypot(l.dx, l.dz) || 1; const ax = l.dx / L, az = l.dz / L; obox(s, l.x + ax * 1.5, l.y + h - 0.2, l.z + az * 1.5, ax, az, 3.2, 0.2, 0.2, POLE); obox(s, l.x + ax * 3, l.y + h - 0.45, l.z + az * 3, ax, az, 1.2, 0.25, 0.5, LAMP); } }
  for (const l of C.boxLamps) obox(s, l.x, l.y, l.z, cs, sn, 1.4, 0.2, 0.35, LAMP);
  for (const g of C.signs) { if (g.kind === 'gantry') { const vx = sn, vz = -cs; const cx = g.x, cz = g.z; for (const sd of [-1, 1]) obox(s, cx + vx * sd * g.span, g.y, cz + vz * sd * g.span, cs, sn, 0.9, g.clear + 1.4, 0.9, POLE);
      obox(s, cx, g.y + g.clear, cz, vx, vz, g.span * 2 + 0.9, 1.0, 0.7, POLE); obox(s, cx, g.y + g.clear + 1.0, cz, vx, vz, g.boardW, g.boardH, 0.15, BOARD); }
    else { const nx = (g as { nx: number }).nx, nz = (g as { nz: number }).nz; obox(s, g.x, g.y, g.z, nx, nz, 0.2, g.clear + g.boardH, 0.2, POLE); obox(s, g.x, g.y + g.clear, g.z, nx, nz, g.boardW, g.boardH, 0.12, BOARD); } }
  mark('furniture');
  return { positions: s.positions, colors: s.colors, indices: s.indices, parts };
}
