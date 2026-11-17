// STEP 21.6e-4 FREE STRAIGHT BETWEEN BENDS + TANGENT RUNOUT + BEND LENGTH vs 2 Ls_new (headless; changes NO src file, writes only docs/).
// Run: node --experimental-strip-types scripts/centre-straights.ts docs     (or: npx tsx scripts/centre-straights.ts docs)
// Reads dir/centre_curves.json (21.6e-1), dir/centre_super.json (21.6e-2), dir/centre_runoff.json (21.6e-3); writes dir/centre_straights.json and dir/STEP_21_6E4_OUTPUT.txt.
// RULES (handoff 3.2): straight between two bends >= 6 V (same direction) or 2 V (reverse), V in km/h, result in m. Tangent runout: a rotated bend that is NOT
// "in spiral" (21.6e-3) needs its Lt on the tangent; two neighbours must fit Lt_a + Lt_b into the straight between them (conservative, no overlap of runouts).
// Bend length: a real bend is spiral + arc + spiral, so the measured length must be >= 2 Ls_new (else the real fit needs a bigger R or one spiral pair only).
// The straight is measured between the END of one measured bend and the START of the next (the measured bends include their spirals).
// IMPORTANT: R, Ls and bend positions are the MEASURED ones of 21.6e-1 (wiggles of the drawn polyline included): a FAIL here means "the real fit must change this
// part of the line" (straighten a wiggle, take a bigger R, merge two bends), not that the road is wrong.
import { readFileSync, writeFileSync } from 'fs';

const OUT = process.argv[2] ?? 'docs';
const f0 = (v: number): string => v.toFixed(0);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const CU = JSON.parse(readFileSync(`${OUT}/centre_curves.json`, 'utf8'));
const SU = JSON.parse(readFileSync(`${OUT}/centre_super.json`, 'utf8')).rows as any[];
const RO = JSON.parse(readFileSync(`${OUT}/centre_runoff.json`, 'utf8')).rows as any[];
const key = (id: string, n: number): string => `${id}#${n}`;
const sup = new Map<string, any>(SU.map((r) => [key(r.id, r.n), r])), ro = new Map<string, any>(RO.map((r) => [key(r.id, r.n), r]));

interface Pair { id: string; cls: string; V: number; a: number; b: number; dir: 'same' | 'reverse'; straight: number; need: number; ltA: number; ltB: number; okRule: boolean; okRunout: boolean; rotated: boolean }
interface Bend { id: string; cls: string; n: number; len: number; Lsnew: number; e: number; ok2Ls: boolean }
const pairs: Pair[] = [], bends: Bend[] = [];
for (const ln of CU.lines) {
  const V: number = ln.V, cs: any[] = ln.curves;
  for (let i = 0; i < cs.length; i++) {
    const q = cs[i], s = sup.get(key(ln.id, q.n)), r = ro.get(key(ln.id, q.n)), e = s?.e ?? 0, Lsnew = r?.LsNew ?? q.Ls;
    bends.push({ id: ln.id, cls: ln.cls, n: q.n, len: q.len, Lsnew, e, ok2Ls: q.len >= 2 * Lsnew });
    if (i + 1 >= cs.length) continue;
    const p = cs[i + 1], rb = ro.get(key(ln.id, p.n)), dir = q.dirn === p.dirn ? 'same' : 'reverse', straight = p.s0 - q.s1, need = (dir === 'same' ? 6 : 2) * V;
    const ltA = r && !r.inSpiral ? r.Lt : 0, ltB = rb && !rb.inSpiral ? rb.Lt : 0;
    pairs.push({ id: ln.id, cls: ln.cls, V, a: q.n, b: p.n, dir, straight, need, ltA, ltB, okRule: straight >= need, okRunout: straight >= ltA + ltB, rotated: e > 0 || (sup.get(key(ln.id, p.n))?.e ?? 0) > 0 });
  }
}

pr('STEP 21.6e-4 FREE STRAIGHT + TANGENT RUNOUT + BEND LENGTH (measured bends of 21.6e-1; FAIL = the real fit must change that part of the line, not a road fault)');
pr(); pr('1. PAIRS OF NEIGHBOURING BENDS ON THE SAME LINE (rule 6 V same direction / 2 V reverse; "rotated" = at least one of the two has e > 0)');
pr('   cls    V  pairs  same  reverse  under rule  rotated pairs  rotated under rule  runout no fit');
for (const c of ['8', '6', '4', '2', 'C', 'L']) {
  const p = pairs.filter((x) => x.cls === c); if (!p.length) continue; const rot = p.filter((x) => x.rotated);
  pr(`   ${c.padEnd(3)}  ${String(p[0].V).padStart(3)}  ${String(p.length).padStart(5)}  ${String(p.filter((x) => x.dir === 'same').length).padStart(4)}  ${String(p.filter((x) => x.dir === 'reverse').length).padStart(7)}  ${String(p.filter((x) => !x.okRule).length).padStart(10)}  ${String(rot.length).padStart(13)}  ${String(rot.filter((x) => !x.okRule).length).padStart(18)}  ${String(rot.filter((x) => !x.okRunout).length).padStart(13)}`);
}
pr(); pr('2. BENDS WITH e > 0: LENGTH vs 2 Ls_new (a real bend is spiral + arc + spiral)');
pr('   cls  bends with e > 0  length >= 2 Ls_new  too short');
for (const c of ['8', '6', '4', '2']) { const b = bends.filter((x) => x.cls === c && x.e > 0); pr(`   ${c.padEnd(3)}  ${String(b.length).padStart(15)}  ${String(b.filter((x) => x.ok2Ls).length).padStart(18)}  ${String(b.filter((x) => !x.ok2Ls).length).padStart(9)}`); }
pr(); pr('3. THE 20 ROTATED PAIRS THAT MISS THE 6 V / 2 V RULE BY MOST (line, bends, direction, straight / need, V)');
for (const x of pairs.filter((y) => y.rotated && !y.okRule).sort((a, b) => b.need - b.straight - (a.need - a.straight)).slice(0, 20)) pr(`   ${x.id.padEnd(7)} #${String(x.a).padEnd(2)} -> #${String(x.b).padEnd(2)} ${x.dir.padEnd(7)} straight ${f0(x.straight).padStart(4)} m  need ${String(x.need).padStart(3)} m  short ${f0(x.need - x.straight).padStart(4)} m  V${x.V}`);
pr(); pr('4. CHECKS (these test the table, not the design)');
chk(pairs.every((x) => x.straight > -0.01), 'bends on a line do not overlap (every straight >= 0)');
chk(pairs.every((x) => x.need === (x.dir === 'same' ? 6 : 2) * x.V), 'needed straight is 6 V (same direction) or 2 V (reverse)');
chk(bends.filter((x) => x.e > 0).length === RO.length, `every bend with e > 0 is in the runoff table (${RO.length})`);
chk(pairs.length === CU.lines.reduce((a: number, l: any) => a + Math.max(0, l.curves.length - 1), 0), `one pair per neighbouring bends (${pairs.length})`);
chk(pairs.every((x) => (x.okRunout || x.straight < x.ltA + x.ltB)), 'runout test is consistent with the straight and the two Lt values');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
const nRot = pairs.filter((x) => x.rotated).length, nRotFail = pairs.filter((x) => x.rotated && !x.okRule).length;
pr(`   FINDING: ${nRotFail} of ${nRot} rotated pairs and ${bends.filter((x) => x.e > 0 && !x.ok2Ls).length} of ${bends.filter((x) => x.e > 0).length} rotated bends do not meet the rules on the MEASURED line; the real fit (21.6 build) must straighten / merge / enlarge them.`);
pr('   NOT RUN: tsc, npm run build, the game. Nothing in src changed by this script.');
writeFileSync(`${OUT}/centre_straights.json`, JSON.stringify({ note: 'STEP 21.6e-4: free straights between measured bends, tangent runout fit, bend length vs 2 Ls_new.', pairs, bends: bends.filter((b) => b.e > 0) }, null, 0));
writeFileSync(`${OUT}/STEP_21_6E4_OUTPUT.txt`, L.join('\n') + '\n');
