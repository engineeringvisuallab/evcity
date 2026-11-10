// ROADS STEP 4: the gap rule of a driver who waits at the start of a U-turn. Pure maths, so scripts/uturn-test.ts can test it without the physics.
import { Config } from '../core/Config';

export interface GapObstacle { x: number; z: number; vx: number; vz: number; kind: 'vehicle' | 'person'; ref: unknown }
export interface TurnStart { x: number; z: number; ur?: number }

/**
 * Is the U-turn that starts at S not safe yet? Frame: a = metres along the travel direction from S (the half circle bulges to a > 0 and comes back),
 * l = metres to the LEFT of the travel direction (our own lanes l = 0 .. R, the far carriageway l = -R .. 0). `prev` is the route point before S (gives
 * the travel direction), (fx, fz) the heading of the car (used when there is no previous point), `waited` the seconds the driver has already waited.
 */
export function uturnBlocked(S: TurnStart, prev: { x: number; z: number } | null, fx: number, fz: number, obstacles: readonly GapObstacle[], self: unknown, waited: number): boolean {
  const U = Config.city.uturn;
  const R = S.ur ?? 8;
  let hx = fx;
  let hz = fz;
  if (prev) {
    const dx = S.x - prev.x;
    const dz = S.z - prev.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.5) { hx = dx / dl; hz = dz / dl; }
  }
  const T = waited > 10 ? 2.5 : U.gapSeconds; // a driver who has waited long accepts a smaller gap
  for (const o of obstacles) {
    if (o.ref === self || o.kind !== 'vehicle') continue;
    const rx = o.x - S.x;
    const rz = o.z - S.z;
    const a = rx * hx + rz * hz;
    const l = rx * hz - rz * hx;
    const vh = o.vx * hx + o.vz * hz;
    // 1. our own carriageway, coming up from behind: the half circle crosses all its lanes
    if (l > -2 && l < R + 2.5 && a > -100 && a < 4 && vh > 1.5 && -a / vh < T) return true;
    // 2. the far carriageway, oncoming: we end up in its kerb lane
    if (l < 2 && l > -(R + 2.5) && a > -6 && a < 150 && vh < -1.5 && Math.max(0, a - R) / -vh < T + 2) return true;
    // 3. something stands in the swept half disc (not for a driver who has waited long: the normal brakes still protect him)
    if (waited <= 10 && a > 0.5 && a < R + 3 && Math.abs(l) < R + 3 && Math.hypot(o.vx, o.vz) < 1.5 && Math.hypot(rx, rz) < R + 4) return true;
  }
  return false;
}
