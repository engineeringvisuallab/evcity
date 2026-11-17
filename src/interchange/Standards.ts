// DESIGN CHECKS for interchange / junction geometry. Pure formulas (AASHTO Green Book, metric, kinematic form), no tables copied from memory:
// every number below is derived from V, e, f, a, so it can be audited. Replace the constants in CRITERIA with the project's standard (RHD / AASHTO / other).

export interface Criteria {
  /** Max superelevation (m/m). */
  emax: number;
  /** Side-friction factor by design speed (km/h) for low-speed ramps; linear interpolation. AASHTO low-speed values. */
  f: Array<[number, number]>;
  /** Perception-reaction time for stopping sight distance (s) and braking deceleration (m/s2). */
  tPR: number;
  aBrake: number;
  /** Mean deceleration in the exit lane (m/s2) and mean acceleration in the entrance lane (m/s2). */
  aDecel: number;
  aAccel: number;
  /** Minimum weaving length between an entrance and the next exit on the SAME carriageway (m): absolute minimum / desirable. */
  weaveMin: number;
  weaveDesirable: number;
  /** Max ramp grade (m/m). */
  rampMaxGrade: number;
}

export const CRITERIA: Criteria = {
  emax: 0.08,
  f: [[20, 0.35], [30, 0.28], [40, 0.23], [50, 0.19], [60, 0.17], [70, 0.15], [80, 0.14], [100, 0.12], [120, 0.09]],
  tPR: 2.5,
  aBrake: 3.4,
  aDecel: 2.5,
  aAccel: 1.2,
  weaveMin: 150,
  weaveDesirable: 300,
  rampMaxGrade: 0.05,
};

export function frictionAt(V: number, c: Criteria = CRITERIA): number {
  const t = c.f;
  if (V <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (V <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (V - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
  return t[t.length - 1][1];
}

/** Minimum horizontal radius (m) for design speed V (km/h): V^2 / (127 (e + f)). */
export function minRadius(V: number, c: Criteria = CRITERIA): number {
  return (V * V) / (127 * (c.emax + frictionAt(V, c)));
}

/** Largest design speed (km/h) a given radius supports at emax. */
export function speedOfRadius(R: number, c: Criteria = CRITERIA): number {
  let v = 10;
  while (v < 140 && minRadius(v + 1, c) <= R) v++;
  return v;
}

/** Stopping sight distance (m): 0.278 V t + V^2 / (254 (a/9.81 + G)); G = grade (m/m, + uphill). */
export function stoppingSight(V: number, G = 0, c: Criteria = CRITERIA): number {
  return 0.278 * V * c.tPR + (V * V) / (254 * (c.aBrake / 9.81 + G));
}

/** Length (m) to change speed from Va to Vb (km/h) at a mean rate a (m/s2): (Va^2 - Vb^2) / (2a). Excludes the taper. */
export function speedChangeLength(Va: number, Vb: number, a: number): number {
  const ua = Va / 3.6;
  const ub = Vb / 3.6;
  return Math.abs(ua * ua - ub * ub) / (2 * a);
}

/** Deceleration lane (exit) from the highway speed to the ramp's controlling (curve) speed. */
export function decelLength(Vhwy: number, Vramp: number, c: Criteria = CRITERIA): number {
  return speedChangeLength(Vhwy, Vramp, c.aDecel);
}

/** Acceleration lane (entrance) from the ramp speed up to ~ 0.85 of the highway speed (AASHTO merges at about that speed). */
export function accelLength(Vhwy: number, Vramp: number, c: Criteria = CRITERIA): number {
  return speedChangeLength(Vramp, 0.85 * Vhwy, c.aAccel);
}

/** Crest vertical curve minimum K (m per % A) for stopping sight distance, h1 = 1.08 m eye, h2 = 0.6 m object. */
export function crestK(V: number, c: Criteria = CRITERIA): number {
  const s = stoppingSight(V, 0, c);
  return (s * s) / (100 * Math.pow(Math.sqrt(2 * 1.08) + Math.sqrt(2 * 0.6), 2));
}
