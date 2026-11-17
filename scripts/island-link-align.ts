// STEP 17.1c (headless): CENTRELINE of the island link M6-1 as a real alignment: straight - spiral - arc - spiral - straight (ONE PI), from the ring S node
// (T of the J1-S arm, first tangent = the arrival direction of the arm, so the road continues the S axis without a kink) to the island centre.
// Design rules: R >= 1.5 x Rmin(V100) = 591 m, spiral Ls >= spiralLength(V100, R), first straight >= 300 m (weave desirable, 17.1b requirement),
// the curve ends >= 100 m before the water (alignment rule 8: no curve on a bridge approach), the rest to the island centre is ONE straight.
// Search: PI distance a (m from the node along the arm tangent) and R on a grid; best = the largest R that keeps the first straight >= 300 m and the curve end <= 450 m (the curve must stay on land before the shore).
// Run: npx tsx scripts/island-link-align.ts <out-dir>      writes island_link_align.json (for the picture) + prints the sheet.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import type { Pi } from '../src/roads/alignment/PiAlignment';
import { spiralLength } from '../src/roads/standards/Checks';
import { minRadius } from '../src/interchange/Standards';
import { DESIGN } from '../src/roads/standards/Criteria';
import { getWorldZoneAt } from '../src/city/WorldZones';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);
const rad = Math.PI / 180;
const FIRST = 300, ROW = SECTION_M6.rowHalf;
const I = Config.terrain.island;
const E = { x: I.x, z: I.z };
const arm = J1_ARM_DATA.find((a) => a.name === 'J1-S')!;
const n = arm.pts.length;
const S = { x: arm.pts[n - 1][0], z: arm.pts[n - 1][1] };
const h0 = Math.atan2(arm.pts[n - 1][1] - arm.pts[n - 4][1], arm.pts[n - 1][0] - arm.pts[n - 4][0]); // last 30 m of the arm = its last straight
const P: string[] = [];
const pr = (s = '') => { P.push(s); console.log(s); };
pr(`ISLAND LINK M6-1 CENTRELINE (Step 17.1c)   start = S node (${f1(S.x)}, ${f1(S.z)}), start heading = arm arrival ${f2(h0 / rad)} deg (atan2 dz,dx), end = island centre (${E.x}, ${E.z})`);

// ---- where is the water along the straight continuation of the arm (the line the road follows until its curve)?
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const gh = (x: number, z: number) => { gen.sampleGround(x, z, sc); return { h: sc.h, w: sc.water }; };
let waterA = NaN, waterB = NaN;
for (let s = 0; s < 1700; s += 5) { const q = gh(S.x + s * Math.cos(h0), S.z + s * Math.sin(h0)); const w = q.h < 0; if (w && Number.isNaN(waterA)) waterA = s; if (w) waterB = s; }
pr(`   the straight continuation of the arm is wet from s ${f0(waterA)} to s ${f0(waterB)} (shore to shore ${f0(waterB - waterA)} m)`);

const mk = (a: number, R: number, Ls: number): { al: ReturnType<typeof buildOpenAlignment>; pi: Pi } => {
  const pi: Pi = { x: S.x + a * Math.cos(h0), z: S.z + a * Math.sin(h0), R, Ls };
  return { al: buildOpenAlignment(S, [pi], E), pi };
};
interface Cand { opt: 'A' | 'B'; V: number; a: number; R: number; Ls: number; delta: number; ts: number; st: number; arc: number; fin: number; ok: boolean }
const MARGIN_A = 80, MARGIN_B = 100, FIN_B = 200;
const evalC = (opt: 'A' | 'B', Vd: number, a: number, R: number): Cand => {
  const Ls = spiralLength(Vd, R);
  const { al } = mk(a, R, Ls);
  const r = al.rows[0];
  const geo = al.straights.every((g) => g >= 0) && r.arcAngle >= 0.002;
  // A: curve on the land before the shore: first straight >= 300 m and curve end >= MARGIN_A before the water. B: curve on the island: starts >= MARGIN_B after the island shore, last straight to the island centre >= FIN_B.
  const ok = geo && (opt === 'A' ? al.straights[0] >= FIRST && r.st <= waterA - MARGIN_A : r.ts >= waterB + MARGIN_B && al.straights[1] >= FIN_B);
  return { opt, V: Vd, a, R, Ls, delta: r.delta, ts: r.ts, st: r.st, arc: r.arcAngle, fin: al.straights[1], ok };
};
const RA = Math.ceil(minRadius(100) * DESIGN.radiusMargin), RB = Math.ceil(minRadius(80) * DESIGN.radiusMargin);
const Rl = (R0: number) => [R0, 450, 600, 800, 1000, 1500, 2000, 3000].filter((v, i) => i === 0 || v > R0);
const all: Cand[] = [];
for (const R of Rl(RA)) for (let a = 250; a <= 700; a += 2.5) all.push(evalC('A', 100, a, R));
for (const R of Rl(RB)) for (let a = 800; a <= 1700; a += 5) all.push(evalC('B', 80, a, R));
pr(`\n1. TWO PLACES FOR THE ONE CURVE (per radius: flattest island ground, then the earliest curve end; Ls = spiralLength(V, R))`);
pr(`   A: curve on the LAND before the shore, V100, R >= ${RA} m, first straight >= ${FIRST} m, curve end >= ${MARGIN_A} m before the water (s ${f0(waterA)})`);
pr(`   B: curve on the ISLAND after the strait, V80, R >= ${RB} m, curve starts >= ${MARGIN_B} m after the island shore (s ${f0(waterB)}), last straight to the island centre >= ${FIN_B} m`);
// ground of the island part (s >= the island shore) of a candidate: steepest cross slope over the ROW and the length above 25 %
const OFF9 = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * ROW);
const islandCross = (c: Cand): { max: number; high: number } => {
  const { al: a2 } = mk(c.a, c.R, c.Ls);
  let max = 0, high = 0;
  for (let s = waterB + 10; s <= a2.length; s += 10) {
    const q = poseAt(a2, s), nx = -Math.sin(q.h), nz = Math.cos(q.h);
    const hs = OFF9.map((o) => gh(q.x + nx * o, q.z + nz * o).h);
    let cs = 0; for (let k = 1; k < hs.length; k++) cs = Math.max(cs, (Math.abs(hs[k] - hs[k - 1]) / (OFF9[k] - OFF9[k - 1])) * 100);
    max = Math.max(max, cs); if (cs > 25) high += 10;
  }
  return { max, high };
};
pr('   opt   R (m)   Ls (m)   a (m)   deflection   TS (m)   ST (m)   arc (m)   last straight   island cross slope max (m above 25 %)');
interface Res extends Cand { cmax: number; chigh: number }
const results: Res[] = [];
for (const opt of ['A', 'B'] as const) {
  const rs = [...new Set(all.filter((q) => q.opt === opt).map((q) => q.R))];
  for (const R of rs) {
    const feas = all.filter((q) => q.opt === opt && q.R === R && q.ok);
    if (!feas.length) { pr(`   ${opt}     ${String(R).padStart(5)}   no candidate fits`); continue; }
    // every 25 m of the PI distance (the grid step is 2.5 m for A and 5 m for B): the one with the flattest island ground, then the earliest curve end
    const pick = feas.filter((q, i) => i % 5 === 0 || i === feas.length - 1);
    let bestR: Res | undefined;
    for (const c of pick) {
      const g = opt === 'B' ? islandCross(c) : { max: 0, high: 0 };
      const r: Res = { ...c, cmax: g.max, chigh: g.high };
      if (!bestR || r.chigh < bestR.chigh || (r.chigh === bestR.chigh && r.cmax < bestR.cmax - 0.5) || (r.chigh === bestR.chigh && Math.abs(r.cmax - bestR.cmax) <= 0.5 && r.st < bestR.st)) bestR = r;
    }
    const c = bestR!;
    results.push(c);
    pr(`   ${opt}     ${String(R).padStart(5)}   ${String(c.Ls).padStart(5)}   ${f1(c.a).padStart(7)}   ${f2(Math.abs(c.delta) / rad).padStart(6)} deg   ${f0(c.ts).padStart(6)}   ${f0(c.st).padStart(6)}   ${f0(c.arc * c.R).padStart(6)}   ${f0(c.fin).padStart(7)} m   ${f0(c.cmax)} % (${f0(c.chigh)} m)`);
  }
}
// choice: option B if any B candidate has flat enough island ground (no stretch above 25 %), then the LARGEST radius among them (gentlest curve); else the B with the flattest ground; A only if B has nothing
const goodB = results.filter((q) => q.opt === 'B' && q.chigh === 0).sort((p, q) => q.R - p.R);
const anyB = results.filter((q) => q.opt === 'B').sort((p, q) => p.chigh - q.chigh || p.cmax - q.cmax);
const best: Res | undefined = goodB[0] ?? anyB[0] ?? results.filter((q) => q.opt === 'A').sort((p, q) => q.R - p.R)[0];
if (!best) { pr('NO FEASIBLE ALIGNMENT'); process.exit(1); }
pr(`\n   CHOICE: option ${best.opt} (${best.opt === 'B' ? 'curve on the island' : 'curve on the land'}), R ${best.R} m: ` + (best.opt === 'B' ? `the whole land part, the viaduct approaches and the strait bridge are ONE straight (the bridge may be made higher and longer in 17.1d without touching a curve, alignment rule 8), the first straight after the node is ${f0(best.ts)} m, the curve is on island ground at V80, the radius is the largest one whose island ground has no stretch above 25 % cross slope.` : 'B does not fit.'));
const Vd = best.V;
const { al, pi } = mk(best.a, best.R, best.Ls);
pr(`\n2. CHOSEN: option ${best.opt}, R ${best.R} m, Ls ${best.Ls} m, PI at ${f1(best.a)} m from the node: PI (${f1(pi.x)}, ${f1(pi.z)}), deflection ${f2(Math.abs(best.delta) / rad)} deg (${best.delta > 0 ? 'clockwise = turns to the west of south on this map' : 'anticlockwise'}), alignment length ${f0(al.length)} m (chord ${f0(Math.hypot(E.x - S.x, E.z - S.z))} m)`);
const r0 = al.rows[0];
pr(`   stations: first straight 0 - ${f0(r0.ts)} m | spiral in ${f0(r0.ts)} - ${f0(r0.sc)} | arc ${f0(r0.sc)} - ${f0(r0.cs)} (${f0(r0.cs - r0.sc)} m) | spiral out ${f0(r0.cs)} - ${f0(r0.st)} | last straight ${f0(r0.st)} - ${f0(al.length)} m (${f0(al.straights[1])} m)`);
pr(`   end heading ${f2((al.end.h / rad))} deg (the island centre node is built from it in 17.1f)`);

// ---- samples every 5 m
const NS = Math.ceil(al.length / 5), d5 = al.length / NS;
const sm = Array.from({ length: NS + 1 }, (_, i) => poseAt(al, Math.min(al.length, i * d5)));

// ---- ground along the REAL centreline and ROW
const OFF = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * ROW);
const railPts: { id: string; x: number; z: number }[] = [];
for (const e of gen.rail.edges) for (let j = 0; j < e.xs.length; j++) railPts.push({ id: e.id, x: e.xs[j], z: e.zs[j] });
interface Row { s: number; x: number; z: number; g: number; wet: number; cs: number }
const rows: Row[] = [];
let wetRuns: { a: number; b: number; deep: number }[] = [], cur: { a: number; b: number; deep: number } | null = null;
let crossMax = 0, crossHigh = 0, railMin = Infinity, railId = '', islandMax = -99; const edge = new Set<string>();
for (let i = 0; i <= NS; i += 2) {
  const q = sm[i], s = i * d5, nx = -Math.sin(q.h), nz = Math.cos(q.h);
  const hs = OFF.map((o) => gh(q.x + nx * o, q.z + nz * o));
  const c = hs[4]; const wet = c.h < 0 || (!Number.isNaN(c.w) && c.h < c.w - 0.05);
  if (wet) { if (!cur) cur = { a: s, b: s, deep: 0 }; cur.b = s; cur.deep = Math.max(cur.deep, (Number.isNaN(c.w) ? 0 : c.w) - c.h); } else if (cur) { wetRuns.push(cur); cur = null; }
  let cs = 0; for (let k = 1; k < hs.length; k++) cs = Math.max(cs, (Math.abs(hs[k].h - hs[k - 1].h) / (OFF[k] - OFF[k - 1])) * 100);
  crossMax = Math.max(crossMax, cs); if (cs > 25) crossHigh += 2 * d5;
  if (Math.hypot(q.x - I.x, q.z - I.z) < I.radius * 1.1 && c.h > 0.6) islandMax = Math.max(islandMax, c.h);
  for (const o of [-ROW, ROW]) { const zh = getWorldZoneAt(q.x + nx * o, q.z + nz * o); if (['airport', 'seaport', 'army', 'engineering'].includes(zh.kind)) edge.add(`${zh.id} (${zh.kind})`); }
  for (const r of railPts) { const d = Math.hypot(r.x - q.x, r.z - q.z); if (d < railMin) { railMin = d; railId = r.id; } }
  rows.push({ s, x: q.x, z: q.z, g: c.h, wet: wet ? 1 : 0, cs });
}
if (cur) wetRuns.push(cur);
const wetLen = wetRuns.reduce((q, r) => q + (r.b - r.a + 2 * d5), 0), deepest = Math.max(0, ...wetRuns.map((r) => r.deep));
pr(`\n3. GROUND ALONG THE REAL CENTRELINE AND THE ROW +-${f2(ROW)} m (natural ground, every ${f1(2 * d5)} m)`);
pr(`   wet: ${wetRuns.length} run(s) ${wetRuns.map((r) => `s ${f0(r.a)}-${f0(r.b)}`).join(', ')}, about ${f0(wetLen)} m, deepest ${f1(deepest)} m; island ground max ${f1(islandMax)} m; steepest cross slope ${f0(crossMax)} % (${f0(crossHigh)} m above 25 %); nearest rail ${f0(railMin)} m (${railId}); facility land at the ROW edge: ${[...edge].join(', ') || 'none'}`);

// ---- checks
let pass = 0, fail = 0;
const chk = (name: string, ok: boolean, info: string) => { if (ok) pass++; else fail++; pr(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(86)} ${info}`); };
pr('\n4. CHECKS');
chk(`R >= 1.5 x Rmin of V${Vd} = ${Math.ceil(minRadius(Vd) * DESIGN.radiusMargin)} m`, best.R >= Math.ceil(minRadius(Vd) * DESIGN.radiusMargin), `R ${best.R} m`);
chk(`spiral Ls >= spiralLength(V${Vd}, R)`, best.Ls >= spiralLength(Vd, best.R), `Ls ${best.Ls} m, needed ${spiralLength(Vd, best.R)} m`);
chk('first straight after the node >= 300 m (17.1b requirement)', al.straights[0] >= FIRST - 1e-6, `${f0(al.straights[0])} m`);
chk('start heading = arrival heading of the J1-S arm (no kink at the node)', Math.abs(al.start.h - h0) < 1e-9, `${f2(al.start.h / rad)} deg`);
chk('dead reckoning reaches the island centre (position and heading)', al.endGap < 0.01 && Math.abs(al.endHeadingGapDeg) < 0.01, `gap ${al.endGap.toExponential(1)} m, ${al.endHeadingGapDeg.toExponential(1)} deg`);
const waterStart = wetRuns.length ? wetRuns[0].a : NaN, waterEnd = wetRuns.length ? wetRuns[wetRuns.length - 1].b : NaN;
if (best.opt === 'B') chk('no curve on the land, the viaduct approaches or the strait: the curve starts >= 100 m after the island shore (rule 8)', r0.ts - waterEnd >= 100, `water ends s ${f0(waterEnd)}, curve starts s ${f0(r0.ts)}: ${f0(r0.ts - waterEnd)} m`);
else chk('curve ends >= 80 m before the water', waterStart - r0.st >= 80, `curve ends s ${f0(r0.st)}, water starts s ${f0(waterStart)}`);
chk('last straight to the island centre >= 200 m (approach of the island centre node)', al.straights[1] >= FIN_B, `${f0(al.straights[1])} m`);
let maxStep = 0, maxDk = 0;
for (let i = 1; i < sm.length; i++) { let dh = sm[i].h - sm[i - 1].h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); maxStep = Math.max(maxStep, Math.abs(dh)); maxDk = Math.max(maxDk, Math.abs(sm[i].k - sm[i - 1].k)); }
const dkBound = 1 / (best.R * best.Ls) * d5;
chk('smooth: curvature continuous, change per 5 m <= 1/(R Ls) x 5 m', maxDk <= dkBound * 1.05 + 1e-9, `max heading step ${f2((maxStep * 180) / Math.PI)} deg per 5 m, max dk per 5 m ${maxDk.toExponential(2)}, bound ${dkBound.toExponential(2)}`);
chk('the strait is ONE crossing', wetRuns.length === 1, `${wetRuns.length} run(s)`);
chk('deepest water <= 15 m (normal bridge foundations)', deepest <= 15, `${f1(deepest)} m`);
chk('no steep ground (cross slope > 25 %) inside the ROW', crossHigh === 0, `steepest ${f0(crossMax)} %`);
chk('no rail within ROW + 50 m', railMin >= ROW + 50, `${f0(railMin)} m (${railId})`);
chk('no airport / seaport / army / engineering land at the ROW edge', edge.size === 0, [...edge].join(', ') || 'none');
chk('island ground on the centreline <= 40 m', islandMax <= 40, `${f1(islandMax)} m`);
pr(`\n  ${pass} PASS, ${fail} FAIL`);
pr('  NOT done here: vertical profile (17.1d), structures (17.1e), the node geometry (9.2 / 17.4c), the island centre node (17.1f), game build (17.1g). tsc / npm run build NOT run, game NOT looked at.');

writeFileSync(`${out}/STEP171C_OUTPUT.txt`, P.join('\n') + '\n');
writeFileSync(`${out}/island_link_align.json`, JSON.stringify({
  start: S, startHeadingDeg: h0 / rad, end: E, endHeadingDeg: al.end.h / rad, pis: al.pis, rows: al.rows, straights: al.straights, length: al.length, rowHalf: ROW,
  chosen: best, waterStart, wetRuns, crossMax, railMin, islandMax,
  samples: sm.map((q, i) => [Math.round(i * d5 * 10) / 10, Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100, Math.round(((q.h * 180) / Math.PI) * 1000) / 1000, Math.round(q.k * 1e7) / 1e7]),
  ground: rows.map((r) => [Math.round(r.s * 10) / 10, Math.round(r.g * 100) / 100, r.wet]),
}));
pr(`wrote ${out}/island_link_align.json and ${out}/STEP171C_OUTPUT.txt`);
