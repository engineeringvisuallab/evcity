// Headless check of the two new GIS layers (junctions, road_free_ends): they build from the game roads and write a valid shapefile + GeoJSON.
// Run: npx tsx scripts/junction-gis-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { GIS_LAYERS } from '../src/export/GisLayers';
import { layerToShapefile, layerToGeoJson } from '../src/export/GisWriter';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const gen: any = new TerrainGenerator(Config.world.seed);
const reg = gen.roads.junctionRegistry();
ok(reg.nodes.length > 100, `registry has ${reg.nodes.length} real junctions (old record list had ${gen.roads.junctions.length}, pads ${gen.roads.pads.length})`);
ok(gen.roads.junctionRegistry() === reg, 'registry is cached while the road count is the same');
for (const id of ['roads_centerline', 'junctions', 'road_free_ends']) {
  const def = GIS_LAYERS.find((d) => d.id === id);
  ok(!!def, `layer ${id} is in the export list`);
  if (!def) continue;
  const layer = def.build(gen, {} as any) as any;
  ok(layer.features.length > 0, `${id}: ${layer.features.length} features`);
  if (id === 'roads_centerline') { const ji = layer.fields.findIndex((f: any) => f.name === 'J_START'); const withJ = layer.features.filter((f: any) => f.attrs[ji] || f.attrs[ji + 1]).length; ok(ji > 0 && withJ > 150, `roads_centerline: J_START / J_END filled on ${withJ} of ${layer.features.length} roads`); }
  const bad = layer.features.filter((f: any) => f.attrs.length !== layer.fields.length || f.parts[0][0].some((v: number) => !Number.isFinite(v)) || (f.parts[0][0].length < 2));
  ok(bad.length === 0, `${id}: every feature has ${layer.fields.length} attributes and finite coordinates`);
  const files = layerToShapefile(layer);
  ok(['shp', 'shx', 'dbf', 'prj'].every((e) => [...files.keys()].some((k) => k.endsWith('.' + e))), `${id}: shapefile files ${[...files.keys()].join(' ')}`);
  const gj = JSON.parse(layerToGeoJson(layer));
  ok(gj.features.length === layer.features.length, `${id}: GeoJSON ${gj.features.length} features`);
}
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
