// DOORS + WUDU: the doors of the buildings near the player get a real door leaf (hinged, swings into the room) with a collider that is removed while the
// door is open; E opens / closes the nearest door. In a mosque the wudu (ablution) taps in the courtyard work with E: eight steps, then "wudu done".
// The models only have the empty doorway (models/ModelInfo.ts DoorSpec); the leaves are made here, only within SPAWN_DIST of the player, so the instanced city
// fill needs no per-building meshes. A door stays open / closed while its building is near; far away it is forgotten (closed).
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { DoorSpec, ModelInfo, WuduSpec } from './models/ModelInfo';
import { groundRange, infoFor, WORLD_PLACEMENTS } from './BuildingInfo';

export interface BuildingInteractDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** E went down this frame. */
  pressedE: () => boolean;
  /** Walking (not in a vehicle / aircraft / free camera). */
  onFoot: () => boolean;
  /** Prompt line at the bottom of the screen ('' = none). */
  prompt: (text: string) => void;
  toast: (text: string, ms?: number) => void;
}

/** true = the door of the mosque prayer hall stays shut until the wudu is done. */
export const MOSQUE_REQUIRE_WUDU = false;
const SPAWN_DIST = 55;
const DROP_DIST = 80;
const REACH = 2.3;
const WUDU_REACH = 2.4;
const SWING = 1.75; // rad (100 deg)
const OPEN_TIME = 0.55;
/** The wudu stays valid this long (s) after the last step. */
const WUDU_VALID = 1800;
const WUDU_STEPS: readonly [string, number][] = [
  ['নিয়ত করে বিসমিল্লাহ বলুন', 1.6],
  ['দুই হাত কবজি পর্যন্ত ধুচ্ছেন (৩ বার)', 2.4],
  ['কুলি করছেন (৩ বার)', 2.2],
  ['নাকে পানি দিচ্ছেন (৩ বার)', 2.2],
  ['পুরো মুখমণ্ডল ধুচ্ছেন (৩ বার)', 2.4],
  ['কনুইসহ দুই হাত ধুচ্ছেন (৩ বার)', 2.6],
  ['মাথা মাসেহ ও কান মাসেহ', 2.2],
  ['টাখনুসহ দুই পা ধুচ্ছেন (৩ বার)', 2.8],
];

interface Leaf { pivot: THREE.Group; sign: 1 | -1 }
interface DoorInst {
  spec: DoorSpec;
  wx: number; wz: number; // world centre of the opening
  leaves: Leaf[];
  open: boolean;
  t: number; // 0 closed .. 1 open
  collider: RAPIER.Collider | null;
}
interface Site {
  info: ModelInfo;
  x: number; z: number; floorY: number; yaw: number;
  doors: DoorInst[];
  body: RAPIER.RigidBody;
  group: THREE.Group;
  radius: number;
}

const GEO = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<number, THREE.MeshLambertMaterial>();
const matOf = (c: number): THREE.MeshLambertMaterial => {
  let m = mats.get(c);
  if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
  return m;
};
const HANDLE = new THREE.MeshLambertMaterial({ color: 0xc9b27a });
const WATER = new THREE.MeshBasicMaterial({ color: 0x7fc4ee, transparent: true, opacity: 0.7 });

export class BuildingInteract {
  private sites = new Map<number, Site>(); // by WORLD_PLACEMENTS index (statics: -1, -2 ...)
  private statics: { info: ModelInfo; x: number; z: number; floorY: number; yaw: number; radius: number }[] = [];
  private timer = 1;
  private p = new THREE.Vector3();
  private wuduLeft = 0; // seconds of valid wudu left
  private wuduAsked = false;
  private wudu: { step: number; t: number; tap: { x: number; z: number; y: number } } | null = null;
  private stream: THREE.Mesh;

  constructor(private d: BuildingInteractDeps) {
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1, 6), WATER);
    this.stream.visible = false;
    d.root.add(this.stream);
  }

  /** A building that is not in the placement lists (the police station prototype): doors / wudu are made for it as for the others. floorY = absolute height of its floor. */
  addStatic(info: ModelInfo, x: number, z: number, floorY: number, yaw: number, radius: number): void {
    this.statics.push({ info, x, z, floorY, yaw, radius });
  }

  get wuduDone(): boolean {
    return this.wuduLeft > 0;
  }

  // ---------- sites ----------

  private spawn(key: number, info: ModelInfo, x: number, z: number, floorY: number, yaw: number, radius: number): void {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(x - this.d.origin.origin.x, floorY, z - this.d.origin.origin.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
    const group = new THREE.Group();
    this.d.root.add(group);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const doors: DoorInst[] = info.doors.map((spec) => {
      const lz = spec.z - spec.t / 2;
      const inst: DoorInst = { spec, wx: x + spec.x * c + lz * s, wz: z - spec.x * s + lz * c, leaves: [], open: false, t: 0, collider: null };
      const double = spec.w >= 2;
      const lw = double ? spec.w / 2 : spec.w;
      const sides: (1 | -1)[] = double ? [1, -1] : [1];
      for (const sg of sides) {
        const pivot = new THREE.Group();
        const hx = spec.x - sg * (spec.w / 2);
        pivot.position.set(x + hx * c + lz * s, floorY + spec.y, z - hx * s + lz * c);
        const leaf = new THREE.Mesh(GEO, matOf(spec.leaf));
        leaf.scale.set(lw - 0.03, spec.h - 0.03, 0.06);
        leaf.position.set(sg * (lw / 2), spec.h / 2, 0);
        leaf.castShadow = true;
        pivot.add(leaf);
        const knob = new THREE.Mesh(GEO, HANDLE);
        knob.scale.set(0.05, 0.05, 0.14);
        knob.position.set(sg * (lw - 0.15), spec.h * 0.45, 0);
        pivot.add(knob);
        pivot.rotation.y = yaw;
        group.add(pivot);
        inst.leaves.push({ pivot, sign: sg });
      }
      this.setCollider(inst, body, true);
      return inst;
    });
    this.sites.set(key, { info, x, z, floorY, yaw, doors, body, group, radius });
  }

  private setCollider(d: DoorInst, body: RAPIER.RigidBody, on: boolean): void {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    if (on && !d.collider) {
      d.collider = world.createCollider(
        R.ColliderDesc.cuboid(d.spec.w / 2, d.spec.h / 2, 0.06).setTranslation(d.spec.x, d.spec.y + d.spec.h / 2, d.spec.z - d.spec.t / 2).setFriction(0.5),
        body,
      );
    } else if (!on && d.collider) {
      world.removeCollider(d.collider, true);
      d.collider = null;
    }
  }

  private despawn(key: number): void {
    const st = this.sites.get(key);
    if (!st) return;
    this.d.physics.world.removeRigidBody(st.body);
    this.d.root.remove(st.group);
    this.sites.delete(key);
  }

  private manage(): void {
    const px = this.p.x, pz = this.p.z;
    const { terrain } = this.d;
    for (let i = 0; i < WORLD_PLACEMENTS.length; i++) {
      const { p, fill } = WORLD_PLACEMENTS[i]!;
      const r = Math.hypot(p.W, p.D) / 2;
      const dist = Math.hypot(px - p.x, pz - p.z) - r;
      const has = this.sites.has(i);
      if (!has && dist < SPAWN_DIST) {
        const info = infoFor(p, fill);
        if (!info || (info.doors.length === 0)) continue;
        const { mx } = groundRange(p, (x, z) => terrain.heightAt(x, z));
        this.spawn(i, info, p.x, p.z, mx + 0.02, p.yaw, r);
      } else if (has && dist > DROP_DIST) this.despawn(i);
    }
    this.statics.forEach((s, k) => {
      const key = -1 - k;
      const dist = Math.hypot(px - s.x, pz - s.z) - s.radius;
      const has = this.sites.has(key);
      if (!has && dist < SPAWN_DIST) this.spawn(key, s.info, s.x, s.z, s.floorY, s.yaw, s.radius);
      else if (has && dist > DROP_DIST) this.despawn(key);
    });
  }

  // ---------- per frame ----------

  update(dt: number): void {
    this.d.playerWorld(this.p);
    this.timer += dt;
    if (this.timer > 0.25) { this.timer = 0; this.manage(); }
    this.wuduLeft = Math.max(0, this.wuduLeft - dt);
    // door animation
    for (const st of this.sites.values()) {
      for (const dr of st.doors) {
        const target = dr.open ? 1 : 0;
        if (dr.t !== target) {
          dr.t = dr.t < target ? Math.min(target, dr.t + dt / OPEN_TIME) : Math.max(target, dr.t - dt / OPEN_TIME);
          const e = dr.t * dr.t * (3 - 2 * dr.t);
          for (const lf of dr.leaves) lf.pivot.rotation.y = st.yaw + lf.sign * e * SWING;
        }
      }
    }
    const walking = this.d.onFoot();
    if (!walking) { this.d.prompt(''); this.cancelWudu(); return; }
    if (this.wudu) { this.updateWudu(dt); return; }

    // nearest door / wudu tap
    let bestDoor: { st: Site; dr: DoorInst } | null = null, bestD = REACH;
    for (const st of this.sites.values()) {
      for (const dr of st.doors) {
        if (Math.abs(this.p.y - (st.floorY + dr.spec.y) - 1) > 3) continue;
        const dd = Math.hypot(this.p.x - dr.wx, this.p.z - dr.wz);
        if (dd < bestD) { bestD = dd; bestDoor = { st, dr }; }
      }
    }
    let tap: { x: number; z: number; y: number; d: number } | null = null;
    for (const st of this.sites.values()) for (const w of st.info.wudu) {
      const t = this.nearestTap(st, w);
      if (t && t.d < WUDU_REACH && (!tap || t.d < tap.d)) tap = t;
    }
    const press = this.d.pressedE();
    if (tap && (!bestDoor || tap.d < bestD)) {
      this.d.prompt(this.wuduLeft > 0 ? 'E — আবার ওজু করুন (ওজু আছে ✓)' : 'E — ওজু করুন');
      if (press) this.startWudu(tap);
      return;
    }
    if (bestDoor) {
      const { st, dr } = bestDoor;
      const hall = dr.spec.hall;
      const locked = hall && MOSQUE_REQUIRE_WUDU && this.wuduLeft <= 0 && !dr.open;
      this.d.prompt(locked ? 'দরজা বন্ধ — আগে ওজুখানায় ওজু করুন' : dr.open ? 'E — দরজা বন্ধ করুন' : hall && this.wuduLeft <= 0 ? 'E — মসজিদের দরজা খুলুন (ওজু করে ঢোকাই ভালো)' : 'E — দরজা খুলুন');
      if (press) {
        if (locked) { this.d.toast('🕌 মসজিদে ঢোকার আগে ওজুখানায় (উঠানের কল) E চেপে ওজু করুন', 3500); return; }
        dr.open = !dr.open;
        this.setCollider(dr, st.body, !dr.open);
        if (dr.open && hall && this.wuduLeft <= 0 && !this.wuduAsked) { this.wuduAsked = true; this.d.toast('🕌 মসজিদে ঢোকার আগে উঠানের ওজুখানায় ওজু করে নিন (কলের কাছে E)', 4200); }
      }
      return;
    }
    this.d.prompt('');
  }

  // ---------- wudu ----------

  private nearestTap(st: Site, w: WuduSpec): { x: number; z: number; y: number; d: number } | null {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    let best: { x: number; z: number; y: number; d: number } | null = null;
    for (const t of w.taps) {
      const wx = st.x + t.x * c + t.z * s, wz = st.z - t.x * s + t.z * c;
      const d = Math.hypot(this.p.x - wx, this.p.z - wz);
      if (!best || d < best.d) best = { x: wx, z: wz, y: st.floorY + w.y, d };
    }
    return best && Math.abs(this.p.y - st.floorY) < 3 ? best : null;
  }

  private startWudu(tap: { x: number; z: number; y: number }): void {
    this.wudu = { step: 0, t: 0, tap };
    this.stream.visible = true;
  }

  private cancelWudu(): void {
    if (!this.wudu) return;
    this.wudu = null;
    this.stream.visible = false;
  }

  private updateWudu(dt: number): void {
    const w = this.wudu!;
    if (Math.hypot(this.p.x - w.tap.x, this.p.z - w.tap.z) > WUDU_REACH + 1.2) {
      this.cancelWudu();
      this.d.prompt('');
      this.d.toast('ওজু মাঝপথে থেমে গেল — কলের কাছে ফিরে আবার E চাপুন', 3000);
      return;
    }
    w.t += dt;
    const [text, dur] = WUDU_STEPS[w.step]!;
    if (w.t >= dur) { w.t = 0; w.step++; }
    if (w.step >= WUDU_STEPS.length) {
      this.cancelWudu();
      this.wuduLeft = WUDU_VALID;
      this.d.prompt('');
      this.d.toast('✅ ওজু সম্পূর্ণ হয়েছে — এবার মসজিদে যেতে পারেন', 4200);
      return;
    }
    this.d.prompt(`🚿 ওজু (${w.step + 1}/${WUDU_STEPS.length}): ${text}`);
    // thin stream of water from the tap spout to the basin
    const len = Math.max(0.1, w.tap.y - 0.55);
    this.stream.scale.set(1, len, 1);
    this.stream.position.set(w.tap.x, w.tap.y - len / 2, w.tap.z);
    this.stream.visible = Math.floor(w.t * 6) % 6 !== 5;
    if (this.d.pressedE()) { this.cancelWudu(); this.d.prompt(''); this.d.toast('ওজু বাতিল', 1800); }
  }

  dispose(): void {
    for (const k of [...this.sites.keys()]) this.despawn(k);
    this.d.root.remove(this.stream);
    this.stream.geometry.dispose();
  }
}
