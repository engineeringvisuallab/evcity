// Whole-map RASTER export: the terrain as a colour picture (.png), as a height grid (Float32 GeoTIFF, metres) and, if wanted, the same picture with the
// Road Central Line (key 3) lines drawn on it. Pure data + maths: no three.js, no DOM (runs in node too, see scripts/export-test.ts).
// Every sample is TerrainGenerator.sample(): the ground you really see in the game (hills, rivers, lakes, sea, road / rail / port earthworks).
// Grid: pixel (i, j) = world x = -W/2 + (i + 0.5) * cell, z = -W/2 + (j + 0.5) * cell. Row 0 is the NORTH edge (z smallest), like every map image.
// GIS grid (same as the shapefile export): Easting = x + W/2, Northing = W/2 - z. The .pgw world files and the GeoTIFF tags place the image exactly.
import { Config } from '../core/Config';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { collectCentreSet, CENTRE_COLOUR, type CentreSet } from '../roads/debug/RoadCentreSet';
import { crc32, makeZip } from './ZipWriter';

export type RasterCell = 20 | 10 | 5;

export interface RasterOptions {
  /** Pixel size in metres: 20 (500 x 500), 10 (1000 x 1000), 5 (2000 x 2000). */
  cell: RasterCell;
  /** Colour picture. */
  colour: boolean;
  /** Colour picture with the key-3 road centre lines on top (a second PNG). */
  roadLines: boolean;
  /** Height grid as a GeoTIFF (Float32, metres above sea level). */
  height: boolean;
}

export interface RasterResult { name: string; bytes: Uint8Array; lines: string[]; }

export interface TerrainRaster {
  n: number;
  cell: number;
  /** Ground height (m), row-major, row 0 = north. */
  h: Float32Array;
  /** 0 land, 1 fresh water (river / lake), 2 sea. */
  wet: Uint8Array;
  /** Water depth over the ground (m), 0 on land. */
  depth: Float32Array;
}

const yieldNow = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Samples the whole map. Async so the page can redraw a progress line (a 10 m grid = 1 million samples). */
export async function sampleTerrainRaster(t: TerrainGenerator, cell: number, onProgress?: (frac: number) => void): Promise<TerrainRaster> {
  const W = Config.world.size, half = W / 2, n = Math.round(W / cell);
  const h = new Float32Array(n * n), wet = new Uint8Array(n * n), depth = new Float32Array(n * n);
  const sc = t.makeSample();
  const ROWS = Math.max(1, Math.floor(60000 / n)); // rows between two yields
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < n; i++) {
      t.sample(-half + (i + 0.5) * cell, z, sc);
      const k = j * n + i;
      h[k] = sc.h;
      if (!Number.isNaN(sc.water) && sc.h < sc.water - 0.05) {
        wet[k] = sc.h < 0.6 ? 2 : 1;
        depth[k] = sc.water - sc.h;
      }
    }
    if (j % ROWS === ROWS - 1) {
      onProgress?.((j + 1) / n);
      await yieldNow();
    }
  }
  onProgress?.(1);
  return { n, cell, h, wet, depth };
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const RAMP: [number, [number, number, number]][] = [
  [0, [196, 186, 140]], // beach / shore
  [0.04, [86, 140, 70]], // lowland green
  [0.25, [132, 160, 80]], // plain
  [0.5, [166, 138, 88]], // foothill brown
  [0.75, [140, 128, 118]], // rock
  [1, [250, 250, 250]], // peak
];
function landColour(k: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (k <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i], f = (k - a[0]) / (b[0] - a[0]);
      return [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/** Colour picture (RGB bytes): height colours + water by depth + hill shading (light from the north-west). */
export function renderColour(r: TerrainRaster): Uint8Array {
  const { n, cell, h, wet, depth } = r;
  let hMax = 1;
  for (let k = 0; k < h.length; k++) if (!wet[k] && h[k] > hMax) hMax = h[k];
  const rgb = new Uint8Array(n * n * 3);
  const at = (i: number, j: number): number => h[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const EX = 2; // vertical exaggeration of the shading
  const L = [-0.5, 0.75, -0.5]; // x east, y up, z south: light from the north-west
  const Ll = Math.hypot(L[0], L[1], L[2]);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const nx = (-(at(i + 1, j) - at(i - 1, j)) / (2 * cell)) * EX;
      const nz = (-(at(i, j + 1) - at(i, j - 1)) / (2 * cell)) * EX;
      const nl = Math.hypot(nx, 1, nz);
      const shade = Math.max(0, (nx * L[0] + L[1] + nz * L[2]) / (nl * Ll));
      const light = 0.55 + 0.6 * shade; // flat ground (shade 0.75/1.0 ~ 0.75) -> about 1.0
      let c: [number, number, number];
      if (wet[k]) {
        const d = Math.min(1, depth[k] / 12);
        c = wet[k] === 2 ? [lerp(70, 10, d), lerp(150, 50, d), lerp(205, 120, d)] : [lerp(90, 25, d), lerp(170, 90, d), lerp(225, 170, d)];
        const s = 0.9 + 0.1 * light;
        rgb[k * 3] = c[0] * s; rgb[k * 3 + 1] = c[1] * s; rgb[k * 3 + 2] = c[2] * s;
        continue;
      }
      c = landColour(Math.min(1, Math.max(0, h[k] / hMax)));
      rgb[k * 3] = Math.min(255, c[0] * light);
      rgb[k * 3 + 1] = Math.min(255, c[1] * light);
      rgb[k * 3 + 2] = Math.min(255, c[2] * light);
    }
  }
  return rgb;
}

/** Draws the key-3 lines (and the J-xx marks) into an RGB picture. Line width in pixels grows with the road class and shrinks with the cell size. */
export function drawCentreLines(rgb: Uint8Array, r: TerrainRaster, set: CentreSet): void {
  const { n, cell } = r;
  const half = Config.world.size / 2;
  const WPX: Record<string, number> = { '8': 36, '6': 30, '4': 24, '2': 20, A: 20, C: 16, L: 14 }; // metres on the map (wider than the real road: it must be seen from far)
  const px = (x: number): number => (x + half) / cell - 0.5;
  const stamp = (cx: number, cy: number, rad: number, col: number): void => {
    const R = (col >> 16) & 255, G = (col >> 8) & 255, B = col & 255;
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(n - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(n - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > rad * rad + 0.25) continue;
      const k = (y * n + x) * 3;
      rgb[k] = R; rgb[k + 1] = G; rgb[k + 2] = B;
    }
  };
  // thin classes first, thick last? No: the bigger road goes on top, so draw small classes first
  const order = ['L', 'C', 'A', '2', '4', '6', '8'];
  const lines = [...set.lines].sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  for (const l of lines) {
    const col = CENTRE_COLOUR[l.cls] ?? 0xff00ff;
    const rad = Math.max(0.8, (WPX[l.cls] ?? 16) / cell / 2);
    for (let s = 0; s + 1 < l.pts.length; s++) {
      const ax = px(l.pts[s][0]), ay = px(l.pts[s][1]), bx = px(l.pts[s + 1][0]), by = px(l.pts[s + 1][1]);
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let q = 0; q <= steps; q++) stamp(ax + ((bx - ax) * q) / steps, ay + ((by - ay) * q) / steps, rad, col);
    }
  }
  for (const j of set.junctions) {
    const rad = Math.max(1.6, 40 / cell / 2);
    stamp(px(j.x), px(j.z), rad + 0.8, 0xffffff);
    stamp(px(j.x), px(j.z), rad, 0xffb000);
  }
}

// ---------------------------------------------------------------------------------------------------------------- PNG
const u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const adler32 = (d: Uint8Array): number => {
  let a = 1, b = 0;
  for (let i = 0; i < d.length; i++) { a = (a + d[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
};

/** zlib container with STORED blocks (no compression): always works, also in node. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const s = b * 65535, len = Math.min(65535, raw.length - s);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 255; out[o++] = len >> 8; out[o++] = ~len & 255; out[o++] = (~len >> 8) & 255;
    out.set(raw.subarray(s, s + len), o);
    o += len;
  }
  out.set(u32(adler32(raw)), o);
  return out;
}

async function zlibBest(raw: Uint8Array): Promise<Uint8Array> {
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return zlibStored(raw);
  try {
    const cs = new CS('deflate'); // "deflate" = zlib format, exactly what PNG wants
    const w = cs.writable.getWriter();
    void w.write(raw);
    void w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch {
    return zlibStored(raw);
  }
}

/** RGB bytes -> PNG file bytes (8 bit, no filter). Compressed in the browser, stored (bigger file, same picture) where CompressionStream is missing. */
export async function encodePng(w: number, h: number, rgb: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const idat = await zlibBest(raw);
  const chunk = (type: string, data: Uint8Array): number[] => {
    const td = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
    td.set(data, 4);
    return [...u32(data.length), ...td, ...u32(crc32(td))];
  };
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 2, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), new Uint8Array(chunk('IHDR', ihdr)), new Uint8Array(chunk('IDAT', idat)), new Uint8Array(chunk('IEND', new Uint8Array(0)))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ------------------------------------------------------------------------------------------------------------- GeoTIFF
/** Float32 single-band GeoTIFF, uncompressed, one strip. Placed on the local grid (Easting = x + W/2, Northing = W/2 - z), CRS = user defined (local metres). */
export function encodeGeoTiff(n: number, cell: number, h: Float32Array): Uint8Array {
  const W = Config.world.size;
  const NE = 13, ifdOff = 8, ifdLen = 2 + NE * 12 + 4;
  const scaleOff = ifdOff + ifdLen, tieOff = scaleOff + 24, keyOff = tieOff + 48;
  const dataOff = (keyOff + 32 + 3) & ~3;
  const bytes = n * n * 4;
  const buf = new Uint8Array(dataOff + bytes);
  const v = new DataView(buf.buffer);
  v.setUint8(0, 0x49); v.setUint8(1, 0x49); v.setUint16(2, 42, true); v.setUint32(4, ifdOff, true);
  v.setUint16(ifdOff, NE, true);
  let e = ifdOff + 2;
  const SHORT = 3, LONG = 4, DOUBLE = 12;
  const entry = (tag: number, type: number, count: number, value: number): void => {
    v.setUint16(e, tag, true); v.setUint16(e + 2, type, true); v.setUint32(e + 4, count, true);
    if (type === SHORT && count === 1) v.setUint16(e + 8, value, true); else v.setUint32(e + 8, value, true);
    e += 12;
  };
  entry(256, LONG, 1, n);
  entry(257, LONG, 1, n);
  entry(258, SHORT, 1, 32);
  entry(259, SHORT, 1, 1);
  entry(262, SHORT, 1, 1);
  entry(273, LONG, 1, dataOff);
  entry(277, SHORT, 1, 1);
  entry(278, LONG, 1, n);
  entry(279, LONG, 1, bytes);
  entry(339, SHORT, 1, 3);
  entry(33550, DOUBLE, 3, scaleOff);
  entry(33922, DOUBLE, 6, tieOff);
  entry(34735, SHORT, 16, keyOff);
  v.setUint32(e, 0, true);
  [cell, cell, 0].forEach((x, i) => v.setFloat64(scaleOff + 8 * i, x, true));
  [0, 0, 0, 0, W, 0].forEach((x, i) => v.setFloat64(tieOff + 8 * i, x, true)); // pixel (0,0) top-left corner = Easting 0, Northing W
  [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32767].forEach((x, i) => v.setUint16(keyOff + 2 * i, x, true));
  for (let k = 0; k < h.length; k++) v.setFloat32(dataOff + 4 * k, h[k], true);
  return buf;
}

/** ESRI world file for a PNG made by this module (centre of the top-left pixel). */
export function worldFile(cell: number): string {
  const W = Config.world.size;
  return [cell, 0, 0, -cell, cell / 2, W - cell / 2].map((x) => String(x)).join('\r\n') + '\r\n';
}

const README = (n: number, cell: number): string => `EVCity raster export
====================
Pixel size ${cell} m, ${n} x ${n} pixels, whole map (${Config.world.size} x ${Config.world.size} m). Row 0 is the NORTH edge.
Grid = the same local metric grid as the GIS export (NOT latitude / longitude): Easting = x + ${Config.world.size / 2}, Northing = ${Config.world.size / 2} - z.
terrain_colour.png     : height colours + water + hill shading        (+ terrain_colour.pgw = world file: QGIS / ArcGIS place it by itself)
terrain_roadlines.png  : the same picture with the Road Central Line (key 3) lines: 8 lane black, 6 lane blue, 4 lane red, 2 lane green,
                         housing streets magenta (arterial) / cyan (collector) / yellow (local), orange dots = J-xx junctions
terrain_height.tif     : GeoTIFF, Float32, metres above sea level (ground under water = river / lake / sea bed), already placed on the grid
In QGIS: Layer > Add Raster Layer; set the project CRS to a local / engineering CRS (the files carry none).
`;

function stampNow(): { d: Date; stamp: string } {
  const d = new Date();
  const p = (x: number): string => String(x).padStart(2, '0');
  return { d, stamp: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}` };
}

/** Samples the map and builds ONE .zip with the picked rasters. */
export async function buildRasterZip(t: TerrainGenerator, o: RasterOptions, onProgress?: (text: string) => void): Promise<RasterResult> {
  if (!o.colour && !o.roadLines && !o.height) throw new Error('কিছু বাছা হয়নি');
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const lines: string[] = [];
  const r = await sampleTerrainRaster(t, o.cell, (f) => onProgress?.(`টেরেন স্যাম্পল হচ্ছে… ${Math.round(f * 100)}%`));
  const wetShare = r.wet.reduce((s, v) => s + (v ? 1 : 0), 0) / r.wet.length;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < r.h.length; k++) { if (r.h[k] < lo) lo = r.h[k]; if (r.h[k] > hi) hi = r.h[k]; }
  lines.push(`${r.n} × ${r.n} পিক্সেল, প্রতি পিক্সেল ${o.cell} মি; উচ্চতা ${lo.toFixed(1)} .. ${hi.toFixed(1)} মি; পানি ${(wetShare * 100).toFixed(1)}%`);
  if (o.colour || o.roadLines) {
    onProgress?.('ছবি আঁকা হচ্ছে…');
    await yieldNow();
    const rgb = renderColour(r);
    if (o.colour) {
      files.set('terrain_colour.png', await encodePng(r.n, r.n, rgb));
      files.set('terrain_colour.pgw', enc.encode(worldFile(o.cell)));
      lines.push('terrain_colour.png (+ .pgw)');
    }
    if (o.roadLines) {
      const set = collectCentreSet(t);
      drawCentreLines(rgb, r, set);
      files.set('terrain_roadlines.png', await encodePng(r.n, r.n, rgb));
      files.set('terrain_roadlines.pgw', enc.encode(worldFile(o.cell)));
      lines.push(`terrain_roadlines.png (+ .pgw): ${set.lines.length} লাইন, ${set.junctions.length} জংশন মার্ক`);
    }
  }
  if (o.height) {
    files.set('terrain_height.tif', encodeGeoTiff(r.n, o.cell, r.h));
    lines.push('terrain_height.tif (GeoTIFF, Float32, মিটার)');
  }
  files.set('README.txt', enc.encode(README(r.n, o.cell)));
  const { d, stamp } = stampNow();
  return { name: `evcity_raster_${o.cell}m_${stamp}.zip`, bytes: makeZip(files, d), lines };
}
