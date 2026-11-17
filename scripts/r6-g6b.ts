// STEP G6b (headless): R6-3 (= L3) and R6-4 (= L25) next to R6-2 (= L65). The three lines meet at ONE node N = the west end of R6-2: L3 + R6-2 are one through road, L25 leaves it to the north (T).
// What this script does: (1) L3 ends AT N with the tangent of R6-2 (Hermite blend of its last 100 m, no kink), (2) L25 starts AT N, (3) both ends away from N are trimmed until they keep >= 90 m from the ring and >= 60 m from the railway
// (L25 would run into rail south-2 and the ring: that crossing / JX-8 is a LATER step), (4) the profile is solved with the level at N FIXED = the level of R6-2 (31.65 m), (5) every check again (grade, cut, radius, rail, game roads).
// Run: npx tsx scripts/r6-g6b.ts docs      writes docs/r6_g6b_lines.json (lines with fixY0 / fixY1) and docs/STEP_R6_G6B_OUTPUT.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { solveLine, resample, f0, f1, MAXCUT, type Src, type Res } from './r6-profile-lib';
import { minRadius, RMIN } from './r6-route-lib';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const dir = process.argv[2] ?? 'docs';
const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const RING_MIN = 90, RAIL_MIN = 60, BLEND = 100;
const g5 = JSON.parse(readFileSync(`${dir}/r6_g5_lines.json`, 'utf8')) as { lines: { src_id: number; pts: number[][] }[] };
const get = (id: number) => g5.lines.find((l) => l.src_id === id)!.pts;
const gen: any = new TerrainGenerator(Config.world.seed);
const dp = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - bz * t); };
const dist = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dp(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const dRing = (p: number[]) => dist(p, gen.roads.roads[0].xs, gen.roads.roads[0].zs);
const dRail = (p: number[]) => Math.min(...gen.rail.edges.map((e: any) => dist(p, e.xs, e.zs)));
const radius = (pts: number[][]) => { const r = resample(pts); const n = Math.max(2, Math.round(r.len / 20)); const q: number[][] = []; for (let i = 0; i <= n; i++) { const k = (i / n) * (r.x.length - 1), a = Math.floor(k), b = Math.min(r.x.length - 1, a + 1), f = k - a; q.push([r.x[a] + (r.x[b] - r.x[a]) * f, r.z[a] + (r.z[b] - r.z[a]) * f]); } return minRadius(q); };
const cum = (pts: number[][]) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
const at = (pts: number[][], c: number[], s: number): number[] => { let k = 0; while (k + 2 < pts.length && c[k + 1] < s) k++; const t = (s - c[k]) / Math.max(1e-9, c[k + 1] - c[k]); return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]; };
const tan = (pts: number[][], c: number[], s: number) => { const a = at(pts, c, Math.max(0, s - 5)), b = at(pts, c, s + 5), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

// ---- the node N = west end of R6-2 (L65) and its level
const L65 = get(65), r65 = solveLine({ id: 65, origin: 'G5', pts: L65, minR: null });
const N = L65[0], yN = r65.y[0], c65 = cum(L65), t65 = tan(L65, c65, 0);
pr(`R6 STEP G6b: R6-3 (L3) and R6-4 (L25). Node N = west end of R6-2 = (${f0(N[0])}, ${f0(N[1])}), level ${yN.toFixed(2)} m, R6-2 leaves N towards (${t65[0].toFixed(2)}, ${t65[1].toFixed(2)}). Numbers + game data, game NOT run.`);

// ---- L3: blend the last BLEND m into N with the tangent of R6-2 (no kink), trim the west end
let L3 = get(3); { const c = cum(L3), Ls = c[c.length - 1], sA = Ls - BLEND, A = at(L3, c, sA), tA = tan(L3, c, sA), chord = Math.hypot(N[0] - A[0], N[1] - A[1]);
  const pts: number[][] = L3.filter((_, i) => c[i] < sA - 1e-6);
  const m = Math.max(2, Math.round(chord / 10)); for (let i = 0; i <= m; i++) { const t = i / m, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2; pts.push([h00 * A[0] + h10 * chord * tA[0] + h01 * N[0] + h11 * chord * t65[0], h00 * A[1] + h10 * chord * tA[1] + h01 * N[1] + h11 * chord * t65[1]]); }
  pts[pts.length - 1] = [N[0], N[1]]; L3 = pts; }
// ---- L25: start at N, then the old line from its first point
const L25full = [[N[0], N[1]], ...get(25)];

const trimWhile = (pts: number[][], fromStart: boolean, fromEnd: boolean): number[][] => { // drop points of the free end until ring >= RING_MIN and rail >= RAIL_MIN
  let p = pts.map((q) => [q[0], q[1]]);
  const bad = (q: number[]) => dRing(q) < RING_MIN || dRail(q) < RAIL_MIN;
  const r = resample(p); let q = r.x.map((x, i) => [x, r.z[i]]);
  if (fromStart) while (q.length > 8 && bad(q[0])) q.shift();
  if (fromEnd) { let k = q.length; // walk from the node end until the first bad point, cut there
    for (let i = 0; i < q.length; i++) if (bad(q[i])) { k = i; break; } q = q.slice(0, k); }
  return q.map((v) => [+v[0].toFixed(1), +v[1].toFixed(1)]);
};
const L3t = trimWhile(L3, true, false);
const L25t = trimWhile(L25full, false, true);
const len = (pts: number[][]) => cum(pts)[pts.length - 1];
pr(`L3: ${f0(len(get(3)))} m (G5) -> ${f0(len(L3t))} m (blend into N, west end trimmed to ring >= ${RING_MIN} m / rail >= ${RAIL_MIN} m). L25: ${f0(len(get(25)))} m (G5) -> ${f0(len(L25t))} m (starts at N, north end trimmed to ring >= ${RING_MIN} m / rail >= ${RAIL_MIN} m).`);

type Out = { name: string; id: number; pts: number[][]; fixY0?: number; fixY1?: number };
const outs: Out[] = [{ name: 'R6-3', id: 3, pts: L3t, fixY1: yN }, { name: 'R6-4', id: 25, pts: L25t, fixY0: yN }];
const SHORT_BRIDGE = 120; let allOk = true;
pr(); pr('CHECKS (same solver and rules as G3 - G5; the level at N is FIXED for L3 end and L25 start)');
for (const o of outs) {
  const src: Src = { id: o.id, origin: 'G6b', pts: o.pts, minR: null, fixY0: o.fixY0, fixY1: o.fixY1 };
  const r: Res = solveLine(src); const R = radius(o.pts);
  const ok = r.gradeOK && r.maxCut <= MAXCUT + 1e-6 && r.structLen === 0 && R >= RMIN; allOk = allOk && ok;
  const dR = Math.min(...o.pts.map(dRail)), dG = Math.min(...o.pts.map(dRing));
  pr(`  ${o.name} (L${o.id}): ${f0(r.len)} m, grade ${f1(r.maxG)} % (limit 4), cut ${f1(r.maxCut)} m, fill ${f1(r.maxFill)} m, wet ${f0(r.wetLen)} m, high fill ${f0(r.highFillLen)} m, min radius ${f0(R)} m (V80 ${RMIN}), levels ${r.y0.toFixed(2)} -> ${r.y1.toFixed(2)} m, closest rail ${f0(dR)} m, closest ring ${f0(dG)} m -> ${ok ? 'PASS' : 'FAIL'}${r.reasons.length ? ' (' + r.reasons.join('; ') + ')' : ''}`);
  if (SHORT_BRIDGE < 0) pr('');
}
// joint check at N: directions and levels
{ const e3 = L3t.slice(-2), a3 = [e3[1][0] - e3[0][0], e3[1][1] - e3[0][1]], t3 = Math.atan2(a3[1], a3[0]) * 180 / Math.PI, tr = Math.atan2(t65[1], t65[0]) * 180 / Math.PI;
  const d25 = [L25t[1][0] - L25t[0][0], L25t[1][1] - L25t[0][1]], t25 = Math.atan2(d25[1], d25[0]) * 180 / Math.PI;
  pr(`  JOINT at N: R6-3 arrives with heading ${f1(t3)} deg, R6-2 leaves with ${f1(tr)} deg (kink ${f1(Math.abs(t3 - tr))} deg); R6-4 leaves with ${f1(t25)} deg (angle to the through road ${f1(Math.abs(((t25 - tr + 540) % 360) - 180))} deg). Levels at N: R6-2 ${yN.toFixed(2)}, R6-3 end ${yN.toFixed(2)}, R6-4 start ${yN.toFixed(2)} (fixed in the solver).`); }
// game roads (ring, arms, island link) crossing / near the new lines
for (const o of outs) for (const rd of gen.roads.roads) { const d = Math.min(...o.pts.map((p: number[]) => dist(p, rd.xs, rd.zs))); if (d < 150) pr(`  ${o.name}: nearest to game road ${rd.name} = ${f0(d)} m`); }
pr(); pr(allOk ? 'RESULT: R6-3 and R6-4 PASS (grade, cut, no structure, radius). Free ends: R6-3 west end, R6-4 north end. The node N is a T of three 6-lane roads with NO pad / markings yet (junction step).' : 'RESULT: a FAIL above: NOT exported.');
pr('NOT DONE (honest): R6-4 stops short of the ring: the G5 line runs into rail south-2 near (463, 1929) (9 m) and ends at JX-8 on the ring; that rail crossing + the ring interchange JX-8 are a later step. R6-3 stops short of the ring at its west end (the G5 line ended 27 m from the ring pavement).');
pr('LIMITS as before: R2, vertical curves, buildings / city plan along the lines NOT checked; game run, in-game drive, npm run build NOT RUN.');
if (allOk) writeFileSync(`${dir}/r6_g6b_lines.json`, JSON.stringify({ note: 'G6b lines with fixed level at the node N; pts = world metres [x, z]', lines: outs.map((o) => ({ src_id: o.id, name: o.name, fixY0: o.fixY0, fixY1: o.fixY1, pts: o.pts })) }));
writeFileSync(`${dir}/STEP_R6_G6B_OUTPUT.txt`, P.join('\n') + '\n');
