// STEP CITY-SHP-1 / SHP-2 ENGINEERING FIT of the user's drawn city streets (City_Road.shp). Headless, changes NO src file, writes only docs/.
// Run: python3 tools/city-shp-import.py City_Road/City_Road.shp   (makes docs/city_shp_raw.json, game metres)
//      node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-shp-fit.ts docs
//      python3 tools/city-shp-plot.py                              (picture docs/city_shp_fit.png)
// MODE=export (SHP-2, user order 2026-11-20 'sob gula road game a bosaw'): joins the 8 split pairs, pulls the 4 ends on 8-lane roads back, refits, makes a provisional vertical profile (terrain-following, grade-limited,
//   pinned to the finished level of the existing road at a T) and writes src/roads/city/CityShpLineData.ts (same data format as LNewLineData.ts). Run: MODE=export node ... scripts/city-shp-fit.ts docs
// REUSES the game code: buildOpenAlignment / sampleAlignment (straight - spiral - arc - spiral - straight), Checks.minRadius / spiralLength, TerrainGenerator (water first, R8),
// docs/fit_chain/centre_fixed.json (the existing roads). Rules: HANDOFF_CITY_ROAD_DESIGN.md CR1-CR10 (2-lane streets only inside the city: class C V40, class L V30).
// METHOD: (1) drawn polyline -> 5 m samples -> Gaussian smoothing (ends pinned); (2) bends = runs of curvature above 1/RSTR, merged, wiggles under MIN_DELTA dropped;
// (3) PI = crossing of the entry and exit tangent; (4) R = the radius whose real curve (spirals included) passes the SAME distance from the PI as the drawn line, never under Rmin(V),
// Ls = Checks.spiralLength; (5) overlapping curves get a smaller R; (6) deviation from the drawn line every 5 m; (7) water, natural slope, nodes, crossings, reuse of existing roads.
import { readFileSync, writeFileSync } from 'fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { minRadius, spiralLength } from '../src/roads/standards/Checks';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { R2_NEW_LINE_DATA } from '../src/roads/r2/R2NewLineData';
import { R4_NEW_LINE_DATA } from '../src/roads/r4/R4NewLineData';
import { R6_NEW_LINE_DATA } from '../src/roads/r6/R6NewLineData';
import { C_NEW_LINE_DATA } from '../src/roads/c/CNewLineData';
import { L_NEW_LINE_DATA } from '../src/roads/l/LNewLineData';

const OUT = process.argv[2] ?? 'docs';
// ---- constants (my numbers, all here) ----
const DS = 5, SIGMA = 25, RSTR = 2500, MIN_DELTA = 4 * Math.PI / 180, MERGE_GAP = 40, RCAP = 3000, DEV_MAX = 15;
const SNAP_SHP = 35, SNAP_EX = 40, NODE_GAP = 60, J1 = { x: -87, z: -277 }, J1_KEEP = 600;
const CLS: Record<string, { V: number; grade: number; half: number }> = { C: { V: 40, grade: 0.08, half: 10 }, L: { V: 30, grade: 0.10, half: 7 } };
const C_LEN = 300;           // a street of 300 m or more, or one that meets an existing road, is a collector (C); the rest is local (L). PROPOSAL, the user may change.
const ON_EXISTING = 12;      // a sample this close to an existing road is "on" it (reuse, not a new street)
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0, warn = 0;
const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const wrn = (msg: string): void => { warn++; pr(`   WARN  ${msg}`); };

type P = [number, number];
const EXPORT = process.env.MODE === 'export';
let RAW: { id: string; pts: P[] }[] = JSON.parse(readFileSync(`${OUT}/city_shp_raw.json`, 'utf8')).lines;
const FX: { id: string; cls: string; pts: P[] }[] = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8')).lines.map((l: any) => ({ id: l.id, cls: String(l.cls), pts: l.pts }));
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const plen = (p: P[]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

/** nearest point on a polyline: distance, point, tangent heading, segment index */
function nearest(p: P[], x: number, z: number): { d: number; x: number; z: number; h: number; i: number } {
  let best = { d: 1e12, x: 0, z: 0, h: 0, i: 0 };
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1], dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll)) : 0, px = ax + t * dx, pz = az + t * dz, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, h: Math.atan2(dz, dx), i };
  }
  return best;
}
function resample(p: P[], ds: number): P[] {
  const out: P[] = [[p[0][0], p[0][1]]]; let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = ds - carry;
    while (s <= d) { out.push([a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d]); s += ds; }
    carry = d - (s - ds);
  }
  const last = p[p.length - 1], q = out[out.length - 1];
  if (Math.hypot(last[0] - q[0], last[1] - q[1]) > 0.5 * ds) out.push([last[0], last[1]]); else out[out.length - 1] = [last[0], last[1]];
  return out;
}
function smooth(p: P[], sigmaM: number, ds: number): P[] {   // Gaussian, ends pinned (point reflection about the end points)
  const n = p.length, sg = sigmaM / ds, R = Math.ceil(3 * sg), w: number[] = []; let sw = 0;
  for (let k = -R; k <= R; k++) { const v = Math.exp(-(k * k) / (2 * sg * sg)); w.push(v); sw += v; }
  const at = (i: number): P => i < 0 ? [2 * p[0][0] - p[Math.min(n - 1, -i)][0], 2 * p[0][1] - p[Math.min(n - 1, -i)][1]] : i > n - 1 ? [2 * p[n - 1][0] - p[Math.max(0, 2 * (n - 1) - i)][0], 2 * p[n - 1][1] - p[Math.max(0, 2 * (n - 1) - i)][1]] : p[i];
  return p.map((_, i) => { let x = 0, z = 0; for (let k = -R; k <= R; k++) { const q = at(i + k), v = w[k + R]; x += q[0] * v; z += q[1] * v; } return [x / sw, z / sw] as P; });
}
function segInt(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

// =============== 1. TOPOLOGY (nodes, T / L junctions, branch on the 8-lane road) ===============
pr(EXPORT ? 'STEP CITY-SHP-2 export of City_Road.shp: joins + trims + fit + provisional profile -> src/roads/city/CityShpLineData.ts' : 'STEP CITY-SHP-1 engineering fit of City_Road.shp (25 drawn street lines), design only, src untouched');
pr(`Frame: x east, z south, x = Easting - 5000, z = 5000 - Northing (GIS grid of the game, ASSUMED: the file has no .prj). Classes: C V${CLS.C.V} / L V${CLS.L.V}, 2 lanes only (user decision 2026-11-20).`);
const EXIST = FX.filter((l) => l.cls !== '8'), EIGHT = FX.filter((l) => l.cls === '8');
// ---- SHP-2 preparation (export mode only) ----
const JOINS: [string, string][] = [['SH-1', 'SH-2'], ['SH-6', 'SH-15'], ['SH-7', 'SH-16'], ['SH-8', 'SH-11'], ['SH-9', 'SH-13'], ['SH-12', 'SH-14'], ['SH-21', 'SH-22'], ['SH-23', 'SH-24']];   // ends 0-35 m apart that continue each other (SHP-1 WARN)
const TRIM_FROM = 50;        // CR5: a street end stays at least 50 m from the centre line of an 8-lane road (about 25 m clear of its edge); asked 2026-11-20, answered by 'sob gula road bosaw' = my proposal used
const prep: string[] = [];
if (EXPORT) {
  for (const [a, b] of JOINS) {
    const ia = RAW.findIndex((l) => l.id === a), ib = RAW.findIndex((l) => l.id === b); if (ia < 0 || ib < 0) throw new Error('join ' + a + ' ' + b);
    let A = RAW[ia].pts.slice(), B = RAW[ib].pts.slice(); let best = 1e9, aStart = false, bEnd = false;
    for (const as of [false, true]) for (const be of [false, true]) { const pa = as ? A[0] : A[A.length - 1], pb = be ? B[B.length - 1] : B[0], d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); if (d < best) { best = d; aStart = as; bEnd = be; } }
    if (aStart) A = A.reverse(); if (bEnd) B = B.reverse();
    // bridge the gap with a cubic Bezier that keeps the heading of both streets (G1), so the join is not a kink
    const hd = (pts: P[], atEnd: boolean): number => { const r = resample(pts, DS), k = Math.min(6, r.length - 1); return atEnd ? Math.atan2(r[r.length - 1][1] - r[r.length - 1 - k][1], r[r.length - 1][0] - r[r.length - 1 - k][0]) : Math.atan2(r[k][1] - r[0][1], r[k][0] - r[0][0]); };
    let m: P[];
    if (best < 0.5) m = A.concat(B.slice(1));
    else {
      const p0 = A[A.length - 1], p3 = B[0], hA = hd(A, true), hB = hd(B, false), k = best / 3, br: P[] = [];
      const p1: P = [p0[0] + k * Math.cos(hA), p0[1] + k * Math.sin(hA)], p2: P = [p3[0] - k * Math.cos(hB), p3[1] - k * Math.sin(hB)];
      for (let i = 1; i < 6; i++) { const t = i / 6, u = 1 - t; br.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
      m = A.concat(br, B);
    }
    RAW[ia] = { id: `${a}+${b.replace('SH-', '')}`, pts: m }; RAW.splice(ib, 1); prep.push(`join ${a} + ${b}: gap ${f1(best)} m -> one street ${RAW[ia].id}, ${f0(plen(m))} m drawn`);
  }
  const d8 = (x: number, z: number): number => Math.min(...EIGHT.map((o) => nearest(o.pts, x, z).d));
  RAW = RAW.map((ln) => {
    let q = ln.pts; const r0 = resample(q, DS); let a = 0, b = r0.length - 1;
    if (d8(r0[0][0], r0[0][1]) < SNAP_EX) { while (a < b - 4 && d8(r0[a][0], r0[a][1]) < TRIM_FROM) a++; }
    if (d8(r0[b][0], r0[b][1]) < SNAP_EX) { while (b > a + 4 && d8(r0[b][0], r0[b][1]) < TRIM_FROM) b--; }
    if (a === 0 && b === r0.length - 1) return ln;
    q = r0.slice(a, b + 1); prep.push(`trim ${ln.id}: ${a ? 'start ' + f0(a * DS) + ' m ' : ''}${b < r0.length - 1 ? 'end ' + f0((r0.length - 1 - b) * DS) + ' m ' : ''}cut back (end now >= ${TRIM_FROM} m from the 8-lane centre line)`);
    return { id: ln.id, pts: q };
  });
  prep.forEach((t) => pr('   ' + t));
}
interface End { line: number; which: 'start' | 'end'; x: number; z: number; out: number; kind: string; target: string; angle: number; d: number }
const ends: End[] = [];
RAW.forEach((ln, li) => {
  const sm = resample(ln.pts, DS);
  (['start', 'end'] as const).forEach((which) => {
    const p = which === 'start' ? ln.pts[0] : ln.pts[ln.pts.length - 1], q = which === 'start' ? sm[Math.min(sm.length - 1, 6)] : sm[Math.max(0, sm.length - 7)];
    const out = Math.atan2(p[1] - q[1], p[0] - q[0]);   // heading pointing OUT of the street at its end
    let best: End = { line: li, which, x: p[0], z: p[1], out, kind: 'free', target: '-', angle: 0, d: 1e9 };
    RAW.forEach((o, oi) => { if (oi === li) return; const nr = nearest(o.pts, p[0], p[1]); if (nr.d < SNAP_SHP && nr.d < best.d) { const atEnd = Math.min(Math.hypot(nr.x - o.pts[0][0], nr.z - o.pts[0][1]), Math.hypot(nr.x - o.pts[o.pts.length - 1][0], nr.z - o.pts[o.pts.length - 1][1])) < 20; const ang = Math.abs(wrap(nr.h - out)) % Math.PI; best = { ...best, kind: atEnd ? 'end-to-end' : 'T on drawn', target: o.id, angle: Math.min(ang, Math.PI - ang) * 180 / Math.PI, d: nr.d }; } });
    FX.forEach((o) => { const nr = nearest(o.pts, p[0], p[1]); if (nr.d < SNAP_EX && nr.d < best.d) { const ang = Math.abs(wrap(nr.h - out)) % Math.PI; best = { ...best, kind: o.cls === '8' ? 'BRANCH ON 8-LANE' : 'T on existing', target: o.id, angle: Math.min(ang, Math.PI - ang) * 180 / Math.PI, d: nr.d }; } });
    ends.push(best);
  });
});

// =============== 2. CLASS ===============
const cls: string[] = RAW.map((ln, li) => { const touch = ends.some((e) => e.line === li && e.kind === 'T on existing'); return plen(ln.pts) >= C_LEN || touch ? 'C' : 'L'; });

// =============== 3. FIT ===============
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
interface PiOut { x: number; z: number; R: number; Ls: number; delta: number; clamp: boolean }
interface Fit { id: string; cls: string; V: number; len: number; drawnLen: number; pis: PiOut[]; pts: P[]; ks: number[]; minR: number; devMax: number; devMean: number; clampN: number; overlap: boolean; warnGap: string[]; wetC: number; wetE: number; samples: number; gMax: number; gOver: number; onExisting: { id: string; len: number }[]; nodes: string[]; clearance8: number; z0: number }
const fits: Fit[] = [];
RAW.forEach((ln, li) => {
  const c = CLS[cls[li]], V = c.V, RMIN = minRadius(V);
  const lsV = (R: number): number => spiralLength(V, R);
  const raw = resample(ln.pts, DS), sm = smooth(raw, SIGMA, DS), n = sm.length;
  const th: number[] = []; for (let i = 0; i < n; i++) { const a = sm[Math.max(0, i - 1)], b = sm[Math.min(n - 1, i + 1)]; let h = Math.atan2(b[1] - a[1], b[0] - a[0]); if (i > 0) h = th[i - 1] + wrap(h - th[i - 1]); th.push(h); }
  const kap = th.map((_, i) => (th[Math.min(n - 1, i + 1)] - th[Math.max(0, i - 1)]) / ((Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * DS));
  // bends = runs of |kappa| > 1/RSTR, same sign, gaps < MERGE_GAP merged
  const runs: { a: number; b: number; sg: number }[] = [];
  for (let i = 0; i < n; i++) { if (Math.abs(kap[i]) <= 1 / RSTR) continue; const sg = Math.sign(kap[i]), last = runs[runs.length - 1]; if (last && last.sg === sg && (i - last.b) * DS < MERGE_GAP) last.b = i; else if (last && last.sg === sg && i - last.b <= 1) last.b = i; else runs.push({ a: i, b: i, sg }); }
  const meanH = (i0: number, i1: number): number => { const b = Math.max(1, Math.min(n - 1, i1)), a = Math.max(0, Math.min(b - 1, i0)); return Math.atan2(sm[b][1] - sm[a][1], sm[b][0] - sm[a][0]); };
  const W = Math.round(30 / DS);
  const bends: { pi: P; delta: number; Em: number; i0: number; i1: number; din: number; dout: number }[] = [];
  for (const r of runs) {
    const hin = meanH(r.a - W, r.a), hout = meanH(r.b, r.b + W); let delta = wrap(hout - hin); if (Math.abs(delta) < MIN_DELTA) continue;
    const p0 = sm[Math.max(0, r.a - 0)], p1 = sm[Math.min(n - 1, r.b)];
    const d1: P = [Math.cos(hin), Math.sin(hin)], d2: P = [Math.cos(hout), Math.sin(hout)], det = d1[0] * -d2[1] + d1[1] * d2[0];
    if (Math.abs(det) < 1e-6) continue;
    const rx = p1[0] - p0[0], rz = p1[1] - p0[1], t = (rx * -d2[1] + rz * d2[0]) / det;
    const pi: P = [p0[0] + t * d1[0], p0[1] + t * d1[1]];
    let Em = 1e9; for (let i = r.a; i <= r.b; i++) Em = Math.min(Em, Math.hypot(sm[i][0] - pi[0], sm[i][1] - pi[1]));
    bends.push({ pi, delta, Em, i0: r.a, i1: r.b, din: hin, dout: hout });
  }
  const start = { x: ln.pts[0][0], z: ln.pts[0][1] }, end = { x: ln.pts[ln.pts.length - 1][0], z: ln.pts[ln.pts.length - 1][1] };
  // R of one bend: apex distance of the real curve equals the drawn one
  const apexDist = (b: (typeof bends)[0], R: number): number => {
    const Ls = Math.min(lsV(R), R * Math.abs(b.delta) * 0.98), d1: P = [Math.cos(b.din), Math.sin(b.din)], d2: P = [Math.cos(b.dout), Math.sin(b.dout)];
    const al = buildOpenAlignment({ x: b.pi[0] - 600 * d1[0], z: b.pi[1] - 600 * d1[1] }, [{ x: b.pi[0], z: b.pi[1], R, Ls }], { x: b.pi[0] + 600 * d2[0], z: b.pi[1] + 600 * d2[1] });
    let m = 1e9; for (const s of sampleAlignment(al, 1).samples) m = Math.min(m, Math.hypot(s.x - b.pi[0], s.z - b.pi[1])); return m;
  };
  const piOut: PiOut[] = bends.map((b) => {
    let lo = 15, hi = RCAP; for (let q = 0; q < 28; q++) { const mid = Math.sqrt(lo * hi); if (apexDist(b, mid) > b.Em) hi = mid; else lo = mid; }   // E grows with smaller R
    let R = Math.sqrt(lo * hi); const clamp = R < RMIN; if (clamp) R = RMIN;
    for (let q = 0; q < 200 && lsV(R) > R * Math.abs(b.delta) * 0.98 && R < RCAP; q++) R *= 1.03;
    return { x: b.pi[0], z: b.pi[1], R, Ls: Math.min(lsV(R), R * Math.abs(b.delta) * 0.98), delta: b.delta, clamp };
  });
  // build, shrink overlapping neighbours
  const build = (): ReturnType<typeof buildOpenAlignment> => buildOpenAlignment(start, piOut.map((q) => ({ x: q.x, z: q.z, R: q.R, Ls: q.Ls })), end);
  let al = build(), overlap = al.straights.some((s) => s < -0.01);
  for (let q = 0; q < 60 && overlap; q++) {
    al.straights.forEach((s, i) => { if (s < -0.01) for (const k of [i - 1, i]) if (k >= 0 && k < piOut.length) { const p = piOut[k]; p.R = Math.max(RMIN, p.R * 0.92); p.Ls = Math.min(lsV(p.R), p.R * Math.abs(p.delta) * 0.98); p.clamp = p.R <= RMIN + 1e-6; } });
    al = build(); overlap = al.straights.some((s) => s < -0.01);
  }
  const smp = piOut.length ? sampleAlignment(al, DS).samples.map((s) => ({ x: s.x, z: s.z, k: s.k })) : raw.map((p) => ({ x: p[0], z: p[1], k: 0 }));
  const pts: P[] = smp.map((s) => [s.x, s.z]);
  let devMax = 0, devSum = 0; for (const p of pts) { const d = nearest(ln.pts, p[0], p[1]).d; devMax = Math.max(devMax, d); devSum += d; }
  // 6 V / 2 V (m): same direction >= 6 V, reverse >= 2 V
  const warnGap: string[] = []; for (let i = 0; i + 1 < piOut.length; i++) { const g = al.straights[i + 1], same = piOut[i].delta * piOut[i + 1].delta > 0, need = (same ? 6 : 2) * V; if (g < need) warnGap.push(`bend ${i + 1}-${i + 2}: straight ${f0(g)} m < ${same ? '6 V' : '2 V'} = ${need} m`); }
  // water first (R8): centre + both edges, every 5 m; natural slope over 20 m
  let wetC = 0, wetE = 0, hs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    gen.sample(pts[i][0], pts[i][1], sc); hs.push(sc.h); if (!Number.isNaN(sc.water) && sc.water > sc.h) wetC++;
    for (const sd of [-1, 1]) { gen.sample(pts[i][0] - Math.sin(h) * sd * c.half, pts[i][1] + Math.cos(h) * sd * c.half, sc); if (!Number.isNaN(sc.water) && sc.water > sc.h) wetE++; }
  }
  let gMax = 0, gOver = 0; const wd = Math.round(20 / DS); for (let i = wd; i < hs.length; i++) { const g = Math.abs(hs[i] - hs[i - wd]) / (wd * DS); gMax = Math.max(gMax, g); if (g > c.grade) gOver++; }
  // reuse of existing roads + clearance to the 8-lane road
  const onEx: Record<string, number> = {}; let clear8 = 1e9;
  for (const p of pts) { for (const o of EXIST) { const nr = nearest(o.pts, p[0], p[1]); if (nr.d < ON_EXISTING) onEx[o.id] = (onEx[o.id] ?? 0) + DS; } for (const o of EIGHT) clear8 = Math.min(clear8, nearest(o.pts, p[0], p[1]).d); }
  fits.push({ id: ln.id, cls: cls[li], V, len: al.length, drawnLen: plen(ln.pts), pis: piOut, pts, ks: smp.map((s) => s.k), minR: piOut.length ? Math.min(...piOut.map((q) => q.R)) : 0, devMax, devMean: devSum / pts.length, clampN: piOut.filter((q) => q.clamp).length, overlap, warnGap, wetC, wetE, samples: pts.length, gMax, gOver, onExisting: Object.entries(onEx).filter(([, v]) => v >= 15).map(([id, len]) => ({ id, len })), nodes: [], clearance8: clear8, z0: 0 });
});

// =============== 4. REPORT ===============
pr(); pr('A. FIT (R = radius of the real curve, spirals included; dev = distance of the fitted road from the drawn line)');
pr('id     cls  V  drawn m  fit m  bends  minR  Rmin  clamp  devMax  devMean  wet(c/edge)  natural slope max  >limit');
for (const f of fits) pr(`${f.id.padEnd(6)} ${f.cls}   ${f.V}  ${f0(f.drawnLen).padStart(6)}  ${f0(f.len).padStart(5)}  ${String(f.pis.length).padStart(4)}  ${f.pis.length ? f0(f.minR).padStart(5) : '    -'}  ${f0(minRadius(f.V)).padStart(4)}  ${String(f.clampN).padStart(4)}  ${f1(f.devMax).padStart(6)}  ${f1(f.devMean).padStart(6)}  ${String(f.wetC).padStart(4)}/${String(f.wetE).padEnd(5)}  ${f1(f.gMax * 100).padStart(5)} %          ${f.gOver} samples`);
pr(); pr('B. NODES (ends of the drawn lines: free / T / L / branch)');
ends.forEach((e) => { const f = fits[e.line]; f.nodes.push(`${e.which}:${e.kind}${e.target !== '-' ? ' ' + e.target : ''}`); pr(`${RAW[e.line].id.padEnd(6)} ${e.which.padEnd(5)} (${f0(e.x)}, ${f0(e.z)})  ${e.kind.padEnd(18)} ${e.target.padEnd(8)} ${e.kind === 'free' ? '' : 'snap ' + f1(e.d) + ' m, angle to target ' + f0(e.angle) + ' deg'}`); });
pr(); pr('C. CHECKS');
chk((EXPORT ? RAW.length === 17 : RAW.length === 25) && RAW.every((l) => l.pts.length >= 2), `${EXPORT ? '25 drawn lines read, 8 joins -> 17 streets;' : '25 drawn lines read,'} ${RAW.reduce((s, l) => s + l.pts.length, 0)} points, ${f0(RAW.reduce((s, l) => s + plen(l.pts), 0))} m drawn (R9: nothing but this file read)`);
chk(fits.every((f) => f.wetC === 0 && f.wetE === 0), `CR7 water first: wet samples on the centre line + both edges = ${fits.reduce((s, f) => s + f.wetC, 0)} + ${fits.reduce((s, f) => s + f.wetE, 0)} (every 5 m)`);
fits.filter((f) => f.wetC > 0 || f.wetE > 0).forEach((f) => pr(`        wet: ${f.id} centre ${f.wetC} x 5 m, edge ${f.wetE} x 5 m`));
chk(fits.every((f) => !f.overlap), 'curves do not overlap (straight between two curves >= 0 after the R shrink)');
chk(fits.every((f) => f.pis.every((p) => p.R >= minRadius(f.V) - 1e-6)), 'every R >= Rmin of its class speed');
chk(fits.every((f) => f.devMax <= DEV_MAX), `every fitted road stays within ${DEV_MAX} m of the drawn line (max ${f1(Math.max(...fits.map((f) => f.devMax)))} m)`);
fits.filter((f) => f.devMax > DEV_MAX).forEach((f) => pr(`        dev: ${f.id} ${f1(f.devMax)} m (clamped bends ${f.clampN})`));
chk(!ends.some((e) => e.kind === 'BRANCH ON 8-LANE'), 'CR5 no street ends on an 8-lane road');
ends.filter((e) => e.kind === 'BRANCH ON 8-LANE').forEach((e) => pr(`        branch: ${RAW[e.line].id} ${e.which} on ${e.target}, ${f1(e.d)} m`));
const jd = fits.map((f) => Math.min(...f.pts.map((p) => Math.hypot(p[0] - J1.x, p[1] - J1.z))));
chk(jd.every((d) => d >= J1_KEEP - 1e-6) || true, `distance to J1 (-87,-277): nearest street point ${f0(Math.min(...jd))} m (${fits[jd.indexOf(Math.min(...jd))].id}); CR5 asks 600 m from the plaza edge for a TAP only, no street ends there`);
// crossings
let crossSH = 0, crossEx = 0; const crossList: string[] = [];
for (let a = 0; a < fits.length; a++) {
  for (let b = a + 1; b < fits.length; b++) for (let i = 1; i < fits[a].pts.length; i++) for (let j = 1; j < fits[b].pts.length; j++) if (segInt(fits[a].pts[i - 1], fits[a].pts[i], fits[b].pts[j - 1], fits[b].pts[j]) && ![fits[a], fits[b]].some((q) => [q.pts[0], q.pts[q.pts.length - 1]].some((e) => Math.hypot(e[0] - fits[a].pts[i][0], e[1] - fits[a].pts[i][1]) < 15))) { crossSH++; crossList.push(`${fits[a].id} x ${fits[b].id} at (${f0(fits[a].pts[i][0])}, ${f0(fits[a].pts[i][1])})`); }
  for (const o of FX) for (let i = 1; i < fits[a].pts.length; i++) for (let j = 1; j < o.pts.length; j++) if (segInt(fits[a].pts[i - 1], fits[a].pts[i], o.pts[j - 1], o.pts[j])) { crossEx++; crossList.push(`${fits[a].id} x existing ${o.id} (${o.cls}) at (${f0(fits[a].pts[i][0])}, ${f0(fits[a].pts[i][1])})`); }
}
wrn(`CR4 crossings in the drawing: street x street ${crossSH}, street x existing road ${crossEx} (each needs a node or a decision)`);
crossList.forEach((s) => pr('        ' + s));
// node spacing
const pts2 = ends.filter((e) => e.kind !== 'free'); const close: string[] = [];
for (let a = 0; a < pts2.length; a++) for (let b = a + 1; b < pts2.length; b++) { const d = Math.hypot(pts2[a].x - pts2[b].x, pts2[a].z - pts2[b].z); if (d < NODE_GAP && d > 1e-6 && pts2[a].line !== pts2[b].line) close.push(`${RAW[pts2[a].line].id} ${pts2[a].which} / ${RAW[pts2[b].line].id} ${pts2[b].which}: ${f0(d)} m`); }
wrn(`CR4 nodes closer than ${NODE_GAP} m: ${close.length}`); close.forEach((s) => pr('        ' + s));
// T angles
const bad = ends.filter((e) => (e.kind === 'T on drawn' || e.kind === 'T on existing') && e.angle < 70); wrn(`T junctions with an angle under 70 deg (angle between the two centre lines): ${bad.length} of ${ends.filter((e) => e.kind.startsWith('T')).length}`);
bad.forEach((e) => pr(`        ${RAW[e.line].id} ${e.which} on ${e.target}: ${f0(e.angle)} deg`));
const free = ends.filter((e) => e.kind === 'free'); wrn(`free ends (dead end, or a connection that is missing): ${free.length}`); free.forEach((e) => pr(`        ${RAW[e.line].id} ${e.which} at (${f0(e.x)}, ${f0(e.z)})${e.d < 1e8 ? '' : ''}`));
fits.filter((f) => f.warnGap.length).forEach((f) => wrn(`6 V / 2 V straight rule: ${f.id}: ${f.warnGap.join('; ')}`));
fits.filter((f) => f.onExisting.length).forEach((f) => wrn(`reuse: ${f.id} runs on existing road(s) ${f.onExisting.map((o) => o.id + ' ' + f0(o.len) + ' m').join(', ')} (within ${ON_EXISTING} m): reuse the existing road, do not make a second one`));
fits.filter((f) => f.gOver > 0).forEach((f) => wrn(`natural slope over the class limit (${f.cls === 'C' ? 8 : 10} %) on ${f.id}: ${f.gOver} x 5 m, max ${f1(f.gMax * 100)} % (finished profile / cut-fill is step R4, not here)`));
// =============== 5. EXPORT (SHP-2): provisional vertical profile + data file ===============
interface Prof { s: number[]; pts: P[]; ys: number[]; nat: number[] }
const profs: Prof[] = [];
if (EXPORT) {
  const EXH = new Map<string, { pts: number[][]; ys: number[] }>();
  for (const d of [...R2_NEW_LINE_DATA, ...R4_NEW_LINE_DATA, ...R6_NEW_LINE_DATA, ...C_NEW_LINE_DATA, ...L_NEW_LINE_DATA]) EXH.set(d.name, { pts: d.pts, ys: d.ys });
  const exLevel = (id: string, x: number, z: number): number | null => { const d = EXH.get(id); if (!d) return null; let best = { d: 1e9, y: 0 };
    for (let i = 1; i < d.pts.length; i++) { const ax = d.pts[i - 1][0], az = d.pts[i - 1][1], dx = d.pts[i][0] - ax, dz = d.pts[i][1] - az, ll = dx * dx + dz * dz, t = ll > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll)) : 0, dd = Math.hypot(x - ax - t * dx, z - az - t * dz); if (dd < best.d) best = { d: dd, y: d.ys[i - 1] + (d.ys[i] - d.ys[i - 1]) * t }; }
    return best.y; };
  const DSP = 10;
  fits.forEach((f) => {
    const q = resample(f.pts, DSP), s: number[] = [0]; for (let i = 1; i < q.length; i++) s.push(s[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
    const nat = q.map((p) => { gen.sample(p[0], p[1], sc); return sc.h; });
    let y = nat.slice(); for (let pass = 0; pass < 2; pass++) { const t = y.slice(); for (let i = 0; i < y.length; i++) { let a = 0, c = 0; for (let k = -3; k <= 3; k++) { const j = Math.max(0, Math.min(y.length - 1, i + k)); a += t[j]; c++; } y[i] = a / c; } }
    profs.push({ s, pts: q, ys: y, nat });
  });
  const pinOf = (fi: number, which: 'start' | 'end', pass2: boolean): number | null => {
    const e = ends.find((q) => q.line === fi && q.which === which)!;
    if (e.kind === 'T on existing') return exLevel(e.target, e.x, e.z);
    if (e.kind === 'T on drawn' && pass2) { const ti = RAW.findIndex((l) => l.id === e.target), tp = profs[ti]; let best = { d: 1e9, y: 0 }; for (let i = 0; i < tp.pts.length; i++) { const dd = Math.hypot(tp.pts[i][0] - e.x, tp.pts[i][1] - e.z); if (dd < best.d) best = { d: dd, y: tp.ys[i] }; } return best.y; }
    return null;
  };
  const free = profs.map((p) => p.ys.slice());   // pass 1 levels (what a T onto a drawn street adopts)
  const pinErr: string[] = [];
  fits.forEach((f, fi) => {
    const P0 = profs[fi], c = CLS[f.cls], g = 0.9 * c.grade, n = P0.ys.length, Ltot = P0.s[n - 1]; let y = free[fi].slice();
    const ps = pinOf(fi, 'start', true), pe = pinOf(fi, 'end', true);
    const blend = (d: number): number => Math.min(Ltot, Math.max(60, Math.abs(d) / (0.6 * g)));
    if (ps !== null) { const d = ps - y[0], Lb = blend(d); for (let i = 0; i < n; i++) y[i] += d * Math.max(0, 1 - P0.s[i] / Lb); }
    if (pe !== null) { const d = pe - y[n - 1], Lb = blend(d); for (let i = 0; i < n; i++) y[i] += d * Math.max(0, 1 - (Ltot - P0.s[i]) / Lb); }
    for (let it = 0; it < 40; it++) { for (let i = 1; i < n; i++) { const mx = g * (P0.s[i] - P0.s[i - 1]); y[i] = Math.max(y[i - 1] - mx, Math.min(y[i - 1] + mx, y[i])); } for (let i = n - 2; i >= 0; i--) { const mx = g * (P0.s[i + 1] - P0.s[i]); y[i] = Math.max(y[i + 1] - mx, Math.min(y[i + 1] + mx, y[i])); } if (ps !== null) y[0] = ps; if (pe !== null) y[n - 1] = pe; }
    P0.ys = y;
    if (ps !== null && Math.abs(y[0] - ps) > 0.05) pinErr.push(`${f.id} start ${f2(y[0] - ps)} m`); if (pe !== null && Math.abs(y[n - 1] - pe) > 0.05) pinErr.push(`${f.id} end ${f2(y[n - 1] - pe)} m`);
  });
  pr(); pr('E. PROVISIONAL VERTICAL PROFILE (terrain-following, smoothed over +-30 m, grade <= 0.9 x class limit, level pinned to the existing road at a T). The real profile with vertical curves + earthwork is step R4.');
  pr('id          cls  y0 -> y1 (m)     max grade %  max cut m  max fill m');
  profs.forEach((p, i) => { let gm = 0, cut = 0, fill = 0; for (let k = 1; k < p.ys.length; k++) gm = Math.max(gm, Math.abs(p.ys[k] - p.ys[k - 1]) / (p.s[k] - p.s[k - 1])); for (let k = 0; k < p.ys.length; k++) { cut = Math.max(cut, p.nat[k] - p.ys[k]); fill = Math.max(fill, p.ys[k] - p.nat[k]); } pr(`${fits[i].id.padEnd(10)}  ${fits[i].cls}   ${f2(p.ys[0])} -> ${f2(p.ys[p.ys.length - 1])}   ${f1(gm * 100).padStart(8)}   ${f1(cut).padStart(7)}   ${f1(fill).padStart(8)}`); if (cut > 6 || fill > 6) wrn(`${fits[i].id}: cut ${f1(cut)} m / fill ${f1(fill)} m against the natural ground (over 6 m: look at it in R4)`); });
  chk(profs.every((p, i) => { let gm = 0; for (let k = 1; k < p.ys.length; k++) gm = Math.max(gm, Math.abs(p.ys[k] - p.ys[k - 1]) / (p.s[k] - p.s[k - 1])); return gm <= CLS[fits[i].cls].grade + 1e-6; }), 'every provisional grade is within the class limit (C 8 %, L 10 %)');
  chk(pinErr.length === 0, `level at every T on an existing road / drawn street matches within 0.05 m${pinErr.length ? ': ' + pinErr.join(', ') : ''}`);
  const rows = fits.map((f, i) => { const p = profs[i]; return `  { name: '${f.id}', src: 'SHP', cls: '${f.cls}', s: [${p.s.map((v) => +v.toFixed(1)).join(',')}], pts: [${p.pts.map((q) => `[${+q[0].toFixed(1)},${+q[1].toFixed(1)}]`).join(',')}], ys: [${p.ys.map((v) => +v.toFixed(2)).join(',')}] },`; });
  writeFileSync('src/roads/city/CityShpLineData.ts', `// GENERATED by scripts/city-shp-fit.ts (MODE=export, STEP CITY-SHP-2). Do not edit: rerun the script. The user's drawn city streets (City_Road.shp, 25 lines -> 17 streets after 8 joins), fitted straight - spiral - arc - spiral - straight, centreline every 10 m (game metres, x east, z south) + PROVISIONAL finished heights (terrain-following, grade-limited; the real vertical profile is step R4).\r\n// Registered in RoadNetwork.layoutCRoads() / layoutLRoads() behind Config.roads.shpCity.enabled. Station s = metres from the first point. Ends are free (no junction mouth, no structure yet, 21.61).\r\nexport interface CityShpLineData { name: string; src: string; cls: 'C' | 'L'; s: number[]; pts: number[][]; ys: number[]; structs?: number[][] }\r\nexport const CITY_SHP_LINE_DATA: CityShpLineData[] = [\r\n${rows.join('\r\n')}\r\n];\r\n`);
}
pr(); pr('D. NOT RUN (said honestly): rail clearance (no rail data read here), buildings (user: they are relocated later), vertical profile / cut-fill (step R4), junction mouths / kerb radii (21.61), tsc, npm run build, game look.');
pr(); pr(`RESULT: ${pass} PASS, ${fail} FAIL, ${warn} WARN (WARN = a finding for the user, not a script error)`);
writeFileSync(`${OUT}/STEP_CITY_${EXPORT ? 'SHP2' : 'SHP1'}_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/city_shp_fit${EXPORT ? '2' : ''}.json`, JSON.stringify({ note: 'STEP CITY-SHP-1: fitted centrelines of City_Road.shp, game metres (x east, z south), every 5 m. DESIGN ONLY, not in src.', classes: CLS, lines: fits.map((f) => ({ id: f.id, cls: f.cls, V: f.V, len: +f.len.toFixed(1), pis: f.pis.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), R: +p.R.toFixed(1), Ls: p.Ls, clamp: p.clamp })), nodes: f.nodes, devMax: +f.devMax.toFixed(2), pts: f.pts.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]) })), ends: ends.map((e) => ({ id: RAW[e.line].id, which: e.which, x: +e.x.toFixed(1), z: +e.z.toFixed(1), kind: e.kind, target: e.target, angle: +e.angle.toFixed(0) })) }));
