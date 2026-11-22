// STEP RE-9 (part 2): the RT-E ramp bridges M3 / M4 and the arm viaduct widening in the game as ONE mesh (vertex colours, shared material), absolute world coordinates, parent = world.root.
// Mesh = RteMesh.ts (pure math, data from RteStructData.ts). Switch: Config.roads.junctionRte.enabled (default OFF; when OFF nothing is built).
// Collision: `solids` (deck + concrete + parapet triangles, no marks / lamps) in ~100 m cells, same RingSolid shape as the ring structures; Engine hands them to RingStructurePhysics.
// NOT in this layer (honest): ground-level lanes, embankments, signs.
import * as THREE from 'three';
import { buildRteMesh, type RteMeshData } from './RteMesh';
import type { RingSolid } from '../ring/RingStructureLayer';
import { Config } from '../../core/Config';

export class RteLayer {
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  private geo: THREE.BufferGeometry | null = null;
  /** Filled in the constructor, read by RingStructurePhysics. */
  readonly solids: RingSolid[] = [];

  constructor(private readonly parent: THREE.Object3D, enabled: boolean) {
    this.group.name = 'junction-rte';
    if (!enabled) return;
    try { this.build(); } catch (e) { console.error('[RteLayer] build failed, layer skipped, game continues', e); }
  }

  private build(): void {
    const d = buildRteMesh({ skipArmWindow1: Config.roads.junctionRteArmGround.enabled, skipArmWedges: !Config.roads.junctionRteWedges.enabled });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
    g.setIndex(d.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.name = 'rte-structures';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.geo = g;
    this.solids.push(...solidsOf(d));
    this.group.add(mesh);
    this.parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.geo?.dispose();
    this.mat.dispose();
  }
}

/** deck + concrete + parapet triangles, grouped by 100 m cell of the triangle centre, each cell re-indexed with its own bounding circle. */
function solidsOf(d: RteMeshData): RingSolid[] {
  const CELL = 100, cells = new Map<string, number[]>();
  const pos = d.positions, idx = d.indices;
  for (const part of ['deck', 'concrete', 'barrier'] as const) {
    for (let t = d.parts[part][0]; t < d.parts[part][1]; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL);
      const list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
  const out: RingSolid[] = [];
  for (const tris of cells.values()) {
    const map = new Map<number, number>(), p: number[] = [], ix: number[] = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        let n = map.get(v);
        if (n === undefined) {
          n = p.length / 3; map.set(v, n);
          const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
          p.push(x, y, z);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        ix.push(n);
      }
    }
    out.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, radius: Math.hypot(x1 - x0, z1 - z0) / 2, positions: new Float32Array(p), indices: new Uint32Array(ix) });
  }
  return out;
}
