import * as THREE from 'three';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainPhysics } from '../terrain';
import type { HUD } from '../ui/HUD';
import type { VehicleHUD } from '../ui/VehicleHUD';
import type { Person } from '../people/Person';
import { Vehicle, type DriveInput, type Driver, type VehicleDeps } from './Vehicle';
import type { VehicleSpec } from './VehicleSpec';

export interface VehicleManagerDeps {
  vehicle: VehicleDeps;
  terrainPhysics: TerrainPhysics;
  input: InputManager;
  player: Player;
  orbit: OrbitCamera;
  hud: HUD;
  vehicleHud: VehicleHUD;
  /** World position -> screen pixels (null if behind the camera). */
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
  /** The driver the player pulled out of his seat: where does he go now? */
  onDriverEjected: (person: Person, door: THREE.Vector3) => void;
}

/**
 * Owns all vehicles: spawning, freezing the ones far from the player (no ground collider there),
 * getting in/out (F), mapping the keyboard to driving input, and the driving HUD.
 * STAGE 9: a vehicle never exists without a driver. `spawn` needs one; the player getting in throws the AI driver
 * out (he steps out of the right-hand door and runs away); when the player gets out, the empty car is removed by
 * TrafficManager once he has walked off. AI cars use the same Vehicle class with an AIDriver's DriveInput.
 */
export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  driver: Vehicle | null = null;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private drive: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };

  constructor(private d: VehicleManagerDeps) {}

  /** Create a vehicle WITH its driver (no empty vehicles). `body` overrides the paint colour. */
  spawn(spec: VehicleSpec, world: THREE.Vector3, yaw: number, driver: Driver, body?: number): Vehicle {
    const s = body === undefined ? spec : { ...spec, look: { ...spec.look, body } };
    const v = new Vehicle(this.d.vehicle, s, world, yaw);
    v.seatDriver(driver);
    this.vehicles.push(v);
    return v;
  }

  /** Create a dedicated Tour car with no AI driver; TourManager owns its lifecycle and autopilot. */
  spawnTourVehicle(spec: VehicleSpec, world: THREE.Vector3, yaw: number, body = 0xd6b544): Vehicle {
    const s = { ...spec, look: { ...spec.look, body, accent: 0x23332c } };
    const v = new Vehicle(this.d.vehicle, s, world, yaw);
    v.tourVehicle = true;
    this.vehicles.push(v);
    v.setEnabled(true);
    return v;
  }

  removeTourVehicle(v: Vehicle): boolean {
    if (!v.tourVehicle || v === this.driver) return false;
    const i = this.vehicles.indexOf(v);
    if (i < 0) return false;
    v.removeDriver();
    this.vehicles.splice(i, 1);
    v.dispose();
    return true;
  }

  /** Remove a vehicle from the world; returns the driver who was in it (the caller removes him too). */
  remove(v: Vehicle): Driver | null {
    const i = this.vehicles.indexOf(v);
    if (i < 0 || v === this.driver) return null;
    const who = v.removeDriver();
    this.vehicles.splice(i, 1);
    v.dispose();
    return who;
  }

  /** 60 Hz, before the physics step. */
  fixedUpdate(dt: number): void {
    const k = (c: string) => this.d.input.isDown(c);
    this.drive.throttle = k('KeyW');
    this.drive.brake = k('KeyS');
    this.drive.steer = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0);
    this.drive.handbrake = k('Space');
    for (const v of this.vehicles) v.fixedUpdate(dt, v.tourInput ?? (v === this.driver ? this.drive : v.ai ? v.ai.input : null));
  }

  afterStep(): void {
    for (const v of this.vehicles) v.afterStep();
  }

  /** Key presses (once per frame). */
  handleKeys(): void {
    const inp = this.d.input;
    if (inp.wasPressed('KeyF')) {
      if (this.driver) this.exit();
      else {
        // A marked Tour car takes priority over ordinary traffic when it is within reach.
        const near = this.nearestTour(4) ?? this.nearest(4);
        // only a car that has (almost) stopped - the AI stops for you when you stand in front of it
        if (near && Math.abs(near.forwardSpeed) < 2.5) this.enter(near);
      }
    }
    const v = this.driver;
    if (!v) return;
    if (inp.wasPressed('KeyE')) v.powertrain.requestShift(1);
    if (inp.wasPressed('KeyQ')) v.powertrain.requestShift(-1);
    if (inp.wasPressed('KeyG')) v.powertrain.auto = !v.powertrain.auto;
    if (inp.wasPressed('KeyI')) this.d.vehicleHud.toggleCurve();
    if (inp.wasPressed('KeyR')) v.reset();
  }

  /** Every frame. `focus` = world position of the camera/player (decides which vehicles are simulated). */
  update(alpha: number, focus: THREE.Vector3): void {
    for (const v of this.vehicles) {
      v.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      const near = dist < PhysicsConfig.activeRadius * 0.9 && this.d.terrainPhysics.hasColliderAt(this.tmp.x, this.tmp.z);
      if (v.occupied || near) v.setEnabled(true);
      else if (dist > PhysicsConfig.activeRadius * 1.1) v.setEnabled(false);
      v.update(alpha);
    }

    const hud = this.d.hud;
    if (this.driver) {
      hud.hideMarker();
      this.d.vehicleHud.update(this.driver.telemetry(), this.driver.spec);
    } else {
      // an icon over the vehicle you can get into (no text)
      const near = this.d.player.active && this.d.player.ready && !this.d.player.inVehicle ? this.nearest(4) : null;
      if (near) {
        near.getWorldPosition(this.tmp);
        this.tmp.y += 2.4;
        hud.setMarker(this.d.project(this.tmp), 'car');
      } else hud.hideMarker();
    }
  }

  nearestTour(maxDist: number): Vehicle | null {
    this.d.player.getWorldPosition(this.tmp2);
    let best: Vehicle | null = null;
    let bd = maxDist;
    for (const v of this.vehicles) {
      if (!v.tourVehicle) continue;
      v.getWorldPosition(this.tmp);
      const dd = Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      if (dd < bd) { bd = dd; best = v; }
    }
    return best;
  }

  /** Automatically drop a passenger off only when the Tour car is safely stopped. */
  disembarkTour(): boolean {
    const v = this.driver;
    if (!v || !v.tourVehicle || Math.abs(v.telemetry().speed) > 3) return false;
    this.exit();
    return this.driver !== v;
  }

  nearest(maxDist: number): Vehicle | null {
    this.d.player.getWorldPosition(this.tmp2);
    let best: Vehicle | null = null;
    let bd = maxDist;
    for (const v of this.vehicles) {
      if (v.policeVehicle) continue;
      v.getWorldPosition(this.tmp);
      const dd = Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      if (dd < bd) {
        bd = dd;
        best = v;
      }
    }
    return best;
  }

  private enter(v: Vehicle): void {
    // the AI driver is pulled out of the right-hand door
    const old = v.removeDriver();
    if (old && old !== 'player') {
      v.doorPosition(this.tmp);
      this.tmp.y = this.d.vehicle.terrain.heightAt(this.tmp.x, this.tmp.z);
      this.d.player.getWorldPosition(this.tmp2);
      old.heading = Math.atan2(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      this.d.onDriverEjected(old, this.tmp);
    }
    v.seatDriver('player');
    v.ai = null;
    this.driver = v;
    v.occupied = true;
    v.setEnabled(true);
    this.d.player.setInVehicle(true);
    this.d.orbit.setTarget(v, 9, 5, 28);
    this.d.vehicleHud.show();
  }

  private exit(): void {
    const v = this.driver!;
    if (Math.abs(v.telemetry().speed) > 3) return; // can only get out when (almost) stopped
    v.doorPosition(this.tmp);
    const ground = this.d.vehicle.terrain.heightAt(this.tmp.x, this.tmp.z);
    this.tmp.y = ground + Config.player.height / 2 + 0.3;
    this.driver = null;
    v.removeDriver(); // the player steps out; the empty car is removed soon after (TrafficManager)
    v.abandonedFor = 0;
    v.occupied = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp);
    this.d.orbit.setTarget(this.d.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
    this.d.vehicleHud.hide();
  }

  dispose(): void {
    for (const v of this.vehicles) v.dispose();
    this.vehicles.length = 0;
  }
}
