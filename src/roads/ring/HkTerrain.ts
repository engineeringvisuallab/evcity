// STEP HK-9b2: ground cut along the four loop ramps of the Hatikamrul-type interchange (HK-9b KNOWN FAIL M7: the SE ramp ran inside the hillside, ground up to 3.16 m over the pavement).
// CUT ONLY: where the natural ground is higher than the cutting line it is lowered, nothing is ever filled (a ramp over low ground is a viaduct / has retaining walls, HkRampMesh).
//   strip   (|u| <= halfW + STRIP): ground <= pavement - TRENCH (the 1.4 m box girder soffit stays clear, retaining walls of 1.5 m or less)
//   slope   beyond the strip: the allowed ground rises 1 : SLOPE (2.4 like the game embankments) up to the natural ground
// Same pure-math style as the other terrain modules: built once (lazy, first apply()), called from RoadNetwork.apply() so the main thread and the chunk workers get the same ground.
import type { RoadNetwork } from '../RoadNetwork';
import { HK_RAMP_HALF } from './HkRampData';
import { hkFrame, hkRamps, hkRingOffset } from './HkRamps';
import { HM } from './HkRampMesh';

export const HKT = { strip: 1.5, trench: 1.5, slope: 2.4, reach: 60, cell: 32 } as const;

export class HkTerrain {
  private readonly ax: number[] = [];
  private readonly az: number[] = [];
  private readonly bx: number[] = [];
  private readonly bz: number[] = [];
  private readonly ay: number[] = [];
  private readonly by: number[] = [];
  private readonly cells = new Map<number, number[]>();
  /** Bounding box of every cut segment (+ reach): a quick reject for the vast majority of terrain samples. */
  private x0 = Infinity;
  private x1 = -Infinity;
  private z0 = Infinity;
  private z1 = -Infinity;

  constructor(roads: RoadNetwork) {
    const f = hkFrame(roads);
    if (!f) return;
    const off = hkRingOffset(roads);
    const W = HK_RAMP_HALF + HKT.strip;
    for (const rp of hkRamps(f)) {
      // the SAME points the mesh keeps: from the C-D end up to HM.maxOff from the ring axis (the rest is the ring deck / aux lane, the ring looks after its own ground)
      const n = rp.xs.length;
      const cdEnd = rp.ringEnd === 0 ? n - 1 : 0;
      const step = rp.ringEnd === 0 ? -1 : 1;
      const keep: number[] = [];
      for (let i = cdEnd; i >= 0 && i < n; i += step) {
        if (off(rp.xs[i], rp.zs[i]) <= HM.maxOff) break;
        keep.push(i);
      }
      for (let q = 0; q + 1 < keep.length; q++) {
        const a = keep[q];
        const b = keep[q + 1];
        const s = this.ax.length;
        this.ax.push(rp.xs[a]); this.az.push(rp.zs[a]); this.bx.push(rp.xs[b]); this.bz.push(rp.zs[b]);
        this.ay.push(rp.ys[a]); this.by.push(rp.ys[b]);
        const lo = Math.min(rp.xs[a], rp.xs[b]) - W - HKT.reach;
        const hi = Math.max(rp.xs[a], rp.xs[b]) + W + HKT.reach;
        const zlo = Math.min(rp.zs[a], rp.zs[b]) - W - HKT.reach;
        const zhi = Math.max(rp.zs[a], rp.zs[b]) + W + HKT.reach;
        this.x0 = Math.min(this.x0, lo); this.x1 = Math.max(this.x1, hi);
        this.z0 = Math.min(this.z0, zlo); this.z1 = Math.max(this.z1, zhi);
        for (let cx = Math.floor(lo / HKT.cell); cx <= Math.floor(hi / HKT.cell); cx++) {
          for (let cz = Math.floor(zlo / HKT.cell); cz <= Math.floor(zhi / HKT.cell); cz++) {
            const k = (cx + 4096) * 8192 + (cz + 4096);
            const l = this.cells.get(k);
            if (l) l.push(s); else this.cells.set(k, [s]);
          }
        }
      }
    }
  }

  get empty(): boolean { return this.ax.length === 0; }

  /** Lower `h` (ground height at x, z) to the cutting line of the nearest ramp segment; returns the new height. */
  apply(x: number, z: number, h: number): number {
    if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return h;
    const l = this.cells.get((Math.floor(x / HKT.cell) + 4096) * 8192 + (Math.floor(z / HKT.cell) + 4096));
    if (!l) return h;
    const W = HK_RAMP_HALF + HKT.strip;
    let cap = Infinity;
    for (let q = 0; q < l.length; q++) {
      const s = l[q];
      const dx = this.bx[s] - this.ax[s];
      const dz = this.bz[s] - this.az[s];
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - this.ax[s]) * dx + (z - this.az[s]) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - this.ax[s] - dx * t, z - this.az[s] - dz * t);
      const y = this.ay[s] + (this.by[s] - this.ay[s]) * t;
      const c = y - HKT.trench + (d > W ? (d - W) / HKT.slope : 0);
      if (c < cap) cap = c;
    }
    return h > cap ? cap : h;
  }
}
