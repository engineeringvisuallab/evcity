import * as THREE from 'three';
import type { HumanRig } from './HumanBody';
import { sstep } from './SkinMath';
import { weaponSpec, type WeaponId } from '../combat/Weapons';

/**
 * Real two-handed gun handling on the skinned body (skipped on the old rigid body, which keeps its simple pose).
 *  - the right hand holds the grip close to the chest, the gun points exactly along the aim (camera pitch), the wrist adapts
 *  - the left hand is placed on the foregrip / under the grip by two-bone IK, so the arm bends at a natural elbow
 *  - recoil: gun kicks up, hand and chest are pushed back, then everything settles
 *  - reload: gun comes down, the left hand fetches a magazine from the belt, pushes it in and racks the gun
 * Everything is blended in/out with `blend` (0 = normal animation, 1 = full aim pose).
 * Conventions: the gun's barrel points along its local -Y, its sights are on local +Z (see GunModel).
 */

const L1 = 0.3; // shoulder -> elbow
const L2 = 0.33; // elbow -> palm
const SIDEARMS = new Set<WeaponId>(['pistol', 'combatPistol', 'heavyPistol', 'revolver']);
const COMPACT = new Set<WeaponId>(['microSmg', 'smg']);

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

const _q = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tr = new THREE.Vector3();
const _tl = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _belt = new THREE.Vector3(-0.06, -0.2, 0.2);
const _ax = new THREE.Vector3(1, 0, 0);

interface ArmSolution {
  q: THREE.Quaternion;
  bend: number;
}

/** Two-bone IK in the chest's local space: the arm bone's orientation + the elbow bend for the palm to reach `target`. */
function solveArm(shoulder: THREE.Vector3, sx: number, target: THREE.Vector3, out: ArmSolution): void {
  const dv = _p1.copy(target).sub(shoulder);
  const dist = clamp(dv.length(), Math.abs(L1 - L2) + 0.03, (L1 + L2) * 0.995);
  const dir = dv.normalize();
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const A = Math.acos(cosA);
  // the elbow points down and a little outward / back
  const pole = _p2.set(sx * 0.35, -1, -0.15);
  const perp = pole.addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(sx, 0, 0);
  perp.normalize();
  const u = _y.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(perp, Math.sin(A)); // upper arm direction
  const elbow = _z.copy(u).multiplyScalar(L1).add(shoulder);
  const reach = _x.copy(dir).multiplyScalar(dist).add(shoulder);
  const f = reach.sub(elbow).normalize(); // forearm direction
  const bend = Math.acos(clamp(u.dot(f), -1, 1));
  // bone axes in chest space: local -Y = upper arm, local +Z = the side the forearm bends towards
  const zv = _tr.copy(f).addScaledVector(u, -f.dot(u));
  if (zv.lengthSq() < 1e-8) zv.set(0, 0, 1);
  zv.normalize();
  const yv = u.clone().negate();
  const xv = new THREE.Vector3().crossVectors(yv, zv).normalize();
  _m.makeBasis(xv, yv, zv);
  out.q.setFromRotationMatrix(_m);
  out.bend = bend;
}

/** Per-weapon hand positions in gun space: where the support hand goes, and where the magazine is. */
export function gripPoints(id: WeaponId, support: THREE.Vector3, mag: THREE.Vector3): void {
  const len = weaponSpec(id).gunLength;
  if (SIDEARMS.has(id)) {
    support.set(-0.02, -0.05, -0.09);
    mag.set(0, -0.07, -0.13);
    return;
  }
  const frac = id === 'shotgun' ? 0.6 : COMPACT.has(id) ? 0.42 : 0.3;
  support.set(0, -len * frac, -0.075);
  mag.set(0, -len * 0.55, -0.13);
}

const armSol: ArmSolution = { q: new THREE.Quaternion(), bend: 0 };

/**
 * Put both arms (and the chest / head) into the aim pose. `a.gun` must be a child of the right hand bone.
 * Call AFTER the normal limb animation of the frame.
 */
export function aimPose(
  rig: HumanRig,
  a: { blend: number; pitch: number; recoil: number; reload: number; lower: number; gun: THREE.Object3D; support: THREE.Vector3; mag: THREE.Vector3 },
): void {
  const { chest, head, handR, handL, spine, hips } = rig;
  if (!chest || !head || !handR || !handL || !spine || !hips) return;
  const b = a.blend;
  const rl = a.reload;
  const env = Math.max(rl >= 0 ? sstep(0, 0.2, rl) * (1 - sstep(0.85, 1, rl)) : 0, a.lower); // gun lowered while reloading / swapping
  const pitch = a.pitch + a.recoil * 0.09 - env * 0.55;

  // torso: lean back a little for high shots, forward for low ones, pushed back by the recoil
  const lerp = (cur: number, to: number): number => cur + (to - cur) * b;
  chest.rotation.x = lerp(chest.rotation.x, 0.05 - a.pitch * 0.35 - a.recoil * 0.05);
  head.rotation.x = lerp(head.rotation.x, -a.pitch * 0.5);
  head.rotation.y = lerp(head.rotation.y, 0);

  // the aim direction in the chest's local space
  _qc.copy(rig.pivot.quaternion).multiply(hips.quaternion).multiply(spine.quaternion).multiply(chest.quaternion).invert();
  _dir.set(0, Math.sin(pitch), Math.cos(pitch)).applyQuaternion(_qc);

  // ---- right arm: the hand holds the grip close to the chest ----
  const shR = rig.armR.position;
  _tr.set(0.09, 0.25 - env * 0.1, 0.3 - a.recoil * 0.045 - env * 0.08);
  solveArm(shR, 1, _tr, armSol);
  const armQR = armSol.q.clone();
  const bendR = armSol.bend;
  _qf.setFromAxisAngle(_ax, -bendR);
  // wrist: turn the hand so the gun points along the aim with its sights up
  _y.copy(_dir).negate();
  _z.copy(_up).addScaledVector(_dir, -_up.dot(_dir));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _qg.setFromRotationMatrix(_m);
  _q.copy(armQR).multiply(_qf).invert().multiply(_qg); // wrist rotation relative to the forearm
  const ang = 2 * Math.acos(clamp(Math.abs(_q.w), 0, 1));
  const wrist = _q.clone();
  if (ang > 1.1) wrist.identity().slerp(_q, 1.1 / ang);

  // ---- left arm: onto the foregrip (or the magazine / belt while reloading) ----
  rig.armR.quaternion.slerp(armQR, b);
  rig.foreR.quaternion.setFromAxisAngle(_ax, lerp(rig.foreR.rotation.x, -bendR));
  handR.quaternion.identity().slerp(wrist, b);
  rig.armR.updateMatrix();
  rig.foreR.updateMatrix();
  handR.updateMatrix();
  a.gun.updateMatrix();
  _m.copy(rig.armR.matrix).multiply(rig.foreR.matrix).multiply(handR.matrix).multiply(a.gun.matrix);
  const support = _tl.copy(a.support).applyMatrix4(_m);
  if (rl >= 0) {
    const magP = _p1.copy(a.mag).applyMatrix4(_m);
    const s = support.clone();
    if (rl < 0.25) support.lerpVectors(s, _belt, sstep(0, 0.25, rl));
    else if (rl < 0.55) support.lerpVectors(_belt, magP, sstep(0.25, 0.55, rl));
    else if (rl < 0.8) support.copy(magP).y += Math.sin((rl - 0.55) * 40) * 0.006;
    else support.lerpVectors(magP, s, sstep(0.8, 0.92, rl)).z += Math.sin(sstep(0.92, 1, rl) * Math.PI) * 0.035; // rack
  }
  solveArm(rig.armL.position, -1, support, armSol);
  rig.armL.quaternion.slerp(armSol.q, b);
  rig.foreL.quaternion.setFromAxisAngle(_ax, lerp(rig.foreL.rotation.x, -armSol.bend));
  handL.quaternion.identity();
}

/** Holds the state of the aim pose of one person (blend, recoil, reload) and runs aimPose. */
export class AimController {
  gun: THREE.Object3D | null = null;
  private id: WeaponId | null = null;
  private blend = 0;
  private recoil = 0;
  private reload = -1;
  private swapT = -1;
  private swapDone: (() => void) | null = null;
  private readonly support = new THREE.Vector3();
  private readonly mag = new THREE.Vector3();

  /** The gun object (child of the right hand bone) and which weapon it is. */
  setGun(id: WeaponId | null, gun: THREE.Object3D | null): void {
    if (id === this.id && gun === this.gun) return;
    this.id = id;
    this.gun = gun;
    if (id) gripPoints(id, this.support, this.mag);
  }

  /** One shot: the gun kicks up. */
  kick(strength = 1): void {
    this.recoil = Math.min(1.4, this.recoil + 0.7 * strength);
  }

  /** Weapon swap: the gun goes down, `mid` is called at the lowest point (put the new gun in the hand), then it comes up again. */
  startSwap(mid: () => void): void {
    this.swapDone?.(); // an unfinished swap: finish it first
    this.swapT = 0;
    this.swapDone = mid;
  }

  /** -1 = not reloading, else progress 0..1. */
  setReload(progress: number): void {
    this.reload = progress;
  }

  get active(): boolean {
    return this.blend > 0.001;
  }

  update(rig: HumanRig, dt: number, aiming: boolean, pitch: number): void {
    if (!rig.handR) return; // rigid body: nothing to do
    const want = aiming && this.gun ? 1 : 0;
    this.blend += (want - this.blend) * Math.min(1, 10 * dt);
    if (this.blend < 0.003 && want === 0) {
      if (this.blend !== 0) {
        this.blend = 0;
        rig.handR.quaternion.identity();
        rig.handL?.quaternion.identity();
        for (const o of [rig.armL, rig.armR, rig.foreL, rig.foreR]) {
          o.rotation.y = 0;
          o.rotation.z = 0;
        }
      }
      this.recoil = 0;
      if (this.swapDone) {
        this.swapDone();
        this.swapDone = null;
        this.swapT = -1;
      }
      return;
    }
    this.recoil *= Math.exp(-13 * dt);
    let lower = 0;
    if (this.swapT >= 0) {
      const SWAP = 0.4;
      this.swapT += dt;
      if (this.swapT >= SWAP / 2 && this.swapDone) {
        this.swapDone();
        this.swapDone = null;
      }
      if (this.swapT >= SWAP) this.swapT = -1;
      else lower = Math.sin((this.swapT / SWAP) * Math.PI);
    }
    if (!this.gun) return;
    // old twist from the previous frame must not leak into the normal pose while blending out
    for (const o of [rig.armL, rig.armR, rig.foreL, rig.foreR]) {
      o.rotation.y *= 0.5;
      o.rotation.z *= 0.5;
    }
    aimPose(rig, { blend: this.blend, pitch: clamp(pitch, -0.9, 0.9), recoil: this.recoil, reload: this.reload, lower, gun: this.gun, support: this.support, mag: this.mag });
  }
}
