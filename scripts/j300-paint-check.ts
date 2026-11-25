// J8 CHECK (headless, numbers only). Run order: j300-struct-c-water.ts FIRST, then: npx tsx scripts/j300-paint-check.ts docs -> docs/J300_PAINT.txt
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { buildJ300Paint } from '../src/roads/junction/J300Paint';
import { J300_STRUCT_C as C } from '../src/roads/junction/J300StructC';
const dir = process.argv[2] ?? 'docs'; const L: string[] = []; let pass = 0, fail = 0;
const P = (ok: boolean, t: string, d: string): void => { L.push(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${d}`); ok ? pass++ : fail++; }; const I = (t: string, d: string): void => { L.push(`INFO  ${t}  ${d}`); };
L.push('J8 CHECK: markings, islands, gore (headless, numbers only, nothing in the game changed by the check)', '');
const wf = `${dir}/J300_STRUCT_C_WATER.txt`; if (existsSync(wf)) P(/ALL PASS/.test(readFileSync(wf, 'utf8')), 'water check first (sc.water > sc.h)', wf); else I('water check', 'NOT RUN');
const d = buildJ300Paint(); const n = d.positions.length / 3; const st = d.stats;
let nan = 0; for (const v of d.positions) if (!Number.isFinite(v)) nan++; let oob = 0; for (const i of d.indices) if (i >= n) oob++;
P(nan === 0 && oob === 0, 'no NaN vertex, no bad index', `${n} vertices, ${d.indices.length / 3} triangles`);
P(d.indices.length / 3 < 40000, 'triangle count fits the budget (< 40 000, ASSUMED)', `${d.indices.length / 3}`);
L.push('', 'ITEMS (counts of drawn elements)');
const need: [string, number][] = [['circle edge lines', 2], ['circle lane lines', 2], ['leg edge lines', 8], ['leg lane lines', 4], ['entry arrows', 4], ['yield lines', 2], ['zebra bars', 40], ['islands', 2], ['island kerb segments', 50], ['ramp edge lines', 8], ['gore wedges', 4], ['gore chevrons', 8], ['arm edge lines', 4], ['arm median lines', 4]];
for (const [k, min] of need) P((st[k] ?? 0) >= min, `${k} >= ${min}`, `${st[k] ?? 0}`);
L.push('', 'LEVEL (paint sits on the road surface, nearest surface row level + 0.04 m, island + 0.15 m)');
const ys = d.positions.filter((_, i) => i % 3 === 1); P(Math.min(...ys) > 15 && Math.max(...ys) < 100, 'paint heights in a sane range', `y ${Math.min(...ys).toFixed(1)} .. ${Math.max(...ys).toFixed(1)} m`);
// off-road test: every vertex must be within 2 m of the deck disc, an arm ribbon (half top + 1) or a ramp ribbon
const cx = C.deck.cx, cz = C.deck.cz; const arms = C.surfArms.map((a) => ({ top: a.top, pts: a.pts })); const ramps = C.surfRamps.map((r) => r.rows.map((q) => [(q[2] + q[4]) / 2, (q[3] + q[5]) / 2]));
const segD = (x: number, z: number, a: number[], b: number[]): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const used = new Uint8Array(n); for (const i of d.indices) used[i] = 1;
let off = 0; let sampled = 0; for (let i = 0; i < n; i += 4) { if (!used[i]) continue; sampled++; const x = d.positions[i * 3], z = d.positions[i * 3 + 2]; if (Math.hypot(x - cx, z - cz) <= 63) continue; let ok = false;
  for (const a of arms) { for (let k = 0; k < a.pts.length - 1 && !ok; k++) if (segD(x, z, a.pts[k], a.pts[k + 1]) <= a.top + 1) ok = true; if (ok) break; }
  if (!ok) for (const r of ramps) { for (let k = 0; k < r.length - 1 && !ok; k++) if (segD(x, z, r[k], r[k + 1]) <= 12) ok = true; if (ok) break; }
  if (!ok) off++; }
P(off === 0, 'every paint point lies on the deck, an arm ribbon or within 12 m of a ramp centre line (gore wedge = the only new paving)', `${off} of ${sampled} sampled drawn vertices off the surface`);
I('CLIPPED PAINT', `${st['quads clipped (no road surface under)']} paint quads were not drawn because no J7-C road surface is under them: the J4 entry / exit flares near the circle (r 62 .. 70 m, up to 22 m from the arm axis) are WIDER than the M6 / M4 arm ribbon and have no retaining wall in J7-C. FINDING for J7-C / J9, NOT fixed here`);
I('gore wedge', 'new asphalt strip between the ring edge and the ramp inner edge (width 6 m at 60 m before the nose, 0 at the nose); NO collision (paint mesh), terrain / ring embankment under it not checked');
I('NOT RUN', 'in-game look, typecheck of the game project (npm deps not in this container), zebra / arrow legal layout review, sight cones with signs and walls (J8 note from J3), lighting photometry, box lane marking (the existing ring markings are assumed to run through the box, NOT checked), removal of the J7-C arm ribbon width inside the junction reach (arm ribbon is M6 / M4 wide there, J4 carriageways are narrower: decision for the user)');
L.push('', `SUMMARY  ${pass} PASS / ${fail} FAIL`); writeFileSync(`${dir}/J300_PAINT.txt`, L.join('\n') + '\n'); console.log(L.join('\n'));
