// RESIDENTIAL BUILDINGS (HANDOFF_RESIDENTIAL.md): puts houses / flats / shop houses along the C, L, R2 and R4 roads that lie inside the residential (abasik) areas.
// Writes src/buildings/PlacementsResidential.ts. POSITION ONLY (like PlacementsFill.ts). Terrain is NOT changed (no pads): FillBuildings gives a plinth on a slope.
// Every candidate must pass: inside the area circle, not on a road surface, road / footpath clearance, no rail corridor (10 m), no keep-out, no fenced engineering area,
// no water (+ 5 m), ground range <= RANGE_MAX, no overlap with any existing building or a new one.
// Run: npx tsx scripts/residential-place.ts            (writes the file)      npx tsx scripts/residential-place.ts --dry   (numbers only)
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { getWorldZoneAt } from '../src/city/WorldZones';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

const DRY = process.argv.includes('--dry');
const RANGE_MAX = 2.5;      // m, ground range under the footprint (ASSUMED, same family as place-buildings.ts 3 m)
const FOOT = 3.0;           // m, footpath beside the carriageway (Config.city.roadside.sidewalk)
const NEED = 1.5;           // m, clear gap from the footpath edge to a footprint
const WATER_MARGIN = 5;     // m
const RAIL_MARGIN = 10;     // m

type Style = 'dense' | 'mid' | 'sub';
interface Area { id: string; cx: number; cz: number; r: number; style: Style }
const AREAS: Area[] = [
  { id: 'se-dense', cx: 1150, cz: 1150, r: 600, style: 'dense' },
  { id: 'west-homes', cx: -1550, cz: 0, r: 620, style: 'dense' },
  { id: 'sw-homes', cx: -1150, cz: 1150, r: 600, style: 'dense' },
  { id: 'east-homes', cx: 1550, cz: 60, r: 600, style: 'mid' },
  { id: 'south-suburb', cx: 450, cz: 2250, r: 550, style: 'sub' },
  { id: 'sw-newtown', cx: -1900, cz: 1750, r: 650, style: 'sub' },
  { id: 'west-suburb', cx: -2450, cz: 500, r: 500, style: 'sub' },
  { id: 'RA-N', cx: 1030, cz: -2365, r: 520, style: 'sub' },   // user screenshots 1-2 (C-3, C-4, L-8 .. L-22)
  { id: 'RA-SW', cx: -3150, cz: 1500, r: 520, style: 'sub' },  // C-2, L-3 .. L-7
];
// model id, W (along the road), D (depth, front = local +z), weight. Sizes = the tables (footprint incl. yard).
type M = [string, number, number, number];
const MIX: Record<Style, Record<'L' | 'C' | 'R2' | 'R4', M[]>> = {
  sub: {
    L: [['house-tin', 11, 12, 15], ['house-semi-pucca', 11, 12, 20], ['house-brick-2', 13, 16, 40], ['house-brick-3', 13, 16, 20], ['townhouse-3', 10, 12, 5]],
    C: [['house-brick-3', 13, 16, 30], ['townhouse-3', 10, 12, 30], ['shop-house-3', 13, 12, 20], ['apartment-mid', 18, 13, 20]],
    R2: [['house-brick-2', 13, 16, 30], ['house-brick-3', 13, 16, 25], ['townhouse-3', 10, 12, 25], ['shop-house-3', 13, 12, 20]],
    R4: [['shop-house-3', 13, 12, 30], ['shop-house-4', 11, 11, 25], ['apartment-mid', 18, 13, 25], ['apt-slim-9', 15, 14, 20]],
  },
  mid: {
    L: [['house-brick-2', 13, 16, 35], ['house-brick-3', 13, 16, 30], ['townhouse-3', 10, 12, 25], ['house-semi-pucca', 11, 12, 10]],
    C: [['townhouse-3', 10, 12, 30], ['apartment-mid', 18, 13, 30], ['shop-house-3', 13, 12, 20], ['house-brick-3', 13, 16, 20]],
    R2: [['townhouse-3', 10, 12, 30], ['house-brick-3', 13, 16, 25], ['apartment-mid', 18, 13, 25], ['shop-house-3', 13, 12, 20]],
    R4: [['shop-house-3', 13, 12, 30], ['shop-house-4', 11, 11, 20], ['apartment-mid', 18, 13, 30], ['apt-slim-9', 15, 14, 20]],
  },
  dense: {
    L: [['townhouse-3', 10, 12, 35], ['house-brick-3', 13, 16, 25], ['apt-slim-9', 15, 14, 20], ['apartment-mid', 18, 13, 20]],
    C: [['apartment-mid', 18, 13, 30], ['apt-slim-9', 15, 14, 30], ['shop-house-3', 13, 12, 20], ['shop-house-4', 11, 11, 20]],
    R2: [['apartment-mid', 18, 13, 30], ['apt-slim-9', 15, 14, 25], ['shop-house-3', 13, 12, 25], ['townhouse-3', 10, 12, 20]],
    R4: [['apt-slim-9', 15, 14, 30], ['apartment-mid', 18, 13, 30], ['shop-house-4', 11, 11, 20], ['shop-house-3', 13, 12, 20]],
  },
};
const SETBACK: Record<'L' | 'C' | 'R2' | 'R4', number> = { L: 2, C: 3, R2: 3, R4: 5 };   // m beyond the footpath edge (ASSUMED, handoff rule: local 3-5 / collector 4-6 with the yard inside the footprint)
const GAP: Record<Style, number> = { dense: 1.5, mid: 2.5, sub: 4 };                        // m between neighbouring footprints along a road

const gen: any = new TerrainGenerator(Config.world.seed);
const s = gen.makeSample();
const blocked = (x: number, z: number): boolean => libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z) || getEngineeringAreaAt(x, z) !== null;

// ---- road ribbon samples of EVERY road (grid) for the clearance test ----
interface P { x: number; z: number; edge: number }
const CELL = 100; const grid = new Map<string, P[]>();
for (const r of gen.roads.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n; const x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; const p = { x, z, edge: r.halfWidth + Math.max(r.shoulder, FOOT) };
      const a = grid.get(key); if (a) a.push(p); else grid.set(key, [p]);
    }
    { const i = r.xs.length - 1; const x = r.xs[i], z = r.zs[i]; const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; const p = { x, z, edge: r.halfWidth + Math.max(r.shoulder, FOOT) }; const a = grid.get(key); if (a) a.push(p); else grid.set(key, [p]); }   // the last vertex too
  }
}
function roadGap(x: number, z: number, yaw: number, W: number, D: number): number {
  const c = Math.cos(yaw), sn = Math.sin(yaw), hx = W / 2, hz = D / 2, rad = Math.hypot(hx, hz) + 30;
  let best = 1e9;
  for (let a = Math.floor((x - rad) / CELL); a <= Math.floor((x + rad) / CELL); a++) for (let b = Math.floor((z - rad) / CELL); b <= Math.floor((z + rad) / CELL); b++) {
    const g = grid.get(`${a},${b}`); if (!g) continue;
    for (const p of g) { const dx = p.x - x, dz = p.z - z; const lx = dx * c - dz * sn, lz = dx * sn + dz * c; const d = Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0)); best = Math.min(best, d - p.edge); }
  }
  return best;
}

// ---- footprints already standing / newly placed (rectangles) ----
interface Rect { x: number; z: number; yaw: number; W: number; D: number }
const bGrid = new Map<string, Rect[]>(); const BC = 64;
const addRect = (r: Rect): void => { const R = Math.hypot(r.W, r.D) / 2; for (let a = Math.floor((r.x - R) / BC); a <= Math.floor((r.x + R) / BC); a++) for (let b = Math.floor((r.z - R) / BC); b <= Math.floor((r.z + R) / BC); b++) { const k = `${a},${b}`; const l = bGrid.get(k); if (l) l.push(r); else bGrid.set(k, [r]); } };
for (const b of [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS]) addRect(b);
function axes(r: Rect, m: number): { c: [number, number][]; ax: [number, number][] } {
  const c = Math.cos(r.yaw), sn = Math.sin(r.yaw), hx = r.W / 2 + m, hz = r.D / 2 + m;
  const X: [number, number] = [c, -sn], Z: [number, number] = [sn, c];
  const pts: [number, number][] = [];
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([r.x + X[0] * hx * i + Z[0] * hz * j, r.z + X[1] * hx * i + Z[1] * hz * j]);
  return { c: pts, ax: [X, Z] };
}
function overlap(a: Rect, b: Rect, m: number): boolean {
  const A = axes(a, m / 2), B = axes(b, m / 2);
  for (const ax of [...A.ax, ...B.ax]) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const p of A.c) { const v = p[0] * ax[0] + p[1] * ax[1]; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
    for (const p of B.c) { const v = p[0] * ax[0] + p[1] * ax[1]; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}
function hitsBuilding(r: Rect, gap: number): boolean {
  const R = Math.hypot(r.W, r.D) / 2 + gap + 1;
  for (let a = Math.floor((r.x - R) / BC); a <= Math.floor((r.x + R) / BC); a++) for (let b = Math.floor((r.z - R) / BC); b <= Math.floor((r.z + R) / BC); b++) { const l = bGrid.get(`${a},${b}`); if (l) for (const o of l) if (overlap(r, o, gap)) return true; }
  return false;
}

const why = { circle: 0, road: 0, surface: 0, rail: 0, blocked: 0, water: 0, slope: 0, building: 0, ok: 0 };
function test(r: Rect, area: Area, cls: 'L' | 'C' | 'R2' | 'R4'): keyof typeof why {
  if (Math.hypot(r.x - area.cx, r.z - area.cz) > area.r) return 'circle';
  if (roadGap(r.x, r.z, r.yaw, r.W, r.D) < NEED) return 'road';
  const hw = r.W / 2 + WATER_MARGIN, hd = r.D / 2 + WATER_MARGIN, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
  const nx = Math.ceil((2 * hw) / 3), nz = Math.ceil((2 * hd) / 3);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -hw + (i / nx) * 2 * hw, lz = -hd + (j / nz) * 2 * hd;
    const x = r.x + lx * c + lz * sn, z = r.z - lx * sn + lz * c;
    const inner = Math.abs(lx) <= r.W / 2 + 0.01 && Math.abs(lz) <= r.D / 2 + 0.01;
    if (blocked(x, z)) return 'blocked';
    if (gen.railForm.inCorridor(x, z, RAIL_MARGIN)) return 'rail';
    if (inner && gen.roads.surfaceAt(x, z) !== 0) return 'surface';
    gen.sample(x, z, s);
    if (s.water === s.water && s.h < s.water + 0.3) return 'water';
  }
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {   // ground range: 7 x 7 points INCLUDING the corners (same points as scripts/residential-check.ts)
    const lx = (i / 3 - 1) * r.W / 2, lz = (j / 3 - 1) * r.D / 2;
    gen.sample(r.x + lx * c + lz * sn, r.z - lx * sn + lz * c, s); mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  }
  if (mx - mn > RANGE_MAX) return 'slope';
  if (hitsBuilding(r, 1.0)) return 'building';
  void cls;
  return 'ok';
}

// ---- generator ----
const mulberry = (a: number): (() => number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hashStr = (t: string): number => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const classOf = (name: string): 'L' | 'C' | 'R2' | 'R4' | null => (name.startsWith('R2-') ? 'R2' : name.startsWith('R4-') ? 'R4' : name.startsWith('C-') ? 'C' : name.startsWith('L-') ? 'L' : null);
const pick = (mix: M[], rnd: () => number): M => { const tot = mix.reduce((a, m) => a + m[3], 0); let t = rnd() * tot; for (const m of mix) { t -= m[3]; if (t <= 0) return m; } return mix[0]; };

interface Out extends Rect { id: string; zone: string; seed: number; area: string; road: string }
const out: Out[] = [];
const stat = new Map<string, { n: number; roadM: number }>();
const perRoad: string[] = [];
for (const area of AREAS) {
  for (const r of gen.roads.roads) {
    const cls = classOf(r.name); if (!cls || r.earth) continue;
    // arc length table
    const n = r.xs.length; const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
    const total = cum[n - 1];
    const at = (sv: number): { x: number; z: number; tx: number; tz: number } => { let i = 1; while (i < n - 1 && cum[i] < sv) i++; const t = (sv - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const dx = r.xs[i] - r.xs[i - 1], dz = r.zs[i] - r.zs[i - 1], L = Math.hypot(dx, dz) || 1; return { x: r.xs[i - 1] + dx * t, z: r.zs[i - 1] + dz * t, tx: dx / L, tz: dz / L }; };
    const inside = (sv: number): boolean => { const p = at(sv); return Math.hypot(p.x - area.cx, p.z - area.cz) <= area.r; };
    let any = false; for (let sv = 0; sv <= total; sv += 20) if (inside(sv)) { any = true; break; }
    if (!any) continue;
    // a road belongs to the FIRST area that contains its middle (no double work in overlaps)
    const mid = at(total / 2); const owner = AREAS.find((a) => Math.hypot(mid.x - a.cx, mid.z - a.cz) <= a.r) ?? area;
    if (owner !== area) { let anyIn = false; for (let sv = 0; sv <= total; sv += 20) if (inside(sv)) { anyIn = true; break; } if (!anyIn) continue; }
    for (const side of [1, -1]) {
      const rnd = mulberry(hashStr(`${r.name}|${side}|${area.id}`));
      const mix = MIX[area.style][cls]; const gap = GAP[area.style];
      let cur = 14; let placed = 0;
      while (cur < total - 14) {
        let done = false;
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          const m = attempt === 0 ? pick(mix, rnd) : [...mix].sort((a, b) => a[1] * a[2] - b[1] * b[2])[attempt - 1];
          const [id, W, D] = m;
          if (cur + W > total - 14) continue;
          const p = at(cur + W / 2);
          const nxv = -p.tz * side, nzv = p.tx * side;                 // normal on this side
          const off = r.halfWidth + Math.max(r.shoulder, FOOT) + SETBACK[cls] + D / 2;
          const x = p.x + nxv * off, z = p.z + nzv * off;
          const yaw = Math.atan2(-nxv, -nzv);                           // local +z (front) turns to the road
          const rect: Rect = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: Math.round(yaw * 1e4) / 1e4, W, D };
          const res = test(rect, area, cls); why[res]++;
          if (res === 'ok') { addRect(rect); out.push({ ...rect, id, zone: getWorldZoneAt(rect.x, rect.z).id, seed: Math.floor(rnd() * 1e6), area: area.id, road: r.name }); placed++; cur += W + gap; done = true; }
        }
        if (!done) cur += 5;
      }
      if (placed) { const a = stat.get(area.id) ?? { n: 0, roadM: 0 }; a.n += placed; stat.set(area.id, a); perRoad.push(`${area.id} ${r.name} side ${side > 0 ? 'L' : 'R'}: ${placed}`); }
    }
    const a = stat.get(area.id) ?? { n: 0, roadM: 0 }; a.roadM += total; stat.set(area.id, a);
  }
}
console.log('REASONS (every candidate tried):', JSON.stringify(why));
console.log('area | buildings | road length m (whole roads that touch the area)');
for (const [k, v] of stat) console.log(`${k} | ${v.n} | ${v.roadM.toFixed(0)}`);
const byId = new Map<string, number>(); for (const o of out) byId.set(o.id, (byId.get(o.id) ?? 0) + 1);
console.log('models:', JSON.stringify(Object.fromEntries(byId)), 'total', out.length);
if (!DRY) {
  const rows = out.map((o) => `  { id: '${o.id}', x: ${o.x}, z: ${o.z}, yaw: ${o.yaw}, W: ${o.W}, D: ${o.D}, zone: '${o.zone}', seed: ${o.seed} },`).join('\r\n');
  const head = `// GENERATED by scripts/residential-place.ts (HANDOFF_RESIDENTIAL.md). Do not edit by hand: rerun the script.\r\n// Houses / flats / shop houses along the C, L, R2 and R4 roads inside the residential (abasik) areas. Position only, like PlacementsFill.ts; no terrain pad (FillBuildings gives a plinth on a slope).\r\n// ${out.length} buildings.\r\nimport type { BuildingPlacement } from './Placements';\r\n\r\nexport const RESIDENTIAL_PLACEMENTS: readonly BuildingPlacement[] = [\r\n`;
  const tail = `\r\n];\r\n\r\n/** The city fill + the residential buildings: everything that FillBuildings draws and that trees / grass keep out of. TerrainGenerator still reads only FILL_PLACEMENTS (the residential buildings get NO terrain pad, a pad loop over ${out.length} more plots would slow every ground sample). */\r\nexport const DRAWN_FILL_PLACEMENTS: readonly BuildingPlacement[] = [...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS];\r\n`;
  writeFileSync('src/buildings/PlacementsResidential.ts', head.replace("import type { BuildingPlacement } from './Placements';", "import type { BuildingPlacement } from './Placements';\r\nimport { FILL_PLACEMENTS } from './PlacementsFill';") + rows + tail);
  console.log('written src/buildings/PlacementsResidential.ts');
}
