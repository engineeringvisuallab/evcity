// Headless test of the raster export (src/export/RasterExport.ts): npx tsx scripts/raster-test.ts [out-dir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildRasterZip } from '../src/export/RasterExport';
import { GIS_LAYERS } from '../src/export/GisLayers';
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const out = process.argv[2] ?? '/tmp/raster-test';
mkdirSync(out, { recursive: true });
const g = new TerrainGenerator(Config.world.seed);
for (const id of ['road_centre_view', 'road_centre_junctions']) {
  const def = GIS_LAYERS.find((l) => l.id === id);
  ok(!!def, `${id} is in GIS_LAYERS`);
  const L = def!.build(g, {});
  ok(L.features.length > 0 && L.features.every((f) => f.attrs.length === L.fields.length), `${id}: ${L.features.length} features, attrs match fields`);
}
const r = await buildRasterZip(g, { cell: 20, colour: true, roadLines: true, height: true });
writeFileSync(`${out}/${r.name}`, r.bytes);
console.log(r.lines.join('\n'));
ok(r.bytes.length > 1000, `zip ${r.bytes.length} bytes`);
console.log(r.name);
process.exit(fails ? 1 : 0);
