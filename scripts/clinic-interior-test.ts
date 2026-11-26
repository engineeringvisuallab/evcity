// CLINIC INTERIOR layout test: builds the clinic and reports solids that overlap each other (furniture inside a wall, a stair, another piece) and doors.
// Run: node --import ./scripts/img-stub.mjs --import tsx scripts/clinic-interior-test.ts
import * as THREE from 'three';
// no browser here: textures are not needed for the layout
(THREE.TextureLoader.prototype as unknown as { load: () => THREE.Texture }).load = () => new THREE.Texture();
const { buildClinic } = await import('../src/buildings/models/health');
const b = buildClinic(0);
const S = b.info.solids;
console.log(`solids ${S.length}, doors ${b.info.doors.length}, height ${b.height}`);
let bad = 0;
const e = 0.06;
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const a = S[i]!, c = S[j]!;
  if (a.yaw !== 0 || c.yaw !== 0) continue;
  const ox = Math.min(a.x + a.hx, c.x + c.hx) - Math.max(a.x - a.hx, c.x - c.hx);
  const oy = Math.min(a.y + a.hy, c.y + c.hy) - Math.max(a.y - a.hy, c.y - c.hy);
  const oz = Math.min(a.z + a.hz, c.z + c.hz) - Math.max(a.z - a.hz, c.z - c.hz);
  if (ox > e && oy > e && oz > e) {
    bad++;
    if (bad <= 25) console.log(`OVERLAP ${i}/${j}: A(${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)} h${(a.hx * 2).toFixed(2)}x${(a.hy * 2).toFixed(2)}x${(a.hz * 2).toFixed(2)}) B(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)} h${(c.hx * 2).toFixed(2)}x${(c.hy * 2).toFixed(2)}x${(c.hz * 2).toFixed(2)}) by ${ox.toFixed(2)}/${oy.toFixed(2)}/${oz.toFixed(2)}`);
  }
}
console.log(bad ? `${bad} overlaps` : 'no overlaps');
for (const d of b.info.doors) console.log('door', JSON.stringify(d));
