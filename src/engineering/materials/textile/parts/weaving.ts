import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { animInst, board, bx, drum, inst, dots, type Item } from './helpers';

const ROWS = [-68, -58, -48];
const BANK_X = [-2, 39];

/** Weaving shed (open to the south): warping & sizing machine and 36 looms. On every loom the heald frames lift the warp yarns up and down and the reed beats the weft in. */
export function buildWeaving({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'weaving';
  const W = L.weave;
  building(g, m, { x: W.x, z: W.z, w: W.w, d: W.d, h: W.h, open: 'S', door: 'N' });

  // ---- warping & sizing (middle of the shed): creel of cones on the left, size box and the big warp beam
  const wx = 30;
  bx(g, 7, 2.2, 5, t.paintBlue, wx, 1.1, -66);
  bx(g, 6.4, 0.2, 4.4, t.paintGrey, wx, 2.3, -66);
  const cones: Item[] = [];
  for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) cones.push({ x: wx - 4.5 + i * 0.9, y: 0.7 + k * 0.7, z: -73 });
  inst(g, new THREE.ConeGeometry(0.22, 0.55, 12), t.yarn, cones);
  bx(g, 9.4, 0.12, 1.0, t.steelDark, wx, 3.3, -73);
  for (const dx of [-4.8, 4.8]) bx(g, 0.2, 3.3, 1.0, t.steelDark, wx + dx, 1.65, -73);
  drum(g, anim, { r: 0.9, len: 5.4, mat: t.alu, mark: t.paintRed, x: wx, y: 1.0, z: -61, axis: 'x', rps: 0.4 });
  dots(g, anim, [[wx - 4.5, 2.2, -73], [wx - 3.5, 2.2, -66], [wx, 2.2, -66], [wx, 1.2, -61]], DOT.yarn, 1.8, 0.8, 0.14);

  // ---- looms: 3 rows x (6 + 6). Static parts are one instanced mesh each; healds and reed move.
  const frames: Item[] = [];
  const beams: Item[] = [];
  const rolls: Item[] = [];
  const warp: Item[] = [];
  const cloth: Item[] = [];
  const heald1: Item[] = [];
  const heald2: Item[] = [];
  const reed: Item[] = [];
  const palette = [0x2e5c8a, 0x3f7d5a, 0x8f979e];
  ROWS.forEach((z, r) => {
    BANK_X.forEach((x0, b) => {
      for (let i = 0; i < 6; i++) {
        const x = x0 + i * 4.6;
        frames.push({ x, y: 0.75, z, c: palette[(r + b + i) % 3] });
        beams.push({ x, y: 1.55, z: z - 1.5 });
        rolls.push({ x, y: 0.7, z: z + 1.35 });
        warp.push({ x, y: 1.35, z: z - 0.6 });
        cloth.push({ x, y: 1.2, z: z + 0.85, c: i % 2 ? 0xe9dfc4 : 0xb9c7d6 });
        heald1.push({ x, y: 1.5, z: z - 0.3 });
        heald2.push({ x, y: 1.5, z: z - 0.1 });
        reed.push({ x, y: 1.4, z: z + 0.35 });
      }
    });
  });
  inst(g, new THREE.BoxGeometry(1.8, 1.5, 2.8), t.white, frames);
  const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.7, 14);
  beamGeo.rotateZ(Math.PI / 2);
  inst(g, beamGeo, t.alu, beams);
  const rollGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.6, 12);
  rollGeo.rotateZ(Math.PI / 2);
  inst(g, rollGeo, t.cotton, rolls);
  inst(g, new THREE.BoxGeometry(1.5, 0.03, 1.8), t.yarn, warp);
  inst(g, new THREE.BoxGeometry(1.5, 0.04, 0.9), t.white, cloth);
  animInst(anim, inst(g, new THREE.BoxGeometry(1.5, 0.7, 0.04), t.paintRed, heald1), heald1, (tt, i, o) => {
    o.position.y += Math.sin(tt * 5 + i * 0.3) * 0.16;
  });
  animInst(anim, inst(g, new THREE.BoxGeometry(1.5, 0.7, 0.04), t.paintYellow, heald2), heald2, (tt, i, o) => {
    o.position.y -= Math.sin(tt * 5 + i * 0.3) * 0.16;
  });
  animInst(anim, inst(g, new THREE.BoxGeometry(1.6, 0.55, 0.1), t.steelDark, reed), reed, (tt, i, o) => {
    o.position.z += Math.max(0, Math.sin(tt * 5 + i * 0.3)) * 0.3;
  });
  // fabric roll finished on a loom is taken away: fabric dots run along the south aisle to the shed exit
  dots(g, anim, [[-6, 0.9, -36], [66, 0.9, -36]], DOT.fabric, 1.4, 1.6, 0.26);
  // inspection frame at the east end (fabric is checked for defects before it goes to the dyeing house)
  bx(g, 0.2, 2.8, 0.2, t.steelDark, 63, 1.4, -39);
  bx(g, 0.2, 2.8, 0.2, t.steelDark, 63, 1.4, -35);
  bx(g, 0.2, 0.2, 4.2, t.steelDark, 63, 2.8, -37);
  bx(g, 0.1, 2.0, 3.6, t.glass, 63, 1.5, -37);
  board(g, t.steelDark, 'Weaving Shed', W.x, -29, 10);
  return { id: 'weaving', nameBn: 'Weaving Shed', group: g };
}
