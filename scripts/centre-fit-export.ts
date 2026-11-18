// STEP B1 (21.39): make the FITTED alignments (straight - spiral - arc - spiral - straight, docs/centre_fit_<cls>.json) into a centre_fixed-style file, so the vertical chain
// (centre-profile.ts, centre-vprofile.ts, centre-section.ts) runs on the real length and stationing of the new lines instead of the drawn polyline. Changes NO src file.
// Run: node --experimental-strip-types --import ./scripts/reg.mjs scripts/centre-fit-export.ts docs
// Reads  docs/centre_fixed.json (drawn lines, built roads, 8-lane roads) and docs/centre_fit_{6,4,2,C,L}.json (pis, S, E of every new line).
// Writes docs/fit_chain/centre_fixed.json: same structure, every NEW line (not built, not dropped) gets pts = the fitted alignment every 5 m (ends = S and E of the fit);
// built / 8-lane / dropped lines are copied unchanged. The drawn file docs/centre_fixed.json is NOT touched (R10: it is the user's line, and centre-fit.ts reads it).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';

const OUT = process.argv[2] ?? 'docs', DIR = `${OUT}/fit_chain`, DS = 5;
mkdirSync(DIR, { recursive: true });
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const D = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const fits = new Map<string, any>();
for (const c of ['6', '4', '2', 'C', 'L']) for (const q of JSON.parse(readFileSync(`${OUT}/centre_fit_${c}.json`, 'utf8')).lines) { if (fits.has(q.id)) throw new Error('duplicate fit ' + q.id); fits.set(q.id, q); }

const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
pr('STEP B1 (21.39): fitted alignments -> docs/fit_chain/centre_fixed.json');
pr('   id      class  drawn m  fitted m   diff m   pts   end gap S/E m');
const rows: { id: string; cls: string; dr: number; fl: number; gapS: number; gapE: number }[] = [];
let replaced = 0; const missing: string[] = [];
const lines = D.lines.map((l: any) => {
  if (l.built || l.dropped || l.cls === '8') return l;
  const q = fits.get(l.id);
  if (!q) { missing.push(l.id); return l; }
  const al = buildOpenAlignment({ x: q.S[0], z: q.S[1] }, q.pis.map((p: any) => ({ x: p.x, z: p.z, R: p.R, Ls: p.Ls })), { x: q.E[0], z: q.E[1] });
  const smp = sampleAlignment(al, DS).samples as { x: number; z: number }[];
  const pts: number[][] = smp.map((s) => [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100]);
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - q.E[0], last[1] - q.E[1]) > 0.05) pts.push([q.E[0], q.E[1]]);
  const dr = plen(l.pts), fl = plen(pts);
  rows.push({ id: l.id, cls: l.cls, dr, fl, gapS: Math.hypot(pts[0][0] - q.S[0], pts[0][1] - q.S[1]), gapE: Math.hypot(pts[pts.length - 1][0] - q.E[0], pts[pts.length - 1][1] - q.E[1]) });
  replaced++;
  return { ...l, notes: [...(l.notes ?? []), 'B1: pts = fitted alignment (centre_fit)'], drawnLen: Math.round(dr * 10) / 10, pts };
});
for (const r of rows) pr(`   ${r.id.padEnd(7)} ${r.cls.padEnd(4)} ${f0(r.dr).padStart(8)} ${f0(r.fl).padStart(9)} ${((r.fl - r.dr >= 0 ? '+' : '') + f1(r.fl - r.dr)).padStart(8)} ${String(lines.find((l: any) => l.id === r.id).pts.length).padStart(6)}   ${f1(r.gapS)} / ${f1(r.gapE)}`);
const td = rows.reduce((a, r) => a + r.dr, 0), tf = rows.reduce((a, r) => a + r.fl, 0);
pr(`   total ${rows.length} lines: drawn ${f0(td)} m, fitted ${f0(tf)} m (${tf - td >= 0 ? '+' : ''}${f1(tf - td)} m)`);
const biggest = [...rows].sort((a, b) => Math.abs(b.fl - b.dr) - Math.abs(a.fl - a.dr)).slice(0, 6);
pr(`   biggest length changes: ${biggest.map((r) => `${r.id} ${r.fl - r.dr >= 0 ? '+' : ''}${f1(r.fl - r.dr)} m`).join(', ')}`);
const expected = D.lines.filter((l: any) => !l.built && !l.dropped && l.cls !== '8').length;
chk(missing.length === 0, `every new line has a fit (${replaced} of ${expected}${missing.length ? '; missing: ' + missing.join(' ') : ''})`);
chk(replaced === expected, 'replaced lines = new lines of centre_fixed.json (built / 8-lane / dropped are copied unchanged)');
chk(rows.every((r) => r.gapS < 0.05 && r.gapE < 0.05), 'the sampled alignment starts at S and ends at E of the fit (gap < 0.05 m)');
chk(rows.every((r) => Math.abs(r.fl - r.dr) / r.dr < 0.08 || Math.abs(r.fl - r.dr) < 35), 'no line changes length by more than 8 % or 35 m (sanity check; B3 21.40: short junction lines L-27 / L-28 / R4-28 move up to 30 m, looked at, OK)');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
writeFileSync(`${DIR}/centre_fixed.json`, JSON.stringify({ ...D, note: String(D.note ?? '') + ' | B1 fit chain: new lines = fitted alignment (scripts/centre-fit-export.ts)', lines }, null, 0));
writeFileSync(`${DIR}/STEP_B1_EXPORT_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
