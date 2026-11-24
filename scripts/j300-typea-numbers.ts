// J1 TYPE A NUMBERS + VERTICAL PLAN (headless, READ ONLY): ring on its embankment, bridge over a ground roundabout, 4 ramps up to the ring.
// Run: npx tsx scripts/j300-typea-numbers.ts [dir]   (default docs)   writes dir/J300_TYPEA.txt and dir/J300_TYPEA.json
// All design numbers marked ASSUMED are first values, final in J3. u = metres along the ring from the crossing (+ towards PI4), world x east, z south.
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { planRing } from '../src/roads/ring/RingRoad';
import { collectCentreSet } from '../src/roads/debug/RoadCentreSet';
const OUT = process.argv[2] ?? 'docs';
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const nat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const PLAN: any = planRing(5);
const ringY = (x: number, z: number): number => { let b = 1e9, y = 0; for (let i = 0; i < PLAN.pts.length; i++) { const d = Math.hypot(PLAN.pts[i][0] - x, PLAN.pts[i][1] - z); if (d < b) { b = d; y = PLAN.ys[i]; } } return y; };
const A: any = RING_PIS[3], B: any = RING_PIS[4]; const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1];
const LEN = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / LEN, uz = (bz - az) / LEN, nx = -uz, nz = ux;
const C = { x: -1547, z: -2464 }; const s0 = (C.x - ax) * ux + (C.z - az) * uz;
const at = (u: number, v: number): { x: number; z: number } => ({ x: ax + ux * (s0 + u) + nx * v, z: az + uz * (s0 + u) + nz * v });
const H = (u: number): number => { const p = at(u, 0); return ringY(p.x, p.z); };
const N = (u: number, v = 0): number => { const p = at(u, v); return nat(p.x, p.z); };
// ASSUMED design values (final in J3)
const RO = 62, DECK = 2.0, CLR = 5.5, GMAX_DEFAULT = 0.05, RAMPW = 10.0, ROWHALF = 22.1, TAPER_ACC = 241, TAPER_DEC = 207;
const RAIL_U = -600, WATER_U = 540;
pr('J1 TYPE A NUMBERS (headless, read only, nothing in src or data changed)');
pr(`ASSUMED: roundabout outer radius ${RO} m, deck depth ${DECK} m, vertical clearance ${CLR} m, ramp max grade swept 5 .. 8 % (ramp design speed 50 km/h; Criteria final in J3), ramp width ${RAMPW} m, ring half width ${ROWHALF} m, merge length ${TAPER_ACC} m, diverge length ${TAPER_DEC} m`);
// ring profile near the site
pr(''); pr('1) RING PROFILE (finished surface, fixed) and natural ground at the axis');
for (let u = -450; u <= 450; u += 50) pr(`  u ${String(u).padStart(5)}: ring ${f1(H(u))}  natural ${f1(N(u))}  ring - natural ${f1(H(u) - N(u))}  ring grade(+-25) ${f2((H(u + 25) - H(u - 25)) / 50 * 100)} %`);
let low = 1e9, lowU = 0; for (let u = -400; u <= 400; u += 5) { const h = H(u); if (h < low) { low = h; lowU = u; } }
pr(`lowest ring surface in -400..+400: ${f1(low)} m at u ${f0(lowU)} (the ring sags here, ring rises both ways, so the ramps have the least to climb near the sag)`);
// candidates for the roundabout centre along the ring
interface Cand { u0: number; P: number; cut: number; fill: number; clearMin: number; clearOK: boolean; ramps: Record<string, { len: number; uMeet: number; uEnd: number; fillV: number; ok: boolean; gUsed: number }>; score: number; shiftOK: boolean }
function makeCands(GMAX: number, bump: number): Cand[] {
const cands: Cand[] = [];
for (let u0 = -450; u0 <= 300; u0 += 25) {
  // pad level = mean natural ground over the circle (5 m grid), cut / fill volumes
  let sum = 0, cnt = 0; const cells: number[] = [];
  for (let a = -RO; a <= RO; a += 5) for (let b = -RO; b <= RO; b += 5) if (Math.hypot(a, b) <= RO) { const h = N(u0 + a, b); cells.push(h); sum += h; cnt++; }
  const P = Math.round(sum / cnt * 10) / 10 + bump; let cut = 0, fill = 0; for (const h of cells) { if (h > P) cut += (h - P) * 25; else fill += (P - h) * 25; }
  // clearance: lowest ring surface over the bridge length (u0 -67 .. +67) minus deck minus pad level
  let hmin = 1e9; for (let u = u0 - 67; u <= u0 + 67; u += 5) hmin = Math.min(hmin, H(u)); const clear = hmin - DECK - P;
  const ramps: Cand['ramps'] = {};
  for (const [name, sg, side] of [['E-out (roundabout -> ring east)', 1, 1], ['E-in (ring east -> roundabout)', 1, -1], ['W-out (roundabout -> ring west)', -1, 1], ['W-in (ring west -> roundabout)', -1, -1]] as any) {
    // ramp climbs from pad level P at 70 m from the centre to ring level, grade GMAX; first find the length where it meets the ring surface
    let uM = NaN, len = 0, fillV = 0, prev = 0;
    for (let d = 70; d <= 700; d += 5) { const u = u0 + sg * d; const z = P + GMAX * (d - 70); const hr = H(u); const nn = N(u, side * 27); fillV += Math.max(0, z - nn) * (RAMPW + 4 * Math.max(0, z - nn)) * 5; if (z >= hr - 0.5) { uM = u; len = d - 70; break; } prev = d; }
    const uEnd = isNaN(uM) ? NaN : uM + sg * (name.includes('out') ? TAPER_ACC : TAPER_DEC);
    const inside = !isNaN(uM) && (sg > 0 ? uEnd < WATER_U - 20 : uEnd > RAIL_U + 40);
    ramps[name] = { len, uMeet: uM, uEnd, fillV, ok: inside, gUsed: GMAX };
  }
  const allOK = Object.values(ramps).every((r) => r.ok); const totLen = Object.values(ramps).reduce((s2, r) => s2 + (isNaN(r.len) ? 1e4 : r.len), 0); const totFill = Object.values(ramps).reduce((s2, r) => s2 + r.fillV, 0);
  cands.push({ u0, P, cut, fill, clearMin: clear, clearOK: clear >= CLR, ramps, score: (allOK ? 0 : 1e6) + (clear >= CLR ? 0 : 1e6) + totLen * 100 + (cut + fill) * 0.3 + totFill * 0.3 + Math.abs(u0) * 400, shiftOK: true });
}
return cands;
}
const GRID = [0.05, 0.06, 0.07, 0.08]; pr(''); pr('2a) SWEEP: ramp grade vs roundabout centre u0 (pad bump 0 m and +1.0 m; feasible = clearance >= 5.5 m AND all 4 ramps meet the ring and end inside rail u -560 / water u +520)');
let cands: Cand[] = makeCands(0.05, 0);
for (const g of GRID) for (const bump of [0, 1.0]) { const cc = makeCands(g, bump); const ok = cc.filter((c) => c.clearOK && Object.values(c.ramps).every((r) => r.ok)); pr(`  grade ${g * 100} % pad bump ${bump} m: feasible u0 = ${ok.length ? ok.map((c) => c.u0).join(', ') : 'NONE'}`); if (g === 0.07 && bump === 0) cands = cc; }
pr(''); pr('2) CANDIDATE CENTRES (table for grade 7 %, no pad bump) of the roundabout along the ring (u0 = shift from the crossing; R6-9 / R4-9 final stretches move with it, allowed: only ring, rail and river are fixed)');
pr('  u0   pad P  cut m3  fill m3 clear m | ramp length m (E-out E-in W-out W-in) | merge end u (E-out, W-out) | ramp fill m3 | ok');
for (const c of cands) { const r = c.ramps; const k = Object.keys(r); pr(`  ${String(c.u0).padStart(4)} ${f1(c.P).padStart(6)} ${f0(c.cut).padStart(7)} ${f0(c.fill).padStart(7)} ${f1(c.clearMin).padStart(6)} ${c.clearOK ? 'PASS' : 'FAIL'} | ${k.map((n) => (isNaN(r[n].len) ? 'none' : f0(r[n].len)).padStart(5)).join(' ')} | ${f0(r[k[0]].uEnd)} ${f0(r[k[2]].uEnd)} | ${f0(k.reduce((s2, n) => s2 + r[n].fillV, 0))} | ${k.every((n) => r[n].ok) ? 'PASS' : 'FAIL'}`); }
const GMAX = 0.07; const best = [...cands].sort((a, b) => a.score - b.score)[0];
pr(''); pr(`BEST candidate (smallest ramp length + earthwork + shift, all checks PASS needed): u0 = ${best.u0} m, pad level P = ${f1(best.P)} m, clearance ${f1(best.clearMin)} m, ring surface at the centre ${f1(H(best.u0))} m (${f1(H(best.u0) - best.P)} m above the pad)`);
const R = best.ramps; for (const k of Object.keys(R)) pr(`  ramp ${k}: length to ring level ${f0(R[k].len)} m at the swept grade, meets the ring surface at u ${f0(R[k].uMeet)}, merge / diverge ends at u ${f0(R[k].uEnd)} (${R[k].ok ? 'inside rail ' + RAIL_U + ' / water ' + WATER_U + ' limits PASS' : 'FAIL'}), fill ${f0(R[k].fillV)} m3`);
// bridge layout
const u0 = best.u0; const lowSpan = Math.min(...Array.from({ length: 28 }, (_, i) => H(u0 - 67 + i * 5)));
pr(''); pr('3) BRIDGE over the roundabout (ASSUMED layout, final in J2 / J7)');
pr(`abutments at u0 +- 67 m (just outside the 62 m roundabout radius, with the ring embankment retained behind them), piers at u0 +- 30 m on the roundabout island (island radius 48 m): spans 37 + 60 + 37 = 134 m, deck width 44.2 m (8 lanes + median), deck depth ${DECK} m, lowest ring surface over the bridge ${f1(lowSpan)} m`);
pr(`clearance check: ring surface ${f1(lowSpan)} - deck ${DECK} - pad ${f1(best.P)} = ${f1(lowSpan - DECK - best.P)} m against ${CLR} m: ${lowSpan - DECK - best.P >= CLR ? 'PASS' : 'FAIL'}`);
pr(`ring profile fixed: the bridge deck follows the existing surface (grade at the bridge ${f2((H(u0 + 67) - H(u0 - 67)) / 134 * 100)} %), no vertical change PASS`);
// arms: R6-9 and R4-9 ends
pr(''); pr('4) ARMS R6-9 (6 lane, limit 4 %) and R4-9 (4 lane, limit 6 %): natural ground back from the roundabout');
const set = collectCentreSet(gen); const armSum: any = {};
for (const id of ['R6-9', 'R4-9']) {
  const ln: any = set.lines.filter((l: any) => l.id === id).pop(); const pts: any[] = ln.pts ?? ln.points; const pp = pts.map((p: any) => ({ x: p.x ?? p[0], z: p.z ?? p[1] }));
  // distance from the crossing along the line (from its ring end)
  const endNear = Math.hypot(pp[0].x - C.x, pp[0].z - C.z) < Math.hypot(pp[pp.length - 1].x - C.x, pp[pp.length - 1].z - C.z) ? pp : [...pp].reverse();
  let d = 0; const row: string[] = []; let target = 100; const lim = id === 'R6-9' ? 0.04 : 0.06; let hPrev = nat(endNear[0].x, endNear[0].z); let maxG = 0; const ys: number[] = [];
  for (let i = 1; i < endNear.length && d < 500; i++) { const seg = Math.hypot(endNear[i].x - endNear[i - 1].x, endNear[i].z - endNear[i - 1].z); d += seg; const h = nat(endNear[i].x, endNear[i].z); const g = Math.abs(h - hPrev) / Math.max(seg, 1); maxG = Math.max(maxG, g); hPrev = h; if (d >= target) { row.push(`${f0(d)} m: ${f1(h)}`); target += 100; } ys.push(h); }
  pr(`  ${id}: natural ground ${row.join(' | ')}; roundabout pad ${f1(best.P)} m; max natural grade per segment ${f1(maxG * 100)} % (limit ${lim * 100} %): ${maxG <= lim ? 'PASS' : 'CHECK (cut / fill in J6)'}`);
  armSum[id] = { row };
}
// R2-10 conflict
let r2 = 1e9; { const ln: any = set.lines.filter((l: any) => l.id === 'R2-10').pop(); if (ln) for (const p of (ln.pts ?? ln.points)) { const x = p.x ?? p[0], z = p.z ?? p[1]; const c = at(u0, 0); r2 = Math.min(r2, Math.hypot(x - c.x, z - c.z)); } }
pr(`R2-10 closest approach to the roundabout centre: ${f0(r2)} m (roundabout radius ${RO} m + ramp strip about 45 m from the axis; need > 110 m, else re-route R2-10 in J4): ${r2 > 110 ? 'PASS' : 'CHECK'}`);
// totals
const rampFill = Object.values(R).reduce((s2, r) => s2 + r.fillV, 0);
pr(''); pr('5) EARTHWORK + QUANTITIES (rough, ASSUMED shapes)');
pr(`roundabout pad: cut ${f0(best.cut)} m3, fill ${f0(best.fill)} m3 (pad ${f1(best.P)} m); 4 ramps fill about ${f0(rampFill)} m3; bridge deck about ${f0(134 * 44.2)} m2`);
pr(''); pr('NOT RUN: groundwater and flotation, drainage outfall of the low pad (J3), real R6-9 / R4-9 re-route (J4), vertical curve K of the ramps (J3 / J5).');
writeFileSync(`${OUT}/J300_TYPEA.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/J300_TYPEA.json`, JSON.stringify({ best, cands, lowSpan, ring: Array.from({ length: 91 }, (_, i) => ({ u: -450 + i * 10, ring: H(-450 + i * 10), nat: N(-450 + i * 10) })) }, null, 1));
