// STEP 5.1 check: planRing() = the data that goes into RoadNetwork. Run: npx tsx scripts/ring-road-check.ts
import { planRing } from '../src/roads/ring/RingRoad';
import { laneCentre } from '../src/roads/RoadSection';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
const r = planRing();
const n = r.pts.length;
console.log(`ring: ${n} points, step ${r.step.toFixed(3)} m, length ${r.length.toFixed(1)} m`);

let dmin = Infinity, dmax = 0, closing = 0, maxGrade = 0, maxDy = 0;
for (let i = 0; i < n; i++) {
  const j = (i + 1) % n;
  const d = Math.hypot(r.pts[j][0] - r.pts[i][0], r.pts[j][1] - r.pts[i][1]);
  dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
  const dy = Math.abs(r.ys[j] - r.ys[i]);
  maxDy = Math.max(maxDy, dy);
  maxGrade = Math.max(maxGrade, dy / d);
  if (j === 0) closing = d;
}
check(dmax - dmin < 0.05, 'point spacing is even all the way round, closing segment included', `${dmin.toFixed(3)}..${dmax.toFixed(3)} m, closing ${closing.toFixed(3)}`);
check(r.step > 7 && r.step <= 8, 'spacing is about 8 m (the highway step of RoadNetwork)', `${r.step.toFixed(3)} m`);
check(maxGrade <= 0.0405, 'grade between neighbouring points within the 4 % hard limit', `max ${(maxGrade * 100).toFixed(3)} %`);
check(r.stations.every((s, i) => i === 0 || s > r.stations[i - 1]), 'stations rise strictly', `0..${r.stations[n - 1].toFixed(1)}`);

const s = r.section;
const k = { halfWidth: s.halfWidth, lanes: s.lanesPerDir * 2, medianHalf: s.medianHalf, laneW: s.laneW, shyOuter: s.shyOuter };
check(Math.abs(s.halfWidth - (s.medianHalf + s.shyMedian + s.lanesPerDir * s.laneW + s.shyOuter)) < 1e-9, 'halfWidth = median + inner shoulder + lanes + outer shoulder', `${s.halfWidth} = ${s.medianHalf}+${s.shyMedian}+${s.lanesPerDir}x${s.laneW}+${s.shyOuter}`);
check(s.halfWidth === 22.1 && s.medianHalf === 3 && s.lanesPerDir === 4 && s.laneW === 3.65 && s.shyOuter === 3 && s.shoulder === 0.6, 'numbers equal the Step 4.1 table (SECTION_M8)', JSON.stringify(s));
check(Math.abs(laneCentre(k, 0) - 17.275) < 1e-9 && Math.abs(laneCentre(k, 3) - 6.325) < 1e-9, 'laneCentre() of RoadSection gives the M8 lane centres (kerb lane 17.275, inner 6.325)', `${laneCentre(k, 0)}, ${laneCentre(k, 3)}`);
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);
