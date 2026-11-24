// J5 RAMP CHECK (headless). Reads docs/J300_RAMPS.json (written by scripts/j300-ramp-gen.ts), docs/J300_GEOM.json (J4) and the real game terrain / rail (read only).
// Run: npx tsx scripts/j300-ramp-check.ts docs     Writes docs/J300_RAMPS.txt. Every line is PASS / FAIL / INFO; what is not run is printed as NOT RUN.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { minRadius } from '../src/interchange/Standards';

const dir = process.argv[2] ?? 'docs';
const R: any = JSON.parse(readFileSync(`${dir}/J300_RAMPS.json`, 'utf8')); const G: any = JSON.parse(readFileSync(`${dir}/J300_GEOM.json`, 'utf8'));
const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const U0 = G.frame.u0 as number, DECK = G.frame.deckY as number, yaw = G.frame.yaw as number, ux = Math.cos(yaw), uz = Math.sin(yaw);
const toW = (u: number, v: number): { x: number; z: number } => ({ x: G.frame.ox + u * ux + v * uz, z: G.frame.oz + u * uz - v * ux });
const ringTab: number[][] = R.ringTable; const ringY = (uL: number): number => { const t = (uL + 700) / 5; const i = Math.floor(t); if (i < 0 || i >= ringTab.length - 1) return NaN; return ringTab[i][1] + (t - i) * (ringTab[i + 1][1] - ringTab[i][1]); };
// row = [u, v, headingDeg, sigma, level, natural, width, eAu, eAv, eBu, eBv, onArc, wet]
const RMIN = minRadius(50); const KMH2_PER_M = 31.4 /* (km/h)^2 per m of aux lane, J3 basis: 72 m -> 69 km/h */;
P('J5 RAMP CHECK (headless, real game terrain and rail read only, nothing in the game changed)');
P(`frame O (${G.frame.ox}, ${G.frame.oz}), u0 ${U0}, deck ${DECK} m, ramp V50, ring outer lane edge ${R.constants.ringEdge}, aux lane ${R.constants.aux}, S-curve R ${R.constants.sShiftR} (length ${R.constants.sShiftLen} m), lane drop ${R.constants.laneDrop} m`);
P(`nose per side (X = |u| from the centre, J1 had 180): ${JSON.stringify(R.constants.noseSide)}  K crest ${R.constants.K_CREST_V50}, K sag ${R.constants.K_SAG_V50} (5 % downhill braking distance, J3 basis)`);
const g: any = new TerrainGenerator(Config.world.seed);
const rail: { xs: ArrayLike<number>; zs: ArrayLike<number> }[] = (g.rail.edges as any[]).map((e) => ({ xs: e.xs, zs: e.zs }));
const distRail = (x: number, z: number): number => { let b = 1e9; for (const e of rail) for (let i = 0; i < e.xs.length - 1; i++) { const ax = e.xs[i], az = e.zs[i], bx = e.xs[i + 1], bz = e.zs[i + 1]; const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz; let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz)); if (d < b) b = d; } return b; };
for (const r of R.ramps) {
  const rows: any[][] = r.rows; const leg = G.legs.find((l: any) => l.id === r.id); const q = r.type === 'merge' ? leg.exit : leg.entry;
  P(''); P(`${r.id} (${r.type}, nose X ${r.noseX}, ring u ${r.noseRingU}, ${rows.length} rows, arc ${r.arcLen} m)`);
  // 1) join with J4
  const j4p = r.type === 'merge' ? q.leave : q.yield; const first = rows[0];
  CHK('starts exactly on the J4 circle point (r = 62)', Math.hypot(first[0] - j4p[0], first[1] - j4p[1]) < 0.05 && Math.abs(Math.hypot(first[0], first[1]) - 62) < 0.05, `${first[0]}, ${first[1]}`);
  const ia = rows.findIndex((x, i) => i > 0 && x[11] === 0); const aEnd = r.type === 'merge' ? q.arcEnd : q.arcStart; const gap = Math.hypot(rows[ia][0] - aEnd[0], rows[ia][1] - aEnd[1]);
  CHK('J4 arc ends on the ramp straight at v = +-30', Math.abs(Math.abs(rows[ia - 1][1]) - 30) < 0.01 && Math.abs(rows[ia - 1][0] - aEnd[0]) < 0.05 && gap < 2.5, `arc end ${rows[ia - 1][0]}, ${rows[ia - 1][1]}, next row ${f2(gap)} m away`);
  // 2) plan: radius of the ring-side edge (the retained lane) after the J4 arc
  let rmin = 1e9; for (let i = ia + 1; i < rows.length - 1; i++) { const a = [rows[i - 1][7], rows[i - 1][8]], b = [rows[i][7], rows[i][8]], c = [rows[i + 1][7], rows[i + 1][8]]; const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]); const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); if (area2 > 1e-6 && rows[i][6] > 0.3) rmin = Math.min(rmin, (ab * bc * ca) / (2 * area2)); }
  CHK(`plan radius (ring-side lane edge = path of the retained lane) >= R min V50 (${f1(RMIN)} m)`, rmin >= RMIN, `min ${f1(rmin)} m`);
  const sStart = r.noseX - R.constants.sShiftLen; CHK('S-curve starts after the J4 arc', sStart >= Math.abs(aEnd[0]), `S starts at X ${f1(sStart)}, arc ends at X ${f1(Math.abs(aEnd[0]))}`);
  let inside = 0; for (const x of rows) if (x[0] * r.d > 0 && Math.abs(x[8]) < R.constants.ringEdge - 0.011 && x[11] === 0) inside++;
  CHK('ramp never inside the ring (ring-side edge |v| >= 19.1 m after the arc)', inside === 0, `${inside} rows inside`);
  // 3) profile
  CHK('level at the circle edge = deck 35.3, flat', Math.abs(rows[0][4] - DECK) < 0.011 && Math.abs(rows[1][4] - DECK) < 0.02, `${rows[0][4]}, next ${rows[1][4]}`);
  const iN = rows.findIndex((x) => Math.abs(x[0]) >= r.noseX); const yN = rows[iN][4], yR = ringY(r.noseU);
  CHK('nose level = ring level (G1)', Math.abs(yN - yR) < 0.06, `ramp ${f2(yN)} vs ring ${f2(yR)}`);
  const sl = (rows[iN][4] - rows[iN - 3][4]) / (rows[iN][3] - rows[iN - 3][3]) * 100;
  CHK('nose slope = ring slope (G1, tolerance 0.4 %)', Math.abs(sl - r.vert.ringSlopeNosePct) < 0.4, `ramp ${f2(sl)} %, ring ${f2(r.vert.ringSlopeNosePct)} % (outward)`);
  let gmax = 0; for (let i = 0; i < rows.length; i++) { let j = i + 1; while (j < rows.length && rows[j][3] - rows[i][3] < 6) j++; if (j >= rows.length || Math.abs(rows[j][0]) > r.noseX) break; gmax = Math.max(gmax, Math.abs(rows[j][4] - rows[i][4]) / (rows[j][3] - rows[i][3])); } // slopes over >= 6 m windows (levels are rounded to 0.01 m)
  CHK('max grade on the ramp <= 5 % (project limit)', gmax <= 0.05 + 1e-4, `max ${f2(gmax * 100)} % (design ${r.vert.grade} %)`);
  CHK(`crest L >= K x A (K ${r.vert.crestK})`, r.vert.L1 >= r.vert.crestK * r.vert.grade - 0.3, `L ${r.vert.L1} m, A ${r.vert.grade} %, needs ${f1(r.vert.crestK * r.vert.grade)} m`);
  const A2 = r.vert.grade + r.vert.ringSlopeNosePct; CHK(`sag L >= K x A (K ${r.vert.sagK})`, r.vert.L2 >= r.vert.sagK * A2 - 0.3 /* K is printed rounded to 0.01 */, `L ${r.vert.L2} m, A ${f2(A2)} %, needs ${f1(r.vert.sagK * A2)} m`);
  CHK('crest and sag do not overlap', r.vert.fits && r.vert.straight >= 0, `VPI1 ${r.vert.vpi1} m, VPI2 ${r.vert.vpi2} m, nose sigma ${r.vert.sigmaN} m, straight grade ${r.vert.straight} m`);
  // 4) merge / diverge lengths
  const room = r.d > 0 ? R.constants.waterLimitLocalU - r.noseX : -R.constants.railLimitLocalU - r.noseX;
  if (r.type === 'merge') { const vend = Math.sqrt(2500 + KMH2_PER_M * r.lane.auxLen); CHK(`merge lane + taper >= project rule ${r.lane.projectRule} m`, r.lane.total >= r.lane.projectRule - 0.01, `${r.lane.auxLen} + ${r.lane.taperLen} = ${r.lane.total} m, room ${f1(room)} m; speed at the end of the lane about ${Math.round(vend)} km/h (J3 basis)`); }
  else CHK(`diverge lane + taper >= project rule ${r.lane.projectRule} m`, r.lane.total >= r.lane.projectRule - 0.01, `${r.lane.auxLen} + ${r.lane.taperLen} = ${r.lane.total} m, room ${f1(room)} m`);
  CHK(`ramp end inside the ${r.d > 0 ? 'water' : 'rail'} limit (ring u ${r.d > 0 ? 520 : -560})`, r.d > 0 ? r.endRingU <= 520.01 : r.endRingU >= -560.01, `ends at ring u ${r.endRingU}`);
  // 5) site
  let dr = 1e9; for (const x of rows) for (const e of [[x[7], x[8]], [x[9], x[10]]]) { const w = toW(e[0], e[1]); dr = Math.min(dr, distRail(w.x, w.z)); }
  CHK('rail clearance >= 30 m (H6)', dr >= 30, `closest rail point ${f1(dr)} m from a ramp edge`);
  CHK('no surface water on the ramp', r.wetRows === 0, `${r.wetRows} of ${rows.length} rows wet`);
  CHK('embankment toe inside half ROW 45.72 m (J2)', r.toeMaxV <= 45.72, `toe at |v| = ${f1(r.toeMaxV)} m (outer edge + barrier 0.6 + wall 0.5 + 0.2 H, or slope 1:2 below 4 m)`);
  CHK('cut <= 12 m (H7)', r.cutMax <= 12, `max cut ${r.cutMax} m`);
  P(`INFO  max fill ${r.fillMax} m (> 4 m needs an MSE wall; J2 assumed walls up to 16.0 m: ${r.fillMax > 16 ? 'THIS RAMP IS HIGHER, wall design in J6 / J7' : 'inside'}), ramp embankment volume about ${r.fillVolume} m3 (rough, before the nose only; J2 rough: 25 200 m3 per ramp)`);
}
P('');
const bad = R.ramps.filter((r: any) => r.lane.total < r.lane.projectRule - 0.01).map((r: any) => r.id).join(', ');
P(`INFO  ring axis vs the straight J4 frame line: up to ${R.constants.ringAxisOffsetMax} m apart between local u -450 and +650 (levels are read at the nearest ring point, ramps follow the frame line)`);
P('INFO  W-out merge: J3 section 16 decided the exception (about 255 m); with the nose at X 240 only room - taper = ' + R.ramps.find((r: any) => r.id === 'W-out').lane.auxLen + ' m of lane exist (see handoff section 18 for the options)');
P(`LANE RULE FAILS: ${bad || 'none'}`);
P('NOT RUN: superelevation / crossfall, MSE wall design, drainage, 3D sight cones, ring crossfall at the nose (levels are on the ring axis), traffic simulation, game look (nothing is imported by the game).');
P(''); P(`${fails} FAIL`); writeFileSync(`${dir}/J300_RAMPS.txt`, out.join('\n') + '\n');
