// STEP HK-9b: the loop ramps of the Hatikamrul-type interchange as scene meshes (one mesh per ramp, vertex colours, one shared material, absolute world coordinates, parent = world.root)
// plus one solid per ramp for RingStructurePhysics. Only built when Config.roads.hatikamrul.enabled (default OFF); with the switch OFF this layer is empty.
import * as THREE from 'three';
import { Config } from '../../core/Config';
import type { RoadNetwork } from '../RoadNetwork';
import type { RingSolid } from './RingStructureLayer';
import { hkFrame, hkRamps, hkRingOffset } from './HkRamps';
import { buildHkRampMesh } from './HkRampMesh';
import { buildHkAuxStrip, buildHkConnector, buildHkLaneMarks, buildHkTail, hkDeckLevel } from './HkDeckPaving';
import type { MeshData } from './RingBridgeGeometry';

export class HkInterchangeLayer {
  readonly solids: RingSolid[] = [];
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  /** STEP HK-9c-1: visual paving (aux strip + loop tails) lies a few cm over the deck: its own material with a polygon offset, no collider. */
  private readonly pavMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly geos: THREE.BufferGeometry[] = [];
  /** Number of paving meshes built (aux strip + connector + lane marks + tails); 0 with the switch OFF. */
  pavingMeshes = 0;

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
    // HK-9c-1: the paving that joins the loops to the ring (visual only); HK-9c-3: + the under-deck connector arm -> link
    const pav: [string, MeshData][] = [['hk-aux-strip', buildHkAuxStrip(roads)], ['hk-connector', buildHkConnector(roads, f, ground)], ['hk-lane-marks', buildHkLaneMarks(roads, f)]];
    const deckY = hkDeckLevel(roads);
    for (const rp of hkRamps(f)) pav.push([`hk-tail-${rp.id}`, buildHkTail(rp, off, deckY)]);
    for (const [name, d] of pav) {
      if (d.indices.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
      g.setIndex(d.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.pavMat);
      mesh.name = name;
      mesh.receiveShadow = true;
      this.geos.push(g);
      this.group.add(mesh);
      this.pavingMeshes++;
    }
    parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.pavMat.dispose();
  }
}
