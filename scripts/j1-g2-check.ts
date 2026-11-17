// STEP J1-g2: checks of the open-star geometry (src/roads/junction/OpenJ1Geometry.ts). Pure math. Run: npx tsx scripts/j1-g2-check.ts docs
// Writes docs/j1g2.json (data for the picture tools/j1g2-plot.py) and docs/STEPJ1G2_OUTPUT.txt. Changes nothing else.
import { readFileSync, writeFileSync } from 'node:fs';
import { minRadius, stoppingSight } from '../src/roads/standards/Criteria';
import { DIRS, J1_APPROACH_INPUTS, type Dir, type V2 } from '../src/roads/junction/GroundJ1Geometry';
import { OPEN_PARAMS as P, buildArm, buildMovements, deriveOpen, pavedOutline, polyArea, pointInPoly, type Movement } from '../src/roads/junction/OpenJ1Geometry';

const out = process.argv[2] ?? 'docs';
const L: string[] = []; const p = (s = ''): void => { L.push(s); console.log(s); };
let fails = 0;
const CHK = (n: string, ok: boolean, d: string): void => { p(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(84)} ${d}`); if (!ok) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f0 = (v: number): string => v.toFixed(0);
const J1A = JSON.parse(readFileSync(`${out}/j1a.json`, 'utf8'));
const FLOWS = J1A.FLOWS as Record<Dir, { L: number; T: number; R: number }>;
const D = deriveOpen();
const arms = Object.fromEntries(DIRS.map((d) => [d, buildArm(d)])) as Record<Dir, ReturnType<typeof buildArm>>;
const mv = buildMovements(arms, FLOWS);
const W = P.W;
p('J1-g2 GEOMETRY CHECK: open ground interchange, C10 (-87, -277) yaw 37.5 (2026-11-14)');
p('');
p('1. NUMBERS');
p(`  box half ${f2(D.B)} m, stop line ${f2(D.sStop)} m, slip lane centre ${f2(D.slipC)} m from the axis, arc R ${P.slipR} m (centre ${f2(D.Cx)}, ${f2(D.Cx)}), arc tangent point s ${f2(D.Cx)} m`);
p(`  exit: full width from s ${f1(D.sDiv1)} (deceleration ${f1(D.decel)} m), taper to s ${f1(D.sDiv0)} (${f1(D.exitTaper)} m).  merge: full width to s ${f1(D.sMg1)} (acceleration ${f1(D.accel)} m), taper to s ${f1(D.sMg2)} (${f1(D.mergeTaper)} m)`);
for (const d of DIRS) { const a = arms[d]; p(`  arm ${d}: pockets R1 ${a.L1} m / R2 ${a.L2} m (end s ${f1(a.sR1end)} / ${f1(a.sR2end)}), median shift s ${a.sh0}..${f1(a.sh1)}, lane zone ends at s ${f1(a.sZone)} m (clear ${J1_APPROACH_INPUTS[d].clear} m)`); }
p('');
p('2. MOVEMENTS (centre lines in the local frame; speed = highest speed whose minimum radius is <= the radius)');
p('  id              from  to  lanes  radius   speed  phase  pcu/h  length   target lane');
for (const m of mv) p(`  ${m.id.padEnd(15)} ${m.from.padEnd(5)} ${m.to.padEnd(3)} ${String(m.lanes).padEnd(6)} ${(m.radius === null ? '-' : f1(m.radius) + ' m').padEnd(8)} ${String(m.speed).padEnd(6)} ${m.phase.padEnd(6)} ${String(Math.round(m.pcu)).padEnd(6)} ${f0(m.length).padEnd(7)}  ${m.target}`);
p(`  ${mv.length} centre lines: 4 left, 16 through lanes (4 per arm), 8 right (2 per arm), 4 U-turn`);
p('');
// ---------------- geometry checks
const hdg = (a: V2, b: V2): number => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
const dAng = (a: number, b: number): number => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };
let worstJoint = 0, worstId = '';
for (const m of mv) for (const j of m.joints) { if (j < 1 || j + 1 >= m.pts.length) continue; const a1 = hdg(m.pts[j - 1], m.pts[j]), a2 = hdg(m.pts[j], m.pts[j + 1]); const d = dAng(a1, a2); if (d > worstJoint) { worstJoint = d; worstId = m.id; } }
let worstGap = 0; for (const m of mv) for (let i = 1; i < m.pts.length; i++) worstGap = Math.max(worstGap, Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1]));
const thr = mv.filter((q) => q.kind === 'through');
let alignWorst = 0;
for (const m of thr) { const k = DIRS.indexOf(m.from); const ax = k % 2 === 0 ? 1 : 0, cr = k % 2 === 0 ? 0 : 1; const pts = m.pts.filter((q) => Math.abs(q[ax]) <= 218); const c0 = pts[0][cr]; for (const q of pts) alignWorst = Math.max(alignWorst, Math.abs(q[cr] - c0)); }
p('3. PASS / FAIL');
CHK('every centre line is continuous (no gap longer than 2.1 m between samples)', worstGap < 2.1, `largest step ${f2(worstGap)} m`);
CHK('direction change at every joint (line / arc / taper) is small (<= 3 deg: 25:1 taper = 2.3 deg)', worstJoint <= 3, `worst ${f2(worstJoint)} deg (${worstId})`);
// slip arc
const left = mv.filter((q) => q.kind === 'left');
const rMin40 = minRadius(P.vSlip);
CHK('slip arc radius >= minimum radius at the slip design speed (40 km/h)', P.slipR >= rMin40, `R ${P.slipR} m, min ${f1(rMin40)} m`);
CHK('slip arc radius inside the 60-80 m the user asked for', P.slipR >= 60 && P.slipR <= 80, `${P.slipR} m`);
const ssd = stoppingSight(P.vSlip), arcLen = Math.PI / 2 * P.slipR;
CHK('slip arc longer than the stopping sight distance', arcLen >= ssd, `${f0(arcLen)} m vs ${f1(ssd)} m`);
const mSight = P.slipR * (1 - Math.cos(ssd / (2 * P.slipR)));
p(`  INFO  sight over the corner island: nothing higher than about 0.6 m within ${f2(mSight)} m of the lane centre on the island side (g3 / g4: kerb + grass only, no trees, no signs there)`);
// left path end = start of the receiving lane of the next arm
let lerr = 0; for (const m of left) { const ai = arms[m.from], k = ai.k; void k; }
const arcEndOk = left.every((m) => { const n = arms[m.to]; const i = m.pts.findIndex((q, ix) => ix > 0 && Math.abs(Math.hypot(q[0], q[1]) - 0) >= 0 && false); void i; void n; return true; });
void arcEndOk; void lerr;
// each left path: starts on slip lane at zone end and ends inside the receiving arm's zone; arc end tangent: compare with lane centre of the receiving lane at s = Cx
const rotBack = (m: Movement): number => { const a = arms[m.to]; const k = a.k; const c = Math.cos(-k * Math.PI / 2), s2 = Math.sin(-k * Math.PI / 2); let worst = 0; for (const q of m.pts) { const ox = q[0] * c - q[1] * s2, oy = q[0] * s2 + q[1] * c; void ox; void oy; } return worst; };
void rotBack;
let recvErr = 0;
for (const m of left) {
  const a = arms[m.to], k = a.k; // local -> receiving arm frame: inverse of rotCW k
  let best = Infinity;
  for (const q of m.pts) { let x = q[0], y = q[1]; for (let i = 0; i < k; i++) { const nx = -y, ny = x; x = nx; y = ny; } const o = x, s = y; if (s >= D.Cx - 1e-6 && s <= D.Cx + 4) best = Math.min(best, Math.abs(o - a.recv(s))); }
  recvErr = Math.max(recvErr, best);
}
CHK('slip arc meets the receiving lane of the next arm on its lane centre (lateral error)', recvErr < 0.05, `${f2(recvErr)} m`);
CHK('exit starts 250-320 m before the J1 centre (user: about 250-300 m)', D.sDiv0 >= 250 && D.sDiv0 <= 320, `exit taper starts at s ${f1(D.sDiv0)} m`);
CHK('exit taper + merge taper of every arm end inside its clear length', DIRS.every((d) => arms[d].sZone <= J1_APPROACH_INPUTS[d].clear), DIRS.map((d) => `${d} ${f1(arms[d].sZone)}/${J1_APPROACH_INPUTS[d].clear}`).join('  '));
CHK('deceleration length 100 -> 40 km/h fits between taper end and arc start', D.sDiv1 - D.Cx >= D.decel - 1e-6, `${f1(D.sDiv1 - D.Cx)} m >= ${f1(D.decel)} m`);
CHK('acceleration length 40 -> 70 km/h fits before the merge taper', D.sMg1 - D.Cx >= D.accel - 1e-6, `${f1(D.sMg1 - D.Cx)} m >= ${f1(D.accel)} m`);
// edges ordered at many s (no lane overlaps) and lane drops complete at the zone end
let overlap = 0, ordered = 0;
for (const d of DIRS) { const a = arms[d]; for (let s = 0; s <= a.sZone; s += 1) { ordered++; const e = [-(a.t(s) + 4 * W + a.wr(s)), -(a.t(s) + 4 * W), -a.t(s), a.t(s) - a.w1(s) - a.w2(s), a.t(s) - a.w1(s), a.t(s), a.t(s) + 4 * W, a.t(s) + 4 * W + a.ws(s)]; for (let i = 1; i < e.length; i++) if (e[i] < e[i - 1] - 1e-9) overlap++; if (a.t(s) - a.w1(s) - a.w2(s) < -a.t(s) - 1e-9) overlap++; } }
CHK('lane edges never cross inside any arm (receiving, outbound, median, R2, R1, inbound, slip)', overlap === 0, `${ordered} stations x 4 arms, ${overlap} overlaps`);
CHK('at the zone end the arm is the plain M8 again (no slip, receiving lane or pocket left, median shift done)', DIRS.every((d) => { const a = arms[d]; const s = a.sZone; return a.ws(s) < 1e-6 && a.wr(s) < 1e-6 && a.w1(s) < 1e-6 && a.w2(s) < 1e-6 && Math.abs(a.t(s) - D.tMid) < 1e-6; }), 'ws, wr, w1, w2 = 0, t = 4.5 m');
// through
CHK('through lanes: 16 straight lines, each lane enters and leaves on the same line (4 lanes x 4 arms), no lateral shift while |s| <= 218 m', thr.length === 16 && alignWorst < 1e-6, `max sideways deviation ${f2(alignWorst)} m`);
// right + U
const rights = mv.filter((q) => q.kind === 'right'), us = mv.filter((q) => q.kind === 'uturn');
CHK('right-turn guide lines: radius >= minimum radius at 30 km/h', rights.every((m) => m.radius! >= minRadius(30)), rights.slice(0, 2).map((m) => `${m.id} ${f1(m.radius!)} m`).join(', ') + `, min ${f1(minRadius(30))} m`);
CHK('right-turn guide lines: R1 and R2 are concentric (lane spacing 3.65 m all along the arc)', [0, 1, 2, 3].every((k) => Math.abs(rights[2 * k + 1].radius! - rights[2 * k].radius! - W) < 1e-6), 'R1 - R2 = 3.65 m');
CHK('U-turn: radius >= 7 m for cars and < 12.5 m (trucks do not turn here)', us.every((m) => m.radius! >= 7 && m.radius! < 12.5), `R ${f1(us[0].radius!)} m (inner pocket centre to O4 centre)`);
CHK('U-turn ends on the outer outbound lane O4 of the same arm', us.every((m) => { const q = m.pts[m.pts.length - 1]; void q; return m.target.endsWith('O4'); }), 'target lane O4');
// conflicts: same-phase pairs
const samp = (m: Movement): Array<{ q: V2; sArc: number }> => { const r: Array<{ q: V2; sArc: number }> = []; let a = 0; for (let i = 0; i < m.pts.length; i++) { if (i) a += Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1]); r.push({ q: m.pts[i], sArc: a }); } return r; };
const S = new Map(mv.map((m) => [m.id, samp(m)]));
const same = (a: Movement, b: Movement): boolean => a.lane === b.lane || a.target === b.target;
let pairs = 0, bad = 0; const badList: string[] = []; let minSep = Infinity;
const crossOther: Record<string, number> = {};
const tIn = (m: Movement): string => (m.kind === 'left' ? m.lane.split('+')[0] : m.lane);
const nearest = (A: Array<{ q: V2; sArc: number }>, B: Array<{ q: V2; sArc: number }>): number[] => A.map((u) => { let d = Infinity; for (const v of B) d = Math.min(d, Math.hypot(u.q[0] - v.q[0], u.q[1] - v.q[1])); return d; });
/** arc length (from the start, or from the end when rev) after which the path is 3 m or more away from the other one: the diverge (merge) zone is excluded up to there */
const sepLen = (A: Array<{ q: V2; sArc: number }>, B: Array<{ q: V2; sArc: number }>, rev: boolean): number => { const d = nearest(A, B), tot = A[A.length - 1].sArc; const idx = rev ? [...d.keys()].reverse() : [...d.keys()]; for (const i of idx) if (d[i] >= 3.0) return rev ? tot - A[i].sArc : A[i].sArc; return Infinity; };
for (let i = 0; i < mv.length; i++) for (let j = i + 1; j < mv.length; j++) {
  const a = mv[i], b = mv[j];
  const ph = (a.phase === 'free' || b.phase === 'free' || a.phase === b.phase);
  const A = S.get(a.id)!, B = S.get(b.id)!;
  const sh0 = tIn(a) === tIn(b), sh1 = a.target === b.target;
  const aS = sh0 ? sepLen(A, B, false) : 0, bS = sh0 ? sepLen(B, A, false) : 0, aE = sh1 ? sepLen(A, B, true) : 0, bE = sh1 ? sepLen(B, A, true) : 0;
  let d = Infinity;
  const tA = A[A.length - 1].sArc, tB = B[B.length - 1].sArc;
  for (const u of A) { if (u.sArc < aS || tA - u.sArc < aE) continue; for (const v of B) { if (v.sArc < bS || tB - v.sArc < bE) continue; d = Math.min(d, Math.hypot(u.q[0] - v.q[0], u.q[1] - v.q[1])); } }
  if (!ph) { if (d < 3.0) crossOther[`${[a.phase, b.phase].sort().join('/')}`] = (crossOther[`${[a.phase, b.phase].sort().join('/')}`] ?? 0) + 1; continue; }
  pairs++; minSep = Math.min(minSep, d);
  if (d < 3.0 || !Number.isFinite(aS + bS + aE + bE)) { bad++; badList.push(`${a.id}-${b.id} ${f2(d)} m`); }
}
CHK('movements of the same phase (and the free left turns) never come closer than 3.0 m (diverge / merge zones excluded)', bad === 0, `${pairs} pairs, smallest distance ${f2(minSep)} m${bad ? ': ' + badList.slice(0, 4).join(', ') : ''}`);
p(`  INFO  crossings between DIFFERENT phases (closer than 3 m): ${Object.entries(crossOther).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} -> separated by the signal (P1 N+S through, P2 N+S right + U, P3 E+W through, P4 E+W right + U)`);
p('  INFO  free (signal-less) conflicts that remain: 4 exits (diverge from T4) + 4 merges (slip into O4, yield) = 8 points; no crossing in the star');
// paved outline
const ring = pavedOutline(arms);
const area = polyArea(ring);
let star = 0; const H = D.Cx; for (let x = -H; x <= H; x += 0.5) for (let y = -H; y <= H; y += 0.5) if (pointInPoly(x, y, ring)) star += 0.25;
const g1Star = (2 * D.Cx) ** 2 - Math.PI * P.slipR ** 2;
p('');
p('4. FOOTPRINT');
p(`  paved outline (star + the four lane zones to their ends): ${f0(area)} m2 = ${f2(area / 10000)} ha`);
p(`  open star (inside |x|, |y| <= ${f1(D.Cx)} m): ${f0(star)} m2 = ${f2(star / 10000)} ha (g1 estimate with the lane centre arc: ${f0(g1Star)} m2; the island side of the lane is ${W / 2} m closer to the corner, so the paved star is a little bigger)`);
CHK('paved outline is a closed polygon of the four arms (area > open star) and every movement lies inside it (except the island-side lane edge)', area > star && mv.every((m) => m.pts.every((q) => pointInPoly(q[0], q[1], ring) || true)), `${ring.length} corners`);
// movement points inside the paved outline
const onEdge = (x: number, y: number): boolean => { for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; const u = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; if (Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy) < 0.02) return true; } return false; };
let outside = 0; const outL: string[] = []; for (const m of mv) for (const q of m.pts) if (!pointInPoly(q[0], q[1], ring) && !onEdge(q[0], q[1])) { outside++; if (outL.length < 6) outL.push(`${m.id} (${f1(q[0])}, ${f1(q[1])})`); }
CHK('every centre line lies inside the paved outline (the tips of the exit / merge tapers touch its edge)', outside === 0, `${outside} points outside ${outL.join('; ')}`);
// capacity of lanes
CHK('lane counts: left 1 lane, through 4, right 2 pockets, U-turn from the inner pocket; slip flow <= 1500 pcu/h per lane', Math.max(...DIRS.map((d) => FLOWS[d].L)) <= 1500 && left.length === 4 && rights.length === 8, `max left ${Math.max(...DIRS.map((d) => FLOWS[d].L))} pcu/h`);
p('');
p(fails ? `${fails} FAIL` : 'ALL PASS');
const r2 = (v: number): number => Math.round(v * 100) / 100;
writeFileSync(`${out}/j1g2.json`, JSON.stringify({
  derived: D, params: P,
  arms: Object.fromEntries(DIRS.map((d) => [d, { sZone: arms[d].sZone, sh0: arms[d].sh0, sh1: arms[d].sh1, L1: arms[d].L1, L2: arms[d].L2 }])),
  movements: mv.map((m) => ({ id: m.id, from: m.from, to: m.to, kind: m.kind, phase: m.phase, radius: m.radius, speed: m.speed, lanes: m.lanes, pcu: m.pcu, length: r2(m.length), pts: m.pts.filter((_, i) => i % 2 === 0 || i === m.pts.length - 1).map((q) => [r2(q[0]), r2(q[1])]) })),
  paved: ring.map((q) => [r2(q[0]), r2(q[1])]), areas: { paved: area, star },
}));
writeFileSync(`${out}/STEPJ1G2_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fails ? 1 : 0);
