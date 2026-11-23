// Reference-photo grass (2026-11-21): bunch grass with seed plumes in open land, broad-leaf / trefoil ground cover mixed into the tufts, jungle clumps stay shady. Run: npx tsx scripts/grass-reference-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GrassManager } from '../src/vegetation/GrassManager';
import { GRASS_STRIDE, GRASS_TYPE_COUNT, GrassType } from '../src/vegetation/TreeTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const mgr = new GrassManager({} as never, {} as never, {} as never) as unknown as { pick(wx: number, wz: number, lod: number, h1: number, h2: number, h3: number, dry: number, flag: number): number };

// ---- 1. which model does each tuft flag get? (hash sweep, near ring) ----
const names: Record<number, string> = {};
for (const [n, v] of Object.entries(GrassType)) names[v as number] = n;
const dist = (flag: number): Record<string, number> => {
  const out: Record<string, number> = {};
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const h1 = ((i * 0.6180339887) % 1), h2 = ((i * 0.7548776662) % 1), h3 = ((i * 0.5698402910) % 1);
    const t = mgr.pick(1000 + (i % 97) * 13, 2000 + (i % 89) * 7, 0, h1, h2, h3, 0, flag);
    const base = t >= GRASS_TYPE_COUNT ? t - GRASS_TYPE_COUNT : t;
    ok(base >= 0 && base < GRASS_TYPE_COUNT, `flag ${flag}: model index ${t} valid`) || void 0;
    out[names[base]] = (out[names[base]] ?? 0) + 1 / N;
  }
  return out;
};
const show = (flag: number): Record<string, number> => { const d = dist(flag); console.log(`flag ${flag}: ` + Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')); return d; };
const open = show(0), jungle = show(6), clumps = show(1), jclumps = show(7), lawn = show(2);
ok((open.leafy ?? 0) > 0.08 && (open.trefoil ?? 0) > 0.05, 'open tufts: 8 %+ broad-leaf rosettes and 5 %+ trefoil');
ok((jungle.durba ?? 0) > 0.6 && (jungle.trefoil ?? 0) > 0.08 && (jungle.leafy ?? 0) > 0.04, 'jungle floor: 60 %+ glossy durba, 8 %+ triple-leaf (trefoil), 4 %+ single broad leaf');
ok((clumps.tussockSeed ?? 0) > 0.3, 'open-land clumps: 30 %+ carry seed plumes');
ok((jclumps.tussockSeed ?? 0) === 0 && (jclumps.durba ?? 0) > 0.9, 'jungle clumps (flag 7): thin durba plants, no seed plumes');
ok((lawn.leafy ?? 0) > 0.02 && (lawn.trefoil ?? 0) > 0.04, 'city lawn: a little broad-leaf and clover');

// ---- 2. open land really gets clumps now; clumps in the jungle are flag 7 ----
const sp = Config.vegetation.jungleSpots[0];
const tilesAround = (px: number, pz: number, r: number): [number, number][] => {
  const tx0 = Math.floor((px + HALF) / G.tile), tz0 = Math.floor((pz + HALF) / G.tile), out: [number, number][] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push([tx0 + dx, tz0 + dz]);
  return out;
};
const tally = (tiles: [number, number][]): Record<number, number> => {
  const c: Record<number, number> = {};
  for (const [tx, tz] of tiles) {
    const d = grass.place(tx, tz);
    for (let i = 0; i < d.length; i += GRASS_STRIDE) c[d[i + 7]] = (c[d[i + 7]] ?? 0) + 1;
  }
  return c;
};
const jt = tally(tilesAround(sp.x, sp.z, 3));
console.log('jungle tiles, flag counts:', JSON.stringify(jt));
ok((jt[7] ?? 0) > 0, 'jungle tiles: clumps are flag 7');
ok((jt[1] ?? 0) === 0, 'jungle tiles: no flag 1 clumps (those would get seed plumes)');
const st = gen.sites[0];
const ot = tally([...tilesAround(st.x + 1250, st.z + 200, 3), ...tilesAround(st.x - 1300, st.z - 140, 3)]);
console.log('open-land tiles, flag counts:', JSON.stringify(ot));
ok((ot[1] ?? 0) > 20, 'open land: bunch-grass clumps (flag 1) exist');
const saved = G.patch.clumpChance;
G.patch.clumpChance = 0;
const off = tally(tilesAround(st.x + 1250, st.z + 200, 3));
G.patch.clumpChance = saved;
ok((off[1] ?? 0) === 0, 'patch.clumpChance 0 switches the open-land clumps off');
console.log(fails === 0 ? 'PASS grass reference' : `FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
