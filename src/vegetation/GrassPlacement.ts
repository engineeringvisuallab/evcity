import { Config } from '../core/Config';
import type { CityPlan } from '../city/CityPlan';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { TerrainSample } from '../terrain/Lakes';
import { Noise2D } from '../terrain/Noise';
import { hash2D, mulberry32 } from '../world/Seed';
import type { TreePlacer } from './TreePlacement';
import { placementContains } from '../buildings/Placements';
import { farmCovers } from '../farm/FarmFields';


const V = Config.vegetation;
const G = V.grass;
const HALF = Config.world.size / 2;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * STAGE 7 (step 2): grass tufts of ONE tile (`grass.tile` metres square, world grid). Same method as the trees: a fixed
 * global grid of small cells (`grass.cell`), one random stream per cell, so a tuft is always at the same place whichever
 * tile asks. Meadows (noise) with bare patches, thinner inside forests; none on water, beach, roads, steep ground or
 * high up; half as many inside planned city areas.
 *
 * GRASS PATCHES (rework): the land is not covered evenly. A low-frequency noise (`grass.patch`) makes patches: inside, dense tufts plus big
 * CLUMPS (`grass.clump`, 60..110 blades each, own coarser grid, overlapping); outside, bare soil; at the soft rim fewer and smaller ones.
 * Road sides and landmark plots are pulled into a patch. Every tuft / clump carries a flag (last float) so the main thread knows which model to use.
 */
export class GrassPlacer {
  private meadow: Noise2D;
  private sample: TerrainSample;
  private sx: TerrainSample;
  private sz: TerrainSample;
  private mask = new Float32Array(2);
  private zmask = new Float32Array(2);
  private patchNoise: Noise2D;
  private thr = 0;
  private thrKey = -1;
  /** importance field (road sides, landmarks) of recently used tiles: 2 m nodes, shared by the tufts, the clumps and `patchAt`. */
  private gridCache = new Map<string, Float32Array>();
  /** Quality preset: chance multiplier (1 = every tuft). */
  mul = 1;

  constructor(private gen: TerrainGenerator, private plan: CityPlan, private seed: number, private trees: TreePlacer) {
    this.meadow = new Noise2D((seed ^ 0x3b9d27a1) >>> 0);
    this.patchNoise = new Noise2D((seed ^ 0x2f6b1d37) >>> 0);
    this.sample = gen.makeSample();
    this.sx = gen.makeSample();
    this.sz = gen.makeSample();
  }

  /** 1 outside cities, `cityChance` inside a planned city, blending back over `cityFadeOut` metres outside it. */
  private cityFactor(x: number, z: number): number {
    const sites = this.gen.sites;
    for (let i = 0; i < sites.length; i++) {
      const d = Math.hypot(x - sites[i].x, z - sites[i].z);
      const R = this.plan.maxRadius(i);
      if (d >= R + V.cityFadeOut) continue;
      if (d < R) return G.cityChance;
      return G.cityChance + (1 - G.cityChance) * smooth(R, R + V.cityFadeOut, d);
    }
    return 1;
  }

  /** True on roads, rail, ports, airports and every plot / pad / field where no grass may grow (the same list for tufts and clumps). */
  private blocked(x: number, z: number): boolean {
    this.gen.roads.maskAt(x, z, 1, this.mask);
    if (this.mask[1] > 0.01) return true;
    if (this.gen.railForm.inCorridor(x, z, 0)) return true;
    if (this.gen.portForm.inFootprint(x, z, 0)) return true; // STAGE 14: sea port
    if (this.gen.airport.contains(x, z, 1)) return true; // airport pad
    if (this.gen.airportSea.contains(x, z, 1)) return true; // sea airport pad + causeway
    if (this.gen.army.contains(x, z, 1)) return true; // army camp
    if (this.gen.mall.contains(x, z, 1)) return true; // City Mall plot
    if (this.gen.evlab.contains(x, z, 1)) return true; // EVLab campus plot
    if (this.gen.library.contains(x, z, 1)) return true; // City Library plot
    if (this.gen.protoBuilding.contains(x, z, 1)) return true; // prototype building plot
    if (placementContains(x, z, 1)) return true; // placed buildings
    if (this.gen.agro.contains(x, z, 1)) return true; // Agro institute pad
    if (farmCovers(x, z, 0.5)) return true; // crop fields
    if (this.gen.infra.some((s) => s.contains(x, z, 1))) return true; // SWTP / STP plot
    return false;
  }

  /** Is (x, z) within `margin` metres of a landmark plot or a placed building? */
  private nearLandmark(x: number, z: number, margin: number): boolean {
    const g = this.gen;
    return (
      g.mall.contains(x, z, margin) ||
      g.evlab.contains(x, z, margin) ||
      g.library.contains(x, z, margin) ||
      g.protoBuilding.contains(x, z, margin) ||
      g.agro.contains(x, z, margin) ||
      g.airport.contains(x, z, margin) ||
      g.airportSea.contains(x, z, margin) ||
      g.army.contains(x, z, margin) ||
      placementContains(x, z, margin) ||
      g.infra.some((s) => s.contains(x, z, margin))
    );
  }

  /** 0..1: how "important" the ground is (road side, around landmarks and buildings). Clumps grow there. */
  private importance(x: number, z: number): number {
    const P = G.patch;
    this.gen.roads.maskAt(x, z, P.roadStep, this.zmask);
    const road = this.zmask[1];
    if (road >= 1) return 1;
    const r = P.landmarkReach;
    return this.nearLandmark(x, z, r) ? 1 : road;
  }

  /** Noise value (about -1..1) above which the land is in a patch: the upper `coverage` share of the noise (found once per setting from the seed). */
  private threshold(): number {
    const P = G.patch;
    const key = P.coverage * 1000 + P.scale;
    if (key !== this.thrKey) {
      const n = 90;
      const step = Config.world.size / n;
      const vals = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = this.patchNoise.fbm((-HALF + (i + 0.5) * step + 13.7) / P.scale, (-HALF + (j + 0.5) * step - 9.1) / P.scale, 2);
      vals.sort();
      this.thr = vals[Math.min(n * n - 1, Math.max(0, Math.floor((1 - P.coverage) * n * n)))];
      this.thrKey = key;
    }
    return this.thr;
  }

  /** The noise part of the patch value only (0 = bare soil .. 1 = core), without road sides / landmarks. */
  patchBase(x: number, z: number): number {
    const P = G.patch;
    const t = this.threshold();
    return smooth(t, t + P.edge, this.patchNoise.fbm(x / P.scale, z / P.scale, 2));
  }

  /** Importance (road sides, landmarks) on a 2 m grid of tile (tx, tz): (n + 1)^2 nodes, cached. */
  private importanceGrid(tx: number, tz: number): Float32Array {
    const key = `${tx},${tz}`;
    let g = this.gridCache.get(key);
    if (g) return g;
    const P = G.patch;
    const n = Math.round(G.tile / P.gridStep);
    g = new Float32Array((n + 1) * (n + 1));
    if (P.boost > 0) {
      const ox = tx * G.tile - HALF;
      const oz = tz * G.tile - HALF;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) g[j * (n + 1) + i] = this.importance(ox + i * P.gridStep, oz + j * P.gridStep);
    }
    if (this.gridCache.size >= 96) this.gridCache.delete(this.gridCache.keys().next().value as string);
    this.gridCache.set(key, g);
    return g;
  }

  /** Patch value at (x, z) inside tile (tx, tz): the noise patch, pulled up to `boost` next to roads and landmarks. */
  private patchIn(x: number, z: number, tx: number, tz: number, grid: Float32Array): number {
    const P = G.patch;
    const base = this.patchBase(x, z);
    if (P.boost <= 0) return base;
    const n = Math.round(G.tile / P.gridStep);
    const u = (x - (tx * G.tile - HALF)) / P.gridStep;
    const v = (z - (tz * G.tile - HALF)) / P.gridStep;
    const i = Math.min(n - 1, Math.max(0, Math.floor(u)));
    const j = Math.min(n - 1, Math.max(0, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - i));
    const fz = Math.min(1, Math.max(0, v - j));
    const w = n + 1;
    const a = grid[j * w + i] + (grid[j * w + i + 1] - grid[j * w + i]) * fx;
    const b = grid[(j + 1) * w + i] + (grid[(j + 1) * w + i + 1] - grid[(j + 1) * w + i]) * fx;
    const imp = a + (b - a) * fz;
    return Math.max(base, smooth(0.3, 0.6, imp) * P.boost); // road side / landmark patches have the same soft rim as the noise patches
  }

  /** Patch value (0 = bare soil .. 1 = core of a patch) at world (x, z): the same number the tufts and clumps are placed with. */
  patchAt(x: number, z: number): number {
    const tx = Math.floor((x + HALF) / G.tile);
    const tz = Math.floor((z + HALF) / G.tile);
    return this.patchIn(x, z, tx, tz, this.importanceGrid(tx, tz));
  }

  /** Tufts and clumps of tile (tx, tz), tile-local coordinates, GRASS_STRIDE floats each. */
  place(tx: number, tz: number, stride = 1): Float32Array {
    const per = Math.round(G.tile / G.cell);
    const ox = tx * G.tile - HALF;
    const oz = tz * G.tile - HALF;
    const gx0 = tx * per;
    const gz0 = tz * per;
    const out: number[] = [];
    const s = this.sample;
    const P = G.patch;
    const grid = this.importanceGrid(tx, tz);

    // stride > 1 (far LOD rings): only every stride-th cell of the global cell grid, so these tufts are exactly a subset of the full tile
    for (let j = 0; j < per; j += stride) {
      for (let i = 0; i < per; i += stride) {
        const rng = mulberry32(hash2D(this.seed ^ 0x6a55c, gx0 + i, gz0 + j));
        const roll = rng();
        const jx = rng();
        const jz = rng();
        const rScale = rng();
        const rYaw = rng();
        const rTint = rng();
        const rDry = rng();
        const x = ox + (i + jx) * G.cell;
        const z = oz + (j + jz) * G.cell;

        // 1. chance from noise only (most cells stop here): never a tuft outside a patch, fewer and smaller at its rim
        const patch = this.patchIn(x, z, tx, tz, grid);
        if (patch < P.minValue) continue;
        const rim = smooth(P.minValue, P.coreAt, patch); // 0 at the rim .. 1 in the core
        const lush = smooth(-0.35, 0.25, this.meadow.fbm(x / 45, z / 45, 2));
        let chance = (G.minChance + (G.maxChance - G.minChance) * lush) * this.mul * P.density * rim;
        chance *= 1 - G.forestThin * this.trees.forestAt(x, z);
        if (roll >= chance) continue;

        // 2. terrain tests
        this.gen.sample(x, z, s);
        const h = s.h;
        if (!Number.isNaN(s.water) && h < s.water + 0.3) continue;
        chance *= smooth(3.5, 8, h) * (1 - smooth(G.heightFadeStart, G.heightFadeEnd, h));
        if (roll >= chance) continue;
        this.gen.sample(x + 1, z, this.sx);
        this.gen.sample(x, z + 1, this.sz);
        const slope = Math.hypot(this.sx.h - h, this.sz.h - h);
        if (slope >= G.maxSlope) continue;
        chance *= 1 - smooth(G.slopeFadeFrom, G.maxSlope, slope);
        chance *= this.cityFactor(x, z);
        if (roll >= chance) continue;
        if (this.blocked(x, z)) continue;

        const dry = Math.min(1, Math.max(0, smooth(G.dryFrom, G.dryTo, h) + (rDry - 0.5) * 0.2));
        out.push(x - ox, h - 0.03, z - oz, (0.55 + 0.95 * rScale ** 1.5) * (P.edgeScale + (1 - P.edgeScale) * rim), rYaw * Math.PI * 2, 0.85 + rTint * 0.3, dry, 0);
      }
    }
    this.placeClumps(tx, tz, stride, out);
    return new Float32Array(out);
  }

  /**
   * Big grass clumps of one tile on their own grid (`grass.clump.cell`). Positions are fixed per global cell, so a coarse LOD ring
   * (`clumpStride` > 1) is exactly a subset of the full tile. Appended to `out` with the clump flag = 1.
   */
  private placeClumps(tx: number, tz: number, stride: number, out: number[]): void {
    const C = G.clump;
    const lod = G.lods.find((l) => l.stride === stride);
    const cs = lod ? lod.clumpStride : 1;
    const per = Math.round(G.tile / C.cell);
    const ox = tx * G.tile - HALF;
    const oz = tz * G.tile - HALF;
    const gx0 = tx * per;
    const gz0 = tz * per;
    const s = this.sample;
    const P = G.patch;
    const grid = this.importanceGrid(tx, tz);
    for (let j = 0; j < per; j += cs) {
      for (let i = 0; i < per; i += cs) {
        const rng = mulberry32(hash2D(this.seed ^ 0x7c1a9, gx0 + i, gz0 + j));
        const roll = rng();
        const jx = rng();
        const jz = rng();
        const rScale = rng();
        const rYaw = rng();
        const rTint = rng();
        const rDry = rng();
        const x = ox + (i + jx) * C.cell;
        const z = oz + (j + jz) * C.cell;

        // 1. clumps only inside patches (close together, overlapping), fewer and smaller at the rim
        const patch = this.patchIn(x, z, tx, tz, grid);
        if (patch < P.minValue) continue;
        const rim = smooth(P.minValue, P.coreAt, patch);
        let chance = P.clumpChance * smooth(0.25, 0.85, patch) * this.mul;
        chance *= 1 - G.forestThin * this.trees.forestAt(x, z);
        if (roll >= chance) continue;

        // 2. terrain tests (same rules as the tufts)
        this.gen.sample(x, z, s);
        const h = s.h;
        if (!Number.isNaN(s.water) && h < s.water + 0.3) continue;
        chance *= smooth(3.5, 8, h) * (1 - smooth(G.heightFadeStart, G.heightFadeEnd, h));
        if (roll >= chance) continue;
        this.gen.sample(x + 1, z, this.sx);
        this.gen.sample(x, z + 1, this.sz);
        const slope = Math.hypot(this.sx.h - h, this.sz.h - h);
        if (slope >= G.maxSlope) continue;
        chance *= 1 - smooth(G.slopeFadeFrom, G.maxSlope, slope);
        chance *= this.cityFactor(x, z);
        if (roll >= chance) continue;
        if (this.blocked(x, z)) continue;

        const dry = Math.min(1, Math.max(0, smooth(G.dryFrom, G.dryTo, h) + (rDry - 0.5) * 0.2));
        out.push(x - ox, h - 0.03, z - oz, (0.75 + 0.7 * rScale ** 1.2) * (P.edgeScale + (1 - P.edgeScale) * rim), rYaw * Math.PI * 2, 0.85 + rTint * 0.3, dry, 1);
      }
    }
  }
}

