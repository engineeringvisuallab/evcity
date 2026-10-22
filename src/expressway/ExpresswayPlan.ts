/**
 * ELEVATED CARGO EXPRESSWAY - MASTER PLAN (data only).
 *
 * One 8-lane (4 + 4) elevated expressway for freight, planned for the WHOLE map:
 *   - the RING ("outer logistics ring", ~18 km, a 'C' open at the north-west where a mountain ridge blocks it; keeps clear of the army camp) runs between the middle ring road and the outer freeway and touches every
 *     logistics, industry, farm and utility district, so trucks from anywhere can reach it;
 *   - the PORT SPUR leaves the ring at junction 2 and ends at the seaport gate (interchange 1);
 *   - two DIAMETERS cross the city on viaduct: W-E (lower level) and N-SE (upper level, +9 m over the W-E deck at the centre).
 *     Both are elevated, so the streets and houses stay under them, and both join the ring with a Y-merge;
 *   - RAMPS (2 lanes, two-way, 5 % grade) come down from the deck onto the nearest ordinary road at every interchange;
 *   - interchange 12 is the AIRPORT LINK: the ramp ends on open ground inside the area kept free for the future airport west of the port.
 *
 * Units: metres, x east, z south, map centre 0,0. Waypoints are only HINTS for a smooth Catmull-Rom curve (the curve passes
 * through every point, so the interchange positions are exact).
 */

export const XP = {
  /** Deck half width (m): 4 lanes x 3.6 m + 1.5 m inner shoulder per side, 2 m median barrier, 2.6 m outer shoulder + barrier. */
  deckHalf: 20,
  lanePerSide: 4,
  laneW: 3.6,
  /** Inner edge of the first lane (m from the centre line): half the median barrier + inner shoulder. */
  laneStart: 2.5,
  medianHalf: 1.0,
  slabThick: 1.6,
  /** Ramp: half width (2 lanes + shoulders), maximum grade. */
  rampHalf: 5.6,
  rampGrade: 0.055,
  /** A ramp lands on an ordinary road at most this far (m, straight line) from where it leaves the deck, and is never longer than rampMaxLen. */
  rampReach: 650,
  rampMaxLen: 950,
  /** Minimum free height (m) between the ground (highest point across the deck width) and the underside of the deck... */
  clearance: 9,
  /** ... and the deck surface is never lower than this above sea level (m). */
  minDeckY: 8,
  /** Steepest grade of the main deck (rise / run): trucks stay in gear. */
  maxGrade: 0.04,
  /** Grade of the full-width descent at a dead end. */
  endGrade: 0.045,
  /** Distance between centre-line points (m) of the deck and of the ramps. */
  step: 10,
  rampStep: 8,
  /** Pier spacing (m) along the deck / ramp. */
  pierSpacing: 36,
  /** Extra height (m) the N-SE diameter gets over the W-E diameter at the city centre, and the length over which it climbs / falls. */
  centreLift: 9.5,
  liftFrom: 750,
  liftTo: 260,
  /** Length (m) over which the outer barrier is left open at a ramp (merge / diverge lane). */
  gapHalf: 95,
} as const;

export type XKind = 'ring' | 'spur' | 'diameter' | 'ramp';

export interface XRoutePlan {
  name: string;
  kind: 'ring' | 'spur' | 'diameter';
  closed: boolean;
  /** A dead end comes down to the ground (full width, `endGrade`) instead of stopping in the air. */
  descend?: 'start' | 'end' | 'both';
  pts: readonly (readonly [number, number])[];
}

/** The 12 ring interchanges (number, name, position on the ring). 1 is at the end of the port spur. */
export interface XInterchangePlan {
  n: number;
  id: string;
  x: number;
  z: number;
  /** Ramp target hint: the ramp comes down on the nearest ordinary road to this point (default: the interchange). */
  hint?: readonly [number, number];
  /** Which route the interchange sits on. */
  route: string;
  /** Ramp leaves on this side of the direction of travel (+1 left, -1 right); 0 = whichever side has the nearest road. */
  side?: -1 | 0 | 1;
  /** The ramp does not look for a road: it ends on open ground (future airport). */
  open?: boolean;
}

const J: readonly [number, number] = [1650, 2250];
const N3: readonly [number, number] = [2300, 600];
const N7: readonly [number, number] = [200, -3350];
const N9: readonly [number, number] = [-2550, -300];
const N8: readonly [number, number] = [-1500, -2640];

export const ROUTE_PLANS: readonly XRoutePlan[] = [
  {
    // The ring is a 'C': a mountain ridge closes the north-west (z -1950..-1050), so it starts at the NW town (8), runs north,
    // east, south and west and ends at the west farms (9). Both ends come down to the ground.
    name: 'XR',
    kind: 'ring',
    closed: false,
    descend: 'both',
    pts: [
      N8, [-1100, -2850], [-700, -3200], N7, [800, -3300], [1700, -2900], [2250, -1800], [2350, -600], N3, [2150, 1900], J, [500, 2300],
      [-550, 2250], [-2200, 2200], [-2650, 1200], N9,
    ],
  },
  { name: 'XP', kind: 'spur', closed: false, descend: 'end', pts: [J, [1750, 2550], [1900, 2790]] },
  // lower diameter: West farms -> city centre -> East logistics
  { name: 'XW', kind: 'diameter', closed: false, pts: [[-2640, 500], [-2420, 150], [-2000, -640], [-1000, -225], [0, 0], [550, -130], [1100, -120], [1700, -60], [2100, 250], N3] },
  // upper diameter: North logistics -> city centre -> port junction (SE)
  { name: 'XN', kind: 'diameter', closed: false, pts: [N7, [230, -3250], [330, -2800], [276, -1900], [206, -1000], [150, -650], [100, -350], [0, 0], [420, 420], [900, 900], [1150, 1500], [1450, 1950], J] },
];

export const INTERCHANGES: readonly XInterchangePlan[] = [
  { n: 1, id: 'port-gate', x: 1900, z: 2790, route: 'XP', hint: [1900, 2770] },
  { n: 2, id: 'port-junction', x: J[0], z: J[1], route: 'XR', hint: [1500, 2150] },
  { n: 3, id: 'east-logistics', x: N3[0], z: N3[1], route: 'XR', hint: [2350, 600] },
  { n: 4, id: 'east-works', x: 2350, z: -600, route: 'XR', hint: [2350, -600] },
  { n: 5, id: 'east-farms', x: 2250, z: -1800, route: 'XR', hint: [2200, -1800] },
  { n: 6, id: 'north-heavy', x: 800, z: -3300, route: 'XR', hint: [800, -3300] },
  { n: 7, id: 'north-logistics', x: N7[0], z: N7[1], route: 'XR', hint: [200, -3400] },
  { n: 8, id: 'nw-town', x: -1500, z: -2640, route: 'XR', hint: [-1500, -2640] },
  { n: 9, id: 'west-farms', x: N9[0], z: N9[1], route: 'XR', hint: [-2550, -300] },
  { n: 10, id: 'sw-farms', x: -2650, z: 1200, route: 'XR', hint: [-2700, 1200] },
  { n: 11, id: 'south-utility', x: -550, z: 2250, route: 'XR', hint: [-550, 2150] },
  { n: 12, id: 'airport-link', x: 500, z: 2300, route: 'XR', hint: [500, 2520], side: -1, open: true },
];

/** City freight ramps on the two diameters: where on the deck (point near `at`) and which part of the city they serve. */
export interface XCityRampPlan {
  id: string;
  route: string;
  at: readonly [number, number];
  hint: readonly [number, number];
}

export const CITY_RAMPS: readonly XCityRampPlan[] = [
  { id: 'city-truck-terminal', route: 'XN', at: [150, -650], hint: [0, -580] },
  { id: 'city-east', route: 'XW', at: [1100, -120], hint: [1000, -60] },
  { id: 'city-southeast', route: 'XN', at: [900, 900], hint: [1150, 1150] },
  { id: 'city-west', route: 'XW', at: [-1000, -225], hint: [-1550, 0] },
];
