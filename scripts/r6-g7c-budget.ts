// STEP G7c (headless, numbers + picture only, nothing in src/ changed): JX-3 trumpet on J1-N (tap + stem from G7b), part 1 = ARM LENGTH BUDGET and the two SE slip ramps with real geometry.
// Question: do all the lane zones of the trumpet fit between the rail bridge N3 (ends s 1619) and the river bridge N4 (starts s 2355) of J1-N?
// Frame (left-hand traffic, as the game): origin = tap point T on the arm axis, p = along the arm toward the RING (NE), q = toward the SE (stem side). SW-bound carriageway is on the SE side (q +), NE-bound on the NW side (q -).
// SE side = the two LEFT SLIPS (m1 arm SW-bound -> stem, m2 stem -> arm SW-bound), drawn here with straight - spiral - arc - spiral - straight (R3). NW side (m3, m4, they must cross under the arm) = lower bound only, NOT drawn.
// Run: node --experimental-transform-types ... or npx tsx scripts/r6-g7c-budget.ts docs      writes docs/STEP_R6_G7C_OUTPUT.txt and docs/r6_g7c.json (picture: python3 tools/r6-g7c-plot.py)
import { writeFileSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import { tangentLength } from '../src/roads/alignment/Clothoid';
import { minRadius, decelLength, accelLength } from '../src/interchange/Standards';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample(); const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-N')!; const rail = gen.rail.edges.find((e: any) => e.id === 'north-1');
const g7b = JSON.parse(readFileSync(`${dir}/r6_g7b.json`, 'utf8'));
const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
const dRail = (p: number[]) => { let m = 1e9; for (let i = 0; i + 1 < rail.xs.length; i++) m = Math.min(m, dseg(p, [rail.xs[i], rail.zs[i]], [rail.xs[i + 1], rail.zs[i + 1]])); return m; };
const armHd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const armY = (s: number) => { let k = 0; while (k + 2 < arm.s.length && arm.s[k + 1] < s) k++; const t = (s - arm.s[k]) / (arm.s[k + 1] - arm.s[k]); return arm.ys[k] + t * (arm.ys[k + 1] - arm.ys[k]); };
// ---------- inputs (MY numbers are marked PROPOSAL; the rest comes from the earlier steps) ----------
const STEM0: number = g7b.stem0 ?? 130;          // G7b: stem starts 130 m from the arm axis, perpendicular
const Q0 = 22.0;                                  // centre of the ramp at the nose / merge = arm pavement edge 22.1 m (M8: median 3 + 1.5 + 4 x 3.65 + 3.0 shoulder) PROPOSAL
const P_OUT = 10.0, P_IN = -11.75;                // stem lane lines: outbound carriageway axis +8.25 (3 lanes x 3.5 m = 6.5 .. 13.5 wide with the slip 2 lanes at +10.0), inbound -8.25 with the entry slip as the kerb lane at -11.75 PROPOSAL
const VH = 100, TAPER_EXIT = 91.3, TAPER_ENTRY_50 = 182.5, TAPER_ENTRY_25 = 91.3; // 17.1b: exit taper 1:25 x 3.65, entry taper 1:50 x 3.65; 1:25 entry taper = NOT a handoff number, shown only as a what-if
const LO = 1619 + 20, HI = 2355 - 20;             // free arm length between N3 end and N4 start, 20 m margin each side (same rule as G7b)
const STEM_Y = g7b.yS0 as number;                 // stem level at its start (G7b): 31.2 m so that R6 passes under the arm later
const Y_RAIL_MIN = 60;
const exitZone = (V: number) => TAPER_EXIT + decelLength(VH, V);
const entryZone = (V: number, taper: number) => taper + accelLength(VH, V);
const rampDesign = (V: number) => { const R = Math.ceil(minRadius(V) / 5) * 5; const Ls = Math.max(30, Math.round((0.7 * V) / 5) * 5); return { V, R, Ls, Ts: tangentLength(R, Ls, Math.PI / 2) }; };
pr('STEP G7c part 1 (JX-3 trumpet on J1-N: arm length budget + the two SE slip ramps; numbers + picture only, NO src/ change; build / game NOT run)');
pr(`Inputs: tap s ${g7b.tapS} (G7b), stem starts ${STEM0} m from the arm axis, free arm length s ${LO} .. ${HI} = ${HI - LO} m (N3 ends 1619, N4 river bridge starts 2355, 20 m margin), arm speed ${VH}, exit taper 91.3 m (1:25), entry taper 182.5 m (1:50, 17.1b), ramp centre at the nose ${Q0} m from the arm axis, slips end on the stem lane lines p ${P_OUT} (out) and ${P_IN} (in).`);
pr('');
pr('A. BUDGET. Extent of the lane zones measured from the stem foot (p = 0) along the arm. NE = toward the ring, SW = toward J1.');
pr('   m1 exit slip: nose at p = P_OUT + Ts, then taper + decel zone further NE.   m2 entry slip: merge at p = P_IN - Ts, then accel + taper further SW.');
const rows: any[] = [];
for (const V of [60, 50]) for (const tp of [TAPER_ENTRY_50, TAPER_ENTRY_25]) {
  const d = rampDesign(V); const fit = d.Ts <= STEM0 - Q0; const ne = P_OUT + d.Ts + exitZone(V), sw = -P_IN + d.Ts + entryZone(V, tp);
  // lower bound of the NW side: connector m4 (stem -> NE-bound arm) turns right after the bridge at the stem line P_DIR and merges at p = P_DIR + Ts, then needs the entry zone; the loop / outer ramp of m3 comes on top of this (not counted)
  const P_DIR = -6.5; const neFull = Math.max(ne, P_DIR + d.Ts + entryZone(V, tp));
  rows.push({ V, R: d.R, Ls: d.Ls, Ts: d.Ts, taper: tp, fit, ne, sw, need: ne + sw, slack: HI - LO - (ne + sw), neFull, needFull: neFull + sw, slackFull: HI - LO - (neFull + sw) });
}
pr('   V   R    Ls   Ts   fits stem(Ts<=' + (STEM0 - Q0) + ')   entry taper   NE ext   SW ext   slips only: need / slack   full trumpet (lower bound): need / slack');
for (const r of rows) pr(`   ${r.V}  ${String(r.R).padStart(3)}  ${String(r.Ls).padStart(3)}  ${r.Ts.toFixed(0).padStart(4)}   ${r.fit ? 'yes' : 'NO '}                ${r.taper.toFixed(1).padStart(6)}      ${r.ne.toFixed(0).padStart(5)}    ${r.sw.toFixed(0).padStart(5)}      ${r.need.toFixed(0).padStart(5)} / ${r.slack.toFixed(0).padStart(5)}               ${r.needFull.toFixed(0).padStart(5)} / ${r.slackFull.toFixed(0).padStart(5)}`);
const best = rows.find((r) => r.V === 50 && r.taper === TAPER_ENTRY_50)!;
pr('');
pr('B. TAP WINDOW for the SE slips (V50, entry taper 1:50): the tap must lie in [LO + SW ext, HI - NE ext].');
const wLo = LO + best.sw, wHi = HI - best.ne; pr(`   window s ${wLo.toFixed(0)} .. ${wHi.toFixed(0)} (width ${(wHi - wLo).toFixed(0)} m); G7b feasible taps: ${(g7b.top as any[]).map((c) => c.st.toFixed(0)).join(', ')}`);
const tapsOk = (g7b.top as any[]).map((c) => c.st as number).filter((s) => s >= wLo && s <= wHi);
// ---------- C. real slip geometry at the G7b tap (s 2069) and at the window tap nearest to it ----------
const tapList = Array.from(new Set([g7b.tapS as number, ...tapsOk, ...(wHi > wLo ? [Math.round((wLo + wHi) / 2)] : [])])); // the G7b tap first; a window tap only if the window is not empty
let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
const out: any = { tapS: g7b.tapS, stem0: STEM0, rows, window: [wLo, wHi], taps: [] };
for (const tapS of tapList) {
  let ia = 0; for (let i = 0; i < arm.s.length; i++) if (Math.abs(arm.s[i] - tapS) < Math.abs(arm.s[ia] - tapS)) ia = i;
  const T = arm.pts[ia], a = armHd(ia), n = [-a[1], a[0]]; // n = left([-a]) = [-a1, a0] = SE side
  const W = (p: number, q: number) => ({ x: T[0] + p * a[0] + q * n[0], z: T[1] + p * a[1] + q * n[1] });
  const d = rampDesign(50); const es = buildOpenAlignment(W(P_OUT + d.Ts, Q0), [{ ...W(P_OUT, Q0), R: d.R, Ls: d.Ls }], W(P_OUT, STEM0));
  const en = buildOpenAlignment(W(P_IN, STEM0), [{ ...W(P_IN, Q0), R: d.R, Ls: d.Ls }], W(P_IN - d.Ts - 20, Q0));
  const noseS = arm.s[ia] + P_OUT + d.Ts, mergeS = arm.s[ia] + P_IN - d.Ts; // arm stations of the exit nose and the merge point (arm heading NE = increasing s, p ~ s)
  const yN = armY(noseS), yM = armY(mergeS);
  const info: any = { tapS: arm.s[ia], noseS, mergeS };
  const sample = (al: any, yA: number, yB: number, flip: boolean) => { const pts: number[][] = []; let cut = -1e9, fill = -1e9, rmin = 1e9, dr = 1e9; for (let s = 0; s <= al.length + 1e-6; s += 5) { const q = poseAt(al, Math.min(s, al.length)); const t = s / al.length; const y = flip ? yB + (yA - yB) * t : yA + (yB - yA) * t; const g = gnd(q.x, q.z); cut = Math.max(cut, g - y); fill = Math.max(fill, y - g); if (Math.abs(q.k) > 1e-9) rmin = Math.min(rmin, 1 / Math.abs(q.k)); dr = Math.min(dr, dRail([q.x, q.z])); pts.push([q.x, q.z]); } return { pts, cut, fill, rmin, dr }; };
  const sEs = sample(es, yN, STEM_Y, false), sEn = sample(en, STEM_Y, yM, false);
  info.es = { len: es.length, grade: Math.abs(yN - STEM_Y) / es.length, yN, cut: sEs.cut, fill: sEs.fill, rmin: sEs.rmin, rail: sEs.dr, endGap: es.endGap, endHeadDeg: es.endHeadingGapDeg, pts: sEs.pts };
  info.en = { len: en.length, grade: Math.abs(yM - STEM_Y) / en.length, yM, cut: sEn.cut, fill: sEn.fill, rmin: sEn.rmin, rail: sEn.dr, endGap: en.endGap, endHeadDeg: en.endHeadingGapDeg, pts: sEn.pts };
  const zLo = mergeS - entryZone(50, TAPER_ENTRY_50), zHi = noseS + exitZone(50); info.zone = [zLo, zHi];
  pr(''); pr(`C. TAP s ${arm.s[ia].toFixed(0)}  (arm level ${armY(arm.s[ia]).toFixed(2)} m, stem level ${STEM_Y.toFixed(2)} m)`);
  pr(`   m1 exit slip V50 R ${d.R} m Ls ${d.Ls} m: Ts ${d.Ts.toFixed(1)} m, ramp ${es.length.toFixed(0)} m, nose at arm s ${noseS.toFixed(0)} (level ${yN.toFixed(2)}), grade ${(info.es.grade * 100).toFixed(1)} %, cut ${sEs.cut.toFixed(1)} m, fill ${sEs.fill.toFixed(1)} m, min radius ${sEs.rmin.toFixed(0)} m, rail ${sEs.dr.toFixed(0)} m`);
  pr(`   m2 entry slip V50: ramp ${en.length.toFixed(0)} m, merge at arm s ${mergeS.toFixed(0)} (level ${yM.toFixed(2)}), grade ${(info.en.grade * 100).toFixed(1)} %, cut ${sEn.cut.toFixed(1)} m, fill ${sEn.fill.toFixed(1)} m, rail ${sEn.dr.toFixed(0)} m`);
  pr(`   lane zones on the arm: s ${zLo.toFixed(0)} .. ${zHi.toFixed(0)} (allowed ${LO} .. ${HI}); exit nose to entry merge distance ${(noseS - mergeS).toFixed(0)} m`);
  chk(d.Ts <= STEM0 - Q0, `slips fit between the arm and the stem start (Ts ${d.Ts.toFixed(0)} m <= ${STEM0 - Q0} m)`);
  chk(es.endGap < 0.5 && en.endGap < 0.5, `alignment closes on the stem line (gap ${es.endGap.toFixed(2)} / ${en.endGap.toFixed(2)} m)`);
  chk(info.es.grade <= 0.05 && info.en.grade <= 0.05, `ramp grades <= 5 % (${(info.es.grade * 100).toFixed(1)} / ${(info.en.grade * 100).toFixed(1)} %)`);
  chk(Math.max(sEs.cut, sEn.cut) <= 12 && Math.max(sEs.fill, sEn.fill) <= 7, 'ramp cut <= 12 m and fill <= 7 m');
  chk(Math.min(sEs.dr, sEn.dr) >= Y_RAIL_MIN, `ramps >= ${Y_RAIL_MIN} m from the railway (${Math.min(sEs.dr, sEn.dr).toFixed(0)} m)`);
  chk(zLo >= LO && zHi <= HI, `lane zones inside the free arm length (${zLo.toFixed(0)} .. ${zHi.toFixed(0)})`);
  chk(noseS - mergeS >= 150, `exit nose to entry merge >= ${150} m (weaveMin; no weave here, exit comes first)`);
  out.taps.push(info);
}
pr('');
pr('D. WHOLE TRUMPET (m3, m4 on the NW side, they must pass UNDER the arm at the bridge). Lower bound only, the loop is NOT drawn:');
pr(`   with V50 slips and the 1:50 entry taper the SE slips alone need ${best.need.toFixed(0)} m (slack ${best.slack.toFixed(0)} m); the connector m4 (stem -> NE-bound arm, merge after the bridge) alone raises the NE side to ${best.neFull.toFixed(0)} m, so the trumpet needs AT LEAST ${best.needFull.toFixed(0)} m against ${HI - LO} m free: slack ${best.slackFull.toFixed(0)} m.`);
const q25 = rows.find((r) => r.V === 50 && r.taper === TAPER_ENTRY_25)!;
pr(`   what-if: entry taper 1:25 (NOT a handoff number, short) gives at least ${q25.needFull.toFixed(0)} m, slack ${q25.slackFull.toFixed(0)} m, but the loop (R >= 41 m, V40) and its nesting with m4 are NOT counted.`);
pr('   MY reading of the topology (not drawn, check before trusting): in left-hand traffic m3 (NE-bound -> stem) and m4 (stem -> NE-bound) both leave the NW side through the same bridge. They do not cross each other only if one is a loop NESTED inside the other (the other then wraps around it), so the NW side is bigger than the lower bound above, not smaller.');
chk(best.slack >= 0 && tapsOk.length > 0, `SE slips only (half interchange): a G7b feasible tap lies in the window (${tapsOk.join(', ') || 'none'})`);
chk(best.slackFull >= 0, `FULL trumpet fits the free arm length (need >= ${best.needFull.toFixed(0)} m, free ${HI - LO} m)`);
pr(''); pr(bad ? `RESULT: ${bad} FAIL` : 'RESULT: ALL PASS');
writeFileSync(`${dir}/r6_g7c.json`, JSON.stringify({ ...out, lo: LO, hi: HI, rail: g7b.rail, arm: g7b.arm, stem: g7b.stem }));
writeFileSync(`${dir}/STEP_R6_G7C_OUTPUT.txt`, P.join('\n') + '\n');
