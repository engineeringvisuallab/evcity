/**
 * Pure maths for the skinned human body (no three.js here, so it can be unit tested in plain node).
 *
 * Coordinates are in metres, feet at y = 0, the body faces +Z, the person's LEFT side is -X (same as the old rigid rig).
 * A body part is a "tube": a stack of elliptical rings (y, half width, half depth, forward offset). Every vertex gets up
 * to four bone weights that blend smoothly across the joints, so elbows, knees and the waist bend without gaps.
 */

export type V3 = [number, number, number];
/** [bone index, weight] pairs (always four, weights sum to 1). */
export type Weights = [number, number][];

/** Joint heights in the rest pose (arms hanging, legs straight). */
export const J = {
  hips: 0.9,
  spine: 1.0,
  chest: 1.22,
  neck: 1.5,
  head: 1.57,
  shoulder: 1.45,
  elbow: 1.15,
  wrist: 0.89,
  knee: 0.44,
  ankle: 0.08,
} as const;

/** Bone indices inside the skeleton (the order of THREE.Skeleton.bones). */
export const BONE = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  armL: 5, foreL: 6, handL: 7,
  armR: 8, foreR: 9, handR: 10,
  legL: 11, shinL: 12, footL: 13,
  legR: 14, shinR: 15, footR: 16,
} as const;
export const BONE_COUNT = 17;

export type Side = 'L' | 'R';
export type BodyType = 'slim' | 'average' | 'stocky';

export interface Props {
  torsoX: number; torsoZ: number;
  armX: number; armZ: number;
  legX: number; legZ: number;
  shoulder: number;
  headX: number; headZ: number;
}

/** Mild proportion differences per body type (same numbers as the old rigid body). */
export function propsOf(t: BodyType): Props {
  if (t === 'slim') return { torsoX: 0.91, torsoZ: 0.94, armX: 0.91, armZ: 0.94, legX: 0.92, legZ: 0.95, shoulder: 0.96, headX: 0.98, headZ: 0.98 };
  if (t === 'stocky') return { torsoX: 1.12, torsoZ: 1.1, armX: 1.1, armZ: 1.08, legX: 1.08, legZ: 1.06, shoulder: 1.08, headX: 1.03, headZ: 1.02 };
  return { torsoX: 1, torsoZ: 1, armX: 1, armZ: 1, legX: 1, legZ: 1, shoulder: 1, headX: 1, headZ: 1 };
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth 0..1 step from e0 to e1 (the edges may be reversed). */
export const sstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** One elliptical cross-section of a tube. */
export interface Ring {
  y: number;
  rx: number;
  rz: number;
  cx: number;
  cz: number;
}

/** Profile table rows: [y, half width, half depth, forward offset], ascending y. */
export type Table = [number, number, number, number][];

/** Torso: crotch -> hips -> waist -> chest -> shoulder slope -> base of the neck. */
export const TORSO: Table = [
  [0.84, 0.15, 0.105, 0],
  [0.9, 0.17, 0.112, -0.005],
  [0.97, 0.16, 0.106, 0],
  [1.04, 0.148, 0.098, 0],
  [1.14, 0.16, 0.102, 0.004],
  [1.24, 0.18, 0.11, 0.008],
  [1.34, 0.2, 0.122, 0.012],
  [1.42, 0.205, 0.118, 0.008],
  [1.47, 0.175, 0.098, 0.002],
  [1.52, 0.095, 0.072, 0],
  [1.56, 0.055, 0.055, 0],
];

/** Arm (hanging down): wrist -> forearm -> elbow -> biceps -> deltoid. */
export const ARM: Table = [
  [0.89, 0.03, 0.027, 0],
  [0.95, 0.036, 0.032, 0],
  [1.02, 0.042, 0.038, 0],
  [1.09, 0.047, 0.045, 0],
  [1.15, 0.044, 0.045, 0],
  [1.22, 0.047, 0.048, 0],
  [1.3, 0.053, 0.054, 0],
  [1.38, 0.059, 0.058, 0],
  [1.45, 0.062, 0.06, 0],
  [1.49, 0.05, 0.048, 0],
];

/** Leg: ankle -> calf -> knee -> thigh -> hip. */
export const LEG: Table = [
  [0.09, 0.036, 0.042, 0.004],
  [0.14, 0.04, 0.044, 0.002],
  [0.22, 0.047, 0.052, -0.004],
  [0.31, 0.056, 0.062, -0.008],
  [0.4, 0.056, 0.062, 0],
  [0.45, 0.059, 0.064, 0.004],
  [0.52, 0.064, 0.07, 0.004],
  [0.64, 0.078, 0.086, 0.002],
  [0.76, 0.088, 0.096, 0],
  [0.86, 0.092, 0.1, -0.004],
  [0.93, 0.09, 0.098, -0.006],
];

/** Neck (a plain thin tube). */
export const NECK: Table = [
  [1.5, 0.05, 0.052, 0.004],
  [1.63, 0.048, 0.05, 0.006],
];

/** Interpolate a table at height y (clamped at both ends). Returns [rx, rz, cz]. */
export function at(t: Table, y: number): V3 {
  if (y <= t[0][0]) return [t[0][1], t[0][2], t[0][3]];
  for (let i = 1; i < t.length; i++) {
    if (y <= t[i][0]) {
      const a = t[i - 1];
      const b = t[i];
      const f = (y - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  const l = t[t.length - 1];
  return [l[1], l[2], l[3]];
}

export interface SliceOpts {
  /** Added to both radii (a shirt over the skin). */
  grow?: number;
  /** Multipliers for the half width / half depth (body type). */
  sx?: number;
  sz?: number;
  /** Sideways centre of the rings. */
  cx?: number;
}

/** The part of a table between y0 and y1 as rings (end rings are interpolated). */
export function slice(t: Table, y0: number, y1: number, o: SliceOpts = {}): Ring[] {
  const ys = [y0];
  for (const row of t) if (row[0] > y0 + 1e-6 && row[0] < y1 - 1e-6) ys.push(row[0]);
  ys.push(y1);
  const grow = o.grow ?? 0;
  const sx = o.sx ?? 1;
  const sz = o.sz ?? 1;
  return ys.map((y) => {
    const [rx, rz, cz] = at(t, y);
    return { y, rx: rx * sx + grow, rz: rz * sz + grow, cx: o.cx ?? 0, cz };
  });
}

export interface TubeData {
  pos: Float32Array;
  idx: number[];
}

/**
 * Triangles of a tube: `seg` vertices round every ring, rings sorted bottom to top, outward facing,
 * optional end caps (fan to a centre vertex). No duplicated seam vertices, so smooth shading has no visible seam.
 */
export function tubeData(rings: Ring[], seg: number, caps = true): TubeData {
  const rs = [...rings].sort((a, b) => a.y - b.y);
  const n = rs.length;
  const nv = n * seg + (caps ? 2 : 0);
  const pos = new Float32Array(nv * 3);
  for (let r = 0; r < n; r++) {
    const q = rs[r];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const i = (r * seg + j) * 3;
      pos[i] = q.cx + q.rx * Math.cos(th);
      pos[i + 1] = q.y;
      pos[i + 2] = q.cz + q.rz * Math.sin(th);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = r * seg + j;
      const b = r * seg + j2;
      const c = (r + 1) * seg + j;
      const d = (r + 1) * seg + j2;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    const bc = n * seg;
    const tc = n * seg + 1;
    const lo = rs[0];
    const hi = rs[n - 1];
    pos.set([lo.cx, lo.y, lo.cz], bc * 3);
    pos.set([hi.cx, hi.y, hi.cz], tc * 3);
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(bc, j, j2); // bottom cap faces down
      idx.push(tc, (n - 1) * seg + j2, (n - 1) * seg + j); // top cap faces up
    }
  }
  return { pos, idx };
}

// ---------------------------------------------------------------- skin weights

/** Hips / waist / chest / neck blend for the torso, belt and shirt. */
export function torsoW(y: number): Weights {
  const a = sstep(0.93, 1.06, y); // hips -> spine
  const c = sstep(1.14, 1.3, y); // spine -> chest
  const n = sstep(1.46, 1.56, y); // chest -> neck
  return [
    [BONE.hips, 1 - a],
    [BONE.spine, a * (1 - c)],
    [BONE.chest, a * c * (1 - n)],
    [BONE.neck, a * c * n],
  ];
}

/** Neck tube: held by the chest at the bottom, follows the head at the top. */
export function neckW(y: number): Weights {
  const wc = 0.5 * (1 - sstep(1.47, 1.53, y));
  const wh = sstep(1.56, 1.64, y);
  return [
    [BONE.chest, wc],
    [BONE.neck, 1 - wc - wh],
    [BONE.head, wh],
    [BONE.head, 0],
  ];
}

export function legW(side: Side, y: number): Weights {
  const up = side === 'L' ? BONE.legL : BONE.legR;
  const shin = side === 'L' ? BONE.shinL : BONE.shinR;
  const foot = side === 'L' ? BONE.footL : BONE.footR;
  const wh = 0.5 * sstep(0.88, 0.96, y); // top of the thigh is shared with the pelvis
  const r = 1 - wh;
  const tk = sstep(0.52, 0.37, y); // thigh -> shin round the knee
  const ta = sstep(0.15, 0.09, y); // shin -> foot round the ankle
  const lower = r * tk;
  return [
    [BONE.hips, wh],
    [up, r * (1 - tk)],
    [shin, lower * (1 - ta)],
    [foot, lower * ta],
  ];
}

export function armW(side: Side, y: number): Weights {
  const arm = side === 'L' ? BONE.armL : BONE.armR;
  const fore = side === 'L' ? BONE.foreL : BONE.foreR;
  const hand = side === 'L' ? BONE.handL : BONE.handR;
  const wc = 0.55 * sstep(1.38, 1.47, y); // top of the shoulder is shared with the chest
  const r = 1 - wc;
  const tk = sstep(1.22, 1.09, y); // upper arm -> forearm round the elbow
  const th = sstep(0.93, 0.87, y); // forearm -> hand round the wrist
  const lower = r * tk;
  return [
    [BONE.chest, wc],
    [arm, r * (1 - tk)],
    [fore, lower * (1 - th)],
    [hand, lower * th],
  ];
}

/**
 * Long garment (panjabi / lungi): the waist follows the pelvis, the lower part follows the thigh of the SAME side (by the sign of x),
 * so the hem swings with the legs and a seated person's skirt follows the knees. `k` = how much of the hem follows the legs.
 */
export function skirtW(x: number, y: number, hem: number, k: number): Weights {
  if (y > 0.97) return torsoW(y);
  const t = sstep(0.97, hem, y) * k * sstep(0, 0.07, Math.abs(x));
  return [
    [BONE.hips, 1 - t],
    [x < 0 ? BONE.legL : BONE.legR, t],
    [BONE.hips, 0],
    [BONE.hips, 0],
  ];
}

/** Everything on this part follows one bone. */
export const solid = (bone: number): Weights => [[bone, 1], [bone, 0], [bone, 0], [bone, 0]];

/** Fills per-vertex skinIndex / skinWeight arrays for `pos` using `fn(x, y, z)`. */
export function skinArrays(pos: ArrayLike<number>, fn: (x: number, y: number, z: number) => Weights): { index: Uint16Array; weight: Float32Array } {
  const n = pos.length / 3;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += w[k][1];
    if (sum < 1e-6) {
      index[i * 4] = w[0][0];
      weight[i * 4] = 1;
      continue;
    }
    for (let k = 0; k < 4; k++) {
      index[i * 4 + k] = w[k][0];
      weight[i * 4 + k] = w[k][1] / sum;
    }
  }
  return { index, weight };
}
