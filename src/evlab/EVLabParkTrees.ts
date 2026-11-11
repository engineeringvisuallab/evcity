// EVLab campus: the park trees (palms along the ring road and the lake shore, avenue trees, lawn trees) as ordinary game trees.
// They use the game's own tree kinds and join the normal trees of a chunk (same instancing, LOD, colliders, climbing): TreePlacer.place() appends them.
import { Config } from '../core/Config';
import { parkTrees } from './EVLabCampus';
import { BUILDING_Z } from './EVLabLayout';
import { EVLAB_POS } from './EVLabSite';

const REACH = 262; // the park lies within this many metres of the plot centre

/** Park trees of the chunk whose minimum corner is (ox, oz), as a list per tree kind (chunk-local x, y, z, scale, yaw, tint). `floorY` = floor level of the campus. */
export function evlabParkTreesInChunk(floorY: number, ox: number, oz: number): { kind: number; v: number[] }[] {
  const S = Config.world.chunkSize;
  if (ox > EVLAB_POS.x + REACH || ox + S < EVLAB_POS.x - REACH || oz > BUILDING_Z + REACH || oz + S < BUILDING_Z - REACH) return [];
  const out = new Map<number, number[]>();
  const y = floorY - Config.vegetation.sink;
  const MAX = S - 0.001;
  for (const t of parkTrees()) {
    const wx = EVLAB_POS.x + t.x, wz = BUILDING_Z + t.z;
    if (wx < ox || wx >= ox + S || wz < oz || wz >= oz + S) continue;
    let l = out.get(t.kind);
    if (!l) { l = []; out.set(t.kind, l); }
    l.push(Math.min(MAX, wx - ox), y, Math.min(MAX, wz - oz), t.scale, t.yaw, t.tint);
  }
  return [...out].map(([kind, v]) => ({ kind, v }));
}
