// CITY MALL, STEP C2: the lifts at run time (pattern of EVLabTowerView + EVLabManager): the two cars, G = call a lift at a lobby / choose a floor inside,
// click on the call button / the cabin button panel, the floor panel (EVLab's LiftUI is REUSED, it only got a floor-list parameter),
// the rider (while the cabin moves or its doors are not open the player is carried), a safety net for somebody trapped in a shaft.
// No per-frame allocation (temp vectors), no lights, no shadows.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import { LiftUI, type LiftUIItem } from '../evlab/EVLabLiftUI';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { LIFT, LIFTS, LIFT_FRONT_Z, NF, floorNameBn, inCabin, inDoorway, inShaft, levelNear, levelY, lobbyLevel, type PickAction } from './MallCores';
import type { LiftView } from './MallCoreBuilder';
import { LiftSystem } from './MallLift';
import { createLiftBodies, liftHost, type LiftBodies, type LiftFrame } from './MallLiftPhysics';

const HALF = Config.player.height / 2; // the capsule centre is HALF above the feet
const LIFT_NAME = ['পশ্চিম লিফট', 'পূর্ব লিফট'];

export interface LiftControlDeps {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  /** The mall's fixed body (the landing door blockers hang on it). */
  body: RAPIER.RigidBody;
  frame: LiftFrame;
  origin: FloatingOrigin;
  lockTarget: HTMLElement;
  /** Put the player at a world position (capsule centre). */
  teleport: (world: THREE.Vector3) => void;
  views: LiftView[];
}

export class MallLiftControl {
  readonly system: LiftSystem;
  private bodies: LiftBodies;
  private ui: LiftUI | null = null;
  private q = new THREE.Vector3();
  private cs: number;
  private sn: number;
  private ride = -1;
  private stuck = 0;
  private hold = '';
  private holdT = 0;
  private wasOpen = false;
  private cool = 0;
  private lx = 0;
  private lz = 0;
  private feet = 0;

  constructor(private d: LiftControlDeps) {
    this.cs = Math.cos(d.frame.yaw);
    this.sn = Math.sin(d.frame.yaw);
    const o = () => d.origin.origin;
    this.bodies = createLiftBodies(d.RAPIER, d.world, d.body, d.frame, o());
    this.system = new LiftSystem(liftHost(this.bodies, d.frame, o));
    if (typeof document !== 'undefined' && document.body) {
      const items: LiftUIItem[] = [];
      for (let f = 0; f < NF; f++) items.push({ level: f, text: `${String(f).padStart(2, ' ')}   ${floorNameBn(f)}` });
      this.ui = new LiftUI(d.lockTarget, items, 'উপর / নিচ তীর + Enter, বা ক্লিক।  Esc বা G = বন্ধ');
    }
  }

  get uiOpen(): boolean { return !!this.ui?.open; }

  /** A click on a lift button (call button at a floor, or the button panel inside a cabin). */
  act(a: PickAction): void {
    if (a.kind === 'call') {
      this.system.call(a.lift, a.level);
      this.say(`${LIFT_NAME[a.lift]} আসছে…`);
    } else if (this.ride === a.lift) this.openPanel(a.lift);
    else this.say('আগে লিফটে উঠুন');
  }

  /**
   * Once per rendered frame. `p` = the player's capsule centre in WORLD metres, `near` = close enough to bother, `onFoot` = walking,
   * `gPressed` = the G key went down this frame.
   */
  update(dt: number, near: boolean, onFoot: boolean, p: THREE.Vector3, gPressed: boolean): void {
    if (!near) { this.ui?.prompt(''); return; }
    const f = this.d.frame;
    const dx = p.x - f.x, dz = p.z - f.z;
    this.lx = dx * this.cs - dz * this.sn; // world -> the block's local x / z
    this.lz = dx * this.sn + dz * this.cs;
    this.feet = p.y - f.floorY - HALF;
    const { lx, lz, feet } = this;
    const cars = this.system.cars;

    this.system.update(dt, (car) => onFoot && car.state !== 'moving' && inDoorway(LIFTS[car.id], lx, lz, feet, levelY(car.level)));
    for (const v of this.d.views) v.update(cars[v.id]);

    const open = this.uiOpen;
    if (this.wasOpen && !open) this.cool = 0.3; // the G that closed the panel must not open it again
    this.wasOpen = open;
    this.cool -= dt;
    this.holdT -= dt;

    if (!onFoot) { this.ui?.close(); this.ui?.prompt(''); this.ride = -1; this.stuck = 0; return; }

    // riding: while the cabin moves (or its doors are not open) the player is carried with it
    let ride = -1;
    for (const c of cars) if (inCabin(LIFTS[c.id], lx, lz, feet, c.y)) ride = c.id;
    this.ride = ride;
    if (ride >= 0) {
      const c = cars[ride], L = LIFTS[ride];
      if (!c.walkable) {
        const mx = LIFT.cabX / 2 - 0.4, mz = LIFT.cabZ / 2 - 0.4;
        this.put(Math.max(L.xc - mx, Math.min(L.xc + mx, lx)), Math.max(LIFT.zc - mz, Math.min(LIFT.zc + mz, lz)), c.y + HALF + 0.03);
      }
    } else if (open) this.ui?.close();

    // trapped in a shaft outside a cabin? back to the lobby
    let trapped = false;
    if (ride < 0 && feet > -0.5 && feet < NF * 5) for (const L of LIFTS) if (inShaft(L, lx, lz)) trapped = true;
    this.stuck = trapped ? this.stuck + dt : 0;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      const L = LIFTS.find((l) => inShaft(l, lx, lz));
      if (L) this.put(L.xc, LIFT_FRONT_Z + 1.4, levelY(levelNear(feet)) + HALF + 0.1);
    }

    // G: inside a cabin = floor panel; at a lobby = call that lift
    if (gPressed && !open && this.cool <= 0) {
      if (ride >= 0) this.openPanel(ride);
      else for (const L of LIFTS) {
        const lv = lobbyLevel(L, lx, lz, feet);
        if (lv >= 0) { this.system.call(L.id, lv); this.say(`${LIFT_NAME[L.id]} আসছে…`); break; }
      }
    }

    // prompt
    let text = '';
    if (this.holdT > 0) text = this.hold;
    else if (ride >= 0 && !open) text = `G চাপুন — ফ্লোর বাছুন  (${floorNameBn(levelNear(cars[ride].y))})`;
    else if (ride < 0) for (const L of LIFTS) if (lobbyLevel(L, lx, lz, feet) >= 0) { text = 'G চাপুন — লিফট ডাকুন'; break; }
    this.ui?.prompt(this.uiOpen ? '' : text);
  }

  dispose(): void {
    this.ui?.dispose();
    for (const b of this.bodies.cabBodies) b && this.d.world.removeRigidBody(b);
  }

  private openPanel(lift: number): void {
    if (!this.ui || this.ui.open) return;
    const cars = this.system.cars;
    this.ui.show(levelNear(cars[lift].y), `${LIFT_NAME[lift]}  —  ফ্লোর বাছুন`, (lv) => cars[lift].request(lv));
  }

  private say(t: string): void { this.hold = t; this.holdT = 2; }

  /** Put the player at the block-local (x, z) with the capsule centre at local height y. */
  private put(lx: number, lz: number, y: number): void {
    const f = this.d.frame;
    this.q.set(f.x + lx * this.cs + lz * this.sn, f.floorY + y, f.z - lx * this.sn + lz * this.cs);
    this.d.teleport(this.q);
  }
}
