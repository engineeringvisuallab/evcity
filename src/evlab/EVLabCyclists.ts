// EVLab Step 10: people who come to the presentation by cycle (see EVLabCyclistPath for the routes, EVLabCycleRack for the rack).
// Mission starts: a few cyclists ride in from the F6 highway along the avenue, over the south bridge, across the plaza and park their cycles in the rack,
// get off, walk to the portal and go in. Mission ends: they come out again, walk back, get on, push the cycle out of its bay, turn it round and ride away
// (cyclists still riding in park first, people still walking turn round on the spot). Cycles and riders are the game's own models (Cycle of Step 9,
// PersonModel); they are only drawn (no physics). Everything here is building-local (the EVLabManager group carries it to the right place in the world).
import * as THREE from 'three';
import { sampleRoute } from './EVLabArrivalPath';
import { BACK_LEN, planCyclists, rideInSpeed, rideOutSpeed, type CyclistPlan } from './EVLabCyclistPath';

/** What the cyclists need from a cycle / a rider (the real models, or stand-ins in the headless test). */
export interface CycleView {
  root: THREE.Object3D;
  readonly pedalAngle: number;
  place(x: number, y: number, z: number, heading: number): void;
  setSteer(a: number): void;
  roll(d: number): void;
  dispose(): void;
}
export interface RiderView {
  root: THREE.Object3D;
  setHeading(h: number, dt: number): void;
  update(dt: number, speed: number, mode: 'idle' | 'walk'): void;
  /** Sit on the saddle of this cycle (the rider becomes a child of the cycle). */
  mount(cycle: CycleView): void;
  /** Re-pose the legs and arms for the crank angle (only while mounted). */
  pedal(crank: number): void;
  /** Get off: stand up and leave the cycle (the caller puts the rider where he stands). */
  dismount(): void;
  dispose(): void;
}
export interface CyclistFactory {
  cycle(paint: number): CycleView;
  rider(r: () => number): RiderView;
  dispose?(): void;
}

export type Phase = 'wait' | 'rideIn' | 'park' | 'walkIn' | 'inside' | 'walkOut' | 'mount' | 'back' | 'turn' | 'rideOut' | 'gone';

interface Actor {
  plan: CyclistPlan;
  phase: Phase;
  /** Seconds in the phase / distance along the route of the phase. */
  t: number;
  s: number;
  cycle: CycleView | null;
  man: RiderView | null;
  seed: number;
  heading: number;
  /** Steering angle of the handlebar. */
  steer: number;
}

const FLOOR = 0.05; // the plaza / road level (same as the roads)
const WHEELBASE = 1.11;
const PARK_TIME = 1.0, MOUNT_TIME = 0.9, TURN_TIME = 1.3;
const BACK_SPEED = 0.9;

/** A small seeded random generator (the same one the game uses elsewhere, copied so this file needs nothing but three). */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class EVLabCyclists {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];
  private leaving = false;
  private runs = 0;

  constructor(private factory: CyclistFactory) {
    this.group.name = 'EVLabCyclists';
    this.group.visible = false;
  }

  /** True while any cycle or rider of the current mission is still about. */
  get active(): boolean { return this.actors.length > 0; }
  get phases(): Phase[] { return this.actors.map((a) => a.phase); }
  get count(): number { return this.actors.length; }

  /** The presentation mission starts: remove whatever is left of the last one and send the cyclists. */
  start(count: number): void {
    this.clear();
    this.leaving = false;
    const r = rng(9191 + this.runs++ * 613);
    this.actors = planCyclists(r, count).map((plan, i) => ({ plan, phase: 'wait' as Phase, t: 0, s: 0, cycle: null, man: null, seed: 5000 + i * 97 + this.runs * 11, heading: 0, steer: 0 }));
    this.group.visible = this.actors.length > 0;
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
        default: break; // rideIn / park: park first (see park), the rest is on its way out already
      }
    }
  }

  private clear(): void {
    for (const a of this.actors) this.finish(a);
    this.actors = [];
    this.group.visible = false;
  }

  private finish(a: Actor): void {
    if (a.man) { a.man.root.removeFromParent(); a.man.dispose(); a.man = null; }
    if (a.cycle) { this.group.remove(a.cycle.root); a.cycle.dispose(); a.cycle = null; }
    a.phase = 'gone';
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    if (!this.actors.length) return;
    for (const a of this.actors) this.step(a, Math.min(dt, 0.1));
    if (this.actors.every((a) => a.phase === 'gone')) this.clear();
  }

  private newRider(a: Actor): RiderView {
    const m = this.factory.rider(rng(a.seed));
    this.group.add(m.root);
    return m;
  }

  private placeCycle(a: Actor, x: number, z: number, heading: number, speed: number, dt: number): void {
    const c = a.cycle;
    if (!c) return;
    // the handlebar follows the change of heading (bicycle model), the wheels roll with the speed
    const dh = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading));
    const want = Math.abs(speed) > 0.3 ? Math.max(-0.5, Math.min(0.5, Math.atan((dh / Math.max(dt, 1e-3)) * WHEELBASE / Math.abs(speed)))) : 0;
    a.steer += (want - a.steer) * Math.min(1, 8 * dt);
    a.heading = heading;
    c.setSteer(a.steer);
    c.place(x, FLOOR, z, heading);
    if (speed !== 0) c.roll(speed * dt);
    a.man?.pedal(c.pedalAngle);
  }

  private placeMan(a: Actor, route: CyclistPlan['walk'], s: number, dir: 1 | -1, speed: number, dt: number): void {
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
          a.cycle = this.factory.cycle(P.paint);
          this.group.add(a.cycle.root);
          a.man = this.newRider(a);
          a.man.mount(a.cycle);
          a.phase = 'rideIn';
          a.s = 0;
          const p = sampleRoute(P.inRoute, 0);
          a.heading = p.heading;
          this.placeCycle(a, p.x, p.z, p.heading, 0, dt);
        }
        break;
      }
      case 'rideIn': {
        const v = rideInSpeed(a.s, P.inRoute.len, P.cruise, P.slowFrom);
        a.s = Math.min(P.inRoute.len, a.s + v * dt);
        const p = sampleRoute(P.inRoute, a.s);
        this.placeCycle(a, p.x, p.z, p.heading, v, dt);
        if (a.s >= P.inRoute.len - 1e-3) { a.phase = 'park'; a.t = 0; }
        break;
      }
      case 'park': {
        // in the bay, nose to the north (the last leg of the route ends along it); coasts to a stop, puts a foot down
        this.placeCycle(a, P.slot.x, P.slot.z, P.slot.yaw, 0, dt);
        a.t += dt;
        if (a.t < PARK_TIME) break;
        if (this.leaving) { a.phase = 'back'; a.s = 0; break; } // the mission ended while he rode: no walk, he turns round at once
        // he gets off beside the rear of the cycle
        if (a.man) { a.man.dismount(); this.group.add(a.man.root); }
        a.phase = 'walkIn';
        a.s = 0;
        this.placeMan(a, P.walk, 0, 1, 0, dt); // stands where he walks from, not where he sat
        break;
      }
      case 'walkIn': {
        a.s = Math.min(P.walk.len, a.s + P.walkSpeed * dt);
        this.placeMan(a, P.walk, a.s, 1, P.walkSpeed, dt);
        if (a.s >= P.walk.len - 1e-3) { // through the portal: gone from sight
          if (a.man) { a.man.root.removeFromParent(); a.man.dispose(); a.man = null; }
          a.phase = 'inside';
          a.t = 0;
        }
        break;
      }
      case 'inside': {
        a.t += dt;
        if (this.leaving && a.t >= P.leaveDelay) {
          a.man = this.newRider(a);
          a.phase = 'walkOut';
          a.s = P.walk.len;
        }
        break;
      }
      case 'walkOut': {
        a.s = Math.max(0, a.s - P.walkSpeed * dt);
        this.placeMan(a, P.walk, a.s, -1, P.walkSpeed, dt);
        if (a.s <= 1e-3) { // at the cycle: gets on
          if (a.man && a.cycle) a.man.mount(a.cycle);
          a.phase = 'mount';
          a.t = 0;
        }
        break;
      }
      case 'mount': {
        a.t += dt;
        this.placeCycle(a, P.slot.x, P.slot.z, P.slot.yaw, 0, dt);
        if (a.t >= MOUNT_TIME) { a.phase = 'back'; a.s = 0; }
        break;
      }
      case 'back': {
        // pushed straight back out of the bay (the heading stays: nose to the north, so he moves south)
        a.s = Math.min(BACK_LEN, a.s + BACK_SPEED * dt);
        this.placeCycle(a, P.slot.x, P.slot.z + a.s, P.slot.yaw, -BACK_SPEED, dt);
        if (a.s >= BACK_LEN - 1e-3) { a.phase = 'turn'; a.t = 0; }
        break;
      }
      case 'turn': {
        // turns on the spot to face the plaza (south: heading 0 = PI + PI)
        a.t += dt;
        const k = Math.min(1, a.t / TURN_TIME), e = k * k * (3 - 2 * k);
        this.placeCycle(a, P.slot.x, P.slot.z + BACK_LEN, P.slot.yaw + Math.PI * e, 0.4, dt);
        if (k >= 1) { a.phase = 'rideOut'; a.s = 0; a.heading = 0; }
        break;
      }
      case 'rideOut': {
        const v = rideOutSpeed(a.s, P.cruise, P.fastFrom);
        a.s = Math.min(P.outRoute.len, a.s + v * dt);
        const p = sampleRoute(P.outRoute, a.s);
        this.placeCycle(a, p.x, p.z, p.heading, v, dt);
        if (a.s >= P.outRoute.len - 1e-3) this.finish(a); // off to the highway
        break;
      }
      case 'gone': break;
    }
  }

  dispose(): void {
    this.clear();
    this.factory.dispose?.();
  }
}
