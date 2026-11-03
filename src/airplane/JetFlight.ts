// FIGHTER JET FLIGHT MODEL (pure numbers, no three.js, deterministic): a small arcade model: speed from the throttle, the nose decides the flight path, coordinated
// turns, stall below 56 m/s, wheels roll on the ground, touchdown limits. Used by PlayerJet (and the tests). World x = east, z = SOUTH, heading h: travel direction
// = (cos h, sin h), h = -PI/2 is north. pitch + = nose up, roll + = right wing down.

export const JET = {
  /** Stalls below this speed in the air; rotates (lifts off) above vRotate. */
  vStall: 56,
  vRotate: 78,
  vMax: 340,
  /** Speed from full throttle (m/s) and the extra of the afterburner. */
  vFull: 250,
  vAfter: 90,
  accel: 14,
  /** Acceleration on the ground (m/s^2) and the extra of the afterburner. */
  groundAccel: 9,
  decel: 7,
  brake: 16,
  g: 9.81,
  /** Rates (rad/s). */
  pitchRate: 1.1,
  rollRate: 2.6,
  yawRate: 0.55,
  maxPitch: 1.25,
  /** Touchdown limits: sink rate (m/s), roll (rad), pitch (rad), speed (m/s). */
  maxSink: 7.5,
  maxLandRoll: 0.35,
  maxLandPitch: 0.34,
  maxLandSpeed: 150,
} as const;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export interface JetState {
  x: number; y: number; z: number;
  heading: number; pitch: number; roll: number;
  speed: number; throttle: number;
  /** Extra sink from a stall / a steep bank (m/s), and the vertical speed (m/s). */
  sink: number; vy: number;
  gear: boolean; assist: boolean; ab: boolean; onGround: boolean; stall: boolean;
  /** > 0: crashed, seconds until the jet is brought back. */
  crashT: number;
}

/** The pilot's inputs of this frame. pitch + = nose up, roll + = bank right, yaw + = nose right. */
export interface JetControls { throttleUp: boolean; throttleDown: boolean; afterburner: boolean; pitch: number; roll: number; yaw: number; brake: boolean }

export type JetEvent = { type: 'landed' } | { type: 'crash'; reason: 'water' | 'gear' | 'hard' } | null;

export function newJetState(): JetState {
  return { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0, sink: 0, vy: 0, gear: true, assist: true, ab: false, onGround: true, stall: false, crashT: 0 };
}

export class JetFlight {
  readonly st: JetState = newJetState();

  /** `ground(x, z)`: ground height (the sea counts as ~0.2 m), `water(x, z)`: true on the sea. */
  constructor(private ground: (x: number, z: number) => number, private water: (x: number, z: number) => boolean) {}

  /** Advance one frame (dt <= 0.05). Returns an event when the wheels touch the ground in the air (a landing or a crash). */
  step(dt: number, c: JetControls): JetEvent {
    const s = this.st, J = JET;
    let ev: JetEvent = null;
    // ---- throttle + afterburner
    if (c.throttleUp) s.throttle = Math.min(1, s.throttle + 0.5 * dt);
    if (c.throttleDown) s.throttle = Math.max(0, s.throttle - 0.5 * dt);
    s.ab = c.afterburner && s.throttle > 0.92;

    // ---- speed: from the throttle; the nose up costs speed, the nose down gains it; the wheel brakes on the ground
    const target = s.throttle * J.vFull + (s.ab ? J.vAfter : 0);
    if (s.speed < target) s.speed += ((s.onGround ? J.groundAccel : J.accel) + (s.ab ? 6 : 0)) * dt; else s.speed -= (s.onGround ? 3.2 + (c.brake ? J.brake : 0) : J.decel) * dt;
    if (!s.onGround) s.speed -= J.g * Math.sin(s.pitch) * 0.8 * dt;
    s.speed = clamp(s.speed, 0, J.vMax);

    if (s.onGround) {
      // ---- rolling on the ground: steer with the rudder (and A / D), the nose comes up above the rotation speed when you pull
      s.roll += (0 - s.roll) * Math.min(1, 6 * dt);
      const steer = (c.yaw + c.roll) * J.yawRate * Math.min(1, s.speed / 14) * (s.speed > 60 ? 0.3 : 1);
      s.heading += steer * dt;
      const want = s.speed > J.vRotate * 0.9 && c.pitch > 0 ? 0.3 : 0;
      s.pitch += (want - s.pitch) * Math.min(1, 1.5 * dt);
      s.x += Math.cos(s.heading) * s.speed * dt;
      s.z += Math.sin(s.heading) * s.speed * dt;
      s.y = this.ground(s.x, s.z);
      s.vy = 0;
      s.stall = false;
      if (s.speed > J.vRotate && s.pitch > 0.07) { s.onGround = false; s.sink = 0; s.vy = Math.sin(s.pitch) * s.speed * 0.4; }
    } else {
      // ---- in the air
      const eff = Math.min(1, s.speed / 90); // controls bite with speed
      s.pitch += c.pitch * J.pitchRate * eff * dt;
      s.roll += c.roll * J.rollRate * eff * dt;
      if (s.assist) {
        if (c.pitch === 0) s.pitch += (0 - s.pitch) * Math.min(1, 0.25 * dt);
        if (c.roll === 0) s.roll += (0 - s.roll) * Math.min(1, 0.9 * dt);
      }
      s.pitch = clamp(s.pitch, -J.maxPitch, J.maxPitch);
      s.roll = clamp(s.roll, -1.6, 1.6);
      // a banked jet turns (coordinated turn), the rudder adds a little
      s.heading += ((J.g * Math.tan(clamp(s.roll, -1.3, 1.3))) / Math.max(s.speed, 45)) * dt + c.yaw * 0.2 * eff * dt;
      // stall: the nose falls and the lift goes
      s.stall = s.speed < J.vStall;
      const lift = clamp((s.speed - 40) / (J.vStall - 40), 0, 1);
      if (s.stall) s.pitch -= (J.vStall - s.speed) * 0.02 * dt;
      s.sink = lift >= 1 ? Math.max(0, s.sink - 30 * dt) : Math.min(90, s.sink + J.g * (1 - lift) * dt);
      s.sink += J.g * (1 - Math.cos(clamp(s.roll, -1.5, 1.5))) * 0.35 * dt; // a steep bank loses height
      const cp = Math.cos(s.pitch);
      s.vy = Math.sin(s.pitch) * s.speed - s.sink;
      s.x += Math.cos(s.heading) * cp * s.speed * dt;
      s.z += Math.sin(s.heading) * cp * s.speed * dt;
      s.y += s.vy * dt;
      // the edge of the map: turn back gently
      const r = Math.hypot(s.x, s.z);
      if (r > 5600) { const back = Math.atan2(-s.z, -s.x); s.heading += Math.atan2(Math.sin(back - s.heading), Math.cos(back - s.heading)) * Math.min(1, 0.6 * dt); }
      // ground contact
      const g2 = this.ground(s.x, s.z);
      if (s.y <= g2 + 0.02) ev = this.touchdown(g2);
    }
    return ev;
  }

  /** The wheels touch the ground: land, or crash. */
  private touchdown(ground: number): JetEvent {
    const s = this.st, J = JET;
    const water = this.water(s.x, s.z);
    const ok = !water && s.gear && Math.abs(s.roll) < J.maxLandRoll && s.pitch > -0.12 && s.pitch < J.maxLandPitch && s.vy > -J.maxSink && s.speed < J.maxLandSpeed;
    if (ok) {
      s.onGround = true; s.y = ground; s.vy = 0; s.sink = 0; s.roll = 0;
      s.pitch = Math.max(0, s.pitch * 0.5);
      return { type: 'landed' };
    }
    s.crashT = 2.6;
    s.speed = 0; s.throttle = 0; s.ab = false;
    return { type: 'crash', reason: water ? 'water' : !s.gear ? 'gear' : 'hard' };
  }
}
