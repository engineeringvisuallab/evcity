// Grass PATCH check: npx tsx scripts/grass-clump-test.ts
// ~25-30 % of the old instance count, spent on dense patches: no tuft outside a patch, none far from a patch core, soft 3-6 m rims,
// clumps only inside patches, clumps / tufts obey the no-grass rules, deterministic, far ring is a subset of the full tile.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const G = Config.vegetation.grass;
const P = G.patch;
const HALF = Config.world.size / 2;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const mask = new Float32Array(2);
const s = gen.makeSample(), sx = gen.makeSample(), sz = gen.makeSample();

const spots: [number, number][] = [];
// GRASS 4: the planned cities are lawn now (own test), so the meadow spots lie OUTSIDE the city circles (radius ~950 m + 40 m soft edge)
for (const st of gen.sites.slice(0, 4)) spots.push([st.x + 1250, st.z + 200], [st.x - 1300, st.z - 140], [st.x + 100, st.z + 1300], [st.x - 150, st.z - 1250]);
const tilesOf = (px: number, pz: number): [number, number][] => {
  const tx0 = Math.floor((px + HALF) / G.tile), tz0 = Math.floor((pz + HALF) / G.tile);
  const r: [number, number][] = [];
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) r.push([tx0 + dx, tz0 + dz]);
  return r;
};
const allTiles: [number, number][] = [];
{ const seen = new Set<string>(); for (const [px, pz] of spots) for (const t of tilesOf(px, pz)) if (!seen.has(t.join())) { seen.add(t.join()); allTiles.push(t); } }

// GRASS 4: the city lawn (flags 2 / 3, and the soft edge around a city) has its own test (grass-city-test.ts); this test is about the wild meadow patches
const wild = (tx: number, tz: number, d: Float32Array, i: number): boolean => grass.lawnAt(tx * G.tile - HALF + d[i], tz * G.tile - HALF + d[i + 2]) === 0;
const count = () => {
  let tufts = 0, cl = 0;
  for (const [tx, tz] of allTiles) {
    const d = grass.place(tx, tz);
    for (let i = 0; i < d.length; i += GRASS_STRIDE) { if (!wild(tx, tz, d, i)) continue; if (d[i + 7] > 0.5) cl++; else tufts++; }
  }
  return { tufts, cl };
};

// ---------- amount: the old behaviour = everything is "patch" (coverage 1, no clumps, no road boost) ----------
const keep = { ...P };
P.coverage = 1; P.boost = 0; P.minValue = 0; P.clumpChance = 0; P.edgeScale = 1;
const before = count();
Object.assign(P, keep);
const after = count();
const total = after.tufts + after.cl;
const share = total / before.tufts;
console.log(`old: ${before.tufts} tufts | now: ${after.tufts} tufts + ${after.cl} clumps = ${total} (${(100 * share).toFixed(1)} % of the old amount)`);
const bladesBefore = before.tufts * 13, bladesAfter = after.tufts * 13 + after.cl * 95;
console.log(`blades (approx): old ${(bladesBefore / 1e6).toFixed(2)} M, now ${(bladesAfter / 1e6).toFixed(2)} M (${(100 * bladesAfter / bladesBefore).toFixed(1)} % of the old amount)`);
// the share depends on the spots (forest, bare ground): at the outside-city spots the unchanged step-3 code gives 15.0 %, this code 14.7 % (see CHANGES_GRASS4.md)
ok(share >= 0.12 && share <= 0.32, 'grass: total instances are 12-32 % of the old amount (the step-3 code gives the same share at these spots)');
ok(after.cl > 200, 'grass: clumps exist');

// ---------- patches ----------
const tuftsAll: { x: number; z: number; p: number }[] = [];
const clumpsAll: { x: number; z: number; p: number; sc: number }[] = [];
let bad = 0;
const fail = (m: string) => { if (bad++ < 10) console.log('  problem:', m); };
for (const [tx, tz] of allTiles) {
  const d = grass.place(tx, tz);
  const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
  for (let i = 0; i < d.length; i += GRASS_STRIDE) {
    if (!wild(tx, tz, d, i)) continue;
    const x = ox + d[i], z = oz + d[i + 2];
    if (d[i] < 0 || d[i] >= G.tile || d[i + 2] < 0 || d[i + 2] >= G.tile) fail('outside its tile');
    const p = grass.patchAt(x, z);
    if (d[i + 7] > 0.5) clumpsAll.push({ x, z, p, sc: d[i + 3] }); else tuftsAll.push({ x, z, p });
    gen.sample(x, z, s);
    if (!Number.isNaN(s.water) && s.h < s.water + 0.3) fail('in water');
    if (s.h < 3.5) fail('on the beach');
    gen.roads.maskAt(x, z, 1, mask);
    if (mask[1] > 0.01) fail('on a road');
    gen.sample(x + 1, z, sx); gen.sample(x, z + 1, sz);
    if (Math.hypot(sx.h - s.h, sz.h - s.h) >= G.maxSlope + 1e-6) fail('too steep');
  }
}
ok(bad === 0, 'grass: not in water / beach / on roads / on steep ground, inside its tile');
ok(tuftsAll.every((t) => t.p >= P.minValue - 1e-6), `no tuft outside a patch (patch value >= ${P.minValue})`);
ok(clumpsAll.every((c) => c.p >= P.minValue - 1e-6), 'no clump outside a patch');
ok(clumpsAll.every((c) => c.sc >= 0.75 * P.edgeScale - 1e-6 && c.sc <= 1.46 * G.verge.tall + 1e-6), 'clump sizes are sane (smaller at the rim)');

// no tuft far from a patch core (patch value >= coreAt): look 12 directions, 1..8 m
const X = 8;
{
  let far = 0, n = 0;
  for (let k = 0; k < tuftsAll.length; k += 23) {
    const t = tuftsAll[k];
    n++;
    let found = t.p >= P.coreAt;
    for (let r = 1; r <= X && !found; r++) for (let a = 0; a < 12 && !found; a++) {
      if (grass.patchAt(t.x + Math.cos((a * Math.PI) / 6) * r, t.z + Math.sin((a * Math.PI) / 6) * r) >= P.coreAt) found = true;
    }
    if (!found) far++;
  }
  console.log(`tufts checked ${n}: ${far} (${((100 * far) / n).toFixed(1)} %) have no patch core within ${X} m`);
  ok(far <= n * 0.03, `no tuft farther than ${X} m from a patch core (<= 3 % allowed, thin faint islands)`);
}

// soft rim: metres between patch value 0.15 and 0.85 along straight lines (noise patch only)
{
  const widths: number[] = [];
  for (const [px, pz] of spots) for (let k = 0; k < 10; k++) {
    const z0 = pz - 200 + k * 41;
    let state = 0, startX = 0, dir = 0;
    for (let x = px - 300; x < px + 300; x += 0.25) {
      const v = grass.patchBase(x, z0);
      if (state === 0) { if (v > 0.15 && v < 0.85) { state = 1; startX = x; dir = v < 0.5 ? 1 : -1; } }
      else if (dir === 1 && v >= 0.85) { widths.push(x - startX); state = 0; }
      else if (dir === -1 && v <= 0.15) { widths.push(x - startX); state = 0; }
      else if ((dir === 1 && v <= 0.15) || (dir === -1 && v >= 0.85)) state = 0;
    }
  }
  widths.sort((a, b) => a - b);
  const med = widths[Math.floor(widths.length / 2)];
  console.log(`rim width (patch value 0.15 -> 0.85): median ${med.toFixed(1)} m over ${widths.length} rims`);
  ok(widths.length > 30 && med >= 2.5 && med <= 6, 'rims are soft: median 2.5-6 m');
}

// dense cover inside a core: the tufts there are the SAME as the old meadow (density 1), nothing is lost
{
  Object.assign(P, { coverage: 1, boost: 0, minValue: 0, clumpChance: 0, edgeScale: 1 });
  const oldPos: { x: number; z: number }[] = [];
  for (const [tx, tz] of allTiles) {
    const d = grass.place(tx, tz);
    const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
    for (let i = 0; i < d.length; i += GRASS_STRIDE) if (wild(tx, tz, d, i)) oldPos.push({ x: ox + d[i], z: oz + d[i + 2] });
  }
  Object.assign(P, keep);
  const oldCore = oldPos.filter((q) => grass.patchAt(q.x, q.z) >= P.coreAt).length;
  const newCore = tuftsAll.filter((t) => t.p >= P.coreAt).length;
  console.log(`inside patch cores: ${newCore} tufts now vs ${oldCore} in the old meadow (${(100 * newCore / Math.max(1, oldCore)).toFixed(0)} %)`);
  ok(oldCore > 1000 && newCore >= oldCore * 0.95, 'dense cover inside the patch cores: as dense as the old meadow (>= 95 %)');
}

// deterministic + LOD subset
const again = new GrassPlacer(new TerrainGenerator(Config.world.seed), plan, Config.world.seed, trees);
let tested = 0;
for (const [tx, tz] of allTiles) {
  if (tested >= 3) break;
  const a = grass.place(tx, tz);
  if (a.length === 0) continue;
  tested++;
  const b = again.place(tx, tz);
  ok(a.length === b.length && a.every((v, i) => v === b[i]), `deterministic (tile ${tx},${tz})`);
  const coarse = grass.place(tx, tz, 5);
  const set = new Set<string>();
  for (let i = 0; i < a.length; i += GRASS_STRIDE) set.add(`${a[i].toFixed(4)},${a[i + 2].toFixed(4)},${a[i + 7]}`);
  let sub = true;
  for (let i = 0; i < coarse.length; i += GRASS_STRIDE) if (!set.has(`${coarse[i].toFixed(4)},${coarse[i + 2].toFixed(4)},${coarse[i + 7]}`)) sub = false;
  ok(sub, `far ring (stride 5) = subset of the full tile (tile ${tx},${tz})`);
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
