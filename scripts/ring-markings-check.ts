// STEP 4.5 (headless, pure math): markings data of the ring (M8) and its checks.
// Run: npx tsx scripts/ring-markings-check.ts [inspiral|straights]     (same runout modes as 4.2 / 4.3)
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { buildAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
import { buildMarkingLines, closedDashes, gorePlaceholders, MARKING } from '../src/roads/section/Markings';
import { tiltAt, DEFAULT_TILT, type RunoutMode } from '../src/roads/section/Ribbons';

const mode = (process.argv[2] ?? 'inspiral') as RunoutMode;
const P = { ...DEFAULT_TILT, mode };
let fails = 0;
const L = (s = '') => console.log(s);
const f = (v: number, d = 2) => v.toFixed(d);
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; L(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(62)} ${detail}`); }

const al = buildAlignment([...RING_PIS]);
const len = al.length;
const turnSign = al.rows.reduce((a, r) => a + r.delta, 0) > 0 ? 1 : -1;
const lines = buildMarkingLines(S);
L(`=== 4.5 RING MARKINGS DATA (M8, 4 lanes per direction, runout ${mode}) ===`);
L('  PROPOSAL values (the handoff has none): line width 0.15 m, dash 3 m + gap 9 m, white lane / outer edge lines, yellow edge line next to the median');
L('\n  id            kind                    side  colour  style   centre offset  width  paint from-to');
for (const m of lines) L(`  ${m.id.padEnd(13)} ${m.kind.padEnd(23)} ${m.sigma > 0 ? '+n ' : '-n '}   ${m.color.padEnd(6)}  ${m.style.padEnd(6)} ${f(m.offset, 3).padStart(10)} m ${f(m.width).padStart(6)}  ${f(m.offset - m.width / 2, 3)}-${f(m.offset + m.width / 2, 3)}`);

L('\n=== Checks ===');
const perSide = lines.filter((m) => m.sigma === 1);
check('lines per carriageway: 2 edge lines + 3 lane lines (4 lanes)', perSide.length === 5 && perSide.filter((m) => m.kind === 'lane-line').length === S.lanesPerDir - 1, `${perSide.length} per side, ${lines.length} in all`);
const lanes = S.elements.find((e) => e.kind === 'lanes')!;
const laneLines = perSide.filter((m) => m.kind === 'lane-line').map((m) => m.offset);
const gaps = [lanes.from, ...laneLines, lanes.to].map((v, i, a) => (i ? v - a[i - 1] : 0)).slice(1);
check('lane lines split the 14.6 m into 4 lanes of exactly 3.65 m', gaps.every((g) => Math.abs(g - 3.65) < 1e-9), gaps.map((g) => f(g)).join(' + ') + ' m');
// every painted band lies inside ONE ribbon element (no line crosses a slope break), edge lines inside the shoulders
let spans = 0, crossing = 0;
const breaks = S.elements.map((e) => e.from).concat(S.elements[S.elements.length - 1].to);
for (const m of lines) { const a = m.offset - m.width / 2, b = m.offset + m.width / 2; spans++; if (breaks.some((x) => x > a + 1e-9 && x < b - 1e-9)) crossing++; }
check('no line crosses a ribbon boundary (slope break)', crossing === 0, `${spans} lines checked`);
const sIn = S.elements.find((e) => e.kind === 'shoulder-in')!, sOut = S.elements.find((e) => e.kind === 'shoulder-out')!;
const eMed = lines.find((m) => m.kind === 'edge-line-median-side')!, eOut = lines.find((m) => m.kind === 'edge-line-outer')!;
check('edge lines lie in the paved shoulders', eMed.offset - eMed.width / 2 >= sIn.from && eMed.offset + eMed.width / 2 <= sIn.to && eOut.offset - eOut.width / 2 >= sOut.from && eOut.offset + eOut.width / 2 <= sOut.to, `median-side ${f(eMed.offset, 3)} m in ${f(sIn.from, 1)}-${f(sIn.to, 1)}, outer ${f(eOut.offset, 3)} m in ${f(sOut.from, 1)}-${f(sOut.to, 1)}`);
check('edge line touches the lane edge (no gap, no paint on the lane)', Math.abs(eMed.offset + eMed.width / 2 - lanes.from) < 1e-9 && Math.abs(eOut.offset - eOut.width / 2 - lanes.to) < 1e-9, `lane edges ${f(lanes.from, 1)} and ${f(lanes.to, 1)} m`);

L('\n  Dashed lines on the closed ring: every line has its own length (ring length -+ 2 pi x offset), so the pitch is stretched to close the pattern');
L('  line          length m   dashes   pitch m   dash m   stretch');
let worst = 0;
for (const m of lines.filter((x) => x.style === 'dashed')) {
  const inner = m.sigma === turnSign;
  const Ll = len + (inner ? -1 : 1) * 2 * Math.PI * m.offset;
  const d = closedDashes(Ll, m.pitch!, m.dash!);
  worst = Math.max(worst, Math.abs(d.stretch));
  L(`  ${m.id.padEnd(12)} ${f(Ll, 1).padStart(9)} ${String(d.count).padStart(8)} ${f(d.pitch, 3).padStart(9)} ${f(d.dash, 3).padStart(8)} ${(d.stretch * 100 >= 0 ? '+' : '') + f(d.stretch * 100, 2)} %`);
}
check('dash pitch stays within 2 % of 12 m on every lane line', worst <= 0.02, `worst ${f(worst * 100, 2)} %`);

L('\n  Gore marking placeholders at the four radial meeting points (windows need constant cross fall: no tilt change inside)');
for (const g of gorePlaceholders(RING_RADIAL_JOINS)) {
  const w = Math.max(g.exitWindow, g.entryWindow);
  let steady = true, eMin = 1, eMax = -1;
  for (let s = g.station - w; s <= g.station + w; s += 5) { const e = tiltAt(al, ((s % len) + len) % len, P).eOuter; eMin = Math.min(eMin, e); eMax = Math.max(eMax, e); if (Math.abs(e - -P.crown) > 1e-9) steady = false; }
  check(`${g.dir} station ${g.station}: +-${w} m (exit ${g.exitWindow}, entry ${g.entryWindow}) on a constant normal crown`, steady, steady ? 'yes' : `tilt changes inside the window (${f(eMin * 100, 1)} % to ${f(eMax * 100, 1)} %)`);
}
void MARKING;
L(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
