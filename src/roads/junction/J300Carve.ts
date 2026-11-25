// J9-b: ground cut along the two arms of the 300 ft junction (R6 and R4). Same method as HkTerrain (HK-9b2): CUT ONLY, pure math, built lazily, called from RoadNetwork.apply()
// so the main thread and the chunk workers get the same ground. Nothing is ever filled: where the arm is on a fill, the J300 mesh (MSE walls / slopes, J7-C) carries the road and the natural ground stays.
// Why it is needed: J9-a removes the old R6-9 and the old R4-9 stub, and with them their road cuttings. The new arms run below the natural ground in two places (J6 data):
//   R6 near its free end (old R6-9 start): cut up to 2.3 m;   R4 from about arm station 175 m to the J4-R4 join: cut up to 17 m (the hill saddle, the old road used to carve it).
// Rule (J2 / J6): strip |d| <= half width of the arm ribbon + STRIP: ground <= road surface - TRENCH;  beyond the strip the allowed ground rises 1 : 2 (SLOPE_RISE 0.5 per m).
// Ramps and platform need no cut (J9-b probe: ground is lower than the ramp / deck everywhere, the nose rows only touch the ring's own platform which the ring looks after).
import { J300_ARMS } from './J300Geometry';
import { SECTION_M6, SECTION_M4 } from '../standards/SectionTable';

export const J300C = { strip: 0.5, trench: 0.3, slopeRise: 0.5, reach: 64, cell: 32, soft: 1.0, softRun: 8 } as const;

export class J300Carve {
  private readonly ax: number[] = [];
  private readonly az: number[] = [];
  private readonly bx: number[] = [];
  private readonly bz: number[] = [];
  private readonly ay: number[] = [];
  private readonly by: number[] = [];
  private readonly hw: number[] = [];
  private readonly cells = new Map<number, number[]>();
  /** bounding box of every cut segment (+ reach): quick reject for almost every terrain sample */
  private x0 = Infinity;
  private x1 = -Infinity;
  private z0 = Infinity;
  private z1 = -Infinity;

  constructor() {
    const arms: [readonly { x: number; z: number; y: number }[], number][] = [
      [J300_ARMS.R6.rows as readonly { x: number; z: number; y: number }[], SECTION_M6.pavementEdge + 0.6],
      [J300_ARMS.R4.rows as readonly { x: number; z: number; y: number }[], SECTION_M4.pavementEdge + 0.6],
    ];
    for (const [rows, top] of arms) {
      const W = top + J300C.strip;
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        const s = this.ax.length;
        this.ax.push(a.x); this.az.push(a.z); this.bx.push(b.x); this.bz.push(b.z); this.ay.push(a.y); this.by.push(b.y); this.hw.push(W);
        const lo = Math.min(a.x, b.x) - W - J300C.reach, hi = Math.max(a.x, b.x) + W + J300C.reach;
        const zlo = Math.min(a.z, b.z) - W - J300C.reach, zhi = Math.max(a.z, b.z) + W + J300C.reach;
        this.x0 = Math.min(this.x0, lo); this.x1 = Math.max(this.x1, hi); this.z0 = Math.min(this.z0, zlo); this.z1 = Math.max(this.z1, zhi);
        for (let cx = Math.floor(lo / J300C.cell); cx <= Math.floor(hi / J300C.cell); cx++) {
          for (let cz = Math.floor(zlo / J300C.cell); cz <= Math.floor(zhi / J300C.cell); cz++) {
            const k = (cx + 4096) * 8192 + (cz + 4096);
            const l = this.cells.get(k);
            if (l) l.push(s); else this.cells.set(k, [s]);
          }
        }
      }
    }
  }

  get empty(): boolean { return this.ax.length === 0; }

  private ss(a: number, b: number, x: number): number { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); }

  /**
   * Cutting line (allowed ground height) at (x, z), or Infinity when no arm is in reach.
   * out[0] = metres beyond the strip of the deciding segment (0 inside the strip).
   * out[1] = OWN weight 0..1: 1 on the arm's own strip (the arm road itself, even where an old road's end cap lies under it), fading to 0 over 6 m beyond an arm END
   *          (so the old R6-9 / R4-9 pavement just past the join is never dented) and from the strip edge outward over 5 m (best over all segments in reach). RoadNetwork protects other roads with it.
   */
  cap(x: number, z: number, out?: number[]): number {
    if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return Infinity;
    const l = this.cells.get((Math.floor(x / J300C.cell) + 4096) * 8192 + (Math.floor(z / J300C.cell) + 4096));
    if (!l) return Infinity;
    let cap = Infinity, capRun = 0, capOwn = 0;
    for (let q = 0; q < l.length; q++) {
      const s = l[q];
      const dx = this.bx[s] - this.ax[s], dz = this.bz[s] - this.az[s], l2 = dx * dx + dz * dz;
      const traw = l2 > 0 ? ((x - this.ax[s]) * dx + (z - this.az[s]) * dz) / l2 : 0;
      const t = traw < 0 ? 0 : traw > 1 ? 1 : traw;
      const d = Math.hypot(x - this.ax[s] - dx * t, z - this.az[s] - dz * t);
      const y = this.ay[s] + (this.by[s] - this.ay[s]) * t;
      const run = d > this.hw[s] ? d - this.hw[s] : 0;
      const c = y - J300C.trench + run * J300C.slopeRise;
      if (c < cap) { cap = c; capRun = run; }
      // own weight = best over ALL segments in reach (the cutting line is decided by the lowest segment, which can be 17 m down the road, so it cannot decide who owns the point)
      // only the first / last segment of an arm has a free end (an inner end is always joined by the next segment)
      const first = s === 0 || this.hw[s - 1] !== this.hw[s] || this.bx[s - 1] !== this.ax[s] || this.bz[s - 1] !== this.az[s];
      const last = s + 1 >= this.ax.length || this.ax[s + 1] !== this.bx[s] || this.az[s + 1] !== this.bz[s];
      const len = Math.sqrt(l2);
      const beyond = traw < 0 ? (first ? -traw * len : 0) : traw > 1 ? (last ? (traw - 1) * len : 0) : 0;
      const ow = (beyond > 0 ? 1 - this.ss(0, 6, beyond) : 1) * (1 - this.ss(this.hw[s] - 1, this.hw[s] + 5, d));
      if (ow > capOwn) capOwn = ow;
    }
    if (out) { out[0] = capRun; out[1] = capOwn; }
    return cap;
  }
}
