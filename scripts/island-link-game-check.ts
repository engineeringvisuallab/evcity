// STEP 17.1g-a (headless): the island link M6-1 as a game road (deck option A). Run: npx tsx scripts/island-link-game-check.ts [docs]
// Checks: the road exists (flag on / off), M6 section, starts just outside the ring pavement at the S node, ends at the island centre, heights = design, grade <= 4 %, the ground follows the road
// outside the structure, cut <= 12 m and fill <= 7 m at the pavement edge outside the structure, the strait structure is registered (one structure, stations, clearance over the water),
// the ribbon is held back on its inner deck while the deck mesh does not exist, the shader knows the M6 row, and the RAILWAY PLAN is identical with the island link on / off.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';
import { SHADER_ROWS, sectionGlslLine } from '../src/roads/section/ShaderSection';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { ringStructures } from '../src/roads/ring/RingBridgeGeometry';

const outDir = process.argv[2] ?? 'docs';
let fails = 0;
const log: string[] = [];
const say = (m: string): void => { console.log(m); log.push(m); };
const ok = (c: boolean, m: string): void => { say((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);

Config.roads.islandLink.enabled = false;
const off = new TerrainGenerator(Config.world.seed);
Config.roads.islandLink.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const D = ISLAND_LINK_DATA;

ok(off.roads.roads.every((r) => r.name !== D.name) && off.roads.roads.length + 1 === net.roads.length, `flag off: no island link (${off.roads.roads.length} roads), flag on: ${net.roads.length} roads`);
const r = net.roads.find((q) => q.name === D.name);
ok(!!r, `road ${D.name} exists`);
if (!r) { console.log('\nFAIL'); process.exit(1); }
const n = r.xs.length;
ok(r.lanes === 6 && Math.abs(r.halfWidth - SECTION_M6.pavementEdge) < 1e-9 && Math.abs(r.medianHalf - 2) < 1e-9 && Math.abs(r.laneW - 3.5) < 1e-9, `M6 section: ${r.lanes} lanes, half width ${f2(r.halfWidth)} m (SECTION_M6 ${f2(SECTION_M6.pavementEdge)}), median half ${f2(r.medianHalf)} m, lane ${f2(r.laneW)} m`);
ok(SHADER_ROWS.length === 2 && sectionGlslLine().includes(SECTION_M6.pavementEdge.toFixed(3)), 'shader knows the M6 row (half width 16.000) next to the ring row');

// start: just outside the ring pavement edge (22.1 m) at the S node, same level as the design
const ring = net.roads.find((q) => q.name === 'M8')!;
let dRing = 1e9;
for (let i = 0; i < ring.xs.length; i++) dRing = Math.min(dRing, Math.hypot(ring.xs[i] - r.xs[0], ring.zs[i] - r.zs[0]));
ok(dRing > 22.1 && dRing < 30, `starts ${f1(dRing)} m from the ring centreline (ring pavement edge 22.1 m): no overlap with the ring ribbon`);
ok(Math.abs(r.ys[0] - D.ys[0]) < 0.01 && Math.abs(r.ys[n - 1] - D.ys[D.ys.length - 1]) < 0.01, `start level ${f2(r.ys[0])} m, end level ${f2(r.ys[n - 1])} m (17.1d option A: ${f2(D.ys[0])} / ${f2(D.ys[D.ys.length - 1])})`);
const dEnd = Math.hypot(r.xs[n - 1] - (-1400), r.zs[n - 1] - 4050);
ok(dEnd < 1, `ends ${f2(dEnd)} m from the island centre (-1400, 4050)`);
let gmax = 0;
for (let i = 1; i < n; i++) gmax = Math.max(gmax, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
ok(gmax <= 0.0415, `${n} points, length ${f1(r.length)} m (design ${f1(D.s[D.s.length - 1] - D.s[0])} m), max grade between points ${f2(gmax * 100)} % (design max 3.5 %, limit 4 %)`);

// structure
const bs = net.bridges.filter((b) => b.roadId === r.id).sort((a, c) => a.i0 - c.i0);
ok(bs.length === 1, `${bs.length} structure registered (mainland viaduct + strait bridge + island viaduct as one run)`);
const b = bs[0];
if (b) {
  const want = D.structs[0][1] - D.structs[0][0];
  ok(Math.abs(b.lengthM - want) < 20, `structure length ${f1(b.lengthM)} m (17.1d: ${f1(want)} m = 40 + 299 + 55 plus the rounding of the grid)`);
  const sA = D.s[0], sB = D.s[D.s.length - 1];
  const sOf = (i: number): number => sA + (i / (n - 1)) * (sB - sA);
  ok(Math.abs(sOf(b.i0) - D.structs[0][0]) < 12 && Math.abs(sOf(b.i1) - D.structs[0][1]) < 12, `structure from s ${f1(sOf(b.i0))} to s ${f1(sOf(b.i1))} (17.1d: ${D.structs[0][0]} to ${D.structs[0][1]})`);
  ok(sOf(b.i1) < 961, `structure ends before the horizontal curve (s 961): last s ${f1(sOf(b.i1))}`);
  ok(Math.abs(b.waterY) < 0.01, `water level of the strait in the game ${f2(b.waterY)} m (sea level 0; the design adds high water +1.0 m on top, 17.1d A2)`);
  ok(b.clearanceM >= 7, `clearance under the deck over the water ${f2(b.clearanceM)} m (17.1d: soffit >= high water 1.0 m + 6 m = 7 m over sea level; STRUCT.deckDepth taken off the deck)`);
}
{ const all = ringStructures(net); const k = all.findIndex((s) => s.roadId === r.id); ok(k === all.length - 1 && k === 20, `17.1g-b: ringStructures() lists M6-1 LAST (index ${k} of ${all.length} = design number ${k + 1}, bridgeDeck = ${Config.roads.islandLink.bridgeDeck})`); }
Config.roads.islandLink.bridgeDeck = false;
ok(!ringStructures(net).some((s) => s.roadId === r.id), 'bridgeDeck = false: ringStructures() does not list M6-1 (no deck mesh, ribbon held back)');

// ground follows the road outside the structure (and its 16 m end skirt); cut / fill at the pavement edge against the natural ground (the world WITHOUT the island link)
let worst = 0, cnt = 0, maxCut = 0, maxFill = 0;
const near = (i: number, k: number): boolean => { for (let q = Math.max(0, i - k); q <= Math.min(n - 1, i + k); q++) if (r.bridgeOf[q] >= 0) return true; return false; };
for (let i = 0; i < n; i++) {
  if (near(i, 3)) continue;
  cnt++;
  worst = Math.max(worst, Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]));
  for (const side of [-1, 1]) {
    const x = r.xs[i] + r.nx[i] * side * r.halfWidth, z = r.zs[i] + r.nz[i] * side * r.halfWidth;
    const g = off.heightAt(x, z);
    maxCut = Math.max(maxCut, g - r.ys[i]);
    maxFill = Math.max(maxFill, r.ys[i] - g);
  }
}
ok(worst < 0.5, `ground height vs road level on the centreline outside the structure (${cnt} points): max diff ${f2(worst)} m`);
ok(maxCut <= 12, `max cut at the pavement edge outside the structure ${f2(maxCut)} m (limit 12 m; 17.1d design 7.5 m at the daylight edge)`);
ok(maxFill <= 7.5, `max fill at the pavement edge outside the structure ${f2(maxFill)} m (limit 7 m, 0.5 m grid margin; 17.1d design 7.0 m)`);

// ribbon held back on the inner deck
let pend = 0, inner = 0;
for (let s = 0; s < net.segmentCount; s++) { if (net.segmentRoad(s).name !== D.name) continue; if (net.deckPending(s)) pend++; if (net.segmentRoad(s).bridgeOf[net.segmentPoint(s)] >= 0) inner++; }
ok(pend > 20 && pend < inner, `ribbon held back on ${pend} inner deck pieces of ${inner} structure pieces (the two approach slabs keep their ribbon)`);
Config.roads.islandLink.bridgeDeck = true;
let pend2 = 0;
for (let s = 0; s < net.segmentCount; s++) if (net.deckPending(s)) pend2++;
Config.roads.islandLink.bridgeDeck = true; // the default since 17.1g-b
ok(pend2 === 0, 'bridgeDeck = true brings the ribbon back on the whole deck');

// railway plan unchanged
let railSame = off.rail.edges.length === gen.rail.edges.length, maxPlan = 0;
if (railSame) for (let i = 0; i < gen.rail.edges.length; i++) {
  const a = off.rail.edges[i], c = gen.rail.edges[i];
  if (a.id !== c.id || a.xs.length !== c.xs.length) { railSame = false; continue; }
  for (let j = 0; j < a.xs.length; j++) maxPlan = Math.max(maxPlan, Math.hypot(a.xs[j] - c.xs[j], a.zs[j] - c.zs[j]));
}
ok(railSame && maxPlan < 1e-6, `railway PLAN (x, z of ${gen.rail.edges.length} edges) identical with the island link on / off: max difference ${maxPlan.toExponential(1)} m`);

say(fails ? `\n${fails} FAIL` : '\nALL PASS');
try { writeFileSync(`${outDir}/STEP171G_A_OUTPUT.txt`, log.join('\n') + '\n'); } catch { /* docs folder missing: console output only */ }
process.exit(fails ? 1 : 0);
