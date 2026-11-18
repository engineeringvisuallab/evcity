// STEP 21.7-5 SIGHT TRIANGLES OF THE 5 SKEWED T JUNCTIONS (headless, READ ONLY: changes NO src file and NO data file; writes docs/STEP_21_7_5_OUTPUT.txt + docs/centre_junction_sight.json).
// The skew sight distances of 21.50 are longer than the 90 deg ones that 21.7-2 checked. Here the NEW triangle (decision point D on the minor axis, the node, the far point E at the skew sight distance on the major road, both sides)
// is checked against (1) buildings (same rule as 21.7-2: a building rectangle within 0.5 m of a grid point of the triangle) and (2) natural ground: line of sight from eye 1.08 m at D to a car 1.08 m high at E,
// the natural ground between them must not rise above that line. NATURAL GROUND ONLY: the real road level (cut / fill, 21.12) is NOT used, so a hill hit is a LIST for the user, not a final FAIL of the road.
// Decision point D = stop line distance of 21.50 + SIGHT_SETBACK (4.5 m, 21.7-2). Constants are my choices and printed.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-junction-sight.ts docs
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
const OUT = process.argv[2] ?? 'docs';
const hyp = Math.hypot, f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);
const SETBACK = 4.5, EYE = 1.08, OBJ = 1.08, STEP = 3, TOL = 0.0;
const sk = JSON.parse(readFileSync(`${OUT}/centre_junction_skew.json`, 'utf8')), g = JSON.parse(readFileSync(`${OUT}/centre_junction_geom.json`, 'utf8'));
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const hAt = (x: number, z: number): number => { gen.sample(x, z, sc); return sc.h; };
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
function bldDist(b: any, x: number, z: number): number { const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, lx = dx * co - dz * si, lz = dx * si + dz * co; return hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)); }
function gridTri(a: number[], b: number[], c: number[]): number[][] {
  const out: number[][] = [], n = Math.ceil(Math.max(hyp(b[0] - a[0], b[1] - a[1]), hyp(c[0] - a[0], c[1] - a[1])) / STEP);
  for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) { const u = i / n, v = j / n; out.push([a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1])]); }
  return out;
}
pr('STEP 21.7-5 SIGHT TRIANGLES OF THE SKEWED T JUNCTIONS (headless, read only; src / data NOT changed; tsc / build / game NOT RUN)');
pr(`constants (MY choices): decision point = stop line + ${SETBACK} m; eye ${EYE} m, object ${OBJ} m; grid ${STEP} m; natural ground only`);
pr();
const rows: any[] = [];
for (const n of sk.nodes) {
  const t = g.tjunctions.find((q: any) => q.id === n.id), a = t.majorDir as number[], u = t.minorDir as number[];
  const c0 = [t.x, t.z], D = [t.x + u[0] * (n.stopLineM + SETBACK), t.z + u[1] * (n.stopLineM + SETBACK)];
  const sides: any[] = [];
  for (const sg of [1, -1]) {
    const E = [t.x + a[0] * n.isdSkew * sg, t.z + a[1] * n.isdSkew * sg]; const hit = new Set<string>();
    for (const p of gridTri(D, c0, E)) for (const b of RECTS) { if (Math.abs(b.x - t.x) > 300 || Math.abs(b.z - t.z) > 300) continue; if (bldDist(b, p[0], p[1]) <= 0.5) hit.add(String(b.id)); }
    // natural-ground line of sight D -> E
    const hD = hAt(D[0], D[1]) + EYE, hE = hAt(E[0], E[1]) + OBJ, len = hyp(E[0] - D[0], E[1] - D[1]); let rise = -Infinity, at = 0;
    for (let s = STEP; s < len; s += STEP) { const k = s / len, x = D[0] + k * (E[0] - D[0]), z = D[1] + k * (E[1] - D[1]), line = hD + k * (hE - hD), over = hAt(x, z) - line; if (over > rise) { rise = over; at = s; } }
    sides.push({ side: sg > 0 ? '+' : '-', buildings: [...hit], groundRise: +Math.max(0, rise - TOL).toFixed(2), atM: +at.toFixed(0) });
  }
  const r = { id: n.id, phi: n.phi, isd: n.isdSkew, sides, bldFit: sides.every((s) => s.buildings.length === 0), groundFit: sides.every((s) => s.groundRise <= 0.05) };
  rows.push(r);
  pr(`   ${n.id}  ${f1(n.phi)} deg  sight ${f0(n.isdSkew)} m   ` + sides.map((s) => `side ${s.side}: buildings ${s.buildings.length ? s.buildings.join(',') : 'none'}, natural ground above the line ${s.groundRise} m${s.groundRise > 0.05 ? ' at ' + s.atM + ' m' : ''}`).join('   |   '));
}
pr();
chk(rows.length === 5 && rows.every((r) => r.bldFit), `every new sight triangle is free of buildings  [${rows.filter((r) => !r.bldFit).length} FAIL: ${rows.filter((r) => !r.bldFit).map((r) => r.id + ' ' + r.sides.flatMap((s: any) => s.buildings).join(',')).join('; ')}]`);
const gr = rows.filter((r) => !r.groundFit);
chk(gr.length === 0, `natural ground does not block the line of sight  [${gr.length} FAIL = LIST for the user, natural ground only, the real road level is not used: ${gr.map((r) => r.id + ' ' + r.sides.filter((s: any) => s.groundRise > 0.05).map((s: any) => 'side ' + s.side + ' +' + s.groundRise + ' m at ' + s.atM + ' m').join(', ')).join('; ')}]`);
pr();
pr(`SUMMARY 21.7-5: ${pass} PASS, ${fail} FAIL`);
writeFileSync(`${OUT}/STEP_21_7_5_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_junction_sight.json`, JSON.stringify({ note: 'STEP 21.7-5 sight triangles of the skewed T junctions', constants: { SETBACK, EYE, OBJ, STEP }, nodes: rows }) + '\n');
process.exit(fail === 0 ? 0 : 1);
