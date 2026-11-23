// H4 TURN ROUND (2026-11-23): pure math, no three. A car that cannot go on (a dead end, or a vehicle that has stood in front of it for a long time) turns round
// inside the width of its own road with a K-turn: forward with full lock to the side with more room, stop, reverse with the other lock, stop, forward ... until the car
// has rotated about 180 degrees. The controller only produces the DriveInput (steer / pedals); AIDriver gives it the car state every frame and, when it says 'done',
// RouteBuilder.reseat() starts a new route in the opposite direction. Values marked ASSUMED are not measured on the real Rapier car.
import type { Obstacle } from './AIDriver';

/** The road under a point (Route.frame): centre line point, its tangent and the half width of the asphalt. */
export interface TurnFrame { ok: boolean; cx: number; cz: number; tx: number; tz: number; half: number }

export interface TurnArgs {
  /** Car centre (world), unit heading, speed along the heading (m/s, < 0 = reversing). */
  x: number; z: number; fx: number; fz: number; speed: number;
  /** Half length / half width of the car (m), wheelbase (m) and full steering lock (rad). */
  hl: number; hx: number; wheelbase: number; maxSteer: number;
  obstacles: readonly Obstacle[];
  me: unknown;
  frame(x: number, z: number): TurnFrame;
}

export interface TurnOpt {
  /** Most phases (forward or reverse runs) before the driver gives up. */
  maxPhases: number;
  /** Most seconds for the whole turn. */
  maxSeconds: number;
}

export type TurnState = 'run' | 'done' | 'abort';
export type TurnMode = 'fwd' | 'rev' | 'stop';

const V_FWD = 2.0;       // m/s forward in the turn (ASSUMED)
const V_REV = 1.8;       // m/s reversing in the turn (ASSUMED)
const EDGE = 0.4;        // m: a car corner may go this far outside the asphalt edge (the shoulder) (ASSUMED)
const LOOK = 0.8;        // m: a phase only goes on while the car, moved this much further with its steering lock, still has every corner on the asphalt (covers the braking distance) (ASSUMED)
const BACKOFF = 4.5;    // m: something stands right in front: first reverse straight this far to make room (ASSUMED)
const CLEAR = 1.8;       // m: gap to anything in the travel direction at which the car stops (ASSUMED)
const GOOD = 1.9;        // rad (109 deg): a turn that has to give up (no room / phases / blocked) after this much rotation counts as done, the route does the rest from a free road
const FINISH = Math.PI - 0.5; // rad: rotated far enough, pure pursuit does the last 29 degrees
const PHASE_MAX = 9;     // s: one phase never runs longer
const WAIT_MAX = 12;     // s: both directions blocked this long = give up

export interface TurnOut {
  steer: number; throttle: boolean; brake: boolean; handbrake: boolean; amt: number;
  state: TurnState;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export class TurnRound {
  /** +1 = rotate clockwise seen from above like a right turn (steer < 0 going forward), -1 = left. */
  readonly sign: 1 | -1;
  mode: TurnMode = 'stop';
  /** Rotation so far (rad, in the direction of `sign`), moving phases done, seconds since the start. */
  rot = 0;
  phases = 0;
  t = 0;
  private next: 'fwd' | 'rev' = 'fwd';
  private last: number;
  private tPhase = 0;
  private x0: number; private z0: number;
  private calm = 0;
  private wait = 0;
  private fails = 0;
  private finishing = false;
  /** Something stands right in front at the start: the first reverse run is straight (no lock) for BACKOFF m. */
  private backoff = false;
  /** Why the last phase ended (for the check script). */
  why = '';
  /** Obstacle in the direction of travel is the reason (then it is a wait, not a failure). */
  private blockedLast = false;

  constructor(a: TurnArgs, private readonly opt: TurnOpt) {
    this.last = Math.atan2(a.fz, a.fx);
    this.x0 = a.x; this.z0 = a.z;
    // the side with more room: the centre line lies to the right of the car (right vector = (-fz, fx)) -> the road extends to the left of the car too, but a car in the left lane
    // has the whole other lane on its right; rc > 0: centre line on my right = more room to the right
    const fr = a.frame(a.x, a.z);
    const rc = (fr.cx - a.x) * -a.fz + (fr.cz - a.z) * a.fx;
    this.sign = rc >= 0 ? 1 : -1;
    // first direction: forward if it is free and its corner is on the asphalt, else reverse
    this.backoff = this.obstacleAhead(a, 1);
    this.next = !this.backoff && this.dirFree(a, 1) ? 'fwd' : 'rev';
  }

  private right(a: TurnArgs): { x: number; z: number } { return { x: -a.fz, z: a.fx }; }

  /**
   * Margin (m) of the worst corner to the edge of the asphalt (+ EDGE shoulder); < 0 = outside. All four corners count sideways (measured from the centre line), the two corners in the
   * direction of travel `sg` also along the road (a dead end: the centre line point is clamped at the end, so a corner beyond the end is outside).
   */
  private margin(a: TurnArgs, sg: 1 | -1): number {
    let m = Infinity;
    for (const l of [1, -1]) for (const w of [1, -1]) {
      const px = a.x + a.fx * a.hl * l + -a.fz * a.hx * w, pz = a.z + a.fz * a.hl * l + a.fx * a.hx * w;
      const fr = a.frame(px, pz);
      const lim = fr.half + EDGE;
      m = Math.min(m, lim - Math.abs((px - fr.cx) * fr.tz - (pz - fr.cz) * fr.tx));
      if (l === sg) m = Math.min(m, lim - Math.hypot(px - fr.cx, pz - fr.cz));
    }
    return m;
  }

  /** The car moved `d` m on in direction `sg` with the lock of that phase (kinematic bicycle: the heading turns by d / wheelbase x tan(lock); right turn = heading angle atan2(fz, fx) grows). */
  private ahead(a: TurnArgs, sg: 1 | -1, d: number): TurnArgs {
    const steer = this.backoff && sg < 0 ? 0 : sg > 0 ? -this.sign : this.sign;
    const th0 = Math.atan2(a.fz, a.fx), dth = -((sg * d) / a.wheelbase) * Math.tan(steer * a.maxSteer);
    const thm = th0 + dth * 0.5;
    return { ...a, x: a.x + Math.cos(thm) * sg * d, z: a.z + Math.sin(thm) * sg * d, fx: Math.cos(th0 + dth), fz: Math.sin(th0 + dth) };
  }

  /** Is there a vehicle / person in the travel direction `sg` (+1 forward, -1 reverse) within CLEAR metres of the bumper? */
  private obstacleAhead(a: TurnArgs, sg: 1 | -1): boolean {
    const rx = -a.fz, rz = a.fx;
    for (const o of a.obstacles) {
      if (o.ref === a.me) continue;
      const dx = o.x - a.x, dz = o.z - a.z;
      const al = (dx * a.fx + dz * a.fz) * sg;
      if (al <= 0) continue;
      const la = Math.abs(dx * rx + dz * rz);
      if (al < a.hl + o.r + CLEAR && la < a.hx + o.r + 0.6) return true;
    }
    return false;
  }

  private dirFree(a: TurnArgs, sg: 1 | -1): boolean {
    return this.margin(this.ahead(a, sg, LOOK), sg) >= 0 && !this.obstacleAhead(a, sg);
  }

  step(dt: number, a: TurnArgs): TurnOut {
    this.t += dt;
    const th = Math.atan2(a.fz, a.fx);
    this.rot += wrap(th - this.last) * this.sign;
    this.last = th;
    const out: TurnOut = { steer: 0, throttle: false, brake: false, handbrake: false, amt: 0, state: 'run' };
    if (this.t > this.opt.maxSeconds) { this.why = 'time'; out.state = 'abort'; return this.halt(a, out); }

    if (this.mode === 'stop') {
      out.steer = this.finishing || (this.backoff && this.next === 'rev') ? 0 : this.next === 'fwd' ? -this.sign : this.sign;
      this.halt(a, out);
      if (Math.abs(a.speed) < 0.3) this.calm += dt; else this.calm = 0;
      if (this.calm < 0.3) return out;
      if (this.finishing) { out.state = 'done'; return out; }
      // the stopped phase moved how far?
      const moved = Math.hypot(a.x - this.x0, a.z - this.z0);
      if (this.phases > 0 && moved < 0.3 && !this.blockedLast) this.fails++;
      else if (moved >= 0.3) this.fails = 0;
      if (this.fails >= 2) { this.why = 'no room'; out.state = this.rot >= GOOD ? 'done' : 'abort'; return out; }
      if (this.phases >= this.opt.maxPhases) { this.why = 'phases'; out.state = this.rot >= GOOD ? 'done' : 'abort'; return out; }
      // start the next phase if its direction is free, else wait, then try the other direction
      const sg: 1 | -1 = this.next === 'fwd' ? 1 : -1;
      if (this.dirFree(a, sg)) {
        this.mode = this.next; this.tPhase = 0; this.x0 = a.x; this.z0 = a.z; this.wait = 0; this.calm = 0; this.phases++;
      } else {
        this.wait += dt;
        if (this.wait > 3) this.next = this.next === 'fwd' ? 'rev' : 'fwd';
        if (this.wait > WAIT_MAX) { this.why = 'blocked'; out.state = this.rot >= GOOD ? 'done' : 'abort'; }
        if (this.wait > 3) this.wait = Math.max(this.wait, 3.01); // keep counting up to WAIT_MAX across the swap
      }
      return out;
    }

    const sg: 1 | -1 = this.mode === 'fwd' ? 1 : -1;
    this.tPhase += dt;
    out.steer = this.mode === 'fwd' ? -this.sign : this.backoff ? 0 : this.sign;
    // finished: rotated far enough -> stop, then hand over
    if (this.rot >= FINISH) { this.finishing = true; this.mode = 'stop'; this.calm = 0; this.why = 'rotated'; return this.halt(a, out); }
    // end of this phase: a corner leaves the asphalt, something stands in the way, or the phase is too long
    const inRoad = this.margin(this.ahead(a, sg, LOOK), sg) >= 0, obs = this.obstacleAhead(a, sg);
    const backed = this.backoff && this.mode === 'rev' && Math.hypot(a.x - this.x0, a.z - this.z0) >= BACKOFF;
    if (backed) this.backoff = false;
    if (backed || !inRoad || obs || this.tPhase > PHASE_MAX) {
      this.blockedLast = obs;
      this.why = backed ? 'backed off' : obs ? 'obstacle' : !inRoad ? 'edge' : 'phase time';
      this.next = this.mode === 'fwd' ? 'rev' : 'fwd';
      this.mode = 'stop'; this.calm = 0; this.wait = 0;
      return this.halt(a, out);
    }
    // pedals: forward = gas to V_FWD; reverse = brake pedal selects reverse (Vehicle: brake at speed < 1 m/s = reverse gear), coast above V_REV
    if (this.mode === 'fwd') {
      if (a.speed < V_FWD - 0.4) { out.throttle = true; out.amt = 0.5; }
      else if (a.speed > V_FWD + 0.6) { out.brake = true; out.amt = 0.5; }
    } else {
      if (a.speed > -(V_REV - 0.4)) { out.brake = true; out.amt = 1; }
      else if (a.speed < -(V_REV + 0.8)) { out.throttle = true; out.amt = 0.5; } // throttle while reversing = braking (Vehicle)
    }
    return out;
  }

  /** Brake to a standstill: forward motion = brake, reverse motion = throttle (Vehicle brakes the reverse with the gas), at rest the handbrake. */
  private halt(a: TurnArgs, out: TurnOut): TurnOut {
    out.throttle = false; out.brake = false; out.amt = 0;
    if (a.speed > 0.6) { out.brake = true; out.amt = 1; }
    else if (a.speed < -0.6) { out.throttle = true; out.amt = 1; }
    else out.handbrake = true;
    return out;
  }
}
