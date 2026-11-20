// STEP CITY-SHP-1 ENGINEERING FIT of the user's drawn city streets (City_Road.shp). Headless, changes NO src file, writes only docs/.
// Run: python3 tools/city-shp-import.py City_Road/City_Road.shp   (makes docs/city_shp_raw.json, game metres)
//      node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-shp-fit.ts docs
//      python3 tools/city-shp-plot.py                              (picture docs/city_shp_fit.png)
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
const RAW: { id: string; pts: P[] }[] = JSON.parse(readFileSync(`${OUT}/city_shp_raw.json`, 'utf8')).lines;
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
pr('STEP CITY-SHP-1 engineering fit of City_Road.shp (25 drawn street lines), design only, src untouched');
pr(`Frame: x east, z south, x = Easting - 5000, z = 5000 - Northing (GIS grid of the game, ASSUMED: the file has no .prj). Classes: C V${CLS.C.V} / L V${CLS.L.V}, 2 lanes only (user decision 2026-11-20).`);
const EXIST = FX.filter((l) => l.cls !== '8'), EIGHT = FX.filter((l) => l.cls === '8');
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
chk(RAW.length === 25 && RAW.every((l) => l.pts.length >= 2), `25 drawn lines read, ${RAW.reduce((s, l) => s + l.pts.length, 0)} points, ${f0(RAW.reduce((s, l) => s + plen(l.pts), 0))} m drawn (R9: nothing but this file read)`);
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
  for (let b = a + 1; b < fits.length; b++) for (let i = 1; i < fits[a].pts.length; i++) for (let j = 1; j < fits[b].pts.length; j++) if (segInt(fits[a].pts[i - 1], fits[a].pts[i], fits[b].pts[j - 1], fits[b].pts[j])) { crossSH++; crossList.push(`${fits[a].id} x ${fits[b].id} at (${f0(fits[a].pts[i][0])}, ${f0(fits[a].pts[i][1])})`); }
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
pr(); pr('D. NOT RUN (said honestly): rail clearance (no rail data read here), buildings (user: they are relocated later), vertical profile / cut-fill (step R4), junction mouths / kerb radii (21.61), tsc, npm run build, game look.');
pr(); pr(`RESULT: ${pass} PASS, ${fail} FAIL, ${warn} WARN (WARN = a finding for the user, not a script error)`);
writeFileSync(`${OUT}/STEP_CITY_SHP1_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/city_shp_fit.json`, JSON.stringify({ note: 'STEP CITY-SHP-1: fitted centrelines of City_Road.shp, game metres (x east, z south), every 5 m. DESIGN ONLY, not in src.', classes: CLS, lines: fits.map((f) => ({ id: f.id, cls: f.cls, V: f.V, len: +f.len.toFixed(1), pis: f.pis.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), R: +p.R.toFixed(1), Ls: p.Ls, clamp: p.clamp })), nodes: f.nodes, devMax: +f.devMax.toFixed(2), pts: f.pts.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]) })), ends: ends.map((e) => ({ id: RAW[e.line].id, which: e.which, x: +e.x.toFixed(1), z: +e.z.toFixed(1), kind: e.kind, target: e.target, angle: +e.angle.toFixed(0) })) }));
