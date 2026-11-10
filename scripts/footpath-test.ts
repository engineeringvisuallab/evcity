// ROADS STEP 3: headless checks of the raised footpath plan (no three.js, no Rapier). Run: npx tsx scripts/footpath-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { FS, footPiece, footWidth, planFootpaths, rampFactor } from '../src/roads/FootpathPlan';
import { planRoadside, planCityTrees } from '../src/roads/Roadside';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const note = (m: string): void => console.log(`NOTE ${m}`);
const F = Config.city.footpath;

const gen = new TerrainGenerator();
const roads = gen.roads;
const plan = planFootpaths(roads);
const byId = new Map(roads.roads.map((r) => [r.id, r]));

console.log('\n=== FOOTPATH PLAN ===');
ok(plan.runs.length > 0, `${plan.runs.length} footpath runs, ${(plan.metres / 1000).toFixed(1)} km of footpath (both sides)`);
ok(plan.runs.every((u) => u.n >= 2 && u.hw === byId.get(u.roadId)!.halfWidth), 'every run starts at the kerb face of its road (hw = asphalt half width)');
ok(plan.runs.every((u) => Math.abs(u.width - footWidth(byId.get(u.roadId)!)) < 1e-9 && u.width >= Config.city.roadside.sidewalk), `every footpath is the width of the ribbon strip (>= ${Config.city.roadside.sidewalk} m)`);
ok(plan.runs.every((u) => { const r = byId.get(u.roadId)!; return !r.earth && !r.closed; }), 'no footpath on earth tracks or roundabouts');
const both = plan.runs.filter((u) => u.side === 1).length;
note(`${both} runs on the left side, ${plan.runs.length - both} on the right (a side is skipped where it would lie on another road)`);

// bridges and open country carry no footpath
let onBridge = 0; let outside = 0;
for (const u of plan.runs) {
  const r = byId.get(u.roadId)!;
  for (let k = 0; k < u.n; k++) {
    const x = u.p[k * FS]; const z = u.p[k * FS + 2];
    let seg = 0;
    while (seg < r.xs.length - 2 && r.cum[seg + 1] < u.p[k * FS + 7]) seg++;
    if (r.bridgeOf[seg] >= 0 || r.bridgeOf[seg + 1] >= 0) onBridge++;
    if (r.tier !== 4 && !roads.isCityPoint(x, z) && k > 0 && k < u.n - 1) outside++;
  }
}
ok(onBridge === 0, `${onBridge} footpath samples on a bridge deck`);
ok(outside === 0, `${outside} footpath samples in open country`);

// no sample inside a junction (pad core + margin)
let inPad = 0;
for (const u of plan.runs) for (let k = 0; k < u.n; k++) {
  const x = u.p[k * FS]; const z = u.p[k * FS + 2];
  for (const p of roads.pads) if (Math.hypot(x - p.x, z - p.z) < p.rCore + F.padMargin - 1e-6) { inPad++; break; }
}
ok(inPad === 0, `${inPad} footpath samples inside a junction pad (+ ${F.padMargin} m margin)`);

// the strip does not lie on another road's asphalt (checked in the middle of the strip at every run sample)
let onAsphalt = 0; let total = 0;
for (const u of plan.runs) for (let k = 1; k < u.n - 1; k++) {
  const a = k * FS;
  const l = u.side * (u.hw + u.width / 2);
  total++;
  if (roads.surfaceAt(u.p[a] + u.p[a + 3] * l, u.p[a + 2] + u.p[a + 4] * l) === 1) onAsphalt++;
}
note(`${onAsphalt} of ${total} footpath strip middles lie on asphalt (another road crossing without a pad, or the ribbon of a side street)`);
ok(onAsphalt / total < 0.005, `less than 0.5 % of the strip middles lie on asphalt (${(100 * onAsphalt / total).toFixed(2)} %)`);

// dropped kerbs
ok(plan.runs.every((u) => rampFactor(u, 0) === 0 && rampFactor(u, u.n - 1) === 0), 'both ends of every run are dropped kerbs (height 0)');
ok(plan.runs.every((u) => u.n < 3 || rampFactor(u, 1) === 1 || u.n === 3 || u.n - 2 === 1 || rampFactor(u, 1) > 0.99), 'full height one step in from each end');
const rampLen = F.step;
note(`dropped kerb: ${(F.height * 1000).toFixed(0)} mm over ${rampLen} m = 1:${(rampLen / F.height).toFixed(0)} (accessible limit 1:12 = ${(F.height * 12).toFixed(2)} m)`);
ok(rampLen >= F.height * 12, `dropped kerb slope is not steeper than 1:12 (1:${(rampLen / F.height).toFixed(0)})`);

// pieces
let pieces = 0; let tooHigh = 0; let maxH = 0;
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) { const p = footPiece(u, k); pieces++; maxH = Math.max(maxH, p.h); if (p.h > F.height + 1e-9) tooHigh++; }
ok(pieces > 0 && tooHigh === 0, `${pieces} collider pieces, highest ${(maxH * 1000).toFixed(0)} mm (limit ${(F.height * 1000).toFixed(0)} mm)`);

// cells and squares
const cells = new Map<string, number>(); const sq = new Map<string, number>();
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) {
  const p = footPiece(u, k);
  const c = Math.floor(p.x / F.cell) + ',' + Math.floor(p.z / F.cell); cells.set(c, (cells.get(c) ?? 0) + 1);
  const s = Math.floor(p.x / 250) + ',' + Math.floor(p.z / 250); sq.set(s, (sq.get(s) ?? 0) + 1);
}
const maxCell = Math.max(...cells.values()); const maxSq = Math.max(...sq.values());
note(`${cells.size} physics cells (most colliders in one: ${maxCell}); ${sq.size} mesh squares (most pieces in one: ${maxSq} = ${maxSq * 10} triangles)`);
ok(maxCell <= 250, `no cell has more than 250 colliders (max ${maxCell})`);
ok(maxSq * 10 <= 12000, `no mesh square has more than 12000 triangles (max ${maxSq * 10})`);

// gullies
console.log('\n=== GULLY GRATES ===');
const g = plan.gullies;
ok(g.length > 0, `${g.length / 4} gully grates, about one per ${(plan.metres / (g.length / 4)).toFixed(0)} m of kerb (target ${F.gullyStep} m)`);
ok(Math.abs(plan.metres / (g.length / 4) - F.gullyStep) < 8, 'average spacing is within 8 m of the target');

// trees and pits stand on the footpath
console.log('\n=== TREE PITS, LAMPS ===');
const rp = planRoadside(gen);
const planned = planCityTrees(roads);
let pitTrees = 0; let wrongFlag = 0;
for (let i = 0; i < planned.trees.length; i += 8) { const f = planned.trees[i + 7]; if (f === 2) pitTrees++; else if (f !== 0 && f !== 1) wrongFlag++; }
ok(pitTrees > 0 && wrongFlag === 0, `${pitTrees} pit trees flagged "on the raised footpath"`);
// every pit lies beside a full-height part of a footpath run (the planner skips the others)
const inStrip = (x: number, z: number): boolean => {
  for (const u of plan.runs) {
    for (let k = 1; k < u.n - 1; k++) {
      const a = k * FS;
      if (Math.hypot(x - u.p[a], z - u.p[a + 2]) > u.hw + u.width + 4) continue;
      const l = u.side * (u.hw + 0.75);
      if (Math.hypot(x - (u.p[a] + u.p[a + 3] * l), z - (u.p[a + 2] + u.p[a + 4] * l)) < F.step) return true;
    }
  }
  return false;
};
let pitsOut = 0; let pitTotal = 0;
for (let i = 0; i < rp.pits.length; i += 4) { pitTotal++; if (!inStrip(rp.pits[i], rp.pits[i + 2])) pitsOut++; }
ok(pitsOut === 0, `${pitTotal} tree pits, ${pitsOut} outside a footpath run`);
ok(F.walkOffset > 1.35 && F.walkOffset < Config.city.roadside.sidewalk, `pedestrian walk line ${F.walkOffset} m is behind the pits (they reach 1.35 m) and inside the ${Config.city.roadside.sidewalk} m strip`);

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
