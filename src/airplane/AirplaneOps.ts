// AIRPORT OPERATIONS (pure numbers, no three.js, deterministic): where aircraft stand, taxi and take off at one airport.
// Everything is derived from the airport plan (src/airport/AirportPlan) + the floor height of its pad, so it works for the old airport and for the sea airport.
//
// Local frame of an airport: x along the runway (runway centre = 0,0), z = terminal side (apron, terminal, parking), same as the AirportPlan.
// World frame: x east, z SOUTH; a plane heading h travels along (cos h, sin h) in (x, z) (see AirplaneLogic).
import { localToWorld, type AirportPlan } from '../airport/AirportPlan';
import { AIRPORT_SPEC as S } from '../airport/AirportSpec';
import type { RunwayEnd } from './AirplaneLogic';

export interface Pt { x: number; z: number }

/** Height of the pavement above the pad floor (m): the wheels roll on it. */
export const PAVEMENT_Y = 0.07;

/** Distance (m) of the usable threshold from the runway end, and where a plane lines up for take-off (the outer connector). */
const THRESHOLD_INSET = 20;
const LINEUP_X = 580;

export type Side = 1 | -1;

export interface Stand {
  id: string;
  /** Local position of the fuselage centre and the local direction of the nose (0, +1 = towards the terminal). */
  lx: number;
  lz: number;
  /** World position and heading (AirplaneLogic convention). */
  x: number;
  z: number;
  heading: number;
}

export interface AirportOps {
  id: string;
  plan: AirportPlan;
  /** Height of the wheels on the pavement (m above sea level). */
  y: number;
  /** World centre of the boarding area (in front of the terminal) and its radius (m). */
  gate: { x: number; z: number; radius: number };
  /** The spot where a passenger who gets off is put down (world), and a point a little further from the terminal. */
  curb: Pt;
  stands: Record<string, Stand>;
  /** Heading (AirplaneLogic) of local direction (dx, dz). */
  headingOf(dx: number, dz: number): number;
  toWorld(lx: number, lz: number): Pt;
  /** Take-off start (outer connector) for a roll towards local +x (side = +1) or -x (side = -1). */
  takeoffEnd(side: Side): RunwayEnd;
  /** Landing threshold for a landing roll towards local +x (side = +1; you arrive from the -x end) or -x. */
  landingEnd(side: Side): RunwayEnd;
  /** Taxi route (world points) from a stand to the take-off start of `side`. */
  taxiOut(stand: Stand, side: Side): Pt[];
  /** Taxi route for a plane that did not start at a stand (the aircraft factory's rollout): from `from` via `corner` (a point on the road to the taxiway) to the take-off start of `side`. */
  taxiFrom(from: Pt, corner: Pt, side: Side): Pt[];
  /** Taxi route from a point on the runway (world, after the landing roll, travelling towards local `side`) to a stand. */
  taxiIn(from: Pt, side: Side, stand: Stand): Pt[];
  /** Local x of the runway position of a world point (to find where a plane stands on the runway). */
  localX(x: number, z: number): number;
}

/** Build the operations of one airport from its plan (+ the floor height of the pad). */
export function createAirportOps(id: string, plan: AirportPlan, floorY: number): AirportOps {
  const site = plan.site;
  const y = floorY + PAVEMENT_Y;
  const toWorld = (lx: number, lz: number): Pt => localToWorld(site, lx, lz);
  const c = Math.cos(site.heading), s = Math.sin(site.heading);
  // world direction of a local direction: x_w = dx c + dz s, z_w = -dx s + dz c (see localToWorld)
  const headingOf = (dx: number, dz: number): number => Math.atan2(-dx * s + dz * c, dx * c + dz * s);
  const halfL = S.runway.length / 2;
  const taxiZ = S.taxiway.offset;

  // ---- stands: nose-in to the jet bridges of the terminal (nose 22.5 m from the fuselage centre, bridge end at z = apron end + 8 - 22)
  const apronFar = taxiZ + S.taxiway.width / 2 + S.apron.depth; // 276
  const termZ0 = apronFar + S.terminal.gap; // 284
  const stands: Record<string, Stand> = {};
  const addStand = (sid: string, lx: number, lz: number, dx: number, dz: number): void => {
    const w = toWorld(lx, lz);
    stands[sid] = { id: sid, lx, lz, x: w.x, z: w.z, heading: headingOf(dx, dz) };
  };
  for (const [i, gx] of S.terminal.gates.entries()) addStand(`gate${i}`, gx, termZ0 - 22 - 22.5, 0, 1);
  // military hardstands (sea airport): a row on the east apron, nose towards the shelters (only used when the plan has that apron)
  for (let i = 0; i < 5; i++) addStand(`mil${i}`, 330 + i * 70, 190, 0, 1); // mil0..3: the fighters of the base, mil4: the jet the player can fly (PlayerJet)

  const gate = { ...toWorld(0, termZ0 + 30), radius: 70 };
  const curb = toWorld(0, termZ0 + 80);

  const takeoffEnd = (side: Side): RunwayEnd => {
    const p = toWorld(-LINEUP_X * side, 0);
    // usable length from the line-up point to 40 m before the far end
    return { x: p.x, z: p.z, heading: headingOf(side, 0), length: LINEUP_X + halfL - 40, y };
  };
  const landingEnd = (side: Side): RunwayEnd => {
    const p = toWorld(-(halfL - THRESHOLD_INSET) * side, 0);
    return { x: p.x, z: p.z, heading: headingOf(side, 0), length: S.runway.length - 2 * THRESHOLD_INSET, y };
  };

  const connectors = S.taxiway.connectorX;
  const localX = (x: number, z: number): number => {
    const dx = x - site.cx, dz = z - site.cz;
    return dx * c - dz * s;
  };

  /** Local-frame route: from a stand straight north to the taxiway, along it to a connector, up the connector onto the runway centre line. */
  const taxiOut = (stand: Stand, side: Side): Pt[] => {
    const cx = -LINEUP_X * side; // the outer connector at the beginning of the roll
    const pts: Pt[] = [toWorld(stand.lx, stand.lz), toWorld(stand.lx, taxiZ), toWorld(cx, taxiZ), toWorld(cx, 40), toWorld(cx, 0)];
    return pts;
  };

  /** From a point outside the apron: to `corner`, north/south to the taxiway, along it to the outer connector, up onto the runway centre line. */
  const taxiFrom = (from: Pt, corner: Pt, side: Side): Pt[] => {
    const cx = -LINEUP_X * side;
    return [from, corner, toWorld(localX(corner.x, corner.z), taxiZ), toWorld(cx, taxiZ), toWorld(cx, 40), toWorld(cx, 0)];
  };

  /** Route off the runway: ahead to the next connector that lies in the direction of travel, down it to the taxiway, along it to the stand. */
  const taxiIn = (from: Pt, side: Side, stand: Stand): Pt[] => {
    const fx = localX(from.x, from.z);
    const ahead = connectors.filter((cx) => (cx - fx) * side > 25).sort((a, b) => (a - b) * side);
    const cx = ahead.length ? ahead[0] : connectors[side > 0 ? connectors.length - 1 : 0];
    return [from, toWorld(Math.max(-halfL + 60, Math.min(halfL - 60, cx)), 0), toWorld(cx, 40), toWorld(cx, taxiZ), toWorld(stand.lx, taxiZ), toWorld(stand.lx, stand.lz)];
  };

  return { id, plan, y, gate, curb, stands, headingOf, toWorld, takeoffEnd, landingEnd, taxiOut, taxiFrom, taxiIn, localX };
}

export interface TaxiOptions {
  /** Turning radius (m) of the path at the corners (the nose wheel cannot turn sharper): about 28 for an airliner, 14 for a fighter. */
  radius?: number;
  /** The plane stands nose-in at a gate: the first leg is a PUSHBACK (tail first, nose heading kept, then the tug swings the nose round to the taxiway direction). */
  pushback?: boolean;
}

interface PathPoint { x: number; z: number; /** index of the ORIGINAL route point this point leads to */ orig: number; /** top speed on the segment that ENDS at this point (m/s) */ vmax: number }

const PUSH_SPEED = 3.2;
const LAT_ACC = 1.1; // comfortable sideways acceleration on a curve (m/s^2): v <= sqrt(LAT_ACC * radius)
const ACC = 1.0; // speed up
const BRAKE = 1.4; // slow down

/**
 * A plane rolling along a taxi route like a real aircraft: the corners of the route are rounded with circular arcs of the nose-wheel turning radius (the plane
 * follows the arc, it does not slide round a corner), the speed drops for a curve and for the end of the route (it stops smoothly at the gate / the runway),
 * and a plane that stands nose-in at a gate is pushed back first. `index` = the original route point it is rolling to (so the runway logic still works).
 */
export class TaxiMover {
  x: number;
  z: number;
  heading: number;
  done = false;
  /** True: stand still (hold short of the runway). */
  holding = false;
  /** Speed now (m/s; negative while being pushed back). */
  speed = 0;
  /** True while the tug pushes the plane back (and the short stop after it, "engines start"). */
  pushing = false;
  private path: PathPoint[] = [];
  private cum: number[] = []; // distance along the path of each point
  private i = 1; // index of the path point the plane is rolling to
  private s = 0; // distance travelled along the path (m)
  private push: { len: number; h0: number; h1: number; wait: number } | null = null;

  /** Index of the ORIGINAL route point the plane is rolling to (1 = first leg). */
  get index(): number {
    return this.done ? this.route.length : this.pushing && this.push ? 1 : this.path[Math.min(this.i, this.path.length - 1)].orig;
  }

  constructor(private readonly route: Pt[], startHeading: number, private readonly topSpeed = 14, _turnRate = 0.7, opts: TaxiOptions = {}) { // _turnRate: kept for the old call sites; the path itself sets the turning
    this.x = route[0].x;
    this.z = route[0].z;
    this.heading = startHeading;
    const r = opts.radius ?? 28;
    let from = 0;
    if (opts.pushback && route.length >= 3) {
      // leg 1 (stand -> the taxiway centre line) is the pushback; the forward taxi starts on the taxiway
      const a = route[0], b = route[1], c = route[2];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.push = { len, h0: startHeading, h1: Math.atan2(c.z - b.z, c.x - b.x), wait: 4 };
      this.pushing = true;
      from = 1;
    }
    this.build(route.slice(from), from, r);
  }

  private build(pts: Pt[], origOffset: number, r: number): void {
    const P: PathPoint[] = [{ x: pts[0].x, z: pts[0].z, orig: origOffset + 1, vmax: this.topSpeed }];
    const clean = pts.filter((p, k) => k === 0 || Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z) > 0.5);
    for (let k = 1; k < clean.length; k++) {
      const B = clean[k], A = clean[k - 1];
      const orig = origOffset + k;
      if (k < clean.length - 1) {
        const C = clean[k + 1];
        const lenA = Math.hypot(B.x - A.x, B.z - A.z), lenB = Math.hypot(C.x - B.x, C.z - B.z);
        const ux = (B.x - A.x) / lenA, uz = (B.z - A.z) / lenA, vx = (C.x - B.x) / lenB, vz = (C.z - B.z) / lenB;
        const theta = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz)));
        if (theta > 0.05) {
          const tl = Math.min(r * Math.tan(theta / 2), 0.48 * Math.min(lenA, lenB));
          const re = tl / Math.tan(theta / 2);
          const E = { x: B.x - ux * tl, z: B.z - uz * tl };
          const sg = ux * vz - uz * vx > 0 ? 1 : -1; // + = turning towards +z..., sign of the cross product
          const cx = E.x + sg * -uz * re, cz = E.z + sg * ux * re; // arc centre (on the inside of the turn)
          P.push({ x: E.x, z: E.z, orig, vmax: this.topSpeed });
          const n = Math.max(4, Math.ceil(theta / 0.07));
          const vArc = Math.max(3.5, Math.min(this.topSpeed, Math.sqrt(LAT_ACC * re)));
          for (let q = 1; q <= n; q++) {
            const ang = sg * theta * (q / n), ca = Math.cos(ang), sa = Math.sin(ang), rx = E.x - cx, rz = E.z - cz;
            P.push({ x: cx + rx * ca - rz * sa, z: cz + rx * sa + rz * ca, orig: q === n ? orig + 1 : orig, vmax: vArc });
          }
          continue;
        }
      }
      P.push({ x: B.x, z: B.z, orig: orig, vmax: this.topSpeed });
    }
    this.path = P;
    this.cum = [0];
    for (let k = 1; k < P.length; k++) this.cum.push(this.cum[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].z - P[k - 1].z));
    if (!this.push) { this.x = P[0].x; this.z = P[0].z; }
  }

  /** Highest speed allowed now: the segment's own limit, and slow enough to reach every later slow segment / the end of the route at its speed. */
  private allowed(): number {
    let v = this.path[Math.min(this.i, this.path.length - 1)].vmax;
    for (let k = this.i; k < this.path.length; k++) {
      const vk = k === this.path.length - 1 ? 0 : this.path[k].vmax;
      const d = Math.max(0, this.cum[k] - this.s);
      v = Math.min(v, Math.sqrt(vk * vk + 2 * BRAKE * d));
      if (d > 120) break;
    }
    return v;
  }

  step(dt: number): void {
    if (this.done) return;
    if (this.pushing && this.push) {
      const pb = this.push;
      if (this.speed > -PUSH_SPEED) this.speed = Math.max(-PUSH_SPEED, this.speed - 1.5 * dt);
      // distance already pushed = (|start| - current)... track along the first leg through `s` of the push (stored in cum[0] shift)
      const a = this.route[0], b = this.route[1];
      const L = pb.len;
      const done = Math.hypot(this.x - a.x, this.z - a.z);
      if (done < L - 0.05) {
        const step = Math.min(-this.speed * dt, L - done);
        // pushed straight along the leg from the stand to the taxiway centre line, the nose keeps its heading and then swings to the taxi direction
        const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
        this.x += ux * step; this.z += uz * step;
        const f = Math.max(0, Math.min(1, (done + step - 0.4 * L) / (0.6 * L)));
        const dh = Math.atan2(Math.sin(pb.h1 - pb.h0), Math.cos(pb.h1 - pb.h0));
        this.heading = pb.h0 + dh * f * f * (3 - 2 * f);
        return;
      }
      // pushback finished: the tug lets go, the engines start (a short stop), then the plane taxis forward
      this.speed = 0;
      pb.wait -= dt;
      if (pb.wait > 0) return;
      this.pushing = false;
      this.push = null;
      this.x = b.x; this.z = b.z;
      this.path[0] = { ...this.path[0], x: b.x, z: b.z };
      this.s = 0;
      this.i = 1;
    }
    if (this.holding) { this.speed = Math.max(0, this.speed - BRAKE * 2 * dt); this.moveBy(this.speed * dt, dt); return; }
    const want = this.allowed();
    this.speed += Math.max(-BRAKE * 1.6 * dt, Math.min(ACC * dt, want - this.speed));
    this.moveBy(Math.max(0.0, this.speed) * dt + (want > 0.2 && this.speed < 0.3 ? 0.3 * dt : 0), dt); // never stall on the way
  }

  private moveBy(dist: number, dt: number): void {
    let left = dist;
    while (left > 0 && this.i < this.path.length) {
      const t = this.path[this.i];
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      if (d <= left) { this.x = t.x; this.z = t.z; left -= d; this.s = this.cum[this.i]; this.i++; } else { this.x += (dx / d) * left; this.z += (dz / d) * left; this.s += left; left = 0; }
    }
    if (this.i >= this.path.length) { this.done = true; this.speed = 0; return; }
    // the nose follows the tangent of the path segment under the plane (the path is already a smooth arc), eased so a polyline step never snaps it
    const a = this.path[this.i - 1], b = this.path[this.i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 0.05) {
      const want = Math.atan2(b.z - a.z, b.x - a.x);
      const dh = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      this.heading += dh * (1 - Math.exp(-dt / 0.3));
    }
  }

  /** How long (s) a plane needs for a whole route from standstill (pushback, arcs, slowing for curves, stopping): used to book the runway slots. */
  static duration(route: Pt[], startHeading: number, topSpeed: number, opts: TaxiOptions = {}): number {
    const m = new TaxiMover(route, startHeading, topSpeed, 0.7, opts);
    let t = 0;
    while (!m.done && t < 900) { m.step(0.25); t += 0.25; }
    return t;
  }

  /** Distance still to roll along the route (m). */
  remaining(): number {
    if (this.pushing) return this.cum[this.cum.length - 1] + 40;
    let d = 0, px = this.x, pz = this.z;
    for (let k = this.i; k < this.path.length; k++) { d += Math.hypot(this.path[k].x - px, this.path[k].z - pz); px = this.path[k].x; pz = this.path[k].z; }
    return d;
  }
}
