// STEP CRR-2d (headless, tsx, nothing in game src changed): GAP EXIT = proposal A of CRR-2c (user OK 2026-11-19).
// The corridor road runs along the rail up to a gap G between two own piers (deck >= 7 m, >= 60 m from every node, 4-lane connector fits).
// At G the connector starts PERPENDICULAR to the rail (centre on the rail line, between the piers), goes straight d1, then ONE bend (spiral Ls - arc R - spiral Ls, R >= 75, V50), straight d2, T (perpendicular) on an existing small road.
// Needs docs/city_rail_road_reach.json (crr1b). Run: npx tsx scripts/crr2d-connectors.ts docs
// Writes docs/city_rail_road_connectors_crr2d.json (same fields as the loops json: st = s of G, R, Ls, T, target, geo {A,h0,h1,d,d1,d2}; so scripts/crr-export-data.ts reads it unchanged) + docs/STEP_CRR2D_OUTPUT.txt.
// Tests (exact, finished game data): 1 OWN PIER: EVERY pier of the own line >= PIER_CLR (11.5 + 1.6 + 1.6 = 14.7 m) from the connector centreline (the pier row is a median only on the rail part; the connector never runs along it);
//  2 UNDER DECK: own rail point within DECK_R (11.5 + 5.8 = 17.3 m) of the connector centreline needs deck underside - natural ground >= 7.0 m;
//  3 RAIL EARTHWORKS: railForm.apply may change the natural ground by <= 0.10 m at 5 offsets along the connector;
//  4 WATER over +-14.2 m; 5 8 / 6-lane road never crossed and BIGCLR 30 m away; 6 other small roads not crossed (only the target at the end); 7 other rail lines >= RAILCLR 20 m; 8 ground grade <= 6 % over 20 m.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const ONLY = process.env.CRR_ONLY ?? '';
const HALF = 11.5, WET_MARGIN = 2.7, D1MIN = 20, D2MIN = 40, BIGCLR = 30, NODE_GAP = 60, RAILCLR = 20, GMAX = Number(process.env.CRR_GMAX ?? 0.06), MAXDEF = (150 * Math.PI) / 180;
const RS: [number, number][] = [[75, 35], [100, 40], [150, 50], [200, 60], [300, 70], [450, 80]];
// CRR-2d (north-1, engineer decision (a), user 'ja ja baki ase ses kore'): T may be skew (90 +- SKEW_MAX deg) on the target road; CRR_SKEW=<deg> switches it on for the line named in CRR_SKEW_LINE only
const SKEW_MAX = Number(process.env.CRR_SKEW ?? 0), SKEW_LINE = process.env.CRR_SKEW_LINE ?? 'north-1';
const TARGET_R = 1100, MAXTRIED = 12000, MAXLEN = Number(process.env.CRR_MAXLEN ?? 600), PER_KEY = 30;
const PIER_HALF = D.pierSize / 2, PIER_GAP = D.pierRoadGap, PIER_CLR = HALF + PIER_HALF + PIER_GAP, DECK_R = HALF + D.deckHalf, N4 = 2 * PIER_CLR;
const NEED = Config.roads.roadRailBuffer.railOverRoad, EFF_MAX = 0.1, EFF_OFFS = [-12, -6, 0, 6, 12];
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail, net = gen.roads, sc = gen.makeSample();
const R1 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_reach.json', 'utf8')) as { version?: string; lines: Record<string, { start: number; end: number; nodes?: { s: number }[]; junctions?: { s: number; road?: string }[] }> };
if (R1.version !== 'crr1b') throw new Error('needs the CRR-1b reach json');
const wet = (x: number, z: number): boolean => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
const ground = (x: number, z: number): number => natH(x, z); // NATURAL ground (CRR-2d fix: the older scripts sampled the finished ground, which includes existing road embankments)
type Rd = { name: string; lanes: number; xs: number[]; zs: number[]; kind: string };
const roads: Rd[] = net.roads.filter((r: any) => r.xs.length > 1).map((r: any) => ({ name: r.name, lanes: r.lanes, kind: r.kind, xs: Array.from(r.xs as ArrayLike<number>), zs: Array.from(r.zs as ArrayLike<number>) }));
const big = roads.filter((r) => r.lanes >= 6), small = roads.filter((r) => r.lanes < 6 && r.kind !== 'ramp');
const railPts: any[] = [];
for (const e of rail.edges) for (let s = 0; s <= e.length; s += 20) { const p = rail.pointAt(e, s); railPts.push([p.x, p.z, e.id as any]); }
const segHit = (ax: number, az: number, bx: number, bz: number, r: Rd): number => {
  for (let k = 0; k + 1 < r.xs.length; k++) {
    if (Math.max(ax, bx) < Math.min(r.xs[k], r.xs[k + 1]) - 1 || Math.min(ax, bx) > Math.max(r.xs[k], r.xs[k + 1]) + 1 || Math.max(az, bz) < Math.min(r.zs[k], r.zs[k + 1]) - 1 || Math.min(az, bz) > Math.max(r.zs[k], r.zs[k + 1]) + 1) continue;
    const d1x = bx - ax, d1z = bz - az, d2x = r.xs[k + 1] - r.xs[k], d2z = r.zs[k + 1] - r.zs[k], den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((r.xs[k] - ax) * d2z - (r.zs[k] - az) * d2x) / den, u = ((r.xs[k] - ax) * d1z - (r.zs[k] - az) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return k;
  }
  return -1;
};
const distTo = (x: number, z: number, r: Rd): number => { let m = Infinity; for (let k = 0; k + 1 < r.xs.length; k++) { const vx = r.xs[k + 1] - r.xs[k], vz = r.zs[k + 1] - r.zs[k], l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - r.xs[k]) * vx + (z - r.zs[k]) * vz) / l2)); m = Math.min(m, Math.hypot(x - r.xs[k] - t * vx, z - r.zs[k] - t * vz)); } return m; };
const bend = (h0: number, R: number, Ls: number, d: number): { vx: number; vz: number; pts: number[][] } | null => {
  const sg = Math.sign(d), Dd = Math.abs(d), La = R * Dd - Ls; if (La < 0) return null;
  let x = 0, z = 0, h = h0; const pts: number[][] = [[0, 0]]; const total = 2 * Ls + La;
  for (let l = 0; l < total - 1e-9; l += 1) { const m = l + 0.5, k = m < Ls ? m / (Ls * R) : m < Ls + La ? 1 / R : (total - m) / (Ls * R); h += sg * k; x += Math.cos(h); z += Math.sin(h); pts.push([x, z]); }
  return { vx: x, vz: z, pts };
};
const dPoly = (x: number, z: number, pts: number[][]): number => { let m = Infinity; for (let k = 0; k + 1 < pts.length; k++) { const vx = pts[k + 1][0] - pts[k][0], vz = pts[k + 1][1] - pts[k][1], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - pts[k][0]) * vx + (z - pts[k][1]) * vz) / l2)); const d = Math.hypot(x - pts[k][0] - t * vx, z - pts[k][1] - t * vz); if (d < m) m = d; } return m; };
const natS = gen.makeSample(), finS = gen.makeSample();
const natH = (x: number, z: number): number => { gen.sampleGround(x, z, natS); return natS.h; };
const railEffect = (x: number, z: number): number => { gen.sampleGround(x, z, natS); finS.h = natS.h; finS.water = natS.water; finS.fx = natS.fx; finS.fz = natS.fz; gen.railForm.apply(x, z, finS); return finS.h - natS.h; };
const railDeckY = (e: any, s: number): number => { const p = rail.pointAt(e, s); const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1); return e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t; };
const ang = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

let dbgN = 0, dbgM = 0;
const out: any = { version: 'crr2d', reach: R1.version, rules: { HALF, D1MIN, D2MIN, BIGCLR, RAILCLR, GMAX, RS, PIER_CLR, DECK_R, NEED, EFF_MAX, NODE_GAP, N4 }, lines: {} };
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
P(`CRR-2d gap exit: connector (4 lanes, half ${HALF} m) starts perpendicular in a pier gap, bend R >= ${RS[0][0]} (V50), T on a small road. Tests: every own pier >= ${PIER_CLR.toFixed(1)} m from the centreline, under deck >= ${NEED} m, rail earthworks <= ${EFF_MAX} m, water 0, 8-lane never crossed (>= ${BIGCLR} m), other small roads not crossed, other rail >= ${RAILCLR} m, ground grade <= ${GMAX * 100} %`);
for (const [id, L] of Object.entries(R1.lines)) {
  if (ONLY && id !== ONLY) continue;
  const e = rail.edges.find((q: any) => q.id === id)!;
  const nodeS = [...(L.nodes ?? []).map((n) => n.s), ...(L.junctions ?? []).map((n) => n.s)];
  // USER RULE (2026-11-19): the J1-E / J1-S junctions (rule 5) stay; the exit is at least NODE_GAP behind the last used J1 junction (J1-W is not used, user tick)
  const jMin = Math.max(-1e9, ...(L.junctions ?? []).filter((j) => j.road === 'J1-E' || j.road === 'J1-S').map((j) => j.s + NODE_GAP));
  const ownPiers: { s: number; x: number; z: number }[] = rail.piers.filter((q: any) => q.edgeId === id).map((q: any) => ({ s: q.s as number, x: q.x as number, z: q.z as number })).sort((a: any, b: any) => a.s - b.s);
  const ownDeck: { s: number; x: number; z: number; clear: number }[] = [];
  for (let s = Math.max(0, L.start); s <= Math.min(e.length, L.end + 100); s += 2.5) { const p = rail.pointAt(e, s); ownDeck.push({ s, x: p.x, z: p.z, clear: railDeckY(e, s) - D.ballast - D.deckThick - natH(p.x, p.z) }); }
  // 1) GAPS: pier pairs inside the reach with a gap >= N4, G every 1 m inside the middle part of the gap (the connector fits as long as both piers stay >= PIER_CLR away)
  interface G { s: number; gap: [number, number]; clear: number; nodeDist: number }
  const gaps: G[] = []; const gapRows: string[] = [];
  const inReach = ownPiers.filter((q) => q.s >= L.start - 1e-6 && q.s <= L.end + 1e-6);
  for (let i = 0; i + 1 < inReach.length; i++) {
    const a = inReach[i], b = inReach[i + 1], w = b.s - a.s; if (w < N4 - 1e-6) continue;
    let ok = 0;
    for (let s = Math.ceil(a.s + PIER_CLR - 0.5); s <= Math.floor(b.s - PIER_CLR + 0.5); s += 1) {
      const p = rail.pointAt(e, s); const cl = railDeckY(e, s) - D.ballast - D.deckThick - natH(p.x, p.z);
      const nd = nodeS.length ? Math.min(...nodeS.map((q) => Math.abs(q - s))) : 999;
      if (cl < NEED || nd < NODE_GAP || s < jMin) continue;
      gaps.push({ s, gap: [a.s, b.s], clear: cl, nodeDist: nd }); ok++;
    }
    gapRows.push(`s${a.s.toFixed(0)}-${b.s.toFixed(0)} (${w.toFixed(0)} m): ${ok} usable G points`);
  }
  P(`${id}: reach ${L.start}..${L.end}, nodes at s ${nodeS.map((q) => q.toFixed(0)).join(',') || '-'}, ${inReach.length} piers, ${gaps.length} usable G points (deck >= ${NEED} m, >= ${NODE_GAP} m from nodes, gap >= ${N4.toFixed(1)} m, s >= ${jMin > -1e8 ? jMin : 0} (behind the J1 junction))`);
  P('  gap rows: ' + (gapRows.join('; ') || 'none'));
  interface C { skew?: number; s: number; sgn: number; R: number; Ls: number; d: number; d1: number; d2: number; len: number; tr: string; tx: number; tz: number; h1: number; A: number[]; h0: number; clear: number }
  const cands: C[] = []; const SKEWS = id === SKEW_LINE && SKEW_MAX > 0 ? [0, 10, -10, 20, -20, 30, -30].filter((q) => Math.abs(q) <= SKEW_MAX) : [0];
  for (const g of gaps) {
    const p = rail.pointAt(e, g.s), l0 = Math.hypot(p.dx, p.dz) || 1, hr = Math.atan2(p.dz / l0, p.dx / l0);
    for (const sgn of [1, -1]) {
      const h0 = hr + (sgn * Math.PI) / 2;
      for (const tr of small) {
        for (let k = 2; k + 2 < tr.xs.length; k++) {
          const tx = tr.xs[k], tz = tr.zs[k]; if (Math.hypot(tx - p.x, tz - p.z) > TARGET_R) continue;
          // the target must lie on the connector's side of the rail line
          if (((tx - p.x) * Math.cos(h0) + (tz - p.z) * Math.sin(h0)) < D1MIN) continue;
          const ta = Math.atan2(tr.zs[k + 1] - tr.zs[k - 1], tr.xs[k + 1] - tr.xs[k - 1]);
          for (const sg2 of [1, -1]) for (const skew of SKEWS) {
            const h1 = ta + (sg2 * Math.PI) / 2 + (skew * Math.PI) / 180, d = ang(h1 - h0); if (Math.abs(d) > MAXDEF) continue;
            for (const [R, Ls] of RS) {
              if (Math.abs(d) < 0.02) { // straight connector, no bend
                const dx = tx - p.x, dz = tz - p.z, along = dx * Math.cos(h0) + dz * Math.sin(h0), off = -dx * Math.sin(h0) + dz * Math.cos(h0);
                if (Math.abs(off) < 1 && along > D1MIN + D2MIN) cands.push({ s: g.s, sgn, R: 0, Ls: 0, d: 0, d1: along - D2MIN, d2: D2MIN, len: along, tr: tr.name, tx, tz, h1, A: [p.x, p.z], h0, clear: g.clear });
                break;
              }
              if (Math.abs(d) < 0.06) continue;
              const Lse = Math.min(Ls, R * Math.abs(d)); if (Lse < 20) continue; // small deflection: pure clothoid pair (no arc), spiral length R x deflection (CRR-2d: the older search skipped deflection < 8.6 deg)
              if (Lse < Ls && cands.some((q) => q.s === g.s && q.sgn === sgn && q.tr === tr.name && q.tx === tx && q.R === R && q.Ls === Lse)) continue;
              const b = bend(h0, R, Lse, d); if (!b) continue;
              const rx = tx - p.x - b.vx, rz = tz - p.z - b.vz, c0x = Math.cos(h0), c0z = Math.sin(h0), c1x = Math.cos(h1), c1z = Math.sin(h1), det = c0x * c1z - c0z * c1x;
              if (Math.abs(det) < 0.05) continue;
              const d1 = (rx * c1z - rz * c1x) / det, d2 = (c0x * rz - c0z * rx) / det;
              if (d1 < D1MIN || d2 < D2MIN) continue;
              cands.push({ skew, s: g.s, sgn, R, Ls: Lse, d, d1, d2, len: d1 + d2 + 2 * Lse + (R * Math.abs(d) - Lse), tr: tr.name, tx, tz, h1, A: [p.x, p.z], h0, clear: g.clear });
            }
          }
        }
      }
    }
  }
  for (let i = cands.length - 1; i >= 0; i--) if (cands[i].len > MAXLEN) cands.splice(i, 1);
  if (process.env.CRR_DEBUG) { const cnt: Record<string, number> = {}; for (const c of cands) cnt[c.tr] = (cnt[c.tr] ?? 0) + 1; console.log('  DBG3 candidates per target: ' + JSON.stringify(cnt)); }
  // cost (same idea as CRR-2b): the road should follow the rail as far as it can, every metre of an early G costs 3 m of connector; R 75 costs a little extra (V50 minimum)
  const cost = (c: C): number => c.len + (L.end - c.s) * 3 + (c.R < 100 && c.R > 0 ? 80 : 0);
  cands.sort((a, b) => cost(a) - cost(b));
  const good: any[] = []; const why: Record<string, number> = {}; const misses: { s: number; R: number; d: number; why: string }[] = []; let tried = 0; const seenT = new Set<string>();
  const perG = new Map<number, number>(), perKey = new Map<string, number>();
  for (const c of cands) {
    if (good.length >= 3 || tried > MAXTRIED) break;
    const key = c.tr + Math.round(c.tx / 100) + Math.round(c.tz / 100) + '_' + Math.round(c.s / 60); if (seenT.has(key)) continue;
    const pk = `${c.s}|${c.sgn}|${c.tr}`; if ((perKey.get(pk) ?? 0) >= PER_KEY) continue; perKey.set(pk, (perKey.get(pk) ?? 0) + 1);
    const pts: number[][] = [];
    for (let l = 0; l <= c.d1; l += 5) pts.push([c.A[0] + Math.cos(c.h0) * l, c.A[1] + Math.sin(c.h0) * l]);
    const bx = c.A[0] + Math.cos(c.h0) * c.d1, bz = c.A[1] + Math.sin(c.h0) * c.d1;
    let ex = bx, ez = bz;
    if (c.R > 0) { const b = bend(c.h0, c.R, c.Ls, c.d)!; for (let q = 0; q < b.pts.length; q += 5) pts.push([bx + b.pts[q][0], bz + b.pts[q][1]]); ex = bx + b.vx; ez = bz + b.vz; }
    for (let l = 5; l <= c.d2; l += 5) pts.push([ex + Math.cos(c.h1) * l, ez + Math.sin(c.h1) * l]);
    // TEST 1 OWN PIER (every own pier, whole line) + TEST 2 UNDER DECK
    let pre = '', worstD = Infinity;
    for (const q of ownPiers) { const dd = dPoly(q.x, q.z, pts); if (dd < PIER_CLR - 1e-9 && dd < worstD) worstD = dd; }
    if (worstD < Infinity) pre = `own pier ${worstD.toFixed(1)} m < ${PIER_CLR.toFixed(1)}`;
    if (!pre) for (const q of ownDeck) { if (q.clear >= NEED) continue; if (dPoly(q.x, q.z, pts) < DECK_R) { pre = `under deck ${q.clear.toFixed(1)} m < ${NEED.toFixed(1)}`; break; } }
    if (pre) { const k = pre.replace(/[0-9.]+/g, '#'); why[k] = (why[k] ?? 0) + 1; if (pre.startsWith('own pier')) misses.push({ s: c.s, R: c.R, d: worstD, why: pre }); continue; }
    tried++;
    let bad = '', maxG = 0, minBig = Infinity, minRail = Infinity, maxEff = 0, pierMin = Infinity;
    for (const q of ownPiers) pierMin = Math.min(pierMin, dPoly(q.x, q.z, pts));
    for (let i = 0; i < pts.length && !bad; i++) {
      const [x, z] = pts[i];
      if (i > 0) {
        for (const r of big) if (segHit(pts[i - 1][0], pts[i - 1][1], x, z, r) >= 0) bad = 'crosses ' + r.name;
        if (!bad && i < pts.length - 2) for (const r of small) if (r.name !== c.tr && segHit(pts[i - 1][0], pts[i - 1][1], x, z, r) >= 0) bad = 'crosses ' + r.name;
        if (!bad && i < pts.length - 4 && segHit(pts[i - 1][0], pts[i - 1][1], x, z, small.find((r) => r.name === c.tr)!) >= 0) bad = 'crosses target early';
      }
      if (bad) break;
      for (const r of big) { const dd = distTo(x, z, r); if (dd < minBig) minBig = dd; if (dd < BIGCLR) { bad = `${r.name} ${dd.toFixed(0)} m < ${BIGCLR}`; break; } }
      if (bad) break;
      if (i * 5 > 80) for (const q of railPts) { if (q[2] === id && Math.hypot(q[0] - c.A[0], q[1] - c.A[1]) < 300) continue; const dd = Math.hypot(q[0] - x, q[1] - z); if (dd < minRail) minRail = dd; if (dd < RAILCLR) { bad = 'rail ' + dd.toFixed(0) + ' m'; break; } }
      if (bad) break;
      const nx = pts[Math.min(i + 1, pts.length - 1)][0] - pts[Math.max(i - 1, 0)][0], nz = pts[Math.min(i + 1, pts.length - 1)][1] - pts[Math.max(i - 1, 0)][1], nl = Math.hypot(nx, nz) || 1;
      for (let o = -(HALF + WET_MARGIN); o <= HALF + WET_MARGIN + 1e-6; o += 3.5) if (wet(x - (nz / nl) * o, z + (nx / nl) * o)) { bad = 'water'; break; }
      if (!bad) for (const o of EFF_OFFS) { const ef = Math.abs(railEffect(x - (nz / nl) * o, z + (nx / nl) * o)); if (ef > maxEff) maxEff = ef; if (ef > EFF_MAX) { bad = `rail earthworks ${ef.toFixed(1)} m`; break; } }
      if (bad) break;
      if (i >= 4) { const g2 = Math.abs(ground(x, z) - ground(pts[i - 4][0], pts[i - 4][1])) / 20; maxG = Math.max(maxG, g2); if (g2 > GMAX) { bad = 'ground grade ' + (g2 * 100).toFixed(1) + ' %'; if (process.env.CRR_DEBUG && dbgN++ < 12) console.log(`  DBG grade fail G s${c.s} side ${c.sgn} R${c.R} -> ${c.tr} at path index ${i} of ${pts.length} (${x.toFixed(0)}, ${z.toFixed(0)}) ground ${ground(x, z).toFixed(1)} vs ${ground(pts[i - 4][0], pts[i - 4][1]).toFixed(1)} 20 m before`); } }
    }
    if (bad) { const k = bad.replace(/[0-9.]+/g, '#'); why[k] = (why[k] ?? 0) + 1; if (process.env.CRR_DEBUG && !bad.startsWith('ground') && dbgM++ < 40) console.log(`  DBG2 G s${c.s} side ${c.sgn} R${c.R} -> ${c.tr} (${c.tx.toFixed(0)}, ${c.tz.toFixed(0)}): ${bad}`); continue; }
    seenT.add(key); perG.set(c.s, (perG.get(c.s) ?? 0) + 1);
    const gp = gaps.find((g) => g.s === c.s)!;
    good.push({ skewDeg: c.skew ?? 0, st: c.s, side: c.sgn > 0 ? 'right' : 'left', R: c.R, Ls: c.Ls, deflDeg: +((c.d * 180) / Math.PI).toFixed(1), d1: +c.d1.toFixed(1), d2: +c.d2.toFixed(1), len: +c.len.toFixed(0), target: c.tr, T: [Math.round(c.tx), Math.round(c.tz)], gap: gp.gap, gapMid: +((gp.gap[0] + gp.gap[1]) / 2).toFixed(1), deckClear: +c.clear.toFixed(1), nodeDist: +gp.nodeDist.toFixed(0), maxGradePct: +(maxG * 100).toFixed(1), minPierAll: +pierMin.toFixed(1), maxRailEffect: +maxEff.toFixed(2), minBigRoad: Number.isFinite(minBig) ? +minBig.toFixed(0) : null, minRail: Number.isFinite(minRail) ? +minRail.toFixed(0) : null, path: pts.map((q) => [Math.round(q[0]), Math.round(q[1])]), geo: { A: [c.A[0], c.A[1]], h0: c.h0, h1: c.h1, d: c.d, d1: c.d1, d2: c.d2 } });
  }
  P('  reasons: ' + JSON.stringify(why));
  if (!good.length) { misses.sort((a, b) => b.d - a.d); P('  closest own-pier misses (G s, R, distance): ' + misses.slice(0, 5).map((m) => `[s${m.s} R${m.R} ${m.d.toFixed(1)} m]`).join(' ')); }
  out.lines[id] = { end: L.end, gaps: gaps.length, candidates: cands.length, tried, good, why, closestMisses: good.length ? [] : misses.slice(0, 5) };
  P(`${id}: ${gaps.length} G points, ${cands.length} shapes, ${tried} checked, ${good.length} pass`);
  good.forEach((g, i) => P(`  ${i === 0 ? 'BEST' : 'alt '} G at s ${g.st} (gap s${g.gap[0].toFixed(0)}-${g.gap[1].toFixed(0)}, deck ${g.deckClear} m, ${g.nodeDist} m from the nearest node, END ${L.end}), connector to the ${g.side}: straight ${g.d1} m, bend R ${g.R} Ls ${g.Ls} ${g.deflDeg} deg, straight ${g.d2} m, length ${g.len} m, T on ${g.target} at (${g.T}), ground grade <= ${g.maxGradePct} %, nearest own pier ${g.minPierAll} m, rail earthworks <= ${g.maxRailEffect} m, nearest 8/6-lane road ${g.minBigRoad ?? '-'} m, water 0`));
  if (!good.length) P('  NO connector passes the checks: see the reasons (needs a decision)');
}
fs.writeFileSync(dir + '/city_rail_road_connectors_crr2d.json', JSON.stringify(out));
fs.writeFileSync(dir + '/STEP_CRR2D_OUTPUT.txt', log.join('\n') + '\n');
