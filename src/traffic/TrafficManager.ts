import * as THREE from 'three';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { PeopleManager } from '../people/PeopleManager';
import type { TerrainPhysics } from '../terrain';
import { JEEP, SEDAN, type Vehicle, type VehicleManager } from '../vehicles';
import { AIDriver, type Obstacle } from './AIDriver';
import { RoadGraph, type RoadPoint } from './RoadGraph';
import { RouteBuilder } from './Route';

export interface TrafficDeps {
  graph: RoadGraph;
  vehicles: VehicleManager;
  people: PeopleManager;
  player: Player;
  terrainPhysics: TerrainPhysics;
}

const tmpPt: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
const V3 = new THREE.Vector3();
const VEL = { x: 0, z: 0 };

/**
 * AI traffic. A car only ever exists WITH a driver: spawning a car means creating a person, seating him, and
 * giving him a route. Drivers follow the roads in the left lane (Bangladesh), turn at junctions, brake for
 * people and other cars, and disappear (together with their car) when far from the player or at a dead end.
 * Also removes the car the player walked away from (it would be empty).
 */
export class TrafficManager {
  private timer = 1;
  private obstacles: Obstacle[] = [];
  private _aiCount = 0;

  constructor(private d: TrafficDeps) {}

  get aiCount(): number {
    return this._aiCount;
  }

  /** 60 Hz, before the physics step: every AI driver decides his pedals. */
  fixedUpdate(dt: number): void {
    const vs = this.d.vehicles.vehicles;
    const obs = this.obstacles;
    obs.length = 0;
    for (const v of vs) {
      if (!v.enabled) continue;
      v.physWorld(V3);
      v.velocityXZ(VEL);
      obs.push({ x: V3.x, z: V3.z, vx: VEL.x, vz: VEL.z, r: 2.0, kind: 'vehicle', ref: v });
    }
    this.d.people.collectObstacles(obs);
    for (const v of vs) if (v.ai && v.enabled) v.ai.update(dt, obs);
  }

  /** Every frame. */
  update(dt: number, focus: THREE.Vector3): void {
    const T = Config.traffic;
    const vm = this.d.vehicles;
    let ai = 0;
    for (let i = vm.vehicles.length - 1; i >= 0; i--) {
      const v = vm.vehicles[i];
      if (v === vm.driver || v.tourVehicle) continue;
      v.physWorld(V3);
      const dist = Math.hypot(V3.x - focus.x, V3.z - focus.z);
      if (v.driver === null) {
        // the player got out: the empty car goes away once he has walked off (never in front of his eyes)
        v.abandonedFor += dt;
        if (dist > 30 || v.abandonedFor > 90) this.remove(v);
        continue;
      }
      if (v.ai) {
        ai++;
        if (v.ai.dead || v.ai.finishedFor > 4 || dist > T.despawnRadius) this.remove(v);
      }
    }
    this._aiCount = ai;

    this.timer -= dt;
    if (this.timer <= 0 && ai < T.target && this.d.player.active) {
      this.timer = T.spawnEvery;
      this.trySpawn(focus);
    }
  }

  private trySpawn(focus: THREE.Vector3): void {
    const T = Config.traffic;
    const g = this.d.graph;
    for (let attempt = 0; attempt < 12; attempt++) {
      const spot = g.randomSpotInRing(focus.x, focus.z, T.spawnMin, Math.min(T.spawnMax, PhysicsConfig.activeRadius * 0.9), Math.random);
      if (!spot) return; // no road around the player
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const road = g.roads[spot.roadId];
      if (spot.s < 20 || spot.s > road.length - 60) continue;
      g.at(spot.roadId, spot.s, dir, g.laneOffset(spot.roadId), tmpPt);
      const dist = Math.hypot(tmpPt.x - focus.x, tmpPt.z - focus.z);
      if (dist < T.spawnMin || dist > Math.min(T.spawnMax, PhysicsConfig.activeRadius * 0.9)) continue;
      if (!this.d.terrainPhysics.hasColliderAt(tmpPt.x, tmpPt.z)) continue;
      if (g.onBridge(spot.roadId, spot.s) || g.onBridge(spot.roadId, spot.s + dir * 30)) continue;
      let crowded = false;
      for (const v of this.d.vehicles.vehicles) {
        v.physWorld(V3);
        if (Math.hypot(V3.x - tmpPt.x, V3.z - tmpPt.z) < T.spawnGap) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;

      const temper = 0.7 + Math.random() * 0.28;
      const route = new RouteBuilder(g, Math.random, spot.roadId, spot.s, dir, temper);
      route.start();
      const yaw = Math.atan2(tmpPt.hx, tmpPt.hz);
      const spec = Math.random() < 0.7 ? SEDAN : JEEP;
      const colour = BODY_COLOURS[Math.floor(Math.random() * BODY_COLOURS.length)];
      V3.set(tmpPt.x, tmpPt.y + 1.0, tmpPt.z);
      // the driver first: a vehicle cannot be created without one
      const driver = this.d.people.createPerson();
      const car = this.d.vehicles.spawn(spec, V3, yaw, driver, colour);
      car.ai = new AIDriver(car, route);
      car.setEnabled(true);
      return;
    }
  }

  /** Remove a vehicle and (if there is one) its driver. */
  private remove(v: Vehicle): void {
    const who = this.d.vehicles.remove(v);
    if (who && who !== 'player') this.d.people.dispose(who);
  }
}

const BODY_COLOURS = [0xf2f2f0, 0xb8302a, 0x2d4f8a, 0x3a3f46, 0xd9b53a, 0x2f7d5b, 0x8a8f96, 0x1d1d20];
