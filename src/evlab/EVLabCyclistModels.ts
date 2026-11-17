// EVLab Step 10: the real models of the cyclists: the Step 9 cycle (one shared CycleKit) and the game's PersonModel as the rider (see EVLabCyclists).
import * as THREE from 'three';
import { PersonModel, randomAppearance, type SeatPose } from '../people/PersonModel';
import { CYCLE_PAINT, Cycle, CycleKit, buildCycle } from './EVLabCycle';
import { LEAN, RIDER_MIN_SCALE, hipAt, riderPose } from './EVLabCyclistPose';
import type { CyclistFactory, CycleView, RiderView } from './EVLabCyclists';

/** Starting pose when the rider sits down (the real angles are set every frame from the crank angle: PersonModel.setSeatedLimbs). */
const SIT: SeatPose = { lean: LEAN, thigh: -1.0, knee: 1.4, arm: -0.6, spread: 0.11, elbow: -0.4 };

class RealRider implements RiderView {
  private man: PersonModel;
  readonly root: THREE.Object3D;
  private scale: number;

  constructor(r: () => number) {
    const look = randomAppearance(r);
    this.scale = Math.max(look.scale, RIDER_MIN_SCALE); // taller than the crowd's smallest: the legs must reach the pedals
    this.man = new PersonModel({ ...look, scale: this.scale });
    this.root = this.man.root;
  }

  setHeading(h: number, dt: number): void { this.man.setHeading(h, dt); }
  update(dt: number, speed: number, mode: 'idle' | 'walk'): void { this.man.update(dt, speed, mode); }

  mount(cycle: CycleView): void {
    this.root.removeFromParent();
    this.man.setSeated(true, SIT);
    const hip = hipAt(this.scale);
    this.root.position.set(0, hip.y, hip.z);
    this.root.rotation.set(0, 0, 0);
    cycle.root.add(this.root);
    this.pedal(cycle.pedalAngle);
  }

  pedal(crank: number): void {
    const p = riderPose(this.scale, crank);
    this.man.setSeatedLimbs(p.lean, p.thigh, p.knee, p.arm, p.elbow);
  }

  dismount(): void {
    this.root.removeFromParent();
    this.man.setSeated(false);
    this.root.rotation.set(0, 0, 0);
  }

  dispose(): void { this.man.dispose(); }
}

/** Cycles share one kit (geometry + materials), created on the first cycle and released at the end. */
export class RealCyclistFactory implements CyclistFactory {
  private kit: CycleKit | null = null;

  cycle(paint: number): CycleView {
    if (!this.kit) this.kit = new CycleKit();
    const c: Cycle = buildCycle(this.kit, CYCLE_PAINT[((paint % CYCLE_PAINT.length) + CYCLE_PAINT.length) % CYCLE_PAINT.length]);
    return c;
  }

  rider(r: () => number): RiderView { return new RealRider(r); }

  dispose(): void { this.kit?.dispose(); this.kit = null; }
}
