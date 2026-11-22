import * as fs from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { planRoute } from '../src/traffic/RoutePlanner';
import { RouteBuilder } from '../src/traffic/Route';
// AUTO CONNECT AT GRADE, A-6 step 1 + 2 (headless): RoadGraph knows the auto pads (autoStations / autoArms); step 2: the auto T pads are junctions for the route planner (pad number = net.pads.length + k) behind Config.roads.autoJunction.traffic; roundabouts not yet.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/junction-auto-graph-check.ts docs  -> docs/A6_GRAPH_OUTPUT.txt
const out = process.argv[2] ?? 'docs';
const lines: string[] = [];
let fails = 0;
const P = (s: string): void => { lines.push(s); console.log(s); };
const T = (name: string, ok: boolean, text: string): void => { if (!ok) fails++; P(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${text}`); };
const oldDump = (g: RoadGraph): string => JSON.stringify(g.roads.map((_, i) => g.stations(i))) + JSON.stringify(g.net.pads.map((_, p) => g.arms(p)));

P('AUTO CONNECT AT GRADE, A-6 step 1: traffic RoadGraph knows the auto pads');
Config.roads.autoJunction.enabled = false;
const g0: any = new TerrainGenerator(Config.world.seed);
const G0 = new RoadGraph(g0.roads);
T('flag OFF: no auto stations', G0.roads.every((_, i) => G0.autoStations(i).length === 0), 'autoStations empty on every road');
const old0 = oldDump(G0);

// step 2 sub-flag OFF: the routing graph must be exactly the old one
Config.roads.autoJunction.enabled = true;
Config.roads.autoJunction.traffic = false;
const gT: any = new TerrainGenerator(Config.world.seed);
const GT = new RoadGraph(gT.roads);
T('traffic sub-flag OFF: stations / arms identical to the flag OFF game', oldDump(GT) === old0, 'routing graph unchanged (the read-only autoStations are still there)');
Config.roads.autoJunction.traffic = true;
const g1: any = new TerrainGenerator(Config.world.seed);
const net = g1.roads;
const G1 = new RoadGraph(net);
const ap = net.autoPads;
T('flag ON: auto pads built', !!ap && ap.count === Config.roads.autoJunction.ids.length, `${ap ? ap.count : 0} pads of ${Config.roads.autoJunction.ids.length}`);
if (!ap) { fs.writeFileSync(`${out}/A6_GRAPH_OUTPUT.txt`, lines.join('\n') + '\n'); process.exit(1); }
const base = net.pads.length;
const oldPart = JSON.stringify(G1.roads.map((_, i) => G1.stations(i).filter((q) => q.pad < base))) + JSON.stringify(net.pads.map((_, p) => G1.arms(p)));
const oldPart0 = JSON.stringify(G0.roads.map((_, i) => G0.stations(i))) + JSON.stringify(G0.net.pads.map((_, p) => G0.arms(p)));
T('old pads: stations / arms identical with the flag ON and OFF', oldPart === oldPart0, 'Station / arms lists of the old pads are the same (only auto stations are added)');

let nLegs = 0, nLinked = 0, worst = 0, badId = 0, badS = 0, dup = 0, through = 0;
for (let k = 0; k < ap.count; k++) {
  const pad = ap.padAt(k);
  const arms = G1.autoArms(k);
  nLegs += pad.legs.length; nLinked += arms.length;
  const seen = new Map<number, number>();
  let wd = 0;
  for (const a of arms) {
    const lg = pad.legs[a.leg];
    const r = G1.roads[a.roadId];
    if (!r || r.id !== a.roadId || lg.roadId !== a.roadId) badId++;
    if (!r || a.s < 0 || a.s > r.length + 1e-6) badS++;
    // a through road of a T has two legs (one each side of the junction): same road, same s, at most 2 per pad
    const prev = seen.get(a.roadId);
    if (prev !== undefined) { through++; if (Math.abs(prev - a.s) > 1e-6) dup++; }
    seen.set(a.roadId, a.s);
    if (arms.filter((q) => q.roadId === a.roadId).length > 2) dup++;
    const st = G1.autoStations(a.roadId).find((q) => q.autoPad === k && q.leg === a.leg);
    if (!st) badId++; else { wd = Math.max(wd, st.dist); worst = Math.max(worst, st.dist); }
  }
  P(`  ${pad.id} ${pad.type}: ${arms.length} of ${pad.legs.length} legs linked, roads ${arms.map((a) => G1.roads[a.roadId].name + '@' + a.s.toFixed(0)).join(' ')}, farthest station ${wd.toFixed(1)} m from the pad centre`);
}
T('every leg of every auto pad has a station', nLinked === nLegs, `${nLinked} of ${nLegs} legs linked`);
T('station roads and s are valid', badId === 0 && badS === 0, `${badId} wrong road ids, ${badS} s out of range`);
T('a road with two legs in one pad (through road) gets the same s on both', dup === 0, `${through} through-road legs (T pads), ${dup} with a different s or more than 2 legs`);
T('station is close to the pad', worst <= 40, `farthest road point ${worst.toFixed(1)} m from a pad centre (limit 40 m)`);
let sorted = true;
for (let i = 0; i < G1.roads.length; i++) { const a = G1.autoStations(i); for (let j = 1; j < a.length; j++) if (a[j].s < a[j - 1].s) sorted = false; }
T('auto stations sorted by s', sorted, 'sorted on every road');
// ---- A-6 step 2: the auto T pads are junctions for the route planner
P('--- A-6 step 2: routing');
let nT = 0, nRb = 0, badArms = 0, badSt = 0, noRoute = 0, tried = 0, found = 0;
for (let k = 0; k < ap.count; k++) {
  const pad = ap.padAt(k);
  const padNo = base + k;
  const arms = G1.arms(padNo);
  if (pad.type !== 'T') { nRb++; if (arms.length !== 0 || G1.roads.some((_, i) => G1.stations(i).some((q) => q.pad === padNo))) badArms++; continue; }
  nT++;
  const roadsOfPad = new Set(pad.legs.map((l) => l.roadId));
  if (arms.length !== roadsOfPad.size) badArms++;
  for (const a of arms) { const st = G1.stations(a.roadId).filter((q) => q.pad === padNo); if (st.length !== 1 || Math.abs(st[0].s - a.s) > 1e-6) badSt++; }
  let okRoads = 0;
  for (const a of arms) {
    // approach this pad on road a, aim at every other road (both directions), 100 m past the pad or as far as the road goes
    const r = G1.roads[a.roadId];
    const dirA: 1 | -1 = a.s > r.length / 2 ? 1 : -1; // the side with more road: drive towards the pad from there
    const sStart = Math.min(Math.max(a.s - dirA * Math.min(100, dirA > 0 ? a.s : r.length - a.s), 0), r.length);
    if (Math.abs(a.s - sStart) < 20) continue; // too short a road to start on
    let got = false;
    for (const b of arms) {
      if (b.roadId === a.roadId) continue;
      const rb = G1.roads[b.roadId];
      for (const d of [1, -1] as const) {
        const room = d > 0 ? rb.length - b.s : b.s;
        if (room < 60) continue;
        tried++;
        const plan = planRoute(G1, { roadId: a.roadId, s: sStart, dir: dirA }, { roadId: b.roadId, s: b.s + d * Math.min(100, room - 5) });
        if (plan && plan.length > 0 && plan[0].pad === padNo) { found++; got = true; }
      }
    }
    // the through road of a T (2 legs) also runs straight on: a target further along the same road
    if (!got) { /* not every road can start a route (a dead-end minor road end) */ } else okRoads++;
  }
  P(`  ${pad.id}: pad number ${padNo}, ${arms.length} roads in the arm list, routes found from ${okRoads} of ${arms.length} roads`);
  if (okRoads < 1) noRoute++;
}
T('auto T pads are junctions (pad number base + k)', nT === 11 && badArms === 0 && badSt === 0, `${nT} T pads, ${badArms} wrong arm lists, ${badSt} wrong stations; ${nRb} roundabouts keep no station and no arms`);
T('the route planner finds routes through the T pads', noRoute === 0 && found > 0, `${found} of ${tried} start / target pairs routed through an auto pad; ${noRoute} pads without any route`);

// ---- the real RouteBuilder drives through every T pad (40 seeded runs per approach)
P('--- A-6 step 2: RouteBuilder driving');
const rule = { roadOk: () => true, placeOk: () => true };
let seed = 11;
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let nApp = 0, nRuns = 0, runsThrough = 0, maxJump = 0, maxDy = 0, appNoExit = 0, appNoThrough = 0, runsOnPadRoad = 0;
for (let k = 0; k < ap.count; k++) {
  const pad = ap.padAt(k);
  if (pad.type !== 'T') continue;
  const padNo = base + k;
  const armList = G1.arms(padNo);
  const padRoads = new Set(armList.map((a) => a.roadId));
  const summary: string[] = [];
  for (const a of armList) {
    const r = G1.roads[a.roadId];
    for (const dir of [1, -1] as const) {
      const sStart = Math.min(Math.max(a.s - dir * 100, 0), r.length);
      if (Math.abs(a.s - sStart) < 30) continue; // no room to drive up to the pad on this side
      nApp++;
      const out = new Map<string, number>();
      let through = 0;
      for (let rep = 0; rep < 40; rep++) {
        const rb = new RouteBuilder(G1, rnd, a.roadId, sStart, dir, 0.9, rule);
        rb.start();
        rb.fill(0, 400);
        const pts = rb.pts;
        nRuns++;
        let nearest = 1e9;
        for (let i = 0; i < pts.length; i++) {
          nearest = Math.min(nearest, Math.hypot(pts[i].x - pad.x, pts[i].z - pad.z));
          if (i > 0) { maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); maxDy = Math.max(maxDy, Math.abs(pts[i].y - pts[i - 1].y)); }
        }
        if (nearest < 16) { through++; runsThrough++; }
        const key = `${G1.roads[rb.roadId].name}${rb.dir > 0 ? '+' : '-'}`;
        out.set(key, (out.get(key) ?? 0) + 1);
        if (padRoads.has(rb.roadId)) runsOnPadRoad++;
      }
      if (through < 40) appNoThrough++;
      summary.push(`${r.name}${dir > 0 ? '+' : '-'} -> ${[...out.entries()].map(([q, n]) => q + ':' + n).join(' ')}`);
    }
  }
  P(`  ${pad.id} (pad ${padNo}): ${summary.join(' | ')}`);
}
T('cars pass the pad on every approach', appNoThrough === 0 && nApp >= 20, `${nApp} approaches x 40 runs = ${nRuns} routes, every route passes within 16 m of the pad centre (${runsThrough} of ${nRuns}); approaches with a miss: ${appNoThrough}`);
T('routes are smooth', maxJump <= 8 && maxDy <= 1.5, `biggest point-to-point jump ${maxJump.toFixed(2)} m (limit 8), biggest height step ${maxDy.toFixed(2)} m (limit 1.5)`);
T('cars leave onto a road of the pad', runsOnPadRoad > 0, `${runsOnPadRoad} of ${nRuns} routes end on one of the pad's own roads (the rest drive on along the through road beyond the 400 m window, which may be another road)`);

P(fails === 0 ? 'RESULT ALL PASS' : `RESULT ${fails} FAIL`);
fs.writeFileSync(`${out}/A6_GRAPH_OUTPUT.txt`, lines.join('\n') + '\n');
process.exit(fails === 0 ? 0 : 1);
