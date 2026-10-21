import * as THREE from 'three';
import { buildCarMesh } from './TrainMesh';
import { CONSIST, type CarKind } from './TrainConfig';
import type { CarPose, Train } from './TrainSim';
import type { TrainViewHost, TrainViewLike } from './TrainManager';

/** One shared, lit, vertex-coloured material for all trains (same kind as the rail material). */
export class TrainMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'train';
  }
}

const geometries = new Map<CarKind, THREE.BufferGeometry>();
function carGeometry(kind: CarKind): THREE.BufferGeometry {
  let g = geometries.get(kind);
  if (!g) {
    const d = buildCarMesh(kind);
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    geometries.set(kind, g);
  }
  return g;
}

/** Frees the shared car geometries (engine shutdown). */
export function disposeTrainGeometries(): void {
  for (const g of geometries.values()) g.dispose();
  geometries.clear();
}

/**
 * Three.js view of one simulated train (Step 5a provides it; it is wired into the game in Step 5b). One mesh per car, the three car geometries are shared.
 * `update` places every car from the simulation. World coordinates are shifted by (originX, originZ) so the game's floating origin can be applied.
 */
export class TrainView {
  readonly group = new THREE.Group();
  private cars: THREE.Mesh[] = [];
  private pose: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();
  private side = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor(material: TrainMaterial) {
    this.group.name = 'train';
    for (const c of CONSIST) {
      const mesh = new THREE.Mesh(carGeometry(c.kind), material);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      this.cars.push(mesh);
      this.group.add(mesh);
    }
  }

  update(train: Train, originX: number, originZ: number): void {
    const n = this.cars.length;
    for (let k = 0; k < n; k++) {
      // mesh k is always the same physical car; after a reversal it sits at the other end of the path order
      const j = train.reversed ? n - 1 - k : k;
      const p = train.carPose(j, this.pose);
      const s = p.flipped ? -1 : 1;
      this.fwd.set(p.fx * s, p.fy * s, p.fz * s);
      this.up.set(0, 1, 0).addScaledVector(this.fwd, -this.fwd.y).normalize();
      this.side.crossVectors(this.fwd, this.up);
      this.m.makeBasis(this.fwd, this.up, this.side);
      this.m.setPosition(p.x - originX, p.y, p.z - originZ);
      this.cars[k].matrix.copy(this.m);
      this.cars[k].matrixWorldNeedsUpdate = true;
    }
  }
}

/**
 * Puts the train views under the world root. Positions are ABSOLUTE world coordinates (the root is moved by the floating origin, exactly like
 * the bridge meshes), so `update(train, 0, 0)`.
 */
export class TrainLayer implements TrainViewHost {
  private material = new TrainMaterial();

  constructor(private root: THREE.Object3D) {}

  create(): TrainViewLike {
    const view = new TrainView(this.material);
    this.root.add(view.group);
    return {
      update: (train: Train) => view.update(train, 0, 0),
      dispose: () => this.root.remove(view.group),
    };
  }

  dispose(): void {
    this.material.dispose();
    disposeTrainGeometries();
  }
}
