// STEP G3 / G4 (headless): REAL GRADE CHECK of the R6 lines (section 20, rule R11) on the game ground. Only READS the world and the line files, changes nothing in src/.
// Shared solver: scripts/r6-profile-lib.ts (ground every ~10 m at the centreline and both pavement edges, DP profile, |grade| <= 4 %, 3 % aim, checks on the FINAL profile, free ends).
// Run G3: npx tsx scripts/r6-profile-check.ts docs          (42 lines of G2b + G2c)      -> r6_g3.json, STEP_R6_G3_OUTPUT.txt
// Run G4: npx tsx scripts/r6-profile-check.ts docs g4       (final set of r6-reroute.ts) -> r6_g4.json, STEP_R6_G4_OUTPUT.txt; in g4 a short wet run (<= 120 m, nothing else wrong) is accepted as a bridge, NOT designed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadG2, solveLine, f0, f1, f2, LIM, AIM, MAXCUT, MAXFILL, WIDTH, PAVE, WATCH, GP, FILLC, CUTC, VIA, VIAWET, FREEBOARD, type Src, type Res } from './r6-profile-lib';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';

const out = process.argv[2] ?? 'docs';
const G4 = process.argv[3] === 'g4';
const TAG = G4 ? 'G4' : 'G3', FN = G4 ? 'g4' : 'g3', SHORT_BRIDGE = 120;
mkdirSync(out, { recursive: true });
const P: string[] = [];
const pr = (s = '') => { P.push(s); console.log(s); };
const g2 = loadG2(out);
const B = { lines: { length: g2.nKept }, crossings: { length: g2.b2Crossings } }, C = { rerouted: { length: g2.nRerouted } };
const srcs: Src[] = G4
  ? (JSON.parse(readFileSync(`${out}/r6_g4_lines.json`, 'utf8')) as { lines: { src_id: number; origin: string; min_radius_m?: number; pts: number[][] }[] }).lines.map((l) => ({ id: l.src_id, origin: l.origin, pts: l.pts, minR: l.min_radius_m ?? null }))
  : g2.srcs;

// ---------------- run ----------------
const t0 = Date.now();
pr(`R6 STEP ${TAG}: REAL GRADE CHECK on the game ground (TerrainGenerator.sampleGround), every ~10 m, centre + both pavement edges (+-${f2(PAVE)} m)`);
pr(`Rule R11: R6 grade <= ${LIM} % (PASS limit), ${AIM} % is the AIM (shown, not a pass condition). Cut limit ${MAXCUT} m, fill limit ${MAXFILL} m, wet = bridge (3.3 / DESIGN).`);
pr(G4 ? `Lines: final set of G4 = ${srcs.length} lines (G3 had ${B.lines.length + C.rerouted.length}; L5, L31, L32, L45 dropped; failing / heavy lines re-routed by scripts/r6-reroute.ts). This script does not move them.` : `Lines: ${B.lines.length} kept in G2b + ${C.rerouted.length} re-routed in G2c = ${srcs.length} lines. Lines are NOT changed (R10).`);
const results: Res[] = [];
for (const s of srcs) {
  const r = solveLine(s);
  if (G4 && r.gradeOK && r.wetLen > 0 && r.wetLen <= SHORT_BRIDGE && r.highFillLen === 0 && r.maxCut <= MAXCUT + 1e-6) { r.workOK = true; r.pass = true; r.reasons = [`SHORT BRIDGE ${f0(r.wetLen)} m accepted (<= ${SHORT_BRIDGE} m, no dry path found or better), bridge NOT designed`]; }
  results.push(r);
}
const order = [...results].sort((a, b) => (WATCH.includes(a.id) ? 0 : 1) - (WATCH.includes(b.id) ? 0 : 1) || a.id - b.id);
const tot = (f: (r: Res) => number) => results.reduce((q, r) => q + f(r), 0);
pr(`computed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
pr();
pr('LINE TABLE (WATCH lines first: 22, 29, 44, 45, 62). nat = natural ground, steepest 30 m window. des = designed profile. cut / fill = largest depth at the pavement edge / centre.');
pr('line  origin        km     natMaxG natOver | desMaxG >3%(m) chg | maxCut(at m) maxFill  cut m3   fill m3 | wet m  hiFill m | GRADE WORK  RESULT');
const mark = (r: Res) => (WATCH.includes(r.id) ? '*' : ' ');
for (const r of order) {
  pr(`${mark(r)}L${String(r.id).padEnd(3)} ${r.origin.padEnd(13)} ${f2(r.len / 1000).padStart(5)}  ${f1(r.natMaxG).padStart(6)}% ${f0(r.natOver).padStart(6)}m | ${f1(r.maxG).padStart(5)}% ${f0(r.over3).padStart(6)} ${String(r.gradeChanges).padStart(3)} | ${f1(r.maxCut).padStart(5)}(${f0(r.maxCutAt).padStart(4)}) ${f1(r.maxFill).padStart(5)} ${f0(r.cutVol).padStart(8)} ${f0(r.fillVol).padStart(8)} | ${f0(r.wetLen).padStart(5)} ${f0(r.highFillLen).padStart(7)}  | ${r.gradeOK ? 'PASS ' : 'FAIL '} ${r.workOK ? 'PASS ' : 'FAIL '} ${r.pass ? 'PASS' : 'FAIL'}${r.reasons.length ? '  <- ' + r.reasons.join('; ') : ''}`);
}
const pass = results.filter((r) => r.pass), failL = results.filter((r) => !r.pass), gradeFail = results.filter((r) => !r.gradeOK);
pr();
pr('SUMMARY');
pr(`  lines PASS ${pass.length} (${f1(pass.reduce((q, r) => q + r.len, 0) / 1000)} km) | FAIL ${failL.length} (${f1(failL.reduce((q, r) => q + r.len, 0) / 1000)} km) | total ${f1(tot((r) => r.len) / 1000)} km`);
pr(`  R11 GRADE <= ${LIM} %: ${gradeFail.length === 0 ? 'PASS' : 'FAIL'} on ${results.length - gradeFail.length} / ${results.length} lines; steepest designed grade ${f1(Math.max(...results.map((r) => r.maxG)))} %; length above the ${AIM} % aim: ${f1(tot((r) => r.over3) / 1000)} km of ${f1(tot((r) => r.len) / 1000)} km`);
pr(`  natural ground steeper than ${LIM} % (30 m window) along the lines: ${f1(tot((r) => r.natOver) / 1000)} km`);
pr(`  earthwork (indicative: depth at the centreline x ${f1(WIDTH)} m block, NO side slopes, NO topsoil): cut ${f0(tot((r) => r.cutVol))} m3, fill ${f0(tot((r) => r.fillVol))} m3`);
pr(`  structures needed (not designed): wet ${f0(tot((r) => r.wetLen))} m, fill > ${MAXFILL} m ${f0(tot((r) => r.highFillLen))} m`);
const heavy = results.filter((r) => r.maxCut >= MAXCUT - 0.05 || (r.cutVol + r.fillVol) / r.len > 100);
pr(`  HEAVY EARTHWORK (cut at the ${MAXCUT} m limit, or cut + fill above 100 m3 per m of road): ${heavy.length} lines. The 4 % grade is met here by BUYING cut, check these with the user ('aktu cut fill' = a little):`);
for (const r of heavy) pr(`     L${r.id}: max cut ${f1(r.maxCut)} m, cut + fill ${f0((r.cutVol + r.fillVol) / r.len)} m3 per m (${f0(r.cutVol)} + ${f0(r.fillVol)} m3 on ${f0(r.len)} m)${r.pass ? '' : ' [also FAIL above]'}`);
const hollow = results.filter((r) => r.structLen > 0.5 * r.len);
pr(`  HOLLOW GRADE PASS: ${hollow.length} lines are more than half structure (wet or fill > ${MAXFILL} m), their grade PASS only says the DP flew over the ground: ${hollow.map((r) => 'L' + r.id).join(', ')}. Treat their R11 result as NOT MEANINGFUL.`);
pr();
// ---------------- the watch lines in detail ----------------
pr('WATCH LINES (G2d: 22, 29, 44, 45, 62)');
for (const id of WATCH) {
  const r = results.find((q) => q.id === id);
  if (!r) { pr(`  L${id}: not in the line set (${G4 ? 'dropped in G4' : 'cut or dropped in G2b / G2c'})`); continue; }
  pr(`  L${id} (${r.origin}, ${f0(r.len)} m): natural steepest ${f1(r.natMaxG)} %, designed steepest ${f1(r.maxG)} %, max cut ${f1(r.maxCut)} m at ${f0(r.maxCutAt)} m, max fill ${f1(r.maxFill)} m, cut ${f0(r.cutVol)} m3, fill ${f0(r.fillVol)} m3, wet ${f0(r.wetLen)} m, start level ${f1(r.y0)} m, end level ${f1(r.y1)} m -> ${r.pass ? 'PASS' : 'FAIL'}${r.reasons.length ? ' (' + r.reasons.join('; ') + ')' : ''}`);
}
pr();
// ---------------- R10: sketch kept or conflict ----------------
pr('R10 SKETCH CHECK (the lines are not moved here)');
let conflicts = 0;
for (const r of order) {
  if (r.pass) continue; conflicts++;
  const at = r.reasons.some((q) => q.startsWith('cut')) ? r.maxCutAt : r.firstStruct; const i = Math.min(r.N - 1, Math.round(at / r.ds));
  pr(`  L${r.id}: sketch conflict from station ${f0(at)} m (${f0(r.x[i])}, ${f0(r.z[i])}): ${r.reasons.join('; ')}. Smallest changes to choose from (NOT done): (a) accept the deeper cut / the structure there, (b) shift the line sideways inside a corridor (G2c method, new cell path), (c) drop the line. ASK.`);
}
if (conflicts === 0) pr('  sketch kept on all lines (no conflict found by the grade / cut / structure test).');
pr();
// ---------------- R1: crossings among the R6 lines themselves ----------------
function segX(a: number[], b: number[], c: number[], d: number[]): number[] | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, q = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && q > 0 && q < 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
const near = (p: number[], l: Src) => Math.min(Math.hypot(p[0] - l.pts[0][0], p[1] - l.pts[0][1]), Math.hypot(p[0] - l.pts[l.pts.length - 1][0], p[1] - l.pts[l.pts.length - 1][1]));
const xs: string[] = [];
for (let a = 0; a < srcs.length; a++) for (let b = a + 1; b < srcs.length; b++) {
  for (let i = 0; i + 1 < srcs[a].pts.length; i++) for (let j = 0; j + 1 < srcs[b].pts.length; j++) {
    const p = segX(srcs[a].pts[i], srcs[a].pts[i + 1], srcs[b].pts[j], srcs[b].pts[j + 1]);
    if (p && near(p, srcs[a]) > 40 && near(p, srcs[b]) > 40) xs.push(`L${srcs[a].id} x L${srcs[b].id} at (${f0(p[0])}, ${f0(p[1])})`);
  }
}
pr(`R1 (R6 lines among themselves, own segment test, crossing = not within 40 m of a line end): ${xs.length === 0 ? 'PASS' : 'FAIL'} (${xs.length} crossing${xs.length === 1 ? '' : 's'})`);
for (const q of xs.slice(0, 20)) pr(`    ${q}`);
const ringS = sampleAlignment(buildAlignment([...RING_PIS]), 5).samples.map((q) => [q.x, q.z]);
const eight: { name: string; pts: number[][] }[] = [{ name: 'ring', pts: [...ringS, ringS[0]] }, ...J1_ARM_DATA.map((a) => ({ name: a.name, pts: a.pts }))];
const x8: string[] = []; let touch8 = 0;
for (const l of srcs) for (const e of eight) for (let i = 0; i + 1 < l.pts.length; i++) for (let j = 0; j + 1 < e.pts.length; j++) {
  const p = segX(l.pts[i], l.pts[i + 1], e.pts[j], e.pts[j + 1]); if (!p) continue;
  if (near(p, l) <= 40) { touch8++; continue; }
  x8.push(`L${l.id} x ${e.name} at (${f0(p[0])}, ${f0(p[1])})`);
}
pr(`R1 (R6 lines vs the 8-lane roads = ring + 4 J1 arms from the game data, own segment test; a line that meets a road within 40 m of ITS END is a planned junction, not a crossing): ${x8.length === 0 ? 'PASS' : 'FAIL'} (${x8.length} crossing${x8.length === 1 ? '' : 's'}, ${touch8} end-touch${touch8 === 1 ? '' : 'es'} = junction places still to be designed)`);
for (const q of x8.slice(0, 30)) pr(`    ${q}`);
pr('    user answer 2026-11-15: a 6-lane road may NOT cross an 8-lane road on a bridge without a connection, so each listed crossing must become a junction or the line is moved / cut at the 8-lane road. The 8-lane roads other than ring + 4 J1 arms (taps, other arms) are not in this test.');
pr('R2 (every road has a stated need): NOT RUN. The 42 lines are the user\'s blue sketch (R10, function = hierarchy); no AADT is computed in G3 or G4.');
pr('R3 (smooth): NOT RUN here as a check. Minimum radius read from the G2b / G2c files (not recomputed): ' + `smallest value ${f0(Math.min(...srcs.filter((q) => q.minR !== null).map((q) => q.minR as number)))} m on ${srcs.filter((q) => q.minR !== null).length} lines (V80 minimum 229 m); ${srcs.filter((q) => q.minR === null).length} lines (${srcs.filter((q) => q.minR === null).map((q) => 'L' + q.id).join(', ')}) have NO radius value in the files, NOT checked; the real smoothing check comes with the final alignments.`);
pr();
pr('LIMITS OF THIS CHECK (honest)');
pr('  1. The END LEVELS are free: the junction levels (ring taps, arm taps, other R6 lines) are NOT fixed yet. A real profile may be steeper or deeper where a line must meet a road at a given level. NOT RUN.');
pr('  2. Grades are on a 10 m grid with 0.5 % steps. Vertical curves (K values, sight distance) are NOT RUN. Minimum tangent length NOT RUN.');
pr(`  3. Ground = natural terrain only: rail earthworks, other roads and buildings are not in it. Rail crossings (G2a counted many) are NOT checked here.`);
pr(`  4. Cost weights (cut ${CUTC}, fill ${FILLC}, grade penalty ${GP} per % above ${AIM} %, viaduct ${VIA}, bridge ${VIAWET}) and the freeboard ${FREEBOARD} m are MY numbers, not a handoff rule. Volumes are indicative.`);
pr('  5. PASS here means: designed grade <= 4 %, cut <= 12 m, no wet / high-fill station. It is NOT a full road design (no cross slope, drainage, superelevation).');
pr('  6. game run, in-game drive: NOT RUN (nothing in src/ changed).');
writeFileSync(`${out}/STEP_R6_${TAG}_OUTPUT.txt`, P.join('\n') + '\n');
writeFileSync(`${out}/r6_${FN}.json`, JSON.stringify({ note: `${TAG} profile check; each line: s,x,z,h (natural ground),y (designed level), wet; units metres`, lim: LIM, aim: AIM, lines: results.map((r) => ({ id: r.id, origin: r.origin, len: +r.len.toFixed(1), pass: r.pass, gradeOK: r.gradeOK, workOK: r.workOK, maxG: +r.maxG.toFixed(2), natMaxG: +r.natMaxG.toFixed(2), maxCut: +r.maxCut.toFixed(2), reasons: r.reasons, pts: r.s.map((s, i) => [+s.toFixed(1), +r.x[i].toFixed(1), +r.z[i].toFixed(1), +r.h[i].toFixed(2), +r.y[i].toFixed(2), r.wet[i] ? 1 : 0]) })) }));
