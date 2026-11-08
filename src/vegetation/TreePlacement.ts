import { Config } from '../core/Config';
import type { CityPlan } from '../city/CityPlan';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { Noise2D } from '../terrain/Noise';
import type { TerrainSample } from '../terrain/Lakes';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import { hash2D, mulberry32 } from '../world/Seed';
import { placementContains } from '../buildings/Placements';
import { farmCovers } from '../farm/FarmFields';
import { streetTreesInChunk } from '../roads/Roadside';
import { TREE_KIND_COUNT, TreeKind, type TreeChunkData } from './TreeTypes';

/**
 * STAGE 7 (step 1): where do forest trees stand?  Pure function of (seed, chunk): runs in the chunk worker.
 *
 * - The world is cut into a fixed grid of `cellSize` metres (global, NOT per chunk and NOT per LOD), every cell has its
 *   own random stream. So a tree is always at the same place, whatever chunk or LOD asks for it.
 * - A smooth noise field makes forests (patches) with a few scattered trees in between.
 * - A tree is dropped when it would stand in water, on a beach, on a steep slope, near a road / junction pad, above the
 *   tree line or inside a planned city area (except green / recreation zones, see Config.vegetation.cityZoneChance).
 */

const V = Config.vegetation;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Reusable per-worker state (noise tables are built once). */
export class TreePlacer {
  private forestNoise: Noise2D;
  private kindNoise: Noise2D;
  private sample: TerrainSample;
  private sx: TerrainSample;
  private sz: TerrainSample;
  private mask = new Float32Array(2);
  private tanMax = Math.tan((V.maxSlopeDeg * Math.PI) / 180);
  /** Quality preset: chance multiplier (1 = the full forest). The same roll is used, so a lower value only removes trees, never moves them. */
  mul = 1;

  constructor(private gen: TerrainGenerator, private plan: CityPlan, private seed: number) {
    this.forestNoise = new Noise2D((seed ^ 0x7e3d1a5b) >>> 0);
    this.kindNoise = new Noise2D((seed ^ 0x2c9f4e67) >>> 0);
    this.sample = gen.makeSample();
    this.sx = gen.makeSample();
    this.sz = gen.makeSample();
  }

  /** Forest density 0..1 at a point (before terrain tests). */
  forestAt(x: number, z: number): number {
    const k = 1 / V.forestScale;
    const n = this.forestNoise.fbm(x * k, z * k, 3) + this.forestNoise.noise(x / 55, z / 55) * 0.12;
    return smooth(-0.12, 0.3, n);
  }

  /** 0..1 multiplier from city plans: 1 far from cities, 0 in built-up areas, `cityZoneChance` in green zones. */
  cityFactor(x: number, z: number): number {
    const sites = this.gen.sites;
    for (let i = 0; i < sites.length; i++) {
      const d = Math.hypot(x - sites[i].x, z - sites[i].z);
      const R = this.plan.maxRadius(i);
      if (d >= R + V.cityFadeOut) continue;
      if (d >= R) return smooth(R, R + V.cityFadeOut, d);
      const area = this.plan.areaAt(x, z);
      return area ? V.cityZoneChance[area.kind] ?? 0 : 0;
    }
    return 1;
  }

  private nearRoad(x: number, z: number): boolean {
    // STAGE 12: nothing grows in the railway corridor (embankment / cutting slopes, viaduct footprint, railway land)
    if (this.gen.railForm.inCorridor(x, z, 3)) return true;
    if (this.gen.portForm.inFootprint(x, z, 4)) return true; // STAGE 14: sea port
    if (this.gen.airport.contains(x, z, 4)) return true; // airport pad
    if (this.gen.airportSea.contains(x, z, 4)) return true; // sea airport pad + causeway
    if (this.gen.army.contains(x, z, 4)) return true; // army camp
    if (this.gen.mall.contains(x, z, 4)) return true; // City Mall plot
    if (this.gen.evlab.contains(x, z, 4)) return true; // EVLab campus plot
    if (this.gen.library.contains(x, z, 4)) return true; // City Library plot
    if (this.gen.protoBuilding.contains(x, z, 4)) return true; // prototype building plot
    if (placementContains(x, z, 4)) return true; // placed buildings
    if (this.gen.agro.contains(x, z, 4)) return true; // Agro institute pad
    if (farmCovers(x, z, 3)) return true; // crop fields
    for (const s of this.gen.infra) if (s.contains(x, z, 6)) return true; // SWTP / STP plot
    const r = this.gen.roads;
    const m = this.mask;
    const c = V.roadClear;
    r.maskAt(x, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x + c, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x - c, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x, z + c, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x, z - c, 1, m);
    return m[1] > 0.01;
  }

  /**
   * The tree of ONE global cell (gi, gj) of the `cellSize` grid, or null. All the logic of `place` lives here, so `place` (per chunk) and
   * `treesInRect` (per area, used by the grass placer for the clumps at tree bases) can never disagree about where a tree stands.
   */
  private cellTree(gi: number, gj: number): { kind: number; x: number; y: number; z: number; scale: number; yaw: number; tint: number } | null {
    const S = Config.world.chunkSize;
    const cell = V.cellSize;
    const perSide = Math.round(S / cell);
    const cx = Math.floor(gi / perSide);
    const cz = Math.floor(gj / perSide);
    const i = gi - cx * perSide;
    const j = gj - cz * perSide;
    const ox = chunkOriginX(cx);
    const oz = chunkOriginZ(cz);
    const s = this.sample;
    const rng = mulberry32(hash2D(this.seed ^ 0x5eed7, gi, gj));
    const roll = rng();
    const jx = rng();
    const jz = rng();
    const rScale = rng();
    const rYaw = rng();
    const rTint = rng();
    const rKind = rng();
    const rVar = rng(); // which broadleaf shape (drawn last, so every older value - and every tree position - stays the same)
    const x = ox + (i + jx) * cell;
    const z = oz + (j + jz) * cell;

    // 1. cheap chance test first (noise only): most cells stop here
    const f = this.forestAt(x, z);
    let chance = (V.scatterChance + (V.forestChance - V.scatterChance) * f) * this.mul;
    if (roll >= chance) return null;

    // 2. terrain tests
    this.gen.sample(x, z, s);
    const h = s.h;
    if (h < V.seaMargin) return null;
    if (!Number.isNaN(s.water) && h < s.water + V.waterMargin) return null;
    const line = 1 - smooth(V.treeLineStart, V.treeLineEnd, h);
    if (line <= 0) return null;

    // slope from two neighbours 2 m away
    this.gen.sample(x + 2, z, this.sx);
    this.gen.sample(x, z + 2, this.sz);
    const slope = Math.hypot(this.sx.h - h, this.sz.h - h) / 2;
    if (slope > this.tanMax) return null;
    const slopeFactor = 1 - smooth(this.tanMax * 0.6, this.tanMax, slope);

    // 3. fade by tree line, slope and city plan: re-use the same roll so the tree set only ever shrinks
    chance *= line * slopeFactor * this.cityFactor(x, z);
    if (roll >= chance) return null;
    if (this.nearRoad(x, z)) return null;

    // 4. which tree?
    let kind: number = TreeKind.broadleaf;
    const pineChance = smooth(V.pineFrom, V.pineFull, h);
    const palmChance = h < V.palmBelow ? 0.45 * smooth(-0.1, 0.35, this.kindNoise.fbm(x / 260 + 40, z / 260, 2)) : 0;
    if (rKind < pineChance) kind = TreeKind.pine;
    else if (rKind > 1 - palmChance) kind = TreeKind.palm;
    else kind = rVar < 0.3 ? TreeKind.broadleaf : rVar < 0.58 ? TreeKind.oak : rVar < 0.82 ? TreeKind.vase : TreeKind.slender;

    // REAL FOREST SIZES: many young / small trees, a fair number of middle-aged ones, a few old giants (skewed, not uniform)
    const scale = kind === TreeKind.palm ? 0.6 + 0.95 * rScale ** 1.3 : kind === TreeKind.pine ? 0.5 + 1.4 * rScale ** 1.6 : kind === TreeKind.slender ? 0.45 + 1.4 * rScale ** 1.6 : 0.35 + 1.75 * rScale ** 1.8;
    return { kind, x, y: h - V.sink, z, scale, yaw: rYaw * Math.PI * 2, tint: 0.82 + rTint * 0.32 };
  }

  /** All trees of chunk (cx, cz), chunk-local coordinates. */
  place(cx: number, cz: number): TreeChunkData {
    const S = Config.world.chunkSize;
    const cell = V.cellSize;
    const perSide = Math.round(S / cell);
    const ox = chunkOriginX(cx);
    const oz = chunkOriginZ(cz);
    const gx0 = cx * perSide; // global cell index of the chunk's first cell
    const gz0 = cz * perSide;
    const lists: number[][] = [];
    for (let k = 0; k < TREE_KIND_COUNT; k++) lists.push([]);
    for (let j = 0; j < perSide; j++) {
      for (let i = 0; i < perSide; i++) {
        const t = this.cellTree(gx0 + i, gz0 + j);
        if (t) lists[t.kind].push(t.x - ox, t.y, t.z - oz, t.scale, t.yaw, t.tint);
      }
    }
    // GRASS 4: street trees in the kerbed pits of the city sidewalks (Roadside.ts) join the normal trees: same instancing, LOD and colliders
    for (const e of streetTreesInChunk(this.gen.roads, cx, cz, ox, oz, (x, z) => {
      this.gen.sample(x, z, this.sample);
      return this.sample.h;
    })) lists[e.kind].push(...e.v);
    return lists.map((l) => new Float32Array(l));
  }

  /** Every tree whose trunk stands in the world rectangle [x0, x1] x [z0, z1] (the same trees `place` makes). Used for grass clumps at tree bases. */
  treesInRect(x0: number, z0: number, x1: number, z1: number): { x: number; z: number; scale: number; kind: number }[] {
    const HALF = Config.world.size / 2;
    const cell = V.cellSize;
    const out: { x: number; z: number; scale: number; kind: number }[] = [];
    const gi0 = Math.floor((x0 + HALF) / cell) - 1;
    const gi1 = Math.floor((x1 + HALF) / cell) + 1;
    const gj0 = Math.floor((z0 + HALF) / cell) - 1;
    const gj1 = Math.floor((z1 + HALF) / cell) + 1;
    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const t = this.cellTree(gi, gj);
        if (t && t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1) out.push({ x: t.x, z: t.z, scale: t.scale, kind: t.kind });
      }
    }
    return out;
  }
}
