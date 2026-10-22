import * as THREE from 'three';
import type { RailMeshData } from './RailMesh';

/** One shared, lit, vertex-coloured material for all railway meshes (ballast, steel, concrete, wires ...). */
export class RailMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'rail';
    // Tunnel lining and lamps light themselves (per-vertex `glow`): a lit tube by day and by night, with no real light sources.
    this.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.5;');
    };
    this.customProgramCacheKey = () => 'rail-glow';
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
    geo.setAttribute('glow', new THREE.BufferAttribute(data.glow, 1));
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
