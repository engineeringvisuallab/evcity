// STEP J1-c5 (headless): W arm alignment by a HEADING-AWARE least cost search (state = cell 30 m, heading 5 deg, road height 0.9 m).
// Each move is 90 m long and may turn at most 5 deg (min radius 1031 m >= 1.5 x Rmin V100 = 591 m), so the road can only bend gently (user: 8-lane road nearly straight, only a gentle bend).
// Run: npx tsx scripts/j1-w-hybrid.ts docs [turnCost=60] [cutCap=12] [fillCap=30]   needs docs/j1c5_raster.json, docs/ring_profile.csv, docs/ring_samples_5m.csv. Writes docs/j1c5_hybrid.json
// Rules: grade <= 3 %, centre cut <= cutCap, centre fill <= fillCap (above 7 m = viaduct, counted), wet / engineering zones (+45 m) / rail cost extra, arrival at the ring W straight (st 4600..6000) at 160..200 deg (about perpendicular) and at the ring level.
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'docs', TURN = Number(process.argv[3] ?? 60), CUTCAP = Number(process.argv[4] ?? 12), FILLCAP = Number(process.argv[5] ?? 30);
const R = JSON.parse(readFileSync(`${out}/j1c5_raster.json`, 'utf8'));
const { cell: C0, x0: RX0, z0: RZ0, nx: RNX, nz: RNZ } = R as { cell: number; x0: number; z0: number; nx: number; nz: number };
const GR = Float32Array.from(R.h as number[]), WETR = Uint8Array.from(R.wet as number[]);
const bil = (x: number, z: number): number => {
  const fx = (x - RX0) / C0 - 0.5, fz = (z - RZ0) / C0 - 0.5; if (fx < 0 || fz < 0 || fx > RNX - 1.001 || fz > RNZ - 1.001) return 1e3;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  return (GR[j * RNX + i] * (1 - tx) + GR[j * RNX + i + 1] * tx) * (1 - tz) + (GR[(j + 1) * RNX + i] * (1 - tx) + GR[(j + 1) * RNX + i + 1] * tx) * tz;
};
const rcell = (x: number, z: number): number => Math.floor((z - RZ0) / C0) * RNX + Math.floor((x - RX0) / C0);
const RECT = new Uint8Array(RNX * RNZ), RAILX = new Uint8Array(RNX * RNZ);
for (const r of R.rects as Array<{ x0: number; z0: number; x1: number; z1: number }>) for (let j = 0; j < RNZ; j++) for (let i = 0; i < RNX; i++) { const x = RX0 + (i + .5) * C0, z = RZ0 + (j + .5) * C0; if (x > r.x0 - 45 && x < r.x1 + 45 && z > r.z0 - 45 && z < r.z1 + 45) RECT[j * RNX + i] = 1; }
for (const e of R.rail as Array<{ xs: number[]; zs: number[] }>) for (let k = 0; k + 1 < e.xs.length; k++) {
  const ax = e.xs[k], az = e.zs[k], bx = e.xs[k + 1], bz = e.zs[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  for (let j = Math.max(0, Math.floor((Math.min(az, bz) - 40 - RZ0) / C0)); j <= Math.min(RNZ - 1, Math.floor((Math.max(az, bz) + 40 - RZ0) / C0)); j++) for (let i = Math.max(0, Math.floor((Math.min(ax, bx) - 40 - RX0) / C0)); i <= Math.min(RNX - 1, Math.floor((Math.max(ax, bx) + 40 - RX0) / C0)); i++) {
    const t = Math.max(0, Math.min(1, ((RX0 + (i + .5) * C0 - ax) * dx + (RZ0 + (j + .5) * C0 - az) * dz) / l2)); if (Math.hypot(RX0 + (i + .5) * C0 - ax - t * dx, RZ0 + (j + .5) * C0 - az - t * dz) <= 17) RAILX[j * RNX + i] = 1;
  }
}
// ring N straight: target cells carry the ring design level
const rs = readFileSync(`${out}/ring_samples_5m.csv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',').map(Number));
const rp = readFileSync(`${out}/ring_profile.csv`, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',').map(Number));
const ringPts = rs.filter((r) => r[0] >= Number(process.env.RST0 ?? 4600) && r[0] <= Number(process.env.RST1 ?? 6000)).map((r) => ({ x: r[1], z: r[2], st: r[0], y: rp[Math.round(r[0] / 10)][2] }));
// search grid
const GMAX = Number(process.env.GMAX ?? 0.03), RT = Number(process.env.RT ?? 0);
const arcOf = new Map<number, { k: number; l: number }>();
const C = 30, GX0 = -2800, GZ0 = -1600, NI = 100, NJ = 67, STEP = Number(process.env.STEP ?? 90);
const HB = 28, H0 = -232.5, DHD = 5, DHR = (DHD * Math.PI) / 180;           // heading bins, math angle atan2(dz, dx), bin centre = H0 + k*5
const DH = 0.9, Y0 = 10, NL = 80;
const ci = (x: number): number => Math.floor((x - GX0) / C), cj = (z: number): number => Math.floor((z - GZ0) / C);
const NS = HB * NJ * NI * NL; console.log('states', NS);
const dist = new Float32Array(NS).fill(Infinity), par = new Int32Array(NS).fill(-1);
const sid = (h: number, j: number, i: number, l: number): number => ((h * NJ + j) * NI + i) * NL + l;
const tgt = new Map<number, number>();                                         // cell -> ring level
for (const p of ringPts) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) tgt.set((cj(p.z) + dj) * NI + ci(p.x) + di, p.y);
let hk = new Float64Array(1 << 20), hv = new Int32Array(1 << 20), hn = 0;
const push = (k: number, v: number): void => { if (hn >= hk.length) { const a = new Float64Array(hk.length * 2); a.set(hk); hk = a; const b = new Int32Array(hv.length * 2); b.set(hv); hv = b; } let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
const pop = (): void => { const k = hk[--hn], v = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = v; };
const WC = 0.05, WF = 0.02;
// cost of a piece of road from (x,z) to (x2,z2) with heights y -> y2 (sampled every 30 m)
function pieceCost(x: number, z: number, x2: number, z2: number, y: number, y2: number, hr: number): number {
  let c = 0; const n = Math.max(1, Math.round(Math.hypot(x2 - x, z2 - z) / 30)), L = Math.hypot(x2 - x, z2 - z) / n, nx_ = -Math.sin(hr), nz_ = Math.cos(hr);
  for (let k = 1; k <= n; k++) {
    const t = k / n, px = x + (x2 - x) * t, pz = z + (z2 - z) * t, yy = y + (y2 - y) * t;
    const g0 = bil(px, pz), a = bil(px + 25 * nx_, pz + 25 * nz_), b = bil(px - 25 * nx_, pz - 25 * nz_);
    const cutE = Math.max(g0, a, b) - yy, fillE = yy - Math.min(g0, a, b), ex = Math.max(0, g0 - yy - CUTCAP) + Math.max(0, yy - g0 - FILLCAP);
    c += L * (1 + WC * Math.max(0, cutE) ** 2 + WF * Math.max(0, fillE) ** 2 + 30 * ex * ex);
    const cc = rcell(px, pz); if (WETR[cc]) c += 450; if (RECT[cc]) c += 450; if (RAILX[cc]) c += 400;
  }
  return c;
}
// start: J1 axis, s = 340, heading bin of -72.5 deg (axis is -72.4)
const YAWD = Number(process.env.J1YAW ?? 37.5) - 90;   // W arm axis = J1 yaw - 90 deg
   // env J1X / J1Z / J1YAW = J1 after the J1-a2 rotation
const J1 = { x: Number(process.env.J1X ?? -87), z: Number(process.env.J1Z ?? -277), yaw: (YAWD * Math.PI) / 180 }, SS = 340, S0 = 60, Y_PAD = 18.19;
const sx = J1.x + SS * Math.sin(J1.yaw), sz = J1.z - SS * Math.cos(J1.yaw), hs = Math.round((YAWD - 90 - H0) / DHD);
for (let l = 0; l < NL; l++) {
  const ys = Y0 + l * DH, g = (ys - Y_PAD) / (SS - S0); if (g < 0.003 || g > GMAX) continue;
  const x1 = J1.x + S0 * Math.sin(J1.yaw), z1 = J1.z - S0 * Math.cos(J1.yaw); const c = pieceCost(x1, z1, sx, sz, Y_PAD, ys, J1.yaw - Math.PI / 2 + Math.PI / 2 - Math.PI / 2);
  const s = sid(hs, cj(sz), ci(sx), l); if (c < dist[s]) { dist[s] = c; push(c, s); }
  // env RT = radius (m) of ONE tight first bend after the lane zone (low speed, 5 deg per step, constant level); the search continues from every arc end
  if (RT > 0) { let cx = sx, cz = sz, cc = c; const L = RT * DHR; for (let k = 1; k <= 30 && hs - k >= 0; k++) {
    const hr = (H0 + (hs - k + 0.5) * DHD) * Math.PI / 180, x2 = cx + L * Math.cos(hr), z2 = cz + L * Math.sin(hr); if (ci(x2) < 0 || ci(x2) >= NI || cj(z2) < 0 || cj(z2) >= NJ) break;
    cc += pieceCost(cx, cz, x2, z2, ys, ys, hr); cx = x2; cz = z2; const s2 = sid(hs - k, cj(cz), ci(cx), l); if (cc < dist[s2]) { dist[s2] = cc; arcOf.set(s2, { k, l }); push(cc, s2); } } }
}
let best = -1, popped = 0;
while (hn > 0) {
  const d = hk[0], s = hv[0]; pop(); if (d > dist[s]) continue; popped++;
  const l = s % NL, r1 = (s - l) / NL, i = r1 % NI, r2 = (r1 - i) / NI, j = r2 % NJ, h = (r2 - j) / NJ;
  const x = GX0 + (i + .5) * C, z = GZ0 + (j + .5) * C, y = Y0 + l * DH;
  const hd = H0 + h * DHD; const ty = tgt.get(j * NI + i);
  if (ty !== undefined && hd >= Number(process.env.HMIN ?? -200) && hd <= Number(process.env.HMAX ?? -160) && Math.abs(y - ty) <= 1.0) { best = s; break; }
  for (let dh = -1; dh <= 1; dh++) {
    const nh = h + dh; if (nh < 0 || nh >= HB) continue;
    const hr = (H0 + (h + dh * 0.5) * DHD) * Math.PI / 180, x2 = x + STEP * Math.cos(hr), z2 = z + STEP * Math.sin(hr), ni = ci(x2), nj = cj(z2);
    if (ni < 0 || ni >= NI || nj < 0 || nj >= NJ) continue;
    const kmax = Math.floor((GMAX * STEP) / DH + 1e-9);
    for (let k = -kmax; k <= kmax; k++) {
      const nl = l + k; if (nl < 0 || nl >= NL) continue;
      const nd = d + pieceCost(x, z, x2, z2, y, Y0 + nl * DH, hr) + (dh !== 0 ? TURN : 0), ns = sid(nh, nj, ni, nl);
      if (nd < dist[ns]) { dist[ns] = nd; par[ns] = s; push(nd, ns); }
    }
  }
}
if (best < 0) { console.log('NO ROUTE, popped', popped); process.exit(1); }
const pts: Array<{ x: number; z: number; y: number; hd: number }> = [];
for (let s = best; s >= 0; s = par[s]) { const l = s % NL, r1 = (s - l) / NL, i = r1 % NI, r2 = (r1 - i) / NI, j = r2 % NJ, h = (r2 - j) / NJ; pts.push({ x: GX0 + (i + .5) * C, z: GZ0 + (j + .5) * C, y: Y0 + l * DH, hd: H0 + h * DHD }); }
pts.reverse();
// prepend the tight first bend (it is not in the parent chain) so that cut, fill and length include it
{ const first = best >= 0 ? (() => { let s = best, last = best; for (; s >= 0; s = par[s]) last = s; return last; })() : -1; const ai = arcOf.get(first);
  if (RT > 0 && ai) { const L = RT * DHR, arc: typeof pts = [{ x: sx, z: sz, y: Y0 + ai.l * DH, hd: H0 + hs * DHD }]; let ax = sx, az = sz;
    for (let k = 1; k <= ai.k; k++) { const hr = (H0 + (hs - k + 0.5) * DHD) * Math.PI / 180; ax += L * Math.cos(hr); az += L * Math.sin(hr); arc.push({ x: ax, z: az, y: Y0 + ai.l * DH, hd: H0 + (hs - k) * DHD }); }
    pts.splice(0, 1, ...arc); console.log(`tight first bend R ${RT}: ${ai.k} steps = ${(ai.k * L).toFixed(0)} m, ${ai.k * DHD} deg, level ${(Y0 + ai.l * DH).toFixed(1)} m`); } }
let len = 0, turns = 0, cutMax = 0, fillMax = 0, viaduct = 0, wet = 0, zone = 0, rail = 0, gmax = 0;
for (let k = 1; k < pts.length; k++) {
  const a = pts[k - 1], b = pts[k], dl = Math.hypot(b.x - a.x, b.z - a.z); len += dl; if (b.hd !== a.hd) turns++; gmax = Math.max(gmax, Math.abs(b.y - a.y) / dl);
  const g = bil(b.x, b.z); cutMax = Math.max(cutMax, g - b.y); fillMax = Math.max(fillMax, b.y - g); if (b.y - g > 7) viaduct += dl; const cc = rcell(b.x, b.z); if (WETR[cc]) wet++; if (RECT[cc]) zone++; if (RAILX[cc] && !RAILX[rcell(a.x, a.z)]) rail++;
}
console.log(`HYBRID W ARM  turn cost ${TURN}, cut cap ${CUTCAP}, fill cap ${FILLCAP}: popped ${popped}`);
console.log(`route from s=${SS}: ${len.toFixed(0)} m (straight ${Math.hypot(pts[pts.length - 1].x - sx, pts[pts.length - 1].z - sz).toFixed(0)} m), ${turns} turning steps of 5 deg, heading ${pts[0].hd} -> ${pts[pts.length - 1].hd} deg`);
console.log(`max grade ${(gmax * 100).toFixed(2)} %, max centre cut ${cutMax.toFixed(1)} m, max centre fill ${fillMax.toFixed(1)} m, fill > 7 m (viaduct) ${viaduct.toFixed(0)} m, wet ${wet}, zone ${zone}, rail crossings ${rail}`);
writeFileSync(`${out}/j1c5_hybrid.json`, JSON.stringify({ turn: TURN, cutCap: CUTCAP, fillCap: FILLCAP, len, turns, cutMax, fillMax, viaduct, wet, zone, rail, pts }));
