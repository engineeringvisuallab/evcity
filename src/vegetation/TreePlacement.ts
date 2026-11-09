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
import { TREE_KIND_COUNT, TREE_TRUNK, TreeKind, type TreeChunkData } from './TreeTypes';
import { homesteadFactor } from './Homesteads';

/**
 * STAGE 7 (step 1): where do forest trees stand?  Pure function of (seed, chunk): runs in the chunk worker.
 *
 * - The world is cut into a fixed grid of `cellSize` metres (global, NOT per chunk and NOT per LOD), every cell has its
 *   own random stream. So a tree is always at the same place, whatever chunk or LOD asks for it.
 * - A smooth noise field makes forests (patches) with a few scattered trees in between.
 * - Big forest trees (sal, segun, koroi, bot, shimul) grow in the heart of a forest, by height (lowland: koroi / banyan too, hills: sal, segun, shimul).
 * - Villages: coconut, date, palmyra palms and banana clumps stand around rural houses (Homesteads.ts) and on pond / lake / river banks (`homeTree`).
 * - On a slope the foot of a tree is lowered by slope x trunk radius, so the downhill side of a thick trunk never floats.
 * - A tree is dropped when it would stand in water, on a beach, on a steep slope, near a road / junction pad, above the
 *   tree line or inside a planned city area (except green / recreation zones, see Config.vegetation.cityZoneChance).
 */

const V = Config.vegetation;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Which big forest tree grows at height `h` (m)? Lowland forest: all five (koroi and banyan are wide: at most one per 3 x 3 cells); hills: sal, segun, shimul; high hills mostly sal. */
function bigKind(h: number, u: number, gi: number, gj: number): number {
  const wideOk = (((gi % 3) + 3) % 3 === 0) && (((gj % 3) + 3) % 3 === 0);
  if (h < 25) {
    if (u < 0.26) return wideOk ? TreeKind.koroi : TreeKind.segun;
    if (u < 0.38) return wideOk ? TreeKind.bot : TreeKind.sal;
    if (u < 0.62) return TreeKind.segun;
    if (u < 0.78) return TreeKind.shimul;
    return TreeKind.sal;
  }
  if (h < 90) {
    if (u < 0.42) return TreeKind.sal;
    if (u < 0.7) return TreeKind.segun;
    if (u < 0.9) return TreeKind.shimul;
    return wideOk ? TreeKind.koroi : TreeKind.sal;
  }
  if (u < 0.55) return TreeKind.sal;
  if (u < 0.8) return TreeKind.shimul;
  return TreeKind.segun;
}

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
    this.sw = gen.makeSample();
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

  /** The random numbers of the cell being built (one stream per cell; older values first, so no tree position ever moves when a draw is added at the end). */
  private rr = { roll: 0, jx: 0, jz: 0, rScale: 0, rYaw: 0, rTint: 0, rKind: 0, rVar: 0, rBig: 0, rHome: 0, rHx: 0, rHz: 0, rHKind: 0, rHScale: 0, rHYaw: 0 };
  private sw: TerrainSample;

  /**
   * The tree of ONE global cell (gi, gj) of the `cellSize` grid, or null. All the logic of `place` lives here, so `place` (per chunk) and
   * `treesInRect` (per area, used by the grass placer for the clumps at tree bases) can never disagree about where a tree stands.
   * A forest tree wins; a cell without one may still get a village tree (homestead / bank palm, `homeTree`).
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
    const rng = mulberry32(hash2D(this.seed ^ 0x5eed7, gi, gj));
    const R = this.rr;
    R.roll = rng();
    R.jx = rng();
    R.jz = rng();
    R.rScale = rng();
    R.rYaw = rng();
    R.rTint = rng();
    R.rKind = rng();
    R.rVar = rng(); // which broadleaf shape (drawn last of the old values, so every older value - and every tree position - stays the same)
    R.rBig = rng(); // big forest tree or not
    R.rHome = rng(); // village trees: chance roll, position, kind, size, yaw
    R.rHx = rng();
    R.rHz = rng();
    R.rHKind = rng();
    R.rHScale = rng();
    R.rHYaw = rng();
    return this.forestTree(gi, gj, ox, oz, i, j) ?? this.homeTree(ox, oz, i, j);
  }

  /** Foot height of a tree: the ground minus the sink, and on a slope a bit more for thick trunks (slope = rise / run). */
  private footY(h: number, slope: number, kind: number, scale: number): number {
    return h - V.sink - Math.min(1.4, slope * TREE_TRUNK[kind].r * scale);
  }

  private forestTree(gi: number, gj: number, ox: number, oz: number, i: number, j: number): { kind: number; x: number; y: number; z: number; scale: number; yaw: number; tint: number } | null {
    const cell = V.cellSize;
    const s = this.sample;
    const { roll, jx, jz, rScale, rYaw, rTint, rKind, rVar, rBig } = this.rr;
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
    // BIG forest trees only in the heart of a forest and on ground that is not too steep (their trunks and buttresses need room)
    const bigChance = V.bigTreeChance * smooth(0.25, 0.75, f) * (1 - pineChance) * (1 - smooth(this.tanMax * 0.45, this.tanMax * 0.75, slope));
    if (rKind < pineChance) kind = TreeKind.pine;
    else if (rKind > 1 - palmChance) kind = TreeKind.palm;
    else if (rBig < bigChance) kind = bigKind(h, rVar, gi, gj);
    else kind = rVar < 0.3 ? TreeKind.broadleaf : rVar < 0.58 ? TreeKind.oak : rVar < 0.82 ? TreeKind.vase : TreeKind.slender;

    // REAL FOREST SIZES: many young / small trees, a fair number of middle-aged ones, a few old giants (skewed, not uniform).
    // The big species are given as mature trees (scale 1 = 20-30 m): a narrow range, so a banyan never becomes 60 m tall.
    const big = kind >= TreeKind.sal && kind <= TreeKind.shimul;
    const wide = kind === TreeKind.koroi || kind === TreeKind.bot;
    const scale = big
      ? V.bigTreeScale[0] + (V.bigTreeScale[1] - (wide ? 0.15 : 0) - V.bigTreeScale[0]) * rScale ** 1.2
      : kind === TreeKind.palm ? 0.6 + 0.95 * rScale ** 1.3 : kind === TreeKind.pine ? 0.5 + 1.4 * rScale ** 1.6 : kind === TreeKind.slender ? 0.45 + 1.4 * rScale ** 1.6 : 0.35 + 1.75 * rScale ** 1.8;
    return { kind, x, y: this.footY(h, slope, kind, scale), z, scale, yaw: rYaw * Math.PI * 2, tint: 0.82 + rTint * 0.32 };
  }

  /**
   * VILLAGE trees of a cell that has no forest tree: next to a rural house (Homesteads.ts) coconut / banana / date / palmyra palms and some shade
   * trees; on low land beside water (pond, lake, river) palms and banana. One more tree per cell at most, at its own jittered spot.
   */
  private homeTree(ox: number, oz: number, i: number, j: number): { kind: number; x: number; y: number; z: number; scale: number; yaw: number; tint: number } | null {
    const cell = V.cellSize;
    const R = this.rr;
    const x = ox + (i + R.rHx) * cell;
    const z = oz + (j + R.rHz) * cell;
    const hf = homesteadFactor(x, z);
    let bank = false;
    if (hf > 0) {
      if (R.rHome >= V.homestead.chance * hf * this.mul) return null;
    } else if (R.rHome < V.bank.chance * this.mul) bank = true; // a bank candidate: the terrain decides below
    else return null;

    const s = this.sample;
    this.gen.sample(x, z, s);
    const h = s.h;
    if (h < V.seaMargin) return null;
    if (bank) {
      if (h > V.bank.maxHeight) return null;
      if (!Number.isNaN(s.water) && h < s.water + V.waterMargin) return null;
      if (!this.waterNear(x, z, V.bank.reach * 0.75)) return null;
    } else if (!Number.isNaN(s.water) && h < s.water + V.waterMargin) return null;
    if (this.cityFactor(x, z) <= 0) return null; // houses inside a planned built-up area keep their own streets and gardens: no village trees there

    this.gen.sample(x + 2, z, this.sx);
    this.gen.sample(x, z + 2, this.sz);
    const slope = Math.hypot(this.sx.h - h, this.sz.h - h) / 2;
    if (slope > this.tanMax * 0.6) return null; // village trees only on gentle ground
    if (this.nearRoad(x, z)) return null;

    const u = R.rHKind;
    let kind: number;
    if (bank) kind = u < 0.4 ? TreeKind.coconut : u < 0.62 ? TreeKind.banana : u < 0.8 ? TreeKind.datePalm : TreeKind.palmyra;
    else if (u < 0.36) kind = TreeKind.coconut;
    else if (u < 0.58) kind = TreeKind.banana;
    else if (u < 0.72) kind = TreeKind.datePalm;
    else if (u < 0.82) kind = TreeKind.palmyra;
    else kind = R.rVar < 0.5 ? TreeKind.broadleaf : R.rVar < 0.8 ? TreeKind.vase : TreeKind.oak; // shade trees (mango, jackfruit ...)
    const t = R.rHScale;
    const scale =
      kind === TreeKind.coconut ? 0.65 + 0.5 * t
      : kind === TreeKind.banana ? 0.8 + 0.4 * t
      : kind === TreeKind.datePalm ? 0.7 + 0.5 * t
      : kind === TreeKind.palmyra ? 0.75 + 0.5 * t
      : 0.5 + 0.7 * t ** 1.5;
    return { kind, x, y: this.footY(h, slope, kind, scale), z, scale, yaw: R.rHYaw * Math.PI * 2, tint: 0.85 + R.rTint * 0.3 };
  }

  /** Is there open water within `d` metres (4 compass points)? Used for the bank palms. */
  private waterNear(x: number, z: number, d: number): boolean {
    const s = this.sw;
    for (let k = 0; k < 4; k++) {
      this.gen.sample(x + (k === 0 ? d : k === 1 ? -d : 0), z + (k === 2 ? d : k === 3 ? -d : 0), s);
      if (!Number.isNaN(s.water) && s.h < s.water + 0.3) return true;
    }
    return false;
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
