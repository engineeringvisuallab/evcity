// INTERCHANGE FOUNDATION: the shared data types and the one table of numbers. No game imports (only plain data), so it is safe to import from anywhere.
//
// An interchange is DATA: an InterchangeSpec (where, which two roads, which pattern, a few numbers) goes into buildInterchange() and an InterchangeModel
// comes out (ramps, levels, links for the AI, instanced parts, decoration zones, validation issues). The renderer / road network / traffic code only READ the model,
// so a new pattern never needs a new renderer.

import type { P2 } from './Geometry2D';

/** The two roads of an interchange: `main` runs along local u, `cross` along local v (90 degrees to main; the real junction code straightens arms to that anyway). */
export type RoadSide = 'main' | 'cross';

/** The cross-section numbers of one of the two roads (metres from the centreline; all of them are in RoadSpec / roads/RoadSection.ts). */
export interface RoadSection {
  /** RoadSpec.id of the road in the road network (-1 = not known yet; the model still builds). */
  roadId: number;
  /** Centreline -> kerb face (RoadSpec.halfWidth: asphalt + median). */
  halfWidth: number;
  /** Centreline -> centre of the kerb lane (the lane the traffic drives in on the left). */
  kerbLane: number;
  laneW: number;
  lanesPerDir: number;
  designKmh: number;
}

export interface InterchangeParams {
  /** Clear height (m) between the lower road and the underside of the upper deck. */
  clearance: number;
  /** Thickness (m) of the deck + wearing surface. The upper road is raised by clearance + deckThickness. */
  deckThickness: number;
  /** The upper road climbs / descends with at most this grade (rise / run). */
  upperMaxGrade: number;
  /** Flat length (m) of the upper road each side of the centre, on top of the half width of the lower road. */
  upperFlat: number;
  /** Ramps change height with at most this grade (rise / run). */
  rampMaxGrade: number;
  /** One-way ramp: half width of the asphalt (m) (a single lane + shy strips). */
  rampHalfWidth: number;
  /** Loop ramp radius (m). */
  loopR: number;
  /** Slip (direct) ramp: bend radius and the size (m) of its footprint along each road (S in docs). */
  slipR: number;
  slipSize: number;
  /** Diamond ramp: the nose (gore) is this far (m) before / after the crossing, and the terminal on the lower road is this far (m) from the main road centreline. */
  diamondNose: number;
  diamondTerminalV: number;
  /** Centreline spacing (m) of the finished ramp points (the same as a highway: 8). */
  step: number;
  /** Design speed (km/h) per ramp role; used for the minimum radius check and as the AI speed hint. */
  designKmh: { loop: number; slip: number; diamond: number };
  /** Two ramps (not near their own join) must stay at least this far (m) apart centreline to centreline. */
  minGap: number;
  /** Above this height (m) over the ground a ramp stands on piers; below it, on an embankment. */
  pierFromH: number;
  /** Decoration of the loop infields: 'none' | 'garden' | 'pond' | 'mixed' (alternating). */
  decor: 'none' | 'garden' | 'pond' | 'mixed';
}

export const INTERCHANGE_DEFAULTS: Readonly<InterchangeParams> = {
  clearance: 5.5,
  deckThickness: 1.4,
  upperMaxGrade: 0.04,
  upperFlat: 18,
  rampMaxGrade: 0.05,
  rampHalfWidth: 4.2,
  loopR: 48,
  slipR: 110,
  slipSize: 250,
  diamondNose: 240,
  diamondTerminalV: 75,
  step: 8,
  designKmh: { loop: 35, slip: 50, diamond: 50 },
  minGap: 14,
  pierFromH: 3,
  decor: 'mixed',
};

export type RampRole = 'slip' | 'loop' | 'diamondOff' | 'diamondOn' | 'link';

/** Where a ramp touches a road. */
export interface Join {
  /** gore = the ramp leaves the road (nose); merge = it joins the road; terminal = it meets the lower road at grade (a junction pad is needed). */
  kind: 'gore' | 'merge' | 'terminal';
  road: RoadSide;
  /** Local position of the join and its world position. */
  u: number;
  v: number;
  x: number;
  z: number;
  /** Signed distance along that road from the centre of the interchange (u for main, v for cross): the wiring step turns it into `s` of the road. */
  t: number;
}

export interface Ramp {
  /** Stable id inside the interchange, e.g. "mf-slip", "xb-loop". */
  id: string;
  role: RampRole;
  /** Approach 0..3: main forward, cross forward, main backward, cross backward (the road the ramp leaves, or the one it serves). */
  approach: 0 | 1 | 2 | 3;
  oneWay: true;
  /** Centreline, local frame and world frame (same index), from the start to the end of the travel direction. */
  local: P2[];
  xs: number[];
  zs: number[];
  /** Finished surface height (m) at every point. */
  ys: number[];
  /** Distance (m) along the ramp at every point; `length` = the total. */
  cum: number[];
  length: number;
  halfWidth: number;
  designKmh: number;
  from: Join;
  to: Join;
  /** Point ranges (inclusive) that are higher than `pierFromH` over the ground: the renderer builds piers / a bridge deck there. */
  elevated: { i0: number; i1: number }[];
}

/** The height of the two roads: the upper one climbs over the lower one, the lower one stays at the ground height `y0`. */
export interface LevelPlan {
  y0: number;
  upper: RoadSide;
  /** Rise (m) of the upper road at the crossing = clearance + deckThickness. */
  rise: number;
  /** The upper road is at full height for |t| <= flat, and falls back to y0 at |t| = flat + rampLen. */
  flat: number;
  rampLen: number;
  /** The upper road is higher than `pierFromH` over the ground for |t| <= elevatedT: that stretch is a bridge on piers (the rest is an embankment). */
  elevatedT: number;
}

export interface Link {
  kind: 'diverge' | 'merge' | 'terminal';
  ramp: string;
  /** The road the ramp touches, with the position on it (t as in Join). For a link between two ramps `ramp2` is set (not used by the built-in patterns). */
  road: RoadSide;
  t: number;
  x: number;
  z: number;
  /** Which side of the road the ramp is on, seen in the travel direction of the ramp (the game drives on the left): always 'left' for the built-in patterns. */
  side: 'left' | 'right';
  /** Suggested length (m) of the taper (gore) where the ramp separates from / joins the road. */
  taperLen: number;
}

/** Decoration / exclusion zone inside the interchange (a circle in the local frame). */
export interface Zone {
  kind: 'garden' | 'pond' | 'plain';
  u: number;
  v: number;
  x: number;
  z: number;
  radius: number;
}

export interface PartBatch {
  /** pier | lamp | railPost: one geometry each, drawn as ONE InstancedMesh for all interchanges. */
  kind: 'pier' | 'lamp' | 'railPost';
  /** x, y (top of the ground / base), z, yaw (rad), size (m: pier height / lamp height) per instance. */
  data: Float32Array;
  stride: 5;
}

/** One structure type placed many times: ONE InstancedMesh per def for all interchanges. stride 6: x, y (base), z, yaw (rad, world), scale (m, meaning depends on the def), variant (0..1 random, for colour / shape choice). */
export interface StructureBatch {
  def: string;
  data: Float32Array;
  stride: 6;
}

/** A retaining wall along one edge of a ramp: the renderer extrudes it along ramp points i0..i1 (a thin ribbon, no instances). */
export interface WallRun {
  ramp: string;
  side: 'left' | 'right';
  i0: number;
  i1: number;
  /** Highest wall (m) in the run. */
  maxH: number;
}

export interface Issue {
  level: 'error' | 'warn';
  code: string;
  message: string;
}

export interface InterchangeSpec {
  id: string;
  /** Pattern id from the registry: 'diamond', 'cloverleaf', 'parclo' ... or your own (registerPattern). */
  pattern: string;
  /** Centre in world metres and the ground height of the crossing. */
  x: number;
  z: number;
  y: number;
  /** World heading (rad, atan2(dz, dx)) of the main road at the centre, in its travel direction (u). */
  yaw: number;
  main: RoadSection;
  cross: RoadSection;
  /** Which road is the bridge (default: main). */
  upper?: RoadSide;
  params?: Partial<InterchangeParams>;
  /** Which structures dress the interchange: a preset ('plain' = none (default), 'garden', 'grand') or a list of structure ids (Structures.ts). */
  dressing?: 'plain' | 'garden' | 'grand' | readonly string[];
}

export interface InterchangeModel {
  spec: InterchangeSpec;
  params: InterchangeParams;
  levels: LevelPlan;
  ramps: Ramp[];
  links: Link[];
  zones: Zone[];
  parts: PartBatch[];
  /** Ornamental structures (arches, pavilions, fountains, palms, billboards ...) and retaining walls; empty with dressing 'plain'. */
  structures: StructureBatch[];
  walls: WallRun[];
  /** What the dressing costs: instance count and a rough triangle count of ONE draw of every def (instances share geometry). */
  budget: { instances: number; trisHint: number };
  /** Everything of the interchange lies inside this circle (centre = the interchange centre): the chunk / LOD / culling radius. */
  footprintR: number;
  issues: Issue[];
  /** Height (m) of road `side` at signed distance t from the centre (the level plan). */
  yOf(side: RoadSide, t: number): number;
  /** Local -> world. */
  toWorld(u: number, v: number): { x: number; z: number };
}
