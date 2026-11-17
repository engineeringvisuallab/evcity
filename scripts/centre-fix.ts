// STEP 21.3 LINE FIXES + HORIZONTAL ALIGNMENT (headless; changes NO game file, only writes docs/).
// Run: npx tsx scripts/centre-fix.ts [dir]   (default docs)  writes dir/STEP_21_3_OUTPUT.txt, dir/centre_fixed.json
// User rules (HANDOFF 21.7): lines roughly FIXED (R10), only SMALL shifts where an analysis finds a fault; hills: go ROUND along the hillside, no tunnel (R12);
// buildings / engineering sites are relocated later (ignored here); 1600 m tap rule kept (R5): no R2 / C / L road joins an 8-lane road directly.
// Order: (1) JOIN proposals of 21.1 (end <= 60 m from a road moves onto it), (2) R5: R2 / C / L end on an 8-lane road is trimmed back to a bigger road,
// (3) HILL shift: dynamic programme on 10 m stations, offsets +-25 m (tier 1) then +-60 m (tier 2), cost = grade over the class limit + water + rail + distance to other roads + bends,
// (4) RADIUS: local Gaussian-like smoothing of the polyline until radius >= class minimum (curvature limited polyline; the clothoid pieces come at build time, 21.6),
// (5) R1 test against every other line, a line that makes a NEW crossing is put back.
// Natural ground only. World metres: x east, z south.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { collectCentreSet } from '../src/roads/debug/RoadCentreSet';
import { minRadius } from '../src/interchange/Standards';

const OUT = process.argv[2] ?? 'docs';
const STEP = 10, OFFSTEP = 5, K1 = 5, K2 = 12, SMCAP = 35, SNAP = 60, TRIMMAX = 250, TARGETD = 70;
const hyp = Math.hypot;
const L: string[] = [];
const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const RANK: Record<string, number> = { '8': 5, '6': 4, '4': 3, '2': 2, C: 1, L: 0 };
const LIMIT: Record<string, number> = { '6': 0.04, '4': 0.06, '2': 0.08, C: 0.08, L: 0.10 };
const VDES: Record<string, number> = { '6': 80, '4': 60, '2': 40, C: 40, L: 30 }; // MY numbers (design speed per class)
const RREQ: Record<string, number> = {}; for (const k of Object.keys(VDES)) RREQ[k] = minRadius(VDES[k]);

const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const natH = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const wetAt = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water - sc.h : 0; };
const railEdges: { id: any; xs: ArrayLike<number>; zs: ArrayLike<number> }[] = (gen.rail.edges as any[]).map((e, i) => ({ id: e.id ?? i, xs: e.xs, zs: e.zs }));

type V2 = [number, number];
interface Ln { id: string; cls: string; built: boolean; pts: V2[]; orig: V2[]; notes: string[]; pin?: boolean[]; }
const set = collectCentreSet(gen);
const lines: Ln[] = set.lines.map((l) => ({ id: l.id, cls: l.cls, built: l.source === 'built', pts: l.pts.map((p) => [p[0], p[1]] as V2), orig: l.pts.map((p) => [p[0], p[1]] as V2), notes: [] }));
const rk = (l: Ln): number => RANK[l.cls] ?? 0;
const work = lines.filter((l) => !l.built);

// ---------- geometry helpers ----------
function proj(pts: V2[], x: number, z: number): { d: number; x: number; z: number; i: number; t: number; dx: number; dz: number } {
  let best = { d: 1e18, x: 0, z: 0, i: 0, t: 0, dx: 1, dz: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
    const px = ax + bx * t, pz = az + bz * t, d = hyp(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, i, t, dx: bx, dz: bz };
  }
  return best;
}
function segInt(a: V2, b: V2, c: V2, d: V2): V2 | null {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : [a[0] + rx * t, a[1] + rz * t];
}
const plen = (p: V2[]): number => { let s = 0; for (let i = 0; i + 1 < p.length; i++) s += hyp(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return s; };
/** resample at exactly STEP m (last station = end point) */
function resample(p: V2[], step = STEP): { P: V2[]; s: number[] } {
  const total = plen(p), n = Math.max(2, Math.round(total / step) + 1), P: V2[] = [], s: number[] = [];
  let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg + 1 < p.length - 1 && acc + hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) < target) { acc += hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]); seg++; }
    const sl = hyp(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) || 1, t = Math.max(0, Math.min(1, (target - acc) / sl));
    P.push([p[seg][0] + (p[seg + 1][0] - p[seg][0]) * t, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * t]); s.push(target);
  }
  return { P, s };
}
/** smallest radius (Menger, points 2 stations = 20 m apart) */
function minRad(P: V2[]): { r: number; at: V2 } {
  let best = 9999, at: V2 = P[0];
  for (let i = 2; i + 2 < P.length; i++) {
    const a = P[i - 2], b = P[i], c = P[i + 2];
    const ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]);
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const r = cross < 1e-6 ? 9999 : (ab * bc * ca) / (2 * cross);
    if (r < best) { best = r; at = b; }
  }
  return { r: best, at };
}
/** distance of a polyline to another (max over the stations of A of the distance to B) */
const maxDev = (A: V2[], B: V2[]): { d: number; at: V2 } => { let m = 0, at: V2 = A[0]; for (const p of A) { const q = proj(B, p[0], p[1]); if (q.d > m) { m = q.d; at = p; } } return { d: m, at }; };

// ---------- ground metrics (same definitions as step 21.2) ----------
interface Met { len: number; overM: number; tunM: number; wetM: number; maxGrade: number; railX: number; rmin: number; rminAt: V2 }
function railCross(p: V2[]): number {
  let n = 0; const seen: V2[] = [];
  for (let i = 0; i + 1 < p.length; i++) for (const e of railEdges) for (let k = 0; k + 1 < e.xs.length; k++) {
    if (Math.abs(e.xs[k] - p[i][0]) > 400 && Math.abs(e.xs[k] - p[i + 1][0]) > 400) continue;
    const q = segInt(p[i], p[i + 1], [e.xs[k], e.zs[k]], [e.xs[k + 1], e.zs[k + 1]]);
    if (q && !seen.some((c) => hyp(c[0] - q[0], c[1] - q[1]) < 30)) { seen.push(q); n++; }
  }
  return n;
}
function metrics(p: V2[], cls: string): Met {
  const { P, s } = resample(p), lim = LIMIT[cls] ?? 0.1;
  const H = P.map((q) => natH(q[0], q[1]));
  let over = 0, tun = 0, wet = 0, mg = 0;
  for (let i = 0; i < P.length; i++) {
    const a = Math.max(0, i - 3), d = s[i] - s[a], g = d > 0 ? Math.abs(H[i] - H[a]) / d : 0;
    if (g > lim) over++; if (g > 2 * lim) tun++; if (g > mg) mg = g;
    if (wetAt(P[i][0], P[i][1]) > 0) wet++;
  }
  const mr = minRad(P);
  return { len: plen(p), overM: over * STEP, tunM: tun * STEP, wetM: wet * STEP, maxGrade: mg, railX: railCross(p), rmin: mr.r, rminAt: mr.at };
}

// ---------- R1 test ----------
interface X { a: string; b: string; at: V2 }
function crossingsOf(l: Ln, others: Ln[]): X[] {
  const out: X[] = [];
  for (const o of others) {
    if (o === l) continue;
    for (let p = 0; p + 1 < l.pts.length; p++) for (let q = 0; q + 1 < o.pts.length; q++) {
      const hit = segInt(l.pts[p], l.pts[p + 1], o.pts[q], o.pts[q + 1]);
      if (!hit) continue;
      const ea = Math.min(hyp(hit[0] - l.pts[0][0], hit[1] - l.pts[0][1]), hyp(hit[0] - l.pts[l.pts.length - 1][0], hit[1] - l.pts[l.pts.length - 1][1]));
      const eb = Math.min(hyp(hit[0] - o.pts[0][0], hit[1] - o.pts[0][1]), hyp(hit[0] - o.pts[o.pts.length - 1][0], hit[1] - o.pts[o.pts.length - 1][1]));
      if (ea <= 3 || eb <= 3) continue; // end touch = junction
      if (!out.some((c) => c.b === o.id && hyp(c.at[0] - hit[0], c.at[1] - hit[1]) < 2)) out.push({ a: l.id, b: o.id, at: hit });
    }
  }
  return out;
}
const baseX = new Map<string, X[]>();
for (const l of work) baseX.set(l.id, crossingsOf(l, lines));
const newCross = (l: Ln): X[] => crossingsOf(l, lines).filter((c) => !(baseX.get(l.id) ?? []).some((b) => b.b === c.b && hyp(b.at[0] - c.at[0], b.at[1] - c.at[1]) < 40));

pr('STEP 21.3 LINE FIXES + HORIZONTAL ALIGNMENT (headless; nothing in src or data changed, results go to docs/centre_fixed.json)');
pr(`${work.length} lines worked on, ${lines.length - work.length} built roads fixed (R12). Natural ground only (finished-profile grades come in 21.4).`);
pr(`Limits (3.3, R11): grade R6 4 % / R4 6 % / R2 8 % / C 8 % / L 10 %. Design speed per class (MY numbers, say if you disagree) -> minimum radius: ` + Object.keys(VDES).map((k) => `${k === '6' ? 'R6' : k === '4' ? 'R4' : k === '2' ? 'R2' : k} V${VDES[k]} -> ${f0(RREQ[k])} m`).join(', '));
pr(`Hill shift tier 1 +-${K1 * OFFSTEP} m, tier 2 +-${K2 * OFFSTEP} m; smoothing cap ${SMCAP} m; join proposals up to ${SNAP} m; R5 trim at most ${TRIMMAX} m.`);

const before = new Map<string, Met>();
for (const l of work) before.set(l.id, metrics(l.pts, l.cls));

// ---------- 1. JOIN proposals ----------
pr('');
pr('1. JOINS (21.1 proposals: an end 5..60 m from a road moves onto it; skipped: target smaller road, or shallow angle under 30 deg = reshape case for the user)');
let nJoin = 0;
for (const l of work) for (const which of ['start', 'end'] as const) {
  const e = which === 'start' ? l.pts[0] : l.pts[l.pts.length - 1], nb = which === 'start' ? l.pts[1] : l.pts[l.pts.length - 2];
  let best: { o: Ln; q: ReturnType<typeof proj> } | null = null;
  for (const o of lines) { if (o === l) continue; const q = proj(o.pts, e[0], e[1]); if (!best || q.d < best.q.d) best = { o, q }; }
  if (!best || best.q.d <= 5 || best.q.d > SNAP) continue;
  const ux = e[0] - nb[0], uz = e[1] - nb[1], ul = hyp(ux, uz) || 1, tl = hyp(best.q.dx, best.q.dz) || 1;
  const ang = (Math.acos(Math.min(1, Math.abs(ux * best.q.dx + uz * best.q.dz) / (ul * tl))) * 180) / Math.PI;
  const why = rk(best.o) < rk(l) ? 'target is a SMALLER road' : best.o.cls === '8' && rk(l) <= 2 ? 'R5: a R2 / C / L road does not join an 8-lane road directly' : ang < 30 ? `shallow angle ${f0(ang)} deg` : '';
  if (why) { pr(`   ${l.id.padEnd(7)} ${which.padEnd(5)} -> ${best.o.id.padEnd(7)} ${f0(best.q.d)} m  NOT applied: ${why}`); continue; }
  const keep = l.pts.map((p) => [p[0], p[1]] as V2);
  if (which === 'start') l.pts[0] = [best.q.x, best.q.z]; else l.pts[l.pts.length - 1] = [best.q.x, best.q.z];
  if (newCross(l).length) { l.pts = keep; pr(`   ${l.id.padEnd(7)} ${which.padEnd(5)} -> ${best.o.id.padEnd(7)} ${f0(best.q.d)} m  NOT applied: would cross a road (R1)`); continue; }
  nJoin++; l.notes.push(`JOIN ${which} -> ${best.o.id} (${f0(best.q.d)} m)`);
  pr(`   ${l.id.padEnd(7)} ${which.padEnd(5)} -> ${best.o.id.padEnd(7)} ${f0(best.q.d)} m, angle ${f0(ang)} deg  APPLIED`);
}
pr(`   ${nJoin} joins applied`);

// ---------- 2. R5: R2 / C / L end on an 8-lane road ----------
pr('');
pr('2. R5: a R2 / C / L line must not end on an 8-lane road. The end is trimmed back (<= ' + TRIMMAX + ' m) to the first point within ' + TARGETD + ' m of a bigger non-8-lane road (R2 -> R4 / R6; C / L -> R2 / R4 / R6) and the last point moves onto that road. Not possible = listed, nothing changed.');
const eight = lines.filter((l) => l.cls === '8');
let nTrim = 0, nR5Open = 0, nDead = 0;
const r5Open: string[] = [];
for (const l of work) {
  if (l.cls === '6' || l.cls === '4') continue;
  for (const which of ['start', 'end'] as const) {
    const e = which === 'start' ? l.pts[0] : l.pts[l.pts.length - 1];
    let on8: { o: Ln; q: ReturnType<typeof proj> } | null = null;
    for (const o of eight) { const q = proj(o.pts, e[0], e[1]); if (!on8 || q.d < on8.q.d) on8 = { o, q }; }
    if (!on8 || on8.q.d > 25) continue;
    const minRank = l.cls === '2' ? RANK['4'] : RANK['2'];
    const targets = lines.filter((o) => o !== l && o.cls !== '8' && rk(o) >= minRank);
    const path = which === 'start' ? l.pts : [...l.pts].reverse();      // path[0] = the 8-lane end
    let acc = 0, chosen = -1, tq: ReturnType<typeof proj> | null = null, tgt: Ln | null = null;
    let needTrim = -1, needTgt = '-';
    for (let i = 0; i + 1 < path.length; i++) {
      let d8 = 1e18; for (const o of eight) d8 = Math.min(d8, proj(o.pts, path[i][0], path[i][1]).d);
      if (d8 >= 60) {
        let bq: ReturnType<typeof proj> | null = null, bo: Ln | null = null;
        for (const o of targets) { const q = proj(o.pts, path[i][0], path[i][1]); if (q.d <= TARGETD && (!bq || q.d < bq.d)) { bq = q; bo = o; } }
        if (bq && bo) { if (needTrim < 0) { needTrim = acc; needTgt = bo.id; } if (acc <= TRIMMAX && !tq) { tq = bq; tgt = bo; chosen = i; } }
      }
      if (tq) break;
      acc += hyp(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    const label = `${l.id.padEnd(7)} ${which.padEnd(5)} at (${f0(e[0])}, ${f0(e[1])}) on ${on8.o.id}`;
    if (chosen < 0 || !tq || !tgt) {
      let nearD = 1e18, nearId = '-'; for (const o of targets) { const q = proj(o.pts, e[0], e[1]); if (q.d < nearD) { nearD = q.d; nearId = o.id; } }
      nR5Open++;
      const s = `${label}: OPEN. Nearest ${l.cls === '2' ? 'R4 / R6' : 'R2 / R4 / R6'} road ${nearId} is ${f0(nearD)} m from the end; ` + (needTrim >= 0 ? `trimming ${f0(needTrim)} m (of ${f0(plen(l.pts))} m) would reach ${needTgt}` : nearD < 5 ? `the end sits on a node shared with ${nearId}, but the line leaves that node away from it (no point 60 m or more from the 8-lane road is within ${TARGETD} m of a bigger road)` : `no point of the line that is 60 m or more from the 8-lane road comes within ${TARGETD} m of one`);
      // STEP 21.3b decision: no connector is invented. The end is cut back along the line to the first point 70 m or more from the 8-lane road = dead end (R5 kept).
      { let cutPt: number[] | null = null, segI = -1;
        outer: for (let i = 0; i + 1 < path.length; i++) { const sl = hyp(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); const ns = Math.max(1, Math.ceil(sl / 5));
          for (let q = 0; q <= ns; q++) { const f = q / ns; const x = path[i][0] + f * (path[i + 1][0] - path[i][0]), z = path[i][1] + f * (path[i + 1][1] - path[i][1]); let d8 = 1e18; for (const o of eight) d8 = Math.min(d8, proj(o.pts, x, z).d); if (d8 >= 70) { cutPt = [x, z]; segI = i + 1; break outer; } } }
        if (cutPt) { const rest2: number[][] = [cutPt, ...path.slice(segI)]; const np = which === 'start' ? rest2 : [...rest2].reverse(); const keep2 = l.pts; l.pts = np;
          if (plen(np) >= 60 && !newCross(l).length) { nDead++; nR5Open--; l.notes.push(`R5 ${which} dead end: cut ${f0(plen(keep2) - plen(np))} m, now 70 m or more from ${on8.o.id}`); pr(`   ${label}: DEAD END, cut ${f0(plen(keep2) - plen(np))} m (nearest bigger road ${nearId} ${f0(nearD)} m away)  APPLIED`); continue; }
          l.pts = keep2; } }
      r5Open.push(s); pr('   ' + s); continue;
    }
    const rest = path.slice(chosen); rest[0] = [tq.x, tq.z];
    const newPts = which === 'start' ? rest : [...rest].reverse();
    if (plen(newPts) < 60) { nR5Open++; const s = `${label}: remaining line under 60 m after the trim: OPEN`; r5Open.push(s); pr('   ' + s); continue; }
    const keep = l.pts; l.pts = newPts;
    if (newCross(l).length) { l.pts = keep; nR5Open++; const s = `${label}: trim to ${tgt.id} would cross a road (R1): OPEN`; r5Open.push(s); pr('   ' + s); continue; }
    nTrim++; l.notes.push(`R5 ${which} trimmed ${f0(plen(keep) - plen(newPts))} m, now ends on ${tgt.id}`);
    pr(`   ${label}: trimmed ${f0(plen(keep) - plen(newPts))} m, last point moved ${f0(tq.d)} m onto ${tgt.id}  APPLIED`);
  }
}
pr(`   ${nTrim} ends trimmed onto a bigger road, ${nDead} cut back to a dead end (70 m short of the 8-lane road), ${nR5Open} still OPEN`);

// ---------- 3. HILL shift (dynamic programme) ----------
const allSamples = new Map<string, V2[]>();
for (const l of lines) allSamples.set(l.id, resample(l.pts, 20).P);
const gridSize = 30, grid = new Map<string, { id: string; x: number; z: number }[]>();
const gk = (x: number, z: number): string => `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
for (const [id, P] of allSamples) for (const p of P) { const k = gk(p[0], p[1]); (grid.get(k) ?? grid.set(k, []).get(k)!).push({ id, x: p[0], z: p[1] }); }
const nearOther = (x: number, z: number, self: string, r: number): boolean => {
  const cx = Math.floor(x / gridSize), cz = Math.floor(z / gridSize);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of grid.get(`${cx + i},${cz + j}`) ?? []) if (q.id !== self && hyp(q.x - x, q.z - z) < r) return true;
  return false;
};
const railPts: { x: number; z: number }[] = [];
for (const e of railEdges) for (let k = 0; k + 1 < e.xs.length; k++) { const d = hyp(e.xs[k + 1] - e.xs[k], e.zs[k + 1] - e.zs[k]), m = Math.max(1, Math.ceil(d / 10)); for (let j = 0; j < m; j++) railPts.push({ x: e.xs[k] + ((e.xs[k + 1] - e.xs[k]) * j) / m, z: e.zs[k] + ((e.zs[k + 1] - e.zs[k]) * j) / m }); }
const rgrid = new Map<string, { x: number; z: number }[]>();
for (const p of railPts) { const k = gk(p.x, p.z); (rgrid.get(k) ?? rgrid.set(k, []).get(k)!).push(p); }
const nearRail = (x: number, z: number, r: number): boolean => { const cx = Math.floor(x / gridSize), cz = Math.floor(z / gridSize); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of rgrid.get(`${cx + i},${cz + j}`) ?? []) if (hyp(q.x - x, q.z - z) < r) return true; return false; };

function pinsFor(l: Ln, P: V2[]): boolean[] {
  const pin = P.map(() => false); pin[0] = pin[P.length - 1] = true;
  for (const o of lines) {
    if (o === l) continue;
    for (const e of [o.pts[0], o.pts[o.pts.length - 1]]) { const q = proj(P, e[0], e[1]); if (q.d <= 8) { const i = Math.round(q.i + q.t); for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < P.length) pin[k] = true; } }
  }
  for (const c of baseX.get(l.id) ?? []) { const q = proj(P, c.at[0], c.at[1]); const i = Math.round(q.i + q.t); for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < P.length) pin[k] = true; }
  return pin;
}
function hillDP(l: Ln, K: number): V2[] {
  const { P } = resample(l.pts), n = P.length, lim = LIMIT[l.cls] ?? 0.1, nk = 2 * K + 1;
  const pin = pinsFor(l, P);
  const nrm: V2[] = P.map((_, i) => { const a = P[Math.max(0, i - 2)], b = P[Math.min(n - 1, i + 2)], dx = b[0] - a[0], dz = b[1] - a[1], d = hyp(dx, dz) || 1; return [-dz / d, dx / d]; });
  const pos = (i: number, k: number): V2 => [P[i][0] + nrm[i][0] * (k - K) * OFFSTEP, P[i][1] + nrm[i][1] * (k - K) * OFFSTEP];
  const H: number[][] = [], St: number[][] = [];
  const nearPin = P.map((_, i) => { for (let d = -5; d <= 5; d++) if (pin[i + d] && i + d >= 0 && i + d < n) return true; return false; });
  for (let i = 0; i < n; i++) {
    H.push([]); St.push([]);
    for (let k = 0; k < nk; k++) {
      const q = pos(i, k);
      if (pin[i] && k !== K) { H[i].push(0); St[i].push(1e9); continue; }
      H[i].push(natH(q[0], q[1]));
      let c = 0.04 * Math.abs(k - K) * OFFSTEP;
      if (k !== K) {
        if (wetAt(q[0], q[1]) > 0) c += 600;
        if (!nearPin[i] && nearOther(q[0], q[1], l.id, 18)) c += 150;
        if (nearRail(q[0], q[1], 25)) c += 250;
      }
      St[i].push(c);
    }
  }
  const INF = 1e18;
  const cost: Float64Array[][] = [], from: Int16Array[][] = [];
  for (let i = 0; i < n; i++) { cost.push([]); from.push([]); for (let k = 0; k < nk; k++) { cost[i].push(new Float64Array(3).fill(INF)); from[i].push(new Int16Array(3)); } }
  cost[0][K][1] = St[0][K];
  for (let i = 1; i < n; i++) for (let k = 0; k < nk; k++) {
    if (St[i][k] >= 1e9) continue;
    for (let d = -1; d <= 1; d++) {
      const kp = k - d; if (kp < 0 || kp >= nk) continue;
      const dist = hyp(pos(i, k)[0] - pos(i - 1, kp)[0], pos(i, k)[1] - pos(i - 1, kp)[1]) || 1;
      const g = Math.abs(H[i][k] - H[i - 1][kp]) / dist, ex = Math.max(0, g - lim) / 0.01;
      const gc = STEP * 0.5 * ex * ex;                       // per 10 m: squared excess in percent points
      for (let dp = -1; dp <= 1; dp++) {
        const prev = cost[i - 1][kp][dp + 1]; if (prev >= INF) continue;
        const c = prev + St[i][k] + gc + 0.5 * Math.abs(d) + 3 * Math.abs(d - dp);
        if (c < cost[i][k][d + 1]) { cost[i][k][d + 1] = c; from[i][k][d + 1] = dp; }
      }
    }
  }
  let bk = K, bd = 1, bc = INF;
  for (let d = 0; d < 3; d++) if (cost[n - 1][K][d] < bc) { bc = cost[n - 1][K][d]; bd = d; }
  const ks: number[] = new Array(n); let k = bk, d = bd - 1;
  for (let i = n - 1; i >= 0; i--) { ks[i] = k; const dp = from[i][k][d + 1]; k = k - d; d = dp; }
  return P.map((_, i) => pos(i, ks[i]));
}

// ---------- 4. smoothing for the radius ----------
function smooth(p: V2[], cls: string, cap: number): V2[] {
  const { P } = resample(p), n = P.length, req = RREQ[cls] ?? 20, pin = pinsFor({ id: '', cls, built: false, pts: p, orig: p, notes: [] } as Ln, P);
  let Q: V2[] = P.map((q) => [q[0], q[1]] as V2);
  for (let it = 0; it < 400; it++) {
    const bad = new Set<number>();
    for (let i = 2; i + 2 < n; i++) {
      const a = Q[i - 2], b = Q[i], c = Q[i + 2], ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]);
      const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])), r = cr < 1e-6 ? 9999 : (ab * bc * ca) / (2 * cr);
      if (r < req) for (let k = i - 3; k <= i + 3; k++) bad.add(k);
    }
    if (!bad.size) break;
    const R: V2[] = Q.map((q) => [q[0], q[1]] as V2);
    for (const i of bad) {
      if (i < 1 || i >= n - 1 || pin[i]) continue;
      const lo = Math.max(0, i - 3), hi = Math.min(n - 1, i + 3); let sx = 0, sz = 0, c = 0;
      for (let k = lo; k <= hi; k++) { const w = 1 / (1 + Math.abs(k - i)); sx += Q[k][0] * w; sz += Q[k][1] * w; c += w; }
      R[i] = [Q[i][0] + 0.5 * (sx / c - Q[i][0]), Q[i][1] + 0.5 * (sz / c - Q[i][1])];
    }
    let worst = 0; for (let i = 0; i < n; i++) worst = Math.max(worst, hyp(R[i][0] - P[i][0], R[i][1] - P[i][1]));
    if (worst > cap) break;
    Q = R;
  }
  return Q;
}

pr('');
pr('3. HILL SHIFT + 4. RADIUS: per line, tier 1 then tier 2; a result is kept only if it lowers the over-limit grade metres by >= 15 %, adds no water and no rail crossing, makes no NEW crossing (R1)');
interface Shift { id: string; from: number; to: number; x: number; z: number; m: number }
const shifts: Shift[] = [];
const stat = { hill: 0, hillT1: 0, hillT2: 0, hillNo: 0, smooth: 0, smoothFail: 0 };
const tierOf = new Map<string, string>();
for (const l of work) {
  const b = before.get(l.id)!;
  const startPts = l.pts.map((p) => [p[0], p[1]] as V2);
  let accepted = false;
  if (b.overM >= 60) {
    for (const tier of [1, 2]) {
      const dp = hillDP(l, tier === 1 ? K1 : K2), sm = smooth(dp, l.cls, SMCAP);
      const cand: Ln = { ...l, pts: sm };
      const m = metrics(sm, l.cls);
      if (m.overM <= b.overM * 0.85 && m.wetM <= b.wetM && m.railX <= b.railX) {
        const keep = l.pts; l.pts = sm; const nc = newCross(l);
        if (nc.length) { l.pts = keep; continue; }
        void cand; accepted = true; stat.hill++; if (tier === 1) stat.hillT1++; else stat.hillT2++; tierOf.set(l.id, `tier ${tier}`);
        l.notes.push(`HILL tier ${tier}: over-limit ${f0(b.overM)} -> ${f0(m.overM)} m, tunnel-cand ${f0(b.tunM)} -> ${f0(m.tunM)} m`);
        break;
      }
    }
    if (!accepted) stat.hillNo++;
  }
  if (!accepted) {
    const rm = metrics(l.pts, l.cls);
    if (rm.rmin < (RREQ[l.cls] ?? 20)) {
      const sm = smooth(l.pts, l.cls, SMCAP), m = metrics(sm, l.cls);
      if (m.overM <= b.overM + Math.max(10, 0.05 * b.overM) && m.wetM <= b.wetM && m.railX <= b.railX) {
        const keep = l.pts; l.pts = sm; if (newCross(l).length) { l.pts = keep; stat.smoothFail++; } else { stat.smooth++; l.notes.push(`SMOOTH min radius ${f0(rm.rmin)} -> ${f0(m.rmin)} m`); }
      } else stat.smoothFail++;
    }
  }
  // shift list: runs of >= 5 m distance to the line before step 3 / 4
  const { P, s } = resample(l.pts);
  let a = -1, mx = 0;
  const flush = (i: number): void => { if (a >= 0 && s[i - 1] - s[a] >= 20) shifts.push({ id: l.id, from: s[a], to: s[i - 1], x: P[(a + i - 1) >> 1][0], z: P[(a + i - 1) >> 1][1], m: mx }); a = -1; mx = 0; };
  for (let i = 0; i <= P.length; i++) {
    const d = i < P.length ? proj(startPts, P[i][0], P[i][1]).d : 0;
    if (i < P.length && d >= 5) { if (a < 0) a = i; mx = Math.max(mx, d); } else flush(i);
  }
}
void stat;
const after = new Map<string, Met>();
for (const l of work) after.set(l.id, metrics(l.pts, l.cls));

pr(`   hill lines kept: ${stat.hill} (tier 1 ${stat.hillT1}, tier 2 ${stat.hillT2}); hill lines with over-limit >= 60 m where no shift helped: ${stat.hillNo}; radius-only smoothing applied ${stat.smooth}, failed / not allowed ${stat.smoothFail}`);

// ---------- results ----------
pr('');
pr('5. PER LINE (before -> after): length, metres over the grade limit, tunnel-candidate metres, wet, rail crossings, min radius (class minimum in brackets), max shift from the user line');
let totOverB = 0, totOverA = 0, totTunB = 0, totTunA = 0, radFail = 0, radFailB = 0, maxShiftAll = 0, maxShiftId = '';
const dev = new Map<string, number>();
for (const l of work) {
  const b = before.get(l.id)!, a = after.get(l.id)!, dv = maxDev(resample(l.pts).P, l.orig).d, dv2 = maxDev(resample(l.orig).P, l.pts).d, d = Math.max(dv, dv2);
  dev.set(l.id, d);
  totOverB += b.overM; totOverA += a.overM; totTunB += b.tunM; totTunA += a.tunM;
  const req = RREQ[l.cls] ?? 20; if (a.rmin < req) radFail++; if (b.rmin < req) radFailB++;
  if (d > maxShiftAll) { maxShiftAll = d; maxShiftId = l.id; }
  pr(`   ${l.id.padEnd(7)} ${(l.cls === '6' || l.cls === '4' || l.cls === '2' ? 'R' + l.cls : l.cls).padEnd(3)} len ${f0(b.len).padStart(5)} -> ${f0(a.len).padStart(5)}  over ${f0(b.overM).padStart(4)} -> ${f0(a.overM).padStart(4)} m  tun ${f0(b.tunM).padStart(4)} -> ${f0(a.tunM).padStart(4)}  wet ${f0(b.wetM).padStart(3)} -> ${f0(a.wetM).padStart(3)}  rail ${b.railX}->${a.railX}  Rmin ${f0(Math.min(b.rmin, 9999)).padStart(4)} -> ${f0(Math.min(a.rmin, 9999)).padStart(4)} (${f0(req)})  max shift ${f0(d).padStart(3)} m${l.notes.length ? '   | ' + l.notes.join('; ') : ''}`);
}

pr('');
pr('6. EVERY SHIFT of 5 m or more (road, place along the line, where, metres; the shift is measured to the line the user drew, joins / trims are in sections 1 and 2)');
for (const s of shifts.sort((a, b) => b.m - a.m)) pr(`   ${s.id.padEnd(7)} s ${f0(s.from).padStart(5)}..${f0(s.to).padStart(5)} m at (${f0(s.x)}, ${f0(s.z)})  max ${f1(s.m)} m`);
pr(`   ${shifts.length} shifted stretches on ${new Set(shifts.map((s) => s.id)).size} lines`);

// R1 final
pr('');
let r1 = 0; const r1list: string[] = [];
for (const l of work) for (const c of newCross(l)) { r1++; r1list.push(`${c.a} x ${c.b} at (${f0(c.at[0])}, ${f0(c.at[1])})`); }
pr(`7. R1 (no NEW crossing; the ${new Set([...baseX.values()].flat().map((c) => [c.a, c.b].sort().join('|'))).size} crossing pairs of 21.1 stay the listed junction nodes): ${r1 === 0 ? 'PASS 0 new crossings' : 'FAIL ' + r1 + ' ' + r1list.join(', ')}`);
// R5 final: all new-line ends on an 8-lane road
const ends8: string[] = []; let ends8bad = 0;
for (const l of work) for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) {
  let m = 1e18; for (const o of eight) m = Math.min(m, proj(o.pts, e[0], e[1]).d);
  if (m <= 25) { ends8.push(`${l.id} (${l.cls})`); if (l.cls === '2' || l.cls === 'C' || l.cls === 'L') ends8bad++; }
}
pr(`8. R5: line ends on an 8-lane road now: ${ends8.length} (R6 / R4: ${ends8.length - ends8bad}, kept as taps, tap spacing 1600 m is still broken by the user's own drawing: listed in 21.1, not changed; R2 / C / L: ${ends8bad} left, PASS only at 0)`);
for (const s of r5Open) pr('   ' + s);
const J1 = { x: Config.roads.junctionJ1.x, z: Config.roads.junctionJ1.z, r: Config.roads.junctionJ1.rCore };
const r426 = work.find((l) => l.id === 'R4-26');
if (r426) {
  const jn = eight.find((o) => o.id.startsWith('J1-N'))!;
  const tOf = (pts: V2[]): { d: number; plaza: number } => { let bb = { d: 1e18, plaza: 0 }; for (const e of [pts[0], pts[pts.length - 1]]) { const q = proj(jn.pts, e[0], e[1]); if (q.d < bb.d) bb = { d: q.d, plaza: hyp(q.x - J1.x, q.z - J1.z) - J1.r }; } return bb; };
  const a0 = tOf(r426.orig), b0 = tOf(r426.pts);
  pr(`   R4-26 T on J1-N (user: a little farther from J1, never closer): user line end ${f0(a0.d)} m from J1-N, T is ${f0(a0.plaza)} m from the J1 plaza; after the join step ${f0(b0.plaza)} m (${b0.plaza >= a0.plaza - 1 ? 'not closer: OK' : 'CLOSER'}). Moving it farther along J1-N is a tap decision (R5), NOT done in this step.`);
}
pr('');
pr('9. RADIUS still under the class minimum after the small-shift smoothing (cap ' + SMCAP + ' m). PROPOSAL = what a cap of 70 m would give; NOT applied, your word needed (R10):');
let nProp = 0;
for (const l of work) {
  const a1 = after.get(l.id)!, req = RREQ[l.cls] ?? 20;
  if (a1.rmin >= req) continue;
  const sm = smooth(l.pts, l.cls, 70), m = metrics(sm, l.cls), dd = maxDev(resample(sm).P, l.pts).d;
  nProp++;
  let nodeNear = 1e18; for (const o of lines) { if (o === l) continue; for (const e of [o.pts[0], o.pts[o.pts.length - 1]]) nodeNear = Math.min(nodeNear, hyp(e[0] - a1.rminAt[0], e[1] - a1.rminAt[1])); }
  const why = nodeNear <= 30 ? `the tight corner lies ${f0(nodeNear)} m from a junction node (the other line ends there, so the corner is held)` : m.rmin >= req ? '' : 'a hairpin in the drawn line itself';
  pr(`   ${l.id.padEnd(7)} Rmin ${f0(a1.rmin)} m at (${f0(a1.rminAt[0])}, ${f0(a1.rminAt[1])}) needs ${f0(req)} m; cap 70 m would give ${f0(m.rmin)} m (further shift ${f0(dd)} m)${m.rmin >= req ? ' = would pass' : ': STILL SHORT, ' + why}`);
}
pr(`   ${nProp} lines`);
pr('');
pr('10. BIG shifts (more than 40 m from the line you drew; "small shift" was your rule, so these are the ones to judge):');
for (const l of work) { const d = dev.get(l.id) ?? 0; if (d > 40) pr(`   ${l.id.padEnd(7)} ${f0(d)} m   ${l.notes.join('; ')}`); }

pr('');
pr('SUMMARY');
pr(`  joins ${nJoin}, R5 trims ${nTrim} (open ${nR5Open}), hill lines kept ${stat.hill} of ${stat.hill + stat.hillNo} (tier 1 ${stat.hillT1}, tier 2 ${stat.hillT2}), radius-only smoothing ${stat.smooth}`);
pr(`  metres over the grade limit ${f0(totOverB)} -> ${f0(totOverA)}; tunnel-candidate metres ${f0(totTunB)} -> ${f0(totTunA)}; lines under the class minimum radius ${radFailB} -> ${radFail} of ${work.length}; biggest shift ${f0(maxShiftAll)} m (${maxShiftId}); R1 ${r1 === 0 ? 'PASS' : 'FAIL'}`);
pr('  NOT RUN: tsc of the whole game, npm run build, the game (no game run in this chat). Curvature is made by smoothing the polyline; the real straight - spiral - arc - spiral - straight pieces are fitted at build time (21.6). Natural ground only.');

writeFileSync(`${OUT}/STEP_21_3_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_fixed.json`, JSON.stringify({
  note: 'STEP 21.3 result: centrelines after joins / R5 trims / hill shift / smoothing. world metres (x east, z south). NOT copied to src yet.',
  lines: lines.map((l) => ({ id: l.id, cls: l.cls, built: l.built, notes: l.notes, shift: +(dev.get(l.id) ?? 0).toFixed(1), pts: (l.built ? l.pts : resample(l.pts).P).map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), orig: l.built ? undefined : l.orig.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) })),
  shifts, r5Open,
}));
