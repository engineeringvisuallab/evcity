// HK-3 layout numbers (no src change). Run from the game root: npx tsx scripts/hk-layout.ts
// Uses the real formulas of src/interchange/Standards.ts and the C-D formulas copied BY READING of PatternCD.ts cdLayout (same arithmetic, same CD_DEFAULTS).
import { CRITERIA, minRadius, speedOfRadius, decelLength, accelLength } from '../src/interchange/Standards';
import { writeFileSync } from 'fs';
const out: string[] = []; let fails = 0;
const say = (s: string) => { out.push(s); console.log(s); };
const chk = (name: string, ok: boolean, info: string) => { if (!ok) fails++; say(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${info}`); };
const r1 = (x: number) => Math.round(x * 10) / 10;

// 1 loops (D3)
const loops = [{ id: 'NE pond', R: 55, V: 45 }, { id: 'SE pond', R: 55, V: 45 }, { id: 'NW lawn', R: 115, V: 60 }, { id: 'SW lawn', R: 115, V: 60 }];
for (const l of loops) chk(`H1 loop ${l.id}`, l.R >= minRadius(l.V) && l.R >= minRadius(40), `R ${l.R} m >= minRadius(V${l.V}) ${r1(minRadius(l.V))} m and >= V40 ${r1(minRadius(40))} m; R supports V${speedOfRadius(l.R)}`);

// 2 vertical need (D1: ring over). rise = clearance 5.5 + deck: game default 1.4 -> 6.9 m; thick flyover deck 2.3 -> 7.8 m
for (const deck of [1.4, 2.3]) for (const l of [loops[0], loops[2]]) {
  const rise = 5.5 + deck, arc = l.R * Math.PI * 1.5; // 270 deg arc only, spirals and tapers not counted (they add length)
  const g = (1.5 * rise) / arc; // smoothstep peak grade, as Levels.ts rampProfile
  chk(`H1 ramp grade R${l.R} rise ${r1(rise)}`, g <= CRITERIA.rampMaxGrade, `peak ${r1(g * 100)} % over a ${Math.round(arc)} m arc (limit ${CRITERIA.rampMaxGrade * 100} %)`);
}

// 3 C-D roads on the N-S ground road (arm side worst case: M8 half 22.1, V80 assumed, kerb lane centre 17.3 ASSUMED = half - shoulder 3 - 1.825)
const half = 22.1, kerb = 17.3, Vmain = 80, sep = 3, rampHalf = 4.2, vCDspeed = 50, leadIn = 60, leadOut = 60;
const vCD = half + sep + rampHalf, shift = vCD - kerb;
const c10 = (x: number) => Math.ceil(x / 10) * 10;
const exitLen = c10(Math.max(decelLength(Vmain, vCDspeed), 15 * shift)), entryLen = c10(Math.max(accelLength(Vmain, vCDspeed), 20 * shift));
say(`C-D: offset ${r1(vCD)} m, shift ${r1(shift)} m, exit transition ${exitLen} m (decel ${r1(decelLength(Vmain, vCDspeed))}, 15 x shift ${r1(15 * shift)}), entry transition ${entryLen} m (accel ${r1(accelLength(Vmain, vCDspeed))}, 20 x shift ${r1(20 * shift)})`);
const ext: Record<number, { south: number; north: number }> = {};
for (const slip of [250, 150]) {
  const first = kerb + slip, south = first + leadIn + exitLen, north = first + leadOut + entryLen;
  ext[slip] = { south, north };
  chk(`H3 C-D extent slipSize ${slip} vs link structure 462 m (south)`, south < 462, `${Math.round(south)} m from the node`);
  chk(`H3 C-D extent slipSize ${slip} vs arm structure 584 m (north)`, north < 584, `${Math.round(north)} m from the node`);
}
// 4 weaving on the C-D (ESTIMATE from sketch: gore spacing = 2 x loop centre offset from the ring)
for (const [side, off] of [['east C-D (ponds)', 95], ['west C-D (lawns)', 155]] as const) {
  const w = 2 * off;
  chk(`H4 weave ${side} (ESTIMATE)`, w >= CRITERIA.weaveMin, `${w} m (min ${CRITERIA.weaveMin}, desirable ${CRITERIA.weaveDesirable}: ${w >= CRITERIA.weaveDesirable ? 'meets' : 'below'} desirable)`);
}
// 5 speed change on the ring (V100 flyover, plain exits D2): taper not included
for (const V of [45, 60]) say(`ring exit decel 100 -> ${V}: ${Math.round(decelLength(100, V))} m;  entrance accel ${V} -> 85: ${Math.round(accelLength(100, V))} m`);
// 6 footprint (sketch positions): loops bounding box
const box = { x0: -(115 * 2 + 55), x1: 70 + 55 * 2, y0: -(155 + 115), y1: 155 + 115 };
say(`footprint of the 4 loops (sketch): x ${box.x0} .. ${box.x1}, y ${box.y0} .. ${box.y1} m = ${box.x1 - box.x0} x ${box.y1 - box.y0} m (video estimate 600-700 m across)`);
say(`CARRIED FROM HK-0, NOT RE-RUN: quadrant boxes NW fill 12.0 m FAIL, NE fill 12.9 / wet FAIL, SE fill 14.8 / wet FAIL, SW cut 10.9 PASS.`);
say(`NOT RUN: game, tsc, build, terrain check of the new loop positions, ramp spirals.`);
say(`RESULT ${fails} FAIL`);
writeFileSync('docs/HK_LAYOUT.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_layout.json', JSON.stringify({ vCD, shift, exitLen, entryLen, ext, box }, null, 1));
