// STEP HK-4: vertical plan, ring OVER (D1). No src change. Run: npx tsx scripts/hk-vertical.ts -> docs/HK_VERTICAL.txt, docs/hk_vertical.json (picture: python3 tools/hk-vertical-plot.py)
// Method: new ring level = old ring level + bump B(s). B = rise on the flat deck over the lower roads, then falls to 0 with a grade that ramps (crest curve, K of crestK(100)),
// holds, and ramps back (sag curve, headlight K). Arm and link keep their profiles (D1). Net grade = old ring grade + bump grade is CHECKED numerically.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { crestK, stoppingSight } from '../src/interchange/Standards';
const out: string[] = []; let fails = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const check = (ok: boolean, n: string, d: string): void => { if (!ok) fails++; say(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(70)} ${d}`); };
const gen: any = new TerrainGenerator(Config.world.seed); const net: any = gen.roads;
const ring = net.roads.find((r: any) => r.name === 'M8'), arm = net.roads.find((r: any) => r.name === 'J1-S'), link = net.roads.find((r: any) => r.name === 'M6-1');
const at = (r: any, s: number): { y: number } => { const L = r.length; const ss = r.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s)); let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= ss) lo = m; else hi = m; } const t = (ss - r.cum[lo]) / ((r.cum[hi] - r.cum[lo]) || 1); return { y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t }; };
const JX = arm.xs[arm.xs.length - 1], JZ = arm.zs[arm.zs.length - 1]; let k0 = 0, bd = 1e18;
for (let i = 0; i < ring.xs.length; i++) { const d = Math.hypot(ring.xs[i] - JX, ring.zs[i] - JZ); if (d < bd) { bd = d; k0 = i; } }
const sJ: number = ring.cum[k0]; const yOld = (d: number): number => at(ring, sJ + d).y; // d + = WEST, d - = EAST
// lower roads at the crossing: the deck must clear the HIGHEST lower-road level inside the crossing width
const halfSpan = 33.5; let y0 = -1e9; // 33.5 = C-D road outer edge (HK-3: 29.3 + 4.2)
for (let s = 0; s <= halfSpan; s += 2) y0 = Math.max(y0, at(arm, arm.length - s).y);
for (let s = 0; s <= 25 + halfSpan; s += 2) y0 = Math.max(y0, at(link, s).y);
say(`HK-4 VERTICAL PLAN, ring OVER. Ring old level at node ${yOld(0).toFixed(2)} m; highest lower-road level inside +-${halfSpan} m: ${y0.toFixed(2)} m (arm ${at(arm, arm.length).y.toFixed(2)}, link ${at(link, 0).y.toFixed(2)} at its start).`);
const Kc = crestK(100), S = stoppingSight(100), Ks = (S * S) / (120 + 3.5 * S); // sag K: AASHTO headlight formula (typed here, not in Standards.ts)
say(`V100: crest K ${Kc.toFixed(1)} (Standards.ts), sag K ${Ks.toFixed(1)} (headlight formula), max grade 4 % (3 % desirable) (DESIGN.maxGrade), flat deck = ${halfSpan} + 18 m each side (upperFlat 18).`);
const flat = halfSpan + 18, GLIM = 0.04;
function bump(rise: number, gcap: number): { len: number; g: number; hold: number; at: (u: number) => number } {
  let g = Math.sqrt(rise / (50 * (Kc + Ks))), hold = 0; if (g > gcap) { g = gcap; hold = (rise - 50 * g * g * (Kc + Ks)) / g; }
  const l1 = g * 100 * Kc, l2 = g * 100 * Ks; // crest curve, sag curve lengths: grade ramps 0 -> g over l1, hold, g -> 0 over l2 (K = L / A)
  const grade = (u: number): number => (u < l1 ? g * u / l1 : u < l1 + hold ? g : u < l1 + hold + l2 ? g * (1 - (u - l1 - hold) / l2) : 0);
  const prof: number[] = [rise]; for (let u = 1; u <= l1 + hold + l2 + 1; u++) prof.push(Math.max(0, prof[prof.length - 1] - grade(u - 0.5)));
  return { len: l1 + hold + l2, g, hold, at: (u: number) => (u <= 0 ? rise : prof[Math.min(prof.length - 1, Math.round(u))]) };
}
const res: any = {};
const kOf = (f: (d: number) => number, d0: number, d1: number): number => { let m = 1e9; for (let d = d0; d <= d1; d += 5) { const c = (f(d - 5) - 2 * f(d) + f(d + 5)) / 25; if (Math.abs(c) > 1e-7) m = Math.min(m, 1 / (100 * Math.abs(c))); } return m; };
for (const deck of [1.4, 2.3]) {
  const top = y0 + 5.5 + deck, rise = top - yOld(0);
  say(`\nSCENARIO deck ${deck} m: deck top at node ${top.toFixed(2)} m, raise over the old ring ${rise.toFixed(2)} m`);
  // WEST: the old ring CLIMBS westward (24.7 m at +400, 28.2 m at +500), so the new ring stays LEVEL at the deck level and meets the old climb: smooth max(deck, old)
  const smx = (d: number, cc: number): number => { const o = yOld(d); return 0.5 * (top + o + Math.sqrt((top - o) ** 2 + cc * cc)); };
  let cW = 0.5, kW = 0; for (; cW < 60; cW += 0.5) { const dl = smx(0, cW) - top; kW = kOf((d: number) => smx(d, cW) - dl, 0, 700); if (kW >= Ks) break; }
  const dlW = smx(0, cW) - top; const fW = (d: number): number => smx(d, cW) - dlW; // smooth max(deck, old ring), shifted so the deck is exactly at the deck level at the node
  let dStar = flat; while ((yOld(dStar) < top || fW(dStar) - yOld(dStar) > 1.0) && dStar < 1400) dStar += 5; // join: old ring above the deck level and the new ring within 1 m of it (ESTIMATE of the tie-in, the blend only approaches the old ring)
  let maxW = 0, pierW = 0; for (let d = 0; d <= dStar; d += 5) { maxW = Math.max(maxW, Math.abs((fW(d + 5) - fW(d)) / 5)); if (fW(d) - yOld(d) > 3) pierW = d; }
  say(`  WEST: level deck ${top.toFixed(2)} m, merges into the old ring at about +${dStar} m (blend c ${cW.toFixed(1)}, min sag K ${kW.toFixed(0)} vs ${Ks.toFixed(0)}); max grade ${(maxW * 100).toFixed(2)} %; more than 3 m above the old ring (piers / embankment) up to +${pierW} m`);
  check(maxW <= GLIM, `WEST grade <= 4 % (deck ${deck})`, `${(maxW * 100).toFixed(2)} % (equals the old ring's own climb at the join)`);
  check(kW >= Ks, `WEST sag K >= headlight K (deck ${deck})`, `${kW.toFixed(0)} vs ${Ks.toFixed(0)}`);
  check(dStar <= 1500, 'WEST joins before any structure (none within 1500 m)', `joins at +${dStar} m`);
  // EAST: the old ring is flat / falling eastward, so a grade-controlled bump: crest curve, hold, sag curve
  const b = bump(rise, 0.032); let maxE = 0, maxOldE = 0, pierE = 0;
  for (let d = 0; d <= flat + b.len; d += 5) { maxOldE = Math.max(maxOldE, Math.abs((yOld(-(d + 5)) - yOld(-d)) / 5)); const y = yOld(-d) + b.at(d - flat), y2 = yOld(-(d + 5)) + b.at(d + 5 - flat); maxE = Math.max(maxE, Math.abs((y2 - y) / 5)); if (b.at(d - flat) > 3) pierE = d; }
  const needE = flat + b.len;
  say(`  EAST: bump grade ${(b.g * 100).toFixed(2)} %, curves ${(b.g * 100 * Kc).toFixed(0)} + ${(b.g * 100 * Ks).toFixed(0)} m, hold ${b.hold.toFixed(0)} m; length needed ${needE.toFixed(0)} m; max NET grade ${(maxE * 100).toFixed(2)} % (old ring alone ${(maxOldE * 100).toFixed(2)} %); more than 3 m above the old ring up to -${pierE} m`);
  check(maxE <= GLIM, `EAST net grade <= 4 % (deck ${deck})`, `${(maxE * 100).toFixed(2)} %`);
  check(maxE <= 0.03, `EAST net grade <= 3 % desirable (deck ${deck})`, `${(maxE * 100).toFixed(2)} %`);
  check(needE <= 312, 'EAST length needed <= 312 m (river bridge starts there; it is FIXED)', `${needE.toFixed(0)} m needed; ${(needE - 312).toFixed(0)} m over`);
  say(`    OPTION if the river bridge (-312..-432) may be rebuilt (user: existing structures may be removed): the ramp may run to about -520 m: ${needE <= 520 ? 'FITS' : 'DOES NOT FIT'} (${needE.toFixed(0)} <= 520, ESTIMATE; bridge level and river clearance NOT checked)`);
  const ptsW: number[][] = [], ptsE: number[][] = []; for (let d = 0; d <= 600; d += 5) { ptsW.push([d, fW(d)]); ptsE.push([-d, yOld(-d) + b.at(d - flat)]); }
  res[`WEST_${deck}`] = { pts: ptsW, dStar, rise }; res[`EAST_${deck}`] = { pts: ptsE, need: needE, rise };
}
say('\nARM / LINK: keep their profiles (D1). Deck clearance over both is built into the raise (y0 = highest lower-road level inside the crossing + 5.5 m clearance + deck). PASS by construction, NOT measured on a built model.');
say('NOT RUN: game, tsc, build, terrain / fill under the raised ring, drainage, the river bridge level and clearance, loop ramp profiles (HK-5), the old ring second derivative outside the bump.');
say(`RESULT ${fails} FAIL`);
writeFileSync('docs/HK_VERTICAL.txt', out.join('\n') + '\n'); writeFileSync('docs/hk_vertical.json', JSON.stringify({ y0, flat, res, old: Array.from({ length: 241 }, (_, i) => [(i - 120) * 5, yOld((i - 120) * 5)]) }));
