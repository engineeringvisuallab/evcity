// STEP HK-9b: the loop ramps of the Hatikamrul-type interchange as scene meshes (one mesh per ramp, vertex colours, one shared material, absolute world coordinates, parent = world.root)
// plus one solid per ramp for RingStructurePhysics. Only built when Config.roads.hatikamrul.enabled (default OFF); with the switch OFF this layer is empty.
import * as THREE from 'three';
import { Config } from '../../core/Config';
import type { RoadNetwork } from '../RoadNetwork';
import type { RingSolid } from './RingStructureLayer';
import { hkFrame, hkRamps, hkRingOffset } from './HkRamps';
import { buildHkRampMesh } from './HkRampMesh';
import { buildHkAuxStrip, buildHkConnector, buildHkLaneMarks, buildHkTail, hkDeckLevel } from './HkDeckPaving';
import { buildHkCrashBarrier, buildHkGoreMarks } from './HkGoreMarks';
import { buildHkArrows } from './HkArrows';
import type { MeshData } from './RingBridgeGeometry';

export class HkInterchangeLayer {
  readonly solids: RingSolid[] = [];
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  /** STEP HK-9c-1: visual paving (aux strip + loop tails) lies a few cm over the deck: its own material with a polygon offset, no collider. */
  private readonly pavMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly geos: THREE.BufferGeometry[] = [];
  /** Number of paving meshes built (aux strip + connector + lane marks + C-D gore marks + arrows + tails); 0 with the switch OFF. */
  pavingMeshes = 0;
  /** STEP HK-9d-2: collider of the crash cushion + barrier at the closed lane (kept apart from `solids`, which stays the 4 ramps); Engine adds it to RingStructurePhysics. */
  readonly safetySolids: RingSolid[] = [];
  /** Crash cushion + barrier meshes built (1 with the switch ON, 0 OFF). */
  safetyMeshes = 0;

  constructor(private readonly parent: THREE.Object3D, roads: RoadNetwork, ground?: (x: number, z: number) => number) {
    this.group.name = 'hk-interchange';
    if (!Config.roads.hatikamrul.enabled) return;
    const f = hkFrame(roads);
    if (!f) return;
    const off = hkRingOffset(roads);
    // HK-fix1: distance of a point from the nearest C-D road centre line (segments of the 4 HK-CD-* roads)
    const cdRoads = roads.roads.filter((r) => r.name.startsWith('HK-CD-'));
    const cdDist = (x: number, z: number): number => {
      let best = Infinity;
      for (const r of cdRoads) for (let k = 0; k + 1 < r.xs.length; k++) {
        const ax = r.xs[k], az = r.zs[k], bx = r.xs[k + 1] - ax, bz = r.zs[k + 1] - az, l2 = bx * bx + bz * bz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
        const d = Math.hypot(x - ax - bx * t, z - az - bz * t); if (d < best) best = d;
      }
      return best;
    };
    for (const rp of hkRamps(f)) {
      const d = buildHkRampMesh(rp, off, ground, cdDist);
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
    const pav: [string, MeshData][] = [['hk-aux-strip', buildHkAuxStrip(roads)], ['hk-connector', buildHkConnector(roads, f, ground)], ['hk-lane-marks', buildHkLaneMarks(roads, f)], ['hk-gore-marks', buildHkGoreMarks(roads, f).mesh], ['hk-arrows', buildHkArrows(f, off).mesh]];
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
    // HK-9d-2: crash cushion + barrier on the closed east lane of the arm (y +30 .. 0): a real 3D object, the same triangles are its collider
    const cb = buildHkCrashBarrier(roads, f).mesh;
    if (cb.indices.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cb.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cb.colors, 3));
      g.setIndex(cb.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = 'hk-crash-barrier';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const bs = g.boundingSphere!;
      this.safetySolids.push({ cx: bs.center.x, cz: bs.center.z, radius: bs.radius, positions: new Float32Array(cb.positions), indices: new Uint32Array(cb.indices) });
      this.geos.push(g);
      this.group.add(mesh);
      this.safetyMeshes++;
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
