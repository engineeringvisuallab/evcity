// STEP B7-2 headless check of the 7 new R6 lines R6-9 .. R6-15 in the REAL road network (Config.roads.r6New.enabled = true): are they there, length, levels, grade, centre cut / fill, structures found by bridgeArm, and which other roads they cross in plan (R1: a crossing without a junction is a LIST, not hidden; the lines have free ends until 21.7 mouths).
// Run: npx tsx scripts/b7-r6new-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
Config.roads.r6New.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
const names = ['R6-9', 'R6-10', 'R6-11', 'R6-12', 'R6-13', 'R6-14', 'R6-15'];
let fails = 0;
const chk = (ok: boolean, t: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t}`); };
const seg = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean => {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
console.log('line    pts  length  y0->y1 (m)   maxGrade%  maxCut  maxFill  bridge pts  crosses');
for (const nm of names) {
  const r = roads.find((q) => q.name === nm);
  if (!r) { chk(false, `${nm} is in the road network`); continue; }
  let L = 0, g = 0, cut = 0, fill = 0, br = 0;
  for (let i = 1; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); L += d; g = Math.max(g, Math.abs(r.ys[i] - r.ys[i - 1]) / d); }
  for (let i = 0; i < r.xs.length; i++) { const dh = r.ys[i] - r.hNat[i]; cut = Math.max(cut, -dh); fill = Math.max(fill, dh); if (r.bridgeOf[i] >= 0) br++; }
  const hit: string[] = [];
  for (const o of roads) {
    if (o === r || names.includes(o.name) && o.name < r.name) continue;
    let n = 0;
    for (let i = 1; i < r.xs.length; i++) for (let j = 1; j < o.xs.length; j++) if (seg(r.xs[i - 1], r.zs[i - 1], r.xs[i], r.zs[i], o.xs[j - 1], o.zs[j - 1], o.xs[j], o.zs[j])) n++;
    if (n) hit.push(`${o.name}x${n}`);
  }
  console.log(`${nm.padEnd(7)} ${String(r.xs.length).padStart(4)} ${L.toFixed(0).padStart(6)}  ${r.ys[0].toFixed(2)}->${r.ys[r.ys.length - 1].toFixed(2)}  ${(g * 100).toFixed(2).padStart(7)}  ${cut.toFixed(1).padStart(6)}  ${fill.toFixed(1).padStart(6)}  ${String(br).padStart(6)}      ${hit.join(' ') || '-'}`);
  chk(g <= 0.0425, `${nm} grade <= 4 % (+ rounding of the 10 m samples)`);
}
chk(names.every((n) => roads.some((q) => q.name === n)), 'all 7 new lines exist as game roads');
console.log(`RESULT ${fails ? fails + ' FAIL' : 'all PASS'}`);
