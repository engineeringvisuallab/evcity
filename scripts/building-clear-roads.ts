// CLEAR BUILDINGS OFF ROADS AND RAILWAY (user 2026-11-19: 'game er building gula k road er upore theke soraw. and railway thekeo').
// Reads /tmp-free: runs the same test as scripts/building-on-road-check.ts, then
//   - city FILL / residential buildings that stand on a road (ribbon + shoulder / footpath) or in the rail corridor are DELETED from the table,
//   - hand placed buildings (Placements.ts) are MOVED to the nearest free spot of the same zone (same tests as scripts/placements-test.ts + 3 m clear of every road edge).
// Run:  npx tsx scripts/building-clear-roads.ts            (dry run, prints the plan)
//       npx tsx scripts/building-clear-roads.ts --apply    (edits src/buildings/Placements.ts, PlacementsFill.ts, PlacementsResidential.ts)
import { readFileSync, writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { RESIDENTIAL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { getWorldZoneAt } from '../src/city/WorldZones';

const APPLY = process.argv.includes('--apply');
const gen: any = new TerrainGenerator(Config.world.seed);
const R = gen.roads, rail = gen.railForm, sc = gen.makeSample();
const WALK = Config.city.roadside.sidewalk, C = Config.city.roadSections, FOOT = C.highway.kerbW + C.highway.verge + C.highway.walk;
const CELL = 100;
interface P { x: number; z: number; w: number }
const grid = new Map<string, P[]>();
for (const r of R.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      const city = R.isCityPoint(x, z) || r.tier === 4;
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      const p = { x, z, w: r.halfWidth + (city ? Math.max(FOOT, r.shoulder, WALK) : r.shoulder) };
      const a = grid.get(key); if (a) a.push(p); else grid.set(key, [p]);
    }
  }
}
const near = (x: number, z: number, rad: number): P[] => {
  const out: P[] = [];
  for (let a = Math.floor((x - rad) / CELL); a <= Math.floor((x + rad) / CELL); a++) for (let b = Math.floor((z - rad) / CELL); b <= Math.floor((z + rad) / CELL); b++) { const g = grid.get(`${a},${b}`); if (g) out.push(...g); }
  return out;
};
type B = { x: number; z: number; yaw: number; W: number; D: number };
const roadGap = (b: B): number => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2;
  let gap = 1e9;
  for (const p of near(b.x, b.z, Math.hypot(hx, hz) + 40)) {
    const dx = p.x - b.x, dz = p.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    gap = Math.min(gap, Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0)) - p.w);
  }
  return gap;
};
const railShare = (b: B, margin: number): number => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  let n = 0, hit = 0;
  for (let lx = -b.W / 2; lx <= b.W / 2 + 1e-6; lx += Math.max(1, b.W / Math.ceil(b.W / 3))) for (let lz = -b.D / 2; lz <= b.D / 2 + 1e-6; lz += Math.max(1, b.D / Math.ceil(b.D / 3))) { n++; if (rail.inCorridor(b.x + lx * c + lz * s, b.z - lx * s + lz * c, margin)) hit++; }
  return hit / Math.max(1, n);
};
const onRoadOrRail = (b: B): boolean => roadGap(b) < 0 || railShare(b, 0) > 0;

// ---- other buildings: rectangles for the overlap test (every building that stays) ----
const rectsOverlap = (a: B, b: B, m: number): boolean => {
  if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.W, a.D) / 2 + Math.hypot(b.W, b.D) / 2 + m) return false;
  const corners = (q: B): [number, number][] => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([fx, fz]) => [q.x + (fx * q.W) / 2 * c + (fz * q.D) / 2 * s, q.z - (fx * q.W) / 2 * s + (fz * q.D) / 2 * c]); };
  const axes = (q: B): [number, number][] => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw); return [[c, -s], [s, c]]; };
  const ca = corners(a), cb = corners(b);
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) + m < Math.min(...pb) || Math.max(...pb) + m < Math.min(...pa)) return false;
  }
  return true;
};

// 1. fill + residential: which ones go
const fillGone = FILL_PLACEMENTS.filter(onRoadOrRail);
const resGone = RESIDENTIAL_PLACEMENTS.filter(onRoadOrRail);
const goneSet = new Set<BuildingPlacement>([...fillGone, ...resGone]);
const keepFill = [...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS].filter((p) => !goneSet.has(p));
console.log(`fill: ${fillGone.length} of ${FILL_PLACEMENTS.length} deleted; residential: ${resGone.length} of ${RESIDENTIAL_PLACEMENTS.length} deleted`);

// 2. hand placed: move
const hand = BUILDING_PLACEMENTS.filter(onRoadOrRail);
const moved: { from: BuildingPlacement; x: number; z: number; d: number }[] = [];
const others = (self: BuildingPlacement): B[] => [...BUILDING_PLACEMENTS.filter((q) => q !== self).map((q) => moved.find((m) => m.from === q) ? { ...q, x: moved.find((m) => m.from === q)!.x, z: moved.find((m) => m.from === q)!.z } : q), ...keepFill];
function okSpot(p: BuildingPlacement, x: number, z: number, oth: B[]): boolean {
  const b: B = { x, z, yaw: p.yaw, W: p.W, D: p.D };
  if (getWorldZoneAt(x, z).id !== p.zone) return false;
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw), nx = Math.ceil(p.W / 3), nz = Math.ceil(p.D / 3);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -p.W / 2 + (i / nx) * p.W, lz = -p.D / 2 + (j / nz) * p.D, X = x + lx * c + lz * sn, Z = z - lx * sn + lz * c;
    if (R.surfaceAt(X, Z) !== 0 || rail.inCorridor(X, Z, 6)) return false;
    if (libraryKeepout(X, Z) || mallKeepout(X, Z) || evlabKeepout(X, Z) || protoKeepout(X, Z) || infraKeepout(X, Z) || airportKeepout(X, Z) || agroKeepout(X, Z)) return false;
    gen.sample(X, Z, sc);
    if (sc.water === sc.water && sc.h < sc.water + 0.3) return false;
    mn = Math.min(mn, sc.h); mx = Math.max(mx, sc.h);
  }
  if (mx - mn > 14.5) return false;
  if (roadGap(b) < 3) return false;
  for (const o of oth) if (rectsOverlap(b, o, 3)) return false;
  return true;
}
for (const p of hand) {
  const oth = others(p);
  let best: { x: number; z: number; d: number } | null = null;
  const cands: { x: number; z: number; d: number }[] = [];
  for (let dx = -700; dx <= 700; dx += 5) for (let dz = -700; dz <= 700; dz += 5) { const d = Math.hypot(dx, dz); if (d <= 700) cands.push({ x: p.x + dx, z: p.z + dz, d }); }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) if (okSpot(p, c.x, c.z, oth)) { best = c; break; }
  if (best) { moved.push({ from: p, x: best.x, z: best.z, d: best.d }); console.log(`hand ${p.id} (${p.x}, ${p.z}) -> (${best.x}, ${best.z}), ${best.d.toFixed(0)} m, zone ${p.zone}`); }
  else console.log(`hand ${p.id} (${p.x}, ${p.z}): NO free spot within 700 m in zone ${p.zone} (stays)`);
}
if (!APPLY) { console.log('(dry run, nothing edited; --apply writes the tables)'); process.exit(0); }

// ---- apply: delete fill / residential lines, rewrite hand coordinates ----
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v: number): string => String(+v.toFixed(1));
function dropLines(file: string, gone: BuildingPlacement[]): number {
  let t = readFileSync(file, 'utf8'), n = 0;
  for (const p of gone) {
    const re = new RegExp(`^[ \\t]*\\{ id: '${esc(p.id)}', x: ${esc(String(p.x))}, z: ${esc(String(p.z))},[^\\n]*\\},?[ \\t]*\\r?\\n`, 'm');
    if (re.test(t)) { t = t.replace(re, ''); n++; }
  }
  writeFileSync(file, t);
  return n;
}
console.log('fill lines removed:', dropLines('src/buildings/PlacementsFill.ts', fillGone), 'residential lines removed:', dropLines('src/buildings/PlacementsResidential.ts', resGone));
let t = readFileSync('src/buildings/Placements.ts', 'utf8'), nm = 0;
for (const m of moved) {
  const re = new RegExp(`(\\{ id: '${esc(m.from.id)}', x: )${esc(String(m.from.x))}(, z: )${esc(String(m.from.z))}(,[^\\n]*?\\},)([ \\t]*//[^\\n]*)?(\\r?\\n)`);
  if (re.test(t)) { t = t.replace(re, `$1${num(m.x)}$2${num(m.z)}$3 // moved from (${m.from.x}, ${m.from.z}) off the road / railway (${m.d.toFixed(0)} m)$5`); nm++; }
}
writeFileSync('src/buildings/Placements.ts', t);
console.log('hand placements rewritten:', nm);
