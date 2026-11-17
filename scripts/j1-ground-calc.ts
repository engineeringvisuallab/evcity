// STEP J1-a (headless): CALCULATION SHEET of the ground-level 8 x 8 signalised "+" J1 at C9 = (-117, -277), yaw 17.6 deg east of north (15.8.6, 15.9).
// Reads the real world (natural ground, real rail plan, rivers, facilities, SITE0 city plan) and the project standards. Changes nothing.
// (1) clear length of each of the 4 approaches, (2) ASSUMED design-hour flows, lanes, (3) layout per approach, (4) 4-phase signal (Webster),
// (5) pocket and queue lengths cut to the clear length, (6) speed step-down 100 -> 60, (7) pedestrians.
// Run: tsx scripts/j1-ground-calc.ts <out-dir>     writes j1a.json (for tools/j1a-plot.py) and prints the sheet + PASS / FAIL list.
import { mkdirSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SITE_TEMPLATES, type AreaShape } from '../src/city/CityPlan';
import { FACILITIES } from '../src/city/WorldZones';
import { CRITERIA, DESIGN, minRadius, speedChangeLength } from '../src/roads/standards/Criteria';
import { decelLength, laneDropTaper, lanesFromDemand } from '../src/roads/standards/Checks';
import { SECTION_M8 } from '../src/roads/standards/SectionTable';
import { RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';

// ------------------------------------------------------------------ inputs
const J1 = { x: Number(process.env.J1X ?? -117), z: Number(process.env.J1Z ?? -277), yawDeg: Number(process.env.J1YAW ?? 17.6) }; // env J1YAW = another yaw (J1-a2). C9 = C8 (0, -250) moved 120 m west + 10 m south along its own axes, because the east approach of C8 was 104 m too short (user: do what is best, 2026-11-13); env J1X / J1Z test another point
const W = DESIGN.laneWidth; // 3.65
const PAVE_HALF = SECTION_M8.pavementEdge; // 22.1 m, one M8 carriageway edge from the centreline
const ARM_STRAIGHT = 500; // m, straight perpendicular part of each arm (proposal 15.8.2, final in 6.1b)
const RAIL_BUFFER = 50; // m from the pavement edge (15.4 rule 3)
const MAX_SLOPE = 3; // %, ground limit (same as 6.1a)
const V_ARM = 100, V_APP = 60; // km/h
const VEH_LEN = 8.0; // m of road per pcu in a queue (ASSUMED, freight route: trucks + cars)
const SLIP_R = 25; // m, left-turn corner radius (user decision: up to 25 m)
const SLIP_V = 25; // km/h, design speed of the slip lane (ASSUMED)
const SAT = { through: 1800, right: 1530 }; // pcu/h of green per lane (ASSUMED: 1800 incl. heavy vehicles; right turn 0.85 x 1800)
const T_START = 2.0, T_EXT = 2.0; // s start-up lost time, s of yellow used by traffic
const YELLOW = 1.0 + (V_APP / 3.6) / (2 * 3.05); // 1.0 s reaction + v / 2a with a = 3.05 m/s2 -> 3.73 s
const MAX_CYCLE = 120, MIN_CYCLE = 60, X_MAX = 0.9, Y_MAX = 0.85, MIN_GREEN = 10;
const WALK = 1.0, PED_START = 7; // m/s walking speed (children, elderly: conservative), s of ped start-up + buffer
// ASSUMED design-hour flows (pcu/h) per approach until step 6.4 (demand model). L = left (slip lane), T = through, R = right (pockets).
const FLOWS: Record<string, { L: number; T: number; R: number }> = {
  N: { L: 350, T: 1200, R: 300 }, // north: freight hub side
  E: { L: 280, T: 1000, R: 250 },
  S: { L: 320, T: 1100, R: 300 },
  W: { L: 300, T: 1000, R: 250 },
};
const BEARING: Record<string, number> = { N: J1.yawDeg, E: J1.yawDeg + 90, S: J1.yawDeg + 180, W: J1.yawDeg + 270 };
const NAMES = ['N', 'E', 'S', 'W'];
const OFFSET: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 };

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const rad = Math.PI / 180;
const lines: string[] = [];
const P = (s = ''): void => { lines.push(s); console.log(s); };
const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail}`); };

// ------------------------------------------------------------------ real world
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): { h: number; wet: boolean } => { gen.sampleNatural(x, z, sc); return { h: sc.h, wet: !Number.isNaN(sc.water) && sc.h < sc.water - 0.05 }; };
interface Seg { id: string; ax: number; az: number; bx: number; bz: number }
const railSegs: Seg[] = [];
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) railSegs.push({ id: e.id, ax: e.xs[j], az: e.zs[j], bx: e.xs[j + 1], bz: e.zs[j + 1] });
const distSeg = (x: number, z: number, s: Seg): number => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz));
};
const railDist = (x: number, z: number): { d: number; id: string } => { let d = Infinity, id = ''; for (const s of railSegs) { const k = distSeg(x, z, s); if (k < d) { d = k; id = s.id; } } return { d, id }; };
const SITE0 = SITE_TEMPLATES[0];
const inShape = (s: AreaShape, x: number, z: number): boolean => (s.t === 'rect' ? x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1 : Math.hypot(x, z) >= s.r0 && Math.hypot(x, z) < s.r1);
const areaAt = (x: number, z: number): string => { for (const a of SITE0) if (inShape(a.shape, x, z)) return a.id; return 'none'; };
const inFacility = (x: number, z: number): boolean => FACILITIES.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);

// ------------------------------------------------------------------ (1) clear length of each approach
P(`J1-a CALCULATION SHEET   J1 = C9 (${J1.x}, ${J1.z}), yaw ${J1.yawDeg} deg east of north, 8 lane x 8 lane, ground level, signalised "+"  (C8 (0, -250) failed on the east approach, see section 12)`);
P(`inputs: lane ${W} m, M8 pavement edge ${PAVE_HALF} m from the centreline, arm straight ${ARM_STRAIGHT} m, rail buffer ${RAIL_BUFFER} m from the pavement edge, ground limit ${MAX_SLOPE} %`);
P();
P('=== (1) CLEAR LENGTH of each approach, along its axis from the J1 centre (ground flat <= 3 %, dry, rail >= 50 m from the pavement, no facility fence)');
interface Clear { dir: string; ux: number; uz: number; vx: number; vz: number; clear: number; reason: string; railX: Array<{ id: string; s: number }>; areas: Array<{ id: string; from: number; to: number }>; hmax: number; hmin: number; slopeMax: number }
const clears: Record<string, Clear> = {};
/** Walks one axis outward in 10 m steps and returns the first hard stop. yawDeg = common yaw (bearing of the N arm). */
function walkAxis(d: string, yawDeg: number, cx: number = J1.x, cz: number = J1.z): Clear {
  const b = (yawDeg + OFFSET[d]) * rad;
  const ux = Math.sin(b), uz = -Math.cos(b), vx = Math.cos(b), vz = Math.sin(b); // axis (outward) and lateral (right of the axis)
  const at = (s: number, o: number): { x: number; z: number } => ({ x: cx + ux * s + vx * o, z: cz + uz * s + vz * o });
  let clear = 900, reason = 'none within 900 m';
  let hmax = -Infinity, hmin = Infinity, slopeMax = 0;
  const STEP = 10, LIM = 900;
  const hc: number[] = [];
  for (let s = 0; s <= LIM + 50; s += STEP) { const p = at(s, 0); hc.push(ground(p.x, p.z).h); }
  for (let s = 0; s <= LIM; s += STEP) {
    const k = s / STEP;
    const c0 = at(s, 0), cl = at(s, -PAVE_HALF), cr = at(s, PAVE_HALF);
    const gl = ground(cl.x, cl.z), gr = ground(cr.x, cr.z), g0 = ground(c0.x, c0.z);
    const lon = (Math.abs(hc[k + 5] - hc[k]) / 50) * 100, cross = (Math.abs(gl.h - gr.h) / (2 * PAVE_HALF)) * 100;
    hmax = Math.max(hmax, g0.h); hmin = Math.min(hmin, g0.h); slopeMax = Math.max(slopeMax, lon, cross);
    const rd = railDist(c0.x, c0.z);
    let why = '';
    if (g0.wet || gl.wet || gr.wet) why = 'water';
    else if (lon > MAX_SLOPE) why = `slope ${f1(lon)} % (50 m step along the axis)`;
    else if (cross > MAX_SLOPE) why = `cross slope ${f1(cross)} % over the pavement width`;
    else if (rd.d < PAVE_HALF + RAIL_BUFFER) why = `rail ${rd.id} ${f0(rd.d)} m from the axis (needs ${f0(PAVE_HALF + RAIL_BUFFER)})`;
    else if (inFacility(c0.x, c0.z)) why = 'facility fence';
    if (why) { clear = s; reason = why; break; }
  }
  const railX: Array<{ id: string; s: number }> = [];
  for (const sg of railSegs) {
    const a = at(0, 0), bpt = at(LIM, 0);
    const d1x = bpt.x - a.x, d1z = bpt.z - a.z, d2x = sg.bx - sg.ax, d2z = sg.bz - sg.az, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((sg.ax - a.x) * d2z - (sg.az - a.z) * d2x) / den, u = ((sg.ax - a.x) * d1z - (sg.az - a.z) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) railX.push({ id: sg.id, s: t * LIM });
  }
  railX.sort((p, q) => p.s - q.s);
  const areas: Array<{ id: string; from: number; to: number }> = [];
  for (let s = 0; s <= 600; s += 10) { const p = at(s, 0), id = areaAt(p.x, p.z); const last = areas[areas.length - 1]; if (last && last.id === id) last.to = s; else areas.push({ id, from: s, to: s }); }
  return { dir: d, ux, uz, vx, vz, clear, reason, railX, areas, hmax, hmin, slopeMax };
}
for (const d of NAMES) {
  const c = walkAxis(d, J1.yawDeg);
  clears[d] = c;
  P(`  ${d}  bearing ${f1(BEARING[d] % 360)} deg   clear length ${f0(c.clear).padStart(4)} m   stop: ${c.reason}   ground ${f1(c.hmin)}..${f1(c.hmax)} m along the axis`);
  P(`      axis crosses rail (straight line, warning for 6.1d): ${c.railX.length ? c.railX.slice(0, 3).map((r) => `${r.id}@${f0(r.s)}`).join('  ') : 'none within 900 m'}   city plan under the axis (first 600 m): ${c.areas.map((a) => `${a.id} ${a.from}-${a.to}`).join(', ')}`);
}

// ------------------------------------------------------------------ (3) layout per approach (before the signal, the box width is needed)
const LANES_IN = { slip: 1, through: 4, right: 2 }; // inbound lanes at the stop line, left-hand traffic: slip lane on the outer side, pockets on the median side
const nIn = LANES_IN.slip + LANES_IN.through + LANES_IN.right; // 7
const nOut = 4 + 1; // 4 lanes + the lane that receives the slip lane
const ISLAND = 3.0; // m, central island / refuge between the two directions in the box (the 6 m M8 median narrows to it)
const boxWidth = 2 * nIn * W + ISLAND; // the width of the crossing road that traffic of the other road has to cross
const boxHalf = boxWidth / 2;
const CROSSWALK = 4.0; // m
const dStop = boxHalf + CROSSWALK; // stop line distance from the J1 centre
P();
P('=== (3) LAYOUT per approach (left-hand traffic)');
P(`  inbound lanes at the stop line: ${LANES_IN.slip} left slip + ${LANES_IN.through} through + ${LANES_IN.right} right pockets = ${nIn} lanes = ${f1(nIn * W)} m;  outbound: ${nOut} lanes = ${f1(nOut * W)} m;  central island ${ISLAND} m`);
P(`  box = width of the crossing road = 2 x ${nIn} x ${W} + ${ISLAND} = ${f1(boxWidth)} m  (half ${f1(boxHalf)} m);  crosswalk ${CROSSWALK} m  ->  stop line ${f1(dStop)} m from the centre`);
P(`  the M8 carriageway (4 lanes + shoulders, ${f1(PAVE_HALF - 3)} m from median edge to pavement edge) is shifted outward at the approach to make room for the pockets: pockets take ${f1(LANES_IN.right * W)} m of the median (6 m) -> the median is opened (done in J1-b)`);
const rMinSlip = minRadius(SLIP_V);
CHK('left slip corner radius >= Rmin of the slip speed', SLIP_R >= rMinSlip, `R ${SLIP_R} m, Rmin(${SLIP_V} km/h) ${f1(rMinSlip)} m`);

// ------------------------------------------------------------------ (2) flows, lanes
P();
P('=== (2) DESIGN-HOUR FLOWS (ASSUMED until step 6.4) and LANES');
P('  approach   L(slip)   T      R     total   AADT-equivalent (total / (K D) = total / 0.06)   mid-block lanes by lanesFromDemand (c 1800)');
for (const d of NAMES) {
  const q = FLOWS[d], tot = q.L + q.T + q.R, aadt = tot / (DESIGN.K * DESIGN.D);
  const ln = lanesFromDemand(aadt, DESIGN.capacity.motorway);
  P(`  ${d}          ${String(q.L).padStart(4)}   ${String(q.T).padStart(5)}  ${String(q.R).padStart(4)}  ${String(tot).padStart(6)}   ${f0(aadt).padStart(7)}                                         ${f2(ln.exact)} -> ${ln.lanes}`);
}
P('  NOTE: on the open road 2 lanes would carry this flow; the 4 + 4 of M8 are the user decision. At the signal the through lanes only get a part of the cycle, see (4).');

// ------------------------------------------------------------------ (4) signal, Webster
interface Phase { name: string; moves: string; y: number; g: number; crit: string }
function signal(scale: number): { L: number; Y: number; C0: number; C: number; phases: Phase[]; x: Record<string, { T: number; R: number }>; cap: Record<string, { T: number; R: number }>; Q: Record<string, { T: number; R: number }> } {
  const AR = (boxWidth + 6) / (V_APP / 3.6); // all red: (W + vehicle length 6 m) / v, the through vehicle clears the whole box
  const lossPhase = T_START + (YELLOW + AR - T_EXT);
  const L = 4 * lossPhase;
  const yT = (d: string): number => (FLOWS[d].T * scale) / (LANES_IN.through * SAT.through);
  const yR = (d: string): number => (FLOWS[d].R * scale) / (LANES_IN.right * SAT.right);
  const defs = [
    { name: 'P1', moves: 'N + S through (slip lanes free)', y: Math.max(yT('N'), yT('S')), crit: yT('N') >= yT('S') ? 'N' : 'S' },
    { name: 'P2', moves: 'N + S right pockets', y: Math.max(yR('N'), yR('S')), crit: yR('N') >= yR('S') ? 'N' : 'S' },
    { name: 'P3', moves: 'E + W through (slip lanes free)', y: Math.max(yT('E'), yT('W')), crit: yT('E') >= yT('W') ? 'E' : 'W' },
    { name: 'P4', moves: 'E + W right pockets', y: Math.max(yR('E'), yR('W')), crit: yR('E') >= yR('W') ? 'E' : 'W' },
  ];
  const Y = defs.reduce((a, p) => a + p.y, 0);
  const C0 = Y < 1 ? (1.5 * L + 5) / (1 - Y) : 999;
  const C = Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, Math.ceil(C0 / 5) * 5));
  const phases: Phase[] = defs.map((p) => ({ ...p, g: ((C - L) * p.y) / Y }));
  const gOf = (d: string, kind: 'T' | 'R'): number => phases.find((p) => (kind === 'T' ? (d === 'N' || d === 'S' ? p.name === 'P1' : p.name === 'P3') : d === 'N' || d === 'S' ? p.name === 'P2' : p.name === 'P4'))!.g;
  const x: Record<string, { T: number; R: number }> = {}, cap: Record<string, { T: number; R: number }> = {}, Q: Record<string, { T: number; R: number }> = {};
  for (const d of NAMES) {
    const gT = gOf(d, 'T'), gR = gOf(d, 'R');
    const capT = (LANES_IN.through * SAT.through * gT) / C, capR = (LANES_IN.right * SAT.right * gR) / C;
    cap[d] = { T: capT, R: capR };
    x[d] = { T: (FLOWS[d].T * scale) / capT, R: (FLOWS[d].R * scale) / capR };
    const q95 = (qLane: number, g: number, xx: number): number => {
      const m = (qLane * (C - g)) / 3600; // mean arrivals per lane during the red
      const over = xx < 0.97 ? (xx * xx) / (2 * (1 - xx)) : 15; // Newell overflow (veh per lane), capped
      return m + 1.645 * Math.sqrt(m) + over; // veh per lane, 95th percentile
    };
    Q[d] = { T: q95((FLOWS[d].T * scale) / LANES_IN.through, gT, x[d].T), R: q95((FLOWS[d].R * scale) / LANES_IN.right, gR, x[d].R) };
  }
  return { L, Y, C0, C, phases, x, cap, Q };
}
const sg = signal(1);
const AR0 = (boxWidth + 6) / (V_APP / 3.6);
P();
P('=== (4) SIGNAL: 4 phases (left-hand traffic: left = slip, free flow; right = pockets with their own phase), Webster');
P(`  yellow ${f2(YELLOW)} s (1.0 s + v/2a, v ${V_APP} km/h, a 3.05); all red ${f2(AR0)} s = (box ${f1(boxWidth)} m + 6 m) / ${V_APP} km/h; lost time per phase = ${T_START} + (Y + AR - ${T_EXT}) = ${f2(T_START + YELLOW + AR0 - T_EXT)} s; L = ${f1(sg.L)} s`);
P(`  saturation flow per green hour: through ${SAT.through} pcu/h/lane (ASSUMED, heavy vehicles included), right ${SAT.right} (0.85 x)`);
P('  phase  movements                          critical flow ratio y   effective green g (s)');
for (const p of sg.phases) P(`  ${p.name}     ${p.moves.padEnd(34)}  ${f2(p.y).padStart(6)} (${p.crit})            ${f1(p.g)}`);
P(`  Y = ${f2(sg.Y)}   C0 = (1.5 L + 5) / (1 - Y) = ${f1(sg.C0)} s   ->  cycle C = ${sg.C} s (rounded up to 5 s, limits ${MIN_CYCLE}-${MAX_CYCLE} s)`);
P('  approach  capacity T   x(T)   capacity R   x(R)   95th queue per lane T (veh / m)   R (veh / m)');
for (const d of NAMES) P(`  ${d}         ${f0(sg.cap[d].T).padStart(6)}      ${f2(sg.x[d].T)}    ${f0(sg.cap[d].R).padStart(6)}       ${f2(sg.x[d].R)}     ${f1(sg.Q[d].T).padStart(5)} / ${f0(sg.Q[d].T * VEH_LEN).padStart(3)}                        ${f1(sg.Q[d].R).padStart(5)} / ${f0(sg.Q[d].R * VEH_LEN).padStart(3)}`);
P(`  queue: Poisson arrivals in the red + Newell overflow x^2 / (2 (1 - x)), ${VEH_LEN} m per pcu (APPROXIMATION, a HCM check can replace it in 6.2)`);
CHK('sum of critical flow ratios Y <= 0.85', sg.Y <= Y_MAX, `Y ${f2(sg.Y)}`);
CHK(`cycle <= ${MAX_CYCLE} s (Webster value before the limit)`, sg.C0 <= MAX_CYCLE, `C0 ${f1(sg.C0)} s, C ${sg.C} s`);
CHK(`every movement degree of saturation x <= ${X_MAX}`, NAMES.every((d) => sg.x[d].T <= X_MAX && sg.x[d].R <= X_MAX), `max x ${f2(Math.max(...NAMES.flatMap((d) => [sg.x[d].T, sg.x[d].R])))}`);
CHK(`every phase green >= ${MIN_GREEN} s`, sg.phases.every((p) => p.g >= MIN_GREEN), `min ${f1(Math.min(...sg.phases.map((p) => p.g)))} s`);
// slip lane: free flow, check its own capacity (1 lane, 1200 pcu/h with the pedestrian crossing and the merge)
CHK('left slip lane flow <= 1 lane capacity 1200 pcu/h (ASSUMED, crosswalk + merge)', NAMES.every((d) => FLOWS[d].L <= 1200), `max ${Math.max(...NAMES.map((d) => FLOWS[d].L))} pcu/h`);
// headroom: largest flow factor that still passes
let kOk = 1; for (let k = 1; k <= 3; k += 0.01) { const s2 = signal(k); const ok = s2.Y <= Y_MAX && s2.C0 <= MAX_CYCLE && NAMES.every((d) => s2.x[d].T <= X_MAX && s2.x[d].R <= X_MAX); if (!ok) break; kOk = k; }
P(`  HEADROOM: all flows x ${f2(kOk)} still pass (every approach AADT-equivalent up to about ${f0(Math.min(...NAMES.map((d) => (FLOWS[d].L + FLOWS[d].T + FLOWS[d].R) * kOk / 0.06)))} .. ${f0(Math.max(...NAMES.map((d) => (FLOWS[d].L + FLOWS[d].T + FLOWS[d].R) * kOk / 0.06)))}); above that the 4 + 4 lanes are too few for one signal`);

// ------------------------------------------------------------------ (5)(6) pockets, queue storage, speed step-down, cut to the clear length
P();
P('=== (5)(6) POCKETS, QUEUE STORAGE and SPEED STEP-DOWN per approach (distances from the STOP LINE outward; available = clear length - stop line distance)');
const SD60 = speedChangeLength(V_APP, 0, CRITERIA.aDecel); // m, braking distance 60 km/h -> 0 inside the pocket (56 m in the handoff)
const TAPER = laneDropTaper(V_APP); // W V^2 / 155 = 85 m
const STEP = decelLength(V_ARM, V_APP); // 99 m
P(`  braking distance 60 -> 0 km/h ${f0(SD60)} m, pocket taper W V^2 / 155 = ${f0(TAPER)} m, speed step-down 100 -> 60 km/h = ${f0(STEP)} m, queue vehicle ${VEH_LEN} m`);
P('  pocket (right) = braking distance + storage(95th) + taper;   through queue tail + step-down 99 m must lie inside the arm straight (500 m) and the clear length');
interface Fit { dir: string; clear: number; avail: number; storageT: number; storageR: number; pocket: number; pocketFull: number; need: number; stepStart: number; ok: boolean }
const fits: Record<string, Fit> = {};
for (const d of NAMES) {
  const c = clears[d];
  const avail = Math.max(0, c.clear - dStop);
  const storageT = sg.Q[d].T * VEH_LEN, storageR = sg.Q[d].R * VEH_LEN;
  const pocketFull = SD60 + storageR + TAPER; // wanted
  const need = Math.max(storageT, pocketFull) + STEP; // from the stop line: queue / pocket first, then the 99 m step-down before it
  const usableLimit = Math.min(avail, ARM_STRAIGHT - dStop);
  const pocket = Math.min(pocketFull, usableLimit - STEP > 0 ? usableLimit - STEP : 0);
  const ok = need <= usableLimit;
  fits[d] = { dir: d, clear: c.clear, avail, storageT, storageR, pocket, pocketFull, need, stepStart: Math.max(storageT, pocketFull) + STEP, ok };
  P(`  ${d}  clear ${f0(c.clear)} m -> available from the stop line ${f0(avail)} m (arm straight allows ${f0(ARM_STRAIGHT - dStop)})   through queue ${f0(storageT)} m   pocket wanted ${f0(pocketFull)} m (${f0(SD60)} + ${f0(storageR)} + ${f0(TAPER)})   need incl. step-down ${f0(need)} m   ${ok ? 'FITS' : 'DOES NOT FIT by ' + f0(need - usableLimit) + ' m'}`);
}
for (const d of NAMES) CHK(`${d}: queue + pocket + step-down fit in the clear length`, fits[d].ok, `need ${f0(fits[d].need)} m, available ${f0(Math.min(fits[d].avail, ARM_STRAIGHT - dStop))} m`);
CHK('step-down 100 -> 60 km/h done before the queue tail (all approaches)', NAMES.every((d) => fits[d].stepStart - STEP >= 0), `${f0(STEP)} m, starts ${f0(Math.min(...NAMES.map((d) => fits[d].stepStart)))}+ m from the stop line`);

// ------------------------------------------------------------------ (6b) yaw scan (information for the decision on the east approach)
P();
P('=== (6b) YAW SCAN (information only, the yaw 17.6 deg is a user decision): clear length of each approach and the arm bends to the ring points for other common yaws');
P('  needed from the J1 centre = stop line + queue / pocket + step-down:  ' + NAMES.map((d) => `${d} ${f0(dStop + fits[d].need)} m`).join(', ') + `  (arm straight ${ARM_STRAIGHT} m)`);
P('  yaw     clear N   E     S     W      all fit   bends to the ring points N / E / S / W (limit 20 deg; E point may move, 6.1a2)');
const bearTo = (j: { x: number; z: number }): number => (Math.atan2(j.x - J1.x, -(j.z - J1.z)) / rad + 360) % 360;
const wrap180 = (a: number): number => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };
interface ScanRow { yaw: number; clear: Record<string, number>; fit: boolean; bends: Record<string, number> }
const scan: ScanRow[] = [];
const yaws = [10, 12, 14, 16, J1.yawDeg, 20, 22, 24, 26, 28];
for (const y of yaws) {
  const cl: Record<string, number> = {}, bd: Record<string, number> = {};
  for (const d of NAMES) { cl[d] = y === J1.yawDeg ? clears[d].clear : walkAxis(d, y).clear; const j = RING_RADIAL_JOINS.find((q) => q.dir === d)!; bd[d] = wrap180(bearTo(j) - (y + OFFSET[d])); }
  const fit = NAMES.every((d) => cl[d] >= dStop + fits[d].need && ARM_STRAIGHT >= dStop + fits[d].need);
  scan.push({ yaw: y, clear: cl, fit, bends: bd });
  P(`  ${f1(y).padStart(5)}   ${NAMES.map((d) => f0(cl[d]).padStart(4)).join('  ')}    ${fit ? 'YES' : 'no '}      ${NAMES.map((d) => f1(bd[d]).padStart(6)).join(' / ')}${y === J1.yawDeg ? '   <-- decided yaw' : ''}`);
}

// ------------------------------------------------------------------ (6c) shift scan: what if J1 moves a little along its own axes (information for the east approach)
P();
P('=== (6c) SHIFT SCAN (information only: around the chosen point): J1 moved along its own axes (e = along the E-W road, + = east; n = along the N-S road, + = north), yaw 17.6 deg kept');
const needFrom: Record<string, number> = {}; for (const d of NAMES) needFrom[d] = dStop + fits[d].need;
const eAx = { x: Math.sin((J1.yawDeg + 90) * rad), z: -Math.cos((J1.yawDeg + 90) * rad) }, nAx = { x: Math.sin(J1.yawDeg * rad), z: -Math.cos(J1.yawDeg * rad) };
interface Shift { e: number; n: number; clear: Record<string, number>; fit: boolean; mag: number }
const shifts: Shift[] = [];
for (let e = -160; e <= 40; e += 20) for (let n = -80; n <= 80; n += 20) {
  const cx = J1.x + e * eAx.x + n * nAx.x, cz = J1.z + e * eAx.z + n * nAx.z;
  const cl: Record<string, number> = {};
  for (const d of NAMES) cl[d] = walkAxis(d, J1.yawDeg, cx, cz).clear;
  shifts.push({ e, n, clear: cl, fit: NAMES.every((d) => cl[d] >= needFrom[d]), mag: Math.hypot(e, n) });
}
const okShifts = shifts.filter((q) => q.fit).sort((a, b) => a.mag - b.mag);
P(`  needed from the centre: ${NAMES.map((d) => `${d} ${f0(needFrom[d])} m`).join(', ')};  ${okShifts.length} of ${shifts.length} tested shifts fit all four approaches (ground, water, rail only: the +-200 m flat box and the city plan are NOT re-checked here)`);
P('  smallest shifts that fit:   e      n    clear N / E / S / W');
for (const q of okShifts.slice(0, 6)) P(`                            ${String(q.e).padStart(4)}   ${String(q.n).padStart(4)}   ${NAMES.map((d) => f0(q.clear[d]).padStart(4)).join(' / ')}   (shift ${f0(q.mag)} m)`);
if (!okShifts.length) P('  none');

// ------------------------------------------------------------------ (7) pedestrians
P();
P('=== (7) PEDESTRIANS (paved width of one M8 is 44.2 m, rule 3.14: grade-separated crossing on 4+ lane roads)');
const legW = nIn * W + ISLAND + nOut * W; // one arm cross-section at the stop line (inbound + island + outbound)
const stage1 = nIn * W, stage2 = nOut * W;
const gP1 = sg.phases[0].g, gP3 = sg.phases[2].g;
const tSingle = legW / WALK + PED_START, tStage = Math.max(stage1, stage2) / WALK + PED_START;
P(`  one leg of the crossing = ${f1(legW)} m (${nIn} + ${nOut} lanes + island);  walking ${WALK} m/s + ${PED_START} s start-up`);
P(`  single stage needs ${f0(tSingle)} s;   two stages (refuge on the island) need ${f0(tStage)} s per stage (${f0(stage1)} m and ${f0(stage2)} m)   concurrent green: P1 ${f0(gP1)} s, P3 ${f0(gP3)} s`);
const atGradeOk = tSingle <= Math.min(gP1, gP3), refugeOk = tStage <= Math.min(gP1, gP3);
P(`  at grade, single stage: ${atGradeOk ? 'possible' : 'NOT possible'} (needs ${f0(tSingle)} s, green ${f0(Math.min(gP1, gP3))} s);  two-stage refuge: ${refugeOk ? 'possible' : 'NOT possible'} (needs ${f0(tStage)} s per stage, green ${f0(Math.min(gP1, gP3))} s)`);
CHK('pedestrians need a grade-separated crossing (numbers prove at-grade cannot work)', !atGradeOk && !refugeOk, 'decision: option B or C below, user OK needed');
const ramp = (h: number): number => h / 0.0833; // 1:12 ramp for wheelchairs and bicycles
P(`  option A at grade with two-stage refuge: legal only as a fallback, breaks rule 3.14 (8 + 8 lanes).`);
P(`  option B footbridge: rise 5.5 m clearance + 1.0 m deck = 6.5 m -> ramp 1:12 = ${f0(ramp(6.5))} m each side (or stairs + lift), 4 bridges (one per leg) or one ring bridge.`);
P(`  option C underpass: clear height 2.8 m + 0.6 m slab = 3.4 m -> ramp 1:12 = ${f0(ramp(3.4))} m each side, 4 underpasses; ground is flat (2.7 %), ground-water level NOT known yet: checked in J1-c.`);
P('  PROPOSAL: option C (underpass) if J1-c finds the water table deep enough, otherwise option B; the user decides at this checkpoint.');

// ------------------------------------------------------------------ summary
P();
const fails = checks.filter((c) => !c.pass);
P(`SUMMARY: ${checks.length - fails.length} PASS, ${fails.length} FAIL`);
for (const c of fails) P(`  FAIL  ${c.name}  ${c.detail}`);
writeFileSync(`${out}/j1a.json`, JSON.stringify({ J1, W, PAVE_HALF, boxHalf, dStop, ARM_STRAIGHT, clears, fits, FLOWS, signal: { C: sg.C, Y: sg.Y, L: sg.L, phases: sg.phases, x: sg.x, Q: sg.Q }, TAPER, SD60, STEP, nIn, nOut, scan, shifts, checks }, null, 1));
writeFileSync(`${out}/STEPJ1A_OUTPUT.txt`, lines.join('\n') + '\n');
