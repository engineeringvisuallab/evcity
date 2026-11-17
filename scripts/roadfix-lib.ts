// STEP ROADFIX shared helpers (headless, read only on the game): ground, water, rail, buildings, class limits, line metrics.
import { readFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

export type P = { x: number; z: number };
export const hyp = Math.hypot;
export const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
export const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();

/** class limits (handoff 3.3 / 3.1 / user rule R11): grade in m/m, minimum radius, half pavement, tunnel allowed */
export const LIMIT: Record<number, { grade: number; rmin: number; half: number; tunnel: boolean }> = {
  6: { grade: 0.04, rmin: 229, half: 18.45, tunnel: false },
  4: { grade: 0.06, rmin: 130, half: 11, tunnel: true },
  2: { grade: 0.08, rmin: 70, half: 6, tunnel: true },
};
export const RAIL_CLEAR = 30;      // m from a track centre: no road inside (ROW + side), except at a bridge crossing
export const TUNNEL_GRADE = 0.04;  // handoff 3.10: tunnel grade <= 4 %

export const hNat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
export const wetAt = (x: number, z: number): boolean => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h; };

// ---- rail polylines (all edges), with a coarse grid for distance queries
interface RE { id: string; xs: number[]; zs: number[]; ground: number[]; design: number[]; segments: { kind: string; s0: number; s1: number }[]; cum: number[] }
export const RAIL: RE[] = gen.rail.edges;
const CELL = 200; const rgrid = new Map<string, { e: number; i: number }[]>();
RAIL.forEach((e, ei) => { for (let i = 0; i + 1 < e.xs.length; i++) { const a = Math.floor(Math.min(e.xs[i], e.xs[i + 1]) / CELL) - 1, b = Math.floor(Math.max(e.xs[i], e.xs[i + 1]) / CELL) + 1, c = Math.floor(Math.min(e.zs[i], e.zs[i + 1]) / CELL) - 1, d = Math.floor(Math.max(e.zs[i], e.zs[i + 1]) / CELL) + 1; for (let u = a; u <= b; u++) for (let v = c; v <= d; v++) { const k = u + ',' + v; let l = rgrid.get(k); if (!l) rgrid.set(k, (l = [])); l.push({ e: ei, i }); } } });
export function railDist(x: number, z: number): { d: number; e: number; i: number } {
  const l = rgrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); let best = { d: 1e9, e: -1, i: -1 };
  if (!l) return best;
  for (const { e, i } of l) { const E = RAIL[e]; const ax = E.xs[i], az = E.zs[i], bx = E.xs[i + 1] - ax, bz = E.zs[i + 1] - az, l2 = bx * bx + bz * bz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)); const d = hyp(x - ax - bx * t, z - az - bz * t); if (d < best.d) best = { d, e, i }; }
  return best;
}
/** rail height above the ground at a rail point (m): > 9 means a road can pass UNDER the rail bridge at ground level */
export function railClearAbove(e: number, i: number): { h: number; kind: string } {
  const E = RAIL[e]; const s = E.cum[i]; const seg = E.segments.find((q) => s >= q.s0 && s <= q.s1);
  return { h: (E.design[i] ?? 0) - (E.ground[i] ?? 0), kind: seg ? seg.kind : 'ground' };
}
export function segInt(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: a.x + rx * t, z: a.z + rz * t };
}
/** all crossings of a polyline with the rail: position, angle (deg, 90 = square), rail height above ground, kind */
export function railCrossings(pts: number[][]): { x: number; z: number; ang: number; above: number; kind: string; at: number }[] {
  const out: { x: number; z: number; ang: number; above: number; kind: string; at: number }[] = []; let cum = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = { x: pts[k][0], z: pts[k][1] }, b = { x: pts[k + 1][0], z: pts[k + 1][1] }; const sl = hyp(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; const l = rgrid.get(Math.floor(mx / CELL) + ',' + Math.floor(mz / CELL));
    if (l) for (const { e, i } of l) { const E = RAIL[e]; const q = segInt(a, b, { x: E.xs[i], z: E.zs[i] }, { x: E.xs[i + 1], z: E.zs[i + 1] }); if (!q) continue; if (out.some((o) => hyp(o.x - q.x, o.z - q.z) < 15)) continue; const ra = Math.atan2(E.zs[i + 1] - E.zs[i], E.xs[i + 1] - E.xs[i]), la = Math.atan2(b.z - a.z, b.x - a.x); let ang = (Math.abs(ra - la) * 180) / Math.PI % 180; if (ang > 90) ang = 180 - ang; const r = railClearAbove(e, i); out.push({ x: q.x, z: q.z, ang, above: r.h, kind: r.kind, at: cum + hyp(q.x - a.x, q.z - a.z) }); }
    cum += sl;
  }
  return out.sort((p, q) => p.at - q.at);
}

// ---- buildings
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
export function buildingHit(x: number, z: number, half: number): boolean {
  for (const b of RECTS) { if (Math.abs(b.x - x) > 90 || Math.abs(b.z - z) > 90) continue; const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z; const lx = dx * co - dz * si, lz = dx * si + dz * co; if (hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)) < half) return true; }
  return false;
}
// ---- A1 ground class
const A1 = JSON.parse(readFileSync('docs/a1_buildability.json', 'utf8'));
export const a1 = (x: number, z: number): string => { const i = Math.floor((x + A1.half) / A1.cell), j = Math.floor((z + A1.half) / A1.cell); return i < 0 || j < 0 || i >= A1.n || j >= A1.n ? '~' : A1.rows[j][i]; };

export function resamplePts(pts: number[][], step: number): number[][] {
  const out: number[][] = [[pts[0][0], pts[0][1]]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) { const L = hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); let s = step - carry; while (s <= L) { out.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * s) / L, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * s) / L]); s += step; } carry = L - (s - step); }
  const last = pts[pts.length - 1]; if (hyp(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > 1) out.push([last[0], last[1]]);
  return out;
}
export const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
export function minRadius(p: number[][]): number {
  let m = Infinity; const k = 2;
  for (let i = k; i + k < p.length; i++) { const a = p[i - k], b = p[i], c = p[i + k]; const ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]); const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); if (area2 > 1e-6) m = Math.min(m, (ab * bc * ca) / (2 * area2)); }
  return m;
}

/** HILL check = is a vertical profile possible at all? stations every 10 m, finished level y every 0.5 m, grade <= class limit (tunnel pieces <= 4 %),
 *  cut <= 12 m and fill <= 7 m against the ground across the pavement (handoff 3.3 / 3.7, user rule R11). Tunnel and bridge pieces are exempt from cut / fill. Wet stations are a bridge (exempt). */
export function profileCheck(pts: number[][], cls: number, ex: number[][][] = []): { ok: boolean; failAt: number; failLen: number; len: number } {
  const L = LIMIT[cls]; const d = resamplePts(pts, 10); const N = d.length; const MAXCUT = 12, MAXFILL = 7, U = 0.2;
  const hC: number[] = [], hMin: number[] = [], hMax: number[] = [], exempt: boolean[] = [], tun: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), tx = d[b][0] - d[a][0], tz = d[b][1] - d[a][1], tl = hyp(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    const c = hNat(d[i][0], d[i][1]), l = hNat(d[i][0] + nx * L.half, d[i][1] + nz * L.half), r = hNat(d[i][0] - nx * L.half, d[i][1] - nz * L.half);
    hC.push(c); hMin.push(Math.min(c, l, r)); hMax.push(Math.max(c, l, r));
    const onT = ex.some((sg) => { const ax = sg[0][0], az = sg[0][1], bx = sg[1][0] - ax, bz = sg[1][1] - az, l2 = bx * bx + bz * bz || 1; const t = Math.max(0, Math.min(1, ((d[i][0] - ax) * bx + (d[i][1] - az) * bz) / l2)); return hyp(d[i][0] - ax - bx * t, d[i][1] - az - bz * t) < 8; });
    exempt.push(onT || wetAt(d[i][0], d[i][1])); tun.push(onT);
  }
  const lo = Math.floor(Math.min(...hMin) - 14), hi = Math.ceil(Math.max(...hMax) + 10), J = Math.round((hi - lo) / U) + 1;
  let cur = new Uint8Array(J); const okAt = (i: number, y: number): boolean => exempt[i] || (y >= hMax[i] - MAXCUT - 1e-6 && y <= hMin[i] + MAXFILL + 1e-6);
  for (let j = 0; j < J; j++) cur[j] = okAt(0, lo + j * U) ? 1 : 0;
  let failAt = -1;
  for (let i = 1; i < N; i++) {
    const g = (tun[i] || tun[i - 1] ? Math.min(L.grade, TUNNEL_GRADE) : L.grade) * 10, K = Math.floor(g / U + 1e-9); const nxt = new Uint8Array(J); let any = false;
    for (let j = 0; j < J; j++) { if (!okAt(i, lo + j * U)) continue; for (let k = -K; k <= K; k++) { const jp = j + k; if (jp >= 0 && jp < J && cur[jp]) { nxt[j] = 1; any = true; break; } } }
    if (!any) { failAt = i * 10; break; } cur = nxt;
  }
  return { ok: failAt < 0, failAt, failLen: failAt < 0 ? 0 : 10, len: (N - 1) * 10 };
}

export interface Metrics {
  len: number; wetPts: number; wetLen: number; wetRuns: number[]; bldPts: number; fencedLen: number; veryEL: number;
  maxNatGrade: number; natOverLen: number; hillRuns: { s0: number; s1: number; g: number }[]; climb: number;
  railCross: ReturnType<typeof railCrossings>; railNearLen: number; railNearRuns: { s0: number; s1: number }[]; minR: number; prof: { ok: boolean; failAt: number; len: number };
}
/** metrics of one line for its class (natural ground, 5 m samples, 20 m grade windows) */
export function metrics(pts: number[][], cls: number, ex: number[][][] = []): Metrics {
  const L = LIMIT[cls]; const d = resamplePts(pts, 5); const n = d.length;
  const H = d.map((q) => hNat(q[0], q[1]));
  let wetPts = 0, bldPts = 0, fencedLen = 0, veryEL = 0, railNearLen = 0; const wetRuns: number[] = []; let run = 0;
  const railNearRuns: { s0: number; s1: number }[] = []; let rs0 = -1;
  d.forEach((q, i) => {
    const w = wetAt(q[0], q[1]); if (w) { wetPts++; run += 5; } else if (run) { wetRuns.push(run); run = 0; }
    if (buildingHit(q[0], q[1], L.half)) bldPts++;
    const c = a1(q[0], q[1]); if (c === 'F') fencedLen += 5; if (c === 'E') veryEL += 5;
    const rd = railDist(q[0], q[1]).d; const near = rd < RAIL_CLEAR; if (near) { railNearLen += 5; if (rs0 < 0) rs0 = i * 5; } else if (rs0 >= 0) { railNearRuns.push({ s0: rs0, s1: i * 5 }); rs0 = -1; }
  });
  if (run) wetRuns.push(run); if (rs0 >= 0) railNearRuns.push({ s0: rs0, s1: (n - 1) * 5 });
  let maxG = 0, over = 0; const hillRuns: { s0: number; s1: number; g: number }[] = []; let hs0 = -1, hg = 0;
  for (let i = 0; i + 4 < n; i++) { const g = Math.abs(H[i + 4] - H[i]) / 20; maxG = Math.max(maxG, g); if (g > L.grade) { over += 5; if (hs0 < 0) { hs0 = i * 5; hg = g; } hg = Math.max(hg, g); } else if (hs0 >= 0) { hillRuns.push({ s0: hs0, s1: i * 5 + 20, g: hg }); hs0 = -1; hg = 0; } }
  if (hs0 >= 0) hillRuns.push({ s0: hs0, s1: (n - 1) * 5, g: hg });
  let climb = 0; for (let i = 1; i < n; i++) climb += Math.abs(H[i] - H[i - 1]);
  return { len: plen(d), wetPts, wetLen: wetRuns.reduce((a, b) => a + b, 0), wetRuns, bldPts, fencedLen, veryEL, maxNatGrade: maxG, natOverLen: over, hillRuns, climb, railCross: railCrossings(pts), railNearLen, railNearRuns, minR: minRadius(d), prof: profileCheck(pts, cls, ex) };
}
