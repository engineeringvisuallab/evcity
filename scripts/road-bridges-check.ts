// STEP BRIDGE-ALL check (headless): every registered bridge has a deck mesh + collider today, no river crossing is left without a bridge.
// Run: npx tsx scripts/road-bridges-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildStructure, otherRoadStructures, ringStructures, isOtherRoadStructure } from '../src/roads/ring/RingBridgeGeometry';
let pass = 0, fail = 0;
const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const t0 = Date.now();
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
console.log(`network built in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${net.roads.length} roads, ${net.bridges.length} bridges`);
chk(net.roads.every((r: any, i: number) => r.id === i), 'road id = index (buildStructure reads roads.roads[b.roadId])');
// 1. every bridge has a deck owner
const ring = new Set<number>(ringStructures(net).map((b: any) => b.id));
const other = otherRoadStructures(net);
const otherIds = new Set<number>(other.map((b: any) => b.id));
let orphan = 0;
for (const b of net.bridges) {
  const nm = net.roads[b.roadId].name as string;
  const own = ring.has(b.id) || otherIds.has(b.id) || nm.startsWith('HK-') || nm.startsWith('RTE-') || nm === 'M6-1';
  if (!own) { orphan++; console.log('   orphan', b.id, nm); }
}
chk(orphan === 0, `every bridge has a deck owner (ring/arms ${ring.size}, other roads ${other.length}, HK decks separate)`);
chk(other.every((b: any) => isOtherRoadStructure(net, b)), 'other-road list uses the same rule');
// 2. mesh of each other-road bridge
let tris = 0, piers = 0, badMesh = 0, noCol = 0, offRoad = 0;
const t1 = Date.now();
other.forEach((b: any, i: number) => {
  const d = buildStructure(net, b, 100 + i);
  const r = net.roads[b.roadId];
  if (d.indices.length === 0 || !d.positions.every(Number.isFinite)) badMesh++;
  if (!d.collider || d.collider.indices.length === 0) noCol++;
  tris += d.indices.length / 3;
  // all vertices within deck half width + margin of the bridge bbox, and no vertex above road + 1.2 (parapet)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ym = -1e9;
  for (let k = b.i0; k <= b.i1; k++) { x0 = Math.min(x0, r.xs[k]); x1 = Math.max(x1, r.xs[k]); z0 = Math.min(z0, r.zs[k]); z1 = Math.max(z1, r.zs[k]); ym = Math.max(ym, r.ys[k]); }
  const mg = b.deckHalfWidth + 8;
  for (let q = 0; q < d.positions.length; q += 3) { if (d.positions[q] < x0 - mg || d.positions[q] > x1 + mg || d.positions[q + 2] < z0 - mg || d.positions[q + 2] > z1 + mg || d.positions[q + 1] > ym + 1.3) { offRoad++; break; } }
  // pier count = number of pier-coloured prisms is not tracked; use triangle count above the plain deck as a hint
  const deckOnly = (b.i1 - b.i0) * 5 * 2 + 4;
  if (d.indices.length / 3 > deckOnly + 200) piers++;
});
console.log(`   other-road bridges ${other.length}: ${tris} triangles in total, ${piers} with piers, built in ${Date.now() - t1} ms`);
chk(badMesh === 0, 'every bridge builds a finite, non-empty mesh');
chk(noCol === 0, 'every bridge has a collision top face');
chk(offRoad === 0, 'no vertex far from its bridge / above the parapet line');
// 3. no wet stretch without a bridge left
const sc: any = { h: 0, water: NaN, fx: 0, fz: 0 };
let wet = 0;
for (const r of net.roads) {
  if (r.earth) continue;
  for (let i = 0; i < r.xs.length; i++) {
    net.natural(r.xs[i], r.zs[i], sc);
    if (!Number.isNaN(sc.water) && sc.h < sc.water + 0.3 && sc.h > 2 && r.bridgeOf[i] < 0) { wet++; console.log('   WET', r.name, i, Math.round(r.xs[i]), Math.round(r.zs[i])); }
  }
}
chk(wet === 0, 'no road point over river water without a bridge');
for (const nm of ['R6-10', 'R6-11']) {
  const r = net.roads.find((q: any) => q.name === nm);
  const bs = net.bridges.filter((b: any) => b.roadId === r.id);
  chk(bs.length >= 1, `${nm} has ${bs.length} bridge(s) now: ${JSON.stringify(bs.map((b: any) => ({ i0: b.i0, i1: b.i1, len: b.lengthM, clear: +b.clearanceM.toFixed(1) })))}`);
}
// 4. the collision face lies on the road: at every collider vertex the y is the road level (-5 mm) of some road point within COLLIDER_EXT (2) points of the bridge
let lvl = 0;
for (const b of other) {
  const r = net.roads[b.roadId]; const c = buildStructure(net, b, 0).collider!;
  const lo = Math.max(0, b.i0 - 2), hi = Math.min(r.ys.length - 1, b.i1 + 2);
  let ymax = -1e9, ymin = 1e9; for (let k = lo; k <= hi; k++) { ymax = Math.max(ymax, r.ys[k]); ymin = Math.min(ymin, r.ys[k]); }
  for (let q = 0; q < c.positions.length; q += 3) { const y = c.positions[q + 1]; if (y > ymax + 0.001 || y < ymin - 0.01) lvl++; }
}
chk(lvl === 0, 'collision face lies at the road level (within the road level range of the bridge)');
console.log(`SUMMARY: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
