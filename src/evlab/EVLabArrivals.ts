// EVLab Step 8: people who come to the presentation by car (see EVLabArrivalPath for the routes).
// Mission starts: a few cars drive in from the F6 highway, park nose-in in the car park, the drivers get out, walk over the east bridge and the plaza and
// go into the portal. Mission ends: the drivers come out again, walk back, get in, the cars reverse out and drive away (cars still driving in park first,
// drivers still walking turn round on the spot). Cars and drivers are the game's own models (VehicleModel, PersonModel); they are only drawn (no physics).
// Everything here is building-local (the EVLabManager group carries it to the right place in the world).
import * as THREE from 'three';
import { mulberry32 } from '../structures';
import { Q } from '../core/Quality';
import { PersonModel, randomAppearance } from '../people/PersonModel';
import { VehicleModel } from '../vehicles/VehicleModel';
import { SPECS, groundY, suspSag, type VehicleSpec } from '../vehicles/VehicleSpec';
import { planArrivals, sampleRoute, speedIn, speedOut, type Arrival } from './EVLabArrivalPath';

/** What the arrivals need from a car / a person (the real models, or stand-ins in the headless test). */
export interface CarView { root: THREE.Object3D; wheels: { pivot: THREE.Object3D; steer: THREE.Object3D; spin: THREE.Object3D }[]; dispose(): void }
export interface WalkerView { root: THREE.Object3D; setHeading(h: number, dt: number): void; update(dt: number, speed: number, mode: 'idle' | 'walk' | 'run'): void; dispose(): void }
export interface ArrivalFactory {
  car(id: string): { view: CarView; spec: VehicleSpec };
  walker(r: () => number): WalkerView;
}

export const realFactory: ArrivalFactory = {
  car: (id) => { const spec = SPECS[id as keyof typeof SPECS]; return { view: new VehicleModel(spec), spec }; },
  walker: (r) => new PersonModel(randomAppearance(r)),
};

export type Phase = 'wait' | 'driveIn' | 'park' | 'walkIn' | 'inside' | 'walkOut' | 'board' | 'back' | 'turn' | 'driveOut' | 'gone';

interface Actor {
  plan: Arrival;
  phase: Phase;
  /** Seconds in the phase / distance along the route of the phase. */
  t: number;
  s: number;
  /** The driver went into the building (false: he never left the car). */
  walked: boolean;
  car: { view: CarView; spec: VehicleSpec } | null;
  man: WalkerView | null;
  heading: number;
  /** Wheel angle of the front wheels. */
  steer: number;
}

const FLOOR = 0.05; // the campus floor (same as the roads)
const WHEELBASE = 2.6;
const PARK_TIME = 1.2, BOARD_TIME = 1.0, TURN_TIME = 1.1;
const BACK_SPEED = 1.8;

export class EVLabArrivals {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];
  private leaving = false;
  private runs = 0;

  constructor(private factory: ArrivalFactory = realFactory) {
    this.group.name = 'EVLabArrivals';
    this.group.visible = false;
  }

  /** True while any car or driver of the current mission is still about. */
  get active(): boolean { return this.actors.length > 0; }

  /** Phases of all actors (for the test / debugging). */
  get phases(): Phase[] { return this.actors.map((a) => a.phase); }
  get count(): number { return this.actors.length; }

  /** The presentation mission starts: remove whatever is left of the last one and send the cars. */
  start(): void {
    this.clear();
    this.leaving = false;
    const r = mulberry32(4242 + this.runs++ * 977);
    this.actors = planArrivals(r, Q.evlabArrivals).map((plan) => ({ plan, phase: 'wait' as Phase, t: 0, s: 0, walked: false, car: null, man: null, heading: 0, steer: 0 }));
    this.group.visible = true;
  }

  /** The mission is over: everybody goes home. */
  dismiss(): void {
    if (this.leaving || !this.actors.length) return;
    this.leaving = true;
    for (const a of this.actors) {
      switch (a.phase) {
        case 'wait': this.finish(a); break; // never came
        case 'walkIn': a.phase = 'walkOut'; break; // turns round where he is
        case 'inside': a.t = 0; break; // leaveDelay counts from now
        default: break; // driveIn / park: park first (see park), the rest is on its way out already
      }
    }
  }

  private clear(): void {
    for (const a of this.actors) this.finish(a);
    this.actors = [];
    this.group.visible = false;
  }

  private finish(a: Actor): void {
    if (a.car) { this.group.remove(a.car.view.root); a.car.view.dispose(); a.car = null; }
    if (a.man) { this.group.remove(a.man.root); a.man.dispose(); a.man = null; }
    a.phase = 'gone';
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    if (!this.actors.length) return;
    for (const a of this.actors) this.step(a, Math.min(dt, 0.1));
    if (this.actors.every((a) => a.phase === 'gone')) this.clear();
  }

  private spawnCar(a: Actor): void {
    a.car = this.factory.car(a.plan.car);
    this.group.add(a.car.view.root);
  }

  private placeCar(a: Actor, x: number, z: number, heading: number, speed: number, dt: number): void {
    const c = a.car;
    if (!c) return;
    const { spec, view } = c;
    // steering follows the change of heading (bicycle model), the wheels roll with the speed
    const dh = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading));
    const want = Math.abs(speed) > 0.3 ? Math.max(-0.55, Math.min(0.55, Math.atan((dh / Math.max(dt, 1e-3)) * WHEELBASE / Math.abs(speed)))) : 0;
    a.steer += (want - a.steer) * Math.min(1, 8 * dt);
    a.heading = heading;
    view.root.position.set(x, FLOOR - groundY(spec), z);
    view.root.rotation.y = heading;
    const rest = spec.connY - (spec.susp.rest - suspSag(spec));
    view.wheels.forEach((w, i) => {
      w.pivot.position.y = rest;
      if (i < 2 && view.wheels.length >= 4) w.steer.rotation.y = a.steer;
      w.spin.rotation.x += (speed * dt) / spec.wheelRadius;
    });
  }

  private placeMan(a: Actor, route: Arrival['walk'], s: number, dir: 1 | -1, speed: number, dt: number): void {
    const m = a.man;
    if (!m) return;
    const p = sampleRoute(route, s);
    m.root.position.set(p.x, FLOOR, p.z);
    m.setHeading(dir > 0 ? p.heading : p.heading + Math.PI, dt);
    m.update(dt, speed, 'walk');
  }

  private step(a: Actor, dt: number): void {
    const P = a.plan;
    switch (a.phase) {
      case 'wait': {
        a.t += dt;
        if (a.t >= P.delay) {
          this.spawnCar(a);
          a.phase = 'driveIn';
          a.s = 0;
          const p = sampleRoute(P.inRoute, 0);
          a.heading = p.heading;
          this.placeCar(a, p.x, p.z, p.heading, 0, dt);
        }
        break;
      }
      case 'driveIn': {
        const v = speedIn(a.s, P.inRoute.len);
        a.s = Math.min(P.inRoute.len, a.s + v * dt);
        const p = sampleRoute(P.inRoute, a.s);
        this.placeCar(a, p.x, p.z, p.heading, v, dt);
        if (a.s >= P.inRoute.len - 1e-3) { a.phase = 'park'; a.t = 0; }
        break;
      }
      case 'park': {
        // parked nose-in; the heading is the slot's (the arc ends along it)
        this.placeCar(a, P.slot.x, P.slot.z, P.parkYaw, 0, dt);
        a.t += dt;
        if (a.t < PARK_TIME) break;
        if (this.leaving) { a.phase = 'back'; a.s = 0; break; } // the mission ended while he drove: no walk, he just turns round
        // the driver gets out beside the rear of the car
        a.man = this.factory.walker(mulberry32(P.slot.index * 131 + 7));
        this.group.add(a.man.root);
        a.walked = true;
        a.phase = 'walkIn';
        a.s = 0;
        break;
      }
      case 'walkIn': {
        a.s = Math.min(P.walk.len, a.s + P.walkSpeed * dt);
        this.placeMan(a, P.walk, a.s, 1, P.walkSpeed, dt);
        if (a.s >= P.walk.len - 1e-3) { // through the portal: gone from sight
          if (a.man) { this.group.remove(a.man.root); a.man.dispose(); a.man = null; }
          a.phase = 'inside';
          a.t = 0;
        }
        break;
      }
      case 'inside': {
        a.t += dt;
        if (this.leaving && a.t >= P.leaveDelay) {
          a.man = this.factory.walker(mulberry32(P.slot.index * 131 + 7));
          this.group.add(a.man.root);
          a.phase = 'walkOut';
          a.s = P.walk.len;
        }
        break;
      }
      case 'walkOut': {
        a.s = Math.max(0, a.s - P.walkSpeed * dt);
        this.placeMan(a, P.walk, a.s, -1, P.walkSpeed, dt);
        if (a.s <= 1e-3) { // at the car: gets in
          if (a.man) { this.group.remove(a.man.root); a.man.dispose(); a.man = null; }
          a.phase = 'board';
          a.t = 0;
        }
        break;
      }
      case 'board': {
        a.t += dt;
        this.placeCar(a, P.slot.x, P.slot.z, P.parkYaw, 0, dt);
        if (a.t >= BOARD_TIME) { a.phase = 'back'; a.s = 0; }
        break;
      }
      case 'back': {
        // reverse straight out of the bay to the middle of the aisle (the heading stays)
        a.s = Math.min(P.backLen, a.s + BACK_SPEED * dt);
        const dir = Math.sign(P.aisleX - P.slot.x);
        this.placeCar(a, P.slot.x + dir * a.s, P.slot.z, P.parkYaw, -BACK_SPEED, dt);
        if (a.s >= P.backLen - 1e-3) { a.phase = 'turn'; a.t = 0; }
        break;
      }
      case 'turn': {
        // turn on the spot to face the exit (the aisle runs north - south and the exit is to the south: heading 0)
        a.t += dt;
        const k = Math.min(1, a.t / TURN_TIME), e = k * k * (3 - 2 * k);
        const dh = Math.atan2(Math.sin(0 - P.parkYaw), Math.cos(0 - P.parkYaw));
        this.placeCar(a, P.aisleX, P.slot.z, P.parkYaw + dh * e, 0.5, dt);
        if (k >= 1) { a.phase = 'driveOut'; a.s = 0; }
        break;
      }
      case 'driveOut': {
        const v = speedOut(a.s, P.outRoute.len);
        a.s = Math.min(P.outRoute.len, a.s + v * dt);
        const p = sampleRoute(P.outRoute, a.s);
        this.placeCar(a, p.x, p.z, p.heading, v, dt);
        if (a.s >= P.outRoute.len - 1e-3) this.finish(a); // off to the highway
        break;
      }
      case 'gone': break;
    }
  }

  dispose(): void {
    this.clear();
  }
}
