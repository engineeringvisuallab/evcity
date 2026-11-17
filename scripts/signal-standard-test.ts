// STEP SIGNAL-1 (headless): the signal design standard (src/traffic/SignalStandard.ts). Run: npx tsx scripts/signal-standard-test.ts
// Every formula is checked against a number worked out BY HAND (shown in the message), then a complete worked example (the J1 star with ASSUMED demand) is designed and its report printed.
import { allRedTime, controlDelay, designSignal, headDesign, losOf, pedClearance, pedMinGreen, PCU_FACTORS, satFlowHcm, satFlowIrc, signalReportText, SIGNAL_DEFAULTS, SIGNAL_SOURCES, toPcu, websterCycle, yellowRaw, yellowTableDpti, type DesignInput } from '../src/traffic/SignalStandard';
import { OPEN_PARAMS, deriveOpen } from '../src/roads/junction/OpenJ1Geometry';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

// --- yellow: t + v / (2a + 2gG). 60 km/h = 16.667 m/s, a = 3.048: 1 + 16.667 / 6.096 = 3.734 s (hand)
ok(near(yellowRaw(60 / 3.6), 3.734, 0.005), `yellow raw at 60 km/h = ${yellowRaw(60 / 3.6).toFixed(3)} s (hand 3.734)`);
// 2 % uphill: denominator 6.096 + 2 x 9.81 x 0.02 = 6.4884 -> 1 + 2.5686 = 3.569 s (shorter), 2 % downhill: 5.7036 -> 3.922 s (longer)
ok(near(yellowRaw(60 / 3.6, 0.02), 3.569, 0.005) && near(yellowRaw(60 / 3.6, -0.02), 3.922, 0.005), `grade: +2 % ${yellowRaw(60 / 3.6, 0.02).toFixed(3)} s (hand 3.569), -2 % ${yellowRaw(60 / 3.6, -0.02).toFixed(3)} s (hand 3.922)`);
ok(yellowTableDpti(60) === 4.0 && yellowTableDpti(55) === 4.0 && yellowTableDpti(30) === 3.0, 'DPTI table: 60 km/h = 4.0 s, 55 -> 60 row = 4.0 s, 30 -> 40 row = 3.0 s');
// --- all-red: (W + L) / v = (43.5 + 6.096) / 16.667 = 2.976 s -> 3.0 s
ok(allRedTime(43.5, 60 / 3.6) === 3.0, `all-red W 43.5 m at 60 km/h = ${allRedTime(43.5, 60 / 3.6)} s (hand 2.976 -> 3.0)`);
ok(allRedTime(1, 20) === SIGNAL_DEFAULTS.allRedMin.value, 'all-red never below 1 s on a normal approach');
// --- pedestrians: 14 m at 1.2 m/s = 11.67 -> 12 s; walk 7 -> 19 s minimum green; with credit of 6 s -> clearance 6
ok(pedClearance(14) === 12 && pedMinGreen(14).green === 19, 'pedestrian 14 m: clearance 12 s, minimum green 7 + 12 = 19 s');
ok(pedMinGreen(14, { credit: 6 }).clearance === 6, 'pedestrian clearance credited with 6 s of yellow + all-red = 6 s');
ok(pedClearance(14, 1.0) === 14, 'slow pedestrians 1.0 m/s: 14 s');
// --- saturation flow: IRC 525 w: 7 m -> 3675; 3.5 m -> 1890 (table); 4.25 m -> (1950 + 2250) / 2 = 2100; grade +2 % -> x 0.94; HCM 3 lanes = 5700, +2 % -> x 0.99
ok(satFlowIrc(7) === 3675 && satFlowIrc(3.5) === 1890 && near(satFlowIrc(4.25), 2100, 1e-9), 'IRC saturation flow: 7 m = 3675, 3.5 m = 1890, 4.25 m = 2100');
ok(near(satFlowIrc(7, 2), 3675 * 0.94, 1e-6), 'IRC gradient: +2 % uphill = x 0.94');
ok(satFlowHcm(3) === 5700 && near(satFlowHcm(3, 2), 5700 * 0.99, 1e-6), 'HCM saturation flow: 3 lanes = 5700, grade +2 % = x 0.99');
// --- PCU: 100 cars + 10 buses + 20 motorcycles + 10 rickshaws = 100 + 30 + 10 + 15 = 155
ok(toPcu({ car: 100, bus: 10, motorcycle: 20, rickshaw: 10 }) === 155 && PCU_FACTORS.bus === 3, 'PCU of a mixed flow = 155 (hand)');
// --- Webster: L = 12, Y = 0.6 -> (18 + 5) / 0.4 = 57.5 s; Y >= 1 impossible
ok(near(websterCycle(12, 0.6), 57.5, 1e-9) && websterCycle(12, 1) === Infinity, 'Webster: L 12, Y 0.6 = 57.5 s; Y = 1 has no cycle');
// --- delay: C 60, g 30, X 0.8 -> d1 = 0.5 x 60 x 0.25 / (1 - 0.8 x 0.5) = 7.5 / 0.6 = 12.5 s (hand)
const dd = controlDelay(60, 30, 0.8, 1000);
// d2 (hand): T 0.25 h, k 0.5, I 1, c 1000: 900 x 0.25 x [(-0.2) + sqrt(0.04 + 8 x 0.5 x 0.8 / (1000 x 0.25))] = 225 x (-0.2 + 0.22978) = 6.70 s
ok(near(dd.d1, 12.5, 1e-9) && near(dd.d2, 6.70, 0.02), `delay d1 = ${dd.d1.toFixed(2)} s (hand 12.5), d2 = ${dd.d2.toFixed(2)} s (hand 6.70)`);
ok(controlDelay(60, 30, 0.5, 1000).d > 0 && controlDelay(60, 30, 1.2, 600).d > controlDelay(60, 30, 0.9, 600).d, 'delay grows with the degree of saturation');
ok(losOf(10) === 'A' && losOf(10.1) === 'B' && losOf(35) === 'C' && losOf(55) === 'D' && losOf(80) === 'E' && losOf(80.1) === 'F', 'LOS limits A <=10, B <=20, C <=35, D <=55, E <=80, else F');
// --- head: 60 km/h -> sight 110 m; face 20 m, no arrows -> 200 mm; with arrows -> 300 mm; face 50 m -> 300 mm; pedestrians entering at 40 m -> 225 mm symbol
const h1 = headDesign({ speedKmh: 60, faceDistM: 20 });
ok(h1.minSightM === 110 && h1.lensMm === 200 && headDesign({ speedKmh: 60, faceDistM: 20, arrows: true }).lensMm === 300 && headDesign({ speedKmh: 60, faceDistM: 50 }).lensMm === 300, 'head: 60 km/h sight 110 m, 200 mm lens; arrows or a face beyond 45 m need 300 mm');
ok(headDesign({ speedKmh: 60, faceDistM: 20, pedEntryDistM: 40 }).pedSymbolMm === 225 && h1.pedSymbolMm === 150, 'pedestrian symbol 150 mm, 225 mm when pedestrians enter more than 30 m away');

// --- sources: every source has a url and a flag, every default points at existing sources
ok(Object.values(SIGNAL_SOURCES).every((s) => s.url.startsWith('http') && s.cite.length > 20), 'every source has a citation and a url');
ok(Object.values(SIGNAL_DEFAULTS).every((d) => (d.basis === 'assumption' || d.src.length > 0) && d.src.every((k) => k in SIGNAL_SOURCES)), 'every default is a standard value with a source, or is marked as an assumption');

// --- worked example: the J1 star (4 phases like the game: P1 N+S through, P2 N+S right pockets, P3 E+W through, P4 E+W right pockets)
// GEOMETRY from OpenJ1Geometry: approach speed 60 km/h, stop line at sStop = 23.75 m, conflict area up to B = 19.75 m on the far side -> W through = 23.75 + 19.75 = 43.5 m.
// ASSUMED (not measured): demand per arm through 4 lanes, right pocket 2 lanes; W of the right turn 25 m and crossing 14 m (to be derived from the movement geometry in the next step).
const Dj = deriveOpen();
const Wthrough = Dj.sStop + Dj.B;
ok(near(Wthrough, 43.5, 1e-9), `J1 clearance distance of a through movement = ${Wthrough} m (23.75 + 19.75)`);
const arm = (n: string, through: number, right: number) => ({ t: { id: `${n}-T`, lanes: OPEN_PARAMS.nThrough, flowPcu: through, speedKmh: OPEN_PARAMS.vApp, clearanceM: Wthrough }, r: { id: `${n}-R`, lanes: OPEN_PARAMS.nPocket, flowPcu: right, speedKmh: OPEN_PARAMS.vApp, clearanceM: 25, turn: true } });
const N = arm('N', 1800, 220), S = arm('S', 1700, 200), E = arm('E', 1500, 180), Wst = arm('W', 1400, 160);
const j1: DesignInput = {
  name: 'J1 ground-level open star (worked example, ASSUMED demand)',
  phases: [
    { name: 'P1 N+S through', movements: [N.t, S.t], ped: { crossingM: 14, credit: true } },
    { name: 'P2 N+S right pockets', movements: [N.r, S.r] },
    { name: 'P3 E+W through', movements: [E.t, Wst.t], ped: { crossingM: 14, credit: true } },
    { name: 'P4 E+W right pockets', movements: [E.r, Wst.r] },
  ],
  head: { faceDistM: 25, arrows: true, pedEntryDistM: 20 },
};
const rep = designSignal(j1);
console.log('\n' + signalReportText(rep) + '\n');
ok(rep.cycle % 5 === 0 && rep.cycle >= 30 && rep.cycle <= 120, `cycle ${rep.cycle} s is a multiple of 5 inside 30..120`);
ok(near(rep.cycleCheck, rep.cycle, 0.5), `sum of green + intergreen of all phases = ${rep.cycleCheck.toFixed(1)} s = cycle ${rep.cycle} s`);
ok(rep.phases.every((p) => p.green + 1e-9 >= p.minGreen), 'every green is at least its minimum green');
ok(rep.phases.every((p) => p.green > 0 && p.yellow >= 3 && p.allRed >= 1), 'every phase has green, yellow >= 3 s, all-red >= 1 s');
ok(rep.maxX <= 1, `degree of saturation of every movement <= 1 (largest ${rep.maxX.toFixed(2)})`);
ok(['A', 'B', 'C', 'D', 'E'].includes(rep.los), `average level of service ${rep.los} at an average delay of ${rep.delay.toFixed(1)} s`);
// Webster hand check of the example: L = sum of the intergreens, Y = sum of the four critical y
const Lh = rep.phases.reduce((a, p) => a + p.intergreen, 0);
const Yh = rep.phases.reduce((a, p) => a + p.y, 0);
ok(near(rep.websterCycle, (1.5 * Lh + 5) / (1 - Yh), 1e-9), `Webster of the example: L ${Lh.toFixed(1)}, Y ${Yh.toFixed(3)} -> ${rep.websterCycle.toFixed(1)} s`);
// the through phases get more green than the pockets (their y is larger)
ok(rep.phases[0].green > rep.phases[1].green && rep.phases[2].green > rep.phases[3].green, 'through phases get more green than the right pockets');
// mixed traffic through the IRC method works and gives a report with every source flagged
const irc = designSignal({ name: 'IRC method check', method: 'irc', phases: [{ name: 'A', movements: [{ id: 'A1', widthM: 7, flows: { car: 400, bus: 20, motorcycle: 300, rickshaw: 60 }, speedKmh: 50, clearanceM: 18 }] }, { name: 'B', movements: [{ id: 'B1', widthM: 7, flows: { car: 350, bus: 15, motorcycle: 250, rickshaw: 40 }, speedKmh: 50, clearanceM: 18 }] }] });
ok(irc.cycle % 5 === 0 && irc.sources.includes('IRC_SP41') && signalReportText(irc).includes('NOT opened'), 'IRC method: designs a 2-phase junction of mixed traffic, the report names the sources and flags the one that was not opened');
// an over-capacity demand is reported, not hidden
const over = designSignal({ name: 'over capacity', phases: [{ name: 'A', movements: [{ id: 'A1', lanes: 1, flowPcu: 1500, speedKmh: 50, clearanceM: 15 }] }, { name: 'B', movements: [{ id: 'B1', lanes: 1, flowPcu: 1400, speedKmh: 50, clearanceM: 15 }] }] });
ok(over.warnings.some((w) => w.includes('over capacity')) && over.cycle <= 120, 'over-capacity demand: warning printed and the cycle is capped at 120 s');
// every step of a report names at least one source and every named source exists
ok([rep, irc, over].every((r) => r.steps.every((s) => s.src.length > 0 && s.src.every((k) => k in SIGNAL_SOURCES))), 'every report step names existing sources');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
