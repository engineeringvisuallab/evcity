// EVLab Tower: the audience of the Presentation Hall: instanced people in the seats (2 instanced meshes = 2 draw calls). Mood changes how they move.
import * as THREE from 'three';
import { mulberry32 } from '../structures';
import type { Parts } from './EVLabParts';

export type Mood = 'idle' | 'listen' | 'clap' | 'ovation';
export interface Seat { x: number; y: number; z: number }
export interface AudienceBuild {
  group: THREE.Group;
  /** People sitting in the hall / seats they sit on. */
  peopleCount: number;
  seatCount: number;
  setMood(m: Mood): void;
  update(dt: number, t: number): void;
}

const SKIN = [0xf1c9a5, 0xd9a37a, 0xb97a52, 0x8a5636, 0x5e3a24];
const CLOTH = [0x2b4a7a, 0x7a2b3a, 0x2f6a4a, 0x3a3a44, 0x8a6a2b, 0x5a3a7a, 0xcfcfd4, 0x1f5f7a];

export function buildAudience(P: Parts, seats: readonly Seat[], fill = 0.62): AudienceBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabAudience';
  const r = mulberry32(777);
  const people = seats.filter(() => r() < fill);
  const n = people.length;
  const body = new THREE.InstancedMesh(k.own(new THREE.BoxGeometry(0.46, 0.6, 0.3)), k.own(new THREE.MeshLambertMaterial({ color: 0xffffff })), n);
  const head = new THREE.InstancedMesh(k.own(new THREE.IcosahedronGeometry(0.14, 0)), k.own(new THREE.MeshLambertMaterial({ color: 0xffffff })), n);
  body.frustumCulled = head.frustumCulled = false;
  const phase = new Float32Array(n), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    phase[i] = r() * Math.PI * 2;
    body.setColorAt(i, col.setHex(CLOTH[(r() * CLOTH.length) | 0]));
    head.setColorAt(i, col.setHex(SKIN[(r() * SKIN.length) | 0]));
  }
  g.add(body, head);
  const o = new THREE.Object3D();
  let mood: Mood = 'idle';
  let stand = 0; // 0 sitting .. 1 standing
  let acc = 0;
  const pose = (t: number): void => {
    for (let i = 0; i < n; i++) {
      const s = people[i], p = phase[i];
      let bob = 0, sway = 0;
      if (mood === 'listen') sway = Math.sin(t * 0.8 + p) * 0.03;
      else if (mood === 'clap') bob = Math.max(0, Math.sin(t * 11 + p)) * 0.03;
      else if (mood === 'ovation') bob = Math.max(0, Math.sin(t * 7 + p)) * 0.07;
      const up = stand * 0.42 + bob;
      o.position.set(s.x + sway, s.y + 0.76 + up * 0.8 + (stand * 0.27), s.z);
      o.scale.set(1, 1 + stand * 0.55, 1);
      o.rotation.set(0, 0, sway);
      o.updateMatrix();
      body.setMatrixAt(i, o.matrix);
      o.position.set(s.x + sway, s.y + 1.2 + up + stand * 0.62, s.z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      head.setMatrixAt(i, o.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  };
  pose(0);
  return {
    group: g,
    peopleCount: n,
    seatCount: seats.length,
    setMood(m) { mood = m; acc = 1; },
    update(dt, t) {
      const target = mood === 'ovation' ? 1 : 0;
      const moving = Math.abs(stand - target) > 0.001;
      if (moving) stand += Math.sign(target - stand) * Math.min(Math.abs(target - stand), dt * 2.2);
      if (mood === 'idle' && !moving) { if (acc > 0) { acc = 0; pose(t); } return; }
      acc += dt;
      if (acc < 1 / 24) return; // 24 poses a second is plenty for 1500 heads
      acc = 0.0001;
      pose(t);
    },
  };
}
