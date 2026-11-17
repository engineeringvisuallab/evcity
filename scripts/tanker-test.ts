// Fuel tanker check (headless, real Rapier, flat ground): npx tsx scripts/tanker-test.ts
//  - top speed is about 200 km/h and the truck stays upright while it accelerates and brakes
//  - a hard crash with fuel on board makes it explode; with an empty tank it only burns / is damaged
// minimal canvas stub so VehicleLights' beam texture can be made without a browser
const ctxStub: unknown = new Proxy(function () {}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => ctxStub), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { Vehicle, type DriveInput } from '../src/vehicles/Vehicle';
import { SPECS, groundY, type VehicleSpec } from '../src/vehicles/VehicleSpec';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER;
const origin = new FloatingOrigin(new THREE.Group(), bus);
const scene = new THREE.Scene();
physics.world.createCollider(R.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(1));
const terrain = { heightAt: () => 0, roads: { surfaceAt: () => 1 }, sample: (_x: number, _z: number, o: { h: number; water: number; fx: number; fz: number }) => { o.h = 0; o.water = NaN; o.fx = 0; o.fz = 0; } } as never;
const deps = { physics, terrain, origin, scene, bus };
const none: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
const make = (spec: VehicleSpec, x = 0, z = 0): Vehicle => { const v = new Vehicle(deps, spec, new THREE.Vector3(x, -groundY(spec) + 0.15, z), 0); v.setEnabled(true); return v; };
const STEP = 1 / 60;
function run(v: Vehicle, sec: number, inp: Partial<DriveInput> | ((t: number) => Partial<DriveInput>), each?: (t: number) => void): void {
  for (let i = 0; i < Math.round(sec / STEP); i++) {
    const t = i * STEP;
    v.fixedUpdate(STEP, { ...none, ...(typeof inp === 'function' ? inp(t) : inp) });
    physics.step();
    v.afterStep();
    each?.(t);
  }
}
const kmh = (v: Vehicle) => Math.abs(v.forwardSpeed) * 3.6;

const t = make(SPECS.tanker, 0, -1900);
let t20 = -1;
run(t, 80, { throttle: true }, (s) => { if (t20 < 0 && kmh(t) >= 20) t20 = s; });
console.log(`tanker: 0-20 km/h ${t20.toFixed(1)} s, top ${kmh(t).toFixed(0)} km/h, upY ${t.upY.toFixed(2)}, hp ${t.hp.toFixed(0)}`);
ok(kmh(t) >= 190 && kmh(t) <= 215, 'tanker top speed is about 200 km/h');
ok(t.upY > 0.95 && !t.fallen && t.hp === 100, 'tanker stays upright and undamaged while accelerating');
let braked = 0;
run(t, 30, () => ({ brake: t.forwardSpeed > 0.8, handbrake: t.forwardSpeed <= 0.8 }), (s) => { if (t.forwardSpeed > 0.8) braked = s; });
ok(t.forwardSpeed < 1 && braked < 25, `tanker stops from top speed (${braked.toFixed(1)} s)`);

// crash into a wall at ~100 km/h: loaded vs empty
function crash(cargo: number, x: number): Vehicle {
  const wall = physics.world.createCollider(R.ColliderDesc.cuboid(30, 6, 1).setTranslation(x, 6, -1500));
  void wall;
  const v = make(SPECS.tanker, x, -1700);
  v.cargo = cargo;
  run(v, 25, (s) => ({ throttle: kmh(v) < 100 }), () => { /* until it hits */ });
  run(v, 12, { brake: false });
  return v;
}
const loaded = crash(SPECS.tanker.id === 'tanker' ? 6 : 0, 1000);
const empty = crash(0, 1200);
console.log(`loaded: state ${loaded.state}, hp ${loaded.hp.toFixed(0)}; empty: state ${empty.state}, hp ${empty.hp.toFixed(0)}`);
ok(loaded.state === 'wrecked' || loaded.state === 'burning', 'a hard crash with fuel on board blows the tanker up / sets it on fire');
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
