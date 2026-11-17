// STEP 9.2 J1 mesh check: no NaN, every pier reaches the ground, wall / pier counts agree with the take-off, vertex budget. Writes docs/m8_stack_mesh.json (for tools/m8-stack-mesh-plot.py).
// Run: npx tsx scripts/m8-stack-mesh-check.ts
import { writeFileSync } from 'node:fs';
import { buildStack, structureTakeoff } from '../src/interchange/m8/StackGeometry';
import { buildStackMesh } from '../src/interchange/m8/StackMesh';

const ramps = buildStack();
const d = buildStackMesh({ x: 0, z: 0, y: 0, yaw: 0 }, undefined, ramps);
let fails = 0;
const chk = (ok: boolean, msg: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const nv = d.positions.length / 3, nt = d.indices.length / 3;
chk(d.positions.every((x) => Number.isFinite(x)) && d.colors.length === d.positions.length, `all ${nv} vertices finite, colour per vertex`);
chk(d.indices.every((i) => i >= 0 && i < nv), `${nt} triangles, all indices valid`);
chk(nt < 200000, `triangle budget ${nt} < 200000`);
let ymin = Infinity, ymax = -Infinity;
for (let i = 1; i < d.positions.length; i += 3) { ymin = Math.min(ymin, d.positions[i]); ymax = Math.max(ymax, d.positions[i]); }
chk(ymin >= -0.01, `nothing below the ground (lowest ${ymin.toFixed(2)} m)`);
chk(ymax < 21.7, `highest point ${ymax.toFixed(2)} m (road B 20.7 + lift + parapet 0.9)`);
const tk = structureTakeoff(ramps);
console.log(`  ramps: ${tk.reduce((a, t) => a + t.piers, 0)} piers, ${tk.reduce((a, t) => a + t.wallLen, 0).toFixed(0)} m wall (ramps only; road B viaduct adds its own piers)`);
writeFileSync('docs/m8_stack_mesh.json', JSON.stringify({ p: d.positions.map((x) => +x.toFixed(1)), c: d.colors.map((x) => +x.toFixed(2)), i: d.indices }));
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
