// STEP 4: picks the road-side sites of the fuel stations and charge points along the main roads and writes src/parking/RoadStationSites.ts (data only, like gen-farm-fields.ts).
//   npx tsx scripts/gen-road-stations.ts          (writes the file)       npx tsx scripts/gen-road-stations.ts --check   (only prints, writes nothing)
// Rule: M8 every ~3 km, one pair on each J1 road and on the main 6-lane / 4-lane roads, 1 charge point (+ a fuel station in the 4 big ones) in each residential area. A pair = ONE fuel station on one side and ONE charge point on the other side. A candidate must be dry, flat, clear of other roads / the railway / bridges / placed buildings / facilities, on a straight bit of road.
// ONE charge point on the other side. A candidate must be dry, flat, clear of other roads / the railway / bridges / placed buildings / facilities, on a straight bit of road.
// The site frame: centre (x, z), yaw as in three.js (local +z points at the road, local +x runs along it); see src/parking/StationLayout.ts.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt } from '../src/city/WorldZones';
import { placementContains } from '../src/buildings/Placements';
import { MAIN_STATION_LOT, PARKING_LOTS, worldToLot } from '../src/parking/ParkingSite';

const GAP = 4.5; // paved driveway between the road shoulder and the lot edge
const DIMS = { fuel: { hw: 16, hd: 13 }, cp: { hw: 4, hd: 2 }, cpbus: { hw: 6, hd: 1.75 } } as const;
const BAD_ZONES = new Set(['sea', 'airport', 'army', 'seaport', 'engineering', 'wetland', 'mountain', 'coast', 'urban-core']);
const SPACING = 2000;
/** Steepest road grade (rise / run) for a site: the pad follows the road, so the lot slopes by this much along the road. */
const MAX_GRADE = 0.03;
const bn = (n: number): string => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

const g = new TerrainGenerator(Config.world.seed);
g.stationPads.enabled = false; // look at the ground as it is WITHOUT the pads (the pads are made from the result)
const sc = g.makeSample();
const roads = g.roads.roads;
const hwy = (n: string) => roads.find((r) => r.name === n && r.tier === 1)!;

interface Cand { x: number; z: number; yaw: number; rx: number; rz: number; y: number; slope: number }
function frame(r: ReturnType<typeof hwy>, i: number, side: 1 | -1, hw: number, hd: number): Cand {
  const nx = r.nx[i], nz = r.nz[i];
  const edge = r.halfWidth + r.shoulder;
  const off = edge + GAP + hd;
  const rx = -side * nx, rz = -side * nz; // from the site towards the road
  return { x: r.xs[i] + side * nx * off, z: r.zs[i] + side * nz * off, yaw: Math.atan2(rx, rz), rx, rz, y: r.ys[i], slope: gradeAlong(r, i, rz, -rx) };
}
/** Grade of the road (rise per metre) in the direction (dx, dz) around point i, over +-24 m: the level pad is tilted by it so it follows the road. */
function gradeAlong(r: ReturnType<typeof hwy>, i: number, dx: number, dz: number): number {
  const span = Math.max(1, Math.round(24 / r.step));
  const i0 = Math.max(0, i - span), i1 = Math.min(r.xs.length - 1, i + span);
  const grade = (r.ys[i1] - r.ys[i0]) / (r.cum[i1] - r.cum[i0]);
  const tx = r.xs[i1] - r.xs[i0], tz = r.zs[i1] - r.zs[i0];
  return (tx * dx + tz * dz >= 0 ? 1 : -1) * grade;
}
const toWorld = (c: Cand, x: number, z: number): [number, number] => [c.x + x * c.rz + z * c.rx, c.z - x * c.rx + z * c.rz];

function valid(r: ReturnType<typeof hwy>, i: number, c: Cand, hw: number, hd: number, kind: 'fuel' | 'cp', others: Cand[]): string {
  // road: straight, gentle, no bridge
  const span = Math.ceil((hw + 40) / r.step);
  const i0 = Math.max(0, i - span), i1 = Math.min(r.xs.length - 1, i + span);
  for (let k = i0; k <= i1; k++) if (r.bridgeOf[k] >= 0) return 'bridge';
  const a0 = Math.atan2(r.zs[i] - r.zs[i0], r.xs[i] - r.xs[i0]), a1 = Math.atan2(r.zs[i1] - r.zs[i], r.xs[i1] - r.xs[i]);
  let da = Math.abs(a1 - a0);
  if (da > Math.PI) da = 2 * Math.PI - da;
  if (da > 0.3) return 'curve';
  if (Math.abs(r.ys[i1] - r.ys[i0]) / (r.cum[i1] - r.cum[i0]) > MAX_GRADE) return 'steep road';
  // ground under the lot + the driveway, measured against the tilted pad plane
  const floor = r.ys[i], slope = c.slope;
  let lo = 1e9, hi = -1e9;
  for (let x = -hw; x <= hw + 0.01; x += 2) {
    for (let z = -hd; z <= hd + GAP + 0.01; z += 2) {
      const [wx, wz] = toWorld(c, x, z);
      g.sample(wx, wz, sc);
      if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.5) return 'wet';
      const dh = sc.h - (floor + slope * x);
      lo = Math.min(lo, dh);
      hi = Math.max(hi, dh);
      if (placementContains(wx, wz, 8)) return 'building';
      const zone = getWorldZoneAt(wx, wz).kind;
      if (BAD_ZONES.has(zone)) return 'zone ' + zone;
      const L = worldToLot(wx, wz);
      for (const l of [...PARKING_LOTS, MAIN_STATION_LOT]) if (L.s > l.s0 - 12 && L.s < l.s1 + 12 && L.n > l.n0 - 12 && L.n < l.n1 + 12) return 'lot ' + l.id;
    }
  }
  // the pad is level at the road surface height: limit the cut / fill (and the slope across the lot)
  if (hi > 5.5 || lo < -5.5 || hi - lo > 8) return `cut/fill ${hi.toFixed(1)} / ${(-lo).toFixed(1)}`;
  // other roads / the railway keep away (the host road is allowed beside the driveway only)
  const inRegion = (wx: number, wz: number, m: number): boolean => {
    const dx = wx - c.x, dz = wz - c.z;
    const lx = dx * c.rz - dz * c.rx, lz = dx * c.rx + dz * c.rz;
    return Math.abs(lx) < hw + m && lz > -hd - m && lz < hd + GAP + m;
  };
  for (const o of roads) {
    const host = o.id === r.id;
    for (let k = 0; k < o.xs.length; k++) {
      if (Math.abs(o.xs[k] - c.x) > 80 || Math.abs(o.zs[k] - c.z) > 80) continue;
      if (host ? inRegion(o.xs[k], o.zs[k], -1) : inRegion(o.xs[k], o.zs[k], 10)) return 'road ' + o.name;
    }
  }
  for (const e of g.rail.edges) for (let k = 0; k < e.xs.length; k++) if (inRegion(e.xs[k], e.zs[k], 25)) return 'rail';
  for (const q of others) if (Math.hypot(q.x - c.x, q.z - c.z) < 60) return 'near another site';
  return '';
}

interface Site { y: number; slope: number; id: string; kind: 'fuel' | 'charge'; nameBn: string; x: number; z: number; yaw: number; hw: number; hd: number; gap: number; road: string }
const sites: Site[] = [];
const placed: Cand[] = [];
let nFuel = 0, nCp = 0;
const log: string[] = [];
const byName = (n: string) => roads.find((r) => r.name === n);

/** Puts one site of `kind` on road r at index i (side `pref` first, then the other side). Returns true when a valid spot was found. */
function put(r: ReturnType<typeof hwy>, i: number, kind: 'fuel' | 'cp', pref: 1 | -1, only = false): boolean {
  for (const side of (only ? [pref] : [pref, -pref]) as (1 | -1)[]) {
    const bus = kind === 'cp' && (nCp + 1) % 3 === 0;
    const d = kind === 'fuel' ? DIMS.fuel : bus ? DIMS.cpbus : DIMS.cp;
    const c = frame(r, i, side, d.hw, d.hd);
    if (valid(r, i, c, d.hw, d.hd, kind, placed)) continue;
    const n = kind === 'fuel' ? ++nFuel : ++nCp;
    sites.push({
      id: kind === 'fuel' ? `station-${n}` : `cp-${String(n).padStart(2, '0')}`,
      kind: kind === 'fuel' ? 'fuel' : 'charge',
      nameBn: kind === 'fuel' ? `স্টেশন ${bn(n)}` : `চার্জ পয়েন্ট ${bn(n)}`,
      y: Math.round(c.y * 100) / 100, slope: Math.round(c.slope * 1e4) / 1e4, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, yaw: Math.round(c.yaw * 1e4) / 1e4, hw: d.hw, hd: d.hd, gap: GAP, road: r.name,
    });
    placed.push(c);
    return true;
  }
  return false;
}

/** A fuel station + a charge point on road `name`, as near the distance `t` (m from the road start) as possible (search +-`reach` m, both ways). */
let flip: 1 | -1 = 1;
function pair(name: string, t: number, reach = 2200, only?: 'fuel' | 'cp'): void {
  const r = byName(name);
  if (!r) { log.push(`${name}: ROAD NOT FOUND`); return; }
  flip = flip === 1 ? -1 : 1;
  // BOTH sides of the road: a fuel station and a charge point on each side (the 2nd side is found near the 1st, a bit along the road if needed)
  for (const side of [flip, -flip] as const) {
    for (const kind of (only ? [only] : ['fuel', 'cp']) as ('fuel' | 'cp')[]) {
      let done = false;
      for (let off = 0; off <= reach && !done; off += 40) {
        for (const sg of off === 0 ? [1] : [1, -1]) {
          const tt = t + sg * off;
          if (tt < 150 || tt > r.length - 150) continue;
          const i = r.cum.findIndex((v) => v >= tt);
          if (i >= 0 && put(r, i, kind, side, true)) { done = true; break; }
        }
      }
      if (!done) log.push(`${name}@${Math.round(t)} ${kind} side ${side}: NO SITE`);
    }
  }
}

// 1) the 8-lane RING ROAD M8: a pair about every 3 km
{
  const m8 = byName('M8')!;
  for (let t = 1500; t < m8.length - 500; t += 3000) pair('M8', t, 2000);
}
// 2) the four 8-lane roads out of J1, the 6-lane and the 4-lane main roads: a pair in the middle of each
for (const n of ['J1-N', 'J1-E', 'J1-S', 'J1-W']) pair(n, byName(n)!.length * 0.5);
for (const n of ['R6-2', 'R6-15', 'R6-10', 'R6-11', 'M6-1']) pair(n, byName(n)!.length * 0.5);
for (const n of ['R4-9', 'R4-19', 'R4-12', 'R4-6']) pair(n, byName(n)!.length * 0.5, 1500);
// make-up pairs where one side of a road above found no dry / straight site (M8 fuel, R6-2 charge, R6-15 fuel, R4-9 fuel)
for (const n of ['R6-3', 'R6-9', 'R4-1', 'R4-8']) pair(n, byName(n)!.length * 0.5, 1000);

// 3) the residential areas (HANDOFF_RESIDENTIAL.md section 2): 1 charge point in each, + 1 fuel station in the 4 big ones
const AREAS: { id: string; x: number; z: number; r: number; fuel: boolean }[] = [
  { id: 'se-dense', x: 1150, z: 1150, r: 600, fuel: true },
  { id: 'west-homes', x: -1550, z: 0, r: 620, fuel: true },
  { id: 'sw-homes', x: -1150, z: 1150, r: 600, fuel: false },
  { id: 'east-homes', x: 1550, z: 60, r: 600, fuel: true },
  { id: 'south-suburb', x: 450, z: 2250, r: 550, fuel: true },
  { id: 'sw-newtown', x: -1900, z: 1750, r: 650, fuel: false },
  { id: 'west-suburb', x: -2450, z: 500, r: 500, fuel: false },
  { id: 'RA-N', x: 1030, z: -2365, r: 520, fuel: false },
  { id: 'RA-SW', x: -3150, z: 1500, r: 520, fuel: false },
];
for (const a of AREAS) {
  const cand: { r: (typeof roads)[number]; i: number; d: number }[] = [];
  for (const r of roads) {
    if (r.kind === 'ramp' || r.kind === 'roundabout') continue;
    for (let i = 0; i < r.xs.length; i += Math.max(2, Math.round(30 / r.step))) {
      const d = Math.hypot(r.xs[i] - a.x, r.zs[i] - a.z);
      if (d < a.r * 1.4) cand.push({ r, i, d });
    }
  }
  cand.sort((p, q) => p.d - q.d);
  for (const kind of (a.fuel ? ['fuel', 'cp'] : ['cp']) as ('fuel' | 'cp')[]) {
    let done = false;
    for (const c of cand) { if (put(c.r, c.i, kind, 1)) { done = true; break; } }
    if (!done) log.push(`${a.id} ${kind}: NO SITE (${cand.length} candidates)`);
  }
}

console.log(`${nFuel} fuel stations + ${nCp} charge points`);
for (const s of sites) console.log(`  ${s.id.padEnd(10)} ${s.road.padEnd(8)} (${s.x}, ${s.z})  ${s.hw * 2}x${s.hd * 2}`);
for (const l of log) console.log('  note: ' + l);

if (!process.argv.includes('--check')) {
  const rows = sites.map((s) => `  { id: '${s.id}', kind: '${s.kind}', nameBn: '${s.nameBn}', x: ${s.x}, z: ${s.z}, y: ${s.y}, slope: ${s.slope}, yaw: ${s.yaw}, hw: ${s.hw}, hd: ${s.hd}, gap: ${s.gap}, road: '${s.road}' },`).join('\n');
  writeFileSync(
    new URL('../src/parking/RoadStationSites.ts', import.meta.url),
    (`// GENERATED by scripts/gen-road-stations.ts (npx tsx scripts/gen-road-stations.ts) - do not edit by hand. Data only (no three.js), so the chunk workers can use it too.
// STEP 4: the fuel stations and charge points along the main roads (M8 ring, J1-N/E/S/W, R6, R4, residential areas). Site frame: centre (x, z), yaw = three.js rotation.y of the site group; local +z
// points at the road, local +x runs along it (see StationLayout.ts). hw / hd = half size along / across the road (m), gap = paved driveway to the road shoulder (m).
export interface RoadStationSite {
  id: string;
  /** 'fuel' = station (fuel AND charge, tanker unload); 'charge' = charge point (electric only). */
  kind: 'fuel' | 'charge';
  nameBn: string;
  x: number;
  z: number;
  /** Floor height (m) of the level pad = the host road's surface height here. */
  y: number;
  /** Grade of the pad along local +x (rise per metre): the pad is tilted to follow the road. */
  slope: number;
  yaw: number;
  hw: number;
  hd: number;
  gap: number;
  road: string;
}

export const ROAD_STATION_SITES: ReadonlyArray<RoadStationSite> = [
${rows}
];
`).replace(/\r?\n/g, '\r\n'),
  );
  console.log('written src/parking/RoadStationSites.ts');
}
