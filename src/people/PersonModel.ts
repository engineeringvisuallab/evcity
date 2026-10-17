import * as THREE from 'three';
import { makeGun } from '../combat/GunModel';
import type { WeaponId } from '../combat/Weapons';

/** Everything that makes one person look different from another. */
export interface Appearance {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  /** Body height scale (1 = 1.8 m). */
  scale: number;
  headwear: 'none' | 'cap' | 'helmet' | 'topi';
  headwearColor: number;
  /** Reflective vest (site workers / engineer). */
  vest: boolean;
}

export type PersonMode = 'idle' | 'walk' | 'run';

const SKIN = [0xc68e6b, 0xb87a56, 0xa86f4c, 0xd2a07c, 0x8d5a3c, 0x9a6642];
const HAIR = [0x111111, 0x1b1410, 0x2a1d14, 0x3a2a1c];
const SHIRT = [0xf1f1ec, 0x3b6ea8, 0x2f7d5b, 0x8c2f3a, 0x6b6f76, 0xd98b2b, 0x4a4a9a, 0xb5a642, 0x2b2f36, 0xc9c0a8];
const PANTS = [0x23262d, 0x2f4a7a, 0x6a5a45, 0x3a3a3a, 0x1c2a44, 0x8a8068];
const SHOES = [0x1a1a1a, 0x3a2a1a, 0x4a4a4a];
const CAP = [0x1c3b6e, 0x8c2f3a, 0xf1f1ec, 0x2b2f36];

const pick = <T,>(a: T[], r: () => number): T => a[Math.floor(r() * a.length) % a.length];

/** A random everyday person (seeded by the caller's random function). */
export function randomAppearance(r: () => number): Appearance {
  const roll = r();
  return {
    skin: pick(SKIN, r),
    hair: pick(HAIR, r),
    shirt: pick(SHIRT, r),
    pants: pick(PANTS, r),
    shoes: pick(SHOES, r),
    scale: 0.92 + r() * 0.14,
    headwear: roll < 0.12 ? 'topi' : roll < 0.3 ? 'cap' : 'none',
    headwearColor: roll < 0.12 ? 0xf2efe6 : pick(CAP, r),
    vest: false,
  };
}

/** The player's own look (yellow helmet, orange vest) - used when the player sits in a vehicle. */
export const ENGINEER_LOOK: Appearance = {
  skin: 0xe0b08a,
  hair: 0x2a1d14,
  shirt: 0xff7a1a,
  pants: 0x2f4a7a,
  shoes: 0x3a2a1a,
  scale: 1,
  headwear: 'helmet',
  headwearColor: 0xffd21f,
  vest: true,
};

// ---- shared geometry / materials (dozens of people, a handful of GPU objects) ----
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const HEAD = new THREE.SphereGeometry(0.12, 12, 9);
const DOME = new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const BRIM = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14);
const TOPI = new THREE.CylinderGeometry(0.115, 0.135, 0.11, 12);
const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number): THREE.MeshLambertMaterial => {
  let m = mats.get(c);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c });
    mats.set(c, m);
  }
  return m;
};

/**
 * Procedural low-poly person (no model files). Faces +Z, feet at y = 0 when standing.
 * `setSeated(true)` puts the hips at the model origin with legs forward and hands on the wheel (for drivers).
 */
export class PersonModel {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group(); // at the hips
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private phase = Math.random() * 6;
  private seated = false;
  private gun: THREE.Group | null = null;
  private aiming = false;
  private fall = 0; // 0 = standing ... 1 = lying on the ground
  private fallTarget = 0;

  constructor(readonly look: Appearance) {
    const part = (g: THREE.BufferGeometry, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => part(UNIT_BOX, mat(c), w, h, d, x, y, z);

    this.pivot.position.y = 0.9;
    this.root.add(this.pivot);
    this.root.scale.setScalar(look.scale);

    const top = look.shirt;
    this.pivot.add(box(0.46, 0.6, 0.26, top, 0, 0.3, 0));
    if (look.vest) this.pivot.add(box(0.47, 0.06, 0.27, 0xe8f06a, 0, 0.22, 0));
    const head = part(HEAD, mat(look.skin), 1, 1, 1, 0, 0.76, 0);
    this.pivot.add(head);
    // hair (a cap of hair on the back/top of the head) unless a helmet/cap covers it
    if (look.headwear === 'none') this.pivot.add(part(DOME, mat(look.hair), 0.92, 0.8, 0.92, 0, 0.775, -0.005));
    else if (look.headwear === 'topi') {
      this.pivot.add(part(DOME, mat(look.hair), 0.92, 0.8, 0.92, 0, 0.775, -0.005));
      this.pivot.add(part(TOPI, mat(look.headwearColor), 1, 1, 1, 0, 0.9, 0));
    } else {
      this.pivot.add(part(DOME, mat(look.headwearColor), 1, 1, 1, 0, 0.78, 0));
      this.pivot.add(part(BRIM, mat(look.headwearColor), look.headwear === 'cap' ? 0.7 : 1, 1, look.headwear === 'cap' ? 0.7 : 1, 0, 0.78, 0.07));
    }
    for (const [g, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      g.position.set(sx * 0.29, 0.55, 0);
      g.add(box(0.1, 0.3, 0.1, top, 0, -0.15, 0));
      g.add(box(0.09, 0.22, 0.09, look.skin, 0, -0.41, 0));
      this.pivot.add(g);
    }
    for (const [g, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      g.position.set(sx * 0.11, 0, 0);
      g.add(box(0.17, 0.74, 0.19, look.pants, 0, -0.37, 0));
      g.add(box(0.18, 0.16, 0.26, look.shoes, 0, -0.82, 0.03));
      this.pivot.add(g);
    }
  }

  /** Put a gun in the right hand (null = no gun). */
  setGun(id: WeaponId | null): void {
    if (this.gun) {
      this.armR.remove(this.gun);
      this.gun = null;
    }
    if (id) {
      this.gun = makeGun(id);
      this.gun.position.set(0, -0.46, 0);
      this.armR.add(this.gun);
    }
  }

  /** Arm raised, pointing the gun forward. */
  setAiming(on: boolean): void {
    this.aiming = on;
  }

  /** Fall down (true) / stand up (false). Animated in update(). */
  setDead(dead: boolean): void {
    this.fallTarget = dead ? 1 : 0;
    if (dead) this.aiming = false;
  }

  get isSeated(): boolean {
    return this.seated;
  }

  setSeated(on: boolean): void {
    this.seated = on;
    this.pivot.position.y = on ? 0 : 0.9;
    if (on) {
      this.legL.rotation.x = this.legR.rotation.x = -1.45;
      this.armL.rotation.x = this.armR.rotation.x = -1.15;
    } else {
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    }
  }

  /** Smoothly turn to face `heading` (radians about Y, 0 = +Z). */
  setHeading(heading: number, dt: number): void {
    let d = heading - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, 10 * dt);
  }

  update(dt: number, speed: number, mode: PersonMode): void {
    if (this.seated) return;
    if (this.fall !== this.fallTarget) {
      this.fall += Math.sign(this.fallTarget - this.fall) * Math.min(Math.abs(this.fallTarget - this.fall), dt * 3);
      this.pivot.rotation.x = -Math.PI / 2 * this.fall; // falls on its back
      this.pivot.position.y = 0.9 + (0.14 - 0.9) * this.fall;
    }
    if (this.fall > 0) return; // lying: no walking animation
    const k = Math.min(1, 14 * dt);
    const ease = (g: THREE.Object3D, target: number) => {
      g.rotation.x += (target - g.rotation.x) * k;
    };
    if (mode === 'walk' || mode === 'run') {
      this.phase += dt * (3 + speed * 0.9);
      const amp = mode === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      ease(this.legL, s * amp);
      ease(this.legR, -s * amp);
      ease(this.armL, -s * amp * 0.9);
      ease(this.armR, s * amp * 0.9);
    } else {
      ease(this.legL, 0);
      ease(this.legR, 0);
      ease(this.armL, 0);
      ease(this.armR, 0);
    }
    if (this.aiming) {
      ease(this.armR, -1.5);
      ease(this.armL, -1.25);
    } else if (this.gun && mode === 'idle') {
      ease(this.armR, -0.35); // gun held low
    }
  }
}
