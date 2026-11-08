// GRASS 4 measurement: npx tsx scripts/grass4-perf.ts
// Instances and triangles (grass + roadside models) around the player near the city and in the countryside, and the CPU cost of building them.
// Frame time on a GPU cannot be measured in a script: the numbers here are the draw load; check fps in the browser with the debug HUD.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GrassAssets } from '../src/vegetation/GrassAssets';
import { GRASS_STRIDE, GrassType } from '../src/vegetation/TreeTypes';
import { RoadsideView } from '../src/roads/RoadsideView';
import * as THREE from 'three';

const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const assets = new GrassAssets();
const tri = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const roadside = new RoadsideView(new THREE.Group(), gen);

let seedN = 1;
const rnd = (): number => { seedN = (seedN * 1664525 + 1013904223) >>> 0; return seedN / 4294967296; };
/** Same type mix as GrassManager.install (flowers use the patch-free average). */
function typeOf(flag: number, ring: number): number {
  const h1 = rnd(), h2 = rnd(), h3 = rnd();
  if ((flag > 0.5 && flag < 1.5) || flag > 2.5) return h1 < 0.55 ? GrassType.tussock : GrassType.tussockWide;
  if (flag > 1.5) {
    if (ring === 0 && h2 < G.city.flowerShare) return h3 < 0.5 ? GrassType.daisy : h3 < 0.8 ? GrassType.clover : GrassType.buttercup;
    return h1 < 0.82 ? GrassType.lawn : h1 < 0.94 ? GrassType.clump : GrassType.wild;
  }
  if (ring === 0 && h2 < G.flowerScatter) return GrassType.daisy;
  return h1 < 0.32 ? GrassType.wild : h1 < 0.62 ? GrassType.lawn : h1 < 0.88 ? GrassType.clump : GrassType.seed;
}

function measure(name: string, px: number, pz: number): void {
  const t0 = performance.now();
  const rings = [0, 0, 0];
  const ringTris = [0, 0, 0];
  let tiles = 0;
  const R = G.radius + G.tile;
  const tx0 = Math.floor((px - R + HALF) / G.tile), tx1 = Math.floor((px + R + HALF) / G.tile);
  const tz0 = Math.floor((pz - R + HALF) / G.tile), tz1 = Math.floor((pz + R + HALF) / G.tile);
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    const cx = tx * G.tile - HALF + G.tile / 2, cz = tz * G.tile - HALF + G.tile / 2;
    const d = Math.hypot(cx - px, cz - pz);
    if (d > G.radius) continue;
    let ring = G.lods.length - 1;
    for (let i = 0; i < G.lods.length; i++) if (d < G.lods[i].to) { ring = i; break; }
    const data = grass.place(tx, tz, G.lods[ring].stride);
    tiles++;
    const n = data.length / GRASS_STRIDE;
    rings[ring] += n;
    for (let i = 0; i < n; i++) ringTris[ring] += tri(assets.lodGeometries[ring][typeOf(Math.round(data[i * GRASS_STRIDE + 7]), ring)]);
  }
  const ms = performance.now() - t0;
  roadside.update(1, px, pz);
  const inst = rings[0] + rings[1] + rings[2];
  const trisG = ringTris[0] + ringTris[1] + ringTris[2];
  console.log(`${name.padEnd(26)} tiles ${String(tiles).padStart(3)} | grass instances ${String(inst).padStart(7)} (rings ${rings.join(' / ')}) | grass triangles ${(trisG / 1e6).toFixed(2)} M | roadside ${roadside.drawnInstances} inst, ${(roadside.drawnTriangles / 1e3).toFixed(0)} k tri | placement CPU ${(ms / tiles).toFixed(0)} ms / tile (worker side)`);
}

// viewpoints: a point on a local street in the city, the middle of the city's open lawn, a highway verge in the country, an open meadow
const local = gen.roads.roads.find((r) => r.tier === 4)!;
const mid = Math.floor(local.xs.length / 2);
const hw = gen.roads.roads.filter((r) => r.kind === 'highway' && !r.earth).map((r) => ({ r, i: Math.floor(r.xs.length * 0.5) })).find(({ r, i }) => !gen.roads.isCityPoint(r.xs[i], r.zs[i]))!;
measure('city street', local.xs[mid], local.zs[mid]);
measure('city lawn (park side)', gen.sites[0].x + 200, gen.sites[0].z + 100);
measure('highway verge (country)', hw.r.xs[hw.i], hw.r.zs[hw.i]);
measure('open meadow (country)', gen.sites[0].x + 1250, gen.sites[0].z + 200);
console.log('roadside totals:', JSON.stringify(roadside.stats));
