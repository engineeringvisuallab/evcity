import * as THREE from 'three';
import { fireBurnSeconds } from '../vehicles/VehicleFire';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { PeopleManager } from '../people/PeopleManager';
import type { Person } from '../people/Person';
import type { TerrainPhysics } from '../terrain';
import type { CityPlan } from '../city/CityPlan';
import { getWorldZoneAt } from '../city/WorldZones';
import type { RoadKind } from '../roads/RoadTypes';
import { canUTurn } from '../roads/UTurns';
import { SPECS, canUse, canUseRoad, canUsePlace, groundY, type Vehicle, type VehicleManager, type VehicleSpec } from '../vehicles';
import { ENERGY } from '../vehicles/Energy';
import type { BusStops } from './BusStops';
import { AIDriver, type Obstacle } from './AIDriver';
import { RoadGraph, type RoadPoint } from './RoadGraph';
import { RouteBuilder, type RouteRule } from './Route';
import { planRoute } from './RoutePlanner';
import { StationStops } from './StationStops';
import type { RaceCourse } from '../race/RaceCourse';
import type { TrafficSignals } from './TrafficSignals';

export interface TrafficDeps {
  graph: RoadGraph;
  /** City areas (homes, bazaar, campus ...): decides where small / special vehicles belong inside a city. */
  plan: CityPlan;
  vehicles: VehicleManager;
  people: PeopleManager;
  player: Player;
  terrainPhysics: TerrainPhysics;
  /** Buses halt at these. */
  stops?: BusStops;
  /** Traffic lights: AI drivers obey them. */
  signals?: TrafficSignals;
}

/** Cargo trucks, fuel tankers and buses: they keep to the slow kerb lane of a big highway. */
const isHeavy = (spec: VehicleSpec): boolean => spec.look.kind === 'truck' || spec.look.kind === 'bus' || spec.id === 'tanker' || (spec.cruiseMax !== undefined && spec.cruiseMax < 20);
/** Too slow for a freeway (cycle rickshaw, CNG auto): never spawns on one and never turns onto one. */
const isSlow = (spec: VehicleSpec): boolean => spec.cruiseMax !== undefined && spec.cruiseMax <= 14;

const tmpPt: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
const V3 = new THREE.Vector3();
const VEL = { x: 0, z: 0 };
const F3 = new THREE.Vector3();

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
  /** AI STEP 2: the fuel stations / charge points AI cars drive into when their tank / battery is low. */
  private stations: StationStops;

  constructor(private d: TrafficDeps) {
    this.stations = new StationStops(d.graph);
  }

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
      const hz = v.spec.half.z;
      if (hz > 3) {
        // a long vehicle (bus, tank) counts as a row of circles along its length
        v.forwardVector(F3);
        const l = Math.hypot(F3.x, F3.z) || 1;
        const n = Math.ceil((hz * 2) / 3.2);
        for (let k = 0; k < n; k++) {
          const off = (k / (n - 1) - 0.5) * (hz * 2 - 3.6);
          obs.push({ x: V3.x + (F3.x / l) * off, z: V3.z + (F3.z / l) * off, vx: VEL.x, vz: VEL.z, r: 2.0, kind: 'vehicle', ref: v });
        }
      } else obs.push({ x: V3.x, z: V3.z, vx: VEL.x, vz: VEL.z, r: hz < 1.2 ? 1.2 : 2.0, kind: 'vehicle', ref: v });
    }
    this.d.people.collectObstacles(obs);
    for (const v of vs) {
      if (!v.ai || !v.enabled) continue;
      if (this.d.stops && v.spec.look.kind === 'bus' && !v.ai.stop) {
        v.physWorld(V3);
        v.forwardVector(F3);
        const l = Math.hypot(F3.x, F3.z) || 1;
        v.ai.stop = this.d.stops.nextAhead(V3.x, V3.z, F3.x / l, F3.z / l, v.ai.served);
      }
      v.ai.update(dt, obs);
    }
  }

  /** Every frame. */
  update(dt: number, focus: THREE.Vector3): void {
    const T = Config.traffic;
    const vm = this.d.vehicles;
    this.stations.update(dt);
    let ai = 0;
    for (let i = vm.vehicles.length - 1; i >= 0; i--) {
      const v = vm.vehicles[i];
      if (v === vm.driver || v.persistent) continue;
      v.physWorld(V3);
      const dist = Math.hypot(V3.x - focus.x, V3.z - focus.z);
      if (v.state === 'wrecked') {
        // a burnt-out wreck stays a while (it is something to look at) and then goes away
        if (v.wreckedFor > Math.max(30, fireBurnSeconds(v.spec.look.kind, v.spec.id) + 8) || dist > T.despawnRadius) this.remove(v);
        continue;
      }
      if (v.driver === null) {
        // the player got out: the empty car goes away once he has walked off (never in front of his eyes)
        v.abandonedFor += dt;
        // ... unless its owner is running back to it to take it again
        const owner = this.d.people.onFoot.some((q) => q.stolen === v && q.task === 'retake');
        if (owner ? v.abandonedFor > 75 : dist > 30 || v.abandonedFor > 90) this.remove(v);
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

      // which vehicle belongs on THIS road in THIS area (a rickshaw never appears on a freeway, a bus not in a lane)
      const spec = this.pickSpec(road.kind, tmpPt.x, tmpPt.z);
      if (!spec) continue;
      const temper = 0.7 + Math.random() * 0.28;
      const route = new RouteBuilder(g, Math.random, spot.roadId, spot.s, dir, temper, this.routeRule(spec));
      // big highway: slow / heavy vehicles keep the kerb lane, ordinary cars take the middle (careful) or the fast lane (quick drivers)
      const hw = g.isBigHighway(spot.roadId);
      if (hw) {
        route.lane = isHeavy(spec) ? 0 : temper > 0.85 ? 2 : 1;
        if (route.lane > 0) g.at(spot.roadId, spot.s, dir, g.laneOffset(spot.roadId, route.lane), tmpPt);
      }
      route.start();
      const yaw = Math.atan2(tmpPt.hx, tmpPt.hz);
      const colour = this.paint(spec);
      V3.set(tmpPt.x, tmpPt.y - groundY(spec) + 0.25, tmpPt.z);
      // the driver first: a vehicle cannot be created without one
      const driver = this.d.people.createPerson();
      const car = this.d.vehicles.spawn(spec, V3, yaw, driver, colour);
      const [lo, hi] = spec.pax ?? [0, 0];
      const pax = lo + Math.floor(Math.random() * (hi - lo + 1));
      for (let i = 0; i < pax; i++) if (!car.seatPassenger(this.d.people.createPerson())) break;
      car.ai = new AIDriver(car, route, this.d.signals, this.stations);
      car.energy = this.spawnEnergy(spec, spot.roadId, spot.s, dir);
      // some drivers (rickshaws) are reckless: they speed, run red lights and brake late, so crashes with cars really happen
      if (spec.reckless && Math.random() < spec.reckless) {
        car.ai.reckless = 0.6 + Math.random() * 0.4;
        car.ai.ignoreSignals = true;
      }
      car.setEnabled(true);
      // on a freeway the traffic is already moving (nobody appears standing still in the fast lane)
      if (hw) {
        const v0 = route.pts[0].vmax * 0.8;
        car.body.setLinvel({ x: tmpPt.hx * v0, y: 0, z: tmpPt.hz * v0 }, true);
      }
      return;
    }
  }

  /**
   * How full the tank / battery of a new AI car is: `startMin`..1, or (chance `lowShare`) nearly empty when a free station of its kind lies ahead on the same road,
   * so the player sees cars drive into stations (Config.traffic.energy).
   */
  private spawnEnergy(spec: VehicleSpec, roadId: number, s: number, dir: 1 | -1): number {
    const en = ENERGY[spec.id];
    if (!en) return 1;
    const E = Config.traffic.energy;
    let level = E.startMin + Math.random() * (1 - E.startMin);
    if (spec.id !== 'tanker' && spec.id !== 'tank' && Math.random() < E.lowShare) {
      const near = this.stations.find(roadId, dir, s, en.kind === 'fuel' ? 'fuel' : 'charge', spec.look.kind === 'bus', 110, E.nearStationM);
      if (near) level = E.lowStartMin + Math.random() * (E.lowStartMax - E.lowStartMin);
    }
    return level;
  }

  /** What road kinds / places / U-turns this vehicle's AI route may use (and its freeway speed cap). */
  private routeRule(spec: VehicleSpec): RouteRule {
    const H = Config.traffic.highway;
    return {
      roadOk: (k) => canUseRoad(spec.use, k) && !(k === 'highway' && isSlow(spec)),
      placeOk: (x, z) => canUsePlace(spec.use, getWorldZoneAt(x, z).kind, this.d.plan.areaAt(x, z)?.kind ?? null),
      uturnOk: (section) => canUTurn(spec, section),
      highwayMax: spec.id === 'tanker' ? H.tankerKmh / 3.6 : spec.look.kind === 'truck' ? H.truckKmh / 3.6 : undefined,
      // sports cars cruise much faster than the normal 130 km/h freeway limit (so they overtake the others)
      highwayLimit: spec.id === 'hypercar' || spec.id === 'evhypar' ? H.sportKmh / 3.6 : undefined,
    };
  }

  /**
   * CAR RACE: the AI racers on the starting grid of the course. They follow the planned way (F1 -> F2 -> F3) to the finish, drive fast (race limit),
   * overtake like everybody on the freeway, wait on the line while `ai.hold` is true, and are `persistent`: normal traffic never removes them, the race does (removeRacer).
   * Empty = there is no way from the start to the finish.
   */
  spawnRacers(c: RaceCourse): Vehicle[] {
    const g = this.d.graph;
    const out: Vehicle[] = [];
    const plan = planRoute(g, c.startRef, c.finishRef);
    if (!plan) return out;
    const specs = [SPECS.hypercar, SPECS.evhypar, SPECS.sedan, SPECS.jeep, SPECS.hypercar];
    const paints = [0xe03a2f, 0x2f7bd9, 0xf2f2f0, 0xf2b705, 0x2fbf71];
    const H = Config.traffic.highway;
    c.grid.forEach((slot, i) => {
      const spec = specs[i % specs.length];
      const rule: RouteRule = { ...this.routeRule(spec), highwayMax: undefined, highwayLimit: H.sportKmh / 3.6 };
      const route = new RouteBuilder(g, Math.random, slot.roadId, slot.s, slot.dir, 0.88 + Math.random() * 0.1, rule);
      route.lane = slot.lane;
      route.plan = plan.slice();
      route.target = { roadId: c.finishRef.roadId, s: c.finishRef.s };
      route.start();
      g.at(slot.roadId, slot.s, slot.dir, g.laneOffset(slot.roadId, slot.lane), tmpPt);
      const yaw = Math.atan2(tmpPt.hx, tmpPt.hz);
      V3.set(tmpPt.x, tmpPt.y - groundY(spec) + 0.25, tmpPt.z);
      const driver = this.d.people.createPerson();
      const car = this.d.vehicles.spawn(spec, V3, yaw, driver, paints[i % paints.length]);
      car.ai = new AIDriver(car, route, this.d.signals);
      car.ai.ignoreSignals = true;
      car.ai.hold = true;
      car.persistent = true;
      car.setEnabled(true);
      out.push(car);
    });
    return out;
  }

  /** CAR RACE: take a racer (and its driver) out of the world. */
  removeRacer(v: Vehicle): void {
    this.remove(v);
  }

  /**
   * The owner of a stolen car got it back (the player left it empty): he sits down again and drives off along the nearest road.
   * False = no road close by (nothing changes; the owner gives up).
   */
  resume(car: Vehicle, driver: Person): boolean {
    const g = this.d.graph;
    car.physWorld(V3);
    const near = g.nearestSpot(V3.x, V3.z, 25);
    if (!near || car.state === 'wrecked' || car.driver !== null) return false;
    g.at(near.roadId, near.s, 1, 0, tmpPt);
    car.forwardVector(F3);
    const dir: 1 | -1 = tmpPt.hx * F3.x + tmpPt.hz * F3.z >= 0 ? 1 : -1;
    const spec = car.spec;
    const route = new RouteBuilder(g, Math.random, near.roadId, near.s, dir, 0.7 + Math.random() * 0.28, this.routeRule(spec));
    route.start();
    this.d.people.dispose(driver);
    car.seatDriver(driver);
    car.abandonedFor = 0;
    car.coast = false;
    car.ai = new AIDriver(car, route, this.d.signals, this.stations);
    car.setEnabled(true);
    return true;
  }

  /** A vehicle that may use this kind of road in this kind of zone, by weight (null = nothing suits this place). */
  private pickSpec(road: RoadKind, x: number, z: number): VehicleSpec | null {
    const zone = getWorldZoneAt(x, z).kind;
    const area = this.d.plan.areaAt(x, z)?.kind ?? null;
    let buses = 0;
    for (const v of this.d.vehicles.vehicles) if (v.spec.look.kind === 'bus' && v.state !== 'wrecked') buses++;
    const fits: { spec: VehicleSpec; w: number }[] = [];
    let total = 0;
    for (const spec of Object.values(SPECS)) {
      if (!canUse(spec.use, road, zone, area)) continue;
      if (road === 'highway' && isSlow(spec)) continue; // no cycle rickshaw / CNG auto on a freeway
      if (spec.look.kind === 'bus' && buses >= Config.traffic.maxBuses) continue;
      fits.push({ spec, w: spec.use.weight });
      total += spec.use.weight;
    }
    let r = Math.random() * total;
    for (const f of fits) {
      if (r < f.w) return f.spec;
      r -= f.w;
    }
    return fits.length > 0 ? fits[fits.length - 1].spec : null;
  }

  private paint(spec: VehicleSpec): number {
    switch (spec.look.kind) {
      case 'rickshaw': return RICKSHAW_COLOURS[Math.floor(Math.random() * RICKSHAW_COLOURS.length)];
      case 'bus': return BUS_COLOURS[Math.floor(Math.random() * BUS_COLOURS.length)];
      case 'auto': return AUTO_COLOURS[Math.floor(Math.random() * AUTO_COLOURS.length)];
      default: return BODY_COLOURS[Math.floor(Math.random() * BODY_COLOURS.length)];
    }
  }

  /** Remove a vehicle and (if there is one) its driver and passengers. */
  private remove(v: Vehicle): void {
    v.ai?.releaseStation(); // a car that was on its way to a station gives it back
    for (const p of v.removePassengers()) this.d.people.dispose(p);
    const who = this.d.vehicles.remove(v);
    if (who && who !== 'player') this.d.people.dispose(who);
  }
}

const RICKSHAW_COLOURS = [0x2e6fbd, 0xc8402e, 0x2f9e5b, 0xe0a82a, 0x8a3fa8, 0x1c9fb0];
const BUS_COLOURS = [0xd23a2c, 0x2f7d5b, 0x2d4f8a, 0xe0a82a];
const AUTO_COLOURS = [0x2f9e5b, 0xe0c02a, 0x2e8ac8, 0xd9d9d4];
const BODY_COLOURS = [0xf2f2f0, 0xb8302a, 0x2d4f8a, 0x3a3f46, 0xd9b53a, 0x2f7d5b, 0x8a8f96, 0x1d1d20];
