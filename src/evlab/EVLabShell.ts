import * as THREE from 'three';
import { BLD, PORTAL, type Solid } from './EVLabLayout';
import { CORE, rectMinus } from './EVLabTowerLayout';
import { Parts } from './EVLabParts';

export interface ShellBuild {
  group: THREE.Group;
  solids: Solid[];
  /** 0 (day) .. 1 (night): the tower windows and the crown light up. */
  setNight(k: number): void;
  update(t: number): void;
}

/**
 * The outside of the EVLab podium: a 150 x 100 m glass-and-stone base with a grand portal and canopy (the tall tower is EVLabFacade). Building-local coordinates (see EVLabLayout).
 */
export function buildShell(P: Parts): ShellBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabShell';
  const solids: Solid[] = [];
  const hx = BLD.hx, hz = BLD.hz, H = BLD.H, top = BLD.roofTop;
  const stone = P.lit(t.stone, 0xffffff, 0.12);
  const marble = P.lit(t.marbleCream, 0xffffff, 0.14);
  const gold = P.gold();
  const goldGlow = P.glow(0xffd27a, 1.2, 0xd4af37);

  // ---------------------------------------------------------------- podium: glass curtain walls with warm glow behind, stone piers, gold cornice
  const glass = new THREE.MeshLambertMaterial({ map: t.podium, emissiveMap: t.podiumGlow, emissive: 0xffffff, emissiveIntensity: 0.55 });
  k.own(glass);
  const wall = (axis: 'x' | 'z', at: number, a0: number, a1: number, face: 1 | -1): void => {
    P.vplane(g, axis, at, a0, a1, 0, H, face, glass, 5, 8.5);
  };
  // north, east, west: full glass (the interior linings are behind them; a stone core wall keeps the light out)
  P.tbox(g, -hx, hx, -hz, -hz + 1, 0, H, stone, 8, 8); // north wall
  P.tbox(g, hx - 1, hx, -hz, hz, 0, H, stone, 8, 8); // east wall
  P.tbox(g, -hx, -hx + 1, -hz, hz, 0, H, stone, 8, 8); // west wall
  solids.push([-hx, hx, -hz, -hz + 1, 0, H], [hx - 1, hx, -hz, hz, 0, H], [-hx, -hx + 1, -hz, hz, 0, H]);
  wall('z', -hz - 0.04, -hx, hx, -1);
  wall('x', hx + 0.04, -hz, hz, 1);
  wall('x', -hx - 0.04, -hz, hz, -1);
  // south wall with the portal opening (x in +-9, 11 m high)
  const pw = PORTAL.halfW;
  P.tbox(g, -hx, -pw, hz - 1, hz, 0, H, stone, 8, 8);
  P.tbox(g, pw, hx, hz - 1, hz, 0, H, stone, 8, 8);
  P.tbox(g, -pw, pw, hz - 1, hz, PORTAL.h, H, stone, 8, 8);
  solids.push([-hx, -pw, hz - 1, hz, 0, H], [pw, hx, hz - 1, hz, 0, H], [-pw, pw, hz - 1, hz, PORTAL.h, H]);
  P.vplane(g, 'z', hz + 0.04, -hx, -pw, 0, H, 1, glass, 5, 8.5);
  P.vplane(g, 'z', hz + 0.04, pw, hx, 0, H, 1, glass, 5, 8.5);
  P.vplane(g, 'z', hz + 0.04, -pw, pw, PORTAL.h, H, 1, stone, 8, 6);
  // portal jambs in gold
  P.tbox(g, -pw - 0.5, -pw, hz - 1.2, hz + 0.6, 0, PORTAL.h, gold);
  P.tbox(g, pw, pw + 0.5, hz - 1.2, hz + 0.6, 0, PORTAL.h, gold);
  // stone piers every 15 m on the south and the sides, with gold edges
  const pierGeo = k.own(new THREE.BoxGeometry(1.6, H + 1.2, 1.4));
  const piers = new THREE.InstancedMesh(pierGeo, marble, 40);
  const o = new THREE.Object3D();
  let pi = 0;
  for (let x = -hx; x <= hx + 0.1; x += 15) {
    if (Math.abs(x) < pw + 1.5) continue;
    for (const z of [hz + 0.5]) { o.position.set(x, (H + 1.2) / 2, z); o.updateMatrix(); piers.setMatrixAt(pi++, o.matrix); }
  }
  for (let z = -hz + 12.5; z < hz; z += 12.5) for (const x of [-hx - 0.5, hx + 0.5]) { o.position.set(x, (H + 1.2) / 2, z); o.rotation.y = Math.PI / 2; o.updateMatrix(); piers.setMatrixAt(pi++, o.matrix); o.rotation.y = 0; }
  piers.count = pi;
  piers.frustumCulled = false;
  g.add(piers);
  // cornice, roof slab and parapet
  P.tbox(g, -hx - 1, hx + 1, -hz - 1, hz + 1.4, H, H + 0.9, marble, 8, 4);
  P.tbox(g, -hx - 1.2, hx + 1.2, -hz - 1.2, hz + 1.6, H + 0.9, H + 1.15, goldGlow);
  const coreHole = [[CORE.x0, CORE.x1, CORE.z0, CORE.z1]] as const;
  // the roof slab and its collider have a hole where the tower core (stairs + glass lift shafts) goes through
  for (const b of rectMinus(-hx, hx, -hz, hz, coreHole)) P.tbox(g, b[0], b[1], b[2], b[3], H, top, stone, 8, 4);
  for (const b of rectMinus(-hx - 1, hx + 1, -hz - 1, hz + 1.4, coreHole)) solids.push([b[0], b[1], b[2], b[3], H, top + 0.1]);
  for (const b of rectMinus(-hx, hx, -hz, hz, coreHole)) P.hplane(g, b[0], b[1], b[2], b[3], top + 0.01, marble, 8, 8);
  for (const [a, b, c, d] of [[-hx, hx, -hz, -hz + 0.5], [-hx, hx, hz - 0.5, hz], [-hx, -hx + 0.5, -hz, hz], [hx - 0.5, hx, -hz, hz]] as const) P.tbox(g, a, b, c, d, top, top + 1.1, marble, 8, 4);

  // ---------------------------------------------------------------- the portal canopy: gilded slab, glowing underside, four columns
  const cw = 15, cd0 = hz, cd1 = hz + 16;
  P.tbox(g, -cw, cw, cd0, cd1, PORTAL.h + 0.6, PORTAL.h + 1.5, marble, 8, 4);
  P.tbox(g, -cw - 0.2, cw + 0.2, cd1 - 0.1, cd1 + 0.2, PORTAL.h + 0.5, PORTAL.h + 1.6, goldGlow);
  P.hplane(g, -cw, cw, cd0, cd1, PORTAL.h + 0.58, P.glow(0xffe2a8, 1.1, 0xf3e6c8), 4, 4, false);
  for (const x of [-cw + 1.2, cw - 1.2]) for (const z of [cd1 - 1.2]) {
    P.cyl(g, 0.7, 0.8, PORTAL.h + 0.6, x, (PORTAL.h + 0.6) / 2, z, marble, 24);
    P.cyl(g, 1.0, 1.0, 0.4, x, 0.2, z, gold, 24);
    P.cyl(g, 1.0, 1.0, 0.4, x, PORTAL.h + 0.4, z, gold, 24);
    solids.push([x - 0.9, x + 0.9, z - 0.9, z + 0.9, 0, PORTAL.h + 1.6]);
  }
  solids.push([-cw, cw, cd0, cd1, PORTAL.h + 0.6, PORTAL.h + 1.5]);
  // the EVLAB plate over the portal
  P.vplane(g, 'z', hz + 0.08, -12, 12, 13.2, 16.4, 1, k.own(new THREE.MeshBasicMaterial({ map: t.logo, toneMapped: false })), 24, 3.2);
  P.tbox(g, -12.4, 12.4, hz + 0.0, hz + 0.07, 12.9, 16.7, gold);

  return {
    group: g,
    solids,
    setNight: (n) => {
      glass.emissiveIntensity = 0.5 + 0.6 * n;
    },
    update: (tt) => {
      void tt;
    },
  };
}
