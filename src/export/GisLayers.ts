// The GIS layers the game can export. To export one more kind of object: add ONE entry to GIS_LAYERS (id, label, build()).
// build() reads the game's own data (TerrainGenerator = roads, rivers, lakes, rail; the building / zone tables) and returns a GisLayer.
// Everything here is pure data: no scene, no DOM, so it also runs headless (scripts/export-test.ts).
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../buildings/Placements';
import { WORLD_ZONES } from '../city/WorldZones';
import { toGrid, type GisFeature, type GisField, type GisLayer } from './GisWriter';

export interface GisLayerDef {
  id: string;
  label: string;
  hint: string;
  build(t: TerrainGenerator): GisLayer;
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

const buildings = (): GisLayer => {
  const features: GisFeature[] = BUILDING_PLACEMENTS.map((p) => {
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
];

export type GisFormat = 'shp' | 'geojson' | 'both';
