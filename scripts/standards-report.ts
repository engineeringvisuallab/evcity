import { buildInterchange } from '../src/interchange/Builder';
import { CRITERIA as C, minRadius, speedOfRadius, stoppingSight, decelLength, accelLength, crestK, frictionAt } from '../src/interchange/Standards';
const HW = { roadId: 1, halfWidth: 12.7, kerbLane: 10.45, laneW: 3.5, lanesPerDir: 3, designKmh: 100 };
const AV = { roadId: 2, halfWidth: 11.65, kerbLane: 9.525, laneW: 3.25, lanesPerDir: 3, designKmh: 40 };
const f = (n: number) => n.toFixed(0);
console.log('--- reference values (emax', C.emax, ') ---');
for (const V of [30, 35, 40, 50, 60, 80, 100]) console.log(`V=${V}: Rmin ${f(minRadius(V))} m, SSD ${f(stoppingSight(V))} m, crest K ${crestK(V).toFixed(0)}, f=${frictionAt(V).toFixed(2)}`);
console.log('exit lane 100->35:', f(decelLength(100, 35)), 'm | entrance lane 35->85:', f(accelLength(100, 35)), 'm | 100->50 exit', f(decelLength(100,50)), '| 50->85 entr', f(accelLength(100,50)));
for (const [pattern, loopR, slipSize, slipR] of [['cloverleaf',48,250,110],['cloverleaf',70,340,130]] as [string,number,number,number][]) {
  const m = buildInterchange({ id: 'v', pattern, x: 0, z: 0, y: 0, yaw: 0, main: HW, cross: AV, params: { loopR, slipSize, slipR } });
  console.log(`\n=== ${pattern} loopR ${loopR} slipR ${slipR} ===`);
  for (const r of m.ramps.slice(0, 2)) {
    // curvature along the ramp: smallest radius from 3 consecutive points
    let rmin = 1e9, gmax = 0;
    for (let i = 1; i < r.local.length - 1; i++) {
      const a = r.local[i - 1], b = r.local[i], c = r.local[i + 1];
      const ab = Math.hypot(b.u - a.u, b.v - a.v), bc = Math.hypot(c.u - b.u, c.v - b.v), ac = Math.hypot(c.u - a.u, c.v - a.v);
      const area2 = Math.abs((b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u));
      if (area2 > 1e-6) rmin = Math.min(rmin, (ab * bc * ac) / (2 * area2));
    }
    for (let i = 1; i < r.ys.length; i++) gmax = Math.max(gmax, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]));
    console.log(`${r.id}: Rmin on ramp ${f(rmin)} m -> V ${speedOfRadius(rmin)} km/h (assumed ${r.designKmh}); max grade ${(gmax * 100).toFixed(1)}% (limit ${C.rampMaxGrade * 100}%); length ${f(r.length)} m`);
  }
  // weaving: on each side of the main road, distance between an entrance (merge) and the next exit (gore) along the travel direction
  const ev: { u: number; side: number; kind: string; id: string }[] = [];
  for (const r of m.ramps) for (const j of [r.from, r.to]) if (j.road === 'main' && j.kind !== 'terminal') ev.push({ u: j.u, side: Math.sign(j.v), kind: j.kind, id: r.id });
  for (const side of [1, -1]) {
    const dirSign = side; // LHT: v>0 side carries +u
    const list = ev.filter((e) => e.side === side).sort((a, b) => dirSign * (a.u - b.u));
    for (let i = 0; i < list.length - 1; i++) if (list[i].kind === 'merge' && list[i + 1].kind === 'gore') console.log(`weave (main, side ${side > 0 ? 'left/+u' : 'right/-u'}): ${list[i].id} -> ${list[i + 1].id} = ${f(Math.abs(list[i + 1].u - list[i].u))} m (min ${C.weaveMin}, desirable ${C.weaveDesirable})`);
  }
  console.log('available taper at each gore/merge:', [...new Set(m.links.filter(l => l.kind !== 'terminal').map(l => l.taperLen))].join(','), 'm, no parallel auxiliary lane modelled');
}

// ---- C-D cloverleaf audit ----
import '../src/interchange/PatternCD';
import { cdLayout, CD_DEFAULTS } from '../src/interchange/PatternCD';
import { mergeParams } from '../src/interchange/Builder';
for (const [loopR, slipSize, slipR] of [[48,250,110],[60,300,110],[70,340,130]] as number[][]) {
  const params = { loopR, slipSize, slipR };
  const P = mergeParams(params);
  const m = buildInterchange({ id: 'v', pattern: 'cloverleaf-cd', x: 0, z: 0, y: 0, yaw: 0, main: HW, cross: AV, params });
  const L = cdLayout(HW, AV, P);
  console.log(`\n=== cloverleaf-cd loopR ${loopR} ===  validator: ${m.issues.length ? m.issues.map(i => i.code).join(',') : 'ok'}; footprint ${f(m.footprintR)} m; interchange length along main ${f(L.u1 - L.u0)} m`);
  console.log(`mainline exit: transition ${L.exitLen} m (needs decel ${f(decelLength(100, CD_DEFAULTS.speedKmh))} m and 1:15 over ${(L.vCD - HW.kerbLane).toFixed(1)} m shift = ${f(15 * (L.vCD - HW.kerbLane))} m) ${L.exitLen >= decelLength(100, CD_DEFAULTS.speedKmh) ? 'OK' : 'FAIL'}`);
  console.log(`mainline entrance: transition ${L.entryLen} m (needs accel ${f(accelLength(100, CD_DEFAULTS.speedKmh))} m) ${L.entryLen >= accelLength(100, CD_DEFAULTS.speedKmh) ? 'OK' : 'FAIL'}`);
  const cd = m.ramps.find(r => r.id === 'mf-cd')!;
  let rmin = 1e9;
  for (let i = 1; i < cd.local.length - 1; i++) { const a = cd.local[i-1], b = cd.local[i], c = cd.local[i+1]; const ab = Math.hypot(b.u-a.u,b.v-a.v), bc = Math.hypot(c.u-b.u,c.v-b.v), ac = Math.hypot(c.u-a.u,c.v-a.v); const ar = Math.abs((b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u)); if (ar > 1e-6) rmin = Math.min(rmin, ab*bc*ac/(2*ar)); }
  console.log(`C-D S-curve min radius ${f(rmin)} m -> V ${speedOfRadius(rmin)} km/h (C-D design ${CD_DEFAULTS.speedKmh}, mainline 100)`);
  const w = 2 * (AV.kerbLane + loopR);
  console.log(`weaving on the C-D (loop entrance -> loop exit): ${f(w)} m (min ${C.weaveMin}, desirable ${C.weaveDesirable}) ${w >= C.weaveMin ? 'OK (min)' : 'FAIL'}`);
}
