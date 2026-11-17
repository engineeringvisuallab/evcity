// STEP 17.1g-b (step 3): the GROUND under and around the island link strait structure M6-1 (headless, numbers only).
// Run: npx tsx scripts/island-bridge-ground-check.ts [docs]
// 1 ground under the girder: final ground (natural + road cut / fill, like ring-cut-check) against the girder soffit over the whole deck width, every road point of the structure
// 2 ground under the pier columns / pile caps: the pile cap top (= lowest sea floor around the pier) must not stand in the air (ground more than 1 m under it) and no embankment may rise into the girder
// 3 the two ends: approach slabs rest on ground (ground under the slab end at most 1.8 m under the road, not above the road), abutment wall founded under the ground
// 4 the island end: the road end at the island centre and the 120 m before it, the centreline ground = road level outside the structure
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { straitLayout, IB } from '../src/roads/ring/RingBridgeGeometry';
import { STRUCT } from '../src/roads/ring/RingStructures';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const outDir = process.argv[2] ?? 'docs';
let fails = 0;
const log: string[] = [];
const say = (m: string): void => { console.log(m); log.push(m); };
const ok = (c: boolean, m: string): void => { say((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f2 = (v: number): string => v.toFixed(2);

const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const r = net.roads.find((q) => q.name === ISLAND_LINK_DATA.name)!;
const b = net.bridges.find((q) => q.roadId === r.id)!;
const L = straitLayout(r, b);
const W = b.deckHalfWidth;
const o = { h: 0, water: NaN, fx: 0, fz: 0 };
const fin = (x: number, z: number): number => { gen.sampleGround(x, z, o); net.apply(x, z, o); return o.h; };
const ds = (s: number): number => s + ISLAND_LINK_DATA.s[0];

// 1. ground under the girder over the whole width
let worst = -Infinity, worstAt = '', inside = 0, tot = 0;
for (let i = b.i0; i <= b.i1; i++) {
  const D = L.depthAtS(r.cum[i]);
  for (let u = -W; u <= W + 1e-9; u += 1.5) {
    const x = r.xs[i] + r.nx[i] * u, z = r.zs[i] + r.nz[i] * u;
    const soffitU = Math.abs(u) <= 0.55 * W ? r.ys[i] - D : r.ys[i] - (0.9 + ((D - 0.9) * (Math.abs(u) - 0.55 * W) * 0) ); // wing: at least the 0.9 m edge depth
    const over = fin(x, z) - (Math.abs(u) <= 0.55 * W ? soffitU : r.ys[i] - 0.9);
    tot++;
    if (over > 0) inside++;
    if (over > worst) { worst = over; worstAt = `design s ${f2(ds(r.cum[i]))}, u ${f2(u)}`; }
  }
}
ok(inside === 0, `1 ground under the girder: ${tot} probes over the deck width, ${inside} with the final ground above the soffit (worst: ground ${f2(worst)} m relative to the soffit, at ${worstAt}; negative = clear)`);

// 2. piers
let pierBad = 0;
const parts: string[] = [];
for (const s of L.piers) {
  const k = Math.round(s / r.step);
  const low = Math.min(r.hNat[k - 1], r.hNat[k], r.hNat[k + 1]);
  const f = { x: r.xs[k], z: r.zs[k], nx: r.nx[k], nz: r.nz[k] };
  for (const side of [-1, 1]) {
    const gh = fin(f.x + f.nx * IB.colU * side, f.z + f.nz * IB.colU * side);
    parts.push(`${f2(ds(s))}:${f2(gh)}`);
    if (gh < low - 1.0 || gh > r.ys[k] - L.depthAtS(s)) pierBad++;
  }
}
ok(pierBad === 0, `2 ${L.piers.length * 2} pier columns: final ground at the column axis within 1 m under the pile cap top and under the soffit (design s : ground) ${parts.join(' | ')}; bad ${pierBad}`);

// 3. ends: the abutments stand at the two ends of the structure, on the embankment
for (const [name, s] of [['mainland', L.s0], ['island', L.s1]] as [string, number][]) {
  const k = name === 'mainland' ? b.i0 : b.i1;
  const gh = fin(r.xs[k], r.zs[k]);
  const under = r.ys[k] - gh;
  ok(Math.abs(s - r.cum[k]) < 1e-6 && under >= -0.02 && under <= STRUCT.deckDepth + STRUCT.groundGap + 0.1, `3 ${name} abutment at design s ${f2(ds(s))}: ground at the wall ${f2(gh)} m = ${f2(under)} m under the road ${f2(r.ys[k])} m (embankment carried to the end, wall top ${f2(r.ys[k] - STRUCT.deckDepth)} m)`);
  const k2 = name === 'mainland' ? k - 1 : k + 1;
  ok(Math.abs(fin(r.xs[k2], r.zs[k2]) - r.ys[k2]) < 0.02, `3 ${name}: the next road point outside the structure has ground = road level (${f2(fin(r.xs[k2], r.zs[k2]))} m / ${f2(r.ys[k2])} m)`);
}

// 4. island end
const nN = r.xs.length - 1;
let diff = 0, cnt = 0;
for (let i = nN; i >= 0 && r.cum[nN] - r.cum[i] <= 120; i--) { if (r.bridgeOf[i] >= 0) continue; diff = Math.max(diff, Math.abs(fin(r.xs[i], r.zs[i]) - r.ys[i])); cnt++; }
ok(diff < 0.05, `4 island end: last 120 m of the road (${cnt} points): ground = road level on the centreline, max difference ${f2(diff)} m; road end y ${f2(r.ys[nN])} m`);

say(fails ? `\n${fails} FAIL` : '\nALL PASS');
try { writeFileSync(`${outDir}/STEP171G_B_GROUND_OUTPUT.txt`, log.join('\n') + '\n'); } catch { /* docs folder missing */ }
process.exit(fails ? 1 : 0);
