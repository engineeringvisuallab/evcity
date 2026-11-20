// PLOT TILING P2 helper: dumps every game road centre line (not earth tracks) to docs/city_roads_cl.json. Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-roads-dump.ts
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
const gen: any = new TerrainGenerator(Config.world.seed);
const out: any[] = [];
for (const r of gen.roads.roads) { if (r.earth) continue; out.push({ name: String(r.name ?? r.id ?? '?'), hw: r.halfWidth, xs: Array.from(r.xs as number[], (v) => Math.round(v * 10) / 10), zs: Array.from(r.zs as number[], (v) => Math.round(v * 10) / 10) }); }
writeFileSync('docs/city_roads_cl.json', JSON.stringify(out)); console.log('roads', out.length, 'points', out.reduce((a, r) => a + r.xs.length, 0));
