import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import { plume as plumeFx } from '../../../core/anim';
import type { Ctx, TMats } from './ctx';
import { DOT, DYE_COLORS } from './ctx';
import { L } from '../layout';
import { animInst, board, bx, cx, dots, inst, type Item } from './helpers';

const ROWS = [13, 20, 27, 34, 41];
const SEW_X0 = -64;
const SEW_PITCH = 4.8;
const PER_ROW = 10;

/** A forklift (forks point to local +z). */
function forklift(parent: THREE.Object3D, t: TMats): THREE.Group {
  const f = new THREE.Group();
  bx(f, 1.4, 1.0, 2.2, t.paintYellow, 0, 0.7, 0);
  bx(f, 1.2, 1.0, 1.0, t.steelDark, 0, 1.7, -0.3);
  bx(f, 0.1, 2.8, 0.1, t.steelDark, -0.4, 1.4, 1.3);
  bx(f, 0.1, 2.8, 0.1, t.steelDark, 0.4, 1.4, 1.3);
  bx(f, 0.9, 0.1, 1.0, t.steelDark, 0, 0.3, 1.8);
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.8, 0.8]) bx(f, 0.3, 0.5, 0.5, t.rubber, dx, 0.3, dz);
  parent.add(f);
  return f;
}

/** A container truck; the cab is on the +z side, the container doors on the -z end. */
function truck(parent: THREE.Object3D, t: TMats, cab: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  bx(g, 2.6, 2.8, 9, t.white, 0, 2.3, -4);
  bx(g, 2.2, 0.4, 11, t.steelDark, 0, 0.7, -3);
  bx(g, 2.5, 2.4, 2.4, cab, 0, 1.9, 1.6);
  bx(g, 2.2, 1.0, 0.1, t.glass, 0, 2.5, 2.82);
  for (const z of [-7, -5.8, -4.6, 1.2]) for (const dx of [-1.2, 1.2]) cx(g, 0.5, 0.35, t.rubber, dx, 0.5, z, 14);
  parent.add(g);
  return g;
}

/** Garments factory (open to the south): cutting (rolls, spreading table, CNC cutter), 5 sewing lines x 10 stations, finishing and packing; finished-goods store with racks, forklift, loading dock, trucks and rooftop solar. */
export function buildGarments({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'garments';
  const G = L.garments;
  building(g, m, { x: G.x, z: G.z, w: G.w, d: G.d, h: G.h, open: 'S', door: 'N' });
  for (const x of [-88, -60, -30, -4]) bx(g, 0.7, 0.28, 0.05, t.ledGreen, x, 4.5, 5.3); // fire exit signs

  // ---- cutting section (west)
  const rolls: Item[] = [];
  for (let lv = 0; lv < 2; lv++) for (let i = 0; i < 11; i++) rolls.push({ x: -92 + i * 1.8, y: 0.7 + lv * 1.5, z: 7, c: DYE_COLORS[(i + lv * 3) % DYE_COLORS.length] });
  const rollGeo = new THREE.CylinderGeometry(0.34, 0.34, 1.6, 14);
  rollGeo.rotateX(Math.PI / 2);
  inst(g, rollGeo, t.white, rolls);
  bx(g, 20, 0.12, 0.12, t.steelDark, -83, 1.4, 6.2);
  for (const x of [-93, -83, -73]) bx(g, 0.15, 2.4, 1.2, t.steelDark, x, 1.2, 7);
  // spreading table: the carriage lays the fabric layer upon layer
  bx(g, 20, 0.15, 2.2, t.table, -82, 0.85, 14);
  for (const x of [-91, -82, -73]) bx(g, 0.2, 0.8, 1.9, t.steelDark, x, 0.4, 14);
  bx(g, 19.6, 0.35, 1.9, t.fabricBlue, -82, 1.1, 14);
  const carriage = new THREE.Group();
  bx(carriage, 1.2, 0.5, 2.8, t.paintYellow, 0, 1.5, 0);
  bx(carriage, 0.8, 0.8, 0.8, t.fabricBlue, 0, 2.1, 0);
  carriage.position.z = 14;
  g.add(carriage);
  // CNC cutter: the bridge slides along the table, the head slides across the bridge, the knife follows the pattern from the computer
  bx(g, 14, 0.2, 3.4, t.table, -80, 0.85, 22);
  for (const x of [-86, -80, -74]) bx(g, 0.2, 0.8, 3.0, t.steelDark, x, 0.4, 22);
  bx(g, 13.6, 0.4, 3.0, t.fabricBlue, -80, 1.1, 22);
  const bridge = new THREE.Group();
  bx(bridge, 0.5, 0.2, 4.2, t.paintGrey, 0, 2.3, 0);
  for (const dz of [-2.1, 2.1]) bx(bridge, 0.5, 2.0, 0.3, t.paintGrey, 0, 1.2, dz);
  const head = bx(bridge, 0.7, 0.7, 0.7, t.paintRed, 0, 1.9, 0);
  bridge.position.z = 22;
  g.add(bridge);
  bx(g, 1.4, 1.1, 1.0, t.paintBlue, -69.5, 0.55, 22); // cutter control cabinet with the computer
  bx(g, 0.9, 0.5, 0.06, t.screenOff, -69.5, 1.45, 21.5);
  anim.add((tt) => {
    carriage.position.x = -82 + Math.sin(tt * 0.5) * 8.5;
    bridge.position.x = -80 + Math.sin(tt * 0.35) * 6;
    head.position.z = Math.sin(tt * 0.9) * 1.3;
  });
  const bundles: Item[] = [];
  for (let i = 0; i < 8; i++) bundles.push({ x: -72 + (i % 4) * 0.9, y: 0.6 + Math.floor(i / 4) * 0.35, z: 30, c: DYE_COLORS[i % 3] });
  bx(g, 4.2, 0.5, 1.8, t.steelDark, -70.5, 0.25, 30);
  inst(g, new THREE.BoxGeometry(0.7, 0.3, 0.5), t.white, bundles);

  // ---- sewing hall: 5 lines x 10 stations. Per station: table, machine with a bobbing needle, chair, operator, a bundle of cut pieces
  const tops: Item[] = [];
  const legs: Item[] = [];
  const heads: Item[] = [];
  const needles: Item[] = [];
  const chairs: Item[] = [];
  const torsos: Item[] = [];
  const faces: Item[] = [];
  const stack: Item[] = [];
  const uni = [0x2c6e49, 0xb5382c, 0x2e5c8a, 0xe0b020, 0x8e44ad, 0x16a39a];
  ROWS.forEach((z, r) => {
    for (let i = 0; i < PER_ROW; i++) {
      const x = SEW_X0 + i * SEW_PITCH;
      tops.push({ x, y: 0.78, z });
      legs.push({ x: x - 0.68, y: 0.39, z }, { x: x + 0.68, y: 0.39, z });
      heads.push({ x: x + 0.1, y: 0.98, z });
      needles.push({ x: x + 0.28, y: 1.2, z });
      chairs.push({ x, y: 0.45, z: z + 0.85 });
      torsos.push({ x, y: 0.88, z: z + 0.85, c: uni[(r + i) % uni.length] });
      faces.push({ x, y: 1.34, z: z + 0.85 });
      stack.push({ x: x - 0.45, y: 0.86, z, c: DYE_COLORS[(i + r) % 3] });
    }
    // hourly target board at the end of each line + the bundles moving along the aisle
    bx(g, 2.2, 0.55, 0.1, t.screenOff, -17, 4.2, z);
    bx(g, 1.2, 0.2, 0.12, t.ledGreen, -17.4, 4.2, z + 0.06);
    bx(g, 0.05, 3.0, 0.05, t.steelDark, -17, 5.7, z);
    if (r < ROWS.length - 1) dots(g, anim, [[SEW_X0 - 1, 1.15, z + 3.6], [-18, 1.15, z + 3.6]], DOT.garment, 1.1, 2.6, 0.26);
  });
  inst(g, new THREE.BoxGeometry(1.5, 0.06, 0.9), t.table, tops);
  inst(g, new THREE.BoxGeometry(0.06, 0.78, 0.8), t.steelDark, legs);
  inst(g, new THREE.BoxGeometry(0.5, 0.32, 0.28), t.alu, heads);
  animInst(anim, inst(g, new THREE.BoxGeometry(0.03, 0.32, 0.03), t.steel, needles), needles, (tt, i, o) => {
    o.position.y += Math.sin(tt * 30 + i * 2.1) * 0.07;
  });
  inst(g, new THREE.BoxGeometry(0.45, 0.05, 0.45), t.chair, chairs);
  inst(g, new THREE.CylinderGeometry(0.2, 0.2, 0.62, 10), t.uniform, torsos);
  inst(g, new THREE.SphereGeometry(0.13, 10, 8), t.skin, faces);
  inst(g, new THREE.BoxGeometry(0.4, 0.1, 0.3), t.white, stack);

  // ---- finishing (east end): trimming + quality table, steam ironing, needle detector on the conveyor, folding, packing into cartons
  bx(g, 3, 0.08, 1.2, t.table, -9, 0.85, 10);
  bx(g, 2.6, 0.06, 0.4, t.white, -9, 2.2, 10);
  for (const z of [16, 38]) {
    bx(g, 2.4, 0.9, 1.1, t.paintGrey, -9, 0.45, z);
    bx(g, 0.5, 0.2, 0.3, t.paintRed, -8.4, 1.0, z);
    plumeFx(anim, g, -8.4, 1.1, z, { count: 3, rise: 1.8, life: 2.2, size0: 0.25, size1: 0.9, windX: 0.3, windZ: 0, spread: 0.3, opacity: 0.35, color: 0xffffff });
  }
  bx(g, 3, 0.08, 1.4, t.table, -9, 0.85, 22);
  bx(g, 3, 0.08, 1.4, t.table, -9, 0.85, 30);
  // carton conveyor to the store (through the east wall), with the needle-detector tunnel
  const cz = 26;
  bx(g, 24, 0.18, 1.2, t.steelDark, 5, 0.9, cz);
  for (let x = -6; x <= 16; x += 4) bx(g, 0.14, 0.9, 0.14, t.steelDark, x, 0.45, cz);
  bx(g, 1.6, 1.5, 1.8, t.paintBlue, -2, 1.7, cz);
  bx(g, 1.2, 0.9, 1.9, t.screenOff, -2, 1.55, cz);
  bx(g, 0.2, 0.2, 0.05, t.ledGreen, -2, 2.6, cz + 0.95);
  const cartons: Item[] = [];
  for (let i = 0; i < 7; i++) cartons.push({ x: -6, y: 1.3, z: cz, c: i % 2 ? 0xc59a63 : 0xb98a52 });
  animInst(anim, inst(g, new THREE.BoxGeometry(0.8, 0.6, 0.6), t.carton, cartons), cartons, (tt, i, o) => {
    o.position.x = -6 + ((tt * 1.6 + i * 3.4) % 24);
  });

  // ---- finished-goods store: pallet racks with cartons, forklift on the aisle
  const S = L.store;
  building(g, m, { x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, open: 'S', door: 'N' });
  const ups: Item[] = [];
  const stock: Item[] = [];
  for (const rz of [12, 24]) {
    for (let i = 0; i <= 11; i++) {
      const x = 19.5 + i * 3;
      ups.push({ x, y: 2.25, z: rz - 0.7 }, { x, y: 2.25, z: rz + 0.7 });
      if (i < 11) {
        for (let lv = 0; lv < 3; lv++) {
          if ((i * 5 + lv * 3 + rz) % 7 === 0) continue;
          stock.push({ x: x + 1.5, y: 0.75 + lv * 1.5, z: rz, c: (i + lv) % 2 ? 0xc59a63 : 0xb98a52 });
        }
      }
    }
    for (let lv = 0; lv < 3; lv++) for (const dz of [-0.7, 0.7]) bx(g, 33, 0.12, 0.1, t.paintBlue, S.x - 1.5, 0.15 + lv * 1.5, rz + dz);
  }
  inst(g, new THREE.BoxGeometry(0.1, 4.5, 0.1), t.paintBlue, ups);
  inst(g, new THREE.BoxGeometry(2.6, 1.0, 1.0), t.carton, stock);
  const fk = forklift(g, t);
  anim.add((tt) => {
    const k = (Math.sin(tt * 0.3) + 1) / 2;
    fk.position.set(21 + 28 * k, 0, 18);
    fk.rotation.y = Math.cos(tt * 0.3) > 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  // ---- loading dock: raised platform, dock levelers, two trucks backed up to it, and a delivery truck driving along the spine road
  bx(g, 36, 1.2, 2.3, m.concreteDark, 35, 0.6, 44.2);
  for (const x of [24, 35, 46]) {
    bx(g, 2.4, 0.1, 1.0, t.paintYellow, x, 1.25, 45.5);
    for (const dx of [-1.4, 1.4]) bx(g, 0.3, 0.5, 0.3, t.rubber, x + dx, 0.7, 45.5);
  }
  for (const x of [24, 46]) {
    const tr = truck(g, t, x === 24 ? t.paintBlue : t.paintRed);
    tr.position.set(x, 0, 54.9);
  }
  const mover = truck(g, t, t.paintGreen);
  mover.rotation.y = Math.PI / 2;
  anim.add((tt) => {
    mover.position.set(-140 + ((tt * 6) % 280), 0, 64);
  });

  // ---- rooftop solar on the store: 98 panels
  const panels: Item[] = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 14; c++) panels.push({ x: 17.6 + c * 2.7, y: 8.45, z: 8 + r * 4.9 });
  inst(g, new THREE.BoxGeometry(2.3, 0.06, 1.2), t.panel, panels);

  board(g, t.steelDark, 'Garments Factory', G.x, 52, 12);
  board(g, t.steelDark, 'Finished Goods Store & Dock', S.x, 52, 5.5);
  return { id: 'garments', nameBn: 'Garments Factory & Store', group: g };
}
