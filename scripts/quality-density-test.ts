// Quality presets: the tree / rock / grass multipliers must (1) only REMOVE items of the full (high) set, never move or add them,
// (2) be deterministic for the same tier, (3) land near the intended share (low ~35 %, medium ~65 %), and (4) leave "high" untouched.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { RockPlacer } from '../src/vegetation/RockPlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { PRESETS } from '../src/core/Quality';

const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const rocks = new RockPlacer(gen, trees, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
let bad = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(ok ? 'PASS' : 'FAIL', msg);
  if (!ok) bad++;
};

const key = (a: Float32Array, i: number, stride: number): string => `${a[i].toFixed(3)},${a[i + 2].toFixed(3)}`;
function treeSet(cx: number, cz: number): Set<string> {
  const s = new Set<string>();
  for (const a of trees.place(cx, cz)) for (let i = 0; i < a.length; i += 6) s.add(key(a, i, 6));
  return s;
}
function rockSet(cx: number, cz: number): Set<string> {
  const s = new Set<string>();
  for (const a of rocks.place(cx, cz)) for (let i = 0; i < a.length; i += 6) s.add(key(a, i, 6));
  return s;
}
function grassSet(tx: number, tz: number): Set<string> {
  const s = new Set<string>();
  const a = grass.place(tx, tz, 1);
  for (let i = 0; i < a.length; i += 7) s.add(key(a, i, 7));
  return s;
}

const chunks: [number, number][] = [[10, 10], [4, 7], [15, 3], [8, 16], [12, 12], [2, 2]];
const tiles: [number, number][] = [[150, 150], [100, 210], [250, 90], [160, 170]];

for (const tier of ['low', 'medium'] as const) {
  const P = PRESETS[tier];
  let fullT = 0, fullR = 0, fullG = 0, subT = 0, subR = 0, subG = 0, notSub = 0, nondet = 0;
  for (const [cx, cz] of chunks) {
    trees.mul = 1; rocks.mul = 1;
    const ft = treeSet(cx, cz), fr = rockSet(cx, cz);
    trees.mul = P.treeMul; rocks.mul = P.rockMul;
    const st = treeSet(cx, cz), sr = rockSet(cx, cz);
    const st2 = treeSet(cx, cz);
    fullT += ft.size; fullR += fr.size; subT += st.size; subR += sr.size;
    for (const k of st) if (!ft.has(k)) notSub++;
    for (const k of sr) if (!fr.has(k)) notSub++;
    if (st.size !== st2.size || [...st].some((k) => !st2.has(k))) nondet++;
  }
  for (const [tx, tz] of tiles) {
    grass.mul = 1;
    const fg = grassSet(tx, tz);
    grass.mul = P.grassMul;
    const sg = grassSet(tx, tz);
    fullG += fg.size; subG += sg.size;
    for (const k of sg) if (!fg.has(k)) notSub++;
  }
  trees.mul = 1; rocks.mul = 1; grass.mul = 1;
  const rt = subT / Math.max(1, fullT), rr = subR / Math.max(1, fullR), rg = subG / Math.max(1, fullG);
  console.log(`${tier}: trees ${subT}/${fullT} = ${(rt * 100).toFixed(0)} %, rocks ${subR}/${fullR} = ${(rr * 100).toFixed(0)} %, grass tufts ${subG}/${fullG} = ${(rg * 100).toFixed(0)} %`);
  check(notSub === 0, `${tier}: every tree / rock / tuft of the preset also exists in the full set (only removed, never moved)`);
  check(nondet === 0, `${tier}: same tier twice gives the same trees`);
  check(Math.abs(rt - P.treeMul) < 0.08, `${tier}: tree share near ${P.treeMul}`);
  check(Math.abs(rg - P.grassMul) < 0.08, `${tier}: grass share near ${P.grassMul}`);
  check(fullR === 0 || Math.abs(rr - P.rockMul) < 0.12, `${tier}: rock share near ${P.rockMul}`);
}
check(PRESETS.high.treeMul === 1 && PRESETS.high.rockMul === 1 && PRESETS.high.grassMul === 1, 'high keeps every multiplier at 1');
check(PRESETS.high.peopleTarget === Config.people.target && PRESETS.high.trafficTarget === Config.traffic.target && PRESETS.high.maxBuses === Config.traffic.maxBuses, 'high = Config people / traffic / buses');
check(PRESETS.high.grassRadius === Config.vegetation.grass.radius && PRESETS.high.treeMaxLod === Config.vegetation.maxLod && PRESETS.high.grassBlades === Config.vegetation.grass.bladeDensity, 'high = Config grass radius / tree LOD / blades');
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
