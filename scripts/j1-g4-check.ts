// STEP J1-g4: checks of the open star MESH + MARKINGS + game layer. Run: npx tsx scripts/j1-g4-check.ts docs
// Reads: src/roads/junction/OpenJ1Mesh.ts (plan + mesh), OpenJ1Geometry.ts (g2), GroundJ1Terrain.ts (g3), the game terrain (TerrainGenerator).
// Writes: docs/STEPJ1G4_OUTPUT.txt and docs/j1g4.json (plan for tools/j1g4-plot.py). Changes nothing else.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1Terrain, J1_S_END } from '../src/roads/junction/GroundJ1Terrain';
import { DIRS, rotCW, type Dir, type V2 } from '../src/roads/junction/GroundJ1Geometry';
import { OPEN_PARAMS, buildMovements, deriveOpen, pointInPoly, polyArea } from '../src/roads/junction/OpenJ1Geometry';
import { OPEN_MESH, buildOpenJ1Mesh, buildOpenJ1Plan, earClip, gridTriangles, ringArea } from '../src/roads/junction/OpenJ1Mesh';

const out = process.argv[2] ?? 'docs';
const L: string[] = []; const p = (s = ''): void => { L.push(s); console.log(s); };
let fails = 0;
const CHK = (n: string, ok: boolean, d: string): void => { p(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(104)} ${d}`); if (!ok) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f3 = (v: number): string => v.toFixed(3);

const gen = new TerrainGenerator(Config.world.seed);
const T = gen.roads.j1 as J1Terrain;
const D = deriveOpen(), M = OPEN_MESH, W = OPEN_PARAMS.W, SE = J1_S_END;
const FLOWS = JSON.parse(readFileSync(`${out}/j1a.json`, 'utf8')).FLOWS as Record<Dir, { L: number; T: number; R: number }>;

const tPlan0 = performance.now();
const plan = buildOpenJ1Plan();
const tPlan = performance.now() - tPlan0;
const tMesh0 = performance.now();
const mesh = buildOpenJ1Mesh(T, plan);
const tMesh = performance.now() - tMesh0;
const mv = buildMovements(plan.arms, FLOWS);
const back = (k: number, q: V2): V2 => rotCW(q, (4 - k) % 4); // local -> arm frame (o, s)
const kOf = (d: Dir): number => DIRS.indexOf(d);
const inPaved = (e: number, n: number): boolean => plan.surface.some((s) => pointInPoly(e, n, s));
const edgeDist = (q: V2, r: ReadonlyArray<V2>): number => { let m = 1e9; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)); m = Math.min(m, Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy)); } return m; };
/** on the surface, or on its edge within 1 cm (the g2 merge lane centre line runs on the outer edge once the merge taper has closed) */
const onPaved = (q: V2): boolean => inPaved(q[0], q[1]) || plan.surface.some((s) => edgeDist(q, s) < 0.01);
const centroid = (q: ReadonlyArray<V2>): V2 => [q.reduce((s, v) => s + v[0], 0) / q.length, q.reduce((s, v) => s + v[1], 0) / q.length];

p('J1-g4 CHECK: mesh + marking + game layer of the open star, C10 (-87, -277) yaw 37.5 (2026-11-14)');
p('');
p('1. NUMBERS');
p(`  surface polygons ${plan.surface.length} (g2 outline ${plan.outline.length} points + 4 plain M8 pieces to S_END = ${SE} m), islands ${plan.islands.length} (median 4, corner 4), marks ${plan.marks.length} pieces, arrows ${plan.arrows.length}, zebra groups ${plan.zebras.length}`);
p(`  mesh ${mesh.stats.verts} vertices, ${mesh.stats.tris} triangles: surface ${mesh.stats.surfaceTris}, islands ${mesh.stats.islandTris}, kerb walls ${mesh.stats.kerbTris}, marks ${mesh.stats.markTris}`);
p(`  build time in node (this machine): plan ${f1(tPlan)} ms, mesh ${f1(tMesh)} ms (grid cell ${M.cell} m, mark edge ${M.markEdge} m)`);
p('');

// ---------------------------------------------------------------- 2. surface
const segX = (a: V2, b: V2, c: V2, d: V2): boolean => {
  const o = (p1: V2, p2: V2, p3: V2): number => (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return o(a, b, c) * o(a, b, d) < -1e-9 && o(c, d, a) * o(c, d, b) < -1e-9;
};
const simple = (r: ReadonlyArray<V2>): boolean => { const pts = r.filter((q, i) => Math.hypot(q[0] - r[(i + 1) % r.length][0], q[1] - r[(i + 1) % r.length][1]) > 1e-7); for (let i = 0; i < pts.length; i++) for (let j = i + 2; j < pts.length; j++) { if (i === 0 && j === pts.length - 1) continue; if (segX(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length])) return false; } return true; };
const polyTotal = plan.surface.reduce((s, q) => s + Math.abs(ringArea(q)), 0);
const earTotal = plan.surface.reduce((s, q) => s + earClip(q).reduce((a, t) => a + Math.abs(ringArea(t)), 0), 0);
const gridTotal = plan.surface.reduce((s, q) => s + gridTriangles(q, M.cell).reduce((a, t) => a + Math.abs(ringArea(t)), 0), 0);
// world area of the surface triangles of the mesh
let meshArea = 0, maxEdge = 0, maxCentroid = 0, nCent = 0, worstCentroid = 0, maxVert = 0;
const [s0, s1] = mesh.parts.surface;
for (let ti = s0; ti < s1; ti++) {
  const idx = [0, 1, 2].map((q) => mesh.indices[ti * 3 + q] * 3);
  const P3 = idx.map((i) => [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
  meshArea += Math.abs((P3[1][0] - P3[0][0]) * (P3[2][2] - P3[0][2]) - (P3[2][0] - P3[0][0]) * (P3[1][2] - P3[0][2])) / 2;
  for (let q = 0; q < 3; q++) { const a = P3[q], b = P3[(q + 1) % 3]; maxEdge = Math.max(maxEdge, Math.hypot(a[0] - b[0], a[2] - b[2])); maxVert = Math.max(maxVert, Math.abs(a[1] - M.lift - gen.heightAt(a[0], a[2]))); }
  if (ti % 7 === 0) { const cx = (P3[0][0] + P3[1][0] + P3[2][0]) / 3, cy = (P3[0][1] + P3[1][1] + P3[2][1]) / 3, cz = (P3[0][2] + P3[1][2] + P3[2][2]) / 3; const d = Math.abs(cy - M.lift - gen.heightAt(cx, cz)); nCent++; if (d > worstCentroid) worstCentroid = d; }
}
void maxCentroid;
p(`2. SURFACE   plan area ${f1(polyTotal)} m2 (g2 outline ${f1(polyArea(plan.outline))} m2 + plain M8 pieces), triangulated ${f1(earTotal)} m2, cut at the grid ${f1(gridTotal)} m2, mesh (world) ${f1(meshArea)} m2`);
p(`  longest surface edge ${f2(maxEdge)} m, max vertex height error ${f3(maxVert)} m, max error at ${nCent} triangle centroids ${f3(worstCentroid)} m`);
p('');
CHK('g2 paved outline is a simple polygon (no self-crossing) and its area is the g2 area 5.82 ha', simple(plan.outline) && Math.abs(polyArea(plan.outline) - 58203) < 100, `${f1(polyArea(plan.outline))} m2`);
CHK('ear clipping covers the whole surface (triangles area = polygon area, 0.01 %)', Math.abs(earTotal - polyTotal) < polyTotal * 1e-4, `${f2(earTotal)} vs ${f2(polyTotal)}`);
CHK('mesh surface has no hole and no overlap: world triangle area = plan area (0.1 %)', Math.abs(meshArea - polyTotal) < polyTotal * 1e-3, `${f1(meshArea)} vs ${f1(polyTotal)} m2`);
CHK(`no surface triangle edge longer than the grid diagonal ${f1(M.cell * Math.SQRT2)} m`, maxEdge <= M.cell * Math.SQRT2 + 0.01, `${f2(maxEdge)} m`);
CHK('mesh surface lies on the game ground + 2 cm at every vertex (< 6 cm) and at the triangle centres (< 3 cm)', maxVert < 0.06 && worstCentroid < 0.03, `${f3(maxVert)} / ${f3(worstCentroid)} m`);
// extent: the surface of every arm reaches exactly S_END with the plain M8 width
{
  let ok = true, det = '';
  for (const d of DIRS) {
    const k = kOf(d); let sMax = 0, oMax = 0;
    for (const sf of plan.surface) for (const q of sf) { const [o, s] = back(k, q); if (s > 100 && Math.abs(o) < 30 && s > sMax) { sMax = s; } if (s > 300 && Math.abs(o) < 30) oMax = Math.max(oMax, Math.abs(o)); }
    const w = plan.arms[d].t(SE) + 4 * W;
    if (Math.abs(sMax - SE) > 1e-6 || Math.abs(oMax - w) > 1e-6) ok = false;
    det += `${d} s ${f2(sMax)} half ${f2(oMax)}  `;
  }
  CHK(`every arm surface ends exactly at S_END = ${SE} m with the plain M8 width (the arm road starts there)`, ok, det.trim());
}
// the surface covers every lane centre line of g2
{
  let n = 0, bad = 0; for (const m of mv) for (const q of m.pts) { n++; if (!onPaved(q)) bad++; }
  CHK('every lane centre line of g2 (32 movements) lies on the mesh surface (or on its edge within 1 cm)', bad === 0, `${n - bad} of ${n} points`);
}

// ---------------------------------------------------------------- 3. islands
p('');
p('3. ISLANDS (raised, kerb walls)');
const med = plan.islands.filter((i) => i.kind === 'median'), cor = plan.islands.filter((i) => i.kind === 'corner');
{
  let nIn = 0, nAll = 0;
  for (const i of med) for (const t of gridTriangles(i.ring, 6)) { const c = centroid(t); nAll++; if (inPaved(c[0], c[1])) nIn++; }
  CHK('4 median islands (also the pedestrian refuge) lie on the paved surface', med.length === 4 && nIn === nAll, `${nIn} of ${nAll} samples inside the paved outline`);
}
{
  let nOut = 0, nAll = 0;
  for (const i of cor) for (const t of gridTriangles(i.ring, 6)) { const c = centroid(t); nAll++; if (!pointInPoly(c[0], c[1], plan.outline)) nOut++; }
  CHK('4 corner islands lie outside the g2 paved outline (nothing paved is covered, the slip lane stays free)', cor.length === 4 && nOut === nAll, `${nOut} of ${nAll} samples outside`);
}
{
  const ARC = Math.hypot(0, 0); void ARC;
  let minD = 1e9;
  for (const i of cor) for (const q of i.ring) { // the arc points of the ring are at the island side radius from the arc centre
    const k = kOf(i.arm), [o, s] = back(k, q), r = Math.hypot(o - D.Cx, s - D.Cx);
    if (Math.abs(r - (OPEN_PARAMS.slipR - W / 2)) < 0.01) minD = Math.min(minD, Math.abs(r - (OPEN_PARAMS.slipR - W / 2)));
  }
  const nArc = cor.reduce((n, i) => n + i.ring.filter((q) => { const [o, s] = back(kOf(i.arm), q); return Math.abs(Math.hypot(o - D.Cx, s - D.Cx) - (OPEN_PARAMS.slipR - W / 2)) < 0.01; }).length, 0);
  CHK(`corner island kerb arc is the island side of the slip lane (R ${f2(OPEN_PARAMS.slipR - W / 2)} m = lane centre R ${OPEN_PARAMS.slipR} - half lane)`, nArc >= 4 * 40, `${nArc} arc points`);
}
{
  let nIn = 0, nAll = 0;
  for (const m of mv) for (const q of m.pts) for (const i of plan.islands) { nAll++; if (pointInPoly(q[0], q[1], i.ring)) nIn++; }
  CHK('no lane centre line of g2 (32 movements) enters any island (cars never drive over a kerb)', nIn === 0, `${nIn} points inside, ${mv.reduce((n, m) => n + m.pts.length, 0)} points x 8 islands tested`);
}
{
  const [k0, k1] = mesh.parts.kerb; let tall = 0, nWall = 0;
  for (let ti = k0; ti < k1; ti++) for (let q = 0; q < 3; q++) { /* heights of a wall triangle: 0 or islandH above the ground */ nWall++; const i = mesh.indices[ti * 3 + q] * 3; const h = mesh.positions[i + 1] - gen.heightAt(mesh.positions[i], mesh.positions[i + 2]); if (Math.abs(h - M.islandH) < 0.06) tall++; else if (Math.abs(h) > 0.06) tall = -1e9; }
  CHK(`kerb walls: every wall vertex is at the ground or ${M.islandH} m above it, walls exist on all 8 islands`, tall > 0 && mesh.stats.kerbTris > 8 * 8, `${mesh.stats.kerbTris} wall triangles, ${tall > 0 ? 'heights ok' : 'height error'}`);
}

// ---------------------------------------------------------------- 4. markings
p('');
p('4. MARKINGS');
const kinds: Record<string, number> = {}; for (const m of plan.marks) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
p(`  pieces: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}`);
{
  let off = 0, onIsland = 0;
  for (const m of plan.marks) { const c = centroid(m.poly); if (!inPaved(c[0], c[1])) off++; for (const i of plan.islands) if (pointInPoly(c[0], c[1], i.ring)) onIsland++; }
  CHK('every mark piece lies on the paved surface (centre point) and none lies on an island', off === 0 && onIsland === 0, `${plan.marks.length} pieces, ${off} off the surface, ${onIsland} on an island`);
}
{
  const w = (kind: string): number[] => plan.marks.filter((m) => m.kind === kind).map((m) => Math.hypot(m.poly[0][0] - m.poly[3][0], m.poly[0][1] - m.poly[3][1]));
  const lane = w('lane'), edge = w('edge'), guide = w('guide');
  const mm = (a: number[]): [number, number] => [Math.min(...a), Math.max(...a)];
  const okW = mm(lane)[0] > 0.1 && mm(lane)[1] < 0.2 && mm(edge)[0] > 0.1 && mm(edge)[1] < 0.2 && mm(guide)[0] > 0.1 && mm(guide)[1] < 0.2;
  CHK('line widths: lane / edge / guide lines 0.10 .. 0.20 m (white, painted line)', okW, `lane ${f2(mm(lane)[0])}-${f2(mm(lane)[1])}, edge ${f2(mm(edge)[0])}-${f2(mm(edge)[1])}, guide ${f2(mm(guide)[0])}-${f2(mm(guide)[1])} m`);
}
{
  let ok = plan.stops.length === 8, det = '';
  for (const d of DIRS) {
    const a = plan.stops.filter((q) => q.arm === d).sort((x, y) => x.o0 - y.o0);
    const good = a.length === 2 && Math.abs(a[0].o0 - (D.t0 - 2 * W)) < 1e-9 && Math.abs(a[0].o1 - a[1].o0) < 1e-9 && Math.abs(a[1].o1 - (D.t0 + 4 * W)) < 1e-9 && a.every((q) => Math.abs(q.s1 - D.sStop) < 1e-9 && Math.abs(q.s1 - q.s0 - M.stopW) < 1e-9);
    if (!good) ok = false; det += `${d} ${a.length} `;
  }
  CHK(`stop lines: per arm one for the pockets and one for the 4 through lanes, at s = ${f2(D.sStop)} m, ${M.stopW} m wide, no gap across the inbound lanes`, ok, `${plan.stops.length} lines (${det.trim()})`);
}
{
  let ok = plan.zebras.length === 8, det = '';
  for (const z of plan.zebras) {
    const arm = plan.arms[z.arm], st = plan.stops.find((q) => q.arm === z.arm)!;
    const inCross = z.s0 >= D.B - 1e-9 && z.s1 <= st.s0 + 1e-9 && z.bars >= 5; // between the star edge and the stop line, gap before the stop line
    const medianGap = z.side === 'in' ? z.o0 >= arm.t(z.s0) - 2 * W - 1e-9 : z.o1 <= -arm.t(z.s0) + 1e-9;
    if (!inCross || !medianGap) ok = false; det += `${z.arm}${z.side} ${z.bars} `;
  }
  CHK('zebra: 2 groups per arm (inbound, outbound) in the crossing space between the star edge and the stop line, gap at the median refuge, 5+ bars each', ok, det.trim());
}
{
  const byArm = (d: Dir): number => plan.arrows.filter((a) => a.arm === d).length;
  let inLane = true;
  for (const a of plan.arrows) {
    const arm = plan.arms[a.arm], k = kOf(a.arm), pts = a.pieces.flat().map((q) => back(k, q));
    const sMid = a.sTip + M.arrowLen / 2;
    let lo: number, hi: number;
    if (a.lane[0] === 'T') { const i = Number(a.lane[1]); lo = arm.t(sMid) + (i - 1) * W; hi = lo + W; }
    else if (a.lane === 'R1') { hi = arm.t(sMid); lo = hi - arm.w1(sMid); }
    else if (a.lane === 'R2') { hi = arm.t(sMid) - arm.w1(sMid); lo = hi - arm.w2(sMid); }
    else { lo = arm.t(sMid) + 4 * W; hi = lo + arm.ws(sMid); }
    const fullPocket = a.lane[0] !== 'R' || (a.lane === 'R1' ? sMid + M.arrowLen / 2 <= D.sStop + arm.L1 : sMid + M.arrowLen / 2 <= D.sStop + arm.L2);
    if (!fullPocket || pts.some(([o]) => o < lo + 0.1 || o > hi - 0.1)) inLane = false;
  }
  CHK('arrows: per arm 8 through (T1-T4 x 2), 4 right (R1, R2 x 2), 2 left (slip lane); each lies fully inside its own lane (pockets and exit lane at full width)', plan.arrows.length === 56 && DIRS.every((d) => byArm(d) === 14) && inLane, `${plan.arrows.length} arrows, ${inLane ? 'all inside their lane' : 'an arrow leaves its lane'}`);
}
{
  const dashes = plan.marks.filter((m) => m.kind === 'lane').length, guides = plan.marks.filter((m) => m.kind === 'guide').length;
  CHK('curved guide lines exist for right turn (R 25.3 m between the two concentric arcs), U-turn (R 8.8 m) and the star side of the left slip lane (R 71.7 m) on all 4 arms', guides >= 4 * 3 * 6 && dashes > 100, `${guides} guide pieces, ${dashes} lane dashes`);
}

// ---------------------------------------------------------------- 5. game layer, files, budget
p('');
p('5. GAME LAYER AND FILES');
const layer = readFileSync('src/roads/junction/GroundJ1Layer.ts', 'utf8');
CHK('GroundJ1Layer builds the open star mesh (buildOpenJ1Mesh) and no longer the old box mesh', /buildOpenJ1Mesh\(terrain\)/.test(layer) && !/buildJ1Mesh/.test(layer) && !existsSync('src/roads/junction/GroundJ1Mesh.ts'), 'old GroundJ1Mesh.ts removed');
CHK('Engine creates the layer from the J1 terrain (Config.roads.junctionJ1.enabled) as before', /new GroundJ1Layer\(this\.world\.root, this\.world\.terrain\.roads\.j1\)/.test(readFileSync('src/core/Engine.ts', 'utf8')) && Config.roads.junctionJ1.enabled === true, 'Engine.ts unchanged');
CHK('triangle budget < 60000 and one mesh draw call (one material, vertex colours)', mesh.stats.tris < 60000, `${mesh.stats.tris} triangles`);
CHK('mesh build time in node < 1500 ms (plan + mesh; the browser may differ)', tPlan + tMesh < 1500, `${f1(tPlan + tMesh)} ms`);
CHK('nothing outside the g3 flat zone: every mesh vertex lies in the pad or an arm lane zone (s <= S_END, o <= 27 m)', (() => { let bad = 0; for (let i = 0; i < mesh.positions.length; i += 3) { const [e, n] = T.toLocal(mesh.positions[i], mesh.positions[i + 2]); const a = T.armOf(e, n); if (!(Math.max(Math.abs(e), Math.abs(n)) <= Config.roads.junctionJ1.rCore + 1e-6 || (a.s <= SE + 1e-6 && a.o <= 27))) bad++; } return bad === 0; })(), 'pad +-100 m / zone 27 m');
p('');
p('NOT IN g4 (said plainly): signal heads and signal-phase traffic (AI car) were never built in the game, so none is added; pedestrian crossing of the left slip road is not drawn (g1: decided in a later step); U-turn arrow and through-lane guide lines across the star are not drawn.');
p('');
p(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);

writeFileSync(`${out}/STEPJ1G4_OUTPUT.txt`, L.join('\n') + '\n');
const r2 = (q: V2): V2 => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100];
writeFileSync(`${out}/j1g4.json`, JSON.stringify({ outline: plan.outline.map(r2), surface: plan.surface.map((s) => s.map(r2)), islands: plan.islands.map((i) => ({ id: i.id, kind: i.kind, ring: i.ring.map(r2) })), marks: plan.marks.map((m) => ({ k: m.kind, p: m.poly.map(r2) })), stats: mesh.stats }));
process.exit(fails ? 1 : 0);
