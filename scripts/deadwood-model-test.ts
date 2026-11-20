// Deadwood models (TreeKind.deadLog, TreeKind.leafLitter): size, triangle count, nothing below the ground. Run: npx tsx scripts/deadwood-model-test.ts
import { TreeAssets } from '../src/vegetation/TreeAssets';
import { TreeKind } from '../src/vegetation/TreeTypes';

const a = new TreeAssets();
let ok = true;
const want: Record<number, { name: string; maxTri: number; len: [number, number]; hgt: [number, number] }> = {
  [TreeKind.deadLog]: { name: 'deadLog', maxTri: 4000, len: [6, 9], hgt: [0.8, 2.8] },
  [TreeKind.leafLitter]: { name: 'leafLitter', maxTri: 300, len: [2, 3.2], hgt: [0.02, 0.3] },
};
for (const k of [TreeKind.deadLog, TreeKind.leafLitter]) {
  for (let d = 0; d < 2; d++) {
    const g = a.geometries[k][d];
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const tri = (g.index ? g.index.count : 0) / 3;
    const w = want[k];
    const lx = b.max.x - b.min.x, lz = b.max.z - b.min.z, ly = b.max.y;
    const len = Math.max(lx, lz);
    console.log(`${w.name} LOD${d}: ${tri} tri, size x ${lx.toFixed(2)} z ${lz.toFixed(2)} height ${ly.toFixed(2)}, lowest y ${b.min.y.toFixed(3)}`);
    if (tri > w.maxTri) { ok = false; console.log('FAIL: too many triangles'); }
    if (len < w.len[0] || len > w.len[1]) { ok = false; console.log('FAIL: length out of range'); }
    if (ly < w.hgt[0] || ly > w.hgt[1]) { ok = false; console.log('FAIL: height out of range'); }
    if (b.min.y < -0.2) { ok = false; console.log('FAIL: model goes below the ground'); }
  }
}
console.log(ok ? 'PASS deadwood models' : 'FAIL');
process.exit(ok ? 0 : 1);
