// 2026-11-23 AUDIT (headless, REAL game data, tsx): can the AI route through EVERY junction? For every junction station (engineered pads + auto T pads) and every approach direction a car is started 150 m
// before the station on that road and routed 20 times with random drivers over 600 m: we record the roads it ends up on, dead ends (route terminal early), gaps / jumps in the route.
// Also lists the junction kinds the AI does not know at all (roundabout auto pads, ramps), and the road ends that are dead ends.
// Run: npx tsx scripts/ai-junction-audit.ts docs   -> docs/AI_JUNCTION_AUDIT.txt
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, g = new RoadGraph(net);
const roads = net.roads as any[];
P(`H2 end links: ${g.endLinks.length}`);
P(`roads ${roads.length}, engineered pads ${net.pads.length}, auto pads ${net.autoPads ? net.autoPads.count : 0}, j1 ${net.j1 ? 'yes' : 'no'}, rte ${g.rte ? 'yes' : 'no'}`);
// auto pads by type
const kinds: Record<string, number> = {};
if (net.autoPads) for (let k = 0; k < net.autoPads.count; k++) { const t = net.autoPads.padAt(k).type; kinds[t] = (kinds[t] ?? 0) + 1; }
P(`auto pad types: ${JSON.stringify(kinds)}   (only T is a routing junction while Config.roads.autoJunction.traffic is true)`);
const byKind: Record<string, number> = {}; for (const r of roads) byKind[r.kind + (r.earth ? '/earth' : '')] = (byKind[r.kind + (r.earth ? '/earth' : '')] ?? 0) + 1;
P(`road kinds: ${JSON.stringify(byKind)}`);

interface Res { pad: number; road: string; roadId: number; dir: number; runs: number; dead: number; badGap: number; exits: Set<string>; pass: number }
const results: Res[] = [];
for (let rid = 0; rid < roads.length; rid++) {
  const r = roads[rid]; if (r.earth || r.kind === 'ramp') continue;
  for (const st of g.stations(rid)) {
    for (const d of [1, -1] as const) {
      const s0 = st.s - d * 150; if (s0 < 5 || s0 > r.length - 5) continue;
      const res: Res = { pad: st.pad, road: r.name, roadId: rid, dir: d, runs: 0, dead: 0, badGap: 0, exits: new Set(), pass: 0 };
      for (let k = 0; k < 20; k++) {
        let seed = k * 7919 + rid * 31 + st.pad; const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const rb = new RouteBuilder(g, rnd, rid, s0, d, 0.85); rb.start(); rb.fill(0, 600);
        res.runs++;
        let len = 0, bad = 0; const pts = rb.pts;
        for (let i = 1; i < pts.length; i++) { const dd = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); len += dd; if (dd > 14 || Math.abs(pts[i].y - pts[i - 1].y) > 1.5) bad++; }
        if (rb.terminal && len < 550) res.dead++;
        if (bad) res.badGap++;
        res.exits.add(roads[rb.roadId].name + (rb.dir > 0 ? '+' : '-'));
        if (rb.roadId !== rid) res.pass++;
      }
      results.push(res);
    }
  }
}
const dead = results.filter((q) => q.dead > 0), bad = results.filter((q) => q.badGap > 0), stayed = results.filter((q) => q.pass === 0);
P(`approaches tested: ${results.length}`);
P(`approaches where some route ended in a dead end before 550 m: ${dead.length}`);
for (const q of dead.slice(0, 25)) P(`   DEAD  pad ${q.pad} on ${q.road} dir ${q.dir > 0 ? '+' : '-'}: ${q.dead}/${q.runs} runs ended early, exits ${[...q.exits].join(' ')}`);
P(`approaches with a gap / level jump in the route: ${bad.length}`);
for (const q of bad.slice(0, 25)) P(`   GAP   pad ${q.pad} on ${q.road} dir ${q.dir > 0 ? '+' : '-'}: ${q.badGap}/${q.runs} runs`);
P(`approaches where no run ever left the road (the junction never turns): ${stayed.length}`);
for (const q of stayed.slice(0, 25)) P(`   NOTURN pad ${q.pad} on ${q.road} dir ${q.dir > 0 ? '+' : '-'}`);
// road ends: which ends of non-earth roads are NOT at a pad / J1 / RTE (dead ends where cars stop)
let deadEnds = 0; const lst: string[] = [];
for (let rid = 0; rid < roads.length; rid++) {
  const r = roads[rid]; if (r.earth || r.kind === 'ramp' || r.closed) continue;
  for (const [e, s] of [['start', 0], ['end', r.length]] as const) {
    const near = g.stations(rid).some((q: any) => Math.abs(q.s - s) < 45) || (g.endByRoad.get(rid * 2 + (s > 0 ? 1 : 0)) ?? []).length > 0;   // H2: an end link counts
    const isArm = g.j1 && g.j1.armOfRoad(rid) >= 0;
    if (!near && !isArm) { deadEnds++; if (lst.length < 30) lst.push(`${r.name} ${e} (${r.kind}, ${r.length.toFixed(0)} m)`); }
  }
}
P(`road ends with no junction station and no H2 end link (free dead ends, cars stop there): ${deadEnds}`);
for (const l of lst) P(`   END   ${l}`);

// ---- H3: crossings in the middle of two roads
{
  P(`H3 cross links: ${g.crossCount} crossings (both roads continue, same level, no station / end link within 45 m)`);
  let tested = 0, turned = 0, never = 0, bad2 = 0; const lstN: string[] = [];
  for (const [rid, list] of g.crossByRoad) {
    const r = roads[rid];
    for (const X of list) for (const d of [1, -1] as const) {
      const s0 = X.s - d * 150; if (s0 < 5 || s0 > r.length - 5) continue;
      tested++; let hit = 0, bad = 0;
      for (let k = 0; k < 40; k++) {
        let seed = k * 104729 + rid * 17 + Math.floor(X.s); const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const rb = new RouteBuilder(g, rnd, rid, s0, d, 0.85); rb.start(); let on = false;
        for (let L = 60; L <= 450 && !rb.terminal; L += 30) { rb.fill(0, L); if (rb.roadId === X.other) { on = true; break; } }
        if (on) hit++;
        for (let i = 1; i < rb.pts.length; i++) { const dd = Math.hypot(rb.pts[i].x - rb.pts[i - 1].x, rb.pts[i].z - rb.pts[i - 1].z); if (dd > 14 || Math.abs(rb.pts[i].y - rb.pts[i - 1].y) > 1.5) { bad++; break; } }
      }
      if (hit > 0) turned++; else { never++; if (lstN.length < 15) lstN.push(`${r.name} s ${X.s.toFixed(0)} dir ${d > 0 ? '+' : '-'} x ${roads[X.other].name}`); }
      if (bad > 0) bad2++;
    }
  }
  P(`   approaches tested ${tested}, some route turns onto the crossing road: ${turned}, never turns: ${never}, with a gap / level jump: ${bad2}`);
  for (const l of lstN) P(`   NOTURN ${l}`);
}
P(''); P('NOT RUN  the game, signals, the real vehicle physics');
writeFileSync(`${dir}/AI_JUNCTION_AUDIT.txt`, lines.join('\n') + '\n');
