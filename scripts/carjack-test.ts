// Carjack test (headless, stub world): npx tsx scripts/carjack-test.ts
// The owner of a car the player took by force does NOT run away: he runs after it, tugs at the door, shoots when the player drives off
// (the shots go wide, the player is never hit) and climbs back in when the player leaves it empty.
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { PeopleManager } from '../src/people/PeopleManager';
import { Person } from '../src/people/Person';
import { CombatEffects } from '../src/combat/CombatEffects';
import { Wanted } from '../src/combat/Wanted';
import type { CombatHooks } from '../src/combat/CombatHooks';
import { readFileSync } from 'node:fs';
import { TrafficManager } from '../src/traffic/TrafficManager';
import { CityPlan } from '../src/city/CityPlan';
import { SPECS } from '../src/vehicles';
import type { RoadPoint } from '../src/traffic/RoadGraph';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const gen = new TerrainGenerator(Config.world.seed);
const graph = new RoadGraph(gen.roads);
const scene = new THREE.Scene();
const X0 = 0;
const Z0 = 0;
const H = (x: number, z: number) => gen.heightAt(x, z);

// a stub car: position, speed, who sits in it
const car = {
  x: X0 + 30, z: Z0, speed: 0, state: 'ok', driver: null as unknown, enabled: true, doorTugs: 0,
  physWorld(o: THREE.Vector3) { return o.set(this.x, H(this.x, this.z), this.z); },
  get forwardSpeed() { return this.speed; },
  forwardVector(o: THREE.Vector3) { return o.set(1, 0, 0); },
  hasDoor() { return true; },
  openDoor() { this.doorTugs++; },
};
const vm = { vehicles: [car] as unknown[], driver: null as unknown };
const playerPos = new THREE.Vector3(car.x, H(car.x, car.z) + 1, car.z);
const fakePlayer = { active: false, inVehicle: false, vel: new THREE.Vector3(), getWorldPosition: (o: THREE.Vector3) => o.copy(playerPos) };
const people = new PeopleManager({ scene, terrain: gen, origin: { origin: new THREE.Vector3() } as never, graph, vehicles: vm as never, player: fakePlayer as never });
let shots = 0;
let hits = 0;
const hooks: CombatHooks = {
  wanted: new Wanted(),
  effects: Object.assign(new CombatEffects(scene), { tracer: () => { shots++; } }),
  audio: { shot: () => undefined, thud: () => undefined, setMuted: () => undefined } as never,
  playerWorld: (o) => o.copy(playerPos),
  playerHit: () => { hits++; },
  blocked: () => false,
};
people.setCombat(hooks);
const run = (sec: number, each?: (t: number) => void) => {
  for (let i = 0; i < sec * 30; i++) {
    each?.(i / 30);
    people.update(1 / 30, playerPos);
  }
};
const dist = (p: Person) => Math.hypot(car.x - p.world.x, car.z - p.world.z);

// ---- 1. the owner is thrown out 20 m from the car while the player sits in it: he runs at it, does not flee
{
  car.x = X0 + 20; car.z = Z0; car.speed = 0;
  vm.driver = car;
  playerPos.set(car.x, H(car.x, car.z) + 1, car.z);
  const owner = new Person();
  people.adopt(owner, new THREE.Vector3(X0, H(X0, Z0), Z0), 'idle');
  people.startRetake(owner, car as never);
  const d0 = dist(owner);
  run(1.5);
  ok(owner.task === 'retake', `the owner does not flee (task = ${owner.task})`);
  ok(dist(owner) < d0 - 4, `he runs at the car: ${d0.toFixed(1)} m -> ${dist(owner).toFixed(1)} m`);
  ok(owner.weapon === 'pistol', 'he has a pistol');
  ok(owner.role === 'civilian', 'he stays a civilian (a victim, not a criminal)');

  // ---- 2. he reaches the car while it stands: tugs at the door, cannot do anything
  run(6);
  ok(dist(owner) < 3.6, `he stands at the door (${dist(owner).toFixed(1)} m)`);
  run(8);
  ok(car.doorTugs >= 2, `he tugs at the door (${car.doorTugs} tugs)`);
  ok(owner.task === 'retake' && vm.driver === car, 'the player keeps the car');
  ok(hits === 0, 'nothing hits the player');

  // ---- 3. the player drives off: he stops and shoots; the shots go wide
  shots = 0;
  hits = 0;
  car.speed = 12;
  run(4, () => { car.x += (12 / 30); playerPos.set(car.x, H(car.x, car.z) + 1, car.z); });
  ok(shots > 0, `he shoots at the car (${shots} tracers)`);
  ok(hits === 0, 'the player is never hit (shots go wide)');
  ok(owner.task === 'retake' || owner.task === 'idle', 'he keeps trying or gives up (never flees)');

  // ---- 4. far away: he gives up and puts the gun away
  run(10, () => { car.x += (12 / 30); playerPos.set(car.x, H(car.x, car.z) + 1, car.z); });
  ok(owner.task !== 'retake' && owner.stolen === null && owner.weapon === null, `far away he gives up (task = ${owner.task})`);
  people.dispose(owner);
}

// ---- 5. the player leaves the car empty: the owner runs to it and climbs back in (Engine: TrafficManager.resume)
{
  car.x = X0 + 15; car.z = Z0 + 5; car.speed = 0;
  vm.driver = null;
  playerPos.set(car.x + 6, H(car.x, car.z) + 1, car.z); // the player stands beside it
  const owner = new Person();
  people.adopt(owner, new THREE.Vector3(X0, H(X0, Z0), Z0), 'idle');
  people.startRetake(owner, car as never);
  let seated = 0;
  people.onRetake = (p) => { seated++; people.dispose(p); return true; };
  run(8);
  ok(seated === 1, 'the empty car is reached: he climbs back in');
  ok(owner.stolen === null && owner.weapon === null, 'and puts the gun away');
  ok(!people.onFoot.includes(owner), 'he is no longer on foot');
}

// ---- 6. the car is destroyed: he gives up
{
  car.x = X0 + 25; car.state = 'ok';
  vm.driver = car;
  const owner = new Person();
  people.adopt(owner, new THREE.Vector3(X0, H(X0, Z0), Z0), 'idle');
  people.startRetake(owner, car as never);
  run(1);
  car.state = 'wrecked';
  run(1);
  ok(owner.task !== 'retake', 'the car is wrecked: he gives up');
  people.dispose(owner);
}

// ---- 7. a person thrown out WITHOUT a car to retake still runs away (shot driver etc. unchanged)
{
  const p = new Person();
  people.adopt(p, new THREE.Vector3(X0, H(X0, Z0), Z0), 'flee');
  ok(p.task === 'flee', "a normal ejected person still flees");
  people.dispose(p);
}

// ---- 8. passengers stay in the car when the player takes it (source check of VehicleManager.enter)
{
  const src = readFileSync(new URL('../src/vehicles/VehicleManager.ts', import.meta.url), 'utf8');
  const enter = src.slice(src.indexOf('private enter('), src.indexOf('private exit('));
  ok(!enter.includes('removePassengers'), 'enter(): the passengers are not taken out of the car');
  ok(enter.includes('onDriverEjected(old, this.tmp, v)'), 'enter(): the owner gets the stolen car to retake');
}

// ---- 9. TrafficManager.resume: the owner sits down again and the car gets an AI driver on the nearest road
{
  const spot = graph.randomSpot(() => 0.37);
  const pt: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  graph.at(spot.roadId, spot.s, 1, graph.laneOffset(spot.roadId), pt);
  const spec = Object.values(SPECS).find((s) => s.look.kind !== 'bus' && s.look.kind !== 'tank') ?? Object.values(SPECS)[0];
  const seated: unknown[] = [];
  const stolen = {
    spec, state: 'ok', driver: null as unknown, abandonedFor: 50, coast: true, ai: null as unknown, enabled: false,
    physWorld: (o: THREE.Vector3) => o.set(pt.x, pt.y, pt.z),
    forwardVector: (o: THREE.Vector3) => o.set(pt.hx, 0, pt.hz),
    seatDriver(w: unknown) { this.driver = w; seated.push(w); },
    setEnabled(on: boolean) { this.enabled = on; },
  };
  const traffic = new TrafficManager({ graph, plan: new CityPlan(gen.sites), vehicles: vm as never, people, player: fakePlayer as never, terrainPhysics: {} as never });
  const owner = new Person();
  people.adopt(owner, new THREE.Vector3(pt.x, pt.y, pt.z), 'idle');
  ok(traffic.resume(stolen as never, owner), 'resume: true on a road');
  ok(seated[0] === owner && stolen.driver === owner, 'resume: the owner sits behind the wheel');
  ok(stolen.ai !== null && stolen.enabled && stolen.coast === false && stolen.abandonedFor === 0, 'resume: AI driver on, car enabled');
  ok(!people.onFoot.includes(owner), 'resume: he is no longer on foot');
  // no road within 25 m: refuses and changes nothing
  const lost = { ...stolen, driver: null as unknown, ai: null as unknown, physWorld: (o: THREE.Vector3) => o.set(5000, 0, 5000) };
  const o2 = new Person();
  ok(!traffic.resume(lost as never, o2), 'resume: false far from any road');
}

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log('ALL PASS');
