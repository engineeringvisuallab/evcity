// MODEL INFO CACHE: the solid parts / doors / wudu taps (models/ModelInfo.ts) of every building that stands in the world, found by model + colour variant.
// PlacedBuildings and FillBuildings register the info of the models they build anyway; if a building is asked for before that (physics reaches
// 300 m, the city fill builds its models within 520 m) the model is built once here just to read its info and the geometry is dropped again.
import { FILL_MODEL_BY_ID } from './models/fillRegistry';
import type { ModelInfo } from './models/ModelInfo';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from './Placements';
import { DRAWN_FILL_PLACEMENTS } from './PlacementsResidential';

const cache = new Map<string, ModelInfo>();
const keyOf = (id: string, seed: number, outer: boolean): string => `${id}#${seed}#${outer ? 1 : 0}`;
/** FillBuildings builds 4 colour variants: model seed = variant + 1. */
export const FILL_VARIANTS = 4;

export function registerInfo(id: string, seed: number, outer: boolean, info: ModelInfo): void {
  cache.set(keyOf(id, seed, outer), info);
}

/** The info of the model of this placement (fill = a city fill building, else a hand placed one). null when the model does not exist. */
export function infoFor(p: BuildingPlacement, fill: boolean): ModelInfo | null {
  const seed = fill ? (Math.abs(p.seed ?? 0) % FILL_VARIANTS) + 1 : p.seed ?? 0;
  const key = keyOf(p.id, seed, !fill);
  const have = cache.get(key);
  if (have) return have;
  const def = FILL_MODEL_BY_ID[p.id];
  if (!def) return null;
  const b = def.build(seed, !fill);
  cache.set(key, b.info);
  b.dispose();
  return b.info;
}

export interface WorldPlacement { p: BuildingPlacement; fill: boolean }

/** Every building of the world (hand placed + city fill) that has a model. */
export const WORLD_PLACEMENTS: readonly WorldPlacement[] = [
  ...BUILDING_PLACEMENTS.filter((p) => FILL_MODEL_BY_ID[p.id]).map((p) => ({ p, fill: false })),
  ...DRAWN_FILL_PLACEMENTS.filter((p) => FILL_MODEL_BY_ID[p.id]).map((p) => ({ p, fill: true })),
];

/** Lowest / highest ground under the (rotated) footprint; the model's floor stands at max + 0.02 (same as PlacedBuildings / FillBuildings). */
export function groundRange(p: BuildingPlacement, heightAt: (x: number, z: number) => number): { mn: number; mx: number } {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  let mn = 1e9, mx = -1e9;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const lx = (a / 2) * (p.W / 2), lz = (b / 2) * (p.D / 2);
    const h = heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
    mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  return { mn, mx };
}
