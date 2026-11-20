// VACANT PLOTS -> game. Reads the plot map JSON (EVCity_Plots_1500m_spaced1.2.json), keeps every kind 'vacant' plot that is completely free in the REAL game data,
// and writes src/buildings/PlacementsVacant.ts (+ docs/city_vacant_report.txt). A plot that is not free is NOT placed (listed with the reason, never forced).
// Free = no road (ribbon + footpath edge), no rail corridor, no water, no hand placed / plot building, no old city plot (STEP 3), no other vacant plot.
// City fill / residential houses inside a vacant plot are NOT a reason: the game drops them (PlacementsResidential.ts), their number is printed.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-vacant-build.ts docs/EVCity_Plots_1500m_spaced1.2.json
import { readFileSync, writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { RESIDENTIAL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { CITY_PLOTS } from '../src/buildings/PlacementsPlots';

type Pt = [number, number];
const gen: any = new TerrainGenerator(Config.world.seed);
const R = gen.roads, rail = gen.railForm;
const WALK = Config.city.roadside.sidewalk, C = Config.city.roadSections;
const FOOT = C.highway.kerbW + C.highway.verge + C.highway.walk;
const CELL = 100;
const grid = new Map<string, { x: number; z: number; w: number; name: string }[]>();
for (const r of R.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      const city = R.isCityPoint(x, z) || r.tier === 4;
      const w = r.halfWidth + (city ? Math.max(FOOT, r.shoulder, WALK) : r.shoulder);
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      const a = grid.get(key), p = { x, z, w, name: r.name ?? String(r.id) };
      if (a) a.push(p); else grid.set(key, [p]);
    }
  }
}
const ROAD_TOL = Number(process.env.ROAD_TOL ?? 0.2);     // m the road edge may reach into a plot (the front edge sits at the footpath edge)
function roadDepth(x: number, z: number): { name: string; depth: number } | null {   // how far the road edge (ribbon + footpath) reaches past this point
  let best: { name: string; depth: number } | null = null;
  for (let a = Math.floor((x - 40) / CELL); a <= Math.floor((x + 40) / CELL); a++) for (let b = Math.floor((z - 40) / CELL); b <= Math.floor((z + 40) / CELL); b++)
    for (const p of grid.get(`${a},${b}`) ?? []) { const d = p.w - Math.hypot(p.x - x, p.z - z); if (d > ROAD_TOL && (!best || d > best.depth)) best = { name: p.name, depth: d }; }
  return best;
}
function sat(p: Pt[], q: Pt[], m = 0): boolean {          // convex polygons overlap (m = extra clearance)
  for (const poly of [p, q]) for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!, b = poly[(k + 1) % poly.length]!;
    let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const pa = p.map((c) => c[0] * nx + c[1] * nz), qa = q.map((c) => c[0] * nx + c[1] * nz);
    if (Math.max(...pa) + m <= Math.min(...qa) || Math.max(...qa) + m <= Math.min(...pa)) return false;
  }
  return true;
}
function rectOf(b: { x: number; z: number; yaw: number; W: number; D: number }): Pt[] {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2;
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as Pt[]).map(([lx, lz]) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c] as Pt);
}
const inFile = process.argv[2] ?? 'docs/EVCity_Plots_1500m_spaced1.2.json';
const J = JSON.parse(readFileSync(inFile, 'utf8')).plots.filter((p: any) => p.kind === 'vacant');
const out: any[] = [], rej: string[] = [];
const sc: any = {};
const hand = BUILDING_PLACEMENTS.map((b) => ({ b, r: rectOf(b) }));
const old = CITY_PLOTS.map((p) => p.poly as Pt[]);
for (const p of J) {
  const pg: Pt[] = p.polygon, e: Pt = p.entry_point;
  let bk = 0, bd = 1e9;                                  // road-side edge = the edge nearest to the entry point
  for (let k = 0; k < 4; k++) {
    const a = pg[k]!, b = pg[(k + 1) % 4]!, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((e[0] - a[0]) * dx + (e[1] - a[1]) * dz) / L2));
    const d = Math.hypot(e[0] - a[0] - t * dx, e[1] - a[1] - t * dz);
    if (d < bd) { bd = d; bk = k; }
  }
  const q: Pt[] = [0, 1, 2, 3].map((i) => pg[(bk + i) % 4]!);   // corners 0-1 = road side edge, corner 3 beside corner 0 (PlotYards rule)
  const id = `V-${p.plot_id}`;
  const test = (qq: Pt[]): { why: string; rd: number; mn: number; mx: number } => {
    let why = '', mn = 1e9, mx = -1e9, rdMax = 0, rdName = '';
    const pts: Pt[] = [];   // 9 x 13 sample points inside the plot (2.5 m grid) + edges
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 12; j++) {
      const u = i / 8, v = j / 12;
      pts.push([(1 - u) * ((1 - v) * qq[0]![0] + v * qq[3]![0]) + u * ((1 - v) * qq[1]![0] + v * qq[2]![0]), (1 - u) * ((1 - v) * qq[0]![1] + v * qq[3]![1]) + u * ((1 - v) * qq[1]![1] + v * qq[2]![1])]);
    }
    for (const [x, z] of pts) {
      const rn = roadDepth(x, z); if (rn && rn.depth > rdMax) { rdMax = rn.depth; rdName = rn.name; }
      if (!why && rail.inCorridor(x, z, 0)) why = 'rail corridor';
      gen.sample(x, z, sc);
      if (!why && sc.water === sc.water && sc.h < sc.water + 0.3) why = 'water';
      mn = Math.min(mn, sc.h); mx = Math.max(mx, sc.h);
    }
    if (!why && rdMax > 0) why = `road ${rdName} reaches ${rdMax.toFixed(1)} m into the plot`;
    if (!why) for (const h of hand) if (sat(qq, h.r, -1)) { why = `building ${h.b.id}`; break; }
    if (!why) for (const o of old) if (sat(qq, o, -2)) { why = 'old city plot (STEP 3)'; break; }
    if (!why) for (const o of out) if (sat(qq, o.poly, -1)) { why = `vacant ${o.id}`; break; }
    return { why, rd: rdMax, mn, mx };
  };
  let t = test(q), gate: Pt = [e[0], e[1]], moved = 0;
  if (t.why.startsWith('road') && t.rd <= 3) {          // road edge (ribbon + footpath) reaches a little into the plot: slide the plot straight away from the road
    let ix = q[3]![0] - q[0]![0], iz = q[3]![1] - q[0]![1]; const il = Math.hypot(ix, iz); ix /= il; iz /= il;
    moved = t.rd + 0.2;
    const q2: Pt[] = q.map((c) => [c[0] + ix * moved, c[1] + iz * moved] as Pt);
    const t2 = test(q2);
    if (!t2.why) { for (let i = 0; i < 4; i++) q[i] = q2[i]!; gate = [e[0] + ix * moved, e[1] + iz * moved]; t = t2; } else t = { ...t2, why: t2.why + ' (after sliding ' + moved.toFixed(1) + ' m)' };
  }
  const why = t.why, mn = t.mn, mx = t.mx;
  if (why) { rej.push(`${id} road ${p.road} (${e[0].toFixed(0)}, ${e[1].toFixed(0)}): ${why}`); continue; }
  const cx = q.reduce((s, c) => s + c[0], 0) / 4, cz = q.reduce((s, c) => s + c[1], 0) / 4;
  let nx = q[3]![0] - q[0]![0], nz = q[3]![1] - q[0]![1]; const nl = Math.hypot(nx, nz); nx = -nx / nl; nz = -nz / nl;
  const area = Math.abs(((q[0]![0] * q[1]![1] - q[1]![0] * q[0]![1]) + (q[1]![0] * q[2]![1] - q[2]![0] * q[1]![1]) + (q[2]![0] * q[3]![1] - q[3]![0] * q[2]![1]) + (q[3]![0] * q[0]![1] - q[0]![0] * q[3]![1])) / 2);
  out.push({ id, prog: 'Vacant plot (wall, gate, trees)', kind: 'vacant', street: p.road, ha: +(area / 10000).toFixed(4), c: [+cx.toFixed(1), +cz.toFixed(1)], poly: q.map((c) => [+c[0].toFixed(1), +c[1].toFixed(1)]), gates: [[+gate[0].toFixed(1), +gate[1].toFixed(1)]], dir: [+nx.toFixed(4), +nz.toFixed(4)], range: +(mx - mn).toFixed(1), slid: +moved.toFixed(1) });
}
// houses of the city fill / residential set that stand inside an accepted vacant plot (the game drops them)
let houses = 0;
for (const b of [...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS]) {
  for (const o of out) {
    if (Math.abs(b.x - o.c[0]) > 40 || Math.abs(b.z - o.c[1]) > 40) continue;
    if (sat(o.poly, [[b.x - 0.1, b.z - 0.1], [b.x + 0.1, b.z - 0.1], [b.x + 0.1, b.z + 0.1], [b.x - 0.1, b.z + 0.1]])) { houses++; break; }
  }
}
const src = `// GENERATED by scripts/city-vacant-build.ts (vacant plots: boundary wall, gate on the road side only, small and big trees inside). Do not edit by hand: rerun the script.\r
// poly = 4 corners (corners 0-1 are the road-side edge), gates = gate centre on that edge, dir = unit vector plot -> street, world metres x east / z south.\r
import type { CityPlot } from './PlacementsPlots';\r
import { Config } from '../core/Config';\r
\r
export interface VacantPlot extends Omit<CityPlot, 'kind'> { kind: 'vacant' }\r
\r
const VACANT_ALL: readonly VacantPlot[] = [\r
${out.map((o) => '  ' + JSON.stringify({ id: o.id, prog: o.prog, kind: o.kind, street: o.street, ha: o.ha, c: o.c, poly: o.poly, gates: o.gates, dir: o.dir })).join(',\r\n')},\r
] as unknown as readonly VacantPlot[];\r
\r
`;
const old2 = readFileSync('src/buildings/PlacementsVacant.ts', 'utf8');
const tail = old2.slice(old2.indexOf('/** Config.city.plots.vacant'));
writeFileSync('src/buildings/PlacementsVacant.ts', src + tail);
const rep = [`vacant plots in the map ${J.length}; placed ${out.length}; NOT placed ${rej.length}; city fill / residential houses inside the placed plots (dropped by the game) ${houses}; max ground range under a plot ${Math.max(0, ...out.map((o) => o.range))} m; plots slid away from the road ${out.filter((o) => o.slid > 0).length} (max ${Math.max(0, ...out.map((o) => o.slid))} m)`, '', ...rej];
writeFileSync('docs/city_vacant_report.txt', rep.join('\n'));
console.log(rep.slice(0, 40).join('\n'));
