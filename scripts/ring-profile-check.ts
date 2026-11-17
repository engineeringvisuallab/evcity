// STEP 5.1 check: RingProfile (height along the ring) matches the Step 3 grade line, is continuous across the closure and keeps the grade limit.
// Run: npx tsx scripts/ring-profile-check.ts
import { readFileSync } from 'node:fs';
import { buildAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { makeRingProfile } from '../src/roads/ring/RingProfile';

const al = buildAlignment([...RING_PIS]);
const prof = makeRingProfile(al.length);
let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail}`); };

const rows = readFileSync('docs/ring_profile.csv', 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',').map(Number));
let worstNode = 0;
for (const r of rows) worstNode = Math.max(worstNode, Math.abs(prof.yAt(r[0]) - r[2]));
check(worstNode < 1e-6, 'height at every 10 m node equals the CSV design height', `worst ${worstNode.toExponential(2)} m`);

let worstMid = 0, maxGrade = 0, maxJump = 0, prev = prof.yAt(0);
for (let s = 0.5; s <= al.length; s += 0.5) {
  const y = prof.yAt(s);
  maxJump = Math.max(maxJump, Math.abs(y - prev));
  prev = y;
}
for (const r of rows) { const mid = r[0] + 5; const lin = (prof.yAt(r[0]) + prof.yAt(r[0] + 10)) / 2; worstMid = Math.max(worstMid, Math.abs(prof.yAt(mid) - lin)); }
for (let s = 0; s < al.length; s += 1) maxGrade = Math.max(maxGrade, Math.abs(prof.gradeAt(s)));
check(maxJump < 0.04 + 1e-9, 'no height jump between 0.5 m samples (4 % grade x 0.5 m = 0.02)', `largest step ${maxJump.toFixed(4)} m`);
check(maxGrade <= 0.0405, 'grade stays within the 4 % hard limit', `max ${(maxGrade * 100).toFixed(3)} %`);
check(worstMid < 0.05, 'between nodes the curve stays close to the straight line (no overshoot)', `worst ${worstMid.toFixed(4)} m`);

const eps = 1e-3;
const dyClose = Math.abs(prof.yAt(al.length - eps) - prof.yAt(eps));
const dgClose = Math.abs(prof.gradeAt(al.length - eps) - prof.gradeAt(eps));
check(dyClose < 0.005, 'closure: height gap at the join', `${dyClose.toFixed(5)} m`);
check(dgClose < 0.002, 'closure: grade gap at the join', `${(dgClose * 100).toFixed(4)} %`);
check(Math.abs(prof.yAt(-100) - prof.yAt(al.length - 100)) < 1e-9, 'station wraps (negative and over-length)', 'ok');
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);
