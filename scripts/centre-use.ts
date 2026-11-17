// STEP 21.6a-2  OPEN or ZONE per stretch of every line (headless; changes NO game file; writes docs/centre_use.json and docs/STEP_21_6A_OUTPUT.txt).
// Run: npx tsx scripts/centre-use.ts [dir]   (default docs)   reads dir/centre_fixed.json (geometry + class) and dir/centre_vprofile.json (which 154 lines are profiled).
// RULE (user, 21.6 order): R6 all OPEN. R4 / R2: ZONE inside a built-up zone, OPEN outside. C / L all ZONE.
// Zone use = getWorldZoneAt(x, z) of src/city/WorldZones.ts (pure data); built-up = BUILT_UP_KINDS of the same file (urban-core, commercial, residential, industrial, logistics, education,
// civic, utility, airport, army, seaport, village, engineering). Farmland, forest, mountain, wetland, park, coast, sea = open country.
// To stop a kerbed section from flickering on and off, the label of a station is the majority of +- VOTE stations and a stretch shorter than MINSEG is merged into its neighbour.
import { readFileSync, writeFileSync } from 'fs';
import { getWorldZoneAt, BUILT_UP_KINDS } from '../src/city/WorldZones';
import { CLASS_SECTIONS } from '../src/roads/standards/ClassSections';

const OUT = process.argv[2] ?? 'docs';
// ---- constants (my numbers, change here) ----
const STEP = 10, VOTE = 5, MINSEG = 100;
const hyp = Math.hypot; const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, m: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${m}`); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), km = (m: number): string => (m / 1000).toFixed(1);
type V2 = [number, number];
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8')), V = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const geo = new Map<string, any>(F.lines.map((l: any) => [l.id, l]));
const plen = (p: V2[]): number => { let s = 0; for (let i = 0; i + 1 < p.length; i++) s += hyp(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return s; };
function resample(p: V2[], step: number): { P: V2[]; s: number[] } {
  const total = plen(p), n = Math.max(2, Math.round(total / step) + 1), P: V2[] = [], s: number[] = []; let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) { const tg = (total * k) / (n - 1); while (seg + 1 < p.length - 1 && acc + hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) < tg) { acc += hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]); seg++; }
    const sl = hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) || 1, t = Math.max(0, Math.min(1, (tg - acc) / sl)); P.push([p[seg][0] + (p[seg + 1][0] - p[seg][0]) * t, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * t]); s.push(tg); }
  return { P, s };
}
const sectionIds = new Set(CLASS_SECTIONS.map((s) => s.id));
const SECTION = (cls: string, zone: boolean): string => cls === '6' ? 'R6' : cls === '4' ? (zone ? 'R4-ZONE' : 'R4-OPEN') : cls === '2' ? (zone ? 'R2-ZONE' : 'R2-OPEN') : cls === 'C' ? 'C-ZONE' : 'L-ZONE';
interface Stretch { s0: number; s1: number; zone: boolean; zones: Record<string, number>; kinds: Record<string, number> }

pr('STEP 21.6a  OPEN / ZONE PER STRETCH (headless; nothing in src or the game changed; docs/centre_use.json is the table the next steps read)');
pr(`rule: R6 = OPEN everywhere; R4 / R2 = ZONE inside a built-up zone (getWorldZoneAt, BUILT_UP_KINDS), OPEN outside; C / L = ZONE everywhere. Stations every ${STEP} m, vote +-${VOTE} stations, shortest stretch ${MINSEG} m`);
pr('');
const rows: any[] = []; const flips: { id: string; s: number; x: number; z: number; to: string }[] = [];
for (const pl of V.lines) {
  const g = geo.get(pl.id); const cls: string = g.cls; const { P, s } = resample(g.pts, STEP); const n = P.length;
  const hit = P.map((q) => getWorldZoneAt(q[0], q[1])); const built = hit.map((h) => BUILT_UP_KINDS.has(h.kind));
  let lab: boolean[];
  if (cls === '6') lab = built.map(() => false); else if (cls === 'C' || cls === 'L') lab = built.map(() => true);
  else { lab = built.map((_, i) => { let a = 0, b = 0; for (let k = Math.max(0, i - VOTE); k <= Math.min(n - 1, i + VOTE); k++) (built[k] ? a++ : b++); return a > b; });
    for (let guard = 0; guard < 50; guard++) { // merge short stretches
      const runs: { a: number; b: number; v: boolean }[] = []; for (let i = 0; i < n; i++) { if (runs.length && runs[runs.length - 1].v === lab[i]) runs[runs.length - 1].b = i; else runs.push({ a: i, b: i, v: lab[i] }); }
      if (runs.length < 2) break; let idx = -1, sh = 1e18; runs.forEach((r, k) => { const len = (r.b - r.a + 1) * STEP; if (len < MINSEG && len < sh) { sh = len; idx = k; } }); if (idx < 0) break;
      for (let i = runs[idx].a; i <= runs[idx].b; i++) lab[i] = !runs[idx].v; } }
  const st: Stretch[] = []; for (let i = 0; i < n; i++) { const a = i === 0 ? 0 : (s[i - 1] + s[i]) / 2, b = i === n - 1 ? s[i] : (s[i] + s[i + 1]) / 2; const last = st[st.length - 1];
    if (last && last.zone === lab[i]) { last.s1 = b; } else { if (last) flips.push({ id: pl.id, s: a, x: P[i][0], z: P[i][1], to: lab[i] ? 'ZONE' : 'OPEN' }); st.push({ s0: a, s1: b, zone: lab[i], zones: {}, kinds: {} }); }
    const cur = st[st.length - 1], w = b - a; cur.zones[hit[i].id] = (cur.zones[hit[i].id] ?? 0) + w; cur.kinds[hit[i].kind] = (cur.kinds[hit[i].kind] ?? 0) + w; }
  const len = s[n - 1]; rows.push({ id: pl.id, cls, len, stretches: st.map((x) => ({ s0: Math.round(x.s0), s1: Math.round(x.s1), use: x.zone ? 'ZONE' : 'OPEN', section: SECTION(cls, x.zone), zones: Object.fromEntries(Object.entries(x.zones).map(([k, v]) => [k, Math.round(v)])), kinds: Object.fromEntries(Object.entries(x.kinds).map(([k, v]) => [k, Math.round(v)])) })),
    builtM: built.filter(Boolean).length * STEP });
}
// ---------- 1. summary per class ----------
pr('1. SUMMARY PER CLASS');
const order = ['6', '4', '2', 'C', 'L']; const tot: Record<string, { n: number; len: number; open: number; zone: number; flips: number; builtM: number }> = {};
for (const c of order) tot[c] = { n: 0, len: 0, open: 0, zone: 0, flips: 0, builtM: 0 };
for (const r of rows) { const t = tot[r.cls]; t.n++; t.len += r.len; t.builtM += r.builtM; for (const x of r.stretches) { if (x.use === 'ZONE') t.zone += x.s1 - x.s0; else t.open += x.s1 - x.s0; } t.flips += r.stretches.length - 1; }
for (const c of order) { const t = tot[c]; pr(`   class ${c.padEnd(2)} ${String(t.n).padStart(3)} lines ${km(t.len).padStart(5)} km   OPEN ${km(t.open).padStart(5)} km   ZONE ${km(t.zone).padStart(5)} km   OPEN<->ZONE changes ${t.flips}   (centreline inside a built-up zone: ${km(t.builtM)} km)`); }
pr('');
// ---------- 2. lines with a ZONE stretch (R4 / R2) and the odd cases ----------
pr('2. R4 / R2 LINES WITH A ZONE STRETCH  (section, from s to s, length, zone ids with metres)');
for (const r of rows.filter((q) => (q.cls === '4' || q.cls === '2') && q.stretches.some((x: any) => x.use === 'ZONE'))) {
  pr(`   ${r.id.padEnd(6)} ${f0(r.len).padStart(5)} m  ${r.stretches.map((x: any) => `${x.section} ${x.s0}-${x.s1}`).join('  |  ')}`);
  for (const x of r.stretches.filter((y: any) => y.use === 'ZONE')) pr(`          ZONE ${x.s0}-${x.s1} (${x.s1 - x.s0} m) in ${Object.entries(x.zones).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => `${k} ${v} m`).join(', ')}`); }
pr('');
pr('3. R6 LINES (all OPEN by the rule): metres of the centreline that lie inside a built-up zone  (INFO, the user judges)');
for (const r of rows.filter((q) => q.cls === '6')) { const kinds: Record<string, number> = {}; for (const x of r.stretches) for (const [k, v] of Object.entries(x.kinds)) if (BUILT_UP_KINDS.has(k as any)) kinds[k] = (kinds[k] ?? 0) + (v as number);
  pr(`   ${r.id.padEnd(6)} ${f0(r.len).padStart(5)} m  built-up ${f0(r.builtM).padStart(5)} m ${Object.keys(kinds).length ? '(' + Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ') + ')' : ''}`); }
pr('');
pr('4. C / L LINES (all ZONE by the rule): metres of the centreline in open country  (INFO: a kerbed street outside a built-up zone, the user judges)');
{ let cnt = 0; for (const r of rows.filter((q) => q.cls === 'C' || q.cls === 'L')) { const open = r.len - r.builtM; if (open > 100) { cnt++; pr(`   ${r.id.padEnd(6)} ${f0(r.len).padStart(5)} m  open country ${f0(open).padStart(5)} m`); } } if (!cnt) pr('   none over 100 m'); }
pr('');
pr('5. OPEN <-> ZONE CHANGES on R4 / R2 (a taper / transition is needed there: 21.7 or 21.9, listed so that nothing is forgotten)');
for (const f of flips.filter((q) => { const c = geo.get(q.id).cls; return c === '4' || c === '2'; })) pr(`   ${f.id.padEnd(6)} s ${f0(f.s).padStart(5)} (${f0(f.x)}, ${f0(f.z)})  -> ${f.to}`);
pr('');
pr('6. CHECKS');
chk(rows.length === 154, `all 154 profiled lines have a use table (${rows.length})`);
chk(rows.every((r) => { let ok = Math.abs(r.stretches[0].s0) < 1e-6 && Math.abs(r.stretches[r.stretches.length - 1].s1 - r.len) < 1.5; for (let i = 1; i < r.stretches.length; i++) ok = ok && Math.abs(r.stretches[i].s0 - r.stretches[i - 1].s1) <= 1; return ok; }), 'every table covers the whole line from s 0 to the end without a gap');
chk(rows.every((r) => r.stretches.every((x: any) => sectionIds.has(x.section))), 'every stretch names a section that exists in ClassSections.ts');
chk(rows.filter((r) => r.cls === '6').every((r) => r.stretches.length === 1 && r.stretches[0].use === 'OPEN'), 'R6: all OPEN');
chk(rows.filter((r) => r.cls === 'C' || r.cls === 'L').every((r) => r.stretches.length === 1 && r.stretches[0].use === 'ZONE'), 'C / L: all ZONE');
{ let short = 0; for (const r of rows) { if (r.cls !== '4' && r.cls !== '2') continue; r.stretches.forEach((x: any, i: number) => { const ends = i === 0 || i === r.stretches.length - 1; if (x.s1 - x.s0 < MINSEG - 1 && r.stretches.length > 1 && !ends) short++; }); } chk(short === 0, `no R4 / R2 stretch shorter than ${MINSEG} m between two others (${short})`); }
chk(rows.filter((r) => r.cls === '4' || r.cls === '2').every((r) => r.stretches.filter((x: any) => x.use === 'ZONE').every((x: any) => Object.keys(x.kinds).some((k) => BUILT_UP_KINDS.has(k as any)))), 'every R4 / R2 ZONE stretch lies at least partly in a built-up zone');
chk(rows.filter((r) => r.cls === '4' || r.cls === '2').every((r) => r.stretches.filter((x: any) => x.use === 'OPEN').every((x: any) => (x.s1 - x.s0) > 0)), 'every OPEN stretch has length');
pr('');
pr('NEXT (21.6 b..f, one per chat): (b) section mesh from ClassSections.ts per stretch; (c) earthwork with the OPEN / ZONE formation width; (d) drain; (e) superelevation; (f) rail entries. centre-section.ts still uses ONE section per class (SECTION_FOR_VOLUME): it reads centre_use.json from (c).');
pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/centre_use.json`, JSON.stringify({ note: 'STEP 21.6a OPEN / ZONE per stretch; s = metres along the line of docs/centre_fixed.json; rule R6 OPEN, R4 / R2 by zone use, C / L ZONE', params: { STEP, VOTE, MINSEG }, lines: rows }));
writeFileSync(`${OUT}/STEP_21_6A_OUTPUT.txt`, L.join('\n') + '\n');
