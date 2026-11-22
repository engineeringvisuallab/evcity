// JUNCTION REGISTRY (headless): builds the real game network (all roads) and writes the junction list that REALLY exists in the game.
// Run: npx tsx scripts/junction-registry.ts docs      -> docs/junction_registry.json + docs/JUNCTION_REGISTRY.txt
// Reads only. Nothing in the game or in any data file is changed. Compared with the old table (docs/centre_junction.json, "Nxxx"): which old node has no real junction, which real junction has no old node.
import * as fs from 'fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildJunctionRegistry } from '../src/roads/JunctionRegistry';

const out = process.argv[2] ?? 'docs';
const gen: any = new TerrainGenerator(Config.world.seed);
const reg = buildJunctionRegistry(gen.roads.roads);
const f1 = (v: number): string => v.toFixed(1);
const lines: string[] = [];
const P = (s: string): void => { lines.push(s); console.log(s); };

P(`JUNCTION REGISTRY: ${gen.roads.roads.length} roads in the game, ${gen.roads.pads.length} junction pads, ${gen.roads.junctions.length} old junction records`);
const byType: Record<string, number> = {};
for (const n of reg.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
P(`real junctions found: ${reg.nodes.length}  ${JSON.stringify(byType)}`);
P(`free road ends (no road within 12 m): ${reg.freeEnds.length};  crossings at the same level with no junction: ${reg.crossings.length}`);
const fl: Record<string, number> = {};
for (const n of reg.nodes) for (const f of n.flags) fl[f] = (fl[f] ?? 0) + 1;
P(`flags: ${JSON.stringify(fl)}`);

// compare with the old table
let old: any = null;
try { old = JSON.parse(fs.readFileSync(`${out}/centre_junction.json`, 'utf8')); } catch { /* optional */ }
const cmp: { oldOnly: any[]; newOnly: string[]; matched: number } = { oldOnly: [], newOnly: [], matched: 0 };
if (old) {
  const oldNodes = old.nodes.filter((n: any) => !String(n.type).startsWith('CONTINUATION'));
  const used = new Set<string>();
  for (const o of oldNodes) {
    let best: any = null, bd = 1e9;
    for (const n of reg.nodes) { const d = Math.hypot(n.x - o.x, n.z - o.z); if (d < bd) { bd = d; best = n; } }
    if (best && bd <= 25) { used.add(best.id); cmp.matched++; } else cmp.oldOnly.push({ id: o.id, legs: o.legs, nearest: f1(bd) + ' m' });
  }
  cmp.newOnly = reg.nodes.filter((n) => !used.has(n.id)).map((n) => `${n.id} ${n.type} ${n.legs.map((l) => l.name).join('+')} (${f1(n.x)}, ${f1(n.z)})`);
  P(`old table: ${oldNodes.length} real nodes; matched within 25 m: ${cmp.matched}; OLD NODE WITHOUT A REAL JUNCTION: ${cmp.oldOnly.length}; REAL JUNCTION NOT IN THE OLD TABLE: ${cmp.newOnly.length}`);
  for (const o of cmp.oldOnly.slice(0, 40)) P(`  old only ${o.id} ${o.legs.join('+')} nearest real junction ${o.nearest}`);
  for (const s of cmp.newOnly.slice(0, 60)) P(`  real only ${s}`);
}
P('--- junctions with a flag ---');
for (const n of reg.nodes.filter((q) => q.flags.length)) P(`${n.id} ${n.type} (${f1(n.x)}, ${f1(n.z)}) legs ${n.legs.map((l) => l.name + (l.end === 2 ? '~' : l.end)).join(' ')} offset ${f1(n.maxOffset)} m step ${n.maxGapY.toFixed(2)} m min angle ${f1(n.minAngle)}  [${n.flags.join(' ')}]`);
P('--- free ends ---');
for (const e of reg.freeEnds) P(`${e.name} end ${e.end} (${f1(e.x)}, ${f1(e.z)}) class ${e.cls}`);
P('--- same-level crossings without a junction ---');
for (const c of reg.crossings) P(`${c.a} x ${c.b} at (${f1(c.x)}, ${f1(c.z)}) height diff ${c.dy.toFixed(2)} m`);
fs.writeFileSync(`${out}/junction_registry.json`, JSON.stringify({ nodes: reg.nodes, freeEnds: reg.freeEnds, crossings: reg.crossings, compareOld: cmp }, null, 1));
fs.writeFileSync(`${out}/JUNCTION_REGISTRY.txt`, lines.join('\n') + '\n');
