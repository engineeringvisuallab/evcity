// STEP CRR-2c picture data (headless, tsx, nothing in src/ changed): own rail piers, rail centreline and the CRR-2b loop around each leave point -> docs/crr2c_geo.json (plotted by tools/crr2c-plot.py)
// Run: npx tsx scripts/crr2c-geo.ts docs     (needs docs/city_rail_road_loops_crr2b.json = the loops of the game data, docs/city_rail_road_reach.json)
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const dir = process.argv[2] ?? 'docs';
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const L2 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_loops_crr2b.json', 'utf8'));
const out: any = { lines: {} };
for (const [id, L] of Object.entries<any>(L2.lines)) {
  const g = L.good[0]; const e = rail.edges.find((q: any) => q.id === id)!;
  const lo = g.st - 120, hi = Math.min(e.length, g.st + 260);
  const pts: number[][] = []; for (let s = Math.max(0, lo); s <= hi; s += 10) { const p = rail.pointAt(e, s); pts.push([+p.x.toFixed(1), +p.z.toFixed(1)]); }
  const piers = rail.piers.filter((q: any) => q.edgeId === id && q.s >= lo && q.s <= hi).map((q: any) => ({ s: +q.s.toFixed(1), x: +q.x.toFixed(2), z: +q.z.toFixed(2) }));
  out.lines[id] = { st: g.st, end: L.end, R: g.R, loopLen: g.len, target: g.target, rail: pts, piers, loop: g.path };
}
fs.writeFileSync(dir + '/crr2c_geo.json', JSON.stringify(out));
console.log('written ' + dir + '/crr2c_geo.json');
