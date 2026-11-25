// J8 PAINT + ISLANDS (pure math, no three.js): road markings as flat quads just above the road surface, raised splitter islands with yellow-black kerb paint, gore wedges with chevrons at the 4 ramp noses.
// Data: J300Geometry (legs, crossings, islands, frame), J300Ramps (ramp rows), J300StructC (arm / ramp surface rows = level source). World coordinates (x east, z south, y up). No collision (paint); islands are 0.15 m kerb height, drive-over.
// HONEST: the J7-C arm ribbon is the full M6 / M4 width from the circle outwards; inside the junction reach (legs, r 62 .. ~200 m) the J4 carriageways are narrower, so paint follows the J4 leg lines and the wider ribbon stays as extra asphalt (decision for the user, see handoff).
import { J300_FRAME, J300_LEGS, J300_CROSSINGS, J300_ISLANDS } from './J300Geometry';
import { J300_RAMPS } from './J300Ramps';
import { J300_STRUCT_C as C } from './J300StructC';

export interface J300PaintData { positions: number[]; colors: number[]; indices: number[]; stats: Record<string, number> }
type RGB = [number, number, number];
const WHITE: RGB = [0.92, 0.92, 0.9], YELLOW: RGB = [0.92, 0.74, 0.08], BLACK: RGB = [0.05, 0.05, 0.05], GORE: RGB = [0.21, 0.21, 0.22], CAP: RGB = [0.32, 0.44, 0.22], CAPWALL: RGB = [0.6, 0.6, 0.58];
const LIFT = 0.04;           // paint above the surface
const F = J300_FRAME as { ox: number; oz: number; yaw: number; deckY: number };
const cs = Math.cos(F.yaw), sn = Math.sin(F.yaw);
const W = (u: number, v: number): number[] => [F.ox + u * cs + v * sn, F.oz + u * sn - v * cs];
const DW = (a: number, b: number): number[] => [cs * a + sn * b, sn * a - cs * b];

// ---- level source: arm centre lines, ramp mid lines, deck disc
const lines: number[][][] = [];
for (const A of C.surfArms) lines.push(A.pts.map((p) => [p[0], p[1], p[2]]));
for (const R of C.surfRamps) lines.push(R.rows.map((r) => [(r[2] + r[4]) / 2, (r[3] + r[5]) / 2, r[8]]));
function levelAt(x: number, z: number): number {
  if (Math.hypot(x - F.ox, z - F.oz) <= 62.7) return F.deckY;
  let best = Infinity, by = F.deckY;
  for (const L of lines) for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); if (d < best) { best = d; by = a[2] + (b[2] - a[2]) * t; } }
  return by;
}

const segDist = (x: number, z: number, a: number[], b: number[]): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
/** true where a J7-C road surface exists under (x, z): deck disc, arm ribbon (half width = top), ramp ribbon (half width ~4.1 m + shoulder) */
function onSurface(x: number, z: number): boolean {
  if (Math.hypot(x - F.ox, z - F.oz) <= 62.7) return true;
  for (const A of C.surfArms) for (let i = 0; i < A.pts.length - 1; i++) if (segDist(x, z, A.pts[i] as unknown as number[], A.pts[i + 1] as unknown as number[]) <= A.top) return true;
  for (const R of C.surfRamps) for (let i = 0; i < R.rows.length - 1; i++) { const a = R.rows[i], b = R.rows[i + 1]; if (segDist(x, z, [(a[2] + a[4]) / 2, (a[3] + a[5]) / 2], [(b[2] + b[4]) / 2, (b[3] + b[5]) / 2]) <= 4.3) return true; }
  return false;
}
let clipped = 0;
class Soup {
  positions: number[] = []; colors: number[] = []; indices: number[] = []; stats: Record<string, number> = {};
  count(k: string, n = 1): void { this.stats[k] = (this.stats[k] ?? 0) + n; }
  vert(x: number, y: number, z: number, c: RGB): number { this.positions.push(x, y, z); this.colors.push(c[0], c[1], c[2]); return this.positions.length / 3 - 1; }
  quad(p: number[][], c: RGB): void { const i = p.map((q) => this.vert(q[0], q[1], q[2], c)); this.indices.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
}

/** flat ribbon along a polyline of [x, z], width w, on the surface (+LIFT + extra) */
function ribbon(s: Soup, P: number[][], w: number, c: RGB, extra = 0, free = false): void {
  if (P.length < 2) return; const L: number[][] = [], R: number[][] = []; const on = P.map((p) => free || onSurface(p[0], p[1]));
  for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; const nx = -dz / l * w / 2, nz = dx / l * w / 2; const y = levelAt(P[i][0], P[i][1]) + LIFT + extra; L.push([P[i][0] + nx, y, P[i][1] + nz]); R.push([P[i][0] - nx, y, P[i][1] - nz]); }
  for (let i = 0; i < P.length - 1; i++) { if (!on[i] || !on[i + 1]) { clipped++; continue; } s.quad([L[i], R[i], R[i + 1], L[i + 1]], c); }
}
/** split a polyline into dashes (on / off metres) */
function dashes(P: number[][], on: number, off: number): number[][][] {
  const out: number[][][] = []; let cur: number[][] = [P[0]]; let drawing = true, left = on;
  for (let i = 0; i < P.length - 1; i++) { let a = P[i]; const b = P[i + 1]; let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (seg > left) { const t = left / seg; const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (drawing) { cur.push(m); out.push(cur); cur = []; } else cur = [m]; drawing = !drawing; seg -= left; a = m; left = drawing ? on : off; }
    left -= seg; if (drawing) cur.push(b); }
  if (drawing && cur.length > 1) out.push(cur); return out;
}
function dashed(s: Soup, P: number[][], w: number, c: RGB, on: number, off: number, key: string): void { for (const d of dashes(P, on, off)) { ribbon(s, d, w, c); } s.count(key); }
function solid(s: Soup, P: number[][], w: number, c: RGB, key: string, free = false): void { ribbon(s, P, w, c, 0, free); s.count(key); }
const lerp2 = (a: number[], b: number[], t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const wp = (q: number[]): number[] => W(q[0], q[1]);

export function buildJ300Paint(): J300PaintData {
  const s = new Soup(); clipped = 0;
  // 1) circulating carriageway: solid edge lines r 50 / 60.95 (white), dashed lane lines r 53.65 / 57.3
  const circ = (r: number): number[][] => { const o: number[][] = []; for (let i = 0; i <= 144; i++) { const a = i / 144 * Math.PI * 2; o.push(W(r * Math.cos(a), r * Math.sin(a))); } return o; };
  solid(s, circ(50.1), 0.15, WHITE, 'circle edge lines'); solid(s, circ(60.85), 0.15, WHITE, 'circle edge lines');
  dashed(s, circ(53.65), 0.12, WHITE, 1.5, 3, 'circle lane lines'); dashed(s, circ(57.3), 0.12, WHITE, 1.5, 3, 'circle lane lines');
  // 2) arm legs (R6 / R4): edge lines, lane lines, entry arrows, yield line
  for (const leg of J300_LEGS as unknown as any[]) { if (leg.kind !== 'arm') continue;
    for (const side of ['entry', 'exit'] as const) { const q = leg[side]; const Lf: number[][] = q.left, Rt: number[][] = q.right, Wd: number[] | null = Array.isArray(q.width) ? q.width : null; if (!Lf || !Rt) continue; const n = Lf.length;
      const at = (i: number, t: number): number[] => wp(lerp2(Lf[i], Rt[i], t)); const wi = (i: number): number => Wd ? Wd[i] : Math.hypot(Lf[i][0] - Rt[i][0], Lf[i][1] - Rt[i][1]);
      solid(s, Lf.map((_p, i) => at(i, 0.2 / wi(i))), 0.15, WHITE, 'leg edge lines'); solid(s, Rt.map((_p, i) => at(i, 1 - 0.2 / wi(i))), 0.15, WHITE, 'leg edge lines');
      let run: number[] = []; const flush = (div: number, k: number): void => { if (run.length > 1) dashed(s, run.map((i) => at(i, k / div)), 0.12, WHITE, 3, 6, 'leg lane lines'); run = []; };
      for (const [lo, hi, div] of [[0, 8.75, 2], [8.75, 99, 3]] as number[][]) for (let k = 1; k < div; k++) { for (let i = 0; i < n; i++) { const w = wi(i); if (w >= lo && w < hi) run.push(i); else flush(div, k); } flush(div, k); }
      if (side === 'entry') { const cen: number[][] = q.centre; let j = 0; for (let i = 0; i < cen.length; i++) if (cen[i][3] <= cen[cen.length - 1][3] - 35) j = i;
        const w = wi(j), nl = w >= 8.75 ? 3 : 2; const h = cen[j][2] * Math.PI / 180; const d = DW(Math.cos(h), Math.sin(h));
        for (let k = 0; k < nl; k++) { const c = at(j, (k + 0.5) / nl); const c1 = [c[0] - d[0] * 2.5, c[1] - d[1] * 2.5], c2 = [c[0] + d[0] * 2.5, c[1] + d[1] * 2.5]; const hd = [c[0] + d[0] * 1.2, c[1] + d[1] * 1.2]; ribbon(s, [c1, hd], 0.3, WHITE); const nx = -d[1], nz = d[0]; const y = levelAt(c2[0], c2[1]) + LIFT; s.quad([[c2[0], y, c2[1]], [hd[0] + nx * 0.7, y, hd[1] + nz * 0.7], [hd[0] - nx * 0.7, y, hd[1] - nz * 0.7], [c2[0], y, c2[1]]], WHITE); s.count('entry arrows'); }
        let jy = 0; for (let i = 0; i < cen.length; i++) if (cen[i][3] <= cen[cen.length - 1][3] - 2) jy = i; dashed(s, [at(jy, 0.02), at(jy, 0.98)], 0.4, WHITE, 0.6, 0.4, 'yield lines'); } } }
  // 3) arm lanes beyond the legs (r >= 200 m from the centre): median edge lines (yellow), edge lines, lane lines (M6: lanes 3.5 m, M4: 3.65 m)
  for (const A of C.surfArms) { const P = A.pts.filter((p) => Math.hypot(p[0] - F.ox, p[1] - F.oz) >= 200); if (P.length < 3) continue; const m6 = A.id === 'R6'; const offs = m6 ? { med: 2, inE: 3, lane: [6.5, 10], out: 13.5 } : { med: 2, inE: 3.5, lane: [7.15], out: 10.8 };
    const off = (o: number): number[][] => P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * o, p[1] + dx / l * o]; });
    for (const sg of [1, -1]) { solid(s, off(sg * offs.med), 0.15, YELLOW, 'arm median lines'); solid(s, off(sg * offs.inE), 0.15, WHITE, 'arm edge lines'); solid(s, off(sg * offs.out), 0.15, WHITE, 'arm edge lines'); for (const o of offs.lane) dashed(s, off(sg * o), 0.12, WHITE, 3, 6, 'arm lane lines'); } }
  // 4) zebra crossings (6): bars 0.5 m wide, 3 m long (travel direction), 1 m pitch, gap for the refuge
  for (const c of J300_CROSSINGS as unknown as any[]) { const h = c.headingDeg * Math.PI / 180; const d = [Math.cos(h), Math.sin(h)], n = [-Math.sin(h), Math.cos(h)]; const half = c.length / 2; const zones: number[][] = c.stages >= 2 && c.refuge > 0 ? [[-half, -c.refuge / 2], [c.refuge / 2, half]] : [[-half, half]];
    for (const [a, b] of zones) for (let t = a + 0.5; t <= b - 0.4; t += 1) { const p0 = [c.centre[0] + d[0] * t - n[0] * 1.5, c.centre[1] + d[1] * t - n[1] * 1.5], p1 = [c.centre[0] + d[0] * t + n[0] * 1.5, c.centre[1] + d[1] * t + n[1] * 1.5]; ribbon(s, [W(p0[0], p0[1]), W(p1[0], p1[1])], 0.5, WHITE); s.count('zebra bars'); } }
  // 5) raised splitter islands (0.15 m) with grass cap and yellow-black kerb paint
  for (const I of J300_ISLANDS as unknown as any[]) { const P: number[][] = (I.polygon as number[][]).map((q) => W(q[0], q[1])); const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length; const H = 0.15;
    const okP = P.map((p) => onSurface(p[0], p[1])); const ctr = s.vert(cx, levelAt(cx, cz) + LIFT + H, cz, CAP); const ring = P.map((p) => s.vert(p[0], levelAt(p[0], p[1]) + LIFT + H, p[1], CAP));
    for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; if (!okP[i] || !okP[j]) { clipped++; continue; } s.indices.push(ctr, ring[j], ring[i]); const y0a = levelAt(P[i][0], P[i][1]) + LIFT * 0.5, y0b = levelAt(P[j][0], P[j][1]) + LIFT * 0.5; s.quad([[P[i][0], y0a, P[i][1]], [P[j][0], y0b, P[j][1]], [P[j][0], y0b + H + LIFT * 0.5, P[j][1]], [P[i][0], y0a + H + LIFT * 0.5, P[i][1]]], CAPWALL); }
    let acc = 0, k = 0; for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; const l = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]); if (!okP[i] || !okP[j]) { acc += l; clipped++; continue; } const col = Math.floor(acc / 1.0) % 2 === 0 ? YELLOW : BLACK; acc += l; const y = (levelAt(P[i][0], P[i][1]) + levelAt(P[j][0], P[j][1])) / 2 + LIFT + H + 0.01; void y; k++; ribbon(s, [P[i], P[j]], 0.35, col, H + 0.01); }
    s.count('island kerb segments', k); s.count('islands'); }
  // 6) ramps: edge lines, gore wedge (asphalt + white chevrons) between the ring edge and the ramp inner edge near the nose
  for (const r of J300_RAMPS as unknown as any[]) { const rows: number[][] = (r.rows as number[][]).filter((x) => Math.abs(x[0]) <= r.noseX);
    const inn = (x: number[]): number[] => Math.abs(x[8]) <= Math.abs(x[10]) ? [x[7], x[8]] : [x[9], x[10]], out = (x: number[]): number[] => Math.abs(x[8]) <= Math.abs(x[10]) ? [x[9], x[10]] : [x[7], x[8]];
    const inset = (x: number[], o: boolean): number[] => { const a = inn(x), b = out(x); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const t = 0.2 / l; return wp(o ? lerp2(b, a, t) : lerp2(a, b, t)); };
    solid(s, rows.map((x) => inset(x, false)), 0.15, WHITE, 'ramp edge lines'); solid(s, rows.map((x) => inset(x, true)), 0.15, WHITE, 'ramp edge lines');
    const g = rows.filter((x) => !x[11] && Math.abs(x[0]) >= r.noseX - 50 && Math.abs(inn(x)[1]) - 19.1 >= 0.25);
    if (g.length > 2) { const ringP = (x: number[]): number[] => wp([x[0], Math.sign(inn(x)[1]) * 19.1]); const A: number[][] = [], B: number[][] = [];
      for (const x of g) { const y = x[4] + 0.02; const p = ringP(x), q = wp(inn(x)); A.push([p[0], y, p[1]]); B.push([q[0], y, q[1]]); }
      for (let i = 0; i < g.length - 1; i++) s.quad([A[i], B[i], B[i + 1], A[i + 1]], GORE);
      solid(s, g.map((x) => ringP(x)), 0.15, WHITE, 'gore edge lines', true); solid(s, g.map((x) => wp(inn(x))), 0.15, WHITE, 'gore edge lines', true);
      for (let i = 0; i + 3 < g.length; i += 3) { if (Math.abs(inn(g[i])[1]) - 19.1 < 0.8) continue; ribbon(s, [ringP(g[i]), wp(inn(g[i + 3]))], 0.4, WHITE, 0.02, true); s.count('gore chevrons'); }
      s.count('gore wedges'); } }
  s.stats['quads clipped (no road surface under)'] = clipped;
  return { positions: s.positions, colors: s.colors, indices: s.indices, stats: s.stats };
}
