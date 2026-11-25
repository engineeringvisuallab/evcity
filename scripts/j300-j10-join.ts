// J10 STEP 0 JOIN CHECK (headless, real game data, switch OFF vs ON). Run: npx tsx scripts/j300-j10-join.ts docs   Writes docs/J300_J10_JOIN.txt.
// Question: are the J300 arms and the existing R6 (R6-7) / R4 (R4-9) ONE continuous road? Measures position gap, heading, level, section (half width, lanes, median, shoulder),
// the J7-C arm ribbon against the game ribbon, and the roundabout end (arm centre line against the J4 leg axis). PASS / FAIL per line, NOT RUN list at the end.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { J300_ARMS, J300_FRAME, J300_LEGS } from '../src/roads/junction/J300Geometry';
import { J300_STRUCT_C } from '../src/roads/junction/J300StructC';

const mode = process.argv[2];
const NAMES = ['R6-7', 'R6-9', 'R4-9', 'R4-4', 'R4-12'];
if (mode === 'ON' || mode === 'OFF') {
  const { TerrainGenerator } = await import('../src/terrain/TerrainGenerator');
  Config.roads.junctionJ300.enabled = mode === 'ON';
  const g: any = new TerrainGenerator(Config.world.seed);
  const out = (g.roads.roads as any[]).filter((r) => NAMES.includes(r.name)).map((r: any) => ({ name: r.name, xs: Array.from(r.xs), zs: Array.from(r.zs), ys: Array.from(r.ys), hw: r.halfWidth, med: r.medianHalf, laneW: r.laneW, shyOuter: r.shyOuter, shoulder: r.shoulder, lanes: r.lanes, speed: r.speedKmh }));
  console.log('JSON' + JSON.stringify(out)); process.exit(0);
}
const dir = process.argv[2] ?? 'docs'; const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); }; let fails = 0;
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const run = (m: string): Map<string, any> => { const o = execFileSync('npx', ['tsx', 'scripts/j300-j10-join.ts', m], { encoding: 'utf8', maxBuffer: 1 << 29 }); const l = o.split('\n').find((q) => q.startsWith('JSON')); return new Map((JSON.parse((l ?? 'JSON[]').slice(4)) as any[]).map((r) => [r.name, r])); };
const f2 = (v: number, d = 2): string => v.toFixed(d); const deg = (r: number): number => (r * 180) / Math.PI;
const wrap = (a: number): number => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
// heading (deg, atan2(dz, dx)) of a polyline at its END (travel towards the end) or START, over a chord of `ch` m
function headAtEnd(xs: number[], zs: number[], ch = 10): number { const n = xs.length; let j = n - 2, d = 0; while (j > 0 && (d = Math.hypot(xs[n - 1] - xs[j], zs[n - 1] - zs[j])) < ch) j--; return deg(Math.atan2(zs[n - 1] - zs[j], xs[n - 1] - xs[j])); }
function headAtStart(xs: number[], zs: number[], ch = 10): number { const n = xs.length; let j = 1, d = 0; while (j < n - 1 && (d = Math.hypot(xs[j] - xs[0], zs[j] - zs[0])) < ch) j++; return deg(Math.atan2(zs[j] - zs[0], xs[j] - xs[0])); }
function foot(xs: number[], zs: number[], ys: number[], x: number, z: number): { d: number; y: number; i: number } { let b = { d: 1e9, y: 0, i: 0 }; for (let i = 0; i + 1 < xs.length; i++) { const vx = xs[i + 1] - xs[i], vz = zs[i + 1] - zs[i], l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - xs[i]) * vx + (z - zs[i]) * vz) / l2)); const d = Math.hypot(x - xs[i] - t * vx, z - zs[i] - t * vz); if (d < b.d) b = { d, y: ys[i] + (ys[i + 1] - ys[i]) * t, i }; } return b; }

P('J10 STEP 0 JOIN CHECK (headless, real road network OFF vs ON, J300_ARMS / J300_STRUCT_C data)');
P('Targets: gap <= 0.1 m, heading <= 0.5 deg, level gap <= 0.02 m, same lane count and width (half width, median, shoulder).');
const off = run('OFF'), on = run('ON');
const A6: any = J300_ARMS.R6, A4: any = J300_ARMS.R4;
const arm = (A: any) => { const r = A.rows as any[]; return { xs: r.map((q) => q.x), zs: r.map((q) => q.z), ys: r.map((q) => q.y) }; };
const a6 = arm(A6), a4 = arm(A4);
const sa: any[] = (J300_STRUCT_C as any).surfArms; const top6 = sa.find((q) => q.id === 'R6').top, top4 = ((): number => { const a: any = sa.find((q) => q.id === 'R4'); const e = a.pts[a.pts.length - 1]; return e[3] ?? a.top; })(); /* J10: R4 taper, the value AT the join */

// ---------------- R6 far end ----------------
P(''); P('== R6 far end (arm end = old R6-9 start, free end) against R6-7 (the 6 lane road that comes from the south) ==');
const r7 = on.get('R6-7'), r7o = off.get('R6-7'), r9o = off.get('R6-9');
CHK('switch OFF and ON: R6-7 identical (positions, levels)', JSON.stringify(r7.xs) === JSON.stringify(r7o.xs) && JSON.stringify(r7.ys) === JSON.stringify(r7o.ys));
const n7 = r7.xs.length - 1; const e7 = { x: r7.xs[n7], z: r7.zs[n7], y: r7.ys[n7] };
const ae = { x: a6.xs[a6.xs.length - 1], z: a6.zs[a6.zs.length - 1], y: a6.ys[a6.ys.length - 1] };
const s9 = { x: r9o.xs[0], z: r9o.zs[0], y: r9o.ys[0] };
const gapOld = Math.hypot(e7.x - s9.x, e7.z - s9.z), gapNew = Math.hypot(e7.x - ae.x, e7.z - ae.z);
const hdR67 = headAtEnd(r7.xs, r7.zs), hdArmToRing = wrap(headAtEnd(a6.xs, a6.zs) + 180), hdR69 = headAtStart(r9o.xs, r9o.zs);
P(`INFO  R6-7 end (${f2(e7.x, 1)}, ${f2(e7.z, 1)}) level ${f2(e7.y)} heading ${f2(hdR67)} deg | arm end (${f2(ae.x, 1)}, ${f2(ae.z, 1)}) level ${f2(ae.y)} heading to ring ${f2(hdArmToRing)} deg | old R6-9 start (${f2(s9.x, 1)}, ${f2(s9.z, 1)}) level ${f2(s9.y)} heading ${f2(hdR69)} deg`);
P(`INFO  arm end vs the old R6-9 start (R6-9 is gone with the switch ON): gap ${f2(Math.hypot(ae.x - s9.x, ae.z - s9.z))} m (rounded J4 coordinates), heading ${f2(wrap(hdArmToRing - hdR69))} deg, level ${f2(ae.y - s9.y)} m`);
P(`BEFORE (switch OFF, shipped game): R6-7 end -> R6-9 start: gap ${f2(gapOld)} m, heading difference ${f2(wrap(hdR69 - hdR67))} deg, level gap ${f2(s9.y - e7.y)} m   (docs/STEP_21_3_OUTPUT.txt: join "NOT applied: shallow angle 3 deg")`);
P(`AFTER  (switch ON): R6-7 end -> arm end:        gap ${f2(gapNew)} m, heading difference ${f2(wrap(hdArmToRing - hdR67))} deg, level gap ${f2(ae.y - e7.y)} m`);
const bearing = deg(Math.atan2(ae.z - e7.z, ae.x - e7.x));
P(`INFO  direction R6-7 end -> arm end ${f2(bearing)} deg (R6-7 travel heading ${f2(hdR67)}, arm heading ${f2(hdArmToRing)}): the two ends do not even point at each other (${f2(Math.abs(wrap(bearing - hdR67)))} deg off the R6-7 axis)`);
CHK('R6: R6-7 and the arm are ONE continuous road (gap <= 0.1 m, heading <= 0.5 deg, level <= 0.02 m)', gapNew <= 0.1 && Math.abs(wrap(hdArmToRing - hdR67)) <= 0.5 && Math.abs(ae.y - e7.y) <= 0.02, 'a pre-existing gap of the shipped game, NOT created by J300; the fix is bigger than a small change, see section 30');
CHK('R6 section: arm ribbon half width = game R6-7 half width + shoulder', Math.abs(top6 - (r7.hw + r7.shoulder)) < 1e-6, `arm ${top6} m vs R6-7 ${r7.hw} + ${r7.shoulder} = ${f2(r7.hw + r7.shoulder, 1)} m; lanes ${r7.lanes}, median half ${r7.med}, lane ${r7.laneW} m, outer shy ${r7.shyOuter} m`);
// R4-4 side road that started on the old R6-9
const r44 = on.get('R4-4'), r44o = off.get('R4-4'); const fo = foot(a6.xs, a6.zs, a6.ys, r44.xs[0], r44.zs[0]);
P(`INFO  R4-4 starts ${f2(fo.d, 1)} m off the R6 arm axis at (${f2(r44.xs[0], 1)}, ${f2(r44.zs[0], 1)}); its start level OFF ${f2(r44o.ys[0])} -> ON ${f2(r44.ys[0])} m (arm level there ${f2(fo.y)} m)`);
// J10 (T junction): with the switch ON the old R6-9 is gone, so R4-4 must START on the edge of the R6 arm ribbon (half width 16.6 m) at the arm level and climb smoothly (<= 6 %), not inside the ribbon.
{ const gs: number[] = []; for (let i = 1; i < r44.xs.length; i++) { const dd = Math.hypot(r44.xs[i] - r44.xs[i - 1], r44.zs[i] - r44.zs[i - 1]); if (dd > 0.5) gs.push(Math.abs(r44.ys[i] - r44.ys[i - 1]) / dd); } const first70 = gs.slice(0, 14); const gmax = Math.max(...first70);
  CHK('R4-4 (T junction): start on the R6 arm ribbon edge (half width 16.6 m, +-1.5 m)', Math.abs(fo.d - 17.6) <= 1.5 && fo.d >= 16.6, `${f2(fo.d, 1)} m off the arm axis`);
  CHK('R4-4 (T junction): start level = arm level at the foot point (<= 0.05 m)', Math.abs(r44.ys[0] - fo.y) <= 0.05, `${f2(r44.ys[0])} vs ${f2(fo.y)} m`);
  CHK('R4-4 (T junction): grade of the first 70 m <= 6 % (road limit)', gmax <= 0.06, `max ${f2(gmax * 100)} %`);
  CHK('R4-4: far part unchanged OFF vs ON (last point identical)', Math.abs(r44.xs[r44.xs.length - 1] - r44o.xs[r44o.xs.length - 1]) < 0.01 && Math.abs(r44.ys[r44.ys.length - 1] - r44o.ys[r44o.ys.length - 1]) < 0.01, 'end (-2120.8, -2823.5)'); }

// ---------------- R4 join ----------------
P(''); P('== R4 join (arm end = J4-R4 join on the old R4-9 line) against the trimmed real R4-9 ==');
const r4 = on.get('R4-9'), r4o = off.get('R4-9'); const n4 = r4.xs.length - 1;
const e4 = { x: r4.xs[n4], z: r4.zs[n4], y: r4.ys[n4] }; const ae4 = { x: a4.xs[a4.xs.length - 1], z: a4.zs[a4.zs.length - 1], y: a4.ys[a4.ys.length - 1] };
const hd4 = headAtEnd(r4.xs, r4.zs), hd4a = wrap(headAtEnd(a4.xs, a4.zs) + 180), hd4off = headAtEnd(r4o.xs.slice(0, 323), r4o.zs.slice(0, 323));
const gap4 = Math.hypot(e4.x - ae4.x, e4.z - ae4.z);
P(`INFO  R4-9 (ON) end (${f2(e4.x, 2)}, ${f2(e4.z, 2)}) level ${f2(e4.y)} heading ${f2(hd4)} deg | arm end (${f2(ae4.x, 2)}, ${f2(ae4.z, 2)}) level ${f2(ae4.y)} heading to the ring-side reversed: arm travel towards the far end ${f2(wrap(hd4a + 180))} deg`);
CHK('R4: gap <= 0.1 m', gap4 <= 0.1, `${f2(gap4)} m`);
const dh4 = Math.abs(wrap(hd4a - hd4)); CHK('R4: heading difference <= 0.5 deg', dh4 <= 0.5, `${f2(dh4)} deg (R4-9 last 10 m ${f2(hd4)}, arm first 10 m ${f2(hd4a)}; the same line OFF, chord up to the join: ${f2(hd4off)})`);
CHK('R4: level gap <= 0.02 m', Math.abs(e4.y - ae4.y) <= 0.02, `${f2(e4.y - ae4.y)} m`);
const rb = r4.hw + r4.shoulder;
P(`INFO  R4 section: game R4-9 half width ${r4.hw} m (pavement edge), outer shy ${r4.shyOuter} m, ditch / shoulder ${r4.shoulder} m, median half ${r4.med} m, lane ${r4.laneW} m, lanes ${r4.lanes}; arm ribbon half width ${top4} m (asphalt ${f2(top4 - 0.6, 1)} m + 0.6 m shoulder), M4 lane 3.65 m`);
CHK('R4 section: arm asphalt half width = R4-9 pavement half width (no change of width)', Math.abs(top4 - 0.6 - r4.hw) <= 0.05, `arm asphalt ${f2(top4 - 0.6, 1)} m vs R4-9 ${r4.hw} m: step ${f2(top4 - 0.6 - r4.hw, 1)} m on each side (${f2(2 * (top4 - 0.6 - r4.hw), 1)} m in total)`);
{ const a: any = sa.find((q) => q.id === 'R4'); const e = a.pts[a.pts.length - 1]; const laneJoin = (e[4] ?? 7.15) / 2; CHK('R4 section: same lane width at the join', Math.abs(r4.laneW - laneJoin) <= 0.01, `R4-9 lane ${r4.laneW} m vs arm paint lane at the join ${f2(laneJoin, 2)} m (J8 paint, tapers from 3.575 m 70 m before the join)`); }
P(`BEFORE the J10 step 0 fix (R4-9 trimmed at the join, no bend): heading difference ${f2(Math.abs(wrap(hd4a - hd4off)))} deg  ->  AFTER (last 70 m of R4-9 turned about the join): ${f2(dh4)} deg`);
{ let maxD = 0, maxFar = 0; for (let i = 0; i < r4.xs.length; i++) { const f = foot(r4o.xs, r4o.zs, r4o.ys, r4.xs[i], r4.zs[i]); const sBack = Math.hypot(r4.xs[i] - e4.x, r4.zs[i] - e4.z); if (sBack <= 72) maxD = Math.max(maxD, f.d); else maxFar = Math.max(maxFar, f.d); }
  CHK('R4-9 bend: the road is unchanged further than 72 m from the join (switch ON vs OFF)', maxFar <= 0.05, `max ${f2(maxFar)} m`);
  CHK('R4-9 bend: the last 70 m move by <= 2.0 m sideways (small change)', maxD <= 2.0, `max ${f2(maxD)} m`);
  P('INFO  R4-9 bend: positions only, the finished levels (fixedY) are not touched; the ON / OFF level difference at the join (46.48 vs 45.46 m) is the known J9-a finding 2 and the arm meets the ON level (see the level gap line above).'); }
{ // vertical G1 at the join: grade of the last 20 m of R4-9 against the first 20 m of the arm (towards the ring)
  const gb = (() => { let j = r4.xs.length - 2, d = 0; while (j > 0 && (d = Math.hypot(r4.xs[n4] - r4.xs[j], r4.zs[n4] - r4.zs[j])) < 20) j--; return (r4.ys[j] - r4.ys[n4]) / (d || 1); })();   // grade towards the ring (positive = falls towards the ring... end minus start of travel)
  const ga = (() => { const R = A4.rows as any[]; const m = R.length; let j = m - 2, d = 0; while (j > 0 && (d = Math.hypot(R[m - 1].x - R[j].x, R[m - 1].z - R[j].z)) < 20) j--; return (R[m - 1].y - R[j].y) / (d || 1); })();
  const brk = Math.abs(gb - ga) * 100; const Lmin = 10.37 * brk;
  P(`INFO  vertical grade at the R4 join (travel R4-9 -> ring): R4-9 last 20 m ${f2(-gb * 100)} %, arm first 20 m ${f2(-ga * 100)} % -> break ${f2(brk)} %, a crest curve would need L >= K 10.37 x A = ${f2(Lmin, 0)} m (none is built: level is equal, the grade is not smooth)`);
  CHK('R4: no vertical grade break > 1 % at the join without a vertical curve', brk <= 1, `${f2(brk)} %`); }
// wedge at the join caused by the heading difference
P(`INFO  wedge at the join from the heading difference: ${f2(top4 * Math.tan(Math.abs(wrap(hd4a - hd4)) * Math.PI / 180), 2)} m at the arm edge (hole on one side, overlap on the other)`);
P('INFO  J7-C ribbon and game ribbon at the join: the arm ribbon starts at the join point (first row), the R4-9 ribbon ends at the same point (J9-a trimmed it there). No overlap along the road, no hole along the road; the end caps meet with the wedge above and the width step above. R6: the arm has a free end, R6-7 has a free end 21 m away: a gap of bare terrain.');

// ---------------- roundabout end ----------------
P(''); P('== roundabout end: arm centre line against the J4 leg axis (local frame u along the ring, v = left, origin = roundabout centre) ==');
const F: any = J300_FRAME; const cy = Math.cos(F.yaw), sy = Math.sin(F.yaw);
const toLocal = (x: number, z: number): { u: number; v: number } => { const dx = x - F.ox, dz = z - F.oz; return { u: dx * cy + dz * sy, v: dx * sy - dz * cy }; };
for (const [id, A, a] of [['R6', A6, a6], ['R4', A4, a4]] as any[]) {
  const sgn = id === 'R6' ? 1 : -1; let worstU = 0, worstH = 0, n = 0; let atLeg = { u: 0, h: 0, v: 0 };
  for (let i = 1; i < a.xs.length - 1; i++) { const p = toLocal(a.xs[i], a.zs[i]); if (sgn * p.v < 120 || sgn * p.v > 222) continue; const q0 = toLocal(a.xs[i - 1], a.zs[i - 1]), q1 = toLocal(a.xs[i + 1], a.zs[i + 1]); const hdev = Math.abs(deg(Math.atan2(q1.u - q0.u, sgn * (q1.v - q0.v)))); n++; if (Math.abs(p.u) > Math.abs(worstU)) worstU = p.u; if (hdev > worstH) worstH = hdev; if (sgn * p.v >= 220 || atLeg.v === 0) atLeg = { u: p.u, h: hdev, v: p.v }; }
  const leg: any = (J300_LEGS as any[]).find((l) => l.id === id);
  P(`INFO  ${id}: leg axis u = 0 from the circle to v = ${f2(leg.exit.centre[leg.exit.centre.length - 1][1], 1)} m; arm rows in the leg zone (${n} rows): largest lateral offset ${f2(worstU)} m, largest heading deviation ${f2(worstH)} deg; at v ${f2(atLeg.v, 1)}: offset ${f2(atLeg.u)} m`);
  CHK(`${id}: arm centre line lies on the leg axis (offset <= 0.1 m, heading <= 0.5 deg) where the legs end`, Math.abs(atLeg.u) <= 0.1 && atLeg.h <= 0.5, `${f2(atLeg.u)} m, ${f2(atLeg.h)} deg`);
}
P(`INFO  J8 finding 2 (known): inside the junction reach the arm ribbon keeps the full M6 / M4 width (${top6 * 2} / ${top4 * 2} m) while the J4 carriageways (2 x 7 m / 2 x 7.3 m + median 4 m) are narrower; the extra asphalt stays (decision of the user pending).`);

P(''); P('NOT RUN: in-game look / drive over the joins (browser), the shader ribbon end cap of the real R6-7 / R4-9 meshes (numbers come from the road data, not from pixels), traffic graph (the second half of this step), terrain under the 21 m R6 gap.');
P(''); P(`${fails} FAIL`); writeFileSync(`${dir}/J300_J10_JOIN.txt`, out.join('\n') + '\n');
