import * as THREE from 'three';
import { CameraController } from '../camera/CameraController';
import { OrbitCamera } from '../camera/OrbitCamera';
import { Player } from '../characters';
import { HelicopterManager } from '../aircraft';
import { PolicePursuitManager } from '../people/PolicePursuitManager';
import { TourManager } from '../tour/TourManager';
import { HelicopterBombs } from '../combat/HelicopterBombs';
import { HelicopterHUD } from '../ui/HelicopterHUD';
import { BridgeBuilder, BridgePhysics, RoadDebug } from '../roads';
import { CombatSystem } from '../combat';
import { CityPlan, ZONE_COLOR } from '../city/CityPlan';
import { WORLD_ZONE_COLOR, getWorldZoneAt } from '../city/WorldZones';
import { RailDebug, RailNetwork } from '../rail';
import { bn } from '../i18n';
import { Minimap, type MapMarker, type MapState } from '../ui/Minimap';
import { VehicleHUD } from '../ui/VehicleHUD';
import { VehicleManager } from '../vehicles';
import { PeopleManager } from '../people';
import { RoadGraph, TrafficManager } from '../traffic';
import { InputManager } from '../input/InputManager';
import { VoiceManager } from '../audio/VoiceManager';
import { Environment } from '../environment';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { DebugPanel } from '../ui/DebugPanel';
import { HUD } from '../ui/HUD';
import { Subtitles } from '../ui/Subtitles';
import { WorldManager } from '../world/WorldManager';
import { Config } from './Config';
import { EventBus, type Bus, type EngineEvents } from './EventBus';
import { GameLoop } from './GameLoop';
import { Time } from './Time';

/**
 * Engine bootstrap: creates every system and wires them together.
 * Systems talk through the EventBus; the Engine only decides the update ORDER.
 */
export class Engine {
  readonly time = new Time();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: InputManager;
  readonly cameraController: CameraController;
  readonly world: WorldManager;
  readonly player: Player;
  readonly vehicles: VehicleManager;
  readonly helis: HelicopterManager;
  /** The tour: call a helicopter / car, ride to any city area. */
  readonly tour: TourManager;
  /** Police vehicles pursue the player when the wanted level rises. */
  readonly police: PolicePursuitManager;
  /** Limited visual pool of helicopter-dropped gameplay bombs. */
  readonly helicopterBombs: HelicopterBombs;
  /** STAGE 9: people on foot, AI traffic (every vehicle has a driver). */
  readonly people: PeopleManager;
  readonly traffic: TrafficManager;
  private minimap: Minimap;
  /** STAGE 10A: which area of the city is for what (data only, no buildings yet). */
  readonly cityPlan: CityPlan;
  /** Guns: shooting, wanted level, police. The player cannot die. */
  readonly combat: CombatSystem;
  /** STAGE 6 */
  private bridgeVisuals: BridgeBuilder;
  private bridgePhysics: BridgePhysics;
  private roadDebug: RoadDebug;
  /** STAGE 11B: railway paths + station areas (plan only). */
  readonly rail: RailNetwork;
  private railDebug: RailDebug;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private orbit: OrbitCamera;
  private tmpPoliceFocus = new THREE.Vector3();
  private tmpVec = new THREE.Vector3();
  readonly environment: Environment;
  private debug: DebugPanel;
  private hud: HUD;
  readonly voice: VoiceManager;
  private loop: GameLoop;

  static async create(container: HTMLElement): Promise<Engine> {
    const bus = new EventBus<EngineEvents>();
    const physics = await PhysicsWorld.create(bus); // loads Rapier WASM
    return new Engine(container, bus, physics);
  }

  private constructor(
    private container: HTMLElement,
    readonly bus: Bus,
    readonly physics: PhysicsWorld,
  ) {
    // --- rendering ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.environment = new Environment(this.scene); // sky, sun + shadows, fog

    const c = Config.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, container.clientWidth / container.clientHeight, c.near, c.far);
    this.camera.position.set(c.startPosition.x, c.startPosition.y, c.startPosition.z);
    this.scene.add(this.camera);

    // --- systems ---
    this.input = new InputManager(this.renderer.domElement, bus);
    this.cameraController = new CameraController(this.camera, this.input);
    this.world = new WorldManager(this.scene, bus, physics, this.environment.skyUniforms);

    // --- roads & bridges (STAGE 6): the road network lives in TerrainGenerator; here are the bridge visuals/colliders and the debug overlay ---
    const roads = this.world.terrain.roads;
    this.bridgeVisuals = new BridgeBuilder(roads.bridges, roads.roads, this.world.terrain);
    this.world.root.add(this.bridgeVisuals.group);
    this.bridgePhysics = new BridgePhysics(physics, this.world.origin, roads.bridges, roads.roads);
    this.roadDebug = new RoadDebug(roads);
    this.world.root.add(this.roadDebug.group);
    this.rail = new RailNetwork(this.world.terrain);
    this.railDebug = new RailDebug(this.rail);
    this.world.root.add(this.railDebug.group);

    // --- player (third-person) ---
    const spawn = new THREE.Vector3(0, this.world.terrain.heightAt(0, 0) + Config.player.height / 2 + 0.1, 0);
    this.player = new Player(
      {
        physics,
        terrain: this.world.terrain,
        terrainPhysics: this.world.terrainPhysics,
        origin: this.world.origin,
        scene: this.scene,
        bus,
        input: this.input,
        getCameraYaw: () => this.orbit.yaw,
      },
      spawn,
    );
    this.orbit = new OrbitCamera(this.camera, this.input, this.player, physics, this.world.terrain, this.world.origin);
    this.cameraController.setOrbit(this.orbit);
    this.cameraController.useOrbit();

    this.debug = new DebugPanel(container);
    this.hud = new HUD(container);
    this.hud.setLocked(this.input.gameplayActive);

    // --- vehicles: none are placed by hand any more. Every vehicle is created by TrafficManager WITH a driver. ---
    this.vehicles = new VehicleManager({
      vehicle: { physics, terrain: this.world.terrain, origin: this.world.origin, scene: this.scene, bus },
      terrainPhysics: this.world.terrainPhysics,
      input: this.input,
      player: this.player,
      orbit: this.orbit,
      hud: this.hud,
      vehicleHud: new VehicleHUD(container),
      project: this.project,
      onDriverEjected: (person, door) => this.people.adopt(person, door, 'flee'),
    });

    // --- people + traffic (STAGE 9) ---
    const graph = new RoadGraph(roads);
    this.people = new PeopleManager({ scene: this.scene, terrain: this.world.terrain, origin: this.world.origin, graph, vehicles: this.vehicles, player: this.player });
    this.traffic = new TrafficManager({ graph, vehicles: this.vehicles, people: this.people, player: this.player, terrainPhysics: this.world.terrainPhysics });

    // --- guns (left mouse = shoot, right mouse = aim, Q = next weapon) ---
    this.combat = new CombatSystem({
      scene: this.scene,
      camera: this.camera,
      input: this.input,
      physics,
      origin: this.world.origin,
      player: this.player,
      orbit: this.orbit,
      people: this.people,
      hud: this.hud,
      controlledWorld: (out) => {
        const heli = this.helis?.pilot;
        if (heli) return heli.getWorldPosition(out);
        const drv = this.vehicles.driver;
        return drv ? drv.getWorldPosition(out) : this.player.getWorldPosition(out);
      },
      controlledBody: () => this.helis?.pilot?.body ?? this.vehicles.driver?.body ?? this.player.body,
    });
    this.police = new PolicePursuitManager({
      graph, vehicles: this.vehicles, people: this.people, wanted: this.combat.wanted,
      terrainPhysics: this.world.terrainPhysics, terrain: this.world.terrain, player: this.player,
    });
    this.people.setCombat(this.combat.hooks);
    bus.on('origin:shift', ({ dx, dz }) => this.combat.shift(dx, dz));

    // --- helicopter (parked next to the spawn point; F to get in, H to start the engine) ---
    this.helis = new HelicopterManager({
      heli: { physics, terrain: this.world.terrain, origin: this.world.origin, scene: this.scene, bus },
      terrainPhysics: this.world.terrainPhysics,
      input: this.input,
      player: this.player,
      orbit: this.orbit,
      hud: this.hud,
      vehicles: this.vehicles,
      helicopterHud: new HelicopterHUD(container),
      project: this.project,
    });

    // --- the always-on site map (top-right) ---
    this.cityPlan = new CityPlan(this.world.terrain.sites);
    this.minimap = new Minimap(container, this.world.seed.value, this.world.terrain.sites, this.cityPlan, this.rail);
    this.helis.spawn(new THREE.Vector3(-24, this.world.terrain.heightAt(-24, 8) + 1.5, 8), 0);
    this.voice = new VoiceManager(new Subtitles(container));
    this.helicopterBombs = new HelicopterBombs({ scene: this.scene, input: this.input, origin: this.world.origin, terrain: this.world.terrain, people: this.people, vehicles: this.vehicles, effects: this.combat.effects, getPilot: () => this.helis.pilot });
    this.police.setHelicopters(this.helis);
    this.tour = new TourManager({
      container,
      player: this.player,
      world: this.world,
      vehicles: this.vehicles,
      helis: this.helis,
      roads: graph,
      voice: this.voice,
      hud: this.hud,
      project: this.project,
    });
    bus.on('camera:locked', ({ locked }) => this.hud.setLocked(locked));

    window.addEventListener('resize', this.onResize);
    this.loop = new GameLoop(this.time, this.fixedUpdate, this.render);
  }

  start(): void {
    this.bus.emit('engine:ready', undefined);
    this.loop.start();
  }

  /** 60 Hz. Physics (and later vehicle/AI logic) only. */
  private fixedUpdate = (dt: number): void => {
    this.player.fixedUpdate(dt);
    this.traffic.fixedUpdate(dt);
    this.police.fixedUpdate(dt, this.controlledWorld(this.tmpPoliceFocus));
    this.tour.fixedUpdate(dt);
    this.vehicles.fixedUpdate(dt);
    this.helis.fixedUpdate(dt);
    this.physics.step();
    this.player.afterStep();
    this.vehicles.afterStep();
    this.helis.afterStep();
  };

  /** Once per rendered frame. Order matters: input -> camera -> world streaming -> draw. */
  private render = (dt: number, alpha: number): void => {
    if (this.input.wasPressed('F3')) this.debug.toggle();
    if (this.input.wasPressed('KeyM')) {
      this.voice.toggleMute();
      this.helis.setMuted(this.voice.isMuted);
      this.combat.setMuted(this.voice.isMuted);
    }
    if (this.input.wasPressed('Digit1')) this.world.terrainMaterials.setWireframe(!this.world.terrainMaterials.isWireframe);
    if (this.input.wasPressed('Digit2')) this.world.terrainMaterials.setLodColors(!this.world.terrainMaterials.isLodColors);
    if (this.input.wasPressed('Digit3')) this.roadDebug.toggle();
    if (this.input.wasPressed('Digit4')) this.railDebug.toggle();

    // V: switch between the player camera and the free-fly debug camera. T (free-fly): bring the player here.
    if (!this.helis.handleKeys()) this.vehicles.handleKeys();
    if (this.input.wasPressed('KeyV') && !this.vehicles.driver && !this.helis.pilot) this.toggleFreeFly();
    if (this.cameraController.isFreeFly && this.input.wasPressed('KeyT')) {
      this.world.origin.toWorld(this.camera.position, this.tmpVec);
      this.player.teleportTo(this.tmpVec);
      this.toggleFreeFly();
    }

    this.player.update(dt, alpha);
    this.vehicles.update(alpha, this.world.playerWorld);
    this.people.update(dt, this.world.playerWorld);
    this.traffic.update(dt, this.world.playerWorld);
    this.helis.update(dt, alpha, this.world.playerWorld);
    this.helicopterBombs.update(dt);
    this.combat.update(dt, this.player.active && !this.cameraController.isFreeFly && this.input.gameplayActive && this.player.ready && !this.player.swimming);
    this.police.update(dt, this.controlledWorld(this.tmpPoliceFocus), this.time.elapsed);
    this.tour.update(dt);
    this.cameraController.update(dt);
    this.world.update(dt, this.time.elapsed, this.camera, this.cameraController.isFreeFly);
    if (this.input.wasPressed('KeyN')) this.minimap.cycleZoom();
    this.minimap.update(dt, this.mapState());
    this.updateAreaLabel();
    this.bridgePhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.hud.setLoading(this.player.active && !this.player.inVehicle && !this.player.ready);
    this.environment.update(this.camera);

    this.debug.update(dt, () => ({
      fps: this.time.fps,
      frameMs: this.time.frameMs,
      fixedSteps: this.time.fixedSteps,
      world: this.world.playerWorld,
      origin: this.world.origin.origin,
      chunk: this.world.playerChunk,
      loadedChunks: this.world.chunks.loadedCount,
      pendingChunks: this.world.chunks.pendingCount,
      lodCounts: this.world.chunks.lodCounts(),
      physicsBodies: this.physics.bodyCount,
      physicsColliders: this.physics.colliderCount,
      rivers: this.world.terrain.rivers.stats.sources,
      riverKm: this.world.terrain.rivers.stats.lengthM / 1000,
      lakes: this.world.terrain.lakes.count,
      ponds: this.world.terrain.lakes.pondCount,
      waterfalls: this.world.terrain.rivers.stats.waterfalls,
      groundHeight: this.world.terrain.heightAt(this.world.playerWorld.x, this.world.playerWorld.z),
      wireframe: this.world.terrainMaterials.isWireframe,
      lodColors: this.world.terrainMaterials.isLodColors,
      cameraSpeed: this.cameraController.freeFly.speed,
      freeFly: this.cameraController.isFreeFly,
      playerState: this.player.state,
      playerSpeed: this.player.horizSpeed,
      waterDepth: this.player.waterDepth,
      highwayKm: this.world.terrain.roads.stats.highwayKm,
      localKm: this.world.terrain.roads.stats.localKm,
      bridges: this.world.terrain.roads.stats.bridges,
      culverts: this.world.terrain.roads.stats.culverts,
      junctions: this.world.terrain.roads.stats.junctions,
      surface: this.world.terrain.roads.surfaceAt(this.world.playerWorld.x, this.world.playerWorld.z),
      roadLines: this.roadDebug.visible,
      railLines: this.railDebug.visible,
      people: this.people.count,
      cars: this.vehicles.vehicles.length,
      aiCars: this.traffic.aiCount,
    }));

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  /** World position -> screen pixels, for the enter-icons. */
  private project = (world: THREE.Vector3): { x: number; y: number } | null => {
    this.world.origin.toLocal(world, this.tmpA);
    this.tmpA.project(this.camera);
    if (this.tmpA.z < -1 || this.tmpA.z > 1) return null;
    return { x: (this.tmpA.x * 0.5 + 0.5) * this.container.clientWidth, y: (-this.tmpA.y * 0.5 + 0.5) * this.container.clientHeight };
  };

  private controlledWorld(out: THREE.Vector3): THREE.Vector3 {
    const heli = this.helis?.pilot;
    if (heli) return heli.getWorldPosition(out);
    const vehicle = this.vehicles.driver;
    return vehicle ? vehicle.getWorldPosition(out) : this.player.getWorldPosition(out);
  }

  /** Everything the site map shows: where you are (on foot / in a car / in the helicopter) and the parked vehicles. */
  private mapState(): MapState {
    const toHeading = (fx: number, fz: number) => (((Math.atan2(fx, -fz) * 180) / Math.PI) + 360) % 360;
    const viewHeading = (((-this.orbit.yaw * 180) / Math.PI) % 360 + 360) % 360;
    let me: MapMarker;
    let view: number | null = null;
    const pilot = this.helis.pilot;
    const driver = this.vehicles.driver;
    if (pilot) {
      const t = pilot.telemetry();
      me = { x: t.x, z: t.z, heading: t.heading, kind: 'heli' };
    } else if (driver) {
      driver.getWorldPosition(this.tmpA);
      driver.forwardVector(this.tmpB);
      me = { x: this.tmpA.x, z: this.tmpA.z, heading: toHeading(this.tmpB.x, this.tmpB.z), kind: 'car' };
    } else if (this.cameraController.isFreeFly) {
      const p = this.world.playerWorld;
      const h = (((-this.cameraController.freeFly.yaw * 180) / Math.PI) % 360 + 360) % 360;
      me = { x: p.x, z: p.z, heading: h, kind: 'foot' };
      view = h;
    } else {
      this.player.getWorldPosition(this.tmpA);
      me = { x: this.tmpA.x, z: this.tmpA.z, heading: viewHeading, kind: 'foot' };
      view = viewHeading;
    }
    const others: MapMarker[] = [];
    for (const v of this.vehicles.vehicles) {
      if (v === driver) continue;
      v.getWorldPosition(this.tmpA);
      v.forwardVector(this.tmpB);
      others.push({ x: this.tmpA.x, z: this.tmpA.z, heading: toHeading(this.tmpB.x, this.tmpB.z), kind: 'car', color: v.policeVehicle ? '#ef4444' : `#${v.spec.look.body.toString(16).padStart(6, '0')}` });
    }
    for (const h of this.helis.helis) {
      if (h === pilot) continue;
      const t = h.telemetry();
      others.push({ x: t.x, z: t.z, heading: t.heading, kind: 'heli' });
    }
    return { me, viewHeading: view, others };
  }

  /** HUD chip: railway station area > planned city area > airport / seaport part > the world zone (the whole map has one). */
  private updateAreaLabel(): void {
    const p = this.world.playerWorld;
    const st = this.rail.stationAt(p.x, p.z);
    if (st) {
      this.hud.setArea({ key: `rail-${st.id}`, name: bn.rail.station[st.id] ?? st.id, kind: `${bn.rail.stationArea} · ${bn.rail.stationKind[st.kind]}`, color: '#ffffff' });
      return;
    }
    const a = this.cityPlan.areaAt(p.x, p.z);
    if (a) {
      this.hud.setArea({
        key: a.id,
        name: bn.city.area[a.id] ?? a.id,
        kind: `${bn.city.site[a.site]} · ${bn.city.zone[a.kind]}`,
        color: ZONE_COLOR[a.kind],
      });
      return;
    }
    const w = getWorldZoneAt(p.x, p.z);
    this.hud.setArea({
      key: w.area ? w.area.id : w.id,
      name: w.area ? bn.worldZones.facility[w.area.id] ?? w.area.id : bn.worldZones.names[w.id] ?? w.id,
      kind: w.area ? bn.worldZones.names[w.id] : bn.worldZones.kind[w.kind],
      color: WORLD_ZONE_COLOR[w.kind],
    });
  }

  private toggleFreeFly(): void {
    this.cameraController.toggle();
    this.player.active = !this.cameraController.isFreeFly;
  }

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.tour.dispose();
    this.police.dispose();
    this.helicopterBombs.dispose();
    this.input.dispose();
    for (const p of [...this.people.onFoot]) this.people.dispose(p);
    this.vehicles.dispose();
    this.helis.dispose();
    this.player.dispose();
    this.bridgePhysics.dispose();
    this.bridgeVisuals.dispose();
    this.roadDebug.dispose();
    this.railDebug.dispose();
    this.world.dispose();
    this.physics.dispose();
    this.renderer.dispose();
  }
}
