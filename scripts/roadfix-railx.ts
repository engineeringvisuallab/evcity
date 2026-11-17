// ROADFIX R2 (rail crossings, built on step 2c): lines that no re-route can fix -> keep the centreline (smoothed if the radius is short) and let the road level choose, per 10 m station, between
//   E earthwork (cut <= 12 m / fill <= 7 m across the pavement), V viaduct (level above the fill window, height <= VMAX), T tunnel (level below the cut window, cls 4 / 2 only, grade <= 4 %).
// Dynamic programme over (station, level, mode), cheapest first: earthwork < viaduct < tunnel. Then an independent re-check. Writes docs/roadfix_struct.json (or $OUT).
import { readFileSync, writeFileSync } from 'fs';
import { LIMIT, TUNNEL_GRADE, plen, hyp, resamplePts, hNat, wetAt, minRadius, railCrossings } from './roadfix-lib';
const J = JSON.parse(readFileSync(process.env.IN || 'docs/map_all_roads_v3.json', 'utf8'));
const ids = (process.env.IDS || '').split(',').filter(Boolean);
const MAXCUT = 12, MAXFILL = 7, U = 0.25, VMAX = 45, STEP = 10;
const relax = (p: number[][], it: number): number[][] => { let q = resamplePts(p, 10).map((v) => [v[0], v[1]]); for (let k = 0; k < it; k++) { const n = q.map((v) => [v[0], v[1]]); for (let i = 2; i < q.length - 2; i++) { n[i][0] = (q[i - 2][0] + 2 * q[i - 1][0] + 2 * q[i][0] + 2 * q[i + 1][0] + q[i + 2][0]) / 8; n[i][1] = (q[i - 2][1] + 2 * q[i - 1][1] + 2 * q[i][1] + 2 * q[i + 1][1] + q[i + 2][1]) / 8; } q = n; } return q; };
interface Rx { over: number; under: number | null }
interface St { hC: number; hMin: number; hMax: number; wet: boolean; rx?: Rx }
const ROW = 30, CLR = 7.5, UNDER = 7.0; interface Zone { at: number; half: number; over: number; under: number | null }
const stations = (d: number[][], half: number, zones: Zone[] = []): St[] => d.map((p, i) => { const a = Math.max(0, i - 1), b = Math.min(d.length - 1, i + 1), tx = d[b][0] - d[a][0], tz = d[b][1] - d[a][1], tl = hyp(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
  const c = hNat(p[0], p[1]), l = hNat(p[0] + nx * half, p[1] + nz * half), r = hNat(p[0] - nx * half, p[1] - nz * half); const z = zones.find((q) => Math.abs(i * STEP - q.at) <= q.half); return { hC: c, hMin: Math.min(c, l, r), hMax: Math.max(c, l, r), wet: wetAt(p[0], p[1]), rx: z ? { over: z.over, under: z.under } : undefined }; });
/** mode of a station at level y: 'E' | 'V' | 'T' | 'W' (over water) | null (not allowed) */
const modeAt = (s: St, y: number, tunnelOk: boolean): string[] => { const o: string[] = [];
  if (s.rx) { if (y >= s.rx.over - 1e-6 && y >= s.hMax - MAXCUT - 1e-6 && y - s.hMin <= VMAX) o.push(s.wet ? 'W' : 'X'); if (!s.wet && s.rx.under !== null && y <= s.rx.under + 1e-6 && y >= s.hMax - MAXCUT - 1e-6 && y <= s.hMin + MAXFILL + 1e-6) o.push('E'); return o; }
  if (s.wet) { o.push('W'); return o; }
  if (y >= s.hMax - MAXCUT - 1e-6 && y <= s.hMin + MAXFILL + 1e-6) o.push('E');
  if (y > s.hMin + MAXFILL + 1e-6 && y - s.hMin <= VMAX) o.push('V');
  if (tunnelOk && y < s.hMax - MAXCUT - 1e-6) o.push('T'); return o; };
const MODES = ['E', 'V', 'T', 'W', 'X']; const MI: Record<string, number> = { E: 0, V: 1, T: 2, W: 3, X: 4 };
const PEN = [[0, 60, 400, 60, 60], [60, 0, 400, 0, 0], [100, 400, 0, 400, 400], [60, 0, 400, 0, 0], [60, 0, 400, 0, 0]]; // mode change penalty [from][to]
const SC = [10, 62, 140, 40, 70]; // cost per station by mode
function solve(st: St[], cls: number): { y: number[]; m: string[] } | null {
  const L = LIMIT[cls]; const N = st.length; const tOk = L.tunnel;
  const lo = Math.floor(Math.min(...st.map((s) => s.hMin)) - 40), hi = Math.ceil(Math.max(...st.map((s) => s.hMax)) + 50), NJ = Math.round((hi - lo) / U) + 1;
  const INF = 1e12; const cost: Float64Array[][] = []; const par: Int32Array[][] = [];
  const allowed = (i: number, j: number): number[] => { if (false) { const s = st[i]; const y = lo + j * U; const w = s.wet ? ['W'] : (y >= s.hMax - MAXCUT - 1e-6 && y <= s.hMin + MAXFILL + 1e-6 ? ['E'] : []); return w.map((q) => MI[q]); } return modeAt(st[i], lo + j * U, tOk).map((q) => MI[q]); };
  let prev: Float64Array[] = [0, 1, 2, 3, 4].map(() => new Float64Array(NJ).fill(INF));
  for (let j = 0; j < NJ; j++) for (const m of allowed(0, j)) prev[m][j] = SC[m] + 0.8 * Math.abs(lo + j * U - st[0].hC);
  const back: { pm: Int8Array; pj: Int32Array }[][] = [];
  for (let i = 1; i < N; i++) { const nxt: Float64Array[] = [0, 1, 2, 3, 4].map(() => new Float64Array(NJ).fill(INF)); const bm = [0, 1, 2, 3, 4].map(() => new Int8Array(NJ).fill(-1)), bj = [0, 1, 2, 3, 4].map(() => new Int32Array(NJ).fill(-1));
    const KG = Math.floor((L.grade * STEP) / U + 1e-9), KT = Math.floor((Math.min(L.grade, TUNNEL_GRADE) * STEP) / U + 1e-9);
    for (let j = 0; j < NJ; j++) { const y = lo + j * U; for (const m of allowed(i, j)) { const Kc = m === 2 ? KT : KG; let best = INF, bpm = -1, bpj = -1;
        for (let pm = 0; pm < 5; pm++) { const K = Math.min(Kc, pm === 2 ? KT : KG); const pc = prev[pm]; for (let k = -K; k <= K; k++) { const jp = j + k; if (jp < 0 || jp >= NJ) continue; const v = pc[jp]; if (v >= INF) continue; const c = v + PEN[pm][m] + 0.6 * Math.abs(k) * U; if (c < best) { best = c; bpm = pm; bpj = jp; } } }
        if (best < INF) { nxt[m][j] = best + SC[m] + (m === 0 ? 0.8 * Math.abs(y - st[i].hC) : 0); bm[m][j] = bpm; bj[m][j] = bpj; } } }
    (back as any)[i - 1] = [bm, bj]; if (nxt.every((q) => q.every((v) => v >= INF))) { (globalThis as any).__dead = i * STEP; return null; } prev = nxt; }
  let bc = INF, bmm = -1, bjj = -1; for (let m = 0; m < 5; m++) for (let j = 0; j < NJ; j++) if (prev[m][j] < bc) { bc = prev[m][j]; bmm = m; bjj = j; }
  if (bmm < 0) return null; const y: number[] = [], mm: string[] = []; let m = bmm, j = bjj;
  for (let i = N - 1; i >= 0; i--) { y[i] = lo + j * U; mm[i] = MODES[m]; if (i === 0) break; const [bM, bJ] = (back as any)[i - 1]; const pm = bM[m][j], pj = bJ[m][j]; m = pm; j = pj; }
  return { y, m: mm };
}
/** independent re-check of a solution: grade, earthwork window, viaduct height, tunnel window and tunnel grade */
function verify(st: St[], y: number[], m: string[], cls: number): string[] {
  const L = LIMIT[cls]; const bad: string[] = [];
  for (let i = 0; i < st.length; i++) { const s = st[i]; if (m[i] === 'E' && !(y[i] >= s.hMax - MAXCUT - 1e-6 && y[i] <= s.hMin + MAXFILL + 1e-6)) bad.push('E@' + i * STEP);
    if (m[i] === 'V' && !(y[i] > s.hMin + MAXFILL - 1e-6 && y[i] - s.hMin <= VMAX + 1e-6)) bad.push('V@' + i * STEP);
    if (m[i] === 'T' && !(y[i] < s.hMax - MAXCUT + 1e-6)) bad.push('T@' + i * STEP);
    if (m[i] === 'X' && !(s.rx && y[i] >= s.rx.over - 1e-6 && y[i] - s.hMin <= VMAX + 1e-6)) bad.push('X@' + i * STEP);
    if (s.rx && m[i] === 'E' && !(s.rx.under !== null && y[i] <= s.rx.under + 1e-6)) bad.push('Eunder@' + i * STEP);
    if (s.rx && (m[i] === 'V' || m[i] === 'T')) bad.push('rxmode@' + i * STEP);
    if (i > 0) { const g = Math.abs(y[i] - y[i - 1]) / STEP; const lim = (m[i] === 'T' || m[i - 1] === 'T') ? Math.min(L.grade, TUNNEL_GRADE) : L.grade; if (g > lim + 1e-6) bad.push('G@' + i * STEP); } }
  return bad; }
const RX = JSON.parse(readFileSync(process.env.RX || '/tmp/rx.json', 'utf8')); const out: any[] = []; let ok = 0; const rep: string[] = [];
for (const id of ids) { const r = J.roads.find((x: any) => x.id === id); if (!r) { console.log(' ', id, 'not found'); continue; } const cls = r.cls as number; const L = LIMIT[cls]; let pts: number[][] = r.pts; const tot = plen(pts);
  const cr = railCrossings(pts).filter((q) => q.above < 9); const zones: Zone[] = []; const info: any[] = [];
  for (const q of cr) { const ds = hNat(q.x, q.z) + q.above; if (q.kind === 'tunnel' && q.above < -40) { info.push({ at: Math.round(q.at), ang: Math.round(q.ang), kind: q.kind, rail_h: +ds.toFixed(1), type: 'over-rail-tunnel' }); continue; }
    zones.push({ at: q.at, half: Math.max(25, Math.min(100, ROW / Math.max(0.3, Math.sin((q.ang * Math.PI) / 180)))), over: ds + CLR, under: q.kind === 'bridge' ? ds - UNDER : null }); info.push({ at: Math.round(q.at), ang: Math.round(q.ang), kind: q.kind, rail_h: +ds.toFixed(1), type: 'pending' }); }
  const d = resamplePts(pts, STEP); const st = stations(d, L.half, zones); const sol = solve(st, cls);
  if (!sol) { console.log(' ', id.padEnd(9), 'cls', cls, 'FAIL no legal level at the rail crossing (dead at s', (globalThis as any).__dead, 'of', Math.round(tot) + ')'); rep.push(id); continue; }
  const bad = verify(st, sol.y, sol.m, cls); const segs: any[] = []; let a = 0; for (let i = 1; i <= sol.m.length; i++) if (i === sol.m.length || sol.m[i] !== sol.m[a]) { if (sol.m[a] !== 'E') segs.push({ kind: sol.m[a], s0: a * STEP, s1: (i - 1) * STEP, len: (i - 1 - a) * STEP, h: Math.round(Math.max(...sol.y.slice(a, i).map((v, q) => Math.abs(v - st[a + q].hMin)))) }); a = i; }
  const sum = (k: string) => segs.filter((q) => q.kind === k).reduce((s2, q) => s2 + q.len, 0); const tl = sum('T'), vl = sum('V'), xl = sum('X');
  for (const f of info) if (f.type === 'pending') { const zi = Math.round(f.at / STEP); f.type = sol.m[zi] === 'X' || sol.m[zi] === 'W' ? 'overpass' : 'underpass'; f.road_level = +sol.y[zi].toFixed(1); }
  console.log(' ', id.padEnd(9), 'cls', cls, (bad.length ? 'CHECK FAIL ' + bad.slice(0, 3).join(',') : 'OK').padEnd(12), info.map((f) => f.type + '@' + f.at).join(' '), '| tunnel', tl, 'viaduct', vl, 'rail-span', xl);
  if (!bad.length) { ok++; out.push({ id, cls, smooth: 0, pts: pts.map((q) => [+q[0].toFixed(2), +q[1].toFixed(2)]), segs, tunnel_m: tl, viaduct_m: vl + xl, x_m: xl, level: sol.y.map((v) => +v.toFixed(2)), mode: sol.m.join(''), railx: info }); } }
console.log('RAILX RESULT:', ok, 'of', ids.length, rep.length ? ' FAILED: ' + rep.join(',') : ''); writeFileSync(process.env.OUT || 'docs/roadfix_railx.json', JSON.stringify(out));
