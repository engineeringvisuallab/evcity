// READ-ONLY: C / L / R2 / R4 game road length inside each residential circle + buildings inside.
import { C_NEW_LINE_DATA } from '../src/roads/c/CNewLineData';
import { L_NEW_LINE_DATA } from '../src/roads/l/LNewLineData';
import { R2_NEW_LINE_DATA } from '../src/roads/r2/R2NewLineData';
import { R4_NEW_LINE_DATA } from '../src/roads/r4/R4NewLineData';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
const S: [string, number, number, number][] = [
  ['se-dense', 1150, 1150, 600], ['west-homes', -1550, 0, 620], ['sw-homes', -1150, 1150, 600], ['east-homes', 1550, 60, 600],
  ['south-suburb', 450, 2250, 550], ['east-suburb', 2300, 1550, 500], ['sw-newtown', -1900, 1750, 650], ['west-suburb', -2450, 500, 500],
  ['north-homes', 250, -2550, 450], ['village-west', -2900, -1050, 300], ['village-sw', -3150, 950, 300]];
const sets: [string, any[]][] = [['C', C_NEW_LINE_DATA], ['L', L_NEW_LINE_DATA], ['R2', R2_NEW_LINE_DATA], ['R4', R4_NEW_LINE_DATA]];
const b = [...FILL_PLACEMENTS, ...BUILDING_PLACEMENTS];
console.log('area | C m | L m | R2 m | R4 m | bldgs');
for (const [id, cx, cz, r] of S) {
  const o: string[] = [];
  for (const [, d] of sets) { let m = 0; for (const l of d) for (let i = 1; i < l.pts.length; i++) { const mx = (l.pts[i][0] + l.pts[i - 1][0]) / 2, mz = (l.pts[i][1] + l.pts[i - 1][1]) / 2; if (Math.hypot(mx - cx, mz - cz) <= r) m += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]); } o.push(m.toFixed(0)); }
  console.log(`${id} | ${o.join(' | ')} | ${b.filter((q) => Math.hypot(q.x - cx, q.z - cz) <= r).length}`);
}
