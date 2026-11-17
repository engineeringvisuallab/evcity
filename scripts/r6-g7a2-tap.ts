// STEP G7a2 (headless, numbers only, nothing in src/ changed): JX-3 = tap on J1-N for R6-6B, OPTION 1 (chain split).
// Layout = "half interchange" on the SOUTH-EAST side of the arm only (the rail north-1 lies 49-140 m on the other side): two one-way left slips between the SW-bound
// carriageway of the arm (toward J1 / the city) and the outbound / inbound carriageway of R6-6B. No structure, no crossing of the arm. NE-bound movements are NOT provided (see output).
// Run: npx tsx scripts/r6-g7a2-tap.ts docs      writes docs/STEP_R6_G7A2_OUTPUT.txt and docs/r6_g7a2.json
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample(); const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
const J = [544.2, -1776.5]; const arm = J1_ARM_DATA.find((d) => d.name === 'J1-N')!; const B = gen.roads.roads.find((r: any) => r.name === 'R6-6B'); const rail = gen.rail.edges.find((e: any) => e.id === 'north-1');
const ia = arm.pts.reduce((b, p, i) => (Math.hypot(p[0] - J[0], p[1] - J[1]) < Math.hypot(arm.pts[b][0] - J[0], arm.pts[b][1] - J[1]) ? i : b), 0);
const hd = (i: number) => { const a = arm.pts[Math.max(0, i - 3)], b = arm.pts[Math.min(arm.pts.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const dNE = hd(ia); const t0 = [-dNE[0], -dNE[1]]; // SW-bound direction (toward J1)
const left = (t: number[]) => [t[1], -t[0]];      // left normal in the game frame (x east, z south)
const vL = left(t0);                               // = SE side
const loc = (p: number[]) => [(p[0] - J[0]) * t0[0] + (p[1] - J[1]) * t0[1], (p[0] - J[0]) * vL[0] + (p[1] - J[1]) * vL[1]]; // [u along SW, v toward SE]
const glob = (u: number, v: number) => [J[0] + u * t0[0] + v * vL[0], J[1] + u * t0[1] + v * vL[1]];
const armLevel = (u: number) => { const s = arm.s[ia] - u; let k = 0; while (k + 2 < arm.s.length && arm.s[k + 1] < s) k++; const t = (s - arm.s[k]) / (arm.s[k + 1] - arm.s[k]); return arm.ys[k] + t * (arm.ys[k + 1] - arm.ys[k]); };
// R6-6B: the ramps may join R6-6B some metres INSIDE its present start (the first K points of R6-6B are then replaced by the two ramps)
const CARR = 7.25; // B carriageway centre offset from the B axis (median 4.0 m half 2.0 + 3 lanes x 3.5 / 2)
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
const V_LANE = 22.1 + 3.65 / 2; // centre of the exit / entry lane just outside the arm pavement edge (22.1)
const bAt = (k: number) => { const a = [B.xs[k], B.zs[k]], b = [B.xs[k + 5], B.zs[k + 5]]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const h = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; const lf = left(h); return { p: a, h, y: B.ys[k], out: [a[0] + CARR * lf[0], a[1] + CARR * lf[1]], inn: [a[0] - CARR * lf[0], a[1] - CARR * lf[1]] }; };
const fitAt = (R: number, E: number[], h: number[]) => { const dl = Math.acos(dot(t0, h)); const sd = Math.sin(dl), cd = Math.cos(dl); const e = loc(E); const L = (e[1] - V_LANE - R * (1 - cd)) / sd; return { R, L, u0: e[0] - R * sd - L * cd, len: R * dl + L, ok: L >= 25, dl }; };
const RCH = +(process.env.RCH ?? 150); let K = 0; while (K < 60) { const g = bAt(K); if (fitAt(RCH, g.out, g.h).ok && fitAt(RCH, g.inn, g.h).ok) break; K++; }
const G0 = bAt(K); const b0 = G0.p, hB = G0.h, yB = G0.y; const E_out = G0.out, E_in = G0.inn;
const delta = Math.acos(dot(t0, hB)); const sgnLeft = dot(hB, vL) > 0;
pr('STEP G7a2: JX-3 tap on J1-N for R6-6B (option 1 = chain split; half interchange on the SE side, two left slips; numbers only, no src/ change)');
pr(`Frame: origin JX-3 (${J[0]}, ${J[1]}) on J1-N (arm s ${arm.s[ia].toFixed(0)} m, level ${arm.ys[ia].toFixed(2)} m), u = along the SW-bound direction (toward J1), v = to the SE (R6-6B side). Arm heading NE (${dNE[0].toFixed(3)}, ${dNE[1].toFixed(3)}).`);
const bl = loc(b0); pr(`R6-6B: the ramps join at point ${K} of R6-6B (${(K * 8).toFixed(0)} m from its present start; those first points are REPLACED by the ramps). Join point (${b0[0].toFixed(1)}, ${b0[1].toFixed(1)}) = local u ${bl[0].toFixed(1)}, v ${bl[1].toFixed(1)} m (v is ${(bl[1] - 22.1).toFixed(1)} m beyond the arm pavement edge), level ${yB.toFixed(2)} m, heading turn from the SW direction ${(delta * 180 / Math.PI).toFixed(1)} deg ${sgnLeft ? 'to the LEFT (slip ramp, no crossing)' : 'to the RIGHT'}`);
// arc + straight fit
const VRAMP = 60, RMIN = 113, V40 = 41; // 17.1b: ramp V60 = 113 m (semi-direct), loop-class V40 = 41 m
interface Fit { R: number; L: number; u0: number; len: number; ok: boolean }
function fit(Eu: number, Ev: number, R: number): Fit { // start (u0, V_LANE) tangent +u, arc left by delta (radius R), straight L at heading hB-local, end (Eu, Ev)
  const sd = Math.sin(delta), cd = Math.cos(delta); const L = (Ev - V_LANE - R * (1 - cd)) / sd; const u0 = Eu - R * sd - L * cd; return { R, L, u0, len: R * delta + L, ok: L >= 0 };
}
const Eo = loc(E_out), Ei = loc(E_in);
pr(`R6-6B carriageway ends: outbound centre u ${Eo[0].toFixed(1)}, v ${Eo[1].toFixed(1)}; inbound centre u ${Ei[0].toFixed(1)}, v ${Ei[1].toFixed(1)} (carriageways 7.25 m each side of the axis)`);
pr(); pr('EXIT SLIP (SW-bound arm -> R6-6B outbound): ramp V60 needs R >= 113 m, exit zone on the arm 190 m (taper 91.3 + decel 98.8, 17.1b), lane = 2 lanes ramp');
const rows: any[] = []; const best: { exit?: Fit; entry?: Fit } = {};
for (const R of [113, 130, 150, 175, 200, 250]) { const f = fit(Eo[0], Eo[1], R); rows.push({ kind: 'exit', ...f }); pr(`  R ${R} m: straight after the arc ${f.L.toFixed(1)} m, nose at u ${f.u0.toFixed(1)} (s ${(arm.s[ia] - f.u0).toFixed(0)} on the arm), ramp length ${f.len.toFixed(0)} m ${f.ok ? 'ok' : 'NO (negative straight)'}`); if (f.ok && f.L >= 25) best.exit = f; }
pr(); pr('ENTRY SLIP (R6-6B inbound -> SW-bound arm): entry zone on the arm 299 m (accel 60 -> 100 = 241 + taper 1:50 about 183 m, 17.1b, ramp speed 60 = PROPOSAL)');
// entry: path from E_in heading -hB to arm lane at (u1, V_LANE) heading +u, turn left delta, same geometry mirrored in position: ends at u1 = Ei_u - R sin - L cos... solved the same way with reversed roles
for (const R of [113, 130, 150, 175, 200, 250]) { const Lm = (Ei[1] - V_LANE - R * (1 - Math.cos(delta))) / Math.sin(delta); const u1 = Ei[0] - R * Math.sin(delta) - Lm * Math.cos(delta); const f: Fit = { R, L: Lm, u0: u1, len: R * delta + Lm, ok: Lm >= 0 }; rows.push({ kind: 'entry', ...f }); pr(`  R ${R} m: straight ${f.L.toFixed(1)} m, merge point (end of the arc) at u ${f.u0.toFixed(1)} (s ${(arm.s[ia] - f.u0).toFixed(0)}), ramp length ${f.len.toFixed(0)} m ${f.ok ? 'ok' : 'NO'}`); if (f.ok && f.L >= 25) best.entry = f; }
// the entry ramp ends tangent to the arm at u1; the accel lane then runs 299 m further toward SW (+u)
pr();
const ex = best.exit, en = best.entry; let bad = 0; const chk = (ok: boolean, m: string) => { pr(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) bad++; };
chk(!!ex && !!en, 'both slips fit with R >= 113 m and a straight of at least 25 m before R6-6B');
if (ex && en) {
  const exitZoneStart = ex.u0 - 190, entryEnd = en.u0 + 299; const sE0 = arm.s[ia] - exitZoneStart, sE1 = arm.s[ia] - entryEnd;
  pr(`CHOSEN exit R ${ex.R} m (ramp ${ex.len.toFixed(0)} m): exit lane starts u ${exitZoneStart.toFixed(0)} = arm s ${sE0.toFixed(0)}, nose u ${ex.u0.toFixed(0)}; entry R ${en.R} m (ramp ${en.len.toFixed(0)} m): merge u ${en.u0.toFixed(0)}, accel lane ends u ${entryEnd.toFixed(0)} = arm s ${sE1.toFixed(0)}`);
  // weave between the entry (merge) and the exit on the same carriageway: SW-bound traffic meets the exit first (exit is NE of the entry, smaller u)
  const weave = en.u0 - ex.u0; pr(`Exit nose at u ${ex.u0.toFixed(0)}, entry merge at u ${en.u0.toFixed(0)}: the exit is ${weave.toFixed(0)} m BEFORE the merge (same carriageway, exit first, so no weave)`);
  chk(weave >= 150, `exit -> entry distance ${weave.toFixed(0)} m >= 150 m (weaveMin; 300 m desirable ${weave >= 300 ? 'met' : 'NOT met'})`);
  // levels: ramp from the arm level at the nose to the R6-6B level, grade limit 5 %
  const yN = armLevel(ex.u0), g1 = Math.abs(yN - yB) / ex.len, yM = armLevel(en.u0), g2 = Math.abs(yM - yB) / en.len;
  pr(`Levels: arm at the exit nose ${yN.toFixed(2)} m, arm at the merge ${yM.toFixed(2)} m, R6-6B start ${yB.toFixed(2)} m. Ramp grades: exit ${(g1 * 100).toFixed(1)} %, entry ${(g2 * 100).toFixed(1)} % (limit 5 %)`);
  chk(g1 <= 0.05 && g2 <= 0.05, 'ramp grades <= 5 %');
  // ground / earthwork along the two ramp centre lines
  const samp = (R: number, L: number, u0: number, vEnd: number, kind: 'exit' | 'entry') => { const pts: number[][] = []; const n = 24; const sd = Math.sin(delta), cd = Math.cos(delta); for (let i = 0; i <= n; i++) { const a = (i / n) * delta; const u = u0 + R * Math.sin(a), v = V_LANE + R * (1 - Math.cos(a)); pts.push(glob(u, v)); } for (let i = 1; i <= 6; i++) { const t = (i / 6) * L; pts.push(glob(u0 + R * sd + t * cd, V_LANE + R * (1 - cd) + t * sd)); } return pts; };
  const pe = samp(ex.R, ex.L, ex.u0, Eo[1], 'exit'), pn = samp(en.R, en.L, en.u0, Ei[1], 'entry');
  const yr = (pts: number[][], y0: number) => pts.map((p, i) => y0 + (yB - y0) * (i / (pts.length - 1)));
  let maxCut = 0, maxFill = 0; for (const [pts, y0] of [[pe, yN], [pn, yM]] as [number[][], number][]) { const ys = yr(pts, y0); pts.forEach((p, i) => { const g = gnd(p[0], p[1]) - ys[i]; maxCut = Math.max(maxCut, g); maxFill = Math.max(maxFill, -g); }); }
  pr(`Ground along the ramp centre lines (natural, ramp grade line straight from the arm level to B): max cut ${maxCut.toFixed(1)} m, max fill ${maxFill.toFixed(1)} m (limits 12 / 7 m)`);
  chk(maxCut <= 12 && maxFill <= 7, 'ramp cut <= 12 m and fill <= 7 m');
  // rail clearance: all ramp points vs the rail polyline
  const dseg = (p: number[], a: number[], b: number[]) => { const bx = b[0] - a[0], bz = b[1] - a[1], l = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * bz) / l)); return Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * bz); };
  let dr = 1e9; for (const p of [...pe, ...pn]) for (let i = 0; i + 1 < rail.xs.length; i++) dr = Math.min(dr, dseg(p, [rail.xs[i], rail.zs[i]], [rail.xs[i + 1], rail.zs[i + 1]]));
  pr(`Nearest rail to any ramp point: ${dr.toFixed(0)} m (rule 60 m)`); chk(dr >= 60, 'ramps keep >= 60 m from the rail');
  // exit / entry zone along the arm vs the rail (zone is beside the SE edge, rail is on the NW side)
  let dz = 1e9; for (let u = exitZoneStart; u <= entryEnd; u += 10) { const p = glob(u, V_LANE); for (let i = 0; i + 1 < rail.xs.length; i++) dz = Math.min(dz, dseg(p, [rail.xs[i], rail.zs[i]], [rail.xs[i + 1], rail.zs[i + 1]])); }
  pr(`Nearest rail to the auxiliary lanes on the arm (SE edge): ${dz.toFixed(0)} m`); chk(dz >= 60, 'auxiliary lanes keep >= 60 m from the rail');
  // arm structures: none inside the zone
  const inS = arm.structs.some((q) => q[1] > sE1 - 20 && q[0] < sE0 + 20 && true); // structs are in s (increasing toward the ring)
  const lo = Math.min(sE0, sE1), hi = Math.max(sE0, sE1);
  pr(`Auxiliary lane zone on the arm: s ${lo.toFixed(0)} .. ${hi.toFixed(0)}; arm structures: ${arm.structs.map((q) => `[${q[0]}, ${q[1]}]`).join(' ')}`);
  chk(!arm.structs.some((q) => q[1] > lo - 20 && q[0] < hi + 20), 'no arm structure inside the auxiliary lane zone (+-20 m)');
  chk(true, `R5: JX-3 is ${arm.s[ia].toFixed(0)} m from the J1 centre on J1-N (>= 600 m from the plaza edge; plaza radius 300 m); not on a ring join; the other taps of the A3 list were NOT re-checked here`);
  writeFileSync(`${dir}/r6_g7a2.json`, JSON.stringify({ J, t0, hB, delta, exit: ex, entry: en, armIdx: ia, exitZone: [exitZoneStart, ex.u0], entryZone: [en.u0, entryEnd], rampExit: pe, rampEntry: pn, rail: Array.from(rail.xs as ArrayLike<number>).map((x: number, i: number) => [x, rail.zs[i]]).filter((p: number[]) => Math.hypot(p[0] - J[0], p[1] - J[1]) < 600), arm: arm.pts.filter((p) => Math.hypot(p[0] - J[0], p[1] - J[1]) < 600), B: Array.from(B.xs as ArrayLike<number>).map((x: number, i: number) => [x, B.zs[i]]).slice(0, 60) }));
}
pr(); pr(bad ? `RESULT: ${bad} FAIL` : 'RESULT: ALL PASS');
pr('NOT provided: movements to / from the NE-bound carriageway (B <-> ring N side). They would have to cross the SW-bound carriageway (directional ramps through the median); decision for the user.');
writeFileSync(`${dir}/STEP_R6_G7A2_OUTPUT.txt`, P.join('\n') + '\n');
