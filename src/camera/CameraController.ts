import * as THREE from 'three';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { FreeFlyCamera } from './FreeFlyCamera';
import type { OrbitCamera } from './OrbitCamera';

/** A camera behaviour. */
export interface CameraMode {
  update(dt: number): void;
}

/** The first-person eye camera: enter() / exit() set it up and put the orbit camera's yaw / elevation right for the way back. */
export interface FirstPersonMode extends CameraMode {
  enter(): void;
  exit(): void;
}

/**
 * Owns the camera and the active mode.
 * - orbit : third-person camera around the player (default, Stage 4)
 * - freefly: debug fly camera (V to toggle)
 * - driver : first-person camera at the driver's eyes (P while driving)
 * - first  : first-person camera at the player's eyes (P on foot)
 * STAGE 5 HOOK: a vehicle chase-camera mode can be added the same way.
 */
export class CameraController {
  readonly freeFly: FreeFlyCamera;
  private orbit: OrbitCamera | null = null;
  private driverCam: CameraMode | null = null;
  /** Near plane of the normal cameras (m); the driver's eye sits right behind the dashboard, so it uses a closer one. */
  private normalNear: number;
  private normalFov: number;
  private trainCam: CameraMode | null = null;
  private firstCam: FirstPersonMode | null = null;
  private tmpDir = new THREE.Vector3();
  private mode: CameraMode;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private input: InputManager,
  ) {
    this.freeFly = new FreeFlyCamera(camera, input);
    this.mode = this.freeFly;
    this.normalNear = camera.near;
    this.normalFov = camera.fov;
  }

  setTrainCamera(cam: CameraMode): void {
    this.trainCam = cam;
  }

  get isTrainView(): boolean {
    return this.trainCam !== null && this.mode === this.trainCam;
  }

  /** Passenger camera of a train (the TrainCamera sets its own near plane and lens). */
  enterTrainView(): boolean {
    if (!this.trainCam || this.isFreeFly) return false;
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    this.mode = this.trainCam;
    return true;
  }

  /** Back to the chase camera with the normal lens. */
  exitTrainView(): void {
    if (!this.isTrainView) return;
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    if (this.orbit) this.mode = this.orbit;
    this.camera.near = this.normalNear;
    this.camera.fov = this.normalFov;
    this.camera.updateProjectionMatrix();
  }

  setOrbit(orbit: OrbitCamera): void {
    this.orbit = orbit;
  }

  setFirstPersonCamera(cam: FirstPersonMode): void {
    this.firstCam = cam;
  }

  get isFirstPerson(): boolean {
    return this.firstCam !== null && this.mode === this.firstCam;
  }

  /** The player's own eyes (on foot only: from the orbit camera, never from free-fly / driver / train). */
  enterFirstPerson(): boolean {
    if (!this.firstCam || !this.orbit || this.mode !== this.orbit) return false;
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    this.firstCam.enter();
    this.mode = this.firstCam;
    this.camera.near = Config.firstPerson.near;
    this.camera.updateProjectionMatrix();
    return true;
  }

  /** Back to the orbit camera, looking the same way, with the normal near plane and lens. Does nothing when another camera has taken over (train, free-fly). */
  exitFirstPerson(): void {
    if (!this.isFirstPerson || !this.firstCam) return;
    this.firstCam.exit();
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    if (this.orbit) this.mode = this.orbit;
    this.camera.near = this.normalNear;
    this.camera.fov = this.normalFov;
    this.camera.updateProjectionMatrix();
  }

  setDriverCamera(cam: CameraMode): void {
    this.driverCam = cam;
  }

  get isDriverView(): boolean {
    return this.driverCam !== null && this.mode === this.driverCam;
  }

  /** Go to the driver's eyes (only from the orbit camera). */
  enterDriverView(): boolean {
    if (!this.driverCam || this.isFreeFly || this.isDriverView) return false;
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    this.mode = this.driverCam;
    this.camera.near = 0.3;
    this.camera.updateProjectionMatrix();
    return true;
  }

  /** Back to the chase camera, placed behind the vehicle on the side the driver was looking at. */
  exitDriverView(): void {
    if (!this.isDriverView) return;
    this.camera.getWorldDirection(this.tmpDir);
    if (this.orbit) {
      this.orbit.yaw = Math.atan2(-this.tmpDir.x, -this.tmpDir.z);
      this.mode = this.orbit;
    }
    this.input.consumeMouseDelta();
    this.input.consumeWheel();
    this.camera.near = this.normalNear;
    this.camera.updateProjectionMatrix();
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
