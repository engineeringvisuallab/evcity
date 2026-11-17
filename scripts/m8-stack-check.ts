// STEP 9.2 J1 stack check: ramp radius, grade, and vertical clearance at every crossing. Writes docs/m8_stack_plan.json for the plan picture.
// Run: npx tsx scripts/m8-stack-check.ts
import { writeFileSync } from 'node:fs';
import { gores, laneAudit } from '../src/interchange/m8/StackLanes';
import { buildStack, clearanceConflicts, medianConflicts, DELTA_F, SHIFT_LEN, terminalLengths, goreEvents, minGoreSpacing, structureTakeoff, U_FULL, rampMaxGrade, rampMinRadius, rampRminLimit } from '../src/interchange/m8/StackGeometry';

const ramps = buildStack();
let fails = 0;
for (const r of ramps) {
  const R = rampMinRadius(r), g = rampMaxGrade(r), lim = rampRminLimit(r);
  const okR = R >= lim - 2, okG = g <= 0.05 + 1e-3;
  if (!okR || !okG) fails++;
  console.log(`  ${okR && okG ? 'PASS' : 'FAIL'}  ${r.id} ${r.shape.padEnd(5)} len ${r.length.toFixed(0).padStart(4)} m  Rmin ${R.toFixed(0)} (limit ${lim.toFixed(0)})  max grade ${(g * 100).toFixed(2)} %  y ${r.ys[0].toFixed(1)} -> ${r.ys[r.ys.length - 1].toFixed(1)}`);
}
const cf = clearanceConflicts(ramps);
for (const c of cf) console.log(`  CONFLICT ${c.a} x ${c.b} at (${c.u.toFixed(0)}, ${c.v.toFixed(0)}) heights ${c.ya.toFixed(1)} / ${c.yb.toFixed(1)}  gap ${c.gap.toFixed(1)} m < 6.9`);
console.log(`  clearance: ${cf.length} conflicts`);
const mc = medianConflicts(ramps);
for (const c of mc.slice(0, 12)) console.log(`  MEDIAN ${c.ramp} too close to ${c.road} at (${c.u.toFixed(0)}, ${c.v.toFixed(0)}) d ${c.d.toFixed(1)} m < 13.5`);
console.log(`  median opening: spread ${DELTA_F} m each carriageway, full to ${U_FULL} m, shift taper ${SHIFT_LEN.toFixed(0)} m; ${mc.length} ramp points too close to a pavement`);
if (mc.length) fails++;
const tl = terminalLengths();
const okT = tl.exitHave >= tl.exitNeed && tl.entryHave >= tl.entryNeed;
console.log(`  ${okT ? 'PASS' : 'FAIL'}  terminals: exit run ${tl.exitHave} m (need ${tl.exitNeed.toFixed(0)} = decel + taper), entry tail ${tl.entryHave} m (need ${tl.entryNeed.toFixed(0)} = accel + taper)`);
if (!okT) fails++;
const gn = gores(ramps);
for (const g of gn) { if (!g.ok) fails++; console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  gore nose ${g.ramp} ${g.kind.padEnd(5)} on ${g.carriageway}: ${g.have.toFixed(0)} m run (need ${g.need.toFixed(0)}) at (${g.u.toFixed(0)}, ${g.v.toFixed(0)})`); }
const la = laneAudit(ramps);
if (!la.ok) fails++;
console.log(`  ${la.ok ? 'PASS' : 'FAIL'}  lane balance: exit needs ${la.upstreamNeed} lanes upstream, has ${la.upstreamHave}; entry leaves ${la.downstreamLanes} lanes, lane drop needs ${la.dropNeed.toFixed(0)} m, available ${la.dropHave.toFixed(0)} m`);
const gs = minGoreSpacing(goreEvents(ramps));
const okG = gs.min >= gs.need;
console.log(`  ${okG ? 'PASS' : 'FAIL'}  gore spacing: min ${gs.min.toFixed(0)} m (${gs.a} -> ${gs.b}), need >= SSD ${gs.need.toFixed(0)} m`);
if (!okG) fails++;
const tk = structureTakeoff(ramps);
let tot = { v: 0, e: 0, p: 0, a: 0, w: 0 };
for (const t of tk) { tot = { v: tot.v + t.viaduct, e: tot.e + t.embankment, p: tot.p + t.piers, a: tot.a + t.abutments, w: tot.w + t.wallLen }; console.log(`  take-off ${t.id}: ground ${t.atGrade.toFixed(0)} m, embankment ${t.embankment.toFixed(0)} m (walls ${t.wallLen.toFixed(0)} m), viaduct ${t.viaduct.toFixed(0)} m, piers ${t.piers} (max ${t.maxPierH.toFixed(1)} m), abutments ${t.abutments}`); }
console.log(`  take-off total: viaduct ${tot.v.toFixed(0)} m, embankment ${tot.e.toFixed(0)} m, wall ${tot.w.toFixed(0)} m, piers ${tot.p}, abutments ${tot.a}`);
writeFileSync('docs/m8_stack_plan.json', JSON.stringify(ramps.map((r) => ({ id: r.id, shape: r.shape, u: r.pts.map((p) => +p.u.toFixed(1)), v: r.pts.map((p) => +p.v.toFixed(1)), y: r.ys.map((y) => +y.toFixed(2)) }))));
console.log(fails || cf.length ? `FAILED radius/grade ${fails}, clearance ${cf.length}` : 'ALL PASS');
