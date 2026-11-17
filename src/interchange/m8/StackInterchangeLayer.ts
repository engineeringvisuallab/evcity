// STEP 9.2 J1 in the game: the stack as ONE mesh (vertex colours, shared material), absolute world coordinates, parent = world.root, plus solids for RingStructurePhysics.
// OFF by default (Config.roads.interchangeJ1.enabled = false): the location is not fixed until the outward M8 roads exist (step 6.3), and the terrain is not carved under it yet.
import * as THREE from 'three';
import type { RingSolid } from '../../roads/ring/RingStructureLayer';
import { buildStackMesh, type StackPlacement } from './StackMesh';

export interface StackJ1Config extends StackPlacement { enabled: boolean }

export class StackInterchangeLayer {
  readonly solids: RingSolid[] = [];
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  private geo: THREE.BufferGeometry | null = null;

  constructor(private readonly parent: THREE.Object3D, cfg: StackJ1Config, ground?: (x: number, z: number) => number) {
    this.group.name = 'interchange-j1-stack';
    if (!cfg.enabled) return;
    const d = buildStackMesh(cfg, ground);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
    g.setIndex(d.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.name = 'j1-stack';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const bs = g.boundingSphere!;
    this.solids.push({ cx: bs.center.x, cz: bs.center.z, radius: bs.radius, positions: new Float32Array(d.positions), indices: new Uint32Array(d.indices) });
    this.geo = g;
    this.group.add(mesh);
    parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.geo?.dispose();
    this.mat.dispose();
  }
}
