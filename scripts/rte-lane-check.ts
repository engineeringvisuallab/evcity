// STEP RE-9 (ground lanes) CHECK, headless, REAL game data (tsx): flag OFF vs ON of Config.roads.junctionRteLanes.
// Run: npx tsx scripts/rte-lane-check.ts docs   Writes docs/RTE_LANES.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RTE_SLIP_DATA } from '../src/roads/junction/RteGeometry';
import { RTE_STRUCT_FRAME as FR } from '../src/roads/junction/RteStructData';

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
const rep = net.rteLaneReport as { name: string; roadId: number; length: number; points: number }[];
P(`RE-9 GROUND LANES: roads OFF ${sOff.roads.size}, ON ${sOn.roads.size}; built ${rep.map(r => `${r.name} ${r.length.toFixed(0)} m / ${r.points} pts`).join(', ')}`);
CHK('L0 the switch builds at least the A2S and S2A ground parts', rep.length >= 2, `${rep.length} roads`);

// L1 water first (sc.water > sc.h on the finished ground, centre and +-3 / +-6 m)
let wet = 0;
for (const r of rep) { const rd = net.roads[r.roadId]; for (let i = 0; i < rd.xs.length; i++) for (const o of [-6, -3, 0, 3, 6]) { gen.sample(rd.xs[i] + rd.nx[i] * o, rd.zs[i] + rd.nz[i] * o, sc); if (sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h) wet++; } }
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
    if (vv > 40) { const gap = Math.abs(uu) - 1.825 - 22.1; if (gap < -0.1) { overlap++; ovWorst = Math.min(ovWorst, gap); if (overlap < 5) P(`  overlap ${r.name} pt ${i} d ${vv.toFixed(0)} u ${uu.toFixed(2)}`); } }
    if (!q) { stemPts++; by = net.roadYAt(arm, FR.J[0] - vv * FR.ln[0], FR.J[1] - vv * FR.ln[1]).y; } else
    for (let k = 0; k + 1 < q.pts.length; k++) { const ax = q.pts[k][0], az = q.pts[k][1], bx = q.pts[k + 1][0], bz = q.pts[k + 1][1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; const t = Math.min(1, Math.max(0, ((rd.xs[i] - ax) * dx + (rd.zs[i] - az) * dz) / l2)); const d = Math.hypot(ax + dx * t - rd.xs[i], az + dz * t - rd.zs[i]); if (d < bd) { bd = d; by = q.ys[k] + (q.ys[k + 1] - q.ys[k]) * t; } }
    worst = Math.max(worst, Math.abs(rd.ys[i] - by));
    gen.sample(rd.xs[i], rd.zs[i], sc); const e = Math.abs(sc.h - rd.ys[i]); const dd = dOf(rd.xs[i], rd.zs[i]);
    if (Math.abs(dd - 160) < 15 || Math.abs(dd - 271) < 15) { if (e > 0.15) { nEnd++; endWorst = Math.max(endWorst, e); } } else if (e > gw) { gw = e; gl = `${r.name} pt ${i}`; }
  }
}
CHK('L4 lane surface level = RE-3 slip data level / the J1-E arm level on the stem axis (<= 1 cm)', worst <= 0.011, `worst ${worst.toFixed(3)} m, ${stemPts} stem lane points`);
CHK('L7 no ground lane lies on the arm pavement (lane inner edge >= 22.0 m from the stem axis where d > 40)', overlap === 0, `${overlap} points, worst ${ovWorst.toFixed(2)} m`);
// L8 (simple version, 2026-11-22: user 'make it simple'): only the two short slips; each end lies right beside the main road (ring: |d| <= 26 m, arm: |u| <= 26.5 m) and each is <= 250 m long; no long stem lane is built
const uOfP = (x: number, z: number): number => (x - FR.J[0]) * FR.t[0] + (z - FR.J[1]) * FR.t[1];
let l8bad = 0; const l8 = rep.map(r => { const rd = net.roads[r.roadId], n = rd.xs.length; const beside = (i: number): boolean => Math.abs(dOf(rd.xs[i], rd.zs[i])) <= 26 || Math.abs(uOfP(rd.xs[i], rd.zs[i])) <= 26.5; const ok = beside(0) && beside(n - 1) && r.length <= 250; if (!ok) l8bad++; return `${r.name} ${r.length.toFixed(0)} m start d ${dOf(rd.xs[0], rd.zs[0]).toFixed(0)} u ${uOfP(rd.xs[0], rd.zs[0]).toFixed(1)}, end d ${dOf(rd.xs[n - 1], rd.zs[n - 1]).toFixed(0)} u ${uOfP(rd.xs[n - 1], rd.zs[n - 1]).toFixed(1)}`; });
CHK('L8 simple: only the A2S and S2A short slips, both ends beside the main road, each <= 250 m, no stem lane', rep.length === 2 && rep.some(r => r.name === 'RTE-A2S') && rep.some(r => r.name === 'RTE-S2A') && l8bad === 0, l8.join('; '));
CHK('L5 finished ground on the lane centre line within 0.15 m of the lane level (the lane is carved / filled), except within 15 m of an arm viaduct window edge', gw <= 0.15, `worst ${gw.toFixed(2)} m (${gl})`);
P(`INFO  ${nEnd} lane points within 15 m of a viaduct window edge have ground up to ${endWorst.toFixed(2)} m below the lane (the lane is on the approach embankment of the arm viaduct; the approach slab of the widened viaduct is RteMesh)`);

// L6 grade
let mg = 0; for (const r of rep) { const rd = net.roads[r.roadId]; for (let i = 1; i < rd.xs.length; i++) { const dl = Math.hypot(rd.xs[i] - rd.xs[i - 1], rd.zs[i] - rd.zs[i - 1]); if (dl > 0.01) mg = Math.max(mg, Math.abs(rd.ys[i] - rd.ys[i - 1]) / dl); } }
CHK('L6 max grade of the lanes <= 5 %', mg <= 0.05, `${(mg * 100).toFixed(2)} %`);

P('');
P("NOT RUN  game (look, traffic on the slips, minimap), lane tapers (the slips start and end beside the main road without a taper, constant 3.65 m), the long stem lanes (not built in the simple version), the viaduct wedge strips (RteMesh, unchanged), S2A retaining wall, signs, gore pads, ground under the piers, Validate.ts, npm run build, full tsc.");
P('ASSUMED  ramp road halfWidth 1.825 m (lane 3.65 m, gravel shoulder of the ramp class beside it), V 40 km/h, parts inside the arm viaduct window d 160..271 are carried by the widened viaduct (RteMesh), not by a ground road.');
P(`\nSUMMARY: ${fails === 0 ? 'ALL PASS' : 'FAIL'} (${lines.filter(l => l.startsWith('PASS')).length} PASS, ${fails} FAIL)`);
writeFileSync(`${dir}/RTE_LANES.txt`, lines.join('\n') + '\n');
