// STEP B2b (21.42): APPLY the B2 decision (AI engineering decision, user 2026-11-18 'you decide / you fix it').
//   A for the NEAR nodes: a node on an 8-lane road that is 61 - 450 m from a known tap slides along its 8-lane road onto that tap; the last part of the line is refitted.
//   R5b / R5c: R4-29 end (416 m from the M8 x J1-W join) slides along J1-W until it is JOIN_MIN + 10 m (straight) from the join. R4-12 start reaches the plaza distance by its slide to T-E610 (checked).
//   B for the FAR nodes (13, over 450 m from a tap): NOT moved here; they stay drawn nodes = taps of their own (rule change in 21.7, listed in the output).
// Changes NO src file. Reads docs/centre_r5.json (B2 proposal), docs/centre_fit_{6,4,2,C,L}.json, docs/fit_chain/centre_fixed.json (fitted lines), docs/centre_fixed.json (drawn lines).
// Writes (only without DRY=1 and with 0 FAIL): docs/centre_fit_<cls>.json (S / E / pis of the slid lines, field b2b with the old values; old files in docs/fit_chain/before_b2b/), docs/STEP_B2B_OUTPUT.txt.
// REFIT METHOD: the end goes to the target on the 8-lane road. The PIs of the last part of the line move by the same vector with a weight: the PI nearest to the end 1.0, then falling linearly
//   to 0 over FALL m along the line (FALL ladder 150 ... 900 m). First ladder step whose alignment is valid wins. Valid = built, end gap < 0.25 m, no negative straight, end tangent turn <= TURN_MAX, junction
//   angle to the 8-lane road >= JA_MIN, no NEW crossing with another new line, every other line end that sat on this line stays on it (< DEP_TOL m), line does not move more than SLIDE + 150 m anywhere.
// Run: DRY=1 node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-b2b.ts docs      (prints only)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';

const OUT = process.argv[2] ?? 'docs', DRY = !!process.env.DRY;
const NEAR_MAX = 450, TAP_SNAP = 60, JOIN_MIN = 600, JOIN_EXTRA = 10, ENDGAP_MAX = 0.25, TURN_MAX = 30, JA_MIN = 45, DEP_TOL = 12, XEND = 15, DS = 5;
const FALLS = [150, 250, 350, 500, 700, 900];
const f1 = (v: number): string => v.toFixed(1), f0 = (v: number): string => v.toFixed(0);
const deg = (r: number): number => (r * 180) / Math.PI;
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const dist = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const R5 = JSON.parse(readFileSync(`${OUT}/centre_r5.json`, 'utf8'));
const fitFiles = ['6', '4', '2', 'C', 'L'].map((c) => ({ c, path: `${OUT}/centre_fit_${c}.json`, j: JSON.parse(readFileSync(`${OUT}/centre_fit_${c}.json`, 'utf8')) }));
const fit = new Map<string, any>(); for (const f of fitFiles) for (const q of f.j.lines) fit.set(q.id, q);
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const drawn = new Map<string, number[][]>(JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8')).lines.map((l: any) => [l.id, l.pts]));
const poly = new Map<string, number[][]>(FX.lines.map((l: any) => [l.id, l.pts]));
const lineInfo = new Map<string, any>(FX.lines.map((l: any) => [l.id, l]));
const eightPts = (id: string): number[][] => poly.get(id)!;

function proj(pts: number[][], x: number, z: number): { d: number; p: number[]; i: number; s: number } {
  let best = { d: Infinity, p: [0, 0], i: 0, s: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, s2 = dx * dx + dz * dz, sl = Math.sqrt(s2);
    const t = s2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / s2));
    const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, p: [px, pz], i, s: acc + t * sl };
    acc += sl;
  }
  return best;
}
const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i], p[i - 1]); return s; };
function build(S: number[], E: number[], pis: any[]): { pts: number[][]; al: any } {
  const al = buildOpenAlignment({ x: S[0], z: S[1] }, pis.map((p: any) => ({ x: p.x, z: p.z, R: p.R, Ls: p.Ls })), { x: E[0], z: E[1] });
  const smp = (sampleAlignment(al, DS).samples as { x: number; z: number }[]).map((s) => [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100]);
  const last = smp[smp.length - 1]; if (dist(last, E) > 0.05) smp.push([E[0], E[1]]);
  return { pts: smp, al };
}
const tang = (pts: number[][], atEnd: boolean): number => atEnd ? Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 2][1], pts[pts.length - 1][0] - pts[pts.length - 2][0]) : Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function segX(a: number[], b: number[], c: number[], d: number[]): number[] | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}
// crossings of a polyline with the other NEW lines (not built / 8-lane / dropped), crossings within XEND m of an end of either line are junctions, not crossings
function crossings(id: string, pts: number[][]): string[] {
  const res = new Set<string>();
  for (const [oid, op] of poly) {
    if (oid === id) continue; const li = lineInfo.get(oid); if (li.dropped || li.built || String(li.cls) === '8') continue;
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < op.length - 1; j++) {
      const x = segX(pts[i], pts[i + 1], op[j], op[j + 1]); if (!x) continue;
      const ends = [pts[0], pts[pts.length - 1], op[0], op[op.length - 1]];
      if (ends.some((e) => dist(e, x) < XEND)) continue; res.add(oid);
    }
  }
  return [...res].sort();
}
// other line ends that sit on this line (within DEP_TOL): dependents
function dependents(id: string, pts: number[][]): { oid: string; end: string; e: number[] }[] {
  const r: { oid: string; end: string; e: number[] }[] = [];
  for (const [oid, op] of poly) { if (oid === id) continue; const li = lineInfo.get(oid); if (li.dropped) continue;
    for (const [k, e] of [['S', op[0]], ['E', op[op.length - 1]]] as [string, number[]][]) if (proj(pts, e[0], e[1]).d <= DEP_TOL) r.push({ oid, end: k, e }); }
  return r;
}

pr('STEP B2b (21.42): near nodes slide onto their taps, R4-29 leaves the join by 600 m (headless; nothing in src changed; tsc / npm run build / game NOT RUN: no node_modules)');
// ---------- plan ----------
interface Move { id: string; end: 'S' | 'E'; node: string; on: string; target: number[]; slide: number; why: string }
const plan: Move[] = []; const farNodes: any[] = [];
for (const p of R5.proposal) {
  const legs = (p.legs as string[]).map((g) => ({ id: g.slice(0, -1), end: g.slice(-1) as 'S' | 'E' }));
  const label = `(${p.x}, ${p.z}) on ${p.on} legs ${p.legs.join(' ')}`;
  if (p.slide <= TAP_SNAP) { pr(`   stays: ${label} already at tap ${p.tap} (${p.slide} m)`); continue; }
  if (p.slide > NEAR_MAX) { farNodes.push(p); continue; }
  const road = eightPts(p.on);
  const join = (R5.joins as any[]).map((j) => ({ j, d: Math.hypot(j.x - p.x, j.z - p.z) })).sort((a, b) => a.d - b.d)[0];
  if (legs.some((g) => g.id === 'R4-29')) {
    // R5b: slide along the road away from the join until the straight distance is JOIN_MIN + JOIN_EXTRA
    const s0 = proj(road, p.x, p.z).s; const total = plen(road);
    let dir = 0, bestT: number[] | null = null;
    for (const sgn of [1, -1]) { const pj = (s: number): number[] => { let a = 0; for (let i = 0; i < road.length - 1; i++) { const l = dist(road[i], road[i + 1]); if (a + l >= s) { const t = (s - a) / l; return [road[i][0] + t * (road[i + 1][0] - road[i][0]), road[i][1] + t * (road[i + 1][1] - road[i][1])]; } a += l; } return road[road.length - 1]; };
      const d0 = Math.hypot(pj(s0)[0] - join.j.x, pj(s0)[1] - join.j.z); const d1 = Math.hypot(pj(Math.max(0, Math.min(total, s0 + sgn * 100)))[0] - join.j.x, pj(Math.max(0, Math.min(total, s0 + sgn * 100)))[1] - join.j.z);
      if (d1 > d0) { dir = sgn; for (let s = s0; s >= 0 && s <= total; s += sgn * 2) { const q = pj(s); if (Math.hypot(q[0] - join.j.x, q[1] - join.j.z) >= JOIN_MIN + JOIN_EXTRA) { bestT = q; break; } } } }
    if (!bestT) { pr(`   R4-29: no target found on ${p.on}`); chk(false, 'R4-29 target 610 m from the join'); continue; }
    for (const g of legs) plan.push({ id: g.id, end: g.end, node: label, on: p.on, target: bestT.map((v) => Math.round(v * 100) / 100), slide: dist([p.x, p.z], bestT), why: `R5b: ${JOIN_MIN + JOIN_EXTRA} m from the join ${join.j.ids} (direction ${dir > 0 ? '+' : '-'})` });
    continue;
  }
  const tap = (R5.taps as any[]).find((t) => t.id === p.tap)!; const tp = proj(road, tap.x, tap.z);
  const tgt = tp.p.map((v) => Math.round(v * 100) / 100);
  for (const g of legs) plan.push({ id: g.id, end: g.end, node: label, on: p.on, target: tgt, slide: dist([p.x, p.z], tgt), why: `tap ${p.tap} (tap point ${f1(tp.d)} m from the road line)` });
}
pr(`   plan: ${plan.length} line ends on ${new Set(plan.map((m) => m.node)).size} near nodes; far nodes left as taps of their own (B): ${farNodes.length}`);
pr('');
pr('   line   end node                                           slide m   turn deg  junction deg  max shift m  fall m  new X   dependents');

// ---------- refit ----------
const moved = new Map<string, { S: number[]; E: number[]; pis: any[] }>(); const rows: any[] = [];
for (const m of plan) {
  const q = fit.get(m.id); if (!q) { chk(false, `${m.id}: no fit record`); continue; }
  const cur = moved.get(m.id) ?? { S: q.S, E: q.E, pis: q.pis };
  const old = poly.get(m.id)!; const oldX = crossings(m.id, old); const deps = dependents(m.id, old);
  const e0 = m.end === 'S' ? cur.S : cur.E; const v = [m.target[0] - e0[0], m.target[1] - e0[1]];
  const n = cur.pis.length;
  // along-line distance of every PI from the moving end
  const alongEnd = cur.pis.map((p: any) => { const pr_ = proj(old, p.x, p.z); const tot = plen(old); return m.end === 'S' ? pr_.s : tot - pr_.s; });
  const nearestD = Math.min(...alongEnd);
  let done = false;
  const roadPts = eightPts(m.on); const rp = proj(roadPts, m.target[0], m.target[1]); const rj = Math.min(rp.i + 1, roadPts.length - 1);
  const rt = Math.atan2(roadPts[rj][1] - roadPts[rp.i][1], roadPts[rj][0] - roadPts[rp.i][0]);
  for (const FALL of FALLS) {
    const pis = cur.pis.map((p: any, i: number) => { const w = Math.max(0, Math.min(1, 1 - (alongEnd[i] - nearestD) / FALL)); return { ...p, x: p.x + v[0] * w, z: p.z + v[1] * w }; });
    const S = m.end === 'S' ? m.target : cur.S, E = m.end === 'E' ? m.target : cur.E;
    let b: { pts: number[][]; al: any }; try { b = build(S, E, pis); } catch (e) { if (process.env.VERB) pr(`      ${m.id} fall ${FALL}: build failed`); continue; }
    const minStr = Math.min(...(b.al.straights as number[]));
    const turn = Math.abs(deg(wrap(tang(b.pts, m.end === 'E') - tang(old, m.end === 'E'))));
    const et = tang(b.pts, m.end === 'E'); let ja = Math.abs(deg(wrap(et - rt))); if (ja > 90) ja = 180 - ja;
    let maxShift = 0; for (const p of b.pts) maxShift = Math.max(maxShift, proj(old, p[0], p[1]).d);
    const newX = crossings(m.id, b.pts).filter((x) => !oldX.includes(x));
    const brokenDeps = deps.filter((d) => proj(b.pts, d.e[0], d.e[1]).d > DEP_TOL);
    const ok = b.al.endGap < ENDGAP_MAX && minStr >= 0 && turn <= TURN_MAX && ja >= JA_MIN && maxShift <= m.slide + 150 && newX.length === 0 && brokenDeps.length === 0;
    if (process.env.VERB) pr(`      ${m.id} fall ${FALL}: gap ${b.al.endGap.toFixed(3)} minStr ${f1(minStr)} turn ${f1(turn)} ja ${f1(ja)} shift ${f1(maxShift)} newX ${newX.join('/') || '-'} brokenDeps ${brokenDeps.map((d) => d.oid + d.end).join('/') || '-'} -> ${ok ? 'ok' : 'no'}`);
    if (!ok) continue;
    rows.push({ m, FALL, turn, ja, maxShift, b, newX, deps });
    moved.set(m.id, { S, E, pis }); poly.set(m.id, b.pts); done = true;
    pr(`   ${m.id.padEnd(6)} ${m.end}   ${m.node.slice(0, 44).padEnd(44)} ${f1(m.slide).padStart(7)}   ${f1(turn).padStart(7)}   ${f1(ja).padStart(10)}   ${f1(maxShift).padStart(9)}  ${String(FALL).padStart(6)}  ${newX.length}      ${deps.map((d) => d.oid + d.end).join(' ') || '-'}`);
    break;
  }
  if (!done) chk(false, `${m.id} ${m.end}: no refit gives a valid alignment (ladder ${FALLS.join(' / ')} m); target ${m.target.join(', ')}, ${m.why}`);
}

// ---------- checks ----------
pr('');
pr('CHECKS');
chk(rows.length === plan.length, `every planned slide was refitted (${rows.length} of ${plan.length})`);
for (const r of rows) {
  const last = r.m.end === 'S' ? r.b.pts[0] : r.b.pts[r.b.pts.length - 1];
  chk(dist(last, r.m.target) < 0.05 && proj(eightPts(r.m.on), last[0], last[1]).d < 0.5, `${r.m.id} ${r.m.end} ends on ${r.m.on} at the target (${r.m.why})`);
}
// node spacing after: distinct nodes on the 8-lane roads (touches within TAP_SNAP = one node), moved ends + untouched ends
const all: { x: number; z: number; legs: string[] }[] = [];
for (const [id, pts] of poly) { const li = lineInfo.get(id); if (li.dropped || li.built || String(li.cls) === '8' || !['4', '6'].includes(String(li.cls))) continue;
  for (const [k, e] of [['S', pts[0]], ['E', pts[pts.length - 1]]] as [string, number[]][]) {
    let onRoad = false; for (const [rid, rp] of poly) { const rl = lineInfo.get(rid); if (String(rl.cls) === '8' && !rl.dropped && proj(rp, e[0], e[1]).d <= 12) onRoad = true; }
    if (!onRoad) continue; const nd = all.find((a) => Math.hypot(a.x - e[0], a.z - e[1]) <= TAP_SNAP); if (nd) nd.legs.push(id + k); else all.push({ x: e[0], z: e[1], legs: [id + k] }); } }
let minSp = Infinity, pair = '';
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const d = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z); if (d < minSp) { minSp = d; pair = `${all[i].legs.join('+')} / ${all[j].legs.join('+')}`; } }
pr(`   nodes on the 8-lane roads after the slides: ${all.length} (before 22); smallest spacing between two nodes ${f0(minSp)} m (${pair})`);
chk(minSp >= 258 - 1, `smallest node spacing >= 258 m, the value that rule B takes for R4 / R6 at-grade T junctions (21.7 point 4)`);
// R5b / R5c after
const joinD = (x: number, z: number): number => Math.min(...(R5.joins as any[]).map((j) => Math.hypot(j.x - x, j.z - z)));
const J1 = { x: -87, z: -277, r: 100 };
for (const id of ['R4-29', 'R4-12']) { const r = rows.find((q) => q.m.id === id); if (!r) continue; const e = r.m.target;
  if (id === 'R4-29') chk(joinD(e[0], e[1]) >= JOIN_MIN, `R5b R4-29 end ${f0(joinD(e[0], e[1]))} m from the nearest ring x arm join (>= ${JOIN_MIN})`);
  else chk(Math.hypot(e[0] - J1.x, e[1] - J1.z) - J1.r >= 600, `R5c R4-12 end ${f0(Math.hypot(e[0] - J1.x, e[1] - J1.z) - J1.r)} m from the J1 plaza edge (>= 600)`); }
pr(`   far nodes kept as taps (rule B, ${farNodes.length}): ${farNodes.map((p: any) => `${p.legs.join('+')}(${p.slide} m from ${p.tap})`).join(', ')}`);
pr(`   RESULT ${pass} PASS ${fail} FAIL; ${rows.length} line ends slid on ${moved.size} lines; largest slide ${f1(Math.max(0, ...plan.map((m) => m.slide)))} m`);

if (!DRY && fail === 0) {
  mkdirSync(`${OUT}/fit_chain/before_b2b`, { recursive: true });
  for (const f of fitFiles) {
    const bk = `${OUT}/fit_chain/before_b2b/centre_fit_${f.c}.json`; if (!existsSync(bk)) copyFileSync(f.path, bk);
    let ch = false;
    for (const q of f.j.lines) { const mv = moved.get(q.id); if (!mv) continue;
      q.b2b = { sOld: q.S, eOld: q.E, pisOld: q.pis, moves: plan.filter((m) => m.id === q.id).map((m) => ({ end: m.end, to: m.target, slide: Math.round(m.slide * 10) / 10, why: m.why })) };
      q.S = mv.S; q.E = mv.E; q.pis = mv.pis; q.endGap = 0; ch = true; }
    if (ch) writeFileSync(f.path, JSON.stringify(f.j, null, 0));
  }
  pr('   written: docs/centre_fit_<cls>.json (S / E / PIs of the slid lines); old files in docs/fit_chain/before_b2b/');
  writeFileSync(`${OUT}/STEP_B2B_OUTPUT.txt`, L.join('\n') + '\n');
} else if (DRY) pr('   DRY RUN: nothing written');
process.exit(fail === 0 ? 0 : 1);
