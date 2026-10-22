// AIRPLANE LOGIC (pure numbers, no three.js, deterministic): a scheduled shuttle flight between the NEW airport's runway and the PRESENT airport (src/airport).
// Nothing here is wired into the game yet - docs/NEW_AIRPORT_LOGIC.md explains how the new airport will use it.
//
// Conventions (same as the rest of the game): world x = east, z = SOUTH, metres, seconds. Heading h (rad): travel direction = (cos h, sin h) in the (x, z) plane,
// so h = 0 is east, h = +PI/2 is SOUTH, h = -PI/2 is NORTH. A runway end is the threshold you start your roll from, plus the direction of travel.

export interface RunwayEnd {
  /** Threshold (start of the usable runway for this direction), world metres. */
  x: number;
  z: number;
  /** Heading of travel along the runway (rad). */
  heading: number;
  /** Usable length (m). */
  length: number;
  /** Ground height of the runway (m above sea level). */
  y: number;
}

export type Phase = 'parked' | 'takeoff-roll' | 'rotate' | 'climb' | 'cruise' | 'descent' | 'final' | 'flare' | 'landing-roll' | 'taxi-in' | 'done';

export const PLANE_PERF = {
  /** Takeoff roll: constant acceleration (m/s^2) up to the rotation speed. */
  accel: 2.6,
  vRotate: 68,
  vClimb: 88,
  vCruise: 120,
  vApproach: 66,
  vTouchdown: 58,
  /** Landing roll braking (m/s^2) and the speed at which the plane turns off to taxi. */
  brake: 3.2,
  vTaxi: 9,
  /** Climb / descent slopes (rad): 7 degrees climb, 3 degrees glide path (the classic ILS slope). */
  climbSlope: (7 * Math.PI) / 180,
  glideSlope: (3 * Math.PI) / 180,
  /** Height above the runway for cruising and where the glide path starts (m). */
  cruiseAlt: 450,
  /** Distance before the landing threshold where the plane must be lined up (final approach fix). */
  finalDist: 5200,
  /** Flare: below this height the nose comes up and the glide flattens. */
  flareAlt: 12,
  /** Max bank angle (rad) and turn rate limit (rad/s). */
  maxBank: (25 * Math.PI) / 180,
  maxTurnRate: (3.2 * Math.PI) / 180,
  /** Max pitch angles (rad). */
  maxPitch: (12 * Math.PI) / 180,
} as const;

export interface Waypoint { x: number; z: number; /** height above SEA LEVEL (m) */ y: number; /** target speed on arriving here (m/s) */ v: number; phase: Phase }

const dirOf = (h: number): { x: number; z: number } => ({ x: Math.cos(h), z: Math.sin(h) });

/**
 * Flight plan for ONE flight: take off from `dep`, climb straight ahead, cruise, fly to the final approach fix of `arr` (aligned with its runway),
 * glide down 3 degrees, flare, touch down on `arr`'s threshold zone, roll out. `arr` is the end of the runway you LAND ON (you arrive from behind its threshold).
 * The plane is expected to be placed at dep threshold with speed 0.
 */
export function buildFlightPlan(dep: RunwayEnd, arr: RunwayEnd): Waypoint[] {
  const P = PLANE_PERF, d = dirOf(dep.heading), a = dirOf(arr.heading), wp: Waypoint[] = [];
  // 1. take-off roll: lift off at vRotate after v^2 / 2a metres (never more than 70 % of the runway)
  const roll = Math.min((P.vRotate * P.vRotate) / (2 * P.accel), dep.length * 0.7);
  const lift = { x: dep.x + d.x * roll, z: dep.z + d.z * roll };
  wp.push({ x: dep.x, z: dep.z, y: dep.y, v: 0, phase: 'takeoff-roll' });
  wp.push({ x: lift.x, z: lift.z, y: dep.y, v: P.vRotate, phase: 'rotate' });
  // 2. climb straight ahead (runway heading) to a safe height, then cruise level
  const climbH = Math.min(P.cruiseAlt, 220), climbDist = climbH / Math.tan(P.climbSlope);
  const c1 = { x: lift.x + d.x * climbDist, z: lift.z + d.z * climbDist };
  wp.push({ x: c1.x, z: c1.z, y: dep.y + climbH, v: P.vClimb, phase: 'climb' });
  // 3. final approach fix: finalDist before the arrival threshold, on the extended centre line
  const faf = { x: arr.x - a.x * P.finalDist, z: arr.z - a.z * P.finalDist };
  const fafY = arr.y + P.finalDist * Math.tan(P.glideSlope);
  // cruise leg: from the end of the climb to the top of the descent, height cruiseAlt (or whatever the glide path allows)
  const topY = Math.min(arr.y + P.cruiseAlt, Math.max(fafY + 60, dep.y + P.cruiseAlt));
  const c2 = { x: c1.x + (faf.x - c1.x) * 0.3, z: c1.z + (faf.z - c1.z) * 0.3 };
  wp.push({ x: c2.x, z: c2.z, y: Math.max(topY, fafY + 40), v: P.vCruise, phase: 'cruise' });
  // descent: leave cruise level towards the final approach fix
  const c3 = { x: faf.x + (c2.x - faf.x) * 0.45, z: faf.z + (c2.z - faf.z) * 0.45 };
  wp.push({ x: c3.x, z: c3.z, y: Math.max(topY, fafY + 40), v: P.vCruise, phase: 'cruise' });
  wp.push({ x: faf.x, z: faf.z, y: fafY, v: P.vApproach + 6, phase: 'descent' });
  // 4. final: straight glide down the centre line to just before the threshold (flare height)
  const flareDist = P.flareAlt / Math.tan(P.glideSlope);
  wp.push({ x: arr.x - a.x * flareDist, z: arr.z - a.z * flareDist, y: arr.y + P.flareAlt, v: P.vApproach, phase: 'final' });
  // 5. touchdown 300 m past the threshold, roll out, slow to taxi speed
  const td = Math.min(300, arr.length * 0.25);
  wp.push({ x: arr.x + a.x * td, z: arr.z + a.z * td, y: arr.y, v: P.vTouchdown, phase: 'flare' });
  const stop = Math.min(td + (P.vTouchdown * P.vTouchdown - P.vTaxi * P.vTaxi) / (2 * P.brake), arr.length - 40);
  wp.push({ x: arr.x + a.x * stop, z: arr.z + a.z * stop, y: arr.y, v: P.vTaxi, phase: 'landing-roll' });
  return wp;
}

export interface PlaneState {
  x: number; y: number; z: number;
  heading: number; pitch: number; roll: number;
  speed: number;
  phase: Phase;
  gearDown: boolean;
  /** Index of the waypoint being flown to. */
  leg: number;
  done: boolean;
}

const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** A plane flying a plan. step(dt) moves it; read `state`. Speed follows the next waypoint's target with the take-off / braking accelerations. */
export class PlaneFlight {
  readonly state: PlaneState;
  private along = 0; // distance flown along the current leg (m)
  private legLen: number;

  constructor(readonly plan: Waypoint[], startHeading: number) {
    const w = plan[0];
    this.state = { x: w.x, y: w.y, z: w.z, heading: startHeading, pitch: 0, roll: 0, speed: 0, phase: 'takeoff-roll', gearDown: true, leg: 1, done: false };
    this.legLen = this.len(0);
  }

  private len(i: number): number { const a = this.plan[i], b = this.plan[i + 1]; return Math.hypot(b.x - a.x, b.z - a.z); }

  step(dt: number): void {
    const s = this.state, P = PLANE_PERF;
    if (s.done) return;
    const a = this.plan[s.leg - 1], b = this.plan[s.leg];
    // ---- speed: accelerate (take-off) or brake (landing) or ease towards the target of the next waypoint
    const target = b.v;
    const rate = a.phase === 'takeoff-roll' ? P.accel : s.speed > target ? (b.phase === 'landing-roll' || b.phase === 'flare' ? P.brake : 1.4) : 1.6;
    s.speed += Math.max(-rate * dt, Math.min(rate * dt, target - s.speed));
    if (a.phase === 'takeoff-roll' && s.speed < 1) s.speed = 1; // never stand still on the plan
    // ---- advance along the leg
    this.along += s.speed * dt;
    while (this.along >= this.legLen && s.leg < this.plan.length - 1) { this.along -= this.legLen; s.leg++; this.legLen = this.len(s.leg - 1); }
    const A = this.plan[s.leg - 1], B = this.plan[s.leg];
    const t = this.legLen > 0 ? Math.min(1, this.along / this.legLen) : 1;
    s.x = A.x + (B.x - A.x) * t; s.z = A.z + (B.z - A.z) * t; s.y = A.y + (B.y - A.y) * t;
    s.phase = s.leg === 1 ? (s.speed >= P.vRotate * 0.92 ? 'rotate' : 'takeoff-roll') : B.phase; // first leg = the take-off roll (the plan's first waypoint is the standing start)
    // ---- heading follows the leg direction, turn rate limited; bank follows the turn
    const want = Math.atan2(B.z - A.z, B.x - A.x), dh = angDiff(want, s.heading);
    const turn = Math.max(-P.maxTurnRate * dt, Math.min(P.maxTurnRate * dt, dh));
    s.heading += turn;
    const bankTarget = Math.max(-P.maxBank, Math.min(P.maxBank, (turn / Math.max(dt, 1e-6)) * 7));
    s.roll += (bankTarget - s.roll) * Math.min(1, dt * 1.5);
    // ---- pitch from the climb / glide slope (nose up on rotate, flare), gear up above 25 m after take-off and down on final
    const run = Math.hypot(B.x - A.x, B.z - A.z), slope = run > 0 ? Math.atan2(B.y - A.y, run) : 0;
    let pitchT = Math.max(-P.maxPitch, Math.min(P.maxPitch, slope));
    if (B.phase === 'rotate') pitchT = P.maxPitch * 0.7 * Math.min(1, s.speed / P.vRotate);
    if (B.phase === 'flare') pitchT = (6 * Math.PI) / 180;
    if (B.phase === 'landing-roll' || B.phase === 'takeoff-roll') pitchT = 0;
    s.pitch += (pitchT - s.pitch) * Math.min(1, dt * 1.2);
    const agl = s.y - this.plan[0].y;
    if (A.phase === 'rotate' || A.phase === 'climb') s.gearDown = agl < 25;
    if (B.phase === 'final' || B.phase === 'flare' || B.phase === 'landing-roll' || B.phase === 'descent') s.gearDown = B.phase === 'descent' ? s.y < this.plan[s.leg].y + 700 : true;
    // ---- finished: arrived at the last waypoint
    if (s.leg === this.plan.length - 1 && t >= 1) { s.done = true; s.phase = 'taxi-in'; s.speed = P.vTaxi; s.gearDown = true; s.pitch = 0; s.roll = 0; }
  }
}
