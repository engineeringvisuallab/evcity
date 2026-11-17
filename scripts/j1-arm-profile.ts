// STEP J1-c2.. (headless): vertical profile of ONE arm of J1 on the real terrain, s = 0 (J1 centre) .. L along the straight axis.
// Run: tsx scripts/j1-arm-profile.ts <N|E|S|W> <out-dir> [L=500]   writes j1c_<arm>.json + STEPJ1C_<arm>_OUTPUT.txt
// Profile = pad plane (J1-c1) up to s = R_CORE, then one tangent grade g (clamped 0.3 %..3 %) joined by a parabolic curve of length K*A.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { minVerticalK } from '../src/roads/standards/Checks';
import { toWorld } from '../src/roads/junction/GroundJ1Geometry';

const arm = (process.argv[2] ?? 'S').toUpperCase() as 'N' | 'E' | 'S' | 'W';
const out = process.argv[3] ?? 'docs';
const L = Number(process.argv[4] ?? 500);
mkdirSync(out, { recursive: true });
const pad = JSON.parse(readFileSync(`${out}/j1c1.json`, 'utf8')).pad as { x: number; z: number; y: number; a: number; b: number; rCore: number };
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const AX: Record<string, (s: number, o: number) => [number, number]> = { N: (s, o) => [o, s], E: (s, o) => [s, -o], S: (s, o) => [-o, -s], W: (s, o) => [-s, o] };
const ground = (s: number, o: number): number => { const [e, n] = AX[arm](s, o); const p = toWorld([e, n]); gen.sampleNatural(p.x, p.z, sc); return sc.h; };
const padH = (s: number): number => { const [e, n] = AX[arm](s, 0); const p = toWorld([e, n]); return pad.y + pad.a * (p.x - pad.x) + pad.b * (p.z - pad.z); };
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };

const V = 60, K = minVerticalK(V), s0 = pad.rCore, Gmax = 0.03, Gmin = 0.003, OFF = 25;
const gp = (padH(s0) - padH(0)) / s0;                       // pad grade along the arm axis
const h0 = padH(s0);
// ground trend beyond the pad: least squares line of the centreline ground s0..L, anchored at h0
let num = 0, den = 0; for (let s = s0; s <= L; s += 10) { num += (s - s0) * (ground(s, 0) - h0); den += (s - s0) ** 2; }
let g = den > 0 ? num / den : gp; const gFree = g;
g = Math.sign(g || 1) * Math.min(Gmax, Math.max(Gmin, Math.abs(g)));
const A = g - gp, Lc = Math.abs(A) * 100 * (A > 0 ? K.sag : K.crest);
const yAt = (s: number): number => {
  if (s <= s0) return padH(s);
  const t = s - s0;
  if (t >= Lc) return h0 + gp * Lc + A * Lc / 2 + g * (t - Lc);
  return h0 + gp * t + (A / (2 * Lc)) * t * t;
};
let cutMax = 0, fillMax = 0, cutEdgeMax = 0, fillEdgeMax = 0, gMax = 0, gMin = 1;
const rows: Array<{ s: number; ground: number; road: number; gl: number; gr: number }> = [];
for (let s = 0; s <= L; s += 10) {
  const r = yAt(s), gc = ground(s, 0), gl = ground(s, -OFF), gr = ground(s, OFF);
  cutMax = Math.max(cutMax, gc - r); fillMax = Math.max(fillMax, r - gc);
  cutEdgeMax = Math.max(cutEdgeMax, gl - r, gr - r); fillEdgeMax = Math.max(fillEdgeMax, r - gl, r - gr);
  if (s > 0) { const gg = Math.abs((yAt(s) - yAt(s - 10)) / 10); gMax = Math.max(gMax, gg); gMin = Math.min(gMin, gg); }
  rows.push({ s, ground: +gc.toFixed(2), road: +r.toFixed(2), gl: +gl.toFixed(2), gr: +gr.toFixed(2) });
}
P(`J1-c ARM ${arm} PROFILE  s 0..${L} m, V ${V} km/h, pad plane to s ${s0} m (pad grade along arm ${(gp * 100).toFixed(2)} %)`);
P(`ground trend grade ${(gFree * 100).toFixed(2)} %, design grade ${(g * 100).toFixed(2)} %, vertical curve ${Lc.toFixed(0)} m (K ${(A > 0 ? K.sag : K.crest).toFixed(0)})`);
P(`centreline: max cut ${cutMax.toFixed(2)} m, max fill ${fillMax.toFixed(2)} m;  edges (+-${OFF} m): max cut ${cutEdgeMax.toFixed(2)} m, max fill ${fillEdgeMax.toFixed(2)} m`);
P('   s    ground   road');
for (const r of rows.filter((_, i) => i % 5 === 0)) P(`${String(r.s).padStart(4)}  ${r.ground.toFixed(2).padStart(6)}  ${r.road.toFixed(2).padStart(6)}`);
const chk: Array<[string, boolean, string]> = [
  ['grade <= 3 %', gMax <= Gmax + 1e-6, `${(gMax * 100).toFixed(2)} %`],
  ['grade >= 0.3 % beyond the pad (drainage)', Math.abs(g) >= Gmin - 1e-9, `${(Math.abs(g) * 100).toFixed(2)} %`],
  ['small cutting: edge cut <= 3 m', cutEdgeMax <= 3, `${cutEdgeMax.toFixed(2)} m`],
  ['fill at edge <= 3 m (no viaduct)', fillEdgeMax <= 3, `${fillEdgeMax.toFixed(2)} m`],
];
for (const [n, ok, d] of chk) P(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(44)} ${d}`);
writeFileSync(`${out}/j1c_${arm}.json`, JSON.stringify({ arm, L, V, s0, gp, g, Lc, rows, checks: chk }, null, 1));
writeFileSync(`${out}/STEPJ1C_${arm}_OUTPUT.txt`, lines.join('\n') + '\n');
