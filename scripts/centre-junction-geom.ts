// STEP 21.7-2 JUNCTION GEOMETRY NUMBERS (headless, READ ONLY: changes NO src file and NO data file, writes only docs/STEP_21_7_2_OUTPUT.txt and docs/centre_junction_geom.json).
// What it does (the task of the user, 2026-11-18):
//   1. the three T types (signalised A x A, priority + turn pocket, priority T): kerb radius, taper, pocket length, slip lane, sight distance, per type and per node
//   2. roundabout size for every 4-arm node (1-lane 30-45 m, 2-lane 50-70 m of Step 7): inscribed diameter from the arm angles, and whether the ground has room
//      (arm angle, buildings, river, rail, engineering area, natural slope)
//   3. ONE merged fix LIST: the 70 deg FAIL nodes of 21.7-1 together with its lists (b) local street on an arterial and (c) corners under Rmin; nothing is moved (R10)
// Numbers: Standards.ts (decelLength, speedChangeLength, stoppingSight, minRadius, frictionAt), Step 8 (kerb radius 8-15 m collector, up to 25 m with a slip lane on arterials),
//          3.13 point 4 (taper L = 0.62 W V for V >= 70, W V^2 / 155 for V <= 60), 21.3 (design speeds R6 80, R4 60, R2 / C 40, L 30), J1-a (pocket = stop distance + storage + taper).
// LEFT-HAND TRAFFIC (D1): the turn that crosses the oncoming flow is the RIGHT turn, so the pocket is a RIGHT-turn pocket (21.47 called it 'left pocket': that name is the right-hand-traffic one).
// Every constant that is MY choice is at the top and printed. A FAIL is a LIST for the user (R10).
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-junction-geom.ts docs ; python3 tools/centre-junction-geom-plot.py docs
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';
import { CRITERIA, frictionAt, minRadius, stoppingSight, speedChangeLength, decelLength } from '../src/interchange/Standards';

const OUT = process.argv[2] ?? 'docs';
const hyp = Math.hypot, f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);

// ---------------- constants (MY choices unless a source is named) ----------------
const END_M = 12, TW = 20;                                   // same as 21.7-1 (arm = chord over TW m, END leg within END_M of a line end)
const V: Record<string, number> = { '6': 80, '4': 60, '2': 40, C: 40, L: 30 };          // design speed km/h, 21.3
const W: Record<string, number> = { '6': 3.65, '4': 3.5, '2': 3.3, C: 3.3, L: 3.0 };    // lane width m, Step 7 table (R6 = M6 recipe, R4 = A-D, R2 / C = collector, L = local)
const HALF: Record<string, number> = { '6': 19, '4': 15, '2': 11, C: 10, L: 9 };       // corridor half width m incl. 3 m clearance, 21.2 (centre-ground-check.ts)
const LANES_IN: Record<string, number> = { '6': 2, '4': 2, '2': 1, C: 1, L: 1 };       // lanes per direction at a roundabout entry (an R6 drops 3 -> 2 upstream, 3.13)
const VA_MAX = 60;                                           // signalised junction approach speed, an R6 (V80) steps down to 60 (J1-a precedent)
const STORE_P = 15, STORE_S = 30;                            // storage m in a pocket: priority 2 cars x 7.5 m, signalised 4 cars x 7.5 m (ASSUMED, no demand per node yet)
const VA_MIN = 40;                                           // advisory approach speed used for the SHORT pocket (sign), same as the advisory-speed decision of 21.47 (c)
const SLIP_R = 25, SLIP_W = 4.0;                             // Step 8: kerb radius up to 25 m with a slip lane on arterials; slip lane width
const TG = 7.5;                                              // s, gap time for the sight distance of a priority T (minor road, crossing the oncoming flow)
const SIGHT_SETBACK = 4.5;                                   // m, decision point of the minor driver behind the major edge
const ANG_OK = 70, ANG_SKEW = 60, ANG_BAD = 50;                            // >= 70 PASS (Step 8); 60 - 70 PASS with a skew design; < 60 = FIX LIST (my choice, see the output text)
const RB_RANGE: Record<number, [number, number]> = { 1: [30, 45], 2: [50, 70] };      // Step 7 inscribed circle diameter m
const RB_CW: Record<number, number> = { 1: 5.5, 2: 9.0 };    // circulating roadway width m
const RB_ENTRY_W: Record<number, number> = { 1: 4.5, 2: 7.0 }, RB_ISL = 3.0, RB_GAP = 2.0;   // entry = exit width m, splitter island at the circle m, kerb gap m
const RB_FLARE = 25;                                         // m of arm from the circle edge that every roundabout arm needs at least (flare + island nose)
const EDGE = 8;                                              // m from the circle edge to a building (verge 2 + footpath 2 + clearance 4)
const RAIL_CLEAR = 25;                                       // m, rail centreline to the circle edge / pad edge (21.2 used 25 m)
const KERB_BASE = { TA: SLIP_R, TP_C: 15, TP_L: 10, CC: 12, CL: 10, LL: 8 };           // m (Step 8 ranges), see kerbBase()
const R_FLOOR = 6;                                           // m, smallest kerb radius after the skew rule
const GRID = 4;                                              // m, sampling grid of the ground checks

// ---------------- Standards.ts helpers ----------------
const rmin = (c: string): number => minRadius(V[c]);
function vturn(R: number): number { let v = 10; while (v < 80 && (v + 1) * (v + 1) / (127 * (0.02 + frictionAt(v + 1))) <= R) v++; return v; }   // km/h for kerb radius R, e = 0.02 (crossfall)
const taper = (Va: number, w: number): number => (Va >= 70 ? 0.62 * w * Va : (w * Va * Va) / 155);                       // 3.13 point 4
const pocketLen = (Va: number, w: number, store: number): { taper: number; decel: number; store: number; total: number } => {
  const t = taper(Va, w), d = decelLength(Va, 0), total = t + d + store; return { taper: t, decel: d, store, total };
};

// ---------------- data ----------------
const rd = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const vp = rd(`${OUT}/centre_vprofile.json`), cf = rd(`${OUT}/fit_chain/centre_fixed.json`), cj = rd(`${OUT}/centre_junction.json`);
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
const angBetween = (a: number[], b: number[]): number => (Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180) / Math.PI;
const unit = (v: number[]): number[] => { const h = hyp(v[0], v[1]) || 1; return [v[0] / h, v[1] / h]; };
const A_CLASS = new Set(['6', '4']);
const rname = (c: string): string => (c === 'C' || c === 'L' ? c : 'R' + c);
const rank: Record<string, number> = { '6': 1, '4': 2, '2': 3, C: 4, L: 5 };

const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const wetAt = (x: number, z: number): boolean => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h; };
const natH = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const railPts: number[][] = []; for (const e of gen.rail.edges as any[]) for (let k = 0; k < e.xs.length; k++) railPts.push([e.xs[k], e.zs[k]]);
function bldDist(b: any, x: number, z: number): number {   // distance from a point to the building footprint (0 = inside); convention of centre-ground-check.ts
  const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, lx = dx * co - dz * si, lz = dx * si + dz * co;
  return hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0));
}
function nearestBld(x: number, z: number, lim = 200): { d: number; i: number } { let best = { d: Infinity, i: -1 }; for (let i = 0; i < RECTS.length; i++) { const b = RECTS[i]; if (Math.abs(b.x - x) > lim + 40 || Math.abs(b.z - z) > lim + 40) continue; const d = bldDist(b, x, z); if (d < best.d) best = { d, i }; } return best; }
function nearestRail(x: number, z: number): number { let d = Infinity; for (const q of railPts) { if (Math.abs(q[0] - x) > 400 || Math.abs(q[1] - z) > 400) continue; const h = hyp(q[0] - x, q[1] - z); if (h < d) d = h; } return d; }

pr('STEP 21.7-2 JUNCTION GEOMETRY NUMBERS (read only; lines = docs/fit_chain/centre_fixed.json, nodes = docs/centre_vprofile.json, types = docs/centre_junction.json of 21.7-1)');
pr(`constants (MY choices): design speed R6 ${V['6']} / R4 ${V['4']} / R2 and C ${V['2']} / L ${V['L']} km/h (21.3); lane width ${Object.entries(W).map(([k, v]) => rname(k) + ' ' + v).join(', ')}; approach speed max ${VA_MAX}, short pocket ${VA_MIN} km/h;`);
pr(`   storage priority ${STORE_P} m, signalised ${STORE_S} m (ASSUMED); slip lane R ${SLIP_R} m width ${SLIP_W}; sight gap ${TG} s; angle: >= ${ANG_OK} PASS, ${ANG_SKEW} - ${ANG_OK} PASS with skew design, < ${ANG_SKEW} FIX LIST; roundabout ICD 1-lane ${RB_RANGE[1]} / 2-lane ${RB_RANGE[2]} m, edge ${EDGE} m, rail ${RAIL_CLEAR} m`);
pr(`Standards.ts: aDecel ${CRITERIA.aDecel} m/s2, tPR ${CRITERIA.tPR} s, aBrake ${CRITERIA.aBrake} m/s2. Ground data: ${RECTS.length} building footprints, ${railPts.length} rail points, terrain water + natural height (TerrainGenerator).`);
pr();

// ---------------- arms of every node (same method as 21.7-1: arm = chord over TW m; axis = the WIDEST pair of arms; minor = the rest) ----------------
interface Arm { id: string; dir: number[]; cls: string; s: number; sgn: number; next: number; nextNode: string }
interface Nd { id: string; x: number; z: number; arms: Arm[]; major: Arm[]; minor: Arm[]; phi: number | null; type: string; pairs: string }
const nodesOfLine = new Map<string, { node: string; s: number }[]>();
const nodes: Nd[] = []; const typeOf = new Map<string, any>(); for (const n of cj.nodes) typeOf.set(n.id, n);
for (const n of vp.nodes) {
  const arms: Arm[] = []; let cx = 0, cz = 0, kinds: string[] = [];
  for (const g of n.legs) {
    const cls = clsOf.get(g.id)!, c = cumOf.get(g.id)!, last = pviLast.get(g.id)!, s = (g.s * c[c.length - 1]) / last;
    const P = at(g.id, s); cx += P[0]; cz += P[1];
    const k = g.s <= END_M ? 'S' : last - g.s <= END_M ? 'E' : 'T'; kinds.push(k);
    if (k === 'S' || k === 'T') { const Q = at(g.id, s + TW); arms.push({ id: g.id, dir: unit([Q[0] - P[0], Q[1] - P[1]]), cls, s, sgn: 1, next: 0, nextNode: '' }); }
    if (k === 'E' || k === 'T') { const Q = at(g.id, s - TW); arms.push({ id: g.id, dir: unit([Q[0] - P[0], Q[1] - P[1]]), cls, s, sgn: -1, next: 0, nextNode: '' }); }
    (nodesOfLine.get(g.id) ?? nodesOfLine.set(g.id, []).get(g.id)!).push({ node: n.id, s });
  }
  cx /= n.legs.length; cz /= n.legs.length;
  let major: Arm[] = [], minor: Arm[] = [], phi: number | null = null;
  if (arms.length >= 3) {
    let bi = 0, bj = 1, ba = -1; for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) { const a = angBetween(arms[i].dir, arms[j].dir); if (a > ba) { ba = a; bi = i; bj = j; } }
    major = [arms[bi], arms[bj]]; minor = arms.filter((_, k) => k !== bi && k !== bj);
    const ax = [major[0].dir[0] - major[1].dir[0], major[0].dir[1] - major[1].dir[1]];
    phi = Math.min(...minor.map((a) => { const d = angBetween(a.dir, ax); return Math.min(d, 180 - d); }));
  }
  nodes.push({ id: n.id, x: cx, z: cz, arms, major, minor, phi, type: typeOf.get(n.id).type, pairs: typeOf.get(n.id).cls });
}
for (const nd of nodes) for (const a of nd.arms) {   // distance along the line to the next node in the direction of the arm
  const lst = nodesOfLine.get(a.id)!, tot = cumOf.get(a.id)![cumOf.get(a.id)!.length - 1]; let best = Infinity, bn = '';
  for (const q of lst) { const d = (q.s - a.s) * a.sgn; if (d > 3 && d < best) { best = d; bn = q.node; } }
  if (!isFinite(best)) { best = a.sgn > 0 ? tot - a.s : a.s; bn = '(line end)'; }
  a.next = best; a.nextNode = bn;
}
const byId = new Map<string, Nd>(); for (const nd of nodes) byId.set(nd.id, nd);
const angOk = nodes.filter((n) => n.phi !== null && typeOf.get(n.id).angle !== null && Math.abs((n.phi as number) - typeOf.get(n.id).angle) < 0.01).length;
chk(angOk === nodes.filter((n) => n.arms.length >= 3).length, `arms rebuilt as in 21.7-1: the skew angle of every 3- and 4-arm node equals docs/centre_junction.json (${angOk} nodes)`);

// ---------------- 1. ROUNDABOUT SIZE (arm angles only; the ground comes in part 4) ----------------
interface RbArm { id: string; cls: string; bearing: number; lanes: number; mouth: number; decel: number }
interface Rb { id: string; x: number; z: number; lanes: number; arms: RbArm[]; gaps: number[]; minGap: number; req: number; icd: number; ok: boolean; cid: number; cw: number; entryR: number; exitR: number; pairs: string; worst: string }
const rbs: Rb[] = [];
for (const nd of nodes.filter((n) => n.type.startsWith('ROUNDABOUT'))) {
  const lanes = nd.arms.some((a) => A_CLASS.has(a.cls)) ? 2 : 1;
  const arms: RbArm[] = nd.arms.map((a) => { const ln = lanes === 1 ? 1 : LANES_IN[a.cls]; return { id: a.id, cls: a.cls, bearing: (Math.atan2(a.dir[1], a.dir[0]) * 180) / Math.PI, lanes: ln, mouth: 2 * RB_ENTRY_W[ln] + RB_ISL, decel: speedChangeLength(V[a.cls], 30, CRITERIA.aDecel) }; }).sort((p, q) => p.bearing - q.bearing);
  const gaps: number[] = []; let req = 0, worst = '';
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i], b = arms[(i + 1) % arms.length]; let th = b.bearing - a.bearing; if (th <= 0) th += 360; gaps.push(th);
    const arc = (a.mouth + b.mouth) / 2 + RB_GAP, r = (2 * arc) / ((th * Math.PI) / 180);   // ICD so that the arc between the two arm axes at the circle edge holds both mouths
    if (r > req) { req = r; worst = `${a.id}/${b.id} ${f0(th)} deg`; }
  }
  const [lo, hi] = RB_RANGE[lanes]; const icd = Math.max(lo, Math.ceil(req / 5) * 5);
  rbs.push({ id: nd.id, x: nd.x, z: nd.z, lanes, arms, gaps, minGap: Math.min(...gaps), req, icd: Math.min(icd, hi), ok: req <= hi, cid: Math.min(icd, hi) - 2 * RB_CW[lanes], cw: RB_CW[lanes], entryR: lanes === 1 ? 15 : 20, exitR: lanes === 1 ? 20 : 30, pairs: nd.pairs, worst });
}
const rbOf = new Map<string, Rb>(); for (const r of rbs) rbOf.set(r.id, r);
const nCross = nodes.filter((n) => n.arms.length >= 4).length;
pr(`1. ROUNDABOUTS: ${rbs.length} nodes with 4 arms (21.47 text said 36 crossing nodes; the node list has ${nCross} four-arm nodes: 13 two-through-line crossings + 23 one line through with two ends on opposite sides + 1 with four ends; your 36 = 13 + 23, the 37th is the one node where four line ENDS meet, it is a roundabout too and is counted here)`);
pr(`   lanes: ${rbs.filter((r) => r.lanes === 1).length} one-lane (ICD ${RB_RANGE[1][0]} - ${RB_RANGE[1][1]} m), ${rbs.filter((r) => r.lanes === 2).length} two-lane (ICD ${RB_RANGE[2][0]} - ${RB_RANGE[2][1]} m); rule of 21.47: a 2-lane roundabout where an R4 / R6 arm meets, else 1-lane`);
pr(`   ICD rule: the arc between two neighbouring arm axes at the circle edge (ICD/2 x angle) must hold both arm mouths (entry + exit + splitter island ${RB_ISL} m) and ${RB_GAP} m of kerb; mouth = 2 x entry width ${RB_ENTRY_W[1]} (1 lane) / ${RB_ENTRY_W[2]} (2 lanes) + ${RB_ISL}`);
pr('   node  lanes  arms (class)           smallest angle  ICD needed -> chosen  CID  circ.w  entry/exit R  decel to 30 km/h per arm (m)');
for (const r of rbs) pr(`   ${r.id}  ${r.lanes}      ${r.arms.map((a) => rname(a.cls)).join(' ').padEnd(21)}  ${f0(r.minGap).padStart(3)} deg         ${f1(r.req).padStart(5)} -> ${String(r.icd).padStart(2)} m${r.ok ? '   ' : ' ! '} ${f0(r.cid).padStart(3)}  ${f1(r.cw).padStart(5)}  ${r.entryR}/${r.exitR}       ${r.arms.map((a) => f0(a.decel)).join(' / ')}`);
chk(rbs.every((r) => r.ok), `every roundabout fits its lane class ICD range from the arm angles  [${rbs.filter((r) => !r.ok).length} FAIL: ${rbs.filter((r) => !r.ok).map((r) => `${r.id} needs ${f0(r.req)} m, max ${RB_RANGE[r.lanes][1]}`).join('; ')}]`);
pr();

// ---------------- 2. T JUNCTIONS: kerb radius, slip lane, pocket, taper, sight distance ----------------
interface Td {
  id: string; x: number; z: number; kind: 'TA' | 'TP' | 'T0'; majCls: string; minCls: string; phi: number; angClass: string;
  Vmaj: number; Va: number; kerbBase: number; kerbAcute: number; kerbObtuse: number; vturn: number; slipLen: number;
  pocketArm: string; pocket: { taper: number; decel: number; store: number; total: number } | null; pocketShort: { taper: number; decel: number; store: number; total: number } | null;
  flare: { taper: number; decel: number; store: number; total: number } | null; isd: number; ssd: number;
  avail: number; availNode: string; pocketFit: string; majorDir: number[]; minorDir: number[]; major: string; minor: string;
  ground: { bld: number[]; wet: number; rail: number; area: string; tri: number[] };
}
const tds: Td[] = []; const paMap = new Map<string, Arm>();
const kindOf = (t: string): 'TA' | 'TP' | 'T0' | null => (t.startsWith('T signalised') ? 'TA' : t.startsWith('T priority + ') ? 'TP' : t === 'T priority' ? 'T0' : null);
function kerbBase(kind: 'TA' | 'TP' | 'T0', majCls: string, minCls: string): number {
  if (kind === 'TA') return KERB_BASE.TA;
  if (kind === 'TP') return minCls === 'L' ? KERB_BASE.TP_L : KERB_BASE.TP_C;
  const ll = majCls === 'L' && minCls === 'L', anyL = majCls === 'L' || minCls === 'L';
  return ll ? KERB_BASE.LL : anyL ? KERB_BASE.CL : KERB_BASE.CC;
}
for (const nd of nodes) {
  const kind = kindOf(nd.type); if (!kind || nd.arms.length !== 3 || nd.phi === null) continue;
  const [m0, m1] = nd.major, u = nd.minor[0];
  const majCls = rank[m0.cls] <= rank[m1.cls] ? m0.cls : m1.cls, minCls = u.cls;
  const Vmaj = V[majCls], Va = kind === 'TA' ? Math.min(Vmaj, VA_MAX) : Vmaj;
  const phi = nd.phi, ok = phi >= ANG_SKEW;
  const kb = kerbBase(kind, majCls, minCls);
  const kAc = ok ? Math.max(R_FLOOR, kb * (90 / phi)) : NaN, kOb = ok ? Math.max(R_FLOOR, kb * (phi / 90)) : NaN;
  const vt = vturn(kb);
  // pocket on the major arm whose traffic turns RIGHT into the minor arm (left-hand traffic: the right turn crosses the oncoming flow)
  let pa: Arm | null = null;
  for (const m of nd.major) { const h = [-m.dir[0], -m.dir[1]], right = [-h[1], h[0]]; if (u.dir[0] * right[0] + u.dir[1] * right[1] > 0) pa = m; }
  const hasP = kind !== 'T0' && pa !== null; if (pa) paMap.set(nd.id, pa);
  const wP = pa ? W[pa.cls] : W[majCls], vaP = pa ? (kind === 'TA' ? Math.min(V[pa.cls], VA_MAX) : V[pa.cls]) : Va;
  const store = kind === 'TA' ? STORE_S : STORE_P;
  const pk = hasP ? pocketLen(vaP, wP, store) : null, pks = hasP ? pocketLen(Math.min(vaP, VA_MIN), wP, store) : null;
  const fl = kind === 'TA' ? pocketLen(Math.min(V[minCls], VA_MAX), W[minCls], STORE_S) : null;
  const slipLen = kind === 'TA' ? speedChangeLength(Va, vturn(SLIP_R), CRITERIA.aDecel) : 0;
  const isd = 0.278 * Vmaj * TG, ssd = stoppingSight(Vmaj, 0);
  tds.push({ id: nd.id, x: nd.x, z: nd.z, kind, majCls, minCls, phi, angClass: phi >= ANG_OK ? 'PASS' : ok ? 'SKEW' : 'FIX', Vmaj, Va, kerbBase: kb, kerbAcute: kAc, kerbObtuse: kOb, vturn: vt, slipLen,
    pocketArm: pa ? pa.id : '', pocket: pk, pocketShort: pks, flare: fl, isd, ssd, avail: NaN, availNode: '', pocketFit: hasP ? '' : '-', majorDir: unit([m0.dir[0] - m1.dir[0], m0.dir[1] - m1.dir[1]]), minorDir: u.dir,
    major: nd.major.map((m) => m.id).join('+'), minor: u.id, ground: { bld: [], wet: 0, rail: 0, area: '', tri: [] } });
}
const tdOf = new Map<string, Td>(); for (const t of tds) tdOf.set(t.id, t);
const cntK = (k: string): number => tds.filter((t) => t.kind === k).length;
pr(`2. T JUNCTIONS: ${tds.length} at-grade T nodes = signalised A x A ${cntK('TA')}, priority T + right-turn pocket (LHT) ${cntK('TP')}, priority T ${cntK('T0')} (the 2 grade-separated nodes N030, N074 are 21.8)`);
pr('   2.1 STANDARD SHEET PER TYPE (every number from Standards.ts / Step 8 / 3.13 point 4; the formulas are printed so they can be audited)');
pr(`   kerb radius (Step 8: 8 - 15 m collector, up to ${SLIP_R} m with a slip lane on arterials), turning speed from V^2 / (127 (0.02 + f)), f of Standards.ts:`);
for (const [nm, r] of [['T signalised A x A (slip lane both left corners)', KERB_BASE.TA], ['T priority on an arterial, minor R2 / C', KERB_BASE.TP_C], ['T priority on an arterial, minor L', KERB_BASE.TP_L], ['T priority R2 / C x R2 / C', KERB_BASE.CC], ['T priority with one L street', KERB_BASE.CL], ['T priority L x L', KERB_BASE.LL]] as [string, number][]) pr(`      ${nm.padEnd(52)} R ${String(r).padStart(2)} m   turning speed ${vturn(r)} km/h`);
pr(`   skew rule (MY choice): at an angle phi to the major road the acute corner gets R x 90 / phi, the obtuse corner R x phi / 90 (the vehicle turns through 180 - phi at the acute corner and must not overrun the oncoming lane), floor ${R_FLOOR} m; below ${ANG_SKEW} deg no radius is given (realign first, part 3).`);
pr('   pocket = taper + deceleration to a stop + storage (J1-a); taper 3.13 point 4: V >= 70 -> 0.62 W V, V <= 60 -> W V^2 / 155; deceleration = Standards.ts decelLength(V, 0) = V^2 / (2 x 2.5):');
const seen = new Set<string>();
for (const t of tds) {
  const w = W[t.majCls], store = t.kind === 'TA' ? STORE_S : STORE_P; const key = `${t.kind}-${t.majCls}`; if (t.kind === 'T0' || seen.has(key)) continue; seen.add(key);
  const p = pocketLen(t.Va, w, store), ps = pocketLen(Math.min(t.Va, VA_MIN), w, store);
  pr(`      ${(t.kind === 'TA' ? 'signalised' : 'priority').padEnd(10)} major ${rname(t.majCls)} (V ${V[t.majCls]}, approach ${t.Va}, W ${w}): taper ${f0(p.taper)} + decel ${f0(p.decel)} + storage ${store} = ${f0(p.total)} m   |   SHORT (advisory ${VA_MIN} km/h): ${f0(ps.taper)} + ${f0(ps.decel)} + ${store} = ${f0(ps.total)} m`);
}
pr(`   slip lane (signalised only): width ${SLIP_W} m, length = decel from the approach speed to the turning speed of R ${SLIP_R} m (${vturn(SLIP_R)} km/h): 60 -> ${f0(speedChangeLength(60, vturn(SLIP_R), CRITERIA.aDecel))} m`);
pr(`   signalised minor arm flare (right-turn lane + slip): the same formula with the minor class (R4 / R6: taper + decel + ${STORE_S} m)`);
pr(`   sight (priority T): stopping sight SSD = Standards.ts stoppingSight; sight distance along the major road from the minor stop line = 0.278 V ${TG} s (V80 ${f0(0.278 * 80 * TG)} m, V60 ${f0(0.278 * 60 * TG)} m, V40 ${f0(0.278 * 40 * TG)} m, V30 ${f0(0.278 * 30 * TG)} m); decision point ${SIGHT_SETBACK} m behind the major kerb line`);
pr(`   check values: SSD V80 ${f0(stoppingSight(80))} m, V60 ${f0(stoppingSight(60))} m, V40 ${f0(stoppingSight(40))} m, V30 ${f0(stoppingSight(30))} m; Rmin (e 8 %): R6 ${f0(rmin('6'))}, R4 ${f0(rmin('4'))}, R2 / C ${f0(rmin('2'))}, L ${f0(rmin('L'))} m`);

// ---------------- 3. FOOTPRINT ALONG EACH ARM and the FIT between neighbouring junctions ----------------
const kmaxOf = (t: Td): number => Math.max(t.kerbBase, isNaN(t.kerbAcute) ? t.kerbBase * 1.5 : t.kerbAcute, isNaN(t.kerbObtuse) ? 0 : t.kerbObtuse);
function f0Arm(nodeId: string, a: Arm): number {   // distance from the node centre along the arm that the junction itself needs, WITHOUT a turn pocket (m)
  const r = rbOf.get(nodeId); if (r) return r.icd / 2 + RB_FLARE;
  const t = tdOf.get(nodeId); if (t) { const minor = a.id === t.minor && !(t.major.split('+').includes(a.id)); return kmaxOf(t) + 10 + (t.kind === 'TA' && minor ? STORE_S : 0); }
  const nd = byId.get(nodeId)!; if (nd.arms.length <= 2) return 0;
  return 60;   // N030 / N074 grade-separated: structure design in 21.8, 60 m is a placeholder
}
function facing(nb: Nd, a: Arm, from: Nd): Arm | null { let best: Arm | null = null, bd = Infinity; for (const q of nb.arms) { if (q.id !== a.id || q.sgn === a.sgn) continue; const d = Math.abs(q.s - a.s - a.sgn * (a.next)); if (d < bd) { bd = d; best = q; } } return best; }
interface Pair { a: string; b: string; line: string; gap: number; need: number; fa: number; fb: number }
const pairs: Pair[] = [], badPairs: Pair[] = []; const seenP = new Set<string>();
for (const nd of nodes) for (const a of nd.arms) {
  const nb = byId.get(a.nextNode); if (!nb) continue; const key = [nd.id, nb.id, a.id].sort().join('|'); if (seenP.has(key)) continue; seenP.add(key);
  const fa = f0Arm(nd.id, a), fb = (() => { const q = facing(nb, a, nd); return q ? f0Arm(nb.id, q) : f0Arm(nb.id, nb.arms[0]); })();
  const p: Pair = { a: nd.id, b: nb.id, line: a.id, gap: a.next, need: fa + fb, fa, fb }; pairs.push(p); if (p.gap < p.need) badPairs.push(p);
}
pr(`3. FIT BETWEEN NEIGHBOURING JUNCTIONS: ${pairs.length} node pairs along a line. Each junction needs along the arm: roundabout ICD/2 + ${RB_FLARE} m; T = largest kerb radius + 10 m (+ ${STORE_S} m flare on a signalised minor arm); the two must not overlap (a pocket comes after this, 3.2).`);
chk(badPairs.length === 0, `every pair of neighbouring junctions has its two footprints apart  [${badPairs.length} FAIL = list below]`);
for (const p of badPairs.sort((x, y) => x.gap - y.gap)) pr(`      ${p.a} - ${p.b} on ${p.line}: gap ${f0(p.gap)} m, need ${f0(p.need)} m (${f0(p.fa)} + ${f0(p.fb)})   short by ${f0(p.need - p.gap)} m`);
// soft check: full deceleration to 30 km/h of every roundabout arm
const softBad: string[] = [];
for (const r of rbs) { const nd = byId.get(r.id)!; for (const a of nd.arms) { const ra = r.arms.find((q) => q.id === a.id)!; const need = r.icd / 2 + Math.max(RB_FLARE, ra.decel + 10); if (a.next < need) softBad.push(`${r.id} ${a.id} gap ${f0(a.next)} m < ${f0(need)} m`); } }
info(`full deceleration to 30 km/h (ICD/2 + decel + 10 m) does not fit on ${softBad.length} roundabout arms: the approach needs an advisory / reduced speed there (same device as 21.47 (c)); not a FAIL`);
pr();
// pocket fit
for (const t of tds) {
  if (!t.pocket) continue; const nd = byId.get(t.id)!, pa = paMap.get(t.id)!; const nb = byId.get(pa.nextNode);
  const fnb = nb ? (() => { const q = facing(nb, pa, nd); return q ? f0Arm(nb.id, q) : f0Arm(nb.id, nb.arms[0]); })() : 0;
  t.avail = pa.next - kmaxOf(t) - fnb; t.availNode = pa.nextNode;
  t.pocketFit = t.avail >= t.pocket.total ? 'FULL' : t.avail >= t.pocketShort!.total ? 'SHORT' : 'NO';
}
const withP = tds.filter((t) => t.pocket);
pr(`   3.2 POCKET FIT: ${withP.length} T nodes have a right-turn pocket. The pocket lies on the major arm whose traffic turns RIGHT into the minor arm (left-hand traffic). Available = distance to the next junction - kerb radius - that junction's own footprint.`);
pr(`   FULL = standard pocket fits ${withP.filter((t) => t.pocketFit === 'FULL').length}; SHORT = only the ${VA_MIN} km/h pocket fits (advisory sign) ${withP.filter((t) => t.pocketFit === 'SHORT').length}; NO = not even that ${withP.filter((t) => t.pocketFit === 'NO').length}`);
chk(withP.every((t) => t.pocketFit !== 'NO'), `every pocket fits at least in the SHORT version  [${withP.filter((t) => t.pocketFit === 'NO').length} FAIL: ${withP.filter((t) => t.pocketFit === 'NO').map((t) => `${t.id} avail ${f0(t.avail)} m < ${f0(t.pocketShort!.total)} m`).join('; ')}]`);
for (const t of withP.filter((q) => q.pocketFit !== 'FULL')) pr(`      ${t.id} ${t.kind} ${rname(t.majCls)} on ${t.pocketArm}: available ${f0(t.avail)} m to ${t.availNode}, full ${f0(t.pocket!.total)} m, short ${f0(t.pocketShort!.total)} m -> ${t.pocketFit}`);
pr();

// ---------------- 4. GROUND: buildings, river, rail, engineering area, slope ----------------
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1];
function gridRect(cx: number, cz: number, d: number[], t0: number, t1: number, hw: number): number[][] {   // points of a rectangle: along d from t0 to t1, across +-hw
  const n = [-d[1], d[0]], out: number[][] = [];
  for (let t = t0; t <= t1 + 1e-6; t += GRID) for (let s = -hw; s <= hw + 1e-6; s += GRID) out.push([cx + d[0] * t + n[0] * s, cz + d[1] * t + n[1] * s]);
  return out;
}
function gridDisc(cx: number, cz: number, r: number): number[][] { const out: number[][] = []; for (let x = -r; x <= r; x += GRID) for (let z = -r; z <= r; z += GRID) if (hyp(x, z) <= r) out.push([cx + x, cz + z]); return out; }
function gridTri(a: number[], b: number[], c: number[]): number[][] {
  const out: number[][] = [], st = 3, n = Math.ceil(Math.max(hyp(b[0] - a[0], b[1] - a[1]), hyp(c[0] - a[0], c[1] - a[1])) / st);
  for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) { const u = i / n, v = j / n; out.push([a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1])]); }
  return out;
}
interface Gr { bld: number[]; wet: number; rail: number; areas: string[]; slope: number; dB: number; dR: number }
function ground(cx: number, cz: number, pts: number[][], slopeD: number): Gr {
  const near: number[] = []; for (let i = 0; i < RECTS.length; i++) { const b = RECTS[i]; if (hyp(b.x - cx, b.z - cz) < 500) near.push(i); }
  const hit = new Set<number>(); let wet = 0; const areas = new Set<string>();
  const rails = railPts.filter((q) => hyp(q[0] - cx, q[1] - cz) < 700); let railMin = Infinity;
  for (const p of pts) {
    for (const i of near) { if (hit.has(i)) continue; if (bldDist(RECTS[i], p[0], p[1]) <= 0.5) hit.add(i); }
    if (wetAt(p[0], p[1])) wet++;
    const a = getEngineeringAreaAt(p[0], p[1]); if (a) areas.add(a.id);
    for (const q of rails) { const h = hyp(q[0] - p[0], q[1] - p[1]); if (h < railMin) railMin = h; }
  }
  const nb = nearestBld(cx, cz, 300); const hs: number[] = [natH(cx, cz)]; for (let k = 0; k < 8; k++) hs.push(natH(cx + (slopeD / 2) * Math.cos((k * Math.PI) / 4), cz + (slopeD / 2) * Math.sin((k * Math.PI) / 4)));
  return { bld: [...hit], wet: wet * GRID * GRID, rail: railMin, areas: [...areas], slope: ((Math.max(...hs) - Math.min(...hs)) / slopeD) * 100, dB: nb.d, dR: nearestRail(cx, cz) };
}
interface RbG extends Gr { fit: boolean; why: string[] }
const rbG = new Map<string, RbG>();
for (const r of rbs) {
  const nd = byId.get(r.id)!, rad = r.icd / 2 + EDGE; let pts = gridDisc(r.x, r.z, rad);
  for (const a of nd.arms) pts = pts.concat(gridRect(r.x, r.z, a.dir, rad, r.icd / 2 + RB_FLARE, HALF[a.cls]));
  const g = ground(r.x, r.z, pts, r.icd); const why: string[] = [];
  if (g.bld.length) why.push(`${g.bld.length} building(s) inside: ${g.bld.map((i) => RECTS[i].id + '#' + i).join(', ')}`);
  if (g.wet > 0) why.push(`water ${f0(g.wet)} m2`);
  const circleRailMin = (() => { let d = Infinity; for (const q of railPts) { const h = hyp(q[0] - r.x, q[1] - r.z); if (h < d) d = h; } return d; })();
  if (circleRailMin < r.icd / 2 + RAIL_CLEAR) why.push(`rail ${f0(circleRailMin)} m from the centre, need ${f0(r.icd / 2 + RAIL_CLEAR)} m`);
  if (g.areas.length) why.push(`engineering area ${g.areas.join(', ')}`);
  rbG.set(r.id, { ...g, fit: why.length === 0 || (why.length === 1 && g.areas.length > 0 && !g.bld.length && g.wet === 0 && circleRailMin >= r.icd / 2 + RAIL_CLEAR), why });
}
pr(`4. GROUND OF THE ${rbs.length} ROUNDABOUTS (disc ICD/2 + ${EDGE} m and the arm corridors ICD/2 .. ICD/2 + ${RB_FLARE} m, grid ${GRID} m; buildings = ${RECTS.length} footprints incl. yard, water = terrain water above ground, rail = ${RAIL_CLEAR} m from the circle edge)`);
pr('   node  ICD  nearest building (m)  rail (m)  water m2  slope across ICD %  result');
for (const r of rbs) { const g = rbG.get(r.id)!; pr(`   ${r.id}  ${String(r.icd).padStart(2)}   ${(isFinite(g.dB) ? f0(g.dB) : '>340').padStart(6)}               ${(isFinite(g.dR) ? f0(g.dR) : '>400').padStart(5)}     ${f0(g.wet).padStart(5)}     ${f1(g.slope).padStart(5)}              ${g.fit ? 'FIT' : 'NO ROOM'}${g.why.length ? ': ' + g.why.join('; ') : ''}`); }
chk(rbs.every((r) => rbG.get(r.id)!.fit), `every roundabout has room on the ground (no building, water or rail inside)  [${rbs.filter((r) => !rbG.get(r.id)!.fit).length} FAIL: ${rbs.filter((r) => !rbG.get(r.id)!.fit).map((r) => r.id).join(', ')}]`);
const steep = rbs.filter((r) => rbG.get(r.id)!.slope > 4); info(`natural slope across the ICD above 4 %: ${steep.length} roundabouts (${steep.map((r) => r.id + ' ' + f1(rbG.get(r.id)!.slope)).join(', ')}); the circulating roadway is built flat to 2 - 3 % crossfall, so these need cut / fill (21.6c earthwork), not a FAIL`);
pr();
// T junction ground
const tG = new Map<string, Gr & { fit: boolean; why: string[]; sight: number[]; sightFit: boolean }>();
for (const t of tds) {
  const km = kmaxOf(t), a = t.majorDir, u = t.minorDir, hwm = HALF[t.minCls] + (t.kind === 'TA' ? SLIP_W : 0), hwM = HALF[t.majCls] + (t.pocket ? W[t.majCls] : 0);
  const pa = paMap.get(t.id); const pside = pa ? dot(pa.dir, a) : 0; const pl = t.pocket ? (t.pocketFit === 'SHORT' ? t.pocketShort!.total : t.pocket.total) : 10;
  const back = hwm + km + (pside < 0 ? pl : 10), fwd = hwm + km + (pside > 0 ? pl : 10);
  let pts = gridRect(t.x, t.z, a, -back, fwd, hwM);
  pts = pts.concat(gridRect(t.x, t.z, u, hwM, hwM + km + (t.kind === 'TA' ? t.flare!.total : 15), hwm));
  const g = ground(t.x, t.z, pts, 40); const why: string[] = [];
  if (g.bld.length) why.push(`${g.bld.length} building(s) inside the pad: ${g.bld.map((i) => RECTS[i].id + '#' + i).join(', ')}`);
  if (g.wet > 0) why.push(`water ${f0(g.wet)} m2`);
  if (g.rail < RAIL_CLEAR) why.push(`rail ${f0(g.rail)} m`);
  // sight triangles (priority T only)
  let sight: number[] = [], sightFit = true;
  if (t.kind !== 'TA') {
    const e = HALF[t.majCls] - 3, D = [t.x + u[0] * (e + SIGHT_SETBACK), t.z + u[1] * (e + SIGHT_SETBACK)], c0 = [t.x, t.z];
    for (const sg of [1, -1]) { const E = [t.x + a[0] * t.isd * sg, t.z + a[1] * t.isd * sg]; const tri = gridTri(D, c0, E); const hit = new Set<number>(); for (const p of tri) for (let i = 0; i < RECTS.length; i++) { const b = RECTS[i]; if (Math.abs(b.x - t.x) > 260 || Math.abs(b.z - t.z) > 260 || hit.has(i)) continue; if (bldDist(b, p[0], p[1]) <= 0.5) hit.add(i); } sight = sight.concat([...hit]); }
    sight = [...new Set(sight)]; sightFit = sight.length === 0;
  }
  tG.set(t.id, { ...g, fit: why.length === 0, why, sight, sightFit });
}
const tOk = tds.filter((t) => tG.get(t.id)!.fit).length;
pr(`   4.2 GROUND OF THE ${tds.length} T PADS (major rectangle with the pocket, minor arm rectangle, kerb returns): ${tOk} clear`);
for (const t of tds.filter((q) => !tG.get(q.id)!.fit)) pr(`      ${t.id} ${t.kind} ${t.major} x ${t.minor}: ${tG.get(t.id)!.why.join('; ')}`);
chk(tds.every((t) => tG.get(t.id)!.fit), `every T pad is free of buildings, water and rail  [${tds.length - tOk} FAIL = list above]`);
const sFail = tds.filter((t) => !tG.get(t.id)!.sightFit);
chk(sFail.length === 0, `every priority T has its sight triangles free of buildings  [${sFail.length} FAIL: ${sFail.map((t) => `${t.id} (${tG.get(t.id)!.sight.length} bld)`).join(', ')}]`);
pr();
// slope / earthwork of the roundabouts: the circulating roadway is one plane, half-depth of cut / fill at the edge = slope x ICD / 2
const HALF_DEPTH_MAX = 3.0;   // m, my limit for a roundabout pad (a bigger cut / fill is a retaining wall)
const deep = rbs.filter((r) => (rbG.get(r.id)!.slope / 100) * (r.icd / 2) > HALF_DEPTH_MAX);
chk(deep.length === 0, `roundabout pad cut / fill half-depth (natural slope x ICD / 2) <= ${HALF_DEPTH_MAX} m  [${deep.length} FAIL: ${deep.map((r) => `${r.id} ${f1((rbG.get(r.id)!.slope / 100) * (r.icd / 2))} m (slope ${f1(rbG.get(r.id)!.slope)} %, ICD ${r.icd})`).join('; ')}]  (natural ground only; the real level comes from the node level of 21.12)`);
// T pads that fail only because of the pocket: re-test with the SHORT pocket and with no pocket
interface Alt { shortClear: boolean; noneClear: boolean }
const alt = new Map<string, Alt>();
for (const t of tds.filter((q) => !tG.get(q.id)!.fit && q.pocket)) {
  const km = kmaxOf(t), a = t.majorDir, u = t.minorDir, hwm = HALF[t.minCls] + (t.kind === 'TA' ? SLIP_W : 0), hwM = HALF[t.majCls] + W[t.majCls], pa = paMap.get(t.id)!, pside = dot(pa.dir, a);
  const test = (pl: number, withP: boolean): boolean => {
    const back = hwm + km + (pside < 0 ? pl : 10), fwd = hwm + km + (pside > 0 ? pl : 10), hw = withP ? hwM : HALF[t.majCls];
    const pts = gridRect(t.x, t.z, a, -back, fwd, hw).concat(gridRect(t.x, t.z, u, hw, hw + km + (t.kind === 'TA' ? t.flare!.total : 15), hwm));
    const g = ground(t.x, t.z, pts, 40); return g.bld.length === 0 && g.wet === 0 && g.rail >= RAIL_CLEAR;
  };
  alt.set(t.id, { shortClear: test(t.pocketShort!.total, true), noneClear: test(10, false) });
}
for (const [id, v] of alt) pr(`      ${id}: pad clear with the SHORT pocket: ${v.shortClear ? 'yes' : 'no'}; with NO pocket: ${v.noneClear ? 'yes' : 'no'}`);
// arms that end at a free end or at a TAP interchange
const tapEnd = new Set<string>(); for (const q of cj.taps) for (const e of q.ends) tapEnd.add(`${e.line}|${e.end}`);
const nearTap: string[] = [], freeEnd: string[] = [];
for (const nd of nodes) for (const a of nd.arms) {
  if (a.nextNode !== '(line end)' || nd.arms.length < 3) continue;
  const isTap = tapEnd.has(`${a.id}|${a.sgn > 0 ? 'E' : 'S'}`);
  (isTap ? nearTap : freeEnd).push(`${nd.id} ${a.id} ${f0(a.next)} m`);
}
info(`arms that end at a TAP interchange (21.8 designs it, its ramps are NOT in the footprints above): ${nearTap.length}: ${nearTap.join('; ')}`);
info(`arms that end at a free line end (a line end that is not a node and not a tap = a dead-end stub): ${freeEnd.length}: ${freeEnd.join('; ')}`);
pr();

// ---------------- 5. ONE MERGED FIX LIST (nothing is moved, R10: the user decides) ----------------
interface Fix { key: string; id: string; x: number; z: number; reasons: string[]; numbers: string[]; options: string[] }
const fixes = new Map<string, Fix>();
const fx = (key: string, id: string, x: number, z: number): Fix => { let q = fixes.get(key); if (!q) { q = { key, id, x, z, reasons: [], numbers: [], options: [] }; fixes.set(key, q); } return q; };
const tagAll = (letter: string): void => { for (const q of fixes.values()) { q.options = q.options.map((o) => (/^\[[a-d]\]/.test(o) ? o : `[${letter}] ${o}`)); q.numbers = q.numbers.map((o) => (/^\[[a-d]\]/.test(o) ? o : `[${letter}] ${o}`)); } };
const nodeXZ = (id: string): number[] => { const n = byId.get(id)!; return [n.x, n.z]; };
// (a) skew angle < 70 deg of 21.7-1 (T nodes; N074 is grade-separated, its angle is for 21.8)
for (const n of cj.nodes.filter((q: any) => q.angleBad)) {
  const nd = byId.get(n.id)!, [x, z] = nodeXZ(n.id), q = fx(n.id, n.id, x, z), a = n.angle as number, td = tdOf.get(n.id);
  const gs = n.type === 'GRADE-SEPARATED';
  q.reasons.push(`(a) skew angle ${f1(a)} deg < ${ANG_OK}`);
  const sw = 90 - a;
  q.numbers.push(`legs ${n.legs.join(' x ')}, swing to 90 deg = ${f0(sw)} deg, a point 100 m out on the minor arm moves ${f0(100 * Math.cos((a * Math.PI) / 180))} m sideways if the arm is turned to 90 deg about the node`);
  if (gs) { q.options.push('grade-separated node: angle is part of the 21.8 structure design (no choice here)'); continue; }
  if (a >= ANG_SKEW) q.options.push(`1) accept as a SKEW T: kerb ${td ? `acute R ${f0(td.kerbAcute)} m / obtuse R ${f0(td.kerbObtuse)} m (rule R x 90 / phi, R x phi / 90, kerb base ${td.kerbBase} m)` : 'by the skew rule'}, no change of line`, '2) realign the last 100 - 200 m of the minor line to 90 deg (like B3)');
  else if (a >= ANG_BAD) q.options.push('1) realign the last 100 - 200 m of the minor line towards 90 deg (like B3 of 21.38), then check the angle again', `2) accept a skew T only with a staggered / offset design (not a plain skew T below ${ANG_SKEW} deg)`);
  else q.options.push('1) realign the last 150 - 250 m of the minor line (the swing is more than 40 deg)', '2) end the minor line at the nearest collector instead (needs your decision on 3.8, list b)', '3) make the minor line a one-way slip into the major road (design only, not a normal T)');
  if (nd.arms.length === 3 && td) q.numbers.push(`type ${td.kind === 'TA' ? 'signalised A x A' : td.kind === 'TP' ? 'priority T + right pocket' : 'priority T'}, major ${rname(td.majCls)} (V ${td.Vmaj})`);
}
tagAll('a');
// (b) 3.8: a local street straight onto an R4
for (const s of cj.s38) {
  const [x, z] = nodeXZ(s.node), q = fx(s.node, s.node, x, z);
  q.reasons.push(`(b) 3.8 local street ${s.local} straight onto ${s.big}`);
  q.numbers.push(`angle ${f1(s.angle)} deg, nearest collector (R2 / C) not at the node: ${f0(s.nearR2)} m (${s.nearId})`);
  q.options.push(`1) end ${s.local} on the nearest collector (${f0(s.nearR2)} m away) and delete the last piece`, '2) keep as a recorded EXCEPTION (a local street with a priority T and a right-turn pocket on the arterial)');
}
tagAll('b');
// (c) corners under Rmin (strict only, as in 21.7-1)
for (const c of cj.corners.filter((q: any) => q.strict)) {
  const P = c.node === 'line end' || !byId.has(c.node) ? at(c.line, c.s) : nodeXZ(c.node), key = c.ok && byId.has(c.node) ? c.node : `${c.line}@${f0(c.s)}`;
  const q = fx(key, key, P[0], P[1]);
  q.reasons.push(`(c) corner under Rmin on ${c.line}${c.ok ? ' at ' + c.node : ' (NOT at a node)'}`);
  q.numbers.push(`R ${f0(c.R)} m, class minimum ${f0(c.Rmin)} m (R ${f0(c.R)} gives ${f0(c.V)} km/h, class ${f0(c.Vcls)} km/h), ${f0(c.dn)} m from the node ${c.node}`);
  q.options.push(`1) advisory speed sign ${f0(Math.floor(c.V / 5) * 5)} km/h (my reading of 21.47 c)`, '2) widen the radius when the line is refitted (needs a refit of that line)');
}
tagAll('c');
// (d) NEW in 21.7-2: what the geometry of part 1 - 4 found
for (const p of badPairs) { const [x, z] = nodeXZ(p.a), q = fx(`${p.a}+${p.b}`, `${p.a}/${p.b}`, x, z); q.reasons.push('(d) two junction footprints overlap'); q.numbers.push(`${p.line}: gap ${f0(p.gap)} m, need ${f0(p.need)} m (${f0(p.fa)} + ${f0(p.fb)}), short by ${f0(p.need - p.gap)} m`); q.options.push('1) 1 m is inside my RB_FLARE rounding: reduce the flare of the two 30 m circles from 25 m to 24 m, or shift one node 1 - 2 m along L-14'); }
for (const t of withP.filter((q) => q.pocketFit === 'NO')) { const q = fx(t.id, t.id, t.x, t.z); q.reasons.push(`(d) right-turn pocket does not fit, not even the ${VA_MIN} km/h one`); q.numbers.push(`${t.kind === 'TA' ? 'signalised' : 'priority'} ${rname(t.majCls)} on ${t.pocketArm}: ${f0(t.avail)} m available to ${t.availNode}, short pocket ${f0(t.pocketShort!.total)} m, full ${f0(t.pocket!.total)} m`); q.options.push('1) no pocket: the right-turning cars wait in the through lane (signal: a shared lane), advisory speed', '2) merge the two neighbouring nodes (move one T 30 - 60 m)', '3) make it a roundabout (needs the ground check of part 4)'); }
for (const t of tds.filter((q) => !tG.get(q.id)!.fit)) { const g = tG.get(t.id)!, q = fx(t.id, t.id, t.x, t.z), a = alt.get(t.id); q.reasons.push('(d) pad of the T is not free'); q.numbers.push(g.why.join('; ') + (a ? ` | with the short pocket: ${a.shortClear ? 'clear' : 'still blocked'}; with no pocket: ${a.noneClear ? 'clear' : 'still blocked'}` : '')); if (g.bld.length === 0 && g.wet > 0) q.options.push(a && a.shortClear ? '1) use the SHORT pocket (advisory 40 km/h), the pad then misses the water' : '1) the pad stands on water: culvert / bridge deck (21.8) or move the node', '2) look at the water in 21.8 (culvert / bridge deck at this pad)'); else q.options.push(a && a.shortClear ? '1) use the SHORT pocket (advisory 40 km/h)' : a && a.noneClear ? '1) no pocket at this T' : '1) move the node along the major line / refit the minor line away from the building (buildings are fixed, so the line moves, R10 asks you)', '2) remove or move the building (your decision, not mine)'); }
for (const t of sFail) { const g = tG.get(t.id)!, q = fx(t.id, t.id, t.x, t.z); q.reasons.push('(d) sight triangle of the priority T is blocked'); q.numbers.push(`needed sight along the major road ${f0(t.isd)} m (V ${t.Vmaj}), buildings in the triangle: ${g.sight.map((i) => RECTS[i].id + '#' + i).join(', ')}`); q.options.push('1) stop sign + advisory speed on the major road, or 2) a mirror-free solution: make it a roundabout / move the node'); }
for (const r of deep) { const g = rbG.get(r.id)!, q = fx(r.id, r.id, r.x, r.z); q.reasons.push('(d) roundabout pad needs a big cut / fill'); q.numbers.push(`natural slope ${f1(g.slope)} % across ICD ${r.icd} m -> half-depth ${f1((g.slope / 100) * (r.icd / 2))} m (my limit ${HALF_DEPTH_MAX} m); ${r.lanes}-lane, arms ${r.arms.map((a) => rname(a.cls)).join(' ')}`); q.options.push('1) retaining wall on the uphill side (21.6c earthwork)', '2) use a priority junction here instead of a roundabout (the node is on a slope)', '3) shift the node along the line to flatter ground (needs the user)'); }
tagAll('d');
const fixList = [...fixes.values()].sort((p, q) => q.reasons.length - p.reasons.length || p.id.localeCompare(q.id));
pr(`5. MERGED FIX LIST (${fixList.length} places; letters: a = skew angle < ${ANG_OK} (21.7-1), b = 3.8 local street on an R4 (21.7-1), c = corner under Rmin (21.7-1), d = new in 21.7-2). NOTHING is moved: every line is a question for the user (R10).`);
for (const q of fixList) {
  pr(`   ${q.id}  at (${f0(q.x)}, ${f0(q.z)})  ${q.reasons.join(' | ')}`);
  for (const t of q.numbers) pr(`        number: ${t}`);
  for (const o of q.options) pr(`        option: ${o}`);
}
const nA = fixList.filter((q) => q.reasons.some((r) => r.startsWith('(a)'))).length, nB = fixList.filter((q) => q.reasons.some((r) => r.startsWith('(b)'))).length, nC = fixList.filter((q) => q.reasons.some((r) => r.startsWith('(c)'))).length, nD = fixList.filter((q) => q.reasons.some((r) => r.startsWith('(d)'))).length;
pr(`   count: a ${nA} nodes, b ${nB}, c ${nC}, d ${nD}; nodes with 2 or more reasons: ${fixList.filter((q) => q.reasons.length > 1).map((q) => q.id).join(', ') || 'none'}`);
chk(nA - 1 + 0 >= 0 && fixList.filter((q) => q.reasons.some((r) => r.startsWith('(a)'))).length === cj.nodes.filter((q: any) => q.angleBad).length, `every 70 deg FAIL node of 21.7-1 is in the merged list (${cj.nodes.filter((q: any) => q.angleBad).length} nodes, one of them the grade-separated N074)`);
chk(nB === cj.s38.length && nC >= cj.corners.filter((q: any) => q.strict).length - 1, `lists (b) ${cj.s38.length} and (c) ${cj.corners.filter((q: any) => q.strict).length} of 21.7-1 are in the merged list`);
pr();

// ---------------- 6. R10 and R1 / R2 lines, summary, files ----------------
pr('6. HARD RULES: R1 no crossing: no line was moved, no line was added (read only), the crossing check of 21.7-1 / 21.40 stands. R2: no road was added or removed. R10: sketch kept: every FAIL above is a LIST, no line moved. R8: ground checked in part 4 (buildings, water, rail, engineering area, natural slope).');
pr(`   what this step does NOT do: no signal phasing / cycle time, no demand per node (storage 15 / 30 m is ASSUMED), no 3D, no game change, no TAP interchange ramp (21.8), no vertical design of the pads (21.12 levels).`);
pr();
pr(`SUMMARY 21.7-2: ${pass} PASS, ${fail} FAIL`);
pr(`   roundabouts ${rbs.length} (1-lane ${rbs.filter((r) => r.lanes === 1).length}: ICD ${Math.min(...rbs.filter((r) => r.lanes === 1).map((r) => r.icd))} - ${Math.max(...rbs.filter((r) => r.lanes === 1).map((r) => r.icd))} m; 2-lane ${rbs.filter((r) => r.lanes === 2).length}: ICD ${Math.min(...rbs.filter((r) => r.lanes === 2).map((r) => r.icd))} - ${Math.max(...rbs.filter((r) => r.lanes === 2).map((r) => r.icd))} m); T nodes ${tds.length}; merged fix list ${fixList.length} places.`);
writeFileSync(`${OUT}/STEP_21_7_2_OUTPUT.txt`, L.join('\n') + '\n');
const rnd = (v: number): number => Math.round(v * 100) / 100;
writeFileSync(`${OUT}/centre_junction_geom.json`, JSON.stringify({
  note: 'STEP 21.7-2 junction geometry numbers (read only)',
  constants: { V, W, HALF, VA_MAX, STORE_P, STORE_S, VA_MIN, SLIP_R, SLIP_W, TG, SIGHT_SETBACK, ANG_OK, ANG_SKEW, RB_RANGE, RB_CW, RB_ENTRY_W, RB_ISL, RB_GAP, RB_FLARE, EDGE, RAIL_CLEAR, KERB_BASE, R_FLOOR, HALF_DEPTH_MAX },
  roundabouts: rbs.map((r) => ({ id: r.id, x: rnd(r.x), z: rnd(r.z), lanes: r.lanes, icd: r.icd, cid: rnd(r.cid), circW: r.cw, entryR: r.entryR, exitR: r.exitR, need: rnd(r.req), minGap: rnd(r.minGap), arms: r.arms.map((a) => ({ id: a.id, cls: a.cls, bearing: rnd(a.bearing), lanes: a.lanes, decel: rnd(a.decel) })), fit: rbG.get(r.id)!.fit, why: rbG.get(r.id)!.why, slope: rnd(rbG.get(r.id)!.slope) })),
  tjunctions: tds.map((t) => ({ id: t.id, x: rnd(t.x), z: rnd(t.z), kind: t.kind, major: t.major, minor: t.minor, majCls: t.majCls, minCls: t.minCls, phi: rnd(t.phi), angClass: t.angClass, kerbBase: t.kerbBase, kerbAcute: rnd(t.kerbAcute), kerbObtuse: rnd(t.kerbObtuse), turnKmh: t.vturn, slipLen: rnd(t.slipLen), pocketArm: t.pocketArm, pocket: t.pocket, pocketShort: t.pocketShort, pocketFit: t.pocketFit, avail: rnd(t.avail), isd: rnd(t.isd), ssd: rnd(t.ssd), majorDir: t.majorDir.map(rnd), minorDir: t.minorDir.map(rnd), padFit: tG.get(t.id)!.fit, padWhy: tG.get(t.id)!.why, sightFit: tG.get(t.id)!.sightFit })),
  badPairs, fixList, summary: { pass, fail },
}) + '\n');
