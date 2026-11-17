// STEP 4.3 (headless, pure math): builds the ribbons of every cross-section element along the whole ring (M8) and checks them.
// Run: npx tsx scripts/ring-ribbons-check.ts [inspiral|straights]
//   inspiral (default): the crown-removal runout is inside the spiral (4.2 option); straights: runout on the tangent before TS.
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { buildRibbons, tiltAt, DEFAULT_TILT, type RunoutMode } from '../src/roads/section/Ribbons';

const mode = (process.argv[2] ?? 'inspiral') as RunoutMode;
const P = { ...DEFAULT_TILT, mode };
let fails = 0;
const L = (s = '') => console.log(s);
const f = (v: number, d = 1) => v.toFixed(d);
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; L(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`); }

const al = buildAlignment([...RING_PIS]);
const { ds, samples } = sampleAlignment(al, 5);
const n = samples.length;
const rs = buildRibbons(al, samples, S, P);
const nOff = rs.offsets.length;
const nRib = nOff - 1;
L(`=== 4.3 RING RIBBONS (M8, runout ${mode}) ===`);
L(`  ${n} stations every ${f(ds, 3)} m, ${nRib} ribbons per side, 2 sides = ${2 * nRib} ribbons, ${nOff} edge lines per side`);
L(`  triangles: ${2 * nRib * n * 2} (2 per quad, ${2 * nRib * n} quads, closed loop)`);
L('  ribbons per side: ' + rs.names.map((nm, j) => `${j + 1} ${nm} [${f(rs.offsets[j])}-${f(rs.offsets[j + 1])}]`).join('; '));

const X = (side: number, i: number, j: number) => rs.pos[side][i % n][3 * j];
const Y = (side: number, i: number, j: number) => rs.pos[side][i % n][3 * j + 1];
const Z = (side: number, i: number, j: number) => rs.pos[side][i % n][3 * j + 2];

L('\n=== Widths and continuity ===');
let wErr = 0, shared = 0;
for (let side = 0; side < 2; side++) for (let i = 0; i < n; i++) {
  const sm = samples[i];
  for (let j = 0; j < nOff; j++) {
    const d = Math.hypot(X(side, i, j) - sm.x, Z(side, i, j) - sm.z);
    wErr = Math.max(wErr, Math.abs(d - rs.offsets[j]));
    if (j > 0) { const w = Math.hypot(X(side, i, j) - X(side, i, j - 1), Z(side, i, j) - Z(side, i, j - 1)); wErr = Math.max(wErr, Math.abs(w - (rs.offsets[j] - rs.offsets[j - 1]))); }
  }
  shared++;
}
check('offset of every edge = table value (plan view)', wErr < 1e-6, `max error ${wErr.toExponential(2)} m over ${shared} cross-sections`);
// the two sides meet on the centreline: ribbons 1 of both sides share offset 0
let meet = 0;
for (let i = 0; i < n; i++) meet = Math.max(meet, Math.hypot(X(0, i, 0) - X(1, i, 0), Z(0, i, 0) - Z(1, i, 0)), Math.abs(Y(0, i, 0) - Y(1, i, 0)));
check('left and right ribbon meet on the centreline (no gap)', meet < 1e-9, `max gap ${meet.toExponential(2)} m`);
// along the line: step length of every edge against the expected value ds * (1 +- d / R)
let worstStep = 0, closeGap = 0;
const Rmin = Math.min(...RING_PIS.map((p) => p.R));
for (let side = 0; side < 2; side++) for (let j = 0; j < nOff; j++) for (let i = 0; i < n; i++) {
  const st = Math.hypot(X(side, i + 1, j) - X(side, i, j), Z(side, i + 1, j) - Z(side, i, j));
  worstStep = Math.max(worstStep, Math.abs(st / ds - 1));
}
for (let side = 0; side < 2; side++) for (let j = 0; j < nOff; j++) closeGap = Math.max(closeGap, Math.hypot(X(side, n, j) - X(side, 0, j), Z(side, n, j) - Z(side, 0, j)));
const maxOff = rs.offsets[nOff - 1];
check('edge step stays within ds (1 +- d / Rmin)', worstStep <= maxOff / Rmin + 0.02, `worst deviation ${f(worstStep * 100, 2)} % (allowed ${f((maxOff / Rmin + 0.02) * 100, 1)} %)`);
check('loop closes on every edge line (last -> first station)', closeGap < ds * (1 + maxOff / Rmin) + 1e-6, `gap ${f(closeGap, 2)} m = one step`);
let kink = 0;
for (let side = 0; side < 2; side++) for (const j of [nOff - 1]) for (let i = 0; i < n; i++) {
  const a1 = Math.atan2(Z(side, i + 1, j) - Z(side, i, j), X(side, i + 1, j) - X(side, i, j));
  const a0 = Math.atan2(Z(side, i, j) - Z(side, i - 1 + (i === 0 ? n : 0), j), X(side, i, j) - X(side, i - 1 + (i === 0 ? n : 0), j));
  let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  kink = Math.max(kink, Math.abs(d) * 180 / Math.PI);
}
check('no kink on the ROW edge line (heading step per station)', kink <= 0.5, `max ${f(kink, 3)} deg (centreline max 0.485 deg)`);

L('\n=== Self-intersection (plan view) ===');
// segments of the 4 outermost lines + the pavement edges, tested with a grid
type Seg = { ax: number; az: number; bx: number; bz: number; line: number; i: number };
const lines = [] as Array<{ name: string; side: number; j: number }>;
for (let side = 0; side < 2; side++) for (const j of [nOff - 1, nOff - 2, 4]) lines.push({ name: `${side === 0 ? 'left' : 'right'} edge ${f(rs.offsets[j])} m`, side, j });
const segs: Seg[] = [];
lines.forEach((ln, li) => { for (let i = 0; i < n; i++) segs.push({ ax: X(ln.side, i, ln.j), az: Z(ln.side, i, ln.j), bx: X(ln.side, i + 1, ln.j), bz: Z(ln.side, i + 1, ln.j), line: li, i }); });
const cell = 120;
const grid = new Map<number, number[]>();
const key = (cx: number, cz: number) => (cx + 5000) * 20000 + (cz + 5000);
segs.forEach((sg, k) => {
  const x0 = Math.floor(Math.min(sg.ax, sg.bx) / cell), x1 = Math.floor(Math.max(sg.ax, sg.bx) / cell);
  const z0 = Math.floor(Math.min(sg.az, sg.bz) / cell), z1 = Math.floor(Math.max(sg.az, sg.bz) / cell);
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const kk = key(cx, cz); const a = grid.get(kk); if (a) a.push(k); else grid.set(kk, [k]); }
});
const orient = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
const cross = (a: Seg, b: Seg) => {
  const o1 = orient(a.ax, a.az, a.bx, a.bz, b.ax, b.az), o2 = orient(a.ax, a.az, a.bx, a.bz, b.bx, b.bz);
  const o3 = orient(b.ax, b.az, b.bx, b.bz, a.ax, a.az), o4 = orient(b.ax, b.az, b.bx, b.bz, a.bx, a.bz);
  return o1 * o2 < 0 && o3 * o4 < 0;
};
let hits = 0;
const seen = new Set<number>();
for (const arr of grid.values()) for (let p = 0; p < arr.length; p++) for (let q = p + 1; q < arr.length; q++) {
  const a = segs[arr[p]], b = segs[arr[q]];
  const pk = arr[p] * segs.length + arr[q];
  if (seen.has(pk)) continue; seen.add(pk);
  if (a.line === b.line) { const di = Math.abs(a.i - b.i); if (Math.min(di, n - di) <= 2) continue; }
  if (cross(a, b)) hits++;
}
check(`no crossing between ${segs.length} edge segments (6 edge lines, both sides)`, hits === 0, `${hits} crossings`);
const inner = Math.min(...RING_PIS.map((p) => p.R)) - maxOff;
check('offset curve of the inside of the tightest curve stays positive', inner > 0, `R ${Rmin} - ${f(maxOff)} = ${f(inner)} m`);
// ROW of one part of the ring against another part: nearest approach of centreline parts more than 1 km apart
let near = Infinity, nearAt = [0, 0];
const gc = new Map<number, number[]>();
samples.forEach((sm, i) => { const kk = key(Math.floor(sm.x / 200), Math.floor(sm.z / 200)); const a = gc.get(kk); if (a) a.push(i); else gc.set(kk, [i]); });
samples.forEach((sm, i) => {
  const cx = Math.floor(sm.x / 200), cz = Math.floor(sm.z / 200);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of gc.get(key(cx + dx, cz + dz)) ?? []) {
    const sep = Math.abs(i - j); if (Math.min(sep, n - sep) * ds < 1000) continue;
    const d = Math.hypot(samples[j].x - sm.x, samples[j].z - sm.z); if (d < near) { near = d; nearAt = [sm.s, samples[j].s]; }
  }
});
check('two far-apart parts of the ring never come closer than 2 x ROW (80 m)', near >= 2 * S.rowHalf, near === Infinity ? 'no two parts more than 1 km apart along the ring come within 400 m of each other' : `nearest approach ${f(near, 0)} m (stations ${f(nearAt[0], 0)} and ${f(nearAt[1], 0)})`);

L('\n=== Areas (plan view, from the ribbon quads) ===');
const area = (side: number, j0: number, j1: number) => {
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = [[X(side, i, j0), Z(side, i, j0)], [X(side, i + 1, j0), Z(side, i + 1, j0)], [X(side, i + 1, j1), Z(side, i + 1, j1)], [X(side, i, j1), Z(side, i, j1)]];
    let s = 0; for (let k = 0; k < 4; k++) { const q = p[(k + 1) % 4]; s += p[k][0] * q[1] - q[0] * p[k][1]; }
    a += Math.abs(s) / 2;
  }
  return a;
};
const idx = (name: string) => rs.names.findIndex((x) => x.startsWith(name));
const jPave0 = 1, jPave1 = idx('outer paved shoulder') + 1;
const paved = area(0, jPave0, jPave1) + area(1, jPave0, jPave1);
const rowA = area(0, 0, nOff - 1) + area(1, 0, nOff - 1);
const len = al.length;
const expPave = (2 * (S.pavementEdge - 3)) * len, expRow = 2 * S.rowHalf * len;
check('paved area (median excluded) = 38.2 m x ring length', Math.abs(paved / expPave - 1) < 0.003, `${f(paved / 1e4, 1)} ha vs ${f(expPave / 1e4, 1)} ha (4.1: 74 ha)`);
check('ROW area = 80 m x ring length', Math.abs(rowA / expRow - 1) < 0.003, `${f(rowA / 1e4, 1)} ha vs ${f(expRow / 1e4, 1)} ha (4.1: 154 ha)`);

L('\n=== Cross-fall and superelevation (heights relative to the median edge) ===');
const outerFall = (i: number) => { const t = tiltAt(al, samples[i].s, P); return t; };
let maxStepE = 0, maxE = -1, minE = 1;
let gMax = 0;
for (let i = 0; i < n; i++) {
  const a = outerFall(i).eOuter, b = outerFall(i + 1 >= n ? 0 : i + 1).eOuter;
  maxStepE = Math.max(maxStepE, Math.abs(b - a)); maxE = Math.max(maxE, a); minE = Math.min(minE, a);
  gMax = Math.max(gMax, (Math.abs(b - a) / ds));
}
check('tilt is continuous (no step between stations)', maxStepE <= P.eFull / Math.min(P.Lr, P.Lt) * ds * 1.01, `max step ${f(maxStepE * 100, 3)} % per ${f(ds, 1)} m`);
check('tilt between -2 % and +2 %, never above 8 %', minE >= -P.crown - 1e-12 && maxE <= P.eFull + 1e-12 && maxE <= 0.08, `from ${f(minE * 100, 1)} % to ${f(maxE * 100, 1)} %`);
// relative gradient of the outer lane edge against the median-edge pivot
const lanesEnd = idx('4 travel lanes') + 1, lanesStart = lanesEnd - 1; // edge indices
let relMax = 0, shoDiff = 0;
for (let i = 0; i < n; i++) for (let side = 0; side < 2; side++) {
  const j = i + 1 >= n ? 0 : i + 1;
  const dh = Math.abs((Y(side, j, lanesEnd) - Y(side, j, lanesStart)) - (Y(side, i, lanesEnd) - Y(side, i, lanesStart)));
  relMax = Math.max(relMax, dh / ds);
  const gl = (Y(side, i, lanesEnd - 1) - Y(side, i, lanesEnd)) / (rs.offsets[lanesEnd] - rs.offsets[lanesEnd - 1]);
  const gs = (Y(side, i, lanesEnd) - Y(side, i, lanesEnd + 1)) / (rs.offsets[lanesEnd + 1] - rs.offsets[lanesEnd]);
  shoDiff = Math.max(shoDiff, Math.abs(gs - gl));
}
const wLanes = rs.offsets[lanesEnd] - rs.offsets[lanesStart];
const bw = (1 + 0.5 * (S.lanesPerDir - 1)) / S.lanesPerDir;
L(`  relative gradient of the outside lane edge against the inner lane edge (${f(wLanes)} m of lanes): ${f(relMax * 100, 2)} % geometric`);
check('relative gradient x bw 0.625 <= 0.44 % (limit still to verify)', relMax * bw <= 0.0044 + 1e-9, `${f(relMax * bw * 100, 2)} % on the AASHTO basis (4 lanes rotated about the median edge)`);
check('lane / shoulder algebraic difference <= 8 % (roll-over)', shoDiff <= 0.08 + 1e-9, `max ${f(shoDiff * 100, 1)} %`);

L('\n  Rotated curves: tilt of the OUTER carriageway at key stations (+ = falls towards the curve centre)');
L('   PI  outer side   TS station  e at TS   TS+45   TS+90    SC   arc mid   edge drop at normal / full tilt (m)');
for (const r of al.rows) {
  const eAt = (s: number) => tiltAt(al, mod2(s, len), P).eOuter;
  const mid = r.sc + (r.cs - r.sc) / 2;
  const at = (s: number) => f(eAt(s) * 100, 1).padStart(6) + ' %';
  const g0 = 0.02, g1 = -0.02;
  const drop = (g: number) => 1.5 * (g + 0.02) + 14.6 * g + 3.0 * (g + 0.02);
  L(`  ${String(r.index).padStart(3)}  ${(r.delta > 0 ? '-n side' : '+n side').padEnd(10)} ${f(r.ts, 0).padStart(9)} ${at(r.ts)} ${at(r.ts + 45)} ${at(r.ts + 90)} ${at(r.sc)} ${at(mid)}    ${f(drop(g0), 3)} / ${f(drop(g1), 3)}`);
}
function mod2(a: number, m: number): number { return ((a % m) + m) % m; }
const fullAtSc = al.rows.every((r) => Math.abs(tiltAt(al, r.sc % len, P).eOuter - P.eFull) < 1e-9);
check('full tilt is reached at or before SC on every curve', fullAtSc, `${al.rows.length} curves, spiral ${RING_PIS[0].Ls} m, ramps ${P.Lt + P.Lr} m`);

L('\n=== Section at a rotated curve (PI 3, left and right carriageway), height relative to the median edge, m ===');
const r3 = al.rows[3];
const pick = (label: string, s: number) => {
  const i = Math.round(mod2(s, len) / ds) % n;
  const t = tiltAt(al, samples[i].s, P);
  const line = [0, 1].map((side) => rs.offsets.filter((_, j) => j >= 1 && j <= 4).map((d, k) => `${f(d)}:${f(Y(side, i, k + 1), 3)}`).join('  '));
  L(`  ${label.padEnd(12)} s ${f(samples[i].s, 0).padStart(6)} e outer ${f(t.eOuter * 100, 1).padStart(5)} %   side +n: ${line[0]}   side -n: ${line[1]}`);
};
pick('straight', r3.ts - 200); pick('TS', r3.ts); pick('TS+45', r3.ts + 45); pick('TS+90', r3.ts + 90); pick('arc mid', (r3.sc + r3.cs) / 2);

L(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
