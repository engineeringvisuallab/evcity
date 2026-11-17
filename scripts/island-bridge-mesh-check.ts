// STEP 17.1g-b (headless): the MESH and the numbers of the island link strait structure M6-1 (plain box girder on piers: mainland viaduct + strait bridge + island viaduct).
// Run: npx tsx scripts/island-bridge-mesh-check.ts [docs]
// Checks: structure found by road name, mesh valid (finite, indices, no NaN), deck width = SECTION_M6 (32.0 m between the parapet inner faces, 33.8 m over the parapets), safety-shape parapet,
// soffit clearance over the water (>= high water 1.0 m + 6 m), equal spans <= 52 m on piers that stand on the sea floor, foundation level, the three parts from the real sea floor,
// and the LOAD numbers (triangles, build time, draw call) compared with the other structures (PERFORMANCE_RULES.md asks to REPORT them).
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildStructure, ringStructures, straitLayout, isStraitStructure, IB } from '../src/roads/ring/RingBridgeGeometry';
import { STRUCT } from '../src/roads/ring/RingStructures';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const outDir = process.argv[2] ?? 'docs';
let fails = 0;
const log: string[] = [];
const say = (m: string): void => { console.log(m); log.push(m); };
const ok = (c: boolean, m: string): void => { say((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);

const HWL = 1.0, CLEAR = 6.0; // design high water above sea level 0 (17.1d) and the wanted clearance of the soffit above it
const net = new TerrainGenerator(Config.world.seed).roads;
const r = net.roads.find((q) => q.name === ISLAND_LINK_DATA.name)!;
const b = net.bridges.find((q) => q.roadId === r?.id)!;
ok(!!r && !!b && isStraitStructure(net, b), `M6-1 strait structure found by road name (road ${r?.id}, structure ${b?.id}), buildStructure() gives it the strait girder`);
const L = straitLayout(r, b);
const m = buildStructure(net, b, 99);
const A0 = ISLAND_LINK_DATA.s[0]; // design station of the road's first point: design s = road s + A0
const ds = (s: number): number => s + A0;

// 1. mesh valid
const nv = m.positions.length / 3, nt = m.indices.length / 3;
const finite = m.positions.every(Number.isFinite) && m.colors.every(Number.isFinite);
let degenerate = 0;
for (let i = 0; i < m.indices.length; i += 3) {
  const [a, c, d] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]].map((q) => q * 3);
  const ux = m.positions[c] - m.positions[a], uy = m.positions[c + 1] - m.positions[a + 1], uz = m.positions[c + 2] - m.positions[a + 2];
  const vx = m.positions[d] - m.positions[a], vy = m.positions[d + 1] - m.positions[a + 1], vz = m.positions[d + 2] - m.positions[a + 2];
  if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-9) degenerate++;
}
ok(finite && m.indices.every((q) => q >= 0 && q < nv) && m.indices.length % 3 === 0, `mesh valid: ${nv} vertices, ${nt} triangles, all numbers finite, all indices inside`);
say(`INFO  degenerate (zero-area) triangles: ${degenerate} (shared edges between the lofted rows)`);
const colN = m.collider ? m.collider.indices.length / 3 : 0;
ok(colN > 0, `collision-only deck top face: ${colN} triangles (not drawn; the road ribbon draws the asphalt)`);

// 2. parts from the real sea floor
const wet: number[] = [];
for (let i = b.i0; i <= b.i1; i++) if (r.hNat[i] < 0) wet.push(i);
ok(wet.length > 0, `${wet.length} road points of the structure stand over sea floor below 0`);
const sWet0 = r.cum[wet[0]], sWet1 = r.cum[wet[wet.length - 1]];
say(`INFO  structure: design s ${f1(ds(r.cum[b.i0]))} - ${f1(ds(r.cum[b.i1]))} = ${f1(r.cum[b.i1] - r.cum[b.i0])} m (grid ${r.step} m); abutments at the two ends (design s ${f1(ds(L.s0))} and ${f1(ds(L.s1))}), where the embankment ends; no 16 m approach slab inside (ring structures have one, STRUCT.approach = ${STRUCT.approach} m)`);
say(`INFO  parts from the real sea floor (hNat < 0): mainland viaduct ${f1(sWet0 - r.cum[b.i0])} m | STRAIT BRIDGE ${f1(sWet1 - sWet0)} m | island viaduct ${f1(r.cum[b.i1] - sWet1)} m (handoff text: 40 + 299 + 55)`);

// 3. spans and piers
const sup = [L.s0, ...L.piers, L.s1];
const spans = sup.slice(1).map((s, i) => s - sup[i]);
ok(spans.every((s) => s <= IB.spanMax + 1e-6) && Math.max(...spans) - Math.min(...spans) < 1e-6, `${L.spans} equal spans of ${f1(spans[0])} m between abutments (largest allowed ${IB.spanMax} m), ${L.piers.length} pier lines = ${2 * L.piers.length} columns`);
const pierSea = L.piers.map((s) => {
  const i = Math.round(s / r.step);
  return { s, low: Math.min(r.hNat[i - 1], r.hNat[i], r.hNat[i + 1]) };
});
say('INFO  pier lines (design s / sea floor under the pier / pile cap bottom): ' + pierSea.map((p) => `${f1(ds(p.s))} / ${f1(p.low)} / ${f1(p.low - IB.ftEmbed)}`).join(' | '));
ok(pierSea.every((p) => p.low < 0.5), `every pier line stands on the sea floor (floor ${f1(Math.min(...pierSea.map((p) => p.low)))} m ... ${f1(Math.max(...pierSea.map((p) => p.low)))} m)`);

// 4. width: vertices at road level of the mid-span road point
const kk = (b.i0 + b.i1) >> 1;
const tx = r.xs[kk + 1] - r.xs[kk - 1], tz = r.zs[kk + 1] - r.zs[kk - 1], tl = Math.hypot(tx, tz);
const ux = new Set<number>();
for (let i = 0; i < nv; i++) {
  const px = m.positions[i * 3] - r.xs[kk], py = m.positions[i * 3 + 1], pz = m.positions[i * 3 + 2] - r.zs[kk];
  if (Math.abs(py - r.ys[kk]) > 1e-6 || Math.abs((px * tx + pz * tz) / tl) > 0.01) continue; // parapet base vertices at road level in this cross-section
  ux.add(Math.round((px * r.nx[kk] + pz * r.nz[kk]) * 100) / 100);
}
const us = [...ux].sort((a, c) => a - c);
const pavement = SECTION_M6.pavementEdge;
ok(us.length === 4 && Math.abs(us[1] + pavement) < 0.02 && Math.abs(us[2] - pavement) < 0.02, `parapet base at road level, mid-span cross-section: u = ${us.join(', ')} m: inner faces at +-${f2(pavement)} m = the M6 pavement edge (${f1(2 * pavement)} m between the parapets); outer faces +-${f2(b.deckHalfWidth)} m (${f1(2 * b.deckHalfWidth)} m over the parapets)`);
ok(Math.abs(IB.parapetBase - (b.deckHalfWidth - pavement)) < 0.02, `parapet base ${f2(IB.parapetBase)} m, top ${f2(IB.parapetTop)} m, height ${IB.parapetH} m (outer face vertical, inner face sloped)`);
ok(IB.colU + IB.topB / 2 <= 0.55 * b.deckHalfWidth && IB.capHalf <= 0.55 * b.deckHalfWidth + 0.01, `columns (+-${IB.colU} m, top width ${IB.topB} m) and cross-beam (half ${IB.capHalf} m) stand under the box soffit (half ${f2(0.55 * b.deckHalfWidth)} m)`);

// 5. soffit clearance over the water (mesh soffit vertices = the real bottom of the girder)
const key = (x: number, z: number): string => `${x.toFixed(3)},${z.toFixed(3)}`;
const bottom = new Map<string, number>();
for (let i = 0; i < nv; i++) { const k = key(m.positions[i * 3], m.positions[i * 3 + 2]); bottom.set(k, Math.min(bottom.get(k) ?? 1e9, m.positions[i * 3 + 1])); }
let minWet = Infinity, minWetAt = -1, minBeach = Infinity, beachAt = -1, depthErr = 0, nWet = 0, maxDepth = 0;
for (let i = b.i0; i <= b.i1; i++) {
  const y = bottom.get(key(r.xs[i] + r.nx[i] * 0.55 * b.deckHalfWidth, r.zs[i] + r.nz[i] * 0.55 * b.deckHalfWidth));
  if (y === undefined) { depthErr = 99; continue; }
  const depth = r.ys[i] - y;
  maxDepth = Math.max(maxDepth, depth);
  depthErr = Math.max(depthErr, Math.abs(depth - L.depthAtS(r.cum[i])));
  if (r.hNat[i] < 0) { nWet++; if (y < minWet) { minWet = y; minWetAt = i; } }
  else if (r.hNat[i] < HWL && y < minBeach) { minBeach = y; beachAt = i; }
}
ok(depthErr < 1e-3, `mesh soffit = road level - girder depth of straitLayout() at every road point (max difference ${depthErr.toExponential(1)} m); depth ${f1(STRUCT.deckDepth)} m on the approach slabs, up to ${f1(maxDepth)} m (IB.depthMax ${IB.depthMax})`);
ok(minWet - HWL >= CLEAR - 1e-6, `SOFFIT over the sea (${nWet} road points with the sea floor below 0): lowest soffit ${f2(minWet)} m = ${f2(minWet - HWL)} m above high water ${HWL} m (wanted >= ${CLEAR} m), at design s ${f1(ds(r.cum[minWetAt]))}`);
if (beachAt >= 0) say(`INFO  beach strip (sea floor 0 .. +${HWL} m, covered only at high water): lowest soffit ${f2(minBeach)} m = ${f2(minBeach - HWL)} m above high water at design s ${f1(ds(r.cum[beachAt]))}${minBeach - HWL >= CLEAR ? '' : ' (below the 6 m wanted, water there is under 1 m deep)'}`);

// 6. nothing sticks out above the parapets, lowest point = deepest pile cap
let ymin = Infinity, ymax = -Infinity;
for (let i = 1; i < m.positions.length; i += 3) { ymin = Math.min(ymin, m.positions[i]); ymax = Math.max(ymax, m.positions[i]); }
let deckTop = -Infinity;
for (let i = b.i0; i <= b.i1; i++) deckTop = Math.max(deckTop, r.ys[i]);
const lowFloor = Math.min(...pierSea.map((p) => p.low));
ok(Math.abs(ymin - (lowFloor - IB.ftEmbed)) < 0.05 && ymax - deckTop < IB.parapetH + 0.1, `lowest point of the mesh ${f2(ymin)} m (deepest pile cap ${f2(lowFloor - IB.ftEmbed)} m), highest ${f2(ymax - deckTop)} m over the highest deck point (parapet ${IB.parapetH} m)`);

// 7. load numbers
const t0 = process.hrtime.bigint();
const RUNS = 20;
for (let q = 0; q < RUNS; q++) buildStructure(net, b, 99);
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / RUNS;
const olderList = ringStructures(net).filter((s) => s.roadId !== r.id); // the 20 structures of the ring and the arms (ringStructures() lists M6-1 last since step 2)
const others = olderList.map((s, i) => buildStructure(net, s, i).indices.length / 3);
const sum = others.reduce((a, c) => a + c, 0);
say(`LOAD  M6-1 strait structure: ${nt} triangles (render) + ${colN} collision-only, ${nv} vertices, build time ${ms.toFixed(2)} ms (mean of ${RUNS}, headless node), ONE mesh = ONE draw call with the shared ring structure material once registered in step 2`);
say(`LOAD  the ${others.length} older structures: ${sum} triangles in total, largest ${Math.max(...others)}; with M6-1: ${sum + nt} (+${((100 * nt) / sum).toFixed(1)} %). In-game FPS / draw calls (?perf=1): NOT MEASURED`);
ok(nt <= Math.max(...others) && ms < 50, `M6-1 is not the heaviest structure (${nt} <= ${Math.max(...others)} triangles) and builds in < 50 ms (MY threshold: PERFORMANCE_RULES.md has no number for static meshes, it asks to REPORT draw calls / triangles)`);

say(fails ? `\n${fails} FAIL` : '\nALL PASS');
try { writeFileSync(`${outDir}/STEP171G_B_MESH_OUTPUT.txt`, log.join('\n') + '\n'); } catch { /* docs folder missing */ }
process.exit(fails ? 1 : 0);
