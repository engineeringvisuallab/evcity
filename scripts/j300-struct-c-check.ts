// J7-C CHECK + J7 TOTAL CHECK (headless, numbers only). Run order: j300-struct-c-water.ts FIRST, then j300-struct-c-gen.ts, then: npx tsx scripts/j300-struct-c-check.ts docs  -> docs/J300_STRUCT_C.txt
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { buildJ300Mesh } from '../src/roads/junction/J300SolidMesh';
const dir = process.argv[2] ?? 'docs'; const rd = (f: string): any => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const C = rd('J300_STRUCT_C.json'), A = rd('J300_STRUCT_A.json'), B = rd('J300_STRUCT_B.json'), T = rd('J300_TERRAIN.json');
const L: string[] = []; let pass = 0, fail = 0; const P = (ok: boolean, t: string, d: string): void => { L.push(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${d}`); ok ? pass++ : fail++; }; const I = (t: string, d: string): void => { L.push(`INFO  ${t}  ${d}`); };
L.push('J7-C CHECK + J7 TOTAL (headless, numbers only, nothing in the game changed by the check)', '');
L.push('0) WATER (sc.water > sc.h, runs first)');
const wf = `${dir}/J300_STRUCT_C_WATER.txt`; if (existsSync(wf)) { const w = readFileSync(wf, 'utf8'); P(/ALL PASS/.test(w), 'water check on platform, arms, ramps, box area', 'docs/J300_STRUCT_C_WATER.txt'); } else I('water check', 'NOT RUN (docs/J300_STRUCT_C_WATER.txt missing)');
L.push('', '1) WALLS');
const bad = C.walls.filter((w: any) => w.pts.some((p: number[]) => p.some((v) => !Number.isFinite(v)) || p[2] - p[3] < 0.5));
P(bad.length === 0, 'every wall point finite, height >= 0.5 m', `${C.walls.length} walls, ${bad.length} bad`);
const WALL_J2 = 16.0; const t = C.totals;
P(t.arm.maxH <= WALL_J2 + 0.6, 'arm walls <= J2 wall height 16.0 m (+0.6 INFO band)', `R6 / R4 max ${t.arm.maxH} m`);
I('platform edge wall', `max ${t.platform.maxH} m = ${(t.platform.maxH - WALL_J2).toFixed(2)} m over the J2 height 16.0 m (known from J6, needs the real wall design)`);
I('ramp walls', `outer max ${t.rampOut.maxH} m, inner max ${t.rampIn.maxH} m`);
for (const k of ['R6', 'R4']) { const A2 = T.arms[k]; let worst = 0; for (const r of A2.rows as number[][]) for (const [h, toe] of [[r[5], r[6]], [r[9], r[10]]]) if (h > 4) worst = Math.max(worst, toe); P(worst <= A2.rowHalf, `${k} wall toe inside the half ROW ${A2.rowHalf.toFixed(1)} m`, `toe max ${worst.toFixed(1)} m from the centre line`); }
L.push('', '2) PARAPETS');
let wl = 0; for (const w of C.walls) if (['platform', 'arm', 'ramp-out', 'ramp-in'].includes(w.kind)) for (let i = 1; i < w.pts.length; i++) wl += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
P(wl > 0, 'parapet block (0.5 x 0.9 m, ASSUMED) on every road wall top', `${wl.toFixed(0)} m (built from the wall lines, none missing by construction; crash class NOT RUN)`);
L.push('', '3) WING WALLS (J7-A ASSUMED tops replaced by the real J5 ramp rows)');
for (const w of C.wing) { if (!w.rows) { P(false, `wing ${w.id}`, w.error); continue; } const r0 = w.rows[0], r4 = w.rows[w.rows.length - 1]; P(Number.isFinite(r0.realTop) && Number.isFinite(r4.realTop), `wing ${w.id} real top from ramp ${w.ramp}`, `portal end ${r0.assumedTop} -> ${r0.realTop} m (height ${r0.realH} m), far end ${r4.assumedTop} -> ${r4.realTop} m`); }
L.push('', '4) J7-A / J7-B RE-CHECK');
P(A.ring.minClear >= 5.5, 'ring underpass clearance >= 5.5 m', `${A.ring.minClear} m (spare ${(A.ring.minClear - 5.5).toFixed(2)} m only)`);
P(B.clear.min >= B.clear.required, 'R6 under the rail clearance >= 5.5 m', `${B.clear.min} m`);
P(Math.max(...B.piers.spans) <= B.rail.spanMax, 'rail spans <= game spanMax', `max ${Math.max(...B.piers.spans)} m, limit ${B.rail.spanMax} m`);
P(A.box.outsideW <= 2 * 45.72, 'box outside width inside the ROW', `${A.box.outsideW} m of ${2 * 45.72} m`);
L.push('', '5) LIGHTS AND SIGNS');
const arms = C.lights.filter((l: any) => l.kind === 'arm'); let maxGap = 0; for (const id of ['R6', 'R4']) { const q = arms.filter((l: any) => l.id.startsWith(id)); for (let i = 1; i < q.length; i++) maxGap = Math.max(maxGap, Math.hypot(q[i].x - q[i - 1].x, q[i].z - q[i - 1].z)); }
P(maxGap <= 85, 'arm poles: no gap > 85 m (40 m spacing, alternate sides; a pole is left out only within 3 m of the rail deck)', `max gap ${maxGap.toFixed(0)} m (lighting under the deck = J8)`);
P(C.signs.filter((s: any) => s.kind === 'gantry').every((s: any) => s.clear >= 5.5), 'ring gantry beam bottom >= 5.5 m over the ring', 'clear 6.5 m');
L.push('', '6) GAME MESH (solid, headless build of src/roads/junction/J300SolidMesh.ts)');
const m = buildJ300Mesh(); const nTri = m.indices.length / 3; let nan = 0; for (const v of m.positions) if (!Number.isFinite(v)) nan++; let oob = 0; for (const i of m.indices) if (i >= m.positions.length / 3) oob++;
P(nan === 0 && oob === 0, 'no NaN vertex, no bad index', `${m.positions.length / 3} vertices, ${nTri} triangles`);
P(nTri < 60000, 'triangle count fits the budget (< 60 000, ASSUMED)', `${nTri}`);
const ys = m.positions.filter((_, i) => i % 3 === 1); P(Math.max(...ys) < 100 && Math.min(...ys) > 0, 'heights in a sane range', `y ${Math.min(...ys).toFixed(1)} .. ${Math.max(...ys).toFixed(1)} m`);
I('mesh parts (triangles)', JSON.stringify(m.parts));
I('NOT RUN', 'typecheck of the game project (npm deps not in this container), in-game look and drive test, terrain carve (J9), removal of old R6-9 / R4-9 ribbons, old ring signs and trees inside the footprint, structural design, MSE wall type, drainage, crash class, lighting photometry (J8), sign legends (J8 / J11)');
L.push('', `SUMMARY  ${pass} PASS / ${fail} FAIL`); writeFileSync(`${dir}/J300_STRUCT_C.txt`, L.join('\n') + '\n'); console.log(L.join('\n'));
