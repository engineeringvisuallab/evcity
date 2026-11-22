// STEP RE-9 (ground lanes) CHECK, headless, REAL game data (tsx): flag OFF vs ON of Config.roads.junctionRteLanes.
// Run: npx tsx scripts/rte-lane-check.ts docs   Writes docs/RTE_LANES.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RTE_SLIP_DATA } from '../src/roads/junction/RteGeometry';
import { RTE_STRUCT_FRAME as FR, RTE_RAMP_STRUCTS } from '../src/roads/junction/RteStructData';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const hash = (parts: ArrayLike<number>[]): string => { const h = createHash('sha1'); for (const p of parts) h.update(Buffer.from(new Float64Array(Array.from(p)).buffer)); return h.digest('hex').slice(0, 10); };
const sig = (g: any): { rail: string; roads: Map<string, string> } => {
  const rail = g.rail; const piers = hash([rail.piers.flatMap((q: any) => [q.s, q.x, q.z, q.baseY, q.deckY])]);
  return { rail: piers + ':' + rail.piers.length + ':' + rail.edges.length, roads: new Map(g.roads.roads.map((r: any) => [r.name, hash([r.xs, r.zs, r.ys])])) };
};
Config.roads.junctionRteLanes.enabled = false;
const off: any = new TerrainGenerator(Config.world.seed); const sOff = sig(off);
Config.roads.junctionRteLanes.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed); const sOn = sig(gen);
const net = gen.roads, sc = gen.makeSample();
const repAll = net.rteLaneReport as { name: string; roadId: number; length: number; points: number }[];
const isTail = (n: string): boolean => n.startsWith('RTE-TAIL-');
const rep = repAll.filter(r => !isTail(r.name));        // the two short slips (L0..L9 as before)
const tails = repAll.filter(r => isTail(r.name));       // STEP A: the four merge tails of the ramps M3 / M4 (checks T1..T9)
P(`RE-9 GROUND LANES: roads OFF ${sOff.roads.size}, ON ${sOn.roads.size}; built ${repAll.map(r => `${r.name} ${r.length.toFixed(0)} m / ${r.points} pts`).join(', ')}`);
CHK('L0 the switch builds at least the A2S and S2A ground parts', rep.length >= 2, `${rep.length} roads`);

// L1 water first (sc.water > sc.h on the finished ground, centre and +-3 / +-6 m)
let wet = 0;
for (const r of repAll) { const rd = net.roads[r.roadId]; for (let i = 0; i < rd.xs.length; i++) for (const o of [-8, -4, 0, 4, 8]) { gen.sample(rd.xs[i] + rd.nx[i] * o, rd.zs[i] + rd.nz[i] * o, sc); if (sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h) wet++; } }
CHK('L1 no wet ground under the lanes (sc.water > sc.h, 5 offsets per point)', wet === 0, `${wet} wet samples`);

// L2 rail and every existing road unchanged
CHK('L2 rail unchanged (piers, edges)', sOff.rail === sOn.rail, sOff.rail + ' / ' + sOn.rail);
let chg = 0; for (const [k, v] of sOff.roads) if (sOn.roads.get(k) !== v) chg++;
CHK('L3 every existing road unchanged (xs, zs, ys)', chg === 0, `${chg} changed of ${sOff.roads.size}`);

// L4 surface = data (1 cm) and L5 finished ground at the centre line = lane level
const data = new Map(RTE_SLIP_DATA.map(q => [q.name, q])); let worst = 0, gw = 0, gl = '', nEnd = 0, endWorst = 0;
const dOf = (x: number, z: number): number => -((x - FR.J[0]) * FR.ln[0] + (z - FR.J[1]) * FR.ln[1]);
const arm = net.roads.find((r: any) => r.name === 'J1-E'); let overlap = 0, ovWorst = 0, stemPts = 0;
for (const r of rep) {
  const rd = net.roads[r.roadId], q = data.get(r.name.replace(/-[a-z]$/, ''));
  for (let i = 0; i < rd.xs.length; i++) {
    let bd = 1e9, by = 0;
    const vv = dOf(rd.xs[i], rd.zs[i]), uu = (rd.xs[i] - FR.J[0]) * FR.t[0] + (rd.zs[i] - FR.J[1]) * FR.t[1];
    if (vv > 40) { const gap = Math.abs(uu) - 2.75 - 22.1; if (gap < -0.1) { overlap++; ovWorst = Math.min(ovWorst, gap); if (overlap < 5) P(`  overlap ${r.name} pt ${i} d ${vv.toFixed(0)} u ${uu.toFixed(2)}`); } }
    if (!q) { stemPts++; by = net.roadYAt(arm, FR.J[0] - vv * FR.ln[0], FR.J[1] - vv * FR.ln[1]).y; } else
    for (let k = 0; k + 1 < q.pts.length; k++) { const ax = q.pts[k][0], az = q.pts[k][1], bx = q.pts[k + 1][0], bz = q.pts[k + 1][1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; const t = Math.min(1, Math.max(0, ((rd.xs[i] - ax) * dx + (rd.zs[i] - az) * dz) / l2)); const d = Math.hypot(ax + dx * t - rd.xs[i], az + dz * t - rd.zs[i]); if (d < bd) { bd = d; by = q.ys[k] + (q.ys[k + 1] - q.ys[k]) * t; } }
    worst = Math.max(worst, Math.abs(rd.ys[i] - by));
    gen.sample(rd.xs[i], rd.zs[i], sc); const e = Math.abs(sc.h - rd.ys[i]); const dd = dOf(rd.xs[i], rd.zs[i]);
    if (Math.abs(dd - 160) < 15 || Math.abs(dd - 271) < 15) { if (e > 0.15) { nEnd++; endWorst = Math.max(endWorst, e); } } else if (e > gw) { gw = e; gl = `${r.name} pt ${i}`; }
  }
}
CHK('L4 lane surface level = RE-3 slip data level / the J1-E arm level on the stem axis (<= 5 cm: the wider lane centre line is moved 1.4 m outward, the level is taken from the nearest data point)', worst <= 0.05, `worst ${worst.toFixed(3)} m, ${stemPts} stem lane points`);
CHK('L7 no ground lane lies on the arm pavement (lane inner edge >= 22.0 m from the stem axis where d > 40)', overlap === 0, `${overlap} points, worst ${ovWorst.toFixed(2)} m`);
// L8 (simple version, 2026-11-22: user 'make it simple'): only the two short slips; each end lies right beside the main road (ring: |d| <= 28.5 m, arm: |u| <= 28.5 m) and each is <= 250 m long; no long stem lane is built
const uOfP = (x: number, z: number): number => (x - FR.J[0]) * FR.t[0] + (z - FR.J[1]) * FR.t[1];
let l8bad = 0; const l8 = rep.map(r => { const rd = net.roads[r.roadId], n = rd.xs.length; const beside = (i: number): boolean => Math.abs(dOf(rd.xs[i], rd.zs[i])) <= 28.5 || Math.abs(uOfP(rd.xs[i], rd.zs[i])) <= 28.5; const ok = beside(0) && beside(n - 1) && r.length <= 250; if (!ok) l8bad++; return `${r.name} ${r.length.toFixed(0)} m start d ${dOf(rd.xs[0], rd.zs[0]).toFixed(0)} u ${uOfP(rd.xs[0], rd.zs[0]).toFixed(1)}, end d ${dOf(rd.xs[n - 1], rd.zs[n - 1]).toFixed(0)} u ${uOfP(rd.xs[n - 1], rd.zs[n - 1]).toFixed(1)}`; });
CHK('L8 simple: only the A2S and S2A short slips, both ends beside the main road, each <= 250 m, no stem lane', rep.length === 2 && rep.some(r => r.name === 'RTE-A2S') && rep.some(r => r.name === 'RTE-S2A') && l8bad === 0, l8.join('; '));
CHK('L5 finished ground on the lane centre line within 0.15 m of the lane level (the lane is carved / filled), except within 15 m of an arm viaduct window edge', gw <= 0.15, `worst ${gw.toFixed(2)} m (${gl})`);
P(`INFO  ${nEnd} lane points within 15 m of a viaduct window edge have ground up to ${endWorst.toFixed(2)} m below the lane (the lane is on the approach embankment of the arm viaduct; the approach slab of the widened viaduct is RteMesh)`);

// L6 grade
let mg = 0; for (const r of repAll) { const rd = net.roads[r.roadId]; for (let i = 1; i < rd.xs.length; i++) { const dl = Math.hypot(rd.xs[i] - rd.xs[i - 1], rd.zs[i] - rd.zs[i - 1]); if (dl > 0.01) mg = Math.max(mg, Math.abs(rd.ys[i] - rd.ys[i - 1]) / dl); } }
CHK('L6 max grade of the lanes and tails <= 5 %', mg <= 0.05, `${(mg * 100).toFixed(2)} %`);

// L9 (wider lane 5.5 m): edge clearance to the paved edges of the ring / arm, minimum radius, distance of the lane edge to the ramp piers (RE-8 data, column half size 1.5 m ASSUMED)
{
  let minClr = 1e9, minR = 1e9, minPier = 1e9, pierAt = '';
  for (const r of rep) {
    const rd = net.roads[r.roadId], n = rd.xs.length;
    for (let i = 0; i < n; i++) { const dd = dOf(rd.xs[i], rd.zs[i]), uu = uOfP(rd.xs[i], rd.zs[i]); if (Math.abs(uu) > 40) minClr = Math.min(minClr, Math.abs(dd) - 22.1 - rd.halfWidth); if (dd > 40) minClr = Math.min(minClr, Math.abs(uu) - 22.1 - rd.halfWidth); }
    for (let i = 1; i + 1 < n; i++) { const ax = rd.xs[i - 1], az = rd.zs[i - 1], bx = rd.xs[i], bz = rd.zs[i], cx = rd.xs[i + 1], cz = rd.zs[i + 1]; const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz); const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)); if (area2 > 1e-6) minR = Math.min(minR, (ab * bc * ca) / (2 * area2)); }
    for (const st of RTE_RAMP_STRUCTS as any[]) for (const pr of st.piers as any[]) for (let i = 0; i + 1 < n; i++) {
      const ax = rd.xs[i], az = rd.zs[i], dx = rd.xs[i + 1] - ax, dz = rd.zs[i + 1] - az, l2 = dx * dx + dz * dz; const t = l2 > 0 ? Math.min(1, Math.max(0, ((pr.x - ax) * dx + (pr.z - az) * dz) / l2)) : 0;
      const g = Math.hypot(pr.x - (ax + dx * t), pr.z - (az + dz * t)) - 2.75; if (g < minPier) { minPier = g; pierAt = `${r.name} / ${st.name} pier at d ${dOf(pr.x, pr.z).toFixed(0)} u ${uOfP(pr.x, pr.z).toFixed(0)}`; }
    }
  }
  CHK('L9a lane edge >= 0.3 m outside the paved edge of the ring and of the arm', minClr >= 0.3, `smallest clearance ${minClr.toFixed(2)} m`);
  CHK('L9b minimum radius of the lane centre line >= 40.6 m (RE-3 SL1 minimum for V 40)', minR >= 40.6, `smallest radius ${minR.toFixed(1)} m (point-to-point estimate)`);
  CHK('L9c lane edge >= 2.0 m from every M3 / M4 pier centre (column half 1.5 m + 0.5 m)', minPier >= 2.0, `smallest gap ${minPier.toFixed(2)} m (${pierAt})`);
}

// ===== STEP A: the four MERGE TAILS of the ramp bridges M3 / M4 (user 2026-11-22: 'the ramp must come to the road and merge') =====
{
  const ring = net.roads.find((r: any) => r.name === 'M8'), armR = net.roads.find((r: any) => r.name === 'J1-E');
  const M3 = (RTE_RAMP_STRUCTS as any[]).find(r => r.name === 'M3'), M4 = (RTE_RAMP_STRUCTS as any[]).find(r => r.name === 'M4');
  const want: Record<string, { hw: number; main: 'ring' | 'arm'; st: any; end: 'first' | 'last' }> = {
    'RTE-TAIL-M3S': { hw: 4.85, main: 'ring', st: M3, end: 'first' }, 'RTE-TAIL-M3N': { hw: 3.09, main: 'arm', st: M3, end: 'last' },
    'RTE-TAIL-M4G': { hw: 4.85, main: 'arm', st: M4, end: 'first' }, 'RTE-TAIL-M4L': { hw: 3.05, main: 'ring', st: M4, end: 'last' } };
  const mainY = (r: any, x: number, z: number): number => net.roadYAt(r, x, z).y;
  // REAL distance of a point from the built centre line of a main road (the ring is slightly curved: the frame line d / u is not the road)
  const distTo = (r: any, x: number, z: number): number => { let b = 1e9; for (let k = 0; k + 1 < r.xs.length; k++) { const vx = r.xs[k + 1] - r.xs[k], vz = r.zs[k + 1] - r.zs[k], l2 = vx * vx + vz * vz || 1, q = Math.max(0, Math.min(1, ((x - r.xs[k]) * vx + (z - r.zs[k]) * vz) / l2)); b = Math.min(b, Math.hypot(x - r.xs[k] - q * vx, z - r.zs[k] - q * vz)); } return b; };
  P(`TAILS built: ${tails.map(t => `${t.name} ${t.length.toFixed(0)} m`).join(', ') || 'none'}`);
  CHK('T0 exactly the four tails RTE-TAIL-M3S / M3N / M4G / M4L are built', tails.length === 4 && Object.keys(want).every(k => tails.some(t => t.name === k)), tails.map(t => t.name).join(', '));
  let tipLvl = 0, tipGap = 1e9, tipGapMax = 0, endXZ = 0, endY = 0, wOk = 0, lenMax = 0, sideBad = 0; const info: string[] = [];
  for (const t of tails) {
    const w = want[t.name]; if (!w) continue; const rd = net.roads[t.roadId], n = rd.xs.length; lenMax = Math.max(lenMax, t.length);
    // which end is the tip (beside the main road) and which is the bridge end
    const sB = w.end === 'first' ? (w.st.name === 'M3' ? 0 : 0) : w.st.x.length - 1, bx = w.st.x[sB], bz = w.st.z[sB], by = w.st.deckY[sB];
    const dEnd = (i: number): number => Math.hypot(rd.xs[i] - bx, rd.zs[i] - bz); const iB = dEnd(0) < dEnd(n - 1) ? 0 : n - 1, iT = iB === 0 ? n - 1 : 0;
    endXZ = Math.max(endXZ, dEnd(iB)); endY = Math.max(endY, Math.abs(rd.ys[iB] - by));
    wOk += Math.abs(rd.halfWidth - w.hw) < 1e-6 ? 1 : 0;
    const main = w.main === 'ring' ? ring : armR; const tx = rd.xs[iT], tz = rd.zs[iT];
    tipLvl = Math.max(tipLvl, Math.abs(rd.ys[iT] - mainY(main, tx, tz)));
    const uu = uOfP(tx, tz), dd = dOf(tx, tz);
    const clrTip = distTo(main, tx, tz) - main.halfWidth - rd.halfWidth;
    const flushDev = Math.abs(clrTip + 2 * rd.halfWidth);   // STEP 5: the tip lies fully INSIDE the main pavement, its outer edge flush with the paved edge (clearance = -2 * half width)
    tipGap = Math.max(tipGap === 1e9 ? 0 : tipGap, flushDev); tipGapMax = Math.max(tipGapMax, clrTip);
    const ub = uOfP(bx, bz), db = dOf(bx, bz);   // side of the main road: judged at the bridge end (at the tip the tail is inside the pavement)
    if (w.main === 'ring' ? db >= 0 : (w.st.name === 'M3' ? ub < 0 : ub > 0)) sideBad++;
    info.push(`${t.name}: tip u ${uu.toFixed(1)} d ${dd.toFixed(1)} y ${rd.ys[iT].toFixed(2)}, bridge end y ${rd.ys[iB].toFixed(2)}`);
  }
  CHK('T1 the tip of each tail has the level of the main road (ring M8 / arm J1-E) next to it (<= 5 cm)', tails.length === 4 && tipLvl <= 0.05, `worst ${tipLvl.toFixed(3)} m; ${info.join(' | ')}`);
  CHK('T2 (STEP 5, merge) the tip of each tail lies fully inside the main pavement, its outer edge flush with the paved edge (<= 0.1 m; real distance from the built centre line)', tails.length === 4 && tipGap <= 0.1, `worst deviation from flush ${tipGap.toFixed(2)} m`);
  CHK('T3 the other end of each tail starts exactly at the bridge end (plan <= 0.1 m, level <= 5 cm)', tails.length === 4 && endXZ <= 0.1 && endY <= 0.05, `plan ${endXZ.toFixed(3)} m, level ${endY.toFixed(3)} m`);
  CHK('T4 road width of each tail = the deck width at that end (9.7 / 6.18 / 9.7 / 6.1 m)', tails.length === 4 && wOk === 4, `${wOk} of 4 (halfWidth ${tails.map(t => net.roads[t.roadId].halfWidth).join(' / ')})`);
  CHK('T5 each tail is on the correct side at its bridge end (M3S, M4L on ring B d < 0; M3N u > 0; M4G u < 0)', tails.length === 4 && sideBad === 0, `${sideBad} wrong`);
  CHK('T6 each tail <= 200 m long (STEP 2: convergence 50 / 50 / 70 / 150 m, plus the bridge-end lead-in)', tails.length === 4 && lenMax <= 200, `longest ${lenMax.toFixed(0)} m`);
  // T7 no overlap of a tail with any other road (existing roads, slips, other tails) except the own bridge end: centre line distance >= sum of half widths - 0.05, sampled every point of the tail vs every segment
  let minSep = 1e9, sepAt = '';
  for (const t of tails) {
    const rd = net.roads[t.roadId];
    for (const o of net.roads) {
      if (o === rd || o.name === 'M8' || o.name === 'J1-E') continue;                     // the main roads: T2 / L9a
      for (let i = 0; i < rd.xs.length; i++) for (let k = 0; k + 1 < o.xs.length; k++) {
        const ax = o.xs[k], az = o.zs[k], dx = o.xs[k + 1] - ax, dz = o.zs[k + 1] - az, l2 = dx * dx + dz * dz; if (l2 < 1e-9) continue;
        const q = Math.min(1, Math.max(0, ((rd.xs[i] - ax) * dx + (rd.zs[i] - az) * dz) / l2)); const dist = Math.hypot(ax + dx * q - rd.xs[i], az + dz * q - rd.zs[i]);
        if (dist > 60) continue; const gap = dist - rd.halfWidth - o.halfWidth; if (gap < minSep) { minSep = gap; sepAt = `${t.name} / ${o.name}`; }
      }
    }
  }
  CHK('T7 no tail overlaps any road other than the main road it joins (edge gap >= 0 m, roads closer than 60 m checked)', minSep >= 0, `smallest edge gap ${minSep.toFixed(2)} m (${sepAt})`);
  // T8 tail edge vs the paved edge of the ring / arm along the whole tail (>= 0.29 m; ring paved half 22.1 on both sides, arm 22.1)
  // STEP 5: outside the last 30 m of tail length from the tip (the merge zone is 25 m along the main road) the edge stays >= 0.29 m off the paved edge; in the merge zone it moves INTO the pavement (never beyond flush, never back out)
  let minE = 1e9, eAt = '', zoneBad = 0, zoneN = 0, zoneIn = 0, backOut = 0;
  for (const t of tails) {
    const w = want[t.name]; if (!w) continue; const rd = net.roads[t.roadId], main = w.main === 'ring' ? ring : armR, n = rd.xs.length;
    const iT = Math.hypot(rd.xs[0] - w.st.x[w.end === 'first' ? 0 : w.st.x.length - 1], rd.zs[0] - w.st.z[w.end === 'first' ? 0 : w.st.x.length - 1]) < 1e-3 ? n - 1 : 0;   // tip = the end that is not the bridge end
    const step = iT === 0 ? 1 : -1; let arc = 0, prevC = -1e9;
    for (let k = 0, i = iT; k < n; k++, i += step) {
      if (k > 0) arc += Math.hypot(rd.xs[i] - rd.xs[i - step], rd.zs[i] - rd.zs[i - step]);
      const g = distTo(main, rd.xs[i], rd.zs[i]) - main.halfWidth - rd.halfWidth;      // + beside, - inside
      if (arc > 30 + 1e-6) { if (g < minE) { minE = g; eAt = `${t.name} pt ${i}`; } }
      else { zoneN++; if (g > 0.6 || g < -2 * rd.halfWidth - 0.1) zoneBad++; if (g < 0) zoneIn++; if (g < prevC - 0.05 && prevC > -1e8) backOut++; prevC = g; }
    }
  }
  CHK('T8 along each tail (more than 30 m of tail length from the tip) the lane edge is >= 0.29 m outside the REAL paved edge of the main road it joins (built centre line + halfWidth)', minE >= 0.29, `smallest ${minE.toFixed(2)} m (${eAt})`);
  CHK('T8b in the merge zone (last 30 m of tail length = 25 m along the main road) every tail lane edge is between flush-inside and 0.6 m beside the paved edge (the last metres of the old smooth convergence are included), and it never moves back out toward the tip', zoneBad === 0 && backOut === 0 && zoneN > 0 && zoneIn > 0, `${zoneN} points, ${zoneBad} outside the range, ${backOut} moving back out, ${zoneIn} inside the pavement`);
  // T9 piers of the OTHER ramp / own ramp: the tail edge >= 2.0 m from every pier centre of the ramp it does NOT belong to (the own ramp's bridge ends at the tail)
  let tp = 1e9, tpAt = '';
  for (const t of tails) { const w = want[t.name]; if (!w) continue; const rd = net.roads[t.roadId]; for (const st of RTE_RAMP_STRUCTS as any[]) { if (st.name === w.st.name) continue; for (const pr of st.piers as any[]) for (let i = 0; i + 1 < rd.xs.length; i++) { const ax = rd.xs[i], az = rd.zs[i], dx = rd.xs[i + 1] - ax, dz = rd.zs[i + 1] - az, l2 = dx * dx + dz * dz; const q = l2 > 0 ? Math.min(1, Math.max(0, ((pr.x - ax) * dx + (pr.z - az) * dz) / l2)) : 0; const g = Math.hypot(pr.x - (ax + dx * q), pr.z - (az + dz * q)) - rd.halfWidth - 1.5; if (g < tp) { tp = g; tpAt = `${t.name} / ${st.name} pier d ${dOf(pr.x, pr.z).toFixed(0)} u ${uOfP(pr.x, pr.z).toFixed(0)}`; } } } }
  CHK('T9 pier clearance: tail edge >= 0.5 m from the column face of every pier of the other ramp (column half 1.5 m)', tp >= 0.5, `smallest ${tp.toFixed(2)} m (${tpAt})`);
}
P('');
P("NOT RUN  game (look, traffic on the slips and tails, minimap), lane tapers (the slips and the merge tails start and end beside the main road, constant width, no real taper: the road system has constant width), the long stem lanes (not built in the simple version), the viaduct wedge strips (RteMesh, unchanged), S2A retaining wall, signs, gore pads, ground under the piers, Validate.ts, npm run build, full tsc.");
P('ASSUMED  ramp road halfWidth 2.75 m (lane 5.5 m = one-lane ramp with shoulders, moved 1.4 m outward from the pavement edges, gravel shoulder of the ramp class beside it), V 40 km/h, parts inside the arm viaduct window d 160..271 are carried by the widened viaduct (RteMesh), not by a ground road.');
P(`\nSUMMARY: ${fails === 0 ? 'ALL PASS' : 'FAIL'} (${lines.filter(l => l.startsWith('PASS')).length} PASS, ${fails} FAIL)`);
writeFileSync(`${dir}/RTE_LANES.txt`, lines.join('\n') + '\n');
