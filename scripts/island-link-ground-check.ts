// STEP 17.1a (headless): GROUND CHECK of the corridor for the island link (M6-1), from the ring S node to the island. Only reads the world, changes nothing.
// Candidates = straight lines from the S node (end of the J1-S arm on the ring) to the island centre shifted sideways by DX metres.
// For every 10 m of every candidate it samples the natural ground (rivers / sea / island included, no roads) over the whole M6 right of way
// and reports: wet length and depth, island ground, steepest cross slope, rail distance, facility / engineering land at the ROW edge, world zones, bend from the arm.
// Run: npx tsx scripts/island-link-ground-check.ts <out-dir>      writes island_link_ground.json (for the picture) and prints the tables.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
import { getWorldZoneAt, coastZ } from '../src/city/WorldZones';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const ROW = SECTION_M6.rowHalf; // 36.35 m, one side
const STEP = 10;
const OFF = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * ROW);
const I = Config.terrain.island;
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number) => { gen.sampleGround(x, z, sc); return { h: sc.h, w: sc.water }; };
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1);

// ---- start = the T of the J1-S arm on the ring; the arm arrival direction = last 10 m of its centreline
const arm = J1_ARM_DATA.find((a) => a.name === 'J1-S')!;
const pe = arm.pts[arm.pts.length - 1], pp = arm.pts[arm.pts.length - 2];
const A = { x: pe[0], z: pe[1] };
const armHead = Math.atan2(pe[1] - pp[1], pe[0] - pp[0]); // game heading, atan2(dz, dx)
const sJoin = RING_RADIAL_JOINS.find((j) => j.dir === 'S')!;
console.log(`ISLAND LINK GROUND CHECK (Step 17.1a)   M6 ROW +-${f1(ROW)} m, samples every ${STEP} m, ground = natural terrain (no roads, no rail earthworks)`);
console.log(`start = S node (end of J1-S arm) (${f1(A.x)}, ${f1(A.z)}); arm arrival heading ${f1((armHead * 180) / Math.PI)} deg (atan2 dz,dx); island centre (${I.x}, ${I.z}) radius ${I.radius}`);

// ---- rail points
const railPts: { id: string; x: number; z: number }[] = [];
for (const e of gen.rail.edges) for (let j = 0; j < e.xs.length; j++) railPts.push({ id: e.id, x: e.xs[j], z: e.zs[j] });

const DXS = [-400, -200, 0, 200, 400];
interface Cand {
  dx: number; tx: number; tz: number; length: number; bend: number;
  wetRuns: { a: number; b: number; deepest: number }[]; wetLen: number; deepest: number;
  rowWetLen: number; islandMax: number; islandStart: number; crossMax: number; crossHigh: number;
  railMin: number; railId: string; edgeHits: string[]; zones: { a: number; b: number; label: string }[]; rows: number[][];
}
const cands: Cand[] = [];
for (const dx of DXS) {
  const tx = I.x + dx, tz = I.z;
  const L = Math.hypot(tx - A.x, tz - A.z);
  const hd = Math.atan2(tz - A.z, tx - A.x);
  let bend = ((hd - armHead) * 180) / Math.PI;
  while (bend > 180) bend -= 360; while (bend < -180) bend += 360;
  const ux = (tx - A.x) / L, uz = (tz - A.z) / L, nx = -uz, nz = ux;
  const rows: number[][] = [];
  const wetRuns: Cand['wetRuns'] = [];
  let cur: { a: number; b: number; deepest: number } | null = null;
  let rowWet = 0, islandMax = -99, islandStart = -1, crossMax = 0, crossHigh = 0, railMin = Infinity, railId = '';
  const edge = new Set<string>();
  const zones: Cand['zones'] = [];
  for (let s = 0; s <= L + 1e-6; s += STEP) {
    const x = A.x + ux * s, z = A.z + uz * s;
    const hs: number[] = []; let rw = false;
    for (const o of OFF) { const g = ground(x + nx * o, z + nz * o); hs.push(g.h); if (g.h < 0 || (!Number.isNaN(g.w) && g.h < g.w - 0.05)) rw = true; }
    const hc = hs[4]; const gc = ground(x, z);
    const wet = hc < 0 || (!Number.isNaN(gc.w) && hc < gc.w - 0.05);
    if (wet) { if (!cur) cur = { a: s, b: s, deepest: 0 }; cur.b = s; cur.deepest = Math.max(cur.deepest, (Number.isNaN(gc.w) ? 0 : gc.w) - hc); }
    else if (cur) { wetRuns.push(cur); cur = null; }
    if (rw) rowWet += STEP;
    let cs = 0; for (let k = 1; k < hs.length; k++) cs = Math.max(cs, (Math.abs(hs[k] - hs[k - 1]) / (OFF[k] - OFF[k - 1])) * 100);
    crossMax = Math.max(crossMax, cs); if (cs > 25) crossHigh += STEP;
    const onIsland = Math.hypot(x - I.x, z - I.z) < I.radius * 1.1 && hc > 0.6;
    if (onIsland) { if (islandStart < 0) islandStart = s; islandMax = Math.max(islandMax, hc); }
    for (const o of [-ROW, ROW]) { const zh = getWorldZoneAt(x + nx * o, z + nz * o); if (zh.kind === 'airport' || zh.kind === 'seaport' || zh.kind === 'army' || zh.kind === 'engineering') edge.add(`${zh.id} (${zh.kind})`); }
    for (const r of railPts) { const d = Math.hypot(r.x - x, r.z - z); if (d < railMin) { railMin = d; railId = r.id; } }
    const zc = getWorldZoneAt(x, z); const lab = `${zc.id} (${zc.kind})`;
    if (!zones.length || zones[zones.length - 1].label !== lab) zones.push({ a: s, b: s, label: lab }); else zones[zones.length - 1].b = s;
    rows.push([s, x, z, hc, wet ? 1 : 0, cs]);
  }
  if (cur) wetRuns.push(cur);
  cands.push({ dx, tx, tz, length: L, bend, wetRuns, wetLen: wetRuns.reduce((q, r) => q + (r.b - r.a + STEP), 0), deepest: Math.max(0, ...wetRuns.map((r) => r.deepest)), rowWetLen: rowWet, islandMax, islandStart, crossMax, crossHigh, railMin, railId, edgeHits: [...edge], zones, rows });
}

console.log('\n1. CANDIDATES (straight lines from the S node to the island centre shifted by DX along x)');
console.log('   DX     length   bend from arm   wet on centreline (runs)         deepest   wet anywhere in ROW   island start   island max   steepest cross slope (>25 %)   rail min');
for (const c of cands) console.log(`  ${String(c.dx).padStart(5)}  ${f0(c.length).padStart(6)} m  ${f1(c.bend).padStart(7)} deg   ${f0(c.wetLen).padStart(4)} m (${c.wetRuns.length} run${c.wetRuns.length === 1 ? '' : 's'}: ${c.wetRuns.map((r) => f0(r.a) + '-' + f0(r.b)).join(', ')})`.padEnd(88) + `${f1(c.deepest).padStart(5)} m   ${f0(c.rowWetLen).padStart(6)} m             ${f0(c.islandStart).padStart(6)} m     ${f1(c.islandMax).padStart(5)} m   ${f0(c.crossMax).padStart(4)} % (${f0(c.crossHigh)} m)         ${f0(c.railMin)} m (${c.railId})`);

console.log('\n2. WORLD ZONES UNDER THE CENTRELINE, DX = 0');
const c0 = cands.find((c) => c.dx === 0)!;
for (const z of c0.zones) console.log(`   s ${f0(z.a).padStart(5)} - ${f0(z.b).padStart(5)}   ${z.label}`);
console.log('   Facility / engineering land touching the ROW edge, per candidate:');
for (const c of cands) console.log(`   DX ${String(c.dx).padStart(5)}: ${c.edgeHits.length ? c.edgeHits.join(', ') : 'none'}`);
console.log(`   Shore on the S coast line: coastZ(x ${f0(A.x)}) = ${f0(coastZ(A.x))} m, S node z ${f0(A.z)} m`);

// ---- recommended: the road must reach the island CENTRE (user: 'mid porjonto'), so: among candidates with |bend| <= 20 deg (the J1 arm rule) and NO steep ground (cross slope > 25 %) in the ROW,
// take the one that ends nearest the centre (smallest |DX|), then the smallest bend. The others stay in the table as alternatives (a node 200 m off the centre would have a 0 deg bend).
const ok = cands.filter((c) => Math.abs(c.bend) <= 20 && c.crossHigh === 0);
const best = [...ok].sort((p, q) => Math.abs(p.dx) - Math.abs(q.dx) || Math.abs(p.bend) - Math.abs(q.bend))[0];
console.log(`\n3. RECOMMENDED CANDIDATE (ends at the island centre, bend <= 20 deg, no cross slope > 25 %): DX ${best.dx}, length ${f0(best.length)} m, bend ${f1(best.bend)} deg, wet ${f0(best.wetLen)} m, deepest ${f1(best.deepest)} m, island ground max ${f1(best.islandMax)} m, steepest cross slope ${f0(best.crossMax)} %`);

// ---- checks
let pass = 0, fail = 0;
const chk = (name: string, ok2: boolean, info: string) => { if (ok2) pass++; else fail++; console.log(`  ${ok2 ? 'PASS' : 'FAIL'}  ${name}   ${info}`); };
console.log('\n4. CHECKS (data only; these say the corridor is usable, not that a road is designed)');
chk('start is the end of the J1-S arm, on the ring S join', Math.hypot(A.x - sJoin.x, A.z - sJoin.z) < 5, `distance to RING_RADIAL_JOINS S ${f1(Math.hypot(A.x - sJoin.x, A.z - sJoin.z))} m`);
chk('the strait is ONE crossing (one wet run) on the recommended line', best.wetRuns.length === 1, `${best.wetRuns.length} run(s)`);
chk('deepest water on the recommended line <= 15 m (normal bridge, no deep-water foundations)', best.deepest <= 15, `${f1(best.deepest)} m`);
chk('bend from the arm <= 20 deg (rule used for the J1 arms)', Math.abs(best.bend) <= 20, `${f1(best.bend)} deg`);
chk('no rail within ROW + 50 m of the recommended line', best.railMin >= ROW + 50, `closest rail point ${f0(best.railMin)} m (${best.railId})`);
chk('no airport / seaport / army / engineering land at the ROW edge of the recommended line', best.edgeHits.length === 0, best.edgeHits.join(', ') || 'none');
chk('no steep ground (cross slope > 25 %) inside the ROW of the recommended line', best.crossHigh === 0, `steepest ${f0(best.crossMax)} %, steep length ${f0(best.crossHigh)} m`);
chk('island ground on the recommended centreline <= 40 m (cut <= 12 m is then possible with a ridge of 28 m)', best.islandMax <= 40, `${f1(best.islandMax)} m`);
console.log(`\n  ${pass} PASS, ${fail} FAIL`);

// ---- ground grid for the picture (40 m)
const G = { x0: -2400, x1: -300, z0: 2100, z1: 4900, st: 40 };
const gx = Math.round((G.x1 - G.x0) / G.st) + 1, gz = Math.round((G.z1 - G.z0) / G.st) + 1;
const grid: number[] = [];
for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) grid.push(Math.round(ground(G.x0 + i * G.st, G.z0 + j * G.st).h * 10) / 10);
writeFileSync(`${out}/island_link_ground.json`, JSON.stringify({ rowHalf: ROW, A, armHead, island: { x: I.x, z: I.z, r: I.radius }, grid: { ...G, gx, gz, h: grid }, best: best.dx, cands: cands.map((c) => ({ dx: c.dx, tx: c.tx, tz: c.tz, length: c.length, bend: c.bend, wetLen: c.wetLen, deepest: c.deepest, rows: c.rows.filter((_, i) => i % 5 === 0) })) }));
console.log(`\nwrote ${out}/island_link_ground.json`);
