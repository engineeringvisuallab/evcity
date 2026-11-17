import type { RoadNetwork } from './RoadNetwork';
import { Config } from '../core/Config';
import { dividedSectionOf } from './RoadSection';

/** Is (x, z) inside a junction pad (+ margin)? Coarse grid, built once per call of a planner. */
export function padIndex(roads: RoadNetwork): (x: number, z: number, margin: number) => boolean {
  const cell = 120;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  roads.pads.forEach((p, i) => {
    const r = p.rCore + 10;
    for (let cx = Math.floor((p.x - r) / cell); cx <= Math.floor((p.x + r) / cell); cx++)
      for (let cz = Math.floor((p.z - r) / cell); cz <= Math.floor((p.z + r) / cell); cz++) {
        const k = key(cx, cz);
        const l = grid.get(k);
        if (l) l.push(i);
        else grid.set(k, [i]);
      }
  });
  return (x, z, margin) => {
    const l = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!l) return false;
    for (const i of l) if (Math.hypot(x - roads.pads[i].x, z - roads.pads[i].z) < roads.pads[i].rCore + margin) return true;
    return false;
  };
}

/**
 * 6-LANE x 6-LANE JUNCTIONS: pads where two DIFFERENT roads of 3 + 3 lanes (highway / avenue) meet and are not just the two ends of one straight road.
 * (A pad of kind 'bend' is one road turning a corner, so it never counts; two six-lane arms that continue each other, about 180 degrees apart, do not count either.)
 * Returns the ids of these pads.
 */
export function sixLanePadIds(roads: RoadNetwork): Set<number> {
  const out = new Set<number>();
  const minDiff = (Config.city.median.sixLaneJunction.minAngleDeg * Math.PI) / 180;
  for (const p of roads.pads) {
    if (p.kind === 'bend') continue;
    const six = p.arms.filter((a) => {
      const r = roads.roads[a.roadId];
      const sec = r ? dividedSectionOf(r) : null;
      return !!sec && sec.lanesPerDir >= 3;
    });
    let found = false;
    for (let i = 0; i < six.length && !found; i++)
      for (let j = i + 1; j < six.length && !found; j++) {
        if (six[i].roadId === six[j].roadId) continue; // the same road twice (going straight through the pad) is not a junction of two roads
        if (Math.abs(wrapPi(six[i].theta - six[j].theta)) > Math.PI - minDiff) continue; // two roads that only continue each other
        found = true;
      }
    if (found) out.add(p.id);
  }
  return out;
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * Like padIndex, but for the MEDIAN and its planting: a normal pad keeps the old margin; a 6-lane x 6-lane pad gets `sixLaneJunction.extra` m more,
 * so the raised median, its hedges, trees, grass and lamps all stop earlier there and the junction is open.
 */
export function medianPadIndex(roads: RoadNetwork): (x: number, z: number, margin: number) => boolean {
  const base = padIndex(roads);
  const J = Config.city.median.sixLaneJunction;
  if (!J.enabled) return base;
  const six = sixLanePadIds(roads);
  if (six.size === 0) return base;
  const list = roads.pads.filter((p) => six.has(p.id));
  return (x, z, margin) => {
    if (base(x, z, margin)) return true;
    for (const p of list) if (Math.hypot(x - p.x, z - p.z) < p.rCore + margin + J.extra) return true;
    return false;
  };
}
