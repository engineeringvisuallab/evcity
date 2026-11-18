// STEP B7-3 headless check of the R4-a + R4-b lines (20 lines) in the REAL road network (Config.roads.r4New.enabled = true):
// WATER first (sc.water > sc.h on the natural ground at every game road point, and the finished level against the water level), then: exist, length, levels, grade, centre cut / fill, structures found by bridgeArm,
// junction pads created, and which other roads they cross in plan (R1: a crossing without a junction is a LIST, not hidden; the lines have free ends until the junction phase).
// Run: npx tsx scripts/b7-r4new-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { R4_NEW_LINE_DATA } from '../src/roads/r4/R4NewLineData';
Config.roads.r4New.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
const names: string[] = R4_NEW_LINE_DATA.map((d) => d.name);   // every game road of the data file (21.72: all lines placed)
let fails = 0;
const chk = (ok: boolean, t: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t}`); };
const seg = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean => {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
const sc = gen.makeSample();
console.log('1. WATER (first): natural ground wet under the centreline (sc.water > sc.h) and finished level vs water');
let wetTotal = 0, wetBrTotal = 0;
for (const nm of names) {
  const r = roads.find((q: any) => q.name === nm);
  if (!r) { chk(false, `${nm} exists`); continue; }
  let wet = 0, low = 0, wetBr = 0;
  for (let i = 0; i < r.xs.length; i++) { gen.sample(r.xs[i], r.zs[i], sc); if (!Number.isNaN(sc.water) && sc.water > sc.h) { if (r.bridgeOf[i] >= 0) wetBr++; else { wet++; if (r.ys[i] < sc.water + 1.5) low++; } } }
  wetTotal += wet; wetBrTotal += wetBr;
  console.log(`   ${nm.padEnd(6)} wet points NOT on a bridge ${wet}, on a bridge deck ${wetBr}, of ${r.xs.length}, of them finished level < water + 1.5 m: ${low}`);
}
chk(wetTotal === 0, `no wet point outside a bridge deck (${wetTotal}; ${wetBrTotal} wet points lie on bridge decks)`);
console.log('2. ROAD DATA');
console.log('line    pts  length  y0->y1 (m)   maxGrade%  maxCut  maxFill  bridge pts  crosses');
let pads = 0;
for (const nm of names) {
  const r = roads.find((q: any) => q.name === nm);
  if (!r) continue;
  let L = 0, g = 0, cut = 0, fill = 0, br = 0;
  for (let i = 1; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); L += d; g = Math.max(g, Math.abs(r.ys[i] - r.ys[i - 1]) / d); }
  for (let i = 0; i < r.xs.length; i++) { const dh = r.ys[i] - r.hNat[i]; cut = Math.max(cut, -dh); fill = Math.max(fill, dh); if (r.bridgeOf[i] >= 0) br++; }
  const hit: string[] = [];
  for (const o of roads) {
    if (o === r || (names.includes(o.name) && o.id < r.id)) continue;
    let n = 0;
    for (let i = 1; i < r.xs.length; i++) for (let j = 1; j < o.xs.length; j++) if (seg(r.xs[i - 1], r.zs[i - 1], r.xs[i], r.zs[i], o.xs[j - 1], o.zs[j - 1], o.xs[j], o.zs[j])) n++;
    if (n) hit.push(`${o.name}x${n}`);
  }
  console.log(`${nm.padEnd(7)} ${String(r.xs.length).padStart(4)} ${L.toFixed(0).padStart(6)}  ${r.ys[0].toFixed(2)}->${r.ys[r.ys.length - 1].toFixed(2)}  ${(g * 100).toFixed(2).padStart(7)}  ${cut.toFixed(1).padStart(6)}  ${fill.toFixed(1).padStart(6)}  ${String(br).padStart(6)}      ${hit.join(' ') || '-'}  [lanes ${r.lanes}, medianHalf ${r.medianHalf}, halfWidth ${r.halfWidth}]`);
  chk(g <= 0.062, `${nm} grade <= 6 % (+ rounding of the 10 m samples)`);
  chk(r.lanes === 4 && r.medianHalf === 2, `${nm} is 4 lanes, divided (median half 2.0 m)`);
}
chk(names.every((n) => roads.some((q: any) => q.name === n)), 'all 20 lines exist as game roads');
const ra: any = gen.roads;
for (const k of ['pads', 'junctionPads', 'padList']) if (Array.isArray(ra[k])) pads = ra[k].length;
console.log(`   junction pad list on the network: ${pads} (R6 only state was 0)`);
console.log(`RESULT ${fails ? fails + ' FAIL' : 'all PASS'}`);
