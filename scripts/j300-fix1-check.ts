// J300-FIX-1 check: no wall / parapet of the J300 mesh stands inside the circulating carriageway (r < deck.ro = 62 m, the outer edge of the carriageway; the shoulder 62..62.6 and the parapet that sits 0.5 m behind a wall face are allowed). Run: npx tsx scripts/j300-fix1-check.ts
import { J300_STRUCT_C as C } from '../src/roads/junction/J300StructC';
import { buildJ300Mesh } from '../src/roads/junction/J300SolidMesh';
const D = C.deck;
const m = buildJ300Mesh();
const [t0, t1] = m.parts.concrete;
let inside = 0, worst = 1e9, boxTris = 0;
for (let t = t0; t < t1; t++) {
  let rmin = 1e9, ymax = -1e9;
  for (let k = 0; k < 3; k++) { const v = m.indices[t * 3 + k]; const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2]; rmin = Math.min(rmin, Math.hypot(x - D.cx, z - D.cz)); ymax = Math.max(ymax, y); }
  if (ymax > D.y + 0.05 && rmin < D.ro - 0.05) { inside++; worst = Math.min(worst, rmin); } // above the deck surface and inside the deck circle
  if (rmin < D.ro - 0.05) boxTris++;
}
console.log(`INFO concrete triangles ${t1 - t0}, inside the deck circle (any height) ${boxTris} (box walls / roof lie under the deck, allowed)`);
console.log(inside === 0 ? 'PASS no wall or parapet above the deck surface inside r < ' + D.ro : `FAIL ${inside} concrete triangles above the deck inside the circle, nearest r ${worst.toFixed(1)}`);
process.exit(inside === 0 ? 0 : 1);
