import * as THREE from 'three';
import { makeGun } from '../combat/GunModel';
import type { WeaponId } from '../combat/Weapons';

export type PlayerState = 'idle' | 'walk' | 'run' | 'air' | 'swim' | 'wade';

/**
 * A simple procedural engineer: yellow safety helmet, orange vest, blue trousers.
 * No model files needed. Faces +Z, feet at y = 0, 1.8 m tall. Walk / run / jump / swim animation.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group(); // at the hips; tilts forward when swimming
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private phase = 0;
  private swimBlend = 0;
  private gun: THREE.Group | null = null;
  private gunId: WeaponId | null = null;
  private aiming = false;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor() {
    const mat = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    const skin = mat(0xe0b08a);
    const vest = mat(0xff7a1a);
    const stripe = mat(0xe8f06a);
    const pants = mat(0x2f4a7a);
    const boots = mat(0x3a2a1a);
    const helmet = mat(0xffd21f);

    this.pivot.position.y = 0.9;
    this.root.add(this.pivot);

    // torso + reflective stripe
    this.pivot.add(box(0.46, 0.6, 0.26, vest, 0, 0.3, 0));
    this.pivot.add(box(0.47, 0.06, 0.27, stripe, 0, 0.22, 0));
    // head
    const headG = new THREE.SphereGeometry(0.12, 14, 10);
    this.geos.push(headG);
    const head = new THREE.Mesh(headG, skin);
    head.position.y = 0.76;
    head.castShadow = true;
    this.pivot.add(head);
    // helmet dome + brim
    const domeG = new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.geos.push(domeG);
    const dome = new THREE.Mesh(domeG, helmet);
    dome.position.y = 0.78;
    dome.castShadow = true;
    this.pivot.add(dome);
    const brimG = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16);
    this.geos.push(brimG);
    const brim = new THREE.Mesh(brimG, helmet);
    brim.position.set(0, 0.78, 0.02);
    this.pivot.add(brim);

    // arms (pivot at shoulder)
    for (const [g, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      g.position.set(sx * 0.29, 0.55, 0);
      g.add(box(0.1, 0.3, 0.1, vest, 0, -0.15, 0));
      g.add(box(0.09, 0.22, 0.09, skin, 0, -0.41, 0));
      this.pivot.add(g);
    }
    // legs (pivot at hip)
    for (const [g, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      g.position.set(sx * 0.11, 0, 0);
      g.add(box(0.17, 0.74, 0.19, pants, 0, -0.37, 0));
      g.add(box(0.18, 0.16, 0.26, boots, 0, -0.82, 0.03));
      this.pivot.add(g);
    }
  }

  /** Gun in the right hand (null = hands empty). */
  setGun(id: WeaponId | null): void {
    if (id === this.gunId) return;
    if (this.gun) {
      this.armR.remove(this.gun);
      this.gun = null;
    }
    this.gunId = id;
    if (id) {
      this.gun = makeGun(id);
      this.gun.position.set(0, -0.46, 0);
      this.armR.add(this.gun);
    }
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
    const ease = (g: THREE.Object3D, target: number) => {
      g.rotation.x += (target - g.rotation.x) * k;
    };
    this.swimBlend += ((state === 'swim' ? 1 : 0) - this.swimBlend) * Math.min(1, 8 * dt);
    this.pivot.rotation.x = this.swimBlend * 1.25;

    if (state === 'walk' || state === 'run' || state === 'wade') {
      this.phase += dt * (3 + horizSpeed * 0.9);
      const amp = state === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      ease(this.legL, s * amp);
      ease(this.legR, -s * amp);
      ease(this.armL, -s * amp * 0.9);
      ease(this.armR, s * amp * 0.9);
    } else if (state === 'air') {
      ease(this.legL, -0.6);
      ease(this.legR, 0.35);
      ease(this.armL, -0.9);
      ease(this.armR, -0.9);
    } else if (state === 'swim') {
      this.phase += dt * 4;
      ease(this.armL, this.phase % (Math.PI * 2) - Math.PI);
      this.armR.rotation.x = this.armL.rotation.x + Math.PI;
      ease(this.legL, Math.sin(this.phase * 3) * 0.35);
      ease(this.legR, -Math.sin(this.phase * 3) * 0.35);
    } else {
      ease(this.legL, 0);
      ease(this.legR, 0);
      ease(this.armL, 0);
      ease(this.armR, 0);
    }
    if (this.aiming && state !== 'swim') {
      ease(this.armR, -1.5);
      ease(this.armL, -1.25);
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
