// STEP RE-9 (part 2): the RT-E ramp bridges M3 / M4 and the arm viaduct widening in the game as ONE mesh (vertex colours, shared material), absolute world coordinates, parent = world.root.
// Mesh = RteMesh.ts (pure math, data from RteStructData.ts). Switch: Config.roads.junctionRte.enabled (default OFF; when OFF nothing is built).
// NOT in this layer (honest): collision (cars / player cannot drive on the decks yet), ground-level lanes, embankments, signs.
import * as THREE from 'three';
import { buildRteMesh } from './RteMesh';

export class RteLayer {
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  private geo: THREE.BufferGeometry | null = null;

  constructor(private readonly parent: THREE.Object3D, enabled: boolean) {
    this.group.name = 'junction-rte';
    if (!enabled) return;
    try { this.build(); } catch (e) { console.error('[RteLayer] build failed, layer skipped, game continues', e); }
  }

  private build(): void {
    const d = buildRteMesh();
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
    this.group.add(mesh);
    this.parent.add(this.group);
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.geo?.dispose();
    this.mat.dispose();
  }
}
