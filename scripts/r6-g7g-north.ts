// STEP G7g part 2 (headless, numbers + game data, nothing in src/ changed): the JX-2 HALF interchange on the NORTH side of J1-E (movements on the RING-BOUND carriageway), with L33's NORTH part (re-routed, = R6-8) as the stem.
// Why north: scripts/r6-g7g-tap.ts found that the SOUTH side (J1-bound carriageway, where R6-5 is) has a basin 10 - 13 m below the arm along s 1650 .. 2040 (no stem / slips without fill > 7 m) and the E3 viaduct blocks s < 1700.
// Frame (left-hand traffic): the ring-bound carriageway is on the north side. p = along the arm toward J1, q = toward the north (stem side). Same slips as G7d: m1 exit slip (arm ring-bound -> stem), m2 entry slip (stem -> arm ring-bound), V50 R 75 Ls 35.
// The stem is ONE road R6-8: it starts at S0 (130 m north of the arm axis, perpendicular, level = arm level at the tap) and runs to the north end of L33 (1531, 422) (free end, L53 is not built).
// Run: npx tsx scripts/r6-g7g-north.ts docs     writes docs/STEP_R6_G7G_NORTH_OUTPUT.txt, docs/r6_g7g_north.json, docs/r6_g7g_lines.json (stem for scripts/r6-export-line.ts)
import { writeFileSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { tangentLength } from '../src/roads/alignment/Clothoid';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import { minRadius, decelLength, accelLength } from '../src/interchange/Standards';
import { solveLine, resample } from './r6-profile-lib';
import { route, minRadius as pathRadius } from './r6-route-lib';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h as number; };
const wet = (x: number, z: number) => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-E')!; const ARM_END = arm.s[arm.s.length - 1]; const structs = arm.structs;
const onStruct = (s: number) => structs.some((r) => s >= r[0] && s <= r[1]); const nearS = (q: number) => onStruct(q) || structs.some((r) => Math.abs(q - r[0]) < 20 || Math.abs(q - r[1]) < 20);
const armHd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const armY = (s: number) => { let k = 0; while (k + 2 < arm.s.length && arm.s[k + 1] < s) k++; const t = (s - arm.s[k]) / (arm.s[k + 1] - arm.s[k]); return arm.ys[k] + t * (arm.ys[k + 1] - arm.ys[k]); };
const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
const dpoly = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dseg(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const dRail = (p: number[]) => Math.min(...gen.rail.edges.map((e: any) => dpoly(p, e.xs, e.zs)));
const others = gen.roads.roads.filter((r: any) => !/^(J1|M8)/.test(r.name));
const dOther = (p: number[]) => { let m = 1e9; for (const r of others) m = Math.min(m, dpoly(p, r.xs, r.zs)); return m; };
const wetNear = (pts: number[][], buf = 35) => { for (let i = 0; i < pts.length; i += 2) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; for (const o of [0, -buf / 2, buf / 2, -buf, buf]) if (wet(pts[i][0] + nx * o, pts[i][1] + nz * o)) return true; } return false; };
const STEM0 = 130, Q0 = 22.0, P_OUT = 10.0, P_IN = -11.75, VH = 100, TAPER_EXIT = 91.3, TAPER_ENTRY = 182.5, RMIN6 = 229, RAIL_MIN = 60, ROAD_MIN = 60;
const exitZone = (V: number) => TAPER_EXIT + decelLength(VH, V), entryZone = (V: number) => TAPER_ENTRY + accelLength(VH, V);
const V = 50, R = Math.ceil(minRadius(V) / 5) * 5, Ls = Math.max(30, Math.round((0.7 * V) / 5) * 5), Ts = tangentLength(R, Ls, Math.PI / 2);
const NE = P_OUT + Ts + exitZone(V), SW = -P_IN + Ts + entryZone(V), FULL_SW = -P_IN + Ts + (entryZone(V) - TAPER_ENTRY), FULL_NE = P_OUT + Ts + (exitZone(V) - TAPER_EXIT);
const TAPER_ON_ENTRY = 100, TAPER_ON_EXIT = 60; // thin taper end (width <= 2 m) may lie on a deck (deck shoulder 3 m): PROPOSAL, as G7e found for N3
pr('R6 STEP G7g part 2: JX-2 HALF interchange on the NORTH side of J1-E + stem R6-8 (= L33 north part). Numbers + game data. npm run build / game run NOT run.');
pr(`Zones (G7c numbers, V50 slips R ${R} Ls ${Ls} Ts ${Ts.toFixed(0)}): toward J1 ${NE.toFixed(0)} m (exit: nose, 115.7 m decel lane, 91.3 m taper), toward the ring ${SW.toFixed(0)} m (entry: merge, 151.5 m accel lane, 182.5 m taper). Full-width parts ${FULL_NE.toFixed(0)} / ${FULL_SW.toFixed(0)} m must be on ground (20 m from a viaduct), the thin taper ends may lie on a deck by <= ${TAPER_ON_EXIT} m (exit) / ${TAPER_ON_ENTRY} m (entry).`);
const zoneInfo = (s: number) => { let over = 0, w = false; for (let q = s - FULL_NE; q <= s + FULL_SW; q += 5) if (q < arm.s[0] || q > ARM_END || nearS(q)) over += 5; let tp = 0; for (let q = s - NE; q < s - FULL_NE; q += 5) if (onStruct(q)) tp += 5; if (tp > TAPER_ON_EXIT) over += tp; tp = 0; for (let q = s + FULL_SW; q <= s + SW; q += 5) if (onStruct(q)) tp += 5; if (tp > TAPER_ON_ENTRY) over += tp; for (let i = 0; i < arm.pts.length; i++) { if (arm.s[i] < s - NE || arm.s[i] > s + SW) continue; const a = armHd(i), nx = -a[1], nz = a[0]; for (const o of [-35, 0, 35]) if (wet(arm.pts[i][0] + nx * o, arm.pts[i][1] + nz * o)) w = true; } return { over, w }; };
const okTaps: number[] = []; for (let s = 900; s <= ARM_END - 100; s += 5) { const z = zoneInfo(s); if (z.over === 0 && !z.w) okTaps.push(s); }
const wins: number[][] = []; for (const s of okTaps) { const w = wins[wins.length - 1]; if (w && s - w[1] <= 5) w[1] = s; else wins.push([s, s]); }
pr(''); pr(`A. TAP WINDOW (north side): ${wins.map((w) => `s ${w[0]} .. ${w[1]}`).join('; ') || 'NONE'}`);
const lines = JSON.parse(readFileSync(`${dir}/r6_g5_lines.json`, 'utf8')).lines as any[]; const L33 = lines.find((l) => l.src_id === 33).pts as number[][];
const iX = (() => { let k = 0, m = 1e9; for (let i = 0; i < L33.length; i++) { const d = dpoly(L33[i], arm.pts.map((q) => q[0]), arm.pts.map((q) => q[1])); if (d < m) { m = d; k = i; } } return k; })();
const E = L33[L33.length - 1]; // north end of L33 (the end that is NOT at R6-5); L33 runs R6-5 -> arm crossing -> E
pr(`L33 (G5, re-routed): ${L33.length} points, crosses J1-E near point ${iX} (${L33[iX].map((v) => v.toFixed(0))}); north end E = (${E[0].toFixed(1)}, ${E[1].toFixed(1)}); the south part (to R6-5) is NOT used (see r6-g7g-tap.ts: south side has a basin).`);
interface Cand { s: number; stem: number[][]; len: number; R: number; grade: number; cut: number; fill: number; yT: number; rail: number; road: number; armD: number; es: any; en: any; zone: number[]; score: number }
const cands: Cand[] = []; const rej: Record<string, number> = {}; const rj = (k: string) => { rej[k] = (rej[k] ?? 0) + 1; }; let dbg: any = null;
for (const tapS of okTaps) {
  let ia = 0; for (let i = 0; i < arm.s.length; i++) if (Math.abs(arm.s[i] - tapS) < Math.abs(arm.s[ia] - tapS)) ia = i;
  const T = arm.pts[ia], a0 = armHd(ia), a = [-a0[0], -a0[1]], n = [-a[1], a[0]]; // frame: p toward J1 (a), q toward the north (n)
  if (n[1] > 0) { rj('frame side is south'); continue; }
  const W = (p: number, q: number) => ({ x: T[0] + p * a[0] + q * n[0], z: T[1] + p * a[1] + q * n[1] });
  const S0 = W(0, STEM0), yT = armY(arm.s[ia]);
  if (gnd(S0.x, S0.z) > yT + 12 || gnd(S0.x, S0.z) < yT - 6) { rj('ground at the stem start too far from the arm level'); continue; }
  const S1 = [S0.x + 60 * n[0], S0.z + 60 * n[1]];
  const path = route({ id: 33, origin: 'G7g', pts: [S1, E], minR: null }, 450); if (!path) { rj('no dry path'); continue; }
  const raw: number[][] = [[S0.x, S0.z], [S0.x + 20 * n[0], S0.z + 20 * n[1]], [S0.x + 40 * n[0], S0.z + 40 * n[1]], ...path]; // first points go straight away from the arm
  const r20 = resample(raw); const nn = Math.max(4, Math.round(r20.len / 20)); let sp: number[][] = []; for (let i = 0; i <= nn; i++) { const k = (i / nn) * (r20.x.length - 1), q0 = Math.floor(k), q1 = Math.min(r20.x.length - 1, q0 + 1), f = k - q0; sp.push([r20.x[q0] + (r20.x[q1] - r20.x[q0]) * f, r20.z[q0] + (r20.z[q1] - r20.z[q0]) * f]); }
  const startPts = sp.map((q) => [q[0], q[1]]); let bestSp = sp.map((q) => [q[0], q[1]]), bestR = pathRadius(sp);
  for (let it = 0; it < 800 && bestR < RMIN6; it++) { const q = sp.map((v) => [v[0], v[1]]); for (let i = 4; i + 1 < sp.length - 1; i++) { q[i][0] = sp[i][0] + 0.4 * ((sp[i - 1][0] + sp[i + 1][0]) / 2 - sp[i][0]); q[i][1] = sp[i][1] + 0.4 * ((sp[i - 1][1] + sp[i + 1][1]) / 2 - sp[i][1]); } let sh = 0; for (let i = 0; i < q.length; i++) sh = Math.max(sh, Math.hypot(q[i][0] - startPts[i][0], q[i][1] - startPts[i][1])); if (sh > 300) break; sp = q; const Rn = pathRadius(sp); if (Rn > bestR) { bestR = Rn; bestSp = sp.map((v) => [v[0], v[1]]); } }
  if (bestR < RMIN6) { rj('stem radius < 229 after smoothing'); continue; }
  const rs0 = resample(bestSp); const stem = rs0.x.map((x, i) => [+x.toFixed(1), +rs0.z[i].toFixed(1)]); stem[0] = [+S0.x.toFixed(1), +S0.z.toFixed(1)];
  if (wetNear(stem)) { rj('stem on / within 35 m of water'); continue; }
  const sol = solveLine({ id: 33, origin: 'G7g', pts: stem, minR: null, fixY0: yT });
  if (!dbg || sol.maxCut + sol.maxFill < dbg.v) dbg = { v: sol.maxCut + sol.maxFill, s: arm.s[ia], cut: sol.maxCut, fill: sol.maxFill, struct: sol.structLen, grade: sol.maxG, len: rs0.len };
  if (!sol.gradeOK) { rj('stem grade > 4 %'); continue; } if (sol.maxCut > 12 || sol.maxFill > 7 || sol.structLen > 0) { rj('stem cut > 12 / fill > 7 / structure'); continue; }
  const rail = Math.min(...stem.map(dRail)), road = Math.min(...stem.map(dOther)), armD = Math.min(...stem.map((p) => dpoly(p, arm.pts.map((q) => q[0]), arm.pts.map((q) => q[1]))));
  if (rail < RAIL_MIN) { rj('stem < 60 m from the rail'); continue; } if (road < ROAD_MIN) { rj('stem < 60 m from another road'); continue; }
  const es = buildOpenAlignment(W(P_OUT + Ts, Q0), [{ ...W(P_OUT, Q0), R, Ls }], W(P_OUT, STEM0)), en = buildOpenAlignment(W(P_IN, STEM0), [{ ...W(P_IN, Q0), R, Ls }], W(P_IN - Ts - 20, Q0));
  const noseS = arm.s[ia] - (P_OUT + Ts), mergeS = arm.s[ia] - (P_IN - Ts), yN = armY(noseS), yM = armY(mergeS); // p toward J1 = decreasing arm s
  const samp = (al: any, y0: number, y1: number) => { const pts: number[][] = [], ys: number[] = []; let cut = -1e9, fill = -1e9, dr = 1e9, w = false; for (let s = 0; s <= al.length + 1e-6; s += 5) { const q = poseAt(al, Math.min(s, al.length)); const y = y0 + (y1 - y0) * (s / al.length); const g = gnd(q.x, q.z); cut = Math.max(cut, g - y); fill = Math.max(fill, y - g); dr = Math.min(dr, dRail([q.x, q.z])); if (wet(q.x, q.z)) w = true; pts.push([+q.x.toFixed(1), +q.z.toFixed(1)]); ys.push(+y.toFixed(2)); } return { pts, ys, cut, fill, dr, w }; };
  const sEs = samp(es, yN, yT), sEn = samp(en, yT, yM); const gEs = Math.abs(yN - yT) / es.length, gEn = Math.abs(yM - yT) / en.length;
  const f: string[] = []; if (Ts > STEM0 - Q0) f.push('slip does not fit'); if (es.endGap > 0.5 || en.endGap > 0.5) f.push('slip gap'); if (Math.max(gEs, gEn) > 0.05) f.push('slip grade > 5 %'); if (Math.max(sEs.cut, sEn.cut) > 12 || Math.max(sEs.fill, sEn.fill) > 7) f.push('slip cut / fill'); if (Math.min(sEs.dr, sEn.dr) < RAIL_MIN) f.push('slip near rail'); if (sEs.w || sEn.w) f.push('slip on water');
  if (f.length) { rj('slips: ' + f.join(', ')); continue; }
  cands.push({ s: arm.s[ia], stem, len: rs0.len, R: bestR, grade: sol.maxG, cut: sol.maxCut, fill: sol.maxFill, yT, rail, road, armD, es: { al: es, ...sEs, grade: gEs, yN, noseS }, en: { al: en, ...sEn, grade: gEn, yM, mergeS }, zone: [arm.s[ia] - NE, arm.s[ia] + SW], score: rs0.len + 8 * sol.maxCut + 4 * sol.maxFill + 5 * sol.maxG });
}
pr(''); pr(`B. STEM R6-8 + SLIPS for every tap of the window (step 5 m): tried ${okTaps.length}; rejected ${JSON.stringify(rej)}; feasible ${cands.length}`);
let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
if (!cands.length) { if (dbg) pr('   closest miss (stem profile): ' + JSON.stringify(dbg)); pr('RESULT: no tap with a clean stem + slips. NOT exported.'); writeFileSync(`${dir}/STEP_R6_G7G_NORTH_OUTPUT.txt`, P.join('\n') + '\n'); process.exit(0); }
cands.sort((p, q) => p.score - q.score);
pr('   best (score = stem length + 8 x cut + 4 x fill + 5 x grade %):'); for (const c of cands.slice(0, 6)) pr(`     tap s ${c.s.toFixed(0)}: stem ${c.len.toFixed(0)} m, min radius ${c.R.toFixed(0)} m, grade ${c.grade.toFixed(1)} %, cut ${c.cut.toFixed(1)} m, fill ${c.fill.toFixed(1)} m, rail ${c.rail.toFixed(0)} m, other road ${c.road.toFixed(0)} m, arm level ${c.yT.toFixed(2)}`);
const c = cands[0];
pr(''); pr(`CHOSEN TAP s ${c.s.toFixed(0)} (arm level ${c.yT.toFixed(2)} m = ground): ${c.s - 300} m from the J1 plaza edge (R5 600 m ok), ${(ARM_END - c.s).toFixed(0)} m to the ring join (R5 1600 m NOT met; nothing on J1-E can meet it: s 900 .. 1437 is viaduct and water).`);
pr(`   stem R6-8: ${c.len.toFixed(0)} m from S0 (${c.stem[0].join(', ')}) to E (${c.stem[c.stem.length - 1].join(', ')}), min radius ${c.R.toFixed(0)} m, grade ${c.grade.toFixed(1)} %, cut ${c.cut.toFixed(1)} m, fill ${c.fill.toFixed(1)} m, level ${c.yT.toFixed(2)} at S0, rail ${c.rail.toFixed(0)} m, other roads ${c.road.toFixed(0)} m, arm ${c.armD.toFixed(0)} m`);
pr(`   m1 exit slip (arm ring-bound -> stem): ${c.es.al.length.toFixed(0)} m, nose at arm s ${c.es.noseS.toFixed(0)} (level ${c.es.yN.toFixed(2)}), grade ${(c.es.grade * 100).toFixed(1)} %, cut ${c.es.cut.toFixed(1)} m, fill ${c.es.fill.toFixed(1)} m, rail ${c.es.dr.toFixed(0)} m`);
pr(`   m2 entry slip (stem -> arm ring-bound): ${c.en.al.length.toFixed(0)} m, merge at arm s ${c.en.mergeS.toFixed(0)} (level ${c.en.yM.toFixed(2)}), grade ${(c.en.grade * 100).toFixed(1)} %, cut ${c.en.cut.toFixed(1)} m, fill ${c.en.fill.toFixed(1)} m, rail ${c.en.dr.toFixed(0)} m`);
pr(`   lane zones on the arm: s ${c.zone[0].toFixed(0)} .. ${c.zone[1].toFixed(0)} (viaducts: E3 ends 1422, E4 starts 2344); exit nose to entry merge ${(c.en.mergeS - c.es.noseS).toFixed(0)} m`);
chk(!wetNear(c.stem) && !c.es.w && !c.en.w, 'WATER: stem, both slips and 35 m beside the stem are dry (sc.water > sc.h - 0.3 nowhere)'); chk(!zoneInfo(c.s).w, 'WATER: no water within 35 m of the arm in the lane zones');
chk(zoneInfo(c.s).over === 0, 'lane zones: full-width parts on ground (20 m from a viaduct), thin taper ends on a deck within the limits');
chk(c.R >= RMIN6, `R3: stem min radius ${c.R.toFixed(0)} m >= ${RMIN6} m (the stem is a smoothed router path, NOT an exact spiral-arc alignment; the slips are exact)`); chk(c.grade <= 4.0001, `R11: stem grade ${c.grade.toFixed(1)} % <= 4 %`);
chk(Math.max(c.es.grade, c.en.grade) <= 0.05, 'slip grades <= 5 %'); chk(c.rail >= RAIL_MIN && Math.min(c.es.dr, c.en.dr) >= RAIL_MIN, `rail >= ${RAIL_MIN} m`); chk(c.road >= ROAD_MIN, `no other game road within ${ROAD_MIN} m of the stem (${c.road.toFixed(0)} m)`);
chk(Math.max(c.cut, c.es.cut, c.en.cut) <= 12 && Math.max(c.fill, c.es.fill, c.en.fill) <= 7, 'cut <= 12 m and fill <= 7 m on stem and slips'); chk(c.en.mergeS - c.es.noseS >= 150, 'exit nose to entry merge >= 150 m (weaveMin)');
pr(''); pr(bad ? `RESULT: ${bad} FAIL (numbers only; NOT built)` : 'RESULT: all checks above PASS (numbers; build / game NOT run here)');
writeFileSync(`${dir}/r6_g7g_north.json`, JSON.stringify({ tapS: c.s, stem: c.stem, yT: c.yT, es: { pts: c.es.pts, ys: c.es.ys, len: c.es.al.length }, en: { pts: c.en.pts, ys: c.en.ys, len: c.en.al.length }, zone: c.zone, windows: wins }));
writeFileSync(`${dir}/r6_g7g_lines.json`, JSON.stringify({ note: 'G7g: L33 NORTH part re-routed = stem R6-8 from the J1-E half interchange (north side) to the L33 north end; fixY0 = arm level at the tap', lines: [{ src_id: 33, name: 'R6-8', fixY0: c.yT, pts: c.stem }] }));
writeFileSync(`${dir}/STEP_R6_G7G_NORTH_OUTPUT.txt`, P.join('\n') + '\n');
