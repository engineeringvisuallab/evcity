// STEP J1-e1 / J1-g3: the finished ground level of J1 (pure math, no three.js). One source of truth for BOTH the terrain carve (RoadNetwork.apply) and the mesh (GroundJ1Mesh).
// J1-g3 (open ground interchange, HANDOFF_ROAD_DESIGN.md 15.8.11):
//  - pad plane (J1-g3 fit over the open star) inside the square |e|, |n| <= SA = 100 m (the paved star is +-91.6 m, the slip arcs end at s 91.6 m),
//  - on each arm the lane zone (s = SA..S_END = 315 m, half width 27 m): from SA to SB (300 m) the level is the arm profile (PVI table J1-c4c / c5c / c6c / c7c) plus a difference d(s)
//    that starts at the plane (same level AND same grade at SA) and dies out at SB (cubic, level and grade both 0 at SB). From SB the level IS the approved arm profile,
//  - an embankment skirt of EMB metres around both, smoothstep back to the natural ground.
import { J1_ARM_PVI, type Pvi } from './J1ArmProfiles';

export type J1Arm = 'N' | 'E' | 'S' | 'W';
export interface J1TerrainCfg { x: number; z: number; yawDeg: number; y: number; a: number; b: number; rCore: number; emb: number }

export const J1_S_END = 315;      // end of the lane zone (m from the centre; open star lane zone ends at s 312.5); the arm roads (J1-e2) continue from here
export const J1_HALF_W = 27;      // half width of the lane zone incl. slip lane / exit lane (outer edge 23.4 m) and a shoulder
export const J1_SA = 100;         // pad plane ends here (the paved star is +-91.6 m): Config.roads.junctionJ1.rCore must be the same number
export const J1_SB = 300;         // from here the finished level IS the arm profile
const smooth = (a: number, b: number, x: number): number => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

/** Level of a PVI table at s (tangent lines + parabolic vertical curves). */
export function pviLevel(p: ReadonlyArray<Pvi>, s: number): number {
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (v.Lc > 0 && Math.abs(s - v.s) <= v.Lc / 2) { const s0 = v.s - v.Lc / 2; return v.y + v.g1 * (s - v.s) + ((v.g2 - v.g1) / (2 * v.Lc)) * (s - s0) * (s - s0); }
  }
  // outside every curve: the tangent line of the nearest PVI on the correct side
  let k = 0;
  while (k + 1 < p.length && s > p[k + 1].s - p[k + 1].Lc / 2) k++;
  const v = p[k];
  const g = s >= v.s ? v.g2 : v.g1;
  return v.y + g * (s - v.s);
}

export class J1Terrain {
  readonly cfg: J1TerrainCfg;
  private readonly cy: number; private readonly sy: number;
  /** per arm: height of the plane above the arm profile at SA (delta) and the difference of their grades along the arm at SA (dd) */
  readonly delta: Record<J1Arm, number> = { N: 0, E: 0, S: 0, W: 0 };
  readonly dd: Record<J1Arm, number> = { N: 0, E: 0, S: 0, W: 0 };

  constructor(cfg: J1TerrainCfg) {
    this.cfg = cfg;
    const y = (cfg.yawDeg * Math.PI) / 180;
    this.cy = Math.cos(y); this.sy = Math.sin(y);
    for (const arm of ['N', 'E', 'S', 'W'] as const) {
      const pl = (s: number): number => this.plane(...this.axisPoint(arm, s));
      const pr = (s: number): number => pviLevel(J1_ARM_PVI[arm], s);
      this.delta[arm] = pl(J1_SA) - pr(J1_SA);
      this.dd[arm] = (pl(J1_SA + 1) - pl(J1_SA - 1)) / 2 - (pr(J1_SA + 0.5) - pr(J1_SA - 0.5)) / 1;
    }
  }

  /** Local (e east, n north of the J1 axes) -> world, and back. */
  toWorld(e: number, n: number): [number, number] { return [this.cfg.x + e * this.cy + n * this.sy, this.cfg.z + e * this.sy - n * this.cy]; }
  toLocal(x: number, z: number): [number, number] { const dx = x - this.cfg.x, dz = z - this.cfg.z; return [dx * this.cy + dz * this.sy, dx * this.sy - dz * this.cy]; }
  /** World point on the axis of an arm, s metres from the centre. */
  axisPoint(arm: J1Arm, s: number): [number, number] {
    const [e, n] = arm === 'N' ? [0, s] : arm === 'S' ? [0, -s] : arm === 'E' ? [s, 0] : [-s, 0];
    return this.toWorld(e, n);
  }
  plane(x: number, z: number): number { const c = this.cfg; return c.y + c.a * (x - c.x) + c.b * (z - c.z); }

  /** Difference (finished level - arm profile) on the axis at s: delta at SA with the grade difference dd, zero level and zero grade at SB (cubic Hermite). */
  private diff(arm: J1Arm, s: number): number {
    if (s >= J1_SB) return 0;
    const L = J1_SB - J1_SA, t = (s - J1_SA) / L, t2 = t * t, t3 = t2 * t;
    return this.delta[arm] * (2 * t3 - 3 * t2 + 1) + this.dd[arm] * L * (t3 - 2 * t2 + t);
  }

  /** Finished level on the axis of an arm at s (plane up to SA, then profile + difference, exactly the profile from SB). */
  armLevel(arm: J1Arm, s: number): number {
    if (s <= J1_SA) return this.plane(...this.axisPoint(arm, Math.max(0, s)));
    return pviLevel(J1_ARM_PVI[arm], s) + this.diff(arm, s);
  }

  /** Which arm a local point belongs to, and its distance s along / o across the axis. */
  armOf(e: number, n: number): { arm: J1Arm; s: number; o: number } {
    if (Math.abs(n) >= Math.abs(e)) return n >= 0 ? { arm: 'N', s: n, o: Math.abs(e) } : { arm: 'S', s: -n, o: Math.abs(e) };
    return e >= 0 ? { arm: 'E', s: e, o: Math.abs(n) } : { arm: 'W', s: -e, o: Math.abs(n) };
  }

  /** Finished road level at a world point inside the J1 footprint (what the mesh uses). Valid where the point belongs to the pad or a lane zone. */
  levelAt(x: number, z: number): number {
    const [e, n] = this.toLocal(x, z);
    const a = this.armOf(e, n);
    if (a.s <= J1_SA) return this.plane(x, z);
    const [ax, az] = this.axisPoint(a.arm, a.s);
    return this.armLevel(a.arm, a.s) + (this.plane(x, z) - this.plane(ax, az)) * (1 - smooth(J1_SA, J1_SB, a.s)); // the cross fall of the plane fades out too
  }

  /** Terrain carve: weight w (1 = the ground IS the finished level) and the level y. Returns false far away. */
  sample(x: number, z: number, out: { w: number; y: number }): boolean {
    const c = this.cfg;
    const [e, n] = this.toLocal(x, z);
    const r = Math.hypot(e, n);
    out.w = 0; out.y = 0;
    if (r > J1_S_END + J1_HALF_W + c.emb + 4) return false;
    // pad: the square |e|, |n| <= rCore (= SA); the skirt measures the distance to that square
    const dp = Math.hypot(Math.max(0, Math.abs(e) - c.rCore), Math.max(0, Math.abs(n) - c.rCore));
    if (dp < c.emb) { out.w = 1 - smooth(0, c.emb, dp); out.y = this.plane(x, z); }
    // lane zones
    const a = this.armOf(e, n);
    const o1 = Math.max(0, a.o - J1_HALF_W), ds = Math.max(0, a.s - J1_S_END);
    const d = Math.hypot(o1, ds);
    const w = a.s < 0 ? 0 : 1 - smooth(0, c.emb, d);
    if (w > out.w) { out.w = w; out.y = this.levelAt(x, z); }
    return out.w > 0;
  }

  /** Circles (x, z, radius) that cover everything this terrain can touch, for the road cell grid. */
  cover(): Array<[number, number, number]> {
    const c = this.cfg, out: Array<[number, number, number]> = [[c.x, c.z, c.rCore * Math.SQRT2 + c.emb + 4]];
    for (const arm of ['N', 'E', 'S', 'W'] as const) for (let s = 40; s <= J1_S_END + 12; s += 24) { const [x, z] = this.axisPoint(arm, s); out.push([x, z, J1_HALF_W + c.emb + 12]); }
    return out;
  }
}
