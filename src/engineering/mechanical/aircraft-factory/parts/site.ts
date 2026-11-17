import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import type { Mats } from '../../../core/materials';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import { L, SITE } from '../layout';

/** A painted outline of a plot on the ground (four thin strips). */
function outline(g: THREE.Group, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, w = 0.5): void {
  box(g, x1 - x0, 0.03, w, mat, (x0 + x1) / 2, 0.08, z0);
  box(g, x1 - x0, 0.03, w, mat, (x0 + x1) / 2, 0.08, z1);
  box(g, w, 0.03, z1 - z0, mat, x0, 0.08, (z0 + z1) / 2);
  box(g, w, 0.03, z1 - z0, mat, x1, 0.08, (z0 + z1) / 2);
}

/** The boundary: a low concrete plinth with a steel fence on top, posts every 12 m; gaps for the main gate (south) and the rollout road (west). */
function boundary(g: THREE.Group, m: Mats): void {
  const gaps = { south: [L.gate.x - 7, L.gate.x + 7], west: [L.door.z - 15, L.door.z + 15] };
  const seg = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const w = alongX ? len : 0.35, d = alongX ? 0.35 : len;
    box(g, w, 0.9, d, m.concrete, cx, 0, cz); // plinth
    box(g, alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, m.steel, cx, 1.3, cz); // lower rail
    box(g, alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, m.steel, cx, 2.5, cz); // upper rail
    const n = Math.max(1, Math.round(len / 12));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(g, 0.25, 2.7, 0.25, m.steel, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    }
  };
  const { minX, maxX, minZ, maxZ } = SITE;
  seg(minX, minZ, maxX, minZ); // north
  seg(maxX, minZ, maxX, maxZ); // east
  seg(minX, maxZ, gaps.south[0], maxZ); // south, left of the gate
  seg(gaps.south[1], maxZ, maxX, maxZ); // south, right of the gate
  seg(minX, minZ, minX, gaps.west[0]); // west, north of the rollout road
  seg(minX, gaps.west[1], minX, maxZ); // west, south of the rollout road
  for (const [x, z] of [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]) box(g, 0.7, 3.4, 0.7, m.steel, x, 0, z);
}

/** The site works of the future aircraft factory: boundary, gate house + sign, the spine road, the road to the gate, the car park, street lights, the taxi strips from the
 * west rollout gate to the old airport's taxiway, a visitor centre, and painted outlines of the plots the hall, the parts shop and the stations will stand on. */
export function buildSiteWorks(m: Mats): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  boundary(g, m);
  road(g, m.asphalt, -186, 0, 182, 0, 9);
  for (let x = -180; x < 176; x += 9) box(g, 4, 0.02, 0.2, m.white, x, 0.07, 0);
  road(g, m.asphalt, L.gate.x, 0, L.gate.x, L.gate.z, 9);
  for (let z = 6; z < L.gate.z - 4; z += 9) box(g, 0.2, 0.02, 4, m.white, L.gate.x, 0.07, z);
  building(g, m, { x: L.gate.x + 8, z: L.gate.z - 6, w: 5, d: 6, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, L.gate.x - 4.5, 0, L.gate.z - 3);
  box(g, 4.6, 0.2, 0.2, m.red, L.gate.x - 2.2, 3.0, L.gate.z - 3);
  const sign = makeSign('Aircraft Factory', 12, 2.2);
  sign.position.set(L.gate.x, 6.4, L.gate.z + 1.5);
  g.add(sign);
  for (const dx of [-6.4, 6.4]) box(g, 0.5, 6.4, 0.5, m.steel, L.gate.x + dx, 0, L.gate.z + 1.5);
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: A.h, floors: 2, door: 'N' });
  box(g, A.w + 6, 0.05, 12, m.asphalt, A.x, 0, A.z - A.d / 2 - 7);
  box(g, 96, 0.05, 20, m.asphalt, 10, 0, 100);
  for (let x = -36; x <= 56; x += 4) box(g, 0.15, 0.02, 5, m.white, x, 0.08, 100);
  for (let x = -176; x < 170; x += 26) { lightPole(g, m, x, 5, 1); lightPole(g, m, x + 13, -5, -1); }
  // the way out of the west gate: taxi strips to the corner, then north to the airport taxiway (one aeroplane width = 26 m), with a yellow centre line
  const cx0 = L.corner.x, cz0 = L.corner.z, tz = -135;
  road(g, m.asphalt, SITE.minX, cz0, cx0 - 13, cz0, 26);
  road(g, m.asphalt, cx0, cz0 + 13, cx0, tz, 26);
  box(g, Math.abs(cx0 - SITE.minX), 0.02, 0.4, m.yellow, (SITE.minX + cx0) / 2, 0.08, cz0);
  box(g, 0.4, 0.02, Math.abs(tz - cz0), m.yellow, cx0, 0.08, (tz + cz0) / 2);
  // painted plot outlines: the assembly hall, the parts shop, and the five stations along the line
  const H = L.hall;
  outline(g, m.yellow, H.x0, H.z0, H.x1, H.z1, 0.7);
  outline(g, m.yellow, L.cnc.x - L.cnc.w / 2, L.cnc.z - L.cnc.d / 2, L.cnc.x + L.cnc.w / 2, L.cnc.z + L.cnc.d / 2, 0.7);
  for (const x of Object.values(L.st)) outline(g, m.white, x - 28, H.z0 + 6, x + 28, H.z1 - 6, 0.3);
  return { id: 'gate', nameBn: 'Main Gate, Boundary & Roads', group: g };
}
