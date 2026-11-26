// CITY MALL, STEP C2: the two lift cars (pure logic, no three.js / no Rapier, so the headless test runs them too).
// A car stands still with its doors open; when somebody asked for a floor it closes the doors, rides there with smooth acceleration (LIFT.speed = 8 m/s,
// LIFT.accel m/s2, braking early enough), opens the doors. It never closes on somebody standing in the doorway.
// Pattern of src/evlab/EVLabLifts.ts, but with the mall's numbers (10 stops, floor f = f * 5 m, one car per side).
import { LIFT, LIFTS, NF, levelY } from './MallCores';

export type LiftState = 'open' | 'closing' | 'moving' | 'opening';

export interface LiftHost {
  /** The door blocker of lift `lift` at `level` (true = the doorway is shut to the player). */
  landingBlock(lift: number, level: number, blocked: boolean): void;
  /** Move the kinematic cabin: y = height of the cabin floor (block-local metres). */
  cabinPose(lift: number, y: number): void;
  /** The cabin's own sliding door: true = shut to the player. */
  cabinDoorBlock(lift: number, blocked: boolean): void;
}

export class LiftCar {
  y = 0;
  v = 0;
  /** Floor the car is at (or left from) and the floor it rides to (-1 = none). */
  level = 0;
  target = -1;
  /** 0 = doors shut, 1 = doors wide open. */
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

  /** Somebody asked for this floor (call button or the floor panel). */
  request(level: number): void {
    const l = Math.max(0, Math.min(NF - 1, Math.round(level)));
    if (this.state === 'open' && l === this.level && this.queue.length === 0) { this.dwell = 0; return; }
    if (this.target === l || this.queue.includes(l)) return;
    if (this.state === 'closing' && l === this.level) { this.state = 'opening'; return; }
    this.queue.push(l);
  }

  get idle(): boolean { return this.state === 'open' && this.queue.length === 0; }

  /** Doors are open enough to walk through (the car stands still). */
  get walkable(): boolean { return this.state !== 'moving' && this.door > 0.85 && this.v === 0; }

  /** `occupied`: somebody stands in the doorway (the doors must not close). */
  update(dt: number, occupied: boolean): void {
    switch (this.state) {
      case 'open':
        this.dwell += dt;
        if (this.queue.length && !occupied && this.dwell > LIFT.dwell * 0.3) this.state = 'closing';
        break;
      case 'closing':
        if (occupied) { this.state = 'opening'; break; }
        this.door = Math.max(0, this.door - dt / LIFT.doorTime);
        if (this.door <= 0) {
          this.target = this.queue.shift() ?? this.level;
          this.state = this.target === this.level ? 'opening' : 'moving';
          if (this.target === this.level) this.target = -1;
        }
        break;
      case 'moving': {
        const ty = levelY(this.target);
        const dir = Math.sign(ty - this.y);
        const rem = Math.abs(ty - this.y);
        // braking profile with a margin (0.7 x accel) and a soft linear tail, so the car never has to brake harder than it can
        const vt = Math.min(LIFT.speed, Math.sqrt(2 * LIFT.accel * 0.7 * rem), rem * 2);
        const want = dir * vt;
        const dv = LIFT.accel * dt;
        this.v += Math.max(-dv, Math.min(dv, want - this.v));
        let ny = this.y + this.v * dt;
        if ((ty - this.y) * (ty - ny) <= 0 || rem < 0.004) { ny = ty; this.v = 0; }
        this.y = ny;
        if (this.y === ty) { this.level = this.target; this.target = -1; this.state = 'opening'; }
        break;
      }
      case 'opening':
        this.door = Math.min(1, this.door + dt / LIFT.doorTime);
        if (this.door >= 1) { this.state = 'open'; this.dwell = 0; }
        break;
    }
    this.sync(false);
  }

  private sync(force: boolean): void {
    this.host.cabinPose(this.id, this.y);
    const open = this.walkable;
    const key = open ? this.level : -2;
    if (force || key !== this.lastBlock) {
      if (this.lastBlock >= 0) this.host.landingBlock(this.id, this.lastBlock, true);
      if (force) for (let n = 0; n < NF; n++) this.host.landingBlock(this.id, n, true);
      if (open) this.host.landingBlock(this.id, this.level, false);
      this.host.cabinDoorBlock(this.id, !open);
      this.lastBlock = key;
    }
  }
}

/** The two cars (west = 0, east = 1). Each landing belongs to ONE lift (unlike a lift bank), so a call goes to the car of that side. */
export class LiftSystem {
  readonly cars: LiftCar[];
  constructor(host: LiftHost) {
    this.cars = LIFTS.map((l) => new LiftCar(l.id, host, 0));
  }
  call(lift: number, level: number): LiftCar {
    const car = this.cars[lift];
    car.request(level);
    return car;
  }
  update(dt: number, occupied: (car: LiftCar) => boolean): void {
    for (const c of this.cars) c.update(dt, occupied(c));
  }
}
