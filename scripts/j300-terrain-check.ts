// J6 TERRAIN CHECK (headless). Reads docs/J300_TERRAIN.json (scripts/j300-terrain-gen.ts), docs/J300_GEOM.json and the real game terrain / rail (read only).
// Run: npx tsx scripts/j300-terrain-check.ts docs     Writes docs/J300_TERRAIN.txt. PASS / FAIL / INFO; what is not run is printed as NOT RUN.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const dir = process.argv[2] ?? 'docs';
const T: any = JSON.parse(readFileSync(`${dir}/J300_TERRAIN.json`, 'utf8'));
const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const f1 = (v: number): string => v.toFixed(1);
const g: any = new TerrainGenerator(Config.world.seed); const sc = g.makeSample();
const wet = (x: number, z: number): boolean => { g.sampleNatural(x, z, sc); return Number.isFinite(sc.water) && sc.h < sc.water; };
const rail: { xs: ArrayLike<number>; zs: ArrayLike<number> }[] = (g.rail.edges as any[]).map((e) => ({ xs: e.xs, zs: e.zs }));
const distRail = (x: number, z: number): number => { let b = 1e9; for (const e of rail) for (let i = 0; i < e.xs.length - 1; i++) { const ax = e.xs[i], az = e.zs[i], bx = e.xs[i + 1], bz = e.zs[i + 1]; const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz; let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz)); if (d < b) b = d; } return b; };
P('J6 TERRAIN CHECK (headless, real game terrain and rail read only, nothing in the game changed)');
P(`rules: fill > 4 m = MSE wall (toe 0.5 + 0.2 H), fill <= 4 m = slope 1:2, cut slope 1:2 (no benches), existing ring embankment is not new fill; deck ${T.platform.deckY} m`);
const pts: { id: string; x: number; z: number }[] = [];
for (const t of T.platform.toe) pts.push({ id: 'platform', x: t[4], z: t[5] });
for (const k of ['R6', 'R4']) for (const r of T.arms[k].rows) { pts.push({ id: k, x: r[7], z: r[8] }); pts.push({ id: k, x: r[11], z: r[12] }); }
for (const rp of T.ramps) for (const t of rp.toe) if (t[2] > 0) pts.push({ id: rp.id, x: t[3], z: t[4] });
P(''); P('PLATFORM (roundabout deck, r 62)');
P(`INFO  max fill at the circle edge ${T.platform.maxFill} m (J2 assumed MSE walls up to 16.0 m: ${T.platform.maxFill > 16 ? 'higher by ' + f1(T.platform.maxFill - 16) + ' m, wall design in J7' : 'inside'}); new fill about ${T.platform.fillVolume} m3 (underpass strip and the existing ring embankment excluded; J2 rough 198 334 m3 counted everything above natural)`);
let tmax = 0; for (const t of T.platform.toe) tmax = Math.max(tmax, t[1]); P(`INFO  wall toe radius up to ${f1(tmax)} m (J2: 66 m at H 16)`);
for (const k of ['R6', 'R4']) {
  const A = T.arms[k]; P(''); P(`ARM ${k} (${k === 'R6' ? 'M6' : 'M4'} top half width ${A.top} m, length ${A.length} m, ROW half ${A.rowHalf} m)`);
  let toeFill = 0, toeCut = 0; for (const r of A.rows) for (const [h, toe] of [[r[5], r[6]], [r[9], r[10]]]) { if (h > 0) toeFill = Math.max(toeFill, toe); else if (h < 0) toeCut = Math.max(toeCut, toe); }
  CHK(`fill toe inside half ROW ${A.rowHalf} m`, toeFill <= A.rowHalf, `fill toe at ${f1(toeFill)} m from the centre line, max fill ${A.fillMax} m`);
  CHK('cut <= 12 m (H7)', A.cutMax <= 12, `max cut ${A.cutMax} m at the 5 m rows` + (A.cutMax > 12 ? ' (J4 FAIL stays: ' + (A.cutVolume / 1e6).toFixed(2) + ' million m3 with plain 1:2 slopes and no benches)' : ''));
  if (A.cutMax > 0) { if (toeCut > A.rowHalf) P(`INFO  cut slope tops reach ${f1(toeCut)} m from the centre line, ROW half is ${A.rowHalf} m: land outside the ROW is needed (user decision), benches / flatter slopes would take even more`); else P(`INFO  cut slope tops stay inside the ROW (${f1(toeCut)} m)`); }
  P(`INFO  fill about ${A.fillVolume} m3, cut about ${A.cutVolume} m3 (rough end-area, 5 m stations)`);
}
P(''); P('RAMPS (outer toe from the J5 rows)');
for (const r of T.ramps) CHK(`${r.id} toe inside half ROW 45.72 m`, r.toeMaxV <= 45.72, `toe at |v| ${r.toeMaxV} m, max fill ${r.fillMax} m, volume ${r.fillVolume} m3`);
P(''); P('SITE (all toe lines)');
const dists: Record<string, number> = {}; let wets = 0; const wetBy: Record<string, number> = {};
for (const p of pts) { const d = distRail(p.x, p.z); dists[p.id] = Math.min(dists[p.id] ?? 1e9, d); if (wet(p.x, p.z)) { wets++; wetBy[p.id] = (wetBy[p.id] ?? 0) + 1; } }
for (const id of Object.keys(dists)) CHK(`${id}: rail clearance of the toe >= 30 m (H6)`, dists[id] >= 30, `closest rail point ${f1(dists[id])} m`);
CHK('no toe point in water', wets === 0, wets ? JSON.stringify(wetBy) : `${pts.length} toe points dry`);
// R6 / R4 centre line against the rail: does an arm CROSS the railway? (J4 did not run this)
for (const k of ['R6', 'R4']) { let bd = 1e9, bs = 0, bl = 0, br = NaN; for (const r of T.arms[k].rows) for (const e of (g.rail.edges as any[])) for (let i = 0; i < e.xs.length - 1; i++) { const dx = e.xs[i + 1] - e.xs[i], dz = e.zs[i + 1] - e.zs[i]; const L2 = dx * dx + dz * dz; let t = L2 > 0 ? ((r[1] - e.xs[i]) * dx + (r[2] - e.zs[i]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(r[1] - e.xs[i] - t * dx, r[2] - e.zs[i] - t * dz); if (d < bd) { bd = d; bs = r[0]; bl = r[3]; br = e.design ? e.design[t < 0.5 ? i : i + 1] : NaN; } }
  if (bd < 30) P(`FAIL  ${k} arm CROSSES / touches the railway: centre line only ${f1(bd)} m from the rail at arm station ${f1(bs)} m (arm level ${f1(bl)} m, rail design level ${Number.isFinite(br) ? f1(br) : 'n/a'} m): the rail is ${Number.isFinite(br) ? (br > bl ? f1(br - bl) + ' m ABOVE the arm (arm would pass under it)' : f1(bl - br) + ' m below the arm') : 'at an unknown level'}; the 30 m rule is not met and a structure decision is needed (J4 NOT RUN item)`), fails++; else P(`INFO  ${k} arm centre line stays ${f1(bd)} m from the rail`); }
// arms vs ramps: toe lines do not overlap
const near = (a: string[], b: string[]): number => { let m = 1e9; for (const p of pts) if (a.includes(p.id)) for (const q of pts) if (b.includes(q.id)) m = Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)); return m; };
const rp = near(['R6'], ['E-out', 'E-in', 'W-out', 'W-in']).toFixed(1), r4 = near(['R4'], ['E-out', 'E-in', 'W-out', 'W-in']).toFixed(1);
CHK('arm toes do not touch the ramp toes (>= 3 m apart)', Number(rp) >= 3 && Number(r4) >= 3, `R6 to ramps ${rp} m, R4 to ramps ${r4} m (toe points only)`);
P(''); const t = T.totals;
P(`INFO  TOTAL new fill about ${t.fillTotal} m3 (platform ${t.platform}, R6 ${t.R6}, R4 ${t.R4fill}, ramps ${t.ramps}); J2 rough 441 475 m3, J1-B 855 000 m3. R4 CUT about ${t.R4cut} m3 (not in the fill total; spoil could feed the fill if it is hauled, NOT planned)`);
P('NOT RUN: drainage, MSE wall type and design, slope stability / benches of the R4 cut, other roads and buildings in the footprint (R1 list), trees, groundwater, game carve (J9).');
P(''); P(`${fails} FAIL`); writeFileSync(`${dir}/J300_TERRAIN.txt`, out.join('\n') + '\n');
