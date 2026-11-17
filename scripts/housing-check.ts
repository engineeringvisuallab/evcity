// STEP C check: reads docs/housing_streets.json (made by scripts/housing-streets.ts) and re-tests it with its OWN loops (nothing is taken from the generator).
// Run: npx tsx scripts/housing-check.ts docs        Prints PASS / FAIL per housing; prints ALL PASS only when every line passes.
import { readFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

type P = { x: number; z: number };
const OUT = process.argv[2] ?? 'docs';
const J = JSON.parse(readFileSync(`${OUT}/housing_streets.json`, 'utf8'));
const A1 = JSON.parse(readFileSync('docs/a1_buildability.json', 'utf8'));
const MAP = JSON.parse(readFileSync('docs/map_all_roads_v2.json', 'utf8'));
const gen: any = new TerrainGenerator(Config.world.seed);
const sc = gen.makeSample();
const hyp = Math.hypot;
const GRADE: Record<string, number> = { A: 0.06, C: 0.08, L: 0.1 };
const RMIN: Record<string, number> = { A: 120, C: 60, L: 30 };
const HW: Record<string, number> = { A: 9, C: 6, L: 4.5 };
const RADIUS: Record<string, [number, number, number]> = { 'H-C1': [1150, 1150, 600], 'H-C2W': [-1550, 0, 620], 'H-C2S': [-1150, 1150, 600], 'H-C3': [1550, 60, 600], 'H-S1': [450, 2250, 550], 'H-S2': [2300, 1550, 500], 'H-S3': [-1900, 1750, 650], 'H-S4': [-2450, 500, 500], 'H-S5': [250, -2550, 450], V1: [-2900, -1050, 300], V3: [-3150, 950, 300] };

const pts = (a: number[][]): P[] => a.map((q) => ({ x: q[0], z: q[1] }));
const lines: { id: string; cls: number; p: P[] }[] = [];
for (const b of MAP.built) if (!String(b.name).includes(':')) lines.push({ id: b.name, cls: b.lanes, p: pts(b.pts) });
for (const r of MAP.roads) lines.push({ id: r.id, cls: r.cls, p: pts(r.pts) });
const a1 = (x: number, z: number): string => { const i = Math.floor((x + A1.half) / A1.cell), j = Math.floor((z + A1.half) / A1.cell); return i < 0 || j < 0 || i >= A1.n || j >= A1.n ? '~' : A1.rows[j][i]; };
const hN = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };

function segInt(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : { x: a.x + rx * t, z: a.z + rz * t };
}
function rs(p: P[], step: number): P[] {
  const out = [p[0]]; let carry = 0;
  for (let i = 1; i < p.length; i++) { const L = hyp(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); let s = step - carry; while (s <= L) { out.push({ x: p[i - 1].x + ((p[i].x - p[i - 1].x) * s) / L, z: p[i - 1].z + ((p[i].z - p[i - 1].z) * s) / L }); s += step; } carry = L - (s - step); }
  return out;
}
const len = (p: P[]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += hyp(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return s; };

const RECTS = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
let fails = 0, passes = 0;
const rep = (ok: boolean, msg: string): void => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); };

type Street = { id: string; cls: string; need: string; len: number; pts: number[][]; site: string; p: P[] };
const all: Street[] = [];
for (const s of J.sites) for (const st of s.streets) all.push({ ...st, site: s.id, p: pts(st.pts) });
console.log(`housing streets ${all.length}, sites ${J.sites.length}`);

// R1: crossings among streets, and with the sketch lines (a crossing is allowed only at a shared end = node)
const isEnd = (st: Street, q: P): boolean => hyp(q.x - st.p[0].x, q.z - st.p[0].z) < 3 || hyp(q.x - st.p[st.p.length - 1].x, q.z - st.p[st.p.length - 1].z) < 3;
let x1 = 0;
const bad1: string[] = [];
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const a = all[i], b = all[j];
  if (hyp(a.p[0].x - b.p[0].x, a.p[0].z - b.p[0].z) > 2000 && a.site !== b.site) continue;
  for (let k = 0; k + 1 < a.p.length; k++) for (let m = 0; m + 1 < b.p.length; m++) {
    const q = segInt(a.p[k], a.p[k + 1], b.p[m], b.p[m + 1]);
    if (q && !(isEnd(a, q) || isEnd(b, q))) { x1++; if (bad1.length < 5) bad1.push(`${a.id} x ${b.id} at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`); }
  }
}
rep(x1 === 0, `R1 street x street crossings without a node: ${x1} ${bad1.join('; ')}`);
let x2 = 0, x3 = 0;
const bad2: string[] = [];
for (const a of all) for (const l of lines) {
  for (let k = 0; k + 1 < a.p.length; k++) for (let m = 0; m + 1 < l.p.length; m++) {
    const q = segInt(a.p[k], a.p[k + 1], l.p[m], l.p[m + 1]);
    if (!q) continue;
    if (l.cls >= 6) { x3++; if (bad2.length < 5) bad2.push(`${a.id} x ${l.id}`); } else if (!isEnd(a, q)) { x2++; if (bad2.length < 5) bad2.push(`${a.id} x ${l.id} at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`); }
  }
}
rep(x2 === 0, `R1 street through an R2 / R4 sketch line without ending there: ${x2}`);
rep(x3 === 0, `R1 street touches an R6 / 8-lane line: ${x3} ${bad2.join('; ')}`);

for (const s of J.sites) {
  const [cx, cz, r] = RADIUS[s.id];
  const st: Street[] = all.filter((a) => a.site === s.id);
  console.log(`\n${s.id} ${s.name}`);
  // nodes >= 60 m
  const js: P[] = s.junctions.map((j: any) => ({ x: j.x, z: j.z }));
  let minGap = 1e9;
  for (let i = 0; i < js.length; i++) for (let j = i + 1; j < js.length; j++) minGap = Math.min(minGap, hyp(js[i].x - js[j].x, js[i].z - js[j].z));
  for (const q of MAP.junctions) for (const j of js) { const d = hyp(q.x - j.x, q.z - j.z); if (d > 3) minGap = Math.min(minGap, d); }
  rep(minGap >= 60, `${s.id} junction nodes >= 60 m apart (also from the sketch J-xx): min ${minGap > 1e8 ? 'n/a' : minGap.toFixed(0)} m, ${js.length} placeholders`);
  // R2: need text, class limit
  rep(st.every((a) => a.need && a.len >= 60), `${s.id} R2 every street has a stated need and >= 60 m (${st.length} streets)`);
  // water (game sample), ground class, circle, buildings
  let wet = 0, mask = 0, out = 0, bld = 0, n = 0;
  let minR = 1e9, rJump = 0, worstR = '';
  const gr: Record<string, number> = { A: 0, C: 0, L: 0 };
  let worstG = '';
  for (const a of st) {
    const d5 = rs(a.p, 5);
    for (const q of d5) {
      n++;
      gen.sample(q.x, q.z, sc); if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++;
      const c = a1(q.x, q.z); if (!'ABCD'.includes(c)) mask++;
      if (hyp(q.x - cx, q.z - cz) > r + 2) out++;
      for (const b of RECTS) {
        if (Math.abs(b.x - q.x) > 80 || Math.abs(b.z - q.z) > 80) continue;
        const co = Math.cos(b.yaw), si = Math.sin(b.yaw), dx = q.x - b.x, dz = q.z - b.z;
        const lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (hyp(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)) < HW[a.cls]) bld++;
      }
    }
    const h = d5.map((q) => hN(q.x, q.z));
    for (let i = 0; i + 4 < h.length; i++) { const g = Math.abs(h[i + 4] - h[i]) / 20; if (g > gr[a.cls]) { gr[a.cls] = g; if (g > GRADE[a.cls] + 0.005) worstG = a.id; } }
    // R3: radius and curvature jump (3 points, 10 m apart)
    const d10 = rs(a.p, 10);
    let prevK = 0;
    for (let i = 1; i + 1 < d10.length; i++) {
      const A = d10[i - 1], B = d10[i], C = d10[i + 1];
      const a1x = B.x - A.x, a1z = B.z - A.z, b1x = C.x - B.x, b1z = C.z - B.z;
      const cr = a1x * b1z - a1z * b1x, la = hyp(a1x, a1z), lb = hyp(b1x, b1z), lc = hyp(C.x - A.x, C.z - A.z);
      const k = (2 * Math.abs(cr)) / Math.max(1e-9, la * lb * lc);
      if (k > 1e-6) { const R = 1 / k; if (R < minR) { minR = R; } if (R < RMIN[a.cls] * 0.9) worstR = a.id; }
      if (Math.abs(k - prevK) > 0.75 / RMIN[a.cls]) { rJump++; worstR = a.id; }
      prevK = k;
    }
  }
  rep(wet === 0, `${s.id} water check (sc.water > sc.h) on ${n} points: ${wet} wet`);
  rep(mask === 0, `${s.id} ground class (no water / rail / fenced / M8 ROW / very steep): ${mask} points outside A-D`);
  rep(out === 0, `${s.id} all streets inside the housing circle: ${out} points outside`);
  rep(bld === 0, `${s.id} no street through a building (carriageway + footpath): ${bld} points`);
  rep(!worstG, `${s.id} steepest 20 m grade A ${(gr.A * 100).toFixed(1)} % / C ${(gr.C * 100).toFixed(1)} % / L ${(gr.L * 100).toFixed(1)} % (limits 6 / 8 / 10 %) ${worstG}`);
  rep(!worstR, `${s.id} R3 smoothness: smallest radius ${minR > 1e8 ? 'n/a (all straight)' : minR.toFixed(0) + ' m'}, curvature jumps ${rJump} ${worstR}`);
  // access points
  const acc: P[] = [];
  for (const a of st) if (a.cls !== 'L') for (const e of [a.p[0], a.p[a.p.length - 1]]) {
    if (!lines.some((l) => l.cls <= 4 && l.p.some((q, i) => i + 1 < l.p.length && (() => { const L2 = (l.p[i + 1].x - q.x) ** 2 + (l.p[i + 1].z - q.z) ** 2; const t = L2 ? Math.max(0, Math.min(1, ((e.x - q.x) * (l.p[i + 1].x - q.x) + (e.z - q.z) * (l.p[i + 1].z - q.z)) / L2)) : 0; return hyp(e.x - q.x - t * (l.p[i + 1].x - q.x), e.z - q.z - t * (l.p[i + 1].z - q.z)) < 2.5; })()))) continue;
    if (!acc.some((q) => hyp(q.x - e.x, q.z - e.z) < 150)) acc.push(e);
  }
  console.log(`INFO ${s.id} separate access points (A / C ends on the sketch R2 / R4 lines, >= 150 m apart): ${acc.length}${acc.length < 2 ? '  <-- less than 2 (fire access): ASK' : ''}`);
  const tot = st.reduce((q, a) => q + len(a.p), 0);
  console.log(`INFO ${s.id} streets ${st.length}, length ${tot.toFixed(0)} m, A ${st.filter((a) => a.cls === 'A').length} / C ${st.filter((a) => a.cls === 'C').length} / L ${st.filter((a) => a.cls === 'L').length}`);
}
console.log(`\n${fails === 0 ? 'ALL PASS' : 'FAILURES'}: ${passes} PASS, ${fails} FAIL (headless; the game was NOT run)`);
