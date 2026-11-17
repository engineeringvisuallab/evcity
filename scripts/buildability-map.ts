// STEP A1 (headless): BUILDABILITY MAP of the whole 10 x 10 km map. Reads the world, changes nothing in src/.
// One raster (cell 50 m): water, rail corridor, fixed M8 / M6 right of way, facility / engineering land, slope class A-E.
// Then a table for the proposed housing areas (share of usable land) and the free land outside the fixed roads.
// Run: npx tsx scripts/buildability-map.ts <out-dir>     writes a1_buildability.json (for the picture) and prints the tables.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';
import { getWorldZoneAt, WORLD_ZONES } from '../src/city/WorldZones';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const CELL = 50, HALF = 5000, N = (2 * HALF) / CELL;
const RAIL_BUF = 30;           // rail corridor half width kept free (m): formation + clearance (proposal, rail itself is fixed)
const ROW_M8 = 40, ROW_M6 = 36.35, J1_PAD = 100;
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number) => { gen.sampleGround(x, z, sc); return { h: sc.h, w: sc.water }; };

// ---- fixed linear things as point lists
const rail: number[][] = [];
for (const e of gen.rail.edges) for (let j = 0; j < e.xs.length; j++) rail.push([e.xs[j], e.zs[j]]);
const ring: number[][] = readFileSync('docs/ring_samples_5m.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.split(','); return [+c[1], +c[2]]; });
const arms: number[][] = []; for (const a of J1_ARM_DATA) for (const p of a.pts) arms.push([p[0], p[1]]);
const isl: number[][] = ISLAND_LINK_DATA.pts.map((p) => [p[0], p[1]]);
const J1 = Config.roads.junctionJ1;

class Hash { m = new Map<number, number[][]>(); constructor(pts: number[][], private g = 100) { for (const p of pts) { const k = Math.floor(p[0] / g) * 100003 + Math.floor(p[1] / g); (this.m.get(k) ?? this.m.set(k, []).get(k)!).push(p); } }
  near(x: number, z: number, r: number): number { let best = Infinity; const g = this.g, k = Math.ceil(r / g);
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) { const l = this.m.get((Math.floor(x / g) + i) * 100003 + Math.floor(z / g) + j); if (l) for (const p of l) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z)); } return best; } }
const hRail = new Hash(rail), hRing = new Hash(ring), hArms = new Hash(arms), hIsl = new Hash(isl);

// class chars: ~ water, R rail corridor, X fixed road ROW, F facility / engineering land, A..E slope (A < 3 %, B 3-8, C 8-15, D 15-25, E > 25)
const rows: string[] = []; const zoneKind: string[] = [];
const cnt: Record<string, number> = {};
const grid: string[][] = [];
for (let j = 0; j < N; j++) {
  const z = -HALF + (j + 0.5) * CELL; const row: string[] = [];
  for (let i = 0; i < N; i++) {
    const x = -HALF + (i + 0.5) * CELL;
    const g = ground(x, z);
    let c: string;
    if (g.h < 0.2 || (!Number.isNaN(g.w) && g.h < g.w - 0.05)) c = '~';
    else if (hRail.near(x, z, RAIL_BUF + 25) <= RAIL_BUF + CELL * 0.35) c = 'R';
    else if (hRing.near(x, z, ROW_M8 + 25) <= ROW_M8 + CELL * 0.35 || hArms.near(x, z, ROW_M8 + 25) <= ROW_M8 + CELL * 0.35 || hIsl.near(x, z, ROW_M6 + 25) <= ROW_M6 + CELL * 0.35 || Math.hypot(x - J1.x, z - J1.z) < J1_PAD + 25) c = 'X';
    else {
      const k = getWorldZoneAt(x, z).kind as string;
      if (k === 'airport' || k === 'seaport' || k === 'army' || k === 'engineering') c = 'F';
      else {
        const d = 25, hx = ground(x + d, z).h - ground(x - d, z).h, hz = ground(x, z + d).h - ground(x, z - d).h;
        const s = (Math.hypot(hx, hz) / (2 * d)) * 100;
        c = s < 3 ? 'A' : s < 8 ? 'B' : s < 15 ? 'C' : s < 25 ? 'D' : 'E';
      }
    }
    cnt[c] = (cnt[c] ?? 0) + 1; row.push(c);
  }
  grid.push(row); rows.push(row.join(''));
}
const ha = (n: number) => (n * CELL * CELL) / 10000;
const total = N * N;
console.log(`BUILDABILITY MAP (Step A1)  map 10 x 10 km, cell ${CELL} m (${N} x ${N}), rail buffer ${RAIL_BUF} m, M8 ROW ${ROW_M8} m, M6 ROW ${ROW_M6} m, J1 pad ${J1_PAD} m`);
const names: Record<string, string> = { '~': 'water / sea', R: 'rail corridor', X: 'fixed road ROW (M8, J1, M6-1)', F: 'airport / seaport / army / engineering land', A: 'flat < 3 %', B: 'gentle 3-8 %', C: 'rolling 8-15 %', D: 'steep 15-25 %', E: 'very steep > 25 %' };
for (const k of Object.keys(names)) console.log(`  ${k}  ${names[k].padEnd(46)} ${String(cnt[k] ?? 0).padStart(6)} cells  ${ha(cnt[k] ?? 0).toFixed(0).padStart(7)} ha  ${(((cnt[k] ?? 0) / total) * 100).toFixed(1).padStart(5)} %`);
const usable = (c: string) => c === 'A' || c === 'B';
const okForTown = (c: string) => c === 'A' || c === 'B' || c === 'C';

// ---- proposed housing areas (circle of the world zone, radius = zone w), share of land by class
const H: [string, string][] = [
  ['se-dense', 'H-C1 city 20 fl'], ['west-homes', 'H-C2 city 10 fl (with sw-homes)'], ['sw-homes', 'H-C2 city 10 fl'], ['east-homes', 'H-C3 city 5-10 fl'],
  ['south-suburb', 'H-S1 suburb 1-5 fl'], ['east-suburb', 'H-S2 suburb'], ['sw-newtown', 'H-S3 suburb'], ['west-suburb', 'H-S4 suburb'], ['north-homes', 'H-S5 suburb'],
  ['village-west', 'V1 village'], ['village-east', 'V2 village'], ['village-sw', 'V3 village'], ['village-ne', 'V4 village'],
];
console.log('\nPROPOSED HOUSING AREAS: land inside the zone circle (percent of cells) and free land (A+B+C) in hectares');
console.log('  zone            role                         r(m)  flat+gentle  rolling  steep+  water  rail+road  fence | free A-C ha  A+B ha');
const hsum: Record<string, any> = {};
for (const [id, role] of H) {
  const z = WORLD_ZONES.find((q) => q.id === id)!; const c: Record<string, number> = {}; let n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -HALF + (i + 0.5) * CELL, zz = -HALF + (j + 0.5) * CELL; if (Math.hypot(x - z.x, zz - z.z) <= z.w) { n++; c[grid[j][i]] = (c[grid[j][i]] ?? 0) + 1; } }
  const p = (k: string[]) => ((k.reduce((s, q) => s + (c[q] ?? 0), 0) / n) * 100).toFixed(0).padStart(4);
  const free = ['A', 'B', 'C'].reduce((s, q) => s + (c[q] ?? 0), 0), ab = (c.A ?? 0) + (c.B ?? 0);
  hsum[id] = { role, r: z.w, n, c, freeHa: ha(free), abHa: ha(ab) };
  console.log(`  ${id.padEnd(15)} ${role.padEnd(30)} ${String(z.w).padStart(4)}  ${p(['A', 'B'])} %      ${p(['C'])} %   ${p(['D', 'E'])} %  ${p(['~'])} %   ${p(['R', 'X'])} %   ${p(['F'])} % | ${ha(free).toFixed(0).padStart(8)}  ${ha(ab).toFixed(0).padStart(7)}`);
}
// ---- checks (numbers only)
let pass = 0, fail = 0; const chk = (ok: boolean, t: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}`); ok ? pass++ : fail++; };
console.log('\nCHECKS');
chk(rail.length > 1000, `rail points read: ${rail.length}`);
chk(ring.length > 3000 && arms.length > 1000 && isl.length > 300, `fixed roads read: ring ${ring.length}, arms ${arms.length}, island link ${isl.length} points`);
chk(Object.values(cnt).reduce((a, b) => a + b, 0) === total, `every cell has exactly one class (${total} cells)`);
for (const id of ['se-dense', 'east-homes', 'south-suburb', 'sw-newtown']) chk(hsum[id].freeHa >= 40, `${id}: free land A-C ${hsum[id].freeHa.toFixed(0)} ha >= 40 ha (one housing needs about 40 ha, proposal)`);
console.log(`\n${pass} PASS, ${fail} FAIL (numbers only; no src/ file changed; game not run)`);
writeFileSync(`${out}/a1_buildability.json`, JSON.stringify({ cell: CELL, half: HALF, n: N, legend: names, counts: cnt, rows, housing: hsum }));
