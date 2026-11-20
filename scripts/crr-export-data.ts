// STEP CRR-6 (hub ring, user: 'railway er center cross ta te road aktu ghure ghure jabe', circle 8 of his sketch 2): adds the closed ring RR-HUB (centre Central station (0, 300), R 70 m = exactly where the 5 corridor roads started)
//   as the FIRST piece (kind 'ring'), and the 5 roads now start at the ring's outer edge (T, height pinned to the ring). Everything else of the data is unchanged.
// STEP CRR-5b (headless, writes src/roads/crr/CorridorRoadData.ts): the FIXED centreline data of the 5 rail-corridor roads for the game.
// Run: npx tsx scripts/crr-export-data.ts docs      (needs docs/city_rail_road_reach.json (crr1b) + docs/city_rail_road_loops.json (crr1b, with `geo`) )
// Order of work (user rule: the WATER CHECK runs first): 1) water check of every point +-(11.2 + 3) m with the full ground sampler (sc.water > sc.h - 0.3), 2) split at the J1 crossings,
// 3) rail clearance cap per point (rail deck underside - 7.0 m), 4) write the data file. If the water check fails nothing is written.
// Loop shape = exact geometry of the loops json (A, h0, d1, bend R / Ls / d, d2) rebuilt here; the integer path of the json is only for the picture.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const HALF = 11.2, WET_MARGIN = 3, STEP = 5, NEED = Config.roads.roadRailBuffer.railOverRoad;
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail, net = gen.roads, sc = gen.makeSample();
const wet = (x: number, z: number): boolean => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
const R1 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_reach.json', 'utf8'));
const L2 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_loops.json', 'utf8'));
if (R1.version !== 'crr1b' || L2.reach !== 'crr1b') throw new Error('needs the CRR-1b reach json and the CRR-2b loops json');
const LINES: Record<string, string> = { 'south-1': 'S1', 'north-1': 'N1', 'east-1': 'E1', 'west-nw': 'WNW', 'west-sw': 'WSW' };
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };

const railY = (e: any, s: number): number => { const p = rail.pointAt(e, s); const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1); return e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t; };
interface Piece { name: string; line: string; kind: 'rail' | 'loop' | 'ring'; pts: number[][]; cap: number[] | null; nodes: { x: number; z: number; road: string; why: string }[]; lanesPerDir?: number }
const pieces: Piece[] = [];
// HUB RING (CRR-6): centre Central, R 70 m, section 2 + 2 lanes undivided (3.5 m lanes, 1.0 m paved shoulder = half width 8.0) + 1.5 m ditch => edge 9.5 m from the ring centreline. First piece: the corridor roads take their start height from it.
const RC = { x: 0, z: 300, R: 70, half: 8.0, edge: 9.5 };
{ const n = Math.round((2 * Math.PI * RC.R) / STEP), ring: number[][] = [];
  for (let k = 0; k < n; k++) ring.push([Math.round((RC.x + RC.R * Math.cos((2 * Math.PI * k) / n)) * 100) / 100, Math.round((RC.z + RC.R * Math.sin((2 * Math.PI * k) / n)) * 100) / 100]);
  pieces.push({ name: 'RR-HUB', line: 'hub', kind: 'ring', pts: ring, cap: null, nodes: [] }); }
let wetBad = 0;
const waterCheck = (name: string, pts: number[][]): void => {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
    for (let o = -(HALF + WET_MARGIN); o <= HALF + WET_MARGIN; o += 3.5) if (wet(pts[i][0] + nx * o, pts[i][1] + nz * o)) { wetBad++; P(`WATER at ${name} point ${i} (${pts[i][0].toFixed(0)}, ${pts[i][1].toFixed(0)}) offset ${o}`); return; }
  }
};
const segCross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { x: number; z: number; t: number } | null => {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den; return t >= 0 && t < 1 && u >= 0 && u < 1 ? { x: ax + t * d1x, z: az + t * d1z, t } : null;
};
const r2 = (v: number): number => Math.round(v * 100) / 100;

for (const [id, tag] of Object.entries(LINES)) {
  const e = rail.edges.find((q: any) => q.id === id)!;
  const r1 = R1.lines[id], g = L2.lines[id].good[0];
  // CRR-6: the road starts at the OUTER EDGE of the hub ring: the first s where the 2 corners + the centre of the start line keep >= 0.3 m from the ring's pavement + ditch (RC.edge)
  const gapRing = (s: number): number => { const p0 = rail.pointAt(e, s), p1 = rail.pointAt(e, s + 1), dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1; return Math.min(...[-HALF, 0, HALF].map((o) => Math.abs(Math.hypot(p0.x - (dz / l) * o - RC.x, p0.z + (dx / l) * o - RC.z) - RC.R) - RC.edge)); };
  let s0 = r1.start; while (gapRing(s0) < 0.3 && s0 < r1.start + 60) s0 += 0.5;
  const ENDS: Record<string, [string, number]> = { 'west-sw': ['R4-20', 0], 'west-nw': ['J1-W', -22], 'north-1': ['J1-E', -23.2] }; // user 2026-11-20: CRR-WSW ends at R4-20 (4-lane road), CRR-WNW-b at the J1-W edge (22 m before its centre, 2 lane), no crossing, no loop
  const WS = id in ENDS;
  const st = WS ? (r1.nodes as any[]).find((n: any) => n.road === ENDS[id][0]).s + ENDS[id][1] : g.st;
  P(`${id}: start cut at the hub ring edge: s ${r1.start} -> ${s0.toFixed(1)} m (the 5 roads start radially, 90 deg T on the ring)`);
  // rail part: dense (1 m) centreline s0..st
  const dense: { x: number; z: number; s: number }[] = [];
  for (let s = s0; s <= st + 1e-9; s += 1) { const p = rail.pointAt(e, s); dense.push({ x: p.x, z: p.z, s }); }
  // J1 crossing(s) with an 8-lane road (reach json `junctions`)
  const cuts: { s: number; x: number; z: number; road: string }[] = [];
  for (const j of r1.junctions as any[]) {
    const rd = net.roads.find((q: any) => q.name === j.road);
    let hit: { x: number; z: number; s: number } | null = null;
    for (let i = 0; i + 1 < dense.length && !hit; i++) for (let k = 0; k + 1 < rd.xs.length && !hit; k++) {
      if (Math.abs(rd.xs[k] - dense[i].x) > 60 && Math.abs(rd.xs[k + 1] - dense[i].x) > 60) continue;
      const c = segCross(dense[i].x, dense[i].z, dense[i + 1].x, dense[i + 1].z, rd.xs[k], rd.zs[k], rd.xs[k + 1], rd.zs[k + 1]);
      if (c && dense[i].s + c.t <= st - 20) hit = { x: c.x, z: c.z, s: dense[i].s + c.t };
    }
    if (hit) cuts.push({ s: hit.s, x: hit.x, z: hit.z, road: j.road }); else P(`${id}: junction ${j.road} (reach json) is not on the part 0..st ${st}: not used`);
  }
  cuts.sort((a, b) => a.s - b.s);
  // pieces of the rail part
  const bounds = [{ s: s0, x: dense[0].x, z: dense[0].z, road: '' }, ...cuts, { s: st, x: dense[dense.length - 1].x, z: dense[dense.length - 1].z, road: '' }];
  const sfx = 'abcdefg';
  for (let b = 0; b + 1 < bounds.length; b++) {
    const A = bounds[b], B = bounds[b + 1];
    const pts: number[][] = [[r2(A.x), r2(A.z)]];
    for (let s = Math.ceil((A.s + 1e-6) / STEP) * STEP; s < B.s - 1e-6; s += STEP) { const p = rail.pointAt(e, s); pts.push([r2(p.x), r2(p.z)]); }
    pts.push([r2(B.x), r2(B.z)]);
    const cap: number[] = pts.map((_, i) => { const s = i === 0 ? A.s : i === pts.length - 1 ? B.s : Math.ceil((A.s + 1e-6) / STEP) * STEP + (i - 1) * STEP; return r2(railY(e, s) - D.ballast - D.deckThick - NEED); });
    const nodes: Piece['nodes'] = [];
    if (b === 0) nodes.push({ x: r2(A.x), z: r2(A.z), road: 'RR-HUB', why: 'T start at the hub ring edge (CRR-6): road height = ring height here' });
    if (A.road) nodes.push({ x: r2(A.x), z: r2(A.z), road: A.road, why: 'J1 junction (rule 5), road split here' });
    if (B.road) nodes.push({ x: r2(B.x), z: r2(B.z), road: B.road, why: 'J1 junction (rule 5), road split here' });
    for (const n of r1.nodes as any[]) if (!n.road.startsWith('J1-') && n.s > A.s && n.s < B.s && n.s <= st) nodes.push({ x: r2(n.x), z: r2(n.z), road: n.road, why: 'small-road node on the rail (CRR-3 later)' });
    if (b === bounds.length - 2 && WS) nodes.push({ x: r2(B.x), z: r2(B.z), road: ENDS[id][0], why: 'T end at the ' + ENDS[id][0] + ' carriageway (no crossing, no loop)' });
    else if (b === bounds.length - 2) nodes.push({ x: r2(B.x), z: r2(B.z), road: '@ground', why: 'joint rail part / loop: both pieces get the natural ground height here (no step)' });
    pieces.push({ name: `CRR-${tag}-${sfx[b]}`, line: id, kind: 'rail', pts, cap, nodes, ...(id === 'west-nw' && b === bounds.length - 2 ? { lanesPerDir: 1 } : {}) });
  }
  if (WS) { P(`${id}: rail part s ${s0}..${st} in ${bounds.length - 1} piece(s), NO loop (ends at R4-20)`); continue; }
  // loop: exact geometry
  const q = g.geo, loop: number[][] = [[q.A[0], q.A[1]]];
  const dir0 = [Math.cos(q.h0), Math.sin(q.h0)];
  for (let l = 1; l < q.d1; l += 1) if (l % STEP === 0) loop.push([q.A[0] + dir0[0] * l, q.A[1] + dir0[1] * l]);
  const bx = q.A[0] + dir0[0] * q.d1, bz = q.A[1] + dir0[1] * q.d1; loop.push([bx, bz]);
  { const sg = Math.sign(q.d), Dd = Math.abs(q.d), La = g.R * Dd - g.Ls, total = 2 * g.Ls + La; let x = 0, z = 0, h = q.h0; const bp: number[][] = [[0, 0]];
    for (let l = 0; l < total - 1e-9; l += 1) { const m = l + 0.5, k = m < g.Ls ? m / (g.Ls * g.R) : m < g.Ls + La ? 1 / g.R : (total - m) / (g.Ls * g.R); h += sg * k; x += Math.cos(h); z += Math.sin(h); bp.push([x, z]); }
    for (let i = STEP; i < bp.length - 1; i += STEP) loop.push([bx + bp[i][0], bz + bp[i][1]]);
    const ex = bx + x, ez = bz + z; loop.push([ex, ez]);
    const dir1 = [Math.cos(q.h1), Math.sin(q.h1)];
    for (let l = STEP; l < q.d2 - 1e-6; l += STEP) loop.push([ex + dir1[0] * l, ez + dir1[1] * l]);
    loop.push([ex + dir1[0] * q.d2, ez + dir1[1] * q.d2]); }
  const end = loop[loop.length - 1], resid = Math.hypot(end[0] - g.T[0], end[1] - g.T[1]);
  const aRail = rail.pointAt(e, st), aRes = Math.hypot(aRail.x - q.A[0], aRail.z - q.A[1]);
  P(`${id}: rail part s ${s0}..${st} in ${bounds.length - 1} piece(s), loop ${loop.length} pts, end (${end[0].toFixed(1)}, ${end[1].toFixed(1)}) vs T (${g.T[0]}, ${g.T[1]}) residual ${resid.toFixed(2)} m, loop start vs rail point ${aRes.toFixed(3)} m`);
  if (resid > 1.0 || aRes > 0.2) throw new Error(`${id}: loop geometry does not match the json (resid ${resid}, A ${aRes})`);
  pieces.push({ name: `CRR-${tag}-loop`, line: id, kind: 'loop', pts: loop.map((p) => [r2(p[0]), r2(p[1])]), cap: null, nodes: [{ x: r2(loop[0][0]), z: r2(loop[0][1]), road: '@ground', why: 'joint rail part / loop: both pieces get the natural ground height here (no step)' }, { x: g.T[0], z: g.T[1], road: g.target, why: 'T end of the loop (CRR-2b)' }] });
}
// 1) WATER CHECK (first rule): nothing is written when it fails
for (const p of pieces) waterCheck(p.name, p.pts);
P(`WATER CHECK (sc.water > sc.h - 0.3, +-${HALF + WET_MARGIN} m, every 3.5 m): ${wetBad === 0 ? 'PASS, 0 wet pieces' : 'FAIL, ' + wetBad + ' wet pieces'}`);
if (wetBad) { fs.writeFileSync(dir + '/STEP_CRR5B_EXPORT.txt', log.join('\n') + '\n'); throw new Error('water check failed, data NOT written'); }
for (const p of pieces) { let len = 0; for (let i = 1; i < p.pts.length; i++) len += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); P(`  ${p.name.padEnd(14)} ${p.kind.padEnd(4)} ${String(p.pts.length).padStart(4)} pts ${len.toFixed(0).padStart(5)} m  nodes: ${p.nodes.map((n) => n.road).join(', ') || '-'}`); }
const ts = `// STEP CRR-5b / CRR-6: FIXED centreline data of the 5 rail-corridor roads (CRR-1b reach + CRR-2d gap-exit connectors, pieces named loop) + the hub ring RR-HUB (kind ring, first piece), made by scripts/crr-export-data.ts. DO NOT EDIT BY HAND: change the script and run it again.
// pts = [x, z] every 5 m (the rail part follows the rail centreline, the loop is the exact bend R / Ls). cap = the highest road surface height (m) that keeps ${NEED} m under the rail deck (rail pieces only).
// nodes = where the piece touches an EXISTING road (the road surface height there is taken from that road): J1 split points, small-road crossings, T ends of the loops; road '@ground' = the joint rail part / loop (natural ground height, same in both pieces).
export interface CorridorNode { x: number; z: number; road: string; why: string }
export interface CorridorPiece { name: string; line: string; kind: 'rail' | 'loop' | 'ring'; pts: number[][]; cap: number[] | null; nodes: CorridorNode[]; lanesPerDir?: number }
export const CORRIDOR_ROAD_DATA: CorridorPiece[] = ${JSON.stringify(pieces, null, 0).replace(/\},\{"name"/g, '},\n{"name"')};
`;
fs.writeFileSync('src/roads/crr/CorridorRoadData.ts', ts);
fs.writeFileSync(dir + '/STEP_CRR5B_EXPORT.txt', log.join('\n') + '\n');
P('written src/roads/crr/CorridorRoadData.ts');
