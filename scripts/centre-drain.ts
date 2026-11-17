// STEP 21.6d DRAIN (headless; changes NO src file, writes only docs/).
// Run: npx tsx scripts/centre-drain.ts [dir]   reads dir/centre_vprofile.json (final profile), dir/centre_meshsec.json (section per stretch, drain data of ClassSections.ts),
// dir/centre_earthwork.json (structure stretches of 21.6c: tunnel / viaduct / bridge / side-hill, the ditch is NOT drawn there, deck / wall drainage is 21.8),
// writes dir/STEP_21_6D_OUTPUT.txt and dir/centre_drain.json.
// RULES (21.5 section 4, handoff 3.3): the ditch / gully line is graded at least 0.5 % between outlets (the pavement itself may be flatter, min 0.3 %); an outlet at EVERY sag (low point of the
// profile) and at the LOW end of a line; at most `outletMax` m of ditch drain to one outlet (R6 150, R4 120, R2 100, C 80, L 60 m); the ditch is lined where the road grade is above the lining limit
// of its section (OPEN only); ZONE sections have a kerb inlet (gully) every `gullyEvery` m on both sides and a double inlet at a sag.
// Pieces: the profile is cut at its crests (divides) and sags (outlets); every piece runs down to its low end; extra outlets (SPAN) are spaced evenly so that no ditch run is longer than outletMax.
// Numbers are MY choices (min fall 0.5 %, flat = grade under 0.3 % for the turning points, flat run list = grade under 0.5 % and 60 m or more, depth gain limit 1.0 m), constants below.
import { readFileSync, writeFileSync } from 'fs';

const OUT = process.argv[2] ?? 'docs';
const DS = 10, T_TURN = 0.003, MIN_FALL = 0.005, FLAT_LEN = 60, GAIN_MAX = 1.0;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const V = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const M = JSON.parse(readFileSync(`${OUT}/centre_meshsec.json`, 'utf8'));
const E = JSON.parse(readFileSync(`${OUT}/centre_earthwork.json`, 'utf8'));
const msById = new Map<string, any>(M.lines.map((l: any) => [l.id, l]));
const secById = new Map<string, any>(M.sections.map((s: any) => [s.id, s]));
const stByLine = new Map<string, any[]>(); for (const q of E.structures) { const a = stByLine.get(q.line) ?? []; a.push(q); stByLine.set(q.line, a); }

function yAt(l: any, s: number): number {
  const pv: number[][] = l.pvi, cv: any[] = l.curves;
  for (let i = 1; i + 1 < pv.length; i++) { const c = cv[i - 1]; if (c.L > 0 && s >= pv[i][0] - c.L / 2 && s <= pv[i][0] + c.L / 2) { const g1 = (pv[i][1] - pv[i - 1][1]) / (pv[i][0] - pv[i - 1][0]), s0 = pv[i][0] - c.L / 2, y0 = pv[i][1] - g1 * c.L / 2; return y0 + g1 * (s - s0) + (c.A / 100) * (s - s0) ** 2 / (2 * c.L); } }
  let j = 0; while (j + 2 < pv.length && pv[j + 1][0] < s) j++; const t = (s - pv[j][0]) / (pv[j + 1][0] - pv[j][0]); return pv[j][1] + t * (pv[j + 1][1] - pv[j][1]);
}
interface Out { s: number; reason: 'SAG' | 'LOW END' | 'SPAN' | 'FLAT'; kind: string; inStructure: boolean }
interface Acc { km: number; ditchKm: number; lined: number; zoneKm: number; gullies: number; sag: number; low: number; span: number; flat: number; structKm: number; flatRuns: number; flatM: number; sagInStruct: number }
const acc = (): Acc => ({ km: 0, ditchKm: 0, lined: 0, zoneKm: 0, gullies: 0, sag: 0, low: 0, span: 0, flat: 0, structKm: 0, flatRuns: 0, flatM: 0, sagInStruct: 0 });
const byCls = new Map<string, Acc>(); const bySec = new Map<string, { ditch: number; lined: number; zone: number; gullies: number }>();
const perLine: any[] = []; const flatRows: any[] = []; let pieceBad = 0, gainBad = 0, sagMissing = 0, pieces = 0, maxGain = 0, maxSpan = 0;

pr('STEP 21.6d DRAIN (headless; nothing in src changed; tsc / npm run build / game NOT RUN; my numbers, constants at the top of the script)');
pr(`   ditch / gully fall at least ${f1(100 * MIN_FALL)} % between outlets; outlet at every sag and at the low end of a line (reason SAG / LOW END), extra outlets SPAN (spacing) and FLAT (inside a flat run); outletMax R6 150 / R4 120 / R2 100 / C 80 / L 60 m; ditch depth gain limit ${f1(GAIN_MAX)} m; structure stretches of 21.6c carry no ditch (deck / wall drainage = 21.8)`);
pr('');

for (const vl of V.lines) {
  const cls = String(vl.cls); const ms = msById.get(vl.id); if (!ms) continue; const end = vl.pvi[vl.pvi.length - 1][0];
  const A = byCls.get(cls) ?? byCls.set(cls, acc()).get(cls)!; const st = stByLine.get(vl.id) ?? [];
  const inStruct = (s: number): boolean => st.some((q: any) => s >= q.from && s <= q.to);
  const secAt = (s: number): any => { const q = ms.stretches.find((r: any) => s >= r.s0 && s < r.s1) ?? ms.stretches[ms.stretches.length - 1]; return secById.get(q.section); };
  const n = Math.max(2, Math.round(end / DS) + 1); const ss: number[] = [], yy: number[] = [], gg: number[] = [];
  for (let k = 0; k < n; k++) { const s = Math.min(end, k * end / (n - 1)); ss.push(s); yy.push(yAt(vl, s)); }
  for (let k = 0; k < n; k++) { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); gg.push((yy[b] - yy[a]) / (ss[b] - ss[a])); }
  const dir = gg.map((g) => (g >= T_TURN ? 1 : g <= -T_TURN ? -1 : 0));
  // turning points: crest (+ -> -) at the highest station of the zero run, sag (- -> +) at the lowest one; start / end are boundaries
  const turns: { k: number; type: 'start' | 'end' | 'crest' | 'sag' }[] = [{ k: 0, type: 'start' }];
  let last = 0, lastK = -1;
  for (let k = 0; k < n; k++) { if (dir[k] === 0) continue; if (last !== 0 && dir[k] !== last) { let b = lastK + 1, bk = b; for (let m = lastK + 1; m < k; m++) { if (dir[k] > 0 ? yy[m] < yy[bk] : yy[m] > yy[bk]) bk = m; } if (lastK + 1 >= k) bk = Math.round((lastK + k) / 2); turns.push({ k: bk, type: dir[k] > 0 ? 'sag' : 'crest' }); } last = dir[k]; lastK = k; }
  turns.push({ k: n - 1, type: 'end' });
  const outs: Out[] = []; const addOut = (k: number, reason: Out['reason']): void => { const s = ss[k]; const sec = secAt(s); outs.push({ s: Math.round(s), reason, kind: sec.drain.kind === 'open ditch' ? 'cross culvert D600 / ditch outfall' : 'gully line + storm pipe', inStructure: inStruct(s) }); };
  // low ends: the first / last non-zero direction decides which end is low
  const firstDir = dir.find((d) => d !== 0) ?? 0, lastDir = [...dir].reverse().find((d) => d !== 0) ?? 0;
  if (firstDir === 0) { addOut(0, 'LOW END'); addOut(n - 1, 'LOW END'); } else { if (firstDir > 0) addOut(0, 'LOW END'); if (lastDir < 0) addOut(n - 1, 'LOW END'); }
  for (const t of turns) if (t.type === 'sag') addOut(t.k, 'SAG');
  // pieces between consecutive turning points: every piece runs down to its low end; extra outlets so that no ditch run is longer than outletMax
  for (let i = 0; i + 1 < turns.length; i++) {
    const a = turns[i].k, b = turns[i + 1].k; if (b <= a) continue;
    let ell = 0, out = Infinity; for (let k = a; k < b; k++) { const mid = (ss[k] + ss[k + 1]) / 2; if (!inStruct(mid)) { ell += ss[k + 1] - ss[k]; out = Math.min(out, secAt(mid).drain.outletMax); } }
    if (ell <= 0 || !Number.isFinite(out)) continue; pieces++;
    const nx = Math.max(0, Math.ceil(ell / out - 1e-9) - 1); const span = ell / (nx + 1); maxSpan = Math.max(maxSpan, span / out);
    if (span > out + 1e-6) pieceBad++;
    const down = yy[b] < yy[a]; // low end is b when the road falls along s
    for (let j = 1; j <= nx; j++) { const f = j / (nx + 1); const k = Math.round(down ? b - f * (b - a) : a + f * (b - a)); addOut(Math.max(a, Math.min(b, k)), 'SPAN'); }
  }
  outs.sort((p, q) => p.s - q.s);
  // flat runs: grade under 0.5 % for 60 m or more (the ditch cannot follow the road there, it gets its own 0.5 % fall in spans between outlets)
  let k = 0; let nFlat = 0, mFlat = 0;
  while (k < n) {
    if (Math.abs(gg[k]) < MIN_FALL && !inStruct(ss[k])) { let m = k; while (m + 1 < n && Math.abs(gg[m + 1]) < MIN_FALL && !inStruct(ss[m + 1])) m++; const len = ss[m] - ss[k];
      if (len >= FLAT_LEN) { const sec = secAt((ss[k] + ss[m]) / 2); const out = sec.drain.outletMax; const insideNow = (): number[] => outs.filter((o) => o.s > ss[k] && o.s < ss[m]).map((o) => o.s).sort((a, b) => a - b); const inside = insideNow().length; const nOut = Math.max(inside, Math.ceil(len / out - 1e-9) - 1);
        const maxGap = (): number => { const q = [ss[k], ...insideNow(), ss[m]]; let g = 0; for (let i = 0; i + 1 < q.length; i++) g = Math.max(g, q[i + 1] - q[i]); return g; };
        while (insideNow().length < nOut || maxGap() > out + 1e-9) { const pts = [ss[k], ...insideNow(), ss[m]]; let bi = 0; for (let i = 1; i + 1 < pts.length; i++) if (pts[i + 1] - pts[i] > pts[bi + 1] - pts[bi]) bi = i; if (pts.length === 2) bi = 0; const mid = (pts[bi] + pts[bi + 1]) / 2; const kk = ss.reduce((b, v, i) => (Math.abs(v - mid) < Math.abs(ss[b] - mid) ? i : b), 0); addOut(kk, 'FLAT'); }
        const pts2 = [ss[k], ...insideNow(), ss[m]]; let span = 0; for (let i = 0; i + 1 < pts2.length; i++) span = Math.max(span, pts2[i + 1] - pts2[i]); const gain = span * MIN_FALL; maxGain = Math.max(maxGain, gain); if (gain > GAIN_MAX + 1e-9) gainBad++;
        flatRows.push({ line: vl.id, s0: Math.round(ss[k]), s1: Math.round(ss[m]), len: Math.round(len), grade: Math.round(10000 * (yy[m] - yy[k]) / Math.max(1, ss[m] - ss[k])) / 100, section: sec.id, outletsInside: insideNow().length, outletsNeeded: nOut, span: Math.round(span), depthGain: Math.round(gain * 100) / 100, ditchDepthMax: Math.round(((sec.drain.ditchD ?? 0) + gain) * 100) / 100 }); nFlat++; mFlat += len; }
      k = m + 1; } else k++;
  }
  outs.sort((p, q) => p.s - q.s);
  // lengths: ditch (OPEN, no structure), lined, ZONE with gullies
  let ditch = 0, lined = 0, zone = 0, gul = 0, structM = 0;
  for (let q = 0; q < n; q++) {
    const ds = q === 0 || q === n - 1 ? (ss[1] - ss[0]) / 2 : (ss[q + 1] - ss[q - 1]) / 2; const s = ss[q]; const sec = secAt(s); const SB = bySec.get(sec.id) ?? bySec.set(sec.id, { ditch: 0, lined: 0, zone: 0, gullies: 0 }).get(sec.id)!;
    if (inStruct(s)) { structM += ds; continue; }
    if (sec.drain.kind === 'open ditch') { ditch += ds; SB.ditch += ds; if (Math.abs(gg[q]) > (sec.drain.liningAbove ?? 1)) { lined += ds; SB.lined += ds; } }
    else { zone += ds; SB.zone += ds; const g = 2 * ds / (sec.drain.gullyEvery ?? 25); gul += g; SB.gullies += g; }
  }
  const sags = outs.filter((o) => o.reason === 'SAG' && !o.inStructure).length; const sagsAll = turns.filter((t) => t.type === 'sag').length; const sagS = outs.filter((o) => o.reason === 'SAG' && o.inStructure).length;
  if (sags + sagS !== sagsAll) sagMissing++;
  A.km += end / 1000; A.ditchKm += ditch / 1000; A.lined += lined / 1000; A.zoneKm += zone / 1000; A.gullies += gul + 2 * sags; A.structKm += structM / 1000;
  A.sag += sags; A.low += outs.filter((o) => o.reason === 'LOW END' && !o.inStructure).length; A.span += outs.filter((o) => o.reason === 'SPAN').length; A.flat += outs.filter((o) => o.reason === 'FLAT').length; A.flatRuns += nFlat; A.flatM += mFlat; A.sagInStruct += sagS;
  perLine.push({ id: vl.id, cls, len: Math.round(end), ditchM: Math.round(ditch), linedM: Math.round(lined), zoneM: Math.round(zone), gullies: Math.round(gul + 2 * sags), structM: Math.round(structM), crests: turns.filter((t) => t.type === 'crest').length, sags: sagsAll, outlets: outs });
}
pr('1. PER CLASS');
let tOut = 0, tDitch = 0, tLined = 0, tGul = 0;
for (const c of ['6', '4', '2', 'C', 'L']) { const A = byCls.get(c); if (!A) continue; const no = A.sag + A.low + A.span + A.flat; tOut += no; tDitch += A.ditchKm; tLined += A.lined; tGul += A.gullies;
  pr(`   class ${c.padEnd(2)} ${f1(A.km).padStart(6)} km   ditch ${f1(A.ditchKm).padStart(5)} km per side (lined ${f1(A.lined).padStart(4)} km)   kerb + gully ${f1(A.zoneKm).padStart(5)} km, ${f0(A.gullies).padStart(5)} inlets   outlets ${String(no).padStart(4)} (sag ${A.sag}, low end ${A.low}, span ${A.span}, flat ${A.flat}; ${A.sagInStruct} sags lie in a structure = 21.8)   flat runs ${A.flatRuns} (${f0(A.flatM)} m)   structure stretches without ditch ${f1(A.structKm)} km`); }
pr(`   TOTAL ditch ${f1(tDitch)} km per side (lined ${f1(tLined)} km = ${f0(100 * tLined / Math.max(tDitch, 1e-9))} %), ${f0(tGul)} kerb inlets, ${tOut} outlets`);
pr('   (a ditch is on BOTH sides of an OPEN road, so the ditch metres are per side; R6 / R4: the median drains with its own inlets at the same stations, count in 21.9)');
pr('');
pr('2. PER SECTION');
for (const [id, B] of [...bySec].sort((a, b) => a[0].localeCompare(b[0]))) pr(`   ${id.padEnd(8)} ditch ${f2(B.ditch / 1000).padStart(6)} km  lined ${f2(B.lined / 1000).padStart(5)} km  kerb + gully ${f2(B.zone / 1000).padStart(6)} km  inlets ${f0(B.gullies).padStart(5)}`);
pr('');
pr(`3. FLAT RUNS (road grade under ${f1(100 * MIN_FALL)} % for ${FLAT_LEN} m or more, structures left out): the ditch gets its own ${f1(100 * MIN_FALL)} % fall in spans between outlets (saw-tooth)`);
flatRows.sort((a, b) => b.len - a.len);
for (const r of flatRows.slice(0, 30)) pr(`   ${r.line.padEnd(6)} s ${String(r.s0).padStart(5)} .. ${String(r.s1).padStart(5)}  ${String(r.len).padStart(4)} m  grade ${r.grade.toFixed(2).padStart(5)} %  ${r.section.padEnd(8)} outlets inside ${r.outletsInside} (needed ${r.outletsNeeded}), span ${r.span} m, ditch gain ${f2(r.depthGain)} m, ditch depth ${f2(r.ditchDepthMax)} m at the top of a span`);
if (flatRows.length > 30) pr(`   ... ${flatRows.length - 30} more in docs/centre_drain.json`);
pr(`   ${flatRows.length} flat runs, ${f0(flatRows.reduce((a, r) => a + r.len, 0))} m; R4-6 and R4-10 (the two of 21.5 section 4): ${flatRows.filter((r) => r.line === 'R4-6' || r.line === 'R4-10').map((r) => `${r.line} s ${r.s0}-${r.s1} ${r.len} m`).join(', ') || 'none left under 0.5 %'}`);
pr('');
pr('4. OUTLET TABLE: docs/centre_drain.json "lines" (per line: s, reason SAG / LOW END / SPAN / FLAT, kind = cross culvert D600 / ditch outfall for OPEN, gully line + storm pipe for ZONE, flag inStructure)');
pr('   The low-end outlets of a line end at a junction node or a road: where the water goes there (the side ditch of the bigger road, a culvert, a stream) is decided in 21.7 / 21.8; here only the place and the kind are fixed.');
pr('');
pr('5. CHECKS');
chk(perLine.length === 154, `154 lines done (${perLine.length})`);
chk(pieces > 0 && pieceBad === 0, `every ditch run between a divide and its outlet is at most outletMax (${pieces} pieces, worst span ${f0(100 * maxSpan)} % of outletMax)`);
chk(sagMissing === 0, 'every sag has an outlet (sags inside a structure stretch go to 21.8)');
chk(gainBad === 0, `every flat run keeps the ditch depth gain within ${f1(GAIN_MAX)} m (worst ${f2(maxGain)} m)`);
chk(perLine.every((l) => l.outlets.every((o: Out) => o.s >= 0 && o.s <= l.len + 1)), 'every outlet lies on its line');
chk(perLine.filter((l) => l.cls === '6' || l.cls === '4').every((l) => l.ditchM + l.zoneM + l.structM >= l.len - 30), 'ditch + gully + structure metres cover every R6 / R4 line');
chk([...bySec.keys()].every((k) => secById.has(k)), 'every section used is in the table of 21.6b');
pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/centre_drain.json`, JSON.stringify({ note: 'STEP 21.6d drain: outlets (SAG / LOW END / SPAN), ditch / gully / lining metres, flat runs', params: { T_TURN, MIN_FALL, FLAT_LEN, GAIN_MAX }, classes: Object.fromEntries([...byCls]), sections: Object.fromEntries([...bySec]), flat: flatRows, lines: perLine }));
writeFileSync(`${OUT}/STEP_21_6D_OUTPUT.txt`, L.join('\n') + '\n');
