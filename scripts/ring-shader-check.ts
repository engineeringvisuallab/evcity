// STEP 5.2b check: the road shader knows the ring's M8 section (median, lanes, paint). Headless, no three.js / GPU.
// It checks the DATA the shader is built from (src/roads/section/ShaderSection.ts) and that RoadMaterial.ts really uses it.
// It does NOT draw anything: the look must be checked in the game. Run: npx tsx scripts/ring-shader-check.ts
import { readFileSync } from 'node:fs';
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { buildMarkingLines } from '../src/roads/section/Markings';
import { SHADER_ROW_M8 as R, sectionGlslLine, edgesGlsl } from '../src/roads/section/ShaderSection';
import { DIVIDED_SECTIONS } from '../src/roads/RoadSection';
import { planRing } from '../src/roads/ring/RingRoad';

let fails = 0;
const f = (v: number, d = 3) => v.toFixed(d);
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(66)} ${detail}`); }

const plan = planRing(8);
const lines = buildMarkingLines(S);
const yel = lines.find((m) => m.kind === 'edge-line-median-side' && m.sigma === 1)!;
const wht = lines.find((m) => m.kind === 'edge-line-outer' && m.sigma === 1)!;
const lanes = S.elements.find((e) => e.kind === 'lanes')!;
const mat = readFileSync(new URL('../src/roads/RoadMaterial.ts', import.meta.url), 'utf8');

console.log('=== 5.2b RING SHADER SECTION (M8) ===');
console.log(`  row: halfWidth ${f(R.halfWidth, 1)}, median half ${f(R.medianHalf, 1)}, inner shoulder ${f(R.shyMedian, 1)}, lane ${f(R.laneW, 2)}, ${R.lanesPerDir} lanes/dir, yellow line at ${f(R.yellowAt)}, white line at ${f(R.whiteAt)}, line half width ${f(R.lineHalf)}`);
console.log('  GLSL: ' + sectionGlslLine().trim());
console.log('\n=== Checks ===');
check('shader key = half width the ring road really has in RoadNetwork', Math.abs(plan.section.halfWidth - R.halfWidth) < 0.02, `ring ${f(plan.section.halfWidth, 1)} m, row ${f(R.halfWidth, 1)} m`);
check('ring row does not clash with another divided section (+-0.02 m)', DIVIDED_SECTIONS.every((d) => Math.abs(d.halfWidth - R.halfWidth) >= 0.04), DIVIDED_SECTIONS.map((d) => `${d.id} ${f(d.halfWidth, 2)}`).join(', '));
check('median 3.0 m, inner shoulder 1.5 m, lane 3.65 m, 4 lanes (Step 4.1)', R.medianHalf === 3 && R.shyMedian === 1.5 && Math.abs(R.laneW - 3.65) < 1e-9 && R.lanesPerDir === 4, 'as SECTION_M8');
check('lanes start at median + shoulder = 4.5 m, end at 19.1 m', Math.abs(R.medianHalf + R.shyMedian - lanes.from) < 1e-9 && Math.abs(lanes.from + R.lanesPerDir * R.laneW - lanes.to) < 1e-9, `${f(lanes.from, 1)} to ${f(lanes.to, 1)} m`);
check('yellow edge line = Step 4.5 data (centre, width)', Math.abs(R.yellowAt - yel.offset) < 1e-9 && Math.abs(2 * R.lineHalf - yel.width) < 1e-9, `${f(R.yellowAt)} m vs ${f(yel.offset)} m`);
check('white edge line = Step 4.5 data (centre, width)', Math.abs(R.whiteAt - wht.offset) < 1e-9, `${f(R.whiteAt)} m vs ${f(wht.offset)} m`);
check('yellow line touches the lane edge from the shoulder side', Math.abs(R.yellowAt + R.lineHalf - lanes.from) < 1e-9, `outer edge of paint ${f(R.yellowAt + R.lineHalf)} m`);
check('white line touches the lane edge from the shoulder side', Math.abs(R.whiteAt - R.lineHalf - lanes.to) < 1e-9, `inner edge of paint ${f(R.whiteAt - R.lineHalf)} m`);
check('both edge lines lie on the pavement (not on the median, not on the gravel)', R.yellowAt - R.lineHalf > R.medianHalf && R.whiteAt + R.lineHalf < R.halfWidth, `${f(R.yellowAt - R.lineHalf)} .. ${f(R.whiteAt + R.lineHalf)} m, pavement ${f(R.medianHalf, 1)}-${f(R.halfWidth, 1)} m`);
check('3 dashed lane lines per direction fall at 8.15 / 11.8 / 15.45 m', [1, 2, 3].every((k, i) => Math.abs(lines.filter((m) => m.kind === 'lane-line' && m.sigma === 1)[i].offset - (R.medianHalf + R.shyMedian + k * R.laneW)) < 1e-9), lines.filter((m) => m.kind === 'lane-line' && m.sigma === 1).map((m) => f(m.offset, 2)).join(' / '));
check('GLSL row text carries the numbers', sectionGlslLine().includes('22.100') && sectionGlslLine().includes('vec4(3.000, 3.650, 1.500, 4.0)'), 'evcSection line ok');
check('GLSL edges text carries the numbers', edgesGlsl().includes('vec3(4.425, 19.175, 0.075)'), 'evcEdges ok');
check('RoadMaterial.ts imports and uses the ring row', mat.includes("from './section/ShaderSection'") && mat.includes('${sectionGlslLine()}') && mat.includes('${edgesGlsl()}'), 'import + both inserts found');
check('RoadMaterial.ts uses evcEdges in the divided branch (paint positions)', mat.includes('evcEdges(hw)') && mat.includes('evcLine(au - yAt, yW)') && mat.includes('evcLine(au - wAt, wW)') && mat.includes('evcLine((v - bi) * laneW, lW)'), 'yellow, white, lane lines');
check('shader cache key changed (old compiled shader is not reused)', mat.includes("'evc-road-v18-m6-m8-section'"), 'v18');
console.log(`\n${fails === 0 ? 'ALL CHECKS PASS (data and wiring only, not a visual check)' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
