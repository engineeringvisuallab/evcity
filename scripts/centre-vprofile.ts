// STEP 21.4c VERTICAL CURVES + NODE LEVELS (headless; changes NO src file, writes only docs/).
// Run: npx tsx scripts/centre-vprofile.ts [dir]
// Reads dir/centre_profile.json (21.4 DP level, 10 m stations, natural ground g) and dir/centre_fixed.json (built / 8-lane lines, for external nodes).
// Writes dir/STEP_21_4C_OUTPUT.txt and dir/centre_vprofile.json (PVI table, curves, node table).
// ORDER (user): (1) WATER CHECK first, (2) NODE LEVELS (every junction node gets ONE level for all its lines, bigger class keeps its level),
//               (3) PARABOLIC VERTICAL CURVES (K from SSD, curve length >= 0.6 V, grade change < 0.5 % = no curve).
// Numbers are MY choices, change them in the constants below.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { minVerticalK } from '../src/roads/standards/Checks';
import { makeRingProfile } from '../src/roads/ring/RingProfile';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { R6_LINE_DATA } from '../src/roads/r6/R6LineData';
import { RAIL_DESIGN } from '../src/rail/RailPlan';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const OUT = process.argv[2] ?? 'docs';
const DS = 10, GRID = 0.1, MAXCUT = 12, MAXFILL = 7, FREEBOARD = 1.5;
const LIMIT: Record<string, number> = { '6': 0.04, '4': 0.06, '2': 0.08, C: 0.08, L: 0.10 };
const SPEED: Record<string, number> = { '6': 80, '4': 60, '2': 40, C: 40, L: 30 };   // design speed km/h (21.3 decision)
const RANK: Record<string, number> = { '6': 5, '4': 4, '2': 3, C: 2, L: 1 };
const NODE_TOL = 12;          // m: an end this close to another line is a node
const NODE_MERGE = 15;        // m: nodes this close are one node
const NODE_OK = 0.03;         // m: allowed level difference at a node between lines
const NOCURVE_A = 0.5;        // %: grade change below this needs no curve (handoff 3.3)
const DP_TOL = 0.10;          // m: Douglas-Peucker tolerance for PVI extraction
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };

const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const waterAt = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water : NaN; };

const P = JSON.parse(readFileSync(`${OUT}/centre_profile.json`, 'utf8'));
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const clsOf = new Map<string, string>(F.lines.map((l: any) => [l.id, l.cls]));

interface Ln { id: string; cls: string; x: number[]; z: number[]; s: number[]; g: number[]; w: number[]; h0: number[]; h1: number[]; }
const lines: Ln[] = P.lines.filter((l: any) => LIMIT[clsOf.get(l.id) ?? ''] !== undefined && l.x.length >= 3).map((l: any) => {
  const keepI: number[] = [0]; for (let i = 1; i < l.x.length; i++) { const j = keepI[keepI.length - 1]; if (Math.hypot(l.x[i] - l.x[j], l.z[i] - l.z[j]) >= 2 || i === l.x.length - 1) { if (i === l.x.length - 1 && keepI.length > 1 && Math.hypot(l.x[i] - l.x[j], l.z[i] - l.z[j]) < 2) keepI.pop(); keepI.push(i); } }   // drop stations closer than 2 m (rounding in the json)
  const x = keepI.map((i) => l.x[i]), z = keepI.map((i) => l.z[i]), g = keepI.map((i) => l.g[i]), h = keepI.map((i) => l.h[i]);
  const s: number[] = [0]; for (let i = 1; i < x.length; i++) s.push(s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]));
  return { id: l.id, cls: clsOf.get(l.id)!, x, z, s, g, w: x.map((xx: number, i: number) => waterAt(xx, z[i])), h0: h, h1: h.slice() };
});
const byId = new Map(lines.map((l) => [l.id, l]));

// ============================ 0. WATER CHECK FIRST ============================
pr('STEP 21.4c VERTICAL CURVES + NODE LEVELS (headless; nothing in src or data changed; natural ground, no rail / building check)');
pr('0. WATER CHECK first (sc.water > sc.h on the 10 m stations; dry = fine; wet = deck at least water + 1.5 m, bridge / culvert in 21.8)');
let wetTot = 0, nTot = 0; const wetLines: string[] = [];
for (const l of lines) { const nw = l.w.filter((v) => !Number.isNaN(v)).length; wetTot += nw; nTot += l.w.length; if (nw) wetLines.push(`   ${l.id.padEnd(7)} ${l.cls.padEnd(2)} wet ${nw * DS} m of ${f0(l.s[l.s.length - 1])} m`); }
pr(`   ${lines.length} lines, ${nTot} stations, ${wetTot} wet (${f1(100 * wetTot / nTot)} %)`); for (const r of wetLines) pr(r);
const dpWetBad = lines.reduce((a, l) => a + l.h0.filter((h, i) => !Number.isNaN(l.w[i]) && h < l.w[i] + FREEBOARD - 0.05).length, 0);
pr(`   21.4 DP profile: ${dpWetBad} wet stations with deck lower than water + ${FREEBOARD} m (must be 0)`);

// ============================ 1. NODES ============================
interface Leg { id: string; s: number; h: number; }
interface Node { id: string; x: number; z: number; legs: Leg[]; target: number; ext: boolean; }
interface Seg { l: Ln; i: number; }
const CELL = 50; const grid = new Map<string, Seg[]>();
const key = (cx: number, cz: number): string => `${cx},${cz}`;
for (const l of lines) for (let i = 0; i + 1 < l.x.length; i++) {
  const x0 = Math.min(l.x[i], l.x[i + 1]) - NODE_TOL, x1 = Math.max(l.x[i], l.x[i + 1]) + NODE_TOL, z0 = Math.min(l.z[i], l.z[i + 1]) - NODE_TOL, z1 = Math.max(l.z[i], l.z[i + 1]) + NODE_TOL;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) { const k = key(cx, cz); (grid.get(k) ?? grid.set(k, []).get(k)!).push({ l, i }); }
}
const near = (x: number, z: number): Seg[] => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
interface Hit { x: number; z: number; a: string; sa: number; b: string; sb: number; }
const hits: Hit[] = [];
const proj = (l: Ln, i: number, x: number, z: number): { d: number; s: number } => {
  const dx = l.x[i + 1] - l.x[i], dz = l.z[i + 1] - l.z[i], sl2 = dx * dx + dz * dz; let t = sl2 > 0 ? ((x - l.x[i]) * dx + (z - l.z[i]) * dz) / sl2 : 0; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(x - (l.x[i] + t * dx), z - (l.z[i] + t * dz)), s: l.s[i] + t * (l.s[i + 1] - l.s[i]) };
};
for (const l of lines) for (const e of [0, l.x.length - 1]) {                       // line ends touching another line
  let best: { d: number; s: number; o: Ln } | null = null;
  for (const sg of near(l.x[e], l.z[e])) { if (sg.l === l) continue; const p = proj(sg.l, sg.i, l.x[e], l.z[e]); if (p.d <= NODE_TOL && (!best || p.d < best.d)) best = { ...p, o: sg.l }; }
  if (best) hits.push({ x: l.x[e], z: l.z[e], a: l.id, sa: l.s[e], b: best.o.id, sb: best.s });
}
const seen = new Set<string>();
for (const arr of grid.values()) for (let p = 0; p < arr.length; p++) for (let q = p + 1; q < arr.length; q++) {   // crossings
  const A = arr[p], B = arr[q]; if (A.l === B.l) continue; const k = `${A.l.id}|${A.i}|${B.l.id}|${B.i}`; if (seen.has(k)) continue; seen.add(k);
  const ax = A.l.x[A.i], az = A.l.z[A.i], bx = A.l.x[A.i + 1] - ax, bz = A.l.z[A.i + 1] - az, cx = B.l.x[B.i], cz = B.l.z[B.i], dx = B.l.x[B.i + 1] - cx, dz = B.l.z[B.i + 1] - cz;
  const den = bx * dz - bz * dx; if (Math.abs(den) < 1e-9) continue; const t = ((cx - ax) * dz - (cz - az) * dx) / den, u = ((cx - ax) * bz - (cz - az) * bx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) continue;
  hits.push({ x: ax + t * bx, z: az + t * bz, a: A.l.id, sa: A.l.s[A.i] + t * (A.l.s[A.i + 1] - A.l.s[A.i]), b: B.l.id, sb: B.l.s[B.i] + u * (B.l.s[B.i + 1] - B.l.s[B.i]) });
}
const par = hits.map((_, i) => i); const fnd = (i: number): number => (par[i] === i ? i : (par[i] = fnd(par[i])));
for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) if (Math.hypot(hits[i].x - hits[j].x, hits[i].z - hits[j].z) <= NODE_MERGE) par[fnd(j)] = fnd(i);
const clusters = new Map<number, Hit[]>(); hits.forEach((h, i) => (clusters.get(fnd(i)) ?? clusters.set(fnd(i), []).get(fnd(i))!).push(h));
const hAt = (l: Ln, s: number, arr: number[]): number => { let i = 0; while (i + 2 < l.s.length && l.s[i + 1] < s) i++; const t = (s - l.s[i]) / Math.max(1e-9, l.s[i + 1] - l.s[i]); return arr[i] + Math.max(0, Math.min(1, t)) * (arr[i + 1] - arr[i]); };
const nodes: Node[] = []; let nid = 0;
for (const hs of clusters.values()) {
  const cx = hs.reduce((a, h) => a + h.x, 0) / hs.length, cz = hs.reduce((a, h) => a + h.z, 0) / hs.length; const legs = new Map<string, number>();
  for (const h of hs) for (const [id, s] of [[h.a, h.sa], [h.b, h.sb]] as [string, number][]) if (!legs.has(id)) legs.set(id, s);
  if (legs.size < 2) continue;
  nodes.push({ id: `N${String(++nid).padStart(3, '0')}`, x: cx, z: cz, legs: [...legs].map(([id, s]) => ({ id, s, h: hAt(byId.get(id)!, s, byId.get(id)!.h0) })), target: NaN, ext: false });
}
// nodes where a profiled line ends on a built / 8-lane road: level of that road is NOT in this step (listed only)
const extList: string[] = [];
for (const ln of F.lines) { if (!(ln.cls === '8' || ln.built)) continue; for (const l of lines) for (const e of [0, l.x.length - 1]) {
  for (let i = 0; i + 1 < ln.pts.length; i++) { const dx = ln.pts[i + 1][0] - ln.pts[i][0], dz = ln.pts[i + 1][1] - ln.pts[i][1], sl2 = dx * dx + dz * dz; if (sl2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((l.x[e] - ln.pts[i][0]) * dx + (l.z[e] - ln.pts[i][1]) * dz) / sl2)); if (Math.hypot(l.x[e] - (ln.pts[i][0] + t * dx), l.z[e] - (ln.pts[i][1] + t * dz)) <= NODE_TOL) { extList.push(`${l.id} ${e ? 'end' : 'start'} on ${ln.id} at (${f0(l.x[e])}, ${f0(l.z[e])}), own level ${f1(l.h0[e])} m`); break; } } } }

// ---- 21.4c-r2 LEVEL OF THE BUILT / 8-LANE ROADS at the line ends: M8 ring (RingProfile along the centre_fixed M8 polyline), J1 arms (J1ArmData ys), built R6 (R6LineData ys).
// A line end within NODE_TOL of such a road is PINNED to the road level there (hard pin). Check: the 4 J1 arm ends vs the ring profile agree within 0.01 m.
const ringPts = (F.lines.find((q: any) => q.id === 'M8')?.pts ?? []) as number[][];
const ringS: number[] = [0]; for (let i = 1; i < ringPts.length; i++) ringS.push(ringS[i - 1] + Math.hypot(ringPts[i][0] - ringPts[i - 1][0], ringPts[i][1] - ringPts[i - 1][1]));
const ringLen = ringPts.length ? ringS[ringS.length - 1] + Math.hypot(ringPts[0][0] - ringPts[ringPts.length - 1][0], ringPts[0][1] - ringPts[ringPts.length - 1][1]) : 1;
const ringProf = makeRingProfile(ringLen);
function projPoly(pts: number[][], x: number, z: number): { d: number; i: number; t: number } {
  let b = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i + 1 < pts.length; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], sl2 = dx * dx + dz * dz; let tt = sl2 > 0 ? ((x - pts[i][0]) * dx + (z - pts[i][1]) * dz) / sl2 : 0; tt = Math.max(0, Math.min(1, tt));
    const d = Math.hypot(x - (pts[i][0] + tt * dx), z - (pts[i][1] + tt * dz)); if (d < b.d) b = { d, i, t: tt }; }
  return b;
}
function builtLevel(id: string, x: number, z: number): { d: number; y: number } | null {
  if (id === 'M8') { if (ringPts.length < 2) return null; const q = projPoly(ringPts, x, z); const s = ringS[q.i] + q.t * (ringS[q.i + 1] - ringS[q.i]); const yy = ringProf.yAt(s); gen.sample(x, z, sc); return { d: q.d, y: yy - sc.h > MAXFILL || sc.h - yy > MAXCUT ? NaN : yy }; }
  const src = id === 'M6-1' ? ISLAND_LINK_DATA : (J1_ARM_DATA.find((a) => a.name === id) ?? R6_LINE_DATA.find((a) => a.name === id)); if (!src) return null;
  const q = projPoly(src.pts, x, z); const sP = (src as any).s ? (src as any).s[q.i] + q.t * ((src as any).s[q.i + 1] - (src as any).s[q.i]) : NaN;
  const onStruct = !!(src as any).structs?.some((r: number[]) => sP >= r[0] - 1 && sP <= r[1] + 1);   // the road is on a bridge / viaduct there: a side road cannot meet the deck level (ramp / interchange = 21.7)
  const yy = src.ys[q.i] + q.t * (src.ys[q.i + 1] - src.ys[q.i]); gen.sample(x, z, sc); const high = yy - sc.h > MAXFILL || sc.h - yy > MAXCUT;   // deck far above / below the ground: a viaduct / tunnel, no side junction at that level
  return { d: q.d, y: onStruct || high ? NaN : yy };
}
interface ExtPin { y: number; on: string; d: number; }
const extPin = new Map<string, ExtPin>(); const extOpen = new Set<string>(); const extNoSrc: string[] = [];
for (const ln of F.lines) { if (!(ln.cls === '8' || ln.built)) continue; for (const l of lines) for (const e of [0, 1]) {
  const x = l.x[e ? l.x.length - 1 : 0], z = l.z[e ? l.z.length - 1 : 0]; const r = builtLevel(ln.id, x, z); const k = `${l.id}|${e}`;
  const pr0 = projPoly(ln.pts, x, z); if (pr0.d > NODE_TOL) continue;
  if (!r || r.d > NODE_TOL || Number.isNaN(r.y)) { if (!extPin.has(k) && !extNoSrc.includes(k)) extNoSrc.push(k); continue; }
  const old = extPin.get(k); if (!old || r.d < old.d) { extPin.set(k, { y: r.y, on: ln.id, d: r.d }); const ix = extNoSrc.indexOf(k); if (ix >= 0) extNoSrc.splice(ix, 1); } } }
{ const chk = J1_ARM_DATA.map((a) => { const e = a.pts[a.pts.length - 1]; const r = builtLevel('M8', e[0], e[1]); return r ? Math.abs(r.y - a.ys[a.ys.length - 1]) : NaN; }); pr(`   built-road level check: J1 arm ends vs ring profile, max difference ${f2(Math.max(...chk))} m (ring length ${f0(ringLen)} m)`); }
const endS = (l: Ln, e: number): number => (e ? l.s[l.s.length - 1] : 0);
const EXT_MAXDIFF = Number(process.env.EXT_MAXDIFF ?? 15);        // m: a built-road level more than this away from the line's own 21.4 level cannot be pinned (island / structure end): kept free, listed, ramp = 21.7
const extFar: string[] = []; const extFarKeys = new Set<string>();
for (const [k, q] of extPin) { const [id, e] = k.split('|'); const l = byId.get(id)!; const own = l.h0[Number(e) ? l.h0.length - 1 : 0]; if (Math.abs(q.y - own) > EXT_MAXDIFF) { extFarKeys.add(k); extOpen.add(k); extFar.push(`${id} ${Number(e) ? 'end' : 'start'} on ${q.on}: road level ${f2(q.y)} m, own level ${f2(own)} m (${f1(Math.abs(q.y - own))} m apart)`); } }
// ---- 21.4c-r8 ENDS ON A DECK (item 4, R4-9 start / R4-13 end): a side road cannot join a bridge / viaduct deck, so the JUNCTION MOVES along the main road to the nearest point where it runs on the ground (|level - ground| <= 4 m).
// Move up to MOVE_PIN m: the end is pinned to the road level there (the line is extended by the move, the solver checks the grade). A longer move is only reported with the grade of the extension (21.3 change).
const MOVE_PIN = 60; const moveRows: any[] = [];
const roadSrc = (id: string): { pts: number[][]; lev: (x: number, z: number) => { y: number; gr: number; onStruct: boolean; d: number } } | null => {
  const pts = id === 'M8' ? ringPts : ((id === 'M6-1' ? ISLAND_LINK_DATA : (J1_ARM_DATA.find((a) => a.name === id) ?? R6_LINE_DATA.find((a) => a.name === id))) as any)?.pts as number[][] | undefined; if (!pts) return null;
  const src: any = id === 'M8' ? null : (id === 'M6-1' ? ISLAND_LINK_DATA : (J1_ARM_DATA.find((a) => a.name === id) ?? R6_LINE_DATA.find((a) => a.name === id)));
  return { pts, lev: (x, z) => { gen.sampleGround(x, z, sc); const gr = sc.h; const q = projPoly(pts, x, z);
    if (!src) { const sp = ringS[q.i] + q.t * (ringS[q.i + 1] - ringS[q.i]); return { y: ringProf.yAt(sp), gr, onStruct: false, d: q.d }; }
    const sP = src.s ? src.s[q.i] + q.t * (src.s[q.i + 1] - src.s[q.i]) : NaN; return { y: src.ys[q.i] + q.t * (src.ys[q.i + 1] - src.ys[q.i]), gr, onStruct: !!src.structs?.some((r: number[]) => sP >= r[0] - 1 && sP <= r[1] + 1), d: q.d }; } };
};
for (const k of [...extNoSrc]) { const [id, e] = k.split('|'); const l = byId.get(id)!; const ei = Number(e); const x = l.x[ei ? l.x.length - 1 : 0], z = l.z[ei ? l.z.length - 1 : 0];
  let onId: string | null = null; for (const ln of F.lines) { if (!(ln.cls === '8' || ln.built)) continue; if (projPoly(ln.pts, x, z).d <= NODE_TOL) { onId = ln.id; break; } } const rs = onId ? roadSrc(onId) : null; if (!onId || !rs) continue;
  const q0 = projPoly(rs.pts, x, z); const sA: number[] = [0]; for (let i = 1; i < rs.pts.length; i++) sA.push(sA[i - 1] + Math.hypot(rs.pts[i][0] - rs.pts[i - 1][0], rs.pts[i][1] - rs.pts[i - 1][1])); const s0 = sA[q0.i] + q0.t * (sA[q0.i + 1] - sA[q0.i]);
  let best: { d: number; x: number; z: number; y: number; gr: number } | null = null;
  for (let i = 0; i + 1 < rs.pts.length; i++) { const L2 = Math.hypot(rs.pts[i + 1][0] - rs.pts[i][0], rs.pts[i + 1][1] - rs.pts[i][1]); for (let t = 0; t < 1; t += Math.max(0.01, 10 / Math.max(L2, 1))) { const ds = Math.abs(sA[i] + t * L2 - s0); if (ds > 400) continue;
    const px = rs.pts[i][0] + t * (rs.pts[i + 1][0] - rs.pts[i][0]), pz = rs.pts[i][1] + t * (rs.pts[i + 1][1] - rs.pts[i][1]); const r = rs.lev(px, pz); if (r.onStruct || Math.abs(r.y - r.gr) > 4) continue; if (!best || ds < best.d) best = { d: ds, x: px, z: pz, y: r.y, gr: r.gr }; } }
  if (!best) { moveRows.push({ end: k, line: id, on: onId, moved: false, why: 'no point within 400 m where the road runs on the ground' }); continue; }
  const dist = Math.hypot(best.x - x, best.z - z); const own = l.h0[ei ? l.h0.length - 1 : 0]; const extG = Math.abs(best.y - own) / Math.max(dist, 1);
  const row: any = { end: k, line: id, on: onId, moved: true, moveAlongRoad: Math.round(best.d), moveStraight: Math.round(dist), to: [Math.round(best.x), Math.round(best.z)], roadLevel: Math.round(best.y * 100) / 100, ground: Math.round(best.gr * 100) / 100, ownLevel: Math.round(own * 100) / 100, extensionGrade: Math.round(extG * 1000) / 10, pinned: dist <= MOVE_PIN };
  if (dist <= MOVE_PIN) { extPin.set(k, { y: best.y, on: onId, d: 0 }); extNoSrc.splice(extNoSrc.indexOf(k), 1); } moveRows.push(row); }
for (const nd of nodes) { const ys: number[] = [];
  for (const g of nd.legs) { const l = byId.get(g.id)!; for (const e of [0, 1]) { const q = extPin.get(`${l.id}|${e}`); if (q && Math.abs(g.s - endS(l, e)) <= NODE_TOL + 1) ys.push(q.y); } }
  if (ys.length) { nd.ext = true; nd.target = ys.reduce((a, b) => a + b, 0) / ys.length; } }

if (process.env.NONODES) nodes.length = 0;   // experiment: curves only, no node levels (NONODES=1)
pr(''); pr(`1. NODES between the profiled lines: ${nodes.length} nodes (ends within ${NODE_TOL} m of another line, crossings, merged within ${NODE_MERGE} m); lines on an 8-lane / built road (level of that road NOT matched here): ${extList.length}`);

// ============================ 2 + 3. NODE LEVELS AND VERTICAL CURVES, line by line in class order ============================
// NODE LEVEL = a compromise level found by relaxation: every line is solved with soft pins at its nodes, the node level becomes the class-weighted mean
// of its legs (weight rank^2: R6 25, R4 16, R2 9, C 4, L 1, so the bigger road moves less), repeated ROUNDS times. Then ONE final solve with HARD pins
// (every line gets exactly the node level), then PVIs + parabolas, then the exact node level is set on the curve. (First version: 'first line sets the level' gave 40-50 m
// cuts on a few short steep lines, e.g. R6-12 and R4-9, because the level set by the other line was far under the hill.)
const DP_MARGIN = 0.92;       // the level DP uses 92 % of the class grade limit, so that the PVI tangents (fitted within a tolerance) stay under the limit
interface Pvi { s: number; y: number; forced?: boolean; kink?: boolean; }
interface Curve { s: number; y: number; A: number; Lc: number; K: number; kind: 'crest' | 'sag' | 'none'; }
function design(cls: string, g: number[], w: number[], pins: Map<number, number>, GRID = 0.1, pinW = 20000, margin = DP_MARGIN): number[] {
  const n = g.length, lim = LIMIT[cls] * margin, win = Math.max(1, Math.floor(lim * DS / GRID + 1e-9));
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, g[i]); hi = Math.max(hi, g[i], Number.isNaN(w[i]) ? -1e9 : w[i] + FREEBOARD + 2); }
  for (const v of pins.values()) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  lo -= MAXCUT + 2; hi += MAXFILL + 2; const base = Math.floor(lo / GRID) * GRID, nl = Math.ceil((hi - base) / GRID) + 1; const lev = (k: number): number => base + k * GRID;
  const cost = (i: number, k: number): number => {
    const h = lev(k), d = h - g[i]; let c = 0;
    if (d < 0) c += -d * 1.0 + (-d > MAXCUT ? 50 * (-d - MAXCUT) : 0); else c += d * 0.8 + (d > MAXFILL ? 20 * (d - MAXFILL) : 0);
    if (!Number.isNaN(w[i]) && h < w[i] + FREEBOARD) c += 200 + 50 * (w[i] + FREEBOARD - h);
    const p = pins.get(i); if (p !== undefined) c += pinW * Math.abs(h - p);                                   // node level: (nearly) hard
    return c;
  };
  const best = new Float64Array(nl), nxt = new Float64Array(nl), from: Int32Array[] = [];
  for (let k = 0; k < nl; k++) best[k] = cost(0, k);
  for (let i = 1; i < n; i++) {
    const fr = new Int32Array(nl);
    for (let k = 0; k < nl; k++) { let b = Infinity, bj = k; const a = Math.max(0, k - win), z = Math.min(nl - 1, k + win);
      for (let j = a; j <= z; j++) { const v = best[j] + 0.15 * Math.abs(j - k) * GRID; if (v < b) { b = v; bj = j; } } nxt[k] = b + cost(i, k); fr[k] = bj; }
    from.push(fr); best.set(nxt);
  }
  let kk = 0; for (let k = 1; k < nl; k++) if (best[k] < best[kk]) kk = k;
  const out = new Array<number>(n); for (let i = n - 1; i >= 0; i--) { out[i] = lev(kk); if (i > 0) kk = from[i - 1][kk]; }
  return out;
}
function dp(pts: Pvi[], i0: number, i1: number, keep: boolean[], tol: number): void {
  if (i1 <= i0 + 1) return; let md = -1, mi = -1;
  for (let i = i0 + 1; i < i1; i++) { const t = (pts[i].s - pts[i0].s) / (pts[i1].s - pts[i0].s), yl = pts[i0].y + t * (pts[i1].y - pts[i0].y), d = Math.abs(pts[i].y - yl); if (d > md) { md = d; mi = i; } }
  if (md > tol) { keep[mi] = true; dp(pts, i0, mi, keep, tol); dp(pts, mi, i1, keep, tol); }
}
function curvesOf(cls: string, pv: Pvi[]): Curve[] {
  const V = SPEED[cls], k = minVerticalK(V); const out: Curve[] = [];
  for (let i = 1; i + 1 < pv.length; i++) {
    const g1 = (pv[i].y - pv[i - 1].y) / (pv[i].s - pv[i - 1].s), g2 = (pv[i + 1].y - pv[i].y) / (pv[i + 1].s - pv[i].s), A = (g2 - g1) * 100;
    if (Math.abs(A) < NOCURVE_A || pv[i].kink) { out.push({ s: pv[i].s, y: pv[i].y, A, Lc: 0, K: 0, kind: 'none' }); continue; }
    const K = A > 0 ? k.sag : k.crest; out.push({ s: pv[i].s, y: pv[i].y, A, Lc: Math.max(K * Math.abs(A), 0.6 * V), K, kind: A > 0 ? 'sag' : 'crest' });
  }
  return out;
}
function overlap(pv: Pvi[], cv: Curve[]): number {          // index (in pv) of the PVI to drop (or to make a kink if it is forced), or -1
  const T = (i: number): number => (i <= 0 || i >= pv.length - 1 ? 0 : cv[i - 1].Lc / 2);
  for (let i = 0; i + 1 < pv.length; i++) if (T(i) + T(i + 1) > pv[i + 1].s - pv[i].s + 1e-6) {
    const cand = [i, i + 1].filter((j) => j > 0 && j < pv.length - 1 && cv[j - 1].Lc > 0).sort((a, b) => (pv[a].forced ? 1 : 0) - (pv[b].forced ? 1 : 0) || Math.abs(cv[a - 1].A) - Math.abs(cv[b - 1].A));
    if (cand.length) return cand[0];
  }
  return -1;
}
function yAt(pv: Pvi[], cv: Curve[], s: number): number {
  for (let i = 1; i + 1 < pv.length; i++) { const c = cv[i - 1]; if (c.Lc > 0 && s >= pv[i].s - c.Lc / 2 && s <= pv[i].s + c.Lc / 2) {
    const g1 = (pv[i].y - pv[i - 1].y) / (pv[i].s - pv[i - 1].s), s0 = pv[i].s - c.Lc / 2, y0 = pv[i].y - g1 * c.Lc / 2; return y0 + g1 * (s - s0) + (c.A / 100) * (s - s0) ** 2 / (2 * c.Lc); } }
  let j = 0; while (j + 2 < pv.length && pv[j + 1].s < s) j++; const t = (s - pv[j].s) / (pv[j + 1].s - pv[j].s); return pv[j].y + t * (pv[j + 1].y - pv[j].y);
}
function maxGrade(pv: Pvi[]): number { let m = 0; for (let i = 0; i + 1 < pv.length; i++) m = Math.max(m, Math.abs((pv[i + 1].y - pv[i].y) / (pv[i + 1].s - pv[i].s))); return m; }

function curvesFixed(pv: Pvi[], Ls: number[]): Curve[] {       // same curve lengths, A recomputed from the PVI levels (linear in the levels)
  const out: Curve[] = [];
  for (let i = 1; i + 1 < pv.length; i++) { const g1 = (pv[i].y - pv[i - 1].y) / (pv[i].s - pv[i - 1].s), g2 = (pv[i + 1].y - pv[i].y) / (pv[i + 1].s - pv[i].s), A = (g2 - g1) * 100; out.push({ s: pv[i].s, y: pv[i].y, A, Lc: Ls[i - 1], K: 0, kind: A > 0 ? 'sag' : 'crest' }); }
  return out;
}
/** Exact node levels: minimum-norm change of the PVI levels so that the curve level at every pinned node equals the node level (curve lengths held, so it is a linear problem; 4 passes). */
function fitPins(cls: string, pv: Pvi[], pins: { s: number; t: number }[]): { worst: number; Ls: number[] } {
  let worst = 0; let LsLast = curvesOf(cls, pv).map((c) => c.Lc);
  for (let pass = 0; pass < 4 && pins.length; pass++) {
    const Ls = curvesOf(cls, pv).map((c) => c.Lc); LsLast = Ls; const val = (): number[] => { const cv = curvesFixed(pv, Ls); return pins.map((p) => yAt(pv, cv, p.s)); };
    const y0 = val(); const r = pins.map((p, k) => p.t - y0[k]); worst = Math.max(...r.map(Math.abs)); if (worst < 0.004) break;
    const m = pins.length, nP = pv.length; const C: number[][] = pins.map(() => new Array(nP).fill(0));
    for (let j = 0; j < nP; j++) { pv[j].y += 0.01; const y1 = val(); pv[j].y -= 0.01; for (let k = 0; k < m; k++) C[k][j] = (y1[k] - y0[k]) / 0.01; }
    const M: number[][] = []; for (let a = 0; a < m; a++) { M.push([]); for (let b = 0; b < m; b++) { let v = 0; for (let j = 0; j < nP; j++) v += C[a][j] * C[b][j]; M[a].push(v + (a === b ? 1e-6 : 0)); } }
    const lam = r.slice(); const A2 = M.map((row, i) => [...row, lam[i]]);               // Gauss elimination with pivoting
    for (let c = 0; c < m; c++) { let pvt = c; for (let i = c + 1; i < m; i++) if (Math.abs(A2[i][c]) > Math.abs(A2[pvt][c])) pvt = i; [A2[c], A2[pvt]] = [A2[pvt], A2[c]]; const d = A2[c][c] || 1e-9;
      for (let i = c + 1; i < m; i++) { const f = A2[i][c] / d; for (let k = c; k <= m; k++) A2[i][k] -= f * A2[c][k]; } }
    const x = new Array(m).fill(0); for (let i = m - 1; i >= 0; i--) { let v = A2[i][m]; for (let k = i + 1; k < m; k++) v -= A2[i][k] * x[k]; x[i] = v / (A2[i][i] || 1e-9); }
    for (let j = 0; j < nP; j++) { let d = 0; for (let k = 0; k < m; k++) d += C[k][j] * x[k]; if (Number.isFinite(d)) pv[j].y += Math.max(-6, Math.min(6, d)); }
  }
  const cv = curvesFixed(pv, LsLast); worst = pins.length ? Math.max(...pins.map((p) => Math.abs(yAt(pv, cv, p.s) - p.t))) : 0; return { worst, Ls: LsLast };
}
interface Res { id: string; cls: string; pv: Pvi[]; cv: Curve[]; tol: number; margin?: number; dropped: number; kinks: number; devDP: number; maxG: number; maxCut: number; maxFill: number; via: number; bridge: number; tunnel: number; wetBad: number; pinned: number; pinRes: number; }
const nodesOn = new Map<string, Node[]>(); for (const n of nodes) for (const g of n.legs) (nodesOn.get(g.id) ?? nodesOn.set(g.id, []).get(g.id)!).push(n);
const order = [...lines].sort((a, b) => RANK[b.cls] - RANK[a.cls] || b.s[b.s.length - 1] - a.s[a.s.length - 1]);
const MARGINS = [0.92, 0.85, 0.78, 0.7];   // share of the grade limit used by the level DP; lowered for a line whose fitted tangents still exceed the limit
const TOLS = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5];
const ROUNDS = 6, RGRID = 0.25, SOFT = 30;
const stationOf = (l: Ln, s: number): number => { let bi = 0; for (let i = 1; i < l.s.length; i++) if (Math.abs(l.s[i] - s) < Math.abs(l.s[bi] - s)) bi = i; return bi; };
const pinsOf = (l: Ln): Map<number, number> => { const m = new Map<number, number>(); for (const n of nodesOn.get(l.id) ?? []) if (!openLegDecl.has(`${n.id}|${l.id}`)) m.set(stationOf(l, n.legs.find((g) => g.id === l.id)!.s), n.target);
  for (const e of [0, 1]) { const q = extPin.get(`${l.id}|${e}`); if (q && !extOpen.has(`${l.id}|${e}`)) m.set(e ? l.s.length - 1 : 0, q.y); } return m; };
const wOf = (l: Ln): number => RANK[l.cls] ** 2;
const openLegDecl: Set<string> = new Set();
const relax: number[] = [];
{ const cur = new Map<string, number[]>(lines.map((l) => [l.id, l.h0.slice()]));            // round 0: the free 21.4 levels
  for (let round = 0; round <= ROUNDS; round++) {
    let moved = 0;
    for (const n of nodes) { let sw = 0, sh = 0; for (const g of n.legs) { const l = byId.get(g.id)!; sw += wOf(l); sh += wOf(l) * hAt(l, g.s, cur.get(g.id)!); } const t = n.ext ? n.target : sh / sw; moved = Math.max(moved, Math.abs(t - (Number.isNaN(n.target) ? t : n.target))); n.target = t; }
    relax.push(moved); if (round === ROUNDS) break;
    for (const l of lines) if (nodesOn.has(l.id)) cur.set(l.id, design(l.cls, l.g, l.w, pinsOf(l), RGRID, SOFT));
  }
}

// ---- 21.4c-r NODE LEVEL SEARCH: after the relaxation, every node level is moved (+-1 m steps, up to +-12 m) to the level with the lowest TOTAL cut / fill / wet cost of all its legs (level DP with the node pinned); 3 passes ----
const lineCostOf = (l: Ln, h: number[]): number => { let c = 0; for (let i = 0; i < h.length; i++) { const d = h[i] - l.g[i];
  if (!Number.isNaN(l.w[i])) { if (h[i] < l.w[i] + FREEBOARD) c += 200 + 50 * (l.w[i] + FREEBOARD - h[i]); } else if (d < 0) c += -d + (-d > MAXCUT ? 50 * (-d - MAXCUT) : 0); else c += 0.8 * d + (d > MAXFILL ? 20 * (d - MAXFILL) : 0); } return c; };
const NS_MAX = Number(process.env.NS_MAX ?? 4); const nodeSearchLog: string[] = [];
if (process.env.NODESEARCH) for (let pass = 1; pass <= 3; pass++) { let moved = 0, big = 0;
  for (const nd of nodes) { if (nd.ext) continue; const base = nd.target; let bestT = base, bestC = Infinity;
    for (let k = -NS_MAX; k <= NS_MAX; k++) { nd.target = base + k; let c = 0; for (const g of nd.legs) { const l = byId.get(g.id)!; c += lineCostOf(l, design(l.cls, l.g, l.w, pinsOf(l), 0.5, 20000)); } c += 0.02 * Math.abs(k); if (c < bestC - 1e-9) { bestC = c; bestT = nd.target; } }
    nd.target = bestT; if (Math.abs(bestT - base) > 0.01) { moved++; big = Math.max(big, Math.abs(bestT - base)); } }
  nodeSearchLog.push(`   node search pass ${pass}: ${moved} nodes moved, biggest move ${f2(big)} m`); if (!moved) break; }
for (const r of nodeSearchLog) pr(r);
pr(`   relaxation of the node levels: ${ROUNDS} rounds, biggest node level change per round ${relax.map(f2).join(' / ')} m`);
const openLeg = openLegDecl;          // `${node}|${line}`: this line cannot take the node level (grade limit between two pinned nodes): kept OPEN and listed
for (const l of lines) {
  const ns = (nodesOn.get(l.id) ?? []).map((n) => ({ n, s: n.legs.find((g) => g.id === l.id)!.s })).sort((a, b) => a.s - b.s); const lim = LIMIT[l.cls] * 0.97;
  for (let guard = 0; guard < 50; guard++) {
    const act = ns.filter((q) => !openLeg.has(`${q.n.id}|${l.id}`)); let bad = -1;
    for (let i = 0; i + 1 < act.length; i++) if (Math.abs(act[i + 1].n.target - act[i].n.target) > lim * Math.max(1, act[i + 1].s - act[i].s)) { bad = i; break; }
    if (bad < 0) break; const a = act[bad], b = act[bad + 1];
    const da = Math.abs(a.n.target - hAt(l, a.s, l.h0)), db = Math.abs(b.n.target - hAt(l, b.s, l.h0)); openLeg.add(`${(da >= db ? a : b).n.id}|${l.id}`);
  }
}
// ---- 21.4c-r3 RAIL CROSSINGS: every crossing of a profiled line with a rail edge (rail design = top of ballast, e.design). X5: never at grade. The railway height is taken as given;
// the road must pass OVER the rail (road >= rail + RAIL_D, rail in a cut & cover box under it) or UNDER it (road <= rail - RAIL_D, rail on a viaduct), RAIL_D = RAIL_DESIGN.overRoadRise (7.4 m), inside +-RAIL_Z m of the crossing.
// The side is chosen per crossing from the road level of the DP fit (the side it is already on); if that cannot be met inside the grade limit the other side is tried.
const RAIL_D = RAIL_DESIGN.overRoadRise, RAIL_Z = 40;
interface RailX { line: string; s: number; x: number; z: number; edge: string; y: number; side: number; shift: number; }   // shift = change of the rail level at this crossing (21.4c-r5: - = rail lowered under the road, + = rail raised over it)
const railX = new Map<string, RailX[]>();
for (const l of lines) for (let i = 0; i + 1 < l.x.length; i++) for (const e of (gen.rail?.edges ?? []) as any[]) for (let k = 0; k + 1 < e.xs.length; k++) {
  const ax = l.x[i], az = l.z[i], bx = l.x[i + 1], bz = l.z[i + 1], cx = e.xs[k], cz = e.zs[k], dx = e.xs[k + 1], dz = e.zs[k + 1];
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) continue;
  const tt = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, uu = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den; if (tt < 0 || tt > 1 || uu < 0 || uu > 1) continue;
  const s = l.s[i] + tt * (l.s[i + 1] - l.s[i]); const arr = railX.get(l.id) ?? railX.set(l.id, []).get(l.id)!; if (arr.some((q) => Math.abs(q.s - s) < 30 && q.edge === String(e.id))) continue;
  arr.push({ line: l.id, s, x: ax + tt * (bx - ax), z: az + tt * (bz - az), edge: String(e.id), y: e.design[k] + (e.design[k + 1] - e.design[k]) * uu, side: 0, shift: 0 }); }
pr(`   rail crossings of the profiled lines: ${[...railX.values()].reduce((a, v) => a + v.length, 0)} on ${railX.size} lines (clearance ${RAIL_D} m inside +-${RAIL_Z} m, rail design level as given)`);
const railPenalty = (l: Ln, yOf: (i: number) => number): number => { const rx = railX.get(l.id); if (!rx) return 0; let c = 0;
  for (const q of rx) { if (!q.side) continue; for (let i = 0; i < l.s.length; i++) { if (Math.abs(l.s[i] - q.s) > RAIL_Z) continue; const need = q.side > 0 ? yOf(i) - (q.y + q.shift + RAIL_D) : (q.y + q.shift - RAIL_D) - yOf(i); if (need < 0) c += 3000 * -need + 300; } } return c; };

// ---- 21.4c-r PVI OPTIMISER: the PVIs (level + station) are moved to minimise the TRUE cost on the final curves (cut / fill / tunnel / viaduct / wet freeboard / drainage),
// not to follow the level DP. Hard: class grade limit, node levels (penalty 2e4 per m, then fitPins makes them exact), curve overlap. Accepted only if the cost is lower than the DP fit.
const MING = 0.003, MINLEN = 60;
function pvCost(l: Ln, pv: Pvi[], pinList: { s: number; t: number }[], detail?: { c: number }): number {
  const lim = LIMIT[l.cls]; const Ls = curvesOf(l.cls, pv).map((c) => c.Lc); const cv = curvesFixed(pv, Ls); let c = 0;
  for (let i = 0; i < l.s.length; i++) { const y = yAt(pv, cv, l.s[i]), d = y - l.g[i];
    if (!Number.isNaN(l.w[i])) { if (y < l.w[i] + FREEBOARD) c += 800 + 5000 * (l.w[i] + FREEBOARD - y); }       // water freeboard before rail clearance (a rail viaduct can be raised, a road bridge over water cannot be lowered)
    else if (d < 0) c += -d + (-d > MAXCUT ? 50 * (-d - MAXCUT) : 0); else c += 0.8 * d + (d > MAXFILL ? 20 * (d - MAXFILL) : 0); }
  for (let a = 0; a + 1 < pv.length; a++) { const Lg = pv[a + 1].s - pv[a].s, g = Math.abs((pv[a + 1].y - pv[a].y) / Lg);
    if (g > lim) c += 2e6 * (g - lim) + 5000; if (g < MING && Lg >= MINLEN) c += 600 + 1e5 * (MING - g); if (Lg < 15) c += 1e3; }
  for (const q of pinList) c += 2e4 * Math.abs(yAt(pv, cv, q.s) - q.t);
  const T = (i: number): number => (i <= 0 || i >= pv.length - 1 ? 0 : cv[i - 1].Lc / 2);
  for (let i = 0; i + 1 < pv.length; i++) { const ex = T(i) + T(i + 1) - (pv[i + 1].s - pv[i].s); if (ex > 0) c += 500 + 100 * ex; }
  c += railPenalty(l, (i) => yAt(pv, cv, l.s[i])); if (!process.env.NOJX) c += jxPenalty(l, pv, cv);
  return c;
}
function optimisePvi(l: Ln, pv: Pvi[], pinList: { s: number; t: number }[]): void {
  let cur = pvCost(l, pv, pinList);
  const locked = (j: number): boolean => j === 0 || j === pv.length - 1 || !!pv[j].forced || pinList.some((q) => Math.abs(q.s - pv[j].s) < 1);
  for (const [step, sstep] of [[4, 40], [2, 20], [1, 10], [0.5, 5], [0.25, 0], [0.1, 0]]) for (let pass = 0; pass < 25; pass++) { let imp = false;
    for (let j = 0; j < pv.length; j++) {
      for (const dir of [1, -1]) { const y0 = pv[j].y; pv[j].y = y0 + dir * step; const c = pvCost(l, pv, pinList); if (c < cur - 1e-9) { cur = c; imp = true; } else pv[j].y = y0; }
      if (sstep && !locked(j)) for (const dir of [1, -1]) { const s0 = pv[j].s, ns = s0 + dir * sstep; if (ns - pv[j - 1].s < 20 || pv[j + 1].s - ns < 20) continue; pv[j].s = ns; const c = pvCost(l, pv, pinList); if (c < cur - 1e-9) { cur = c; imp = true; } else pv[j].s = s0; }
    }
    if (!imp) break; }
}

function seedRail(l: Ln, pv: Pvi[]): void {            // one PVI at each rail crossing at the required level (+0.8 m for the curve), the free PVIs inside the zone removed, so the search starts on the right side
  for (const q of railX.get(l.id) ?? []) { if (!q.side) continue; const req = q.side > 0 ? q.y + q.shift + RAIL_D + 0.8 : q.y + q.shift - RAIL_D - 0.8;
    for (let k = pv.length - 2; k >= 1; k--) if (Math.abs(pv[k].s - q.s) <= RAIL_Z + 20 && !pv[k].forced) pv.splice(k, 1);
    let j = 0; while (j + 1 < pv.length && pv[j + 1].s < q.s) j++; if (j + 1 < pv.length && q.s - pv[j].s >= 20 && pv[j + 1].s - q.s >= 20) pv.splice(j + 1, 0, { s: q.s, y: req });
    else for (let k = 1; k + 1 < pv.length; k++) if (Math.abs(pv[k].s - q.s) <= RAIL_Z && !pv[k].forced) pv[k].y = q.side > 0 ? Math.max(pv[k].y, req) : Math.min(pv[k].y, req); }
}

// ---- 21.4c-r4 JUNCTION APPROACH GRADE (my number, no rule in the handoff): every leg that is NOT the top-class leg of a node (and every line end on a built road) keeps |grade| <= JX_G inside +-JX_Z m of the node
// (AASHTO approach grade at a junction, 3 %); the top-class leg keeps its class limit. DRAINAGE: a tangent of MINLEN m or more keeps |grade| >= MING (0.3 %); a flat tangent gets a crest PVI in the middle (seedDrain).
const JX_G = 0.03, JX_Z = 30;
const jxSt = new Map<string, number[]>();
for (const nd of nodes) { const top = Math.max(...nd.legs.map((g) => RANK[byId.get(g.id)!.cls])); for (const g of nd.legs) { const l = byId.get(g.id)!; if (RANK[l.cls] < top || nd.legs.filter((q) => RANK[byId.get(q.id)!.cls] === top).length > 1 && RANK[l.cls] === top && nd.legs.length > 2 && false) (jxSt.get(l.id) ?? jxSt.set(l.id, []).get(l.id)!).push(g.s); } }
for (const k of extPin.keys()) { const [id, e] = k.split('|'); const l = byId.get(id)!; (jxSt.get(id) ?? jxSt.set(id, []).get(id)!).push(endS(l, Number(e))); }
const gradeNum = (pv: Pvi[], cv: Curve[], s: number): number => (yAt(pv, cv, s + 2.5) - yAt(pv, cv, s - 2.5)) / 5;
function jxPenalty(l: Ln, pv: Pvi[], cv: Curve[]): number { let c = 0; for (const s0 of jxSt.get(l.id) ?? []) for (let d = -JX_Z; d <= JX_Z; d += 5) { const s = s0 + d; if (s < 2.5 || s > l.s[l.s.length - 1] - 2.5) continue; const g = Math.abs(gradeNum(pv, cv, s)); if (g > JX_G) c += 300 + 20000 * (g - JX_G); } return c; }
function seedDrain(pv: Pvi[]): void { for (let a = pv.length - 2; a >= 0; a--) { const Lg = pv[a + 1].s - pv[a].s, g = (pv[a + 1].y - pv[a].y) / Lg; if (Math.abs(g) < MING && Lg >= MINLEN) pv.splice(a + 1, 0, { s: pv[a].s + Lg / 2, y: (pv[a].y + pv[a + 1].y) / 2 + 0.0045 * Lg / 2 }); } }

const resBy = new Map<string, Res>(); const results: Res[] = []; let optLines = 0, optGain = 0;
const solveLine = (l: Ln): void => {
  const mine = nodesOn.get(l.id) ?? []; const sOf = (n: Node): number => n.legs.find((g) => g.id === l.id)!.s;
  let accepted = false, lastR: Res | null = null;
  for (let attempt = 0; attempt < 8 && !accepted; attempt++) {
  for (const margin of MARGINS) {
  l.h1 = design(l.cls, l.g, l.w, pinsOf(l), GRID, 20000, margin);                                                    // final solve: HARD pins at every node
  const pinSt = new Set<number>(); for (const n of mine) if (!openLeg.has(`${n.id}|${l.id}`)) pinSt.add(stationOf(l, sOf(n)));
  const pts: Pvi[] = l.s.map((s, i) => ({ s, y: l.h1[i], forced: pinSt.has(i) && i > 0 && i < l.s.length - 1 })); let pv: Pvi[] = [], cv: Curve[] = [], tolUsed = TOLS[0], dropped = 0, kinks = 0;
  for (const tol of TOLS) {                                           // smallest tolerance whose curves do not overlap
    const keep = pts.map((p, i) => i === 0 || i === pts.length - 1 || !!p.forced); { let a = 0; for (let i = 1; i < pts.length; i++) if (keep[i]) { dp(pts, a, i, keep, tol); a = i; } }
    pv = pts.filter((_, i) => keep[i]).map((p) => ({ ...p })); cv = curvesOf(l.cls, pv); tolUsed = tol; if (overlap(pv, cv) < 0) break;
  }
  for (let guard = 0; guard < 500; guard++) { const d = overlap(pv, cv); if (d < 0) break; if (pv[d].forced) { pv[d].kink = true; kinks++; } else { pv.splice(d, 1); dropped++; } cv = curvesOf(l.cls, pv); }
  const pinned = mine.filter((n) => !openLeg.has(`${n.id}|${l.id}`));
  const pinList = pinned.map((n) => ({ s: sOf(n), t: n.target }));
  for (const e of [0, 1]) { const q = extPin.get(`${l.id}|${e}`); if (q && !extOpen.has(`${l.id}|${e}`)) { const s = endS(l, e); if (!pinList.some((pp) => Math.abs(pp.s - s) < 1)) pinList.push({ s, t: q.y }); } }
  let fp = fitPins(l.cls, pv, pinList);
  if (!process.env.NOOPT) { const rxs = railX.get(l.id) ?? []; { const cv0 = curvesFixed(pv, curvesOf(l.cls, pv).map((c) => curvesOf(l.cls, pv).length ? c.Lc : 0)); for (const q of rxs) q.side = yAt(pv, cv0, q.s) >= q.y ? 1 : -1; }
    const base = pvCost(l, pv, pinList); let pv2 = pv.map((q) => ({ ...q })); seedRail(l, pv2); seedDrain(pv2); optimisePvi(l, pv2, pinList); let c2 = pvCost(l, pv2, pinList);
    const badGrade = maxGrade(pv2) > LIMIT[l.cls] + 0.0005;
    if (rxs.length && (badGrade || railPenalty(l, (i) => yAt(pv2, curvesFixed(pv2, curvesOf(l.cls, pv2).map((c) => c.Lc)), l.s[i])) > 0)) {        // a crossing could not be cleared on its side: try the other side of each violating crossing
      const sides0 = rxs.map((q) => q.side); const cv2 = curvesFixed(pv2, curvesOf(l.cls, pv2).map((c) => c.Lc)); for (const q of rxs) { const bad = railPenalty({ ...l, id: '__' } as Ln, () => 0); void bad; const ok = q.side > 0 ? yAt(pv2, cv2, q.s) >= q.y + q.shift + RAIL_D - 0.05 : yAt(pv2, cv2, q.s) <= q.y + q.shift - RAIL_D + 0.05; if (!ok || badGrade) q.side = -q.side; }
      const pv3 = pv.map((q) => ({ ...q })); seedRail(l, pv3); seedDrain(pv3); optimisePvi(l, pv3, pinList); const c3 = pvCost(l, pv3, pinList);
      if (c3 < c2) { pv2 = pv3; c2 = c3; } else rxs.forEach((q, k) => { q.side = sides0[k]; }); }
    const fp2 = fitPins(l.cls, pv2, pinList); c2 = pvCost(l, pv2, pinList);
    if (c2 < base - 1e-6 && maxGrade(pv2) <= LIMIT[l.cls] + 0.0005 && fp2.worst <= Math.max(fp.worst, 0.03)) { pv = pv2; fp = fp2; optLines++; optGain += base - c2; } }
  const pinRes0 = fp.worst; cv = curvesFixed(pv, fp.Ls).map((c) => ({ ...c, kind: c.Lc > 0 ? c.kind : 'none' as const }));
  let devDP = 0, maxCut = 0, maxFill = 0, via = 0, bridge = 0, tunnel = 0, wetBad = 0;
  for (let i = 0; i < l.s.length; i++) { const y = yAt(pv, cv, l.s[i]); devDP = Math.max(devDP, Math.abs(y - l.h0[i])); const d = y - l.g[i], wet = !Number.isNaN(l.w[i]);
    if (wet) { bridge += DS; if (y < l.w[i] + FREEBOARD - 0.05) wetBad++; } else if (d > MAXFILL) via += DS; if (!wet) { if (d < 0) maxCut = Math.max(maxCut, -d); else maxFill = Math.max(maxFill, d); if (-d > MAXCUT) tunnel += DS; } }
  const pinRes = pinRes0;
  const r: Res = { id: l.id, cls: l.cls, pv, cv, tol: tolUsed, dropped, kinks, devDP, maxG: maxGrade(pv), maxCut, maxFill, via, bridge, tunnel, wetBad, pinned: pinned.length, pinRes };
  r.margin = margin; lastR = r; if (r.maxG <= LIMIT[l.cls] + 0.0005) { accepted = true; results.push(r); resBy.set(l.id, r); break; }
  }
  if (!accepted) {                                                  // the node levels cannot be held inside the grade limit: open the pinned node farthest from this line's own free level
    const cand = mine.filter((n) => !openLeg.has(`${n.id}|${l.id}`)).sort((a, b) => Math.abs(b.target - hAt(l, sOf(b), l.h0)) - Math.abs(a.target - hAt(l, sOf(a), l.h0)));
    const candE = [0, 1].filter((e) => extPin.has(`${l.id}|${e}`) && !extOpen.has(`${l.id}|${e}`));
    if (cand.length && attempt < 7) openLeg.add(`${cand[0].id}|${l.id}`); else if (candE.length && attempt < 7) extOpen.add(`${l.id}|${candE[0]}`); else { accepted = true; results.push(lastR!); resBy.set(l.id, lastR!); }
  }
  }
};
// ---- 21.4c-r5 RAIL SHIFT (item 1): a crossing that cannot be cleared inside the grade limit and the pinned node levels gets a RAIL LEVEL CHANGE instead of a moved line / structure:
// the rail is LOWERED under the road (road over rail, rail in a cut & cover box, rule 'rail under road' of RailPlan, precedent RAIL_UNDER_BRIDGE_DROP) or RAISED over it (rail viaduct, precedent RAIL_OVER_ROAD_RISE),
// in 0.5 m steps from 0 up to RAIL_SHIFT_MAX, the SMALLEST shift for which the road clears the rail over the whole +-RAIL_Z zone. The rail ramps back at its own grade limit (RAIL_DESIGN.maxGrade).
const RAIL_SHIFT_STEP = 0.5, RAIL_SHIFT_MAX = 10;
const runLine = (l: Ln): void => {
  for (let rr = 0; rr < 30; rr++) {
    solveLine(l); const r = resBy.get(l.id)!; let bumped = false;
    for (const q of railX.get(l.id) ?? []) { if (!q.side || Math.abs(q.shift) >= RAIL_SHIFT_MAX) continue; let worst = Infinity;
      for (let i = 0; i < l.s.length; i++) { if (Math.abs(l.s[i] - q.s) > RAIL_Z) continue; const y = yAt(r.pv, r.cv, l.s[i]); worst = Math.min(worst, q.side > 0 ? y - (q.y + q.shift + RAIL_D) : (q.y + q.shift - RAIL_D) - y); }
      if (worst < -0.05) { q.shift += q.side > 0 ? -RAIL_SHIFT_STEP : RAIL_SHIFT_STEP; bumped = true; } }
    if (!bumped) return; results.splice(results.indexOf(r), 1); resBy.delete(l.id);
  }
};
for (const l of order) runLine(l);

// ---- 21.4c-r6 NODE ARBITRATION (item 2). A node that is still open after the relaxation (the lines disagree by more than NODE_OK) is decided by the class rule 'the bigger road keeps its level':
// REGRADE = the biggest leg keeps its own final level (stays open), every other leg is pinned to it and re-solved; accepted only if all legs meet within NODE_OK, no leg exceeds its grade limit, and the
// new structure length (tunnel-candidate + viaduct metres) of the re-solved lines grows by at most ARB_STRUCT m. Otherwise the node is a REAL CONFLICT: gap at least GAP_STRUCT = a grade-separated crossing
// (the smaller line goes over / under on a structure, 21.8, ramps 21.7); a smaller gap = a short ramp / regrade run (21.7). Numbers are mine.
const ARB_STRUCT = 100, GAP_STRUCT = 7.0, GAP_REROUTE = 20, RAMP_G = 0.06;
const levelAt = (id: string, s: number): number => { const r = resBy.get(id)!; return yAt(r.pv, r.cv, s); };
const structOf = (id: string): number => { const r = resBy.get(id)!; return r.tunnel + r.via; };
interface ArbRow { node: string; x: number; z: number; legs: { id: string; cls: string; s: number; before: number; after: number }[]; spread0: number; spread1: number; decision: 'REGRADE' | 'GRADE-SEPARATED CROSSING' | 'RAMP' | 'RE-ROUTE (21.3)'; major: string; majorLevel: number; gap: number; why: string; }
const arbRows: ArbRow[] = [];
const spreadOf = (n: Node): number => { const v = n.legs.map((g) => levelAt(g.id, g.s)); return Math.max(...v) - Math.min(...v); };
// ---- 21.4c-r7 LINE ENDS ON A BUILT ROAD (item 4). A built road cannot move, so the line is pinned to its level even if its own free level is far away (the 15 m rule of r2 is only the first try):
// accepted if the line keeps its grade limit and its structure metres (tunnel-candidate + viaduct) grow by at most ARB_STRUCT m; otherwise the end stays free and gets a RAMP (21.7).
const extArb: { end: string; line: string; on: string; road: number; ownLevel: number; before: number; after: number; accepted: boolean; why: string }[] = [];
for (const k of [...extFarKeys]) { const [id, e] = k.split('|'); const l = byId.get(id)!; const ei = Number(e); const q = extPin.get(k)!; const r0 = resBy.get(id)!; const st0 = structOf(id);
  const sn = { open: new Set(openLeg), ext: new Set(extOpen), r: r0, sh: (railX.get(id) ?? []).map((u) => u.shift) };
  extOpen.delete(k); for (const n of nodesOn.get(id) ?? []) if (Math.abs(n.legs.find((g) => g.id === id)!.s - endS(l, ei)) <= NODE_TOL + 1) openLeg.delete(`${n.id}|${id}`);
  results.splice(results.indexOf(r0), 1); resBy.delete(id); runLine(l); const r1 = resBy.get(id)!; const st1 = structOf(id); const gradeOk = r1.maxG <= LIMIT[l.cls] + 0.0005; const pinned = !extOpen.has(k);
  const ok = gradeOk && pinned && st1 - st0 <= ARB_STRUCT;
  extArb.push({ end: k, line: id, on: q.on, road: Math.round(q.y * 100) / 100, ownLevel: Math.round(l.h0[ei ? l.h0.length - 1 : 0] * 100) / 100, before: st0, after: st1, accepted: ok, why: ok ? `pinned to ${q.on} level ${f2(q.y)} m; structure metres ${st0} -> ${st1} (limit +${ARB_STRUCT})` : `pin rejected: ${!gradeOk || !pinned ? 'grade limit cannot take it' : 'structure metres ' + st0 + ' -> ' + st1 + ' (over +' + ARB_STRUCT + ')'}; end stays free, ramp (21.7)` });
  if (!ok) { results.splice(results.indexOf(r1), 1); resBy.delete(id); results.push(sn.r); resBy.set(id, sn.r); openLeg.clear(); sn.open.forEach((x) => openLeg.add(x)); extOpen.clear(); sn.ext.forEach((x) => extOpen.add(x)); (railX.get(id) ?? []).forEach((u, i) => { u.shift = sn.sh[i]; }); } }
const arbSeen = new Set<string>();
for (let pass = 0; pass < 3; pass++) { let changed = false;
  for (const n of nodes) { if (n.ext || arbSeen.has(n.id)) continue; const sp0 = spreadOf(n); if (sp0 <= NODE_OK) continue;
    const before = n.legs.map((g) => levelAt(g.id, g.s));
    const rankOf = (id: string): number => RANK[byId.get(id)!.cls];
    const major = [...n.legs].sort((a, b) => rankOf(b.id) - rankOf(a.id) || (openLeg.has(`${n.id}|${b.id}`) ? 1 : 0) - (openLeg.has(`${n.id}|${a.id}`) ? 1 : 0) || byId.get(b.id)!.s[byId.get(b.id)!.s.length - 1] - byId.get(a.id)!.s[byId.get(a.id)!.s.length - 1])[0];
    const L0 = levelAt(major.id, major.s); const minors = n.legs.filter((g) => g !== major);
    // snapshot
    const snap = { open: new Set(openLeg), ext: new Set(extOpen), target: n.target, res: new Map(minors.map((g) => [g.id, resBy.get(g.id)!])), struct: minors.reduce((a, g) => a + structOf(g.id), 0), all: new Map([...resBy]), shifts: new Map([...railX].map(([k, v]) => [k, v.map((q) => q.shift)])) };
    n.target = L0; openLeg.add(`${n.id}|${major.id}`); for (const g of minors) openLeg.delete(`${n.id}|${g.id}`);
    for (const g of minors) { const r = resBy.get(g.id)!; results.splice(results.indexOf(r), 1); resBy.delete(g.id); runLine(byId.get(g.id)!); }
    if (process.env.DEBUG_ARB) for (const g of minors) { const l = byId.get(g.id)!; const r = resBy.get(g.id)!; console.log('ARB', n.id, g.id, 'pins', JSON.stringify([...pinsOf(l)].map(([i, t]) => [Math.round(l.s[i]), Math.round(t * 100) / 100])), 'open', [...openLeg].filter((k) => k.endsWith('|' + g.id)).join(','), 'ext', [0, 1].map((e) => extPin.get(`${g.id}|${e}`)?.y + (extOpen.has(`${g.id}|${e}`) ? 'OPEN' : '')).join('/'), 'maxG', f1(100 * r.maxG), 'len', Math.round(l.s[l.s.length - 1]), 'lvl@node', f2(levelAt(g.id, g.s))); }
    const sp1 = spreadOf(n); const struct1 = minors.reduce((a, g) => a + structOf(g.id), 0);
    const gradeOk = minors.every((g) => resBy.get(g.id)!.maxG <= LIMIT[byId.get(g.id)!.cls] + 0.0005);
    const newOpen = [...openLeg].filter((k) => !snap.open.has(k) && k !== `${n.id}|${major.id}`);
    const ok = sp1 <= NODE_OK + 0.01 && gradeOk && struct1 - snap.struct <= ARB_STRUCT && newOpen.length === 0;
    const row: ArbRow = { node: n.id, x: Math.round(n.x), z: Math.round(n.z), legs: n.legs.map((g, i) => ({ id: g.id, cls: byId.get(g.id)!.cls, s: Math.round(g.s), before: Math.round(before[i] * 100) / 100, after: 0 })), spread0: Math.round(sp0 * 100) / 100, spread1: 0, decision: 'REGRADE', major: major.id, majorLevel: Math.round(L0 * 100) / 100, gap: Math.round(sp0 * 100) / 100, why: '' };
    if (ok) { changed = true; row.spread1 = Math.round(sp1 * 100) / 100; row.why = `${minors.map((g) => g.id).join(' + ')} regraded to ${major.id} level ${f2(L0)} m; structure metres of the regraded lines ${snap.struct} -> ${struct1} m (limit +${ARB_STRUCT})`; }
    else { // restore everything
      for (const g of minors) { const r = resBy.get(g.id); if (r) results.splice(results.indexOf(r), 1); resBy.delete(g.id); const o = snap.res.get(g.id)!; results.push(o); resBy.set(g.id, o); }
      for (const [k, v] of snap.all) if (!resBy.has(k)) { resBy.set(k, v); if (!results.includes(v)) results.push(v); }
      openLeg.clear(); snap.open.forEach((k) => openLeg.add(k)); extOpen.clear(); snap.ext.forEach((k) => extOpen.add(k)); n.target = snap.target; for (const [k, v] of snap.shifts) (railX.get(k) ?? []).forEach((q, i) => { q.shift = v[i]; });
      arbSeen.add(n.id); const sp = sp0; const ownMinor = minors.map((g) => ({ id: g.id, lvl: levelAt(g.id, g.s) }));
      const gapM = Math.max(...ownMinor.map((q) => Math.abs(q.lvl - L0)));
      row.gap = Math.round(gapM * 100) / 100; row.spread1 = Math.round(sp * 100) / 100; row.decision = gapM >= GAP_REROUTE ? 'RE-ROUTE (21.3)' : gapM >= GAP_STRUCT ? 'GRADE-SEPARATED CROSSING' : 'RAMP';
      const why: string[] = []; if (sp1 > NODE_OK + 0.01) why.push(`legs still ${f2(sp1)} m apart after the regrade`); if (!gradeOk) why.push('a leg breaks its grade limit'); if (struct1 - snap.struct > ARB_STRUCT) why.push(`structure metres +${struct1 - snap.struct} m (over ${ARB_STRUCT})`); if (newOpen.length) why.push(`it opens another node (${newOpen.join(', ')})`);
      row.why = `regrade rejected: ${why.join('; ')}`; }
    for (const g of n.legs) { const q = row.legs.find((u) => u.id === g.id)!; q.after = Math.round(levelAt(g.id, g.s) * 100) / 100; }
    arbRows.push(row); }
  if (!changed) break; }

// level at the node, from the final curves, for every leg
let nodeMax = 0, nodeBad = 0, worstNode = ''; const nodeRows: string[] = [];
for (const n of nodes) { const v = n.legs.map((g) => yAt(resBy.get(g.id)!.pv, resBy.get(g.id)!.cv, g.s)); const sp = Math.max(...v) - Math.min(...v); if (sp > NODE_OK) { nodeBad++; nodeRows.push(`   ${n.id} (${f0(n.x)}, ${f0(n.z)}) ${n.legs.map((g, i) => `${g.id} ${f2(v[i])}`).join(' | ')}  spread ${f2(sp)} m`); } if (sp > nodeMax) { nodeMax = sp; worstNode = n.id; } }
const nodeBefore = nodes.map((n) => { const v = n.legs.map((g) => g.h); return Math.max(...v) - Math.min(...v); });
pr('');
pr('2. NODE LEVELS (compromise level per node by relaxation, class-weighted; final solve with hard pins; then the exact level is set on the parabola)');
pr(`   level difference between the lines at a node in 21.4 (before): max ${f2(Math.max(...nodeBefore))} m, over ${NODE_OK} m at ${nodeBefore.filter((v) => v > NODE_OK).length} of ${nodes.length} nodes`);
pr(`   AFTER (exact, on the final curves): max ${f2(nodeMax)} m (${worstNode}), over ${NODE_OK} m at ${nodeBad} of ${nodes.length} nodes`); for (const r of nodeRows.slice(0, 40)) pr(r);
pr(`   OPEN legs (grade limit between two pinned nodes of the same line cannot be met, the line keeps its own level there): ${openLeg.size}${openLeg.size ? ' = ' + [...openLeg].join(', ') : ''}`);
if (nodeBad) pr('   (a node that stays open = two pinned nodes on one smaller line are too far apart in level for its grade limit, or too close in distance: that is a real conflict, it needs a structure, a moved node or a bigger cut / fill)');
pr('');
pr('3. VERTICAL CURVES (parabolas): PVIs by Douglas-Peucker on the pinned level, smallest tolerance (0.1 .. 1.5 m) whose curves do not overlap; curve K from SSD of the design speed (R6 V80, R4 V60, R2 / C V40, L V30), L = max(K |A|, 0.6 V), |A| under 0.5 % = no curve; PVIs dropped only if even 1.5 m overlaps');
pr('   per line: PVIs, curves, tolerance, dropped PVIs, max grade vs limit, max deviation from the 21.4 level, max cut / fill, viaduct, bridge, tunnel-candidate, pinned nodes');
let gFail = 0, wetFail = 0;
for (const r0 of [...results].sort((a, b) => (a.id.length - b.id.length) || (a.id < b.id ? -1 : 1))) { const r = r0; const lim = LIMIT[r.cls]; const ok = r.maxG <= lim + 0.0005; if (!ok) gFail++; if (r.wetBad) wetFail++;
  pr(`   ${r.id.padEnd(7)} ${r.cls.padEnd(2)} PVI ${String(r.pv.length).padStart(3)} curves ${String(r.cv.filter((c) => c.Lc > 0).length).padStart(3)} tol ${f1(r.tol)} m${f2(r.margin ?? 0)} dropped ${String(r.dropped).padStart(2)} kinks ${r.kinks}  maxG ${f1(100 * r.maxG)}% / ${f0(100 * lim)}% ${ok ? 'ok' : 'OVER'}  dev ${f2(r.devDP)} m  cut ${f1(r.maxCut)} fill ${f1(r.maxFill)}  viaduct ${r.via} m  bridge ${r.bridge} m  tunnel? ${r.tunnel} m  pins ${r.pinned}${r.wetBad ? `  WET-LOW ${r.wetBad}` : ''}`); }
pr('');
pr('3b. RAIL CROSSINGS (X5: no crossing at grade; road over rail = road >= rail + ' + RAIL_D + ' m, road under rail = road <= rail - ' + RAIL_D + ' m, rail design level as given)');
const railRows: any[] = [], shiftRows: any[] = []; let railBad = 0, railN = 0;
for (const [id, arr] of [...railX].sort((a, b) => (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1))) { const r = resBy.get(id); if (!r) continue; const l = byId.get(id)!;
  for (const q of arr.sort((a, b) => a.s - b.s)) { railN++; const y = yAt(r.pv, r.cv, q.s); const yr = q.y + q.shift; const diff = y - yr; const ok = Math.abs(diff) >= RAIL_D - 0.05; if (!ok) railBad++; const kind = diff >= 0 ? 'road OVER rail (rail in a cut & cover box)' : 'road UNDER rail (rail on a viaduct)';
    let worst = Infinity; for (let i = 0; i < l.s.length; i++) if (Math.abs(l.s[i] - q.s) <= RAIL_Z) worst = Math.min(worst, Math.abs(yAt(r.pv, r.cv, l.s[i]) - q.y)); if (worst < RAIL_D - 0.05) { /* inside the zone the gap is smaller at one station */ }
    const row: any = { line: id, edge: q.edge, s: Math.round(q.s), x: Math.round(q.x), z: Math.round(q.z), rail: Math.round(q.y * 100) / 100, road: Math.round(y * 100) / 100, diff: Math.round(diff * 100) / 100, ok, kind };
    if (q.shift) { const e: any = (gen.rail.edges as any[]).find((u) => String(u.id) === q.edge); let kb = 0, db = Infinity; for (let k = 0; k < e.xs.length; k++) { const d = Math.hypot(e.xs[k] - q.x, e.zs[k] - q.z); if (d < db) { db = d; kb = k; } }
      const gr = e.ground[kb], ramp = Math.abs(q.shift) / RAIL_DESIGN.maxGrade; Object.assign(row, { railShift: q.shift, railNew: Math.round(yr * 100) / 100, railGround: Math.round(gr * 100) / 100, railRampEachSide: Math.round(ramp), railNotch: Math.round(2 * (RAIL_Z + ramp)), railPlanKey: `${id}|${q.edge}`, roadToRail: Math.round((y - yr) * 100) / 100, railDepthBelowGround: Math.round((gr - yr) * 100) / 100 });
      shiftRows.push(row); }
    railRows.push(row);
    pr(`   ${id.padEnd(7)} x rail ${q.edge.padEnd(4)} s ${f0(q.s).padStart(5)} at (${f0(q.x)}, ${f0(q.z)})  rail ${f2(q.y)} m${q.shift ? ' -> ' + f2(yr) + ' m (' + (q.shift > 0 ? '+' : '') + f1(q.shift) + ' m)' : ''}  road ${f2(y)} m  diff ${diff >= 0 ? '+' : ''}${f2(diff)} m  ${kind}  ${ok ? (q.shift ? 'ok WITH RAIL LEVEL CHANGE' : 'ok') : 'FAIL (needs ' + f1(RAIL_D) + ' m)'}`); } }
for (const q of shiftRows) pr(`      -> ${q.line} x ${q.edge}: rail ${q.railShift < 0 ? 'LOWERED' : 'RAISED'} ${f1(Math.abs(q.railShift))} m (${f2(q.rail)} -> ${f2(q.railNew)} m), ground at the crossing ${f2(q.railGround)} m (rail ${q.railDepthBelowGround > 0 ? f1(q.railDepthBelowGround) + ' m under the ground' : f1(-q.railDepthBelowGround) + ' m over the ground'}), road ${f2(q.roadToRail)} m over / under the rail; the rail ramps back at ${f1(100 * RAIL_DESIGN.maxGrade)} % = ${q.railRampEachSide} m each side of the +-${RAIL_Z} m zone, so the rail changes over about ${q.railNotch} m; RailPlan entry for 21.6: ${q.railShift < 0 ? 'RAIL_UNDER_BRIDGE_FORCE + RAIL_UNDER_BRIDGE_DROP' : 'RAIL_OVER_ROAD_RISE'} key '${q.railPlanKey}'`);
pr(`   ${railN} rail crossings, ${railN - railBad} clear, ${railBad} not clear (cannot be solved inside the grade limit / node levels: structure or moved line, decision for 21.8)`);
pr('');
pr('3c. JUNCTION APPROACH GRADE (non-top legs and line ends on built roads: |grade| <= ' + f1(100 * JX_G) + ' % inside +-' + JX_Z + ' m of the node)');
const jxRows: any[] = []; let jxBad = 0, jxN = 0;
for (const [id, sts] of jxSt) { const r = resBy.get(id); if (!r) continue; const l = byId.get(id)!; for (const s0 of sts) { jxN++; let mg = 0; for (let d = -JX_Z; d <= JX_Z; d += 5) { const s = s0 + d; if (s < 2.5 || s > l.s[l.s.length - 1] - 2.5) continue; mg = Math.max(mg, Math.abs(gradeNum(r.pv, r.cv, s))); }
  if (mg > JX_G + 0.0005) { jxBad++; jxRows.push({ line: id, s: Math.round(s0), maxG: Math.round(mg * 1000) / 10 }); pr(`   ${id.padEnd(7)} s ${f0(s0).padStart(5)}  max grade ${f1(100 * mg)} %  OVER ${f1(100 * JX_G)} %`); } } }
pr(`   ${jxN} junction legs checked, ${jxN - jxBad} ok, ${jxBad} over ${f1(100 * JX_G)} % (listed above; the class limit still holds: they sit on steep ground where the node level and the grade limit leave no room)`);
pr('');
pr('3d. DRAINAGE (tangent of ' + MINLEN + ' m or more needs |grade| >= ' + f1(100 * MING) + ' %)');
let flatN = 0, flatM = 0; const flatRows: any[] = [];
for (const r of results) for (let a = 0; a + 1 < r.pv.length; a++) { const Lg = r.pv[a + 1].s - r.pv[a].s, g = Math.abs((r.pv[a + 1].y - r.pv[a].y) / Lg); if (Lg >= MINLEN && g < MING - 1e-6) { flatN++; flatM += Lg; flatRows.push({ line: r.id, s: Math.round(r.pv[a].s), len: Math.round(Lg), g: Math.round(g * 10000) / 100 }); pr(`   ${r.id.padEnd(7)} s ${f0(r.pv[a].s).padStart(5)}  length ${f0(Lg)} m  grade ${f2(100 * g)} %  FLAT`); } }
pr(`   ${flatN} flat tangents, ${f0(flatM)} m (two pinned node / road levels at the same height with no room for a crest: they need a drain / cross-fall design in 21.5)`);
pr('');
pr('3e. WET STATIONS after the curves (deck must be >= water + ' + FREEBOARD + ' m; the lines below go to the bridge / culvert design 21.8)');
for (const r of results) { const l = byId.get(r.id)!; let n = 0, worst = Infinity, ws = 0; for (let i = 0; i < l.s.length; i++) { if (Number.isNaN(l.w[i])) continue; n++; const m = yAt(r.pv, r.cv, l.s[i]) - (l.w[i] + FREEBOARD); if (m < worst) { worst = m; ws = l.s[i]; } }
  if (n && worst < -0.05) pr(`   ${r.id.padEnd(7)} wet ${n * DS} m, LOW by ${f2(-worst)} m at s ${f0(ws)} (x ${f0(l.x[stationOf(l, ws)])}, z ${f0(l.z[stationOf(l, ws)])}): deck must rise ${f2(-worst)} m there, the grade limit / pinned node levels do not allow it  -> bridge deck / structure in 21.8`); }
pr('');
pr('3f. DECISIONS FOR THE OPEN POINTS (items 2 and 4 of the 21.4c hand-over; item 1 is in 3b, item 3 = ground of the island lines is fixed in centre-profile.ts)');
pr(`   RULES (mine): a node that stays open is decided by the class rule 'the bigger road keeps its level': (1) REGRADE: every smaller leg is pinned to the bigger leg's level and re-solved, accepted if the legs meet within ${NODE_OK} m, no grade limit is broken, and the structure metres of the re-solved lines grow by at most ${ARB_STRUCT} m (cut / fill is paid for, no new bridge); (2) else the node is a real conflict: a level gap of ${GAP_STRUCT} m or more = GRADE-SEPARATED CROSSING (the smaller line goes over / under, 21.8, with ramps 21.7), a gap of ${GAP_REROUTE} m or more cannot be a crossing either = RE-ROUTE (21.3: the line is too short / too steep for the level change, it needs a longer alignment, a moved node or a lower class); a smaller gap = RAMP (21.7). LINE ENDS on a built road: pinned to the road level if the line grade holds and its structure metres grow by at most ${ARB_STRUCT} m, else RAMP (21.7).`);
for (const q of extArb) pr(`   END ${q.line} ${q.end.endsWith('|1') ? 'end' : 'start'} on ${q.on}: road ${f2(q.road)} m, own free level ${f2(q.ownLevel)} m  ${q.accepted ? 'PINNED' : 'RAMP'}  ${q.why}`);
for (const q of arbRows) { pr(`   ${q.node} (${q.x}, ${q.z})  ${q.decision}  major leg ${q.major} (${f2(q.majorLevel)} m)  spread ${f2(q.spread0)} m -> ${f2(q.spread1)} m   ${q.legs.map((g) => `${g.id} ${g.cls} s ${g.s}: ${f2(g.before)} -> ${f2(g.after)} m`).join(' | ')}`); pr(`           ${q.why}`); }
pr(`   ${arbRows.length} nodes were open: ${arbRows.filter((q) => q.decision === 'REGRADE').length} regraded, ${arbRows.filter((q) => q.decision === 'GRADE-SEPARATED CROSSING').length} grade-separated crossings, ${arbRows.filter((q) => q.decision === 'RAMP').length} ramps, ${arbRows.filter((q) => q.decision === 'RE-ROUTE (21.3)').length} re-routes`);
// ---- line ends on built roads that are NOT pinned (own level kept)
const rawBuilt = (id: string, x: number, z: number): { d: number; y: number; onStruct: boolean; gr: number } | null => {
  gen.sampleGround(x, z, sc); const gr = sc.h;
  if (id === 'M8') { if (ringPts.length < 2) return null; const q = projPoly(ringPts, x, z); const sp = ringS[q.i] + q.t * (ringS[q.i + 1] - ringS[q.i]); return { d: q.d, y: ringProf.yAt(sp), onStruct: false, gr }; }
  const src = id === 'M6-1' ? ISLAND_LINK_DATA : (J1_ARM_DATA.find((a) => a.name === id) ?? R6_LINE_DATA.find((a) => a.name === id)); if (!src) return null;
  const q = projPoly(src.pts, x, z); const sP = (src as any).s ? (src as any).s[q.i] + q.t * ((src as any).s[q.i + 1] - (src as any).s[q.i]) : NaN;
  return { d: q.d, y: src.ys[q.i] + q.t * (src.ys[q.i + 1] - src.ys[q.i]), onStruct: !!(src as any).structs?.some((r: number[]) => sP >= r[0] - 1 && sP <= r[1] + 1), gr };
};
const roadSurface = (id: string, x0: number, z0: number): string => {       // nearest point along the main road (within 1500 m of the junction) where it runs on the ground (|level - ground| <= 4 m)
  const pts = id === 'M8' ? ringPts : ((id === 'M6-1' ? ISLAND_LINK_DATA : (J1_ARM_DATA.find((a) => a.name === id) ?? R6_LINE_DATA.find((a) => a.name === id))) as any)?.pts as number[][] | undefined; if (!pts) return 'no road data';
  let best: { d: number; x: number; z: number; y: number; gr: number } | null = null; const q0 = projPoly(pts, x0, z0);
  const sAt: number[] = [0]; for (let i = 1; i < pts.length; i++) sAt.push(sAt[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const s0 = sAt[q0.i] + q0.t * (sAt[q0.i + 1] - sAt[q0.i]);
  for (let i = 0; i + 1 < pts.length; i++) { const L2 = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); for (let t = 0; t < 1; t += Math.max(0.01, 20 / Math.max(L2, 1))) { const x = pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), z = pts[i][1] + t * (pts[i + 1][1] - pts[i][1]); const ds = Math.abs(sAt[i] + t * L2 - s0); if (ds > 1500) continue;
    const r = rawBuilt(id, x, z); if (!r || r.onStruct || Number.isNaN(r.y) || Math.abs(r.y - r.gr) > 4) continue; if (!best || ds < best.d) best = { d: ds, x, z, y: r.y, gr: r.gr }; } }
  return best ? `nearest point where ${id} runs on the ground: ${f0(best.d)} m along the road at (${f0(best.x)}, ${f0(best.z)}), road ${f2(best.y)} m, ground ${f2(best.gr)} m` : `no point within 1500 m where ${id} runs on the ground`;
};
const endRows: any[] = [];
const endKeys: { k: string; on: string | null; reason: string }[] = [];
for (const k of extOpen) endKeys.push({ k, on: extPin.get(k)?.on ?? null, reason: 'own level more than ' + EXT_MAXDIFF + ' m from the road, or the grade limit cannot take the pin' });
for (const k of extNoSrc) endKeys.push({ k, on: null, reason: 'no usable road level (bridge / viaduct deck, or no level data)' });
pr('');
for (const q of moveRows) pr(q.moved ? `   MOVE ${q.line} ${q.end.endsWith('|1') ? 'end' : 'start'} on ${q.on}: the road is on a deck / viaduct at the junction, the junction moves ${q.moveStraight} m (${q.moveAlongRoad} m along the road) to (${q.to[0]}, ${q.to[1]}) where ${q.on} runs on the ground (road ${f2(q.roadLevel)} m, ground ${f2(q.ground)} m); the line's own level there ${f2(q.ownLevel)} m, grade of the extension ${f1(q.extensionGrade)} %  ->  ${q.pinned ? 'PINNED to the road level there (21.3: the line start moves by ' + q.moveStraight + ' m)' : 'NOT pinned (move over ' + MOVE_PIN + ' m): 21.3 must extend the line by ' + q.moveStraight + ' m at ' + f1(q.extensionGrade) + ' % (class limit ok = ' + (q.extensionGrade <= 100 * LIMIT[byId.get(q.line)!.cls] ? 'yes' : 'NO') + ')'}` : `   MOVE ${q.line} ${q.end}: ${q.why}`);
pr(`   LINE ENDS NOT PINNED (${endKeys.length}): decision = RAMP / INTERCHANGE (21.7); numbers: ramp length at ${f0(100 * RAMP_G)} % between the line level and the road level, junction ground, where the main road runs on the ground`);
for (const { k, on, reason } of endKeys) { const [id, e] = k.split('|'); const l = byId.get(id)!; const ei = Number(e); const x = l.x[ei ? l.x.length - 1 : 0], z = l.z[ei ? l.z.length - 1 : 0]; const lvl = levelAt(id, endS(l, ei)); const own = l.h0[ei ? l.h0.length - 1 : 0];
  let onId = on; if (!onId) for (const ln of F.lines) { if (!(ln.cls === '8' || ln.built)) continue; if (projPoly(ln.pts, x, z).d <= NODE_TOL) { onId = ln.id; break; } }
  const rb = onId ? rawBuilt(onId, x, z) : null; gen.sampleGround(x, z, sc); const gr = sc.h;
  const road = rb && !Number.isNaN(rb.y) ? rb.y : NaN; const gap = Number.isNaN(road) ? NaN : Math.abs(road - lvl); const ramp = Number.isNaN(gap) ? NaN : gap / RAMP_G;
  const avail = (() => { const ss = [0, l.s[l.s.length - 1], ...(nodesOn.get(id) ?? []).map((n) => n.legs.find((g) => g.id === id)!.s)].filter((v) => Math.abs(v - endS(l, ei)) > 20); return ss.length ? Math.min(...ss.map((v) => Math.abs(v - endS(l, ei)))) : NaN; })();
  const kind = rb?.onStruct ? 'the main road is on a bridge / viaduct deck here' : (!Number.isNaN(road) && road - gr > MAXFILL ? 'the main road is on a viaduct here' : (!Number.isNaN(road) && gr - road > MAXCUT ? 'the main road is in a deep cut / tunnel here (ground ' + f1(gr - road) + ' m above it)' : 'the main road is near the ground'));
  const where = onId && rb && (rb.onStruct || road - gr > MAXFILL || gr - road > MAXCUT) ? roadSurface(onId, x, z) : '';
  endRows.push({ end: k, line: id, on: onId, road: Number.isNaN(road) ? null : Math.round(road * 100) / 100, lineLevel: Math.round(lvl * 100) / 100, ownLevel: Math.round(own * 100) / 100, ground: Math.round(gr * 100) / 100, gap: Number.isNaN(gap) ? null : Math.round(gap * 100) / 100, rampLength: Number.isNaN(ramp) ? null : Math.round(ramp), nextPoint: Math.round(avail), kind, where, decision: 'RAMP (21.7)' });
  pr(`   ${id.padEnd(6)} ${ei ? 'end  ' : 'start'} on ${String(onId).padEnd(6)} (${reason})`); pr(`           main road ${Number.isNaN(road) ? 'level unknown' : f2(road) + ' m'}, line level ${f2(lvl)} m (own free ${f2(own)} m), junction ground ${f2(gr)} m; gap ${Number.isNaN(gap) ? '-' : f1(gap) + ' m'} -> ramp ${Number.isNaN(ramp) ? '-' : f0(ramp) + ' m'} at ${f0(100 * RAMP_G)} % (the line has ${f0(avail)} m to its next node / end); ${kind}`);
  if (where) pr(`           ${where}`); }

pr('');
pr('4. SUMMARY');
const sum = (f: (r: Res) => number): number => results.reduce((a, r) => a + f(r), 0);
const allCurves = results.flatMap((r) => r.cv.filter((c) => c.Lc > 0));
pr(`   ${results.length} lines, ${sum((r) => r.pv.length - 2)} interior PVIs, ${allCurves.length} parabolic curves (${allCurves.filter((c) => c.kind === 'crest').length} crest, ${allCurves.filter((c) => c.kind === 'sag').length} sag), ${sum((r) => r.cv.filter((c) => c.Lc === 0).length)} grade breaks under ${NOCURVE_A} % without a curve, ${sum((r) => r.dropped)} PVIs dropped for overlap, ${sum((r) => r.kinks)} node PVIs made a kink (no curve, curves too close)`);
pr(`   PVI optimiser: ${optLines} of ${results.length} lines improved, total cost gain ${f0(optGain)}`);
pr(`   grade over the class limit: ${gFail} lines; lines with a wet station under water + ${FREEBOARD} m: ${wetFail}; node spread over ${NODE_OK} m: ${nodeBad} of ${nodes.length}`);
{ let bt = 0, bv = 0; const bc: Record<string, number[]> = {}; for (const l of lines) { let t = 0, v = 0; for (let i = 0; i < l.s.length; i++) { if (!Number.isNaN(l.w[i])) continue; const d = l.h0[i] - l.g[i]; if (-d > MAXCUT) t += DS; else if (d > MAXFILL) v += DS; } bt += t; bv += v; (bc[l.cls] ??= [0, 0]); bc[l.cls][0] += t; bc[l.cls][1] += v; }
  const fc: Record<string, number[]> = {}; for (const r of results) { (fc[r.cls] ??= [0, 0]); fc[r.cls][0] += r.tunnel; fc[r.cls][1] += r.via; }
  pr(`   COST OF NODE LEVELS + CURVES vs the free 21.4 profile (tunnel-candidate m / viaduct m): 21.4 ${bt} / ${bv}  ->  now ${sum((r) => r.tunnel)} / ${sum((r) => r.via)}`);
  for (const c of ['6', '4', '2', 'C', 'L']) if (bc[c]) pr(`      class ${c.padEnd(2)} 21.4 ${bc[c][0]} / ${bc[c][1]}  ->  now ${fc[c][0]} / ${fc[c][1]}`); }
pr(`   max deviation of the curve profile from the 21.4 DP level: ${f2(Math.max(...results.map((r) => r.devDP)))} m; tunnel-candidate (cut over ${MAXCUT} m) ${sum((r) => r.tunnel)} m; viaduct (fill over ${MAXFILL} m) ${sum((r) => r.via)} m; bridge (wet) ${sum((r) => r.bridge)} m`);
pr(`   LINE ENDS ON A BUILT / 8-LANE ROAD: ${extList.length} found, ${extPin.size - extOpen.size} pinned to the road level, ${extOpen.size} NOT pinned (road level more than ${EXT_MAXDIFF} m from the line's own level, or the grade limit cannot take it: kept free, ramp = 21.7), ${extNoSrc.length} on a road with no level source (own level kept)`);
for (const [k, q] of extPin) { const [id, e] = k.split('|'); const l = byId.get(id)!; const r = resBy.get(id); const yy = r ? yAt(r.pv, r.cv, endS(l, Number(e))) : NaN; pr(`   ${id.padEnd(7)} ${Number(e) ? 'end  ' : 'start'} on ${q.on.padEnd(5)} road level ${f2(q.y)} m, line level ${f2(yy)} m, own free level ${f2(l.h0[Number(e) ? l.h0.length - 1 : 0])} m${extOpen.has(k) ? '  OPEN' : ''}`); }
for (const r of extFar.filter((q) => [...extOpen].some((k) => q.startsWith(`${k.split('|')[0]} ${k.endsWith('|1') ? 'end' : 'start'} `)))) pr(`   ${r}: NOT pinned (too far from the line's own level, island / structure end), ramp = 21.7`);
for (const k of extNoSrc) pr(`   ${k.replace('|0', ' start').replace('|1', ' end')}: road level not pinned (the road is on a bridge / viaduct there, or no level source): own level kept, junction ramp = 21.7`);
pr('   NOT DONE: building clearance, drainage (min grade 0.3 % only as a soft cost), junction cross-grade check, deck depth of bridges.');
writeFileSync(`${OUT}/STEP_21_4C_OUTPUT.txt`, L.join('\r\n'));
writeFileSync(`${OUT}/centre_vprofile.json`, JSON.stringify({
  note: 'STEP 21.4c: PVI table + parabolic vertical curves per line (s = metres from the line start, y = finished level of the PVI), node table with the agreed level',
  rail: railRows, railShifts: shiftRows, arbitration: arbRows, moves: moveRows, extArbitration: extArb, ends: endRows, junction: jxRows, flat: flatRows,
  ext: [...extPin].map(([k, q]) => ({ end: k, on: q.on, level: Math.round(q.y * 100) / 100, open: extOpen.has(k) })),
  nodes: nodes.map((n) => ({ id: n.id, x: Math.round(n.x), z: Math.round(n.z), level: Math.round(n.target * 100) / 100, legs: n.legs.map((g) => ({ id: g.id, s: Math.round(g.s * 10) / 10 })) })),
  lines: results.map((r) => ({ id: r.id, cls: r.cls, V: SPEED[r.cls], pvi: r.pv.map((p) => [Math.round(p.s * 10) / 10, Math.round(p.y * 100) / 100]), curves: r.cv.map((c) => ({ s: Math.round(c.s * 10) / 10, A: Math.round(c.A * 100) / 100, L: Math.round(c.Lc * 10) / 10, K: Math.round(c.K * 10) / 10, kind: c.kind })) })),
}));
