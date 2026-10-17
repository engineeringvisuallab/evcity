import * as THREE from 'three';
import { PersonModel, randomAppearance, type Appearance, type PersonMode } from './PersonModel';
import type { Vehicle } from '../vehicles/Vehicle';
import type { WeaponId } from '../combat/Weapons';
import { Config } from '../core/Config';

/** civilian = normal person, thug = armed civilian who wants to kill the player, police = comes when the player is wanted. */
export type PersonRole = 'civilian' | 'thug' | 'police';

/** What a person is doing right now. */
export type PersonTask =
  | 'sidewalk' // walking along the edge of a road
  | 'wander' // walking to random spots in the open
  | 'idle' // standing for a while
  | 'flee' // running away (a vehicle came too close / was thrown out of a car / gunfire)
  | 'attack' // armed: walks towards the player and shoots
  | 'dead' // lying on the ground
  | 'driving'; // sitting in a vehicle (the vehicle owns the body)

let NEXT_ID = 1;

/**
 * A person. Position is kept in WORLD coordinates (doubles), so the floating origin never matters here;
 * the model is placed relative to the current origin each frame by PeopleManager.
 * There is no physics body: people are snapped to the terrain/road surface and cars brake for them.
 */
export class Person {
  readonly id = NEXT_ID++;
  readonly model: PersonModel;
  readonly world = new THREE.Vector3();
  heading = 0;
  speed = 0;
  mode: PersonMode = 'idle';
  task: PersonTask = 'idle';
  /** The vehicle this person is driving (null while on foot). */
  vehicle: Vehicle | null = null;
  /** Seconds left in the current task (idle / flee). */
  timer = 0;

  // sidewalk state
  roadId = -1;
  s = 0;
  dir: 1 | -1 = 1;
  /** +1 = left edge of the road, -1 = right edge (relative to point order). */
  side: 1 | -1 = 1;
  // wander state
  goalX = 0;
  goalZ = 0;
  // --- guns ---
  role: PersonRole = 'civilian';
  health: number = Config.combat.personHealth;
  weapon: WeaponId | null = null;
  /** Seconds until the next shot / until the next line-of-sight check. */
  fireT = 0;
  losT = 0;
  hasLos = false;
  burstLeft = 0;
  strafe: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  strafeT = 0;
  deadT = 0;
  /** Police only: seconds since nobody was wanted any more. */
  idleT = 0;
  /** Walking speed of this person (m/s). */
  readonly pace = 1.1 + Math.random() * 0.5;

  constructor(look: Appearance = randomAppearance(Math.random)) {
    this.model = new PersonModel(look);
  }

  get dead(): boolean {
    return this.task === 'dead';
  }

  get onFoot(): boolean {
    return this.vehicle === null;
  }
}
