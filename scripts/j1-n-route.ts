// STEP J1-c4a (headless): finds the PLAN route of the N arm of J1 around the hill, by least cost search on (cell, road height).
// Run: npx tsx scripts/j1-n-route.ts docs [edgeLimit=3]   needs docs/j1c4_raster.json (scripts/j1-n-raster.ts). Writes docs/j1c4_route.json + STEPJ1C4A_OUTPUT.txt
// Rules: grade <= 3 % (move length x 3 %, height steps of 0.5 m, so a little conservative), road edge cut <= edgeLimit and fill <= edgeLimit (3 m, user: only SMALL cuttings,
// no tunnel), wet cells, engineering zones (+45 m = half ROW + margin) and rail cells cost extra, rail crossing = road over rail (counted). Start = end of the J1 straight, target = ring N point.
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'docs';
const EL = Number(process.argv[3] ?? 3), EF = Number(process.argv[4] ?? 7);   // EL = max edge CUT, EF = max edge FILL (D4: fill <= 7 m is an ordinary embankment)
const R = JSON.parse(readFileSync(`${out}/j1c4_raster.json`, 'utf8'));
const { cell: C, x0: X0, z0: Z0, nx: NX, nz: NZ } = R as { cell: number; x0: number; z0: number; nx: number; nz: number };
const G = Float32Array.from(R.h as number[]), WET = Uint8Array.from(R.wet as number[]);
const J1 = { x: -117, z: -277, yaw: (17.6 * Math.PI) / 180 }, S_STRAIGHT = 340, PAD_END = 60, Y_PAD = 18.4;
const TARGET = { x: 1711.5, z: -3145.5, y: 36.9 };            // ring N point, st 11549, design level of ring_profile.csv
const cx = (i: number): number => X0 + (i + 0.5) * C, cz = (j: number): number => Z0 + (j + 0.5) * C;
const ci = (x: number): number => Math.floor((x - X0) / C), cj = (z: number): number => Math.floor((z - Z0) / C);
// window of the search
const I0 = ci(-700), I1 = ci(2300), K0 = cj(-3600), K1 = cj(-400);
// neighbour 3x3 min / max ground (= the road edge at about +-C from the centre)
const GMAX = new Float32Array(NX * NZ), GMIN = new Float32Array(NX * NZ);
for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
  let mx = -1e9, mn = 1e9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = G[(j + dj) * NX + i + di]; if (v > mx) mx = v; if (v < mn) mn = v; }
  GMAX[j * NX + i] = mx; GMIN[j * NX + i] = mn;
}
// directional road edges: ground at +-25 m perpendicular to the move direction (bilinear), per move direction index
const bil = (x: number, z: number): number => {
  const fx = (x - X0) / C - 0.5, fz = (z - Z0) / C - 0.5; const i = Math.max(0, Math.min(NX - 2, Math.floor(fx))), j = Math.max(0, Math.min(NZ - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
  return (G[j * NX + i] * (1 - tx) + G[j * NX + i + 1] * tx) * (1 - tz) + (G[(j + 1) * NX + i] * (1 - tx) + G[(j + 1) * NX + i + 1] * tx) * tz;
};
const DIRS: Array<[number, number]> = [];
for (const [a, b] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] as Array<[number, number]>) for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const m: [number, number] = [a * sa, b * sb]; if (!DIRS.some((q) => q[0] === m[0] && q[1] === m[1])) DIRS.push(m); }
const EMAX: Float32Array[] = [], EMIN: Float32Array[] = [];
for (const [di, dj] of DIRS) {
  const L = Math.hypot(di, dj), nx_ = -dj / L, nz_ = di / L, mx = new Float32Array(NX * NZ), mn = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = cx(i), z = cz(j), a = bil(x + 25 * nx_, z + 25 * nz_), b = bil(x - 25 * nx_, z - 25 * nz_), c0 = G[j * NX + i]; mx[j * NX + i] = Math.max(a, b, c0); mn[j * NX + i] = Math.min(a, b, c0); }
  EMAX.push(mx); EMIN.push(mn);
}
// masks
const RECT = new Uint8Array(NX * NZ), RAILX = new Uint8Array(NX * NZ), RAILN = new Uint8Array(NX * NZ);
for (const r of R.rects as Array<{ x0: number; z0: number; x1: number; z1: number }>) {
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = cx(i), z = cz(j); if (x > r.x0 - 45 && x < r.x1 + 45 && z > r.z0 - 45 && z < r.z1 + 45) RECT[j * NX + i] = 1; }
}
for (const e of R.rail as Array<{ xs: number[]; zs: number[] }>) {
  for (let k = 0; k + 1 < e.xs.length; k++) {
    const ax = e.xs[k], az = e.zs[k], bx = e.xs[k + 1], bz = e.zs[k + 1];
    const ia = Math.max(0, ci(Math.min(ax, bx) - 80)), ib = Math.min(NX - 1, ci(Math.max(ax, bx) + 80)), ja = Math.max(0, cj(Math.min(az, bz) - 80)), jb = Math.min(NZ - 1, cj(Math.max(az, bz) + 80));
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const t = Math.max(0, Math.min(1, ((cx(i) - ax) * dx + (cz(j) - az) * dz) / l2));
      const d = Math.hypot(cx(i) - (ax + t * dx), cz(j) - (az + t * dz));
      if (d <= C * 0.75) RAILX[j * NX + i] = 1; if (d <= 70) RAILN[j * NX + i] = 1;
    }
  }
}
const DH = 0.5, Y0 = 12, NL = 100;                           // heights 12 .. 61.5 m
const lv = (y: number): number => Math.round((y - Y0) / DH);
const NS = NX * NZ * NL;
const dist = new Float32Array(NS).fill(Infinity), par = new Int32Array(NS).fill(-1);
// heap
let hk = new Float64Array(1 << 20), hv = new Int32Array(1 << 20), hn = 0;
const push = (k: number, v: number): void => {
  if (hn >= hk.length) { const a = new Float64Array(hk.length * 2); a.set(hk); hk = a; const b = new Int32Array(hv.length * 2); b.set(hv); hv = b; }
  let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v;
};
const pop = (): void => {
  const k = hk[--hn], v = hv[hn]; let i = 0;
  for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
  hk[i] = k; hv[i] = v;
};
// earthwork + obstacle cost per metre at (cell, road height)
const NEART = new Uint8Array(NX * NZ);   // last 150 m before the ring N point: the ring corridor is already cut (6 m), no earthwork limit there
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (Math.hypot(cx(i) - TARGET.x, cz(j) - TARGET.z) <= 150) NEART[j * NX + i] = 1;
const earth = (c: number, y: number, d = -1): number => {
  if (NEART[c]) return 0;
  const cut = (d < 0 ? GMAX : EMAX[d])[c] - y, fill = y - (d < 0 ? GMIN : EMIN[d])[c];
  if (cut > EL || fill > EF) return -1;                        // hard limit
  const a = Math.max(0, cut) / EL, b = Math.max(0, fill) / EF;
  return 0.6 * (a * a + b * b);
};
const obst = (c: number): number => (WET[c] ? 400 : 0) + (RECT[c] ? Number(process.env.RECTP ?? 300) : 0) + (RAILN[c] ? 2 : 0);
// ---- start: end of the J1 straight (s = 340 m along yaw 17.6), road height from the pad (s 60) with 0.3 .. 3 %
const sx = J1.x + S_STRAIGHT * Math.sin(J1.yaw), sz = J1.z - S_STRAIGHT * Math.cos(J1.yaw);
const si = ci(sx), sj = cj(sz);
const straightCost = (ys: number): number => {                // along the straight, from s = PAD_END
  let tot = 0;
  for (let s = PAD_END; s <= S_STRAIGHT; s += 20) {
    const y = Y_PAD + ((ys - Y_PAD) * (s - PAD_END)) / (S_STRAIGHT - PAD_END);
    const x = J1.x + s * Math.sin(J1.yaw), z = J1.z - s * Math.cos(J1.yaw); const c = cj(z) * NX + ci(x);
    const nxa = Math.cos(J1.yaw), nza = Math.sin(J1.yaw), a = bil(x + 25 * nxa, z + 25 * nza), b = bil(x - 25 * nxa, z - 25 * nza), g0 = bil(x, z);
    const cut = Math.max(a, b, g0) - y, fill = y - Math.min(a, b, g0); if (cut > EL || fill > EF) return -1;
    tot += 20 * (1 + 0.6 * ((Math.max(0, cut) / EL) ** 2 + (Math.max(0, fill) / EF) ** 2) + obst(c));
  }
  return tot;
};
let nStart = 0;
for (let l = 0; l < NL; l++) {
  const ys = Y0 + l * DH, g = (ys - Y_PAD) / (S_STRAIGHT - PAD_END);
  if (g < 0.003 || g > 0.03) continue;
  const sc = straightCost(ys); if (sc < 0) continue;
  const s = (sj * NX + si) * NL + l; dist[s] = sc; push(sc, s); nStart++;
}
console.log(`start cell (${cx(si).toFixed(0)}, ${cz(sj).toFixed(0)}), ${nStart} feasible start heights`);
const MV = DIRS;
const ti = ci(TARGET.x), tj = cj(TARGET.z), tl0 = lv(TARGET.y);
let best = -1, bestD = Infinity, popped = 0;
while (hn > 0) {
  const d = hk[0], s = hv[0]; pop();
  if (d > dist[s]) continue; popped++;
  const l = s % NL, c = (s - l) / NL, i = c % NX, j = (c - i) / NX;
  if (Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1 && Math.abs(l - tl0) <= 1) { best = s; bestD = d; break; }
  for (let md = 0; md < MV.length; md++) {
    const [di, dj] = MV[md];
    const ni = i + di, nj = j + dj; if (ni < I0 || ni > I1 || nj < K0 || nj > K1) continue;
    const len = Math.hypot(di, dj) * C, kmax = Math.floor((0.03 * len) / DH + 1e-9), nc = nj * NX + ni;
    const ob = obst(nc);
    for (let k = -kmax; k <= kmax; k++) {
      const nl = l + k; if (nl < 0 || nl >= NL) continue;
      const e = earth(nc, Y0 + nl * DH, md); if (e < 0) continue;
      const nd = d + len * (1 + e + ob) + (RAILX[nc] && !RAILX[c] ? 800 : 0), ns = nc * NL + nl;
      if (nd < dist[ns]) { dist[ns] = nd; par[ns] = s; push(nd, ns); }
    }
  }
}
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };
if (process.env.REACH) { const rc: number[] = []; for (let c = 0; c < NX * NZ; c++) { let r = 0; for (let l = 0; l < NL; l++) if (dist[c * NL + l] < Infinity) { r = 1; break; } if (r) rc.push(c); } writeFileSync(`${out}/j1c4_reach_${EL}.json`, JSON.stringify(rc)); }
if (best < 0) { P(`NO ROUTE with edge cut limit ${EL} m, fill limit ${EF} m (popped ${popped} states)`); writeFileSync(`${out}/STEPJ1C4A_OUTPUT.txt`, lines.join('\n') + '\n'); process.exit(1); }
const path: Array<{ x: number; z: number; y: number; g: number }> = [];
for (let s = best; s >= 0; s = par[s]) { const l = s % NL, c = (s - l) / NL, i = c % NX, j = (c - i) / NX; path.push({ x: cx(i), z: cz(j), y: Y0 + l * DH, g: G[c] }); }
path.reverse();
let len = 0, wetN = 0, rectN = 0, railCross = 0, cutMax = 0, fillMax = 0, gMax = 0; const cross: number[] = [];
for (let k = 0; k < path.length; k++) {
  const p = path[k], c = cj(p.z) * NX + ci(p.x);
  if (k > 0) { const q = path[k - 1], dl = Math.hypot(p.x - q.x, p.z - q.z); len += dl; gMax = Math.max(gMax, Math.abs(p.y - q.y) / dl); if (RAILX[c] && !RAILX[cj(q.z) * NX + ci(q.x)]) { railCross++; cross.push(Math.round(len)); } }
  if (WET[c]) wetN++; if (RECT[c]) rectN++;
  if (k > 0 && !NEART[c]) { const q = path[k - 1], dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz) || 1, nx_ = -dz / L, nz_ = dx / L; const a = bil(p.x + 25 * nx_, p.z + 25 * nz_), b = bil(p.x - 25 * nx_, p.z - 25 * nz_), g0 = bil(p.x, p.z); cutMax = Math.max(cutMax, Math.max(a, b, g0) - p.y); fillMax = Math.max(fillMax, p.y - Math.min(a, b, g0)); }
  
}
P(`J1-c4a N ARM ROUTE (plan search)  edge cut limit ${EL} m, edge fill limit ${EF} m, grade <= 3 %, popped ${popped} states`);
P(`start (${cx(si).toFixed(0)}, ${cz(sj).toFixed(0)}) s = ${S_STRAIGHT} m on yaw 17.6 deg;  target ring N point (${TARGET.x}, ${TARGET.z}) road level ${TARGET.y} m`);
P(`search cost ${bestD.toFixed(0)} (m equivalent), route from the end of the straight: ${len.toFixed(0)} m (straight line ${Math.hypot(TARGET.x - sx, TARGET.z - sz).toFixed(0)} m)`);
P(`max grade ${(gMax * 100).toFixed(2)} %, max edge cut ${cutMax.toFixed(2)} m, max edge fill ${fillMax.toFixed(2)} m, wet cells ${wetN}, engineering-zone cells ${rectN}, rail crossings ${railCross} at route m ${cross.join(', ')}`);
writeFileSync(`${out}/j1c4_route.json`, JSON.stringify({ edgeLimit: EL, fillLimit: EF, start: { x: sx, z: sz, s: S_STRAIGHT }, target: TARGET, len, gMax, cutMax, fillMax, wetN, rectN, railCross, cross, path }));
writeFileSync(`${out}/STEPJ1C4A_OUTPUT.txt`, lines.join('\n') + '\n');
