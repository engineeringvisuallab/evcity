import * as THREE from 'three';
import type { InputManager } from '../input/InputManager';
import { FreeFlyCamera } from './FreeFlyCamera';
import type { OrbitCamera } from './OrbitCamera';

/** A camera behaviour. */
export interface CameraMode {
  update(dt: number): void;
}

/**
 * Owns the camera and the active mode.
 * - orbit : third-person camera around the player (default, Stage 4)
 * - freefly: debug fly camera (V to toggle)
 * STAGE 5 HOOK: a vehicle chase-camera mode can be added the same way.
 */
export class CameraController {
  readonly freeFly: FreeFlyCamera;
  private orbit: OrbitCamera | null = null;
  private mode: CameraMode;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private input: InputManager,
  ) {
    this.freeFly = new FreeFlyCamera(camera, input);
    this.mode = this.freeFly;
  }

  setOrbit(orbit: OrbitCamera): void {
    this.orbit = orbit;
  }

  get isFreeFly(): boolean {
    return this.mode === this.freeFly;
  }

  /** Switch between the orbit camera and the free-fly camera, keeping the view direction. */
  toggle(): void {
    if (!this.orbit) return;
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    if (this.isFreeFly) {
      this.orbit.yaw = this.freeFly.yaw;
      this.orbit.elevation = Math.max(-0.25, Math.min(1.45, -this.freeFly.pitch));
      this.mode = this.orbit;
    } else {
      this.freeFly.yaw = this.orbit.yaw;
      this.freeFly.pitch = -this.orbit.elevation;
      this.mode = this.freeFly;
    }
  }

  useOrbit(): void {
    if (this.orbit) this.mode = this.orbit;
  }

  update(dt: number): void {
    this.mode.update(dt);
  }
}
