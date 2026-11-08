// Grass rework check: npx tsx scripts/grass-clump-test.ts
// ~80 % fewer grass instances than before, clumps only in important places, clumps respect the same no-grass rules, deterministic, LOD subset.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const mask = new Float32Array(2);

// sample tiles around the city sites and some open land
const spots: [number, number][] = [];
for (const s of gen.sites.slice(0, 4)) spots.push([s.x, s.z], [s.x + 220, s.z + 90], [s.x - 260, s.z - 140]);
const tilesOf = (px: number, pz: number): [number, number][] => {
  const tx0 = Math.floor((px + HALF) / G.tile), tz0 = Math.floor((pz + HALF) / G.tile);
  const r: [number, number][] = [];
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) r.push([tx0 + dx, tz0 + dz]);
  return r;
};

const count = (thin: number, clumps: boolean) => {
  const old = G.thin; G.thin = thin;
  const oldChance = G.clump.chanceImportant, oldM = G.clump.chanceMeadow;
  if (!clumps) { G.clump.chanceImportant = 0; G.clump.chanceMeadow = 0; }
  let tufts = 0, cl = 0;
  for (const [px, pz] of spots) for (const [tx, tz] of tilesOf(px, pz)) {
    const d = grass.place(tx, tz);
    for (let i = 0; i < d.length; i += GRASS_STRIDE) { if (d[i + 7] > 0.5) cl++; else tufts++; }
  }
  G.thin = old; G.clump.chanceImportant = oldChance; G.clump.chanceMeadow = oldM;
  return { tufts, cl };
};
const before = count(1, false); // the old behaviour: every tuft, no clumps
const after = count(G.thin, true);
const total = after.tufts + after.cl;
console.log(`before: ${before.tufts} tufts | after: ${after.tufts} tufts + ${after.cl} clumps = ${total} (${(100 - (100 * total) / before.tufts).toFixed(1)} % fewer instances)`);
// blades are what the GPU draws: a tuft has ~13 blades (9..18), a clump ~95 (80 / 110)
const bladesBefore = before.tufts * 13, bladesAfter = after.tufts * 13 + after.cl * 95;
console.log(`blades (approx): before ${(bladesBefore / 1e6).toFixed(2)} M, after ${(bladesAfter / 1e6).toFixed(2)} M (${(100 - (100 * bladesAfter) / bladesBefore).toFixed(1)} % fewer)`);
ok(total <= before.tufts * 0.2, 'grass: at least 80 % fewer instances than before');
ok(bladesAfter <= bladesBefore * 0.3, 'grass: at least 70 % fewer blades (what the GPU draws) than before');
ok(after.cl > 200, 'grass: clumps exist');

// clump rules
let bad = 0, nearRoad = 0, nearLm = 0, clumpsN = 0;
const fail = (m: string) => { if (bad++ < 10) console.log('  clump problem:', m); };
const s = gen.makeSample(), sx = gen.makeSample(), sz = gen.makeSample();
for (const [px, pz] of spots) for (const [tx, tz] of tilesOf(px, pz)) {
  const d = grass.place(tx, tz);
  const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
  for (let i = 0; i < d.length; i += GRASS_STRIDE) {
    if (d[i + 7] < 0.5) continue;
    clumpsN++;
    const x = ox + d[i], z = oz + d[i + 2];
    if (d[i] < 0 || d[i] >= G.tile || d[i + 2] < 0 || d[i + 2] >= G.tile) fail('outside its tile');
    gen.sample(x, z, s);
    if (!Number.isNaN(s.water) && s.h < s.water + 0.3) fail('in water');
    if (s.h < 3.5) fail('on the beach');
    gen.roads.maskAt(x, z, 1, mask);
    if (mask[1] > 0.01) fail('on a road');
    gen.sample(x + 1, z, sx); gen.sample(x, z + 1, sz);
    if (Math.hypot(sx.h - s.h, sz.h - s.h) >= G.maxSlope + 1e-6) fail('too steep');
    if (d[i + 3] < 0.74 || d[i + 3] > 1.46) fail('odd scale');
    gen.roads.maskAt(x, z, G.clump.roadStep, mask);
    if (mask[1] > 0.05) nearRoad++;
    if (gen.mall.contains(x, z, 48) || gen.evlab.contains(x, z, 48) || gen.library.contains(x, z, 48) || gen.agro.contains(x, z, 48) || gen.airport.contains(x, z, 48)) nearLm++;
  }
}
console.log(`clumps checked: ${clumpsN}, ${nearRoad} near a road, ${nearLm} near a landmark plot`);
ok(bad === 0, 'clumps: not in water / beach / on roads / on steep ground, inside their tile');
// density per land area: road sides must hold clearly more clumps than the open meadow
{
  let ptsNear = 0, ptsFar = 0, clNear = 0, clFar = 0;
  for (const [px, pz] of spots) for (const [tx, tz] of tilesOf(px, pz)) {
    const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
    for (let lz = 2; lz < G.tile; lz += 4) for (let lx = 2; lx < G.tile; lx += 4) {
      gen.sample(ox + lx, oz + lz, s);
      if (s.h < 3.5 || (!Number.isNaN(s.water) && s.h < s.water + 0.3)) continue;
      gen.roads.maskAt(ox + lx, oz + lz, 1, mask);
      if (mask[1] > 0.01) continue; // the road itself
      gen.roads.maskAt(ox + lx, oz + lz, G.clump.roadStep, mask);
      if (mask[1] > 0.05) ptsNear++; else ptsFar++;
    }
    const d = grass.place(tx, tz);
    for (let i = 0; i < d.length; i += GRASS_STRIDE) {
      if (d[i + 7] < 0.5) continue;
      gen.roads.maskAt(ox + d[i], oz + d[i + 2], G.clump.roadStep, mask);
      if (mask[1] > 0.05) clNear++; else clFar++;
    }
  }
  const dn = clNear / Math.max(1, ptsNear), df = clFar / Math.max(1, ptsFar);
  console.log(`clump density: road side ${dn.toFixed(3)} per 16 m2, elsewhere ${df.toFixed(3)} per 16 m2 (x${(dn / Math.max(df, 1e-9)).toFixed(1)})`);
  ok(dn > df * 2, 'clumps: road sides are at least 2x denser than open meadow (important places)');
}

// deterministic + LOD subset
const again = new GrassPlacer(new TerrainGenerator(Config.world.seed), plan, Config.world.seed, trees);
const [t0x, t0z] = tilesOf(spots[0][0], spots[0][1])[24];
const a = grass.place(t0x, t0z), b = again.place(t0x, t0z);
ok(a.length === b.length && a.every((v, i) => v === b[i]), 'deterministic');
const full = grass.place(t0x, t0z, 1), coarse = grass.place(t0x, t0z, 5);
const set = new Set<string>();
for (let i = 0; i < full.length; i += GRASS_STRIDE) set.add(`${full[i].toFixed(4)},${full[i + 2].toFixed(4)},${full[i + 7]}`);
let sub = true;
for (let i = 0; i < coarse.length; i += GRASS_STRIDE) if (!set.has(`${coarse[i].toFixed(4)},${coarse[i + 2].toFixed(4)},${coarse[i + 7]}`)) sub = false;
ok(sub, 'far ring (stride 5) = subset of the full tile, tufts and clumps');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
