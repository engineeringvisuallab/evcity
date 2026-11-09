import {
  ARM, BONE, HEAD_LIFT, HIP_X, J, LEG, NECK, SHOULDER_X, TORSO, armW, at, bootW, legW, neckW, propsOf, skinArrays, skirtW, slice, solid, torsoW, tubeData,
  type BodyType, type Ring, type TubeData, type V3, type Weights,
} from './SkinMath';

/**
 * Every part of the skinned human as plain arrays (positions, triangles, material slot, skin weights) - no three.js here,
 * so the SAME geometry is used by the game (SkinnedHuman.ts), by the unit tests and by the software preview renderer.
 */

export type Outfit = 'shirt' | 'panjabi' | 'lungi';

/** Material slots (index into the material array and the geometry groups). */
export const SLOT = { skin: 0, shirt: 1, pants: 2, shoes: 3, dark: 4, white: 5, lips: 6 } as const;
export const SLOTS = 7;

export interface Part {
  pos: Float32Array;
  idx: number[];
  slot: number;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /** Closed surface (end caps present): its volume can be checked. */
  closed: boolean;
}

const SEG_BODY = 18;
const SEG_LIMB = 12;

/** Ellipsoid (radii r, centre p): ws segments round, hs rings pole to pole, no duplicated seam vertices, outward facing. */
export function ellipsoidData(r: V3, p: V3, ws: number, hs: number): TubeData {
  const nv = (hs - 1) * ws + 2;
  const pos = new Float32Array(nv * 3);
  pos.set([p[0], p[1] + r[1], p[2]], 0); // top pole
  for (let i = 1; i < hs; i++) {
    const phi = (Math.PI * i) / hs;
    const y = Math.cos(phi) * r[1];
    const rad = Math.sin(phi);
    for (let j = 0; j < ws; j++) {
      const th = (j / ws) * Math.PI * 2;
      pos.set([p[0] + r[0] * rad * Math.cos(th), p[1] + y, p[2] + r[2] * rad * Math.sin(th)], (1 + (i - 1) * ws + j) * 3);
    }
  }
  const bottom = nv - 1;
  pos.set([p[0], p[1] - r[1], p[2]], bottom * 3);
  const idx: number[] = [];
  const ring = (i: number, j: number): number => 1 + (i - 1) * ws + (j % ws);
  for (let j = 0; j < ws; j++) {
    idx.push(0, ring(1, j + 1), ring(1, j)); // top fan, faces up
    idx.push(bottom, ring(hs - 1, j), ring(hs - 1, j + 1)); // bottom fan, faces down
  }
  for (let i = 1; i < hs - 1; i++) {
    for (let j = 0; j < ws; j++) {
      const a = ring(i + 1, j); // lower ring
      const b = ring(i + 1, j + 1);
      const c = ring(i, j); // upper ring
      const d = ring(i, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, idx };
}

/** Axis aligned box (centre p). */
export function boxData(w: number, h: number, d: number, p: V3): TubeData {
  const pos = new Float32Array(24);
  let n = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pos.set([p[0] + (sx * w) / 2, p[1] + (sy * h) / 2, p[2] + (sz * d) / 2], n * 3);
    n++;
  }
  // vertex index = (sx>0)*4 + (sy>0)*2 + (sz>0)
  const quad = (a: number, b: number, c: number, e: number): number[] => [a, b, c, a, c, e];
  const idx = [
    ...quad(4, 5, 7, 6), // +x
    ...quad(0, 2, 3, 1), // -x
    ...quad(2, 6, 7, 3), // +y
    ...quad(0, 1, 5, 4), // -y
    ...quad(1, 3, 7, 5), // +z
    ...quad(0, 4, 6, 2), // -z
  ];
  return { pos, idx };
}

const ring = (y: number, rx: number, rz: number, cx = 0, cz = 0): Ring => ({ y, rx, rz, cx, cz });

/** Parts of one body. lod 1 = far version (same parts, same slots, fewer segments). */
export function buildParts(type: BodyType, lod: 0 | 1, outfit: Outfit): Part[] {
  const P = propsOf(type);
  const segB = lod ? 10 : SEG_BODY;
  const segL = lod ? 7 : SEG_LIMB;
  const sph = (ws: number, hs: number): [number, number] => (lod ? [Math.max(5, Math.round(ws * 0.5)), Math.max(3, Math.round(hs * 0.5))] : [ws, hs]);
  const parts: Part[] = [];

  const put = (d: TubeData, slot: number, fn: (x: number, y: number, z: number) => Weights, closed = true): void => {
    const s = skinArrays(d.pos, fn);
    parts.push({ pos: d.pos, idx: d.idx, slot, skinIndex: s.index, skinWeight: s.weight, closed });
  };
  const tube = (rings: Ring[], seg: number, slot: number, fn: (x: number, y: number, z: number) => Weights, caps = true): void => put(tubeData(rings, seg, caps), slot, fn, caps);
  const ell = (r: V3, p: V3, ws: number, hs: number, slot: number, fn: (x: number, y: number, z: number) => Weights): void => {
    const [w, h] = sph(ws, hs);
    put(ellipsoidData(r, p, w, h), slot, fn);
  };
  const body = { sx: P.torsoX, sz: P.torsoZ };

  // ---- torso: trousers round the hips, shirt over the chest (hangs over the waistband), belt, neck ----
  tube(slice(TORSO, 0.78, 1.0, body), segB, SLOT.pants, (_x, y) => torsoW(y));
  tube(slice(TORSO, 0.985, 1.56, { ...body, grow: 0.008 }), segB, SLOT.shirt, (_x, y) => torsoW(y));
  tube(slice(TORSO, 0.955, 0.995, { ...body, grow: 0.007 }), segB, SLOT.dark, (_x, y) => torsoW(y), false);
  tube(slice(NECK, 1.5, 1.66), lod ? 7 : 12, SLOT.skin, (_x, y) => neckW(y));

  // ---- long garments: panjabi (shirt colour, to the knees, loose) or lungi (trouser colour, wrapped to mid-calf, bare calves) ----
  if (outfit !== 'shirt') {
    const top = at(TORSO, 1.06);
    const topRing = ring(1.06, top[0] * P.torsoX + 0.006, top[1] * P.torsoZ + 0.006, 0, top[2]);
    const mk = (y: number, rx: number, rz: number): Ring => ring(y, rx * P.torsoX, rz * P.torsoZ);
    if (outfit === 'panjabi') {
      tube([mk(0.55, 0.21, 0.16), mk(0.7, 0.2, 0.15), mk(0.85, 0.19, 0.132), mk(0.985, 0.17, 0.116), topRing], segB, SLOT.shirt, (x, y) => skirtW(x, y, 0.55, 0.55));
    } else {
      tube([mk(0.31, 0.15, 0.11), mk(0.55, 0.165, 0.115), mk(0.75, 0.172, 0.12), mk(0.9, 0.188, 0.128), mk(0.99, 0.167, 0.115), topRing], segB, SLOT.pants, (x, y) => skirtW(x, y, 0.31, 0.85));
    }
  }

  // ---- arms, hands, legs, boots ----
  const shoulderX = SHOULDER_X * P.shoulder;
  const hipX = HIP_X * P.legX;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? -1 : 1;
    const ax = sx * shoulderX;
    const lx = sx * hipX;
    const hand = side === 'L' ? BONE.handL : BONE.handR;
    const foot = side === 'L' ? BONE.footL : BONE.footR;
    const arm = { sx: P.armX, sz: P.armZ, cx: ax };

    // short sleeve (shirt) over the upper arm, bare forearm
    tube(slice(ARM, 1.215, 1.5, { ...arm, grow: 0.004 }), segL, SLOT.shirt, (_x, y) => armW(side, y));
    tube(slice(ARM, 0.89, 1.225, arm), segL, SLOT.skin, (_x, y) => armW(side, y));
    // hand: palm, fingers, thumb on the inner side
    ell([0.03, 0.074, 0.016], [ax, 0.815, 0.003], 10, 9, SLOT.skin, () => solid(hand));
    ell([0.011, 0.032, 0.012], [ax - sx * 0.03, 0.835, 0.014], 8, 6, SLOT.skin, () => solid(hand));

    // trousers: one tube hip -> ankle (a lungi shows bare calves)
    const legOpts = { sx: P.legX, sz: P.legZ, cx: lx };
    if (outfit === 'lungi') {
      tube(slice(LEG, 0.09, 0.32, legOpts), segB, SLOT.skin, (_x, y) => legW(side, y));
      tube(slice(LEG, 0.31, 0.93, legOpts), segB, SLOT.pants, (_x, y) => legW(side, y)); // (hidden under the lungi)
    } else {
      tube(slice(LEG, 0.09, 0.93, legOpts), segB, SLOT.pants, (_x, y) => legW(side, y));
    }
    // work boot: toe box + sole + ankle-high shaft
    ell([0.058 * P.legX, 0.05, 0.14], [lx, 0.052, 0.058], 14, 9, SLOT.shoes, () => solid(foot));
    ell([0.06 * P.legX, 0.013, 0.148], [lx, 0.012, 0.058], 12, 5, SLOT.dark, () => solid(foot));
    tube([ring(0.05, 0.056 * P.legX, 0.066, lx, -0.005), ring(0.12, 0.054 * P.legX, 0.06, lx, -0.005), ring(0.2, 0.055 * P.legX, 0.059, lx, -0.004), ring(0.225, 0.057 * P.legX, 0.061, lx, -0.004)], segL, SLOT.shoes, (_x, y) => bootW(side, y));
  }

  // ---- head: lofted skull (flat temples, brow, cheekbones, tapering jaw, chin) + face features ----
  // Face front is at z ~ 0.097 at brow / eye level (the hair, brows and hats of HumanBody are built for that).
  const hx = P.headX;
  const hz = P.headZ;
  const headW = (): Weights => solid(BONE.head);
  // [y, half width, half depth, forward offset, squareness]
  const HEAD: [number, number, number, number, number][] = [
    [1.545, 0.02, 0.03, 0.052, 2],
    [1.56, 0.036, 0.05, 0.038, 2],
    [1.58, 0.054, 0.075, 0.016, 2.3],
    [1.6, 0.064, 0.088, 0.004, 2.2],
    [1.63, 0.073, 0.095, 0, 2.2],
    [1.66, 0.077, 0.098, -0.001, 2.1],
    [1.7, 0.078, 0.099, -0.002, 2.1],
    [1.74, 0.075, 0.097, -0.006, 2],
    [1.765, 0.062, 0.084, -0.011, 2],
    [1.782, 0.04, 0.058, -0.017, 2],
    [1.79, 0.018, 0.028, -0.02, 2],
  ];
  tube(HEAD.map(([y, rx, rz, cz, n]) => ({ y: y + HEAD_LIFT, rx: rx * hx, rz: rz * hz, cx: 0, cz: cz * hz, n })), lod ? 10 : 18, SLOT.skin, headW);
  const hs = (r: V3, p: V3, a: number, b: number, slot: number): void => ell([r[0] * hx, r[1], r[2] * hz], [p[0] * hx, p[1] + HEAD_LIFT, p[2] * hz], a, b, slot, headW);
  hs([0.0055, 0.017, 0.006], [0, 1.667, 0.097], 8, 6, SLOT.skin); // nose bridge
  hs([0.012, 0.011, 0.013], [0, 1.638, 0.105], 10, 7, SLOT.skin); // nose tip
  for (const sx of [-1, 1]) {
    hs([0.0075, 0.0065, 0.008], [sx * 0.0085, 1.635, 0.099], 7, 5, SLOT.skin); // nostril wings
    hs([0.011, 0.03, 0.02], [sx * 0.078, 1.665, -0.012], 8, 6, SLOT.skin); // ears
    hs([0.0105, 0.0072, 0.005], [sx * 0.033, 1.675, 0.092], 10, 7, SLOT.white); // eyes
    hs([0.0046, 0.0046, 0.003], [sx * 0.033, 1.675, 0.0955], 8, 6, SLOT.dark);
  }
  hs([0.056, 0.007, 0.011], [0, 1.694, 0.09], 10, 5, SLOT.skin); // brow ridge
  hs([0.021, 0.0055, 0.008], [0, 1.6045, 0.0865], 12, 6, SLOT.lips); // upper lip
  hs([0.019, 0.0065, 0.0085], [0, 1.5945, 0.0855], 12, 6, SLOT.lips); // lower lip
  hs([0.021, 0.0016, 0.004], [0, 1.5995, 0.089], 10, 4, SLOT.dark); // mouth line
  return parts;
}

/** Reflective vest bands + shoulder straps (static, not skinned; positions in the CHEST bone's space). */
export function buildStripes(type: BodyType): TubeData[] {
  const P = propsOf(type);
  const body = { sx: P.torsoX, sz: P.torsoZ };
  const band = (y: number): TubeData => tubeData(slice(TORSO, y - 0.0275, y + 0.0275, { ...body, grow: 0.016 }), SEG_BODY, false);
  const front = at(TORSO, 1.3);
  const strapZ = (front[2] + front[1]) * P.torsoZ + 0.016;
  const out = [band(1.1), band(1.3)];
  for (const sx of [-1, 1]) out.push(boxData(0.026, 0.31, 0.012, [sx * 0.087 * P.torsoX, 1.305, strapZ]));
  for (const t of out) for (let i = 1; i < t.pos.length; i += 3) t.pos[i] -= J.chest;
  return out;
}
