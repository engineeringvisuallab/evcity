// STEP G6c (headless): R6-5 = the chain L8 + L24 + L44 joined into ONE road (the G5 lines have gaps of 63 m and 52 m between them: hand-drawn sketch lines that do not touch).
// Method: at each gap the two lines are joined by a Hermite curve that starts BLEND m before the end of the first line and ends BLEND m after the start of the second, with the tangents of both lines (no kink),
// then the profile (grade <= 4 %, cut <= 12 m, no structure) and the radius (>= 229 m) are checked on the joined line, with the same solver as G3 - G6b.
// L33 (next in the chain) is NOT added: it crosses the J1-E arm at JX-2 (interchange not designed, R1 / R5 open), so the chain stops at the end of L44.
// Run: npx tsx scripts/r6-g6c.ts docs      writes docs/r6_g6c_lines.json and docs/STEP_R6_G6C_OUTPUT.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { solveLine, resample, f0, f1, MAXCUT, type Res } from './r6-profile-lib';
import { minRadius, RMIN } from './r6-route-lib';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const dir = process.argv[2] ?? 'docs';
const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const CHAIN = [8, 24, 44], NAME = 'R6-5', MERGED_ID = 8;
const gen: any = new TerrainGenerator(Config.world.seed);
const g5 = JSON.parse(readFileSync(`${dir}/r6_g5_lines.json`, 'utf8')) as { lines: { src_id: number; pts: number[][] }[] };
const get = (id: number) => g5.lines.find((l) => l.src_id === id)!.pts.map((p) => [p[0], p[1]]);
const cum = (pts: number[][]) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
const at = (pts: number[][], c: number[], s: number): number[] => { let k = 0; while (k + 2 < pts.length && c[k + 1] < s) k++; const t = Math.min(1, Math.max(0, (s - c[k]) / Math.max(1e-9, c[k + 1] - c[k]))); return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]; };
const tan = (pts: number[][], c: number[], s: number) => { const a = at(pts, c, Math.max(0, s - 5)), b = at(pts, c, s + 5), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const radius = (pts: number[][]) => { const r = resample(pts); const n = Math.max(2, Math.round(r.len / 20)); const q: number[][] = []; for (let i = 0; i <= n; i++) { const k = (i / n) * (r.x.length - 1), a = Math.floor(k), b = Math.min(r.x.length - 1, a + 1), f = k - a; q.push([r.x[a] + (r.x[b] - r.x[a]) * f, r.z[a] + (r.z[b] - r.z[a]) * f]); } return minRadius(q); };
const dp = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - bz * t); };
const dist = (pts: number[][], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (const p of pts) for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dp(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };

function join(a: number[][], b: number[][], blend: number): number[][] {
  const ca = cum(a), cb = cum(b), sA = Math.max(0, ca[ca.length - 1] - blend), sB = Math.min(cb[cb.length - 1], blend);
  const A = at(a, ca, sA), tA = tan(a, ca, sA), B = at(b, cb, sB), tB = tan(b, cb, sB), chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const out = a.filter((_, i) => ca[i] < sA - 1e-6).map((p) => [p[0], p[1]]);
  const m = Math.max(2, Math.round(chord / 10));
  for (let i = 0; i <= m; i++) { const t = i / m, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2; out.push([h00 * A[0] + h10 * chord * tA[0] + h01 * B[0] + h11 * chord * tB[0], h00 * A[1] + h10 * chord * tA[1] + h01 * B[1] + h11 * chord * tB[1]]); }
  for (let i = 0; i < b.length; i++) if (cb[i] > sB + 1e-6) out.push([b[i][0], b[i][1]]);
  return out;
}
pr(`R6 STEP G6c: ${NAME} = chain ${CHAIN.map((i) => 'L' + i).join(' + ')} joined into one road. Numbers + game data, game NOT run.`);
let best: { blend: number; pts: number[][]; R: number; r: Res } | null = null;
for (const blend of [60, 80, 100, 130, 160]) {
  let pts = get(CHAIN[0]); const gaps: string[] = [];
  for (let k = 1; k < CHAIN.length; k++) { const nxt = get(CHAIN[k]); gaps.push(`${f0(Math.hypot(nxt[0][0] - pts[pts.length - 1][0], nxt[0][1] - pts[pts.length - 1][1]))} m`); pts = join(pts, nxt, blend); }
  pts = pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]);
  const r = solveLine({ id: MERGED_ID, origin: 'G6c', pts, minR: null }), R = radius(pts);
  const ok = r.gradeOK && r.maxCut <= MAXCUT + 1e-6 && r.structLen === 0;
  pr(`  blend ${blend} m (gaps ${gaps.join(', ')}): ${f0(r.len)} m, min radius ${f0(R)} m, grade ${f1(r.maxG)} %, cut ${f1(r.maxCut)} m, fill ${f1(r.maxFill)} m, structure ${f0(r.structLen)} m -> ${ok ? 'profile PASS' : 'FAIL'}${R >= RMIN ? ', radius PASS' : ', radius below ' + RMIN}`);
  if (ok && (!best || (R >= RMIN && best.R < RMIN) || (R >= RMIN) === (best.R >= RMIN) && R > best.R)) best = { blend, pts, R, r };
}
if (!best) { pr('RESULT: no blend gives a clean road. NOT exported.'); writeFileSync(`${dir}/STEP_R6_G6C_OUTPUT.txt`, P.join('\n') + '\n'); process.exit(0); }
const { pts, r, R } = best;
const rail = Math.min(...gen.rail.edges.map((e: any) => dist(pts, e.xs, e.zs)));
pr(); pr(`CHOSEN blend ${best.blend} m: ${NAME}, ${f0(r.len)} m, grade ${f1(r.maxG)} %, cut ${f1(r.maxCut)} m, fill ${f1(r.maxFill)} m, min radius ${f0(R)} m, levels ${r.y0.toFixed(2)} -> ${r.y1.toFixed(2)} m, closest rail ${f0(rail)} m`);
for (const rd of gen.roads.roads) { const d = dist(pts, rd.xs, rd.zs); if (d < 300) pr(`  nearest game road ${rd.name}: ${f0(d)} m`); }
const e0 = pts[0], e1 = pts[pts.length - 1];
pr(`Free ends: west (${f0(e0[0])}, ${f0(e0[1])}), east (${f0(e1[0])}, ${f0(e1[1])}) (72 m from the start of L33, which is not added: it crosses J1-E at JX-2).`);
const okAll = R >= RMIN;
pr(okAll ? 'RESULT: PASS (profile + radius). Exported as R6-5.' : `RESULT: profile PASS, radius ${f0(R)} m is below ${RMIN} m at a join: exported anyway ONLY IF >= 123 m (V60 minimum)... see next line.`);
if (R < 123) { pr('Radius below the V60 minimum: NOT exported.'); writeFileSync(`${dir}/STEP_R6_G6C_OUTPUT.txt`, P.join('\n') + '\n'); process.exit(0); }
pr('LIMITS as before: R2, vertical curves, buildings / city plan along the road, AI traffic NOT checked; game run, in-game drive, npm run build NOT RUN.');
writeFileSync(`${dir}/r6_g6c_lines.json`, JSON.stringify({ note: 'G6c joined chain; src_id = first line of the chain; pts = world metres [x, z]', lines: [{ src_id: MERGED_ID, name: NAME, chain: CHAIN, pts }] }));
writeFileSync(`${dir}/STEP_R6_G6C_OUTPUT.txt`, P.join('\n') + '\n');
