import * as fs from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';
// AUTO CONNECT AT GRADE, A-6 step 1 (headless): RoadGraph knows the auto pads (autoStations / autoArms), read only, flag OFF = nothing.
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

Config.roads.autoJunction.enabled = true;
const g1: any = new TerrainGenerator(Config.world.seed);
const net = g1.roads;
const G1 = new RoadGraph(net);
const ap = net.autoPads;
T('flag ON: auto pads built', !!ap && ap.count === Config.roads.autoJunction.ids.length, `${ap ? ap.count : 0} pads of ${Config.roads.autoJunction.ids.length}`);
if (!ap) { fs.writeFileSync(`${out}/A6_GRAPH_OUTPUT.txt`, lines.join('\n') + '\n'); process.exit(1); }
T('old stations / arms identical with the flag ON and OFF', oldDump(G1) === old0, 'Station / arms lists of the old pads are the same (the routing sees no change)');

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
P(fails === 0 ? 'RESULT ALL PASS' : `RESULT ${fails} FAIL`);
fs.writeFileSync(`${out}/A6_GRAPH_OUTPUT.txt`, lines.join('\n') + '\n');
process.exit(fails === 0 ? 0 : 1);
