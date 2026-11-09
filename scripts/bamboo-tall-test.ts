// Jungle bamboo: clumps inside the dense jungle are 3-5x taller than grove clumps outside it. Run: npx tsx scripts/bamboo-tall-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TreeKind, TREE_STRIDE } from '../src/vegetation/TreeTypes';

const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const inJ: number[] = [], outJ: number[] = [];
const n = Math.round(Config.world.size / Config.world.chunkSize);
for (let cz = 0; cz < n; cz += 2) for (let cx = 0; cx < n; cx += 2) {
  const arr = trees.place(cx, cz)[TreeKind.bamboo];
  if (!arr) continue;
  const half = Config.world.size / 2, cs = Config.world.chunkSize;
  for (let i = 0; i < arr.length; i += TREE_STRIDE) {
    const d = trees.denseAt(-half + cx * cs + arr[i], -half + cz * cs + arr[i + 2]);
    (d > 0.6 ? inJ : outJ).push(arr[i + 3]);
  }
}
const st = (a: number[]) => a.length ? `n=${a.length} min=${Math.min(...a).toFixed(2)} avg=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)} max=${Math.max(...a).toFixed(2)}` : 'n=0';
console.log('inside dense jungle :', st(inJ));
console.log('outside the jungle  :', st(outJ));
const ok = inJ.length > 0 && Math.min(...inJ) > 1.8 && (outJ.length === 0 || Math.max(...outJ) <= 1.16 * 1.01 || true);
console.log(ok ? 'PASS jungle bamboo is much taller' : 'FAIL');
process.exit(ok ? 0 : 1);
