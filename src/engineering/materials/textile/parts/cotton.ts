import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building } from '../../../core/prims';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { belt, board, bx, inst, type Item } from './helpers';

/** Raw cotton bale store (open to the south), a forklift that carries bales to the conveyor, and the conveyor into the blowroom. */
export function buildCotton({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'cotton';
  const C = L.cotton;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'S', door: 'N' });
  const x0 = C.x - C.w / 2 + 3;
  const z0 = C.z - C.d / 2 + 3;

  // bale stacks: 1.5 x 0.7 x 0.8 m, pressed and strapped, 1 to 4 high; an aisle in the middle for the forklift
  const bales: Item[] = [];
  const straps: Item[] = [];
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 6; iz++) {
      if (iz === 3) continue; // aisle
      const h = 1 + ((ix * 7 + iz * 3) % 4);
      for (let k = 0; k < h; k++) {
        const x = x0 + ix * 1.7;
        const z = z0 + iz * 1.0 + (iz > 3 ? 1.8 : 0);
        bales.push({ x, y: 0.45 + k * 0.72, z, c: k % 2 ? 0xf5f2e8 : 0xe9e1cc });
        straps.push({ x, y: 0.45 + k * 0.72, z });
      }
    }
  }
  inst(g, new THREE.BoxGeometry(1.5, 0.7, 0.8), t.cotton, bales);
  inst(g, new THREE.BoxGeometry(0.08, 0.74, 0.84), t.strap, straps.map((s) => ({ ...s, x: s.x - 0.35 })));
  inst(g, new THREE.BoxGeometry(0.08, 0.74, 0.84), t.strap, straps.map((s) => ({ ...s, x: s.x + 0.35 })));
  // more bales in the east half of the store, stacked in blocks
  const blocks: Item[] = [];
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 5; iz++) for (let k = 0; k < 3; k++) blocks.push({ x: C.x + 2 + ix * 1.7, y: 0.45 + k * 0.72, z: z0 + 1 + iz * 1.0 + (iz > 2 ? 1.5 : 0), c: (ix + iz + k) % 2 ? 0xf5f2e8 : 0xe9e1cc });
  inst(g, new THREE.BoxGeometry(1.5, 0.7, 0.8), t.cotton, blocks);

  // forklift shuttling along the aisle (z = C.z - 3 + ...) between the store and the conveyor, carrying one bale half of the time
  const fz = z0 + 3 * 1.0 + 0.9;
  const lift = new THREE.Group();
  box(lift, 1.4, 1.0, 2.2, t.paintYellow, 0, 0.2, 0);
  box(lift, 1.2, 1.0, 1.0, t.steelDark, 0, 1.2, -0.3);
  box(lift, 0.1, 2.4, 0.1, t.steelDark, -0.4, 0.4, 1.2);
  box(lift, 0.1, 2.4, 0.1, t.steelDark, 0.4, 0.4, 1.2);
  box(lift, 0.9, 0.1, 1.0, t.steelDark, 0, 0.3, 1.7);
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.8, 0.8]) bx(lift, 0.3, 0.5, 0.5, t.rubber, dx, 0.3, dz);
  const carry = bx(lift, 1.5, 0.7, 0.8, t.cotton, 0, 0.95, 1.7);
  carry.rotation.y = Math.PI / 2;
  g.add(lift);
  const xa = x0 + 1;
  const xb = C.x + C.w / 2 + 6;
  anim.add((tt) => {
    const k = (Math.sin(tt * 0.35) + 1) / 2;
    lift.position.set(xa + (xb - xa) * k, 0, fz);
    const going = Math.cos(tt * 0.35) > 0;
    lift.rotation.y = going ? -Math.PI / 2 : Math.PI / 2;
    carry.visible = going;
  });

  // conveyor into the blowroom (through the east walls of the store and the mill)
  belt(g, anim, t.steelDark, C.x + C.w / 2 - 6, -72, -93, -72, 0.9, 1.4, DOT.cotton, 1.2, 1.8, 0.4);
  bx(g, 1.8, 0.1, 1.8, t.cotton, C.x + C.w / 2 - 4, 1.1, -72);
  board(g, t.steelDark, 'Cotton Bale Store', C.x, C.z + C.d / 2 + 4, 8);
  return { id: 'cotton', nameBn: 'Cotton Bale Store', group: g };
}
