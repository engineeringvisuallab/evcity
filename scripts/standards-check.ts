// STEP 1 check script (headless, pure math). Run: npx tsx scripts/standards-check.ts [ring-report.json]
// Prints criteria, class table, section offsets, the worked examples of HANDOFF_ROAD_DESIGN.md section 13 (PASS within 2 %),
// and the smoothness report of the reference ring shape taken from Roads.zip.
import { writeFileSync } from 'node:fs';
import { CRITERIA, DESIGN } from '../src/roads/standards/Criteria';
import { ROAD_CLASSES } from '../src/roads/standards/RoadClasses';
import { SECTION_M8, SECTION_M6, SECTION_M4, type Section } from '../src/roads/standards/SectionTable';
import * as K from '../src/roads/standards/Checks';
import { REF_RING } from '../src/roads/reference/RefShapes';

let fails = 0;
const line = (s = '') => console.log(s);
function expect(label: string, got: number, want: number, tol = 0.02): void {
  const ok = Math.abs(got - want) <= Math.abs(want) * tol;
  if (!ok) fails++;
  line(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} got ${got.toFixed(3).padStart(10)}   expected ${want}`);
}

line('=== 1.1 CRITERIA ===');
line(`  emax ${CRITERIA.emax}, tPR ${CRITERIA.tPR} s, aBrake ${CRITERIA.aBrake}, aDecel ${CRITERIA.aDecel}, aAccel ${CRITERIA.aAccel}, weave ${CRITERIA.weaveMin}/${CRITERIA.weaveDesirable} m, ramp max grade ${CRITERIA.rampMaxGrade}`);
line('  friction f(V): ' + CRITERIA.f.map(([v, f]) => `${v}:${f}`).join('  '));
line(`  DESIGN: side ${DESIGN.driveSide}, lane ${DESIGN.laneWidth} m, crown ${DESIGN.crown}, C ${DESIGN.comfortC}, radius margin ${DESIGN.radiusMargin}, ring V ${DESIGN.ringSpeed}, K ${DESIGN.K}, D ${DESIGN.D}`);
line('  Rmin by speed: ' + [120, 100, 80, 60, 50, 40, 30, 20].map((v) => `V${v}=${K.minRadius(v).toFixed(0)} m`).join('  '));

line('\n=== 1.2 ROAD CLASSES ===');
for (const c of ROAD_CLASSES) line(`  ${c.id.padEnd(4)} ${c.name.padEnd(28)} lanes/dir ${c.lanesPerDir.join('-').padEnd(4)} V ${c.speed.join('-').padEnd(8)} ${c.access}; median: ${c.median}`);

line('\n=== 1.3 CROSS-SECTION (one side, from the centreline) ===');
const printSection = (s: Section) => {
  line(`  ${s.id}: pavement edge ${s.pavementEdge.toFixed(1)} m, right-of-way edge ${s.rowHalf.toFixed(1)} m (ROW ${(2 * s.rowHalf).toFixed(0)} m)`);
  for (const e of s.elements) line(`    ${e.from.toFixed(2).padStart(6)} - ${e.to.toFixed(2).padStart(6)}  ${e.width.toFixed(2).padStart(5)}  ${e.name}${e.note ? '  (' + e.note + ')' : ''}`);
};
[SECTION_M8, SECTION_M6, SECTION_M4].forEach(printSection);

line('\n=== 1.4 WORKED EXAMPLES (section 13), PASS = within 2 % ===');
line(' Min radius table (section 3.2)');
([[120, 665], [100, 395], [80, 230], [60, 113], [50, 73], [40, 41], [30, 20]] as const).forEach(([v, r]) => expect(`Rmin V${v}`, K.minRadius(v), r));
line(' Example 1: ring R 2000 m, V100');
expect('Rmin V100', K.minRadius(100), 394);
expect('margin R/Rmin', 2000 / K.minRadius(100), 5.1);
expect('needed e + f', K.superelevation(100, 2000).ePlusF, 0.0394);
line(`  ${K.superelevation(100, 2000).keepCrown ? 'PASS' : 'FAIL'}  keeps normal crown (e needed = ${K.superelevation(100, 2000).eNeeded})`);
if (!K.superelevation(100, 2000).keepCrown) fails++;
expect('heading change per 100 m (deg)', (100 / 2000) * (180 / Math.PI), 2.9);
expect('circle length 2 pi R (m)', 2 * Math.PI * 2000, 12570, 0.005);
line(' Example 2: spiral V120, R1500, C0.6');
expect('comfort formula Ls', (0.0214 * 120 ** 3) / (1500 * 0.6), 41);
expect('2-second rule', 120 / 1.8, 67);
expect('Ls used (rounded up)', K.spiralLength(120, 1500, 0.6), 70);
line(' Example 3: stopping sight distance');
expect('SSD V120', K.ssd(120), 247);
expect('SSD V100', K.ssd(100), 183);
expect('SSD V80', K.ssd(80), 128);
line(' Example 4: vertical curve K');
expect('crest K V100', K.minVerticalK(100).crest, 51);
expect('crest L = K A, A 3 %', K.minVerticalK(100).crest * 3, 153);
expect('sag K V100', K.minVerticalK(100).sag, 44);
expect('crest K V120', K.minVerticalK(120).crest, 93);
line(' Example 5: exit and entry lanes, V100 -> ramp V50');
expect('exit deceleration lane (m)', K.decelLength(100, 50), 116);
expect('exit taper 1:25 (m)', K.exitTaperLength(), 90);
expect('entry acceleration lane (m)', K.accelLength(100, 50), 241);
expect('entry taper 1:50 (m)', K.entryTaperLength(), 183);
line(' Example 6: ramp radii');
expect('loop ramp V40 (m)', K.minRadius(40), 41);
expect('semi-direct ramp V60 (m)', K.minRadius(60), 113);
line(' Example 7: lane-drop taper');
expect('V100 (m)', K.laneDropTaper(100), 226);
expect('V60 (m)', K.laneDropTaper(60), 85);
line(' Example 8: lane balance');
expect('4 continuing + 2-lane exit -> lanes before', K.laneBalance(4, 2), 5);
line(' Example 9: lanes from demand, AADT 120 000');
expect('lanes per direction (ring)', K.lanesFromDemand(120000, DESIGN.capacity.motorway).lanes, 4);
expect('exact value', K.lanesFromDemand(120000, DESIGN.capacity.motorway).exact, 4.0);
expect('branch AADT 80 000 -> lanes', K.lanesFromDemand(80000, DESIGN.capacity.motorway).lanes, 3);
expect('outer link AADT 40 000 -> lanes', K.lanesFromDemand(40000, DESIGN.capacity.motorway).lanes, 2);
line(' Example 10 (hill, only the radius here; widening and grade compensation come in Step 7H)');
expect('hairpin Rmin V30 (m)', K.minRadius(30), 19.7);

line('\n=== Reference ring shape from Roads.zip (input of Step 2.2), V = ' + DESIGN.ringSpeed + ' ===');
const ds = 5;
const s = K.resample(REF_RING, ds, true);
const rep = K.smoothness(s, ds, DESIGN.ringSpeed);
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < REF_RING.length; i += 2) { minX = Math.min(minX, REF_RING[i]); maxX = Math.max(maxX, REF_RING[i]); minZ = Math.min(minZ, REF_RING[i + 1]); maxZ = Math.max(maxZ, REF_RING[i + 1]); }
line(`  raw points ${REF_RING.length / 2}, resampled every ${ds} m: ${rep.samples}, length ${(rep.length / 1000).toFixed(2)} km, box ${(maxX - minX).toFixed(0)} x ${(maxZ - minZ).toFixed(0)} m`);
line(`  max heading step ${rep.maxHeadingStepDeg.toFixed(2)} deg per ${ds} m, kinks (> ${DESIGN.kinkMaxDeg} deg change of step) ${rep.kinkCount}`);
line(`  min radius (200 m arms) ${rep.minR.toFixed(0)} m at station ${rep.minRStation.toFixed(0)} m`);
for (const lim of rep.limits) {
  const segs = rep.low[lim];
  line(`  below ${lim.toFixed(0)} m: ${segs.length} places, ${segs.reduce((a, g) => a + (g.s1 - g.s0 + ds), 0)} m in total`);
  for (const g of segs) line(`     station ${g.s0.toFixed(0).padStart(6)} - ${g.s1.toFixed(0).padStart(6)}   min R ${g.minR.toFixed(0)} m`);
}
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify({ ds, samples: Array.from(s), report: rep }));
line(`\n${fails === 0 ? 'ALL WORKED EXAMPLES PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
