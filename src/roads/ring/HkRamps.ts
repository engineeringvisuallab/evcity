// STEP HK-9a: the four loop ramps of the Hatikamrul-type interchange in WORLD coordinates (pure data + math, no scene; the mesh is HK-9b).
// The local frame of HkRampData (x EAST along the ring, y NORTH toward the J1-S arm) is put on the real ring / arm of the RoadNetwork at the node (NODE_VIADUCT.stationM).
import type { RoadNetwork } from '../RoadNetwork';
import { NODE_VIADUCT } from './NodeViaductData';
import { HK_LOOPS, HK_RAMP_HALF } from './HkRampData';

export interface HkFrame {
  /** Node = the J1-S arm end on the ring (real arm / link axis), world metres. */
  ox: number; oz: number;
  /** Unit vectors in the world: EAST (along the ring, station DEcreasing) and NORTH (toward the arm). */
  ex: number; ez: number; nx: number; nz: number;
  /** Angle (deg) between the ring direction and the arm direction as measured, before the arm direction was made exactly square to the ring. */
  squareErrDeg: number;
}

export interface HkRamp {
  id: string;
  /** World x / z / level of the centreline (the same points as the local data, ~4 m apart). */
  xs: number[]; zs: number[]; ys: number[]; cum: number[];
  halfW: number;
  /** Index of the end that joins the ring lane (the other end is the C-D road gore). */
  ringEnd: number;
  /** Level at the C-D end / at the ring end, as used. */
  yA: number; yB: number;
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The frame at the node, or null when the ring or the J1-S arm does not exist. ORIGIN = the end of the J1-S arm on the ring (the real arm / link axis: HK-9a found it 1.35 m EAST of NODE_VIADUCT.stationM, and every HK local number was measured from the arm axis). */
export function hkFrame(roads: RoadNetwork): HkFrame | null {
  const ring = roads.roads.find((r) => r.name === 'M8');
  const arm = roads.roads.find((r) => r.name === 'J1-S');
  if (!ring || !arm) return null;
  const near = (r: { xs: ArrayLike<number>; zs: ArrayLike<number> }, x: number, z: number): number => { let bi = 0, bd = Infinity; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - x, r.zs[k] - z); if (d < bd) { bd = d; bi = k; } } return bi; };
  const n0 = near(ring, ring.xs[Math.round(NODE_VIADUCT.stationM / ring.step)], ring.zs[Math.round(NODE_VIADUCT.stationM / ring.step)]);
  // the arm end: the arm point nearest to the ring node
  const ka = near(arm, ring.xs[n0], ring.zs[n0]);
  const ox = arm.xs[ka], oz = arm.zs[ka];
  const kr = near(ring, ox, oz);
  let ex = ring.xs[kr - 1] - ring.xs[kr + 1], ez = ring.zs[kr - 1] - ring.zs[kr + 1]; const el = Math.hypot(ex, ez); ex /= el; ez /= el; // station + goes WEST, so EAST = toward the smaller index
  const kb = ka >= arm.xs.length - 1 ? ka - 10 : ka + 10; // the arm direction 80 m away from the end
  let nx = arm.xs[kb] - arm.xs[ka], nz = arm.zs[kb] - arm.zs[ka]; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
  const squareErrDeg = Math.abs(Math.acos(Math.max(-1, Math.min(1, ex * nx + ez * nz))) * 180 / Math.PI - 90);
  const dot = ex * nx + ez * nz; nx -= ex * dot; nz -= ez * dot; const l2 = Math.hypot(nx, nz); nx /= l2; nz /= l2; // exactly square to the ring
  return { ox, oz, ex, ez, nx, nz, squareErrDeg };
}

/** Local (x east, y north) -> world. */
export const hkWorld = (f: HkFrame, x: number, y: number): [number, number] => [f.ox + x * f.ex + y * f.nx, f.oz + x * f.ez + y * f.nz];

/** The four loops in world coordinates, with the vertical profile (smoothstep from yA at the C-D end to yB at the ring end, along the centreline). */
export function hkRamps(f: HkFrame): HkRamp[] {
  return HK_LOOPS.map((L) => {
    const n = L.pts.length;
    const ringEnd = Math.abs(L.pts[0][1]) < Math.abs(L.pts[n - 1][1]) ? 0 : n - 1;
    const xs: number[] = [], zs: number[] = [], cum: number[] = [];
    L.pts.forEach(([x, y], i) => { const [wx, wz] = hkWorld(f, x, y); xs.push(wx); zs.push(wz); cum.push(i === 0 ? 0 : cum[i - 1] + Math.hypot(wx - xs[i - 1], wz - zs[i - 1])); });
    const len = cum[n - 1];
    const ys = cum.map((c) => { const t = ringEnd === n - 1 ? c / len : 1 - c / len; return L.yA + (L.yB - L.yA) * smooth(t); });
    return { id: L.id, xs, zs, ys, cum, halfW: HK_RAMP_HALF, ringEnd, yA: L.yA, yB: L.yB };
  });
}

/** Distance (m) of a world point from the ring axis (nearest ring segment within +-60 ring points of the node: the ramps lie within 150 m of it). */
export function hkRingOffset(roads: RoadNetwork): (x: number, z: number) => number {
  const ring = roads.roads.find((r) => r.name === 'M8')!;
  const k0 = Math.round(NODE_VIADUCT.stationM / ring.step);
  const a = Math.max(0, k0 - 60), b = Math.min(ring.xs.length - 2, k0 + 60);
  return (x, z) => {
    let best = Infinity;
    for (let k = a; k <= b; k++) {
      const ax = ring.xs[k], az = ring.zs[k], bx = ring.xs[k + 1] - ax, bz = ring.zs[k + 1] - az, l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)) : 0;
      const d = Math.hypot(x - ax - bx * t, z - az - bz * t); if (d < best) best = d;
    }
    return best;
  };
}
