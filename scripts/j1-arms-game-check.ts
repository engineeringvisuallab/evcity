// STEP J1-e2 (headless): the four M8 arms of J1 as game roads. Run: npx tsx scripts/j1-arms-game-check.ts
// Checks: the roads exist and start on the J1 lane zone (same place, same level), heights = design, grade <= 4 %, the ground follows the road, the structures of 6.1d are registered
// (count, stations), their meshes build, and the RAILWAY IS UNCHANGED with the arms on / off (the railway cannot change).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_S_END } from '../src/roads/junction/GroundJ1Terrain';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { ringStructures, buildStructure } from '../src/roads/ring/RingBridgeGeometry';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);

Config.roads.junctionJ1Arms.enabled = false;
const off = new TerrainGenerator(Config.world.seed);
Config.roads.junctionJ1Arms.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads, t = net.j1!;
ok(!!t, 'J1 terrain exists');
ok(off.roads.roads.every((r) => !r.name.startsWith('J1-')) && off.roads.roads.length + 4 === net.roads.length, `flag off: no arm roads (${off.roads.roads.length} roads), flag on: ${net.roads.length} roads`);

// RAIL-B STEP 3 / 4: E1, S1, W1 (road bridges over a rail that now passes over the lowered road) are gone; STEP 4 (S arm lowered): S 2; RAIL-B point 7 option B step 4: new E route (T at ring st 16813), E 5
const EXPECT: Record<string, number> = { 'J1-N': 5, 'J1-E': 5, 'J1-S': 2, 'J1-W': 2 };
for (const d of J1_ARM_DATA) {
  const r = net.roads.find((q) => q.name === d.name);
  ok(!!r, `${d.name}: road exists`);
  if (!r) continue;
  const arm = d.name.slice(3) as 'N' | 'E' | 'S' | 'W';
  const n = r.xs.length;
  const [ax, az] = t.axisPoint(arm, J1_S_END);
  const dist = Math.hypot(r.xs[0] - ax, r.zs[0] - az), dy = Math.abs(r.ys[0] - t.armLevel(arm, J1_S_END));
  ok(dist < 0.05 && dy < 0.03, `${d.name}: starts on the J1 axis at s ${J1_S_END} (offset ${f2(dist)} m) at the lane-zone level (diff ${f2(dy)} m)`);
  let gmax = 0;
  for (let i = 1; i < n; i++) gmax = Math.max(gmax, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
  ok(gmax <= 0.0415, `${d.name}: ${n} points, length ${f1(r.length)} m, max grade between points ${f2(gmax * 100)} % (limit 4 %, curve overshoot)`);
  // ground = road surface outside structures (the road is built into the terrain)
  let worst = 0, cnt = 0;
  for (let i = 0; i < n; i++) { if (r.bridgeOf[Math.max(0, i - 2)] >= 0 || r.bridgeOf[i] >= 0 || r.bridgeOf[Math.min(n - 1, i + 2)] >= 0) continue; const e = Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]); cnt++; worst = Math.max(worst, e); }
  ok(worst < 0.5, `${d.name}: ground height vs road level on the centreline outside structures and their 16 m end skirt (the slab carve reaches a few metres past the end, like the ring): max diff ${f2(worst)} m (${cnt} points)`);
  const bs = net.bridges.filter((b) => b.roadId === r.id).sort((a, c) => a.i0 - c.i0);
  ok(bs.length === EXPECT[d.name], `${d.name}: ${bs.length} structures (6.1d list: ${EXPECT[d.name]})`);
  const lens = bs.map((b) => b.lengthM), want = d.structs.map(([a, b]) => b - a);
  ok(lens.every((l, i) => Math.abs(l - want[i]) < 25), `${d.name}: structure lengths ${lens.map((l) => l.toFixed(0)).join(' / ')} m (6.1d: ${want.map((l) => l.toFixed(0)).join(' / ')} m)`);
  // the end sits on the ring centreline (T)
  const ring = net.roads.find((q) => q.name === 'M8')!;
  let dm = 1e9; for (let i = 0; i < ring.xs.length; i++) dm = Math.min(dm, Math.hypot(ring.xs[i] - r.xs[n - 1], ring.zs[i] - r.zs[n - 1]));
  ok(dm < 8, `${d.name}: ends ${f1(dm)} m from the nearest ring point (T)`);
}
// structures: meshes
const all = ringStructures(net);
ok(all.length === 6 + 14 + 1, `ringStructures = ${all.length} (ring 6 + arms 14 + island strait M6-1 1)`);
let tri = 0, empty = 0;
const t0 = Date.now();
all.forEach((b, k) => { const m = buildStructure(net, b, k); if (!m.indices.length) empty++; tri += m.indices.length / 3; });
ok(empty === 0, `all structure meshes build: ${tri} triangles, ${empty} empty, ${Date.now() - t0} ms`);
// railway PLAN unchanged (STEP RAIL-A: the plan in x / z is made without the arms; the long section (levels, structures) now knows the arms, so only the plan must be identical)
let railSame = off.rail.edges.length === gen.rail.edges.length;
let maxPlan = 0, maxDesign = 0;
if (railSame) for (let i = 0; i < gen.rail.edges.length; i++) {
  const a = off.rail.edges[i], b = gen.rail.edges[i];
  if (a.id !== b.id || a.xs.length !== b.xs.length) { railSame = false; continue; }
  for (let j = 0; j < a.xs.length; j++) { maxPlan = Math.max(maxPlan, Math.hypot(a.xs[j] - b.xs[j], a.zs[j] - b.zs[j])); maxDesign = Math.max(maxDesign, Math.abs(a.design[j] - b.design[j])); }
}
ok(railSame && maxPlan < 1e-6, `railway PLAN (x, z of ${gen.rail.edges.length} edges) identical with the arms on / off: max difference ${maxPlan.toExponential(1)} m (rail height differs by up to ${f2(maxDesign)} m: the long section knows the arms)`);
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
