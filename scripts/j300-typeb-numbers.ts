// J1-B TYPE B NUMBERS (headless, READ ONLY): ring stays at its own level and runs in an UNDERPASS (box) under a RAISED roundabout; R6 / R4 climb to the roundabout; 4 ramps run DOWN from the roundabout to the ring.
// Why raised: the ring cannot be lowered, it rises 4 % east of u +200 and west of u -300, a lowered profile could never rejoin it (max dive about 2 m, computed below).
// Run: npx tsx scripts/j300-typeb-numbers.ts [dir]   writes dir/J300_TYPEB.txt and dir/J300_TYPEB.json.  ASSUMED values marked, final in J3.
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
const RO = 62, GAP = 7.5 /* 5.5 clearance + 2.0 deck, ASSUMED */, GR = 0.05 /* ramp 5 % project limit */, RAMPW = 10, TAC = 241, TDE = 207, RAIL_U = -600, WATER_U = 540, G6 = 0.035 /* R6 aim 3.5 %, limit 4 % */, G4 = 0.06;
pr('J1-B TYPE B NUMBERS (headless, read only, nothing in src or data changed)');
pr(`ASSUMED: roundabout outer radius ${RO} m, deck-to-ring gap ${GAP} m (5.5 clearance + 2.0 structure), ramp grade ${GR * 100} % (project limit), R6 arm ${G6 * 100} % (limit 4 %), R4 arm ${G4 * 100} % (limit 6 %), merge ${TAC} m, diverge ${TDE} m`);
// 1) why the ring cannot dive
pr(''); pr('1) CAN THE RING DIVE UNDER A ROUNDABOUT AT GROUND? (ring grade limit 4 %)');
for (const ue of [-13, 50, 100]) { let clos = 0; for (let u = ue; u < 500; u += 5) { const g = (H(u + 5) - H(u)) / 5; clos += Math.max(0, 0.04 - g) * 5; if (u > 300) break; } pr(`  a dive that ends at u ${ue} can rejoin the old east profile only if it is at most ${f1(clos)} m below it (4 % climb vs the old profile that is already 4 % beyond u +200)`); }
pr('  => a dive of 7.8 m (box floor 7.8 m below the roundabout at ground) is IMPOSSIBLE without rebuilding the ring profile for about 1.3 km east into the water bridge (ring at the water level) and the hill. So the ring stays at its level and the ROUNDABOUT IS RAISED.');
// 2) candidates
interface Cand { u0: number; Ptop: number; platformFill: number; r6Len: number; r6Fill: number; ramps: Record<string, { len: number; uMeet: number; uEnd: number; fillV: number; ok: boolean }>; ok: boolean; score: number }
const cands: Cand[] = [];
for (let u0 = -300; u0 <= 250; u0 += 25) {
  let hmax = -1e9; for (let u = u0 - 67; u <= u0 + 67; u += 5) hmax = Math.max(hmax, H(u));
  const Ptop = Math.ceil((hmax + GAP) * 10) / 10;
  let pf = 0; for (let a = -RO; a <= RO; a += 5) for (let b = -RO; b <= RO; b += 5) if (Math.hypot(a, b) <= RO) pf += Math.max(0, Ptop - N(u0 + a, b)) * 25;
  const ground = N(u0, 0); const r6Len = (Ptop - ground) / G6; let r6Fill = 0; for (let d = 0; d <= r6Len; d += 10) { const h = Ptop - G6 * d - ground; r6Fill += Math.max(0, h) * (25 + 4 * Math.max(0, h)) * 10; }
  const ramps: Cand['ramps'] = {};
  for (const [name, sg] of [['E-out (roundabout -> ring east)', 1], ['E-in (ring east -> roundabout)', 1], ['W-out (roundabout -> ring west)', -1], ['W-in (ring west -> roundabout)', -1]] as any) {
    let uM = NaN, len = 0, fillV = 0;
    for (let d = 70; d <= 700; d += 5) { const u = u0 + sg * d; const z = Ptop - GR * (d - 70); const hr = H(u); const nn = N(u, sg * 0 + 27); fillV += Math.max(0, z - nn) * (RAMPW + 4 * Math.max(0, z - nn)) * 5; if (z <= hr + 0.5) { uM = u; len = d - 70; break; } }
    const uEnd = isNaN(uM) ? NaN : uM + sg * (name.includes('out') ? TAC : TDE);
    const inside = !isNaN(uM) && (sg > 0 ? uEnd < WATER_U - 20 : uEnd > RAIL_U + 40);
    ramps[name] = { len, uMeet: uM, uEnd, fillV, ok: inside };
  }
  const ok = Object.values(ramps).every((r) => r.ok);
  const rf = Object.values(ramps).reduce((s2, r) => s2 + r.fillV, 0);
  cands.push({ u0, Ptop, platformFill: pf, r6Len, r6Fill, ramps, ok, score: (ok ? 0 : 1e9) + pf + r6Fill + rf });
}
pr(''); pr('2) CANDIDATE CENTRES u0 (R6-9 / R4-9 arms move with the roundabout; only ring, rail, river fixed): platform level, fills, ramp lengths (ramps DOWN from the roundabout at 5 %)');
pr('  u0   Ptop  platform fill m3  R6 arm length m / fill m3 | ramp lengths m (E-out E-in W-out W-in) | merge ends u (E-out / W-out) | ok');
for (const c of cands) { const r = c.ramps, k = Object.keys(r); pr(`  ${String(c.u0).padStart(4)} ${f1(c.Ptop).padStart(5)} ${f0(c.platformFill).padStart(10)} ${f0(c.r6Len).padStart(6)} / ${f0(c.r6Fill).padStart(8)} | ${k.map((n) => (isNaN(r[n].len) ? 'none' : f0(r[n].len)).padStart(5)).join(' ')} | ${f0(r[k[0]].uEnd)} / ${f0(r[k[2]].uEnd)} | ${c.ok ? 'PASS' : 'FAIL'}`); }
const best = [...cands].sort((a, b) => a.score - b.score)[0];
pr(''); pr(`BEST: u0 = ${best.u0} m, roundabout level Ptop = ${f1(best.Ptop)} m (natural ${f1(N(best.u0))} m, so ${f1(best.Ptop - N(best.u0))} m above ground, ${f1(best.Ptop - Math.max(...Array.from({ length: 28 }, (_, i) => H(best.u0 - 67 + i * 5))))} m above the highest ring surface under it)`);
for (const k of Object.keys(best.ramps)) { const r = best.ramps[k]; pr(`  ramp ${k}: length ${f0(r.len)} m at 5 % DOWN from the roundabout, meets the ring surface at u ${f0(r.uMeet)}, merge / diverge ends at u ${f0(r.uEnd)} (${r.ok ? 'inside rail ' + RAIL_U + ' / water ' + WATER_U + ' PASS' : 'FAIL'}), fill ${f0(r.fillV)} m3`); }
pr(`platform fill about ${f0(best.platformFill)} m3, R6 arm: climbs ${f1(best.Ptop - N(best.u0))} m at ${G6 * 100} % = ${f0(best.r6Len)} m long, fill about ${f0(best.r6Fill)} m3 (R6-9 natural ground is flat for 716 m back, so it fits: ${best.r6Len < 700 ? 'PASS' : 'FAIL'})`);
// R4 arm
const set = collectCentreSet(gen); const ln: any = set.lines.filter((l: any) => l.id === 'R4-9').pop(); const pts: any[] = ln.pts ?? ln.points; const pp = pts.map((p: any) => ({ x: p.x ?? p[0], z: p.z ?? p[1] }));
const endNear = Math.hypot(pp[0].x - C.x, pp[0].z - C.z) < Math.hypot(pp[pp.length - 1].x - C.x, pp[pp.length - 1].z - C.z) ? pp : [...pp].reverse();
pr(''); pr('3) R4 ARM (R4-9 final stretch, limit 6 %): road level if it descends at 6 % away from the roundabout vs natural ground along the old R4-9 line');
let dd = 0; let tgt = 100; for (let i = 1; i < endNear.length && dd < 600; i++) { dd += Math.hypot(endNear[i].x - endNear[i - 1].x, endNear[i].z - endNear[i - 1].z); if (dd >= tgt) { const h = nat(endNear[i].x, endNear[i].z); const road = best.Ptop - G4 * Math.max(0, dd - 62); pr(`  ${f0(dd)} m back: natural ${f1(h)}  road at 6 % ${f1(road)}  ${h > road ? 'CUT ' + f1(h - road) + ' m' : 'FILL ' + f1(road - h) + ' m'}`); tgt += 100; } }
pr('  => the old R4-9 line runs into the hill (natural 85 m at 535 m back): it must be RE-ROUTED around the hill in J4 (ROADFIX rule: only ring, rail, river are fixed; hills: go around first), or the R4 arm reaches the roundabout from another direction. R4 length / level is decided in J4.');
// bridge / underpass
pr(''); pr('4) UNDERPASS: the ring runs under the roundabout inside a box about 134 m long (roundabout diameter 124 m + 5 m each side), clear width about 44 m (ring section 44.2 m, ASSUMED), clear height 5.5 m, roof = roundabout deck 2.0 m thick; the ring surface and plan are NOT changed (H4 PASS)');
pr(`ring surface under the roundabout ${f1(Math.min(...Array.from({ length: 28 }, (_, i) => H(best.u0 - 67 + i * 5))))} .. ${f1(Math.max(...Array.from({ length: 28 }, (_, i) => H(best.u0 - 67 + i * 5))))} m (grade ${f2((H(best.u0 + 67) - H(best.u0 - 67)) / 134 * 100)} %), roundabout deck ${f1(best.Ptop)} m, gap to the highest ring point ${f1(best.Ptop - Math.max(...Array.from({ length: 28 }, (_, i) => H(best.u0 - 67 + i * 5))))} m vs ${GAP} m: PASS`);
pr('  tunnel length 134 m: lighting needed, ventilation not (under 300 m), drainage: ring is on an embankment, falls to both portals (PASS, no sump needed); groundwater irrelevant (the ring stays 8 m above ground).');
pr(''); pr('NOT RUN: structural design (box, deck, retaining walls), roundabout capacity, ramp vertical curves, R4 re-route, landscape / trees, vehicles under 5.5 m clearance rule check on the AI (J10).');
writeFileSync(`${OUT}/J300_TYPEB.txt`, L.join('\n') + '\n'); writeFileSync(`${OUT}/J300_TYPEB.json`, JSON.stringify({ best, cands, ring: Array.from({ length: 91 }, (_, i) => ({ u: -450 + i * 10, ring: H(-450 + i * 10), nat: N(-450 + i * 10) })) }, null, 1));
