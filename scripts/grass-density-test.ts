// Grass density: tufts per sampled tile with the old and the new density settings (lower = cheaper).
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
const per = Math.round(Config.world.size / G.tile);
function total(): { n: number; land: number } {
  let n = 0, land = 0;
  for (let k = 0; k < 600; k++) {
    const tx = Math.floor(per * (0.1 + 0.8 * ((k * 0.6180339) % 1))), tz = Math.floor(per * (0.1 + 0.8 * ((k * 0.7548776) % 1)));
    const cxm = (tx + 0.5) * G.tile - Config.world.size / 2, czm = (tz + 0.5) * G.tile - Config.world.size / 2;
    if (grass.lawnAt(cxm, czm) > 0.01) continue; // open land only (the city lawn is a different density)
    const a = grass.place(tx, tz, 1).length / GRASS_STRIDE;
    n += a; if (a > 0) land++;
  }
  return { n, land };
}
const old = { cov: G.patch.coverage, mx: G.maxChance, mn: G.minChance, reach: G.treeBase.reach, meadow: G.treeBase.meadow, en: G.treeBase.enabled }; // the CURRENT config
G.patch.coverage = 0.3; G.maxChance = 0.35; G.minChance = 0.15; G.treeBase.reach = 2.6; G.treeBase.meadow = 0; G.treeBase.enabled = true; // the old settings (grass only in rings round the trees)
const a = total();
G.patch.coverage = old.cov; G.maxChance = old.mx; G.minChance = old.mn; G.treeBase.reach = old.reach; G.treeBase.meadow = old.meadow; G.treeBase.enabled = old.en;
const b = total();
console.log(`open-land tiles: before ${a.n} tufts (${a.land} tiles with grass), after ${b.n} (${b.land}); x${(b.n / Math.max(1, a.n)).toFixed(2)}`);
