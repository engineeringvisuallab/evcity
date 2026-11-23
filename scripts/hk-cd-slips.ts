// STEP HK-5c (second run, 8-lane arm / ring + 6-lane link): slips and C-D roads with TWO offsets. DATA ONLY, no src change.
// Run after hk-loops-a.ts and hk-loops-b.ts: npx tsx scripts/hk-cd-slips.ts -> docs/HK_CD_SLIPS.txt, docs/hk_cd_slips.json
import { readFileSync, writeFileSync } from 'node:fs';
import { CRITERIA, accelLength, decelLength } from '../src/interchange/Standards';
const out: string[] = []; let fails = 0, warns = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const chk = (ok: boolean, n: string, d: string, warn = false): void => { if (!ok) { if (warn) warns++; else fails++; } say(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${n.padEnd(70)} ${d}`); };
const f1 = (x: number): string => x.toFixed(1);
const A = JSON.parse(readFileSync('docs/hk_loops_a.json', 'utf8')), B = JSON.parse(readFileSync('docs/hk_loops_b.json', 'utf8')); const R: number = A.R, V: number = A.V;
// real widths (SectionTable.ts): M8 arm / ring half 22.1, V100, kerb lane centre 17.3 (HK-3, ASSUMED from half - 3 - 1.825); M6 link half 16.0 (lane 3.5 x 3 + median 2 + shoulders 1.0 + 2.5), V80, kerb lane centre 16.0 - 2.5 - 1.75 = 11.75
const N = { name: 'arm (8 lane, V100)', half: 22.1, kerb: 17.3, V: 100 }, Sd = { name: 'link (6 lane, V80)', half: 16.0, kerb: 11.75, V: 80 };
const sep = 3, rampHalf = 4.2, MINGAP = 14, SLIP_R = 110, SLIP_V = 50, lead = 60, ringKerb = 17.3;
const off = (r: typeof N): number => r.half + sep + rampHalf, shiftOf = (r: typeof N): number => off(r) - r.kerb;
const trans = (r: typeof N): { exit: number; entry: number } => ({ exit: Math.ceil(Math.max(decelLength(r.V, 50), 15 * shiftOf(r)) / 10) * 10, entry: Math.ceil(Math.max(accelLength(r.V, 50), 20 * shiftOf(r)) / 10) * 10 });
const tN = trans(N), tS = trans(Sd);
say(`HK-5c SLIPS + C-D ROADS, loops R ${R} m / V${V}. C-D offsets: ${N.name} ${f1(off(N))} m (shift ${f1(shiftOf(N))}, exit ${tN.exit} m, entry ${tN.entry} m); ${Sd.name} ${f1(off(Sd))} m (shift ${f1(shiftOf(Sd))}, exit ${tS.exit} m, entry ${tS.entry} m).`);
// 1 slips: northeast quadrant on the ARM offset and the NE loop; southeast quadrant on the LINK offset and the SE loop. The west quadrants are x-mirrors of the east ones.
function slip(S: number, vx: number, sgn: number): { x: number; y: number }[] {
  const Rs = Math.min(SLIP_R, S), d = (S - Rs) / Math.SQRT1_2; let x = vx, y = sgn * (ringKerb + S), h = -sgn * Math.PI / 2; const pts = [{ x, y }]; const ds = 2;
  const run = (len: number, curv: number): void => { const n = Math.max(1, Math.ceil(len / ds)), st = len / n; for (let q = 0; q < n; q++) { h += sgn * curv * st / 2; x += Math.cos(h) * st; y += Math.sin(h) * st; h += sgn * curv * st / 2; pts.push({ x, y }); } };
  run(Rs * Math.PI / 4, 1 / Rs); run(d, 0); run(Rs * Math.PI / 4, 1 / Rs); return pts;
}
const gapTo = (a: { x: number; y: number }[], loop: { x: number; y: number }[]): number => { let m = 1e9; for (let i = 0; i < a.length; i++) { if (i * 2 < 45 || (a.length - i) * 2 < 45) continue; for (let j = 0; j < loop.length; j++) { if (j * 25 < 45 || (loop.length - j) * 25 < 45) continue; m = Math.min(m, Math.hypot(a[i].x - loop[j].x, a[i].y - loop[j].y)); } } return m; };
let S = 0; for (let s = 150; s <= 400; s += 10) { if (gapTo(slip(s, A.vN, 1), A.ne) >= MINGAP && gapTo(slip(s, A.vS, -1), A.se) >= MINGAP) { S = s; break; } }
const slipNE = slip(S, A.vN, 1), slipSE = slip(S, A.vS, -1);
chk(S > 0, `slip clears its loop by >= ${MINGAP} m (NE on the arm offset, SE on the link offset)`, `smallest slipSize S = ${S} m; gaps NE ${f1(gapTo(slipNE, A.ne))} m, SE ${f1(gapTo(slipSE, A.se))} m`);
for (const [n, sp, y0] of [['NE', slipNE, ringKerb], ['SE', slipSE, -ringKerb]] as const) { const e = sp[sp.length - 1]; chk(Math.abs(e.y - y0) < 0.5, `${n} slip ends tangent in the ring lane`, `x ${f1(e.x)}, y ${f1(e.y)} vs ${y0}; length about ${f1(sp.length * 2)} m (V${SLIP_V}, Rs ${SLIP_R} m, Validate needs ${f1((SLIP_V * SLIP_V) / (127 * 0.21))} m)`); }
// 2 C-D roads: first gore at ring kerb + S; the east C-D runs southbound (exit at the ARM end, entry at the LINK end), the west C-D northbound (exit at the LINK end, entry at the ARM end)
const first = ringKerb + S;
const ext = { eastArmEnd: first + lead + tN.exit, eastLinkEnd: first + lead + tS.entry, westLinkEnd: first + lead + tS.exit, westArmEnd: first + lead + tN.entry };
say(`C-D extents from the node: east C-D ${Math.round(ext.eastArmEnd)} m at the arm end, ${Math.round(ext.eastLinkEnd)} m at the link end; west C-D ${Math.round(ext.westLinkEnd)} m at the link end, ${Math.round(ext.westArmEnd)} m at the arm end.`);
chk(Math.max(ext.eastLinkEnd, ext.westLinkEnd) < 462, 'C-D south ends before the first link structure (462 m)', `${Math.round(Math.max(ext.eastLinkEnd, ext.westLinkEnd))} m: the link structure must be moved / rebuilt (user: existing structures may be removed)`, true);
chk(Math.max(ext.eastArmEnd, ext.westArmEnd) < 584, 'C-D north ends before the first arm structure (584 m)', `${Math.round(Math.max(ext.eastArmEnd, ext.westArmEnd))} m: the arm structure must be moved / rebuilt`, true);
// 3 the C-D roads change offset (29.3 north, 23.2 south): a reverse curve (S-bend) south of the ring deck, before the loop start
const dOff = off(N) - off(Sd), Rb = (SLIP_V * SLIP_V) / (127 * 0.21), Lb = 2 * Math.sqrt(2 * Rb * dOff / 2 - (dOff / 2) ** 2), startY = A.startY, deckEdge = N.half + 3.65, avail = startY - deckEdge;
say(`C-D S-bend: offset change ${f1(dOff)} m with two reverse arcs of R ${f1(Rb)} m (V50 minimum) needs ${f1(Lb)} m of road; available between the ring deck edge (${f1(deckEdge)} m, with an auxiliary lane) and the loop start (${f1(startY)} m) = ${f1(avail)} m.`);
chk(avail >= Lb, 'C-D S-bend fits between the ring deck and the loop start', `${f1(avail)} m >= ${f1(Lb)} m (margin ${f1(avail - Lb)} m): TIGHT, a 1:15 taper (${f1(15 * dOff)} m) would NOT fit; the reverse curve is the only way`, avail < Lb * 1.1);
// 4 weaves
const wCD = 2 * startY;
chk(wCD >= CRITERIA.weaveMin, 'H4 weave on the C-D roads (NE merge to SE diverge, 2 x loop start distance)', `${f1(wCD)} m (min ${CRITERIA.weaveMin}, desirable ${CRITERIA.weaveDesirable}); V50 road`);
chk(B.weaveS >= CRITERIA.weaveMin && B.weaveN >= CRITERIA.weaveMin, 'H4 weave on the ring WITHOUT a ring C-D road', `south lane ${f1(B.weaveS)} m, north lane ${f1(B.weaveN)} m on the V100 through lanes`);
chk(Math.min(wCD, B.weaveS, B.weaveN) >= CRITERIA.weaveDesirable, 'H4 weave reaches the desirable 300 m', `${f1(wCD)} / ${f1(B.weaveS)} / ${f1(B.weaveN)} m: not with any loop that fits this site`, true);
say('NOTE: a C-D road does not lengthen a weave, it moves it from the V100 / V80 through lanes to a V50 road beside them. The ring C-D road is a recommendation, not decided by the user.');
say('NOT RUN: Validate.ts on real Ramp objects, game, tsc, build, terrain / fill of slips and C-D roads, ring C-D deck width and structure (HK-6), the 8-lane to 6-lane change of the ground road at the node (under the ring deck), the link / arm structures.');
say(`RESULT ${fails} FAIL, ${warns} WARN`);
writeFileSync('docs/HK_CD_SLIPS.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_cd_slips.json', JSON.stringify({ S, slipNE: slipNE.filter((_, i) => i % 3 === 0), slipSE: slipSE.filter((_, i) => i % 3 === 0), ext, tN, tS, wCD, wRingS: B.weaveS, wRingN: B.weaveN, sbend: { dOff, Rb, Lb, avail } }));
