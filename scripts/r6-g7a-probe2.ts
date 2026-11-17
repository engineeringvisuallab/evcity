import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { readFileSync } from 'node:fs';
const gen: any = new TerrainGenerator(Config.world.seed);
const JX = [544.2, -1776.5];
const a = J1_ARM_DATA.find((d) => d.name === 'J1-N')!;
let k = 0, b = 1e9; a.pts.forEach((p, i) => { const d = Math.hypot(p[0] - JX[0], p[1] - JX[1]); if (d < b) { b = d; k = i; } });
console.log('J1-N s at JX-3', a.s[k], 'level', a.ys[k], 'structs', JSON.stringify(a.structs));
const rail = gen.rail.edges.find((e: any) => e.id === 'north-1'); console.log('rail north-1 len', rail.length.toFixed(0), 'design?', rail.design?.length, 'ground?', rail.ground?.length);
for (let i = 0; i < rail.xs.length; i++) { const d = Math.hypot(rail.xs[i] - JX[0], rail.zs[i] - JX[1]); if (d < 160 && i % 2 === 0) console.log('  rail', rail.xs[i].toFixed(0), rail.zs[i].toFixed(0), 'design', rail.design[i].toFixed(2), 'ground', rail.ground[i].toFixed(2), 'water', rail.water?.[i], 'd', d.toFixed(0)); }
const g5 = JSON.parse(readFileSync('docs/r6_g5_lines.json', 'utf8'));
for (const id of [20, 21, 26]) { const l = g5.lines.find((q: any) => q.src_id === id); console.log('L' + id, 'pts', l.pts.length, 'first', l.pts[0], 'last', l.pts[l.pts.length - 1]); }
console.log('jx', JSON.stringify(g5.jx.filter((j: any) => j.n === 3)));
const sc = gen.makeSample();
for (const R of ['R6-6A', 'R6-6B']) { const r = gen.roads.roads.find((q: any) => q.name === R); const L = r.xs.length - 1; for (const i of [0, 4, 12, 20, 30]) { gen.sample(r.xs[i], r.zs[i], sc); console.log(R, 'i', i, r.xs[i].toFixed(0), r.zs[i].toFixed(0), 'y', r.ys[i].toFixed(2), 'ground', sc.h.toFixed(2)); } }
