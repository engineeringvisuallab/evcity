import * as THREE from 'three';
import { Parts } from './EVLabParts';
import { Furnish } from './EVLabFurniture';
import { defineFurniture } from './EVLabFurnModels';
import { beltOf, beltSection, isMech, outriggersOf } from './EVLabStructure';
import type { TowerTextures } from './EVLabTowerTextures';
import { CORES, FLOORS, LOBBY, PART, ROOF_Y, T, beamsOf, ceilY, columnsOf, floorPlan, inRing, levelY, partitionOf, ringOf, ringPoints, type FloorKind } from './EVLabTowerLayout';

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

  const gPlane = k.own(new THREE.PlaneGeometry(1.2, 1.2));
  const gBox = k.own(new THREE.BoxGeometry(1, 1, 1));

  const plate = (pts: Array<[number, number]>, hole: boolean, up: boolean, y: number, mat: THREE.Material, tile: number): THREE.Mesh => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, up ? -z : z)));
    if (hole) {
      for (const b of CORES) {
        const c = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
        sh.holes.push(new THREE.Path(c.map(([x, z]) => new THREE.Vector2(x, up ? -z : z))));
      }
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
      for (let x = T.cx - ring.hx + 2; x < T.cx + ring.hx - 1; x += 3.6) for (let z = ring.cz - ring.hz + 2; z < ring.cz + ring.hz - 1; z += 3.6) {
        if (inRing(ring, x, z, 1.2) && !CORES.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) {
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

    // structure: concrete columns (floor to floor) and the beams under the slab above
    if (!roof) {
      const cm: THREE.Matrix4[] = [], bm: THREE.Matrix4[] = [];
      for (const c of columnsOf(n)) cm.push(mx(c.x, y + T.floorH / 2, c.z, c.s, T.floorH, c.s));
      const cy = ceilY(n);
      for (const b of beamsOf(n)) {
        const dx = b.x1 - b.x0, dz = b.z1 - b.z0, len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        bm.push(mx((b.x0 + b.x1) / 2, cy - b.d / 2 + 0.02, (b.z0 + b.z1) / 2, len, b.d + 0.04, b.w, Math.atan2(-dz, dx)));
      }
      const ci = instanced(gBox, mats.concrete, cm); if (ci) g.add(ci);
      const bi = instanced(gBox, mats.concrete, bm); if (bi) g.add(bi);
    }

    // furniture: every piece is a real model of the kit (EVLabFurnModels), placed as an instance
    const plan = floorPlan(n);
    const F = new Furnish(P, g);
    const W: Array<[string, number, number, number, number, number]> = []; // name, x, z, yaw, scale, height above the floor
    const at = (m: string, x: number, z: number, yaw = 0, sc = 1, dy = 0): void => { W.push([m, x, z, yaw, sc, dy]); };
    /** Offset (right, forward) in the frame of a piece turned by yaw (forward = the way it faces). */
    const rel = (it: { x: number; z: number }, yaw: number, rx: number, fz: number): [number, number] => [it.x + rx * Math.cos(yaw) + fz * Math.sin(yaw), it.z - rx * Math.sin(yaw) + fz * Math.cos(yaw)];
    for (const it of plan.items) {
      const w = it.w ?? 1, d = it.d ?? 1, r = it.r ?? 0.5, yaw = it.yaw ?? 0;
      if (it.t === 'model') at(it.m!, it.x, it.z, yaw, it.s ?? 1, it.d ?? 0);
      else if (it.t === 'desk') {
        at('deskPod', it.x, it.z, yaw);
      } else if (it.t === 'table') {
        if (it.r) at('roundTable', it.x, it.z, yaw, r / 0.75);
        else at('meetSet44', it.x, it.z, yaw, 1);
      } else if (it.t === 'plant') at('palm1', it.x, it.z, yaw, Math.max(1, r));
      else if (it.t === 'sofa') { for (const sx of [-1, 1]) at('sofaLeather', ...rel(it, yaw, sx * w * 0.25, 0), yaw, w / 5.2); }
      else if (it.t === 'bench') at('parkBench', it.x, it.z, yaw, w / 2.4);
      else if (it.t === 'telescope') at('telescope', it.x, it.z, yaw, 1);
      else if (it.t === 'room') {
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
    defineFurniture(F, [...new Set(W.map((q) => q[0]))]);
    for (const [m, x, z, yaw, sc, dy] of W) F.place(m, x, y + dy, z, yaw, sc);
    F.flush();

    // step 1.2b + 1.2c: glass partition around the lift / stair lobby of an office floor, with one glass gate (double sliding door) in each partition
    const parts = partitionOf(n);
    if (parts.length) {
      const hgt = T.floorH - T.slab, mull: THREE.Matrix4[] = [];
      P.hplane(g, LOBBY.x0, LOBBY.x1, LOBBY.z0, LOBBY.z1, y + 0.012, mats.marble, 6, 6); // marble lobby floor between the core blocks
      for (const w of parts) {
        const office = w.side === 'north' ? -1 : 1; // which side of the glass the office is on
        const panel = (a: number, b: number): void => {
          P.tbox(g, a, b, w.z - 0.03, w.z + 0.03, y + 0.1, y + hgt, roomGlass);
          P.tbox(g, a, b, w.z - 0.07, w.z + 0.07, y, y + 0.1, gold); // base rail
          P.tbox(g, a, b, w.z - 0.07, w.z + 0.07, y + hgt - 0.08, y + hgt, gold); // top rail
          const cnt = Math.max(1, Math.round((b - a) / 3.4));
          for (let i = 0; i <= cnt; i++) mull.push(mx(a + ((b - a) * i) / cnt, y + hgt / 2, w.z, 0.08, hgt, 0.15));
        };
        panel(w.x0, w.g0); panel(w.g1, w.x1);
        // the gate: gold posts and header, fixed glass above, and the two door leaves slid open into the wall
        mull.push(mx(w.g0, y + hgt / 2, w.z, 0.16, hgt, 0.2), mx(w.g1, y + hgt / 2, w.z, 0.16, hgt, 0.2));
        P.tbox(g, w.g0, w.g1, w.z - 0.07, w.z + 0.07, y + PART.gateH, y + PART.gateH + 0.1, gold);
        P.tbox(g, w.g0, w.g1, w.z - 0.03, w.z + 0.03, y + PART.gateH + 0.1, y + hgt, roomGlass);
        const oz = office * 0.12;
        P.tbox(g, w.g0 - 1.35, w.g0 + 0.05, w.z + oz - 0.025, w.z + oz + 0.025, y + 0.05, y + PART.gateH, roomGlass);
        P.tbox(g, w.g1 - 0.05, w.g1 + 1.35, w.z + oz - 0.025, w.z + oz + 0.025, y + 0.05, y + PART.gateH, roomGlass);
        for (const x of [w.g0 + 0.05, w.g1 - 0.05]) P.tbox(g, x - 0.03, x + 0.03, w.z + oz - 0.04, w.z + oz + 0.04, y + 0.05, y + PART.gateH, gold); // the leading edges
        k.sign(g, 'OFFICE  \u2194  LIFTS & STAIRS', 0xd4af37, (w.g0 + w.g1) / 2, y + 3.3, w.z, 4.2, 0.5, true);
      }
      const mi = instanced(gBox, gold, mull); if (mi) g.add(mi);
    }

    // step 1.1b: mechanical floors: outrigger trusses (core block -> end column, one open panel as a doorway) and a belt truss round the facade
    if (isMech(n)) {
      const bars: THREE.Matrix4[] = [], ex = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3(), mid = new THREE.Vector3(), one = new THREE.Vector3();
      const bar = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): void => {
        dir.set(bx - ax, by - ay, bz - az);
        const len = dir.length();
        if (len < 0.05) return;
        dir.normalize();
        mid.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        bars.push(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(ex, dir), one.set(len, w, w)));
      };
      const yc = ceilY(n);
      for (const o of outriggersOf(n)) {
        const yb = o.y0 + o.chord / 2, yt = yc - o.chord / 2;
        bar(Math.min(...o.panels.map((p) => p.x0)), yt, o.z, Math.max(...o.panels.map((p) => p.x1)), yt, o.z, o.chord); // top chord: the whole length (a deep beam over the doorway)
        for (const p of o.panels) {
          if (p.open) continue;
          bar(p.x0, yb, o.z, p.x1, yb, o.z, o.chord); // bottom chord only where the panel is closed
          bar(p.x0, yb, o.z, p.x1, yt, o.z, o.diag); bar(p.x1, yb, o.z, p.x0, yt, o.z, o.diag); // X bracing
        }
      }
      const bs = beltSection(n);
      beltOf(n).forEach(({ a, b }, i) => {
        const yb = y + 0.3, yt = yc - 0.3;
        bar(a.x, yb, a.z, b.x, yb, b.z, bs.chord); bar(a.x, yt, a.z, b.x, yt, b.z, bs.chord);
        if (i % 2) bar(a.x, yb, a.z, b.x, yt, b.z, bs.diag); else bar(a.x, yt, a.z, b.x, yb, b.z, bs.diag);
      });
      const bm = instanced(gBox, P.lit(null, 0x4a5058, 0.3), bars); if (bm) g.add(bm);
    }

    // the big sign on the north wall (facing south), and the roof deck's pergola light
    const sg = SIGN[kind];
    if (sg) k.sign(g, sg[0], sg[1], T.cx, y + (roof ? 2.0 : 2.8), ring.cz - ring.hz + 1.0, 10, 1.6, true);
    if (kind === 'deck') P.hplane(g, T.cx - ring.hx + 2, T.cx + ring.hx - 2, ring.cz - ring.hz + 0.6, ring.cz - ring.hz + 1.0, y + 0.01, P.glow(0x3a9be8, 1, 0x3a9be8), 4, 4);
    void ROOF_Y;
    return {
      group: g,
      dispose: () => { for (const geo of own) geo.dispose(); g.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); }); },
    };
  };
}
