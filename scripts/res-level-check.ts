// RESIDENTIAL LEVEL check: (1) road grade after the re-profile, (2) real terrain (gen.sample, road earthwork included) beside the C/L/R2/R4 roads vs the road surface.
// Run: npx tsx scripts/res-level-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const AREAS: [string, number, number, number][] = [['se-dense',1150,1150,600],['west-homes',-1550,0,620],['sw-homes',-1150,1150,600],['east-homes',1550,60,600],['south-suburb',450,2250,550],['sw-newtown',-1900,1750,650],['west-suburb',-2450,500,500],['RA-N',1030,-2365,520],['RA-SW',-3150,1500,520]];
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
console.log('area | max grade % (limit) | terrain-minus-road at 8 / 15 / 30 m: |d| p90 , worst');
let fails = 0;
for (const [id, cx, cz, R] of AREAS) {
  let gmax = 0, lim = 0; const d8: number[] = [], d15: number[] = [], d30: number[] = [];
  for (const r of gen.roads.roads) {
    if (!/^(C|L|R2|R4)-/.test(r.name) || r.earth) continue;
    for (let i = 1; i < r.xs.length - 1; i++) {
      if (Math.hypot(r.xs[i] - cx, r.zs[i] - cz) > R) continue;
      const ds = Math.hypot(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]);
      const g = Math.abs(r.ys[i + 1] - r.ys[i]) / ds * 100; if (g > gmax) { gmax = g; lim = r.maxGrade * 100; }
      const tx = r.xs[i + 1] - r.xs[i - 1], tz = r.zs[i + 1] - r.zs[i - 1], l = Math.hypot(tx, tz) || 1; const nx = -tz / l, nz = tx / l;
      for (const s of [-1, 1]) for (const [o, arr] of [[8, d8], [15, d15], [30, d30]] as [number, number[]][]) { gen.sample(r.xs[i] + nx * o * s, r.zs[i] + nz * o * s, sc); arr.push(sc.h - r.ys[i]); }
    }
  }
  const ab = (a: number[]) => a.map(Math.abs);
  const f = (a: number[]) => `${q(ab(a), .9).toFixed(1)} , ${Math.max(...ab(a), 0).toFixed(1)}`;
  console.log(`${id.padEnd(13)}| ${gmax.toFixed(1)} (${lim.toFixed(0)}) | ${f(d8)} | ${f(d15)} | ${f(d30)}`);
}
