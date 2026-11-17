import { CAB, LIFTS, T, levelY } from './EVLabTowerLayout';

// EVLab Tower v1.3: the lift cars (pure logic, no three.js, so the headless test can run them).
// Each car stands still with its doors open, closes them when someone called it, rides to the level with smooth acceleration (CAB.speed, about 6 m/s),
// opens the doors there. It never closes on somebody standing in the doorway.

export type LiftState = 'open' | 'closing' | 'moving' | 'opening';

export interface LiftHost {
  /** The door blocker of lift `lift` at `level` (true = the doorway is closed to the player). */
  landingBlock(lift: number, level: number, blocked: boolean): void;
  /** Move the kinematic cabin colliders: y = floor height of the cabin. */
  cabinPose(lift: number, y: number): void;
  /** The cabin's own front doors: true = closed to the player. */
  cabinDoorBlock(lift: number, blocked: boolean): void;
}

export const DOOR_TIME = 1.4;
const DWELL = 3;

export class LiftCar {
  y = 0;
  v = 0;
  /** Level the car is at (or left from), and the level it is going to. */
  level = 0;
  target = -1;
  door = 1;
  state: LiftState = 'open';
  queue: number[] = [];
  private dwell = 0;
  private lastBlock = -1;

  constructor(readonly id: number, private host: LiftHost, level = 0) {
    this.level = level;
    this.y = levelY(level);
    this.sync(true);
  }

  /** Somebody asked for this level (call button or floor panel). */
  request(level: number): void {
    const l = Math.max(0, Math.min(T.roof, Math.round(level)));
    if (this.state === 'open' && l === this.level && this.queue.length === 0) { this.dwell = 0; return; }
    if (this.target === l || this.queue.includes(l)) return;
    if (this.state === 'closing' && l === this.level) { this.state = 'opening'; return; }
    this.queue.push(l);
  }

  get idle(): boolean { return this.state === 'open' && this.queue.length === 0; }
  /** Distance in levels (for choosing the nearest car). */
  distanceTo(level: number): number {
    const here = this.state === 'moving' ? this.target : this.level;
    return Math.abs(here - level) + this.queue.length * 3 + (this.state === 'moving' ? 2 : 0);
  }

  /** `occupied`: somebody stands in the doorway (the doors must not close). */
  update(dt: number, occupied: boolean): void {
    switch (this.state) {
      case 'open':
        this.dwell += dt;
        if (this.queue.length && !occupied && this.dwell > DWELL * 0.3) this.state = 'closing';
        break;
      case 'closing':
        if (occupied) { this.state = 'opening'; break; }
        this.door = Math.max(0, this.door - dt / DOOR_TIME);
        if (this.door <= 0) {
          this.target = this.queue.shift() ?? this.level;
          if (this.target === this.level) this.state = 'opening';
          else this.state = 'moving';
        }
        break;
      case 'moving': {
        const ty = levelY(this.target);
        const dir = Math.sign(ty - this.y);
        const rem = Math.abs(ty - this.y);
        // braking profile with a margin (0.7 x accel) and a soft linear tail, so the car never has to brake harder than it can
        const vt = Math.min(CAB.speed, Math.sqrt(2 * CAB.accel * 0.7 * rem), rem * 2);
        const want = dir * vt;
        const dv = CAB.accel * dt;
        this.v += Math.max(-dv, Math.min(dv, want - this.v));
        let ny = this.y + this.v * dt;
        if ((ty - this.y) * (ty - ny) <= 0 || rem < 0.004) { ny = ty; this.v = 0; }
        this.y = ny;
        if (this.y === ty) { this.level = this.target; this.target = -1; this.state = 'opening'; }
        break;
      }
      case 'opening':
        this.door = Math.min(1, this.door + dt / DOOR_TIME);
        if (this.door >= 1) { this.state = 'open'; this.dwell = 0; }
        break;
    }
    this.sync(false);
  }

  /** Doors are open enough to walk through. */
  get walkable(): boolean {
    return this.state !== 'moving' && this.door > 0.85 && this.v === 0;
  }

  private sync(force: boolean): void {
    this.host.cabinPose(this.id, this.y);
    const open = this.walkable;
    const key = open ? this.level : -2;
    if (force || key !== this.lastBlock) {
      if (this.lastBlock >= 0) this.host.landingBlock(this.id, this.lastBlock, true);
      if (force) for (let n = 0; n <= T.roof; n++) this.host.landingBlock(this.id, n, true);
      if (open) this.host.landingBlock(this.id, this.level, false);
      this.host.cabinDoorBlock(this.id, !open);
      this.lastBlock = key;
    }
  }
}

/** The two cars. */
export class LiftSystem {
  readonly cars: LiftCar[];
  constructor(host: LiftHost) {
    this.cars = LIFTS.map((l) => new LiftCar(l.id, host, 0));
  }
  /** A call button at `level`: the nearest idle (or soonest free) car comes. */
  call(level: number): LiftCar {
    const stopped = this.cars.find((c) => c.state !== 'moving' && c.level === level && c.queue.length === 0);
    const car = stopped ?? this.cars.reduce((a, b) => (a.distanceTo(level) <= b.distanceTo(level) ? a : b));
    car.request(level);
    return car;
  }
  update(dt: number, occupied: (car: LiftCar) => boolean): void {
    for (const c of this.cars) c.update(dt, occupied(c));
  }
}
