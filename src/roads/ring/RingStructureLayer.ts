// STEP 5.3c-1: the 3D layer of the ring's structures. One mesh per structure (vertex colours, one shared material), absolute world coordinates, parent = world.root.
import * as THREE from 'three';
import type { RoadNetwork } from '../RoadNetwork';
import { buildStructure, ringStructures, type MeshData } from './RingBridgeGeometry';

/** One structure's solid triangles in absolute world coordinates, with a bounding circle (for the near-player collider switch). */
export interface RingSolid {
  cx: number;
  cz: number;
  radius: number;
  positions: Float32Array;
  indices: Uint32Array;
}

/** Render triangles + the collision-only extras, as one triangle soup. */
function solidOf(d: MeshData): { positions: Float32Array; indices: Uint32Array } {
  const c = d.collider;
  const base = d.positions.length / 3;
  return {
    positions: new Float32Array(c ? d.positions.concat(c.positions) : d.positions),
    indices: new Uint32Array(c ? d.indices.concat(c.indices.map((i) => i + base)) : d.indices),
  };
}

export class RingStructureLayer {
  /** Filled in the constructor, read by RingStructurePhysics. */
  readonly solids: RingSolid[] = [];
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(private readonly parent: THREE.Object3D, roads: RoadNetwork) {
    this.group.name = 'ring-structures';
    ringStructures(roads).forEach((b, k) => {
      const d = buildStructure(roads, b, k);
      if (d.indices.length === 0) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
      g.setIndex(d.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = `ring-structure-${k + 1}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const bs = g.boundingSphere!;
      this.solids.push({ cx: bs.center.x, cz: bs.center.z, radius: bs.radius, ...solidOf(d) });
      this.geos.push(g);
      this.group.add(mesh);
    });
    parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
