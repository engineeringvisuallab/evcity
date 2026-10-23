import * as THREE from 'three';
import { buildCarParts, type CarParts, type TrainMeshData } from './TrainMesh';
import { CONSIST, type CarKind } from './TrainConfig';
import type { CarPose, Train } from './TrainSim';
import type { TrainViewHost, TrainViewLike } from './TrainManager';

/** One shared, lit, vertex-coloured material for all trains (same kind as the rail material): the outside of the cars. */
export class TrainMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'train';
  }
}

/** The inside of the cars (floor, seats, lining, lamps, head / tail lamps): UNLIT, the colours already carry a fake shading, so the saloon is bright by day and by night. */
export class TrainInsideMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'train-inside';
  }
}

/** Window panes: see-through, so the saloon shows from outside and the world from the seat. */
export class TrainGlassMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.name = 'train-glass';
  }
}

/** The three materials every train view uses. */
export interface TrainMaterials {
  body: TrainMaterial;
  inside: TrainInsideMaterial;
  glass: TrainGlassMaterial;
}

const toGeometry = (d: TrainMeshData): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
};

interface CarGeometries {
  body: THREE.BufferGeometry;
  inside: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

const geometries = new Map<CarKind, CarGeometries>();
function carGeometry(kind: CarKind): CarGeometries {
  let g = geometries.get(kind);
  if (!g) {
    const parts: CarParts = buildCarParts(kind);
    g = { body: toGeometry(parts.body), inside: toGeometry(parts.inside), glass: toGeometry(parts.glass) };
    geometries.set(kind, g);
  }
  return g;
}

/** Frees the shared car geometries (engine shutdown). */
export function disposeTrainGeometries(): void {
  for (const g of geometries.values()) {
    g.body.dispose();
    g.inside.dispose();
    g.glass.dispose();
  }
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

  constructor(materials: TrainMaterials) {
    this.group.name = 'train';
    for (const c of CONSIST) {
      const g = carGeometry(c.kind);
      const mesh = new THREE.Mesh(g.body, materials.body);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      // the saloon and the windows ride on the car (children keep an identity matrix: they follow the body)
      const inside = new THREE.Mesh(g.inside, materials.inside);
      const glass = new THREE.Mesh(g.glass, materials.glass);
      inside.matrixAutoUpdate = false;
      glass.matrixAutoUpdate = false;
      inside.updateMatrix();
      glass.updateMatrix();
      glass.renderOrder = 2;
      mesh.add(inside, glass);
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
  private materials: TrainMaterials = { body: new TrainMaterial(), inside: new TrainInsideMaterial(), glass: new TrainGlassMaterial() };

  constructor(private root: THREE.Object3D) {}

  create(): TrainViewLike {
    const view = new TrainView(this.materials);
    this.root.add(view.group);
    return {
      update: (train: Train) => view.update(train, 0, 0),
      dispose: () => this.root.remove(view.group),
    };
  }

  dispose(): void {
    this.materials.body.dispose();
    this.materials.inside.dispose();
    this.materials.glass.dispose();
    disposeTrainGeometries();
  }
}
