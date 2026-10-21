import * as THREE from 'three';
import type { RailMeshData } from './RailMesh';

/** One shared, lit, vertex-coloured material for all railway meshes (ballast, steel, concrete, wires ...). */
export class RailMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'rail';
  }
}

/** Turns the worker's railway geometry into a mesh (chunk-local coordinates, parented to the chunk group). */
export class RailChunkBuilder {
  constructor(private material: RailMaterial) {}

  build(data: RailMeshData): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'rail';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
