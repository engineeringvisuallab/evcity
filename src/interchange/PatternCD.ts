// REAL-WORLD CLOVERLEAF WITH COLLECTOR-DISTRIBUTOR (C-D) ROADS ("cloverleaf-cd").
// A plain cloverleaf puts the loop weaving on the main carriageway (115 m between a loop entrance and the next loop exit: far below AASHTO).
// The standard cure is a one-way C-D road beside each main carriageway: the mainline has ONE exit (parallel deceleration lane + taper) and ONE entrance
// (acceleration lane + taper) per direction; every slip / loop leaves or joins the C-D road, so the weaving happens on a low-speed single-lane road, not on the highway.
//
// Lengths come from Standards.ts (kinematic, nothing typed from a table): exit transition >= decelLength(V_main -> V_cd) and >= 15 x lateral shift,
// entrance transition >= accelLength(V_cd -> 0.85 V_main) and >= 20 x lateral shift.  The shift is smoothed (smoothstep) so the curvature stays gentle.
// The slips / loops are the ordinary ones, drawn from / to the C-D lane (v = vCD) instead of the main kerb lane.

import { rot90, resample, type P2 } from './Geometry2D';
import { ROLE_BUILDERS, registerPattern, type LocalRamp } from './Patterns';
import type { InterchangeParams, RoadSection } from './InterchangeTypes';
import { accelLength, decelLength } from './Standards';

export const CD_DEFAULTS = {
  /** Clear separation between the mainline outer edge and the C-D road edge (m): outer separation + barrier. */
  separation: 3,
  /** Design speed of the C-D road (km/h). */
  speedKmh: 50,
  /** Straight length on the C-D between the end of the exit transition and the first branch (m): signing / decision distance. */
  leadIn: 60,
  /** Straight length between the last merge and the start of the entrance transition (m). */
  leadOut: 60,
};

const APPROACH = ['mf', 'xf', 'mb', 'xb'] as const;
const sm = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export interface CdLayout {
  vCD: number;
  exitLen: number;
  entryLen: number;
  u0: number;
  u1: number;
}

export function cdLayout(main: RoadSection, cross: RoadSection, P: InterchangeParams): CdLayout {
  const vCD = main.halfWidth + CD_DEFAULTS.separation + P.rampHalfWidth;
  const shift = vCD - main.kerbLane;
  const ceil10 = (x: number): number => Math.ceil(x / 10) * 10;
  const exitLen = ceil10(Math.max(decelLength(main.designKmh, CD_DEFAULTS.speedKmh), 15 * shift));
  const entryLen = ceil10(Math.max(accelLength(main.designKmh, CD_DEFAULTS.speedKmh), 20 * shift));
  const first = cross.kerbLane + P.slipSize; // the slip gore sits this far before the crossing
  return { vCD, exitLen, entryLen, u0: -(first + CD_DEFAULTS.leadIn + exitLen), u1: first + CD_DEFAULTS.leadOut + entryLen };
}

function cdRoad(main: RoadSection, L: CdLayout, P: InterchangeParams): P2[] {
  const k = main.kerbLane;
  const shift = L.vCD - k;
  const pts: P2[] = [];
  for (let u = L.u0; u <= L.u1 + 1e-6; u += 2) {
    const a = sm((u - L.u0) / L.exitLen);
    const b = sm((L.u1 - u) / L.entryLen);
    pts.push({ u, v: k + shift * Math.min(a, b) });
  }
  return resample(pts, P.step);
}

registerPattern({
  id: 'cloverleaf-cd',
  label: 'Cloverleaf with C-D roads',
  approaches: [0, 1, 2, 3],
  roles: ['slip', 'loop'],
  note: 'Cloverleaf whose loops and slips attach to one-way collector-distributor roads beside the main carriageways: single exit / entrance on the highway, weaving off the mainline.',
  custom: (main: RoadSection, cross: RoadSection, P: InterchangeParams): LocalRamp[] => {
    const L = cdLayout(main, cross, P);
    const mainCD: RoadSection = { ...main, kerbLane: L.vCD, designKmh: CD_DEFAULTS.speedKmh };
    const out: LocalRamp[] = [];
    for (const k of [0, 1, 2, 3] as const) {
      const aSide = k % 2 === 0 ? 'main' : 'cross';
      const bSide = k % 2 === 0 ? 'cross' : 'main';
      const ctx = { a: aSide === 'main' ? mainCD : cross, b: bSide === 'main' ? mainCD : cross, P };
      for (const role of ['slip', 'loop'] as const) {
        const c = ROLE_BUILDERS[role](ctx);
        out.push({
          id: `${APPROACH[k]}-${role}`,
          role: c.role,
          approach: k,
          pts: c.pts.map((p) => rot90(p, k)),
          from: { kind: c.from.kind, road: c.from.road === 'a' ? aSide : bSide },
          to: { kind: c.to.kind, road: c.to.road === 'a' ? aSide : bSide },
          designKmh: c.designKmh,
        });
      }
    }
    // the C-D roads themselves: forward (left side, +u) and the 180 degree turned one for the opposite carriageway
    const cd = cdRoad(main, L, P);
    out.push({ id: 'mf-cd', role: 'link', approach: 0, pts: cd, from: { kind: 'gore', road: 'main' }, to: { kind: 'merge', road: 'main' }, designKmh: CD_DEFAULTS.speedKmh });
    out.push({ id: 'mb-cd', role: 'link', approach: 2, pts: cd.map((p) => rot90(p, 2)), from: { kind: 'gore', road: 'main' }, to: { kind: 'merge', road: 'main' }, designKmh: CD_DEFAULTS.speedKmh });
    return out;
  },
});
