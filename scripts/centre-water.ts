// STEP B4 (21.44): WATER CHECK on the FITTED + JOINED lines (headless, READ ONLY; changes NO src file and NO data file, writes only docs/STEP_B4_OUTPUT.txt).
// Why: the water check of 21.2 (scripts/centre-ground-check.ts) ran on the user's DRAWN lines; the fit (21.24 - 21.38) and the joint refit (B3) moved them by up to some tens of metres.
// Method (same as 21.2): the line is sampled every 10 m along its length; a sample is WET where sc.water > sc.h (TerrainGenerator.sample); wet runs are listed with length and depth
// (< 15 m culvert, 15 - 60 m short bridge, > 60 m long bridge). BEFORE = docs/centre_fixed.json (drawn lines after 21.3 / 21.6a), AFTER = docs/fit_chain/centre_fixed.json (fitted + B3).
// Only new lines are checked (not built, not dropped, not 8-lane). A wet run AFTER that has no wet run within 60 m of it BEFORE is NEW (a FAIL = a LIST for the user, R10; nothing is moved).
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-water.ts docs
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const OUT = process.argv[2] ?? 'docs', STEP = 10, MATCH = 60;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const wetAt = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water - sc.h : 0; };
interface Run { from: number; to: number; len: number; x: number; z: number; depth: number }
function runsOf(pts: number[][]): { wetM: number; runs: Run[]; len: number } {
  const samples: { s: number; x: number; z: number; w: number }[] = []; let acc = 0, next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], sl = Math.hypot(bx - ax, bz - az);
    while (next <= acc + sl) { const t = sl === 0 ? 0 : (next - acc) / sl; const x = ax + t * (bx - ax), z = az + t * (bz - az); samples.push({ s: next, x, z, w: wetAt(x, z) }); next += STEP; }
    acc += sl;
  }
  const runs: Run[] = []; let cur: typeof samples = [];
  const flush = (): void => { if (!cur.length) return; const m = cur.reduce((a, b) => (b.w > a.w ? b : a)); runs.push({ from: cur[0].s, to: cur[cur.length - 1].s, len: cur.length * STEP, x: m.x, z: m.z, depth: m.w }); cur = []; };
  for (const q of samples) { if (q.w > 0) cur.push(q); else flush(); } flush();
  return { wetM: samples.filter((q) => q.w > 0).length * STEP, runs, len: acc };
}
const load = (p: string): Map<string, { cls: string; pts: number[][] }> => { const m = new Map(); for (const l of JSON.parse(readFileSync(p, 'utf8')).lines) if (!l.built && !l.dropped && String(l.cls) !== '8') m.set(l.id, { cls: String(l.cls), pts: l.pts }); return m; };
const before = load(`${OUT}/centre_fixed.json`), after = load(`${OUT}/fit_chain/centre_fixed.json`);
pr('STEP B4 (21.44): water check on the fitted + joined lines (headless, read only; nothing in src or data changed; tsc / npm run build / game NOT RUN: no node_modules)');
pr(`   ${after.size} new lines (before file: ${before.size})`);
pr('');
pr('   line    class  length m   wet m before -> after   wet runs after (s from..to m, length, depth at the deepest point, kind)');
let tB = 0, tA = 0, newRuns = 0, nWetLines = 0; const newList: string[] = [];
for (const [id, a] of [...after].sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }))) {
  const b = before.get(id); const ra = runsOf(a.pts), rb = b ? runsOf(b.pts) : { wetM: 0, runs: [] as Run[], len: 0 };
  tB += rb.wetM; tA += ra.wetM; if (ra.wetM > 0) nWetLines++;
  const kinds = ra.runs.map((r) => `${f0(r.from)}..${f0(r.to)} ${f0(r.len)} m d ${f1(r.depth)} ${r.len < 15 ? 'CULVERT' : r.len <= 60 ? 'SHORT BRIDGE' : 'LONG BRIDGE'}`);
  for (const r of ra.runs) if (!rb.runs.some((q) => Math.hypot(q.x - r.x, q.z - r.z) <= MATCH)) { newRuns++; newList.push(`${id} s ${f0(r.from)}..${f0(r.to)} (${f0(r.len)} m wet, depth ${f1(r.depth)} m) at (${f0(r.x)}, ${f0(r.z)})`); }
  if (ra.wetM > 0 || rb.wetM > 0) pr(`   ${id.padEnd(7)} ${a.cls.padEnd(5)} ${f0(ra.len).padStart(8)}   ${String(rb.wetM).padStart(6)} -> ${String(ra.wetM).padStart(5)}        ${kinds.join('; ') || '-'}`);
}
pr(`   total wet: before ${f0(tB)} m, after ${f0(tA)} m, ${nWetLines} lines with water after`);
pr('');
pr('NEW WET RUNS (after, with no wet run within ' + MATCH + ' m before):'); for (const n of newList) pr('   ' + n); if (!newList.length) pr('   none');
pr(''); pr('CHECKS');
chk(after.size === before.size, `same number of new lines before / after (${before.size} / ${after.size})`);
chk(newRuns === 0, `no NEW wet run on the fitted lines (${newRuns} found)`);
chk(tA <= tB + 60, `wet length after (${f0(tA)} m) is not more than 60 m over before (${f0(tB)} m)`);
pr(`   RESULT ${pass} PASS ${fail} FAIL (a FAIL here is a LIST for the user, R10: nothing is moved)`);
writeFileSync(`${OUT}/STEP_B4_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(0);
