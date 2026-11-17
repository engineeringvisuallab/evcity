// STEP G7d (headless, numbers only, nothing in src/ changed): JX-3 OPTION A = HALF interchange (two SE left slips only, no loop, no NW side).
// Re-runs the G7b tap + stem search for taps near s 2025 with the real lane-zone budget of G7c (V50 slips, exit taper 1:25, entry taper 1:50), and measures how far the SW end of the entry zone runs onto the rail bridge N3 (extra lane needed there).
// Differences to G7b: the stem does NOT pass under the arm any more (no NW side), the loop-side rail rule is dropped (the slips are checked against the rail directly), every arm point is tried, not every 2nd, and ALL feasible taps are listed.
// Run: npx tsx scripts/r6-g7d-tap.ts docs      writes docs/STEP_R6_G7D_OUTPUT.txt and docs/r6_g7d.json
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { tangentLength } from '../src/roads/alignment/Clothoid';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import { minRadius, decelLength, accelLength } from '../src/interchange/Standards';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample(); const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-N')!; const B = gen.roads.roads.find((r: any) => r.name === 'R6-6B'); const rail = gen.rail.edges.find((e: any) => e.id === 'north-1');
const others = gen.roads.roads.filter((r: any) => /^(R6-[2-5]|R6-6A)$/.test(r.name));
const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
const dpoly = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dseg(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const left = (t: number[]) => [t[1], -t[0]];
const armHd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const STEM0 = 130, Q0 = 22.0, P_OUT = 10.0, P_IN = -11.75, VH = 100, TAPER_EXIT = 91.3, TAPER_ENTRY = 182.5; // same inputs as G7c
const N3_END = 1619, N3_START = 1526, N4_START = 2355, MARGIN = 20, HI = N4_START - MARGIN;
const V = 50; const R = Math.ceil(minRadius(V) / 5) * 5, Ls = Math.max(30, Math.round((0.7 * V) / 5) * 5), Ts = tangentLength(R, Ls, Math.PI / 2);
const NE = P_OUT + Ts + TAPER_EXIT + decelLength(VH, V), SW = -P_IN + Ts + TAPER_ENTRY + accelLength(VH, V);
const WATER_BUF = +(process.env.WBUF ?? 35); const wet = (x: number, z: number) => { gen.sample(x, z, sc); return sc.water != null && sc.water > sc.h - 0.3; };
const wetNear = (pts: number[][]) => { for (let i = 0; i < pts.length; i += 2) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; for (const o of [-WATER_BUF, -WATER_BUF / 2, 0, WATER_BUF / 2, WATER_BUF]) if (wet(pts[i][0] + nx * o, pts[i][1] + nz * o)) return true; } return false; };
const GR = 0.035, RMIN = 229; // R6 V80 minimum radius, stem grade
interface Cand { cs: number; st: number; k: number; len: number; rmin: number; grade: number; cut: number; fill: number; dRail: number; dOther: number; yS0: number; yJ: number; armY: number; armG: number; pts: number[][]; score: number; zLo: number; zHi: number; onN3: number }
const cands: Cand[] = []; const rej: Record<string, number> = {}; const rj = (k: string) => { rej[k] = (rej[k] ?? 0) + 1; };
const herm = (P0: number[], T0: number[], P1: number[], T1: number[], c0: number, c1: number, n: number) => { const o: number[][] = []; for (let i = 0; i <= n; i++) { const t = i / n, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2; o.push([h00 * P0[0] + h10 * c0 * T0[0] + h01 * P1[0] + h11 * c1 * T1[0], h00 * P0[1] + h10 * c0 * T0[1] + h01 * P1[1] + h11 * c1 * T1[1]]); } return o; };
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const radiusOf = (pts: number[][]) => { let rmin = 1e9; for (let i = 1; i + 1 < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = pts[i + 1]; const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bd = Math.hypot(d[0] - b[0], d[1] - b[1]), ad = Math.hypot(d[0] - a[0], d[1] - a[1]); const area2 = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])); rmin = Math.min(rmin, area2 > 1e-6 ? (ab * bd * ad) / (2 * area2) : 1e9); } return rmin; };
// waypoint grid (east and west of the lake): the stem goes S0 -> W -> J as two cubic Hermite pieces with a common heading at W
const WPTS: number[][] = []; for (let x = 640; x <= 1250; x += 30) for (let z = -1950; z <= -1350; z += 30) WPTS.push([x, z]);
for (let ia = 0; ia < arm.pts.length; ia++) {
  const st = arm.s[ia]; if (st < 1960 || st > 2110) continue;
  const zLo = st - SW, zHi = st + NE; const onN3 = Math.max(0, N3_END - zLo);
  if (zHi > HI) { rj('zoneNE'); continue; }
  const A = arm.pts[ia], dNE = armHd(ia), nSE = left([-dNE[0], -dNE[1]]); const S0 = [A[0] + STEM0 * nSE[0], A[1] + STEM0 * nSE[1]];
  if (wet(S0[0], S0[1])) { rj('S0wet'); continue; }
  for (let k = 40; k <= Math.min(B.xs.length - 6, 112); k += 2) {
    const J = [B.xs[k], B.zs[k]], Jn = [B.xs[k + 4], B.zs[k + 4]]; const hB = norm([Jn[0] - J[0], Jn[1] - J[1]]);
    const yJ = B.ys[k]; const gS0 = gnd(S0[0], S0[1]);
    for (const D1 of [0, 60, 120, 180, 260, 360]) for (const D2 of [0, 80, 160, 240, 340, 460]) for (const RS of [250, 320]) {
      // exact alignment (R3): straight - spiral - arc - spiral - straight, PI 1 straight ahead of S0 (the slips fix the start heading), PI 2 on the back tangent of R6-6B at the join point
      if (D1 === 0 && D2 === 0) continue; const LSP = 70;
      const P1 = { x: S0[0] + D1 * nSE[0], z: S0[1] + D1 * nSE[1] }, P2 = { x: J[0] - D2 * hB[0], z: J[1] - D2 * hB[1] }; const pis = D1 === 0 ? [{ ...P2, R: RS, Ls: LSP }] : D2 === 0 ? [{ ...P1, R: RS, Ls: LSP }] : [{ ...P1, R: RS, Ls: LSP }, { ...P2, R: RS, Ls: LSP }];
      let al: any; try { al = buildOpenAlignment({ x: S0[0], z: S0[1] }, pis, { x: J[0], z: J[1] }); } catch { rj('build'); continue; }
      if (al.straights.some((q: number) => q < -0.01) || al.endGap > 0.5 || al.endHeadingGapDeg > 0.5) { rj('geom'); continue; }
      const pts: number[][] = []; for (let q = 0; q <= al.length + 1e-6; q += 10) { const o = poseAt(al, Math.min(q, al.length)); pts.push([o.x, o.z]); } pts.push([J[0], J[1]]);
      const W = [0];
      const rmin = RS; // exact arc radius
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      let yS0 = Math.max(yJ - GR * len, Math.min(yJ + GR * len, gS0)); const grade = Math.abs(yJ - yS0) / len; if (grade > GR) { rj('grade'); continue; }
      if (wetNear(pts)) { rj('water'); continue; }
      const armY = arm.ys[ia], armG = gnd(A[0], A[1]); let cut = -1e9, fill = -1e9, dOther = 1e9, dRail = 1e9;
      pts.forEach((p, i) => { const y = yS0 + (yJ - yS0) * (i / (pts.length - 1)); const g = gnd(p[0], p[1]); cut = Math.max(cut, g - y); fill = Math.max(fill, y - g); dRail = Math.min(dRail, dpoly(p, rail.xs, rail.zs)); for (const o of others) dOther = Math.min(dOther, dpoly(p, o.xs, o.zs)); });
      if (cut > 12 || fill > 7 || dRail < 60 || dOther < 60) { rj(cut > 12 ? 'cut' : fill > 7 ? 'fill' : dRail < 60 ? 'rail' : 'otherR6'); continue; }
      cands.push({ cs: W ? 1 : 0, st, k, len, rmin, grade, cut, fill, dRail, dOther, yS0, yJ, armY, armG, pts, zLo, zHi, onN3, score: len + 25 * Math.max(0, cut) + 40 * Math.max(0, fill) + 2000 * grade + 100 * Math.abs(armY - armG) + 3 * onN3 });
    }
  }
}
pr('STEP G7d REDO with water check (JX-3 option A = half interchange: two SE left slips only; tap + stem re-search near s 2025; numbers only, NO src/ change; build / game NOT run)');
pr(`Inputs (same as G7c): V${V} slips R ${R} m, Ls ${Ls} m, Ts ${Ts.toFixed(1)} m; zone NE of the tap ${NE.toFixed(0)} m (nose + exit taper 1:25 + decel), SW of the tap ${SW.toFixed(0)} m (merge + accel + entry taper 1:50); N3 deck s ${N3_START}..${N3_END}, N4 river viaduct starts s ${N4_START} (margin ${MARGIN} m -> NE end must be <= ${HI}).`);
pr(`Search: every arm point at s 1960..2110, stem start ${STEM0} m SE of the arm, ends on R6-6B at point k; stem radius >= ${RMIN} m, grade <= ${GR * 100} %, cut <= 12, fill <= 7, rail >= 60 m, other R6 >= 60 m, no water within ${WATER_BUF} m (added in the G7e redo: the first G7d result ran the stem through a lake). The stem no longer passes under the arm (no NW side).`);
pr(`rejected by: ${JSON.stringify(rej)}`);
const legal = cands.filter((c) => c.zHi <= HI);
pr(`feasible (stem OK): ${cands.length}; of them with NE end <= ${HI}: ${legal.length}`);
legal.sort((a, b) => a.score - b.score);
const byTap = new Map<number, Cand>(); for (const c of legal) { const key = Math.round(c.st); if (!byTap.has(key)) byTap.set(key, c); }
const list = [...byTap.values()].sort((a, b) => a.score - b.score);
pr('Best stem per tap station (sorted by score; onN3 = metres of the entry-zone taper end that lie on the N3 deck):');
for (const c of list.slice(0, 12)) pr(`  tap s ${c.st.toFixed(0)} (arm ${c.armY.toFixed(1)} m, ground ${c.armG.toFixed(1)}): zone ${c.zLo.toFixed(0)}..${c.zHi.toFixed(0)}, onN3 ${c.onN3.toFixed(0)} m -> R6-6B pt ${c.k} (${(c.k * 8)} m in), stem ${c.len.toFixed(0)} m (tangent x${c.cs}), R ${c.rmin.toFixed(0)}, grade ${(c.grade * 100).toFixed(1)} %, levels ${c.yS0.toFixed(1)} -> ${c.yJ.toFixed(1)}, cut ${c.cut.toFixed(1)}, fill ${c.fill.toFixed(1)}, rail ${c.dRail.toFixed(0)} m, score ${c.score.toFixed(0)}`);
const sts = list.map((c) => c.st); pr(`taps with a legal stem: ${sts.length ? Math.min(...sts).toFixed(0) + ' .. ' + Math.max(...sts).toFixed(0) : 'none'} (${sts.length} stations)`);
const noN3 = list.filter((c) => c.onN3 <= 0); const lowN3 = [...list].sort((a, b) => a.onN3 - b.onN3)[0];
pr(`taps with NO N3 overlap: ${noN3.length}; smallest overlap among legal taps: ${lowN3 ? lowN3.onN3.toFixed(0) + ' m at s ' + lowN3.st.toFixed(0) : 'n/a'}`);
let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
const best = list[0]; chk(!!best, 'a legal tap + stem pair exists for the half interchange');
if (best) {
  chk(best.zHi <= HI, `NE end of the lane zones ${best.zHi.toFixed(0)} <= ${HI} (N4 viaduct starts ${N4_START}, margin ${MARGIN} m)`);
  chk(best.onN3 <= 60, `entry-zone taper end on N3 deck ${best.onN3.toFixed(0)} m (<= 60 m, N3 deck needs an extra lane there; N3 spans ${N3_START}..${N3_END} = ${N3_END - N3_START} m)`);
  chk(Math.abs(best.armY - best.armG) < 3, `arm on the ground at the tap (road ${best.armY.toFixed(1)}, ground ${best.armG.toFixed(1)})`);
  chk(true, `R5: tap at arm s ${best.st.toFixed(0)} = ${best.st.toFixed(0)} m from the J1 centre; other taps of the A3 list NOT re-checked`);
  writeFileSync(`${dir}/r6_g7d.json`, JSON.stringify({ tapS: best.st, k: best.k, stem0: STEM0, stem: best.pts, yS0: best.yS0, yJ: best.yJ, zone: [best.zLo, best.zHi], onN3: best.onN3, V, R, Ls, Ts, list: list.map((c) => ({ st: c.st, k: c.k, len: c.len, onN3: c.onN3, score: c.score })) }));
}
pr(); pr(bad ? `RESULT: ${bad} FAIL` : 'RESULT: ALL PASS');
writeFileSync(`${dir}/STEP_R6_G7D_OUTPUT.txt`, P.join('\n') + '\n');
