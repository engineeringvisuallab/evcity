// CITY FREE LAND export (headless, reads the world, changes nothing in src/).
// 10 m cells over the J1 city window. Writes docs/city_free_land_grid.json: class per cell + fixed line lists.
// Run: npx tsx scripts/city-freeland-export.ts docs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const out = process.argv[2] ?? '.'; mkdirSync(out, { recursive: true });
const CELL = 10, X0 = -1500, X1 = 1300, Z0 = -950, Z1 = 1500;
const RAIL_BUF = 30, ROW_M8 = 40, ROW_M6 = 36.35, J1_PAD = 100;
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number) => { gen.sampleGround(x, z, sc); return { h: sc.h, w: sc.water }; };
const rail: number[][][] = gen.rail.edges.map((e: any) => Array.from(e.xs as Float64Array).map((x: number, j: number) => [x, e.zs[j], e.design[j], e.ground[j]]));
const railSeg = gen.rail.edges.map((e: any) => ({ id: e.id, segments: e.segments }));
const ring: number[][] = readFileSync('docs/ring_samples_5m.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.split(','); return [+c[1], +c[2]]; });
const arms: number[][][] = J1_ARM_DATA.map((a: any) => a.pts.map((p: number[]) => [p[0], p[1]]));
const isl: number[][] = ISLAND_LINK_DATA.pts.map((p: number[]) => [p[0], p[1]]);
const J1 = Config.roads.junctionJ1;
class Hash { m = new Map<number, number[][]>(); constructor(pts: number[][], private g = 50) { for (const p of pts) { const k = Math.floor(p[0] / g) * 100003 + Math.floor(p[1] / g); const l = this.m.get(k); if (l) l.push(p); else this.m.set(k, [p]); } }
  near(x: number, z: number, r: number): number { let best = Infinity; const g = this.g, k = Math.ceil(r / g);
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) { const l = this.m.get((Math.floor(x / g) + i) * 100003 + Math.floor(z / g) + j); if (l) for (const p of l) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z)); } return best; } }
// densify lines so the 10 m cells see them
const dens = (pl: number[][]) => { const o: number[][] = []; for (let i = 0; i < pl.length - 1; i++) { const a = pl[i], b = pl[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(pl[pl.length - 1]); return o; };
const hRail = new Hash(rail.flatMap(dens)), hRing = new Hash(dens(ring)), hArms = new Hash(arms.flatMap(dens)), hIsl = new Hash(dens(isl));
const rows: string[] = [];
for (let z = Z0 + CELL / 2; z < Z1; z += CELL) { let r = '';
  for (let x = X0 + CELL / 2; x < X1; x += CELL) {
    const g = ground(x, z); let c: string;
    if (g.h < 0.2 || (!Number.isNaN(g.w) && g.h < g.w - 0.05)) c = '~';
    else if (hRail.near(x, z, RAIL_BUF + 10) <= RAIL_BUF) c = 'R';
    else if (hRing.near(x, z, ROW_M8 + 10) <= ROW_M8 || hArms.near(x, z, ROW_M8 + 10) <= ROW_M8 || hIsl.near(x, z, ROW_M6 + 10) <= ROW_M6 || Math.hypot(x - J1.x, z - J1.z) < J1_PAD) c = 'X';
    else { const d = 25, hx = ground(x + d, z).h - ground(x - d, z).h, hz = ground(x, z + d).h - ground(x, z - d).h; const s = (Math.hypot(hx, hz) / (2 * d)) * 100; c = s < 3 ? 'A' : s < 8 ? 'B' : s < 15 ? 'C' : 'D'; }
    r += c; } rows.push(r); }
writeFileSync(`${out}/city_free_land_grid.json`, JSON.stringify({ cell: CELL, x0: X0, z0: Z0, rows, rail, railSeg, ring, arms, isl }));
console.log(`written ${rows.length} x ${rows[0].length} cells`);
