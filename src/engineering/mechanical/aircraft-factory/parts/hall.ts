import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { every } from '../../../core/anim';
import { box } from '../../../core/prims';
import { L } from '../layout';
import { cbox, type Ctx } from './ctx';

/** One overhead bridge crane: a girder that runs along the hall (x), a trolley that runs along the girder (z), a rope and a hook (with a load). */
function bridgeCrane(g: THREE.Group, c: Ctx, xMid: number, amp: number, phase: number, speed: number, load: boolean): void {
  const { mats: m, anim } = c;
  const H = L.hall;
  const cz = (H.z0 + H.z1) / 2;
  const span = H.z1 - H.z0 - 2.4;
  const grp = new THREE.Group();
  g.add(grp);
  box(grp, 1.4, 1.5, span, m.yellow, 0, 19.2, cz);
  for (const s of [-1, 1]) box(grp, 3, 1.2, 1.6, m.steel, 0, 18.6, cz + s * (span / 2 - 0.4));
  const trolley = new THREE.Group();
  trolley.position.set(0, 19.2, cz);
  grp.add(trolley);
  cbox(trolley, m.red, 2.6, 0.9, 2.6, 0, -0.3, 0);
  const rope = cbox(trolley, m.steel, 0.07, 1, 0.07, 0, -0.5, 0);
  const hook = new THREE.Group();
  trolley.add(hook);
  cbox(hook, m.steel, 0.9, 0.7, 0.9, 0, -0.3, 0);
  if (load) cbox(hook, m.concreteDark, 2.4, 1.0, 1.6, 0, -1.4, 0);
  const tick = (tm: number): void => {
    grp.position.x = xMid + amp * Math.sin(tm * speed + phase);
    trolley.position.z = cz + 16 * Math.sin(tm * speed * 1.7 + phase);
    const len = 7 + 5 * (0.5 + 0.5 * Math.sin(tm * speed * 2.3 + phase));
    rope.scale.y = len;
    rope.position.y = -0.5 - len / 2;
    hook.position.y = -0.5 - len;
  };
  tick(0);
  every(anim, tick);
}

/** The assembly hall: one long building along the north side. South side open (columns), the big rollout door in the west wall, roof trusses, lamps, crane rails and three bridge cranes. */
export function buildHall(c: Ctx): InfraPart {
  const { mats: m, t, a } = c;
  const g = new THREE.Group();
  g.name = 'hall';
  const H = L.hall;
  const W = H.x1 - H.x0;
  const D = H.z1 - H.z0;
  const cx = (H.x0 + H.x1) / 2;
  const cz = (H.z0 + H.z1) / 2;
  const th = 0.5;
  box(g, W, 0.2, D, t.floor, cx, 0, cz);
  box(g, W, H.h, th, m.wall, cx, 0, H.z0 + th / 2);
  box(g, th, H.h, D - 2 * th, m.wall, H.x1 - th / 2, 0, cz);
  // west wall: two pieces and a lintel leave the rollout door (44 m wide, 16 m high)
  const dz = L.door.z;
  const hw = L.door.w / 2;
  box(g, th, H.h, dz - hw - H.z0 - th, m.wall, H.x0 + th / 2, 0, (H.z0 + th + dz - hw) / 2);
  box(g, th, H.h, H.z1 - (dz + hw), m.wall, H.x0 + th / 2, 0, (dz + hw + H.z1) / 2);
  box(g, th, H.h - L.door.h, 2 * hw, m.wall, H.x0 + th / 2, L.door.h, dz);
  for (const s of [-1, 1]) box(g, 1, L.door.h, 1, m.yellow, H.x0 + 0.5, 0, dz + s * (hw + 0.5));
  box(g, 0.2, 1.2, 2 * hw + 2, m.yellow, H.x0 - 0.1, L.door.h - 1.2, dz);
  // the south side is open: columns
  const nc = Math.round(W / 24);
  for (let i = 0; i <= nc; i++) box(g, 0.8, H.h, 0.8, m.concrete, H.x0 + 0.4 + (i * (W - 0.8)) / nc, 0, H.z1 - 0.4);
  // roof, trusses, roof lights, lamps
  box(g, W + 1, 0.5, D + 1, m.roof, cx, H.h, cz);
  for (let i = 0; i <= nc; i++) box(g, 0.5, 1.8, D, m.steel, H.x0 + 0.4 + (i * (W - 0.8)) / nc, H.h - 1.8, cz);
  for (let i = 0; i < nc; i++) box(g, 16, 0.5, 5, m.glass, H.x0 + (i + 0.5) * (W / nc), H.h + 0.45, cz - 12);
  for (let x = H.x0 + 12; x < H.x1 - 8; x += 12) for (const z of [-80, -60, -40]) cbox(g, a.lamp, 1.8, 0.15, 0.5, x, H.h - 2.4, z);
  // crane runway beams (on the north wall and on the south columns)
  box(g, W - 2, 0.7, 0.6, m.steel, cx, 18.4, H.z0 + 1.0);
  box(g, W - 2, 0.7, 0.6, m.steel, cx, 18.4, H.z1 - 1.0);
  // floor markings: walkways on both sides, the centre line of the aeroplane line
  box(g, W - 6, 0.03, 0.35, a.floorLine, cx, 0.2, H.z1 - 4);
  box(g, W - 6, 0.03, 0.35, a.floorLine, cx, 0.2, H.z0 + 4);
  box(g, W - 6, 0.03, 0.25, m.white, cx, 0.2, L.lineZ);
  // the moving cranes are not obstacles
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  bridgeCrane(env, c, 105, 36, 0, 0.16, true);
  bridgeCrane(env, c, -35, 36, 2.1, 0.13, false);
  bridgeCrane(env, c, -135, 22, 4.3, 0.12, true);
  return { id: 'hall', nameBn: 'Assembly Hall and cranes', group: g };
}
