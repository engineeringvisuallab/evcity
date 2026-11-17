// City Mall relocation, Step M1 (headless, changes nothing): the user's RED area (west of J1, between the W arm and the S arm), shrunk ONLY by a clear
// distance from every road edge (J1 arms 22.1 m half pavement, other roads halfWidth + shoulder) and from the rail. Prints the polygon + area + height stats.
//   npx tsx scripts/mall-new-plot.ts          (env: BUF=15 RAILBUF=15)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { MALL_POLY as CUR } from '../src/mall/MallSite';
const inPoly0 = (x: number, z: number): boolean => { let r = false; for (let a = 0, b = CUR.length - 1; a < CUR.length; b = a++) { const [xi, zi] = CUR[a], [xj, zj] = CUR[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
export const RED: Array<[number, number]> = [[-537,-450],[-500,-494],[-425,-497],[-375,-487],[-300,-412],[-212,-344],[-137,-281],[-125,-256],[-150,-219],[-212,-169],[-262,-88],[-325,-31],[-375,-19],[-437,-21],[-500,-44],[-575,-100],[-650,-137],[-681,-179],[-637,-237],[-612,-287],[-581,-350],[-550,-412]];
const BUF = +(process.env.BUF ?? 15), RBUF = +(process.env.RAILBUF ?? 15);
const J1 = { x: -87, z: -277 }, Y = (37.5 * Math.PI) / 180;
const dirs: Record<string, [number, number]> = { 'J1-N': [Math.sin(Y), -Math.cos(Y)], 'J1-E': [Math.cos(Y), Math.sin(Y)], 'J1-S': [-Math.sin(Y), Math.cos(Y)], 'J1-W': [-Math.cos(Y), -Math.sin(Y)] };
// obstacles: [x, z, clear radius to the centre line]
const ob: Array<[number, number, number, string]> = [];
for (const k of Object.keys(dirs)) for (let s = 0; s < 315; s += 2) ob.push([J1.x + dirs[k][0] * s, J1.z + dirs[k][1] * s, 22.1, k]);
for (const a of J1_ARM_DATA) for (const p of a.pts) ob.push([p[0], p[1], 22.1, a.name]);
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) ob.push([r.xs[i], r.zs[i], r.halfWidth + r.shoulder, 'road:' + r.name]);
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 4)); for (let k = 0; k <= n; k++) ob.push([e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n, 14, 'rail']); }
// road EARTHWORKS (embankment / cut slopes) reach past the pavement edge and the terrain pad gives way wherever the road mask is > 0: those cells (independent of the plot) must keep 4 m clear.
{ const mo = new Float32Array(2); let n0 = 0; for (let x = -720; x <= -100; x += 3) for (let z = -520; z <= 0; z += 3) { gen.roads.maskAt(x, z, 1, mo); if (mo[1] > 0.0001) { ob.push([x, z, -(BUF + (+(process.env.MARGIN ?? 2.5)) - 4), 'earthwork']); n0++; } } console.log('road-mask cells (3 m):', n0); }
const J1ZONE = +(process.env.J1ZONE ?? 156);
const clear = (x: number, z: number): { c: number; who: string } => { const dj = Math.hypot(x - J1.x, z - J1.z) - J1ZONE + BUF; let m = dj, w = 'J1-ground'; for (const [px, pz, cl, n] of ob) { if (Math.abs(px - x) > 120 || Math.abs(pz - z) > 120) continue; const d = Math.hypot(px - x, pz - z) - cl - (n === 'rail' ? RBUF - BUF : 0) ; if (d < m) { m = d; w = n; } } return { c: m, who: w }; };

const area = (P: number[][]): number => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const inPoly = (P: ReadonlyArray<ReadonlyArray<number>>, x: number, z: number): boolean => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const CS = 4, MARGIN = +(process.env.MARGIN ?? 2.5); // grid cell (m); extra margin so the simplified outline keeps the buffer
const X0 = -720, Z0 = -520, NX = 150, NZ = 130;
const idx = (i: number, j: number): number => j * NX + i;
let ok = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = X0 + i * CS, z = Z0 + j * CS; if (inPoly(RED, x, z) && inPoly(RED, x - 2.5, z - 2.5) && inPoly(RED, x + 2.5, z - 2.5) && inPoly(RED, x - 2.5, z + 2.5) && inPoly(RED, x + 2.5, z + 2.5) && clear(x, z).c >= BUF + MARGIN) ok[idx(i, j)] = 1; }
// the pad must be flat there too: cells where the CURRENT pad is off by > 5 cm are dropped (their 8-neighbours as well), iterate once on the result
{ const sg: any = gen, F = sg.mall.floorY - 0.03; const bad = new Uint8Array(NX * NZ); let nb = 0; for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (ok[idx(i, j)] && inPoly0(X0 + i * CS, Z0 + j * CS) && Math.abs(sg.heightAt(X0 + i * CS, Z0 + j * CS) - F) > 0.05) { bad[idx(i, j)] = 1; nb++; }
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) if (bad[idx(i, j)]) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) ok[idx(i + di, j + dj)] = 0;
  console.log('off-pad cells dropped:', nb); }
// largest 4-connected component
const lab = new Int32Array(NX * NZ); let best = 0, bestN = 0, nl = 0;
for (let k = 0; k < NX * NZ; k++) if (ok[k] && !lab[k]) { nl++; let n = 0; const st = [k]; lab[k] = nl; while (st.length) { const c = st.pop()!; n++; const ci = c % NX, cj = (c / NX) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; const q = idx(a, b); if (ok[q] && !lab[q]) { lab[q] = nl; st.push(q); } } } if (n > bestN) { bestN = n; best = nl; } }
const keepMask = (m: Uint8Array): Uint8Array => { const o = new Uint8Array(NX * NZ); for (let k = 0; k < NX * NZ; k++) o[k] = lab[k] === best && m[k] ? 1 : 0; return o; };
ok = keepMask(ok);
// fill holes (enclosed non-ok pockets) so the outline is ONE loop: flood from the border over non-ok cells; everything else becomes ok
{ const out = new Uint8Array(NX * NZ); const st: number[] = []; for (let i = 0; i < NX; i++) { st.push(idx(i, 0), idx(i, NZ - 1)); } for (let j = 0; j < NZ; j++) { st.push(idx(0, j), idx(NX - 1, j)); } while (st.length) { const c = st.pop()!; if (out[c] || ok[c]) continue; out[c] = 1; const ci = c % NX, cj = (c / NX) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = ci + di, b = cj + dj; if (a >= 0 && b >= 0 && a < NX && b < NZ) st.push(idx(a, b)); } } let f = 0; for (let k = 0; k < NX * NZ; k++) if (!out[k] && !ok[k]) { ok[k] = 1; f++; } console.log('filled pocket cells:', f); }
// outline of a mask: boundary edges between ok / non-ok cells chained into one loop (cell corners), then Douglas-Peucker
const outline = (m: Uint8Array): number[][] => {
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : m[idx(i, j)]);
  const nxt = new Map<string, string[]>(); const key = (i: number, j: number): string => i + ',' + j;
  const add = (a: [number, number], b: [number, number]): void => { const k = key(a[0], a[1]); (nxt.get(k) ?? nxt.set(k, []).get(k)!).push(key(b[0], b[1])); };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (m[idx(i, j)]) { // directed so the inside is on the left
    if (!at(i, j - 1)) add([i, j], [i + 1, j]); if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]); if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]); if (!at(i - 1, j)) add([i, j + 1], [i, j]); }
  const first = [...nxt.keys()][0]; const loop: number[][] = []; let cur = first, prev = ''; const seen = new Set<string>();
  for (let guard = 0; guard < 1e6; guard++) { const [ci, cj] = cur.split(',').map(Number); loop.push([X0 + (ci - 0.5) * CS, Z0 + (cj - 0.5) * CS]); seen.add(cur); const c = nxt.get(cur)!; let pick = c.find((k) => !seen.has(k)) ?? c[0]; if (c.length > 1) { const [pi, pj] = prev ? prev.split(',').map(Number) : [ci - 1, cj]; const dx = ci - pi, dj = cj - pj; const left = c.find((k) => { const [a, b] = k.split(',').map(Number); return (a - ci) * -dj + (b - cj) * dx > 0 && !seen.has(k); }); pick = left ?? pick; } prev = cur; cur = pick; if (cur === first) break; }
  return loop;
};
const dp = (P: number[][], tol: number): number[][] => {
  const rec = (A: number[][], lo: number, hi: number, keep: boolean[]): void => { let m = 0, mi = -1; const [ax, az] = A[lo], [bx, bz] = A[hi]; const L = Math.hypot(bx - ax, bz - az) || 1; for (let i = lo + 1; i < hi; i++) { const d = Math.abs((bx - ax) * (az - A[i][1]) - (ax - A[i][0]) * (bz - az)) / L; if (d > m) { m = d; mi = i; } } if (m > tol && mi > 0) { keep[mi] = true; rec(A, lo, mi, keep); rec(A, mi, hi, keep); } };
  const h = Math.floor(P.length / 2), A = [...P, P[0]]; const keep = A.map(() => false); keep[0] = keep[h] = keep[A.length - 1] = true; rec(A, 0, h, keep); rec(A, h, A.length - 1, keep); return A.filter((_, i) => keep[i]).slice(0, -1);
};
// smooth the 4 m staircase contour first (moving average over +-SW points, SI times; the contour is on the safe side by MARGIN, so the clearance stays), then simplify
const SW = +(process.env.SW ?? 3), SI = +(process.env.SI ?? 4);
const smoothLoop = (P: number[][]): number[][] => { let A = P; for (let it = 0; it < SI; it++) { const n = A.length; A = A.map((_, i) => { let x = 0, z = 0; for (let k = -SW; k <= SW; k++) { const q = A[(i + k + n * 4) % n]; x += q[0]; z += q[1]; } return [x / (2 * SW + 1), z / (2 * SW + 1)]; }); } return A; };
const TOL = +(process.env.TOL ?? 2.5), r05 = (v: number): number => Math.round(v * 2) / 2;
const poly = dp(smoothLoop(outline(ok)), TOL).map(([x, z]) => [r05(x), r05(z)]);
const simple = (P: number[][]): boolean => { const n = P.length; const cr = (a: number[], b: number[], c: number[]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n]; if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return false; } return true; };
let worst = 1e9, outside = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2); for (let k = 0; k < n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n; worst = Math.min(worst, clear(x, z).c); if (!inPoly(RED, x, z)) { outside++; if (process.env.DBG) console.log("out", x.toFixed(0), z.toFixed(0)); } } }
console.log(`PLOT: ${poly.length} vertices, area ${area(poly).toFixed(0)} m2 (${((area(poly) / area(RED)) * 100).toFixed(0)}% of red), simple ${simple(poly)}, worst edge clearance ${worst.toFixed(1)} m (want >= ${BUF}), samples outside red ${outside}`);
console.log(JSON.stringify(poly));
// building = plot eroded by BINSET (cells whose distance to a non-plot cell is >= BINSET), then outline
const BINSET = +(process.env.BINSET ?? 12);
const pm = new Uint8Array(NX * NZ); for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (inPoly(poly, X0 + i * CS, Z0 + j * CS)) pm[idx(i, j)] = 1;
const rr = Math.ceil(BINSET / CS), bm = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (pm[idx(i, j)]) { let g2 = true; for (let dj = -rr; dj <= rr && g2; dj++) for (let di = -rr; di <= rr && g2; di++) if (di * di + dj * dj <= rr * rr && !(i + di >= 0 && j + dj >= 0 && i + di < NX && j + dj < NZ && pm[idx(i + di, j + dj)])) g2 = false; if (g2) bm[idx(i, j)] = 1; }
lab.fill(0); { let b2 = 0, bn2 = 0, n2 = 0; for (let k = 0; k < NX * NZ; k++) if (bm[k] && !lab[k]) { n2++; let n = 0; const st = [k]; lab[k] = n2; while (st.length) { const c = st.pop()!; n++; const ci = c % NX, cj = (c / NX) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; const q = idx(a, b); if (bm[q] && !lab[q]) { lab[q] = n2; st.push(q); } } } if (n > bn2) { bn2 = n; b2 = n2; } } best = b2; }
const bkeep = keepMask(bm);
const bld = dp(smoothLoop(outline(bkeep)), TOL).map(([x, z]) => [r05(x), r05(z)]);
console.log(`BUILDING: ${bld.length} vertices, area ${area(bld).toFixed(0)} m2, simple ${simple(bld)}, inside plot ${bld.every((p) => inPoly(poly, p[0], p[1]))}`);
console.log(JSON.stringify(bld));
let cx = 0, cz = 0, c2 = 0; for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (bkeep[idx(i, j)]) { cx += X0 + i * CS; cz += Z0 + j * CS; c2++; }
console.log('building centroid', (cx / c2).toFixed(1), (cz / c2).toFixed(1), 'inside', inPoly(bld, cx / c2, cz / c2));
const hs: number[] = []; for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (pm[idx(i, j)]) hs.push(g(X0 + i * CS, Z0 + j * CS));
hs.sort((a, b) => a - b); const q = (f: number): number => hs[Math.floor(f * (hs.length - 1))];
console.log(`ground in plot: min ${hs[0].toFixed(1)} p10 ${q(0.1).toFixed(1)} median ${q(0.5).toFixed(1)} p90 ${q(0.9).toFixed(1)} max ${hs[hs.length - 1].toFixed(1)}; cells > floor+3 m: ${hs.filter((h) => h > q(0.5) + 3).length * CS * CS} m2`);
