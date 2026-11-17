// STEP 21.6a-1  21.3 CLEANUP (headless; changes NO game file; rewrites docs/centre_fixed.json and writes docs/STEP_21_6_CLEAN_OUTPUT.txt).
// Run: npx tsx scripts/centre-clean.ts [dir]   (default docs). Safe to run twice: a line already moved is detected and left alone.
// USER DECISION (21.6 order): R4-9 start moves 55 m along J1-N to (398, -1271) (it was on the deck); R4-13 end is extended 134 m along J1-E to (860, 389).
// N004 (R6-12 x R4-9) is NOT changed here: the user has not chosen yet, this script only PRINTS the options with numbers (grade-limited ground route search).
// Method for a moved end: the old line is kept; its last / first piece is replaced by a cubic Hermite from a point of the old line (tangent kept) to the new end
// (tangent = normal of the arm), the shortest piece whose smallest radius is >= class radius x RMARGIN and which makes no new crossing (R1). World metres: x east, z south.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { minRadius } from '../src/interchange/Standards';

const OUT = process.argv[2] ?? 'docs';
// ---- constants (my numbers, change here) ----
const VDES4 = 60, RMARGIN = 1.1, BMIN = 120, BMAX = 700, BSTEP = 10, RES = 10;
const R4_START_NEW: V2 = [398, -1271], R4_END_NEW: V2 = [860, 389];
const GRADE_LIMIT4 = 0.06, NODE_GAP = 60;
const N004_START: V2 = [25, -2161], N004_LIM = [0.04, 0.05], N004_GRID = 20;
const cand: Record<number, { s: number; p: V2; g: number; len: number; ratio: number; ok: boolean }[]> = {};

type V2 = [number, number];
const hyp = Math.hypot; const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, m: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${m}`); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const byId = new Map<string, any>(F.lines.map((l: any) => [l.id, l]));
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const nat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const RREQ = minRadius(VDES4);

function proj(pts: V2[], x: number, z: number): { d: number; x: number; z: number; i: number } {
  let b = { d: 1e18, x: 0, z: 0, i: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)), px = ax + bx * t, pz = az + bz * t, d = hyp(x - px, z - pz);
    if (d < b.d) b = { d, x: px, z: pz, i };
  } return b;
}
const plen = (p: V2[]): number => { let s = 0; for (let i = 0; i + 1 < p.length; i++) s += hyp(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return s; };
function segInt(a: V2, b: V2, c: V2, d: V2): boolean {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return false;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den; return t > 0.002 && t < 0.998 && u > 0.002 && u < 0.998;
}
/** proper crossings of a polyline with every other line (touching at an end is not counted) */
function crossings(pts: V2[], skip: string): string[] {
  const hit = new Set<string>();
  for (const o of F.lines) { if (o.id === skip) continue; const q: V2[] = o.pts; for (let a = 0; a + 1 < pts.length; a++) for (let b = 0; b + 1 < q.length; b++) if (segInt(pts[a], pts[a + 1], q[b], q[b + 1])) hit.add(o.id); }
  return [...hit];
}
function minRad(P: V2[]): number {
  let best = 9999; for (let i = 1; i + 1 < P.length; i++) { const a = P[i - 1], b = P[i], c = P[i + 1]; const ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]); const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); const r = cr < 1e-6 ? 9999 : (ab * bc * ca) / (2 * cr); if (r < best) best = r; } return best;
}
function resampleAt(p: V2[], step: number): V2[] {
  const total = plen(p), n = Math.max(2, Math.round(total / step) + 1), R: V2[] = []; let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) { const tg = (total * k) / (n - 1); while (seg + 1 < p.length - 1 && acc + hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) < tg) { acc += hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]); seg++; }
    const sl = hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) || 1, t = Math.max(0, Math.min(1, (tg - acc) / sl)); R.push([p[seg][0] + (p[seg + 1][0] - p[seg][0]) * t, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * t]); } return R;
}
function hermite(A: V2, tA: V2, B: V2, tB: V2): V2[] {
  const chord = hyp(B[0] - A[0], B[1] - A[1]), m = chord * 1.0, P: V2[] = [], n = 400;
  for (let k = 0; k <= n; k++) { const t = k / n, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    P.push([h00 * A[0] + h10 * m * tA[0] + h01 * B[0] + h11 * m * tB[0], h00 * A[1] + h10 * m * tA[1] + h01 * B[1] + h11 * m * tB[1]]); } return P;
}
const unit = (a: V2, b: V2): V2 => { const l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

/** move one end of line `id` onto arm `arm` at point `target` (snapped to the arm); which = 'start' | 'end' */
function moveEnd(id: string, arm: string, target: V2, which: 'start' | 'end'): void {
  const ln = byId.get(id), armPts: V2[] = byId.get(arm).pts;
  const sn = proj(armPts, target[0], target[1]); const E: V2 = [sn.x, sn.z];
  // arm tangent at the snap point, the new end leaves / arrives on the normal, on the side of the old line
  const at = unit(armPts[sn.i], armPts[sn.i + 1]); let nrm: V2 = [-at[1], at[0]];
  const pts0: V2[] = ln.pts.map((p: V2) => [p[0], p[1]] as V2); const oldEnd = which === 'start' ? pts0[0] : pts0[pts0.length - 1];
  const inner = which === 'start' ? pts0[Math.min(8, pts0.length - 1)] : pts0[Math.max(0, pts0.length - 9)];
  if ((inner[0] - oldEnd[0]) * nrm[0] + (inner[1] - oldEnd[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];   // nrm points from the arm into the line
  pr(`${id} ${which}: old end (${f0(oldEnd[0])}, ${f0(oldEnd[1])})  ->  new end on ${arm} (${f1(E[0])}, ${f1(E[1])})  move ${f0(hyp(E[0] - oldEnd[0], E[1] - oldEnd[1]))} m (snap distance of the decision point ${f1(sn.d)} m)`);
  if (hyp(E[0] - oldEnd[0], E[1] - oldEnd[1]) < 5) { pr(`   already moved (end is ${f1(hyp(E[0] - oldEnd[0], E[1] - oldEnd[1]))} m from the new point): left unchanged`); chk(true, `${id} ${which} already on the new point`); return; }
  const base = which === 'start' ? pts0 : pts0.slice().reverse();                 // base[0] = the end that moves, running into the line
  const cumulative: number[] = [0]; for (let i = 1; i < base.length; i++) cumulative.push(cumulative[i - 1] + hyp(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
  const othersBefore = crossings(pts0, id).length;
  let chosen: { R: V2[]; b: number; r: number; x: string[] } | null = null, tried = 0, bestAny: { R: V2[]; b: number; r: number; x: string[] } | null = null;
  for (let b = BMIN; b <= Math.min(BMAX, cumulative[cumulative.length - 1] - 40); b += BSTEP) {
    let k = 0; while (k + 1 < base.length && cumulative[k + 1] < b) k++; const B = base[k + 1], tB = unit(base[k], base[k + 1]); const A = E;
    const piece = resampleAt(hermite(A, nrm, B, tB), RES); const R: V2[] = piece.concat(base.slice(k + 2));
    const r = minRad(piece.concat(base.slice(k + 2, k + 6))), x = crossings(R, id); tried++;
    if (!bestAny || r > bestAny.r) bestAny = { R, b, r, x };
    if (r >= RREQ * RMARGIN && x.length <= othersBefore) { chosen = { R, b, r, x }; break; }
  }
  if (!chosen) { pr(`   no blend found in ${tried} tries (best radius ${bestAny ? f0(bestAny.r) : '-'} m, needs ${f0(RREQ * RMARGIN)} m)`); chk(false, `${id} ${which}: blend with radius >= ${f0(RREQ * RMARGIN)} m and no new crossing`); return; }
  const newPts = which === 'start' ? chosen.R : chosen.R.slice().reverse();
  ln.pts = newPts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  ln.notes = (ln.notes ?? []).concat([`CLEANUP 21.6: ${which} moved ${f0(hyp(E[0] - oldEnd[0], E[1] - oldEnd[1]))} m onto ${arm} (${f1(E[0])}, ${f1(E[1])}), new piece ${f0(chosen.b)} m long`]);
  pr(`   blend piece joins the old line ${f0(chosen.b)} m from the end, smallest radius there ${f0(chosen.r)} m (class V${VDES4} needs ${f0(RREQ)} m x ${RMARGIN} = ${f0(RREQ * RMARGIN)} m), line length ${f0(plen(pts0))} -> ${f0(plen(newPts))} m`);
  // checks
  chk(chosen.r >= RREQ * RMARGIN, `${id}: smallest radius of the new piece ${f0(chosen.r)} m >= ${f0(RREQ * RMARGIN)} m`);
  chk(chosen.x.length <= othersBefore, `${id} R1: no NEW crossing (crossings of the whole line with other lines ${chosen.x.length}, before ${othersBefore}${chosen.x.length ? ': ' + chosen.x.join(' ') : ''}; this one is OLD, far from the changed end, not touched here)`);
  const pn = proj(armPts, newPts[which === 'start' ? 0 : newPts.length - 1][0], newPts[which === 'start' ? 0 : newPts.length - 1][1]);
  chk(pn.d < 0.5, `${id}: new end lies on ${arm} (${f1(pn.d)} m off)`);
  // other line ends on the same arm: node spacing
  const gaps: string[] = []; let minGap = 1e9; for (const o of F.lines) { if (o.id === id) continue; for (const e of [o.pts[0], o.pts[o.pts.length - 1]] as V2[]) { const pj = proj(armPts, e[0], e[1]); if (pj.d < 15) { const g = hyp(e[0] - E[0], e[1] - E[1]); gaps.push(`${o.id} ${f0(g)} m`); if (g < minGap) minGap = g; } } }
  chk(minGap >= NODE_GAP, `${id}: >= ${NODE_GAP} m to every other node on ${arm} (nearest: ${gaps.sort().slice(0, 4).join(', ') || 'none'})`);
  // ground of the new piece (natural ground, information only; the real level comes from 21.4 / 21.4c again): mean grade end -> join point
  const ordered = which === 'start' ? newPts : newPts.slice().reverse(); let arc = 0, jn = 0; for (let i = 1; i < ordered.length && arc < chosen.b; i++) { arc += hyp(ordered[i][0] - ordered[i - 1][0], ordered[i][1] - ordered[i - 1][1]); jn = i; }
  const h0 = nat(ordered[0][0], ordered[0][1]), h1 = nat(ordered[jn][0], ordered[jn][1]);
  pr(`   INFO natural ground on the new piece: ${f1(h0)} m at the arm -> ${f1(h1)} m at the join, ${f0(arc)} m long, mean grade ${f1(100 * Math.abs(h1 - h0) / Math.max(1, arc))} % (R4 limit ${f1(100 * GRADE_LIMIT4)} %; the arm has its own pad level, the road level is solved again in 21.4 / 21.4c)`);
}

pr('STEP 21.6a-1  21.3 CLEANUP (headless; rewrites docs/centre_fixed.json only; nothing in src changed)');
pr(`class R4 design speed V${VDES4}, smallest radius ${f0(RREQ)} m (x ${RMARGIN} margin)`);
pr('');
pr('1. R4-9 START ON J1-N (it stood on the deck; decision: 55 m along J1-N, road level 44.50 m will be pinned in 21.4c)');
moveEnd('R4-9', 'J1-N', R4_START_NEW, 'start');
pr('');
pr('2. R4-13 END ON J1-E (decision: 134 m further out along J1-E)');
moveEnd('R4-13', 'J1-E', R4_END_NEW, 'end');
pr('');
// ---------- N004 options (print only) ----------
pr('3. N004 (R6-12 x R4-9, level gap 42.7 m): NOT CHANGED, the user chooses. R6-12 now 268 m long, ground 29 -> 77 m (18 %), R6 limit 4 % (R11).');
{
  const r4 = byId.get('R4-9').pts as V2[]; const G = N004_GRID, X0 = -1700, X1 = 1100, Z0 = -2700, Z1 = -1100, nx = Math.round((X1 - X0) / G) + 1, nz = Math.round((Z1 - Z0) / G) + 1;
  const H = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = nat(X0 + i * G, Z0 + j * G);
  const ix = (x: number, z: number): { i: number; j: number } => ({ i: Math.round((x - X0) / G), j: Math.round((z - Z0) / G) });
  const mv: number[][] = []; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if ((a || b) && hyp(a, b) <= 3.2) mv.push([a, b, hyp(a, b) * G]);
  const s0 = ix(N004_START[0], N004_START[1]); const stI = s0.j * nx + s0.i;
  pr(`   ground-following route search: 20 m grid, no cut / fill, grade of every step <= limit; start R6-6A (${N004_START[0]}, ${N004_START[1]}) ground ${f1(H[stI])} m`);
  for (const LIM of N004_LIM) {
    const dist = new Float64Array(nx * nz).fill(1e18), prev = new Int32Array(nx * nz).fill(-1); dist[stI] = 0; const pq: number[][] = [[0, stI]];
    while (pq.length) { pq.sort((a, b) => b[0] - a[0]); const [dd, u] = pq.pop()!; if (dd > dist[u]) continue; const ui = u % nx, uj = (u / nx) | 0;
      for (const [a, b, l] of mv) { const vi = ui + a, vj = uj + b; if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue; const v = vj * nx + vi; if (Math.abs(H[v] - H[u]) / l > LIM) continue; const nd = dd + l; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push([nd, v]); } } }
    pr(`   grade limit ${f1(100 * LIM)} %:`);
    let acc = 0; const wanted = [0, 100, 150, 300, 1199, 1249]; cand[LIM] = [];
    for (let k = 0; k < r4.length; k++) { if (k > 0) acc += hyp(r4[k][0] - r4[k - 1][0], r4[k][1] - r4[k - 1][1]); const w = wanted.find((v) => acc >= v && acc < v + 10); if (w === undefined) continue; wanted.splice(wanted.indexOf(w), 1);
      const { i, j } = ix(r4[k][0], r4[k][1]); let best = 1e18, bu = -1; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const u = (j + b) * nx + i + a; if (u >= 0 && u < nx * nz && dist[u] < best) { best = dist[u]; bu = u; } }
      if (best > 1e17) { pr(`     node on R4-9 s ${f0(acc)} (${f0(r4[k][0])}, ${f0(r4[k][1])}): not reachable`); continue; }
      const path: V2[] = []; for (let u = bu; u >= 0; u = prev[u]) path.push([X0 + (u % nx) * G, Z0 + ((u / nx) | 0) * G]); path.reverse();
      const straight = hyp(r4[k][0] - N004_START[0], r4[k][1] - N004_START[1]); const x = crossings(path, 'R6-12').filter((id) => id !== 'R4-9');
      cand[LIM].push({ s: acc, p: [r4[k][0], r4[k][1]], g: nat(r4[k][0], r4[k][1]), len: best, ratio: best / straight, ok: x.length === 0 });
      pr(`     node on R4-9 s ${f0(acc)} (${f0(r4[k][0])}, ${f0(r4[k][1])}) R4-9 ground ${f1(nat(r4[k][0], r4[k][1]))} m: route ${f0(best)} m (straight ${f0(straight)} m, ratio ${f1(best / straight)}), crossings with other lines: ${x.length ? x.join(' ') : 'none'}`); }
  }
  pr('   OPTIONS for N004 (the user decides; my reading):');
  { const c = (cand[0.04] ?? []).filter((q) => q.s >= 90 && q.ok).sort((p, q) => p.ratio - q.ratio)[0];
    pr(c ? `   A  MOVE THE NODE along R4-9 to s ${f0(c.s)} (${f0(c.p[0])}, ${f0(c.p[1])}, R4-9 ground ${f1(c.g)} m): R6-12 about ${f0(c.len)} m at 4 %, ratio ${f1(c.ratio)}, no cut / fill, no crossing. R4-9 keeps its line; the old node N004 becomes a plain point of R4-9. The new node is only ${f0(c.s)} m from the J1-N join (R4-9 start): node spacing >= 60 m holds, take s >= 150 if you want more room.` : '   A  no node near the start of R4-9 is reachable at 4 %'); }
  pr('   B  MOVE THE NODE a little along R4-9 to s ~ 1199 (x -244, z -2109, ground 74 m): R6-12 1.06 km but ratio 3.9 (winding, against R3), still 74 m high: not recommended.');
  pr('   C  KEEP N004, LONGER ROUTE: needs 1.4 - 1.6 km at 4 % on the hill (ratio 5 - 6): hair-pin shapes, against R3 smoothness: not recommended.');
  pr('   D  KEEP N004 and the 268 m line at 18 %: breaks R11 (R6 <= 4 %): not possible; or a 50 m cut: not possible.');
}
pr('');
if (fail === 0) writeFileSync(`${OUT}/centre_fixed.json`, JSON.stringify(F));
else pr('FAIL: docs/centre_fixed.json NOT written');
pr('');
pr('Because centre_fixed.json changed, centre_profile.json / centre_vprofile.json / centre_sections.json are OLD for R4-9 and R4-13: run centre-profile.ts, centre-vprofile.ts, centre-section.ts again (next step, together with the 21.6 rail / node decisions).');
pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/STEP_21_6_CLEAN_OUTPUT.txt`, L.join('\n') + '\n');
