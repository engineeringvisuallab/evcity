import { Config } from '../core/Config';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import { CityPlan } from './CityPlan';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';

/**
 * CITY GREENNESS (GRASS 4): one number 0..1 per ground point that says "this is a planned city: the ground is lawn".
 *   1 inside the plan of a city site (distance to the hub < CityPlan.maxRadius, the same test as CityPlan.siteAt / GrassPlacer.cityFactor),
 *   falling smoothly to 0 over `fadeOut` metres outside it.
 * It is a pure function of the world seed (the sites), so the chunk worker (terrain vertex attribute `aCity`), the grass placer and the tests
 * all see exactly the same field. It knows nothing about roads or plots: those are cut out by the grass placer's `blocked` list and by
 * the road ribbons that are drawn over the ground.
 */
const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class CityGreen {
  private radius: number[];

  constructor(private sites: readonly { x: number; z: number }[], plan: CityPlan) {
    this.radius = sites.map((_, i) => plan.maxRadius(i));
  }

  /** Greenness 0..1 at world (x, z). `fadeOut` = soft edge outside the city (m). */
  at(x: number, z: number, fadeOut: number = Config.terrain.cityGreen.fadeOut): number {
    let best = 0;
    for (let i = 0; i < this.sites.length; i++) {
      const d = Math.hypot(x - this.sites[i].x, z - this.sites[i].z);
      const R = this.radius[i];
      if (d < R) return 1;
      if (d < R + fadeOut) best = Math.max(best, 1 - smooth(R, R + fadeOut, d));
    }
    return best;
  }

  /** True when the chunk square (world metres) can contain any greenness at all. */
  touches(x0: number, z0: number, x1: number, z1: number, fadeOut: number = Config.terrain.cityGreen.fadeOut): boolean {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const half = Math.hypot(x1 - x0, z1 - z0) / 2;
    for (let i = 0; i < this.sites.length; i++) {
      if (Math.hypot(cx - this.sites[i].x, cz - this.sites[i].z) < this.radius[i] + fadeOut + half) return true;
    }
    return false;
  }
}

const cache = new WeakMap<TerrainGenerator, CityGreen>();
/** One CityGreen per terrain generator (the chunk worker has one generator per seed). */
export function getCityGreen(gen: TerrainGenerator): CityGreen {
  let g = cache.get(gen);
  if (!g) {
    g = new CityGreen(gen.sites, new CityPlan(gen.sites));
    cache.set(gen, g);
  }
  return g;
}

/**
 * Per-vertex greenness of one terrain chunk for the terrain shader (`aCity`), laid out like the road mask: (n + 1)^2 grid vertices, then the
 * 4 skirt strips (north, south, west, east) that copy the colour of the border vertex above them. null = the chunk is outside every city (all zero).
 */
export function buildCityMask(gen: TerrainGenerator, cx: number, cz: number, n: number, totalVertices: number): Float32Array | null {
  const S = Config.world.chunkSize;
  const G = Config.terrain.cityGreen;
  if (G.amount <= 0) return null;
  const green = getCityGreen(gen);
  const ox = chunkOriginX(cx);
  const oz = chunkOriginZ(cz);
  if (!green.touches(ox, oz, ox + S, oz + S, G.fadeOut)) return null;
  const step = S / n;
  const vn = n + 1;
  const mask = new Float32Array(totalVertices);
  let any = false;
  for (let j = 0; j < vn; j++) {
    for (let i = 0; i < vn; i++) {
      const v = green.at(ox + i * step, oz + j * step, G.fadeOut) * G.amount;
      if (v > 0) any = true;
      mask[j * vn + i] = v;
    }
  }
  if (!any) return null;
  const vcount = vn * vn;
  const copy = (slot: number, topOf: (k: number) => number): void => {
    for (let k = 0; k < vn; k++) mask[vcount + slot * vn + k] = mask[topOf(k)];
  };
  copy(0, (k) => k);
  copy(1, (k) => n * vn + k);
  copy(2, (k) => k * vn);
  copy(3, (k) => k * vn + n);
  return mask;
}
