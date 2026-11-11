// EVLab campus: the fountains (jharna). Each one is a stone basin or pedestal plus a set of water jets; the water is a swarm of drops (one InstancedMesh for all
// fountains) that fly on parabolas, so it needs no textures and costs ~1.7k tiny instances. Building-local metres.
import * as THREE from 'three';
import type { FountainDef } from './EVLabCampus';
import { PLAZA_FOUNTAIN, WATER_Y } from './EVLabCampus';
import type { Parts } from './EVLabParts';

export interface FountainSet {
  group: THREE.Group;
  setNight(k: number): void;
  update(t: number): void;
  /** Number of drops (for the budget). */
  drops: number;
}

const G = 9.8;
/** [number of jets, ring radius, height of the jet (m), horizontal reach (m), drops per jet] */
type Ring = readonly [n: number, r: number, h: number, reach: number, m: number];
const PATTERN: Record<number, readonly Ring[]> = {
  1: [[1, 0, 5, 0, 6], [8, 1.2, 2.6, 2.2, 5]],
  2: [[1, 0, 11, 0, 9], [8, 1.6, 6, 3.2, 7], [12, 2.4, 3.4, 5.2, 6]],
  3: [[1, 0, 17, 0, 14], [6, 2.2, 11, 4, 8], [12, 3.6, 7.5, 8, 7], [18, 5.2, 4.2, 12.5, 6]],
};

interface Jet { x: number; y: number; z: number; cx: number; cz: number; vh: number; vy: number; T: number; m: number; first: number; ph: number }

export function buildFountains(P: Parts, defs: readonly FountainDef[]): FountainSet {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabFountains';
  const marble = P.lit(t.marbleCream, 0xffffff, 0.3);
  const stone = P.lit(t.stone, 0xffffff, 0.15);
  const water = k.own(new THREE.MeshPhongMaterial({ color: 0x2f86a6, specular: 0xbfe6ff, shininess: 120, transparent: true, opacity: 0.9 }));
  const jets: Jet[] = [];
  let count = 0;
  for (const d of defs) {
    const pat = PATTERN[d.size];
    // ---- the base
    const plaza = d.y > WATER_Y + 0.5;
    if (plaza) {
      const R = d.x === PLAZA_FOUNTAIN.x && d.z === PLAZA_FOUNTAIN.z ? PLAZA_FOUNTAIN.r : 5;
      P.cyl(g, R, R + 0.4, 0.7, d.x, 0.35, d.z, marble, 40); // basin wall
      P.cyl(g, R - 0.7, R - 0.7, 0.04, d.x, 0.55, d.z, water, 40); // water surface
      P.cyl(g, 1.6, 2.2, 1.4, d.x, 0.9, d.z, stone, 16); // central plinth
    } else {
      const top = d.y + 0.3;
      P.cyl(g, 3.2, 3.8, top + 4.4, d.x, (top - 4.4) / 2, d.z, stone, 20); // pedestal from the lake bed (y -4.4) to just above the water
      P.cyl(g, 3.5, 3.5, 0.5, d.x, d.y + 0.35, d.z, marble, 20);
    }
    // ---- the jets
    const baseY = d.y + (plaza ? 1.6 : 0.6);
    for (const [n, r, h, reach, m] of pat) {
      const vy = Math.sqrt(2 * G * h), T = (2 * vy) / G;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r > 3 ? 0.2 : 0);
        const cx = Math.cos(a), cz = Math.sin(a);
        jets.push({ x: d.x + cx * r, y: baseY, z: d.z + cz * r, cx, cz, vh: reach / T, vy, T, m, first: count, ph: (i * 0.37) % 1 });
        count += m;
      }
    }
  }
  const dropGeo = k.own(new THREE.SphereGeometry(0.17, 5, 4));
  const dropMat = k.own(new THREE.MeshBasicMaterial({ color: 0xd8efff, transparent: true, opacity: 0.8, depthWrite: false }));
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, count);
  drops.frustumCulled = false;
  g.add(drops);
  const o = new THREE.Object3D();
  const day = new THREE.Color(0xd8efff), night = new THREE.Color(0xffefc4);
  const update = (tt: number): void => {
    for (const j of jets) {
      for (let i = 0; i < j.m; i++) {
        const f = (tt / j.T * 0.9 + j.ph + i / j.m) % 1;
        const s = f * j.T;
        o.position.set(j.x + j.cx * j.vh * s, j.y + j.vy * s - 0.5 * G * s * s, j.z + j.cz * j.vh * s);
        o.scale.setScalar(0.8 + 0.5 * (1 - Math.abs(f - 0.5) * 2));
        o.updateMatrix();
        drops.setMatrixAt(j.first + i, o.matrix);
      }
    }
    drops.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group: g, drops: count, update, setNight: (n) => { dropMat.color.copy(day).lerp(night, n); } };
}
