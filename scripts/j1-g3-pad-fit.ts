// STEP J1-g3 (headless): the pad plane of the OPEN ground interchange. Fits ONE plane (same format as Config.roads.junctionJ1) under the paved open star.
// Run: npx tsx scripts/j1-g3-pad-fit.ts docs     writes docs/j1g3_pad.json + docs/STEPJ1G3_PAD.txt. The old fit (disc R 60 m, J1-c1) stays in docs/j1c1.json (the arm profile tools read it).
import { mkdirSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_SITE, toWorld } from '../src/roads/junction/OpenJ1Geometry';
import { OPEN_PARAMS, deriveOpen } from '../src/roads/junction/OpenJ1Geometry';
import { J1_SA } from '../src/roads/junction/GroundJ1Terrain';

const out = process.argv[2] ?? 'docs';
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (e: number, n: number): number => { const p = toWorld([e, n]); gen.sampleNatural(p.x, p.z, sc); return sc.h; };
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };

const D = deriveOpen();
const CX = D.Cx, RI = OPEN_PARAMS.slipR - OPEN_PARAMS.W / 2; // star = square +-CX minus 4 corner disks (island side radius RI around (+-CX, +-CX))
const inStar = (e: number, n: number): boolean => Math.abs(e) <= CX && Math.abs(n) <= CX && Math.hypot(Math.abs(e) - CX, Math.abs(n) - CX) >= RI;
const GMAX = 0.02, GMIN = 0.003; // junction surface rule of J1-c: 0.3 % .. 2 % (the plane grade)
const SIDE = 3;                  // embankment slope 1 : 3
const STEP = 4;

// least squares plane h = y0 + a*e + b*n over the paved star
let n = 0, se = 0, sn = 0, sh = 0, see = 0, snn = 0, sen = 0, seh = 0, snh = 0, hmin = 1e9, hmax = -1e9;
const pts: Array<[number, number, number]> = [];
for (let e = -CX; e <= CX + 1e-9; e += STEP) for (let nn = -CX; nn <= CX + 1e-9; nn += STEP) {
  if (!inStar(e, nn)) continue;
  const h = ground(e, nn); pts.push([e, nn, h]);
  n++; se += e; sn += nn; sh += h; see += e * e; snn += nn * nn; sen += e * nn; seh += e * h; snh += nn * h;
  hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
}
const A = [[n, se, sn], [se, see, sen], [sn, sen, snn]], B = [sh, seh, snh];
const det = (m: number[][]): number => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const rep = (c: number): number[][] => A.map((r, i) => r.map((v, j) => (j === c ? B[i] : v)));
const Dt = det(A), aL = det(rep(1)) / Dt, bL = det(rep(2)) / Dt;
const g0 = Math.hypot(aL, bL);
let a = aL, b = bL;
if (g0 > GMAX) { a *= GMAX / g0; b *= GMAX / g0; } else if (g0 < GMIN) { const u = g0 > 1e-9 ? [aL / g0, bL / g0] : [1, 0]; a = u[0] * GMIN; b = u[1] * GMIN; }
let mr = 0; for (const [e, nn, h] of pts) mr += h - (a * e + b * nn); const y = mr / n; // cut = fill (mean residual 0)
let dmax = -1e9, dmin = 1e9, vf = 0, vc = 0;
for (const [e, nn, h] of pts) { const d = y + a * e + b * nn - h; dmax = Math.max(dmax, d); dmin = Math.min(dmin, d); if (d > 0) vf += d * STEP * STEP; else vc -= d * STEP * STEP; }
// the whole pad square +-SA (corner islands outside the arcs lie on it, too)
let boxMax = 0, boxMin = 0;
for (let e = -J1_SA; e <= J1_SA; e += STEP) for (let nn = -J1_SA; nn <= J1_SA; nn += STEP) { const d = y + a * e + b * nn - ground(e, nn); boxMax = Math.max(boxMax, d); boxMin = Math.min(boxMin, d); }
const EMB_MIN = 30; // the arm lane zones carry up to 5.2 m of fill (approved arm profiles): a smoothstep skirt has its steepest slope at 1.5 x height / emb, 1:3 needs emb >= 4.5 x fill = 24 m, so 30 m
const emb = Math.max(EMB_MIN, Math.ceil(Math.max(boxMax, -boxMin) * SIDE));
const w = toWorld([0, 0]);
const yw = (J1_SITE.yawDeg * Math.PI) / 180, eAx = { x: Math.cos(yw), z: Math.sin(yw) }, nAx = { x: Math.sin(yw), z: -Math.cos(yw) };
const aW = a * eAx.x + b * nAx.x, bW = a * eAx.z + b * nAx.z;

P(`J1-g3 PAD FIT   J1 = (${J1_SITE.x}, ${J1_SITE.z}), yaw ${J1_SITE.yawDeg} deg, paved open star (square +-${CX.toFixed(1)} m minus 4 corner disks R ${RI.toFixed(1)} m), ${n} samples every ${STEP} m`);
P(`natural ground under the star: ${hmin.toFixed(2)} .. ${hmax.toFixed(2)} m  (range ${(hmax - hmin).toFixed(2)} m)`);
P(`free fit grade ${(g0 * 100).toFixed(2)} %, used grade ${(Math.hypot(a, b) * 100).toFixed(2)} %  (limit ${(GMAX * 100).toFixed(0)} %, minimum for drainage ${(GMIN * 100).toFixed(1)} %)`);
P(`pad centre height y = ${y.toFixed(4)} m, world plane a = ${aW.toFixed(7)} b = ${bW.toFixed(7)}`);
P(`under the star: max fill ${dmax.toFixed(2)} m, max cut ${(-dmin).toFixed(2)} m, fill ${vf.toFixed(0)} m3, cut ${vc.toFixed(0)} m3`);
P(`under the whole pad square +-${J1_SA} m: max fill ${boxMax.toFixed(2)} m, max cut ${(-boxMin).toFixed(2)} m -> embankment ${emb} m (slope 1:${SIDE})`);
P(`Config.roads.junctionJ1 = { x: ${w.x}, z: ${w.z}, yawDeg: ${J1_SITE.yawDeg}, y: ${y}, a: ${aW}, b: ${bW}, rCore: ${J1_SA}, emb: ${emb} }`);
writeFileSync(`${out}/j1g3_pad.json`, JSON.stringify({ site: J1_SITE, pad: { x: w.x, z: w.z, yawDeg: J1_SITE.yawDeg, y, a: aW, b: bW, rCore: J1_SA, emb }, starMaxFill: dmax, starMaxCut: -dmin, boxMaxFill: boxMax, boxMaxCut: -boxMin }, null, 1));
writeFileSync(`${out}/STEPJ1G3_PAD.txt`, lines.join('\n') + '\n');
