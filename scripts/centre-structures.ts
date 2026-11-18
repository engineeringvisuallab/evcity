// STEP 21.8-1 STRUCTURE INVENTORY AND TYPE RULE (headless, READ ONLY: changes NO src file and NO data file; writes docs/STEP_21_8_1_OUTPUT.txt + docs/centre_structures.json).
// Takes the 366 structure stretches of 21.6c (docs/centre_earthwork.json: viaduct = fill > 7 m, tunnel candidate = cut > 12 m, bridge = wet, side-hill = slope does not catch within 60 m or face too high) and gives EACH a structure TYPE by a length / height rule.
// This is a CLASSIFICATION by my rules (AI decision, constants below, all printed), NOT the design of each structure: no span layout drawing, no foundation, no cost, no ground level re-check.
// R12: before any tunnel or big wall the line is first shifted along the hillside if that is possible (flag SHIFT-FIRST), tunnel last.
// Data note: the earthwork file is from BEFORE 21.7-3, so stretches on the lines changed by 21.7-3 (R2-15, R2-46, R2-52, L-8, L-9, L-10, L-16) are marked STALE until the vertical chain 21.39 is re-run.
// Run: node --experimental-strip-types scripts/centre-structures.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs';
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);
// ---------------- rules (MY choices) ----------------
const SPAN = 35, BR_SPAN = 30;                       // m: viaduct span, bridge span
const VIA_WALL_L = 80, VIA_WALL_H = 12;              // fill stretch up to 80 m long and 12 m high = embankment with reinforced-earth walls, else viaduct
const VIA_TALL = 25;                                 // fill above 25 m = high viaduct (tall piers)
const CUT_OPEN_L = 120, CUT_OPEN_H = 20;             // cut stretch up to 120 m long and 20 m deep = deep open cut with walls and benches
const CUT_COVER_L = 400;                             // longer than that = bored / mined tunnel, up to 400 m = cut-and-cover tunnel
const SIDE_WALL_L = 100, SHIFT_FIRST_L = 300;        // side-hill: up to 100 m retaining wall, longer = half viaduct / terrace; from 300 m flag SHIFT-FIRST
const STALE = new Set<string>();   // B7-1: chain 21.39 re-run after 21.7-3, earthwork is current, nothing is stale any more
const e = JSON.parse(readFileSync(`${OUT}/centre_earthwork.json`, 'utf8'));
interface S { line: string; cls: string; kind: string; from: number; to: number; max: number }
const TYPES = ['box culvert', 'single-span girder bridge', 'multi-span girder bridge', 'embankment with RE walls', 'viaduct', 'high viaduct', 'deep open cut with walls', 'cut-and-cover tunnel', 'bored tunnel', 'retaining wall', 'half viaduct / terrace'];
function typeOf(s: S): { type: string; spans: number; flags: string[] } {
  const len = s.to - s.from, fl: string[] = []; let type = '', spans = 0;
  if (s.kind === 'bridge') { if (len <= 12) type = 'box culvert'; else if (len <= 30) type = 'single-span girder bridge'; else type = 'multi-span girder bridge'; spans = type === 'box culvert' ? 1 : Math.max(1, Math.ceil(len / BR_SPAN)); }
  else if (s.kind === 'viaduct') { if (len <= VIA_WALL_L && s.max <= VIA_WALL_H) type = 'embankment with RE walls'; else { type = s.max > VIA_TALL ? 'high viaduct' : 'viaduct'; spans = Math.max(1, Math.ceil(len / SPAN)); } }
  else if (s.kind === 'tunnel') { fl.push('SHIFT-FIRST'); if (len <= CUT_OPEN_L && s.max <= CUT_OPEN_H) type = 'deep open cut with walls'; else if (len <= CUT_COVER_L) type = 'cut-and-cover tunnel'; else type = 'bored tunnel'; }
  else { if (len <= SIDE_WALL_L) type = 'retaining wall'; else type = 'half viaduct / terrace'; if (len >= SHIFT_FIRST_L) fl.push('SHIFT-FIRST'); }
  if (STALE.has(s.line)) fl.push('STALE');
  return { type, spans, flags: fl };
}
pr('STEP 21.8-1 STRUCTURE INVENTORY AND TYPE RULE (headless, read only; src / data NOT changed; tsc / build / game NOT RUN)');
pr(`rules (MY choices): viaduct span ${SPAN} m, bridge span ${BR_SPAN} m; fill stretch <= ${VIA_WALL_L} m long and <= ${VIA_WALL_H} m high = RE-wall embankment, else viaduct, > ${VIA_TALL} m = high viaduct; cut stretch <= ${CUT_OPEN_L} m and <= ${CUT_OPEN_H} m deep = open cut with walls, <= ${CUT_COVER_L} m = cut-and-cover, longer = bored tunnel (tunnel candidates all SHIFT-FIRST, R12); side-hill <= ${SIDE_WALL_L} m retaining wall, longer half viaduct / terrace, >= ${SHIFT_FIRST_L} m SHIFT-FIRST`);
pr();
const items = (e.structures as S[]).map((s) => ({ ...s, ...typeOf(s), len: s.to - s.from }));
const by = new Map<string, { n: number; m: number; spans: number; max: number }>();
for (const t of TYPES) by.set(t, { n: 0, m: 0, spans: 0, max: 0 });
for (const s of items) { const a = by.get(s.type)!; a.n++; a.m += s.len; a.spans += s.spans; a.max = Math.max(a.max, s.max); }
pr('TOTALS PER TYPE: type  stretches  metres  (spans)  largest height / depth');
for (const [t, a] of by) if (a.n) pr(`   ${t.padEnd(28)} ${String(a.n).padStart(4)}  ${f0(a.m).padStart(6)} m  ${a.spans ? '(' + a.spans + ' spans)' : ''}  max ${f1(a.max)} m`);
pr();
const top = (kind: string, n: number): void => { pr(`LARGEST ${kind.toUpperCase()} STRETCHES:`); for (const s of items.filter((q) => q.kind === kind).sort((a, b) => b.len - a.len).slice(0, n)) pr(`   ${s.line.padEnd(6)} s ${f0(s.from)}-${f0(s.to)}  ${f0(s.len)} m  max ${f1(s.max)} m  -> ${s.type}${s.spans ? ' (' + s.spans + ' spans)' : ''}${s.flags.length ? '  [' + s.flags.join(', ') + ']' : ''}`); };
top('tunnel', 6); top('viaduct', 6); top('bridge', 10); top('sidehill', 5);
pr();
const lineM = new Map<string, number>(); for (const s of items) lineM.set(s.line, (lineM.get(s.line) ?? 0) + s.len);
pr('LINES WITH THE MOST STRUCTURE METRES (candidates to SHIFT or re-route first): ' + [...lineM].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${f0(v)} m`).join(', '));
const sh = items.filter((s) => s.flags.includes('SHIFT-FIRST')), st = items.filter((s) => s.flags.includes('STALE'));
info(`SHIFT-FIRST (R12, a tunnel candidate or a side-hill of 300 m or more: first look for a shift along the hillside): ${sh.length} stretches, ${f0(sh.reduce((a, s) => a + s.len, 0))} m`);
info(`STALE (line changed by 21.7-3, earthwork not re-run): ${st.length} stretches on ${[...new Set(st.map((s) => s.line))].join(', ') || 'none'}`);
pr();
const sum = (k: string): number => items.filter((s) => s.kind === k).reduce((a, s) => a + s.len, 0);
chk(items.length > 0 && items.every((s) => TYPES.includes(s.type)), `all ${items.length} stretches got a type`);
const tot = (k: string): number => e.lines.reduce((a: number, l: any) => a + l[{ viaduct: 'viaductM', tunnel: 'tunnelM', bridge: 'bridgeM', sidehill: 'sidehillM' }[k]!], 0);
const diffs = ['viaduct', 'tunnel', 'bridge', 'sidehill'].map((k) => ({ k, a: sum(k), b: tot(k) }));
chk(diffs.every((d) => Math.abs(d.a - d.b) <= 0.01 * d.b), `metres per kind equal the per-line totals of 21.6c within 1 % (the stretches are merged and rounded to 5 m: ${diffs.map((d) => `${d.k} ${f0(d.a)} vs ${f0(d.b)}`).join(', ')})`);
info('NOT DONE: no span layout per structure, no foundation, no cost, no check of the bridge deck against water + 1.5 m (21.4), no game range (bridgeArm) and no game mesh; those are the next micro-steps and B7.');
pr();
pr(`SUMMARY 21.8-1: ${pass} PASS, ${fail} FAIL`);
writeFileSync(`${OUT}/STEP_21_8_1_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_structures.json`, JSON.stringify({ note: 'STEP 21.8-1 structure inventory and type rule', rules: { SPAN, BR_SPAN, VIA_WALL_L, VIA_WALL_H, VIA_TALL, CUT_OPEN_L, CUT_OPEN_H, CUT_COVER_L, SIDE_WALL_L, SHIFT_FIRST_L }, structures: items }) + '\n');
process.exit(fail === 0 ? 0 : 1);
