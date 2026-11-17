// SIGNAL DESIGN STANDARD + CALCULATOR (pure maths: no three.js, no DOM, no game state, so any script, the game or a future report download can use it).
//
// WHAT THIS IS: one place that says how a traffic signal of the game is DESIGNED, with the formulas of the international practice, the default values, and a source for every number.
// Anybody can give it the geometry and the traffic of an intersection and get back the full design (clearance times, pedestrian times, cycle length, green splits, capacity, delay,
// level of service, signal head layout) as numbers AND as a step-by-step report (`designSignal` -> `signalReportText`). The report is plain data, so a "download report" button can be
// added later without touching the maths.
//
// UNITS: SI only (m, s, m/s, veh/h, pcu/h). The American sources use feet / mph: their values are converted once here (10 ft/s2 = 3.05 m/s2, 20 ft = 6.1 m).
// TRAFFIC DIRECTION: left-hand traffic (Bangladesh, India, Australia, UK). The formulas do not depend on the side; only the turning conflicts do (the RIGHT turn crosses the opposing
// traffic, the LEFT turn is the easy one), which is why the J1 star has right-turn POCKETS with their own phase and free left slips.
//
// HONESTY RULE: every source has `checked`. true = the page / document was opened and the number read there. false = the formula is the well-known one but the original was NOT opened
// when this file was written; check it against the original before the number is used in a real design. Every default has `basis`: 'standard' (a source gives the number) or
// 'assumption' (an engineering choice of this game, no source). The report prints both, so nothing looks more certain than it is.
//
// Used by (next steps): TrafficSignals (J1 timing from this calculator instead of fixed numbers), later every junction of the map.

// ------------------------------------------------------------------ sources
export interface SignalSource {
  id: string;
  /** Full citation. */
  cite: string;
  url: string;
  /** What this game takes from it. */
  used: string;
  /** true = opened and read when this file was written; false = formula known from the literature, original not opened (verify before real use). */
  checked: boolean;
}

export const SIGNAL_SOURCES: Readonly<Record<string, SignalSource>> = {
  FHWA_STM: {
    id: 'FHWA_STM',
    cite: 'FHWA, Traffic Signal Timing Manual, FHWA-HOP-08-024 (2008), Chapter 5 (Eq. 5-1 .. 5-4, Tables 5-3, 5-8) and Chapter 3 (Table 3-3). The archived edition was replaced by the Signal Timing Manual, Second Edition.',
    url: 'https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm',
    used: 'change period (yellow + red clearance) equation and defaults, pedestrian times, minimum green, LOS thresholds',
    checked: true,
  },
  FHWA_SHOESTRING: {
    id: 'FHWA_SHOESTRING',
    cite: 'FHWA, Signal Timing on a Shoestring, Section IV "Local Controller Parameters".',
    url: 'https://ops-dr.fhwa.dot.gov/Publications/signal_timing/04.htm',
    used: 'yellow = t + S / (2a +- 64.4 g), red = (W + L) / S, usual red clearance 1 to 2 s, walking speed 3.5 to 4 ft/s',
    checked: true,
  },
  IDAHO: {
    id: 'IDAHO',
    cite: 'Idaho Transportation Department Traffic Manual, section 12-306.2 (as reproduced in the University of Idaho signal timing lab manual): Y + R = t + V / (2a +- 2Gg) + (W + L) / V.',
    url: 'https://www.webpages.uidaho.edu/niatt_labmanual/Chapters/signaltimingdesign/professionalpractice/IntergreenTime.htm',
    used: 'the same equation with the grade term written 2Gg; defaults t = 1.0 s, a = 10 ft/s2, L = 20 ft',
    checked: true,
  },
  UIDAHO_WEBSTER: {
    id: 'UIDAHO_WEBSTER',
    cite: 'University of Idaho, signal timing lab manual, "Cycle length determination": Co = (1.5 L + 5) / (1 - sum(V/s)), L = sum of the intergreens, round the cycle up to a multiple of 5 s.',
    url: 'https://www.webpages.uidaho.edu/niatt_labmanual/Chapters/signaltimingdesign/theoryandconcepts/CycleLengthDetermination.htm',
    used: "Webster's optimum cycle length, definition of lost time, rounding rule",
    checked: true,
  },
  WEBSTER58: {
    id: 'WEBSTER58',
    cite: 'Webster, F. V. (1958). Traffic Signal Settings. Road Research Technical Paper No. 39, Road Research Laboratory, HMSO, London.',
    url: 'https://trid.trb.org/',  // TRID database home: search for the title
    used: "origin of the optimum cycle length and of the green split in proportion to the flow ratios (the original was not opened; the formula was read in the Idaho manual above)",
    checked: false,
  },
  IRC_SP41: {
    id: 'IRC_SP41',
    cite: 'Indian Roads Congress, IRC:SP:41-1994, Guidelines for the Design of At-Grade Intersections in Rural & Urban Areas: section 7.6 (capacity, saturation flow 525 w, gradient +-3 % per 1 %, lost time) and Table 3.1 (PCU factors). Signal timing itself is referred to IRC:93-1985.',
    url: 'https://law.resource.org/pub/in/bis/irc/irc.gov.in.sp.041.1994.pdf',
    used: 'saturation flow of a wide approach, narrow-approach table, gradient correction, PCU factors of mixed traffic (rickshaws, buses, motorcycles). The text layer of the PDF is garbled in places: the PCU table must be checked against the printed page.',
    checked: true,
  },
  DPTI_TS001: {
    id: 'DPTI_TS001',
    cite: 'Department for Infrastructure and Transport (South Australia), Traffic Signal Standard Signal Timings TS001: section 3.2 Table 1 (yellow by speed), 4.2 Tables 3-4 (red by clearance distance), 5 (minimum green), 6 (pedestrians). Left-hand traffic.',
    url: 'https://dpti.sa.gov.au/__data/assets/pdf_file/0006/895560/Traffic_Signal_Standard_Signal_Timings_TS001.pdf',
    used: 'cross-check of the yellow time by speed, basic minimum green 5 s, pedestrian walk 5 s and clearance at 1.2 m/s, signals not recommended above 80 km/h',
    checked: true,
  },
  MUTCD: {
    id: 'MUTCD',
    cite: 'FHWA, Manual on Uniform Traffic Control Devices, 2003 edition (as published by ODOT): Part 4 sections 4D.15 / 4D.16 / 4D.17 and Table 4D-1 (signal faces), 4E.04 / 4E.10 (pedestrian signals). The 11th edition (2023) renumbers the sections and was not opened.',
    url: 'https://www.odot.org/traffic/mutcd2003/htmVersion/htm/part4d.htm',
    used: 'lens sizes 200 / 300 mm, mounting heights, minimum two faces, placement 12 .. 55 m past the stop line, lens order, minimum visibility distance, pedestrian symbol size, walking speed 1.2 m/s, minimum walk 7 s (4 s allowed)',
    checked: true,
  },
  HCM: {
    id: 'HCM',
    cite: 'Transportation Research Board (publisher home page given, no page of the manual was opened), Highway Capacity Manual (6th / 7th edition), signalized intersections: base saturation flow 1900 pc/h/lane, uniform delay d1 = 0.5 C (1 - g/C)^2 / (1 - min(1, X) g/C), incremental delay d2 = 900 T [(X - 1) + sqrt((X - 1)^2 + 8 k I X / (c T))], grade factor 1 - G/200. LOS thresholds are those of FHWA_STM Table 3-3 (which cites HCM 2000).',
    url: 'https://www.trb.org/',
    used: 'saturation flow of a normal lane, delay and level of service',
    checked: false,
  },
  AUSTROADS_P9: {
    id: 'AUSTROADS_P9',
    cite: 'Austroads, Guide to Traffic Management Part 9: Traffic Operations (left-hand traffic).',
    url: 'https://austroads.gov.au/publications/traffic-management/agtm09-16',
    used: 'further reading for left-hand traffic practice only (not opened, no number of this game comes from it)',
    checked: false,
  },
};

// ------------------------------------------------------------------ defaults
export interface SignalDefault {
  value: number;
  unit: string;
  /** Source ids (SIGNAL_SOURCES). */
  src: string[];
  basis: 'standard' | 'assumption';
  note: string;
}

const FT = 0.3048;

export const SIGNAL_DEFAULTS = {
  reactionTime: { value: 1.0, unit: 's', src: ['FHWA_STM', 'IDAHO'], basis: 'standard', note: 'driver perception-reaction time t' },
  decel: { value: 10 * FT, unit: 'm/s2', src: ['FHWA_STM', 'IDAHO'], basis: 'standard', note: 'comfortable deceleration a = 10 ft/s2 = 3.05 m/s2' },
  vehicleLength: { value: 20 * FT, unit: 'm', src: ['FHWA_STM', 'IDAHO'], basis: 'standard', note: 'design vehicle length L = 20 ft = 6.1 m (a passenger car)' },
  gravity: { value: 9.81, unit: 'm/s2', src: ['IDAHO'], basis: 'standard', note: 'g' },
  yellowMin: { value: 3.0, unit: 's', src: ['FHWA_STM', 'DPTI_TS001'], basis: 'standard', note: 'MUTCD suggests a yellow of about 3 to 6 s; DPTI Table 1 starts at 3.0 s (40 km/h)' },
  yellowMax: { value: 6.0, unit: 's', src: ['FHWA_STM'], basis: 'standard', note: 'upper end of the 3 to 6 s range' },
  allRedMax: { value: 6.0, unit: 's', src: ['FHWA_STM'], basis: 'standard', note: 'red clearance of no more than 6 s' },
  allRedMin: { value: 1.0, unit: 's', src: ['DPTI_TS001', 'FHWA_SHOESTRING'], basis: 'standard', note: 'DPTI red tables start at 1.0 s; FHWA: normally 1 to 2 s (0 to 0.5 s on slow approaches)' },
  pedSpeed: { value: 1.2, unit: 'm/s', src: ['MUTCD', 'DPTI_TS001'], basis: 'standard', note: 'normal pedestrian walking speed (MUTCD 4E.10 and DPTI 6.1: 1.2 m/s)' },
  pedSpeedSlow: { value: 1.0, unit: 'm/s', src: ['DPTI_TS001', 'FHWA_STM'], basis: 'standard', note: 'slow pedestrians (DPTI 6.2: 1.0 m/s; FHWA: 3.0 to 3.5 ft/s where elderly / children are many)' },
  minWalk: { value: 7, unit: 's', src: ['MUTCD', 'FHWA_STM'], basis: 'standard', note: 'minimum WALK interval (MUTCD 4E.10; 4 s allowed where pedestrian volumes are low)' },
  minWalkLow: { value: 4, unit: 's', src: ['MUTCD', 'FHWA_STM'], basis: 'standard', note: 'shortest WALK interval where few pedestrians cross' },
  minGreenThroughFast: { value: 10, unit: 's', src: ['FHWA_STM'], basis: 'standard', note: 'through phase on a major arterial over 40 mph (64 km/h): 10 to 15 s (Table 5-3), lower end taken' },
  minGreenThrough: { value: 7, unit: 's', src: ['FHWA_STM'], basis: 'standard', note: 'through phase on a major arterial of 40 mph or less: 7 to 15 s (Table 5-3), lower end taken' },
  minGreenTurn: { value: 5, unit: 's', src: ['DPTI_TS001'], basis: 'standard', note: 'basic minimum green 5 s (DPTI section 5); FHWA gives 2 to 5 s for left turns' },
  satFlowLane: { value: 1900, unit: 'pcu/h/lane', src: ['HCM'], basis: 'standard', note: 'base saturation flow of one lane' },
  satFlowPerMetre: { value: 525, unit: 'pcu/h per m of width', src: ['IRC_SP41'], basis: 'standard', note: 's = 525 w for an approach 5.5 to 18 m wide (IRC:SP:41 7.6.1.1)' },
  lostPerPhaseExtra: { value: 0, unit: 's', src: ['UIDAHO_WEBSTER'], basis: 'assumption', note: 'start-up lost time added on top of the intergreen; the Idaho manual takes the lost time as the sum of the intergreens, so 0' },
  maxCycle: { value: 120, unit: 's', src: [], basis: 'assumption', note: 'longest cycle this game accepts (a driver waits at most one cycle); no verified source, a common practical limit' },
  minCycle: { value: 30, unit: 's', src: [], basis: 'assumption', note: 'shortest cycle this game accepts (lost time would dominate)' },
  websterLimitY: { value: 0.85, unit: '-', src: ['UIDAHO_WEBSTER'], basis: 'assumption', note: 'sum of the critical flow ratios above this: the optimum-cycle formula blows up (Y -> 1), the cycle is capped and a warning is printed' },
  deltaT: { value: 0.25, unit: 'h', src: ['HCM'], basis: 'standard', note: 'analysis period T of the incremental delay d2' },
  kPretimed: { value: 0.5, unit: '-', src: ['HCM'], basis: 'standard', note: 'delay factor k for pre-timed signals' },
  iIsolated: { value: 1.0, unit: '-', src: ['HCM'], basis: 'standard', note: 'upstream filtering factor I for an isolated intersection' },
} as const satisfies Record<string, SignalDefault>;

/** PCU factors for mixed traffic (IRC:SP:41-1994 Table 3.1). The text layer of the source PDF is garbled: check the mapping against the printed page before a real design. */
export const PCU_FACTORS = {
  car: 1.0, // passenger car, jeep, pickup
  auto: 1.0, // auto-rickshaw / CNG
  motorcycle: 0.5,
  bus: 3.0,
  truck: 3.0,
  cycle: 0.5,
  rickshaw: 1.5, // cycle rickshaw
} as const;
export type PcuClass = keyof typeof PCU_FACTORS;

/** Yellow time by posted speed (DPTI_TS001 section 3.2 Table 1), used as a CROSS-CHECK of the calculated yellow. [km/h, s] */
export const YELLOW_TABLE_DPTI: ReadonlyArray<readonly [number, number]> = [[40, 3.0], [50, 4.0], [60, 4.0], [70, 4.5], [80, 5.0], [90, 5.5], [100, 6.0], [110, 6.5]];

/** IRC:SP:41-1994 7.6.1.1: saturation flow (pcu/h) of approaches narrower than 5.5 m. [width m, pcu/h] */
export const SAT_NARROW_IRC: ReadonlyArray<readonly [number, number]> = [[3.0, 1850], [3.5, 1890], [4.0, 1950], [4.5, 2250], [5.0, 2550], [5.5, 2990]];

/** MUTCD Table 4D-1: minimum visibility distance of a signal face by 85th percentile speed. [km/h, m] */
export const SIGHT_TABLE_MUTCD: ReadonlyArray<readonly [number, number]> = [[30, 50], [40, 65], [50, 85], [60, 110], [70, 140], [80, 165], [90, 195], [100, 220]];

/** FHWA_STM Table 3-3 (cites HCM 2000): control delay (s/veh) upper limits of LOS A .. E; above the last is F. */
export const LOS_LIMITS: ReadonlyArray<readonly [string, number]> = [['A', 10], ['B', 20], ['C', 35], ['D', 55], ['E', 80]];

const D = SIGNAL_DEFAULTS;
const ceil1 = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;

// ------------------------------------------------------------------ formulas
/**
 * YELLOW CHANGE INTERVAL (s):  Y = t + v / (2 a + 2 g G)
 * v = approach speed (m/s), a = deceleration, G = grade as a decimal (+ uphill: the car stops sooner, the yellow is shorter), g = 9.81.
 * Result rounded UP to 0.1 s and kept inside 3 .. 6 s. Sources: FHWA_STM Eq. 5-2 (first term), FHWA_SHOESTRING, IDAHO.
 */
export function yellowTime(v: number, grade = 0, t: number = D.reactionTime.value, a: number = D.decel.value): number {
  const raw = t + v / (2 * a + 2 * D.gravity.value * grade);
  return Math.min(D.yellowMax.value, Math.max(D.yellowMin.value, ceil1(raw)));
}

/** The raw (unclamped, unrounded) yellow of `yellowTime`, for the report. */
export function yellowRaw(v: number, grade = 0, t: number = D.reactionTime.value, a: number = D.decel.value): number {
  return t + v / (2 * a + 2 * D.gravity.value * grade);
}

/**
 * ALL-RED (RED CLEARANCE) INTERVAL (s):  R = (W + L) / v
 * W = distance from the stop line to the far side of the last conflicting lane (m), L = vehicle length (m), v = approach speed (m/s).
 * Rounded UP to 0.1 s, kept between 1 and 6 s (below 1 s only on very slow approaches: pass `allowShort`). Sources: FHWA_STM Eq. 5-2 (second term), FHWA_SHOESTRING, IDAHO.
 */
export function allRedTime(w: number, v: number, len: number = D.vehicleLength.value, allowShort = false): number {
  const raw = (w + len) / v;
  return Math.min(D.allRedMax.value, Math.max(allowShort ? 0 : D.allRedMin.value, ceil1(raw)));
}

/** DPTI cross-check: the yellow (s) the South Australian table gives for a posted speed (km/h), stepped up to the next table speed. */
export function yellowTableDpti(kmh: number): number {
  for (const [s, y] of YELLOW_TABLE_DPTI) if (kmh <= s) return y;
  return YELLOW_TABLE_DPTI[YELLOW_TABLE_DPTI.length - 1][1];
}

/** PEDESTRIAN CLEARANCE TIME (s): PCT = Dc / vp, rounded up to a whole second (FHWA_STM 5.3.3, DPTI Eq. 5). Dc = kerb-to-kerb crossing distance (m). */
export function pedClearance(crossingM: number, speed: number = D.pedSpeed.value): number {
  return Math.ceil(crossingM / speed - 1e-9);
}

/** MINIMUM GREEN of a phase that serves pedestrians (s): G = WALK + PC (FHWA_STM Eq. 5-1). With `credit` the vehicle yellow + all-red may count as pedestrian clearance (Eq. 5-4: PC = PCT - (Y + R)). */
export function pedMinGreen(crossingM: number, opts: { walk?: number; speed?: number; credit?: number } = {}): { walk: number; clearance: number; green: number } {
  const walk = opts.walk ?? D.minWalk.value;
  const pct = pedClearance(crossingM, opts.speed ?? D.pedSpeed.value);
  const clearance = Math.max(0, pct - (opts.credit ?? 0));
  return { walk, clearance, green: walk + clearance };
}

/** SATURATION FLOW, IRC:SP:41 (pcu/h) of one approach of width w (m, kerb to median): 525 w for 5.5 .. 18 m, the table below 5.5 m (linear between entries), gradient +-3 % per 1 % (uphill = positive percent). */
export function satFlowIrc(widthM: number, gradePct = 0): number {
  let s: number;
  if (widthM >= 5.5) s = D.satFlowPerMetre.value * Math.min(widthM, 18);
  else if (widthM <= SAT_NARROW_IRC[0][0]) s = SAT_NARROW_IRC[0][1];
  else {
    s = SAT_NARROW_IRC[SAT_NARROW_IRC.length - 1][1];
    for (let i = 1; i < SAT_NARROW_IRC.length; i++) {
      const [w0, s0] = SAT_NARROW_IRC[i - 1];
      const [w1, s1] = SAT_NARROW_IRC[i];
      if (widthM <= w1) { s = s0 + ((s1 - s0) * (widthM - w0)) / (w1 - w0); break; }
    }
  }
  return s * Math.max(0.1, 1 - 0.03 * gradePct);
}

/** SATURATION FLOW, HCM (pcu/h) of `lanes` ordinary lanes: 1900 x lanes x grade factor (1 - G/200, G in %, uphill positive). */
export function satFlowHcm(lanes: number, gradePct = 0): number {
  return D.satFlowLane.value * lanes * Math.max(0.1, 1 - gradePct / 200);
}

/** Traffic of mixed vehicles (veh/h per class) -> pcu/h with the IRC:SP:41 factors. */
export function toPcu(flows: Partial<Record<PcuClass, number>>): number {
  let q = 0;
  for (const k of Object.keys(flows) as PcuClass[]) q += (flows[k] ?? 0) * PCU_FACTORS[k];
  return q;
}

/** WEBSTER'S OPTIMUM CYCLE (s): Co = (1.5 L + 5) / (1 - Y), L = lost time per cycle, Y = sum of the critical flow ratios. Returns Infinity when Y >= 1 (the junction cannot be served by any cycle). */
export function websterCycle(lost: number, Y: number): number {
  if (Y >= 1) return Infinity;
  return (1.5 * lost + 5) / (1 - Y);
}

/** HCM control delay (s/veh) of one lane group: d1 (uniform) + d2 (incremental), progression factor 1, no initial queue. C cycle, g effective green (s), X = v/c, c capacity (veh/h). */
export function controlDelay(C: number, g: number, X: number, c: number): { d1: number; d2: number; d: number } {
  const gc = Math.min(1, g / C);
  const d1 = (0.5 * C * (1 - gc) ** 2) / (1 - Math.min(1, X) * gc);
  const T = D.deltaT.value;
  const d2 = 900 * T * ((X - 1) + Math.sqrt((X - 1) ** 2 + (8 * D.kPretimed.value * D.iIsolated.value * X) / Math.max(1e-6, c * T)));
  return { d1, d2, d: d1 + d2 };
}

/** LOS letter of a control delay (s/veh), FHWA_STM Table 3-3. */
export function losOf(delay: number): string {
  for (const [l, lim] of LOS_LIMITS) if (delay <= lim) return l;
  return 'F';
}

// ------------------------------------------------------------------ signal head (MUTCD part 4)
export interface HeadInput {
  /** 85th percentile approach speed (km/h). */
  speedKmh: number;
  /** Distance (m) from the stop line to the nearest signal face the driver sees. */
  faceDistM: number;
  /** The approach has arrow indications (turn arrows). */
  arrows?: boolean;
  /** Distance (m) of pedestrians from the pedestrian signal head when they enter the crosswalk. */
  pedEntryDistM?: number;
}
export interface HeadDesign {
  lensMm: 200 | 300;
  lensWhy: string;
  /** Lowest (m) and highest (m) allowed height of the bottom of the housing of a post-mounted face (vertical array), and the overhead minimum. */
  postHeight: [number, number];
  overheadMin: number;
  /** Least number of faces on the approach and least spacing (m) of two through faces. */
  minFaces: number;
  faceSpacingMin: number;
  /** Where the faces must stand: distance range (m) past the stop line, and the half angle (deg) of the cone about the approach centre line seen from 3 m behind the stop line. */
  faceRangeM: [number, number];
  coneDeg: number;
  minSightM: number;
  lensOrder: string[];
  pedSymbolMm: number;
  lateralMin: number;
}

/** SIGNAL HEAD DESIGN from MUTCD 4D.15 / 4D.16 / 4D.17, Table 4D-1, 4E.04. Values are the limits of the 2003 edition (see SIGNAL_SOURCES.MUTCD). */
export function headDesign(h: HeadInput): HeadDesign {
  let lens: 200 | 300 = 200;
  let why = '200 mm is enough: speed <= 60 km/h, nearest face within 35 m of the stop line, no arrows';
  if (h.arrows) { lens = 300; why = '300 mm required for arrow indications (4D.15)'; }
  else if (h.faceDistM > 45) { lens = 300; why = '300 mm required: nearest face more than 45 m beyond the stop line (4D.15)'; }
  else if (h.faceDistM >= 35) { lens = 300; why = '300 mm required: nearest face 35 .. 45 m beyond the stop line unless a near-side face is added (4D.15)'; }
  else if (h.speedKmh > 60) { lens = 300; why = '300 mm preferred: 85th percentile speed above 60 km/h (4D.15 guidance)'; }
  let sight = SIGHT_TABLE_MUTCD[SIGHT_TABLE_MUTCD.length - 1][1];
  for (const [s, m] of SIGHT_TABLE_MUTCD) if (h.speedKmh <= s) { sight = m; break; }
  return {
    lensMm: lens,
    lensWhy: why,
    postHeight: [2.4, 5.8],
    overheadMin: 4.6,
    minFaces: 2,
    faceSpacingMin: 2.4,
    faceRangeM: [12, 55],
    coneDeg: 20,
    minSightM: sight,
    lensOrder: ['RED (top)', 'YELLOW', 'GREEN', 'arrows below (left-turn / right-turn arrows as 4D.16)'],
    pedSymbolMm: (h.pedEntryDistM ?? 0) > 30 ? 225 : 150,
    lateralMin: 0.6,
  };
}

// ------------------------------------------------------------------ full design
export interface MovementInput {
  id: string;
  /** Demand in pcu/h of the whole lane group, or veh/h per vehicle class (converted with PCU_FACTORS). */
  flowPcu?: number;
  flows?: Partial<Record<PcuClass, number>>;
  /** Number of lanes of the lane group (HCM method), or the width (m) of the approach (IRC method: `widthM`). One of the two. */
  lanes?: number;
  widthM?: number;
  /** Grade (%), uphill positive, of the approach. */
  gradePct?: number;
  /** Approach speed (km/h) used for the clearance times. */
  speedKmh: number;
  /** Clearance distance W (m): stop line to the far side of the last conflicting lane. */
  clearanceM: number;
  /** Turning movement (minimum green of a turn pocket, not of a through phase). */
  turn?: boolean;
}
export interface PedestrianInput {
  /** Kerb-to-kerb crossing distance (m) served in this phase. */
  crossingM: number;
  slow?: boolean;
  /** Let the vehicle yellow + all-red count as pedestrian clearance (FHWA_STM Eq. 5-4). */
  credit?: boolean;
}
export interface PhaseInput {
  name: string;
  movements: MovementInput[];
  ped?: PedestrianInput;
}
export interface DesignInput {
  name: string;
  phases: PhaseInput[];
  /** Saturation flow method: 'hcm' (1900 per lane, default) or 'irc' (525 per metre width, for wide mixed-traffic approaches). */
  method?: 'hcm' | 'irc';
  /** Force the cycle (s) instead of Webster's optimum (e.g. to test a timing). */
  cycle?: number;
  /** Signal head context for the head design (same for all approaches). */
  head?: { faceDistM: number; arrows: boolean; pedEntryDistM?: number };
}

export interface ReportStep {
  id: string;
  title: string;
  formula: string;
  /** The numbers put into the formula, already written out. */
  working: string;
  result: string;
  src: string[];
}
export interface MovementResult {
  id: string;
  flowPcu: number;
  sat: number;
  y: number;
  capacity: number;
  X: number;
  d1: number;
  d2: number;
  delay: number;
  los: string;
  /** Vehicles arriving per lane per cycle. */
  perLaneCycle: number;
}
export interface PhaseResult {
  name: string;
  yellow: number;
  yellowRaw: number;
  yellowDpti: number;
  allRed: number;
  intergreen: number;
  minGreen: number;
  ped: { walk: number; clearance: number; green: number } | null;
  criticalMovement: string;
  y: number;
  green: number;
  movements: MovementResult[];
}
export interface SignalDesignReport {
  name: string;
  method: 'hcm' | 'irc';
  phases: PhaseResult[];
  lost: number;
  Y: number;
  websterCycle: number;
  cycle: number;
  /** Sum of (green + intergreen) of all phases: must equal the cycle. */
  cycleCheck: number;
  delay: number;
  los: string;
  maxX: number;
  head: HeadDesign | null;
  steps: ReportStep[];
  warnings: string[];
  sources: string[];
}

const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const f3 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : String(x));

/**
 * THE DESIGN. Steps (the report lists them in this order):
 *  1 clearance per phase: yellow and all-red of the worst movement, checked against the DPTI table
 *  2 pedestrian time and minimum green
 *  3 saturation flow and flow ratio y = q / s of every movement; the critical movement of a phase is the one with the largest y
 *  4 lost time L = sum of the intergreens (+ extra), Y = sum of the critical y, Webster's cycle, rounded up to 5 s, limits
 *  5 green split: the time left (C - sum of intergreens) shared in proportion to y, never below the minimum green (the cycle grows if the minimums need it)
 *  6 capacity c = s g / C, degree of saturation X = q / c, delay (HCM d1 + d2) and LOS of every movement, flow-weighted average
 *  7 signal head layout (MUTCD)
 */
export function designSignal(inp: DesignInput): SignalDesignReport {
  const method = inp.method ?? 'hcm';
  const steps: ReportStep[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  const add = (s: ReportStep): void => { steps.push(s); for (const k of s.src) used.add(k); };
  const phases: PhaseResult[] = [];

  // 1 + 2 + 3: per phase
  for (const ph of inp.phases) {
    let yel = 0, yelRaw = 0, red = 0, redRaw = 0, dpti = 0, minG = 0;
    let yWhy = '', rWhy = '';
    const mv: MovementResult[] = [];
    let yCrit = 0, critId = '';
    for (const m of ph.movements) {
      const v = m.speedKmh / 3.6;
      const g = (m.gradePct ?? 0) / 100;
      const y1 = yellowTime(v, g);
      const r1 = allRedTime(m.clearanceM, v);
      if (y1 > yel) { yel = y1; yelRaw = yellowRaw(v, g); yWhy = `${m.id}: v = ${f2(v)} m/s (${m.speedKmh} km/h), G = ${f2(g * 100)} %`; }
      if (r1 > red) { red = r1; redRaw = (m.clearanceM + D.vehicleLength.value) / v; rWhy = `${m.id}: W = ${f1(m.clearanceM)} m, L = ${f1(D.vehicleLength.value)} m, v = ${f2(v)} m/s`; }
      dpti = Math.max(dpti, yellowTableDpti(m.speedKmh));
      minG = Math.max(minG, m.turn ? D.minGreenTurn.value : m.speedKmh > 64 ? D.minGreenThroughFast.value : D.minGreenThrough.value);
      const q = (m.flowPcu ?? 0) + (m.flows ? toPcu(m.flows) : 0);
      let s: number;
      if (method === 'irc') {
        if (m.widthM === undefined) throw new Error(`movement ${m.id}: method irc needs widthM`);
        s = satFlowIrc(m.widthM, m.gradePct ?? 0);
      } else {
        if (m.lanes === undefined) throw new Error(`movement ${m.id}: method hcm needs lanes`);
        s = satFlowHcm(m.lanes, m.gradePct ?? 0);
      }
      const y = q / s;
      if (y > yCrit) { yCrit = y; critId = m.id; }
      mv.push({ id: m.id, flowPcu: q, sat: s, y, capacity: 0, X: 0, d1: 0, d2: 0, delay: 0, los: '', perLaneCycle: 0 });
    }
    if (Math.abs(yel - yelRaw) > 1e-9 && (yelRaw < D.yellowMin.value || yelRaw > D.yellowMax.value)) warnings.push(`${ph.name}: calculated yellow ${f2(yelRaw)} s was moved into the ${D.yellowMin.value}-${D.yellowMax.value} s range`);
    if (Math.abs(yel - dpti) > 0.75) warnings.push(`${ph.name}: calculated yellow ${f1(yel)} s differs from the DPTI table (${f1(dpti)} s) by more than 0.75 s`);
    let ped: PhaseResult['ped'] = null;
    if (ph.ped) {
      const p = pedMinGreen(ph.ped.crossingM, { speed: ph.ped.slow ? D.pedSpeedSlow.value : D.pedSpeed.value, credit: ph.ped.credit ? yel + red : 0 });
      ped = p;
      minG = Math.max(minG, p.green);
    }
    phases.push({ name: ph.name, yellow: yel, yellowRaw: yelRaw, yellowDpti: dpti, allRed: red, intergreen: yel + red, minGreen: minG, ped, criticalMovement: critId, y: yCrit, green: 0, movements: mv });
    add({ id: `clear-${ph.name}`, title: `Phase ${ph.name}: clearance times`, formula: 'Y = t + v / (2a + 2gG);  R = (W + L) / v', working: `Y: ${yWhy}, t = ${f1(D.reactionTime.value)} s, a = ${f2(D.decel.value)} m/s2 -> raw ${f2(yelRaw)} s;  R: ${rWhy} -> raw ${f2(redRaw)} s`, result: `yellow ${f1(yel)} s (DPTI table ${f1(dpti)} s), all-red ${f1(red)} s, intergreen ${f1(yel + red)} s`, src: ['FHWA_STM', 'FHWA_SHOESTRING', 'IDAHO', 'DPTI_TS001'] });
    if (ped) add({ id: `ped-${ph.name}`, title: `Phase ${ph.name}: pedestrians`, formula: 'PCT = Dc / vp;  Gmin = WALK + PC', working: `Dc = ${f1(ph.ped!.crossingM)} m, vp = ${f1(ph.ped!.slow ? D.pedSpeedSlow.value : D.pedSpeed.value)} m/s, WALK = ${ped.walk} s${ph.ped!.credit ? ', clearance credited with the yellow + all-red' : ''}`, result: `walk ${ped.walk} s + clearance ${ped.clearance} s = minimum green ${ped.green} s`, src: ['FHWA_STM', 'MUTCD', 'DPTI_TS001'] });
    add({ id: `flow-${ph.name}`, title: `Phase ${ph.name}: flow ratios`, formula: method === 'hcm' ? 's = 1900 N (1 - G/200);  y = q / s' : 's = 525 w (+-3 % per 1 % grade; table below 5.5 m);  y = q / s', working: mv.map((q) => `${q.id}: q = ${f1(q.flowPcu)} pcu/h, s = ${f1(q.sat)} pcu/h -> y = ${f3(q.y)}`).join('; '), result: `critical movement ${critId || '-'}, y = ${f3(yCrit)}`, src: method === 'hcm' ? ['HCM'] : ['IRC_SP41'] });
    if (ph.movements.some((x) => x.flows)) used.add('IRC_SP41');
  }

  // 4: cycle
  const extra = D.lostPerPhaseExtra.value;
  const lost = phases.reduce((a, p) => a + p.intergreen + extra, 0);
  const Y = phases.reduce((a, p) => a + p.y, 0);
  const wc = websterCycle(lost, Y);
  if (Y >= 1) warnings.push(`sum of critical flow ratios Y = ${f3(Y)} >= 1: the junction is over capacity for this demand (more lanes or a grade-separated design are needed); the cycle is capped at ${D.maxCycle.value} s`);
  else if (Y > D.websterLimitY.value) warnings.push(`Y = ${f3(Y)} is above ${D.websterLimitY.value}: Webster's cycle is very sensitive here, the cycle is capped at ${D.maxCycle.value} s (assumption)`);
  let cycle = inp.cycle ?? Math.ceil(Math.min(Number.isFinite(wc) ? wc : D.maxCycle.value, D.maxCycle.value) / 5 - 1e-9) * 5;
  cycle = Math.max(cycle, D.minCycle.value);
  const minNeeded = phases.reduce((a, p) => a + p.minGreen + p.intergreen, 0);
  if (cycle < minNeeded) { cycle = Math.ceil(minNeeded / 5 - 1e-9) * 5; warnings.push(`the minimum greens + intergreens (${f1(minNeeded)} s) are longer than the optimum cycle: cycle raised to ${cycle} s`); }
  if (cycle > D.maxCycle.value) warnings.push(`cycle ${cycle} s is longer than ${D.maxCycle.value} s (assumption limit)`);
  add({ id: 'cycle', title: 'Cycle length', formula: 'L = sum of intergreens;  Co = (1.5 L + 5) / (1 - Y);  round up to 5 s', working: `L = ${f1(lost)} s, Y = ${f3(Y)} -> Co = ${f1(wc)} s`, result: `cycle ${cycle} s (limits ${D.minCycle.value}..${D.maxCycle.value} s, assumption)`, src: ['UIDAHO_WEBSTER', 'WEBSTER58'] });

  // 5: greens (proportional to y, never below the minimum; redistribute what the minimums take)
  const avail = cycle - phases.reduce((a, p) => a + p.intergreen, 0);
  const free = new Set(phases.map((_, i) => i));
  let left = avail;
  for (let guard = 0; guard < 10; guard++) {
    const yFree = [...free].reduce((a, i) => a + Math.max(phases[i].y, 1e-6), 0);
    let moved = false;
    for (const i of [...free]) {
      const g = (left * Math.max(phases[i].y, 1e-6)) / yFree;
      if (g < phases[i].minGreen) { phases[i].green = phases[i].minGreen; left -= phases[i].minGreen; free.delete(i); moved = true; break; }
      phases[i].green = g;
    }
    if (!moved) break;
  }
  for (const p of phases) p.green = Math.round(p.green * 10) / 10;
  const cycleCheck = phases.reduce((a, p) => a + p.green + p.intergreen, 0);
  add({ id: 'split', title: 'Green split', formula: 'g_i = (C - sum of intergreens) x y_i / Y, not below the minimum green', working: phases.map((p) => `${p.name}: y = ${f3(p.y)}, min ${f1(p.minGreen)} s`).join('; '), result: phases.map((p) => `${p.name} ${f1(p.green)} s`).join(', ') + `  (sum with intergreens ${f1(cycleCheck)} s)`, src: ['UIDAHO_WEBSTER', 'WEBSTER58'] });

  // 6: capacity, delay, LOS
  let dSum = 0, qSum = 0, maxX = 0;
  for (const p of phases) {
    for (const q of p.movements) {
      const ge = p.green;
      q.capacity = (q.sat * ge) / cycle;
      q.X = q.capacity > 0 ? q.flowPcu / q.capacity : Infinity;
      const dd = controlDelay(cycle, ge, q.X, q.capacity);
      q.d1 = dd.d1; q.d2 = dd.d2; q.delay = dd.d;
      q.los = losOf(q.delay);
      const lanes = method === 'hcm' ? (inp.phases.flatMap((x) => x.movements).find((m) => m.id === q.id)?.lanes ?? 1) : 1;
      q.perLaneCycle = (q.flowPcu * cycle) / 3600 / Math.max(1, lanes);
      dSum += q.delay * q.flowPcu; qSum += q.flowPcu; maxX = Math.max(maxX, q.X);
      if (q.X > 1) warnings.push(`${q.id}: degree of saturation X = ${f2(q.X)} > 1 (queue grows every cycle)`);
      else if (q.X > 0.9) warnings.push(`${q.id}: degree of saturation X = ${f2(q.X)} > 0.9 (close to capacity)`);
    }
  }
  const delay = qSum > 0 ? dSum / qSum : 0;
  add({ id: 'delay', title: 'Capacity, delay, level of service', formula: 'c = s g / C;  X = q / c;  d = d1 + d2 (HCM);  LOS from Table 3-3', working: phases.flatMap((p) => p.movements.map((q) => `${q.id}: c = ${f1(q.capacity)}, X = ${f2(q.X)}, d1 = ${f1(q.d1)}, d2 = ${f1(q.d2)} -> ${f1(q.delay)} s ${q.los}`)).join('; '), result: `flow-weighted average delay ${f1(delay)} s, LOS ${losOf(delay)}, largest X ${f2(maxX)}`, src: ['HCM', 'FHWA_STM'] });

  // 7: head
  let head: HeadDesign | null = null;
  if (inp.head) {
    const sp = Math.max(...inp.phases.flatMap((p) => p.movements.map((m) => m.speedKmh)));
    head = headDesign({ speedKmh: sp, faceDistM: inp.head.faceDistM, arrows: inp.head.arrows, pedEntryDistM: inp.head.pedEntryDistM });
    add({ id: 'head', title: 'Signal head layout', formula: 'MUTCD 4D.15 / 4D.16 / 4D.17, Table 4D-1', working: `85th percentile speed ${sp} km/h, nearest face ${f1(inp.head.faceDistM)} m past the stop line, arrows ${inp.head.arrows ? 'yes' : 'no'}`, result: `${head.lensMm} mm lenses (${head.lensWhy}); at least ${head.minFaces} faces ${head.faceSpacingMin} m apart; faces ${head.faceRangeM[0]}..${head.faceRangeM[1]} m past the stop line, inside ${head.coneDeg} deg of the approach axis; post-mounted bottom of housing ${head.postHeight[0]}..${head.postHeight[1]} m, overhead at least ${head.overheadMin} m; visible from ${head.minSightM} m; pedestrian symbol ${head.pedSymbolMm} mm; clear ${head.lateralMin} m from the kerb`, src: ['MUTCD'] });
  }

  for (const k of used) if (!SIGNAL_SOURCES[k]?.checked) warnings.push(`source ${k} was not opened when this standard was written: verify its numbers against the original before a real design`);
  return { name: inp.name, method, phases, lost, Y, websterCycle: wc, cycle, cycleCheck, delay, los: losOf(delay), maxX, head, steps, warnings, sources: [...used] };
}

/** Plain-text report of a design (for a download later): inputs and results step by step, warnings, and the full list of sources used. */
export function signalReportText(r: SignalDesignReport): string {
  const L: string[] = [];
  L.push(`TRAFFIC SIGNAL DESIGN REPORT: ${r.name}`);
  L.push(`Method: ${r.method === 'hcm' ? 'HCM saturation flow (1900 pcu/h/lane)' : 'IRC:SP:41 saturation flow (525 pcu/h per m)'}.  Units: SI.  Left-hand traffic.`);
  L.push('');
  L.push(`RESULT: cycle ${r.cycle} s, ${r.phases.length} phases, average delay ${f1(r.delay)} s/veh, level of service ${r.los}, largest degree of saturation ${f2(r.maxX)}`);
  for (const p of r.phases) L.push(`  ${p.name}: green ${f1(p.green)} s + yellow ${f1(p.yellow)} s + all-red ${f1(p.allRed)} s`);
  L.push('');
  L.push('CALCULATION');
  r.steps.forEach((s, i) => {
    L.push(`${i + 1}. ${s.title}`);
    L.push(`   Formula: ${s.formula}`);
    L.push(`   Working: ${s.working}`);
    L.push(`   Result:  ${s.result}`);
    L.push(`   Source:  ${s.src.join(', ')}`);
  });
  if (r.warnings.length) {
    L.push('');
    L.push('WARNINGS');
    for (const w of r.warnings) L.push(`  - ${w}`);
  }
  L.push('');
  L.push('SOURCES');
  for (const k of r.sources) {
    const s = SIGNAL_SOURCES[k];
    if (s) L.push(`  [${s.id}] ${s.cite}  ${s.url}  (${s.checked ? 'opened and read' : 'NOT opened: verify'})`);
  }
  L.push('');
  L.push('ASSUMPTIONS (no source, engineering choice of this game): ' + Object.entries(D).filter(([, d]) => d.basis === 'assumption').map(([k, d]) => `${k} = ${d.value} ${d.unit}`).join('; '));
  return L.join('\n');
}
