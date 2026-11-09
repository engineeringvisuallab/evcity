// ROADS STEP 1: how close is every building to the road ribbon, with the OLD road widths and with the NEW (wider) ones?
// The building tables (src/buildings/Placements.ts, PlacementsFill.ts) were made for the old widths, so a wider road can reach a footprint.
// This script ONLY reports. It moves nothing. Run: npx tsx scripts/building-clearance-check.ts
// Footprints are the W x D rectangles of the tables (they already include the yard / compound), turned by yaw.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { DIVIDED_SECTIONS } from '../src/roads/RoadSection';

const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const WALK = Config.city.roadside.sidewalk;
const C = Config.city.roadSections;
const FOOT_TARGET = C.highway.kerbW + C.highway.verge + C.highway.walk; // Step 3 footpath (3.7 m)
const NEED = 1.5; // the fill generator keeps buildings this far outside the footpath edge

interface P { x: number; z: number; old: number; now: number; step3: number }
const CELL = 100;
const grid = new Map<string, P[]>();
let samples = 0;
for (const r of R.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t;
      const z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      const city = R.isCityPoint(x, z) || r.tier === 4;
      const edge = city ? Math.max(r.shoulder, WALK) : r.shoulder;
      const p: P = { x, z, old: r.planHalfWidth + edge, now: r.halfWidth + edge, step3: r.halfWidth + (city ? Math.max(FOOT_TARGET, r.shoulder) : r.shoulder) };
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      const a = grid.get(key);
      if (a) a.push(p); else grid.set(key, [p]);
      samples++;
    }
  }
}

function near(x: number, z: number, rad: number): P[] {
  const out: P[] = [];
  const c0 = Math.floor((x - rad) / CELL), c1 = Math.floor((x + rad) / CELL), d0 = Math.floor((z - rad) / CELL), d1 = Math.floor((z + rad) / CELL);
  for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) { const g = grid.get(`${a},${b}`); if (g) out.push(...g); }
  return out;
}

/** Smallest (distance from the footprint rectangle to the road centre) - (ribbon half), for the old, new and Step 3 widths. Negative = the road reaches the footprint. */
function clearance(b: { x: number; z: number; yaw: number; W: number; D: number }): { old: number; now: number; step3: number } {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const hx = b.W / 2, hz = b.D / 2;
  const rad = Math.hypot(hx, hz) + 30;
  const pts = near(b.x, b.z, rad);
  let old = 1e9, now = 1e9, step3 = 1e9;
  for (const p of pts) {
    // road sample in the footprint frame
    const dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ex = Math.max(Math.abs(lx) - hx, 0), ez = Math.max(Math.abs(lz) - hz, 0);
    const d = Math.hypot(ex, ez);
    old = Math.min(old, d - p.old);
    now = Math.min(now, d - p.now);
    step3 = Math.min(step3, d - p.step3);
  }
  return { old, now, step3 };
}

const all = [...BUILDING_PLACEMENTS.map((b) => ({ ...b, src: 'hand' })), ...FILL_PLACEMENTS.map((b) => ({ ...b, src: 'fill' }))];
const rows = all.map((b) => ({ b, ...clearance(b) })).filter((r) => r.old < 1e8);
const count = (f: (r: (typeof rows)[number]) => boolean): number => rows.filter(f).length;
console.log(`road samples ${samples}, buildings checked ${rows.length} of ${all.length} (hand placed ${BUILDING_PLACEMENTS.length}, fill ${FILL_PLACEMENTS.length})`);
console.log(`footpath drawn today ${WALK} m; Step 3 target footpath ${FOOT_TARGET.toFixed(2)} m; wanted gap outside the footpath ${NEED} m`);
console.table([
  { widths: 'OLD (before Step 1)', roadReachesFootprint: count((r) => r.old < 0), gapUnder1_5m: count((r) => r.old < NEED), minGap: Math.min(...rows.map((r) => r.old)).toFixed(2) },
  { widths: 'NEW (Step 1, footpath 3 m)', roadReachesFootprint: count((r) => r.now < 0), gapUnder1_5m: count((r) => r.now < NEED), minGap: Math.min(...rows.map((r) => r.now)).toFixed(2) },
  { widths: 'NEW + Step 3 footpath', roadReachesFootprint: count((r) => r.step3 < 0), gapUnder1_5m: count((r) => r.step3 < NEED), minGap: Math.min(...rows.map((r) => r.step3)).toFixed(2) },
]);
const worse = rows.filter((r) => r.now < NEED && r.old >= NEED).sort((a, b) => a.now - b.now);
console.log(`\nbuildings whose gap fell below ${NEED} m because of Step 1: ${worse.length}`);
for (const r of worse.slice(0, 25)) console.log(`  ${r.b.src} ${r.b.id} at (${r.b.x.toFixed(0)}, ${r.b.z.toFixed(0)}) zone ${r.b.zone}: gap old ${r.old.toFixed(2)} m, new ${r.now.toFixed(2)} m, with Step 3 footpath ${r.step3.toFixed(2)} m`);
const reached = rows.filter((r) => r.now < 0 && r.old >= 0);
console.log(`\nbuildings that the road now REACHES (new gap < 0, old gap >= 0): ${reached.length}`);
const zones = new Map<string, number>();
for (const r of worse) zones.set(r.b.zone, (zones.get(r.b.zone) ?? 0) + 1);
console.log('by zone:', JSON.stringify(Object.fromEntries(zones)));
console.log('sections:', DIVIDED_SECTIONS.map((d) => `${d.id} hw ${d.halfWidth.toFixed(2)}`).join(', '));
console.log('\n(report only: no building was moved)');
for (const r of rows.filter((q) => q.now < 0)) console.log(`REACHED ${r.b.src} ${r.b.id} (${r.b.x}, ${r.b.z}) zone ${r.b.zone}: gap old ${r.old.toFixed(2)} m, new ${r.now.toFixed(2)} m`);
