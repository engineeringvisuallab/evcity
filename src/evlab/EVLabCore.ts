import * as THREE from 'three';
import { Parts } from './EVLabParts';
import { DIGIT_COLS, DIGIT_ROWS, type TowerTextures } from './EVLabTowerTextures';
import type { LiftCar } from './EVLabLifts';
import { CAB, CORE, CORE_TOP, FLOORS, LIFTS, ST, STAIRS, STOPS, T, coreColliders, flightX, levelAtY, levelLabel, levelY, type Solid } from './EVLabTowerLayout';

/** Index of the "A" / "B" plates in the digits atlas. */
const DIG_A = 70, DIG_B = 71;

export interface CabinView {
  group: THREE.Group;
  update(car: LiftCar): void;
}
export interface CoreBuild {
  /** Always there (while the building is near): the full-height concrete walls, the glass shafts and posts, the cabins, the podium part of the stairs. */
  group: THREE.Group;
  cabins: CabinView[];
  /** The pieces of the core that belong to one level (wall bands, landings, stair flights, doors, signs, lift landing doors). */
  levelPieces(n: number): THREE.Group;
  /** Slide the landing doors of lift `lift` at `level` (0 closed .. 1 open); does nothing when that level is not built. */
  setLanding(lift: number, level: number, open: number): void;
  forgetLevel(n: number): void;
  dispose(): void;
}

/** Nearest level to a floor height. */
export function levelNear(y: number): number {
  if (y < levelY(1) * 0.5) return 0;
  return Math.max(1, Math.min(T.roof, Math.round((y - T.y1) / T.floorH) + 1));
}

export function buildCore(P: Parts, TT: TowerTextures): CoreBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabCore';
  const conc = P.lit(TT.concrete, 0xffffff, 0.34);
  const slab = P.lit(t.marbleCream, 0xffffff, 0.34);
  const gold = P.gold();
  const glass = k.own(new THREE.MeshLambertMaterial({ color: 0xaee0ff, transparent: true, opacity: 0.26, emissive: 0x4aa8e8, emissiveIntensity: 0.4, depthWrite: false }));
  const leafMat = k.own(new THREE.MeshLambertMaterial({ color: 0xcfe9f6, transparent: true, opacity: 0.5, emissive: 0x6fb8e0, emissiveIntensity: 0.45, depthWrite: false }));
  const digitMat = k.own(new THREE.MeshBasicMaterial({ map: TT.digits, toneMapped: false }));
  const btnMat = P.glow(0xffd27a, 1.4, 0xd4af37);

  // ---------------------------------------------------------------- classify the collision boxes of the core into drawing groups
  const cc = coreColliders();
  const full: Solid[] = [];
  const byLevel = new Map<number, Solid[]>();
  for (const s of cc.solids) {
    if (s[5] <= 0) continue;
    if (s[4] <= 0.01 && s[5] >= CORE_TOP - 0.01) full.push(s);
    else {
      const lv = s[4] < T.y1 - 0.6 ? 0 : levelAtY(s[4] + 0.1);
      (byLevel.get(lv) ?? byLevel.set(lv, []).get(lv)!).push(s);
    }
  }
  const isGlass = (s: Solid): boolean => LIFTS.some((l) => s[0] >= l.sx0 - 0.01 && s[1] <= l.sx1 + 0.01 && s[2] >= l.sz0 - 0.01 && s[3] <= l.sz1 + 0.01) && Math.min(s[1] - s[0], s[3] - s[2]) <= 0.25;
  const drawSolid = (p: THREE.Object3D, s: Solid): void => {
    if (isGlass(s)) P.tbox(p, s[0], s[1], s[2], s[3], s[4], s[5], glass, 4, 4);
    else P.tbox(p, s[0], s[1], s[2], s[3], s[4], s[5], s[5] - s[4] <= 0.45 ? slab : conc, 4, 4);
  };
  for (const s of full) drawSolid(g, s);
  // gold posts at the corners of the glass shafts
  for (const l of LIFTS) for (const x of [l.sx0 + 0.1, l.sx1 - 0.1]) for (const z of [l.sz0 + 0.1, l.sz1 - 0.1]) P.tbox(g, x - 0.08, x + 0.08, z - 0.08, z + 0.08, 0, CORE_TOP, gold);

  // ---------------------------------------------------------------- shared pieces
  const numGeo = new Map<string, THREE.BufferGeometry>();
  const digit = (p: THREE.Object3D, idx: number, w: number, h: number, x: number, y: number, z: number, face: 1 | -1): void => {
    const key = `${idx}|${w}|${h}`;
    let geo = numGeo.get(key);
    if (!geo) {
      geo = new THREE.PlaneGeometry(w, h);
      const col = idx % DIGIT_COLS, row = Math.floor(idx / DIGIT_COLS);
      const u0 = col / DIGIT_COLS, u1 = (col + 1) / DIGIT_COLS, v1 = 1 - row / DIGIT_ROWS, v0 = 1 - (row + 1) / DIGIT_ROWS;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
      k.own(geo);
      numGeo.set(key, geo);
    }
    const m = new THREE.Mesh(geo, digitMat);
    m.position.set(x, y, z);
    if (face === -1) m.rotation.y = Math.PI;
    p.add(m);
  };

  const flightGeos = new Map<number, THREE.BufferGeometry>();
  const flightGeo = (rise: number): THREE.BufferGeometry => {
    const key = Math.round(rise * 1000);
    let geo = flightGeos.get(key);
    if (!geo) {
      const L = ST.flightZ1 - ST.flightZ0, N = Math.max(4, Math.round(rise / 0.175)), tr = L / N, h = rise / N;
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.3);
      sh.lineTo(0, 0.5 * h);
      for (let i = 0; i < N; i++) {
        const top = (i + 0.5) * h;
        sh.lineTo(i * tr, top);
        sh.lineTo((i + 1) * tr, top);
        if (i < N - 1) sh.lineTo((i + 1) * tr, (i + 1.5) * h);
      }
      sh.lineTo(L, rise - 0.3);
      sh.lineTo(0, -0.3);
      geo = k.own(new THREE.ExtrudeGeometry(sh, { depth: ST.flightW, bevelEnabled: false }));
      flightGeos.set(key, geo);
    }
    return geo;
  };

  /** Two flights + gold rails of one stair for the storey from STOPS[i] to STOPS[i+1]. */
  const storey = (p: THREE.Object3D, s: (typeof STAIRS)[number], i: number): void => {
    const y0 = STOPS[i], y1 = STOPS[i + 1], rise = (y1 - y0) / 2, L = ST.flightZ1 - ST.flightZ0;
    const geo = flightGeo(rise);
    const [a0, a1] = flightX(s, 1), [b0, b1] = flightX(s, 2);
    const f1 = new THREE.Mesh(geo, conc);
    f1.rotation.y = Math.PI / 2;
    f1.position.set(a0, y0, ST.flightZ1);
    const f2 = new THREE.Mesh(geo, conc);
    f2.rotation.y = -Math.PI / 2;
    f2.position.set(b1, y0 + rise, ST.flightZ0);
    p.add(f1, f2);
    const ang = Math.atan2(rise, L), len = Math.hypot(L, rise);
    const midZ = (ST.flightZ0 + ST.flightZ1) / 2;
    for (const [x, yy, sg] of [[s.id === 0 ? a1 : a0, y0 + rise / 2, 1], [s.id === 0 ? b0 : b1, y0 + rise * 1.5, -1]] as const) {
      const r = P.tbox(p, x - 0.03, x + 0.03, midZ - len / 2, midZ + len / 2, yy + 0.92, yy + 0.98, gold);
      r.position.set(x, yy + 0.95, midZ);
      r.rotation.x = sg * ang;
    }
    void a1; void b0;
  };

  // podium stairs (ground .. level 1): permanent
  for (const s of STAIRS) for (let i = 0; i < T.podiumStops; i++) storey(g, s, i);

  // ---------------------------------------------------------------- the lift cabins (glass, gold, a floor display)
  const cabins: CabinView[] = LIFTS.map((l) => {
    const cg = new THREE.Group();
    cg.position.set(l.cx, 0, 0);
    const dark = P.lit(t.marbleDark, 0xffffff, 0.3);
    const light = P.glow(0xfff1cf, 1.2, 0xfff1cf);
    P.tbox(cg, -CAB.hx, CAB.hx, CAB.z0, CAB.z1, -CAB.floorT, 0, dark, 3, 3);
    P.tbox(cg, -CAB.hx + 0.2, CAB.hx - 0.2, CAB.z0 + 0.2, CAB.z1 - 0.2, 0.001, 0.012, gold);
    P.tbox(cg, -CAB.hx, CAB.hx, CAB.z0, CAB.z1, CAB.h, CAB.h + 0.12, slab, 3, 3);
    P.tbox(cg, -CAB.hx + 0.3, CAB.hx - 0.3, CAB.z0 + 0.3, CAB.z1 - 0.3, CAB.h - 0.03, CAB.h, light);
    const gp = (x0: number, x1: number, z0: number, z1: number): void => { P.tbox(cg, x0, x1, z0, z1, 0, CAB.h, glass, 3, 3); };
    gp(-CAB.hx, -CAB.hx + 0.04, CAB.z0, CAB.z1);
    gp(CAB.hx - 0.04, CAB.hx, CAB.z0, CAB.z1);
    gp(-CAB.hx, CAB.hx, CAB.z0, CAB.z0 + 0.04);
    gp(-CAB.hx, -0.8, CAB.z1 - 0.07, CAB.z1 - 0.03);
    gp(0.8, CAB.hx, CAB.z1 - 0.07, CAB.z1 - 0.03);
    for (const x of [-CAB.hx, CAB.hx - 0.07]) for (const z of [CAB.z0, CAB.z1 - 0.07]) P.tbox(cg, x, x + 0.07, z, z + 0.07, 0, CAB.h, gold);
    P.tbox(cg, -CAB.hx, CAB.hx, CAB.z0, CAB.z0 + 0.06, 0.9, 0.96, gold); // hand rail
    P.tbox(cg, -CAB.hx, -CAB.hx + 0.06, CAB.z0, CAB.z1, 0.9, 0.96, gold);
    P.tbox(cg, CAB.hx - 0.06, CAB.hx, CAB.z0, CAB.z1, 0.9, 0.96, gold);
    // door leaves
    const leaves: THREE.Mesh[] = [];
    for (const sg of [-1, 1]) {
      const m = P.tbox(cg, sg * 0.4 - 0.4, sg * 0.4 + 0.4, CAB.z1 - 0.12, CAB.z1 - 0.07, 0, CAB.doorH, leafMat, 3, 3);
      leaves.push(m);
    }
    P.tbox(cg, -0.82, 0.82, CAB.z1 - 0.14, CAB.z1 - 0.02, CAB.doorH, CAB.doorH + 0.1, gold);
    // floor display above the door (inside): redrawn when the text changes
    const W = 256, H = 64;
    let lastText = '';
    const tex = k.texture(W, H, (c) => { c.fillStyle = '#0b0d12'; c.fillRect(0, 0, W, H); });
    const disp = new THREE.Mesh(k.own(new THREE.PlaneGeometry(1.3, 0.325)), k.own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    disp.position.set(0, 2.55, CAB.z1 - 0.16);
    disp.rotation.y = Math.PI;
    cg.add(disp);
    const draw = (text: string): void => {
      if (text === lastText) return;
      lastText = text;
      const c = (tex.image as HTMLCanvasElement).getContext('2d');
      if (!c) return;
      c.fillStyle = '#0b0d12';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#d4af37';
      c.lineWidth = 3;
      c.strokeRect(2, 2, W - 4, H - 4);
      c.fillStyle = '#ffd27a';
      c.font = 'bold 34px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, W / 2, H / 2 + 2);
      tex.needsUpdate = true;
    };
    draw('G');
    g.add(cg);
    return {
      group: cg,
      update: (car) => {
        cg.position.y = car.y;
        const open = car.door * 0.74;
        leaves[0].position.x = -0.4 - open;
        leaves[1].position.x = 0.4 + open;
        const lv = levelNear(car.y);
        const arrow = car.state === 'moving' ? (car.target > lv || (car.target === lv && car.v > 0) ? '\u25B2 ' : '\u25BC ') : '';
        draw(`${arrow}${levelLabel(lv)}  ${FLOORS[lv].name.slice(0, 14)}`);
      },
    };
  });

  // ---------------------------------------------------------------- per-level pieces
  const leaves = new Map<string, { l: THREE.Mesh; r: THREE.Mesh; lx: number; rx: number }>();
  const levelGroups = new Map<number, string[]>();
  const levelPieces = (n: number): THREE.Group => {
    const lg = new THREE.Group();
    lg.name = `core-L${n}`;
    const y = levelY(n);
    const keys: string[] = [];
    for (const s of byLevel.get(n) ?? []) drawSolid(lg, s);
    // stair doors: gold frame, the level number and the stair letter above
    for (const s of STAIRS) {
      const x0 = s.doorX - ST.doorHalf, x1 = s.doorX + ST.doorHalf, z = CORE.z1 + 0.02;
      P.tbox(lg, x0 - 0.1, x0, CORE.z1 - 0.1, z + 0.08, y, y + ST.doorH, gold);
      P.tbox(lg, x1, x1 + 0.1, CORE.z1 - 0.1, z + 0.08, y, y + ST.doorH, gold);
      P.tbox(lg, x0 - 0.1, x1 + 0.1, CORE.z1 - 0.1, z + 0.08, y + ST.doorH, y + ST.doorH + 0.1, gold);
      digit(lg, n, 0.8, 0.9, s.doorX + 0.45, y + ST.doorH + 0.75, z + 0.01, 1);
      digit(lg, s.id === 0 ? DIG_A : DIG_B, 0.8, 0.9, s.doorX - 0.45, y + ST.doorH + 0.75, z + 0.01, 1);
      // the green EXIT light over the door
      P.tbox(lg, s.doorX - 0.3, s.doorX + 0.3, CORE.z1, z + 0.05, y + ST.doorH - 0.25, y + ST.doorH - 0.1, P.glow(0x40ff80, 1.4, 0x208040));
      // the floor number painted on the north wall of the well
      if (n >= 1) digit(lg, n, 1.2, 1.35, (s.x0 + s.x1) / 2, y + 1.7, ST.zN + 0.02, 1);
    }
    // lift landing doors (two leaves per lift), the call button and the level number
    for (const l of LIFTS) {
      const zz = l.sz1 + 0.03, h = CAB.doorH;
      const a = P.tbox(lg, l.cx - 0.8, l.cx, zz, zz + 0.05, y, y + h, leafMat, 3, 3);
      const b = P.tbox(lg, l.cx, l.cx + 0.8, zz, zz + 0.05, y, y + h, leafMat, 3, 3);
      const key = `${l.id}:${n}`;
      leaves.set(key, { l: a, r: b, lx: a.position.x, rx: b.position.x });
      keys.push(key);
      P.tbox(lg, l.cx - 0.9, l.cx + 0.9, l.sz1, l.sz1 + 0.14, y + h, y + h + 0.1, gold);
      P.tbox(lg, l.cx - 0.9, l.cx - 0.8, l.sz1, l.sz1 + 0.14, y, y + h, gold);
      P.tbox(lg, l.cx + 0.8, l.cx + 0.9, l.sz1, l.sz1 + 0.14, y, y + h, gold);
      digit(lg, n, 0.7, 0.8, l.cx, y + h + 0.65, l.sz1 + 0.02, 1);
      P.tbox(lg, l.cx + 1.15, l.cx + 1.3, l.sz1, l.sz1 + 0.06, y + 1.0, y + 1.3, btnMat);
    }
    levelGroups.set(n, keys);
    if (n >= 1 && n <= T.top) for (const s of STAIRS) storey(lg, s, T.podiumStops + n - 1);
    return lg;
  };
  // ground floor pieces are part of the permanent group
  g.add(levelPieces(0));

  return {
    group: g,
    cabins,
    levelPieces,
    setLanding: (lift, level, open) => {
      const e = leaves.get(`${lift}:${level}`);
      if (!e) return;
      const o = open * 0.78;
      e.l.position.x = e.lx - o;
      e.r.position.x = e.rx + o;
      e.l.visible = e.r.visible = open < 0.97;
    },
    forgetLevel: (n) => {
      for (const key of levelGroups.get(n) ?? []) leaves.delete(key);
      levelGroups.delete(n);
    },
    dispose: () => undefined,
  };
}
