import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildJunctionPads } from '../src/roads/Junctions';
import * as fs from 'fs';
// DRY RUN (headless, changes nothing in the game): what the OLD pad engine (Junctions.ts buildJunctionPads, Stage 6E) would do on the WHOLE new road network.
// Run: npx tsx scripts/junction-pad-dryrun.ts docs   -> docs/JUNCTION_PAD_DRYRUN.txt
// Why: the engine runs in the RoadNetwork constructor BEFORE the new roads exist (they join later in addJ1Arms), so the game has 0 pads today. This shows why it must NOT be switched on as it is: it moves the user's fitted lines.
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const nat = (x: number, z: number, o: any) => gen.sampleGround(x, z, o);
const before = net.roads.map((r: any) => ({ xs: Float64Array.from(r.xs), zs: Float64Array.from(r.zs), ys: Float64Array.from(r.ys) }));
const t0 = Date.now();
const pr = buildJunctionPads(net.roads, nat);
console.log('pads', pr.pads.length, 'skipped', pr.skipped.length, 'ms', Date.now() - t0);
const kinds: Record<string, number> = {};
for (const p of pr.pads) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
console.log(kinds);
let moved = 0, maxd = 0, maxy = 0; const movedRoads: string[] = [];
net.roads.forEach((r: any, i: number) => {
  let md = 0, my = 0;
  for (let k = 0; k < r.xs.length; k++) { md = Math.max(md, Math.hypot(r.xs[k] - before[i].xs[k], r.zs[k] - before[i].zs[k])); my = Math.max(my, Math.abs(r.ys[k] - before[i].ys[k])); }
  if (md > 0.01 || my > 0.01) { moved++; movedRoads.push(`${r.name}:${md.toFixed(1)}m/${my.toFixed(2)}y`); }
  maxd = Math.max(maxd, md); maxy = Math.max(maxy, my);
});
console.log('roads mutated by the pad engine:', moved, 'max plan shift', maxd.toFixed(2), 'max height shift', maxy.toFixed(2));
console.log(movedRoads.slice(0, 40).join(' '));
const why: Record<string, number> = {};
for (const s of pr.skipped) { const k = s.split(': ').slice(1).join(': '); why[k] = (why[k] ?? 0) + 1; }
console.log(why);
const dir = process.argv[2] ?? 'docs';
fs.writeFileSync(`${dir}/JUNCTION_PAD_DRYRUN.txt`, `pads ${pr.pads.length}, skipped ${pr.skipped.length}, kinds ${JSON.stringify(kinds)}\nroads mutated ${moved}, max plan shift ${maxd.toFixed(2)} m, max height shift ${maxy.toFixed(2)} m\nreasons ${JSON.stringify(why)}\nmoved: ${movedRoads.join(' ')}\nskipped:\n${pr.skipped.join('\n')}\n`);
