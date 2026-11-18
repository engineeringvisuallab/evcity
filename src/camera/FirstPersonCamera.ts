import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainGenerator } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { FirstPersonMode } from './CameraController';
import { aimFov, bodyHeading, clampNum, FP_MAX_PITCH, lookDir, lookStep } from './firstPersonMath';

/** What the camera needs from the player. */
export interface FirstPersonSource {
  readonly body: RAPIER.RigidBody;
  /** A point inside the capsule near the head (floating-origin local). */
  getFocus(out: THREE.Vector3): THREE.Vector3;
  /** The real eye position (floating-origin local) for this yaw. */
  getEye(out: THREE.Vector3, yaw: number): THREE.Vector3;
}

/** The orbit camera's yaw / elevation / aimFactor: the player's movement (W A S D) and the combat code read them, so this camera keeps them in step. */
export interface FirstPersonLink {
  yaw: number;
  elevation: number;
  aimFactor: number;
}

/**
 * First-person camera at the player's real eyes (P on foot, P again = back to the orbit camera).
 * - mouse (and touch drag, same input) looks round: yaw free, pitch limited to +-85 degrees
 * - orbit.yaw is written every frame, so W A S D walk where you look and the gun fires where you look (same as the orbit camera)
 * - the eye never goes into the ground / a wall: a short Rapier ray from the head to the eye and the same analytic terrain height as the orbit camera
 * - aiming (right mouse) narrows the lens (the orbit camera moves closer in the same moment)
 */
export class FirstPersonCamera implements FirstPersonMode {
  yaw = 0;
  pitch = 0;
  private pos = new THREE.Vector3();
  private head = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private sc;
  private fovNow: number;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private source: FirstPersonSource,
    private physics: PhysicsWorld,
    private terrain: TerrainGenerator,
    private origin: FloatingOrigin,
    private link: FirstPersonLink,
    private baseFov: number,
  ) {
    this.sc = terrain.makeSample();
    this.fovNow = baseFov;
  }

  /** Heading of the player's body (rad) while this view is on: the body faces where you look. */
  get heading(): number {
    return bodyHeading(this.yaw);
  }

  enter(): void {
    this.yaw = this.link.yaw;
    this.pitch = 0;
    this.fovNow = this.camera.fov;
    this.update(0);
  }

  exit(): void {
    this.link.yaw = this.yaw;
    this.link.elevation = clampNum(-this.pitch, Config.orbit.minElevation, Config.orbit.maxElevation);
    this.link.aimFactor = 1;
    this.setFov(this.baseFov);
  }

  update(dt: number): void {
    const F = Config.firstPerson;
    const m = this.input.consumeMouseDelta();
    this.input.consumeWheel();
    const s = lookStep(this.yaw, this.pitch, m.x, m.y, Config.camera.mouseSensitivity);
    this.yaw = s.yaw;
    this.pitch = clampNum(s.pitch, -FP_MAX_PITCH, FP_MAX_PITCH);
    // the player walks / shoots by orbit.yaw: keep it equal to the look yaw (and the elevation, for the way back)
    this.link.yaw = this.yaw;
    this.link.elevation = clampNum(-this.pitch, Config.orbit.minElevation, Config.orbit.maxElevation);

    // eye: head point -> eye, a ray keeps it out of ceilings / walls (the player's own body never blocks it)
    this.source.getFocus(this.head);
    this.source.getEye(this.pos, this.yaw);
    this.dir.subVectors(this.pos, this.head);
    const len = this.dir.length();
    if (len > 1e-4) {
      this.dir.multiplyScalar(1 / len);
      const R = this.physics.RAPIER;
      const hit = this.physics.world.castRay(new R.Ray(this.head, this.dir), len + 0.12, true, undefined, undefined, undefined, this.source.body);
      if (hit) this.pos.copy(this.head).addScaledVector(this.dir, Math.max(0, hit.timeOfImpact - 0.12));
    }
    // never below the ground: only when the eye is just under the terrain surface (a tunnel / interior floor far below the hill is left alone)
    const wx = this.pos.x + this.origin.origin.x;
    const wz = this.pos.z + this.origin.origin.z;
    this.terrain.sample(wx, wz, this.sc);
    const under = this.sc.h + F.groundClearance - this.pos.y;
    if (under > 0 && under < F.groundClearance + 1.2) this.pos.y = this.sc.h + F.groundClearance;

    this.camera.position.copy(this.pos);
    const d = lookDir(this.yaw, this.pitch);
    this.camera.lookAt(this.pos.x + d.x, this.pos.y + d.y, this.pos.z + d.z);

    // aim: the lens narrows as the combat code pulls the orbit camera closer (aimFactor 1 -> Config.combat.aimCameraScale)
    this.setFov(aimFov(this.baseFov, this.link.aimFactor, Config.combat.aimCameraScale, F.aimZoom));
    void dt;
  }

  private setFov(fov: number): void {
    if (Math.abs(fov - this.fovNow) < 0.01) return;
    this.fovNow = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}
