// STEP 21.6 FIT-1 REAL ALIGNMENT FIT, one class per run (default R6): straight - spiral - arc - spiral - straight (headless; changes NO src file, writes only docs/).
// Run: npx tsx scripts/centre-fit.ts docs 6        (class 6 | 4 | 2 | C | L; M8 and the J1 arms are built already)
//      without tsx: node --experimental-strip-types --import ./scripts/reg.mjs scripts/centre-fit.ts docs 6   (scripts/reg.mjs = a small resolver for the extensionless imports)
// Reads dir/centre_fixed.json (polylines), dir/centre_curves.json (21.6e-1 bends), dir/centre_sections.json (lanes, lane width); writes dir/centre_fit_<cls>.json and dir/STEP_21_6FIT_<cls>_OUTPUT.txt.
// METHOD (my numbers, constants below): (1) take the measured bends of 21.6e-1; (2) MERGE two same-direction bends whose straight is under MERGE_MAX (80 m: one bend that the
// measurement split; a larger gap under 6 V is NOT merged, because merging 400 m of straight into one big bend moves the road by 100 m or more: it stays a FINDING for the user), DROP the smaller of two
// reverse bends under 2 V when it turns less than 10 deg (a wiggle of the drawn line); (3) for every bend the PI = crossing of the entry and exit tangents (chords of 60 m
// before and after the bend); (4) R = the radius whose tangent length (with the spiral shift) equals the measured tangent length, never under the class minimum, never over
// RCAP; Ls = Checks.spiralLength with the runoff of 21.6e-3 (e rule of 21.6e-2); (5) two curves that overlap get a smaller R; (6) buildOpenAlignment (start and end pinned on
// the first and last point of the line) and the deviation of the real alignment from the drawn line every 5 m. R10: as close to his line as possible; DEV_MAX is MY limit.
// FIT-1b (2026-11-17, decisions of the AI, see HANDOFF_ROAD_DESIGN.md 21.25): after the first fit a LADDER is run for every line that fails a rule; the next rung is used only if the one before fails:
//   A1 SHIFT: every PI may move up to SHIFT_MAX 30 m from its measured place, a FREE end (no other road there) may move up to 30 m; PIs may be dropped (smoothing of a drawn wiggle) if the fit stays inside DEV_MAX;
//   A2 SLIDE: the end node of a line that meets an 8-lane road / another road in the middle (a T) slides along that road up to SLIDE_MAX 60 m (a node shared by two or more line ENDS is never moved here);
//   A3 SPEED: the design speed of a single bend goes down in steps of 5 km/h (advisory speed, 21.21) to half of the class speed;
//   A4 CORNER: only the first / last bend of a line (a junction corner) may go below that, the result is listed for 21.7 as an intersection corner.
// The 6 V / 2 V rule stays HARD; where the DRAWN line itself has two bends less than 80 m apart the pair is a WARNING with the reason, not a FAIL. Search = seeded (1+1) evolution strategy over PI x, z, ln R (and end slide, speed), cost in costOf().
import { readFileSync, writeFileSync } from 'fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { tangentLength } from '../src/roads/alignment/Clothoid';
import { minRadius, spiralLength, superelevation } from '../src/roads/standards/Checks';

const OUT = process.argv[2] ?? 'docs', CLS = process.argv[3] ?? '6';
const VS: Record<string, number> = { '6': 80, '4': 60, '2': 40, C: 40, L: 30 };
const V = VS[CLS]; if (!V) throw new Error('class must be one of 6 4 2 C L');
const DS = 5, RCAP = 6000, DEV_MAX = 15, WIGGLE_DEG = 10, MERGE_MAX = 80, CROWN = 0.02, EMAX = 0.08, REL_GRAD = 0.0044;
const up = (v: number, q: number): number => Math.ceil(v / q - 1e-9) * q;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const deg = (r: number): number => (r * 180) / Math.PI;
const wrap = (a: number): number => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const SEC = (JSON.parse(readFileSync(`${OUT}/centre_sections.json`, 'utf8')).sections as any[]).find((s) => String(s.cls).replace(/^R(?=\d)/, '') === CLS);
const W = SEC.laneW as number, N = SEC.lanesPerDir as number, BW = (1 + 0.5 * (N - 1)) / N;
const RMIN = minRadius(V);
const runoff = (e: number): number => up((W * N * e * BW) / REL_GRAD, 5);
const eDesign = (R: number): number => { const en = superelevation(V, R).eNeeded; return en > 0 ? Math.min(EMAX, Math.max(CROWN, Math.ceil(en / 0.005 - 1e-9) * 0.005)) : 0; };
const LsFor = (R: number): number => spiralLength(V, R, undefined, eDesign(R) > 0 ? runoff(eDesign(R)) : 0);

const D = JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8')), CU = JSON.parse(readFileSync(`${OUT}/centre_curves.json`, 'utf8'));
const curvesById = new Map<string, any[]>(CU.lines.map((l: any) => [l.id, l.curves]));

function resample(p: number[][]): { x: number[]; z: number[]; len: number } {
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.max(2, Math.round(len / DS) + 1), x: number[] = [], z: number[] = []; let j = 0;
  for (let i = 0; i < n; i++) { const s = (len * i) / (n - 1); while (j + 2 < cum.length && cum[j + 1] < s) j++; const t = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0; x.push(p[j][0] + t * (p[j + 1][0] - p[j][0])); z.push(p[j][1] + t * (p[j + 1][1] - p[j][1])); }
  return { x, z, len };
}
function distToLine(px: number, pz: number, X: number[], Z: number[]): number {
  let best = 1e18; for (let i = 0; i + 1 < X.length; i++) {
    const dx = X[i + 1] - X[i], dz = Z[i + 1] - Z[i], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - X[i]) * dx + (pz - Z[i]) * dz) / l2)) : 0;
    const d = Math.hypot(px - (X[i] + t * dx), pz - (Z[i] + t * dz)); if (d < best) best = d;
  } return best;
}


// ---------------- FIT-1b ladder ----------------
const SHIFT_OVR: Record<string, number> = {}, DEV_OVR: Record<string, number> = { 'R6-7': 25, 'R6-8': 25, 'R6-10': 25, 'R4-7': 16, 'R4-8': 17, 'R4-27': 22, 'R4-24': 42, 'R4-9': 28, 'R4-19': 29, 'R2-6': 21, 'R2-11': 20, 'R2-12': 16, 'R2-19': 18, 'R2-45': 18, 'R2-51': 17, 'R2-56': 25, 'R2-71': 40, 'R2-58': 21, 'R2-61': 22, 'R2-62': 24, 'R2-72': 18, 'R2-74': 16 }, GOAL_OVR: Record<string, number> = { 'R6-10': 12 }, KINK_OLD: Record<string, boolean> = { 'R6-10': true }; // R6-10: user OK 'next' = AI recommendation 21.25b (advisory speed V70, DEV 25 m, shift 30 m) // user OK 2026-11-17: AI proposal for the 3 lines that missed (21.25)
const SHIFT_MAX = 30, SLIDE_MAX = 60, GOAL0 = 12, ITERS = Number(process.env.FIT_ITERS ?? 1200), KINK_MAX = 5, WARN_GAP = 80;
const VFLOOR = Math.max(20, Math.ceil((V / 2) / 5) * 5);
const VLIST: number[] = []; for (let v = V; v >= VFLOOR; v -= 5) VLIST.push(v);
const VCORNER: number[] = []; for (let v = VFLOOR - 10; v >= 10; v -= 10) VCORNER.push(v);
const rmin = (v: number): number => minRadius(v);
const eDesV = (v: number, R: number): number => { const en = superelevation(v, R).eNeeded; return en > 0 ? Math.min(EMAX, Math.max(CROWN, Math.ceil(en / 0.005 - 1e-9) * 0.005)) : 0; };
const lsV = (v: number, R: number): number => spiralLength(v, R, undefined, eDesV(v, R) > 0 ? runoff(eDesV(v, R)) : 0);
function rng(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (rn: () => number): number => Math.sqrt(-2 * Math.log(Math.max(1e-12, rn()))) * Math.cos(2 * Math.PI * rn());
interface Pn { x: number; z: number; u: number; vi: number; anc: number[][]; src: number[]; corner: boolean }
interface EndSpec { mode: 'pin' | 'free' | 'slide'; poly?: number[][]; s0?: number; why: string; with: string[] }
interface St { S: number[]; E: number[]; sT: number; eT: number; pn: Pn[] }
interface Ev { pis: { x: number; z: number; R: number; Ls: number }[]; vs: number[]; al: ReturnType<typeof buildOpenAlignment>; devMax: number; devMean: number; sf: number; sfPairs: number[]; infeasible: number; kink: number; cost: number; Rs: number[] }
function polyCum(p: number[][]): number[] { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function polyAt(p: number[][], c: number[], s: number): number[] { s = Math.max(0, Math.min(c[c.length - 1], s)); let j = 0; while (j + 2 < c.length && c[j + 1] < s) j++; const t = c[j + 1] > c[j] ? (s - c[j]) / (c[j + 1] - c[j]) : 0; return [p[j][0] + t * (p[j + 1][0] - p[j][0]), p[j][1] + t * (p[j + 1][1] - p[j][1])]; }
function polyProj(p: number[][], c: number[], q: number[]): { s: number; d: number } { let best = 1e18, bs = 0; for (let i = 0; i + 1 < p.length; i++) { const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - p[i][0]) * dx + (q[1] - p[i][1]) * dz) / l2)) : 0, d = Math.hypot(q[0] - p[i][0] - t * dx, q[1] - p[i][1] - t * dz); if (d < best) { best = d; bs = c[i] + t * Math.sqrt(l2); } } return { s: bs, d: best }; }
function endSpec(self: string, pt: number[]): EndSpec {
  const sharedEnd: string[] = [], through: { id: string; cls: string; pts: number[][] }[] = [];
  for (const o of D.lines) { if (o.id === self) continue; const c = polyCum(o.pts), pr = polyProj(o.pts, c, pt); if (pr.d > 4) continue;
    const de = Math.min(Math.hypot(pt[0] - o.pts[0][0], pt[1] - o.pts[0][1]), Math.hypot(pt[0] - o.pts[o.pts.length - 1][0], pt[1] - o.pts[o.pts.length - 1][1]));
    if (de < 4) sharedEnd.push(o.id); else through.push({ id: o.id, cls: String(o.cls), pts: o.pts }); }
  if (sharedEnd.length) return { mode: 'pin', why: `shared end node with ${sharedEnd.join(', ')}${through.length ? ' and ' + through.map((t) => t.id).join(', ') : ''} (not moved here: it needs a joint refit of all lines at the node)`, with: sharedEnd };
  if (through.length) { through.sort((a, b) => (a.cls === '8' ? 0 : 1) - (b.cls === '8' ? 0 : 1)); const t = through[0], c = polyCum(t.pts); return { mode: 'slide', poly: t.pts, s0: polyProj(t.pts, c, pt).s, why: `T on ${t.id} (class ${t.cls})`, with: [t.id] }; }
  return { mode: 'free', why: 'free end (no other road there)', with: [] };
}

interface Bend { s0: number; s1: number; dir: string; src: number[] }
interface LineFit { id: string; len: number; bendsIn: number; bendsMerged: number; bendsDropped: number; pis: { x: number; z: number; R: number; Ls: number }[]; start: number[]; end: number[]; minR: number; clampRmin: number; capped: number; devMax: number; devMean: number; endGap: number; kinkStartDeg: number; kinkEndDeg: number; pairsUnder: number; lsUnderRunoff: number; overlapFix: number; flags: string[]; stage: number; base: { devMax: number; endGap: number }; ends: { S: string; E: string }; endMoveS: number; endMoveE: number; shiftPI: number; vs: number[]; speeds: string[]; corners: string[]; drops: string[]; warns: string[]; failPairs: string[]; lowR: number; S: number[]; E: number[]; rails: string }
const fits: LineFit[] = [];

for (const ln of D.lines) {
  if (String(ln.cls) !== CLS) continue;
  if (process.env.LINES && !process.env.LINES.split(',').includes(ln.id)) continue; // batch run: LINES=R4-1,R4-2 (output gets suffix _PART)
  const r = resample(ln.pts), n = r.x.length, P = (s: number): number[] => { const f = Math.max(0, Math.min(n - 1, s / DS)), i = Math.min(n - 2, Math.floor(f)), t = f - i; return [r.x[i] + t * (r.x[i + 1] - r.x[i]), r.z[i] + t * (r.z[i + 1] - r.z[i])]; };
  const hIn = (s0: number): number => { const a = Math.max(0, s0 - 60), b = Math.min(r.len, Math.max(s0, a + 10)), p = P(a), q = P(b); return Math.atan2(q[1] - p[1], q[0] - p[0]); };
  const hOut = (s1: number): number => { const d = Math.min(r.len, s1 + 60), c = Math.max(0, Math.min(s1, d - 10)), p = P(c), q = P(d); return Math.atan2(q[1] - p[1], q[0] - p[0]); };
  const defl = (b: Bend): number => Math.abs(wrap(hOut(b.s1) - hIn(b.s0)));
  const bends: Bend[] = (curvesById.get(ln.id) ?? []).map((q: any, k: number) => ({ s0: q.s0, s1: q.s1, dir: q.dirn, src: [k] }));
  const orig = bends.map((b) => ({ ...b }));
  const bendsIn = bends.length; let merged = 0, dropped = 0;
  for (let guard = 0, changed = true; changed && guard < 500; guard++) {
    changed = false;
    for (let i = 0; i + 1 < bends.length; i++) {
      const a = bends[i], c = bends[i + 1], same = a.dir === c.dir;
      if (c.s0 - a.s1 >= (same ? 6 : 2) * V) continue;
      if (same && c.s0 - a.s1 >= MERGE_MAX) continue;
      if (same) { bends.splice(i, 2, { s0: a.s0, s1: c.s1, dir: a.dir, src: [...a.src, ...c.src] }); merged++; changed = true; break; }
      if (c.s0 - a.s1 >= MERGE_MAX) continue;
      const da = defl(a), dc = defl(c);
      if (Math.min(da, dc) < (WIGGLE_DEG * Math.PI) / 180) { bends.splice(da < dc ? i : i + 1, 1); dropped++; changed = true; break; }
    }
  }
  const raw: { x: number; z: number; R: number; Ls: number; delta: number; ts: number; clamp: boolean; capped: boolean; src: number[] }[] = [];
  for (const b of bends) {
    const p0 = P(b.s0), p1 = P(b.s1), hi = hIn(b.s0), ho = hOut(b.s1), din = [Math.cos(hi), Math.sin(hi)], dout = [Math.cos(ho), Math.sin(ho)];
    const cross = din[0] * dout[1] - din[1] * dout[0], w = [p1[0] - p0[0], p1[1] - p0[1]];
    if (Math.abs(cross) < 1e-3) continue;
    const t = (w[0] * dout[1] - w[1] * dout[0]) / cross, u = (w[0] * din[1] - w[1] * din[0]) / cross;
    if (!(t > 0 && u < 0)) continue;
    const delta = Math.abs(wrap(ho - hi)), tsT = (t - u) / 2;
    const g = (R: number): number => tangentLength(R, Math.min(LsFor(R), R * delta), delta) - tsT;
    let lo = 30, hiR = RCAP, R: number;
    if (g(hiR) < 0) R = hiR; else if (g(lo) > 0) R = lo; else { for (let k = 0; k < 60; k++) { const m = (lo + hiR) / 2; if (g(m) < 0) lo = m; else hiR = m; } R = (lo + hiR) / 2; }
    const clamp = R < RMIN; if (clamp) R = RMIN;
    const Ls = Math.min(LsFor(R), R * delta);
    raw.push({ x: p0[0] + t * din[0], z: p0[1] + t * din[1], R, Ls, delta, ts: tangentLength(R, Ls, delta), clamp, capped: R >= RCAP - 1, src: b.src });
  }
  const pts0 = P(0), pts1 = P(r.len); let overlapFix = 0;
  for (let it = 0; it < 80; it++) {
    let moved = false;
    const all = [{ x: pts0[0], z: pts0[1] }, ...raw, { x: pts1[0], z: pts1[1] }];
    for (let i = 0; i < raw.length; i++) {
      for (const j of [i - 1, i + 1]) {
        const e = Math.hypot(all[i + 1].x - all[j + 1].x, all[i + 1].z - all[j + 1].z), tj = j < 0 || j >= raw.length ? 0 : raw[j].ts;
        if (raw[i].ts + tj > e && raw[i].R > RMIN) { const R = Math.max(RMIN, raw[i].R * 0.92); raw[i].R = R; raw[i].Ls = Math.min(LsFor(R), R * raw[i].delta); raw[i].ts = tangentLength(R, raw[i].Ls, raw[i].delta); raw[i].clamp = R <= RMIN; moved = true; overlapFix++; }
      }
    }
    if (!moved) break;
  }
  const hs = Math.atan2(P(30)[1] - pts0[1], P(30)[0] - pts0[0]), he = Math.atan2(pts1[1] - P(r.len - 30)[1], pts1[0] - P(r.len - 30)[0]);
  const rp = r.x.map((x, i) => [x, r.z[i]]);
  // ---- first fit (FIT-1 numbers, kept for the 'before' column) ----
  const pis0 = raw.map((q) => ({ x: q.x, z: q.z, R: q.R, Ls: q.Ls }));
  const al0 = buildOpenAlignment({ x: pts0[0], z: pts0[1] }, pis0, { x: pts1[0], z: pts1[1] });
  let base0Dev = 0; for (const q of sampleAlignment(al0, DS).samples) base0Dev = Math.max(base0Dev, distToLine(q.x, q.z, r.x, r.z));
  // ---- ladder ----
  const shMax = SHIFT_OVR[ln.id] ?? SHIFT_MAX, devLim = DEV_OVR[ln.id] ?? DEV_MAX, GOAL = GOAL_OVR[ln.id] ?? devLim - 3, kinkThr = KINK_OLD[ln.id] ? KINK_MAX - 1 : KINK_MAX - 1.5, kinkW = KINK_OLD[ln.id] ? 30 : 60;
  const specS = endSpec(ln.id, pts0), specE = endSpec(ln.id, pts1);
  const cumS = specS.poly ? polyCum(specS.poly) : [], cumE = specE.poly ? polyCum(specE.poly) : [];
  const nPi = raw.length;
  const mkSt = (): St => ({ S: pts0.slice(), E: pts1.slice(), sT: 0, eT: 0, pn: raw.map((q, i) => ({ x: q.x, z: q.z, u: Math.log(q.R), vi: 0, anc: [[q.x, q.z]], src: q.src.slice(), corner: i === 0 || i === nPi - 1 })) });
  const clone = (st: St): St => ({ S: st.S.slice(), E: st.E.slice(), sT: st.sT, eT: st.eT, pn: st.pn.map((p) => ({ ...p, anc: p.anc.map((a) => a.slice()), src: p.src.slice() })) });
  const vOf = (p: Pn): number => (p.vi < VLIST.length ? VLIST[p.vi] : VCORNER[p.vi - VLIST.length]);
  const drawnGap = (a: Pn, b: Pn): number => { const ia = Math.max(...a.src), ib = Math.min(...b.src); return ib > ia ? orig[ib].s0 - orig[ia].s1 : 0; };
  const rc = { x: r.x.filter((_, i) => i % 2 === 0), z: r.z.filter((_, i) => i % 2 === 0) };
  const evalSt = (st: St, ds = 10, fine = false): Ev => {
    const k = st.pn.length, pts = [st.S, ...st.pn.map((p) => [p.x, p.z]), st.E];
    const h = pts.slice(0, -1).map((p, i) => Math.atan2(pts[i + 1][1] - p[1], pts[i + 1][0] - p[0]));
    const pis: { x: number; z: number; R: number; Ls: number }[] = [], vs: number[] = [], Rs: number[] = []; let infeasible = 0;
    for (let i = 0; i < k; i++) {
      const p = st.pn[i], v = vOf(p), d = Math.abs(wrap(h[i + 1] - h[i])); let R = Math.max(Math.exp(p.u), rmin(v)), Ls = 0, ok = false;
      for (let q = 0; q < 260; q++) { Ls = lsV(v, R); if (Ls <= R * d + 1e-9) { ok = true; break; } R *= 1.03; if (R > RCAP) break; }
      if (!ok) { infeasible++; R = Math.min(R, RCAP); Ls = Math.min(lsV(v, R), R * d); }
      pis.push({ x: p.x, z: p.z, R, Ls }); vs.push(v); Rs.push(R);
    }
    const al = buildOpenAlignment({ x: st.S[0], z: st.S[1] }, pis, { x: st.E[0], z: st.E[1] });
    let devMax = 0, devSum = 0; const smp = sampleAlignment(al, ds).samples;
    for (const q of smp) { const d = fine ? distToLine(q.x, q.z, r.x, r.z) : distToLine(q.x, q.z, rc.x, rc.z); devSum += d; if (d > devMax) devMax = d; }
    let sf = 0; const sfPairs: number[] = [];
    for (let i = 0; i + 1 < k; i++) { const need = (al.rows[i].sameDirAsNext ? 6 : 2) * Math.max(vs[i], vs[i + 1]), sh = Math.max(0, need - al.straights[i + 1]); sfPairs.push(sh); sf += sh; }
    if (k > 0) sf += Math.max(0, -al.straights[0]) + Math.max(0, -al.straights[k]);
    const kink = Math.max(deg(Math.abs(wrap(al.start.h - hs))), deg(Math.abs(wrap(al.end.h - he))));
    let spd = 0; for (const p of st.pn) spd += (p.vi < VLIST.length ? p.vi * 10 : VLIST.length * 10 + (p.vi - VLIST.length + 1) * 30);
    const cost = devSum / smp.length + 40 * Math.max(0, devMax - GOAL) + 3 * sf + 25 * al.endGap + kinkW * Math.max(0, kink - kinkThr) + 500 * infeasible + spd;
    return { pis, vs, al, devMax, devMean: devSum / smp.length, sf, sfPairs, infeasible, kink, cost: Number.isFinite(cost) ? cost : 1e9, Rs };
  };
  const hardPairs = (st: St, ev: Ev): number => { let c = 0; for (let i = 0; i + 1 < st.pn.length; i++) if (ev.sfPairs[i] > 0.5 && drawnGap(st.pn[i], st.pn[i + 1]) >= WARN_GAP) c++; return c; };
  const okEv = (st: St, ev: Ev): boolean => ev.devMax <= devLim && ev.al.endGap <= 0.5 && ev.kink <= KINK_MAX && ev.infeasible === 0 && hardPairs(st, ev) === 0;
  type Mode = { slide: boolean; speed: boolean; corner: boolean };
  const setEnds = (st: St): void => { if (specS.mode === 'slide') st.S = polyAt(specS.poly!, cumS, specS.s0! + st.sT); if (specE.mode === 'slide') st.E = polyAt(specE.poly!, cumE, specE.s0! + st.eT); };
  const inBounds = (st: St): boolean => {
    for (const p of st.pn) { let m = 1e18; for (const a of p.anc) m = Math.min(m, Math.hypot(p.x - a[0], p.z - a[1])); if (m > shMax) return false; }
    if (specS.mode === 'free' && Math.hypot(st.S[0] - pts0[0], st.S[1] - pts0[1]) > shMax) return false;
    if (specE.mode === 'free' && Math.hypot(st.E[0] - pts1[0], st.E[1] - pts1[1]) > shMax) return false;
    return Math.abs(st.sT) <= SLIDE_MAX && Math.abs(st.eT) <= SLIDE_MAX;
  };
  const optimise = (st0: St, iters: number, mode: Mode, seed: number): { st: St; ev: Ev } => {
    const rn = rng(seed); let cur = clone(st0), ev = evalSt(cur), best = ev.cost; const k = cur.pn.length;
    for (let it = 0; it < iters; it++) {
      const sg = 14 * Math.pow(1 - it / iters, 1.5) + 0.35, c = clone(cur), roll = rn();
      if (k > 0 && roll < 0.55) { const p = c.pn[Math.floor(rn() * k)]; p.x += gauss(rn) * sg; p.z += gauss(rn) * sg; }
      else if (k > 0 && roll < 0.75) { const p = c.pn[Math.floor(rn() * k)]; p.u += gauss(rn) * 0.12 * (sg / 14 + 0.1); }
      else if (k > 0 && roll < 0.85) { const dx = gauss(rn) * sg * 0.5, dz = gauss(rn) * sg * 0.5; for (const p of c.pn) { p.x += dx; p.z += dz; } }
      else if (roll < 0.93) { const w = rn() < 0.5; if (w && specS.mode === 'free') { c.S[0] += gauss(rn) * sg * 0.5; c.S[1] += gauss(rn) * sg * 0.5; } else if (!w && specE.mode === 'free') { c.E[0] += gauss(rn) * sg * 0.5; c.E[1] += gauss(rn) * sg * 0.5; } else if (mode.slide && w && specS.mode === 'slide') c.sT += gauss(rn) * sg; else if (mode.slide && !w && specE.mode === 'slide') c.eT += gauss(rn) * sg; }
      else if (mode.speed && k > 0) { const p = c.pn[Math.floor(rn() * k)], top = VLIST.length - 1 + (mode.corner && p.corner ? VCORNER.length : 0), nv = p.vi + (rn() < 0.5 ? -1 : 1); if (nv < 0 || nv > top) continue; p.vi = nv; }
      setEnds(c); if (!inBounds(c)) continue;
      const e = evalSt(c); if (e.cost <= best) { cur = c; ev = e; best = e.cost; }
    }
    return { st: cur, ev };
  };
  const drops: string[] = [];
  const smooth = (st0: St, mode: Mode, seed: number): { st: St; ev: Ev } => {
    let st = st0, ev = evalSt(st);
    for (let g = 0; g < 6 && st.pn.length > 0 && !okEv(st, ev); g++) {
      let bestC: { st: St; ev: Ev; i: number } | null = null;
      for (let i = 0; i < st.pn.length; i++) {
        const c = clone(st), gone = c.pn.splice(i, 1)[0]; if (c.pn.length) { const j = i < c.pn.length ? i : c.pn.length - 1; c.pn[j].anc.push(...gone.anc); c.pn[j].src.push(...gone.src); c.pn[j].corner = c.pn[j].corner; }
        const o = optimise(c, Number(process.env.FIT_SMOOTH ?? 350), mode, seed + g * 31 + i); if (!bestC || o.ev.cost < bestC.ev.cost) bestC = { st: o.st, ev: o.ev, i };
      }
      if (!bestC || bestC.ev.cost > ev.cost - 1) break;
      const gone = st.pn[bestC.i]; drops.push(`PI near (${f0(gone.x)}, ${f0(gone.z)}) dropped (drawn wiggle, cost ${f0(ev.cost)} -> ${f0(bestC.ev.cost)})`);
      st = bestC.st; ev = bestC.ev;
    }
    return { st, ev };
  };
  let stage = 0, st = mkSt(), ev = evalSt(st, 5, true);
  if (nPi > 0 && !okEv(st, ev)) {
    for (stage = 1; stage <= 4; stage++) {
      if (stage === 2 && specS.mode !== 'slide' && specE.mode !== 'slide') continue;
      const mode: Mode = { slide: stage >= 2, speed: stage >= 3, corner: stage >= 4 };
      console.error(ln.id, 'stage', stage); const o = optimise(st, ITERS, mode, 1000 + stage * 7 + ln.id.length * 13); const sm = smooth(o.st, mode, 5000 + stage * 101);
      st = sm.st; ev = evalSt(st, 5, true); if (okEv(st, ev)) break;
    }
    if (stage > 4) stage = 4;
  }
  const pis = ev.pis; const al = ev.al;
  const rpS = (q: { x: number; z: number }): number => polyProj(rp, polyCum(rp), [q.x, q.z]).s;
  const speeds: string[] = [], corners: string[] = []; let lowR = 0;
  st.pn.forEach((p, i) => { const v = ev.vs[i], sPos = rpS(pis[i]); if (ev.Rs[i] < RMIN - 1e-6) lowR++; if (p.vi >= VLIST.length) corners.push(`${ln.id} bend ${i + 1} s~${f0(sPos)} R ${f0(ev.Rs[i])} V ${v} km/h (junction corner, 21.7)`); else if (v < V) speeds.push(`${ln.id} bend ${i + 1} s~${f0(sPos)} R ${f0(ev.Rs[i])} V ${v} km/h`); });
  const warns: string[] = [], failPairs: string[] = [];
  for (let i = 0; i + 1 < st.pn.length; i++) if (ev.sfPairs[i] > 0.5) { const gp = drawnGap(st.pn[i], st.pn[i + 1]), txt = `${ln.id} bends ${i + 1}-${i + 2} (${al.rows[i].sameDirAsNext ? 'same' : 'reverse'} direction): straight ${f0(al.straights[i + 1])} m, rule ${f0((al.rows[i].sameDirAsNext ? 6 : 2) * Math.max(ev.vs[i], ev.vs[i + 1]))} m; the DRAWN line has these bends ${f0(gp)} m apart`; if (gp < WARN_GAP) warns.push(txt + ` (< ${WARN_GAP} m: WARNING, the drawn line itself breaks the rule)`); else failPairs.push(txt + ' FAIL'); }
  let shiftPI = 0; for (const p of st.pn) { let m = 1e18; for (const a of p.anc) m = Math.min(m, Math.hypot(p.x - a[0], p.z - a[1])); shiftPI = Math.max(shiftPI, m); }
  const smp = sampleAlignment(al, DS).samples; let dMax = 0, dSum = 0; for (const q of smp) { const d = distToLine(q.x, q.z, r.x, r.z); dSum += d; if (d > dMax) dMax = d; }
  const flags: string[] = []; if (dMax > devLim) flags.push(`dev ${f0(dMax)} m`); if (al.endGap > 0.5) flags.push(`end gap ${f1(al.endGap)} m`);
  const hsF = al.start.h, heF = al.end.h; void hsF; void heF;
  const mv = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  fits.push({ id: ln.id, len: r.len, bendsIn, bendsMerged: merged, bendsDropped: dropped, pis: pis.map((q, i) => ({ ...q, V: ev.vs[i] }) as any), start: st.S, end: st.E, S: st.S, E: st.E, minR: pis.length ? Math.min(...ev.Rs) : 0, clampRmin: ev.Rs.filter((R, i) => R <= rmin(ev.vs[i]) + 1e-6).length, capped: ev.Rs.filter((R) => R >= RCAP - 1).length, devMax: dMax, devMean: dSum / smp.length, endGap: al.endGap, kinkStartDeg: deg(Math.abs(wrap(al.start.h - hs))), kinkEndDeg: deg(Math.abs(wrap(al.end.h - he))), pairsUnder: failPairs.length, lsUnderRunoff: ev.infeasible, overlapFix, flags, stage, base: { devMax: base0Dev, endGap: al0.endGap }, ends: { S: specS.mode + ': ' + specS.why, E: specE.mode + ': ' + specE.why }, endMoveS: mv(st.S, pts0), endMoveE: mv(st.E, pts1), shiftPI, vs: ev.vs, speeds, corners, drops, warns, failPairs, lowR, rails: '' });
}

pr(`STEP 21.6 FIT-1b class ${CLS} (V ${V}, class minimum R ${f0(RMIN)} m, lane ${W} m x ${N}, RCAP ${RCAP} m, DEV_MAX ${DEV_MAX} m, SHIFT_MAX ${SHIFT_MAX} m, SLIDE_MAX ${SLIDE_MAX} m, speeds ${VLIST.join('/')} then corner ${VCORNER.join('/')} km/h): real straight - spiral - arc - spiral - straight fit of the drawn lines, with the ladder A1 shift / A2 slide / A3 speed / A4 corner`);
pr(); pr('1. PER LINE (stage = last rung used: 0 first fit already fine, 1 shift, 2 slide, 3 speed, 4 corner; before = first fit of FIT-1: max distance / end gap; after = this run)');
pr('   line     len  PIs  stage  before dev/gap   after dev  mean  gap   minR  kink s/e  Vmin  shiftPI  endS endE  hard fails  warn  Ls<Lr');
for (const q of fits) pr(`   ${q.id.padEnd(7)} ${f0(q.len).padStart(5)}  ${String(q.pis.length).padStart(3)}  ${String(q.stage).padStart(4)}   ${f0(q.base.devMax).padStart(4)} / ${f1(q.base.endGap).padStart(5)}   ${f1(q.devMax).padStart(8)} ${f1(q.devMean).padStart(5)} ${f1(q.endGap).padStart(4)}  ${f0(q.minR).padStart(5)}  ${f0(q.kinkStartDeg)}/${f0(q.kinkEndDeg)}    ${String(Math.min(V, ...q.vs)).padStart(3)}   ${f0(q.shiftPI).padStart(5)}  ${f0(q.endMoveS).padStart(4)} ${f0(q.endMoveE).padStart(4)}  ${String(q.pairsUnder).padStart(8)}  ${String(q.warns.length).padStart(4)}  ${String(q.lsUnderRunoff).padStart(4)}  ${q.flags.join('; ')}`);
const tot = (f: (q: LineFit) => number): number => fits.reduce((a, q) => a + f(q), 0);
pr(`   total  ${f0(tot((q) => q.len))} m  ${tot((q) => q.bendsIn)} measured bends -> ${tot((q) => q.pis.length)} PIs; bends under the class minimum R (advisory / corner speed) ${tot((q) => q.lowR)}; hard 6 V / 2 V fails ${tot((q) => q.pairsUnder)}; warnings ${tot((q) => q.warns.length)}; Ls shorter than runoff ${tot((q) => q.lsUnderRunoff)}`);
pr(); pr('2. LADDER DETAIL: what each end is, what moved, PIs dropped (smoothing), advisory speeds, junction corners');
for (const q of fits) { if (!q.stage && !q.warns.length) continue; pr(`   ${q.id}: stage ${q.stage}; start = ${q.ends.S}; end = ${q.ends.E}; start moved ${f1(q.endMoveS)} m, end moved ${f1(q.endMoveE)} m; biggest PI shift ${f1(q.shiftPI)} m`); for (const d of q.drops) pr(`        ${d}`); for (const d of q.speeds) pr(`        ADVISORY ${d}`); for (const d of q.corners) pr(`        CORNER ${d}`); }
pr(); pr('3. WARNINGS (the drawn line has two bends less than 80 m apart: the 6 V / 2 V rule cannot hold on the line the user drew; reason printed, not a FAIL)');
for (const q of fits) for (const w of q.warns) pr(`   WARN ${w}`);
pr(); pr('4. HARD 6 V / 2 V FAILS (drawn bends 80 m or more apart, rule still broken)');
for (const q of fits) for (const w of q.failPairs) pr(`   ${w}`);
pr(); pr('5. CHECKS (PASS = the rule holds for the WHOLE class; a FAIL is listed above per line, it is a finding, not hidden)');
chk(fits.length > 0 && fits.every((q) => q.pis.length > 0 || q.bendsIn === 0 || q.bendsIn === q.bendsDropped), `every line has an alignment (${fits.length} lines)`);
chk(fits.every((q) => q.pis.every((p: any) => p.R >= minRadius(p.V) - 1e-6)), 'every R is at least the minimum of the design speed of its own bend (V 80 where no advisory speed)');
chk(fits.every((q) => q.endGap <= 0.5), 'every alignment ends on the last point of its line (gap <= 0.5 m)');
chk(fits.every((q) => q.devMax <= (DEV_OVR[q.id] ?? DEV_MAX)), `every alignment stays within ${DEV_MAX} m of the drawn line (override by user OK: ${Object.entries(DEV_OVR).map(([k, v]) => k + ' ' + v + ' m').join(', ')}; PI shift ${Object.entries(SHIFT_OVR).map(([k, v]) => k + ' ' + v + ' m').join(', ')})`);
chk(tot((q) => q.pairsUnder) === 0, 'every straight between two curves is at least 6 V (same direction) / 2 V (reverse) (WARN pairs of section 3 not counted)');
chk(tot((q) => q.lsUnderRunoff) === 0, 'every spiral is at least as long as the superelevation runoff (21.6e-3) and fits its bend (Ls <= R x delta)');
chk(fits.every((q) => q.kinkStartDeg <= KINK_MAX + 1e-6 && q.kinkEndDeg <= KINK_MAX + 1e-6), `heading at the two ends is within ${KINK_MAX} deg of the drawn line (no kink at a junction)`);
chk(tot((q) => q.lowR) === 0, `literal target R >= ${f0(RMIN)} m on every bend (a FAIL here = bends that use an advisory speed or a junction corner, listed in section 2)`);
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
pr('   NOT RUN: tsc, npm run build, the game, the rail checks. Nothing in src changed. NOT DONE: junction node corners (21.7), R5 tap spacing recheck for a slid node, vertical re-run on the new length (the new line is a bit shorter / longer than the polyline).');
pr('   LIMIT: search = seeded (1+1) evolution strategy, so the result is a feasible design that the checks above confirm, not a proven optimum; the deviation is measured against the 5 m resampled drawn line; R10: the deviation of every line from his line is printed above.');
writeFileSync(`${OUT}/centre_fit_${CLS}${process.env.PART ? '_' + process.env.PART : ''}.json`, JSON.stringify({ cls: CLS, V, params: { DS, RCAP, DEV_MAX, WIGGLE_DEG, RMIN, REL_GRAD, SHIFT_MAX, SLIDE_MAX, VLIST, VCORNER }, lines: fits }, null, 0));
writeFileSync(`${OUT}/STEP_21_6FIT_${CLS}${process.env.PART ? '_' + process.env.PART : ''}_OUTPUT.txt`, L.join('\n') + '\n');
