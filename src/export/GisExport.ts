// Builds ONE .zip with the picked GIS layers (shapefile folder and / or GeoJSON folder + a README). Pure data: no DOM.
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { GIS_LAYERS, type GisFormat } from './GisLayers';
import { layerToGeoJson, layerToShapefile } from './GisWriter';
import { makeZip } from './ZipWriter';

export interface GisExportResult {
  name: string;
  bytes: Uint8Array;
  /** One line per layer: how many features were written. */
  lines: string[];
}

const README = `EVCity GIS export
=================
Coordinates are the game's LOCAL METRIC GRID in metres (NOT latitude / longitude):
  Easting  = x + 5000      (0 .. 10000, west -> east)
  Northing = 5000 - z      (0 .. 10000, south -> north; the game's z points south)
Heights (Z) are metres above sea level (the game's y). The .prj file holds a local engineering CRS: in QGIS / ArcGIS it shows as "unknown / local".
To place the map on the real Earth, set your own CRS or move / rotate it in your GIS software.
shapefile/  : <layer>.shp .shx .dbf .prj .cpg   (point / polyline / polygon, Z where the layer has heights)
geojson/    : <layer>.geojson
`;

export function buildGisZip(terrain: TerrainGenerator, layerIds: readonly string[], format: GisFormat): GisExportResult {
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const lines: string[] = [];
  for (const def of GIS_LAYERS) {
    if (!layerIds.includes(def.id)) continue;
    const layer = def.build(terrain);
    if (format === 'shp' || format === 'both') for (const [n, b] of layerToShapefile(layer)) files.set(`shapefile/${n}`, b);
    if (format === 'geojson' || format === 'both') files.set(`geojson/${layer.id}.geojson`, enc.encode(layerToGeoJson(layer)));
    lines.push(`${def.label}: ${layer.features.length}`);
  }
  if (files.size === 0) throw new Error('কোনো লেয়ার বাছা হয়নি');
  files.set('README.txt', enc.encode(README));
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return { name: `evcity_gis_${stamp}.zip`, bytes: makeZip(files, d), lines };
}

/** Browser download of a file (Blob + temporary link). */
export function saveFile(name: string, data: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
