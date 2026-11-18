// STEP 21.7-1 JUNCTION INVENTORY (headless, READ ONLY: changes NO src file and NO data file, writes only docs/STEP_21_7_1_OUTPUT.txt and docs/centre_junction.json).
// What it does (handover of 21.46):
//   1. inventory of the 136 nodes of docs/centre_vprofile.json + the 22 nodes on 8-lane roads of docs/centre_r5.json: class pair, arms, TYPE (at-grade T / roundabout / TAP interchange / grade-separated / continuation)
//   2. junction angle of every T (skew angle, Step 8 rule: >= 70 deg else realign), arm spacing of every roundabout, R < Rmin corners from the fitted PI tables (docs/centre_fit_*.json)
//   3. the three R5 limits of 21.43 (257 m / 416 m / 394 m) recomputed from the data, for the user's OK
//   4. section 3.8 check: no local street (C / L) straight onto a divided arterial (R4) or a motorway (R6 / M8 / J1 arm)
//   5. N030 and N074 (grade-separated, 21.16 / 21.40)
// MAPPING: C = collector, L = local street (header of src/roads/debug/HousingStreetData.ts); R2 is the 2-lane road class of the drawing (treated like a collector).
// A FAIL is a LIST for the user (R10), nothing is moved.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-junction.ts docs
import { readFileSync, writeFileSync } from 'fs';

// ---------------- constants (MY choices, listed in 21.47) ----------------
const OUT = process.argv[2] ?? 'docs';
const END_M = 12;            // a leg whose station is within END_M of a line end is an END leg (node tolerance of 21.40)
const TW = 20;               // tangent baseline: the arm direction is the chord over TW m along the line
const ANG_MIN = 70;          // Step 8: skewed junction angle >= 70 deg, else realign
const ANG_BAD = 50;          // listed as SERIOUS below this
const RB_ARM_MIN = 30;       // roundabout: smallest angle between two neighbouring arms (my number)
const NODE_GAP_MIN = 60;     // X6 / R1: at least 60 m between nodes
const CORNER_NODE_M = 150;   // a bend with R < Rmin(class) is a 'junction corner' when it lies within this distance (along the line) of a node of the same line
const J1C = [-87, -277], J1R = 100;   // J1 plaza centre and radius (21.41)
const LIM = { SPACING: 257, JOIN: 416, J1: 394 };   // the three limits of 21.43 (the user must confirm)
const OLD = { SPACING: 1600, JOIN: 600, J1: 600 };
const GRADE_MAX: Record<string, number> = { '6': 0.04, '4': 0.06, '2': 0.08, C: 0.10, L: 0.10 };   // 3.3 / R11, used only for the ramp length INFO of N030 / N074
const hyp = Math.hypot, f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);

// ---------------- data ----------------
const rd = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const vp = rd(`${OUT}/centre_vprofile.json`);
const cf = rd(`${OUT}/fit_chain/centre_fixed.json`);
const r5 = rd(`${OUT}/centre_r5.json`);
const fits: Record<string, any> = {}; for (const c of ['6', '4', '2', 'C', 'L']) fits[c] = rd(`${OUT}/centre_fit_${c}.json`);
const poly = new Map<string, number[][]>(), clsOf = new Map<string, string>(), cumOf = new Map<string, number[]>(), pviLast = new Map<string, number>();
for (const l of cf.lines) { poly.set(l.id, l.pts); clsOf.set(l.id, String(l.cls)); }
for (const l of vp.lines) pviLast.set(l.id, l.pvi[l.pvi.length - 1][0]);
const cumul = (p: number[][]): number[] => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; };
for (const [id, p] of poly) cumOf.set(id, cumul(p));
function at(id: string, s: number): number[] {
  const p = poly.get(id)!, c = cumOf.get(id)!; s = Math.max(0, Math.min(c[c.length - 1], s));
  let j = 0; while (j + 2 < c.length && c[j + 1] < s) j++;
  const t = c[j + 1] > c[j] ? (s - c[j]) / (c[j + 1] - c[j]) : 0;
  return [p[j][0] + t * (p[j + 1][0] - p[j][0]), p[j][1] + t * (p[j + 1][1] - p[j][1])];
}
function proj(id: string, x: number, z: number): { d: number; s: number } {
  const p = poly.get(id)!, c = cumOf.get(id)!; let best = { d: Infinity, s: 0 };
  for (let i = 0; i < p.length - 1; i++) {
    const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1], s2 = dx * dx + dz * dz;
    const t = s2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - p[i][0]) * dx + (z - p[i][1]) * dz) / s2));
    const d = hyp(x - p[i][0] - t * dx, z - p[i][1] - t * dz); if (d < best.d) best = { d, s: c[i] + t * Math.sqrt(s2) };
  }
  return best;
}
const angBetween = (a: number[], b: number[]): number => (Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180) / Math.PI;
const unit = (v: number[]): number[] => { const h = hyp(v[0], v[1]) || 1; return [v[0] / h, v[1] / h]; };
const A_CLASS = new Set(['6', '4']);   // arterials (6 / 4 lane)
const rname = (c: string): string => (c === 'C' || c === 'L' ? c : 'R' + c);
const rank: Record<string, number> = { '8': 0, '6': 1, '4': 2, '2': 3, C: 4, L: 5 };

pr('STEP 21.7-1 JUNCTION INVENTORY (read only; lines = docs/fit_chain/centre_fixed.json, nodes = docs/centre_vprofile.json, PIs = docs/centre_fit_*.json)');
pr(`constants (MY choices): END ${END_M} m, tangent chord ${TW} m, skew angle >= ${ANG_MIN} deg (Step 8), serious < ${ANG_BAD} deg, roundabout arms >= ${RB_ARM_MIN} deg apart, node gap >= ${NODE_GAP_MIN} m, corner = within ${CORNER_NODE_M} m of a node`);
pr('class mapping (HousingStreetData.ts + 3.9): R6 / R4 = arterial (A), R2 = 2-lane road (treated as collector class, MY decision), C = collector street, L = LOCAL street; only L is a local street for section 3.8');
pr();

// ---------------- 1. node inventory ----------------
interface Arm { id: string; dir: number[]; cls: string }
interface NodeOut { id: string; x: number; z: number; legs: string[]; cls: string; arms: number; kind: string; type: string; angle: number | null; angleBad: boolean; armMin: number | null; side: string; through: string; minor: string[]; note: string[]; b3: string }
const arb = new Map<string, any>(); for (const a of vp.arbitration) arb.set(a.node, a);
const B3NODES: [string, number, number][] = [['N004', 164.7, -1332.7], ['N011', -3613.9, 1517.5], ['N018', -1662.0, 4710.4], ['N023', 4265.0, -4498.4], ['N028', 333.0, -3537.9], ['N030', -1748.9, -532.0], ['N032', -953.7, -2268.7], ['N035', 1236.5, -2358.0], ['N036', 1316.8, -2845.4], ['N040', 1061.5, -607.4], ['N050', -1365.9, 4742.4], ['N070', 3691.5, 2756.1], ['N071', 4123.6, 2728.1], ['N072', 3680.2, 2106.1], ['N073', 4107.2, 2108.0], ['N120', 1860.5, -631.7], ['N121', 1980.9, -461.3]];
const nodes: NodeOut[] = []; const nodePts: { id: string; p: number[] }[] = [];
const nodesOfLine = new Map<string, { node: string; s: number }[]>();
for (const n of vp.nodes) {
  const arms: Arm[] = [], kinds: string[] = []; let cx = 0, cz = 0;
  for (const g of n.legs) {
    const cls = clsOf.get(g.id)!, c = cumOf.get(g.id)!, last = pviLast.get(g.id)!, s = (g.s * c[c.length - 1]) / last;
    const P = at(g.id, s); cx += P[0]; cz += P[1];
    const k = g.s <= END_M ? 'S' : last - g.s <= END_M ? 'E' : 'T'; kinds.push(k);
    if (k === 'S' || k === 'T') { const Q = at(g.id, s + TW); arms.push({ id: g.id, dir: unit([Q[0] - P[0], Q[1] - P[1]]), cls }); }
    if (k === 'E' || k === 'T') { const Q = at(g.id, s - TW); arms.push({ id: g.id, dir: unit([Q[0] - P[0], Q[1] - P[1]]), cls }); }
    (nodesOfLine.get(g.id) ?? nodesOfLine.set(g.id, []).get(g.id)!).push({ node: n.id, s });
  }
  cx /= n.legs.length; cz /= n.legs.length; nodePts.push({ id: n.id, p: [cx, cz] });
  const classes = n.legs.map((g: any) => rname(clsOf.get(g.id)!)).sort((a: string, b: string) => rank[b[0] === 'R' ? b.slice(1) : b] - rank[a[0] === 'R' ? a.slice(1) : a]).reverse();
  const clsKey = [...classes].sort().join('x');
  // axis of the junction = the WIDEST pair of arms (the two arms that are nearest to a straight line); the other arm(s) are the minor arm(s).
  // (a first version took the two arms of the through leg; where the through line itself bends at the node, e.g. R2-52 at N072 with R 22 m, the axis was a diagonal and the angle meaningless)
  let ta: Arm[] = [], rest: Arm[] = []; const thrLegs = n.legs.filter((_: any, i: number) => kinds[i] === 'T');
  let sideAxis: Arm[] = [];
  if (arms.length >= 3) {
    let bi = 0, bj = 1, ba = -1; for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) { const a = angBetween(arms[i].dir, arms[j].dir); if (a > ba) { ba = a; bi = i; bj = j; } }
    ta = [arms[bi], arms[bj]]; rest = arms.filter((_, k) => k !== bi && k !== bj);
    if (thrLegs.length === 1) sideAxis = arms.filter((q) => q.id === thrLegs[0].id);
  }
  let angle: number | null = null, armMin: number | null = null; const note: string[] = [];
  if (arms.length >= 3 && ta.length === 2) {
    const ax = [ta[0].dir[0] - ta[1].dir[0], ta[0].dir[1] - ta[1].dir[1]];
    angle = Math.min(...rest.map((a) => { const d = angBetween(a.dir, ax); return Math.min(d, 180 - d); }));
    let m = 180; for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) m = Math.min(m, angBetween(arms[i].dir, arms[j].dir)); armMin = m;
  }
  let side = '';
  if (thrLegs.length === 1 && sideAxis.length === 2 && arms.length === 4) {
    const ax2 = [sideAxis[0].dir[0] - sideAxis[1].dir[0], sideAxis[0].dir[1] - sideAxis[1].dir[1]], ends2 = arms.filter((q) => q.id !== thrLegs[0].id);
    const c1 = Math.sign(ax2[0] * ends2[0].dir[1] - ax2[1] * ends2[0].dir[0]), c2 = Math.sign(ax2[0] * ends2[1].dir[1] - ax2[1] * ends2[1].dir[0]);
    side = c1 === c2 ? 'same side' : 'opposite sides';
  }
  const a = arb.get(n.id);
  let type: string;
  if (a && /GRADE-SEPARATED/.test(a.decision)) { type = 'GRADE-SEPARATED'; note.push(`levels differ ${f2(a.gap)} m (21.16 / 21.40), major ${a.major}`); }
  else if (arms.length <= 2) type = 'CONTINUATION (no junction)';
  else if (arms.length >= 4) type = classes.some((c: string) => c === 'R6' || c === 'R4') ? 'ROUNDABOUT 2-lane (50-70 m)' : 'ROUNDABOUT 1-lane (30-45 m)';
  else {
    const maj = [...ta].sort((q, w) => rank[q.cls] - rank[w.cls])[0].cls, mino = rest.map((r) => r.cls), aa = ta.every((q) => A_CLASS.has(q.cls)) && mino.every((c) => A_CLASS.has(c));
    type = aa ? 'T signalised, turn pockets (A x A)' : A_CLASS.has(maj) ? 'T priority + left pocket on the arterial' : 'T priority';
  }
  const b3 = B3NODES.find((q) => hyp(q[1] - cx, q[2] - cz) < 16);
  nodes.push({ id: n.id, x: cx, z: cz, legs: n.legs.map((g: any) => g.id), cls: clsKey, arms: arms.length, kind: kinds.slice().sort().join(''), type, angle, angleBad: angle !== null && arms.length === 3 && angle < ANG_MIN, armMin, side, through: ta.length ? [...new Set(ta.map((q) => q.id))].join('+') : '', minor: rest.map((r) => r.id), note, b3: b3 && b3[0] !== n.id ? b3[0] : '' });
}
pr(`1. NODE INVENTORY: ${nodes.length} nodes, legs ${vp.nodes.reduce((s: number, n: any) => s + n.legs.length, 0)}, arms ${nodes.reduce((s, n) => s + n.arms, 0)}`);
const byCls = new Map<string, number>(); for (const n of nodes) byCls.set(n.cls, (byCls.get(n.cls) ?? 0) + 1);
pr('   class pair of the legs (count): ' + [...byCls.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
const byType = new Map<string, number>(); for (const n of nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
pr('   TYPE decided by the rule below (count): ' + [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | '));
pr('   RULE (MY decision; X1 / X2 / 3.9 / Step 8): 4 or more arms at one node = roundabout (no + at grade); 3 arms = T; T with only arterials (R6 / R4) = signalised with turn pockets; T with an arterial major road = priority T with a left pocket on the arterial; T of collectors / local = priority T; 2 arms = the line only continues; nodes where 21.16 / 21.40 decided GRADE-SEPARATED stay so (design in 21.8); every touch on an 8-lane road = TAP interchange (never at grade, 3.9 + user override)');
const exp: [string, number][] = [['R2xR2', 29], ['R2xR4', 28], ['R4xR4', 9], ['R2xR2xR4', 8], ['CxLxL', 8], ['LxR2', 8], ['R4xR6', 6], ['LxR4', 2]];   // B7-1: LxR4 6 -> 2 (N104 / N106 / N108 / N114 gone, 21.49)
chk(exp.every(([k, v]) => byCls.get(k) === v), `class-pair counts agree with the handover of 21.46 after 21.49 (${exp.map(([k, v]) => k + ' ' + v).join(', ')})`);
chk(nodes.length === 132, 'node count 132 (136 of 21.40 minus the 4 nodes of the cut-back L streets, 21.49 / B7-1)');
const cp = new Map<string, number>(); for (const n of nodes) for (const g of n.legs) cp.set(g, (cp.get(g) ?? 0) + 1);
// distance leg -> node place
let far = 0; for (const n of nodes) for (const g of n.legs) { const d = proj(g, n.x, n.z).d; if (d > END_M + 1) far++; }
chk(far === 0, `every leg line passes within ${END_M + 1} m of its node place (legs farther: ${far})`);
const patt = new Map<string, number>();
for (const n of nodes) {
  if (n.arms < 4) continue; const vn = vp.nodes.find((q: any) => q.id === n.id); const kinds = n.kind;
  const thr = kinds.split('').filter((k: string) => k === 'T').length, ends = kinds.length - thr;
  const key = thr === 0 ? 'ends only' : thr === 1 && ends === 2 ? 'one through + 2 ends, ' + n.side : thr === 2 && ends === 0 ? 'two through lines (+ crossing)' : 'other (' + kinds + ')';
  patt.set(key, (patt.get(key) ?? 0) + 1);
}
pr('   4-arm nodes by pattern of legs: ' + [...patt.entries()].map(([k, v]) => `${k} ${v}`).join(', '));
const stat3 = nodes.filter((n) => n.arms === 3).length, stat4 = nodes.filter((n) => n.arms >= 4).length, stat2 = nodes.filter((n) => n.arms <= 2).length;
pr(`   arms: 3-arm ${stat3}, 4-arm or more ${stat4}, 2-arm ${stat2}`);
pr(`   B3 labels: the node numbers of centre-joint.ts (21.40) and of centre-vprofile.json differ by one at some nodes; matched by place: ` + nodes.filter((n) => n.b3).map((n) => `${n.id} = B3 ${n.b3}`).join(', '));
pr();

// ---------------- 2. angles ----------------
pr(`2. JUNCTION ANGLE of every T (skew angle = end arm vs through line, folded to 0..90 deg; Step 8: >= ${ANG_MIN} deg, else realign)`);
const tn = nodes.filter((n) => n.arms === 3 && n.angle !== null);
const bad = tn.filter((n) => n.angleBad).sort((a, b) => (a.angle as number) - (b.angle as number));
pr(`   T nodes ${tn.length}: >= ${ANG_MIN} deg ${tn.length - bad.length}, ${ANG_BAD}..${ANG_MIN} deg ${bad.filter((n) => (n.angle as number) >= ANG_BAD).length}, < ${ANG_BAD} deg ${bad.filter((n) => (n.angle as number) < ANG_BAD).length}`);
pr('   node  B3     place               legs (axis / minor arm)         class      angle  turn to reach 70');
for (const n of bad) pr(`   ${n.id}  ${(n.b3 || '').padEnd(5)}  (${f0(n.x).padStart(5)}, ${f0(n.z).padStart(5)})  ${(n.through + ' / ' + n.minor.join(',')).padEnd(26)}  ${n.cls.padEnd(9)}  ${f1(n.angle as number).padStart(5)}  ${f1(ANG_MIN - (n.angle as number)).padStart(5)} deg ${((n.angle as number) < ANG_BAD) ? ' SERIOUS' : ''}`);
for (const id of ['N073', 'N028', 'N040', 'N035']) {
  const n = nodes.find((q) => q.b3 === id || q.id === id && !q.b3);
  if (n) info(`B3 sharp node ${id} = ${n.id}: ${n.angle === null ? 'no T' : f1(n.angle as number)} deg here (B3 printed: N073 40.0 / 42, N028 50.4, N040 52.1, N035 51.5 / 52; chord ${TW} m here vs the last polyline segment in B3, +-4 deg is the method)`);
}
info('N072 (B3 N073): the through line R2-52 has the R 22 m corner AT the node (section 3), so its angle depends on the method: 40 deg (B3, end tangent) to 52 deg (widest-arm axis, 20 m chord); it FAILs 70 deg either way');
chk(bad.length === 0, `every T has a skew angle >= ${ANG_MIN} deg  [${bad.length} FAIL = list above, the user decides (R10)]`);
const rbs = nodes.filter((n) => n.arms >= 4 && n.type.startsWith('ROUNDABOUT'));
const rbBad = rbs.filter((n) => (n.armMin as number) < RB_ARM_MIN);
pr(`   ROUNDABOUT nodes ${rbs.length}: smallest angle between neighbouring arms: ` + rbs.map((n) => `${n.id} ${f0(n.armMin as number)} deg (${n.arms} arms)`).join(', '));
chk(rbBad.length === 0, `every roundabout has arms at least ${RB_ARM_MIN} deg apart  [${rbBad.length} FAIL: ${rbBad.map((n) => n.id).join(', ')}]`);
const cont = nodes.filter((n) => n.arms <= 2);
pr(`   CONTINUATION nodes (two lines only meet end to end, no junction): ${cont.length}`);
pr();

// ---------------- 3. corners ----------------
pr('3. R < Rmin CORNERS (fitted PI tables of 21.24 - 21.40; Rmin = class minimum of the design speed; a corner is a bend with an advisory / corner speed below the class speed)');
interface Corner { line: string; cls: string; R: number; V: number; Vcls: number; Rmin: number; s: number; node: string; dn: number; ok: boolean; strict: boolean }
const corners: Corner[] = [];
for (const c of Object.keys(fits)) {
  const d = fits[c];
  for (const ln of d.lines) {
    if (!poly.has(ln.id)) continue;
    for (const q of ln.pis) {
      const strict = q.R < d.params.RMIN - 0.01;   // B7-1: PI radii are stored rounded to 0.01 m (R 40.64 vs Rmin 40.64008 is not a violation)
      if (!strict && !(q.V < d.V)) continue;
      const pr0 = proj(ln.id, q.x, q.z), nl = nodesOfLine.get(ln.id) ?? [];
      let best = { node: '-', dn: Infinity }; for (const m of nl) { const dd = Math.abs(m.s - pr0.s); if (dd < best.dn) best = { node: m.node, dn: dd }; }
      const tot = cumOf.get(ln.id)!; const dEnd = Math.min(pr0.s, tot[tot.length - 1] - pr0.s);   // a free line end counts as 'line end'
      if (dEnd < best.dn) best = { node: 'line end', dn: dEnd };
      corners.push({ line: ln.id, cls: c, R: q.R, V: q.V, Vcls: d.V, Rmin: d.params.RMIN, s: pr0.s, node: best.node, dn: best.dn, ok: best.dn <= CORNER_NODE_M, strict });
    }
  }
}
corners.sort((a, b) => a.cls.localeCompare(b.cls) || a.line.localeCompare(b.line) || a.s - b.s);
const strictC = corners.filter((c) => c.strict), advC = corners.filter((c) => !c.strict);
pr(`   bends with R < Rmin(class): ${strictC.length} on ${new Set(strictC.map((c) => c.line)).size} lines (R6 ${strictC.filter((c) => c.cls === '6').length}, R4 ${strictC.filter((c) => c.cls === '4').length}, R2 ${strictC.filter((c) => c.cls === '2').length}); each has its own lower speed V with R >= Rmin(V) (21.24 check)`);
pr('   line     s(m)    R(m)  Rmin(class)  speed km/h (class)  nearest node / dist along the line  within ' + CORNER_NODE_M + ' m');
for (const c of strictC) pr(`   ${c.line.padEnd(7)} ${f0(c.s).padStart(5)}  ${f0(c.R).padStart(6)}  ${f0(c.Rmin).padStart(6)}      ${String(c.V).padStart(3)} (${c.Vcls})        ${c.node.padEnd(8)} ${f0(c.dn).padStart(5)} m   ${c.ok ? 'junction corner' : 'NOT AT A NODE'}`);
info(`${advC.length} more bends have a speed below the class speed but R >= Rmin(class) (the fit ladder lowered V, R6 ${advC.filter((c) => c.cls === '6').length}, R4 ${advC.filter((c) => c.cls === '4').length}, R2 ${advC.filter((c) => c.cls === '2').length}): not an R < Rmin corner, no fault, list in docs/centre_junction.json`);
chk(strictC.every((c) => c.V >= 10 && c.R >= 10), 'every R < Rmin corner has its own speed (>= 10 km/h) and a radius (PI table complete)');
const cbad = strictC.filter((c) => !c.ok);
chk(cbad.length === 0, `every R < Rmin corner lies within ${CORNER_NODE_M} m of a node of its own line (junction corner, advisory speed there)  [${cbad.length} FAIL: ${cbad.map((c) => c.line + '@' + f0(c.s) + ' R' + f0(c.R) + ' vs ' + f0(c.Rmin)).join(', ')}]`);
pr();

// ---------------- 4. section 3.8 ----------------
pr('4. SECTION 3.8 CHECK: no local street (L) straight onto a divided arterial (R4), a motorway (R6, M8, J1 arms); 3.9: A x L = no (via C); C x A is allowed');
const r2lines = [...poly.keys()].filter((id) => clsOf.get(id) === '2' || clsOf.get(id) === 'C');
interface S38 { node: string; local: string; big: string; angle: number | null; nearR2: number; nearId: string }
const s38: S38[] = [];
for (const n of nodes) {
  const locals = n.legs.filter((g) => clsOf.get(g) === 'L'), bigs = n.legs.filter((g) => ['4', '6'].includes(clsOf.get(g)!));
  for (const lc of locals) for (const bg of bigs) {
    let nearR2 = Infinity, nearId = '-'; for (const id of r2lines) { if (n.legs.includes(id)) continue; const d = proj(id, n.x, n.z).d; if (d < nearR2) { nearR2 = d; nearId = id; } }
    s38.push({ node: n.id, local: lc, big: bg, angle: n.angle, nearR2, nearId });
  }
}
for (const t of r5.after) if (String(t.cls) === 'L') s38.push({ node: 'tap ' + t.line, local: t.line, big: t.on, angle: null, nearR2: NaN, nearId: '-' });
pr(`   local street meets R4 / R6 / 8-lane road directly: ${s38.length} pairs`);
pr('   node   local     arterial  node angle  nearest R2 / C road not at the node');
for (const s of s38) pr(`   ${s.node.padEnd(6)} ${s.local.padEnd(8)}  ${s.big.padEnd(8)}  ${s.angle === null ? '  -  ' : f1(s.angle).padStart(5)}      ${Number.isFinite(s.nearR2) ? s.nearId + ' ' + f0(s.nearR2) + ' m' : '-'}`);
chk(s38.length === 0, `no local street (L) straight onto a divided arterial / motorway  [${s38.length} FAIL = list above; smallest fix = the L street ends on a collector (C / R2) or a frontage road, or the user accepts it as an exception (R10)]`);
const s38nodes = new Set(s38.map((s) => s.node)); for (const n of nodes) if (s38nodes.has(n.id)) n.note.push('3.8: local street on an arterial');
pr();

// ---------------- 5. node gaps (X6 / R1) ----------------
pr(`5. NODE GAPS (X6 / R1: at least ${NODE_GAP_MIN} m between nodes; node place = mean of its leg points)`);
const gaps: { a: string; b: string; d: number }[] = [];
for (let i = 0; i < nodePts.length; i++) for (let j = i + 1; j < nodePts.length; j++) { const d = hyp(nodePts[i].p[0] - nodePts[j].p[0], nodePts[i].p[1] - nodePts[j].p[1]); if (d < NODE_GAP_MIN) gaps.push({ a: nodePts[i].id, b: nodePts[j].id, d }); }
for (const g of gaps) pr(`   ${g.a} - ${g.b}  ${f1(g.d)} m`);
chk(gaps.length === 0, `all node pairs at least ${NODE_GAP_MIN} m apart  [${gaps.length} FAIL]`);
pr();

// ---------------- 6. the 22 nodes on 8-lane roads ----------------
pr('6. NODES ON 8-LANE ROADS (docs/centre_r5.json, AFTER = fitted + joined lines): TAP interchange, never at grade');
const touches: any[] = r5.after;
const lineMap = new Map<string, any>(); for (const l of cf.lines) lineMap.set(l.id, l);
// merge touches within 60 m into one node
const tnodes: { id: string; x: number; z: number; on: string; ends: any[] }[] = [];
for (const t of touches) { const m = tnodes.find((q) => hyp(q.x - t.x, q.z - t.z) < 60); if (m) m.ends.push(t); else tnodes.push({ id: 'T' + String(tnodes.length + 1).padStart(2, '0'), x: t.x, z: t.z, on: t.on, ends: [t] }); }
chk(touches.length === 23 && tnodes.length === 22, `23 line ends make 22 distinct nodes on 8-lane roads (21.41)  [${touches.length} ends, ${tnodes.length} nodes]`);
const eightId = (id: string): string[] => cf.lines.filter((l: any) => String(l.cls) === '8').map((l: any) => l.id);
pr('   node  place                 on        ends (line end class)       angle to the 8-lane road  type');
const tapRows: any[] = [];
for (const q of tnodes) {
  const road = cf.lines.find((l: any) => l.id === q.on);
  const rp = road ? proj(q.on, q.x, q.z) : null;
  let roadDir = [1, 0]; if (rp) { const a = at(q.on, rp.s - TW / 2), b = at(q.on, rp.s + TW / 2); roadDir = unit([b[0] - a[0], b[1] - a[1]]); }
  const ang: string[] = [];
  for (const e of q.ends) {
    const c = cumOf.get(e.line)!, tot = c[c.length - 1], sPos = e.end === 'S' ? 0 : tot, P = at(e.line, sPos), Q = at(e.line, e.end === 'S' ? TW : tot - TW);
    const a = angBetween(unit([Q[0] - P[0], Q[1] - P[1]]), roadDir); e.angle = Math.min(a, 180 - a); ang.push(f0(e.angle));
  }
  const cl = q.ends.map((e: any) => `${e.line}(${e.end},R${e.cls})`).join(' + ');
  const type = q.ends.every((e: any) => A_CLASS.has(String(e.cls))) ? 'TAP interchange (3-leg T onto the 8-lane road, trumpet family; type fixed in 9.2 / 21.8)' : 'NOT ALLOWED (R5a)';
  pr(`   ${q.id}  (${f0(q.x).padStart(5)}, ${f0(q.z).padStart(5)})  ${q.on.padEnd(8)}  ${cl.padEnd(26)}  ${ang.join(' / ').padStart(8)} deg   ${type}`);
  tapRows.push({ id: q.id, x: q.x, z: q.z, on: q.on, ends: q.ends.map((e: any) => ({ line: e.line, end: e.end, cls: e.cls, angle: e.angle })), type });
}
chk(touches.every((t: any) => A_CLASS.has(String(t.cls))), 'R5a: only R6 / R4 touch an 8-lane road (0 R2 / C / L ends)');
const tapAngBad = tapRows.filter((r) => r.ends.some((e: any) => e.angle < ANG_MIN));
pr(`   angle to the 8-lane road below ${ANG_MIN} deg: ${tapAngBad.length} nodes (${tapAngBad.map((r) => r.id + ' ' + r.ends.map((e: any) => e.line + ' ' + f0(e.angle)).join(',')).join('; ')})`);
info(`the 70 deg rule of Step 8 is for AT-GRADE skew; no skew rule for an interchange branch was found in the handoff, so these ${tapAngBad.length} nodes (57 - 64 deg) are INFO, not a FAIL (a trumpet ramp takes a skew; to be decided in 21.8 / 9.2)`);
pr();

// ---------------- 7. the three limits ----------------
pr('7. THE THREE LIMITS OF 21.43 (recomputed from the data; the user must say OK in words)');
let dSp = Infinity, pSp = '', dJ = Infinity, pJ = '', dP = Infinity, pP = '';
for (let i = 0; i < tnodes.length; i++) for (let j = i + 1; j < tnodes.length; j++) { const d = hyp(tnodes[i].x - tnodes[j].x, tnodes[i].z - tnodes[j].z); if (d < dSp) { dSp = d; pSp = `${tnodes[i].ends.map((e: any) => e.line + ' ' + e.end).join('+')} / ${tnodes[j].ends.map((e: any) => e.line + ' ' + e.end).join('+')}`; } }
for (const q of tnodes) for (const j of r5.joins) { const d = hyp(q.x - j.x, q.z - j.z); if (d < dJ) { dJ = d; pJ = `${q.ends.map((e: any) => e.line + ' ' + e.end).join('+')} on ${q.on} / join ${j.ids}`; } }
for (const q of tnodes) { const d = hyp(q.x - J1C[0], q.z - J1C[1]) - J1R; if (d < dP) { dP = d; pP = `${q.ends.map((e: any) => e.line + ' ' + e.end).join('+')} on ${q.on}`; } }
pr(`   R5d tap spacing R4 / R6 (at-grade T rule replaced): smallest pair ${f1(dSp)} m (${pSp}); limit ${LIM.SPACING} m instead of ${OLD.SPACING} m`);
pr(`   R5b distance from a ring x arm join: smallest ${f1(dJ)} m (${pJ}); limit ${LIM.JOIN} m instead of ${OLD.JOIN} m (${OLD.JOIN - LIM.JOIN} m less)`);
pr(`   R5c distance from the J1 plaza edge (centre ${J1C.join(', ')}, radius ${J1R} m): smallest ${f1(dP)} m (${pP}); limit ${LIM.J1} m instead of ${OLD.J1} m (${OLD.J1 - LIM.J1} m less)`);
chk(Math.abs(dSp - 257.5) < 1.5 && Math.abs(dJ - 416.0) < 1.5 && Math.abs(dP - 394.2) < 1.5, 'the three smallest values reproduce 21.43 (257.5 / 416.0 / 394.2 m)');
chk(dSp >= LIM.SPACING && dJ >= LIM.JOIN && dP >= LIM.J1, `nothing is worse than the three limits ${LIM.SPACING} / ${LIM.JOIN} / ${LIM.J1} m  (true by construction, as in 21.43)`);
info('R5b / R5c are the bigger break of the old hard rule (600 m): MY estimate (not a handoff number): a trumpet TAP needs about 2 x (taper 91 + decel 100) = 380 m + noses on the open road, so 416 m and 394 m are at that edge; a user OK is needed (21.45: the OK was not given in words)');
pr();

// ---------------- 8. N030 / N074 ----------------
pr('8. THE TWO GRADE-SEPARATED NODES (21.16 / 21.40)');
for (const a of vp.arbitration.filter((q: any) => /GRADE-SEPARATED/.test(q.decision))) {
  const n = nodes.find((q) => q.id === a.node)!;
  const minorLeg = a.legs.find((g: any) => g.id !== a.major), cm = minorLeg.cls, gm = GRADE_MAX[cm] ?? 0.06;
  pr(`   ${a.node} (${f0(a.x)}, ${f0(a.z)}): ${a.legs.map((g: any) => `${g.id} (R${g.cls}) level ${f2(g.after)} m`).join(' x ')}, spread ${f2(a.gap)} m (21.16 first run: ${a.node === 'N030' ? '11.41 m' : '7.73 m, it was called N075 there'}), major ${a.major}, skew angle ${n.angle === null ? '-' : f1(n.angle)} deg, ${n.arms} arms`);
  pr(`        INFO: to meet at grade the minor road ${minorLeg.id} would have to climb ${f2(a.gap)} m at its class limit ${f0(gm * 100)} % = ${f0(a.gap / gm)} m of road; 21.16 rejected the regrade (legs still ${f2(a.gap)} m apart). Type kept: grade-separated, design in 21.8 (R12: tunnel last).`);
  if (n.angleBad) pr(`        also: skew angle ${f1(n.angle as number)} deg below ${ANG_MIN}`);
}
chk(vp.arbitration.filter((q: any) => /GRADE-SEPARATED/.test(q.decision)).map((q: any) => q.node).sort().join() === 'N030,N074', 'exactly N030 and N074 are grade-separated (21.16 / 21.40)');
const flatNodes = vp.nodes.filter((n: any) => !arb.has(n.id)).length;
info(`${flatNodes} nodes have no level conflict (spread <= 0.03 m, 21.40); N033 / N089 / N108 were regraded to 0.00 m (21.16)`);
pr();

// ---------------- summary ----------------
pr(`SUMMARY 21.7-1: ${pass} PASS, ${fail} FAIL`);
pr(`FAIL LISTS (the user decides, R10): angle < ${ANG_MIN} deg ${bad.length} T nodes (${bad.filter((n) => (n.angle as number) < ANG_BAD).length} below ${ANG_BAD}), 3.8 local street on an arterial ${s38.length}, corners not at a node ${cbad.length}, node gaps < ${NODE_GAP_MIN} m ${gaps.length}, roundabout arms < ${RB_ARM_MIN} ${rbBad.length}`);
writeFileSync(`${OUT}/STEP_21_7_1_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_junction.json`, JSON.stringify({ note: 'STEP 21.7-1 junction inventory', constants: { END_M, TW, ANG_MIN, ANG_BAD, RB_ARM_MIN, NODE_GAP_MIN, CORNER_NODE_M, LIM, OLD }, nodes, taps: tapRows, corners, s38, gaps, limits: { dSp, dJ, dP, pSp, pJ, pP } }));
