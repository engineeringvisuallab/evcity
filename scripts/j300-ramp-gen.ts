// J5 RAMP GENERATOR (headless). Writes src/roads/junction/J300Ramps.ts (GENERATED data, nothing imports it yet) and docs/J300_RAMPS.json.
// Pure math + the real game terrain (read only). Inputs: docs/J300_GEOM.json (J4 legs, frame), docs/J300_CALC.json (J3 merge / diverge lengths), the real planned ring (planRing) for the ring level.
// Run: npx tsx scripts/j300-ramp-gen.ts      Then: npx tsx scripts/j300-ramp-check.ts docs      (what-if scan of the nose position: npx tsx scripts/j300-ramp-gen.ts scan)
// FRAME as J4: local u along the ring, v = LEFT of u (left-hand traffic), origin = roundabout centre. world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw).
// RAMP COORDS (private): X = |u| (distance from the centre along the ring), Y = |v|. Ramp k has side d (+1 east, -1 west) and vSide sv (+1: v > 0, -1: v < 0): u = d X, v = sv Y.
//   E-out d+1 sv+1 (merge)   E-in d+1 sv-1 (diverge)   W-out d-1 sv-1 (merge)   W-in d-1 sv+1 (diverge). Rows are stored OUTWARD (sigma = path distance from the circle edge r = 62, increasing).
// PLAN of one ramp (outward): J4 arc (on the deck) -> straight at Y 30 (2 lanes 7.0) -> lane 2 -> 1 (56.45 m) and S-curve (R 250) of the ring-side edge from Y 26.5 to the ring outer lane edge 19.1, ending at the NOSE X = N
//   -> parallel auxiliary lane (merge: up to 241 m, diverge: up to 116 m, cut short where rail / water end the room) -> taper (merge 182.5 m = 1:50, diverge 91.25 m = 1:25) closing on the ring edge.
// PROFILE: flat deck 35.3 at the circle edge, crest, grade -g (<= 5 %), sag whose END is the nose (level AND slope equal to the ring there, G1), then the ring level.
// ROW = [u, v, headingDeg, sigma, level, natural, width, eAu, eAv, eBu, eBv, onArc, wet]   (eA = ring-side edge, eB = outer edge)
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { stoppingSight } from '../src/interchange/Standards';
import { planRing } from '../src/roads/ring/RingRoad';

const D = Math.PI / 180; const r2 = (x: number): number => Math.round(x * 100) / 100;
const G: any = JSON.parse(readFileSync('docs/J300_GEOM.json', 'utf8')); const C: any = JSON.parse(readFileSync('docs/J300_CALC.json', 'utf8'));
const FR = G.frame; let U0 = FR.u0 as number; let DECK = FR.deckY as number; const yaw = FR.yaw as number; const ux = Math.cos(yaw), uz = Math.sin(yaw);
const toW = (u: number, v: number): { x: number; z: number } => ({ x: FR.ox + u * ux + v * uz, z: FR.oz + u * uz - v * ux });
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const natW = (u: number, v: number): { h: number; wet: number } => { const p = toW(u, v); gen.sampleNatural(p.x, p.z, sc); return { h: sc.h, wet: Number.isFinite(sc.water) && sc.h < sc.water ? 1 : 0 }; };

// ring level: the real planned ring (planRing, finished surface) at the ring axis, tabulated every 5 m of local u from -700 to +800
const PLAN: any = planRing(5);
const ringTab: number[][] = []; let ringOffMax = 0;
for (let u = -700; u <= 800; u += 5) { const p = toW(u, 0); let b = 1e9, y = 0; for (let i = 0; i < PLAN.pts.length; i++) { const d = Math.hypot(PLAN.pts[i][0] - p.x, PLAN.pts[i][1] - p.z); if (d < b) { b = d; y = PLAN.ys[i]; } } ringTab.push([u, y]); if (u >= -450 && u <= 650) ringOffMax = Math.max(ringOffMax, b); }
const ringY = (uL: number): number => { const t = (uL + 700) / 5; const i = Math.max(0, Math.min(ringTab.length - 2, Math.floor(t))); const f = t - i; return ringTab[i][1] + f * (ringTab[i + 1][1] - ringTab[i][1]); };
const ringSlope = (uL: number): number => (ringY(uL + 10) - ringY(uL - 10)) / 20;

// ---- constants (J2 / J3)
const V = 50, RING_EDGE = 19.1 /* 4.5 + 4 x 3.65 */, LANE = 3.65, E_RAMP = 26.5 /* ramp ring-side edge before the shift (centre 30, 2 x 3.5) */, W2 = 7.0, RSH = 250, LDROP = (3.5 * V * V) / 155 /* 56.45 m lane-drop taper */;
const ACC = C.merge.acc, NT = C.merge.nt, DEC = C.merge.dec, XT = C.merge.xt; // 241.13, 182.5, 115.74, 91.25
let RAIL_LIM = -560 - U0 /* ring u -560 -> local */, WATER_LIM = 520 - U0; // local u limits (J3)
const SG = Number(process.env.RAMP_G ?? 0.05); // ramp grade limit (project rule 5 %)
const sS = stoppingSight(V, -SG); // braking distance with the 5 % downhill grade (J3 basis)
const KC = (sS * sS) / (100 * Math.pow(Math.sqrt(2 * 1.08) + Math.sqrt(2 * 0.6), 2)); const KS = (sS * sS) / (120 + 3.5 * sS);
const SH = E_RAMP - RING_EDGE, SX = Math.sqrt(2 * RSH * (SH / 2) - (SH / 2) * (SH / 2)), SLEN = 2 * SX; // S-curve: two arcs R 250, shift 7.4 m, length 85.7 m

interface Spec { id: string; type: 'merge' | 'diverge'; d: 1 | -1; sv: 1 | -1 }
const SPECS: Spec[] = [{ id: 'E-out', type: 'merge', d: 1, sv: 1 }, { id: 'E-in', type: 'diverge', d: 1, sv: -1 }, { id: 'W-out', type: 'merge', d: -1, sv: -1 }, { id: 'W-in', type: 'diverge', d: -1, sv: 1 }];
const laneOf = (sp: Spec, N: number): number => { const room = sp.d > 0 ? WATER_LIM - N : -RAIL_LIM - N; return sp.type === 'diverge' ? Math.max(0, Math.min(DEC, room - XT)) : Math.max(0, Math.min(ACC, room - NT)); };
const taperOf = (sp: Spec): number => (sp.type === 'merge' ? NT : XT);

/** ring-side edge Y_A(X) and outer edge width, straight region onwards (X >= end of the J4 arc) */
const yA = (X: number, N: number): number => { const Xs = N - SLEN; if (X <= Xs) return E_RAMP; if (X >= N) return RING_EDGE; const t = X - Xs; return t <= SX ? E_RAMP - (RSH - Math.sqrt(RSH * RSH - t * t)) : RING_EDGE + (RSH - Math.sqrt(RSH * RSH - (N - X) * (N - X))); };
const widthOf = (X: number, N: number, laneLen: number, tap: number): number => { const Xs = N - SLEN; if (X <= Xs) return W2; if (X <= Xs + LDROP) return W2 - (W2 - LANE) * (X - Xs) / LDROP; if (X <= N + laneLen) return LANE; return Math.max(0, LANE * (1 - (X - (N + laneLen)) / tap)); };

interface Row { u: number; v: number; X: number; w: number; eA: [number, number]; eB: [number, number]; onArc: number }
function plan(sp: Spec, N: number, laneLen: number): { rows: Row[]; arcLen: number } {
  const leg = G.legs.find((l: any) => l.id === sp.id); const q = sp.type === 'merge' ? leg.exit : leg.entry; const cen: number[][] = q.centre; const rows: Row[] = [];
  let arc: number[][]; let Xa: number;
  if (sp.type === 'merge') { arc = cen.filter((c) => c[3] < q.arcLen - 0.3).map((c) => [c[0], c[1]]); arc.push(q.arcEnd); Xa = Math.abs(q.arcEnd[0]); }
  else { const sl = cen[cen.length - 1][3] - q.arcLen; arc = cen.filter((c) => c[3] > sl + 0.3).reverse().map((c) => [c[0], c[1]]); arc.push(q.arcStart); Xa = Math.abs(q.arcStart[0]); }
  const sg = sp.sv; let s = 0;
  const ringSide = sp.type === 'merge' ? -1 : 1; // out ramps: the ring side is the RIGHT of the outward heading, in ramps: the LEFT
  for (let i = 0; i < arc.length; i++) {
    const a = arc[Math.max(0, i - 1)], b = arc[Math.min(arc.length - 1, i + 1)]; const h = Math.atan2(b[1] - a[1], b[0] - a[0]); const nl = [-Math.sin(h), Math.cos(h)];
    if (i > 0) s += Math.hypot(arc[i][0] - arc[i - 1][0], arc[i][1] - arc[i - 1][1]);
    const w = sp.type === 'diverge' ? W2 + 1.5 * Math.max(0, 1 - s / q.flare) : W2; // J4: in ramps flare 7.0 -> 8.5 m over 20 m at the yield line
    rows.push({ u: arc[i][0], v: arc[i][1], X: Math.abs(arc[i][0]), w, eA: [arc[i][0] + ringSide * w / 2 * nl[0], arc[i][1] + ringSide * w / 2 * nl[1]], eB: [arc[i][0] - ringSide * w / 2 * nl[0], arc[i][1] - ringSide * w / 2 * nl[1]], onArc: 1 });
  }
  const arcLen = s; const Xend = N + laneLen + taperOf(sp);
  for (let X = Xa + 2; ; X += 2) { const XX = Math.min(X, Xend); const w = widthOf(XX, N, laneLen, taperOf(sp)); const A = yA(XX, N); const B = XX > N ? RING_EDGE + w : A + w; const Yc = (A + B) / 2;
    rows.push({ u: sp.d * XX, v: sg * Yc, X: XX, w, eA: [sp.d * XX, sg * A], eB: [sp.d * XX, sg * B], onArc: 0 }); if (XX >= Xend) break; }
  return { rows, arcLen };
}
const sigmas = (rows: Row[]): number[] => { const o = [0]; for (let i = 1; i < rows.length; i++) o.push(o[i - 1] + Math.hypot(rows[i].u - rows[i - 1].u, rows[i].v - rows[i - 1].v)); return o; };
const sigmaAtX = (rows: Row[], sg: number[], X: number): number => { for (let i = 1; i < rows.length; i++) if (rows[i].X >= X && rows[i - 1].X < X) return sg[i - 1] + (sg[i] - sg[i - 1]) * (X - rows[i - 1].X) / (rows[i].X - rows[i - 1].X); return sg[sg.length - 1]; };

interface Vert { fits: boolean; g: number; L1: number; L2: number; s2: number; straight: number }
function solveVert(sigN: number, yN: number, sN: number): Vert {
  const f = (g: number): { L1: number; L2: number; s2: number; r: number } => { const L1 = KC * g * 100, L2 = KS * (g + sN) * 100; const s2 = (DECK + g * L1 / 2 - yN + sN * sigN) / (g + sN); return { L1, L2, s2, r: s2 + L2 / 2 - sigN }; };
  let lo = 0.002, hi = SG; if (f(hi).r > 0 || f(lo).r < 0) { const e = f(hi); return { fits: false, g: hi, L1: e.L1, L2: e.L2, s2: e.s2, straight: sigN - e.L2 - e.L1 }; }
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m).r > 0) lo = m; else hi = m; }
  const g = (lo + hi) / 2, e = f(g); const straight = sigN - e.L2 - e.L1; return { fits: straight >= 0, g, L1: e.L1, L2: e.L2, s2: e.s2, straight };
}
const levelAt = (sg: number, v: Vert, sigN: number, yN: number, sN: number): number => { // profile on the ramp, sigma from the circle edge
  const sagStart = sigN - v.L2; if (sg <= v.L1) return DECK - v.g * sg * sg / (2 * v.L1);
  if (sg <= sagStart) return DECK - v.g * (sg - v.L1 / 2);
  const t = Math.min(sg, sigN) - sagStart; const y0 = DECK - v.g * (sagStart - v.L1 / 2); return y0 - v.g * t + (v.g + sN) * t * t / (2 * v.L2); };

const noseFor = (side: number): number => { for (let N = 180; N <= 330; N += 5) { let ok = true; for (const sp of SPECS.filter((q) => q.d === side)) { const pl = plan(sp, N, laneOf(sp, N)); const sg = sigmas(pl.rows); const sigN = sigmaAtX(pl.rows, sg, N); if (!solveVert(sigN, ringY(side * N), side * ringSlope(side * N)).fits) ok = false; } if (ok) return N; } return NaN; };

if (process.argv[2] === 'scan') { // what-if (nothing written): grade limit via RAMP_G
  console.log(`grade limit ${SG * 100} %: nose E ${noseFor(1)}, nose W ${noseFor(-1)}`); process.exit(0);
}

// ------------------------------------------------------------------ build
const noseSide: Record<string, number> = { '1': noseFor(1), '-1': noseFor(-1) };
const out: any = { generated: '2026-11-24', ramps: [] as any[] }; const tsRamps: any[] = [];
for (const sp of SPECS) {
  const N = noseSide[String(sp.d)]; const laneLen = laneOf(sp, N); const { rows, arcLen } = plan(sp, N, laneLen); const sg = sigmas(rows); const sigN = sigmaAtX(rows, sg, N);
  const yN = ringY(sp.d * N), sN = sp.d * ringSlope(sp.d * N); const v = solveVert(sigN, yN, sN);
  let fillMax = 0, cutMax = 0, vol = 0, toe = 0, wet = 0; const R: number[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; const lev = r.X <= N ? levelAt(sg[i], v, sigN, yN, sN) : ringY(r.u);
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)]; const hd = Math.atan2(b.v - a.v, b.u - a.u) / D;
    const n = natW(r.u, r.v); const nA = natW(r.eA[0], r.eA[1]), nB = natW(r.eB[0], r.eB[1]); const isWet = n.wet || nA.wet || nB.wet ? 1 : 0; wet += isWet;
    const h = lev - n.h; fillMax = Math.max(fillMax, h); cutMax = Math.max(cutMax, -h);
    const ds = i > 0 ? sg[i] - sg[i - 1] : 0; if (h > 0 && r.X <= N) { vol += ds * h * (r.w + 1.2 + (h > 4 ? 0.2 * h : 2 * h)); if (!r.onArc) toe = Math.max(toe, Math.abs(r.eB[1]) + 0.6 + (h > 4 ? 0.5 + 0.2 * h : 2 * h)); } // toe: only after the J4 arc (the arc stands on the roundabout platform, J2 / J6)
    R.push([r2(r.u), r2(r.v), r2(hd), r2(sg[i]), r2(lev), r2(n.h), r2(r.w), r2(r.eA[0]), r2(r.eA[1]), r2(r.eB[0]), r2(r.eB[1]), r.onArc, isWet]);
  }
  // gore wedge between the ring outer lane edge (Y 19.1) and the ramp ring-side edge, from the start of the S-curve to the nose
  const gore: number[][] = []; for (let X = N - SLEN; X <= N + 1e-6; X += 5) gore.push([r2(sp.d * X), r2(sp.sv * yA(X, N))]); gore.push([r2(sp.d * N), r2(sp.sv * RING_EDGE)]);
  const gore2 = [...gore, [r2(sp.d * (N - SLEN)), r2(sp.sv * RING_EDGE)]];
  const endX = N + laneLen + taperOf(sp);
  const ramp = { id: sp.id, type: sp.type, d: sp.d, sv: sp.sv, noseX: N, noseU: sp.d * N, noseRingU: sp.d * N + U0, arcLen: r2(arcLen), endX: r2(endX), endRingU: r2(sp.d * endX + U0),
    lane: { auxLen: r2(laneLen), taperLen: taperOf(sp), projectRule: r2(sp.type === 'merge' ? ACC + NT : DEC + XT), total: r2(laneLen + taperOf(sp)) },
    vert: { grade: r2(v.g * 100), L1: r2(v.L1), L2: r2(v.L2), crestK: r2(KC), sagK: r2(KS), sigmaN: r2(sigN), straight: r2(v.straight), fits: v.fits, ringLevelNose: r2(yN), ringSlopeNosePct: r2(sN * 100), vpi1: r2(v.L1 / 2), vpi2: r2(sigN - v.L2 / 2) },
    gore: gore2, fillMax: r2(fillMax), cutMax: r2(cutMax), fillVolume: Math.round(vol), toeMaxV: r2(toe), wetRows: wet, rows: R };
  out.ramps.push(ramp); tsRamps.push(ramp);
  console.log(`${sp.id} ${sp.type} nose X ${N} sigmaN ${r2(sigN)} grade ${r2(v.g * 100)} L1 ${r2(v.L1)} L2 ${r2(v.L2)} fits ${v.fits} lane ${ramp.lane.auxLen}+${ramp.lane.taperLen}=${ramp.lane.total} (rule ${ramp.lane.projectRule}) end ring u ${ramp.endRingU} fill ${ramp.fillMax} cut ${ramp.cutMax} V ${ramp.fillVolume} wet ${wet}`);
}
out.ringTable = ringTab.map((q) => [q[0], r2(q[1])]);
out.constants = { ringEdge: RING_EDGE, aux: LANE, sShiftR: RSH, sShiftLen: r2(SLEN), laneDrop: r2(LDROP), noseSide, K_CREST_V50: r2(KC), K_SAG_V50: r2(KS), gradeLimit: SG, railLimitLocalU: RAIL_LIM, waterLimitLocalU: WATER_LIM, ringAxisOffsetMax: r2(ringOffMax), acc: r2(ACC), nt: NT, dec: r2(DEC), xt: XT, deck: DECK };
writeFileSync('docs/J300_RAMPS.json', JSON.stringify(out));
const slim = tsRamps.map((r) => ({ ...r }));
const ts = `// GENERATED by scripts/j300-ramp-gen.ts (STEP J5). Do not edit: rerun the script. Sources: J4 (docs/J300_GEOM.json), J3 (docs/J300_CALC.json), the real planned ring level, the game terrain.
// J300 RAMP DATA (Type B, B2, Option A, centre u0 = -125). PURE DATA, not imported by the game yet (J9 hooks it up). Config switch NOT wired.
// FRAME as J300Geometry.ts: local u along the ring, v = LEFT of u, origin = roundabout centre. Rows are stored OUTWARD from the circle edge:
// ROW = [u, v, headingDeg, sigma, level, natural, width, eAu, eAv, eBu, eBv, onArc, wet]  (eA = ring-side edge, eB = outer edge, levels in m)
export const J300_RAMP_CONSTANTS = ${JSON.stringify(out.constants)} as const;
export const J300_RAMPS = ${JSON.stringify(slim)} as const;
`;
writeFileSync('src/roads/junction/J300Ramps.ts', ts); console.log('J300Ramps.ts written', ts.length, 'bytes KC', r2(KC), 'KS', r2(KS), 'nose', JSON.stringify(noseSide), 'ring axis offset from frame line (max, -450..650)', r2(ringOffMax), 'm');
