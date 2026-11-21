// ROAD SIGN OVERBRIDGE (HANDOFF_ROAD_DESIGN.md section 23, STEP 4-1): the DESIGN NUMBERS of a walkable steel footbridge with a sign board on each of its two sides, for the 8-lane and 6-lane roads.
// Pure numbers and plain functions (no three.js, no canvas), so scripts/road-sign-bridge-design.ts (the design sheet) and the later 3D layer read the same numbers.
// These are FIRST-ORDER HAND CHECKS (simply supported span, equal load share of the piers): they size the parts the game draws, they are NOT a certified structural design.
//
// Local frame (the same as the gantry in RoadSignSpec.ts): origin on the road CENTRELINE at the road SURFACE height, +X = the driver's right (growing s), +Z = towards the driver who comes along growing s,
// +Y up. The bridge runs ACROSS the road along X; board A hangs on the +Z side of the bridge (face looks +Z), board B on the -Z side (face looks -Z).
//
// Structure (a 2-span continuous steel through-truss on 3 hammerhead piers, stair towers at both ends):
//   - outer piers at x = -edge and +edge (edge = halfWidth + shoulder + postGap, same as the gantry), ONE pier in the median at x = 0 (the median is 6 m on M8, 4 m on R6): two equal spans of L = edge;
//   - two Warren trusses (chords = round steel pipes, CHS) 2.8 m apart; the truss is as high as the board (2.5 m) and the board is fixed on the OUTSIDE of each truss, so the board IS the solid parapet;
//   - floor = steel plate deck on floor beams, 0.7 m deep, under the walking surface; clear walkway width 2.5 m;
//   - stair towers at the two ends: switchback stairs, flights of at most 12 risers, a landing at every turn; no ramp (a lift / ramp is a later option, noted in the handoff).
import { BOARD_H } from './RoadSignSpec';

/** All numbers in metres, kN, kPa, MPa unless the name says otherwise. ASSUMED = my engineering choice (the user may change one number here). */
export const BR = {
  /** Underside of the floor system above the road surface at the centreline: 5.5 m (usual minimum over a motorway) + 0.2 m for later resurfacing. */
  clearance: 5.7,
  /** Floor system (plate + floor beams) under the walking surface. */
  floorDepth: 0.7,
  /** Clear walking width between the two trusses (2.0 m is the usual minimum, 2.5 m for crowds). */
  walkW: 2.5,
  /** Width of a truss member / the truss plane. */
  memberW: 0.3,
  /** Truss height = board height (the board covers the whole truss side). */
  trussH: BOARD_H,
  /** Distance between the two truss planes (centre to centre). */
  trussGap: 2.5 + 0.3,
  bearingH: 0.15,
  /** Hammerhead pier: column (X x Z), cap (X x Z, depth), pile cap (X x Z, depth), 4 bored piles. */
  colX: 1.0,
  colZ: 1.6,
  capX: 1.4,
  capZ: 3.6,
  capDepth: 0.9,
  pileCapX: 2.6,
  pileCapZ: 7.4,
  pileCapH: 1.2,
  pileD: 0.8,
  pileX: 0.9,
  pileZ: 3.0,
  /** Concrete safety barrier in front of every pier: width, height, and the clear gap kept beside it. */
  barrierW: 0.6,
  barrierH: 0.81,
  barrierGap: 0.3,
  /** Stairs: riser limits, going (tread), flight width, gap between the two columns of a switchback, most risers per flight, landing length, stringer + slab thickness, least headroom. */
  riserMax: 0.15,
  riserMin: 0.1,
  going: 0.3,
  stairW: 2.0,
  stairGap: 0.2,
  flightMax: 12,
  landing: 2.2,
  stairSlab: 0.3,
  headroomMin: 2.2,
  /** Ground at a stair foot relative to the road surface: allowed window (deeper than -3 m the tower has more than 6 flights, higher than +3 m the bridge is nearly at ground level). */
  feetMin: -3,
  feetMax: 3,
  /** Loads. */
  /** Floor system dead load (kPa): steel plate + floor beams + wearing surface. ASSUMED. */
  deckLoad: 3.0,
  /** Largest share of the design strength a member may use (5 % reserve). */
  util: 0.95,
  boardLoad: 0.35,
  liveLoad: 5.0,
  /** Basic wind speed (m/s): 260 km/h = the highest zone of the Bangladesh building code (coast, cyclone). ASSUMED. Cf of a solid board face. */
  windSpeed: 72,
  windCf: 1.4,
  /** Materials. */
  E: 2.1e8, // kN/m2 (steel)
  fy: 355, // MPa (S355)
  gammaM: 1.1,
  steelUnit: 78.5, // kN/m3
  concreteUnit: 25,
  /** Walking-resonance limit for the first vertical frequency (Hz) and the live-load deflection limit L / x. */
  fMin: 3.0,
  deflLimit: 500,
} as const;

export interface Chs {
  D: number;
  t: number;
}
/** Round steel pipe sizes for the chords (outer diameter, wall), smallest first. */
export const CHS_TABLE: ReadonlyArray<Chs> = [
  { D: 0.1683, t: 0.008 },
  { D: 0.2191, t: 0.01 },
  { D: 0.2731, t: 0.0125 },
  { D: 0.3239, t: 0.0125 },
  { D: 0.3556, t: 0.016 },
  { D: 0.4064, t: 0.016 },
];
export const chsArea = (c: Chs): number => (Math.PI / 4) * (c.D * c.D - (c.D - 2 * c.t) * (c.D - 2 * c.t));
export const chsRadius = (c: Chs): number => Math.sqrt(c.D * c.D + (c.D - 2 * c.t) * (c.D - 2 * c.t)) / 4;

export interface BridgeInput {
  lanes: number;
  halfWidth: number;
  medianHalf: number;
  shoulder: number;
  postGap: number;
  /** Ground at the two stair feet relative to the road surface (left = -X, right = +X). */
  feetL: number;
  feetR: number;
}

export interface StairDesign {
  /** Height of the walking surface above the ground at the foot (m). */
  rise: number;
  risers: number;
  riser: number;
  /** Risers of every flight, from the ground up. */
  flights: number[];
  /** Plan of the tower: across (along the road X direction away from the pier) and along the road (Z). */
  towerW: number;
  towerL: number;
  /** Least clear height under a flight above another (m), 99 when there is none. */
  headroom: number;
}

export interface Check {
  id: string;
  ok: boolean;
  text: string;
}

export interface BridgeDesign {
  input: BridgeInput;
  edge: number;
  span: number;
  panels: number;
  panel: number;
  deckTop: number;
  boardTop: number;
  hc: number;
  chord: Chs;
  /** Characteristic dead load g and live load q per metre of bridge (kN/m). */
  g: number;
  q: number;
  /** Chord force / stress numbers (kN, MPa). */
  nTension: number;
  nCompress: number;
  stressTension: number;
  stressCompress: number;
  allowTension: number;
  allowCompress: number;
  slenderness: number;
  /** Serviceability. */
  freq: number;
  deflection: number;
  /** Wind: pressure (kPa), force per metre on the whole bridge (kN/m), total (kN), moment at the pile cap per pier (kNm). */
  windQ: number;
  windPerM: number;
  windTotal: number;
  windMomentPier: number;
  /** Pier loads: vertical load at the median pier (kN) with the footing, pile forces for the wind case (kN, + = compression). */
  pierN: number;
  pileMax: number;
  pileMin: number;
  /** Column stress under the wind case (MPa). */
  colStress: number;
  /** Dead weight of the whole span structure (t). */
  deadWeight: number;
  stairL: StairDesign;
  stairR: StairDesign;
  checks: Check[];
}

/** Switchback stairs from the ground (rise m below the walking surface) to the deck. */
export function stairDesign(rise: number): StairDesign {
  const risers = Math.max(1, Math.ceil(rise / BR.riserMax - 1e-9));
  const riser = rise / risers;
  const nFl = Math.ceil(risers / BR.flightMax);
  const base = Math.floor(risers / nFl);
  const extra = risers - base * nFl;
  const flights: number[] = [];
  for (let i = 0; i < nFl; i++) flights.push(base + (i < extra ? 1 : 0));
  const run = (Math.max(...flights) - 1) * BR.going;
  const towerW = nFl >= 2 ? 2 * BR.stairW + BR.stairGap : BR.stairW;
  const towerL = run + BR.landing;
  // two flights above each other in plan (flight i and i + 2): the gap is the rise of the two flights between them
  let headroom = 99;
  for (let i = 0; i + 2 < nFl; i++) headroom = Math.min(headroom, (flights[i] + flights[i + 1]) * riser - BR.stairSlab);
  return { rise, risers, riser, flights, towerW, towerL, headroom };
}

/** Height of the walking surface above the road surface. */
export const deckTop = (): number => BR.clearance + BR.floorDepth;

export function bridgeDesign(inp: BridgeInput): BridgeDesign {
  const edge = inp.halfWidth + inp.shoulder + inp.postGap;
  const span = edge;
  const panels = Math.max(4, Math.round(span / BR.trussH));
  const panel = span / panels;
  const dTop = deckTop();
  const boardTop = dTop + BR.trussH;
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, text: string): void => {
    checks.push({ id, ok, text });
  };

  // ---- loads per metre of bridge (both trusses together)
  const L = span;
  const hcOf = (c: Chs): number => BR.trussH - c.D;
  // pick the lightest chord that passes strength, buckling, frequency and deflection
  let chosen: Chs = CHS_TABLE[CHS_TABLE.length - 1];
  let pick: Partial<BridgeDesign> = {};
  for (const c of CHS_TABLE) {
    const A = chsArea(c);
    const hc = hcOf(c);
    const web = 0.5; // diagonals + verticals = 50 % of the chord steel
    const trussSteel = 4 * A * BR.steelUnit * (1 + web);
    const g = BR.deckLoad * BR.trussGap + trussSteel + 2 * BOARD_H * BR.boardLoad;
    const q = BR.liveLoad * BR.walkW;
    // wind
    const windQ = (0.613 * BR.windSpeed * BR.windSpeed) / 1000;
    const hExp = BR.floorDepth + BR.trussH;
    const wh = windQ * BR.windCf * hExp;
    const lever = hExp / 2 - (BR.floorDepth - 0.35); // wind centroid above the bottom-chord plane
    const dW = (wh * Math.max(0, lever)) / BR.trussGap; // extra vertical load per metre on the leeward truss
    const Mv = (w: number): number => (w * L * L) / 8;
    // ULS 1: 1.35 G + 1.5 Q + 0.9 W ; ULS 2: 1.35 G + 1.5 W + 1.05 Q
    const v1 = 1.35 * g + 1.5 * q;
    const v2 = 1.35 * g + 1.05 * q;
    const nV1 = Mv(v1 / 2 + 0.9 * dW) / hc; // per truss chord force
    const nV2 = Mv(v2 / 2 + 1.5 * dW) / hc;
    const nH1 = (0.9 * Mv(wh)) / BR.trussGap;
    const nH2 = (1.5 * Mv(wh)) / BR.trussGap;
    const nTension = Math.max(nV1 + nH1, nV2 + nH2);
    const nCompress = Math.max(nV1, nV2);
    const fyd = BR.fy / BR.gammaM;
    const i = chsRadius(c);
    const lam = panel / i;
    const lam1 = Math.PI * Math.sqrt((BR.E / 1000) / BR.fy);
    const lb = lam / lam1;
    const phi = 0.5 * (1 + 0.21 * (lb - 0.2) + lb * lb);
    const chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lb * lb))));
    const sT = nTension / A / 1000;
    const sC = nCompress / A / 1000;
    const I = 0.8 * A * hc * hc;
    const mkg = ((g * 1000) / 9.81);
    const freq = (Math.PI / (2 * L * L)) * Math.sqrt((BR.E * I * 1000) / mkg);
    const defl = (5 * q * Math.pow(L, 4)) / (384 * BR.E * I);
    const ok = sT <= BR.util * fyd && sC <= BR.util * chi * fyd && freq >= BR.fMin && defl <= L / BR.deflLimit;
    if (ok || c === CHS_TABLE[CHS_TABLE.length - 1]) {
      chosen = c;
      pick = {
        g, q, nTension, nCompress, stressTension: sT, stressCompress: sC, allowTension: fyd, allowCompress: chi * fyd,
        slenderness: lam, freq, deflection: defl, windQ, windPerM: wh, windTotal: wh * 2 * L, hc,
      };
      break;
    }
  }
  const P = pick as Required<Pick<BridgeDesign, 'g' | 'q' | 'nTension' | 'nCompress' | 'stressTension' | 'stressCompress' | 'allowTension' | 'allowCompress' | 'slenderness' | 'freq' | 'deflection' | 'windQ' | 'windPerM' | 'windTotal' | 'hc'>>;

  // ---- piers (median pier carries the most: R = 1.25 w L for two equal spans)
  const colH = BR.clearance - BR.bearingH - BR.capDepth + 0.3;
  const wCol = BR.colX * BR.colZ * colH * BR.concreteUnit;
  const wCap = BR.capX * BR.capZ * BR.capDepth * BR.concreteUnit;
  const wPc = BR.pileCapX * BR.pileCapZ * BR.pileCapH * BR.concreteUnit;
  const nDeadMid = 1.25 * P.g * L + wCol + wCap + wPc;
  const leverW = BR.clearance + (BR.floorDepth + BR.trussH) / 2 + 0.3;
  const mPier = (P.windTotal / 3) * leverW;
  const sz2 = 4 * BR.pileZ * BR.pileZ;
  const nStab = 0.9 * nDeadMid;
  const pileMax = nDeadMid / 4 + (mPier * BR.pileZ) / sz2;
  const pileMin = nStab / 4 - (mPier * BR.pileZ) / sz2;
  const colW = (BR.colX * BR.colZ * BR.colZ) / 6;
  const colStress = (nStab - wPc) / (BR.colX * BR.colZ) / 1000 + mPier / colW / 1000;

  const stairL = stairDesign(dTop - inp.feetL);
  const stairR = stairDesign(dTop - inp.feetR);
  const deadWeight = (P.g * 2 * L) / 9.81;

  // ---- checks
  add('C1 clearance', BR.clearance >= 5.5 + 0.2 - 1e-9, `under the floor ${BR.clearance} m (needs 5.5 m + 0.2 m resurfacing)`);
  add('C2 walkway', BR.walkW >= 2.0, `clear width ${BR.walkW} m (needs >= 2.0 m)`);
  add('C3 parapet', BR.trussH >= 1.5, `parapet / truss side ${BR.trussH} m high (needs >= 1.5 m)`);
  const medW = 2 * inp.medianHalf;
  const medNeed = BR.colX + 2 * (BR.barrierW + BR.barrierGap);
  add('C4 median pier fits', medW >= medNeed && medW >= BR.pileCapX + 0.4, `median ${medW} m, needs column ${BR.colX} + 2 x (barrier ${BR.barrierW} + gap ${BR.barrierGap}) = ${medNeed.toFixed(1)} m; pile cap ${BR.pileCapX} m`);
  const faceGap = inp.shoulder + inp.postGap - BR.colX / 2;
  add('C5 outer pier offset', faceGap >= BR.barrierW + BR.barrierGap, `pier face ${faceGap.toFixed(1)} m from the kerb (needs barrier ${BR.barrierW} + ${BR.barrierGap} m)`);
  add('C6 span / depth', L / BR.trussH >= 4 && L / BR.trussH <= 14, `span ${L.toFixed(1)} m / truss ${BR.trussH} m = ${(L / BR.trussH).toFixed(1)} (4..14; below 6 the truss is deeper than needed, the board height sets it)`);
  add('C7 chord tension', P.stressTension <= BR.util * P.allowTension, `CHS ${(chosen.D * 1000).toFixed(1)} x ${(chosen.t * 1000).toFixed(1)}: ${P.stressTension.toFixed(0)} MPa <= ${(BR.util * P.allowTension).toFixed(0)} MPa = 95 % of ${P.allowTension.toFixed(0)} (ULS incl. wind, bottom chord)`);
  add('C8 chord buckling', P.stressCompress <= BR.util * P.allowCompress, `top chord ${P.stressCompress.toFixed(0)} MPa <= ${(BR.util * P.allowCompress).toFixed(0)} MPa = 95 % of ${P.allowCompress.toFixed(0)} (slenderness ${P.slenderness.toFixed(0)}, panel ${panel.toFixed(2)} m)`);
  add('C9 walking frequency', P.freq >= BR.fMin, `first vertical frequency ${P.freq.toFixed(1)} Hz >= ${BR.fMin} Hz (simply supported span, safe side)`);
  add('C10 deflection', P.deflection <= L / BR.deflLimit, `live-load deflection ${(P.deflection * 1000).toFixed(1)} mm <= L/${BR.deflLimit} = ${((L / BR.deflLimit) * 1000).toFixed(0)} mm`);
  add('C11 pile uplift', pileMin > 0, `wind case: pile force ${pileMin.toFixed(0)} .. ${pileMax.toFixed(0)} kN (all in compression, 4 piles D ${BR.pileD} m at +-${BR.pileZ} m)`);
  add('C12 column stress', colStress <= 18, `column ${colStress.toFixed(1)} MPa <= 18 MPa (0.45 x C40, compression side)`);
  for (const [n, s] of [['left', stairL], ['right', stairR]] as const) {
    add(`C13 stair ${n} riser`, s.riser <= BR.riserMax + 1e-9 && s.riser >= BR.riserMin, `riser ${(s.riser * 1000).toFixed(0)} mm, going ${BR.going * 1000} mm, 2R+G = ${((2 * s.riser + BR.going) * 1000).toFixed(0)} mm (550..700)`);
    add(`C14 stair ${n} flights`, Math.max(...s.flights) <= BR.flightMax, `rise ${s.rise.toFixed(2)} m = ${s.risers} risers in ${s.flights.length} flights (${s.flights.join(' + ')}), tower ${s.towerW.toFixed(1)} x ${s.towerL.toFixed(1)} m`);
    add(`C15 stair ${n} headroom`, s.headroom >= BR.headroomMin, s.headroom >= 99 ? 'no flight above another' : `headroom under the upper flight ${s.headroom.toFixed(2)} m >= ${BR.headroomMin} m`);
    add(`C16 stair ${n} feet window`, (n === 'left' ? inp.feetL : inp.feetR) >= BR.feetMin && (n === 'left' ? inp.feetL : inp.feetR) <= BR.feetMax, `ground at the foot ${(n === 'left' ? inp.feetL : inp.feetR).toFixed(2)} m from the road surface (window ${BR.feetMin}..${BR.feetMax} m)`);
  }
  return {
    input: inp, edge, span, panels, panel, deckTop: dTop, boardTop, hc: P.hc, chord: chosen, g: P.g, q: P.q,
    nTension: P.nTension, nCompress: P.nCompress, stressTension: P.stressTension, stressCompress: P.stressCompress, allowTension: P.allowTension, allowCompress: P.allowCompress,
    slenderness: P.slenderness, freq: P.freq, deflection: P.deflection, windQ: P.windQ, windPerM: P.windPerM, windTotal: P.windTotal, windMomentPier: mPier,
    pierN: nDeadMid, pileMax, pileMin, colStress, deadWeight, stairL, stairR, checks,
  };
}
