// STEP 6.1a (headless): J1 SITE CHECK. J1 = the ONE junction of the four 8-lane (M8) radials inside the city.
// DECISION 2026-11-13: J1 is 8 x 8 lane but AT GROUND LEVEL: no flyover, no ramps, one big "+" crossing (signalised, planned exception to rule X1).
// This script reads the real world (natural ground, real rail plan, rivers, world zones, SITE0 city plan) and changes nothing.
// For each candidate point it checks: ground flatness, water, rail clearance, what the city plan has under the J1 footprint, and the four arms
// (bearing, straight-line length, common yaw, bends, rail crossings of the straight lines = warning only, because the real arms will be curved in 6.1b).
// Run: npx tsx scripts/j1-site-check.ts <out-dir>     writes j1_site.json (for tools/j1-site-plot.py) and prints the tables.
import { mkdirSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
import { getWorldZoneAt, FACILITIES } from '../src/city/WorldZones';
import { SITE_TEMPLATES, type AreaShape } from '../src/city/CityPlan';
import { decelLength, laneDropTaper } from '../src/roads/standards/Checks';
import { SECTION_M8 } from '../src/roads/standards/SectionTable';

// ---- design inputs (all PROPOSALS of this step, to be replaced by the calculation sheets of 6.1b and 6.2)
const FOOT = 300; // half size (m) of the working footprint of the at-grade J1: box + corner radii + approach flare + turn pockets + queue storage
const ARM_STRAIGHT = 500; // m of straight, perpendicular road on each arm next to J1 (the stack needed 1000 m; at grade less is needed, final number in 6.1b)
const RAIL_BUFFER = 50; // m, J1 footprint keeps this far from any track (15.4 rule 3)
const RAIL_ARM_OUT = 300; // m, a rail crossing of an arm lies at least this far outside the straight zone (15.4 rule 1)
const MAX_SLOPE = 3; // % steepest 50 m step inside the footprint (signalised junction, planning limit)
const MAX_BEND = 20; // deg, bend of an arm between its straight perpendicular part and the ring point (15.3 says about 16, 21.6 was rejected)
const MIN_ARM = 1500; // m straight-line length of an arm (room for the straight + spiral-arc-spiral + the ring side)

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const f0 = (v: number): string => v.toFixed(0);
const f1 = (v: number): string => v.toFixed(1);
const deg = 180 / Math.PI;
const wrap = (a: number): number => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };

const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): { h: number; wet: boolean } => { gen.sampleNatural(x, z, sc); return { h: sc.h, wet: !Number.isNaN(sc.water) && sc.h < sc.water - 0.05 }; };

// ---- the real railway as 10 m samples (id, x, z) and as segments
interface RailPt { id: string; x: number; z: number }
const railPts: RailPt[] = [];
interface Seg { id: string; ax: number; az: number; bx: number; bz: number }
const railSegs: Seg[] = [];
for (const e of gen.rail.edges) {
  for (let j = 0; j + 1 < e.xs.length; j++) {
    const ax = e.xs[j], az = e.zs[j], bx = e.xs[j + 1], bz = e.zs[j + 1];
    railSegs.push({ id: e.id, ax, az, bx, bz });
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 10));
    for (let k = 0; k <= n; k++) railPts.push({ id: e.id, x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n });
  }
}

// ---- city plan SITE0 (site hub = map centre, so local = world)
const SITE0 = SITE_TEMPLATES[0];
const inShape = (s: AreaShape, x: number, z: number): boolean => (s.t === 'rect' ? x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1 : Math.hypot(x, z) >= s.r0 && Math.hypot(x, z) < s.r1);
const areaAt = (x: number, z: number): { id: string; density: number } => { for (const a of SITE0) if (inShape(a.shape, x, z)) return { id: a.id, density: a.density }; return { id: 'none', density: 0 }; };

// ---- the four ring points (Step 2.4) and the straight-line arms
const joins = RING_RADIAL_JOINS;
const OFF: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 }; // arm directions of a perfect "+" in game coordinates (x east, z south): E = N + 90 deg
const segX = (ax: number, az: number, bx: number, bz: number, s: Seg): number | null => {
  const d1x = bx - ax, d1z = bz - az, d2x = s.bx - s.ax, d2z = s.bz - s.az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((s.ax - ax) * d2z - (s.az - az) * d2x) / den;
  const u = ((s.ax - ax) * d1z - (s.az - az) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
};

interface Cand { id: string; name: string; x: number; z: number }
const CANDS: Cand[] = [
  { id: 'C0', name: 'city centre', x: 0, z: 0 },
  { id: 'C1', name: 'proposal of 15.3', x: 650, z: -500 },
  { id: 'C2', name: 'NE, nearer the centre', x: 450, z: -350 },
  { id: 'C3', name: 'NE, further out', x: 800, z: -700 },
  { id: 'C4', name: 'east side', x: 900, z: -250 },
  { id: 'C5', name: 'north side', x: 300, z: -600 },
  { id: 'C6', name: 'NW (rejected in 15.3)', x: -500, z: -650 },
  { id: 'C7', name: 'flat pocket north of the centre (from the scan)', x: -50, z: -300 },
  { id: 'C8', name: 'flat pocket north of the centre, nearer the hub', x: 0, z: -250 },
  { id: 'C9', name: 'C8 moved 120 m west and 10 m south along its own axes (J1-a: east approach needs it)', x: -117, z: -277 },
];

interface ArmInfo { dir: string; len: number; bearing: number; bend: number; railX: Array<{ edge: string; dist: number }> }
interface Result {
  cand: Cand; hmin: number; hmax: number; maxSlope: number; meanSlope: number; wet: number; railMin: number; railEdge: string; railBox: number; railBoxEdge: string;
  centralDist: number; riverMin: number; facilityMin: number; zones: string[]; areas: Array<{ id: string; pct: number }>; dense: number;
  yaw: number; maxF: number; arms: ArmInfo[]; checks: Array<{ name: string; ok: boolean; detail: string }>; fails: number; warns: number;
}
const results: Result[] = [];

/** Largest half size F (m, steps of 50) of a box around (cx, cz) that is flat (<= MAX_SLOPE), dry and at least RAIL_BUFFER from every track. 0 when even 100 m fails. */
function maxFootprint(cx: number, cz: number): number {
  let best = 0;
  for (let F = 100; F <= 400; F += 50) {
    const n = (2 * F) / 50; let ok = true;
    const H: number[][] = [];
    for (let i = 0; i <= n && ok; i++) { const row: number[] = []; for (let k = 0; k <= n; k++) { const g = ground(cx - F + i * 50, cz - F + k * 50); if (g.wet) { ok = false; break; } row.push(g.h); } H.push(row); }
    for (let i = 0; i <= n && ok; i++) for (let k = 0; k <= n; k++) {
      if (i < n && (Math.abs(H[i + 1][k] - H[i][k]) / 50) * 100 > MAX_SLOPE) { ok = false; break; }
      if (k < n && (Math.abs(H[i][k + 1] - H[i][k]) / 50) * 100 > MAX_SLOPE) { ok = false; break; }
    }
    if (ok) for (const p of railPts) { const dx = Math.max(Math.abs(p.x - cx) - F, 0), dz = Math.max(Math.abs(p.z - cz) - F, 0); if (Math.hypot(dx, dz) < RAIL_BUFFER) { ok = false; break; } }
    if (!ok) break;
    best = F;
  }
  return best;
}

for (const c of CANDS) {
  // 1. ground over the footprint, 50 m grid
  const n = (2 * FOOT) / 50;
  const H: number[][] = []; let wet = 0;
  for (let i = 0; i <= n; i++) { const row: number[] = []; for (let k = 0; k <= n; k++) { const g = ground(c.x - FOOT + i * 50, c.z - FOOT + k * 50); row.push(g.h); if (g.wet) wet++; } H.push(row); }
  let hmin = Infinity, hmax = -Infinity, maxSlope = 0, sumSlope = 0, ns = 0;
  for (let i = 0; i <= n; i++) for (let k = 0; k <= n; k++) {
    hmin = Math.min(hmin, H[i][k]); hmax = Math.max(hmax, H[i][k]);
    if (i < n) { const s = (Math.abs(H[i + 1][k] - H[i][k]) / 50) * 100; maxSlope = Math.max(maxSlope, s); sumSlope += s; ns++; }
    if (k < n) { const s = (Math.abs(H[i][k + 1] - H[i][k]) / 50) * 100; maxSlope = Math.max(maxSlope, s); sumSlope += s; ns++; }
  }
  // 2. rail: nearest track to the centre and to the footprint box
  let railMin = Infinity, railEdge = '', railBox = Infinity, railBoxEdge = '';
  for (const p of railPts) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < railMin) { railMin = d; railEdge = p.id; }
    const dx = Math.max(Math.abs(p.x - c.x) - FOOT, 0), dz = Math.max(Math.abs(p.z - c.z) - FOOT, 0), db = Math.hypot(dx, dz);
    if (db < railBox) { railBox = db; railBoxEdge = p.id; }
  }
  let centralDist = Infinity;
  for (const st of gen.rail.stations) centralDist = Math.min(centralDist, Math.hypot(st.x - c.x, st.z - c.z) - st.radius);
  // 3. rivers (centre line distance minus the half width of the channel), facilities, zones
  let riverMin = Infinity;
  for (const sg of gen.rivers.segments) {
    const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
    const t = Math.max(0, Math.min(1, ((c.x - sg.ax) * dx + (c.z - sg.az) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(c.x - (sg.ax + t * dx), c.z - (sg.az + t * dz)) - (sg.hwA + (sg.hwB - sg.hwA) * t);
    riverMin = Math.min(riverMin, d);
  }
  let facilityMin = Infinity;
  for (const f of FACILITIES) facilityMin = Math.min(facilityMin, Math.hypot(Math.max(f.x0 - c.x, 0, c.x - f.x1), Math.max(f.z0 - c.z, 0, c.z - f.z1)));
  const zones = new Set<string>();
  for (let x = c.x - FOOT; x <= c.x + FOOT; x += 100) for (let z = c.z - FOOT; z <= c.z + FOOT; z += 100) { const w = getWorldZoneAt(x, z); zones.add(`${w.id} (${w.kind})`); }
  // 4. what the city plan has under the footprint (25 m grid, list order = priority)
  const cnt = new Map<string, number>(); let tot = 0, dense = 0;
  for (let x = c.x - FOOT + 12.5; x < c.x + FOOT; x += 25) for (let z = c.z - FOOT + 12.5; z < c.z + FOOT; z += 25) {
    const a = areaAt(x, z); cnt.set(a.id, (cnt.get(a.id) ?? 0) + 1); tot++; if (a.density >= 4) dense++;
  }
  const areas = [...cnt.entries()].map(([id, k]) => ({ id, pct: (k / tot) * 100 })).sort((p, q) => q.pct - p.pct);
  // 5. arms: bearing, straight-line length, common yaw (least squares over the four arms), bends, rail crossings of the straight lines
  const b = joins.map((j) => Math.atan2(j.z - c.z, j.x - c.x) * deg);
  let sx = 0, sy = 0;
  joins.forEach((j, i) => { const a = (b[i] - OFF[j.dir]) / deg; sx += Math.cos(a); sy += Math.sin(a); });
  const theta = Math.atan2(sy, sx) * deg; // direction of the north arm
  const arms: ArmInfo[] = joins.map((j, i) => {
    const len = Math.hypot(j.x - c.x, j.z - c.z);
    const railX: Array<{ edge: string; dist: number }> = [];
    for (const s of railSegs) { const t = segX(c.x, c.z, j.x, j.z, s); if (t !== null) railX.push({ edge: s.id, dist: t * len }); }
    railX.sort((p, q) => p.dist - q.dist);
    return { dir: j.dir, len, bearing: b[i], bend: wrap(b[i] - (theta + OFF[j.dir])), railX };
  });
  const maxBend = Math.max(...arms.map((a) => Math.abs(a.bend)));
  const minLen = Math.min(...arms.map((a) => a.len));
  const lateRail = arms.flatMap((a) => a.railX.filter((r) => r.dist < ARM_STRAIGHT + RAIL_ARM_OUT).map((r) => `${a.dir}:${r.edge}@${f0(r.dist)}m`));
  const nRailX = arms.reduce((s, a) => s + a.railX.length, 0);

  const checks: Result['checks'] = [];
  const add = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };
  add('ground flat enough (steepest 50 m step in the footprint)', maxSlope <= MAX_SLOPE, `${f1(maxSlope)} % (limit ${MAX_SLOPE} %), height range ${f1(hmax - hmin)} m`);
  add('no water in the footprint', wet === 0, `${wet} wet grid points`);
  add(`rail at least ${RAIL_BUFFER} m from the footprint box`, railBox >= RAIL_BUFFER, `${f0(railBox)} m (${railBoxEdge}), centre to nearest track ${f0(railMin)} m (${railEdge})`);
  add('no facility fence inside the footprint', facilityMin > FOOT, `${f0(facilityMin)} m`);
  add(`every arm bends at most ${MAX_BEND} deg (common yaw)`, maxBend <= MAX_BEND, `max ${f1(maxBend)} deg, yaw ${f1(theta + 90)} deg east of north`);
  add(`every arm at least ${MIN_ARM} m long`, minLen >= MIN_ARM, `shortest ${f0(minLen)} m`);
  let fails = 0; for (const k of checks) if (!k.ok) fails++;
  // warnings (not pass / fail): straight-line rail crossings too near J1, dense city plan under the footprint
  let warns = 0; if (lateRail.length) warns++; if (dense / tot > 0.25) warns++;
  results.push({ cand: c, hmin, hmax, maxSlope, meanSlope: sumSlope / ns, wet, railMin, railEdge, railBox, railBoxEdge, centralDist, riverMin, facilityMin, zones: [...zones], areas, dense: (dense / tot) * 100, yaw: theta + 90, maxF: maxFootprint(c.x, c.z), arms, checks, fails, warns });
  void nRailX;
}

// ---- print
console.log(`J1 SITE CHECK (Step 6.1a)   footprint +-${FOOT} m, arm straight ${ARM_STRAIGHT} m, rail buffer ${RAIL_BUFFER} m, ground = natural terrain, rail = the real generated plan`);
{
  const box = SECTION_M8.pavementEdge + 25 + 3; // M8 pavement half width + corner radius with slip lane (step 8 rule: up to 25 m) + shoulder margin
  const stop = decelLength(60, 0), step = decelLength(100, 60), taper = laneDropTaper(60), storage = 100; // storage = ASSUMED queue length of the right-turn pocket (about 14 cars), replaced by the signal calculation of 6.2
  console.log(`FOOTPRINT SHEET (proposal): half size = box ${f0(box)} m + stop distance from 60 km/h ${f0(stop)} m + queue storage ${storage} m (assumed) + pocket taper (W V^2 / 155) ${f0(taper)} m = ${f0(box + stop + storage + taper)} m  -> FOOT = ${FOOT} m; speed step-down 100 -> 60 km/h needs ${f0(step)} m more (inside the arm straight of ${ARM_STRAIGHT} m)`);
}
console.log(`ring meeting points: ${joins.map((j) => `${j.dir} (${f0(j.x)}, ${f0(j.z)})`).join(', ')}`);
for (const r of results) {
  console.log(`\n=== ${r.cand.id}  (${f0(r.cand.x)}, ${f0(r.cand.z)})  ${r.cand.name}   ground ${f1(r.hmin)}..${f1(r.hmax)} m, mean slope ${f1(r.meanSlope)} %`);
  for (const k of r.checks) console.log(`  ${k.ok ? 'PASS' : 'FAIL'}  ${k.name.padEnd(62)} ${k.detail}`);
  console.log(`  info  Central Station edge ${f0(r.centralDist)} m away, nearest river bank ${f0(r.riverMin)} m, world zones in the footprint: ${r.zones.join(', ')}`);
  console.log(`  info  city plan under the footprint: ${r.areas.filter((a) => a.pct >= 2).map((a) => `${a.id} ${f0(a.pct)} %`).join(', ')}   (dense areas, density 4-5: ${f0(r.dense)} %)`);
  for (const a of r.arms) {
    const early = a.railX.filter((x) => x.dist < ARM_STRAIGHT + RAIL_ARM_OUT);
    console.log(`  arm ${a.dir}  straight-line length ${f0(a.len).padStart(5)} m  bearing ${f0(a.bearing).padStart(5)} deg  bend ${f1(a.bend).padStart(6)} deg  rail crossings of the straight line: ${a.railX.length ? a.railX.map((x) => `${x.edge}@${f0(x.dist)}`).join(' ') : 'none'}${early.length ? '   <-- too near J1 (< ' + (ARM_STRAIGHT + RAIL_ARM_OUT) + ' m): warning' : ''}`);
  }
}
const nm = (v: Result): string => `${v.cand.id}  (${f0(v.cand.x)}, ${f0(v.cand.z)})`;
console.log('\nSUMMARY');
console.log('  point                 fails  warns  max slope  rail to box  max flat box  max bend  shortest arm  dense plan %  rail X of 4 straight arms');
for (const r of results) console.log(`  ${nm(r).padEnd(22)} ${String(r.fails).padStart(4)} ${String(r.warns).padStart(6)} ${f1(r.maxSlope).padStart(9)} % ${f0(r.railBox).padStart(9)} m ${('+-' + r.maxF + ' m').padStart(12)} ${f1(Math.max(...r.arms.map((a) => Math.abs(a.bend)))).padStart(8)} deg ${f0(Math.min(...r.arms.map((a) => a.len))).padStart(10)} m ${f0(r.dense).padStart(11)} % ${String(r.arms.reduce((s, a) => s + a.railX.length, 0)).padStart(14)}`);
const best = [...results].sort((p, q) => p.fails - q.fails || p.warns - q.warns || p.dense - q.dense)[0];
console.log(`\n  lowest fails, then warnings, then dense city plan under the footprint: ${nm(best)}   (the user picks the point)`);

// ---- data for the picture
const al = buildAlignment([...RING_PIS]);
const { samples } = sampleAlignment(al, 20);
writeFileSync(`${out}/j1_site.json`, JSON.stringify({
  foot: FOOT, straight: ARM_STRAIGHT,
  ring: samples.map((p) => [Math.round(p.x), Math.round(p.z)]),
  joins: joins.map((j) => ({ dir: j.dir, x: j.x, z: j.z })),
  rail: gen.rail.edges.map((e) => ({ id: e.id, xs: Array.from(e.xs, Math.round), zs: Array.from(e.zs, Math.round) })),
  stations: gen.rail.stations.map((s) => ({ id: s.id, x: s.x, z: s.z, r: s.radius })),
  rivers: gen.rivers.segments.filter((s) => Math.abs(s.ax) < 3600 && Math.abs(s.az) < 3600).map((s) => [Math.round(s.ax), Math.round(s.az), Math.round(s.bx), Math.round(s.bz)]),
  areas: SITE0.map((a) => ({ id: a.id, shape: a.shape, density: a.density })),
  cands: results.map((r) => ({ maxF: r.maxF, id: r.cand.id, name: r.cand.name, x: r.cand.x, z: r.cand.z, fails: r.fails, warns: r.warns, yaw: r.yaw, best: r === best, arms: r.arms.map((a) => ({ dir: a.dir, bend: a.bend })) })),
}));
let bad = 0; for (const r of results) if (r.fails === 0) bad++;
console.log(`\n${bad} of ${results.length} candidate points pass all pass/fail checks`);
process.exit(0);
