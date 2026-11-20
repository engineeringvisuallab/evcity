// Garden trees inside the city plots (PlotTreeData.ts, made by tools/plots-tile.py). Only the game's own tree kinds, only a few per plot.
// Same use as evlabParkTreesInChunk: TreePlacer.place() adds them to the normal tree lists (same instancing, LOD, colliders).
import { PLOT_TREES } from './PlotTreeData';

export interface PlotTree {
  x: number;
  z: number;
  kind: number;
  scale: number;
  yaw: number;
}

const BUCKET = 256; // m
let buckets: Map<string, PlotTree[]> | null = null;

function build(): Map<string, PlotTree[]> {
  const m = new Map<string, PlotTree[]>();
  for (let i = 0; i + 4 < PLOT_TREES.length; i += 5) {
    const t: PlotTree = { x: PLOT_TREES[i], z: PLOT_TREES[i + 1], kind: PLOT_TREES[i + 2], scale: PLOT_TREES[i + 3], yaw: PLOT_TREES[i + 4] };
    const k = `${Math.floor(t.x / BUCKET)}:${Math.floor(t.z / BUCKET)}`;
    const l = m.get(k);
    if (l) l.push(t);
    else m.set(k, [t]);
  }
  return m;
}

/** Plot trees whose trunk stands in the chunk square [ox, ox + size) x [oz, oz + size) (world metres). */
export function plotTreesInChunk(ox: number, oz: number, size: number): PlotTree[] {
  if (!buckets) buckets = build();
  const out: PlotTree[] = [];
  for (let bx = Math.floor(ox / BUCKET); bx <= Math.floor((ox + size - 1e-6) / BUCKET); bx++) {
    for (let bz = Math.floor(oz / BUCKET); bz <= Math.floor((oz + size - 1e-6) / BUCKET); bz++) {
      const l = buckets.get(`${bx}:${bz}`);
      if (!l) continue;
      for (const t of l) if (t.x >= ox && t.x < ox + size && t.z >= oz && t.z < oz + size) out.push(t);
    }
  }
  return out;
}
