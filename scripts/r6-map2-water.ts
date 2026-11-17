// STEP MAP-2 (headless, numbers only, nothing in src/ changed): WATER CHECK of every map line against the game terrain.
// wet = sc.water > sc.h (water surface above the ground), sampled at the points given in docs/map2_samples.json.
// Run: npx tsx scripts/r6-map2-water.ts docs      (writes docs/map2_water.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const dir = process.argv[2] ?? 'docs';
const S = JSON.parse(readFileSync(dir + '/map2_samples.json', 'utf8')) as { id: string; pts: number[][] }[];
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const out: Record<string, number[]> = {};
let wet = 0, n = 0;
for (const l of S) {
  out[l.id] = l.pts.map(([x, z]) => {
    gen.sample(x, z, sc); n++;
    const w = sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h ? 1 : 0; wet += w; return w;
  });
}
writeFileSync(dir + '/map2_water.json', JSON.stringify(out));
console.log(`water check: ${S.length} lines, ${n} samples, wet ${wet} (rule sc.water > sc.h)`);
