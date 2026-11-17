// EVLab Step RT6: where the real-time clock stands on the tower and how its face is laid out (pure numbers, no three.js, no canvas).
// 4 clocks, one on each face of the tower (S, E, N, W), on the glass wall ABOVE the first sky-garden set-back (level 15) and above the lettering
// (levels 3..13). Same strip-on-the-glass method as the lettering (EVLabLettersPlan.bandQuads), so the face follows the lean of the facade.
import { SETBACKS, T, levelY } from './EVLabTowerLayout';
import { bandQuads, type LetterQuad } from './EVLabLettersPlan';

/** The levels of the clock strip (above the set-back at level 15, below the next one at level 30). */
export const CLOCK_BAND = { n0: 17, n1: 20 } as const;
export const CLOCK_Y0 = levelY(CLOCK_BAND.n0);
export const CLOCK_Y1 = levelY(CLOCK_BAND.n1) + T.floorH;
export const CLOCK_H = CLOCK_Y1 - CLOCK_Y0;
/** World width (m) of the clock texture (centred on the face). */
export const CLOCK_W = 20;

/** The clock face inside the texture (metres, measured from the top-left of the texture): the dial, and the digital line under it. */
export const DIAL = { cx: CLOCK_W / 2, cy: 7.0, r: 6.2 } as const;
export const DIGITAL = { top: 13.7, cap: 2.4 } as const;

export const clockQuads = (): LetterQuad[] => bandQuads(CLOCK_BAND.n0, CLOCK_BAND.n1, () => CLOCK_W);

export const CLOCK_SETBACK_OK = CLOCK_BAND.n0 > SETBACKS[0] && CLOCK_BAND.n1 < SETBACKS[1];
