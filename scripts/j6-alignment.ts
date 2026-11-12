// J6 T04: horizontal alignment search for the west leg (centre -> J57) and the south branch (T -> S5) on the REAL terrain.
// Headless (no three). Run: npx tsx scripts/j6-alignment.ts   (env: J6_GRADE=0.08 design grade, J6_T=250 min T distance (m))
// Method: waypoints -> Catmull-Rom polyline (8 m step) -> ground profile -> finished profile = ground clamped between the two end heights by a grade-limit
// envelope (forward + backward pass) -> cut / fill volume, min radius, max grade. Simulated annealing over the free waypoints. Output = waypoints in (u,v) for J6Scenario.ts.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J6_SCENARIO, uvToWorld, worldToUV, type UV } from '../src/interchange/scenario/J6Scenario';

Config.roads.scenario.enabled = false; // the ORIGINAL network: real ground + the original S5 / J57
const g: any = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const C = J6_SCENARIO.centre;
const ground = (u: number, v: number): number => { const [x, z] = uvToWorld(C, { u, v }); return g.heightAt(x, z); };

const GRADE = Number(process.env.J6_GRADE ?? 0.08); // design grade (collector class limit is 10 %)
const LF = Number(process.env.J6_LF ?? 1.6); // lattice moves may follow ground up to LF x the design grade (the finished profile cuts the rest)
const T_MIN = Number(process.env.J6_T ?? 250);
const RMIN = 73; // 50 km/h
const WIDTH = 12; // formation width (m)
const STEP = 8;
const CLEARANCE_UNDER = 5.5 + 1.4; // cross road lies this far below F6 at the crossing (diamond, cross road under)
const SLOPE_CUT = 2; // 1:2
const SLOPE_FILL = 3; // 1:3

// ---- anchors --------------------------------------------------------------------------------------------------------------------------------
const f6 = R.roads[5];
let kc = 0, bd = 1e18;
for (let i = 0; i < f6.xs.length; i++) { const d = (f6.xs[i] - C.x) ** 2 + (f6.zs[i] - C.z) ** 2; if (d < bd) { bd = d; kc = i; } }
const yCentre = f6.ys[kc]; // F6 surface at the centre
const yStart = yCentre - CLEARANCE_UNDER; // west leg starts UNDER F6
const j57 = R.pads.find((p: any) => p.id === 57);
const j57uv = worldToUV(C, j57.x, j57.z);
const s5 = R.roads[25];
const s5Join = (() => { // S5 point nearest to the old join estimate (u -198, v 89)
  const [jx, jz] = uvToWorld(C, { u: -198, v: 89 });
  let b = 0, d0 = 1e18;
  for (let i = 0; i < s5.xs.length; i++) { const d = (s5.xs[i] - jx) ** 2 + (s5.zs[i] - jz) ** 2; if (d < d0) { d0 = d; b = i; } }
  const uv = worldToUV(C, s5.xs[b], s5.zs[b]);
  const nxt = worldToUV(C, s5.xs[b + 6], s5.zs[b + 6]);
  return { uv, y: s5.ys[b], dir: Math.atan2(nxt.v - uv.v, nxt.u - uv.u) };
})();
console.log(`centre y ${yCentre.toFixed(1)} (west leg starts at ${yStart.toFixed(1)} under F6) | J57 uv (${j57uv.u.toFixed(0)}, ${j57uv.v.toFixed(0)}) y ${j57.y.toFixed(1)} | S5 join uv (${s5Join.uv.u.toFixed(0)}, ${s5Join.uv.v.toFixed(0)}) y ${s5Join.y.toFixed(1)}`);

// ---- geometry -------------------------------------------------------------------------------------------------------------------------------
function catmull(p: UV[]): UV[] {
  const out: UV[] = [];
  const P = [p[0], ...p, p[p.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [a, b, c, d] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(c.u - b.u, c.v - b.v) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (x0: number, x1: number, x2: number, x3: number) => 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      out.push({ u: f(a.u, b.u, c.u, d.u), v: f(a.v, b.v, c.v, d.v) });
    }
  }
  out.push(p[p.length - 1]);
  return out;
}
function resample(poly: UV[]): UV[] { // even STEP spacing
  const out: UV[] = [poly[0]];
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    let a = poly[i - 1];
    const b = poly[i];
    let seg = Math.hypot(b.u - a.u, b.v - a.v);
    while (acc + seg >= STEP) {
      const t = (STEP - acc) / seg;
      a = { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t };
      out.push(a);
      seg = Math.hypot(b.u - a.u, b.v - a.v);
      acc = 0;
    }
    acc += seg;
  }
  const last = poly[poly.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last.u - tail.u, last.v - tail.v) > 1) out.push(last);
  return out;
}
function minRadius(p: UV[]): number {
  let m = 1e9;
  const k = 3; // 3 x STEP chord
  for (let i = k; i < p.length - k; i++) {
    const a = p[i - k], b = p[i], c = p[i + k];
    const ab = Math.hypot(b.u - a.u, b.v - a.v), bc = Math.hypot(c.u - b.u, c.v - b.v), ca = Math.hypot(a.u - c.u, a.v - c.v);
    const area2 = Math.abs((b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u));
    if (area2 < 1e-6) continue;
    m = Math.min(m, (ab * bc * ca) / (2 * area2));
  }
  return m;
}

interface Result {
  pts: UV[];
  ys: number[];
  hs: number[];
  length: number;
  cut: number;
  fill: number;
  maxCut: number;
  maxFill: number;
  vol: number;
  minR: number;
  maxGrade: number;
  infeasible: number; // m of grade shortfall (end height cannot be reached)
  cost: number;
}
function evaluate(way: UV[], yA: number, yB: number, grade: number): Result {
  const pts = resample(catmull(way));
  const n = pts.length;
  const hs = pts.map((p) => ground(p.u, p.v));
  const ds = pts.map((p, i) => (i === 0 ? 0 : Math.hypot(p.u - pts[i - 1].u, p.v - pts[i - 1].v)));
  const cum: number[] = [];
  let L = 0;
  for (let i = 0; i < n; i++) { L += ds[i]; cum.push(L); }
  // finished profile: ground, then limited to the cone reachable from A (forward) and B (backward)
  const ys = hs.slice();
  ys[0] = yA;
  ys[n - 1] = yB;
  for (let i = 1; i < n; i++) ys[i] = Math.min(ys[i - 1] + grade * ds[i], Math.max(ys[i - 1] - grade * ds[i], ys[i]));
  let infeasible = Math.max(0, Math.abs(ys[n - 1] - yB) - 0.01);
  ys[n - 1] = yB;
  for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + grade * ds[i + 1], Math.max(ys[i + 1] - grade * ds[i + 1], ys[i]));
  infeasible += Math.max(0, Math.abs(ys[0] - yA) - 0.01);
  ys[0] = yA;
  let cut = 0, fill = 0, maxCut = 0, maxFill = 0, mg = 0;
  for (let i = 0; i < n; i++) {
    const d = hs[i] - ys[i];
    if (d > 0) { const a = d * (WIDTH + SLOPE_CUT * d); cut += a * (ds[i] || STEP); maxCut = Math.max(maxCut, d); }
    else { const a = -d * (WIDTH + SLOPE_FILL * -d); fill += a * (ds[i] || STEP); maxFill = Math.max(maxFill, -d); }
    if (i > 0) mg = Math.max(mg, Math.abs(ys[i] - ys[i - 1]) / ds[i]);
  }
  const mr = minRadius(pts);
  const vol = cut + fill;
  const cost = 6 * vol + 40 * WIDTH * L;
  return { pts, ys, hs, length: L, cut, fill, maxCut, maxFill, vol, minR: mr, maxGrade: mg, infeasible, cost };
}
const score = (r: Result): number => r.cost + 4e6 * r.infeasible + 6e5 * Math.max(0, RMIN - r.minR) + 5e3 * Math.max(0, r.maxCut - 20) ** 2;

// ---- least-cost route on a lattice (grade + radius aware) -------------------------------------------------------------------------------------
// State = (node, heading primitive). A move is an integer offset of ~30 m; two consecutive moves may turn by at most 2 asin(chord / 2R) (R >= RMIN),
// so the lattice route already meets the radius rule. Ground grade of every move <= grade (the finished profile is then close to the ground).
const CELL = 10;
const U0 = -700, V0 = -120, NU = 121, NV = 100; // lattice 1210 x 1000 m
const H = new Float32Array(NU * NV);
for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) H[i * NV + j] = ground(U0 + i * CELL, V0 + j * CELL);
const hAt = (i: number, j: number): number => H[i * NV + j];
const PRIM: { a: number; b: number; len: number; ang: number }[] = [];
for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const l = Math.hypot(a, b) * CELL; if (l >= 26 && l <= 37) PRIM.push({ a, b, len: l, ang: Math.atan2(b, a) }); }
const NP = PRIM.length;
const angDiff = (x: number, y: number): number => { let d = Math.abs(x - y) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
const TURN: number[][] = PRIM.map((p) => PRIM.map((q) => (angDiff(p.ang, q.ang) <= 2 * Math.asin(Math.min(1, ((p.len + q.len) / 4) / RMIN)) ? 1 : 0) as number).map((ok, k) => (ok ? k : -1)).filter((k) => k >= 0));
const gradU = (i: number, j: number): number => (hAt(Math.min(NU - 1, i + 1), j) - hAt(Math.max(0, i - 1), j)) / (2 * CELL);
const gradV = (i: number, j: number): number => (hAt(i, Math.min(NV - 1, j + 1)) - hAt(i, Math.max(0, j - 1))) / (2 * CELL);

class Heap {
  k: number[] = [];
  v: number[] = [];
  push(key: number, val: number): void { let i = this.k.length; this.k.push(key); this.v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= this.k[i]) break; [this.k[p], this.k[i]] = [this.k[i], this.k[p]]; [this.v[p], this.v[i]] = [this.v[i], this.v[p]]; i = p; } }
  pop(): [number, number] | null {
    if (!this.k.length) return null;
    const rk = this.k[0], rv = this.v[0];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) { this.k[0] = lk; this.v[0] = lv; let i = 0; const n = this.k.length; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && this.k[l] < this.k[m]) m = l; if (r < n && this.k[r] < this.k[m]) m = r; if (m === i) break; [this.k[m], this.k[i]] = [this.k[i], this.k[m]]; [this.v[m], this.v[i]] = [this.v[i], this.v[m]]; i = m; } }
    return [rk, rv];
  }
}
/** Cheapest lattice route from start node with a start heading (angle, rad) to any node within `tol` m of `goal`. Returns node positions (u,v). */
function route(start: UV, startAng: number, goal: UV, tol: number, grade: number): UV[] | null {
  const si = Math.round((start.u - U0) / CELL), sj = Math.round((start.v - V0) / CELL);
  const gi = (goal.u - U0) / CELL, gj = (goal.v - V0) / CELL;
  const dist = new Float64Array(NU * NV * NP).fill(Infinity);
  const prev = new Int32Array(NU * NV * NP).fill(-1);
  const heap = new Heap();
  for (let k = 0; k < NP; k++) if (angDiff(PRIM[k].ang, startAng) < 0.3) { const id = (si * NV + sj) * NP + k; dist[id] = 0; heap.push(0, id); }
  let found = -1;
  for (let it = heap.pop(); it; it = heap.pop()) {
    const [d, id] = it;
    if (d > dist[id]) continue;
    const k = id % NP, node = (id - k) / NP, j = node % NV, i = (node - j) / NV;
    if (Math.hypot(i - gi, j - gj) * CELL <= tol) { found = id; break; }
    for (const k2 of TURN[k]) {
      const q = PRIM[k2];
      const i2 = i + q.a, j2 = j + q.b;
      if (i2 < 0 || j2 < 0 || i2 >= NU || j2 >= NV) continue;
      const dh = hAt(i2, j2) - hAt(i, j);
      if (Math.abs(dh) / q.len > grade * LF) continue;
      // sidehill cross-slope at the move: component of the ground gradient across the move direction
      const gu = (gradU(i, j) + gradU(i2, j2)) / 2, gv = (gradV(i, j) + gradV(i2, j2)) / 2;
      const cross = Math.abs(-Math.sin(q.ang) * gu + Math.cos(q.ang) * gv);
      const earth = 6 * ((cross * WIDTH * WIDTH) / 4) * (1 + cross * 2); // m2 of sidehill section x unit cost
      const c = d + q.len * (40 * WIDTH + earth);
      const id2 = (i2 * NV + j2) * NP + k2;
      if (c < dist[id2]) { dist[id2] = c; prev[id2] = id; heap.push(c, id2); }
    }
  }
  if (found < 0) return null;
  const out: UV[] = [];
  for (let id = found; id >= 0; id = prev[id]) { const k = id % NP, node = (id - k) / NP, j = node % NV, i = (node - j) / NV; out.push({ u: U0 + i * CELL, v: V0 + j * CELL }); }
  return out.reverse();
}
/** Corner cutting keeps the ends and only raises the radius. */
function chaikin(p: UV[], passes: number): UV[] {
  let q = p;
  for (let n = 0; n < passes; n++) { const r: UV[] = [q[0]]; for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; r.push({ u: 0.75 * a.u + 0.25 * b.u, v: 0.75 * a.v + 0.25 * b.v }, { u: 0.25 * a.u + 0.75 * b.u, v: 0.25 * a.v + 0.75 * b.v }); } r.push(q[q.length - 1]); q = r; }
  return q;
}
const fmt = (w: UV[]) => w.map((p) => `{ u: ${p.u.toFixed(0)}, v: ${p.v.toFixed(0)} }`).join(', ');
function report(name: string, r: Result, grade: number): void {
  console.log(`  ${name}: length ${r.length.toFixed(0)} m, min R ${r.minR.toFixed(0)} m, max grade ${(r.maxGrade * 100).toFixed(1)} % (design ${(grade * 100).toFixed(0)} %), max cut ${r.maxCut.toFixed(1)} m, max fill ${r.maxFill.toFixed(1)} m, cut ${(r.cut / 1000).toFixed(1)}k m3, fill ${(r.fill / 1000).toFixed(1)}k m3, grade shortfall ${r.infeasible.toFixed(1)} m, cost ${(r.cost / 1e6).toFixed(2)} M`);
}
const thin = (p: UV[], every: number): UV[] => p.filter((_, i) => i % every === 0 || i === p.length - 1);

// ---- 1. west leg: centre -> J57 ----------------------------------------------------------------------------------------------------------------
console.log(`\n=== STRAIGHT chord reference (centre -> J57) ===`);
report('straight', evaluate([{ u: 0, v: 0 }, { u: j57uv.u, v: j57uv.v }], yStart, j57.y, GRADE), GRADE);
const head: UV[] = [{ u: 0, v: 0 }, { u: 0, v: 40 }, { u: 0, v: 110 }]; // terminal + queue storage: straight
const r1 = route({ u: 0, v: 110 }, Math.PI / 2, j57uv, 15, GRADE);
if (!r1) { console.log('NO west-leg route at this grade'); process.exit(1); }
const westWay = [...head, ...thin(chaikin(r1, 2), 3).slice(1)];
westWay[westWay.length - 1] = { u: j57uv.u, v: j57uv.v };
const W = evaluate(westWay, yStart, j57.y, GRADE);
console.log(`\n=== WEST LEG (lattice route, ground grade <= ${(GRADE * 100).toFixed(0)} %, R >= ${RMIN} m) ===`);
report('west', W, GRADE);

// ---- 2. T junction on the west leg + south branch to S5 -------------------------------------------------------------------------------------------
let best: { sT: number; T: UV; yT: number; way: UV[]; res: Result } | null = null;
for (let sT = T_MIN; sT < W.length - 150; sT += 40) {
  const idx = Math.min(W.pts.length - 2, Math.max(1, Math.round(sT / STEP)));
  const T = W.pts[idx], yT = W.ys[idx];
  const hd = Math.atan2(W.pts[idx + 1].v - W.pts[idx - 1].v, W.pts[idx + 1].u - W.pts[idx - 1].u);
  const toS5 = Math.atan2(s5Join.uv.v - T.v, s5Join.uv.u - T.u);
  const side = Math.sin(toS5 - hd) >= 0 ? 1 : -1; // branch leaves on the S5 side
  const ang = hd + side * Math.PI / 2;
  const stub: UV = { u: T.u + 40 * Math.cos(ang), v: T.v + 40 * Math.sin(ang) };
  const r2 = route(stub, ang, s5Join.uv, 15, GRADE);
  if (!r2) continue;
  const way = [T, stub, ...thin(chaikin(r2, 2), 3).slice(1)];
  way[way.length - 1] = { ...s5Join.uv };
  const res = evaluate(way, yT, s5Join.y, GRADE);
  const sc = score(res) + 4e3 * Math.abs(sT - T_MIN); // prefer the T near the minimum spacing unless the branch is much cheaper
  if (!best || sc < best.res.cost + 4e6 * best.res.infeasible + 6e5 * Math.max(0, RMIN - best.res.minR) + 4e3 * Math.abs(best.sT - T_MIN)) best = { sT, T, yT, way, res };
}
if (!best) { console.log('NO south-branch route'); process.exit(1); }
console.log(`\n=== T JUNCTION ${best.sT} m from the centre along the west leg: uv (${best.T.u.toFixed(0)}, ${best.T.v.toFixed(0)}) y ${best.yT.toFixed(1)} ===`);
report('south branch', best.res, GRADE);

// ---- alternative C: the west leg ends on S5 (the join) and does NOT climb to J57 (J57 stays reachable through S5) ------------------------------------
const rC = route({ u: 0, v: 110 }, Math.PI / 2, s5Join.uv, 15, GRADE);
if (rC) {
  const wayC = [...head, ...thin(chaikin(rC, 2), 3).slice(1)];
  wayC[wayC.length - 1] = { ...s5Join.uv };
  const resC = evaluate(wayC, yStart, s5Join.y, GRADE);
  console.log(`\n=== ALTERNATIVE C: west leg -> S5 join only (no J57 link) ===`);
  report('leg C', resC, GRADE);
  console.log(`  waypoints: [${fmt(wayC)}]`);
}
const tot = W.vol + best.res.vol;
console.log(`\nTOTAL earthwork ${(tot / 1000).toFixed(1)}k m3 (west ${(W.vol / 1000).toFixed(1)}k + branch ${(best.res.vol / 1000).toFixed(1)}k)`);
console.log(`west waypoints: [${fmt(westWay)}]`);
console.log(`branch waypoints: [${fmt(best.way)}]`);
console.log(`\nJSON ${JSON.stringify({ grade: GRADE, west: westWay, branch: best.way, tM: best.sT, westLen: W.length, branchLen: best.res.length, westR: W.minR, branchR: best.res.minR, westMaxCut: W.maxCut, branchMaxCut: best.res.maxCut })}`);
