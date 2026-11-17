// STEP J1-g1 (headless): DESIGN SHEET of the new J1 = big OPEN ground interchange ("open star"): 4 M8 arms, free-flow LEFT slip roads with an early exit from the left lane,
// one open paved central area (no island, no roundabout) with curved guide lines for through / right / U-turn, signal only for through and right movements.
// Changes nothing in src/. Run: npx tsx scripts/j1-g1-sheet.ts docs      (writes docs/j1g1.json, prints the sheet and a PASS / FAIL list). Reads docs/j1a.json (flows, signal, clears).
// Every number marked ASSUMED is a proposal for the user to OK; the rest comes from src/roads/standards and src/interchange/Standards.
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { DESIGN, minRadius, stoppingSight, speedChangeLength, CRITERIA } from '../src/roads/standards/Criteria';
import { laneDropTaper } from '../src/roads/standards/Checks';
import { J1_SITE, toWorld, J1_PARAMS, J1_APPROACH_INPUTS, type Dir } from '../src/roads/junction/GroundJ1Geometry';

const out = process.argv[2] ?? 'docs';
const L: string[] = [];
const P = (s = ''): void => { L.push(s); console.log(s); };
let fails = 0;
const CHK = (name: string, pass: boolean, detail: string): void => { P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(78)} ${detail}`); if (!pass) fails++; };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);

const J1A = JSON.parse(readFileSync(`${out}/j1a.json`, 'utf8'));
const FLOWS = J1A.FLOWS as Record<Dir, { L: number; T: number; R: number }>;        // pcu/h ASSUMED in J1-a
const W = DESIGN.laneWidth;
const V_ARM = 100, V_APP = 60;
// ---------------------------------------------------------------- proposals (ASSUMED, wait for the user)
const V_SLIP = 40;                // km/h design speed of the free-flow left slip road
const R_SLIP = 70;                // m, centreline radius of the slip arc (user: 60-80 m)
const D0 = 21.6;                  // m, slip lane centre from the arm axis (J1-b: left slip lane 19.75..23.4)
const V_MERGE = 70;               // km/h speed of the outbound traffic where the slip merges (just after the stop line, accelerating from 60)
const U_PCU = 30;                 // pcu/h U-turns per arm (ASSUMED, from the inner right pocket, cars only)
const R_GUIDE = 30;               // m, guide line radius of the right turn in the open area (J1-b box allowed about 17 m)
const BOX_HALF = 19.75;           // m, J1-b through lane edge
P('J1-g1 DESIGN SHEET: open ground interchange at J1 = C10 (-87, -277), yaw 37.5 deg (2026-11-14)');
P('');
P('1. CONCEPT');
P('  - The 4 arms keep the J1-b cross-section: inbound 1 left slip + 4 through + 2 right pockets, outbound 4 (+ the slip receiving lane).');
P('  - LEFT turn (all 4 arms): free-flow slip road, leaves from the LEFT lane before the junction (early exit), own carriageway, merges into the outbound lane with an acceleration lane. No signal, no stop.');
P('  - THROUGH (4) and RIGHT (4): through the open paved area, curved painted guide lines, signal 4 phases (as J1-a). U-turn (4): from the inner right pocket, cars only.');
P('  - The paved area between the 4 slip arcs is OPEN (no island, no kerb inside): it is the star of the sketch. Outside the arcs: corner kerb island or green.');
P('');
// ---------------------------------------------------------------- 2. slip road
P('2. LEFT SLIP ROAD (free flow)');
const rMin40 = minRadius(V_SLIP), rMin50 = minRadius(50), rMin60 = minRadius(60);
let vSupp = 0; for (let v = 10; v <= 80; v += 1) if (minRadius(v) <= R_SLIP) vSupp = v;
const decel = speedChangeLength(V_ARM, V_SLIP, CRITERIA.aDecel);          // 100 -> 40 km/h
const exitTaper = W * DESIGN.exitTaper;                                    // 25:1 x 3.65 m
const accel = speedChangeLength(V_SLIP, V_MERGE, CRITERIA.aAccel);        // 40 -> 70 km/h
const mergeTaper = laneDropTaper(V_APP);                                   // W V^2 / 155 (V 60): 84.8 m as the J1-a taper
const sArcStart = D0 + R_SLIP;                                             // arc tangent point on the arm: s from the J1 centre
const sExit = sArcStart + decel + exitTaper;                               // start of the exit taper (conservative: taper not counted in decel)
const sMergeEnd = sArcStart + accel + mergeTaper;
P(`  design speed ${V_SLIP} km/h; minimum radius at ${V_SLIP} km/h ${f1(rMin40)} m (50: ${f1(rMin50)}, 60: ${f1(rMin60)}); R ${R_SLIP} m supports up to ${vSupp} km/h`);
P(`  exit: speed change 100 -> ${V_SLIP} km/h = ${f1(decel)} m (a ${CRITERIA.aDecel} m/s2), taper 25:1 = ${f1(exitTaper)} m, arc tangent point at s ${f1(sArcStart)} m from the centre`);
P(`  => the exit taper starts at s ${f0(sExit)} m from the J1 centre (J1-b lane zone ended at 269 m); arc length ${f0(Math.PI / 2 * R_SLIP)} m; slip lane ${f1(W)} m + shoulders, one lane`);
P(`  merge: speed ${V_SLIP} -> ${V_MERGE} km/h = ${f1(accel)} m (a ${CRITERIA.aAccel} m/s2), taper ${f1(mergeTaper)} m => the receiving lane ends at s ${f0(sMergeEnd)} m`);
const SSD = stoppingSight(V_SLIP);
P(`  stopping sight distance at ${V_SLIP} km/h ${f1(SSD)} m; arc length ${f0(Math.PI / 2 * R_SLIP)} m > SSD, sight line across the corner island must be clear of buildings / trees (g3)`);
P(`  capacity: one lane about 1500 pcu/h; left flows N ${FLOWS.N.L}, E ${FLOWS.E.L}, S ${FLOWS.S.L}, W ${FLOWS.W.L} pcu/h => v/c <= ${f2(Math.max(...Object.values(FLOWS).map((q) => q.L)) / 1500)}`);
P('');
// ---------------------------------------------------------------- 3. movements
P('3. MOVEMENTS (16: 4 arms x left, through, right, U-turn)');
const uDiam = 2.3 + 17.9;                                                   // inner pocket centre (+2.3 m) to the outer outbound lane centre (-17.9 m)
P('  move      lanes       control                     design speed   radius          flow pcu/h (J1-a ASSUMED)');
for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
  const q = FLOWS[d];
  P(`  ${d} left     slip 1      free, yield at the merge     ${V_SLIP} km/h        R ${R_SLIP} m         ${q.L}`);
  P(`  ${d} through  4           signal P${d === 'N' || d === 'S' ? 1 : 3}                    60 -> through   straight        ${q.T}`);
  P(`  ${d} right    2 pockets   signal P${d === 'N' || d === 'S' ? 2 : 4}                    30 km/h        guide R ${R_GUIDE} m   ${q.R}`);
  P(`  ${d} U-turn   inner pocket signal P${d === 'N' || d === 'S' ? 2 : 4} (cars only)       15 km/h        R ${f1(uDiam / 2)} m       ${U_PCU} (ASSUMED)`);
}
P('');
// ---------------------------------------------------------------- 4. signal
P('4. SIGNAL (4 phases, left free: same structure as J1-a; U-turns added to the right pockets)');
const Lt = J1A.signal.L as number;                                          // lost time per cycle from J1-a (29.35 s)
const sat = { through: 1800, right: 1530 };
const yT = (d: Dir): number => FLOWS[d].T / (4 * sat.through), yR = (d: Dir): number => (FLOWS[d].R + U_PCU) / (2 * sat.right);
const ph = [Math.max(yT('N'), yT('S')), Math.max(yR('N'), yR('S')), Math.max(yT('E'), yT('W')), Math.max(yR('E'), yR('W'))];
const Y = ph.reduce((a, b) => a + b, 0);
const C0 = (1.5 * Lt + 5) / (1 - Y), C = Math.max(60, Math.min(120, Math.ceil(C0 / 5) * 5));
const g = ph.map((y) => ((C - Lt) * y) / Y);
const xs = ph.map((y, i) => (y * C) / g[i]);
P(`  lost time ${f1(Lt)} s, Y ${f2(Y)}, Webster C0 ${f0(C0)} s -> cycle ${C} s, greens ${g.map(f0).join(' / ')} s, degree of saturation ${xs.map(f2).join(' / ')} (limit 0.9)`);
P(`  with flows x 1.2: Y ${f2(ph.map((y) => y * 1.2).reduce((a, b) => a + b, 0))}`);
P('');
// ---------------------------------------------------------------- 5. conflicts
P('5. CONFLICT POINTS (what is left after the phases)');
P('  - 4 diverges (exit from the left lane) and 4 merges (slip into the outbound lane): merge = yield, acceleration lane, no signal');
P('  - 4 slip-road pedestrian crossings (zebra on the arc, refuge) or one grade-separated crossing per leg (J1-h: J1-a said at grade is not possible, 46.8 m leg)');
P('  - opposing right turns N / S (and E / W) run together in P2 / P4: paths must pass each other (offset pockets). To be proved with swept paths in J1-g2');
P('  - U-turn from the inner pocket crosses the opposing right turn path only inside P2 / P4 (protected, same phase as the right): check in g2');
P('  - no through-left conflict at all (left leaves before the box); through vs right are separated by phases');
P('');
// ---------------------------------------------------------------- 6. footprint + ground
const half = sArcStart;                                                     // 91.6 m from the centre to the arc tangent points
const star = (2 * half) ** 2 - Math.PI * R_SLIP * R_SLIP;                   // open paved area inside the 4 arcs (square minus 4 quarter disks)
const arcNear = Math.SQRT2 * half - R_SLIP;                                 // nearest point of the slip arc to the centre on the diagonal
P('6. FOOTPRINT');
P(`  open paved star: square +-${f1(half)} m minus 4 quarter disks R ${R_SLIP} m = ${f0(star)} m2 (${f1(star / 10000)} ha); arc nearest the centre ${f1(arcNear)} m on the diagonal`);
P(`  along the arms the lane zone grows from s 269 m to s ${f0(Math.max(sExit, sMergeEnd))} m; clear lengths N ${J1_APPROACH_INPUTS.N.clear}, E ${J1_APPROACH_INPUTS.E.clear}, S ${J1_APPROACH_INPUTS.S.clear}, W ${J1_APPROACH_INPUTS.W.clear} m`);
const gen = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const hAt = (lx: number, lz: number): { h: number; w: number } => { const p = toWorld([lx, lz], J1_SITE); gen.sampleNatural(p.x, p.z, sc); return { h: sc.h, w: sc.water }; };
const R2 = 130;
let hmin = 1e9, hmax = -1e9, wet = 0, n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
const pts: number[][] = [];
for (let lx = -R2; lx <= R2; lx += 10) for (let lz = -R2; lz <= R2; lz += 10) {
  const { h, w } = hAt(lx, lz); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); if (!Number.isNaN(w) && h < w + 0.3) wet++;
  n++; sx += lx; sz += lz; sh += h; sxx += lx * lx; szz += lz * lz; sxz += lx * lz; sxh += lx * h; szh += lz * h; pts.push([lx, lz, h]);
}
const mx = sx / n, mz = sz / n, mh = sh / n;
const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz, cxh = sxh / n - mx * mh, czh = szh / n - mz * mh;
const det = cxx * czz - cxz * cxz, a = (cxh * czz - czh * cxz) / det, b = (czh * cxx - cxh * cxz) / det;
let maxRes = 0; for (const q of pts) maxRes = Math.max(maxRes, Math.abs(q[2] - (mh + a * (q[0] - mx) + b * (q[1] - mz))));
const slope = Math.hypot(a, b) * 100;
P(`  natural ground in the square +-${R2} m (${n} points): height ${f2(hmin)} .. ${f2(hmax)} m, plane slope ${f2(slope)} %, max deviation from the plane ${f2(maxRes)} m, wet cells ${wet}`);
let railMin = 1e9;
for (const e of gen.rail.edges) for (let k = 0; k + 1 < e.xs.length; k++) {
  for (const [lx, lz] of [[-R2, -R2], [R2, -R2], [R2, R2], [-R2, R2], [0, R2], [0, -R2], [R2, 0], [-R2, 0]]) {
    const p = toWorld([lx, lz], J1_SITE); const dx = e.xs[k + 1] - e.xs[k], dz = e.zs[k + 1] - e.zs[k], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - e.xs[k]) * dx + (p.z - e.zs[k]) * dz) / l2)) : 0;
    railMin = Math.min(railMin, Math.hypot(p.x - e.xs[k] - t * dx, p.z - e.zs[k] - t * dz));
  }
}
P(`  nearest railway to the footprint square +-${R2} m (corners and mid sides): ${f0(railMin)} m (rule: 50 m from the pavement)`);
let inEv = 0, tot = 0;
for (let lx = -R2; lx <= R2; lx += 10) for (let lz = -R2; lz <= R2; lz += 10) { const p = toWorld([lx, lz], J1_SITE); tot++; if (p.x >= -520 && p.x <= -40 && p.z >= -470 && p.z <= -30) inEv++; }
P(`  EVLab plot (x -520..-40, z -470..-30) covers ${f0((100 * inEv) / tot)} % of the square (buildings may stay, user: re-placed later)`);
P('');
// ---------------------------------------------------------------- 7. impacts
P('7. WHAT CHANGES IN THE PROJECT (for J1-g2..g4, nothing is changed now)');
P(`  - J1 lane zone s 269 m -> about s ${f0(Math.ceil(Math.max(sExit, sMergeEnd) / 5) * 5)} m: J1_S_END (GroundJ1Terrain) and the start of J1ArmData (S0 = 270) move out, tools/j1-arm-data.py S0 / SJ, arm profiles: first curve of E at s 284, N / W pad stretch to s 340`);
P('  - J1 pad plane: rCore 60 m + embankment 20 m is too small for the star (+-92 m, arcs, lane zones): new pad fit (J1-g3)');
P('  - GroundJ1Geometry / GroundJ1Mesh: new slip arcs R 70, open star surface, curved guide lines instead of box stop-line layout (J1-g2, g4)');
P('  - rail unchanged, structures of the arms unchanged (the first arm structure is at s >= 336)');
P('');
// ---------------------------------------------------------------- checks
const minClear = Math.min(...Object.values(J1_APPROACH_INPUTS).map((q) => q.clear));
P('8. PASS / FAIL');
CHK('slip radius R >= minimum radius of the slip design speed', R_SLIP >= rMin40, `R ${R_SLIP} m, min ${f1(rMin40)} m at ${V_SLIP} km/h`);
CHK('slip radius inside the 60-80 m the user asked for', R_SLIP >= 60 && R_SLIP <= 80, `${R_SLIP} m`);
CHK('exit + merge fit inside the clear length of every arm (lane zone end <= clear)', Math.max(sExit, sMergeEnd) <= minClear, `need ${f0(Math.max(sExit, sMergeEnd))} m, smallest clear ${minClear} m (W)`);
CHK('slip lane capacity: left flow <= 1500 pcu/h', Math.max(...Object.values(FLOWS).map((q) => q.L)) <= 1500, `max ${Math.max(...Object.values(FLOWS).map((q) => q.L))} pcu/h`);
CHK('slip arc longer than the stopping sight distance', (Math.PI / 2) * R_SLIP >= SSD, `${f0((Math.PI / 2) * R_SLIP)} m vs ${f1(SSD)} m`);
CHK('signal: degree of saturation <= 0.9 on every phase', xs.every((x) => x <= 0.9), xs.map(f2).join(' / '));
CHK('signal: flows x 1.2 still below Y 0.85', ph.reduce((a, b) => a + b, 0) * 1.2 < 0.85, f2(Y * 1.2));
CHK('right-turn guide radius >= minimum radius at 30 km/h', R_GUIDE >= minRadius(30), `R ${R_GUIDE} m, min ${f1(minRadius(30))} m`);
CHK('U-turn radius for cars (>= 7 m), trucks not allowed (needs 12.5 m)', uDiam / 2 >= 7 && uDiam / 2 < 12.5, `R ${f1(uDiam / 2)} m`);
CHK('ground: plane slope <= 3 % and height range <= 3 m in the footprint square', slope <= 3 && hmax - hmin <= 3, `slope ${f2(slope)} %, range ${f2(hmax - hmin)} m`);
CHK('ground: no wet cell in the footprint square', wet === 0, `${wet} wet cells`);
CHK('railway at least 50 m from the footprint square', railMin >= 50, `${f0(railMin)} m`);
CHK('open star area at least as big as the old box (39.5 m square)', star > 39.5 * 39.5, `${f0(star)} m2`);
P('');
P(fails ? `${fails} FAIL` : 'ALL PASS');
writeFileSync(`${out}/j1g1.json`, JSON.stringify({ V_SLIP, R_SLIP, D0, V_MERGE, U_PCU, R_GUIDE, rMin40, decel, exitTaper, accel, mergeTaper, sArcStart, sExit, sMergeEnd, star, arcNear, C, g, xs, slope, hmin, hmax, wet, railMin, inEvPct: (100 * inEv) / tot, fails }, null, 1));
writeFileSync(`${out}/STEPJ1G1_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fails ? 1 : 0);
