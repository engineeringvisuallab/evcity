// STEP B7-3 batches R4-a + R4-b: EXPORT the first R4 lines (4-lane divided arterial, fitted in 21.26 - 21.35) as game data: fitted centreline every 10 m + finished heights from the vertical chain (docs/centre_vprofile.json: PVIs + parabolic curves).
// Same method as scripts/centre-r6-export.ts (21.45). Writes src/roads/r4/R4NewLineData.ts and docs/STEP_B7_3_R4A_OUTPUT.txt. Changes NO other src file.
// Batch R4-a = R4-1 .. R4-8, R4-10, R4-11 (10 lines), batch R4-b = R4-14 .. R4-18, R4-22, R4-25 .. R4-28 (11 lines); both: no wet run, no viaduct / tunnel candidate. The file always holds every R4 line placed so far. R4-9 (400 m cut-and-cover stretch, 2366 m structures) and R4-12 on wait for their own batch.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-r4-export.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs', DS = 10, LIM = 0.06;   // R4 class limit 6 % (3.3, R11: R4 may be steeper than R6)
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const VP = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const BATCH_A = ['R4-1', 'R4-2', 'R4-3', 'R4-4', 'R4-5', 'R4-6', 'R4-7', 'R4-8', 'R4-10', 'R4-11'];   // batch R4-a (21.62)
const BATCH_B = ['R4-14', 'R4-15', 'R4-16', 'R4-17', 'R4-18', 'R4-22', 'R4-25', 'R4-26', 'R4-27', 'R4-28'];   // batch R4-b (21.64): no wet run, no structure over 60 m
const BATCH = [...BATCH_A, ...BATCH_B];   // the data file holds ALL R4 lines placed so far
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
pr('STEP B7-3 batches R4-a + R4-b: export of 21 R4 lines as game data (headless; the game is changed only by the registration in RoadNetwork + Config switch)');
pr('   line    length m  points  y start  y end   max grade %  min / max level m  PVIs  curves');
const out: string[] = []; let totalLen = 0;
for (const id of BATCH) {
  const l = FX.lines.find((q: any) => q.id === id), v = VP.lines.find((q: any) => q.id === id);
  if (!l || !v) { chk(false, `${id}: line or vertical profile missing`); continue; }
  chk(!l.built && !l.dropped && String(l.cls) === '4', `${id} is a new, not dropped, class 4 line`);
  const len = plen(l.pts); totalLen += len; const n = Math.max(2, Math.ceil(len / DS)) + 1;
  const cum = [0]; for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
  const sc = v.pvi[v.pvi.length - 1][0] / len;
  const s: number[] = [], pts: number[][] = [], ys: number[] = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = (len * k) / (n - 1); while (j < l.pts.length - 2 && cum[j + 1] < d) j++; const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    s.push(+d.toFixed(1)); pts.push([+(l.pts[j][0] + (l.pts[j + 1][0] - l.pts[j][0]) * t).toFixed(1), +(l.pts[j][1] + (l.pts[j + 1][1] - l.pts[j][1]) * t).toFixed(1)]); ys.push(+levelAt(v, d * sc).toFixed(2)); }
  let mg = 0; for (let i = 1; i < ys.length; i++) mg = Math.max(mg, Math.abs(ys[i] - ys[i - 1]) / ((s[i] - s[i - 1]) * sc));
  pr(`   ${id.padEnd(7)} ${f1(len).padStart(8)}  ${String(n).padStart(6)}  ${f2(ys[0]).padStart(7)} ${f2(ys[n - 1]).padStart(7)}  ${(mg * 100).toFixed(2).padStart(10)}      ${f1(Math.min(...ys))} / ${f1(Math.max(...ys))}   ${v.pvi.length}     ${v.curves.length}`);
  let tg = 0; for (let i = 1; i < v.pvi.length; i++) tg = Math.max(tg, Math.abs(v.pvi[i][1] - v.pvi[i - 1][1]) / (v.pvi[i][0] - v.pvi[i - 1][0]));
  chk(tg <= LIM + 1e-4, `${id} max PVI tangent grade ${(tg * 100).toFixed(2)} % <= 6 %`);
  chk(mg <= LIM + 0.002, `${id} max sampled grade ${(mg * 100).toFixed(2)} % <= 6 % + 0.2 % (heights rounded to 0.01 m at both ends of a 10 m step = up to 0.2 %)`);
  chk(Math.abs(v.pvi[v.pvi.length - 1][0] - len) < 1.5, `${id} last PVI station ${f1(v.pvi[v.pvi.length - 1][0])} m = line length ${f1(len)} m`);
  chk(Math.abs(ys[0] - v.pvi[0][1]) < 0.02 && Math.abs(ys[n - 1] - v.pvi[v.pvi.length - 1][1]) < 0.02, `${id} end levels = PVI end levels`);
  out.push(`  { name: '${id}', src: 'B7', s: ${JSON.stringify(s)}, pts: ${JSON.stringify(pts)}, ys: ${JSON.stringify(ys)} },`);
}
pr(`   total length of the batch ${f1(totalLen)} m`);
pr('   NOT in this file: structures (none in this batch: no wet run, no viaduct / tunnel candidate; checked again in scripts/b7-r4new-check.ts on the game terrain).');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
if (fail === 0) writeFileSync('src/roads/r4/R4NewLineData.ts', `// GENERATED by scripts/centre-r4-export.ts (STEP B7-3, batches R4-a + R4-b). Do not edit: rerun the script. R4 lines R4-1 .. R4-8, R4-10, R4-11 (batch a) and R4-14 .. R4-18, R4-22, R4-25 .. R4-28 (batch b): fitted centreline every 10 m (docs/fit_chain/centre_fixed.json) and finished heights from the vertical chain (docs/centre_vprofile.json).\r\n// Registered in RoadNetwork.layoutR4Roads() behind Config.roads.r4New.enabled. Station s = metres from the first point.\r\nexport interface R4NewLineData { name: string; src: string; s: number[]; pts: number[][]; ys: number[]; structs?: number[][] }\r\nexport const R4_NEW_LINE_DATA: R4NewLineData[] = [\r\n${out.join('\r\n')}\r\n];\r\n`);
writeFileSync(`${OUT}/STEP_B7_3_R4A_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
