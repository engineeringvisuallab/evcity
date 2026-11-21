// All the parking around the City Mall (see ParkingSite.ts for the layout): the angled-bay lot, the entry road / start apron and the big EVLAB
// fleet lot across F4, the single row of bays in front of the mall wall and the big side lot beside the mall. Asphalt + painted bays are thin
// meshes draped over the ground (no colliders - the ground is the ground). There are NO signboards. The parked start fleet itself is placed
// by the Engine (see EVLAB_SLOTS in ParkingSite).
import * as THREE from 'three';
import { buildParkingGeometry, fleetToWorld, lotToWorld } from './ParkingSite';

export interface ParkingDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: { heightAt(x: number, z: number): number };
}

/** Accumulates draped quads (a grid in lot coordinates, every vertex sits on the ground) into one geometry. */
class DrapedBuilder {
  pos: number[] = [];
  idx: number[] = [];
  constructor(private terrain: ParkingDeps['terrain'], private lift: number, private to: (s: number, n: number) => { x: number; z: number } = lotToWorld) {}

  rect(s0: number, s1: number, n0: number, n1: number, step = 3): void {
    const ns = Math.max(1, Math.ceil((s1 - s0) / step)), nn = Math.max(1, Math.ceil((n1 - n0) / step));
    const base = this.pos.length / 3;
    for (let i = 0; i <= ns; i++) {
      for (let j = 0; j <= nn; j++) {
        const w = this.to(s0 + ((s1 - s0) * i) / ns, n0 + ((n1 - n0) * j) / nn);
        this.pos.push(w.x, this.terrain.heightAt(w.x, w.z) + this.lift, w.z);
      }
    }
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nn; j++) {
        const a = base + i * (nn + 1) + j, b = a + 1, c = a + (nn + 1), d = c + 1;
        this.idx.push(a, b, c, b, d, c); // wound so the face looks up
      }
    }
  }

  /** A closed ring (painted circle) of width w around lot point (s, n). */
  ring(s: number, n: number, r: number, w: number): void {
    const seg = 40;
    const base = this.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      for (const rr of [r - w / 2, r + w / 2]) {
        const q = this.to(s + Math.cos(a) * rr, n + Math.sin(a) * rr);
        this.pos.push(q.x, this.terrain.heightAt(q.x, q.z) + this.lift, q.z);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.idx.push(a, b, c, b, d, c);
    }
  }

  /** A straight painted line of width w from lot point (s0, n0) to (s1, n1), cut every `step` m so it follows the ground. */
  seg(s0: number, n0: number, s1: number, n1: number, w: number, step = 3): void {
    const len = Math.hypot(s1 - s0, n1 - n0) || 1;
    const ps = (-(n1 - n0) / len) * (w / 2), pn = ((s1 - s0) / len) * (w / 2);
    const k = Math.max(1, Math.ceil(len / step));
    const base = this.pos.length / 3;
    for (let i = 0; i <= k; i++) {
      const t = i / k, cs = s0 + (s1 - s0) * t, cn = n0 + (n1 - n0) * t;
      for (const sg of [-1, 1]) {
        const q = this.to(cs + ps * sg, cn + pn * sg);
        this.pos.push(q.x, this.terrain.heightAt(q.x, q.z) + this.lift, q.z);
      }
    }
    for (let i = 0; i < k; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.idx.push(a, b, c, b, d, c);
    }
  }

  build(): THREE.BufferGeometry {
    // Make every triangle wound so it faces UP. A down-wound quad is back-face culled and the whole lot is invisible from above
    // (flipping the normals below only fixes the lighting, not the culling).
    const P = this.pos, I = this.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ny = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
      if (ny < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // make sure every normal points up whatever the winding turned out to be
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    return g;
  }
}

export class ParkingLots {
  private group = new THREE.Group();
  private owned: { dispose(): void }[] = [];

  constructor(private d: ParkingDeps) {
    this.group.name = 'ParkingLots';
    const T = d.terrain;
    const asphalt = new DrapedBuilder(T, 0.06);
    const paint = new DrapedBuilder(T, 0.085);
    const kerb = new DrapedBuilder(T, 0.11);

    const L = buildParkingGeometry();
    for (const r of L.asphalt) asphalt.rect(r[0], r[1], r[2], r[3], r[4]);
    for (const r of L.kerb) kerb.rect(r[0], r[1], r[2], r[3], r[4]);
    for (const r of L.paint) paint.rect(r[0], r[1], r[2], r[3], r[4]);
    for (const l of L.lines) paint.seg(l.a[0], l.a[1], l.b[0], l.b[1], l.w);
    for (const r of L.rings) paint.ring(r.s, r.n, r.r, r.w);
    // ---- the NEW fleet parking place (fleet frame: s = lat across the row, n = back from the road): one asphalt pad, 4.5 m bays, bus + tank boxes, H pad
    {
      const F = fleetToWorld;
      const fa = new DrapedBuilder(T, 0.06, F), fp = new DrapedBuilder(T, 0.085, F), fk = new DrapedBuilder(T, 0.11, F);
      const W = 0.12;
      fa.rect(-25, 39, -8, 8, 3);
      fk.rect(-25, 39, -8, -6.6, 4); // kerb on the road side
      for (let k = 0; k < 7; k++) { const s = -22.25 + k * 4.5; fp.rect(s - W / 2, s + W / 2, -3, 3, 2.5); } // 6 bays
      fp.rect(-22.25, 4.75, 3 - W / 2, 3 + W / 2, 4);
      const box = (s0: number, s1: number, n0: number, n1: number): void => { fp.rect(s0, s1, n0, n0 + W, 4); fp.rect(s0, s1, n1 - W, n1, 4); fp.rect(s0, s0 + W, n0, n1, 4); fp.rect(s1 - W, s1, n0, n1, 4); };
      box(8 - 2.3, 8 + 2.3, -6.4, 6.4); // bus bay
      box(14.5 - 2.9, 14.5 + 2.9, -4.6, 4.6); // tank pad
      fp.ring(30, 0, 7, 0.4); // helicopter pad
      fp.rect(30 - 2.2, 30 - 1.6, -2.6, 2.6, 2); fp.rect(30 + 1.6, 30 + 2.2, -2.6, 2.6, 2); fp.rect(30 - 2.2, 30 + 2.2, -0.3, 0.3, 2); // the H
      this.add(fa.build(), 0x2d3033, -2, -2);
      this.add(fk.build(), 0x9a9ea3, -3, -3);
      this.add(fp.build(), 0xf1f1ea, -4, -4);
    }
    this.add(asphalt.build(), 0x2d3033, -2, -2);
    this.add(kerb.build(), 0x9a9ea3, -3, -3);
    this.add(paint.build(), 0xf1f1ea, -4, -4);
    d.root.add(this.group);
  }

  private add(geo: THREE.BufferGeometry, color: number, factor: number, units: number): void {
    const mat = new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.owned.push(geo, mat);
  }

  dispose(): void {
    this.d.root.remove(this.group);
    for (const o of this.owned) o.dispose();
  }
}
