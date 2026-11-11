// EVLab Step 10: the cycle rack (meshes). Layout numbers are in EVLabCycleRack (pure). Building-local metres.
// A row of galvanised steel hoops (one InstancedMesh = one draw call) on a pale concrete pad. No colliders: a hoop is thin, and the cycles are only drawn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RACK, RACK_PAD, hoopX } from './EVLabCycleRack';
import type { Parts } from './EVLabParts';

export function buildCycleRack(P: Parts): THREE.Group {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabCycleRack';
  const y = 0.05;

  // the pad: a little lighter than the plaza stone, a hair above it
  const padMat = k.own(new THREE.MeshLambertMaterial({ color: 0xb9b6ac, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const pad = P.hplane(g, RACK_PAD[0], RACK_PAD[1], RACK_PAD[2], RACK_PAD[3], y + 0.012, padMat);
  pad.receiveShadow = true;

  // one hoop in the y-z plane: two posts, a half circle on top, a base plate under each post
  const r = RACK.tube, hw = RACK.hoopHalf, arcY = RACK.hoopH - hw;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(r, r, arcY, 7).translate(0, arcY / 2, s * hw));
    parts.push(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 8).translate(0, 0.006, s * hw));
  }
  parts.push(new THREE.TorusGeometry(hw, r, 6, 16, Math.PI).rotateY(Math.PI / 2).translate(0, arcY, 0));
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('EVLabCycleRack: merge failed');
  parts.forEach((p) => p.dispose());
  const geo = k.own(merged);
  const steel = P.lit(null, 0x9aa1a8, 0.45);
  const hoops = new THREE.InstancedMesh(geo, steel, RACK.hoops);
  const o = new THREE.Object3D();
  for (let h = 0; h < RACK.hoops; h++) { o.position.set(hoopX(h), y + 0.012, RACK.z); o.updateMatrix(); hoops.setMatrixAt(h, o.matrix); }
  hoops.instanceMatrix.needsUpdate = true;
  hoops.castShadow = true;
  g.add(hoops);
  return g;
}
