import { Config } from '../core/Config';
import { Seed, mulberry32 } from '../world/Seed';
import { Noise2D } from './Noise';
import { RiverNetwork } from './RiverNetwork';
import { LakeSet, type TerrainSample } from './Lakes';
import { RoadNetwork } from '../roads/RoadNetwork';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface CitySite {
  x: number;
  z: number;
  /** Height (m above sea) of the flat ground. */
  height: number;
  /** Fully flat inside this radius. */
  coreRadius: number;
  /** Terrain blends back to natural beyond this radius. */
  blendRadius: number;
}

/**
 * The shape of the world. `heightAt(x, z)` is a pure function of world coordinates (metres) and the seed,
 * so every chunk, LOD level, collider and worker agrees on the same ground - no cracks, nothing stored.
 *
 * Layers: domain-warped fBm hills, ridged mountain ranges, flat plains, flat city sites,
 * mountain rim around N/E/W edges, and sea along the whole southern edge (sea level = 0).
 *
 * STAGE 3: rivers (RiverNetwork) and lakes (LakeSet) are carved into this function in `sample()`.
 */
export class TerrainGenerator {
  private noise: Noise2D;
  readonly sites: CitySite[];
  readonly rivers: RiverNetwork;
  readonly lakes: LakeSet;
  /** STAGE 6: roads + bridges. Cut & fill is applied inside sample(), so every chunk/worker/collider sees the same road. */
  readonly roads: RoadNetwork;
  private scratch: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };

  constructor(seed: number) {
    this.noise = new Noise2D(seed);
    this.sites = TerrainGenerator.makeSites(seed);
    const base = (x: number, z: number) => this.baseHeightAt(x, z);
    this.rivers = new RiverNetwork(base);
    this.lakes = new LakeSet(seed, base, this.sites, this.rivers);
    this.roads = new RoadNetwork(this.sites, (x, z, o) => this.sampleNatural(x, z, o));
  }

  makeSample(): TerrainSample {
    return { h: 0, water: NaN, fx: 0, fz: 0 };
  }

  /**
   * Full ground + water information at (x, z):
   *   out.h     ground height (rivers, valleys and lakes already carved in)
   *   out.water water surface height, or NaN if there is no water nearby (water is visible where h < water)
   *   out.fx/fz flow velocity of the water (m/s), 0 for lakes and sea
   */
  sample(x: number, z: number, out: TerrainSample): void {
    this.sampleNatural(x, z, out);
    this.roads.apply(x, z, out);
  }

  /** Natural ground + water (hills, rivers, lakes, sea) WITHOUT roads. Roads are planned on this. */
  sampleNatural(x: number, z: number, out: TerrainSample): void {
    out.h = this.baseHeightAt(x, z);
    out.water = NaN;
    out.fx = 0;
    out.fz = 0;
    this.rivers.apply(x, z, out);
    this.lakes.apply(x, z, out);
    if (Number.isNaN(out.water) && out.h < 0.6) out.water = Config.terrain.seaLevel; // sea
  }

  /** Terrain height in metres at world position (x, z), including rivers and lakes. */
  heightAt(x: number, z: number): number {
    this.sample(x, z, this.scratch);
    return this.scratch.h;
  }

  /** Deterministic flat zones reserved for future cities. Site 0 is always the map centre (spawn). */
  static makeSites(seed: number): CitySite[] {
    const rng = mulberry32(new Seed(seed).chunkSeed(7, 7));
    const mk = (x: number, z: number): CitySite => ({
      x,
      z,
      height: 14 + rng() * 12,
      coreRadius: 600,
      blendRadius: 1200,
    });
    const sites = [mk(0, 0)];
    let tries = 0;
    while (sites.length < 3 && tries++ < 100) {
      const x = (rng() * 2 - 1) * 3000;
      const z = -3200 + rng() * 4000;
      if (sites.every((s) => Math.hypot(s.x - x, s.z - z) > 2400)) sites.push(mk(x, z));
    }
    return sites;
  }

  /** Natural land only (hills, mountains, plains, cities, coast) - before rivers and lakes are carved in. */
  baseHeightAt(x: number, z: number): number {
    const n = this.noise;
    const half = Config.world.size / 2;

    // Domain warping: bends all features so nothing looks grid-aligned.
    const wx = x + 140 * n.fbm(x * 0.0008 + 17.3, z * 0.0008 - 4.1, 3);
    const wz = z + 140 * n.fbm(x * 0.0008 - 9.7, z * 0.0008 + 31.9, 3);

    // Large-scale masks
    const mMask = smoothstep(-0.14, 0.26, n.fbm(wx * 0.00032 + 100, wz * 0.00032 - 40, 3));
    const plain = smoothstep(0.02, 0.38, -n.fbm(wx * 0.00022 - 70, wz * 0.00022 + 30, 2)) * (1 - mMask);
    const lowN = n.fbm(wx * 0.00018, wz * 0.00018, 2);
    const ridge = n.ridged(wx * 0.00085 + 5, wz * 0.00085 + 9, 5);
    const hills = n.fbm(wx * 0.0026, wz * 0.0026, 4);
    const detail = n.fbm(x * 0.011, z * 0.011, 3);

    // Coast line: sea occupies the southern edge (+z). The line wiggles so it is not straight.
    const coastLine = 2300 + 380 * n.fbm(x * 0.0006 + 3, z * 0.0006 + 3, 3);
    const landMul = 1 - 0.92 * smoothstep(coastLine - 1000, coastLine + 100, z);

    // Base land + rolling hills + fine detail
    let h = 30 + lowN * 8;
    h += hills * 32 * (1 - 0.88 * plain) * landMul;
    h += detail * 2.2;

    // Mountain ranges (ridged noise)
    h += mMask * (40 + 360 * Math.pow(ridge, 1.2)) * landMul;

    // Flat plains
    h = lerp(h, 14 + lowN * 3 + detail * 1.2, plain * 0.85);

    // Flat, gentle zones reserved for cities
    for (const s of this.sites) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d >= s.blendRadius) continue;
      const t = 1 - smoothstep(s.coreRadius, s.blendRadius, d);
      h = lerp(h, s.height + detail * 0.8 + hills * 1.5, t);
    }

    // Mountain rim along north, east and west edges (hides the end of the world)
    const e = Math.min(z + half, half - x, half + x);
    const rim = 1 - smoothstep(-800, 1500, e);
    h += rim * rim * (200 + 260 * ridge);

    // Soft ceiling so nothing exceeds Config.terrain.maxHeight
    const top = Config.terrain.maxHeight - 250;
    if (h > top) h = top + 250 * Math.tanh((h - top) / 250);

    // Sea along the southern edge
    const t = smoothstep(coastLine, coastLine + 1400, z);
    const seaFloor = -45 - 45 * smoothstep(coastLine + 1400, coastLine + 3200, z);
    h = h * (1 - t) + seaFloor * t;

    return h;
  }
}
