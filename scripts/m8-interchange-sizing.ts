// STEP 9.1 / 9.2-sizing check: the four M8 x M8 interchange designs (stack, turbine, cloverleaf with C-D, hybrid). Pure math, prints the calculation sheet.
// Run: npx tsx scripts/m8-interchange-sizing.ts
import { M8_DESIGNS, summarise, LEVEL_RISE } from '../src/interchange/m8/M8Designs';

let fails = 0;
const ok = (label: string, pass: boolean, info = '') => { if (!pass) fails++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${info}`); };
const f0 = (v: number) => v.toFixed(0);

for (const d of M8_DESIGNS) {
  const s = summarise(d);
  console.log(`\n=== ${d.name}  (${d.levels} levels, through ${d.through} pcu/h/dir) ===`);
  console.log(`  ${d.why}`);
  for (const r of s.ramps) {
    console.log(`  ${r.d.turn.padEnd(5)} ${r.d.shape.padEnd(7)} V${r.d.V} R${r.d.R} (Rmin ${f0(r.rminV)}, 1.5x ${f0(r.limit)})  flow ${r.d.flow}  ${r.lanes} lane${r.lanes > 1 ? 's' : ''}  level ${r.d.level}${r.d.viaCD ? '  via C-D' : ''}`);
    console.log(`        spiral ${r.spiral} m, exit: decel ${f0(r.decel)} + taper ${f0(r.exitTaper)} m, entry: accel ${f0(r.accel)} + taper ${f0(r.entryTaper)} m, motorway lanes before exit ${r.lanesBeforeExit}`);
  }
  console.log(`  top deck ${s.topRise.toFixed(1)} m above ground (${d.levels - 1} x ${LEVEL_RISE} m); upper motorway must climb ${f0(s.upperRun)} m each side at 4 %; ramp climb ${f0(s.rampRun)} m at 5 %; exit+entry length ${f0(s.weaveFreeLength)} m`);
  ok(`${d.kind}: every ramp radius >= 1.5 x Rmin`, s.ramps.every((r) => r.radiusOk));
  ok(`${d.kind}: no ramp flow above lane capacity`, s.issues.every((i) => !i.includes('flow')));
  ok(`${d.kind}: lane balance consistent (exit lanes <= 2)`, s.ramps.every((r) => r.lanes <= 2));
}
// the cloverleaf needs its C-D roads: without them two loops on one road weave over about this length; show the number
console.log('\nNote: two loops on the same motorway side are about 2 x loop R + 2 x ramp-terminal length apart; below 300 m desirable weave, so C-D roads are used.');
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
