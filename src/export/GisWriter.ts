// GIS file writers: ESRI Shapefile (.shp .shx .dbf .prj .cpg) and GeoJSON. Pure functions (DataView / TextEncoder, no Node Buffer, no DOM),
// so the same code runs in the browser and in the headless test (scripts/export-test.ts).
//
// Coordinates written to the files are the game's LOCAL METRIC GRID (not lat/lon):
//   Easting = x + world/2, Northing = world/2 - z   (0 .. 10000 m; north is up, like the minimap; the game's z points south).
import { Config } from '../core/Config';

/** multipatch = ESRI MultiPatch (shapefile type 31): real 3D solids made of closed rings with a height on every point (used for extruded buildings). */
export type GisGeom = 'point' | 'polyline' | 'polygon' | 'multipatch';
export interface GisField {
  name: string; // <= 10 ASCII chars (dBASE limit)
  type: 'C' | 'N';
  len: number;
  dec?: number;
}
/** One part = a list of [easting, northing, z] points. A polygon part is one ring (closed or not, the writer closes it and fixes the winding). */
export interface GisFeature {
  parts: number[][][];
  attrs: (string | number)[];
  /** multipatch only: ESRI part type of each part (default 5 = Ring: a closed planar face). */
  partTypes?: number[];
}
export interface GisLayer {
  id: string; // file name stem, e.g. "roads_centerline"
  label: string;
  geom: GisGeom;
  fields: GisField[];
  features: GisFeature[];
  /** true: the layer carries a height (m) in each point's 3rd value and is written as a Z shapefile (PolyLineZ / PointZ). */
  hasZ: boolean;
  /** true: the layer may legitimately be empty (set by the rail layers). */
  optional?: boolean;
}

export const PRJ_WKT = 'LOCAL_CS["EVCity local metric grid (x+5000 east, 5000-z north)",UNIT["metre",1],AXIS["Easting",EAST],AXIS["Northing",NORTH]]';

/** Game world position (x east, z south) -> local grid [easting, northing, height]. */
export function toGrid(x: number, z: number, y = 0): number[] {
  const h = Config.world.size / 2;
  return [x + h, h - z, y];
}

const enc = new TextEncoder();

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** ESRI wants outer rings clockwise and closed (first point == last point). */
function prepareParts(layer: GisLayer): number[][][][] {
  return layer.features.map((f) =>
    f.parts.map((part) => {
      if (layer.geom !== 'polygon' && layer.geom !== 'multipatch') return part;
      let r = part.slice();
      const a = r[0];
      const b = r[r.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) r.push(a.slice());
      if (layer.geom === 'polygon' && ringArea(r.slice(0, -1)) > 0) r = r.reverse(); // counter-clockwise -> clockwise
      return r;
    }),
  );
}

function shpType(layer: GisLayer): number {
  if (layer.geom === 'multipatch') return 31;
  const base = layer.geom === 'point' ? 1 : layer.geom === 'polyline' ? 3 : 5;
  return layer.hasZ ? base + 10 : base;
}

export function writeShp(layer: GisLayer): { shp: Uint8Array; shx: Uint8Array } {
  const type = shpType(layer);
  const multi = layer.geom === 'multipatch';
  const z = layer.hasZ || multi;
  const parts = prepareParts(layer);
  const sizes: number[] = [];
  let bodyBytes = 0;
  for (const fp of parts) {
    const np = fp.reduce((s, p) => s + p.length, 0);
    const len =
      layer.geom === 'point'
        ? 4 + 16 + (z ? 16 : 0)
        : multi
          ? 4 + 32 + 8 + 8 * fp.length + 16 * np + 16 + 8 * np // parts, part types, points, Z range + Z (no M)
          : 4 + 32 + 8 + 4 * fp.length + 16 * np + (z ? 16 + 8 * np + 16 + 8 * np : 0);
    sizes.push(len);
    bodyBytes += 8 + len;
  }
  const shp = new Uint8Array(100 + bodyBytes);
  const shx = new Uint8Array(100 + 8 * parts.length);
  const v = new DataView(shp.buffer);
  const vx = new DataView(shx.buffer);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  let o = 100;
  parts.forEach((fp, i) => {
    vx.setInt32(100 + 8 * i, o / 2, false);
    vx.setInt32(104 + 8 * i, sizes[i] / 2, false);
    v.setInt32(o, i + 1, false);
    v.setInt32(o + 4, sizes[i] / 2, false);
    o += 8;
    v.setInt32(o, type, true);
    o += 4;
    const pts = fp.flat();
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const p of pts) {
      bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
      by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]);
      bz0 = Math.min(bz0, p[2]); bz1 = Math.max(bz1, p[2]);
    }
    xmin = Math.min(xmin, bx0); xmax = Math.max(xmax, bx1);
    ymin = Math.min(ymin, by0); ymax = Math.max(ymax, by1);
    zmin = Math.min(zmin, bz0); zmax = Math.max(zmax, bz1);
    if (layer.geom === 'point') {
      v.setFloat64(o, pts[0][0], true);
      v.setFloat64(o + 8, pts[0][1], true);
      o += 16;
      if (z) {
        v.setFloat64(o, pts[0][2], true);
        v.setFloat64(o + 8, 0, true); // M
        o += 16;
      }
      return;
    }
    for (const b of [bx0, by0, bx1, by1]) { v.setFloat64(o, b, true); o += 8; }
    v.setInt32(o, fp.length, true);
    v.setInt32(o + 4, pts.length, true);
    o += 8;
    let start = 0;
    for (const part of fp) { v.setInt32(o, start, true); start += part.length; o += 4; }
    if (multi) for (let k = 0; k < fp.length; k++) { v.setInt32(o, layer.features[i].partTypes?.[k] ?? 5, true); o += 4; }
    for (const p of pts) { v.setFloat64(o, p[0], true); v.setFloat64(o + 8, p[1], true); o += 16; }
    if (z) {
      v.setFloat64(o, bz0, true); v.setFloat64(o + 8, bz1, true); o += 16;
      for (const p of pts) { v.setFloat64(o, p[2], true); o += 8; }
      if (!multi) {
        v.setFloat64(o, 0, true); v.setFloat64(o + 8, 0, true); o += 16; // M range: no measures
        for (let k = 0; k < pts.length; k++) { v.setFloat64(o, 0, true); o += 8; }
      }
    }
  });
  const header = (dv: DataView, bytes: number): void => {
    dv.setInt32(0, 9994, false);
    dv.setInt32(24, bytes / 2, false);
    dv.setInt32(28, 1000, true);
    dv.setInt32(32, type, true);
    const box = parts.length ? [xmin, ymin, xmax, ymax, z ? zmin : 0, z ? zmax : 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0];
    box.forEach((b, k) => dv.setFloat64(36 + 8 * k, b, true));
  };
  header(v, shp.length);
  header(vx, shx.length);
  return { shp, shx };
}

export function writeDbf(layer: GisLayer, date = new Date()): Uint8Array {
  const fields = layer.fields;
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0);
  const headLen = 32 + 32 * fields.length + 1;
  const n = layer.features.length;
  const out = new Uint8Array(headLen + recLen * n + 1).fill(0x20);
  const v = new DataView(out.buffer);
  out[0] = 0x03;
  out[1] = date.getFullYear() - 1900;
  out[2] = date.getMonth() + 1;
  out[3] = date.getDate();
  v.setUint32(4, n, true);
  v.setUint16(8, headLen, true);
  v.setUint16(10, recLen, true);
  fields.forEach((f, i) => {
    const o = 32 + 32 * i;
    out.fill(0, o, o + 32);
    out.set(enc.encode(f.name.slice(0, 10)), o);
    out[o + 11] = f.type.charCodeAt(0);
    out[o + 16] = f.len;
    out[o + 17] = f.dec ?? 0;
  });
  out[32 + 32 * fields.length] = 0x0d;
  layer.features.forEach((ft, r) => {
    let o = headLen + r * recLen;
    out[o++] = 0x20;
    fields.forEach((f, i) => {
      const val = ft.attrs[i];
      let s: string;
      if (f.type === 'N') {
        const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
        s = num.toFixed(f.dec ?? 0).padStart(f.len, ' ').slice(-f.len);
      } else {
        s = String(val ?? '').replace(/[^\x20-\x7e]/g, '?').slice(0, f.len).padEnd(f.len, ' ');
      }
      out.set(enc.encode(s), o);
      o += f.len;
    });
  });
  out[out.length - 1] = 0x1a;
  return out;
}

/** All files of one layer as a shapefile set: `<id>.shp/.shx/.dbf/.prj/.cpg`. */
export function layerToShapefile(layer: GisLayer): Map<string, Uint8Array> {
  const { shp, shx } = writeShp(layer);
  return new Map<string, Uint8Array>([
    [`${layer.id}.shp`, shp],
    [`${layer.id}.shx`, shx],
    [`${layer.id}.dbf`, writeDbf(layer)],
    [`${layer.id}.prj`, enc.encode(PRJ_WKT)],
    [`${layer.id}.cpg`, enc.encode('UTF-8')],
  ]);
}

export function layerToGeoJson(layer: GisLayer): string {
  const r = (n: number): number => Math.round(n * 1000) / 1000;
  const pt = (p: number[]): number[] => (layer.hasZ || layer.geom === 'multipatch' ? [r(p[0]), r(p[1]), r(p[2])] : [r(p[0]), r(p[1])]);
  const features = layer.features.map((f) => {
    const props: Record<string, string | number> = {};
    layer.fields.forEach((fd, i) => (props[fd.name] = f.attrs[i]));
    let geometry: { type: string; coordinates: unknown };
    if (layer.geom === 'point') geometry = { type: 'Point', coordinates: pt(f.parts[0][0]) };
    else if (layer.geom === 'polyline') {
      geometry = f.parts.length === 1 ? { type: 'LineString', coordinates: f.parts[0].map(pt) } : { type: 'MultiLineString', coordinates: f.parts.map((p) => p.map(pt)) };
    } else if (layer.geom === 'multipatch') {
      // every closed face of the solid becomes one 3D polygon
      geometry = { type: 'MultiPolygon', coordinates: prepareParts({ ...layer, features: [f] })[0].map((ring) => [ring.map(pt)]) };
    } else {
      const rings = prepareParts({ ...layer, features: [f] })[0].map((ring) => ring.slice().reverse().map(pt)); // GeoJSON: outer ring counter-clockwise
      geometry = { type: 'Polygon', coordinates: rings };
    }
    return { type: 'Feature', properties: props, geometry };
  });
  return JSON.stringify({
    type: 'FeatureCollection',
    name: layer.id,
    note: 'EVCity local metric grid: easting = x + 5000, northing = 5000 - z (metres, not lat/lon)',
    features,
  });
}
