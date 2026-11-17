import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { animInst, belt, board, bx, cy, drum, fpipe, inst, type Item } from './helpers';

const CARD_X = [-64, -56, -48, -40, -32];

/** Spinning mill (open to the south): blowroom (opener, mixer, cleaner), 5 carding machines, drawing and roving frames, 2 ring frames with 128 spindles. */
export function buildSpinning({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'spinning';
  const S = L.spin;
  building(g, m, { x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, open: 'S', door: 'N' });

  // ---- blowroom (z = -72): opener -> mixer -> cleaner; the cotton travels on in an air duct to the cards
  const bz = -72;
  bx(g, 4, 2, 2.4, t.paintGrey, -90, 1, bz);
  bx(g, 3, 1, 2.0, t.steelDark, -90, 2.5, bz);
  const apron = bx(g, 3.2, 0.12, 1.6, t.steelDark, -92.8, 1.3, bz);
  apron.rotation.z = 0.35;
  bx(g, 3.4, 2.6, 2.6, t.paintBlue, -80, 1.3, bz);
  bx(g, 3.0, 1.4, 0.08, t.glass, -80, 1.5, bz + 1.34);
  bx(g, 4, 0.5, 2.4, t.steelDark, -70, 0.25, bz);
  for (const dz of [-1.2, 1.2]) bx(g, 4, 2.2, 0.15, t.paintGrey, -70, 1.4, bz + dz);
  drum(g, anim, { r: 0.7, len: 2.2, mat: t.steel, mark: t.paintRed, x: -70, y: 1.5, z: bz, axis: 'z', rps: 3 });
  bx(g, 1.4, 1.2, 1.4, t.paintYellow, -75, 0.6, bz - 1.9); // waste box (dirt, seed, leaf)
  // main duct above the machines, then a branch down to every card
  fpipe(g, anim, [[-90, 3.2, bz], [-80, 3.2, bz], [-70, 3.2, bz], [-70, 4.8, bz], [-30, 4.8, bz]], 0.38, m.pipe.air, DOT.cotton, 4, 1.4);
  CARD_X.forEach((x) => fpipe(g, anim, [[x, 4.8, bz], [x, 4.8, -66.2], [x, 2.7, -66.2]], 0.3, m.pipe.air, DOT.cotton, 3, 1.3));

  // ---- cards (z = -64): the big cylinder with fine wire teeth turns inside a glass cover; the sliver falls into a can
  for (const x of CARD_X) {
    const cz = -64;
    bx(g, 2.4, 1.1, 5.2, t.paintGrey, x, 0.55, cz);
    bx(g, 2.3, 1.7, 3.0, t.glass, x, 1.95, cz - 0.8);
    drum(g, anim, { r: 0.72, len: 2.0, mat: t.steelDark, mark: t.alu, x, y: 1.95, z: cz - 0.8, axis: 'x', rps: 1.4, seg: 24 });
    bx(g, 0.9, 0.5, 0.9, t.paintBlue, x, 1.35, cz + 2.0);
    cy(g, 0.45, 0.9, t.cotton, x, 0.45, cz + 3.3, 16); // sliver can
    cy(g, 0.5, 0.06, t.steelDark, x, 0.93, cz + 3.3, 16);
  }

  // ---- drawing frames (z = -55) with cans in and out, roving frame with turning flyers
  for (const x of [-62, -50]) {
    bx(g, 4.4, 1.4, 2.0, t.paintBlue, x, 0.7, -55);
    drum(g, anim, { r: 0.14, len: 3.6, mat: t.steel, mark: t.paintRed, x, y: 1.6, z: -55.3, axis: 'x', rps: 4, seg: 12 });
    drum(g, anim, { r: 0.14, len: 3.6, mat: t.steel, mark: t.paintRed, x, y: 1.6, z: -54.7, axis: 'x', rps: -4, seg: 12 });
    const cans: Item[] = [];
    for (let i = 0; i < 6; i++) cans.push({ x: x - 1.9 + i * 0.76, y: 0.4, z: -57.6 });
    inst(g, new THREE.CylinderGeometry(0.34, 0.34, 0.8, 12), t.cotton, cans);
    cy(g, 0.45, 0.9, t.cotton, x, 0.45, -52.6, 16);
  }
  bx(g, 5, 1.8, 2.6, t.paintTeal, -38, 0.9, -55);
  bx(g, 4.6, 0.12, 0.12, t.steelDark, -38, 3.0, -55);
  const flyers: Item[] = [];
  for (let i = 0; i < 8; i++) flyers.push({ x: -40.1 + i * 0.58, y: 2.0, z: -55 });
  animInst(anim, inst(g, new THREE.BoxGeometry(0.1, 0.5, 0.1), t.alu, flyers), flyers, (tt, i, o) => {
    o.rotation.y = tt * 16 + i;
    o.position.x += Math.sin(o.rotation.y) * 0.18;
    o.position.z += Math.cos(o.rotation.y) * 0.18;
  });
  const bob: Item[] = flyers.map((f) => ({ ...f, y: 1.9 }));
  inst(g, new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10), t.yarn, bob);

  // ---- ring frames (z = -44): 2 x 64 spindles; every spindle has its bobbin, a yarn balloon and a traveller running round the ring
  const bobbins: Item[] = [];
  const balloons: Item[] = [];
  const travellers: Item[] = [];
  const creel: Item[] = [];
  for (const cxr of [-80, -48]) {
    const len = 28;
    const fz = -44;
    bx(g, len, 0.9, 2.6, t.paintGreen, cxr, 0.45, fz);
    bx(g, 3, 2.2, 2.8, t.paintTeal, cxr - len / 2 - 1.5, 1.1, fz);
    bx(g, len, 0.1, 0.12, t.steelDark, cxr, 2.3, fz);
    for (const ex of [-1, 1]) bx(g, 0.2, 2.3, 0.2, t.steelDark, cxr + ex * (len / 2 - 0.5), 1.15, fz);
    const n = Math.floor((len - 3) / 0.75);
    for (let i = 0; i < n; i++) {
      const x = cxr - len / 2 + 2 + i * 0.75;
      for (const side of [-1, 1]) {
        const z = fz + side * 0.95;
        bobbins.push({ x, y: 1.2, z });
        balloons.push({ x, y: 1.75, z });
        travellers.push({ x, y: 0.98, z });
        creel.push({ x, y: 2.1, z: fz + side * 0.5 });
      }
    }
  }
  inst(g, new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), t.yarn, bobbins);
  inst(g, new THREE.CylinderGeometry(0.03, 0.3, 1.0, 10, 1, true), t.balloon, balloons);
  inst(g, new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8), t.cotton, creel);
  animInst(anim, inst(g, new THREE.SphereGeometry(0.045, 6, 4), t.alu, travellers), travellers, (tt, i, o) => {
    const a = tt * 26 + i * 1.7;
    o.position.x += Math.cos(a) * 0.27;
    o.position.z += Math.sin(a) * 0.27;
  });

  // ---- the yarn leaves on cones: belt to the weaving shed
  belt(g, anim, t.steelDark, -34, -39.5, -4, -39.5, 1.0, 1.0, DOT.yarn, 1.6, 1.1, 0.28);
  const cones: Item[] = [];
  for (let i = 0; i < 12; i++) cones.push({ x: -33 + i * 0.7, y: 1.35, z: -38.4 });
  inst(g, new THREE.ConeGeometry(0.2, 0.5, 12), t.yarn, cones);
  board(g, t.steelDark, 'Spinning Mill', S.x, -29, 10);
  return { id: 'spinning', nameBn: 'Spinning Mill', group: g };
}
