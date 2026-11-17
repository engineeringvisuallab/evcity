// STEP A3 (headless): DEMAND AND LANE LADDER for the whole map. Reads A2 (zone weights) and the FIXED roads, changes nothing in src/.
// 1. Network = FIXED roads (ring cut into links at its nodes, four J1 arms, island link M6-1) + CANDIDATE corridors (district to district / district to ring node,
//    straight line x 1.2 circuity). Candidates are NOT roads yet: their class comes from the flow.
//    A3-FIX 2026-11-15 (user rules, see HANDOFF section 0 'HARD RULES'): (R1) NO CROSSING: a candidate never crosses the ring, a J1 arm, the J1 plaza, the island link
//    (it is not built); two candidates that would cross get a JUNCTION PLACEHOLDER J-xx at the crossing and both are SPLIT there (a road ends, a new road starts).
//    (R2) NO ROAD WITHOUT NEED: only a corridor with AADT >= minAadt is a road (road = true in the json); the rest is NOT drawn and gets NO road in A3.
// 2. Trips: gravity model (A2 productions, attractions scaled to the productions, friction exp(-0.08 t), t = minutes on the network) + trucks (slower decay).
// 3. Assignment: all-or-nothing on the shortest time path, 8 iterations, flows averaged (MSA); speed of a candidate follows its class of the previous iteration.
// 4. Lanes per direction from the design hour (3.13): V = AADT x K x D (K 0.10, D 0.60), motorway c 1800, divided arterial 950, undivided 800 pcu / h / lane.
//    Class ladder 8 -> 6 -> 4 -> 2 (4 / 3 / 2 / 1 lanes per direction); inside the ring no new motorway, arterials A-D / A-U only; a degree-2 node may step by one only.
// ALL parameters are PROPOSALS in PAR below. Run: npx tsx scripts/demand-ladder.ts <out-dir>   (needs docs/a2_zone_weights.json and docs/ring_samples_5m.csv)
import { readFileSync, writeFileSync } from 'node:fs';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const out = process.argv[2] ?? '.';
const SCALE = Number(process.env.SCALE ?? 1);   // sensitivity: multiplies persons, jobs and trips of every zone (A2 numbers x SCALE)
const QUIET = process.env.QUIET === '1';
const PAR = { vehPerPersonTrip: 0.30, pcuPerTruck: 2.5, K: 0.10, D: 0.60, circuity: 1.2, decay: 0.08, truckDecay: 0.02, minTrips: 1000, iters: 8, knn: 3,
  cMot: 1800, cArtD: 950, cArtU: 800, tapSpacing: 1600, tapFromJ1: 600, reuse: 0.8, loopMax: 1800, minAadt: 1500 };
const SPEED: Record<string, number> = { M8: 100, M6: 90, M4: 80, 'A-D6': 60, 'A-D4': 55, 'A-2': 45, none: 35 };
const A2 = JSON.parse(readFileSync(`${out}/a2_zone_weights.json`, 'utf8'));

// ---------------- network
interface Node { ri?: number; id: string; x: number; z: number; kind: 'ring' | 'tap' | 'j1' | 'taz' | 'island' | 'jx'; inside: boolean; zone?: any }
interface Link { id: string; a: number; b: number; len: number; fixed: boolean; lanesDir: number; kind: string; flow: number; cls: string; side: 'in' | 'out' | 'ring'; spd: number; geo?: number[][] }
const ring: number[][] = readFileSync(`${out}/ring_samples_5m.csv`, 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.split(','); return [+c[1], +c[2]]; });
const inRing = (x: number, z: number) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const nearestRing = (x: number, z: number) => { let b = 0, bd = 1e18; ring.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
const cum: number[] = [0]; for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
const ringLen = cum[cum.length - 1] + Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]);
// ---------------- zones kept (positions only here; nodes are made below)
const zones = A2.zones.filter((z: any) => z.prod + z.attr + z.trucks * PAR.pcuPerTruck >= PAR.minTrips && z.id !== 'sea-south');
const dropped = A2.zones.filter((z: any) => !zones.includes(z)); const droppedTrips = dropped.reduce((s: number, z: any) => s + z.prod + z.attr, 0);
const isIslandZone = (z: any) => z.id.startsWith('island');

// ---------------- geometry helpers (R1)
const o3 = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segX2 = (p: number[], q: number[], r: number[], s2: number[]) => o3(p, q, r) * o3(p, q, s2) < 0 && o3(r, s2, p) * o3(r, s2, q) < 0;
const fixedPolys: { name: string; pts: number[][]; closed: boolean }[] = [{ name: 'ring', pts: ring, closed: true }, ...J1_ARM_DATA.map((a) => ({ name: a.name, pts: a.pts, closed: false })), { name: 'island link', pts: ISLAND_LINK_DATA.pts, closed: false }];
const J1C = [-87, -277], J1_PLAZA_R = 300;
const distSegPt = (p: number[], q: number[], c: number[]) => { const dx = q[0] - p[0], dz = q[1] - p[1]; const t = Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] + t * dx - c[0], p[1] + t * dz - c[1]); };
// how many FIXED road pieces a straight corridor A-B crosses; pieces within `skip` m of a ring / tap / J1 / island END node of the corridor are skipped (the corridor starts there)
function fixedCrossings(A: { x: number; z: number; kind: string }, B: { x: number; z: number; kind: string }, skip: number, names?: string[]) {
  let n = 0; const ends = [A, B].filter((q) => q.kind === 'ring' || q.kind === 'tap' || q.kind === 'j1' || q.kind === 'island');
  for (const f of fixedPolys) { const m = f.closed ? f.pts.length : f.pts.length - 1; const step = f.name === 'ring' ? 2 : 1;
    for (let i = 0; i < m; i += step) { const p = f.pts[i], q = f.pts[(i + step) % f.pts.length]; if (ends.some((e) => Math.hypot(e.x - p[0], e.z - p[1]) < skip || Math.hypot(e.x - q[0], e.z - q[1]) < skip)) continue; if (segX2([A.x, A.z], [B.x, B.z], p, q)) { n++; names?.push(f.name); break; } } }
  if (A.kind !== 'j1' && B.kind !== 'j1' && distSegPt([A.x, A.z], [B.x, B.z], J1C) < J1_PLAZA_R && Math.hypot(A.x - J1C[0], A.z - J1C[1]) >= J1_PLAZA_R && Math.hypot(B.x - J1C[0], B.z - J1C[1]) >= J1_PLAZA_R) { n++; names?.push('J1 plaza'); }
  return n;
}

// ---------------- M8 joins and TAPS (user rules 2026-11-15: a branch leaves an M8 ONLY at a tap on the open M8 road, never at J1 and never at the 4 ring x arm joins;
// a zone connects to the NEAREST suitable road, never to a far one)
const joinIdx: Record<string, number> = {};
for (const a of J1_ARM_DATA) { const p = a.pts[a.pts.length - 1]; joinIdx[a.name.slice(-1)] = nearestRing(p[0], p[1]); }
interface M8Pt { x: number; z: number; road: string; i: number }
const m8Pts: M8Pt[] = [];
for (let i = 0; i < ring.length; i += 4) m8Pts.push({ x: ring[i][0], z: ring[i][1], road: 'ring', i });
for (const a of J1_ARM_DATA) a.pts.forEach((p, i) => { if (i >= 1 && i < a.pts.length - 1) m8Pts.push({ x: p[0], z: p[1], road: a.name, i }); });
const m8Fixed: { x: number; z: number; r: number }[] = [];
for (const k of Object.keys(joinIdx)) m8Fixed.push({ x: ring[joinIdx[k]][0], z: ring[joinIdx[k]][1], r: PAR.tapSpacing });
for (const a of J1_ARM_DATA) m8Fixed.push({ x: a.pts[0][0], z: a.pts[0][1], r: PAR.tapFromJ1 });
const taps: M8Pt[] = [];
const okNew = (p: M8Pt) => m8Fixed.every((f) => Math.hypot(p.x - f.x, p.z - f.z) >= f.r) && taps.every((t) => Math.hypot(p.x - t.x, p.z - t.z) >= PAR.tapSpacing);
interface Att { zi: number; to: { tap: M8Pt } | { zone: number }; d: number }
const atts: Att[] = []; const attached = new Set<number>();
const landZ = zones.map((z: any, i: number) => ({ z, i })).filter(({ z }: any) => !isIslandZone(z));
const imp = (z: any) => z.prod + z.attr + z.trucks * PAR.pcuPerTruck;
landZ.sort((a: any, b: any) => imp(b.z) - imp(a.z));   // the big generators (airport, seaport, big housings) claim their taps first; small zones reuse a tap or join the nearest zone
let pending = landZ.slice();
for (let pass = 0; pass < 6 && pending.length; pass++) { const failed: typeof pending = [];
  for (const item of pending) { const { z, i } = item as any;
    const Z = { x: z.cx, z: z.cz, kind: 'taz' };
    const cands: { d: number; real: number; to: Att['to'] }[] = [];
    for (const t of taps) { const r = Math.hypot(t.x - z.cx, t.z - z.cz); cands.push({ d: r * PAR.reuse, real: r, to: { tap: t } }); }
    for (const p of m8Pts) if (okNew(p)) { const r = Math.hypot(p.x - z.cx, p.z - z.cz); cands.push({ d: r, real: r, to: { tap: p } }); }
    for (const j of attached) { const q = zones[j]; const r = Math.hypot(q.cx - z.cx, q.cz - z.cz); cands.push({ d: r, real: r, to: { zone: j } }); }
    cands.sort((a, b) => a.d - b.d);
    let done = false;
    for (const c of cands) { const T = 'tap' in c.to ? { x: c.to.tap.x, z: c.to.tap.z, kind: 'tap' } : { x: zones[(c.to as any).zone].cx, z: zones[(c.to as any).zone].cz, kind: 'taz' };
      if (fixedCrossings(Z, T, 150) > 0) continue; if ('tap' in c.to && !taps.includes(c.to.tap)) taps.push(c.to.tap);
      atts.push({ zi: i, to: c.to, d: c.real }); attached.add(i); done = true; break; }
    if (!done) failed.push(item); }
  pending = failed; }
for (const item of pending) log0(`WARN zone ${(item as any).z.id} could not be attached without crossing a fixed road`);
function log0(...a: any[]) { if (!QUIET) console.log(...a); }
// extra mesh link: each zone to its nearest NOT yet linked neighbour zone, only if close (loops for the traffic, no long chords)
const linkedPairs = new Set<string>(); const pk = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
for (const a of atts) if ('zone' in a.to) linkedPairs.add(pk(a.zi, a.to.zone));
const extras: [number, number, number][] = [];
const chordsNow: number[][][] = atts.map((a) => [[zones[a.zi].cx, zones[a.zi].cz], 'tap' in a.to ? [a.to.tap.x, a.to.tap.z] : [zones[a.to.zone].cx, zones[a.to.zone].cz]]);
for (const { z, i } of landZ) { let best: [number, number] | null = null; for (const { z: q, i: j } of landZ) { if (i === j || linkedPairs.has(pk(i, j))) continue; const r = Math.hypot(q.cx - z.cx, q.cz - z.cz); if (r < PAR.loopMax && (!best || r < best[1])) { const A2p = [z.cx, z.cz], B2p = [q.cx, q.cz]; if (fixedCrossings({ x: z.cx, z: z.cz, kind: 'taz' }, { x: q.cx, z: q.cz, kind: 'taz' }, 150) === 0 && !chordsNow.some((c) => segX2(A2p, B2p, c[0], c[1]))) best = [j, r]; } }
  if (best) { linkedPairs.add(pk(i, best[0])); extras.push([i, best[0], best[1]]); chordsNow.push([[z.cx, z.cz], [zones[best[0]].cx, zones[best[0]].cz]]); } }

// ---------------- nodes and fixed links (ring and arms are cut at the joins and at the taps)
const nodes: Node[] = []; const links: Link[] = [];
const addNode = (n: Omit<Node, 'inside'> & { inside?: boolean }) => { nodes.push({ ...n, inside: n.inside ?? inRing(n.x, n.z) }); return nodes.length - 1; };
const mkLink = (id: string, a: number, b: number, len: number, fixed: boolean, lanesDir: number, kind: string, side: Link['side'], geo?: number[][]) => links.push({ id, a, b, len, fixed, lanesDir, kind, flow: 0, cls: fixed ? (lanesDir === 4 ? 'M8' : 'M6') : 'none', side, spd: SPEED[fixed ? (lanesDir === 4 ? 'M8' : 'M6') : 'none'], geo } as Link);
const joinSet = new Set(Object.values(joinIdx));
const ringTapIdx = taps.filter((t) => t.road === 'ring').map((t) => t.i);
const ringKeys = [...new Set([...joinSet, ...ringTapIdx])].sort((a, b) => a - b);
const ringNode: Record<number, number> = {};
ringKeys.forEach((i) => { ringNode[i] = addNode({ id: `${joinSet.has(i) ? 'R' : 'T'}${Math.round(cum[i])}`, x: ring[i][0], z: ring[i][1], kind: joinSet.has(i) ? 'ring' : 'tap', inside: false, ri: i }); });
const tapNode = new Map<M8Pt, number>(); for (const t of taps) if (t.road === 'ring') tapNode.set(t, ringNode[t.i]);
for (let k = 0; k < ringKeys.length; k++) { const i = ringKeys[k], j = ringKeys[(k + 1) % ringKeys.length]; const geo: number[][] = []; for (let q = i; ; q = (q + 1) % ring.length) { geo.push(ring[q]); if (q === j) break; if (geo.length > ring.length + 2) break; }
  const len = j > i ? cum[j] - cum[i] : ringLen - cum[i] + cum[j]; mkLink(`ring ${nodes[ringNode[i]].id}-${nodes[ringNode[j]].id}`, ringNode[i], ringNode[j], len, true, 4, 'ring M8', 'ring', geo); }
const J1n = addNode({ id: 'J1', x: -87, z: -277, kind: 'j1', inside: true });
for (const a of J1_ARM_DATA) {
  const aTaps = taps.filter((t) => t.road === a.name).sort((p, q) => p.i - q.i);
  const joinN = ringNode[joinIdx[a.name.slice(-1)]]; const chain: { n: number; i: number }[] = [{ n: J1n, i: 0 }];
  for (const t of aTaps) { const n = addNode({ id: `T-${a.name.slice(-1)}${t.i * 10}`, x: t.x, z: t.z, kind: 'tap', inside: true }); tapNode.set(t, n); chain.push({ n, i: t.i }); }
  chain.push({ n: joinN, i: a.pts.length - 1 });
  for (let k = 0; k + 1 < chain.length; k++) { const i0 = chain[k].i, i1 = chain[k + 1].i; let L = 0; for (let q = i0 + 1; q <= i1; q++) L += Math.hypot(a.pts[q][0] - a.pts[q - 1][0], a.pts[q][1] - a.pts[q - 1][1]); if (k === 0) L += 270;
    mkLink(k === 0 && chain.length === 2 ? a.name : `${a.name} part ${k + 1}`, chain[k].n, chain[k + 1].n, L, true, 4, 'arm M8', 'in', a.pts.slice(i0, i1 + 1)); }
}
const isl = ISLAND_LINK_DATA; const islN = addNode({ id: 'island centre', x: isl.pts[isl.pts.length - 1][0], z: isl.pts[isl.pts.length - 1][1], kind: 'island', inside: false });
mkLink('M6-1 island link', ringNode[joinIdx.S], islN, isl.s[isl.s.length - 1] + 25, true, 3, 'island M6', 'out', isl.pts);
const tazIdx: number[] = [];
for (const z of zones) tazIdx.push(addNode({ id: z.id, x: z.cx, z: z.cz, kind: isIslandZone(z) ? 'island' : 'taz', zone: z }));
zones.forEach((z: any, zi: number) => { if (isIslandZone(z)) mkLink(`cand ${z.id}-island centre`, tazIdx[zi], islN, Math.hypot(z.cx - nodes[islN].x, z.cz - nodes[islN].z) * PAR.circuity, false, 0, 'cand', 'out'); });
for (const a of atts) { const A = nodes[tazIdx[a.zi]]; const bi = 'tap' in a.to ? tapNode.get(a.to.tap)! : tazIdx[a.to.zone]; mkLink(`cand ${A.id}-${nodes[bi].id}`, tazIdx[a.zi], bi, a.d * PAR.circuity, false, 0, 'cand', A.inside ? 'in' : 'out'); }
for (const [i, j, d] of extras) mkLink(`cand ${nodes[tazIdx[i]].id}-${nodes[tazIdx[j]].id} (loop)`, tazIdx[i], tazIdx[j], d * PAR.circuity, false, 0, 'cand', nodes[tazIdx[i]].inside ? 'in' : 'out');
const comp = () => { const c = nodes.map((_, i) => i); const f = (x: number): number => (c[x] === x ? x : (c[x] = f(c[x]))); for (const l of links) c[f(l.a)] = f(l.b); return nodes.map((_, i) => f(i)); };

// ---------------- R1: PLANARIZE the candidates (no two corridors cross; a crossing becomes a junction placeholder J-xx, both corridors are split there)
const dropped2: string[] = [];
const junctions: { id: string; x: number; z: number; a: string; b: string }[] = [];
for (let guard = 0; guard < 400; guard++) {
  let hit: [number, number, number[]] | null = null;
  outer: for (let i = 0; i < links.length; i++) { if (links[i].fixed) continue; const A = nodes[links[i].a], B = nodes[links[i].b];
    for (let j = i + 1; j < links.length; j++) { if (links[j].fixed) continue; const C = nodes[links[j].a], D = nodes[links[j].b];
      if (segX2([A.x, A.z], [B.x, B.z], [C.x, C.z], [D.x, D.z])) { const d1 = o3([A.x, A.z], [B.x, B.z], [C.x, C.z]), d2 = o3([A.x, A.z], [B.x, B.z], [D.x, D.z]); const t = d1 / (d1 - d2); hit = [i, j, [C.x + t * (D.x - C.x), C.z + t * (D.z - C.z)]]; break outer; } } }
  if (!hit) break;
  const [i, j, P] = hit;
  // X1 staggering: a junction placeholder needs 60 m to every other node; if the crossing is closer, an unsplit corridor (the longer one) is dropped instead of a cramped junction; if both are already fragments the junction is made and the check below reports it
  if (nodes.some((q) => Math.hypot(q.x - P[0], q.z - P[1]) < 60)) { const elig = [i, j].filter((k) => !links[k].id.includes('[')); if (elig.length) { const drop = elig.length === 2 ? (links[i].len >= links[j].len ? i : j) : elig[0]; dropped2.push(links[drop].id); links.splice(drop, 1); continue; } }
  const jid = `J-${String(junctions.length + 1).padStart(2, '0')}`;
  const pn = addNode({ id: jid, x: P[0], z: P[1], kind: 'jx' });
  junctions.push({ id: jid, x: P[0], z: P[1], a: links[i].id.replace('cand ', ''), b: links[j].id.replace('cand ', '') });
  for (const li of [i, j]) { const l = links[li]; const A = nodes[l.a], B = nodes[l.b]; const dA = Math.hypot(P[0] - A.x, P[1] - A.z), dB = Math.hypot(P[0] - B.x, P[1] - B.z); const f = dA / (dA + dB);
    const b0 = l.b; l.b = pn; const baseId = l.id; l.id = `${baseId} [to ${jid}]`; const len0 = l.len; l.len = len0 * f;
    links.push({ ...l, id: `${baseId} [from ${jid}]`, a: pn, b: b0, len: len0 * (1 - f) }); }
}
// ---------------- trips + assignment
const adj: number[][] = nodes.map(() => []); links.forEach((l, i) => { adj[l.a].push(i); adj[l.b].push(i); });
const tmin = (l: Link) => (l.len / 1000 / l.spd) * 60;
function dijkstra(s: number) { const d = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1); d[s] = 0; const q = new Set(nodes.map((_, i) => i));
  while (q.size) { let u = -1; for (const i of q) if (u < 0 || d[i] < d[u]) u = i; q.delete(u); if (d[u] === Infinity) break; for (const li of adj[u]) { const l = links[li]; const v = l.a === u ? l.b : l.a; const nd = d[u] + tmin(l); if (nd < d[v]) { d[v] = nd; prev[v] = li; } } } return { d, prev }; }
const Psum = zones.reduce((s: number, z: any) => s + z.prod, 0), Asum = zones.reduce((s: number, z: any) => s + z.attr, 0);
const Pz = zones.map((z: any) => z.prod * SCALE), Az = zones.map((z: any) => (z.attr * Psum) / Asum * SCALE), Tz = zones.map((z: any) => z.trucks * SCALE);
const hist: Link['flow'][][] = []; let lastAssigned = 0;
for (let it = 1; it <= PAR.iters; it++) {
  const flow = new Array(links.length).fill(0); let assigned = 0;
  zones.forEach((zo: any, a: number) => {
    const { d, prev } = dijkstra(tazIdx[a]);
    const route = (b: number, q: number) => { let v = tazIdx[b]; while (v !== tazIdx[a]) { const li = prev[v]; if (li < 0) return; flow[li] += q; v = links[li].a === v ? links[li].b : links[li].a; } };
    const w = zones.map((_: any, b: number) => (b === a ? 0 : Az[b] * Math.exp(-PAR.decay * d[tazIdx[b]]))); const ws = w.reduce((s: number, x: number) => s + x, 0);
    const wt = zones.map((_: any, b: number) => (b === a ? 0 : Az[b] * Math.exp(-PAR.truckDecay * d[tazIdx[b]]))); const wts = wt.reduce((s: number, x: number) => s + x, 0);
    zones.forEach((_: any, b: number) => { if (b === a) return;
      const q = ws > 0 ? (Pz[a] * w[b]) / ws * PAR.vehPerPersonTrip : 0; const qt = wts > 0 ? (Tz[a] * wt[b]) / wts * PAR.pcuPerTruck : 0; route(b, q + qt); assigned += q + qt; });
  });
  lastAssigned = assigned; hist.push(flow.slice() as any);
  // MSA average -> link flow, then update class speeds of candidates
  links.forEach((l, i) => { l.flow = hist.reduce((s, f) => s + (f as any)[i], 0) / hist.length; const c = classOf(l, l.flow); l.cls = c.cls; l.spd = SPEED[c.cls] ?? 35; if (l.fixed) l.spd = l.lanesDir === 4 ? 100 : 90; });
}
// ---------------- lane ladder
function classOf(l: Link, aadt: number): { cls: string; perDir: number } {
  const V = aadt * PAR.K * PAR.D;
  if (l.fixed) return { cls: l.lanesDir === 4 ? 'M8' : 'M6', perDir: l.lanesDir };
  if (l.side === 'out' && V > 1000) { const n = Math.max(2, Math.ceil(V / PAR.cMot)); return { cls: n >= 4 ? 'M8' : n === 3 ? 'M6' : 'M4', perDir: Math.min(n, 4) }; }
  if (aadt < PAR.minAadt) return { cls: 'none', perDir: 0 };
  const n = Math.ceil(V / PAR.cArtD); if (n >= 3) return { cls: 'A-D6', perDir: Math.min(n, 3) + (n > 3 ? 0 : 0) };
  if (n === 2) return { cls: 'A-D4', perDir: 2 }; return { cls: 'A-2', perDir: 1 };
}
const res = links.map((l) => ({ l, ...classOf(l, l.flow), road: l.fixed || classOf(l, l.flow).cls !== 'none', V: l.flow * PAR.K * PAR.D, need: l.flow < PAR.minAadt ? 0 : Math.ceil((l.flow * PAR.K * PAR.D) / (l.side === 'out' ? PAR.cMot : PAR.cArtD)) }));
// (user rule 2026-11-15: the lane count follows the DEMAND; any step 8 -> 4, 8 -> 2, 6 -> 2 ... is allowed at a node; the old 'one step only' smoothing is removed)

// ---------------- report
const log = (...a: any[]) => { if (!QUIET) console.log(...a); };
const f0 = (v: number) => Math.round(v).toLocaleString('en-US');
log(`DEMAND + LANE LADDER (Step A3)   ALL parameters are PROPOSALS: ${JSON.stringify(PAR)}`);
log(`network: ${nodes.length} nodes (${ringKeys.length} ring nodes incl. ${taps.filter((t) => t.road === 'ring').length} taps, ${taps.filter((t) => t.road !== 'ring').length} arm taps, J1, island centre, ${tazIdx.length} zones), ${links.length} links (${links.filter((l) => l.fixed).length} fixed, ${links.filter((l) => !l.fixed).length} candidate corridors); zones kept ${zones.length} of ${A2.zones.length} (dropped ${dropped.length} zones with ${f0(droppedTrips)} trips = ${((droppedTrips / (A2.totals.prod + A2.totals.attr)) * 100).toFixed(1)} %)`);
log('\nFIXED LINKS: flow, design hour, capacity and v/c (one direction)');
log('link                                          len m   AADT veh+pcu   V dir/h   lanes/dir  capacity/dir   v/c');
for (const r of res.filter((q) => q.l.fixed)) { const cap = r.l.lanesDir * PAR.cMot; log(`${r.l.id.slice(0, 44).padEnd(44)} ${f0(r.l.len).padStart(7)} ${f0(r.l.flow).padStart(12)} ${f0(r.V).padStart(9)} ${String(r.l.lanesDir).padStart(9)} ${f0(cap).padStart(12)}  ${(r.V / cap).toFixed(2).padStart(6)}`); }
log('\nCANDIDATE CORRIDORS that carry traffic (class from the flow; none = under ' + PAR.minAadt + ' AADT = local / rural road, designed later)');
log('corridor                                          len m   AADT     V dir/h  class  lanes/dir  total lanes  lanes/dir needed');
for (const r of res.filter((q) => !q.l.fixed).sort((a, b) => b.l.flow - a.l.flow)) log(`${r.l.id.slice(0, 48).padEnd(48)} ${f0(r.l.len).padStart(7)} ${f0(r.l.flow).padStart(8)} ${f0(r.V).padStart(9)}  ${r.cls.padEnd(5)} ${String(r.perDir).padStart(9)} ${String(r.perDir * 2).padStart(11)}  ${String(r.need).padStart(10)}${r.need > (r.l.side === 'out' ? 4 : 3) ? '   > max single road: parallel roads / grid needed' : ''}`);
const km: Record<string, number> = {}; for (const r of res) km[r.cls] = (km[r.cls] ?? 0) + r.l.len / 1000;
log('\nLENGTH BY CLASS (km): ' + Object.entries(km).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
// ring junction usage = which ring nodes are used by candidate corridors (input of B-J, ring interchange schedule)
log('\nRING NODES used by candidate corridors (AADT of the corridors that touch the node; input of the junction schedule B-J, at most 5 extra fit, 17.1):');
for (const ni of nodes.map((_, i) => i).filter((i) => nodes[i].kind === 'ring' || nodes[i].kind === 'tap')) { const u = res.filter((r) => !r.l.fixed && r.cls !== 'none' && (r.l.a === ni || r.l.b === ni)); if (u.length || nodes[ni].kind === 'ring') log(`  ${nodes[ni].id.padEnd(9)} ${nodes[ni].kind === 'ring' ? '(arm join)' : '(tap)     '} corridors ${u.length}  AADT ${f0(u.reduce((s2, r) => s2 + r.l.flow, 0)).padStart(8)}  ${u.map((r) => r.l.id.replace('cand ', '')).join(' | ')}`); }
// checks
let pass = 0, fail = 0; const chk = (ok: boolean, t: string) => { log(`${ok ? 'PASS' : 'FAIL'}  ${t}`); ok ? pass++ : fail++; };
log('\nCHECKS (numbers only)');
const c0 = comp(); chk(new Set(c0).size === 1, `network connected (${new Set(c0).size} component)`);
// R1 independent check on the FINAL links (own loops, not the construction code): skip only pieces within 40 m of a ring / J1 end node (the corridor starts on the road there)
let fx = 0; const fxNames: string[] = []; for (const l of links.filter((q) => !q.fixed)) { const A = nodes[l.a], B = nodes[l.b]; if (A.kind === 'island' || B.kind === 'island') continue; const c = fixedCrossings(A, B, 40, fxNames); if (c) fx += c; }
chk(fx === 0, `R1 no corridor crosses a FIXED road (ring, 4 J1 arms, island link) or runs through the J1 plaza: ${fx} crossings${fx ? ' (' + fxNames.join(', ') + ')' : ''}`);
let cc = 0; const ccL: string[] = []; const cl = links.filter((q) => !q.fixed); for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const A = nodes[cl[i].a], B = nodes[cl[i].b], C = nodes[cl[j].a], D = nodes[cl[j].b]; if (segX2([A.x, A.z], [B.x, B.z], [C.x, C.z], [D.x, D.z])) { cc++; ccL.push(cl[i].id + ' x ' + cl[j].id); } }
chk(cc === 0, `R1 no two corridors cross each other (a crossing is a junction placeholder with both roads split): ${cc} crossings${cc ? ' (' + ccL.slice(0, 5).join('; ') + ')' : ''}`);
// every junction placeholder: 4 corridor ends (two roads split), spacing to the nearest other node
const minJ0f = () => { let m = 1e9; nodes.forEach((n, i) => { if (n.kind === 'jx') nodes.forEach((q, k) => { if (k !== i) m = Math.min(m, Math.hypot(n.x - q.x, n.z - q.z)); }); }); return m; };
const minJ0 = minJ0f();
const jxNodes = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === 'jx');
chk(minJ0 >= 60, `R1 every junction placeholder is at least 60 m from every other node (X1): min ${jxNodes.length ? f0(minJ0) : '-'} m; ${dropped2.length} corridor(s) dropped because the crossing was closer: ${dropped2.join(', ') || 'none'}`);
chk(jxNodes.every(({ i }) => links.filter((l) => l.a === i || l.b === i).length === 4), `R1 every junction placeholder joins exactly 4 corridor ends (two roads split by each other): ${jxNodes.length} placeholders`);
let minJ = 1e9; for (const { n, i } of jxNodes) for (let k = 0; k < nodes.length; k++) if (k !== i) minJ = Math.min(minJ, Math.hypot(n.x - nodes[k].x, n.z - nodes[k].z));
log(`INFO  junction placeholders ${jxNodes.length}: ${junctions.map((q) => `${q.id} (${f0(q.x)}, ${f0(q.z)}) ${q.a} x ${q.b}`).join(' | ') || 'none'}; nearest other node ${jxNodes.length ? f0(minJ) + ' m' : '-'} (rule 3.11 X1: staggered junctions at least 60 m apart)`);
// R2: no road without need
const roadsOut = res.filter((r) => !r.l.fixed && r.road), noRoad = res.filter((r) => !r.l.fixed && !r.road);
chk(roadsOut.every((r) => r.l.flow >= PAR.minAadt), `R2 every drawn corridor carries at least ${PAR.minAadt} AADT: ${roadsOut.length} roads drawn, ${noRoad.length} corridors under the limit get NO road in A3 (local / rural access is designed in C, not here)`);
// zones left without any arterial / collector corridor (they will be served by housing / rural roads in C)
const zoneNoRoad = tazIdx.filter((ti) => !roadsOut.some((r) => r.l.a === ti || r.l.b === ti)); log(`INFO  ${zoneNoRoad.length} of ${tazIdx.length} zones have no A3 road of their own (they use the nearest road; C / D design their access): ${zoneNoRoad.map((ti) => nodes[ti].id).join(', ')}`);
const tooBig = res.filter((r) => !r.l.fixed && r.need > (r.l.side === 'out' ? 4 : 3));
log(`INFO  ${tooBig.length} corridors need more lanes than one road gives (inside > 3 per direction, outside > 4): ${tooBig.map((r) => r.l.id.replace('cand ', '') + ' (' + r.need + ')').join(', ')} -> the city needs PARALLEL streets (grid), designed in phase C / D`);
const fixedOver = res.filter((r) => r.l.fixed && r.V / (r.l.lanesDir * PAR.cMot) > 1);
chk(fixedOver.length === 0, `no fixed road over capacity (v/c <= 1): ${fixedOver.length} over${fixedOver.length ? ' (' + fixedOver.map((r) => r.l.id + ' ' + (r.V / (r.l.lanesDir * PAR.cMot)).toFixed(2)).join(', ') + ')' : ''}`);
const totVeh = zones.reduce((s: number, z: any, i: number) => s + Pz[i] * PAR.vehPerPersonTrip + Tz[i] * PAR.pcuPerTruck, 0);
chk(Math.abs(lastAssigned - totVeh) / totVeh < 0.005, `trip conservation: assigned ${f0(lastAssigned)} of ${f0(totVeh)} vehicle + pcu trips generated per day (within 0.5 %)`);
// (user rule) lane steps are free; they must only happen at a NODE (every link ends at a node by construction). Report the biggest step by demand.
let maxStep = 0, stepAt = ''; nodes.forEach((n, ni) => { const inc = res.filter((r) => r.road && (r.l.a === ni || r.l.b === ni)); for (let x = 0; x < inc.length; x++) for (let y = x + 1; y < inc.length; y++) { const st = Math.abs(inc[x].perDir - inc[y].perDir); if (st > maxStep) { maxStep = st; stepAt = n.id; } } });
log(`INFO  lane steps follow the demand (user rule): biggest difference between two roads at one node is ${maxStep} lanes per direction (at ${stepAt}); any step is allowed, it is built with an exit lane / taper at the node (3.13)`);
// R5 (user rule): J1 and the four ring x arm joins take NO branch: only the fixed M8 pieces touch them
const hubIds = new Set([J1n, ...[...joinSet].map((i) => ringNode[i])]); const hubBad = links.filter((l) => !l.fixed && (hubIds.has(l.a) || hubIds.has(l.b)));
chk(hubBad.length === 0, `R5 no branch leaves J1 or one of the 4 ring x arm joins: ${hubBad.length} branches${hubBad.length ? ' (' + hubBad.map((l) => l.id).join(', ') + ')' : ''}`);
// R6 (user rule): taps are at least tapSpacing apart on the M8 and from the joins (independent recompute from the node list)
const tapN = nodes.filter((n) => n.kind === 'tap'); let tapMin = 1e9; for (const t of tapN) for (const o of nodes) if (o !== t && (o.kind === 'tap' || o.kind === 'ring')) tapMin = Math.min(tapMin, Math.hypot(t.x - o.x, t.z - o.z));
chk(tapN.length === 0 || tapMin >= PAR.tapSpacing - 1, `R6 branches leave the M8 only at taps at least ${PAR.tapSpacing} m from every other tap and join (3.8): ${tapN.length} taps, closest pair ${tapN.length ? f0(tapMin) : '-'} m`);
// nearest-road rule: list every zone connection (zone -> target, chord length); no check passes on this, the user reads the list
log('INFO  ZONE CONNECTIONS (zone -> nearest road or zone, straight distance m):'); for (const a of atts) log(`        ${zones[a.zi].id.padEnd(16)} -> ${('tap' in a.to ? `M8 tap on ${a.to.tap.road}` : zones[a.to.zone].id).padEnd(24)} ${f0(a.d)}`);
const ringMax = Math.max(...res.filter((r) => r.l.kind === 'ring M8').map((r) => r.l.flow));
log(`INFO  ring AADT max ${f0(ringMax)} (plan value 120 000 in 3.13 is a planning figure, not a check; v/c is in the FIXED LINKS table)`);
log(`\n${pass} PASS, ${fail} FAIL (numbers only; no src/ file changed; game NOT run)`);
console.log(`SUMMARY SCALE ${SCALE}: persons ${f0(A2.totals.pop * SCALE)}, ring AADT max ${f0(ringMax)} (v/c ${(Math.max(...res.filter((r) => r.l.kind === 'ring M8').map((r) => r.V / 7200))).toFixed(2)}), arms AADT max ${f0(Math.max(...res.filter((r) => r.l.kind === 'arm M8').map((r) => r.l.flow)))}, km by class ${Object.entries(km).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ')}; ${pass} PASS ${fail} FAIL`);
function polyOf(l: Link): number[][] { const r1 = (p: number[]) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; const g = l.geo ?? []; const st = Math.max(1, Math.floor(g.length / 60)); return g.filter((_, k) => k % st === 0 || k === g.length - 1).map(r1); }
writeFileSync(`${out}/a3_demand_x${SCALE}.json`, JSON.stringify({ PAR, nodes: nodes.map((n) => ({ id: n.id, x: n.x, z: n.z, kind: n.kind })), links: res.map((r) => ({ id: r.l.id, a: r.l.a, b: r.l.b, len: r.l.len, fixed: r.l.fixed, aadt: r.l.flow, V: r.V, cls: r.cls, perDir: r.perDir, kind: r.l.kind, road: r.road, pts: r.l.fixed ? polyOf(r.l) : undefined })), junctions, km }));
