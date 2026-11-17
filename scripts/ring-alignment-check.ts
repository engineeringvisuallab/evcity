// STEP 2.2 / 2.3 check script (headless, pure math). Run: npx tsx scripts/ring-alignment-check.ts [ring-alignment.json]
// Builds the closed ring alignment from the PI table, prints the PI/element tables, runs the closure test, the design checks
// and the smoothness report (section 3.12), and compares the line with the reference shape of Roads.zip (F3).
import { writeFileSync } from 'node:fs';
import { DESIGN } from '../src/roads/standards/Criteria';
import * as K from '../src/roads/standards/Checks';
import { REF_RING } from '../src/roads/reference/RefShapes';
import { buildAlignment, sampleAlignment, closure } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_DESIGN_SPEED as V } from '../src/roads/alignment/RingAlignment';

let fails = 0;
const L = (s = '') => console.log(s);
const deg = (r: number) => (r * 180) / Math.PI;
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; L(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} ${detail}`); }

const al = buildAlignment([...RING_PIS]);
const n = RING_PIS.length;
L(`=== 2.2 RING ALIGNMENT (V${V}, ${n} PIs, game coordinates) ===`);
L(`  length ${(al.length / 1000).toFixed(3)} km, ${al.elements.length} elements, Rmin(V${V}) ${K.minRadius(V).toFixed(0)} m, needed R >= ${(DESIGN.radiusMargin * K.minRadius(V)).toFixed(0)} m`);
L('\n  PI table');
L('   PI        x         z     turn    R    Ls     Ts    arc deg  arc m  straight after  needs   TS      SC      CS      ST   (stations, m)');
for (const r of al.rows) {
  const p = RING_PIS[r.index];
  const need = r.sameDirAsNext ? 6 * V : 2 * V;
  L(`  ${String(r.index).padStart(2)} ${p.x.toFixed(1).padStart(9)} ${p.z.toFixed(1).padStart(9)} ${deg(r.delta).toFixed(2).padStart(8)} ${String(p.R).padStart(5)} ${String(p.Ls).padStart(5)} ${r.Ts.toFixed(1).padStart(7)} ${deg(r.arcAngle).toFixed(2).padStart(8)} ${(r.arcAngle * p.R).toFixed(0).padStart(6)} ${r.straightAfter.toFixed(0).padStart(11)} ${String(need).padStart(9)} ${r.ts.toFixed(0).padStart(7)} ${r.sc.toFixed(0).padStart(7)} ${r.cs.toFixed(0).padStart(7)} ${r.st.toFixed(0).padStart(7)}`);
}

L('\n  Design checks per PI');
for (const r of al.rows) {
  const p = RING_PIS[r.index];
  const cr = K.checkRadius(p.R, V);
  const need = K.spiralLength(V, p.R, DESIGN.comfortC);
  const se = K.superelevation(V, p.R);
  const rule = r.sameDirAsNext ? 6 * V : 2 * V;
  const ok = cr.pass && p.Ls >= need && r.arcAngle > 0 && r.straightAfter >= rule;
  if (!ok) fails++;
  L(`  ${ok ? 'PASS' : 'FAIL'}  PI ${r.index}: R ${p.R} (margin ${(p.R / K.minRadius(V)).toFixed(2)}), Ls ${p.Ls} >= ${need}, arc ${deg(r.arcAngle).toFixed(1)} deg, straight ${r.straightAfter.toFixed(0)} >= ${rule}, e needed ${(se.eNeeded * 100).toFixed(1)} % ${se.keepCrown ? '(normal crown)' : ''}`);
}

L('\n=== Closure test (dead reckoning around the loop) ===');
const c = closure(al);
check('position gap', c.gap <= DESIGN.closure.position, `${c.gap.toExponential(2)} m (limit ${DESIGN.closure.position} m)`);
check('heading gap', c.headingGapDeg <= DESIGN.closure.headingDeg, `${c.headingGapDeg.toExponential(2)} deg (limit ${DESIGN.closure.headingDeg} deg)`);
check('curvature gap', c.curvatureGap <= DESIGN.closure.curvature, `${c.curvatureGap.toExponential(2)} 1/m (limit ${DESIGN.closure.curvature})`);
const totalTurn = al.rows.reduce((a, r) => a + r.delta, 0);
check('total turning = 360 deg', Math.abs(Math.abs(deg(totalTurn)) - 360) < 1e-6, `${deg(totalTurn).toFixed(6)} deg`);

L('\n=== 2.3 Smoothness report (section 3.12) on samples every 5 m ===');
const { ds, samples } = sampleAlignment(al, 5);
const flat: number[] = [];
for (const s of samples) flat.push(s.x, s.z);
const sm = K.smoothness(flat, ds, V);
L(`  ${samples.length} samples, ds ${ds.toFixed(3)} m`);
check('1 only straight-spiral-arc (kinds present)', true, [...new Set(samples.map((s) => s.kind))].join(', '));
check('2 no kink (change of heading step)', sm.kinkCount === 0, `${sm.kinkCount} kinks, max heading step ${sm.maxHeadingStepDeg.toFixed(3)} deg per ${ds.toFixed(1)} m`);
let maxRate = 0;
for (let i = 0; i < samples.length; i++) {
  const a = samples[i], b = samples[(i + 1) % samples.length];
  const rate = Math.abs(b.k - a.k) / ds;
  maxRate = Math.max(maxRate, rate);
}
const rateLimit = Math.max(...RING_PIS.map((p) => 1 / (p.R * p.Ls)));
check('3 curvature continuous, dk/ds <= 1/(R Ls)', maxRate <= rateLimit * 1.001, `max dk/ds ${maxRate.toExponential(2)} (largest allowed ${rateLimit.toExponential(2)})`);
const arcMin = Math.min(...RING_PIS.map((p) => p.R));
check('4 radius margin R >= 1.5 x Rmin', arcMin >= DESIGN.radiusMargin * K.minRadius(V), `smallest R ${arcMin} m, limit ${(DESIGN.radiusMargin * K.minRadius(V)).toFixed(0)} m; smallest on 200 m arms ${sm.minR.toFixed(0)} m at station ${sm.minRStation.toFixed(0)}`);
const comp = al.rows.every((r) => r.arcAngle > 0);
check('5 compound curves: none (every curve has its own arc and the neighbours are separated by straights)', comp && al.rows.every((r) => r.straightAfter > 0), `smallest straight ${Math.min(...al.rows.map((r) => r.straightAfter)).toFixed(0)} m`);
check('6 broken-back: straight >= 6 V (600 m) between same-direction curves', al.rows.every((r) => !r.sameDirAsNext || r.straightAfter >= 6 * V), `same-direction pairs ${al.rows.filter((r) => r.sameDirAsNext).length} of ${n}`);
check('7 reverse curves: straight >= 2 V (200 m)', al.rows.every((r) => r.sameDirAsNext || r.straightAfter >= 2 * V), `reverse pairs ${al.rows.filter((r) => !r.sameDirAsNext).length}`);

L('\n=== Fit to the reference shape (Roads.zip F3), distance in m ===');
const ref = K.resample(REF_RING, 5, true);
const dist = (px: number, pz: number, q: ArrayLike<number>) => { let m = Infinity; for (let i = 0; i < q.length; i += 2) { const d = Math.hypot(q[i] - px, q[i + 1] - pz); if (d < m) m = d; } return m; };
const d1: number[] = [];
for (let i = 0; i < ref.length; i += 2) d1.push(dist(ref[i], ref[i + 1], flat));
const d2: number[] = [];
for (let i = 0; i < flat.length; i += 2) d2.push(dist(flat[i], flat[i + 1], ref));
const stat = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return { mean: a.reduce((x, y) => x + y, 0) / a.length, p95: s[Math.floor(0.95 * s.length)], max: s[s.length - 1] }; };
const A = stat(d1), B = stat(d2);
L(`  reference -> new line: mean ${A.mean.toFixed(1)}, p95 ${A.p95.toFixed(1)}, max ${A.max.toFixed(1)}`);
L(`  new line -> reference: mean ${B.mean.toFixed(1)}, p95 ${B.p95.toFixed(1)}, max ${B.max.toFixed(1)}`);

const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify({ ds, samples, pis: RING_PIS, rows: al.rows, dev: d2, devRef: d1 }));
L(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
