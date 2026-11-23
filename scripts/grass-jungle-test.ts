// Grass only in the dense jungle + jungleDenseMul. Run: npx tsx scripts/grass-jungle-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';
const G = Config.vegetation.grass;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
grass.dense = 4; // Quality high
const per = Math.round(Config.world.size / G.tile);
const tileOf = (x: number) => Math.floor((x + Config.world.size / 2) / G.tile);
function jungle(mul: number, only: boolean): number {
  G.jungleDenseMul = mul; G.jungleOnly = only;
  const sp = Config.vegetation.jungleSpots[0];
  let n = 0, t = 0;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const tx = tileOf(sp.x) + dx, tz = tileOf(sp.z) + dz;
    n += grass.place(tx, tz, 1).length / GRASS_STRIDE; t++;
  }
  return n / t;
}
function open(only: boolean): { n: number; land: number; flags: Record<string, number> } {
  G.jungleOnly = only;
  let n = 0, land = 0;
  const flags: Record<string, number> = {};
  const half = Config.world.size / 2;
  for (let k = 0; k < 300; k++) {
    const tx = Math.floor(per * (0.1 + 0.8 * ((k * 0.6180339) % 1))), tz = Math.floor(per * (0.1 + 0.8 * ((k * 0.7548776) % 1)));
    const arr = grass.place(tx, tz, 1);
    let a = 0;
    for (let i = 0; i < arr.length; i += GRASS_STRIDE) {
      const x = tx * G.tile - half + arr[i], z = tz * G.tile - half + arr[i + 2];
      if (grass.lawnAt(x, z) > 0.01) continue; // city lawn is allowed
      if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, az]) => trees.denseAt(x + ax, z + az) > G.jungleMin)) continue; // jungle (+ 1 m edge, extra tufts drift up to a cell off the centre)
      a++;
      const f = String(arr[i + GRASS_STRIDE - 1]);
      flags[f] = (flags[f] ?? 0) + 1;
    }
    n += a; if (a > 0) land++;
  }
  return { n, land, flags };
}
const j1 = jungle(1, true), j5 = jungle(5, true);
console.log(`jungle tile avg tufts: x1 ${j1.toFixed(0)} -> x5 ${j5.toFixed(0)} (x${(j5 / Math.max(1, j1)).toFixed(2)})`);
const off = open(false), on = open(true);
console.log(`open land (no city, no jungle): jungleOnly off ${off.n} tufts (${off.land} tiles) -> on ${on.n} (${on.land} tiles) flags ${JSON.stringify(on.flags)} ${on.n === 0 ? 'OK' : 'FAIL'}`);
console.log(on.n === 0 && j5 > j1 * 2 ? 'PASS' : 'FAIL');
