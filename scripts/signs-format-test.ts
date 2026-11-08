// ROAD SIGNS Step 1: headless test of the distance / Bangla-digit text helpers. Run: npx tsx scripts/signs-format-test.ts
import { fmtKm, kmEn, kmBn, toBnDigits } from '../src/signs/SignFormat';
let fails = 0;
const eq = (a: string, b: string, msg: string) => { const ok = a === b; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg + ' -> ' + a + (ok ? '' : ' (want ' + b + ')')); };
eq(fmtKm(0.04), '0.1', 'tiny never 0.0');
eq(fmtKm(0.4), '0.4', '0.4');
eq(fmtKm(7.46), '7.5', '7.46 -> 7.5');
eq(fmtKm(9.96), '10', '9.96 rounds up to a whole 10');
eq(fmtKm(12.4), '12', '12.4 -> 12');
eq(fmtKm(47.6), '48', '47.6 -> 48');
eq(kmEn(7.5), '7.5 km', 'english label');
eq(kmBn(12), '১২ কিমি', 'bangla label');
eq(toBnDigits('0.8'), '০.৮', 'bangla digits');
console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
