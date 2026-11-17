// EVLab Step 12: people who sit on the outdoor benches of Step 11 (see EVLabSitterPlan for who sits where and how).
// Real PersonModel each (the game's own person), posed once with PersonModel.setSeated + setSeatedLimbs and then left alone: no per-frame cost.
// They are built when the player first comes near (a few dozen metres of the plaza is enough to see them) and shown only while he is near.
// Everything here is building-local (the EVLabManager group carries it to the right place in the world). People are drawn only, there is no physics.
import * as THREE from 'three';
import { PersonModel, randomAppearance, type SeatPose } from '../people/PersonModel';
import { sitPose, sitterHip, sitterRng, planSitters, type SitterPlan } from './EVLabSitterPlan';

/** What the sitters need from a person (the real PersonModel, or a stand-in in the headless test). */
export interface SitterView {
  root: THREE.Object3D;
  /** Sit down with the limbs of `sitPose` and face `yaw`; the hip joint is at the root origin. */
  sit(pose: ReturnType<typeof sitPose>, yaw: number): void;
  dispose(): void;
}
export interface SitterFactory {
  person(look: number, scale: number): SitterView;
}

const SEATED: SeatPose = { lean: -0.1, thigh: -1.45, knee: 1.5, arm: -0.45, spread: 0.11, elbow: -1.1 }; // starting pose: setSeatedLimbs sets the real angles right after

class RealSitter implements SitterView {
  private man: PersonModel;
  readonly root: THREE.Object3D;

  constructor(look: number, scale: number) {
    this.man = new PersonModel({ ...randomAppearance(sitterRng(look)), scale });
    this.root = this.man.root;
  }

  sit(p: ReturnType<typeof sitPose>, yaw: number): void {
    this.man.setSeated(true, SEATED); // lean != 0 -> the feet get ankle joints
    this.man.setSeatedLimbs(p.lean, p.thigh, p.knee, p.arm, p.elbow, 0.11);
    this.root.rotation.set(0, yaw, 0);
  }

  dispose(): void { this.man.dispose(); }
}

export class RealSitterFactory implements SitterFactory {
  person(look: number, scale: number): SitterView { return new RealSitter(look, scale); }
}

export class EVLabBenchSitters {
  readonly group = new THREE.Group();
  private people: SitterView[] = [];
  private plans: SitterPlan[] = [];
  private built = false;
  private count = 0;

  constructor(private factory: SitterFactory) {
    this.group.name = 'EVLabBenchSitters';
    this.group.visible = false;
  }

  /** Number of people sitting (0 until they are built). */
  get seated(): number { return this.people.length; }
  get plan(): readonly SitterPlan[] { return this.plans; }

  /** Set how many people sit (Q.evlabBenchSitters). A change after they were built rebuilds them the next time `show` is called. */
  setCount(n: number): void {
    if (n === this.count) return;
    this.count = n;
    this.clear();
  }

  /** Called every frame with "is the player near": builds the people on the first near frame, shows / hides them. */
  show(near: boolean): void {
    if (near && !this.built && this.count > 0) this.build();
    this.group.visible = near && this.people.length > 0;
  }

  private build(): void {
    this.built = true;
    this.plans = planSitters(this.count);
    for (const pl of this.plans) {
      const hip = sitterHip(pl.seat, pl.scale);
      const person = this.factory.person(pl.look, pl.scale);
      person.sit(sitPose(pl.scale, pl.hands), hip.yaw + pl.turn);
      person.root.position.set(hip.x, hip.y, hip.z);
      this.group.add(person.root);
      this.people.push(person);
    }
  }

  private clear(): void {
    for (const p of this.people) { p.root.removeFromParent(); p.dispose(); }
    this.people = [];
    this.plans = [];
    this.built = false;
    this.group.visible = false;
  }

  dispose(): void { this.clear(); }
}
