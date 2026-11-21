// City Mall relocation, Step M1: site test (headless). Plot = the user's red area west of J1 minus 15 m from roads / rail (+ the J1 ground zone).
//   npx tsx scripts/mall-site-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { MALL_POLY, MALL_BUILDING, MALL_PLOT, MALL_POS, mallKeepout } from '../src/mall/MallSite';
const RED: number[][] = [[-537,-450],[-500,-494],[-425,-497],[-375,-487],[-300,-412],[-212,-344],[-137,-281],[-125,-256],[-150,-219],[-212,-169],[-262,-88],[-325,-31],[-375,-19],[-437,-21],[-500,-44],[-575,-100],[-650,-137],[-681,-179],[-637,-237],[-612,-287],[-581,-350],[-550,-412]];
let fails = 0; const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const inP = (P: ReadonlyArray<ReadonlyArray<number>>, x: number, z: number): boolean => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const gen: any = new TerrainGenerator(Config.world.seed);
const J1 = { x: -87, z: -277 }, Y = (37.5 * Math.PI) / 180;
const dirs: Array<[number, number]> = [[Math.sin(Y), -Math.cos(Y)], [Math.cos(Y), Math.sin(Y)], [-Math.sin(Y), Math.cos(Y)], [-Math.cos(Y), -Math.sin(Y)]];
const ob: Array<[number, number, number]> = []; // x, z, clear radius (pavement half width, rail 14)
for (const d of dirs) for (let s = 0; s < 315; s += 2) ob.push([J1.x + d[0] * s, J1.z + d[1] * s, 22.1]);
for (const a of J1_ARM_DATA) for (const p of a.pts) ob.push([p[0], p[1], 22.1]);
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) ob.push([r.xs[i], r.zs[i], r.halfWidth + r.shoulder]);
const rail: Array<[number, number, number]> = [];
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 4)); for (let k = 0; k <= n; k++) rail.push([e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n, 14]); }
const gap = (list: Array<[number, number, number]>, x: number, z: number): number => { let m = 1e9; for (const [px, pz, c] of list) { if (Math.abs(px - x) > 80 || Math.abs(pz - z) > 80) continue; m = Math.min(m, Math.hypot(px - x, pz - z) - c); } return m; };
const area = (P: ReadonlyArray<ReadonlyArray<number>>): number => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
let outRed = 0, minRoad = 1e9, minRail = 1e9, minJ1 = 1e9, nEdge = 0;
for (let i = 0; i < MALL_POLY.length; i++) { const a = MALL_POLY[i], b = MALL_POLY[(i + 1) % MALL_POLY.length]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2); for (let k = 0; k < n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n; nEdge++; if (!inP(RED, x, z)) outRed++; minRoad = Math.min(minRoad, gap(ob, x, z)); minRail = Math.min(minRail, gap(rail, x, z)); minJ1 = Math.min(minJ1, Math.hypot(x - J1.x, z - J1.z)); } }
console.log(`plot ${MALL_POLY.length} corners, ${area(MALL_POLY).toFixed(0)} m2 (red ${area(RED).toFixed(0)}), building ${area(MALL_BUILDING).toFixed(0)} m2, floorY ${gen.mall.floorY.toFixed(2)}`);
ok(outRed === 0, `the plot lies inside the user's red area (${nEdge} edge samples, ${outRed} outside)`);
ok(minRoad >= 15, `plot edge keeps >= 15 m from every road edge (J1 arms 22.1 m half pavement incl.) (closest ${minRoad.toFixed(1)} m)`);
ok(minRail >= 15, `plot edge keeps >= 15 m from the rail (closest ${minRail.toFixed(1)} m)`);
ok(minJ1 >= 150, `plot stays out of the J1 ground zone (closest ${minJ1.toFixed(0)} m from the J1 centre)`);
ok(area(MALL_POLY) > 100000, 'the mall plot is much bigger than the old one (17,300 m2)');
// flat pad, no road on it (= no overlap with any J1 arm)
let mn = 1e9, mx = -1e9, roadHits = 0, cnt = 0;
for (let x = MALL_PLOT.x0; x <= MALL_PLOT.x1; x += 3) for (let z = MALL_PLOT.z0; z <= MALL_PLOT.z1; z += 3) if (inP(MALL_POLY, x, z)) { cnt++; const h = gen.heightAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); if (gen.roads.surfaceAt(x, z) !== 0) roadHits++; }
ok(mx - mn < 0.07, `the pad is flat under the whole plot (${cnt} samples, range ${(mx - mn).toFixed(3)} m)`);
ok(roadHits === 0, `no road surface (no J1 arm) on the plot (${roadHits} hits)`);
ok(MALL_BUILDING.every(([x, z]) => inP(MALL_POLY, x, z)) && inP(MALL_BUILDING, MALL_POS.x, MALL_POS.z), 'the building outline + block centre lie inside the plot');
ok(mallKeepout(MALL_POS.x, MALL_POS.z) && !mallKeepout(100, -100) && !mallKeepout(-87, -277) && !mallKeepout(300, 300), 'keepout: new plot closed, OLD mall zone now open (2026-11-21, user), J1 centre + far away open');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
