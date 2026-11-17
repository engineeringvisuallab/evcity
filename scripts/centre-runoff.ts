// STEP 21.6e-3 RUNOFF / RUNOUT vs SPIRAL LENGTH + ROTATION AXIS (headless; changes NO src file, writes only docs/).
// Run: node --experimental-strip-types scripts/centre-runoff.ts docs     (or: npx tsx scripts/centre-runoff.ts docs)
// Reads dir/centre_super.json (21.6e-2, bends with e > 0) and dir/centre_sections.json (lanes per direction, lane width, median per class);
// writes dir/centre_runoff.json and dir/STEP_21_6E3_OUTPUT.txt.
// METHOD = the ring method of scripts/ring-superelevation.ts (same formulas, same project assumption of the relative gradient 0.44 %):
//   w = lane width, n = lanes per direction, bw = (1 + 0.5 (n - 1)) / n, delta = 0.0044 (PROJECT ASSUMPTION, used for every class: it is the safe side for the slower classes)
//   runoff Lr = w n bw e / delta (0 -> +e), runout Lt = w n bw crown / delta (-2 % -> 0), both rounded UP to 5 m.
//   Rotation axis: divided road (median > 0) = about the median edge (the outer carriageway governs); undivided = about the centreline.
//   Handoff 3.2: Ls must not be shorter than the runoff. Ls_new = max(Ls, Lr rounded up to 10 m). The runout Lt stays on the tangent before the spiral,
//   unless Lr + Lt <= Ls_new (then it can lie inside the spiral, tangent runout 0, as the ring option "inspiral").
// The shoulders are not in the width (same as the ring script). Nothing about the straights between bends here (21.6e-4).
import { readFileSync, writeFileSync } from 'fs';

const OUT = process.argv[2] ?? 'docs';
const CROWN = 0.02, DELTA = 0.0044;
const up = (v: number, q: number): number => Math.ceil(v / q - 1e-9) * q;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const S = JSON.parse(readFileSync(`${OUT}/centre_super.json`, 'utf8')).rows as any[];
const SEC = JSON.parse(readFileSync(`${OUT}/centre_sections.json`, 'utf8')).sections as any[];
// class -> section data. M8 / J1 arms ('8') is the SectionTable M8: 4 lanes x 3.65 m, median 6 m (not in centre_sections.json).
const cs = new Map<string, { n: number; w: number; median: number }>([['8', { n: 4, w: 3.65, median: 6 }]]);
for (const s of SEC) { const k = String(s.cls).replace(/^R(?=\d)/, ''); if (!cs.has(k)) cs.set(k, { n: s.lanesPerDir, w: s.laneW, median: s.median }); }
const bwOf = (n: number): number => (1 + 0.5 * (n - 1)) / n;
const runoff = (w: number, n: number, e: number): number => up((w * n * e * bwOf(n)) / DELTA, 5);
const runout = (w: number, n: number): number => up((w * n * CROWN * bwOf(n)) / DELTA, 5);

interface Out { id: string; cls: string; n: number; s0: number; s1: number; R: number; V: number; e: number; axis: string; Lr: number; Lt: number; Ls: number; LsNew: number; inSpiral: boolean; relGrad: number }
const out: Out[] = [];
for (const r of S) {
  if (r.e <= 0) continue;
  const c = cs.get(String(r.cls)); if (!c) throw new Error('no section for class ' + r.cls);
  const Lr = runoff(c.w, c.n, r.e), Lt = runout(c.w, c.n), LsNew = Math.max(r.Ls, up(Lr, 10));
  out.push({ id: r.id, cls: String(r.cls), n: r.n, s0: r.s0, s1: r.s1, R: r.R, V: r.V, e: r.e, axis: c.median > 0 ? 'median edge' : 'centreline', Lr, Lt, Ls: r.Ls, LsNew, inSpiral: Lr + Lt <= LsNew, relGrad: (c.w * c.n * bwOf(c.n) * r.e) / Lr });
}

pr('STEP 21.6e-3 RUNOFF / RUNOUT vs SPIRAL + ROTATION AXIS (ring method, relative gradient 0.44 %, Lr and Lt rounded up to 5 m, Ls_new = max(Ls, Lr up to 10 m))');
pr(); pr('1. SECTION DATA USED (w lane width, n lanes per direction, bw, rotation axis) and the lengths at e = 2 % and e = 8 %');
pr('   cls  n    w    bw   axis          Lt    Lr(2%)  Lr(8%)');
for (const k of ['8', '6', '4', '2', 'C', 'L']) { const c = cs.get(k)!; pr(`   ${k.padEnd(3)}  ${c.n}  ${c.w.toFixed(2)}  ${bwOf(c.n).toFixed(3)}  ${(c.median > 0 ? 'median edge' : 'centreline').padEnd(12)} ${String(runout(c.w, c.n)).padStart(4)}  ${String(runoff(c.w, c.n, 0.02)).padStart(6)}  ${String(runoff(c.w, c.n, 0.08)).padStart(6)}`); }
pr(); pr('2. SUMMARY PER CLASS (bends with e > 0: Ls kept = Ls already long enough; raised = Ls_new above Ls; in spiral = Lr + Lt fits inside Ls_new)');
pr('   cls  bends  Ls kept  raised  max raise  in spiral  max Lr  max Lt  max Ls_new');
for (const k of ['8', '6', '4', '2', 'C', 'L']) {
  const r = out.filter((x) => x.cls === k); if (!r.length) { pr(`   ${k.padEnd(3)}      0`); continue; }
  const up_ = r.filter((x) => x.LsNew > x.Ls);
  pr(`   ${k.padEnd(3)}  ${String(r.length).padStart(5)}  ${String(r.length - up_.length).padStart(7)}  ${String(up_.length).padStart(6)}  ${String(Math.max(0, ...up_.map((x) => x.LsNew - x.Ls))).padStart(9)}  ${String(r.filter((x) => x.inSpiral).length).padStart(9)}  ${String(Math.max(...r.map((x) => x.Lr))).padStart(6)}  ${String(Math.max(...r.map((x) => x.Lt))).padStart(6)}  ${String(Math.max(...r.map((x) => x.LsNew))).padStart(10)}`);
}
pr(); pr('3. THE 15 BIGGEST SPIRAL INCREASES (line, bend no., e, Ls -> Ls_new, Lr, Lt)');
for (const x of [...out].sort((a, b) => b.LsNew - b.Ls - (a.LsNew - a.Ls)).slice(0, 15)) pr(`   ${x.id.padEnd(7)} #${String(x.n).padEnd(2)} s ${f0(x.s0).padStart(5)}  R ${f0(x.R).padStart(4)}  e ${f1(x.e * 100).padStart(4)} %  Ls ${String(x.Ls).padStart(3)} -> ${String(x.LsNew).padStart(3)}  Lr ${String(x.Lr).padStart(3)}  Lt ${String(x.Lt).padStart(3)}  ${x.axis}`);
pr(); pr('4. CHECKS (these test the table and the method, not the design)');
chk(Math.abs(bwOf(4) - 0.625) < 1e-12 && runoff(3.65, 4, 0.02) === 45 && runout(3.65, 4) === 45, 'ring worked value reproduced: M8 e 2 %: Lr 45 m, Lt 45 m (docs/ring-superelevation_nc018_output.txt)');
chk(out.length === S.filter((x) => x.e > 0).length, `every bend with e > 0 has a row (${out.length})`);
chk(out.every((x) => x.relGrad <= DELTA + 1e-9), 'relative gradient of every bend is at most 0.44 %');
chk(out.every((x) => x.LsNew >= x.Ls && x.LsNew >= x.Lr && x.LsNew % 10 === 0), 'Ls_new is never shorter than Ls or Lr and is a multiple of 10 m');
chk(out.every((x) => (x.axis === 'median edge') === (x.cls === '8' || x.cls === '6' || x.cls === '4')), 'divided classes (8, 6, 4) rotate about the median edge, the others about the centreline');
chk(out.every((x) => x.Lt > 0 && x.Lr > 0), 'every runoff and runout length is positive');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
pr('   NOT RUN: tsc, npm run build, the game. Nothing in src changed. NOT DONE: free straight between two bends (6 V / 2 V rule, tangent runout inside it), bend length vs 2 Ls_new, junction nodes (21.7).');
pr('   LIMIT: R, Ls and bend positions are the measured ones of 21.6e-1, not the real fit; the 0.44 % gradient is the ring assumption used for every class (to confirm).');
writeFileSync(`${OUT}/centre_runoff.json`, JSON.stringify({ note: 'STEP 21.6e-3: runoff / runout / Ls_new / rotation axis per bend with e > 0 (ring method, delta 0.0044).', delta: DELTA, rows: out }, null, 0));
writeFileSync(`${OUT}/STEP_21_6E3_OUTPUT.txt`, L.join('\n') + '\n');
