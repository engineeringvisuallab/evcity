// READ-ONLY: road height vs flattened ground beside the road, per residential area. Run: npx tsx scripts/res-level-scan.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const AREAS: [string, number, number, number][] = [['se-dense',1150,1150,600],['west-homes',-1550,0,620],['sw-homes',-1150,1150,600],['east-homes',1550,60,600],['south-suburb',450,2250,550],['sw-newtown',-1900,1750,650],['west-suburb',-2450,500,500],['RA-N',1030,-2365,520],['RA-SW',-3150,1500,520]];
const ground = (x: number, z: number, flat: boolean): number => { gen.sampleGround(x, z, sc); if (flat) gen.residentialFlat.apply(x, z, sc); return sc.h; };
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
console.log('area | roads | pts | road-minus-flatground(ofs 25 m): p10 med p90 | road-minus-natural: med | frac |d|>1m flat');
for (const [id, cx, cz, R] of AREAS) {
  const dF: number[] = [], dN: number[] = []; let nr = 0;
  for (const r of gen.roads.roads) {
    if (!/^(C|L|R2|R4)-/.test(r.name) || r.earth) continue;
    let used = false;
    for (let i = 1; i < r.xs.length - 1; i++) {
      if (Math.hypot(r.xs[i] - cx, r.zs[i] - cz) > R) continue;
      used = true;
      const tx = r.xs[i + 1] - r.xs[i - 1], tz = r.zs[i + 1] - r.zs[i - 1], l = Math.hypot(tx, tz) || 1; const nx = -tz / l, nz = tx / l;
      for (const s of [-25, 25]) { dF.push(r.ys[i] - ground(r.xs[i] + nx * s, r.zs[i] + nz * s, true)); dN.push(r.ys[i] - ground(r.xs[i] + nx * s, r.zs[i] + nz * s, false)); }
    }
    if (used) nr++;
  }
  const big = dF.filter((d) => Math.abs(d) > 1).length / (dF.length || 1);
  console.log(`${id.padEnd(13)}| ${nr} | ${dF.length} | ${q(dF,.1).toFixed(1)} ${q(dF,.5).toFixed(1)} ${q(dF,.9).toFixed(1)} | ${q(dN,.5).toFixed(1)} | ${(big*100).toFixed(0)}%`);
}
