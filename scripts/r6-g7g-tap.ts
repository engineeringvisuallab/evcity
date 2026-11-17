// STEP G7g (headless, numbers only, nothing in src/ changed): J1-E arm, JX-1 / JX-2 options (R5 numbers) and the JX-2 HALF interchange (two left slips) with a stem from the east end of R6-5 (= L33 south part, re-routed).
// Same method and frame as G7c / G7d (JX-3, J1-N), but: the arm is J1-E, the stem is ONE exact R3 alignment (straight - spiral - arc - spiral - straight, buildOpenAlignment) from the R6-5 end (start heading = R6-5 end heading) to the stem start S0 (130 m from the arm axis, perpendicular),
// WATER is checked from the start (G7b / G7d forgot it): stem, slips and the lane zones on the arm must have sc.water <= sc.h - 0.3 everywhere and 35 m of dry ground to the side.
// Run: npx tsx scripts/r6-g7g-tap.ts docs      writes docs/STEP_R6_G7G_OUTPUT.txt, docs/r6_g7g.json (picture / game data), docs/r6_g7g_lines.json (stem line for scripts/r6-export-line.ts)
import { writeFileSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { R6_LINE_DATA } from '../src/roads/r6/R6LineData';
import { tangentLength } from '../src/roads/alignment/Clothoid';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import { minRadius, decelLength, accelLength } from '../src/interchange/Standards';
import { solveLine, resample } from './r6-profile-lib';
import { route, smooth, minRadius as pathRadius } from './r6-route-lib';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h as number; };
const wet = (x: number, z: number) => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-E')!; const ARM_END = arm.s[arm.s.length - 1], PLAZA = 300;
const structs = arm.structs; const onStruct = (s: number) => structs.some((r) => s >= r[0] && s <= r[1]);
const armHd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const armY = (s: number) => { let k = 0; while (k + 2 < arm.s.length && arm.s[k + 1] < s) k++; const t = (s - arm.s[k]) / (arm.s[k + 1] - arm.s[k]); return arm.ys[k] + t * (arm.ys[k + 1] - arm.ys[k]); };
const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
const dpoly = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dseg(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const dRail = (p: number[]) => Math.min(...gen.rail.edges.map((e: any) => dpoly(p, e.xs, e.zs)));
const others = gen.roads.roads.filter((r: any) => r.name !== 'J1-E' && r.name !== 'R6-5' && !/^J1/.test(r.name) && r.name !== 'M8');
const dOther = (p: number[]) => { let m = 1e9; for (const r of others) m = Math.min(m, dpoly(p, r.xs, r.zs)); return m; };
const wetNear = (pts: number[][], buf = 35) => { for (let i = 0; i < pts.length; i += 2) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; for (const o of [0, -buf / 2, buf / 2, -buf, buf]) if (wet(pts[i][0] + nx * o, pts[i][1] + nz * o)) return true; } return false; };
// ---------- inputs (same numbers as G7c / G7d; PROPOSAL = my number) ----------
const STEM0 = 130, Q0 = 22.0, P_OUT = 10.0, P_IN = -11.75, VH = 100, TAPER_EXIT = 91.3, TAPER_ENTRY = 182.5, MARGIN = 20, RMIN6 = 229, RAIL_MIN = 60, ROAD_MIN = 60;
const exitZone = (V: number) => TAPER_EXIT + decelLength(VH, V), entryZone = (V: number) => TAPER_ENTRY + accelLength(VH, V);
const V = 50, R = Math.ceil(minRadius(V) / 5) * 5, Ls = Math.max(30, Math.round((0.7 * V) / 5) * 5), Ts = tangentLength(R, Ls, Math.PI / 2);
const NE = P_OUT + Ts + exitZone(V), SW = -P_IN + Ts + entryZone(V); // arm length needed toward the ring (NE) and toward J1 (SW) from the stem foot, as G7c
pr('R6 STEP G7g: J1-E, JX-1 / JX-2 options (R5 numbers) + JX-2 half interchange. Numbers + game data. npm run build / game run NOT run.');
pr(`J1-E: arm length ${ARM_END.toFixed(0)} m (s from the J1 centre, J1 plaza edge at ${PLAZA} m), structures ${JSON.stringify(structs)}. R5: tap >= 600 m from the plaza edge (s >= ${PLAZA + 600}), >= 1600 m from the next tap and from the ring join (s <= ${(ARM_END - 1600).toFixed(0)}).`);
pr(`Lane-zone budget of ONE half interchange (G7c numbers, V50 slips R ${R} Ls ${Ls} Ts ${Ts.toFixed(0)}, exit zone ${exitZone(V).toFixed(0)}, entry zone ${entryZone(V).toFixed(0)}): ${NE.toFixed(0)} m toward the ring + ${SW.toFixed(0)} m toward J1 = ${(NE + SW).toFixed(0)} m of arm WITHOUT a structure and without water. A FULL interchange needs at least 860 m + the loop (G7c lower bound).`);
// ---------- A. where can a tap stand (ground only) ----------
pr(''); pr('A. TAP WINDOWS on J1-E (zone = s - SW .. s + NE, margin 20 m to a structure, no water within 35 m of the arm in the zone):');
const FULL_SW = -P_IN + Ts + (entryZone(V) - TAPER_ENTRY), FULL_NE = P_OUT + Ts + (exitZone(V) - TAPER_EXIT), TAPER_ON_SW = 100, TAPER_ON_NE = 60; // full-width lane parts must be on ground; the thin ends of the tapers (width <= 2 m) may lie on a deck (shoulder 3 m): PROPOSAL, same idea as G7e on N3
const nearS = (q: number) => onStruct(q) || structs.some((r) => Math.abs(q - r[0]) < MARGIN || Math.abs(q - r[1]) < MARGIN);
const zoneInfo = (s: number) => { let over = 0, w = false; for (let q = s - FULL_SW; q <= s + FULL_NE; q += 5) if (q < arm.s[0] || q > ARM_END || nearS(q)) over += 5; let taper = 0; for (let q = s - SW; q < s - FULL_SW; q += 5) if (onStruct(q)) taper += 5; if (taper > TAPER_ON_SW) over += taper; taper = 0; for (let q = s + FULL_NE; q <= s + NE; q += 5) if (onStruct(q)) taper += 5; if (taper > TAPER_ON_NE) over += taper; for (let i = 0; i < arm.pts.length; i++) { if (arm.s[i] < s - SW || arm.s[i] > s + NE) continue; const a = armHd(i), nx = -a[1], nz = a[0]; for (const o of [-35, 0, 35]) if (wet(arm.pts[i][0] + nx * o, arm.pts[i][1] + nz * o)) w = true; } return { over, w }; };
const okTaps: number[] = []; for (let s = 900; s <= ARM_END - 100; s += 5) { const z = zoneInfo(s); if (z.over === 0 && !z.w) okTaps.push(s); }
const wins: number[][] = []; for (const s of okTaps) { const w = wins[wins.length - 1]; if (w && s - w[1] <= 5) w[1] = s; else wins.push([s, s]); }
pr(`   taps with NO structure and NO water in the zone: ${wins.map((w) => `s ${w[0]} .. ${w[1]}`).join('; ') || 'NONE'}`);
const r5 = (s: number) => ({ plaza: s - PLAZA, ring: ARM_END - s });
// ---------- B. options ----------
pr(''); pr('B. OPTIONS for JX-1 (L27 crosses at s 673) and JX-2 (L33 crosses at s 1607): R5 numbers and zone check');
const opt = (name: string, taps: number[], note: string) => { pr(`   ${name}`); for (const s of taps) { const z = zoneInfo(s), a = r5(s); pr(`      tap s ${s}: ${a.plaza} m from the plaza edge (need 600) ${a.plaza >= 600 ? 'ok' : 'NOT met'}; ${a.ring.toFixed(0)} m to the ring join (need 1600) ${a.ring >= 1600 ? 'ok' : 'NOT met'}; zone s ${(s - SW).toFixed(0)} .. ${(s + NE).toFixed(0)} has ${z.over} m on / near a structure, water ${z.w ? 'YES' : 'no'}`); } if (taps.length === 2) pr(`      tap to tap ${taps[1] - taps[0]} m (need 1600) ${taps[1] - taps[0] >= 1600 ? 'ok' : 'NOT met'}`); pr(`      ${note}`); };
opt('O1 KEEP both (JX-1 + JX-2 as in G5)', [673, 1607], 'two taps 934 m apart, both zones run over viaducts (J1 arm structure data would have to change): FAIL');
opt('O2 MERGE JX-1 + JX-2 into one interchange with a collector road', [1607], 'a collector joins L27 to the same tap: it is a 4-leg interchange (full, needs >= 860 m + loop of ground arm, the ground is only s 1422 .. 2344 = 922 m minus margins and the tap at 1607 has the E3 viaduct in its zone) and the collector duplicates the loop that L46 / L15 / L41 / L6 / L4 / L39 / L53 already make on the north side (R2): FAIL');
opt('O3 MOVE: ONE half interchange on the open ground, L33 south part (R6-5 chain) joins it, L27 ends 90 m before the arm (no crossing)', [1900], 'see C: tap chosen from the windows of A, R5 numbers still NOT met on the ring side (nothing on J1-E can meet them: 900 .. 1437 is viaduct and water)');
opt('O4 ONE tap exactly at JX-2 (s 1607) = L33 crossing as in G5, L27 dropped', [1607], 'zone runs 162 m over the E3 viaduct (J1 arm structure change not allowed): FAIL');
// ---------- C. stem + slips for every tap of the windows ----------
const A5 = R6_LINE_DATA.find((d) => d.name === 'R6-5')!; const nA = A5.pts.length;
interface Join { j: number; A: number[]; yA: number; tA: number[]; removed: number }
const joins: Join[] = []; for (let j = nA - 1; j >= nA - 41; j--) { const a = A5.pts[j - 3], b = A5.pts[Math.min(nA - 1, j + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); joins.push({ j, A: A5.pts[j], yA: A5.ys[j], tA: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], removed: A5.s[nA - 1] - A5.s[j] }); }
pr(''); pr(`C. STEM from a join point on R6-5 (the east end is (${A5.pts[nA - 1][0].toFixed(1)}, ${A5.pts[nA - 1][1].toFixed(1)}), heading north; a join up to 600 m earlier is tried, the part after the join is REPLACED by the stem) to the stem start S0 (${STEM0} m from the arm axis), every tap of the windows (step 5 m)`);
interface Cand { jn: Join; s: number; ia: number; stem: number[][]; len: number; rmin: number; R: number; Lsp: number; grade: number; cut: number; fill: number; yEnd: number; rail: number; road: number; armDist: number; es: any; en: any; score: number; wetStem: boolean; fails: string[] }
let dbg: any = null; const cands: Cand[] = []; const rej: Record<string, number> = {}; const rj = (k: string) => { rej[k] = (rej[k] ?? 0) + 1; };
for (const jn of joins) for (const tapS of okTaps) {
  const { A, yA, tA } = jn; let ia = 0; for (let i = 0; i < arm.s.length; i++) if (Math.abs(arm.s[i] - tapS) < Math.abs(arm.s[ia] - tapS)) ia = i;
  const T = arm.pts[ia], a = armHd(ia), n = [-a[1], a[0]]; const W = (p: number, q: number) => ({ x: T[0] + p * a[0] + q * n[0], z: T[1] + p * a[1] + q * n[1] });
  if ((A[0] - T[0]) * n[0] + (A[1] - T[1]) * n[1] < 0) { rj('R6-5 is on the other side of the arm'); continue; }
  const S0 = W(0, STEM0), dirIn = [-n[0], -n[1]]; // the stem arrives at S0 travelling toward the arm
  { const T0 = arm.pts[ia], a0 = armHd(ia), n0 = [-a0[1], a0[0]]; gen.sample(T0[0] + 130 * n0[0], T0[1] + 130 * n0[1], sc); if (sc.h < armY(arm.s[ia]) - 6) { rj('ground at the stem start > 6 m below the arm (fill)'); continue; } }
  const A2 = [A[0] + 60 * tA[0], A[1] + 60 * tA[1]], S1 = [S0.x + 80 * n[0], S0.z + 80 * n[1]];
  const path = route({ id: 33, origin: 'G7g', pts: [A2, S1], minR: null }, 450); if (!path) { rj('no dry path A -> S0'); continue; }
  const mid = path;
  const raw: number[][] = [A]; for (let d = 20; d < 60; d += 20) raw.push([A[0] + d * tA[0], A[1] + d * tA[1]]); for (const q of mid) raw.push(q); for (let d = 20; d <= 80; d += 20) raw.push([S1[0] - d * n[0], S1[1] - d * n[1]]); raw[raw.length - 1] = [S0.x, S0.z];
  const r20 = resample(raw); const nn = Math.max(4, Math.round(r20.len / 20)); let sp: number[][] = []; for (let i = 0; i <= nn; i++) { const k = (i / nn) * (r20.x.length - 1), q0 = Math.floor(k), q1 = Math.min(r20.x.length - 1, q0 + 1), f = k - q0; sp.push([r20.x[q0] + (r20.x[q1] - r20.x[q0]) * f, r20.z[q0] + (r20.z[q1] - r20.z[q0]) * f]); }
  const FIXA = 3, FIXZ = 5; const startPts = sp.map((q) => [q[0], q[1]]); let bestSp = sp.map((q) => [q[0], q[1]]), bestR = pathRadius(sp);
  for (let it = 0; it < 600 && bestR < RMIN6; it++) { const q = sp.map((v) => [v[0], v[1]]); for (let i = FIXA; i + FIXZ < sp.length; i++) { q[i][0] = sp[i][0] + 0.4 * ((sp[i - 1][0] + sp[i + 1][0]) / 2 - sp[i][0]); q[i][1] = sp[i][1] + 0.4 * ((sp[i - 1][1] + sp[i + 1][1]) / 2 - sp[i][1]); } let sh = 0; for (let i = 0; i < q.length; i++) sh = Math.max(sh, Math.hypot(q[i][0] - startPts[i][0], q[i][1] - startPts[i][1])); if (sh > 300) break; sp = q; const Rn = pathRadius(sp); if (Rn > bestR) { bestR = Rn; bestSp = sp.map((v) => [v[0], v[1]]); } }
  const rs0 = resample(bestSp); const stem: number[][] = rs0.x.map((x, i) => [+x.toFixed(1), +rs0.z[i].toFixed(1)]); const stemLen = rs0.len; const Rst = bestR;
  if (Rst < RMIN6) { rj('stem radius < 229 after smoothing'); continue; }
  const best = { al: { length: stemLen }, Rr: Math.round(Rst), Lsp: 0 };
  const wetStem = wetNear(stem); if (wetStem) { rj('stem on / within 35 m of water'); continue; }
  const yT = armY(arm.s[ia]); const sol = solveLine({ id: 33, origin: 'G7g', pts: stem, minR: null, fixY0: yA, fixY1: yT });
  if (!sol.gradeOK) { rj('stem grade > 4 %'); continue; } if (!dbg || sol.maxCut + sol.maxFill < dbg.v) dbg = { v: sol.maxCut + sol.maxFill, s: arm.s[ia], j: jn.j, cut: sol.maxCut, fill: sol.maxFill, struct: sol.structLen, len: best.al.length, at: [sol.maxCutAt, sol.maxFillAt], wetLen: sol.wetLen, high: sol.highFillLen, y0: sol.y0, y1: sol.y1 };
  if (sol.maxCut > 12 || sol.maxFill > 7 || sol.structLen > 0) { rj('stem cut > 12 / fill > 7 / structure'); continue; }
  const rail = Math.min(...stem.map(dRail)), road = Math.min(...stem.filter((_, i) => i > 0).map(dOther)), armD = Math.min(...stem.map((p) => dpoly(p, arm.pts.map((q) => q[0]), arm.pts.map((q) => q[1]))));
  if (rail < RAIL_MIN) { rj('stem < 60 m from the rail'); continue; } if (road < ROAD_MIN) { rj('stem < 60 m from another road'); continue; }
  // the two slips (same construction as G7d)
  const es = buildOpenAlignment(W(P_OUT + Ts, Q0), [{ ...W(P_OUT, Q0), R, Ls }], W(P_OUT, STEM0)), en = buildOpenAlignment(W(P_IN, STEM0), [{ ...W(P_IN, Q0), R, Ls }], W(P_IN - Ts - 20, Q0));
  const noseS = arm.s[ia] + P_OUT + Ts, mergeS = arm.s[ia] + P_IN - Ts, yN = armY(noseS), yM = armY(mergeS);
  const samp = (al: any, y0: number, y1: number) => { const pts: number[][] = [], ys: number[] = []; let cut = -1e9, fill = -1e9, dr = 1e9, w = false; for (let s = 0; s <= al.length + 1e-6; s += 5) { const q = poseAt(al, Math.min(s, al.length)); const y = y0 + (y1 - y0) * (s / al.length); const g = gnd(q.x, q.z); cut = Math.max(cut, g - y); fill = Math.max(fill, y - g); dr = Math.min(dr, dRail([q.x, q.z])); if (wet(q.x, q.z)) w = true; pts.push([+q.x.toFixed(1), +q.z.toFixed(1)]); ys.push(+y.toFixed(2)); } return { pts, ys, cut, fill, dr, w }; };
  const sEs = samp(es, yN, yT), sEn = samp(en, yT, yM);
  const gEs = Math.abs(yN - yT) / es.length, gEn = Math.abs(yM - yT) / en.length;
  const fails: string[] = []; if (Ts > STEM0 - Q0) fails.push('slip does not fit'); if (es.endGap > 0.5 || en.endGap > 0.5) fails.push('slip gap'); if (Math.max(gEs, gEn) > 0.05) fails.push('slip grade > 5 %'); if (Math.max(sEs.cut, sEn.cut) > 12 || Math.max(sEs.fill, sEn.fill) > 7) fails.push('slip cut / fill'); if (Math.min(sEs.dr, sEn.dr) < RAIL_MIN) fails.push('slip near rail'); if (sEs.w || sEn.w) fails.push('slip on water');
  if (fails.length) { rj('slips: ' + fails.join(', ')); continue; }
  const score = best.al.length + 0.5 * jn.removed + 8 * sol.maxCut + 4 * sol.maxFill + 100 * sol.maxG / 100 * 5;
  cands.push({ jn, s: arm.s[ia], ia, stem, len: best.al.length, rmin: best.Rr, R: best.Rr, Lsp: best.Lsp, grade: sol.maxG, cut: sol.maxCut, fill: sol.maxFill, yEnd: yT, rail, road, armDist: armD, es: { al: es, ...sEs, grade: gEs, yN, noseS }, en: { al: en, ...sEn, grade: gEn, yM, mergeS }, score, wetStem, fails });
}
if (!cands.length && dbg) pr('   closest miss (stem profile): ' + JSON.stringify(dbg));
pr(`   joins x taps tried ${joins.length * okTaps.length}; rejected: ${JSON.stringify(rej)}; feasible ${cands.length}`);
let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
if (!cands.length) { pr('RESULT: no tap with a clean stem + slips. NOT exported.'); writeFileSync(`${dir}/STEP_R6_G7G_OUTPUT.txt`, P.join('\n') + '\n'); process.exit(0); }
cands.sort((p, q) => p.score - q.score);
pr('   best (score = stem length + 0.5 x replaced R6-5 length + 8 x cut + 4 x fill + 5 x grade %):'); for (const c of cands.slice(0, 6)) pr(`     tap s ${c.s.toFixed(0)}, join R6-5 point ${c.jn.j} (replaces ${c.jn.removed.toFixed(0)} m): stem ${c.len.toFixed(0)} m (arc R ${c.R}, Ls ${c.Lsp}), grade ${c.grade.toFixed(1)} %, cut ${c.cut.toFixed(1)} m, fill ${c.fill.toFixed(1)} m, rail ${c.rail.toFixed(0)} m, other road ${c.road.toFixed(0)} m, arm level ${c.yEnd.toFixed(2)}`);
const c = cands[0]; const rs = r5(c.s); const yA = c.jn.yA, A = c.jn.A;
pr(''); pr(`CHOSEN TAP s ${c.s.toFixed(0)} (arm level ${c.yEnd.toFixed(2)} m = ground): R5 ${rs.plaza} m from the plaza edge, ${rs.ring.toFixed(0)} m to the ring join (1600 NOT met, no ground tap can meet it).`);
pr(`   stem: ${c.len.toFixed(0)} m, R ${c.R} m, Ls ${c.Lsp} m, grade ${c.grade.toFixed(1)} %, cut ${c.cut.toFixed(1)} m, fill ${c.fill.toFixed(1)} m, levels ${yA.toFixed(2)} -> ${c.yEnd.toFixed(2)} m, joins R6-5 at point ${c.jn.j} (${A[0].toFixed(1)}, ${A[1].toFixed(1)}), the last ${c.jn.removed.toFixed(0)} m of R6-5 are REPLACED, rail ${c.rail.toFixed(0)} m, other roads ${c.road.toFixed(0)} m, arm ${c.armDist.toFixed(0)} m`);
pr(`   m1 exit slip (arm toward J1 -> stem): ${c.es.al.length.toFixed(0)} m, nose at arm s ${c.es.noseS.toFixed(0)} (level ${c.es.yN.toFixed(2)}), grade ${(c.es.grade * 100).toFixed(1)} %, cut ${c.es.cut.toFixed(1)} m, fill ${c.es.fill.toFixed(1)} m, rail ${c.es.dr.toFixed(0)} m`);
pr(`   m2 entry slip (stem -> arm toward J1): ${c.en.al.length.toFixed(0)} m, merge at arm s ${c.en.mergeS.toFixed(0)} (level ${c.en.yM.toFixed(2)}), grade ${(c.en.grade * 100).toFixed(1)} %, cut ${c.en.cut.toFixed(1)} m, fill ${c.en.fill.toFixed(1)} m, rail ${c.en.dr.toFixed(0)} m`);
const zLo = c.en.mergeS - entryZone(V), zHi = c.es.noseS + exitZone(V); pr(`   lane zones on the arm: s ${zLo.toFixed(0)} .. ${zHi.toFixed(0)}; viaducts E3 ends 1422, E4 starts 2344; exit nose to entry merge ${(c.es.noseS - c.en.mergeS).toFixed(0)} m`);
chk(wetNear(c.stem) === false && !c.es.w && !c.en.w, 'WATER: stem, both slips and 35 m beside the stem are dry (sc.water > sc.h - 0.3 nowhere)');
chk(zoneInfo(c.s).w === false, 'WATER: no water within 35 m of the arm in the lane zones');
chk(zLo >= 1422 + MARGIN && zHi <= 2344 - MARGIN, 'lane zones lie between the viaducts E3 and E4 (20 m margin)');
chk(c.R >= RMIN6, `R3: the stem is straight - spiral - arc - spiral - straight, arc R ${c.R} m >= ${RMIN6} m`);
chk(c.grade <= 4.0001, `R11: stem grade ${c.grade.toFixed(1)} % <= 4 %`);
chk(Math.max(c.es.grade, c.en.grade) <= 0.05, 'slip grades <= 5 %'); chk(c.rail >= RAIL_MIN && Math.min(c.es.dr, c.en.dr) >= RAIL_MIN, `rail >= ${RAIL_MIN} m (stem ${c.rail.toFixed(0)} m, slips ${Math.min(c.es.dr, c.en.dr).toFixed(0)} m)`);
chk(c.road >= ROAD_MIN, `no other game road within ${ROAD_MIN} m of the stem (${c.road.toFixed(0)} m)`); chk(Math.max(c.cut, c.es.cut, c.en.cut) <= 12 && Math.max(c.fill, c.es.fill, c.en.fill) <= 7, 'cut <= 12 m and fill <= 7 m on stem and slips');
chk(c.es.noseS - c.en.mergeS >= 150, 'exit nose to entry merge >= 150 m (weaveMin)');
pr(''); pr(bad ? `RESULT: ${bad} FAIL (numbers only; NOT built)` : 'RESULT: all checks above PASS (numbers; build / game NOT run here)');
const lines = JSON.parse(readFileSync(`${dir}/r6_g5_lines.json`, 'utf8')).lines as any[]; const L27 = lines.find((l) => l.src_id === 27).pts as number[][];
const armXs = arm.pts.map((q) => q[0]), armZs = arm.pts.map((q) => q[1]); let c27 = 0; const cum27 = [0]; for (let i = 1; i < L27.length; i++) cum27.push(cum27[i - 1] + Math.hypot(L27[i][0] - L27[i - 1][0], L27[i][1] - L27[i - 1][1]));
const dArm = L27.map((p) => dpoly(p, armXs, armZs)); const iX = (() => { let k = 0; for (let i = 1; i < L27.length; i++) if (dArm[i] < dArm[k]) k = i; return k; })();
let iN = iX; while (iN > 0 && dArm[iN] < 90) iN--; let iS = iX; while (iS < L27.length - 1 && dArm[iS] < 90) iS++; c27 = cum27[iX];
pr(''); pr(`L27 (NOT built yet): crosses J1-E at line s ${c27.toFixed(0)}; cut 90 m before the arm (G6 number): north piece 0 .. ${cum27[iN].toFixed(0)} m (${cum27[iN].toFixed(0)} m), south piece ${cum27[iS].toFixed(0)} .. ${cum27[cum27.length - 1].toFixed(0)} m (${(cum27[cum27.length - 1] - cum27[iS]).toFixed(0)} m); gap between the free ends ${Math.hypot(L27[iN][0] - L27[iS][0], L27[iN][1] - L27[iS][1]).toFixed(0)} m.`);
writeFileSync(`${dir}/r6_g7g.json`, JSON.stringify({ join: { j: c.jn.j, s: A5.s[c.jn.j], removed: c.jn.removed }, tapS: c.s, armEnd: ARM_END, stem: c.stem, yA, yEnd: c.yEnd, es: { pts: c.es.pts, ys: c.es.ys, len: c.es.al.length }, en: { pts: c.en.pts, ys: c.en.ys, len: c.en.al.length }, zone: [zLo, zHi], windows: wins, top: cands.slice(0, 6).map((q) => ({ s: q.s, len: q.len, cut: q.cut, fill: q.fill })) }));
writeFileSync(`${dir}/r6_g7g_lines.json`, JSON.stringify({ note: 'G7g: L33 south part re-routed = stem from the east end of R6-5 to the J1-E half interchange; fixY0 = R6-5 end level, fixY1 = arm level at the tap', lines: [{ src_id: 33, name: 'R6-8', fixY0: yA, fixY1: c.yEnd, join: { name: 'R6-5', j: c.jn.j }, pts: c.stem }] }));
writeFileSync(`${dir}/STEP_R6_G7G_OUTPUT.txt`, P.join('\n') + '\n');
