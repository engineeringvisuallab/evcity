// STEP 21.6b SECTION MESH (headless; changes NO src file, writes only docs/).
// Run: npx tsx scripts/centre-meshsec.ts [dir]   reads dir/centre_use.json (21.6a OPEN / ZONE stretches), dir/centre_fixed.json (line length, class)
// writes dir/STEP_21_6B_OUTPUT.txt and dir/centre_meshsec.json (picture: python tools/centre-meshsec-plot.py docs).
// What it does: every stretch of every line gets the section of src/roads/standards/ClassSections.ts; every element is turned into an offset band (inner / outer distance from the
// centreline, one side, drive side LEFT, a median is the first band), so the game mesh builder (21.6 build) only has to loop over bands. Where two stretches of one line have different
// sections (OPEN <-> ZONE) a TRANSITION is listed: a taper of TAPER_M metres in which every band width changes linearly (MY choice, constant below).
import { readFileSync, writeFileSync } from 'fs';
import { CLASS_SECTIONS, ClassSection } from '../src/roads/standards/ClassSections';

const OUT = process.argv[2] ?? 'docs';
const TAPER_M = 30;          // m: length of the taper between two different sections of one line (my choice)
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const U = JSON.parse(readFileSync(`${OUT}/centre_use.json`, 'utf8'));
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const fixedLen = new Map<string, number>();
for (const l of F.lines) { const p: number[][] = l.pts; let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); fixedLen.set(l.id, s); }
const secById = new Map<string, ClassSection>(CLASS_SECTIONS.map((s) => [s.id, s]));

// surface material of a band (for the mesh builder; colours / textures stay in the game)
const SURFACE: Record<string, string> = { median: 'soil-grass', 'shoulder-in': 'asphalt', lanes: 'asphalt', 'shoulder-out': 'asphalt', 'earth-shoulder': 'earth', kerb: 'kerb-concrete', footpath: 'block-paving', 'verge-drain': 'soil-verge', barrier: 'steel', ditch: 'earth-ditch', 'clear-zone': 'grass', 'row-strip': 'grass' };
const bands = (s: ClassSection): { name: string; kind: string; surface: string; from: number; to: number }[] => { let at = 0; return s.elements.map((e) => { const b = { name: e.name, kind: e.kind, surface: SURFACE[e.kind] ?? 'grass', from: +at.toFixed(3), to: +(at + e.width).toFixed(3) }; at += e.width; return b; }); };

pr('STEP 21.6b SECTION MESH (headless; nothing in src changed; tsc / npm run build / game NOT RUN; my numbers, change the constants at the top)');
pr('');
pr('1. BANDS PER SECTION (metres from the centreline, ONE side, drive side LEFT; mirror for the other side; the median is the first band)');
const secOut: any[] = [];
for (const s of CLASS_SECTIONS) {
  const b = bands(s);
  pr(`   ${s.id.padEnd(8)} paved edge ${f2(s.pavementEdge)}  formation half ${f2(s.formationHalf)}  ROW half ${f2(s.rowHalf)}  crossfall ${f1(100 * s.crossFall)} %  pavement ${f2(s.pavement)} m  drain ${s.drain.kind}`);
  pr('      ' + b.map((q) => `${q.kind} ${f2(q.from)}-${f2(q.to)}`).join(' | '));
  secOut.push({ id: s.id, cls: s.cls, variant: s.variant, speed: s.speed, lanesPerDir: s.lanesPerDir, laneW: s.laneW, median: s.median, pavementEdge: s.pavementEdge, formationHalf: s.formationHalf, rowHalf: s.rowHalf, pavement: s.pavement, crossFall: s.crossFall, drain: s.drain, bands: b });
}

pr('');
pr('2. STRETCHES AND TRANSITIONS PER LINE');
const lines: any[] = []; const trans: any[] = []; const km: Record<string, number> = {};
let gaps = 0, unknown = 0, lenBad = 0, nStretch = 0;
for (const l of U.lines) {
  const st: any[] = l.stretches; const out: any[] = [];
  let prev = 0;
  for (let i = 0; i < st.length; i++) {
    const q = st[i]; nStretch++;
    if (!secById.has(q.section)) unknown++;
    if (Math.abs(q.s0 - prev) > 1.5) gaps++;
    prev = q.s1; km[q.section] = (km[q.section] ?? 0) + (q.s1 - q.s0);
    out.push({ s0: q.s0, s1: q.s1, section: q.section, use: q.use });
    if (i > 0 && st[i - 1].section !== q.section) {
      const a = secById.get(st[i - 1].section)!, b = secById.get(q.section)!;
      const t = { line: l.id, at: q.s0, from: a.id, to: b.id, taper: TAPER_M, from_s: Math.max(0, q.s0 - TAPER_M / 2), to_s: Math.min(l.len, q.s0 + TAPER_M / 2), formationHalf: [a.formationHalf, b.formationHalf], paveEdge: [a.pavementEdge, b.pavementEdge], rowHalf: [a.rowHalf, b.rowHalf] };
      trans.push(t);
    }
  }
  const L0 = fixedLen.get(l.id) ?? l.len;
  if (Math.abs(prev - L0) > 12) lenBad++;
  lines.push({ id: l.id, cls: l.cls, len: Math.round(L0), stretches: out });
}
for (const t of trans) pr(`   ${t.line.padEnd(6)} s ${f0(t.at).padStart(5)}  ${t.from} -> ${t.to}  taper s ${f0(t.from_s)}-${f0(t.to_s)}  paved edge ${f2(t.paveEdge[0])} -> ${f2(t.paveEdge[1])}  formation half ${f2(t.formationHalf[0])} -> ${f2(t.formationHalf[1])}  ROW half ${f2(t.rowHalf[0])} -> ${f2(t.rowHalf[1])}`);
pr(`   ${lines.length} lines, ${nStretch} stretches, ${trans.length} transitions`);
pr('');
pr('3. LENGTH PER SECTION');
for (const s of CLASS_SECTIONS) pr(`   ${s.id.padEnd(8)} ${(((km[s.id] ?? 0)) / 1000).toFixed(2).padStart(7)} km`);
pr('');
pr('4. CHECKS');
chk(unknown === 0, `every stretch names a known section (unknown ${unknown})`);
chk(gaps === 0, `stretches of every line follow each other without a gap (gaps ${gaps})`);
chk(lenBad === 0, `last stretch ends at the line length of centre_fixed.json within 12 m (bad ${lenBad})`);
chk(lines.length === 154, `154 lines (${lines.length})`);
chk(CLASS_SECTIONS.every((s) => { const b = bands(s); return Math.abs(b[b.length - 1].to - s.rowHalf) < 1e-6; }), 'last band of every section ends at the ROW half');
chk(CLASS_SECTIONS.every((s) => { const b = bands(s); const e = b.find((q) => q.kind === (s.variant === 'OPEN' ? 'shoulder-out' : 'kerb')); return !!e && Math.abs(e.to - s.pavementEdge) < 1e-6; }), 'paved edge band (shoulder-out for OPEN and R6, kerb for ZONE) ends at the paved edge of the section');
chk(trans.every((t) => t.to_s - t.from_s >= 1), 'every transition has a taper');
chk(trans.filter((t) => ['R4', 'R2'].includes(t.from.split('-')[0]) && t.from.split('-')[0] === t.to.split('-')[0]).length === trans.length, 'transitions only between OPEN and ZONE of the same class');
pr(`PASS ${pass} FAIL ${fail}`);
writeFileSync(`${OUT}/centre_meshsec.json`, JSON.stringify({ note: 'STEP 21.6b section bands per section id, stretches per line, transitions', taper: TAPER_M, sections: secOut, lines, transitions: trans }));
writeFileSync(`${OUT}/STEP_21_6B_OUTPUT.txt`, L.join('\n') + '\n');
