// AUTO CONNECT AT GRADE, A-5 in the game: the auto junction pads (RoadNetwork.autoPads) as ONE mesh (vertex colours, shared material), absolute world coordinates, parent = world.root.
// Same pattern as GroundJ1Layer. The terrain under a pad is carved by RoadNetwork (AutoPadTerrain), the mesh lies AUTO_LIFT above it. No flag on = no pads = nothing is added.
import * as THREE from 'three';
import { buildAutoPadMesh } from '../JunctionAutoMesh';
import type { AutoPadTerrain } from '../JunctionAutoTerrain';

export class AutoPadLayer {
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(private readonly parent: THREE.Object3D, terrain: AutoPadTerrain | null) {
    this.group.name = 'junction-auto-pads';
    if (!terrain || terrain.count === 0) return;
    for (let i = 0; i < terrain.count; i++) {
      const d = buildAutoPadMesh(i, terrain);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
      g.setIndex(d.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = 'auto-pad-' + terrain.padAt(i).id;
      mesh.receiveShadow = true;
      this.geos.push(g);
      this.group.add(mesh);
    }
    parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
