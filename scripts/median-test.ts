// ROADS STEP 2: headless checks of the physical median plan (no three.js, no Rapier). Run: npx tsx scripts/median-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { MS, medianHalfAt, medianPiece, noseScale, planMedians, yawPitchQuat } from '../src/roads/MedianPlan';
import { dividedSectionOf, laneCentre, laneWidth, lanesPerDir, medianSoilTop } from '../src/roads/RoadSection';
import { planRoadside } from '../src/roads/Roadside';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const note = (m: string): void => console.log(`NOTE ${m}`);
const M = Config.city.median;

const gen = new TerrainGenerator();
const roads = gen.roads;
const plan = planMedians(roads);
const divided = roads.roads.filter((r) => dividedSectionOf(r) && !r.earth);

console.log('\n=== MEDIAN PLAN ===');
ok(plan.runs.length > 0, `${plan.runs.length} median runs on ${divided.length} divided roads`);
ok(divided.every((r) => plan.runs.some((u) => u.roadId === r.id)), 'every divided road has at least one median run');
const byId = new Map(roads.roads.map((r) => [r.id, r]));
ok(plan.runs.every((u) => { const r = byId.get(u.roadId)!; return dividedSectionOf(r) !== null && Math.abs(u.medianHalf - r.medianHalf) < 1e-9; }), 'no median on an undivided road; every run has the median width of its road');
ok(plan.runs.every((u) => u.n >= 2), 'every run has at least 2 samples');
const minLen = Math.min(...plan.runs.map((u) => u.p[(u.n - 1) * MS + 7] - u.p[7]));
ok(minLen >= M.minRun - 1e-6, `shortest run is ${minLen.toFixed(1)} m (limit ${M.minRun} m)`);

// no sample inside a junction (pad core + margin)
let inPad = 0;
for (const u of plan.runs) for (let k = 0; k < u.n; k++) {
  const x = u.p[k * MS]; const z = u.p[k * MS + 2];
  for (const p of roads.pads) if (Math.hypot(x - p.x, z - p.z) < p.rCore + M.padMargin - 1e-6) { inPad++; break; }
}
ok(inPad === 0, `${inPad} median samples stand inside a junction pad (+ ${M.padMargin} m margin)`);

// sample spacing and heights
let maxGap = 0;
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) maxGap = Math.max(maxGap, Math.hypot(u.p[(k + 1) * MS] - u.p[k * MS], u.p[(k + 1) * MS + 2] - u.p[k * MS + 2]));
ok(maxGap <= M.step + 0.01, `largest sample gap ${maxGap.toFixed(2)} m (step ${M.step} m)`);

// nose
ok(noseScale(0) === 0 && Math.abs(noseScale(M.noseLen) - 1) < 1e-9 && noseScale(M.noseLen / 2) > 0.5, `nose: width factor 0 at the tip, 1 after ${M.noseLen} m, round (not a wedge)`);
ok(plan.runs.every((u) => medianHalfAt(u, 0) < 1e-9 && medianHalfAt(u, u.n - 1) < 1e-9), 'every run ends in a nose (width 0 at both ends)');
ok(plan.runs.every((u) => { const mid = (u.n / 2) | 0; return Math.abs(medianHalfAt(u, mid) - u.medianHalf) < 1e-9 || u.n < 6; }), 'the middle of a run has the full median width');

// lanes stay clear of the median (kerb + 0.5 m shy) on every divided road, for every lane
let bad = 0;
for (const r of divided) {
  const lw = laneWidth(r);
  for (let k = 0; k < lanesPerDir(r); k++) {
    const inner = laneCentre(r, k) - lw / 2;
    if (inner < r.medianHalf + 0.5 - 1e-6) bad++;
  }
}
ok(bad === 0, `every lane edge is at least 0.5 m from the median kerb (${bad} wrong)`);
// a car (2.1 m wide) in the passing lane centre has room
let tight = 0;
for (const r of divided) { const k = lanesPerDir(r) - 1; if (laneCentre(r, k) - 1.05 < r.medianHalf) tight++; }
ok(tight === 0, `a 2.1 m wide car in the innermost lane clears the median (${tight} roads too tight)`);

// colliders
console.log('\n=== COLLIDER PIECES ===');
let pieces = 0; let badQ = 0; let badSlope = 0; let totalLen = 0;
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) {
  const p = medianPiece(u, k);
  pieces++; totalLen += p.len;
  const q = yawPitchQuat(p.yaw, p.pitch);
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (Math.abs(n - 1) > 1e-9) badQ++;
  // rotate +Z by q: must point along the road (3D)
  const vx = 0; const vy = 0; const vz = 1;
  const tx = vx + 2 * (q.y * (q.x * vy - q.y * vx) - q.z * (q.z * vx - q.x * vz)) + 2 * q.w * (q.y * vz - q.z * vy);
  const ty = vy + 2 * (q.z * (q.y * vz - q.z * vy) - q.x * (q.x * vy - q.y * vx)) + 2 * q.w * (q.z * vx - q.x * vz);
  const tz = vz + 2 * (q.x * (q.z * vx - q.x * vz) - q.y * (q.y * vz - q.z * vy)) + 2 * q.w * (q.x * vy - q.y * vx);
  const a = k * MS; const b = a + MS;
  const dx = u.p[b] - u.p[a]; const dy = u.p[b + 1] - u.p[a + 1]; const dz = u.p[b + 2] - u.p[a + 2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  if (Math.hypot(tx - dx / dl, ty - dy / dl, tz - dz / dl) > 1e-6) badSlope++;
}
ok(pieces > 0, `${pieces} collider pieces, ${(totalLen / 1000).toFixed(1)} km of barrier`);
ok(badQ === 0, `every piece rotation is a unit quaternion (${badQ} wrong)`);
ok(badSlope === 0, `every piece points along the road including its slope (${badSlope} wrong)`);
note(`median built: ${(plan.metres / 1000).toFixed(1)} km; divided road left flat (junctions): ${(plan.flatMetres / 1000).toFixed(1)} km`);

// cells
const cellMap = new Map<string, number>();
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) { const p = medianPiece(u, k); const key = Math.floor(p.x / M.cell) + ',' + Math.floor(p.z / M.cell); cellMap.set(key, (cellMap.get(key) ?? 0) + 1); }
const maxCell = Math.max(...cellMap.values());
note(`${cellMap.size} physics cells of ${M.cell} m; most pieces in one cell: ${maxCell}`);
ok(maxCell <= 200, `no cell has more than 200 colliders (max ${maxCell})`);

// 250 m squares: mesh size
const sq = new Map<string, number>();
for (const u of plan.runs) for (let k = 0; k < u.n - 1; k++) { const p = medianPiece(u, k); const key = Math.floor(p.x / 250) + ',' + Math.floor(p.z / 250); sq.set(key, (sq.get(key) ?? 0) + 1); }
const maxSq = Math.max(...sq.values());
note(`${sq.size} mesh squares of 250 m; most segments in one square: ${maxSq} (= ${maxSq * 14} triangles)`);
ok(maxSq * 14 <= 12000, `no mesh square has more than 12000 triangles (max ${maxSq * 14})`);

// planting stands on the soil
console.log('\n=== PLANTING ON THE SOIL ===');
const rp = planRoadside(gen);
ok(Math.abs(medianSoilTop(divided[0]) - (0.15 - M.soilDrop)) < 1e-9, `soil is ${(0.15 - M.soilDrop).toFixed(2)} m above the road surface (kerb 0.15 - drop ${M.soilDrop})`);
ok(rp.hedges.length > 0, `${rp.hedges.length / 7} median hedge pieces planned`);
// every median hedge lies inside a median run
const inRun = (x: number, z: number): boolean => plan.runs.some((u) => {
  for (let k = 0; k < u.n; k++) if (Math.hypot(x - u.p[k * MS], z - u.p[k * MS + 2]) < M.step) return true;
  return false;
});
const medianHedges: number[] = [];
for (let i = 0; i < rp.hedges.length; i += 7) {
  const x = rp.hedges[i]; const z = rp.hedges[i + 2];
  // only the ones on divided roads (parking-lot hedges are elsewhere)
  if (divided.some((r) => { for (let j = 0; j < r.xs.length; j++) if (Math.hypot(x - r.xs[j], z - r.zs[j]) < 1.0) return true; return false; })) medianHedges.push(x, z);
}
let outside = 0;
for (let i = 0; i < medianHedges.length; i += 2) if (!inRun(medianHedges[i], medianHedges[i + 1])) outside++;
ok(outside === 0, `${medianHedges.length / 2} median hedge pieces, ${outside} outside a median run`);
let treesOut = 0; let nTrees = 0;
for (let i = 0; i < rp.trees.length; i += 8) {
  if (rp.trees[i + 7] < 0.5) continue;
  nTrees++;
  if (!inRun(rp.trees[i], rp.trees[i + 2])) treesOut++;
}
ok(treesOut === 0, `${nTrees} median trees, ${treesOut} outside a median run`);

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
