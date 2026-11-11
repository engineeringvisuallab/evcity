// EVLab campus: the four bridges over the lake. All decks are flat and flush with the ground (no ramps), so people and cars cross them smoothly.
//   S  cable-stayed (white H-pylons with fan cables)  - the main entrance bridge to the F6 highway avenue (24 m wide)
//   N  white steel through-arch with hangers
//   W  stone bridge with piers, balustrades and lanterns
//   E  steel truss (Warren truss with a curved top chord)
// Building-local metres, same frame as EVLabLayout. Returns the meshes, the colliders (deck + railings) and the lamp spots.
import * as THREE from 'three';
import { BRIDGES } from './EVLabCampus';
import type { Solid } from './EVLabLayout';
import type { Parts } from './EVLabParts';
import { roadStrip } from './EVLabRoads';

export interface BridgesBuild { group: THREE.Group; solids: Solid[]; lamps: Array<[number, number]> }

const UP = new THREE.Vector3(0, 1, 0);

export function buildBridges(P: Parts, roadMat: THREE.Material): BridgesBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabBridges';
  const solids: Solid[] = [];
  const lamps: Array<[number, number]> = [];
  const concrete = P.lit(t.stone, 0xd8d4cc, 0.12);
  const marble = P.lit(t.marbleCream, 0xffffff, 0.3);
  const white = P.lit(null, 0xf4f6f8, 0.5);
  const steel = P.lit(null, 0xaebccb, 0.55);
  const cable = P.lit(null, 0xe9eef2, 0.4);
  const gold = P.gold();

  const beam = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): void => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-3) return;
    const m = new THREE.Mesh(k.geo(`bb${r}`, () => new THREE.CylinderGeometry(r, r, 1, 6)), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.scale.set(1, len, 1);
    parent.add(m);
  };

  for (const b of BRIDGES) {
    const L = b.to - b.from, mid = (b.from + b.to) / 2, hw = b.w / 2;
    // (a, u): a = distance along the bridge axis (world coordinate along it), u = offset across it
    const V = (a: number, u: number, y: number): THREE.Vector3 => (b.axis === 'z' ? new THREE.Vector3(b.across + u, y, a) : new THREE.Vector3(a, y, b.across + u));
    const box = (a0: number, a1: number, u0: number, u1: number, y0: number, y1: number, mat: THREE.Material): void => {
      const p = V(a0, u0, 0), q = V(a1, u1, 0);
      P.tbox(g, Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.z, q.z), Math.max(p.z, q.z), y0, y1, mat, 6);
    };
    const solid = (a0: number, a1: number, u0: number, u1: number, y0: number, y1: number): void => {
      const p = V(a0, u0, 0), q = V(a1, u1, 0);
      solids.push([Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.z, q.z), Math.max(p.z, q.z), y0, y1]);
    };

    // ---- deck: slab, asphalt, two marble footways, kerbs; walkable top at y = 0.04
    box(b.from, b.to, -hw, hw, -1.1, 0, concrete);
    solid(b.from, b.to, -hw, hw, -1.3, 0.04);
    const line = [V(b.from, 0, 0.05), V(b.to, 0, 0.05)];
    roadStrip(g, k, line.map((v) => [v.x, v.z] as const), hw - 2.2, 0.05, roadMat);
    for (const s of [-1, 1]) {
      box(b.from, b.to, s * (hw - 2.2), s * (hw - 0.2), 0, 0.07, marble);
      box(b.from, b.to, s * (hw - 0.2), s * hw, 0, 0.32, concrete); // kerb / plinth of the railing
    }
    // ---- railings (collider 1.2 m high) and lamps
    for (const s of [-1, 1]) {
      solid(b.from, b.to, s * (hw - 0.2) - 0.15, s * (hw - 0.2) + 0.15, 0.04, 1.2);
      if (b.style === 'stone') {
        box(b.from, b.to, s * (hw - 0.45), s * (hw - 0.05), 0.32, 1.25, marble);
      } else {
        box(b.from, b.to, s * (hw - 0.3), s * (hw - 0.1), 1.05, 1.15, steel);
        const posts = new THREE.InstancedMesh(k.geo('rp', () => new THREE.BoxGeometry(0.12, 0.8, 0.12)), steel, Math.floor(L / 3) + 1);
        const o = new THREE.Object3D();
        let c = 0;
        for (let a = b.from; a <= b.to; a += 3) { const v = V(a, s * (hw - 0.2), 0.72); o.position.copy(v); o.updateMatrix(); posts.setMatrixAt(c++, o.matrix); }
        posts.count = c; posts.frustumCulled = false;
        g.add(posts);
      }
      for (let a = b.from + 10; a < b.to - 8; a += 16) { const v = V(a, s * (hw - 0.9), 0); lamps.push([v.x, v.z]); }
    }
    // ---- piers in the lake (two, under the deck)
    for (const f of [0.34, 0.66]) {
      for (const s of [-1, 1]) {
        const v = V(b.from + L * f, s * (hw - 3), 0);
        P.cyl(g, 1.3, 1.7, 3.8, v.x, -3.0, v.z, concrete, 14);
      }
    }

    // ---- the style
    if (b.style === 'cable') {
      const apex = 42;
      for (const s of [-1, 1]) {
        const u = s * (hw + 1.6);
        // pylon: tapered column on a pier in the lake
        const pyl = V(mid, u, 0);
        P.cyl(g, 2.4, 3.2, 4.4, pyl.x, -2.4, pyl.z, concrete, 16);
        const col = new THREE.Mesh(k.geo('pylon', () => new THREE.BoxGeometry(1, 1, 1)), white);
        col.scale.set(b.axis === 'z' ? 1.7 : 2.6, apex, b.axis === 'z' ? 2.6 : 1.7);
        col.position.set(pyl.x, apex / 2, pyl.z);
        g.add(col);
        for (let i = 0; i < 5; i++) {
          const d = 6 + i * 6.2, hy = 22 + i * 3.6;
          for (const dir of [-1, 1]) beam(g, V(mid, u, hy), V(mid + dir * d, s * (hw - 0.3), 1.0), 0.09, cable);
        }
      }
      // cross beams at the top join the two pylons, a gold cap on each
      const t0 = V(mid, -(hw + 1.6), apex - 4), t1 = V(mid, hw + 1.6, apex - 4);
      beam(g, t0, t1, 0.5, white);
      for (const s of [-1, 1]) { const v = V(mid, s * (hw + 1.6), apex + 0.6); P.cyl(g, 0.1, 0.9, 1.4, v.x, v.y, v.z, gold, 8); }
    } else if (b.style === 'arch') {
      const span = L - 12, H = 15, N = 20;
      for (const s of [-1, 1]) {
        const u = s * (hw + 0.3);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= N; i++) { const q = (i / N) * 2 - 1; pts.push(V(mid + q * span / 2, u, 0.8 + H * (1 - q * q))); }
        for (let i = 0; i < N; i++) beam(g, pts[i], pts[i + 1], 0.34, white);
        for (let i = 1; i < N; i++) beam(g, pts[i], V(mid + ((i / N) * 2 - 1) * span / 2, u, 0.4), 0.07, steel); // hangers
        for (const q of [-1, 1]) { const v = V(mid + q * span / 2, u, 0.3); P.cyl(g, 0.9, 1.1, 1.2, v.x, v.y, v.z, concrete, 10); }
      }
      for (const i of [5, 8, 10, 12, 15]) {
        const q = (i / N) * 2 - 1, y = 0.8 + H * (1 - q * q);
        beam(g, V(mid + q * span / 2, -(hw + 0.3), y), V(mid + q * span / 2, hw + 0.3, y), 0.16, white);
      }
    } else if (b.style === 'stone') {
      // piers wide as the deck, lanterns on the balustrade
      for (const f of [0.17, 0.5, 0.83]) box(b.from + L * f - 1.6, b.from + L * f + 1.6, -hw, hw, -4.4, -1.0, marble);
      for (const s of [-1, 1]) {
        for (let a = b.from + 4; a < b.to; a += 12) {
          const v = V(a, s * (hw - 0.25), 1.25);
          P.cyl(g, 0.18, 0.22, 2.2, v.x, 2.3, v.z, marble, 8);
          k.sphere(g, 0.38, v.x, 3.6, v.z, P.glow(0xfff0c0, 1.1));
        }
      }
      // bold cornice below the deck edge
      for (const s of [-1, 1]) box(b.from, b.to, s * (hw - 0.4), s * (hw + 0.3), -1.5, -1.0, marble);
    } else {
      // Warren truss, curved top chord
      const N = 12, H = 12;
      const top: THREE.Vector3[][] = [[], []];
      for (const [si, s] of [-1, 1].entries()) {
        const u = s * (hw + 0.2);
        const bot: THREE.Vector3[] = [];
        for (let i = 0; i <= N; i++) {
          const q = (i / N) * 2 - 1, a = mid + q * (L - 10) / 2;
          bot.push(V(a, u, 0.5));
          top[si].push(V(a, u, 0.5 + H * (1 - q * q * 0.85)));
        }
        for (let i = 0; i < N; i++) {
          beam(g, bot[i], bot[i + 1], 0.28, steel);
          beam(g, top[si][i], top[si][i + 1], 0.32, steel);
          beam(g, top[si][i], bot[i + 1 - (i % 2)], 0.17, steel); // alternating diagonals
        }
        for (let i = 0; i <= N; i += 2) beam(g, top[si][i], bot[i], 0.17, steel);
      }
      for (let i = 2; i <= N - 2; i += 2) beam(g, top[0][i], top[1][i], 0.14, steel);
    }
  }
  return { group: g, solids, lamps };
}
