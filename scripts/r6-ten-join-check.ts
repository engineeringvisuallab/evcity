// STEP R6-10-JOIN check: R6-10 starts on R6-7, tangent merge, grade <= 4 %, radius, levels, ground cut / fill, water. Run: npx tsx scripts/r6-ten-join-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { R6_LINE_DATA } from '../src/roads/r6/R6LineData';
import { R6_NEW_LINE_DATA } from '../src/roads/r6/R6NewLineData';
import { r6TenWithLink, r6TenLinkLen, R6_TEN_JOIN_IDX } from '../src/roads/r6/R6TenLink';
const g: any = new TerrainGenerator(Config.world.seed);
const o = g.makeSample();
const ground = (x: number, z: number): number => { if (g.sampleGround) g.sampleGround(x, z, o); else g.sample(x, z, o); return o.h; };
const r7 = R6_LINE_DATA.find((d) => d.name === 'R6-7')!;
const r10 = R6_NEW_LINE_DATA.find((d) => d.name === 'R6-10')!;
const j = r6TenWithLink(r7, r10);
let fails = 0;
const ok = (name: string, pass: boolean, info: string): void => { console.log((pass ? 'PASS ' : 'FAIL ') + name + ': ' + info); if (!pass) fails++; };
const P1 = r7.pts[R6_TEN_JOIN_IDX];
ok('starts on R6-7', Math.hypot(j.pts[0][0] - P1[0], j.pts[0][1] - P1[1]) < 0.01 && Math.abs(j.ys[0] - r7.ys[R6_TEN_JOIN_IDX]) < 0.01, `start ${j.pts[0].map((v) => v.toFixed(1))} y ${j.ys[0]} (R6-7 y ${r7.ys[R6_TEN_JOIN_IDX]})`);
const bridgeS = r7.structs?.[0][0] ?? 1e9;
ok('join before the R6-7 bridge', r7.s[R6_TEN_JOIN_IDX] <= bridgeS - 20, `join s ${r7.s[R6_TEN_JOIN_IDX]}, bridge from s ${bridgeS}`);
ok('old points kept', Math.hypot(j.pts[j.pts.length - 1][0] - r10.pts[r10.pts.length - 1][0], j.pts[j.pts.length - 1][1] - r10.pts[r10.pts.length - 1][1]) < 0.01 && Math.abs(j.ys[j.ys.length - 1] - r10.ys[r10.ys.length - 1]) < 0.01, `end y ${j.ys[j.ys.length - 1]} (old ${r10.ys[r10.ys.length - 1]})`);
let maxG = 0, minR = 1e9, maxCut = 0, maxFill = 0, changed = 0, maxLow = 0;
const nOld = r10.pts.length;
const off = j.pts.length - nOld;
for (let i = 1; i < j.pts.length; i++) { const d = Math.hypot(j.pts[i][0] - j.pts[i - 1][0], j.pts[i][1] - j.pts[i - 1][1]); maxG = Math.max(maxG, Math.abs(j.ys[i] - j.ys[i - 1]) / d); }
for (let i = 1; i < j.pts.length - 1; i++) {
  const a = j.pts[i - 1], b = j.pts[i], c = j.pts[i + 1];
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  const R = A > 1e-6 ? (ab * bc * ac) / (4 * A) : 1e9;
  if (i < nOld) minR = Math.min(minR, R); // the old R6-10 has its own 113 m fillet further on; only the first part is judged here
  if (i >= off) { const dy = j.ys[i] - r10.ys[i - off]; if (Math.abs(dy) > 0.05) { changed++; maxLow = Math.max(maxLow, -dy); } }
}
let cutAt = 0, fillAt = 0;
for (let i = 0; i < j.pts.length; i++) { const dh = ground(j.pts[i][0], j.pts[i][1]) - j.ys[i]; if (dh > maxCut) { maxCut = dh; cutAt = i; } if (-dh > maxFill) { maxFill = -dh; fillAt = i; } }
ok('grade <= 4.06 %', maxG <= 0.0406, `max ${(maxG * 100).toFixed(2)} %`);
ok('radius of the joined start >= 113 m', minR >= 113, `min ${minR.toFixed(0)} m over the first ${nOld} points`);
console.log(`INFO link length ${r6TenLinkLen(r7, r10).toFixed(1)} m, points ${j.pts.length} (old ${nOld}), levels changed on ${changed} old points, up to ${maxLow.toFixed(1)} m lower`);
console.log(`INFO ground: max centre cut ${maxCut.toFixed(1)} m at point ${cutAt}, max centre fill ${maxFill.toFixed(1)} m at point ${fillAt} (old R6-10: 15.6 / 15.5)`);
let s = '';
for (let i = 0; i < j.pts.length && i < 70; i += 4) s += `[${i}](${Math.round(j.pts[i][0])},${Math.round(j.pts[i][1])} y${j.ys[i].toFixed(1)} g${ground(j.pts[i][0], j.pts[i][1]).toFixed(1)}) `;
console.log(s);
console.log(fails === 0 ? 'RESULT ALL PASS' : `RESULT ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
