// STEP J1-SIG: the four corner signal masts of the ground-level J1 (the red dots at the corners of the crossing box).
// Each mast = a tapered 8-sided lighting-stand pole on a stepped base with a collar, a curved tapered MAST ARM that reaches over the through lanes + the pockets of its arm (the signal heads hang
// from it: TrafficLightLayer), a drop bracket for every head, a black back plate behind every head, and at the pole top a swan-neck LUMINAIRE arm with a street lamp that lights the open box (warm at night, like StreetLights).
// All of it is merged into 2 meshes (steel + lamp glow) in ABSOLUTE world coordinates: 2 draw calls for the four masts. Shape numbers: J1MastSpec.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrafficSignals } from './TrafficSignals';
import { LAMP_REACH, MAST_ARM_Y0, MAST_POLE_H, mastArmY, type MastSpec } from './J1MastSpec';

const STEEL = 0x5a6068;
const BLACK = 0x15171a;
const LAMP_DAY = new THREE.Color(0x9a9ea3);
const LAMP_NIGHT = new THREE.Color(1.0, 0.86, 0.58);

/** Tapered tube along a polyline (radius r0 at the first point, r1 at the last), 8 sides, with normals + uv so it merges with the primitives. */
function taperedTube(pts: THREE.Vector3[], r0: number, r1: number, sides = 8): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    let u = new THREE.Vector3().crossVectors(up, t);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(t, u).normalize();
    const r = r0 + (r1 - r0) * (i / (n - 1));
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const nx = Math.cos(a) * u.x + Math.sin(a) * v.x, ny = Math.cos(a) * u.y + Math.sin(a) * v.y, nz = Math.cos(a) * u.z + Math.sin(a) * v.z;
      pos.push(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(j / sides, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = (i + 1) * sides + j, d = (i + 1) * sides + ((j + 1) % sides);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A primitive placed in world space: position, yaw (rotation about Y), optional pitch about its local X first. */
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
  return g;
}

export class J1SignalMasts {
  readonly group = new THREE.Group();
  private steelMat = new THREE.MeshLambertMaterial({ color: STEEL });
  private lampMat = new THREE.MeshBasicMaterial({ color: LAMP_DAY.clone(), fog: false });
  private geos: THREE.BufferGeometry[] = [];
  private backMat = new THREE.MeshLambertMaterial({ color: BLACK });

  constructor(parent: THREE.Object3D, signals: TrafficSignals) {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('j1masts') === '0') return; // A/B test: ?j1masts=0 leaves the four masts out (FPS check)
    const pad = signals.pads.find((p) => p.masts && p.masts.length > 0);
    if (!pad || !pad.masts) return; // no J1 in this world
    const steel: THREE.BufferGeometry[] = [];
    const lamp: THREE.BufferGeometry[] = [];
    const back: THREE.BufferGeometry[] = [];
    for (const m of pad.masts) this.buildMast(m, steel, lamp);
    // back plates behind every head of the J1 legs (they hang from the arms)
    for (const a of pad.arms) {
      if (!a.mast) continue;
      const yaw = Math.atan2(a.dx, a.dz);
      const spots = [{ x: a.poleX, z: a.poleZ, y: a.poleY + (a.headH ?? 0) }, ...(a.extraHeads ?? []).map((e) => ({ x: e.x, z: e.z, y: a.poleY + e.h }))];
      for (const sp of spots) {
        const g = new THREE.BoxGeometry(0.66, 1.56, 0.04);
        g.translate(0, 0, -0.21);
        back.push(place(g, sp.x, sp.y, sp.z, yaw));
      }
    }
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material): void => {
      if (list.length === 0) return;
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      if (!g) return;
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    };
    mk(steel, this.steelMat);
    mk(lamp, this.lampMat);
    mk(back, this.backMat);
    parent.add(this.group);
  }

  private buildMast(m: MastSpec, steel: THREE.BufferGeometry[], lamp: THREE.BufferGeometry[]): void {
    const yawArm = Math.atan2(m.tx, m.tz); // local +Z of a box placed with this yaw runs along the mast arm
    const V = (d: number, y: number, side = 0, dirx = m.tx, dirz = m.tz): THREE.Vector3 => new THREE.Vector3(m.x + dirx * d, m.y + y, m.z + dirz * d).add(new THREE.Vector3(-dirz * side, 0, dirx * side));
    // stepped base + collar + pole shaft (tapered, 8 sides)
    steel.push(place(new THREE.CylinderGeometry(0.40, 0.46, 0.30, 8).translate(0, 0.15, 0), m.x, m.y, m.z));
    steel.push(place(new THREE.CylinderGeometry(0.30, 0.38, 0.9, 8).translate(0, 0.75, 0), m.x, m.y, m.z));
    steel.push(place(new THREE.CylinderGeometry(0.34, 0.34, 0.10, 8).translate(0, 1.25, 0), m.x, m.y, m.z)); // decorative ring
    steel.push(taperedTube([V(0, 1.2), V(0, MAST_ARM_Y0 - 0.5), V(0, MAST_POLE_H)], 0.27, 0.12));
    steel.push(place(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 8).translate(0, MAST_ARM_Y0 - 0.5, 0), m.x, m.y, m.z)); // collar under the arm
    // mast arm: a curved tapered tube. it leaves the pole going up a little (elbow), then follows the arch of mastArmY
    const arm: THREE.Vector3[] = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * m.len;
      const elbow = Math.max(0, 0.45 - d) * 0.9; // the first 0.45 m rise a little from the pole (smooth elbow)
      arm.push(V(d, mastArmY(d, m.len) + elbow));
    }
    steel.push(taperedTube(arm, 0.19, 0.075));
    // a truss rib under the thick end of the arm (looks like a real mast arm): short strut from the pole to 40 % of the arm
    steel.push(taperedTube([V(0, MAST_ARM_Y0 - 1.6), V(m.len * 0.22, mastArmY(m.len * 0.22, m.len) - 0.15), V(m.len * 0.42, mastArmY(m.len * 0.42, m.len) - 0.02)], 0.07, 0.05, 6));
    // luminaire: swan-neck arm from the pole top towards the centre of the box, housing at the end, glowing underside
    const lp: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      lp.push(V(0, 0, 0, m.lx, m.lz).add(new THREE.Vector3(m.lx * LAMP_REACH * t, 0, m.lz * LAMP_REACH * t)).setY(m.y + MAST_POLE_H - 0.5 + 1.2 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5) - 0.35 * t * t));
    }
    steel.push(taperedTube(lp, 0.11, 0.06, 6));
    const yawLamp = Math.atan2(m.lx, m.lz);
    const endY = lp[lp.length - 1].y;
    const hx = m.x + m.lx * (LAMP_REACH - 0.15), hz = m.z + m.lz * (LAMP_REACH - 0.15);
    steel.push(place(new THREE.BoxGeometry(0.5, 0.2, 1.3).translate(0, -0.14, 0), hx, endY, hz, yawLamp));
    lamp.push(place(new THREE.BoxGeometry(0.38, 0.04, 1.1).translate(0, -0.26, 0), hx, endY, hz, yawLamp));
    void yawArm;
  }

  /** Once per rendered frame: on = 0 (day) .. 1 (night) like StreetLights: the lamp glows warm at night. */
  update(on: number): void {
    this.lampMat.color.copy(LAMP_DAY).lerp(LAMP_NIGHT, on).multiplyScalar(1 + on * 0.8);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.steelMat.dispose();
    this.lampMat.dispose();
    this.backMat.dispose();
  }
}
