// COCKPIT: the inside of a car as the driver sees it (and as people see it through the windows).
//
//  - dash: a lofted (extruded side profile) soft-touch dashboard with an instrument binnacle, vents and a centre screen
//  - instrument cluster: a REAL working speedometer + rpm (or motor power) dial, gear, energy bar, handbrake lamp (canvas texture, redrawn 20x/s)
//  - steering wheel: rim, three spokes, hub; turns with the front wheels
//  - seats: shaped back with side wings, head restraint, stitched centre stripe, seat belts (front row)
//  - windscreen: tinted sun band + black frit border drawn on the glass, two wipers that sweep when it rains, rear-view mirror
//  - headliner (ceiling) so the roof does not look like a black slab from inside
//
// Cheap on purpose: all static pieces are merged into a few meshes per vehicle (AI traffic uses the same model).
// Heights `h` are metres ABOVE THE GROUND, z = along the nose (+), x = left (+). Right-hand drive: the driver sits at x < 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bn, bnNum } from '../i18n';
import { UI_FONT } from '../ui/theme';
import type { VehicleId } from './VehicleSpec';

/** Shared with the weather: Engine writes the rain intensity (0..1) here every frame; wipers sweep while it is raining. */
export const CabinState = { rain: 0 };

/** What the dials need (VehicleTelemetry has all of it). */
export interface CockpitState {
  kmh: number;
  rpm: number;
  redline: number;
  gear: number;
  shifting: boolean;
  auto: boolean;
  steerAngle: number;
  powerKw: number;
  energy: number;
  energyKind: 'fuel' | 'electric' | null;
  rangeKm: number;
  handbrake: boolean;
}

/** What the cockpit needs from the vehicle model. */
export interface CockpitKit {
  root: THREE.Object3D;
  /** Chassis-local height of the ground. */
  gy: number;
  /** Lambert material that is also lit from inside ("cabin ambient": dims at night). */
  cabin(c: number): THREE.MeshLambertMaterial;
  mat(c: number, extra?: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial;
  geo<T extends THREE.BufferGeometry>(g: T): T;
  /** Registers a piece that comes off / burns with the interior (stage 4). */
  part(o: THREE.Object3D): void;
}

export interface CockpitDef {
  maxKmh: number;
  /** Full scale of the motor power dial (kW) of electric vehicles. */
  maxKw: number;
  /** Eye height above the hips (m). Default 0.78 x body scale. */
  eyeUp?: number;
  wheel: { fwd: number; up: number; r: number; tilt: number; ratio: number };
  /** Side profile of the dash: back / front edge (z), top and bottom height, half width. */
  dash: { z0: number; z1: number; hTop: number; hLow: number; half: number };
  cluster: { w: number; h: number; hh: number; z: number };
  screen?: { x: number; hh: number; z: number; w: number; h: number };
  /** The windscreen as a line in the side view (top edge -> base) and its half width. */
  glass: { zTop: number; hTop: number; zBase: number; hBase: number; half: number };
  /** Headliner: flat part between z0..z1 at height h, and an optional drop (dz, dh) towards the windscreen header. */
  liner?: { z0: number; z1: number; h: number; half: number; drop?: [number, number]; color?: number };
  mirror?: { hh: number; z: number };
  seat: { w: number; back: number; recline: number; head: boolean; fabric: number; accent: number; sport: boolean };
  trim: number;
  wipers: boolean;
  /** Which pieces to build (default all). Tractor / combine: no windscreen, no ceiling. */
  parts?: { dash?: boolean; cluster?: boolean; wheel?: boolean; glass?: boolean; liner?: boolean; mirror?: boolean; seats?: boolean };
}

/** One entry per enclosed car that has a real cockpit. */
export const COCKPITS: Partial<Record<VehicleId, CockpitDef>> = {
  sedan: {
    maxKmh: 200,
    maxKw: 150,
    wheel: { fwd: 0.34, up: 0.42, r: 0.19, tilt: 0.4, ratio: 2.2 },
    dash: { z0: 0.42, z1: 0.82, hTop: 0.96, hLow: 0.7, half: 0.7 },
    cluster: { w: 0.3, h: 0.13, hh: 1.04, z: 0.44 },
    screen: { x: 0.13, hh: 1.04, z: 0.5, w: 0.24, h: 0.14 },
    glass: { zTop: 0.3, hTop: 1.43, zBase: 0.85, hBase: 0.93, half: 0.69 },
    liner: { z0: -0.95, z1: 0.3, h: 1.346, half: 0.64, drop: [0.2, 0.2], color: 0xb9b4a8 },
    mirror: { hh: 1.3, z: 0.44 },
    seat: { w: 0.46, back: 0.56, recline: 0.14, head: true, fabric: 0x3a3f46, accent: 0xb8302a, sport: false },
    trim: 0x2a2e34,
    wipers: true,
  },
  jeep: {
    maxKmh: 160,
    maxKw: 150,
    wheel: { fwd: 0.36, up: 0.4, r: 0.21, tilt: 0.5, ratio: 2.2 },
    dash: { z0: 0.3, z1: 0.62, hTop: 1.1, hLow: 0.84, half: 0.8 },
    cluster: { w: 0.3, h: 0.13, hh: 1.17, z: 0.32 },
    screen: { x: 0.14, hh: 1.17, z: 0.36, w: 0.24, h: 0.14 },
    glass: { zTop: 0.38, hTop: 1.84, zBase: 0.64, hBase: 1.12, half: 0.82 },
    liner: { z0: -1.8, z1: 0.4, h: 1.728, half: 0.82, drop: [0.1, 0.13], color: 0xb7b2a6 },
    mirror: { hh: 1.62, z: 0.44 },
    seat: { w: 0.5, back: 0.6, recline: 0.1, head: true, fabric: 0x2c2f33, accent: 0x1fd1b0, sport: false },
    trim: 0x2d3136,
    wipers: true,
  },
  hypercar: {
    maxKmh: 340,
    maxKw: 600,
    eyeUp: 0.6,
    wheel: { fwd: 0.3, up: 0.3, r: 0.145, tilt: 0.75, ratio: 2 },
    dash: { z0: 0.62, z1: 1.04, hTop: 0.75, hLow: 0.5, half: 0.66 },
    cluster: { w: 0.26, h: 0.11, hh: 0.8, z: 0.66 },
    screen: { x: 0.2, hh: 0.78, z: 0.7, w: 0.2, h: 0.12 },
    glass: { zTop: 0.3, hTop: 1.08, zBase: 1.05, hBase: 0.78, half: 0.64 },
    seat: { w: 0.42, back: 0.5, recline: 0.28, head: true, fabric: 0x14181b, accent: 0x1fd1b0, sport: true },
    trim: 0x1b1e22,
    wipers: false,
  },
  evhypar: {
    maxKmh: 280,
    maxKw: 400,
    wheel: { fwd: 0.34, up: 0.4, r: 0.2, tilt: 0.5, ratio: 2.2 },
    dash: { z0: 0.7, z1: 1.38, hTop: 1.03, hLow: 0.7, half: 0.88 },
    cluster: { w: 0.3, h: 0.13, hh: 1.08, z: 0.74 },
    screen: { x: 0.14, hh: 1.08, z: 0.8, w: 0.3, h: 0.16 },
    glass: { zTop: 0.1, hTop: 1.57, zBase: 1.45, hBase: 1.02, half: 0.84 },
    mirror: { hh: 1.4, z: 0.52 },
    seat: { w: 0.5, back: 0.62, recline: 0.28, head: true, fabric: 0x1f2428, accent: 0x1fd1b0, sport: true },
    trim: 0x23262b,
    wipers: true,
  },
  tractor: {
    maxKmh: 60,
    maxKw: 80,
    wheel: { fwd: 0.7, up: 0.42, r: 0.22, tilt: 1.1, ratio: 2.4 },
    dash: { z0: 0.6, z1: 0.95, hTop: 1.75, hLow: 1.45, half: 0.3 },
    cluster: { w: 0.3, h: 0.13, hh: 1.84, z: 0.63 },
    glass: { zTop: 0, hTop: 0, zBase: 0, hBase: 0, half: 0 },
    seat: { w: 0.5, back: 0.5, recline: 0.1, head: false, fabric: 0x1c1c1c, accent: 0x1b5e20, sport: false },
    trim: 0x23272b,
    wipers: false,
    parts: { glass: false, liner: false, mirror: false, seats: false },
  },
  combine: {
    maxKmh: 40,
    maxKw: 200,
    wheel: { fwd: 0.5, up: 0.45, r: 0.22, tilt: 1.0, ratio: 2.4 },
    dash: { z0: 2.3, z1: 2.56, hTop: 3.0, hLow: 2.6, half: 0.8 },
    cluster: { w: 0.34, h: 0.15, hh: 3.08, z: 2.32 },
    glass: { zTop: 0, hTop: 0, zBase: 0, hBase: 0, half: 0 },
    seat: { w: 0.5, back: 0.58, recline: 0.1, head: true, fabric: 0x23272c, accent: 0xf2b705, sport: false },
    trim: 0x2d3136,
    wipers: false,
    parts: { glass: false, liner: false, mirror: false },
  },
  suprim: {
    maxKmh: 300,
    maxKw: 500,
    eyeUp: 0.45,
    wheel: { fwd: 0.3, up: 0.27, r: 0.15, tilt: 0.75, ratio: 2 },
    dash: { z0: 0.66, z1: 1.08, hTop: 0.8, hLow: 0.55, half: 0.66 },
    cluster: { w: 0.26, h: 0.11, hh: 0.86, z: 0.7 },
    screen: { x: 0.2, hh: 0.84, z: 0.74, w: 0.2, h: 0.12 },
    glass: { zTop: 0.3, hTop: 1.15, zBase: 1.15, hBase: 0.76, half: 0.64 },
    seat: { w: 0.42, back: 0.5, recline: 0.28, head: true, fabric: 0x15181b, accent: 0x2a9bff, sport: true },
    trim: 0x1b1e22,
    wipers: false,
  },
  pickup: {
    maxKmh: 140,
    maxKw: 120,
    wheel: { fwd: 0.36, up: 0.4, r: 0.21, tilt: 0.5, ratio: 2.2 },
    dash: { z0: 0.5, z1: 0.96, hTop: 1.34, hLow: 1.0, half: 0.78 },
    cluster: { w: 0.3, h: 0.13, hh: 1.42, z: 0.52 },
    screen: { x: 0.15, hh: 1.42, z: 0.56, w: 0.24, h: 0.14 },
    glass: { zTop: 0.62, hTop: 1.95, zBase: 1.0, hBase: 1.36, half: 0.84 },
    liner: { z0: -0.4, z1: 0.62, h: 1.925, half: 0.84, drop: [0.1, 0.1], color: 0xb7b2a6 },
    mirror: { hh: 1.78, z: 0.72 },
    seat: { w: 0.5, back: 0.6, recline: 0.1, head: true, fabric: 0x3a3a34, accent: 0x1b5e20, sport: false },
    trim: 0x2d3136,
    wipers: true,
  },
  truck: {
    maxKmh: 100,
    maxKw: 250,
    wheel: { fwd: 0.5, up: 0.45, r: 0.22, tilt: 1.0, ratio: 2.5 },
    dash: { z0: 4.72, z1: 5.04, hTop: 1.85, hLow: 1.3, half: 1.1 },
    cluster: { w: 0.36, h: 0.16, hh: 1.95, z: 4.76 },
    screen: { x: 0.45, hh: 1.97, z: 4.78, w: 0.3, h: 0.18 },
    glass: { zTop: 4.92, hTop: 2.88, zBase: 5.06, hBase: 2.0, half: 1.12 },
    liner: { z0: 3.2, z1: 4.88, h: 2.845, half: 1.2, color: 0xcfd3d6 },
    seat: { w: 0.5, back: 0.58, recline: 0.1, head: true, fabric: 0x222c33, accent: 0xff7a00, sport: false },
    trim: 0x2b3238,
    wipers: true,
  },
  bus: {
    maxKmh: 120,
    maxKw: 250,
    wheel: { fwd: 0.55, up: 0.43, r: 0.21, tilt: 1.0, ratio: 2.5 },
    dash: { z0: 4.55, z1: 5.1, hTop: 1.62, hLow: 1.2, half: 1.2 },
    cluster: { w: 0.36, h: 0.16, hh: 1.7, z: 4.58 },
    screen: { x: 0.45, hh: 1.72, z: 4.6, w: 0.34, h: 0.2 },
    glass: { zTop: 4.95, hTop: 2.5, zBase: 5.23, hBase: 1.7, half: 1.1 },
    liner: { z0: -5.0, z1: 4.9, h: 2.465, half: 1.2, color: 0xcfd3d6 },
    seat: { w: 0.5, back: 0.58, recline: 0.1, head: true, fabric: 0x222c33, accent: 0x1fd1b0, sport: false },
    trim: 0x2b3238,
    wipers: true,
  },
};

/** Merges many small geometries into one mesh per material. */
class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Object3D();

  add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.tmp.position.set(x, y, z);
    this.tmp.rotation.set(rx, ry, rz);
    this.tmp.updateMatrix();
    const c = g.index ? g.toNonIndexed() : g.clone();
    c.applyMatrix4(this.tmp.matrix);
    g.dispose();
    const list = this.groups.get(m) ?? [];
    list.push(c);
    this.groups.set(m, list);
  }

  addQ(g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Vector3, q: THREE.Quaternion): void {
    this.tmp.position.copy(p);
    this.tmp.quaternion.copy(q);
    this.tmp.updateMatrix();
    const c = g.index ? g.toNonIndexed() : g.clone();
    c.applyMatrix4(this.tmp.matrix);
    g.dispose();
    const list = this.groups.get(m) ?? [];
    list.push(c);
    this.groups.set(m, list);
  }

  build(parent: THREE.Object3D, kit: CockpitKit): void {
    for (const [m, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      kit.geo(merged);
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

/** A small live instrument cluster for vehicles without a cockpit (bike, auto, rickshaw). Put `mesh` on the handlebar group. */
export class MiniCluster {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.MeshBasicMaterial;
  private clock = 1;
  private active = false;

  constructor(w: number, h: number, private readonly maxKmh: number, private readonly maxKw: number) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    this.ctx = cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.castShadow = false;
    paintCluster(this.ctx, null, maxKmh, maxKw);
    this.tex.needsUpdate = true;
  }

  setActive(on: boolean): void {
    this.active = on;
    this.clock = 1;
  }

  update(s: CockpitState, dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    if (this.clock < 0.05) return;
    this.clock = 0;
    paintCluster(this.ctx, s, this.maxKmh, this.maxKw);
    this.tex.needsUpdate = true;
  }

  char(): void {
    this.active = false;
    this.mat.color.setHex(0x050505);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

const toBn = (s: string): string => s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

export class Cockpit {
  /** Where the driver's eyes are (chassis-local). */
  readonly eye = new THREE.Vector3();
  private readonly group = new THREE.Group();
  private readonly seatsGroup = new THREE.Group();
  private readonly gy: number;
  private spin: THREE.Group;
  private wipers: { g: THREE.Group; ph: number }[] = [];
  private wipePhase = 0;
  private wipeAmt = 0;
  private clusterCtx: CanvasRenderingContext2D;
  private clusterTex: THREE.CanvasTexture;
  private screenTex: THREE.CanvasTexture | null = null;
  private textures: THREE.Texture[] = [];
  private active = false;
  private drawClock = 0;
  private lastT = performance.now();

  constructor(
    private readonly kit: CockpitKit,
    private readonly d: CockpitDef,
    hips: { x: number; h: number; z: number; scale: number },
    seats: { x: number; h: number; z: number }[],
  ) {
    const gy = kit.gy;
    this.gy = gy;
    const eyeUp = d.eyeUp ?? 0.78 * hips.scale;
    this.eye.set(hips.x, gy + hips.h + eyeUp, hips.z + 0.06 * hips.scale);

    const dashM = kit.cabin(d.trim);
    const darkM = kit.cabin(0x15181b);
    const softM = kit.cabin(0x34393f);
    const accentM = kit.mat(d.seat.accent, { emissive: d.seat.accent, emissiveIntensity: 0.35 });
    const chromeM = kit.mat(0xb9c0c6, { emissive: 0x6c7378 });
    const P = { dash: true, cluster: true, wheel: true, glass: true, liner: true, mirror: true, seats: true, ...d.parts };
    const sb = new Batch();

    if (P.dash) this.buildDash(sb, dashM, darkM, softM, accentM);
    if (P.mirror) this.buildMirror(sb, darkM, chromeM);
    sb.build(this.group, kit);

    // instrument cluster (live canvas) + binnacle hood
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    this.clusterCtx = cv.getContext('2d')!;
    this.clusterTex = new THREE.CanvasTexture(cv);
    this.clusterTex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(this.clusterTex);
    if (P.cluster) this.placeScreen(hips.x, d.cluster.hh, d.cluster.z, d.cluster.w, d.cluster.h, new THREE.MeshBasicMaterial({ map: this.clusterTex, toneMapped: false }));
    this.drawCluster(null);

    if (d.screen && P.cluster) this.buildScreen(d.screen, d.screen.x);

    this.spin = P.wheel ? this.buildWheel(hips, darkM, softM, accentM) : new THREE.Group();
    if (P.glass) this.buildGlass();
    if (d.liner && P.liner) this.buildLiner(d.liner);
    if (P.seats) this.buildSeats(seats, hips, accentM);

    kit.root.add(this.group, this.seatsGroup);
    kit.part(this.group);
    kit.part(this.seatsGroup);
  }

  // ------------------------------------------------------------------ dash
  private buildDash(sb: Batch, dashM: THREE.Material, darkM: THREE.Material, softM: THREE.Material, accentM: THREE.Material): void {
    const d = this.d.dash;
    const w = d.half * 2;
    const sh = new THREE.Shape();
    sh.moveTo(d.z0, d.hLow);
    sh.lineTo(d.z0, d.hTop - 0.03);
    sh.quadraticCurveTo(d.z0, d.hTop, d.z0 + 0.06, d.hTop);
    sh.lineTo(d.z1 - 0.1, d.hTop + 0.015);
    sh.quadraticCurveTo(d.z1, d.hTop + 0.02, d.z1, d.hTop - 0.04);
    sh.lineTo(d.z1, d.hLow);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: w - 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 5 });
    g.translate(0, 0, -(w - 0.04) / 2);
    g.rotateY(-Math.PI / 2);
    g.translate(0, this.gy, 0);
    this.kit.geo(g);
    const dash = new THREE.Mesh(g, dashM);
    dash.castShadow = false;
    this.group.add(dash);

    // soft-touch pad over the cluster (binnacle hood) in front of the driver
    const cx = this.eye.x;
    sb.add(new RoundedBoxGeometry(this.d.cluster.w + 0.08, 0.05, 0.14, 2, 0.02), softM, cx, this.gy + this.d.cluster.hh + this.d.cluster.h / 2 + 0.02, this.d.cluster.z + 0.04, 0.1);
    // accent stripe along the dash face
    sb.add(new THREE.BoxGeometry(w * 0.72, 0.014, 0.012), accentM, 0, this.gy + d.hTop - 0.075, d.z0 - 0.003);
    // vents: two outer + two centre
    for (const vx of [-d.half + 0.12, d.half - 0.12, -0.08, 0.08]) {
      sb.add(new THREE.BoxGeometry(0.1, 0.035, 0.012), darkM, vx, this.gy + d.hTop - 0.11, d.z0 - 0.005);
      sb.add(new THREE.BoxGeometry(0.07, 0.004, 0.014), softM, vx, this.gy + d.hTop - 0.11, d.z0 - 0.008);
    }
    // glove box line + centre console block
    sb.add(new THREE.BoxGeometry(0.34, 0.12, 0.012), darkM, d.half * 0.45, this.gy + d.hLow + 0.15, d.z0 - 0.004);
  }

  private buildMirror(sb: Batch, darkM: THREE.Material, chromeM: THREE.Material): void {
    const m = this.d.mirror;
    if (!m) return;
    const y = this.gy + m.hh;
    sb.add(new RoundedBoxGeometry(0.24, 0.06, 0.03, 2, 0.012), darkM, 0, y, m.z, 0.15);
    sb.add(new THREE.BoxGeometry(0.2, 0.04, 0.004), chromeM, 0, y, m.z - 0.017, 0.15);
    sb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), darkM, 0, y + 0.06, m.z + 0.04, 0.5);
  }

  /** A flat screen (cluster / infotainment) facing the driver's eyes. */
  private placeScreen(x: number, hh: number, z: number, w: number, h: number, material: THREE.Material): THREE.Mesh {
    this.materials.push(material);
    const g = this.kit.geo(new THREE.PlaneGeometry(w, h));
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, this.gy + hh, z);
    mesh.lookAt(this.eye);
    mesh.castShadow = false;
    this.group.add(mesh);
    // dark frame behind it
    const f = this.kit.geo(new THREE.PlaneGeometry(w + 0.03, h + 0.03));
    const frame = new THREE.Mesh(f, this.kit.mat(0x050607));
    frame.position.copy(mesh.position);
    frame.quaternion.copy(mesh.quaternion);
    frame.translateZ(-0.004);
    this.group.add(frame);
    return mesh;
  }

  private buildScreen(s: NonNullable<CockpitDef['screen']>, x: number): void {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 160;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#0a1117';
    c.fillRect(0, 0, 256, 160);
    c.strokeStyle = '#17323f';
    c.lineWidth = 1;
    for (let i = 0; i < 256; i += 32) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 160);
      c.stroke();
    }
    for (let j = 0; j < 160; j += 32) {
      c.beginPath();
      c.moveTo(0, j);
      c.lineTo(256, j);
      c.stroke();
    }
    c.strokeStyle = '#2c6f86';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(0, 120);
    c.lineTo(90, 100);
    c.lineTo(150, 60);
    c.lineTo(256, 40);
    c.stroke();
    c.strokeStyle = '#4ec3ff';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(90, 100);
    c.lineTo(150, 60);
    c.stroke();
    c.fillStyle = '#1fd1b0';
    c.beginPath();
    c.moveTo(150, 46);
    c.lineTo(161, 72);
    c.lineTo(150, 66);
    c.lineTo(139, 72);
    c.closePath();
    c.fill();
    c.fillStyle = '#cfe0f5';
    c.font = `600 15px ${UI_FONT}`;
    c.fillText('EVCity', 10, 22);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(t);
    this.screenTex = t;
    this.placeScreen(x, s.hh, s.z, s.w, s.h, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  }

  // ------------------------------------------------------------------ steering wheel
  private buildWheel(hips: { x: number; h: number; z: number }, darkM: THREE.Material, softM: THREE.Material, accentM: THREE.Material): THREE.Group {
    const w = this.d.wheel;
    const root = new THREE.Group();
    root.position.set(hips.x, this.gy + hips.h + w.up, hips.z + w.fwd);
    // local +Z = the wheel's axis towards the driver (tilted up by `tilt`), local +Y = DOWN in the world
    root.rotation.x = Math.PI + w.tilt;
    const spin = new THREE.Group();
    root.add(spin);
    const sb = new Batch();
    sb.add(new THREE.TorusGeometry(w.r, 0.017, 10, 32), darkM, 0, 0, 0);
    sb.add(new THREE.TorusGeometry(w.r, 0.0075, 6, 32), softM, 0, 0, 0.012); // inner grip highlight
    // three spokes: left, right, down (local +Y)
    sb.add(new THREE.BoxGeometry(w.r, 0.026, 0.014), darkM, -w.r / 2, 0, 0);
    sb.add(new THREE.BoxGeometry(w.r, 0.026, 0.014), darkM, w.r / 2, 0, 0);
    sb.add(new THREE.BoxGeometry(0.03, w.r, 0.014), darkM, 0, w.r / 2, 0);
    const hub = new THREE.CylinderGeometry(0.052, 0.058, 0.03, 18);
    hub.rotateX(Math.PI / 2);
    sb.add(hub, darkM, 0, 0, 0.012);
    sb.add(new THREE.BoxGeometry(0.05, 0.007, 0.004), accentM, 0, -0.03, 0.03); // centre mark
    sb.add(new THREE.BoxGeometry(0.02, 0.012, 0.012), accentM, 0, -w.r, 0.002); // 12 o'clock marker
    sb.build(spin, this.kit);
    this.group.add(root);
    // steering column shroud
    const col = this.kit.geo(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 10));
    const colM = new THREE.Mesh(col, darkM);
    colM.position.set(hips.x, this.gy + hips.h + w.up - 0.08, hips.z + w.fwd + 0.12);
    colM.rotation.x = Math.PI / 2 - 0.5;
    colM.castShadow = false;
    this.group.add(colM);
    return spin;
  }

  // ------------------------------------------------------------------ windscreen, wipers
  private buildGlass(): void {
    const gl = this.d.glass;
    const dz = gl.zBase - gl.zTop;
    const dh = gl.hTop - gl.hBase;
    const len = Math.hypot(dz, dh);
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, dh / len, -dz / len); // up the glass (up + rearwards)
    const Z = new THREE.Vector3().crossVectors(X, Y); // outward normal (up + forward)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const centre = new THREE.Vector3(0, this.gy + (gl.hTop + gl.hBase) / 2, (gl.zTop + gl.zBase) / 2).addScaledVector(Z, -0.012);

    // sun band + frit border drawn on the glass
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d')!;
    const grad = c.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(8,40,62,0.7)');
    grad.addColorStop(0.2, 'rgba(8,40,62,0.35)');
    grad.addColorStop(0.34, 'rgba(8,40,62,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(2,3,4,0.95)'; // frit border: solid black edge fading into dots
    c.fillRect(0, 0, 256, 5);
    c.fillRect(0, 0, 6, 128);
    c.fillRect(250, 0, 6, 128);
    c.fillRect(0, 123, 256, 5);
    c.fillStyle = 'rgba(2,3,4,0.7)';
    for (let i = 0; i < 256; i += 4) {
      for (let k = 0; k < 4; k++) {
        c.fillRect(i, 5 + k * 3, 2, 2);
        c.fillRect(6 + k * 3, i % 128, 2, 2);
        c.fillRect(250 - 3 - k * 3, i % 128, 2, 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const plane = new THREE.Mesh(this.kit.geo(new THREE.PlaneGeometry(gl.half * 2, len)), mat);
    plane.position.copy(centre);
    plane.quaternion.copy(q);
    plane.renderOrder = 3;
    plane.castShadow = false;
    this.group.add(plane);
    this.materials.push(mat);

    if (!this.d.wipers) return;
    // wipers lie along the base of the glass and sweep up (glass frame: +X sideways, +Y up the glass)
    const frame = new THREE.Group();
    frame.position.set(0, this.gy + gl.hBase, gl.zBase).addScaledVector(Z, -0.02).addScaledVector(Y, 0.04);
    frame.quaternion.copy(q);
    const armLen = Math.min(len * 0.62, gl.half * 0.9);
    const armM = this.kit.mat(0x0d0f11);
    for (const px of [-gl.half * 0.34, gl.half * 0.18]) {
      const g = new THREE.Group();
      g.position.set(px, 0, 0);
      const ag = this.kit.geo(new THREE.BoxGeometry(armLen, 0.012, 0.008).translate(armLen / 2, 0, 0));
      g.add(new THREE.Mesh(ag, armM));
      const bg = this.kit.geo(new THREE.BoxGeometry(armLen * 0.86, 0.02, 0.006).translate(armLen * 0.62, 0.012, 0));
      g.add(new THREE.Mesh(bg, armM));
      frame.add(g);
      this.wipers.push({ g, ph: 0 });
    }
    this.group.add(frame);
  }

  private materials: THREE.Material[] = [];

  // ------------------------------------------------------------------ headliner
  private buildLiner(l: NonNullable<CockpitDef['liner']>): void {
    const m = this.kit.cabin(l.color ?? 0xb9b4a8);
    const sb = new Batch();
    const len = l.z1 - l.z0;
    sb.add(new THREE.BoxGeometry(l.half * 2, 0.012, len), m, 0, this.gy + l.h, (l.z0 + l.z1) / 2);
    if (l.drop) {
      const [dz, dh] = l.drop;
      const sl = Math.hypot(dz, dh);
      sb.add(new THREE.BoxGeometry(l.half * 2, 0.012, sl), m, 0, this.gy + l.h - dh / 2, l.z1 + dz / 2, -Math.atan2(-dh, dz));
    }
    // sun visors (driver side) and a dome light
    const vis = this.kit.cabin(0xa9a498);
    sb.add(new THREE.BoxGeometry(0.34, 0.012, 0.2), vis, this.eye.x, this.gy + l.h - 0.02, l.z1 - 0.14, 0.12);
    sb.build(this.group, this.kit);
  }

  // ------------------------------------------------------------------ seats
  private buildSeats(seats: { x: number; h: number; z: number }[], hips: { x: number; h: number; z: number }, accentM: THREE.Material): void {
    const s = this.d.seat;
    const fabric = this.kit.cabin(s.fabric);
    const dark = this.kit.cabin(0x16191c);
    const strap = this.kit.mat(0x101214);
    const buckle = this.kit.mat(0xb9c0c6, { emissive: 0x6c7378 });
    const sb = new Batch();
    const rc = Math.cos(s.recline);
    const rs = Math.sin(s.recline);
    const frontZ = hips.z;
    for (const st of seats) {
      const zb = st.z - 0.3; // back foot
      const base = st.h + 0.05;
      const along = (t: number): [number, number] => [base + t * rc, zb - t * rs];
      // cushion + side bolsters
      sb.add(new RoundedBoxGeometry(s.w, 0.1, 0.5, 3, 0.04), fabric, st.x, this.gy + st.h - 0.07, st.z);
      for (const bx of [-1, 1]) sb.add(new RoundedBoxGeometry(0.07, 0.08, 0.44, 2, 0.03), fabric, st.x + bx * (s.w / 2 - 0.02), this.gy + st.h - 0.03, st.z, 0.06);
      // backrest, wings
      const [by, bz] = along(s.back / 2);
      sb.add(new RoundedBoxGeometry(s.w, s.back, 0.1, 3, 0.04), fabric, st.x, this.gy + by, bz, -s.recline);
      const wing = s.sport ? 0.1 : 0.06;
      for (const bx of [-1, 1]) {
        const [wy, wz] = along(s.back * 0.46);
        sb.add(new RoundedBoxGeometry(wing, s.back * (s.sport ? 0.82 : 0.66), 0.17, 2, 0.03), fabric, st.x + bx * (s.w / 2 - wing / 2 + 0.005), this.gy + wy, wz + 0.04, -s.recline);
      }
      // stitched centre stripe
      const [sy, sz] = along(s.back * 0.5);
      sb.add(new THREE.BoxGeometry(s.sport ? 0.14 : 0.1, s.back * 0.7, 0.012), accentM, st.x, this.gy + sy, sz + 0.054, -s.recline);
      // head restraint on two posts
      if (s.head) {
        const [hy, hz] = along(s.back + 0.1);
        sb.add(new RoundedBoxGeometry(s.sport ? 0.24 : 0.2, 0.14, 0.09, 3, 0.04), fabric, st.x, this.gy + hy, hz, -s.recline);
        for (const px of [-0.05, 0.05]) {
          const [py, pz] = along(s.back + 0.0);
          sb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), dark, st.x + px, this.gy + py, pz, -s.recline);
        }
      }
      // seat belt for the front row: shoulder strap from the pillar over the chest to the inner hip + buckle
      if (Math.abs(st.z - frontZ) < 0.01) {
        const out = st.x < 0 ? -1 : 1;
        this.strap(sb, strap, new THREE.Vector3(st.x + out * 0.3, this.gy + st.h + 0.72, st.z - 0.32), new THREE.Vector3(st.x + out * 0.13, this.gy + st.h + 0.6, st.z + 0.02));
        this.strap(sb, strap, new THREE.Vector3(st.x + out * 0.13, this.gy + st.h + 0.6, st.z + 0.17), new THREE.Vector3(st.x - out * 0.14, this.gy + st.h + 0.07, st.z + 0.16));
        sb.add(new THREE.BoxGeometry(0.05, 0.03, 0.02), buckle, st.x - out * 0.15, this.gy + st.h + 0.06, st.z + 0.16);
      }
    }
    sb.build(this.seatsGroup, this.kit);
  }

  private strap(sb: Batch, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    sb.addQ(new THREE.BoxGeometry(0.05, len, 0.008), m, a.clone().add(b).multiplyScalar(0.5), q);
  }

  // ------------------------------------------------------------------ live
  setActive(on: boolean): void {
    this.active = on;
    this.drawClock = 1;
  }

  /** Once per frame for the vehicle the player drives (state = its telemetry). */
  update(s: CockpitState): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.spin.rotation.z = THREE.MathUtils.clamp(s.steerAngle * this.d.wheel.ratio, -3.2, 3.2);
    // wipers: sweep while it rains, glide back to the park position when it stops
    const rain = CabinState.rain;
    if (this.wipers.length) {
      if (rain > 0.06) {
        this.wipePhase += dt * (rain > 0.5 ? 5.2 : 3.2);
        this.wipeAmt = Math.min(1, this.wipeAmt + dt * 4);
      } else {
        this.wipeAmt = Math.max(0, this.wipeAmt - dt * 3);
        if (this.wipeAmt === 0) this.wipePhase = 0;
      }
      const sweep = this.wipeAmt > 0 ? (0.5 - 0.5 * Math.cos(this.wipePhase)) * 1.25 * this.wipeAmt : 0;
      for (const w of this.wipers) w.g.rotation.z = sweep;
    }
    if (!this.active) return;
    this.drawClock += dt;
    if (this.drawClock >= 0.05) {
      this.drawClock = 0;
      this.drawCluster(s);
    }
  }

  private drawCluster(s: CockpitState | null): void {
    paintCluster(this.clusterCtx, s, this.d.maxKmh, this.d.maxKw);
    this.clusterTex.needsUpdate = true;
  }

  /** The vehicle burned: the screens and the glass film go black. */
  char(): void {
    this.active = false;
    for (const m of this.materials) (m as THREE.MeshBasicMaterial).color.setHex(0x050505);
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    void this.screenTex;
  }
}

function dial(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, value: number, max: number, labelStep: number, labelDiv: number, redFrom: number, color: string): void {
  const a0 = (135 * Math.PI) / 180;
  const sweep = (270 * Math.PI) / 180;
  const ang = (v: number): number => a0 + (Math.min(Math.max(v, 0), max) / max) * sweep;
  c.lineWidth = 9;
  c.lineCap = 'butt';
  c.strokeStyle = '#1b2733';
  c.beginPath();
  c.arc(cx, cy, R, a0, a0 + sweep);
  c.stroke();
  if (redFrom < max) {
    c.strokeStyle = '#a8261f';
    c.beginPath();
    c.arc(cx, cy, R, ang(redFrom), ang(max));
    c.stroke();
  }
  c.strokeStyle = color;
  c.beginPath();
  c.arc(cx, cy, R, a0, ang(value));
  c.stroke();
  c.fillStyle = '#cfe0f5';
  c.strokeStyle = '#8aa2bd';
  c.lineWidth = 2;
  c.font = `500 14px ${UI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let v = 0; v <= max + 0.001; v += labelStep) {
    const a = ang(v);
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
    c.lineTo(cx + Math.cos(a) * (R + 1), cy + Math.sin(a) * (R + 1));
    c.stroke();
    c.fillText(toBn(String(Math.round(v / labelDiv))), cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
  }
  // needle
  const na = ang(value);
  c.strokeStyle = '#ff6a3d';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - Math.cos(na) * 10, cy - Math.sin(na) * 10);
  c.lineTo(cx + Math.cos(na) * (R - 12), cy + Math.sin(na) * (R - 12));
  c.stroke();
  c.fillStyle = '#10151a';
  c.beginPath();
  c.arc(cx, cy, 9, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#ff6a3d';
  c.lineWidth = 2;
  c.stroke();
}

function paintCluster(c: CanvasRenderingContext2D, s: CockpitState | null, maxKmh: number, maxKw: number): void {
  const W = 512;
  const H = 256;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#04070a';
  c.fillRect(0, 0, W, H);
  const kmh = s ? s.kmh : 0;
  const step = maxKmh / 10;
  // speedometer (left)
  dial(c, 138, 124, 104, kmh, maxKmh, step, 1, maxKmh * 1.01, '#4ec3ff');
  c.fillStyle = '#ffffff';
  c.font = `700 44px ${UI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(bnNum(kmh), 138, 138);
  c.fillStyle = '#8aa2bd';
  c.font = `400 14px ${UI_FONT}`;
  c.fillText(bn.vehicle.kmh, 138, 172);
  // rpm (fuel) or motor power (electric) dial (right)
  const electric = s ? s.energyKind === 'electric' : false;
  if (electric) {
    const kw = s ? Math.abs(s.powerKw) : 0;
    dial(c, 392, 140, 80, kw, maxKw, maxKw / 5, 1, maxKw * 0.9, s && s.powerKw < 0 ? '#4ee08a' : '#4ec3ff');
    c.fillStyle = '#8aa2bd';
    c.font = `400 13px ${UI_FONT}`;
    c.fillText('kW', 392, 172);
  } else {
    const redline = s ? s.redline : 6000;
    const maxRpm = Math.ceil(redline / 1000) * 1000;
    dial(c, 392, 140, 80, s ? s.rpm : 0, maxRpm, 1000, 1000, redline * 0.92, '#ffb347');
    c.fillStyle = '#8aa2bd';
    c.font = `400 13px ${UI_FONT}`;
    c.fillText(bn.vehicle.rpmUnit, 392, 176);
  }
  // gear
  const g = s ? s.gear : 0;
  const gearTxt = g === 0 ? 'N' : g < 0 ? 'R' : electric && s && s.auto ? 'D' : bnNum(g);
  c.fillStyle = s && s.shifting ? '#ffd479' : '#ffffff';
  c.font = `700 34px ${UI_FONT}`;
  c.fillText(gearTxt, 392, 130);
  // energy bar + range
  if (s && s.energyKind) {
    const e = Math.max(0, Math.min(1, s.energy));
    c.fillStyle = '#1b2733';
    c.fillRect(120, 232, 272, 9);
    c.fillStyle = e <= 0.15 ? '#ff5a4a' : s.energyKind === 'electric' ? '#4ee08a' : '#ffb347';
    c.fillRect(120, 232, 272 * e, 9);
    c.fillStyle = '#cfe0f5';
    c.font = `500 13px ${UI_FONT}`;
    c.textAlign = 'right';
    c.fillText(s.energyKind === 'electric' ? bn.vehicle.charge : bn.vehicle.fuel, 112, 237);
    c.textAlign = 'left';
    c.fillText(`≈ ${bnNum(s.rangeKm, 1)} ${bn.vehicle.km}`, 400, 237);
  }
  // handbrake lamp
  if (s && s.handbrake) {
    c.fillStyle = '#ff3b30';
    c.beginPath();
    c.arc(40, 36, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = `700 18px ${UI_FONT}`;
    c.textAlign = 'center';
    c.fillText('P', 40, 37);
  }
}
