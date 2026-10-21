import * as THREE from 'three';
import { CameraController } from '../camera/CameraController';
import { OrbitCamera } from '../camera/OrbitCamera';
import { DriverCamera } from '../camera/DriverCamera';
import { Player } from '../characters';
import { HelicopterManager } from '../aircraft';
import { BoatManager, findWaterSpot } from '../boats';
import { PolicePursuitManager } from '../people/PolicePursuitManager';
import { TourManager } from '../tour/TourManager';
import { HelicopterBombs } from '../combat/HelicopterBombs';
import { Explosions } from '../combat/Explosions';
import { TankCannon } from '../combat/TankCannon';
import { TreeDestruction } from '../vegetation/TreeDestruction';
import { BusStops } from '../traffic/BusStops';
import { BirdManager } from '../birds';
import { AnimalManager } from '../animals';
import { HelicopterHUD } from '../ui/HelicopterHUD';
import { BoatHUD } from '../ui/BoatHUD';
import { BridgeBuilder, BridgePhysics, RoadDebug } from '../roads';
import { CombatSystem } from '../combat';
import { CityPlan, ZONE_COLOR } from '../city/CityPlan';
import { getWorldZoneAt, worldZoneHitColor } from '../city/WorldZones';
import { ENGINEERING_BY_ID } from '../city/EngineeringZones';
import { RailDebug, RailPhysics, type RailNetwork } from '../rail';
import { PortPhysics } from '../port';
import { AirportManager } from '../airport';
import { AgroManager } from '../agro/AgroManager';
import { SignalLayer, StationBoard, TrainAnnouncer, TrainContacts, TrainLayer, TrainManager, TrainPhysics, formatBoard, playerObb, vehicleObb, type TrainEntity } from '../trains';
import { bn } from '../i18n';
import { MALL_DOORS } from '../mall/MallSite';
import { ParkingLots } from '../parking/ParkingLots';
import { EVLAB_SLOTS, START_LOT_POS, lotToWorld, lotYaw } from '../parking/ParkingSite';
import { MallManager, loadCatalog, type Catalog } from '../mall';
import { EVLabManager } from '../evlab';
import { EngineeringBoundary } from '../zones';
import { LibraryManager } from '../library';
import { BuildingManager, PlacedBuildings, setBuildingTextureQuality } from '../buildings';
import { InfraManager } from '../engineering/InfraManager';
import { Minimap, type MapMarker, type MapState } from '../ui/Minimap';
import { VehicleHUD } from '../ui/VehicleHUD';
import { type Vehicle, VehicleManager, SEDAN, JEEP, HYPERCAR, EVHYPAR, EVBIKE, BIKE, RICKSHAW, AUTO, BUS, SPECS } from '../vehicles';
import { VehicleModel } from '../vehicles/VehicleModel';
import { PeopleManager, PersonModel, ENGINEER_LOOK } from '../people';
import { RoadGraph, TrafficLightLayer, TrafficManager, TrafficSignals } from '../traffic';
import { Economy } from '../economy/Economy';
import { GoldConfig } from '../economy/Gold';
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


/** Minimap marker size per vehicle kind. */
function mapSize(kind: string): { len?: number; wide?: number } {
  switch (kind) {
    case 'bike':
    case 'evbike': return { len: 0.6, wide: 0.45 };
    case 'rickshaw': return { len: 0.75, wide: 0.6 };
    case 'auto': return { len: 0.8, wide: 0.8 };
    case 'bus': return { len: 1.8, wide: 1.1 };
    case 'tank': return { len: 1.4, wide: 1.4 };
    default: return {};
  }
}

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
  /** Speedboats floating on the sea, lakes and rivers (F to get in). */
  readonly boats: BoatManager;
  /** The tour: call a helicopter / car, ride to any city area. */
  readonly tour: TourManager;
  /** Police vehicles pursue the player when the wanted level rises. */
  readonly police: PolicePursuitManager;
  /** Limited visual pool of helicopter-dropped gameplay bombs. */
  readonly helicopterBombs: HelicopterBombs;
  /** STAGE 9: people on foot, AI traffic (every vehicle has a driver). */
  readonly people: PeopleManager;
  readonly traffic: TrafficManager;
  /** Traffic signals on every road junction (AI cars stop at red; the player is fined Gold for running a red light). */
  readonly trafficSignals: TrafficSignals;
  private trafficLights: TrafficLightLayer;
  /** Gold: 10,000 at the start; fines for red lights and traffic accidents, a gift for killing a criminal. */
  readonly economy: Economy;
  private redLightPrev = { x: 0, z: 0, ok: false };
  private redLightP = new THREE.Vector3();
  private redLightF = new THREE.Vector3();
  private crashA = new THREE.Vector3();
  private crashB = new THREE.Vector3();
  /** Bus stops along the city streets (shelters, minimap markers, buses halt there). */
  readonly busStops: BusStops;
  /** Explosions, fire, smoke, flying vehicle parts. */
  readonly explosions: Explosions;
  /** The war tank's cannon. */
  readonly tankCannon: TankCannon;
  /** Felled trees (tank, blasts). */
  readonly treeDestruction: TreeDestruction;
  /** Flocks of birds wandering over the world around the player. */
  readonly birds: BirdManager;
  /** Wildlife: deer herds, tigers / lions hunting them, fish schools. L = go to the safari park. */
  readonly animals: AnimalManager;
  /** The start point (the mall doorway, world x / z) and the unit vector pointing out of the mall. */
  readonly startPoint: { x: number; z: number; ux: number; uz: number };
  /** City Mall next to the spawn point: walk in and shop (products open the live shop in a new tab). */
  readonly mall: MallManager;
  /** All the parking around the mall: angled lot + entry road/start apron + EVLAB fleet lot across F4, the front row and the side lot on the mall side. No signboards. */
  readonly parking: ParkingLots;
  /** EVLab research campus (fenced, always standing on its big level plot west of the F4 road). */
  readonly evlab: EVLabManager;
  /** Prototype fence around every engineering area (no gates). */
  readonly engBoundary: EngineeringBoundary;
  /** City Library south of the F7 road (the open field next to the spawn crossing, west of the railway viaduct): walk in and look around. */
  readonly library: LibraryManager;
  /** PROTOTYPE building: the police station (thana) on the field south of F6, west of F5 (west of the spawn crossing). */
  readonly protoBuilding: BuildingManager;
  /** All the other building models, each at its spot (position only for now, see src/buildings/Placements.ts). */
  readonly placedBuildings: PlacedBuildings;
  /** SWTP (water treatment) + STP (sewage treatment) plants with their narrated tour (Y). */
  readonly infra: InfraManager;
  private infraFreeFly = false;
  private mapStops: { x: number; z: number }[] = [];
  private minimap: Minimap;
  /** STAGE 10A: which area of the city is for what (data only, no buildings yet). */
  readonly cityPlan: CityPlan;
  /** Guns: shooting, wanted level, police. The player cannot die. */
  readonly combat: CombatSystem;
  /** STAGE 6 */
  private bridgeVisuals: BridgeBuilder;
  private bridgePhysics: BridgePhysics;
  private roadDebug: RoadDebug;
  private railPhysics: RailPhysics;
  /** STAGE 14: colliders of the sea port structures (cranes, containers, ships, tanks ...). */
  private portPhysics: PortPhysics;
  /** Airport in the north-east (runway, terminal, hangars, tower) on its own levelled pad. */
  readonly airport: AirportManager;
  /** EV Agro Research Institute (west farmland, ~3 km from the spawn): 2-floor institute + research field. K = go there. */
  readonly agro: AgroManager;

  /** STAGE 11B: railway paths + station areas (plan only). */
  readonly rail: RailNetwork;
  private railDebug: RailDebug;
  /** STAGE 14 / 5B.1: trains (simulated all the time, a 3D view only near the player). */
  private trainLayer: TrainLayer;
  readonly trains: TrainManager;
  /** STAGE 14 / 5B.2: train colliders (Rapier, near the player), overlap check with the player and vehicles, no damage. */
  private trainPhysics: TrainPhysics;
  private trainContacts: TrainContacts;
  private trainEntities: TrainEntity[] = [];
  /** STAGE 15 / Step 6: signals you see, the station board on the HUD, Bangla station announcements. */
  private signalLayer: SignalLayer;
  private trainBoard: StationBoard;
  private trainAnnouncer: TrainAnnouncer;
  private vehicleIds = new WeakMap<object, number>();
  private nextVehicleId = 1;
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
    // Rapier WASM, the Bangla fonts (the mall's canvas signs need them) and the shop catalog (or demo data) are independent: load them together
    const [physics, , , catalog] = await Promise.all([
      PhysicsWorld.create(bus),
      document.fonts.load('700 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined),
      document.fonts.load('500 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined),
      loadCatalog(),
    ]);
    return new Engine(container, bus, physics, catalog);
  }

  private constructor(
    private container: HTMLElement,
    readonly bus: Bus,
    readonly physics: PhysicsWorld,
    catalog: Catalog,
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
    this.rail = this.world.terrain.rail;
    this.railDebug = new RailDebug(this.rail);
    this.railPhysics = new RailPhysics(physics, this.world.origin, this.rail);
    this.portPhysics = new PortPhysics(physics, this.world.origin);
    this.world.root.add(this.railDebug.group);
    this.trainLayer = new TrainLayer(this.world.root);
    this.trains = new TrainManager(this.rail, this.trainLayer);
    this.trainPhysics = new TrainPhysics(physics, this.world.origin, this.trains);
    this.trainContacts = new TrainContacts(this.trains, (h) => bus.emit('train:overlap', h));
    this.signalLayer = new SignalLayer(this.world.root, this.trains.fleet);
    this.trainBoard = new StationBoard(this.trains.fleet, this.rail);

    // --- player (third-person) ---
    // START POINT = the apron (entry road) between the two start-side lots, across the F4 road from the City Mall's west door: the player stands there, the camera
    // behind him, and looks over the road at the mall entrance. (ux, uz) = the view direction (towards the door). The parked start fleet
    // waits in the big EVLAB lot beside it (see below).
    {
      const door = MALL_DOORS.filter((dr) => dr.side === -1)[0] ?? MALL_DOORS[0];
      const p = lotToWorld(START_LOT_POS.s, START_LOT_POS.n);
      const len = Math.hypot(door.x - p.x, door.z - p.z) || 1;
      this.startPoint = { x: p.x, z: p.z, ux: (door.x - p.x) / len, uz: (door.z - p.z) / len };
    }
    const spawn = new THREE.Vector3(this.startPoint.x, this.world.terrain.heightAt(this.startPoint.x, this.startPoint.z) + Config.player.height / 2 + 0.1, this.startPoint.z);
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
    this.cameraController.setDriverCamera(new DriverCamera(this.camera, this.input, () => this.vehicles.driver));
    // START VIEW: the camera stands behind the player on the apron and looks over F4 at the mall's west door
    this.orbit.yaw = Math.atan2(-this.startPoint.ux, -this.startPoint.uz);

    // --- parking lots (asphalt, bay lines; no signboards) ---
    this.parking = new ParkingLots({ root: this.world.root, terrain: this.world.terrain });

    // --- City Mall (always standing there when the game starts) ---
    this.mall = new MallManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      camera: this.camera,
      input: this.input,
      dom: this.renderer.domElement,
      container,
      catalog,
      playerWorld: (out) => this.player.getWorldPosition(out),
      onFoot: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.helis.pilot && !this.boats.skipper,
    });

    // --- EVLab research campus (always standing there when the game starts) ---
    this.evlab = new EVLabManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- engineering areas: prototype boundary fence (closed all round; open only where a public road crosses) ---
    this.engBoundary = new EngineeringBoundary({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- City Library (always standing there when the game starts) ---
    this.library = new LibraryManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
      onFoot: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.helis.pilot && !this.boats.skipper,
    });

    // --- Prototype building: police station (always standing there when the game starts) ---
    setBuildingTextureQuality(this.renderer);
    this.protoBuilding = new BuildingManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    this.placedBuildings = new PlacedBuildings({
      root: this.world.root,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- Airport (north-east; the model is hidden when the player is far away) ---
    this.airport = new AirportManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- EV Agro Research Institute (west farmland; hidden when the player is far away) ---
    this.agro = new AgroManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      camera: this.camera,
      input: this.input,
      dom: this.renderer.domElement,
      container,
      playerWorld: (out) => this.player.getWorldPosition(out),
      teleport: (w) => this.player.teleportTo(w),
      onFoot: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.helis.pilot && !this.boats.skipper,
    });

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
    this.busStops = new BusStops({ scene: this.scene, origin: this.world.origin, terrain: this.world.terrain, graph, sites: this.world.terrain.sites });
    this.trafficSignals = new TrafficSignals(graph);
    this.trafficLights = new TrafficLightLayer(this.world.root, this.trafficSignals);
    this.traffic = new TrafficManager({ graph, plan: new CityPlan(this.world.terrain.sites), vehicles: this.vehicles, people: this.people, player: this.player, terrainPhysics: this.world.terrainPhysics, stops: this.busStops, signals: this.trafficSignals });
    this.vehicles.setPeople(this.people);
    // --- Gold economy: accidents (vehicle crash / run over people) are fined, killing a criminal is rewarded ---
    this.economy = new Economy(container);
    this.vehicles.onPersonHit = (p, died) => this.economy.personHit(p, died);
    this.vehicles.setCrashHook((v, dv, speed) => this.onVehicleCrash(v, dv, speed));
    this.people.onCriminalKilled = () => this.economy.criminalKilled();
    this.mapStops = this.busStops.stops.filter((b) => b.dir === 1);

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
      vehicles: this.vehicles,
      hud: this.hud,
      controlledWorld: (out) => {
        const heli = this.helis?.pilot;
        if (heli) return heli.getWorldPosition(out);
        const boat = this.boats?.skipper;
        if (boat) return boat.getWorldPosition(out);
        const drv = this.vehicles.driver;
        return drv ? drv.getWorldPosition(out) : this.player.getWorldPosition(out);
      },
      controlledBody: () => this.helis?.pilot?.body ?? this.boats?.skipper?.body ?? this.vehicles.driver?.body ?? this.player.body,
    });
    this.police = new PolicePursuitManager({
      graph, vehicles: this.vehicles, people: this.people, wanted: this.combat.wanted,
      terrainPhysics: this.world.terrainPhysics, terrain: this.world.terrain, player: this.player,
    });
    this.people.setCombat(this.combat.hooks);
    this.treeDestruction = new TreeDestruction({ scene: this.scene, origin: this.world.origin, bus, physics: this.world.treePhysics, puff: (w) => this.explosions.smoke(w, 0.8) });
    this.vehicles.setTrees(this.treeDestruction);
    this.explosions = new Explosions({
      trees: this.treeDestruction,
      scene: this.scene, origin: this.world.origin, terrain: this.world.terrain, people: this.people, vehicles: this.vehicles,
      effects: this.combat.effects, listener: (out) => this.controlledWorld(out),
    });
    this.vehicles.setFx(this.explosions);
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
    // the parked fleet (see EVLAB_SLOTS): the helicopter stands on its pad in the EVLAB parking lot
    {
      const h = this.slot(EVLAB_SLOTS.heli.s, EVLAB_SLOTS.heli.n, 0, -1);
      this.helis.spawn(new THREE.Vector3(h.x, this.world.terrain.heightAt(h.x, h.z) + 1.5, h.z), h.yaw);
    }
    // --- boats: one on the nearest deep water to the spawn point (sea / lake / river), one on the biggest lake ---
    this.boats = new BoatManager({
      boat: { physics, terrain: this.world.terrain, origin: this.world.origin, scene: this.scene, bus },
      terrainPhysics: this.world.terrainPhysics,
      input: this.input,
      player: this.player,
      orbit: this.orbit,
      hud: this.hud,
      boatHud: new BoatHUD(container),
      busy: () => !!this.vehicles.driver || !!this.helis.pilot,
      project: this.project,
    });
    this.spawnBoats();

    this.birds = new BirdManager(this.world.root, this.world.terrain, this.world.seed.value);
    this.animals = new AnimalManager(this.world.root, this.world.terrain, this.world.seed.value);
    this.voice = new VoiceManager(new Subtitles(container));
    // --- SWTP + STP engineering plants (walls / tanks are solid; Y = narrated camera tour) ---
    this.infra = new InfraManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      input: this.input,
      voice: this.voice,
      container,
      playerWorld: (out) => this.player.getWorldPosition(out),
      canStart: () => !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.mall.inside && !this.library.inside && !this.agro.inside,
    });
    // the tour owns the camera: park the player (free-fly mode) while it runs, bring the player camera back afterwards
    this.infra.onTour = (active) => {
      if (active && !this.cameraController.isFreeFly) {
        this.toggleFreeFly();
        this.infraFreeFly = true;
      } else if (!active && this.infraFreeFly) {
        if (this.cameraController.isFreeFly) this.toggleFreeFly();
        this.infraFreeFly = false;
      }
    };
    this.trainAnnouncer = new TrainAnnouncer(this.trains.fleet, this.rail, (key, text) => this.voice.speakAnnouncement(key, text));
    this.helicopterBombs = new HelicopterBombs({ scene: this.scene, input: this.input, origin: this.world.origin, terrain: this.world.terrain, people: this.people, vehicles: this.vehicles, effects: this.combat.effects, explosions: this.explosions, getPilot: () => this.helis.pilot });
    this.police.setHelicopters(this.helis);
    this.tankCannon = new TankCannon({
      scene: this.scene, camera: this.camera, input: this.input, orbit: this.orbit, physics, origin: this.world.origin,
      terrain: this.world.terrain, people: this.people, vehicles: this.vehicles, explosions: this.explosions,
    });
    // a war tank is parked next to the helicopter (F to get in; left mouse button fires the cannon)
    const tk = this.slot(EVLAB_SLOTS.tank.s, EVLAB_SLOTS.tank.n, 0, -1);
    this.vehicles.setTankHome(tk.x, tk.z, tk.yaw);
    // one parked, driverless copy of every road vehicle waits in the EVLAB PARKING lot (F to get in): the eight small ones nose-in to the road
    // (row A), the bus along the road behind them (row B)
    const S = EVLAB_SLOTS;
    const park = (spec: typeof SEDAN, sl: { s: number; n: number }, ds: number, dn: number) => ({ spec, ...this.slot(sl.s, sl.n, ds, dn) });
    this.vehicles.setParked([
      park(BIKE, S.bike, 0, -1), park(EVBIKE, S.evbike, 0, -1), park(RICKSHAW, S.rickshaw, 0, -1), park(AUTO, S.auto, 0, -1),
      park(SEDAN, S.sedan, 0, -1), park(JEEP, S.jeep, 0, -1), park(HYPERCAR, S.hypercar, 0, -1), park(EVHYPAR, S.evhypar, 0, -1),
      park(BUS, S.bus, 1, 0),
    ]);
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

  /** One model of every vehicle and person type, kept alive on purpose: disposing them would let three drop the compiled shader programs again. */
  private warmModels: { dispose(): void }[] = [];

  /**
   * Compiles the shaders of every vehicle and person type (and of the world) while the splash is still showing, so the first car or
   * pedestrian that comes into view does not freeze the game for a moment. Only an optimisation: a failure is ignored.
   */
  async warmUp(): Promise<void> {
    const group = new THREE.Group();
    for (const spec of Object.values(SPECS)) {
      const m = new VehicleModel(spec);
      this.warmModels.push(m);
      group.add(m.root);
    }
    group.add(new PersonModel(ENGINEER_LOOK).root); // people share their materials / geometry: nothing to dispose
    this.scene.add(group);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch (e) {
      console.warn('[EVCity] shader warm-up skipped:', e);
    } finally {
      this.scene.remove(group);
    }
  }

  start(): void {
    this.bus.emit('engine:ready', undefined);
    this.loop.start();
  }

  /** 60 Hz. Physics (and later vehicle/AI logic) only. */
  private fixedUpdate = (dt: number): void => {
    this.player.fixedUpdate(dt);
    this.traffic.fixedUpdate(dt);
    this.trains.fixedUpdate(dt);
    this.trainPhysics.fixedUpdate(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.police.fixedUpdate(dt, this.controlledWorld(this.tmpPoliceFocus));
    this.tour.fixedUpdate(dt);
    this.vehicles.fixedUpdate(dt);
    this.helis.fixedUpdate(dt);
    this.boats.fixedUpdate(dt);
    this.physics.step();
    this.player.afterStep();
    this.vehicles.afterStep();
    this.helis.afterStep();
    this.boats.afterStep();
    this.checkTrainContacts();
  };

  /** Once per rendered frame. Order matters: input -> camera -> world streaming -> draw. */
  private render = (dt: number, alpha: number): void => {
    if (this.input.wasPressed('F3')) this.debug.toggle();
    if (this.input.wasPressed('KeyM')) {
      this.voice.toggleMute();
      this.helis.setMuted(this.voice.isMuted);
      this.boats.setMuted(this.voice.isMuted);
      this.vehicles.setMuted(this.voice.isMuted);
      this.combat.setMuted(this.voice.isMuted);
      this.explosions.setMuted(this.voice.isMuted);
    }
    if (this.input.wasPressed('Digit1')) this.world.terrainMaterials.setWireframe(!this.world.terrainMaterials.isWireframe);
    if (this.input.wasPressed('Digit2')) this.world.terrainMaterials.setLodColors(!this.world.terrainMaterials.isLodColors);
    if (this.input.wasPressed('Digit3')) this.roadDebug.toggle();
    if (this.input.wasPressed('Digit4')) this.railDebug.toggle();

    // V: switch between the player camera and the free-fly debug camera. T (free-fly): bring the player here.
    if (!this.boats.handleKeys() && !this.helis.handleKeys()) this.vehicles.handleKeys();
    // P (while driving): camera at the driver's real eye position, P again: back to the chase camera
    if (this.input.wasPressed('KeyP')) this.setDriverView(!this.cameraController.isDriverView);
    if (this.cameraController.isDriverView && (!this.vehicles.driver || this.cameraController.isFreeFly || this.helis.pilot || this.boats.skipper)) this.setDriverView(false);
    if (this.input.wasPressed('KeyV') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper) this.toggleFreeFly();
    if (this.cameraController.isFreeFly && this.input.wasPressed('KeyT')) {
      this.world.origin.toWorld(this.camera.position, this.tmpVec);
      this.player.teleportTo(this.tmpVec);
      this.toggleFreeFly();
    }

    // J: go to the airport (on foot only): stand next to the helipad, the terminal and the runway are right there
    if (this.input.wasPressed('KeyJ') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.cameraController.isFreeFly) {
      const h = this.airport.spawns.helipad;
      this.player.teleportTo(this.tmpVec.set(h.x + 12, this.world.terrain.airport.floorY + 3, h.z));
    }

    // K: go to the EV Agro institute (on foot only): you stand on the driveway in front of the entrance
    if (this.input.wasPressed('KeyK') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.cameraController.isFreeFly) {
      const e = this.agro.entrance;
      this.player.teleportTo(this.tmpVec.set(e.x, this.world.terrain.agro.floorY + 3, e.z));
    }

    // L: go to the safari park (on foot only): deer herds, tigers and lions hunt there; fish live in every river, lake and the sea
    if (this.input.wasPressed('KeyL') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.cameraController.isFreeFly) {
      const sp = this.animals.safariPark;
      this.player.teleportTo(this.tmpVec.set(sp.x, this.world.terrain.heightAt(sp.x, sp.z) + 3, sp.z));
    }

    this.player.update(dt, alpha);
    this.vehicles.update(alpha, this.world.playerWorld, dt);
    this.explosions.update(dt);
    this.treeDestruction.update(dt);
    this.busStops.update(dt, this.world.playerWorld);
    this.busStops.place();
    this.trafficSignals.now = this.time.elapsed;
    this.trafficLights.update();
    this.checkRedLight();
    this.economy.update(this.time.elapsed);
    this.people.update(dt, this.world.playerWorld);
    this.traffic.update(dt, this.world.playerWorld);
    this.helis.update(dt, alpha, this.world.playerWorld);
    this.boats.update(dt, alpha, this.world.playerWorld);
    this.helicopterBombs.update(dt);
    const canShoot = this.player.active && !this.cameraController.isFreeFly && this.input.gameplayActive && this.player.ready && !this.player.swimming;
    this.mall.update(dt);
    this.evlab.update(this.time.elapsed);
    this.engBoundary.update();
    this.library.update(this.time.elapsed);
    this.protoBuilding.update();
    this.placedBuildings.update();
    this.airport.update();
    this.agro.update(dt);
    this.infra.update();
    this.combat.update(dt, canShoot && !this.vehicles.playerTank && !this.mall.inside && !this.agro.inside); // in the tank the left mouse button fires the cannon instead
    this.tankCannon.update(dt, canShoot && !this.mall.inside && !this.agro.inside);
    this.police.update(dt, this.controlledWorld(this.tmpPoliceFocus), this.time.elapsed);
    this.tour.update(dt);
    this.cameraController.update(dt);
    this.infra.applyCamera(dt, this.camera); // a running plant tour owns the camera
    this.world.update(dt, this.time.elapsed, this.camera, this.cameraController.isFreeFly);
    this.birds.update(dt, this.time.elapsed, this.world.playerWorld);
    this.animals.update(dt, this.time.elapsed, this.world.playerWorld);
    if (this.input.wasPressed('KeyN')) this.minimap.cycleZoom();
    this.minimap.update(dt, this.mapState());
    this.updateAreaLabel();
    this.bridgePhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.railPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.portPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.trains.update(this.world.playerWorld.x, this.world.playerWorld.z);
    this.updateTrainSignalsUi(this.world.playerWorld.x, this.world.playerWorld.z);
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
    const boat = this.boats?.skipper;
    if (boat) return boat.getWorldPosition(out);
    const vehicle = this.vehicles.driver;
    return vehicle ? vehicle.getWorldPosition(out) : this.player.getWorldPosition(out);
  }

  /** STAGE 15 / Step 6: signal lamps, station board (HUD) and the player position for the announcements. */
  private updateTrainSignalsUi(px: number, pz: number): void {
    this.trainAnnouncer.setPlayer(px, pz);
    this.signalLayer.update(px, pz);
    const board = this.trainBoard.update(px, pz);
    this.hud.setTrainBoard(board ? formatBoard(board) : null);
  }

  /** STAGE 14 / 5B.2: who touches a train? The player (on foot) and every vehicle, as boxes. Only looked at when a train is within 300 m. */
  private checkTrainContacts(): void {
    const p = this.world.playerWorld;
    const list = this.trainEntities;
    list.length = 0;
    if (this.trains.anyNear(p.x, p.z, 300)) {
      if (this.player.active && !this.player.inVehicle) {
        this.player.getWorldPosition(this.tmpA); // the capsule centre
        list.push({ id: 'player', kind: 'player', obb: playerObb(this.tmpA.x, this.tmpA.y - Config.player.height / 2, this.tmpA.z, Config.player.radius, Config.player.height) });
      }
      for (const v of this.vehicles.vehicles) {
        let id = this.vehicleIds.get(v);
        if (id === undefined) {
          id = this.nextVehicleId++;
          this.vehicleIds.set(v, id);
        }
        v.getWorldPosition(this.tmpA);
        v.forwardVector(this.tmpB);
        list.push({ id: `vehicle-${id}`, kind: 'vehicle', obb: vehicleObb(this.tmpA.x, this.tmpA.y + (v.spec.colliderY ?? 0), this.tmpA.z, this.tmpB.x, this.tmpB.z, v.spec.half) });
      }
    }
    this.trainContacts.check(list);
  }

  /** Everything the site map shows: where you are (on foot / in a car / in the helicopter) and the parked vehicles. */
  private mapState(): MapState {
    const toHeading = (fx: number, fz: number) => (((Math.atan2(fx, -fz) * 180) / Math.PI) + 360) % 360;
    const viewHeading = (((-this.orbit.yaw * 180) / Math.PI) % 360 + 360) % 360;
    let me: MapMarker;
    let view: number | null = null;
    const pilot = this.helis.pilot;
    const driver = this.vehicles.driver;
    const skipper = this.boats.skipper;
    if (skipper) {
      const t = skipper.telemetry();
      me = { x: t.x, z: t.z, heading: t.heading, kind: 'boat' };
    } else if (pilot) {
      const t = pilot.telemetry();
      me = { x: t.x, z: t.z, heading: t.heading, kind: 'heli' };
    } else if (driver) {
      driver.getWorldPosition(this.tmpA);
      driver.forwardVector(this.tmpB);
      me = { x: this.tmpA.x, z: this.tmpA.z, heading: toHeading(this.tmpB.x, this.tmpB.z), kind: 'car', ...mapSize(driver.spec.look.kind) };
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
      others.push({ x: this.tmpA.x, z: this.tmpA.z, heading: toHeading(this.tmpB.x, this.tmpB.z), kind: 'car', color: v.policeVehicle ? '#ef4444' : v.state === 'wrecked' ? '#222' : `#${v.spec.look.body.toString(16).padStart(6, '0')}`, ...mapSize(v.spec.look.kind) });
    }
    for (const h of this.helis.helis) {
      if (h === pilot) continue;
      const t = h.telemetry();
      others.push({ x: t.x, z: t.z, heading: t.heading, kind: 'heli' });
    }
    for (const b of this.boats.boats) {
      if (b === skipper) continue;
      const t = b.telemetry();
      others.push({ x: t.x, z: t.z, heading: t.heading, kind: 'boat' });
    }
    for (const t of this.trains.markers()) others.push({ x: t.x, z: t.z, heading: t.heading, kind: 'train' });
    return { me, viewHeading: view, others, stops: this.mapStops, mall: this.mall.position, library: this.library.position, building: this.protoBuilding.position, buildings: this.placedBuildings.markers, agro: this.agro.position, infra: this.infra.plants.map((pl) => ({ x: pl.site.x, z: pl.site.z, id: pl.site.id })) };
  }

  /** The player's vehicle crossed a stop line while its light was red: a Gold fine (no police case). */
  private checkRedLight(): void {
    const v = this.vehicles.driver;
    const prev = this.redLightPrev;
    if (!v || v.state === 'wrecked') {
      prev.ok = false;
      return;
    }
    v.physWorld(this.redLightP);
    v.forwardVector(this.redLightF);
    const l = Math.hypot(this.redLightF.x, this.redLightF.z) || 1;
    const x = this.redLightP.x + (this.redLightF.x / l) * v.spec.half.z; // the front bumper
    const z = this.redLightP.z + (this.redLightF.z / l) * v.spec.half.z;
    if (prev.ok && Math.hypot(x - prev.x, z - prev.z) < 15) {
      const hit = this.trafficSignals.redLightCrossing(prev.x, prev.z, x, z, v.forwardSpeed);
      if (hit) this.economy.redLight();
    }
    prev.x = x;
    prev.z = z;
    prev.ok = true;
  }

  /**
   * Any vehicle had a crash. If it is the PLAYER'S vehicle (moving, not just parked and hit) and the crash was hard enough, look for the
   * other vehicle it hit: the nearest one that touches it. The Gold fine depends on the TYPE of that vehicle. A crash against a wall or a tree
   * (no vehicle next to it) is not a traffic accident and costs nothing.
   */
  private onVehicleCrash(v: Vehicle, dv: number, speed: number): void {
    if (v !== this.vehicles.driver) return;
    if (dv < GoldConfig.accidentMinDv || speed < GoldConfig.accidentMinSpeed) return;
    v.physWorld(this.crashA);
    const reachA = Math.max(v.spec.half.x, v.spec.half.z);
    let best: Vehicle | null = null;
    let bestGap = 2.2; // metres between the two hulls
    for (const o of this.vehicles.vehicles) {
      if (o === v) continue;
      o.physWorld(this.crashB);
      if (Math.abs(this.crashB.y - this.crashA.y) > 4) continue;
      const gap = Math.hypot(this.crashB.x - this.crashA.x, this.crashB.z - this.crashA.z) - reachA - Math.max(o.spec.half.x, o.spec.half.z);
      if (gap < bestGap) {
        bestGap = gap;
        best = o;
      }
    }
    if (best) this.economy.vehicleHit(best);
  }

  /** HUD chip: railway station area > planned city area > airport / seaport part > the world zone (the whole map has one). */
  private updateAreaLabel(): void {
    const p = this.world.playerWorld;
    if (this.mall.inside) {
      this.hud.setArea({ key: 'city-mall', name: 'সিটি মল', kind: 'শপিং সেন্টার', color: '#f97316' });
      return;
    }
    if (this.library.inside) {
      const sec = this.library.section;
      this.hud.setArea({ key: `city-library-${sec ?? ''}`, name: 'সিটি লাইব্রেরি', kind: sec ? `বইয়ের বিভাগ · ${sec}` : 'পাঠাগার', color: '#a16207' });
      return;
    }
    if (this.protoBuilding.inside) {
      this.hud.setArea({ key: 'proto-thana', name: 'থানা (প্রোটোটাইপ)', kind: 'পুলিশ স্টেশন', color: '#1d4ed8' });
      return;
    }
    if (this.agro.inside) {
      const rm = this.agro.room;
      this.hud.setArea({ key: `agro-${rm?.id ?? (this.agro.level ? 'f1' : 'f0')}`, name: 'ইভি এগ্রো রিসার্চ ইনস্টিটিউট', kind: rm ? `${rm.bn} · ${this.agro.level ? 'দোতলা' : 'নিচতলা'}` : `কৃষি গবেষণা · ${this.agro.level ? 'দোতলা' : 'নিচতলা'}`, color: '#22c55e' });
      return;
    }
    if (this.world.terrain.agro.inside(p.x, p.z)) {
      this.hud.setArea({ key: 'agro-grounds', name: 'ইভি এগ্রো রিসার্চ ইনস্টিটিউট', kind: 'গবেষণা মাঠ ও প্রাঙ্গণ', color: '#22c55e' });
      return;
    }
    const plant = this.infra.nameAt(p.x, p.z);
    if (plant) {
      this.hud.setArea({ key: plant.id, name: plant.name, kind: 'ইঞ্জিনিয়ারিং অবকাঠামো', color: plant.id === 'swtp' ? '#0ea5e9' : '#a16207' });
      return;
    }
    if (this.world.terrain.evlab.inside(p.x, p.z)) {
      this.hud.setArea({ key: 'evlab', name: 'ইভিল্যাব রিসার্চ ক্যাম্পাস', kind: 'ইঞ্জিনিয়ারিং ল্যাব', color: '#3a9be8' });
      return;
    }
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
      kind: w.area ? bn.worldZones.names[w.id] : w.kind === 'engineering' ? bn.worldZones.engineeringGroup[ENGINEERING_BY_ID.get(w.id)?.group ?? ''] ?? bn.worldZones.kind[w.kind] : bn.worldZones.kind[w.kind],
      color: worldZoneHitColor(w),
    });
  }

  /** Put the boats on water: the nearest deep water to the spawn point, and the first big lake (if it is a different place). */
  /** A spot on the parking lots (lot coordinates s, n) with the yaw of a vehicle whose nose points along lot direction (ds, dn). */
  private slot(s: number, n: number, ds: number, dn: number): { x: number; z: number; yaw: number } {
    const p = lotToWorld(s, n);
    return { x: p.x, z: p.z, yaw: lotYaw(ds, dn) };
  }

  private spawnBoats(): void {
    const terrain = this.world.terrain;
    const first = findWaterSpot(terrain, this.startPoint.x, this.startPoint.z);
    if (first) this.boats.spawn(first.x, first.z, first.level, first.yaw);
    const lake = terrain.lakes.lakes.find((l) => !l.isPond);
    if (lake) {
      const spot = findWaterSpot(terrain, lake.x, lake.z, lake.R, 2);
      if (spot && (!first || Math.hypot(spot.x - first.x, spot.z - first.z) > 150)) this.boats.spawn(spot.x, spot.z, spot.level, spot.yaw);
    }
  }

  private setDriverView(on: boolean): void {
    const v = this.vehicles.driver;
    if (on) {
      if (!v || this.helis.pilot || this.boats.skipper) return;
      if (this.cameraController.enterDriverView()) v.setPlayerVisible(false);
    } else {
      this.cameraController.exitDriverView();
      v?.setPlayerVisible(true);
    }
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
    this.parking.dispose();
    this.mall.dispose();
    this.evlab.dispose();
    this.engBoundary.dispose();
    this.library.dispose();
    this.protoBuilding.dispose();
    this.placedBuildings.dispose();
    this.airport.dispose();
    this.agro.dispose();
    this.infra.dispose();
    this.tankCannon.dispose();
    this.explosions.dispose();
    this.treeDestruction.dispose();
    this.busStops.dispose();
    this.trafficLights.dispose();
    this.economy.dispose();
    this.birds.dispose();
    this.animals.dispose();
    this.police.dispose();
    this.helicopterBombs.dispose();
    this.input.dispose();
    for (const p of [...this.people.onFoot]) this.people.dispose(p);
    this.vehicles.dispose();
    this.helis.dispose();
    this.boats.dispose();
    this.player.dispose();
    this.bridgePhysics.dispose();
    this.railPhysics.dispose();
    this.portPhysics.dispose();
    this.bridgeVisuals.dispose();
    this.roadDebug.dispose();
    this.railDebug.dispose();
    this.trainPhysics.dispose();
    this.signalLayer.dispose();
    this.trains.dispose();
    this.trainLayer.dispose();
    this.world.dispose();
    this.physics.dispose();
    this.renderer.dispose();
  }
}
