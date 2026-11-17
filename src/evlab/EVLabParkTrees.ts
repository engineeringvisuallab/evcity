// EVLab campus: the park trees (palms along the ring road and the lake shore, avenue trees, lawn trees) as ordinary game trees.
// They use the game's own tree kinds and join the normal trees of a chunk (same instancing, LOD, colliders, climbing): TreePlacer.place() appends them.
import { Config } from '../core/Config';
import { OLD_GARDEN, parkTrees } from './EVLabCampus';
import { gardenTrees } from './EVLabGarden';
import { EVLAB_ORIGIN, localToWorld } from './EVLabSite';

// the park lies inside the old 300 x 240 m layout (local x +-150, z -90..150, so at most 213 m from the building origin); Step R0d: the frame is turned by 37.5 deg,
// so the chunk filter is a square of this half size round the building ORIGIN (it covers the turned park whatever the yaw)
const REACH = 225;

/** Park trees of the chunk whose minimum corner is (ox, oz), as a list per tree kind (chunk-local x, y, z, scale, yaw, tint). `floorY` = floor level of the campus. */
export function evlabParkTreesInChunk(floorY: number, ox: number, oz: number): { kind: number; v: number[] }[] {
  const S = Config.world.chunkSize;
  if (ox > EVLAB_ORIGIN.x + REACH || ox + S < EVLAB_ORIGIN.x - REACH || oz > EVLAB_ORIGIN.z + REACH || oz + S < EVLAB_ORIGIN.z - REACH) return [];
  const out = new Map<number, number[]>();
  const y = floorY - Config.vegetation.sink;
  const MAX = S - 0.001;
  // Step RT2: the old garden (parkTrees) is off (EVLabCampus.OLD_GARDEN); Step RT3: the new hill-side garden (EVLabGarden: only big coconut / palm / date palm)
  for (const t of [...(OLD_GARDEN ? parkTrees() : []), ...gardenTrees()]) {
    const [wx, wz] = localToWorld(t.x, t.z); // local (turned frame) -> world
    if (wx < ox || wx >= ox + S || wz < oz || wz >= oz + S) continue;
    let l = out.get(t.kind);
    if (!l) { l = []; out.set(t.kind, l); }
    l.push(Math.min(MAX, wx - ox), y, Math.min(MAX, wz - oz), t.scale, t.yaw, t.tint);
  }
  return [...out].map(([kind, v]) => ({ kind, v }));
}
