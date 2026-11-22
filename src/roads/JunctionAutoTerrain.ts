// AUTO CONNECT AT GRADE, A-5 (terrain side). Pure maths (no three.js). One source of truth for BOTH the terrain carve (RoadNetwork.apply) and the mesh (JunctionAutoMesh).
// The pad level f(x, z) = the pad plane (JunctionAuto.ts) + a small bump (radius <= 12 m) at each leg trim end that closes the step to the real road height there,
// so the pad meets every road end at exactly the road's own level. Inside the pad outline the terrain IS f; around it a skirt of EMB metres (smoothstep) goes back to the natural ground.
import type { PadResult, V2 } from './JunctionAuto';

const smooth = (a: number, b: number, x: number): number => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

interface Bump { x: number; z: number; step: number; r: number }
interface PadInfo { pad: PadResult; bumps: Bump[]; x0: number; x1: number; z0: number; z1: number; edges: number[][] }

export function pointInOutline(pts: ReadonlyArray<V2>, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class AutoPadTerrain {
  private readonly infos: PadInfo[] = [];
  /** Skirt width (m) outside the pad outline. */
  readonly emb: number;

  constructor(pads: PadResult[], emb = 10) {
    this.emb = emb;
    for (const pad of pads) {
      if (!pad.pass || pad.outline.length < 3) continue;
      // bumps: radius = min(12, 0.45 x the distance to the nearest other trim end), so two bumps never overlap
      const bumps: Bump[] = pad.legs.map((l) => ({ x: l.endXZ[0], z: l.endXZ[1], step: l.stepToPlane, r: 12 }));
      for (const b of bumps) for (const c of bumps) if (b !== c) b.r = Math.min(b.r, 0.45 * Math.hypot(b.x - c.x, b.z - c.z));
      const xs = pad.outline.map((q) => q[0]), zs = pad.outline.map((q) => q[1]);
      const edges: number[][] = [];
      for (let i = 0; i < pad.outline.length; i++) { const a = pad.outline[i], b = pad.outline[(i + 1) % pad.outline.length]; edges.push([a[0], a[1], b[0], b[1]]); }
      this.infos.push({ pad, bumps, x0: Math.min(...xs) - emb, x1: Math.max(...xs) + emb, z0: Math.min(...zs) - emb, z1: Math.max(...zs) + emb, edges });
    }
  }

  get count(): number { return this.infos.length; }
  padAt(i: number): PadResult { return this.infos[i].pad; }

  private level(info: PadInfo, x: number, z: number): number {
    const pl = info.pad.plane, p = info.pad;
    let y = pl.y0 + pl.gx * (x - p.x) + pl.gz * (z - p.z);
    for (const b of info.bumps) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r) { const k = 1 - d / b.r; y += b.step * k * k; }
    }
    return y;
  }
  /** Pad level f at (x, z) for pad number i (valid inside and near the outline). */
  levelOf(i: number, x: number, z: number): number { return this.level(this.infos[i], x, z); }

  private distToOutline(info: PadInfo, x: number, z: number): number {
    let best = 1e18;
    for (const e of info.edges) {
      const dx = e[2] - e[0], dz = e[3] - e[1];
      const L = dx * dx + dz * dz;
      const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - e[0]) * dx + (z - e[1]) * dz) / L));
      const d = Math.hypot(x - (e[0] + dx * t), z - (e[1] + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** Terrain carve: weight w (1 = the ground IS the pad level) and the level y. Returns false far away. `inside` = the point is inside a pad outline (the pad then wins over the road's own level). */
  sample(x: number, z: number, out: { w: number; y: number; inside: boolean }): boolean {
    out.w = 0; out.y = 0; out.inside = false;
    for (const info of this.infos) {
      if (x < info.x0 || x > info.x1 || z < info.z0 || z > info.z1) continue;
      if (pointInOutline(info.pad.outline, x, z)) { out.w = 1; out.y = this.level(info, x, z); out.inside = true; return true; }
      const d = this.distToOutline(info, x, z);
      if (d < this.emb) {
        const w = 1 - smooth(0, this.emb, d);
        if (w > out.w) { out.w = w; out.y = this.level(info, x, z); }
      }
    }
    return out.w > 0;
  }

  /** Circles (x, z, radius) that cover everything this terrain can touch, for the road cell grid. */
  cover(): Array<[number, number, number]> {
    return this.infos.map((i) => [(i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, Math.hypot(i.x1 - i.x0, i.z1 - i.z0) / 2 + 6] as [number, number, number]);
  }
}
