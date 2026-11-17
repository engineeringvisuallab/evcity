// STEP 2.2  Clothoid (spiral) formulas (pure). Spiral of length Ls that joins a straight to an arc of radius R:
// heading change theta(l) = l^2 / (2 R Ls), curvature k(l) = l / (R Ls). Series are exact enough for Ls/R <= 0.3 (error < 1e-9 m).
export interface SpiralConst { thetaS: number; Xs: number; Ys: number; p: number; k: number }

/** Local coordinates of the spiral at distance l from the tangent point (x along the tangent, y toward the inside of the curve). */
export function spiralLocal(l: number, R: number, Ls: number): { x: number; y: number; theta: number } {
  const th = (l * l) / (2 * R * Ls);
  const t2 = th * th;
  const x = l * (1 - t2 / 10 + (t2 * t2) / 216 - (t2 * t2 * t2) / 9360 + (t2 * t2 * t2 * t2) / 685440);
  const y = l * (th / 3 - (th * t2) / 42 + (th * t2 * t2) / 1320 - (th * t2 * t2 * t2) / 75600);
  return { x, y, theta: th };
}

/** End-of-spiral constants: spiral angle, end coordinates, shift p and tangent offset k (for Ts = (R + p) tan(delta/2) + k). */
export function spiralConst(R: number, Ls: number): SpiralConst {
  const e = spiralLocal(Ls, R, Ls);
  return { thetaS: e.theta, Xs: e.x, Ys: e.y, p: e.y - R * (1 - Math.cos(e.theta)), k: e.x - R * Math.sin(e.theta) };
}

/** Tangent length from the PI to TS (and to ST) for a total deflection angle |delta| (rad). */
export const tangentLength = (R: number, Ls: number, delta: number): number => {
  const c = spiralConst(R, Ls);
  return (R + c.p) * Math.tan(Math.abs(delta) / 2) + c.k;
};
