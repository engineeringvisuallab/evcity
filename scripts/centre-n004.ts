// STEP 21.6a-3  N004 = OPTION A (user choice 2026-11-17; design speed V80 and cut / fill <= 12 m = engineer's choice, constants below).
// The R6-12 end node moves along R4-9; R6-12 is re-aligned as straight legs (PIs) joined by circular arcs (radius >= R6 V80 minimum x margin; the clothoids come at build time like 21.3).
// Headless; changes NO game file; rewrites docs/centre_fixed.json (line R6-12) and writes docs/STEP_21_6_N004_OUTPUT.txt.  Run: npx tsx scripts/centre-n004.ts [dir]
// Method: for every node station s on R4-9 in a window: ground-following route (20 m grid, 8-16 moves, ground grade <= SEARCH_LIM) -> Douglas-Peucker to PIs (tolerance TOLS) -> arc fillet at every PI with the
// largest radius the legs allow (<= RMAX) -> checks: radius, cut / fill of a 4 % road between the ground end levels (grade-limited envelope), 100 m ground grade, R1 crossings, arrival angle, spacing.
// The best passing candidate (shortest cost = length + 40 x (cut + fill)) is written. Idempotent: if R6-12 is already longer than DONE_LEN nothing is done.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { minRadius } from '../src/interchange/Standards';

const OUT = process.argv[2] ?? 'docs';
// ---- constants (my numbers, change here) ----
const VDES6 = 80, RMARGIN = 1.15, RMAX = 900, GRID = 20, SEARCH_LIM = [0.04, 0.05, 0.06], TOLS = [25, 40, 60, 90], GRADE_LIM = 0.04, WIN = 100, WIN_LIM = 0.07, CUTFILL_MAX = 12;
const S_MIN = 150, S_MAX = 500, ANG_MIN = 60, TAP_GAP = 150, NODE_GAP = 60, DONE_LEN = 600;
type V2 = [number, number]; const hyp = Math.hypot; const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, m: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${m}`); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8')); const by = new Map<string, any>(F.lines.map((l: any) => [l.id, l]));
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample(); const nat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const RREQ = minRadius(VDES6) * RMARGIN;
const plen = (p: V2[]): number => { let s = 0; for (let i = 0; i + 1 < p.length; i++) s += hyp(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return s; };
function resample(p: V2[], step: number): V2[] { const total = plen(p), n = Math.max(2, Math.round(total / step) + 1), R: V2[] = []; let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) { const tg = (total * k) / (n - 1); while (seg + 1 < p.length - 1 && acc + hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) < tg) { acc += hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]); seg++; }
    const sl = hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) || 1, t = Math.max(0, Math.min(1, (tg - acc) / sl)); R.push([p[seg][0] + (p[seg + 1][0] - p[seg][0]) * t, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * t]); } return R; }
function minRad(P: V2[]): number { let best = 9999; for (let i = 1; i + 1 < P.length; i++) { const a = P[i - 1], b = P[i], c = P[i + 1]; const ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]); const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); const r = cr < 1e-6 ? 9999 : (ab * bc * ca) / (2 * cr); if (r < best) best = r; } return best; }
function segInt(a: V2, b: V2, c: V2, d: V2): boolean { const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return false; const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den; return t > 0.002 && t < 0.998 && u > 0.002 && u < 0.998; }
function crossings(pts: V2[], skip: string[]): string[] { const hit = new Set<string>(); for (const o of F.lines) { if (skip.includes(o.id)) continue; const q: V2[] = o.pts; for (let a = 0; a + 1 < pts.length; a++) for (let b = 0; b + 1 < q.length; b++) if (segInt(pts[a], pts[a + 1], q[b], q[b + 1])) hit.add(o.id); } return [...hit]; }
function proj(pts: V2[], x: number, z: number): { d: number; x: number; z: number; i: number } { let b = { d: 1e18, x: 0, z: 0, i: 0 }; for (let i = 0; i + 1 < pts.length; i++) { const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)), px = ax + bx * t, pz = az + bz * t, d = hyp(x - px, z - pz); if (d < b.d) b = { d, x: px, z: pz, i }; } return b; }
function dp(P: V2[], tol: number): V2[] { if (P.length < 3) return P; const a = P[0], b = P[P.length - 1]; let md = -1, mi = 0; const l = hyp(b[0] - a[0], b[1] - a[1]) || 1; for (let i = 1; i + 1 < P.length; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / l; if (d > md) { md = d; mi = i; } } if (md <= tol) return [a, b]; const left = dp(P.slice(0, mi + 1), tol), right = dp(P.slice(mi), tol); return left.slice(0, -1).concat(right); }
/** straight legs between PIs, arc fillet at every interior PI; returns null if some radius < rmin */
function fillet(PI: V2[], rmin: number): V2[] | null {
  const n = PI.length; if (n < 3) return PI; const out: V2[] = [PI[0]]; const tl: number[] = [], R: number[] = [], dl: number[] = [];
  for (let i = 1; i + 1 < n; i++) { const a = PI[i - 1], b = PI[i], c = PI[i + 1]; const u: V2 = [(a[0] - b[0]), (a[1] - b[1])], v: V2 = [(c[0] - b[0]), (c[1] - b[1])]; const lu = hyp(u[0], u[1]), lv = hyp(v[0], v[1]); const cs = (u[0] * v[0] + u[1] * v[1]) / (lu * lv); const ang = Math.acos(Math.max(-1, Math.min(1, cs))); const defl = Math.PI - ang; dl.push(defl);
    if (defl < 0.02) { tl.push(0); R.push(1e9); continue; } const avail = Math.min(i === 1 ? lu : lu / 2, i === n - 2 ? lv : lv / 2); const r = Math.min(RMAX, avail / Math.tan(defl / 2)); if (r < rmin) return null; R.push(r); tl.push(r * Math.tan(defl / 2)); }
  for (let i = 1; i + 1 < n; i++) { const a = PI[i - 1], b = PI[i], c = PI[i + 1]; const t = tl[i - 1], r = R[i - 1]; if (t === 0) { out.push(b); continue; } const u: V2 = [a[0] - b[0], a[1] - b[1]], v: V2 = [c[0] - b[0], c[1] - b[1]]; const lu = hyp(u[0], u[1]), lv = hyp(v[0], v[1]); const p1: V2 = [b[0] + (u[0] / lu) * t, b[1] + (u[1] / lu) * t], p2: V2 = [b[0] + (v[0] / lv) * t, b[1] + (v[1] / lv) * t];
    const bis: V2 = [(u[0] / lu + v[0] / lv), (u[1] / lu + v[1] / lv)]; const lb = hyp(bis[0], bis[1]); const cen: V2 = [b[0] + (bis[0] / lb) * (r / Math.cos(dl[i - 1] / 2) - 0) * Math.cos(dl[i - 1] / 2) * 0 + (bis[0] / lb) * (r / Math.sin((Math.PI - dl[i - 1]) / 2)), b[1] + (bis[1] / lb) * (r / Math.sin((Math.PI - dl[i - 1]) / 2))];
    const a1 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]); let a2 = Math.atan2(p2[1] - cen[1], p2[0] - cen[0]); let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const m = Math.max(2, Math.ceil((Math.abs(da) * r) / 10)); for (let k = 0; k <= m; k++) { const ak = a1 + (da * k) / m; out.push([cen[0] + r * Math.cos(ak), cen[1] + r * Math.sin(ak)]); } }
  out.push(PI[n - 1]); return out; }

const r12 = by.get('R6-12'), r49 = by.get('R4-9');
pr('STEP 21.6a-3  N004 OPTION A: R6-12 end node moved along R4-9, R6-12 re-aligned (headless; nothing in src changed)');
pr(`R6 V${VDES6}, smallest radius ${f0(minRadius(VDES6))} m (x ${RMARGIN} = ${f0(RREQ)} m), road grade limit ${100 * GRADE_LIM} % (R11), cut / fill limit ${CUTFILL_MAX} m (engineer's choice)`);
if (plen(r12.pts) > DONE_LEN) { pr(`R6-12 is already ${f0(plen(r12.pts))} m long: step already applied, nothing changed`); writeFileSync(`${OUT}/STEP_21_6_N004_OUTPUT.txt`, L.join('\n') + '\n'); process.exit(0); }
const start: V2 = [r12.pts[0][0], r12.pts[0][1]]; const old = r12.pts.map((p: V2) => [p[0], p[1]] as V2); const R49: V2[] = resample(r49.pts, 10);
const X0 = -1700, X1 = 1100, Z0 = -2700, Z1 = -1100, nx = Math.round((X1 - X0) / GRID) + 1, nz = Math.round((Z1 - Z0) / GRID) + 1;
const H = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = nat(X0 + i * GRID, Z0 + j * GRID);
const ix = (x: number, z: number): { i: number; j: number } => ({ i: Math.round((x - X0) / GRID), j: Math.round((z - Z0) / GRID) });
const mv: number[][] = []; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if ((a || b) && hyp(a, b) <= 3.2) mv.push([a, b, hyp(a, b) * GRID]);
const otherEnds: V2[] = []; for (const o of F.lines) { if (o.id === 'R4-9' || o.id === 'R6-12') continue; for (const e of [o.pts[0], o.pts[o.pts.length - 1]] as V2[]) if (proj(r49.pts, e[0], e[1]).d < 15) otherEnds.push(e); }
interface Cand { s: number; node: V2; len: number; rad: number; gmax: number; x: string[]; ang: number; tap: number; ng: number; path: V2[]; lim: number; tol: number; cut: number; fill: number; why: string[]; ok: boolean; score: number; npi: number }
const cands: Cand[] = [];
for (const LIM of SEARCH_LIM) {
  const s0 = ix(start[0], start[1]), st = s0.j * nx + s0.i; const dist = new Float64Array(nx * nz).fill(1e18), prev = new Int32Array(nx * nz).fill(-1); dist[st] = 0; const pq: number[][] = [[0, st]];
  while (pq.length) { pq.sort((a, b) => b[0] - a[0]); const [dd, u] = pq.pop()!; if (dd > dist[u]) continue; const ui = u % nx, uj = (u / nx) | 0; for (const [a, b, l] of mv) { const vi = ui + a, vj = uj + b; if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue; const v = vj * nx + vi; if (Math.abs(H[v] - H[u]) / l > LIM) continue; const nd = dd + l * (1 + 0.5 * (Math.abs(H[v] - H[u]) / l)); if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push([nd, v]); } } }
  for (let k = 0; k < R49.length; k++) { const sR = k * 10; if (sR < S_MIN || sR > S_MAX || sR % 20) continue; const q = R49[k]; const { i, j } = ix(q[0], q[1]); let best = 1e18, bu = -1; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const u = (j + b) * nx + i + a; if (u >= 0 && u < nx * nz && dist[u] < best) { best = dist[u]; bu = u; } } if (best > 1e17) continue;
    const raw: V2[] = []; for (let u = bu; u >= 0; u = prev[u]) raw.push([X0 + (u % nx) * GRID, Z0 + ((u / nx) | 0) * GRID]); raw.reverse(); raw[0] = start; raw.push(q);
    for (const tol of TOLS) { const PI = dp(raw, tol); const P0 = fillet(PI, RREQ); if (!P0) continue; const P = resample(P0, 10); const gl = P.map((p) => nat(p[0], p[1])); let gmax = 0; for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) { const d = (b - a) * 10; if (d >= WIN) { gmax = Math.max(gmax, Math.abs(gl[b] - gl[a]) / d); break; } }
      let cut = 0, fill = 0; { const n = P.length; const lo = gl.slice(), up = gl.slice(); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const d = Math.abs(a - b) * 10; lo[a] = Math.min(lo[a], gl[b] + GRADE_LIM * d); up[a] = Math.max(up[a], gl[b] - GRADE_LIM * d); } for (let a = 0; a < n; a++) { cut = Math.max(cut, gl[a] - lo[a]); fill = Math.max(fill, up[a] - gl[a]); } }
      const t1 = P[P.length - 1], t0 = P[Math.max(0, P.length - 4)]; const tg = R49[Math.min(R49.length - 1, k + 2)], tg0 = R49[Math.max(0, k - 2)]; const a1 = Math.atan2(t1[1] - t0[1], t1[0] - t0[0]), a2 = Math.atan2(tg[1] - tg0[1], tg[0] - tg0[0]); let ang = (Math.abs(a1 - a2) * 180 / Math.PI) % 180; if (ang > 90) ang = 180 - ang;
      const x = crossings(P, ['R4-9', 'R6-12']); const tap = hyp(q[0] - R49[0][0], q[1] - R49[0][1]); let ng = 1e9; for (const o of otherEnds) ng = Math.min(ng, hyp(o[0] - q[0], o[1] - q[1])); const rad = minRad(P); const why: string[] = [];
      if (rad < RREQ * 0.97) why.push('radius'); if (cut > CUTFILL_MAX || fill > CUTFILL_MAX) why.push('cut/fill'); if (x.length) why.push('crossing'); if (ang < ANG_MIN) why.push('angle'); if (tap < TAP_GAP) why.push('tap'); if (ng < NODE_GAP) why.push('node');
      const len = plen(P); cands.push({ s: sR, node: q, len, rad, gmax, x, ang, tap, ng, path: P, lim: LIM, tol, cut, fill, why, ok: why.length === 0, score: len + 40 * (cut + fill), npi: PI.length }); } }
}
pr(''); pr(`CANDIDATES (${cands.length} fitted alignments; best per node station: search limit, PI tolerance, PIs, length, smallest radius, 100 m ground grade, cut / fill of a 4 % road, arrival angle, verdict)`);
const bestPer = new Map<number, Cand>(); for (const c of cands) { const b = bestPer.get(c.s); if (!b || (c.ok && !b.ok) || (c.ok === b.ok && c.score < b.score)) bestPer.set(c.s, c); }
for (const c of [...bestPer.values()].sort((a, b) => a.s - b.s)) pr(`   s ${String(c.s).padStart(3)} (${f0(c.node[0])}, ${f0(c.node[1])})  lim ${100 * c.lim} %  tol ${c.tol}  ${c.npi} PI  len ${f0(c.len).padStart(5)} m  R ${f0(c.rad).padStart(4)} m  grade ${f1(100 * c.gmax)} %  cut ${f1(c.cut)} fill ${f1(c.fill)} m  angle ${f0(c.ang)}  ${c.ok ? 'OK' : 'x ' + c.why.join(',')}`);
const okc = cands.filter((q) => q.ok).sort((a, b) => a.score - b.score); pr('');
if (!okc.length) { pr('NO candidate passes all checks: nothing written'); chk(false, 'a candidate for option A passes'); }
else {
  const c = okc[0]; const q = proj(r49.pts, c.node[0], c.node[1]); const P = c.path.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] as V2); P[P.length - 1] = [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]; P[0] = [start[0], start[1]];
  pr(`CHOSEN: node on R4-9 at s ${c.s} (${f1(P[P.length - 1][0])}, ${f1(P[P.length - 1][1])}), R4-9 ground ${f1(nat(c.node[0], c.node[1]))} m, ${c.npi} PIs, tolerance ${c.tol} m. R6-12: ${f0(plen(old))} m -> ${f0(c.len)} m (start ${f0(start[0])}, ${f0(start[1])} = R6-6A / R6-13, unchanged).`);
  chk(c.rad >= RREQ * 0.97, `radius ${f0(c.rad)} m >= ${f0(RREQ * 0.97)} m (R6 V${VDES6} minimum ${f0(minRadius(VDES6))} m)`);
  chk(c.cut <= CUTFILL_MAX && c.fill <= CUTFILL_MAX, `a ${100 * GRADE_LIM} % road (R11) between the end ground levels needs cut max ${f1(c.cut)} m, fill max ${f1(c.fill)} m (<= ${CUTFILL_MAX} m); natural ground grade over ${WIN} m max ${f1(100 * c.gmax)} % (INFO, steep hill: the cut / fill is the real measure)`);
  const hit = crossings(P, ['R4-9', 'R6-12']); chk(hit.length === 0, `R1: R6-12 crosses no other line (${hit.join(' ') || 'none'})`);
  let r49x = 0; for (let a = 0; a + 1 < P.length; a++) for (let b = 0; b + 1 < r49.pts.length; b++) if (segInt(P[a], P[a + 1], r49.pts[b], r49.pts[b + 1])) r49x++; chk(r49x === 0, `R1: R6-12 only touches R4-9 at its end node (crossings with R4-9: ${r49x})`);
  chk(c.ang >= ANG_MIN, `arrival angle on R4-9 ${f0(c.ang)} deg >= ${ANG_MIN}`);
  chk(c.tap >= TAP_GAP && c.ng >= NODE_GAP, `node ${f0(c.tap)} m from the J1-N tap (>= ${TAP_GAP}), ${c.ng > 1e8 ? 'no other node' : f0(c.ng) + ' m from the nearest other node'} on R4-9 (>= ${NODE_GAP})`);
  chk(proj(r49.pts, P[P.length - 1][0], P[P.length - 1][1]).d < 0.5, 'R6-12 end lies on R4-9');
  pr(`   INFO old node N004 (-237, -2195) becomes a plain point of R4-9; R4-9 and R6-12 levels are solved again in 21.4 / 21.4c; R6-12 old length ${f0(plen(old))} m with 18 % natural grade`);
  if (fail === 0) { r12.pts = P; r12.notes = (r12.notes ?? []).concat([`N004 OPTION A (21.6): end moved to R4-9 s ${c.s} (${f1(P[P.length - 1][0])}, ${f1(P[P.length - 1][1])}), re-aligned ${f0(c.len)} m`]); writeFileSync(`${OUT}/centre_fixed.json`, JSON.stringify(F)); }
  else pr('FAIL: docs/centre_fixed.json NOT written');
}
pr(''); pr('Because centre_fixed.json changed, centre_profile.json / centre_vprofile.json / centre_sections.json are OLD for R6-12 (R6 is all OPEN, centre_use.json stays valid): re-run order next step.'); pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/STEP_21_6_N004_OUTPUT.txt`, L.join('\n') + '\n');
