// ROAD SIGNS - Step 4: the layout maths of the OVERHEAD GANTRY (two posts + a beam across the road + 1..3 boards on the beam).
// No three.js and no DOM in here, so the numbers can be tested headless (scripts/signs-gantry-test.ts). RoadSignLayer.addGantry draws it.
//
// Frame: the gantry is built in a LOCAL frame where +Z is the way the boards face (back at the oncoming driver) and +X is the DRIVER's RIGHT.
// So boards[0] is the leftmost board as the driver sees it, and its arrows belong to the left-hand lanes.
import { BOARD_W_M } from './SignCanvas';

/** All the sizes of the gantry in one place (metres), easy to change. */
export const GANTRY = {
  /** Free height under the beam (Bangladesh / Indian highway norm is about 5.5 m; 5.1 m is the usual legal minimum). */
  clearanceM: 5.5,
  /** Beam cross-section (a box beam stands in for the truss). */
  beamH: 0.6,
  beamDepth: 0.6,
  postR: 0.25,
  /** The posts go this far below the ground at their foot. */
  postBelowM: 0.8,
  /** The posts stand this far outside the gravel shoulder. */
  postOutsideM: 1.2,
  /** The posts stick up this far above the beam. */
  postAboveBeamM: 0.4,
  /** The beam sticks out this far past each post. */
  overhangM: 0.6,
  /** Gap between two boards on the same beam, and free space at each end of the beam. */
  boardGapM: 0.5,
  sideMarginM: 0.3,
  /** Boards on a gantry are bigger than side boards: board width = BOARD_W_M * scale. */
  maxScale: 1.5,
  /** Below this scale the letters get too small to read from a car: better to drop a board than to shrink it more. */
  minScale: 0.8,
  /** Hard floor: a gantry whose single board would need a smaller scale than this does not fit the road. */
  floorScale: 0.5,
  maxBoards: 3,
  /** The lower edge of the boards is this far above the lower edge of the beam (so a strip of beam shows under the boards). */
  boardLiftM: 0.45,
} as const;

export interface GantryLayout {
  /** Distance of each post from the road centreline (m). */
  edge: number;
  /** Boards actually placed (1..maxBoards) and boards dropped because the road is too narrow. */
  n: number;
  dropped: number;
  /** Board scale (1 = side-board size) and the resulting board width (m). */
  scale: number;
  boardW: number;
  /** Local x of each board's centre, from the driver's left to the driver's right. */
  xs: number[];
  /** Beam length (m) and the width available to boards on it (m). */
  beamLen: number;
  usable: number;
  /** false = even one board needs a scale below floorScale: the road is too narrow for a gantry. */
  fits: boolean;
}

/** Distance of the posts from the road centreline: outside the asphalt and the gravel shoulder. */
export function gantryEdge(halfWidth: number, shoulder: number): number {
  return halfWidth + shoulder + GANTRY.postOutsideM;
}

/**
 * Lays out `wanted` boards on a gantry whose posts stand `edge` m from the centreline.
 * Takes the biggest number of boards (up to `wanted`, at most maxBoards) that can be drawn at least minScale big,
 * and gives them the largest common scale (at most maxScale) that fits the beam. One board is always kept.
 */
export function layoutGantry(edge: number, wanted: number): GantryLayout {
  const want = Math.max(1, Math.min(GANTRY.maxBoards, Math.floor(wanted)));
  const beamLen = 2 * edge + 2 * GANTRY.overhangM;
  const usable = beamLen - 2 * GANTRY.sideMarginM;
  let n = want;
  let k = 0;
  for (; n >= 1; n--) {
    k = (usable - (n - 1) * GANTRY.boardGapM) / (n * BOARD_W_M);
    if (k >= GANTRY.minScale) break;
  }
  if (n < 1) {
    n = 1;
    k = usable / BOARD_W_M;
  }
  const scale = Math.max(GANTRY.floorScale, Math.min(GANTRY.maxScale, k));
  const boardW = BOARD_W_M * scale;
  const total = n * boardW + (n - 1) * GANTRY.boardGapM;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(-total / 2 + boardW / 2 + i * (boardW + GANTRY.boardGapM));
  return { edge, n, dropped: want - n, scale, boardW, xs, beamLen, usable, fits: k >= GANTRY.floorScale };
}
