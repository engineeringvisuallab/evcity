// STEP CRR-2b (rule 5 + user corrections 2026-11-19): same search as CRR-2, but on the CRR-1b reach (docs/city_rail_road_reach.json, version 'crr1b'): loops only at the REAL ENDs;
//  - 8 / 6-lane roads are junction nodes now: the old 45 m clearance is replaced by BIGCLR 30 m (= 11.2 half road + 15 half 8-lane road + 3.8 m gap, so the two roads never overlap); a loop still never CROSSES a big road;
//  - node spacing CR4: the leave point is >= NODE_GAP (60 m) from every junction / small-road node of its line;
//  - USER HINTS (drawn on the CRR-1b picture): west-nw leaves BEFORE J1-W and ends on a small road near (-780, 360); west-sw leaves early and ends on the small road near (-630, 805). A hint only limits the search; if nothing passes, the hint-free best is printed as well.
// STEP CRR-2 (headless, numbers only, nothing in src/ changed): LOOP at the end of each rail-corridor road (needs docs/city_rail_road_reach.json of CRR-1).
// Run: npx tsx scripts/city-rail-road-loops.ts docs        (writes docs/city_rail_road_loops.json + docs/STEP_CRR2B_OUTPUT.txt)
// Shape (R3): the road follows the rail up to the leave point s_t, then ONE bend = straight d1 - spiral Ls - arc R - spiral Ls - straight d2 (d2 >= D2MIN), arriving PERPENDICULAR (T) on an existing small road.
// d1 and d2 are solved so that the line ends exactly on the target point. Candidates are sorted by length, the checks run on the shortest first.
// Checks (centre line every 5 m): WATER over +-(HALF + 3) m; BIG ROAD (lanes >= 6) never crossed and kept BIGCLR away; other small roads not crossed (only the target at the end); other rail lines kept RAILCLR away;
// natural ground grade <= GMAX over 20 m (a real vertical profile comes in CRR-4); rail clearance at s_t must still be >= 5.0 m (CRR-1 end rule).
// ASSUMED numbers (planning, not from the web, user may change): V50 city arterial R >= RMIN, Ls by radius, D2MIN, BIGCLR, RAILCLR, GMAX.
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const dir = process.argv[2] ?? 'docs';
const HALF = 11.2, WET_MARGIN = 3, D2MIN = 40, BIGCLR = 30, NODE_GAP = 60, RAILCLR = 20, GMAX = 0.06, MAXDEF = (150 * Math.PI) / 180;
const RS: [number, number][] = [[75, 35], [100, 40], [150, 50], [200, 60], [300, 70], [450, 80]];
const SEARCH_BACK = 900, TARGET_R = 1000;
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
const ang = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
const out: any = { reach: R1.version, rules: { HALF, D2MIN, BIGCLR, RAILCLR, GMAX, RS }, lines: {} };
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
P(`CRR-2b loops at the real ENDs of the rail-corridor roads (T on an existing small road, V50 R >= ${RS[0][0]} m, R3 straight-spiral-arc-spiral-straight)`);
for (const [id, L] of Object.entries(R1.lines)) {
  const e = rail.edges.find((q: any) => q.id === id)!;
  interface C { st: number; R: number; Ls: number; d: number; d1: number; d2: number; len: number; tr: string; tx: number; tz: number; h1: number; A: number[]; h0: number }
  const nodeS = [...(L.nodes ?? []).map((n) => n.s), ...(L.junctions ?? []).map((n) => n.s)];
  for (const useHint of [true, false]) {
  if (!useHint && !HINT[id]) break;
  if (!useHint && out.lines[id]?.good.length) break;
  const hint = useHint ? HINT[id] : undefined;
  const cands: C[] = [];
  for (let st = Math.max(L.start, L.end - SEARCH_BACK); st <= L.end; st += 10) {
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
  const good: any[] = []; const why: Record<string, number> = {}; let tried = 0; const seenT = new Set<string>();
  for (const c of cands) {
    if (good.length >= 3 || tried > 8000) break;
    const key = c.tr + Math.round(c.tx / 100) + Math.round(c.tz / 100); if (seenT.has(key) && good.length) continue;
    tried++;
    const b = bend(c.h0, c.R, c.Ls, c.d)!; const pts: number[][] = [];
    for (let l = 0; l <= c.d1; l += 5) pts.push([c.A[0] + Math.cos(c.h0) * l, c.A[1] + Math.sin(c.h0) * l]);
    const bx = c.A[0] + Math.cos(c.h0) * c.d1, bz = c.A[1] + Math.sin(c.h0) * c.d1;
    for (let q = 0; q < b.pts.length; q += 5) pts.push([bx + b.pts[q][0], bz + b.pts[q][1]]);
    const ex = bx + b.vx, ez = bz + b.vz;
    for (let l = 5; l <= c.d2; l += 5) pts.push([ex + Math.cos(c.h1) * l, ez + Math.sin(c.h1) * l]);
    let bad = '', maxG = 0, minBig = Infinity, minRail = Infinity;
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
      if (i >= 4) { const g = Math.abs(ground(x, z) - ground(pts[i - 4][0], pts[i - 4][1])) / 20; maxG = Math.max(maxG, g); if (g > GMAX) bad = 'ground grade ' + (g * 100).toFixed(1) + ' %'; }
    }
    if (bad) { why[bad.replace(/[0-9.]+/g, '#')] = (why[bad.replace(/[0-9.]+/g, '#')] ?? 0) + 1; continue; }
    seenT.add(key);
    good.push({ st: c.st, R: c.R, Ls: c.Ls, deflDeg: +((c.d * 180) / Math.PI).toFixed(1), d1: +c.d1.toFixed(1), d2: +c.d2.toFixed(1), len: +c.len.toFixed(0), target: c.tr, T: [Math.round(c.tx), Math.round(c.tz)], maxGradePct: +(maxG * 100).toFixed(1), minBigRoad: +minBig.toFixed(0), minRail: Number.isFinite(minRail) ? +minRail.toFixed(0) : null, path: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]), geo: { A: [c.A[0], c.A[1]], h0: c.h0, h1: c.h1, d: c.d, d1: c.d1, d2: c.d2 } }); // CRR-5b: exact geometry (the rounded path is only for the picture)
  }
  P('  reasons: ' + JSON.stringify(why));
  out.lines[id] = { end: L.end, candidates: cands.length, tried, good, hint: !!hint };
  P(`${id}${hint ? ' (user hint)' : HINT[id] ? ' (hint-free, the hint gave nothing)' : ''}: ${cands.length} shapes, ${tried} checked, ${good.length} pass`);
  good.forEach((g, i) => P(`  ${i === 0 ? 'BEST' : 'alt '} leave at s ${g.st} (END ${L.end}), bend R ${g.R} Ls ${g.Ls} deflection ${g.deflDeg} deg, straight before ${g.d1} m / after ${g.d2} m, loop ${g.len} m, T on ${g.target} at (${g.T}), ground grade <= ${g.maxGradePct} %, nearest 8/6-lane road ${g.minBigRoad} m, water 0`));
  if (!good.length) P('  NO loop passes the checks: see the reasons in the handoff (needs a decision)');
  }
}
fs.writeFileSync(dir + '/city_rail_road_loops.json', JSON.stringify(out));
fs.writeFileSync(dir + '/STEP_CRR2B_OUTPUT.txt', log.join('\n') + '\n');
