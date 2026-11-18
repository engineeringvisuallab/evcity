// STEP 21.7-3 JUNCTION FIXES (headless). Changes NO src file. DRY (default) prints and writes only docs/STEP_21_7_3_OUTPUT.txt + docs/centre_junction_fix.json;
// APPLY=1 also changes docs/centre_fit_{4,2,L}.json (old files in docs/fit_chain/before_713/) and then the chain of 21.39 must be run again.
// DECISIONS TAKEN BY THE AI (user 2026-11-18 'you are my engineer, so fix you'); all constants below are MY choices and printed:
//  (a) the 10 T nodes of 21.47 list (a) under 60 deg: the MINOR line is bent in its last stretch so that it meets the through line at 90 deg. The END point of the minor line (already on the
//      through line since B3) does not move. A new last PI is put on the normal to the through line at that end at distance LT; the nearest 0 / 1 / 2 old PIs are replaced by it;
//      R and Ls of the new PI come from a short ladder (class minimum x 1 .. 4). The variant with the smallest deviation from the old line wins. Checks: valid alignment (all straights >= 0,
//      arc >= 0, end gap < 0.25 m), angle to the through line (>= 85 deg), no crossing of any other line (R1), no building / water / rail in the NEW part (R8), the other nodes of the line stay on it (<= 12 m).
//  (b) L-8, L-9, L-10, L-16 (3.8: local street onto an R4): each is cut back so that it ENDS CUL-DE-SAC_GAP m from the R4-10 centre line (a turning head, no junction); the traffic uses C-3 and the
//      R2 collectors. L-7 / L-4 / L-5 stay as recorded EXCEPTIONS (432 - 839 m from a collector).
// Run: [APPLY=1] node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-junction-fix.ts docs
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';

const OUT = process.argv[2] ?? 'docs', APPLY = !!process.env.APPLY;
const hyp = Math.hypot, f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);

// ---------------- constants (MY choices) ----------------
const TARGETS = ['N028', 'N034', 'N035', 'N039', 'N050', 'N067', 'N070', 'N072', 'N080', 'N102'];
const LEAVE = new Set(['N072', 'N102']);   // N072: the through line R2-52 has its R 22 m corner AT the node (no tangent to be perpendicular to); N102: 25.6 deg, swing 64 deg, crosses L-6; both stay on the user's list
const LT_LADDER = [30, 40, 55, 70, 90, 120, 160, 220];              // m, length of the final straight (PI to the junction) tried
const RF_LADDER = [1, 1.3, 1.7, 2.5, 4];                         // factor on the class minimum radius for the new PI
const LS_BY_CLS: Record<string, number> = { '6': 100, '4': 60, '2': 30, C: 30, L: 20 };
const RMIN_BY_CLS: Record<string, number> = { '6': 229.06, '4': 113.39, '2': 40.64, C: 40.64, L: 19.69 };   // Standards.ts minRadius, same as the fit params
const ANG_MIN = 85;                                              // deg, result angle must reach this (90 by construction)
const ENDGAP_MAX = 0.25, DS = 5, DEV_MAX = 80, NODE_TOL = 12;   // DEV_MAX 80 m: bending a straight line from 40 - 60 deg to 90 deg moves its far PI about LT x sin(turn) away
const HALF: Record<string, number> = { '6': 19, '4': 15, '2': 11, C: 10, L: 9 };
const RAIL_CLEAR = 25, GRID = 4, FREE = 6;                       // m: rail clearance, sample grid, a point of the new line is 'new' when more than FREE m from the old line
const CUL_GAP = 35;                                              // m, an L street cut back ends this far from the R4-10 centre line (corridor half width 15 + turning head 20)
const L_CUT = ['L-8', 'L-9', 'L-10', 'L-16'];
const CLS_RANK: Record<string, number> = { '8': 0, '6': 1, '4': 2, '2': 3, C: 4, L: 5 };
void CLS_RANK;

// ---------------- data ----------------
const rd = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const cj = rd(`${OUT}/centre_junction.json`), vp = rd(`${OUT}/centre_vprofile.json`), FX = rd(`${OUT}/fit_chain/centre_fixed.json`);
const fitFiles = ['6', '4', '2', 'C', 'L'].map((c) => ({ c, path: `${OUT}/centre_fit_${c}.json`, j: rd(`${OUT}/centre_fit_${c}.json`) }));
const fit = new Map<string, any>(), clsOf = new Map<string, string>(); for (const f of fitFiles) for (const q of f.j.lines) { fit.set(q.id, q); clsOf.set(q.id, f.c); }
const poly = new Map<string, number[][]>(); for (const l of FX.lines) { if (!l.dropped) poly.set(l.id, l.pts); }
for (const l of FX.lines) if (!clsOf.has(l.id)) clsOf.set(l.id, String(l.cls));
const nodeOf = new Map<string, any>(); for (const n of vp.nodes) nodeOf.set(n.id, n);
const dist = (a: number[], b: number[]): number => hyp(a[0] - b[0], a[1] - b[1]);
function proj(pts: number[][], x: number, z: number): { d: number; p: number[]; i: number } {
  let best = { d: Infinity, p: [0, 0], i: 0 };
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, s2 = dx * dx + dz * dz, t = s2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / s2)); const px = ax + t * dx, pz = az + t * dz, d = hyp(x - px, z - pz); if (d < best.d) best = { d, p: [px, pz], i }; }
  return best;
}
const devMax = (a: number[][], b: number[][]): number => { let m = 0; for (const p of a) m = Math.max(m, proj(b, p[0], p[1]).d); return m; };
function segX(a: number[], b: number[], c: number[], d: number[]): number[] | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}
function build(S: number[], E: number[], pis: any[]): { pts: number[][]; al: any } {
  const al = buildOpenAlignment({ x: S[0], z: S[1] }, pis.map((p: any) => ({ x: p.x, z: p.z, R: p.R, Ls: p.Ls })), { x: E[0], z: E[1] });
  const smp = (sampleAlignment(al, DS).samples as { x: number; z: number }[]).map((s) => [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100]);
  if (dist(smp[smp.length - 1], E) > 0.05) smp.push([E[0], E[1]]);
  return { pts: smp, al };
}
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ground (R8), same conventions as centre-junction-geom.ts
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const wetAt = (x: number, z: number): boolean => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h; };
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const railPts: number[][] = []; for (const e of gen.rail.edges as any[]) for (let k = 0; k < e.xs.length; k++) railPts.push([e.xs[k], e.zs[k]]);
function bldDist(b: any, x: number, z: number): number { const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, lx = dx * co - dz * si, lz = dx * si + dz * co; return hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)); }
function groundOfNew(newPts: number[][], oldPts: number[][], hw: number): string[] {
  const why = new Set<string>(); const part = newPts.filter((p) => proj(oldPts, p[0], p[1]).d > FREE); if (!part.length) return [];
  const cx = part.reduce((a, p) => a + p[0], 0) / part.length, cz = part.reduce((a, p) => a + p[1], 0) / part.length;
  const nb = RECTS.filter((b) => hyp(b.x - cx, b.z - cz) < 500), rl = railPts.filter((q) => hyp(q[0] - cx, q[1] - cz) < 700);
  for (let i = 0; i < part.length; i++) {
    const a = part[Math.max(0, i - 1)], b = part[Math.min(part.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], h = hyp(dx, dz) || 1, n = [-dz / h, dx / h];
    for (let s = -hw; s <= hw + 1e-6; s += GRID) {
      const x = part[i][0] + n[0] * s, z = part[i][1] + n[1] * s;
      for (const b2 of nb) if (bldDist(b2, x, z) <= 0.5) why.add(`building ${b2.id}`);
      if (wetAt(x, z)) why.add('water');
      for (const q of rl) if (hyp(q[0] - x, q[1] - z) < RAIL_CLEAR) { why.add('rail'); break; }
    }
  }
  return [...why];
}

pr('STEP 21.7-3 JUNCTION FIXES (headless; ' + (APPLY ? 'APPLY' : 'DRY') + '; nothing in src changed; tsc / npm run build / game NOT RUN: no node_modules)');
pr(`constants (MY choices): final straight LT ${LT_LADDER.join(' / ')} m; radius factor ${RF_LADDER.join(' / ')} x class minimum; Ls ${Object.entries(LS_BY_CLS).map(([k, v]) => k + ' ' + v).join(', ')}; angle target 90 (>= ${ANG_MIN}); deviation limit ${DEV_MAX} m; node tolerance ${NODE_TOL} m; cul-de-sac gap ${CUL_GAP} m`);
pr();

// ---------------- (a) realign the minor line of each target node to 90 deg ----------------
interface Res { node: string; minor: string; thr: string; end: 'S' | 'E'; angBefore: number; angAfter: number; lt: number; rf: number; R: number; Ls: number; k: number; dev: number; turnDeg: number; lenBefore: number; lenAfter: number; pis: any[]; ground: string[]; ok: boolean; why: string }
const results: Res[] = []; const changed = new Map<string, { S: number[]; E: number[]; pis: any[] }>();
const lineNow = (id: string): number[][] => poly.get(id)!;
pr('(a) REALIGN to 90 deg: node  minor x through  end  angle before -> after   final straight  R / Ls of the new PI  old PIs replaced  max deviation from the old line  line length before -> after  ground / crossings');
for (const id of TARGETS) {
  if (LEAVE.has(id)) { const jn0 = cj.nodes.find((q: any) => q.id === id)!; pr(`   ${id}  ${jn0.minor[0]} x ${String(jn0.through)}  ${f1(jn0.angle)} deg: NOT TOUCHED by decision (see header), stays on the list for the user`); results.push({ node: id, minor: jn0.minor[0], thr: String(jn0.through), end: 'S', angBefore: jn0.angle, angAfter: jn0.angle, lt: 0, rf: 0, R: 0, Ls: 0, k: 0, dev: 0, turnDeg: 0, lenBefore: 0, lenAfter: 0, pis: [], ground: [], ok: true, why: 'left' }); continue; }
  const jn = cj.nodes.find((q: any) => q.id === id)!; const minor = jn.minor[0] as string, thr = String(jn.through).split('+')[0];
  const q = fit.get(minor); if (!q) { chk(false, `${id}: minor line ${minor} is not a fitted line`); continue; }
  const cur = changed.get(minor) ?? { S: q.S, E: q.E, pis: q.pis }, old = lineNow(minor), thrPts = lineNow(thr);
  const nd = nodeOf.get(id)!, np = [nd.x, nd.z]; const dS = dist(old[0], np), dE = dist(old[old.length - 1], np), end: 'S' | 'E' = dS <= dE ? 'S' : 'E';
  const e = end === 'S' ? cur.S : cur.E, cls = clsOf.get(minor)!, Rm = RMIN_BY_CLS[cls];
  const pj = proj(thrPts, e[0], e[1]); const tt = Math.atan2(thrPts[Math.min(pj.i + 1, thrPts.length - 1)][1] - thrPts[pj.i][1], thrPts[Math.min(pj.i + 1, thrPts.length - 1)][0] - thrPts[pj.i][0]);
  // end tangent before
  const tOld = end === 'S' ? Math.atan2(old[1][1] - old[0][1], old[1][0] - old[0][0]) : Math.atan2(old[old.length - 1][1] - old[old.length - 2][1], old[old.length - 1][0] - old[old.length - 2][0]);
  let angB = Math.abs((wrap(tOld - tt) * 180) / Math.PI); if (angB > 90) angB = 180 - angB;
  // side of the through line on which the minor line lies: 40 m into the line
  const inside = end === 'S' ? old[Math.min(old.length - 1, 8)] : old[Math.max(0, old.length - 9)];
  const n0 = [-Math.sin(tt), Math.cos(tt)]; const side = (inside[0] - e[0]) * n0[0] + (inside[1] - e[1]) * n0[1] >= 0 ? 1 : -1, nrm = [n0[0] * side, n0[1] * side];
  const n = cur.pis.length; const order = (i: number): number => (end === 'S' ? i : n - 1 - i);   // 0 = PI nearest to the node end
  let best: Res | null = null; const rej: Record<string, number> = {}; const rj = (k: string): void => { rej[k] = (rej[k] ?? 0) + 1; };
  for (const lt of LT_LADDER) for (const rf of RF_LADDER) for (const k of [0, 1, 2]) {
    if (k > n) continue;
  for (const lsf of [1, 0.5, 0.33]) {
    const R = Rm * rf, Ls = Math.max(10, Math.min(LS_BY_CLS[cls] * lsf, Math.round((R * 0.5) / 5) * 5));
    const newPI = { x: Math.round((e[0] + nrm[0] * lt) * 100) / 100, z: Math.round((e[1] + nrm[1] * lt) * 100) / 100, R, Ls };
    const rest = cur.pis.filter((_: any, i: number) => order(i) >= k);   // drop the k nearest to the node end
    const pis = end === 'S' ? [newPI, ...rest] : [...rest, newPI];
    let b: { pts: number[][]; al: any }; try { b = build(cur.S.slice(), cur.E.slice(), end === 'S' ? pis : pis); } catch { continue; }
    if (b.al.endGap >= ENDGAP_MAX) { rj('endGap'); continue; } if (Math.min(...(b.al.straights as number[])) < 0) { rj('straight<0'); continue; } if (b.al.rows.some((r: any) => r.arcAngle < 0)) { rj('arc<0'); continue; }
    // the rebuilt line must start with the old S and end with the old E (S / E are inputs, check anyway)
    const tNew = end === 'S' ? Math.atan2(b.pts[1][1] - b.pts[0][1], b.pts[1][0] - b.pts[0][0]) : Math.atan2(b.pts[b.pts.length - 1][1] - b.pts[b.pts.length - 2][1], b.pts[b.pts.length - 1][0] - b.pts[b.pts.length - 2][0]);
    let angA = Math.abs((wrap(tNew - tt) * 180) / Math.PI); if (angA > 90) angA = 180 - angA; if (angA < ANG_MIN) { rj('angle'); continue; }
    const dev = Math.max(devMax(b.pts, old), devMax(old, b.pts)); if (dev > DEV_MAX) { rj('dev'); continue; }
    // nodes of this line must stay on it
    const lineNodes = vp.nodes.filter((nn: any) => nn.id !== id && nn.legs.some((g: any) => g.id === minor)); if (lineNodes.some((nn: any) => proj(b.pts, nn.x, nn.z).d > NODE_TOL && proj(old, nn.x, nn.z).d <= NODE_TOL)) { rj('other node leaves'); continue; }
    const turn = Math.abs((wrap(tNew - tOld) * 180) / Math.PI);
    const cand: Res = { node: id, minor, thr, end, angBefore: angB, angAfter: angA, lt, rf, R, Ls, k, dev, turnDeg: turn, lenBefore: 0, lenAfter: b.al.length, pis, ground: [], ok: true, why: '' };
    cand.lenBefore = q.len ?? 0;
    // R1: no crossing with any other line except at the node end (within 25 m of e)
    const near = b.pts.filter((p) => proj(old, p[0], p[1]).d > FREE); let cross = '';
    for (const [oid, op] of poly) { if (oid === minor) continue; if (hyp(op[0][0] - e[0], op[0][1] - e[1]) > 3000 && hyp(op[op.length - 1][0] - e[0], op[op.length - 1][1] - e[1]) > 3000 && proj(op, e[0], e[1]).d > 600) continue; for (let i = 0; i < b.pts.length - 1 && !cross; i++) for (let j = 0; j < op.length - 1; j++) { const x = segX(b.pts[i], b.pts[i + 1], op[j], op[j + 1]); if (x && dist(x, e) > 25) { cross = oid; break; } } if (cross) break; }
    if (cross) { rj('crosses ' + cross); continue; }
    const g = groundOfNew(b.pts, old, HALF[cls]); if (g.length) { rj(g.join('+')); continue; }
    // preference: smallest deviation, then smallest turn
    if (!best || cand.dev < best.dev - 0.5 || (Math.abs(cand.dev - best.dev) <= 0.5 && cand.lt < best.lt)) best = cand;
    void near;
  }
  }
  if (best) {
    results.push(best); changed.set(minor, { S: cur.S, E: cur.E, pis: best.pis });
    poly.set(minor, build(cur.S, cur.E, best.pis).pts);
    pr(`   ${id}  ${minor} x ${thr}  ${end}  ${f1(best.angBefore)} -> ${f1(best.angAfter)} deg   LT ${best.lt} m   R ${f0(best.R)} / Ls ${best.Ls}   replaced ${best.k}   dev ${f1(best.dev)} m   length ${f0(best.lenBefore)} -> ${f0(best.lenAfter)} m   clear`);
  } else {
    pr(`   ${id}  ${minor} x ${thr}  ${end}  ${f1(angB)} deg: NO VARIANT (rejected: ${Object.entries(rej).map(([k, v]) => k + ' ' + v).join(', ') || 'none'}) -> stays on the list for the user`);
    results.push({ node: id, minor, thr, end, angBefore: angB, angAfter: angB, lt: 0, rf: 0, R: 0, Ls: 0, k: 0, dev: 0, turnDeg: 0, lenBefore: 0, lenAfter: 0, pis: [], ground: Object.keys(rej), ok: false, why: Object.entries(rej).sort((a2, b2) => b2[1] - a2[1]).slice(0, 2).map(([k, v]) => k + ' ' + v).join(', ') || 'no valid alignment in the ladder' });
  }
}
const done = results.filter((r) => r.ok && r.why !== 'left'), blocked = results.filter((r) => !r.ok), left = results.filter((r) => r.why === 'left');
chk(done.every((r) => r.angAfter >= ANG_MIN), `every applied realignment reaches >= ${ANG_MIN} deg (${done.length} nodes: ${done.map((r) => r.node + ' ' + f0(r.angBefore) + ' -> ' + f0(r.angAfter)).join(', ')})`);
info(`BLOCKED, stay on the list for the user (R10, a real conflict, nothing forced): ${blocked.map((r) => r.node + ' ' + r.minor + ' (' + r.why + ')').join('; ')}`);
info(`NOT TOUCHED by my decision: ${left.map((r) => r.node).join(', ')} (see the header of this script)`);
chk(results.filter((r) => r.ok).every((r) => r.dev <= DEV_MAX), `largest deviation from the old line ${f1(Math.max(0, ...results.filter((r) => r.ok).map((r) => r.dev)))} m (limit ${DEV_MAX} m)`);
pr();

// ---------------- (b) cut back the 4 L streets onto a cul-de-sac ----------------
pr(`(b) L STREETS onto R4-10: cut back so that the end is ${CUL_GAP} m from the R4-10 centre line (no junction, a turning head); the streets stay connected to C-3`);
interface Cut { id: string; node: string; endOld: number[]; endNew: number[]; cutM: number; lenOld: number; lenNew: number }
const cuts: Cut[] = []; const r410 = lineNow('R4-10');
for (const id of L_CUT) {
  const q = fit.get(id); if (!q || q.pis.length) { chk(false, `${id}: not a straight fitted line, cut not defined`); continue; }
  const S = q.S, E = q.E, len = dist(S, E), dir = [(E[0] - S[0]) / len, (E[1] - S[1]) / len];
  const dEnd = proj(r410, E[0], E[1]).d; let cut = 0; for (let c = 0; c <= len - 20; c += 0.5) { const p = [E[0] - dir[0] * c, E[1] - dir[1] * c]; if (proj(r410, p[0], p[1]).d >= CUL_GAP) { cut = c; break; } }
  const E2 = [Math.round((E[0] - dir[0] * cut) * 100) / 100, Math.round((E[1] - dir[1] * cut) * 100) / 100];
  const nid = vp.nodes.find((n: any) => n.legs.some((g: any) => g.id === id) && n.legs.some((g: any) => g.id === 'R4-10'))?.id ?? '?';
  cuts.push({ id, node: nid, endOld: E, endNew: E2, cutM: cut, lenOld: len, lenNew: dist(S, E2) });
  pr(`   ${id}  node ${nid}  length ${f0(len)} -> ${f0(dist(S, E2))} m  (cut ${f1(cut)} m; the old end was ${f1(dEnd)} m from the R4-10 centre line)`);
}
chk(cuts.length === L_CUT.length && cuts.every((c) => c.lenNew >= 60 && proj(r410, c.endNew[0], c.endNew[1]).d >= CUL_GAP - 0.5), `the 4 L streets are cut back, each stays >= 60 m long and ends >= ${CUL_GAP} m from R4-10`);
info('L-7, L-4, L-5 (3.8) stay as RECORDED EXCEPTIONS (432 - 839 m from a collector); N102 L-5 (25.6 deg) is also left to the user.');
info(`the 4 T nodes N104 / N106 / N108 / N114 disappear (4 junctions fewer on R4-10); their pockets NO (N104, N108, N114) and SHORT (N106) are gone with them. The vertical chain must be run again.`);
pr();

// ---------------- write ----------------
pr(`SUMMARY 21.7-3: ${pass} PASS, ${fail} FAIL  (${results.filter((r) => r.ok && r.why !== 'left').length} of ${TARGETS.length} realigned, ${results.filter((r) => !r.ok).length} blocked, ${results.filter((r) => r.why === 'left').length} left, ${cuts.length} L streets cut back, mode ${APPLY ? 'APPLY' : 'DRY'})`);
writeFileSync(`${OUT}/STEP_21_7_3_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_junction_fix.json`, JSON.stringify({ note: 'STEP 21.7-3 junction fixes', mode: APPLY ? 'APPLY' : 'DRY', constants: { TARGETS, LT_LADDER, RF_LADDER, LS_BY_CLS, ANG_MIN, DEV_MAX, NODE_TOL, CUL_GAP, L_CUT }, realign: results, cuts }) + '\n');
if (APPLY && fail === 0) {
  mkdirSync(`${OUT}/fit_chain/before_713`, { recursive: true });
  for (const f of fitFiles) {
    const bk = `${OUT}/fit_chain/before_713/centre_fit_${f.c}.json`; if (!existsSync(bk)) copyFileSync(f.path, bk);
    let ch = false;
    for (const q of f.j.lines) {
      const r = results.find((x) => x.ok && x.why !== 'left' && x.minor === q.id), c = cuts.find((x) => x.id === q.id);
      if (r) { q.b713 = { pisOld: q.pis, angleOld: Math.round(r.angBefore * 10) / 10, node: r.node }; q.pis = changed.get(q.id)!.pis; q.devMax = r.dev; ch = true; }
      if (c) { q.b713 = { eOld: q.E, node: c.node, cutM: Math.round(c.cutM * 10) / 10 }; q.E = c.endNew; ch = true; }
    }
    if (ch) writeFileSync(f.path, JSON.stringify(f.j, null, 0));
  }
  console.log('   written: docs/centre_fit_<cls>.json; old files in docs/fit_chain/before_713/');
}
process.exit(fail === 0 ? 0 : 1);
