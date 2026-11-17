// STEP J1-c6b (headless): S arm of J1 as a real alignment: straight - spiral - arc - spiral - straight, from the end of the J1 lane zone (S = J1 + 340 m on the S axis, first tangent = the axis) to a T on the ring S straight (st 705..1763). All curves R >= 591 m, Ls 100 m.
// Run: npx tsx scripts/j1-s-align.ts docs [nPi=3] [iters=9000] [seed=1]   needs docs/j1c6_raster.json, docs/ring_samples_5m.csv, docs/ring_profile.csv
// env J1X J1Z J1YAW (default C10 (-87, -277), 37.5 deg). Writes docs/j1c6b_align.json + docs/STEPJ1C6B_OUTPUT.txt (env STLO STHI ZONES=1 GHILL RAILPEN)
// Fixed: start S = J1 + 340 m on the N axis with the axis heading (first tangent is the J1 axis), end E on the ring N straight (st 11049..12512) with the heading PERPENDICULAR to the ring (T).
// Free (searched): the PIs, their radii (R >= 591 m = 1.5 x Rmin V100, Ls 100 m), the join point along the ring straight, and (inside the cost) the road level: for every candidate the cheapest
// grade <= 3 % profile is found by dynamic programming, so the plan search already "sees" cut and fill (weights as in j1-n-hybrid.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import type { Pi } from '../src/roads/alignment/PiAlignment';
import { spiralLength } from '../src/roads/standards/Checks';

const out = process.argv[2] ?? 'docs';
const NPI = Number(process.argv[3] ?? 4), ITERS = Number(process.argv[4] ?? 9000);
let seed = Number(process.argv[5] ?? 1);
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = (): number => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

// ---------------------------------------------------------------- data
const RA = JSON.parse(readFileSync(`${out}/j1c6_raster.json`, 'utf8'));
const { cell: C, x0: X0, z0: Z0, nx: NX, nz: NZ } = RA as { cell: number; x0: number; z0: number; nx: number; nz: number };
const G = Float32Array.from(RA.h as number[]), WET = Uint8Array.from(RA.wet as number[]);
const RECTS = RA.rects as Array<{ id: string; x0: number; z0: number; x1: number; z1: number }>;
const RAIL = RA.rail as Array<{ xs: number[]; zs: number[] }>;
const STATIONS = (RA.stations ?? []) as Array<{ id: string; x: number; z: number; r: number }>;
const FIRST_STR = Number(process.env.FIRSTSTR ?? 150);   // minimum first straight from S (m)
const RAILPEN = Number(process.env.RAILPEN ?? 150);   // cost of one rail crossing (each one needs a road-over-rail structure with the whole corridor spanned): the RAILWAY CANNOT MOVE, so the search keeps the number of crossings low
// number of rail centreline crossings of the segment a-b (a 20 m step of the road)
function railCrossings(ax: number, az: number, bx: number, bz: number): number {
  let n = 0; const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, z0 = Math.min(az, bz) - 1, z1 = Math.max(az, bz) + 1;
  for (const e of RAIL) for (let k = 0; k + 1 < e.xs.length; k++) {
    const cx = e.xs[k], cz = e.zs[k], dx = e.xs[k + 1], dz = e.zs[k + 1];
    if (Math.max(cx, dx) < x0 || Math.min(cx, dx) > x1 || Math.max(cz, dz) < z0 || Math.min(cz, dz) > z1) continue;
    const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) n++;
  }
  return n;
}
const bil = (x: number, z: number): number => {
  const fx = (x - X0) / C - 0.5, fz = (z - Z0) / C - 0.5;
  if (fx < 0 || fz < 0 || fx > NX - 1.001 || fz > NZ - 1.001) return NaN;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  return (G[j * NX + i] * (1 - tx) + G[j * NX + i + 1] * tx) * (1 - tz) + (G[(j + 1) * NX + i] * (1 - tx) + G[(j + 1) * NX + i + 1] * tx) * tz;
};
const wetAt = (x: number, z: number): boolean => { const i = Math.floor((x - X0) / C), j = Math.floor((z - Z0) / C); return i >= 0 && j >= 0 && i < NX && j < NZ && WET[j * NX + i] === 1; };
const ringS = readFileSync(`${out}/ring_samples_5m.csv`, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',')).map((a) => ({ st: +a[0], x: +a[1], z: +a[2], h: +a[5] }));
const ringP = readFileSync(`${out}/ring_profile.csv`, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',').map(Number));
const ringLevel = (st: number): number => { const k = Math.max(0, Math.min(ringP.length - 2, Math.floor(st / 10))); const t = st / 10 - k; return ringP[k][2] * (1 - t) + ringP[k + 1][2] * t; };

const rad = Math.PI / 180;
const J1 = { x: Number(process.env.J1X ?? -87), z: Number(process.env.J1Z ?? -277), yawDeg: Number(process.env.J1YAW ?? 37.5) };
const SS = 340, S0 = 60, Y_PAD = 18.19;
const h0 = (J1.yawDeg + 90) * rad;                                      // math heading of the S axis (bearing yaw + 180 = math yaw + 90)
const S = { x: J1.x + SS * Math.cos(h0), z: J1.z + SS * Math.sin(h0) };
const ST_LO = Number(process.env.STLO ?? 1205), ST_HI = Number(process.env.STHI ?? 1263), ST_REF = 1234;   // ring S straight 705..1763: the join keeps >= 500 m of straight on both sides (705 + 500 = 1205, 1763 - 500 = 1263) for the 3-leg interchange (rule of 2.4 / 15.8), reference station for u
const rRef = ringS.reduce((b, r) => (Math.abs(r.st - ST_REF) < Math.abs(b.st - ST_REF) ? r : b));
const hr = rRef.h * rad;                                                  // ring heading (math, rad) on the straight
const h1 = hr - Math.PI / 2;                                              // arrival heading of the radial (perpendicular, pointing to the ring)
const ringPoint = (u: number): { x: number; z: number } => ({ x: rRef.x + u * Math.cos(hr), z: rRef.z + u * Math.sin(hr) });
const U_LO = ST_LO - rRef.st, U_HI = ST_HI - rRef.st;
const R_MIN = 591, LS = 100, V = 100, DS = 20, R_T_MIN = 591, V_T = 100, LS0 = LS;   // E arm: no tight bend, PI 0 is like every other PI
const GH = Number(process.env.GHILL ?? 0.03), HILL_END = Number(process.env.HILLEND ?? 0);   // grade limit on the first HILL_END m from S (user 2026-11-14: allow steeper on the hill stretch); 3 % elsewhere
const gLim = (s: number): number => (s < HILL_END ? GH : 0.03);
const ZONES_ON = process.env.ZONES === '1';                                 // ZONES=0: engineering zones / fences may be crossed (user 2026-11-14 and again in the J1-in-game chat: buildings / structures may be in the way and are re-placed; ONLY the RAILWAY is fixed). Default now: zones ignored, ZONES=1 turns the 45 m rule back on

// ---------------------------------------------------------------- parameters -> alignment
const nInter = NPI - 2;
interface Par { a: number; mid: Array<[number, number]>; u: number; b: number; R: number[] }
function toPis(p: Par): { pis: Pi[]; E: { x: number; z: number } } {
  const E = ringPoint(p.u);
  const pis: Pi[] = [];
  pis.push({ x: S.x + p.a * Math.cos(h0), z: S.z + p.a * Math.sin(h0), R: p.R[0], Ls: LS0 });
  p.mid.forEach((m, i) => pis.push({ x: m[0], z: m[1], R: p.R[i + 1], Ls: LS }));
  pis.push({ x: E.x - p.b * Math.cos(h1), z: E.z - p.b * Math.sin(h1), R: p.R[NPI - 1], Ls: LS });
  return { pis, E };
}
const flat = (p: Par): number[] => [p.a, ...p.mid.flat(), p.u, p.b, ...p.R];
const unflat = (v: number[]): Par => {
  const mid: Array<[number, number]> = []; let k = 1;
  for (let i = 0; i < nInter; i++) { mid.push([v[k], v[k + 1]]); k += 2; }
  return { a: v[0], mid, u: v[k], b: v[k + 1], R: v.slice(k + 2, k + 2 + NPI) };
};

// ---------------------------------------------------------------- cost
const DH = 0.2, Y0 = 10, NL = 500, KMAX = Math.floor((0.03 * DS) / DH + 1e-9);   // 3 % over 20 m = 0.6 m = 3 bins
void KMAX;
interface Eval { cost: number; ok: boolean; al?: ReturnType<typeof buildOpenAlignment>; E?: { x: number; z: number }; prof?: number[]; zoneN: number; wetN: number; note: string }
function evaluate(p: Par, detail = false): Eval {
  const { pis, E } = toPis(p);
  for (let i = 0; i < pis.length; i++) if (!(pis[i].R >= (i === 0 ? R_T_MIN : R_MIN) && pis[i].R <= 6000)) return { cost: 1e9, ok: false, zoneN: 0, wetN: 0, note: 'R out of range' };
  if (p.u < U_LO || p.u > U_HI || p.a < 100 || p.b < 150) return { cost: 1e9, ok: false, zoneN: 0, wetN: 0, note: 'param range' };
  const al = buildOpenAlignment(S, pis, E);
  let pen = 0;
  for (let i = 0; i < al.straights.length; i++) {
    const g = al.straights[i];
    if (g < 0) { pen += 1e5 + 1e3 * -g; continue; }
    if (i > 0 && i < al.straights.length - 1) {
      const need = al.rows[i - 1].delta * al.rows[i].delta < 0 ? 2 * V : 6 * V;       // reverse >= 2 V, same direction >= 6 V (section 3.2)
      if (g < need) pen += 5 * (need - g) ** 2;
    } else if (i > 0 && g < 100) pen += 0.4 * (100 - g) ** 2;                                  // a little straight at both ends
    if (i === 0 && g < FIRST_STR) pen += 0.4 * (FIRST_STR - g) ** 2;                          // S arm: the first rail crossing is only 75 m after the start S, keep it (and its approach slabs) on a STRAIGHT (rule 3.12.8: no curve on a bridge approach)
  }
  for (const r of al.rows) if (r.arcAngle < 0.002) pen += 1e5 + 1e6 * (0.002 - r.arcAngle);   // spirals would overlap (no arc left)
  if (pen >= 1e5) return { cost: 1e7 + pen, ok: false, zoneN: 0, wetN: 0, note: 'overlap' };
  const n = Math.max(1, Math.floor(al.length / DS)), ds = al.length / n;   // ds >= DS so that kmax bins of DH never exceed the grade limit
  const gmax = new Float64Array(n + 1), gmin = new Float64Array(n + 1);
  let zoneN = 0, wetN = 0;
  for (let i = 0; i <= n; i++) {
    const q = poseAt(al, Math.min(al.length, i * ds)), nx_ = -Math.sin(q.h), nz_ = Math.cos(q.h);
    const g0 = bil(q.x, q.z), ga = bil(q.x + 25 * nx_, q.z + 25 * nz_), gb = bil(q.x - 25 * nx_, q.z - 25 * nz_);
    if (Number.isNaN(g0 + ga + gb)) return { cost: 1e8, ok: false, zoneN: 0, wetN: 0, note: 'outside raster' };
    gmax[i] = Math.max(g0, ga, gb); gmin[i] = Math.min(g0, ga, gb);
    if (wetAt(q.x, q.z)) { wetN++; pen += 200; }
    for (const st of STATIONS) if (Math.hypot(q.x - st.x, q.z - st.z) < st.r + 60) { pen += 600; break; }   // never through a station area (rail is fixed)
    if (i > 0) { const q0 = poseAt(al, Math.min(al.length, (i - 1) * ds)); pen += RAILPEN * railCrossings(q0.x, q0.z, q.x, q.z); }
    if (ZONES_ON && i > 0 && i < n) for (const r of RECTS) if (q.x > r.x0 - 45 && q.x < r.x1 + 45 && q.z > r.z0 - 45 && q.z < r.z1 + 45) { zoneN++; if (ZONES_ON) pen += 400; break; }
  }
  // dynamic programming on the road level (grade <= 3 %), start between 0.3 and 3 % from the pad, end at the ring level
  const yEnd = ringLevel(ringS.reduce((b, r) => (Math.hypot(r.x - E.x, r.z - E.z) < Math.hypot(b.x - E.x, b.z - E.z) ? r : b)).st);
  const lvl = (k: number): number => Y0 + k * DH;
  let cur = new Float64Array(NL).fill(Infinity);
  const par: Int16Array[] = [];
  const yLo = Y_PAD - (SS - S0) * 0.01, yHi = Y_PAD + (SS - S0) * 0.01;   // S: the arm may go a little down or up from the pad (the ring is 1.5 m higher than the pad)
  const stepCost = (i: number, y: number): number => { const cut = Math.max(0, gmax[i] - y), fill = Math.max(0, y - gmin[i]); return ds * (0.05 * cut * cut + 0.02 * fill * fill); };
  for (let k = 0; k < NL; k++) if (lvl(k) >= yLo && lvl(k) <= yHi) cur[k] = stepCost(0, lvl(k));
  for (let i = 1; i <= n; i++) {
    const nxt = new Float64Array(NL).fill(Infinity), pp = new Int16Array(NL).fill(-1);
    const kmax = Math.floor((gLim(i * ds) * ds) / DH + 1e-9);
    for (let k = 0; k < NL; k++) {
      const c = stepCost(i, lvl(k)); let best = Infinity, bk = -1;
      for (let d = -kmax; d <= kmax; d++) { const kk = k + d; if (kk < 0 || kk >= NL) continue; if (cur[kk] < best) { best = cur[kk]; bk = kk; } }
      if (bk >= 0) { nxt[k] = best + c; pp[k] = bk; }
    }
    cur = nxt; par.push(pp);
  }
  let bestK = -1, bestC = Infinity;
  for (let k = 0; k < NL; k++) if (Math.abs(lvl(k) - yEnd) <= 0.6 && cur[k] < bestC) { bestC = cur[k]; bestK = k; }
  if (bestK < 0) return { cost: 1e8, ok: false, zoneN, wetN, note: 'no level profile' };
  const cost = bestC + pen + al.length;
  if (!detail) return { cost, ok: true, zoneN, wetN, note: '' };
  const prof: number[] = new Array(n + 1);
  for (let i = n, k = bestK; i >= 0; i--) { prof[i] = lvl(k); if (i > 0) k = par[i - 1][k]; }
  return { cost, ok: true, al, E, prof, zoneN, wetN, note: '' };
}

// ---------------------------------------------------------------- search
const lines: string[] = [];
const P = (s = ''): void => { lines.push(s); console.log(s); };
const scale0 = (): number[] => [120, ...Array(nInter * 2).fill(200), 80, 150, ...Array(NPI).fill(150)];
const SEEDREF = false;          // seed from the corners of the grid route (j1-w-hybrid), PI 0 = the tight bend corner
const uRef = ((): number => { const r = ringS.reduce((bb, q) => (Math.hypot(q.x + 2545, q.z - 65) < Math.hypot(bb.x + 2545, bb.z - 65) ? q : bb)); return r.st - rRef.st; })();
const uAt = (z: number): number => { const r = ringS.filter((q) => q.st > 3000 && q.st < 6000).reduce((bb, q) => (Math.abs(q.z - z) < Math.abs(bb.z - z) ? q : bb)); return r.st - rRef.st; };
const refRoute = Array.from({ length: 21 }, (_, i) => ({ x: S.x + ((ringPoint(0).x - S.x) * i) / 20, z: S.z + ((ringPoint(0).z - S.z) * i) / 20, y: 0 }));
function start(): Par {
  if (SEEDREF && NPI === 2) return { a: 175 + 10 * gauss(), mid: [], u: uAt(263) + 60 * gauss(), b: 1650 + 100 * gauss(), R: [112 + 10 * rnd(), 600 + 300 * rnd()] };
  if (SEEDREF && NPI === 3) return { a: 175 + 10 * gauss(), mid: [[-901 + 30 * gauss(), 185 + 30 * gauss()]], u: uAt(185) + 60 * gauss(), b: 350 + 60 * gauss(), R: [112 + 10 * rnd(), 600 + 300 * rnd(), 800 + 600 * rnd()] };
  if (SEEDREF && NPI === 4) return { a: 175 + 10 * gauss(), mid: [[-775 + 25 * gauss(), -25 + 25 * gauss()], [-1165 + 25 * gauss(), 185 + 25 * gauss()]], u: uRef + 60 * gauss(), b: 250 + 30 * gauss(), R: [112 + 10 * rnd(), 600 + 150 * rnd(), 600 + 200 * rnd(), 700 + 400 * rnd()] };
  const mid: Array<[number, number]> = [];
  for (let i = 0; i < nInter; i++) { const r = refRoute[Math.floor((0.25 + (0.5 * (i + rnd())) / Math.max(1, nInter)) * (refRoute.length - 1))]; mid.push([r.x + 50 * gauss(), r.z + 50 * gauss()]); }
  return { a: 300 + 1000 * rnd(), mid, u: U_LO + (U_HI - U_LO) * rnd(), b: 300 + 800 * rnd(), R: Array(NPI).fill(0).map(() => 700 + 900 * rnd()) };
}
let best: { v: number[]; c: number } | null = null;
const RESTARTS = 8;
for (let rs = 0; rs < RESTARTS; rs++) {
  let v = flat(start()), c = evaluate(unflat(v)).cost, tries = 0;
  while (c >= 1e6 && tries++ < 400) { v = flat(start()); c = evaluate(unflat(v)).cost; }
  const sc = scale0(); let T = 1;
  for (let it = 0; it < ITERS / RESTARTS; it++) {
    T = 1 - it / (ITERS / RESTARTS);
    const w = v.slice(); const m = 1 + Math.floor(rnd() * 3);
    for (let q = 0; q < m; q++) { const k = Math.floor(rnd() * w.length); w[k] += sc[k] * gauss() * (0.15 + 0.85 * T); }
    const cw = evaluate(unflat(w)).cost;
    if (cw < c) { v = w; c = cw; }
  }
  P(`restart ${rs}: cost ${c.toFixed(0)}`);
  if (!best || c < best.c) best = { v, c };
}
const fin = evaluate(unflat(best!.v), true);
if (!fin.ok || !fin.al) { P(`NO FEASIBLE ALIGNMENT (${fin.note})`); process.exit(1); }
const al = fin.al, E = fin.E!, prof = fin.prof!;

// ---------------------------------------------------------------- report and checks
const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
P(`J1-c6b S ARM ALIGNMENT   J1 (${J1.x}, ${J1.z}) yaw ${J1.yawDeg} deg, start S (${f1(S.x)}, ${f1(S.z)}) heading ${f1(h0 / rad)} deg (math), ${NPI} PIs, Ls ${LS} m, V ${V}`);
P(`  end E (${f1(E.x)}, ${f1(E.z)}) on the ring S straight, arrival heading ${f1(h1 / rad)} deg (ring ${f1(hr / rad)} deg), alignment length ${f0(al.length)} m (straight line S-E ${f0(Math.hypot(E.x - S.x, E.z - S.z))} m)`);
P('  PI table:  #  x  z  R  Ls  delta(deg)  Ts  arc(m)  straight before / after');
al.rows.forEach((r, i) => P(`    ${i}  ${f1(al.pis[i].x)}  ${f1(al.pis[i].z)}  R ${f0(al.pis[i].R)}  Ls ${al.pis[i].Ls}  delta ${f1((r.delta * 180) / Math.PI)}  Ts ${f1(r.Ts)}  arc ${f0(al.elements.find((e) => e.kind === 'arc' && e.pi === i)!.length)}  straight ${f0(al.straights[i])} / ${f0(al.straights[i + 1])}`));
P();
const Rmin = Math.min(...al.pis.slice(1).map((q) => q.R)), dkBound = Math.max(...al.pis.map((q) => 1 / (q.R * q.Ls)));
CHK('PI 1.. every R >= 591 m (1.5 x Rmin V100)', Rmin >= R_MIN - 1e-6, `smallest R ${f0(Rmin)} m`);
CHK('PI 0 R >= 591 m', al.pis[0].R >= R_T_MIN - 1e-6, `R ${f0(al.pis[0].R)} m, Ls ${al.pis[0].Ls} m, turn ${f1(Math.abs((al.rows[0].delta * 180) / Math.PI))} deg`);
CHK('spiral Ls >= minimum (V55 on PI 0, V100 on the rest)', al.pis.every((q, i) => q.Ls >= spiralLength(i === 0 ? V_T : V, q.R)), `Ls ${LS} m, needed ${al.pis.map((q, i) => spiralLength(i === 0 ? V_T : V, q.R)).join(' / ')} m`);
let strOk = true; const strTxt: string[] = [];
for (let i = 0; i < al.straights.length; i++) {
  const g = al.straights[i]; let need = 0;
  if (i > 0 && i < al.straights.length - 1) need = al.rows[i - 1].delta * al.rows[i].delta < 0 ? 2 * V : 6 * V;
  strTxt.push(`${f0(g)}${need ? `(>=${need})` : ''}`); if (g < need - 1e-6 || g < 0) strOk = false;
}
CHK('straights between curves: reverse >= 2V, same direction >= 6V, none negative', strOk, strTxt.join(' / '));
CHK('first tangent is the J1 axis (start heading exact)', Math.abs(al.start.h - h0) < 1e-9, `start heading ${f2(al.start.h / rad)} deg`);
CHK('dead reckoning reaches E (position and heading)', al.endGap < 0.01 && Math.abs(al.endHeadingGapDeg) < 0.01, `gap ${al.endGap.toExponential(1)} m, ${al.endHeadingGapDeg.toExponential(1)} deg`);
const rNear = ringS.reduce((b, r) => (Math.hypot(r.x - E.x, r.z - E.z) < Math.hypot(b.x - E.x, b.z - E.z) ? r : b));
const angR = Math.abs((Math.atan2(Math.sin(al.end.h - hr), Math.cos(al.end.h - hr)) * 180) / Math.PI);
CHK('T on the ring: arrival angle 80..100 deg to the ring', Math.abs(angR - 90) < 10, `${f1(angR)} deg`);
CHK(`join point on the ring S straight (st ${ST_LO}..${ST_HI} of 705..1763: 500 m of straight on both sides)`, rNear.st >= ST_LO - 5 && rNear.st <= ST_HI + 5, `st ${f0(rNear.st)}, ${f0(rNear.st - 705)} m of straight on the west side and ${f0(1763 - rNear.st)} m on the east side (3-leg interchange wants 500 m each side)`);
// geometry samples 5 m
const NS5 = Math.ceil(al.length / 5), d5 = al.length / NS5; const sm = [];
for (let i = 0; i <= NS5; i++) sm.push(poseAt(al, i * d5));
let maxStep = 0, maxDk = 0, kmax = 0;
for (let i = 1; i < sm.length; i++) { maxStep = Math.max(maxStep, Math.abs(Math.atan2(Math.sin(sm[i].h - sm[i - 1].h), Math.cos(sm[i].h - sm[i - 1].h)))); maxDk = Math.max(maxDk, Math.abs(sm[i].k - sm[i - 1].k) / d5); kmax = Math.max(kmax, Math.abs(sm[i].k)); }
CHK('smooth: no kink, curvature is continuous (dk/ds <= 1/(R Ls) + small)', maxDk <= dkBound * 1.05 + 1e-9, `max heading step ${f2((maxStep * 180) / Math.PI)} deg per 5 m, max dk/ds ${maxDk.toExponential(2)}, tightest R ${f0(1 / kmax)} m`);
// obstacles
const clearOf: Record<string, number> = {};
for (const r of RECTS) { let m = Infinity; for (const q of sm) { const dx = Math.max(r.x0 - q.x, 0, q.x - r.x1), dz = Math.max(r.z0 - q.z, 0, q.z - r.z1); m = Math.min(m, Math.hypot(dx, dz)); } clearOf[r.id] = m; }
const worst = Object.entries(clearOf).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k, v]) => `${k} ${f0(v)} m`).join(', ');
if (ZONES_ON) CHK('centreline at least 45 m from every engineering zone / airport fence', Object.values(clearOf).every((v) => v >= 45), `nearest: ${worst}`);
else P(`  INFO  zones ignored (ZONES=0, buildings will be re-placed to fit the road); nearest: ${worst}`);
let wetLen = 0; for (const q of sm) if (wetAt(q.x, q.z)) wetLen += d5;
P(`  INFO  wet length (river / lake cells under the centreline) ${f0(wetLen)} m  (a river crossing becomes a bridge, 6.1e)`);
const railX: number[] = [];
for (let i = 1; i < sm.length; i++) for (const e of RAIL) for (let k = 0; k + 1 < e.xs.length; k++) {
  const ax = sm[i - 1].x, az = sm[i - 1].z, bx = sm[i].x, bz = sm[i].z, cx = e.xs[k], cz = e.zs[k], dx = e.xs[k + 1], dz = e.zs[k + 1];
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) continue;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) railX.push(Math.round(i * d5));
}
P(`  INFO  rail crossings (road over rail, 6.1d): ${railX.length} at s ${railX.join(', ') || '-'} m from S (s = 0 at the start S, J1 centre is 340 m before it)`);
for (const st of STATIONS) { let m = Infinity; for (const q of sm) m = Math.min(m, Math.hypot(q.x - st.x, q.z - st.z) - st.r); P(`  INFO  station ${st.id}: nearest edge of its area ${f0(m)} m from the centreline`); }
// vertical preview
const n = prof.length - 1, dsP = al.length / n;
let gBad = 0, gHill = 0, gRest = 0;
let cutMax = 0, fillMax = 0, c8 = 0, c12 = 0, f7 = 0, gMax = 0, volCut = 0;
const gnd: number[] = [];
for (let i = 0; i <= n; i++) {
  const q = poseAt(al, Math.min(al.length, i * dsP)), nx_ = -Math.sin(q.h), nz_ = Math.cos(q.h);
  const g0 = bil(q.x, q.z), gm = Math.max(g0, bil(q.x + 25 * nx_, q.z + 25 * nz_), bil(q.x - 25 * nx_, q.z - 25 * nz_));
  gnd.push(g0); const c = g0 - prof[i];
  cutMax = Math.max(cutMax, c); fillMax = Math.max(fillMax, -c);
  if (c > 8) c8 += dsP; if (c > 12) c12 += dsP; if (-c > 7) f7 += dsP; if (c > 0) volCut += dsP * (c * (44.2 + 6 + 1.5 * c)); void gm;
  if (i > 0) { const gg = Math.abs(prof[i] - prof[i - 1]) / dsP; gMax = Math.max(gMax, gg); if (gg > gLim(i * dsP) + 1e-6) gBad++; if (i * dsP < HILL_END) gHill = Math.max(gHill, gg); else gRest = Math.max(gRest, gg); }
}
P(`  VERTICAL PREVIEW (grade <= 3 % DP profile, the real profile is c4c): max centre cut ${f1(cutMax)} m, cut > 8 m ${f0(c8)} m, cut > 12 m ${f0(c12)} m, max fill ${f1(fillMax)} m, fill > 7 m (viaduct) ${f0(f7)} m, max grade ${f2(gMax * 100)} %, cut volume about ${(volCut / 1e6).toFixed(2)} million m3 (rough)`);
CHK('no centre cut over 12 m (user: hill cut must go; 12 m = section 3.7 limit 12 m)', c12 === 0, `max cut ${f1(cutMax)} m`);
CHK(`grade <= 3 % (<= ${f1(GH * 100)} % on the first ${HILL_END} m from S)`, gBad === 0, `max ${f2(gHill * 100)} % on the hill stretch, ${f2(gRest * 100)} % elsewhere`);
const fails = checks.filter((c) => !c.pass).length;
P(`SUMMARY: ${checks.length - fails} PASS, ${fails} FAIL`);
writeFileSync(`${out}/STEPJ1C6B_OUTPUT.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}/j1c6b_align.json`, JSON.stringify({
  j1: J1, start: S, startHeadingDeg: h0 / rad, end: E, endStation: rNear.st, nPi: NPI, pis: al.pis, rows: al.rows, straights: al.straights, length: al.length,
  levelDs: dsP, level: prof, ground: gnd, cutMax, fillMax, railCrossS: railX, wetLen, checks,
  samples: sm.map((q) => [Math.round(q.s * 10) / 10, Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100, Math.round(((q.h * 180) / Math.PI) * 1000) / 1000, Math.round(q.k * 1e7) / 1e7]),
}));
