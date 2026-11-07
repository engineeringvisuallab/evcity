import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L, SITE } from '../layout';
import { bx, cy, fpipe } from './helpers';

/** Gate, roads, administration with the live production board, electrical substation, fire water tank and pump, street lights, muster point. */
export function buildSiteWorks({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  const rz = L.roadZ;
  const mz = L.midRoadZ;

  // incoming power: pylon -> transformer -> low-voltage cable along the spine road (first moving thing in the site)
  const S = L.substation;
  for (const dz of [-2.2, 2.2]) box(g, 0.4, 14, 0.4, m.steel, SITE.maxX - 2, 0, S.z + dz);
  box(g, 0.4, 0.4, 6, m.steel, SITE.maxX - 2, 13, S.z);
  box(g, 3.4, 3.2, 2.6, t.paintGreen, S.x, 0, S.z);
  for (const dx of [-1, 0, 1]) cy(g, 0.15, 1.2, t.paintYellow, S.x + dx, 3.8, S.z, 8);
  const hv = fpipe(g, anim, [[SITE.maxX - 2, 12.8, S.z], [S.x, 12.8, S.z], [S.x, 4.4, S.z]], 0.1, m.pipe.steam, DOT.power, 4, 2);
  hv.name = 'fx';
  fpipe(g, anim, [[S.x - 1.8, 0.4, S.z], [S.x - 8, 0.4, S.z], [S.x - 8, 0.4, rz + 6], [-140, 0.4, rz + 6]], 0.14, m.pipe.cooling, DOT.power, 5, 3);
  box(g, 10, 0.05, 6, m.concreteDark, S.x - 2, 0, S.z);
  bx(g, 4.6, 2.4, 2.0, t.paintYellow, S.x + 8, 1.2, S.z);
  bx(g, 0.4, 3.2, 0.4, t.steelDark, S.x + 9.4, 3.2, S.z + 0.6);
  const sgS = makeSign('Substation & Standby Generator', 12, 1.2);
  sgS.position.set(S.x + 3, 5.2, S.z + 4);
  g.add(sgS);

  // roads
  road(g, m.asphalt, -146, rz, 146, rz, 8);
  road(g, m.asphalt, -146, mz, 146, mz, 8);
  road(g, m.asphalt, G.x, mz, G.x, G.z, 8);
  for (let x = -140; x < 146; x += 10) {
    box(g, 4, 0.02, 0.2, m.white, x, 0.07, rz);
    box(g, 4, 0.02, 0.2, m.white, x, 0.07, mz);
  }
  for (let z = rz + 6; z < G.z - 4; z += 8) box(g, 0.2, 0.02, 3.5, m.white, G.x, 0.07, z);
  // gate house, barrier, sign
  building(g, m, { x: G.x + 8, z: G.z - 6, w: 6, d: 5, h: 3.2, door: 'W' });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x + 4.4, 0, G.z - 2);
  box(g, 4.4, 0.2, 0.2, m.red, G.x + 2.2, 3.0, G.z - 2);
  const sign = makeSign('Textile & Garments Factory', 16, 2.2);
  sign.position.set(G.x, 6.4, G.z + 3);
  g.add(sign);
  for (const dx of [-8.4, 8.4]) box(g, 0.5, 6.4, 0.5, m.steel, G.x + dx, 0, G.z + 3);

  // administration (2 floors) + car park with bicycle racks
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: A.h, floors: 2, door: 'N' });
  box(g, A.w + 6, 0.05, 10, m.asphalt, A.x, 0, A.z - A.d / 2 - 4);
  for (let i = 0; i < 8; i++) box(g, 0.12, 0.9, 1.6, t.steelDark, A.x - 11 + i * 3, 0, A.z - A.d / 2 - 3);

  // production board on the north wall of the administration, seen from the spine road: bars = cumulative output of each stage in this shift
  const bz = A.z - A.d / 2 - 0.35;
  bx(g, 20, 5.4, 0.2, t.screenOff, A.x, 4.6, bz);
  const bars: { mesh: THREE.Mesh; k: number }[] = [];
  const mats5 = [t.barCotton, t.barYarn, t.barFabric, t.barDyed, t.barGarment];
  const names = ['Cotton', 'Yarn', 'Fabric', 'Dyed', 'Garments'];
  for (let k = 0; k < 5; k++) {
    const x = A.x - 8 + k * 4;
    const bar = bx(g, 2.2, 1, 0.12, mats5[k], x, 3, bz - 0.15);
    bars.push({ mesh: bar, k });
    const nm = makeSign(names[k], 3.2, 0.8);
    nm.position.set(x, 1.1, bz - 0.25);
    nm.rotation.y = Math.PI;
    g.add(nm);
  }
  const ttl = makeSign('Production this shift', 10, 1.2);
  ttl.position.set(A.x, 7.9, bz - 0.25);
  ttl.rotation.y = Math.PI;
  g.add(ttl);
  every(anim, () => {
    sim.update(anim.time);
    for (const b of bars) {
      const v = Math.max(0.03, sim.stage[b.k]);
      b.mesh.scale.y = v * 3.4;
      b.mesh.position.y = 1.7 + (v * 3.4) / 2;
    }
  });

  // fire safety: water tank, fire pump house, hydrants every 30 m along the spine road, muster point
  const F = L.fire;
  cy(g, 4.2, 8, t.paintRed, F.x, 4, F.z, 28);
  bx(g, 9, 0.4, 9, m.concreteDark, F.x, 0.2, F.z);
  building(g, m, { x: F.x + 12, z: F.z, w: 7, d: 6, h: 3.6, door: 'N' });
  fpipe(g, anim, [[F.x + 4.2, 0.6, F.z + 2], [F.x + 9, 0.6, F.z + 2], [F.x + 9, 0.6, rz + 5], [-140, 0.6, rz + 5]], 0.2, m.pipe.feedwater, DOT.water, 3, 2.5);
  for (let x = -130; x < 140; x += 30) {
    cy(g, 0.14, 0.9, t.paintRed, x, 0.5, rz + 5, 8);
    bx(g, 0.5, 0.18, 0.18, t.paintRed, x, 0.9, rz + 5);
  }
  const ms = makeSign('Muster Point', 4, 1.2);
  ms.position.set(-146, 3.2, 74);
  ms.rotation.y = Math.PI / 2;
  g.add(ms);
  cy(g, 0.1, 3.2, t.steel, -146, 1.6, 74, 8);

  // street lights
  for (let x = -138; x < 146; x += 24) {
    lightPole(g, m, x, rz - 5, 1);
    lightPole(g, m, x, mz + 5, 1);
  }
  for (let z = rz + 14; z < G.z - 6; z += 18) lightPole(g, m, G.x + 5, z, 1);
  return { id: 'gate', nameBn: 'Main Gate, Administration & Safety', group: g };
}
