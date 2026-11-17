// EVLab Step 11: the benches (meshes). Layout numbers are in EVLabBenches (pure). Building-local metres.
// Every bench is the same model: teak slats (3 seat + 2 back) and a dark steel frame. All benches share ONE wood InstancedMesh and ONE steel InstancedMesh
// (2 draw calls for the whole campus). The walk colliders (one turned box per bench) are returned as `obbs` and made by EVLabManager.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BENCH, benchObbs, benches, type BenchObb } from './EVLabBenches';
import type { Parts } from './EVLabParts';

export interface BenchesBuild {
  group: THREE.Group;
  /** Colliders of the benches (boxes turned about y), building-local. */
  obbs: BenchObb[];
  /** Number of benches. */
  count: number;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** The bench in its own frame: origin = the middle of the seat on the ground, +z = the way a person on it looks, +x = along its length. */
export function benchGeometries(): { wood: THREE.BufferGeometry[]; steel: THREE.BufferGeometry[] } {
  const L = BENCH.len, wood: THREE.BufferGeometry[] = [], steel: THREE.BufferGeometry[] = [];
  const top = BENCH.seatH, hw = 0.5 * L - 0.12; // the end frames stand 0.12 m in from the ends
  // seat: 3 slats 0.14 m wide, 0.02 m gaps, 0.04 m thick, their top at seatH
  for (const z of [-0.16, 0, 0.16]) wood.push(box(L, 0.04, 0.14, 0, top - 0.02, z));
  // back rest: 2 slats on the rear posts
  for (const y of [0.65, 0.81]) wood.push(box(L, 0.13, 0.03, 0, y, BENCH.backZ));
  // the two end frames: front leg, rear post (goes up to the top of the back), seat rail, arm rest and its support
  for (const s of [-1, 1]) {
    const x = s * hw;
    steel.push(box(0.05, 0.46, 0.05, x, 0.18, 0.19)); // front leg (0.05 m into the ground so it never floats)
    steel.push(box(0.05, 0.95, 0.05, x, 0.425, BENCH.backZ)); // rear post
    steel.push(box(0.04, 0.04, 0.46, x, top - 0.06, 0)); // rail under the seat
    steel.push(box(0.06, 0.035, 0.5, x, 0.62, -0.02)); // arm rest
    steel.push(box(0.04, 0.2, 0.04, x, 0.515, 0.19)); // arm rest support on the front leg
  }
  steel.push(box(2 * hw, 0.03, 0.03, 0, 0.3, 0.19)); // cross brace between the front legs
  return { wood, steel };
}

export function buildBenches(P: Parts): BenchesBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabBenches';
  const list = benches();

  const { wood, steel } = benchGeometries();
  const wm = mergeGeometries(wood, false), sm = mergeGeometries(steel, false);
  if (!wm || !sm) throw new Error('EVLabBenches: merge failed');
  [...wood, ...steel].forEach((p) => p.dispose());
  const woodMat = P.lit(null, 0x8a5a33, 0.12);
  const steelMat = P.lit(null, 0x2b3036, 0.4);
  const woodMesh = new THREE.InstancedMesh(k.own(wm), woodMat, list.length);
  const steelMesh = new THREE.InstancedMesh(k.own(sm), steelMat, list.length);
  const o = new THREE.Object3D();
  list.forEach((b, i) => {
    o.position.set(b.x, b.y, b.z);
    o.rotation.set(0, b.yaw, 0);
    o.updateMatrix();
    woodMesh.setMatrixAt(i, o.matrix);
    steelMesh.setMatrixAt(i, o.matrix);
  });
  for (const m of [woodMesh, steelMesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = false; // small prop (PERFORMANCE_RULES 2.2)
    m.frustumCulled = false; // instances are spread over 500 m; the geometry's own bounding sphere is only the size of one bench
    g.add(m);
  }
  return { group: g, obbs: benchObbs(), count: list.length };
}
