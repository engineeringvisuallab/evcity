// STEP HK-9c-2 sub-steps 2 + 3 check: the dry stretches of the 8 C-D / slip pieces as real roads (RoadNetwork.layoutHkCdRoads, data src/roads/ring/HkCdRoadData.ts).
// Headless: real TerrainGenerator / RoadNetwork. WATER CHECK (sc.water > sc.h on natural ground) is the first block.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-cd-roads-build-check      (HK=0: proves that the switch OFF builds nothing)
// With HK=1 it also writes docs/HK_CD_ROADS_9c2_3.txt (calculation sheet + PASS / FAIL list).
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { HK_CD_ROADS } from '../src/roads/ring/HkCdRoadData';
import { hkFrame, hkWorld } from '../src/roads/ring/HkRamps';

const out: string[] = [];
let fails = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; say(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${detail}`); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const LAT = 4.2 + 1.2 + 2;

const on = !!Config.roads.hatikamrul.enabled;
const gen = new TerrainGenerator(Config.world.seed);
const net: any = gen.roads;
say(`HK-9c-2 SUB-STEPS 2 + 3 check, switch ${on ? 'ON' : 'OFF'}`);
const hk: any[] = net.roads.filter((r: any) => String(r.name).startsWith('HK-'));
const others: any[] = net.roads.filter((r: any) => !String(r.name).startsWith('HK-'));

// signature of everything that is not a new road (proves the old roads / bridges are untouched; compare the ON and the OFF line)
let sig = 0;
for (const r of others) { for (let i = 0; i < r.xs.length; i += 7) sig += r.xs[i] * 1.3 + r.zs[i] * 0.7 + r.ys[i] * 2.1; sig += r.xs.length; }
const hkBridgeIds = new Set<number>(); for (const r of hk) for (const b of net.bridges) if (b.roadId === r.id) hkBridgeIds.add(b.id);
const oldBridges = net.bridges.filter((b: any) => !hkBridgeIds.has(b.id));
say(`SIGNATURE of the old network: roads ${others.length}, bridges ${oldBridges.length}, hash ${sig.toFixed(3)}`);

if (!on) {
  check(hk.length === 0, 'switch OFF: no HK road is built', `${hk.length} roads`);
  say(`RESULT ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}

const f = hkFrame(net)!;
const o = { h: 0, water: NaN, fx: 0, fz: 0 } as any;
const wetAt = (wx: number, wz: number): boolean => { gen.sampleNatural(wx, wz, o); return !Number.isNaN(o.water) && (o.water > o.h || o.h < o.water + 0.3); };

// ---------- WATER CHECK FIRST ----------
// Sub-step 3: a wet sample is allowed ONLY where the road is a bridge (twin bridge zone), and then the deck must stay above the water (underside = level - 1.4 m girder, needs >= 0.5 m over the water).
say('\nWATER CHECK (sc.water > sc.h, and the game rule h < water + 0.3), natural ground, every 2 m along each road at the centre and +-' + LAT + ' m. Wet samples are allowed only ON a bridge, with the deck above the water.');
let wetTotal = 0;
for (const r of hk) {
  let wet = 0, wetOut = 0, n = 0, minUnder = 1e9;
  for (let i = 0; i + 1 < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]);
    const tx = (r.xs[i + 1] - r.xs[i]) / L, tz = (r.zs[i + 1] - r.zs[i]) / L;
    const onBr = r.bridgeOf[i] >= 0 && r.bridgeOf[i + 1] >= 0;
    for (let d = 0; d < L; d += 2) for (const l of [0, LAT, -LAT]) {
      n++;
      if (wetAt(r.xs[i] + tx * d - tz * l, r.zs[i] + tz * d + tx * l)) {
        wet++; if (!onBr) wetOut++;
        else if (l === 0 && !Number.isNaN(o.water)) minUnder = Math.min(minUnder, r.ys[i] - 1.4 - o.water);
      }
    }
  }
  wetTotal += wet;
  check(wetOut === 0, `${r.name}: no wet sample outside a bridge`, `${wetOut} of ${n} outside; ${wet} wet samples in total (on bridges)`);
  if (wet > 0) check(minUnder >= 0.5, `${r.name}: deck underside above the water`, `${f2(minUnder)} m at the lowest wet centre sample (needs 0.5 m)`);
}

say('\nROADS AND DATA');
check(hk.length === HK_CD_ROADS.length, `${HK_CD_ROADS.length} HK roads exist`, `${hk.length}`);
let worstPos = 0, worstLev = 0;
for (const d of HK_CD_ROADS) {
  const r = hk.find((q) => q.name === `HK-${d.id}`);
  if (!r) { check(false, `${d.id}: road found`, 'missing'); continue; }
  for (let i = 0; i < d.pts.length; i++) { const [wx, wz] = hkWorld(f, d.pts[i][0], d.pts[i][1]); worstPos = Math.max(worstPos, Math.hypot(r.xs[i] - wx, r.zs[i] - wz)); worstLev = Math.max(worstLev, Math.abs(r.ys[i] - d.ys[i])); }
}
check(worstPos < 0.01, 'road points = data points (local frame -> world)', `${f2(worstPos)} m worst`);
check(worstLev < 0.005, 'road levels = data levels (fixedY used exactly)', `${f2(worstLev)} m worst`);

say('\nCALCULATION SHEET (per road)');
say('  road          length   pts  level (start -> end)   worst grade  min radius  max fill  max cut  viaduct m  bridges');
let gradeOk = true, radOk = true;
for (const r of hk) {
  const n = r.xs.length;
  let maxGr = 0, minR = 1e9, fill = -1e9, cut = -1e9;
  for (let i = 1; i < n; i++) { const d = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); maxGr = Math.max(maxGr, Math.abs(r.ys[i] - r.ys[i - 1]) / d); }
  for (let i = 1; i + 1 < n; i++) {
    const ax = r.xs[i - 1], az = r.zs[i - 1], bx = r.xs[i], bz = r.zs[i], cx = r.xs[i + 1], cz = r.zs[i + 1];
    const cr = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    if (cr > 1e-6) minR = Math.min(minR, (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az)) / (2 * cr));
  }
  for (let i = 0; i < n; i++) { fill = Math.max(fill, r.ys[i] - r.hNat[i]); cut = Math.max(cut, r.hNat[i] - r.ys[i]); }
  const brs = net.bridges.filter((b: any) => b.roadId === r.id);
  const viaM = brs.reduce((a: number, b: any) => a + b.lengthM, 0);
  if (maxGr > 0.05) gradeOk = false;
  if (minR < 92.5) radOk = false;
  say(`  ${r.name.padEnd(12)} ${f1(r.cum[n - 1]).padStart(7)} ${String(n).padStart(5)}  ${f2(r.ys[0])} -> ${f2(r.ys[n - 1])}`.padEnd(54) + `${(100 * maxGr).toFixed(2).padStart(7)} %  ${(minR > 1e8 ? 'straight' : f1(minR) + ' m').padStart(10)}  ${f1(fill).padStart(7)}  ${f1(cut).padStart(7)}  ${f1(viaM).padStart(8)}  ${brs.length}`);
}
check(gradeOk, 'all HK roads: grade <= 5 %', 'see sheet');
check(radOk, 'all HK roads: radius >= 92.5 m (V50 93.7 m less 4 m sampling error)', 'see sheet');

say('\nVIADUCT RULE (ramp higher than 3 m over the ground = bridge, like the 3D-A ramps; the game rule bridgeRamp keeps a high stretch of fewer than 4 points as an embankment)');
for (const r of hk) {
  let missing = 0, hi = 0, maxLow = -1e9, maxLowHigh = -1e9;
  for (let i = 0; i < r.xs.length; i++) {
    const fill = r.ys[i] - r.hNat[i];
    if (fill > 3) { hi++; if (r.bridgeOf[i] < 0) { missing++; maxLowHigh = Math.max(maxLowHigh, fill); } }
    if (r.bridgeOf[i] < 0) maxLow = Math.max(maxLow, fill);
  }
  check(missing <= 1 && maxLowHigh <= 3.2, `${r.name}: fill > 3 m only on a bridge (one end point may stay a short embankment)`, `${hi} high points, ${missing} without bridge${missing ? ` (fill ${f2(maxLowHigh)} m)` : ''}; highest fill outside a bridge ${f2(maxLow)} m`);
}
for (const b of net.bridges.filter((q: any) => hk.some((r) => r.id === q.roadId))) {
  const r = net.roads[b.roadId];
  say(`  INFO  bridge ${b.id} on ${r.name}: ${f1(b.lengthM)} m long, deck over ground min ${f1(b.clearanceM)} m, points ${b.i0}..${b.i1}`);
}

// ---------- plan overlap / crossings with the old roads ----------
say('\nCROSSINGS AND OVERLAPS WITH OLD ROADS (plan: centreline distance < 4.2 + other half width). Same level (|dy| <= 0.8 m) = flush merge, allowed only in the first / last 250 m of a piece (taper / ring merge).');
say('  Different level = crossing: clearance = (upper road level - 1.4 m girder) - lower road level, needed >= 4.9 m. Girder depth 1.4 m is the HK ramp girder; old bridges are taken with 1.4 m too (an assumption).');
const END_ZONE = 250;
for (const r of hk) {
  const n = r.xs.length, L = r.cum[n - 1];
  let flushBad = 0, flushZone = 0, flushZoneDyMax = 0;
  const cross = new Map<string, { clr: number; s: number }>();
  for (let i = 0; i < n; i++) {
    for (const q of others) {
      const lim = 4.2 + q.halfWidth;
      for (let k = 0; k < q.xs.length; k++) {
        const dx = q.xs[k] - r.xs[i];
        if (dx > lim + 1 || dx < -lim - 1) continue;
        if (Math.hypot(dx, q.zs[k] - r.zs[i]) >= lim) continue;
        const dy = q.ys[k] - r.ys[i];
        const inZone = r.cum[i] < END_ZONE || L - r.cum[i] < END_ZONE;
        if (Math.abs(dy) <= 0.8) { if (inZone) { flushZone++; flushZoneDyMax = Math.max(flushZoneDyMax, Math.abs(dy)); } else flushBad++; }
        else { const clr = dy < 0 ? r.ys[i] - 1.4 - q.ys[k] : q.ys[k] - 1.4 - r.ys[i]; const key = `${q.name} (${dy < 0 ? 'under HK' : 'over HK'})`; const c = cross.get(key); if (!c || clr < c.clr) cross.set(key, { clr, s: r.cum[i] }); }
      }
    }
  }
  check(flushBad === 0, `${r.name}: no flush overlap outside the end zones`, `${flushBad} points; end-zone flush overlaps ${flushZone} (worst dy ${f2(flushZoneDyMax)} m)`);
  for (const [key, c] of cross) check(c.clr >= 4.9, `${r.name}: crossing ${key}: clearance`, `${f2(c.clr)} m at s ${f1(c.s)} m (needs 4.9 m)`);
}

// ---------- terrain under the roads ----------
say('\nTERRAIN (final ground = natural + road earthworks + HK cut) at the centreline, points NOT on a bridge');
for (const r of hk) {
  let worst = 0, n = 0;
  for (let i = 0; i < r.xs.length; i++) {
    if (r.bridgeOf[i] >= 0) continue;
    gen.sample(r.xs[i], r.zs[i], o); n++;
    worst = Math.max(worst, Math.abs(o.h - r.ys[i]));
  }
  check(worst <= 0.35, `${r.name}: ground follows the road level on embankment / cut points`, `${n} points, worst |ground - road| ${f2(worst)} m`);
}

say('\nNOT RUN here: tsc, npm run build, the old check scripts, game look, traffic graph (HK-11). Switch off: Config.roads.hatikamrul.enabled = false.');
say(`RESULT ${fails} FAIL${fails ? '' : ', 0 FAIL means every check printed above passed'}; wet samples on bridges ${wetTotal}`);
writeFileSync('docs/HK_CD_ROADS_9c2_3.txt', out.join('\n') + '\n');
process.exit(fails ? 1 : 0);
