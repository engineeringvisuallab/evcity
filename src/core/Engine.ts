import * as THREE from 'three';
import { Q, DynamicResolution, SlowDeviceWatch, currentChoice } from './Quality';
import { ShadowManager, SHADOW_NAMES_BN } from './ShadowQuality';
import { CameraController } from '../camera/CameraController';
import { OrbitCamera } from '../camera/OrbitCamera';
import { DriverCamera } from '../camera/DriverCamera';
import { TRAIN_VIEW_NAMES, TrainCamera } from '../camera/TrainCamera';
import { TunnelProbe } from '../trains/TunnelProbe';
import { setTrainViewer } from '../trains/TrainView';
import { StationSignLayer } from '../rail/StationSignLayer';
import { Player } from '../characters';
import { HELI, HelicopterManager } from '../aircraft';
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
import { OxygenHUD } from '../ui/OxygenHUD';
import { WaterFX } from '../water';
import { WeatherSystem } from '../weather';
import { BridgeBuilder, BridgePhysics, RoadDebug } from '../roads';
import { MedianView } from '../roads/MedianView';
import { MedianPhysics } from '../roads/MedianPhysics';
import { FootpathView } from '../roads/FootpathView';
import { UTurnSignView } from '../roads/UTurnSigns';
import { RoadNumberView } from '../roads/RoadNumberView';
import { FootpathPhysics } from '../roads/FootpathPhysics';
import { RoadsideView } from '../roads/RoadsideView';
import { CombatSystem } from '../combat';
import { CityPlan, ZONE_COLOR } from '../city/CityPlan';
import { getWorldZoneAt, worldZoneHitColor } from '../city/WorldZones';
import { ENGINEERING_BY_ID } from '../city/EngineeringZones';
import { RailDebug, RailPhysics, type RailNetwork } from '../rail';
import { PortPhysics } from '../port';
import { AirportManager } from '../airport';
import { AirplaneManager, PlaneRider, PlayerJet } from '../airplane';
import { ArmyManager } from '../army';
import { AgroManager } from '../agro/AgroManager';
import { FarmManager } from '../farm/FarmManager';
import { SignalLayer, StationBoard, TrainAnnouncer, TrainContacts, TrainLayer, TrainManager, TrainPhysics, TrainRider, formatBoard, playerObb, vehicleObb, type TrainEntity } from '../trains';
import { RidePrompt } from '../ui/RidePrompt';
import { bn } from '../i18n';
import { MALL_DOORS } from '../mall/MallSite';
import { ParkingLots } from '../parking/ParkingLots';
import { EVLAB_SLOTS, MAIN_STATION_LOT, START_LOT_POS, lotToWorld, lotYaw } from '../parking/ParkingSite';
import { ROAD_STATION_SITES } from '../parking/RoadStationSites';
import { StationStructures } from '../parking/StationStructures';
import { MallManager, loadCatalog, type Catalog } from '../mall';
import { EngineeringBoundary } from '../zones';
import { LibraryManager } from '../library';
import { BuildingManager, FillBuildings, PlacedBuildings, setBuildingTextureQuality } from '../buildings';
import { LazyInfra } from '../engineering/LazyInfra';
import { Minimap, type MapMarker, type MapState } from '../ui/Minimap';
import { VehicleMenu } from '../ui/VehicleMenu';
import { VehicleHUD } from '../ui/VehicleHUD';
import { type Vehicle, VehicleManager, NightLamps, CabinState, SEDAN, JEEP, HYPERCAR, EVHYPAR, RICKSHAW, AUTO, BUS, SPECS } from '../vehicles';
import { VehicleModel } from '../vehicles/VehicleModel';
import { PeopleManager, PersonModel, ENGINEER_LOOK } from '../people';
import { RoadGraph, TrafficLightLayer, TrafficManager, TrafficSignals } from '../traffic';
import { Economy } from '../economy/Economy';
import { Jobs } from '../economy/Jobs';
import { Extras } from '../economy/Extras';
import { GoldConfig } from '../economy/Gold';
import { InputManager } from '../input/InputManager';
import { VoiceManager } from '../audio/VoiceManager';
import { Environment, LighthouseLight, StreetLights } from '../environment';
import { RoadSignLayer } from '../signs/RoadSignLayer';
import { SignPhysics } from '../signs/SignPhysics';
import { planRoadSigns } from '../signs/SignPlan';
import { JunctionMirrors } from '../roads/JunctionMirrors';
import { Toast } from '../ui/Toast';
import { SuprimHUD } from '../ui/SuprimHUD';
import { SettingsMenu } from '../ui/SettingsMenu';
import { HudSettings } from '../ui/HudSettings';
import type { TimeMode } from '../environment/DayNight';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { DebugPanel } from '../ui/DebugPanel';
import { PerfOverlay } from '../ui/PerfOverlay';
import { ContextGuard } from './ContextGuard';
import { bindVisibility } from './Lifecycle';
import { HUD } from '../ui/HUD';
import { Subtitles } from '../ui/Subtitles';
import { MissionManager, MissionMarkers } from '../missions';
import { EVLabManager } from '../evlab';
import { RaceSystem, type RaceCourse } from '../race';
import { WorldManager } from '../world/WorldManager';
import { Config } from './Config';
import { EventBus, type Bus, type EngineEvents } from './EventBus';
import { GameLoop } from './GameLoop';
import { Time } from './Time';


/** Minimap marker size per vehicle kind. */
function mapSize(kind: string): { len?: number; wide?: number } {
  switch (kind) {
    case 'evbike': return { len: 0.6, wide: 0.45 };
    case 'rickshaw': return { len: 0.75, wide: 0.6 };
    case 'auto': return { len: 0.8, wide: 0.8 };
    case 'bus': return { len: 1.8, wide: 1.1 };
    case 'tank': return { len: 1.4, wide: 1.4 };
    case 'tractor': return { len: 1.2, wide: 1.0 };
    case 'combine': return { len: 1.7, wide: 1.3 };
    case 'pickup': return { len: 1.3, wide: 0.9 };
    case 'truck': return { len: 1.9, wide: 1.1 };
    case 'tanker': return { len: 1.5, wide: 1.0 };
    default: return {};
  }
}

/**
 * Engine bootstrap: creates every system and wires them together.
 * Systems talk through the EventBus; the Engine only decides the update ORDER.
 */
/** The same vehicle can be called from the N menu only once per minute. */
const SUMMON_COOLDOWN_MS = 60_000;

/** What Engine.prepare() has started (see there). */
export interface EnginePrep {
  bus: EventBus<EngineEvents>;
  ready: Promise<[PhysicsWorld, unknown, unknown, Catalog]>;
}

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
  /** The Tour button: pick an engineering site and its guided tour starts. */
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
  /** Day / night: street lights on every road + the lighthouse lantern (both follow environment.lampOn). */
  private streetLights: StreetLights;
  private roadSigns: RoadSignLayer;
  private signPhysics: SignPhysics;
  /** STEP 3: colliders of the fuel stations / charge points (same class as the road signs' physics: bodies only near the player). */
  private stationPhysics: SignPhysics;
  /** Convex road mirrors at the junctions (2 draw calls for the whole map). */
  private junctionMirrors: JunctionMirrors;
  /** GRASS 4: tree pits, hedges, guardrails and verge shrubs beside the roads (instanced, grouped in 250 m squares). */
  private roadside: RoadsideView;
  private lighthouseLight: LighthouseLight | null = null;
  private toast: Toast;
  /** STAGE 13: missions (field / meeting / presentation). Only asks, checks and tracks: the world never changes. */
  private missions!: MissionManager;
  /** The green cylinder at every mission place (drawing only). */
  private missionMarkers!: MissionMarkers;
  private missionPos = new THREE.Vector3();
  /** EVLab Tower: the podium with the Presentation Hall and the lobby, and the 350 m glass tower with stairs and glass lifts (src/evlab). */
  private evlab!: EVLabManager;
  /** CAR RACE on the outer freeway (north -> west): the course, the circles and the rules (src/race). */
  private race!: RaceSystem;
  /** The Jeep the race is driven in. */
  private raceJeep: Vehicle | null = null;
  /** The AI racers of the running race (they start beside the player's Jeep). */
  private raceCars: Vehicle[] = [];
  /** Settings menu (gear button / Tab): day-night mode, what the screen shows, sound, minimap zoom, key help. */
  private hudSettings = new HudSettings();
  private settingsMenu!: SettingsMenu;
  /** Waves' effects: under-water look, sea floor plants, fish / jellyfish / turtles, light beams, bubbles, splashes. */
  private waterFx!: WaterFX;
  /** Rain, clouds, wet ground, sea storm, umbrellas (src/weather). */
  private weather!: WeatherSystem;
  private oxygenHud!: OxygenHUD;
  private waterFocus = new THREE.Vector3();
  /** Gold: 10,000 at the start; fines for red lights and traffic accidents, a gift for killing a criminal. */
  readonly economy: Economy;
  private jobs!: Jobs;
  private extras!: Extras;
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
  /** Flocks and single birds (10 species) flying over the world around the player. */
  readonly birds: BirdManager;
  /** Wildlife: deer herds, tigers / lions hunting them, fish schools. L = go to the safari park. */
  readonly animals: AnimalManager;
  /** The start point (the mall doorway, world x / z) and the unit vector pointing out of the mall. */
  readonly startPoint: { x: number; z: number; ux: number; uz: number };
  /** City Mall next to the spawn point: walk in and shop (products open the live shop in a new tab). */
  readonly mall: MallManager;
  /** All the parking around the mall: angled lot + entry road/start apron + EVLAB fleet lot across F4, the front row and the side lot on the mall side. No signboards. */
  readonly parking: ParkingLots;
  readonly stationStructures: StationStructures;
  /** Prototype fence around every engineering area (no gates). */
  readonly engBoundary: EngineeringBoundary;
  /** City Library south of the F7 road (the open field next to the spawn crossing, west of the railway viaduct): walk in and look around. */
  readonly library: LibraryManager;
  /** PROTOTYPE building: the police station (thana) on the field south of F6, west of F5 (west of the spawn crossing). */
  readonly protoBuilding: BuildingManager;
  /** All the other building models, each at its spot (position only for now, see src/buildings/Placements.ts). */
  readonly placedBuildings: PlacedBuildings;
  readonly fillBuildings: FillBuildings;
  /** SWTP (water treatment) + STP (sewage treatment) plants with their narrated tour (Y). */
  readonly infra: LazyInfra;
  private infraFreeFly = false;
  private mapStops: { x: number; z: number }[] = [];
  /** Map symbols: the six small stations (fuel + charge), the main fuel station and the eight charge points (static). */
  private mapStations: { x: number; z: number; kind: 'fuel' | 'charge' | 'both' }[] = [
    // STEP 4: the main station (static) + every road-side station (fuel + charge) and charge point along the main roads
    { ...lotToWorld((MAIN_STATION_LOT.s0 + MAIN_STATION_LOT.s1) / 2, (MAIN_STATION_LOT.n0 + MAIN_STATION_LOT.n1) / 2), kind: 'fuel' as const },
    ...ROAD_STATION_SITES.map((x) => ({ x: x.x, z: x.z, kind: (x.kind === 'fuel' ? 'both' : 'charge') as 'both' | 'charge' })),
  ];
  private minimap: Minimap;
  /** N key: pick any vehicle and it is brought next to the player. */
  private vehicleMenu: VehicleMenu;
  /** STAGE 10A: which area of the city is for what (data only, no buildings yet). */
  readonly cityPlan: CityPlan;
  /** Guns: shooting, wanted level, police. The player cannot die. */
  readonly combat: CombatSystem;
  /** STAGE 6 */
  private bridgeVisuals: BridgeBuilder;
  private bridgePhysics: BridgePhysics;
  private medianView: MedianView;
  /** ROAD NUMBERS Step 1: the road code painted on the road (1 plate per road, follows the camera). */
  private roadNumbers: RoadNumberView;
  private camDir = new THREE.Vector3();
  private medianPhysics: MedianPhysics;
  private footpathView: FootpathView;
  private uturnSigns: UTurnSignView;
  private footpathPhysics: FootpathPhysics;
  private roadDebug: RoadDebug;
  private railPhysics: RailPhysics;
  /** STAGE 14: colliders of the sea port structures (cranes, containers, ships, tanks ...). */
  private portPhysics: PortPhysics;
  /** Airport in the north-east (runway, terminal, hangars, tower) on its own levelled pad. */
  readonly airport: AirportManager;
  /** SEA AIRPORT (reclaimed land in the sea south of the coast): modern terminal, military apron, causeway road. */
  readonly airportSea: AirportManager;
  /** The aircraft: shuttle airliner between the two airports, flights from / to abroad, military fighters. */
  readonly airplanes: AirplaneManager;
  /** Army camp in the north-west, on the low flat land at the foot of the big hill: gate, HQ, barracks, tents, depot, motor pool, helipad. */
  readonly army: ArmyManager;
  /** EVC Agro Research Institute (west farmland, ~3 km from the spawn): 2-floor institute + research field. K = go there. */
  readonly agro: AgroManager;
  /** Crop fields of the whole map (farmland, villages, hill orchards): rice / wheat / vegetables / fruit trees, tractors, combines, workers. */
  readonly farm: FarmManager;

  /** STAGE 11B: railway paths + station areas (plan only). */
  readonly rail: RailNetwork;
  private railDebug: RailDebug;
  /** STAGE 14 / 5B.1: trains (simulated all the time, a 3D view only near the player). */
  private trainLayer: TrainLayer;
  readonly trains: TrainManager;
  /** STAGE 14 / 5B.2: train colliders (Rapier, near the player), overlap check with the player and vehicles, no damage. */
  private trainPhysics: TrainPhysics;
  private trainContacts: TrainContacts;
  /** CRASH FEEL: when a vehicle was last thrown by a train (ms), so one contact is one strike. */
  private trainStruck = new WeakMap<object, number>();
  private trainEntities: TrainEntity[] = [];
  /** STAGE 15 / Step 6: signals you see, the station board on the HUD, Bangla station announcements. */
  private signalLayer: SignalLayer;
  private stationSigns: StationSignLayer;
  private trainBoard: StationBoard;
  private trainAnnouncer: TrainAnnouncer;
  /** The player as a train passenger (F at a platform next to a standing train; F again at a station to get off). */
  private trainRider!: TrainRider;
  private trainCam!: TrainCamera;
  /** Render quality: 0 normal, 1 high, 2 = 4K (Backquote cycles). */
  private renderQuality = 0;
  /** Lowers / raises the picture resolution by itself to hold the FPS target (normal render mode only). */
  private readonly dynRes = new DynamicResolution(Q.fpsCap || 60, Q.minScale, () => this.applyRenderScale());
  private planeRider!: PlaneRider;
  /** The fighter jet the player can fly (stands on the military apron of the sea airport). */
  private playerJet!: PlayerJet;
  private ridePrompt!: RidePrompt;
  private vehicleIds = new WeakMap<object, number>();
  private nextVehicleId = 1;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private orbit: OrbitCamera;
  private tmpPoliceFocus = new THREE.Vector3();
  private tmpVec = new THREE.Vector3();
  readonly environment: Environment;
  private debug: DebugPanel;
  /** F2 / ?perf=1: FPS, draw calls, memory ... + a "Copy report" button. */
  private perf: PerfOverlay;
  private hud: HUD;
  readonly voice: VoiceManager;
  private loop: GameLoop;
  private started = false;
  private ctxGuard: ContextGuard;
  private unbindVisibility: () => void;
  private shadowTick = 0;
  /** Sun shadow level: off / low / medium / high / auto (settings menu). In auto it lowers itself when the FPS drops and comes back on a good PC. */
  private shadows!: ShadowManager;
  /** Auto class only: remembers a PC that is too slow even at the lowest settings (next start uses the lighter class). */
  private slowWatch: SlowDeviceWatch | null = null;

  /**
   * Starts the downloads that do not need the page: Rapier WASM (a separate .wasm file, streamed), the Bangla fonts (the mall's canvas signs need them)
   * and the shop catalog (or demo data). main.ts calls this as soon as the engine chunk has arrived, so they overlap with the splash intro.
   */
  static prepare(): EnginePrep {
    const bus = new EventBus<EngineEvents>();
    const ready = Promise.all([
      PhysicsWorld.create(bus),
      document.fonts.load('700 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined),
      document.fonts.load('500 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined),
      loadCatalog(),
    ]);
    ready.catch(() => undefined); // the error is reported by create()
    return { bus, ready };
  }

  static async create(container: HTMLElement, prep: EnginePrep = Engine.prepare()): Promise<Engine> {
    const [physics, , , catalog] = await prep.ready;
    return new Engine(container, prep.bus, physics, catalog);
  }

  private constructor(
    private container: HTMLElement,
    readonly bus: Bus,
    readonly physics: PhysicsWorld,
    catalog: Catalog,
  ) {
    // --- rendering ---
    this.renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: Q.powerPreference });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.maxDpr));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.environment = new Environment(this.scene); // sky, sun + shadows, fog
    this.shadows = new ShadowManager({
      apply: (level, spec) => this.environment.applyShadow(level, spec),
      notify: (text) => this.toast?.show(text, 4200),
    });
    if (currentChoice() === 'auto') {
      this.slowWatch = new SlowDeviceWatch(Q.fpsCap || 60, (lower) => {
        this.toast?.show(`🐢 এই পিসিতে গেম ধীর — পরের বার থেকে \"${lower === 'low' ? 'নিচু' : 'মাঝারি'}\" গ্রাফিক্সে চলবে। এখনই চাইলে সেটিংস → গ্রাফিক্স`, 9000);
      });
    }

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
    this.medianView = new MedianView(this.world.root, roads);
    this.roadNumbers = new RoadNumberView(this.world.root, roads.roads, roads.pads, roads.bridges);
    this.medianPhysics = new MedianPhysics(physics, this.world.origin, roads);
    this.footpathView = new FootpathView(this.world.root, roads);
    this.uturnSigns = new UTurnSignView(this.world.root, roads);
    this.footpathPhysics = new FootpathPhysics(physics, this.world.origin, roads);
    this.roadDebug = new RoadDebug(roads);
    this.streetLights = new StreetLights(this.world.root, roads);
    this.junctionMirrors = new JunctionMirrors(this.world.root, roads, this.streetLights.spots, { live: Q.mirrorLive, dist: Q.mirrorLiveDist, size: Q.mirrorTex, samples: Q.antialias ? 4 : 0 });
    this.roadside = new RoadsideView(this.world.root, this.world.terrain);
    this.world.root.add(this.roadDebug.group);
    this.rail = this.world.terrain.rail;
    this.railDebug = new RailDebug(this.rail);
    this.railPhysics = new RailPhysics(physics, this.world.origin, this.rail, (x, z) => this.world.terrain.heightAt(x, z));
    this.portPhysics = new PortPhysics(physics, this.world.origin);
    this.world.root.add(this.railDebug.group);
    this.trainLayer = new TrainLayer(this.world.root);
    this.trains = new TrainManager(this.rail, this.trainLayer);
    this.trainPhysics = new TrainPhysics(physics, this.world.origin, this.trains);
    this.trainContacts = new TrainContacts(this.trains, (h) => bus.emit('train:overlap', h));
    this.signalLayer = new SignalLayer(this.world.root, this.trains.fleet);
    this.stationSigns = new StationSignLayer(this.world.root, this.rail, (x, z) => this.world.terrain.heightAt(x, z)); // English + Bangla lettering on the station boards
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
        findTree: (wx, wz, reach) => this.world.treePhysics.findClimbable(wx, wz, reach),
        hint: (text) => this.toast?.show(text, 5200),
        inTunnel: (x, y, z) => this.world.tunnelHoles.contains(x, y, z),
        getCameraElevation: () => this.orbit.elevation,
        isOxygenUnlimited: () => this.hudSettings.values.infiniteOxygen,
        onSplash: (wx, wz, strength) => this.waterFx?.splash(wx, wz, strength),
        onBlackout: () => this.toast?.show('😵 দম ফুরিয়ে অজ্ঞান হয়ে গিয়েছিলেন — পানির ওপরে তোলা হয়েছে', 3600),
      },
      spawn,
    );
    this.orbit = new OrbitCamera(this.camera, this.input, this.player, physics, this.world.terrain, this.world.origin);
    this.cameraController.setOrbit(this.orbit);
    this.cameraController.useOrbit();
    this.cameraController.setDriverCamera(new DriverCamera(this.camera, this.input, () => this.vehicles.driver));
    // passenger camera of the trains: seat / aisle / driver's cab / outside / cinematic (C cycles while riding)
    this.trainCam = new TrainCamera(this.camera, this.input, () => this.trainRider.ride, this.world.origin, this.world.terrain, new TunnelProbe(this.rail));
    this.cameraController.setTrainCamera(this.trainCam);
    // START VIEW: the camera stands behind the player on the apron and looks over F4 at the mall's west door
    this.orbit.yaw = Math.atan2(-this.startPoint.ux, -this.startPoint.uz);
    // --- road sign boards (Bangla + English) ---
    this.roadSigns = new RoadSignLayer(this.world.root);
    // STEP 3: the plan for the whole map; STEP 4 + 5: every planned board is built (gantries on highways / arterials, side boards elsewhere), the text is drawn only near the player
    const signPlan = planRoadSigns(roads);
    console.info('[RoadSigns]', signPlan.summary);
    console.info('[RoadSigns]', this.roadSigns.addPlanned(roads, signPlan.boards, (x, z) => this.world.terrain.heightAt(x, z)));
    // STEP 6: the posts and bases of the boards are solid (cars and people hit them), colliders only near the player
    this.signPhysics = new SignPhysics(physics, this.world.origin, this.roadSigns.solidGroups);

    // --- parking lots (asphalt, bay lines; no signboards) ---
    this.parking = new ParkingLots({ root: this.world.root, terrain: this.world.terrain });
    // STEP 2: light structures at the small stations and the charge points (pump / charger posts, little roofs, Bangla + English signs)
    this.stationStructures = new StationStructures({ root: this.world.root, terrain: this.world.terrain });
    // STEP 3: pumps, columns, kiosk, pylon, charger posts and cabinets are solid (cuboids), only near the player, floating-origin local coordinates
    this.stationPhysics = new SignPhysics(physics, this.world.origin, this.stationStructures.solidGroups);

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

    // --- EVLab Tower (always standing there when the game starts) ---
    this.evlab = new EVLabManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
      teleport: (w) => this.player.teleportTo(w),
      lockTarget: this.renderer.domElement,
      faceSouth: () => {
        this.orbit.yaw = Math.PI;
        this.orbit.elevation = 0.16;
      },
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

    // City fill (Step 1+2): hundreds of buildings along the streets of site 0, drawn instanced with chunk LOD
    this.fillBuildings = new FillBuildings({
      root: this.world.root,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // lighthouse in the sea: its lantern shines at night (stands on its own, so it is visible from far away)
    const lh = this.placedBuildings.anchorOf('lighthouse');
    if (lh) this.lighthouseLight = new LighthouseLight(this.world.root, lh.x, lh.floorY, lh.z);

    // --- Airport (north-east; the model is hidden when the player is far away) ---
    this.airport = new AirportManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- Sea airport (south coast, on filled land in the sea; the model is hidden when the player is far away) ---
    this.airportSea = new AirportManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
      site: this.world.terrain.airportSea,
    });

    // --- Aircraft: shuttle airliner (old airport <-> sea airport), flights from / to abroad, military fighters ---
    this.airplanes = new AirplaneManager({
      root: this.world.root,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- Army camp (north-west, at the foot of the hill; hidden when the player is far away) ---
    this.army = new ArmyManager({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      playerWorld: (out) => this.player.getWorldPosition(out),
    });

    // --- EVC Agro Research Institute (west farmland; hidden when the player is far away) ---
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
    this.perf = new PerfOverlay(container, this.renderer, () => ({
      tier: Q.tier,
      choice: currentChoice(),
      renderMode: this.renderQuality,
      dynScale: this.dynRes.scale,
      shadow: `${this.shadows.level} | choice ${this.shadows.choice}`,
      sitesBuilt: this.infra ? this.infra.builtCount : 0,
      sitesTotal: this.infra ? this.infra.total : 0,
      chunksLoaded: this.world.chunks.loadedCount,
      chunksPending: this.world.chunks.pendingCount,
      bodies: this.physics.bodyCount,
      colliders: this.physics.colliderCount,
      people: this.people ? this.people.count : 0,
      cars: this.vehicles ? this.vehicles.vehicles.length : 0,
      aiCars: this.traffic ? this.traffic.aiCount : 0,
    }));
    this.hud = new HUD(container);
    this.toast = new Toast(container);
    this.ridePrompt = new RidePrompt(container);
    this.trainRider = new TrainRider({
      trains: this.trains,
      rail: this.rail,
      groundAt: (x, z) => this.world.terrain.heightAt(x, z),
      player: this.player,
      pressedF: () => this.input.wasPressed('KeyF'),
      canBoard: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper,
      prompt: (t) => this.ridePrompt.set(t),
      toast: (t) => this.toast.show(t, 3400),
      onRide: (on) => {
        if (on) {
          this.trainCam.reset();
          this.cameraController.enterTrainView();
          this.toast.show('🚆 C চাপলে ক্যামেরা বদলাবে: সিট · দাঁড়িয়ে · ড্রাইভার কেবিন · বাইরে · সিনেমাটিক', 4200);
        } else {
          this.cameraController.exitTrainView();
          this.orbit.setTarget(this.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
        }
      },
    });
    this.planeRider = new PlaneRider({
      planes: this.airplanes,
      player: this.player,
      pressedF: () => this.input.wasPressed('KeyF'),
      canBoard: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.playerJet.riding,
      prompt: (t) => this.ridePrompt.set(t),
      toast: (t) => this.toast.show(t, 3400),
      onRide: (on) => (on ? this.orbit.setTarget(this.player, 70, 25, 220) : this.orbit.setTarget(this.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance)),
    });
    this.playerJet = new PlayerJet({
      root: this.world.root,
      container,
      terrain: this.world.terrain,
      planes: this.airplanes,
      input: this.input,
      player: this.player,
      orbit: this.orbit,
      canBoard: () => this.player.active && !this.player.inVehicle && !this.cameraController.isFreeFly && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding,
      prompt: (text) => this.ridePrompt.set(text),
      toast: (text, ms) => this.toast.show(text, ms ?? 3000),
      onRide: (on) => (on ? this.orbit.setTarget(this.player, 38, 14, 170) : this.orbit.setTarget(this.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance)),
    });
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
      suprimHud: new SuprimHUD(container),
      toast: (t) => this.toast.show(t, 3200),
      project: this.project,
      onDriverEjected: (person, door, car) => {
        // a driver pulled out of his car does not run: he tries to get it back (a person thrown out otherwise runs away)
        if (car) {
          this.people.adopt(person, door, 'idle');
          this.people.startRetake(person, car);
        } else this.people.adopt(person, door, 'flee');
      },
    });

    // --- people + traffic (STAGE 9) ---
    const graph = new RoadGraph(roads);
    this.people = new PeopleManager({ scene: this.scene, terrain: this.world.terrain, origin: this.world.origin, graph, vehicles: this.vehicles, player: this.player });
    this.people.setStations(this.rail, this.trains); // people walk to the stations, climb the stairs and board / leave the trains
    // --- Crop fields (table FarmFields.ts): crops, trees and props + REAL farmers (people) and machines (vehicles) at work, streamed around the player ---
    this.farm = new FarmManager({ root: this.world.root, terrain: this.world.terrain, playerWorld: (out) => this.player.getWorldPosition(out), people: this.people, vehicles: this.vehicles });
    this.busStops = new BusStops({ scene: this.scene, origin: this.world.origin, terrain: this.world.terrain, graph, sites: this.world.terrain.sites });
    this.trafficSignals = new TrafficSignals(graph);
    this.trafficLights = new TrafficLightLayer(this.world.root, this.trafficSignals);
    this.traffic = new TrafficManager({ graph, plan: new CityPlan(this.world.terrain.sites), vehicles: this.vehicles, people: this.people, player: this.player, terrainPhysics: this.world.terrainPhysics, stops: this.busStops, signals: this.trafficSignals });
    this.vehicles.setPeople(this.people);
    this.people.onRetake = (p, car) => this.traffic.resume(car, p); // the owner of a stolen car got it back: he drives off again
    // --- Gold economy: accidents (vehicle crash / run over people) are fined, killing a criminal is rewarded ---
    this.economy = new Economy(container);
    // cargo truck job + safe-driving bonus (Jobs.ts): any fine restarts the safe-driving round
    this.jobs = new Jobs({ parent: container, input: this.input, economy: this.economy, vehicles: this.vehicles, sites: this.world.terrain.sites });
    this.economy.onFine = () => this.jobs.notifyFine();
    // passenger fare, race, farm work, plant income (Extras.ts)
    this.extras = new Extras({
      parent: container, input: this.input, economy: this.economy, vehicles: this.vehicles,
      depots: () => this.jobs.depots, stops: () => this.mapStops, fieldAt: (x, z) => this.farm.info(x, z), cargoBusy: () => this.jobs.busy,
    });
    this.vehicles.onPersonHit = (p, died) => this.economy.personHit(p, died);
    // stations: fuel / charge cost Gold; fuel delivered from the mine to the main station earns the bonus
    this.vehicles.payGold = (amount, reason) => this.economy.buy(amount, reason);
    this.vehicles.bonusGold = (amount, reason) => this.economy.bonus(amount, reason);
    this.vehicles.goldBalance = () => this.economy.balance;
    this.vehicles.fineGold = (amount, reason) => this.economy.fineGold(amount, reason);
    this.vehicles.setCrashHook((v, dv, speed) => this.onVehicleCrash(v, dv, speed));
    this.people.onCriminalKilled = () => this.economy.criminalKilled(this.combat.wanted.stars); // the bounty grows with the wanted stars
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

    // --- N menu: every vehicle (incl. the tank and the helicopter), brought next to the player ---
    this.vehicleMenu = new VehicleMenu(
      container,
      [
        { id: 'rickshaw', icon: '🚲' }, { id: 'auto', icon: '🛺' },
        { id: 'sedan', icon: '🚗' }, { id: 'jeep', icon: '🚙' }, { id: 'hypercar', icon: '🏎️' }, { id: 'evhypar', icon: '🚘' }, { id: 'suprim', icon: '🛸' },
        { id: 'bus', icon: '🚌' }, { id: 'tank', icon: '🪖' },
        { id: 'tractor', icon: '🚜' }, { id: 'combine', icon: '🌾' }, { id: 'pickup', icon: '🛻' }, { id: 'truck', icon: '🚚' }, { id: 'tanker', icon: '⛽' },
      ].map((v) => ({ ...v, label: SPECS[v.id as keyof typeof SPECS].nameBn })).concat([{ id: 'heli', icon: '🚁', label: HELI.nameBn }]),
      (id) => this.summonVehicle(id),
      this.renderer.domElement,
      () => !!this.vehicles.driver?.spec.amphibious, // N = flight mode while driving the Suprim
    );

    // --- the always-on site map (top-right) ---
    this.cityPlan = new CityPlan(this.world.terrain.sites);
    this.minimap = new Minimap(container, this.world.seed.value, this.world.terrain.sites, this.cityPlan, this.rail);
    this.missions = new MissionManager({ parent: container, lockTarget: this.renderer.domElement, chipTop: () => this.minimap.infoBottom, toast: (t, ms) => this.toast.show(t, ms ?? 3400),
      stage: { enter: () => this.evlab.enterStage(), end: () => this.evlab.endPresentation(), mood: (m) => this.evlab.setMood(m) } });
    this.missionMarkers = new MissionMarkers(this.world.root, (x, z) => this.world.terrain.heightAt(x, z));
    this.race = new RaceSystem({ parent: container, root: this.world.root, graph, toast: (t, ms) => this.toast.show(t, ms ?? 3400), begin: (c) => this.beginRace(c), go: () => { for (const v of this.raceCars) if (v.ai) v.ai.hold = false; }, clear: () => this.clearRacers() });
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
    const infraSites = this.world.terrain.infra;
    this.infra = new LazyInfra({
      root: this.world.root,
      physics,
      origin: this.world.origin,
      terrain: this.world.terrain,
      input: this.input,
      voice: this.voice,
      container,
      playerWorld: (out) => this.player.getWorldPosition(out),
      clock: () => this.airplanes.time,
      lazy: true, // sites are built when the player comes near (fast start-up)
      canStart: () => !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.mall.inside && !this.library.inside && !this.agro.inside,
    }, infraSites.length, infraSites.map((s) => ({ id: s.id, name: s.nameBn, color: s.color, mark: s.mark, category: '', stops: 0 })));
    // the tour owns the camera: park the player (free-fly mode) while it runs, bring the player camera back afterwards
    this.infra.onTour = (active) => {
      this.tour.setTouring(active);
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
    // one parked, driverless copy of every road vehicle waits in the EVLAB PARKING lot (F to get in): the small ones nose-in to the road
    // (row A), the bus along the road behind them (row B)
    const S = EVLAB_SLOTS;
    const park = (spec: typeof SEDAN, sl: { s: number; n: number }, ds: number, dn: number) => ({ spec, ...this.slot(sl.s, sl.n, ds, dn) });
    this.vehicles.setParked([
      park(RICKSHAW, S.rickshaw, 0, -1), park(AUTO, S.auto, 0, -1),
      park(SEDAN, S.sedan, 0, -1), park(JEEP, S.jeep, 0, -1), park(HYPERCAR, S.hypercar, 0, -1), park(EVHYPAR, S.evhypar, 0, -1),
      park(BUS, S.bus, 1, 0),
    ]);
    this.tour = new TourManager({ container, infra: this.infra });
    bus.on('camera:locked', ({ locked }) => this.hud.setLocked(locked));

    // --- settings menu: everything that used to clutter the screen can be switched on here ---
    this.waterFx = new WaterFX({
      root: this.world.root,
      camera: this.camera,
      terrain: this.world.terrain,
      terrainMaterials: this.world.terrainMaterials,
      environment: this.environment,
      water: this.world.water,
      container,
      pxHeight: () => this.renderer.domElement.height,
    });
    this.waterFx.setQuality(this.hudSettings.values.waterQuality);
    this.weather = new WeatherSystem({
      scene: this.scene,
      environment: this.environment,
      water: this.world.water,
      dayLen: (Config.environment.dayNight.dayMinutes + Config.environment.dayNight.nightMinutes) * 60,
      groundAt: (x, z) => this.world.terrain.heightAt(x, z),
    });
    this.oxygenHud = new OxygenHUD(container);
    this.settingsMenu = new SettingsMenu(
      container,
      {
        getTimeMode: () => this.environment.timeMode,
        setTimeMode: (m) => this.setTimeMode(m),
        getMuted: () => this.voice.isMuted,
        setMuted: (m) => this.setMuted(m),
        getMapZoom: () => this.minimap.zoomLevel,
        setMapZoom: (z) => this.setMapZoom(z),
        getDebug: () => this.debug.isVisible,
        setDebug: (on) => this.debug.setVisible(on),
        getPerf: () => this.perf.isVisible,
        setPerf: (on) => this.perf.setVisible(on),
        getShadow: () => ({ choice: this.shadows.choice, level: this.shadows.level }),
        setShadow: (c) => {
          this.shadows.setChoice(c);
          this.toast?.show(`🌑 ছায়া: ${c === 'auto' ? `অটো (এখন ${SHADOW_NAMES_BN[this.shadows.level]})` : SHADOW_NAMES_BN[this.shadows.level]}`, 2600);
        },
        getGold: () => this.economy.balance,
      },
      this.hudSettings,
      this.renderer.domElement,
    );
    this.hudSettings.onChange(() => this.applyHudOptions());
    this.applyHudOptions();
    this.minimap.setZoom(this.hudSettings.values.mapZoom);
    if (this.hudSettings.values.muted) this.setMuted(true);

    window.addEventListener('resize', this.onResize);
    this.loop = new GameLoop(this.time, this.fixedUpdate, this.render);
    this.loop.maxFps = Q.fpsCap;
    // WebGL context lost (iOS memory pressure, GPU reset): stop drawing, show a message, restart when the browser gives the context back
    this.ctxGuard = new ContextGuard(this.renderer.domElement, container, () => this.loop.stop(), () => {
      if (this.started && !document.hidden) this.loop.start();
    });
    // tab hidden / screen locked: no simulation, no drawing, audio and voice paused
    this.unbindVisibility = bindVisibility(
      () => this.loop.stop(),
      () => {
        if (this.started && !this.ctxGuard.isLost) this.loop.start();
      },
    );
    this.applyRenderScale(); // the preset's pixel-ratio cap and pixel budget
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

  /** Resolves when the terrain around the player is in (or after `timeoutMs`): the splash waits for it so the first picture is not an empty field. */
  firstChunksReady(minChunks = 9, timeoutMs = 12000): Promise<void> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const poll = (): void => {
        const ch = this.world.chunks;
        if (ch.loadedCount >= minChunks || (ch.loadedCount > 0 && ch.pendingCount === 0) || performance.now() - t0 > timeoutMs) resolve();
        else window.setTimeout(poll, 150);
      };
      poll();
    });
  }

  start(): void {
    this.bus.emit('engine:ready', undefined);
    this.started = true;
    if (!document.hidden) this.loop.start();
    void this.infra.load(); // the engineering sites' code (0.5 MB) is fetched now, after the first picture is up
    const tierName = { low: 'নিচু', medium: 'মাঝারি', high: 'উঁচু' }[Q.tier];
    this.toast.show(`⚙️ গ্রাফিক্স: ${tierName}${currentChoice() === 'auto' ? ' (অটো)' : ''} · Tab চেপে সেটিংস থেকে বদলানো যায়`, 4200);
  }

  /** 60 Hz. Physics (and later vehicle/AI logic) only. */
  private fixedUpdate = (dt: number): void => {
    this.player.fixedUpdate(dt);
    this.traffic.fixedUpdate(dt);
    this.trains.fixedUpdate(dt);
    this.trainPhysics.fixedUpdate(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.police.fixedUpdate(dt, this.controlledWorld(this.tmpPoliceFocus));
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
    this.perf.frame(dt);
    if (this.renderQuality === 0) {
      // auto shadows react first (they are the cheapest thing to give up); the picture resolution only when the shadows are already off
      this.shadows.sample(dt, Q.fpsCap || 60);
      if (this.shadows.atFloor) this.dynRes.sample(dt);
      this.slowWatch?.sample(dt, this.shadows.level === 'off' && this.dynRes.scale <= Q.minScale + 0.001);
    }
    if (this.input.wasPressed('F3')) this.debug.toggle();
    if (this.input.wasPressed('F2')) this.perf.toggle();
    if (this.input.wasPressed('KeyM')) this.setMuted(!this.voice.isMuted);
    if (this.input.wasPressed('Tab')) this.settingsMenu.toggle(); // the settings menu (the gear button does the same)
    if (this.input.wasPressed('Digit1')) this.world.terrainMaterials.setWireframe(!this.world.terrainMaterials.isWireframe);
    if (this.input.wasPressed('Digit2')) this.world.terrainMaterials.setLodColors(!this.world.terrainMaterials.isLodColors);
    if (this.input.wasPressed('Digit3')) this.roadDebug.toggle();
    if (this.input.wasPressed('Digit4')) this.railDebug.toggle();
    // \ : time mode: day-night cycle -> always night -> always day (the settings menu has buttons for the same)
    if (this.input.wasPressed('Backslash')) {
      const order: TimeMode[] = ['cycle', 'night', 'day'];
      this.setTimeMode(order[(order.indexOf(this.environment.timeMode) + 1) % order.length]);
    }

    // V: switch between the player camera and the free-fly debug camera. T (free-fly): bring the player here.
    if (!this.trainRider.handleKeys() && !this.playerJet.handleKeys() && !this.planeRider.handleKeys() && !this.boats.handleKeys() && !this.helis.handleKeys()) this.vehicles.handleKeys();
    // P (while driving): camera at the driver's real eye position, P again: back to the chase camera
    if (this.input.wasPressed('KeyP')) this.setDriverView(!this.cameraController.isDriverView);
    // C (on a train): next passenger camera. ` (Backquote): render quality normal / high / 4K
    if (this.trainRider.riding && this.cameraController.isTrainView && this.input.wasPressed('KeyC')) this.toast.show('🎥 ' + TRAIN_VIEW_NAMES[this.trainCam.next()], 2200);
    if (this.input.wasPressed('Backquote')) this.cycleRenderQuality();
    if (this.cameraController.isDriverView && (!this.vehicles.driver || this.cameraController.isFreeFly || this.helis.pilot || this.boats.skipper)) this.setDriverView(false);
    if (this.input.wasPressed('KeyV') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding) this.toggleFreeFly();
    if (this.cameraController.isFreeFly && this.input.wasPressed('KeyT')) {
      this.world.origin.toWorld(this.camera.position, this.tmpVec);
      this.player.teleportTo(this.tmpVec);
      this.toggleFreeFly();
    }

    // ; (semicolon): go to the army camp (on foot only): you stand just inside the main gate
    if (this.input.wasPressed('Semicolon') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.cameraController.isFreeFly) {
      const g = this.army.spawns.gate;
      this.player.teleportTo(this.tmpVec.set(g.x, this.world.terrain.army.floorY + 3, g.z));
    }

    // J: go to the airport (on foot only): stand next to the helipad, the terminal and the runway are right there
    if (this.input.wasPressed('KeyJ') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.cameraController.isFreeFly) {
      const h = this.airport.spawns.helipad;
      this.player.teleportTo(this.tmpVec.set(h.x + 12, this.world.terrain.airport.floorY + 3, h.z));
    }

    // ' (apostrophe): go to the SEA AIRPORT (on foot only): you stand in front of the terminal, the shuttle airliner and the fighters are right there
    if (this.input.wasPressed('Quote') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.cameraController.isFreeFly) {
      const c = this.airplanes.airport('sea').curb;
      this.player.teleportTo(this.tmpVec.set(c.x, this.world.terrain.airportSea.floorY + 3, c.z));
    }

    // K: go to the EVC Agro institute (on foot only): you stand on the driveway in front of the entrance
    if (this.input.wasPressed('KeyK') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.cameraController.isFreeFly) {
      const e = this.agro.entrance;
      this.player.teleportTo(this.tmpVec.set(e.x, this.world.terrain.agro.floorY + 3, e.z));
    }

    // L: go to the safari park (on foot only): deer herds, tigers and lions hunt there; fish live in every river, lake and the sea
    if (this.input.wasPressed('KeyL') && !this.vehicles.driver && !this.helis.pilot && !this.boats.skipper && !this.trainRider.riding && !this.planeRider.riding && !this.playerJet.riding && !this.cameraController.isFreeFly) {
      const sp = this.animals.safariPark;
      this.player.teleportTo(this.tmpVec.set(sp.x, this.world.terrain.heightAt(sp.x, sp.z) + 3, sp.z));
    }

    this.player.update(dt, alpha);
    this.trainRider.update(dt); // a passenger moves with the seat of the train (after the trains moved, before the camera)
    setTrainViewer(this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z); // saloons are only drawn near the camera
    this.airplanes.update(dt);
    this.planeRider.update(); // a passenger moves with the seat of the plane (after the planes moved, before the camera)
    this.playerJet.update(dt); // the jet the player flies (after the planes, before the camera)
    this.vehicles.update(alpha, this.world.playerWorld, dt);
    this.explosions.update(dt);
    this.treeDestruction.update(dt);
    this.busStops.update(dt, this.world.playerWorld);
    this.busStops.place();
    this.trafficSignals.now = this.time.elapsed;
    this.trafficLights.update();
    this.checkRedLight();
    this.economy.update(this.time.elapsed);
    this.jobs.update(dt);
    this.extras.update(dt, this.world.playerWorld);
    this.people.update(dt, this.world.playerWorld);
    this.traffic.update(dt, this.world.playerWorld);
    this.helis.update(dt, alpha, this.world.playerWorld);
    this.boats.update(dt, alpha, this.world.playerWorld);
    this.helicopterBombs.update(dt);
    const canShoot = this.player.active && !this.cameraController.isFreeFly && this.input.gameplayActive && this.player.ready && !this.player.swimming;
    this.mall.update(dt);
    this.engBoundary.update();
    this.library.update(this.time.elapsed);
    this.evlab.update(this.time.elapsed, this.environment.hours);
    this.protoBuilding.update();
    this.placedBuildings.update();
    this.fillBuildings.update();
    this.airport.update();
    this.airportSea.update();
    this.army.update();
    this.agro.update(dt);
    this.farm.update(dt);
    this.infra.update(dt);
    this.combat.update(dt, canShoot && !this.vehicles.playerTank && !this.mall.inside && !this.agro.inside); // in the tank the left mouse button fires the cannon instead
    this.tankCannon.update(dt, canShoot && !this.mall.inside && !this.agro.inside);
    this.police.update(dt, this.controlledWorld(this.tmpPoliceFocus), this.time.elapsed);
    {
      // Suprim in submarine mode: the camera follows it under the water (under-water view: blue fog, light shafts) instead of staying above the surface
      const dv = this.vehicles.driver;
      const diving = !!dv && !!dv.spec.amphibious && dv.mode === 'dive' && dv.depth > 1.6;
      this.orbit.allowUnderwater = (this.player.active && !this.player.inVehicle && this.player.swimming) || diving;
      if (diving && this.orbit.elevation > 0.1) this.orbit.elevation += (0.1 - this.orbit.elevation) * Math.min(1, 3 * dt);
    }
    this.cameraController.update(dt);
    this.infra.applyCamera(dt, this.camera); // a running plant tour owns the camera
    {
      // RAIN: clouds, falling rain, wet ground, sea storm (BEFORE the world / water / environment update); people and the player open umbrellas
      const shelter = this.mall.inside || this.agro.inside ? 1 : this.trainRider.riding ? 0.7 : 0;
      this.weather.update(dt, this.time.elapsed, this.camera, this.world.origin.origin.x, this.world.origin.origin.z, this.renderer.domElement.height, shelter);
      this.people.setRain(this.weather.intensity);
      CabinState.rain = this.weather.intensity; // wipers sweep while it rains
      this.player.model.setUmbrella(this.weather.umbrellaWanted && this.hudSettings.values.rainUmbrella && this.player.active && !this.player.inVehicle && !shelter);
    }
    this.world.update(dt, this.time.elapsed, this.camera, this.cameraController.isFreeFly);
    this.birds.update(dt, this.time.elapsed, this.world.playerWorld);
    this.animals.update(dt, this.time.elapsed, this.world.playerWorld);
    if (this.input.wasPressed('KeyU')) this.setMapZoom((this.minimap.zoomLevel + 1) % 3); // (N = the vehicle menu)
    if (this.input.wasPressed('Backslash')) this.missions.toggle(); // \ opens the mission list (the Missions button does the same)
    {
      const ms = this.mapState(); // `me` = what you control (on foot, car, helicopter, boat): missions use the same position as the map
      this.missions.update(dt, ms.me.x, ms.me.z, this.player.getWorldPosition(this.missionPos).y - this.world.terrain.heightAt(ms.me.x, ms.me.z));
      ms.missions = [...this.missions.pins(), ...this.race.pins()];
      this.missionMarkers.update(dt, ms.missions);
      {
        // CAR RACE: the race Jeep never runs out of fuel; the race needs to know where you are and whether you still sit in the Jeep
        const rd = this.vehicles.driver;
        const inJeep = rd !== null && rd === this.raceJeep && rd.state === 'ok';
        if (rd && inJeep && this.race.active) rd.energy = 1;
        const racers = this.raceCars.map((v) => {
          v.getWorldPosition(this.tmpA);
          return { x: this.tmpA.x, z: this.tmpA.z };
        });
        if (rd && inJeep && this.race.active) {
          // a racer far ahead of the player waits for him (a car more than ~300 m from the player would freeze)
          const mine = this.race.remaining(ms.me.x, ms.me.z);
          const cap = Math.max(18, rd.forwardSpeed * 1.05);
          this.raceCars.forEach((v, i) => {
            if (v.ai) v.ai.speedCap = mine - this.race.remaining(racers[i].x, racers[i].z) > 170 ? cap : undefined;
          });
        }
        this.race.update(dt, { x: ms.me.x, z: ms.me.z, enter: this.input.gameplayActive && this.input.wasPressed('Enter'), inRaceJeep: inJeep, racers });
      }
      this.minimap.update(dt, ms);
    }
    this.updateAreaLabel();
    this.bridgePhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.medianPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.footpathPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.railPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.portPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
    this.trains.update(this.world.playerWorld.x, this.world.playerWorld.z);
    this.updateTrainSignalsUi(this.world.playerWorld.x, this.world.playerWorld.z);
    this.hud.setLoading(this.player.active && !this.player.inVehicle && !this.player.ready);
    {
      // water: under-water look, sea floor and its life, bubbles, breath bar (BEFORE the environment applies fog / light)
      const P = Config.player;
      this.player.getWorldPosition(this.waterFocus);
      this.waterFx.update(dt, this.time.elapsed, this.waterFocus);
      if (this.player.headUnder) this.waterFx.diverBubbles(dt, this.waterFocus.x, this.waterFocus.y + 0.7, this.waterFocus.z, this.player.horizSpeed > 2 ? 1.6 : 1);
      const unlimited = this.hudSettings.values.infiniteOxygen;
      this.oxygenHud.update(this.player.oxygen, this.player.headUnder || this.player.oxygen < 0.995, unlimited);
      const drown = unlimited ? 0 : this.player.oxygen <= 0 ? Math.min(1, this.player.drownTime / P.drownGrace) : this.player.headUnder && this.player.oxygen < 0.18 ? ((0.18 - this.player.oxygen) / 0.18) * 0.35 : 0;
      this.waterFx.setDrowning(drown);
    }
    this.environment.update(this.camera, dt);
    {
      const lamp = this.environment.lampOn;
      const fov = this.camera.fov;
      const px = this.renderer.domElement.height;
      this.streetLights.update(lamp, fov, px);
      this.roadSigns.update(lamp);
      this.roadSigns.updateField(this.world.playerWorld.x, this.world.playerWorld.z);
    this.signPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
      this.stationPhysics.update(dt, this.world.playerWorld.x, this.world.playerWorld.z);
      this.stationStructures.update(this.world.playerWorld.x, this.world.playerWorld.z, lamp); // builds the near sites, frees the far ones; canopy lights, kiosk windows, price displays and signs follow the day / night
      this.junctionMirrors.update(lamp);
      NightLamps.on = lamp; // vehicle headlights / tail lights
      this.roadside.update(dt, this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z);
      this.medianView.update(dt, this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z);
      this.footpathView.update(dt, this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z);
      this.uturnSigns.update(dt, this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z);
      this.camera.getWorldDirection(this.camDir);
      const hl = Math.hypot(this.camDir.x, this.camDir.z);
      if (this.roadNumbers.enabled !== this.hudSettings.values.roadNumbers) this.roadNumbers.setEnabled(this.hudSettings.values.roadNumbers); // Settings > "রাস্তার নম্বর দেখাও"
      this.roadNumbers.setLamp(lamp);
      this.roadNumbers.update(dt, { x: this.camera.position.x + this.world.origin.origin.x, y: this.camera.position.y, z: this.camera.position.z + this.world.origin.origin.z, fx: hl > 0.2 ? this.camDir.x / hl : 0, fz: hl > 0.2 ? this.camDir.z / hl : 0 });
      this.lighthouseLight?.update(lamp, this.time.elapsed, fov, px);
    }

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
      signs: { ...this.roadSigns.fieldStats, bodies: this.signPhysics.activeCount },
      people: this.people.count,
      cars: this.vehicles.vehicles.length,
      aiCars: this.traffic.aiCount,
    }));

    // the few road mirrors nearest to the camera draw the real scene (a small extra render each, before the main picture)
    this.junctionMirrors.renderLive(this.renderer, this.scene, this.camera);

    const shadowEvery = this.shadows.interval;
    if (shadowEvery > 1) {
      // low shadow level: the sun shadow map is redrawn only every n-th frame (the shadow box still follows the camera in texel steps)
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = this.shadowTick++ % shadowEvery === 0;
    } else if (!this.renderer.shadowMap.autoUpdate) {
      this.renderer.shadowMap.autoUpdate = true; // back to every frame (medium / high)
      this.shadowTick = 0;
    }
    this.renderer.render(this.scene, this.camera);
    this.perf.update(dt); // after the draw: renderer.info holds this frame's numbers
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
    this.stationSigns.update(this.camera.position.x + this.world.origin.origin.x, this.camera.position.z + this.world.origin.origin.z);
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
    const hits = this.trainContacts.check(list);
    // CRASH FEEL: a moving train does not push a vehicle along like a wall: it throws it aside / ahead and wrecks it
    if (hits.length > 0) {
      const now = performance.now();
      for (const h of hits) {
        if (h.kind !== 'vehicle' || h.trainSpeed < 2.5) continue;
        for (const v of this.vehicles.vehicles) {
          if (`vehicle-${this.vehicleIds.get(v)}` !== h.entity) continue;
          if (now - (this.trainStruck.get(v) ?? -1e9) < 2500) break; // one strike per contact
          this.trainStruck.set(v, now);
          v.getWorldPosition(this.tmpA);
          const nx = -h.dirZ;
          const nz = h.dirX;
          const side = (this.tmpA.x - h.carX) * nx + (this.tmpA.z - h.carZ) * nz >= 0 ? 1 : -1;
          let px = h.dirX + nx * side * 0.7;
          let pz = h.dirZ + nz * side * 0.7;
          const pl = Math.hypot(px, pz) || 1;
          px /= pl; pz /= pl;
          v.blastPush(px, pz, Math.min(28, h.trainSpeed * 1.1 + 3));
          v.blast(Math.min(120, 35 + h.trainSpeed * 5), false);
          break;
        }
      }
    }
  }

  /** Everything the site map shows: where you are (on foot / in a car / in the helicopter) and the parked vehicles. */
  /** CAR RACE: put the player in the race Jeep on the start line (on foot, or already in a Jeep). False = not possible now (a message says why). */
  private beginRace(c: RaceCourse): boolean {
    const p = c.start;
    const vm = this.vehicles;
    const cur = vm.driver;
    if (cur && cur.spec.id !== 'jeep') {
      this.toast.show('The race is run in the race Jeep: get out of your vehicle first (F).', 3400);
      return false;
    }
    if (!cur && (this.helis.pilot || this.boats.skipper)) {
      this.toast.show('Leave the aircraft / boat first: the race is run in a Jeep.', 3400);
      return false;
    }
    if (cur) this.raceJeep = cur; // already in a Jeep: race in it
    else {
      const jeep = vm.summon(SPECS.jeep, p.x, p.z, Math.atan2(p.hx, p.hz), p.y);
      vm.enter(jeep);
      this.raceJeep = jeep;
    }
    // the 5 AI racers on the starting grid (they wait on the line until GO)
    this.clearRacers();
    this.raceCars = this.traffic.spawnRacers(c);
    if (this.raceCars.length === 0) this.toast.show('No AI racers this time (no road way from the start to the finish): race against the clock.', 3600);
    return true;
  }

  /** CAR RACE: the AI racers leave (race over or cancelled). */
  private clearRacers(): void {
    for (const v of this.raceCars) this.traffic.removeRacer(v);
    this.raceCars = [];
  }

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
    this.world.origin.toWorld(this.camera.position, this.tmpVec);
    const camera = { x: this.tmpVec.x, y: this.tmpVec.y, z: this.tmpVec.z };
    return { me, camera, hours: this.environment.hours, viewHeading: view, others, stops: this.mapStops, stations: this.mapStations, mall: this.mall.position, library: this.library.position, building: this.protoBuilding.position, buildings: this.placedBuildings.markers, agro: this.agro.position, infra: this.world.terrain.infra.map((s) => ({ x: s.x, z: s.z, id: s.id, color: s.color, mark: s.mark })) };
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
    this.jobs.onCrash(v, dv); // the cargo of the job truck takes damage
    this.extras.onCrash(v, dv); // a bump during a taxi ride lowers the fare
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
      this.hud.setArea({ key: `agro-${rm?.id ?? (this.agro.level ? 'f1' : 'f0')}`, name: 'ইভিসি এগ্রো রিসার্চ ইনস্টিটিউট', kind: rm ? `${rm.bn} · ${this.agro.level ? 'দোতলা' : 'নিচতলা'}` : `কৃষি গবেষণা · ${this.agro.level ? 'দোতলা' : 'নিচতলা'}`, color: '#22c55e' });
      return;
    }
    if (this.world.terrain.agro.inside(p.x, p.z)) {
      this.hud.setArea({ key: 'agro-grounds', name: 'ইভিসি এগ্রো রিসার্চ ইনস্টিটিউট', kind: 'গবেষণা মাঠ ও প্রাঙ্গণ', color: '#22c55e' });
      return;
    }
    const fld = this.farm.info(p.x, p.z);
    if (fld) {
      this.hud.setArea({ key: `farm-${fld.field.id}`, name: `কৃষি জমি — ${fld.crop}`, kind: fld.work ? `${fld.stage} · ${fld.work}` : fld.stage, color: '#84cc16' });
      return;
    }
    const plant = this.infra.nameAt(p.x, p.z);
    if (plant) {
      this.hud.setArea({ key: plant.id, name: plant.name, kind: 'ইঞ্জিনিয়ারিং অবকাঠামো', color: plant.color });
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
  /**
   * N menu: bring vehicle `id` (a road vehicle, the tank or 'heli') next to the player, nose the way the player faces. Returns a Bangla message
   * when it cannot be done (inside a building, driving, swimming...), null when the vehicle now stands there.
   */
  private summonVehicle(id: string): string | null {
    const m = bn.vehicleMenu;
    if (!this.player.ready) return m.notReady;
    if (this.player.inVehicle || this.helis.pilot || this.boats.skipper) return m.busyDriving;
    if (this.player.swimming) return m.busySwimming;
    if (this.mall.inside || this.agro.inside) return m.busyInside;
    const heli = id === 'heli';
    const spec = heli ? null : SPECS[id as keyof typeof SPECS];
    if (!heli && !spec) return null;
    // the same vehicle cannot be called again within a minute (it would otherwise be teleported to the player again and again)
    const now = performance.now();
    const wait = SUMMON_COOLDOWN_MS - (now - (this.lastSummon.get(id) ?? -Infinity));
    if (wait > 0) return `${m.cooldown} (${Math.ceil(wait / 1000)} ${m.seconds})`;
    const T = this.world.terrain;
    const pw = this.player.getWorldPosition(new THREE.Vector3());
    const yaw = this.orbit.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // the way the camera / player looks
    const rx = -fz, rz = fx; // to the player's right
    const hx = spec ? spec.half.x : 2.2, hz = spec ? spec.half.z : 4.5;
    const side = heli ? 9 : hx + 2.6;
    const ahead = heli ? 4 : hz * 0.4;
    // five candidate spots (right, left, a bit further forward on each side, straight ahead): take the flattest one
    const cand: [number, number][] = [[side, ahead], [-side, ahead], [side, ahead + hz + 2], [-side, ahead + hz + 2], [0, hz + 4]];
    const hp = T.heightAt(pw.x, pw.z);
    // standing on an elevated road (bridge): the car must go on the deck, not on the ground under it
    const elevated = !heli && pw.y - hp > 1.5;
    let deckY: number | undefined = elevated ? pw.y : undefined;
    let deckFound = false;
    let best = cand[0], bd = Infinity;
    for (const [k, f] of cand) {
      const x = pw.x + rx * k + fx * f, z = pw.z + rz * k + fz * f;
      if (elevated) {
        const dy = this.vehicles.deckHeight(x, z, pw.y);
        if (dy !== null && !deckFound) { deckFound = true; deckY = dy; best = [k, f]; }
        continue;
      }
      const d = Math.abs(T.heightAt(x, z) - hp) + Math.abs(T.heightAt(x + fx * hz, z + fz * hz) - hp) + Math.abs(T.heightAt(x - fx * hz, z - fz * hz) - hp);
      if (d < bd) { bd = d; best = [k, f]; }
    }
    const x = pw.x + rx * best[0] + fx * best[1], z = pw.z + rz * best[0] + fz * best[1];
    const nose = Math.atan2(fx, fz);
    if (heli) this.helis.summon(new THREE.Vector3(x, T.heightAt(x, z) + 1.5, z), nose);
    else this.vehicles.summon(spec!, x, z, nose, deckY);
    this.lastSummon.set(id, now);
    return null;
  }

  /** When each vehicle id was last called from the N menu (performance.now()). */
  private lastSummon = new Map<string, number>();

  /** Day-night cycle / always night / always day (settings menu or the backslash key). */
  private setTimeMode(mode: TimeMode): void {
    this.environment.setTimeMode(mode);
    this.toast.show(mode === 'cycle' ? '🔄 দিন-রাত চলবে' : mode === 'night' ? '🌙 সবসময় রাত' : '☀️ সবসময় দিন');
    this.settingsMenu?.refresh();
  }

  /** Sound and voice on / off: one switch for every sound maker (M key or the settings menu). */
  private setMuted(muted: boolean): void {
    if (this.voice.isMuted !== muted) this.voice.toggleMute();
    this.helis.setMuted(muted);
    this.playerJet.setMuted(muted);
    this.boats.setMuted(muted);
    this.vehicles.setMuted(muted);
    this.combat.setMuted(muted);
    this.explosions.setMuted(muted);
    this.weather?.setMuted(muted);
    this.hudSettings.set('muted', muted);
    this.settingsMenu?.refresh();
  }

  private setMapZoom(zoom: number): void {
    this.minimap.setZoom(zoom);
    this.hudSettings.set('mapZoom', this.minimap.zoomLevel);
    this.settingsMenu?.refresh();
  }

  /** What stays on the screen (crosshair, Gold chip, weapon chip + stars, area name) follows the settings. */
  private applyHudOptions(): void {
    const v = this.hudSettings.values;
    if (this.waterFx && this.waterFx.qualityLevel !== v.waterQuality) this.waterFx.setQuality(v.waterQuality);
    this.weather?.configure({ mode: v.rainMode, level: v.rainLevel, quality: v.rainQuality });
    this.hud.setOptions({ crosshair: v.crosshair, weapon: v.weapon, areaAlways: v.areaAlways });
    this.economy.setBalanceVisible(v.gold);
  }

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

  /** Pixel ratio of the picture: normal (device, max 2), high, and 4K (the canvas is rendered with at least 3840 pixels across, max 3x). Heavy on weak GPUs. */
  private applyRenderScale(): void {
    const w = Math.max(1, this.container.clientWidth);
    const dpr = window.devicePixelRatio || 1;
    const h = Math.max(1, this.container.clientHeight);
    let ratio: number;
    if (this.renderQuality === 0) {
      // normal: the preset's ratio cap and pixel budget, times the automatic resolution factor
      const budget = Math.sqrt(Q.maxPixels / (w * h));
      ratio = Math.max(0.5, Math.min(dpr, Q.maxDpr, budget) * this.dynRes.scale);
    } else {
      // high / 4K: chosen by the player on purpose, left as it was
      ratio = this.renderQuality === 1 ? Math.min(Math.max(dpr, 1.5), 2) : Math.min(Math.max(dpr, 3840 / w), 3);
    }
    // Safari / iOS refuse canvases of more than ~16.7 M pixels (blank or lost context): stay below that in every mode
    ratio = Math.min(ratio, Math.sqrt(14_000_000 / (w * h)));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, this.container.clientHeight);
  }

  private cycleRenderQuality(): void {
    this.renderQuality = (this.renderQuality + 1) % 3;
    this.applyRenderScale();
    const names = ['সাধারণ কোয়ালিটি', 'হাই কোয়ালিটি', '4K আল্ট্রা কোয়ালিটি (ভারী — পিসি ধীর হলে ` চেপে কমান)'];
    this.toast.show('🖥️ ' + names[this.renderQuality] + ` · ${this.renderer.domElement.width}×${this.renderer.domElement.height}`, 3600);
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
    this.missions.dispose();
    this.missionMarkers.dispose();
    this.race.dispose();
    this.perf.dispose();
    this.unbindVisibility();
    this.ctxGuard.dispose();
    this.settingsMenu.dispose();
    this.waterFx.dispose();
    this.oxygenHud.dispose();
    this.vehicleMenu.dispose();
    this.parking.dispose();
    this.stationStructures.dispose();
    this.mall.dispose();
    this.engBoundary.dispose();
    this.library.dispose();
    this.evlab.dispose();
    this.protoBuilding.dispose();
    this.placedBuildings.dispose();
    this.fillBuildings.dispose();
    this.airport.dispose();
    this.airportSea.dispose();
    this.airplanes.dispose();
    this.planeRider.dispose();
    this.playerJet.dispose();
    this.army.dispose();
    this.agro.dispose();
    this.farm.dispose();
    this.infra.dispose();
    this.tankCannon.dispose();
    this.explosions.dispose();
    this.treeDestruction.dispose();
    this.busStops.dispose();
    this.trafficLights.dispose();
    this.streetLights.dispose();
    this.signPhysics.dispose();
    this.stationPhysics.dispose();
    this.roadSigns.dispose();
    this.junctionMirrors.dispose();
    this.roadside.dispose();
    this.lighthouseLight?.dispose();
    this.trainRider.dispose();
    this.ridePrompt.dispose();
    this.toast.dispose();
    this.jobs.dispose();
    this.extras.dispose();
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
    this.medianPhysics.dispose();
    this.medianView.dispose();
    this.roadNumbers.dispose();
    this.footpathPhysics.dispose();
    this.footpathView.dispose();
    this.uturnSigns.dispose();
    this.railPhysics.dispose();
    this.portPhysics.dispose();
    this.bridgeVisuals.dispose();
    this.roadDebug.dispose();
    this.railDebug.dispose();
    this.trainPhysics.dispose();
    this.signalLayer.dispose();
    this.stationSigns.dispose();
    this.trains.dispose();
    this.trainLayer.dispose();
    this.world.dispose();
    this.physics.dispose();
    this.renderer.dispose();
  }
}
