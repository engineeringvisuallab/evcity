// STEP G4 (headless): RE-ROUTE the R6 lines that G3 found FAIL or HEAVY, on the REAL game ground (TerrainGenerator.sampleGround), and write the new line set.
// Decision of 2026-11-15 (AI, user said 'tomar kase valo mone hoy'): DROP L5, L31, L32, L45; re-route every line that FAILs or is heavy (cut > 8 m or cut + fill > 100 m3 per m);
// short wet runs (<= 120 m) are accepted as a bridge ONLY if no dry path exists in the corridor. Both line ends stay fixed (they meet other roads), corridor 400 m round the sketch line (R10).
// Method: grid of 20 m cells in the corridor, 16-neighbour Dijkstra; edge cost = length x (1 + (natural grade / 5 %)^2 + (cell slope / 15 %)^2 + zone penalty); sea / river blocked;
// the path is then smoothed (ends fixed, shift <= 80 m, radius >= 229 m if possible) and a profile is solved on it with the G3 solver; the new line is accepted only if its 'badness' is lower.
// Run: npx tsx scripts/r6-reroute.ts [dir]      reads dir/r6_g2b.json + r6_g2c.json, writes dir/r6_g4_lines.json (all final lines) and dir/r6_g4_reroute.txt
import { writeFileSync } from 'node:fs';
import { loadG2, solveLine, resample, gnd, f0, f1, MAXFILL, type Src, type Res } from './r6-profile-lib';
import { getWorldZoneAt } from '../src/city/WorldZones';

const dir = process.argv[2] ?? 'docs';
const DROP = [5, 31, 32, 45];
const CELL = 20, CORR = 400, SMOOTH_MAX_SHIFT = 80, RMIN = 229;
const CUT_TARGET = 8, CF_TARGET = 100;
const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };

const cfPerM = (r: Res) => (r.cutVol + r.fillVol) / r.len;
const heavy = (r: Res) => !r.pass || r.maxCut > CUT_TARGET || cfPerM(r) > CF_TARGET;
const badness = (r: Res) => (r.pass ? 0 : 500) + r.structLen * 5 + Math.max(0, r.maxCut - CUT_TARGET) * 50 + Math.max(0, cfPerM(r) - CF_TARGET) * 5 + r.over3 * 0.05;

function minRadius(p: number[][]): number {
  let m = Infinity; const k = 3;
  for (let i = k; i + k < p.length; i++) {
    const a = p[i - k], b = p[i], c = p[i + k];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area2 > 1e-6) m = Math.min(m, (ab * bc * ca) / (2 * area2));
  }
  return m;
}
function distToPoly(x: number, z: number, pts: number[][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)); best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t));
  }
  return best;
}

/** cheapest dry path between the two ends of src.pts inside the corridor; null if none */
function route(src: Src): number[][] | null {
  const pts = src.pts, A = pts[0], Z = pts[pts.length - 1];
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - CORR - CELL, z0 = Math.min(...zs) - CORR - CELL, nx = Math.ceil((Math.max(...xs) + CORR + CELL - x0) / CELL) + 1, nz = Math.ceil((Math.max(...zs) + CORR + CELL - z0) / CELL) + 1;
  const H = new Float32Array(nx * nz), ok = new Uint8Array(nx * nz), pen = new Float32Array(nx * nz), slope = new Float32Array(nx * nz);
  const cx = (i: number) => x0 + i * CELL, cz = (j: number) => z0 + j * CELL;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = cx(i), z = cz(j), o = j * nx + i, d = distToPoly(x, z, pts);
    if (d > CORR) continue;
    const g = gnd(x, z); H[o] = g.h; ok[o] = g.wet || g.h < 0 ? 0 : 1;
    const zn = getWorldZoneAt(x, z).kind; pen[o] = zn === 'airport' || zn === 'seaport' || zn === 'army' || zn === 'engineering' ? 2 : 0;
    pen[o] += (d / CORR) * 0.15;              // small pull to the sketch line (R10)
  }
  for (let j = 1; j + 1 < nz; j++) for (let i = 1; i + 1 < nx; i++) {
    const o = j * nx + i; if (!ok[o]) continue;
    slope[o] = Math.hypot(H[o + 1] - H[o - 1], H[o + nx] - H[o - nx]) / (2 * CELL);
  }
  const cell = (p: number[]) => { const i = Math.round((p[0] - x0) / CELL), j = Math.round((p[1] - z0) / CELL); return j * nx + i; };
  const s = cell(A), t = cell(Z); ok[s] = 1; ok[t] = 1;
  const NB: number[][] = []; for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1]]) NB.push([a, b, Math.hypot(a, b) * CELL]);
  const dist = new Float64Array(nx * nz).fill(Infinity), prev = new Int32Array(nx * nz).fill(-1); const heap: number[][] = [];
  const push = (d: number, o: number) => { heap.push([d, o]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  dist[s] = 0; push(0, s);
  while (heap.length) {
    const [d, o] = pop(); if (d > dist[o]) continue; if (o === t) break;
    const i = o % nx, j = (o - i) / nx;
    for (const [a, b, len] of NB) {
      const i2 = i + a, j2 = j + b; if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= nz) continue; const o2 = j2 * nx + i2; if (!ok[o2]) continue;
      const g = Math.abs(H[o2] - H[o]) / len, c = len * (1 + (g / 0.05) ** 2 + (slope[o2] / 0.15) ** 2 + pen[o2]);
      if (d + c < dist[o2]) { dist[o2] = d + c; prev[o2] = o; push(d + c, o2); }
    }
  }
  if (!Number.isFinite(dist[t])) return null;
  const path: number[][] = []; for (let o = t; o >= 0; o = prev[o]) { const i = o % nx, j = (o - i) / nx; path.push([cx(i), cz(j)]); if (o === s) break; }
  path.reverse(); path[0] = [A[0], A[1]]; path[path.length - 1] = [Z[0], Z[1]];
  return path;
}
/** resample path every 20 m, smooth with ends fixed until radius >= RMIN or shift limit */
function smooth(path: number[][], ref: number[][]): { pts: number[][]; minR: number; shift: number } {
  const r = resample(path); let p = r.x.map((x, i) => [x, r.z[i]]); const raw = p.map((q) => [q[0], q[1]]);
  const n = Math.max(2, Math.round(r.len / 20)); p = []; for (let i = 0; i <= n; i++) { const k = (i / n) * (r.x.length - 1), a = Math.floor(k), b = Math.min(r.x.length - 1, a + 1), f = k - a; p.push([r.x[a] + (r.x[b] - r.x[a]) * f, r.z[a] + (r.z[b] - r.z[a]) * f]); }
  const start = p.map((q) => [q[0], q[1]]);
  let best = p.map((q) => [q[0], q[1]]), bestR = minRadius(p);
  for (let it = 0; it < 400 && bestR < RMIN; it++) {
    const q = p.map((v) => [v[0], v[1]]);
    for (let i = 1; i + 1 < p.length; i++) { q[i][0] = p[i][0] + 0.4 * ((p[i - 1][0] + p[i + 1][0]) / 2 - p[i][0]); q[i][1] = p[i][1] + 0.4 * ((p[i - 1][1] + p[i + 1][1]) / 2 - p[i][1]); }
    let shift = 0; for (let i = 0; i < q.length; i++) shift = Math.max(shift, Math.hypot(q[i][0] - start[i][0], q[i][1] - start[i][1]));
    if (shift > SMOOTH_MAX_SHIFT) break; p = q; const R = minRadius(p); if (R > bestR) { bestR = R; best = p.map((v) => [v[0], v[1]]); }
  }
  void raw;
  let shift = 0; for (const q of best) shift = Math.max(shift, distToPoly(q[0], q[1], ref));
  return { pts: best, minR: bestR, shift };
}

// ---------------- run ----------------
const { srcs } = loadG2(dir);
pr(`R6 STEP G4: RE-ROUTE of FAIL / HEAVY lines on the real game ground. Drop ${DROP.map((d) => 'L' + d).join(', ')} (decision of the AI, user: 'tomar kase valo mone hoy').`);
pr(`Heavy = cut > ${CUT_TARGET} m or cut + fill > ${CF_TARGET} m3 per m. Corridor ${CORR} m, cell ${CELL} m, ends fixed, smoothing shift <= ${SMOOTH_MAX_SHIFT} m, radius aim ${RMIN} m. Cost weights are MY numbers.`);
const kept = srcs.filter((s) => !DROP.includes(s.id));
const final: (Src & { how: string })[] = [];
const rows: string[] = [];
for (const s of kept) {
  const g3 = solveLine(s);
  if (!heavy(g3)) { final.push({ ...s, how: 'unchanged (G3 clean)' }); continue; }
  const path = route(s);
  if (!path) { final.push({ ...s, how: 'unchanged (no dry path in the corridor)' }); rows.push(`  L${s.id}: NO dry path in the ${CORR} m corridor -> line kept as it was (${g3.pass ? 'PASS' : 'FAIL'}, cut ${f1(g3.maxCut)} m, cut + fill ${f0(cfPerM(g3))} m3/m, wet ${f0(g3.wetLen)} m, hi-fill ${f0(g3.highFillLen)} m)`); continue; }
  const sm = smooth(path, s.pts), cand: Src = { id: s.id, origin: 'G4 re-routed', pts: sm.pts, minR: Math.round(sm.minR) };
  const g4 = solveLine(cand);
  const better = badness(g4) < badness(g3) - 1e-6;
  const fmt = (r: Res) => `${r.pass ? 'PASS' : 'FAIL'} cut ${f1(r.maxCut)} m, cut+fill ${f0(cfPerM(r))} m3/m, wet ${f0(r.wetLen)} m, hi-fill ${f0(r.highFillLen)} m, grade ${f1(r.maxG)} %, len ${f0(r.len)} m`;
  rows.push(`  L${s.id}: ${better ? 'RE-ROUTED' : 'kept old (new path not better)'}  | old: ${fmt(g3)} | new: ${fmt(g4)} | max shift from sketch ${f0(sm.shift)} m, min radius ${f0(sm.minR)} m${sm.minR < RMIN ? ' (BELOW ' + RMIN + ', NOT smooth enough)' : ''}`);
  final.push(better ? { ...cand, how: `re-routed, shift ${f0(sm.shift)} m` } : { ...s, how: 'unchanged (new path not better)' });
}
pr();
pr('PER LINE (old = G3 line on the user\'s sketch, new = G4 path):');
for (const r of rows) pr(r);
pr();
pr(`Lines now ${final.length} (G3 had ${srcs.length}, dropped ${DROP.length}, fill > ${MAXFILL} m = viaduct limit as in G3).`);
writeFileSync(`${dir}/r6_g4_lines.json`, JSON.stringify({ note: 'G4 final R6 line set (dropped lines removed, re-routed lines replaced); pts = world metres [x, z]', drop: DROP, lines: final.map((l) => ({ src_id: l.id, origin: l.origin, how: l.how, min_radius_m: l.minR ?? undefined, pts: l.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) })) }));
writeFileSync(`${dir}/r6_g4_reroute.txt`, P.join('\n') + '\n');
