// STEP 2.2b (headless): exports the world as a raster (25 m cells) + obstacles for tools/ring-refit.py. Changes nothing.
// Run: npx tsx scripts/ring-raster-export.ts <out-dir>     writes ring_raster.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { FACILITIES } from '../src/city/WorldZones';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
import { REF_RING } from '../src/roads/reference/RefShapes';
const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const CELL = 25, HALF = 5000, N = (2 * HALF) / CELL;
const h = new Float32Array(N * N), wet = new Uint8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
  gen.sampleNatural(x, z, sc);
  h[j * N + i] = sc.h;
  wet[j * N + i] = !Number.isNaN(sc.water) && sc.h < sc.water - 0.05 ? (sc.h < 0.6 ? 2 : 1) : 0;
}
const rects = [
  ...FACILITIES.map((f) => ({ id: f.id, x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 })),
  ...ENGINEERING_AREAS.map((a) => ({ id: a.id, x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z1 })),
];
writeFileSync(`${out}/ring_raster.json`, JSON.stringify({
  cell: CELL, half: HALF, n: N,
  h: Array.from(h, (v) => Math.round(v * 10) / 10), wet: Array.from(wet),
  rects,
  rail: gen.rail.edges.map((e) => ({ id: e.id, xs: Array.from(e.xs), zs: Array.from(e.zs) })),
  stations: gen.rail.stations.map((s) => ({ id: s.id, x: s.x, z: s.z, r: s.radius })),
  sites: gen.sites,
  ref: Array.from(REF_RING),
}));
console.log(`raster ${N}x${N}, ${rects.length} rects`);
