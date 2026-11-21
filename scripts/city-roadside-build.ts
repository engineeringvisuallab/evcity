// CITY ROADSIDE BUILDINGS (user 2026-11-21): "game er city area er road er pase building gula k place koro. road er pase 4 lane 2 lane and 8 lane er pase boro office
// versity, hospital etc. basaw. alomelo building gula thakbe na." = line the roads of the city area with buildings in tidy rows; the big ones (office tower, university,
// hospital ...) beside the 8-lane roads; the scattered city-fill buildings inside the city area are dropped (they are replaced by the rows).
// Existing models only (src/buildings/models, registry + compact fill models). Nothing is placed on a road, in the rail corridor, on water, in a keep-out site,
// inside a city plot or on a hand placed building.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-roadside-build.ts          (writes src/buildings/PlacementsRoadside.ts + docs/city_roadside_result.json)
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { RESIDENTIAL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { ALL_CITY_PLOTS, ALL_VACANT_PLOTS } from '../src/buildings/CityPlotsAll';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';

// ------------------------------------------------------------------ settings (ASSUMED planning numbers, the user may change them)
const HUB = { x: 0, z: 300 }; // Central station hub = middle of the city area in the user's screenshot
const CITY_R = Number(process.env.CITY_R ?? 850); // m: the city area = circle round the hub
type Cls = 'A8' | 'A6' | 'A4' | 'R2' | 'C' | 'L';
// footprint front edge distance from the footpath edge (m) / gap between two buildings of the row (m)
const SETBACK: Record<Cls, number> = { A8: 26, A6: 16, A4: 9, R2: 5, C: 4, L: 4 };
const GAP: Record<Cls, number> = { A8: 14, A6: 8, A4: 5, R2: 2.5, C: 2.5, L: 2.5 };
interface Pick { id: string; W: number; D: number; w: number; max?: number }
// W = along the street, D = depth (both incl. the yard, same numbers as the existing placements)
const POOL: Record<Cls, Pick[]> = {
  A8: [ // filler along the 8-lane roads (the anchors - hospital, university, college, lab, mall, towers - are placed first, see ANCHORS)
    { id: 'office-tower', W: 45, D: 45, w: 3, max: 7 }, { id: 'slim-tower-30', W: 21, D: 22, w: 4 }, { id: 'slim-tower-20', W: 20, D: 21, w: 3 },
    { id: 'office-slim-12', W: 21, D: 20, w: 3 }, { id: 'office-mid', W: 27, D: 26, w: 3 }, { id: 'hotel-boutique', W: 17, D: 18, w: 1 },
  ],
  A6: [
    { id: 'office-mid', W: 27, D: 26, w: 4 }, { id: 'office-slim-12', W: 21, D: 20, w: 3 }, { id: 'hotel-3star', W: 39, D: 32, w: 2, max: 2 }, { id: 'apt-slim-14', W: 16, D: 15, w: 2 },
    { id: 'bank', W: 26, D: 24, w: 1 }, { id: 'diagnostic', W: 24, D: 18, w: 1 }, { id: 'supermarket', W: 33, D: 36, w: 1, max: 1 },
  ],
  A4: [
    { id: 'office-mid', W: 27, D: 26, w: 4 }, { id: 'mixed-use-6', W: 19, D: 16, w: 4 }, { id: 'bank-compact', W: 16, D: 18, w: 2 }, { id: 'apt-slim-9', W: 15, D: 14, w: 3 },
    { id: 'apt-slim-14', W: 16, D: 15, w: 2 }, { id: 'hotel-3star', W: 39, D: 32, w: 1, max: 2 }, { id: 'high-school', W: 56, D: 60, w: 1, max: 2 }, { id: 'clinic', W: 22, D: 25, w: 1, max: 4 },
    { id: 'diagnostic', W: 24, D: 18, w: 1, max: 3 }, { id: 'supermarket', W: 33, D: 36, w: 1, max: 2 }, { id: 'shop-house-4', W: 11, D: 11, w: 2 },
  ],
  R2: [
    { id: 'shop-house-3', W: 13, D: 12, w: 4 }, { id: 'shop-house-4', W: 11, D: 11, w: 3 }, { id: 'townhouse-3', W: 10, D: 12, w: 3 }, { id: 'apt-slim-9', W: 15, D: 14, w: 3 },
    { id: 'mixed-use-6', W: 19, D: 16, w: 2 }, { id: 'shop-row', W: 26, D: 11, w: 1 }, { id: 'pharmacy', W: 9, D: 11, w: 1, max: 5 }, { id: 'restaurant', W: 24, D: 26, w: 1, max: 4 },
    { id: 'clinic', W: 22, D: 25, w: 1, max: 4 }, { id: 'primary-school', W: 40, D: 36, w: 1, max: 4 }, { id: 'mosque', W: 48, D: 52, w: 1, max: 4 },
  ],
  C: [
    { id: 'shop-house-3', W: 13, D: 12, w: 4 }, { id: 'townhouse-3', W: 10, D: 12, w: 4 }, { id: 'apartment-mid', W: 18, D: 13, w: 3 }, { id: 'house-brick-3', W: 13, D: 16, w: 3 },
    { id: 'mixed-use-6', W: 19, D: 16, w: 1 }, { id: 'primary-school', W: 40, D: 36, w: 1, max: 4 }, { id: 'mosque', W: 48, D: 52, w: 1, max: 4 }, { id: 'clinic', W: 22, D: 25, w: 1, max: 4 },
  ],
  L: [
    { id: 'townhouse-3', W: 10, D: 12, w: 4 }, { id: 'house-brick-2', W: 13, D: 16, w: 4 }, { id: 'house-brick-3', W: 13, D: 16, w: 3 }, { id: 'apartment-mid', W: 18, D: 13, w: 2 },
    { id: 'house-semi-pucca', W: 11, D: 12, w: 1 }, { id: 'row-house', W: 21, D: 10, w: 1 },
  ],
};
const NEED_ROAD_GAP = 3; // m from any road edge (footpath incl.)
const RAIL_CLEAR = 12; // m beyond the rail corridor
const WATER_MARGIN = 5;
const OVERLAP = 3; // m free between a new building and an existing one

// ------------------------------------------------------------------ game data
const gen: any = new TerrainGenerator(Config.world.seed);
const R = gen.roads, rail = gen.railForm, sc: any = {};
const WALK = Config.city.roadside.sidewalk, C = Config.city.roadSections, FOOT = C.highway.kerbW + C.highway.verge + C.highway.walk;
let seedState = 20261121;
const rnd = (): number => { seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

interface Rd { name: string; hw: number; w: number; xs: number[]; zs: number[]; cls: Cls; len: number; cum: number[] }
const roads: Rd[] = [];
const CELL = 100;
interface P { x: number; z: number; w: number }
const grid = new Map<string, P[]>();
for (const r of R.roads) {
  if (r.earth) continue;
  const xs: number[] = Array.from(r.xs), zs: number[] = Array.from(r.zs);
  const w = r.halfWidth + Math.max(FOOT, r.shoulder ?? 0, WALK);
  for (let i = 1; i < xs.length; i++) {
    const L = Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = xs[i - 1]! + (xs[i]! - xs[i - 1]!) * t, z = zs[i - 1]! + (zs[i]! - zs[i - 1]!) * t;
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      const a = grid.get(key); const p = { x, z, w }; if (a) a.push(p); else grid.set(key, [p]);
    }
  }
  const name = String(r.name ?? r.id ?? '?');
  if (/^CRR|^RR-HUB/.test(name) || name.includes(':')) continue; // rail-corridor roads and slip roads: no frontage buildings
  const hw = r.halfWidth as number;
  const cls: Cls = hw >= 20 ? 'A8' : hw >= 14 ? 'A6' : hw >= 10 ? 'A4' : hw >= 4.4 ? 'R2' : hw >= 3.5 ? 'C' : 'L';
  const cum = [0]; for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!));
  roads.push({ name, hw, w, xs, zs, cls, len: cum[cum.length - 1]!, cum });
}
const near = (x: number, z: number, rad: number): P[] => { const out: P[] = []; for (let a = Math.floor((x - rad) / CELL); a <= Math.floor((x + rad) / CELL); a++) for (let b = Math.floor((z - rad) / CELL); b <= Math.floor((z + rad) / CELL); b++) { const l = grid.get(`${a},${b}`); if (l) out.push(...l); } return out; };
type B = { x: number; z: number; yaw: number; W: number; D: number };
const roadGap = (b: B): number => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2; let gap = 1e9;
  for (const p of near(b.x, b.z, Math.hypot(hx, hz) + 40)) { const dx = p.x - b.x, dz = p.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c; gap = Math.min(gap, Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0)) - p.w); }
  return gap;
};
const corners = (q: B): [number, number][] => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw); return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([fx, fz]) => [q.x + (fx * q.W) / 2 * c + (fz * q.D) / 2 * s, q.z - (fx * q.W) / 2 * s + (fz * q.D) / 2 * c] as [number, number]); };
const satOverlap = (ca: [number, number][], cb: [number, number][], m: number): boolean => {
  for (const poly of [ca, cb]) for (let k = 0; k < 4; k++) {
    const [ax, az] = poly[k]!, [bx, bz] = poly[(k + 1) % 4]!; const nx = -(bz - az), nz = bx - ax, l = Math.hypot(nx, nz) || 1;
    const pa = ca.map(([x, z]) => (x * nx + z * nz) / l), pb = cb.map(([x, z]) => (x * nx + z * nz) / l);
    if (Math.max(...pa) + m < Math.min(...pb) || Math.max(...pb) + m < Math.min(...pa)) return false;
  }
  return true;
};
const rectsOverlap = (a: B, b: B, m: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) <= Math.hypot(a.W, a.D) / 2 + Math.hypot(b.W, b.D) / 2 + m && satOverlap(corners(a), corners(b), m);

// ------------------------------------------------------------------ what is already there
const inCity = (x: number, z: number): boolean => Math.hypot(x - HUB.x, z - HUB.z) <= CITY_R;
const keptFill: BuildingPlacement[] = [], droppedFill: BuildingPlacement[] = [];
for (const p of [...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS]) (inCity(p.x, p.z) ? droppedFill : keptFill).push(p);
const OC = 40; const oh = new Map<string, B[]>();
const okey = (x: number, z: number): string => `${Math.floor(x / OC)},${Math.floor(z / OC)}`;
const ohAdd = (b: B): void => { const k = okey(b.x, b.z); const a = oh.get(k); if (a) a.push(b); else oh.set(k, [b]); };
for (const p of BUILDING_PLACEMENTS) ohAdd(p); // hand placed + plot buildings: stay
for (const p of keptFill) if (Math.hypot(p.x - HUB.x, p.z - HUB.z) < CITY_R + 150) ohAdd(p);
const overlapsAny = (b: B, m: number): boolean => { const rad = Math.hypot(b.W, b.D) / 2 + 80; for (let a = Math.floor((b.x - rad) / OC); a <= Math.floor((b.x + rad) / OC); a++) for (let c = Math.floor((b.z - rad) / OC); c <= Math.floor((b.z + rad) / OC); c++) { const l = oh.get(`${a},${c}`); if (l) for (const o of l) if (rectsOverlap(b, o, m)) return true; } return false; };
const plotPolys = [...ALL_CITY_PLOTS, ...ALL_VACANT_PLOTS].map((p) => ({ c: p.c, poly: p.poly as [number, number][], r: Math.max(...p.poly.map((q) => Math.hypot(q[0] - p.c[0], q[1] - p.c[1]))) }));
const inPlot = (b: B, m: number): boolean => { const cb = corners(b), rad = Math.hypot(b.W, b.D) / 2 + m + 2; for (const p of plotPolys) { if (Math.hypot(p.c[0] - b.x, p.c[1] - b.z) > rad + p.r) continue; if (satOverlap(cb, p.poly, m)) return true; } return false; };

// ------------------------------------------------------------------ terrain / sites
function terrainRange(b: B): number | null {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2 + WATER_MARGIN, hz = b.D / 2 + WATER_MARGIN;
  const nx = Math.ceil((2 * hx) / 4), nz = Math.ceil((2 * hz) / 4);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -hx + (i / nx) * 2 * hx, lz = -hz + (j / nz) * 2 * hz, X = b.x + lx * c + lz * s, Z = b.z - lx * s + lz * c;
    if (rail.inCorridor(X, Z, RAIL_CLEAR) || R.surfaceAt(X, Z) !== 0) return null;
    if (libraryKeepout(X, Z) || mallKeepout(X, Z) || evlabKeepout(X, Z) || protoKeepout(X, Z) || infraKeepout(X, Z) || airportKeepout(X, Z) || agroKeepout(X, Z) || getEngineeringAreaAt(X, Z)) return null;
    gen.sample(X, Z, sc); if (sc.water === sc.water && sc.h < sc.water + 0.3) return null;
    if (Math.abs(lx) <= b.W / 2 && Math.abs(lz) <= b.D / 2) { mn = Math.min(mn, sc.h); mx = Math.max(mx, sc.h); }
  }
  const a = b.W * b.D, lim = a >= 1500 ? 12 : a >= 400 ? 8 : 6; // the plinth under the model (PlacedBuildings / FillBuildings) levels the rest
  return mx - mn <= lim ? mx - mn : null;
}

// ------------------------------------------------------------------ placing
const used = new Map<string, number>();
const placed: (BuildingPlacement & { road: string; cls: Cls; side: number })[] = [];
const rejects: Record<string, number> = { road: 0, outside: 0, overlap: 0, plot: 0, terrain: 0 };
function pointAt(rd: Rd, s: number): { x: number; z: number; tx: number; tz: number } {
  let i = 1; while (i < rd.cum.length - 1 && rd.cum[i]! < s) i++;
  const a = rd.cum[i - 1]!, l = Math.max(1e-6, rd.cum[i]! - a), t = Math.min(1, Math.max(0, (s - a) / l));
  const x = rd.xs[i - 1]! + (rd.xs[i]! - rd.xs[i - 1]!) * t, z = rd.zs[i - 1]! + (rd.zs[i]! - rd.zs[i - 1]!) * t;
  // tangent over +-6 m so a small kink does not turn the building
  const s0 = Math.max(0, s - 6), s1 = Math.min(rd.len, s + 6);
  const p0 = at(rd, s0), p1 = at(rd, s1); const dx = p1.x - p0.x, dz = p1.z - p0.z, d = Math.hypot(dx, dz) || 1;
  return { x, z, tx: dx / d, tz: dz / d };
}
function at(rd: Rd, s: number): { x: number; z: number } {
  let i = 1; while (i < rd.cum.length - 1 && rd.cum[i]! < s) i++;
  const a = rd.cum[i - 1]!, l = Math.max(1e-6, rd.cum[i]! - a), t = Math.min(1, Math.max(0, (s - a) / l));
  return { x: rd.xs[i - 1]! + (rd.xs[i]! - rd.xs[i - 1]!) * t, z: rd.zs[i - 1]! + (rd.zs[i]! - rd.zs[i - 1]!) * t };
}
function pick(cls: Cls, exclude: Set<string>): Pick | null {
  const pool = POOL[cls].filter((p) => !exclude.has(p.id) && (p.max === undefined || (used.get(p.id) ?? 0) < p.max));
  const tot = pool.reduce((a, p) => a + p.w, 0); if (!tot) return null;
  let r = rnd() * tot; for (const p of pool) { r -= p.w; if (r <= 0) return p; }
  return pool[pool.length - 1]!;
}
function tryAt(rd: Rd, side: number, s: number, m: Pick): { b: B; range: number } | null {
  const pa = pointAt(rd, s + m.W / 2); if (!inCity(pa.x, pa.z)) { rejects.outside!++; return null; }
  const nx = -pa.tz * side, nz = pa.tx * side; // normal to the chosen side
  const off = rd.w + SETBACK[rd.cls] + m.D / 2;
  const b: B = { x: pa.x + nx * off, z: pa.z + nz * off, yaw: Math.atan2(-nx, -nz), W: m.W, D: m.D };
  if (!inCity(b.x, b.z)) { rejects.outside!++; return null; }
  if (roadGap(b) < NEED_ROAD_GAP) { rejects.road!++; return null; }
  if (overlapsAny(b, OVERLAP)) { rejects.overlap!++; return null; }
  if (inPlot(b, 2)) { rejects.plot!++; return null; }
  const range = terrainRange(b); if (range === null) { rejects.terrain!++; return null; }
  return { b, range };
}

// ------------------------------------------------------------------ anchors: the big buildings of the user's order, beside the 8-lane roads, outer side first
interface Anchor { id: string; W: number; D: number; n: number; spread: number; outer: number }
const ANCHORS: Anchor[] = [
  { id: 'hospital', W: 80, D: 62, n: 1, spread: 300, outer: 1 }, { id: 'university-building', W: 70, D: 54, n: 2, spread: 150, outer: 1 }, { id: 'college', W: 70, D: 46, n: 1, spread: 150, outer: 1 },
  { id: 'engineering-lab', W: 64, D: 50, n: 1, spread: 150, outer: 1 }, { id: 'mall', W: 61, D: 60, n: 1, spread: 300, outer: 0 }, { id: 'office-tower', W: 45, D: 45, n: 4, spread: 110, outer: 0 },
];
const hubDist = (x: number, z: number): number => Math.hypot(x - HUB.x, z - HUB.z);
const anchorPos: { id: string; x: number; z: number }[] = [];
for (const an of ANCHORS) {
  for (let k = 0; k < an.n; k++) {
    let best: { rd: Rd; side: number; b: B; score: number } | null = null;
    for (const rd of roads.filter((r) => r.cls === 'A8')) for (const side of [1, -1]) for (let s = 4; s < rd.len - an.W; s += 8) {
      const pa = at(rd, s + an.W / 2); if (!inCity(pa.x, pa.z)) continue;
      const hit = tryAt(rd, side, s, { id: an.id, W: an.W, D: an.D, w: 1 }); if (!hit) continue;
      if (anchorPos.some((q) => (q.id === an.id || an.id === 'office-tower' || q.id === 'office-tower' ? Math.hypot(q.x - hit.b.x, q.z - hit.b.z) < an.spread : Math.hypot(q.x - hit.b.x, q.z - hit.b.z) < 120))) continue;
      const score = hit.range - an.outer * 0.02 * hubDist(hit.b.x, hit.b.z); // flat ground first; hospital / university lean to the outer side
      if (!best || score < best.score) best = { rd, side, b: hit.b, score };
    }
    if (!best) { console.log('ANCHOR NOT PLACED', an.id); continue; }
    const b = best.b, seed = Math.floor(rnd() * 1e6);
    placed.push({ id: an.id, x: +b.x.toFixed(1), z: +b.z.toFixed(1), yaw: +b.yaw.toFixed(4), W: an.W, D: an.D, zone: 'city-roadside', seed, road: best.rd.name, cls: 'A8', side: best.side });
    ohAdd({ ...b, x: +b.x.toFixed(1), z: +b.z.toFixed(1) }); used.set(an.id, (used.get(an.id) ?? 0) + 1); anchorPos.push({ id: an.id, x: b.x, z: b.z });
    console.log(`anchor ${an.id} on ${best.rd.name} at (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) ground range ${best.score.toFixed(1)}`);
  }
}
// big roads first, so the big buildings get the 8-lane frontage before anything else
const order: Cls[] = ['A8', 'A6', 'A4', 'R2', 'C', 'L'];
for (const cls of order) for (const rd of roads.filter((r) => r.cls === cls)) {
  // skip a road with no point inside the city area
  let any = false; for (let s = 0; s <= rd.len; s += 20) { const p = at(rd, s); if (inCity(p.x, p.z)) { any = true; break; } } if (!any) continue;
  for (const side of [1, -1]) {
    let s = 4;
    while (s < rd.len - 4) {
      const pa = at(rd, s); if (!inCity(pa.x, pa.z)) { s += 12; continue; }
      let done = false; const tried = new Set<string>();
      for (let k = 0; k < 4 && !done; k++) {
        const m = pick(cls, tried); if (!m) break; tried.add(m.id);
        const hit = tryAt(rd, side, s, m); const b = hit?.b;
        if (b) { const seed = Math.floor(rnd() * 1e6); placed.push({ id: m.id, x: +b.x.toFixed(1), z: +b.z.toFixed(1), yaw: +b.yaw.toFixed(4), W: m.W, D: m.D, zone: 'city-roadside', seed, road: rd.name, cls, side }); ohAdd({ ...b, x: +b.x.toFixed(1), z: +b.z.toFixed(1) }); used.set(m.id, (used.get(m.id) ?? 0) + 1); s += m.W + GAP[cls]; done = true; }
      }
      if (!done) s += 4;
    }
  }
}

// ------------------------------------------------------------------ report + files
const byCls: Record<string, number> = {}, byId: Record<string, number> = {};
for (const p of placed) { byCls[p.cls] = (byCls[p.cls] ?? 0) + 1; byId[p.id] = (byId[p.id] ?? 0) + 1; }
console.log(`city area: circle r=${CITY_R} m round (${HUB.x}, ${HUB.z}); roads used ${roads.filter((r) => placed.some((p) => p.road === r.name)).length}`);
console.log(`dropped city-fill / residential buildings inside the circle: ${droppedFill.length} (kept outside: ${keptFill.length})`);
console.log(`NEW roadside buildings: ${placed.length}  by road class`, byCls);
console.log('by model', byId);
console.log('rejected candidates', rejects);
const j = (o: unknown): string => JSON.stringify(o);
const ts = `// GENERATED by scripts/city-roadside-build.ts (user 2026-11-21: buildings beside the roads of the city area, big offices / university / hospital beside the 8-lane roads, no scattered buildings). Do not edit by hand: rerun the script.
// ${placed.length} buildings in tidy rows along the roads inside the circle r = ${CITY_R} m round the hub (${HUB.x}, ${HUB.z}); the front of every building faces its road.
// The city-fill / residential buildings whose centre is inside that circle are dropped (PlacementsResidential.ts) because these rows replace them.
// Switch: Config.city.roadside.buildings (false = the old scattered fill comes back, none of these rows).
import type { BuildingPlacement } from './Placements';

export const ROADSIDE_CITY = { x: ${HUB.x}, z: ${HUB.z}, r: ${CITY_R} } as const;
/** Is (x, z) inside the circle of the city area whose old scattered fill is dropped? */
export const insideRoadsideCity = (x: number, z: number): boolean => Math.hypot(x - ROADSIDE_CITY.x, z - ROADSIDE_CITY.z) <= ROADSIDE_CITY.r;

export const ROADSIDE_ALL: readonly BuildingPlacement[] = [
${placed.map((p) => '  ' + j({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, W: p.W, D: p.D, zone: p.zone, seed: p.seed })).join(',\n')},
];
`;
writeFileSync('src/buildings/PlacementsRoadside.ts', ts.replace(/\n/g, '\r\n'));
writeFileSync('docs/city_roadside_result.json', j({ city: { ...HUB, r: CITY_R }, placed, dropped: droppedFill.map((p) => ({ id: p.id, x: p.x, z: p.z, W: p.W, D: p.D, yaw: p.yaw })), roads: roads.map((r) => ({ name: r.name, cls: r.cls, hw: r.hw, xs: r.xs.map((v) => +v.toFixed(1)), zs: r.zs.map((v) => +v.toFixed(1)) })), byCls, byId, rejects }));
