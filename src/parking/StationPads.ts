// STEP 4: LEVEL PADS under the road-side fuel stations and charge points (RoadStationSites.ts), applied inside TerrainGenerator.sample() like the mall / library pads
// (so the main thread, the chunk workers and the colliders all see the same ground). The pad is level at the site's floor height (`y` = the host road's surface height there),
// covers the lot AND the driveway strip up to the road shoulder, and grades back to the natural ground over BLEND metres. It gives way where a road / junction pad is.
import { ROAD_STATION_SITES } from './RoadStationSites';

/** Soft blend (m) from the level pad back to the natural ground. */
const BLEND = 14;
/** The pad is a hair below the road surface (the painted asphalt is draped 6 cm above the ground). */
export const STATION_PAD_SINK = 0.05;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Pad { x: number; z: number; rx: number; rz: number; hw: number; z0: number; z1: number; reach: number; floor: number; slope: number }

export class StationPads {
  /** The site generator (scripts/gen-road-stations.ts) switches the pads off to look at the ground the way it was before the pads. */
  enabled = true;
  private lx = [0];
  private pads: Pad[] = ROAD_STATION_SITES.map((s) => ({
    x: s.x, z: s.z, rx: Math.sin(s.yaw), rz: Math.cos(s.yaw),
    hw: s.hw + 1, z0: -s.hd - 1, z1: s.hd + s.gap + 1,
    reach: Math.hypot(s.hw + 1, s.hd + s.gap + 1) + BLEND + 2,
    floor: s.y - STATION_PAD_SINK,
    slope: s.slope,
  }));

  /** Distance to the pad rectangle; `lxOut[0]` receives the position along the road (local x). */
  private outside(p: Pad, x: number, z: number, lxOut?: number[]): number {
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * p.rz - dz * p.rx, lz = dx * p.rx + dz * p.rz;
    if (lxOut) lxOut[0] = Math.max(-p.hw - 3, Math.min(p.hw + 3, lx)); // the tilted plane is not extended far past the lot
    return Math.hypot(Math.max(Math.abs(lx) - p.hw, 0), Math.max(p.z0 - lz, lz - p.z1, 0));
  }

  /** Cheap pre-check: is (x, z) on a pad or its skirt? */
  near(x: number, z: number): boolean {
    if (!this.enabled) return false;
    for (const p of this.pads) {
      if (Math.abs(x - p.x) > p.reach || Math.abs(z - p.z) > p.reach) continue;
      if (this.outside(p, x, z) < BLEND) return true;
    }
    return false;
  }

  /** The new ground height for natural height `h`; `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    for (const p of this.pads) {
      if (Math.abs(x - p.x) > p.reach || Math.abs(z - p.z) > p.reach) continue;
      const d = this.outside(p, x, z, this.lx);
      if (d >= BLEND) continue;
      h += (p.floor + p.slope * this.lx[0] - h) * (1 - smoothstep(0, BLEND, d)) * k;
    }
    return h;
  }
}
