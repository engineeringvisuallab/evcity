// STEP G5 (headless): (1) crossings of R6 lines with the 8-lane roads become INTERCHANGE PLACEHOLDERS JX-n (user 2026-11-15: 'onek jaiga 6/4 lane road ring k interchange diye cross korbe, ring-e junction hobe'),
// the lines are NOT cut; (2) fix the 3 FAIL lines of G4 (L62, L27, L59): wider corridor re-route, then trim of a bad end, else keep and report; (3) smooth every line whose radius is under 229 m (L48, L23 first).
// Reads docs/r6_g4_lines.json, writes docs/r6_g5_lines.json (final line set + placeholders) and docs/STEP_R6_G5_OUTPUT.txt. Changes nothing in src/.
// Run: npx tsx scripts/r6-g5.ts [dir]
import { readFileSync, writeFileSync } from 'node:fs';
import { solveLine, resample, f0, f1, LIM, MAXCUT, type Src, type Res } from './r6-profile-lib';
import { route, smooth, minRadius, RMIN } from './r6-route-lib';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';

const dir = process.argv[2] ?? 'docs';
const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const SHORT_BRIDGE = 120, WIDE = 800, TRIM_MAX = 0.4, POLISH_SHIFT = 80, POLISH_SHIFT_BIG = 150, SMOOTH_FIRST = [48, 23];
const PLAZA_EDGE_S = 900;   // R5: 600 m from the J1 plaza edge (plaza R 300 m) = 900 m from the J1 centre
const TAP_SPACING = 1600;   // R5: 1600 m between taps / joins on an 8-lane road

type L = { id: number; origin: string; how: string; pts: number[][] };
const G4 = JSON.parse(readFileSync(`${dir}/r6_g4_lines.json`, 'utf8')) as { lines: { src_id: number; origin: string; how: string; pts: number[][] }[] };
let lines: L[] = G4.lines.map((l) => ({ id: l.src_id, origin: l.origin, how: l.how, pts: l.pts }));
const toSrc = (l: L): Src => ({ id: l.id, origin: l.origin, pts: l.pts, minR: null });

// ---- pass rule = G4 rule: grade <= 4 %, cut <= 12 m, no high fill, a short wet run (<= 120 m) is accepted as a bridge (NOT designed)
const solve = (l: L): Res => {
  const r = solveLine(toSrc(l));
  if (r.gradeOK && r.wetLen > 0 && r.wetLen <= SHORT_BRIDGE && r.highFillLen === 0 && r.maxCut <= MAXCUT + 1e-6) { r.workOK = true; r.pass = true; r.reasons = [`SHORT BRIDGE ${f0(r.wetLen)} m accepted, NOT designed`]; }
  return r;
};
const cfm = (r: Res) => (r.cutVol + r.fillVol) / r.len;
const bad = (r: Res) => (r.pass ? 0 : 500) + r.structLen * 5 + Math.max(0, r.maxCut - 8) * 50 + Math.max(0, cfm(r) - 100) * 5 + r.over3 * 0.05;
const radius = (pts: number[][]) => { const r = resample(pts); const n = Math.max(2, Math.round(r.len / 20)); const q: number[][] = []; for (let i = 0; i <= n; i++) { const k = (i / n) * (r.x.length - 1), a = Math.floor(k), b = Math.min(r.x.length - 1, a + 1), f = k - a; q.push([r.x[a] + (r.x[b] - r.x[a]) * f, r.z[a] + (r.z[b] - r.z[a]) * f]); } return minRadius(q); };
const cutPts = (pts: number[][], s0: number, s1: number): number[][] => { const r = resample(pts); const out: number[][] = []; for (let i = 0; i < r.x.length; i++) { const s = i * r.ds; if (s >= s0 - 1e-6 && s <= s1 + 1e-6) out.push([+r.x[i].toFixed(1), +r.z[i].toFixed(1)]); } return out; };
const len = (pts: number[][]) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

pr('R6 STEP G5: interchange placeholders, FAIL lines, smoothness. Numbers + files only, NO src/ change, game / tsc / build NOT run.');
pr(`Start = G4 line set: ${lines.length} lines, ${f1(lines.reduce((q, l) => q + len(l.pts), 0) / 1000)} km.`);

// ================= PART A: FAIL lines =================
const before = new Map<number, Res>(); for (const l of lines) before.set(l.id, solve(l));
const failIds = lines.filter((l) => !before.get(l.id)!.pass).map((l) => l.id);
pr(); pr(`PART A: FAIL lines of G4 = ${failIds.map((i) => 'L' + i).join(', ') || 'none'}. Methods in order: (1) re-route with a ${WIDE} m corridor (ends fixed, G4 method), (2) trim a bad end (up to ${TRIM_MAX * 100} % of the line), (3) keep and report.`);
for (const id of failIds) {
  const i = lines.findIndex((l) => l.id === id), old = lines[i], r0 = before.get(id)!;
  const cands: { how: string; l: L }[] = [];
  const path = route(toSrc(old), WIDE);
  if (path) { const sm = smooth(path, old.pts, 120); cands.push({ how: `re-routed ${WIDE} m corridor, shift ${f0(sm.shift)} m, min radius ${f0(sm.minR)} m`, l: { ...old, origin: 'G5 re-routed', pts: sm.pts } }); }
  const L0 = len(old.pts);
  for (const [a, b] of [[0.05, 0], [0.1, 0], [0.15, 0], [0.2, 0], [0.3, 0], [0.4, 0], [0, 0.05], [0, 0.1], [0, 0.15], [0, 0.2], [0, 0.3], [0, 0.4]]) {
    const pts = cutPts(old.pts, a * L0, L0 * (1 - b)); if (pts.length < 4) continue;
    cands.push({ how: `trimmed ${a ? 'start' : 'end'} by ${f0((a || b) * L0)} m (the line then ends free there)`, l: { ...old, origin: 'G5 trimmed', pts } });
  }
  let best: { how: string; l: L; r: Res } | null = null;
  for (const c of cands) { let r: Res; try { r = solve(c.l); } catch { continue; } const lenLoss = (L0 - len(c.l.pts)) / L0; const score = bad(r) + lenLoss * 300; if (!best || score < best.r.len * 0 + (bad(best.r) + ((L0 - len(best.l.pts)) / L0) * 300)) best = { ...c, r }; }
  pr(`  L${id}: old ${r0.pass ? 'PASS' : 'FAIL'} (${r0.reasons.join('; ')}), ${f0(r0.len)} m`);
  if (best && best.r.pass) { const e0 = old.pts[0], e1 = old.pts[old.pts.length - 1], n0 = best.l.pts[0], n1 = best.l.pts[best.l.pts.length - 1]; lines[i] = { ...best.l, how: best.how }; pr(`     ends old (${f0(e0[0])}, ${f0(e0[1])}) -> (${f0(e1[0])}, ${f0(e1[1])}); new (${f0(n0[0])}, ${f0(n0[1])}) -> (${f0(n1[0])}, ${f0(n1[1])})`); pr(`     -> FIXED by ${best.how}: PASS, cut ${f1(best.r.maxCut)} m, grade ${f1(best.r.maxG)} %, wet ${f0(best.r.wetLen)} m, length ${f0(best.r.len)} m (was ${f0(L0)} m)`); }
  else { pr(`     -> NOT FIXED by re-route or trim${best ? ` (best try: ${best.how}: ${best.r.reasons.join('; ')})` : ''}. Line kept as in G4. User choice: accept the structure (viaduct / bridge) or drop the line. ASK.`); }
}

// ================= PART B: smoothness =================
pr(); pr(`PART B: smoothness R3. Radius recomputed on every line (20 m points, 60 m chord), V80 minimum ${RMIN} m. Lines under ${RMIN} m are smoothed (ends fixed, shift <= ${POLISH_SHIFT} m, ${POLISH_SHIFT_BIG} m for ${SMOOTH_FIRST.map((i) => 'L' + i).join(', ')}) and kept only if the profile result is not worse.`);
const rowsB: string[] = [];
for (const l of lines) {
  const R0 = radius(l.pts); if (R0 >= RMIN) continue;
  const caps = SMOOTH_FIRST.includes(l.id) ? [POLISH_SHIFT_BIG, 200, 300] : [POLISH_SHIFT];
  const ro = solve(l); let pick: { sm: ReturnType<typeof smooth>; cand: L; rn: Res; cap: number } | null = null; let tried = '';
  for (const cap of caps) {
    const sm = smooth(l.pts, l.pts, cap), cand: L = { ...l, pts: sm.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) }, rn = solve(cand);
    tried += ` cap ${cap} m: R ${f0(sm.minR)} m ${rn.pass ? 'PASS' : 'FAIL'} cut ${f1(rn.maxCut)} wet ${f0(rn.wetLen)};`;
    if (bad(rn) <= bad(ro) + 1e-6 && sm.minR > R0 + 1 && (!pick || sm.minR > pick.sm.minR)) pick = { sm, cand, rn, cap };
    if (pick && pick.sm.minR >= RMIN) break;
  }
  rowsB.push(`  L${l.id}: radius ${f0(R0)} m; old profile ${ro.pass ? 'PASS' : 'FAIL'} cut ${f1(ro.maxCut)} wet ${f0(ro.wetLen)};${tried} -> ${pick ? 'SMOOTHED to R ' + f0(pick.sm.minR) + ' m (shift ' + f0(pick.sm.shift) + ' m, cap ' + pick.cap + ' m)' + (pick.sm.minR < RMIN ? ' STILL BELOW ' + RMIN : '') : 'kept as it was (no smoothing keeps the profile as good)'}`);
  if (pick) { l.pts = pick.cand.pts; l.how += `; smoothed R ${f0(R0)} -> ${f0(pick.sm.minR)}`; }
}
for (const r of rowsB) pr(r); if (!rowsB.length) pr('  every line already has R >= ' + RMIN + ' m');

// ================= PART C: 8-lane crossings = interchange placeholders =================
const ringS = sampleAlignment(buildAlignment([...RING_PIS]), 5).samples.map((q) => [q.x, q.z]);
const eight: { name: string; pts: number[][]; arm: boolean; s0: number[] }[] = [
  { name: 'ring', pts: [...ringS, ringS[0]], arm: false, s0: [] },
  ...J1_ARM_DATA.map((a) => ({ name: a.name, pts: a.pts, arm: true, s0: a.s })),
];
const segX = (a: number[], b: number[], c: number[], d: number[]): { p: number[]; t: number; q: number } | null => {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, q = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && q >= 0 && q <= 1 ? { p: [a[0] + r[0] * t, a[1] + r[1] * t], t, q } : null;
};
interface JX { n: number; road: string; line: number; x: number; z: number; kind: 'cross' | 'end-touch'; sRoad: number; }
const jx: JX[] = [];
const cumLen = (pts: number[][]) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
for (const l of lines) for (const e of eight) {
  const cum = cumLen(e.pts), A = l.pts[0], Z = l.pts[l.pts.length - 1];
  for (let i = 0; i + 1 < l.pts.length; i++) for (let j = 0; j + 1 < e.pts.length; j++) {
    const h = segX(l.pts[i], l.pts[i + 1], e.pts[j], e.pts[j + 1]); if (!h) continue;
    const dEnd = Math.min(Math.hypot(h.p[0] - A[0], h.p[1] - A[1]), Math.hypot(h.p[0] - Z[0], h.p[1] - Z[1]));
    const sArm = e.arm ? e.s0[j] + (e.s0[j + 1] - e.s0[j]) * h.q : cum[j] + (cum[j + 1] - cum[j]) * h.q;
    if (jx.some((q) => q.road === e.name && q.line === l.id && Math.hypot(q.x - h.p[0], q.z - h.p[1]) < 30)) continue;
    jx.push({ n: 0, road: e.name, line: l.id, x: h.p[0], z: h.p[1], kind: dEnd <= 40 ? 'end-touch' : 'cross', sRoad: sArm });
  }
}
jx.sort((a, b) => a.road.localeCompare(b.road) || a.sRoad - b.sRoad); jx.forEach((q, i) => (q.n = i + 1));
const ringLen = cumLen(eight[0].pts).slice(-1)[0];
pr(); pr(`PART C: 8-lane crossings (ring + 4 J1 arms from the game data). User rule 2026-11-15: a 6 / 4-lane road MAY cross the ring through an INTERCHANGE, the ring gets a junction there. So a crossing is NOT cut: it becomes a placeholder JX-n on the 8-lane road, the line goes on.`);
pr(`${jx.length} placeholders (${jx.filter((q) => q.kind === 'cross').length} crossings, ${jx.filter((q) => q.kind === 'end-touch').length} end-touches). s = metres from the J1 centre on an arm (arm starts at 315 m), metres along the ring polyline (length ${f0(ringLen)} m, start = first RING_PIS sample) on the ring.`);
pr('  JX    road   line   kind        at (x, z)            s road   gap to previous JX on same road   R5 notes');
let prev: JX | null = null; let r5bad = 0;
for (const q of jx) {
  if (!prev || prev.road !== q.road) prev = null;
  const gap = prev ? q.sRoad - prev.sRoad : NaN, notes: string[] = [];
  if (q.road !== 'ring' && q.sRoad < PLAZA_EDGE_S) notes.push(`< ${PLAZA_EDGE_S} m from J1 centre (600 m from the plaza edge NOT met)`);
  if (prev && gap < TAP_SPACING) notes.push(`gap < ${TAP_SPACING} m (tap spacing NOT met)`);
  if (notes.length) r5bad++;
  pr(`  JX-${String(q.n).padEnd(3)} ${q.road.padEnd(5)}  L${String(q.line).padEnd(3)} ${q.kind.padEnd(10)} (${f0(q.x).padStart(6)}, ${f0(q.z).padStart(6)})  ${f0(q.sRoad).padStart(6)}   ${Number.isNaN(gap) ? '      -' : f0(gap).padStart(7)}   ${notes.join('; ')}`);
  prev = q;
}
pr(`R5 spacing list (NOT a verdict, the user judges it; the user said interchanges on the ring are wanted): ${r5bad} of ${jx.length} placeholders break the 600 m / 1600 m numbers of R5. The ring x arm joins (ring ends of the arms) take no road: JX near them is listed above by its s.`);
pr('R1 now: a crossing with an 8-lane road is allowed ONLY as a JX interchange (the 3 old crossings L13 x J1-S, L27 x J1-E, L33 x J1-E are JX placeholders now); a crossing with any other road still needs its own junction.');

// ================= final check =================
pr(); pr('FINAL CHECK of the G5 line set (same solver and rules as G4)');
const res = lines.map(solve);
const pass = res.filter((r) => r.pass), failL = res.filter((r) => !r.pass);
pr(`  lines ${lines.length}, ${f1(res.reduce((q, r) => q + r.len, 0) / 1000)} km (G4: 38 lines, 21.2 km); PASS ${pass.length} (${f1(pass.reduce((q, r) => q + r.len, 0) / 1000)} km), FAIL ${failL.length}${failL.length ? ' (' + failL.map((r) => 'L' + r.id + ': ' + r.reasons.join('; ')).join(' | ') + ')' : ''}`);
pr(`  R11 grade <= ${LIM} %: ${res.every((r) => r.gradeOK) ? 'PASS' : 'FAIL'} on ${res.filter((r) => r.gradeOK).length} / ${res.length}, steepest ${f1(Math.max(...res.map((r) => r.maxG)))} %`);
const rr = lines.map((l) => ({ id: l.id, R: radius(l.pts) })); const lowR = rr.filter((q) => q.R < RMIN);
pr(`  R3 radius >= ${RMIN} m (recomputed on all ${lines.length} lines): ${lowR.length === 0 ? 'PASS' : 'FAIL'}${lowR.length ? ' ' + lowR.map((q) => 'L' + q.id + ' ' + f0(q.R) + ' m').join(', ') : ''}; smallest ${f0(Math.min(...rr.map((q) => q.R)))} m. L48 ${f0(rr.find((q) => q.id === 48)?.R ?? 0)} m, L23 ${f0(rr.find((q) => q.id === 23)?.R ?? 0)} m.`);
let xs = 0; const xl: string[] = [];
for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) for (let i = 0; i + 1 < lines[a].pts.length; i++) for (let j = 0; j + 1 < lines[b].pts.length; j++) {
  const h = segX(lines[a].pts[i], lines[a].pts[i + 1], lines[b].pts[j], lines[b].pts[j + 1]); if (!h) continue;
  const ne = (l: L) => Math.min(Math.hypot(h.p[0] - l.pts[0][0], h.p[1] - l.pts[0][1]), Math.hypot(h.p[0] - l.pts[l.pts.length - 1][0], h.p[1] - l.pts[l.pts.length - 1][1]));
  if (ne(lines[a]) > 40 && ne(lines[b]) > 40) { xs++; xl.push(`L${lines[a].id} x L${lines[b].id} at (${f0(h.p[0])}, ${f0(h.p[1])})`); }
}
pr(`  R1 among the R6 lines: ${xs === 0 ? 'PASS' : 'FAIL'} (${xs} crossings${xs ? ': ' + xl.join(', ') : ''})`);
pr('  R2 NOT RUN (no AADT). Rail crossings NOT checked. Line ends are free, vertical curves NOT RUN, natural ground only (same limits as G3 / G4).');
pr('  game run, in-game drive, npm run build, tsc: NOT RUN (nothing in src/ changed; this chat has no network).');
writeFileSync(`${dir}/r6_g5_lines.json`, JSON.stringify({ note: 'G5 R6 line set + interchange placeholders JX on the 8-lane roads; pts = world metres [x, z]', lines: lines.map((l) => ({ src_id: l.id, origin: l.origin, how: l.how, min_radius_m: Math.round(radius(l.pts)), pts: l.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) })), jx: jx.map((q) => ({ n: q.n, road: q.road, line: q.line, x: +q.x.toFixed(1), z: +q.z.toFixed(1), kind: q.kind, s_road: +q.sRoad.toFixed(0) })) }));
writeFileSync(`${dir}/STEP_R6_G5_OUTPUT.txt`, P.join('\n') + '\n');
