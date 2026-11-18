// STEP B7-4 batches R2-a + R2-b + R2-c: EXPORT the first R2 lines (2-lane road, fitted in 21.36 - 21.38) as game data: fitted centreline every 10 m + finished heights from the vertical chain (docs/centre_vprofile.json: PVIs + parabolic curves).
// Same method as scripts/centre-r6-export.ts (21.45). Writes src/roads/r2/R2NewLineData.ts and docs/STEP_B7_4_R2A_OUTPUT.txt. Changes NO other src file.
// Batch R2-a = R2-12 .. R2-18, R2-44, R2-63, R2-65 (10 lines, east), batch R2-c = R2-31, 32, 38, 39, 41, 46, 48, 49, 50, 66 (10 lines; R2-34/35/36/37 and R2-40/42 are LEFT OUT: they cross in the middle at 4-arm nodes N129-N131 / N132, R1), batch R2-b = R2-21 .. R2-30 (10 lines; R2-20 left out: its PVI length differs by 1.6 m on 221 m, south-west and centre); both: no wet run, 0 or 10 m of structure in docs/centre_structures.json. The file always holds every R2 line placed so far. R2 lines with viaducts / tunnels / wet runs wait for their own batch.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-r2-export.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs', DS = 10, LIM = 0.08;   // R2 class limit 8 % (collector, 3.3; R11: R2 may be steeper than R6)
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const VP = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const BATCH_A = ['R2-12', 'R2-13', 'R2-14', 'R2-15', 'R2-16', 'R2-17', 'R2-18', 'R2-44', 'R2-63', 'R2-65'];   // batch R2-a (21.63)
const BATCH_B = ['R2-21', 'R2-22', 'R2-23', 'R2-24', 'R2-25', 'R2-26', 'R2-27', 'R2-28', 'R2-29', 'R2-30'];   // batch R2-b (21.65): no wet run, no structure in docs/centre_structures.json
const BATCH_C = ['R2-31', 'R2-32', 'R2-38', 'R2-39', 'R2-41', 'R2-46', 'R2-48', 'R2-49', 'R2-50', 'R2-66'];   // batch R2-c (21.66): water pre-check scripts/b7-r2c-water-pre.ts = 0 wet, no structure in docs/centre_structures.json
const BATCH = [...BATCH_A, ...BATCH_B, ...BATCH_C];   // the data file holds ALL R2 lines placed so far
function levelAt(v: any, s: number): number {
  const P: number[][] = v.pvi;
  const lineY = (q: number): number => { let k = 0; while (k < P.length - 2 && P[k + 1][0] < q) k++; const [s0, y0] = P[k], [s1, y1] = P[k + 1]; return y0 + ((y1 - y0) * (q - s0)) / (s1 - s0); };
  for (let k = 1; k < P.length - 1; k++) {
    const c = (v.curves as any[]).find((q) => Math.abs(q.s - P[k][0]) < 0.2); if (!c || !(c.L > 0)) continue;
    const bvc = P[k][0] - c.L / 2, evc = P[k][0] + c.L / 2; if (s < bvc || s > evc) continue;
    const g1 = (P[k][1] - P[k - 1][1]) / (P[k][0] - P[k - 1][0]), g2 = (P[k + 1][1] - P[k][1]) / (P[k + 1][0] - P[k][0]), x = s - bvc;
    return P[k][1] - g1 * (c.L / 2) + g1 * x + ((g2 - g1) * x * x) / (2 * c.L);
  }
  return lineY(s);
}
const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
pr('STEP B7-3 batch R2-a + b + c: export of 30 R2 lines as game data (headless; the game is changed only by the registration in RoadNetwork + Config switch)');
pr('   line    length m  points  y start  y end   max grade %  min / max level m  PVIs  curves');
const out: string[] = []; let totalLen = 0;
for (const id of BATCH) {
  const l = FX.lines.find((q: any) => q.id === id), v = VP.lines.find((q: any) => q.id === id);
  if (!l || !v) { chk(false, `${id}: line or vertical profile missing`); continue; }
  chk(!l.built && !l.dropped && String(l.cls) === '2', `${id} is a new, not dropped, class 2 line`);
  const len = plen(l.pts); totalLen += len; const n = Math.max(2, Math.ceil(len / DS)) + 1;
  const cum = [0]; for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
  const sc = v.pvi[v.pvi.length - 1][0] / len;
  const s: number[] = [], pts: number[][] = [], ys: number[] = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = (len * k) / (n - 1); while (j < l.pts.length - 2 && cum[j + 1] < d) j++; const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    s.push(+d.toFixed(1)); pts.push([+(l.pts[j][0] + (l.pts[j + 1][0] - l.pts[j][0]) * t).toFixed(1), +(l.pts[j][1] + (l.pts[j + 1][1] - l.pts[j][1]) * t).toFixed(1)]); ys.push(+levelAt(v, d * sc).toFixed(2)); }
  let mg = 0; for (let i = 1; i < ys.length; i++) mg = Math.max(mg, Math.abs(ys[i] - ys[i - 1]) / ((s[i] - s[i - 1]) * sc));
  pr(`   ${id.padEnd(7)} ${f1(len).padStart(8)}  ${String(n).padStart(6)}  ${f2(ys[0]).padStart(7)} ${f2(ys[n - 1]).padStart(7)}  ${(mg * 100).toFixed(2).padStart(10)}      ${f1(Math.min(...ys))} / ${f1(Math.max(...ys))}   ${v.pvi.length}     ${v.curves.length}`);
  let tg = 0; for (let i = 1; i < v.pvi.length; i++) tg = Math.max(tg, Math.abs(v.pvi[i][1] - v.pvi[i - 1][1]) / (v.pvi[i][0] - v.pvi[i - 1][0]));
  chk(tg <= LIM + 1e-4, `${id} max PVI tangent grade ${(tg * 100).toFixed(2)} % <= 8 %`);
  chk(mg <= LIM + 0.002, `${id} max sampled grade ${(mg * 100).toFixed(2)} % <= 8 % + 0.2 % (heights rounded to 0.01 m at both ends of a 10 m step = up to 0.2 %)`);
  chk(Math.abs(v.pvi[v.pvi.length - 1][0] - len) < Math.max(1.5, 0.0015 * len), `${id} last PVI station ${f1(v.pvi[v.pvi.length - 1][0])} m = line length ${f1(len)} m (tolerance max(1.5 m, 0.15 % of the length) = ${f1(Math.max(1.5, 0.0015 * len))} m, 21.65)`);
  chk(Math.abs(ys[0] - v.pvi[0][1]) < 0.02 && Math.abs(ys[n - 1] - v.pvi[v.pvi.length - 1][1]) < 0.02, `${id} end levels = PVI end levels`);
  out.push(`  { name: '${id}', src: 'B7', s: ${JSON.stringify(s)}, pts: ${JSON.stringify(pts)}, ys: ${JSON.stringify(ys)} },`);
}
pr(`   total length of the batch ${f1(totalLen)} m`);
pr('   NOT in this file: structures (none in this batch: no wet run, no structure; checked again in scripts/b7-r2new-check.ts on the game terrain).');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
if (fail === 0) writeFileSync('src/roads/r2/R2NewLineData.ts', `// GENERATED by scripts/centre-r4-export.ts (STEP B7-4, batches R2-a + R2-b + R2-c). Do not edit: rerun the script. R2 lines R2-12 .. R2-18, R2-44, R2-63, R2-65 (batch a) R2-21 .. R2-30 (batch b) and R2-31, 32, 38, 39, 41, 46, 48, 49, 50, 66 (batch c): fitted centreline every 10 m (docs/fit_chain/centre_fixed.json) and finished heights from the vertical chain (docs/centre_vprofile.json).\r\n// Registered in RoadNetwork.layoutR2Roads() behind Config.roads.r4New.enabled. Station s = metres from the first point.\r\nexport interface R2NewLineData { name: string; src: string; s: number[]; pts: number[][]; ys: number[]; structs?: number[][] }\r\nexport const R2_NEW_LINE_DATA: R2NewLineData[] = [\r\n${out.join('\r\n')}\r\n];\r\n`);
writeFileSync(`${OUT}/STEP_B7_4_R2A_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
