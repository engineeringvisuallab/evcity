// STEP 21.6e-1 CURVE TABLE (headless; changes NO src file, writes only docs/).
// Run: node --experimental-strip-types scripts/centre-curves.ts docs     (or: npx tsx scripts/centre-curves.ts docs)
// Reads dir/centre_fixed.json (polylines, s = metres along the points), writes dir/centre_curves.json and dir/STEP_21_6E1_OUTPUT.txt.
// WHAT IT DOES: finds every bend of every line and MEASURES it: deflection delta, R of the arc part, spiral length Ls (handoff 3.2 / Checks.spiralLength).
// WHAT IT DOES NOT DO: it is NOT the real straight-spiral-arc-spiral-straight fit (that is the build step 21.6), and NO superelevation rule yet (21.6e-2).
// Numbers are MY choices (constants below); the design speeds are the ones of 21.3. The friction table is copied from src/interchange/Standards.ts (CRITERIA).
import { readFileSync, writeFileSync } from 'fs';

const OUT = process.argv[2] ?? 'docs';
const DS = 5;            // resample step (m)
const W = 4;             // curvature window: +-W samples (+-20 m)
const K0 = 1 / 1500;     // a sample is "in a bend" when |curvature| >= 1/1500 (R <= 1500 m)
const GAP = 15;          // two bends of the same sign closer than this are one bend (m)
const MIN_LEN = 20, MIN_DELTA = 3 * Math.PI / 180;
const COMFORT_C = 0.6, EMAX = 0.08;
const VS: Record<string, number> = { '8': 100, '6': 80, '4': 60, '2': 40, C: 40, L: 30 };
const FT: number[][] = [[20, 0.35], [30, 0.28], [40, 0.23], [50, 0.19], [60, 0.17], [70, 0.15], [80, 0.14], [100, 0.12], [120, 0.09]];

const frictionAt = (V: number): number => { if (V <= FT[0][0]) return FT[0][1]; for (let i = 1; i < FT.length; i++) if (V <= FT[i][0]) return FT[i - 1][1] + ((FT[i][1] - FT[i - 1][1]) * (V - FT[i - 1][0])) / (FT[i][0] - FT[i - 1][0]); return FT[FT.length - 1][1]; };
const minRadius = (V: number): number => (V * V) / (127 * (EMAX + frictionAt(V)));
const spiralLength = (V: number, R: number): number => Math.ceil(Math.max((0.0214 * V ** 3) / (R * COMFORT_C), V / 1.8) / 10) * 10;
const eFormula = (V: number, R: number): number => Math.max(0, (V * V) / (127 * R) - frictionAt(V));
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const D = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));

function resample(p: number[][]): { x: number[]; z: number[]; len: number } {
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.max(2, Math.round(len / DS) + 1), x: number[] = [], z: number[] = []; let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (len * i) / (n - 1); while (j + 2 < cum.length && cum[j + 1] < s) j++;
    const t = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    x.push(p[j][0] + t * (p[j + 1][0] - p[j][0])); z.push(p[j][1] + t * (p[j + 1][1] - p[j][1]));
  }
  return { x, z, len };
}
const wrap = (a: number): number => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const pct = (a: number[], q: number): number => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

interface Curve { n: number; s0: number; s1: number; len: number; dirn: 'L' | 'R'; deltaDeg: number; R: number; Rmin: number; Ls: number; eInfo: number; flags: string[] }
interface LineOut { id: string; cls: string; V: number; len: number; curves: Curve[] }
const lines: LineOut[] = [];
pr('STEP 21.6e-1 CURVE TABLE (measured bends of docs/centre_fixed.json; NOT the real spiral fit, NO superelevation rule yet)');
pr(`method: resample ${DS} m, curvature over +-${W * DS} m, bend = |k| >= 1/${f0(1 / K0)} (R <= ${f0(1 / K0)} m) for 20 m or more and 3 deg or more; R = 1 / (75th percentile of |k| in the bend); Ls = max(0.0214 V^3/(R C), V/1.8) rounded up to 10 m, C ${COMFORT_C}`);

for (const ln of D.lines) {
  const cls = String(ln.cls), V = VS[cls]; if (!V) continue;
  const r = resample(ln.pts), n = r.x.length;
  const hd: number[] = []; for (let i = 0; i < n - 1; i++) hd.push(Math.atan2(r.z[i + 1] - r.z[i], r.x[i + 1] - r.x[i]));
  const ds = r.len / (n - 1), k: number[] = new Array(n).fill(0);
  for (let i = W; i < n - 1 - W; i++) k[i] = wrap(hd[i + W - 1] - hd[i - W]) / (ds * (2 * W - 1) + 0);
  // bends = runs of the same sign with |k| >= K0
  const runs: { a: number; b: number; sg: number }[] = []; let cur: { a: number; b: number; sg: number } | null = null;
  for (let i = 0; i < n; i++) {
    const sg = Math.sign(k[i]), on = Math.abs(k[i]) >= K0;
    if (on && cur && cur.sg === sg) cur.b = i;
    else { if (cur) runs.push(cur); cur = on ? { a: i, b: i, sg } : null; }
  }
  if (cur) runs.push(cur);
  const merged: typeof runs = [];
  for (const q of runs) { const m = merged[merged.length - 1]; if (m && m.sg === q.sg && (q.a - m.b) * ds <= GAP) m.b = q.b; else merged.push({ ...q }); }
  const out: Curve[] = [];
  for (const q of merged) {
    const s0 = q.a * ds, s1 = q.b * ds, len = s1 - s0, a0 = Math.max(0, q.a - W), b0 = Math.min(n - 2, q.b + W - 1);
    const delta = Math.abs(wrap(hd[b0] - hd[a0]));
    if (len < MIN_LEN || delta < MIN_DELTA) continue;
    const ks: number[] = []; for (let i = q.a; i <= q.b; i++) ks.push(Math.abs(k[i]));
    const R = 1 / Math.max(1e-9, pct(ks, 0.75)), Rmin = 1 / Math.max(1e-9, Math.max(...ks));
    const Ls = spiralLength(V, R), fl: string[] = [];
    if (R < minRadius(V)) fl.push(`R<Rmin ${f0(minRadius(V))}`);
    if (delta < Ls / R) fl.push('SHORT: delta < Ls/R (no room for an arc, spirals only)');
    if (eFormula(V, R) > EMAX) fl.push('e>8%');
    out.push({ n: out.length + 1, s0, s1, len, dirn: q.sg > 0 ? 'L' : 'R', deltaDeg: (delta * 180) / Math.PI, R, Rmin, Ls, eInfo: eFormula(V, R), flags: fl });
  }
  lines.push({ id: ln.id, cls, V, len: r.len, curves: out });
}

// ---- summary per class
pr(); pr('1. SUMMARY PER CLASS (V = design speed; "R<Rmin" = under the class minimum radius at e max 8 %; "SHORT" = delta smaller than Ls/R)');
pr('   cls    V  lines  bends  R<Rmin  SHORT  minR(m)  median R  Rmin class');
let total = 0;
for (const c of ['8', '6', '4', '2', 'C', 'L']) {
  const ls = lines.filter((x) => x.cls === c), cs = ls.flatMap((x) => x.curves), V = VS[c]; total += cs.length;
  const rs = cs.map((q) => q.R);
  pr(`   ${c.padEnd(3)}  ${String(V).padStart(3)}  ${String(ls.length).padStart(5)}  ${String(cs.length).padStart(5)}  ${String(cs.filter((q) => q.flags.some((f) => f.startsWith('R<'))).length).padStart(6)}  ${String(cs.filter((q) => q.flags.some((f) => f.startsWith('SHORT'))).length).padStart(5)}  ${rs.length ? f0(Math.min(...rs)).padStart(7) : '      -'}  ${rs.length ? f0(pct(rs, 0.5)).padStart(8) : '       -'}  ${f0(minRadius(V))}`);
}
pr(`   total bends ${total} on ${lines.length} lines`);

// ---- list of curves that need attention
pr(); pr('2. BENDS UNDER THE CLASS MINIMUM RADIUS OR WITH e > 8 % (line, no., s0-s1, dir, delta, R, Ls, e by formula = info only). SHORT bends are only counted in table 1: SHORT = a small bend (a wiggle of the drawn line) where the real fit must take a bigger R; it is not a fault of the road');
for (const ln of lines) for (const q of ln.curves) if (q.flags.some((f) => !f.startsWith('SHORT'))) pr(`   ${ln.id.padEnd(7)} #${String(q.n).padEnd(2)} s ${f0(q.s0).padStart(5)}-${f0(q.s1).padEnd(5)} ${q.dirn} d ${f1(q.deltaDeg).padStart(6)} deg  R ${f0(q.R).padStart(5)} (tightest ${f0(q.Rmin)})  Ls ${f0(q.Ls).padStart(3)}  e ${f1(q.eInfo * 100)} %   ${q.flags.join('; ')}`);

// ---- full table of the bends that need superelevation by the formula (info)
const needE = lines.flatMap((ln) => ln.curves.filter((q) => q.eInfo > 0).map((q) => ({ id: ln.id, q })));
pr(); pr(`3. BENDS WITH e > 0 BY THE FORMULA e = V^2/(127 R) - f (info; the crown rule is chosen in 21.6e-2): ${needE.length} of ${total}`);
pr('   by class: ' + ['8', '6', '4', '2', 'C', 'L'].map((c) => `${c} ${needE.filter((x) => lines.find((l) => l.id === x.id)!.cls === c).length}`).join(', '));

pr(); pr('4. CHECKS (these test the table, not the design)');
chk(lines.length === D.lines.filter((l: any) => VS[String(l.cls)]).length, `every line with a known class is in the table (${lines.length} lines)`);
chk(lines.every((l) => l.curves.every((q, i) => q.s1 > q.s0 && q.s1 <= l.len + 0.01 && (i === 0 || q.s0 >= l.curves[i - 1].s1))), 'bends in order, no overlap, inside the line length');
chk(lines.every((l) => l.curves.every((q) => q.R > 0 && q.Ls >= 10 && q.deltaDeg >= 3)), 'every bend has R > 0, Ls >= 10 m, delta >= 3 deg');
chk(spiralLength(80, 229) === 80 && spiralLength(30, 20) === 50 && spiralLength(60, 113) === 70, 'spiral formula gives the worked values V80 R229 = 80 m, V60 R113 = 70 m, V30 R20 = 50 m (same as Checks.spiralLength)');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
pr('   NOT RUN: tsc, npm run build, the game. Nothing in src changed.');
pr('   LIMITS: R is measured on 5 m resampled points with +-20 m window, so a bend under about R 40 m is blurred and a bend over about R 1000 m is noisy; the final R / Ls come from the real fit (21.6 build).');

writeFileSync(`${OUT}/centre_curves.json`, JSON.stringify({ note: 'STEP 21.6e-1: measured bends per line (s along centre_fixed.json points). NOT the real spiral fit.', params: { DS, W, K0, GAP, MIN_LEN, COMFORT_C, EMAX, VS }, lines }, null, 0));
writeFileSync(`${OUT}/STEP_21_6E1_OUTPUT.txt`, L.join('\n') + '\n');
