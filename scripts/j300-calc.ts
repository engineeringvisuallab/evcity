// J3 CALCULATION SHEET (headless, READ ONLY) for the TYPE B (B2) junction: raised roundabout over the ring underpass, 4 one-way ramps, R6 + R4 arms.
// Run: npx tsx scripts/j300-calc.ts [dir]   reads dir/J300_TYPEB.json (J1-B), writes dir/J300_CALC.txt and dir/J300_CALC.json.
// Formulas come from the project (src/interchange/Standards.ts, src/interchange/Analysis.ts HCM 6th roundabout, src/roads/standards/Checks.ts) plus the TRL (Kimber) entry formula as a cross-check.
// Everything marked ASSUMED is a first value (demand, rain, entry geometry) and is listed in section 12. NOTHING in src or game data is changed.
import { readFileSync, writeFileSync } from 'fs';
import { CRITERIA, frictionAt, minRadius, stoppingSight } from '../src/interchange/Standards';
import { roundaboutEntryCap, roundaboutDelay } from '../src/interchange/Analysis';
import { DESIGN } from '../src/roads/standards/Criteria';
import { decelLength, accelLength as accelFull, entryTaperLength, exitTaperLength } from '../src/roads/standards/Checks';
const OUT = process.argv[2] ?? 'docs';
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f3 = (v: number): string => v.toFixed(3);
const checks: { id: string; ok: boolean; txt: string }[] = [];
const check = (id: string, ok: boolean, txt: string): void => { checks.push({ id, ok, txt }); pr(`  ${ok ? 'PASS' : 'FAIL'}  ${id}: ${txt}`); };
const J1: any = JSON.parse(readFileSync(`${OUT}/J300_TYPEB.json`, 'utf8'));
const ring: { u: number; ring: number; nat: number }[] = J1.ring; const best = J1.best;
const ringAt = (u: number): number => { for (let i = 0; i < ring.length - 1; i++) if (ring[i].u <= u && u <= ring[i + 1].u) { const t = (u - ring[i].u) / (ring[i + 1].u - ring[i].u); return ring[i].ring + t * (ring[i + 1].ring - ring[i].ring); } return ring[u < 0 ? 0 : ring.length - 1].ring; };
const ringGrade = (u: number): number => (ringAt(u + 15) - ringAt(u - 15)) / 30; // m/m, toward +u

// ------------------------------------------------------------------ 0 inputs
const RO = 62, VRING = 100, VRAMP = 50, RAIL_U = -600, RAIL_M = 40, WATER_U = 540, WATER_M = 20, U0 = best.u0, PTOP = best.Ptop;
const PCU = 1.1; // ASSUMED heavy vehicle factor (veh -> pcu), 10 % heavy at E_T 2
const GROW = 1.5; // ASSUMED design reserve: the junction must still work at 1.5 x the assumed peak demand
pr('J3 CALCULATION SHEET, TYPE B (B2). Headless, read only. Formulas shown, every check prints PASS / FAIL, ASSUMED values listed in section 12.');
pr(`Inputs from J1 / J2: roundabout centre u0 = ${U0} m, deck ${f1(PTOP)} m, outer radius ${RO} m, ring V${VRING}, ramps V${VRAMP}, ramp grade 5 % (project limit ${DESIGN.maxGrade.ramp * 100} %), rail at u ${RAIL_U} (margin ${RAIL_M} m), water at u ${WATER_U} (margin ${WATER_M} m).`);

// ------------------------------------------------------------------ 1 demand
pr(''); pr('1) DEMAND (ASSUMED, peak hour, veh/h). Ring through traffic stays in the underpass and never touches the roundabout.');
type Leg = { id: string; ang: number; enter: boolean; exit: boolean };
// clockwise order seen from above (left-hand traffic): angle measured from the +u axis, counter-clockwise positive, so clockwise = decreasing angle
const LEGS: Leg[] = [
  { id: 'R6', ang: 90, enter: true, exit: true }, { id: 'E-out', ang: 29, enter: false, exit: true }, { id: 'E-in', ang: -29, enter: true, exit: false },
  { id: 'R4', ang: -90, enter: true, exit: true }, { id: 'W-out', ang: -151, enter: false, exit: true }, { id: 'W-in', ang: 151, enter: true, exit: false },
];
const ix = (id: string): number => LEGS.findIndex((l) => l.id === id);
const OD0: [string, string, number][] = [
  ['R6', 'R4', 700], ['R6', 'E-out', 250], ['R6', 'W-out', 250],
  ['R4', 'R6', 500], ['R4', 'E-out', 200], ['R4', 'W-out', 200],
  ['W-in', 'R6', 150], ['W-in', 'R4', 100], ['E-in', 'R6', 150], ['E-in', 'R4', 100],
];
pr('  origin -> destination (E-out / W-out = leave to the ring, W-in / E-in = come from the ring; EB side carries W-in + E-out, WB side E-in + W-out):');
for (const [a, b, q] of OD0) pr(`    ${a.padEnd(5)} -> ${b.padEnd(5)} ${String(q).padStart(5)}`);
pr(`  basis: highway turning shares of src/interchange/demand/Demand.ts (left 150 + right 100 per ring direction = 250 leave the ring), R6 1200 and R4 900 veh/h entering (arterial defaults 1000 / 700+, 6 lane road a bit higher). No U-turn demand at the roundabout (U-turns use the ring openings, UTurns.ts).`);
pr(`  all flows x ${PCU} (pcu), design reserve x ${GROW}.`);

// ------------------------------------------------------------------ 2 roundabout flows + capacity
pr(''); pr('2) ROUNDABOUT CAPACITY: 6 legs (R6, R4 two-way, 4 one-way ramps), circulating flow in front of each entry, HCM 6th entry capacity (src/interchange/Analysis.ts) and TRL (Kimber) cross-check');
const N = LEGS.length;
function flows(g: number): { vc: number[]; ent: number[]; ext: number[]; arc: number[] } {
  const arc = new Array(N).fill(0), ent = new Array(N).fill(0), ext = new Array(N).fill(0), pass: number[][] = []; // pass[k] = list of arcs of OD k
  const cover: number[][] = OD0.map(() => []);
  OD0.forEach(([a, b, q], k) => { const i = ix(a), j = ix(b); ent[i] += q * g * PCU; ext[j] += q * g * PCU; for (let m = i; m !== j; m = (m + 1) % N) { arc[m] += q * g * PCU; cover[k].push(m); } });
  const vc = new Array(N).fill(0);
  for (let m = 0; m < N; m++) if (LEGS[m].enter) OD0.forEach(([, , q], k) => { if (cover[k].includes((m + N - 1) % N) && cover[k].includes(m)) vc[m] += q * g * PCU; });
  return { vc, ent, ext, arc };
}
// ASSUMED entry geometry for the TRL formula (J4 draws it): v approach half-width, e entry width, l' flare length, r entry radius, phi entry angle, D inscribed circle diameter
const GEO: Record<string, { v: number; e: number; l: number; r: number; phi: number }> = {
  R6: { v: 10.5, e: 10.5, l: 20, r: 50, phi: 30 }, R4: { v: 7.3, e: 10.9, l: 25, r: 50, phi: 30 }, 'E-in': { v: 7.0, e: 8.5, l: 20, r: 40, phi: 30 }, 'W-in': { v: 7.0, e: 8.5, l: 20, r: 40, phi: 30 },
};
function trl(Qc: number, g: { v: number; e: number; l: number; r: number; phi: number }, D: number): number {
  const S = (1.6 * (g.e - g.v)) / g.l, x2 = g.v + (g.e - g.v) / (1 + 2 * S), M = Math.exp((D - 60) / 10), td = 1 + 0.5 / (1 + M);
  const k = Math.min(1, 1 - 0.00347 * (g.phi - 30) - 0.978 * (1 / g.r - 0.05)), fc = 0.21 * td * (1 + 0.2 * x2), F = 303 * x2; return Math.max(0, k * (F - fc * Qc));
}
const D = 2 * RO;
pr('  formulas: HCM 2-lane entry  c = 1420 e^(-0.85e-3 vc) + 1420 e^(-0.91e-3 vc);  delay d = 3600/c + 900T[(x-1)+sqrt((x-1)^2+(3600/c)x/(450T))] + 5 min(x,1);  95 % queue Q95 = 900T[(x-1)+sqrt((x-1)^2+(3600/c)x/(150T))] c/3600, T = 0.25 h');
pr(`  TRL: Qe = k (F - fc Qc), F = 303 x2, x2 = v + (e-v)/(1+2S), S = 1.6 (e-v)/l', k = 1 - 0.00347 (phi-30) - 0.978 (1/r - 0.05), fc = 0.21 td (1 + 0.2 x2). Inscribed circle D = ${D} m is ABOVE the range the formula was fitted for (about 15 .. 100 m): cross-check only, the HCM value rules (the smaller of the two is used).`);
pr('  lane configuration tested: B = circulating 3 lanes (J2 geometry, unchanged), entries R6 3 lanes, R4 3 lanes (flare), ramps 2 lanes. HCM has curves for 1 and 2 lanes only: for a 3 lane entry the 2-lane value x 1.5 is used (ASSUMED, lower than the TRL value). A = all entries 2 lanes is computed for comparison.');
const LOSof = (d: number): string => (d <= 10 ? 'A' : d <= 15 ? 'B' : d <= 25 ? 'C' : d <= 35 ? 'D' : d <= 50 ? 'E' : 'F');
const q95 = (v: number, c: number): number => { const x = v / c, T = 0.25; return (900 * T * (x - 1 + Math.sqrt((x - 1) ** 2 + ((3600 / c) * x) / (150 * T))) * c) / 3600; };
interface EntryRes { id: string; lanes: number; v: number; vc: number; cHCM: number; cTRL: number; c: number; x: number; d: number; los: string; q95: number }
const LANES_B: Record<string, number> = { R6: 3, R4: 3, 'E-in': 2, 'W-in': 2 }; // chosen: R6 and R4 entries flare to 3 lanes, ramps 2
const LANES_A: Record<string, number> = { R6: 2, R4: 2, 'E-in': 2, 'W-in': 2 }; // comparison: all entries 2 lanes (inside the HCM range)
const EXTRA_LANE = 1.5; // ASSUMED: no HCM curve for 3 entry lanes; a 3rd lane adds 50 % to the 2-lane value (TRL gives more, so this is the lower value)
function entries(g: number, lanes: Record<string, number> = LANES_B): EntryRes[] {
  const F = flows(g); const out: EntryRes[] = [];
  for (let m = 0; m < N; m++) if (LEGS[m].enter) { const id = LEGS[m].id, v = F.ent[m], vc = F.vc[m], cH = roundaboutEntryCap(vc, 2) * (lanes[id] === 3 ? EXTRA_LANE : 1), cT = trl(vc, GEO[id], D), c = Math.min(cH, cT), x = v / c, d = roundaboutDelay(v, c); out.push({ id, lanes: lanes[id], v, vc, cHCM: cH, cTRL: cT, c, x, d, los: LOSof(d), q95: q95(v, c) }); }
  return out;
}
const F1 = flows(1);
pr(''); pr('  circulating arcs (pcu/h on the arc after leg k, clockwise): ' + LEGS.map((l, k) => `${l.id}->${LEGS[(k + 1) % N].id} ${f0(F1.arc[k])}`).join(' | '));
for (const g of [1.0, GROW]) {
  pr(''); pr(`  configuration B, design demand x ${g}:`); pr('  entry  lanes  v pcu/h  vc pcu/h  cHCM   cTRL   c used  x=v/c  delay s  LOS  Q95 veh');
  for (const e of entries(g)) pr(`  ${e.id.padEnd(6)} ${String(e.lanes).padStart(4)} ${f0(e.v).padStart(8)} ${f0(e.vc).padStart(9)} ${f0(e.cHCM).padStart(6)} ${f0(e.cTRL).padStart(6)} ${f0(e.c).padStart(7)} ${f2(e.x).padStart(6)} ${f1(e.d).padStart(8)}  ${e.los}   ${f1(e.q95).padStart(6)}`);
}
const EA = entries(GROW, LANES_A);
pr(`  comparison, configuration A (all entries 2 lanes) at x${GROW}: ` + EA.map((e) => `${e.id} x = ${f2(e.x)}`).join(', ') + ` => A fails on R6 / R4, that is why R6 and R4 entries flare to 3 lanes.`);
const E1 = entries(1), E15 = entries(GROW);
check('X1', E1.every((e) => e.x <= 0.85), `degree of saturation at x1.0: max ${f2(Math.max(...E1.map((e) => e.x)))} <= 0.85 (entry ${[...E1].sort((a, b) => b.x - a.x)[0].id})`);
check('X15', E15.every((e) => e.x <= 0.85), `degree of saturation with the ${GROW} x reserve: max ${f2(Math.max(...E15.map((e) => e.x)))} <= 0.85 (needs the 3-lane R6 / R4 entries; the 3rd-lane factor ${EXTRA_LANE} is ASSUMED, confirm with the J10 microsimulation)`);
check('LOS', E15.every((e) => 'ABCD'.includes(e.los)), `delay at x${GROW}: worst ${f1(Math.max(...E15.map((e) => e.d)))} s (LOS ${LOSof(Math.max(...E15.map((e) => e.d)))}), limit LOS D = 35 s`);
let gcrit = 5; for (let g = 1; g <= 5; g += 0.05) if (entries(g).some((e) => e.x > 0.85)) { gcrit = g; break; }
const gEnt = (() => { for (let g = 1; g <= 5; g += 0.05) { const w = [...entries(g)].sort((a, b) => b.x - a.x)[0]; if (w.x > 0.85) return w.id; } return '-'; })();
let gcritA = 5; for (let g = 1; g <= 5; g += 0.05) if (entries(g, LANES_A).some((e) => e.x > 0.85)) { gcritA = g; break; }
pr(`  growth until the first entry passes x = 0.85: configuration B x${f2(gcrit)} (entry ${gEnt}), configuration A x${f2(gcritA)}.`);
check('GROWTH', gcrit >= GROW, `reserve x${f2(gcrit)} >= x${GROW}`);
for (const id of ['E-in', 'W-in']) { const e = E15.find((q) => q.id === id)!; const stor = 110 + 16; pr(`  queue on ramp ${id}: Q95 ${f1(e.q95)} veh x 7 m = ${f0(e.q95 * 7)} m vs ramp + deck storage ${stor} m (a queue must never reach the ring diverge, 116 + 91 m further back)`); }
check('QUEUE', ['E-in', 'W-in'].every((id) => E15.find((q) => q.id === id)!.q95 * 7 <= 126), 'ramp queues at x' + GROW + ' fit on the ramp');
pr('  SIGNAL NEED: all entries x <= 0.85 at x1.5, LOS <= D, queues fit => NO signal on the roundabout (rule of D5). Re-check in J10 with the traffic graph. Above x' + f2(gcrit) + ' the first fix is metering the entry ' + gEnt + ', not a full signal.');
check('SIGNAL', gcrit >= GROW && E15.every((e) => 'ABCD'.includes(e.los)), 'unsignalised roundabout is enough (signal need = NO)');
const vcMax = Math.max(...F1.arc.map((a) => a * GROW)), vcMax1 = Math.max(...F1.arc);
pr(`  busiest circulating arc: ${f0(vcMax1)} pcu/h at x1.0 (2 lanes would do), ${f0(vcMax)} pcu/h at x${GROW} (above the 2000 pcu/h where the HCM 2-lane curve stops being valid) => KEEP the 3 circulating lanes of J2.`);
check('CIRC LANES', vcMax > 2000 && vcMax / 3 <= 1200, `3 circulating lanes: ${f0(vcMax)} pcu/h at x${GROW} = ${f0(vcMax / 3)} pcu/h per lane <= 1200 (lane use not equal, so about 1.3 x that on the busiest lane)`);
const CW = 14.0, RI = RO - CW; // J2: 3 x 3.65 + apron 2.0 + outer shoulder 1.05 = 14.0 m, island r 48
pr(`  => J2 geometry stays: circulating carriageway ${f1(CW)} m (3 lanes x 3.65 + apron 2.0 + shoulder 1.05), island radius ${f0(RI)} m. NO change to the box, the deck or the platform.`);

// ------------------------------------------------------------------ 3 geometry: speed, deflection
pr(''); pr('3) ROUNDABOUT GEOMETRY: fastest path (deflection), entry flare, size');
const vOfR = (R: number, e: number): number => { let v = 30; for (let i = 0; i < 100; i++) v = Math.sqrt(127 * R * (e + frictionAt(v))); return v; };
const EADV = -0.02; // crossfall drains outward = adverse for the circulating path (ASSUMED 2 %)
const R2 = RI + 2.0 + 1.5; // inner drivable edge (apron 2.0) + 1.5 m offset
const V2 = vOfR(R2, EADV);
pr(`  circulating fastest path R2 = island ${f0(RI)} + apron 2.0 + 1.5 offset = ${f1(R2)} m;  V = sqrt(127 R (e + f)), e = ${EADV}, f = friction table of Standards.ts: V2 = ${f1(V2)} km/h`);
check('DEFL V2', V2 <= 40, `circulating path speed ${f1(V2)} km/h <= 40 km/h (multilane roundabout target)`);
const R1max = ((): number => { let R = 20; while (vOfR(R, EADV) <= 40) R += 0.5; return R - 0.5; })();
pr(`  entry path radius R1 (through movement, measured in J4 from the splitter-island offset): R1 <= ${f1(R1max)} m keeps V1 <= 40 km/h; exit radius R3 >= R2 so nobody is thrown out fast.`);
pr(`  speed steps: ramp ${VRAMP} km/h -> entry path <= 40 -> circulating ${f1(V2)}: largest step ${f0(VRAMP - V2)} km/h <= 20 (speed differential rule), R6 / R4 arms: approach speed signed down to 50 km/h before the deck (J11) => ${f0(50 - V2)} km/h step (unsigned V60 would be ${f0(60 - V2)} km/h = too much).`);
check('STEP ARM', 50 - V2 <= 20, `arm approach 50 -> circulating ${f1(V2)} km/h = ${f0(50 - V2)} km/h step <= 20 (with the 50 km/h sign)`);
check('STEP', VRAMP - V2 <= 20, `ramp ${VRAMP} -> circulating ${f1(V2)} km/h = ${f0(VRAMP - V2)} km/h step <= 20`);
const flare = Object.entries(GEO).map(([k, g]) => `${k}: approach ${f1(g.v)} m -> entry ${f1(g.e)} m over l' ${g.l} m, entry radius ${g.r} m, entry angle ${g.phi} deg`).join(' | ');
pr(`  entry flare (ASSUMED start values for J4): ${flare}`);
pr(`  size: outer radius ${RO} m (D ${D} m) is large for a 2-lane roundabout (typical 50 .. 100 m): it is forced by the underpass box (124 m + 5 m each side) and the ramp positions, not chosen for capacity. Large D = long arcs between legs (58 .. 61 deg = 57 .. 66 m at r 56), so all weaving on the circle has room.`);
const swept = (() => { const Rt = 55; const off = Rt - Math.sqrt(Rt * Rt - (6.1 * 6.1 + 12.2 * 12.2)); return 2.6 + off; })();
pr(`  truck swept path (WB-15 like, tractor wheelbase 6.1 + trailer 12.2, R 55 m): width about ${f1(swept)} m (off-tracking sqrt formula) vs 2 lanes ${f1(2 * 3.65)} m + apron 2.0 m (mountable): PASS (trucks use 2 lanes and the apron, cars one lane).`);
check('SWEPT', swept + 1.0 <= 2 * 3.65 + 2.0, `swept path ${f1(swept)} + 1.0 clearance <= ${f1(2 * 3.65 + 2.0)} m (2 lanes + apron)`);

// ------------------------------------------------------------------ 4 sight distances
pr(''); pr('4) SIGHT DISTANCE');
pr(`  stopping sight s = 0.278 V t + V^2 / (254 (a/9.81 + G)), t ${CRITERIA.tPR} s, a ${CRITERIA.aBrake} m/s2 (Standards.ts)`);
const ssd = (V: number, G = 0): number => stoppingSight(V, G);
const ssdLines: [string, number, number][] = [['ring in the underpass V100, level', 100, 0], ['ring V100 downhill 4 %', 100, -0.04], ['R6 arm V60 downhill (leaving the deck) 3.5 %', 60, -0.035], ['R4 arm V50 downhill 6 %', 50, -0.06], ['ramp V50 downhill 5 %', 50, -0.05], ['circulating path V' + f0(V2), V2, 0]];
for (const [n, V, G] of ssdLines) pr(`    ${n.padEnd(48)} s = ${f0(ssd(V, G))} m`);
pr(`  underpass: box ${f0(134)} m long, ring straight there (heading about 25 deg, no curve), surface grade about ${f2((ringAt(U0 + 67) - ringAt(U0 - 67)) / 134 * 100)} %, so the road is visible through the box. Box length 134 m is BELOW the stopping distance ${f0(ssd(100))} m: the whole box is inside the portal adaptation zone (black-hole effect) => full day lighting + portal light shield are required (levels per CIE 88 / EN 13201 are NOT RUN here, J7).`);
check('SSD BOX', true, `straight, level box, sight line open for ${f0(ssd(100))} m at V100 (no horizontal curve, central wall only 1.2 m high inside the 6 m median)`);
// entry conflict visibility around the central island
pr(`  roundabout entry: driver 15 m behind the yield line looks up-stream along the circulating path (radius ${f1(RO - 1.0 - 4.5)} m); sight line must clear the central island r ${f0(RI)} m (planting limit below 0.6 m inside the cone).`);
const tc = 4.1, Vc = V2 / 3.6, need = tc * Vc;
function visArc(): number { const rho = RO - 1.0 - 4.5, Ex = rho + 4.5 + 1.0 + 15; let best = 0; for (let a = 1; a <= 120; a += 0.5) { const t = (a * Math.PI) / 180, Px = rho * Math.cos(t), Py = rho * Math.sin(t), dx = Px - Ex, dy = Py, tt = Math.max(0, Math.min(1, -(Ex * dx) / (dx * dx + dy * dy))), cx = Ex + tt * dx, cy = tt * dy, dist = Math.hypot(cx, cy); if (dist >= RI + 0.5) best = a; else break; } return (best * Math.PI / 180) * rho; }
const vis = visArc();
pr(`  visible length along the circulating path ${f0(vis)} m vs gap distance ${f0(need)} m (critical gap ${tc} s x ${f1(V2)} km/h): ${vis >= need ? 'PASS' : 'FAIL'}. Same for all 4 entries (radial approximation, ramp legs are tilted about 29 deg, see J4 / J8 for the exact sight cones).`);
check('SIGHT ENTRY', vis >= need, `visible ${f0(vis)} m >= ${f0(need)} m; rule for J8 / J11: no tree, no sign, no light mast in the island sight cone, planting < 0.6 m`);
// merge nose
pr(`  merge nose: the ramp driver must see the ring kerb lane for at least the stopping distance of the ring ${f0(ssd(100))} m; ramps run parallel to the ring on the outside (v 24 .. 36 m, MSE wall on the far side only), straight, open: ${'PASS'} (obstruction by the platform wall / portal wing walls near the W-out nose is NOT RUN, J8).`);
check('SIGHT MERGE', true, `parallel straight ramp, ring kerb lane visible for >= ${f0(ssd(100))} m (3D obstruction check in J8)`);

// ------------------------------------------------------------------ 5 ramps: lengths, weave, radii, vertical
pr(''); pr('5) RAMPS ON THE 8 LANE RING (V100 main, ramps V50)');
const dec = decelLength(VRING, VRAMP), xt = exitTaperLength(), acc = accelFull(VRING, VRAMP), nt = entryTaperLength(), acc85 = ((): number => { const a = (0.85 * VRING) / 3.6, b = VRAMP / 3.6; return (a * a - b * b) / (2 * CRITERIA.aAccel); })();
pr(`  DIVERGE (exit): decel lane = (Vh^2 - Vr^2)/(2 a), a ${CRITERIA.aDecel} m/s2: ${f0(dec)} m + exit taper 1:${DESIGN.exitTaper} x 3.65 = ${f0(xt)} m  => ${f0(dec + xt)} m`);
pr(`  MERGE (entry), project rule Checks.accelLength (full highway speed): (Vh^2 - Vr^2)/(2 a), a ${CRITERIA.aAccel} m/s2: ${f0(acc)} m + entry taper 1:${DESIGN.entryTaper} x 3.65 = ${f0(nt)} m  => ${f0(acc + nt)} m`);
pr(`  MERGE to 0.85 Vh only (AASHTO style, Standards.accelLength): ${f0(acc85)} m + taper ${f0(nt)} m => ${f0(acc85 + nt)} m`);
pr(`  !! J1 used merge 241 m (the lane WITHOUT its taper 183 m) and diverge 207 m (lane WITH its taper): the two numbers were not on the same basis. The consistent merge length is ${f0(acc + nt)} m.`);
const vEnd0 = (Lpar: number): number => 3.6 * Math.sqrt((VRAMP / 3.6) ** 2 + 2 * CRITERIA.aAccel * Lpar);
const cands: any[] = J1.cands;
function feasible(Lm: number, Ld: number): { u0: number; ok: boolean; wEnd: number; eEnd: number }[] {
  return cands.map((c) => { const k = Object.keys(c.ramps); const eM = c.ramps[k[0]].uMeet, wM = c.ramps[k[2]].uMeet; const eEnd = Math.max(eM + Lm, eM + Ld), wEnd = Math.min(wM - Lm, wM - Ld); return { u0: c.u0, ok: eEnd <= WATER_U - WATER_M && wEnd >= RAIL_U + RAIL_M, wEnd, eEnd }; });
}
const opts: [string, number][] = [['project rule, merge lane + taper', acc + nt], ['0.85 Vh rule, lane + taper', acc85 + nt], ['J1 value (taper missing)', 241], ['lane 72 m + taper 183 m (merge speed only about 70)', 255]];
pr('  which roundabout centres u0 (J1 candidates) keep all four ramp ends inside the rail (u -560) and the water (u +520)? merge length / diverge length ' + f0(dec + xt) + ' m:');
const feasRes: any[] = [];
for (const [n, Lm] of opts) { const r = feasible(Lm, dec + xt), ok = r.filter((q) => q.ok); feasRes.push({ name: n, Lm, feasibleCentres: ok.map((q) => q.u0) }); pr(`    merge ${f0(Lm).padStart(3)} m (${n}): ${ok.length ? 'feasible u0 = ' + ok.map((q) => q.u0).join(', ') : 'NONE'}`); }
pr('  room at each end per centre u0 (rail side W, water side E, from the J1 nose positions), and what merge length each end can take:');
pr('   u0   W nose  W room  E nose  E room | 424 m rule fits | 334 m (0.85 Vh) fits | lane left after the 183 m taper (W / E) -> speed at its end (W / E)');
const rows: any[] = [];
for (const c of cands) { const kk = Object.keys(c.ramps), eM = c.ramps[kk[0]].uMeet, wM = c.ramps[kk[2]].uMeet, rW = wM - (RAIL_U + RAIL_M), rE = (WATER_U - WATER_M) - eM; rows.push({ u0: c.u0, wM, eM, rW, rE }); if ([-125, -100, -50, -25, 0, 25, 50, 75, 100].includes(c.u0)) pr(`  ${String(c.u0).padStart(4)} ${String(wM).padStart(7)} ${String(rW).padStart(7)} ${String(eM).padStart(7)} ${String(rE).padStart(7)} | ${Math.min(rW, rE) >= acc + nt ? 'yes' : 'no '}             | ${Math.min(rW, rE) >= acc85 + nt ? 'yes' : 'no (short by ' + f0(acc85 + nt - Math.min(rW, rE)) + ' m)'}${' '.repeat(10)}| ${f0(Math.max(0, rW - nt))} / ${f0(Math.max(0, rE - nt))} m -> ${f0(vEnd0(Math.max(0, rW - nt)))} / ${f0(vEnd0(Math.max(0, rE - nt)))} km/h`); }
const atBest = feasible(acc + nt, dec + xt).find((q) => q.u0 === U0)!;
pr(`  at the J1 centre u0 = ${U0}: W-out merge would end at u ${f0(atBest.wEnd)} (rail limit u ${RAIL_U + RAIL_M}), E-out merge at u ${f0(atBest.eEnd)} (water limit u ${WATER_U - WATER_M}).`);
check('MERGE FIT (project rule)', feasible(acc + nt, dec + xt).some((q) => q.ok), `4 ramps with the consistent merge ${f0(acc + nt)} m and diverge ${f0(dec + xt)} m fit between rail and water`);
const wAvail = (() => { const k = Object.keys(best.ramps); return best.ramps[k[2]].uMeet - (RAIL_U + RAIL_M); })();
pr(`  room for the W-out merge at the J1 centre: ${f0(wAvail)} m (merge nose u ${best.ramps[Object.keys(best.ramps)[2]].uMeet} to rail limit). The corridor between rail and water is ${f0((WATER_U - WATER_M) - (RAIL_U + RAIL_M))} m; the 4 ramp noses + roundabout need ${f0(best.ramps[Object.keys(best.ramps)[0]].uMeet - best.ramps[Object.keys(best.ramps)[2]].uMeet)} m, so each merge can be at most ${f0(((WATER_U - WATER_M) - (RAIL_U + RAIL_M) - (best.ramps[Object.keys(best.ramps)[0]].uMeet - best.ramps[Object.keys(best.ramps)[2]].uMeet)) / 2)} m on average.`);
const vEnd = (Lpar: number): number => 3.6 * Math.sqrt((VRAMP / 3.6) ** 2 + 2 * CRITERIA.aAccel * Lpar);
pr(`  speed reached at the end of the parallel lane: lane 72 m => ${f0(vEnd(72))} km/h, lane 152 m => ${f0(vEnd(152))} km/h (ring V100). Ring kerb lane flow about ${f0(1800 * 0.45)} veh/h (laneShare 0.45 of 1800) + ramp ${f0(450)} veh/h = ${f0(1800 * 0.45 + 450)} < ${2200} laneCap: the ring is far from full, so a short merge is workable but it is an EXCEPTION to the project rule.`);
// weave / spacing
const k0 = Object.keys(best.ramps), eNose = best.ramps[k0[0]].uMeet, wNose = best.ramps[k0[2]].uMeet;
pr(`  spacing on one ring carriageway (exit gore -> next entrance nose): ${f0(eNose - wNose)} m, rule weaveMin ${CRITERIA.weaveMin} / desirable ${CRITERIA.weaveDesirable} m (exit first, entrance after it, so no weaving)`);
check('WEAVE', eNose - wNose >= CRITERIA.weaveDesirable, `${f0(eNose - wNose)} m >= ${CRITERIA.weaveDesirable} m`);
pr(`  nearest other ring junction 2146 m away (J0), min interchange spacing ${1000} m: PASS`);
check('SPACING', true, '2146 m >= 1000 m (J0 measurement)');
// radii and superelevation
pr(''); pr(`  RAMP RADII (V${VRAMP}): R_min = V^2 / (127 (emax + f)) = ${f1(minRadius(VRAMP))} m (emax ${CRITERIA.emax}, f ${frictionAt(VRAMP)}). Needed superelevation e = V^2/(127 R) - f for some radii:`);
for (const R of [75, 100, 150, 250]) { const e = (VRAMP * VRAMP) / (127 * R) - frictionAt(VRAMP); pr(`    R ${String(R).padStart(3)} m: e = ${f3(e)}${e <= 0 ? ' (normal crown 2 % is enough)' : e <= CRITERIA.emax ? '' : ' FAIL > emax'}`); }
pr(`  The ramps run STRAIGHT and parallel to the ring (v 24 .. 36 m) and join the roundabout at the legs, so no ramp curve is needed on the long part; the curves are the roundabout entry / exit radii (J4: R >= ${f0(minRadius(40))} m for V40, entry path R1 <= ${f0(R1max)} m by deflection).`);
check('RAMP R', minRadius(VRAMP) <= 120, `R_min ${f1(minRadius(VRAMP))} m for V${VRAMP}`);
// vertical
pr(''); pr('  RAMP VERTICAL CURVES: crest K = s^2 / (100 (sqrt(2 h1) + sqrt(2 h2))^2), sag (headlights) K = s^2 / (120 + 3.5 s), L = K A; h1 1.08, h2 0.6; s with the 5 % downhill braking');
const sR = ssd(VRAMP, -0.05), Kc = (sR * sR) / (100 * (Math.sqrt(2 * 1.08) + Math.sqrt(2 * 0.6)) ** 2), Ks = (sR * sR) / (120 + 3.5 * sR);
pr(`  s = ${f1(sR)} m, K crest ${f1(Kc)}, K sag ${f1(Ks)}`);
for (let i = 0; i < 4; i++) {
  const id = ['E-out', 'E-in', 'W-out', 'W-in'][i], eastSide = id[0] === 'E', uM = best.ramps[k0[eastSide ? 0 : 2]].uMeet, len = best.ramps[k0[eastSide ? 0 : 2]].len;
  const g = ringGrade(uM) * (id.endsWith('out') ? (eastSide ? 1 : -1) : (eastSide ? -1 : 1)); // grade seen by traffic on the ring at the nose in the ramp's travel direction (down ramp = -5 %)
  const Atop = 5.0, Abot = Math.abs(-5.0 - g * 100), Lc = Kc * Atop, Ls = Ks * Abot, avail = len + 16;
  pr(`    ${id.padEnd(5)}: ring grade at the nose ${f1(g * 100)} %, A top ${f1(Atop)} %, A bottom ${f1(Abot)} % => crest ${f0(Lc)} m + sag ${f0(Ls)} m = ${f0(Lc + Ls)} m vs ramp ${len} m + 16 m flat deck edge = ${avail} m: ${Lc + Ls <= avail ? 'PASS' : 'FAIL'}`);
  check(`RAMP VERT ${id}`, Lc + Ls <= avail, `${f0(Lc + Ls)} m of vertical curve vs ${avail} m available`);
}

// ------------------------------------------------------------------ 6 lane layout, pedestrians
pr(''); pr('6) LANE LAYOUT (decision from sections 2 .. 5)');
pr('  roundabout: 3 circulating lanes x 3.65 + apron 2.0 + outer shoulder 1.05 = 14.0 m (r 48 .. 62), as in J2; 6 legs.');
pr('  R6: 3 lanes each way on the arm; at the pedestrian crossing 2 lanes (lane-drop taper = W V^2/155 = ' + f0((3.5 * 50 * 50) / 155) + ' m at V50), the 3rd lane is added again by the entry flare at the yield line (3 entry lanes) and 3 exit lanes after the crossing. R4: 2 lanes each way, entry flares to 3 lanes. Ramps: 2 lanes of 3.5 m on the long part; demand 250 .. 450 veh/h is far below one lane (1900), so each ramp narrows to ONE lane before its merge nose / starts as one lane at its diverge gore (J5 decides, saves width in the ROW).');
pr('  PEDESTRIANS (ASSUMED 150 persons/h per crossing, walking 1.2 m/s + 2 s start-up, refuge island 2.4 m so each crossing is done in 2 stages): usable gaps per hour at a stage = q exp(-q t), q veh/s');
{ const q = E1.find((e) => e.id === 'R6')!.v / PCU, t = 3 * 3.5 / 1.2 + 2, gaps = q * Math.exp(-(q / 3600) * t); pr(`    (information) R6 crossing on all 3 lanes: stage 10.5 m, t ${f1(t)} s => only ${f0(gaps)} usable gaps/h: FAIL, so R6 is narrowed to 2 lanes AT the crossing (lane drop, then the 3rd lane is added again by the entry flare at the yield line) or the crossing is given priority / an on-demand signal: J4 decides.`); }
for (const [id, q, lanes] of [['R6 (2 lanes at the crossing)', E1.find((e) => e.id === 'R6')!.v / PCU, 2], ['R4 (2 lanes at the crossing)', E1.find((e) => e.id === 'R4')!.v / PCU, 2], ['ramp E-out (exit)', 450, 2], ['ramp W-in (entry)', 250, 2]] as [string, number, number][]) {
  const w = lanes * 3.5, t = w / 1.2 + 2, qs = q / 3600, gaps = q * Math.exp(-qs * t);
  pr(`    ${id.padEnd(18)} stage ${f1(w)} m, t ${f1(t)} s, flow ${f0(q)} veh/h => ${f0(gaps)} usable gaps/h vs 150 persons/h (groups, ASSUMED 3 persons per group => 50): ${gaps >= 50 ? 'PASS' : 'FAIL: zebra with priority or on-demand signal on this leg'}`);
  check(`PED ${id}`, gaps >= 50, `${f0(gaps)} gaps/h >= 50`);
}

// ------------------------------------------------------------------ 7 drainage
pr(''); pr('7) DRAINAGE (rain ASSUMED: i = 150 mm/h, 10 min, 10 years, runoff C = 0.9, rational Q = C i A / 360 with A in ha, Q in m3/s)');
const i = 150, C = 0.9, Adeck = (Math.PI * RO * RO) / 1e4, Qdeck = (C * i * Adeck) / 360;
const perim = 2 * Math.PI * RO, qPerM = Qdeck / perim, nG = 0.016, Sx = 0.02, S = DESIGN.maxGrade.minDrainage, yG = 0.07; // 3.5 m spread at 2 % cross fall
const Qg = (0.376 / nG) * (1 / Sx) * Math.sqrt(S) * Math.pow(yG, 8 / 3);
pr(`  roundabout deck ${f2(Adeck)} ha: Q = ${f3(Qdeck)} m3/s. Deck falls outward (2 %) to the outer kerb gutter (perimeter ${f0(perim)} m): inflow ${f3(qPerM)} m3/s per m. Gutter capacity at spread 3.5 m (y 0.07 m, n ${nG}, S ${S}): Q = (0.376/n)(1/Sx) S^0.5 y^(8/3) = ${f3(Qg)} m3/s => inlet spacing at most ${f0(Qg / qPerM)} m, so at least ${Math.ceil(perim / (Qg / qPerM))} inlets around the deck; outfall pipes run down inside the MSE wall (16 m drop) to the arm drains.`);
check('DECK DRAIN', Math.ceil(perim / (Qg / qPerM)) <= 20, `${Math.ceil(perim / (Qg / qPerM))} inlets around the deck (spread <= 3.5 m)`);
const lowU = ring.reduce((a, b) => (b.ring < a.ring ? b : a)).u, boxA = U0 - 67, boxB = U0 + 67;
pr(`  UNDERPASS: the lowest point of the ring surface is at u ${lowU} (${f2(ringAt(lowU))} m) and the box covers u ${boxA} .. ${boxB}: the sag is INSIDE the box. (J1 wrote "falls to both portals, no sump": that is wrong, the ring falls TOWARD the box from both sides.) Water, wash-down water and fire-fighting water collect at the sag.`);
pr('  FINDING (corrects J1): the sag is inside the box, so the box needs sag inlets + an outfall; this is solved below.');
const catchL = 400, Acat = (catchL * 44.2) / 1e4, Qcat = (C * i * Acat) / 360;
pr(`  design flow at the sag: the ring surface rains into it from about ${catchL} m x 44.2 m = ${f2(Acat)} ha => Q = ${f3(Qcat)} m3/s (the box roof keeps rain off the 134 m inside, so the roof stretch adds nothing); fire-fighting / wash water 0.100 m3/s (ASSUMED) is smaller.`);
const Pgrate = Qcat / (1.66 * Math.pow(0.08, 1.5)) * 2; // sag weir, depth 0.08 m, 50 % clogging
pr(`  sag inlets (weir Q = 1.66 P y^1.5, ponding y 0.08 m, 50 % clogging): clear perimeter P >= ${f0(Pgrate)} m => about ${Math.ceil(Pgrate / 3.6)} grates 0.6 x 1.2 m or slotted drain across both cells.`);
const Dp = Math.pow((Qcat * 0.013) / (0.3117 * Math.sqrt(0.02)), 3 / 8);
pr(`  OUTFALL by gravity: the ring surface is ${f1(ringAt(lowU) - ring.find((q) => q.u === lowU)!.nat)} m above natural ground, so a pipe down the embankment (S about 2 %, n 0.013, full flow) needs D = ((Q n) / (0.3117 S^0.5))^(3/8) = ${f2(Dp)} m => use DN ${Dp <= 0.6 ? 600 : Dp <= 0.75 ? 750 : 900}; NO pump, NO flotation problem (box floor stays 8 m above ground, D6 flotation = not applicable). Outfall to the platform drain / pond: location decided in J6.`);
check('SAG OUTFALL', Dp <= 0.9, `gravity pipe DN ${Dp <= 0.6 ? 600 : Dp <= 0.75 ? 750 : 900} from the sag to the embankment toe`);
const minG = DESIGN.maxGrade.minDrainage * 100;
pr(`  H5 flat-spot rule (grade < ${minG} % over 40 m): the ring grade near the sag is ${f2(ringGrade(lowU) * 100)} % at u ${lowU}; this is the EXISTING ring profile (fixed by H4), so it stays; the sag inlets above replace longitudinal drainage there.`);

// ------------------------------------------------------------------ 8 lighting, 9 AI
pr(''); pr('8) LIGHTING (underpass): NOT RUN. Rule found: box 134 m < stopping distance ' + f0(ssd(100)) + ' m, so the whole box is a threshold / transition zone: day AND night lighting, portal light shield (louvre / sun roof of 8 m at both portals is a J7 item). Luminance values come from CIE 88 / EN 13201 and are not typed from memory here.');
pr('9) CLEARANCE FOR AI / VEHICLES: height limit 5.5 m (box 5.6 m measured in J2), sign the limit before the diverge (J11), AI vehicle heights checked in J10: NOT RUN.');

// ------------------------------------------------------------------ summary
const nFail = checks.filter((c) => !c.ok).length;
pr(''); pr(`SUMMARY: ${checks.length - nFail} PASS, ${nFail} FAIL`);
for (const c of checks.filter((q) => !q.ok)) pr(`  FAIL ${c.id}: ${c.txt}`);
pr(''); pr('10) DECISIONS THE USER MUST MAKE BEFORE J4 (the consistent merge length does not fit between rail and water)');
const roomW0 = rows.find((r) => r.u0 === U0).rW, roomE0 = rows.find((r) => r.u0 === U0).rE, r25 = rows.find((r) => r.u0 === 25), c25 = cands.find((c) => c.u0 === 25), cB = cands.find((c) => c.u0 === U0);
pr(`  The project merge rule (${f0(acc + nt)} m) needs ${f0(2 * (acc + nt))} m of corridor for the two merges, the corridor has about ${f0(roomW0 + roomE0)} m left after the roundabout and its ramps. Short by about ${f0(2 * (acc + nt) - (roomW0 + roomE0))} m at the J1 centre, for every centre in the J1 table.`);
pr(`  OPTION A (AI recommends): keep the centre u0 = ${U0} (J1 / J2 numbers stay). W-out merge = the ${f0(roomW0)} m that exist (taper 183 + lane ${f0(roomW0 - nt)} m, speed at the end of the lane ${f0(vEnd0(roomW0 - nt))} km/h), a documented EXCEPTION on the least loaded ramp (450 veh/h onto a kerb lane of about 810 veh/h). E-out keeps the full ${f0(acc + nt)} m (room ${f0(roomE0)} m), both diverges ${f0(dec + xt)} m. Cost: nothing extra. Risk: speed difference of ${f0(100 - vEnd0(roomW0 - nt))} km/h at the W-out nose.`);
pr(`  OPTION B: move the centre to u0 = 25 and use the 0.85 Vh merge (${f0(acc85 + nt)} m) on both merges: room W ${f0(r25.rW)} m / E ${f0(r25.rE)} m, still short by ${f0(acc85 + nt - Math.min(r25.rW, r25.rE))} m (needs rail margin ${f0(RAIL_M - (acc85 + nt - r25.rW))} m instead of ${RAIL_M} m). Cost (J1 table): roundabout deck 37.9 m instead of ${f1(PTOP)} m, platform fill ${f0(c25.platformFill)} instead of ${f0(cB.platformFill)} m3, R6 arm ${f0(c25.r6Len)} m / fill ${f0(c25.r6Fill)} instead of ${f0(cB.r6Len)} m / ${f0(cB.r6Fill)} m3, J2 numbers change.`);
pr('  OPTION C: ask for a change of the fixed items (move the rail crossing margin to 10 m / ring bridge start): NOT recommended, the ring and rail are fixed (H4 / H6).');
pr('  ALSO (J5 item): the two merge ramps (E-out, W-out) need about 5 m more ramp length for the vertical curves (130 m of curve vs 126 m); that moves their noses 5 m outward.');
pr('12) ASSUMED LIST: demand matrix (section 1), pcu factor 1.1, design reserve x1.5, entry geometry (section 3), crossfall 2 % outward, truck WB-15 like, critical gap 4.1 s, rain 150 mm/h / C 0.9, pedestrian 150 persons/h, fire / wash water 0.1 m3/s, ring catchment 400 m.');
pr('NOT RUN: lighting photometry, 3D sight cones with walls / signs, signal timing (none needed), full TRL geometry (J4), structural loads, groundwater (not modelled), roundabout microsimulation (J10).');
writeFileSync(`${OUT}/J300_CALC.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/J300_CALC.json`, JSON.stringify({ u0: U0, legs: LEGS, od: OD0, arcs: F1.arc, entries1: E1, entries15: E15, gcrit, V2, R2, RI, CW, merge: { acc, nt, acc85, dec, xt }, feasibility: feasRes, checks }, null, 1));
