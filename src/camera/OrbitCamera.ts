import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainGenerator } from '../terrain';
import { clamp } from '../utils/math';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { CameraMode } from './CameraController';

/** Anything the orbit camera can follow: the player or a vehicle. */
export interface OrbitTarget {
  readonly body: RAPIER.RigidBody;
  /** Point to look at (floating-origin local coordinates). */
  getFocus(out: THREE.Vector3): THREE.Vector3;
  /** Optional: camera yaw that puts the camera behind the target (null = do not auto-follow). */
  followYaw?(): number | null;
}

/**
 * Third-person orbit camera: mouse orbits around the player, wheel zooms.
 * The camera never goes through the ground: a Rapier ray from the player towards the camera
 * pulls it in, and the analytic terrain/water height keeps it above the surface.
 */
export class OrbitCamera implements CameraMode {
  yaw: number = Config.orbit.startYaw;
  elevation: number = Config.orbit.startElevation;
  distance: number = Config.orbit.distance;
  /** 1 = normal; < 1 pulls the camera closer (aiming a gun). */
  aimFactor = 1;
  private current: number = Config.orbit.distance;
  private minDistance: number = Config.orbit.minDistance;
  private maxDistance: number = Config.orbit.maxDistance;
  private idle = 0;
  private target = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private sc;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private target_: OrbitTarget,
    private physics: PhysicsWorld,
    private terrain: TerrainGenerator,
    private origin: FloatingOrigin,
  ) {
    this.sc = terrain.makeSample();
  }

  /** Follow something else (e.g. a vehicle) with its own zoom range. */
  setTarget(t: OrbitTarget, distance: number, min: number, max: number): void {
    this.target_ = t;
    this.distance = distance;
    this.current = Math.max(min, Math.min(distance, this.current));
    this.minDistance = min;
    this.maxDistance = max;
    this.idle = 0;
  }

  update(dt: number): void {
    const O = Config.orbit;
    const m = this.input.consumeMouseDelta();
    this.yaw -= m.x * Config.camera.mouseSensitivity;
    this.elevation = clamp(this.elevation + m.y * Config.camera.mouseSensitivity, O.minElevation, O.maxElevation);
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.distance = clamp(this.distance * Math.exp(wheel * 0.0012), this.minDistance, this.maxDistance);

    // Chase-camera: when driving and the mouse is idle, swing round behind the vehicle.
    if (Math.abs(m.x) + Math.abs(m.y) > 0.5) this.idle = 0;
    else this.idle += dt;
    const follow = this.target_.followYaw?.() ?? null;
    if (follow !== null && this.idle > 1.0) {
      const diff = Math.atan2(Math.sin(follow - this.yaw), Math.cos(follow - this.yaw));
      this.yaw += diff * (1 - Math.exp(-1.8 * dt));
    }

    this.target_.getFocus(this.target);
    const ce = Math.cos(this.elevation);
    this.dir.set(Math.sin(this.yaw) * ce, Math.sin(this.elevation), Math.cos(this.yaw) * ce);

    // Collision: pull the camera in if terrain (or anything solid) is between the player and the camera.
    const want = this.distance * this.aimFactor;
    let allowed = want;
    const R = this.physics.RAPIER;
    const hit = this.physics.world.castRay(
      new R.Ray(this.target, this.dir),
      want + 0.4,
      true,
      undefined,
      undefined,
      undefined,
      this.target_.body,
    );
    if (hit) allowed = Math.max(0.8, hit.timeOfImpact - 0.4);
    if (allowed < this.current) this.current = allowed; // snap in at once
    else this.current += (allowed - this.current) * (1 - Math.exp(-4 * dt)); // ease back out

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.current);

    // Never below the ground or the water surface (analytic, works even if the collider is not there yet).
    const wx = this.camera.position.x + this.origin.origin.x;
    const wz = this.camera.position.z + this.origin.origin.z;
    this.terrain.sample(wx, wz, this.sc);
    let minY = this.sc.h + 0.6;
    if (!Number.isNaN(this.sc.water) && this.sc.h < this.sc.water) minY = Math.max(minY, this.sc.water + 0.35);
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    this.camera.lookAt(this.target);
  }
}
