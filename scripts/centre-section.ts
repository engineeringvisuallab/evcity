// STEP 21.5 CROSS-SECTION PER CLASS (headless; changes NO game file, only writes docs/).
// Run: npx tsx scripts/centre-section.ts [dir]   reads dir/centre_vprofile.json (21.4c final PVI + curves), dir/centre_profile.json (ground), dir/centre_fixed.json (class),
// writes dir/STEP_21_5_OUTPUT.txt and dir/centre_sections.json (picture: python tools/centre-section-plot.py docs).
// What it does: (1) prints the section table of src/roads/standards/ClassSections.ts (R6 = the built M6, R4 / R2 open + zone, C, L) and checks it, (2) earthwork volumes of the 154 lines with the
// REAL formation width of the class (21.4 used indicative widths), cut slope 1:2, fill slope 1:3 (DESIGN), pavement thickness, structures (cut > 12 m, fill > 7 m, wet) counted as metres, not volume,
// (3) drainage: ditch lining length (grade above the lining limit) and the saw-tooth drain design for the flat tangents of 21.4c-r (3d).
import { readFileSync, writeFileSync } from 'fs';
import { DESIGN } from '../src/roads/standards/Criteria';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { CLASS_SECTIONS, SECTION_FOR_VOLUME, type ClassSection } from '../src/roads/standards/ClassSections';

const OUT = process.argv[2] ?? 'docs';
const DS = 10, MAXCUT = DESIGN.maxCut, MAXFILL = DESIGN.maxFill, CUT_SLOPE = DESIGN.cutSlope, FILL_SLOPE = DESIGN.fillSlope;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const V = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const P = JSON.parse(readFileSync(`${OUT}/centre_profile.json`, 'utf8'));
const F = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8'));
const clsOf = new Map<string, string>(F.lines.map((l: any) => [l.id, l.cls]));
const pvById = new Map<string, any>(V.lines.map((l: any) => [l.id, l]));

pr('STEP 21.5 CROSS-SECTION PER CLASS (headless; nothing in src/ is used by the game yet: NEW src/roads/standards/ClassSections.ts is pure data; my numbers, change them in that file)');
pr('');
pr('1. SECTION TABLE (metres from the centreline, ONE side, drive side LEFT; R6 = the built M6 section)');
for (const s of CLASS_SECTIONS) {
  pr(`   ${s.id.padEnd(8)} ${s.roadClass}  V${s.speed}  ${s.lanesPerDir} lane${s.lanesPerDir > 1 ? 's' : ''}/direction x ${f2(s.laneW)} m, median ${s.median ? f1(s.median) + ' m' : 'none'}, pavement ${f2(s.pavement)} m thick, cross fall ${f1(100 * s.crossFall)} %`);
  let at = 0; for (const e of s.elements) { pr(`        ${f2(at).padStart(6)} .. ${f2(at + e.width).padStart(6)}  ${f2(e.width).padStart(5)}  ${e.name}${e.note ? '  (' + e.note + ')' : ''}`); at += e.width; }
  pr(`        paved edge ${f2(s.pavementEdge)} m, formation (earthwork) half ${f2(s.formationHalf)} m, ROW half ${f2(s.rowHalf)} m  ->  carriageway kerb-to-kerb / edge-to-edge ${f1(2 * s.pavementEdge)} m, formation ${f1(2 * s.formationHalf)} m, ROW ${f1(2 * s.rowHalf)} m`);
  pr(`        drain: ${s.drain.kind}${s.drain.ditchW ? ' ' + s.drain.ditchW + ' m wide, ' + s.drain.ditchD + ' m deep' : ''}, min grade ${f1(100 * s.drain.minGrade)} %, outlet at least every ${s.drain.outletMax} m${s.drain.gullyEvery ? ', gully every ' + s.drain.gullyEvery + ' m' : ''}${s.drain.liningAbove ? ', ditch lined above ' + f0(100 * s.drain.liningAbove) + ' % grade' : ''}`);
}
pr('');
pr('2. CHECKS');
const by = new Map(CLASS_SECTIONS.map((s) => [s.id, s]));
const r6 = by.get('R6')!;
chk(Math.abs(r6.pavementEdge - SECTION_M6.pavementEdge) < 1e-9 && Math.abs(r6.rowHalf - SECTION_M6.rowHalf) < 1e-9 && Math.abs(r6.median - 4) < 1e-9, `R6 is the built M6 section: paved edge ${f2(r6.pavementEdge)} m (built ${f2(SECTION_M6.pavementEdge)}), ROW half ${f2(r6.rowHalf)} m (built ${f2(SECTION_M6.rowHalf)}), median 4.0 m`);
chk(CLASS_SECTIONS.every((s) => s.pavementEdge < s.formationHalf + 1e-9 && s.formationHalf < s.rowHalf), 'every section: paved edge < formation half < ROW half');
chk(CLASS_SECTIONS.every((s) => { const lanes = s.elements.find((e) => e.kind === 'lanes'); return !!lanes && Math.abs(lanes.width - s.lanesPerDir * s.laneW) < 1e-9; }), 'every section: lane element = lanes per direction x lane width');
chk(CLASS_SECTIONS.filter((s) => s.cls === 'R6' || s.cls === 'R4').every((s) => s.median >= 3 && Math.abs(s.elements[0].width * 2 - s.median) < 1e-9) && CLASS_SECTIONS.filter((s) => s.cls !== 'R6' && s.cls !== 'R4').every((s) => s.median === 0), 'median on R6 and R4 only (21.2 plan row), 3-6 m (handoff 7), none on R2 / C / L');
chk(CLASS_SECTIONS.filter((s) => s.variant === 'ZONE').every((s) => s.elements.some((e) => e.kind === 'footpath' && e.width >= 1.5)) && !r6.elements.some((e) => e.kind === 'footpath'), 'footpath (>= 1.5 m) on every ZONE section, none on R6 (motorway class)');
const rank = ['R6', 'R4-OPEN', 'R2-OPEN', 'C-ZONE', 'L-ZONE'].map((id) => by.get(id)!.pavementEdge);
chk(rank.every((v, i) => i === 0 || v < rank[i - 1]), `paved half width falls with the class: ${rank.map(f2).join(' > ')} m`);
chk(CLASS_SECTIONS.every((s) => Math.abs(s.drain.minGrade - DESIGN.maxGrade.minDrainage) < 1e-9 && Math.abs(s.crossFall - DESIGN.crown) < 1e-9), `drain minimum grade ${f1(100 * DESIGN.maxGrade.minDrainage)} % and cross fall ${f1(100 * DESIGN.crown)} % = DESIGN`);
chk(CLASS_SECTIONS.every((s) => (s.variant === 'OPEN') === (s.drain.kind === 'open ditch')), 'OPEN sections drain to a ditch, ZONE sections to kerb + gully');
pr('   (width per class, finished: R6 32.0 m paved, R4 open 23.0 / zone 20.0 + 2 x 2.5 footpath, R2 open 9.0 / zone 7.0 + 2 x 2.0 footpath, C 6.6 + 2 x 1.8, L 5.5 + 2 x 1.5; the old 21.4 volumes used 32 / 22 / 12 / 9 / 7 m)');

pr('');
pr('3. EARTHWORK WITH THE REAL FORMATION WIDTH (final 21.4c profile every 10 m, ground from 21.4; cut 1:' + CUT_SLOPE + ', fill 1:' + FILL_SLOPE + '; pavement thickness dug below / built above the finished surface;');
pr('   cut over ' + MAXCUT + ' m = tunnel-candidate, fill over ' + MAXFILL + ' m = viaduct, wet = bridge: counted in metres, no volume)');
function yAt(l: any, s: number): number {
  const pv: number[][] = l.pvi, cv: any[] = l.curves;
  for (let i = 1; i + 1 < pv.length; i++) { const c = cv[i - 1]; if (c.L > 0 && s >= pv[i][0] - c.L / 2 && s <= pv[i][0] + c.L / 2) { const g1 = (pv[i][1] - pv[i - 1][1]) / (pv[i][0] - pv[i - 1][0]), s0 = pv[i][0] - c.L / 2, y0 = pv[i][1] - g1 * c.L / 2; return y0 + g1 * (s - s0) + (c.A / 100) * (s - s0) ** 2 / (2 * c.L); } }
  let j = 0; while (j + 2 < pv.length && pv[j + 1][0] < s) j++; const t = (s - pv[j][0]) / (pv[j + 1][0] - pv[j][0]); return pv[j][1] + t * (pv[j + 1][1] - pv[j][1]);
}
const water = (l: any): number[] => l.w ?? [];
interface Tot { lines: number; km: number; cut: number; fill: number; tunnel: number; via: number; bridge: number; steep: number; lined: number; sections: string }
const tot = new Map<string, Tot>(); const perLine: any[] = [];
for (const pl of P.lines) {
  const cls = clsOf.get(pl.id); const vl = pvById.get(pl.id); if (!cls || !vl) continue; const sec = SECTION_FOR_VOLUME[cls]; if (!sec) continue;
  const W = 2 * sec.formationHalf; const T = tot.get(cls) ?? tot.set(cls, { lines: 0, km: 0, cut: 0, fill: 0, tunnel: 0, via: 0, bridge: 0, steep: 0, lined: 0, sections: sec.id }).get(cls)!;
  let s = 0, cutV = 0, fillV = 0, tun = 0, via = 0, lined = 0; const n = pl.x.length;
  const lim = sec.drain.liningAbove ?? 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pl.x[i] - pl.x[i - 1], pl.z[i] - pl.z[i - 1]); const ds = i === 0 || i === n - 1 ? DS / 2 : DS;
    const sc = Math.min(s, vl.pvi[vl.pvi.length - 1][0]); const y = yAt(vl, sc); const d = y - pl.g[i];
    const g1 = Math.abs(yAt(vl, Math.min(sc + 5, vl.pvi[vl.pvi.length - 1][0])) - yAt(vl, Math.max(sc - 5, 0))) / Math.max(1, Math.min(sc + 5, vl.pvi[vl.pvi.length - 1][0]) - Math.max(sc - 5, 0));
    if (g1 > lim) lined += ds;
    if (-d > MAXCUT) { tun += ds; continue; } if (d > MAXFILL) { via += ds; continue; }
    if (d < 0) { const dc = -d + sec.pavement; cutV += (dc * W + CUT_SLOPE * dc * dc) * ds; }
    else { const df = d - sec.pavement; if (df > 0) fillV += (df * W + FILL_SLOPE * df * df) * ds; else cutV += (sec.pavement - d) * W * ds; }
  }
  T.lines++; T.km += s / 1000; T.cut += cutV; T.fill += fillV; T.tunnel += tun; T.via += via; T.lined += lined; perLine.push({ id: pl.id, cls, section: sec.id, km: Math.round(s) / 1000, cutKm3: Math.round(cutV / 1e3), fillKm3: Math.round(fillV / 1e3), tunnel: tun, viaduct: via, lined });
}
let gc = 0, gf = 0;
for (const c of ['6', '4', '2', 'C', 'L']) { const T = tot.get(c); if (!T) continue; gc += T.cut; gf += T.fill; pr(`   class ${c.padEnd(2)} ${T.sections.padEnd(8)} ${String(T.lines).padStart(3)} lines ${f1(T.km).padStart(6)} km   cut ${f2(T.cut / 1e6)} Mm3   fill ${f2(T.fill / 1e6)} Mm3   tunnel-candidate ${f0(T.tunnel)} m   viaduct ${f0(T.via)} m   ditch lining needed ${f0(T.lined)} m`); }
pr(`   TOTAL cut ${f2(gc / 1e6)} Mm3, fill ${f2(gf / 1e6)} Mm3 (net ${f2((gc - gf) / 1e6)} Mm3: ${gc > gf ? 'surplus to spoil' : 'borrow needed'}); 21.4 used indicative widths on the free DP profile, this is the real width on the final 21.4c curves`);
{ let tt = 0, vv = 0; for (const T of tot.values()) { tt += T.tunnel; vv += T.via; } pr(`   (the biggest single lines are in docs/centre_sections.json, "lines"; structures on the 154 lines: ${f1(vv / 1000)} km of viaduct / ${f1(tt / 1000)} km tunnel-candidate, they go to 21.8)`); }

pr('');
pr('4. DRAINAGE OF THE FLAT TANGENTS (21.4c-r 3d: a tangent of 60 m or more with grade under 0.3 %). The pavement itself drains across (2 % cross fall); the LONGITUDINAL drain must not follow the flat road, it gets its own fall:');
const flatRows: any[] = [];
for (const q of (V.flat ?? []) as any[]) { const cls = clsOf.get(q.line)!; const sec = SECTION_FOR_VOLUME[cls]; const out = sec.drain.outletMax; const n = Math.max(1, Math.ceil(q.len / out)); const span = q.len / n; const fall = 0.005; const gain = span * fall;
  const row = { line: q.line, s: q.s, len: q.len, grade: q.g, section: sec.id, outlets: n - 1, span: Math.round(span), ditchFall: fall, depthGain: Math.round(gain * 100) / 100, ditchDepthMin: sec.drain.ditchD ?? 0, ditchDepthMax: Math.round(((sec.drain.ditchD ?? 0) + gain) * 100) / 100 }; flatRows.push(row);
  pr(`   ${q.line} s ${q.s} .. ${q.s + q.len} (${q.len} m, grade ${q.g} %): ${sec.drain.kind}; ${n - 1} cross-outlet${n - 1 === 1 ? '' : 's'} (cross culvert D600 or a pipe to the low side) so that the drain runs in spans of ${f0(span)} m with its own fall ${f1(100 * fall)} %: the ditch is ${sec.drain.ditchD ?? 0} m deep at the outlet and ${f2((sec.drain.ditchD ?? 0) + gain)} m at the top of each span; the median (R4) gets a slotted drain pipe D300 to the same outlets`);
  chk(span <= out + 1e-6 && fall >= 0.005 - 1e-9 && gain <= 1.0, `${q.line}: span ${f0(span)} m <= ${out} m, drain fall ${f1(100 * fall)} % (>= 0.5 %), ditch depth gain ${f2(gain)} m <= 1.0 m`); }
pr('   RULE for 21.6 (every line, not only these two): a ditch / gully line is graded to at least 0.5 % between outlets, outlets at every sag (low point of the profile) and at most every `outletMax` m; the ditch is lined (concrete) where the road grade is above the lining limit of its section (R6 4 %, R4 4 %, R2 5 %).');

pr('');
pr('5. WHAT 21.5 DOES NOT DO (goes to later steps)');
pr('   OPEN or ZONE per stretch = by zone use (R8) in 21.6; superelevation in curves (up to 8 %, rotate about the median edge on divided roads, runoff along the spiral, handoff 3.4) = in the build step 21.6 (the horizontal alignment of 21.3 gives R and spiral length);');
pr('   junction widening, turn pockets, bus bays, roundabout geometry = 21.7; bridge / viaduct / tunnel cross-sections = 21.8; markings, lamps, planting = 21.9.');
pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/STEP_21_5_OUTPUT.txt`, L.join('\r\n'));
writeFileSync(`${OUT}/centre_sections.json`, JSON.stringify({ note: 'STEP 21.5: class cross-sections (one side from the centreline), earthwork with real widths, flat-tangent drain design', sections: CLASS_SECTIONS, volumes: Object.fromEntries([...tot]), flat: flatRows, lines: perLine }));
if (fail) process.exitCode = 1;