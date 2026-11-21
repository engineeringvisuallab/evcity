// REDO step 1: NO-GO MAP for the city plots. Rasterises everything a plot must NOT touch, read from the game itself.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-nogo-map.ts
// Output: docs/city_nogo.json (bit mask per cell, base64) ; picture: python3 tools/city-nogo-plot.py
import { readFileSync, writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';
const gen: any = new TerrainGenerator(Config.world.seed);
const sc: any = {};
const inp = JSON.parse(readFileSync('docs/city_plots_input.json', 'utf8'));
const names = new Set<string>(inp.streets.map((s: any) => s.name));
// ASSUMED numbers (the user may change them)
const X0 = -3800, X1 = 3000, Z0 = -3000, Z1 = 4600, CELL = 4;
const ROAD_MARGIN = 5;     // m beyond road edge (half width + shoulder) for every game road that is not one of the 17 streets
const STREET_KEEP = 12;    // m from the centre line of the 17 city streets (rule of the plots)
const RAIL_EDGE = 12;      // m beyond the rail corridor (same as scripts/city-plots-full-check.ts)
const RAIL_AXIS = 30;      // m from the rail axis (HANDOFF section 5 / ROADFIX R3), decided with the user 2026-11-20 ("you are my engineer")
const HOSP_RAIL = 100;     // m from the rail axis, hospital only (table 4, ASSUMED); soft bit 128
const WATER_BUF = 30;      // m from wet ground (HANDOFF_CITY_DESIGN section 5)
const BLD_MARGIN = 4;      // m around every hand placed building
const STEEP = 0.25;      // slope (rise / run) over 20 m, marked as soft bit (0.25 = 14 degrees: only VERY steep land gets no plot; the game gives buildings a flat plinth on a slope)
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
const B = { ROAD: 1, STREET: 2, RAIL: 4, KEEP: 8, WATER: 16, BUILDING: 32, STEEP: 64, RAIL100: 128 };
const rf: any = gen.railForm; const rr = { d: 0, h: 0 };
const axisD = (x: number, z: number): number => { let best = 1e9; const cx = Math.floor(x / 64), cz = Math.floor(z / 64); for (let a = cx - 2; a <= cx + 2; a++) for (let b = cz - 2; b <= cz + 2; b++) { const l = rf.cells.get((a + 2048) * 8192 + (b + 2048)); if (!l) continue; for (const id of l) { rf.probe(id, x, z, rr); if (rr.d < best) best = rr.d; } } return best; };
const m = new Uint8Array(NX * NZ);
const HC = 100; const grid = new Map<string, { x: number; z: number; r: number; own: boolean }[]>();
for (const r of gen.roads.roads) {
  if (r.earth) continue;
  const own = names.has(String(r.name ?? r.id ?? '?'));
  const rad = own ? STREET_KEEP : r.halfWidth + Math.max(r.shoulder, 3) + ROAD_MARGIN;
  const add = (x: number, z: number): void => { const k = `${Math.floor(x / HC)},${Math.floor(z / HC)}`; const p = { x, z, r: rad, own }; const a = grid.get(k); if (a) a.push(p); else grid.set(k, [p]); };
  for (let i = 1; i < r.xs.length; i++) { const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); const n = Math.max(1, Math.ceil(L / 2)); for (let k = 0; k < n; k++) { const t = k / n; add(r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t); } }
  add(r.xs[r.xs.length - 1], r.zs[r.zs.length - 1]);
}
const hand: any[] = inp.hand.filter((b: any) => !(b.id === 'hospital' && b.x === 220));
const wet = new Uint8Array(NX * NZ);
const hOf = (x: number, z: number): number => { gen.sample(x, z, sc); return sc.h; };
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL; let v = 0;
  for (let a = Math.floor((x - 70) / HC); a <= Math.floor((x + 70) / HC); a++) for (let b = Math.floor((z - 70) / HC); b <= Math.floor((z + 70) / HC); b++) { const g = grid.get(`${a},${b}`); if (!g) continue; for (const p of g) if (Math.hypot(p.x - x, p.z - z) < p.r) v |= p.own ? B.STREET : B.ROAD; }
  if (gen.roads.surfaceAt(x, z) !== 0) v |= B.ROAD;
  const ad = axisD(x, z); if (gen.railForm.inCorridor(x, z, RAIL_EDGE) || ad < RAIL_AXIS) v |= B.RAIL; if (ad < HOSP_RAIL) v |= B.RAIL100;
  if (libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z) || getEngineeringAreaAt(x, z)) v |= B.KEEP;
  for (const b of hand) { const r = Math.max(b.W, b.D) / 2 + BLD_MARGIN; if (Math.abs(b.x - x) < r && Math.abs(b.z - z) < r) { v |= B.BUILDING; break; } }
  gen.sample(x, z, sc); if (sc.water === sc.water && sc.h < sc.water + 0.3) wet[j * NX + i] = 1;
  const hx = hOf(x + 10, z) - hOf(x - 10, z), hz = hOf(x, z + 10) - hOf(x, z - 10);
  if (Math.hypot(hx, hz) / 20 > STEEP) v |= B.STEEP;
  m[j * NX + i] = v;
}
const R = Math.ceil(WATER_BUF / CELL);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (wet[j * NX + i]) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NZ && di * di + dj * dj <= R * R) m[b * NX + a] |= B.WATER; }
let tot = 0; const cnt: Record<string, number> = {}; let free = 0;
for (let k = 0; k < m.length; k++) { tot++; if (m[k] === 0) free++; for (const [n, bit] of Object.entries(B)) if (m[k] & bit) cnt[n] = (cnt[n] ?? 0) + 1; }
const ha = (c: number): string => (c * CELL * CELL / 1e4).toFixed(0);
console.log('area x', X0, X1, ' z', Z0, Z1, ' cell', CELL, ' cells', NX, 'x', NZ);
for (const [n, c] of Object.entries(cnt)) console.log(`no-go ${n.padEnd(9)} ${ha(c)} ha`);
console.log(`FREE (no bit at all) ${ha(free)} ha of ${ha(tot)} ha`);
writeFileSync('docs/city_nogo.json', JSON.stringify({ x0: X0, z0: Z0, cell: CELL, nx: NX, nz: NZ, bits: B, assumed: { RAIL_AXIS, HOSP_RAIL, ROAD_MARGIN, STREET_KEEP, RAIL_EDGE, WATER_BUF, BLD_MARGIN, STEEP }, mask: Buffer.from(m).toString('base64'), wet: Buffer.from(wet).toString('base64') }));
console.log('written docs/city_nogo.json');
