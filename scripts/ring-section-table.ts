// STEP 4.1 (headless, pure math): prints the full cross-section of the ring (M8, table 3.5) from the left ROW edge to the right ROW edge, with checks.
// Run: npx tsx scripts/ring-section-table.ts [out.json]      (out.json is read by the picture script)
import { writeFileSync } from 'node:fs';
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { DESIGN } from '../src/roads/standards/Criteria';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { buildAlignment } from '../src/roads/alignment/PiAlignment';

let fails = 0;
const L = (s = '') => console.log(s);
const f = (v: number, d = 1) => v.toFixed(d);
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; L(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`); }

const length = buildAlignment([...RING_PIS]).length;
L(`=== 4.1 RING CROSS-SECTION (M8, ${S.lanesPerDir * 2} lanes), distances from the centreline in metres ===`);
L('\n  RIGHT side of the direction of travel (positive offset), left side is the same, mirrored (negative offset)');
L('   no  element                                      from     to   width   cross fall / note');
const fall: Record<string, string> = { median: 'kerb or barrier, planting or paved', 'shoulder-in': '4 % away from the median', lanes: '2 % away from the median', 'shoulder-out': '4 % away from the median', barrier: 'guardrail line', ditch: 'ditch 1.5 m wide, 0.5 m deep', 'clear-zone': 'slope 1:4 flat (1:3 max, 1:2 only with barrier)', 'row-strip': 'fence, planting, service road if used' };
S.elements.forEach((e, i) => L(`  ${String(i + 1).padStart(2)}  ${e.name.padEnd(42)} ${f(e.from).padStart(6)} ${f(e.to).padStart(6)} ${f(e.width).padStart(7)}   ${fall[e.kind] ?? ''}`));

const lanes = S.elements.find((e) => e.kind === 'lanes')!;
const med = S.elements.find((e) => e.kind === 'median')!;
const sIn = S.elements.find((e) => e.kind === 'shoulder-in')!;
const sOut = S.elements.find((e) => e.kind === 'shoulder-out')!;
const ditch = S.elements.find((e) => e.kind === 'ditch')!;
const cz = S.elements.find((e) => e.kind === 'clear-zone')!;

const carriageway = sIn.width + lanes.width + sOut.width; // one direction, shoulder to shoulder
const pavementTotal = 2 * S.pavementEdge; // edge to edge, median included
const formationHalf = ditch.to;
const dropEdge = sIn.width * 0.04 + lanes.width * 0.02 + sOut.width * 0.04;
L('\n=== Derived numbers (both sides together) ===');
L(`  carriageway of one direction (inner shoulder + ${S.lanesPerDir} lanes + outer shoulder): ${f(sIn.width)} + ${f(lanes.width)} + ${f(sOut.width)} = ${f(carriageway)} m`);
L(`  total width of the road between the two pavement edges (median 6.0 included): 2 x ${f(S.pavementEdge)} = ${f(pavementTotal)} m`);
L(`  paved width without the median: ${f(pavementTotal - 2 * med.width)} m`);
L(`  formation (road body) width, pavement + guardrail + ditch: 2 x ${f(formationHalf)} = ${f(2 * formationHalf)} m  (half ${f(formationHalf)} m is E_HALF of the profile tool)`);
L(`  clear zone beyond the ditch: ${f(cz.from)} to ${f(cz.to)} m = ${f(cz.width)} m each side`);
L(`  right of way (ROW): 2 x ${f(S.rowHalf)} = ${f(2 * S.rowHalf)} m`);
L(`  fall of the pavement from the median edge to the pavement edge: ${f(sIn.width * 0.04, 3)} + ${f(lanes.width * 0.02, 3)} + ${f(sOut.width * 0.04, 3)} = ${f(dropEdge, 3)} m`);
L(`  per km of ring: ROW area ${f(2 * S.rowHalf * 1000 / 10000, 1)} ha, paved area (median excluded) ${f((pavementTotal - 2 * med.width) * 1000 / 10000, 2)} ha`);
L(`  whole ring (${f(length / 1000, 3)} km): ROW ${f((2 * S.rowHalf * length) / 10000, 0)} ha, paved ${f(((pavementTotal - 2 * med.width) * length) / 10000, 0)} ha`);

L('\n=== Checks ===');
let at = 0, contiguous = true;
for (const e of S.elements) { if (Math.abs(e.from - at) > 1e-9) contiguous = false; at = e.to; }
check('elements follow each other, no gap or overlap', contiguous, `${S.elements.length} elements, last ends at ${f(at)} m`);
check('widths add up: sum of widths = ROW half width', Math.abs(S.elements.reduce((a, e) => a + e.width, 0) - S.rowHalf) < 1e-9, `${f(S.elements.reduce((a, e) => a + e.width, 0))} m`);
check('lanes: 4 per direction = 8 lanes', S.lanesPerDir * 2 === 8, `${S.lanesPerDir} x 2`);
check('lane width 3.65 m', Math.abs(lanes.width / S.lanesPerDir - DESIGN.laneWidth) < 1e-9 && DESIGN.laneWidth === 3.65, `${f(lanes.width / S.lanesPerDir, 2)} m`);
check('median 6.0 m in total', Math.abs(2 * med.width - 6) < 1e-9, `${f(2 * med.width)} m`);
check('pavement edge at 22.1 m (table 3.5)', Math.abs(S.pavementEdge - 22.1) < 1e-9, `${f(S.pavementEdge)} m`);
check('end of the ditch (formation edge) at 24.2 m', Math.abs(formationHalf - 24.2) < 1e-9, `${f(formationHalf)} m`);
check('right of way 40 m each side = 80 m', Math.abs(S.rowHalf - 40) < 1e-9, `${f(2 * S.rowHalf)} m`);
check('clear zone 7.8 m (24.2 to 32.0, "about 8" in table 3.5)', Math.abs(cz.width - 7.8) < 1e-9 && Math.abs(cz.to - 32) < 1e-9, `${f(cz.width)} m`);

writeFileSync(process.argv[2] ?? '/tmp/ring_section.json', JSON.stringify({ elements: S.elements, pavementEdge: S.pavementEdge, rowHalf: S.rowHalf }));
L(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
