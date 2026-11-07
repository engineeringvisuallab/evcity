import * as THREE from 'three';
import { flow, spin, type AnimSet } from '../../../core/anim';
import { pipe, V } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';

type G = THREE.Object3D;

/** A mesh placed by its centre (unlike prims.box, which places by the bottom). */
export function mesh(parent: G, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
export const bx = (parent: G, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
/** vertical cylinder by its CENTRE */
export const cy = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
/** cylinder along x by its centre */
export const cx = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => {
  const m = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
};
/** cylinder along z by its centre */
export const cz = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => {
  const m = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
};
/** cone, apex up, by its centre */
export const cone = (parent: G, r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh => mesh(parent, new THREE.ConeGeometry(r, h, seg), mat, x, y, z);

/** A pipe (list of [x, y, z] points) with dots travelling along it in the flow direction. Returns the dots. */
export function fpipe(parent: G, anim: AnimSet, pts: [number, number, number][], r: number, mat: THREE.Material, color: number, speed = 3, spacing = 1.5): THREE.InstancedMesh {
  const v = pts.map((p) => V(p[0], p[1], p[2]));
  pipe(parent, v, r, mat);
  return flow(anim, parent, v, { color, speed, spacing, size: Math.min(0.32, r * 0.5 + 0.07) });
}

/** Dots only (no pipe): fabric / yarn / garments moving through a machine or along an aisle. */
export function dots(parent: G, anim: AnimSet, pts: [number, number, number][], color: number, speed = 1.5, spacing = 1.5, size = 0.2): THREE.InstancedMesh {
  return flow(anim, parent, pts.map((p) => V(p[0], p[1], p[2])), { color, speed, spacing, size });
}

/** Pipe-rack legs and a cross beam every `step` metres along a straight run at height y. */
export function rack(parent: G, mat: THREE.Material, x1: number, z1: number, x2: number, z2: number, y: number, width: number, step = 12): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / step));
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  for (let i = 0; i <= n; i++) {
    const px = x1 + ((x2 - x1) * i) / n;
    const pz = z1 + ((z2 - z1) * i) / n;
    if (alongX) {
      for (const s of [-1, 1]) bx(parent, 0.4, y, 0.4, mat, px, y / 2, pz + (s * width) / 2);
      bx(parent, 0.3, 0.3, width + 0.7, mat, px, y - 0.2, pz);
    } else {
      for (const s of [-1, 1]) bx(parent, 0.4, y, 0.4, mat, px + (s * width) / 2, y / 2, pz);
      bx(parent, width + 0.7, 0.3, 0.3, mat, px, y - 0.2, pz);
    }
  }
}

/** A small ground sign board on two posts, facing south (+z). */
export function board(parent: G, mat: THREE.Material, text: string, x: number, z: number, w = 6): void {
  const s = makeSign(text, w, 1.0);
  s.position.set(x, 1.7, z);
  parent.add(s);
  for (const dx of [-w / 2 + 0.3, w / 2 - 0.3]) bx(parent, 0.18, 2.2, 0.18, mat, x + dx, 1.1, z - 0.12);
}

export interface Item {
  x: number;
  y: number;
  z: number;
  ry?: number;
  s?: [number, number, number];
  /** per-instance colour (the material colour should be white) */
  c?: number;
}

/** Many copies of one shape as ONE draw call (benches, bobbins, bales, racks). Static. */
export function inst(parent: G, geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], name = ''): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.ry ?? 0, 0);
    o.scale.set(it.s ? it.s[0] : 1, it.s ? it.s[1] : 1, it.s ? it.s[2] : 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (it.c !== undefined) m.setColorAt(i, col.set(it.c));
  });
  m.count = items.length;
  m.instanceMatrix.needsUpdate = true;
  m.frustumCulled = false;
  if (name) m.name = name;
  parent.add(m);
  return m;
}

/** Move the copies of an instanced mesh every frame: `tweak` changes the dummy object that starts from the item's base pose. */
export function animInst(anim: AnimSet, mesh: THREE.InstancedMesh, base: Item[], tweak: (t: number, i: number, o: THREE.Object3D) => void): void {
  mesh.name = 'fx'; // moving details never cast shadows or become colliders
  const o = new THREE.Object3D();
  anim.add((t) => {
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(0, b.ry ?? 0, 0);
      o.scale.set(b.s ? b.s[0] : 1, b.s ? b.s[1] : 1, b.s ? b.s[2] : 1);
      tweak(t, i, o);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/** A turning drum / roller / reel: cylinder with two marker bars so the rotation can be SEEN. axis = the drum's own axis. */
export function drum(parent: G, anim: AnimSet, o: { r: number; len: number; mat: THREE.Material; mark: THREE.Material; x: number; y: number; z: number; axis: 'x' | 'y' | 'z'; rps: number; seg?: number }): THREE.Group {
  const holder = new THREE.Group();
  holder.position.set(o.x, o.y, o.z);
  if (o.axis === 'x') holder.rotation.z = Math.PI / 2;
  else if (o.axis === 'z') holder.rotation.x = Math.PI / 2;
  parent.add(holder);
  const pivot = new THREE.Group();
  holder.add(pivot);
  cy(pivot, o.r, o.len, o.mat, 0, 0, 0, o.seg ?? 20);
  const w = Math.max(0.05, o.r * 0.16);
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) bx(pivot, w, o.len * 1.02, w, o.mark, Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
  spin(anim, pivot, 'y', o.rps * Math.PI * 2);
  return holder;
}

/** Straight belt conveyor with items (dots) moving along it. */
export function belt(parent: G, anim: AnimSet, mat: THREE.Material, x1: number, z1: number, x2: number, z2: number, y: number, w: number, color: number, speed = 1.5, spacing = 1.4, size = 0.22): THREE.InstancedMesh {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const b = bx(parent, len, 0.18, w, mat, (x1 + x2) / 2, y, (z1 + z2) / 2);
  b.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
  const n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) bx(parent, 0.14, y, 0.14, mat, x1 + ((x2 - x1) * i) / n, y / 2, z1 + ((z2 - z1) * i) / n);
  return dots(parent, anim, [[x1, y + 0.2, z1], [x2, y + 0.2, z2]], color, speed, spacing, size);
}
