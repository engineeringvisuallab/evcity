import * as THREE from 'three';
import { addChandeliers } from './EVLabHall';
import { BLD, DIVIDER, HALL, RAMP, REAR_Y, type Ramp, type Solid } from './EVLabLayout';
import { Parts } from './EVLabParts';
import { CORE, rectMinus } from './EVLabTowerLayout';

export interface LobbyBuild {
  group: THREE.Group;
  solids: Solid[];
  ramps: Ramp[];
  update(t: number): void;
}

const H = BLD.H;
const XI = BLD.hx - 1; // inner side of the east / west walls
const ZS = BLD.hz - 1; // inner side of the south wall
const ZN = -BLD.hz + 1; // inner side of the north wall

/**
 * The grand lobby (150 m x 35 m, 17 m high, marble and gold) with the entrance ramps up to the hall, and the two gallery corridors on the sides.
 * Building-local coordinates (see EVLabLayout).
 */
export function buildLobby(P: Parts): LobbyBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabLobby';
  const solids: Solid[] = [];
  const ramps: Ramp[] = [];
  const anim: Array<(tt: number) => void> = [];
  const marble = P.lit(t.marbleCream, 0xffffff, 0.34);
  const dark = P.lit(t.marbleDark, 0xffffff, 0.3);
  const stone = P.lit(t.stone, 0xffffff, 0.3);
  const gold = P.gold();
  const cove = P.glow(0xffe2a8, 1.1);
  const zl0 = DIVIDER.z + 0.5; // lobby starts at the divider wall

  // ---------------------------------------------------------------- floor
  P.hplane(g, -XI, XI, zl0, ZS, 0.004, marble, 6, 6);
  P.hplane(g, HALL.x1 + 1, XI, HALL.z0, zl0, 0.004, marble, 6, 6); // east gallery floor
  P.hplane(g, -XI, -(HALL.x1 + 1), HALL.z0, zl0, 0.004, marble, 6, 6); // west gallery floor
  // (the middle of the lobby is the tower core now: two stairs and two glass lifts, see EVLabCore)

  // ---------------------------------------------------------------- walls (inner lining), ceiling, cove
  P.vplane(g, 'x', -XI + 0.03, zl0, ZS, 0, H, 1, P.lit(t.wood, 0xffffff, 0.34), 7, 8);
  P.vplane(g, 'x', XI - 0.03, zl0, ZS, 0, H, -1, P.lit(t.wood, 0xffffff, 0.34), 7, 8);
  P.vplane(g, 'z', ZS - 0.03, -XI, XI, 0, H, -1, stone, 8, 8);
  for (const b of rectMinus(-XI, XI, zl0, ZS, [[CORE.x0, CORE.x1, CORE.z0, CORE.z1]])) P.hplane(g, b[0], b[1], b[2], b[3], H, P.lit(t.ceiling, 0xffffff, 0.45), 6, 6, false);
  P.tbox(g, -XI, XI, zl0, zl0 + 0.7, H - 0.5, H - 0.2, cove);
  P.tbox(g, -XI, XI, ZS - 0.7, ZS, H - 0.5, H - 0.2, cove);
  for (const x of [-48, -24, 24, 48]) P.tbox(g, x - 0.25, x + 0.25, zl0, ZS, H - 0.25, H - 0.05, cove);
  addChandeliers(P, g, [[-48, 30], [48, 30], [-24, 42], [24, 42]], 13.4, 1.0);

  // columns: marble shafts with gold bases and capitals
  for (const x of [-52, -30, 30, 52]) {
    for (const z of [22, 42]) {
      P.cyl(g, 0.95, 1.0, H - 1.2, x, (H - 1.2) / 2 + 0.6, z, marble, 28);
      P.cyl(g, 1.35, 1.35, 0.6, x, 0.3, z, gold, 28);
      P.cyl(g, 1.35, 1.35, 0.6, x, H - 0.3, z, gold, 28);
      solids.push([x - 1.1, x + 1.1, z - 1.1, z + 1.1, 0, H]);
    }
  }

  // ---------------------------------------------------------------- the three entrance ramps up to the hall (carpet + gold rails)
  const rampMat = P.lit(t.carpet, 0xffffff, 0.32);
  for (const [a, b] of DIVIDER.openings) {
    P.slope(g, a, b, RAMP.z1, 0, zl0, REAR_Y, rampMat, 4, 4);
    ramps.push({ x0: a, x1: b, zA: RAMP.z1, yA: 0, zB: zl0, yB: REAR_Y });
    for (const x of [a - 0.12, b + 0.12]) {
      const len = Math.hypot(RAMP.z1 - zl0, REAR_Y);
      const rail = P.tbox(g, x - 0.06, x + 0.06, 0, len, 0, 0.12, gold);
      rail.position.set(x, REAR_Y / 2 + 1.0, (RAMP.z1 + zl0) / 2);
      rail.rotation.x = -Math.atan2(REAR_Y, RAMP.z1 - zl0) * -1;
    }
  }
  // the two long steps' risers in marble under the ramps would be hidden: nothing else is needed

  // ---------------------------------------------------------------- feature wall on the divider (lobby side): logo, art, gold frames
  P.vplane(g, 'z', DIVIDER.z + 0.56, -9, 9, 9.2, 13.8, 1, k.own(new THREE.MeshBasicMaterial({ map: t.logo, toneMapped: false })), 18, 4.6);
  P.tbox(g, -9.4, 9.4, DIVIDER.z + 0.5, DIVIDER.z + 0.58, 8.9, 14.1, gold);
  t.art.forEach((tex, i) => {
    const x = [-16, 16, 0][i];
    const y = i === 2 ? 5.6 : 4.6;
    if (i === 2) return;
    P.tbox(g, x - 3.0, x + 3.0, DIVIDER.z + 0.5, DIVIDER.z + 0.62, y - 3.0, y + 3.0, gold);
    P.vplane(g, 'z', DIVIDER.z + 0.64, x - 2.7, x + 2.7, y - 2.7, y + 2.7, 1, k.own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), 5.4, 5.4);
  });
  // art on the south wall, either side of the portal
  [-45, 45, -25, 25].forEach((x, i) => {
    const tex = t.art[i % 3];
    P.tbox(g, x - 2.2, x + 2.2, ZS - 0.12, ZS, 5.0, 11.2, gold);
    P.vplane(g, 'z', ZS - 0.14, x - 1.95, x + 1.95, 5.25, 10.95, -1, k.own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), 3.9, 5.7);
  });

  // ---------------------------------------------------------------- reception desk, lounges, plants
  const desk = (x: number, z: number): void => {
    P.tbox(g, x - 6, x + 6, z - 1.3, z + 1.3, 0, 1.15, dark, 4, 4);
    P.tbox(g, x - 6.2, x + 6.2, z - 1.5, z + 1.5, 1.15, 1.28, gold);
    P.tbox(g, x - 5.9, x + 5.9, z - 1.3, z - 1.15, 0.6, 0.62, P.glow(0xffd27a, 1.3, 0xd4af37));
    solids.push([x - 6.2, x + 6.2, z - 1.5, z + 1.5, 0, 1.3]);
  };
  desk(-40, 44);
  desk(40, 44);
  const leather = P.lit(null, 0x5e3320, 0.18);
  const velv = P.lit(null, 0x1f3a5c, 0.2);
  const sofa = (x: number, z: number, yaw: number, mat: THREE.Material): void => {
    const s = k.node(g, x, 0, z);
    s.rotation.y = yaw;
    k.box(s, 3.4, 0.5, 1.2, 0, 0.45, 0, mat);
    k.box(s, 3.4, 0.7, 0.3, 0, 0.9, 0.5, mat);
    k.box(s, 0.35, 0.65, 1.2, -1.6, 0.75, 0, mat);
    k.box(s, 0.35, 0.65, 1.2, 1.6, 0.75, 0, mat);
    k.box(s, 3.2, 0.2, 1.0, 0, 0.1, 0, gold);
    const c = Math.cos(yaw), si = Math.sin(yaw);
    const hx = Math.abs(1.8 * c) + Math.abs(0.7 * si), hz = Math.abs(1.8 * si) + Math.abs(0.7 * c);
    solids.push([x - hx, x + hx, z - hz, z + hz, 0, 1.2]);
  };
  for (const [x, z, yaw, m] of [[-62, 30, Math.PI / 2, leather], [-62, 38, Math.PI / 2, leather], [62, 30, -Math.PI / 2, velv], [62, 38, -Math.PI / 2, velv], [-14, 24, 0, velv], [14, 24, 0, leather]] as const) sofa(x, z, yaw, m);
  for (const [x, z] of [[-57, 34], [57, 34]]) {
    k.cyl(g, 1.0, 1.0, 0.45, x, 0.225, z, dark, 24);
    k.cyl(g, 1.05, 1.05, 0.05, x, 0.47, z, gold, 24);
    solids.push([x - 1.1, x + 1.1, z - 1.1, z + 1.1, 0, 0.6]);
  }
  const leafMat = P.lit(null, 0x2f8a46, 0.3);
  const potMat = P.lit(null, 0x1a1a1f, 0.1);
  for (const [x, z] of [[-70, 46], [70, 46], [-13, 46], [13, 46], [-70, 18], [70, 18], [-20, 20], [20, 20]]) {
    k.cyl(g, 0.7, 0.55, 1.1, x, 0.55, z, potMat, 14);
    k.cyl(g, 0.72, 0.72, 0.1, x, 1.12, z, gold, 14);
    for (let i = 0; i < 5; i++) {
      const l = k.sphere(g, 1, x + Math.sin(i * 1.7) * 0.4, 2.0 + i * 0.35, z + Math.cos(i * 1.7) * 0.4, leafMat);
      l.scale.set(0.9 - i * 0.08, 0.7, 0.9 - i * 0.08);
    }
    solids.push([x - 0.8, x + 0.8, z - 0.8, z + 0.8, 0, 2.5]);
  }

  // ---------------------------------------------------------------- the two galleries (east / west): stone, gold sconces, glowing display cases, lift doors
  const glass = k.own(new THREE.MeshLambertMaterial({ color: 0x9fd7ff, transparent: true, opacity: 0.35, emissive: 0x4aa8e8, emissiveIntensity: 0.5 }));
  for (const s of [-1, 1]) {
    const xa = s > 0 ? HALL.x1 + 1 : -XI;
    const xb = s > 0 ? XI : -(HALL.x1 + 1);
    P.hplane(g, xa, xb, ZN, zl0, H, P.lit(t.ceiling, 0xffffff, 0.45), 6, 6, false);
    P.tbox(g, xa, xb, ZN, ZN + 0.5, H - 0.5, H - 0.2, cove);
    P.tbox(g, xa, xb, zl0 - 0.5, zl0, H - 0.5, H - 0.2, cove);
    P.vplane(g, 'x', s > 0 ? XI - 0.03 : -XI + 0.03, ZN, zl0, 0, H, s > 0 ? -1 : 1, stone, 8, 8);
    P.vplane(g, 'z', ZN + 0.03, xa, xb, 0, H, 1, P.lit(t.wood, 0xffffff, 0.34), 7, 8);
    // a sign at the north end of each gallery: where the tower lifts are
    const mx = (xa + xb) / 2;
    k.sign(g, 'TOWER LIFTS & STAIRS - LOBBY CENTRE', 0xd4af37, mx, 10.6, ZN + 0.9, 10, 1.8, true);
    // display cases along the corridor
    for (let z = -36; z <= 4; z += 13) {
      const x = s > 0 ? XI - 2.2 : -XI + 2.2;
      P.tbox(g, x - 1.2, x + 1.2, z - 1.2, z + 1.2, 0, 1.0, dark, 3, 3);
      P.tbox(g, x - 1.1, x + 1.1, z - 1.1, z + 1.1, 1.0, 2.2, glass);
      k.sphere(g, 0.35, x, 1.5, z, P.glow(0xffd27a, 1.4, 0xd4af37));
      solids.push([x - 1.2, x + 1.2, z - 1.2, z + 1.2, 0, 2.3]);
    }
  }

  return { group: g, solids, ramps, update: (tt) => anim.forEach((f) => f(tt)) };
}
