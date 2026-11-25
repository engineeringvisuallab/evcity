// Dump of the roads + arm rows used by tools/j300-j10-join-plot.py. Run: npx tsx scripts/j300-j10-join-dump.ts OFF ; npx tsx scripts/j300-j10-join-dump.ts ON  (writes /tmp/join_OFF.json, /tmp/join_ON.json)
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J300_ARMS } from '../src/roads/junction/J300Geometry';
const mode = process.argv[2]; Config.roads.junctionJ300.enabled = mode === 'ON';
const g: any = new TerrainGenerator(Config.world.seed); const o: any = {};
for (const r of g.roads.roads) if (['R6-7', 'R6-9', 'R4-9', 'R4-4'].includes(r.name)) o[r.name] = { xs: Array.from(r.xs), zs: Array.from(r.zs), ys: Array.from(r.ys) };
if (mode === 'ON') { o.arm6 = (J300_ARMS.R6 as any).rows.map((q: any) => [q.x, q.z, q.y]); o.arm4 = (J300_ARMS.R4 as any).rows.map((q: any) => [q.x, q.z, q.y]); }
writeFileSync('/tmp/join_' + mode + '.json', JSON.stringify(o));
