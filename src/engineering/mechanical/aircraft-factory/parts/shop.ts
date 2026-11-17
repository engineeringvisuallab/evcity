import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { every, plume } from '../../../core/anim';
import { box } from '../../../core/prims';
import { L } from '../layout';
import { animRobot, cbox, makeRobot, makeWorker, pillar, shed, type Ctx } from './ctx';

/**
 * The PARTS SHOP (open to the north, glass roof): five-axis CNC machines that mill ribs and frames out of aluminium plate, a long gantry mill for the wing spars,
 * robot arms that load the machines, pallets of aluminium plate and racks of finished parts.
 */
export function buildShop(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const S = L.cnc;
  const g = new THREE.Group();
  g.name = 'cnc';
  shed(g, m, t, { x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, open: 'N', glass: true });
  const z0 = S.z - S.d / 2;

  // four five-axis CNC machines in a row: enclosure, a table that turns, a spindle that moves over the aluminium workpiece, coolant mist
  [-141, -127, -113, -99].forEach((x, i) => {
    const z = z0 + 9;
    box(g, 6, 2.4, 4.6, a.machine, x, 0.2, z);
    cbox(g, a.machineLight, 6.2, 0.25, 4.8, x, 2.7, z);
    for (const dx of [-3, 3]) for (const dz of [-2.2, 2.2]) cbox(g, a.machineLight, 0.2, 2.4, 0.2, x + dx, 3.9, z + dz);
    cbox(g, a.boothGlass, 6, 2.4, 0.1, x, 3.9, z + 2.35); // the door, see-through
    const table = new THREE.Group();
    table.position.set(x, 2.75, z);
    g.add(table);
    cbox(table, a.plateStock, 2.6, 0.3, 1.6, 0, 0.15, 0); // the aluminium workpiece
    for (let p = 0; p < 3; p++) cbox(table, a.alu, 0.5, 0.12, 0.9, -0.8 + p * 0.8, 0.34, 0); // pockets already milled
    const head = new THREE.Group();
    head.position.set(x, 3.6, z);
    g.add(head);
    cbox(head, a.machineLight, 0.8, 0.5, 0.8, 0, 0.5, 0);
    pillar(head, a.titanium, 0.12, 0.8, 0, 0, 0, 10); // the spindle with its cutter
    plume(anim, g, x, 2.9, z, { count: 3, rise: 1.0, life: 1.2, size0: 0.4, size1: 1.2, windX: 0, windZ: 0.4, spread: 0.5, opacity: 0.25, color: 0xdfe8ee });
    every(anim, (tm) => {
      table.rotation.y = tm * 0.5 + i;
      head.position.x = x + 1.1 * Math.sin(tm * 1.3 + i * 1.1);
      head.position.z = z + 0.5 * Math.sin(tm * 0.9 + i);
    });
  });

  // the gantry mill for the long wing spars: two rails, a gantry that travels along the 30 m bed, a spar billet on the bed
  const gx = -73;
  const gz = S.z + 10;
  for (const dz of [-3.5, 3.5]) box(g, 32, 0.5, 0.5, m.steel, gx, 0.2, gz + dz);
  box(g, 28, 0.5, 1.6, a.plateStock, gx, 0.7, gz);
  const gantry = new THREE.Group();
  g.add(gantry);
  for (const dz of [-3.5, 3.5]) cbox(gantry, a.machine, 1.2, 3.4, 0.9, 0, 2.4, dz);
  cbox(gantry, a.machine, 1.2, 0.8, 8.4, 0, 4.3, 0);
  const spin = pillar(gantry, a.titanium, 0.14, 1.2, 0, 3.4, 0, 10);
  every(anim, (tm) => {
    gantry.position.set(gx + 12 * Math.sin(tm * 0.25), 0.2, gz);
    spin.position.z = 2.5 * Math.sin(tm * 0.7);
  });

  // robot arms that load the machines, pallets of aluminium plate, racks of finished ribs and frames
  [-134, -106].forEach((x, i) => animRobot(anim, makeRobot(g, t, x, z0 + 17, Math.PI, 1.2), i * 2.1, 1.0, 1, false));
  for (let k = 0; k < 3; k++) {
    box(g, 4.2, 0.3, 2.6, m.concreteDark, -149, 0.2, z0 + 24 + k * 6);
    for (let i = 0; i < 6; i++) cbox(g, a.plateStock, 4, 0.08, 2.4, -149, 0.65 + i * 0.1, z0 + 24 + k * 6);
  }
  for (let r = 0; r < 4; r++) {
    box(g, 3, 0.2, 2, a.jig, -120 + r * 4.2, 0.2, z0 + 30);
    for (let i = 0; i < 8; i++) cbox(g, a.alu, 0.06, 1.2, 1.6, -121 + r * 4.2 + i * 0.35, 1.0, z0 + 30);
  }
  [[-132, z0 + 24, 0.4], [-100, z0 + 20, 2.6]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'cnc', nameBn: 'Parts shop and CNC machines', group: g };
}
