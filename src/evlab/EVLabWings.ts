// EVLab: the two side wings of the ground floor. West = MAIN OFFICE (open-plan desks, reception, two glass meeting rooms),
// east = ENGINEERING LAB (benches with instruments, equipment racks, motor test rigs). Each is entered from the big lobby through its own door in the lobby wall.
// Building-local coordinates (see EVLabLayout).
import * as THREE from 'three';
import { BLD, DIVIDER, WING, type Solid } from './EVLabLayout';
import type { Parts } from './EVLabParts';
import { Furnish } from './EVLabFurniture';
import { defineFurniture } from './EVLabFurnModels';

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
  const F = new Furnish(P, g);
  defineFurniture(F, ['deskPod', 'reception8', 'meetSet44', 'cabinet', 'palm1', 'palm2', 'ficus1', 'ficus2', 'labBench', 'stool', 'rackL0', 'rackL1', 'rackL2', 'rackL3', 'bin', 'cooler', 'copier', 'extinguisher', 'firstAid', 'clock', 'sofaLeather', 'coffeeTable', 'floorLamp', 'bookshelf', 'whiteboard']);

  // ---- instancing helpers (a lot of desks / benches / chairs: a few draw calls)
  const unitBox = k.own(new THREE.BoxGeometry(1, 1, 1));
  // one list of matrices per (geometry, material) pair: the same material may be used on boxes and on cylinders
  const pending = new Map<THREE.BufferGeometry, Map<THREE.Material, THREE.Matrix4[]>>();
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const byMat = pending.get(geo) ?? new Map<THREE.Material, THREE.Matrix4[]>();
    const list = byMat.get(mat) ?? [];
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
    byMat.set(mat, list);
    pending.set(geo, byMat);
  };
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): void => put(unitBox, mat, x, y, z, w, h, d);

  // ---- shared materials
  const darkM = P.lit(null, 0x2a2f3a, 0.2);
  const whiteM = P.lit(null, 0xe8eaee, 0.4);
  const blackM = P.lit(null, 0x14161b, 0.3);
  const yellowM = P.glow(0xffd23a, 1.0, 0xd4a017);
  const glassM = k.own(new THREE.MeshLambertMaterial({ color: 0xcfeaf6, transparent: true, opacity: 0.28, emissive: 0x6fb8e0, emissiveIntensity: 0.35, depthWrite: false }));
  let pn = 0;
  const plant = (x: number, z: number): void => {
    F.place(['palm1', 'palm2', 'ficus1', 'ficus2'][pn++ & 3], x, 0, z, pn * 1.7, 1);
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
          F.place('deskPod', x, 0, z, 0);
          solids.push([x - 1.7, x + 1.7, z - 1.15, z + 1.15, 0, 1.1]);
        }
      }
      // reception counter next to the door
      F.place('reception8', -59.9, 0, 8.7, 0);
      F.place('sofaLeather', -75, 0, 11.4, Math.PI, 1); F.place('coffeeTable', -72, 0, 10.2, 0); F.place('floorLamp', -77.2, 0, 11.4, 0);
      solids.push([-64.2, -55.6, 8.1, 9.9, 0, 1.2]);
      k.sign(g, 'RECEPTION', 0xd4af37, -59.9, 2.4, 9.95, 5, 0.9, false);
      // two glass meeting rooms along the north wall (door gap in the south wall)
      for (const cx of [-81.5, -61.5]) {
        const x0 = cx - 4.5, x1 = cx + 4.5, z0 = zN, z1 = zN + 7;
        const wall = (a: number, b: number, c: number, d: number): void => { P.tbox(g, a, b, c, d, 0, 2.8, glassM); solids.push([a, b, c, d, 0, 2.8]); };
        wall(x0, cx - 1.2, z1 - 0.1, z1); wall(cx + 1.2, x1, z1 - 0.1, z1);
        wall(x0, x0 + 0.1, z0, z1); wall(x1 - 0.1, x1, z0, z1);
        P.tbox(g, x0, x1, z1 - 0.12, z1 + 0.02, 2.8, 2.9, gold);
        F.place('meetSet44', cx, 0, z0 + 3.2, 0);
        solids.push([cx - 2.2, cx + 2.2, z0 + 2.4, z0 + 4.0, 0, 0.85]);
        box(whiteM, cx, 2.0, z0 + 0.1, 3.6, 1.2, 0.05); // whiteboard
      }
      // filing cabinets along the outer wall
      for (let i = 0; i < 8; i++) {
        const z = -44 + i * 4.4;
        for (let j = -2; j <= 1; j++) F.place('cabinet', -86.3, 0, z + j * 0.55 + 0.27, Math.PI / 2);
        solids.push([-86.8, -85.6, z - 1.2, z + 1.2, 0, 1.4]);
      }
      for (const [x, z] of [[-85, 11], [-57, -46], [-85, -46], [-57, 11]]) plant(x, z);
    } else {
      // ---- engineering lab: six rows of two long benches with instruments and stools
      for (const x of [62.5, 80]) {
        for (const z of [-44, -36, -28, -20, -12, -4]) {
          for (const dx of [-3.3, 0, 3.3]) { F.place('labBench', x + dx, 0, z, 0); F.place('stool', x + dx, 0, z + 1.1, 0); }
          solids.push([x - 5.1, x + 5.1, z - 1.0, z + 1.0, 0, 1.2]);
        }
      }
      // equipment racks along the north wall, with status lights
      for (let i = 0; i < 10; i++) {
        const x = 58 + i * 2.9;
        for (let j = -1; j <= 1; j++) F.place('rackL' + ((i + j + 1) & 3), x + j * 0.92, 0, zN + 0.55, 0);
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

  F.flush();
  // ---- flush the instanced pieces: one InstancedMesh per material
  for (const [geo, byMat] of pending) {
    for (const [mat, list] of byMat) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.frustumCulled = false;
      g.add(im);
    }
  }

  return { group: g, solids, update: (tt) => anim.forEach((f) => f(tt)) };
}
