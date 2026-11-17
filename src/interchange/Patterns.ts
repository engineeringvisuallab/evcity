// INTERCHANGE FOUNDATION: the PATTERN TABLE. A pattern is a short list of ramp ROLES and the approaches (0..3) they are drawn for.
// Every role is drawn ONCE in a canonical frame and turned by k * 90 degrees for the other approaches, so a new interchange pattern is usually a new table row,
// not new geometry. The game drives on the left; the roles below are for that.
//
// CANONICAL FRAME of one approach: the car comes along +u on road `a` (its kerb lane is at v = a.kerbLane), the other road `b` crosses it at u = 0 along v.
//   slip       exit BEFORE the crossing, bend left over 90 degrees (two 45 degree arcs + a straight) and join the other road (b) going away: the LEFT turn.
//   loop       exit AFTER the crossing, bend left over 270 degrees (a circle) and join the other road coming back towards the crossing: the RIGHT turn.
//   diamondOff exit far before the crossing, run beside the road, end at an at-grade terminal on the other road (b).
//   diamondOn  the mirror of diamondOff, driven in the other direction: from the terminal back on to road a after the crossing.

import { DEG, Turtle, bezier, mirrorU, resample, reversed, type P2 } from './Geometry2D';
import type { InterchangeParams, RampRole, RoadSection, RoadSide } from './InterchangeTypes';

export interface CanonCtx {
  /** The road the car comes on, and the road that crosses it. */
  a: RoadSection;
  b: RoadSection;
  P: InterchangeParams;
}

export interface CanonEnd {
  kind: 'gore' | 'merge' | 'terminal';
  /** 'a' = the road the car comes on, 'b' = the crossing road. */
  road: 'a' | 'b';
  u: number;
  v: number;
}

export interface CanonRamp {
  role: RampRole;
  pts: P2[];
  from: CanonEnd;
  to: CanonEnd;
  designKmh: number;
}

type Builder = (c: CanonCtx) => CanonRamp;

const last = (p: P2[]): P2 => p[p.length - 1];

const slip: Builder = ({ a, b, P }) => {
  const S = P.slipSize;
  const Rs = Math.min(P.slipR, S);
  const d = (S - Rs) / Math.SQRT1_2; // dx = dy = Rs + d * cos45
  const start = { u: -(b.kerbLane + S), v: a.kerbLane };
  const t = new Turtle(start.u, start.v, 0).arc(Rs, 45 * DEG).straight(d).arc(Rs, 45 * DEG);
  const pts = resample(t.pts, P.step);
  return {
    role: 'slip',
    pts,
    from: { kind: 'gore', road: 'a', ...start },
    to: { kind: 'merge', road: 'b', u: last(pts).u, v: last(pts).v },
    designKmh: P.designKmh.slip,
  };
};

const loop: Builder = ({ a, b, P }) => {
  const R = P.loopR;
  const start = { u: b.kerbLane + R, v: a.kerbLane };
  const t = new Turtle(start.u, start.v, 0).arc(R, 270 * DEG);
  const pts = resample(t.pts, P.step);
  return {
    role: 'loop',
    pts,
    from: { kind: 'gore', road: 'a', ...start },
    to: { kind: 'merge', road: 'b', u: last(pts).u, v: last(pts).v },
    designKmh: P.designKmh.loop,
  };
};

const diamondOffPts = ({ a, b, P }: CanonCtx): P2[] => {
  const p0 = { u: -P.diamondNose, v: a.kerbLane };
  const p1 = { u: -b.halfWidth, v: P.diamondTerminalV };
  const du = p1.u - p0.u;
  return resample(bezier(p0, 0, p1, 0, du * 0.42, du * 0.42, 80), P.step);
};

const diamondOff: Builder = (c) => {
  const pts = diamondOffPts(c);
  return {
    role: 'diamondOff',
    pts,
    from: { kind: 'gore', road: 'a', ...pts[0] },
    to: { kind: 'terminal', road: 'b', u: last(pts).u, v: last(pts).v },
    designKmh: c.P.designKmh.diamond,
  };
};

const diamondOn: Builder = (c) => {
  const pts = reversed(mirrorU(diamondOffPts(c)));
  return {
    role: 'diamondOn',
    pts,
    from: { kind: 'terminal', road: 'b', ...pts[0] },
    to: { kind: 'merge', road: 'a', u: last(pts).u, v: last(pts).v },
    designKmh: c.P.designKmh.diamond,
  };
};

export const ROLE_BUILDERS: Readonly<Record<string, Builder>> = { slip, loop, diamondOff, diamondOn };

/** A ramp already drawn in the INTERCHANGE frame (u along main, v along cross): for custom patterns that do not fit the role table. */
export interface LocalRamp {
  id: string;
  role: RampRole;
  pts: P2[];
  from: { kind: 'gore' | 'merge' | 'terminal'; road: RoadSide };
  to: { kind: 'gore' | 'merge' | 'terminal'; road: RoadSide };
  designKmh: number;
  approach: 0 | 1 | 2 | 3;
}

export interface PatternDef {
  id: string;
  label: string;
  /** Roles drawn for each approach in `approaches` (0 main forward, 1 cross forward, 2 main backward, 3 cross backward). */
  approaches: ReadonlyArray<0 | 1 | 2 | 3>;
  roles: ReadonlyArray<'slip' | 'loop' | 'diamondOff' | 'diamondOn'>;
  /** Optional: a pattern that draws its own ramps in the interchange frame (then approaches / roles are ignored). */
  custom?: (main: RoadSection, cross: RoadSection, P: InterchangeParams) => LocalRamp[];
  /** Short text for the UI / docs. */
  note: string;
}

const REGISTRY = new Map<string, PatternDef>();

export function registerPattern(def: PatternDef): void {
  REGISTRY.set(def.id, def);
}

export function getPattern(id: string): PatternDef | undefined {
  return REGISTRY.get(id);
}

export function patternIds(): string[] {
  return [...REGISTRY.keys()];
}

registerPattern({
  id: 'diamond',
  label: 'Diamond',
  approaches: [0, 2],
  roles: ['diamondOff', 'diamondOn'],
  note: '4 ramps beside the main road; the cross road stays at grade under / over it and meets the ramps at 2 x 2 terminals (junction pads). Smallest, cheapest.',
});

registerPattern({
  id: 'cloverleaf',
  label: 'Cloverleaf',
  approaches: [0, 1, 2, 3],
  roles: ['slip', 'loop'],
  note: '8 ramps: 4 slips (left turns) + 4 loops (right turns); no traffic light, no at-grade crossing. Biggest footprint; the loops are the infield gardens / ponds.',
});

registerPattern({
  id: 'parclo',
  label: 'Partial cloverleaf',
  approaches: [0, 2],
  roles: ['slip', 'loop'],
  note: '4 ramps (2 slips + 2 loops in opposite quadrants), the other two quadrants stay free (river, hill, building): the same shapes as the cloverleaf, half of them.',
});
