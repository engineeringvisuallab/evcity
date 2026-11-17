// Dump roads / pads near J6 in the (u,v) frame to JSON for plotting. Run: npx tsx scripts/j6-roadmap.ts [on|off] > out.json
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J6_SCENARIO, worldToUV } from '../src/interchange/scenario/J6Scenario';
Config.roads.scenario.enabled = process.argv[2] === 'on';
const g: any = new TerrainGenerator(Config.world.seed);
const C = J6_SCENARIO.centre;
const roads: any[] = [];
for (const r of g.roads.roads) {
  const pts: number[][] = [];
  let any = false;
  for (let i = 0; i < r.xs.length; i++) { const p = worldToUV(C, r.xs[i], r.zs[i]); pts.push([Math.round(p.u), Math.round(p.v), Math.round(r.ys[i] * 10) / 10]); if (Math.abs(p.u) < 1100 && Math.abs(p.v) < 1100) any = true; }
  if (any) roads.push({ id: r.id, name: r.name, kind: r.kind, pts });
}
const pads = g.roads.pads.map((p: any) => ({ id: p.id, ...worldToUV(C, p.x, p.z), y: p.y })).filter((p: any) => Math.abs(p.u) < 1100 && Math.abs(p.v) < 1100);
console.log(JSON.stringify({ roads, pads }));
