// CHECK of the city roadside rows: every NEW building (PlacementsRoadside.ts) against the REAL game data. Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-roadside-check.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { DRAWN_FILL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { ROADSIDE_ALL, ROADSIDE_CITY, insideRoadsideCity } from '../src/buildings/PlacementsRoadside';
import { ALL_CITY_PLOTS, ALL_VACANT_PLOTS } from '../src/buildings/CityPlotsAll';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';
const gen: any = new TerrainGenerator(Config.world.seed); const R = gen.roads, rail = gen.railForm, sc: any = {};
const WALK = Config.city.roadside.sidewalk, C = Config.city.roadSections, FOOT = C.highway.kerbW + C.highway.verge + C.highway.walk;
type B = { x: number; z: number; yaw: number; W: number; D: number };
const corners = (q: B): [number, number][] => { const c = Math.cos(q.yaw), s = Math.sin(q.yaw); return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([fx, fz]) => [q.x + (fx * q.W) / 2 * c + (fz * q.D) / 2 * s, q.z - (fx * q.W) / 2 * s + (fz * q.D) / 2 * c] as [number, number]); };
const sat = (ca: [number, number][], cb: [number, number][], m: number): boolean => { for (const poly of [ca, cb]) for (let k = 0; k < 4; k++) { const [ax, az] = poly[k]!, [bx, bz] = poly[(k + 1) % 4]!; const nx = -(bz - az), nz = bx - ax, l = Math.hypot(nx, nz) || 1; const pa = ca.map(([x, z]) => (x * nx + z * nz) / l), pb = cb.map(([x, z]) => (x * nx + z * nz) / l); if (Math.max(...pa) + m < Math.min(...pb) || Math.max(...pb) + m < Math.min(...pa)) return false; } return true; };
// road gap (same rule as building-relocate.ts)
const pts: { x: number; z: number; w: number }[] = [];
for (const r of R.roads) { if (r.earth) continue; const w = r.halfWidth + Math.max(FOOT, r.shoulder ?? 0, WALK); for (let i = 1; i < r.xs.length; i++) { const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]), n = Math.max(1, Math.ceil(L / 2)); for (let k = 0; k < n; k++) { const t = k / n; pts.push({ x: r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z: r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t, w }); } } }
const bad: Record<string, string[]> = { road: [], rail: [], water: [], site: [], overlapBuilding: [], overlapNew: [], plot: [], outside: [] };
const others = [...BUILDING_PLACEMENTS, ...DRAWN_FILL_PLACEMENTS.filter((p) => !ROADSIDE_ALL.includes(p))];
const plots = [...ALL_CITY_PLOTS, ...ALL_VACANT_PLOTS];
ROADSIDE_ALL.forEach((b, i) => {
  const tag = `${i} ${b.id} (${b.x}, ${b.z})`; const cb = corners(b);
  if (!insideRoadsideCity(b.x, b.z)) bad.outside!.push(tag);
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2; let gap = 1e9;
  for (const p of pts) { if (Math.abs(p.x - b.x) > 150 || Math.abs(p.z - b.z) > 150) continue; const dx = p.x - b.x, dz = p.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c; gap = Math.min(gap, Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0)) - p.w); }
  if (gap < 3) bad.road!.push(`${tag} gap ${gap.toFixed(1)}`);
  for (let a = -hx; a <= hx + 1e-6; a += hx / 4) for (let d = -hz; d <= hz + 1e-6; d += hz / 4) {
    const X = b.x + a * c + d * s, Z = b.z - a * s + d * c;
    if (rail.inCorridor(X, Z, 12) || R.surfaceAt(X, Z) !== 0) { bad.rail!.push(tag); a = 1e9; break; }
    if (libraryKeepout(X, Z) || mallKeepout(X, Z) || evlabKeepout(X, Z) || protoKeepout(X, Z) || infraKeepout(X, Z) || airportKeepout(X, Z) || agroKeepout(X, Z) || getEngineeringAreaAt(X, Z)) { bad.site!.push(tag); a = 1e9; break; }
    gen.sample(X, Z, sc); if (sc.water === sc.water && sc.h < sc.water + 0.3) { bad.water!.push(tag); a = 1e9; break; }
  }
  for (const o of others) { if (Math.hypot(o.x - b.x, o.z - b.z) > Math.hypot(b.W, b.D) / 2 + Math.hypot(o.W, o.D) / 2 + 1) continue; if (sat(cb, corners(o), 0)) { bad.overlapBuilding!.push(`${tag} x ${o.id} (${o.x}, ${o.z})`); break; } }
  for (let j = i + 1; j < ROADSIDE_ALL.length; j++) { const o = ROADSIDE_ALL[j]!; if (Math.hypot(o.x - b.x, o.z - b.z) > Math.hypot(b.W, b.D) / 2 + Math.hypot(o.W, o.D) / 2 + 1) continue; if (sat(cb, corners(o), 0)) bad.overlapNew!.push(`${tag} x ${o.id} (${o.x}, ${o.z})`); }
  for (const p of plots) { if (Math.hypot(p.c[0] - b.x, p.c[1] - b.z) > Math.hypot(b.W, b.D) / 2 + Math.max(...p.poly.map((q) => Math.hypot(q[0] - p.c[0], q[1] - p.c[1]))) + 1) continue; if (sat(cb, p.poly as [number, number][], 0)) { bad.plot!.push(`${tag} x plot ${p.id}`); break; } }
});
let total = 0; for (const [k, v] of Object.entries(bad)) { total += v.length; console.log(`${k.padEnd(16)} ${v.length}${v.length ? '  ' + v.slice(0, 4).join(' | ') : ''}`); }
console.log(`checked ${ROADSIDE_ALL.length} new buildings (circle r ${ROADSIDE_CITY.r}); problems ${total} => ${total === 0 ? 'PASS' : 'FAIL'}`);
