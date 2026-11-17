// STEP MAP (headless, numbers only, nothing in src/ changed): export every road of the game (name, kind, lanes, centreline) and the railway centrelines for the all-roads map.
// Run: npx tsx scripts/r6-map-export.ts docs     (writes docs/map_game_roads.json)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const dir = process.argv[2] ?? 'docs';
const gen: any = new TerrainGenerator(Config.world.seed);
const roads = (gen.roads.roads as any[]).map((r) => ({ name: r.name, kind: r.kind, tier: r.tier, lanes: r.lanes, closed: !!r.closed, xs: Array.from(r.xs as ArrayLike<number>, (v) => +v.toFixed(1)), zs: Array.from(r.zs as ArrayLike<number>, (v) => +v.toFixed(1)), y0: +r.ys[0].toFixed(1) }));
const rail = (gen.rail.edges as any[]).map((e) => ({ id: e.id, xs: Array.from(e.xs as ArrayLike<number>, (v) => +v.toFixed(1)), zs: Array.from(e.zs as ArrayLike<number>, (v) => +v.toFixed(1)) }));
writeFileSync(dir + '/map_game_roads.json', JSON.stringify({ note: 'game roads + rail, world metres (x east, z south)', roads, rail }));
console.log(`roads ${roads.length}: ` + roads.map((r) => `${r.name}(${r.lanes})`).join(' ') + `; rail edges ${rail.length}`);
