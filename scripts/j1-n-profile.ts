// STEP J1-c4c (headless): REAL vertical profile of the N arm of J1: PVI table + parabolic vertical curves (K from SSD, V100), s = 0 at the J1 centre.
// Run: npx tsx scripts/j1-n-profile.ts docs     needs docs/j1c4b_align.json (plan + DP level), docs/j1c1.json (pad), docs/ring_profile.csv; writes docs/j1c4c_profile.json + docs/STEPJ1C4C_OUTPUT.txt
// Idea: the c4b DP level (piecewise, 20 m) is simplified to a few PVIs (Douglas-Peucker, tolerance grows until everything fits), then every grade change > 0.5 % gets a parabola of length K*|A|.
// Checks: grade 4 % on the first 1000 m from S (user decision 2026-11-14) and 3 % elsewhere, K >= SSD minimum, curves do not overlap, cut <= 12 m, fill > 7 m listed as viaduct, end level = ring level,
// rail crossing |road - rail| >= 7.4 m (RAIL_DESIGN.overRoadRise / underRoadDrop), river bridge clearance, cut/fill at the edges.
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { minVerticalK } from '../src/roads/standards/Checks';

const out = process.argv[2] ?? 'docs';
const A = JSON.parse(readFileSync(`${out}/j1c4b_align.json`, 'utf8'));
const pad = JSON.parse(readFileSync(`${out}/j1c1.json`, 'utf8')).pad as { x: number; z: number; y: number; a: number; b: number };
const ringP = readFileSync(`${out}/ring_profile.csv`, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',').map(Number));
const ringLevel = (st: number): number => { const k = Math.max(0, Math.min(ringP.length - 2, Math.floor(st / 10))); const t = st / 10 - k; return ringP[k][2] * (1 - t) + ringP[k + 1][2] * t; };
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const waterAt = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.water; };

const V = 100, K = minVerticalK(V), SJ = 340, HILL_END_J = SJ + 1000, G_HILL = 0.04, G_REST = 0.03, G_PAD = Number(process.env.PADG ?? 0.03), MINA = 0.005, OFF = 25, VIADUCT = 7, CUTMAX = 12, RAIL_CLR = 7.4;
const gLimJ = (sJ: number): number => (sJ < SJ ? G_PAD : sJ < HILL_END_J ? G_HILL : G_REST);
const padH = (sJ: number): number => { const yaw = (A.j1.yawDeg * Math.PI) / 180; const x = A.j1.x + sJ * Math.sin(yaw), z = A.j1.z - sJ * Math.cos(yaw); return pad.y + pad.a * (x - pad.x) + pad.b * (z - pad.z); };
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f0 = (v: number): string => v.toFixed(0);

// ---------------------------------------------------------------- plan samples (from c4b, s from S) and the DP level
const smp = A.samples as number[][];                    // [s, x, z, headingDeg, k]
const dsP = A.levelDs as number, lev = A.level as number[];
const yEnd = ringLevel(A.endStation);
const dpPts = lev.map((y, i) => ({ s: SJ + i * dsP, y }));
dpPts[dpPts.length - 1].y = yEnd;
function douglas(pts: Array<{ s: number; y: number }>, tol: number): Array<{ s: number; y: number }> {
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const st: Array<[number, number]> = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const yl = pts[a].y + ((pts[b].y - pts[a].y) * (pts[i].s - pts[a].s)) / (pts[b].s - pts[a].s); const d = Math.abs(pts[i].y - yl); if (d > md) { md = d; mi = i; } }
    if (mi >= 0 && md > tol) { keep[mi] = true; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
interface Pvi { s: number; y: number; g1: number; g2: number; Lc: number; kind: string }
const GPAD = (padH(60) - padH(0)) / 60;                  // pad plane grade along the axis; the first tangent IS the pad line (J1-c1: pad plane to s = 60)
const padLine = (s: number): number => padH(60) + GPAD * (s - 60);
// parameter vector: [s1, (s_i, y_i) for the free PVIs i = 2..m-2]; PVI 0 = (0, pad), last PVI = (E, ring level) fixed
function toPvi(v: number[], endS: number): Pvi[] {
  const pts: Array<{ s: number; y: number }> = [{ s: 0, y: padH(0) }, { s: v[0], y: padLine(v[0]) }];
  for (let k = 1; k + 1 < v.length; k += 2) pts.push({ s: v[k], y: v[k + 1] });
  pts.sort((a, b) => a.s - b.s); pts.push({ s: endS, y: yEnd });
  const pvi: Pvi[] = pts.map((p) => ({ s: p.s, y: p.y, g1: 0, g2: 0, Lc: 0, kind: '' }));
  for (let i = 0; i < pvi.length - 1; i++) pvi[i].g2 = pvi[i + 1].g1 = (pvi[i + 1].y - pvi[i].y) / (pvi[i + 1].s - pvi[i].s);
  for (let i = 1; i < pvi.length - 1; i++) {
    const a = pvi[i].g2 - pvi[i].g1;
    if (Math.abs(a) < MINA) { pvi[i].kind = 'none'; continue; }
    pvi[i].kind = a < 0 ? 'crest' : 'sag';
    pvi[i].Lc = Math.abs(a) * 100 * (a < 0 ? K.crest : K.sag);
  }
  return pvi;
}
function overlapOf(pvi: Pvi[]): number {
  let ex = 0;
  for (let i = 1; i < pvi.length - 2; i++) ex += Math.max(0, pvi[i].Lc / 2 + pvi[i + 1].Lc / 2 + 4 - (pvi[i + 1].s - pvi[i].s)) ** 2;
  ex += Math.max(0, 62 - (pvi[1].s - pvi[1].Lc / 2)) ** 2;                   // the first curve may not start inside the pad (s < 60)
  const l = pvi.length - 2; ex += Math.max(0, pvi[l].Lc / 2 + 2 - (pvi[l + 1].s - pvi[l].s)) ** 2;
  for (let i = 1; i < pvi.length; i++) ex += Math.max(0, 50 - (pvi[i].s - pvi[i - 1].s)) ** 2 * 0.1;   // PVIs at least 50 m apart
  return ex;
}
function yAt(pvi: Pvi[], s: number): number {
  let k = 0; while (k < pvi.length - 2 && s > pvi[k + 1].s) k++;
  for (const j of [k, k + 1]) {
    const p = pvi[j]; if (p.Lc > 0 && s >= p.s - p.Lc / 2 && s <= p.s + p.Lc / 2) { const x = s - (p.s - p.Lc / 2); return p.y - (p.g1 * p.Lc) / 2 + p.g1 * x + ((p.g2 - p.g1) / (2 * p.Lc)) * x * x; }
  }
  return pvi[k].y + pvi[k].g2 * (s - pvi[k].s);
}

// ---------------------------------------------------------------- ground, water and rail data on the plan samples (computed ONCE)
const NSM = smp.length, SS_ = smp.map((q) => SJ + q[0]);
const gC = new Float64Array(NSM), gMaxE = new Float64Array(NSM), gMinE = new Float64Array(NSM), gL = new Float64Array(NSM), gR_ = new Float64Array(NSM), wW = new Float64Array(NSM);
smp.forEach((q, i) => {
  const nx = -Math.sin((q[3] * Math.PI) / 180), nz = Math.cos((q[3] * Math.PI) / 180);
  gC[i] = ground(q[1], q[2]); gL[i] = ground(q[1] + OFF * nx, q[2] + OFF * nz); gR_[i] = ground(q[1] - OFF * nx, q[2] - OFF * nz); wW[i] = waterAt(q[1], q[2]);
  gMaxE[i] = Math.max(gC[i], gL[i], gR_[i]); gMinE[i] = Math.min(gC[i], gL[i], gR_[i]);
});
const crossings: Array<{ s: number; rail: number; edge: string }> = [];
for (let i = 1; i < smp.length; i++) for (const e of gen.rail.edges) for (let k = 0; k + 1 < e.xs.length; k++) {
  const ax = smp[i - 1][1], az = smp[i - 1][2], bx = smp[i][1], bz = smp[i][2], cx = e.xs[k], cz = e.zs[k], dx = e.xs[k + 1], dz = e.zs[k + 1];
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) continue;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) crossings.push({ s: SS_[i - 1] + t * (SS_[i] - SS_[i - 1]), rail: e.design[k] + (e.design[k + 1] - e.design[k]) * u, edge: e.id });
}
const glim = (sJ: number): number => (sJ < SJ ? G_PAD : sJ < HILL_END_J ? G_HILL : G_REST);   // 3 % on the pad-to-S stretch, 4 % on the hill stretch, 3 % beyond
const ENDS = SJ + A.length;
interface Res { tol: number; pvi: Pvi[]; overlap: number; gBad: number; cutMax: number; cutEdge: number; fillMax: number; fillEdge: number; viaLen: number; c12: number; rows: Array<{ s: number; g: number; r: number; gl: number; gr: number; w: number; gc: number }>; cost: number }
function evaluate(v: number[]): Res {
  const pvi = toPvi(v, ENDS), ov = overlapOf(pvi);
  let cost = ov * 50, gBad = 0, cutMax = 0, cutEdge = 0, fillMax = 0, fillEdge = 0, viaLen = 0, c12 = 0, prev = NaN, prevS = NaN;
  const rows: Res['rows'] = [];
  for (let i = 0; i < NSM; i++) {
    const sJ = SS_[i], r = yAt(pvi, sJ);
    const cut = Math.max(0, gMaxE[i] - r), fill = Math.max(0, r - gMinE[i]);
    cost += 5 * (0.05 * cut * cut + 0.02 * fill * fill);
    if (gC[i] - r > CUTMAX) { c12 += 5; cost += 200 * (gC[i] - r - CUTMAX); }
    if (r - gC[i] > VIADUCT) viaLen += 5;
    cutMax = Math.max(cutMax, gC[i] - r); fillMax = Math.max(fillMax, r - gC[i]); cutEdge = Math.max(cutEdge, gL[i] - r, gR_[i] - r); fillEdge = Math.max(fillEdge, r - gL[i], r - gR_[i]);
    if (!Number.isNaN(prev)) { const g = Math.abs(r - prev) / (sJ - prevS), ex = g - (glim(sJ) - 0.0006); if (ex > 0) { if (ex > 0.0006 + 1e-4) gBad++; cost += 2e4 * (ex * 100) ** 2; } }
    prev = r; prevS = sJ;
    if (!Number.isNaN(wW[i]) && gC[i] < wW[i] - 0.05 && r - wW[i] < 3) cost += 500 * (3 - (r - wW[i])) ** 2;       // river: road >= 3 m above water
    rows.push({ s: sJ, g: gC[i], r, gl: gL[i], gr: gR_[i], w: wW[i], gc: gC[i] });
  }
  for (let s = 70; s <= SJ; s += 10) { const g = Math.abs(yAt(pvi, s) - yAt(pvi, s - 10)) / 10; if (g > G_PAD - 0.0006) { if (g > G_PAD + 1e-4) gBad++; cost += 2e4 * ((g - G_PAD + 0.0006) * 100) ** 2; } }   // pad -> S stretch is not in the plan samples
  for (const c of crossings) { const r = yAt(pvi, c.s), need = c.rail + RAIL_CLR + 0.3; if (r < need) cost += 3e3 * (need - r) ** 2; }   // road OVER rail
  const g0 = (pvi[2].y - pvi[1].y) / (pvi[2].s - pvi[1].s); if (g0 < 0.003) cost += 1e4 * (0.003 - g0) ** 2 * 1e4;
  return { tol: 0, pvi, overlap: ov, gBad, cutMax, cutEdge, fillMax, fillEdge, viaLen, c12, rows, cost };
}
// ---------------------------------------------------------------- search: start from Douglas-Peucker vertices, anneal s and level of every free PVI
let seed = 7; const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = (): number => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
let best: Res | null = null, bestV: number[] = [];
for (const tol of [1.2, 1.8, 2.5, 3.5]) {
  const body = douglas(dpPts, tol).filter((p) => p.s > SJ + 1 && p.s < ENDS - 1);
  const yS = dpPts[3].y; const v0 = [140, SJ + 40, yS + 0.2, ...body.flatMap((p) => [p.s, p.y])];
  for (let rs = 0; rs < 3; rs++) {
    let v = v0.slice(), c = evaluate(v).cost;
    const ITER = 9000;
    for (let it = 0; it < ITER; it++) {
      const T = 1 - it / ITER, w = v.slice(), m = 1 + Math.floor(rnd() * 2);
      for (let q = 0; q < m; q++) { const k = Math.floor(rnd() * w.length); const isS = k === 0 || k % 2 === 1; w[k] += (isS ? 60 : 1.2) * gauss() * (0.1 + 0.9 * T); }
      for (let k = 1; k + 1 < w.length; k += 2) if (w[k] < SJ - 100 || w[k] > ENDS - 60) w[k] = v[k];
      const cw = evaluate(w).cost; if (cw < c) { v = w; c = cw; }
    }
    P(`tolerance ${tol} restart ${rs}: ${(v.length - 1) / 2 + 2} PVIs, cost ${f0(c)}`);
    if (!best || c < best.cost) { best = evaluate(v); bestV = v; }
  }
}
const R = best!; R.tol = 0;
P();
P(`J1-c4c N ARM VERTICAL PROFILE   V ${V}, K crest ${f1(K.crest)} sag ${f1(K.sag)} (SSD ${f0(K.S)} m), optimised PVIs, s = 0 at the J1 centre, S = ${SJ}, E = ${f0(SJ + A.length)}`);
P('  PVI table:  #  s(m)  level(m)  grade in -> out (%)  curve  length(m)  K');
R.pvi.forEach((p, i) => P(`    ${String(i).padStart(2)}  ${f0(p.s).padStart(5)}  ${f2(p.y).padStart(6)}  ${f2(p.g1 * 100).padStart(6)} -> ${f2(p.g2 * 100).padStart(6)}  ${(p.kind || 'end').padEnd(5)}  ${f0(p.Lc).padStart(4)}  ${p.Lc > 0 ? f0(p.Lc / (Math.abs(p.g2 - p.g1) * 100)) : '-'}`));
P();
const chk: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { chk.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${detail}`); };
// grades by sampling
let gH = 0, gR = 0; for (let i = 1; i < R.rows.length; i++) { const g = Math.abs(R.rows[i].r - R.rows[i - 1].r) / (R.rows[i].s - R.rows[i - 1].s); if (R.rows[i].s < HILL_END_J) gH = Math.max(gH, g); else gR = Math.max(gR, g); }
CHK('grade <= 4 % on the first 1000 m from S, <= 3 % beyond (motorway max 4 %, desirable 3 %), pad stretch see next check', R.gBad === 0, `max ${f2(gH * 100)} % on the hill stretch, ${f2(gR * 100)} % elsewhere`);
let gPad = 0; for (let s = 70; s <= SJ; s += 10) gPad = Math.max(gPad, Math.abs(yAt(R.pvi, s) - yAt(R.pvi, s - 10)) / 10);
CHK(`grade on the pad -> S stretch (s 60..340) <= ${f1(G_PAD * 100)} %`, gPad <= G_PAD + 1e-4, `max ${f2(gPad * 100)} %`);
const g0 = (R.pvi[2].y - R.pvi[1].y) / (R.pvi[2].s - R.pvi[1].s);
CHK('grade after the pad curve at least 0.3 % (drainage)', g0 >= 0.003 - 1e-9, `${f2(g0 * 100)} % (pad level ${f2(padH(0))} -> ${f2(padH(60))})`);
const cur = R.pvi.filter((p) => p.Lc > 0);
CHK('every vertical curve K >= SSD minimum (crest / sag)', cur.every((p) => p.Lc / (Math.abs(p.g2 - p.g1) * 100) >= (p.kind === 'crest' ? K.crest : K.sag) - 1e-6), `${cur.length} curves, K used = minimum`);
let ovN = 0; for (let i = 1; i < R.pvi.length - 2; i++) if (R.pvi[i].Lc / 2 + R.pvi[i + 1].Lc / 2 > R.pvi[i + 1].s - R.pvi[i].s) ovN++;
CHK('vertical curves do not overlap each other (tangent length between curves >= 0)', ovN === 0, `${ovN} overlaps, smallest straight between curves ${f0(Math.min(...R.pvi.slice(1, -2).map((p, i) => R.pvi[i + 2].s - p.s - p.Lc / 2 - R.pvi[i + 2].Lc / 2)))} m`);
CHK('first tangent is the pad plane (to s 60), first curve starts at s >= 60', cur.every((p) => p.s - p.Lc / 2 >= 59.5), `first curve starts at s ${f0(Math.min(...cur.map((p) => p.s - p.Lc / 2)))}, pad grade ${f2(GPAD * 100)} %`);
CHK('centre cut <= 12 m (3.7)', R.c12 === 0, `max cut ${f1(R.cutMax)} m`);
P(`  INFO  edges (+-${OFF} m): max cut ${f1(R.cutEdge)} m, max fill ${f1(R.fillEdge)} m; centre fill > ${VIADUCT} m (viaduct) total ${f0(R.viaLen)} m`);
// viaduct / embankment runs
const runs: string[] = []; { let a = -1; for (let i = 0; i <= R.rows.length; i++) { const on = i < R.rows.length && R.rows[i].r - R.rows[i].g > VIADUCT; if (on && a < 0) a = i; if (!on && a >= 0) { runs.push(`s ${f0(R.rows[a].s)}..${f0(R.rows[i - 1].s)} (max fill ${f1(Math.max(...R.rows.slice(a, i).map((r) => r.r - r.g)))} m)`); a = -1; } } }
P(`  INFO  viaduct runs (fill > ${VIADUCT} m): ${runs.join('; ') || '-'}`);
CHK('end level = ring level at the T', Math.abs(R.pvi[R.pvi.length - 1].y - yEnd) < 0.01, `end ${f2(R.pvi[R.pvi.length - 1].y)} m, ring ${f2(yEnd)} m (ring st ${f0(A.endStation)})`);
const gEnd = R.pvi[R.pvi.length - 2].g2; P(`  INFO  last grade into the ring ${f2(gEnd * 100)} %`);
// river bridge
const wet = R.rows.filter((r) => !Number.isNaN(r.w) && r.g < r.w - 0.05);
if (wet.length) { const m = Math.min(...wet.map((r) => r.r - r.w)); CHK('river / lake crossing: road level at least 2.5 m above the water (bridge, 6.1e)', m >= 2.5, `${wet.length * 5} m wet, lowest clearance ${f1(m)} m, deck depth not included`); } else P('  INFO  no water crossing');
// rail crossings (real rail design heights, computed above)
const cross = crossings.map((c) => { const road = yAt(R.pvi, c.s); return { ...c, road, gap: road - c.rail }; });
if (!cross.length) P('  INFO  no rail crossing');
for (const c of cross) CHK(`rail crossing ${c.edge} at s ${f0(c.s)}: |road - rail| >= ${RAIL_CLR} m (road ${c.gap > 0 ? 'OVER' : 'UNDER'} rail)`, Math.abs(c.gap) >= RAIL_CLR, `road ${f2(c.road)} m, rail top ${f2(c.rail)} m, gap ${f2(c.gap)} m`);
const fails = chk.filter((c) => !c.pass).length; P(`SUMMARY: ${chk.length - fails} PASS, ${fails} FAIL`);
writeFileSync(`${out}/STEPJ1C4C_OUTPUT.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}/j1c4c_profile.json`, JSON.stringify({ V, K, SJ, pvi: R.pvi, crossings: cross, viaduct: runs, cutMax: R.cutMax, cutEdge: R.cutEdge, fillMax: R.fillMax, fillEdge: R.fillEdge, checks: chk,
  rows: R.rows.map((r) => [Math.round(r.s * 10) / 10, Math.round(r.g * 100) / 100, Math.round(r.r * 100) / 100]) }));
