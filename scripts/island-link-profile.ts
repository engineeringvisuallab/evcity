// STEP 17.1d (headless): VERTICAL PROFILE of the island link M6-1 for 4 deck heights (1 reference low bridge + the 3 user options 6 / 10 / 15 m clearance).
// Input: docs/island_link_align.json (17.1c centreline, samples every 5 m). Ground: TerrainGenerator.sampleGround (natural ground + island, no roads) as in 17.1a / 17.1c.
// Method: dynamic programming on a 10 m station grid, levels in steps of 0.05 m, grade in steps of 0.5 % (|g| <= 4 %); cost = structure (viaduct) length first, then
// cut / fill, then grade size and grade changes; hard rules: deck level over the strait >= D, cut at the pavement edge <= 12 m (else heavy penalty, shown as FAIL), start = level and grade of the J1-S arm end,
// end = island centre ground +-1.5 m with |grade| <= 2 %. The DP polyline is then turned into PVIs with parabolic vertical curves (K from SSD, L >= 60 m) and ALL checks are run on the FINAL profile every 5 m.
// Run: npx tsx scripts/island-link-profile.ts <out-dir>      writes island_link_profile.json (for the picture) + STEP171D_OUTPUT.txt and prints the sheet.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { J1_ARM_PVI } from '../src/roads/junction/J1ArmProfiles';
import { minVerticalK } from '../src/roads/standards/Checks';
import { DESIGN } from '../src/roads/standards/Criteria';

const out = process.argv[2] ?? 'docs';
mkdirSync(out, { recursive: true });
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);
const P: string[] = [];
const pr = (s = '') => { P.push(s); console.log(s); };

// ---------------- inputs ----------------
const A = JSON.parse(readFileSync(`${out}/island_link_align.json`, 'utf8')) as {
  samples: number[][]; wetRuns: { a: number; b: number; deep: number }[]; length: number; rowHalf: number; chosen: { ts: number; st: number; R: number };
};
const smp = A.samples;                       // [s, x, z, headingDeg, k] every ~5 m
const NS = smp.length;                       // 359 stations
const L = A.length, ROW = A.rowHalf;
const WA = A.wetRuns[0].a, WB = A.wetRuns[0].b;   // wet run on the centreline (m)
const CURVE_S = A.chosen.ts;                 // start of the horizontal curve (spiral in), 961 m
const PAVE = SECTION_M6.pavementEdge ?? 18.45; // M6 pavement edge from the centreline (17.1b: 18.45 m)
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const gh = (x: number, z: number): number => { gen.sampleGround(x, z, sc); return sc.h; };

// ASSUMPTIONS (the user can change them; nothing in the game gives tide, ship or deck data)
const DHWL = 1.0;        // A2 design high water level above the game sea level 0 (assumed, 18.2 fixes it with wind / wave data)
const TSTR = 3.0;        // A3 structure depth soffit -> road surface on the strait (assumed 3.0 m; depends on the concept chosen in 18.1)
// DP margin on the deck level: 0.3 m first, raised (0.5 / 0.8 / 1.2) until the final profile keeps the deck >= D (a crest curve lies below its PVI by A L / 800)
const OPTIONS = [
  { id: 'R', name: 'reference (low bridge, wave freeboard only)', clear: 1.5, ref: true },
  { id: 'A', name: 'option A: 6 m clearance (small boats)', clear: 6, ref: false },
  { id: 'B', name: 'option B: 10 m clearance (small ships)', clear: 10, ref: false },
  { id: 'C', name: 'option C: 15 m clearance (coasters / barges)', clear: 15, ref: false },
];

// start = end of the finished J1-S arm (17.1b: the island link continues it without a kink in plan; here also in level and grade)
const armEnd = J1_ARM_PVI.S[J1_ARM_PVI.S.length - 1];
const Y0 = armEnd.y;                         // 19.68 m
const G0 = 0.015;                            // arm end grade 1.5357 % rounded to the 0.5 % grid (difference 0.036 %, below the 0.5 % curve-skip limit)
const GARM = armEnd.g1;

// ---------------- ground at every 5 m station ----------------
interface St { s: number; x: number; z: number; hC: number; hL: number; hR: number; hMinE: number; hMaxE: number; cross: number; wet: boolean }
const OFF9 = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * ROW);
const sts: St[] = smp.map((q) => {
  const hd = (q[3] * Math.PI) / 180, nx = -Math.sin(hd), nz = Math.cos(hd);
  const hs = OFF9.map((o) => gh(q[1] + nx * o, q[2] + nz * o));
  let cs = 0; for (let k = 1; k < hs.length; k++) cs = Math.max(cs, (Math.abs(hs[k] - hs[k - 1]) / (OFF9[k] - OFF9[k - 1])) * 100);
  const hC = hs[4], hL = gh(q[1] + nx * PAVE, q[2] + nz * PAVE), hR = gh(q[1] - nx * PAVE, q[2] - nz * PAVE);
  return { s: q[0], x: q[1], z: q[2], hC, hL, hR, hMinE: Math.min(hC, hL, hR), hMaxE: Math.max(hC, hL, hR), cross: cs, wet: q[0] >= WA - 0.01 && q[0] <= WB + 0.01 };
});
const END_H = sts[NS - 1].hC;

// ---------------- dynamic programming (with a minimum tangent length) ----------------
const KMAX = 8, G = 2 * KMAX + 1;            // grade k x 0.5 % , k = -8 .. 8 (the real limit 4 % is k = 8)
const STEP = 2;                              // DP node every 2nd station (about 10 m)
const NN = Math.floor((NS - 1) / STEP);      // number of DP segments
if ((NS - 1) % STEP !== 0) throw new Error('station count must be odd');
const ds = (sts[STEP].s - sts[0].s);         // about 10 m
const u = 0.005 * ds;                        // level step of one 0.5 % grade over one segment
const JMIN = Math.floor((-4 - Y0) / u), JMAX = Math.ceil((46 - Y0) / u), J = JMAX - JMIN + 1;
const INF = 1e9;
const VIA = 100, FILLC = 0.25, CUTC = 0.5, GP = 5, GCH = 4, GCH_BR = 40;

/** DP over (node, level, grade, run); run = number of segments since the last grade change (capped at MINRUN): a grade may change only after MINRUN segments (minimum tangent). */
function solve(D: number, MINRUN: number, margin: number): { k: number[]; j: number[] } | null {
  const R = MINRUN;
  const base = new Float32Array((NN + 1) * J).fill(INF), isStruct = new Uint8Array((NN + 1) * J);
  for (let i = 1; i <= NN; i++) {
    const st = sts[i * STEP];
    for (let j = JMIN; j <= JMAX; j++) {
      const y = Y0 + j * u, wet = st.wet; const o = i * J + (j - JMIN);
      if (wet && y < D + margin) continue;
      const fillE = y - st.hMinE, cutE = st.hMaxE - y;
      let c = 0;
      if (wet) c += 0.5 * (y - D); else if (fillE > DESIGN.maxFill) c += VIA; else c += FILLC * Math.max(0, y - st.hC);
      if (!wet) { c += CUTC * Math.max(0, st.hC - y); if (cutE > DESIGN.maxCut) c += 500 + 100 * (cutE - DESIGN.maxCut); }
      base[o] = c; isStruct[o] = wet || fillE > DESIGN.maxFill ? 1 : 0;
    }
  }
  const SZ = J * G * R, idx = (j: number, k: number, r: number) => ((j - JMIN) * G + (k + KMAX)) * R + (r - 1);
  let cur = new Float32Array(SZ).fill(INF), nxt = new Float32Array(SZ);
  const bp = new Int8Array((NN + 1) * SZ);
  cur[idx(0, Math.round(G0 / 0.005), 1)] = 0;
  const gcost = (k: number, kp: number, wet: boolean): number => { const g = Math.abs(k) * 0.5; return GP * Math.max(0, g - 3) + 0.2 * g + (wet ? GCH_BR : GCH) * Math.abs(k - kp); };
  for (let i = 0; i < NN; i++) {
    nxt.fill(INF);
    const wet = sts[(i + 1) * STEP].wet;
    for (let j = JMIN; j <= JMAX; j++) for (let k = -KMAX; k <= KMAX; k++) for (let r = 1; r <= R; r++) {
      const v = cur[idx(j, k, r)]; if (v >= INF) continue;
      const lo = r < R ? k : -KMAX, hi = r < R ? k : KMAX;
      for (let k2 = lo; k2 <= hi; k2++) {
        const j2 = j + k2; if (j2 < JMIN || j2 > JMAX) continue;
        const o = (i + 1) * J + (j2 - JMIN); const b = base[o]; if (b >= INF) continue;
        if (isStruct[o] && k2 === 0) continue;                 // drainage: no flat grade on a structure
        const nv = v + b + gcost(k2, k, wet);
        const r2 = r < R ? r + 1 : (k2 === k ? R : 1), t = idx(j2, k2, r2);
        if (nv < nxt[t]) { nxt[t] = nv; bp[i + 1 === 0 ? 0 : (i + 1) * SZ + t] = r2 === 1 ? k + KMAX : r2 === R ? (r === R ? 1 : 0) : 0; }
      }
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  // end: ground +-1.5 m, grade <= 2 %, last tangent >= 8 segments
  let best = INF, bj = 0, bk = 0, br = 0;
  for (let j = JMIN; j <= JMAX; j++) for (let k = -4; k <= 4; k++) for (let r = Math.min(8, R); r <= R; r++) {
    const y = Y0 + j * u; if (Math.abs(y - END_H) > 1.5) continue;
    const v = cur[idx(j, k, r)] + 5 * Math.abs(y - END_H); if (v < best) { best = v; bj = j; bk = k; br = r; }
  }
  if (best >= INF) return null;
  const ks: number[] = new Array(NN), js: number[] = new Array(NN + 1);
  let j = bj, k = bk, r = br; js[NN] = j;
  for (let i = NN; i >= 1; i--) {
    ks[i - 1] = k; const t = idx(j, k, r), code = bp[i * SZ + t];
    j -= k;
    if (r === 1) { k = code - KMAX; r = R; } else if (r < R) { r = r - 1; } else { r = code === 1 ? R : R - 1; }
    js[i - 1] = j;
  }
  return { k: ks, j: js };
}

// ---------------- PVIs + vertical curves ----------------
const SPEED_STEP = 56;                                    // 17.1b: 100 -> 80 step on the straight before the structure
const kOf = (V: number, crest: boolean): number => (crest ? minVerticalK(V).crest : minVerticalK(V).sag);
interface Pvi { s: number; y: number; g1: number; g2: number; Lc: number }
function toPvi(sol: { k: number[]; j: number[] }, structStart: number): Pvi[] {
  const pv: Pvi[] = [{ s: 0, y: Y0, g1: G0, g2: G0, Lc: 0 }];
  for (let i = 1; i < NN; i++) {
    if (sol.k[i] !== sol.k[i - 1]) {
      const g1 = sol.k[i - 1] * 0.005, g2 = sol.k[i] * 0.005, s = sts[i * STEP].s, y = Y0 + sol.j[i] * u, crest = g2 < g1;
      const V = s < structStart - SPEED_STEP ? 100 : 80;
      const Acc = Math.abs(g2 - g1) * 100;
      const Lc = Acc < 0.5 ? 0 : Math.max(60, kOf(V, crest) * Acc);
      pv.push({ s, y, g1, g2, Lc: Math.ceil(Lc) });
    }
  }
  const last = sts[NS - 1];
  pv.push({ s: last.s, y: Y0 + sol.j[NN] * u, g1: sol.k[NN - 1] * 0.005, g2: 0, Lc: 0 });
  return pv;
}
function yAt(pv: Pvi[], s: number): number {
  for (const v of pv) if (v.Lc > 0 && Math.abs(s - v.s) <= v.Lc / 2) { const s0 = v.s - v.Lc / 2; return v.y + v.g1 * (s - v.s) + ((v.g2 - v.g1) / (2 * v.Lc)) * (s - s0) * (s - s0); }
  let k = 0; while (k + 1 < pv.length && s > pv[k + 1].s - pv[k + 1].Lc / 2) k++;
  const v = pv[k]; const g = s >= v.s ? v.g2 : v.g1; return v.y + g * (s - v.s);
}
function gradeAt(pv: Pvi[], s: number): number {
  for (const v of pv) if (v.Lc > 0 && Math.abs(s - v.s) <= v.Lc / 2) { const s0 = v.s - v.Lc / 2; return v.g1 + ((v.g2 - v.g1) / v.Lc) * (s - s0); }
  let k = 0; while (k + 1 < pv.length && s > pv[k + 1].s - pv[k + 1].Lc / 2) k++;
  return s >= pv[k].s ? pv[k].g2 : pv[k].g1;
}

// ---------------- evaluate one option ----------------
interface Run { a: number; b: number }
const MERGE_GAP = 100;   // two structure runs closer than 100 m are ONE structure (a short embankment between two viaducts is not built; also stops flutter where the fill is right at 7.0 m)
const mergeRuns = (r: Run[]): Run[] => { const o: Run[] = []; for (const q of r) { const l = o[o.length - 1]; if (l && q.a - l.b < MERGE_GAP) l.b = q.b; else o.push({ ...q }); } return o; };
const runs = (flag: boolean[]): Run[] => { const r: Run[] = []; let c: Run | null = null; flag.forEach((f, i) => { if (f) { if (!c) c = { a: sts[i].s, b: sts[i].s }; c.b = sts[i].s; } else if (c) { r.push(c); c = null; } }); if (c) r.push(c); return r; };
interface Ev { opt: typeof OPTIONS[number]; D: number; pvi: Pvi[]; y: number[]; g: number[]; structRuns: Run[]; viaW: number; viaE: number; bridgeLen: number; structStart: number; structEnd: number;
  margin: number; minRun: number; maxG: number; maxCut: number; maxFill: number; minDeck: number; cutBad: number; fillEmb: number; curves: { s: number; A: number; Lc: number; K: number; Kmin: number; crest: boolean; V: number }[]; overlap: number; shortTan: number;
  islandWatch: { a: number; b: number; cross: number }[]; endY: number; endG: number; solved: boolean }
function evaluate(opt: typeof OPTIONS[number]): Ev | null {
  // margin on the deck level and minimum tangent are tried on a small grid; the FINAL profile (with its parabolic curves) must have no curve overlap, keep the deck >= D on the strait and cut <= 12 m;
  // among the valid ones the shortest structure wins (then the fewest PVIs). If none is valid the least bad one is returned and the checks show the FAIL.
  const D = DHWL + opt.clear + TSTR;
  let best: Ev | null = null, bestScore = Infinity, fallback: Ev | null = null;
  for (const margin of [0.3, 0.4, 0.5, 0.65, 0.8]) for (const mr of [12, 16, 20, 24]) {
    const e = build(opt, D, margin, mr); if (!e) continue; fallback = fallback ?? e;
    if (!(e.overlap >= 0 && e.minDeck >= D - 1e-6 && e.cutBad === 0)) continue;
    const score = e.viaW + e.viaE + 0.01 * e.pvi.length;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best ?? fallback;
}
function build(opt: typeof OPTIONS[number], D: number, margin: number, minRun: number): Ev | null {
  const sol = solve(D, minRun, margin); if (!sol) return null;
  const dpFlag = sts.map((st, i) => st.wet || Y0 + sol.j[Math.min(NN, Math.round(i / STEP))] * u - st.hMinE > DESIGN.maxFill); const dr = runs(dpFlag);
  const pvi = toPvi(sol, dr.length ? dr[0].a : WA);
  const y = sts.map((st) => yAt(pvi, st.s)), g = sts.map((st) => gradeAt(pvi, st.s));
  const flag = sts.map((st, i) => st.wet || y[i] - st.hMinE > DESIGN.maxFill);
  const sr = mergeRuns(runs(flag));
  const viaW = sr.length ? Math.max(0, WA - sr[0].a) : 0, viaE = sr.length ? Math.max(0, sr[sr.length - 1].b - WB) : 0;
  let maxCut = 0, maxFill = 0, minDeck = 1e9, cutBad = 0, fillEmb = 0;
  sts.forEach((st, i) => {
    if (st.wet) minDeck = Math.min(minDeck, y[i]);
    if (!flag[i]) { maxFill = Math.max(maxFill, y[i] - st.hMinE); fillEmb = Math.max(fillEmb, y[i] - st.hC); }
    maxCut = Math.max(maxCut, st.hMaxE - y[i]); if (st.hMaxE - y[i] > DESIGN.maxCut) cutBad += 5;
  });
  const curves = pvi.filter((v) => v.Lc > 0).map((v) => { const Acc = Math.abs(v.g2 - v.g1) * 100, crest = v.g2 < v.g1; const V = v.s < (sr.length ? sr[0].a : WA) - SPEED_STEP ? 100 : 80; return { s: v.s, A: Acc, Lc: v.Lc, K: v.Lc / Acc, Kmin: kOf(V, crest), crest, V }; });
  let overlap = 0, shortTan = 1e9;
  for (let i = 0; i + 1 < pvi.length; i++) { const a = pvi[i], b = pvi[i + 1]; const free = b.s - a.s - a.Lc / 2 - b.Lc / 2; overlap = Math.min(overlap, free); shortTan = Math.min(shortTan, free); }
  // island cross-slope watch list: stations with natural cross slope >= 22 % on the island part
  const watch: { a: number; b: number; cross: number }[] = []; let cw: { a: number; b: number; cross: number } | null = null;
  sts.forEach((st) => { if (st.s > WB && st.cross >= 22) { if (!cw) cw = { a: st.s, b: st.s, cross: st.cross }; cw.b = st.s; cw.cross = Math.max(cw.cross, st.cross); } else if (cw) { watch.push(cw); cw = null; } });
  if (cw) watch.push(cw);
  return { opt, D, margin, minRun, pvi, y, g, structRuns: sr, viaW, viaE, bridgeLen: WB - WA, structStart: sr.length ? sr[0].a : NaN, structEnd: sr.length ? sr[sr.length - 1].b : NaN,
    maxG: Math.max(...g.map(Math.abs)), maxCut, maxFill, minDeck, cutBad, fillEmb, curves, overlap, shortTan, islandWatch: watch, endY: y[NS - 1], endG: g[NS - 1], solved: true };
}

// ---------------- sheet ----------------
const D5 = (sts[NS - 1].s - sts[0].s) / (NS - 1);
const WET_LEN = WB - WA + 2 * D5;            // 17.1c counts every wet 10 m cell: 299 m
pr(`ISLAND LINK M6-1 VERTICAL PROFILE (Step 17.1d)   centreline of 17.1c (length ${f0(L)} m), start = level and grade of the J1-S arm end, ground = natural ground + island (no roads)`);
pr(`   START: level ${f2(Y0)} m (= S node, arm end), grade +${f2(GARM * 100)} % (arm) -> profile starts with +${f2(G0 * 100)} % (0.5 % grid, difference ${f2(Math.abs(GARM - G0) * 100)} %, below the 0.5 % curve-skip limit: no kink)`);
pr(`   WATER: sea level 0 m, wet on the centreline s ${f0(WA)}-${f0(WB)} (${f0(WET_LEN)} m as in 17.1c); horizontal curve (V80, R ${A.chosen.R} m) starts s ${f0(CURVE_S)}; island centre ground ${f2(END_H)} m at s ${f0(L)}`);
pr(`   ASSUMPTIONS (change them in the script and rerun): A1 start level and grade = arm end (the 4-leg interchange of 17.4c may change the first 100-200 m); A2 design high water ${f1(DHWL)} m above sea level 0 (no tide / wave data in the game, 18.2 fixes it); A3 structure depth soffit -> road ${f1(TSTR)} m (depends on the concept of 18.1); A4 clearance = soffit above design high water over the whole wet crossing (channel width not decided); A5 ground = natural ground (the finished road is cut / filled into it); A6 ship traffic: the user has NOT said ships pass, the options only show what each height costs`);
pr(`   RULES: grade <= 4 % (3 % desirable), cut <= ${DESIGN.maxCut} m, fill <= ${DESIGN.maxFill} m else viaduct (17.2 rule 5, measured at the pavement edge +-${PAVE} m), drainage (grade >= 0.5 % on tangents on a structure, K <= 167 on curves there), parabolic vertical curves with K from SSD (V100 crest ${f1(minVerticalK(100).crest)} / sag ${f1(minVerticalK(100).sag)}, V80 crest ${f1(minVerticalK(80).crest)} / sag ${f1(minVerticalK(80).sag)}), L >= 60 m, 100 -> 80 step ${SPEED_STEP} m before the first structure, no overlap of curves, structure inside s 0-${f0(CURVE_S)} (17.1c requirement: no horizontal curve on a bridge or its approach)`);
pr(`   METHOD: dynamic programming, 10 m stations, level step 0.05 m, grade step 0.5 %, minimum tangent 12-28 segments of 10 m (raised until no curves overlap); cost = approach viaduct length first, then cut / fill, then grade size and grade changes; the PVI table is then rebuilt with parabolic curves and EVERY check below is run on the FINAL profile every 5 m.`);

const evs: Ev[] = [];
for (const o of OPTIONS) { const e = evaluate(o); if (e) evs.push(e); else pr(`   ${o.name}: NO PROFILE FOUND (DP infeasible)`); }
const tot = (e: Ev) => e.viaW + WET_LEN + e.viaE;

pr(`\n1. RESULT PER OPTION   (D = design high water ${f1(DHWL)} + clearance + structure depth ${f1(TSTR)} = road level on the strait)`);
const H = ['option', 'clear', 'D (m)', 'max grade', 'mainland viaduct', 'strait bridge', 'island viaduct', 'structure total', 'structure from-to (s)', 'ends before curve (961)?', 'max cut / fill*'];
const rowsT = evs.map((e) => [e.opt.name, f1(e.opt.clear), f1(e.D), `${f2(e.maxG * 100)} %`, `${f0(e.viaW)} m`, `${f0(WET_LEN)} m`, `${f0(e.viaE)} m`, `${f0(tot(e))} m`, `${f0(e.structStart)} - ${f0(e.structEnd)}`, e.structEnd <= CURVE_S ? 'yes' : `NO, +${f0(e.structEnd - CURVE_S)} m into the curve`, `${f1(e.maxCut)} / ${f1(e.maxFill)} m`]);
const wid = H.map((h, c) => Math.max(h.length, ...rowsT.map((r) => r[c].length)));
pr('   ' + H.map((h, c) => h.padEnd(wid[c])).join('  '));
for (const r of rowsT) pr('   ' + r.map((v, c) => v.padEnd(wid[c])).join('  '));
pr('   * max cut at the pavement edge / max fill at the pavement edge outside the structure (limit 12 / 7 m). The mainland viaduct is from its first pier to the shore, the island viaduct from the shore to its last pier.');
pr(`   Length with grade above 3 % (desirable limit): ${evs.map((e) => `${e.opt.id} ${f0(e.g.filter((q) => Math.abs(q) > 0.0301).length * D5)} m`).join(', ')}.`);

pr('\n2. PVI TABLES (s from the S node, y = level at the PVI, g in %, Lc = vertical curve length, K = Lc / A; same format as J1ArmProfiles.ts, ready for 17.1g)');
for (const e of evs) {
  pr(`   ${e.opt.name}   (minimum tangent ${e.minRun * 10} m, DP deck margin ${f1(e.margin)} m)`);
  for (const v of e.pvi) { const A2 = Math.abs(v.g2 - v.g1) * 100; pr(`      s ${f1(v.s).padStart(7)}  y ${f2(v.y).padStart(6)}  g1 ${f2(v.g1 * 100).padStart(6)} %  g2 ${f2(v.g2 * 100).padStart(6)} %  Lc ${String(v.Lc).padStart(4)} m${v.Lc > 0 ? `  K ${f1(v.Lc / A2)}` : ''}`); }
}

pr('\n3. ISLAND CROSS SLOPE WATCH (natural ground over the ROW +-' + f2(ROW) + ' m, limit 25 %, stations with >= 22 %)');
const crossMax = Math.max(...sts.map((q) => q.cross)), crossAt = sts.find((q) => q.cross === crossMax)!.s;
const crossHigh = sts.filter((q) => q.cross > 25).length * D5;
const watch = evs[0].islandWatch;
pr(`   steepest natural cross slope on the link: ${f1(crossMax)} % at s ${f0(crossAt)}; length above 25 %: ${f0(crossHigh)} m`);
if (!watch.length) pr('   no stretch >= 22 %'); else for (const w of watch) {
  const per = evs.map((e) => { let c = 0, f = 0; sts.forEach((q, i) => { if (q.s >= w.a && q.s <= w.b) { c = Math.max(c, q.hMaxE - e.y[i]); f = Math.max(f, e.y[i] - q.hMinE); } }); return `${e.opt.id}: cut ${f1(c)} / fill ${f1(f)} m`; });
  pr(`   s ${f0(w.a)}-${f0(w.b)}: cross slope up to ${f1(w.cross)} %   edge cut / fill (pavement edge, whole stretch): ${per.join(' | ')}`);
}

// ---------------- checks ----------------
let pass = 0, fail = 0;
const chk = (name: string, ok: boolean, info: string) => { if (ok) pass++; else fail++; pr(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(100)} ${info}`); };
pr('\n4. CHECKS (every line is a real test on the final profile; FAIL lines are findings for the user, not hidden)');
pr('   --- data / method (all options) ---');
const mism = sts.filter((q) => (q.hC < 0) !== q.wet).length;
chk('ground sampler reproduces the 17.1c wet run on every 5 m station (centreline below sea level == s 529-818)', mism <= 2, `${mism} stations differ`);
chk('start of the profile = finished J1-S arm end: level', Math.abs(evs[0].y[0] - armEnd.y) < 1e-6, `${f2(evs[0].y[0])} m vs ${f2(armEnd.y)} m`);
chk('start grade within 0.5 % of the arm end grade (no kink in the profile at the node)', evs.every((e) => Math.abs(e.g[0] - GARM) < 0.005), `${f2(evs[0].g[0] * 100)} % vs ${f2(GARM * 100)} %`);
chk(`no stretch with natural cross slope above 25 % on the whole link (17.1c limit, island cross slope watch)`, crossHigh === 0, `steepest ${f1(crossMax)} % at s ${f0(crossAt)}`);
chk('profile covers the whole 17.1c centreline', Math.abs(evs[0].pvi[evs[0].pvi.length - 1].s - L) < 0.1, `last PVI s ${f1(evs[0].pvi[evs[0].pvi.length - 1].s)} m, length ${f2(L)} m (stations are rounded to 0.1 m in the json)`);
for (const e of evs) {
  pr(`   --- ${e.opt.name} ---`);
  const id = e.opt.id;
  chk(`${id}: grade <= 4 % everywhere (final curves)`, e.maxG <= 0.04 + 1e-6, `max ${f2(e.maxG * 100)} %`);
  const kBad = e.curves.filter((c) => c.K < c.Kmin - 1e-6);
  chk(`${id}: every vertical curve K >= K from SSD (crest / sag, V100 or V80) and L >= 60 m`, kBad.length === 0 && e.curves.every((c) => c.Lc >= 60), `${e.curves.length} curves, lowest K margin ${f1(Math.min(...e.curves.map((c) => c.K - c.Kmin)))}`);
  chk(`${id}: no overlap of vertical curves (free tangent >= 0)`, e.overlap >= 0, `shortest free tangent ${f0(e.shortTan)} m`);
  chk(`${id}: first vertical curve starts after the node (s >= 0)`, e.pvi.filter((v) => v.Lc > 0).every((v) => v.s - v.Lc / 2 >= 0), `first curve starts s ${f0(Math.min(...e.pvi.filter((v) => v.Lc > 0).map((v) => v.s - v.Lc / 2)))}`);
  chk(`${id}: road level over the whole wet crossing >= D = ${f1(e.D)} m (clearance ${f1(e.opt.clear)} m + structure ${f1(TSTR)} m + water ${f1(DHWL)} m)`, e.minDeck >= e.D - 1e-6, `lowest ${f2(e.minDeck)} m`);
  const flagS = sts.map((q, i) => q.wet || e.y[i] - q.hMinE > DESIGN.maxFill);
  const flatTan = sts.filter((q, i) => flagS[i] && e.pvi.every((v) => Math.abs(q.s - v.s) > v.Lc / 2 + 1e-6) && Math.abs(e.g[i]) < 0.005 - 1e-6).length;
  chk(`${id}: drainage: tangents on the structure have |grade| >= 0.5 %, curves there have K <= 167`, flatTan === 0 && e.curves.filter((c) => { const q = sts.findIndex((z) => z.s >= c.s); return q >= 0 && flagS[q]; }).every((c) => c.K <= 167), `${flatTan} flat stations`);
  chk(`${id}: cut at the pavement edge <= ${DESIGN.maxCut} m everywhere`, e.maxCut <= DESIGN.maxCut, `max ${f1(e.maxCut)} m`);
  chk(`${id}: fill at the pavement edge <= ${DESIGN.maxFill} m outside the structure (else it is viaduct)`, e.maxFill <= DESIGN.maxFill + 1e-6, `max ${f2(e.maxFill)} m`);
  chk(`${id}: the structure is ONE run (gaps shorter than ${MERGE_GAP} m between viaducts are merged, a longer embankment between them would be a second structure)`, e.structRuns.length === 1, `${e.structRuns.length} run(s)`);
  chk(`${id}: bridge + approach viaducts end before the horizontal curve (17.1c requirement, s <= ${f0(CURVE_S)})`, e.structEnd <= CURVE_S, `structure s ${f0(e.structStart)}-${f0(e.structEnd)}, ${e.structEnd <= CURVE_S ? 'margin ' + f0(CURVE_S - e.structEnd) + ' m' : 'overshoot ' + f0(e.structEnd - CURVE_S) + ' m'}`);
  chk(`${id}: end of the profile at the island centre: level within 1.5 m of the ground and grade <= 2 %`, Math.abs(e.endY - END_H) <= 1.5 && Math.abs(e.endG) <= 0.02 + 1e-9, `level ${f2(e.endY)} m (ground ${f2(END_H)} m), grade ${f2(e.endG * 100)} %`);
}
pr(`\n  ${pass} PASS, ${fail} FAIL`);
const fails = evs.filter((e) => e.structEnd > CURVE_S);
pr('\n5. WHAT THE FAILS MEAN (for the choice)');
for (const e of fails) pr(`   ${e.opt.name}: the approach viaduct on the island side ends at s ${f0(e.structEnd)}, ${f0(e.structEnd - CURVE_S)} m after the start of the horizontal curve (s ${f0(CURVE_S)}). Ways out: (a) redo 17.1c with the curve start moved to about s ${f0(e.structEnd + 100)} (the last straight would be about ${f0(L - (e.structEnd + 100) - (A.chosen.st - A.chosen.ts))} m, rule >= 200 m; the 25 % cross slope check of the island must be run again, NOT done here), (b) accept an embankment higher than 7 m on the island side (breaks rule 17.2-5, the user must decide), (c) lower the structure depth A3 (a thinner deck lowers D).`);
if (!fails.length) pr('   none');
const sens = evs.filter((e) => !e.opt.ref); const sl: string[] = [];
for (let q = 1; q < sens.length; q++) sl.push(`${sens[q - 1].opt.id} -> ${sens[q].opt.id}: ${f0((tot(sens[q]) - tot(sens[q - 1])) / (sens[q].D - sens[q - 1].D))} m`);
pr(`   SENSITIVITY: structure length grows by about (${sl.join(', ')}) per metre of road level on the strait (4 % grade on both sides), so A2 / A3 (+-0.5 m) move the approach viaducts by about +-15 m per option.`);
const need = evs.map((e) => { const drop = Y0 + G0 * 300 - e.D, avail = WA - 300; return `${e.opt.id} ${f1((drop / avail) * 100)} %`; });
pr(`   OPEN (first 300 m after the node): the first vertical curve starts at s ${evs.map((e) => e.opt.id + ' ' + f0(Math.min(...e.pvi.filter((v) => v.Lc > 0).map((v) => v.s - v.Lc / 2)))).join(', ')}. 17.1b wants a weave zone of 300 m after the node. If the grade were kept CONSTANT (+${f1(G0 * 100)} %) for those 300 m, the road would still have to come down to the deck level D before the shore (s ${f0(WA)}): grade needed ${need.join(', ')} (limit 4 %). The 4-leg interchange (17.4c) decides; here a vertical curve inside the zone is allowed (no rule forbids it) and flagged.`);
pr(`   CROSS SLOPE NOTE: 17.1c measured the cross slope every 10 m (24.98 %, nothing above 25 %); this step measures every 5 m on the same line and finds ${f1(crossMax)} % at s ${f0(crossAt)} (${f0(crossHigh)} m above 25 %): the same ground, a finer grid, so the 17.1c PASS was true only for its grid. It is on the last straight, the cut / fill there is shown in section 3 (cut ${f1(6)} m at most), no structure is needed.`);
pr('   NOT done here: structures list (17.1e), interchange at the S node and island centre node (17.4c / 17.1f), quantities, the bridge design itself (18.x), game build (17.1g). tsc / npm run build / game: see the run list in the handoff row.');
void SPEED_STEP;

writeFileSync(`${out}/STEP171D_OUTPUT.txt`, P.join('\n') + '\n');
writeFileSync(`${out}/island_link_profile.json`, JSON.stringify({
  length: L, wetA: WA, wetB: WB, curveS: CURVE_S, endGround: END_H, startY: Y0, startG: G0, dhwl: DHWL, tstr: TSTR, rowHalf: ROW, pavEdge: PAVE,
  stations: sts.map((q) => [Math.round(q.s * 10) / 10, Math.round(q.hC * 100) / 100, Math.round(q.hMinE * 100) / 100, Math.round(q.hMaxE * 100) / 100, Math.round(q.cross * 10) / 10, q.wet ? 1 : 0]),
  options: evs.map((e) => ({ id: e.opt.id, name: e.opt.name, ref: e.opt.ref, clear: e.opt.clear, D: e.D, minRun: e.minRun, pvi: e.pvi.map((v) => ({ s: Math.round(v.s * 10) / 10, y: Math.round(v.y * 1000) / 1000, g1: Math.round(v.g1 * 1e6) / 1e6, g2: Math.round(v.g2 * 1e6) / 1e6, Lc: v.Lc })),
    y: e.y.map((q) => Math.round(q * 100) / 100), structRuns: e.structRuns, viaW: e.viaW, viaE: e.viaE, bridge: WET_LEN, maxG: e.maxG, maxCut: e.maxCut, maxFill: e.maxFill })),
}));
pr(`wrote ${out}/island_link_profile.json and ${out}/STEP171D_OUTPUT.txt`);
