// STEP J1-e1 / J1-g4 in the game: the OPEN ground interchange J1 as ONE mesh (vertex colours, shared material), absolute world coordinates, parent = world.root.
// J1-g4: the mesh is the open star (OpenJ1Mesh: surface, median + corner islands with kerbs, lane lines, stop lines, zebra, arrows, guide lines), no longer the old box.
// The terrain under it is carved by RoadNetwork (J1Terrain), so the mesh needs no solids: cars and the player stand on the carved ground, the mesh lies 2 cm above it.
// No signal heads and no signal-phase traffic exist in the game yet (phases P1-P4 are data in OpenJ1Geometry.buildMovements only).
import * as THREE from 'three';
import { buildOpenJ1Mesh } from './OpenJ1Mesh';
import type { J1Terrain } from './GroundJ1Terrain';

export class GroundJ1Layer {
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private geo: THREE.BufferGeometry | null = null;

  constructor(private readonly parent: THREE.Object3D, terrain: J1Terrain | null) {
    this.group.name = 'junction-j1-ground';
    if (!terrain) return;
    const d = buildOpenJ1Mesh(terrain);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
    g.setIndex(d.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.name = 'j1-ground';
    mesh.receiveShadow = true;
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
