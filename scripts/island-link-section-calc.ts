// STEP 17.1b (headless, pure numbers): CALCULATION SHEET of the island link M6-1: cross-section, design speeds, lane ladder 8 -> 6 at the ring S node.
// Reads only the standards (SectionTable, Criteria, interchange/Standards) and the J1-S arm centreline. Changes nothing.
// Run: npx tsx scripts/island-link-section-calc.ts <out-dir>     writes island_link_section.json (for the picture) and prints the sheet.
import { writeFileSync, mkdirSync } from 'node:fs';
import { SECTION_M6, SECTION_M8 } from '../src/roads/standards/SectionTable';
import { DESIGN } from '../src/roads/standards/Criteria';
import { CRITERIA, minRadius, stoppingSight, decelLength, accelLength, crestK, speedChangeLength } from '../src/interchange/Standards';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2), f0 = (v: number) => v.toFixed(0);
let pass = 0, fail = 0;
const chk = (name: string, ok: boolean, info: string) => { if (ok) pass++; else fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   ${info}`); };
const W = DESIGN.laneWidth;
console.log(`ISLAND LINK M6-1  CALCULATION SHEET (Step 17.1b)   lane width ${W} m, drive side ${DESIGN.driveSide.toUpperCase()} (Bangladesh), all numbers from the project standards`);

// ---- 1. cross-section
console.log('\n1. CROSS-SECTION M6 (3 + 3 lanes), distances from the centreline, ONE side, compared with M8');
console.log('   element                                   M6 from..to (m)     M8 from..to (m)');
for (let i = 0; i < SECTION_M6.elements.length; i++) {
  const a = SECTION_M6.elements[i], b = SECTION_M8.elements[i];
  console.log(`   ${a.name.padEnd(40)} ${f2(a.from).padStart(6)} .. ${f2(a.to).padStart(6)}      ${f2(b.from).padStart(6)} .. ${f2(b.to).padStart(6)}`);
}
const pe6 = SECTION_M6.pavementEdge, pe8 = SECTION_M8.pavementEdge;
const carriage = 2 * pe6, barrier = SECTION_M6.elements.find((e) => e.kind === 'barrier')!.width;
const deckClear = 2 * pe6, deckTotal = 2 * (pe6 + barrier);
console.log(`   pavement edge M6 ${f2(pe6)} m (M8 ${f2(pe8)} m), ROW half M6 ${f2(SECTION_M6.rowHalf)} m (M8 ${f2(SECTION_M8.rowHalf)} m), whole ROW ${f1(2 * SECTION_M6.rowHalf)} m`);
console.log(`   paved width between the outer shoulder edges ${f2(carriage)} m (incl. median 6 m); bridge deck between parapet faces ${f2(deckClear)} m, with the two barriers ${f2(deckTotal)} m (cable zone, pylon and median structure NOT included: 18.2)`);
console.log(`   cross fall: crown ${DESIGN.crown * 100} % each carriageway, shoulder ${DESIGN.shoulderSlope * 100} %`);

// ---- 2. design speeds, radii, sight, grades
console.log('\n2. DESIGN SPEED PER STRETCH (PROPOSAL, confirm) and what it gives');
const stretches = [
  { name: 'land, ring node to the shore (s 0 - about 550)', V: 100 },
  { name: 'strait bridge and approaches (s about 550 - 850, final length in 17.1e)', V: 80 },
  { name: 'island part up to the island centre node (s about 850 - 1768)', V: 80 },
];
console.log('   stretch                                                                V     Rmin   1.5 x Rmin   SSD     K crest   max grade');
for (const s of stretches) {
  const R = minRadius(s.V);
  console.log(`   ${s.name.padEnd(70)} ${String(s.V).padStart(3)}  ${f0(R).padStart(6)} m  ${f0(R * DESIGN.radiusMargin).padStart(7)} m  ${f0(stoppingSight(s.V)).padStart(4)} m  ${f1(crestK(s.V)).padStart(6)}   ${DESIGN.maxGrade.motorway * 100} % (${DESIGN.maxGrade.motorwayDesirable * 100} % desirable)`);
}
console.log(`   speed step 100 -> 80 at the shore: decel length ${f0(speedChangeLength(100, 80, CRITERIA.aDecel))} m (a = ${CRITERIA.aDecel} m/s2), done on the straight before the bridge, not on the bridge`);
console.log('   NOTE (user 2026-11-14): the bridge is to be a little HIGHER than a normal low bridge. How high is decided in 17.1d (grade <= 4 % and the length of the approach viaducts depend on it).');

// ---- 3. lane ladder 8 -> 6 at the ring S node
console.log('\n3. LANE LADDER 8 -> 6 AT THE RING S NODE (4-leg interchange, D17-1). Per direction: arm / ring = 4 lanes, island link = 3 lanes');
const Nm8 = SECTION_M8.lanesPerDir, Nm6 = SECTION_M6.lanesPerDir;
const exitLanes = 2;
const nBeforeS = Nm6 + exitLanes - 1; // southbound, arm -> island: 3 continue + 2-lane exit to the ring
const nAfterN = Nm6 + exitLanes - 1;  // northbound, island -> arm: 3 coming + 2-lane entry from the ring
console.log(`   southbound (arm -> island): N_before = N_continue + N_exit - 1 = ${Nm6} + ${exitLanes} - 1 = ${nBeforeS}  (arm has ${Nm8}): the dropped lane IS the exit lane, no taper, no merge`);
console.log(`   northbound (island -> arm): N_after  = N_coming  + N_entry - 1 = ${Nm6} + ${exitLanes} - 1 = ${nAfterN}  (arm has ${Nm8}): the gained lane is the entry lane (lane gain after the merge)`);
const taper = DESIGN.exitTaper * W, dec = decelLength(100, 60), taperIn = DESIGN.entryTaper * W, acc = accelLength(100, 60);
console.log(`   exit zone on the arm, V100 -> ramp 60: taper 1:${DESIGN.exitTaper} = ${f1(taper)} m + deceleration ${f1(dec)} m = ${f0(taper + dec)} m before the gore nose (ramp speed 60 is a PROPOSAL, 9.2 / 17.4c fixes it)`);
console.log(`   entry zone, ramp 60 -> 0.85 x 100: acceleration ${f1(acc)} m + taper 1:${DESIGN.entryTaper} = ${f1(taperIn)} m = ${f0(acc + taperIn)} m`);
console.log(`   fallback if there is no exit at all (only if flows fall): taper L = 0.62 W V = ${f0(0.62 * W * 100)} m, designed x 1.5 = ${f0(0.62 * W * 100 * 1.5)} m, on a straight, never on a bridge`);
console.log(`   weave / spacing to the next ramp: ${CRITERIA.weaveMin} m minimum, ${CRITERIA.weaveDesirable} m desirable (the island link needs a FIRST STRAIGHT of at least ${CRITERIA.weaveDesirable} m after the node: requirement for 17.1c)`);

// ---- 4. demand check (rule 3.13)
console.log('\n4. DEMAND CHECK (3.13): lanes per direction = AADT x K x D / capacity, K ' + DESIGN.K + ', D ' + DESIGN.D + ', capacity ' + DESIGN.capacity.motorway + ' pcu/h/lane');
const c = DESIGN.capacity.motorway;
const lanesFor = (aadt: number) => (aadt * DESIGN.K * DESIGN.D) / c;
const lo = Math.ceil(2.0 * c / (DESIGN.K * DESIGN.D)) , hi = Math.floor(3.0 * c / (DESIGN.K * DESIGN.D));
console.log(`   3 lanes per direction carry AADT from about ${lo} to ${hi}; the handoff class 'branch to an important area' 80 000 AADT gives ${f2(lanesFor(80000))} -> 3 lanes. The real AADT of the link comes from the demand step 17.4a (island zone weights are not defined yet).`);

// ---- 5. J1-S arm end: room for the exit zone
const arm = J1_ARM_DATA.find((a) => a.name === 'J1-S')!;
const n = arm.pts.length;
const hd = (i: number) => Math.atan2(arm.pts[i + 1][1] - arm.pts[i][1], arm.pts[i + 1][0] - arm.pts[i][0]);
const curv: number[] = [], st: number[] = [];
for (let i = 1; i < n - 1; i++) { let dh = hd(i) - hd(i - 1); dh = ((dh + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; const ds = Math.hypot(arm.pts[i][0] - arm.pts[i - 1][0], arm.pts[i][1] - arm.pts[i - 1][1]); curv.push(Math.abs(dh / ds)); st.push(arm.s[i]); }
const endS = arm.s[n - 1];
let straightLen = 0, gentleLen = 0;
for (let k = curv.length - 1; k >= 0 && curv[k] < 1 / 20000; k--) straightLen = endS - st[k];
for (let k = curv.length - 1; k >= 0 && curv[k] < 1 / 1000; k--) gentleLen = endS - st[k];
console.log(`\n5. ROOM ON THE J1-S ARM BEFORE THE RING NODE (arm centreline from J1ArmData, T at s ${f0(endS)})`);
console.log(`   straight (R > 20 000 m) at the end: ${f0(straightLen)} m; straight or gentle arc with R >= 1000 m at the end: ${f0(gentleLen)} m (the arm has R about 1370 - 1980 m on s 2100-2700)`);
const need = taper + dec;
chk('exit zone (taper + deceleration) fits on the stretch before the node with R >= 1000 m (MY threshold, not a handoff rule; the handoff only forbids a curve inside the gore)', gentleLen >= need, `${f0(gentleLen)} m available, ${f0(need)} m needed`);
chk('lane balance southbound 4 = 3 + 2 - 1', Nm8 === nBeforeS, `${Nm8} = ${nBeforeS}`);
chk('lane balance northbound 4 = 3 + 2 - 1', Nm8 === nAfterN, `${Nm8} = ${nAfterN}`);
// 2026-11-15 (17.1g-a, user: M6 looked as wide as M8): M6 is a V80 section, slimmer than M8 in the lane (3.5 m), the median (4 m) and the shoulders (1.0 / 2.5 m), not only one lane less
chk('M6 is one lane less than M8 per side AND slimmer (V80: lane 3.5, median 4, shoulders 1.0 / 2.5)', Math.abs(pe6 - (SECTION_M6.elements[0].to + 1.0 + 3 * 3.5 + 2.5)) < 1e-9 && pe8 - pe6 > W, `${f2(pe8)} - ${f2(pe6)} = ${f2(pe8 - pe6)} m`);
chk('lane ladder step is one (8 -> 6)', 2 * Nm8 - 2 * Nm6 === 2, `${2 * Nm8} -> ${2 * Nm6} lanes`);
chk('ROW half = sum of the elements', Math.abs(SECTION_M6.rowHalf - SECTION_M6.elements[SECTION_M6.elements.length - 1].to) < 1e-9, `${f2(SECTION_M6.rowHalf)} m`);
chk('demand class 80 000 AADT needs 3 lanes per direction', Math.ceil(lanesFor(80000)) === Nm6, `${f2(lanesFor(80000))} -> ${Math.ceil(lanesFor(80000))}`);
chk('crest K of V100 equals the K used for the J1 arm profiles (50.9), so the island link uses the same standard', Math.abs(crestK(100) - 50.9) < 0.1, `K ${f1(crestK(100))}, SSD ${f0(stoppingSight(100))} m`);
console.log(`\n  ${pass} PASS, ${fail} FAIL`);
console.log(`  OPEN (not a check): the strict straight before the node is only ${f0(straightLen)} m, shorter than the exit zone ${f0(need)} m; the exit lane would run on the gentle R >= 1370 m arc and the gore nose on the last straight. Alignment rule 8 (no curve inside an interchange gore) forbids a curve INSIDE the gore only. Decide in 9.2 / 17.4c, or ask for a straighter last 400 m of the J1-S arm (a change of the finished arm, only with the user's OK).`);

writeFileSync(`${out}/island_link_section.json`, JSON.stringify({ lane: W, m6: SECTION_M6, m8: SECTION_M8, deckClear, deckTotal, taper, dec, acc, taperIn, straightLen, gentleLen, endS }));
console.log(`\nwrote ${out}/island_link_section.json`);
