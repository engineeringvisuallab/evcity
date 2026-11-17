import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';
import { box } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import { createVehMats, type VMats } from '../../vehicle-factory/parts/ctx';
import type { Airliner, PlaneKit } from './airframe';

// the generic factory helpers (robots, workers, paths) are shared with the vehicle factory
export { makeRobot, animRobot, makeWorker, Path, follow } from '../../vehicle-factory/parts/ctx';
export type { VMats, Robot, WP } from '../../vehicle-factory/parts/ctx';
export { createVehMats };

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.1 });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = 0.7;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};

/** Materials only the aircraft factory needs (the shared set is `mats`, the vehicle factory's robots / floor / screens are `t`). */
export function createAirMats() {
  return {
    alu: std(0xc9d0d6, { rough: 0.3, metal: 0.85 }),
    aluDark: std(0x9aa3ab, { rough: 0.4, metal: 0.8 }),
    plateStock: std(0xb9c1c8, { rough: 0.35, metal: 0.8 }),
    titanium: std(0x9a9488, { rough: 0.35, metal: 0.8 }),
    cfrp: std(0x1a1c1f, { rough: 0.35, metal: 0.3 }),
    jig: std(0x2b6cb0, { rough: 0.55, metal: 0.4 }),
    jigPad: std(0xe0b020, { rough: 0.6 }),
    floorLine: std(0xe0b020, { rough: 0.8 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }),
    machine: std(0x2f4f6f, { rough: 0.5, metal: 0.4 }),
    machineLight: std(0xd7dde2, { rough: 0.5, metal: 0.3 }),
    boothGlass: std(0xa9d0e6, { rough: 0.1, opacity: 0.22 }),
    hot: std(0xff7a30, { rough: 0.5, emissive: 0xff4a10 }),
    paintMist: std(0xf2f6ee, { rough: 1, opacity: 0.5 }),
  };
}
export type AMats = ReturnType<typeof createAirMats>;

export interface Ctx {
  mats: Mats;
  t: VMats;
  a: AMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  /** The one clock of the line: the airplane manager's clock in the game (see options.clock), else the plant's own animation time. */
  clock: () => number;
  /** the aeroplane parts (geometry + materials) shared by all bodies */
  kit: PlaneKit;
  /** the aeroplane bodies of the line (filled by the line part) */
  planes: Airliner[];
}

// ---- small building blocks ---------------------------------------------------------------------------------------------------------------------
type P = THREE.Object3D;
/** Box by its CENTRE (prims.box uses the bottom). */
export function cbox(parent: P, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
/** A straight bar (box) between two points; `w` x `h` = its cross section (h is the vertical one when the bar lies flat). */
export function bar(parent: P, mat: THREE.Material, a: [number, number, number], b: [number, number, number], w = 0.08, h = w): THREE.Mesh {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(len, 1e-4), h, w), mat);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  if (len > 1e-6) m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
  parent.add(m);
  return m;
}
/** Vertical cylinder by its CENTRE. */
export function pillar(parent: P, mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
/** Horizontal cylinder along x or z (centre y). */
export function tube(parent: P, mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'z', seg = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export type Side = 'N' | 'S' | 'E' | 'W';
export interface ShedOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** the side that has NO wall (the visitors look in from there) */
  open?: Side;
  /** roof is see-through (glass) so the tour camera can look down into it */
  glass?: boolean;
}
/** A work shed: floor, walls on the closed sides, columns on the open side, a roof frame and a (glass) roof. */
export function shed(parent: P, m: Mats, t: VMats, o: ShedOpts): void {
  const th = 0.4;
  box(parent, o.w, 0.2, o.d, t.floor, o.x, 0, o.z);
  const walls: [Side, number, number, number, number][] = [
    ['N', o.w, th, o.x, o.z - o.d / 2 + th / 2],
    ['S', o.w, th, o.x, o.z + o.d / 2 - th / 2],
    ['W', th, o.d - 2 * th, o.x - o.w / 2 + th / 2, o.z],
    ['E', th, o.d - 2 * th, o.x + o.w / 2 - th / 2, o.z],
  ];
  for (const [s, w, d, x, z] of walls) if (s !== o.open) box(parent, w, o.h, d, m.wall, x, 0, z);
  if (o.open === 'N' || o.open === 'S') {
    const n = Math.max(2, Math.round(o.w / 12));
    for (let i = 0; i <= n; i++) box(parent, 0.6, o.h, 0.6, m.concrete, o.x + (i / n - 0.5) * (o.w - 0.6), 0, o.z + (o.open === 'S' ? 1 : -1) * (o.d / 2 - 0.3));
  }
  const nb = Math.max(2, Math.round(o.w / 12));
  for (let i = 0; i <= nb; i++) box(parent, 0.35, 0.7, o.d, m.steel, o.x + (i / nb - 0.5) * (o.w - 0.35), o.h - 0.7, o.z);
  box(parent, o.w + 0.8, 0.3, o.d + 0.8, o.glass ? m.fenceMesh : m.roof, o.x, o.h, o.z);
}

/** A station: a coloured floor pad, four corner bollards and a hanging sign board facing south. */
export function stationPad(parent: P, m: Mats, a: AMats, x: number, z0: number, z1: number, text: string): void {
  const hw = 28;
  box(parent, hw * 2, 0.04, z1 - z0 - 2, a.jig, x, 0.21, (z0 + z1) / 2);
  for (const sx of [-1, 1]) for (const z of [z0 + 1, z1 - 1]) box(parent, 0.5, 1.0, 0.5, a.floorLine, x + sx * (hw - 0.5), 0, z);
  const sign = makeSign(text, 16, 2.4);
  sign.position.set(x, 16.5, z1 - 1.2);
  parent.add(sign);
  for (const sx of [-1, 1]) box(parent, 0.12, 6, 0.12, m.steel, x + sx * 7.5, 13.5, z1 - 1.3);
}

/** A wall screen with a few bars that move (a control-room / test display). Faces +z. */
export function screen(parent: P, t: VMats, anim: AnimSet, x: number, y: number, z: number, w: number, h: number, phase = 0, bars = 4): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  cbox(g, t.screenBg, w, h, 0.08, 0, 0, 0);
  const mats = [t.barA, t.barB, t.barC, t.barA];
  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < bars; i++) {
    const bw = (w * 0.8) / bars;
    meshes.push(cbox(g, mats[i % mats.length], bw * 0.7, h * 0.7, 0.04, -w * 0.4 + bw * (i + 0.5), 0, 0.05));
  }
  anim.add((tm) => {
    meshes.forEach((m, i) => {
      const k = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tm * (0.6 + i * 0.23) + phase + i));
      m.scale.y = k;
      m.position.y = -h * 0.35 + (h * 0.7 * k) / 2;
    });
  });
}
