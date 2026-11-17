// STEP C: housing STREET CENTRELINES (plan view only), all 9 housings. No profile, no cross-section, no mesh, no junction design (J-xx = placeholder).
// Run: npx tsx scripts/housing-streets.ts docs        (writes docs/housing_streets.json and docs/STEPC_OUTPUT.txt; a few minutes)
// Sketch lines R6 / R4 / R2 (docs/map_all_roads_v2.json) and the built roads are NOT changed; streets hang on them. Buildings are NOT moved. Villages wait (19.5-1).
// Rules printed per housing: R1 (no crossing, nodes >= 60 m), R2 (need text per street), R3 (straight - spiral - arc - spiral - straight), R8 (ground first: water check is the first test of every sample).
// All numbers marked (mine) are my planning numbers, from my knowledge, NOT looked up on the web: verify before quoting.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

type P = { x: number; z: number };
type K = 'A' | 'C' | 'L';
interface Cand { cls: K; pts: P[] }
interface Seg { a: P; b: P; cls: number; id: string; hc?: boolean }   // hc = a street of an earlier (higher priority) housing, joinable like an R2 line but NOT a network access
let EXCL: { cx: number; cz: number; r: number }[] = [];   // circles of earlier housings that overlap this one: this housing keeps out (the earlier housing owns the overlap)
const realSk = (ids: Iterable<string>): boolean => { for (const i of ids) if (!i.startsWith('H-')) return true; return false; };
interface Piece { id: string; cls: K; pts: P[]; site: string; need: string }
interface Rect { id: string; x: number; z: number; yaw: number; W: number; D: number }
interface Site { id: string; code: string; key: string; cx: number; cz: number; r: number; pat: string; name: string }

const OUT = process.argv[2] ?? 'docs';
const ONLY: string[] | null = process.env.ONLY ? process.env.ONLY.split(',') : null;   // dev: rerun only these sites (merged into the existing json in OUT)
mkdirSync(OUT, { recursive: true });
const LOG: string[] = [];
const log = (s: string): void => { LOG.push(s); console.log(s); };

// ---------- parameters (mine) ----------
const STEP = 5;            // sample distance (m)
const MIN_LEN = 60;        // shortest street piece = also the node gap (R1: nodes >= 60 m)
const NODE_GAP = 60;
const GRADE: Record<K, number> = { A: 0.06, C: 0.08, L: 0.10 };      // arterial 6 %, collector 8 %, local 10 % (user: local <= 10 %, collector <= 8 %)
const RMIN: Record<K, number> = { A: 120, C: 60, L: 30 };            // min radius (m)
const HW: Record<K, number> = { A: 9, C: 6, L: 4.5 };                // half carriageway + footpath (m)
const BMARGIN = 3;         // building margin (m)
const CLEAR_HARD = 25;     // clear of R6 / 8-lane (m)
const CLEAR_R4_LOCAL = 20; // a local street stops this far from an R4 line
const PAR_DIST = 10, PAR_ANG = 30 * Math.PI / 180;
const CUL_MAX = 200;
const WET_MARGIN = 0.4;    // ground within 0.4 m of the water level counts as wet (stricter than sc.water > sc.h)
const ACC_GAP = 150;       // two access points are 'separate' when >= 150 m apart

const SITES: Site[] = [
  { id: 'H-C1', code: 'C1', key: 'se-dense', cx: 1150, cz: 1150, r: 600, pat: 'cgrid', name: 'se-dense, city 20 floors: grid 110 m, arterial 440 m, collector 220 m' },
  { id: 'H-C2W', code: 'C2W', key: 'west-homes', cx: -1550, cz: 0, r: 620, pat: 'c2grid', name: 'west-homes, city 10 floors: grid 100 m + one diagonal collector' },
  { id: 'H-C2S', code: 'C2S', key: 'sw-homes', cx: -1150, cz: 1150, r: 600, pat: 'c2grid', name: 'sw-homes, city 10 floors: grid 100 m + one diagonal collector' },
  { id: 'H-C3', code: 'C3', key: 'east-homes', cx: 1550, cz: 60, r: 600, pat: 'perim', name: 'east-homes, city 5-10 floors: perimeter blocks 150 x 120 m along collectors' },
  { id: 'H-S1', code: 'S1', key: 'south-suburb', cx: 450, cz: 2250, r: 550, pat: 'sgrid', name: 'south-suburb: suburb grid, blocks 180 x 200 m' },
  { id: 'H-S2', code: 'S2', key: 'east-suburb', cx: 2300, cz: 1550, r: 500, pat: 'loop', name: 'east-suburb: collector spine, loop streets and cul-de-sacs' },
  { id: 'H-S3', code: 'S3', key: 'sw-newtown', cx: -1900, cz: 1750, r: 650, pat: 'curvi', name: 'sw-newtown: curvilinear collectors, locals at ~75 deg' },
  { id: 'H-S4', code: 'S4', key: 'west-suburb', cx: -2450, cz: 500, r: 500, pat: 'court', name: 'west-suburb: cluster / court lanes on collectors' },
  { id: 'H-S5', code: 'S5', key: 'north-homes', cx: 250, cz: -2550, r: 450, pat: 'fish', name: 'north-homes: linear fishbone along one collector, rear lanes' },
  // VILLAGES (decision of the AI, user: 'sob e tomar moto tumi koro'): A1 19.5-1, the village centre moves to the nearest flat / gentle / rolling patch (circle r 300 with >= 14 ha of A-C ground and an R2 / R4 sketch line reaching it). V4 has no such patch within 1000 m: NO streets.
  { id: 'V1', code: 'V1', key: 'village-west', cx: -2900, cz: -1050, r: 300, pat: 'vill', name: 'village-west (moved 570 m to the flat patch at R2-138.1): organic lanes, one curved collector spine, cul-de-sac lanes' },
  // V2 (village-east): tried 5 centres in the flat patch near R2-80 (3150,-700 / 3050,-800 / 3000,-750 / 3100,-850 / 3050,-900): 0-1 street of 100-160 m survive (grade 1100-2000 samples over 8 / 10 %, buildings): NO streets, reported.
  { id: 'V3', code: 'V3', key: 'village-sw', cx: -3150, cz: 950, r: 300, pat: 'vill', name: 'village-sw (moved 532 m to the flat patch near R2-138.3): organic lanes, one curved collector spine, cul-de-sac lanes' },
];

// ---------- data ----------
const A1 = JSON.parse(readFileSync('docs/a1_buildability.json', 'utf8'));
const MAP = JSON.parse(readFileSync('docs/map_all_roads_v2.json', 'utf8'));
const a1 = (x: number, z: number): string => {
  const i = Math.floor((x + A1.half) / A1.cell), j = Math.floor((z + A1.half) / A1.cell);
  if (i < 0 || j < 0 || i >= A1.n || j >= A1.n) return '~';
  return A1.rows[j][i];
};
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const hAt = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const wetGame = (x: number, z: number): boolean => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h; };   // same test as housing-check.ts
const wet = (x: number, z: number): boolean => { gen.sampleNatural(x, z, sc); return !Number.isNaN(sc.water) && sc.water + WET_MARGIN > sc.h; };

const LINES: { id: string; cls: number; pts: P[] }[] = [];
for (const b of MAP.built) { if (String(b.name).includes(':')) continue; LINES.push({ id: b.name, cls: b.lanes, pts: b.pts.map((p: number[]) => ({ x: p[0], z: p[1] })) }); }
for (const r of MAP.roads) LINES.push({ id: r.id, cls: r.cls, pts: r.pts.map((p: number[]) => ({ x: p[0], z: p[1] })) });
const FIXED_J: P[] = MAP.junctions.map((j: any) => ({ x: j.x, z: j.z }));

const RECTS: Rect[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS].map((b) => ({ id: b.id, x: b.x, z: b.z, yaw: b.yaw, W: b.W, D: b.D }));
const BG = new Map<string, Rect[]>();
for (const b of RECTS) { const k = `${Math.floor(b.x / 100)},${Math.floor(b.z / 100)}`; const a = BG.get(k); if (a) a.push(b); else BG.set(k, [b]); }

// ---------- geometry helpers ----------
const hyp = Math.hypot;
const len = (pts: P[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return s; };
function segDist(p: P, a: P, b: P): { d: number; t: number; q: P } {
  const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2));
  const q = { x: a.x + t * ex, z: a.z + t * ez };
  return { d: hyp(p.x - q.x, p.z - q.z), t, q };
}
function segInt(a: P, b: P, c: P, d: P): { t: number; u: number } | null {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}
function resample(pts: P[], step: number): P[] {
  const out: P[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = hyp(b.x - a.x, b.z - a.z);
    let s = step - carry;
    while (s <= L) { out.push({ x: a.x + ((b.x - a.x) * s) / L, z: a.z + ((b.z - a.z) * s) / L }); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  if (hyp(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) > 0.5) out.push(last);
  return out;
}
function polyDist(p: P, pts: P[]): { d: number; i: number; q: P } {
  let best = { d: 1e18, i: 0, q: pts[0] };
  for (let i = 0; i + 1 < pts.length; i++) { const r = segDist(p, pts[i], pts[i + 1]); if (r.d < best.d) best = { d: r.d, i, q: r.q }; }
  return best;
}
function cumLen(pts: P[]): number[] { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
function cutAt(pts: P[], s0: number, s1: number): P[] {
  const c = cumLen(pts), out: P[] = [];
  const at = (s: number): P => { let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = (s - c[i - 1]) / Math.max(1e-9, c[i] - c[i - 1]); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t }; };
  out.push(at(s0));
  for (let i = 1; i < c.length - 1; i++) if (c[i] > s0 + 0.01 && c[i] < s1 - 0.01) out.push(pts[i]);
  out.push(at(s1));
  return out;
}

// ---------- R3: straight - spiral - arc - spiral - straight (pen) ----------
// polyline vertices vs[]; at every inner vertex a clothoid-arc-clothoid fillet of radius radii[i]; returns a dense polyline or null when it does not fit
function fillet(V: P, d1: P, d2: P, R: number, Ls0: number): { ts: number; pts: P[] } | null {
  const cross = d1.x * d2.z - d1.z * d2.x, dot = d1.x * d2.x + d1.z * d2.z;
  const D = Math.atan2(Math.abs(cross), dot);
  if (D < 0.01) return { ts: 0, pts: [] };
  const sg = cross >= 0 ? 1 : -1; // local y points to the turn side
  const n1 = { x: -d1.z, z: d1.x };
  const sig = n1.x * d2.x + n1.z * d2.z >= 0 ? 1 : -1;
  void sg;
  let Ls = Ls0;
  if (Ls / (2 * R) > D / 2) Ls = D * R;
  const th = Ls / (2 * R);
  const sp: P[] = [{ x: 0, z: 0 }];
  const ds = 0.5;
  let x = 0, y = 0;
  for (let s = ds; s <= Ls + 1e-9; s += ds) { const ph = (s - ds / 2) * (s - ds / 2) / (2 * R * Ls); x += Math.cos(ph) * ds; y += Math.sin(ph) * ds; sp.push({ x, z: y }); }
  const xs = sp[sp.length - 1].x, ys = sp[sp.length - 1].z;
  const p = ys - R * (1 - Math.cos(th)), k = xs - R * Math.sin(th);
  const ts = (R + p) * Math.tan(D / 2) + k;
  const arcAng = D - 2 * th;
  const loc: P[] = [...sp];
  const cxl = k, cyl = R + p;
  const na = Math.max(1, Math.ceil((arcAng * R) / 2));
  for (let i = 1; i <= na; i++) { const ph = th + (arcAng * i) / na; loc.push({ x: cxl + R * Math.sin(ph), z: cyl - R * Math.cos(ph) }); }
  let ex = loc[loc.length - 1].x, ey = loc[loc.length - 1].z;
  for (let s = ds; s <= Ls + 1e-9; s += ds) { const sm = s - ds / 2; const ph = D - th + sm / R - (sm * sm) / (2 * R * Ls); ex += Math.cos(ph) * ds; ey += Math.sin(ph) * ds; loc.push({ x: ex, z: ey }); }
  const TS = { x: V.x - d1.x * ts, z: V.z - d1.z * ts };
  const pts = loc.map((q) => ({ x: TS.x + d1.x * q.x + sig * n1.x * q.z, z: TS.z + d1.z * q.x + sig * n1.z * q.z }));
  return { ts, pts };
}
function pen(vs: P[], radii: number[], rmin: number): P[] | null {
  const n = vs.length;
  const dirs: P[] = [];
  for (let i = 0; i + 1 < n; i++) { const L = hyp(vs[i + 1].x - vs[i].x, vs[i + 1].z - vs[i].z); if (L < 1) return null; dirs.push({ x: (vs[i + 1].x - vs[i].x) / L, z: (vs[i + 1].z - vs[i].z) / L }); }
  const fl: ({ ts: number; pts: P[] } | null)[] = [null];
  for (let i = 1; i < n - 1; i++) {
    let R = radii[i - 1], f: { ts: number; pts: P[] } | null = null;
    const room = Math.min(hyp(vs[i].x - vs[i - 1].x, vs[i].z - vs[i - 1].z), hyp(vs[i + 1].x - vs[i].x, vs[i + 1].z - vs[i].z)) * 0.48;
    for (let tries = 0; tries < 12; tries++) {
      f = fillet(vs[i], dirs[i - 1], dirs[i], R, Math.max(20, R / 3));
      if (f && f.ts <= room) break;
      R *= 0.85; f = null;
      if (R < rmin) return null;
    }
    if (!f) return null;
    fl.push(f);
  }
  const out: P[] = [vs[0]];
  for (let i = 1; i < n - 1; i++) { const f = fl[i]!; for (const q of f.pts) out.push(q); }
  out.push(vs[n - 1]);
  return out;
}

// ---------- sketch lines near a site ----------
function nearSegs(s: Site): Seg[] {
  const out: Seg[] = [];
  for (const l of LINES) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const a = l.pts[i], b = l.pts[i + 1];
      if (segDist({ x: s.cx, z: s.cz }, a, b).d <= s.r + 90) out.push({ a, b, cls: l.cls, id: l.id });
    }
  }
  return out;
}

// ---------- sample tests ----------
const blockedBy = new Map<string, number>(); // building id -> number of samples it blocked (final builds only)
let COUNT = false;
const stat = { wet: 0, mask: 0, grade: 0, bld: 0, hard: 0, par: 0, hill: 0, circle: 0 };
function bldClear(p: P, cls: K, margin = BMARGIN): string | null {
  const rad = 60, c0 = Math.floor((p.x - rad) / 100), c1 = Math.floor((p.x + rad) / 100), d0 = Math.floor((p.z - rad) / 100), d1 = Math.floor((p.z + rad) / 100);
  for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) {
    const g = BG.get(`${a},${b}`); if (!g) continue;
    for (const r of g) {
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw), dx = p.x - r.x, dz = p.z - r.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ex = Math.max(Math.abs(lx) - r.W / 2, 0), ez = Math.max(Math.abs(lz) - r.D / 2, 0);
      if (hyp(ex, ez) < HW[cls] + margin) return r.id;
    }
  }
  return null;
}
/** ground tests (water first: R8) */
function groundOk(p: P, cls: K, s: Site, rExtra: number): boolean {
  if (hyp(p.x - s.cx, p.z - s.cz) > s.r - 8 + rExtra) { if (COUNT) stat.circle++; return false; }
  if (wet(p.x, p.z)) { if (COUNT) stat.wet++; return false; }
  const c = a1(p.x, p.z);
  if (c !== 'A' && c !== 'B' && c !== 'C' && c !== 'D') { if (COUNT) stat.mask++; return false; }
  const b = bldClear(p, cls);
  if (b) { if (COUNT) { stat.bld++; blockedBy.set(b, (blockedBy.get(b) ?? 0) + 1); } return false; }
  return true;
}
/** sketch line tests: hard clearance, local from R4, no running along a line */
function sketchOk(p: P, t: P, cls: K, segs: Seg[]): boolean {
  for (const g of segs) {
    const r = segDist(p, g.a, g.b);
    if (r.d > CLEAR_HARD) continue;
    if (g.cls >= 6) { if (r.d < CLEAR_HARD) { if (COUNT) stat.hard++; return false; } continue; }
    if (g.cls === 4 && cls === 'L' && r.d < CLEAR_R4_LOCAL) { if (COUNT) stat.hard++; return false; }
    if (r.d < PAR_DIST) {
      const L = hyp(g.b.x - g.a.x, g.b.z - g.a.z) || 1;
      const cosA = Math.abs((t.x * (g.b.x - g.a.x) + t.z * (g.b.z - g.a.z)) / L);
      if (Math.acos(Math.min(1, cosA)) < PAR_ANG) { if (COUNT) stat.par++; return false; }
    }
  }
  return true;
}

/** a candidate line -> runs of samples that pass every test (water, ground class, grade, building, sketch clearance) */
function clip(c: Cand, s: Site, segs: Seg[], rEx = 0): P[][] {
  const pts = resample(c.pts, STEP);
  const n = pts.length;
  if (n < 3) return [];
  const h = pts.map((p) => hAt(p.x, p.z));
  const ok: boolean[] = new Array(n).fill(true);
  const W = Math.round(20 / STEP);
  for (let i = 0; i + W < n; i++) if (Math.abs(h[i + W] - h[i]) / (W * STEP) > GRADE[c.cls]) { for (let k = i; k <= i + W; k++) ok[k] = false; if (COUNT) stat.grade++; }
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    if (EXCL.some((e) => hyp(pts[i].x - e.cx, pts[i].z - e.cz) < e.r)) { ok[i] = false; if (COUNT) stat.circle++; continue; }
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const L = hyp(b.x - a.x, b.z - a.z) || 1, t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    if (!groundOk(pts[i], c.cls, s, rEx) || !sketchOk(pts[i], t, c.cls, segs)) { ok[i] = false; continue; }
    if (a1(pts[i].x, pts[i].z) === 'D' && COUNT) stat.hill++;
  }
  const runs: P[][] = [];
  let cur: P[] = [];
  for (let i = 0; i < n; i++) { if (ok[i]) cur.push(pts[i]); else { if (cur.length >= 2) runs.push(cur); cur = []; } }
  if (cur.length >= 2) runs.push(cur);
  // extend a run end straight ahead onto a joinable sketch line (<= 45 m) when the ground is free: that end becomes a node
  for (const r of runs) for (const atEnd of [true, false]) {
    const e = atEnd ? r[r.length - 1] : r[0], f = atEnd ? r[r.length - 2] : r[1];
    const dl = hyp(e.x - f.x, e.z - f.z) || 1, d = { x: (e.x - f.x) / dl, z: (e.z - f.z) / dl };
    if (segs.some((g) => g.cls <= 4 && segDist(e, g.a, g.b).d < 1.5)) continue;
    const add: P[] = [];
    let hit: P | null = null;
    for (let k = 1; k <= 9 && !hit; k++) {
      const q = { x: e.x + d.x * STEP * k, z: e.z + d.z * STEP * k }, q0 = add.length ? add[add.length - 1] : e;
      for (const g of segs) {
        if (g.cls > 4 || (g.cls === 4 && c.cls === 'L')) continue;
        const it = segInt(q0, q, g.a, g.b);
        if (it) { hit = { x: q0.x + (q.x - q0.x) * it.t, z: q0.z + (q.z - q0.z) * it.t }; break; }
      }
      if (hit) break;
      if (!groundOk(q, c.cls, s, 9)) break;
      let bad = false;
      for (const g of segs) if (g.cls >= 6 && segDist(q, g.a, g.b).d < CLEAR_HARD) bad = true;
      if (bad) break;
      add.push(q);
    }
    if (hit && hyp(hit.x - s.cx, hit.z - s.cz) <= s.r) { add.push(hit); if (atEnd) r.push(...add); else r.unshift(...add.reverse()); }
  }
  return runs;
}

// ---------- pattern generators (local frame: u along th, v across) ----------
function frame(s: Site, th: number) {
  const U = { x: Math.cos(th), z: Math.sin(th) }, V = { x: -Math.sin(th), z: Math.cos(th) };
  const w = (u: number, v: number): P => ({ x: s.cx + u * U.x + v * V.x, z: s.cz + u * U.z + v * V.z });
  return { U, V, w };
}
function gridLines(s: Site, th: number, shift: number, bu: number, bv: number, clsOf: (k: number, dir: 'u' | 'v') => K): Cand[] {
  const f = frame(s, th), R = s.r + 30, out: Cand[] = [];
  const kv = Math.ceil(R / bv) + 1, ku = Math.ceil(R / bu) + 1;
  for (let k = -kv; k <= kv; k++) out.push({ cls: clsOf(k, 'u'), pts: [f.w(-R, shift + k * bv), f.w(R, shift + k * bv)] });   // lines along u
  for (let k = -ku; k <= ku; k++) out.push({ cls: clsOf(k, 'v'), pts: [f.w(shift + k * bu, -R), f.w(shift + k * bu, R)] });   // lines along v
  return out;
}
const md = (k: number, m: number): number => ((k % m) + m) % m;
function candidates(s: Site, th: number, shift: number): Cand[] {
  const f = frame(s, th), R = s.r + 30;
  const out: Cand[] = [];
  const add = (cls: K, vs: P[], radii: number[] = []): void => { const pts = vs.length > 2 ? pen(vs, radii, RMIN[cls]) : vs; if (pts) out.push({ cls, pts }); };
  switch (s.pat) {
    case 'cgrid': return [...(ARTERIAL ? [{ cls: 'A' as K, pts: ARTERIAL }] : []), ...gridLines(s, th, shift, 110, 110, (k) => (md(k, 4) === 0 ? 'A' : md(k, 2) === 0 ? 'C' : 'L'))];
    case 'c2grid': {
      const g = gridLines(s, th, shift, 100, 100, (k) => (md(k, 3) === 0 ? 'C' : 'L'));
      const d = frame(s, th + Math.PI / 4);
      g.push({ cls: 'C', pts: [d.w(-R, shift), d.w(R, shift)] });
      return g;
    }
    case 'perim': {
      const g: Cand[] = [];
      for (let k = -4; k <= 4; k++) {
        g.push({ cls: 'C', pts: [f.w(-R, shift + k * 240), f.w(R, shift + k * 240)] });
        g.push({ cls: 'L', pts: [f.w(-R, shift + k * 240 + 120), f.w(R, shift + k * 240 + 120)] });
      }
      for (let k = -6; k <= 6; k++) g.push({ cls: 'L', pts: [f.w(shift + k * 150, -R), f.w(shift + k * 150, R)] });
      return g;
    }
    case 'sgrid': return gridLines(s, th, shift, 180, 200, (k) => (md(k, 2) === 0 ? 'C' : 'L'));
    case 'loop': {
      const v0 = shift;
      add('C', [f.w(-R, v0), f.w(R, v0)]);
      for (let k = -4; k <= 4; k++) {
        const u0 = k * 190, side = md(k, 2) === 0 ? 1 : -1, w = 240, d = 190 * side;
        add('L', [f.w(u0, v0), f.w(u0, v0 + d), f.w(u0 + w, v0 + d), f.w(u0 + w, v0)], [45, 45]);
        add('L', [f.w(u0 + w / 2, v0 + d), f.w(u0 + w / 2, v0 + d + 150 * side)]);
      }
      return out;
    }
    case 'curvi': {
      const colls: P[][] = [];
      for (const m of [-1, 0, 1]) {
        const v0 = shift + m * 300;
        const pts = pen([f.w(-R, v0), f.w(-R * 0.4, v0 + 110), f.w(R * 0.4, v0 - 110), f.w(R, v0)], [220, 220], RMIN.C);
        if (pts) { out.push({ cls: 'C', pts }); colls.push(resample(pts, 5)); }
      }
      const atU = (poly: P[], u: number): P => { let best = poly[0], bd = 1e18; for (const q of poly) { const uu = (q.x - s.cx) * f.U.x + (q.z - s.cz) * f.U.z; if (Math.abs(uu - u) < bd) { bd = Math.abs(uu - u); best = q; } } return best; };
      for (let m = 0; m + 1 < colls.length; m++) for (let ua = -R; ua <= R; ua += 135) {
        const A = atU(colls[m], ua), B = atU(colls[m + 1], ua + 80);
        const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, L = hyp(B.x - A.x, B.z - A.z) || 1;
        const nrm = { x: -(B.z - A.z) / L, z: (B.x - A.x) / L }, sgn = md(Math.round(ua / 135), 2) === 0 ? 1 : -1;
        add('L', [A, { x: mid.x + nrm.x * 30 * sgn, z: mid.z + nrm.z * 30 * sgn }, B], [120]);
      }
      return out;
    }
    case 'court': {
      for (const sv of [-160, 160]) out.push({ cls: 'C', pts: [f.w(-R, shift + sv), f.w(R, shift + sv)] });
      out.push({ cls: 'C', pts: [f.w(shift, -R), f.w(shift, R)] });
      for (let j = -5; j <= 5; j++) {
        const u = shift + j * 140 + 70;
        out.push({ cls: 'L', pts: [f.w(u, shift + 160), f.w(u, shift + 160 + 120)] });
        out.push({ cls: 'L', pts: [f.w(u, shift - 160), f.w(u, shift - 160 - 120)] });
        out.push({ cls: 'L', pts: [f.w(u + 70, shift + 160), f.w(u + 70, shift + 160 - 100)] });
        out.push({ cls: 'L', pts: [f.w(u + 70, shift - 160), f.w(u + 70, shift - 160 + 100)] });
      }
      return out;
    }
    case 'vill': {
      const spineLine = pen([f.w(-R, shift), f.w(-R * 0.4, shift + 50), f.w(R * 0.4, shift - 50), f.w(R, shift)], [200, 200], RMIN.C);
      if (!spineLine) return out;
      out.push({ cls: 'C', pts: spineLine });
      const sp = resample(spineLine, 5);
      for (let k = -3; k <= 3; k++) {
        const u = k * 85, A = sp.reduce((b, q) => (Math.abs((q.x - s.cx) * f.U.x + (q.z - s.cz) * f.U.z - u) < Math.abs((b.x - s.cx) * f.U.x + (b.z - s.cz) * f.U.z - u) ? q : b), sp[0]);
        const side = md(k, 2) === 0 ? 1 : -1;
        out.push({ cls: 'L', pts: [A, { x: A.x + f.V.x * side * 130 + f.U.x * 12, z: A.z + f.V.z * side * 130 + f.U.z * 12 }] });
      }
      return out;
    }
    case 'fish': {
      out.push({ cls: 'C', pts: [f.w(-R, shift), f.w(R, shift)] });
      for (const sv of [-150, 150]) out.push({ cls: 'L', pts: [f.w(-R, shift + sv), f.w(R, shift + sv)] });
      for (let k = -7; k <= 7; k++) out.push({ cls: 'L', pts: [f.w(k * 130, shift - 150), f.w(k * 130, shift + 150)] });
      return out;
    }
  }
  return out;
}


// ---------- FINAL VALIDATION (same chain and same tests as scripts/housing-check.ts: 0.1 m rounding, 5 m resample, game water, A1 class, circle r + 2, buildings, 20 m grade) ----------
const rnd1 = (v: number): number => Math.round(v * 10) / 10;
function asChecked(pts: P[]): P[] { return resample(resample(pts, 5).map((q) => ({ x: rnd1(q.x), z: rnd1(q.z) })), 5); }
function badSamples(d5: P[], cls: K, s: Site): boolean[] {
  const bad: boolean[] = new Array(d5.length).fill(false);
  const h = d5.map((p) => hAt(p.x, p.z));
  for (let i = 0; i + 4 < d5.length; i++) if (Math.abs(h[i + 4] - h[i]) / 20 > GRADE[cls] * 0.995) for (let k = i; k <= i + 4; k++) bad[k] = true;
  for (let i = 0; i < d5.length; i++) {
    const p = d5[i];
    if (hyp(p.x - s.cx, p.z - s.cz) > s.r + 1) bad[i] = true;
    else if (wetGame(p.x, p.z) || wet(p.x, p.z)) bad[i] = true;
    else if (!'ABCD'.includes(a1(p.x, p.z))) bad[i] = true;
    else if (bldClear(p, cls, 0.5)) bad[i] = true;
  }
  return bad;
}
/** a piece in the form the checker sees it; split at every bad sample; returns the good runs (>= 2 points) */
function validRuns(pts: P[], cls: K, s: Site): P[][] {
  const d5 = asChecked(pts), bad = badSamples(d5, cls, s), out: P[][] = [];
  let cur: P[] = [];
  for (let i = 0; i < d5.length; i++) { if (!bad[i]) cur.push(d5[i]); else { if (cur.length >= 2) out.push(cur); cur = []; } }
  if (cur.length >= 2) out.push(cur);
  return out;
}

// ---------- splitting at crossings, nodes, pruning ----------
interface Node { x: number; z: number; pcs: number[]; sk: Set<string> }
interface WPiece extends Piece { alive: boolean; v?: boolean }
function nearestOnLine(p: P, segs: Seg[], clsMax: number, notL: boolean): { d: number; q: P; id: string; cls: number } | null {
  let best: { d: number; q: P; id: string; cls: number } | null = null;
  for (const g of segs) {
    if (g.cls > clsMax || (g.cls === 4 && notL)) continue;
    const r = segDist(p, g.a, g.b);
    if (!best || r.d < best.d) best = { d: r.d, q: r.q, id: g.id, cls: g.cls };
  }
  return best;
}
/** split runs at every crossing / touch of another run or of a sketch R2 / R4 line; returns pieces whose ends are nodes */
function splitRuns(runs: { cls: K; pts: P[] }[], segs: Seg[]): { cls: K; pts: P[] }[] {
  const cuts: number[][] = runs.map(() => []);
  const cl = runs.map((r) => cumLen(r.pts));
  // snap ends that touch a sketch line / another run
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    for (const atEnd of [true, false]) {
      const e = atEnd ? r.pts[r.pts.length - 1] : r.pts[0];
      const sk = nearestOnLine(e, segs, 4, r.cls === 'L');
      if (sk && sk.d < 2.5) { if (atEnd) r.pts[r.pts.length - 1] = sk.q; else r.pts[0] = sk.q; continue; }
      for (let j = 0; j < runs.length; j++) {
        if (j === i) continue;
        const pd = polyDist(e, runs[j].pts);
        if (pd.d < 2.5) {
          const cj = cumLen(runs[j].pts), sj = cj[pd.i] + hyp(pd.q.x - runs[j].pts[pd.i].x, pd.q.z - runs[j].pts[pd.i].z);
          if (sj > 2 && sj < cj[cj.length - 1] - 2) { cuts[j].push(sj); if (atEnd) r.pts[r.pts.length - 1] = pd.q; else r.pts[0] = pd.q; }
          break;
        }
      }
    }
  }
  for (let i = 0; i < runs.length; i++) {
    const a = runs[i].pts;
    // run vs sketch line
    for (const g of segs) {
      if (g.cls > 4 || (g.cls === 4 && runs[i].cls === 'L')) continue;
      for (let k = 0; k + 1 < a.length; k++) { const it = segInt(a[k], a[k + 1], g.a, g.b); if (it) cuts[i].push(cl[i][k] + it.t * hyp(a[k + 1].x - a[k].x, a[k + 1].z - a[k].z)); }
    }
    // run vs run
    for (let j = i + 1; j < runs.length; j++) {
      const b = runs[j].pts;
      for (let k = 0; k + 1 < a.length; k++) for (let m = 0; m + 1 < b.length; m++) {
        const it = segInt(a[k], a[k + 1], b[m], b[m + 1]);
        if (it) { cuts[i].push(cl[i][k] + it.t * hyp(a[k + 1].x - a[k].x, a[k + 1].z - a[k].z)); cuts[j].push(cl[j][m] + it.u * hyp(b[m + 1].x - b[m].x, b[m + 1].z - b[m].z)); }
      }
    }
  }
  const out: { cls: K; pts: P[] }[] = [];
  runs.forEach((r, i) => {
    const total = len(r.pts);
    const cs = [0, ...cuts[i].filter((c) => c > 0.5 && c < total - 0.5).sort((x, y) => x - y), total];
    const dd: number[] = [cs[0]];
    for (const c of cs.slice(1)) { if (c - dd[dd.length - 1] > 1) dd.push(c); else if (c === total) dd[dd.length - 1] = total; }
    if (dd[dd.length - 1] !== total) dd.push(total);
    for (let k = 0; k + 1 < dd.length; k++) if (dd[k + 1] - dd[k] > 1) out.push({ cls: r.cls, pts: cutAt(r.pts, dd[k], dd[k + 1]) });
  });
  return out;
}

function buildNodes(ps: WPiece[], segs: Seg[]): Node[] {
  const nodes: Node[] = [];
  const get = (p: P): Node => {
    for (const n of nodes) if (hyp(n.x - p.x, n.z - p.z) < 3) return n;
    const n: Node = { x: p.x, z: p.z, pcs: [], sk: new Set() };
    const sk = nearestOnLine(p, segs, 4, false);
    if (sk && sk.d < 3) n.sk.add(sk.id);
    nodes.push(n); return n;
  };
  ps.forEach((p, i) => { if (!p.alive) return; get(p.pts[0]).pcs.push(i); get(p.pts[p.pts.length - 1]).pcs.push(i); });
  return nodes;
}
function awayDir(p: P[], n: Node): P {
  const atStart = hyp(p[0].x - n.x, p[0].z - n.z) < 3;
  const q = atStart ? p : p.slice().reverse();
  let j = 1; while (j < q.length - 1 && hyp(q[j].x - q[0].x, q[j].z - q[0].z) < 8) j++;
  const L = hyp(q[j].x - q[0].x, q[j].z - q[0].z) || 1;
  return { x: (q[j].x - q[0].x) / L, z: (q[j].z - q[0].z) / L };
}
/** a junction placeholder: 3+ ways, or two pieces that meet in a corner (a kink > 5 deg is not a smooth curve, R3) */
function isJ(n: Node, ps: WPiece[]): boolean {
  if (n.pcs.length + (n.sk.size ? 2 : 0) >= 3) return true;
  if (n.pcs.length === 2 && !n.sk.size) { const a = awayDir(ps[n.pcs[0]].pts, n), b = awayDir(ps[n.pcs[1]].pts, n); return a.x * b.x + a.z * b.z > -0.996; }
  return false;
}
const ORD: Record<K, number> = { L: 0, C: 1, A: 2 };

interface Built { pieces: Piece[]; nodes: { x: number; z: number; cls: string }[]; th: number; shift: number; access: number; dropped: string[]; ends?: P[]; accPts?: P[] }
function build(s: Site, th: number, shift: number, segs: Seg[], withLinks: boolean, count: boolean): Built {
  COUNT = count;
  const base: { cls: K; pts: P[] }[] = [];
  for (const c of candidates(s, th, shift)) for (const r of clip(c, s, segs)) if (len(r) >= 30) base.push({ cls: c.cls, pts: r });
  const links: { cls: K; pts: P[] }[] = [];
  let res = pipeline(s, th, shift, segs, base, links);
  // access links: a component that does not touch the sketch network, or fewer than 2 separate access points, gets a straight collector (<= 300 m) to the nearest R2 / R4 line over free ground (R2: it has a stated need = fire access)
  for (let it = 0; it < (withLinks ? 8 : 0); it++) {
    if (res.loose.length === 0) break;
    // hang a loose component on the network (the 2nd separate access is added after the pipeline, addAccess)
    const link = findLink(res.loose, res.accPts, s, segs, false);
    if (!link) break;
    links.push(link);
    res = pipeline(s, th, shift, segs, base, links);
  }
  if (withLinks) addAccess(res.built, s, segs);
  return res.built;
}
function findLink(from: P[], avoid: P[], s: Site, segs: Seg[], needSep: boolean, rEx = 9, maxD = 300, accept?: (l: { cls: K; pts: P[] }) => boolean): { cls: K; pts: P[] } | null {
  const cands: { d: number; a: P; b: P }[] = [];
  for (const e of from) for (const g of segs) {
    if ((g.cls !== 2 && g.cls !== 4) || g.hc) continue;
    const r = segDist(e, g.a, g.b);
    if (r.d < 8 || r.d > maxD) continue;
    if (needSep && avoid.some((q) => hyp(q.x - r.q.x, q.z - r.q.z) < ACC_GAP)) continue;
    cands.push({ d: r.d, a: e, b: r.q });
  }
  cands.sort((x, y) => x.d - y.d);
  for (const c of cands.slice(0, 80)) {
    const runs = clip({ cls: 'C', pts: [c.a, c.b] }, s, segs, rEx);   // stays inside the housing circle (check: r + 2 m)
    if (runs.length !== 1 || len(runs[0]) < c.d * 0.97) continue;
    const vr = rEx <= 9 ? validRuns(runs[0], 'C', s) : [runs[0]];   // the link must pass the final check too (5 m phase, rounding)
    if (vr.length === 1 && len(vr[0]) >= c.d * 0.97) { const l = { cls: 'C' as K, pts: vr[0] }; if (!accept || accept(l)) return l; }
  }
  return null;
}

/** 2nd separate access (fire access): after the pipeline, one straight collector (<= 300 m, inside the circle) from a free street node to an R2 / R4 sketch line.
 *  Added only when it passes the final check, crosses nothing except at its two ends and keeps the 60 m node gap; otherwise the housing keeps fewer than 2 (reported, ASK). */
function addAccess(b: Built, s: Site, segs: Seg[]): void {
  for (let k = 0; k < 2 && b.access < 2; k++) {
    const accept = (l: { cls: K; pts: P[] }): boolean => {
      const A = l.pts[0], B = l.pts[l.pts.length - 1];
      if (len(l.pts) < MIN_LEN) return false;
      const atEnd = (q: P): boolean => hyp(q.x - A.x, q.z - A.z) < 3 || hyp(q.x - B.x, q.z - B.z) < 3;
      for (let j = 0; j + 1 < l.pts.length; j++) {
        for (const p of b.pieces) for (let i = 0; i + 1 < p.pts.length; i++) { const it = segInt(l.pts[j], l.pts[j + 1], p.pts[i], p.pts[i + 1]); if (it) { const q = { x: l.pts[j].x + (l.pts[j + 1].x - l.pts[j].x) * it.t, z: l.pts[j].z + (l.pts[j + 1].z - l.pts[j].z) * it.t }; if (!atEnd(q)) return false; } }
        for (const g of segs) { const it = segInt(l.pts[j], l.pts[j + 1], g.a, g.b); if (it) { const q = { x: l.pts[j].x + (l.pts[j + 1].x - l.pts[j].x) * it.t, z: l.pts[j].z + (l.pts[j + 1].z - l.pts[j].z) * it.t }; if (g.cls >= 6 || !atEnd(q)) return false; } }
      }
      const sm = resample(l.pts, 5);
      if (sm.filter((q, i) => i > 2 && i < sm.length - 3 && b.pieces.some((p) => polyDist(q, p.pts).d < 6)).length > 0) return false;   // would run along an existing street
      for (const E of [A, B]) {
        for (const n of b.nodes) { const d = hyp(n.x - E.x, n.z - E.z); if (d > 3 && d < NODE_GAP) return false; }
        for (const q of FIXED_J) { const d = hyp(q.x - E.x, q.z - E.z); if (d > 3 && d < NODE_GAP) return false; }
      }
      return true;
    };
    const l = findLink(b.ends ?? [], b.accPts ?? [], s, segs, true, 9, 300, accept);
    if (!l) return;
    const A = l.pts[0], B = l.pts[l.pts.length - 1];
    const nid = b.pieces.filter((p) => p.cls === 'C').length + 1;
    const sk = nearestOnLine(B, segs, 4, false);
    b.pieces.push({ id: `${s.id}-C${nid}`, cls: 'C', pts: l.pts, site: s.id, need: 'collector 2-lane: 2nd separate access (fire access, 2 are needed), joins the sketch ' + (sk ? sk.id : 'R2 / R4 line') });
    const has = (q: P): boolean => b.nodes.some((n) => hyp(n.x - q.x, n.z - q.z) < 3);
    if (!has(A)) { const cl = new Set<string>(['C']); for (const p of b.pieces) if (hyp(p.pts[0].x - A.x, p.pts[0].z - A.z) < 3 || hyp(p.pts[p.pts.length - 1].x - A.x, p.pts[p.pts.length - 1].z - A.z) < 3) cl.add(p.cls); b.nodes.push({ x: A.x, z: A.z, cls: [...cl].sort().join('+') }); }
    if (!has(B)) b.nodes.push({ x: B.x, z: B.z, cls: 'C+' + (sk && LINES.find((q) => q.id === sk.id)?.cls === 4 ? 'R4' : 'R2') });
    b.access++; (b.accPts ??= []).push(B);
  }
}

interface PipeRes { built: Built; loose: P[]; ends: P[]; access: number; accPts: P[] }
function pipeline(s: Site, th: number, shift: number, segs: Seg[], base: { cls: K; pts: P[] }[], links: { cls: K; pts: P[] }[]): PipeRes {
  const runs = [...base, ...links].map((r) => ({ cls: r.cls, pts: r.pts.map((q) => ({ ...q })) }));
  // two candidate lines that lie on top of each other (same path, e.g. a lane on a collector) = one street: keep the higher class
  runs.sort((x, y) => ORD[y.cls] - ORD[x.cls] || len(y.pts) - len(x.pts));
  for (let i = runs.length - 1; i >= 0; i--) {
    const sm = resample(runs[i].pts, 5);
    for (let j = 0; j < i; j++) { if (sm.filter((q) => polyDist(q, runs[j].pts).d < 3).length >= 0.6 * sm.length) { runs.splice(i, 1); break; } }
  }
  let sp = splitRuns(runs, segs);
  for (let k = 0; k < 3; k++) sp = splitRuns(sp, segs);   // snapped ends move by up to 2.5 m: split again until no crossing is left without a node (R1)
  const ps: WPiece[] = sp.map((r, i) => ({ id: 'p' + i, cls: r.cls, pts: r.pts, site: s.id, need: '', alive: true, v: false }));
  const dropped: string[] = [];
  const loose: P[] = [];
  for (let guard = 0; guard < 4000; guard++) {
    let changed = false;
    // final validation of every changed piece (checker view); a bad sample splits the piece
    for (let i = 0; i < ps.length; i++) {
      if (!ps[i].alive || ps[i].v) continue;
      const rr = validRuns(ps[i].pts, ps[i].cls, s);
      ps[i].alive = false; changed = true;
      for (const r of rr) ps.push({ id: 'p' + ps.length, cls: ps[i].cls, pts: r, site: s.id, need: '', alive: true, v: true });
    }
    if (changed) continue;
    // short pieces between nodes (also the 60 m node gap)
    for (let i = 0; i < ps.length; i++) if (ps[i].alive && len(ps[i].pts) < MIN_LEN) { ps[i].alive = false; changed = true; }
    if (changed) continue;
    const nodes = buildNodes(ps, segs);
    // node gap between junctions, and from the fixed J-xx of the sketch
    let victim = -1;
    const js = nodes.filter((n) => isJ(n, ps));
    for (let a = 0; a < js.length && victim < 0; a++) {
      let bad = FIXED_J.some((q) => { const d = hyp(q.x - js[a].x, q.z - js[a].z); return d < NODE_GAP && d > 3; });
      for (let b = a + 1; b < js.length && !bad; b++) if (hyp(js[a].x - js[b].x, js[a].z - js[b].z) < NODE_GAP) bad = true;
      if (bad) {
        const inc = js[a].pcs.slice().sort((p, q) => ORD[ps[p].cls] - ORD[ps[q].cls] || len(ps[p].pts) - len(ps[q].pts));
        victim = inc[0];
      }
    }
    if (victim >= 0) { ps[victim].alive = false; continue; }
    // dead ends: a collector / arterial must not end free when short; a local cul-de-sac is at most 200 m
    for (const n of nodes) {
      if (n.pcs.length === 1 && !n.sk.size) {
        const p = ps[n.pcs[0]], L = len(p.pts);
        if (p.cls !== 'L' && L < 150) { p.alive = false; changed = true; break; }
        if (p.cls === 'L' && L > CUL_MAX) {
          const atEnd = hyp(p.pts[p.pts.length - 1].x - n.x, p.pts[p.pts.length - 1].z - n.z) < 3;
          const other = atEnd ? p.pts[0] : p.pts[p.pts.length - 1];
          const on = nodes.find((m) => hyp(m.x - other.x, m.z - other.z) < 3);
          if (on && (on.pcs.length > 1 || on.sk.size)) { p.pts = atEnd ? cutAt(p.pts, 0, CUL_MAX) : cutAt(p.pts, L - CUL_MAX, L); p.v = false; changed = true; break; }
        }
      }
    }
    if (changed) continue;
    // attachment: keep only components that touch an R2 / R4 sketch line (R2: no random road)
    const comp = new Array(ps.length).fill(-1);
    let nc = 0;
    const att: boolean[] = [];
    for (let i = 0; i < ps.length; i++) {
      if (!ps[i].alive || comp[i] >= 0) continue;
      const q = [i]; comp[i] = nc; let at = false;
      while (q.length) {
        const u = q.pop()!;
        for (const n of nodes) if (n.pcs.includes(u)) { if (n.sk.size) at = true; for (const v of n.pcs) if (comp[v] < 0) { comp[v] = nc; q.push(v); } }
      }
      att[nc] = at; nc++;
    }
    for (let i = 0; i < ps.length; i++) if (ps[i].alive && !att[comp[i]]) { loose.push(ps[i].pts[0], ps[i].pts[ps[i].pts.length - 1]); }
    break;
  }
  // pieces still not touching the sketch network (no link possible) are dropped: R2, no random road
  {
    const nodesL = buildNodes(ps, segs);
    const compOf = new Array(ps.length).fill(-1);
    let nc = 0;
    const attC: boolean[] = [];
    for (let i = 0; i < ps.length; i++) {
      if (!ps[i].alive || compOf[i] >= 0) continue;
      const q = [i]; compOf[i] = nc; let at = false;
      while (q.length) { const u = q.pop()!; for (const n of nodesL) if (n.pcs.includes(u)) { if (n.sk.size) at = true; for (const v of n.pcs) if (compOf[v] < 0) { compOf[v] = nc; q.push(v); } } }
      attC[nc] = at; nc++;
    }
    for (let i = 0; i < ps.length; i++) if (ps[i].alive && !attC[compOf[i]]) { dropped.push(`${len(ps[i].pts).toFixed(0)} m ${ps[i].cls}`); ps[i].alive = false; }
  }
  // merge two pieces of the same class that meet at a plain degree-2 node (no junction), so the names stay clean
  let merged = true;
  const noMerge = new Set<string>();
  while (merged) {
    merged = false;
    const nodes = buildNodes(ps, segs);
    for (const n of nodes) {
      if (n.pcs.length !== 2 || n.sk.size || n.pcs[0] === n.pcs[1] || noMerge.has(`${Math.round(n.x)},${Math.round(n.z)}`)) continue;
      const [a, b] = [ps[n.pcs[0]], ps[n.pcs[1]]];
      if (a.cls !== b.cls || isJ(n, ps)) continue;
      const near = (p: P): boolean => hyp(p.x - n.x, p.z - n.z) < 3;
      const A = near(a.pts[a.pts.length - 1]) ? a.pts : a.pts.slice().reverse();
      const B = near(b.pts[0]) ? b.pts : b.pts.slice().reverse();
      const mp = [...A, ...B.slice(1)];
      const vr = validRuns(mp, a.cls, s);
      if (vr.length !== 1 || Math.abs(len(vr[0]) - len(mp)) > 6) { noMerge.add(`${Math.round(n.x)},${Math.round(n.z)}`); merged = true; break; }   // merged piece would fail the check (different 5 m phase): keep two pieces
      a.pts = mp; b.alive = false; merged = true; break;
    }
  }
  const alive = ps.filter((p) => p.alive);
  const seq = { A: 0, C: 0, L: 0 };
  const pieces: Piece[] = alive.map((p) => {
    seq[p.cls]++;
    const L = len(p.pts);
    const need = p.cls === 'A' ? 'arterial 4-lane: bus route, collects the collectors, spacing ~440 m (19.1), joins the sketch R4 / R2 lines'
      : p.cls === 'C' ? 'collector 2-lane: bus feeder, fire access, collects the local streets to the sketch R2 / R4 lines'
        : L <= CUL_MAX ? 'local street / lane 2-lane (cul-de-sac <= 200 m if it ends free): plot access' : 'local street 2-lane: plot access';
    return { id: `${s.id}-${p.cls}${seq[p.cls]}`, cls: p.cls, pts: p.pts, site: s.id, need };
  });
  const nodes = buildNodes(alive.map((p) => ({ ...p })), segs);
  const jn = nodes.filter((n) => isJ(n, alive)).map((n) => ({ x: n.x, z: n.z, cls: [...new Set(n.pcs.map((i) => alive[i].cls)), ...[...n.sk].map((id) => id.startsWith('H-') ? 'h' + id.split('-').pop()![0] : LINES.find((l) => l.id === id)?.cls === 4 ? 'R4' : 'R2')].sort().join('+') }));
  // access points: A / C pieces ending on a sketch line, at least ACC_GAP apart
  const acc: P[] = [];
  for (const n of nodes) if (realSk(n.sk) && n.pcs.some((i) => alive[i].cls !== 'L')) if (!acc.some((q) => hyp(q.x - n.x, q.z - n.z) < ACC_GAP)) acc.push({ x: n.x, z: n.z });
  const ends: P[] = [];
  for (const n of nodes) if (!realSk(n.sk)) ends.push({ x: n.x, z: n.z });
  return { built: { pieces, nodes: jn, th, shift, access: acc.length, dropped, ends, accPts: acc }, loose, ends, access: acc.length, accPts: acc };
}

function dominant(s: Site, segs: Seg[], mod: number): number {
  let cx = 0, cz = 0;
  for (const g of segs) {
    if (g.cls > 4) continue;
    const mid = { x: (g.a.x + g.b.x) / 2, z: (g.a.z + g.b.z) / 2 };
    if (hyp(mid.x - s.cx, mid.z - s.cz) > s.r) continue;
    const L = hyp(g.b.x - g.a.x, g.b.z - g.a.z), an = Math.atan2(g.b.z - g.a.z, g.b.x - g.a.x);
    cx += L * Math.cos(an * mod); cz += L * Math.sin(an * mod);
  }
  return cx === 0 && cz === 0 ? 0 : Math.atan2(cz, cx) / mod;
}
function score(b: Built): number {
  let t = 0;
  for (const p of b.pieces) t += len(p.pts) * (p.cls === 'A' ? 1.3 : p.cls === 'C' ? 1.15 : 1);
  return t + 400 * Math.min(b.access, 2) + 10 * b.nodes.length;
}


// ---------- ARTERIAL SEARCH (H-C1): a grade-limited path (<= 5.8 % on every 20 m, user: look for a low-grade / contour-following arterial), then straight - spiral - arc - spiral - straight ----------
let ARTERIAL: P[] | null = null;
const ART_STEP = 60, ART_NH = 24, ART_MINLEN = 280, ART_MINSEP = 220, ART_G = 0.058;
const hCache = new Map<string, number>();
const hC = (x: number, z: number): number => { const k = `${Math.round(x / 5)},${Math.round(z / 5)}`; let v = hCache.get(k); if (v === undefined) { v = hAt(Math.round(x / 5) * 5, Math.round(z / 5) * 5); hCache.set(k, v); } return v; };
function dp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let md2 = -1, mi = 0;
  for (let i = 1; i + 1 < pts.length; i++) { const d = segDist(pts[i], a, b).d; if (d > md2) { md2 = d; mi = i; } }
  if (md2 <= tol) return [a, b];
  return [...dp(pts.slice(0, mi + 1), tol).slice(0, -1), ...dp(pts.slice(mi), tol)];
}
function arterialSearch(s: Site, segs: Seg[]): { path: P[] | null; info: string } {
  const lineSegs = segs.filter((g) => g.cls <= 4 && !g.hc), hard = segs.filter((g) => g.cls >= 6);
  const okCell = new Map<string, boolean>();
  const cellOk = (p: P): boolean => {
    const k = `${Math.round(p.x / 10)},${Math.round(p.z / 10)}`; let v = okCell.get(k);
    if (v === undefined) {
      v = hyp(p.x - s.cx, p.z - s.cz) <= s.r - 8 && !wet(p.x, p.z) && 'ABCD'.includes(a1(p.x, p.z)) && !bldClear(p, 'A') && !hard.some((g) => segDist(p, g.a, g.b).d < CLEAR_HARD);
      okCell.set(k, v);
    }
    return v;
  };
  interface St { x: number; z: number; k: number; g: number; tail: number[]; par: St | null; start: P; hit?: P }
  const heap: St[] = [];
  const push = (e: St): void => { heap.push(e); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q].g <= heap[i].g) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = (): St => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < heap.length && heap[l].g < heap[m].g) m = l; if (r < heap.length && heap[r].g < heap[m].g) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const g of lineSegs) {
    const L = hyp(g.b.x - g.a.x, g.b.z - g.a.z);
    for (let t = 0; t <= L; t += 20) {
      const p = { x: g.a.x + ((g.b.x - g.a.x) * t) / L, z: g.a.z + ((g.b.z - g.a.z) * t) / L };
      if (hyp(p.x - s.cx, p.z - s.cz) > s.r - 8) continue;
      for (let k = 0; k < ART_NH; k++) push({ x: p.x, z: p.z, k, g: 0, tail: [hC(p.x, p.z)], par: null, start: p });
    }
  }
  const seen = new Set<string>();
  let maxG = 0, goal: St | null = null, pops = 0;
  while (heap.length && !goal && pops < 400000) {
    const e = pop(); pops++;
    const key = `${Math.round(e.x / 20)},${Math.round(e.z / 20)},${e.k}`;
    if (seen.has(key)) continue; seen.add(key);
    if (e.g > maxG) maxG = e.g;
    for (const dk of [0, -1, 1]) {
      const k2 = (e.k + dk + ART_NH) % ART_NH, an = (k2 * 2 * Math.PI) / ART_NH;
      const d = { x: Math.cos(an), z: Math.sin(an) };
      const tail = e.tail.slice();
      let bad = false, hit: P | null = null, last: P = { x: e.x, z: e.z };
      for (let m = 1; m <= ART_STEP / 5 && !bad; m++) {
        const q = { x: e.x + d.x * 5 * m, z: e.z + d.z * 5 * m };
        // sketch line: a hit ends the path (a goal if long enough), an 8-lane / R6 line is never crossed (cellOk keeps 25 m clear)
        for (const g of lineSegs) { const it = segInt(last, q, g.a, g.b); if (it && e.g + 5 * (m - 1) > 8 && !(e.g === 0 && m <= 3)) { hit = { x: last.x + (q.x - last.x) * it.t, z: last.z + (q.z - last.z) * it.t }; break; } }
        if (hit) break;
        if (!cellOk(q)) { bad = true; break; }
        tail.push(hC(q.x, q.z));
        if (tail.length > 5) tail.shift();
        if (tail.length === 5 && Math.abs(tail[4] - tail[0]) / 20 > ART_G) bad = true;
        last = q;
      }
      if (hit) {
        const gl = e.g + hyp(hit.x - e.x, hit.z - e.z);
        if (gl >= ART_MINLEN && hyp(hit.x - e.start.x, hit.z - e.start.z) >= ART_MINSEP) { goal = { x: hit.x, z: hit.z, k: k2, g: gl, tail, par: e, start: e.start, hit }; break; }
        continue;
      }
      if (bad) continue;
      push({ x: last.x, z: last.z, k: k2, g: e.g + ART_STEP * (1 + 0.15 * Math.abs(dk)), tail, par: e, start: e.start });
    }
  }
  if (!goal) return { path: null, info: `no path: from the sketch R2 / R4 lines no path of >= ${ART_MINLEN} m with every 20 m <= ${(ART_G * 100).toFixed(1)} % reaches another sketch line (farthest reach ${maxG.toFixed(0)} m, ${pops} states)` };
  const raw: P[] = [];
  for (let e: St | null = goal; e; e = e.par) raw.push(e.hit && e === goal ? e.hit : { x: e.x, z: e.z });
  raw.reverse();
  for (const tol of [12, 20, 30, 45, 60]) for (const R0 of [300, 220, 160]) {
    const vs = dp(raw, tol);
    const pts = vs.length > 2 ? pen(vs, vs.slice(1, -1).map(() => R0), RMIN.A) : vs;
    if (!pts) continue;
    const rr = validRuns(pts, 'A', s);
    if (rr.length === 1 && len(rr[0]) >= 0.97 * len(pts) && len(pts) >= ART_MINLEN * 0.9) return { path: rr[0], info: `path ${len(rr[0]).toFixed(0)} m (search ${raw.length} points, DP ${tol} m, spiral R ${R0} m)` };
  }
  return { path: null, info: `a grade path of ${len(raw).toFixed(0)} m exists but could not be smoothed to straight - spiral - arc - spiral - straight inside the ground limits` };
}

// ---------- main ----------
log('STEP C (housing street centrelines, plan view only, all 9 housings). Sketch lines R6 / R4 / R2, 8-lane, rail, buildings are NOT changed; villages wait (19.5-1).');
log(`Parameters (mine, NOT from the web, verify): grade A ${GRADE.A * 100} % / C ${GRADE.C * 100} % / L ${GRADE.L * 100} %, Rmin A ${RMIN.A} / C ${RMIN.C} / L ${RMIN.L} m, min piece = node gap ${MIN_LEN} m, building margin ${BMARGIN} m, clear of R6 / 8-lane ${CLEAR_HARD} m, local clear of R4 ${CLEAR_R4_LOCAL} m, cul-de-sac <= ${CUL_MAX} m, wet = water + ${WET_MARGIN} m > ground (stricter than sc.water > sc.h).`);
// water check FIRST (R8): wet share of every housing circle on the 25 m raster
for (const s of SITES) {
  let n = 0, w = 0;
  for (let x = s.cx - s.r; x <= s.cx + s.r; x += 25) for (let z = s.cz - s.r; z <= s.cz + s.r; z += 25) if (hyp(x - s.cx, z - s.cz) <= s.r) { n++; if (wet(x, z)) w++; }
  log(`WATER CHECK (first) ${s.id}: ${w} of ${n} raster points wet (${((100 * w) / n).toFixed(1)} %)`);
}
const OLD0: any = ONLY ? JSON.parse(readFileSync(`${OUT}/housing_streets.json`, 'utf8')) : null;
const ALL: { s: Site; b: Built; segs: Seg[]; n: Record<string, number> }[] = [];
const t0 = Date.now();
for (const s of SITES) {
  if (ONLY && !ONLY.includes(s.id)) continue;
  const segs0 = nearSegs(s);
  // earlier housings that overlap this circle: their streets are joinable (T node = junction placeholder), this housing keeps out of their circle (the earlier housing owns the overlap)
  EXCL = []; const extra: Seg[] = [];
  for (const o of SITES) {
    if (o.id === s.id || SITES.indexOf(o) > SITES.indexOf(s) || hyp(o.cx - s.cx, o.cz - s.cz) >= o.r + s.r + 60) continue;
    EXCL.push({ cx: o.cx, cz: o.cz, r: o.r });
    const pcs: { id: string; pts: number[][] }[] = (ALL.find((q) => q.s.id === o.id)?.b.pieces.map((p) => ({ id: p.id, pts: p.pts.map((q) => [q.x, q.z]) })) ?? OLD0.sites.find((q: any) => q.id === o.id).streets);
    for (const p of pcs) for (let i = 0; i + 1 < p.pts.length; i++) extra.push({ a: { x: p.pts[i][0], z: p.pts[i][1] }, b: { x: p.pts[i + 1][0], z: p.pts[i + 1][1] }, cls: 2, id: p.id, hc: true });
  }
  const segs = segs0.concat(extra);
  const spine = ['loop', 'court', 'fish', 'curvi', 'vill'].includes(s.pat);
  ARTERIAL = null;
  if (s.pat === 'cgrid') {
    // grade numbers of the circle (every 10 m cell, slope over 10 m) and the arterial search
    let n = 0; const c = [0, 0, 0, 0];
    for (let x = s.cx - s.r; x <= s.cx + s.r; x += 10) for (let z = s.cz - s.r; z <= s.cz + s.r; z += 10) if (hyp(x - s.cx, z - s.cz) <= s.r) { n++; const g = Math.max(Math.abs(hAt(x + 10, z) - hAt(x, z)), Math.abs(hAt(x, z + 10) - hAt(x, z))) / 10; if (g <= 0.04) c[0]++; if (g <= 0.06) c[1]++; if (g <= 0.08) c[2]++; if (g <= 0.10) c[3]++; }
    log(`\n${s.id} GRADE of the circle (10 m cells, steeper of the two slopes): <= 4 % ${((100 * c[0]) / n).toFixed(0)} %, <= 6 % ${((100 * c[1]) / n).toFixed(0)} %, <= 8 % ${((100 * c[2]) / n).toFixed(0)} %, <= 10 % ${((100 * c[3]) / n).toFixed(0)} % of the area`);
    const ar = arterialSearch(s, segs);
    log(`${s.id} ARTERIAL SEARCH (grade <= ${(ART_G * 100).toFixed(1)} % per 20 m, turn <= 15 deg per ${ART_STEP} m, clear of buildings / water / fenced / R6, joins R2 / R4 lines, R3 fillets): ${ar.info}`);
    ARTERIAL = ar.path;
  }
  const th0 = dominant(s, segs0, spine ? 2 : 4);
  const rots = (spine ? [0, 15, -15, 30, -30, 45, -45, 90] : [0, 15, -15, 30, -30, 45]).map((d) => th0 + (d * Math.PI) / 180);
  const B = s.pat === 'vill' ? 85 : s.pat === 'cgrid' ? 110 : s.pat === 'c2grid' ? 100 : s.pat === 'sgrid' ? 180 : s.pat === 'perim' ? 150 : 120;
  const shifts = spine ? [-120, -60, 0, 60, 120] : [0, B / 3, (2 * B) / 3];
  let best: { sc: number; th: number; sh: number } = { sc: -1, th: th0, sh: 0 };
  // two stages: every rotation / shift without links, then the 6 best again WITH access links (the final score counts the links and the 2 access points)
  const first: { sc: number; th: number; sh: number }[] = [];
  for (const th of rots) for (const sh of shifts) first.push({ sc: score(build(s, th, sh, segs, false, false)), th, sh });
  first.sort((x, y) => y.sc - x.sc);
  for (const f of first.slice(0, 6)) { const v = score(build(s, f.th, f.sh, segs, true, false)); if (v > best.sc) best = { sc: v, th: f.th, sh: f.sh }; }
  Object.keys(stat).forEach((k) => ((stat as any)[k] = 0));
  blockedBy.clear();
  const b = build(s, best.th, best.sh, segs, true, true);
  ALL.push({ s, b, segs, n: { ...stat } });
  const byCls: Record<K, number> = { A: 0, C: 0, L: 0 }, cnt: Record<K, number> = { A: 0, C: 0, L: 0 };
  for (const p of b.pieces) { byCls[p.cls] += len(p.pts); cnt[p.cls]++; }
  log(`\n${s.id}  ${s.name}`);
  log(`  direction ${((best.th * 180) / Math.PI).toFixed(0)} deg (from the sketch lines), shift ${best.sh.toFixed(0)} m, ${b.pieces.length} streets (A ${cnt.A}, C ${cnt.C}, L ${cnt.L}), length A ${byCls.A.toFixed(0)} m, C ${byCls.C.toFixed(0)} m, L ${byCls.L.toFixed(0)} m = ${((byCls.A + byCls.C + byCls.L) / 1000 / ((Math.PI * s.r * s.r) / 1e6)).toFixed(1)} km per km2 of the circle`);
  log(`  junction placeholders ${b.nodes.length}; access points on the sketch R2 / R4 lines (A / C ends, >= ${ACC_GAP} m apart) ${b.access}${b.access < 2 ? '  <-- LESS THAN 2 (fire access needs two): the sketch lines decide, ASK' : ''}`);
  log(`  dropped (no connection to the sketch network, R2): ${b.dropped.length} pieces ${b.dropped.slice(0, 6).join(', ')}`);
  log(`  samples dropped (5 m): water ${stat.wet}, ground class (water / rail / fenced / very steep / M8 ROW) ${stat.mask}, grade ${stat.grade}, building ${stat.bld}, near R6 / 8-lane / R4(local) ${stat.hard}, along a sketch line ${stat.par}; kept on a steep D cell (grade passes) ${stat.hill}`);
  const bl = [...blockedBy.entries()].sort((x, y) => y[1] - x[1]);
  log(`  buildings that a candidate street had to go round: ${bl.length}${bl.length ? ' (' + bl.slice(0, 12).map((e) => `${e[0]}x${e[1]}`).join(', ') + (bl.length > 12 ? ' ...' : '') + ')' : ''}`);
  if (b.access < 2) {   // PROBE (information only, nothing is added): would a 2nd access exist if the circle limit were released?
    const pr = findLink(b.ends ?? [], b.accPts ?? [], s, segs, true, 200, 450);
    if (pr) { const e = pr.pts[pr.pts.length - 1], g = nearestOnLine(e, segs, 4, false); log(`  PROBE 2nd access: a collector of ${len(pr.pts).toFixed(0)} m from (${pr.pts[0].x.toFixed(0)}, ${pr.pts[0].z.toFixed(0)}) to ${g ? g.id : '?'} at (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) is possible if it may leave the circle by ${Math.max(0, hyp(e.x - s.cx, e.z - s.cz) - s.r).toFixed(0)} m (NOT added)`); }
    else log('  PROBE 2nd access: no R2 / R4 line can be reached within 450 m over free ground (water / fenced / steep / building / R6 clearance)');
  }
  const stub: string[] = [];
  for (const r of RECTS) if (hyp(r.x - s.cx, r.z - s.cz) <= s.r) { let d = 1e9; for (const p of b.pieces) d = Math.min(d, polyDist(r, p.pts).d); if (d > 80) stub.push(r.id); }
  log(`  buildings inside the circle with no street within 80 m (street does not go to them): ${stub.length}${stub.length ? ' (' + stub.slice(0, 15).join(', ') + (stub.length > 15 ? ' ...' : '') + ')' : ''}`);
}
log(`\nsearch time ${((Date.now() - t0) / 1000).toFixed(0)} s. Checks (R1, R3, water, grades, clearances) are in scripts/housing-check.ts (independent loops).`);

// ---------- write ----------
const J: any = { note: 'STEP C housing street centrelines (plan view). x east, z south, metres.', sites: [] };
const OLD: any = OLD0;
for (const s0 of SITES) {
  const mine = ALL.find((q) => q.s.id === s0.id);
  if (!mine) { J.sites.push(OLD.sites.find((q: any) => q.id === s0.id)); continue; }
  const { s, b } = mine;
  const js = b.nodes.map((n, i) => ({ id: `J-${s.code}-${String(i + 1).padStart(2, '0')}`, x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10, cls: n.cls }));
  J.sites.push({ id: s.id, code: s.code, name: s.name, th_deg: Math.round(((b.th * 180) / Math.PI) * 10) / 10, shift: b.shift, access: b.access,
    streets: b.pieces.map((p) => ({ id: p.id, cls: p.cls, len: Math.round(len(p.pts)), need: p.need, pts: resample(p.pts, 5).map((q) => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]) })), junctions: js });
}
writeFileSync(`${OUT}/housing_streets.json`, JSON.stringify(J));
writeFileSync(`${OUT}/STEPC_OUTPUT.txt`, LOG.join('\n') + '\n');
