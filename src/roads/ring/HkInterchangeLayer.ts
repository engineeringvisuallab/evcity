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
import { buildHkBridgeDecks } from './HkBridgeDecks';

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
  /** HK-fix3: colliders of the paving that lies over / beside the ring deck (aux strip, under-deck connector, loop tails). Kept apart from `solids` (= the 4 ramps) and `safetySolids`; Engine adds it to RingStructurePhysics. */
  readonly pavingSolids: RingSolid[] = [];
  /** Crash cushion + barrier meshes built (1 with the switch ON, 0 OFF). */
  safetyMeshes = 0;
  /** STEP HK-FIX5: bridged stretches of the HK-CD / HK-SLIP roads that got a deck (0 with the switch OFF). Their colliders are in `pavingSolids`. */
  bridgeDecks = 0;

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
      if (name === 'hk-aux-strip' || name === 'hk-connector' || name.startsWith('hk-tail-')) {
        const bs = g.boundingSphere!;
        this.pavingSolids.push({ cx: bs.center.x, cz: bs.center.z, radius: bs.radius, positions: new Float32Array(d.positions), indices: new Uint32Array(d.indices) });
      }
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
    // HK-FIX5: deck slab + parapets (visual) and a solid deck (collider) on the bridged stretches of the 8 C-D / slip roads
    const bd = buildHkBridgeDecks(roads);
    this.bridgeDecks = bd.bridges;
    if (bd.visual.indices.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bd.visual.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bd.visual.colors, 3));
      g.setIndex(bd.visual.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = 'hk-bridge-decks';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.geos.push(g);
      this.group.add(mesh);
      // one solid per bridge stretch would be better for the near-player switch: split the soup in chunks of ~60 m by triangle centre
      const P = bd.solid.positions, I = bd.solid.indices;
      const cells = new Map<string, number[]>();
      for (let t = 0; t < I.length; t += 3) {
        const cx = (P[I[t] * 3] + P[I[t + 1] * 3] + P[I[t + 2] * 3]) / 3, cz = (P[I[t] * 3 + 2] + P[I[t + 1] * 3 + 2] + P[I[t + 2] * 3 + 2]) / 3;
        const key = `${Math.floor(cx / 60)}_${Math.floor(cz / 60)}`;
        let a = cells.get(key); if (!a) { a = []; cells.set(key, a); }
        a.push(I[t], I[t + 1], I[t + 2]);
      }
      for (const idx of cells.values()) {
        const map = new Map<number, number>();
        const pos: number[] = [];
        const ind = new Uint32Array(idx.length);
        for (let q = 0; q < idx.length; q++) {
          const v = idx[q];
          let m = map.get(v);
          if (m === undefined) { m = pos.length / 3; map.set(v, m); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
          ind[q] = m;
        }
        let sx = 0, sz = 0;
        for (let q = 0; q < pos.length; q += 3) { sx += pos[q]; sz += pos[q + 2]; }
        const cx = sx / (pos.length / 3), cz = sz / (pos.length / 3);
        let rad = 0;
        for (let q = 0; q < pos.length; q += 3) rad = Math.max(rad, Math.hypot(pos[q] - cx, pos[q + 2] - cz));
        this.pavingSolids.push({ cx, cz, radius: rad + 1, positions: new Float32Array(pos), indices: ind });
      }
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
