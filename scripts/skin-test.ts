import { ARM, BONE_COUNT, LEG, NECK, TORSO, armW, legW, neckW, skinArrays, skirtW, slice, torsoW, tubeData, type Ring, type Weights } from '../src/people/SkinMath';

/** Skinned human maths: every tube is closed + outward facing, indices are valid, every vertex's weights sum to 1. */
function volume(rings: Ring[], seg: number): { v: number; tris: number; verts: number; maxIdx: number; pos: Float32Array } {
  const t = tubeData(rings, seg, true);
  let v = 0;
  const p = t.pos;
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = t.idx[i] * 3, b = t.idx[i + 1] * 3, c = t.idx[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return { v, tris: t.idx.length / 3, verts: p.length / 3, maxIdx: Math.max(...t.idx), pos: p };
}

let fail = 0;
let tris = 0;
const check = (name: string, rings: Ring[], seg: number, fn: (x: number, y: number, z: number) => Weights): void => {
  const r = volume(rings, seg);
  const s = skinArrays(r.pos, fn);
  let bad = 0;
  for (let i = 0; i < r.verts; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      sum += s.weight[i * 4 + k];
      if (s.index[i * 4 + k] >= BONE_COUNT) bad++;
    }
    if (Math.abs(sum - 1) > 1e-5) bad++;
  }
  const ok = r.v > 0 && r.maxIdx < r.verts && bad === 0;
  if (!ok) fail++;
  tris += r.tris;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(8)} ${r.verts} verts ${r.tris} tris volume ${r.v.toFixed(5)}`);
};

check('pants', slice(TORSO, 0.84, 1.0), 18, (_x, y) => torsoW(y));
check('shirt', slice(TORSO, 0.985, 1.56, { grow: 0.008 }), 18, (_x, y) => torsoW(y));
check('neck', slice(NECK, 1.5, 1.63), 12, (_x, y) => neckW(y));
for (const side of ['L', 'R'] as const) {
  const cx = side === 'L' ? -0.285 : 0.285;
  check('sleeve' + side, slice(ARM, 1.215, 1.49, { grow: 0.004, cx }), 12, (_x, y) => armW(side, y));
  check('arm' + side, slice(ARM, 0.89, 1.225, { cx }), 12, (_x, y) => armW(side, y));
  check('leg' + side, slice(LEG, 0.09, 0.93, { cx: side === 'L' ? -0.095 : 0.095 }), 18, (_x, y) => legW(side, y));
}
// panjabi / lungi skirts: closed, outward, weights sum to 1, and the hem follows the thigh of the same side
const skirt: Ring[] = [0.31, 0.55, 0.75, 0.9, 0.99, 1.06].map((y) => ({ y, rx: 0.17, rz: 0.12, cx: 0, cz: 0 }));
check('skirt', skirt, 18, (x, y) => skirtW(x, y, 0.31, 0.85));
const hemL = skirtW(-0.15, 0.31, 0.31, 0.85);
const hemR = skirtW(0.15, 0.31, 0.31, 0.85);
if (!(hemL.some(([b, w]) => b === 11 && w > 0.5) && hemR.some(([b, w]) => b === 14 && w > 0.5))) {
  fail++;
  console.log('FAIL skirt hem does not follow the legs');
} else console.log('OK   skirt hem follows the left / right thigh');
console.log(`tube triangles (without face / hands / shoes): ${tris}`);
if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log('skin-test OK');
