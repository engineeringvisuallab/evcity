// J7-C: the 300 ft junction as ONE solid mesh in the game (vertex colours, shared material), absolute world coordinates, parent = world.root.
// Mesh = J300SolidMesh.ts (pure math, data J300StructC.ts). Switch: Config.roads.junctionJ300.enabled (default OFF) OR the URL flag ?j300=1 (look without editing Config).
// Collision: `solids` (surface + concrete + slope triangles, no poles / lamps / signs) in ~100 m cells, RingSolid shape, Engine hands them to RingStructurePhysics.
// J8 adds the paint mesh (J300Paint.ts). NOT in this layer (honest): terrain carve (J9), removal of the old R6-9 / R4-9 ribbons and old ring signs inside the footprint, road markings, sign legends, lighting.
import * as THREE from 'three';
import { buildJ300Mesh, type J300MeshData } from './J300SolidMesh';
import type { RingSolid } from '../ring/RingStructureLayer';

export class J300Layer {
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  private readonly paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private geo: THREE.BufferGeometry | null = null;
  private paintGeo: THREE.BufferGeometry | null = null;
  private disposed = false;
  readonly solids: RingSolid[] = [];

  static urlFlag(): boolean { try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('j300') === '1'; } catch { return false; } }

  constructor(private readonly parent: THREE.Object3D, enabled: boolean) {
    this.group.name = 'junction-j300';
    if (!enabled && !J300Layer.urlFlag()) return;
    try { this.build(); } catch (e) { console.error('[J300Layer] build failed, layer skipped, game continues', e); }
  }

  private build(): void {
    const d = buildJ300Mesh();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3));
    g.setIndex(d.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.name = 'j300-solid';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.geo = g;
    this.solids.push(...solidsOf(d));
    this.group.add(mesh);
    this.parent.add(this.group);
    // J8: markings, islands, gore chevrons (no collision), loaded lazily so the big data stays out of the main bundle while the layer is OFF
    void import('./J300Paint').then((m) => { if (this.disposed) return; const p = m.buildJ300Paint(); const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(p.colors, 3)); pg.setIndex(p.indices); pg.computeVertexNormals(); pg.computeBoundingSphere(); const pm = new THREE.Mesh(pg, this.paintMat); pm.name = 'j300-paint'; pm.receiveShadow = true; this.paintGeo = pg; this.group.add(pm); }).catch((e) => console.error('[J300Layer] paint failed, skipped', e));
  }

  dispose(): void {
    this.disposed = true;
    this.parent.remove(this.group);
    this.geo?.dispose();
    this.paintGeo?.dispose();
    this.mat.dispose();
    this.paintMat.dispose();
  }
}

/** surface + concrete + slope triangles, grouped by 100 m cell of the triangle centre, each cell re-indexed with its own bounding circle. */
function solidsOf(d: J300MeshData): RingSolid[] {
  const CELL = 100, cells = new Map<string, number[]>();
  const pos = d.positions, idx = d.indices;
  const ranges: [number, number][] = [d.parts.surface, d.parts.concrete, d.parts.slope];
  for (const [r0, r1] of ranges) {
    for (let t = r0; t < r1; t++) {
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
