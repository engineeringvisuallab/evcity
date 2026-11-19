// STEP CRR-1b (rule 5, user 2026-11-19: a crossing with any road, also 8 / 6-lane, is a JUNCTION NODE, not an END; the road is split in two parts there).
// STEP CRR-1 (headless, numbers only, nothing in src/ changed): REACH of the 4-lane road along the rail, rail pier row = road median.
// Run: npx tsx scripts/city-rail-road-reach.ts docs        (writes docs/city_rail_road_reach.json + docs/STEP_CRR1B_OUTPUT.txt)
// Rules used (all numbers are in this file, change here only):
//  - centreline of the road = centreline of the rail; the pier row stands in the median (median 6.4 m), 2 + 2 lanes of 3.5 m + 1.0 m shoulder => edge 11.2 m from the rail line (HALF).
//  - STATION IS IGNORED (user 2026-11-19): a 'station' piece of the rail counts like any other viaduct; the station is designed later.
//  - CLEAR: rail deck underside - road surface >= Config.roads.roadRailBuffer.railOverRoad (7.0 m), road on the natural ground; deficit <= LOWER m = road in a shallow cut (marked 'lower').
//  - WATER (R8): sc.water > sc.h - 0.3 anywhere across +-(HALF + 3 m) = river / lake = END of the reach (the loop must leave BEFORE it).
//  - CRR-1b: BIG ROAD (lanes >= 6) crossing = JUNCTION NODE (listed with point, angle, pier check), NOT an END. ENDs are only: water, low rail (clearance), tunnel.
//  - other existing roads: crossing = NODE (listed, both ends stop there in the later step).
//  - START: the 5 roads leave the Central hub, a line starts where its centreline is >= HALF*2 + GAP from the centreline of every other line.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const LANE = 3.5, SHOULDER = 1.0;
const HALF = 11.2, GAP = 6, WET_MARGIN = 3, LOWER = 2.0, STEP = 10, CROSS_SLOPE_INFO = 3.0;
const NEED = Config.roads.roadRailBuffer.railOverRoad;
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail, net = gen.roads, sc = gen.makeSample();
const ground = (x: number, z: number): number => { gen.sample(x, z, sc); return sc.h; };
const wet = (x: number, z: number): boolean => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
const LINES = ['south-1', 'north-1', 'east-1', 'west-nw', 'west-sw'];

interface Pt { s: number; x: number; z: number; nx: number; nz: number; kind: string; why: string; clear: number; g: number; wet: boolean; slope: number }
const railY = (e: any, s: number): number => {
  const p = rail.pointAt(e, s); const i = p.i; const t = (s - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1);
  return e.design[i] + (e.design[i + 1] - e.design[i]) * t;
};
const lines: Record<string, Pt[]> = {};
for (const id of LINES) {
  const e = rail.edges.find((q: any) => q.id === id)!;
  if (e.from !== 'central') throw new Error(id + ' does not start at central');
  const pts: Pt[] = [];
  for (let s = 0; s <= Math.min(e.length, 3000); s += STEP) {
    const p = rail.pointAt(e, s), seg = e.segments.find((q: any) => s >= q.s0 - 1e-6 && s <= q.s1 + 1e-6) ?? e.segments[e.segments.length - 1];
    const l = Math.hypot(p.dx, p.dz) || 1, nx = -p.dz / l, nz = p.dx / l;
    const g = ground(p.x, p.z), under = railY(e, s) - D.ballast - D.deckThick;
    let w = false, sl = 0;
    for (let o = -(HALF + WET_MARGIN); o <= HALF + WET_MARGIN; o += 4) { const x = p.x + nx * o, z = p.z + nz * o; if (wet(x, z)) w = true; if (Math.abs(o) <= HALF) sl = Math.max(sl, Math.abs(ground(x, z) - g)); }
    pts.push({ s, x: p.x, z: p.z, nx, nz, kind: seg.kind, why: seg.why, clear: under - g, g, wet: w, slope: sl });
  }
  lines[id] = pts;
}
// START of every line: far enough from the other 4 centrelines
const startOf = (id: string): number => {
  for (const q of lines[id]) {
    let ok = true;
    for (const o of LINES) if (o !== id) for (const r of lines[o]) if (Math.hypot(q.x - r.x, q.z - r.z) < 2 * HALF + GAP) { ok = false; break; }
    if (ok) return q.s;
  }
  return Infinity;
};
// crossings with existing roads (segment test, rail centreline vs road polyline)
const segX = (a: Pt, b: Pt, xs: number[], zs: number[], k: number): boolean => {
  const d1x = b.x - a.x, d1z = b.z - a.z, d2x = xs[k + 1] - xs[k], d2z = zs[k + 1] - zs[k], den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((xs[k] - a.x) * d2z - (zs[k] - a.z) * d2x) / den, u = ((xs[k] - a.x) * d1z - (zs[k] - a.z) * d1x) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1;
};
const segXP = (a: Pt, b: Pt, xs: number[], zs: number[], k: number): { x: number; z: number; ang: number } | null => {
  if (!segX(a, b, xs, zs, k)) return null;
  const d1x = b.x - a.x, d1z = b.z - a.z, d2x = xs[k + 1] - xs[k], d2z = zs[k + 1] - zs[k], den = d1x * d2z - d1z * d2x;
  const t = ((xs[k] - a.x) * d2z - (zs[k] - a.z) * d2x) / den;
  const ang = Math.acos(Math.min(1, Math.abs(d1x * d2x + d1z * d2z) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z))));
  return { x: a.x + t * d1x, z: a.z + t * d1z, ang: ang * 180 / Math.PI };
};
const out: any = { version: 'crr1b', rules: { HALF, GAP, WET_MARGIN, LOWER, NEED, STEP }, lines: {} };
const log: string[] = [];
const P = (m: string): void => { console.log(m); log.push(m); };
P(`CRR-1b reach of the 4-lane road along the rail (median = pier row, half width ${HALF} m, clearance need ${NEED} m, station ignored; rule 5: big-road crossing = junction node, ENDs = water / low rail / tunnel only)`);
for (const id of LINES) {
  const pts = lines[id], s0 = startOf(id);
  const nodes: { s: number; road: string; lanes: number; x: number; z: number; ang: number }[] = [];
  let end = pts[pts.length - 1].s, why = 'edge end / 3000 m limit';
  const cls: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]; if (q.s < s0) { cls.push('-'); continue; }
    if (i > 0) for (const r of net.roads) {
      if (r.tier == null || r.xs.length < 2) continue;
      for (let k = 0; k + 1 < r.xs.length; k++) {
        if (Math.abs(r.xs[k] - q.x) > 60 && Math.abs(r.xs[k + 1] - q.x) > 60) continue;
        const hit = segXP(pts[i - 1], q, r.xs, r.zs, k);
        if (hit && !nodes.some((n) => n.road === r.name && Math.abs(n.s - q.s) < 30)) nodes.push({ s: q.s, road: r.name, lanes: r.lanes, x: hit.x, z: hit.z, ang: hit.ang });
      }
    }
    let c = 'ok';
    if (q.kind === 'tunnel') c = 'tunnel'; else if (q.wet) c = 'water';
    else if (q.clear < NEED - LOWER) c = 'low'; else if (q.clear < NEED) c = 'lower';
    cls.push(c);
    if (c === 'tunnel' || c === 'water' || c === 'low') { end = q.s; why = c; break; }
  }
  const reach = Math.max(0, end - s0);
  const ep = pts.find((q) => q.s >= end) ?? pts[pts.length - 1];
  const used = pts.filter((q) => q.s >= s0 && q.s <= end);
  const lowerLen = used.filter((q) => q.clear < NEED).length * STEP, slopeBad = used.filter((q) => q.slope > CROSS_SLOPE_INFO).length * STEP;
  const minClear = Math.min(...used.map((q) => q.clear)), maxClear = Math.max(...used.map((q) => q.clear));
  // nearest existing road (not big) to the END point
  let nr = { d: Infinity, name: '', x: 0, z: 0 };
  for (const r of net.roads) for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - ep.x, r.zs[k] - ep.z); if (d < nr.d && r.lanes < 6) nr = { d, name: r.name, x: r.xs[k], z: r.zs[k] }; }
  const nn = nodes.filter((n) => n.s <= end && n.lanes < 6).map((n) => `${n.road}@${n.s}`);
  // CRR-1b: junction nodes with big roads (lanes >= 6): crossing point, angle, pier check (the crossing road must pass BETWEEN the rail piers)
  const eg = rail.edges.find((q: any) => q.id === id)!;
  const pe = rail.piers.filter((q: any) => q.edgeId === id).map((q: any) => q.s as number).sort((a: number, b: number) => a - b);
  const junc = nodes.filter((n) => n.s <= end && n.lanes >= 6).map((n) => {
    const halfRoad = n.lanes * LANE / 2 + SHOULDER, need = (halfRoad + D.pierSize / 2 + D.pierRoadGap) / Math.max(0.2, Math.sin(n.ang * Math.PI / 180));
    const prev = pe.filter((v: number) => v <= n.s).pop(), next = pe.find((v: number) => v > n.s);
    const seg = eg.segments.find((q: any) => n.s >= q.s0 && n.s <= q.s1);
    const dP = prev == null ? Infinity : n.s - prev, dN = next == null ? Infinity : next - n.s;
    const steel = rail.steelSpans.some((q: any) => q.edgeId === id && n.s >= q.s0 && n.s <= q.s1);
    return { road: n.road, lanes: n.lanes, s: n.s, x: Math.round(n.x), z: Math.round(n.z), ang: Math.round(n.ang), segKind: seg ? seg.kind : '?', steelSpan: steel, pierPrevDist: Math.round(dP), pierNextDist: Math.round(dN), needAlongRail: Math.round(need), pierOk: steel || (dP >= need && dN >= need) };
  });
  // split the road in parts at the big-road junctions
  const cuts = junc.map((j) => j.s).sort((a, b) => a - b), partsS: number[][] = []; let ps = s0;
  for (const c of cuts) { partsS.push([ps, c]); ps = c; } partsS.push([ps, end]);
  out.lines[id] = { start: s0, end, reach, why, endPoint: [ep.x, ep.z], lowerLen, slopeBad, minClear, maxClear, nodes: nodes.filter((n) => n.s <= end), junctions: junc, parts: partsS.map(([a, b]) => ({ s0: a, s1: b, len: b - a, path: used.filter((q) => q.s >= a && q.s <= b).map((q) => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]) })), nearestSmallRoad: nr, path: used.map((q) => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10, q.clear > NEED ? 1 : 0]) };
  P(`${id}: start s ${s0} m, END s ${end} m (${why}) at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)}), reach ${reach} m; clearance ${minClear.toFixed(1)}..${maxClear.toFixed(1)} m, shallow-cut ${lowerLen} m, cross slope > ${CROSS_SLOPE_INFO} m ${slopeBad} m; crossings with small roads: ${nn.length ? nn.join(' ') : 'none'}; nearest small road to the end: ${nr.name} ${nr.d.toFixed(0)} m`);
  for (const j of junc) P(`   junction ${j.road} (${j.lanes} lanes) at s ${j.s} (${j.x}, ${j.z}), crossing angle ${j.ang} deg, rail piece ${j.segKind}${j.steelSpan ? ' STEEL SPAN' : ''}; pier before ${j.pierPrevDist} m, after ${j.pierNextDist} m, needs >= ${j.needAlongRail} m each side => ${j.pierOk ? 'PASS' : 'FAIL'}`);
  P(`   parts: ${partsS.map(([a, b]) => `${a}..${b} (${b - a} m)`).join(' | ')}`);
}
fs.writeFileSync(dir + '/city_rail_road_reach.json', JSON.stringify(out));
fs.writeFileSync(dir + '/STEP_CRR1B_OUTPUT.txt', log.join('\n') + '\n');
// context for the picture (roads and water inside the window x -800..800, z -600..1000)
const X0 = -800, X1 = 800, Z0 = -600, Z1 = 1000, CELL = 20, cells: number[][] = [];
for (let x = X0; x < X1; x += CELL) for (let z = Z0; z < Z1; z += CELL) if (wet(x + CELL / 2, z + CELL / 2)) cells.push([x, z]);
const roadsCtx = net.roads.filter((r: any) => r.xs.length > 1).map((r: any) => ({ name: r.name, lanes: r.lanes, p: Array.from(r.xs as ArrayLike<number>).map((x: number, k: number) => [Math.round(x), Math.round(r.zs[k])]).filter((_: any, k: number) => k % 2 === 0) }));
fs.writeFileSync(dir + '/city_rail_road_ctx.json', JSON.stringify({ cell: CELL, water: cells, roads: roadsCtx, rail: LINES.map((id) => lines[id].filter((_, i) => i % 3 === 0).map((q) => [Math.round(q.x), Math.round(q.z), q.kind])) }));
