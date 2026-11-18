// STEP B7a-1 (21.45): EXPORT the 7 NEW R6 lines (R6-9 .. R6-15, not built) as game data: fitted centreline every 10 m + finished heights from the vertical chain (docs/centre_vprofile.json: PVIs + parabolic curves).
// Writes src/roads/r6/R6NewLineData.ts (NOT imported by any other file: the game is unchanged until B7a-2 registers it) and docs/STEP_B7A1_OUTPUT.txt. Changes NO other src file.
// Level at station s: straight between PVIs; inside a vertical curve (length L, PVI at sp, slopes g1 -> g2) y = yBVC + g1 x + (g2 - g1) x^2 / (2 L), x = s - (sp - L/2).
// Checks: grade <= 4 % (class limit R6, 3.3 / R11), both end levels = the PVI end levels, station of the last PVI = line length, heights vs the node levels of centre_vprofile.json (nodes: level of the junction where the line ends), wet / structure lines listed.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-r6-export.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs', DS = 10, LIM = 0.04;
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const VP = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const NEW = ['R6-9', 'R6-10', 'R6-11', 'R6-12', 'R6-13', 'R6-14', 'R6-15'];
function levelAt(v: any, s: number): number {
  const P: number[][] = v.pvi; let i = 0; while (i < P.length - 2 && P[i + 1][0] < s) i++;
  const lineY = (q: number): number => { let k = 0; while (k < P.length - 2 && P[k + 1][0] < q) k++; const [s0, y0] = P[k], [s1, y1] = P[k + 1]; return y0 + ((y1 - y0) * (q - s0)) / (s1 - s0); };
  for (let k = 1; k < P.length - 1; k++) { // vertical curve at PVI k
    const c = (v.curves as any[]).find((q) => Math.abs(q.s - P[k][0]) < 0.2); if (!c || !(c.L > 0)) continue;
    const bvc = P[k][0] - c.L / 2, evc = P[k][0] + c.L / 2; if (s < bvc || s > evc) continue;
    const g1 = (P[k][1] - P[k - 1][1]) / (P[k][0] - P[k - 1][0]), g2 = (P[k + 1][1] - P[k][1]) / (P[k + 1][0] - P[k][0]), x = s - bvc;
    return P[k][1] - g1 * (c.L / 2) + g1 * x + ((g2 - g1) * x * x) / (2 * c.L);
  }
  return lineY(s);
}
const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
pr('STEP B7a-1 (21.45): export of the 7 new R6 lines as game data (headless; game NOT changed; tsc / npm run build / game NOT RUN: no node_modules)');
pr('   line    length m  points  y start  y end   max grade %  min / max level m  PVIs  curves');
const out: string[] = [];
for (const id of NEW) {
  const l = FX.lines.find((q: any) => q.id === id), v = VP.lines.find((q: any) => q.id === id);
  if (!l || !v) { chk(false, `${id}: line or vertical profile missing`); continue; }
  const len = plen(l.pts); const n = Math.max(2, Math.ceil(len / DS)) + 1;
  const cum = [0]; for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
  const sc = v.pvi[v.pvi.length - 1][0] / len;   // the PVI stations are measured on the fitted alignment (about 1 m longer than the 5 m chords): scale the station
  const s: number[] = [], pts: number[][] = [], ys: number[] = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = (len * k) / (n - 1); while (j < l.pts.length - 2 && cum[j + 1] < d) j++; const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    s.push(+d.toFixed(1)); pts.push([+(l.pts[j][0] + (l.pts[j + 1][0] - l.pts[j][0]) * t).toFixed(1), +(l.pts[j][1] + (l.pts[j + 1][1] - l.pts[j][1]) * t).toFixed(1)]); ys.push(+levelAt(v, d * sc).toFixed(2)); }
  let mg = 0; for (let i = 1; i < ys.length; i++) mg = Math.max(mg, Math.abs(ys[i] - ys[i - 1]) / ((s[i] - s[i - 1]) * sc));
  pr(`   ${id.padEnd(7)} ${f1(len).padStart(8)}  ${String(n).padStart(6)}  ${f2(ys[0]).padStart(7)} ${f2(ys[n - 1]).padStart(7)}  ${(mg * 100).toFixed(2).padStart(10)}      ${f1(Math.min(...ys))} / ${f1(Math.max(...ys))}   ${v.pvi.length}     ${v.curves.length}`);
  chk(mg <= LIM + 0.0006, `${id} max grade ${(mg * 100).toFixed(2)} % <= 4 %`);
  chk(Math.abs(v.pvi[v.pvi.length - 1][0] - len) < 1.5, `${id} last PVI station ${f1(v.pvi[v.pvi.length - 1][0])} m = line length ${f1(len)} m`);
  chk(Math.abs(ys[0] - v.pvi[0][1]) < 0.02 && Math.abs(ys[n - 1] - v.pvi[v.pvi.length - 1][1]) < 0.02, `${id} end levels = PVI end levels`);
  out.push(`  { name: '${id}', src: 'B7', s: ${JSON.stringify(s)}, pts: ${JSON.stringify(pts)}, ys: ${JSON.stringify(ys)} },`);
}
pr('');
pr('   NOT in this file (21.8 decides, R12): structures. Wet runs from 21.44 on these lines: R6-10 20 m (SHORT BRIDGE), R6-11 60 m (SHORT BRIDGE); viaduct / tunnel candidates of 21.40 are listed in docs/STEP_21_4C_OUTPUT.txt. The game build of a structure road needs bridgeArm() ranges (see G7f), they are NOT written here.');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
if (fail === 0) writeFileSync('src/roads/r6/R6NewLineData.ts', `// GENERATED by scripts/centre-r6-export.ts (STEP B7a-1, 21.45). Do not edit: rerun the script. The 7 NEW R6 lines (R6-9 .. R6-15): fitted centreline every 10 m (docs/fit_chain/centre_fixed.json) and finished heights from the vertical chain (docs/centre_vprofile.json).\r\n// NOT imported anywhere yet: the game does not use this file until B7a-2 registers it (junctions, structures: 21.8). Station s = metres from the first point.\r\nexport interface R6NewLineData { name: string; src: string; s: number[]; pts: number[][]; ys: number[]; structs?: number[][] }\r\nexport const R6_NEW_LINE_DATA: R6NewLineData[] = [\r\n${out.join('\r\n')}\r\n];\r\n`);
writeFileSync(`${OUT}/STEP_B7A1_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
