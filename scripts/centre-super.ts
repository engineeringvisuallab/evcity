// STEP 21.6e-2 SUPERELEVATION PER BEND (headless; changes NO src file, writes only docs/).
// Run: node --experimental-strip-types scripts/centre-super.ts docs     (or: npx tsx scripts/centre-super.ts docs)
// Reads dir/centre_curves.json (21.6e-1), writes dir/centre_super.json and dir/STEP_21_6E2_OUTPUT.txt.
// CROWN RULE (my choice, the user did not answer): Checks.superelevation(): eNeeded = V^2/(127 R) - f; eNeeded <= 0 -> KEEP the 2 % crown.
// Otherwise e = eNeeded rounded UP to 0.5 %, at least 2 % (the adverse crown is removed), at most 8 % (CRITERIA.emax).
// R below the class minimum (eNeeded > 8 %): e stays 8 % and the bend is flagged with the speed its R really allows (advisory speed).
// Runoff / runout lengths and the rotation axis are the next step (21.6e-3); nothing about them here.
import { readFileSync, writeFileSync } from 'fs';

const OUT = process.argv[2] ?? 'docs';
const EMAX = 0.08, CROWN = 0.02, STEP_E = 0.005;
const FT: number[][] = [[20, 0.35], [30, 0.28], [40, 0.23], [50, 0.19], [60, 0.17], [70, 0.15], [80, 0.14], [100, 0.12], [120, 0.09]];
const frictionAt = (V: number): number => { if (V <= FT[0][0]) return FT[0][1]; for (let i = 1; i < FT.length; i++) if (V <= FT[i][0]) return FT[i - 1][1] + ((FT[i][1] - FT[i - 1][1]) * (V - FT[i - 1][0])) / (FT[i][0] - FT[i - 1][0]); return FT[FT.length - 1][1]; };
const minRadius = (V: number): number => (V * V) / (127 * (EMAX + frictionAt(V)));
const speedOfRadius = (R: number): number => { let v = 10; while (v < 140 && minRadius(v + 1) <= R) v++; return v; };
const eNeeded = (V: number, R: number): number => Math.max(0, (V * V) / (127 * R) - frictionAt(V));
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const C = JSON.parse(readFileSync(`${OUT}/centre_curves.json`, 'utf8'));
interface Row { id: string; cls: string; V: number; n: number; s0: number; s1: number; dirn: string; R: number; Ls: number; eNeed: number; e: number; mode: 'crown' | 'rotate' | 'rotate-low' | 'MAX'; advV?: number }
const rows: Row[] = [];
for (const ln of C.lines) for (const q of ln.curves) {
  const en = eNeeded(ln.V, q.R); let e = 0, mode: Row['mode'] = 'crown', advV: number | undefined;
  if (en > 0) {
    e = Math.min(EMAX, Math.max(CROWN, Math.ceil(en / STEP_E - 1e-9) * STEP_E)); mode = en > EMAX ? 'MAX' : en < CROWN ? 'rotate-low' : 'rotate';
    if (en > EMAX) advV = speedOfRadius(q.R);
  }
  rows.push({ id: ln.id, cls: ln.cls, V: ln.V, n: q.n, s0: q.s0, s1: q.s1, dirn: q.dirn, R: q.R, Ls: q.Ls, eNeed: en, e, mode, advV });
}

pr('STEP 21.6e-2 SUPERELEVATION PER BEND (R of the measured bends of 21.6e-1; crown rule = Checks.superelevation; e rounded up to 0.5 %, min 2 %, max 8 %)');
pr(); pr('1. SUMMARY PER CLASS (crown = keep 2 % crown; low = e needed under 2 %, so e = 2 %; rotate = 2.5 .. 8 %; MAX = R under the class minimum, e = 8 % and an advisory speed)');
pr('   cls    V  bends  crown   low  rotate  MAX   e max used');
for (const c of ['8', '6', '4', '2', 'C', 'L']) {
  const r = rows.filter((x) => x.cls === c); if (!r.length) continue;
  pr(`   ${c.padEnd(3)}  ${String(r[0].V).padStart(3)}  ${String(r.length).padStart(5)}  ${String(r.filter((x) => x.mode === 'crown').length).padStart(5)}  ${String(r.filter((x) => x.mode === 'rotate-low').length).padStart(4)}  ${String(r.filter((x) => x.mode === 'rotate').length).padStart(6)}  ${String(r.filter((x) => x.mode === 'MAX').length).padStart(3)}   ${f1(Math.max(...r.map((x) => x.e)) * 100)} %`);
}
pr(); pr('2. BENDS WITH e = 8 % BECAUSE R < CLASS MINIMUM (advisory speed = largest speed with Rmin(V) <= R; the user decides: bigger R, lower speed, or accept)');
for (const x of rows.filter((y) => y.mode === 'MAX')) pr(`   ${x.id.padEnd(7)} #${String(x.n).padEnd(2)} s ${f0(x.s0).padStart(5)}-${f0(x.s1).padEnd(5)} R ${f0(x.R).padStart(4)}  design V ${x.V}  e needed ${f1(x.eNeed * 100).padStart(6)} %  advisory V ${x.advV} km/h`);
pr(); pr('3. BENDS WITH e > 2 % (by e, the table that 21.6e-3 runoff needs: counts per e value)');
const hist = new Map<number, number>(); for (const x of rows) if (x.e > 0) hist.set(x.e, (hist.get(x.e) ?? 0) + 1);
pr('   ' + [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([e, n]) => `${f1(e * 100)} %: ${n}`).join(', '));
pr(); pr('4. CHECKS (these test the table and the rule, not the design)');
chk(rows.every((x) => x.e <= EMAX + 1e-9), 'no bend has e above 8 %');
chk(rows.every((x) => (x.mode === 'crown') === (x.e === 0)), 'crown bends have e 0, all others e >= 2 %');
chk(rows.every((x) => x.e === 0 || x.e >= CROWN - 1e-9), 'every rotated bend has e of at least 2 %');
chk(rows.filter((x) => x.mode === 'rotate').every((x) => x.e + 1e-9 >= x.eNeed && x.e - x.eNeed < STEP_E + 1e-9), 'rotated e covers e needed, over by less than 0.5 %');
chk(rows.filter((x) => x.mode === 'MAX').every((x) => x.advV !== undefined && x.advV < x.V), 'every MAX bend has an advisory speed below the design speed');
chk(eNeeded(100, 2000) === 0 && Math.abs(eNeeded(80, 229) - 0.0801) < 0.001, 'worked values: V100 R2000 keeps the crown (handoff 13), V80 R229 needs e = 8.0 %');
chk(rows.length === C.lines.reduce((a: number, l: any) => a + l.curves.length, 0), `every bend of 21.6e-1 has a row (${rows.length})`);
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
pr('   NOT RUN: tsc, npm run build, the game. Nothing in src changed. NOT DONE: runoff / runout lengths, rotation axis, check Ls >= runoff (21.6e-3).');
pr('   LIMIT: R is the measured R of 21.6e-1 (blurred under R 40 m); small wiggles of the drawn line get a bigger R in the real fit, so their e here is on the safe side.');
writeFileSync(`${OUT}/centre_super.json`, JSON.stringify({ note: 'STEP 21.6e-2: e per measured bend. Rule: Checks.superelevation, e up to 0.5 %, min 2 %, max 8 %.', rows }, null, 0));
writeFileSync(`${OUT}/STEP_21_6E2_OUTPUT.txt`, L.join('\n') + '\n');
