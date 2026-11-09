// ROADS STEP 1: fit the downtown fill buildings (src/buildings/PlacementsFill.ts) to the WIDER roads, without regenerating the whole table.
// For every fill building whose gap to the road fell below 1.5 m because of the new widths: push it away from the road (sideways, up to 9 m).
// A push is accepted only if the footprint is still dry, flat enough (2 m), outside every road / shoulder / rail corridor / keep-out,
// inside the same site-0 plan, does not touch another building (1.5 m) and keeps 22 m from highways like the generator wants.
// If no push works, the building is REMOVED. The 55 hand placed buildings (Placements.ts) are never touched: they are only listed.
// Run: npx tsx scripts/fill-fit-roads.ts          (writes src/buildings/PlacementsFill.ts)
//      npx tsx scripts/fill-fit-roads.ts --dry    (only prints)
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { libraryKeepout } from '../src/library/LibrarySite';
import { mallKeepout } from '../src/mall/MallSite';
import { evlabKeepout } from '../src/evlab/EVLabSite';
import { protoKeepout } from '../src/buildings/ProtoSite';
import { infraKeepout } from '../src/engineering/InfraSites';
import { airportKeepout } from '../src/airport/AirportSite';
import { agroKeepout } from '../src/agro/AgroSite';

const DRY = process.argv.includes('--dry');
const NEED = 1.5, SLOPE = 2.0, HW_CLEAR = 22, REGION_R = 820, MARGIN = 1.5;
const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const plan = new CityPlan(gen.sites);
const hub = gen.sites[0];
const s = gen.makeSample();
const WALK = Config.city.roadside.sidewalk;
const blocked = (x: number, z: number): boolean => libraryKeepout(x, z) || mallKeepout(x, z) || evlabKeepout(x, z) || protoKeepout(x, z) || infraKeepout(x, z) || airportKeepout(x, z) || agroKeepout(x, z);

// ---- road samples (every 2 m): old and new ribbon half ---------------------------------------------------------------------------
interface P { x: number; z: number; old: number; now: number; edge: number; t1: boolean }
const CELL = 100;
const grid = new Map<string, P[]>();
for (const r of R.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    if (r.bridgeOf[i] >= 0) continue;
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      if (Math.hypot(x - hub.x, z - hub.z) > REGION_R + 250) continue;
      const city = R.isCityPoint(x, z) || r.tier === 4;
      const e = city ? Math.max(r.shoulder, WALK) : r.shoulder;
      const p: P = { x, z, old: r.planHalfWidth + e, now: r.halfWidth + e, edge: r.halfWidth + r.shoulder, t1: r.tier === 1 };
      const kk = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(p);
    }
  }
}
function near(x: number, z: number, rad: number): P[] {
  const o: P[] = [];
  for (let a = Math.floor((x - rad) / CELL); a <= Math.floor((x + rad) / CELL); a++) for (let b = Math.floor((z - rad) / CELL); b <= Math.floor((z + rad) / CELL); b++) { const g = grid.get(`${a},${b}`); if (g) o.push(...g); }
  return o;
}
interface Gap { old: number; now: number; away: [number, number] }
function gap(b: { x: number; z: number; yaw: number; W: number; D: number }): Gap {
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2;
  let old = 1e9, now = 1e9, aw: [number, number] = [0, 0];
  for (const p of near(b.x, b.z, Math.hypot(hx, hz) + 30)) {
    const dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const d = Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0));
    old = Math.min(old, d - p.old);
    if (d - p.now < now) { now = d - p.now; const L = Math.hypot(dx, dz) || 1; aw = [-dx / L, -dz / L]; }
  }
  return { old, now, away: aw };
}
function nearHighway(x: number, z: number): boolean {
  for (const p of near(x, z, HW_CLEAR + 30)) if (p.t1 && Math.hypot(p.x - x, p.z - z) - p.edge < HW_CLEAR) return true;
  return false;
}

// ---- building rectangles ------------------------------------------------------------------------------------------------------------
interface Rect { x: number; z: number; yaw: number; hw: number; hd: number }
function sat(a: Rect, b: Rect, m: number): boolean {
  const ax = [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)]], bx = [[Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const v of [ax[0], ax[1], bx[0], bx[1]]) {
    const ra = Math.abs(a.hw * (v[0] * ax[0][0] + v[1] * ax[0][1])) + Math.abs(a.hd * (v[0] * ax[1][0] + v[1] * ax[1][1]));
    const rb = Math.abs(b.hw * (v[0] * bx[0][0] + v[1] * bx[0][1])) + Math.abs(b.hd * (v[0] * bx[1][0] + v[1] * bx[1][1]));
    if (Math.abs(dx * v[0] + dz * v[1]) > ra + rb + m) return false;
  }
  return true;
}
const rectOf = (b: BuildingPlacement): Rect => ({ x: b.x, z: b.z, yaw: b.yaw, hw: b.W / 2, hd: b.D / 2 });
function groundOk(x: number, z: number, W: number, D: number, yaw: number): boolean {
  const hw = W / 2 + MARGIN, hd = D / 2 + MARGIN, c = Math.cos(yaw), sn = Math.sin(yaw);
  const nx = Math.ceil((2 * hw) / 3), nz = Math.ceil((2 * hd) / 3);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -hw + (i / nx) * 2 * hw, lz = -hd + (j / nz) * 2 * hd;
    const px = x + lx * c + lz * sn, pz = z - lx * sn + lz * c;
    if (blocked(px, pz) || R.surfaceAt(px, pz) !== 0 || gen.railForm.inCorridor(px, pz, 10)) return false;
    gen.sample(px, pz, s);
    if (s.water === s.water && s.h < s.water + 0.3) return false;
    mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
  }
  return mx - mn <= SLOPE;
}
function insidePlan(b: BuildingPlacement, x: number, z: number): boolean {
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  let site = -1;
  for (const [a, k] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + (a * b.W / 2) * c + (k * b.D / 2) * sn, pz = z - (a * b.W / 2) * sn + (k * b.D / 2) * c;
    if (Math.hypot(px - hub.x, pz - hub.z) > REGION_R) return false;
    const ar = plan.areaAt(px, pz);
    if (!ar || ar.site !== 0) return false;
    if (site < 0) site = ar.site;
  }
  return true;
}

const fill = FILL_PLACEMENTS.map((b) => ({ ...b }));
const fixed: Rect[] = BUILDING_PLACEMENTS.map(rectOf);
const alive = fill.map(() => true);
let nudged = 0, removed = 0, untouched = 0, handHit = 0;
const log: string[] = [];
const todo = fill.map((b, i) => ({ i, g: gap(b) })).filter((o) => o.g.now < NEED && o.g.now < o.g.old - 0.01).sort((a, b) => a.g.now - b.g.now);
for (const { i, g } of todo) {
  const b = fill[i];
  let done = false;
  const far = !nearHighway(b.x, b.z) ? false : false; // (a building that was already inside the 22 m highway band stays as it was)
  void far;
  const hwBefore = nearHighway(b.x, b.z);
  for (let t = Math.max(0.5, NEED - g.now); t <= 9 && !done; t += 0.5) {
    const x = +(b.x + g.away[0] * t).toFixed(1), z = +(b.z + g.away[1] * t).toFixed(1);
    if (gap({ ...b, x, z }).now < NEED) continue;
    if (!hwBefore && nearHighway(x, z)) continue;
    if (!insidePlan(b, x, z) || !groundOk(x, z, b.W, b.D, b.yaw)) continue;
    const me = { x, z, yaw: b.yaw, hw: b.W / 2, hd: b.D / 2 };
    if (fixed.some((o) => sat(me, o, 1.5))) continue;
    if (fill.some((o, j) => j !== i && alive[j] && sat(me, rectOf(o), 1.5))) continue;
    log.push(`  nudged ${b.id} (${b.x}, ${b.z}) -> (${x}, ${z}) by ${t.toFixed(1)} m  [gap was ${g.now.toFixed(2)} m]`);
    b.x = x; b.z = z; nudged++; done = true;
  }
  if (!done) { alive[i] = false; removed++; log.push(`  REMOVED ${b.id} (${b.x}, ${b.z}) zone ${b.zone}  [gap was ${g.now.toFixed(2)} m, no free spot within 9 m]`); }
}
untouched = fill.length - nudged - removed;
// hand placed buildings: never edited by this tool. It only SUGGESTS a push (same rules) so you can copy the numbers into Placements.ts.
for (const b of BUILDING_PLACEMENTS) {
  const g = gap(b);
  if (!(g.now < NEED && g.now < g.old - 0.01)) continue;
  handHit++;
  let sug = 'no free spot within 9 m';
  for (let t = Math.max(0.5, NEED - g.now); t <= 9; t += 0.5) {
    const x = +(b.x + g.away[0] * t).toFixed(1), z = +(b.z + g.away[1] * t).toFixed(1);
    if (gap({ ...b, x, z }).now < NEED || !groundOk(x, z, b.W, b.D, b.yaw)) continue;
    const me = { x, z, yaw: b.yaw, hw: b.W / 2, hd: b.D / 2 };
    if (fixed.some((o) => (o.x !== b.x || o.z !== b.z) && sat(me, o, 1.5)) || fill.some((o, j) => alive[j] && sat(me, rectOf(o), 1.5))) continue;
    sug = `suggest x: ${x}, z: ${z} (push ${t.toFixed(1)} m)`;
    break;
  }
  log.push(`  HAND PLACED ${b.id} (${b.x}, ${b.z}) gap ${g.old.toFixed(2)} -> ${g.now.toFixed(2)} m: NOT edited; ${sug}`);
}
console.log(log.join('\n'));
console.log(`\nfill buildings ${fill.length}: untouched ${untouched}, nudged ${nudged}, removed ${removed}; hand placed buildings hit by the new widths: ${handHit}`);

if (!DRY) {
  const out = fill.filter((_, i) => alive[i]);
  const rows = out.map((o) => `  { id: '${o.id}', x: ${o.x}, z: ${o.z}, yaw: ${o.yaw}, W: ${o.W}, D: ${o.D}, zone: '${o.zone}', seed: ${o.seed} },`);
  const text = `// GENERATED by scripts/fill-city.ts (Step 1: city auto-fill, central metropolis), then FITTED to the wider roads by scripts/fill-fit-roads.ts (ROADS STEP 1).\r\n// The existing building models, repeated along the streets of site 0 (each with its own seed). Position only, like Placements.ts.\r\n// ${out.length} buildings. The ${BUILDING_PLACEMENTS.length} hand placed buildings of Placements.ts are not part of this table.\r\nimport type { BuildingPlacement } from './Placements';\r\n\r\nexport const FILL_PLACEMENTS: readonly BuildingPlacement[] = [\r\n${rows.join('\r\n')}\r\n];\r\n`;
  writeFileSync('src/buildings/PlacementsFill.ts', text);
  console.log(`written src/buildings/PlacementsFill.ts (${out.length} buildings)`);
}
