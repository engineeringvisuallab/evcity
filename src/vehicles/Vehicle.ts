import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { OrbitTarget } from '../camera/OrbitCamera';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainGenerator } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { clamp } from '../utils/math';
import { Powertrain } from './Powertrain';
import { VehicleModel } from './VehicleModel';
import { ENGINEER_LOOK, PersonModel } from '../people/PersonModel';
import type { Person } from '../people/Person';
import type { AIDriver } from '../traffic/AIDriver';
import type { VehicleSpec } from './VehicleSpec';

export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  /** -1 = steer right, +1 = steer left (Rapier: +X is the left side when facing +Z). */
  steer: number;
  handbrake: boolean;
  /** Optional analogue pedals (0..1) for AI drivers; the keyboard leaves them out (= full pedal). */
  throttleAmt?: number;
  brakeAmt?: number;
}

/** Who sits behind the wheel: a person, or the player himself. A vehicle never exists without one (see VehicleManager). */
export type Driver = Person | 'player';

export interface VehicleTelemetry {
  speed: number;
  kmh: number;
  rpm: number;
  redline: number;
  idle: number;
  gear: number;
  gearCount: number;
  auto: boolean;
  throttle: number;
  brake: number;
  steerAngle: number;
  torque: number;
  powerKw: number;
  wheelForce: number;
  slip: boolean;
  limiter: boolean;
  shifting: boolean;
  engineBraking: boolean;
  handbrake: boolean;
  wheelsOnGround: number;
}

export interface VehicleDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
}

const RHO = 1.2;
const ROLL_RES = 0.012;
/** Tyre grip multiplier per surface under the wheel (STAGE 6): natural ground (baseline), gravel shoulder, asphalt. */
const SURFACE_GRIP = [1.0, 1.0, 1.15] as const;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A drivable vehicle: Rapier dynamic chassis + Rapier's raycast vehicle controller
 * (spring/damper suspension, tyre friction, brakes, steering). On top of that we model the
 * drivetrain (Powertrain: engine torque curve, clutch, gearbox, final drive) and add
 * aerodynamic drag and rolling resistance as forces.
 */
export class Vehicle implements OrbitTarget {
  readonly model: VehicleModel;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly powertrain: Powertrain;
  private controller: RAPIER.DynamicRayCastVehicleController;

  occupied = false;
  /** Tour vehicles are managed by TourManager rather than regular traffic despawn rules. */
  tourVehicle = false;
  /** Marked law-enforcement vehicle controlled by PolicePursuitManager. */
  policeVehicle = false;
  /** Non-null while a Tour ride is controlled by the service autopilot. */
  tourInput: DriveInput | null = null;
  /** Whoever is driving. null only for the few seconds after the player left a car (it is removed then). */
  driver: Driver | null = null;
  /** The brain of an AI-driven car (null when the player drives or when nobody does). */
  ai: AIDriver | null = null;
  /** Seconds since the player got out (the empty car disappears soon after). */
  abandonedFor = 0;
  private playerSeat: PersonModel | null = null;
  /** False while parked far from the player (no ground collider there): body is frozen. */
  enabled = false;

  private throttle = 0;
  private brake = 0;
  private steerAngle = 0;
  private handbrake = false;
  private wheelsOnGround = 0;
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private renderPos = new THREE.Vector3();
  private renderQuat = new THREE.Quaternion();
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private speed = 0;

  constructor(
    private d: VehicleDeps,
    readonly spec: VehicleSpec,
    spawnWorld: THREE.Vector3,
    yaw: number,
  ) {
    const R = d.physics.RAPIER;
    const s = spec;
    const local = d.origin.toLocal(spawnWorld);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);

    this.body = d.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(local.x, local.y, local.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.02)
        .setAngularDamping(0.5)
        .setCanSleep(false),
    );
    // Collider has no density of its own: mass and centre of mass are set explicitly (low COM = stable car).
    this.collider = d.physics.world.createCollider(
      R.ColliderDesc.cuboid(s.half.x, s.half.y, s.half.z).setDensity(0).setFriction(0.4).setRestitution(0.05),
      this.body,
    );
    const ex = s.half.x * 2;
    const ey = s.half.y * 2;
    const ez = s.half.z * 2;
    this.body.setAdditionalMassProperties(
      s.mass,
      { x: 0, y: s.comY, z: 0 },
      {
        x: (s.mass / 12) * (ey * ey + ez * ez),
        y: (s.mass / 12) * (ex * ex + ez * ez),
        z: (s.mass / 12) * (ex * ex + ey * ey),
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    this.controller = d.physics.world.createVehicleController(this.body);
    const spots: [number, number][] = [
      [s.trackHalf, s.wheelbaseHalf],
      [-s.trackHalf, s.wheelbaseHalf],
      [s.trackHalf, -s.wheelbaseHalf],
      [-s.trackHalf, -s.wheelbaseHalf],
    ];
    for (const [x, z] of spots) {
      this.controller.addWheel({ x, y: s.connY, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.susp.rest, s.wheelRadius);
    }
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelSuspensionStiffness(i, s.susp.stiffness);
      this.controller.setWheelSuspensionCompression(i, s.susp.compression);
      this.controller.setWheelSuspensionRelaxation(i, s.susp.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, s.susp.travel);
      this.controller.setWheelMaxSuspensionForce(i, 1e6);
      this.controller.setWheelFrictionSlip(i, s.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, s.sideFriction);
    }

    this.powertrain = new Powertrain(s);
    this.model = new VehicleModel(s);
    d.scene.add(this.model.root);

    this.prevPos.copy(local);
    this.currPos.copy(local);
    this.prevQuat.copy(q);
    this.currQuat.copy(q);
    this.syncModel(1);
    this.body.setEnabled(false); // enabled by VehicleManager once the ground under it has loaded

    d.bus.on('origin:shift', ({ dx, dz }) => {
      for (const v of [this.prevPos, this.currPos, this.renderPos]) {
        v.x -= dx;
        v.z -= dz;
      }
      this.model.root.position.x -= dx;
      this.model.root.position.z -= dz;
    });
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.body.setEnabled(on);
    if (on) {
      const t = this.body.translation();
      this.prevPos.set(t.x, t.y, t.z);
      this.currPos.copy(this.prevPos);
    }
  }

  // ---- OrbitTarget ----
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderPos.x, this.renderPos.y + 1.3, this.renderPos.z);
  }

  /** Camera yaw that puts the camera behind the car (only while driving fast enough to matter). */
  followYaw(): number | null {
    if (Math.abs(this.speed) < 2.5) return null;
    this.forwardVector(this.fwd);
    return Math.atan2(-this.fwd.x, -this.fwd.z);
  }

  forwardVector(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    return out.set(0, 0, 1).applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
  }
  private tmpQ = new THREE.Quaternion();

  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.d.origin.toWorld(this.renderPos, out);
  }

  /** World position next to the driver's door (RIGHT side: right-hand drive) for getting out. */
  doorPosition(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    const left = this.tmp.set(1, 0, 0).applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
    const t = this.body.translation();
    const o = this.spec.half.x + 1.0;
    return this.d.origin.toWorld(out.set(t.x - left.x * o, t.y, t.z - left.z * o), out);
  }

  /** Physics position in WORLD coordinates (not the interpolated render position). */
  physWorld(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x + this.d.origin.origin.x, t.y, t.z + this.d.origin.origin.z);
  }

  /** Signed speed along the car's nose (m/s) as of the last physics step. */
  get forwardSpeed(): number {
    return this.speed;
  }

  /** World-up component of the car's up axis: 1 = upright, < 0 = on its roof. */
  get upY(): number {
    const r = this.body.rotation();
    return 1 - 2 * (r.x * r.x + r.z * r.z);
  }

  /** Linear velocity in WORLD axes (x, z), m/s. */
  velocityXZ(out: { x: number; z: number }): void {
    const l = this.body.linvel();
    out.x = l.x;
    out.z = l.z;
  }

  private placeSeated(m: PersonModel): void {
    const s = this.spec.seat;
    m.root.removeFromParent();
    m.setSeated(true);
    m.root.position.set(s.x, s.y, s.z);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(s.scale * m.look.scale);
    this.model.root.add(m.root);
  }

  /** Put a person (or the player) behind the wheel. */
  seatDriver(who: Driver): void {
    this.driver = who;
    this.abandonedFor = 0;
    if (who === 'player') {
      this.playerSeat = new PersonModel(ENGINEER_LOOK);
      this.placeSeated(this.playerSeat);
    } else {
      who.vehicle = this;
      who.task = 'driving';
      who.mode = 'idle';
      who.speed = 0;
      this.placeSeated(who.model);
    }
  }

  /** Take the driver out of the seat (the caller decides where he goes). */
  removeDriver(): Driver | null {
    const who = this.driver;
    this.driver = null;
    this.ai = null;
    if (who === 'player') {
      this.playerSeat?.root.removeFromParent();
      this.playerSeat = null;
    } else if (who) {
      who.model.root.removeFromParent();
      who.model.setSeated(false);
      who.model.root.scale.setScalar(who.model.look.scale);
      who.vehicle = null;
    }
    return who;
  }

  /** What each wheel stands on: 0 = natural ground, 1 = gravel shoulder, 2 = asphalt (Stage 6 roads; grip differs). */
  private wheelSurface = [0, 0, 0, 0];

  /** Surface under the car (the worst wheel), for the HUD / sound later. */
  get surface(): number {
    return Math.min(...this.wheelSurface);
  }

  private updateSurfaces(): void {
    const s = this.spec;
    const t = this.body.translation();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;
    // horizontal forward / left axes of the car
    let fx = this.fwd.x;
    let fz = this.fwd.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    const spots: [number, number][] = [[s.trackHalf, s.wheelbaseHalf], [-s.trackHalf, s.wheelbaseHalf], [s.trackHalf, -s.wheelbaseHalf], [-s.trackHalf, -s.wheelbaseHalf]];
    for (let i = 0; i < 4; i++) {
      const [sx, sz] = spots[i];
      const wx = t.x + ox + fz * sx + fx * sz;
      const wz = t.z + oz - fx * sx + fz * sz;
      const k = this.d.terrain.roads.surfaceAt(wx, wz); // 0 ground, 1 asphalt, 2 gravel
      this.wheelSurface[i] = k === 1 ? 2 : k === 2 ? 1 : 0;
    }
  }

  /** Put the car upright again (after a roll-over). */
  reset(): void {
    const r = this.body.rotation();
    this.forwardVector(this.fwd);
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    void r;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const gy = this.d.terrain.heightAt(wx, wz);
    this.body.setTranslation({ x: t.x, y: gy + 1.4, z: t.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Called every fixed step BEFORE the physics world steps. */
  fixedUpdate(dt: number, input: DriveInput | null): void {
    if (!this.enabled) return;
    const s = this.spec;
    // Signed speed along the car's forward axis (+Z). (Rapier's own currentVehicleSpeed() uses another axis by default.)
    this.forwardVector(this.fwd);
    const lv = this.body.linvel();
    const v = lv.x * this.fwd.x + lv.y * this.fwd.y + lv.z * this.fwd.z;
    this.speed = v;
    const pt = this.powertrain;

    // ---- pedals: W = gas / S = brake or reverse (as in most games) ----
    let thrTarget = 0;
    let brkTarget = 0;
    const inp = input ?? { throttle: false, brake: false, steer: 0, handbrake: true };
    if (inp.throttle && !inp.brake) {
      if (v < -1) brkTarget = 1;
      else {
        pt.selectDirection(1);
        thrTarget = inp.throttleAmt ?? 1;
      }
    } else if (inp.brake && !inp.throttle) {
      if (v > 1) brkTarget = inp.brakeAmt ?? 1;
      else {
        pt.selectDirection(-1);
        thrTarget = 1;
      }
    }
    if (pt.gear < 0 && v < -7) thrTarget = 0; // reverse speed limit (~25 km/h)
    this.throttle += (thrTarget - this.throttle) * Math.min(1, 10 * dt);
    this.brake += (brkTarget - this.brake) * Math.min(1, 14 * dt);
    this.handbrake = inp.handbrake;

    // ---- powertrain ----
    pt.step(dt, this.throttle, v);
    const nDriven = s.drive === 'awd' ? 4 : 2;
    const share = [0, 0, 0, 0];
    if (s.drive === 'awd') {
      share[0] = share[1] = s.frontShare / 2; // open centre split: fixed ratio
      share[2] = share[3] = (1 - s.frontShare) / 2;
    } else share[2] = share[3] = 0.5; // open differential: equal torque to both rear wheels
    void nDriven;

    // ---- steering: less lock at speed ----
    // The steering lock shrinks with speed, and never asks for more than ~1.6 g of cornering (tyre grip limit).
    const av = Math.abs(v);
    const gripCap = (1.6 * -PhysicsConfig.gravity * 2 * s.wheelbaseHalf) / (av * av + 1);
    const maxAngle = Math.max(0.03, Math.min(s.maxSteer / (1 + Math.pow(av / 16, 2)), gripCap));
    const target = clamp(inp.steer, -1, 1) * maxAngle;
    const rate = Math.abs(target) > Math.abs(this.steerAngle) ? 2.4 : 4.0;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);

    // ---- apply to wheels ----
    // Rapier ignores the brake on a wheel that also has an engine force, so the drive is cut while braking
    // (like pressing the clutch). Without this, the brakes would do nothing on driven wheels.
    this.updateSurfaces();
    const braking = this.brake > 0.02 || this.handbrake || !input;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelFrictionSlip(i, s.frictionSlip * SURFACE_GRIP[this.wheelSurface[i]]);
      this.controller.setWheelEngineForce(i, braking ? 0 : pt.wheelForce * share[i]);
      let b = this.brake * s.brakeMax;
      if (this.handbrake && i >= 2) b = s.brakeMax * 1.3;
      if (!input) b = s.brakeMax; // parked: brakes on
      this.controller.setWheelBrake(i, b);
      this.controller.setWheelSteering(i, i < 2 ? this.steerAngle : 0);
      // handbrake locks the rear: less side grip -> the tail slides
      this.controller.setWheelSideFrictionStiffness(i, this.handbrake && i >= 2 ? s.sideFriction * 0.35 : s.sideFriction);
    }

    // ---- aerodynamic drag + rolling resistance (forces on the chassis) ----
    const drag = 0.5 * RHO * s.cd * s.frontalArea * v * Math.abs(v) + ROLL_RES * s.mass * -PhysicsConfig.gravity * Math.sign(v) * (Math.abs(v) > 0.2 ? 1 : 0);
    this.body.resetForces(true);
    this.body.addForce({ x: -this.fwd.x * drag, y: -this.fwd.y * drag, z: -this.fwd.z * drag }, true);

    this.controller.updateVehicle(dt);

    let n = 0;
    for (let i = 0; i < 4; i++) if (this.controller.wheelIsInContact(i)) n++;
    this.wheelsOnGround = n;

    // safety net: never end up far below the analytic ground
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const gy = this.d.terrain.heightAt(wx, wz);
    if (t.y < gy - 2) {
      this.body.setTranslation({ x: t.x, y: gy + 1.5, z: t.z }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** After the physics world stepped. */
  afterStep(): void {
    if (!this.enabled) return;
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  update(alpha: number): void {
    this.syncModel(alpha);
  }

  private syncModel(alpha: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.model.root.position.copy(this.renderPos);
    this.model.root.quaternion.copy(this.renderQuat);
    if (!this.enabled) return;
    const s = this.spec;
    for (let i = 0; i < 4; i++) {
      const w = this.model.wheels[i];
      const len = this.controller.wheelSuspensionLength(i) ?? s.susp.rest;
      w.pivot.position.y = s.connY - len;
      w.steer.rotation.y = this.controller.wheelSteering(i) ?? 0;
      w.spin.rotation.x = this.controller.wheelRotation(i) ?? 0;
    }
  }

  telemetry(): VehicleTelemetry {
    const pt = this.powertrain;
    return {
      speed: this.speed,
      kmh: Math.abs(this.speed) * 3.6,
      rpm: pt.rpm,
      redline: this.spec.engine.redlineRpm,
      idle: this.spec.engine.idleRpm,
      gear: pt.gear,
      gearCount: this.spec.gears.length,
      auto: pt.auto,
      throttle: this.throttle,
      brake: this.brake,
      steerAngle: this.steerAngle,
      torque: pt.torque,
      powerKw: pt.powerKw,
      wheelForce: pt.wheelForce,
      slip: pt.slip,
      limiter: pt.limiter,
      shifting: pt.shiftTimer > 0,
      engineBraking: pt.engineBraking,
      handbrake: this.handbrake,
      wheelsOnGround: this.wheelsOnGround,
    };
  }

  dispose(): void {
    this.d.scene.remove(this.model.root);
    this.model.dispose();
    this.d.physics.world.removeVehicleController(this.controller);
    this.d.physics.world.removeRigidBody(this.body);
  }
}
