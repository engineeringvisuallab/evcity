// STEP 21.4 VERTICAL PROFILE ANALYSIS (headless; changes NO game file, only writes docs/).
// Run: npx tsx scripts/centre-profile.ts [dir]   reads dir/centre_fixed.json (after 21.3 + fillet), writes dir/STEP_21_4_OUTPUT.txt, dir/centre_profile.json
// Per line (not the 8-lane roads, not built roads): natural ground every 10 m, then a finished-level profile by dynamic programming:
//   grade <= class limit (R11: R6 4 %, R4 6 %, R2 8 %, C 8 %, L 10 %), cost = cut + fill (+ big cost over cut 12 m / fill 7 m), deck >= water level + 1.5 m on wet stations.
// NO vertical curves, NO junction levels (a shared end can differ between the two lines), natural ground only (no rail, no buildings). Numbers = MY choices, change here.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const OUT = process.argv[2] ?? 'docs';
const DS = 10, GRID = 0.1, MAXCUT = 12, MAXFILL = 7, FREEBOARD = 1.5;
const LIMIT: Record<string, number> = { '6': 0.04, '4': 0.06, '2': 0.08, C: 0.08, L: 0.10 };
const WIDTH: Record<string, number> = { '6': 32, '4': 22, '2': 12, C: 9, L: 7 };   // paved width + shoulders, indicative volumes
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };

const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
// 21.4c-fix: ground = natural + the main island (sampleGround). sampleNatural has no island, so the island lines saw the SEA BED (-43 m) as ground.
const natH = (x: number, z: number): number => { gen.sampleGround(x, z, sc); return sc.h; };
const waterAt = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water : NaN; };   // absolute water level, NaN = dry

const J = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const lines: { id: string; cls: string; built: boolean; pts: number[][] }[] = J.lines.filter((l: any) => l.cls !== '8' && !l.built && !l.dropped && LIMIT[l.cls] !== undefined);

function resample(pts: number[][]): { x: number[]; z: number[] } {
  const x: number[] = [], z: number[] = []; let carry = 0, px = pts[0][0], pz = pts[0][1]; x.push(px); z.push(pz);
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - px, dz = pts[i][1] - pz, sl = Math.hypot(dx, dz); let s = DS - carry;
    while (s <= sl) { x.push(px + dx * s / sl); z.push(pz + dz * s / sl); s += DS; }
    carry = sl - (s - DS); px = pts[i][0]; pz = pts[i][1];
  }
  const e = pts[pts.length - 1]; if (Math.hypot(e[0] - x[x.length - 1], e[1] - z[z.length - 1]) > 2) { x.push(e[0]); z.push(e[1]); }
  return { x, z };
}

// ---------- 0. WATER CHECK FIRST (sc.water > sc.h) ----------
pr('STEP 21.4 VERTICAL PROFILE ANALYSIS (headless; nothing in src or data changed; natural ground only, no vertical curves, no junction levels, no rail / building check)');
pr('0. WATER CHECK first: stations with sc.water > sc.h on the 10 m samples of every line (dry = fine, wet = bridge or culvert in 21.8)');
const samples = new Map<string, { x: number[]; z: number[]; g: number[]; w: number[] }>();
let wetTot = 0, nTot = 0; const wetRows: string[] = [];
for (const l of lines) {
  const r = resample(l.pts); const g = r.x.map((x, i) => natH(x, r.z[i])); const w = r.x.map((x, i) => waterAt(x, r.z[i]));
  samples.set(l.id, { ...r, g, w }); const nw = w.filter((v) => !Number.isNaN(v)).length; wetTot += nw; nTot += w.length;
  if (nw) wetRows.push(`   ${l.id.padEnd(7)} ${l.cls}  wet ${nw * DS} m of ${(w.length - 1) * DS} m`);
}
pr(`   ${lines.length} lines, ${nTot} stations, ${wetTot} wet (${f1(100 * wetTot / nTot)} %)`); for (const s of wetRows) pr(s);

// ---------- 1. profile DP ----------
function design(cls: string, g: number[], w: number[]): number[] {
  const n = g.length, lim = LIMIT[cls], win = Math.max(1, Math.floor(lim * DS / GRID + 1e-9));
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, g[i]); hi = Math.max(hi, g[i], Number.isNaN(w[i]) ? -1e9 : w[i] + FREEBOARD + 2); }
  lo -= MAXCUT + 2; hi += MAXFILL + 2; const base = Math.floor(lo / GRID) * GRID, nl = Math.ceil((hi - base) / GRID) + 1;
  const lev = (k: number): number => base + k * GRID;
  const cost = (i: number, k: number): number => {
    const h = lev(k), d = h - g[i]; let c = 0;
    if (d < 0) c += -d * 1.0 + (-d > MAXCUT ? 50 * (-d - MAXCUT) : 0); else c += d * 0.8 + (d > MAXFILL ? 20 * (d - MAXFILL) : 0);
    if (!Number.isNaN(w[i]) && h < w[i] + FREEBOARD) c += 200 + 50 * (w[i] + FREEBOARD - h);
    return c;
  };
  const best = new Float64Array(nl), nxt = new Float64Array(nl), from: Int32Array[] = [];
  for (let k = 0; k < nl; k++) best[k] = cost(0, k);
  for (let i = 1; i < n; i++) {
    const fr = new Int32Array(nl);
    for (let k = 0; k < nl; k++) {
      let b = Infinity, bj = k; const a = Math.max(0, k - win), z = Math.min(nl - 1, k + win);
      for (let j = a; j <= z; j++) { const v = best[j] + 0.15 * Math.abs(j - k) * GRID; if (v < b) { b = v; bj = j; } }
      nxt[k] = b + cost(i, k); fr[k] = bj;
    }
    from.push(fr); best.set(nxt);
  }
  let kk = 0; for (let k = 1; k < nl; k++) if (best[k] < best[kk]) kk = k;
  const out = new Array<number>(n); for (let i = n - 1; i >= 0; i--) { out[i] = lev(kk); if (i > 0) kk = from[i - 1][kk]; }
  return out;
}

pr('');
pr('1. PER LINE: length, natural max grade (10 m), finished max grade, max cut / fill, cut + fill volume (indicative, class width), viaduct (fill over 7 m), wet bridge, tunnel-candidate (cut over 12 m runs)');
interface Row { id: string; cls: string; len: number; natMaxG: number; maxG: number; maxCut: number; maxFill: number; cutV: number; fillV: number; via: number; bridge: number; tunnel: number; runs: string[]; }
const rows: Row[] = []; const prof: Record<string, { x: number[]; z: number[]; g: number[]; h: number[] }> = {};
for (const l of lines) {
  const s = samples.get(l.id)!; if (s.g.length < 3) continue;
  const h = design(l.cls, s.g, s.w); prof[l.id] = { x: s.x, z: s.z, g: s.g, h };
  let natMaxG = 0, maxG = 0, maxCut = 0, maxFill = 0, cutV = 0, fillV = 0, via = 0, bridge = 0, tunnel = 0; const runs: string[] = [];
  let run0 = -1;
  for (let i = 0; i < s.g.length; i++) {
    if (i) { natMaxG = Math.max(natMaxG, Math.abs(s.g[i] - s.g[i - 1]) / DS); maxG = Math.max(maxG, Math.abs(h[i] - h[i - 1]) / DS); }
    const d = h[i] - s.g[i]; const wet = !Number.isNaN(s.w[i]);
    if (wet) bridge += DS; else if (d > MAXFILL) via += DS;
    if (!wet) { if (d < 0) { maxCut = Math.max(maxCut, -d); cutV += -d * WIDTH[l.cls] * DS; } else { maxFill = Math.max(maxFill, d); fillV += d * WIDTH[l.cls] * DS; } }
    const deep = !wet && -d > MAXCUT;
    if (deep) { tunnel += DS; if (run0 < 0) run0 = i; } else if (run0 >= 0) { runs.push(`s ${run0 * DS}-${i * DS} at (${f0(s.x[run0])}, ${f0(s.z[run0])})`); run0 = -1; }
  }
  if (run0 >= 0) runs.push(`s ${run0 * DS}-${(s.g.length - 1) * DS} at (${f0(s.x[run0])}, ${f0(s.z[run0])})`);
  rows.push({ id: l.id, cls: l.cls, len: (s.g.length - 1) * DS, natMaxG, maxG, maxCut, maxFill, cutV, fillV, via, bridge, tunnel, runs });
}
for (const r of rows) pr(`   ${r.id.padEnd(7)} ${r.cls.padEnd(2)} ${String(r.len).padStart(5)} m  natG ${f1(100 * r.natMaxG)}%  finG ${f1(100 * r.maxG)}%  cut ${f1(r.maxCut)} fill ${f1(r.maxFill)}  cutV ${f0(r.cutV / 1000)}k fillV ${f0(r.fillV / 1000)}k m3  viaduct ${r.via} m  bridge ${r.bridge} m  tunnel? ${r.tunnel} m`);

pr('');
pr('2. TUNNEL-CANDIDATE RUNS (finished level still more than 12 m under natural ground even with the grade limit; R12: tunnel is the LAST choice, never taken silently)');
const tl = rows.filter((r) => r.tunnel > 0).sort((a, b) => b.tunnel - a.tunnel);
for (const r of tl) pr(`   ${r.id.padEnd(7)} ${r.cls.padEnd(2)} ${r.tunnel} m  ${r.runs.join('; ')}`);
pr(`   ${tl.length} lines, ${tl.reduce((a, r) => a + r.tunnel, 0)} m`);
pr('');
pr('3. SUMMARY PER CLASS');
for (const c of ['6', '4', '2', 'C', 'L']) {
  const rr = rows.filter((r) => r.cls === c); if (!rr.length) continue; const sum = (f: (r: Row) => number): number => rr.reduce((a, r) => a + f(r), 0);
  pr(`   ${c.padEnd(2)} ${String(rr.length).padStart(3)} lines ${f1(sum((r) => r.len) / 1000)} km  cut ${f0(sum((r) => r.cutV) / 1e6 * 10) / 10} Mm3  fill ${f0(sum((r) => r.fillV) / 1e6 * 10) / 10} Mm3  viaduct ${f0(sum((r) => r.via))} m  bridge ${f0(sum((r) => r.bridge))} m  tunnel? ${f0(sum((r) => r.tunnel))} m  max cut ${f1(Math.max(...rr.map((r) => r.maxCut)))} max fill ${f1(Math.max(...rr.map((r) => r.maxFill)))}`);
}
pr('   NOT DONE: vertical curves, junction levels (two lines at a node can differ), rail crossings, building clearance, drainage; only a level DP on natural ground.');
writeFileSync(`${OUT}/STEP_21_4_OUTPUT.txt`, L.join('\r\n'));
writeFileSync(`${OUT}/centre_profile.json`, JSON.stringify({ note: 'STEP 21.4 DP profile, 10 m stations: x, z, ground g, finished h', lines: Object.entries(prof).map(([id, p]) => ({ id, x: p.x.map(Math.round), z: p.z.map(Math.round), g: p.g.map((v) => Math.round(v * 10) / 10), h: p.h.map((v) => Math.round(v * 10) / 10) })) }));
