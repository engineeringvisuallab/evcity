// ROAD SIGN BOARDS - Step 2: picks the places of the overhead sign gantries on ALL roads and writes src/signs/RoadSignData.ts (data only, like gen-road-stations.ts).
//   npx tsx scripts/gen-road-signs.ts          (writes the file)       npx tsx scripts/gen-road-signs.ts --check   (only prints, writes nothing)
// Step 2 / 3 = only the STANDS and the empty board (no destination text, no maxim yet: the user writes them later, after the lengths are measured).
// Rule: every road (not earth, not a ramp, not a roundabout) of 400 m or more gets one gantry, long roads one per ~2.5 km (M8 one per ~3 km). A candidate must be: on a straight, gentle bit
// of road, no bridge near, dry, not in a bad zone, no building / parking lot / fuel station / charge point under or near the posts, no OTHER road within 120 m (6 / 8 lane) or 50 m (2 / 4 lane) (so no junction), no railway
// within 30 m, and its foot ground within +-7 m of the road surface. The search moves along the road from the ideal spot up to +-880 m; a road with no valid spot is listed.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt } from '../src/city/WorldZones';
import { placementContains } from '../src/buildings/Placements';
import { ROADSIDE_ALL } from '../src/buildings/PlacementsRoadside';
import { MAIN_STATION_LOT, PARKING_LOTS, worldToLot } from '../src/parking/ParkingSite';
import { ROAD_STATION_SITES } from '../src/parking/RoadStationSites';
import { GANTRY, gantryLayout } from '../src/signs/RoadSignSpec';

const BAD_ZONES = new Set(['sea', 'airport', 'army', 'seaport', 'engineering', 'wetland', 'mountain', 'coast']);
const MIN_LEN = 300; // shortest road that gets a gantry (m)
const EVERY = 2500; // one gantry per this length (m); M8 uses EVERY_M8
const EVERY_M8 = 3000;
const STRAIGHT = 0.12; // max heading change (rad) over +-70 m
const MAX_GRADE = 0.03;
const MAX_FOOT = 7; // |ground - road surface| at a post foot (m)
const SPACING = 600; // between two gantries of the same road (m); gantries of different roads keep 150 m
const CELL = 130;
const check = process.argv.includes('--check');

const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample();
const roads = g.roads.roads;
const log: string[] = [];

/** Grid of all road points (other roads) and rail points, so the neighbour checks do not scan everything. */
const roadGrid = new Map<string, { x: number; z: number; id: number; name: string }[]>();
const railGrid = new Map<string, { x: number; z: number }[]>();
const key = (x: number, z: number): string => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
for (const o of roads) {
  if (o.earth) continue;
  for (let k = 0; k < o.xs.length; k++) {
    const kk = key(o.xs[k], o.zs[k]);
    let l = roadGrid.get(kk);
    if (!l) roadGrid.set(kk, (l = []));
    l.push({ x: o.xs[k], z: o.zs[k], id: o.id, name: o.name });
  }
}
for (const e of g.rail.edges) {
  for (let k = 0; k < e.xs.length; k++) {
    const kk = key(e.xs[k], e.zs[k]);
    let l = railGrid.get(kk);
    if (!l) railGrid.set(kk, (l = []));
    l.push({ x: e.xs[k], z: e.zs[k] });
  }
}
function near<T extends { x: number; z: number }>(grid: Map<string, T[]>, x: number, z: number, reach: number, fn: (p: T) => boolean): boolean {
  const c = Math.ceil(reach / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) for (const p of grid.get(cx + i + ',' + (cz + j)) ?? []) if (fn(p)) return true;
  return false;
}

interface Spot { id: string; road: string; s: number; x: number; y: number; z: number; yaw: number; edge: number; feetL: number; feetR: number; boardW: number; sections: number }
const spots: Spot[] = [];

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function frameAt(r: (typeof roads)[number], i: number): { tx: number; tz: number } {
  const i0 = Math.max(0, i - 1), i1 = Math.min(r.xs.length - 1, i + 1);
  const dx = r.xs[i1] - r.xs[i0], dz = r.zs[i1] - r.zs[i0];
  const l = Math.hypot(dx, dz) || 1;
  return { tx: dx / l, tz: dz / l };
}

/** '' when the gantry at point i of road r is allowed, else the reason. Fills `out` with the post foot heights. */
function valid(r: (typeof roads)[number], i: number, out: { feetL: number; feetR: number }): string {
  const lay = gantryLayout(r.halfWidth, r.shoulder, r.lanes);
  // big roads (6 / 8 lane) are judged over +-70 m, small roads (2 / 4 lane) over +-35 m with looser limits
  const big = r.lanes >= 6;
  const span = Math.ceil((big ? 70 : 35) / r.step);
  const i0 = i - span, i1 = i + span;
  if (i0 < 0 || i1 >= r.xs.length) return 'road end';
  for (let k = i0; k <= i1; k++) if (r.bridgeOf[k] >= 0) return 'bridge';
  const a0 = Math.atan2(r.zs[i] - r.zs[i0], r.xs[i] - r.xs[i0]), a1 = Math.atan2(r.zs[i1] - r.zs[i], r.xs[i1] - r.xs[i]);
  let da = Math.abs(a1 - a0);
  if (da > Math.PI) da = 2 * Math.PI - da;
  if (da > (big ? STRAIGHT : 0.25)) return 'curve';
  if (Math.abs(r.ys[i1] - r.ys[i0]) / (r.cum[i1] - r.cum[i0]) > (big ? MAX_GRADE : 0.06)) return 'steep road';
  const { tx, tz } = frameAt(r, i);
  const rx = -tz, rz = tx; // driver's right
  const px = r.xs[i], pz = r.zs[i];
  // other roads: none within 120 m of the gantry (no junction, no side road under the beam), railway none within 30 m of the beam line
  const clear = big ? 120 : 50;
  if (near(roadGrid, px, pz, clear, (p) => p.id !== r.id && Math.hypot(p.x - px, p.z - pz) < clear)) return 'other road';
  const ax = px - rx * (lay.edge + 3), az = pz - rz * (lay.edge + 3), bx = px + rx * (lay.edge + 3), bz = pz + rz * (lay.edge + 3);
  if (near(railGrid, px, pz, lay.edge + 40, (p) => distToSegment(p.x, p.z, ax, az, bx, bz) < 30)) return 'rail';
  for (const st of ROAD_STATION_SITES) if (Math.hypot(st.x - px, st.z - pz) < 70) return 'station ' + st.id;
  for (const q of spots) if (Math.hypot(q.x - px, q.z - pz) < (q.road === r.name ? SPACING : 150)) return 'near another gantry';
  const feet: number[] = [];
  for (const sg of [-1, 1]) {
    // ground under the post and the base, and along the beam line every 4 m outside the road (water / buildings / zone)
    for (let lat = lay.edge * sg - 1.6; Math.abs(lat) <= lay.edge + 1.7; lat += 4) {
      if (Math.abs(lat) < r.halfWidth) continue;
      const wx = px + rx * lat, wz = pz + rz * lat;
      g.sample(wx, wz, sc);
      if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.5) return 'wet';
      if (placementContains(wx, wz, 6)) return 'building';
      for (const b of ROADSIDE_ALL) if (Math.hypot(wx - b.x, wz - b.z) < Math.hypot(b.W, b.D) / 2 + 8) return 'roadside building ' + b.id; // city roadside rows, with the whole footprint circle (safe side)
      const zone = getWorldZoneAt(wx, wz).kind;
      if (BAD_ZONES.has(zone)) return 'zone ' + zone;
      const L = worldToLot(wx, wz);
      for (const l of [...PARKING_LOTS, MAIN_STATION_LOT]) if (L.s > l.s0 - 10 && L.s < l.s1 + 10 && L.n > l.n0 - 10 && L.n < l.n1 + 10) return 'lot ' + l.id;
    }
    g.sample(px + rx * lay.edge * sg, pz + rz * lay.edge * sg, sc);
    const rel = sc.h - r.ys[i];
    if (Math.abs(rel) > MAX_FOOT) return `foot ${rel.toFixed(1)} m`;
    feet.push(rel);
  }
  out.feetL = feet[0];
  out.feetR = feet[1];
  return '';
}

const none: string[] = [];
let n = 0;
const list = roads.filter((r) => !r.earth && r.kind !== 'ramp' && r.kind !== 'roundabout' && r.length >= MIN_LEN).sort((a, b) => (a.name === 'M8' ? -1 : b.name === 'M8' ? 1 : b.lanes - a.lanes || b.length - a.length));
for (const r of list) {
  const count = Math.max(1, Math.round(r.length / (r.name === 'M8' ? EVERY_M8 : EVERY)));
  for (let c = 0; c < count; c++) {
    const target = Math.round((((c + 0.5) * r.length) / count) / r.step);
    let done = false;
    const why = new Map<string, number>();
    for (let d = 0; d <= 110 && !done; d++) {
      for (const sg of d === 0 ? [1] : [1, -1]) {
        const i = target + sg * d;
        if (i < 0 || i >= r.xs.length) continue;
        const feet = { feetL: 0, feetR: 0 };
        const bad = valid(r, i, feet);
        if (bad) { why.set(bad, (why.get(bad) ?? 0) + 1); continue; }
        const lay = gantryLayout(r.halfWidth, r.shoulder, r.lanes);
        const { tx, tz } = frameAt(r, i);
        const yaw = Math.atan2(-tx, -tz);
        n++;
        spots.push({
          id: 'sign-' + n, road: r.name, s: Math.round(r.cum[i]), x: Math.round(r.xs[i] * 10) / 10, y: Math.round(r.ys[i] * 100) / 100, z: Math.round(r.zs[i] * 10) / 10,
          yaw: Math.round(yaw * 10000) / 10000, edge: Math.round(lay.edge * 100) / 100, feetL: Math.round(feet.feetL * 100) / 100, feetR: Math.round(feet.feetR * 100) / 100, boardW: lay.boardW, sections: lay.sections,
        });
        log.push(`sign-${n} on ${r.name} (${r.lanes} lane, one board ${lay.boardW} m, ${lay.sections} sections) s ${Math.round(r.cum[i])} (moved ${sg * d * r.step} m)`);
        done = true;
        break;
      }
    }
    if (!done) none.push(`${r.name} (${r.lanes} lane, ${Math.round(r.length)} m) #${c + 1}: ${[...why].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([k, v]) => k + ' x' + v).join(', ')}`);
  }
}
console.log(log.join('\n'));
console.log(`\nNO valid place (${none.length}):\n` + none.join('\n'));
const byRoadCount = new Set(spots.map((s) => s.road)).size;
console.log(`\n${spots.length} gantries on ${byRoadCount} of ${list.length} roads (post gap ${GANTRY.postGap} m, clearance ${GANTRY.clearance} m)`);

const head = `// GENERATED by scripts/gen-road-signs.ts (npx tsx scripts/gen-road-signs.ts) - do not edit by hand. Data only (no three.js).
// STEP 3: the stands and the ONE long EMPTY board per gantry (coloured sections, no destination text, no maxim: they come later, see HANDOFF_ROAD_DESIGN.md section 23).
// Gantry frame: origin on the road centreline at the road surface height (x, y, z), turned by yaw (three.js rotation.y); +X = driver's right for growing s, +Z = towards the traffic of
// growing s (face of board A). edge = lateral distance of each post axis, boardW = width of the one long board (post to post), sections = coloured sections across it, feetL / feetR = ground height of the
// post feet relative to the road surface.
export interface RoadSignSpot {
  id: string;
  road: string;
  s: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  edge: number;
  feetL: number;
  feetR: number;
  boardW: number;
  sections: number;
}

export const ROAD_SIGN_SPOTS: ReadonlyArray<RoadSignSpot> = ${JSON.stringify(spots).replace(/"([a-zA-Z]+)":/g, '$1:').replace(/"/g, "'").replace(/\},\{id:/g, '},\n  {id:').replace(/^\[\{id:/, "[\n  {id:").replace(/\}\]$/, '}\n]')};
`;
if (!check) {
  writeFileSync('src/signs/RoadSignData.ts', head.replace(/\n/g, '\r\n'));
  console.log('wrote src/signs/RoadSignData.ts');
}
