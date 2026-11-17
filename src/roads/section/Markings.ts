// STEP 4.5  Markings data of a divided road (pure, no three.js). DATA ONLY: where each painted line lies in the cross-section and how it is dashed.
// The numbers are a PROPOSAL (the handoff gives none): 0.15 m lines, dash 3 m + gap 9 m (1:3, 12 m pitch) for V100, white lane and right-hand edge lines,
// yellow left edge line next to the median. Drive side is LEFT (DESIGN.driveSide), so "left" and "right" below are the sides of the direction of travel.
// The meshes come in Step 12 (Markings.ts in src/roads/build). Gore markings are placeholders: only the station window is reserved here.
import type { Section } from '../standards/SectionTable';

export type MarkingColor = 'white' | 'yellow';
export type MarkingStyle = 'solid' | 'dashed';
export interface MarkingLine {
  id: string;
  kind: 'edge-line-median-side' | 'lane-line' | 'edge-line-outer';
  /** Which carriageway: +1 = the +normal side of the centreline, -1 = the other. */
  sigma: 1 | -1;
  color: MarkingColor;
  style: MarkingStyle;
  /** Offset of the CENTRE of the line from the road centreline (m, positive on its own side). */
  offset: number;
  width: number;
  /** For dashed lines: painted length and nominal pitch (painted + gap), m. */
  dash?: number;
  pitch?: number;
}

export const MARKING = { width: 0.15, dash: 3, gap: 9, laneWidth: 3.65 } as const;

/** All painted lines of one divided carriageway pair (both sides). Edge lines sit in the shoulder, touching the lane edge. */
export function buildMarkingLines(sec: Section): MarkingLine[] {
  const lanes = sec.elements.find((e) => e.kind === 'lanes')!;
  const w = MARKING.width;
  const out: MarkingLine[] = [];
  for (const sigma of [1, -1] as const) {
    const tag = sigma === 1 ? 'A' : 'B';
    out.push({ id: `${tag}-edge-median`, kind: 'edge-line-median-side', sigma, color: 'yellow', style: 'solid', offset: lanes.from - w / 2, width: w });
    for (let k = 1; k < sec.lanesPerDir; k++) {
      out.push({ id: `${tag}-lane-${k}`, kind: 'lane-line', sigma, color: 'white', style: 'dashed', offset: lanes.from + k * MARKING.laneWidth, width: w, dash: MARKING.dash, pitch: MARKING.dash + MARKING.gap });
    }
    out.push({ id: `${tag}-edge-outer`, kind: 'edge-line-outer', sigma, color: 'white', style: 'solid', offset: lanes.to + w / 2, width: w });
  }
  return out;
}

/** Dash layout on a closed line of length Lline: the pitch is stretched a little so a whole number of dashes fits and the pattern closes without a short dash. */
export function closedDashes(Lline: number, pitch: number, dash: number): { count: number; pitch: number; dash: number; stretch: number } {
  const count = Math.max(1, Math.round(Lline / pitch));
  const p = Lline / count;
  return { count, pitch: p, dash: (dash / pitch) * p, stretch: p / pitch - 1 };
}

/** Placeholder of a gore (exit / entry) marking next to a radial meeting point. Geometry comes with the interchange step (Step 6). */
export interface GorePlaceholder {
  dir: 'N' | 'E' | 'S' | 'W';
  station: number;
  /** Station windows that must stay free of superelevation change and other marking changes: exit lane + taper, entry lane + taper (m, from 2.4). */
  exitWindow: number;
  entryWindow: number;
}
export const GORE_EXIT = { lane: 116, taper: 91 } as const;
export const GORE_ENTRY = { lane: 241, taper: 183 } as const;
export function gorePlaceholders(joins: ReadonlyArray<{ dir: 'N' | 'E' | 'S' | 'W'; station: number }>): GorePlaceholder[] {
  return joins.map((j) => ({ dir: j.dir, station: j.station, exitWindow: GORE_EXIT.lane + GORE_EXIT.taper, entryWindow: GORE_ENTRY.lane + GORE_ENTRY.taper }));
}
