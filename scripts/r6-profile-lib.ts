// SHARED CODE of the R6 profile check (G3) and the re-route (G4). STEP G3 (headless): REAL GRADE CHECK of every kept R6 line (section 20, rule R11). Only READS the world and the G2b / G2c line files, changes nothing in src/.
// Input : docs/r6_g2b.json (37 kept lines) + docs/r6_g2c.json (5 re-routed lines) = 42 lines, 25.9 km. The lines are NOT changed (R10: the user's sketch stays).
// Ground: TerrainGenerator.sampleGround (natural ground + sea / rivers, no roads, no rail earthworks), every ~10 m, at the centreline and at both pavement edges.
// Method: per line a dynamic programme on the 10 m stations: level step 0.05 m, grade in steps of 0.5 % with |grade| <= 4 % (R11 limit), 3 % is the AIM (a penalty above 3 %),
//         grade change <= 1 % per station, cost = cut + fill (+ heavy penalty for cut > 12 m, fill > 7 m = viaduct, wet = bridge), the ends are FREE (see LIMITS in the output).
// Run   : npx tsx scripts/r6-profile-check.ts [out-dir]     writes <out>/r6_g3.json (for the picture) and <out>/STEP_R6_G3_OUTPUT.txt and prints the sheet.
import { readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { DESIGN } from '../src/roads/standards/Criteria';

export const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);

// ---------------- constants ----------------
export const LIM = DESIGN.maxGrade.motorway * 100;          // 4 %  (R11 limit)
export const AIM = DESIGN.maxGrade.motorwayDesirable * 100; // 3 %  (R11 aim)
export const MAXCUT = DESIGN.maxCut, MAXFILL = DESIGN.maxFill; // 12 m, 7 m (3.3)
export const PAVE = SECTION_M6.pavementEdge ?? 18.45;       // m from the centreline to the pavement edge
export const WIDTH = 2 * PAVE;                              // block width used for the indicative volumes
export const FREEBOARD = 1.5;                               // ASSUMPTION: deck >= water level + 1.5 m on a wet station (bridge); no tide / ship data in the game
const KM = Math.round(LIM / 0.5), G = 2 * KM + 1;    // grade index k = -8 .. 8 (x 0.5 %)
export const WATCH = [22, 29, 44, 45, 62];                  // source lines named in G2d, shown first
export const GP = 6, GCH = 3, FILLC = 0.8, CUTC = 1.0, VIA = 100, VIAWET = 40;

// ---------------- ground ----------------
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
export const gnd = (x: number, z: number) => { gen.sampleGround(x, z, sc); const wl = Number.isNaN(sc.water) ? 0 : Math.max(0, sc.water); return { h: sc.h, wl, wet: sc.h < 0 || (!Number.isNaN(sc.water) && sc.h < sc.water - 0.05) }; };

// ---------------- inputs ----------------
export interface Src { id: number; origin: string; pts: number[][]; minR: number | null; /** STEP G6b: optional FIXED finished level (m) at the first / last point (a junction with another road); omitted = free end as in G3 - G5 */ fixY0?: number; fixY1?: number }
export function loadG2(dir: string): { srcs: Src[]; b2Crossings: number; nKept: number; nRerouted: number } {
  const B = JSON.parse(readFileSync(`${dir}/r6_g2b.json`, 'utf8')) as { lines: { src_id: number; min_radius_m?: number; pts: number[][] }[]; crossings: unknown[] };
  const C = JSON.parse(readFileSync(`${dir}/r6_g2c.json`, 'utf8')) as { rerouted: { src_id: number; min_radius_m?: number; pts: number[][] }[] };
  return { srcs: [...B.lines.map((l) => ({ id: l.src_id, origin: 'G2b kept' as const, pts: l.pts, minR: l.min_radius_m ?? null })), ...C.rerouted.map((l) => ({ id: l.src_id, origin: 'G2c re-routed' as const, pts: l.pts, minR: l.min_radius_m ?? null }))], b2Crossings: B.crossings.length, nKept: B.lines.length, nRerouted: C.rerouted.length };
}

// ---------------- resample to stations of about 10 m ----------------
export function resample(pts: number[][]): { x: number[]; z: number[]; ds: number; len: number } {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.max(2, Math.round(len / 10)), ds = len / n;
  const x: number[] = [], z: number[] = []; let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = i * ds; while (k + 1 < cum.length - 1 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    x.push(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t); z.push(pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t);
  }
  return { x, z, ds, len };
}

// ---------------- the profile DP ----------------
export interface Res {
  id: number; origin: string; len: number; ds: number; N: number; minR: number | null; firstStruct: number;
  s: number[]; x: number[]; z: number[]; h: number[]; y: number[]; wet: boolean[];
  natMaxG: number; natOver: number; maxG: number; over3: number; over4: number; gradeChanges: number;
  maxCut: number; maxCutAt: number; maxFill: number; maxFillAt: number; cutVol: number; fillVol: number; wetLen: number; highFillLen: number; structLen: number;
  gradeOK: boolean; workOK: boolean; pass: boolean; reasons: string[]; y0: number; y1: number; meanAbsCF: number;
}
export function solveLine(src: Src): Res {
  const r = resample(src.pts), N = r.x.length, ds = r.ds, u = 0.005 * ds;
  const hC: number[] = [], hMin: number[] = [], hMax: number[] = [], wl: number[] = [], wet: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), tx = r.x[b] - r.x[a], tz = r.z[b] - r.z[a], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    const c = gnd(r.x[i], r.z[i]), l = gnd(r.x[i] + nx * PAVE, r.z[i] + nz * PAVE), q = gnd(r.x[i] - nx * PAVE, r.z[i] - nz * PAVE);
    hC.push(c.h); hMin.push(Math.min(c.h, l.h, q.h)); hMax.push(Math.max(c.h, l.h, q.h)); wl.push(Math.max(c.wl, l.wl, q.wl)); wet.push(c.wet);
  }
  const fx = [src.fixY0, src.fixY1].filter((v): v is number => v !== undefined);
  const lo = Math.floor(Math.min(...hMin, ...fx) - 6), hi = Math.ceil(Math.max(...hMax, ...fx, ...wl.map((w, i) => (wet[i] ? w + FREEBOARD : -1e9))) + 6);
  const J = Math.round((hi - lo) / u) + 1, INF = 1e9, SZ = J * G;
  const base = new Float32Array(J);
  const baseRow = (i: number) => {
    for (let j = 0; j < J; j++) {
      const y = lo + j * u;
      if (wet[i]) { base[j] = y < wl[i] + FREEBOARD ? INF : VIAWET + 0.3 * (y - wl[i]); continue; }
      const fillE = y - hMin[i], cutE = hMax[i] - y;
      let c = 0;
      if (fillE > MAXFILL) c += VIA; else c += FILLC * Math.max(0, y - hC[i]);
      c += CUTC * Math.max(0, hC[i] - y);
      if (cutE > MAXCUT) c += 200 + 100 * (cutE - MAXCUT);
      base[j] = c;
    }
  };
  const gcost = (k: number) => { const g = Math.abs(k) * 0.5; return GP * Math.max(0, g - AIM) + 0.1 * g; };
  let cur = new Float32Array(SZ).fill(INF), nxt = new Float32Array(SZ);
  const bp = new Int8Array(N * SZ);
  baseRow(0);
  const jFix0 = src.fixY0 === undefined ? -1 : Math.round((src.fixY0 - lo) / u), jFix1 = src.fixY1 === undefined ? -1 : Math.round((src.fixY1 - lo) / u);
  for (let j = 0; j < J; j++) if (base[j] < INF && (jFix0 < 0 || j === jFix0)) for (let k = -KM; k <= KM; k++) cur[j * G + k + KM] = base[j] + gcost(k);
  for (let i = 1; i < N; i++) {
    nxt.fill(INF); baseRow(i);
    for (let j = 0; j < J; j++) {
      const b = base[j]; if (b >= INF) continue;
      for (let k = -KM; k <= KM; k++) {
        const jp = j - k; if (jp < 0 || jp >= J) continue;
        let best = INF, bk = 0;
        for (let kp = Math.max(-KM, k - 2); kp <= Math.min(KM, k + 2); kp++) {
          const v = cur[jp * G + kp + KM]; if (v >= INF) continue;
          const nv = v + GCH * Math.abs(k - kp); if (nv < best) { best = nv; bk = kp; }
        }
        if (best >= INF) continue;
        const t = j * G + k + KM; nxt[t] = best + b + gcost(k); bp[i * SZ + t] = bk;
      }
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  let bestV = INF, bj = 0, bk = 0;
  for (let j = 0; j < J; j++) { if (jFix1 >= 0 && j !== jFix1) continue; for (let k = -KM; k <= KM; k++) { const v = cur[j * G + k + KM]; if (v < bestV) { bestV = v; bj = j; bk = k; } } }
  const ks: number[] = new Array(N).fill(0), y: number[] = new Array(N).fill(0);
  if (bestV >= INF) throw new Error(`line ${src.id}: no profile found (DP infeasible)`);
  let j = bj, k = bk;
  for (let i = N - 1; i >= 1; i--) { y[i] = lo + j * u; ks[i] = k; const kp = bp[i * SZ + j * G + k + KM]; j -= k; k = kp; }
  y[0] = lo + j * u; ks[0] = ks[1];
  // ---- checks on the FINAL profile (not on the DP cost)
  let firstStruct = -1; let maxG = 0, over3 = 0, over4 = 0, changes = 0, maxCut = 0, maxCutAt = 0, maxFill = 0, maxFillAt = 0, cutVol = 0, fillVol = 0, wetLen = 0, hiFill = 0, cfSum = 0;
  for (let i = 1; i < N; i++) {
    const g = Math.abs(y[i] - y[i - 1]) / ds * 100; maxG = Math.max(maxG, g);
    if (g > AIM + 1e-6) over3 += ds; if (g > LIM + 1e-6) over4 += ds; if (i > 1 && Math.abs(ks[i] - ks[i - 1]) > 0) changes++;
  }
  for (let i = 0; i < N; i++) {
    if (wet[i]) { wetLen += ds; if (firstStruct < 0) firstStruct = i; continue; }
    const fillE = y[i] - hMin[i], cutE = hMax[i] - y[i];
    if (fillE > MAXFILL) { hiFill += ds; if (firstStruct < 0) firstStruct = i; continue; }
    if (cutE > maxCut) { maxCut = cutE; maxCutAt = i; }
    if (y[i] - hC[i] > maxFill) { maxFill = y[i] - hC[i]; maxFillAt = i; }
    cutVol += Math.max(0, hC[i] - y[i]) * WIDTH * ds; fillVol += Math.max(0, y[i] - hC[i]) * WIDTH * ds; cfSum += Math.abs(y[i] - hC[i]);
  }
  let natMaxG = 0, natOver = 0;
  for (let i = 0; i + 3 < N; i++) { const g = Math.abs(hC[i + 3] - hC[i]) / (3 * ds) * 100; natMaxG = Math.max(natMaxG, g); if (g > LIM) natOver += ds; }
  const gradeOK = maxG <= LIM + 1e-6;
  const cutBad = maxCut > MAXCUT + 1e-6, structLen = wetLen + hiFill;
  const workOK = !cutBad && structLen < 1e-6;
  const reasons: string[] = [];
  if (!gradeOK) reasons.push(`grade ${f1(maxG)} % > ${LIM} %`);
  if (cutBad) reasons.push(`cut ${f1(maxCut)} m > ${MAXCUT} m at station ${f0(maxCutAt * ds)} m`);
  if (wetLen > 0) reasons.push(`wet ${f0(wetLen)} m (sea / river: bridge needed, not designed)`);
  if (hiFill > 0) reasons.push(`fill > ${MAXFILL} m on ${f0(hiFill)} m (viaduct needed, not designed)`);
  const s = hC.map((_, i) => i * ds);
  return { id: src.id, origin: src.origin, len: r.len, ds, N, minR: src.minR, firstStruct: firstStruct < 0 ? 0 : firstStruct * ds, s, x: r.x, z: r.z, h: hC, y, wet, natMaxG, natOver, maxG, over3, over4, gradeChanges: changes,
    maxCut, maxCutAt: maxCutAt * ds, maxFill, maxFillAt: maxFillAt * ds, cutVol, fillVol, wetLen, highFillLen: hiFill, structLen, gradeOK, workOK, pass: gradeOK && workOK, reasons, y0: y[0], y1: y[N - 1], meanAbsCF: cfSum / Math.max(1, N) };
}

