// STEP R6-7-JOIN (headless, READ ONLY): join the built 6-lane R6-7 (north-west, U shape) to the 8-lane network at an EXISTING tap.
// Run: npx tsx scripts/r6-7-join.ts [dir]   (default docs)   writes dir/STEP_R6_7_JOIN_OUTPUT.txt and dir/r6_7_join.json
// 1. distances of both R6-7 ends to the 8-lane roads and to every existing tap
// 2. candidate joins: straight - spiral - arc - spiral - straight (R3), from an R6-7 end, keeping the end tangent, to the M8 point of an existing tap
// 3. checks per candidate: water (sc.water > sc.h) FIRST, rail, buildings, ground class, grade <= 4 % (R11), R1 crossings, R3 radius, node gap >= 60 m
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

type P = { x: number; z: number };
const OUT = process.argv[2] ?? 'docs';
const MAP = JSON.parse(readFileSync('docs/map_all_roads_v2.json', 'utf8'));
const A3 = JSON.parse(readFileSync('docs/a3_demand_x2.json', 'utf8'));
const A1 = JSON.parse(readFileSync('docs/a1_buildability.json', 'utf8'));
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const hyp = Math.hypot;
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);

const NODE: Record<string, { x: number; z: number }> = {}; for (const n of A3.nodes) NODE[n.id] = n;
const TAPS = ['T7299', 'T8919', 'T13738', 'T18838', 'T-N880', 'T-E610', 'T-W960', 'R1205', 'R4265', 'R12094', 'R16813'];
const built = (n: string): number[][] => MAP.built.find((b: any) => b.name === n).pts;
const R67 = built('R6-7');
const EIGHT: { name: string; pts: number[][] }[] = MAP.built.filter((b: any) => b.lanes === 8);

function projPoly(pts: number[][], x: number, z: number): { d: number; p: P; i: number } {
  let best = { d: 1e18, p: { x: 0, z: 0 }, i: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)); const px = ax + bx * t, pz = az + bz * t, d = hyp(x - px, z - pz);
    if (d < best.d) best = { d, p: { x: px, z: pz }, i };
  }
  return best;
}
function segInt(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: a.x + rx * t, z: a.z + rz * t };
}

pr('STEP R6-7-JOIN (headless, read only, nothing in src or data changed)');
// ---------- 0. WATER CHECK FIRST ----------
{
  let n = 0, wet = 0;
  for (let i = 0; i + 1 < R67.length; i++) { const a = R67[i], b = R67[i + 1], k = Math.max(1, Math.ceil(hyp(b[0] - a[0], b[1] - a[1]) / 5)); for (let j = 0; j <= k; j++) { const x = a[0] + ((b[0] - a[0]) * j) / k, z = a[1] + ((b[1] - a[1]) * j) / k; gen.sample(x, z, sc); n++; if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++; } }
  pr(`WATER CHECK (sc.water > sc.h) on the built R6-7 itself: ${n} points, ${wet} wet  ${wet === 0 ? 'PASS' : 'FAIL (known bad ground)'}`);
}
// ---------- 1. distances ----------
let len67 = 0; for (let i = 0; i + 1 < R67.length; i++) len67 += hyp(R67[i + 1][0] - R67[i][0], R67[i + 1][1] - R67[i][1]);
pr(`R6-7: ${R67.length} pts, ${f0(len67)} m, ends S (${f0(R67[0][0])}, ${f0(R67[0][1])}) and N (${f0(R67[R67.length - 1][0])}, ${f0(R67[R67.length - 1][1])}); z negative = north, x negative = west, so this is the NORTH-WEST`);
pr('1. DISTANCES of each end (nearest point of every 8-lane road, and every existing tap):');
const ends: { nm: string; p: number[]; dir: number[] }[] = [
  { nm: 'S', p: R67[0], dir: [R67[0][0] - R67[3][0], R67[0][1] - R67[3][1]] },
  { nm: 'N', p: R67[R67.length - 1], dir: [R67[R67.length - 1][0] - R67[R67.length - 4][0], R67[R67.length - 1][1] - R67[R67.length - 4][1]] },
];
for (const e of ends) {
  pr(`  end ${e.nm} (${f0(e.p[0])}, ${f0(e.p[1])}):`);
  for (const r of EIGHT) { const q = projPoly(r.pts, e.p[0], e.p[1]); pr(`    8-lane ${r.name}: ${f0(q.d)} m  (nearest point ${f0(q.p.x)}, ${f0(q.p.z)})`); }
  for (const k of [...TAPS].sort((a, b) => hyp(e.p[0] - NODE[a].x, e.p[1] - NODE[a].z) - hyp(e.p[0] - NODE[b].x, e.p[1] - NODE[b].z)).slice(0, 3)) {
    const q = projPoly(EIGHT.find((r) => r.name === 'M8')!.pts, NODE[k].x, NODE[k].z);
    pr(`    existing tap ${k} (${f0(NODE[k].x)}, ${f0(NODE[k].z)}): straight ${f0(hyp(e.p[0] - NODE[k].x, e.p[1] - NODE[k].z))} m, tap is ${f0(q.d)} m from the M8 centreline`);
  }
}
pr('  R5 spacing: the tap is an EXISTING one, so no new tap and no 1600 m / 600 m question; J1 plaza is more than 2800 m away.');

// ---------- 2. candidates ----------
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const a1 = (x: number, z: number): string => { const i = Math.floor((x + A1.half) / A1.cell), j = Math.floor((z + A1.half) / A1.cell); return i < 0 || j < 0 || i >= A1.n || j >= A1.n ? '~' : A1.rows[j][i]; };
const OTHERS: { id: string; pts: number[][] }[] = [];
for (const b of MAP.built) if (!String(b.name).includes(':') && b.name !== 'R6-7') OTHERS.push({ id: b.name, pts: b.pts });
for (const r of MAP.roads) OTHERS.push({ id: r.id, pts: r.pts });
const JN: P[] = MAP.junctions.map((j: any) => ({ x: j.x, z: j.z }));

/** curvature profile: straight s1, spiral Ls, arc (angle th), spiral Ls; then straight to T. returns points every 5 m or null */
function build(start: number[], h0: number, s1: number, R: number, Ls: number, turn: number, th: number): { pts: number[][]; hEnd: number } {
  const pts: number[][] = [[start[0], start[1]]]; let x = start[0], z = start[1], h = h0; const ds = 5;
  const step = (k: number, len: number): void => { for (let s = 0; s < len; s += ds) { const d = Math.min(ds, len - s); h += k * turn * d; x += Math.cos(h) * d; z += Math.sin(h) * d; pts.push([x, z]); } };
  const spiral = (up: boolean): void => { const n = Math.round(Ls / ds); for (let i = 0; i < n; i++) { const kk = ((up ? i + 0.5 : n - i - 0.5) / n) / R; h += kk * turn * ds; x += Math.cos(h) * ds; z += Math.sin(h) * ds; pts.push([x, z]); } };
  step(0, s1); spiral(true);
  const spAng = Ls / (2 * R); const arcAng = th - 2 * spAng; if (arcAng < 0) return { pts, hEnd: NaN };
  step(1 / R, arcAng * R); spiral(false);
  return { pts, hEnd: h };
}
interface Cand { id: string; end: string; tap: string; R: number; s1: number; turn: number; len: number; pts: number[][]; wet: number; rail: number; bld: number; mask: string; maxGrade: number; minR: number; cross: string[]; nodeGap: number; angle: number; ok: boolean; why: string[] }
const cands: Cand[] = [];
const Y0 = 0;
void Y0;
function evaluate(c: Cand, tapName: string, endName: string): void {
  const pts = c.pts; const why: string[] = [];
  // dense 5 m samples
  let wet = 0, rail = 0, bld = 0; const mask: Record<string, number> = {};
  const hs: number[] = [];
  for (const q of pts) {
    gen.sample(q[0], q[1], sc); if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++;
    const k = a1(q[0], q[1]); mask[k] = (mask[k] ?? 0) + 1;
    for (const b of RECTS) { if (Math.abs(b.x - q[0]) > 90 || Math.abs(b.z - q[1]) > 90) continue; const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = q[0] - b.x, dz = q[1] - b.z; const lx = dx * co - dz * si, lz = dx * si + dz * co; if (hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)) < 18.45) bld++; }
    gen.sampleNatural(q[0], q[1], sc); hs.push(sc.h);
  }
  for (const e of gen.rail.edges) for (let k = 0; k < e.xs.length; k++) { if (hyp(e.xs[k] - pts[Math.floor(pts.length / 2)][0], e.zs[k] - pts[Math.floor(pts.length / 2)][1]) > 1500) continue; for (const q of pts) if (hyp(e.xs[k] - q[0], e.zs[k] - q[1]) < 25) { rail++; break; } }
  let mg = 0; for (let i = 0; i + 4 < hs.length; i++) mg = Math.max(mg, Math.abs(hs[i + 4] - hs[i]) / 20);
  let minR = 1e9; for (let i = 2; i + 2 < pts.length; i++) { const A = pts[i - 2], B = pts[i], C = pts[i + 2]; const cr = (B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]); const la = hyp(B[0] - A[0], B[1] - A[1]), lb = hyp(C[0] - B[0], C[1] - B[1]), lc = hyp(C[0] - A[0], C[1] - A[1]); const k = (2 * Math.abs(cr)) / Math.max(1e-9, la * lb * lc); if (k > 1e-9) minR = Math.min(minR, 1 / k); }
  const cross: string[] = [];
  for (const o of OTHERS) for (let i = 0; i + 1 < pts.length; i += 1) for (let j = 0; j + 1 < o.pts.length; j++) { const q = segInt({ x: pts[i][0], z: pts[i][1] }, { x: pts[i + 1][0], z: pts[i + 1][1] }, { x: o.pts[j][0], z: o.pts[j][1] }, { x: o.pts[j + 1][0], z: o.pts[j + 1][1] }); if (q && hyp(q.x - pts[pts.length - 1][0], q.z - pts[pts.length - 1][1]) > 30 && !cross.includes(o.id)) cross.push(`${o.id} at (${f0(q.x)}, ${f0(q.z)})`); }
  const endp = pts[pts.length - 1]; let nodeGap = 1e9; for (const j of JN) nodeGap = Math.min(nodeGap, hyp(j.x - endp[0], j.z - endp[1]));
  for (const k of TAPS) if (k !== tapName) nodeGap = Math.min(nodeGap, hyp(NODE[k].x - endp[0], NODE[k].z - endp[1]));
  const m8 = EIGHT.find((r) => r.name === 'M8')!.pts; const qq = projPoly(m8, endp[0], endp[1]);
  const th = Math.atan2(m8[qq.i + 1][1] - m8[qq.i][1], m8[qq.i + 1][0] - m8[qq.i][0]); const hh = Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 4][1], pts[pts.length - 1][0] - pts[pts.length - 4][0]);
  let ang = Math.abs(((hh - th) * 180) / Math.PI) % 180; if (ang > 90) ang = 180 - ang;
  c.wet = wet; c.rail = rail; c.bld = bld; c.mask = Object.entries(mask).map(([k, v]) => `${k}${v}`).join(' '); c.maxGrade = mg; c.minR = minR; c.cross = cross; c.nodeGap = nodeGap; c.angle = 90 - Math.abs(90 - ang) === ang ? ang : ang;
  if (wet) why.push(`wet ${wet} pts`); if (rail) why.push('rail'); if (bld) why.push(`building ${bld} pts`);
  const bad = Object.keys(mask).filter((k) => !'ABCD'.includes(k)); if (bad.length) why.push(`ground class ${bad.map((k) => k + mask[k]).join(',')}`);
  if (mg > 0.04 + 0.0005) why.push(`grade ${f1(mg * 100)} % > 4 %`);
  if (minR < 229 * 0.97) why.push(`R ${f0(minR)} < 229`);
  if (cross.length) why.push(`crosses ${cross.join('; ')}`);
  if (nodeGap < 60) why.push(`node ${f0(nodeGap)} m < 60`);
  c.why = why; c.ok = why.length === 0; void endName;
}

const m8 = EIGHT.find((r) => r.name === 'M8')!.pts;
const targets = ['T7299', 'T8919'];
for (const e of ends) for (const tn of targets) {
  const tp = projPoly(m8, NODE[tn].x, NODE[tn].z).p; const T = [tp.x, tp.z];
  const h0 = Math.atan2(e.dir[1], e.dir[0]);
  for (const R of [320, 450, 600, 900]) for (const s1 of [0, 60, 120, 200, 300, 400]) for (const turn of [1, -1]) {
    // scan arc angle for the exit heading that points to T
    let prevErr: number | null = null; let prevTh = 0;
    for (let th = (80 / R) + 0.01; th <= Math.PI * 1.2; th += 0.01) {
      const b = build(e.p, h0, s1, R, 80, turn, th); if (!Number.isFinite(b.hEnd)) continue;
      const q = b.pts[b.pts.length - 1]; const want = Math.atan2(T[1] - q[1], T[0] - q[0]); let err = b.hEnd - want; err = Math.atan2(Math.sin(err), Math.cos(err));
      if (prevErr !== null && Math.sign(err) !== Math.sign(prevErr) && Math.abs(err) < 0.5 && Math.abs(prevErr) < 0.5) {
        const thx = (prevTh + th) / 2; const b2 = build(e.p, h0, s1, R, 80, turn, thx); const q2 = b2.pts[b2.pts.length - 1];
        const dd = hyp(T[0] - q2[0], T[1] - q2[1]); const n = Math.max(1, Math.round(dd / 5)); const pts = b2.pts.map((p) => [p[0], p[1]]); for (let i = 1; i <= n; i++) pts.push([q2[0] + ((T[0] - q2[0]) * i) / n, q2[1] + ((T[1] - q2[1]) * i) / n]);
        let len = 0; for (let i = 0; i + 1 < pts.length; i++) len += hyp(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (len < 2500) cands.push({ id: `${e.nm}>${tn} R${R} s${s1} ${turn > 0 ? 'right' : 'left'}`, end: e.nm, tap: tn, R, s1, turn, len, pts, wet: 0, rail: 0, bld: 0, mask: '', maxGrade: 0, minR: 0, cross: [], nodeGap: 0, angle: 0, ok: false, why: [] });
      }
      prevErr = err; prevTh = th;
    }
  }
}
pr(); pr(`2. CANDIDATES (end tangent kept, straight - spiral Ls 80 - arc - spiral - straight to the M8 point of an EXISTING tap): ${cands.length} geometric candidates`);
for (const c of cands) evaluate(c, c.tap, c.end);
cands.sort((a, b) => (a.ok === b.ok ? a.len - b.len : a.ok ? -1 : 1));
const okc = cands.filter((c) => c.ok);
pr(`   passing every check: ${okc.length} of ${cands.length}`);
const show = (c: Cand): void => pr(`   ${c.id}: ${f0(c.len)} m, grade max ${f1(c.maxGrade * 100)} %, R min ${f0(c.minR)} m, wet ${c.wet}, rail ${c.rail}, bld ${c.bld}, ground [${c.mask}], node gap ${f0(c.nodeGap)} m, meets M8 at ${f0(c.angle)} deg, R1 ${c.cross.length ? 'FAIL ' + c.cross.join('; ') : 'PASS'}  ${c.ok ? 'PASS' : 'FAIL: ' + c.why.join(' | ')}`);
pr('   best passing (shortest first):'); for (const c of okc.slice(0, 4)) show(c);
if (!okc.length) { pr('   NO passing candidate. Closest (fewest problems) per end / tap:'); const seen = new Set<string>(); for (const c of [...cands].sort((a, b) => a.why.length - b.why.length || a.len - b.len)) { const k = c.end + c.tap; if (seen.has(k)) continue; seen.add(k); show(c); } }
pr(); pr('   ALL candidates N end -> T7299 (the shortest way, 670 m straight):'); for (const c of cands.filter((q) => q.end === 'N' && q.tap === 'T7299')) show(c);
{ const lo = { x: -2250, z: -3050 }, hi = { x: -1700, z: -2300 }; pr('   RAIL edges inside the box x -2250..-1700, z -3050..-2300 (points every ~50 m):');
  for (const e of gen.rail.edges) { const q: string[] = []; for (let k = 0; k < e.xs.length; k += 5) if (e.xs[k] > lo.x && e.xs[k] < hi.x && e.zs[k] > lo.z && e.zs[k] < hi.z) q.push(`(${f0(e.xs[k])}, ${f0(e.zs[k])})`); if (q.length) pr('     ' + q.join(' ')); } }
writeFileSync(`${OUT}/r6_7_join.json`, JSON.stringify({ note: 'R6-7 join candidates, READ ONLY output of scripts/r6-7-join.ts', best: okc.slice(0, 4).map((c) => ({ id: c.id, end: c.end, tap: c.tap, len: c.len, pts: c.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) })) }));
writeFileSync(`${OUT}/STEP_R6_7_JOIN_OUTPUT.txt`, L.join('\r\n') + '\r\n');
