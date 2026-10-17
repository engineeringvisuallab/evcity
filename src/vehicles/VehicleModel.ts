import * as THREE from 'three';
import type { VehicleSpec } from './VehicleSpec';

export interface WheelNode {
  /** Moves up/down with the suspension. */
  pivot: THREE.Group;
  /** Yaw (steering). */
  steer: THREE.Group;
  /** Roll (wheel rotation about the axle). */
  spin: THREE.Group;
}

/**
 * Procedural low-poly car / jeep (no model files). Faces +Z, left side is +X, origin = chassis centre.
 * Wheel order matches the Rapier wheels: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right.
 */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly wheels: WheelNode[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(spec: VehicleSpec) {
    const mat = (c: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: c, ...extra });
      this.mats.push(m);
      return m;
    };
    const box = (w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, l);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    const body = mat(spec.look.body);
    const accent = mat(spec.look.accent);
    const glass = mat(0x172431, { transparent: true, opacity: 0.42 }); // see-through: you can see who is driving
    const lightF = mat(0xfff2b0, { emissive: 0x554400 });
    const lightR = mat(0xcc1111, { emissive: 0x330000 });

    if (spec.look.kind === 'sedan') {
      box(1.8, 0.5, 4.3, body, 0, 0.02, 0); // lower body
      box(1.55, 0.5, 2.1, glass, 0, 0.52, -0.2); // cabin glass
      box(1.5, 0.06, 1.95, body, 0, 0.8, -0.2); // roof
      box(1.7, 0.08, 1.2, body, 0, 0.3, 1.3); // bonnet
      box(1.7, 0.08, 0.9, body, 0, 0.3, -1.75); // boot
      box(0.4, 0.04, 0.4, accent, -0.42, 0.42, 0.72); // steering wheel (right-hand drive)
      box(1.62, 0.18, 0.12, accent, 0, -0.12, 2.18); // front bumper
      box(1.62, 0.18, 0.12, accent, 0, -0.12, -2.18); // rear bumper
      box(0.35, 0.12, 0.05, lightF, 0.6, 0.12, 2.17);
      box(0.35, 0.12, 0.05, lightF, -0.6, 0.12, 2.17);
      box(0.35, 0.12, 0.05, lightR, 0.6, 0.15, -2.17);
      box(0.35, 0.12, 0.05, lightR, -0.6, 0.15, -2.17);
    } else {
      box(1.85, 0.7, 3.9, body, 0, 0.05, 0);
      box(1.75, 0.65, 1.9, glass, 0, 0.72, -0.3);
      box(1.7, 0.06, 1.85, accent, 0, 1.07, -0.3); // soft top
      box(0.06, 0.05, 1.9, accent, 0.8, 1.15, -0.3); // roll bar
      box(0.06, 0.05, 1.9, accent, -0.8, 1.15, -0.3);
      box(0.4, 0.04, 0.4, accent, -0.45, 0.55, 0.55); // steering wheel (right-hand drive)
      box(1.9, 0.2, 0.18, accent, 0, -0.18, 2.0); // bumpers
      box(1.9, 0.2, 0.18, accent, 0, -0.18, -2.0);
      box(0.3, 0.3, 0.06, lightF, 0.65, 0.2, 1.96);
      box(0.3, 0.3, 0.06, lightF, -0.65, 0.2, 1.96);
      box(0.25, 0.2, 0.05, lightR, 0.75, 0.2, -1.97);
      box(0.25, 0.2, 0.05, lightR, -0.75, 0.2, -1.97);
    }

    // wheels
    const tireM = mat(0x161616);
    const rimM = mat(0xb8bcc2);
    const r = spec.wheelRadius;
    const w = spec.wheelWidth;
    const tireG = new THREE.CylinderGeometry(r, r, w, 20);
    const rimG = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 12);
    this.geos.push(tireG, rimG);
    const spots: [number, number][] = [
      [spec.trackHalf, spec.wheelbaseHalf],
      [-spec.trackHalf, spec.wheelbaseHalf],
      [spec.trackHalf, -spec.wheelbaseHalf],
      [-spec.trackHalf, -spec.wheelbaseHalf],
    ];
    for (const [x, z] of spots) {
      const pivot = new THREE.Group();
      pivot.position.set(x, spec.connY - spec.susp.rest, z);
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireG, tireM);
      const rim = new THREE.Mesh(rimG, rimM);
      tire.rotation.z = Math.PI / 2; // cylinder axis Y -> X
      rim.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spin.add(tire, rim);
      steer.add(spin);
      pivot.add(steer);
      this.root.add(pivot);
      this.wheels.push({ pivot, steer, spin });
    }
    if (spec.look.kind === 'jeep') {
      const spare = new THREE.Mesh(tireG, tireM);
      spare.rotation.x = Math.PI / 2;
      spare.position.set(0, 0.3, -2.12);
      spare.scale.set(0.9, 0.5, 0.9);
      spare.castShadow = true;
      this.root.add(spare);
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
