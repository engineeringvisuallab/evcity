// R6 game check (headless, G6d): every R6 road in the game network (gen.roads) is checked against R6LineData.ts, and the railway fingerprint is printed so a run with R6 ON and OFF can be compared.
// Ground = gen.sample (the finished game terrain with the road earthworks).
// Run: npx tsx scripts/r6-game-check.ts            (R6 on)      npx tsx scripts/r6-game-check.ts off     (R6 off, railway fingerprint only)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { R6_LINE_DATA } from '../src/roads/r6/R6LineData';
import { R6_SLIP_DATA } from '../src/roads/r6/R6SlipData';
const off = process.argv[2] === 'off';
if (off) Config.roads.r6Roads.enabled = false;
const gen: any = new TerrainGenerator(Config.world.seed);
const e = gen.rail.edges as any[];
let h = 0; for (const ed of e) for (let i = 0; i < ed.xs.length; i++) h = (h * 31 + Math.round(ed.xs[i] * 100) + 7 * Math.round(ed.zs[i] * 100)) % 1000000007;
console.log(`R6 ${off ? 'OFF' : 'ON'}: rail ${e.length} edges, ${gen.rail.lengthKm.toFixed(2)} km, ${gen.rail.crossings.length} road crossings, ${gen.rail.piers.length} piers, ${gen.rail.steelSpans.length} steel spans, geometry hash ${h}`);
if (off) process.exit(0);
const sc = gen.makeSample(); let bad = 0; const fail = (m: string) => { bad++; console.log('FAIL', m); };
for (const d of R6_LINE_DATA) {
  const r = gen.roads.roads.find((q: any) => q.name === d.name);
  if (!r) { fail(`${d.name} is not in the game network`); continue; }
  let len = 0; for (let i = 1; i < r.xs.length; i++) len += Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
  let maxC = 0, maxS = 0, maxG = 0;
  for (let i = 0; i < r.xs.length; i++) {
    gen.sample(r.xs[i], r.zs[i], sc); const y = r.ys[i]; if (!Number.isNaN(y) && !(r.bridgeOf && r.bridgeOf[i] >= 0)) maxC = Math.max(maxC, Math.abs(sc.h - y)); // G7f: points on a bridge are not compared with the ground
    if (i > 0 && r.ys) maxG = Math.max(maxG, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
    const nx = (r.zs[Math.min(r.xs.length - 1, i + 1)] - r.zs[Math.max(0, i - 1)]), nz = -(r.xs[Math.min(r.xs.length - 1, i + 1)] - r.xs[Math.max(0, i - 1)]), l = Math.hypot(nx, nz) || 1;
    for (const o of [-18, 18]) { gen.sample(r.xs[i] + (nx / l) * o, r.zs[i] + (nz / l) * o, sc); if (r.ys) maxS = Math.max(maxS, Math.abs(sc.h - r.ys[i])); }
  }
  const br = (gen.roads.bridges ?? []).filter((b: any) => b.roadId === r.id); if (br.length) console.log(`   bridges on ${d.name}: ${JSON.stringify(br.map((b: any) => ({ type: b.type, i0: b.i0, i1: b.i1, spanM: +(+b.spanM).toFixed(0), clear: b.clear !== undefined ? +(+b.clear).toFixed(2) : undefined, wet: b.wetM })))}`);
  const lenOK = Math.abs(len - d.s[d.s.length - 1]) < 5;
  console.log(`${d.name}: ${r.xs.length} points, ${len.toFixed(0)} m (data ${d.s[d.s.length - 1].toFixed(0)} m), ${r.lanes} lanes, max grade ${(maxG * 100).toFixed(1)} %, ground - design at the centreline max ${maxC.toFixed(2)} m, at +-18 m max ${maxS.toFixed(2)} m`);
  if (!lenOK) fail(`${d.name}: length differs from the data`); if (maxC > 0.1) fail(`${d.name}: ground at the centreline is not the designed level`); if (r.lanes !== 6) fail(`${d.name}: not 6 lanes`);
}
// STEP G7g: the two slip roads (ramps) of the JX-2 half interchange: they must exist as ramp roads, 1 lane, halfWidth 4.2, 50 km/h, with the finished heights of R6SlipData.ts; they start / end on the J1-E carriageway and on the R6-8 start.
const arm = gen.roads.roads.find((q: any) => q.name === 'J1-E'); const stem = gen.roads.roads.find((q: any) => q.name === 'R6-8');
const dist2 = (r: any, i: number, o: any) => { let m = 1e9; for (let k = 0; k < o.xs.length; k++) m = Math.min(m, Math.hypot(o.xs[k] - r.xs[i], o.zs[k] - r.zs[i])); return m; };
for (const q of R6_SLIP_DATA) {
  const r = gen.roads.roads.find((o: any) => o.name === q.name);
  if (!r) { fail(`${q.name} is not in the game network`); continue; }
  let len = 0, maxC = 0, maxG = 0, dy = 0; for (let i = 0; i < r.xs.length; i++) { if (i) { len += Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); maxG = Math.max(maxG, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1])); } gen.sample(r.xs[i], r.zs[i], sc); maxC = Math.max(maxC, Math.abs(sc.h - r.ys[i])); dy = Math.max(dy, Math.abs(r.ys[i] - q.ys[i])); }
  const last = r.xs.length - 1, other = q.from.startsWith('J1-E') ? arm : stem, other2 = q.to.startsWith('J1-E') ? arm : stem;
  const dFrom = dist2(r, 0, other), dTo = dist2(r, last, other2);
  console.log(`${q.name}: ${r.xs.length} points, ${len.toFixed(0)} m, kind ${r.kind} tier ${r.tier}, ${r.lanes} lane, halfWidth ${r.halfWidth}, ${r.speedKmh} km/h, max grade ${(maxG * 100).toFixed(1)} %, ground - design at the centreline max ${maxC.toFixed(2)} m, start ${dFrom.toFixed(1)} m from ${q.from.startsWith('J1-E') ? 'the J1-E axis' : 'the R6-8 axis'}, end ${dTo.toFixed(1)} m from ${q.to.startsWith('J1-E') ? 'the J1-E axis' : 'the R6-8 axis'}`);
  if (r.kind !== 'ramp' || r.tier !== 3) fail(`${q.name}: not a tier 3 ramp`); if (r.lanes !== 1 || r.speedKmh !== 50 || Math.abs(r.halfWidth - 4.2) > 1e-6) fail(`${q.name}: lanes / speed / halfWidth differ`);
  if (dy > 0.001) fail(`${q.name}: heights differ from R6SlipData.ts`); if (maxG > 0.05) fail(`${q.name}: grade over 5 %`); if (maxC > 0.1) fail(`${q.name}: ground at the centreline is not the designed level`);
}
if (!stem) fail('R6-8 is not in the game network');
console.log(bad ? `RESULT: ${bad} FAIL` : `RESULT: PASS (${R6_LINE_DATA.length} R6 roads, ${R6_SLIP_DATA.length} slip ramps)`);
