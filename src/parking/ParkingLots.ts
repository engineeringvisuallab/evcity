// The two parking lots across the F4 road from the City Mall's west door: MALL PARKING (straight opposite the door) and EVLAB PARKING (next
// lot along the road, beside the EVLAB fence). Asphalt + painted bays are thin meshes draped over the ground (no colliders - the ground is the ground),
// each lot has a signboard facing the road. The parked start fleet itself is placed by the Engine (see EVLAB_SLOTS in ParkingSite).
import * as THREE from 'three';
import { Kit } from '../structures/StructureKit';
import { EVLAB_LOT, EVLAB_ROW_A_LINES, EVLAB_SLOTS, MALL_LOT, lotToWorld, type LotRect } from './ParkingSite';

export interface ParkingDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: { heightAt(x: number, z: number): number };
}

/** Accumulates draped quads (a grid in lot coordinates, every vertex sits on the ground) into one geometry. */
class DrapedBuilder {
  pos: number[] = [];
  idx: number[] = [];
  constructor(private terrain: ParkingDeps['terrain'], private lift: number) {}

  rect(s0: number, s1: number, n0: number, n1: number, step = 3): void {
    const ns = Math.max(1, Math.ceil((s1 - s0) / step)), nn = Math.max(1, Math.ceil((n1 - n0) / step));
    const base = this.pos.length / 3;
    for (let i = 0; i <= ns; i++) {
      for (let j = 0; j <= nn; j++) {
        const w = lotToWorld(s0 + ((s1 - s0) * i) / ns, n0 + ((n1 - n0) * j) / nn);
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
        const q = lotToWorld(s + Math.cos(a) * rr, n + Math.sin(a) * rr);
        this.pos.push(q.x, this.terrain.heightAt(q.x, q.z) + this.lift, q.z);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.idx.push(a, b, c, b, d, c);
    }
  }

  build(): THREE.BufferGeometry {
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
  private kit = new Kit();
  private owned: { dispose(): void }[] = [];

  constructor(private d: ParkingDeps) {
    this.group.name = 'ParkingLots';
    const T = d.terrain;
    const asphalt = new DrapedBuilder(T, 0.06);
    const paint = new DrapedBuilder(T, 0.085);
    const kerb = new DrapedBuilder(T, 0.11);

    for (const lot of [MALL_LOT, EVLAB_LOT]) {
      asphalt.rect(lot.s0, lot.s1, lot.n0, lot.n1);
      // light concrete strip along the road side (kerb + walkway), and a white edge line round the lot
      kerb.rect(lot.s0, lot.s1, lot.n0, lot.n0 + 1.4, 4);
      this.edgeLines(paint, lot);
    }
    // MALL LOT: three rows of nose-in bays (A on the road side, B and C back to back), a drive aisle between A and B
    for (let s = MALL_LOT.s0 + 2; s <= MALL_LOT.s1 - 2 + 0.01; s += 2.9) {
      paint.rect(s - 0.06, s + 0.06, 14.6, 20, 2.5);
      paint.rect(s - 0.06, s + 0.06, 28, 39, 4);
    }
    paint.rect(MALL_LOT.s0 + 2, MALL_LOT.s1 - 2, 19.94, 20.06, 4);
    paint.rect(MALL_LOT.s0 + 2, MALL_LOT.s1 - 2, 27.94, 28.06, 4);
    paint.rect(MALL_LOT.s0 + 2, MALL_LOT.s1 - 2, 33.44, 33.56, 4);
    // EVLAB LOT: row A = five 4 m bays for the road vehicles, row B = bus bay (along the road), tank pad, helicopter pad
    for (const s of EVLAB_ROW_A_LINES) paint.rect(s - 0.07, s + 0.07, 14.2, 20.2, 2.5);
    paint.rect(EVLAB_ROW_A_LINES[0], EVLAB_ROW_A_LINES[EVLAB_ROW_A_LINES.length - 1], 20.13, 20.27, 4);
    const bus = EVLAB_SLOTS.bus;
    this.outline(paint, bus.s - 6.4, bus.s + 6.4, bus.n - 2.3, bus.n + 2.3);
    const tank = EVLAB_SLOTS.tank;
    this.outline(paint, tank.s - 2.9, tank.s + 2.9, tank.n - 4.6, tank.n + 4.6);
    const h = EVLAB_SLOTS.heli;
    paint.ring(h.s, h.n, 7, 0.4);
    paint.rect(h.s - 2.2, h.s - 1.6, h.n - 2.6, h.n + 2.6, 2); // the H
    paint.rect(h.s + 1.6, h.s + 2.2, h.n - 2.6, h.n + 2.6, 2);
    paint.rect(h.s - 2.2, h.s + 2.2, h.n - 0.3, h.n + 0.3, 2);

    this.add(asphalt.build(), 0x2d3033, -2, -2);
    this.add(kerb.build(), 0x9a9ea3, -3, -3);
    this.add(paint.build(), 0xf1f1ea, -4, -4);

    this.signboard(MALL_LOT, 'MALL PARKING', 0x3a9be8);
    this.signboard(EVLAB_LOT, 'EVLAB PARKING', 0x3ccf8e);
    d.root.add(this.group);
  }

  private edgeLines(b: DrapedBuilder, l: LotRect): void {
    const w = 0.12, i = 0.6;
    b.rect(l.s0 + i, l.s1 - i, l.n1 - i - w, l.n1 - i, 4);
    b.rect(l.s0 + i, l.s0 + i + w, l.n0 + 1.6, l.n1 - i, 4);
    b.rect(l.s1 - i - w, l.s1 - i, l.n0 + 1.6, l.n1 - i, 4);
  }

  private outline(b: DrapedBuilder, s0: number, s1: number, n0: number, n1: number): void {
    const w = 0.12;
    b.rect(s0, s1, n0, n0 + w, 4);
    b.rect(s0, s1, n1 - w, n1, 4);
    b.rect(s0, s0 + w, n0, n1, 4);
    b.rect(s1 - w, s1, n0, n1, 4);
  }

  private add(geo: THREE.BufferGeometry, color: number, factor: number, units: number): void {
    const mat = new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.owned.push(geo, mat);
  }

  /** Signboard on two posts at the road side of the lot, facing the road (both faces readable). */
  private signboard(l: LotRect, text: string, color: number): void {
    const mid = (l.s0 + l.s1) / 2;
    const c = lotToWorld(mid, l.n0 + 0.7);
    const ground = this.d.terrain.heightAt(c.x, c.z);
    const post = new THREE.MeshLambertMaterial({ color: 0x555b61 });
    const pg = new THREE.BoxGeometry(0.25, 4.6, 0.25);
    this.owned.push(post, pg);
    for (const off of [-3.6, 3.6]) {
      const p = lotToWorld(mid + off, l.n0 + 0.7);
      const m = new THREE.Mesh(pg, post);
      m.position.set(p.x, this.d.terrain.heightAt(p.x, p.z) + 2.3, p.z);
      this.group.add(m);
    }
    const sg = new THREE.Group();
    sg.position.set(c.x, ground + 4.4, c.z);
    // the board's face normal (+z) must point across F4: along the lot's n axis
    const a = lotToWorld(mid, l.n0 + 1.7), b = lotToWorld(mid, l.n0 + 0.7);
    sg.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    this.kit.sign(sg, text, color, 0, 0, 0, 9, 2.2);
    this.group.add(sg);
  }

  dispose(): void {
    this.d.root.remove(this.group);
    for (const o of this.owned) o.dispose();
    this.kit.dispose();
  }
}
