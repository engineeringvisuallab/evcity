// ROAD SIGN OVERBRIDGE - STEP 4-3: headless check of the bridge geometry (src/signs/RoadSignBridgeGeo.ts) for every 6 / 8-lane site of RoadSignData.ts.
//   npx tsx scripts/road-sign-bridge-geo-test.ts
import { GANTRY, BOARD_H } from '../src/signs/RoadSignSpec';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { BR, bridgeDesign, deckTop, stairDesign } from '../src/signs/RoadSignBridgeSpec';
import { bridgeParts } from '../src/signs/RoadSignBridgeGeo';

let pass = 0, fail = 0;
const ok = (cond: boolean, text: string): void => {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL ' + text);
  }
};
let n = 0;
for (const s of ROAD_SIGN_SPOTS) {
  if (s.sections < 3) continue;
  n++;
  const lanes = s.sections >= 4 ? 8 : 6;
  const medianHalf = lanes === 8 ? 3 : 2;
  const halfWidth = s.edge - 0.6 - GANTRY.postGap;
  const d = bridgeDesign({ lanes, halfWidth, medianHalf, shoulder: 0.6, postGap: GANTRY.postGap, feetL: s.feetL, feetR: s.feetR });
  const parts = bridgeParts({ edge: s.edge, boardW: s.boardW, chordD: d.chord.D, panels: d.panels, feetL: s.feetL, feetR: s.feetR });
  const dT = deckTop();
  const tag = `${s.id} ${s.road}`;
  const kerb = halfWidth + 0.6; // outer edge of the shoulder
  // 1. nothing low stands on the carriageway: every part whose lowest point is below the floor underside must be outside |x| in [medianHalf, kerb]
  let lowBad = 0;
  for (const p of parts) {
    const hy = p.t === 'b' ? p.b / 2 : p.a;
    if (p.cy - hy >= BR.clearance - 0.01) continue; // up in the structure
    const hx = p.t === 'b' ? p.a / 2 : p.b / 2;
    const x0 = p.cx - hx, x1 = p.cx + hx;
    const inCarriage = Math.abs(p.cx) > 1e-6 ? x1 > -kerb && x0 < kerb && !(x0 > kerb || x1 < -kerb) && (Math.abs(x0) < kerb || Math.abs(x1) < kerb) : false;
    const inMedian = x0 >= -medianHalf + 0.001 && x1 <= medianHalf - 0.001;
    if ((inCarriage && !inMedian) || (!inCarriage && Math.abs(p.cx) < 1e-6 && !inMedian && p.t === 'b')) lowBad++;
  }
  ok(lowBad === 0, `${tag}: ${lowBad} low parts stand on the carriageway`);
  // 2. the two boards: bottom at the walking surface, top at the truss top
  const boards = parts.filter((p) => p.t === 'b' && p.solid && Math.abs(p.a - (s.boardW + 0.12)) < 1e-6);
  ok(boards.length === 2, `${tag}: 2 boards, got ${boards.length}`);
  for (const b of boards) ok(Math.abs(b.cy - b.b / 2 + 0.06 - dT) < 1e-6 && Math.abs(b.b - 0.12 - BOARD_H) < 1e-6, `${tag}: board y`);
  ok(boards.length === 2 && boards[0].cz * boards[1].cz < 0, `${tag}: boards on both sides`);
  // 3. every stair tower: highest landing at the walking surface, towers outside the floor end, riser from the design
  for (const [side, feet] of [[-1, s.feetL], [1, s.feetR]] as const) {
    const T = stairDesign(dT - feet);
    const lands = parts.filter((p) => p.t === 'b' && p.solid && Math.abs(p.b - 0.2) < 1e-9 && Math.abs(p.c - BR.landing) < 1e-9 && p.cx * side > 0);
    ok(lands.length === T.flights.length, `${tag}: ${side < 0 ? 'left' : 'right'} landings ${lands.length} vs flights ${T.flights.length}`);
    const topY = Math.max(...lands.map((l) => l.cy + 0.1));
    ok(Math.abs(topY - dT) < 1e-6, `${tag}: top landing ${topY.toFixed(3)} vs walking surface ${dT.toFixed(3)}`);
    const topL = lands.find((l) => Math.abs(l.cy + 0.1 - dT) < 1e-6);
    ok(!!topL && Math.abs(topL.cz) < 1e-6, `${tag}: top landing centred on z = 0`);
    const steps = parts.filter((p) => !p.vis && p.solid && p.cx * side > 0);
    ok(steps.every((p) => Math.abs(p.cx) - p.a / 2 >= s.edge + BR.capX / 2 + 0.1 - 1e-6), `${tag}: step blocks outside the floor end`);
    ok(steps.length === T.risers - T.flights.length, `${tag}: ${steps.length} step blocks vs ${T.risers - T.flights.length}`);
  }
}
console.log(`${fail ? 'FAIL' : 'ALL PASS'}: ${pass} PASS, ${fail} FAIL (${n} bridges)`);
if (fail) process.exitCode = 1;
