import * as THREE from 'three';
import { buildCore, levelNear, type CoreBuild } from './EVLabCore';
import { makeLevelBuilder, type LevelView } from './EVLabFloors';
import { LiftSystem, type LiftCar, type LiftHost } from './EVLabLifts';
import type { LiftUI } from './EVLabLiftUI';
import { Parts } from './EVLabParts';
import type { TowerTextures } from './EVLabTowerTextures';
import { CAB, FLOORS, LIFTS, T, levelAtY, levelY } from './EVLabTowerLayout';

const BELOW = 2, ABOVE = 3;
const EYE = 0.9; // capsule centre above the feet

export interface TowerViewIO {
  /** Move the player (building-local capsule centre). */
  teleportLocal(x: number, y: number, z: number): void;
}

/**
 * The inside of the tall tower while the player is near: the core with the two glass lifts (always), and the levels around the player's level
 * (built once, kept, put into the scene only for a few levels at a time). Also the lift logic: calls, the floor panel, riding.
 */
export class TowerView {
  readonly group = new THREE.Group();
  readonly core: CoreBuild;
  readonly lifts: LiftSystem;
  private buildLevel: (n: number) => LevelView;
  private views = new Map<number, { floor: LevelView; core: THREE.Group }>();
  private shown = new Set<number>();
  private lastOpen = [0, 0];
  private hold = '';
  private holdT = 0;
  private stuck = 0;
  /** Level the player is on (0 = ground floor / podium). */
  level = 0;
  /** Which car the player stands in (-1 = none). */
  riding = -1;

  constructor(P: Parts, TT: TowerTextures, host: LiftHost, private io: TowerViewIO, private ui: LiftUI | null) {
    this.group.name = 'EVLabTowerView';
    this.core = buildCore(P, TT);
    this.buildLevel = makeLevelBuilder(P, TT);
    this.group.add(this.core.group);
    this.lifts = new LiftSystem(host);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('keydown', this.onKey);
  }

  private pl: THREE.Vector3 | null = null;

  private inCabin(car: LiftCar, p: THREE.Vector3): boolean {
    const l = LIFTS[car.id];
    return Math.abs(p.x - l.cx) < CAB.hx + 0.1 && p.z > CAB.z0 && p.z < CAB.z1 + 0.3 && Math.abs(p.y - EYE - car.y) < 1.5;
  }
  private inDoorway(car: LiftCar, p: THREE.Vector3): boolean {
    const l = LIFTS[car.id];
    return car.state !== 'moving' && Math.abs(p.x - l.cx) < 1.3 && p.z > CAB.z1 - 0.35 && p.z < CAB.z1 + 2.2 && Math.abs(p.y - EYE - levelY(car.level)) < 1.5;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyG' || e.repeat || !this.pl || this.ui?.open) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    this.interact();
  };

  /** The G key: inside a cabin = floor panel; at a landing = call a lift. */
  interact(): void {
    const p = this.pl;
    if (!p) return;
    const car = this.lifts.cars.find((c) => this.inCabin(c, p));
    if (car) {
      this.ui?.show(levelNear(car.y), `${LIFTS[car.id].name}  -  choose a floor`, (lv) => this.lifts.cars[car.id].request(lv));
      return;
    }
    const lv = this.landingLevel(p);
    if (lv >= 0) {
      const c = this.lifts.call(lv);
      this.setHold(`${LIFTS[c.id].name} is coming`);
    }
  }

  /** Level of the lift landing the player stands at (-1 = not at a landing). */
  landingLevel(p: THREE.Vector3): number {
    if (p.z < CAB.z1 + 0.2 || p.z > CAB.z1 + 6.5 || Math.abs(p.x) > 9) return -1;
    const feet = p.y - EYE;
    const lv = levelNear(feet);
    return Math.abs(feet - levelY(lv)) < 1.2 ? lv : -1;
  }

  private setHold(t: string): void { this.hold = t; this.holdT = 2.2; }

  /** `p` = the player's capsule centre in building-local coordinates (null = not near). */
  update(dt: number, p: THREE.Vector3 | null): void {
    this.pl = p;
    this.lifts.update(dt, (car) => (p ? this.inDoorway(car, p) : false));
    this.cabinsSync();
    if (!p) return;
    this.holdT -= dt;

    // levels around the player
    const feet = p.y - EYE;
    const lv = feet < T.y1 - 1 ? 0 : levelAtY(feet + 0.3);
    this.level = lv;
    this.showLevels(lv);

    // riding: while the cabin moves (or its doors are not open) the player is carried
    let ride = -1;
    for (const c of this.lifts.cars) if (this.inCabin(c, p)) ride = c.id;
    this.riding = ride;
    if (ride >= 0) {
      const c = this.lifts.cars[ride], l = LIFTS[ride];
      if (!c.walkable) {
        const x = Math.max(l.cx - CAB.hx + 0.4, Math.min(l.cx + CAB.hx - 0.4, p.x));
        const z = Math.max(CAB.z0 + 0.4, Math.min(CAB.z1 - 0.4, p.z));
        this.io.teleportLocal(x, c.y + EYE + 0.03, z);
      }
    } else if (this.ui?.open) this.ui.close();

    // trapped in a shaft outside a cabin? bring the player back to the lobby
    let inShaft = false;
    for (const l of LIFTS) if (p.x > l.sx0 + 0.3 && p.x < l.sx1 - 0.3 && p.z > l.sz0 + 0.3 && p.z < l.sz1 - 0.3 && ride < 0) inShaft = true;
    this.stuck = inShaft ? this.stuck + dt : 0;
    if (this.stuck > 1.2) { this.stuck = 0; this.io.teleportLocal(0, EYE + 0.1, 45); }

    // prompt
    let text = '';
    if (this.holdT > 0) text = this.hold;
    else if (ride >= 0 && !this.ui?.open) text = `G - choose a floor   (${FLOORS[levelNear(this.lifts.cars[ride].y)].name})`;
    else if (ride < 0 && this.landingLevel(p) >= 0) text = 'G - call a lift';
    this.ui?.prompt(this.ui.open ? '' : text);
  }

  private cabinsSync(): void {
    for (const c of this.lifts.cars) {
      this.core.cabins[c.id].update(c);
      if (c.state === 'moving') {
        if (this.lastOpen[c.id] >= 0) { this.core.setLanding(c.id, this.lastOpen[c.id], 0); this.lastOpen[c.id] = -1; }
      } else {
        this.lastOpen[c.id] = c.level;
        this.core.setLanding(c.id, c.level, c.door);
      }
    }
  }

  private showLevels(lv: number): void {
    const want = new Set<number>();
    if (lv >= 1) for (let n = Math.max(1, lv - BELOW); n <= Math.min(T.roof, lv + ABOVE); n++) want.add(n);
    for (const n of this.shown) {
      if (want.has(n)) continue;
      const v = this.views.get(n);
      if (v) { this.group.remove(v.floor.group, v.core); }
      this.shown.delete(n);
    }
    for (const n of want) {
      if (this.shown.has(n)) continue;
      let v = this.views.get(n);
      if (!v) { v = { floor: this.buildLevel(n), core: this.core.levelPieces(n) }; this.views.set(n, v); }
      this.group.add(v.floor.group, v.core);
      this.shown.add(n);
    }
  }

  dispose(): void {
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('keydown', this.onKey);
    this.ui?.close();
    for (const v of this.views.values()) v.floor.dispose();
  }
}
