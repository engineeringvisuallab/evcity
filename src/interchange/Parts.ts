// INTERCHANGE FOUNDATION: the INSTANCED PARTS. Piers, lamps and rail posts are not meshes of one interchange: they are rows of numbers (x, y, z, yaw, size) that the
// renderer pours into ONE InstancedMesh per kind for ALL interchanges (one draw call each, one geometry in memory). Adding an interchange adds numbers, not objects.
//
// stride 5: x, y (ground / base), z, yaw (rad, world heading of the road there), size (pier: height of the column in m; lamp: pole height; railPost: 1).

import type { InterchangeParams, LevelPlan, PartBatch, Ramp, RoadSection } from './InterchangeTypes';
import { yOf } from './Levels';

export const PART_DEFS = {
  /** One column (square, m) and the spacing along the road (m). */
  pier: { width: 1.8, spacing: 24 },
  lamp: { height: 9, spacing: 36 },
  railPost: { spacing: 6 },
} as const;

type Ground = (x: number, z: number) => number;

class Rows {
  private a: number[] = [];
  push(x: number, y: number, z: number, yaw: number, size: number): void {
    this.a.push(x, y, z, yaw, size);
  }
  batch(kind: PartBatch['kind']): PartBatch {
    return { kind, data: new Float32Array(this.a), stride: 5 };
  }
}

/** Point at distance d along a ramp: world x, z, the surface y and the world heading of the road. */
export function rampAt(r: Ramp, d: number): { x: number; z: number; y: number; yaw: number; side: { x: number; z: number } } {
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < d) i++;
  const c0 = r.cum[i - 1];
  const t = Math.max(0, Math.min(1, (d - c0) / Math.max(1e-6, r.cum[i] - c0)));
  const x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t;
  const z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
  const y = r.ys[i - 1] + (r.ys[i] - r.ys[i - 1]) * t;
  const tx = r.xs[i] - r.xs[i - 1];
  const tz = r.zs[i] - r.zs[i - 1];
  const l = Math.hypot(tx, tz) || 1;
  // left normal (tz, -tx), the same as RoadSpec.nx / nz
  return { x, z, y, yaw: Math.atan2(tz, tx), side: { x: tz / l, z: -tx / l } };
}

export function makeParts(
  ramps: readonly Ramp[],
  P: InterchangeParams,
  L: LevelPlan,
  main: RoadSection,
  cross: RoadSection,
  toWorld: (u: number, v: number) => { x: number; z: number },
  yaw: number,
  ground: Ground,
): PartBatch[] {
  const piers = new Rows();
  const lamps = new Rows();
  const posts = new Rows();

  // ramps: piers under every elevated stretch, rail posts on both edges there, lamps on the outside edge (left) every 36 m
  for (const r of ramps) {
    for (const e of r.elevated) {
      const d0 = r.cum[e.i0];
      const d1 = r.cum[e.i1];
      for (let d = d0 + PART_DEFS.pier.spacing / 2; d < d1; d += PART_DEFS.pier.spacing) {
        const p = rampAt(r, d);
        const g = ground(p.x, p.z);
        piers.push(p.x, g, p.z, p.yaw, Math.max(0.5, p.y - P.deckThickness - g));
      }
      for (let d = d0; d <= d1; d += PART_DEFS.railPost.spacing) {
        const p = rampAt(r, d);
        for (const s of [-1, 1]) posts.push(p.x + p.side.x * s * (r.halfWidth + 0.15), p.y, p.z + p.side.z * s * (r.halfWidth + 0.15), p.yaw, 1);
      }
    }
    for (let d = PART_DEFS.lamp.spacing / 2; d < r.length; d += PART_DEFS.lamp.spacing) {
      const p = rampAt(r, d);
      lamps.push(p.x + p.side.x * (r.halfWidth + 0.6), p.y, p.z + p.side.z * (r.halfWidth + 0.6), p.yaw, PART_DEFS.lamp.height);
    }
  }

  // the upper road: piers every 24 m on the elevated stretch, but not in the span over the lower road
  const lowerHalf = L.upper === 'main' ? cross.halfWidth : main.halfWidth;
  const upperSec = L.upper === 'main' ? main : cross;
  for (let t = -L.elevatedT; t <= L.elevatedT; t += PART_DEFS.pier.spacing) {
    if (Math.abs(t) < lowerHalf + 4) continue;
    const w = L.upper === 'main' ? toWorld(t, 0) : toWorld(0, t);
    const yawRoad = L.upper === 'main' ? yaw : yaw - Math.PI / 2;
    const g = ground(w.x, w.z);
    const y = yOf(L, L.upper, t);
    // two columns, one under each carriageway (centre of the left / right half)
    for (const s of [-1, 1]) {
      const off = s * (upperSec.halfWidth / 2);
      const q = L.upper === 'main' ? toWorld(t, off) : toWorld(off, t);
      piers.push(q.x, g, q.z, yawRoad, Math.max(0.5, y - P.deckThickness - g));
    }
  }

  return [piers.batch('pier'), lamps.batch('lamp'), posts.batch('railPost')];
}
