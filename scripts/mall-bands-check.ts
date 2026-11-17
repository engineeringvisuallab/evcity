// STEP M1d check (headless, changes nothing): the apron / walkway bands of the City Mall. Run: npx tsx scripts/mall-bands-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { mallBands } from '../src/mall/MallBands';
import { MALL_WALK } from '../src/mall/MallSite';
const T: any = new TerrainGenerator(Config.world.seed);
const t0 = Date.now(); const B = mallBands(T); const ms = Date.now() - t0;
const N = B.pts.length, sorted = [...B.wRed].sort((a, b) => a - b);
console.log('points', N, 'time ms', ms, '; red line distance from the plot edge: min', sorted[0].toFixed(1), 'median', sorted[N >> 1].toFixed(1), 'max', sorted.at(-1)!.toFixed(1), '; corridor hit', B.hit.filter(Boolean).length, 'of', N);
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
ok(B.wRed.every((w, i) => Math.abs(w - B.wApron[i] - Math.min(w, MALL_WALK)) < 1e-9), `walkway = ${MALL_WALK} m everywhere (or all of the band where it is narrower)`);
ok(B.wApron.every((w, i) => w <= B.wRed[i] + 1e-9), 'apron never wider than the red line distance');
ok(B.wRed.filter((w) => w >= MALL_WALK).length / N > 0.9, '90 % of the outline has a full 5 m walkway');
console.log(fails ? `\n${fails} FAIL` : '\nALL OK'); process.exit(fails ? 1 : 0);
