// STEP 9.2-sizing: the FOUR M8 x M8 (8 lane x 8 lane) interchange designs, as DATA + calculation (pure, no three.js, no DOM).
// Each design lists its 8 turning ramps (the 4 through movements stay on the two motorways). Drive side LEFT (D1): a LEFT turn is the short easy movement
// (it leaves on the left and joins on the left), a RIGHT turn crosses the opposing traffic and needs a loop or a flyover.
// Numbers come only from CRITERIA / DESIGN / Checks (rule D2). Flows are ASSUMED design-hour pcu/h until step 6.4 gives real ones.
import { DESIGN } from '../../roads/standards/Criteria';
import { accelLength, checkRadius, decelLength, entryTaperLength, exitTaperLength, laneBalance, minRadius, spiralLength } from '../../roads/standards/Checks';

export type M8Kind = 'stack' | 'turbine' | 'cloverleafCD' | 'hybrid';
export type TurnKind = 'left' | 'right';
export type RampShape = 'slip' | 'loop' | 'flyover' | 'spiral';

export interface RampDesign {
  turn: TurnKind;
  shape: RampShape;
  /** Design speed (km/h) and radius (m) of the controlling curve. */
  V: number;
  R: number;
  /** Design-hour flow (pcu/h) of this movement. */
  flow: number;
  /** Level (1 = ground) the ramp runs on. */
  level: number;
  /** Takes its exit from a collector-distributor road (no weaving on the motorway). */
  viaCD?: boolean;
}

export interface M8Design {
  kind: M8Kind;
  name: string;
  /** Number of levels (1 = ground). */
  levels: number;
  why: string;
  /** Ramps of ONE quadrant (turned by 90 deg for the other quadrants). Hybrid lists both right-turn kinds: the flyover for the 2 heavy quadrants, the loop for the 2 light ones. */
  quadrant: RampDesign[];
  /** Through flow (pcu/h/direction) on each motorway. */
  through: number;
}

const LANE_CAP = { one: 1500, two: 2800 };
const MAIN_V = DESIGN.ringSpeed;
/** Deck + clearance per level (m), the same numbers as INTERCHANGE_DEFAULTS (5.5 + 1.4). */
export const LEVEL_RISE = 6.9;

export const M8_DESIGNS: readonly M8Design[] = [
  {
    kind: 'stack', name: 'Stack (4 level)', levels: 4, through: 3600,
    why: 'Highest demand: every movement direct, no loop, no weave. One road on level 1, ramps on levels 2 and 3, the other road on level 4.',
    quadrant: [
      { turn: 'left', shape: 'slip', V: 60, R: 175, flow: 1800, level: 2 },
      { turn: 'right', shape: 'flyover', V: 60, R: 175, flow: 1400, level: 3 },
    ],
  },
  {
    kind: 'turbine', name: 'Turbine (whirl)', levels: 3, through: 3200,
    why: 'High demand, less height than a stack: spiral directional ramps wind round the centre, 3 levels, no loop, no weave.',
    quadrant: [
      { turn: 'left', shape: 'slip', V: 60, R: 175, flow: 1500, level: 2 },
      { turn: 'right', shape: 'spiral', V: 70, R: 255, flow: 1200, level: 2 },
    ],
  },
  {
    kind: 'cloverleafCD', name: 'Full cloverleaf with collector-distributor roads', levels: 2, through: 3000,
    why: 'Medium demand, land free: only 2 levels (cheapest to build). The 4 loops are fed from collector-distributor roads so that no weave happens on the motorway.',
    quadrant: [
      { turn: 'left', shape: 'slip', V: 60, R: 175, flow: 1200, level: 1, viaCD: true },
      { turn: 'right', shape: 'loop', V: 45, R: 85, flow: 700, level: 1, viaCD: true },
    ],
  },
  {
    kind: 'hybrid', name: 'Hybrid (2 flyovers + 2 loops)', levels: 3, through: 3000,
    why: 'Unequal right-turn demand: the two heavy right turns get direct flyovers (level 2), the two light ones get loops. Cheaper than a stack, better than a full cloverleaf.',
    quadrant: [
      { turn: 'left', shape: 'slip', V: 60, R: 175, flow: 1400, level: 1 },
      { turn: 'right', shape: 'flyover', V: 70, R: 255, flow: 1300, level: 2 },
      { turn: 'right', shape: 'loop', V: 45, R: 85, flow: 600, level: 1 },
    ],
  },
];

export interface RampSheet {
  d: RampDesign;
  lanes: number;
  radiusOk: boolean;
  rminV: number;
  limit: number;
  spiral: number;
  decel: number;
  accel: number;
  exitTaper: number;
  entryTaper: number;
  /** Lanes needed on the motorway just before the exit (lane balance, rule 3.13 item 3), with 4 lanes continuing. */
  lanesBeforeExit: number;
}

export function lanesForFlow(flow: number, shape: RampShape): number {
  if (shape === 'loop') return 1; // a loop is always single lane
  return flow <= LANE_CAP.one ? 1 : 2;
}

export function sheet(d: RampDesign): RampSheet {
  const lanes = lanesForFlow(d.flow, d.shape);
  const rc = checkRadius(d.R, d.V);
  return {
    d, lanes, radiusOk: rc.pass, rminV: minRadius(d.V), limit: rc.limit,
    spiral: spiralLength(d.V, d.R),
    decel: decelLength(MAIN_V, d.V),
    accel: accelLength(MAIN_V, d.V),
    exitTaper: exitTaperLength(), entryTaper: entryTaperLength(),
    lanesBeforeExit: laneBalance(4, lanes),
  };
}

/** Road length (m) needed to climb `rise` metres at a given grade. */
export const climbLength = (rise: number, grade: number): number => rise / grade;

export interface DesignSummary {
  design: M8Design;
  ramps: RampSheet[];
  /** Height of the highest deck above the ground road (m) and the run needed for the UPPER MOTORWAY to climb to it (4 %). */
  topRise: number;
  upperRun: number;
  /** Run of a ramp that must climb to its level at the ramp grade limit (5 %). */
  rampRun: number;
  /** Length (m) of motorway taken by one exit + one entry: decel + taper before the crossing, accel after. */
  weaveFreeLength: number;
  /** Loop-to-loop weave length on the same road without C-D (what the cloverleaf would give), vs the 300 m desirable. */
  issues: string[];
}

export function summarise(design: M8Design): DesignSummary {
  const ramps = design.quadrant.map(sheet);
  const topRise = (design.levels - 1) * LEVEL_RISE;
  const issues: string[] = [];
  for (const r of ramps) if (!r.radiusOk) issues.push(`${r.d.turn} ramp: R ${r.d.R} < ${r.limit.toFixed(0)} m (1.5 x Rmin V${r.d.V})`);
  for (const r of ramps) if (r.lanes === 1 && r.d.flow > LANE_CAP.one) issues.push(`${r.d.turn} ramp: flow ${r.d.flow} on one lane`);
  const maxExit = Math.max(...ramps.map((r) => r.decel + r.exitTaper));
  const maxEntry = Math.max(...ramps.map((r) => r.accel + r.entryTaper));
  return {
    design, ramps, topRise,
    upperRun: climbLength(topRise, DESIGN.maxGrade.motorway),
    rampRun: climbLength((Math.max(...design.quadrant.map((q) => q.level)) - 1) * LEVEL_RISE, DESIGN.maxGrade.ramp),
    weaveFreeLength: maxExit + maxEntry,
    issues,
  };
}
