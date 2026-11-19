// BUILDINGS ON ROADS / RAILWAY: lists every placed building (hand placed, city fill, residential) whose footprint (W x D incl. yard, turned by yaw)
// lies on a road (ribbon + shoulder / footpath edge) of the REAL network with every new road switched ON, or inside the railway corridor.
// Report only. Run: npx tsx scripts/building-on-road-check.ts [--json out.json]
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from '../src/buildings/Placements';
import { DRAWN_FILL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { writeFileSync } from 'node:fs';

const gen: any = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const rail = gen.railForm;
const WALK = Config.city.roadside.sidewalk;
const C = Config.city.roadSections;
const FOOT = C.highway.kerbW + C.highway.verge + C.highway.walk;
const CELL = 100;

interface P { x: number; z: number; w: number; name: string }
const grid = new Map<string, P[]>();
for (const r of R.roads) {
  if (r.earth) continue;
  for (let i = 1; i < r.xs.length; i++) {
    const L = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t, z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      const city = R.isCityPoint(x, z) || r.tier === 4;
      const w = r.halfWidth + (city ? Math.max(FOOT, r.shoulder, WALK) : r.shoulder);
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      const a = grid.get(key);
      const p = { x, z, w, name: r.name ?? String(r.id) };
      if (a) a.push(p); else grid.set(key, [p]);
    }
  }
}
function near(x: number, z: number, rad: number): P[] {
  const out: P[] = [];
  for (let a = Math.floor((x - rad) / CELL); a <= Math.floor((x + rad) / CELL); a++) for (let b = Math.floor((z - rad) / CELL); b <= Math.floor((z + rad) / CELL); b++) { const g = grid.get(`${a},${b}`); if (g) out.push(...g); }
  return out;
}
/** gap (m) between the footprint rectangle and the nearest road edge (negative = the road reaches the footprint) + the road name */
function roadGap(b: BuildingPlacement): { gap: number; road: string } {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.W / 2, hz = b.D / 2;
  let gap = 1e9, road = '';
  for (const p of near(b.x, b.z, Math.hypot(hx, hz) + 40)) {
    const dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const d = Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0));
    if (d - p.w < gap) { gap = d - p.w; road = p.name; }
  }
  return { gap, road };
}
/** share of footprint grid points (every 3 m) inside the rail corridor */
function railHit(b: BuildingPlacement): number {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  let n = 0, hit = 0;
  for (let lx = -b.W / 2; lx <= b.W / 2 + 1e-6; lx += Math.max(1, b.W / Math.ceil(b.W / 3)))
    for (let lz = -b.D / 2; lz <= b.D / 2 + 1e-6; lz += Math.max(1, b.D / Math.ceil(b.D / 3))) {
      n++;
      if (rail.inCorridor(b.x + lx * c + lz * s, b.z - lx * s + lz * c, 0)) hit++;
    }
  return hit / Math.max(1, n);
}

const all = [...BUILDING_PLACEMENTS.map((b, i) => ({ b, src: 'hand', i })), ...DRAWN_FILL_PLACEMENTS.map((b, i) => ({ b, src: 'fill', i }))];
const out: any[] = [];
for (const { b, src, i } of all) {
  const g = roadGap(b), rh = railHit(b);
  if (g.gap < 0 || rh > 0) out.push({ src, i, id: b.id, x: b.x, z: b.z, W: b.W, D: b.D, yaw: b.yaw, zone: b.zone, seed: b.seed, roadGap: +g.gap.toFixed(2), road: g.road, railShare: +rh.toFixed(2) });
}
console.log(`buildings checked ${all.length} (hand ${BUILDING_PLACEMENTS.length}, fill ${DRAWN_FILL_PLACEMENTS.length}); on a road ${out.filter((o) => o.roadGap < 0).length}; in the rail corridor ${out.filter((o) => o.railShare > 0).length}; total flagged ${out.length}`);
for (const o of out) console.log(`${o.src} ${o.id} (${o.x}, ${o.z}) ${o.W}x${o.D} zone ${o.zone}: road gap ${o.roadGap} m (${o.road}), rail ${Math.round(o.railShare * 100)} %`);
const j = process.argv.indexOf('--json');
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
