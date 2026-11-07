import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, ctank, tank } from '../../../core/prims';
import { every, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { board, bx, cy, fpipe } from './helpers';

/** Effluent treatment plant: screen, equalisation, neutralisation + coagulation, aeration basin (8 aerators), clarifier with a turning scraper, sludge thickener and drying beds, monitoring tank, discharge to the canal. */
export function buildEtp({ mats: m, t, site, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'etp';
  const sew = m.pipe.sewage;
  const out = m.pipe.effluent;
  const y = 1.2;

  // 1) screen chamber with a bar screen and a rake
  tank(g, site, m, { x: 79, z: 10, w: 7, d: 5, depth: 2, top: 0.8, water: t.waterDye });
  for (let i = 0; i < 6; i++) bx(g, 0.06, 1.2, 0.06, t.steelDark, 77.8 + i * 0.4, 0.9, 10);
  bx(g, 0.5, 0.1, 2.4, t.paintYellow, 79.8, 1.6, 10);
  // 2) equalisation tank: the flow and the strength of the waste water change all day, so it is stored and mixed here
  tank(g, site, m, { x: 93, z: 12, w: 14, d: 12, depth: 3, top: 0.8, water: t.waterDye });
  bx(g, 14.4, 0.2, 0.8, t.steelDark, 93, 1.3, 12);
  cy(g, 0.1, 2.4, t.steelDark, 93, 0.2, 12, 8);
  const mix = new THREE.Group();
  mix.position.set(93, -0.7, 12);
  bx(mix, 2.2, 0.08, 0.25, t.steel, 0, 0, 0);
  g.add(mix);
  spin(anim, mix, 'y', 3);
  // 3) neutralisation (acid or lime brings the pH to the right value) and coagulation (alum makes the colour stick into flocs)
  tank(g, site, m, { x: 107, z: 10, w: 6, d: 6, depth: 2.5, top: 0.8, water: t.waterNeutral });
  tank(g, site, m, { x: 115, z: 10, w: 6, d: 6, depth: 2.5, top: 0.8, water: t.waterNeutral });
  for (const x of [107, 115]) {
    cy(g, 0.8, 2.2, t.paintYellow, x, 0, 17, 16);
    fpipe(g, anim, [[x, 2.2, 17], [x, 2.6, 17], [x, 2.6, 13.4], [x, 1.2, 13.4], [x, 1.2, 11.8]], 0.1, m.pipe.chemical, DOT.chem, 1.5, 1.1);
    const pad = new THREE.Group();
    pad.position.set(x, -0.5, 10);
    bx(pad, 2.0, 0.08, 0.22, t.steel, 0, 0, 0);
    g.add(pad);
    spin(anim, pad, 'y', 4);
  }
  // 4) aeration basin: microbes eat the dissolved organic waste, they need oxygen: surface aerators beat air into the water
  tank(g, site, m, { x: 100, z: 34, w: 28, d: 14, depth: 4, top: 0.8, water: t.waterAer });
  const level = 0.1;
  for (const z of [31, 37]) {
    for (const x of [90, 96, 102, 108]) {
      bx(g, 1.8, 0.3, 1.8, t.paintYellow, x, level + 0.05, z);
      const ring = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), t.foam);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, level + 0.04, z);
      g.add(ring);
      const rot = new THREE.Group();
      rot.position.set(x, level + 0.35, z);
      for (let k = 0; k < 4; k++) {
        const blade = bx(rot, 1.4, 0.08, 0.2, t.steel, 0, 0, 0);
        blade.rotation.y = (k * Math.PI) / 4;
      }
      g.add(rot);
      spin(anim, rot, 'y', 5);
    }
  }
  bx(g, 28.4, 0.12, 0.5, t.steelDark, 100, 0.95, 34);
  // 5) clarifier: the sludge settles, a slow scraper pushes it to the middle; clear water spills over the edge
  const cx0 = 128;
  const cz0 = 36;
  ctank(g, site, m, { x: cx0, z: cz0, r: 8, depth: 3.5, top: 0.6, water: t.waterSettled });
  bx(g, 8.4, 0.2, 1.0, t.steelDark, cx0 - 4, 1.0, cz0);
  cy(g, 0.6, 1.4, t.steel, cx0, 0.2, cz0, 14);
  const scraper = new THREE.Group();
  scraper.position.set(cx0, -0.1, cz0);
  bx(scraper, 15, 0.12, 0.3, t.paintRed, 0, 0, 0);
  g.add(scraper);
  spin(anim, scraper, 'y', 0.5);
  // sludge thickener (circular, deep) and drying beds
  ctank(g, site, m, { x: 128, z: 18, r: 4, depth: 3, top: 0.6, water: t.waterNeutral });
  const arm = new THREE.Group();
  arm.position.set(128, -0.1, 18);
  bx(arm, 7, 0.1, 0.2, t.steelDark, 0, 0, 0);
  g.add(arm);
  spin(anim, arm, 'y', 0.6);
  for (const x of [92, 100, 108]) {
    for (const [dx, dz, w, d] of [[0, -2.5, 7, 0.25], [0, 2.5, 7, 0.25], [-3.5, 0, 0.25, 5], [3.5, 0, 0.25, 5]] as [number, number, number, number][]) box(g, w, 0.6, d, m.concrete, x + dx, 0, 47 + dz);
    box(g, 6.6, 0.35, 4.6, t.sludgeBed, x, 0, 47);
  }
  // 6) monitoring tank: sensors (pH, COD, colour) check the water before it leaves
  tank(g, site, m, { x: 141, z: 14, w: 8, d: 8, depth: 2, top: 0.8, water: t.waterTreated });
  cy(g, 0.1, 3.6, t.steelDark, 138, 0, 18.6, 8);
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) leds.push(bx(g, 0.22, 0.22, 0.05, t.ledGreen, 138, 3.0 - i * 0.4, 18.76));
  every(anim, (tt) => {
    leds.forEach((l, i) => {
      l.material = Math.sin(tt * 1.5 + i) > -0.9 ? t.ledGreen : t.ledAmber;
    });
  });
  // outfall to the canal
  bx(g, 1.6, 1.2, 1.6, m.concrete, 150.4, 0, 14);

  // flows: waste water (dark) on its way, treated water (blue) at the end, chemicals (yellow), sludge (brown)
  fpipe(g, anim, [[73, y, 10], [76.4, y, 10]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[82.5, y, 10], [86, y, 10], [86, y, 12]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[100, y, 12], [104, y, 12], [104, y, 10]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[110, y, 10], [112, y, 10]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[118, y, 10], [121, y, 10], [121, y, 22], [107, y, 22], [107, y, 27]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[114, y, 34], [120, y, 34]], 0.2, sew, DOT.effluent, 2, 1.6);
  fpipe(g, anim, [[136, y, 36], [141, y, 36], [141, y, 18]], 0.2, out, DOT.treated, 2, 1.6);
  fpipe(g, anim, [[145, 1.0, 14], [151, 1.0, 14]], 0.2, out, DOT.treated, 2, 1.6);
  fpipe(g, anim, [[128, 0.8, 44.2], [128, 0.8, 43], [100, 0.8, 43], [100, 0.8, 41.3]], 0.14, m.pipe.sludge, DOT.sludge, 1.5, 1.6);
  fpipe(g, anim, [[128, 0.8, 28], [128, 0.8, 22.2]], 0.14, m.pipe.sludge, DOT.sludge, 1.5, 1.6);
  board(g, t.steelDark, 'Effluent Treatment Plant (ETP)', 110, 55, 14);
  board(g, t.steelDark, 'Treated Water to Canal', 146, 20, 8);
  return { id: 'etp', nameBn: 'Effluent Treatment Plant', group: g };
}
