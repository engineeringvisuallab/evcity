// EVLab: the two side wings of the ground floor. West = MAIN OFFICE (open-plan desks, reception, two glass meeting rooms),
// east = ENGINEERING LAB (benches with instruments, equipment racks, motor test rigs). Each is entered from the big lobby through its own door in the lobby wall.
// Building-local coordinates (see EVLabLayout).
import * as THREE from 'three';
import { BLD, DIVIDER, WING, type Solid } from './EVLabLayout';
import type { Parts } from './EVLabParts';

export interface WingsBuild {
  group: THREE.Group;
  solids: Solid[];
  update(t: number): void;
}

const H = BLD.H;

export function buildWings(P: Parts): WingsBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabWings';
  const solids: Solid[] = [];
  const anim: Array<(tt: number) => void> = [];
  const zN = -BLD.hz + 1; // inner face of the north wall
  const zd0 = DIVIDER.z - 0.5, zd1 = DIVIDER.z + 0.5; // the lobby wall (13.5 .. 14.5)
  const stone = P.lit(t.stone, 0xffffff, 0.2);
  const gold = P.gold();
  const cove = P.glow(0xffe2a8, 1.1);
  const ceilMat = P.lit(t.ceiling, 0xffffff, 0.45);

  // ---- instancing helpers (a lot of desks / benches / chairs: a few draw calls)
  const unitBox = k.own(new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = k.own(new THREE.CylinderGeometry(1, 1, 1, 14));
  const pending = new Map<THREE.Material, { geo: THREE.BufferGeometry; list: THREE.Matrix4[] }>();
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const key = mat;
    const e = pending.get(key) ?? { geo, list: [] };
    if (e.geo !== geo) throw new Error('one geometry per material in put()');
    e.list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
    pending.set(key, e);
  };
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): void => put(unitBox, mat, x, y, z, w, h, d);
  const cyl = (mat: THREE.Material, x: number, y: number, z: number, r: number, h: number): void => put(unitCyl, mat, x, y, z, r, h, r);

  // ---- shared materials
  const deskWood = P.lit(t.wood, 0xffffff, 0.3);
  const darkM = P.lit(null, 0x2a2f3a, 0.2);
  const chairM = P.lit(null, 0x23364f, 0.3);
  const whiteM = P.lit(null, 0xe8eaee, 0.4);
  const blackM = P.lit(null, 0x14161b, 0.3);
  const screenM = P.glow(0x7fb7ff, 0.9, 0x3a6fb0);
  const greenM = P.glow(0x58f0a0, 1.0, 0x20a060);
  const amberM = P.glow(0xffc04a, 1.0, 0xd48a20);
  const yellowM = P.glow(0xffd23a, 1.0, 0xd4a017);
  const glassM = k.own(new THREE.MeshLambertMaterial({ color: 0xcfeaf6, transparent: true, opacity: 0.28, emissive: 0x6fb8e0, emissiveIntensity: 0.35, depthWrite: false }));
  const leafMat = P.lit(null, 0x2f8a46, 0.3);
  const potMat = P.lit(null, 0x1a1a1f, 0.1);
  const plant = (x: number, z: number): void => {
    k.cyl(g, 0.6, 0.5, 0.9, x, 0.45, z, potMat, 12);
    for (let i = 0; i < 4; i++) { const l = k.sphere(g, 0.85, x + Math.sin(i * 1.9) * 0.3, 1.6 + i * 0.3, z + Math.cos(i * 1.9) * 0.3, leafMat); l.scale.set(0.9 - i * 0.1, 0.7, 0.9 - i * 0.1); }
    solids.push([x - 0.7, x + 0.7, z - 0.7, z + 0.7, 0, 2.2]);
  };

  for (const s of [-1, 1] as const) {
    const xa = s < 0 ? -WING.x1 : WING.x0, xb = s < 0 ? -WING.x0 : WING.x1;
    const office = s < 0;
    const dc = s * WING.door.c, d0 = dc - WING.door.halfW, d1 = dc + WING.door.halfW;
    const floorM = office ? P.lit(t.carpet, 0xb9c4d6, 0.2) : P.lit(null, 0x7d8590, 0.5);
    const lining = office ? P.lit(t.wood, 0xffffff, 0.34) : P.lit(null, 0xd9dde3, 0.2);

    // ---- floor, ceiling, wall linings, ceiling light strips
    P.hplane(g, xa, xb, zN, zd0, 0.004, floorM, 4, 4);
    P.hplane(g, xa, xb, zN, zd0, H, ceilMat, 6, 6, false);
    P.vplane(g, 'x', s < 0 ? -WING.x1 + 0.03 : WING.x1 - 0.03, zN, zd0, 0, H, s < 0 ? 1 : -1, lining, 7, 8);
    P.vplane(g, 'z', zN + 0.03, xa, xb, 0, H, 1, lining, 7, 8);
    for (let z = zN + 6; z < zd0 - 2; z += 9) P.tbox(g, xa + 1.5, xb - 1.5, z, z + 0.5, H - 0.2, H - 0.1, cove);

    // ---- the lobby wall with the door (stone, gold frame)
    for (const [a, b] of [[xa, d0], [d1, xb]] as const) { P.tbox(g, a, b, zd0, zd1, 0, H, stone, 8, 8); solids.push([a, b, zd0, zd1, 0, H]); }
    P.tbox(g, d0, d1, zd0, zd1, WING.door.h, H, stone, 8, 8);
    solids.push([d0, d1, zd0, zd1, WING.door.h, H]);
    for (const x of [d0 - 0.25, d1]) P.tbox(g, x, x + 0.25, zd0 - 0.1, zd1 + 0.1, 0, WING.door.h, gold);
    P.tbox(g, d0 - 0.25, d1 + 0.25, zd0 - 0.1, zd1 + 0.1, WING.door.h, WING.door.h + 0.3, gold);
    // a green exit light over the door (inside) and the name of the room on the north wall
    P.tbox(g, dc - 0.6, dc + 0.6, zd0 - 0.14, zd0 - 0.04, WING.door.h - 0.5, WING.door.h - 0.2, P.glow(0x40ff80, 1.4, 0x208040));
    k.sign(g, office ? 'MAIN OFFICE' : 'ENGINEERING LAB', 0xd4af37, dc, 9.5, zN + 0.15, 16, 2.2, true);

    if (office) {
      // ---- open-plan office: 4 columns x 6 rows of desks, a clear aisle from the door to the back
      for (const x of [-83, -78, -65, -60]) {
        for (const z of [-42, -35.5, -29, -22.5, -16, -9.5]) {
          box(deskWood, x, 0.75, z, 3.4, 0.07, 1.7);
          box(darkM, x, 0.37, z - 0.78, 3.2, 0.72, 0.08);
          box(darkM, x, 1.1, z - 0.4, 0.15, 0.3, 0.12); // monitor stand
          box(screenM, x, 1.38, z - 0.45, 0.95, 0.5, 0.05);
          box(chairM, x, 0.48, z + 1.25, 0.55, 0.08, 0.55);
          box(chairM, x, 0.82, z + 1.55, 0.55, 0.6, 0.08);
          cyl(darkM, x, 0.22, z + 1.25, 0.06, 0.44);
          solids.push([x - 1.7, x + 1.7, z - 0.85, z + 0.85, 0, 1.1]);
        }
      }
      // reception counter next to the door
      P.tbox(g, -64, -55.8, 8.3, 9.7, 0, 1.1, P.lit(t.marbleDark, 0xffffff, 0.3), 4, 4);
      P.tbox(g, -64.2, -55.6, 8.1, 9.9, 1.1, 1.2, gold);
      solids.push([-64.2, -55.6, 8.1, 9.9, 0, 1.2]);
      k.sign(g, 'RECEPTION', 0xd4af37, -59.9, 2.4, 9.95, 5, 0.9, false);
      // two glass meeting rooms along the north wall (door gap in the south wall)
      for (const cx of [-81.5, -61.5]) {
        const x0 = cx - 4.5, x1 = cx + 4.5, z0 = zN, z1 = zN + 7;
        const wall = (a: number, b: number, c: number, d: number): void => { P.tbox(g, a, b, c, d, 0, 2.8, glassM); solids.push([a, b, c, d, 0, 2.8]); };
        wall(x0, cx - 1.2, z1 - 0.1, z1); wall(cx + 1.2, x1, z1 - 0.1, z1);
        wall(x0, x0 + 0.1, z0, z1); wall(x1 - 0.1, x1, z0, z1);
        P.tbox(g, x0, x1, z1 - 0.12, z1 + 0.02, 2.8, 2.9, gold);
        box(deskWood, cx, 0.75, z0 + 3.2, 4.4, 0.08, 1.6);
        box(darkM, cx, 0.37, z0 + 3.2, 0.5, 0.7, 0.5);
        solids.push([cx - 2.2, cx + 2.2, z0 + 2.4, z0 + 4.0, 0, 0.85]);
        for (const dx of [-1.6, -0.5, 0.6, 1.7]) for (const dz of [-1.0, 1.0]) box(chairM, cx + dx, 0.48, z0 + 3.2 + dz, 0.5, 0.08, 0.5);
        box(whiteM, cx, 2.0, z0 + 0.1, 3.6, 1.2, 0.05); // whiteboard
      }
      // filing cabinets along the outer wall
      for (let i = 0; i < 8; i++) {
        const z = -44 + i * 4.4;
        box(darkM, -86.1, 0.95, z, 1.2, 1.9, 2.4);
        box(amberM, -85.48, 1.2, z, 0.03, 0.12, 1.8);
        solids.push([-86.8, -85.5, z - 1.2, z + 1.2, 0, 1.9]);
      }
      for (const [x, z] of [[-85, 11], [-57, -46], [-85, -46], [-57, 11]]) plant(x, z);
    } else {
      // ---- engineering lab: six rows of two long benches with instruments and stools
      for (const x of [62.5, 80]) {
        for (const z of [-44, -36, -28, -20, -12, -4]) {
          box(darkM, x, 0.45, z, 10, 0.9, 1.8);
          box(whiteM, x, 0.94, z, 10.2, 0.08, 2.0);
          for (const dx of [-3.3, 0, 3.3]) {
            box(blackM, x + dx, 1.2, z - 0.35, 1.1, 0.45, 0.7);
            box(dx === 0 ? greenM : screenM, x + dx, 1.25, z - 0.0, 0.8, 0.28, 0.03);
          }
          for (const dx of [-3, 0, 3]) cyl(chairM, x + dx, 0.32, z + 1.7, 0.26, 0.64);
          solids.push([x - 5.1, x + 5.1, z - 1.0, z + 1.0, 0, 1.2]);
        }
      }
      // equipment racks along the north wall, with status lights
      for (let i = 0; i < 10; i++) {
        const x = 58 + i * 2.9;
        box(darkM, x, 1.3, zN + 0.7, 2.4, 2.6, 1.2);
        for (let j = 0; j < 4; j++) box(j % 2 ? greenM : amberM, x, 0.6 + j * 0.55, zN + 1.32, 1.9, 0.08, 0.03);
        solids.push([x - 1.2, x + 1.2, zN, zN + 1.3, 0, 2.6]);
      }
      // two motor test rigs near the door (the rotor spins)
      for (const x of [62.5, 80]) {
        P.tbox(g, x - 3, x + 3, 3.5, 6.5, 0, 0.4, darkM);
        P.cyl(g, 0.35, 0.35, 1.3, x, 1.05, 5, P.lit(null, 0x9aa3b0, 0.6), 12);
        const rotor = P.cyl(g, 1.1, 1.1, 0.18, x, 1.8, 5, gold, 24);
        P.tbox(g, x - 1.4, x + 1.4, 3.7, 4.0, 0.4, 1.3, blackM);
        anim.push((tt) => { rotor.rotation.y = tt * 6; });
        solids.push([x - 3, x + 3, 3.5, 6.5, 0, 1.4]);
      }
      // yellow safety lines along the aisle
      for (const x of [67.55, 75.0]) P.tbox(g, x, x + 0.2, zN + 3, zd0 - 1, 0, 0.02, yellowM);
      for (const [x, z] of [[85.5, 11], [57, 11], [85.5, -46]]) plant(x, z);
    }
  }

  // ---- flush the instanced pieces: one InstancedMesh per material
  for (const [mat, e] of pending) {
    const im = new THREE.InstancedMesh(e.geo, mat, e.list.length);
    e.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.frustumCulled = false;
    g.add(im);
  }

  return { group: g, solids, update: (tt) => anim.forEach((f) => f(tt)) };
}
