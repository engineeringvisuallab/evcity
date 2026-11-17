// STEP 5.4 check (CP5.4, headless): can a car drive the whole ring on the physics ground? Outside the structures the car rides on the terrain
// heightfield (LOD0 grid = chunkSize / vertsPerSide, bilinear like Rapier's heightfield), so across the whole carriageway the collider height must
// match the road surface. On a structure the car rides on the deck trimesh (checked by ring-bridge-physics-check.ts).
// Run: npx tsx scripts/ring-drive-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const ring = net.roads.find((r) => r.name === 'M8')!;
const cs = Config.world.chunkSize / Config.lod.vertsPerSide[0];
const colH = (x: number, z: number): number => {
  const gx = Math.floor(x / cs), gz = Math.floor(z / cs);
  const fx = x / cs - gx, fz = z / cs - gz;
  const h = (i: number, j: number): number => gen.heightAt(i * cs, j * cs);
  const a = h(gx, gz), b = h(gx + 1, gz), c = h(gx, gz + 1), d = h(gx + 1, gz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
};
const W = ring.halfWidth + ring.shoulder; // pavement + shoulder, centreline to edge
let worst = 0, worstK = -1, worstU = 0, over = 0, total = 0, steps = 0, maxStep = 0;
// the outer 25 % of the half width is left out: the cut / fill slope starts at the pavement edge and a 3.9 m collider cell straddles it (that is a rounding of the edge, not a hole)
const offsets = [-0.75 * W, -0.5 * W, -0.25 * W, 0, 0.25 * W, 0.5 * W, 0.75 * W];
const badPts: number[] = [];
let prev: number | null = null;
for (let k = 0; k < ring.xs.length; k++) {
  if (ring.bridgeOf[k] >= 0) { prev = null; continue; }
  for (const u of offsets) {
    const x = ring.xs[k] + ring.nx[k] * u, z = ring.zs[k] + ring.nz[k] * u;
    const e = Math.abs(colH(x, z) - ring.ys[k]);
    total++;
    if (e > 0.25) { over++; if (badPts[badPts.length - 1] !== k) badPts.push(k); }
    if (e > worst) { worst = e; worstK = k; worstU = u; }
  }
  const x0 = ring.xs[k] + ring.nx[k] * 6, z0 = ring.zs[k] + ring.nz[k] * 6; // a lane line
  const h0 = colH(x0, z0);
  if (prev !== null) { const st = Math.abs(h0 - prev); steps++; if (st > maxStep) maxStep = st; }
  prev = h0;
}
let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail}`); };
console.log(`RING DRIVE CHECK  ring ${ring.length.toFixed(0)} m, ${ring.xs.length} points, collider grid ${cs.toFixed(2)} m`);
check(worst <= 0.3, 'collider height = road height across the whole pavement', `worst ${worst.toFixed(2)} m at point ${worstK}, u ${worstU.toFixed(1)} m; ${over}/${total} samples over 0.25 m`);
check(maxStep <= 0.7, 'no step along the lane between neighbouring points (8 m)', `largest ${maxStep.toFixed(2)} m (4 % grade = 0.32 m)`);
// group the bad points into stretches
const stretches: string[] = [];
for (let i = 0; i < badPts.length;) { let j = i; while (j + 1 < badPts.length && badPts[j + 1] - badPts[j] <= 2) j++; stretches.push(`${badPts[i]}-${badPts[j]} (${((badPts[j] - badPts[i] + 1) * ring.length / ring.xs.length).toFixed(0)} m)`); i = j + 1; }
check(stretches.length === 0, 'no stretch where the pavement hangs over lower ground', stretches.length ? stretches.join(', ') : 'none');
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
