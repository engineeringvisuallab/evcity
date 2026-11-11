import * as THREE from 'three';
import { Parts } from './EVLabParts';
import type { TowerTextures } from './EVLabTowerTextures';
import { CORE, FLOORS, ROOF_Y, T, ceilY, floorPlan, inRing, levelY, ringOf, ringPoints, type FloorKind } from './EVLabTowerLayout';

/** What one level of the tower looks like inside (floor, ceiling lights, glass wall, furniture, signs). Built when the player is near, dropped when far. */
export interface LevelView {
  group: THREE.Group;
  dispose(): void;
}

const FLOOR_MAT: Record<FloorKind, 'carpet' | 'marble' | 'grass' | 'concrete' | 'dark' | 'wood'> = {
  ground: 'marble', lobby: 'marble', office: 'carpet', garden: 'grass', mech: 'concrete', coming: 'dark', restaurant: 'wood', boardroom: 'carpet', deck: 'marble', roof: 'wood',
};
const SIGN: Partial<Record<FloorKind, [string, number]>> = {
  lobby: ['SKY LOBBY & CAFE', 0xd4af37], garden: ['SKY GARDEN', 0x4caf50], mech: ['MECHANICAL FLOOR - STAFF ONLY', 0xcc8800], coming: ['COMING SOON', 0xd4af37],
  restaurant: ['SKY RESTAURANT', 0xd4af37], boardroom: ['EXECUTIVE BOARDROOM', 0xd4af37], deck: ['OBSERVATION DECK - 360 VIEW', 0x3a9be8], roof: ['ROOF GARDEN', 0x4caf50],
};

export function makeLevelBuilder(P: Parts, TT: TowerTextures): (n: number) => LevelView {
  const { k, t } = P;
  const mats = {
    carpet: P.lit(t.carpet, 0xffffff, 0.35), marble: P.lit(t.marbleCream, 0xffffff, 0.36), grass: P.lit(null, 0x3f8a46, 0.34), concrete: P.lit(TT.concrete, 0xffffff, 0.34),
    dark: P.lit(t.marbleDark, 0xffffff, 0.34), wood: P.lit(t.wood, 0xffffff, 0.36),
  };
  const ceilMat = P.lit(t.ceiling, 0xffffff, 0.5);
  const glass = k.own(new THREE.MeshLambertMaterial({ color: 0xaee0ff, transparent: true, opacity: 0.13, emissive: 0x4aa8e8, emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  const roomGlass = k.own(new THREE.MeshLambertMaterial({ color: 0xcfeaf6, transparent: true, opacity: 0.25, emissive: 0x6fb8e0, emissiveIntensity: 0.35, depthWrite: false }));
  const gold = P.gold();
  const lamp = P.glow(0xfff1cf, 1.3, 0xfff1cf);
  const topM = P.lit(t.wood, 0xffffff, 0.4), white = P.lit(null, 0xe8e8ea, 0.35), black = P.lit(null, 0x16181d, 0.2), chairM = P.lit(null, 0x23364f, 0.3);
  const leaf = P.lit(null, 0x2f8a46, 0.32), pot = P.lit(null, 0x1a1a1f, 0.15), leather = P.lit(null, 0x5e3320, 0.25), counterM = P.lit(t.marbleDark, 0xffffff, 0.3);

  const gPlane = k.own(new THREE.PlaneGeometry(1.2, 1.2));
  const gBox = k.own(new THREE.BoxGeometry(1, 1, 1));
  const gCyl = k.own(new THREE.CylinderGeometry(1, 1, 1, 18));
  const gSph = k.own(new THREE.SphereGeometry(1, 8, 6));

  const plate = (pts: Array<[number, number]>, hole: boolean, up: boolean, y: number, mat: THREE.Material, tile: number): THREE.Mesh => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, up ? -z : z)));
    if (hole) {
      const c = [[CORE.x0, CORE.z0], [CORE.x1, CORE.z0], [CORE.x1, CORE.z1], [CORE.x0, CORE.z1]];
      sh.holes.push(new THREE.Path(c.map(([x, z]) => new THREE.Vector2(x, up ? -z : z))));
    }
    const geo = new THREE.ShapeGeometry(sh);
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    return m;
  };

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, mats4: THREE.Matrix4[]): THREE.InstancedMesh | null => {
    if (!mats4.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, mats4.length);
    mats4.forEach((m, i) => im.setMatrixAt(i, m));
    im.frustumCulled = false;
    return im;
  };
  const mx = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): THREE.Matrix4 =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));

  return (n: number): LevelView => {
    const info = FLOORS[n];
    const kind = info.kind;
    const ring = ringOf(Math.min(n, T.top));
    const y = levelY(n);
    const roof = n === T.roof;
    const g = new THREE.Group();
    g.name = `level-${n}`;
    const own: THREE.BufferGeometry[] = [];
    const keep = <M extends THREE.Mesh>(m: M): M => { own.push(m.geometry); g.add(m); return m; };
    const pts = ringPoints(ring, 0.1);

    // floor (the level-1 floor is the podium roof) and ceiling
    if (n >= 2) keep(plate(pts, true, true, y + 0.004, mats[FLOOR_MAT[kind]], kind === 'office' ? 4 : 6));
    if (!roof) {
      keep(plate(pts, true, false, ceilY(n), ceilMat, 6));
      const lm: THREE.Matrix4[] = [];
      for (let x = T.cx - ring.hx + 2; x < T.cx + ring.hx - 1; x += 3.6) for (let z = T.cz - ring.hz + 2; z < T.cz + ring.hz - 1; z += 3.6) {
        if (inRing(ring, x, z, 1.2) && !(x > CORE.x0 - 1 && x < CORE.x1 + 1 && z > CORE.z0 - 1 && z < CORE.z1 + 1)) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, ceilY(n) - 0.01, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
          lm.push(m);
        }
      }
      const l = instanced(gPlane, lamp, lm);
      if (l) g.add(l);
    }

    // glass wall: one tinted pane per side + instanced mullions every ~1.5 m
    {
      const hgt = roof ? 2.8 : T.floorH - T.slab;
      const pos: number[] = [], idx: number[] = [];
      const mm: THREE.Matrix4[] = [];
      for (let i = 0; i < 8; i++) {
        const a = pts[i], b = pts[(i + 1) % 8];
        const base = pos.length / 3;
        pos.push(a[0], y, a[1], b[0], y, b[1], b[0], y + hgt, b[1], a[0], y + hgt, a[1]);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), cnt = Math.max(1, Math.round(len / 1.5));
        const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        for (let j = 0; j <= cnt; j++) {
          const f = j / cnt;
          mm.push(mx(a[0] + (b[0] - a[0]) * f, y + hgt / 2, a[1] + (b[1] - a[1]) * f, 0.1, hgt, 0.1, yaw));
        }
        mm.push(mx((a[0] + b[0]) / 2, y + 0.07, (a[1] + b[1]) / 2, len, 0.14, 0.12, yaw), mx((a[0] + b[0]) / 2, y + hgt - 0.05, (a[1] + b[1]) / 2, len, 0.1, 0.12, yaw));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      keep(new THREE.Mesh(geo, glass));
      const im = instanced(gBox, gold, mm);
      if (im) g.add(im);
    }

    // furniture
    const plan = floorPlan(n);
    const desks: THREE.Matrix4[] = [], panels: THREE.Matrix4[] = [], screens: THREE.Matrix4[] = [], chairs: THREE.Matrix4[] = [];
    const rTables: THREE.Matrix4[] = [], rLegs: THREE.Matrix4[] = [], bTables: THREE.Matrix4[] = [], pots: THREE.Matrix4[] = [], leaves: THREE.Matrix4[] = [];
    const sofaB: THREE.Matrix4[] = [], sofaK: THREE.Matrix4[] = [], counters: THREE.Matrix4[] = [], scopes: THREE.Matrix4[] = [];
    for (const it of plan.items) {
      const w = it.w ?? 1, d = it.d ?? 1, r = it.r ?? 0.5, yaw = it.yaw ?? 0;
      if (it.t === 'desk') {
        desks.push(mx(it.x, y + 0.75, it.z, w, 0.06, d, yaw));
        panels.push(mx(it.x, y + 0.4, it.z, w, 0.7, 0.05, yaw));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          screens.push(mx(it.x + sx * w * 0.25, y + 1.1, it.z + sz * d * 0.32, 0.55, 0.34, 0.04, yaw));
          chairs.push(mx(it.x + sx * w * 0.25, y + 0.45, it.z + sz * (d * 0.5 + 0.55), 0.5, 0.9, 0.5, yaw));
        }
      } else if (it.t === 'table') {
        if (it.r) {
          rTables.push(mx(it.x, y + 0.75, it.z, r, 0.06, r));
          rLegs.push(mx(it.x, y + 0.37, it.z, 0.08, 0.74, 0.08));
          for (const a of [0, 1.57, 3.14, 4.71]) chairs.push(mx(it.x + Math.cos(a) * (r + 0.4), y + 0.45, it.z + Math.sin(a) * (r + 0.4), 0.45, 0.9, 0.45));
        } else {
          bTables.push(mx(it.x, y + 0.75, it.z, w, 0.08, d));
          for (let c = -Math.floor(w / 1.4) / 2; c <= Math.floor(w / 1.4) / 2; c += 1) for (const sz of [-1, 1]) chairs.push(mx(it.x + c * 1.3, y + 0.45, it.z + sz * (d / 2 + 0.45), 0.5, 0.9, 0.5));
        }
      } else if (it.t === 'plant') {
        pots.push(mx(it.x, y + 0.45, it.z, Math.min(0.7, r * 0.8), 0.9, Math.min(0.7, r * 0.8)));
        for (let i = 0; i < 3; i++) leaves.push(mx(it.x + Math.sin(i * 2.1) * r * 0.25, y + 1.3 + i * 0.4 * r, it.z + Math.cos(i * 2.1) * r * 0.25, r * (1 - i * 0.12), r * 0.8, r * (1 - i * 0.12)));
      } else if (it.t === 'sofa') {
        sofaB.push(mx(it.x, y + 0.3, it.z, w, 0.5, d, yaw));
        sofaK.push(mx(it.x, y + 0.75, it.z - d * 0.4, w, 0.7, 0.25, yaw));
      } else if (it.t === 'counter') {
        counters.push(mx(it.x, y + 0.55, it.z, w, 1.1, d, yaw));
      } else if (it.t === 'bench') {
        sofaB.push(mx(it.x, y + 0.25, it.z, yaw ? d : w, 0.5, yaw ? w : d));
      } else if (it.t === 'telescope') {
        pots.push(mx(it.x, y + 0.7, it.z, 0.12, 1.4, 0.12));
        scopes.push(mx(it.x, y + 1.45, it.z, 0.3, 0.3, 0.9));
      } else if (it.t === 'room') {
        const x0 = it.x - w / 2, x1 = it.x + w / 2, z0 = it.z - d / 2, z1 = it.z + d / 2;
        P.tbox(g, x0, x1, z0, z0 + 0.05, y, y + 2.8, roomGlass);
        P.tbox(g, x0, x0 + 0.05, z0, z1, y, y + 2.8, roomGlass);
        P.tbox(g, x1 - 0.05, x1, z0, z1, y, y + 2.8, roomGlass);
        P.tbox(g, x0, it.x - 1.0, z1 - 0.05, z1, y, y + 2.8, roomGlass);
        P.tbox(g, it.x + 1.0, x1, z1 - 0.05, z1, y, y + 2.8, roomGlass);
        P.tbox(g, it.x - 1.0, it.x + 1.0, z1 - 0.06, z1, y + 2.2, y + 2.8, roomGlass);
        P.tbox(g, x0, x1, z0, z1, y + 2.8, y + 2.86, gold);
      }
    }
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]): void => { const im = instanced(geo, mat, list); if (im) g.add(im); };
    add(gBox, topM, desks); add(gBox, white, panels); add(gBox, black, screens); add(gBox, chairM, chairs);
    add(gCyl, topM, rTables); add(gCyl, black, rLegs); add(gBox, topM, bTables);
    add(gCyl, pot, pots); add(gSph, leaf, leaves); add(gBox, leather, sofaB); add(gBox, leather, sofaK); add(gBox, counterM, counters); add(gCyl, gold, scopes);

    // the big sign on the north wall (facing south), and the roof deck's pergola light
    const sg = SIGN[kind];
    if (sg) k.sign(g, sg[0], sg[1], T.cx, y + (roof ? 2.0 : 2.8), T.cz - ring.hz + 1.0, 10, 1.6, true);
    if (kind === 'deck') P.hplane(g, T.cx - ring.hx + 2, T.cx + ring.hx - 2, T.cz - ring.hz + 0.6, T.cz - ring.hz + 1.0, y + 0.01, P.glow(0x3a9be8, 1, 0x3a9be8), 4, 4);
    void ROOF_Y;
    return {
      group: g,
      dispose: () => { for (const geo of own) geo.dispose(); g.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); }); },
    };
  };
}
