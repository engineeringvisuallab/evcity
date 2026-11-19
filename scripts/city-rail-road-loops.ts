// STEP CRR-2c (2026-11-19, finding a of CRR-5b: 14 rail piers of the OWN line stood inside the loop asphalt): the search of CRR-2b + three new tests, all on the finished game data:
//  - OWN PIER TEST: every pier of the own line behind the leave point (s > st) must be >= PIER_CLR (11.5 half loop + 1.6 pier half + 1.6 pierRoadGap = 14.7 m) from the loop centreline; piers before the leave point (in the pier-row median of the rail part) are tested against the loop beyond 60 m of arc only (a U-turn must not come back onto them). So a loop can only leave where the pier row has a long enough gap (steel span / long span / end of the viaduct) = the road leaves BETWEEN two piers.
//  - UNDER-DECK TEST: an own-line rail point within 17.3 m (11.5 + deck half 5.8) of the loop centreline needs deck underside - natural ground >= 7.0 m (the loop pieces have no cap, no cut).
//  - RAIL EARTHWORKS TEST: railForm.apply on the natural ground must change the ground by <= 0.10 m at 5 offsets (+-12 m, +-6 m, 0) along the loop (N1-loop ran into the rail embankment at the END, finding b).
//  Leave points: every 5 m AND every own pier s. The tests run BEFORE the 8000-shape limit counts, so the limit counts only shapes that passed the pier test. Writes docs/city_rail_road_loops.json (version 'crr2c', reach 'crr1b') + docs/STEP_CRR2C_OUTPUT.txt.
// STEP CRR-2b (rule 5 + user corrections 2026-11-19): same search as CRR-2, but on the CRR-1b reach (docs/city_rail_road_reach.json, version 'crr1b'): loops only at the REAL ENDs;
//  - 8 / 6-lane roads are junction nodes now: the old 45 m clearance is replaced by BIGCLR 30 m (= 11.2 half road + 15 half 8-lane road + 3.8 m gap, so the two roads never overlap); a loop still never CROSSES a big road;
//  - node spacing CR4: the leave point is >= NODE_GAP (60 m) from every junction / small-road node of its line;
//  - USER HINTS (drawn on the CRR-1b picture): west-nw leaves BEFORE J1-W and ends on a small road near (-780, 360); west-sw leaves early and ends on the small road near (-630, 805). A hint only limits the search; if nothing passes, the hint-free best is printed as well.
// STEP CRR-2 (headless, numbers only, nothing in src/ changed): LOOP at the end of each rail-corridor road (needs docs/city_rail_road_reach.json of CRR-1).
// Run: npx tsx scripts/city-rail-road-loops.ts docs        (CRR-2c: writes docs/city_rail_road_loops_crr2c.json + docs/STEP_CRR2C_OUTPUT.txt; needs docs/city_rail_road_reach.json)
// Shape (R3): the road follows the rail up to the leave point s_t, then ONE bend = straight d1 - spiral Ls - arc R - spiral Ls - straight d2 (d2 >= D2MIN), arriving PERPENDICULAR (T) on an existing small road.
// d1 and d2 are solved so that the line ends exactly on the target point. Candidates are sorted by length, the checks run on the shortest first.
// Checks (centre line every 5 m): WATER over +-(HALF + 3) m; BIG ROAD (lanes >= 6) never crossed and kept BIGCLR away; other small roads not crossed (only the target at the end); other rail lines kept RAILCLR away;
// natural ground grade <= GMAX over 20 m (a real vertical profile comes in CRR-4); rail clearance at s_t must still be >= 5.0 m (CRR-1 end rule).
// ASSUMED numbers (planning, not from the web, user may change): V50 city arterial R >= RMIN, Ls by radius, D2MIN, BIGCLR, RAILCLR, GMAX.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const HALF = 11.2, WET_MARGIN = 3, D2MIN = 40, BIGCLR = 30, NODE_GAP = 60, RAILCLR = 20, GMAX = 0.06, MAXDEF = (150 * Math.PI) / 180;
const RS: [number, number][] = [[75, 35], [100, 40], [150, 50], [200, 60], [300, 70], [450, 80]];
const SEARCH_BACK = 900, TARGET_R = 1000;
// diagnostic switches (default: all tests on, all lines): CRR_NO_PIER=1 switches the own pier test off, CRR_ONLY=north-1 runs one line
const PIER_ON = process.env.CRR_NO_PIER !== '1', ONLY = process.env.CRR_ONLY ?? '';
const LOOP_HALF = 11.5, PIER_HALF = D.pierSize / 2, PIER_GAP = D.pierRoadGap, PIER_CLR = LOOP_HALF + PIER_HALF + PIER_GAP, DECK_R = LOOP_HALF + D.deckHalf, NEED = Config.roads.roadRailBuffer.railOverRoad, EFF_MAX = 0.1, EFF_OFFS = [-12, -6, 0, 6, 12];
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail, net = gen.roads, sc = gen.makeSample();
const R1 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_reach.json', 'utf8')) as { version?: string; lines: Record<string, { start: number; end: number; endPoint: number[]; nodes?: { s: number }[]; junctions?: { s: number }[] }> };
if (R1.version !== 'crr1b') throw new Error('needs the CRR-1b reach json (run city-rail-road-reach.ts first)');
const HINT: Record<string, { near: number[]; r: number; stMax?: number }> = { 'west-nw': { near: [-780, 360], r: 150, stMax: 780 }, 'west-sw': { near: [-630, 805], r: 100 } };
const ground = (x: number, z: number): number => { gen.sample(x, z, sc); return sc.h; };
const wet = (x: number, z: number): boolean => { gen.sample(x, z, sc); return sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h - 0.3; };
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

// bend in world frame: start heading h0, returns displacement and sample list (every 1 m) for a given R, Ls, deflection d (signed)
const bend = (h0: number, R: number, Ls: number, d: number): { vx: number; vz: number; pts: number[][] } | null => {
  const sg = Math.sign(d), D = Math.abs(d), La = R * D - Ls; if (La < 0) return null;
  let x = 0, z = 0, h = h0; const pts: number[][] = [[0, 0]]; const total = 2 * Ls + La;
  for (let l = 0; l < total - 1e-9; l += 1) {
    const m = l + 0.5, k = m < Ls ? m / (Ls * R) : m < Ls + La ? 1 / R : (total - m) / (Ls * R);
    h += sg * k; x += Math.cos(h); z += Math.sin(h); pts.push([x, z]);
  }
  return { vx: x, vz: z, pts };
};
// CRR-2c helpers: distance of a point to a polyline, natural ground, rail earthworks effect, rail deck height
const dPoly = (x: number, z: number, pts: number[][], from = 0): number => { let m = Infinity; for (let k = from; k + 1 < pts.length; k++) { const vx = pts[k + 1][0] - pts[k][0], vz = pts[k + 1][1] - pts[k][1], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - pts[k][0]) * vx + (z - pts[k][1]) * vz) / l2)); const d = Math.hypot(x - pts[k][0] - t * vx, z - pts[k][1] - t * vz); if (d < m) m = d; } return m; };
const natS = gen.makeSample(), finS = gen.makeSample();
const natH = (x: number, z: number): number => { gen.sampleGround(x, z, natS); return natS.h; };
const railEffect = (x: number, z: number): number => { gen.sampleGround(x, z, natS); finS.h = natS.h; finS.water = natS.water; finS.fx = natS.fx; finS.fz = natS.fz; gen.railForm.apply(x, z, finS); return finS.h - natS.h; };
const railDeckY = (e: any, s: number): number => { const p = rail.pointAt(e, s); const t = (s - e.cum[p.i]) / (e.cum[p.i + 1] - e.cum[p.i] || 1); return e.design[p.i] + (e.design[p.i + 1] - e.design[p.i]) * t; };
const ang = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
const out: any = { version: 'crr2c', reach: R1.version, rules: { HALF, D2MIN, BIGCLR, RAILCLR, GMAX, RS, PIER_CLR, DECK_R, NEED, EFF_MAX }, lines: {} };
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
P(`CRR-2c loops at the real ENDs of the rail-corridor roads (T on an existing small road, V50 R >= ${RS[0][0]} m, R3 straight-spiral-arc-spiral-straight; own pier test centre offset >= ${PIER_CLR.toFixed(1)} m, under-deck >= ${NEED} m, rail earthworks <= ${EFF_MAX} m)`);
for (const [id, L] of Object.entries(R1.lines)) {
  if (ONLY && id !== ONLY) continue;
  const e = rail.edges.find((q: any) => q.id === id)!;
  interface C { st: number; R: number; Ls: number; d: number; d1: number; d2: number; len: number; tr: string; tx: number; tz: number; h1: number; A: number[]; h0: number }
  const nodeS = [...(L.nodes ?? []).map((n) => n.s), ...(L.junctions ?? []).map((n) => n.s)];
  // CRR-2c: own piers, own rail points with the deck clearance (deck underside - natural ground), leave points every 5 m + every own pier s
  const ownPiers: { s: number; x: number; z: number }[] = rail.piers.filter((q: any) => q.edgeId === id).map((q: any) => ({ s: q.s as number, x: q.x as number, z: q.z as number })).sort((a: any, b: any) => a.s - b.s);
  const ownDeck: { s: number; x: number; z: number; clear: number }[] = [];
  for (let s = Math.max(0, L.start); s <= Math.min(e.length, L.end + 400); s += 5) { const p = rail.pointAt(e, s); ownDeck.push({ s, x: p.x, z: p.z, clear: railDeckY(e, s) - D.ballast - D.deckThick - natH(p.x, p.z) }); }
  const stSet = new Set<number>();
  for (let st = Math.max(L.start, L.end - SEARCH_BACK); st <= L.end; st += 5) stSet.add(st);
  for (const q of ownPiers) if (q.s >= Math.max(L.start, L.end - SEARCH_BACK) && q.s <= L.end) stSet.add(q.s);
  const stList = [...stSet].sort((a, b) => a - b);
  for (const useHint of [true, false]) {
  if (!useHint && !HINT[id]) break;
  if (!useHint && out.lines[id]?.good.length) break;
  const hint = useHint ? HINT[id] : undefined;
  const cands: C[] = [];
  for (const st of stList) {
    if (nodeS.some((q) => Math.abs(q - st) < NODE_GAP)) continue;
    if (hint?.stMax != null && st > hint.stMax) continue;
    const p = rail.pointAt(e, st), l0 = Math.hypot(p.dx, p.dz) || 1, h0 = Math.atan2(p.dz / l0, p.dx / l0);
    for (const tr of small) {
      for (let k = 2; k + 2 < tr.xs.length; k++) {
        const tx = tr.xs[k], tz = tr.zs[k]; if (Math.hypot(tx - p.x, tz - p.z) > TARGET_R) continue;
        if (hint && Math.hypot(tx - hint.near[0], tz - hint.near[1]) > hint.r) continue;
        const ta = Math.atan2(tr.zs[k + 1] - tr.zs[k - 1], tr.xs[k + 1] - tr.xs[k - 1]);
        for (const sgn of [1, -1]) {
          const h1 = ta + (sgn * Math.PI) / 2, d = ang(h1 - h0); if (Math.abs(d) > MAXDEF || Math.abs(d) < 0.15) continue;
          for (const [R, Ls] of RS) {
            const b = bend(h0, R, Ls, d); if (!b) continue;
            const rx = tx - p.x - b.vx, rz = tz - p.z - b.vz, c0x = Math.cos(h0), c0z = Math.sin(h0), c1x = Math.cos(h1), c1z = Math.sin(h1), det = c0x * c1z - c0z * c1x;
            if (Math.abs(det) < 0.05) continue;
            const d1 = (rx * c1z - rz * c1x) / det, d2 = (c0x * rz - c0z * rx) / det;
            if (d1 < 0 || d2 < D2MIN) continue;
            cands.push({ st, R, Ls, d, d1, d2, len: d1 + d2 + 2 * Ls + (R * Math.abs(d) - Ls), tr: tr.name, tx, tz, h1, A: [p.x, p.z], h0 });
          }
        }
      }
    }
  }
  // the road should follow the rail as far as it can: every metre of an early leave costs 3 m of loop length
  const cost = (c: C): number => c.len + (L.end - c.st) * 3 + (c.R < 100 ? 80 : 0);
  cands.sort((a, b) => cost(a) - cost(b));
  const good: any[] = []; const why: Record<string, number> = {}; const misses: { st: number; R: number; defl: number; T: string; pier: number; d: number; worst: number }[] = []; let tried = 0; const seenT = new Set<string>();
  for (const c of cands) {
    if (good.length >= 3 || tried > 8000) break;
    const key = c.tr + Math.round(c.tx / 100) + Math.round(c.tz / 100); if (seenT.has(key) && good.length) continue;
    const b = bend(c.h0, c.R, c.Ls, c.d)!; const pts: number[][] = [];
    for (let l = 0; l <= c.d1; l += 5) pts.push([c.A[0] + Math.cos(c.h0) * l, c.A[1] + Math.sin(c.h0) * l]);
    const bx = c.A[0] + Math.cos(c.h0) * c.d1, bz = c.A[1] + Math.sin(c.h0) * c.d1;
    for (let q = 0; q < b.pts.length; q += 5) pts.push([bx + b.pts[q][0], bz + b.pts[q][1]]);
    const ex = bx + b.vx, ez = bz + b.vz;
    for (let l = 5; l <= c.d2; l += 5) pts.push([ex + Math.cos(c.h1) * l, ez + Math.sin(c.h1) * l]);
    // CRR-2c OWN PIER TEST (cheap, runs first) + UNDER-DECK TEST
    let pre = '', pierMin = Infinity, worstS = 0, worstD = Infinity;
    for (const q of ownPiers) {
      const after = q.s > c.st + 0.01, dd = dPoly(q.x, q.z, pts, after ? 0 : 12);
      if (after) pierMin = Math.min(pierMin, dd);
      if (PIER_ON && dd < PIER_CLR - 1e-9) { if (dd < worstD) { worstD = dd; worstS = q.s; } pre = `own pier ${dd.toFixed(1)} m < ${PIER_CLR.toFixed(1)}`; }
    }
    if (pre.startsWith('own pier')) { pre = `own pier ${worstD.toFixed(1)} m < ${PIER_CLR.toFixed(1)}`; misses.push({ st: c.st, R: c.R, defl: +((c.d * 180) / Math.PI).toFixed(0), T: c.tr, pier: worstS, d: worstD, worst: PIER_CLR - worstD }); }
    if (!pre) for (const q of ownDeck) { if (q.s <= c.st) continue; if (q.clear >= NEED) continue; if (dPoly(q.x, q.z, pts) < DECK_R) { pre = `under deck ${q.clear.toFixed(1)} m < ${NEED.toFixed(1)}`; break; } }
    if (pre) { const k = pre.replace(/[0-9.]+/g, '#'); why[k] = (why[k] ?? 0) + 1; continue; }
    tried++;
    let bad = '', maxG = 0, minBig = Infinity, minRail = Infinity, maxEff = 0;
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
      if (i * 5 > 60) for (const q of railPts) { if (q[2] === id && Math.hypot(q[0] - c.A[0], q[1] - c.A[1]) < 300) continue; const dd = Math.hypot(q[0] - x, q[1] - z); if (dd < minRail) minRail = dd; if (dd < RAILCLR) { bad = 'rail ' + dd.toFixed(0) + ' m'; break; } }
      if (bad) break;
      const nx = pts[Math.min(i + 1, pts.length - 1)][0] - pts[Math.max(i - 1, 0)][0], nz = pts[Math.min(i + 1, pts.length - 1)][1] - pts[Math.max(i - 1, 0)][1], nl = Math.hypot(nx, nz) || 1;
      for (let o = -(HALF + WET_MARGIN); o <= HALF + WET_MARGIN; o += 7) if (wet(x - (nz / nl) * o, z + (nx / nl) * o)) { bad = 'water'; break; }
      if (!bad) for (const o of EFF_OFFS) { const ef = Math.abs(railEffect(x - (nz / nl) * o, z + (nx / nl) * o)); if (ef > maxEff) maxEff = ef; if (ef > EFF_MAX) { bad = `rail earthworks ${ef.toFixed(1)} m`; break; } }
      if (bad) break;
      if (i >= 4) { const g = Math.abs(ground(x, z) - ground(pts[i - 4][0], pts[i - 4][1])) / 20; maxG = Math.max(maxG, g); if (g > GMAX) bad = 'ground grade ' + (g * 100).toFixed(1) + ' %'; }
    }
    if (bad) { why[bad.replace(/[0-9.]+/g, '#')] = (why[bad.replace(/[0-9.]+/g, '#')] ?? 0) + 1; continue; }
    seenT.add(key);
    good.push({ st: c.st, R: c.R, Ls: c.Ls, deflDeg: +((c.d * 180) / Math.PI).toFixed(1), d1: +c.d1.toFixed(1), d2: +c.d2.toFixed(1), len: +c.len.toFixed(0), target: c.tr, T: [Math.round(c.tx), Math.round(c.tz)], maxGradePct: +(maxG * 100).toFixed(1), minPierAfter: Number.isFinite(pierMin) ? +pierMin.toFixed(1) : null, maxRailEffect: +maxEff.toFixed(2), minBigRoad: +minBig.toFixed(0), minRail: Number.isFinite(minRail) ? +minRail.toFixed(0) : null, path: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]), geo: { A: [c.A[0], c.A[1]], h0: c.h0, h1: c.h1, d: c.d, d1: c.d1, d2: c.d2 } }); // CRR-5b: exact geometry (the rounded path is only for the picture)
  }
  P('  reasons: ' + JSON.stringify(why));
  if (!good.length) { misses.sort((a, b) => a.worst - b.worst); P('  closest misses of the own pier test (leave s, R, deflection, target, worst pier s, its distance): ' + misses.slice(0, 5).map((m) => `[s${m.st} R${m.R} ${m.defl}deg ${m.T} pier s${m.pier.toFixed(0)} ${m.d.toFixed(1)} m]`).join(' ')); }
  out.lines[id] = { end: L.end, candidates: cands.length, tried, good, hint: !!hint, why, closestMisses: good.length ? [] : misses.slice(0, 5) };
  P(`${id}${hint ? ' (user hint)' : HINT[id] ? ' (hint-free, the hint gave nothing)' : ''}: ${cands.length} shapes, ${tried} checked, ${good.length} pass`);
  good.forEach((g, i) => P(`  ${i === 0 ? 'BEST' : 'alt '} leave at s ${g.st} (END ${L.end}), bend R ${g.R} Ls ${g.Ls} deflection ${g.deflDeg} deg, straight before ${g.d1} m / after ${g.d2} m, loop ${g.len} m, T on ${g.target} at (${g.T}), ground grade <= ${g.maxGradePct} %, nearest own pier behind the leave point ${g.minPierAfter ?? '-'} m, rail earthworks <= ${g.maxRailEffect} m, nearest 8/6-lane road ${g.minBigRoad} m, water 0`));
  if (!good.length) P('  NO loop passes the checks: see the reasons in the handoff (needs a decision)');
  }
}
// CRR-2c writes a NEW file: docs/city_rail_road_loops.json (CRR-2b) is what scripts/crr-export-data.ts and the game data use, it is replaced only when a CRR-2c loop set is adopted (user OK)
fs.writeFileSync(dir + '/city_rail_road_loops_crr2c.json', JSON.stringify(out));
fs.writeFileSync(dir + '/STEP_CRR2C_OUTPUT.txt', log.join('\n') + '\n');
