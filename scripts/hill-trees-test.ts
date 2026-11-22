// Hill tree variety + mega trees. Run: npx tsx scripts/hill-trees-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_STRIDE, TREE_KIND_COUNT, TreeKind, isGum } from '../src/vegetation/TreeTypes';
const V = Config.vegetation;
const gen = new TerrainGenerator(Config.world.seed);
const placer = new TreePlacer(gen, new CityPlan(gen.sites), Config.world.seed);
const cs = Config.world.chunkSize, half = Config.world.size / 2, n = Math.floor(Config.world.size / cs);
const names = Object.fromEntries(Object.entries(TreeKind).map(([k, v]) => [v, k]));
function run(label: string): { hill: number[]; big: number; mega: number; all: number } {
  const hill = new Array<number>(TREE_KIND_COUNT).fill(0);
  let big = 0, mega = 0, all = 0;
  for (let cz = 0; cz < n; cz += 2) for (let cx = 0; cx < n; cx += 2) {
    const arr = placer.place(cx, cz, 0);
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const a = arr[k]; if (!a) continue;
      const isBig = (k >= TreeKind.sal && k <= TreeKind.shimul) || isGum(k);
      for (let i = 0; i < a.length; i += TREE_STRIDE) {
        all++;
        if (isBig) { big++; if (a[i + 3] >= V.mega.scale[0] - 1e-6 && V.mega.chance > 0) mega++; }
        if (a[i + 1] > 100 && (k <= TreeKind.shimul || k === TreeKind.debdaru || k === TreeKind.krishnachura || isGum(k) || (k >= TreeKind.coconut && k <= TreeKind.banana))) hill[k]++;
      }
    }
  }
  const tot = hill.reduce((s, v) => s + v, 0);
  console.log(`${label}: trees ${all}, big ${big}, mega(>=${V.mega.scale[0]}) ${mega}, trees above 100 m: ${tot}`);
  console.log('  ' + hill.map((v, k) => [k, v] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k]} ${(100 * v / Math.max(1, tot)).toFixed(0)}%`).join(', '));
  return { hill, big, mega, all };
}
const old = { pm: V.pineMax, hd: V.hill.debdaru, mc: V.mega.chance, mp: V.mega.patchChance };
V.pineMax = 1; V.hill.debdaru = 0; V.mega.chance = 0; V.mega.patchChance = 0;
const before = run('BEFORE');
V.pineMax = old.pm; V.hill.debdaru = old.hd; V.mega.chance = old.mc; V.mega.patchChance = old.mp;
const after = run('AFTER ');
const pine = (r: { hill: number[] }): number => r.hill[TreeKind.pine] / Math.max(1, r.hill.reduce((s, v) => s + v, 0));
let ok = true;
if (!(pine(after) < pine(before) - 0.1) && pine(before) > 0.2) { ok = false; console.log('FAIL: pine share did not fall'); }
if (after.mega < 5) { ok = false; console.log('FAIL: no mega trees'); }
if (after.mega > after.big * 0.2) { ok = false; console.log('FAIL: too many mega trees'); }
console.log(ok ? 'PASS hill trees' : 'FAIL');
process.exit(ok ? 0 : 1);
