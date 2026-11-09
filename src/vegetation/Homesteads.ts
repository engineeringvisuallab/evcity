import { BUILDING_PLACEMENTS } from '../buildings/Placements';
import { FILL_PLACEMENTS } from '../buildings/PlacementsFill';
import { Config } from '../core/Config';

/**
 * HOMESTEADS (basha bari): the rural houses of the building tables. Coconut, date and palmyra palms and banana clumps are planted
 * around them (TreePlacement.homeTree). Pure numbers, no three.js: runs in the chunk worker.
 */
const RURAL_HOUSES: ReadonlySet<string> = new Set([
  'mud-hut', 'bamboo-hut', 'house-tin', 'house-semi-pucca', 'house-brick-2', 'house-brick-3', 'farmhouse', 'village_farm', 'hill_farm', 'baganbari',
]);

interface Home { x: number; z: number; r: number }

const CELL = 64;
let grid: Map<number, Home[]> | null = null;
const key = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);

function build(): Map<number, Home[]> {
  const g = new Map<number, Home[]>();
  const reach = Config.vegetation.homestead.reach;
  const add = (p: { id: string; x: number; z: number; W: number; D: number }): void => {
    if (!RURAL_HOUSES.has(p.id)) return;
    const h: Home = { x: p.x, z: p.z, r: Math.hypot(p.W, p.D) / 2 };
    const R = h.r + reach;
    for (let i = Math.floor((h.x - R) / CELL); i <= Math.floor((h.x + R) / CELL); i++)
      for (let j = Math.floor((h.z - R) / CELL); j <= Math.floor((h.z + R) / CELL); j++) {
        const k = key(i, j);
        const l = g.get(k);
        if (l) l.push(h);
        else g.set(k, [h]);
      }
  };
  for (const p of BUILDING_PLACEMENTS) add(p);
  for (const p of FILL_PLACEMENTS) add(p);
  return g;
}

/** 0 = not near a rural house, up to 1 right beside one (fades out to the edge of the ring, `homestead.reach` m beyond the footprint). */
export function homesteadFactor(x: number, z: number): number {
  grid ??= build();
  const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!l) return 0;
  const reach = Config.vegetation.homestead.reach;
  let best = 0;
  for (const h of l) {
    const d = Math.hypot(x - h.x, z - h.z) - h.r;
    if (d >= reach) continue;
    const f = d <= 6 ? 1 : 1 - (d - 6) / (reach - 6);
    if (f > best) best = f;
  }
  return best;
}
