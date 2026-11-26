// ROAD SIGN LETTERING (STEP SIGN-FIX-2): for every gantry and for each of its two faces (A = traffic of growing s, B = the other way) picks the nearest places AHEAD and measures the REAL ROAD distance
// (Dijkstra over all road points, roads joined at the nodes of buildJunctionRegistry; the first step leaves the gantry in the travel direction). Writes src/signs/RoadSignText.ts.
//   npx tsx scripts/gen-road-sign-text.ts          (writes)        npx tsx scripts/gen-road-sign-text.ts --check   (prints only)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildJunctionRegistry } from '../src/roads/JunctionRegistry';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { SIGN_PLACES } from '../src/signs/RoadSignPlaces';

const check = process.argv.includes('--check');
const g: any = new TerrainGenerator(Config.world.seed);
const roads: any[] = g.roads.roads.filter((r: any) => !r.earth);
const base: number[] = [];
let N = 0;
for (const r of roads) { base.push(N); N += r.xs.length; }
const PX = new Float64Array(N), PZ = new Float64Array(N);
const adj: { to: number; w: number }[][] = Array.from({ length: N }, () => []);
const link = (a: number, b: number, w: number): void => { adj[a].push({ to: b, w }); adj[b].push({ to: a, w }); };
roads.forEach((r, ri) => {
  for (let k = 0; k < r.xs.length; k++) { PX[base[ri] + k] = r.xs[k]; PZ[base[ri] + k] = r.zs[k]; }
  for (let k = 0; k + 1 < r.xs.length; k++) link(base[ri] + k, base[ri] + k + 1, Math.hypot(r.xs[k + 1] - r.xs[k], r.zs[k + 1] - r.zs[k]));
});
const idToIdx = new Map<number, number>();
roads.forEach((r, ri) => idToIdx.set(r.id, ri));
function nearestOn(ri: number, x: number, z: number): { idx: number; d: number } {
  const r = roads[ri];
  let bi = 0, bd = 1e12;
  for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - x, r.zs[k] - z); if (d < bd) { bd = d; bi = k; } }
  return { idx: base[ri] + bi, d: bd };
}
const reg = buildJunctionRegistry(g.roads.roads);
let joins = 0;
for (const nd of reg.nodes as any[]) {
  const pts: number[] = [];
  for (const l of nd.legs) { const ri = idToIdx.get(l.roadId); if (ri === undefined) continue; const q = nearestOn(ri, nd.x, nd.z); if (q.d < 60) pts.push(q.idx); }
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if (pts[a] !== pts[b]) { link(pts[a], pts[b], Math.hypot(PX[pts[a]] - PX[pts[b]], PZ[pts[a]] - PZ[pts[b]])); joins++; }
}
// grid of all points for snapping places
const CELL = 100;
const grid = new Map<string, number[]>();
for (let i = 0; i < N; i++) { const k = Math.floor(PX[i] / CELL) + ',' + Math.floor(PZ[i] / CELL); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i); }
function snap(x: number, z: number, reach: number): { idx: number; d: number } | null {
  let bi = -1, bd = reach;
  const c = Math.ceil(reach / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) for (const p of grid.get(cx + i + ',' + (cz + j)) ?? []) { const d = Math.hypot(PX[p] - x, PZ[p] - z); if (d < bd) { bd = d; bi = p; } }
  return bi < 0 ? null : { idx: bi, d: bd };
}
// extra joins: (1) a road END within 60 m of another road (a junction the registry did not list), (2) points of two different roads closer than 14 m at the same level (|dy| < 2.5 m)
const ROADOF = new Int32Array(N);
roads.forEach((r, ri) => { for (let k = 0; k < r.xs.length; k++) ROADOF[base[ri] + k] = ri; });
const YY = new Float64Array(N);
roads.forEach((r, ri) => { for (let k = 0; k < r.xs.length; k++) YY[base[ri] + k] = r.ys[k]; });
let extra = 0;
const seen = new Set<string>();
const addJoin = (a: number, b: number): void => { const key = a < b ? a + '_' + b : b + '_' + a; if (seen.has(key)) return; seen.add(key); link(a, b, Math.hypot(PX[a] - PX[b], PZ[a] - PZ[b])); extra++; };
for (let i = 0; i < N; i++) {
  const ri = ROADOF[i];
  const isEnd = i === base[ri] || i === base[ri] + roads[ri].xs.length - 1;
  const reach = isEnd ? 60 : 14;
  const c = Math.ceil(reach / CELL);
  const cx = Math.floor(PX[i] / CELL), cz = Math.floor(PZ[i] / CELL);
  let best = -1, bd = reach;
  for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) for (const q of grid.get(cx + a + ',' + (cz + b)) ?? []) {
    if (ROADOF[q] === ri) continue;
    const d = Math.hypot(PX[q] - PX[i], PZ[q] - PZ[i]);
    if (d >= bd || Math.abs(YY[q] - YY[i]) > (isEnd ? 4 : 2.5)) continue;
    if (isEnd) { bd = d; best = q; } else addJoin(i, q);
  }
  if (isEnd && best >= 0) addJoin(i, best);
}
joins += extra;
const places = SIGN_PLACES.map((p) => ({ p, s: snap(p.x, p.z, p.major ? 900 : 700) }));

class Heap { a: [number, number][] = []; push(d: number, v: number): void { const a = this.a; a.push([d, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } } pop(): [number, number] | undefined { const a = this.a; if (!a.length) return undefined; const t = a[0]; const l = a.pop()!; if (a.length) { a[0] = l; let i = 0; for (;;) { let m = i; const L = 2 * i + 1, R = L + 1; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; } }
function dijkstra(start: number, first: number): Float64Array {
  const dist = new Float64Array(N).fill(1e12);
  const h = new Heap();
  dist[start] = 0;
  const w0 = Math.hypot(PX[first] - PX[start], PZ[first] - PZ[start]);
  dist[first] = w0;
  h.push(w0, first);
  let t: [number, number] | undefined;
  while ((t = h.pop())) { const [d, v] = t; if (d > dist[v]) continue; if (d > 30000) break; for (const e of adj[v]) { if (e.to === start) continue; const nd = d + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; h.push(nd, e.to); } } }
  return dist;
}

interface Row { arrow: 'up'; bn: string; en: string; km: number }
const MIN_KM = 0.4, MAX_KM = 25;
function pick(dist: Float64Array, n: number): Row[] {
  const cand = places.filter((q) => q.s).map((q) => ({ q, km: (dist[q.s!.idx] + q.s!.d) / 1000 })).filter((c) => c.km >= MIN_KM && c.km <= MAX_KM).sort((a, b) => a.km - b.km);
  const out: typeof cand = [];
  const far = (c: (typeof cand)[number]): boolean => out.every((o) => Math.hypot(o.q.p.x - c.q.p.x, o.q.p.z - c.q.p.z) > 700);
  const major = cand.find((c) => c.q.p.major && c.km <= 14);
  if (major) out.push(major);
  for (const c of cand) { if (out.length >= n) break; if (!out.includes(c) && far(c)) out.push(c); }
  out.sort((a, b) => a.km - b.km);
  return out.map((c) => ({ arrow: 'up', bn: c.q.p.bn, en: c.q.p.en, km: Math.round(c.km * 10) / 10 }));
}

console.log('places snapped:', places.filter((q)=>q.s).length, '/', places.length, places.filter((q)=>!q.s).map((q)=>q.p.id).join(','));
const res: Record<string, { a: Row[]; b: Row[]; road: string; len: number }> = {};
const log: string[] = [];
const missing: string[] = [];
for (const s of ROAD_SIGN_SPOTS) {
  const ri = roads.findIndex((r) => r.name === s.road);
  if (ri < 0) { missing.push(s.id + ' ' + s.road); continue; }
  const r = roads[ri];
  let k = 0, bd = 1e12;
  for (let q = 0; q < r.cum.length; q++) { const d = Math.abs(r.cum[q] - s.s); if (d < bd) { bd = d; k = q; } }
  const start = base[ri] + k;
  const fwd = k + 1 < r.xs.length ? dijkstra(start, start + 1) : null;
  const bwd = k > 0 ? dijkstra(start, start - 1) : null;
  const n = s.sections;
  res[s.id] = { a: fwd ? pick(fwd, n) : [], b: bwd ? pick(bwd, n) : [], road: s.road, len: Math.round(r.length) };
  log.push(`${s.id} ${s.road} (${(r.length / 1000).toFixed(1)} km) A: ${res[s.id].a.map((x) => `${x.en} ${x.km}`).join(' | ')}   B: ${res[s.id].b.map((x) => `${x.en} ${x.km}`).join(' | ')}`);
}
console.log(log.join('\n'));
const short = Object.entries(res).filter(([id, v]) => { const sp = ROAD_SIGN_SPOTS.find((q) => q.id === id)!; return v.a.length < sp.sections || v.b.length < sp.sections; }).map(([id, v]) => `${id} ${v.road} A${v.a.length} B${v.b.length}`);
console.log(`\ngraph: ${N} points, ${joins} junction joins; ${Object.keys(res).length} gantries lettered; faces with fewer destinations than sections: ${short.length}\n${short.join('\n')}\nmissing roads: ${missing.join(', ') || 'none'}`);
if (!check) {
  const body = JSON.stringify(res).replace(/"([a-z]+)":/g, '$1:').replace(/\},"(sign-\d+)":/g, '},\n  "$1":').replace(/^\{/, '{\n  ').replace(/\}$/, '\n}');
  const head = `// GENERATED by scripts/gen-road-sign-text.ts (npx tsx scripts/gen-road-sign-text.ts) - do not edit by hand. Data only.\n// STEP SIGN-FIX-2: the lettering of every gantry / overbridge: a = face of the traffic of growing s, b = face of the other way; one destination per coloured section, km = REAL ROAD distance from the sign.\n// road / len = the road the sign stands on and its total length (m), for the strip under the destinations.\nimport type { SignRow } from './RoadSignSpec';\n\nexport interface SignText { a: SignRow[]; b: SignRow[]; road: string; len: number }\n\nexport const ROAD_SIGN_TEXT: Readonly<Record<string, SignText>> = ${body};\n`;
  writeFileSync('src/signs/RoadSignText.ts', head.replace(/\n/g, '\r\n'));
  console.log('wrote src/signs/RoadSignText.ts');
}
