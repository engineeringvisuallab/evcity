// STEP 2.5 (headless): GROUND CHECK of the 8-lane ring (M8). Only reads the world, changes nothing.
// For every 5 m station of the ring it looks at the natural ground (no roads) over the whole right of way (ROW, 40 m each side of the centreline)
// and lists: water, steep ground (3.10 terrain classes), grade along the ring, rivers, railway, zones / facilities, coast and map edge.
// Run: npx tsx scripts/ring-ground-check.ts <out-dir>      writes ring_ground.json (for the picture) and prints the tables.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
import { getWorldZoneAt, coastZ, FACILITIES, BUILT_UP_KINDS } from '../src/city/WorldZones';

const ROW = 40; // m from the centreline to the edge of the right of way (table 3.5)
const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });

const gen = new TerrainGenerator(Config.world.seed);
const al = buildAlignment([...RING_PIS]);
const { ds, samples } = sampleAlignment(al, 5);
const N = samples.length;
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number) => { gen.sampleNatural(x, z, sc); return { h: sc.h, w: sc.water }; };
const isSea = (x: number, z: number, h: number) => h < 0.6 && z > coastZ(x) - 30;

// ---- sample the ground over the ROW: offsets -40..+40 every 10 m (A = left of travel, B = right)
const OFF = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
interface Row { s: number; x: number; z: number; hc: number; hmin: number; hmax: number; cross: number; grade: number; wetC: 0 | 1 | 2; wetRow: boolean; depth: number; wl: number; zone: string; kind: string; inner: 'A' | 'B' }
const rows: Row[] = [];
const H: number[][] = [];
for (let i = 0; i < N; i++) {
  const p = samples[i];
  const nx = -Math.sin(p.h), nz = Math.cos(p.h); // left normal
  const hs: number[] = []; let wetRow = false; let wetC: 0 | 1 | 2 = 0; let depth = 0; let wl = NaN;
  for (const o of OFF) {
    const g = ground(p.x + nx * o, p.z + nz * o);
    hs.push(g.h);
    const wet = !Number.isNaN(g.w) && g.h < g.w - 0.05;
    if (wet) wetRow = true;
    if (o === 0 && wet) { wetC = isSea(p.x, p.z, g.h) ? 2 : 1; depth = g.w - g.h; wl = g.w; }
  }
  H.push(hs);
  let cross = 0; // steepest 10 m step across the ROW, as a percentage
  for (let k = 1; k < hs.length; k++) cross = Math.max(cross, (Math.abs(hs[k] - hs[k - 1]) / 10) * 100);
  const z0 = getWorldZoneAt(p.x, p.z);
  // the inner side = the side that is nearer to the map centre
  const dA = Math.hypot(p.x + nx * 100, p.z + nz * 100), dB = Math.hypot(p.x - nx * 100, p.z - nz * 100);
  rows.push({ s: p.s, x: p.x, z: p.z, hc: hs[4], hmin: Math.min(...hs), hmax: Math.max(...hs), cross, grade: 0, wetC, wetRow, depth, wl, zone: z0.id, kind: z0.kind, inner: dA < dB ? 'A' : 'B' });
}
// grade along the ring over 100 m (+-50 m), percent, closed loop
const K = Math.round(50 / ds);
for (let i = 0; i < N; i++) rows[i].grade = ((rows[(i + K) % N].hc - rows[(i - K + N) % N].hc) / (2 * K * ds)) * 100;

// ---- helpers: group consecutive stations with the same label into ranges
interface Range { a: number; b: number; len: number; label: string; max?: number; at?: number }
const ranges = (label: (r: Row) => string | null, val?: (r: Row) => number): Range[] => {
  const res: Range[] = [];
  let cur: Range | null = null;
  for (let i = 0; i < N; i++) {
    const l = label(rows[i]);
    if (l === null) { cur = null; continue; }
    const v = val ? val(rows[i]) : 0;
    if (cur && cur.label === l && rows[i].s - cur.b <= ds * 1.5) { cur.b = rows[i].s; if (val && v > (cur.max ?? -Infinity)) { cur.max = v; cur.at = rows[i].s; } }
    else { cur = { a: rows[i].s, b: rows[i].s, len: 0, label: l, max: val ? v : undefined, at: rows[i].s }; res.push(cur); }
  }
  for (const r of res) r.len = r.b - r.a + ds;
  return res;
};
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1);
const pr = (title: string, rs: Range[], extra?: (r: Range) => string) => {
  console.log(`\n${title}`);
  if (!rs.length) { console.log('  none'); return; }
  for (const r of rs) console.log(`  station ${f0(r.a).padStart(6)} - ${f0(r.b).padStart(6)}   ${f0(r.len).padStart(5)} m   ${r.label}${extra ? '  ' + extra(r) : ''}`);
};

console.log(`RING GROUND CHECK (Step 2.5)   ring length ${f1(al.length)} m, ${N} stations every ${f1(ds)} m, ROW +-${ROW} m, ground = natural terrain (no roads, no rail earthworks)`);

// ---- 1. WATER on the centreline and in the ROW
const cWet = ranges((r) => (r.wetC ? (r.wetC === 2 ? 'SEA' : 'river / lake') : null), (r) => r.depth);
pr('1. WATER ON THE CENTRELINE (a bridge or a new alignment is needed)', cWet, (r) => `max depth ${f1(r.max ?? 0)} m at ${f0(r.at ?? 0)}`);
const rWet = ranges((r) => (!r.wetC && r.wetRow ? 'water inside the ROW only' : null));
pr('   Water inside the ROW but not on the centreline (edge of a lake / river bank)', rWet);

// ---- 2. RIVERS crossing the centreline (also small streams that are not deep at the sample point)
interface RivX { s: number; x: number; z: number; width: number; ws: number; angle: number }
const rivX: RivX[] = [];
for (const sg of gen.rivers.segments) {
  for (let i = 0; i < N; i++) {
    const a = samples[i], b = samples[(i + 1) % N];
    const d1x = b.x - a.x, d1z = b.z - a.z, d2x = sg.bx - sg.ax, d2z = sg.bz - sg.az;
    const den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((sg.ax - a.x) * d2z - (sg.az - a.z) * d2x) / den;
    const u = ((sg.ax - a.x) * d1z - (sg.az - a.z) * d1x) / den;
    if (t < 0 || t >= 1 || u < 0 || u > 1) continue;
    const hw = sg.hwA + (sg.hwB - sg.hwA) * u, ws = sg.wsA + (sg.wsB - sg.wsA) * u;
    const ang = Math.abs(((Math.atan2(d1z, d1x) - Math.atan2(d2z, d2x)) * 180) / Math.PI) % 180;
    rivX.push({ s: a.s + t * ds, x: a.x + d1x * t, z: a.z + d1z * t, width: hw * 2, ws, angle: Math.min(ang, 180 - ang) });
  }
}
rivX.sort((p, q) => p.s - q.s);
console.log('\n2. RIVER SEGMENTS CROSSING THE CENTRELINE');
if (!rivX.length) console.log('  none');
for (const r of rivX) console.log(`  station ${f0(r.s).padStart(6)}   x ${f0(r.x).padStart(6)} z ${f0(r.z).padStart(6)}   channel width ${f1(r.width)} m   water level ${f1(r.ws)} m   crossing angle ${f0(r.angle)} deg`);

// ---- 3. STEEP GROUND (terrain class of 3.10, cross slope over the ROW) and GRADE along the ring
const cls = (c: number) => (c < 10 ? 'flat' : c < 25 ? 'rolling' : c < 60 ? 'HILLY' : 'STEEP');
const tally: Record<string, number> = { flat: 0, rolling: 0, HILLY: 0, STEEP: 0 };
for (const r of rows) tally[cls(r.cross)] += ds;
console.log('\n3. TERRAIN CLASS (steepest 10 m step across the ROW)   [flat < 10 %, rolling 10-25, hilly 25-60, steep > 60]');
for (const k of Object.keys(tally)) console.log(`  ${k.padEnd(8)} ${f0(tally[k]).padStart(6)} m   ${f1((tally[k] / al.length) * 100)} %`);
pr('   Hilly or steep ranges', ranges((r) => (r.cross >= 25 ? cls(r.cross) : null), (r) => r.cross), (r) => `max cross slope ${f0(r.max ?? 0)} % at ${f0(r.at ?? 0)}`);
pr('   Grade along the ring above 4 % (motorway limit, desirable 3 %), 100 m window', ranges((r) => (Math.abs(r.grade) > 4 ? (r.grade > 0 ? 'down-slope of the ground rising' : 'ground falling') : null), (r) => Math.abs(r.grade)), (r) => `max ${f1(r.max ?? 0)} % at ${f0(r.at ?? 0)}`);
const gs = rows.map((r) => Math.abs(r.grade));
console.log(`   Natural ground grade along the ring: mean ${f1(gs.reduce((a, b) => a + b, 0) / N)} %, max ${f1(Math.max(...gs))} %, share above 3 % = ${f1((gs.filter((g) => g > 3).length / N) * 100)} %, above 4 % = ${f1((gs.filter((g) => g > 4).length / N) * 100)} %`);
const hc = rows.map((r) => r.hc);
console.log(`   Ground height on the centreline: min ${f1(Math.min(...hc))} m (station ${f0(rows[hc.indexOf(Math.min(...hc))].s)}), max ${f1(Math.max(...hc))} m (station ${f0(rows[hc.indexOf(Math.max(...hc))].s)})`);

// ---- 4. RAILWAY: crossings and parallel running inside the ROW
interface RailX { s: number; edge: string; angle: number; ground: number; design: number; x: number; z: number }
const railX: RailX[] = [];
for (const e of gen.rail.edges) {
  for (let j = 0; j + 1 < e.xs.length; j++) {
    for (let i = 0; i < N; i++) {
      const a = samples[i], b = samples[(i + 1) % N];
      const d1x = b.x - a.x, d1z = b.z - a.z, d2x = e.xs[j + 1] - e.xs[j], d2z = e.zs[j + 1] - e.zs[j];
      const den = d1x * d2z - d1z * d2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((e.xs[j] - a.x) * d2z - (e.zs[j] - a.z) * d2x) / den;
      const u = ((e.xs[j] - a.x) * d1z - (e.zs[j] - a.z) * d1x) / den;
      if (t < 0 || t >= 1 || u < 0 || u > 1) continue;
      const ang = Math.abs(((Math.atan2(d1z, d1x) - Math.atan2(d2z, d2x)) * 180) / Math.PI) % 180;
      railX.push({ s: a.s + t * ds, edge: e.id, angle: Math.min(ang, 180 - ang), ground: e.ground[j] + (e.ground[j + 1] - e.ground[j]) * u, design: e.design[j] + (e.design[j + 1] - e.design[j]) * u, x: a.x + d1x * t, z: a.z + d1z * t });
    }
  }
}
railX.sort((p, q) => p.s - q.s);
console.log('\n4. RAILWAY CROSSING THE RING (the railway of this game is planned on its own; X5 says road and rail never cross at grade)');
if (!railX.length) console.log('  none');
for (const r of railX) console.log(`  station ${f0(r.s).padStart(6)}   line ${r.edge.padEnd(15)} x ${f0(r.x).padStart(6)} z ${f0(r.z).padStart(6)}   angle ${f0(r.angle)} deg   rail ballast top ${f1(r.design)} m, ground ${f1(r.ground)} m  (${r.design - r.ground > 3 ? 'rail on viaduct/embankment' : r.design - r.ground < -3 ? 'rail in cut/tunnel' : 'rail near ground'})`);
// parallel / close running: ring sample within 60 m of any rail point
const near = new Array<number>(N).fill(Infinity);
const nearId = new Array<string>(N).fill('');
for (const e of gen.rail.edges) for (let j = 0; j < e.xs.length; j++) for (let i = 0; i < N; i++) {
  const d = Math.hypot(samples[i].x - e.xs[j], samples[i].z - e.zs[j]);
  if (d < near[i]) { near[i] = d; nearId[i] = e.id; }
}
const railClose = ranges((r) => { const i = Math.round(r.s / ds) % N; return near[i] < 60 ? nearId[i] : null; }, (r) => 60 - near[Math.round(r.s / ds) % N]);
pr('   Rail line closer than 60 m to the ring centreline (inside or touching the ROW)', railClose, (r) => `closest ${f0(60 - (r.max ?? 0))} m`);
console.log('   Railway stations within 500 m of the ring:');
let anySt = false;
for (const st of gen.rail.stations) {
  let bd = Infinity, bs = 0;
  for (let i = 0; i < N; i++) { const d = Math.hypot(samples[i].x - st.x, samples[i].z - st.z); if (d < bd) { bd = d; bs = samples[i].s; } }
  if (bd < 500 + st.radius) { anySt = true; console.log(`    ${st.id.padEnd(18)} centre-to-ring ${f0(bd)} m (station radius ${f0(st.radius)} m) at ring station ${f0(bs)}`); }
}
if (!anySt) console.log('    none');

// ---- 5. ZONES, FACILITIES, CITY SITES
const zr = ranges((r) => `${r.zone} (${r.kind})`);
console.log('\n5. WORLD ZONE UNDER THE CENTRELINE (built-up kinds need a buffer of 30-50 m, rule 3.14)');
for (const r of zr) console.log(`  station ${f0(r.a).padStart(6)} - ${f0(r.b).padStart(6)}   ${f0(r.len).padStart(5)} m   ${r.label}${BUILT_UP_KINDS.has(r.label.split('(')[1].replace(')', '') as never) ? '   [built-up]' : ''}`);
// ROW edges in a different zone kind (facility / engineering land)
const edgeHits = new Map<string, number[]>();
for (let i = 0; i < N; i++) {
  const p = samples[i];
  const nx = -Math.sin(p.h), nz = Math.cos(p.h);
  for (const o of [-ROW, ROW]) {
    const z = getWorldZoneAt(p.x + nx * o, p.z + nz * o);
    if (z.kind === 'airport' || z.kind === 'seaport' || z.kind === 'army' || z.kind === 'engineering' || z.kind === 'sea') {
      const k = `${z.id} (${z.kind})`;
      const h = edgeHits.get(k) ?? [];
      if (h[h.length - 1] !== p.s) h.push(p.s);
      edgeHits.set(k, h);
    }
  }
}
console.log('   Facilities / engineering areas / sea touching the ROW edges:');
if (!edgeHits.size) console.log('    none');
for (const [k, h] of edgeHits) {
  const parts: string[] = []; let a = h[0], b = h[0];
  for (let i = 1; i < h.length; i++) { if (h[i] - b > 20) { parts.push(`${f0(a)}-${f0(b)}`); a = h[i]; } b = h[i]; }
  parts.push(`${f0(a)}-${f0(b)}`);
  console.log(`    ${k}  stations ${parts.join(', ')}`);
}
console.log('   Distance from the ring to facility fences:');
for (const f of FACILITIES) {
  let bd = Infinity, bs = 0;
  for (let i = 0; i < N; i++) {
    const dx = Math.max(f.x0 - samples[i].x, 0, samples[i].x - f.x1), dz = Math.max(f.z0 - samples[i].z, 0, samples[i].z - f.z1);
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; bs = samples[i].s; }
  }
  console.log(`    ${f.id.padEnd(12)} ${f0(bd)} m (nearest ring station ${f0(bs)})`);
}
console.log('   City sites (flat ground):');
for (const st of gen.sites) {
  let bd = Infinity, bs = 0;
  for (let i = 0; i < N; i++) { const d = Math.hypot(samples[i].x - st.x, samples[i].z - st.z); if (d < bd) { bd = d; bs = samples[i].s; } }
  console.log(`    site at (${f0(st.x)}, ${f0(st.z)}) core R ${st.coreRadius}, blend R ${st.blendRadius}: ring is ${f0(bd)} m from the centre (${bd < st.coreRadius ? 'INSIDE the flat core' : bd < st.blendRadius ? 'inside the blend skirt' : 'outside'}), nearest station ${f0(bs)}`);
}

// ---- 6. COAST and MAP EDGE
let minCoast = Infinity, minCoastS = 0, minEdge = Infinity, minEdgeS = 0;
for (const p of samples) {
  const c = coastZ(p.x) - p.z; if (c < minCoast) { minCoast = c; minCoastS = p.s; }
  const e = 5000 - Math.max(Math.abs(p.x), Math.abs(p.z)); if (e < minEdge) { minEdge = e; minEdgeS = p.s; }
}
console.log(`\n6. COAST AND MAP EDGE\n  Nearest the coast: ${f0(minCoast)} m north of the shoreline at station ${f0(minCoastS)} (ROW half width ${ROW} m)\n  Nearest the map edge: ${f0(minEdge)} m at station ${f0(minEdgeS)}`);

// ---- 7. RADIAL JOINS (proposal of 2.4) re-checked on the ground
console.log('\n7. THE FOUR RADIAL MEETING POINTS (proposal of 2.4): ground within 300 m each side');
for (const j of RING_RADIAL_JOINS) {
  const i0 = Math.round(j.station / ds);
  let worstCross = 0, wet = false, worstGrade = 0, hmin = Infinity, hmax = -Infinity;
  const span = Math.round(300 / ds);
  for (let k = -span; k <= span; k++) { const r = rows[(i0 + k + N) % N]; worstCross = Math.max(worstCross, r.cross); worstGrade = Math.max(worstGrade, Math.abs(r.grade)); wet = wet || r.wetRow; hmin = Math.min(hmin, r.hmin); hmax = Math.max(hmax, r.hmax); }
  console.log(`  ${j.dir} station ${f0(j.station)}   zone ${rows[i0 % N].zone}   max cross slope ${f0(worstCross)} %   max grade ${f1(worstGrade)} %   water in ROW ${wet ? 'YES' : 'no'}   ground ${f1(hmin)} to ${f1(hmax)} m`);
}

// ---- verdict
const hard: string[] = [];
if (cWet.length) hard.push(`${cWet.length} wet stretch(es) on the centreline (${f0(cWet.reduce((a, r) => a + r.len, 0))} m)`);
if (railX.length) hard.push(`${railX.length} railway crossing(s)`);
const steep = rows.filter((r) => r.cross >= 60).length * ds;
if (steep) hard.push(`${f0(steep)} m of STEEP cross slope`);
console.log('\nHARD STOPS: ' + (hard.length ? hard.join('; ') : 'none'));

writeFileSync(`${out}/ring_ground.json`, JSON.stringify({
  length: al.length, ds, row: ROW,
  pts: rows.map((r) => [Math.round(r.s), +r.x.toFixed(1), +r.z.toFixed(1), +r.hc.toFixed(2), +r.cross.toFixed(1), +r.grade.toFixed(2), r.wetC, r.wetRow ? 1 : 0, r.kind]),
  rivX, railX, rail: gen.rail.edges.map((e) => ({ id: e.id, xs: Array.from(e.xs).filter((_, i) => i % 3 === 0), zs: Array.from(e.zs).filter((_, i) => i % 3 === 0) })),
  stations: gen.rail.stations.map((s) => ({ id: s.id, x: s.x, z: s.z, r: s.radius })),
  rivers: gen.rivers.segments.map((s) => [s.ax, s.az, s.bx, s.bz]),
  joins: RING_RADIAL_JOINS,
}));
console.log(`\nwritten ${out}/ring_ground.json`);
