import * as THREE from 'three';
import type { Player } from '../characters';
import type { WorldManager } from '../world/WorldManager';
import type { Helicopter } from '../aircraft/Helicopter';
import type { HelicopterManager } from '../aircraft/HelicopterManager';
import type { Vehicle } from '../vehicles/Vehicle';
import { JEEP } from '../vehicles/VehicleSpec';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { RoadGraph } from '../traffic/RoadGraph';
import type { VoiceManager } from '../audio/VoiceManager';
import type { HUD } from '../ui/HUD';
import { TourUI, type TourDestinationChoice } from '../ui/TourUI';
import { TourRoadPlanner } from './TourRoadPlanner';
import { TourRoadPilot } from './TourRoadPilot';
import { WORLD_REGIONS } from '../city/WorldRegions';
import type { TerrainSample } from '../terrain/Lakes';
import { bn } from '../i18n';

export interface TourDestination extends TourDestinationChoice {
  x: number;
  z: number;
  kind: 'city' | 'nature';
}

export interface TourManagerDeps {
  container: HTMLElement;
  player: Player;
  world: WorldManager;
  vehicles: VehicleManager;
  helis: HelicopterManager;
  roads: RoadGraph;
  voice: VoiceManager;
  hud: HUD;
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
}

type TourPhase = 'idle' | 'dispatching' | 'ready' | 'choosing' | 'journey' | 'arrived';
type Transport = 'car' | 'heli';

/**
 * Coordinates Tour dispatch, Bengali voice/subtitles, destination choices, road-based car routing and
 * waypoint-based helicopter travel. Tour vehicles are real existing Vehicle/Helicopter physics objects.
 */
export class TourManager {
  private readonly ui: TourUI;
  private readonly roadPlanner: TourRoadPlanner;
  private phase: TourPhase = 'idle';
  private tourCar: Vehicle | null = null;
  private tourHeli: Helicopter | null = null;
  private carPilot: TourRoadPilot | null = null;
  private dispatchHeliTarget = new THREE.Vector3();
  private activeTransport: Transport | null = null;
  private currentHeliTarget: THREE.Vector3 | null = null;
  private carReady = false;
  private heliReady = false;
  private announcedCar = false;
  private announcedHeli = false;
  private announcedBoth = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private terrainSample: TerrainSample;
  private destinations: TourDestination[];

  constructor(private readonly d: TourManagerDeps) {
    this.roadPlanner = new TourRoadPlanner(d.roads);
    this.terrainSample = d.world.terrain.makeSample();
    this.destinations = this.makeDestinations();
    this.ui = new TourUI(d.container, () => this.requestTour(), (id) => this.selectDestination(id));
  }

  /** Called before vehicle physics, so the autopilot input is used by the same physics step. */
  fixedUpdate(dt: number): void {
    if (this.tourCar && this.carPilot && this.phase === 'dispatching') {
      this.carPilot.update(dt, this.tourCar);
      this.tourCar.tourInput = this.carPilot.input;
      if (this.carPilot.finished) {
        this.tourCar.tourInput = null;
        this.carPilot = null;
        this.carReady = true;
        this.onCarArrived();
      }
    } else if (this.tourCar && this.carPilot && this.phase === 'journey' && this.activeTransport === 'car') {
      this.carPilot.update(dt, this.tourCar);
      this.tourCar.tourInput = this.carPilot.input;
      if (this.carPilot.finished) {
        this.tourCar.tourInput = null;
        this.carPilot = null;
        this.phase = 'arrived';
        this.d.vehicles.disembarkTour();
        this.ui.showStatus(bn.tour.arrived, 0);
        void this.d.voice.speakText(bn.tour.arrived);
      }
    }
  }

  /** Called after vehicle and world updates; detects boarding, arrival, and draws the service marker. */
  update(_dt: number): void {
    const ridingCar = !!this.tourCar && this.d.vehicles.driver === this.tourCar;
    const ridingHeli = !!this.tourHeli && this.d.helis.pilot === this.tourHeli;

    if (this.phase !== 'journey' && this.phase !== 'arrived' && this.phase !== 'choosing' && (ridingCar || ridingHeli)) {
      this.activeTransport = ridingHeli ? 'heli' : 'car';
      if (ridingHeli && this.tourHeli) this.d.helis.clearTourTarget(this.tourHeli);
      this.phase = 'choosing';
      this.ui.showDestinations(this.destinations);
      this.ui.showStatus(bn.tour.chooseDestination, 4);
      void this.d.voice.speakText(bn.tour.chooseDestination);
    }

    if (this.phase === 'dispatching' && this.tourHeli && !this.heliReady) {
      const t = this.tourHeli.telemetry();
      const dist = Math.hypot(t.x - this.dispatchHeliTarget.x, t.z - this.dispatchHeliTarget.z);
      if (dist < 4.0 && t.agl < 1.45 && t.speed < 2.6 && Math.abs(t.vz) < 1.4) {
        this.heliReady = true;
        this.onHeliArrived();
      }
    }

    if (this.phase === 'journey' && this.activeTransport === 'heli' && this.tourHeli && this.currentHeliTarget) {
      const t = this.tourHeli.telemetry();
      const dist = Math.hypot(t.x - this.currentHeliTarget.x, t.z - this.currentHeliTarget.z);
      if (dist < 4.0 && t.agl < 1.45 && t.speed < 2.6 && Math.abs(t.vz) < 1.4) {
        this.phase = 'arrived';
        this.d.helis.clearTourTarget(this.tourHeli);
        this.tourHeli.setTourParked(true);
        this.d.helis.disembarkTour();
        this.ui.showStatus(bn.tour.arrived, 0);
        void this.d.voice.speakText(bn.tour.arrived);
      }
    }

    // If the player leaves a vehicle mid-journey, stop the road autopilot and keep the service vehicle parked.
    if (this.phase === 'journey' && this.activeTransport === 'car' && this.tourCar && this.d.vehicles.driver !== this.tourCar) {
      this.tourCar.tourInput = null;
      this.carPilot = null;
      this.phase = 'arrived';
    }
    if (this.phase === 'journey' && this.activeTransport === 'heli' && this.tourHeli && this.d.helis.pilot !== this.tourHeli) {
      this.d.helis.clearTourTarget(this.tourHeli);
      this.phase = 'arrived';
    }

    if (this.phase === 'dispatching' && this.carReady && this.heliReady && !this.announcedBoth) {
      this.announcedBoth = true;
      this.phase = 'ready';
      this.ui.showStatus(bn.tour.bothArrived, 8);
      void this.d.voice.speakText(bn.tour.bothArrived);
    }

    if (!ridingCar && !ridingHeli && (this.phase === 'dispatching' || this.phase === 'ready')) {
      // Override the normal vehicle marker only when a Tour vehicle is actually visible on screen.
      // In idle/arrived states, preserve the regular car/helicopter marker system.
      this.updateTourMarker();
    } else if (ridingCar || ridingHeli || this.phase === 'choosing' || this.phase === 'journey') {
      this.d.hud.hideMarker();
    }
  }

  dispose(): void {
    this.ui.dispose();
    if (this.tourCar && this.d.vehicles.driver !== this.tourCar) this.d.vehicles.removeTourVehicle(this.tourCar);
    if (this.tourHeli && this.d.helis.pilot !== this.tourHeli) this.d.helis.removeTour(this.tourHeli);
  }

  private requestTour(): void {
    if (this.phase === 'choosing') {
      this.ui.showDestinations(this.destinations);
      return;
    }
    if (this.d.vehicles.driver || this.d.helis.pilot) {
      this.ui.showStatus(bn.tour.alreadyActive, 6);
      void this.d.voice.speakText(bn.tour.alreadyActive);
      return;
    }
    if (this.phase === 'dispatching' || this.phase === 'ready' || this.phase === 'journey') {
      this.ui.showStatus(bn.tour.alreadyActive, 6);
      void this.d.voice.speakText(bn.tour.alreadyActive);
      return;
    }

    this.clearPreviousTour();
    this.phase = 'dispatching';
    this.carReady = false;
    this.heliReady = false;
    this.announcedCar = false;
    this.announcedHeli = false;
    this.announcedBoth = false;
    this.activeTransport = null;
    this.ui.showStatus(bn.tour.requesting, 0);
    void this.d.voice.speakText(bn.tour.waiting);
    this.dispatchVehicles();
  }

  private dispatchVehicles(): void {
    const player = this.d.player.getWorldPosition(this.tmp);
    const landing = this.findLandingSpot(player.x, player.z, 36);
    this.dispatchHeliTarget.set(landing.x, landing.y + 1.65, landing.z);

    // Bring the helicopter from nearby airspace; it climbs to safe AGL, flies over, then descends near the player.
    const sx = Math.max(-4700, Math.min(4700, player.x + 95));
    const sz = Math.max(-4700, Math.min(4700, player.z - 70));
    const sy = this.d.world.terrain.heightAt(sx, sz) + 30;
    this.tourHeli = this.d.helis.spawnTour(new THREE.Vector3(sx, sy, sz), Math.PI);
    this.d.helis.setTourTarget(this.tourHeli, this.dispatchHeliTarget);

    // The Tour car starts on an actual nearby road and follows the existing spline/junction network.
    const spot = this.roadPlanner.nearestSpot(player.x, player.z, 4800);
    if (!spot) {
      this.carReady = false;
      this.ui.showStatus(bn.tour.roadUnavailable, 8);
      void this.d.voice.speakText(bn.tour.roadUnavailable);
      return;
    }
    const road = this.d.roads.roads[spot.roadId];
    let dir: 1 | -1;
    let startS: number;
    const offset = 115;
    if (spot.s > offset + 12) { dir = 1; startS = spot.s - offset; }
    else if (road.length - spot.s > offset + 12) { dir = -1; startS = spot.s + offset; }
    else if (spot.s >= road.length / 2) { dir = -1; startS = Math.max(0, spot.s - 65); }
    else { dir = 1; startS = Math.min(road.length, spot.s + 65); }

    const spawnSpot = { roadId: spot.roadId, s: startS };
    const spawnPt = this.roadPlanner.lanePoint(spawnSpot, dir);
    const endPt = this.roadPlanner.lanePoint({ roadId: spot.roadId, s: spot.s }, dir);
    const route = this.roadPlanner.buildRoute(spawnPt.x, spawnPt.z, endPt.x, endPt.z, 500);
    if (!route || route.length < 2) {
      // If the current section has no junction metadata, keep the dispatch local on its own road.
      const fallback = this.roadPlanner.buildRoute(spawnPt.x, spawnPt.z, endPt.x, endPt.z, 1800);
      if (!fallback || fallback.length < 2) {
        this.carReady = false;
        this.ui.showStatus(bn.tour.roadUnavailable, 8);
        void this.d.voice.speakText(bn.tour.roadUnavailable);
        return;
      }
      this.carPilot = new TourRoadPilot(fallback, () => this.d.vehicles.vehicles);
    } else this.carPilot = new TourRoadPilot(route, () => this.d.vehicles.vehicles);

    this.tourCar = this.d.vehicles.spawnTourVehicle(JEEP, new THREE.Vector3(spawnPt.x, spawnPt.y + 1.1, spawnPt.z), Math.atan2(spawnPt.hx, spawnPt.hz), 0xffc928);
    this.tourCar.tourInput = this.carPilot.input;
  }

  private selectDestination(id: string): void {
    const choice = this.destinations.find((d) => d.id === id);
    if (!choice) return;
    this.phase = 'journey';
    this.ui.hideDestinations();
    this.ui.showStatus(bn.tour.enRoute, 8);
    void this.d.voice.speakText(bn.tour.enRoute);

    if (this.activeTransport === 'heli' && this.tourHeli && this.d.helis.pilot === this.tourHeli) {
      const landing = this.findLandingSpot(choice.x, choice.z, 150);
      this.currentHeliTarget = new THREE.Vector3(landing.x, landing.y + 1.65, landing.z);
      this.d.helis.setTourTarget(this.tourHeli, this.currentHeliTarget);
      return;
    }

    if (this.activeTransport === 'car' && this.tourCar && this.d.vehicles.driver === this.tourCar) {
      const current = this.tourCar.getWorldPosition(this.tmp);
      const roadAccess = this.roadPlanner.nearestSpot(choice.x, choice.z, 3500);
      // Do not claim the car has reached a destination that is kilometres away from any road.
      const maxDestinationAccess = choice.kind === 'nature' ? 520 : 300;
      const route = roadAccess && roadAccess.distance <= maxDestinationAccess
        ? this.roadPlanner.buildRoute(current.x, current.z, roadAccess.x, roadAccess.z, 3500)
        : null;
      if (!route || route.length < 2) {
        this.phase = 'choosing';
        this.ui.showStatus(bn.tour.roadUnavailable, 0);
        void this.d.voice.speakText(bn.tour.roadUnavailable);
        this.ui.showDestinations(this.destinations);
        return;
      }
      this.carPilot = new TourRoadPilot(route, () => this.d.vehicles.vehicles);
      this.tourCar.tourInput = this.carPilot.input;
      return;
    }

    this.phase = 'ready';
    this.ui.showStatus(bn.tour.alreadyActive, 6);
  }

  private onCarArrived(): void {
    if (this.announcedCar) return;
    this.announcedCar = true;
    this.ui.showStatus(bn.tour.carArrived, 7);
    void this.d.voice.speakText(bn.tour.carArrived);
  }

  private onHeliArrived(): void {
    if (this.announcedHeli) return;
    this.announcedHeli = true;
    if (this.tourHeli) {
      this.d.helis.clearTourTarget(this.tourHeli);
      this.tourHeli.setTourParked(true);
    }
    this.ui.showStatus(bn.tour.heliArrived, 7);
    void this.d.voice.speakText(bn.tour.heliArrived);
  }

  private updateTourMarker(): boolean {
    const p = this.d.player.getWorldPosition(this.tmp2);
    let bestDistance = Infinity;
    let best: { pos: THREE.Vector3; icon: 'tour-car' | 'tour-heli' } | null = null;
    if (this.tourCar && this.tourCar.driver !== 'player') {
      this.tourCar.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - p.x, this.tmp.z - p.z);
      if (dist < 500 && dist < bestDistance) {
        bestDistance = dist;
        best = { pos: this.tmp.clone().add(new THREE.Vector3(0, 2.7, 0)), icon: 'tour-car' };
      }
    }
    if (this.tourHeli && this.d.helis.pilot !== this.tourHeli) {
      this.tourHeli.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - p.x, this.tmp.z - p.z);
      if (dist < 600 && dist < bestDistance) {
        bestDistance = dist;
        best = { pos: this.tmp.clone().add(new THREE.Vector3(0, 4.2, 0)), icon: 'tour-heli' };
      }
    }
    if (!best) return false;
    const screen = this.d.project(best.pos);
    if (!screen || screen.x < 8 || screen.y < 8 || screen.x > this.d.container.clientWidth - 8 || screen.y > this.d.container.clientHeight - 8) return false;
    this.d.hud.setMarker(screen, best.icon);
    return true;
  }

  private clearPreviousTour(): void {
    if (this.tourCar && this.d.vehicles.driver !== this.tourCar) this.d.vehicles.removeTourVehicle(this.tourCar);
    if (this.tourHeli && this.d.helis.pilot !== this.tourHeli) this.d.helis.removeTour(this.tourHeli);
    this.tourCar = null;
    this.tourHeli = null;
    this.carPilot = null;
    this.currentHeliTarget = null;
    this.d.vehicles.vehicles.forEach((v) => { if (v.tourVehicle) v.tourInput = null; });
  }

  private makeDestinations(): TourDestination[] {
    const sites = this.d.world.terrain.sites;
    const safariRegion = WORLD_REGIONS.find((r) => r.kind === 'safari');
    const c = { x: safariRegion?.x ?? 0, z: safariRegion?.z ?? 0 };
    const p = (id: string, label: string, detail: string, x: number, z: number, kind: TourDestination['kind']): TourDestination => ({ id, label, detail, x, z, kind });
    const snapToRoad = (x: number, z: number, maxDistance = 1800): { x: number; z: number } => {
      const spot = this.roadPlanner.nearestSpot(x, z, maxDistance);
      return spot ? { x: spot.x, z: spot.z } : { x, z };
    };

    // One tour stop per named 2 km district. Prefer a road physically inside that district so the
    // chauffeur ends on the real road network; only use a neighbouring road when the district has none.
    const regionStops = WORLD_REGIONS.map((region) => {
      let spot = this.d.roads.nearestSpotInBounds(region.x, region.z, region, 1800);
      if (!spot) spot = this.roadPlanner.nearestSpot(region.x, region.z, 5000);
      const target = spot ? { x: spot.x, z: spot.z } : snapToRoad(region.x, region.z, 5000);
      const kind: TourDestination['kind'] = new Set<string>(['mountain', 'forest', 'delta', 'coast', 'wetland', 'safari']).has(region.kind) ? 'nature' : 'city';
      return p(`region-${region.id}`, bn.worldRegions.names[region.id] ?? region.id, bn.worldRegions.details[region.kind] ?? '', target.x, target.z, kind);
    });

    const suburb = snapToRoad(sites[1]?.x ?? -2100, sites[1]?.z ?? -1300);
    const industrial = snapToRoad(sites[2]?.x ?? 2300, sites[2]?.z ?? 700);
    const forest = snapToRoad(c.x + 310, c.z + 260, 2500);
    const safari = snapToRoad(c.x, c.z, 2500);
    const hills = snapToRoad(0, -4100, 5000);
    return [
      ...regionStops,
      // Named landmarks stay in the Tour list even if the generated 2 km district grid moves with the map seed.
      p('suburb', bn.tour.destinations.suburb, bn.tour.details.suburb, suburb.x, suburb.z, 'city'),
      p('industrial', bn.tour.destinations.industrial, bn.tour.details.industry, industrial.x, industrial.z, 'city'),
      p('forest', bn.tour.destinations.forest, bn.tour.details.forest, forest.x, forest.z, 'nature'),
      p('safari', bn.tour.destinations.safari, bn.tour.details.safari, safari.x, safari.z, 'nature'),
      p('hills', bn.tour.destinations.hills, bn.tour.details.hills, hills.x, hills.z, 'nature'),
    ];
  }

  private findLandingSpot(x: number, z: number, radius: number): { x: number; y: number; z: number } {
    const candidates: { x: number; z: number; rank: number }[] = [];
    for (const r of [0, 12, 24, 38, 54, 74, 96, radius]) {
      const samples = r === 0 ? 1 : 16;
      for (let i = 0; i < samples; i++) {
        const angle = samples === 1 ? 0 : (i / samples) * Math.PI * 2;
        const cx = Math.max(-4750, Math.min(4750, x + Math.cos(angle) * r));
        const cz = Math.max(-4750, Math.min(4750, z + Math.sin(angle) * r));
        candidates.push({ x: cx, z: cz, rank: r + (i % 4) * 0.1 });
      }
    }
    candidates.sort((a, b) => a.rank - b.rank);
    let fallback = { x, y: this.d.world.terrain.heightAt(x, z), z };
    for (const candidate of candidates) {
      this.d.world.terrain.sample(candidate.x, candidate.z, this.terrainSample);
      const sample = this.terrainSample;
      if (!Number.isNaN(sample.water) && sample.h < sample.water + 1.8) continue;
      if (sample.h < 2 || sample.h > 430) continue;
      const slopeX = Math.abs(this.d.world.terrain.heightAt(candidate.x + 6, candidate.z) - this.d.world.terrain.heightAt(candidate.x - 6, candidate.z)) / 12;
      const slopeZ = Math.abs(this.d.world.terrain.heightAt(candidate.x, candidate.z + 6) - this.d.world.terrain.heightAt(candidate.x, candidate.z - 6)) / 12;
      if (Math.max(slopeX, slopeZ) > 0.13) continue;
      const road = this.d.world.terrain.roads.surfaceAt(candidate.x, candidate.z);
      const y = sample.h;
      fallback = { x: candidate.x, y, z: candidate.z };
      if (road === 0) return fallback;
    }
    return fallback;
  }
}
