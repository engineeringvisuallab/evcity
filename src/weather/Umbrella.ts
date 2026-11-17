import * as THREE from 'three';

/**
 * UMBRELLA for people and for the player. One shared dome + pole geometry and one material per colour, so a crowd of
 * umbrellas costs almost nothing. It is built on the first rain only.
 *
 * The umbrella hangs on the body pivot (hips): the pole is held in the left hand (the arm is raised by `holdArm()`),
 * the canopy is tilted a little towards the head so it covers it. It opens / closes smoothly (canopy scale).
 */
const COLORS = [0xc0392b, 0x1f4e8c, 0x23272b, 0x2e7d32, 0xe0b100, 0x7b3fa0, 0x00838f, 0xe67e22, 0xd6336c, 0x3a3a8c];

let domeGeo: THREE.BufferGeometry | null = null;
let poleGeo: THREE.BufferGeometry | null = null;
let tipGeo: THREE.BufferGeometry | null = null;
const canopyMats = new Map<number, THREE.MeshLambertMaterial>();
let poleMat: THREE.MeshLambertMaterial | null = null;

function shared(color: number): { dome: THREE.BufferGeometry; pole: THREE.BufferGeometry; tip: THREE.BufferGeometry; cm: THREE.Material; pm: THREE.Material } {
  if (!domeGeo) {
    // an 8-sided dome: looks like the panels of a real umbrella
    domeGeo = new THREE.SphereGeometry(0.6, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1, 0.42, 1);
    poleGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1);
    poleGeo.translate(0, -0.5, 0); // top at the origin, hangs down
    tipGeo = new THREE.SphereGeometry(0.03, 6, 4);
    poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  }
  let cm = canopyMats.get(color);
  if (!cm) {
    cm = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true });
    canopyMats.set(color, cm);
  }
  return { dome: domeGeo, pole: poleGeo!, tip: tipGeo!, cm, pm: poleMat! };
}

/** Pose of the holding arm (shoulder swing, elbow bend; negative = forward / up) in the body pivot. */
export const UMBRELLA_ARM = -1.1;
export const UMBRELLA_FORE = -1.5;

export class Umbrella {
  readonly root = new THREE.Group();
  private canopy: THREE.Mesh;
  /** 0 = closed (hidden) .. 1 = fully open. */
  open = 0;

  /**
   * @param pivot the body pivot (hips; the body is 0.9 m above the feet there)
   * @param side -1 when the holding arm hangs at x < 0 (the left arm of the rig), +1 otherwise
   * @param seed 0..1 picks the colour
   */
  constructor(pivot: THREE.Object3D, side: number, seed: number) {
    const s = shared(COLORS[Math.floor(seed * COLORS.length) % COLORS.length]);
    // the hand (with the arm raised to UMBRELLA_ARM / UMBRELLA_FORE) and the centre of the canopy, both in the pivot's space
    const hand = new THREE.Vector3(side * 0.29, 0.62, 0.4);
    const top = new THREE.Vector3(side * 0.07, 1.3, 0.1);
    this.root.position.copy(top);
    this.canopy = new THREE.Mesh(s.dome, s.cm);
    this.canopy.castShadow = false;
    this.root.add(this.canopy);
    const dir = hand.clone().sub(top);
    const len = dir.length() + 0.16; // a little handle below the hand
    const pole = new THREE.Mesh(s.pole, s.pm);
    pole.scale.set(1, len, 1);
    pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    this.root.add(pole);
    const tip = new THREE.Mesh(s.tip, s.pm);
    tip.position.y = 0.25; // the knob on top of the canopy
    this.canopy.add(tip);
    this.root.visible = false;
    pivot.add(this.root);
  }

  /**
   * Opens / closes the umbrella and returns how much of the holding pose to apply (0..1).
   * @param want true = the person wants it up
   */
  update(dt: number, want: boolean): number {
    const to = want ? 1 : 0;
    this.open += (to - this.open) * Math.min(1, dt * (want ? 4 : 6));
    if (Math.abs(this.open - to) < 0.01) this.open = to;
    const o = this.open;
    this.root.visible = o > 0.02;
    if (this.root.visible) {
      const k = 0.15 + 0.85 * o;
      this.canopy.scale.set(k, 0.4 + 0.6 * o, k);
    }
    return o;
  }

  remove(): void {
    this.root.removeFromParent();
  }
}

/** Blend the holding arm pose into the animation (call after the normal arm animation of the frame). */
export function holdArm(arm: THREE.Object3D, fore: THREE.Object3D, o: number): void {
  if (o <= 0.001) return;
  arm.rotation.x += (UMBRELLA_ARM - arm.rotation.x) * o;
  fore.rotation.x += (UMBRELLA_FORE - fore.rotation.x) * o;
}
