// ROAD SIGN OVERBRIDGE - STEP 4-1: the design sheet. Runs the hand checks of src/signs/RoadSignBridgeSpec.ts for a typical 8-lane road (M8), a typical 6-lane road (R6) and for every one of the
// real 6 / 8-lane sign sites of RoadSignData.ts (their real half width, median and ground at the stair feet). READ ONLY for the game: nothing in src is changed by this script.
//   npx tsx scripts/road-sign-bridge-design.ts        (prints the sheet and writes docs/STEP_SIGN_BRIDGE_1_OUTPUT.txt)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { GANTRY } from '../src/signs/RoadSignSpec';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { BR, bridgeDesign, chsArea, type BridgeDesign, type BridgeInput } from '../src/signs/RoadSignBridgeSpec';

const out: string[] = [];
const say = (s = ''): void => {
  out.push(s);
  console.log(s);
};
let pass = 0, fail = 0;

function sheet(title: string, inp: BridgeInput): BridgeDesign {
  const d = bridgeDesign(inp);
  say(`=== ${title}: ${inp.lanes} lane, half width ${inp.halfWidth} m, median ${2 * inp.medianHalf} m, shoulder ${inp.shoulder} m ===`);
  say(`GEOMETRY  piers at x = -${d.edge.toFixed(1)}, 0, +${d.edge.toFixed(1)} (hammerhead, column ${BR.colX} x ${BR.colZ} m, cap ${BR.capX} x ${BR.capZ} x ${BR.capDepth} m, pile cap ${BR.pileCapX} x ${BR.pileCapZ} x ${BR.pileCapH} m on 4 bored piles D ${BR.pileD} m)`);
  say(`          2 equal spans of ${d.span.toFixed(1)} m, 2 Warren trusses ${BR.trussGap} m apart, ${d.panels} panels of ${d.panel.toFixed(2)} m per span, truss + board ${BR.trussH} m high, walkway ${BR.walkW} m clear`);
  say(`          under the floor ${BR.clearance} m above the road surface, walking surface ${d.deckTop.toFixed(1)} m, board top ${d.boardTop.toFixed(1)} m; board A on the +Z side (face looks +Z), board B on the -Z side (face looks -Z)`);
  say(`CHORDS    CHS ${(d.chord.D * 1000).toFixed(1)} x ${(d.chord.t * 1000).toFixed(1)} (A = ${(chsArea(d.chord) * 1e4).toFixed(0)} cm2), lever arm ${d.hc.toFixed(2)} m; dead weight of the 2 spans about ${d.deadWeight.toFixed(0)} t (floor, trusses, boards)`);
  say(`LOADS     dead ${d.g.toFixed(1)} kN/m, live ${d.q.toFixed(1)} kN/m (${BR.liveLoad} kPa x ${BR.walkW} m); wind ${BR.windSpeed} m/s: q ${d.windQ.toFixed(2)} kPa, ${d.windPerM.toFixed(1)} kN/m, total ${d.windTotal.toFixed(0)} kN, moment per pier ${d.windMomentPier.toFixed(0)} kNm`);
  say(`PIERS     median pier vertical ${d.pierN.toFixed(0)} kN with footing; wind case pile force ${d.pileMin.toFixed(0)} .. ${d.pileMax.toFixed(0)} kN; column ${d.colStress.toFixed(1)} MPa`);
  for (const [n, s] of [['left ', d.stairL], ['right', d.stairR]] as const) say(`STAIR ${n} rise ${s.rise.toFixed(2)} m, ${s.risers} risers of ${(s.riser * 1000).toFixed(0)} mm, flights ${s.flights.join('+')}, tower ${s.towerW.toFixed(1)} x ${s.towerL.toFixed(1)} m`);
  for (const c of d.checks) {
    say(`${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.text}`);
    if (c.ok) pass++;
    else fail++;
  }
  say();
  return d;
}

const base = { shoulder: 0.6, postGap: GANTRY.postGap, feetL: 0, feetR: 0 };
sheet('TYPICAL 8-LANE (M8, J1 arms)', { lanes: 8, halfWidth: 22.1, medianHalf: 3, ...base });
sheet('TYPICAL 6-LANE (R6, M6-1)', { lanes: 6, halfWidth: 16, medianHalf: 2, ...base });

// the stair table: ground at the foot against the walking surface
say('=== STAIR TABLE (ground at the foot relative to the road surface -> flights) ===');
for (const f of [-7, -5, -3, -2, -1, 0, 1, 2, 3, 4, 6]) {
  const d = bridgeDesign({ lanes: 8, halfWidth: 22.1, medianHalf: 3, ...base, feetL: f, feetR: f }).stairL;
  say(`foot ${f >= 0 ? '+' : ''}${f} m: rise ${d.rise.toFixed(1)} m, ${d.risers} risers in ${d.flights.length} flight(s), tower ${d.towerW.toFixed(1)} x ${d.towerL.toFixed(1)} m${f < BR.feetMin || f > BR.feetMax ? '   <- outside the window ' + BR.feetMin + '..' + BR.feetMax : ''}`);
}
say();

// the real sites (6 / 8 lane sign gantries of step 3)
const g = new TerrainGenerator(Config.world.seed);
say('=== REAL SITES: the 6 / 8-lane gantries of RoadSignData.ts (the ones the overbridge replaces) ===');
let okSites = 0, total = 0;
const bad: string[] = [];
for (const s of ROAD_SIGN_SPOTS) {
  if (s.sections < 3) continue;
  const r = g.roads.roads.find((q) => q.name === s.road);
  if (!r) continue;
  total++;
  const d = bridgeDesign({ lanes: r.lanes, halfWidth: r.halfWidth, medianHalf: r.medianHalf, shoulder: r.shoulder, postGap: GANTRY.postGap, feetL: s.feetL, feetR: s.feetR });
  const fails = d.checks.filter((c) => !c.ok);
  if (!fails.length) okSites++;
  else bad.push(`${s.id} ${s.road} s ${s.s}: ${fails.map((c) => c.id).join(', ')}`);
  say(`${fails.length ? 'FAIL' : 'PASS'} ${s.id} ${s.road} (${r.lanes} lane) s ${s.s}: feet ${s.feetL.toFixed(2)} / ${s.feetR.toFixed(2)} m, stairs ${d.stairL.flights.join('+')} | ${d.stairR.flights.join('+')} risers, chord ${(d.chord.D * 1000).toFixed(0)}x${(d.chord.t * 1000).toFixed(1)}${fails.length ? '   ' + fails.map((c) => c.id).join(', ') : ''}`);
}
say(`${okSites} of ${total} real sites pass every check as they are` + (bad.length ? `; to move or fix: ${bad.length}` : ''));
say();
say(`SUMMARY: ${pass} PASS, ${fail} FAIL in the two typical sheets; real sites ${okSites} / ${total}.`);
writeFileSync(new URL('../docs/STEP_SIGN_BRIDGE_1_OUTPUT.txt', import.meta.url), out.join('\n') + '\n');
if (fail) process.exitCode = 1;
