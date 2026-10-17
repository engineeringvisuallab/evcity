/**
 * WORLD ZONES (data only) - STAGE 11A: the WHOLE 10 km x 10 km map is divided into named, real-world-style areas
 * (city centre, residential, commercial, industrial, logistics, airport, seaport, farmland, villages, forest, mountain,
 * wetland, coast, sea ...). No building is placed here; later stages fill the areas.
 *
 * How a point finds its zone (`getWorldZoneAt`), first match wins:
 *   1. the AIRPORT and the SEAPORT (exact rectangles with their own sub-areas: runway, terminal, container yard ...),
 *   2. the SEA (south of the coast line table) - the harbour water of the seaport is part of the seaport,
 *   3. the nearest "district seed" (power diagram: borders are straight lines between seeds, so the map has real,
 *      irregular district borders instead of a square grid).
 * Every point of the map therefore has exactly one zone. Names are in i18n (`bn.worldZones`).
 * World coordinates: x east, z south, map centre = 0,0, the sea is in the south. Units: metres.
 */
import { Config } from '../core/Config';

export type WorldZoneKind =
  | 'urban-core'
  | 'commercial'
  | 'residential'
  | 'industrial'
  | 'logistics'
  | 'education'
  | 'civic'
  | 'utility'
  | 'airport'
  | 'seaport'
  | 'farmland'
  | 'village'
  | 'forest'
  | 'mountain'
  | 'wetland'
  | 'park'
  | 'coast'
  | 'sea';

/** Map colour of each zone kind (minimap overlay, HUD chip). */
export const WORLD_ZONE_COLOR: Record<WorldZoneKind, string> = {
  'urban-core': '#ff4d4d',
  commercial: '#ff8a3c',
  residential: '#ffd54a',
  industrial: '#9a7bd6',
  logistics: '#6f8fd6',
  education: '#37d6c4',
  civic: '#4aa3ff',
  utility: '#b8c0c8',
  airport: '#f4f4f4',
  seaport: '#14336e',
  farmland: '#c9d46a',
  village: '#d9a066',
  forest: '#3d8b4f',
  mountain: '#8d8f99',
  wetland: '#4fb3a6',
  park: '#5fd16a',
  coast: '#e8d08a',
  sea: '#4a90c8',
};

/** Kinds that count as built-up land (used by the tour / later stages). */
export const BUILT_UP_KINDS: ReadonlySet<WorldZoneKind> = new Set<WorldZoneKind>([
  'urban-core', 'commercial', 'residential', 'industrial', 'logistics', 'education', 'civic', 'utility', 'airport', 'seaport', 'village',
]);

export interface WorldZone {
  id: string;
  kind: WorldZoneKind;
  /** Seed position and weight (m) of the district: a bigger weight claims more land. */
  x: number;
  z: number;
  w: number;
}

const Z = (id: string, kind: WorldZoneKind, x: number, z: number, w: number): WorldZone => ({ id, kind, x, z, w });

/** The district seeds. Order does not matter (nearest weighted seed wins). Every id has a Bangla name in `bn.worldZones.names`. */
export const WORLD_ZONES: readonly WorldZone[] = [
  // --- central metropolis (site 0): core + 8 districts around it ---
  Z('metro-core', 'urban-core', 0, 0, 900),
  Z('north-admin', 'civic', 0, -1500, 600),
  Z('ne-business', 'commercial', 1150, -1150, 620),
  Z('east-homes', 'residential', 1550, 60, 600),
  Z('se-dense', 'residential', 1150, 1150, 600),
  Z('south-bazaar', 'commercial', 0, 1550, 600),
  Z('sw-homes', 'residential', -1150, 1150, 600),
  Z('west-homes', 'residential', -1550, 0, 620),
  Z('nw-university', 'education', -1150, -1150, 600),
  // --- outer ring (between the middle ring road and the outer freeway) ---
  Z('east-works', 'industrial', 2350, -600, 650),
  Z('east-logistics', 'logistics', 2350, 600, 550),
  Z('east-suburb', 'residential', 2300, 1550, 500),
  Z('port-industry', 'industrial', 1650, 2150, 600),
  Z('south-suburb', 'residential', 450, 2250, 550),
  Z('south-utility', 'utility', -550, 2150, 450),
  Z('sw-newtown', 'residential', -1900, 1750, 650),
  Z('west-suburb', 'residential', -2450, 500, 500),
  Z('sw-medical', 'civic', -1700, 800, 300),
  Z('west-bazaar', 'commercial', -2300, -350, 300),
  Z('east-mall', 'commercial', 1900, 1000, 280),
  // --- north: industrial + logistics city (site 2) ---
  Z('north-heavy', 'industrial', 800, -3350, 650),
  Z('north-logistics', 'logistics', 200, -3400, 450),
  Z('north-power', 'utility', 50, -3900, 450),
  Z('north-labour', 'residential', -450, -3050, 450),
  Z('north-homes', 'residential', 250, -2550, 450),
  // --- north-west: satellite university town (site 1) ---
  Z('nw-town', 'residential', -2000, -2800, 600),
  Z('nw-campus', 'education', -1450, -2800, 350),
  Z('nw-solar', 'utility', -2100, -2150, 400),
  // --- farmland, forest, villages ---
  Z('west-farms', 'farmland', -3100, -900, 650),
  Z('sw-farms', 'farmland', -3300, 1900, 600),
  Z('east-farms', 'farmland', 2100, -1800, 550),
  Z('ne-farms', 'farmland', 3000, -1500, 500),
  Z('north-farms', 'farmland', 1500, -2600, 500),
  Z('nw-farms', 'farmland', -1300, -3600, 500),
  Z('center-hills', 'forest', -800, -1950, 500),
  Z('ne-forest', 'forest', 2400, -3000, 550),
  Z('nw-forest', 'forest', -3100, -3200, 600),
  Z('village-west', 'village', -2750, -1600, 320),
  Z('village-east', 'village', 3150, -700, 320),
  Z('village-sw', 'village', -3550, 600, 320),
  Z('village-ne', 'village', 3550, -2300, 300),
  // --- lakes and wetlands ---
  Z('west-lake', 'wetland', -2400, 150, 260),
  Z('central-lake', 'park', 1000, 400, 260),
  Z('north-lake', 'wetland', 800, -1750, 260),
  Z('nw-lake', 'wetland', -1200, -2850, 250),
  Z('ne-lake', 'wetland', 3300, -2900, 300),
  Z('east-lake', 'wetland', 3400, 450, 300),
  // --- coast ---
  Z('sw-beach', 'coast', -3000, 2800, 700),
  Z('river-delta', 'wetland', -300, 2800, 650),
  Z('south-beach', 'coast', 700, 2850, 450),
  Z('east-beach', 'coast', 3300, 2750, 700),
  Z('safari-park', 'park', 3000, 1900, 550),
  // --- mountain rim ---
  Z('nw-peaks', 'mountain', -4300, -4200, 1200),
  Z('north-ridge-west', 'mountain', -1300, -4500, 700),
  Z('north-ridge', 'mountain', -200, -4500, 700),
  Z('ne-peaks', 'mountain', 4300, -4200, 1200),
  Z('west-hills-north', 'mountain', -4400, -1800, 1100),
  Z('west-hills-south', 'mountain', -4400, 1200, 1000),
  Z('east-hills-north', 'mountain', 4400, -1500, 1100),
  Z('east-hills-south', 'mountain', 4400, 1300, 1000),
];

/* ------------------------------------------------------------------ coast + sea */

/**
 * Where the sea starts (z) for a given x: measured from the terrain (first water cell going south). The river mouth and lakes
 * near x = -500..0 are ignored. The sea itself is the zone 'sea-south'.
 */
const COAST: ReadonlyArray<readonly [number, number]> = [
  [-5000, 3000], [-4000, 2740], [-3500, 2920], [-3000, 2960], [-2500, 3020], [-2000, 2940], [-1500, 2940], [-1000, 2940],
  [-500, 3000], [0, 3000], [500, 3160], [1000, 2940], [1500, 2840], [2000, 2860], [2500, 3020], [3000, 3040], [3500, 2980],
  [4000, 3000], [4500, 3100], [5000, 3100],
];

/** z of the shoreline at x (piecewise linear). */
export function coastZ(x: number): number {
  if (x <= COAST[0][0]) return COAST[0][1];
  for (let i = 1; i < COAST.length; i++) {
    if (x <= COAST[i][0]) {
      const [x0, z0] = COAST[i - 1];
      const [x1, z1] = COAST[i];
      return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
  }
  return COAST[COAST.length - 1][1];
}

/* ------------------------------------------------------------------ facilities (airport, seaport) */

export type FacilityAreaKind =
  | 'runway' | 'taxiway' | 'apron' | 'terminal' | 'cargo' | 'hangar' | 'fuel' | 'parking' | 'tower' | 'grounds'
  | 'container' | 'bulk' | 'oil' | 'fishing' | 'admin' | 'quay' | 'basin';

export interface FacilityArea {
  id: string;
  kind: FacilityAreaKind;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Facility {
  id: 'airport' | 'seaport';
  kind: 'airport' | 'seaport';
  /** Outer boundary (axis-aligned, metres). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Sub-areas, first match wins; the last one ('grounds' / 'quay') catches the rest. */
  areas: readonly FacilityArea[];
}

const FA = (id: string, kind: FacilityAreaKind, x0: number, z0: number, x1: number, z1: number): FacilityArea => ({ id, kind, x0, z0, x1, z1 });

/**
 * INTERNATIONAL AIRPORT - north-east, 1.0 km from the industrial city (air cargo), away from the dense city (noise).
 * One runway 09/27 (east-west), 2.05 km long x 60 m wide, with a parallel taxiway. Passenger side on the south (towards the
 * railway station and the freeway), cargo + hangars + fuel on the north. The runway sits on the flattest strip of the site (26-50 m). The ground is rolling land: a later stage grades it flat.
 */
export const AIRPORT: Facility = {
  id: 'airport',
  kind: 'airport',
  x0: 1150,
  z0: -4100,
  x1: 3450,
  z1: -3500,
  areas: [
    FA('airport-runway', 'runway', 1350, -3810, 3400, -3750),
    FA('airport-tower', 'tower', 2680, -3700, 2740, -3650),
    FA('airport-taxiway', 'taxiway', 1400, -3735, 3350, -3705),
    FA('airport-apron', 'apron', 1950, -3705, 2750, -3640),
    FA('airport-terminal', 'terminal', 2050, -3640, 2650, -3560),
    FA('airport-parking', 'parking', 2050, -3560, 2650, -3500),
    FA('airport-fuel', 'fuel', 1450, -4000, 1900, -3830),
    FA('airport-hangars', 'hangar', 1900, -4000, 2300, -3830),
    FA('airport-cargo', 'cargo', 2300, -4000, 3100, -3830),
    FA('airport-grounds', 'grounds', 1150, -4100, 3450, -3500),
  ],
};

/**
 * SEAPORT - south coast (the shoreline is at z ~ 2850 here and the sea is 9 m deep 100 m off shore, 20 m at 300 m).
 * West to east: fishing harbour, bulk / general cargo, container terminal (the biggest), oil terminal; port administration
 * and customs behind them. The sea part ('seaport-basin') is the harbour basin where ships dock.
 * The south coast collector road (S27) already runs along the back of the port: it becomes the port road.
 */
export const SEAPORT: Facility = {
  id: 'seaport',
  kind: 'seaport',
  x0: 1050,
  z0: 2540,
  x1: 2450,
  z1: 3250,
  areas: [
    FA('seaport-fishing', 'fishing', 1050, 2650, 1300, 2850),
    FA('seaport-bulk', 'bulk', 1300, 2650, 1650, 2850),
    FA('seaport-container', 'container', 1650, 2650, 2250, 2850),
    FA('seaport-oil', 'oil', 2250, 2650, 2450, 2850),
    FA('seaport-admin', 'admin', 1300, 2540, 2100, 2650),
    FA('seaport-quay', 'quay', 1050, 2540, 2450, 2850),
    FA('seaport-basin', 'basin', 1050, 2850, 2450, 3250),
  ],
};

export const FACILITIES: readonly Facility[] = [AIRPORT, SEAPORT];

const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

/* ------------------------------------------------------------------ lookup */

export interface WorldZoneHit {
  /** Id of the zone (district seed id, 'airport', 'seaport' or 'sea-south'). */
  id: string;
  kind: WorldZoneKind;
  /** Facility sub-area (runway, terminal, container terminal ...), or null. */
  area: FacilityArea | null;
}

const SEA_HIT: WorldZoneHit = { id: 'sea-south', kind: 'sea', area: null };
const HITS = new Map<string, WorldZoneHit>(WORLD_ZONES.map((z) => [z.id, { id: z.id, kind: z.kind, area: null }]));

/** The zone of a point of the map (or just outside it). Pure data, no terrain needed. */
export function getWorldZoneAt(x: number, z: number): WorldZoneHit {
  for (const f of FACILITIES) {
    if (!inRect(f, x, z)) continue;
    const area = f.areas.find((a) => inRect(a, x, z)) ?? null;
    return { id: f.id, kind: f.kind, area };
  }
  if (z > coastZ(x) + 20) return SEA_HIT;
  let best = WORLD_ZONES[0];
  let bestD = Infinity;
  for (const s of WORLD_ZONES) {
    const d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) - s.w * s.w;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return HITS.get(best.id)!;
}

/** All zone ids (seeds + airport + seaport + sea). */
export const WORLD_ZONE_IDS: readonly string[] = [...WORLD_ZONES.map((z) => z.id), 'airport', 'seaport', 'sea-south'];

/** Rasterised zone map for the minimap and the tests: row-major (z rows from north), value = index into WORLD_ZONE_IDS. */
export function rasterizeWorldZones(cell = 100): { n: number; cell: number; ids: Uint8Array; kinds: WorldZoneKind[] } {
  const half = Config.world.size / 2;
  const n = Math.round(Config.world.size / cell);
  const ids = new Uint8Array(n * n);
  const index = new Map(WORLD_ZONE_IDS.map((id, i) => [id, i]));
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < n; i++) ids[j * n + i] = index.get(getWorldZoneAt(-half + (i + 0.5) * cell, z).id)!;
  }
  const kinds: WorldZoneKind[] = WORLD_ZONE_IDS.map((id) => HITS.get(id)?.kind ?? (id === 'airport' ? 'airport' : id === 'seaport' ? 'seaport' : 'sea'));
  return { n, cell, ids, kinds };
}
