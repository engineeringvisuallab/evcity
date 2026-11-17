import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CENTRE_ROADS, CENTRE_JUNCTIONS } from '../src/roads/debug/RoadCentreData';
const gen: any = new TerrainGenerator(Config.world.seed);
let n = 0, bad = 0, wet = 0; const sc = gen.makeSample();
for (const r of CENTRE_ROADS) for (const [x, z] of r.pts) { const h = gen.heightAt(x, z); n++; if (!Number.isFinite(h)) bad++; gen.sample(x, z, sc); if (sc.water != null && sc.water > sc.h) wet++; }
const byCls: Record<string, number[]> = {}; for (const r of CENTRE_ROADS) { const b = (byCls[r.cls] ??= [0, 0]); b[0]++; b[1] += r.pts.length; }
console.log('per class (lines, points):', JSON.stringify(byCls));
console.log(`roads ${CENTRE_ROADS.length}, junctions ${CENTRE_JUNCTIONS.length}, points ${n}, height NaN ${bad}, wet points ${wet}, game roads ${(gen.roads.roads as any[]).filter(r=>!String(r.name).includes(':')&&(r.lanes===8||r.lanes===6)).length}`);
