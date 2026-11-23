// STEP HK-9b: the loop ramps of the Hatikamrul-type interchange as scene meshes (one mesh per ramp, vertex colours, one shared material, absolute world coordinates, parent = world.root)
// plus one solid per ramp for RingStructurePhysics. Only built when Config.roads.hatikamrul.enabled (default OFF); with the switch OFF this layer is empty.
import * as THREE from 'three';
import { Config } from '../../core/Config';
import type { RoadNetwork } from '../RoadNetwork';
import type { RingSolid } from './RingStructureLayer';
import { hkFrame, hkRamps, hkRingOffset } from './HkRamps';
import { buildHkRampMesh } from './HkRampMesh';

export class HkInterchangeLayer {
  readonly solids: RingSolid[] = [];
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(private readonly parent: THREE.Object3D, roads: RoadNetwork, ground?: (x: number, z: number) => number) {
    this.group.name = 'hk-interchange';
    if (!Config.roads.hatikamrul.enabled) return;
    const f = hkFrame(roads);
    if (!f) return;
    const off = hkRingOffset(roads);
    for (const rp of hkRamps(f)) {
      const d = buildHkRampMesh(rp, off, ground);
      if (d.indices.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
      g.setIndex(d.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = `hk-ramp-${rp.id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const bs = g.boundingSphere!;
      this.solids.push({ cx: bs.center.x, cz: bs.center.z, radius: bs.radius, positions: new Float32Array(d.positions), indices: new Uint32Array(d.indices) });
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
