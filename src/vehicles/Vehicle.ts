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
import { BIKE_PILLION_POSE, BIKE_RIDER_POSE, ENGINEER_LOOK, PersonModel } from '../people/PersonModel';
import type { Person } from '../people/Person';
import type { AIDriver } from '../traffic/AIDriver';
import { wheelDefs, type VehicleSpec, type WheelDef } from './VehicleSpec';
import type { VehicleFx } from './VehicleFx';

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

/** Everything the sound system (VehicleAudio) needs from a vehicle. */
export interface VehicleAudioState {
  kind: string;
  /** Signed speed along the nose (m/s). */
  speed: number;
  /** Sideways speed (m/s): tyres slide when it is large. */
  lateral: number;
  throttle: number;
  brake: number;
  rpm: number;
  idle: number;
  redline: number;
  gear: number;
  shifting: boolean;
  limiter: boolean;
  handbrake: boolean;
  engineBraking: boolean;
  wheelsOnGround: number;
  wheelCount: number;
  hp: number;
  state: 'ok' | 'burning' | 'wrecked';
  /** 0 = natural ground, 1 = gravel, 2 = asphalt. */
  surface: number;
  /** Driver door opening, 0..1. */
  door: number;
  /** Somebody is driving (or the tour autopilot) and the vehicle is not a wreck. */
  engineOn: boolean;
  enclosed: boolean;
}

export interface VehicleDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
  /** Explosions / debris / smoke (set by the Engine after creation; vehicles work without it). */
  fx?: VehicleFx | null;
}

/** What happened to a vehicle; VehicleManager handles these (people, wanted level, ejecting the player). */
export type VehicleEvent =
  | { type: 'explode'; byPlayer: boolean }
  | { type: 'fall'; lethal: boolean }
  | { type: 'wreckKill'; byPlayer: boolean }
  /** The vehicle is a write-off (crash fire / burn-out) but did NOT blow up: everybody gets out alive. */
  | { type: 'totaled' };

/** A one-step velocity change (m/s) this big (6 g) opens a "crash window". Braking and bumps stay far below it. */
const CRASH_TRIGGER = 1.0;
/** The window closes after this many quiet seconds. Damage uses the NET velocity change of the whole crash, so solver pops and contact jitter do not count. */
const CRASH_WINDOW = 0.12;
/** Net delta-v (m/s) of a whole crash below which nothing is damaged (~32 km/h: a bumper tap, a parking bump, a kerb, pushing against a wall). */
const CRASH_DV = 9;
/** hp lost per m/s above CRASH_DV (before the vehicle's `fragile` factor): 10 m/s ~ 2 hp, 15 ~ 12, 22 ~ 26, 30 ~ 42, 40 ~ 62. */
const CRASH_DAMAGE = 2;
/** A crash alone never takes hp below this: the car is wrecked and smoking, but it does not blow up. */
const CRASH_HP_FLOOR = 15;
/** Delta-v above which a badly damaged car can catch fire from a leaking fuel line (it burns, it does not explode). */
const CRASH_FIRE_DV = 22;
const CRASH_FIRE_HP = 20;
/** Below this hp the engine / drivetrain is damaged and power falls off (limp mode). */
const LIMP_HP = 30;
/** hp fractions at which parts break off (stage 1..3). */
const STAGES = [0.55, 0.3, 0.12];
/** Real cars take many bullets: this multiplies every vehicle's `bulletsToKill`. */
const BULLET_TOUGHNESS = 3;
/** Chance that a vehicle shot to 0 hp (or a burning one) actually goes up in a blast. Usually it just burns out and everybody gets out. */
const SHOT_EXPLODE_CHANCE = 0.2;
/** Blast damage on vehicles is scaled by this (a car survives a nearby grenade, it does not survive a bomb). */
const BLAST_TOUGHNESS = 0.65;

const RHO = 1.2;
const ROLL_RES = 0.012;
/** Motorbike: the most sideways acceleration the rider asks of the tyres (in g). tan(lean) = a / g, so 0.7 g = 35 degrees of lean. */
const BIKE_MAX_LAT_G = 0.7;
/** Motorbike: the bike goes down when it leans further than this (rad, ~58 deg) or stands on its tail / nose. */
const BIKE_FALL_LEAN = 1.02;
/** Tyre grip multiplier per surface under the wheel (STAGE 6): natural ground (baseline), gravel shoulder, asphalt. */
const SURFACE_GRIP = [1.0, 1.0, 1.15] as const;
const UP = new THREE.Vector3(0, 1, 0);
/** Motorbike balance: the rider corrects a lean error with a roll rate of KV x error (time constant 0.1 s), at most this fast (rad/s). */
const BIKE_KV = 10;
const BIKE_MAX_ROLL_RATE = 5;

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
  /** Parked player-owned vehicle (the tank): traffic never removes it. */
  persistent = false;
  /** Passengers (not the driver). They are killed with the vehicle or when a bullet reaches them. */
  readonly passengers: Person[] = [];
  /** 100 = new, 0 = on fire and about to blow up. */
  hp = 100;
  state: 'ok' | 'burning' | 'wrecked' = 'ok';
  /** Seconds since the wreck blew up. */
  wreckedFor = 0;
  /** Two-wheeler that has fallen over (the balance controller is off). */
  fallen = false;
  /** No driver at the wheel any more: the vehicle coasts to a stop. */
  coast = false;
  /** Damage came from the player (a kill then counts as a crime). */
  lastHitByPlayer = false;
  readonly events: VehicleEvent[] = [];
  /** Tank: turret yaw (rel. to the hull) and barrel pitch (rad). */
  turretYaw = 0;
  turretPitch = 0;
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
  private prevLv = new THREE.Vector3();
  private hasPrevLv = false;
  private age = 0;
  private impactGrace = 0;
  private fuse = 0;
  /** A burning vehicle blows up when the fuse runs out only if the fire came from weapons / blasts. A crash fire just burns out. */
  private explosive = true;
  private inCrash = false;
  private crashT = 0;
  private crashQuiet = 0;
  private crashV0 = new THREE.Vector3();
  private stageDone = 0;
  private smokeT = 0;
  private lostWheel: boolean[] = [];
  private defs: WheelDef[];
  /** Motorbike: the curvature (1/m) the rider is asking for, and a slow trim that makes the real curvature match it. */
  private bikeKappa = 0;
  /** Motorbike: lean angle of the last step (rad), used to share the tyre grip between braking and cornering. */
  private bikeRoll = 0;
  private bikeTrim = 0;
  private inertia = { x: 1, y: 1, z: 1 };
  private tmpV2 = new THREE.Vector3();

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
      R.ColliderDesc.cuboid(s.half.x, s.half.y, s.half.z).setTranslation(0, s.colliderY ?? 0, 0).setDensity(0).setFriction(0.4).setRestitution(0.05),
      this.body,
    );
    this.defs = wheelDefs(s);
    const ex = s.half.x * 2;
    const ey = s.half.y * 2;
    const ez = s.half.z * 2;
    this.inertia = {
      x: (s.mass / 12) * (ey * ey + ez * ez),
      y: (s.mass / 12) * (ex * ex + ez * ez),
      z: (s.mass / 12) * (ex * ex + ey * ey),
    };
    this.body.setAdditionalMassProperties(
      s.mass,
      { x: 0, y: s.comY, z: s.comZ ?? 0 },
      this.inertia,
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    this.controller = d.physics.world.createVehicleController(this.body);
    for (const w of this.defs) {
      this.controller.addWheel({ x: w.x, y: s.connY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.susp.rest, s.wheelRadius);
    }
    this.lostWheel = this.defs.map(() => false);
    this.wheelSurface = this.defs.map(() => 0);
    for (let i = 0; i < this.defs.length; i++) {
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
    m.setSeated(true, this.spec.balance ? BIKE_RIDER_POSE : undefined);
    m.root.position.set(s.x, s.y, s.z);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(s.scale * m.look.scale);
    this.model.root.add(m.root);
  }

  /** The driver's eye (scene-local coordinates) and the orientation of the car (nose = +Z): the camera of the driver's-eye view (P). */
  driverEye(pos: THREE.Vector3, quat: THREE.Quaternion): boolean {
    const s = this.spec.seat;
    const root = this.model.root;
    root.updateWorldMatrix(true, false);
    // seated, the eyes are ~0.78 m above the hips (body scale 1 = 1.8 m) and a little in front of them
    const k = s.scale * ENGINEER_LOOK.scale;
    const lean = this.spec.balance ? BIKE_RIDER_POSE.lean : 0; // a tucked rider's head is ahead of his hips
    pos.set(s.x, s.y + 0.78 * k * Math.cos(lean), s.z + (0.06 + 0.78 * Math.sin(lean)) * k);
    root.localToWorld(pos);
    root.getWorldQuaternion(quat);
    return true;
  }

  private doorOpen = 0;
  private doorGoal = 0;
  private doorHold = 0;

  /** Show or hide the seated player (hidden in the driver's-eye view: the camera sits inside his head). */
  setPlayerVisible(on: boolean): void {
    if (this.playerSeat) this.playerSeat.root.visible = on;
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
    } else if (who) this.unseat(who);
    return who;
  }

  private unseat(who: Person): void {
    who.model.root.removeFromParent();
    who.model.setSeated(false);
    who.model.root.scale.setScalar(who.model.look.scale);
    who.vehicle = null;
  }

  /** Put a passenger on seat number `slot` (see spec.seats). Returns false if there is no such free seat. */
  seatPassenger(p: Person): boolean {
    const seats = this.spec.seats ?? [];
    if (this.passengers.length >= seats.length) return false;
    const st = seats[this.passengers.length];
    this.passengers.push(p);
    p.vehicle = this;
    p.task = 'driving';
    p.mode = 'idle';
    p.speed = 0;
    p.model.root.removeFromParent();
    p.model.setSeated(true, this.spec.balance ? BIKE_PILLION_POSE : undefined);
    p.model.root.position.set(st.x, st.y, st.z);
    p.model.root.rotation.set(0, 0, 0);
    p.model.root.scale.setScalar(st.scale * p.model.look.scale);
    this.model.root.add(p.model.root);
    return true;
  }

  /** Take one passenger out of his seat (the caller decides what happens to him). */
  removePassenger(p: Person): void {
    const i = this.passengers.indexOf(p);
    if (i < 0) return;
    this.passengers.splice(i, 1);
    this.unseat(p);
  }

  /** Take every passenger out (the seats close up behind them). */
  removePassengers(): Person[] {
    const out = [...this.passengers];
    for (const p of out) this.unseat(p);
    this.passengers.length = 0;
    return out;
  }

  /** Everybody inside: driver first. */
  occupants(): Person[] {
    const out: Person[] = [];
    if (this.driver && this.driver !== 'player') out.push(this.driver);
    for (const p of this.passengers) out.push(p);
    return out;
  }

  /** World position of a seated person (hips). */
  seatWorld(p: Person, out: THREE.Vector3): THREE.Vector3 {
    const m = p.model.root;
    this.model.root.updateMatrixWorld(true);
    m.getWorldPosition(out);
    return this.d.origin.toWorld(out, out);
  }

  /** What each wheel stands on: 0 = natural ground, 1 = gravel shoulder, 2 = asphalt (Stage 6 roads; grip differs). */
  private wheelSurface: number[] = [];

  /** Surface under the car (the worst wheel), for the HUD / sound later. */
  get surface(): number {
    return Math.min(...this.wheelSurface);
  }

  private updateSurfaces(): void {
    const t = this.body.translation();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;
    // horizontal forward / left axes of the car
    let fx = this.fwd.x;
    let fz = this.fwd.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    for (let i = 0; i < this.defs.length; i++) {
      const sx = this.defs[i].x;
      const sz = this.defs[i].z;
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
    if (this.state !== 'wrecked') this.fallen = false;
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

    // ---- crash detection: the NET velocity change of a whole impact (~0.1 s), not single-step spikes ----
    this.age += dt;
    this.impactGrace = Math.max(0, this.impactGrace - dt);
    const armed = this.age > 1.5 && this.impactGrace <= 0 && this.state !== 'wrecked';
    if (this.hasPrevLv && armed) {
      const step = Math.hypot(lv.x - this.prevLv.x, lv.y - this.prevLv.y, lv.z - this.prevLv.z);
      if (step > CRASH_TRIGGER) {
        if (!this.inCrash) {
          this.inCrash = true;
          this.crashT = 0;
          this.crashV0.copy(this.prevLv);
        }
        this.crashQuiet = 0;
      }
    }
    if (this.inCrash) {
      this.crashT += dt;
      this.crashQuiet += dt;
      if (!armed) this.inCrash = false;
      else if (this.crashQuiet >= CRASH_WINDOW || this.crashT > 0.5) {
        this.inCrash = false;
        // in the air gravity changes vy during the window; that is not part of the crash (on the ground the road carries it)
        const g = this.wheelsOnGround === 0 ? PhysicsConfig.gravity * this.crashT : 0;
        const dv = Math.hypot(lv.x - this.crashV0.x, lv.y - this.crashV0.y - g, lv.z - this.crashV0.z);
        // a crash can not take away more speed than the vehicle had (x1.6 for the bounce back): a car that stands still against a wall
        // (spring / solver jitter while the driver keeps the throttle down) is not a crash and must not be damaged again and again
        const v0 = Math.hypot(this.crashV0.x, this.crashV0.y, this.crashV0.z);
        this.impact(Math.min(dv, 45, v0 * 1.6 + 0.5));
      }
    }
    this.prevLv.set(lv.x, lv.y, lv.z);
    this.hasPrevLv = true;

    // ---- pedals: W = gas / S = brake or reverse (as in most games) ----
    let thrTarget = 0;
    let brkTarget = 0;
    const dead = this.state === 'wrecked';
    const inp = dead ? { throttle: false, brake: false, steer: 0, handbrake: true } : input ?? { throttle: false, brake: false, steer: 0, handbrake: true };
    if (this.coast && !dead) {
      // nobody at the wheel: no gas, a little braking, handbrake once (almost) stopped
      if (Math.abs(v) > 1.5) brkTarget = 0.25;
      inp.throttle = false;
      inp.brake = false;
      inp.steer = 0;
      inp.handbrake = Math.abs(v) < 1.5;
    } else if (inp.throttle && !inp.brake) {
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

    // ---- steering: less lock at speed ----
    // The steering lock shrinks with speed, and never asks for more than ~1.6 g of cornering (tyre grip limit).
    const av = Math.abs(v);
    const skid = s.skid;
    let target = 0;
    if (s.balance) {
      target = this.bikeSteer(clamp(inp.steer, -1, 1), v, dt);
    } else if (!skid) {
      const gripCap = ((s.balance ? 0.75 : 1.9) * -PhysicsConfig.gravity * 2 * s.wheelbaseHalf) / (av * av + 1);
      // two-wheelers (balance) keep the old, careful values: a quick steering change makes the bike fall over
      const maxAngle = Math.max(s.balance ? 0.03 : 0.05, Math.min(s.maxSteer / (1 + Math.pow(av / (s.balance ? 16 : 24), 2)), gripCap));
      target = clamp(inp.steer, -1, 1) * maxAngle;
    }
    // keyboard steering is on / off: the wheels must follow within ~0.1 s, otherwise a tap on A / D turns the car only slowly
    const rate = s.balance ? (Math.abs(target) > Math.abs(this.steerAngle) ? 3.2 : 5.0) : Math.abs(target) > Math.abs(this.steerAngle) ? 6.0 : 7.0;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);

    // ---- apply to wheels ----
    // Rapier ignores the brake on a wheel that also has an engine force, so the drive is cut while braking
    // (like pressing the clutch). Without this, the brakes would do nothing on driven wheels.
    this.updateSurfaces();
    const braking = this.brake > 0.02 || this.handbrake || !input || dead;
    const nSide = this.defs.filter((w) => w.side === 1).length || 1;
    // damaged engine / drivetrain: power falls off below LIMP_HP (the car limps instead of driving like new)
    const health = this.hp >= LIMP_HP ? 1 : 0.4 + 0.6 * (this.hp / LIMP_HP);
    const skidSteer = skid ? clamp(inp.steer, -1, 1) / (1 + av / 7) : 0;
    for (let i = 0; i < this.defs.length; i++) {
      const w = this.defs[i];
      const lost = this.lostWheel[i];
      this.controller.setWheelFrictionSlip(i, s.frictionSlip * SURFACE_GRIP[this.wheelSurface[i]] * (lost ? 0.15 : 1));
      let force = braking || lost ? 0 : pt.wheelForce * w.drive * health;
      // a tracked vehicle turns by driving its two sides at different speeds (left turn: left side slower, right side faster)
      if (skid && !braking) force -= (skidSteer * w.side * skid.turnForce) / nSide;
      this.controller.setWheelEngineForce(i, force);
      // a bike brakes mostly with the front wheel (weight moves forward under braking)
      // ...but a leaned tyre has less grip left over for braking (friction circle): the harder the lean, the softer the brake
      const bias = s.balance ? (w.z > 0 ? 1.3 : 0.7) * (1 - 0.7 * clamp(Math.abs(this.bikeRoll) / 0.7, 0, 1)) : 1;
      let b = lost ? 0 : this.brake * s.brakeMax * bias;
      if (this.handbrake && w.z < 0 && w.drive > 0) b = s.brakeMax * 1.3;
      if (this.handbrake && skid) b = s.brakeMax;
      if (!input || dead) b = s.brakeMax; // parked: brakes on
      this.controller.setWheelBrake(i, b);
      this.controller.setWheelSteering(i, w.steer ? this.steerAngle : 0);
      // handbrake locks the rear: less side grip -> the tail slides
      this.controller.setWheelSideFrictionStiffness(i, this.handbrake && w.z < 0 && w.drive > 0 && !skid ? s.sideFriction * 0.35 : s.sideFriction);
    }

    // ---- aerodynamic drag + rolling resistance (forces on the chassis) ----
    const drag = 0.5 * RHO * s.cd * s.frontalArea * v * Math.abs(v) + ROLL_RES * s.mass * -PhysicsConfig.gravity * Math.sign(v) * (Math.abs(v) > 0.2 ? 1 : 0);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.body.addForce({ x: -this.fwd.x * drag, y: -this.fwd.y * drag, z: -this.fwd.z * drag }, true);
    if (s.downforce) this.body.addForce({ x: 0, y: -0.5 * RHO * s.downforce * v * v, z: 0 }, true); // aero downforce (supercar)
    if (skid && !braking && !dead) {
      // a little direct yaw torque on top of the track forces (the real thing grips the ground with its whole length)
      this.body.addTorque({ x: 0, y: skidSteer * skid.yawAssist, z: 0 }, true);
    }
    if (s.balance) this.balanceBike(v);

    this.controller.updateVehicle(dt);

    let n = 0;
    for (let i = 0; i < this.defs.length; i++) if (this.controller.wheelIsInContact(i)) n++;
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

  /**
   * Two wheels cannot stand on their own, so a roll controller does what the rider does: it holds the bike upright,
   * and in a bend it leans exactly as far as the bend needs (tan(lean) = v^2 / (r g) = yaw rate x speed / g).
   * It switches off when the bike hits something or leans too far - then the bike falls over by itself.
   */
  private balanceBike(v: number): void {
    if (this.fallen || this.state === 'wrecked') return;
    const g = -PhysicsConfig.gravity;
    const r = this.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w);
    const right = this.tmp.set(1, 0, 0).applyQuaternion(this.tmpQ); // chassis +X (the bike's left side)
    const roll = Math.asin(clamp(right.y, -1, 1)); // + about the forward axis lifts +X
    const av = this.body.angvel();
    const wRoll = av.x * this.fwd.x + av.y * this.fwd.y + av.z * this.fwd.z;
    // Lean the bike exactly as far as the corner needs: tan(lean) = lateral acceleration / g. The lateral acceleration is
    // what the rider asks for (kappa v^2) blended with what the bike really does (yaw rate x speed), so the lean follows
    // the steering at once and stays honest when the tyres slide.
    const aReal = av.y * v;
    const aAsk = v > 0 ? this.bikeKappa * v * v : aReal;
    this.bikeRoll = roll;
    const wanted = clamp(-Math.atan((0.5 * aReal + 0.5 * aAsk) / g), -0.75, 0.75);
    // falls: too far over, or on its tail / nose (a wheelie that went too far, an endo)
    if (Math.abs(roll) > BIKE_FALL_LEAN || Math.abs(this.fwd.y) > 0.9) {
      this.fall(Math.abs(v));
      return;
    }
    // The rider works like a velocity servo on the roll rate (a torque spring would have to fight the m h^2 inertia of the whole
    // bike about its tyre contact line and goes unstable at 60 Hz; a rate servo is stable and has no overshoot).
    const wDes = clamp(BIKE_KV * (wanted - roll), -BIKE_MAX_ROLL_RATE, BIKE_MAX_ROLL_RATE);
    const dw = (wDes - wRoll) * 0.85;
    this.body.setAngvel({ x: av.x + this.fwd.x * dw, y: av.y + this.fwd.y * dw, z: av.z + this.fwd.z * dw }, true);
  }

  /**
   * Motorbike steering. The rider does not ask for a handlebar angle, he asks for a curve: full lock at walking pace, but at
   * speed only as much curvature as the tyres can give (BIKE_MAX_LAT_G). From the curvature the front-wheel angle follows from
   * the bicycle model (tan(delta) = kappa L), and a slow trim corrects it until the bike really drives that curve (a leaned
   * wheel turns tighter than a upright one, so the plain geometry is not exact).
   */
  private bikeSteer(input: number, v: number, dt: number): number {
    const s = this.spec;
    const L = 2 * s.wheelbaseHalf;
    const av = Math.abs(v);
    const kMax = Math.min(Math.tan(s.maxSteer) / L, (BIKE_MAX_LAT_G * -PhysicsConfig.gravity) / (av * av + 4));
    this.bikeKappa += (input * kMax - this.bikeKappa) * Math.min(1, 12 * dt);
    const yaw = this.body.angvel().y;
    if (v > 2 && !this.fallen) {
      const err = this.bikeKappa - yaw / v;
      this.bikeTrim = clamp(this.bikeTrim + 3 * err * L * dt, -0.2, 0.2);
    }
    if (Math.abs(this.bikeKappa) < 0.004 || v < 1.5) this.bikeTrim *= Math.max(0, 1 - 4 * dt);
    return clamp(Math.atan(this.bikeKappa * L) + this.bikeTrim, -s.maxSteer, s.maxSteer);
  }

  /** The bike goes down (crash or too much lean): the rider is thrown off by VehicleManager. */
  private fall(speed: number): void {
    if (this.fallen) return;
    this.fallen = true;
    this.events.push({ type: 'fall', lethal: speed > 13 });
  }

  // ------------------------------------------------------------------ damage
  /** A whole crash is over: the net velocity change was `dv` m/s. */
  private impact(dv: number): void {
    if (this.spec.balance && !this.fallen && dv > 3.6) this.fall(Math.abs(this.speed) + dv);
    if (dv > 2.5) {
      this.physWorld(this.tmpV2);
      this.d.fx?.crash(this.tmpV2, dv); // sparks and a bang, even when nothing is damaged
    }
    this.impactGrace = 0.3;
    if (dv <= CRASH_DV) return; // a light bump: no damage at all
    this.hurt((dv - CRASH_DV) * CRASH_DAMAGE * this.spec.fragile, false, 'crash');
    // a very hard hit on a car that is already in a bad way can start a fuel-leak fire: it burns, but it does not explode
    if (this.state === 'ok' && dv > CRASH_FIRE_DV && this.hp < CRASH_FIRE_HP && this.spec.fragile > 0.1 && Math.random() < Math.min(0.6, (dv - CRASH_FIRE_DV) / 20)) {
      this.state = 'burning';
      this.explosive = false;
      this.fuse = 7 + Math.random() * 6;
      this.events.push({ type: 'totaled' }); // people get out of a burning car
    }
  }

  /** One bullet of a gun with `weaponDamage` (game units; 24 = an average rifle). Heavy vehicles shrug off small guns. */
  shot(weaponDamage: number, byPlayer: boolean): void {
    const k = clamp(Math.sqrt(weaponDamage / 24), 0.75, 1.6);
    this.hurt((100 / (this.spec.bulletsToKill * BULLET_TOUGHNESS)) * k, byPlayer);
  }

  /** Blast damage (hp units, 0..100+). */
  blast(amount: number, byPlayer: boolean): void {
    this.hurt(amount * BLAST_TOUGHNESS * Math.min(1, this.spec.fragile + 0.4), byPlayer);
  }

  /** An outside impulse (shell recoil): not counted as a crash. */
  kick(ix: number, iy: number, iz: number): void {
    this.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
    this.impactGrace = 0.3;
  }

  /**
   * A blast wave pushes the vehicle: `dv` m/s of delta-v, applied on the side that faces the explosion (so a car near a blast
   * is not only shoved away but also tips and tumbles). (dirX, dirZ) = unit vector from the explosion to the vehicle.
   */
  blastPush(dirX: number, dirZ: number, dv: number): void {
    if (dv <= 0.05) return;
    const m = this.spec.mass;
    const t = this.body.translation();
    const h = this.spec.half;
    const point = { x: t.x - dirX * h.z * 0.6, y: t.y - h.y * 0.2, z: t.z - dirZ * h.z * 0.6 };
    this.body.applyImpulseAtPoint({ x: dirX * m * dv, y: m * dv * 0.45, z: dirZ * m * dv }, point, true);
    this.impactGrace = 0.3;
    this.inCrash = false;
  }

  /** `cause` 'crash' can wreck a vehicle but never blow it up; 'weapon' (bullets, blasts) can. */
  private hurt(amount: number, byPlayer: boolean, cause: 'crash' | 'weapon' = 'weapon'): void {
    if (this.state === 'wrecked' || amount <= 0) return;
    if (byPlayer) this.lastHitByPlayer = true;
    const floor = cause === 'crash' ? CRASH_HP_FLOOR : 0;
    this.hp = Math.max(Math.min(this.hp, floor), this.hp - amount);
    this.breakParts();
    if (cause !== 'weapon') return;
    if (this.state === 'burning') {
      // shot or blasted while already on fire: only sometimes does the fuel go up
      if (!this.explosive && Math.random() < SHOT_EXPLODE_CHANCE) {
        this.explosive = true;
        this.fuse = Math.min(this.fuse, 0.9);
      }
    } else if (this.hp <= 0 && this.state === 'ok') {
      this.state = 'burning';
      // usually a shot-up car just burns (everybody gets out); a real blast (big damage in one go) still blows it up
      this.explosive = amount >= 60 || Math.random() < SHOT_EXPLODE_CHANCE;
      this.fuse = this.explosive ? 0.8 + Math.random() * 0.8 : 7 + Math.random() * 6;
      if (!this.explosive) this.events.push({ type: 'totaled' });
    }
  }

  /** Parts come off as the vehicle gets weaker: bumpers, panels, finally a wheel. */
  private breakParts(): void {
    const frac = this.hp / 100;
    while (this.stageDone < STAGES.length && frac < STAGES[this.stageDone]) {
      this.stageDone++;
      const st = this.stageDone;
      for (const part of this.model.parts) if (part.stage === st && part.obj.parent) this.detach(part.obj, 2.5 + Math.random() * 2);
      if (st === 3 && this.defs.length > 2 && !this.spec.balance && this.spec.look.kind !== 'tank') this.loseWheel();
    }
    // the rest bends a bit
    for (const part of this.model.parts) {
      if (part.stage > 0 && part.obj.parent) {
        part.obj.rotation.x += (Math.random() - 0.5) * 0.04 * (1 - frac);
        part.obj.rotation.z += (Math.random() - 0.5) * 0.04 * (1 - frac);
      }
    }
  }

  private loseWheel(): void {
    const free: number[] = [];
    for (let i = 0; i < this.defs.length; i++) if (!this.lostWheel[i]) free.push(i);
    if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)];
    this.lostWheel[i] = true;
    this.controller.setWheelSuspensionStiffness(i, 0); // that corner drops
    this.detach(this.model.wheels[i].pivot, 3);
  }

  /** Throw a piece of the model off the vehicle. */
  private detach(obj: THREE.Object3D, kick: number): void {
    const fx = this.d.fx;
    if (!fx || !obj.parent) return;
    const lv = this.body.linvel();
    const dir = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5).normalize();
    const vel = new THREE.Vector3(lv.x + dir.x * kick, lv.y + dir.y * kick, lv.z + dir.z * kick);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    fx.spawnPiece(obj, vel, spin);
  }

  /** The player gets out / is thrown out: the first thing is that nobody drives it any more. */
  markDriverGone(): void {
    this.coast = true;
  }

  /** Open the driver's door and shut it again after `hold` seconds (getting in / out). No door = nothing happens. */
  openDoor(hold: number): void {
    if (!this.model.driverDoor) return;
    this.doorGoal = 1;
    this.doorHold = hold;
  }

  hasDoor(): boolean {
    return this.model.driverDoor !== null;
  }

  private animateDoor(dt: number): void {
    if (!this.model.driverDoor || (this.doorOpen === 0 && this.doorGoal === 0)) return;
    if (this.doorGoal === 1 && this.doorOpen >= 1) {
      this.doorHold -= dt;
      if (this.doorHold <= 0) this.doorGoal = 0;
    }
    const step = dt / 0.28; // about a quarter of a second to swing
    this.doorOpen = this.doorGoal === 1 ? Math.min(1, this.doorOpen + step) : Math.max(0, this.doorOpen - step);
    const t = this.doorOpen;
    this.model.setDoor(t * t * (3 - 2 * t)); // ease in / out
  }

  /** Every frame (render side): fire, smoke, fuse, wreck timer. `dt` in seconds. */
  tick(dt: number): void {
    this.animateDoor(dt);
    const fx = this.d.fx;
    if (this.state === 'ok') {
      if (this.hp < 100 * STAGES[2] && fx) this.emit(dt, 0.12, 1);
      return;
    }
    if (this.state === 'burning') {
      this.fuse -= dt;
      if (fx) this.emit(dt, 0.07, 2);
      if (this.fuse <= 0) {
        if (this.explosive) this.explode();
        else this.burnOut();
      }
      return;
    }
    this.wreckedFor += dt;
    if (fx && this.wreckedFor < 22) this.emit(dt, 0.14, this.wreckedFor < 8 ? 2 : 1);
  }

  private emit(dt: number, every: number, strength: number): void {
    this.smokeT -= dt;
    if (this.smokeT > 0 || !this.d.fx) return;
    this.smokeT = every * (0.7 + Math.random() * 0.6);
    this.physWorld(this.tmpV2);
    this.forwardVector(this.fwd);
    const o = this.spec.half.z * 0.55;
    this.tmpV2.x += this.fwd.x * o + (Math.random() - 0.5) * 0.6;
    this.tmpV2.y += 0.8;
    this.tmpV2.z += this.fwd.z * o + (Math.random() - 0.5) * 0.6;
    this.d.fx.smoke(this.tmpV2, strength);
    if (strength >= 2) this.d.fx.fire(this.tmpV2);
  }

  /** A crash fire has burnt itself out: the car is a black write-off, but nothing blew up. */
  private burnOut(): void {
    this.state = 'wrecked';
    this.wreckedFor = 0;
    this.coast = true;
    this.ai = null;
    this.hp = 0;
    this.model.char();
  }

  /** Blow up: everything breakable flies off, the shell stays as a burnt wreck, everybody inside dies (VehicleManager). */
  private explode(): void {
    this.state = 'wrecked';
    this.wreckedFor = 0;
    this.coast = true;
    this.ai = null;
    for (const part of this.model.parts) if (part.stage !== 0 && part.obj.parent) this.detach(part.obj, 5 + Math.random() * 6);
    for (let i = 0; i < this.defs.length; i++) {
      if (!this.lostWheel[i]) {
        this.lostWheel[i] = true;
        this.controller.setWheelSuspensionStiffness(i, 0);
        this.detach(this.model.wheels[i].pivot, 6 + Math.random() * 4);
      }
    }
    this.model.char();
    const m = this.spec.mass;
    const up = Math.min(4, 3000 / Math.sqrt(m) / 8);
    this.body.applyImpulse({ x: (Math.random() - 0.5) * m * 1.2, y: m * up, z: (Math.random() - 0.5) * m * 1.2 }, true);
    this.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * this.inertia.x * 3, y: (Math.random() - 0.5) * this.inertia.y * 2, z: (Math.random() - 0.5) * this.inertia.z * 3 }, true);
    this.impactGrace = 0.5;
    this.events.push({ type: 'explode', byPlayer: this.lastHitByPlayer });
  }

  // ------------------------------------------------------------------ tank turret
  /**
   * Turn the turret / raise the barrel towards a point (floating-origin LOCAL coordinates). Turret yaw is limited
   * by `turnRate`, the barrel by its elevation range.
   */
  aimTurret(dt: number, target: THREE.Vector3): void {
    const T = this.spec.turret;
    const tur = this.model.turret;
    const bar = this.model.barrel;
    if (!T || !tur || !bar) return;
    const q = this.renderQuat;
    const pivot = this.tmp.set(0, T.y, T.z).applyQuaternion(q).add(this.renderPos);
    const rel = this.tmpV2.copy(target).sub(pivot).applyQuaternion(this.tmpQ.copy(q).invert());
    const yawWant = Math.atan2(rel.x, rel.z);
    const pitchWant = clamp(Math.atan2(rel.y, Math.hypot(rel.x, rel.z)), T.minPitch, T.maxPitch);
    let dy = yawWant - this.turretYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turretYaw += clamp(dy, -T.turnRate * dt, T.turnRate * dt);
    this.turretPitch += clamp(pitchWant - this.turretPitch, -0.8 * dt, 0.8 * dt);
    tur.rotation.y = this.turretYaw;
    bar.rotation.x = -this.turretPitch;
  }

  /** Muzzle position (floating-origin LOCAL) and firing direction of the cannon. */
  muzzle(outPos: THREE.Vector3, outDir: THREE.Vector3): boolean {
    const m = this.model.muzzle;
    if (!m) return false;
    this.model.root.updateMatrixWorld(true);
    m.getWorldPosition(outPos);
    m.getWorldQuaternion(this.tmpQ);
    outDir.set(0, 0, 1).applyQuaternion(this.tmpQ);
    return true;
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
    for (let i = 0; i < this.defs.length; i++) {
      const w = this.model.wheels[i];
      if (this.lostWheel[i] || w.pivot.parent !== this.model.root) continue;
      const len = this.controller.wheelSuspensionLength(i) ?? s.susp.rest;
      w.pivot.position.y = s.connY - len;
      w.steer.rotation.y = this.controller.wheelSteering(i) ?? 0;
      w.spin.rotation.x = this.controller.wheelRotation(i) ?? 0;
    }
  }

  /** Snapshot for the sound system (cheap; called once a frame for the few audible vehicles). */
  audioState(): VehicleAudioState {
    const pt = this.powertrain;
    const lv = this.body.linvel();
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    return {
      kind: this.spec.look.kind,
      speed: this.speed,
      lateral: Math.abs((lv.x * this.fwd.z - lv.z * this.fwd.x) / fl),
      throttle: this.throttle,
      brake: this.brake,
      rpm: pt.rpm,
      idle: this.spec.engine.idleRpm,
      redline: this.spec.engine.redlineRpm,
      gear: pt.gear,
      shifting: pt.shiftTimer > 0,
      limiter: pt.limiter,
      handbrake: this.handbrake,
      engineBraking: pt.engineBraking,
      wheelsOnGround: this.wheelsOnGround,
      wheelCount: this.defs.length,
      hp: this.hp,
      state: this.state,
      surface: this.wheelSurface.length ? this.surface : 2,
      door: this.doorOpen,
      engineOn: (this.driver !== null || this.tourInput !== null) && !this.coast && this.state !== 'wrecked',
      enclosed: !!this.spec.enclosed,
    };
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
