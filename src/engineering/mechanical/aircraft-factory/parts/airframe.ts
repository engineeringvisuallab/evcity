import * as THREE from 'three';
// the factory builds the SAME aeroplane the game flies: its parts come from buildPlaneParts() (src/airplane/AirplaneMesh.ts), its livery from createAirplaneModel()
import { buildPlaneParts, type GeoArrays } from '../../../../airplane/AirplaneMesh';
import { createAirplaneModel, type AirplaneModel } from '../../../../airplane/AirplaneModel';
import { clamp01, ease, paintLevel, testPose, LIFT_M } from '../schedule';
import { bar, cbox, type AMats } from './ctx';

/**
 * One aeroplane body of the assembly line. Plane frame (as in the game): nose +X, +Y up, +Z the right wing, the wheels touch y = 0. On the factory line the body is
 * turned (nose WEST). The parts appear in the order they are built (`st` = station 0..4, `at` = work progress 0..1 of that station):
 *   station 1 WING:      centre box, spars, ribs one after another, then the skin closes the wing (the real wing mesh appears)
 *   station 2 FUSELAGE:  five barrels, each first as frames + stringers, then its skin, lowered in by the crane; the barrels are joined around the wing box
 *   station 3 FINAL:     join bolts + fairing, fin, tailplane, engines, landing gear, lights
 *   station 4 PAINT:     bare aluminium -> primer -> the EVCity livery
 *   station 5 TEST:      raised on jacks, gear swing, lamps (nothing new appears)
 */
export const FUSE_CY = 3.9;
export const FUSE_BELLY = 1.8;

// the wing numbers of AirplaneMesh.wingPart (root and tip positions), used for the skeleton, the jigs and the posts
const W = { zRoot: 1.6, zTip: 17.2, xLE: 4.2, sweep: 8.4, cRoot: 8.6, cTip: 1.9, yRoot: 2.3, dy: 1.3, tRoot: 0.13, tTip: 0.085 };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export interface WingSection { z: number; xle: number; chord: number; y: number; thick: number }
/** Wing section at the span fraction t (0 = root, 1 = tip), z on the right wing. */
export function wingAt(t: number): WingSection {
  const chord = lerp(W.cRoot, W.cTip, t);
  return { z: lerp(W.zRoot, W.zTip, t), xle: W.xLE - W.sweep * t, chord, y: W.yRoot + W.dy * t, thick: lerp(W.tRoot, W.tTip, t) * chord };
}
const spanT = (zAbs: number): number => clamp01((zAbs - W.zRoot) / (W.zTip - W.zRoot));
/** Height of the underside of the wing at |z|, and x (plane frame) at chord fraction f. */
export const wingBottom = (zAbs: number): number => {
  const w = wingAt(spanT(zAbs));
  return w.y - w.thick * 0.5;
};
export const wingChordX = (zAbs: number, f: number): number => {
  const w = wingAt(spanT(zAbs));
  return w.xle - f * w.chord;
};

function toGeometry(a: GeoArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

interface Ring {
  x: number;
  cy: number;
  ry: number;
  rz: number;
}
/** Section of a fuselage barrel at x, measured from its vertices (centre height and the two radii). */
function sectionOf(g: GeoArrays, x: number): Ring | null {
  let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < g.positions.length; i += 3) {
    if (Math.abs(g.positions[i] - x) > 0.9) continue;
    y0 = Math.min(y0, g.positions[i + 1]);
    y1 = Math.max(y1, g.positions[i + 1]);
    z0 = Math.min(z0, g.positions[i + 2]);
    z1 = Math.max(z1, g.positions[i + 2]);
  }
  return y1 < y0 ? null : { x, cy: (y0 + y1) / 2, ry: (y1 - y0) / 2, rz: (z1 - z0) / 2 };
}

/** The parts and materials all aeroplane bodies share (built once per factory). */
export interface PlaneKit {
  geo: {
    barrels: THREE.BufferGeometry[];
    wing: [THREE.BufferGeometry, THREE.BufferGeometry];
    fin: THREE.BufferGeometry;
    stab: [THREE.BufferGeometry, THREE.BufferGeometry];
    engine: [THREE.BufferGeometry, THREE.BufferGeometry];
    gear: THREE.BufferGeometry;
    lights: THREE.BufferGeometry;
  };
  /** x range (front, back) of each barrel, nose first */
  barrelX: [number, number][];
  rings: Ring[][];
  mats: {
    bare: THREE.MeshStandardMaterial;
    primer: THREE.MeshStandardMaterial;
    /** the livery materials of createAirplaneModel (the textured fuselage and fin, the vertex-coloured wings / engines / tailplane) */
    fuse: THREE.Material;
    fin: THREE.Material;
    body: THREE.Material;
    gear: THREE.Material;
    lights: THREE.Material;
  };
  dispose(): void;
}
export function makePlaneKit(): PlaneKit {
  const parts = buildPlaneParts();
  const model: AirplaneModel = createAirplaneModel('airliner');
  const matOf = (name: string): THREE.Material => (model.group.getObjectByName(name) as THREE.Mesh).material as THREE.Material;
  const bare = new THREE.MeshStandardMaterial({ color: 0xc9d0d6, roughness: 0.3, metalness: 0.85 });
  const primer = new THREE.MeshStandardMaterial({ color: 0xc3c95a, roughness: 0.6, metalness: 0.1 });
  const geo = {
    barrels: parts.barrels.map(toGeometry),
    wing: [toGeometry(parts.wing[0]), toGeometry(parts.wing[1])] as [THREE.BufferGeometry, THREE.BufferGeometry],
    fin: toGeometry(parts.fin),
    stab: [toGeometry(parts.stab[0]), toGeometry(parts.stab[1])] as [THREE.BufferGeometry, THREE.BufferGeometry],
    engine: [toGeometry(parts.engine[0]), toGeometry(parts.engine[1])] as [THREE.BufferGeometry, THREE.BufferGeometry],
    gear: toGeometry(parts.gear),
    lights: toGeometry(parts.lights),
  };
  const rings = parts.barrels.map((b, i) => {
    const [xa, xb] = parts.barrelX[i];
    const out: Ring[] = [];
    for (let k = 0; k < 4; k++) {
      const s = sectionOf(b, lerp(xa, xb, (k + 0.5) / 4));
      if (s) out.push(s);
    }
    return out;
  });
  return {
    geo,
    barrelX: parts.barrelX,
    rings,
    mats: { bare, primer, fuse: matOf('airliner-fuselage'), fin: matOf('airliner-fin'), body: matOf('airliner-body'), gear: matOf('airliner-gear'), lights: matOf('airliner-lights') },
    dispose(): void {
      for (const g of [...geo.barrels, ...geo.wing, geo.fin, ...geo.stab, ...geo.engine, geo.gear, geo.lights]) g.dispose();
      bare.dispose();
      primer.dispose();
      model.dispose(); // the livery materials and textures
    },
  };
}

export interface Item {
  o: THREE.Object3D;
  /** station index 0..4 the part is built in, and the work progress (0..1) of that station when it appears */
  st: number;
  at: number;
  /** the part disappears again (a skeleton that the skin covers) */
  until?: number;
  /** the part is brought in: it starts at this offset (plane frame) and moves to its place within `span` of work progress */
  from?: [number, number, number];
  span?: number;
  base: THREE.Vector3;
}
export interface Airliner {
  group: THREE.Group;
  items: Item[];
  /** metres the body is raised on the test cell's jacks (set by apply) */
  readonly lift: number;
  /** Show the parts of the finished stations and the done part of the current station, set the paint, move the parts the ground test moves. */
  apply(slot: number, dwell: number, tm: number): void;
  dispose(): void;
}

export function buildAirliner(kit: PlaneKit, a: AMats): Airliner {
  const group = new THREE.Group();
  group.name = 'airliner';
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // nose to the west (-x) on the factory line
  group.add(body);
  const items: Item[] = [];
  const add = <T extends THREE.Object3D>(o: T, st: number, at: number, extra: { until?: number; from?: [number, number, number]; span?: number } = {}): T => {
    body.add(o);
    items.push({ o, st, at, base: o.position.clone(), ...extra });
    return o;
  };
  type Kind = 'fuse' | 'fin' | 'body';
  const painted: { m: THREE.Mesh; kind: Kind }[] = [];
  const mesh = (geo: THREE.BufferGeometry, kind: Kind): THREE.Mesh => {
    const m = new THREE.Mesh(geo, kit.mats.bare);
    m.castShadow = true;
    painted.push({ m, kind });
    return m;
  };

  // ---------------- station 1: wing ----------------
  const centre = new THREE.Group();
  cbox(centre, a.aluDark, 3.9, 0.9, 2 * W.zRoot + 0.3, 0.55, W.yRoot, 0);
  add(centre, 0, 0.03);
  for (const [f, at] of [[0.2, 0.07], [0.65, 0.11]] as const) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const p0 = wingAt(0.02);
      const p1 = wingAt(0.97);
      bar(g, a.aluDark, [p0.xle - f * p0.chord, p0.y, s * p0.z], [p1.xle - f * p1.chord, p1.y, s * p1.z], 0.08, 0.5);
    }
    add(g, 0, at, { until: 0.74 });
  }
  for (let k = 0; k < 9; k++) {
    const w = wingAt(0.03 + (0.94 * k) / 8);
    const g = new THREE.Group();
    for (const s of [-1, 1]) cbox(g, a.alu, 0.45 * w.chord, Math.max(0.12, w.thick * 0.85), 0.05, w.xle - 0.42 * w.chord, w.y, s * w.z);
    add(g, 0, 0.15 + 0.36 * (k / 8), { until: 0.74 });
  }
  add(mesh(kit.geo.wing[0], 'body'), 0, 0.6);
  add(mesh(kit.geo.wing[1], 'body'), 0, 0.72);

  // ---------------- station 2: fuselage barrels (the middle one first, then outwards), each as a frame skeleton and then its skin ----------------
  const order = [2, 1, 3, 0, 4];
  const skinAt = [0.2, 0.38, 0.54, 0.7, 0.86];
  const ringGeo = new THREE.TorusGeometry(1, 0.035, 5, 32);
  order.forEach((bi, n) => {
    const rings = kit.rings[bi];
    const sk = new THREE.Group();
    for (const r of rings) {
      const ring = new THREE.Mesh(ringGeo, a.aluDark);
      ring.rotation.y = Math.PI / 2;
      ring.scale.set(r.rz, r.ry, 1);
      ring.position.set(r.x, r.cy, 0);
      sk.add(ring);
    }
    if (rings.length >= 2) {
      const r0 = rings[0];
      const r1 = rings[rings.length - 1];
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * Math.PI * 2;
        bar(sk, a.aluDark, [r0.x, r0.cy + r0.ry * Math.sin(th), r0.rz * Math.cos(th)], [r1.x, r1.cy + r1.ry * Math.sin(th), r1.rz * Math.cos(th)], 0.05, 0.05);
      }
    }
    add(sk, 1, skinAt[n] - 0.14, { until: skinAt[n] });
    add(mesh(kit.geo.barrels[bi], 'fuse'), 1, skinAt[n], { from: [0, 7, 0], span: 0.08 });
  });

  // ---------------- station 3: final assembly ----------------
  const bolts = new THREE.Group();
  for (const s of [-1, 1]) for (const x of [2.0, 0.4, -1.2, -2.8]) cbox(bolts, a.jigPad, 0.45, 0.45, 0.45, x, 3.0, s * 2.3);
  add(bolts, 2, 0.04, { until: 0.3 });
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), kit.mats.bare);
  painted.push({ m: fair, kind: 'body' });
  fair.scale.set(6.2, 0.8, 2.5);
  fair.position.set(-0.2, 2.0, 0);
  add(fair, 2, 0.3);
  add(mesh(kit.geo.fin, 'fin'), 2, 0.2, { from: [0, 9, 0], span: 0.08 });
  add(mesh(kit.geo.stab[0], 'body'), 2, 0.34, { from: [0, 0, 9], span: 0.07 });
  add(mesh(kit.geo.stab[1], 'body'), 2, 0.4, { from: [0, 0, -9], span: 0.07 });
  add(mesh(kit.geo.engine[0], 'body'), 2, 0.5, { from: [0, 0, 12], span: 0.09 });
  add(mesh(kit.geo.engine[1], 'body'), 2, 0.6, { from: [0, 0, -12], span: 0.09 });
  const gear = new THREE.Mesh(kit.geo.gear, kit.mats.gear);
  gear.castShadow = true;
  add(gear, 2, 0.74, { from: [0, 2.5, 0], span: 0.08 });
  const lights = new THREE.Mesh(kit.geo.lights, kit.mats.lights);
  add(lights, 2, 0.94);

  // ---------------- state ----------------
  let level = -1;
  let lift = 0;
  const setPaint = (l: 0 | 1 | 2): void => {
    if (l === level) return;
    level = l;
    for (const p of painted) p.m.material = l === 0 ? kit.mats.bare : l === 1 ? kit.mats.primer : kit.mats[p.kind];
  };
  const apply = (slot: number, dwell: number, tm: number): void => {
    for (const it of items) {
      const past = slot > it.st;
      let vis = past || (slot === it.st && dwell >= it.at);
      if (vis && it.until !== undefined && (past || dwell >= it.until)) vis = false;
      it.o.visible = vis;
      if (vis && it.from) {
        const k = past ? 1 : clamp01((dwell - it.at) / (it.span ?? 0.07));
        const e = 1 - ease(k);
        it.o.position.set(it.base.x + it.from[0] * e, it.base.y + it.from[1] * e, it.base.z + it.from[2] * e);
      }
    }
    setPaint(paintLevel(slot, dwell));
    const tp = testPose(slot, dwell);
    lift = tp.lift * LIFT_M;
    if (tp.gearUp) gear.visible = false;
    if (slot === 4 && lights.visible) lights.visible = Math.sin(tm * 6) > -0.3;
  };
  const own = new Set<THREE.BufferGeometry>([...kit.geo.barrels, ...kit.geo.wing, kit.geo.fin, ...kit.geo.stab, ...kit.geo.engine, kit.geo.gear, kit.geo.lights]);
  const dispose = (): void => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && !own.has(o.geometry)) o.geometry.dispose(); // only the geometry this body made itself (the kit's parts are shared)
    });
  };
  apply(0, 0, 0);
  return {
    group,
    items,
    get lift(): number {
      return lift;
    },
    apply,
    dispose,
  };
}
