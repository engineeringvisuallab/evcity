// STEP J1-c4a (headless): exports the N sector of J1 as a raster (20 m cells) + obstacles for tools/j1-n-route.py. Changes nothing.
// Run: npx tsx scripts/j1-n-raster.ts docs     writes j1c4_raster.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { FACILITIES } from '../src/city/WorldZones';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
const out = process.argv[2] ?? 'docs';
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const CELL = 20, X0 = -1400, X1 = 2600, Z0 = -3700, Z1 = 0;
const NX = (X1 - X0) / CELL, NZ = (Z1 - Z0) / CELL;
const h: number[] = [], wet: number[] = [];
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
  gen.sampleNatural(x, z, sc);
  h.push(Math.round(sc.h * 10) / 10);
  wet.push(!Number.isNaN(sc.water) && sc.h < sc.water - 0.05 ? (sc.h < 0.6 ? 2 : 1) : 0);
}
const rects = [...FACILITIES.map((f) => ({ id: f.id, x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 })), ...ENGINEERING_AREAS.map((a) => ({ id: a.id, x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z1 }))]
  .filter((r) => r.x1 > X0 && r.x0 < X1 && r.z1 > Z0 && r.z0 < Z1);
writeFileSync(`${out}/j1c4_raster.json`, JSON.stringify({
  cell: CELL, x0: X0, z0: Z0, nx: NX, nz: NZ, h, wet, rects,
  rail: gen.rail.edges.map((e) => ({ id: e.id, xs: Array.from(e.xs), zs: Array.from(e.zs) })),
  stations: gen.rail.stations.map((s) => ({ id: s.id, x: s.x, z: s.z, r: s.radius })),
}));
console.log(`raster ${NX}x${NZ}, ${rects.length} rects in the N sector`);
