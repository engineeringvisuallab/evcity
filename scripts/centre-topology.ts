// STEP 21.1 TOPOLOGY (headless, READ ONLY): the key-3 centrelines (docs/road_centre_view) + the built 8 / 6 lane roads.
// Run: npx tsx scripts/centre-topology.ts [dir]   (default docs)   writes dir/STEP_21_1_OUTPUT.txt and dir/centre_topology.json
// 1. every crossing of two lines (R1: a crossing becomes a junction; a small road ends at a bigger one)
// 2. every free end: JOIN (nearest road within SNAP) or DEAD END (listed with the distance)
// 3. junction nodes (points within CLUSTER m are one node), node gaps < 60 m (R1)
// 4. R5: nodes on the 8-lane roads: distance to J1, to the existing taps, to each other (1600 m), nothing near J1
// Nothing in src or data is changed. World metres: x east, z south.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { collectCentreSet } from '../src/roads/debug/RoadCentreSet';

const OUT = process.argv[2] ?? 'docs';
const SNAP = 60;      // m: a free end this close to a road is joined to it
const TOUCH = 5;      // m: an end this close to another line counts as already joined
const CLUSTER = 25;   // m: crossing / join points this close are one node
const EDGE = 3;       // m: a crossing this close to the end of a line is an end touch, not a crossing
const hyp = Math.hypot;
const L: string[] = [];
const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0);

const gen: any = new TerrainGenerator(Config.world.seed);
const set = collectCentreSet(gen);
const RANK: Record<string, number> = { '8': 5, '6': 4, '4': 3, '2': 2, C: 1, L: 0 };
interface Line { id: string; cls: string; built: boolean; pts: number[][]; len: number }
const lines: Line[] = set.lines.map((l) => {
  const pts = l.pts.map((p) => [p[0], p[1]]);
  let len = 0; for (let i = 0; i + 1 < pts.length; i++) len += hyp(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return { id: l.id, cls: l.cls, built: l.source === 'built', pts, len };
});
const rk = (l: Line): number => RANK[l.cls] ?? 0;

type P = { x: number; z: number };
function segInt(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: a.x + rx * t, z: a.z + rz * t };
}
function proj(pts: number[][], x: number, z: number): { d: number; x: number; z: number; i: number; dx: number; dz: number } {
  let best = { d: 1e18, x: 0, z: 0, i: 0, dx: 1, dz: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
    const px = ax + bx * t, pz = az + bz * t, d = hyp(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, i, dx: bx, dz: bz };
  }
  return best;
}
/** distance along the line from its start to the point (for the end test) */
function alongEnds(l: Line, x: number, z: number): number {
  const a = hyp(x - l.pts[0][0], z - l.pts[0][1]), b = hyp(x - l.pts[l.pts.length - 1][0], z - l.pts[l.pts.length - 1][1]);
  return Math.min(a, b);
}

pr('STEP 21.1 TOPOLOGY (headless, read only, nothing in src or data changed)');
const nNew = lines.filter((l) => !l.built).length, nBuilt = lines.length - nNew;
pr(`lines: ${nNew} new (key 3 data) + ${nBuilt} built (8 / 6 lane, same as key 3). SNAP ${SNAP} m, TOUCH ${TOUCH} m, CLUSTER ${CLUSTER} m, EDGE ${EDGE} m`);

// ---------- 1. crossings ----------
interface Cross { a: string; b: string; x: number; z: number; aa: string; bb: string; kind: string }
const crosses: Cross[] = [];
for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
  if (lines[i].built && lines[j].built) continue; // built roads are fixed (R12)
  for (let p = 0; p + 1 < lines[i].pts.length; p++) for (let q = 0; q + 1 < lines[j].pts.length; q++) {
    const A = lines[i].pts, B = lines[j].pts;
    const o = segInt({ x: A[p][0], z: A[p][1] }, { x: A[p + 1][0], z: A[p + 1][1] }, { x: B[q][0], z: B[q][1] }, { x: B[q + 1][0], z: B[q + 1][1] });
    if (!o) continue;
    const ea = alongEnds(lines[i], o.x, o.z), eb = alongEnds(lines[j], o.x, o.z);
    const aa = ea <= EDGE ? 'end' : 'through', bb = eb <= EDGE ? 'end' : 'through';
    const kind = aa === 'through' && bb === 'through' ? 'X' : aa === 'end' && bb === 'end' ? 'end-end' : 'T';
    if (crosses.some((c) => c.a === lines[i].id && c.b === lines[j].id && hyp(c.x - o.x, c.z - o.z) < 2)) continue;
    crosses.push({ a: lines[i].id, b: lines[j].id, x: o.x, z: o.z, aa, bb, kind });
  }
}
const X = crosses.filter((c) => c.kind === 'X');
const byId = new Map(lines.map((l) => [l.id, l]));
pr('');
pr(`1. CROSSINGS (R1): ${X.length} real crossings (both roads run through), ${crosses.length - X.length} end touches (already joined)`);
const sameRank = X.filter((c) => rk(byId.get(c.a)!) === rk(byId.get(c.b)!)), diffRank = X.length - sameRank.length;
pr(`   ${sameRank.length} between roads of the SAME class (4-leg junction, both split), ${diffRank} between DIFFERENT classes (the smaller road ends at the bigger one: small never crosses big)`);
for (const c of X) {
  const la = byId.get(c.a)!, lb = byId.get(c.b)!;
  pr(`   ${c.a.padEnd(7)} x ${c.b.padEnd(7)} at (${f0(c.x)}, ${f0(c.z)})  ${la.cls}/${lb.cls}${la.built || lb.built ? '  BUILT road involved' : ''}`);
}

// ---------- 2. free ends ----------
interface End { line: string; end: 'start' | 'end'; x: number; z: number; state: string; target?: string; tcls?: string; d?: number; px?: number; pz?: number; angle?: number }
const ends: End[] = [];
for (const l of lines) {
  if (l.built) continue;
  for (const which of ['start', 'end'] as const) {
    const e = which === 'start' ? l.pts[0] : l.pts[l.pts.length - 1];
    const nb = which === 'start' ? l.pts[1] : l.pts[l.pts.length - 2];
    let best: { l: Line; d: number; x: number; z: number; dx: number; dz: number } | null = null;
    for (const o of lines) {
      if (o === l) continue;
      const q = proj(o.pts, e[0], e[1]);
      if (!best || q.d < best.d) best = { l: o, d: q.d, x: q.x, z: q.z, dx: q.dx, dz: q.dz };
    }
    if (!best) continue;
    const base: End = { line: l.id, end: which, x: e[0], z: e[1], state: '', target: best.l.id, tcls: best.l.cls, d: best.d, px: best.x, pz: best.z };
    // angle between the line direction at the end and the target road (0..90)
    const ux = e[0] - nb[0], uz = e[1] - nb[1], ul = hyp(ux, uz) || 1, tl = hyp(best.dx, best.dz) || 1;
    base.angle = (Math.acos(Math.min(1, Math.abs(ux * best.dx + uz * best.dz) / (ul * tl))) * 180) / Math.PI;
    base.state = best.d <= TOUCH ? 'joined' : best.d <= SNAP ? 'JOIN' : 'DEAD END';
    ends.push(base);
  }
}
const joined = ends.filter((e) => e.state === 'joined'), joins = ends.filter((e) => e.state === 'JOIN'), dead = ends.filter((e) => e.state === 'DEAD END');
pr('');
pr(`2. LINE ENDS: ${ends.length} ends of the new lines: ${joined.length} already joined (<= ${TOUCH} m), ${joins.length} JOIN proposals (${TOUCH}..${SNAP} m), ${dead.length} DEAD ENDS (> ${SNAP} m)`);
pr('   JOIN proposals (end moves onto the nearest road; angle = angle between the two roads, 90 = square):');
for (const e of joins.sort((a, b) => a.d! - b.d!)) {
  const own = byId.get(e.line)!, tg = byId.get(e.target!)!;
  const warn = [rk(tg) < rk(own) ? 'target is a SMALLER road' : '', e.angle! < 30 ? 'shallow angle' : ''].filter(Boolean).join(', ');
  pr(`   ${e.line.padEnd(7)} ${e.end.padEnd(5)} (${f0(e.x)}, ${f0(e.z)}) -> ${e.target!.padEnd(7)} ${f0(e.d!).padStart(3)} m, angle ${f0(e.angle!)}${warn ? '  WARN: ' + warn : ''}`);
}
pr('   DEAD ENDS (nearest other road is further than SNAP; the user says: real dead end / open end of the map / join anyway / move):');
for (const e of dead.sort((a, b) => a.d! - b.d!)) pr(`   ${e.line.padEnd(7)} ${e.end.padEnd(5)} (${f0(e.x)}, ${f0(e.z)})  nearest ${e.target} ${f0(e.d!)} m`);

// ---------- 3. nodes ----------
interface Node { id: string; x: number; z: number; legs: string[]; kinds: Set<string>; on8: string[] }
const raw: { x: number; z: number; line: string; kind: string }[] = [];
for (const c of crosses) { raw.push({ x: c.x, z: c.z, line: c.a, kind: c.kind }); raw.push({ x: c.x, z: c.z, line: c.b, kind: c.kind }); }
for (const e of joins) { raw.push({ x: e.px!, z: e.pz!, line: e.line, kind: 'JOIN' }); raw.push({ x: e.px!, z: e.pz!, line: e.target!, kind: 'JOIN' }); }
for (const e of joined) { raw.push({ x: e.x, z: e.z, line: e.line, kind: 'joined' }); raw.push({ x: e.x, z: e.z, line: e.target!, kind: 'joined' }); }
const parent = raw.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) if (hyp(raw[i].x - raw[j].x, raw[i].z - raw[j].z) <= CLUSTER) parent[find(i)] = find(j);
const groups = new Map<number, number[]>();
raw.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });
const nodes: Node[] = [];
for (const idx of groups.values()) {
  const x = idx.reduce((s, i) => s + raw[i].x, 0) / idx.length, z = idx.reduce((s, i) => s + raw[i].z, 0) / idx.length;
  const legs = [...new Set(idx.map((i) => raw[i].line))];
  const kinds = new Set(idx.map((i) => raw[i].kind));
  const on8 = legs.filter((n) => byId.get(n)!.cls === '8');
  nodes.push({ id: '', x, z, legs, kinds, on8 });
}
nodes.sort((a, b) => a.x - b.x);
nodes.forEach((n, i) => { n.id = 'J-' + String(i + 1).padStart(3, '0'); });
pr('');
pr(`3. JUNCTION NODES: ${nodes.length} nodes (crossings + joins + joined ends, points within ${CLUSTER} m merged)`);
const legHist: Record<number, number> = {}; for (const n of nodes) legHist[n.legs.length] = (legHist[n.legs.length] ?? 0) + 1;
pr(`   roads meeting at a node (number of lines): ${JSON.stringify(legHist)}`);
const gaps: string[] = [];
for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const d = hyp(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z); if (d < 60) gaps.push(`   ${nodes[i].id} - ${nodes[j].id}  ${f0(d)} m  (${nodes[i].legs.join(' ')} | ${nodes[j].legs.join(' ')})`); }
pr(`   node gaps under 60 m (R1 asks at least 60 m): ${gaps.length}`);
for (const g of gaps) pr(g);

// ---------- 4. R5 on the 8-lane roads ----------
const J1 = { x: Config.roads.junctionJ1.x, z: Config.roads.junctionJ1.z, r: Config.roads.junctionJ1.rCore };
const A3 = JSON.parse(readFileSync('docs/a3_demand_x2.json', 'utf8'));
const TAPS = ['T7299', 'T8919', 'T13738', 'T18838', 'T-N880', 'T-E610', 'T-W960', 'R1205', 'R4265', 'R12094', 'R16813'];
const tapPts = A3.nodes.filter((n: any) => TAPS.includes(n.id)).map((n: any) => ({ id: n.id, x: n.x, z: n.z }));
const eightNodes = nodes.filter((n) => n.on8.length || lines.some((l) => l.cls === '8' && proj(l.pts, n.x, n.z).d <= CLUSTER));
pr('');
pr(`4. R5 (nothing leaves J1; a branch leaves an 8-lane road only at a tap, 1600 m from other taps, 600 m from the J1 plaza edge): ${eightNodes.length} nodes lie on an 8-lane road (M8 or a J1 arm)`);
pr(`   J1 centre (${f0(J1.x)}, ${f0(J1.z)}), plaza radius ${J1.r} m, ${tapPts.length} existing taps known`);
for (const n of eightNodes) {
  const big = lines.filter((l) => l.cls === '8').map((l) => ({ l, q: proj(l.pts, n.x, n.z) })).sort((a, b) => a.q.d - b.q.d)[0];
  const dJ1 = hyp(n.x - J1.x, n.z - J1.z) - J1.r;
  let tap = { id: '-', d: 1e18 }; for (const t of tapPts) { const d = hyp(n.x - t.x, n.z - t.z); if (d < tap.d) tap = { id: t.id, d }; }
  let nn = { id: '-', d: 1e18 }; for (const o of eightNodes) { if (o === n) continue; const d = hyp(n.x - o.x, n.z - o.z); if (d < nn.d) nn = { id: o.id, d }; }
  const flags = [dJ1 < 600 ? 'NEAR J1 (<600 m)' : '', Math.min(tap.d, nn.d) < 1600 ? 'tap gap < 1600 m' : ''].filter(Boolean).join(', ');
  pr(`   ${n.id} (${f0(n.x)}, ${f0(n.z)}) on ${big.l.id}  J1 plaza ${f0(dJ1)} m, nearest tap ${tap.id} ${f0(tap.d)} m, nearest other 8-lane node ${nn.id} ${f0(nn.d)} m${flags ? '  <- ' + flags : ''}`);
}
const nearJ1 = eightNodes.filter((n) => hyp(n.x - J1.x, n.z - J1.z) - J1.r < 600).length;
const tight = eightNodes.filter((n) => { let m = 1e18; for (const t of tapPts) m = Math.min(m, hyp(n.x - t.x, n.z - t.z)); for (const o of eightNodes) if (o !== n) m = Math.min(m, hyp(n.x - o.x, n.z - o.z)); return m < 1600; }).length;
pr(`   R5 summary: ${nearJ1} nodes within 600 m of the J1 plaza, ${tight} of ${eightNodes.length} 8-lane nodes closer than 1600 m to a tap or to each other`);
pr('   (R10: the user\'s lines come first, so these are CONFLICTS to ask about, not changes the script makes)');

pr('');
pr('SUMMARY');
pr(`  crossings to split: ${X.length} (same class ${sameRank.length}, different class ${diffRank}); joins proposed: ${joins.length}; dead ends: ${dead.length}; nodes: ${nodes.length}; gaps < 60 m: ${gaps.length}; R5 near J1: ${nearJ1}; R5 tap gaps: ${tight}`);
pr('  NOT RUN here: tsc of the whole game, npm run build, the game (no node_modules in the zip). This script changes no game file.');

writeFileSync(`${OUT}/STEP_21_1_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_topology.json`, JSON.stringify({
  snap: SNAP, cluster: CLUSTER, j1: J1,
  lines: lines.map((l) => ({ id: l.id, cls: l.cls, built: l.built, pts: l.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]) })),
  crossings: X, joins, dead,
  nodes: nodes.map((n) => ({ id: n.id, x: Math.round(n.x), z: Math.round(n.z), legs: n.legs, kinds: [...n.kinds], on8: n.on8 })),
}));
