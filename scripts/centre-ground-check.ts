// STEP 21.2 GROUND CHECK (headless, READ ONLY) of every key-3 centreline (R8: ground and location use come first).
// Run: npx tsx scripts/centre-ground-check.ts [dir]   (default docs)   writes dir/STEP_21_2_OUTPUT.txt and dir/centre_ground.json
// Per line, sampled every 10 m: WATER first (sc.water > sc.h), ground class (docs/a1_buildability.json), natural grade over 30 m,
// side slope across the road, rail (crossing / within 25 m), buildings inside the road corridor, engineering areas passed.
// Prints BRIDGE / CULVERT candidates, HILL runs, TUNNEL-CANDIDATES (natural grade over 2 x the class limit for >= 100 m; listed only, R12: the user decides), rail crossings, building hits.
// Nothing in src or data is changed. World metres: x east, z south.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { collectCentreSet } from '../src/roads/debug/RoadCentreSet';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';

const OUT = process.argv[2] ?? 'docs';
const STEP = 10;      // m between samples
const GRADE_WIN = 3;  // samples: natural grade over 3 x 10 m = 30 m
const hyp = Math.hypot;
const L: string[] = [];
const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);

// per class: grade limit (3.3, R11), corridor half width (m, from the road class: 6 lane 16 + shoulder, 4 lane 12, 2 lane 8, C 7, L 6) + 3 m clearance
const LIMIT: Record<string, number> = { '6': 0.04, '4': 0.06, '2': 0.08, C: 0.08, L: 0.10 };
const HALF: Record<string, number> = { '6': 19, '4': 15, '2': 11, C: 10, L: 9 };

const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const A1 = JSON.parse(readFileSync('docs/a1_buildability.json', 'utf8'));
const mask = (x: number, z: number): string => { const i = Math.floor((x + A1.half) / A1.cell), j = Math.floor((z + A1.half) / A1.cell); return i < 0 || j < 0 || i >= A1.n || j >= A1.n ? '~' : A1.rows[j][i]; };
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const railEdges: { id: any; xs: ArrayLike<number>; zs: ArrayLike<number> }[] = (gen.rail.edges as any[]).map((e, i) => ({ id: e.id ?? i, xs: e.xs, zs: e.zs }));
const natH = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const wetAt = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water - sc.h : 0; };

type P = { x: number; z: number };
function segInt(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: a.x + rx * t, z: a.z + rz * t };
}

const set = collectCentreSet(gen);
const lines = set.lines.filter((l) => l.source !== 'built');
pr('STEP 21.2 GROUND CHECK (headless, read only, nothing in src or data changed)');
pr(`${lines.length} new lines, sample every ${STEP} m, natural grade over ${STEP * GRADE_WIN} m, grade limits R6 4 % / R4 6 % / R2 8 % / C 8 % / L 10 %, corridor half width R6 19 / R4 15 / R2 11 / C 10 / L 9 m (class half width + 3 m)`);
pr(`rail edges ${railEdges.length}, buildings ${RECTS.length}`);

interface Run { from: number; to: number; len: number; x: number; z: number; val: number }
interface Res {
  id: string; cls: string; len: number; n: number;
  wetM: number; wetRuns: Run[]; maxGrade: number; overM: number; hillRuns: Run[]; maxSide: number; sideM: number;
  mask: Record<string, number>; steepRuns: Run[]; railX: { x: number; z: number; edge: any }[]; railNear: number; bld: number; bldIds: number[]; areas: Record<string, number>; flags: string[];
}
const results: Res[] = [];

for (const l of lines) {
  // dense samples every STEP m
  const P: { x: number; z: number; s: number; tx: number; tz: number }[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < l.pts.length; i++) {
    const a = l.pts[i], b = l.pts[i + 1], d = hyp(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(d / STEP));
    for (let j = 0; j < k; j++) { const t = j / k; P.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s: acc + d * t, tx: (b[0] - a[0]) / (d || 1), tz: (b[1] - a[1]) / (d || 1) }); }
    acc += d;
  }
  const last = l.pts[l.pts.length - 1], prev = l.pts[l.pts.length - 2];
  P.push({ x: last[0], z: last[1], s: acc, tx: (last[0] - prev[0]) / (hyp(last[0] - prev[0], last[1] - prev[1]) || 1), tz: (last[1] - prev[1]) / (hyp(last[0] - prev[0], last[1] - prev[1]) || 1) });
  const hw = HALF[l.cls] ?? 10, lim = LIMIT[l.cls] ?? 0.1;
  const H = P.map((q) => natH(q.x, q.z));
  const wet = P.map((q) => wetAt(q.x, q.z));
  const r: Res = { id: l.id, cls: l.cls, len: acc, n: P.length, wetM: 0, wetRuns: [], maxGrade: 0, overM: 0, hillRuns: [], maxSide: 0, sideM: 0, mask: {}, steepRuns: [], railX: [], railNear: 0, bld: 0, bldIds: [], areas: {}, flags: [] };
  // runs helper
  const runs = (pred: (i: number) => boolean, val: (a: number, b: number) => number, minLen: number): Run[] => {
    const out: Run[] = []; let a = -1;
    for (let i = 0; i <= P.length; i++) {
      const on = i < P.length && pred(i);
      if (on && a < 0) a = i;
      if (!on && a >= 0) { const b = i - 1, len = P[b].s - P[a].s + STEP; if (len >= minLen) out.push({ from: P[a].s, to: P[b].s, len, x: P[(a + b) >> 1].x, z: P[(a + b) >> 1].z, val: val(a, b) }); a = -1; }
    }
    return out;
  };
  const grade = P.map((_, i) => { const a = Math.max(0, i - GRADE_WIN), b = Math.min(P.length - 1, i + 0), d = P[b].s - P[a].s; return d > 0 ? Math.abs(H[b] - H[a]) / d : 0; });
  const side = P.map((q, i) => { const hl = natH(q.x - q.tz * hw, q.z + q.tx * hw), hr = natH(q.x + q.tz * hw, q.z - q.tx * hw); void i; return Math.abs(hl - hr) / (2 * hw); });
  // water
  r.wetM = wet.filter((w) => w > 0).length * STEP;
  r.wetRuns = runs((i) => wet[i] > 0, (a, b) => Math.max(...wet.slice(a, b + 1)), STEP);
  // grade
  r.maxGrade = Math.max(...grade);
  r.overM = grade.filter((g) => g > lim).length * STEP;
  r.hillRuns = runs((i) => grade[i] > lim, (a, b) => Math.max(...grade.slice(a, b + 1)), 60);
  // side slope across the road > 25 %
  r.maxSide = Math.max(...side);
  r.sideM = side.filter((g) => g > 0.25).length * STEP;
  // ground class
  for (const q of P) { const k = mask(q.x, q.z); r.mask[k] = (r.mask[k] ?? 0) + STEP; }
  r.steepRuns = runs((i) => wet[i] === 0 && grade[i] > 2 * lim, (a, b) => Math.max(...grade.slice(a, b + 1)), 100);
  // rail: crossings (line segment x rail polyline) and samples within 25 m
  for (let i = 0; i + 1 < l.pts.length; i++) for (const e of railEdges) {
    const a = l.pts[i], b = l.pts[i + 1];
    for (let k = 0; k + 1 < e.xs.length; k++) {
      if (Math.abs(e.xs[k] - a[0]) > 400 && Math.abs(e.xs[k] - b[0]) > 400) continue;
      const q = segInt({ x: a[0], z: a[1] }, { x: b[0], z: b[1] }, { x: e.xs[k], z: e.zs[k] }, { x: e.xs[k + 1], z: e.zs[k + 1] });
      if (q && !r.railX.some((c) => hyp(c.x - q.x, c.z - q.z) < 30)) r.railX.push({ x: q.x, z: q.z, edge: e.id });
    }
  }
  for (const q of P) { let near = false; for (const e of railEdges) { for (let k = 0; k < e.xs.length; k++) { if (Math.abs(e.xs[k] - q.x) > 25 || Math.abs(e.zs[k] - q.z) > 25) continue; if (hyp(e.xs[k] - q.x, e.zs[k] - q.z) < 25) { near = true; break; } } if (near) break; } if (near) r.railNear++; }
  // buildings inside the corridor
  const seen = new Set<number>();
  for (const q of P) for (let bi = 0; bi < RECTS.length; bi++) {
    const b = RECTS[bi]; if (Math.abs(b.x - q.x) > 90 || Math.abs(b.z - q.z) > 90 || seen.has(bi)) continue;
    const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = q.x - b.x, dz = q.z - b.z, lx = dx * co - dz * si, lz = dx * si + dz * co;
    if (hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)) < hw) { seen.add(bi); r.bldIds.push(bi); }
  }
  r.bld = seen.size;
  // engineering areas
  for (const q of P) { const a = getEngineeringAreaAt(q.x, q.z); if (a) r.areas[a.id] = (r.areas[a.id] ?? 0) + STEP; }
  // flags
  if (r.wetM > 0) r.flags.push(`WATER ${f0(r.wetM)} m in ${r.wetRuns.length} run(s)`);
  if (r.hillRuns.length) r.flags.push(`GRADE over ${f1(lim * 100)} % for ${f0(r.overM)} m, max ${f1(r.maxGrade * 100)} %`);
  if (r.steepRuns.length) r.flags.push(`TUNNEL-CANDIDATE ${r.steepRuns.length} stretch(es): natural grade over 2 x the limit for >= 100 m`);
  if (r.railX.length) r.flags.push(`RAIL crossed ${r.railX.length}x`);
  if (r.bld) r.flags.push(`BUILDINGS ${r.bld} in corridor`);
  if (r.sideM >= 100) r.flags.push(`side slope > 25 % for ${f0(r.sideM)} m (big cut / fill)`);
  results.push(r);
}

const cnt = (f: (r: Res) => boolean): number => results.filter(f).length;
pr('');
pr('1. PER LINE (id, class, length, wet m, max natural grade, m over the class limit, rail crossings, buildings, flags)');
for (const r of results) pr(`   ${r.id.padEnd(7)} ${r.cls.padEnd(2)} ${f0(r.len).padStart(5)} m  wet ${f0(r.wetM).padStart(4)}  grade ${f1(r.maxGrade * 100).padStart(5)} %  over ${f0(r.overM).padStart(4)} m  rail ${r.railX.length}  bld ${String(r.bld).padStart(2)}  ${r.flags.length ? '<- ' + r.flags.join('; ') : 'ok'}`);

pr('');
pr('2. WATER: BRIDGE / CULVERT candidates (wet runs: depth = water above ground, max in the run; < 15 m culvert, 15..60 m short bridge, > 60 m long bridge)');
let nWet = 0;
for (const r of results) for (const w of r.wetRuns) {
  nWet++;
  const kind = w.len < 15 ? 'CULVERT' : w.len <= 60 ? 'SHORT BRIDGE' : 'LONG BRIDGE';
  pr(`   ${r.id.padEnd(7)} s ${f0(w.from).padStart(5)}..${f0(w.to).padStart(5)} m  ${f0(w.len).padStart(4)} m wet at (${f0(w.x)}, ${f0(w.z)}), depth ${f1(w.val)} m  -> ${kind}`);
}
pr(`   ${nWet} wet runs on ${cnt((r) => r.wetRuns.length > 0)} lines, ${f0(results.reduce((a, r) => a + r.wetM, 0))} m wet in total`);

pr('');
pr('3. HILL RUNS (natural grade over the class limit for >= 60 m; the AI first tries to go ROUND, R12) and TUNNEL-CANDIDATES (natural grade over 2 x the class limit, i.e. R6 8 % / R4 12 % / R2 and C 16 % / L 20 %, for >= 100 m in a row: LISTED ONLY, the user decides)');
let nHill = 0;
for (const r of results) for (const h of r.hillRuns) { nHill++; pr(`   ${r.id.padEnd(7)} s ${f0(h.from).padStart(5)}..${f0(h.to).padStart(5)} m  ${f0(h.len).padStart(4)} m at (${f0(h.x)}, ${f0(h.z)}) max grade ${f1(h.val * 100)} %`); }
pr(`   ${nHill} hill runs on ${cnt((r) => r.hillRuns.length > 0)} lines`);
let nTun = 0;
for (const r of results) for (const h of r.steepRuns) { nTun++; pr(`   TUNNEL-CANDIDATE ${r.id.padEnd(7)} s ${f0(h.from)}..${f0(h.to)} m (${f0(h.len)} m) at (${f0(h.x)}, ${f0(h.z)}) max grade ${f1(h.val * 100)} %`); }
pr(`   ${nTun} tunnel-candidate stretches on ${cnt((r) => r.steepRuns.length > 0)} lines`);

pr('');
pr('4. RAIL: crossings of a line with a rail edge (needs a bridge or underpass, or the line is moved; not decided here)');
let nRail = 0;
for (const r of results) for (const c of r.railX) { nRail++; pr(`   ${r.id.padEnd(7)} x rail edge ${c.edge} at (${f0(c.x)}, ${f0(c.z)})`); }
pr(`   ${nRail} crossings on ${cnt((r) => r.railX.length > 0)} lines; lines with samples within 25 m of a rail: ${cnt((r) => r.railNear > 0)}`);

pr('');
pr('5. BUILDINGS inside the road corridor (existing buildings that the road would hit)');
for (const r of results) if (r.bld) pr(`   ${r.id.padEnd(7)} ${r.bld} building(s)`);
pr(`   ${results.reduce((a, r) => a + r.bld, 0)} building hits on ${cnt((r) => r.bld > 0)} lines`);

pr('');
pr('6. ENGINEERING AREAS passed (fenced land, R8: what is done at the location)');
for (const r of results) { const e = Object.entries(r.areas); if (e.length) pr(`   ${r.id.padEnd(7)} ${e.map(([k, v]) => `${k} ${f0(v)} m`).join(', ')}`); }

pr('');
pr('7. GROUND CLASS of all new lines (metres): ' + JSON.stringify(results.reduce((a: Record<string, number>, r) => { for (const [k, v] of Object.entries(r.mask)) a[k] = (a[k] ?? 0) + v; return a; }, {})) + '   (A flat < 3 %, B 3-8 %, C 8-15 %, D 15-25 %, E > 25 %, ~ water / sea, R rail corridor, X fixed road, F airport / port / army / engineering land)');

pr('');
pr('SUMMARY');
const tot = results.reduce((a, r) => a + r.len, 0);
pr(`  ${results.length} lines, ${f0(tot / 1000)} km. clean (no flag): ${cnt((r) => r.flags.length === 0)}; with water ${cnt((r) => r.wetM > 0)}; grade over limit ${cnt((r) => r.hillRuns.length > 0)}; rail crossed ${cnt((r) => r.railX.length > 0)}; buildings in corridor ${cnt((r) => r.bld > 0)}; tunnel-candidates ${nTun}`);
pr('  NOT RUN here: tsc of the whole game, npm run build, the game (no node_modules in the zip). Natural ground only: finished-profile grades come in step 21.4. This script changes no game file.');

writeFileSync(`${OUT}/STEP_21_2_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_ground.json`, JSON.stringify(results.map((r) => ({
  id: r.id, cls: r.cls, len: Math.round(r.len), wetM: r.wetM, maxGrade: +r.maxGrade.toFixed(4), overM: r.overM, sideM: r.sideM, bld: r.bld, railNear: r.railNear, mask: r.mask, flags: r.flags,
  wet: r.wetRuns.map((w) => ({ from: Math.round(w.from), len: Math.round(w.len), x: Math.round(w.x), z: Math.round(w.z), depth: +w.val.toFixed(1) })),
  hill: r.hillRuns.map((h) => ({ from: Math.round(h.from), len: Math.round(h.len), x: Math.round(h.x), z: Math.round(h.z), grade: +h.val.toFixed(3) })),
  tunnel: r.steepRuns.map((h) => ({ from: Math.round(h.from), len: Math.round(h.len), x: Math.round(h.x), z: Math.round(h.z), grade: +h.val.toFixed(3) })),
  rail: r.railX.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), edge: c.edge })),
}))));
