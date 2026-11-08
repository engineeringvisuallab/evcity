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
 * GRASS REWORK: small tufts are cut to `grass.thin` (~12 %), and the grass that stays is made of big CLUMPS (`grass.clump`, 60..110
 * blades each) on their own coarser grid, grown where it matters: road sides, around landmarks / placed buildings, lush meadow,
 * in groups with gaps between them. Every tuft / clump carries a flag (last float) so the main thread knows which model to use.
 */
export class GrassPlacer {
  private meadow: Noise2D;
  private sample: TerrainSample;
  private sx: TerrainSample;
  private sz: TerrainSample;
  private mask = new Float32Array(2);
  private zmask = new Float32Array(2);
  private group: Noise2D;
  /** Quality preset: chance multiplier (1 = every tuft). */
  mul = 1;

  constructor(private gen: TerrainGenerator, private plan: CityPlan, private seed: number, private trees: TreePlacer) {
    this.meadow = new Noise2D((seed ^ 0x3b9d27a1) >>> 0);
    this.group = new Noise2D((seed ^ 0x51ed270b) >>> 0);
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
    const C = G.clump;
    this.gen.roads.maskAt(x, z, C.roadStep, this.zmask);
    const road = this.zmask[1];
    if (road >= 1) return 1;
    const r = C.landmarkReach;
    const lm = this.nearLandmark(x, z, r) ? 1 : this.nearLandmark(x, z, r * 2) ? 0.5 : 0;
    return Math.max(road, lm);
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

        // 1. chance from noise only (most cells stop here)
        const patch = smooth(-0.35, 0.25, this.meadow.fbm(x / 45, z / 45, 2));
        let chance = (G.minChance + (G.maxChance - G.minChance) * patch) * this.mul * G.thin;
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
        out.push(x - ox, h - 0.03, z - oz, 0.55 + 0.95 * rScale ** 1.5, rYaw * Math.PI * 2, 0.85 + rTint * 0.3, dry, 0);
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

        // 1. where clumps are wanted: groups (noise) with gaps; road sides / landmarks full chance, open meadow only in lush patches
        const grp = smooth(-0.15, 0.3, this.group.fbm(x / C.groupScale, z / C.groupScale, 2));
        const lush = smooth(-0.35, 0.25, this.meadow.fbm(x / 45, z / 45, 2));
        let chance = (0.25 + 0.75 * grp) * this.mul;
        if (chance < 0.02) continue;
        const imp = this.importance(x, z);
        chance *= imp * C.chanceImportant + (1 - imp) * lush * C.chanceMeadow;
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
        out.push(x - ox, h - 0.03, z - oz, 0.75 + 0.7 * rScale ** 1.2, rYaw * Math.PI * 2, 0.85 + rTint * 0.3, dry, 1);
      }
    }
  }
}

