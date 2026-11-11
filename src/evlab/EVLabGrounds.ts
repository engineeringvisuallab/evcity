// EVLab Tower: the plot around the building: plaza with a reflecting pool, a central avenue with lamps, flagpoles and trees. Building-local coordinates (see EVLabLayout).
import * as THREE from 'three';
import { BLD } from './EVLabLayout';
import { mulberry32 } from '../structures';
import type { Parts } from './EVLabParts';

export interface GroundsBuild {
  group: THREE.Group;
  /** 0 (day) .. 1 (night): the lamps glow. */
  setNight(k: number): void;
  update(t: number): void;
}

export function buildGrounds(P: Parts): GroundsBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabGrounds';
  const y = 0.05; // just above the levelled terrain
  const zs = BLD.hz + 2; // plaza starts at the portal canopy line
  const stone = P.lit(t.stone, 0xffffff, 0.15), marble = P.lit(t.marbleCream, 0xffffff, 0.3), gold = P.gold();
  const asphalt = P.lit(null, 0x3a3d42, 0.05), line = P.lit(null, 0xe8e2c8, 0.0);

  // plaza and pool
  P.hplane(g, -70, 70, zs, zs + 100, y, stone, 8, 8);
  P.tbox(g, -71, 71, zs + 100, zs + 101, 0, y + 0.3, marble);
  const pw = 24, pz0 = zs + 34, pz1 = zs + 88;
  P.tbox(g, -pw - 1, pw + 1, pz0 - 1, pz1 + 1, y, y + 0.35, marble);
  const water = k.own(new THREE.MeshPhongMaterial({ color: 0x2b7a9a, specular: 0xbfe6ff, shininess: 120, transparent: true, opacity: 0.88 }));
  P.hplane(g, -pw, pw, pz0, pz1, y + 0.3, water);
  for (const x of [-12, 0, 12]) P.cyl(g, 0.12, 0.12, 4.5, x, y + 2.3, (pz0 + pz1) / 2, gold, 8); // fountain jets (static)

  // avenue south of the plaza, 16 m wide, dashed centre line
  const az1 = zs + 100 + 120;
  P.hplane(g, -8, 8, zs + 101, az1, y, asphalt);
  for (let z = zs + 106; z < az1 - 4; z += 10) P.hplane(g, -0.15, 0.15, z, z + 4, y + 0.01, line);

  // lamps along both sides of the avenue and around the plaza
  const lampPos: Array<[number, number]> = [];
  for (let z = zs + 110; z < az1; z += 18) for (const x of [-10, 10]) lampPos.push([x, z]);
  for (let x = -60; x <= 60; x += 20) lampPos.push([x, zs + 8]);
  const poleGeo = k.own(new THREE.CylinderGeometry(0.1, 0.14, 6, 6)), lampGeo = k.own(new THREE.SphereGeometry(0.4, 8, 6));
  const poleMat = k.own(new THREE.MeshLambertMaterial({ color: 0x23262b }));
  const lampMat = k.own(new THREE.MeshBasicMaterial({ color: 0x555044 }));
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPos.length), lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPos.length);
  const o = new THREE.Object3D();
  lampPos.forEach(([x, z], i) => {
    o.position.set(x, 3, z); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
    o.position.set(x, 6.2, z); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix);
  });
  poles.frustumCulled = lamps.frustumCulled = false;
  g.add(poles, lamps);

  // flagpoles in front of the canopy
  const flagMat = k.own(new THREE.MeshLambertMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
  const flags: THREE.Mesh[] = [];
  [-40, -32, 32, 40].forEach((x, i) => {
    P.cyl(g, 0.12, 0.18, 16, x, y + 8, zs + 14, stone, 6);
    const fl = new THREE.Mesh(k.own(new THREE.PlaneGeometry(4, 2.4)), i % 2 ? flagMat : k.own(new THREE.MeshLambertMaterial({ color: 0x1f5f9a, side: THREE.DoubleSide })));
    fl.position.set(x + 2.1, y + 14.6, zs + 14);
    g.add(fl);
    flags.push(fl);
  });

  // trees: instanced trunks + crowns on the lawns (never on the building, plaza, pool or avenue)
  const r = mulberry32(4242);
  const spots: Array<[number, number, number]> = [];
  let guard = 0;
  while (spots.length < 140 && guard++ < 2000) {
    const x = (r() - 0.5) * 460, z = -200 + r() * 420;
    if (Math.abs(x) < BLD.hx + 14 && z > -BLD.hz - 14 && z < BLD.hz + 14) continue; // building
    if (Math.abs(x) < 78 && z > zs - 4 && z < zs + 104) continue; // plaza
    if (Math.abs(x) < 14 && z > zs) continue; // avenue
    spots.push([x, z, 0.8 + r() * 0.7]);
  }
  const trunk = new THREE.InstancedMesh(k.own(new THREE.CylinderGeometry(0.3, 0.45, 5, 6)), k.own(new THREE.MeshLambertMaterial({ color: 0x5a3f28 })), spots.length);
  const crown = new THREE.InstancedMesh(k.own(new THREE.IcosahedronGeometry(3.2, 0)), k.own(new THREE.MeshLambertMaterial({ color: 0x3f7f3a })), spots.length);
  const c = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    o.position.set(x, 2.5 * s, z); o.scale.setScalar(s); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
    o.position.set(x, 7 * s, z); o.updateMatrix(); crown.setMatrixAt(i, o.matrix);
    crown.setColorAt(i, c.setHSL(0.27 + r() * 0.06, 0.45, 0.28 + r() * 0.1));
  });
  trunk.frustumCulled = crown.frustumCulled = false;
  g.add(trunk, crown);

  const dayLamp = new THREE.Color(0x555044), nightLamp = new THREE.Color(0xffe6a8);
  return {
    group: g,
    setNight: (n) => { lampMat.color.copy(dayLamp).lerp(nightLamp, n); },
    update: (tt) => { flags.forEach((f, i) => { f.rotation.y = Math.sin(tt * 2.1 + i) * 0.25; f.scale.x = 0.92 + Math.sin(tt * 3.3 + i * 1.7) * 0.06; }); },
  };
}
