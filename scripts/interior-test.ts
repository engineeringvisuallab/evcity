// INTERIOR layout test: builds one building model and reports furniture that overlaps a wall, a stair or another piece. Wall / slab joints are ignored.
// Run: node --import ./scripts/img-stub.mjs --import tsx scripts/interior-test.ts [hospital|clinic]
import * as THREE from 'three';
// no browser here: textures are not needed for the layout
(THREE.TextureLoader.prototype as unknown as { load: () => THREE.Texture }).load = () => new THREE.Texture();
const which = process.argv[2] ?? 'clinic';
const mod = await import('../src/buildings/models/health');
const b = which === 'hospital' ? mod.buildHospital(0) : mod.buildClinic(0);
const S = b.info.solids;
console.log(`${which}: solids ${S.length}, doors ${b.info.doors.length}, height ${b.height}`);
const dims = (a: (typeof S)[number]): number[] => [a.hx * 2, a.hy * 2, a.hz * 2];
const isFurn = (a: (typeof S)[number]): boolean => Math.max(...dims(a)) < 2.6;
let bad = 0;
const e = 0.06;
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const a = S[i]!, c = S[j]!;
  if (a.yaw !== 0 || c.yaw !== 0) continue;
  if (!isFurn(a) && !isFurn(c)) continue;
  const ox = Math.min(a.x + a.hx, c.x + c.hx) - Math.max(a.x - a.hx, c.x - c.hx);
  const oy = Math.min(a.y + a.hy, c.y + c.hy) - Math.max(a.y - a.hy, c.y - c.hy);
  const oz = Math.min(a.z + a.hz, c.z + c.hz) - Math.max(a.z - a.hz, c.z - c.hz);
  if (ox > e && oy > e && oz > e) {
    bad++;
    if (bad <= 30) console.log(`OVERLAP y=${a.y.toFixed(1)} A(${a.x.toFixed(2)},${a.z.toFixed(2)} ${dims(a).map((v) => v.toFixed(2)).join('x')}) B(${c.x.toFixed(2)},${c.z.toFixed(2)} ${dims(c).map((v) => v.toFixed(2)).join('x')}) by ${ox.toFixed(2)}/${oz.toFixed(2)}`);
  }
}
console.log(bad ? `${bad} furniture overlaps` : 'no furniture overlaps');
for (const d of b.info.doors) console.log('door', JSON.stringify(d));
