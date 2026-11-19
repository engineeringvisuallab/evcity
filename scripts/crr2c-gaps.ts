// STEP CRR-2c (headless, tsx, nothing in src/ changed): usable PIER GAPS of the own rail line inside each CRR-1b reach = where a perpendicular road can pass BETWEEN two piers (gap exit proposal).
// Run: npx tsx scripts/crr2c-gaps.ts docs      (needs docs/city_rail_road_reach.json) -> docs/STEP_CRR2C_GAPS.txt
// Needed pier-to-pier distance for a perpendicular road of half width h: 2 x (h + pier half 1.6 + pierRoadGap 1.6): 2-lane connector (9 m with shoulders, h 4.5) = 15.4 m, 4-lane loop road (h 11.5) = 29.4 m.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
const dir = process.argv[2] ?? 'docs';
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed); const rail = gen.rail; const sc = gen.makeSample();
const R1 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_reach.json', 'utf8'));
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
const railY = (e: any, s: number): number => { const p = rail.pointAt(e, s); const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1); return e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t; };
const N2 = 2 * (4.5 + D.pierSize / 2 + D.pierRoadGap), N4 = 2 * (11.5 + D.pierSize / 2 + D.pierRoadGap);
P(`CRR-2c pier gaps: perpendicular 2-lane road needs ${N2.toFixed(1)} m between two pier centres, 4-lane (half 11.5) needs ${N4.toFixed(1)} m; deck underside - natural ground at the gap middle must be >= ${Config.roads.roadRailBuffer.railOverRoad} m`);
for (const [id, L] of Object.entries<any>(R1.lines)) {
  const e = rail.edges.find((q: any) => q.id === id);
  const nodes: number[] = [...(L.nodes ?? []).map((n: any) => n.s), ...(L.junctions ?? []).map((n: any) => n.s)];
  const ps = rail.piers.filter((q: any) => q.edgeId === id && q.s >= L.start && q.s <= L.end).sort((a: any, b: any) => a.s - b.s);
  P(`${id} reach ${L.start}..${L.end}, nodes / junctions at s ${nodes.map((q) => q.toFixed(0)).join(',') || '-'}; ${ps.length} piers; gaps (pier s - pier s, width, middle s, deck clearance, distance to the nearest node, middle point x z):`);
  for (let i = 0; i + 1 < ps.length; i++) {
    const g = ps[i + 1].s - ps[i].s; if (g < N2) continue; const mid = (ps[i].s + ps[i + 1].s) / 2, p = rail.pointAt(e, mid); gen.sampleGround(p.x, p.z, sc);
    const cl = railY(e, mid) - D.ballast - D.deckThick - sc.h; const nd = nodes.length ? Math.min(...nodes.map((q) => Math.abs(q - mid))) : 999;
    P(`   s${ps[i].s.toFixed(0)}-${ps[i + 1].s.toFixed(0)} gap ${g.toFixed(0)} m, mid s ${mid.toFixed(0)}, deck clearance ${cl.toFixed(1)} m${cl >= Config.roads.roadRailBuffer.railOverRoad ? '' : ' (LOW)'}, node dist ${nd.toFixed(0)} m${nd >= 60 ? '' : ' (< 60 m node spacing)'}, ${g >= N4 ? '4-lane fits' : '2-lane only'}, (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
  }
}
fs.writeFileSync(dir + '/STEP_CRR2C_GAPS.txt', log.join('\n') + '\n');
