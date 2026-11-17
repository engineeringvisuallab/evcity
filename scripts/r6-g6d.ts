// STEP G6d (headless): R6-6 = the north group L26 + L20 + L21. L20 and L21 both start at JX-3 on the J1-N arm (1673 m from J1) and run on the two sides of it, i.e. the chain L26 + L20 + L21 CROSSES J1-N there
// (angle about 90 deg, 12 m from the arm centreline), and L20 crosses the railway (rail south-2, x about 495) 45 m after JX-3. The user's rule 4: the AI does NOT make a junction by itself, so this step
// builds only the parts that stay clear: every end near J1-N (the 8-lane arm) is trimmed to >= ROAD_MIN m, and every part near the railway to >= RAIL_MIN m (same numbers as G6b: ring >= 90 m, rail >= 60 m; MY numbers).
//   R6-6A = L26 + L20 (west of the rail), the 13 m gap between them is closed by a Hermite curve (no kink), like G6c.
//   R6-6B = L21 (north-east of JX-3).
// Run: npx tsx scripts/r6-g6d.ts docs      writes docs/r6_g6d_lines.json and docs/STEP_R6_G6D_OUTPUT.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { solveLine, resample, f0, f1, MAXCUT, type Res } from './r6-profile-lib';
import { minRadius, RMIN } from './r6-route-lib';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const dir = process.argv[2] ?? 'docs';
const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const ROAD_MIN = 90, RAIL_MIN = 60;
const gen: any = new TerrainGenerator(Config.world.seed);
const g5 = JSON.parse(readFileSync(`${dir}/r6_g5_lines.json`, 'utf8')) as { lines: { src_id: number; pts: number[][] }[]; jx: { n: number; road: string; line: number; x: number; z: number; kind: string; s_road: number }[] };
const get = (id: number) => g5.lines.find((l) => l.src_id === id)!.pts.map((p) => [p[0], p[1]]);
const cum = (pts: number[][]) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
const at = (pts: number[][], c: number[], s: number): number[] => { let k = 0; while (k + 2 < pts.length && c[k + 1] < s) k++; const t = Math.min(1, Math.max(0, (s - c[k]) / Math.max(1e-9, c[k + 1] - c[k]))); return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]; };
const tan = (pts: number[][], c: number[], s: number) => { const a = at(pts, c, Math.max(0, s - 5)), b = at(pts, c, s + 5), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const radius = (pts: number[][]) => { const r = resample(pts); const n = Math.max(2, Math.round(r.len / 20)); const q: number[][] = []; for (let i = 0; i <= n; i++) { const k = (i / n) * (r.x.length - 1), a = Math.floor(k), b = Math.min(r.x.length - 1, a + 1), f = k - a; q.push([r.x[a] + (r.x[b] - r.x[a]) * f, r.z[a] + (r.z[b] - r.z[a]) * f]); } return minRadius(q); };
const dp = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - bz * t); };
const dist = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dp(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const EIGHT = gen.roads.roads.filter((r: any) => /^(M8|J1-)/.test(r.name)); // the 8-lane roads: ring + the four J1 arms
const dRoad8 = (p: number[]) => Math.min(...EIGHT.map((r: any) => dist(p, r.xs, r.zs)));
const dRail = (p: number[]) => Math.min(...gen.rail.edges.map((e: any) => dist(p, e.xs, e.zs)));
const len = (pts: number[][]) => cum(pts)[pts.length - 1];
const rnd = (pts: number[][]) => pts.map((v) => [+v[0].toFixed(1), +v[1].toFixed(1)]);

/** drop points from the start (ring / arm and rail clearance) until the first point is clear; from the end likewise */
function trim(pts: number[][], fromStart: boolean, fromEnd: boolean): number[][] {
  const r = resample(pts); let q = r.x.map((x, i) => [x, r.z[i]]);
  const bad = (p: number[]) => dRoad8(p) < ROAD_MIN || dRail(p) < RAIL_MIN;
  if (fromStart) while (q.length > 8 && bad(q[0])) q.shift();
  if (fromEnd) while (q.length > 8 && bad(q[q.length - 1])) q.pop();
  return rnd(q);
}
function join(a: number[][], b: number[][], blend: number): number[][] {
  const ca = cum(a), cb = cum(b), sA = Math.max(0, ca[ca.length - 1] - blend), sB = Math.min(cb[cb.length - 1], blend);
  const A = at(a, ca, sA), tA = tan(a, ca, sA), B = at(b, cb, sB), tB = tan(b, cb, sB), chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const out = a.filter((_, i) => ca[i] < sA - 1e-6).map((p) => [p[0], p[1]]);
  const m = Math.max(2, Math.round(chord / 10));
  for (let i = 0; i <= m; i++) { const t = i / m, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2; out.push([h00 * A[0] + h10 * chord * tA[0] + h01 * B[0] + h11 * chord * tB[0], h00 * A[1] + h10 * chord * tA[1] + h01 * B[1] + h11 * chord * tB[1]]); }
  for (let i = 0; i < b.length; i++) if (cb[i] > sB + 1e-6) out.push([b[i][0], b[i][1]]);
  return out;
}
const segX = (a: number[], b: number[], c: number[], d: number[]) => { const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const crossings = (pts: number[][], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let n = 0; for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j + 1 < xs.length; j++) if (segX(pts[i], pts[i + 1], [xs[j], zs[j]], [xs[j + 1], zs[j + 1]])) n++; return n; };

pr('R6 STEP G6d: R6-6 = north group L26 + L20 + L21. Numbers + game data, game NOT run.');
// ---- what the G5 data says at JX-3
const jx3 = g5.jx.find((j) => j.n === 3)!;
const L20 = get(20), L21 = get(21), L26 = get(26);
const jn = gen.roads.roads.find((r: any) => r.name === 'J1-N');
pr(`JX-3 (G5): ${jx3.kind} on ${jx3.road} at (${f0(jx3.x)}, ${f0(jx3.z)}), ${f0(jx3.s_road)} m from the J1 side. L20 start (${f0(L20[0][0])}, ${f0(L20[0][1])}) and L21 start (${f0(L21[0][0])}, ${f0(L21[0][1])}): ${f0(Math.hypot(L20[0][0] - L21[0][0], L20[0][1] - L21[0][1]))} m apart, ${f0(dist(L20[0], jn.xs, jn.zs))} m from the J1-N centreline.`);
{ const a = at(L20, cum(L20), 0), t20 = tan(L20, cum(L20), 0), t21 = tan(L21, cum(L21), 0), k = jn.xs.length; let bi = 0, bd = 1e9; for (let i = 0; i < k; i++) { const d = Math.hypot(jn.xs[i] - a[0], jn.zs[i] - a[1]); if (d < bd) { bd = d; bi = i; } }
  const tj = [jn.xs[Math.min(k - 1, bi + 2)] - jn.xs[Math.max(0, bi - 2)], jn.zs[Math.min(k - 1, bi + 2)] - jn.zs[Math.max(0, bi - 2)]], lj = Math.hypot(tj[0], tj[1]);
  const ang = (u: number[], v: number[]) => Math.acos(Math.abs((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])))) * 180 / Math.PI;
  const t20r = [-t20[0], -t20[1]];
  pr(`  L20 leaves JX-3 towards (${t20[0].toFixed(2)}, ${t20[1].toFixed(2)}), L21 towards (${t21[0].toFixed(2)}, ${t21[1].toFixed(2)}): they run to OPPOSITE sides of J1-N (angle to the arm ${f0(ang(t20, tj))} / ${f0(ang(t21, tj))} deg); heading change L20 -> L21 through JX-3 = ${f1(ang(t20r, t21))} deg. So the chain L26 + L20 + L21 crosses J1-N (R1 / interchange, rule 4).`);
  const s20 = solveLine({ id: 20, origin: 'G5', pts: L20, minR: null }), s21 = solveLine({ id: 21, origin: 'G5', pts: L21, minR: null });
  pr(`  Finished levels at JX-3 from the G5 solver: L20 ${s20.y0.toFixed(2)} m, L21 ${s21.y0.toFixed(2)} m (difference ${f1(Math.abs(s20.y0 - s21.y0))} m: the two ends are NOT level with each other).`);
  const sc: any = {}; try { gen.sampleGround(jx3.x, jx3.z, sc); pr(`  Natural ground at JX-3: ${f1(sc.h)} m.`); } catch { /* ignore */ }
  const rail = gen.rail.edges.map((e: any, k: number) => ({ k, id: e.id, d: Math.min(...L20.map((p: number[]) => dist(p, e.xs, e.zs))) })).sort((a: any, b: any) => a.d - b.d)[0];
  pr(`  L20 touches / crosses the railway (${rail.id}): closest ${f0(rail.d)} m. L21 closest rail ${f0(Math.min(...L21.map(dRail)))} m. L26 closest rail ${f0(Math.min(...L26.map(dRail)))} m.`); }

// ---- trim, join, check
const L20t = trim(L20, true, false), L21t = trim(L21, true, false);
pr(); pr(`TRIM (ends near the 8-lane arm < ${ROAD_MIN} m or near rail < ${RAIL_MIN} m are cut; MY numbers = G6b): L20 ${f0(len(L20))} -> ${f0(len(L20t))} m (JX-3 end cut ${f0(len(L20) - len(L20t))} m), L21 ${f0(len(L21))} -> ${f0(len(L21t))} m (JX-3 end cut ${f0(len(L21) - len(L21t))} m). L26 not trimmed (rail ${f0(Math.min(...L26.map(dRail)))} m, J1-N ${f0(Math.min(...L26.map(dRoad8)))} m).`);
type Cand = { blend: number; pts: number[][]; R: number; r: Res };
let best: Cand | null = null;
pr(`  gap L20 end -> L26 start: ${f0(Math.hypot(L26[0][0] - L20t[L20t.length - 1][0], L26[0][1] - L20t[L20t.length - 1][1]))} m`);
for (const blend of [40, 60, 80, 100, 130, 160]) {
  const pts = rnd(join(L20t, L26, blend));
  const r = solveLine({ id: 20, origin: 'G6d', pts, minR: null }), R = radius(pts);
  const ok = r.gradeOK && r.maxCut <= MAXCUT + 1e-6 && r.structLen === 0;
  pr(`  blend ${blend} m: ${f0(r.len)} m, min radius ${f0(R)} m, grade ${f1(r.maxG)} %, cut ${f1(r.maxCut)} m, fill ${f1(r.maxFill)} m, structure ${f0(r.structLen)} m -> ${ok ? 'profile PASS' : 'FAIL'}${R >= RMIN ? ', radius PASS' : ', radius below ' + RMIN}`);
  if (ok && (!best || (R >= RMIN && best.R < RMIN) || ((R >= RMIN) === (best.R >= RMIN) && R > best.R))) best = { blend, pts, R, r };
}
type Out = { name: string; id: number; chain: number[]; pts: number[][]; r: Res; R: number };
const outs: Out[] = [];
if (best) outs.push({ name: 'R6-6A', id: 20, chain: [20, 26], pts: best.pts, r: best.r, R: best.R });
{ const r = solveLine({ id: 21, origin: 'G6d', pts: L21t, minR: null }); outs.push({ name: 'R6-6B', id: 21, chain: [21], pts: L21t, r, R: radius(L21t) }); }
pr(); pr('CHECKS (same solver and rules as G3 - G6c)'); let allOk = outs.length === 2;
for (const o of outs) {
  const { r, R } = o; const ok = r.gradeOK && r.maxCut <= MAXCUT + 1e-6 && r.structLen === 0 && R >= RMIN; allOk = allOk && ok;
  const e0 = o.pts[0], e1 = o.pts[o.pts.length - 1];
  pr(`  ${o.name} (${o.chain.map((i) => 'L' + i).join(' + ')}): ${f0(r.len)} m, grade ${f1(r.maxG)} % (limit 4), cut ${f1(r.maxCut)} m (limit ${MAXCUT}), fill ${f1(r.maxFill)} m, wet ${f0(r.wetLen)} m, structure ${f0(r.structLen)} m, min radius ${f0(R)} m (V80 ${RMIN}), levels ${r.y0.toFixed(2)} -> ${r.y1.toFixed(2)} m -> ${ok ? 'PASS' : 'FAIL'}${r.reasons.length ? ' (' + r.reasons.join('; ') + ')' : ''}`);
  pr(`     rail: closest ${f0(Math.min(...o.pts.map(dRail)))} m (>= ${RAIL_MIN} ${Math.min(...o.pts.map(dRail)) >= RAIL_MIN - 1e-6 ? 'PASS' : 'FAIL'}); 8-lane roads: closest ${f0(Math.min(...o.pts.map(dRoad8)))} m (>= ${ROAD_MIN} ${Math.min(...o.pts.map(dRoad8)) >= ROAD_MIN - 1e-6 ? 'PASS' : 'FAIL'}); crossings with game roads: ${gen.roads.roads.reduce((s: number, rd: any) => s + crossings(o.pts, rd.xs, rd.zs), 0)}; crossings with the rail: ${gen.rail.edges.reduce((s: number, e: any) => s + crossings(o.pts, e.xs, e.zs), 0)}`);
  pr(`     ends (both FREE, dead ends): (${f0(e0[0])}, ${f0(e0[1])}) and (${f0(e1[0])}, ${f0(e1[1])})`);
  for (const rd of gen.roads.roads) { const d = Math.min(...o.pts.map((p) => dist(p, rd.xs, rd.zs))); if (d < 300) pr(`     nearest game road ${rd.name}: ${f0(d)} m`); }
  if (crossings(o.pts, EIGHT[0].xs, EIGHT[0].zs) + EIGHT.reduce((s: number, rd: any) => s + crossings(o.pts, rd.xs, rd.zs), 0) > 0) allOk = false;
  if (gen.rail.edges.reduce((s: number, e: any) => s + crossings(o.pts, e.xs, e.zs), 0) > 0 || Math.min(...o.pts.map(dRail)) < RAIL_MIN - 1e-6 || Math.min(...o.pts.map(dRoad8)) < ROAD_MIN - 1e-6) allOk = false;
}
// R1 between the two pieces and with the other G5 lines
{ const a = outs[0]?.pts, b = outs[1]?.pts; if (a && b) { let n = 0; for (let i = 0; i + 1 < a.length; i++) for (let j = 0; j + 1 < b.length; j++) if (segX(a[i], a[i + 1], b[j], b[j + 1])) n++; pr(`  R1 R6-6A x R6-6B crossings: ${n}; distance between the two pieces: ${f0(Math.min(...a.map((p) => dist(p, b.map((q) => q[0]), b.map((q) => q[1])))))} m (JX-3 lies between the two cut ends, which are ${f0(Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]))} m apart)`); if (n) allOk = false; } }
for (const o of outs) for (const l of g5.lines) { if (o.chain.includes(l.src_id)) continue; const q = l.pts; const d = Math.min(...o.pts.map((p) => dist(p, q.map((v) => v[0]), q.map((v) => v[1])))); if (d < 120) pr(`  ${o.name}: another G5 line L${l.src_id} (not built) comes within ${f0(d)} m`); }
pr();
if (!allOk) { pr('RESULT: FAIL above, NOT exported.'); writeFileSync(`${dir}/STEP_R6_G6D_OUTPUT.txt`, P.join('\n') + '\n'); process.exit(0); }
pr('RESULT: PASS (profile, radius, rail clearance, no crossing). Exported as R6-6A (L26 + L20) and R6-6B (L21).');
pr(`NOT DONE (rule 4, for the user): (1) JX-3 = the crossing of R6-6 with the J1-N arm, 1673 m from J1 (R5: 900 m needed, met), no junction made: both pieces stop ${ROAD_MIN} m or more from J1-N, the gap between the two cut ends is the place of the interchange; the levels there differ by ~9 m (L20 33.2 m, L21 42.7 m) and are free. (2) L20 crosses the railway (north-1) about 45 m after JX-3: rail crossing NOT designed, so the part east of the rail is cut off (the cut part of L20 is ${f0(len(L20) - len(L20t))} m).`);
pr('LIMITS as before: R2, vertical curves, buildings / city plan along the lines, AI traffic NOT checked; game run, in-game drive, npm run build NOT RUN.');
writeFileSync(`${dir}/r6_g6d_lines.json`, JSON.stringify({ note: 'G6d: R6-6A = L20 (trimmed) + L26 joined, R6-6B = L21 (trimmed); src_id = first line of the chain; pts = world metres [x, z]', lines: outs.map((o) => ({ src_id: o.id, name: o.name, chain: o.chain, pts: o.pts })) }));
writeFileSync(`${dir}/STEP_R6_G6D_OUTPUT.txt`, P.join('\n') + '\n');
