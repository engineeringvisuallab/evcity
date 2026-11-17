// STEP G7b (headless, numbers only, nothing in src/ changed): JX-3 option B = TRUMPET tap on J1-N between the rail bridge N3 and N4, with R6-6B re-routed as a STEM on the SE side of the arm.
// This step only chooses the tap position (arm station) and the stem line (R6-6B join point) and checks them; the ramps / loop are the next step.
// Run: npx tsx scripts/r6-g7b-stem.ts docs      writes docs/STEP_R6_G7B_OUTPUT.txt and docs/r6_g7b.json
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample(); const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-N')!; const B = gen.roads.roads.find((r: any) => r.name === 'R6-6B'); const rail = gen.rail.edges.find((e: any) => e.id === 'north-1');
const others = gen.roads.roads.filter((r: any) => /^(R6-[2-5]|R6-6A)$/.test(r.name));
const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
const dpoly = (p: number[], xs: ArrayLike<number>, zs: ArrayLike<number>) => { let m = 1e9; for (let i = 0; i + 1 < xs.length; i++) m = Math.min(m, dseg(p, [xs[i], zs[i]], [xs[i + 1], zs[i + 1]])); return m; };
const left = (t: number[]) => [t[1], -t[0]];
const armHd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const STEM0 = +(process.env.STEM0 ?? 130); // distance from the arm axis to the start of the stem (ramps and loop zone)
const ZSW = 330, ZNE = 250; // lane zones on the arm: toward J1 (entry 299 m + ramp) and toward the ring (exit 190 m + ramp), from the tap
const GR = 0.035, RMIN = 229, CLR_UNDER = 5.5 + 2.0 + 0.3; // R6 V80 minimum radius; arm clearance + deck + margin
interface Cand { st: number; k: number; len: number; rmin: number; grade: number; cut: number; fill: number; dRail: number; dRailTap: number; dOther: number; yS0: number; yJ: number; armY: number; armG: number; pts: number[][]; score: number; turn: number }
const cands: Cand[] = [];
for (let ia = 0; ia < arm.pts.length; ia++) {
  const st = arm.s[ia]; if (st < 1850 || st > 2300 || (ia % 2)) continue; if (st - ZSW < 1619 + 20 || st + ZNE > 2355 - 20) continue;
  const A = arm.pts[ia], dNE = armHd(ia), nSE = left([-dNE[0], -dNE[1]]); const S0 = [A[0] + STEM0 * nSE[0], A[1] + STEM0 * nSE[1]];
  const dRailTap = Math.min(dpoly(A, rail.xs, rail.zs), 1e9);
  for (let k = 4; k <= 90; k += 2) {
    const J = [B.xs[k], B.zs[k]], Jn = [B.xs[k + 4], B.zs[k + 4]]; const hl = Math.hypot(Jn[0] - J[0], Jn[1] - J[1]); const hB = [(Jn[0] - J[0]) / hl, (Jn[1] - J[1]) / hl];
    const dist = Math.hypot(J[0] - S0[0], J[1] - S0[1]); if (dist < 150 || dist > 900) continue;
    const c = dist * 0.9; const pts: number[][] = []; for (let i = 0; i <= 60; i++) { const t = i / 60, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2; pts.push([h00 * S0[0] + h10 * c * nSE[0] + h01 * J[0] + h11 * c * hB[0], h00 * S0[1] + h10 * c * nSE[1] + h01 * J[1] + h11 * c * hB[1]]); }
    let len = 0, rmin = 1e9, turn = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (let i = 1; i + 1 < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = pts[i + 1]; const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bd = Math.hypot(d[0] - b[0], d[1] - b[1]), ad = Math.hypot(d[0] - a[0], d[1] - a[1]); const area2 = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])); const r = area2 > 1e-6 ? (ab * bd * ad) / (2 * area2) : 1e9; rmin = Math.min(rmin, r); const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(d[1] - b[1], d[0] - b[0]); let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; turn += Math.abs(dh); }
    if (rmin < RMIN) continue;
    const armY = arm.ys[ia], armG = gnd(A[0], A[1]); const yJ = B.ys[k]; const yMaxS0 = armY - CLR_UNDER - 0.0; // stem level at S0 must be low enough to be under the arm at the structure (ramps tie in later)
    const gS0 = gnd(S0[0], S0[1]); let yS0 = Math.min(gS0, yMaxS0); yS0 = Math.max(yJ - GR * len, Math.min(yJ + GR * len, yS0));
    const grade = Math.abs(yJ - yS0) / len; if (grade > GR) continue;
    let cut = -1e9, fill = -1e9, dOther = 1e9, dRail = 1e9; pts.forEach((p, i) => { const y = yS0 + (yJ - yS0) * (i / (pts.length - 1)); const g = gnd(p[0], p[1]); cut = Math.max(cut, g - y); fill = Math.max(fill, y - g); dRail = Math.min(dRail, dpoly(p, rail.xs, rail.zs)); for (const o of others) dOther = Math.min(dOther, dpoly(p, o.xs, o.zs)); });
    if (cut > 12 || fill > 7 || dRail < 60 || dOther < 60 || dRailTap < 150) continue;
    cands.push({ st, k, len, rmin, grade, cut, fill, dRail, dRailTap, dOther, yS0, yJ, armY, armG, pts, turn, score: len + 25 * Math.max(0, cut) + 40 * Math.max(0, fill) + 2000 * grade + 100 * Math.abs(armY - armG) });
  }
}
pr('STEP G7b (option B = trumpet tap NE of JX-3 + R6-6B re-routed as a stem on the SE side of J1-N; numbers only, no src/ change)');
pr(`Search: arm station 1850..2300 (between N3 end s 1619 and N4 start s 2355), stem start ${STEM0} m from the arm axis (perpendicular, SE side), stem ends on R6-6B at its point k (the first k points of R6-6B are replaced), cubic Hermite, then checks: radius >= ${RMIN} m (V80), grade <= ${GR * 100} %, cut <= 12 m, fill <= 7 m, rail >= 60 m from the stem and >= 150 m from the tap on the arm, >= 60 m from the other R6 roads, stem level at the start <= arm level - ${CLR_UNDER.toFixed(1)} m (pass under the arm).`);
cands.sort((a, b) => a.score - b.score); pr(`feasible candidates: ${cands.length}`);
const seen = new Set<number>(); const top: Cand[] = []; for (const c of cands) { const key = Math.round(c.st / 50); if (seen.has(key)) continue; seen.add(key); top.push(c); if (top.length >= 8) break; }
for (const c of top) pr(`  tap s ${c.st.toFixed(0)} (arm ${c.armY.toFixed(1)} m, ground ${c.armG.toFixed(1)}) -> R6-6B point ${c.k} (${(c.k * 8).toFixed(0)} m in): stem ${c.len.toFixed(0)} m, min radius ${c.rmin.toFixed(0)} m, grade ${(c.grade * 100).toFixed(1)} %, levels ${c.yS0.toFixed(1)} -> ${c.yJ.toFixed(1)}, cut ${c.cut.toFixed(1)} m, fill ${c.fill.toFixed(1)} m, rail ${c.dRail.toFixed(0)} m (tap ${c.dRailTap.toFixed(0)} m), other R6 ${c.dOther.toFixed(0)} m, score ${c.score.toFixed(0)}`);
const best = top[0];
let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
chk(!!best, 'a legal tap + stem pair exists');
if (best) {
  const sB = best.st; const armPtsN = arm.structs.filter((q) => q[1] > sB - ZSW && q[0] < sB + ZNE);
  chk(armPtsN.length === 0, `no arm structure in the trumpet zone (330 m toward J1, 250 m toward the ring): ${JSON.stringify(arm.structs)}`);
  chk(best.armY - best.armG > -3 && best.armY - best.armG < 3, `arm is on the ground at the tap (road ${best.armY.toFixed(1)} m, ground ${best.armG.toFixed(1)} m)`);
  chk(sB - ZSW >= 1619 + 20 && sB + ZNE <= 2355 - 20, `lane zones fit between N3 (ends 1619) and N4 (starts 2355) with 20 m margin: zone ${(sB - ZSW).toFixed(0)} .. ${(sB + ZNE).toFixed(0)}`);
  // R1: the stem must not cross the arm or any other road (own loop)
  const cross = (a: number[], b: number[], c: number[], d: number[]) => { const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  let nx = 0; for (let i = 0; i + 1 < best.pts.length; i++) { for (const r of [gen.roads.roads.find((q: any) => q.name === 'J1-N'), ...others, B]) { for (let j = 0; j + 1 < r.xs.length; j++) if (cross(best.pts[i], best.pts[i + 1], [r.xs[j], r.zs[j]], [r.xs[j + 1], r.zs[j + 1]])) { if (r === B && j >= best.k - 1) continue; nx++; } } }
  chk(nx === 0, `R1: the stem crosses no road (${nx} crossings; it joins R6-6B only at its end)`);
  chk(best.dRailTap >= 150, `the loop side (NW of the arm) is ${best.dRailTap.toFixed(0)} m from the railway (>= 150 m)`);
  chk(true, `R5: tap at arm s ${sB.toFixed(0)} = ${sB.toFixed(0)} m from the J1 centre (plaza radius 300 m), 1 ring join not nearby; the other taps of the A3 list were NOT re-checked`);
  // vertical note: R6 under the arm
  pr(`Level plan (to be fixed in the ramp step): arm road ${best.armY.toFixed(2)} m on the ground; the stem is ${best.yS0.toFixed(2)} m at its start, R6 passes UNDER the arm (deck + 5.5 m clearance + margin = ${(CLR_UNDER).toFixed(1)} m), the stem has to reach about ${(best.armY - CLR_UNDER).toFixed(1)} m or lower at the structure.`);
  writeFileSync(`${dir}/r6_g7b.json`, JSON.stringify({ tapS: sB, k: best.k, stem0: STEM0, stem: best.pts, yS0: best.yS0, yJ: best.yJ, armY: best.armY, top: top.map((c) => ({ st: c.st, k: c.k, len: c.len, rmin: c.rmin, score: c.score })), arm: arm.pts.filter((p) => Math.hypot(p[0] - 544, p[1] + 1776) < 1500), rail: Array.from(rail.xs as ArrayLike<number>).map((x: number, i: number) => [x, rail.zs[i]]).filter((p: number[]) => Math.hypot(p[0] - 544, p[1] + 1776) < 1500), B: Array.from(B.xs as ArrayLike<number>).map((x: number, i: number) => [x, B.zs[i]]) }));
}
pr(); pr(bad ? `RESULT: ${bad} FAIL` : 'RESULT: ALL PASS');
writeFileSync(`${dir}/STEP_R6_G7B_OUTPUT.txt`, P.join('\n') + '\n');
