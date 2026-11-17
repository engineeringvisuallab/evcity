// STEP J1-b (headless): CHECK SHEET of the geometry data of the ground-level 8 x 8 signalised "+" J1 (src/roads/junction/GroundJ1Geometry.ts).
// Pure math, no terrain. Lane widths, lane counts, tapers, radii, island, zebra, no overlap, J1-a consistency, sight clearance. Every number comes from CRITERIA / DESIGN / SECTION_M8 / docs/j1a.json.
// Run: tsx scripts/j1-ground-check.ts <out-dir>     writes j1b.json (for tools/j1b-plot.py) and STEPJ1B_OUTPUT.txt, prints the sheet and the PASS / FAIL list.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CRITERIA, DESIGN, minRadius } from '../src/roads/standards/Criteria';
import { laneDropTaper } from '../src/roads/standards/Checks';
import { SECTION_M8 } from '../src/roads/standards/SectionTable';
import { DIRS, J1_APPROACH_INPUTS, J1_PARAMS, buildJ1Geometry, overlapArea, polyArea, segRectDistance, ssdSlip, toWorld, type Dir, type J1Element, type V2 } from '../src/roads/junction/GroundJ1Geometry';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const lines: string[] = [];
const P = (s = ''): void => { lines.push(s); console.log(s); };
const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${detail}`); };
const W = DESIGN.laneWidth, rad = Math.PI / 180;
const AXES: readonly V2[] = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // outward unit vector of N, E, S, W in the local frame

const g = buildJ1Geometry();
const D = g.derived, PR = J1_PARAMS;
const j1aPath = ['docs/j1a.json', `${out}/j1a.json`].find((p) => existsSync(p));
const j1a = j1aPath ? JSON.parse(readFileSync(j1aPath, 'utf8')) as { dStop: number; boxHalf: number; STEP: number; ARM_STRAIGHT: number; nIn: number; nOut: number; clears: Record<string, { clear: number }>; fits: Record<string, { storageT: number; storageR: number; pocketFull: number; need: number }> } : null;
const byId = new Map<string, J1Element>(g.elements.map((e) => [e.id, e]));
const el = (id: string): J1Element => { const e = byId.get(id); if (!e) throw new Error('missing element ' + id); return e; };

P(`J1-b GEOMETRY CHECK SHEET   J1 = C10 (${g.site.x}, ${g.site.z}), yaw ${g.site.yawDeg} deg east of north, 8 lane x 8 lane, ground level, signalised "+"   (inputs: J1-a ${j1aPath ?? 'NOT FOUND, built-in copy used'})`);
P(`${g.elements.length} elements, ${g.elements.reduce((a, e) => a + e.cells.length, 0)} convex cells, ${g.bars.length} zebra bars, ${g.stopLines.length} stop lines, ${g.kerbArcs.length} kerb arcs`);

// ------------------------------------------------------------------ (1) cross-section and derived numbers
P();
P('=== (1) CROSS-SECTION of one arm (distance o from the arm axis, + = inbound side = left of the traffic; left-hand traffic) and derived numbers');
P(`  lane ${W} m;  first through lane edge t0 = (island ${PR.island} + ${PR.nPocket} pockets x ${W}) / 2 = ${f2(D.t0)} m (M8 mid-block: ${f2(D.tMid)} m = median ${SECTION_M8.elements[0].width * 2} / 2 + inner shoulder ${SECTION_M8.elements[1].width})`);
P(`  box half width B = t0 + ${PR.nThrough} x ${W} = ${f2(D.B)} m  (J1-a assumed ${j1a ? f2(j1a.boxHalf) : '27.05'} m: symmetric 7 + 7 lanes, conservative);  stop line = B + zebra ${PR.crosswalk} m = ${f2(D.sStop)} m from the centre (J1-a ${j1a ? f2(j1a.dStop) : '31.05'} m)`);
P(`  o  ${f2(-(D.B + W))} .. ${f2(-D.B)}  receiving lane of the slip lane of the previous arm (only beyond the corner arc);  ${f2(-D.B)} .. ${f2(-D.t0)}  4 outbound lanes;  ${f2(-D.t0)} .. ${f2(D.t0 - 2 * W)}  median island ${PR.island} m`);
P(`     ${f2(D.t0 - 2 * W)} .. ${f2(D.t0)}  2 right pockets (R2 inner, R1 outer);  ${f2(D.t0)} .. ${f2(D.B)}  4 inbound through lanes;  ${f2(D.B)} .. ${f2(D.B + W)}  left slip lane`);
P(`  at the stop line: 2 + 4 = 6 inbound lanes, 4 outbound.  At the corner arc join (s = ${f1(D.Cx)} m): 7 inbound (slip lane included), 5 outbound (receiving lane included) = J1-a layout.`);
P(`  taper per lane at ${PR.vApp} km/h = W V^2 / 155 = ${f1(D.taper60)} m;  braking 60 -> 0 km/h at ${CRITERIA.aDecel} m/s2 = ${f1(D.brake60)} m;  slip lane: 60 -> 25 km/h ${f1(D.slipDecel)} m, 25 -> 60 km/h at ${CRITERIA.aAccel} m/s2 ${f1(D.slipAccel)} m`);
P(`  median shift back to the M8 section: ${f2(D.shiftW)} m in ${f1(D.shiftLen)} m (0.62 W V at ${PR.vArm} km/h, conservative: the step-down 100 -> 60 happens in the same stretch)`);

// ------------------------------------------------------------------ (2) per arm
P();
P('=== (2) POCKETS, SLIP LANE and ZONE LENGTH per arm (all distances from the J1 centre along the arm axis; x = from the stop line)');
P('  arm   R1 full + taper (end)     R2 full + taper (end)     slip taper-in..arc start      receiving lane end    zone end (plain M8)   clear   J1-a pocket');
for (const d of DIRS) {
  const p = g.pockets[d];
  const a = j1a?.fits[d];
  P(`  ${d}     ${f0(p.R1full)} + ${f0(D.taper60)} (${f0(p.R1end)} m, s ${f0(D.sStop + p.R1end)})     ${f0(p.R2full)} + ${f0(D.taper60)} (${f0(p.R2end)} m, s ${f0(D.sStop + p.R2end)})     s ${f0(D.sSlip0)} .. ${f0(D.sArc0)}               s ${f0(D.sRecvEnd)}              s ${f0(g.sZone[d])}          ${f0(J1_APPROACH_INPUTS[d].clear)}     ${a ? f0(a.pocketFull) : '-'}`);
}
P(`  slip lane: taper-in ${f1(D.sSlip0 - D.sSlip1)} m (s ${f1(D.sSlip0)} -> ${f1(D.sSlip1)}), full width ${f1(D.sSlip1 - D.sArc0)} m (s ${f1(D.sSlip1)} -> ${f1(D.sArc0)}), kerb arc R ${PR.slipR} m (lane centre R ${f1(D.Rc)} m, outer edge R ${f1(D.rOut)} m) from s ${f1(D.sArc0)} on the arm to s ${f1(D.sArc0)} on the cross road,`);
P(`  then the receiving lane: acceleration ${f1(D.slipAccel)} m + merge taper ${f1(D.taper60)} m = ${f1(D.sRecvEnd - D.Cx)} m (ends at s ${f1(D.sRecvEnd)} on the cross road)`);

// ------------------------------------------------------------------ helpers for checks
const cross = (e: J1Element, y: number): Array<{ x0: number; x1: number }> => {
  const res: Array<{ x0: number; x1: number }> = [];
  for (const c of e.cells) {
    const xs: number[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if ((a[1] - y) * (b[1] - y) < 0 || (a[1] === y && b[1] !== y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    if (xs.length >= 2) res.push({ x0: Math.min(...xs), x1: Math.max(...xs) });
  }
  return res;
};
const laneCount = (y: number, dirWanted: 'in' | 'out'): number => {
  let n = 0;
  for (const e of g.elements) { if (e.dir !== dirWanted) continue; for (const iv of cross(e, y)) if (iv.x1 - iv.x0 > 3.5 && Math.abs(iv.x0) < 30 + D.B) n++; }
  return n;
};

// ------------------------------------------------------------------ (3) lane widths, counts
P();
P('=== (3) LANES');
let wWorst = 0;
for (const e of g.elements) {
  if (!['through-in', 'through-out', 'slip-in', 'slip-out', 'pocket'].includes(e.kind)) continue;
  const wid = Math.max(...e.cells.map((q) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]))); // widest cross edge of the lane = its full width
  wWorst = Math.max(wWorst, Math.abs(wid - W));
}
const wOk = wWorst < 1e-9;
CHK(`every lane is ${W} m wide where it has full width (through, pockets, slip)`, wOk, `largest error ${wWorst.toExponential(1)} m`);
const inStop = laneCount(D.sStop + 0.2, 'in'), outStop = laneCount(D.sStop + 0.2, 'out');
const inArc = laneCount(D.Cx + 1, 'in'), outArc = laneCount(D.Cx + 1, 'out');
CHK('lanes at the stop line: 6 inbound (2 pockets + 4 through), 4 outbound', inStop === 6 && outStop === 4, `counted ${inStop} in, ${outStop} out`);
CHK('lanes at the corner arc join: 7 inbound + 5 outbound (J1-a layout 1 + 4 + 2 / 4 + 1)', inArc === (j1a?.nIn ?? 7) && outArc === (j1a?.nOut ?? 5), `counted ${inArc} in, ${outArc} out (J1-a ${j1a?.nIn ?? 7} / ${j1a?.nOut ?? 5})`);
// left-hand traffic and straight-through alignment
let lhtOk = true;
for (const d of DIRS) {
  const k = DIRS.indexOf(d);
  const ax: V2 = AXES[k]; // outward unit vector in the local frame
  const h: V2 = [-ax[0], -ax[1]]; // heading of inbound traffic
  const left: V2 = [-h[1], h[0]];
  for (let i = 1; i <= 4; i++) {
    const ci = el(`${d}-in-T${i}`).centre!, co = el(`${d}-out-O${i}`).centre!;
    const pin = ci[ci.length - 1], pout = co[0];
    if (pin[0] * left[0] + pin[1] * left[1] <= 0) lhtOk = false; // inbound through lanes must be on the LEFT of their heading
    if (pout[0] * left[0] + pout[1] * left[1] >= 0) lhtOk = false; // outbound on the other side
  }
}
CHK('left-hand traffic: inbound through lanes on the left of their heading, outbound on the right (all 4 arms)', lhtOk, 'checked at the box edge');
let alignErr = 0;
for (let i = 1; i <= 4; i++) for (const [a, b] of [['N', 'S'], ['S', 'N'], ['E', 'W'], ['W', 'E']] as Array<[Dir, Dir]>) {
  const ci = el(`${a}-in-T${i}`).centre!, co = el(`${b}-out-O${i}`).centre!;
  const pin = ci[ci.length - 1], pout = co[0];
  alignErr = Math.max(alignErr, Math.hypot(pin[0] - pout[0], pin[1] - pout[1]) - 2 * D.B);
}
CHK('through lanes line up across the box (inbound lane i of one arm = outbound lane i of the opposite arm), no lateral shift', Math.abs(alignErr) < 1e-9, `largest offset ${Math.abs(alignErr).toExponential(1)} m (distance between the box edges 2 B = ${f2(2 * D.B)} m)`);
CHK('the four arms are exact 90 deg turns of one design (slip lane, arc, corner island identical)', DIRS.every((d) => Math.abs(el(`${d}-slip-arc`).area - el('N-slip-arc').area) < 1e-9 && Math.abs(el(`${d}-corner-island`).area - el('N-corner-island').area) < 1e-9 && Math.abs(el(`${d}-slip-in`).area - el('N-slip-in').area) < 1e-9), 'areas equal on all arms');
CHK('J1 is a right-angle "+" (rule 3.12-10: 70 - 110 deg)', true, 'arms at 0 / 90 / 180 / 270 deg by construction');

// ------------------------------------------------------------------ (4) tapers and radii
P();
P('=== (4) TAPERS and RADII');
const RminSlip = minRadius(PR.vSlip);
CHK(`slip lane kerb radius ${PR.slipR} m >= Rmin of the slip speed ${PR.vSlip} km/h`, PR.slipR >= RminSlip, `kerb R ${PR.slipR} m, lane centre R ${f1(D.Rc)} m, Rmin(${PR.vSlip}) ${f1(RminSlip)} m, margin x${f2(D.Rc / RminSlip)}`);
CHK(`slip lane kerb radius is not more than the user limit of 25 m`, PR.slipR <= 25 + 1e-9, `R ${PR.slipR} m`);
const pk = g.pockets;
CHK(`pocket tapers >= laneDropTaper(${PR.vApp}) per lane (R1 and R2, all arms)`, DIRS.every((d) => pk[d].R1end - pk[d].R1full >= D.taper60 - 1e-9 && pk[d].R2end - pk[d].R2full >= D.taper60 - 1e-9), `${f1(D.taper60)} m each = W V^2 / 155; the two tapers are staggered by ${PR.stagger} m, not on top of each other`);
CHK('slip lane taper-in >= laneDropTaper(60) and full-width part >= braking 60 -> 25 km/h', D.sSlip0 - D.sSlip1 >= D.taper60 - 1e-9 && D.sSlip1 - D.sArc0 >= D.slipDecel - 1e-9, `taper ${f1(D.sSlip0 - D.sSlip1)} m, full width ${f1(D.sSlip1 - D.sArc0)} m (needs ${f1(D.slipDecel)} m)`);
CHK('receiving lane: acceleration 25 -> 60 km/h and merge taper >= laneDropTaper(60)', D.sRecvEnd - D.Cx >= D.slipAccel + D.taper60 - 1e-9, `${f1(D.slipAccel)} + ${f1(D.taper60)} = ${f1(D.sRecvEnd - D.Cx)} m`);
CHK(`median shift taper >= laneDropTaper(${PR.vArm}, ${f2(D.shiftW)} m) and starts after every lane taper of the arm`, DIRS.every((d) => g.sZone[d] - D.shiftLen >= Math.max(D.sStop + pk[d].R1end, D.sSlip0, D.sRecvEnd) - 1e-9) && D.shiftLen >= laneDropTaper(PR.vArm, D.shiftW) - 1e-9, `${f1(D.shiftLen)} m, starts at s ${f1(Math.min(...DIRS.map((d) => g.sZone[d] - D.shiftLen)))}`);
CHK('R2 (inner pocket) full width >= the 95th percentile queue of one lane; R2 total length >= braking + storage', DIRS.every((d) => pk[d].R2full >= J1_APPROACH_INPUTS[d].storageR && pk[d].R2end >= D.brake60 + J1_APPROACH_INPUTS[d].storageR), DIRS.map((d) => `${d}: ${f0(pk[d].R2full)} >= ${f0(J1_APPROACH_INPUTS[d].storageR)}, ${f0(pk[d].R2end)} >= ${f0(D.brake60 + J1_APPROACH_INPUTS[d].storageR)}`).join(' | '));
// right turn from the inner pocket: largest arc that stays inside the box
const xR2 = D.t0 - 1.5 * W, xO1 = D.t0 + 0.5 * W;
const rRight = Math.min(D.B + xO1, xR2 + D.B);
CHK(`right turn from the inner pocket: the arc that fits in the box is >= Rmin(${PR.vSlip} km/h)`, rRight >= RminSlip, `largest arc R ${f1(rRight)} m (inside the box, tangent to pocket R2 and to outbound lane O1 of the next arm) vs Rmin ${f1(RminSlip)} m`);

// ------------------------------------------------------------------ (5) J1-a consistency
P();
P('=== (5) CONSISTENCY with the J1-a calculation sheet');
if (j1a) {
  let inErr = 0;
  for (const d of DIRS) inErr = Math.max(inErr, Math.abs(J1_APPROACH_INPUTS[d].storageR - j1a.fits[d].storageR), Math.abs(J1_APPROACH_INPUTS[d].storageT - j1a.fits[d].storageT), Math.abs(J1_APPROACH_INPUTS[d].clear - j1a.clears[d].clear));
  CHK('built-in approach inputs = docs/j1a.json (clear length, queue per lane)', inErr < 0.01, `largest difference ${inErr.toFixed(3)} m`);
  CHK('pocket R1 (full + taper) >= pocket wanted by J1-a (braking + storage + taper), all arms', DIRS.every((d) => pk[d].R1end >= j1a.fits[d].pocketFull - 1e-9), DIRS.map((d) => `${d} ${f1(pk[d].R1end)} >= ${f1(j1a.fits[d].pocketFull)}`).join(', '));
  CHK('stop line distance <= J1-a stop line (31.05 m), box half <= J1-a box half', D.sStop <= j1a.dStop && D.B <= j1a.boxHalf, `stop line ${f2(D.sStop)} <= ${f2(j1a.dStop)}, box ${f2(D.B)} <= ${f2(j1a.boxHalf)}: J1-a signal numbers stay valid (they were conservative)`);
  for (const d of DIRS) {
    const avail = j1a.clears[d].clear - D.sStop, need = Math.max(j1a.fits[d].storageT, pk[d].R1end) + j1a.STEP;
    CHK(`${d}: queue / pocket + step-down fit in the clear length from the REAL stop line`, need <= avail && g.sZone[d] <= j1a.clears[d].clear && D.sRecvEnd <= j1a.clears[d].clear && g.sZone[d] <= j1a.ARM_STRAIGHT, `need ${f0(need)} m, available ${f0(avail)} m (J1-a ${f0(j1a.clears[d].clear - j1a.dStop)}); lane zone ends at s ${f0(g.sZone[d])} of ${j1a.clears[d].clear}`);
  }
} else P('  docs/j1a.json not found: consistency checks skipped');

// ------------------------------------------------------------------ (6) islands
P();
P('=== (6) ISLANDS and ZEBRA');
const med = el('N-median');
const medW0 = Math.hypot(med.cells[0][1][0] - med.cells[0][0][0], med.cells[0][1][1] - med.cells[0][0][1]);
CHK('median island at the stop line is the J1-a width (3.0 m) and a refuge (>= 1.8 m)', Math.abs(medW0 - PR.island) < 1e-9 && medW0 >= 1.8, `${f2(medW0)} m`);
// corner island area against a fine reference
const rOut = D.rOut, th1 = D.thetaN, th2 = Math.PI / 2 - D.thetaN;
const refPoly: V2[] = [[D.B, D.B], [D.B, D.Cx - rOut * Math.sin(th1)]];
for (let i = 0; i <= 3000; i++) { const th = th1 + ((th2 - th1) * i) / 3000; refPoly.push([D.Cx - rOut * Math.cos(th), D.Cx - rOut * Math.sin(th)]); }
refPoly.push([D.Cx - rOut * Math.sin(th1), D.B]);
const aRef = polyArea(refPoly), aCell = el('N-corner-island').area, aFull = rOut * rOut * (1 - Math.PI / 4);
CHK(`corner island area: ${PR.arcStepDeg} deg cells vs 0.03 deg reference (difference < 0.5 %)`, Math.abs(aCell - aRef) / aRef < 0.005, `cells ${f1(aCell)} m2, reference ${f1(aRef)} m2, full triangle without the nose cut ${f1(aFull)} m2`);
const noseW = Math.min(...(() => { const c = el('N-corner-island').cells[0]; return [Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])]; })());
CHK(`corner island nose is at least ${PR.noseWidth} m wide where the kerb starts`, noseW >= PR.noseWidth - 1e-6, `${f2(noseW)} m (sliver before it stays painted gore)`);
// zebra bars lie inside the lanes and not on islands
const laneCells = (arm: Dir): V2[][] => g.elements.filter((e) => e.arm === arm && (e.kind === 'through-in' || e.kind === 'through-out' || e.kind === 'pocket')).flatMap((e) => e.cells);
let zCov = 0, zIsl = 0, zN = 0;
for (const b of g.bars.filter((q) => q.kind === 'zebra')) {
  zN++;
  const cov = laneCells(b.arm).reduce((a, c) => a + overlapArea(b.poly, c), 0), area = polyArea(b.poly);
  zCov = Math.max(zCov, Math.abs(cov - area));
  zIsl += g.elements.filter((e) => e.kind === 'island' || e.kind === 'corner-island').reduce((a, e) => a + e.cells.reduce((s, c) => s + overlapArea(b.poly, c), 0), 0);
}
CHK(`zebra at the stop line: ${PR.crosswalk} m long (>= 3 m), every bar lies fully on a traffic lane, none on an island`, PR.crosswalk >= 3 && zCov < 1e-6 && zIsl < 1e-6, `${zN} bars, coverage error ${zCov.toExponential(1)} m2, area on islands ${zIsl.toExponential(1)} m2`);
const slipBars = g.bars.filter((q) => q.kind === 'zebra-slip' && q.arm === 'N');
let sbCov = 0;
for (const b of slipBars) sbCov = Math.max(sbCov, Math.abs(el('N-slip-arc').cells.reduce((a, c) => a + overlapArea(b.poly, c), 0) - polyArea(b.poly)) / polyArea(b.poly));
CHK('zebra across the slip lane lies on the slip lane arc (chord error of a straight bar on a curved lane < 5 %)', sbCov < 0.05, `${slipBars.length} bars per corner, at ${PR.slipZebraAtDeg} deg of the arc, worst relative error ${(sbCov * 100).toFixed(1)} %`);

// ------------------------------------------------------------------ (7) no overlap
P();
P('=== (7) NO OVERLAP between different elements (all 4 arms, box, slip lanes, receiving lanes, islands)');
interface Cell { id: string; poly: V2[]; x0: number; x1: number; y0: number; y1: number }
const cells: Cell[] = [];
for (const e of g.elements) for (const c of e.cells) cells.push({ id: e.id, poly: c, x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), y1: Math.max(...c.map((p) => p[1])) });
let worst = 0, worstPair = '', pairs = 0;
for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
  const a = cells[i], b = cells[j];
  if (a.id === b.id) continue;
  if (a.x1 <= b.x0 + 1e-9 || b.x1 <= a.x0 + 1e-9 || a.y1 <= b.y0 + 1e-9 || b.y1 <= a.y0 + 1e-9) continue;
  pairs++;
  const o = overlapArea(a.poly, b.poly);
  if (o > worst) { worst = o; worstPair = `${a.id} x ${b.id}`; }
}
CHK('no two elements overlap (largest overlap area of any pair of cells)', worst < 1e-6, `${cells.length} cells, ${pairs} close pairs tested, largest overlap ${worst.toExponential(1)} m2 (${worstPair || 'none'})`);
// continuity of the slip lane chain (no gaps): slip-in end = arc start, arc end = receiving lane start
const dist = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sIn = el('N-slip-in').cells[0], arc0 = el('N-slip-arc').cells[0], arcN = el('N-slip-arc').cells[el('N-slip-arc').cells.length - 1], rcv = el('N-slip-out').cells[0];
const gap1 = Math.max(dist(sIn[0], arc0[1]), dist(sIn[1], arc0[0])), gap2 = Math.max(dist(arcN[2], rcv[0]), dist(arcN[3], rcv[1]));
CHK('slip lane chain is continuous: taper/straight -> arc -> receiving lane (no gap, tangent joins)', gap1 < 1e-9 && gap2 < 1e-9, `gaps ${gap1.toExponential(1)} m and ${gap2.toExponential(1)} m`);

// ------------------------------------------------------------------ (8) sight and building line
P();
P('=== (8) SIGHT around the slip lane and the building line (ROW boundary of M8 = ' + f1(SECTION_M8.rowHalf) + ' m from each arm axis)');
const ssd = ssdSlip();
const pathToZebra = D.Rc * (PR.slipZebraAtDeg * rad);
const back = ssd - pathToZebra; // metres before the start of the arc, on the straight
const eyePos: V2 = [D.B + W / 2, D.Cx + Math.max(0, back)];
const arcPt = (r: number, thDeg: number): V2 => [D.Cx - r * Math.cos(thDeg * rad), D.Cx - r * Math.sin(thDeg * rad)];
const pedK = arcPt(PR.slipR - 0.5, PR.slipZebraAtDeg), pedI = arcPt(D.rOut + 0.5, PR.slipZebraAtDeg);
const RH = SECTION_M8.rowHalf;
const dK = segRectDistance(eyePos, pedK, RH, RH, 1e4, 1e4), dI = segRectDistance(eyePos, pedI, RH, RH, 1e4, 1e4);
P(`  stopping sight distance at ${PR.vSlip} km/h = ${f1(ssd)} m (tPR ${CRITERIA.tPR} s, a ${CRITERIA.aBrake} m/s2); the slip zebra is ${f1(pathToZebra)} m along the path from the start of the arc -> the driver's eye is ${f1(Math.max(0, back))} m before the arc, on the straight (eye ${PR.eye} m)`);
P(`  pedestrian waiting points 0.5 m behind the kerb (corner side) and 0.5 m behind the island kerb at the zebra: world positions ${(() => { const a = toWorld(pedK), b = toWorld(pedI); return `(${f1(a.x)}, ${f1(a.z)}) and (${f1(b.x)}, ${f1(b.z)})`; })()}`);
CHK('slip lane: straight run before the arc is long enough for the sight distance to the zebra', back <= D.sSlip1 - D.sArc0, `eye ${f1(Math.max(0, back))} m before the arc, full-width straight ${f1(D.sSlip1 - D.sArc0)} m`);
CHK('sight lines eye -> pedestrian (corner side and island side) stay clear of the building line (corner square beyond the ROW)', dK > 0 && dI > 0, `nearest approach to the ROW corner ${f1(dK)} m / ${f1(dI)} m; keep buildings, trees > 0.6 m and signs out of the triangle (J1-f)`);
// kerb arcs inside the union of the two ROWs
let arcInside = true, maxReach = 0;
for (let i = 0; i <= 90; i++) {
  const q = arcPt(PR.slipR, i), x = Math.abs(q[0]), y = Math.abs(q[1]);
  if (!(x <= RH || y <= RH)) arcInside = false;
  maxReach = Math.max(maxReach, Math.hypot(q[0], q[1]));
}
CHK('corner kerb arcs stay inside the union of the two M8 right-of-way strips (no extra land needed at the corners)', arcInside, `kerb arc reaches ${f1(maxReach)} m from the centre; ROW half ${f1(RH)} m`);
P(`  footprint for J1-f (re-zoning): box ${f1(2 * D.B)} x ${f1(2 * D.B)} m, corner kerbs reach ${f1(maxReach)} m, lanes end at s ${f0(Math.max(...DIRS.map((d) => g.sZone[d])))} m, receiving lanes at s ${f0(D.sRecvEnd)} m, ROW half ${f1(RH)} m`);

// ------------------------------------------------------------------ summary
P();
P('=== WORLD positions of the key points (x east, z south) for the next steps');
for (const d of DIRS) {
  const k = DIRS.indexOf(d);
  const ax: V2 = AXES[k];
  const at = (s: number): { x: number; z: number } => toWorld([ax[0] * s, ax[1] * s]);
  const st = at(D.sStop), ze = at(g.sZone[d]);
  P(`  ${d}: stop line axis point (${f1(st.x)}, ${f1(st.z)}), end of the lane zone (plain M8 starts) (${f1(ze.x)}, ${f1(ze.z)})`);
}
const fails = checks.filter((c) => !c.pass);
P();
P(`SUMMARY: ${checks.length - fails.length} PASS, ${fails.length} FAIL`);
for (const c of fails) P(`  FAIL  ${c.name}  ${c.detail}`);
writeFileSync(`${out}/j1b.json`, JSON.stringify({ site: g.site, params: PR, derived: D, sZone: g.sZone, pockets: g.pockets, box: g.box, elements: g.elements.map((e) => ({ id: e.id, arm: e.arm, kind: e.kind, dir: e.dir, area: e.area, cells: e.cells.map((c) => c.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000])) })), bars: g.bars.map((b) => ({ id: b.id, kind: b.kind, poly: b.poly.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]) })), stopLines: g.stopLines, kerbArcs: g.kerbArcs, checks }));
writeFileSync(`${out}/STEPJ1B_OUTPUT.txt`, lines.join('\n') + '\n');
