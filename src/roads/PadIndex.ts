import type { RoadNetwork } from './RoadNetwork';

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

