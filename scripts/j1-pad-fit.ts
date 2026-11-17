// STEP J1-c1 (headless): where does the ground-level J1 sit on the real terrain? Fits ONE plane (PadSpec format) under the J1 box.
// Run: tsx scripts/j1-pad-fit.ts <out-dir>   writes docs/j1c1.json + STEPJ1C1_OUTPUT.txt. No arms here (arms = J1-c2..c5).
import { mkdirSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CRITERIA } from '../src/roads/standards/Criteria';
import { J1_SITE, toWorld } from '../src/roads/junction/GroundJ1Geometry';

const out = process.argv[2] ?? 'docs';
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (e: number, n: number): number => { const p = toWorld([e, n]); gen.sampleNatural(p.x, p.z, sc); return sc.h; };
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };

const R_CORE = 60;            // pad plane exact inside this radius (corner kerbs reach 53.8 m)
const GMAX = 0.03, GMIN = CRITERIA ? 0.003 : 0.003; // cross-fall of a signalised M8 crossing: 0.3 % .. 3 %
const SIDE = 3;               // embankment slope 1 : 3 (H : V)

// least squares plane h = y0 + a*e + b*n over a disc (local frame, e east, n north)
let n = 0, se = 0, sn = 0, sh = 0, see = 0, snn = 0, sen = 0, seh = 0, snh = 0, hmin = 1e9, hmax = -1e9;
const pts: Array<[number, number, number]> = [];
for (let e = -R_CORE; e <= R_CORE; e += 5) for (let nn = -R_CORE; nn <= R_CORE; nn += 5) {
  if (e * e + nn * nn > R_CORE * R_CORE) continue;
  const h = ground(e, nn); pts.push([e, nn, h]);
  n++; se += e; sn += nn; sh += h; see += e * e; snn += nn * nn; sen += e * nn; seh += e * h; snh += nn * h;
  hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
}
// solve 3x3 normal equations
const A = [[n, se, sn], [se, see, sen], [sn, sen, snn]], B = [sh, seh, snh];
const det = (m: number[][]): number => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const rep = (c: number): number[][] => A.map((r, i) => r.map((v, j) => (j === c ? B[i] : v)));
const D = det(A), y0 = det(rep(0)) / D, aL = det(rep(1)) / D, bL = det(rep(2)) / D;
const grade = Math.hypot(aL, bL);
// limit the plane grade to GMAX (keep the direction), floor to drainage minimum
let a = aL, b = bL; const g0 = grade;
if (g0 > GMAX) { a *= GMAX / g0; b *= GMAX / g0; }
else if (g0 < GMIN) { const u = g0 > 1e-9 ? [aL / g0, bL / g0] : [1, 0]; a = u[0] * GMIN; b = u[1] * GMIN; }
// re-centre so that cut = fill (mean of residual 0)
let mr = 0; for (const [e, nn, h] of pts) mr += h - (a * e + b * nn); const y = mr / n;
let cut = 0, fill = 0, dmax = -1e9, dmin = 1e9, vc = 0, vf = 0;
for (const [e, nn, h] of pts) { const d = y + a * e + b * nn - h; dmax = Math.max(dmax, d); dmin = Math.min(dmin, d); if (d > 0) { fill += d; vf += d * 25; } else { cut -= d; vc -= d * 25; } }
const rms = Math.sqrt(pts.reduce((s, [e, nn, h]) => s + (y + a * e + b * nn - h) ** 2, 0) / n);
const emb = Math.max(20, Math.max(Math.abs(dmax), Math.abs(dmin)) * SIDE);
const world = toWorld([0, 0]);
const pad = { id: 1, x: world.x, z: world.z, yLocalCentre: y, gradeLocal: { a, b }, rCore: R_CORE, emb };
// the plane in WORLD axes: rotate (a,b) from the local frame (e east-of-yaw, n) to world (x,z)
const yw = (J1_SITE.yawDeg * Math.PI) / 180, eAx = { x: Math.cos(yw), z: Math.sin(yw) }, nAx = { x: Math.sin(yw), z: -Math.cos(yw) };
const aW = a * eAx.x + b * nAx.x, bW = a * eAx.z + b * nAx.z;

P(`J1-c1 PAD FIT   J1 = (${J1_SITE.x}, ${J1_SITE.z}), yaw ${J1_SITE.yawDeg} deg, disc R ${R_CORE} m, ${n} samples every 5 m`);
P(`natural ground in the disc: ${hmin.toFixed(2)} .. ${hmax.toFixed(2)} m  (range ${(hmax - hmin).toFixed(2)} m)`);
P(`free fit: grade ${(g0 * 100).toFixed(2)} %   used grade ${(Math.hypot(a, b) * 100).toFixed(2)} %  (limit ${(GMAX * 100).toFixed(1)} %, min drainage ${(GMIN * 100).toFixed(1)} %)`);
P(`pad centre height y = ${y.toFixed(2)} m   world plane: a = ${aW.toFixed(5)}  b = ${bW.toFixed(5)}`);
P(`residual: RMS ${rms.toFixed(2)} m, max fill ${dmax.toFixed(2)} m, max cut ${(-dmin).toFixed(2)} m`);
P(`earthwork in the disc: fill ${vf.toFixed(0)} m3, cut ${vc.toFixed(0)} m3 (balance ${(vf - vc).toFixed(0)})`);
P(`embankment blend emb = ${emb.toFixed(0)} m (slope 1:${SIDE})`);
const checks: Array<[string, boolean, string]> = [
  ['plane grade <= 3 % and >= 0.3 %', Math.hypot(a, b) <= GMAX + 1e-9 && Math.hypot(a, b) >= GMIN - 1e-9, `${(Math.hypot(a, b) * 100).toFixed(2)} %`],
  ['max cut or fill <= 3 m', Math.max(dmax, -dmin) <= 3, `${Math.max(dmax, -dmin).toFixed(2)} m`],
  ['cut / fill balance within 25 %', Math.abs(vf - vc) <= 0.25 * Math.max(vf, vc, 1), `${(vf - vc).toFixed(0)} m3`],
];
for (const [nm, ok, d] of checks) P(`  ${ok ? 'PASS' : 'FAIL'}  ${nm.padEnd(40)} ${d}`);
writeFileSync(`${out}/j1c1.json`, JSON.stringify({ site: J1_SITE, pad: { id: 1, x: world.x, z: world.z, y, a: aW, b: bW, rCore: R_CORE, emb }, checks }, null, 1));
writeFileSync(`${out}/STEPJ1C1_OUTPUT.txt`, lines.join('\n') + '\n');
