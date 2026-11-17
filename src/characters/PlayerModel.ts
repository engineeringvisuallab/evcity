import * as THREE from 'three';
import { makeGun } from '../combat/GunModel';
import type { WeaponId } from '../combat/Weapons';
import { ENGINEER_LOOK } from '../people/PersonModel';
import { buildHuman, kneeFlex, ELBOW_REST, HAND_GRIP_Y, type HumanRig } from '../people/HumanBody';
import { blink, gait, relax } from '../people/HumanMotion';
import { AimController } from '../people/HumanAim';
import { Umbrella, holdArm } from '../weather/Umbrella';

export type PlayerState = 'idle' | 'walk' | 'run' | 'air' | 'swim' | 'wade' | 'climb';

/**
 * The procedural engineer: realistic-shaped body (see people/HumanBody.ts), yellow safety helmet, orange vest, blue trousers.
 * No model files needed. Faces +Z, feet at y = 0, 1.8 m tall. Walk / run / jump / swim animation.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  private pivot: THREE.Group; // at the hips; tilts forward when swimming
  private rig: HumanRig;
  private clock = 0;
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private shinL: THREE.Object3D;
  private shinR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private foreL: THREE.Object3D;
  private foreR: THREE.Object3D;
  private phase = 0;
  private swimBlend = 0;
  /** Climbing a tree: how fast the body moves on the trunk (m/s, + up / - down); drives the hand-over-hand animation. */
  climbRate = 0;
  private climbBlend = 0;
  private gun: THREE.Group | null = null;
  private gunId: WeaponId | null = null;
  private aiming = false;
  private aimer = new AimController();
  private aimPitch = 0;
  private crouchWant = false;
  private crouch = 0;
  private mats: THREE.Material[] = [];
  /** RAIN: the umbrella (built on the first rain). */
  private umbrella: Umbrella | null = null;
  private umbrellaWant = false;

  constructor() {
    const rig = buildHuman(ENGINEER_LOOK, (c) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    });
    this.rig = rig;
    this.pivot = rig.pivot;
    this.legL = rig.legL;
    this.legR = rig.legR;
    this.shinL = rig.shinL;
    this.shinR = rig.shinR;
    this.armL = rig.armL;
    this.armR = rig.armR;
    this.foreL = rig.foreL;
    this.foreR = rig.foreR;
    this.pivot.position.y = 0.9;
    this.root.add(this.pivot);
  }

  /** Gun in the right hand (null = hands empty). */
  setGun(id: WeaponId | null): void {
    if (id === this.gunId) return;
    const had = this.gun !== null;
    this.gunId = id;
    // swapping one gun for another while aiming: the gun goes down, the new one comes up
    if (had && id && this.aimer.active) {
      this.aimer.startSwap(() => {
        if (this.gunId === id) this.mountGun(id);
      });
      return;
    }
    this.mountGun(id);
  }

  private mountGun(id: WeaponId | null): void {
    if (this.gun) {
      this.gun.removeFromParent();
      this.gun = null;
    }
    if (id) {
      this.gun = makeGun(id);
      const hand = this.rig.handR; // skinned body: the gun sits in the hand bone, so the wrist can turn it
      if (hand) {
        this.gun.position.set(0, -0.05, 0);
        hand.add(this.gun);
      } else {
        this.gun.position.set(0, HAND_GRIP_Y, 0);
        this.foreR.add(this.gun);
      }
    }
    this.aimer.setGun(id, this.rig.handR ? this.gun : null);
  }

  /** Crouch (hold C): knees bent, hips low, back leaning forward (the physics capsule keeps its size). */
  setCrouch(on: boolean): void {
    this.crouchWant = on;
  }

  /** Camera pitch (rad, + = up): the gun follows it while aiming. */
  setAimPitch(pitch: number): void {
    this.aimPitch = pitch;
  }

  /** One shot was fired: the gun kicks up (strength ~0.5 pistol .. 1.6 shotgun). */
  kick(strength = 1): void {
    this.aimer.kick(strength);
  }

  /** Reload animation: -1 = not reloading, else progress 0..1. */
  setReload(progress: number): void {
    this.aimer.setReload(progress);
  }

  /** Scene-space position of the muzzle of the gun in the hand (false while no aim pose is active). */
  muzzleWorld(out: THREE.Vector3, gunLength: number): boolean {
    if (!this.gun || !this.aimer.active) return false;
    this.gun.updateWorldMatrix(true, false);
    out.set(0, -gunLength * 1.3, 0.02).applyMatrix4(this.gun.matrixWorld);
    return true;
  }

  /** RAIN: umbrella up / down (it also folds by itself while swimming or aiming). */
  setUmbrella(on: boolean): void {
    this.umbrellaWant = on;
    if (on && !this.umbrella) this.umbrella = new Umbrella(this.pivot, this.armL.position.x < 0 ? -1 : 1, 0.63);
  }

  /** Both arms raised, pointing the gun where the camera looks. */
  setAiming(on: boolean): void {
    this.aiming = on;
  }

  /** Face direction (radians, rotation about Y; 0 = +Z). */
  setHeading(heading: number, dt: number): void {
    let d = heading - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, 12 * dt);
  }

  update(dt: number, horizSpeed: number, state: PlayerState): void {
    const k = Math.min(1, 14 * dt);
    this.clock += dt;
    blink(this.rig, dt);
    const ease = (g: THREE.Object3D, target: number) => {
      g.rotation.x += (target - g.rotation.x) * k;
    };
    this.swimBlend += ((state === 'swim' ? 1 : 0) - this.swimBlend) * Math.min(1, 8 * dt);
    this.climbBlend += ((state === 'climb' ? 1 : 0) - this.climbBlend) * Math.min(1, 8 * dt);
    this.pivot.rotation.x = this.swimBlend * 1.25 + this.climbBlend * 0.12;

    if (state === 'climb') {
      // hugging the trunk: arms reach up and pull alternately, knees bent, feet pressed against the bark
      this.phase += dt * Math.min(7, Math.abs(this.climbRate) * 2.6);
      const s = Math.sin(this.phase);
      ease(this.armL, -2.55 + s * 0.45);
      ease(this.armR, -2.55 - s * 0.45);
      ease(this.foreL, -0.25);
      ease(this.foreR, this.gun ? -0.1 : -0.25);
      ease(this.legL, -0.75 - s * 0.35);
      ease(this.legR, -0.75 + s * 0.35);
      ease(this.shinL, 1.05 + Math.max(0, s) * 0.3);
      ease(this.shinR, 1.05 + Math.max(0, -s) * 0.3);
      return;
    }

    if (state === 'walk' || state === 'run' || state === 'wade') {
      this.phase += dt * (3 + horizSpeed * 0.9);
      const amp = state === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      ease(this.legL, s * amp);
      ease(this.legR, -s * amp);
      ease(this.shinL, kneeFlex(this.phase, amp, true));
      ease(this.shinR, kneeFlex(this.phase, amp, false));
      ease(this.armL, -s * amp * 0.9);
      ease(this.armR, s * amp * 0.9);
      const elbow = state === 'run' ? -1.0 : -0.3;
      ease(this.foreL, elbow);
      ease(this.foreR, this.gun ? -0.1 : elbow);
      gait(this.rig, this.phase, amp, state === 'run', k);
    } else if (state === 'air') {
      ease(this.legL, -0.6);
      ease(this.legR, 0.35);
      ease(this.shinL, 0.3);
      ease(this.shinR, 0.8);
      ease(this.armL, -0.9);
      ease(this.armR, -0.9);
      ease(this.foreL, -0.4);
      ease(this.foreR, this.gun ? -0.1 : -0.4);
      relax(this.rig, this.clock, k, false);
    } else if (state === 'swim') {
      this.phase += dt * 4;
      ease(this.armL, this.phase % (Math.PI * 2) - Math.PI);
      this.armR.rotation.x = this.armL.rotation.x + Math.PI;
      ease(this.legL, Math.sin(this.phase * 3) * 0.35);
      ease(this.legR, -Math.sin(this.phase * 3) * 0.35);
      ease(this.shinL, 0.25 + Math.max(0, -Math.sin(this.phase * 3)) * 0.3);
      ease(this.shinR, 0.25 + Math.max(0, Math.sin(this.phase * 3)) * 0.3);
      ease(this.foreL, -0.15);
      ease(this.foreR, -0.15);
      relax(this.rig, this.clock, k, false);
    } else {
      ease(this.legL, 0);
      ease(this.legR, 0);
      ease(this.shinL, 0);
      ease(this.shinR, 0);
      ease(this.armL, 0);
      ease(this.armR, 0);
      ease(this.foreL, ELBOW_REST);
      ease(this.foreR, this.gun ? -0.05 : ELBOW_REST);
      relax(this.rig, this.clock, k, true);
    }
    this.crouch += ((this.crouchWant && state !== 'swim' && state !== 'air' ? 1 : 0) - this.crouch) * Math.min(1, 9 * dt);
    const cb = this.crouch;
    if (cb > 0.002 && this.rig.spine && this.rig.head && this.rig.footL && this.rig.footR) {
      // thighs forward, shins back, feet flat, hips back and low (hip height 0.58 m), the back leans forward
      const mix = (o: THREE.Object3D, to: number): void => {
        o.rotation.x += (to - o.rotation.x) * cb;
      };
      mix(this.legL, -1.05 + 0.25 * this.legL.rotation.x);
      mix(this.legR, -1.05 + 0.25 * this.legR.rotation.x);
      mix(this.shinL, 1.75 + 0.3 * this.shinL.rotation.x);
      mix(this.shinR, 1.75 + 0.3 * this.shinR.rotation.x);
      mix(this.rig.footL, -0.7);
      mix(this.rig.footR, -0.7);
      mix(this.rig.head, -0.2);
      this.rig.spine.rotation.x = 0.3 * cb;
      this.pivot.position.y += (0.9 - 0.317 - this.pivot.position.y) * cb;
      this.pivot.position.z = -0.17 * cb;
    } else if (this.rig.spine) {
      this.rig.spine.rotation.x = 0;
      this.pivot.position.z = 0;
    }
    if (this.aiming && state !== 'swim') {
      ease(this.armR, -1.5);
      ease(this.armL, -1.25);
      ease(this.foreR, 0);
      ease(this.foreL, -0.15);
    }
    this.aimer.update(this.rig, dt, this.aiming && state !== 'swim', this.aimPitch);
    if (this.umbrella) {
      const o = this.umbrella.update(dt, this.umbrellaWant && !this.aiming && state !== 'swim');
      holdArm(this.armL, this.foreL, o);
    }
  }

  /** The body geometry is shared by everyone (HumanBody.ts): only the materials belong to this model. */
  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.rig.dispose?.();
  }
}
