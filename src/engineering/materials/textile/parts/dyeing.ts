import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, buriedLine, cyl, pump, V } from '../../../core/prims';
import { every, plume, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT, DYE_COLORS, std } from './ctx';
import { L } from '../layout';
import { board, bx, cx, cy, cz, drum, dots, fpipe, inst, rack, type Item } from './helpers';

const JET_X = [96, 103, 110, 117];
const JET_Z = [-68, -55];

/** Dyeing & finishing house (open to the south): dye kitchen, 8 jet dyeing machines, stenter; boiler house with chimney, water plant, and the drain that takes the waste water to the ETP. */
export function buildDyeing({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'dyeing';
  const D = L.dye;
  building(g, m, { x: D.x, z: D.z, w: D.w, d: D.d, h: D.h, open: 'S', door: 'N' });

  // ---- dye kitchen: 4 mixing tanks with turning agitators; the dosing line takes colour and chemicals to the jets
  for (const [x, z] of [[81, -71], [85, -71], [81, -65], [85, -65]] as [number, number][]) {
    cy(g, 1.0, 3.4, t.steel, x, 1.7, z, 20);
    bx(g, 0.12, 0.7, 0.12, t.steelDark, x, 3.75, z);
    const paddle = new THREE.Group();
    paddle.position.set(x, 3.4, z);
    bx(paddle, 1.4, 0.08, 0.14, t.paintRed, 0, 0, 0);
    g.add(paddle);
    spin(anim, paddle, 'y', 2.4);
  }
  // ---- jets: horizontal pressure vessels, a porthole with the turning fabric reel, and the circulation loop above
  let idx = 0;
  const ledMeshes: THREE.Mesh[] = [];
  for (const z of JET_Z) {
    for (const x of JET_X) {
      const color = DYE_COLORS[idx % DYE_COLORS.length];
      const liquor = std(color, { rough: 0.4, metal: 0.1 });
      anim.disposables.push(liquor);
      cx(g, 1.2, 5.0, t.steel, x, 2.4, z, 22);
      for (const dx of [-1.8, 1.8]) bx(g, 0.4, 1.2, 1.6, t.steelDark, x + dx, 0.6, z);
      cz(g, 0.46, 0.1, t.glass, x, 2.4, z + 1.24, 16);
      drum(g, anim, { r: 0.36, len: 0.08, mat: liquor, mark: t.white, x, y: 2.4, z: z + 1.16, axis: 'z', rps: 0.5, seg: 14 });
      fpipe(g, anim, [[x - 2, 3.5, z], [x - 2, 4.9, z], [x + 2, 4.9, z], [x + 2, 3.5, z]], 0.26, liquor, color, 2, 1.1);
      bx(g, 0.8, 1.8, 0.5, t.paintGrey, x + 3.05, 0.9, z + 0.8);
      ledMeshes.push(bx(g, 0.18, 0.18, 0.05, t.ledGreen, x + 3.05, 1.5, z + 1.08));
      idx++;
    }
  }
  every(anim, (tt) => {
    ledMeshes.forEach((l, i) => {
      l.material = Math.floor(tt / 3 + i * 0.7) % 4 === 0 ? t.ledAmber : t.ledGreen;
    });
  });
  // dosing line (yellow) and the steam headers (white) with drops to the jets
  fpipe(g, anim, [[85, 4.6, -71], [85, 5.7, -71], [85, 5.7, -72.4], [120, 5.7, -72.4]], 0.18, m.pipe.chemical, DOT.chem, 2, 1.6);
  fpipe(g, anim, [[86, 7.6, -74], [127, 7.6, -74]], 0.3, m.pipe.steam, DOT.steam, 4, 2);
  fpipe(g, anim, [[86, 7.6, -74], [86, 7.6, -50.5], [120, 7.6, -50.5]], 0.3, m.pipe.steam, DOT.steam, 4, 2);
  for (const x of JET_X) {
    fpipe(g, anim, [[x, 5.7, -72.4], [x, 5.7, -68], [x, 3.7, -68]], 0.12, m.pipe.chemical, DOT.chem, 1.5, 1.3);
    fpipe(g, anim, [[x + 0.9, 7.6, -74], [x + 0.9, 3.8, -74], [x + 0.9, 3.8, -68.6]], 0.14, m.pipe.steam, DOT.steam, 2.5, 1.5);
    fpipe(g, anim, [[x + 0.9, 7.6, -50.5], [x + 0.9, 3.8, -50.5], [x + 0.9, 3.8, -54.4]], 0.14, m.pipe.steam, DOT.steam, 2.5, 1.5);
  }

  // ---- stenter (z -74 .. -50): fabric runs on pin chains through hot-air chambers; exhaust stacks with steam
  const sx = 127;
  bx(g, 3.0, 2.6, 24, t.paintGrey, sx, 1.3, -62);
  for (const dx of [-1.55, 1.55]) bx(g, 0.1, 0.12, 24.4, t.steelDark, sx + dx, 1.5, -62);
  for (const z of [-72, -66, -60, -54]) {
    cyl(g, 0.35, 2.6, t.steelDark, sx, 2.6, z, 12);
    plume(anim, g, sx, 5.4, z, { count: 3, rise: 5, life: 3.2, size0: 0.8, size1: 2.8, windX: 2.5, windZ: 0, spread: 0.8, opacity: 0.3, color: 0xe8edf2 });
  }
  drum(g, anim, { r: 0.3, len: 2.6, mat: t.alu, mark: t.paintRed, x: sx, y: 1.6, z: -75.5, axis: 'x', rps: 0.5 });
  drum(g, anim, { r: 0.3, len: 2.6, mat: t.alu, mark: t.paintRed, x: sx, y: 1.0, z: -47.5, axis: 'x', rps: -0.5 });
  dots(g, anim, [[sx, 1.45, -75.5], [sx, 1.45, -48]], DOT.fabric, 1.6, 1.0, 0.2);
  const rolls: Item[] = [];
  for (let i = 0; i < 3; i++) rolls.push({ x: 131, y: 0.45, z: -52 + i * 1.2, c: DYE_COLORS[i] });
  const rollGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 14);
  rollGeo.rotateZ(Math.PI / 2);
  inst(g, rollGeo, t.white, rolls);

  // ---- drain: waste water leaves along the south edge of the house, then a buried line to the ETP (posts mark it)
  box(g, 56, 0.05, 0.9, t.steelDark, 105, 0.02, -48.5);
  dots(g, anim, [[131, 0.18, -48.5], [73, 0.18, -48.5], [73, 0.18, 10]], DOT.effluent, 2.2, 2.0, 0.22);
  buriedLine(g, t.paintYellow, [V(73, 0, -48.5), V(73, 0, 10)], 10);

  // ---- boiler house (gas fired): steam boiler, burner, economiser, feed water tank and pump, flue gas to the chimney
  const B = L.boiler;
  building(g, m, { x: B.x, z: B.z, w: B.w, d: B.d, h: B.h, open: 'S', door: 'N' });
  cx(g, 1.5, 7, t.paintRed, B.x, 2.4, B.z, 24);
  for (const dx of [-2.4, 2.4]) bx(g, 0.5, 1.0, 2.2, t.steelDark, B.x + dx, 0.5, B.z);
  bx(g, 1.4, 1.6, 1.8, t.paintBlue, B.x - 4.3, 1.8, B.z);
  const glow = bx(g, 0.5, 0.5, 0.08, t.flame, B.x - 2.8, 2.4, B.z + 1.52);
  every(anim, (tt) => {
    const k = 0.85 + 0.15 * Math.sin(tt * 17) * Math.sin(tt * 5.3);
    glow.scale.set(k, k, 1);
  });
  bx(g, 2.6, 1.8, 2.0, t.paintGrey, B.x + 5.0, 0.9, B.z);
  cx(g, 0.8, 3.5, t.steel, B.x - 1, 4.9, B.z - 3, 18);
  for (const dx of [-2.2, 0.2]) bx(g, 0.3, 4.0, 0.3, t.steelDark, B.x - 1 + dx, 2, B.z - 3);
  pump(g, m, B.x - 4, B.z + 3.2, 0, 0, 0.8);
  // chimney with the flue duct; gas fired, so the plume is mostly water vapour
  const C = L.chimney;
  cyl(g, C.r, C.h, m.chimney, C.x, 0, C.z, 20);
  box(g, 3, 0.8, 3, m.concreteDark, C.x, 0, C.z);
  for (const y of [8, 16, 24]) cyl(g, C.r + 0.08, 0.2, t.paintRed, C.x, y, C.z, 20);
  fpipe(g, anim, [[B.x + 5, 3.2, B.z], [C.x, 3.2, B.z]], 0.5, m.pipe.flue, 0xb9b9b9, 3, 1.6);
  plume(anim, g, C.x, C.h, C.z, { count: 8, rise: 14, life: 6, size0: 1.6, size1: 6, windX: 9, windZ: 2, spread: 3, opacity: 0.32, color: 0xe8edf2 });
  // gas supply (regulating station) and steam main to the dyeing house
  bx(g, 2.4, 1.8, 1.6, t.paintYellow, 70, 0.9, -22);
  fpipe(g, anim, [[71.3, 0.9, -22], [80, 0.9, -22], [80, 0.9, B.z + 2.2]], 0.16, m.pipe.gas, DOT.gas, 2, 1.4);
  fpipe(g, anim, [[B.x, 3.9, B.z], [B.x, 7.6, B.z], [B.x, 7.6, -47], [B.x, 7.6, -74]], 0.3, m.pipe.steam, DOT.steam, 4, 2);
  rack(g, t.steelDark, B.x, B.z - 4, B.x, -47, 7.0, 1.6, 10);

  // ---- water plant: deep tubewell -> softener vessels (remove hardness, so no scale in the boiler and dye baths) -> soft water tank -> boiler
  const W = L.water;
  bx(g, 2.2, 2.6, 2.0, t.paintGrey, W.x, 1.3, W.z);
  cy(g, 0.12, 4, t.steelDark, W.x, 2.0, W.z - 1.6, 8);
  for (const dx of [4, 7.5]) cy(g, 0.9, 3, t.paintBlue, W.x + dx, 1.5, W.z, 18);
  bx(g, 1.6, 1.2, 1.6, t.paintYellow, W.x + 10.5, 0.6, W.z);
  cy(g, 2.2, 5, t.steel, W.x + 14, 2.5, W.z, 24);
  fpipe(g, anim, [[W.x + 1.2, 1.0, W.z + 1.4], [W.x + 1.2, 1.0, W.z + 2.4], [W.x + 14, 1.0, W.z + 2.4], [W.x + 14, 1.0, W.z + 1.0]], 0.16, m.pipe.feedwater, DOT.water, 2.5, 1.6);
  fpipe(g, anim, [[W.x + 16.2, 1.0, W.z], [78, 1.0, W.z], [78, 1.0, B.z + 3.2], [B.x - 4, 1.0, B.z + 3.2]], 0.16, m.pipe.feedwater, DOT.water, 2.5, 1.6);
  board(g, t.steelDark, 'Water Plant', W.x + 7, W.z + 6, 6);
  board(g, t.steelDark, 'Boiler House', B.x, B.z + 8, 7);
  board(g, t.steelDark, 'Dyeing & Finishing', D.x, -44, 12);
  return { id: 'dyeing', nameBn: 'Dyeing, Finishing & Boiler House', group: g };
}
