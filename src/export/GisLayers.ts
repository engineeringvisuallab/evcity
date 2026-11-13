// The GIS layers the game can export. To export one more kind of object: add ONE entry to GIS_LAYERS (id, label, build()).
// build() reads the game's own data (TerrainGenerator = roads, rivers, lakes, rail; the building / zone tables) and returns a GisLayer.
// Everything here is pure data: no scene, no DOM, so it also runs headless (scripts/export-test.ts).
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../buildings/Placements';
import { FILL_PLACEMENTS } from '../buildings/PlacementsFill';
import { FACILITIES, WORLD_ZONES, WORLD_ZONE_IDS, rasterizeWorldZones } from '../city/WorldZones';
import { ENGINEERING_AREAS } from '../city/EngineeringZones';
import { ROAD_STATION_SITES } from '../parking/RoadStationSites';
import { PLATFORMS } from '../port/PortPlan';
import { medianHalfAt, planMedians } from '../roads/MedianPlan';
import { planFootpaths } from '../roads/FootpathPlan';
import { toGrid, type GisFeature, type GisField, type GisLayer } from './GisWriter';

/** Things the game has to hand in because they live in files that need three.js (the building model registry, the street-lamp planner). */
export interface GisContext {
  /** Number of floors of a building model id. Unknown = 2. */
  buildingFloors?: (id: string) => number | undefined;
  /** The street-lamp planner (planStreetLights). Without it the lamp layer is empty. */
  planLamps?: (roads: TerrainGenerator['roads']) => { x: number; y: number; z: number; scale: number; pool: number }[];
}

export interface GisLayerDef {
  id: string;
  label: string;
  hint: string;
  /** true: the layer may legitimately be empty (e.g. the lamp layer when the game does not hand in the lamp planner). */
  optional?: boolean;
  build(t: TerrainGenerator, ctx: GisContext): GisLayer;
}

const C = (name: string, len: number): GisField => ({ name, type: 'C', len });
const N = (name: string, len: number, dec = 0): GisField => ({ name, type: 'N', len, dec });
const r2 = (n: number): number => Math.round(n * 100) / 100;

const roadsCenterline = (t: TerrainGenerator): GisLayer => {
  const bridges = new Map<number, number>();
  for (const b of t.roads.bridges) bridges.set(b.roadId, (bridges.get(b.roadId) ?? 0) + 1);
  const features: GisFeature[] = t.roads.roads.map((r) => {
    const pts: number[][] = [];
    for (let i = 0; i < r.xs.length; i++) pts.push(toGrid(r.xs[i], r.zs[i], r.ys[i]));
    return {
      parts: [pts],
      attrs: [r.id, r.name, r.kind, r.tier, r.lanes, r2(2 * r.halfWidth), r2(2 * r.medianHalf), r.speedKmh, r2(r.length), r.earth ? 1 : 0, bridges.get(r.id) ?? 0, r.closed ? 1 : 0],
    };
  });
  return {
    id: 'roads_centerline', label: 'Road centrelines', geom: 'polyline', hasZ: true, features,
    fields: [N('ROAD_ID', 6), C('NAME', 12), C('KIND', 12), N('TIER', 2), N('LANES', 3), N('WIDTH_M', 8, 2), N('MEDIAN_M', 8, 2), N('SPEED_KMH', 4), N('LENGTH_M', 10, 1), N('EARTH', 1), N('BRIDGES', 3), N('CLOSED', 1)],
  };
};

const bridges = (t: TerrainGenerator): GisLayer => {
  const byId = new Map(t.roads.roads.map((r) => [r.id, r]));
  const features: GisFeature[] = [];
  for (const b of t.roads.bridges) {
    const r = byId.get(b.roadId);
    if (!r) continue;
    const pts: number[][] = [];
    for (let i = b.i0; i <= b.i1; i++) pts.push(toGrid(r.xs[i], r.zs[i], r.ys[i]));
    if (pts.length < 2) continue;
    features.push({ parts: [pts], attrs: [b.id, b.roadId, r.name, b.type, r2(b.spanM), r2(b.lengthM), r2(2 * b.deckHalfWidth), r2(b.clearanceM), b.material, b.maxLoadT, r2(b.maxSpanM)] });
  }
  return {
    id: 'bridges', label: 'Bridges (road decks)', geom: 'polyline', hasZ: true, features,
    fields: [N('BRIDGE_ID', 5), N('ROAD_ID', 6), C('ROAD_NAME', 12), C('TYPE', 6), N('SPAN_M', 8, 1), N('LENGTH_M', 8, 1), N('DECK_W_M', 6, 1), N('CLEAR_M', 6, 1), C('MATERIAL', 24), N('MAXLOAD_T', 6), N('MAXSPAN_M', 8, 1)],
  };
};

const junctionPads = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = t.roads.pads.map((p) => {
    const ring: number[][] = [];
    for (let i = 0; i < p.outline.length; i += 2) ring.push(toGrid(p.outline[i], p.outline[i + 1], p.y));
    return { parts: [ring], attrs: [p.id, p.kind, p.arms.length, r2(p.y)] };
  }).filter((f) => f.parts[0].length >= 3);
  return {
    id: 'junction_pads', label: 'Junctions (flat pads)', geom: 'polygon', hasZ: false, features,
    fields: [N('PAD_ID', 5), C('KIND', 8), N('ARMS', 2), N('HEIGHT_M', 8, 2)],
  };
};

/** Every placed building: the hand-placed ones (villages, landmarks) and the city fill (hundreds of houses, shops, apartment blocks). */
const ALL_PLACEMENTS = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];

const buildings = (): GisLayer => {
  const features: GisFeature[] = ALL_PLACEMENTS.map((p) => {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const ring = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
      const lx = (a * p.W) / 2;
      const lz = (b * p.D) / 2;
      return toGrid(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
    });
    return { parts: [ring], attrs: [p.id, p.zone, p.W, p.D, r2((p.yaw * 180) / Math.PI)] };
  });
  return {
    id: 'buildings', label: 'Buildings (footprint incl. yard)', geom: 'polygon', hasZ: false, features,
    fields: [C('MODEL', 24), C('ZONE', 24), N('W_M', 6, 1), N('D_M', 6, 1), N('YAW_DEG', 8, 2)],
  };
};

const rivers = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = t.rivers.segments.map((s, i) => ({
    parts: [[toGrid(s.ax, s.az, s.wsA), toGrid(s.bx, s.bz, s.wsB)]],
    attrs: [i, r2(2 * s.hwA), r2(2 * s.hwB), r2(s.wdA), r2(s.wdB), r2(s.len), s.steps],
  }));
  return {
    id: 'rivers', label: 'Rivers (segments)', geom: 'polyline', hasZ: true, features,
    fields: [N('SEG_ID', 6), N('WIDTH_A_M', 7, 2), N('WIDTH_B_M', 7, 2), N('DEPTH_A_M', 7, 2), N('DEPTH_B_M', 7, 2), N('LENGTH_M', 8, 2), N('FALLS', 3)],
  };
};

const lakes = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = t.lakes.lakes.map((l, i) => {
    const ring: number[][] = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      ring.push(toGrid(l.x + Math.cos(a) * l.R, l.z + Math.sin(a) * l.R, l.level));
    }
    return { parts: [ring], attrs: [i, l.isPond ? 'pond' : 'lake', r2(l.R), r2(l.level), r2(l.depth)] };
  });
  return {
    id: 'lakes', label: 'Lakes and ponds (round outline)', geom: 'polygon', hasZ: false, features,
    fields: [N('LAKE_ID', 4), C('TYPE', 6), N('RADIUS_M', 8, 2), N('LEVEL_M', 8, 2), N('DEPTH_M', 8, 2)],
  };
};

const riverPonds = (t: TerrainGenerator): GisLayer => ({
  id: 'river_ponds', label: 'River-end ponds', geom: 'point', hasZ: true,
  features: t.rivers.ponds.map((p, i) => ({ parts: [[toGrid(p.x, p.z, p.level)]], attrs: [i, r2(p.level)] })),
  fields: [N('POND_ID', 4), N('LEVEL_M', 8, 2)],
});

const zoneCentres = (): GisLayer => ({
  id: 'zone_centres', label: 'District centres', geom: 'point', hasZ: false,
  features: WORLD_ZONES.map((z) => ({ parts: [[toGrid(z.x, z.z)]], attrs: [z.id, z.kind, z.w] })),
  fields: [C('ZONE_ID', 24), C('KIND', 16), N('WEIGHT_M', 7)],
});

const railLines = (t: TerrainGenerator): GisLayer => ({
  id: 'rail_lines', label: 'Railway lines', geom: 'polyline', hasZ: true,
  features: t.rail.edges.map((e) => {
    const pts: number[][] = [];
    for (let i = 0; i < e.xs.length; i++) pts.push(toGrid(e.xs[i], e.zs[i], e.design[i]));
    return { parts: [pts], attrs: [e.id, e.from, e.to, r2(e.length), r2(e.minRadius), r2(e.maxGrade * 100)] };
  }),
  fields: [C('EDGE_ID', 24), C('FROM_ST', 20), C('TO_ST', 20), N('LENGTH_M', 10, 1), N('MINRAD_M', 9, 1), N('MAXGRADE_P', 6, 2)],
});

const railStations = (t: TerrainGenerator): GisLayer => ({
  id: 'rail_stations', label: 'Railway stations', geom: 'point', hasZ: true,
  features: t.rail.stations.map((s) => ({ parts: [[toGrid(s.x, s.z, s.level)]], attrs: [s.id, s.kind, s.radius, s.elevated ? 1 : 0] })),
  fields: [C('STATION', 24), C('KIND', 10), N('RADIUS_M', 6), N('ELEVATED', 1)],
});

// ---------------------------------------------------------------- more layers: every pure-data object of the game ----------------------------------------------------------------
const rect = (x0: number, z0: number, x1: number, z1: number, y = 0): number[][] => [toGrid(x0, z0, y), toGrid(x1, z0, y), toGrid(x1, z1, y), toGrid(x0, z1, y)];

const roadsArea = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = [];
  for (const r of t.roads.roads) {
    if (r.xs.length < 2) continue;
    const L: number[][] = [];
    const R: number[][] = [];
    for (let i = 0; i < r.xs.length; i++) {
      L.push(toGrid(r.xs[i] + r.nx[i] * r.halfWidth, r.zs[i] + r.nz[i] * r.halfWidth, r.ys[i]));
      R.push(toGrid(r.xs[i] - r.nx[i] * r.halfWidth, r.zs[i] - r.nz[i] * r.halfWidth, r.ys[i]));
    }
    features.push({ parts: [[...L, ...R.reverse()]], attrs: [r.id, r.name, r.kind, r.lanes, r2(2 * r.halfWidth), r2(r.length)] });
  }
  return {
    id: 'roads_area', label: 'Road surface (width outline)', geom: 'polygon', hasZ: false, features,
    fields: [N('ROAD_ID', 6), C('NAME', 12), C('KIND', 12), N('LANES', 3), N('WIDTH_M', 8, 2), N('LENGTH_M', 10, 1)],
  };
};

const roadMedians = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = [];
  for (const run of planMedians(t.roads).runs) {
    if (run.n < 2) continue;
    const L: number[][] = [];
    const R: number[][] = [];
    for (let k = 0; k < run.n; k++) {
      const o = k * 8;
      const hw = medianHalfAt(run, k);
      L.push(toGrid(run.p[o] + run.p[o + 3] * hw, run.p[o + 2] + run.p[o + 4] * hw));
      R.push(toGrid(run.p[o] - run.p[o + 3] * hw, run.p[o + 2] - run.p[o + 4] * hw));
    }
    features.push({ parts: [[...L, ...R.reverse()]], attrs: [run.roadId, r2(run.medianHalf), r2(run.kerbH), r2(run.p[(run.n - 1) * 8 + 7] - run.p[7])] });
  }
  return {
    id: 'road_medians', label: 'Road medians', geom: 'polygon', hasZ: false, features,
    fields: [N('ROAD_ID', 6), N('HALF_W_M', 6, 2), N('KERB_H_M', 6, 2), N('LENGTH_M', 8, 1)],
  };
};

const footpaths = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = [];
  for (const run of planFootpaths(t.roads).runs) {
    if (run.n < 2) continue;
    const A: number[][] = [];
    const B: number[][] = [];
    for (let k = 0; k < run.n; k++) {
      const o = k * 8;
      const nl = Math.hypot(run.p[o + 3], run.p[o + 4]) || 1;
      const nx = run.p[o + 3] / nl;
      const nz = run.p[o + 4] / nl;
      A.push(toGrid(run.p[o] + nx * run.side * run.hw, run.p[o + 2] + nz * run.side * run.hw));
      B.push(toGrid(run.p[o] + nx * run.side * (run.hw + run.width), run.p[o + 2] + nz * run.side * (run.hw + run.width)));
    }
    features.push({ parts: [[...A, ...B.reverse()]], attrs: [run.roadId, run.side === 1 ? 'left' : 'right', r2(run.width), r2(run.p[(run.n - 1) * 8 + 7] - run.p[7])] });
  }
  return {
    id: 'footpaths', label: 'Footpaths', geom: 'polygon', hasZ: false, features,
    fields: [N('ROAD_ID', 6), C('SIDE', 5), N('WIDTH_M', 6, 2), N('LENGTH_M', 8, 1)],
  };
};

const pedCrossings = (t: TerrainGenerator): GisLayer => ({
  id: 'ped_crossings', label: 'Pedestrian crossings', geom: 'point', hasZ: false,
  features: planMedians(t.roads).crossings.map((c) => ({ parts: [[toGrid(c.x, c.z)]], attrs: [c.roadId, r2(c.s), c.street ? 1 : 0, r2(c.mouth ?? 0), r2(c.b - c.a)] })),
  fields: [N('ROAD_ID', 6), N('S_M', 8, 1), N('STREET', 1), N('MOUTH_M', 6, 1), N('GAP_M', 6, 1)],
});

const streetLights = (t: TerrainGenerator, ctx: GisContext): GisLayer => ({
  id: 'street_lights', label: 'Street lamps', geom: 'point', hasZ: true,
  features: (ctx.planLamps?.(t.roads) ?? []).map((l, i) => ({ parts: [[toGrid(l.x, l.z, l.y)]], attrs: [i, r2(8 * l.scale), r2(l.pool)] })),
  fields: [N('LAMP_ID', 7), N('POLE_H_M', 6, 1), N('POOL_M', 6, 1)],
});

const railSegments = (t: TerrainGenerator): GisLayer => {
  const features: GisFeature[] = [];
  for (const e of t.rail.edges) {
    const at = (s: number): number[] => {
      let i = 0;
      while (i < e.cum.length - 2 && e.cum[i + 1] < s) i++;
      const seg = e.cum[i + 1] - e.cum[i];
      const f = seg > 1e-6 ? Math.min(1, Math.max(0, (s - e.cum[i]) / seg)) : 0;
      return toGrid(e.xs[i] + (e.xs[i + 1] - e.xs[i]) * f, e.zs[i] + (e.zs[i + 1] - e.zs[i]) * f, e.design[i] + (e.design[i + 1] - e.design[i]) * f);
    };
    for (const sg of e.segments) {
      if (sg.s1 - sg.s0 < 0.5) continue;
      const pts = [at(sg.s0)];
      for (let i = 0; i < e.cum.length; i++) if (e.cum[i] > sg.s0 && e.cum[i] < sg.s1) pts.push(toGrid(e.xs[i], e.zs[i], e.design[i]));
      pts.push(at(sg.s1));
      features.push({ parts: [pts], attrs: [e.id, sg.kind, sg.why, r2(sg.s1 - sg.s0)] });
    }
  }
  return {
    id: 'rail_segments', label: 'Rail: ground / bridge / tunnel / cut-and-cover', geom: 'polyline', hasZ: true, features,
    fields: [C('EDGE_ID', 24), C('KIND', 9), C('WHY', 10), N('LENGTH_M', 9, 1)],
  };
};

const railPiers = (t: TerrainGenerator): GisLayer => ({
  id: 'rail_piers', label: 'Rail viaduct piers', geom: 'point', hasZ: true, optional: true,
  features: t.rail.piers.map((p) => ({ parts: [[toGrid(p.x, p.z, p.baseY)]], attrs: [p.edgeId, r2(p.s), r2(p.baseY), r2(p.deckY)] })),
  fields: [C('EDGE_ID', 24), N('S_M', 8, 1), N('BASE_Y', 8, 2), N('DECK_Y', 8, 2)],
});

const railCrossings = (t: TerrainGenerator): GisLayer => ({
  id: 'rail_crossings', label: 'Road / rail crossings', geom: 'point', hasZ: false, optional: true,
  features: t.rail.crossings.map((c) => ({ parts: [[toGrid(c.x, c.z)]], attrs: [c.edgeId, r2(c.s), c.roadId, c.roadName, c.roadTier, c.kind] })),
  fields: [C('EDGE_ID', 24), N('S_M', 8, 1), N('ROAD_ID', 6), C('ROAD_NAME', 12), N('ROAD_TIER', 2), C('KIND', 18)],
});

const railLinks = (t: TerrainGenerator): GisLayer => ({
  id: 'rail_links', label: 'Rail station through-links', geom: 'polyline', hasZ: true, optional: true,
  features: t.rail.links.map((l) => {
    const pts: number[][] = [];
    for (let i = 0; i < l.xs.length; i++) pts.push(toGrid(l.xs[i], l.zs[i], l.level));
    return { parts: [pts], attrs: [l.id, l.station, r2(l.length), r2(l.minRadius), l.elevated ? 1 : 0] };
  }),
  fields: [C('LINK_ID', 24), C('STATION', 20), N('LENGTH_M', 8, 1), N('MINRAD_M', 8, 1), N('ELEVATED', 1)],
});

const engineeringAreas = (): GisLayer => ({
  id: 'engineering_areas', label: 'Engineering campus areas', geom: 'polygon', hasZ: false,
  features: ENGINEERING_AREAS.map((a) => ({ parts: [rect(a.x0, a.z0, a.x1, a.z1)], attrs: [a.id, a.group, a.ground, a.branches.join(',')] })),
  fields: [C('AREA_ID', 24), C('GROUP', 12), C('GROUND', 6), C('BRANCHES', 80)],
});

const facilityAreas = (): GisLayer => {
  const features: GisFeature[] = [];
  for (const f of FACILITIES) {
    features.push({ parts: [rect(f.x0, f.z0, f.x1, f.z1)], attrs: [f.id, 'boundary', 'boundary'] });
    for (const a of f.areas) features.push({ parts: [rect(a.x0, a.z0, a.x1, a.z1)], attrs: [f.id, a.id, a.kind] });
  }
  return {
    id: 'facility_areas', label: 'Airport / seaport / army areas', geom: 'polygon', hasZ: false, features,
    fields: [C('FACILITY', 14), C('AREA_ID', 24), C('KIND', 12)],
  };
};

const portPlatforms = (): GisLayer => ({
  id: 'port_platforms', label: 'Port platforms (quay decks)', geom: 'polygon', hasZ: false,
  features: PLATFORMS.map((p) => ({ parts: [rect(p.x0, p.z0, p.x1, p.z1, p.h)], attrs: [p.id, r2(p.h)] })),
  fields: [C('PLATFORM', 12), N('DECK_M', 6, 2)],
});

const stationSites = (): GisLayer => ({
  id: 'station_sites', label: 'Fuel stations and charge points', geom: 'polygon', hasZ: false,
  features: ROAD_STATION_SITES.map((p) => {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    const ring = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
      const lx = a * p.hw;
      const lz = b * p.hd;
      return toGrid(p.x + lx * c + lz * sn, p.z - lx * sn + lz * c);
    });
    return { parts: [ring], attrs: [p.id, p.kind, p.road, r2(p.y)] };
  }),
  fields: [C('SITE_ID', 14), C('KIND', 6), C('ROAD', 8), N('FLOOR_M', 7, 2)],
});

/** District map as polygons: the 100 m zone raster is merged into rectangles (a row-run, grown downwards while the next row has the same run). */
const worldZones = (): GisLayer => {
  const { n, cell, ids, kinds } = rasterizeWorldZones(100);
  const half = (n * cell) / 2;
  const open = new Map<string, { id: number; i0: number; i1: number; j0: number; j1: number }>();
  const done: { id: number; i0: number; i1: number; j0: number; j1: number }[] = [];
  for (let j = 0; j < n; j++) {
    const seen = new Set<string>();
    for (let i = 0; i < n; ) {
      const id = ids[j * n + i];
      let k = i;
      while (k + 1 < n && ids[j * n + k + 1] === id) k++;
      const key = `${id}:${i}:${k}`;
      seen.add(key);
      const o = open.get(key);
      if (o) o.j1 = j;
      else open.set(key, { id, i0: i, i1: k, j0: j, j1: j });
      i = k + 1;
    }
    for (const [key, r] of open) if (!seen.has(key)) { done.push(r); open.delete(key); }
  }
  done.push(...open.values());
  const byZone = new Map<number, number[][][]>();
  for (const r of done) {
    const ring = rect(-half + r.i0 * cell, -half + r.j0 * cell, -half + (r.i1 + 1) * cell, -half + (r.j1 + 1) * cell);
    (byZone.get(r.id) ?? byZone.set(r.id, []).get(r.id)!).push(ring);
  }
  const features: GisFeature[] = [];
  for (const [id, parts] of byZone) features.push({ parts, attrs: [WORLD_ZONE_IDS[id], kinds[id] ?? '', r2((parts.length ? done.filter((r) => r.id === id).reduce((a, r) => a + (r.i1 - r.i0 + 1) * (r.j1 - r.j0 + 1), 0) : 0) * cell * cell / 1e6)] });
  return {
    id: 'world_zones', label: 'Districts (zone map polygons)', geom: 'polygon', hasZ: false, features,
    fields: [C('ZONE_ID', 24), C('KIND', 16), N('AREA_KM2', 9, 3)],
  };
};

const FLOOR_H = 3.0; // m per floor (same as BuildingKit)
/** Real 3D: every placed building as an extruded block (ESRI MultiPatch: 4 walls + roof + floor, each a closed ring with heights). Footprint = the placement box (it includes the yard). */
const buildings3d = (t: TerrainGenerator, ctx: GisContext): GisLayer => {
  const features: GisFeature[] = [];
  for (const p of ALL_PLACEMENTS) {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
      const lx = (a * p.W) / 2;
      const lz = (b * p.D) / 2;
      return [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
    });
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [cx, cz] of corners) { const h = t.heightAt(cx, cz); minY = Math.min(minY, h); maxY = Math.max(maxY, h); }
    const floors = Math.max(1, ctx.buildingFloors?.(p.id) ?? 2);
    const base = minY;
    const floorY = maxY + 0.02;
    const top = floorY + floors * FLOOR_H;
    const lo = corners.map(([cx, cz]) => toGrid(cx, cz, base));
    const hi = corners.map(([cx, cz]) => toGrid(cx, cz, top));
    const parts: number[][][] = [];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; parts.push([lo[i], lo[j], hi[j], hi[i]]); }
    parts.push(hi, lo);
    features.push({ parts, partTypes: parts.map(() => 5), attrs: [p.id, p.zone, floors, r2(top - base), r2(base), r2(top)] });
  }
  return {
    id: 'buildings_3d', label: 'Buildings, real 3D blocks (MultiPatch)', geom: 'multipatch', hasZ: true, features,
    fields: [C('MODEL', 24), C('ZONE', 24), N('FLOORS', 3), N('HEIGHT_M', 7, 2), N('BASE_Z', 8, 2), N('TOP_Z', 8, 2)],
  };
};

export const GIS_LAYERS: readonly GisLayerDef[] = [
  { id: 'roads_centerline', label: 'রাস্তার সেন্টারলাইন', hint: 'সব রাস্তা, উচ্চতা (Z) সহ', build: roadsCenterline },
  { id: 'bridges', label: 'ব্রিজ', hint: 'ব্রিজের ডেক, স্প্যান ও লোড', build: bridges },
  { id: 'junction_pads', label: 'জংশন', hint: 'সমতল জংশনের আউটলাইন (পলিগন)', build: junctionPads },
  { id: 'buildings', label: 'বিল্ডিং', hint: 'বিল্ডিংয়ের ফুটপ্রিন্ট (উঠান সহ)', build: () => buildings() },
  { id: 'rivers', label: 'নদী', hint: 'নদীর অংশ, প্রস্থ ও গভীরতা', build: rivers },
  { id: 'lakes', label: 'হ্রদ ও পুকুর', hint: 'গোল আউটলাইন', build: lakes },
  { id: 'river_ponds', label: 'নদীর শেষের পুকুর', hint: 'পয়েন্ট', build: riverPonds },
  { id: 'rail_lines', label: 'রেললাইন', hint: 'ট্র্যাকের সেন্টারলাইন', build: railLines },
  { id: 'rail_stations', label: 'রেল স্টেশন', hint: 'পয়েন্ট', build: railStations },
  { id: 'zone_centres', label: 'এলাকার কেন্দ্র', hint: 'জোনের কেন্দ্রবিন্দু (পয়েন্ট)', build: () => zoneCentres() },
  { id: 'roads_area', label: 'রাস্তার চওড়া (সারফেস)', hint: 'প্রতিটি রাস্তার পলিগন আউটলাইন', build: roadsArea },
  { id: 'road_medians', label: 'রাস্তার মিডিয়ান', hint: 'মাঝের ডিভাইডার (পলিগন)', build: roadMedians },
  { id: 'footpaths', label: 'ফুটপাথ', hint: 'রাস্তার দুই পাশের ফুটপাথ (পলিগন)', build: footpaths },
  { id: 'ped_crossings', label: 'জেব্রা ক্রসিং', hint: 'পথচারী পারাপার (পয়েন্ট)', build: pedCrossings },
  { id: 'street_lights', label: 'রাস্তার বাতি', hint: 'বাতির খুঁটি (পয়েন্ট, Z সহ)', optional: true, build: streetLights },
  { id: 'rail_segments', label: 'রেল: মাটি/ব্রিজ/টানেল', hint: 'লাইনের কোন অংশ কী ধরনের', build: railSegments },
  { id: 'rail_piers', label: 'রেল ভায়াডাক্ট পিলার', hint: 'পয়েন্ট', optional: true, build: railPiers },
  { id: 'rail_crossings', label: 'রাস্তা-রেল ক্রসিং', hint: 'কোথায় কীভাবে পার হয়', optional: true, build: railCrossings },
  { id: 'rail_links', label: 'স্টেশনের ভেতরের লিংক', hint: 'থ্রু-রানিং ট্র্যাক', optional: true, build: railLinks },
  { id: 'station_sites', label: 'ফুয়েল/চার্জ স্টেশনের জায়গা', hint: 'পলিগন', build: () => stationSites() },
  { id: 'port_platforms', label: 'বন্দরের প্ল্যাটফর্ম', hint: 'কোয়ে ডেক (পলিগন)', build: () => portPlatforms() },
  { id: 'facility_areas', label: 'এয়ারপোর্ট/বন্দর/সেনা এলাকা', hint: 'সীমানা ও উপ-এলাকা (পলিগন)', build: () => facilityAreas() },
  { id: 'engineering_areas', label: 'ইঞ্জিনিয়ারিং ক্যাম্পাস এলাকা', hint: 'পলিগন', build: () => engineeringAreas() },
  { id: 'world_zones', label: 'এলাকা/জোন ম্যাপ (পলিগন)', hint: 'পুরো ম্যাপের জোন', build: () => worldZones() },
  { id: 'buildings_3d', label: 'বিল্ডিং, আসল ৩ডি ব্লক', hint: 'MultiPatch: উচ্চতা সহ (তলা × ৩ মি)', build: buildings3d },
];

export type GisFormat = 'shp' | 'geojson' | 'both';
