// EVLab Step 9: a plain city bicycle (diamond frame, two spoked wheels, fork, handlebar, saddle, crank with pedals, chain, rear carrier).
// Model only: it has no physics and no AI. A rider (Step 10) can put its feet on `CYCLE.pedal`, its seat on `CYCLE.saddle` and its hands on `CYCLE.grip`.
// Metres. The cycle faces +Z (like VehicleModel), its left side is +X, y = 0 is the ground, the origin is on the ground between the two tyre contact points
// (rear z = -0.53, front z = +0.58). Parts that move: the two wheels (spin about x), the front end (steers about the head tube), the crank (turns about x, the
// pedals stay level). Everything static is merged per material, so a cycle is about 14 meshes; the geometry lives in a shared CycleKit (many cycles, one kit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = readonly [number, number, number];

const R = 0.335; // outer radius of a wheel with its tyre
const TYRE = 0.03; // tyre tube radius
const V = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const mir = (p: V3): V3 => [-p[0], p[1], p[2]];

/** The numbers a rider, a rack or a test needs. */
export const CYCLE = {
  wheelR: R,
  /** Wheel centres. */
  axleR: [0, R, -0.53] as V3,
  axleF: [0, R, 0.58] as V3,
  /** Crank axle (bottom bracket) and crank arm length. */
  bb: [0, 0.29, -0.06] as V3,
  crankLen: 0.17,
  /** Top of the saddle (where the sit bones rest). */
  saddle: [0, 1.0, -0.27] as V3,
  /** Centre of each grip (left = +x). */
  grip: [[0.3, 0.9475, 0.2875], [-0.3, 0.9475, 0.2875]] as V3[],
  /** Pedal centres at crank angle 0 (left = +x: the left pedal is up, the right pedal is down). */
  pedal: [[0.11, 0.46, -0.06], [-0.11, 0.12, -0.06]] as V3[],
  /** Head tube: top and bottom (the steering axis runs through them). */
  headTop: [0, 0.85, 0.385] as V3,
  headBot: [0, 0.71, 0.435] as V3,
  /** Overall size. */
  length: 0.58 + 0.53 + 2 * R,
  width: 0.62,
  height: 1.03,
};

const COLORS = { metal: 0xb9c0c8, black: 0x17181a, tyre: 0x1a1a1c, saddle: 0x2b2420, reflector: 0xd01818, bell: 0xd8dde2 };
export const CYCLE_PAINT = [0x1f5fa8, 0xb3262e, 0x2c7a4b, 0x20252b, 0xd49a1f, 0x6a3d8f, 0x0f7d86] as const;

// ------------------------------------------------------------------------------------------------ geometry helpers (all baked in cycle coordinates)
const UP = new THREE.Vector3(0, 1, 0);
/** A cylinder from a to b. */
function tube(a: V3, b: V3, r: number, seg = 6, r2 = r): THREE.BufferGeometry {
  const va = V(a), vb = V(b);
  const g = new THREE.CylinderGeometry(r2, r, va.distanceTo(vb), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
/** A cylinder along x. */
function axle(x: number, y: number, z: number, r: number, len: number, seg = 10): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);
}
function box(cx: number, cy: number, cz: number, w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('EVLabCycle: merge failed');
  list.forEach((x) => x.dispose());
  return g;
}
/** A flat strip (chain run) between two points in the y-z plane. */
function strip(a: V3, b: V3, w: number, t: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, t, a === b ? 0.01 : V(a).distanceTo(V(b)));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(b).sub(V(a)).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

// ------------------------------------------------------------------------------------------------ the kit (shared geometry + materials)
export class CycleKit {
  /** Static parts of the frame: paint (tubes), metal (bottom bracket, seat post, carrier), black (saddle, chain, carrier plate, reflector). */
  readonly framePaint: THREE.BufferGeometry;
  readonly frameMetal: THREE.BufferGeometry;
  readonly frameBlack: THREE.BufferGeometry;
  /** Front end (turns with the handlebar): fork (paint), bar + stem (metal), grips (black). */
  readonly forkPaint: THREE.BufferGeometry;
  readonly forkMetal: THREE.BufferGeometry;
  readonly forkBlack: THREE.BufferGeometry;
  /** A wheel without its tyre (rim, hub, spokes) and the tyre; the two wheels share them. */
  readonly rim: THREE.BufferGeometry;
  readonly tyre: THREE.BufferGeometry;
  /** Rear wheel only: the sprocket on the right side. */
  readonly cog: THREE.BufferGeometry;
  /** Crank set: chain ring + arms (metal), one pedal (black). */
  readonly crankMetal: THREE.BufferGeometry;
  readonly pedal: THREE.BufferGeometry;
  readonly metal = new THREE.MeshLambertMaterial({ color: COLORS.metal });
  readonly black = new THREE.MeshLambertMaterial({ color: COLORS.black });
  readonly tyreMat = new THREE.MeshLambertMaterial({ color: COLORS.tyre });
  private paints = new Map<number, THREE.MeshLambertMaterial>();

  constructor() {
    const A = CYCLE.axleR, F = CYCLE.axleF, BB = CYCLE.bb, HT = CYCLE.headTop, HB = CYCLE.headBot;
    const seatTop: V3 = [0, 0.8, -0.26];

    // ---- frame (diamond): top tube, down tube, seat tube, head tube, seat stays, chain stays
    const paint: THREE.BufferGeometry[] = [
      tube(HT, [0, 0.79, -0.255], 0.016, 7), // top tube (slightly sloping towards the saddle)
      tube(HB, BB, 0.019, 7), // down tube
      tube(BB, seatTop, 0.016, 7), // seat tube
      tube(HB, HT, 0.021, 8), // head tube
    ];
    for (const s of [1, -1]) {
      paint.push(tube([0.03 * s, 0.765, -0.256], [0.055 * s, R, A[2]], 0.009, 5)); // seat stay
      paint.push(tube([0.03 * s, BB[1], BB[2] - 0.02], [0.055 * s, R, A[2]], 0.01, 5)); // chain stay
    }
    this.framePaint = merge(paint);

    // seat post + clamp, bottom bracket shell, rear carrier (two stays, rails, plate)
    const dirSeat = V(seatTop).sub(V(BB)).normalize();
    const postTop = V(seatTop).addScaledVector(dirSeat, 0.17);
    const metal: THREE.BufferGeometry[] = [
      tube(seatTop, [postTop.x, postTop.y, postTop.z], 0.0125, 8),
      axle(0, BB[1], BB[2], 0.02, 0.075, 10),
    ];
    for (const s of [1, -1]) {
      metal.push(tube([0.06 * s, R + 0.02, A[2] + 0.01], [0.07 * s, 0.6, -0.5], 0.005, 4)); // carrier stay
      metal.push(tube([0.07 * s, 0.6, -0.31], [0.07 * s, 0.6, -0.66], 0.006, 4)); // carrier rail
    }
    metal.push(tube([-0.07, 0.6, -0.31], [0.07, 0.6, -0.31], 0.006, 4), tube([-0.07, 0.6, -0.66], [0.07, 0.6, -0.66], 0.006, 4));
    this.frameMetal = merge(metal);

    // saddle (flat ellipsoid + narrow nose), carrier plate, chain (top and bottom run), rear reflector
    const sad = new THREE.SphereGeometry(1, 10, 6).scale(0.085, 0.028, 0.115).translate(0, CYCLE.saddle[1] - 0.012, CYCLE.saddle[2] - 0.03);
    const nose = new THREE.SphereGeometry(1, 8, 5).scale(0.035, 0.022, 0.085).translate(0, CYCLE.saddle[1] - 0.012, CYCLE.saddle[2] + 0.1);
    const chainTop = chainRun(BB, A, 0.095, 0.045, 1), chainBot = chainRun(BB, A, 0.095, 0.045, -1);
    const refl = box(0, 0.55, -0.675, 0.05, 0.035, 0.012);
    this.frameBlack = merge([sad, nose, box(0, 0.608, -0.485, 0.16, 0.012, 0.36), chainTop, chainBot, refl]);

    // ---- front end, built in cycle coordinates (the Cycle turns it about the head tube)
    const fork: THREE.BufferGeometry[] = [box(0, HB[1] - 0.005, HB[2] + 0.005, 0.125, 0.025, 0.03)]; // crown
    for (const s of [1, -1]) fork.push(tube([0.058 * s, HB[1] - 0.012, HB[2] + 0.012], [0.058 * s, F[1], F[2]], 0.0115, 6, 0.008)); // fork leg (tapers to the dropout)
    this.forkPaint = merge(fork);

    const steerTop = V(HT).addScaledVector(V(HT).sub(V(HB)).normalize(), 0.1);
    const barA: V3 = [0.24, 0.965, 0.4], barB: V3 = [0.28, 0.955, 0.335];
    const barM: THREE.BufferGeometry[] = [
      tube(HB, [steerTop.x, steerTop.y, steerTop.z], 0.0115, 7), // steerer
      tube([steerTop.x, steerTop.y, steerTop.z], [0, 0.955, 0.39], 0.013, 7), // stem
      tube(mir(barA), barA, 0.0115, 7), // bar, centre
    ];
    for (const s of [1, -1]) {
      barM.push(tube([barA[0] * s, barA[1], barA[2]], [barB[0] * s, barB[1], barB[2]], 0.0115, 7)); // swept-back end
      barM.push(tube([0.255 * s, 0.9615, 0.375], [0.255 * s, 0.9, 0.36], 0.006, 4)); // brake lever hinge
    }
    barM.push(new THREE.SphereGeometry(0.018, 8, 5).translate(0.2, 0.99, 0.4)); // bell
    this.forkMetal = merge(barM);

    const grips: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) grips.push(tube([barB[0] * s, barB[1], barB[2]], [0.325 * s, 0.94, 0.24], 0.0165, 7));
    // headlight
    grips.push(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.9, 0.46));
    this.forkBlack = merge(grips);

    // ---- a wheel: rim, hub, 16 spokes (laced); the tyre is a separate torus. Axis = x, centre = origin.
    const rimR = R - TYRE * 2 + 0.002;
    const rim: THREE.BufferGeometry[] = [
      new THREE.TorusGeometry(rimR, 0.011, 5, 28).rotateY(Math.PI / 2),
      axle(0, 0, 0, 0.018, 0.1, 8),
      axle(0.033, 0, 0, 0.032, 0.006, 10),
      axle(-0.033, 0, 0, 0.032, 0.006, 10),
    ];
    const SP = 16;
    for (let i = 0; i < SP; i++) {
      const a = (i / SP) * Math.PI * 2, s = i % 2 ? 1 : -1;
      const hub: V3 = [0.033 * s, Math.cos(a) * 0.03, Math.sin(a) * 0.03];
      const rm: V3 = [0, Math.cos(a + 0.42 * s) * (rimR - 0.01), Math.sin(a + 0.42 * s) * (rimR - 0.01)];
      rim.push(tube(hub, rm, 0.0016, 3));
    }
    this.rim = merge(rim);
    this.tyre = new THREE.TorusGeometry(R - TYRE, TYRE, 6, 28).rotateY(Math.PI / 2).scale(0.85, 1, 1);
    this.cog = axle(-0.05, 0, 0, 0.045, 0.01, 10);

    // ---- crank set at the bottom bracket (origin = the bracket): chain ring on the right (-x), two arms (right one points down, left one up)
    const L = CYCLE.crankLen;
    this.crankMetal = merge([
      axle(-0.045, 0, 0, 0.095, 0.008, 14),
      tube([-0.062, 0, 0], [-0.062, -L, 0], 0.011, 5),
      tube([0.062, 0, 0], [0.062, L, 0], 0.011, 5),
    ]);
    this.pedal = merge([box(0, 0, 0, 0.1, 0.022, 0.09), axle(0, 0, 0, 0.007, 0.1, 5)]);
  }

  /** Paint material for a colour (cached). */
  paintMat(color: number): THREE.MeshLambertMaterial {
    let m = this.paints.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.paints.set(color, m);
    }
    return m;
  }

  dispose(): void {
    for (const g of [this.framePaint, this.frameMetal, this.frameBlack, this.forkPaint, this.forkMetal, this.forkBlack, this.rim, this.tyre, this.cog, this.crankMetal, this.pedal]) g.dispose();
    for (const m of [this.metal, this.black, this.tyreMat, ...this.paints.values()]) m.dispose();
    this.paints.clear();
  }
}

/** One run of the chain: tangent-ish strip between the chain ring (centre BB, radius r1) and the rear sprocket (centre axle, radius r2), on the right side. */
function chainRun(bb: V3, ax: V3, r1: number, r2: number, sign: 1 | -1): THREE.BufferGeometry {
  const dy = ax[1] - bb[1], dz = ax[2] - bb[2], l = Math.hypot(dy, dz);
  const ny = -dz / l * sign, nz = dy / l * sign; // normal of the line bb -> axle in the y-z plane
  const a: V3 = [-0.045, bb[1] + ny * r1, bb[2] + nz * r1], b: V3 = [-0.045, ax[1] + ny * r2, ax[2] + nz * r2];
  return strip(a, b, 0.012, 0.006);
}

// ------------------------------------------------------------------------------------------------ one cycle
export class Cycle {
  readonly root = new THREE.Group();
  /** Moving parts: wheels spin about x, `steer` turns about the head tube, `crank` turns about x (pedals counter-rotate to stay level). */
  readonly frontWheel = new THREE.Group();
  readonly rearWheel = new THREE.Group();
  readonly steer = new THREE.Group();
  readonly crank = new THREE.Group();
  readonly pedals: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private yaw = new THREE.Group();
  private _steer = 0;
  private _pedal = 0;

  constructor(readonly kit: CycleKit, color: number = CYCLE_PAINT[0]) {
    this.root.name = 'EVLabCycle';
    const paint = kit.paintMat(color);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    const r = this.root;
    mesh(kit.framePaint, paint, r);
    mesh(kit.frameMetal, kit.metal, r);
    mesh(kit.frameBlack, kit.black, r);

    // rear wheel (the sprocket turns with it)
    this.rearWheel.position.set(...CYCLE.axleR);
    mesh(kit.rim, kit.metal, this.rearWheel);
    mesh(kit.tyre, kit.tyreMat, this.rearWheel);
    mesh(kit.cog, kit.metal, this.rearWheel);
    r.add(this.rearWheel);

    // front end: tilt (head tube angle) -> yaw (steering) -> content in cycle coordinates
    const hb = V(CYCLE.headBot), axis = V(CYCLE.headTop).sub(hb).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
    this.steer.position.copy(hb);
    this.steer.quaternion.copy(q);
    const content = new THREE.Group();
    content.quaternion.copy(q.clone().invert());
    content.position.copy(hb.clone().applyQuaternion(q.clone().invert()).negate());
    this.steer.add(this.yaw);
    this.yaw.add(content);
    mesh(kit.forkPaint, paint, content);
    mesh(kit.forkMetal, kit.metal, content);
    mesh(kit.forkBlack, kit.black, content);
    this.frontWheel.position.set(...CYCLE.axleF);
    mesh(kit.rim, kit.metal, this.frontWheel);
    mesh(kit.tyre, kit.tyreMat, this.frontWheel);
    content.add(this.frontWheel);
    r.add(this.steer);

    // crank + pedals
    this.crank.position.set(...CYCLE.bb);
    mesh(kit.crankMetal, kit.metal, this.crank);
    const L = CYCLE.crankLen;
    this.pedals[0].position.set(0.11, L, 0); // left arm points up
    this.pedals[1].position.set(-0.11, -L, 0); // right arm points down
    for (const p of this.pedals) {
      mesh(kit.pedal, kit.black, p);
      this.crank.add(p);
    }
    r.add(this.crank);
  }

  /** Steering angle (rad, + = to the left), limited to about 35 degrees. */
  setSteer(a: number): void {
    this._steer = Math.max(-0.6, Math.min(0.6, a));
    this.yaw.rotation.y = this._steer;
  }
  get steerAngle(): number { return this._steer; }

  /** Crank angle (rad); the pedals stay level. */
  setPedal(a: number): void {
    this._pedal = a;
    this.crank.rotation.x = a;
    for (const p of this.pedals) p.rotation.x = -a;
  }
  get pedalAngle(): number { return this._pedal; }

  /** The cycle rolled `d` metres forward: the wheels spin, the crank turns (about 2.6 crank turns per wheel turn on a city bike: gear ratio ~2.6). */
  roll(d: number): void {
    const a = d / R;
    this.frontWheel.rotation.x += a;
    this.rearWheel.rotation.x += a;
    this.setPedal(this._pedal + a / 2.6);
  }

  /** Put the cycle on the ground at (x, z) with heading (yaw about y, 0 = nose to +z). */
  place(x: number, y: number, z: number, heading: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
  }

  /** The geometry and materials belong to the CycleKit: this only detaches the model. */
  dispose(): void {
    this.root.removeFromParent();
  }
}

export function buildCycle(kit: CycleKit, color: number = CYCLE_PAINT[0]): Cycle {
  return new Cycle(kit, color);
}
