// EVLab Step 14: the physics of the fountains (pure maths, no three, so the tests can run it in node). Building-local metres, seconds.
//  - every drop is a projectile: it leaves the nozzle with (vh, vy), gravity pulls it down (y = y0 + vy s - g s^2 / 2), it lands exactly when it is back at the water level of the
//    pool (flightTime), no matter if the nozzle stands on a plinth (above the water) or under the water.
//  - air: the sideways speed of a drop relaxes towards the wind speed (drag AIR 1/s), so a light breeze (windAt, 0.15..1.65 m/s, slowly turning and gusting) bends the whole spray and
//    a drop that stays long in the air (a tall jet) is pushed more than a short one. Vertical drag is left out (small for 5 mm drops over a few metres) so the landing time stays exact.
//  - nothing is exactly the same twice: every drop gets its own height (+-3 %), reach (+-6 %), direction (+-0.05 rad) and size (+-18 %) from a hash of (jet, drop, cycle), so there is no
//    pulsing and no per-drop random state (the same time gives the same picture, which the tests rely on).
//  - landing: a drop that hits the pool turns into a flat splash puff for DWELL seconds; the lead drop of every jet also throws SPRAY.n small droplets up (a second, small projectile
//    each, the faster the drop the higher they go) and starts a ripple ring that runs out over the pool surface and fades.
//  - fitReach keeps every landing inside the water: not on the plinth / pedestal in the middle, and (plaza basins) not over the rim, even with the strongest wind and the jitter above.
import type { FountainDef } from './EVLabCampus';
import { PLAZA_FOUNTAIN, WATER_Y } from './EVLabCampus';

export const G = 9.81;
/** Horizontal air drag (1/s): sideways speed relaxes towards the wind speed. */
export const AIR = 0.18;
/** Upper bound of windAt (m/s). */
export const WIND_MAX = 1.7;
/** How long a landed drop shows as a splash puff (s). */
export const DWELL = 0.32;
/** Per-drop random spread, as a fraction (angle in radians). */
export const JITTER = { vy: 0.03, vh: 0.06, ang: 0.05, size: 0.18 } as const;
/** Ripple ring: starting radius (m), speed (m/s), life (s). */
export const RING = { r0: 0.2, speed: 1.1, life: 1.7 } as const;
/** Splash droplets of the lead drop: number, upward speed = k * impact speed (clamped), m/s. */
export const SPRAY = { n: 3, k: 0.2, minUp: 0.8, maxUp: 3.6 } as const;
/** The plaza basin: floor top, rim height, water surface (all above the plaza floor, m). */
export const BASIN = { floor: 0.3, rim: 0.75, water: 0.6 } as const;

/** [number of jets, ring radius, height of the jet (m), horizontal reach (m), drops per jet]. A single jet at radius 0 is the centre jet: it sprays all round (a crown). */
export type Ring = readonly [n: number, r: number, h: number, reach: number, m: number];
export const PATTERN: Record<number, readonly Ring[]> = {
  1: [[1, 0, 5, 0, 6], [8, 1.2, 2.6, 2.2, 5]],
  2: [[1, 0, 11, 0, 9], [8, 1.6, 6, 3.2, 7], [12, 2.4, 3.4, 5.2, 6]],
  3: [[1, 0, 17, 0, 14], [6, 2.2, 11, 4, 8], [12, 3.6, 7.5, 8, 7], [18, 5.2, 4.2, 12.5, 6]],
};

/** Wind (m/s) at time t: a steady breeze that slowly changes strength (0.15..1.65) and turns a little. */
export function windAt(t: number): [number, number] {
  const sp = 0.9 + 0.5 * Math.sin(0.23 * t) + 0.25 * Math.sin(0.71 * t + 1.3);
  const a = 0.6 + 0.5 * Math.sin(0.07 * t + 0.4);
  return [sp * Math.cos(a), sp * Math.sin(a)];
}

/** Deterministic hash of three integers into [0, 1). */
export function hash01(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Time (s) a drop leaves at height y0 with upward speed vy and is back at height yl. */
export function flightTime(vy: number, y0: number, yl: number): number {
  return (vy + Math.sqrt(vy * vy + 2 * G * (y0 - yl))) / G;
}

/** Sideways distance of a drop that has moved with the wind for time s, relative to no wind: wind * (s - (1 - e^-AIR s) / AIR). */
export const drag = (s: number): number => (1 - Math.exp(-AIR * s)) / AIR;

/** Largest push of the wind on a drop that flies for T seconds (m). */
export function driftMax(T: number): number {
  return WIND_MAX * (T - drag(T));
}

/** Geometry of one fountain: where its water is and what stands in it. */
export interface FountainGeo { plaza: boolean; R: number; poolY: number; poolR: number; pedR: number; topR: number; topY: number }
export function fountainGeo(d: FountainDef): FountainGeo {
  if (d.y > WATER_Y + 0.5) {
    const R = d.x === PLAZA_FOUNTAIN.x && d.z === PLAZA_FOUNTAIN.z ? PLAZA_FOUNTAIN.r : 5;
    // basin: water radius R - 0.7 (inside the rim), plinth foot radius 2.2, plinth top radius 1.6 (nozzles within 1.5 m of the middle sit on it)
    return { plaza: true, R, poolY: BASIN.water, poolR: R - 0.7, pedR: 2.2, topR: 1.5, topY: 1.6 };
  }
  // lake jet: pedestal 3.8 m radius at the water line, marble disc 3.5 m on top (0.6 m above the water); the lake itself is the pool
  return { plaza: false, R: 3.8, poolY: d.y, poolR: Infinity, pedR: 3.8, topR: 3.3, topY: d.y + 0.6 };
}

/**
 * Landing distance from the middle of the fountain (m) that keeps every drop of a jet (flight time T) in the water: outside the plinth (pedR) and inside the rim (poolR),
 * with a 0.35 m edge, the strongest wind and the +-6 % reach spread. If the ring of water is too narrow for all that, the middle of it.
 */
export function fitReach(want: number, T: number, pedR: number, poolR: number): number {
  const dm = driftMax(T);
  const lo = pedR + 0.35 + dm + 0.07 * want;
  const hi = poolR - 0.35 - dm - 0.07 * want;
  if (hi < lo) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, want));
}

/** One jet: a nozzle that keeps throwing `m` drops, one after the other. */
export interface JetSpec {
  id: number;
  /** Middle of its fountain. */
  cx: number; cz: number;
  /** Nozzle. */
  x: number; y: number; z: number;
  /** Unit direction away from the middle (the centre jet picks a new one for every drop). */
  dx: number; dz: number; swirl: boolean;
  vy: number; vh: number;
  /** Nominal horizontal reach (m) and flight time (s), no wind, no spread. */
  reach: number; T: number;
  /** Time between two launches of the same drop (s): longest flight + DWELL. */
  P: number;
  poolY: number; pedR: number; poolR: number;
  m: number; ph: number;
  /** Index of its first drop in the drop InstancedMesh. */
  first: number;
}

export function buildJets(defs: readonly FountainDef[]): { jets: JetSpec[]; drops: number } {
  const jets: JetSpec[] = [];
  let count = 0;
  for (const d of defs) {
    const g = fountainGeo(d);
    for (const [n, r, h, reachNom, m] of PATTERN[d.size]) {
      const swirl = n === 1 && r === 0;
      const vy = Math.sqrt(2 * G * h);
      const y0 = r <= g.topR ? g.topY + 0.12 : g.poolY + 0.15; // on the plinth / pedestal, or rising out of the water
      const T = flightTime(vy, y0, g.poolY);
      const want = swirl ? Math.max(reachNom, g.pedR + 0.8) : r + reachNom;
      const reach = Math.max(0.2, fitReach(want, T, g.pedR, g.poolR) - r);
      const P = flightTime(vy * (1 + JITTER.vy), y0, g.poolY) + DWELL;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r > 3 ? 0.2 : 0);
        const dx = Math.cos(a), dz = Math.sin(a);
        jets.push({
          id: jets.length, cx: d.x, cz: d.z, x: d.x + dx * r, y: y0, z: d.z + dz * r, dx, dz, swirl, vy, vh: reach / drag(T), reach, T, P,
          poolY: g.poolY, pedR: g.pedR, poolR: g.poolR, m, ph: (i * 0.37) % 1, first: count,
        });
        count += m;
      }
    }
  }
  return { jets, drops: count };
}

/** One launch of one drop: its own speeds, direction, wind, flight time, landing point. */
export interface Cycle { k: number; vy: number; vh: number; dx: number; dz: number; wx: number; wz: number; T: number; tl: number; lx: number; lz: number; size: number; impact: number }
export const makeCycle = (): Cycle => ({ k: -1e9, vy: 0, vh: 0, dx: 1, dz: 0, wx: 0, wz: 0, T: 1, tl: 0, lx: 0, lz: 0, size: 1, impact: 0 });

/** Launch number k of drop i of jet j. */
export function cycleOf(j: JetSpec, i: number, k: number, o: Cycle): Cycle {
  const r1 = hash01(j.id, i, k), r2 = hash01(j.id, i, k + 100003), r3 = hash01(j.id, i, k + 200003), r4 = hash01(j.id, i, k + 300007);
  o.k = k;
  o.vy = j.vy * (1 + JITTER.vy * (2 * r1 - 1));
  o.vh = j.vh * (1 + JITTER.vh * (2 * r2 - 1));
  const ang = j.swirl ? r3 * Math.PI * 2 : Math.atan2(j.dz, j.dx) + JITTER.ang * (2 * r3 - 1);
  o.dx = Math.cos(ang); o.dz = Math.sin(ang);
  o.T = flightTime(o.vy, j.y, j.poolY);
  o.tl = (k - (j.ph + i / j.m)) * j.P;
  const w = windAt(o.tl + o.T / 2);
  o.wx = w[0]; o.wz = w[1];
  const e = drag(o.T);
  o.lx = j.x + o.dx * o.vh * e + o.wx * (o.T - e);
  o.lz = j.z + o.dz * o.vh * e + o.wz * (o.T - e);
  o.size = 1 + JITTER.size * (2 * r4 - 1);
  o.impact = Math.sqrt(o.vy * o.vy + 2 * G * (j.y - j.poolY));
  return o;
}

/** Which launch (k) a drop with phase offset `off` is in at time t, and how many seconds (u) into it. */
export function phaseOf(j: JetSpec, off: number, t: number, o: { k: number; u: number }): void {
  const q = t / j.P + off;
  o.k = Math.floor(q);
  o.u = (q - o.k) * j.P;
}

/** Where a drop (or splash droplet) is. state: 0 flying, 1 splash puff (f 0..1), 2 gone until the next launch. */
export interface Pose { state: 0 | 1 | 2; x: number; y: number; z: number; f: number; vy: number }
export const makePose = (): Pose => ({ state: 2, x: 0, y: 0, z: 0, f: 0, vy: 0 });

/** The drop of launch c, u seconds after it left. */
export function dropPose(j: JetSpec, c: Cycle, u: number, o: Pose): Pose {
  if (u < c.T) {
    const e = drag(u);
    o.state = 0;
    o.x = j.x + c.dx * c.vh * e + c.wx * (u - e);
    o.y = j.y + c.vy * u - 0.5 * G * u * u;
    o.z = j.z + c.dz * c.vh * e + c.wz * (u - e);
    o.f = u / c.T;
    o.vy = c.vy - G * u;
  } else if (u < c.T + DWELL) {
    o.state = 1; o.x = c.lx; o.y = j.poolY; o.z = c.lz; o.f = (u - c.T) / DWELL; o.vy = 0;
  } else {
    o.state = 2; o.f = 1; o.vy = 0;
  }
  return o;
}

/** Ripple ring from the landing of launch c, `age` seconds after the landing; false if there is no ring (not landed yet / faded). r = radius (m), a = brightness 0..1.2. */
export function ringPose(c: Cycle, age: number, o: { r: number; a: number }): boolean {
  if (age < 0 || age >= RING.life) return false;
  o.r = RING.r0 + RING.speed * age;
  o.a = Math.pow(1 - age / RING.life, 1.5) * Math.min(1, age / 0.08) * Math.min(1.2, Math.max(0.35, c.impact / 14));
  return true;
}

/** Splash droplet n of the landing of launch c, `age` seconds after it; false if it is not in the air (not landed yet / fell back). */
export function sprayPose(j: JetSpec, c: Cycle, n: number, age: number, o: Pose): boolean {
  const r1 = hash01(j.id, 5000 + n, c.k), r2 = hash01(j.id, 6000 + n, c.k), r3 = hash01(j.id, 7000 + n, c.k);
  const vUp = Math.min(SPRAY.maxUp, Math.max(SPRAY.minUp, SPRAY.k * c.impact)) * (0.7 + 0.6 * r1);
  const L = (2 * vUp) / G;
  if (age < 0 || age >= L) return false;
  const a = r2 * Math.PI * 2, hv = vUp * (0.3 + 0.6 * r3);
  o.state = 0;
  o.x = c.lx + Math.cos(a) * hv * age;
  o.z = c.lz + Math.sin(a) * hv * age;
  o.y = j.poolY + vUp * age - 0.5 * G * age * age;
  o.f = age / L;
  o.vy = vUp - G * age;
  return true;
}
