// STEP 5.1: the finished height of the ring centreline as a function of station (the Step 3 grade line, 10 m samples).
// The ring is a closed loop: station wraps at the alignment length. Between the 10 m samples the height is a periodic
// cubic Hermite curve (slopes from neighbours), so grade and its change stay smooth for the road mesh and for physics.
import { RING_PROFILE_STEP, RING_PROFILE_Y } from './RingProfileData';

export interface RingProfile {
  /** Closed length (m): station wraps at this value. */
  readonly length: number;
  /** Finished centreline height (m) at station s (any real number, wrapped). */
  yAt(s: number): number;
  /** Grade dy/ds at station s. */
  gradeAt(s: number): number;
}

/** `length` = ring alignment length (m). The last sample interval is shorter than 10 m (the ring does not close on a multiple of 10 m). */
export function makeRingProfile(length: number): RingProfile {
  const n = RING_PROFILE_Y.length;
  const ds = (i: number): number => (i === n - 1 ? length - (n - 1) * RING_PROFILE_STEP : RING_PROFILE_STEP); // interval i -> i+1
  const wrapS = (s: number): number => ((s % length) + length) % length;
  const y = (i: number): number => RING_PROFILE_Y[((i % n) + n) % n];
  // slope at node i from the two neighbouring intervals (three-point, uneven spacing)
  const m = (i: number): number => {
    const a = ds(((i - 1) % n + n) % n), b = ds(((i % n) + n) % n);
    return ((y(i) - y(i - 1)) / a * b + (y(i + 1) - y(i)) / b * a) / (a + b);
  };
  const seg = (s: number): { i: number; h: number; t: number } => {
    const w = wrapS(s);
    let i = Math.min(n - 1, Math.floor(w / RING_PROFILE_STEP));
    const h = ds(i);
    return { i, h, t: (w - i * RING_PROFILE_STEP) / h };
  };
  return {
    length,
    yAt(s) {
      const { i, h, t } = seg(s);
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y(i) + (t3 - 2 * t2 + t) * h * m(i) + (-2 * t3 + 3 * t2) * y(i + 1) + (t3 - t2) * h * m(i + 1);
    },
    gradeAt(s) {
      const { i, h, t } = seg(s);
      const t2 = t * t;
      return ((6 * t2 - 6 * t) * y(i) + (3 * t2 - 4 * t + 1) * h * m(i) + (-6 * t2 + 6 * t) * y(i + 1) + (3 * t2 - 2 * t) * h * m(i + 1)) / h;
    },
  };
}
