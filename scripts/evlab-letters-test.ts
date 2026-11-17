// EVLab Step RT5: the lettering "Engineering Visual Lab EVLab" on the 4 tower faces (plan only: pure numbers, no three.js drawing).
// npx tsx scripts/evlab-letters-test.ts   (the plan imports EVLabTowerLayout, which imports three at load: run it where `npm install` was done)
import { SETBACKS, T, levelY } from '../src/evlab/EVLabTowerLayout';
import { BAND_H, BAND_Y0, BAND_Y1, FACES, FACE_LAYOUT, LAYOUTS, LEDGE_OUT, LETTER_BAND, LETTER_OFFSET, blockHeight, faceLength, letterQuads, lineTops, lineWidthEst } from '../src/evlab/EVLabLettersPlan';
import { EVLAB_YAW, localToWorld } from '../src/evlab/EVLabSite';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const Q = letterQuads();
const nLev = LETTER_BAND.n1 - LETTER_BAND.n0 + 1;
console.log(`band levels ${LETTER_BAND.n0}..${LETTER_BAND.n1}: y ${BAND_Y0.toFixed(1)}..${BAND_Y1.toFixed(1)} m (${BAND_H.toFixed(1)} m), ${Q.length} quads`);

// 1 where
ok(LETTER_BAND.n0 >= 2 && LETTER_BAND.n1 < SETBACKS[0], `band is above the podium roof (level 1) and below the first set-back (level ${SETBACKS[0]})`);
ok(Math.abs(BAND_Y1 - (levelY(LETTER_BAND.n1 + 1))) < 1e-9, 'the band ends exactly at the next slab');
ok(Q.length === nLev * 4 && FACES.every((f) => Q.filter((q) => q.face === f).length === nLev), `${nLev} quads on each of the 4 faces`);

// 2 text fits (block in the band, each line in the texture and in the face)
for (const kind of ['side', 'wide'] as const) {
  const L = LAYOUTS[kind];
  const tops = lineTops(L);
  ok(blockHeight(L) <= BAND_H - 2 * 3, `${kind}: block ${blockHeight(L).toFixed(1)} m high, >= 3 m free above and below (band ${BAND_H.toFixed(1)} m)`);
  ok(tops[0] >= 3 && tops[tops.length - 1] + L.lines[L.lines.length - 1].cap <= BAND_H - 3, `${kind}: first line starts ${tops[0].toFixed(1)} m below the band top`);
  const wMax = Math.max(...L.lines.map(lineWidthEst));
  ok(wMax <= L.W * 0.94, `${kind}: widest line ${wMax.toFixed(1)} m <= 94% of the texture width ${L.W} m`);
  const minFace = Math.min(...FACES.filter((f) => FACE_LAYOUT[f] === kind).flatMap((f) => Array.from({ length: nLev }, (_, i) => faceLength(f, LETTER_BAND.n0 + i))));
  ok(L.W <= minFace + 0.01, `${kind}: texture width ${L.W} m fits the straight glass (shortest ${minFace.toFixed(1)} m)`);
  console.log(`   ${kind}: capitals ${L.lines.map((l) => l.cap).join(' / ')} m`);
}

// 3 geometry: outward, in front of the ledges, not mirrored, centred
let outward = true, mirrored = false, centred = true, normalOk = true, vOk = true;
for (const q of Q) {
  const [a, b, c] = [q.p[0], q.p[1], q.p[2]];
  // triangle (a, c, b)... same index order as the glass loft: base, base + 3, base + 2 -> (p0, p3, p2); its normal
  const e1 = [q.p[3][0] - a[0], q.p[3][1] - a[1], q.p[3][2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const len = Math.hypot(nx, nz);
  if (Math.abs(nx / len - q.n[0]) > 1e-6 || Math.abs(nz / len - q.n[1]) > 1e-6) normalOk = false;
  const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
  if ((mx - T.cx) * q.n[0] + (mz - 20) * q.n[1] <= 0) outward = false;
  const right: [number, number] = [q.n[1], -q.n[0]]; // the viewer's right hand (looking at the face, up = +y)
  const along = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[1];
  const du = q.uv[1][0] - q.uv[0][0], W = LAYOUTS[FACE_LAYOUT[q.face]].W;
  if (du * along <= 0 || Math.abs(Math.abs(du * W) - Math.abs(along)) > 1e-6) mirrored = true;
  if (Math.abs(q.uv[0][0] + q.uv[1][0] - 1) > 1e-6) centred = false;
  if (q.uv[0][1] < -1e-9 || q.uv[3][1] > 1 + 1e-9 || q.uv[3][1] <= q.uv[0][1]) vOk = false;
}
ok(normalOk, 'the winding (same index order as the glass loft) gives the outward normal');
ok(outward, 'every quad faces away from the tower');
ok(!mirrored, 'text reads left to right for a person in front of each face (u grows to the right, 1 m = 1 m)');
ok(centred, 'the text is centred on every face and level');
ok(vOk, 'v runs 0..1 up the band');
ok(LETTER_OFFSET > LEDGE_OUT + 0.1, `strip ${LETTER_OFFSET} m in front of the glass, ledges stick out ${LEDGE_OUT} m`);
// the quads follow the lean of the facade level by level (the south face moves in with height)
const zS = (n: number): number => Q.find((q) => q.face === 'S' && q.level === n)!.p[0][2];
console.log(`   the south face leans ${(zS(LETTER_BAND.n0) - zS(LETTER_BAND.n1)).toFixed(2)} m over the band; the strip follows it level by level`);

// 4 campus frame: faces turn with the building (EVLabSite), no manual offset
const [ox, oz] = localToWorld(0, 0), [tx, tz] = localToWorld(0, 1);
const sx = tx - ox, sz = tz - oz;
console.log(`   yaw ${(EVLAB_YAW * 180 / Math.PI).toFixed(1)} deg; south face looks to world (${sx.toFixed(3)}, ${sz.toFixed(3)}), J1 E arm direction is (0.793, 0.609)`);
ok(sx * 0.793 + sz * 0.609 > 0.99, 'the south face (and its lettering) looks along the J1 E arm direction (gate side)');

// 5 budget
console.log(`   cost: 2 meshes (2 draw calls), ${Q.length * 2} triangles, 2 canvas textures 1024 x ~${Math.round(1024 * BAND_H / LAYOUTS.side.W)} / ${Math.round(1024 * BAND_H / LAYOUTS.wide.W)}, no light, no shadow, no per-frame work`);
ok(Q.length * 2 <= 200, 'under 200 triangles');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
