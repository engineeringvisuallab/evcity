// ROAD SIGNS - Step 4: the layout maths of the OVERHEAD GANTRY: two posts, a frame across ALL lanes and 1..3 board PANELS that together
// fill the whole span between the posts, each panel above the lanes of its own direction (left arrow = left lanes, ahead = middle, right = right lanes).
// No three.js and no DOM in here, so the numbers can be tested headless (scripts/signs-gantry-test.ts). RoadSignLayer.addGantry draws it.
//
// Frame: the gantry is built in a LOCAL frame where +Z is the way the boards face (back at the oncoming driver) and +X is the DRIVER's RIGHT.
// So panel 0 is the leftmost panel as the driver sees it.
import type { SignRow } from './SignFormat';

/** All the sizes of the gantry in one place (metres), easy to change. */
export const GANTRY = {
  /** Free height under the lowest part of the gantry (Bangladesh / Indian highway norm about 5.5 m; 5.1 m is the usual legal minimum). */
  clearanceM: 5.6,
  /** The posts: round steel tubes on a concrete base. */
  postR: 0.3,
  postBelowM: 0.8,
  baseSizeM: 1.1,
  baseHeightM: 0.5,
  /** The posts stand this far outside the gravel shoulder. */
  postOutsideM: 1.2,
  /** The posts stick up this far above the top pipe. */
  postAboveM: 0.5,
  /** The sign face reaches this far beyond each post (so it really covers the full width). */
  overPostM: 0.5,
  /** Chord pipes (top and bottom of the frame). */
  chordR: 0.13,
  /** The sign body (the back of the boards) is this much taller than the faces, and this deep. */
  bodyPadM: 0.25,
  bodyDepthM: 0.25,
  /** STEP 7: a double-sided gantry has panels on both sides; its body is as deep as a post is thick, so the posts hide inside it (they do not cover the panels). */
  bodyDepthDoubleM: 0.6,
  /** Gap between two panels. */
  panelGapM: 0.1,
  /** A panel narrower than this is not worth drawing: the panels are merged instead. */
  minPanelM: 2.6,
  maxPanels: 3,
  /** The faces are drawn this many times taller than a side board of the same rows (side-board height x this). */
  heightScale: 1.5,
  /** Lower edge of the faces above the lowest part of the gantry. */
  faceLiftM: 0.3,
} as const;

export interface GantryLayout {
  /** Distance of each post from the road centreline (m). */
  edge: number;
  /** Panels actually placed (1..maxPanels) and panels merged away because the road is too narrow. */
  n: number;
  merged: number;
  /** Total width of the sign face (m), the width of one panel (m) and the local x of each panel's centre (driver's left -> right). */
  span: number;
  panelW: number;
  xs: number[];
  /** Length of the frame pipes (m). */
  frameLen: number;
  /** false = even a single panel is narrower than minPanelM (an absurdly narrow road). */
  fits: boolean;
}

/** Distance of the posts from the road centreline: outside the asphalt and the gravel shoulder. */
export function gantryEdge(halfWidth: number, shoulder: number): number {
  return halfWidth + shoulder + GANTRY.postOutsideM;
}

/**
 * Lays out `wanted` panels side by side over the whole width between the posts (plus overPostM at each end).
 * Takes as many panels as fit (each at least minPanelM wide, at most maxPanels); one panel is always kept.
 */
export function layoutGantry(edge: number, wanted: number): GantryLayout {
  const want = Math.max(1, Math.min(GANTRY.maxPanels, Math.floor(wanted)));
  const span = 2 * edge + 2 * GANTRY.overPostM;
  let n = want;
  while (n > 1 && (span - (n - 1) * GANTRY.panelGapM) / n < GANTRY.minPanelM) n--;
  const panelW = (span - (n - 1) * GANTRY.panelGapM) / n;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(-span / 2 + panelW / 2 + i * (panelW + GANTRY.panelGapM));
  return { edge, n, merged: want - n, span, panelW, xs, frameLen: span + 0.2, fits: panelW >= GANTRY.minPanelM };
}

const ARROW_ORDER: Record<string, number> = { left: 0, ahead: 1, right: 2 };

/**
 * Splits the rows of one planned board into PANELS for the gantry, in the order the driver sees them (left, ahead, right):
 * rows with the same arrow stay together; while there are fewer than `maxPanels` panels and some panel has more than one row,
 * its last row becomes a panel of its own (so a board of rows all "ahead" still spreads over the whole width).
 */
export function splitPanels(rows: readonly SignRow[], maxPanels: number = GANTRY.maxPanels): SignRow[][] {
  const groups: SignRow[][] = [[], [], []];
  for (const r of rows) groups[ARROW_ORDER[r.arrow ?? 'ahead']].push(r);
  const panels = groups.filter((g) => g.length > 0);
  while (panels.length < maxPanels) {
    let at = -1;
    for (let i = 0; i < panels.length; i++) if (panels[i].length > 1 && (at < 0 || panels[i].length > panels[at].length)) at = i;
    if (at < 0) break;
    const last = panels[at].pop() as SignRow;
    panels.splice(at + 1, 0, [last]);
  }
  return panels;
}
