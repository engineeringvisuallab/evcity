import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { every, flow, plume } from '../../../core/anim';
import { V, box, building, railing } from '../../../core/prims';
import { L } from '../layout';
import { clock as lineClock, testPose, LIFT_M } from '../schedule';
import { FUSE_BELLY, wingBottom, wingChordX } from './airframe';
import { Path, animRobot, cbox, follow, makeRobot, makeWorker, pillar, screen, stationPad, tube, bar, type Ctx } from './ctx';

const H = L.hall;
const Z = L.lineZ;
const FLOOR = 0.2;
/** plane frame (x forward, z right wing) -> world: the body is turned, so x -> X - x and z -> Z - z */
const wx = (X: number, xl: number): number => X - xl;
const wz = (zl: number): number => Z - zl;

/** Posts under the wing (front and rear spar lines) at the given spans: the wing rests on them in the first three stations. */
function wingJigs(g: THREE.Group, c: Ctx, X: number, spans: number[]): void {
  const { a } = c;
  for (const zl of spans) {
    for (const s of [-1, 1]) {
      for (const f of [0.2, 0.65]) {
        const top = wingBottom(zl) - 0.05;
        const x = wx(X, wingChordX(zl, f));
        const z = wz(s * zl);
        cbox(g, a.jig, 0.4, top, 0.4, x, FLOOR + top / 2, z);
        cbox(g, a.jigPad, 0.8, 0.1, 0.8, x, FLOOR + top - 0.02, z);
      }
    }
  }
  for (const f of [0.2, 0.65]) box(g, 0.5, 0.25, 36, c.mats.steel, wx(X, wingChordX(8, f)), FLOOR, Z);
}
/** Cradles under the fuselage: [x in the plane frame, height of the support]. */
function cradles(g: THREE.Group, c: Ctx, X: number, list: [number, number][]): void {
  for (const [xl, h] of list) {
    for (const s of [-1, 1]) {
      cbox(g, c.a.jig, 0.5, h, 0.5, wx(X, xl), FLOOR + h / 2, wz(s * 1.3));
      cbox(g, c.a.jigPad, 0.9, 0.12, 0.9, wx(X, xl), FLOOR + h, wz(s * 1.3));
    }
    box(g, 0.6, 0.3, 3.4, c.mats.steel, wx(X, xl), FLOOR, Z);
  }
}
/** A ring of robots around a place: [x, z, side] (side = which way they face: +1 = towards the line from the north, -1 = from the south). */
function robots(g: THREE.Group, c: Ctx, list: [number, number, 1 | -1][], speed: number, scale = 1.15): void {
  list.forEach(([x, z, side], i) => {
    const r = makeRobot(g, c.t, x, z, side * -Math.PI / 2, scale);
    animRobot(c.anim, r, i * 1.7, speed, 1, false);
  });
}
const dwellNow = (c: Ctx): number => lineClock(c.clock()).dwell;

/** STATION 1 - the WING: the wing box on jigs; robots drill and rivet; ribs and skin panels wait on racks. */
export function buildWing(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const X = L.st.wing;
  const g = new THREE.Group();
  g.name = 'wing';
  stationPad(g, m, a, X, H.z0 + 2, H.z1 - 2, 'STATION 1 - WING');
  wingJigs(g, c, X, [3, 6, 9, 12, 15.5]);
  robots(g, c, [[X - 9, Z - 22, 1], [X + 9, Z - 22, 1], [X - 9, Z + 22, -1], [X + 9, Z + 22, -1]], 1.0);
  // racks: ribs (thin plates standing in a frame) and big skin panels (stacked)
  for (let i = 0; i < 10; i++) cbox(g, a.plateStock, 0.05, 1.1, 3.2, X - 24 + i * 0.35, FLOOR + 0.9, Z - 25);
  box(g, 4, 0.3, 3.6, a.jig, X - 22.5, FLOOR, Z - 25);
  for (let i = 0; i < 6; i++) cbox(g, a.alu, 8, 0.06, 2.6, X + 24, FLOOR + 0.3 + i * 0.12, Z + 25);
  box(g, 8.6, 0.3, 3, a.jig, X + 24, FLOOR, Z + 25);
  [[X - 20, Z + 12, 0.3], [X + 18, Z - 14, 2.1], [X + 3, Z + 27, 4.0]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'wing', nameBn: 'Station 1 - Wing', group: g };
}

/** STATION 2 - the FUSELAGE: cradles under the barrels, riveting robots, a spare barrel waiting for the crane. */
export function buildFuse(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const X = L.st.fuse;
  const g = new THREE.Group();
  g.name = 'fuse';
  stationPad(g, m, a, X, H.z0 + 2, H.z1 - 2, 'STATION 2 - FUSELAGE');
  wingJigs(g, c, X, [6, 12]);
  cradles(g, c, X, [[16, FUSE_BELLY - 0.05], [8, FUSE_BELLY - 0.05], [-9, FUSE_BELLY - 0.05], [-17, 2.4]]);
  robots(g, c, [[X - 14, Z - 6.5, 1], [X - 14, Z + 6.5, -1], [X + 14, Z - 6.5, 1], [X + 14, Z + 6.5, -1]], 1.2);
  // a spare barrel on two cradles, and a stack of frames, waiting for the crane
  tube(g, a.alu, 2.0, 7, X - 6, FLOOR + 2.6, Z - 26, 'x', 28);
  for (const dx of [-3, 3]) cbox(g, a.jig, 0.6, 1.0, 3.2, X - 6 + dx, FLOOR + 0.5, Z - 26);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.06, 5, 28), a.aluDark);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(X + 20 + i * 0.5, FLOOR + 2.0, Z + 26);
    g.add(ring);
  }
  [[X - 22, Z + 10, 0.8], [X + 24, Z - 12, 2.6], [X + 2, Z - 27, 4.4]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'fuse', nameBn: 'Station 2 - Fuselage', group: g };
}

/** STATION 3 - FINAL ASSEMBLY: tail docks beside the fin, engine hoists, an AGV with parts, workers. */
export function buildFinal(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const X = L.st.final;
  const g = new THREE.Group();
  g.name = 'final';
  stationPad(g, m, a, X, H.z0 + 2, H.z1 - 2, 'STATION 3 - FINAL ASSEMBLY');
  wingJigs(g, c, X, [6, 12]);
  cradles(g, c, X, [[16, FUSE_BELLY - 0.05], [8, FUSE_BELLY - 0.05], [-9, FUSE_BELLY - 0.05], [-17, 2.4]]);
  // tail docks: a platform on each side of the fin (above the tailplane), with legs, rails and a ramp
  for (const s of [-1, 1]) {
    const px = X + 18;
    const pz = Z + s * 5.8;
    cbox(g, m.concrete, 9, 0.25, 4, px, 7.0, pz);
    for (const dx of [-4, 4]) for (const dz of [-1.8, 1.8]) cbox(g, m.steel, 0.3, 6.9, 0.3, px + dx, FLOOR + 3.45, pz + dz);
    railing(g, m.steel, px - 4.5, pz - 2, px + 4.5, pz - 2, 7.1);
    railing(g, m.steel, px - 4.5, pz + 2, px + 4.5, pz + 2, 7.1);
    railing(g, m.steel, px - 4.5, pz - 2, px - 4.5, pz + 2, 7.1);
    bar(g, m.steel, [px + 9.5, FLOOR, pz], [px + 4.5, 7.0, pz], 1.2, 0.2);
  }
  // engine hoists with the two turbofans that are fitted next
  for (const s of [-1, 1]) {
    cbox(g, a.jig, 5, 0.4, 2.2, X - 4, FLOOR + 0.5, Z + s * 22);
    tube(g, m.casing, 1.05, 4, X - 4, FLOOR + 1.9, Z + s * 22, 'x', 20);
    cbox(g, m.steel, 0.4, 2.2, 0.4, X - 6, FLOOR + 1.5, Z + s * 22);
  }
  robots(g, c, [[X - 16, Z - 22, 1], [X - 16, Z + 22, -1]], 0.9);
  // AGV that brings parts along the south walkway
  const agv = new THREE.Group();
  cbox(agv, t.agv, 2.6, 0.5, 1.5, 0, 0.5, 0);
  cbox(agv, t.boxCard, 1.6, 0.9, 1.1, 0, 1.2, 0);
  g.add(agv);
  follow(anim, agv, new Path([[X - 26, FLOOR + 0.1, H.z1 - 7], [X + 26, FLOOR + 0.1, H.z1 - 7], [X + 26, FLOOR + 0.1, H.z1 - 11], [X - 26, FLOOR + 0.1, H.z1 - 11]], true), 1.6);
  [[X - 20, Z + 8, 0.5], [X + 12, Z - 12, 2.2], [X + 24, Z + 3, 3.9], [X - 8, Z - 26, 5.1]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'final', nameBn: 'Station 3 - Final assembly', group: g };
}

/** STATION 4 - PAINT: a glass booth, spray robots with a paint mist while the primer and the livery go on, curing lamps, a paint store. */
export function buildPaint(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const X = L.st.paint;
  const g = new THREE.Group();
  g.name = 'paint';
  stationPad(g, m, a, X, H.z0 + 2, H.z1 - 2, 'STATION 4 - PAINT');
  const cz = (H.z0 + H.z1) / 2;
  cbox(g, a.boothGlass, 56, 14, 0.2, X, 7, H.z1 - 1.6);
  for (const s of [-1, 1]) cbox(g, a.boothGlass, 0.2, 14, H.z1 - H.z0 - 4, X + s * 28, 7, cz);
  cbox(g, a.boothGlass, 56, 0.2, H.z1 - H.z0 - 4, X, 14, cz);
  for (let i = 0; i < 5; i++) cbox(g, a.lamp, 40, 0.12, 0.5, X, 13.6, H.z0 + 8 + i * 11);
  for (const s of [-1, 1]) for (const dx of [-27, 27]) box(g, 0.5, 14, 0.5, m.steel, X + dx, 0, cz + s * 29);
  const spray: [number, number, 1 | -1][] = [[X - 14, Z - 6.5, 1], [X - 14, Z + 6.5, -1], [X + 14, Z - 6.5, 1], [X + 14, Z + 6.5, -1], [X, Z - 22, 1], [X, Z + 22, -1]];
  robots(g, c, spray, 1.3, 1.2);
  const mist: THREE.Group[] = [];
  for (const [x, z, side] of spray) mist.push(plume(anim, g, x, 3.4, z + side * 2.6, { count: 6, rise: 1.6, life: 1.8, size0: 0.7, size1: 2.4, windX: 0, windZ: side * 1.5, spread: 1.4, opacity: 0.32, color: 0xf2f6ee }));
  // curing lamps in the ceiling glow while the paint is baked
  const lamps = new THREE.Group();
  for (let i = 0; i < 4; i++) cbox(lamps, a.hot, 30, 0.2, 1.2, X, 13.2, H.z0 + 10 + i * 14);
  g.add(lamps);
  every(anim, () => {
    const d = dwellNow(c);
    const spraying = (d > 0.12 && d < 0.5) || (d > 0.64 && d < 0.9);
    for (const mm of mist) mm.visible = spraying;
    lamps.visible = (d > 0.5 && d < 0.64) || d > 0.9;
  });
  // the paint store: drums of primer and of the livery colours
  const drums = [t.carWhite, t.carBlue, t.carGreen, t.carSilver, t.carWhite, t.carBlue];
  drums.forEach((mat, i) => pillar(g, mat, 0.45, 1.1, X + 14 + (i % 3) * 1.2, FLOOR + 0.55, H.z0 + 4 + Math.floor(i / 3) * 1.2));
  [[X - 22, Z + 10, 1.1], [X + 22, Z - 12, 3.0]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'paint', nameBn: 'Station 4 - Paint', group: g };
}

/** STATION 5 - the TEST CELL: jacks lift the aeroplane for the gear swing, ground power and air-start carts with moving hoses, weighing plates, a control cabin with screens. */
export function buildTest(c: Ctx): InfraPart {
  const { t, a, mats: m, anim } = c;
  const X = L.st.test;
  const g = new THREE.Group();
  g.name = 'test';
  stationPad(g, m, a, X, H.z0 + 2, H.z1 - 2, 'STATION 5 - TEST CELL');
  // three jacks (under each wing and under the nose / tail): they follow the lifting aeroplane
  const jacks: { m: THREE.Mesh; top: number }[] = [];
  const jackAt = (xl: number, zl: number, top: number): void => {
    const mesh = pillar(g, a.jig, 0.16, 1, wx(X, xl), FLOOR + top / 2, wz(zl), 12);
    mesh.scale.y = top;
    jacks.push({ m: mesh, top });
    cbox(g, a.jigPad, 0.7, 0.1, 0.7, wx(X, xl), FLOOR + top, wz(zl));
  };
  for (const s of [-1, 1]) jackAt(wingChordX(9, 0.4), s * 9, wingBottom(9) - 0.05);
  jackAt(12, 0, FUSE_BELLY - 0.05);
  jackAt(-16.5, 0, 2.5);
  every(anim, () => {
    const lift = testPose(4, dwellNow(c)).lift * LIFT_M;
    for (const j of jacks) {
      j.m.scale.y = j.top + lift;
      j.m.position.y = FLOOR + (j.top + lift) / 2;
    }
  });
  // weighing plates (weight and balance), where the wheels stand
  for (const s of [-1, 1]) cbox(g, a.aluDark, 2.4, 0.08, 1.8, wx(X, -1.0), FLOOR + 0.04, wz(s * 3.0));
  cbox(g, a.aluDark, 1.8, 0.08, 1.4, wx(X, 15.4), FLOOR + 0.04, Z);
  // ground-power cart and air-start cart with their hoses (dots move along the hose)
  cbox(g, a.jigPad, 3, 1.3, 1.6, X + 8, FLOOR + 0.7, Z - 13);
  cbox(g, a.jig, 2.6, 1.3, 1.6, X + 8, FLOOR + 0.7, Z + 13);
  flow(anim, g, [V(X + 8, 1.2, Z - 12), V(X + 8, 1.0, Z - 5), V(X + 4, 2.2, Z - 1.6)], { color: 0xffe066, speed: 3, spacing: 1.2, size: 0.1 });
  flow(anim, g, [V(X + 8, 1.2, Z + 12), V(X + 8, 1.0, Z + 5), V(X + 2, 2.2, Z + 5.5)], { color: 0x7fc8ff, speed: 4, spacing: 1.2, size: 0.1 });
  // control cabin on the north side, screens on its south wall
  building(g, m, { x: X, z: H.z0 + 7, w: 22, d: 8, h: 4.5, door: 'S' });
  [-6, 0, 6].forEach((dx, i) => screen(g, t, anim, X + dx, 2.6, H.z0 + 7 + 4.2, 4.6, 2.2, i * 1.3));
  [[X - 22, Z + 10, 0.4], [X + 22, Z - 12, 2.4], [X - 14, Z - 26, 4.2]].forEach(([x, z, p]) => makeWorker(g, t, anim, x, z, 0, p));
  return { id: 'test', nameBn: 'Station 5 - Test cell', group: g };
}
